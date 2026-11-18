use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::{
    catalog::Catalog,
    weather::{DAY, HOUR},
};

pub const FOODS: [(&str, f64); 7] = [
    ("greens", 3.0),
    ("beans", 5.0),
    ("corn", 3.0),
    ("food", 3.0),
    ("meals", 2.0),
    ("eggs", 7.0),
    ("milk", 1.0),
];

pub const SERVINGS: [(&str, u32); 4] = [("meals", 1), ("food", 1), ("eggs", 4), ("milk", 2)];

pub type FoodLots = BTreeMap<String, Vec<Lot>>;

#[derive(Clone, Deserialize, Serialize)]
pub struct Lot {
    pub units: u32,
    pub expires: f64,
    #[serde(default)]
    pub preserved: bool,
    #[serde(default)]
    pub chilled: bool,
}

#[derive(Clone, Default, Deserialize, Serialize)]
pub struct Pantry {
    pub lots: FoodLots,
    pub clock: f64,
    initialized: bool,
    pub spoiled: BTreeMap<String, u64>,
    pub waste_remainder: f64,
    pub priority: CoolingPriority,
}

#[derive(Default, Clone, Copy, Deserialize, Serialize)]
pub enum CoolingPriority {
    #[default]
    Expiry,
    Meals,
    Ingredients,
}

impl CoolingPriority {
    pub fn next(self) -> Self {
        match self {
            Self::Expiry => Self::Meals,
            Self::Meals => Self::Ingredients,
            Self::Ingredients => Self::Expiry,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Expiry => "Earliest expiry",
            Self::Meals => "Meals first",
            Self::Ingredients => "Ingredients first",
        }
    }

    fn rank(self, id: &str) -> u8 {
        match self {
            Self::Expiry => 0,
            Self::Meals => u8::from(id != "meals"),
            Self::Ingredients => u8::from(id == "meals"),
        }
    }
}

impl Pantry {
    pub fn ensure(&mut self, amounts: &BTreeMap<String, u32>) {
        if self.initialized {
            return;
        }
        self.lots = fresh(amounts, self.clock, &BTreeMap::new());
        self.initialized = true;
    }

    pub fn insert(&mut self, mut lots: FoodLots) {
        for (id, incoming) in &mut lots {
            let current = self.lots.entry(id.clone()).or_default();
            current.append(incoming);
            merge(current);
        }
    }

    pub fn remove(&mut self, id: &str, quantity: u32) -> Vec<Lot> {
        let Some(available) = self.lots.get_mut(id) else {
            return Vec::new();
        };
        let mut remaining = quantity;
        let mut removed = Vec::new();
        for lot in available.iter_mut() {
            let take = remaining.min(lot.units);
            if take > 0 {
                removed.push(Lot {
                    units: take,
                    chilled: false,
                    ..lot.clone()
                });
                lot.units -= take;
                remaining -= take;
            }
            if remaining == 0 {
                break;
            }
        }
        available.retain(|lot| lot.units > 0);
        removed
    }

    pub fn cool(&mut self, catalog: &Catalog, litres: f64, dt: f64, now: f64) {
        if litres <= 0.0 {
            for list in self.lots.values_mut() {
                let active = list.iter().any(|lot| lot.chilled);
                if active {
                    for lot in &mut *list {
                        lot.chilled = false;
                    }
                    merge(list);
                }
            }
            return;
        }
        let mut capacity = litres;
        let mut candidates: Vec<_> = self
            .lots
            .iter()
            .flat_map(|(id, lots)| {
                let priority = self.priority.rank(id);
                lots.iter()
                    .enumerate()
                    .filter(move |(_, lot)| !lot.preserved && lot.expires > now - dt)
                    .map(move |(index, lot)| {
                        (priority, !lot.chilled, lot.expires, id.clone(), index)
                    })
            })
            .collect();
        candidates.sort_by(|a, b| {
            a.0.cmp(&b.0)
                .then(a.1.cmp(&b.1))
                .then(a.2.total_cmp(&b.2))
                .then(a.3.cmp(&b.3))
        });
        for lots in self.lots.values_mut() {
            for lot in lots {
                lot.chilled = false;
            }
        }
        for (_, _, _, id, index) in candidates {
            if capacity <= 0.0 {
                break;
            }
            let size = catalog.materials[&id].volume * 1000.0;
            let room = ((capacity + 1e-9) / size).floor() as u32;
            if room == 0 {
                continue;
            }
            let lots = self.lots.get_mut(&id).expect("food cooling candidate");
            let lot = &mut lots[index];
            let kept = room.min(lot.units);
            let excess = lot.units - kept;
            lot.units = kept;
            lot.chilled = true;
            lot.expires += dt * 0.75;
            capacity -= f64::from(kept) * size;
            if excess > 0 {
                let overflow = Lot {
                    units: excess,
                    expires: lot.expires - dt * 0.75,
                    chilled: false,
                    ..lot.clone()
                };
                lots.push(overflow);
            }
        }
        for lots in self.lots.values_mut() {
            merge(lots);
        }
    }

    pub fn status(&self, catalog: &Catalog, capacity: f64) -> String {
        let remaining = self
            .lots
            .values()
            .flatten()
            .map(|lot| lot.expires)
            .min_by(f64::total_cmp)
            .map_or_else(
                || "No perishable food".into(),
                |expiry| {
                    format!(
                        "Next batch expires in {:.1} game hours",
                        ((expiry - self.clock) / HOUR).max(0.0)
                    )
                },
            );
        let used: f64 = self
            .lots
            .iter()
            .map(|(id, lots)| {
                lots.iter()
                    .filter(|lot| lot.chilled)
                    .map(|lot| f64::from(lot.units))
                    .sum::<f64>()
                    * catalog.materials[id].volume
                    * 1000.0
            })
            .sum();
        let spoiled: u64 = self.spoiled.values().copied().fold(0, u64::saturating_add);
        format!(
            "{remaining}\n{spoiled} units spoiled · {used:.1}/{capacity:.0} L cooled\nCooling: {} · T Change priority",
            self.priority.label()
        )
    }

    pub fn valid(&self, amounts: &BTreeMap<String, u32>) -> bool {
        !self.initialized
            || (self.clock >= 0.0
                && self.lots.iter().all(|(id, lots)| {
                    shelf(id).is_some()
                        && lots.iter().all(|lot| lot.units > 0 && lot.expires >= 0.0)
                })
                && FOODS.iter().all(|(id, _)| {
                    let recorded: u64 = self
                        .lots
                        .get(*id)
                        .into_iter()
                        .flatten()
                        .map(|lot| u64::from(lot.units))
                        .sum();
                    recorded == u64::from(amounts.get(*id).copied().unwrap_or(0))
                }))
    }
}

pub fn fresh(
    amounts: &BTreeMap<String, u32>,
    clock: f64,
    preserved: &BTreeMap<String, f64>,
) -> FoodLots {
    amounts
        .iter()
        .filter_map(|(id, &units)| {
            let default = shelf(id)?;
            if units == 0 {
                return None;
            }
            let duration = preserved.get(id).copied();
            Some((
                id.clone(),
                vec![Lot {
                    units,
                    expires: clock + duration.unwrap_or(default) * DAY,
                    preserved: duration.is_some(),
                    chilled: false,
                }],
            ))
        })
        .collect()
}

pub fn discard_expired(lots: &mut FoodLots, clock: f64) -> BTreeMap<String, u32> {
    lots.iter_mut()
        .filter_map(|(id, list)| {
            let mut lost = 0u32;
            list.retain(|lot| {
                if lot.expires <= clock {
                    lost = lost.saturating_add(lot.units);
                    false
                } else {
                    true
                }
            });
            (lost > 0).then(|| (id.clone(), lost))
        })
        .collect()
}

fn merge(lots: &mut Vec<Lot>) {
    lots.sort_by(|a, b| a.expires.total_cmp(&b.expires));
    let mut write = 0;
    for read in 0..lots.len() {
        if write > 0
            && lots[write - 1].preserved == lots[read].preserved
            && lots[write - 1].chilled == lots[read].chilled
            && lots[read].expires - lots[write - 1].expires < HOUR
        {
            lots[write - 1].units = lots[write - 1].units.saturating_add(lots[read].units);
        } else {
            lots.swap(write, read);
            write += 1;
        }
    }
    lots.truncate(write);
}

fn shelf(id: &str) -> Option<f64> {
    FOODS
        .iter()
        .find_map(|(kind, days)| (*kind == id).then_some(*days))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{setup::WorldSetup, stock::Stock};

    #[test]
    fn dried_and_chilled_food_keep_their_own_expiry() {
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
        let meals = BTreeMap::from([("meals".into(), 2)]);
        let dried = BTreeMap::from([("meals".into(), 10.0)]);
        stock.receive_with_lots(&meals, fresh(&meals, 0.0, &dried));
        stock.pantry.priority = CoolingPriority::Meals;
        let room = catalog.materials["meals"].volume * 1000.0;
        stock.age_food(&catalog, 200.0, 200.0, room);
        let chilled = stock.pantry.lots["meals"]
            .iter()
            .find(|lot| lot.chilled)
            .unwrap();
        assert_eq!(chilled.units, 1);
        assert_eq!(chilled.expires, DAY * 2.0 + 150.0);
        assert!(
            stock.pantry.lots["meals"]
                .iter()
                .any(|lot| lot.preserved && lot.expires == DAY * 10.0)
        );
        stock.age_food(&catalog, DAY * 2.0 + 1.0, 0.1, 0.0);
        assert_eq!(stock.available("meals"), 3);
        assert!(stock.valid_food());
    }
}
