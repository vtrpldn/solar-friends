use super::*;
use serde::Deserialize;

use crate::farming::{Crop, FarmAction};

#[derive(Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub(crate) enum LabOrder {
    Build {
        key: String,
        x: i32,
        z: i32,
        #[serde(default)]
        rotation: u8,
        #[serde(default)]
        size: Option<[i32; 2]>,
    },
    Move {
        site: usize,
        x: i32,
        z: i32,
        #[serde(default)]
        rotation: u8,
    },
    Salvage {
        site: usize,
    },
    Demolish {
        site: usize,
    },
    MoveCraft {
        site: usize,
        destination: usize,
    },
    Produce {
        site: usize,
        recipe: String,
    },
    Gather {
        resource: usize,
    },
    Buy {
        material: String,
        #[serde(default)]
        freight: bool,
    },
    Sell {
        material: String,
    },
    Bed {
        site: usize,
        bed: usize,
        action: FarmAction,
    },
    ConfigureBed {
        site: usize,
        bed: usize,
        crop: Option<Crop>,
        density: Option<f64>,
        irrigation: Option<bool>,
        collect_residues: Option<bool>,
    },
    Outside {
        resident: usize,
        enabled: bool,
        #[serde(default)]
        recurring: bool,
    },
    FoodPolicy {
        enabled: bool,
    },
    Grid {
        enabled: bool,
    },
    CollectWater {
        site: usize,
    },
    Purify {
        site: usize,
    },
    ServiceWater {
        site: usize,
    },
    WaterPolicy {
        site: usize,
        fresh: bool,
        enabled: bool,
    },
}

#[derive(Clone, Copy, Default, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum LabStop {
    #[default]
    None,
    Harvest,
    CropFailed,
    Blocked,
    Hydration,
    Water,
}

impl Construction {
    pub(crate) fn lab_jobs(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        land: &Land,
        clock: f64,
        focus: Option<usize>,
        waiting_only: bool,
    ) -> Vec<String> {
        let mut jobs = Vec::new();
        let site_name = |index: usize| {
            format!(
                "{} #{}",
                catalog.projects[&self.plans[index].key].name,
                index + 1
            )
        };
        let worker_name =
            |index: Option<usize>| index.map_or("Unassigned", |index| resident_work::NAMES[index]);
        for (index, plan) in self.plans.iter().enumerate() {
            if focus.is_none_or(|site| site == index)
                && !plan.removed
                && (plan.work < catalog.projects[&plan.key].work
                    || self.changes.contains_key(&index))
            {
                let assigned = self
                    .residents
                    .iter()
                    .filter(|resident| {
                        resident
                            .assignment
                            .as_ref()
                            .is_some_and(|job| job.project == index)
                    })
                    .count()
                    + usize::from(
                        self.changes
                            .get(&index)
                            .is_some_and(|job| job.worker.is_some()),
                    );
                if waiting_only && assigned > 0 && plan.pickups == 0 {
                    continue;
                }
                jobs.push(format!(
                    "{} · {} · {assigned} assigned",
                    site_name(index),
                    self.project_status(catalog, index)
                ));
            }
        }
        for batch in &self.production.jobs {
            if focus.is_some_and(|site| site != batch.site) {
                continue;
            }
            let recipe = &catalog.production[&batch.recipe];
            let status = self.batch_status(batch, catalog, stock, clock);
            if waiting_only
                && (batch.phase == crate::production::Phase::Growing
                    || (batch.worker.is_some() && !status.starts_with("Waiting")))
            {
                continue;
            }
            jobs.push(format!(
                "{} · {} · {} · {}",
                site_name(batch.site),
                recipe.name,
                status,
                worker_name(batch.worker)
            ));
        }
        for job in &self.farming.jobs {
            if focus.is_some_and(|site| site != job.site)
                || (waiting_only && job.worker.is_some() && job.pickups == 0)
            {
                continue;
            }
            use crate::farming::FarmPhase;
            let status = match job.phase {
                FarmPhase::Pickup if job.pickups > 0 => "Waiting for seed delivery".to_owned(),
                FarmPhase::Pickup => "Collecting supplies".to_owned(),
                FarmPhase::Walk => "Walking to the bed".to_owned(),
                FarmPhase::Work => format!("{:.0}% worked", 100.0 * job.work / job.required),
                FarmPhase::Return => "Returning to stores".to_owned(),
            };
            jobs.push(format!(
                "{} · Bed {} · {status} · {}",
                site_name(job.site),
                job.bed + 1,
                worker_name(job.worker)
            ));
        }
        for (&index, job) in &self.gathering.orders {
            if focus.is_none()
                && (!waiting_only || job.worker.is_none())
                && let Some(site) = land.site(index)
            {
                let recipe = &catalog.gathering[site.recipe()];
                let status = match job.phase {
                    GatherPhase::Approach => "Heading to the site".to_owned(),
                    GatherPhase::Work => format!("{:.0}% worked", 100.0 * job.work / recipe.work),
                    GatherPhase::Return => "Carrying supplies back".to_owned(),
                };
                jobs.push(format!(
                    "{} · {status} · {}",
                    recipe.name,
                    worker_name(job.worker)
                ));
            }
        }
        for (&site, job) in &self.water_jobs {
            if focus.is_some_and(|project| project + 1 != site) {
                continue;
            }
            let destination = site.checked_sub(1).map_or_else(|| "Camp".into(), site_name);
            let worker = (0..self.residents.len()).find(|&index| job.assigned_to(index));
            if waiting_only && worker.is_some() {
                continue;
            }
            jobs.push(format!(
                "{destination} · {} · {}",
                job.label(),
                worker_name(worker)
            ));
        }
        jobs
    }

    pub(crate) fn lab_map_preview(
        &self,
        catalog: &Catalog,
        ground: ConstructionSite,
        sandbox: bool,
        (key, cell, rotation, field_size): (&str, IVec2, u8, IVec2),
    ) -> (IVec2, Option<&'static str>) {
        let proposal = Self::proposal(catalog, key, cell, field_size, rotation);
        let error = self.placement_error(
            ground.terrain,
            ground.land,
            ground.camp,
            &proposal,
            &catalog.projects[key],
            (catalog, sandbox, None),
        );
        (proposal.size, error)
    }

    pub(crate) fn lab_map_projects<'a>(
        &'a self,
        catalog: &'a Catalog,
    ) -> impl Iterator<Item = (usize, Vec2, Vec2, bool)> + 'a {
        self.plans.iter().enumerate().filter_map(|(index, plan)| {
            if plan.removed {
                return None;
            }
            let size = plan.size.as_vec2();
            let center = plan.position.as_vec2() + (size - Vec2::ONE) * 0.5;
            Some((
                index,
                world_position(center.x, center.y),
                size * 2.0,
                plan.work >= catalog.projects[&plan.key].work,
            ))
        })
    }

    pub(crate) fn lab_map_project_status(&self, catalog: &Catalog, index: usize) -> Option<String> {
        let name = self.lab_job_site_name(catalog, index)?;
        Some(format!(
            "{name} #{} · {}",
            index + 1,
            self.project_status(catalog, index)
        ))
    }

    pub(crate) fn lab_job_sites(&self) -> impl Iterator<Item = usize> + '_ {
        self.plans
            .iter()
            .enumerate()
            .filter_map(|(index, plan)| (!plan.removed).then_some(index))
    }

    pub(crate) fn lab_job_site_name<'a>(
        &self,
        catalog: &'a Catalog,
        index: usize,
    ) -> Option<&'a str> {
        let plan = self.plans.get(index).filter(|plan| !plan.removed)?;
        Some(catalog.projects[&plan.key].name.as_str())
    }

    fn lab_change_site(&self, site: usize) -> Result<usize, String> {
        let index = site
            .checked_sub(1)
            .filter(|&index| self.plans.get(index).is_some_and(|plan| !plan.removed))
            .ok_or("Choose an existing building by its project number.")?;
        if self.changes.contains_key(&index) {
            return Err("A change is already queued for this project.".into());
        }
        Ok(index)
    }

    pub(crate) fn lab_order(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        ground: ConstructionSite,
        clock: TownClock,
        order: &LabOrder,
        richness: f64,
    ) -> Result<(), String> {
        match order {
            LabOrder::Build {
                key,
                x,
                z,
                rotation,
                size,
            } => {
                if !catalog.projects.contains_key(key)
                    || *rotation > 3
                    || !(-30..94).contains(x)
                    || !(-30..94).contains(z)
                {
                    return Err("Choose a valid blueprint, location and rotation.".into());
                }
                let size = size.map_or_else(default_field_size, |[w, h]| IVec2::new(w, h));
                if key == "field" && !crate::farming::Plot::field_size_valid(size) {
                    return Err("Fields must be 2–32 cells on each side.".into());
                }
                let original_size = self.field_size;
                self.field_size = size;
                let previous = self.plans.len();
                self.selection = Some(key.clone());
                self.rotation = *rotation;
                self.plan(catalog, stock, ground, IVec2::new(*x, *z), clock);
                self.selection = None;
                self.field_size = original_size;
                if self.plans.len() == previous {
                    return Err(self.status.clone());
                }
            }
            LabOrder::Move {
                site,
                x,
                z,
                rotation,
            } => {
                let index = self.lab_change_site(*site)?;
                if *rotation > 3 || !(-30..94).contains(x) || !(-30..94).contains(z) {
                    return Err("Choose a valid destination and rotation.".into());
                }
                if let Some(issue) = self.can_change(index) {
                    return Err(issue.into());
                }
                let previous_rotation = self.rotation;
                let previous_move = self.moving;
                self.rotation = *rotation;
                self.queue_move(catalog, stock, ground, IVec2::new(*x, *z), index);
                self.rotation = previous_rotation;
                self.moving = previous_move;
                if !self.changes.contains_key(&index) {
                    return Err(self.status.clone());
                }
            }
            LabOrder::Salvage { site } | LabOrder::Demolish { site } => {
                let index = self.lab_change_site(*site)?;
                let action = if matches!(order, LabOrder::Salvage { .. }) {
                    ProjectAction::Salvage
                } else {
                    ProjectAction::Demolish
                };
                self.request_project_action(catalog, stock, index, action);
                if !self.changes.contains_key(&index) && !self.plans[index].removed {
                    return Err(self.status.clone());
                }
            }
            LabOrder::MoveCraft { site, destination } => {
                let source = self.lab_change_site(*site)?;
                let destination = self.lab_change_site(*destination)?;
                let (job, destinations) = self.craft_destinations(catalog, source);
                let job = job.ok_or("Choose a project with unfinished craft work.")?;
                if !destinations.contains(&destination) {
                    return Err("Choose a free, enabled matching workspace.".into());
                }
                self.move_craft_job(catalog, stock, job, destination);
            }
            LabOrder::Produce { site, recipe } => {
                let id = site
                    .checked_sub(1)
                    .filter(|&id| id < self.plans.len())
                    .ok_or("Choose a finished building by its project number.")?;
                if !self
                    .recipes(catalog, id)
                    .iter()
                    .any(|(key, _)| *key == recipe)
                {
                    return Err("This recipe is unavailable at the chosen site.".into());
                }
                let previous = self.production.jobs.len();
                self.queue_batch(catalog, stock, id, recipe);
                if self.production.jobs.len() == previous {
                    return Err(self.production.notice.clone());
                }
            }
            LabOrder::Gather { resource } => {
                let index = resource
                    .checked_sub(1)
                    .ok_or("Resource numbers start at 1.")?;
                self.gathering.queue_resource(
                    catalog,
                    ground.land,
                    index,
                    (ground.terrain.seed, richness, clock.seconds),
                )?;
            }
            LabOrder::Buy { material, freight } => {
                self.buy_from_town(catalog, stock, clock, material, *freight)?;
            }
            LabOrder::Sell { material } => {
                if !catalog.materials.contains_key(material) {
                    return Err("Unknown material.".into());
                }
                let day = ((540.0 + clock.seconds * 0.45) / 1440.0).floor() as u64;
                let fare = crate::market::fare_cents(clock.round_trip_km);
                self.trade
                    .reserve(catalog, stock, &mut self.market, material, (day, fare, 0))?;
            }
            LabOrder::Bed { site, bed, action } => {
                let site = site.checked_sub(1).ok_or("Project numbers start at 1.")?;
                let bed = bed.checked_sub(1).ok_or("Bed numbers start at 1.")?;
                self.queue_bed_job(catalog, stock, (site, bed, *action), clock)?;
            }
            LabOrder::ConfigureBed {
                site,
                bed,
                crop,
                density,
                irrigation,
                collect_residues,
            } => {
                let site = site.checked_sub(1).ok_or("Project numbers start at 1.")?;
                let bed = bed.checked_sub(1).ok_or("Bed numbers start at 1.")?;
                let bed_data = self
                    .farming
                    .plots
                    .get_mut(&site)
                    .and_then(|plot| plot.beds.get_mut(bed))
                    .ok_or("Choose a completed planting bed.")?;
                if crop.is_some() || density.is_some() {
                    if !bed_data.editable()
                        || self
                            .farming
                            .jobs
                            .iter()
                            .any(|job| job.site == site && job.bed == bed)
                    {
                        return Err("Choose a bed without standing crops or queued work.".into());
                    }
                    if density.is_some_and(|density| ![0.5, 1.0, 1.5].contains(&density)) {
                        return Err("Density must be 0.5, 1.0, or 1.5.".into());
                    }
                }
                if let Some(crop) = crop {
                    bed_data.crop = *crop;
                }
                if let Some(density) = density {
                    bed_data.density = *density;
                }
                if let Some(irrigation) = irrigation {
                    bed_data.irrigation = *irrigation;
                }
                if let Some(collect) = collect_residues {
                    bed_data.collect_residues = *collect;
                }
            }
            LabOrder::Outside {
                resident,
                enabled,
                recurring,
            } => {
                if stock.sandbox {
                    return Err("Town employment is available in Story.".into());
                }
                let work = &mut resident
                    .checked_sub(1)
                    .and_then(|id| self.residents.get_mut(id))
                    .ok_or("Choose a resident from 1 to 5.")?
                    .town_work;
                if *recurring {
                    work.repeating = *enabled;
                } else if work.active() {
                    return Err("The resident already started a shift.".into());
                } else {
                    work.booked = *enabled;
                }
            }
            LabOrder::FoodPolicy { enabled } => self.trade.household_restock_off = !enabled,
            LabOrder::Grid { enabled } => self.utilities.grid_off = !enabled,
            LabOrder::CollectWater { site } => self.queue_water(
                *site,
                WaterAction::Carry {
                    source: None,
                    channel: 1,
                },
            )?,
            LabOrder::Purify { site } => self.queue_water(*site, WaterAction::Purify)?,
            LabOrder::ServiceWater { site } => self.queue_water(*site, WaterAction::Sanitation)?,
            LabOrder::WaterPolicy {
                site,
                fresh,
                enabled,
            } => {
                if !self.utilities.set_water_policy(*site, *fresh, *enabled) {
                    return Err("This facility does not support that water policy.".into());
                }
            }
        }
        Ok(())
    }
}

impl Construction {
    pub(crate) fn potable_liters(&self) -> f64 {
        self.utilities
            .water_ids()
            .map(|id| self.utilities.potable_at(id))
            .sum()
    }

    pub(crate) fn minimum_hydration(&self) -> f64 {
        self.residents
            .iter()
            .map(|worker| worker.health.levels[Need::Hydration as usize])
            .fold(100.0, f64::min)
    }

    pub(crate) fn lab_stop_reason(&self, condition: LabStop, clock: f64) -> Option<&'static str> {
        use crate::farming::{FarmAction, Stage};

        match condition {
            LabStop::None => None,
            LabStop::Harvest | LabStop::CropFailed => {
                let harvest = matches!(condition, LabStop::Harvest);
                self.farming
                    .plots
                    .values()
                    .flat_map(|plot| &plot.beds)
                    .any(|bed| {
                        let ready = bed.stage == Stage::Harvestable;
                        let usable = ready && bed.requirements(FarmAction::Harvest, clock).is_ok();
                        if harvest {
                            usable
                        } else {
                            bed.stage == Stage::Failed || (ready && !usable)
                        }
                    })
                    .then_some(if harvest {
                        "A crop is ready to harvest."
                    } else {
                        "A crop has failed or expired."
                    })
            }
            LabStop::Blocked => (self
                .production
                .jobs
                .iter()
                .any(|job| job.waiting_for_access && job.retry_at > clock)
                || self
                    .residents
                    .iter()
                    .any(|worker| worker.blocked_construction_project().is_some()))
            .then_some("A job is waiting for access."),
            LabStop::Hydration => {
                (self.minimum_hydration() < 20.0).then_some("A resident has urgent thirst.")
            }
            LabStop::Water => (self.utilities.camp_water().is_some()
                && self.potable_liters() < 0.5)
                .then_some("Less than 0.5 L of drinking water remains."),
        }
    }
}
