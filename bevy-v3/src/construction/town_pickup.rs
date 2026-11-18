use super::*;

impl Construction {
    pub(super) fn tick_trip(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        site: ConstructionSite,
        clock: TownClock,
        dt: f32,
    ) {
        for (slot, existing) in [self.trip, self.second_trip].into_iter().enumerate() {
            if let Some(mut trip) = existing {
                let finished = self.advance_trip(catalog, stock, clock, &mut trip, dt);
                self.set_trip(slot, (!finished).then_some(trip));
            }
        }

        let hour = ((540.0 + clock.seconds * 0.45) / 60.0) % 24.0;
        if !(7.0..18.0).contains(&hour) {
            return;
        }
        let available: Vec<_> = self
            .upkeep
            .trip_vehicles()
            .filter(|&vehicle| !self.active_trips().any(|trip| trip.vehicle == vehicle))
            .collect();
        for vehicle in available {
            let Some(trip) = self.dispatch_trip(catalog, site, clock, vehicle) else {
                continue;
            };
            let slot = usize::from(self.trip.is_some());
            self.set_trip(slot, Some(trip));
            self.upkeep.dispatch_vehicle(vehicle);
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
                    self.trade.orders.front().expect("active export").fare
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
            self.trade.settle(stock);
        }
        if trip.elapsed < trip.duration {
            return false;
        }
        if trip.market_order {
            let space = self.storage_space(catalog, stock);
            return self.trade.finish_trip(stock, space);
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
            plan.pickups -= 1;
            if plan.pickups == 0 {
                plan.purchase = None;
            }
        }
        true
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
        let construction = self
            .plans
            .iter()
            .enumerate()
            .find(|&(index, plan)| !plan.removed && plan.pickups > 0 && !booked(index, None))
            .map(|(index, _)| (index, None));
        let farming = self
            .farming
            .jobs
            .iter()
            .find(|job| job.pickups > 0 && !booked(job.site, Some(job.bed)))
            .map(|job| (job.site, Some(job.bed)));
        let pickup = construction.or(farming);
        let market_order = pickup.is_none()
            && !self.trade.orders.is_empty()
            && !self.active_trips().any(|trip| trip.market_order);
        let (project, farm_bed) = pickup.or_else(|| market_order.then_some((0, None)))?;
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
