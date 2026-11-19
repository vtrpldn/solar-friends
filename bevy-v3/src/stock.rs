use std::collections::{BTreeMap, VecDeque};

use serde::{Deserialize, Serialize};

use crate::{
    catalog::Catalog,
    equipment::{Equipment, Task},
    food::{self, FoodLots, Pantry, SERVINGS},
    setup::{Mode, WorldSetup},
};

const SANDBOX_UNITS: u32 = 9_999;
const SANDBOX_BALANCE_CENTS: u64 = 99_999_900;

fn tracked_recipe(id: &str) -> bool {
    matches!(
        id,
        "corn_feed"
            | "cook_greens"
            | "cook_beans"
            | "cook_corn"
            | "preserve_meals"
            | "saw_timber"
            | "saw_planks"
            | "frames"
            | "walls"
            | "tiles"
            | "meals"
            | "compost"
    )
}

#[derive(Clone, Default, Deserialize, Serialize)]
pub struct Stock {
    pub cash: u32,
    #[serde(default)]
    centavos: u8,
    #[serde(default)]
    ledger: BTreeMap<CashKind, i64>,
    #[serde(default)]
    cash_flow: CashFlow,
    #[serde(default)]
    pub sandbox: bool,
    #[serde(default)]
    pub pantry: Pantry,
    #[serde(default)]
    processing: BTreeMap<String, u64>,
    materials: BTreeMap<String, u32>,
    #[serde(default)]
    pub equipment: Equipment,
}

#[derive(Clone, Default, Deserialize, Serialize)]
struct CashFlow {
    started_day: Option<u64>,
    day: u64,
    operating: BTreeMap<u64, i64>,
    #[serde(default)]
    minute: u64,
    #[serde(default)]
    recent: VecDeque<Transaction>,
}

#[derive(Clone, Deserialize, Serialize)]
struct Transaction {
    minute: u64,
    category: CashKind,
    cents: i64,
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Deserialize, Serialize)]
pub enum CashKind {
    Construction,
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
            Self::Construction => "Construction",
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
        let mut stock = Self {
            cash: settings.starting_cash(),
            centavos: 0,
            ledger: BTreeMap::new(),
            cash_flow: CashFlow::default(),
            sandbox: settings.mode == Mode::Sandbox,
            pantry: Pantry::default(),
            processing: BTreeMap::new(),
            materials,
            equipment: Equipment::default(),
        };
        stock.replenish_sandbox(catalog);
        stock
    }

    pub(crate) fn replenish_sandbox(&mut self, catalog: &Catalog) {
        if !self.sandbox {
            return;
        }
        self.set_balance(SANDBOX_BALANCE_CENTS);
        for id in catalog.materials.keys() {
            if let Some(count) = self.materials.get_mut(id) {
                *count = SANDBOX_UNITS;
            } else {
                self.materials.insert(id.clone(), SANDBOX_UNITS);
            }
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
        self.record_cash(category, -(cents as i64));
    }

    pub fn credit(&mut self, cents: u64, category: CashKind) {
        let maximum = u64::from(u32::MAX) * 100 + 99;
        let before = self.balance();
        let after = before.saturating_add(cents).min(maximum);
        self.set_balance(after);
        self.record_cash(category, (after - before) as i64);
    }

    pub fn update_finance_clock(&mut self, clock: f64) {
        let minute = (540.0 + clock * 0.45).floor() as u64;
        self.cash_flow.minute = minute;
        let day = minute / 1440;
        self.cash_flow.started_day.get_or_insert(day);
        if self.cash_flow.day != day {
            self.cash_flow.day = day;
            self.cash_flow
                .operating
                .retain(|&recorded, _| recorded >= day.saturating_sub(90));
        }
    }

    fn record_cash(&mut self, category: CashKind, cents: i64) {
        let counter = self.ledger.entry(category).or_default();
        *counter = counter.saturating_add(cents);
        if self.sandbox || cents == 0 {
            return;
        }
        let flow = &mut self.cash_flow;
        if category != CashKind::Construction {
            let total = flow.operating.entry(flow.day).or_default();
            *total = total.saturating_add(cents);
        }
        if category == CashKind::Electricity
            && let Some(entry) = flow
                .recent
                .iter_mut()
                .find(|entry| entry.category == category && entry.minute / 1440 == flow.day)
        {
            entry.cents = entry.cents.saturating_add(cents);
        } else {
            flow.recent.push_front(Transaction {
                minute: flow.minute,
                category,
                cents,
            });
            flow.recent.truncate(100);
        }
    }

    pub fn record_processing(&mut self, id: &str) {
        if !self.sandbox && tracked_recipe(id) {
            let count = self.processing.entry(id.to_owned()).or_default();
            *count = count.saturating_add(1);
        }
    }

    pub fn processing_summary(&self, catalog: &Catalog) -> String {
        if self.sandbox {
            return "Processing records are available in Story.".into();
        }
        let mass = |bill: &BTreeMap<String, u32>| -> f64 {
            bill.iter()
                .map(|(id, amount)| catalog.materials[id].mass * f64::from(*amount))
                .sum()
        };
        let (mut batches, mut input, mut output) = (0u64, 0.0, 0.0);
        for (id, count) in &self.processing {
            let recipe = &catalog.production[id];
            batches = batches.saturating_add(*count);
            input += (mass(&recipe.input) + recipe.water) * (*count as f64);
            output += mass(&recipe.output) * (*count as f64);
        }
        let loss = (input - output).max(0.0);
        format!(
            "Processing · {batches} batches\nApprox. {input:.1} kg inputs · {output:.1} kg usable output · {loss:.1} kg process losses"
        )
    }

    pub fn valid_processing(&self, catalog: &Catalog) -> bool {
        self.processing
            .keys()
            .all(|id| tracked_recipe(id) && catalog.production.contains_key(id))
    }

    pub fn valid_cash_flow(&self) -> bool {
        let flow = &self.cash_flow;
        flow.recent.len() <= 100
            && flow
                .recent
                .iter()
                .all(|entry| entry.minute / 1440 <= flow.day)
            && flow.operating.len() <= 91
            && flow.started_day.is_none_or(|day| day <= flow.day)
            && flow
                .operating
                .keys()
                .all(|&day| (flow.day.saturating_sub(90)..=flow.day).contains(&day))
    }

    fn cash_forecast(&self, committed: u64) -> Option<(u64, f64, f64, f64)> {
        let flow = &self.cash_flow;
        let start = (flow.started_day?.saturating_add(1)).max(flow.day.saturating_sub(7));
        if start >= flow.day {
            return None;
        }
        let days = flow.day - start;
        let (low, high, total) = (start..flow.day)
            .map(|day| *flow.operating.get(&day).unwrap_or(&0) as f64 / 100.0)
            .fold(
                (f64::INFINITY, f64::NEG_INFINITY, 0.0),
                |(min, max, sum), change| (min.min(change), max.max(change), sum + change),
            );
        let available = self.balance().saturating_sub(committed) as f64 / 100.0;
        Some((
            days,
            available + 7.0 * low,
            available + 7.0 * high,
            total / days as f64,
        ))
    }

    fn set_balance(&mut self, value: u64) {
        self.cash = (value / 100) as u32;
        self.centavos = (value % 100) as u8;
    }

    pub fn finance_history(&self, page: usize) -> (usize, String) {
        const ROWS: usize = 8;
        let pages = self.cash_flow.recent.len().div_ceil(ROWS).max(1);
        let page = page.min(pages - 1);
        let mut display = format!(
            "Transactions · {}/{} · Page Up/Down · R Close",
            page + 1,
            pages
        );
        for entry in self.cash_flow.recent.iter().skip(page * ROWS).take(ROWS) {
            use std::fmt::Write;
            let day = entry.minute / 1440 + 1;
            let time = entry.minute % 1440;
            let category = if entry.category == CashKind::Electricity {
                "Grid electricity, daily total"
            } else {
                entry.category.label()
            };
            let _ = write!(
                display,
                "\nDay {day} · {:02}:{:02} · {} · R${:+.2}",
                time / 60,
                time % 60,
                category,
                entry.cents as f64 / 100.0
            );
        }
        if self.cash_flow.recent.is_empty() {
            display.push_str("\nNo recent transactions recorded.");
        }
        (pages, display)
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
        if let Some((days, low, high, mean)) = self.cash_forecast(committed) {
            display.push_str(&format!("\n7-day cash scenarios · R${low:.2} to R${high:.2}\n{days} completed days · Mean R${mean:+.2}/day · Excludes new construction"));
        } else {
            display.push_str("\nCash forecast needs one full recorded day.");
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

#[cfg(test)]
mod finance_tests {
    use super::*;
    use crate::weather::DAY;

    #[test]
    fn sandbox_replenishes_tools_consumables_and_cash() {
        let catalog = Catalog::default();
        let mut setup = WorldSetup::default();
        setup.mode = Mode::Sandbox;
        let mut stock = Stock::for_start(&setup, &catalog);
        assert_eq!(stock.available("cleaning-kit"), SANDBOX_UNITS);
        assert_eq!(stock.balance(), SANDBOX_BALANCE_CENTS);
        stock.reserve_available(&BTreeMap::from([("soap".into(), 1)]));
        stock.debit(100, CashKind::Materials);
        stock.materials.remove("cleaning-kit");

        stock.replenish_sandbox(&catalog);
        assert_eq!(stock.available("soap"), SANDBOX_UNITS);
        assert_eq!(stock.available("cleaning-kit"), SANDBOX_UNITS);
        assert_eq!(stock.balance(), SANDBOX_BALANCE_CENTS);
    }

    #[test]
    fn cash_scenarios_use_completed_operating_days_and_skip_construction() {
        let mut stock = Stock::for_start(&WorldSetup::default(), &Catalog::default());
        stock.update_finance_clock(0.0);
        stock.credit(700, CashKind::Sales);
        stock.update_finance_clock(DAY);
        stock.debit(1_000, CashKind::Construction);
        stock.debit(100, CashKind::Electricity);
        stock.debit(300, CashKind::Electricity);
        stock.update_finance_clock(2.0 * DAY);
        stock.update_finance_clock(3.0 * DAY);
        stock.credit(800, CashKind::Sales);
        stock.update_finance_clock(4.0 * DAY);
        stock.credit(10_000, CashKind::Sales);
        let committed = 500;
        let available = (stock.balance() - committed) as f64 / 100.0;
        let (days, low, high, mean) = stock.cash_forecast(committed).unwrap();
        assert_eq!(days, 3);
        assert_eq!(low, available - 28.0);
        assert_eq!(high, available + 56.0);
        assert!((mean - 4.0 / 3.0).abs() < 1e-9);
        let (_, history) = stock.finance_history(0);
        assert_eq!(history.matches("Grid electricity, daily total").count(), 1);
        assert!(history.contains("Day 2 · 09:00 · Grid electricity, daily total · R$-4.00"));
        let save = serde_json::to_string(&stock).unwrap();
        let restored: Stock = serde_json::from_str(&save).unwrap();
        assert_eq!(
            restored.cash_forecast(committed),
            Some((days, low, high, mean))
        );
    }
}
