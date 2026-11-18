use super::*;

impl Construction {
    pub(super) fn tick_gathering(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        site: ConstructionSite,
        clock: f64,
        dt: f32,
    ) {
        let ConstructionSite {
            terrain,
            land,
            camp,
        } = site;
        let queued: Vec<_> = self.gathering.orders.keys().copied().collect();
        for index in queued {
            let Some(resource) = land.site(index) else {
                continue;
            };
            let recipe = &catalog.gathering[resource.recipe()];
            if clock < self.gathering.orders[&index].retry_at {
                continue;
            }
            let assigned = self.gathering.orders[&index].worker;
            if let Some(worker_index) = assigned {
                let worker = &mut self.residents[worker_index];
                let phase = &self.gathering.orders[&index].phase;
                worker.move_along_path(dt, *phase == GatherPhase::Return);
                if !worker.path.is_empty() {
                    continue;
                }
                let job = self.gathering.orders.get_mut(&index).expect("queued job");
                match job.phase {
                    GatherPhase::Approach => job.phase = GatherPhase::Work,
                    GatherPhase::Work => {
                        job.work = (job.work + f64::from(dt)).min(recipe.work);
                        if job.work < recipe.work {
                            continue;
                        }
                        let Some(path) = route(
                            worker.position,
                            SUPPLY_SPOTS[worker_index],
                            |cell| self.blocked(catalog, terrain, land, camp, cell),
                            access_road,
                        ) else {
                            self.gathering
                                .orders
                                .get_mut(&index)
                                .expect("queued job")
                                .retry_at = clock + 5.0;
                            continue;
                        };
                        self.residents[worker_index].path = path;
                        self.gathering
                            .orders
                            .get_mut(&index)
                            .expect("queued job")
                            .phase = GatherPhase::Return;
                        self.gathering.gathered(
                            index,
                            resource.recipe() == "fell_tree",
                            recipe.output.values().sum(),
                            clock + recipe.renew,
                        );
                    }
                    GatherPhase::Return => {
                        let units: u64 = recipe.output.values().map(|v| u64::from(*v)).sum();
                        if self.storage_space(catalog, stock) < units {
                            continue;
                        }
                        stock.receive(&recipe.output);
                        self.gathering.orders.remove(&index);
                    }
                }
                continue;
            }

            self.gathering
                .orders
                .get_mut(&index)
                .expect("queued job")
                .retry_at = clock + 5.0;
            for worker_index in 0..self.residents.len() {
                let worker = &self.residents[worker_index];
                if worker.assignment.is_some()
                    || self
                        .trip
                        .as_ref()
                        .is_some_and(|trip| trip.driver == worker_index)
                    || self.gathering.workers_at_site(worker_index)
                    || self.production.has_worker(worker_index)
                    || self.farming.has_worker(worker_index)
                    || worker.health.task.is_some()
                    || worker.town_work.active()
                {
                    continue;
                }
                let start = resource.position;
                let size = resource.size;
                let mut approaches = Vec::new();
                for z in 0..size.y {
                    approaches.extend([start + IVec2::new(-1, z), start + IVec2::new(size.x, z)]);
                }
                for x in 0..size.x {
                    approaches.extend([start + IVec2::new(x, -1), start + IVec2::new(x, size.y)]);
                }
                approaches.sort_by(|a, b| {
                    a.as_vec2()
                        .distance_squared(worker.position)
                        .total_cmp(&b.as_vec2().distance_squared(worker.position))
                });
                let Some(path) = approaches.into_iter().find_map(|cell| {
                    route(
                        worker.position,
                        cell,
                        |cell| self.blocked(catalog, terrain, land, camp, cell),
                        access_road,
                    )
                }) else {
                    continue;
                };
                self.residents[worker_index].path = path;
                self.gathering
                    .orders
                    .get_mut(&index)
                    .expect("queued job")
                    .worker = Some(worker_index);
                self.gathering
                    .orders
                    .get_mut(&index)
                    .expect("queued job")
                    .retry_at = 0.0;
                break;
            }
        }
    }
}
