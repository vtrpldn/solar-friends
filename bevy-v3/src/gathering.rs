use std::collections::BTreeMap;

use bevy::prelude::IVec2;
use serde::{Deserialize, Serialize};

use crate::{catalog::Catalog, land::Land, terrain::land_random};

#[derive(Default, Deserialize, Serialize)]
pub struct Gathering {
    pub orders: BTreeMap<usize, GatherJob>,
    markers: BTreeMap<usize, HarvestState>,
    #[serde(skip)]
    selected: Option<usize>,
    #[serde(skip)]
    notice: String,
}

#[derive(Deserialize, Serialize)]
pub struct GatherJob {
    pub worker: Option<usize>,
    pub work: f64,
    #[serde(default)]
    pub retry_at: f64,
    #[serde(default)]
    pub waiting_for_access: bool,
    pub phase: GatherPhase,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub remaining: Option<BTreeMap<String, u32>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub food_output: Option<crate::food::FoodLots>,
}

impl GatherJob {
    pub fn remaining_output<'a>(
        &'a self,
        recipe_output: &'a BTreeMap<String, u32>,
    ) -> &'a BTreeMap<String, u32> {
        self.remaining.as_ref().unwrap_or(recipe_output)
    }
}

#[derive(PartialEq, Eq, Deserialize, Serialize)]
pub enum GatherPhase {
    Approach,
    Work,
    Return,
    CollectOutput,
}

#[derive(Default, Deserialize, Serialize)]
struct HarvestState {
    removed: bool,
    extracted: u32,
    ready: f64,
}

pub enum ResourceStatus {
    Cleared,
    Exhausted,
    Queued,
    Recovering(f64),
    Remaining(u32),
    Available,
}

impl std::fmt::Display for ResourceStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Cleared => f.write_str("Cleared"),
            Self::Exhausted => f.write_str("Exhausted"),
            Self::Queued => f.write_str("Gathering queued"),
            Self::Recovering(days) => write!(f, "Recovering for {days:.1} days"),
            Self::Remaining(units) => write!(f, "{units} units remaining"),
            Self::Available => f.write_str("Available"),
        }
    }
}

#[derive(PartialEq)]
pub(crate) struct SelectedSite {
    pub name: String,
    pub state_caption: &'static str,
    pub status: String,
    pub progress: Option<f32>,
    pub yields: Vec<(String, String)>,
    pub work_minutes: u32,
    pub can_gather: bool,
    pub reason: Option<String>,
    pub notice: Option<String>,
}

impl Gathering {
    pub(crate) fn selected_site(
        &self,
        catalog: &Catalog,
        land: &Land,
        (seed, richness, clock): (u32, f64, f64),
        blocked: impl Fn(&GatherJob) -> bool,
    ) -> Option<SelectedSite> {
        let index = self.selected?;
        let site = land.site(index)?;
        let recipe = &catalog.gathering[site.recipe()];
        let state = self.markers.get(&index);
        let extracted = state.map_or(0, |state| state.extracted);
        let remaining = if recipe.deposit > 0 {
            Some(Self::deposit_limit(site, recipe, seed, richness).saturating_sub(extracted))
        } else if recipe.gather_limit > 0 {
            Some(recipe.gather_limit.saturating_sub(extracted))
        } else {
            None
        };
        let yields = recipe
            .output
            .iter()
            .map(|(id, &amount)| {
                let item = &catalog.materials[id];
                (item.name.clone(), item.quantity_text(u64::from(amount)))
            })
            .collect();
        let work_minutes = (recipe.work * 0.45).ceil() as u32;
        let notice = (!self.notice.is_empty()).then(|| self.notice.clone());

        let (state_caption, status, progress, can_gather, reason) = if self.felled(index) {
            (
                "CLEARED",
                "This site has been cleared.".into(),
                None,
                false,
                Some("This site has been cleared.".into()),
            )
        } else if let Some(job) = self.orders.get(&index) {
            let (caption, status, progress) = if blocked(job) {
                ("WAITING", "Waiting for access.".into(), None)
            } else {
                match job.phase {
                    GatherPhase::Approach => ("QUEUED", "Waiting for a resident.".into(), None),
                    GatherPhase::Work => {
                        let fraction = (job.work / recipe.work).clamp(0.0, 1.0);
                        (
                            "GATHERING",
                            format!("{:.0}% worked", fraction * 100.0),
                            Some(fraction as f32),
                        )
                    }
                    GatherPhase::Return => {
                        ("GATHERING", "Carrying output back to stores.".into(), None)
                    }
                    GatherPhase::CollectOutput => {
                        ("GATHERING", "Returning for the next load.".into(), None)
                    }
                }
            };
            (
                caption,
                status,
                progress,
                false,
                Some("Gathering is already queued.".into()),
            )
        } else if remaining == Some(0) {
            let reason = if recipe.deposit > 0 {
                "This deposit is exhausted."
            } else {
                "This patch is exhausted."
            };
            ("DEPLETED", reason.into(), None, false, Some(reason.into()))
        } else if let Some(state) = state.filter(|state| clock < state.ready) {
            let days = (state.ready - clock) / 3200.0;
            (
                "RECOVERING",
                format!("Recovering for {days:.1} more days."),
                None,
                false,
                Some(format!("Wait {days:.1} days for this site to recover.")),
            )
        } else {
            let status = remaining.map_or_else(
                || "Ready to gather.".into(),
                |units| format!("{units} units remaining."),
            );
            ("AVAILABLE", status, None, true, None)
        };

        Some(SelectedSite {
            name: recipe.name.clone(),
            state_caption,
            status,
            progress,
            yields,
            work_minutes,
            can_gather,
            reason,
            notice,
        })
    }

    pub fn felled(&self, index: usize) -> bool {
        self.markers.get(&index).is_some_and(|site| site.removed)
    }

    pub fn forage_depleted(&self, index: usize, limit: u32, clock: f64) -> bool {
        self.markers
            .get(&index)
            .is_some_and(|state| clock < state.ready || (limit > 0 && state.extracted >= limit))
    }

    pub fn select(&mut self, land: &Land, index: Option<usize>) {
        self.selected = index.filter(|index| land.site(*index).is_some() && !self.felled(*index));
        self.notice.clear();
    }

    pub fn has_selection(&self) -> bool {
        self.selected.is_some_and(|site| !self.felled(site))
    }

    pub fn resource_status(
        &self,
        index: usize,
        site: &crate::land::Site,
        catalog: &Catalog,
        (seed, richness, clock): (u32, f64, f64),
    ) -> ResourceStatus {
        let recipe = &catalog.gathering[site.recipe()];
        let state = self.markers.get(&index);
        let extracted = state.map_or(0, |state| state.extracted);
        let remaining = if recipe.deposit > 0 {
            Some(Self::deposit_limit(site, recipe, seed, richness).saturating_sub(extracted))
        } else if recipe.gather_limit > 0 {
            Some(recipe.gather_limit.saturating_sub(extracted))
        } else {
            None
        };
        if self.felled(index) {
            ResourceStatus::Cleared
        } else if self.orders.contains_key(&index) {
            ResourceStatus::Queued
        } else if remaining == Some(0) {
            ResourceStatus::Exhausted
        } else if let Some(state) = state.filter(|state| clock < state.ready) {
            ResourceStatus::Recovering((state.ready - clock) / 3200.0)
        } else if let Some(units) = remaining {
            ResourceStatus::Remaining(units)
        } else {
            ResourceStatus::Available
        }
    }

    fn deposit_limit(
        site: &crate::land::Site,
        recipe: &crate::catalog::GatherRecipe,
        seed: u32,
        richness: f64,
    ) -> u32 {
        let salt = if site.recipe() == "stone" {
            0x91af
        } else {
            0x7c32
        };
        let column = site.position.x.div_euclid(12) as u32;
        let row = site.position.y.div_euclid(12) as u32;
        let mut random =
            land_random(seed ^ salt ^ column.wrapping_mul(73856093) ^ row.wrapping_mul(19349663));
        let factor = if seed == 0 {
            1.0
        } else {
            (0.6 + random() * 1.4) * richness
        };
        let batch: u32 = recipe.output.values().sum();
        (f64::from(recipe.deposit * 8) * factor / f64::from(batch)).round() as u32 * batch
    }

    pub fn queue(&mut self, catalog: &Catalog, land: &Land, seed: u32, richness: f64, clock: f64) {
        if let Some(index) = self.selected {
            self.notice = self
                .queue_resource(catalog, land, index, (seed, richness, clock))
                .err()
                .unwrap_or_default()
                .into();
        }
    }

    pub fn queue_resource(
        &mut self,
        catalog: &Catalog,
        land: &Land,
        index: usize,
        (seed, richness, clock): (u32, f64, f64),
    ) -> Result<(), &'static str> {
        let site = land.site(index).ok_or("Choose a natural resource site.")?;
        let recipe = &catalog.gathering[site.recipe()];
        if self.orders.contains_key(&index) {
            return Err("Gathering is already queued.");
        }
        if self.felled(index) {
            return Err("This site has been cleared.");
        }
        if let Some(state) = self.markers.get(&index) {
            if clock < state.ready {
                return Err("This site is still recovering.");
            }
            if recipe.gather_limit > 0 && state.extracted >= recipe.gather_limit {
                return Err("This patch is exhausted.");
            }
            if recipe.deposit > 0
                && state.extracted >= Self::deposit_limit(site, recipe, seed, richness)
            {
                return Err("This deposit is exhausted.");
            }
        }
        self.queue_site(index);
        Ok(())
    }

    pub fn queue_forage(&mut self, land: &Land, origin: IVec2, clock: f64) {
        const FORAGE: &str = "gather-wild-forage";
        if self
            .orders
            .keys()
            .any(|&index| land.site(index).is_some_and(|site| site.recipe() == FORAGE))
        {
            return;
        }
        if let Some((index, _)) = land
            .sites()
            .filter(|(index, site)| {
                site.recipe() == FORAGE
                    && self
                        .markers
                        .get(index)
                        .is_none_or(|state| !state.removed && state.ready <= clock)
            })
            .min_by_key(|(_, site)| (site.position - origin).length_squared())
        {
            self.queue_site(index);
        }
    }

    fn queue_site(&mut self, index: usize) {
        self.orders.insert(
            index,
            GatherJob {
                worker: None,
                work: 0.0,
                retry_at: 0.0,
                waiting_for_access: false,
                phase: GatherPhase::Approach,
                remaining: None,
                food_output: None,
            },
        );
    }

    pub fn workers_at_site(&self, index: usize) -> bool {
        self.orders.values().any(|job| job.worker == Some(index))
    }

    pub fn gathered(&mut self, site: usize, tree: bool, units: u32, available_again: f64) {
        let marker = self.markers.entry(site).or_default();
        marker.removed |= tree;
        marker.extracted = marker.extracted.saturating_add(units);
        marker.ready = available_again;
    }

    pub fn valid_save(&self, land: &Land, catalog: &Catalog) -> bool {
        self.markers
            .iter()
            .all(|(&index, state)| land.site(index).is_some() && state.ready >= 0.0)
            && self.orders.iter().all(|(&index, job)| {
                let Some(site) = land.site(index) else {
                    return false;
                };
                let recipe = &catalog.gathering[site.recipe()];
                (0.0..=recipe.work).contains(&job.work)
                    && job.worker.is_none_or(|worker| worker < 5)
                    && (job.phase != GatherPhase::CollectOutput || job.remaining.is_some())
                    && job.remaining.as_ref().is_none_or(|remaining| {
                        matches!(job.phase, GatherPhase::Return | GatherPhase::CollectOutput)
                            && !remaining.is_empty()
                            && remaining.iter().all(|(id, &quantity)| {
                                quantity > 0
                                    && recipe
                                        .output
                                        .get(id)
                                        .is_some_and(|&total| quantity <= total)
                            })
                    })
                    && job.food_output.as_ref().is_none_or(|lots| {
                        matches!(job.phase, GatherPhase::Return | GatherPhase::CollectOutput)
                            && crate::food::valid_cargo(lots, job.remaining_output(&recipe.output))
                    })
            })
    }
}
