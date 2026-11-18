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
    pub fn fed_days(&self, ration: &AnimalRation) -> f64 {
        ration.days * (self.feed / f64::from(ration.fodder)).min(self.water / ration.water)
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
