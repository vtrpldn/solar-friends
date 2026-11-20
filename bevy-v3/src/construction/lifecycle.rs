use crate::farming::Stage;

use super::{resident_work::project_access_points, *};

#[derive(Clone, Deserialize, Serialize)]
pub(super) struct Purchase {
    pub units: BTreeMap<String, u32>,
    pub price: u64,
    pub day: u64,
    pub trips: u32,
}

impl Purchase {
    pub(super) fn receive_cargo(&mut self, catalog: &Catalog, cargo: &BTreeMap<String, u32>) {
        let value = |units: &BTreeMap<String, u32>| {
            units.iter().fold(0.0, |total, (id, &quantity)| {
                let item = &catalog.materials[id];
                total + f64::from(quantity) * item.price / f64::from(item.pack)
            })
        };
        let full_value = value(&self.units);
        crate::market::subtract_cargo(&mut self.units, cargo);
        if full_value > 0.0 {
            self.price = (self.price as f64 * (value(&self.units) / full_value)).floor() as u64;
        }
    }
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    blocked_destination: Option<String>,
    #[serde(default)]
    inaccessible_worksite: bool,
}

impl ChangeJob {
    fn action_label(&self) -> &'static str {
        match self.kind {
            Change::Move => "Moving",
            Change::Salvage => "Salvaging",
            Change::Demolish => "Demolishing",
        }
    }

    pub(super) fn status(&self) -> String {
        let action = self.action_label();
        if let Some(reason) = self.blocked_destination.as_deref() {
            format!("{action} · {reason}")
        } else if self.inaccessible_worksite {
            format!("{action} · Needs an accessible work position")
        } else {
            format!("{action} · {:.0}%", self.work / self.required * 100.0)
        }
    }
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
    Copy,
    Cancel,
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

    pub(super) fn change_activity(&self, worker: usize) -> Option<&'static str> {
        self.changes
            .values()
            .find(|job| job.worker == Some(worker))
            .map(ChangeJob::action_label)
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
        let label = if let Some(status) = self.change_status(catalog, stock, index) {
            status
        } else if project.work == 0.0 {
            "X Cancel plan · Z Prioritize".into()
        } else if project.work < catalog.projects[&project.key].work {
            "X Dismantle · Z Prioritize".into()
        } else {
            "Shift+M Move · X Salvage · Shift+X Demolish".into()
        };
        Some(label)
    }

    pub(super) fn change_status(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        index: usize,
    ) -> Option<String> {
        let job = self.changes.get(&index)?;
        if self.sheltering_resident(index) {
            return Some(format!(
                "{} · Waiting for residents to leave",
                job.action_label()
            ));
        }
        if job.target.is_none() && job.work >= job.required {
            let (recovered, _) = self.dismantling_yield(catalog, index, job.kind);
            if !self.can_store_dismantling(catalog, stock, index, &recovered) {
                return Some(format!(
                    "{} · Waiting for storage space",
                    job.action_label()
                ));
            }
        }
        Some(job.status())
    }

    pub fn lifecycle_input(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        keys: &ButtonInput<KeyCode>,
    ) {
        if keys.just_pressed(KeyCode::KeyD)
            && keys.any_pressed([
                KeyCode::ControlLeft,
                KeyCode::ControlRight,
                KeyCode::SuperLeft,
                KeyCode::SuperRight,
            ])
        {
            self.apply_project_action(catalog, stock, ProjectAction::Copy);
            return;
        }
        let shift = keys.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]);
        for (key, action) in [
            (KeyCode::KeyZ, ProjectAction::Prioritize),
            (KeyCode::KeyM, ProjectAction::Move),
            (
                KeyCode::KeyX,
                if self
                    .production
                    .selected
                    .is_some_and(|index| self.plans[index].work == 0.0)
                {
                    ProjectAction::Cancel
                } else if shift {
                    ProjectAction::Demolish
                } else {
                    ProjectAction::Salvage
                },
            ),
        ] {
            if keys.just_pressed(key)
                && (!matches!(action, ProjectAction::Move) || shift)
                && self.project_action_available(catalog, action, stock.sandbox)
            {
                self.apply_project_action(catalog, stock, action);
                break;
            }
        }
    }

    pub fn project_action_available(
        &self,
        catalog: &Catalog,
        action: ProjectAction,
        sandbox: bool,
    ) -> bool {
        if self.menu || self.moving.is_some() || self.production.open || self.farming.open {
            return false;
        }
        self.production.selected.is_some_and(|index| {
            let project = &self.plans[index];
            if matches!(action, ProjectAction::Copy) {
                return !project.removed && (sandbox || catalog.projects[&project.key].repeatable);
            }
            !project.removed
                && !self.changes.contains_key(&index)
                && (!matches!(action, ProjectAction::Cancel) || project.work == 0.0)
                && (!matches!(action, ProjectAction::Prioritize)
                    || project.work < catalog.projects[&project.key].work)
        })
    }

    /// Why a selected-building action is unavailable, when the action still deserves a
    /// dimmed button instead of disappearing.
    pub(crate) fn project_action_issue(
        &self,
        catalog: &Catalog,
        action: ProjectAction,
        sandbox: bool,
    ) -> Option<&'static str> {
        if self.menu || self.moving.is_some() || self.production.open || self.farming.open {
            return None;
        }
        let index = self.production.selected?;
        let project = &self.plans[index];
        if project.removed || self.project_action_available(catalog, action, sandbox) {
            return None;
        }
        if matches!(action, ProjectAction::Copy) {
            return None;
        }
        if self.changes.contains_key(&index) {
            return Some("Residents are already moving or removing this building.");
        }
        let unfinished = project.work < catalog.projects[&project.key].work;
        (matches!(action, ProjectAction::Cancel) && unfinished)
            .then_some("Construction has already started. Salvage or demolish it instead.")
    }

    pub fn apply_project_action(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        action: ProjectAction,
    ) {
        if !self.project_action_available(catalog, action, stock.sandbox) {
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
        if matches!(action, ProjectAction::Copy) {
            let key = project.key.clone();
            let rotation = project.rotation;
            let footprint = rotated_size(project.size, rotation);
            self.choose_blueprint(&key);
            self.rotation = rotation;
            if key == "field" {
                self.field_size = footprint;
            }
            self.production.selected = None;
            self.menu = true;
            return;
        }
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
        let issue = match action {
            ProjectAction::Move => self.move_blocker(index),
            ProjectAction::Cancel => self.cancel_plan_issue(index),
            _ => self.can_change(index),
        };
        if let Some(issue) = issue {
            self.status = issue.into();
            return;
        }
        if matches!(action, ProjectAction::Move) {
            self.moving = Some(index);
            self.rotation = project.rotation;
            self.status.clear();
        } else if matches!(action, ProjectAction::Cancel) {
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

    fn sheltering_resident(&self, index: usize) -> bool {
        self.residents.iter().any(|resident| {
            resident.health.task.as_ref().is_some_and(|task| {
                matches!(task.kind, Need::Rest | Need::Sleep) && task.facility == Some(index + 1)
            })
        })
    }

    pub(super) fn can_change(&self, index: usize) -> Option<&'static str> {
        if self.sheltering_resident(index) {
            return Some("Wait until everyone has left this building.");
        }
        if self.upkeep.servicing(index) {
            return Some("Wait for the resident to finish servicing this asset.");
        }
        if self.water_job_at(index, false) {
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

    fn move_blocker(&self, index: usize) -> Option<&'static str> {
        if self.plans[index].key == "field" || self.farming.plots.contains_key(&index) {
            return Some("Cultivated soil stays on its land. Designate a new field instead.");
        }
        if self.utilities.has_manual_link(index) {
            return Some("Disconnect utility lines before relocating this building.");
        }
        self.can_change(index).or_else(|| {
            self.water_job_at(index, true)
                .then_some("Wait for the queued water job to finish.")
        })
    }

    pub(super) fn queue_move(
        &mut self,
        catalog: &Catalog,
        stock: &Stock,
        site: ConstructionSite,
        position: IVec2,
        index: usize,
    ) {
        if let Some(issue) = self.move_blocker(index) {
            self.status = issue.into();
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

    pub(crate) fn selected_cancel_issue(&self) -> Option<&'static str> {
        self.production
            .selected
            .and_then(|index| self.cancel_plan_issue(index))
    }

    fn cancel_plan_issue(&self, index: usize) -> Option<&'static str> {
        let plan = &self.plans[index];
        if plan.work > 0.0 {
            return Some("Construction has already started.");
        }
        if self.construction_delivery_at(index)
            || self
                .booked_construction_trip(index)
                .is_some_and(|trip| trip.boarded)
        {
            return Some("Materials are on their way. Cancel after delivery.");
        }
        if plan.pickups > 0
            && plan
                .purchase
                .as_ref()
                .is_none_or(|order| order.trips != plan.pickups)
        {
            return Some("Wait until the remaining supplies arrive before canceling.");
        }
        self.can_change(index)
    }

    fn cancel_plan(&mut self, catalog: &Catalog, stock: &mut Stock, index: usize) {
        let plan = &self.plans[index];
        let mut returned = plan.materials(catalog).clone();
        if plan.pickups > 0 {
            let active = self.booked_construction_trip(index).copied();
            let order = plan.purchase.as_ref().expect("validated pending purchase");
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
                self.cancel_boarding_pickup(active, index, stock);
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
                inaccessible_worksite: false,
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
            self.farming.close();
        }
        self.farming.plots.remove(&index);
        self.upkeep.remove(index);
        self.production.growing_sites.remove(&index);
        self.livestock.animals.remove(&index);
        self.disconnect_water_source(index);
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
        let plan = &self.plans[index];
        let mut installed = plan.materials(catalog).clone();
        if let Some(goats) = self.installed_goats(catalog, index) {
            installed.extend(goats.clone());
        }
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
            let keep = if plan.work == 0.0 || matches!(id.as_str(), "goats" | "hens" | "bees") {
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
            if self.sheltering_resident(index) {
                let job = self.changes.get_mut(&index).expect("active change");
                if let Some(worker) = job.worker.take()
                    && self.residents[worker].health.task.is_none()
                {
                    self.residents[worker].path.clear();
                }
                job.retry = 0.0;
                continue;
            }
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
                resident.experience += labor;
                resident.health.energy = (resident.health.energy - labor * 0.12).max(0.0);
                if job.work < job.required {
                    continue;
                }
                if let Some(target) = job.target {
                    if let Some(error) =
                        self.move_placement_error(catalog, stock, site, index, target)
                    {
                        let job = self.changes.get_mut(&index).expect("blocked move");
                        job.blocked_destination = Some(error.into());
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
            let mut inaccessible_worksite = false;
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
                    inaccessible_worksite = false;
                    break;
                }
                inaccessible_worksite = true;
            }
            self.changes
                .get_mut(&index)
                .expect("active change")
                .inaccessible_worksite = inaccessible_worksite;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::setup::WorldSetup;

    #[test]
    fn blocked_building_actions_explain_themselves() {
        let catalog = Catalog::default();
        let mut village = Construction::default();
        let kitchen = village.proposed_site(&catalog, "kitchen", IVec2::new(44, 36));
        village.plans.push(kitchen);
        village.production.selected = Some(0);
        assert_eq!(
            village.project_action_issue(&catalog, ProjectAction::Cancel, false),
            None
        );
        village.plans[0].work = 1.0;
        assert_eq!(
            village.project_action_issue(&catalog, ProjectAction::Cancel, false),
            Some("Construction has already started. Salvage or demolish it instead.")
        );
        village.plans[0].work = catalog.projects["kitchen"].work;
        assert_eq!(
            village.project_action_issue(&catalog, ProjectAction::Cancel, false),
            None
        );
        village.begin_change(&catalog, 0, Change::Salvage, None);
        assert_eq!(
            village.project_action_issue(&catalog, ProjectAction::Move, false),
            Some("Residents are already moving or removing this building.")
        );
    }

    #[test]
    fn relocation_requires_disconnecting_manual_utilities() {
        let catalog = Catalog::default();
        let mut village = Construction::default();
        let kitchen = village.proposed_site(&catalog, "kitchen", IVec2::new(44, 36));
        village.plans.push(kitchen);
        assert_eq!(village.move_blocker(0), None);
        village.utilities.install_power_link(0, 1);
        assert_eq!(
            village.move_blocker(0),
            Some("Disconnect utility lines before relocating this building.")
        );
    }

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
    fn inaccessible_dismantling_reports_its_blocker_and_retries() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let camp = IVec2::splat(36);
        let terrain = setup.terrain().with_camp(camp);
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp,
        };
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut village = Construction::default();
        let kitchen = village.proposed_site(&catalog, "kitchen", IVec2::new(44, 36));
        let approaches = project_access_points(&kitchen, &catalog, Vec2::ZERO);
        village.plans.push(kitchen);
        for cell in approaches {
            village.plans.push(Construction::proposal(
                &catalog,
                "wash-station",
                cell,
                IVec2::ONE,
                0,
            ));
        }
        village.begin_change(&catalog, 0, Change::Salvage, None);
        village.tick_changes(&catalog, &mut stock, site, 0.0, 0.1);

        assert!(village.changes[&0].worker.is_none());
        let (_, projects) = village.projects_panel(&catalog, &stock, 0, true, false, 0.0);
        assert!(projects.contains("Salvaging · Needs an accessible work position"));

        village.plans.truncate(1);
        village.tick_changes(&catalog, &mut stock, site, 2.0, 2.0);
        assert!(village.changes[&0].worker.is_some());
        assert!(!village.changes[&0].inaccessible_worksite);
    }

    #[test]
    fn queued_dismantling_waits_for_a_sheltering_resident() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let camp = IVec2::splat(36);
        let terrain = setup.terrain().with_camp(camp);
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp,
        };
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut village = Construction::default();
        let key = "canvas-tent-teal";
        let mut tent = village.proposed_site(&catalog, key, IVec2::new(44, 36));
        tent.work = catalog.projects[key].work;
        tent.delivered = tent.loads;
        village.plans.push(tent);
        village.begin_change(&catalog, 0, Change::Demolish, None);
        village.tick_changes(&catalog, &mut stock, site, 0.0, 0.1);
        let worker = village.changes[&0].worker.unwrap();
        let sleeper = (worker + 1) % village.residents.len();
        village.residents[sleeper].health.task = Some(crate::residents::NeedTask {
            kind: Need::Sleep,
            facility: Some(1),
            elapsed: 1.0,
            started_at: Some(0.0),
            duration: 30.0,
            water: 0.0,
            returning: false,
            partner: None,
            conversation: None,
        });

        village.tick_changes(&catalog, &mut stock, site, 1.0, 0.1);
        assert_eq!(village.changes[&0].work, 0.0);
        assert!(village.changes[&0].worker.is_none());
        assert!(village.residents[worker].path.is_empty());
        assert_eq!(
            village.can_change(0),
            Some("Wait until everyone has left this building.")
        );
        assert_eq!(
            village.change_status(&catalog, &stock, 0).as_deref(),
            Some("Demolishing · Waiting for residents to leave")
        );

        village.residents[sleeper].health.task = None;
        village.tick_changes(&catalog, &mut stock, site, 2.0, 0.1);
        assert!(village.changes[&0].worker.is_some());
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
        construction.request_project_action(&catalog, &mut stock, 0, ProjectAction::Cancel);
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
        let candidate = construction.proposed_site(&catalog, "wash-station", destination);
        assert_eq!(
            construction.placement_error(
                site.terrain,
                site.land,
                site.camp,
                &candidate,
                &catalog.projects["wash-station"],
                (&catalog, stock.sandbox, None),
            ),
            Some("That space is reserved for a building relocation.")
        );
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
        let mut construction: Construction =
            serde_json::from_str(&serde_json::to_string(&construction).unwrap()).unwrap();
        construction.production.selected = Some(0);
        assert_eq!(
            construction.lifecycle_status(&catalog, &stock).as_deref(),
            Some("Moving · Another project occupies that space.")
        );
        let (_, projects) = construction.projects_panel(&catalog, &stock, 0, true, false, 0.0);
        assert!(projects.contains("Moving · Another project occupies that space."));
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
        let remaining_work = construction.changes[&0].required - 10.0;
        let original_worker = construction.changes[&0].worker.unwrap();
        construction.changes.get_mut(&0).unwrap().work = 10.0;
        construction.residents[original_worker].health.energy = 24.0;
        construction.tick_changes(&catalog, &mut stock, site, 42.0, 0.1);
        let replacement = construction.changes[&0].worker.unwrap();
        assert_ne!(replacement, original_worker);
        assert_eq!(
            construction.resident_action(&catalog, replacement),
            "Demolishing"
        );
        assert!(construction.residents[original_worker].path.is_empty());
        assert_eq!(construction.changes[&0].work, 10.0);

        for _ in 0..2_000 {
            construction.tick_changes(&catalog, &mut stock, site, 42.0, 0.1);
            if construction.plans[0].removed {
                break;
            }
        }

        assert!(construction.plans[0].removed);
        let experience: f64 = construction
            .residents
            .iter()
            .map(|worker| worker.experience)
            .sum();
        assert!((experience - remaining_work).abs() < 1e-8);
        assert!(construction.livestock.animals.is_empty());
        assert_eq!(stock.available("goats"), 2);
        let history = &construction.building_history[0];
        assert_eq!(history.recovered["goats"], 2);
        assert_eq!(history.lost["bamboo"], 10);
        assert!(!history.lost.contains_key("goats"));
    }

    #[test]
    fn dismantling_an_unstarted_project_returns_its_full_reserved_bill() {
        let catalog = Catalog::default();
        let mut construction = Construction::default();
        let mut project = construction.proposed_site(&catalog, "gathering", IVec2::new(44, 36));
        let paid = BTreeMap::from([("wood".into(), 7)]);
        project.materials_paid = Some(paid.clone());
        construction.plans.push(project);

        for kind in [Change::Salvage, Change::Demolish] {
            let (recovered, lost) = construction.dismantling_yield(&catalog, 0, kind);
            assert_eq!(recovered, paid);
            assert!(lost.is_empty());
        }

        construction.plans[0].work = 1.0;
        let (recovered, lost) = construction.dismantling_yield(&catalog, 0, Change::Salvage);
        assert_eq!(recovered["wood"], 3);
        assert_eq!(lost["wood"], 4);
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
        let (_, projects) = construction.projects_panel(&catalog, &stock, 0, true, false, 0.0);
        assert!(projects.contains("Salvaging · Waiting for storage space"));
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
