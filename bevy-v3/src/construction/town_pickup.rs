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
        if let Some(mut trip) = self.trip.take() {
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
            } else {
                trip.elapsed = (trip.elapsed + f64::from(dt)).min(trip.duration);
                if trip.market_order && trip.elapsed >= trip.duration * 0.5 {
                    self.trade.settle(stock);
                }
                if trip.elapsed >= trip.duration {
                    if trip.market_order {
                        let space = self.storage_space(catalog, stock);
                        if !self.trade.finish_trip(stock, space) {
                            self.trip = Some(trip);
                            return;
                        }
                    } else if let Some(bed) = trip.farm_bed {
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
                    return;
                }
            }
            self.trip = Some(trip);
            return;
        }

        let hour = ((540.0 + clock.seconds * 0.45) / 60.0) % 24.0;
        if !(7.0..18.0).contains(&hour) {
            return;
        }
        let construction = self
            .plans
            .iter()
            .position(|plan| !plan.removed && plan.pickups > 0)
            .map(|index| (index, None));
        let farming = self
            .farming
            .jobs
            .iter()
            .find(|job| job.pickups > 0)
            .map(|job| (job.site, Some(job.bed)));
        let next = construction.or(farming);
        let market_order = next.is_none() && !self.trade.orders.is_empty();
        let Some((project, farm_bed)) = next.or_else(|| market_order.then_some((0, None))) else {
            return;
        };
        let door = IVec2::new(30, -15);
        let ConstructionSite {
            terrain,
            land,
            camp,
        } = site;
        for index in (0..self.residents.len()).rev() {
            let worker = &self.residents[index];
            if worker.assignment.is_some()
                || self.gathering.workers_at_site(index)
                || self.production.has_worker(index)
                || self.farming.has_worker(index)
                || self.working_change(index)
                || self.working_water(index)
                || self.residents[index].health.task.is_some()
                || self.residents[index].town_work.active()
            {
                continue;
            }
            let Some(path) = route(
                worker.position,
                door,
                |cell| self.blocked(catalog, terrain, land, camp, cell),
                access_road,
            ) else {
                continue;
            };
            self.residents[index].path = path;
            self.trip = Some(TownTrip {
                project,
                farm_bed,
                market_order,
                driver: index,
                elapsed: 0.0,
                duration: trip_seconds(clock.round_trip_km),
                boarded: false,
            });
            return;
        }
    }
}
