use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::{catalog::Biology, weather::DAY};

#[derive(Deserialize, Serialize)]
pub struct Ground {
    pub moisture: f64,
    pub fertility: f64,
    pub orchard_established: bool,
    pub harvests: u32,
    pub irrigation: Irrigation,
}

#[derive(Default, Clone, Copy, Deserialize, Serialize)]
pub enum Irrigation {
    #[default]
    Balanced,
    Conserve,
    Rainfed,
}

impl Irrigation {
    pub fn cycle(self) -> Self {
        match self {
            Self::Balanced => Self::Conserve,
            Self::Conserve => Self::Rainfed,
            Self::Rainfed => Self::Balanced,
        }
    }

    pub fn target(self) -> f64 {
        match self {
            Self::Balanced => 0.75,
            Self::Conserve => 0.4,
            Self::Rainfed => 0.0,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Balanced => "Balanced",
            Self::Conserve => "Conserve",
            Self::Rainfed => "Rain-fed",
        }
    }
}

impl Default for Ground {
    fn default() -> Self {
        Self {
            moisture: 0.75,
            fertility: 1.0,
            orchard_established: false,
            harvests: 0,
            irrigation: Irrigation::default(),
        }
    }
}

impl Ground {
    pub fn valid(&self) -> bool {
        (0.0..=1.0).contains(&self.moisture) && (0.0..=1.0).contains(&self.fertility)
    }
}

#[derive(Deserialize, Serialize)]
pub struct Growth {
    pub remaining: f64,
    pub ripe_at: Option<f64>,
    dry_seconds: f64,
    damage: f64,
}

pub struct Conditions {
    pub clock: f64,
    pub elapsed: f64,
    pub rain: f64,
    pub season: f64,
    pub timber: bool,
}

impl Growth {
    pub fn start(recipe: &str, biology: &Biology, soil: &mut Ground) -> Self {
        let establishment = if recipe == "fruit" && !soil.orchard_established {
            soil.orchard_established = true;
            610.0
        } else {
            0.0
        };
        Self {
            remaining: (biology.days + establishment) * DAY,
            ripe_at: None,
            dry_seconds: 0.0,
            damage: 0.0,
        }
    }

    fn rate(biology: &Biology, soil: &Ground, season: f64) -> f64 {
        let season = if biology.seasonal { season } else { 1.0 };
        if biology.care.is_none() {
            return season;
        }
        if soil.moisture < 0.1 {
            return 0.0;
        }
        season * (soil.moisture / 0.4).min(1.0) * (0.5 + 0.5 * soil.fertility)
    }

    pub fn collection_forecast(
        &self,
        biology: &Biology,
        soil: &Ground,
        clock: f64,
        season: f64,
    ) -> Option<f64> {
        if self.damage >= 1.0 {
            return None;
        }
        if let Some(ripe) = self.ripe_at {
            return biology
                .window
                .is_none_or(|window| clock < ripe + 2.0 * window * DAY)
                .then_some(0.0);
        }
        let rate = Self::rate(biology, soil, season);
        (rate > 0.0).then(|| self.remaining / rate / DAY)
    }

    pub fn tick(
        &mut self,
        biology: &Biology,
        soil: &mut Ground,
        climate: Conditions,
        mut irrigate: impl FnMut(f64) -> bool,
    ) {
        if let Some([area, liters]) = biology.care {
            let days = climate.elapsed / DAY;
            let need = liters * days;
            let rain = climate.rain * 24.0 * days * area;
            let target = soil.irrigation.target();
            let refill = (need - rain).max(0.0) + area * 2.0 * days;
            let applied =
                if rain < need && target > 0.0 && soil.moisture <= target && irrigate(refill) {
                    refill
                } else {
                    0.0
                };
            soil.moisture =
                (soil.moisture + (rain + applied - need) / (area * 16.0)).clamp(0.0, 1.0);
            self.dry_seconds = if soil.moisture < 0.1 {
                self.dry_seconds + climate.elapsed
            } else {
                0.0
            };
            let (grace, loss) = if climate.timber {
                (14.0, 60.0)
            } else {
                (1.0, 6.0)
            };
            self.damage = self
                .damage
                .max(((self.dry_seconds / DAY - grace) / loss).clamp(0.0, 1.0));
            if self.damage >= 1.0 {
                self.remaining = 0.0;
                self.ripe_at.get_or_insert(climate.clock);
                return;
            }
        }
        let factor = Self::rate(biology, soil, climate.season);
        if self.ripe_at.is_none() {
            self.remaining = (self.remaining - climate.elapsed * factor).max(0.0);
            if self.remaining == 0.0 {
                self.ripe_at = Some(climate.clock);
                if biology.care.is_some() {
                    soil.fertility = (soil.fertility - 0.1).max(0.0);
                }
            }
        }
    }

    pub fn output(
        &self,
        biology: &Biology,
        clock: f64,
        output: &BTreeMap<String, u32>,
    ) -> BTreeMap<String, u32> {
        let elapsed = self
            .ripe_at
            .map_or(0.0, |ripe| (clock - ripe).max(0.0) / DAY);
        let window = biology.window.map_or(1.0, |window| {
            (1.0 - (elapsed - window).max(0.0) / window).max(0.0)
        });
        output
            .iter()
            .filter_map(|(id, &units)| {
                let remaining =
                    (f64::from(units) * window * (1.0 - self.damage) + 1e-8).floor() as u32;
                (remaining > 0).then(|| (id.clone(), remaining))
            })
            .collect()
    }

    pub fn valid(&self, maximum_days: f64) -> bool {
        self.ripe_at
            .is_none_or(|clock| clock.is_finite() && clock >= 0.0 && self.remaining == 0.0)
            && (0.0..=maximum_days * DAY).contains(&self.remaining)
            && self.dry_seconds.is_finite()
            && self.dry_seconds >= 0.0
            && (0.0..=1.0).contains(&self.damage)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::Catalog;

    #[test]
    fn orchard_establishment_is_once_and_uncollected_fruit_loses_yield() {
        let catalog = Catalog::default();
        let recipe = &catalog.production["fruit"];
        let biology = recipe.biology.as_ref().unwrap();
        let mut soil = Ground::default();
        let mut first = Growth::start("fruit", biology, &mut soil);
        assert_eq!(first.remaining, 730.0 * DAY);
        assert_eq!(
            first.collection_forecast(biology, &soil, 0.0, 1.0),
            Some(730.0)
        );
        first.tick(
            biology,
            &mut soil,
            Conditions {
                clock: 729.0 * DAY,
                elapsed: 729.0 * DAY,
                rain: 1.0,
                season: 1.0,
                timber: false,
            },
            |_| false,
        );
        assert_eq!(first.remaining, DAY);
        assert!(first.ripe_at.is_none());
        first.tick(
            biology,
            &mut soil,
            Conditions {
                clock: 730.0 * DAY,
                elapsed: DAY,
                rain: 1.0,
                season: 1.0,
                timber: false,
            },
            |_| false,
        );
        assert_eq!(first.ripe_at, Some(730.0 * DAY));
        assert_eq!(
            first.output(biology, 744.0 * DAY, &recipe.output)["food"],
            12
        );
        assert_eq!(
            first.output(biology, 751.0 * DAY, &recipe.output)["food"],
            6
        );
        assert!(
            first
                .output(biology, 759.0 * DAY, &recipe.output)
                .is_empty()
        );
        assert_eq!(
            Growth::start("fruit", biology, &mut soil).remaining,
            120.0 * DAY
        );
    }
}
