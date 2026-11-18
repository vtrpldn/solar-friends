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
                    self.market.depart(stock, self.plans[trip.project].fare);
                    trip.boarded = true;
                }
            } else {
                trip.elapsed = (trip.elapsed + f64::from(dt)).min(trip.duration);
                if trip.elapsed >= trip.duration {
                    self.plans[trip.project].pickups -= 1;
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
        let Some(project) = self.plans.iter().position(|plan| plan.pickups > 0) else {
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
                driver: index,
                elapsed: 0.0,
                duration: trip_seconds(clock.round_trip_km),
                boarded: false,
            });
            return;
        }
    }
}
