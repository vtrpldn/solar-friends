use crate::farming::Stage;

use super::{resident_work::approach_points, *};

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

#[derive(Deserialize, Serialize)]
pub(super) struct ChangeJob {
    kind: Change,
    pub target: Option<Destination>,
    pub worker: Option<usize>,
    pub work: f64,
    pub required: f64,
    retry: f64,
}

#[derive(Deserialize, Serialize)]
pub(super) struct Destination {
    pub position: IVec2,
    pub size: IVec2,
    pub rotation: u8,
}

impl Construction {
    pub fn working_change(&self, worker: usize) -> bool {
        self.changes.values().any(|job| job.worker == Some(worker))
    }

    pub fn construction_notice(&self) -> &str {
        &self.status
    }

    pub fn lifecycle_status(&self, catalog: &Catalog) -> Option<String> {
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
        if self.menu || self.moving.is_some() || self.production.open || self.farming.open {
            return;
        }
        let Some(index) = self.production.selected else {
            return;
        };
        let project = &self.plans[index];
        if project.removed || self.changes.contains_key(&index) {
            return;
        }
        let finished = project.work >= catalog.projects[&project.key].work;
        if keys.just_pressed(KeyCode::KeyZ) && !finished {
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
        let move_requested = keys.just_pressed(KeyCode::KeyM)
            && keys.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]);
        let salvage = keys.just_pressed(KeyCode::KeyX);
        if !move_requested && !salvage {
            return;
        }
        if let Some(issue) = self.can_change(index) {
            self.status = issue.into();
            return;
        }
        if move_requested {
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
            let mode = if keys.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]) {
                Change::Demolish
            } else {
                Change::Salvage
            };
            self.begin_change(catalog, index, mode, None);
        }
    }

    fn can_change(&self, index: usize) -> Option<&'static str> {
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
        let proposal = Blueprint {
            key: plan.key.clone(),
            position,
            size: target.size,
            rotation: target.rotation,
            loads: plan.loads,
            delivered: plan.delivered,
            work: plan.work,
            pickups: plan.pickups,
            fare: plan.fare,
            removed: false,
            purchase: None,
        };
        let ConstructionSite {
            terrain,
            land,
            camp,
        } = site;
        if let Some(error) = self.placement_error(
            terrain,
            land,
            camp,
            &proposal,
            definition,
            (catalog, stock.sandbox, Some(index)),
        ) {
            self.status = error.into();
            return;
        }
        self.begin_change(catalog, index, Change::Move, Some(target));
        self.moving = None;
    }

    fn cancel_plan(&mut self, catalog: &Catalog, stock: &mut Stock, index: usize) {
        let plan = &self.plans[index];
        let mut returned = catalog.projects[&plan.key].materials.clone();
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

    fn remove_project(&mut self, index: usize) {
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

    pub(super) fn tick_changes(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        site: ConstructionSite,
        dt: f32,
    ) {
        let changes: Vec<_> = self.changes.keys().copied().collect();
        for index in changes {
            self.changes.get_mut(&index).expect("active change").retry -= f64::from(dt);
            if self.changes[&index].retry > 0.0 {
                continue;
            }
            if let Some(worker) = self.changes[&index].worker {
                let resident = &mut self.residents[worker];
                resident.move_along_path(dt, false);
                if !resident.path.is_empty() {
                    continue;
                }
                let job = self.changes.get_mut(&index).expect("working project");
                job.work = (job.work + f64::from(dt)).min(job.required);
                resident.health.energy = (resident.health.energy - f64::from(dt) * 0.12).max(0.0);
                if job.work < job.required {
                    continue;
                }
                if let Some(target) = job.target.take() {
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
                    self.plans[index].position = target.position;
                    self.plans[index].size = target.size;
                    self.plans[index].rotation = target.rotation;
                    self.changes.remove(&index);
                    self.status = "Project relocated.".into();
                    continue;
                }
                let kind = job.kind;
                let plan = &self.plans[index];
                let definition = &catalog.projects[&plan.key];
                let mut installed = definition.materials.clone();
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
                let returned: BTreeMap<_, _> = installed
                    .into_iter()
                    .map(|(id, amount)| {
                        let keep = if matches!(id.as_str(), "goats" | "hens" | "bees") {
                            amount
                        } else if kind == Change::Salvage {
                            amount / 2
                        } else {
                            0
                        };
                        (id, keep)
                    })
                    .filter(|(_, units)| *units > 0)
                    .collect();
                let returned_units: u64 = returned.values().map(|units| u64::from(*units)).sum();
                let (used, capacity) = self.storage(catalog, stock);
                let lost_storage =
                    if matches!(definition.kind.as_str(), "warehouse" | "covered-storage") {
                        600
                    } else {
                        0
                    };
                if !stock.sandbox && used + returned_units > capacity.saturating_sub(lost_storage) {
                    self.status = "Make room in storage for recovered materials.".into();
                    self.changes.get_mut(&index).expect("blocked change").retry = 3.0;
                    continue;
                }
                if !stock.sandbox {
                    stock.receive(&returned);
                }
                self.remove_project(index);
                self.status = format!(
                    "{} dismantled. Recovered supplies are in stores.",
                    definition.name
                );
                continue;
            }
            let parcel = &self.plans[index];
            self.changes.get_mut(&index).expect("pending change").retry = 2.0;
            for (worker_index, resident) in self.residents.iter().enumerate() {
                if resident.assignment.is_some()
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
                let path = approach_points(parcel.position, parcel.size, resident.position)
                    .into_iter()
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
        for _ in 0..2_000 {
            construction.tick_changes(&catalog, &mut stock, site, 0.1);
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
        for _ in 0..2_000 {
            construction.tick_changes(&catalog, &mut stock, site, 0.1);
            if construction.plans[0].removed {
                break;
            }
            assert_eq!(stock.available("wood"), 28);
        }
        assert!(construction.plans[0].removed);
        assert_eq!(stock.available("wood"), 32);
    }
}
