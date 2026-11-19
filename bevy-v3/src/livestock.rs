use std::collections::{BTreeMap, VecDeque};

use serde::{Deserialize, Serialize};

use crate::{
    catalog::AnimalRation,
    food::{FoodLots, Lot},
    weather::DAY,
};

#[derive(Default, Deserialize, Serialize)]
pub struct Livestock {
    pub animals: BTreeMap<usize, Pen>,
}

#[derive(Deserialize, Serialize)]
pub struct Pen {
    pub health: f64,
    pub feed: f64,
    pub water: f64,
    pending: f64,
    produced: f64,
    spoiled: u32,
    collected: u32,
    lots: VecDeque<AnimalLot>,
}

#[derive(Deserialize, Serialize)]
struct AnimalLot {
    units: u32,
    expires: f64,
}

impl Default for Pen {
    fn default() -> Self {
        Self {
            health: 100.0,
            feed: 0.0,
            water: 0.0,
            pending: 0.0,
            produced: 0.0,
            spoiled: 0,
            collected: 0,
            lots: VecDeque::new(),
        }
    }
}

impl Pen {
    pub fn care_summary(&self) -> String {
        format!(
            "Health {:.0}% · feed {:.2} kg · water {:.1} L · {} ready",
            self.health,
            self.feed,
            self.water,
            self.available()
        )
    }

    pub fn fed_days(&self, ration: &AnimalRation) -> f64 {
        ration.days * (self.feed / f64::from(ration.fodder)).min(self.water / ration.water)
    }

    pub fn next_unit_days(&self, ration: &AnimalRation) -> Option<f64> {
        if self.available() >= ration.batch * 2 {
            return None;
        }
        let needed = (1.0 - self.pending).max(0.0) / ration.daily_output;
        let recovered_after = (100.0 - self.health) / 5.0;
        let during_recovery = recovered_after * (self.health + 2.5 * recovered_after) / 100.0;
        let days = if needed == 0.0 {
            0.0
        } else if needed <= during_recovery {
            200.0 * needed / ((self.health.powi(2) + 1000.0 * needed).sqrt() + self.health)
        } else {
            recovered_after + needed - during_recovery
        };
        Some(if days <= self.fed_days(ration) {
            days
        } else {
            f64::INFINITY
        })
    }

    pub fn available(&self) -> u32 {
        self.lots.iter().map(|lot| lot.units).sum()
    }

    pub fn feed(&mut self, ration: &AnimalRation, water: f64) {
        self.feed += f64::from(ration.fodder);
        self.water += water;
    }

    pub fn collect(
        &mut self,
        ration: &AnimalRation,
        sandbox: bool,
    ) -> (BTreeMap<String, u32>, FoodLots) {
        let mut saved = Vec::new();
        let mut remaining = ration.batch;
        if !sandbox {
            while remaining > 0 {
                let Some(lot) = self.lots.front_mut() else {
                    break;
                };
                let removed = remaining.min(lot.units);
                if removed > 0 {
                    saved.push(Lot {
                        units: removed,
                        expires: lot.expires,
                        preserved: false,
                        chilled: false,
                    });
                }
                remaining -= removed;
                lot.units -= removed;
                if lot.units == 0 {
                    self.lots.pop_front();
                }
            }
        } else {
            remaining = 0;
        }
        let quantity = ration.batch - remaining;
        self.collected = self.collected.saturating_add(quantity);
        if quantity == 0 {
            (BTreeMap::new(), FoodLots::new())
        } else {
            let lots = if saved.is_empty() {
                FoodLots::new()
            } else {
                FoodLots::from([(ration.product.clone(), saved)])
            };
            (BTreeMap::from([(ration.product.clone(), quantity)]), lots)
        }
    }

    pub fn tick(&mut self, ration: &AnimalRation, clock: f64, dt: f64) {
        let days = dt / DAY;
        let fed = self.fed_days(ration).min(days);
        self.feed = (self.feed - days * f64::from(ration.fodder) / ration.days).max(0.0);
        self.water = (self.water - days * ration.water / ration.days).max(0.0);
        let old = self.health;
        let recovered = (old + 5.0 * fed).min(100.0);
        self.health = (recovered - 15.0 * (days - fed)).max(0.0);

        let generated = ration.daily_output * fed * (old + recovered) / 200.0;
        self.pending += generated;
        self.produced += generated;
        while self.lots.front().is_some_and(|lot| lot.expires <= clock) {
            let lost = self.lots.pop_front().expect("spoiled batch");
            self.spoiled = self.spoiled.saturating_add(lost.units);
        }
        let whole = (self.pending + 1e-9).floor() as u32;
        if whole == 0 {
            return;
        }
        let room = (ration.batch * 2).saturating_sub(self.available());
        let stored = whole.min(room);
        self.pending = (self.pending - f64::from(whole)).max(0.0);
        self.spoiled = self.spoiled.saturating_add(whole - stored);
        if stored == 0 {
            return;
        }
        let expires = clock + ration.shelf_days * DAY;
        if let Some(lot) = self.lots.back_mut()
            && expires - lot.expires < DAY / 24.0
        {
            lot.units += stored;
        } else {
            self.lots.push_back(AnimalLot {
                units: stored,
                expires,
            });
        }
    }

    pub fn valid(&self, ration: &AnimalRation) -> bool {
        (0.0..=100.0).contains(&self.health)
            && (0.0..=2.0 * f64::from(ration.fodder)).contains(&self.feed)
            && (0.0..=2.0 * ration.water).contains(&self.water)
            && (0.0..=1.0).contains(&self.pending)
            && self.lots.len() < 400
            && self
                .lots
                .iter()
                .all(|lot| lot.units > 0 && lot.units <= ration.batch * 2 && lot.expires >= 0.0)
            && self.available() <= ration.batch * 2
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::Catalog;

    #[test]
    fn livestock_matches_v2_through_ration_gaps_collection_and_spoilage() {
        let catalog = Catalog::default();
        // From V2 animalStep and collectAnimal with three ration deliveries
        // and a collection on step 28 of a 12-day run.
        let cases = [
            ("coop", 83.125, 17.205_468_75, 4, 3, 10),
            ("goat_pasture", 0.0, 8.325, 2, 6, 0),
        ];
        for (kind, health, produced, collected, spoiled, available) in cases {
            let ration = &catalog.animal_rations[kind];
            let mut pen = Pen::default();
            let interval = DAY / 8.0;
            for step in 1..=96 {
                if matches!(step, 8 | 16 | 64) {
                    pen.feed(ration, ration.water);
                }
                pen.tick(ration, f64::from(step) * interval, interval);
                if step == 28 {
                    let (output, _) = pen.collect(ration, false);
                    assert_eq!(output[&ration.product], collected);
                }
            }
            assert_eq!(pen.health, health);
            assert!((pen.produced - produced).abs() < 1e-9);
            assert_eq!(pen.collected, collected);
            assert_eq!(pen.spoiled, spoiled);
            assert_eq!(pen.available(), available);
            assert_eq!(pen.feed, 0.0);
            assert_eq!(pen.water, 0.0);
        }
    }

    #[test]
    fn hens_produce_a_batch_only_with_feed_and_water() {
        let catalog = Catalog::default();
        let ration = &catalog.animal_rations["coop"];
        let mut pen = Pen::default();
        pen.tick(ration, DAY, DAY);
        assert_eq!(pen.available(), 0);
        assert_eq!(pen.health, 85.0);

        pen.health = 100.0;
        pen.feed(ration, ration.water);
        for day in 2..=4 {
            pen.tick(ration, f64::from(day) * DAY, DAY);
        }
        assert_eq!(pen.available(), 6);
        assert_eq!(pen.collect(ration, false).0["eggs"], 6);
        assert_eq!(pen.available(), 0);
    }
}
