use std::collections::BTreeSet;

use super::*;

const FREIGHT_CAPACITY: (f64, f64) = (5000.0, 12.0);

#[derive(Deserialize, Serialize)]
pub(super) struct LogisticsPolicy {
    pub minimum_fill: u8,
    pub wait_half_hours: u8,
    pub urgent: bool,
    waiting_since: Option<f64>,
}

impl Default for LogisticsPolicy {
    fn default() -> Self {
        Self {
            minimum_fill: 0,
            wait_half_hours: 4,
            urgent: false,
            waiting_since: None,
        }
    }
}

impl LogisticsPolicy {
    pub(super) fn valid(&self) -> bool {
        self.minimum_fill <= 100
            && self.wait_half_hours <= 48
            && self
                .waiting_since
                .is_none_or(|time| time.is_finite() && time >= 0.0)
    }

    fn ready(&self, clock: f64, (mass, volume): (f64, f64), limits: (f64, f64)) -> bool {
        self.urgent
            || (mass / limits.0).max(volume / limits.1) * 100.0 >= f64::from(self.minimum_fill)
            || self.waiting_since.is_some_and(|start| {
                clock - start >= f64::from(self.wait_half_hours) * crate::weather::HOUR * 0.5
            })
    }
}

#[derive(Deserialize, Serialize)]
pub(super) struct ConstructionDelivery {
    site: usize,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    additional_sites: Vec<usize>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    cargo: BTreeMap<usize, BTreeMap<String, u32>>,
    eta: f64,
}

impl ConstructionDelivery {
    fn sites(&self) -> impl Iterator<Item = usize> + '_ {
        std::iter::once(self.site).chain(self.additional_sites.iter().copied())
    }
}

impl Construction {
    fn pending_dispatch_cargo(&self, catalog: &Catalog) -> Option<(f64, f64)> {
        let mut goods = BTreeMap::<String, u32>::new();
        for (site, plan) in self.plans.iter().enumerate() {
            if !plan.removed
                && plan.pickups > 0
                && !self.construction_delivery_at(site)
                && !self.active_trips().any(|trip| {
                    !trip.market_order && trip.farm_bed.is_none() && trip.project == site
                })
                && let Some(order) = &plan.purchase
            {
                for (id, &quantity) in &order.units {
                    let amount = goods.entry(id.clone()).or_default();
                    *amount = amount.saturating_add(quantity);
                }
            }
        }
        for (index, order) in self.trade.orders.iter().enumerate() {
            if !order.buying
                && !order.settled
                && order.quantity > 0
                && !self
                    .active_trips()
                    .any(|trip| trip.market_order && trip.project == index)
            {
                let amount = goods.entry(order.material.clone()).or_default();
                *amount = amount.saturating_add(order.quantity);
            }
        }
        (!goods.is_empty()).then(|| {
            Self::construction_order_cargo(catalog, &goods).expect("pending goods exist in catalog")
        })
    }

    pub(super) fn tick_trip(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        site: ConstructionSite,
        clock: TownClock,
        dt: f32,
    ) {
        for slot in 0..2 {
            if let Some(mut trip) = if slot == 0 {
                self.trip
            } else {
                self.second_trip
            } {
                let finished = self.advance_trip(catalog, stock, clock, &mut trip, dt);
                self.set_trip(slot, (!finished).then_some(trip));
            }
        }

        let cargo = self.pending_dispatch_cargo(catalog);
        if cargo.is_some() {
            self.logistics_policy
                .waiting_since
                .get_or_insert(clock.seconds);
        } else {
            self.logistics_policy.waiting_since = None;
            self.logistics_policy.urgent = false;
        }
        let freight_unaffordable = self.tick_construction_delivery(catalog, stock, clock);
        if !crate::market::town_is_open(clock.seconds) {
            return;
        }
        let available: Vec<_> = self
            .upkeep
            .trip_vehicles()
            .filter(|&vehicle| !self.active_trips().any(|trip| trip.vehicle == vehicle))
            .collect();
        for vehicle in available {
            let Some(trip) =
                self.dispatch_trip(catalog, site, clock, vehicle, freight_unaffordable)
            else {
                continue;
            };
            let slot = usize::from(self.trip.is_some());
            self.set_trip(slot, Some(trip));
            self.upkeep.dispatch_vehicle(vehicle);
        }
    }

    pub fn supplier_construction(&self) -> bool {
        self.supplier_construction
    }

    pub fn toggle_supplier_construction(&mut self) {
        self.supplier_construction = !self.supplier_construction;
    }

    pub(super) fn construction_delivery_at(&self, site: usize) -> bool {
        self.construction_delivery
            .as_ref()
            .is_some_and(|order| order.sites().any(|id| id == site))
    }

    pub fn construction_freight_status(&self, clock: f64) -> Option<String> {
        let delivery = self.construction_delivery.as_ref()?;
        let hours = (delivery.eta - clock).max(0.0) / crate::weather::HOUR;
        let projects = delivery.sites().count();
        Some(format!(
            "Construction freight · {projects} project(s) · {hours:.1}h remaining"
        ))
    }

    pub(super) fn construction_freight_cargo(&self, site: usize) -> Option<&BTreeMap<String, u32>> {
        let delivery = self.construction_delivery.as_ref()?;
        if delivery.cargo.is_empty() && delivery.sites().any(|id| id == site) {
            return Some(&self.plans.get(site)?.purchase.as_ref()?.units);
        }
        delivery.cargo.get(&site)
    }

    pub(super) fn valid_construction_delivery(&self, catalog: &Catalog) -> bool {
        self.construction_delivery.as_ref().is_none_or(|order| {
            let mut truck = BTreeMap::<String, u32>::new();
            order.eta.is_finite()
                && order.eta >= 0.0
                && self.trade.delivery.is_none()
                && order.sites().collect::<BTreeSet<_>>().len() == 1 + order.additional_sites.len()
                && (order.cargo.is_empty() || order.cargo.len() == 1 + order.additional_sites.len())
                && order.sites().all(|site| {
                    !self.active_trips().any(|trip| {
                        !trip.market_order && trip.farm_bed.is_none() && trip.project == site
                    }) && self.plans.get(site).is_some_and(|plan| {
                        !plan.removed
                            && plan.pickups > 0
                            && plan.purchase.as_ref().is_some_and(|purchase| {
                                if order.cargo.is_empty() {
                                    return plan.fare == 0;
                                }
                                order.cargo.get(&site).is_some_and(|load| {
                                    !load.is_empty()
                                        && Self::pickups_after_load(catalog, plan, load).is_some()
                                        && load.iter().all(|(id, &units)| {
                                            if units == 0
                                                || units
                                                    > purchase.units.get(id).copied().unwrap_or(0)
                                            {
                                                return false;
                                            }
                                            let total = truck.entry(id.clone()).or_default();
                                            *total = total.saturating_add(units);
                                            true
                                        })
                                })
                            })
                    })
                })
                && Self::construction_order_cargo(catalog, &truck)
                    .is_some_and(Self::fits_freight_truck)
        })
    }

    fn pending_construction_cargo(plan: &Blueprint) -> Option<&BTreeMap<String, u32>> {
        let purchase = plan.purchase.as_ref()?;
        (plan.pickups > 0 && purchase.trips == plan.pickups).then_some(&purchase.units)
    }

    pub(super) fn remaining_freight_pickups(&self, catalog: &Catalog, site: usize) -> Option<u32> {
        let load = self.construction_freight_cargo(site)?;
        Self::pickups_after_load(catalog, &self.plans[site], load)
    }

    fn pickups_after_load(
        catalog: &Catalog,
        plan: &Blueprint,
        load: &BTreeMap<String, u32>,
    ) -> Option<u32> {
        let mut pending = Self::pending_construction_cargo(plan)?.clone();
        if pending
            .iter()
            .any(|(id, &quantity)| quantity > 100_000 || !catalog.materials.contains_key(id))
            || load
                .iter()
                .any(|(id, &units)| units > pending.get(id).copied().unwrap_or(0))
        {
            return None;
        }
        crate::market::subtract_cargo(&mut pending, load);
        crate::market::cargo_trips(catalog, pending)
            .ok()
            .filter(|&trips| trips <= plan.pickups)
    }

    pub(super) fn construction_order_cargo(
        catalog: &Catalog,
        units: &std::collections::BTreeMap<String, u32>,
    ) -> Option<(f64, f64)> {
        units
            .iter()
            .try_fold((0.0, 0.0), |(mass, volume), (id, &units)| {
                let item = catalog.materials.get(id)?;
                Some((
                    mass + item.mass * f64::from(units),
                    volume + item.volume * f64::from(units),
                ))
            })
    }

    pub(super) fn fits_construction_freight(catalog: &Catalog, plan: &Blueprint) -> bool {
        Self::pending_construction_cargo(plan).is_some_and(|units| {
            units.keys().all(|id| catalog.materials.contains_key(id))
                && units.iter().any(|(id, &quantity)| {
                    let item = &catalog.materials[id];
                    quantity > 0 && Self::fits_freight_truck((item.mass, item.volume))
                })
        })
    }

    pub(super) fn construction_freight_trips(
        catalog: &Catalog,
        units: BTreeMap<String, u32>,
    ) -> Option<u32> {
        crate::market::cargo_trips_with_capacity(catalog, units, FREIGHT_CAPACITY).ok()
    }

    pub(super) fn fits_freight_truck((mass, volume): (f64, f64)) -> bool {
        mass <= FREIGHT_CAPACITY.0 + 1e-8 && volume <= FREIGHT_CAPACITY.1 + 1e-8
    }

    fn tick_construction_delivery(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        clock: TownClock,
    ) -> bool {
        if let Some(delivery) = &self.construction_delivery {
            if clock.seconds >= delivery.eta {
                let delivery = self.construction_delivery.take().expect("arrived freight");
                for site in delivery.sites() {
                    let plan = &mut self.plans[site];
                    if let Some(load) = delivery.cargo.get(&site) {
                        plan.pickups = Self::pickups_after_load(catalog, plan, load)
                            .expect("valid freight manifest");
                        if plan.pickups > 0 {
                            let purchase =
                                plan.purchase.as_mut().expect("pending construction order");
                            purchase.receive_cargo(catalog, load);
                            purchase.trips = plan.pickups;
                            continue;
                        }
                    }
                    plan.pickups = 0;
                    plan.purchase = None;
                }
                self.record_event(clock.seconds, "Construction supplies delivered.".into());
            }
            return false;
        }
        if !self.supplier_construction
            || self.trade.delivery.is_some()
            || !crate::market::town_is_open(clock.seconds)
            || self.pending_dispatch_cargo(catalog).is_some_and(|cargo| {
                !self
                    .logistics_policy
                    .ready(clock.seconds, cargo, FREIGHT_CAPACITY)
            })
        {
            return false;
        }
        let mut sites = Vec::new();
        let mut reserved = 0;
        let mut capacity = FREIGHT_CAPACITY;
        let mut cargo = BTreeMap::new();
        for (index, plan) in self.plans.iter().enumerate() {
            if plan.removed
                || plan.pickups == 0
                || self.active_trips().any(|trip| {
                    !trip.market_order && trip.farm_bed.is_none() && trip.project == index
                })
            {
                continue;
            }
            let Some(pending) = Self::pending_construction_cargo(plan) else {
                continue;
            };
            let mut proposed_capacity = capacity;
            let load = crate::market::pack_cargo(catalog, pending, &mut proposed_capacity);
            if !load.is_empty()
                && let Some(remaining) = Self::pickups_after_load(catalog, plan, &load)
            {
                capacity = proposed_capacity;
                sites.push(index);
                cargo.insert(index, load);
                reserved += plan.fare * u64::from(plan.pickups - remaining);
            }
        }
        let Some((&site, additional_sites)) = sites.split_first() else {
            return false;
        };
        let freight = crate::market::freight_cents(clock.round_trip_km);
        if stock
            .balance()
            .saturating_sub(self.market.committed_fares().saturating_sub(reserved))
            < freight
        {
            return true;
        }
        self.market.release_fare(reserved);
        stock.debit(freight, crate::stock::CashKind::Freight);
        self.construction_delivery = Some(ConstructionDelivery {
            site,
            additional_sites: additional_sites.to_vec(),
            cargo,
            eta: clock.seconds + 6.0 * crate::weather::HOUR + trip_seconds(clock.round_trip_km),
        });
        self.record_event(
            clock.seconds,
            "Supplier dispatched construction supplies.".into(),
        );
        false
    }

    pub(super) fn booked_trade_orders(&self) -> Vec<usize> {
        self.active_trips()
            .filter(|trip| trip.market_order)
            .map(|trip| trip.project)
            .collect()
    }

    pub(super) fn removed_trade_order(&mut self, index: usize) {
        for trip in [&mut self.trip, &mut self.second_trip]
            .into_iter()
            .flatten()
        {
            if trip.market_order && trip.project > index {
                trip.project -= 1;
            }
        }
    }

    fn set_trip(&mut self, slot: usize, trip: Option<TownTrip>) {
        if slot == 0 {
            self.trip = trip;
        } else {
            self.second_trip = trip;
        }
    }

    pub(super) fn cancel_boarding(&mut self, canceled: TownTrip) {
        let slot = usize::from(
            !self
                .trip
                .is_some_and(|trip| trip.vehicle == canceled.vehicle),
        );
        self.set_trip(slot, None);
        self.residents[canceled.driver].path.clear();
    }

    fn advance_trip(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        clock: TownClock,
        trip: &mut TownTrip,
        dt: f32,
    ) -> bool {
        let driver = &mut self.residents[trip.driver];
        if !trip.boarded {
            driver.move_along_path(dt, false);
            if driver.path.is_empty() {
                let fare = if trip.market_order {
                    self.trade
                        .orders
                        .get(trip.project)
                        .expect("active town order")
                        .fare
                } else if let Some(bed) = trip.farm_bed {
                    self.farming
                        .jobs
                        .iter()
                        .find(|job| job.site == trip.project && job.bed == bed)
                        .expect("booked seed pickup")
                        .fare
                } else {
                    self.plans[trip.project].fare
                };
                self.market.depart(stock, fare);
                trip.boarded = true;
                if !stock.sandbox {
                    self.record_opening_town_trip();
                }
            }
            return false;
        }
        let previous = trip.elapsed;
        trip.elapsed = (trip.elapsed + f64::from(dt)).min(trip.duration);
        if previous < trip.duration && trip.elapsed == trip.duration && !stock.sandbox {
            self.upkeep
                .record_distance(trip.vehicle, clock.round_trip_km);
        }
        if trip.market_order && trip.elapsed >= trip.duration * 0.5 {
            self.trade.settle(trip.project, stock);
        }
        if trip.elapsed < trip.duration {
            return false;
        }
        if trip.market_order {
            let space = self.storage_space(catalog, stock);
            if self.trade.finish_trip(trip.project, stock, space) {
                self.removed_trade_order(trip.project);
                self.record_event(
                    clock.seconds,
                    format!("Vehicle {} returned from a trade trip.", trip.vehicle + 1),
                );
                return true;
            }
            return false;
        }
        if let Some(bed) = trip.farm_bed {
            self.farming
                .jobs
                .iter_mut()
                .find(|job| job.site == trip.project && job.bed == bed)
                .expect("booked seed pickup")
                .pickups -= 1;
        } else {
            let plan = &mut self.plans[trip.project];
            Self::receive_construction_pickup(catalog, plan);
        }
        self.record_event(
            clock.seconds,
            format!("Vehicle {} returned with supplies.", trip.vehicle + 1),
        );
        true
    }

    fn receive_construction_pickup(catalog: &Catalog, plan: &mut Blueprint) {
        plan.pickups -= 1;
        if plan.pickups == 0 {
            plan.purchase = None;
        } else if let Some(order) = &mut plan.purchase
            && order.trips == plan.pickups + 1
        {
            let cargo = crate::market::pickup_cargo(catalog, &order.units);
            order.receive_cargo(catalog, &cargo);
            order.trips = plan.pickups;
        }
    }

    fn dispatch_trip(
        &mut self,
        catalog: &Catalog,
        site: ConstructionSite,
        clock: TownClock,
        vehicle: usize,
        freight_unaffordable: bool,
    ) -> Option<TownTrip> {
        let booked = |project, bed| {
            self.active_trips()
                .any(|trip| !trip.market_order && trip.project == project && trip.farm_bed == bed)
        };
        let ready = self.pending_dispatch_cargo(catalog).is_none_or(|cargo| {
            self.logistics_policy
                .ready(clock.seconds, cargo, crate::market::PICKUP_CAPACITY)
        });
        let construction = self
            .plans
            .iter()
            .enumerate()
            .find(|&(index, plan)| {
                !plan.removed
                    && plan.pickups > 0
                    && (ready || plan.purchase.is_none())
                    && !booked(index, None)
                    && !self.construction_delivery_at(index)
                    && !(self.supplier_construction
                        && !freight_unaffordable
                        && Self::fits_construction_freight(catalog, plan))
            })
            .map(|(index, _)| (index, None));
        let farming = self
            .farming
            .jobs
            .iter()
            .find(|job| job.pickups > 0 && !booked(job.site, Some(job.bed)))
            .map(|job| (job.site, Some(job.bed)));
        let pickup = construction.or(farming);
        let order = self
            .trade
            .orders
            .iter()
            .enumerate()
            .find_map(|(index, order)| {
                ((ready || order.buying)
                    && !self
                        .active_trips()
                        .any(|trip| trip.market_order && trip.project == index))
                .then_some(index)
            });
        let market_order = pickup.is_none();
        let (project, farm_bed) = pickup.or_else(|| order.map(|index| (index, None)))?;
        let door = crate::arrival::car_door(vehicle);
        let (driver, path) = (0..self.residents.len())
            .rev()
            .filter(|&index| self.free_for_leisure(index))
            .find_map(|index| {
                self.resident_route(catalog, site, self.residents[index].position, door)
                    .map(|path| (index, path))
            })?;
        self.residents[driver].path = path;
        self.residents[driver].leisure.visit = None;
        Some(TownTrip {
            project,
            farm_bed,
            market_order,
            driver,
            vehicle,
            elapsed: 0.0,
            duration: trip_seconds(clock.round_trip_km),
            boarded: false,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::setup::WorldSetup;

    #[test]
    fn returned_pickup_keeps_only_the_uncollected_construction_order() {
        let catalog = Catalog::default();
        let mut village = Construction::default();
        let mut plan = village.proposed_site(&catalog, "well", IVec2::new(36, 36));
        let goods = BTreeMap::from([("stone".to_owned(), 200)]);
        let first_load = crate::market::pickup_cargo(&catalog, &goods)["stone"];
        assert!((1..200).contains(&first_load));
        let trips = 200u32.div_ceil(first_load);

        plan.pickups = trips;
        plan.purchase = Some(super::super::lifecycle::Purchase {
            units: goods,
            price: 20_000,
            day: 0,
            trips,
        });
        Construction::receive_construction_pickup(&catalog, &mut plan);
        let pending = plan.purchase.as_ref().unwrap();
        assert_eq!(plan.pickups, trips - 1);
        assert_eq!(pending.trips, plan.pickups);
        assert_eq!(pending.units["stone"], 200 - first_load);
        assert!((1..20_000).contains(&pending.price));

        village.plans.push(plan);
        let restored: Construction =
            serde_json::from_slice(&serde_json::to_vec(&village).unwrap()).unwrap();
        assert_eq!(
            restored.plans[0].purchase.as_ref().unwrap().units["stone"],
            200 - first_load
        );
    }

    #[test]
    fn oversized_construction_orders_arrive_in_multiple_saved_freight_loads() {
        let mut catalog = Catalog::default();
        let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
        stock.credit(1_000_000, crate::stock::CashKind::Construction);
        let mut capacity = FREIGHT_CAPACITY;
        let limit = crate::market::pack_cargo(
            &catalog,
            &BTreeMap::from([("stone".into(), 100_000)]),
            &mut capacity,
        )["stone"];
        let quantity = limit + 1;
        let bill = BTreeMap::from([("stone".into(), quantity)]);
        catalog.projects.get_mut("well").unwrap().materials = bill.clone();
        let mut village = Construction::default();
        let mut plan = village.proposed_site(&catalog, "well", IVec2::new(36, 36));
        let pickups = crate::market::cargo_trips(&catalog, bill.clone()).unwrap();
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        plan.pickups = pickups;
        plan.fare = crate::market::fare_cents(clock.round_trip_km);
        assert!(
            village
                .market
                .hold_fare(&stock, plan.fare * u64::from(pickups))
        );
        plan.purchase = Some(super::super::lifecycle::Purchase {
            units: bill,
            price: 10_000,
            day: 0,
            trips: pickups,
        });
        village.plans.push(plan);
        village.toggle_supplier_construction();

        let balance = stock.balance();
        assert!(!village.tick_construction_delivery(&catalog, &mut stock, clock));
        assert_eq!(
            village.construction_freight_cargo(0).unwrap()["stone"],
            limit
        );
        assert_eq!(village.market.committed_fares(), village.plans[0].fare);
        assert!(village.valid_save(&catalog, &stock));
        village = serde_json::from_slice(&serde_json::to_vec(&village).unwrap()).unwrap();
        let first_eta = village.construction_delivery.as_ref().unwrap().eta;
        let next = TownClock {
            seconds: first_eta,
            ..clock
        };
        village.tick_construction_delivery(&catalog, &mut stock, next);
        assert_eq!(
            village.plans[0].purchase.as_ref().unwrap().units["stone"],
            1
        );
        assert_eq!(village.plans[0].pickups, 1);
        assert!(village.valid_save(&catalog, &stock));

        village.tick_construction_delivery(&catalog, &mut stock, next);
        assert_eq!(village.construction_freight_cargo(0).unwrap()["stone"], 1);
        let final_eta = village.construction_delivery.as_ref().unwrap().eta;
        village.tick_construction_delivery(
            &catalog,
            &mut stock,
            TownClock {
                seconds: final_eta,
                ..clock
            },
        );
        assert_eq!(village.plans[0].pickups, 0);
        assert!(village.plans[0].purchase.is_none());
        assert_eq!(village.market.committed_fares(), 0);
        assert_eq!(
            balance - stock.balance(),
            2 * crate::market::freight_cents(12)
        );
        assert!(village.valid_save(&catalog, &stock));
    }

    #[test]
    fn automatic_freight_waits_for_fill_timeout_or_urgent_override() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let terrain = setup.terrain();
        let land = Land::default();
        let ground = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut village = Construction::default();
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        let mut plan = village.proposed_site(&catalog, "well", IVec2::new(44, 36));
        Construction::reserve_project(&mut village.market, &mut stock, &catalog, &mut plan, clock)
            .unwrap();
        village.plans.push(plan);
        village.toggle_supplier_construction();
        village.logistics_policy.minimum_fill = 100;
        village.tick_trip(&catalog, &mut stock, ground, clock, 0.1);
        assert!(village.construction_delivery.is_none());

        let saved = serde_json::to_vec(&village).unwrap();
        let mut urgent: Construction = serde_json::from_slice(&saved).unwrap();
        let mut urgent_stock = stock.clone();
        urgent.logistics_policy.urgent = true;
        urgent.tick_trip(&catalog, &mut urgent_stock, ground, clock, 0.1);
        assert!(urgent.construction_delivery_at(0));

        let mut full_enough: Construction = serde_json::from_slice(&saved).unwrap();
        let mut filled_stock = stock.clone();
        full_enough.logistics_policy.minimum_fill = 0;
        full_enough.tick_trip(&catalog, &mut filled_stock, ground, clock, 0.1);
        assert!(full_enough.construction_delivery_at(0));

        let mut restored: Construction = serde_json::from_slice(&saved).unwrap();
        let limit = 2.0 * crate::weather::HOUR;
        restored.tick_trip(
            &catalog,
            &mut stock,
            ground,
            TownClock {
                seconds: limit - 0.1,
                ..clock
            },
            0.1,
        );
        assert!(restored.construction_delivery.is_none());
        restored.tick_trip(
            &catalog,
            &mut stock,
            ground,
            TownClock {
                seconds: limit,
                ..clock
            },
            0.1,
        );
        assert!(restored.construction_delivery_at(0));
        assert!(restored.valid_save(&catalog, &stock));
    }

    #[test]
    fn construction_freight_replaces_reserved_pickup_fare_and_survives_a_save() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut village = Construction::default();
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        let mut plan = village.proposed_site(&catalog, "well", IVec2::new(36, 36));
        Construction::reserve_project(&mut village.market, &mut stock, &catalog, &mut plan, clock)
            .unwrap();
        village.plans.push(plan);
        let mut second = village.proposed_site(&catalog, "well", IVec2::new(45, 36));
        Construction::reserve_project(
            &mut village.market,
            &mut stock,
            &catalog,
            &mut second,
            clock,
        )
        .unwrap();
        village.plans.push(second);
        village.toggle_supplier_construction();
        let before = stock.balance();
        village.tick_construction_delivery(&catalog, &mut stock, clock);
        assert!(village.construction_delivery_at(0));
        assert!(village.construction_delivery_at(1));
        assert!(
            village
                .construction_freight_status(0.0)
                .unwrap()
                .contains("2 project(s)")
        );
        let (_, stores) =
            village.inventory_panel(&catalog, &stock, &Land::default(), 0, false, "pipe");
        assert!(stores.contains("in transit"));
        assert_eq!(village.market.committed_fares(), 0);
        assert_eq!(stock.balance(), before - crate::market::freight_cents(12));
        assert!(village.valid_save(&catalog, &stock));
        let mut village: Construction =
            serde_json::from_slice(&serde_json::to_vec(&village).unwrap()).unwrap();
        let eta = village.construction_delivery.as_ref().unwrap().eta;
        village.tick_construction_delivery(
            &catalog,
            &mut stock,
            TownClock {
                seconds: eta,
                ..clock
            },
        );
        assert_eq!(village.plans[0].pickups, 0);
        assert_eq!(village.plans[1].pickups, 0);
        assert!(village.construction_delivery.is_none());
        assert_eq!(stock.balance(), before - crate::market::freight_cents(12));
        assert!(village.valid_save(&catalog, &stock));
    }

    #[test]
    fn construction_uses_reserved_pickup_when_freight_is_unaffordable() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let terrain = setup.terrain();
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        let mut village = Construction::default();
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        let mut plan = village.proposed_site(&catalog, "well", IVec2::new(45, 36));
        Construction::reserve_project(&mut village.market, &mut stock, &catalog, &mut plan, clock)
            .unwrap();
        assert!(Construction::fits_construction_freight(&catalog, &plan));
        village.plans.push(plan);
        village.toggle_supplier_construction();

        let reserved = village.market.committed_fares();
        assert!(reserved < crate::market::freight_cents(12));
        stock.debit(stock.balance() - reserved, crate::stock::CashKind::Food);
        village.tick_trip(&catalog, &mut stock, site, clock, 0.1);

        assert!(village.construction_delivery.is_none());
        let trip = village.trip.expect("reserved pickup should be booked");
        assert_eq!(trip.project, 0);
        assert!(!trip.market_order);
        assert_eq!(village.market.committed_fares(), reserved);
        assert!(village.valid_save(&catalog, &stock));
    }

    #[test]
    fn a_purchase_can_return_before_an_earlier_sale() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let terrain = setup.terrain();
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        let mut village = Construction::default();
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        let before = stock.available("food");
        village
            .trade
            .reserve(
                &catalog,
                &mut stock,
                &mut village.market,
                "wood",
                (0, crate::market::fare_cents(12), 0),
            )
            .unwrap();
        village
            .trade
            .buy(
                &catalog,
                &mut stock,
                &mut village.market,
                "food",
                (0.0, 12, false),
            )
            .unwrap();
        village.tick_trip(&catalog, &mut stock, site, clock, 0.1);
        assert_eq!(village.booked_trade_orders(), [0, 1]);
        for driver in [
            village.trip.unwrap().driver,
            village.second_trip.unwrap().driver,
        ] {
            village.residents[driver].path.clear();
        }
        village.tick_trip(&catalog, &mut stock, site, clock, 0.1);
        let second = village.second_trip.as_mut().unwrap();
        second.elapsed = second.duration - 0.05;
        village.tick_trip(&catalog, &mut stock, site, clock, 0.1);
        assert_eq!(
            stock.available("food"),
            before + catalog.materials["food"].pack
        );
        assert_eq!(village.trade.purchases, 1);
        assert_eq!(village.trade.receipts, 0);
        assert_eq!(village.booked_trade_orders(), [0]);
        assert!(village.valid_save(&catalog, &stock));
        let first = village.trip.as_mut().unwrap();
        first.elapsed = first.duration - 0.05;
        village.tick_trip(&catalog, &mut stock, site, clock, 0.1);
        assert!(village.trade.orders.is_empty());
        assert_eq!(village.trade.receipts, 1);
        assert_eq!(village.market.committed_fares(), 0);
    }

    #[test]
    fn two_pickups_reserve_distinct_drivers_and_resume_after_save() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let terrain = setup.terrain();
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        let mut village = Construction::default();
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        for (key, cell) in [
            ("well", IVec2::new(44, 36)),
            ("workshop", IVec2::new(53, 36)),
        ] {
            village.selection = Some(key.into());
            village.plan(&catalog, &mut stock, site, cell, clock);
        }
        assert_eq!(village.plans.len(), 2, "{}", village.status);
        let starting = village
            .plans
            .iter()
            .map(|plan| plan.pickups)
            .collect::<Vec<_>>();
        assert!(starting.iter().all(|&count| count > 0));
        village.tick_trip(&catalog, &mut stock, site, clock, 0.1);
        let trips = village.active_trips().copied().collect::<Vec<_>>();
        assert_eq!(trips.len(), 2);
        assert_ne!(trips[0].driver, trips[1].driver);
        assert_ne!(trips[0].vehicle, trips[1].vehicle);
        assert_ne!(trips[0].project, trips[1].project);
        for trip in trips {
            village.residents[trip.driver].path.clear();
        }
        village.tick_trip(&catalog, &mut stock, site, clock, 0.1);
        assert_eq!(
            village.active_trips().filter(|trip| trip.boarded).count(),
            2
        );
        assert!(village.valid_save(&catalog, &stock));
        let json = serde_json::to_string(&village).unwrap();
        let mut village: Construction = serde_json::from_str(&json).unwrap();
        assert!(village.valid_save(&catalog, &stock));
        for _ in 0..8_000 {
            village.tick_trip(&catalog, &mut stock, site, clock, 0.1);
            if village.active_trips().next().is_none() {
                break;
            }
        }
        assert!(village.plans.iter().all(|plan| plan.pickups == 0));
        assert_eq!(village.market.committed_fares(), 0);
        assert!(village.valid_save(&catalog, &stock));
    }
}
