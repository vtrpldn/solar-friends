use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::{
    catalog::Catalog,
    equipment::{Equipment, Task},
    food::{self, FoodLots, Pantry, SERVINGS},
    setup::{Mode, WorldSetup},
};

#[derive(Clone, Default, Deserialize, Serialize)]
pub struct Stock {
    pub cash: u32,
    #[serde(default)]
    centavos: u8,
    #[serde(default)]
    ledger: BTreeMap<CashKind, i64>,
    #[serde(default)]
    pub sandbox: bool,
    #[serde(default)]
    pub pantry: Pantry,
    materials: BTreeMap<String, u32>,
    #[serde(default)]
    pub equipment: Equipment,
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Deserialize, Serialize)]
pub enum CashKind {
    Materials,
    Fuel,
    Electricity,
    Commuting,
    TownWages,
    Sales,
    Food,
    Freight,
}

impl CashKind {
    fn label(self) -> &'static str {
        match self {
            Self::Materials => "Materials",
            Self::Fuel => "Fuel",
            Self::Electricity => "Grid electricity",
            Self::Commuting => "Bus fares",
            Self::TownWages => "Town wages",
            Self::Sales => "Town sales",
            Self::Food => "Food purchases",
            Self::Freight => "Delivery freight",
        }
    }
}

impl Stock {
    pub fn for_start(settings: &WorldSetup, catalog: &Catalog) -> Self {
        let (numerator, denominator) = settings.supply_scale();
        let materials = catalog
            .materials
            .iter()
            .map(|(id, material)| {
                let scaled = material.starting * numerator;
                let count = if id == "wood" {
                    (scaled + denominator / 2) / denominator
                } else {
                    scaled.div_ceil(denominator)
                };
                (id.clone(), count)
            })
            .collect();
        Self {
            cash: settings.starting_cash(),
            centavos: 0,
            ledger: BTreeMap::new(),
            sandbox: settings.mode == Mode::Sandbox,
            pantry: Pantry::default(),
            materials,
            equipment: Equipment::default(),
        }
    }

    pub fn use_tool(
        &mut self,
        worker: usize,
        item: &str,
        task: Task,
        dt: f64,
        repairing: bool,
    ) -> f64 {
        let owned = self.available(item);
        if owned == 0 {
            return 1.0;
        }
        let mut no_soap = 0;
        let soap = if item == "cleaning-kit" {
            self.materials.entry("soap".into()).or_default()
        } else {
            &mut no_soap
        };
        self.equipment.use_tool(
            (worker, task),
            item,
            dt,
            owned,
            (self.sandbox, repairing),
            soap,
        )
    }

    pub fn available(&self, id: &str) -> u32 {
        self.materials.get(id).copied().unwrap_or(0)
    }

    pub fn has_meal(&self) -> bool {
        self.meal().is_some()
    }

    pub fn eat(&mut self) -> bool {
        if self.sandbox {
            return true;
        }
        self.pantry.ensure(&self.materials);
        let Some((id, portions)) = self.meal() else {
            return false;
        };
        *self.materials.get_mut(id).expect("meal available") -= portions;
        self.pantry.remove(id, portions);
        self.add_waste(if id == "eggs" {
            0.024
        } else if id == "milk" {
            0.0
        } else {
            0.2
        });
        true
    }

    fn meal(&self) -> Option<(&'static str, u32)> {
        SERVINGS
            .into_iter()
            .filter(|(id, quantity)| self.available(id) >= *quantity)
            .min_by(|(a, _), (b, _)| {
                let expiry = |id| {
                    self.pantry
                        .lots
                        .get(id)
                        .and_then(|list| list.first())
                        .map_or(f64::INFINITY, |lot| lot.expires)
                };
                expiry(*a).total_cmp(&expiry(*b))
            })
    }

    pub fn units(&self) -> u64 {
        self.materials.values().map(|units| u64::from(*units)).sum()
    }

    pub fn food_portions(&self) -> u32 {
        SERVINGS
            .into_iter()
            .map(|(id, portion)| self.available(id) / portion)
            .fold(0, u32::saturating_add)
    }

    pub fn receive(&mut self, goods: &BTreeMap<String, u32>) {
        self.receive_with_lots(
            goods,
            food::fresh(goods, self.pantry.clock, &BTreeMap::new()),
        );
    }

    pub fn receive_with_lots(&mut self, goods: &BTreeMap<String, u32>, lots: FoodLots) {
        if !self.sandbox {
            self.pantry.ensure(&self.materials);
        }
        for (id, units) in goods {
            let count = self.materials.entry(id.clone()).or_default();
            *count = count.saturating_add(*units);
        }
        if !self.sandbox {
            self.pantry.insert(lots);
        }
    }

    pub fn age_food(&mut self, catalog: &Catalog, clock: f64, dt: f64, cooling: f64) {
        self.pantry.clock = clock;
        if self.sandbox {
            return;
        }
        self.pantry.ensure(&self.materials);
        self.pantry.cool(catalog, cooling, dt, clock);
        let lost = food::discard_expired(&mut self.pantry.lots, clock);
        for (id, quantity) in &lost {
            let count = self.materials.entry(id.clone()).or_default();
            *count = count.saturating_sub(*quantity);
        }
        self.record_spoilage(catalog, &lost);
    }

    pub fn record_spoilage(&mut self, catalog: &Catalog, lost: &BTreeMap<String, u32>) {
        for (id, quantity) in lost {
            let count = self.pantry.spoiled.entry(id.clone()).or_default();
            *count = count.saturating_add(u64::from(*quantity));
            if let Some(item) = catalog.materials.get(id) {
                self.add_waste(f64::from(*quantity) * item.mass);
            }
        }
    }

    pub fn valid_food(&self) -> bool {
        self.sandbox || self.pantry.valid(&self.materials)
    }

    fn add_waste(&mut self, kg: f64) {
        let total = self.pantry.waste_remainder + kg;
        let whole = (total + 1e-9).floor() as u32;
        self.pantry.waste_remainder =
            ((total - f64::from(whole)) * 1_000_000.0).round().max(0.0) / 1_000_000.0;
        let scraps = self.materials.entry("scraps".into()).or_default();
        *scraps = scraps.saturating_add(whole);
    }

    pub fn balance(&self) -> u64 {
        u64::from(self.cash) * 100 + u64::from(self.centavos)
    }

    pub fn debit(&mut self, cents: u64, category: CashKind) {
        if cents == 0 {
            return;
        }
        let balance = self
            .balance()
            .checked_sub(cents)
            .expect("purchase was quoted against available balance");
        self.set_balance(balance);
        let counter = self.ledger.entry(category).or_default();
        *counter = counter.saturating_sub(cents as i64);
    }

    pub fn credit(&mut self, cents: u64, category: CashKind) {
        let maximum = u64::from(u32::MAX) * 100 + 99;
        let before = self.balance();
        let after = before.saturating_add(cents).min(maximum);
        self.set_balance(after);
        let counter = self.ledger.entry(category).or_default();
        *counter = counter.saturating_add((after - before) as i64);
    }

    fn set_balance(&mut self, value: u64) {
        self.cash = (value / 100) as u32;
        self.centavos = (value % 100) as u8;
    }

    pub fn finance_summary(&self, committed: u64) -> String {
        let mut display = format!(
            "Shared savings R${:.2} · Available after pickup R${:.2}",
            self.balance() as f64 / 100.0,
            self.balance().saturating_sub(committed) as f64 / 100.0
        );
        for (kind, cents) in &self.ledger {
            display.push_str(&format!(
                "\n{} · R${:+.2}",
                kind.label(),
                *cents as f64 / 100.0
            ));
        }
        display
    }

    pub fn missing<'a>(&self, bill: &'a BTreeMap<String, u32>) -> Option<&'a str> {
        bill.iter()
            .find_map(|(id, units)| (self.available(id) < *units).then_some(id.as_str()))
    }

    pub fn reserve_available(&mut self, bill: &BTreeMap<String, u32>) -> FoodLots {
        if !self.sandbox {
            self.pantry.ensure(&self.materials);
        }
        let mut food = FoodLots::new();
        for (id, units) in bill {
            let count = self.materials.entry(id.clone()).or_default();
            let take = (*count).min(*units);
            *count -= take;
            if !self.sandbox {
                let taken = self.pantry.remove(id, take);
                if !taken.is_empty() {
                    food.insert(id.clone(), taken);
                }
            }
        }
        food
    }
}
