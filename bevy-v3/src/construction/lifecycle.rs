use crate::farming::Stage;

use super::{resident_work::project_access_points, *};

#[derive(Clone, Deserialize, Serialize)]
pub(super) struct Purchase {
    pub units: BTreeMap<String, u32>,
    pub price: u64,
    pub day: u64,
    pub trips: u32,
}

#[derive(Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
enum Change {
    Move,
    Salvage,
    Demolish,
}

const BUILDING_HISTORY_LIMIT: usize = 64;
const MIN_DISMANTLING_ENERGY: f64 = 25.0;

#[derive(Deserialize, Serialize)]
pub(super) struct DismantledBuilding {
    clock: f64,
    key: String,
    kind: Change,
    recovered: BTreeMap<String, u32>,
    lost: BTreeMap<String, u32>,
}

#[derive(Deserialize, Serialize)]
pub(super) struct ChangeJob {
    kind: Change,
    pub target: Option<Destination>,
    pub worker: Option<usize>,
    pub work: f64,
    pub required: f64,
    retry: f64,
    #[serde(skip)]
    blocked_destination: Option<&'static str>,
}

#[derive(Clone, Copy, Deserialize, Serialize)]
pub(super) struct Destination {
    pub position: IVec2,
    pub size: IVec2,
    pub rotation: u8,
}

#[derive(Clone, Copy)]
pub(crate) enum ProjectAction {
    Prioritize,
    Move,
    Salvage,
    Demolish,
}

impl Construction {
    pub(crate) fn valid_building_history(&self, catalog: &Catalog, clock: f64) -> bool {
        self.building_history.len() <= BUILDING_HISTORY_LIMIT
            && self.building_history.iter().all(|entry| {
                (0.0..=clock).contains(&entry.clock)
                    && catalog.projects.contains_key(&entry.key)
                    && matches!(entry.kind, Change::Salvage | Change::Demolish)
                    && entry
                        .recovered
                        .keys()
                        .chain(entry.lost.keys())
                        .all(|id| catalog.materials.contains_key(id))
            })
    }

    pub fn working_change(&self, worker: usize) -> bool {
        self.changes.values().any(|job| job.worker == Some(worker))
    }

    pub fn construction_notice(&self) -> &str {
        &self.status
    }

    pub fn lifecycle_status(&self, catalog: &Catalog, stock: &Stock) -> Option<String> {
        let index = self.production.selected?;
        let project = self.plans.get(index)?;
        if project.removed {
            return None;
        }
        let label = if let Some(job) = self.changes.get(&index) {
            let action = match job.kind {
                Change::Move => "Moving",
                Change::Salvage => "Salvaging",
                Change::Demolish => "Demolishing",
            };
            if let Some(reason) = job.blocked_destination {
                return Some(format!("{action} · {reason}"));
            }
            if job.target.is_none() && job.work >= job.required {
                let (recovered, _) = self.dismantling_yield(catalog, index, job.kind);
                if !self.can_store_dismantling(catalog, stock, index, &recovered) {
                    return Some(format!("{action} · Waiting for storage space"));
                }
            }
            format!("{action} · {:.0}%", job.work / job.required * 100.0)
        } else if project.work == 0.0 {
            "X Cancel plan · Z Prioritize".into()
        } else if project.work < catalog.projects[&project.key].work {
            "X Dismantle · Z Prioritize".into()
        } else {
            "Shift+M Move · X Salvage · Shift+X Demolish".into()
        };
        Some(label)
    }

    pub fn lifecycle_input(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        keys: &ButtonInput<KeyCode>,
    ) {
        let shift = keys.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]);
        for (key, action) in [
            (KeyCode::KeyZ, ProjectAction::Prioritize),
            (KeyCode::KeyM, ProjectAction::Move),
            (
                KeyCode::KeyX,
                if shift {
                    ProjectAction::Demolish
                } else {
                    ProjectAction::Salvage
                },
            ),
        ] {
            if keys.just_pressed(key)
                && (!matches!(action, ProjectAction::Move) || shift)
                && self.project_action_available(catalog, action)
            {
                self.apply_project_action(catalog, stock, action);
                break;
            }
        }
    }

    pub fn project_action_available(&self, catalog: &Catalog, action: ProjectAction) -> bool {
        if self.menu || self.moving.is_some() || self.production.open || self.farming.open {
            return false;
        }
        self.production.selected.is_some_and(|index| {
            let project = &self.plans[index];
            !project.removed
                && !self.changes.contains_key(&index)
                && (!matches!(action, ProjectAction::Prioritize)
                    || project.work < catalog.projects[&project.key].work)
        })
    }

    pub fn apply_project_action(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        action: ProjectAction,
    ) {
        if !self.project_action_available(catalog, action) {
            return;
        }
        let Some(index) = self.production.selected else {
            return;
        };
        self.request_project_action(catalog, stock, index, action);
    }

    pub(super) fn request_project_action(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        index: usize,
        action: ProjectAction,
    ) {
        let project = &self.plans[index];
        if matches!(action, ProjectAction::Prioritize) {
            self.priority = Some(index);
            for worker in &mut self.residents {
                if worker
                    .assignment
                    .as_ref()
                    .is_some_and(|job| job.activity != Activity::Carry)
                {
                    worker.assignment = None;
                    worker.path.clear();
                }
            }
            self.status = format!("{} prioritized.", catalog.projects[&project.key].name);
            return;
        }
        if let Some(issue) = self.can_change(index) {
            self.status = issue.into();
            return;
        }
        if matches!(action, ProjectAction::Move) {
            if self.farming.plots.contains_key(&index) {
                self.status = "Cultivated soil stays on its land.".into();
            } else {
                self.moving = Some(index);
                self.rotation = project.rotation;
                self.status.clear();
            }
        } else if project.work == 0.0 {
            self.cancel_plan(catalog, stock, index);
        } else {
            if project.pickups > 0 {
                self.status = "Wait for the purchased supplies to arrive.".into();
                return;
            }
            let mode = if matches!(action, ProjectAction::Demolish) {
                Change::Demolish
            } else {
                Change::Salvage
            };
            self.begin_change(catalog, index, mode, None);
        }
    }

    pub(super) fn can_change(&self, index: usize) -> Option<&'static str> {
        if self.upkeep.servicing(index) {
            return Some("Wait for the resident to finish servicing this asset.");
        }
        if self.water_job_at(index) {
            return Some("Wait for the queued water job to finish.");
        }
        if self.production.jobs.iter().any(|job| job.site == index)
            || self.farming.jobs.iter().any(|job| job.site == index)
        {
            return Some("Finish the active batch or bed job first.");
        }
        if self.farming.plots.get(&index).is_some_and(|plot| {
            plot.beds
                .iter()
                .any(|bed| matches!(bed.stage, Stage::Growing | Stage::Harvestable))
        }) {
            return Some("Harvest or clear the standing crops first.");
        }
        if self.residents.iter().any(|worker| {
            worker
                .assignment
                .as_ref()
                .is_some_and(|job| job.project == index && job.activity == Activity::Carry)
                || worker
                    .health
                    .task
                    .as_ref()
                    .is_some_and(|task| task.facility == Some(index + 1))
        }) {
            return Some("Wait for the current delivery or service visit.");
        }
        None
    }

    pub(super) fn queue_move(
        &mut self,
        catalog: &Catalog,
        stock: &Stock,
        site: ConstructionSite,
        position: IVec2,
        index: usize,
    ) {
        if self.plans[index].key == "field" {
            self.status =
                "Cultivated soil stays on its land. Designate a new field instead.".into();
            self.moving = None;
            return;
        }
        let plan = &self.plans[index];
        let definition = &catalog.projects[&plan.key];
        let target = Destination {
            position,
            rotation: self.rotation,
            size: size(definition, self.rotation),
        };
        if let Some(error) = self.move_placement_error(catalog, stock, site, index, target) {
            self.status = error.into();
            return;
        }
        self.begin_change(catalog, index, Change::Move, Some(target));
        self.moving = None;
    }

    fn move_placement_error(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        site: ConstructionSite,
        index: usize,
        target: Destination,
    ) -> Option<&'static str> {
        let mut proposal = self.plans[index].clone();
        proposal.position = target.position;
        proposal.size = target.size;
        proposal.rotation = target.rotation;
        self.placement_error(
            site.terrain,
            site.land,
            site.camp,
            &proposal,
            &catalog.projects[&proposal.key],
            (catalog, stock.sandbox, Some(index)),
        )
    }

    fn cancel_plan(&mut self, catalog: &Catalog, stock: &mut Stock, index: usize) {
        if self.construction_delivery_at(index) {
            self.status = "Materials are on their way. Cancel after delivery.".into();
            return;
        }
        let plan = &self.plans[index];
        let mut returned = plan.materials(catalog).clone();
        if plan.pickups > 0 {
            let active = self
                .active_trips()
                .find(|trip| !trip.market_order && trip.farm_bed.is_none() && trip.project == index)
                .copied();
            let Some(order) = plan
                .purchase
                .as_ref()
                .filter(|order| order.trips == plan.pickups)
            else {
                self.status = "Wait until the remaining supplies arrive before canceling.".into();
                return;
            };
            if active.is_some_and(|trip| trip.boarded) {
                self.status = "Materials are on their way. Cancel after delivery.".into();
                return;
            }
            for (id, units) in &order.units {
                if let Some(amount) = returned.get_mut(id) {
                    *amount = amount.saturating_sub(*units);
                }
            }
            self.market.refund_construction(
                stock,
                &order.units,
                (order.day, order.price, plan.fare * u64::from(plan.pickups)),
            );
            if let Some(active) = active {
                self.cancel_boarding(active);
            }
        }
        if !stock.sandbox {
            stock.receive(&returned);
        }
        self.plans[index].pickups = 0;
        self.remove_project(index);
        self.status = "Plan canceled. Reserved supplies returned.".into();
    }

    fn begin_change(
        &mut self,
        catalog: &Catalog,
        index: usize,
        kind: Change,
        target: Option<Destination>,
    ) {
        let factor = match kind {
            Change::Salvage => 0.3,
            Change::Demolish => 0.1,
            Change::Move => 0.2,
        };
        let definition = &catalog.projects[&self.plans[index].key];
        let required = (definition.work * factor).max(30.0);
        self.changes.insert(
            index,
            ChangeJob {
                kind,
                target,
                worker: None,
                work: 0.0,
                required,
                retry: 0.0,
                blocked_destination: None,
            },
        );
        self.release_construction(index);
        self.status = format!("{} change queued for a resident.", definition.name);
    }

    fn release_construction(&mut self, index: usize) {
        for worker in &mut self.residents {
            if worker
                .assignment
                .as_ref()
                .is_some_and(|job| job.project == index)
            {
                worker.assignment = None;
                worker.path.clear();
            }
        }
    }

    pub(super) fn remove_project(&mut self, index: usize) {
        self.clear_haul_depot(index);
        self.plans[index].staged = 0;
        self.plans[index].depot = None;
        self.plans[index].removed = true;
        for resident in &mut self.residents {
            if resident.home == Some(index) {
                resident.home = None;
            }
        }
        self.plans[index].purchase = None;
        if self.production.selected == Some(index) {
            self.production.selected = None;
            self.production.open = false;
            self.farming.open = false;
        }
        self.farming.plots.remove(&index);
        self.upkeep.remove(index);
        self.production.growing_sites.remove(&index);
        self.livestock.animals.remove(&index);
        self.utilities.remove_facility(index);
        self.changes.remove(&index);
        self.release_construction(index);
        if self.priority == Some(index) {
            self.priority = None;
        }
    }

    fn dismantling_yield(
        &self,
        catalog: &Catalog,
        index: usize,
        kind: Change,
    ) -> (BTreeMap<String, u32>, BTreeMap<String, u32>) {
        let mut installed = self.plans[index].materials(catalog).clone();
        for (recipe, upgraded) in [
            ("cold_storage", self.utilities.has_cold_storage(index)),
            ("solar_upgrade", self.utilities.has_rooftop_solar(index)),
        ] {
            if upgraded {
                for (id, units) in &catalog.production[recipe].input {
                    *installed.entry(id.clone()).or_default() += units;
                }
            }
        }
        let mut returned = BTreeMap::new();
        let mut lost = BTreeMap::new();
        for (id, amount) in installed {
            let keep = if matches!(id.as_str(), "goats" | "hens" | "bees") {
                amount
            } else if kind == Change::Salvage {
                amount / 2
            } else {
                0
            };
            if keep > 0 {
                returned.insert(id.clone(), keep);
            }
            if amount > keep {
                lost.insert(id, amount - keep);
            }
        }
        (returned, lost)
    }

    fn can_store_dismantling(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        index: usize,
        returned: &BTreeMap<String, u32>,
    ) -> bool {
        let returned_units: u64 = returned.values().map(|units| u64::from(*units)).sum();
        let (used, capacity) = self.storage_without(catalog, stock, Some(index));
        stock.sandbox || used + returned_units <= capacity
    }

    pub(super) fn tick_changes(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        site: ConstructionSite,
        clock: f64,
        dt: f32,
    ) {
        let changes: Vec<_> = self.changes.keys().copied().collect();
        for index in changes {
            let job = self.changes.get_mut(&index).expect("active change");
            if let Some(worker) = job.worker
                && self.residents[worker].health.energy < MIN_DISMANTLING_ENERGY
            {
                self.residents[worker].path.clear();
                job.worker = None;
                job.retry = 0.0;
            }
            job.retry -= f64::from(dt);
            if job.retry > 0.0 {
                continue;
            }
            if let Some(worker) = job.worker {
                let resident = &mut self.residents[worker];
                resident.move_along_path(dt, false);
                if !resident.path.is_empty() {
                    continue;
                }
                let labor = f64::from(dt).min(job.required - job.work);
                job.work += labor;
                resident.health.energy = (resident.health.energy - labor * 0.12).max(0.0);
                if job.work < job.required {
                    continue;
                }
                if let Some(target) = job.target {
                    if let Some(error) =
                        self.move_placement_error(catalog, stock, site, index, target)
                    {
                        let job = self.changes.get_mut(&index).expect("blocked move");
                        job.blocked_destination = Some(error);
                        job.retry = 3.0;
                        continue;
                    }
                    if Self::uses_foundation(&self.plans[index].key) {
                        let terrain = site.terrain.clone().with_foundations(&self.foundations);
                        match self.project_foundation(&terrain, target.position, target.size) {
                            Ok(pad) => self.add_foundation(pad),
                            Err(reason) => {
                                self.changes.remove(&index);
                                self.status = format!("Move canceled. {reason}");
                                continue;
                            }
                        }
                    }
                    self.clear_haul_depot(index);
                    self.plans[index].staged = 0;
                    self.plans[index].depot = None;
                    self.plans[index].position = target.position;
                    self.plans[index].size = target.size;
                    self.plans[index].rotation = target.rotation;
                    self.changes.remove(&index);
                    self.status = "Project relocated.".into();
                    self.record_event(
                        clock,
                        format!(
                            "{} relocated by residents.",
                            catalog.projects[&self.plans[index].key].name
                        ),
                    );
                    continue;
                }
                let kind = job.kind;
                let plan = &self.plans[index];
                let definition = &catalog.projects[&plan.key];
                let (returned, lost) = self.dismantling_yield(catalog, index, kind);
                if !self.can_store_dismantling(catalog, stock, index, &returned) {
                    self.changes.get_mut(&index).expect("blocked change").worker = None;
                    self.status = "Make room in storage for recovered materials.".into();
                    self.changes.get_mut(&index).expect("blocked change").retry = 3.0;
                    continue;
                }
                if !stock.sandbox {
                    stock.receive(&returned);
                }
                self.building_history.push_back(DismantledBuilding {
                    clock,
                    key: plan.key.clone(),
                    kind,
                    recovered: returned,
                    lost,
                });
                if self.building_history.len() > BUILDING_HISTORY_LIMIT {
                    self.building_history.pop_front();
                }
                self.remove_project(index);
                self.status = format!(
                    "{} dismantled. Recovered supplies are in stores.",
                    definition.name
                );
                self.record_event(clock, self.status.clone());
                continue;
            }
            if job.target.is_none() && job.work >= job.required {
                let kind = job.kind;
                let (returned, _) = self.dismantling_yield(catalog, index, kind);
                if !self.can_store_dismantling(catalog, stock, index, &returned) {
                    self.status = "Make room in storage for recovered materials.".into();
                    self.changes.get_mut(&index).expect("blocked change").retry = 3.0;
                    continue;
                }
            }
            let parcel = &self.plans[index];
            self.changes.get_mut(&index).expect("pending change").retry = 2.0;
            for (worker_index, resident) in self.residents.iter().enumerate() {
                if resident.health.energy < MIN_DISMANTLING_ENERGY
                    || resident.assignment.is_some()
                    || resident.health.task.is_some()
                    || resident.town_work.active()
                    || self.production.has_worker(worker_index)
                    || self.gathering.workers_at_site(worker_index)
                    || self.farming.has_worker(worker_index)
                    || self.working_change(worker_index)
                    || self.working_water(worker_index)
                    || self.working_upkeep(worker_index)
                    || self.driver_booked(worker_index)
                {
                    continue;
                }
                let path = project_access_points(parcel, catalog, resident.position)
                    .into_iter()
                    .filter(|&cell| {
                        let point = cell.as_vec2();
                        !self.residents.iter().enumerate().any(|(other, worker)| {
                            other != worker_index
                                && !worker.town_work.active()
                                && (worker.position.distance_squared(point) < 0.55_f32.powi(2)
                                    || worker.path.back() == Some(&point)
                                    || worker.assignment.as_ref().is_some_and(|assignment| {
                                        assignment.project == index && assignment.spot == cell
                                    }))
                        })
                    })
                    .find_map(|cell| self.resident_route(catalog, site, resident.position, cell));
                if let Some(path) = path {
                    self.residents[worker_index].path = path;
                    let job = self.changes.get_mut(&index).expect("assigned change");
                    job.worker = Some(worker_index);
                    job.retry = 0.0;
                    break;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::setup::WorldSetup;

    #[test]
    fn dismantling_uses_another_approach_when_a_resident_blocks_the_entrance() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let camp = IVec2::new(36, 36);
        let terrain = setup.terrain().with_camp(camp);
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp,
        };
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut construction = Construction::default();
        let kitchen = construction.proposed_site(&catalog, "kitchen", IVec2::new(44, 36));
        let entrance = building_entrance(&kitchen, &catalog.projects["kitchen"]).unwrap();
        construction.plans.push(kitchen);
        construction.begin_change(&catalog, 0, Change::Salvage, None);
        construction.residents[1].position = entrance.as_vec2();

        construction.tick_changes(&catalog, &mut stock, site, 0.0, 0.1);

        assert_eq!(construction.changes[&0].worker, Some(0));
        let destination = construction.residents[0].path.back().unwrap();
        assert_ne!(*destination, entrance.as_vec2());
    }

    #[test]
    fn canceling_an_uncollected_blueprint_restores_stock_and_refunds_the_order() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let terrain = setup.terrain();
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut construction = Construction {
            selection: Some("well".into()),
            ..default()
        };
        let before = stock.balance();
        construction.plan(
            &catalog,
            &mut stock,
            site,
            IVec2::new(44, 36),
            TownClock {
                seconds: 0.0,
                round_trip_km: 12,
            },
        );
        assert!(stock.balance() < before);
        construction.cancel_plan(&catalog, &mut stock, 0);
        assert_eq!(stock.balance(), before);
        assert_eq!(stock.available("tank"), 1);
        assert_eq!(construction.market.committed_fares(), 0);
        assert!(construction.plans[0].removed);
        assert!(construction.valid_save(&catalog, &stock));
    }

    #[test]
    fn relocation_grades_the_new_site_and_keeps_the_old_pad_in_the_save() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let rock = Terrain::new(42, 1.0, 1.0);
        let land = Land::default();
        let camp = IVec2::new(36, 36);
        let terrain = rock.with_camp(camp);
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp,
        };
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut construction = Construction {
            selection: Some("gathering".into()),
            ..default()
        };
        construction.plan(
            &catalog,
            &mut stock,
            site,
            IVec2::new(44, 36),
            TownClock {
                seconds: 0.0,
                round_trip_km: 12,
            },
        );
        construction.plans[0].work = catalog.projects["gathering"].work;
        construction.plans[0].delivered = construction.plans[0].loads;
        let destination = IVec2::new(54, 36);
        construction.queue_move(&catalog, &stock, site, destination, 0);
        let original = construction.plans[0].position;
        let mut obstacle = construction.plans[0].clone();
        obstacle.position = destination;
        construction.plans.push(obstacle);
        for _ in 0..2_000 {
            construction.tick_changes(&catalog, &mut stock, site, 42.0, 0.1);
            if construction.changes[&0].blocked_destination.is_some() {
                break;
            }
        }
        construction.production.selected = Some(0);
        assert_eq!(
            construction.lifecycle_status(&catalog, &stock).as_deref(),
            Some("Moving · Another project occupies that space.")
        );
        assert_eq!(construction.plans[0].position, original);
        assert_eq!(construction.foundations.len(), 1);
        assert!(construction.changes[&0].target.is_some());
        let worker = construction.changes[&0].worker.unwrap();
        let energy = construction.residents[worker].health.energy;
        construction.tick_changes(&catalog, &mut stock, site, 42.0, 3.0);
        assert_eq!(construction.residents[worker].health.energy, energy);
        construction.plans.pop();
        for _ in 0..2_000 {
            construction.tick_changes(&catalog, &mut stock, site, 42.0, 0.1);
            if construction.changes.is_empty() {
                break;
            }
        }
        assert_eq!(construction.plans[0].position, destination);
        assert_eq!(construction.foundations.len(), 2);
        let encoded = serde_json::to_string(&construction).unwrap();
        let saved: Construction = serde_json::from_str(&encoded).unwrap();
        assert_eq!(saved.foundations, construction.foundations);
    }

    #[test]
    fn demolishing_a_goat_pen_returns_both_animals_to_stock() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let camp = IVec2::new(36, 36);
        let terrain = setup.terrain().with_camp(camp);
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp,
        };
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut construction = Construction::default();
        let mut pen = construction.proposed_site(&catalog, "goat_pasture", IVec2::new(44, 36));
        pen.work = catalog.projects["goat_pasture"].work;
        pen.delivered = pen.loads;
        construction.plans.push(pen);
        construction.livestock.animals.insert(0, Default::default());
        construction.production.selected = Some(0);
        construction.apply_project_action(&catalog, &mut stock, ProjectAction::Demolish);
        construction.tick_changes(&catalog, &mut stock, site, 42.0, 0.1);
        let original_worker = construction.changes[&0].worker.unwrap();
        construction.changes.get_mut(&0).unwrap().work = 10.0;
        construction.residents[original_worker].health.energy = 24.0;
        construction.tick_changes(&catalog, &mut stock, site, 42.0, 0.1);
        let replacement = construction.changes[&0].worker.unwrap();
        assert_ne!(replacement, original_worker);
        assert!(construction.residents[original_worker].path.is_empty());
        assert_eq!(construction.changes[&0].work, 10.0);

        for _ in 0..2_000 {
            construction.tick_changes(&catalog, &mut stock, site, 42.0, 0.1);
            if construction.plans[0].removed {
                break;
            }
        }

        assert!(construction.plans[0].removed);
        assert!(construction.livestock.animals.is_empty());
        assert_eq!(stock.available("goats"), 2);
        let history = &construction.building_history[0];
        assert_eq!(history.recovered["goats"], 2);
        assert_eq!(history.lost["bamboo"], 10);
        assert!(!history.lost.contains_key("goats"));
    }

    #[test]
    fn resident_salvage_returns_half_the_installed_materials() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let terrain = setup.terrain();
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut construction = Construction {
            selection: Some("gathering".into()),
            ..default()
        };
        construction.plan(
            &catalog,
            &mut stock,
            site,
            IVec2::new(44, 36),
            TownClock {
                seconds: 0.0,
                round_trip_km: 12,
            },
        );
        construction.plans[0].work = catalog.projects["gathering"].work;
        construction.plans[0].delivered = construction.plans[0].loads;
        construction.begin_change(&catalog, 0, Change::Salvage, None);
        let fill = BTreeMap::from([("bamboo".into(), (600 - stock.units()) as u32)]);
        stock.receive(&fill);
        for _ in 0..2_000 {
            construction.tick_changes(&catalog, &mut stock, site, 42.0, 0.1);
            if construction.status == "Make room in storage for recovered materials." {
                break;
            }
        }
        assert_eq!(
            construction.status,
            "Make room in storage for recovered materials."
        );
        assert!(!construction.plans[0].removed);
        assert!(construction.building_history.is_empty());
        construction.production.selected = Some(0);
        assert_eq!(
            construction.lifecycle_status(&catalog, &stock).as_deref(),
            Some("Salvaging · Waiting for storage space")
        );
        construction.tick_changes(&catalog, &mut stock, site, 42.0, 3.0);
        assert_eq!(construction.changes[&0].worker, None);
        stock.reserve_available(&fill);
        for _ in 0..2_000 {
            construction.tick_changes(&catalog, &mut stock, site, 42.0, 0.1);
            if construction.plans[0].removed {
                break;
            }
            assert_eq!(stock.available("wood"), 28);
        }
        assert!(construction.plans[0].removed);
        assert_eq!(stock.available("wood"), 32);
        let json = serde_json::to_string(&construction).unwrap();
        let saved: Construction = serde_json::from_str(&json).unwrap();
        assert!(saved.valid_building_history(&catalog, 42.0));
        assert!(!saved.valid_building_history(&catalog, 41.0));
        let entry = &saved.building_history[0];
        assert_eq!(entry.key, "gathering");
        assert_eq!(entry.recovered["wood"], 4);
        assert_eq!(entry.lost["wood"], 4);
    }
}
