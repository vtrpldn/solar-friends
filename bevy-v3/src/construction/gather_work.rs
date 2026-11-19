use super::*;

impl Construction {
    pub(crate) fn gathering_route_blocked(
        &self,
        job: &crate::gathering::GatherJob,
        clock: f64,
    ) -> bool {
        (job.waiting_for_access && job.retry_at > clock)
            || job
                .worker
                .is_some_and(|worker| self.residents[worker].waiting_for_route())
    }

    pub(super) fn tick_gathering(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        site: ConstructionSite,
        clock: f64,
        dt: f32,
        group: WorkGroup,
    ) {
        let land = site.land;
        let queued: Vec<_> = self.gathering.orders.keys().copied().collect();
        for index in queued {
            let Some(resource) = land.site(index) else {
                continue;
            };
            let recipe = &catalog.gathering[resource.recipe()];
            if WorkGroup::for_output(&recipe.output) != group {
                continue;
            }
            if self.reservation_pass.is_none()
                && !stock.sandbox
                && self.expire_gathered_food(catalog, stock, index, &recipe.output, clock)
            {
                continue;
            }
            if clock < self.gathering.orders[&index].retry_at {
                continue;
            }
            let assigned = self.gathering.orders[&index].worker;
            let basket_in_repair = self.repairing(catalog, "harvest-basket");
            if let Some(worker_index) = assigned {
                if self.reservation_pass.is_some() {
                    continue;
                }
                self.gathering
                    .orders
                    .get_mut(&index)
                    .expect("queued job")
                    .waiting_for_access = false;
                let job = &self.gathering.orders[&index];
                if matches!(job.phase, GatherPhase::Approach | GatherPhase::Work)
                    && self.residents[worker_index].health.energy < 25.0
                {
                    let worker = &mut self.residents[worker_index];
                    worker.path.clear();
                    worker.paused_waypoint = None;
                    let job = self.gathering.orders.get_mut(&index).expect("queued job");
                    job.worker = None;
                    job.phase = GatherPhase::Approach;
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
                        let position = worker.position;
                        let path = self.resident_route(
                            catalog,
                            site,
                            position,
                            SUPPLY_SPOTS[worker_index],
                        );
                        let job = self.gathering.orders.get_mut(&index).expect("queued job");
                        let food = crate::food::fresh(&recipe.output, clock, &BTreeMap::new());
                        if !food.is_empty() {
                            job.food_output = Some(food);
                        }
                        if let Some(path) = path {
                            self.residents[worker_index].path = path;
                            job.phase = GatherPhase::Return;
                        } else {
                            job.phase = GatherPhase::CollectOutput;
                            job.remaining = Some(recipe.output.clone());
                            job.retry_at = clock + 5.0;
                            job.waiting_for_access = true;
                        }
                        self.gathering.gathered(
                            index,
                            resource.recipe() == "fell_tree",
                            recipe.output.values().sum(),
                            clock + recipe.renew,
                        );
                    }
                    GatherPhase::Return => {
                        let output = self.gathering.orders[&index].remaining_output(&recipe.output);
                        let load = super::production_work::production_load(catalog, output);
                        let units: u64 = load.values().map(|&units| u64::from(units)).sum();
                        if (load.is_empty() && output.values().any(|&units| units > 0))
                            || self.storage_space(catalog, stock) < units
                        {
                            continue;
                        }
                        let mut remaining = output.clone();
                        crate::market::subtract_cargo(&mut remaining, &load);
                        let job = self.gathering.orders.get_mut(&index).expect("queued job");
                        if let Some(lots) = &mut job.food_output {
                            stock.receive_with_lots(
                                &load,
                                super::production_work::take_load_lots(lots, &load),
                            );
                        } else {
                            stock.receive(&load);
                        }
                        if remaining.is_empty() {
                            self.gathering.orders.remove(&index);
                        } else {
                            job.remaining = Some(remaining);
                            job.phase = GatherPhase::CollectOutput;
                        }
                    }
                    GatherPhase::CollectOutput => {
                        let at_source = gather_approaches(resource)
                            .contains(&worker.position.round().as_ivec2());
                        let from = worker.position;
                        let path = |cell| self.resident_route(catalog, site, from, cell);
                        let next = if at_source {
                            path(SUPPLY_SPOTS[worker_index])
                        } else {
                            route_to_gather_site(resource, from, path)
                        };
                        let job = self.gathering.orders.get_mut(&index).expect("queued job");
                        if let Some(path) = next {
                            if at_source {
                                job.phase = GatherPhase::Return;
                            }
                            self.residents[worker_index].path = path;
                        } else {
                            job.retry_at = clock + 5.0;
                            job.waiting_for_access = true;
                        }
                    }
                }
                continue;
            }

            let mut attempted_route = false;
            for worker_index in 0..self.residents.len() {
                if !self.work_candidate(worker_index)
                    || self.residents[worker_index].health.energy < 25.0
                {
                    continue;
                }
                attempted_route = true;
                let worker = &self.residents[worker_index];
                let Some(path) = route_to_gather_site(resource, worker.position, |cell| {
                    self.resident_route(catalog, site, worker.position, cell)
                }) else {
                    continue;
                };
                self.residents[worker_index].path = path;
                let job = self.gathering.orders.get_mut(&index).expect("queued job");
                job.worker = Some(worker_index);
                job.retry_at = 0.0;
                job.waiting_for_access = false;
                break;
            }
            let job = self.gathering.orders.get_mut(&index).expect("queued job");
            if self.reservation_pass.is_none() && job.worker.is_none() {
                job.retry_at = clock + 5.0;
                job.waiting_for_access = attempted_route;
            }
        }
    }
    fn expire_gathered_food(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        index: usize,
        recipe_output: &BTreeMap<String, u32>,
        clock: f64,
    ) -> bool {
        let job = self.gathering.orders.get_mut(&index).expect("queued job");
        let Some(lots) = &mut job.food_output else {
            return false;
        };
        let expired = crate::food::discard_expired(lots, clock);
        if expired.is_empty() {
            return false;
        }
        stock.record_spoilage(catalog, &expired);
        let remaining = job.remaining.get_or_insert_with(|| recipe_output.clone());
        crate::market::subtract_cargo(remaining, &expired);
        if remaining.is_empty() {
            if let Some(worker) = job.worker {
                self.residents[worker].path.clear();
            }
            self.gathering.orders.remove(&index);
            return true;
        }
        false
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
    path: impl FnMut(IVec2) -> Option<VecDeque<Vec2>>,
) -> Option<VecDeque<Vec2>> {
    let mut approaches = gather_approaches(resource);
    approaches.sort_by(|a, b| {
        a.as_vec2()
            .distance_squared(from)
            .total_cmp(&b.as_vec2().distance_squared(from))
    });
    approaches.into_iter().find_map(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::setup::WorldSetup;

    #[test]
    fn gathered_food_keeps_its_harvest_expiry_across_a_save() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let camp = IVec2::new(36, 36);
        let terrain = setup.terrain().with_camp(camp);
        let land = Land::generate(&setup);
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp,
        };
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut village = Construction::default();
        let (index, resource, approach) = land
            .sites()
            .filter(|(_, resource)| resource.recipe() == "gather-wild-fruit")
            .find_map(|(index, resource)| {
                let route = route_to_gather_site(resource, SUPPLY_SPOTS[0].as_vec2(), |cell| {
                    village.resident_route(&catalog, site, SUPPLY_SPOTS[0].as_vec2(), cell)
                })?;
                Some((index, resource, *route.back()?))
            })
            .expect("a reachable wild fruit site");
        village
            .gathering
            .queue_resource(
                &catalog,
                &land,
                index,
                (terrain.seed, setup.richness(), 0.0),
            )
            .unwrap();
        for (worker, resident) in village.residents.iter_mut().enumerate() {
            resident.position = SUPPLY_SPOTS[worker].as_vec2();
            resident.health.energy = if worker == 0 { 100.0 } else { 0.0 };
        }
        let mut blocked: Construction =
            serde_json::from_slice(&serde_json::to_vec(&village).unwrap()).unwrap();
        for point in gather_approaches(resource) {
            let obstacle = blocked.proposed_site(&catalog, "supply-5", point);
            blocked.plans.push(obstacle);
        }
        blocked.tick_gathering(&catalog, &mut stock, site, 0.0, 0.1, WorkGroup::Essentials);
        assert!(blocked.gathering.orders[&index].worker.is_none());
        assert_eq!(
            blocked.lab_stop_reason(super::super::LabStop::Blocked, 0.0),
            Some("A job is waiting for access.")
        );
        blocked.plans.clear();
        blocked.tick_gathering(&catalog, &mut stock, site, 5.0, 0.1, WorkGroup::Essentials);
        assert_eq!(blocked.gathering.orders[&index].worker, Some(0));
        assert!(
            blocked
                .lab_stop_reason(super::super::LabStop::Blocked, 5.0)
                .is_none()
        );

        village.tick_gathering(&catalog, &mut stock, site, 0.0, 0.1, WorkGroup::Production);
        assert!(village.gathering.orders[&index].worker.is_none());
        village.tick_gathering(&catalog, &mut stock, site, 0.0, 0.1, WorkGroup::Essentials);
        assert_eq!(village.gathering.orders[&index].worker, Some(0));
        village.residents[0].health.energy = 24.0;
        village.tick_gathering(&catalog, &mut stock, site, 0.1, 0.1, WorkGroup::Essentials);
        assert!(village.gathering.orders[&index].worker.is_none());
        village.tick_gathering(&catalog, &mut stock, site, 0.2, 0.1, WorkGroup::Essentials);
        assert!(village.gathering.orders[&index].worker.is_none());
        village.residents[0].health.energy = 100.0;
        village.residents[0].path.clear();
        village.residents[0].position = approach;
        let recipe = &catalog.gathering[resource.recipe()];
        let job = village.gathering.orders.get_mut(&index).unwrap();
        job.worker = Some(0);
        job.phase = GatherPhase::Work;
        job.work = recipe.work;
        let harvested_at = 2.0 * crate::weather::HOUR;
        village.tick_gathering(
            &catalog,
            &mut stock,
            site,
            harvested_at,
            0.1,
            WorkGroup::Essentials,
        );
        let job = &village.gathering.orders[&index];
        assert!(job.phase == GatherPhase::Return);
        let expiry = job.food_output.as_ref().unwrap()["food"][0].expires;
        assert_eq!(expiry, harvested_at + 3.0 * crate::weather::DAY);
        assert!(village.gathering.valid_save(&land, &catalog));
        let saved = serde_json::to_vec(&village).unwrap();

        let initial = stock.available("food");
        let mut fresh: Construction = serde_json::from_slice(&saved).unwrap();
        fresh.residents[0].path.clear();
        fresh.residents[0].position = SUPPLY_SPOTS[0].as_vec2();
        let mut fresh_stock = stock.clone();
        fresh.tick_gathering(
            &catalog,
            &mut fresh_stock,
            site,
            expiry - 1.0,
            0.1,
            WorkGroup::Essentials,
        );
        assert_eq!(
            fresh_stock.available("food"),
            initial + recipe.output["food"]
        );
        assert!(
            fresh_stock.pantry.lots["food"]
                .iter()
                .any(|lot| lot.expires == expiry)
        );

        village = serde_json::from_slice(&saved).unwrap();
        village.tick_gathering(
            &catalog,
            &mut stock,
            site,
            expiry,
            0.1,
            WorkGroup::Essentials,
        );
        assert!(village.gathering.orders.is_empty());
        assert!(village.residents[0].path.is_empty());
        assert_eq!(stock.available("food"), initial);
        assert_eq!(
            stock.pantry.spoiled["food"],
            u64::from(recipe.output["food"])
        );
    }
}
