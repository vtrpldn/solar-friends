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
            let basket_in_repair = self.repairing(catalog, "harvest-basket");
            if let Some(worker_index) = assigned {
                if self.reservation_pass.is_some() {
                    continue;
                }
                let worker = &mut self.residents[worker_index];
                let phase = &self.gathering.orders[&index].phase;
                worker.move_along_path(dt, *phase == GatherPhase::Return);
                if !worker.path.is_empty() {
                    continue;
                }
                match self.gathering.orders[&index].phase {
                    GatherPhase::Approach => {
                        self.gathering
                            .orders
                            .get_mut(&index)
                            .expect("queued job")
                            .phase = GatherPhase::Work;
                    }
                    GatherPhase::Work => {
                        let job = self.gathering.orders.get_mut(&index).expect("queued job");
                        let boost = stock.use_tool(
                            worker_index,
                            "harvest-basket",
                            ToolTask::Gathering(index),
                            f64::from(dt),
                            basket_in_repair,
                        );
                        job.work = (job.work + f64::from(dt) * boost).min(recipe.work);
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
                        let output = self.gathering.orders[&index]
                            .remaining
                            .as_ref()
                            .unwrap_or(&recipe.output);
                        let load = super::production_work::production_load(catalog, output);
                        let units: u64 = load.values().map(|&units| u64::from(units)).sum();
                        if (load.is_empty() && output.values().any(|&units| units > 0))
                            || self.storage_space(catalog, stock) < units
                        {
                            continue;
                        }
                        let mut remaining = output.clone();
                        crate::market::subtract_cargo(&mut remaining, &load);
                        stock.receive(&load);
                        if remaining.is_empty() {
                            self.gathering.orders.remove(&index);
                        } else {
                            let job = self.gathering.orders.get_mut(&index).expect("queued job");
                            job.remaining = Some(remaining);
                            job.phase = GatherPhase::CollectOutput;
                        }
                    }
                    GatherPhase::CollectOutput => {
                        let at_source = gather_approaches(resource)
                            .contains(&worker.position.round().as_ivec2());
                        let from = worker.position;
                        let blocked = |cell| self.blocked(catalog, terrain, land, camp, cell);
                        let next = if at_source {
                            route(from, SUPPLY_SPOTS[worker_index], blocked, access_road)
                        } else {
                            route_to_gather_site(resource, from, blocked)
                        };
                        let job = self.gathering.orders.get_mut(&index).expect("queued job");
                        if let Some(path) = next {
                            if at_source {
                                job.phase = GatherPhase::Return;
                            }
                            self.residents[worker_index].path = path;
                        } else {
                            job.retry_at = clock + 5.0;
                        }
                    }
                }
                continue;
            }

            if self.reservation_pass.is_none() {
                self.gathering
                    .orders
                    .get_mut(&index)
                    .expect("queued job")
                    .retry_at = clock + 5.0;
            }
            for worker_index in 0..self.residents.len() {
                if !self.work_candidate(worker_index) {
                    continue;
                }
                let worker = &self.residents[worker_index];
                let Some(path) = route_to_gather_site(resource, worker.position, |cell| {
                    self.blocked(catalog, terrain, land, camp, cell)
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

fn gather_approaches(resource: &crate::land::Site) -> Vec<IVec2> {
    let start = resource.position;
    let size = resource.size;
    let mut approaches = Vec::new();
    for z in 0..size.y {
        approaches.extend([start + IVec2::new(-1, z), start + IVec2::new(size.x, z)]);
    }
    for x in 0..size.x {
        approaches.extend([start + IVec2::new(x, -1), start + IVec2::new(x, size.y)]);
    }
    approaches
}

fn route_to_gather_site(
    resource: &crate::land::Site,
    from: Vec2,
    mut blocked: impl FnMut(IVec2) -> bool,
) -> Option<VecDeque<Vec2>> {
    let mut approaches = gather_approaches(resource);
    approaches.sort_by(|a, b| {
        a.as_vec2()
            .distance_squared(from)
            .total_cmp(&b.as_vec2().distance_squared(from))
    });
    approaches
        .into_iter()
        .find_map(|cell| route(from, cell, &mut blocked, access_road))
}
