use std::collections::BTreeSet;

use super::*;

use crate::{
    arrival::{TownDrivePhase, town_drive_phase},
    economy_reference::FREIGHT_CAPACITY,
};

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
    pub(crate) fn valid_dispatch_time(&self, clock: f64) -> bool {
        self.logistics_policy
            .waiting_since
            .is_none_or(|start| start <= clock)
    }

    fn pending_dispatch_cargo(&self, catalog: &Catalog) -> Option<(f64, f64)> {
        let mut goods = BTreeMap::<String, u32>::new();
        for (site, plan) in self.plans.iter().enumerate() {
            if plan.removed {
                continue;
            }
            let pending = self.unshipped_construction_cargo(site, None, false);
            for (id, quantity) in pending.into_iter().flatten() {
                let amount = goods.entry(id).or_default();
                *amount = amount.saturating_add(quantity);
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

    pub(super) fn clear_sale_dispatch_if_empty(&mut self) {
        let has_queued_sale = self.trade.orders.iter().enumerate().any(|(index, order)| {
            !order.buying
                && !order.settled
                && order.quantity > 0
                && !self.active_trips().any(|trip| trip.covers_order(index))
        });
        if !has_queued_sale {
            self.trade.clear_sale_dispatch();
        }
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
                        self.fill_construction_pickup(catalog, &mut trip);
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

        self.clear_sale_dispatch_if_empty();
        let cargo = self.pending_dispatch_cargo(catalog);
        if cargo.is_some() {
            self.logistics_policy
                .waiting_since
                .get_or_insert(clock.seconds);
        } else {
            self.logistics_policy.waiting_since = None;
            self.logistics_policy.urgent = false;
        }
        self.tick_construction_delivery(catalog, stock, clock);
        self.tick_seed_freight(stock, clock);
        if !crate::market::town_is_open(clock.seconds) {
            return;
        }
        let available: Vec<_> = self
            .upkeep
            .trip_vehicles()
            .filter(|&vehicle| !self.active_trips().any(|trip| trip.vehicle == vehicle))
            .collect();
        for vehicle in available {
            let Some(mut trip) = self.dispatch_trip(catalog, site, clock, vehicle) else {
                continue;
            };
            let slot = usize::from(self.trip.is_some());
            if !trip.market_order && trip.farm_bed.is_none() {
                self.fill_construction_pickup(catalog, &mut trip);
            }
            self.set_trip(slot, Some(trip));
            self.upkeep.dispatch_vehicle(vehicle);
        }
        self.clear_sale_dispatch_if_empty();
    }

    pub(super) fn seed_freight_active(&self) -> bool {
        self.farming
            .jobs
            .iter()
            .any(|job| job.seed_freight_eta.is_some())
    }

    pub(super) fn queued_seed_freight(&self, job: &crate::farming::FarmJob) -> bool {
        job.pickups > 0
            && job.seed_freight_eta.is_none()
            && !self.active_trips().any(|trip| {
                !trip.market_order && trip.project == job.site && trip.farm_bed == Some(job.bed)
            })
    }

    fn tick_seed_freight(&mut self, stock: &mut Stock, clock: TownClock) {
        if let Some(job) = self
            .farming
            .jobs
            .iter_mut()
            .find(|job| job.seed_freight_eta.is_some())
        {
            if job.seed_freight_eta.is_some_and(|eta| eta <= clock.seconds) {
                job.seed_freight_eta = None;
                job.pickups -= 1;
                self.record_event(
                    clock.seconds,
                    "Supplier delivered seeds for planting.".into(),
                );
            }
            return;
        }
        if !self.supplier_construction
            || self.construction_delivery.is_some()
            || self.trade.delivery.is_some()
            || !crate::market::town_is_open(clock.seconds)
        {
            return;
        }
        let Some(index) = self
            .farming
            .jobs
            .iter()
            .position(|job| self.queued_seed_freight(job))
        else {
            return;
        };
        let job = &mut self.farming.jobs[index];
        let freight = crate::market::freight_cents(clock.round_trip_km);
        if !self
            .market
            .can_replace_fares_with_freight(stock, job.fare, freight)
        {
            return;
        }
        self.market.release_fare(job.fare);
        stock.debit(freight, crate::stock::CashKind::Freight);
        job.seed_freight_eta =
            Some(clock.seconds + crate::market::freight_seconds(clock.round_trip_km));
        self.record_event(
            clock.seconds,
            "Supplier dispatched seeds for planting.".into(),
        );
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

    pub(super) fn construction_delivery_minutes(&self, site: usize, clock: f64) -> Option<u64> {
        let order = self.construction_delivery.as_ref()?;
        order
            .sites()
            .any(|id| id == site)
            .then(|| crate::weather::remaining_game_minutes(order.eta - clock))
    }

    pub fn reserved_freight_status(&self, clock: f64) -> Option<String> {
        if let Some(job) = self
            .farming
            .jobs
            .iter()
            .find(|job| job.seed_freight_eta.is_some())
        {
            return Some(format!(
                "{} · Site {} · Bed {}",
                super::farm_work::seed_delivery_status(job, clock),
                job.site + 1,
                job.bed + 1
            ));
        }
        let delivery = self.construction_delivery.as_ref()?;
        let minutes = crate::weather::remaining_game_minutes(delivery.eta - clock);
        let projects = delivery.sites().count();
        Some(format!(
            "Construction freight · {projects} project(s) · {minutes} game minutes remaining"
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
                    self.plans.get(site).is_some_and(|plan| {
                        !plan.removed
                            && plan.pickups > 0
                            && plan.purchase.as_ref().is_some_and(|purchase| {
                                if order.cargo.is_empty() {
                                    return plan.fare == 0
                                        && self.booked_construction_trip(site).is_none();
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

    pub(super) fn construction_freight_budget(
        &self,
        catalog: &Catalog,
        extra: BTreeMap<String, u32>,
    ) -> Option<(u32, u64)> {
        let mut orders = Vec::new();
        let mut reserved = 0;
        for index in self.construction_dispatch_order() {
            let plan = &self.plans[index];
            let Some(pending) = self.unshipped_construction_cargo(index, None, false) else {
                continue;
            };
            let trips = crate::market::cargo_trips(catalog, pending.clone()).ok()?;
            reserved += plan.fare * u64::from(trips);
            orders.push(pending);
        }
        orders.push(extra);
        let mut loads = 0;
        while orders.iter().any(|order| !order.is_empty()) {
            let mut capacity = FREIGHT_CAPACITY;
            let mut packed = false;
            for order in &mut orders {
                let load = crate::market::pack_cargo(catalog, order, &mut capacity);
                packed |= !load.is_empty();
                crate::market::subtract_cargo(order, &load);
            }
            if !packed {
                return None;
            }
            loads += 1;
        }
        Some((loads, reserved))
    }

    pub(super) fn fits_freight_truck((mass, volume): (f64, f64)) -> bool {
        mass <= FREIGHT_CAPACITY.0 + 1e-8 && volume <= FREIGHT_CAPACITY.1 + 1e-8
    }

    fn tick_construction_delivery(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        clock: TownClock,
    ) {
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
            return;
        }
        if !self.supplier_construction
            || self.trade.delivery.is_some()
            || self.seed_freight_active()
            || self.pending_dispatch_cargo(catalog).is_some_and(|cargo| {
                !self
                    .logistics_policy
                    .ready(clock.seconds, cargo, FREIGHT_CAPACITY)
            })
        {
            return;
        }
        let mut sites = Vec::new();
        let mut reserved = 0;
        let mut capacity = FREIGHT_CAPACITY;
        let mut cargo = BTreeMap::new();
        for index in self.construction_dispatch_order() {
            let plan = &self.plans[index];
            if plan.removed
                || plan.pickups == 0
                || self.construction_trips(index).any(|trip| !trip.boarded)
            {
                continue;
            }
            let Some(mut pending) = self.unshipped_construction_cargo(index, None, true) else {
                continue;
            };
            let mut proposed_capacity = capacity;
            let load = crate::market::pack_cargo(catalog, &pending, &mut proposed_capacity);
            if load.is_empty() {
                continue;
            }
            let Some(released) = Self::fare_released(catalog, &mut pending, &load, plan.fare)
            else {
                continue;
            };
            capacity = proposed_capacity;
            sites.push(index);
            cargo.insert(index, load);
            reserved += released;
        }
        let Some((&site, additional_sites)) = sites.split_first() else {
            return;
        };
        let freight = crate::market::freight_cents(clock.round_trip_km);
        if !self
            .market
            .can_replace_fares_with_freight(stock, reserved, freight)
        {
            return;
        }
        self.market.release_fare(reserved);
        stock.debit(freight, crate::stock::CashKind::Freight);
        self.construction_delivery = Some(ConstructionDelivery {
            site,
            additional_sites: additional_sites.to_vec(),
            cargo,
            eta: clock.seconds + crate::market::freight_seconds(clock.round_trip_km),
        });
        self.record_event(
            clock.seconds,
            "Supplier dispatched construction supplies.".into(),
        );
    }

    fn construction_trips(&self, site: usize) -> impl Iterator<Item = &TownTrip> {
        self.active_trips().filter(move |trip| {
            !trip.market_order
                && trip.farm_bed.is_none()
                && (trip.project == site
                    || self
                        .pickup_manifests
                        .get(trip.vehicle)
                        .is_some_and(|manifest| manifest.contains_key(&site)))
        })
    }

    pub(super) fn booked_construction_trip(&self, site: usize) -> Option<&TownTrip> {
        self.construction_trips(site)
            .max_by_key(|trip| trip.boarded)
    }

    pub(super) fn construction_transport_status(&self, site: usize) -> Option<String> {
        use std::fmt::Write;
        let mut status = String::new();
        if self.construction_delivery_at(site) {
            status.push_str("Supplier delivery on its way");
        }
        for trip in self.construction_trips(site) {
            if !status.is_empty() {
                status.push_str(" · ");
            }
            let phase = if trip.boarded {
                "collecting materials"
            } else {
                "booked for materials"
            };
            let _ = write!(status, "Vehicle {} {phase}", trip.vehicle + 1);
            if trip.boarded {
                if trip.elapsed >= trip.duration {
                    status.push_str(" · At camp");
                } else {
                    let journey = match town_drive_phase(trip.elapsed, trip.duration) {
                        TownDrivePhase::Outbound => "Driving to town",
                        TownDrivePhase::Away => "In town",
                        TownDrivePhase::Inbound => "Returning",
                    };
                    let minutes =
                        crate::weather::remaining_game_minutes(trip.duration - trip.elapsed);
                    let _ = write!(status, " · {journey} · {minutes} game min to camp");
                }
            } else {
                status.push_str(" · Driver walking to car");
            }
        }
        (!status.is_empty()).then_some(status)
    }

    pub(super) fn construction_pickup_cargo(&self, site: usize) -> Option<BTreeMap<String, u32>> {
        let mut combined = BTreeMap::<String, u32>::new();
        for load in self
            .construction_trips(site)
            .filter(|trip| trip.boarded)
            .filter_map(|trip| self.pickup_manifests.get(trip.vehicle)?.get(&site))
        {
            for (id, &units) in load {
                let quantity = combined.entry(id.clone()).or_default();
                *quantity = quantity.saturating_add(units);
            }
        }
        (!combined.is_empty()).then_some(combined)
    }

    fn unshipped_construction_cargo(
        &self,
        site: usize,
        excluded_vehicle: Option<usize>,
        boarded_only: bool,
    ) -> Option<BTreeMap<String, u32>> {
        let mut units = Self::pending_construction_cargo(&self.plans[site])?.clone();
        // Save validation also reads this balance before it trusts the manifests.
        let mut subtract = |load: &BTreeMap<String, u32>| {
            if load
                .iter()
                .any(|(id, &amount)| amount > units.get(id).copied().unwrap_or(0))
            {
                return None;
            }
            crate::market::subtract_cargo(&mut units, load);
            Some(())
        };
        if let Some(freight) = self.construction_freight_cargo(site) {
            subtract(freight)?;
        }
        for trip in self.construction_trips(site) {
            if Some(trip.vehicle) == excluded_vehicle || (boarded_only && !trip.boarded) {
                continue;
            }
            let load = self.pickup_manifests.get(trip.vehicle)?.get(&site)?;
            subtract(load)?;
        }
        Some(units)
    }

    pub(super) fn remaining_paid_pickups(&self, catalog: &Catalog, site: usize) -> Option<u32> {
        if !self.construction_delivery_at(site)
            && !self.construction_trips(site).any(|trip| trip.boarded)
        {
            return None;
        }
        self.unshipped_construction_cargo(site, None, true)
            .filter(|goods| {
                goods
                    .iter()
                    .all(|(id, &units)| units <= 100_000 && catalog.materials.contains_key(id))
            })
            .and_then(|goods| crate::market::cargo_trips(catalog, goods).ok())
            .or_else(|| Some(self.plans[site].pickups.saturating_sub(1)))
    }

    fn fare_released(
        catalog: &Catalog,
        pending: &mut BTreeMap<String, u32>,
        load: &BTreeMap<String, u32>,
        fare: u64,
    ) -> Option<u64> {
        let before = crate::market::cargo_trips(catalog, pending.clone()).ok()?;
        crate::market::subtract_cargo(pending, load);
        let after = crate::market::cargo_trips(catalog, std::mem::take(pending)).ok()?;
        Some(fare * u64::from(before.saturating_sub(after)))
    }

    fn fill_construction_pickup(&mut self, catalog: &Catalog, trip: &mut TownTrip) {
        if self.supplier_construction
            || Self::pending_construction_cargo(&self.plans[trip.project]).is_none()
        {
            return;
        }
        let mut manifest = BTreeMap::new();
        let mut first = None;
        let mut capacity = crate::market::PICKUP_CAPACITY;
        for index in self.construction_dispatch_order() {
            let plan = &self.plans[index];
            if plan.removed
                || plan.pickups == 0
                || self
                    .construction_trips(index)
                    .any(|other| other.vehicle != trip.vehicle && !other.boarded)
            {
                continue;
            }
            let Some(mut pending) =
                self.unshipped_construction_cargo(index, Some(trip.vehicle), false)
            else {
                continue;
            };
            let mut proposed = capacity;
            let load = crate::market::pack_cargo(catalog, &pending, &mut proposed);
            if load.is_empty() {
                continue;
            }
            if first.is_none() {
                let Ok(before) = crate::market::cargo_trips(catalog, pending.clone()) else {
                    continue;
                };
                crate::market::subtract_cargo(&mut pending, &load);
                if !crate::market::cargo_trips(catalog, pending).is_ok_and(|after| after < before) {
                    continue;
                }
            }
            first.get_or_insert(index);
            manifest.insert(index, load);
            capacity = proposed;
        }
        if let Some(first) = first {
            trip.project = first;
            self.pickup_manifests[trip.vehicle] = manifest;
        }
    }

    pub(super) fn valid_pickup_manifests(&self, catalog: &Catalog) -> bool {
        let mut shipped = BTreeMap::<usize, BTreeMap<String, u32>>::new();
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
                        && self.construction_trips(site).all(|active| {
                            self.pickup_manifests
                                .get(active.vehicle)
                                .is_some_and(|manifest| manifest.contains_key(&site))
                        })
                        && load.iter().all(|(id, &units)| {
                            let quantity = shipped
                                .entry(site)
                                .or_insert_with(|| {
                                    self.construction_freight_cargo(site)
                                        .cloned()
                                        .unwrap_or_default()
                                })
                                .entry(id.clone())
                                .or_default();
                            *quantity = quantity.saturating_add(units);
                            Self::pending_construction_cargo(plan)
                                .and_then(|pending| pending.get(id))
                                .is_some_and(|&pending| *quantity <= pending)
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
                        && !matches!(
                            town_drive_phase(trip.elapsed, trip.duration),
                            TownDrivePhase::Inbound
                        )
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
                        let mut pending = self
                            .unshipped_construction_cargo(site, Some(trip.vehicle), true)
                            .expect("valid pickup manifest");
                        Self::fare_released(catalog, &mut pending, load, plan.fare)
                            .expect("remaining cargo fits resident pickup")
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
        if matches!(
            town_drive_phase(trip.elapsed, trip.duration),
            TownDrivePhase::Inbound
        ) {
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
                let item = &catalog.materials[&order.material];
                if order.buying && order.quantity < item.pack {
                    let lost = item.quantity_text(u64::from(item.pack - order.quantity));
                    self.record_event(
                        clock.seconds,
                        format!("Town pickup lost {lost} of {} to spoilage.", item.name),
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

    fn can_collect_construction(&self, index: usize, plan: &Blueprint) -> bool {
        !plan.removed
            && plan.pickups > 0
            && !self.construction_trips(index).any(|trip| !trip.boarded)
            && self
                .unshipped_construction_cargo(index, None, false)
                .map_or_else(
                    || self.booked_construction_trip(index).is_none(),
                    |units| !units.is_empty(),
                )
            && !self.supplier_construction
    }

    fn construction_dispatch_order(&self) -> impl Iterator<Item = usize> + '_ {
        self.priority
            .filter(|&index| index < self.plans.len())
            .into_iter()
            .chain((0..self.plans.len()).filter(|&index| self.priority != Some(index)))
    }

    fn dispatch_trip(
        &mut self,
        catalog: &Catalog,
        site: ConstructionSite,
        clock: TownClock,
        vehicle: usize,
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
            .construction_dispatch_order()
            .find(|&index| {
                let plan = &self.plans[index];
                (ready || plan.purchase.is_none()) && self.can_collect_construction(index, plan)
            })
            .map(|index| (index, None));
        let farming = self
            .farming
            .jobs
            .iter()
            .find(|job| {
                job.pickups > 0
                    && job.seed_freight_eta.is_none()
                    && !self.supplier_construction
                    && !booked(job.site, Some(job.bed))
            })
            .map(|job| (job.site, Some(job.bed)));
        let pickup = construction.or(farming);
        let order = self
            .trade
            .orders
            .iter()
            .enumerate()
            .find_map(|(index, order)| {
                ((order.buying
                    || (ready
                        && !order.hold_for_pickup
                        && self.trade.sale_dispatch_ready(clock.seconds)))
                    && !self.active_trips().any(|trip| trip.covers_order(index)))
                .then_some(index)
            });
        let market_order = pickup.is_none();
        let (project, farm_bed) = pickup.or_else(|| order.map(|index| (index, None)))?;
        let door = crate::arrival::car_door(vehicle);
        let duration = trip_seconds(clock.round_trip_km);
        let allowance = (5.0 * duration / crate::weather::DAY).max(0.5);
        self.utilities.ensure_camp();
        let buying_food = market_order && {
            let order = &self.trade.orders[project];
            order.buying && matches!(order.material.as_str(), "food" | "meals")
        };
        let mut drivers: Vec<_> = (0..self.residents.len())
            .rev()
            .filter(|&index| {
                let health = &self.residents[index].health;
                let needs_met = if buying_food {
                    [Need::Bladder, Need::Bowels, Need::Hygiene]
                        .iter()
                        .all(|need| health.levels[*need as usize] > 10.0)
                } else {
                    health.levels.iter().all(|level| *level > 25.0)
                };
                health.energy > 35.0
                    && needs_met
                    && self.free_for_leisure(index)
                    && !self.booked_shift_due(index, clock.seconds)
            })
            .collect();
        drivers.sort_by(|&a, &b| {
            self.residents[b]
                .health
                .energy
                .total_cmp(&self.residents[a].health.energy)
        });
        let (driver, path, water) = drivers.into_iter().find_map(|index| {
            let path = self.resident_route(catalog, site, self.residents[index].position, door)?;
            let needed = (allowance - self.residents[index].health.drinking_water).max(0.0);
            let water = if needed > 0.0 {
                let (source, _, _) =
                    self.utilities
                        .water_sources_with(needed)
                        .find(|&(id, _, _)| {
                            id == 0 || self.water_route(index, catalog, site, id).is_some()
                        })?;
                Some((source, needed))
            } else {
                None
            };
            Some((index, path, water))
        })?;
        if let Some((source, needed)) = water {
            assert!(self.utilities.drink(source, needed));
            self.residents[driver].health.drinking_water += needed;
        }
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
            duration,
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
    fn seed_freight_replaces_the_pickup_fare_and_waits_for_arrival() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut village = Construction::default();
        let mut clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        let fare = crate::market::fare_cents(clock.round_trip_km);
        let freight = crate::market::freight_cents(clock.round_trip_km);
        let balance = stock.balance();
        assert!(village.market.hold_fare(&stock, fare));
        village.farming.jobs.push(crate::farming::FarmJob {
            site: 0,
            bed: 0,
            action: crate::farming::FarmAction::Plant,
            worker: None,
            phase: crate::farming::FarmPhase::Pickup,
            work: 0.0,
            required: 10.0,
            inputs: BTreeMap::from([("greens_seed".into(), 2)]),
            output: BTreeMap::new(),
            food_output: None,
            retry: 0.0,
            waiting_for_access: false,
            pickups: 1,
            fare,
            seed_freight_eta: None,
        });
        village.toggle_supplier_construction();
        assert_eq!(
            village.protected_freight_cash(&catalog, clock),
            Some(freight)
        );
        let mut short_on_cash = stock.clone();
        short_on_cash.debit(balance - fare, crate::stock::CashKind::Food);
        let terrain = setup.terrain();
        let land = Land::default();
        village.tick_trip(
            &catalog,
            &mut short_on_cash,
            ConstructionSite {
                terrain: &terrain,
                land: &land,
                camp: IVec2::splat(36),
            },
            clock,
            0.1,
        );
        assert!(village.active_trips().next().is_none());
        assert!(!village.seed_freight_active());
        assert_eq!(village.market.committed_fares(), fare);

        village.tick_seed_freight(&mut stock, clock);
        assert!(village.seed_freight_active());
        assert_eq!(
            village.reserved_freight_status(clock.seconds).as_deref(),
            Some("Seed freight · 390 game minutes remaining · Site 1 · Bed 1")
        );
        assert!(
            village
                .pantry_purchase_status(&catalog, &stock, clock)
                .contains("Seed freight · 390 game minutes remaining · Site 1 · Bed 1")
        );
        assert_eq!(village.market.committed_fares(), 0);
        assert_eq!(stock.balance(), balance - freight);

        let mut restored: Construction =
            serde_json::from_slice(&serde_json::to_vec(&village).unwrap()).unwrap();
        assert_eq!(restored.farming.jobs[0].pickups, 1);
        clock.seconds = restored.farming.jobs[0].seed_freight_eta.unwrap();
        restored.tick_seed_freight(&mut stock, clock);
        assert_eq!(restored.farming.jobs[0].pickups, 0);
        assert!(restored.reserved_freight_status(clock.seconds).is_none());
        assert_eq!(stock.balance(), balance - freight);
    }

    #[test]
    fn town_pickup_leaves_booked_workers_free_during_the_shift_window() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let terrain = setup.terrain();
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        let mut clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut village = Construction::default();
        for index in 0..village.residents.len() {
            village.toggle_shift(index);
        }
        village
            .buy_from_town(&catalog, &mut stock, clock, "wood", false)
            .unwrap();

        village.tick_trip(&catalog, &mut stock, site, clock, 0.1);
        assert!(village.active_trips().next().is_none());

        clock.seconds = 3.0 * crate::weather::HOUR;
        village.residents[0].health.energy = 100.0;
        village.residents[0].health.levels[Need::Hydration as usize] = 25.0;
        village.residents[1].health.energy = 99.0;
        village.tick_trip(&catalog, &mut stock, site, clock, 0.1);
        assert_eq!(village.active_trips().next().unwrap().driver, 1);
    }

    #[test]
    fn town_pickups_wait_for_water_and_save_the_drivers_bottle() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let terrain = setup.terrain();
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: 36,
        };
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut village = Construction::default();
        village
            .buy_from_town(&catalog, &mut stock, clock, "wood", false)
            .unwrap();
        village.utilities.ensure_camp();
        assert!(village.utilities.drink(0, 40.0));
        village.tick_trip(&catalog, &mut stock, site, clock, 0.1);
        assert!(village.active_trips().next().is_none());
        assert_eq!(village.trade.orders.len(), 1);

        assert_eq!(village.utilities.deliver_water(0, 0, 1.0), 1.0);
        village.tick_trip(&catalog, &mut stock, site, clock, 0.1);
        let trip = village.trip.unwrap();
        assert_eq!(village.utilities.stored_drinking_water(), 0.5);
        let saved = serde_json::to_vec(&village).unwrap();
        let mut restored: Construction = serde_json::from_slice(&saved).unwrap();
        let health = &mut restored.residents[trip.driver].health;
        assert_eq!(health.drinking_water, 0.5);
        health.levels[Need::Hydration as usize] = 65.0;
        health.decay(&catalog.residents[trip.driver], 25.0, false, false, 0.1);
        assert!(health.levels[Need::Hydration as usize] > 84.0);
        assert_eq!(health.drinking_water, 0.0);
    }

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
    fn purchase_added_before_the_return_drive_needs_no_additional_fuel() {
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
        assert!(village.trip.is_none());
        let queued = serde_json::to_vec(&village).unwrap();
        let mut village: Construction = serde_json::from_slice(&queued).unwrap();
        let clock = TownClock {
            seconds: 40.0,
            ..clock
        };
        village.tick_trip(&catalog, &mut stock, site, clock, 0.1);
        let outgoing = village.trip.unwrap();
        village.residents[outgoing.driver].path.clear();
        village.tick_trip(&catalog, &mut stock, site, clock, 0.1);
        assert!(village.trip.unwrap().boarded);
        village.tick_trip(
            &catalog,
            &mut stock,
            site,
            clock,
            (outgoing.duration * 0.6) as f32,
        );
        assert_eq!(village.trade.receipts, 0);

        let selected = Trade::tradable(&catalog)[village.trade.selected].id;
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
            (outgoing.duration * 0.3) as f32,
        );
        assert_eq!(village.trade.receipts, 1);
        assert_eq!(village.trade.purchases, 0);
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
        assert!(
            village
                .finance_summary(&catalog, &stock, 0, clock)
                .contains(&format!(
                    "0 paid · 2 pending (R${:.2} before fuel)",
                    receipts as f64 / 100.0
                ))
        );
        let before_departure = stock.balance();
        assert_eq!(village.market.committed_fares(), fare * 3);
        assert!(
            village
                .finance_summary(&catalog, &stock, 0, clock)
                .contains(&format!(
                    "Reserved for town trips R${:.2}",
                    (fare * 3) as f64 / 100.0
                ))
        );

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
                .finance_summary(&catalog, &stock, 0, clock)
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
    fn two_resident_vehicles_can_collect_disjoint_loads_for_one_project() {
        let mut catalog = Catalog::default();
        let setup = WorldSetup::default();
        let terrain = setup.terrain();
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::splat(36),
        };
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        let mut stock = Stock::for_start(&setup, &catalog);
        let local = stock.available("stone");
        stock.reserve_available(&BTreeMap::from([("stone".into(), local)]));
        let mut capacity = crate::market::PICKUP_CAPACITY;
        let first_load = crate::market::pack_cargo(
            &catalog,
            &BTreeMap::from([("stone".into(), 1000)]),
            &mut capacity,
        )["stone"];
        let quantity = first_load + 1;
        catalog.projects.get_mut("well").unwrap().materials =
            BTreeMap::from([("stone".into(), quantity)]);
        let mut village = Construction::default();
        let mut plan = village.proposed_site(&catalog, "well", IVec2::new(45, 36));
        Construction::reserve_project(
            &mut village.market,
            &mut stock,
            &catalog,
            &mut plan,
            clock,
            false,
        )
        .unwrap();
        village.plans.push(plan);
        let balance = stock.balance();
        village.tick_trip(&catalog, &mut stock, site, clock, 0.1);
        let first = village.trip.unwrap();
        let mut mixed: Construction =
            serde_json::from_slice(&serde_json::to_vec(&village).unwrap()).unwrap();
        let mut mixed_stock = stock.clone();
        mixed.toggle_supplier_construction();
        mixed.residents[first.driver].path.clear();
        mixed.tick_trip(&catalog, &mut mixed_stock, site, clock, 0.1);
        assert!(mixed.trip.unwrap().boarded);
        assert_eq!(
            mixed.construction_pickup_cargo(0).unwrap()["stone"],
            first_load
        );
        assert_eq!(mixed.construction_freight_cargo(0).unwrap()["stone"], 1);
        let status = mixed.project_status(&catalog, 0);
        assert!(status.contains("Supplier delivery on its way"));
        assert!(status.contains(&format!(
            "Vehicle {} collecting materials",
            first.vehicle + 1
        )));
        assert!(mixed.valid_save(&catalog, &mixed_stock));
        assert_eq!(mixed.market.committed_fares(), 0);
        let mut overlapping: Construction =
            serde_json::from_slice(&serde_json::to_vec(&mixed).unwrap()).unwrap();
        overlapping
            .construction_delivery
            .as_mut()
            .unwrap()
            .cargo
            .get_mut(&0)
            .unwrap()
            .insert("stone".into(), 2);
        assert!(!overlapping.valid_pickup_manifests(&catalog));
        assert!(!overlapping.valid_save(&catalog, &mixed_stock));
        let arrival = mixed.construction_delivery.as_ref().unwrap().eta;
        mixed.tick_construction_delivery(
            &catalog,
            &mut mixed_stock,
            TownClock {
                seconds: arrival,
                ..clock
            },
        );
        assert!(mixed.valid_save(&catalog, &mixed_stock));
        mixed.trip.as_mut().unwrap().elapsed = first.duration;
        mixed.tick_trip(&catalog, &mut mixed_stock, site, clock, 0.1);
        assert!(mixed.plans[0].purchase.is_none());
        assert_eq!(
            balance - mixed_stock.balance(),
            crate::market::fare_cents(12) + crate::market::freight_cents(12)
        );
        assert!(mixed.valid_save(&catalog, &mixed_stock));

        village.residents[first.driver].path.clear();
        village.tick_trip(&catalog, &mut stock, site, clock, 0.1);
        assert!(village.trip.unwrap().boarded);
        let second = village
            .second_trip
            .expect("remaining supplies booked for a second vehicle");
        assert_eq!(second.project, 0);
        assert_eq!(village.pickup_manifests[second.vehicle][&0]["stone"], 1);
        village.residents[second.driver].path.clear();
        village.tick_trip(&catalog, &mut stock, site, clock, 0.1);
        assert!(village.second_trip.unwrap().boarded);
        let status = village.project_status(&catalog, 0);
        assert!(status.contains("Vehicle 1 collecting materials"));
        assert!(status.contains("Vehicle 2 collecting materials"));
        assert_eq!(status.matches("Driving to town").count(), 2);
        assert_eq!(status.matches("game min to camp").count(), 2);
        assert_eq!(
            village.construction_pickup_cargo(0).unwrap()["stone"],
            quantity
        );
        assert_eq!(village.market.committed_fares(), 0);
        assert!(village.valid_save(&catalog, &stock));
        assert_eq!(balance - stock.balance(), 2 * crate::market::fare_cents(12));

        let saved = serde_json::to_vec(&village).unwrap();
        let mut overlapping: Construction = serde_json::from_slice(&saved).unwrap();
        overlapping.pickup_manifests[second.vehicle]
            .get_mut(&0)
            .unwrap()
            .insert("stone".into(), 2);
        assert!(!overlapping.valid_pickup_manifests(&catalog));
        assert!(!overlapping.valid_save(&catalog, &stock));
        let mut village: Construction = serde_json::from_slice(&saved).unwrap();
        village.second_trip.as_mut().unwrap().elapsed = second.duration;
        village.tick_trip(&catalog, &mut stock, site, clock, 0.1);
        assert_eq!(
            village.plans[0].purchase.as_ref().unwrap().units["stone"],
            first_load
        );
        assert!(village.valid_save(&catalog, &stock));
        village.trip.as_mut().unwrap().elapsed = first.duration;
        village.tick_trip(&catalog, &mut stock, site, clock, 0.1);
        assert!(village.plans[0].purchase.is_none());
        assert_eq!(village.plans[0].pickups, 0);
        assert_eq!(balance - stock.balance(), 2 * crate::market::fare_cents(12));
        assert!(village.valid_save(&catalog, &stock));
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
        village.tick_construction_delivery(&catalog, &mut stock, clock);
        assert_eq!(
            village.construction_freight_cargo(0).unwrap()["stone"],
            limit
        );
        let stone = &catalog.materials["stone"];
        assert_eq!(
            village.pending_dispatch_cargo(&catalog),
            Some((stone.mass, stone.volume))
        );
        assert_eq!(village.market.committed_fares(), village.plans[0].fare);
        assert!(village.valid_save(&catalog, &stock));
        let mut mixed: Construction =
            serde_json::from_slice(&serde_json::to_vec(&village).unwrap()).unwrap();
        let mut mixed_stock = stock.clone();
        let setup = WorldSetup::default();
        let terrain = setup.terrain();
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::splat(36),
        };
        mixed.toggle_supplier_construction();
        mixed.tick_trip(&catalog, &mut mixed_stock, site, clock, 0.1);
        let pickup = mixed.trip.expect("pickup booked for the remaining stone");
        assert_eq!(mixed.pickup_manifests[pickup.vehicle][&0]["stone"], 1);
        mixed.residents[pickup.driver].path.clear();
        mixed.tick_trip(&catalog, &mut mixed_stock, site, clock, 0.1);
        assert!(mixed.trip.unwrap().boarded);
        assert_eq!(mixed.construction_pickup_cargo(0).unwrap()["stone"], 1);
        assert_eq!(mixed.construction_freight_cargo(0).unwrap()["stone"], limit);
        assert_eq!(mixed.market.committed_fares(), 0);
        assert!(mixed.valid_save(&catalog, &mixed_stock));

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
        Construction::reserve_project(
            &mut village.market,
            &mut stock,
            &catalog,
            &mut plan,
            clock,
            false,
        )
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
    fn consolidated_freight_uses_its_own_cost_to_check_the_expansion_reserve() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let camp = IVec2::splat(36);
        let terrain = setup.terrain().with_camp(camp);
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp,
        };
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: 36,
        };
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut village = Construction::default();
        for x in [44, 52] {
            village.choose_blueprint("well");
            village.plan(&catalog, &mut stock, site, IVec2::new(x, 36), clock);
        }
        assert_eq!(village.plans.len(), 2, "{}", village.status);
        let definition = &catalog.projects["well"];
        let quote = village
            .market
            .quote(
                &catalog,
                &definition.materials,
                &stock,
                clock.seconds,
                clock.round_trip_km,
            )
            .unwrap();
        let freight = crate::market::freight_cents(clock.round_trip_km);
        let reserve = village.market.expansion_reserve();
        let balance = quote.price + freight + reserve;
        stock.debit(stock.balance() - balance, crate::stock::CashKind::Materials);

        assert!(
            village
                .blueprint_supply_quote(&catalog, &stock, clock, definition)
                .is_err()
        );
        village.toggle_supplier_construction();
        assert!(
            village
                .blueprint_supply_quote(&catalog, &stock, clock, definition)
                .unwrap()
                .contains("1 supplier load")
        );
        village.choose_blueprint("well");
        village.plan(&catalog, &mut stock, site, IVec2::new(60, 36), clock);
        assert_eq!(village.plans.len(), 3, "{}", village.status);
        assert!(village.valid_save(&catalog, &stock));
        village.tick_construction_delivery(&catalog, &mut stock, clock);
        assert!((0..3).all(|plan| village.construction_delivery_at(plan)));
        assert_eq!(stock.balance(), reserve);
        assert!(village.valid_save(&catalog, &stock));
    }

    #[test]
    fn construction_freight_replaces_reserved_pickup_fare_and_survives_a_save() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut village = Construction::default();
        let clock = TownClock {
            seconds: 11.0 * crate::weather::HOUR,
            round_trip_km: 12,
        };
        assert!(!crate::market::town_is_open(clock.seconds));
        let mut plan = village.proposed_site(&catalog, "well", IVec2::new(36, 36));
        Construction::reserve_project(
            &mut village.market,
            &mut stock,
            &catalog,
            &mut plan,
            clock,
            false,
        )
        .unwrap();
        village.plans.push(plan);
        let mut second = village.proposed_site(&catalog, "well", IVec2::new(45, 36));
        let definition = &catalog.projects["well"];
        let extra = village
            .market
            .quote(
                &catalog,
                &definition.materials,
                &stock,
                clock.seconds,
                clock.round_trip_km,
            )
            .unwrap();
        assert_eq!(
            village.construction_freight_budget(&catalog, extra.units),
            Some((1, village.market.committed_fares()))
        );
        let mut exact_budget = stock.clone();
        let needed =
            extra.price + crate::market::freight_cents(12) + village.market.expansion_reserve();
        exact_budget.debit(
            exact_budget.balance() - needed,
            crate::stock::CashKind::Materials,
        );
        village.toggle_supplier_construction();
        assert!(
            village
                .blueprint_supply_quote(&catalog, &exact_budget, clock, definition)
                .unwrap()
                .contains("1 supplier load")
        );
        let mut exact_village: Construction =
            serde_json::from_slice(&serde_json::to_vec(&village).unwrap()).unwrap();
        let camp = IVec2::splat(36);
        let terrain = setup.terrain().with_camp(camp);
        let land = Land::default();
        exact_village.choose_blueprint("well");
        exact_village.plan(
            &catalog,
            &mut exact_budget,
            ConstructionSite {
                terrain: &terrain,
                land: &land,
                camp,
            },
            IVec2::new(45, 36),
            clock,
        );
        assert_eq!(exact_village.plans.len(), 2, "{}", exact_village.status);
        exact_village.tick_construction_delivery(&catalog, &mut exact_budget, clock);
        assert!(exact_village.construction_delivery_at(0));
        assert!(exact_village.construction_delivery_at(1));
        assert_eq!(
            exact_budget.balance(),
            exact_village.market.expansion_reserve()
        );
        assert_eq!(
            exact_village.construction_freight_budget(&catalog, BTreeMap::new()),
            Some((0, 0))
        );
        assert!(exact_village.valid_save(&catalog, &exact_budget));

        Construction::reserve_project(
            &mut village.market,
            &mut stock,
            &catalog,
            &mut second,
            clock,
            false,
        )
        .unwrap();
        village.plans.push(second);
        village.request_project_action(&catalog, &mut stock, 1, ProjectAction::Prioritize);
        let before = stock.balance();
        village.tick_construction_delivery(&catalog, &mut stock, clock);
        let delivery = village.construction_delivery.as_ref().unwrap();
        assert_eq!(delivery.site, 1);
        assert_eq!(delivery.additional_sites, [0]);
        assert!(village.construction_delivery_at(0));
        assert!(village.construction_delivery_at(1));
        assert!(
            village
                .reserved_freight_status(clock.seconds)
                .unwrap()
                .contains("2 project(s) · 390 game minutes remaining")
        );
        let (_, projects) = village.projects_panel(&catalog, &stock, 0, true, clock.seconds);
        for site in [1, 2] {
            let priority = if site == 2 { " · Priority" } else { "" };
            assert!(projects.contains(&format!(
                " #{site} · Supplier delivery on its way{priority} · 390 game minutes remaining"
            )));
        }
        assert_eq!(
            village.construction_delivery_minutes(2, clock.seconds),
            None
        );
        let (_, stores) = village.inventory_panel(
            &catalog,
            &stock,
            &Land::default(),
            0,
            InventoryView::Resources,
            "pipe",
        );
        assert!(stores.contains("in transit"));
        assert_eq!(village.market.committed_fares(), 0);
        assert_eq!(stock.balance(), before - crate::market::freight_cents(12));
        assert!(village.valid_save(&catalog, &stock));
        let mut village: Construction =
            serde_json::from_slice(&serde_json::to_vec(&village).unwrap()).unwrap();
        let eta = village.construction_delivery.as_ref().unwrap().eta;
        let (_, projects) =
            village.projects_panel(&catalog, &stock, 0, true, eta - 2.0 * crate::weather::HOUR);
        assert_eq!(projects.matches("120 game minutes remaining").count(), 2);
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
    fn construction_waits_for_freight_until_the_player_switches_to_pickup() {
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
        Construction::reserve_project(
            &mut village.market,
            &mut stock,
            &catalog,
            &mut plan,
            clock,
            false,
        )
        .unwrap();
        assert!(Construction::fits_construction_freight(&catalog, &plan));
        village.plans.push(plan);
        village.toggle_supplier_construction();

        let reserved = village.market.committed_fares();
        assert!(reserved < crate::market::freight_cents(12));
        let balance = crate::market::freight_cents(12) - 1;
        stock.debit(stock.balance() - balance, crate::stock::CashKind::Food);
        assert_eq!(stock.balance(), balance);
        village.tick_trip(&catalog, &mut stock, site, clock, 0.1);

        assert!(village.construction_delivery.is_none());
        assert!(village.active_trips().next().is_none());
        assert_eq!(stock.balance(), balance);
        assert_eq!(village.market.committed_fares(), reserved);
        assert!(
            village
                .trade_status(&catalog, &stock, clock)
                .contains("Queued supplier freight needs R$0.01 more")
        );
        village.toggle_supplier_construction();
        village.tick_trip(&catalog, &mut stock, site, clock, 0.1);

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
            Construction::reserve_project(
                &mut village.market,
                stock,
                &catalog,
                &mut plan,
                clock,
                false,
            )
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
        village.request_project_action(&catalog, &mut stock, 1, ProjectAction::Prioritize);
        let fare = crate::market::fare_cents(12);
        let balance = stock.balance();
        assert_eq!(village.market.committed_fares(), fare * 2);
        village.tick_trip(&catalog, &mut stock, site, clock, 0.1);
        assert_eq!(village.active_trips().count(), 1);
        let trip = village.trip.unwrap();
        assert!(!trip.boarded);
        assert_eq!(trip.project, 1);
        assert_eq!(trip.driver, first_trip.driver);
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
                ProjectAction::Cancel,
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
                ProjectAction::Cancel,
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
