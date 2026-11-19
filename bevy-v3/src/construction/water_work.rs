use crate::{farming::Stage, resident_animation::Motion};

use super::{resident_work::approach_points, *};

const LOAD: f64 = 12.0;
const EPSILON: f64 = 0.00001;
const CHANNELS: [&str; 4] = ["Drinking", "Irrigation", "Greywater", "Sewage"];

#[derive(Clone, Copy, Deserialize, Serialize)]
pub enum WaterAction {
    Carry {
        source: Option<usize>,
        channel: usize,
    },
    Purify,
    Sanitation,
}

#[derive(Clone, Copy, Deserialize, Serialize)]
enum WaterPhase {
    Approach,
    Deliver,
    Staged(IVec2),
}

#[derive(Deserialize, Serialize)]
pub(super) struct WaterJob {
    action: WaterAction,
    phase: WaterPhase,
    worker: Option<usize>,
    carried: f64,
    work: f64,
    retry: f64,
    #[serde(default)]
    waiting_for_access: bool,
}

impl WaterJob {
    pub(super) fn assigned_to(&self, index: usize) -> bool {
        self.worker == Some(index)
    }

    pub(super) fn label(&self) -> &'static str {
        match (self.action, self.phase) {
            (WaterAction::Purify, _) => "Purifying water by hand",
            (WaterAction::Sanitation, _) => "Servicing sealed waste tanks",
            (_, WaterPhase::Deliver) => "Carrying water to the reservoir",
            (_, WaterPhase::Staged(_)) => "Sealed water waiting beside the reservoir",
            _ => "Collecting water",
        }
    }
}

impl Construction {
    pub fn queue_water(&mut self, target: usize, action: WaterAction) -> Result<(), &'static str> {
        if self.water_jobs.contains_key(&target) {
            return Err("A water job is already queued here.");
        }
        let site = self
            .utilities
            .water_site(target)
            .ok_or("Select a water facility.")?;
        if !site.enabled || target > 0 && self.changes.contains_key(&(target - 1)) {
            return Err("Choose an open facility.");
        }
        match action {
            WaterAction::Carry { source, channel } => {
                if channel >= CHANNELS.len() || source == Some(target) {
                    return Err("Choose different water endpoints.");
                }
                if source.is_none() && channel != 1 {
                    return Err("River water must be filtered before drinking.");
                }
                if site.capacity[channel] <= 0.0 {
                    return Err("The destination cannot store that water class.");
                }
                if site.space(channel) < 0.1 {
                    return Err("Destination is full.");
                }
                if let Some(id) = source {
                    let source = self
                        .utilities
                        .water_site(id)
                        .ok_or("Select a water source.")?;
                    if !source.enabled
                        || source.levels[channel] < 0.1
                        || id > 0 && self.changes.contains_key(&(id - 1))
                    {
                        return Err("Source is empty or closed.");
                    }
                }
            }
            WaterAction::Purify => {
                if site.capacity[0] <= 0.0 || site.capacity[1] <= 0.0 {
                    return Err(
                        "Choose a reservoir with separate untreated and drinking-water storage.",
                    );
                }
                if site.levels[1] < 1.0 {
                    return Err("Bring untreated water here first.");
                }
                if site.space(0) < 1.0 {
                    return Err("Drinking-water storage is full.");
                }
            }
            WaterAction::Sanitation if site.levels[2] + site.levels[3] < 1.0 => {
                return Err("There is no accumulated waste to remove.");
            }
            WaterAction::Sanitation => {}
        }
        self.water_jobs.insert(
            target,
            WaterJob {
                action,
                phase: WaterPhase::Approach,
                worker: None,
                carried: 0.0,
                work: 0.0,
                retry: 0.0,
                waiting_for_access: false,
            },
        );
        Ok(())
    }

    pub(super) fn valid_water_jobs(&self) -> bool {
        let mut workers = [false; 5];
        self.water_jobs.iter().all(|(&target, job)| {
            let Some(site) = self.utilities.water_site(target) else {
                return false;
            };
            let numeric = (0.0..=LOAD).contains(&job.carried)
                && (0.0..=45.0).contains(&job.work)
                && job.retry.is_finite()
                && job.retry >= 0.0;
            let action = match job.action {
                WaterAction::Carry { source, channel } => {
                    channel < CHANNELS.len()
                        && site.capacity[channel] > 0.0
                        && source != Some(target)
                        && source.map_or(channel == 1, |id| self.utilities.water_site(id).is_some())
                }
                _ => job.carried == 0.0 && matches!(job.phase, WaterPhase::Approach),
            };
            let worker = job
                .worker
                .is_none_or(|id| id < workers.len() && !std::mem::replace(&mut workers[id], true));
            numeric && action && worker
        })
    }

    pub(super) fn water_job_at(&self, index: usize) -> bool {
        let id = index + 1;
        self.water_jobs.contains_key(&id) || self.water_jobs.values().any(|job| {
            matches!(job.action, WaterAction::Carry { source: Some(source), .. } if source == id)
        })
    }

    pub(super) fn working_water(&self, worker: usize) -> bool {
        self.water_jobs
            .values()
            .any(|job| job.worker == Some(worker))
    }

    pub(super) fn water_motion(&self, index: usize) -> Option<Motion> {
        let job = self
            .water_jobs
            .values()
            .find(|job| job.worker == Some(index))?;
        Some(match job.phase {
            WaterPhase::Deliver => Motion::CarryWalk,
            _ if !self.residents[index].path.is_empty() => Motion::Walk,
            _ => Motion::Work,
        })
    }

    pub(super) fn water_activity(&self, index: usize) -> Option<&'static str> {
        self.water_jobs
            .values()
            .find(|job| job.worker == Some(index))
            .map(WaterJob::label)
    }

    pub(super) fn water_route_blocked(&self, job: &WaterJob, clock: f64) -> bool {
        (job.waiting_for_access && job.retry > clock)
            || job
                .worker
                .is_some_and(|index| self.residents[index].waiting_for_route())
    }

    pub fn water_panel(
        &self,
        target: usize,
        source: Option<usize>,
        channel: usize,
        clock: f64,
    ) -> String {
        let utilities = &self.utilities;
        let name = |id| {
            utilities
                .water_site(id)
                .map_or("Unavailable", |site| site.kind)
        };
        let Some(site) = utilities.water_site(target) else {
            return "Click a water facility to select it.".into();
        };
        let mut text = format!(
            "Target · {} #{target} · {}\nClick target · Shift-click source · C Camp\n1 Drinking · 2 Irrigation · 3 Greywater · 4 Sewage\nR River · T Carry from {} · Y Purify · K Service waste\nM Drinking reserve {} · L Sanitation {}",
            site.kind,
            CHANNELS[channel],
            source.map_or("selected source", name),
            if site.maintain_fresh { "on" } else { "off" },
            if site.maintain_sanitation {
                "on"
            } else {
                "off"
            },
        );
        use std::fmt::Write;
        for (channel, label) in CHANNELS.iter().enumerate() {
            if site.capacity[channel] > 0.0 {
                let _ = write!(
                    text,
                    "\n{label} {:.1}/{:.0} L",
                    site.levels[channel], site.capacity[channel]
                );
            }
        }
        if let Some(job) = self.water_jobs.get(&target) {
            let status = if self.water_route_blocked(job, clock) {
                "Waiting for access"
            } else {
                job.label()
            };
            let _ = write!(text, "\n{status} · {:.1} L carried", job.carried);
        }
        text
    }

    fn water_route(
        &self,
        worker: usize,
        catalog: &Catalog,
        site: ConstructionSite,
        id: usize,
    ) -> Option<VecDeque<Vec2>> {
        let facility = self.utilities.water_site(id)?;
        let from = self.residents[worker].position;
        if id == 0 {
            return self.resident_route(catalog, site, from, SUPPLY_SPOTS[worker]);
        }
        approach_points(facility.location, facility.size, from)
            .into_iter()
            .find_map(|cell| self.resident_route(catalog, site, from, cell))
    }

    fn river_route(
        &self,
        worker: usize,
        catalog: &Catalog,
        site: ConstructionSite,
    ) -> Option<VecDeque<Vec2>> {
        let from = self.residents[worker].position;
        let mut access = (-28..92)
            .flat_map(|row| {
                let (center, width) = site.terrain.river(f64::from(row - 32) * 2.0);
                [
                    IVec2::new((32.0 + (center - width - 4.0) / 2.0).floor() as i32, row),
                    IVec2::new((32.0 + (center + width + 4.0) / 2.0).ceil() as i32, row),
                ]
            })
            .collect::<Vec<_>>();
        access.sort_by(|a, b| {
            a.as_vec2()
                .distance_squared(from)
                .total_cmp(&b.as_vec2().distance_squared(from))
        });
        access
            .into_iter()
            .find_map(|cell| self.resident_route(catalog, site, from, cell))
    }

    pub(super) fn maintain_water(&mut self, catalog: &Catalog, sandbox: bool) {
        let ids = self.utilities.water_ids().collect::<Vec<_>>();
        for id in ids {
            if self.water_jobs.contains_key(&id) {
                continue;
            }
            let site = self.utilities.water_site(id).expect("water facility");
            if !site.enabled {
                continue;
            }
            let reserve = site.capacity[0].min(50.0);
            let below_reserve = site.levels[0] < reserve - (reserve * 0.25).min(12.0);
            let irrigate = id
                .checked_sub(1)
                .and_then(|id| self.farming.plots.get(&id))
                .is_some_and(|plot| {
                    site.levels[1] < (site.capacity[1] * 0.5).min(12.0)
                        && plot.beds.iter().any(|bed| {
                            bed.irrigation
                                && matches!(bed.stage, Stage::Growing | Stage::Harvestable)
                        })
                });
            let crop_or_grove = irrigate
                || id.checked_sub(1).is_some_and(|site_id| {
                    site.capacity[1] > 0.0
                        && site.levels[1] < (site.capacity[1] * 0.5).min(12.0)
                        && self
                            .production
                            .growing_sites
                            .get(&site_id)
                            .is_some_and(|soil| soil.irrigation.target() > 0.0)
                        && self.production.jobs.iter().any(|job| {
                            job.site == site_id
                                && job.phase == crate::production::Phase::Growing
                                && matches!(
                                    job.recipe.as_str(),
                                    "fruit" | "bananas" | "wood" | "bamboo"
                                )
                        })
                });
            let batch_water = id.checked_sub(1).is_some_and(|site_id| {
                site.capacity[1] > 0.0
                    && site.levels[0] + site.levels[1] < 4.0
                    && self.production.jobs.iter().any(|job| {
                        job.site == site_id
                            && !job.watered
                            && matches!(job.recipe.as_str(), "fruit" | "bananas")
                    })
            });
            let needs_drinking_water = !sandbox
                && id.checked_sub(1).is_some_and(|target| {
                    let animal_care = catalog.animal_rations.get(site.kind).is_some_and(|ration| {
                        site.levels[0] + 1e-8 < ration.water
                            && self
                                .livestock
                                .animals
                                .get(&target)
                                .is_some_and(|pen| pen.fed_days(ration) <= 0.25)
                    });
                    animal_care
                        || self.production.jobs.iter().any(|job| {
                            job.site == target
                                && !job.watered
                                && job.phase != crate::production::Phase::Return
                                && catalog.production[&job.recipe].water > site.levels[0] + 1e-8
                        })
                });
            let action = if needs_drinking_water {
                self.utilities
                    .water_sources()
                    .filter(|(source, _, _)| *source != id)
                    .min_by_key(|(_, location, _)| location.distance_squared(site.location))
                    .map(|(source, _, _)| WaterAction::Carry {
                        source: Some(source),
                        channel: 0,
                    })
            } else if site.maintain_fresh && below_reserve {
                if site.levels[1] >= site.space(0).min(12.0)
                    || (site.levels[0] < 10.0 && site.levels[1] >= 1.0)
                {
                    Some(WaterAction::Purify)
                } else {
                    let source = self
                        .utilities
                        .water_ids()
                        .filter(|&other| other != id)
                        .filter_map(|other| {
                            let node = self.utilities.water_site(other)?;
                            (node.enabled
                                && node.levels[1] >= 1.0
                                && matches!(
                                    node.kind,
                                    "groundwater-well" | "rain-barrel" | "water-pump"
                                ))
                            .then_some((node.location.distance_squared(site.location), other))
                        })
                        .min()
                        .map(|(_, source)| source);
                    Some(WaterAction::Carry { source, channel: 1 })
                }
            } else if site.maintain_sanitation
                && [2, 3]
                    .into_iter()
                    .any(|i| site.capacity[i] > 0.0 && site.levels[i] >= site.capacity[i] * 0.5)
            {
                Some(WaterAction::Sanitation)
            } else if crop_or_grove || batch_water {
                Some(WaterAction::Carry {
                    source: None,
                    channel: 1,
                })
            } else {
                None
            };
            if let Some(action) = action {
                let _ = self.queue_water(id, action);
            }
        }
    }

    #[cfg(test)]
    pub(super) fn tick_water_work(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        site: ConstructionSite,
        clock: f64,
        dt: f32,
    ) {
        self.maintain_water(catalog, stock.sandbox);
        self.tick_water_group(catalog, stock, site, clock, dt, None);
    }

    pub(super) fn tick_water_group(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        site: ConstructionSite,
        clock: f64,
        dt: f32,
        group: Option<WorkGroup>,
    ) {
        let ids = self
            .water_jobs
            .iter()
            .filter_map(|(&id, job)| {
                let work = if matches!(job.action, WaterAction::Sanitation) {
                    WorkGroup::Maintenance
                } else {
                    WorkGroup::Essentials
                };
                group.is_none_or(|group| group == work).then_some(id)
            })
            .collect::<Vec<_>>();
        for id in ids {
            // Keep the slot occupied while choosing a worker for another job.
            let mut job = self.water_jobs.remove(&id).expect("queued water job");
            if !self.step_water(id, &mut job, (catalog, stock), site, clock, dt) {
                self.water_jobs.insert(id, job);
            }
        }
    }

    fn step_water(
        &mut self,
        id: usize,
        job: &mut WaterJob,
        (catalog, stock): (&Catalog, &mut Stock),
        site: ConstructionSite,
        clock: f64,
        dt: f32,
    ) -> bool {
        if self.reservation_pass.is_some() && job.worker.is_some() {
            return false;
        }
        if !self
            .utilities
            .water_site(id)
            .is_some_and(|node| node.enabled)
        {
            if let Some(worker) = job.worker.take() {
                if matches!(job.phase, WaterPhase::Deliver) {
                    job.phase =
                        WaterPhase::Staged(self.residents[worker].position.round().as_ivec2());
                }
                self.residents[worker].path.clear();
            }
            return false;
        }
        let worker = if let Some(worker) = job.worker {
            worker
        } else {
            if clock < job.retry {
                return false;
            }
            if self.reservation_pass.is_none() {
                job.retry = clock + 3.0;
                job.waiting_for_access = false;
            }
            if let (WaterAction::Carry { channel, .. }, WaterPhase::Staged(_)) =
                (job.action, job.phase)
                && !self
                    .utilities
                    .water_site(id)
                    .is_some_and(|node| node.space(channel) > EPSILON)
            {
                return false;
            }
            let mut attempted_route = false;
            let picked = (0..self.residents.len())
                .filter(|&index| {
                    self.work_candidate(index) && self.residents[index].health.energy >= 25.0
                })
                .find_map(|index| {
                    attempted_route = true;
                    let path = match (job.action, job.phase) {
                        (_, WaterPhase::Staged(point)) => self.resident_route(
                            catalog,
                            site,
                            self.residents[index].position,
                            point,
                        ),
                        (WaterAction::Carry { source: None, .. }, _) => {
                            self.river_route(index, catalog, site)
                        }
                        (
                            WaterAction::Carry {
                                source: Some(source),
                                ..
                            },
                            _,
                        ) => self.water_route(index, catalog, site, source),
                        _ => self.water_route(index, catalog, site, id),
                    }?;
                    Some((index, path))
                });
            let Some((index, path)) = picked else {
                if self.reservation_pass.is_none() {
                    job.waiting_for_access = attempted_route;
                }
                return false;
            };
            job.waiting_for_access = false;
            self.residents[index].path = path;
            self.residents[index].leisure.visit = None;
            job.worker = Some(index);
            index
        };

        if self.reservation_pass.is_some() {
            return false;
        }
        let carrying = matches!(job.phase, WaterPhase::Deliver);
        let boost = if carrying && !self.residents[worker].path.is_empty() {
            stock.use_tool(
                worker,
                "bucket",
                ToolTask::Water(id),
                f64::from(dt),
                self.repairing(catalog, "bucket"),
            )
        } else {
            1.0
        };
        self.residents[worker].move_with_pace(dt, carrying, boost as f32);
        if !self.residents[worker].path.is_empty() {
            return false;
        }
        if let WaterAction::Carry { source, channel } = job.action {
            if matches!(job.phase, WaterPhase::Deliver) {
                job.carried -= self.utilities.deliver_water(id, channel, job.carried);
                if job.carried > EPSILON {
                    job.phase =
                        WaterPhase::Staged(self.residents[worker].position.round().as_ivec2());
                    job.worker = None;
                    return false;
                }
                return true;
            }
            let Some(path) = self.water_route(worker, catalog, site, id) else {
                job.worker = None;
                job.waiting_for_access = true;
                job.retry = clock + 3.0;
                return false;
            };
            if matches!(job.phase, WaterPhase::Approach) {
                let capacity = self
                    .utilities
                    .water_site(id)
                    .map_or(0.0, |node| node.space(channel));
                job.carried = self
                    .utilities
                    .take_water(source, channel, capacity.min(LOAD));
                if job.carried <= EPSILON {
                    job.worker = None;
                    return false;
                }
            }
            self.residents[worker].path = path;
            job.phase = WaterPhase::Deliver;
            return false;
        }

        self.residents[worker].health.energy =
            (self.residents[worker].health.energy - f64::from(dt) * 0.06).max(0.0);
        let boost = if matches!(job.action, WaterAction::Sanitation) {
            stock.use_tool(
                worker,
                "cleaning-kit",
                ToolTask::Water(id),
                f64::from(dt),
                self.repairing(catalog, "cleaning-kit"),
            )
        } else {
            1.0
        };
        job.work += f64::from(dt) * boost;
        match job.action {
            WaterAction::Purify if job.work >= 30.0 => self.utilities.purify_water(id),
            WaterAction::Sanitation if job.work >= 45.0 => self.utilities.service_waste(id),
            _ => return false,
        }
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::setup::WorldSetup;

    #[test]
    fn a_dry_coop_receives_drinking_water_for_automatic_care() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let terrain = setup.terrain();
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        let mut town = Construction::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let ration = &catalog.animal_rations["coop"];
        stock.receive(&BTreeMap::from([("fodder".into(), ration.fodder)]));
        let mut coop = town.proposed_site(&catalog, "coop", IVec2::new(40, -13));
        coop.work = catalog.projects["coop"].work;
        town.plans.push(coop);
        town.tick_services(&catalog, &setup, &mut stock, 0.0, 0.1);
        town.utilities.take_water(Some(1), 0, 6.0);
        town.tick_animals(&catalog, &mut stock, &land, 0.0, 0.1);
        assert!(town.production.jobs.is_empty());

        for step in 0..2_000 {
            let clock = f64::from(step) * 0.1;
            town.tick_water_work(&catalog, &mut stock, site, clock, 0.1);
            if town.utilities.potable_at(1) >= ration.water {
                break;
            }
        }
        assert!(town.utilities.potable_at(1) >= ration.water);
        town.tick_animals(&catalog, &mut stock, &land, 200.0, 0.1);
        assert_eq!(town.production.jobs[0].recipe, "care-coop");
    }

    #[test]
    fn a_hauler_stages_excess_water_and_another_trip_delivers_it() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let terrain = setup.terrain();
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        let mut town = Construction::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        town.utilities.sync(
            [Facility {
                id: 1,
                kind: "water-storage",
                location: IVec2::new(42, -13),
                size: IVec2::ONE,
                batteries: 0,
                panels: 0,
                working: false,
            }]
            .into_iter(),
        );
        let amount = |town: &Construction, id| town.utilities.water_site(id).unwrap().levels[1];
        assert_eq!(town.utilities.deliver_water(1, 1, 20.0), 20.0);
        town.residents[0].position = Vec2::new(41.0, -13.0);
        town.queue_water(
            0,
            WaterAction::Carry {
                source: Some(1),
                channel: 1,
            },
        )
        .unwrap();
        for cell in approach_points(IVec2::new(42, -13), IVec2::ONE, town.residents[0].position) {
            let obstacle = town.proposed_site(&catalog, "supply-5", cell);
            town.plans.push(obstacle);
        }
        town.tick_water_work(&catalog, &mut stock, site, 0.0, 0.1);
        assert_eq!(amount(&town, 1), 20.0);
        assert!(
            town.lab_stop_reason(super::super::LabStop::Blocked, 0.0)
                .is_some()
        );
        assert!(
            town.water_panel(0, Some(1), 1, 0.0)
                .contains("Waiting for access")
        );
        town.plans.clear();
        town.tick_water_work(&catalog, &mut stock, site, 3.0, 0.1);
        assert!(
            town.lab_stop_reason(super::super::LabStop::Blocked, 3.0)
                .is_none()
        );
        assert_eq!(amount(&town, 0), 0.0);
        assert_eq!(amount(&town, 1), 8.0);
        assert_eq!(town.water_jobs[&0].carried, 12.0);
        town.utilities.deliver_water(0, 1, 58.0);

        for step in 31..400 {
            town.tick_water_work(&catalog, &mut stock, site, f64::from(step) * 0.1, 0.1);
            if matches!(town.water_jobs[&0].phase, WaterPhase::Staged(_)) {
                break;
            }
        }
        assert_eq!(amount(&town, 0), 60.0);
        assert_eq!(town.water_jobs[&0].carried, 10.0);
        assert!(!town.working_water(0));
        let json = serde_json::to_string(&town).unwrap();
        let mut town: Construction = serde_json::from_str(&json).unwrap();
        assert!(town.valid_water_jobs());

        town.utilities.take_water(Some(0), 1, 11.0);
        for step in 400..500 {
            town.tick_water_work(&catalog, &mut stock, site, f64::from(step) * 0.1, 0.1);
        }
        assert!(town.water_jobs.is_empty());
        assert_eq!(amount(&town, 0), 59.0);
        assert_eq!(amount(&town, 1), 8.0);

        assert!(town.utilities.drink(0, 12.0));
        town.queue_water(0, WaterAction::Purify).unwrap();
        for step in 500..900 {
            town.tick_water_work(&catalog, &mut stock, site, f64::from(step) * 0.1, 0.1);
        }
        assert!(town.water_jobs.is_empty());
        assert_eq!(amount(&town, 0), 47.0);
        assert_eq!(town.utilities.potable_at(0), 40.0);
    }
}
