use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::{
    catalog::Catalog,
    setup::{Mode, WorldSetup},
};

#[derive(Default, Deserialize, Serialize)]
pub struct Stock {
    pub cash: u32,
    #[serde(default)]
    centavos: u8,
    #[serde(default)]
    ledger: BTreeMap<CashKind, i64>,
    #[serde(default)]
    pub sandbox: bool,
    materials: BTreeMap<String, u32>,
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
            materials,
        }
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
        let Some((id, portions)) = self.meal() else {
            return false;
        };
        *self.materials.get_mut(id).expect("meal available") -= portions;
        true
    }

    fn meal(&self) -> Option<(&'static str, u32)> {
        [("meals", 1), ("food", 1), ("eggs", 4), ("milk", 2)]
            .into_iter()
            .find(|(id, quantity)| self.available(id) >= *quantity)
    }

    pub fn units(&self) -> u64 {
        self.materials.values().map(|units| u64::from(*units)).sum()
    }

    pub fn food_portions(&self) -> u32 {
        [("meals", 1), ("food", 1), ("eggs", 4), ("milk", 2)]
            .into_iter()
            .map(|(id, portion)| self.available(id) / portion)
            .sum()
    }

    pub fn receive(&mut self, goods: &BTreeMap<String, u32>) {
        for (id, units) in goods {
            let count = self.materials.entry(id.clone()).or_default();
            *count = count.saturating_add(*units);
        }
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

    pub fn reserve_available(&mut self, bill: &BTreeMap<String, u32>) {
        for (id, units) in bill {
            let count = self.materials.entry(id.clone()).or_default();
            *count -= (*count).min(*units);
        }
    }
}
