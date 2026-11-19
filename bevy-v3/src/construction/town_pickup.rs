use std::collections::BTreeSet;

use super::*;

use crate::economy_reference::FREIGHT_CAPACITY;

pub(super) type PickupManifest = BTreeMap<usize, BTreeMap<String, u32>>;

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
                && self.booked_construction_trip(site).is_none()
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
                && !self.active_trips().any(|trip| trip.covers_order(index))
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
                if !trip.boarded {
                    if !self.pickup_manifests[trip.vehicle].is_empty() {
                        self.fill_construction_pickup(catalog, trip, false);
                    }
                    self.add_trip_exports(catalog, &mut trip);
                }
                let finished = self.advance_trip(catalog, stock, clock, &mut trip, dt);
                if finished {
                    self.pickup_manifests[trip.vehicle].clear();
                }
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
            if !trip.market_order && trip.farm_bed.is_none() {
                self.fill_construction_pickup(catalog, trip, freight_unaffordable);
            }
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
                    self.booked_construction_trip(site).is_none()
                        && self.plans.get(site).is_some_and(|plan| {
                            !plan.removed
                                && plan.pickups > 0
                                && plan.purchase.as_ref().is_some_and(|purchase| {
                                    if order.cargo.is_empty() {
                                        return plan.fare == 0;
                                    }
                                    order.cargo.get(&site).is_some_and(|load| {
                                        !load.is_empty()
                                            && Self::pickups_after_load(catalog, plan, load)
                                                .is_some()
                                            && load.iter().all(|(id, &units)| {
                                                if units == 0
                                                    || units
                                                        > purchase
                                                            .units
                                                            .get(id)
                                                            .copied()
                                                            .unwrap_or(0)
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
            if plan.removed || plan.pickups == 0 || self.booked_construction_trip(index).is_some() {
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

    pub(super) fn booked_construction_trip(&self, site: usize) -> Option<&TownTrip> {
        self.active_trips().find(|trip| {
            !trip.market_order
                && trip.farm_bed.is_none()
                && (trip.project == site
                    || self
                        .pickup_manifests
                        .get(trip.vehicle)
                        .is_some_and(|manifest| manifest.contains_key(&site)))
        })
    }

    pub(super) fn construction_pickup_cargo(&self, site: usize) -> Option<&BTreeMap<String, u32>> {
        let trip = self
            .booked_construction_trip(site)
            .filter(|trip| trip.boarded)?;
        self.pickup_manifests.get(trip.vehicle)?.get(&site)
    }

    pub(super) fn remaining_boarded_pickups(&self, catalog: &Catalog, site: usize) -> Option<u32> {
        let trip = self
            .booked_construction_trip(site)
            .filter(|trip| trip.boarded)?;
        let plan = &self.plans[site];
        if let Some(load) = self.pickup_manifests.get(trip.vehicle)?.get(&site) {
            Self::pickups_after_load(catalog, plan, load)
        } else {
            Some(plan.pickups.saturating_sub(1))
        }
    }

    fn fill_construction_pickup(
        &mut self,
        catalog: &Catalog,
        trip: TownTrip,
        freight_unaffordable: bool,
    ) {
        let first = trip.project;
        if Self::pending_construction_cargo(&self.plans[first]).is_none() {
            return;
        }
        let mut manifest = std::mem::take(&mut self.pickup_manifests[trip.vehicle]);
        let mut capacity = crate::market::PICKUP_CAPACITY;
        for load in manifest.values() {
            let (mass, volume) =
                Self::construction_order_cargo(catalog, load).expect("known cargo");
            capacity.0 -= mass;
            capacity.1 -= volume;
        }
        for index in std::iter::once(first).chain((0..self.plans.len()).filter(|&i| i != first)) {
            let plan = &self.plans[index];
            if manifest.contains_key(&index)
                || !self.can_collect_construction(catalog, index, plan, freight_unaffordable)
            {
                continue;
            }
            let Some(pending) = Self::pending_construction_cargo(plan) else {
                continue;
            };
            let mut proposed = capacity;
            let load = crate::market::pack_cargo(catalog, pending, &mut proposed);
            if !load.is_empty() && Self::pickups_after_load(catalog, plan, &load).is_some() {
                manifest.insert(index, load);
                capacity = proposed;
            }
        }
        if manifest.contains_key(&first) {
            self.pickup_manifests[trip.vehicle] = manifest;
        }
    }

    pub(super) fn valid_pickup_manifests(&self, catalog: &Catalog) -> bool {
        let mut sites = BTreeSet::new();
        self.pickup_manifests
            .iter()
            .enumerate()
            .all(|(vehicle, manifest)| {
                if manifest.is_empty() {
                    return true;
                }
                let Some(trip) = self.active_trips().find(|trip| trip.vehicle == vehicle) else {
                    return false;
                };
                if trip.market_order
                    || trip.farm_bed.is_some()
                    || !manifest.contains_key(&trip.project)
                {
                    return false;
                }
                let mut capacity = crate::market::PICKUP_CAPACITY;
                manifest.iter().all(|(&site, load)| {
                    let Some(plan) = self.plans.get(site) else {
                        return false;
                    };
                    let Some((mass, volume)) = Self::construction_order_cargo(catalog, load) else {
                        return false;
                    };
                    capacity.0 -= mass;
                    capacity.1 -= volume;
                    !plan.removed
                        && !load.is_empty()
                        && load.values().all(|&quantity| quantity > 0)
                        && sites.insert(site)
                        && !self.active_trips().any(|other| {
                            other.vehicle != vehicle
                                && !other.market_order
                                && other.farm_bed.is_none()
                                && other.project == site
                        })
                        && self
                            .booked_construction_trip(site)
                            .is_some_and(|booked| booked.vehicle == vehicle)
                        && !self.construction_delivery_at(site)
                        && Self::pickups_after_load(catalog, plan, load).is_some_and(|remaining| {
                            site != trip.project || remaining < plan.pickups
                        })
                        && capacity.0 >= -1e-8
                        && capacity.1 >= -1e-8
                })
            })
    }

    pub(super) fn booked_trade_orders(&self) -> Vec<usize> {
        self.active_trips()
            .flat_map(|trip| trip.trade_orders())
            .collect()
    }

    pub(super) fn removed_trade_order(&mut self, index: usize) {
        for trip in [&mut self.trip, &mut self.second_trip]
            .into_iter()
            .flatten()
        {
            if index < u32::BITS as usize {
                let lower = (1u32 << index) - 1;
                trip.exports = (trip.exports & lower) | ((trip.exports & !lower) >> 1 & !lower);
            }
            trip.return_purchase = trip.return_purchase.map(|purchase| {
                if purchase > index {
                    purchase - 1
                } else {
                    purchase
                }
            });
            if trip.market_order && trip.project > index {
                trip.project -= 1;
            }
        }
    }

    fn add_trip_exports(&self, catalog: &Catalog, trip: &mut TownTrip) {
        let mut available = crate::market::PICKUP_CAPACITY;
        let load = |order: &crate::trade::Shipment| {
            let item = &catalog.materials[&order.material];
            (
                item.mass * f64::from(order.quantity),
                item.volume * f64::from(order.quantity),
            )
        };
        for order in trip
            .trade_orders()
            .map(|index| &self.trade.orders[index])
            .filter(|order| !order.buying)
        {
            let (mass, volume) = load(order);
            available.0 -= mass;
            available.1 -= volume;
        }
        for (index, order) in self
            .trade
            .orders
            .iter()
            .enumerate()
            .take(u32::BITS as usize)
        {
            if order.buying
                || order.settled
                || order.spoiled
                || trip.covers_order(index)
                || self.active_trips().any(|active| active.covers_order(index))
            {
                continue;
            }
            let (mass, volume) = load(order);
            if mass <= available.0 + 1e-8 && volume <= available.1 + 1e-8 {
                available.0 -= mass;
                available.1 -= volume;
                trip.exports |= 1 << index;
            }
        }
    }

    pub(super) fn valid_trip_trade_cargo(&self, catalog: &Catalog, trip: TownTrip) -> bool {
        if let Some(index) = trip.return_purchase
            && (!trip.market_order
                || index == trip.project
                || trip.extra_orders().any(|extra| extra == index)
                || !self
                    .trade
                    .orders
                    .get(trip.project)
                    .is_some_and(|order| !order.buying)
                || !self.trade.orders.get(index).is_some_and(|order| {
                    order.buying
                        && order.fare == 0
                        && catalog.materials.get(&order.material).is_some_and(|item| {
                            let (mass, volume) = crate::market::PICKUP_CAPACITY;
                            item.mass * f64::from(order.quantity) <= mass + 1e-8
                                && item.volume * f64::from(order.quantity) <= volume + 1e-8
                        })
                }))
        {
            return false;
        }
        if trip.exports == 0 {
            return true;
        }
        let mut available = crate::market::PICKUP_CAPACITY;
        trip.trade_orders()
            .filter(|index| Some(*index) != trip.return_purchase)
            .all(|index| {
                self.trade.orders.get(index).is_some_and(|order| {
                    if trip.market_order && index == trip.project {
                        if trip.extra_orders().any(|extra| extra == index) {
                            return false;
                        }
                        if order.buying {
                            return true;
                        }
                    } else if order.buying {
                        return false;
                    }
                    let Some(item) = catalog.materials.get(&order.material) else {
                        return false;
                    };
                    available.0 -= item.mass * f64::from(order.quantity);
                    available.1 -= item.volume * f64::from(order.quantity);
                    available.0 >= -1e-8 && available.1 >= -1e-8
                })
            })
    }

    pub(super) fn sale_trip_for_return_purchase(&self) -> Option<usize> {
        let orders = &self.trade.orders;
        [&self.trip, &self.second_trip]
            .into_iter()
            .position(|trip| {
                trip.as_ref().is_some_and(|trip| {
                    trip.market_order
                        && trip.return_purchase.is_none()
                        && trip.elapsed < trip.duration * 0.5
                        && orders
                            .get(trip.project)
                            .is_some_and(|order| !order.buying && !order.settled)
                })
            })
    }

    fn set_trip(&mut self, slot: usize, trip: Option<TownTrip>) {
        if slot == 0 {
            self.trip = trip;
        } else {
            self.second_trip = trip;
        }
    }

    pub(super) fn cancel_boarding_pickup(
        &mut self,
        mut trip: TownTrip,
        project: usize,
        stock: &Stock,
    ) {
        let slot = usize::from(!self.trip.is_some_and(|first| first.vehicle == trip.vehicle));
        let manifest = &mut self.pickup_manifests[trip.vehicle];
        manifest.remove(&project);
        if let Some((&next, _)) = manifest.first_key_value() {
            if trip.project == project {
                trip.project = next;
            }
            self.set_trip(slot, Some(trip));
        } else if let Some(sale) = trip.extra_orders().next() {
            let order = &mut self.trade.orders[sale];
            if order.fare == 0 {
                // Canceling the pickup just released this fare.
                let fare = self.plans[project].fare;
                assert!(self.market.hold_fare(stock, fare));
                order.fare = fare;
                order.hold_for_pickup = false;
            }
            trip.project = sale;
            trip.market_order = true;
            trip.exports &= !(1 << sale);
            self.set_trip(slot, Some(trip));
        } else {
            self.set_trip(slot, None);
            self.residents[trip.driver].path.clear();
        }
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
                let shared_fares = trip
                    .extra_orders()
                    .map(|index| self.trade.orders[index].fare)
                    .sum();
                let reserved_pickup_fares: u64 = self.pickup_manifests[trip.vehicle]
                    .iter()
                    .map(|(&site, load)| {
                        let plan = &self.plans[site];
                        let remaining = Self::pickups_after_load(catalog, plan, load)
                            .expect("valid pickup manifest");
                        plan.fare * u64::from(plan.pickups - remaining)
                    })
                    .sum();
                if reserved_pickup_fares > fare {
                    self.market.release_fare(reserved_pickup_fares - fare);
                }
                self.market.release_fare(shared_fares);
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
        if trip.elapsed >= trip.duration * 0.5 {
            for index in trip.trade_orders() {
                self.trade.settle(index, stock);
            }
        }
        if trip.elapsed < trip.duration {
            return false;
        }
        let mut orders: Vec<_> = trip.trade_orders().collect();
        if !orders.is_empty() {
            let space = self.storage_space(catalog, stock);
            let inbound: u64 = orders
                .iter()
                .map(|&index| &self.trade.orders[index])
                .filter(|order| order.buying || order.spoiled)
                .map(|order| u64::from(order.quantity))
                .sum();
            if inbound > space {
                return false;
            }
            orders.sort_unstable_by(|a, b| b.cmp(a));
            for index in orders {
                let order = &self.trade.orders[index];
                if order.buying && order.quantity == 0 {
                    let name = &catalog.materials[&order.material].name;
                    self.record_event(
                        clock.seconds,
                        format!("Town pickup returned with no usable {name}."),
                    );
                }
                self.trade.finish_trip(index, stock, space);
                self.removed_trade_order(index);
            }
        }
        if trip.market_order {
            self.record_event(
                clock.seconds,
                format!("Vehicle {} returned from a trade trip.", trip.vehicle + 1),
            );
            return true;
        }
        if let Some(bed) = trip.farm_bed {
            self.farming
                .jobs
                .iter_mut()
                .find(|job| job.site == trip.project && job.bed == bed)
                .expect("booked seed pickup")
                .pickups -= 1;
        } else if self.pickup_manifests[trip.vehicle].is_empty() {
            let plan = &mut self.plans[trip.project];
            Self::receive_construction_pickup(catalog, plan);
        } else {
            for (&site, load) in &self.pickup_manifests[trip.vehicle] {
                let plan = &mut self.plans[site];
                plan.pickups =
                    Self::pickups_after_load(catalog, plan, load).expect("valid pickup manifest");
                if plan.pickups > 0 {
                    let order = plan
                        .purchase
                        .as_mut()
                        .expect("uncollected construction order");
                    order.receive_cargo(catalog, load);
                    order.trips = plan.pickups;
                } else {
                    plan.purchase = None;
                }
            }
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

    fn can_collect_construction(
        &self,
        catalog: &Catalog,
        index: usize,
        plan: &Blueprint,
        freight_unaffordable: bool,
    ) -> bool {
        !plan.removed
            && plan.pickups > 0
            && self.booked_construction_trip(index).is_none()
            && !self.construction_delivery_at(index)
            && !(self.supplier_construction
                && !freight_unaffordable
                && Self::fits_construction_freight(catalog, plan))
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
                (ready || plan.purchase.is_none())
                    && self.can_collect_construction(catalog, index, plan, freight_unaffordable)
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
                ((order.buying || (ready && !order.hold_for_pickup))
                    && !self.active_trips().any(|trip| trip.covers_order(index)))
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
        let mut trip = TownTrip {
            project,
            farm_bed,
            market_order,
            exports: 0,
            return_purchase: None,
            driver,
            vehicle,
            elapsed: 0.0,
            duration: trip_seconds(clock.round_trip_km),
            boarded: false,
        };
        self.add_trip_exports(catalog, &mut trip);
        Some(trip)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::setup::WorldSetup;

    #[test]
    fn a_held_sale_waits_for_a_shared_trip_without_reserving_fuel() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let terrain = setup.terrain();
        let land = Land::default();
        let site = ConstructionSite {
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
        village
            .reserve_town_sale(&catalog, &mut stock, clock, "wood", true)
            .unwrap();
        assert_eq!(village.market.committed_fares(), 0);
        village.toggle_trade_queue();
        village.toggle_trade_queue_hold(&stock, 0, 12);
        let fare = crate::market::fare_cents(12);
        assert_eq!(village.market.committed_fares(), fare);
        village.toggle_trade_queue_hold(&stock, 0, 12);
        assert_eq!(village.market.committed_fares(), 0);

        village = serde_json::from_slice(&serde_json::to_vec(&village).unwrap()).unwrap();
        assert!(village.valid_save(&catalog, &stock));
        village.tick_trip(&catalog, &mut stock, site, clock, 0.1);
        assert!(village.active_trips().next().is_none());
        village
            .buy_from_town(&catalog, &mut stock, clock, "wood", false)
            .unwrap();
        village.tick_trip(&catalog, &mut stock, site, clock, 0.1);
        let trip = village.trip.unwrap();
        assert_eq!(trip.project, 1);
        assert_eq!(trip.extra_orders().collect::<Vec<_>>(), vec![0]);
        assert_eq!(village.market.committed_fares(), fare);
        assert!(village.valid_save(&catalog, &stock));
    }

    #[test]
    fn purchase_added_to_an_outbound_sale_returns_with_no_additional_fuel() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let terrain = setup.terrain();
        let land = Land::default();
        let site = ConstructionSite {
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
        let initial_wood = stock.available("wood");
        village
            .reserve_town_sale(&catalog, &mut stock, clock, "wood", false)
            .unwrap();
        let sale_cents = village.trade.orders[0].cents;
        village.tick_trip(&catalog, &mut stock, site, clock, 0.1);
        let outgoing = village.trip.unwrap();
        village.residents[outgoing.driver].path.clear();
        village.tick_trip(&catalog, &mut stock, site, clock, 0.1);
        assert!(village.trip.unwrap().boarded);

        let selected = Trade::tradable(&catalog)[village.trade.selected].0;
        let price = (catalog.materials[selected].price * 100.0).round() as u64;
        let freight = crate::market::freight_cents(clock.round_trip_km);
        let quote = village.trade_status(&catalog, &stock, clock);
        assert!(quote.contains(&format!(
            "Pickup total R${:.2} (return trip, no extra fuel) · Freight total R${:.2}",
            price as f64 / 100.0,
            (price + freight) as f64 / 100.0,
        )));

        let after_departure = stock.balance();
        assert!(
            village
                .buy_from_town(&catalog, &mut stock, clock, "wood", false)
                .unwrap()
        );
        assert_eq!(village.trade.orders[1].fare, 0);
        assert_eq!(village.market.committed_fares(), 0);
        let purchase_price = village.trade.orders[1].cents;
        assert_eq!(stock.balance(), after_departure - purchase_price);
        assert!(village.valid_save(&catalog, &stock));

        village = serde_json::from_slice(&serde_json::to_vec(&village).unwrap()).unwrap();
        assert!(village.sale_trip_for_return_purchase().is_none());
        village.tick_trip(
            &catalog,
            &mut stock,
            site,
            clock,
            outgoing.duration as f32 + 1.0,
        );
        assert_eq!(village.active_trips().count(), 0);
        assert_eq!(village.trade.receipts, 1);
        assert_eq!(village.trade.purchases, 1);
        assert_eq!(stock.available("wood"), initial_wood);
        assert_eq!(
            stock.balance(),
            after_departure - purchase_price + sale_cents
        );
        assert!(village.valid_save(&catalog, &stock));
    }

    #[test]
    fn outbound_sales_share_a_pickup_fare_and_survive_a_save() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let terrain = setup.terrain();
        let land = Land::default();
        let site = ConstructionSite {
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
        let fare = crate::market::fare_cents(12);
        let initial_wood = stock.available("wood");
        village
            .buy_from_town(&catalog, &mut stock, clock, "wood", false)
            .unwrap();
        for _ in 0..2 {
            village
                .trade
                .reserve(
                    &catalog,
                    &mut stock,
                    &mut village.market,
                    "wood",
                    (0, fare, 0),
                )
                .unwrap();
        }
        let receipts: u64 = village
            .trade
            .orders
            .iter()
            .filter(|order| !order.buying)
            .map(|order| order.cents)
            .sum();
        assert!(village.finance_summary(&stock, 0).contains(&format!(
            "0 paid · 2 pending (R${:.2} before fuel)",
            receipts as f64 / 100.0
        )));
        let before_departure = stock.balance();
        assert_eq!(village.market.committed_fares(), fare * 3);

        village.tick_trip(&catalog, &mut stock, site, clock, 0.1);
        assert_eq!(village.active_trips().count(), 1);
        let trip = village.trip.unwrap();
        assert_eq!(trip.trade_orders().collect::<Vec<_>>(), vec![0, 1, 2]);
        assert!(village.valid_save(&catalog, &stock));
        village.residents[trip.driver].path.clear();
        village.tick_trip(&catalog, &mut stock, site, clock, 0.1);
        assert_eq!(stock.balance(), before_departure - fare);
        assert_eq!(village.market.committed_fares(), 0);
        assert!(village.valid_save(&catalog, &stock));

        village = serde_json::from_slice(&serde_json::to_vec(&village).unwrap()).unwrap();
        village.tick_trip(
            &catalog,
            &mut stock,
            site,
            clock,
            trip.duration as f32 + 1.0,
        );
        assert!(village.trip.is_none());
        assert!(village.trade.orders.is_empty());
        assert!(
            village
                .finance_summary(&stock, 0)
                .contains("2 paid · 0 pending")
        );
        assert_eq!(village.trade.receipts, 2);
        assert_eq!(village.trade.purchases, 1);
        assert_eq!(stock.available("wood"), initial_wood - 12);
        assert_eq!(stock.balance(), before_departure - fare + receipts);
        assert!(village.valid_save(&catalog, &stock));
    }

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
    fn construction_pickup_shares_one_vehicle_and_fare_across_projects() {
        let mut catalog = Catalog::default();
        catalog.projects.get_mut("well").unwrap().materials =
            BTreeMap::from([("plumbing".into(), 1)]);
        let setup = WorldSetup::default();
        let terrain = setup.terrain();
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        let mut stock = Stock::for_start(&setup, &catalog);
        let local_pipes = stock.available("plumbing");
        stock.reserve_available(&BTreeMap::from([("plumbing".into(), local_pipes)]));
        let mut village = Construction::default();
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        let reserve = |village: &mut Construction, stock: &mut Stock, x| {
            let mut plan = village.proposed_site(&catalog, "well", IVec2::new(x, 36));
            Construction::reserve_project(&mut village.market, stock, &catalog, &mut plan, clock)
                .unwrap();
            assert_eq!(plan.pickups, 1);
            village.plans.push(plan);
        };
        reserve(&mut village, &mut stock, 44);
        village.tick_trip(&catalog, &mut stock, site, clock, 0.1);
        let first_trip = village.trip.unwrap();
        assert!(!first_trip.boarded);
        assert_eq!(village.pickup_manifests[first_trip.vehicle].len(), 1);
        reserve(&mut village, &mut stock, 53);
        let fare = crate::market::fare_cents(12);
        let balance = stock.balance();
        assert_eq!(village.market.committed_fares(), fare * 2);
        village.tick_trip(&catalog, &mut stock, site, clock, 0.1);
        assert_eq!(village.active_trips().count(), 1);
        let trip = village.trip.unwrap();
        assert_eq!(village.pickup_manifests[trip.vehicle].len(), 2);
        assert!(village.valid_save(&catalog, &stock));
        for canceled in 0..2 {
            let remaining = 1 - canceled;
            let mut canceled_village: Construction =
                serde_json::from_slice(&serde_json::to_vec(&village).unwrap()).unwrap();
            let mut canceled_stock = stock.clone();
            canceled_village.request_project_action(
                &catalog,
                &mut canceled_stock,
                canceled,
                ProjectAction::Salvage,
            );
            let retained_trip = canceled_village.trip.unwrap();
            assert_eq!(retained_trip.project, remaining);
            assert_eq!(retained_trip.driver, trip.driver);
            assert!(canceled_village.plans[canceled].removed);
            assert_eq!(canceled_village.pickup_manifests[trip.vehicle].len(), 1);
            assert_eq!(canceled_village.market.committed_fares(), fare);
            assert!(canceled_village.valid_save(&catalog, &canceled_stock));

            canceled_village
                .reserve_town_sale(&catalog, &mut canceled_stock, clock, "wood", true)
                .unwrap();
            canceled_village.tick_trip(&catalog, &mut canceled_stock, site, clock, 0.0);
            let retained_trip = canceled_village.trip.unwrap();
            assert!(!retained_trip.boarded);
            assert_eq!(retained_trip.extra_orders().collect::<Vec<_>>(), vec![0]);
            canceled_village.request_project_action(
                &catalog,
                &mut canceled_stock,
                remaining,
                ProjectAction::Salvage,
            );
            let sale_trip = canceled_village.trip.unwrap();
            assert!(sale_trip.market_order);
            assert_eq!(sale_trip.trade_orders().collect::<Vec<_>>(), vec![0]);
            assert_eq!(canceled_village.market.committed_fares(), fare);
            assert!(canceled_village.valid_save(&catalog, &canceled_stock));
            canceled_village.residents[sale_trip.driver].path.clear();
            canceled_village.tick_trip(&catalog, &mut canceled_stock, site, clock, 0.1);
            canceled_village.tick_trip(
                &catalog,
                &mut canceled_stock,
                site,
                clock,
                sale_trip.duration as f32 + 1.0,
            );
            assert_eq!(canceled_village.trade.receipts, 1);
            assert_eq!(canceled_village.market.committed_fares(), 0);
        }
        village.residents[trip.driver].path.clear();
        village.tick_trip(&catalog, &mut stock, site, clock, 0.1);
        assert!(village.construction_pickup_cargo(1).is_some());
        assert_eq!(village.market.committed_fares(), 0);
        assert_eq!(stock.balance(), balance - fare);
        assert!(village.valid_save(&catalog, &stock));

        village = serde_json::from_slice(&serde_json::to_vec(&village).unwrap()).unwrap();
        village.tick_trip(
            &catalog,
            &mut stock,
            site,
            clock,
            trip.duration as f32 + 1.0,
        );
        assert!(village.active_trips().next().is_none());
        assert!(
            village
                .plans
                .iter()
                .all(|plan| plan.pickups == 0 && plan.purchase.is_none())
        );
        assert_eq!(stock.balance(), balance - fare);
        assert!(village.valid_save(&catalog, &stock));
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
