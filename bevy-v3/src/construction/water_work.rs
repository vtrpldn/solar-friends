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
}

impl WaterJob {
    fn label(&self) -> &'static str {
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

    pub fn water_panel(&self, target: usize, source: Option<usize>, channel: usize) -> String {
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
            let _ = write!(text, "\n{} · {:.1} L carried", job.label(), job.carried);
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

    fn maintain_water(&mut self) {
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
            let action = if site.maintain_fresh && below_reserve {
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
            } else if irrigate {
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

    pub(super) fn tick_water_work(
        &mut self,
        catalog: &Catalog,
        site: ConstructionSite,
        clock: f64,
        dt: f32,
    ) {
        self.maintain_water();
        let ids = self.water_jobs.keys().copied().collect::<Vec<_>>();
        for id in ids {
            // Keep the slot occupied while choosing a worker for another job.
            let mut job = self.water_jobs.remove(&id).expect("queued water job");
            if !self.step_water(id, &mut job, catalog, site, clock, dt) {
                self.water_jobs.insert(id, job);
            }
        }
    }

    fn step_water(
        &mut self,
        id: usize,
        job: &mut WaterJob,
        catalog: &Catalog,
        site: ConstructionSite,
        clock: f64,
        dt: f32,
    ) -> bool {
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
            job.retry = clock + 3.0;
            if let (WaterAction::Carry { channel, .. }, WaterPhase::Staged(_)) =
                (job.action, job.phase)
                && !self
                    .utilities
                    .water_site(id)
                    .is_some_and(|node| node.space(channel) > EPSILON)
            {
                return false;
            }
            let picked = (0..self.residents.len())
                .filter(|&index| {
                    self.free_for_leisure(index) && self.residents[index].health.energy >= 25.0
                })
                .find_map(|index| {
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
                return false;
            };
            self.residents[index].path = path;
            self.residents[index].leisure.visit = None;
            job.worker = Some(index);
            index
        };

        self.residents[worker].move_along_path(dt, matches!(job.phase, WaterPhase::Deliver));
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
        job.work += f64::from(dt);
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
        town.tick_water_work(&catalog, site, 0.0, 0.1);
        assert_eq!(amount(&town, 0), 0.0);
        assert_eq!(amount(&town, 1), 8.0);
        assert_eq!(town.water_jobs[&0].carried, 12.0);
        town.utilities.deliver_water(0, 1, 58.0);

        for step in 1..400 {
            town.tick_water_work(&catalog, site, f64::from(step) * 0.1, 0.1);
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
            town.tick_water_work(&catalog, site, f64::from(step) * 0.1, 0.1);
        }
        assert!(town.water_jobs.is_empty());
        assert_eq!(amount(&town, 0), 59.0);
        assert_eq!(amount(&town, 1), 8.0);

        assert!(town.utilities.drink(0, 12.0));
        town.queue_water(0, WaterAction::Purify).unwrap();
        for step in 500..900 {
            town.tick_water_work(&catalog, site, f64::from(step) * 0.1, 0.1);
        }
        assert!(town.water_jobs.is_empty());
        assert_eq!(amount(&town, 0), 47.0);
        assert_eq!(town.utilities.potable_at(0), 40.0);
    }
}
