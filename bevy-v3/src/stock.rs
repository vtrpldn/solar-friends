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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    movements: Option<MaterialLedger>,
    #[serde(default)]
    pub equipment: Equipment,
}

#[derive(Clone, Default, Deserialize, Serialize)]
struct CashFlow {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    opening_cents: Option<u64>,
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

#[derive(Clone, Default, Deserialize, Serialize)]
struct MaterialLedger {
    opening: BTreeMap<String, u32>,
    net: BTreeMap<String, i64>,
    recent: VecDeque<MaterialMovement>,
}

#[derive(Clone, Deserialize, Serialize)]
struct MaterialMovement {
    minute: u64,
    id: String,
    quantity: i64,
    reason: MaterialReason,
}

#[derive(Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
pub(crate) enum MaterialReason {
    Arrival,
    Transfer,
    Meal,
    Spoilage,
    Residues,
    Cleaning,
    Gathering,
    Harvest,
    ProductionDelivery,
    ProductionInput,
    ConstructionReservation,
    TownPickup,
    SupplierFreight,
}

impl MaterialReason {
    fn label(self) -> &'static str {
        match self {
            Self::Arrival => "Arrival or return",
            Self::Transfer => "Reserved or used",
            Self::Meal => "Meal",
            Self::Spoilage => "Spoilage",
            Self::Residues => "Organic residues",
            Self::Cleaning => "Cleaning",
            Self::Gathering => "Gathering delivery",
            Self::Harvest => "Harvest delivery",
            Self::ProductionDelivery => "Production delivery",
            Self::ProductionInput => "Production input",
            Self::ConstructionReservation => "Construction reservation",
            Self::TownPickup => "Town pickup",
            Self::SupplierFreight => "Supplier freight",
        }
    }
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
        let tier = settings.supply_tier();
        let materials = catalog
            .materials
            .iter()
            .map(|(id, material)| (id.clone(), material.starting[tier]))
            .collect();
        let mut stock = Self {
            cash: settings.starting_cash(),
            centavos: 0,
            ledger: BTreeMap::new(),
            cash_flow: CashFlow {
                opening_cents: (settings.mode != Mode::Sandbox)
                    .then(|| u64::from(settings.starting_cash()) * 100),
                minute: 540,
                ..CashFlow::default()
            },
            sandbox: settings.mode == Mode::Sandbox,
            pantry: Pantry::default(),
            processing: BTreeMap::new(),
            materials,
            movements: None,
            equipment: Equipment::default(),
        };
        stock.replenish_sandbox(catalog);
        stock.begin_material_ledger();
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
        let soap_before = self.available("soap");
        let mut no_soap = 0;
        let soap = if item == "cleaning-kit" {
            self.begin_material_ledger();
            self.materials.entry("soap".into()).or_default()
        } else {
            &mut no_soap
        };
        let rate = self.equipment.use_tool(
            (worker, task),
            item,
            dt,
            owned,
            (self.sandbox, repairing),
            soap,
        );
        if item == "cleaning-kit" {
            let used = soap_before - self.available("soap");
            self.record_material("soap", -i64::from(used), MaterialReason::Cleaning);
        }
        rate
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
        self.change_material(id, -i64::from(portions), MaterialReason::Meal);
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
        self.receive_materials(goods, Some(lots), MaterialReason::Arrival);
    }

    pub(crate) fn receive_materials(
        &mut self,
        goods: &BTreeMap<String, u32>,
        lots: Option<FoodLots>,
        reason: MaterialReason,
    ) {
        if !self.sandbox {
            self.pantry.ensure(&self.materials);
        }
        for (id, units) in goods {
            self.change_material(id, i64::from(*units), reason);
        }
        if !self.sandbox {
            self.pantry.insert(
                lots.unwrap_or_else(|| food::fresh(goods, self.pantry.clock, &BTreeMap::new())),
            );
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
            self.change_material(id, -i64::from(*quantity), MaterialReason::Spoilage);
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
        self.change_material("scraps", i64::from(whole), MaterialReason::Residues);
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
        self.begin_material_ledger();
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

    pub(crate) fn cash_forecast(&self, committed: u64) -> Option<(u64, f64, f64, f64)> {
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
        if let Some(opening) = self.cash_flow.opening_cents {
            display.push_str(&format!(
                "\nRecords began Day 1 · 09:00 · Opening savings R${:.2}",
                opening as f64 / 100.0
            ));
        } else if !self.sandbox {
            display.push_str("\nOpening savings are unavailable for this save.");
        }
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

    pub(crate) fn finance_opening(&self) -> (Option<u64>, Option<u64>) {
        (self.cash_flow.opening_cents, self.cash_flow.started_day)
    }

    pub(crate) fn construction_investment(&self) -> i128 {
        -i128::from(
            self.ledger
                .get(&CashKind::Construction)
                .copied()
                .unwrap_or_default(),
        )
    }

    pub(crate) fn finance_totals(&self) -> (i128, i128, i128) {
        let cents = |kind| i128::from(self.ledger.get(&kind).copied().unwrap_or_default());
        let income = cents(CashKind::Sales) + cents(CashKind::TownWages);
        let net = self.ledger.values().copied().map(i128::from).sum::<i128>();
        (income, income - net, -cents(CashKind::Electricity))
    }

    pub fn finance_summary(&self, committed: u64, freight: bool) -> String {
        let (available, reserved, charged) = if freight {
            (
                "Available after commitments",
                "Reserved for town trips and freight",
                "Includes queued construction freight",
            )
        } else {
            (
                "Available after pickup",
                "Reserved for town trips",
                "Charged when a trip departs",
            )
        };
        let mut display = format!(
            "Shared savings R${:.2} · {available} R${:.2}\n{reserved} R${:.2} · {charged}",
            self.balance() as f64 / 100.0,
            self.balance().saturating_sub(committed) as f64 / 100.0,
            committed as f64 / 100.0,
        );
        for (kind, cents) in &self.ledger {
            display.push_str(&format!(
                "\n{} · R${:+.2}",
                kind.label(),
                *cents as f64 / 100.0
            ));
        }
        let construction = -i128::from(
            self.ledger
                .get(&CashKind::Construction)
                .copied()
                .unwrap_or_default(),
        );
        let (income, expenses, _) = self.finance_totals();
        display.push_str(&format!(
            "\nRecorded income R${:.2} · Expenses R${:.2} · Net change R${:+.2}\nConstruction investment R${:.2} · Other cash spending R${:.2}",
            income as f64 / 100.0,
            expenses as f64 / 100.0,
            (income - expenses) as f64 / 100.0,
            construction.max(0) as f64 / 100.0,
            (expenses - construction).max(0) as f64 / 100.0,
        ));
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

    fn begin_material_ledger(&mut self) {
        if !self.sandbox && self.movements.is_none() {
            self.movements = Some(MaterialLedger {
                opening: self.materials.clone(),
                ..Default::default()
            });
        }
    }

    fn change_material(&mut self, id: &str, quantity: i64, reason: MaterialReason) {
        self.begin_material_ledger();
        let count = self.materials.entry(id.into()).or_default();
        let before = i64::from(*count);
        let after = (before + quantity).clamp(0, i64::from(u32::MAX));
        *count = after as u32;
        self.record_material(id, after - before, reason);
    }

    fn record_material(&mut self, id: &str, quantity: i64, reason: MaterialReason) {
        if self.sandbox || quantity == 0 {
            return;
        }
        let Some(ledger) = &mut self.movements else {
            return;
        };
        let minute = self.cash_flow.minute;
        let total = ledger.net.entry(id.into()).or_default();
        *total = total.saturating_add(quantity);
        if let Some(last) = ledger.recent.front_mut()
            && last.id == id
            && last.reason == reason
            && last.minute / 60 == minute / 60
        {
            last.quantity = last.quantity.saturating_add(quantity);
        } else {
            ledger.recent.push_front(MaterialMovement {
                minute,
                id: id.into(),
                quantity,
                reason,
            });
            ledger.recent.truncate(160);
        }
    }

    pub fn valid_material_ledger(&self, catalog: &Catalog) -> bool {
        self.movements.as_ref().is_none_or(|ledger| {
            ledger.recent.len() <= 160
                && ledger
                    .opening
                    .keys()
                    .chain(ledger.net.keys())
                    .all(|id| catalog.materials.contains_key(id))
                && ledger.recent.iter().all(|row| {
                    row.minute <= self.cash_flow.minute && catalog.materials.contains_key(&row.id)
                })
        })
    }

    pub fn material_history(&self, catalog: &Catalog) -> String {
        use std::fmt::Write;
        let Some(ledger) = &self.movements else {
            return "Store movements · No records yet".into();
        };
        let reconciled = catalog.materials.keys().all(|id| {
            let opening = i64::from(ledger.opening.get(id).copied().unwrap_or_default());
            opening.saturating_add(ledger.net.get(id).copied().unwrap_or_default())
                == i64::from(self.available(id))
        });
        let mut text = if reconciled {
            "Store movements · Recorded changes match current stores".to_owned()
        } else {
            "Store movements · Some changes are unrecorded. Use current stores.".to_owned()
        };
        for row in ledger.recent.iter().take(8) {
            let item = &catalog.materials[&row.id];
            let sign = if row.quantity < 0 { '−' } else { '+' };
            let _ = write!(
                text,
                "\nDay {} · {:02}:{:02} · {sign}{} {} · {}",
                row.minute / 1440 + 1,
                row.minute / 60 % 24,
                row.minute % 60,
                item.quantity_text(row.quantity.unsigned_abs()),
                item.name,
                row.reason.label(),
            );
        }
        text
    }

    pub fn reserve_available(&mut self, bill: &BTreeMap<String, u32>) -> FoodLots {
        self.reserve_materials(bill, MaterialReason::Transfer)
    }

    pub(crate) fn reserve_materials(
        &mut self,
        bill: &BTreeMap<String, u32>,
        reason: MaterialReason,
    ) -> FoodLots {
        if !self.sandbox {
            self.pantry.ensure(&self.materials);
        }
        let mut food = FoodLots::new();
        for (id, units) in bill {
            let take = self.available(id).min(*units);
            self.change_material(id, -i64::from(take), reason);
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

    #[test]
    fn material_history_reconciles_arrivals_and_reservations_after_reload() {
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
        let wood = stock.available("wood");
        let delivery = BTreeMap::from([("wood".to_owned(), 3)]);
        stock.receive(&delivery);
        stock.receive(&delivery);
        stock.reserve_available(&BTreeMap::from([("wood".into(), 2)]));
        assert_eq!(stock.available("wood"), wood + 4);
        let saved = serde_json::to_string(&stock).unwrap();
        let restored: Stock = serde_json::from_str(&saved).unwrap();
        assert!(restored.valid_material_ledger(&catalog));
        let history = restored.material_history(&catalog);
        assert!(history.contains("Recorded changes match current stores"));
        let movements = &restored.movements.as_ref().unwrap().recent;
        assert_eq!(movements[0].quantity, -2);
        assert_eq!(movements[1].quantity, 6);
        assert_eq!(history.matches("Arrival or return").count(), 1);
    }
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
        assert!(history.contains("Records began Day 1 · 09:00 · Opening savings R$10000.00"));
        assert!(
            stock
                .finance_summary(committed, false)
                .contains("Construction investment R$10.00 · Other cash spending R$4.00")
        );
        assert_eq!(history.matches("Grid electricity, daily total").count(), 1);
        assert!(history.contains("Day 2 · 09:00 · Grid electricity, daily total · R$-4.00"));
        let save = serde_json::to_string(&stock).unwrap();
        let restored: Stock = serde_json::from_str(&save).unwrap();
        assert_eq!(restored.finance_history(0).1, history);
        assert_eq!(
            restored.cash_forecast(committed),
            Some((days, low, high, mean))
        );
    }
}
