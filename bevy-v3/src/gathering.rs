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
    pub phase: GatherPhase,
}

#[derive(PartialEq, Eq, Deserialize, Serialize)]
pub enum GatherPhase {
    Approach,
    Work,
    Return,
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

impl Gathering {
    pub fn felled(&self, index: usize) -> bool {
        self.markers.get(&index).is_some_and(|site| site.removed)
    }

    pub fn select(&mut self, land: &Land, index: Option<usize>) {
        self.selected = index.filter(|index| land.site(*index).is_some() && !self.felled(*index));
        self.notice.clear();
    }

    pub fn selected_status(&self, catalog: &Catalog, land: &Land, clock: f64) -> Option<String> {
        let index = self.selected?;
        let name = &catalog.gathering[land.site(index)?.recipe()].name;
        if !self.notice.is_empty() {
            return Some(format!("{name} · {}", self.notice));
        }
        let status = if let Some(job) = self.orders.get(&index) {
            match job.phase {
                GatherPhase::Approach => "Waiting for a resident".into(),
                GatherPhase::Work => format!(
                    "{:.0}% worked",
                    job.work / catalog.gathering[land.site(index)?.recipe()].work * 100.0
                ),
                GatherPhase::Return => "Carrying output back to stores".into(),
            }
        } else if let Some(state) = self.markers.get(&index).filter(|state| clock < state.ready) {
            format!(
                "Recovering for {:.1} more days",
                (state.ready - clock) / 3200.0
            )
        } else if self.felled(index) {
            "Felled".into()
        } else {
            "G Queue work".into()
        };
        Some(format!("{name} · {status}"))
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
        let Some(index) = self.selected else { return };
        let Some(site) = land.site(index) else { return };
        let recipe = &catalog.gathering[site.recipe()];
        if self.orders.contains_key(&index) || self.felled(index) {
            return;
        }
        if let Some(state) = self.markers.get(&index) {
            if clock < state.ready {
                return;
            }
            if recipe.gather_limit > 0 && state.extracted >= recipe.gather_limit {
                self.notice = "This patch is exhausted.".into();
                return;
            }
            if recipe.deposit > 0 {
                let limit = Self::deposit_limit(site, recipe, seed, richness);
                if state.extracted >= limit {
                    self.notice = "This deposit is exhausted.".into();
                    return;
                }
            }
        }
        self.notice.clear();
        self.queue_site(index);
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
                phase: GatherPhase::Approach,
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

    pub fn valid_save(&self, land: &Land) -> bool {
        self.markers
            .iter()
            .all(|(&index, state)| land.site(index).is_some() && state.ready >= 0.0)
            && self.orders.iter().all(|(&index, job)| {
                land.site(index).is_some()
                    && job.work >= 0.0
                    && job.worker.is_none_or(|worker| worker < 5)
            })
    }
}
