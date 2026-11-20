use std::collections::{BTreeMap, VecDeque};

use serde::{Deserialize, Serialize};

use crate::{
    catalog::{Catalog, Material},
    food::{self, FoodLots},
    market::Market,
    stock::{CashKind, MaterialReason, Stock},
};

#[derive(Default, Deserialize, Serialize)]
pub struct Trade {
    pub orders: VecDeque<Shipment>,
    bought: BTreeMap<String, Daily>,
    pub policies: BTreeMap<String, Policy>,
    pub receipts: u64,
    #[serde(default)]
    pub purchases: u64,
    #[serde(default)]
    pub delivery: Option<Delivery>,
    #[serde(skip)]
    pub selected: usize,
    #[serde(skip)]
    pub page: usize,
    #[serde(skip)]
    pub queue_page: Option<usize>,
    #[serde(skip)]
    pub notice: String,
    next_scan: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    dispatch_at: Option<f64>,
    #[serde(default)]
    next_pantry_check: f64,
    #[serde(default)]
    pub household_restock_off: bool,
    #[serde(default)]
    pantry_purchase: PantryPurchase,
}

#[derive(Deserialize, Serialize)]
struct PantryPurchase {
    reserve_half_days: u8,
    allowance_cents: u64,
    day: u64,
    reserved_cents: u64,
}

impl Default for PantryPurchase {
    fn default() -> Self {
        Self {
            reserve_half_days: 3,
            allowance_cents: 15_000,
            day: 0,
            reserved_cents: 0,
        }
    }
}

#[derive(Deserialize, Serialize)]
pub struct Shipment {
    pub material: String,
    pub quantity: u32,
    pub cents: u64,
    pub fare: u64,
    pub day: u64,
    pub settled: bool,
    #[serde(default)]
    pub buying: bool,
    #[serde(default)]
    pub spoiled: bool,
    #[serde(default)]
    pub hold_for_pickup: bool,
    #[serde(default)]
    food: Option<FoodLots>,
}

#[derive(Deserialize, Serialize)]
pub struct Delivery {
    pub material: String,
    pub quantity: u32,
    pub eta: f64,
    #[serde(default)]
    food: Option<FoodLots>,
}

#[derive(Default, Deserialize, Serialize)]
struct Daily {
    day: u64,
    units: u32,
}

#[derive(Default, Deserialize, Serialize)]
pub struct Policy {
    pub enabled: bool,
    pub reserve: u32,
    pub trigger: u32,
    pub limit: u32,
    day: u64,
    sold: u32,
}

#[derive(Clone, Copy)]
pub(crate) struct TradeItem<'a> {
    pub group: &'a str,
    pub id: &'a str,
    pub material: &'a Material,
}

fn sale_cents(item: &Material, sold: u32, quantity: u32) -> u64 {
    let rate = |before| {
        let ratio = if before / item.pack < item.buyer.full_price_batches {
            item.buyer.ratio
        } else {
            item.buyer.bulk_ratio
        };
        (item.price * ratio).floor() as u64 * 100
    };
    let first = quantity.min((sold / item.pack + 1) * item.pack - sold);
    (rate(sold) * u64::from(first) + rate(sold + first) * u64::from(quantity - first))
        / u64::from(item.pack)
}

impl Trade {
    pub(crate) fn tradable(catalog: &Catalog) -> Vec<TradeItem<'_>> {
        catalog
            .resource_entries()
            .filter(|(_, _, item)| item.pack > 0 && item.price > 0.0)
            .map(|(group, id, material)| TradeItem {
                group,
                id,
                material,
            })
            .collect()
    }

    pub(crate) fn default_sale_reserve(id: &str) -> u32 {
        if matches!(id, "food" | "meals") {
            crate::village::NAMES.len() as u32 * 4
        } else {
            12
        }
    }

    pub(crate) fn sale_policy(&mut self, id: &str) -> &mut Policy {
        self.policies.entry(id.into()).or_insert_with(|| {
            let reserve = Self::default_sale_reserve(id);
            Policy {
                reserve,
                trigger: reserve,
                ..Policy::default()
            }
        })
    }

    pub(crate) fn note_sale_queued(&mut self, clock: f64) {
        self.dispatch_at
            .get_or_insert(clock + crate::economy_reference::SALE_DISPATCH_DELAY);
    }

    pub(crate) fn clear_sale_dispatch(&mut self) {
        self.dispatch_at = None;
    }

    pub(crate) fn sale_dispatch_ready(&self, clock: f64) -> bool {
        self.sale_dispatch_wait(clock).is_none()
    }

    pub(crate) fn sale_dispatch_wait(&self, clock: f64) -> Option<f64> {
        self.dispatch_at
            .map(|at| at - clock)
            .filter(|&wait| wait > 0.)
    }

    pub fn buyer_reserved(&self, id: &str, day: u64) -> u32 {
        self.bought
            .get(id)
            .filter(|entry| entry.day == day)
            .map_or(0, |entry| entry.units)
    }

    pub fn quote(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        id: &str,
        day: u64,
        protect: u32,
    ) -> Result<(u32, u64), &'static str> {
        let item = &catalog.materials[id];
        if item.pack == 0 || item.price == 0.0 {
            return Err("There is no local buyer for this resource.");
        }
        let owned = stock.available(id);
        let protected_tools = stock.equipment.protected(id, owned);
        if owned > 0 && protected_tools == owned && protect < owned {
            return Err("Return borrowed tools or repair worn tools before selling.");
        }
        let protect = protect.max(protected_tools);
        let quantity = owned.saturating_sub(protect).min(item.pack);
        if quantity == 0 {
            return Err("No unreserved stock to sell.");
        }
        let sold = self.buyer_reserved(id, day);
        if sold + quantity > item.buyer.batches * item.pack {
            return Err("The buyer has enough for today.");
        }
        let (mass_limit, volume_limit) = crate::market::PICKUP_CAPACITY;
        if f64::from(quantity) * item.mass > mass_limit + 1e-8
            || f64::from(quantity) * item.volume > volume_limit + 1e-8
        {
            return Err("This batch needs a larger vehicle.");
        }
        Ok((quantity, sale_cents(item, sold, quantity)))
    }

    pub fn quote_sale_order(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        id: &str,
        day: u64,
        protect: u32,
    ) -> Result<(u32, u64), &'static str> {
        if self.orders.len() >= 32 {
            return Err("The town sale queue is full.");
        }
        self.quote(catalog, stock, id, day, protect)
    }

    pub fn reserve(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        market: &mut Market,
        id: &str,
        (day, fare, protect): (u64, u64, u32),
    ) -> Result<u32, &'static str> {
        let (quantity, cents) = self.quote_sale_order(catalog, stock, id, day, protect)?;
        if !market.hold_fare(stock, fare) {
            return Err("Shared savings cannot cover the trip fuel.");
        }
        let food = stock.reserve_available(&BTreeMap::from([(id.to_owned(), quantity)]));
        let entry = self.bought.entry(id.to_owned()).or_default();
        if entry.day != day {
            *entry = Daily { day, units: 0 };
        }
        entry.units += quantity;
        self.orders.push_back(Shipment {
            material: id.into(),
            quantity,
            cents,
            fare,
            day,
            settled: false,
            buying: false,
            spoiled: false,
            hold_for_pickup: false,
            food: Some(food),
        });
        Ok(quantity)
    }

    pub fn buy(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        market: &mut Market,
        id: &str,
        (clock, distance, freight): (f64, u32, bool),
    ) -> Result<(), &'static str> {
        let fare = if freight {
            crate::market::freight_cents(distance)
        } else {
            crate::market::fare_cents(distance)
        };
        self.buy_with_fare(catalog, stock, market, id, (clock, distance, freight, fare))
    }

    pub fn buy_on_return_trip(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        market: &mut Market,
        id: &str,
        clock: f64,
    ) -> Result<(), &'static str> {
        self.buy_with_fare(catalog, stock, market, id, (clock, 0, false, 0))
    }

    pub fn purchase_slot(&self, freight: bool) -> Result<(), &'static str> {
        if freight && self.delivery.is_some() {
            return Err("A freight order is already on the way.");
        }
        if !freight && self.orders.len() >= 32 {
            return Err("The town order queue is full.");
        }
        Ok(())
    }

    fn buy_with_fare(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        market: &mut Market,
        id: &str,
        (clock, distance, freight, fare): (f64, u32, bool, u64),
    ) -> Result<(), &'static str> {
        self.purchase_slot(freight)?;
        let day = pantry_day(clock);
        let (quantity, cents) = market.buy_pack(catalog, stock, id, (day, fare, freight))?;
        let food = food::fresh(
            &BTreeMap::from([(id.to_owned(), quantity)]),
            clock,
            &BTreeMap::new(),
        );
        if freight {
            let eta = clock + crate::market::freight_seconds(distance);
            self.delivery = Some(Delivery {
                material: id.into(),
                quantity,
                eta,
                food: Some(food),
            });
        } else {
            self.orders.push_back(Shipment {
                material: id.into(),
                quantity,
                cents,
                fare,
                day,
                settled: false,
                buying: true,
                spoiled: false,
                hold_for_pickup: false,
                food: Some(food),
            });
        }
        Ok(())
    }

    pub(crate) fn pantry_check_due(&self, clock: f64) -> bool {
        !self.household_restock_off
            && clock >= self.next_pantry_check
            && crate::market::town_is_open(clock)
    }

    pub fn maintain_pantry(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        market: &mut Market,
        (clock, distance, space, freight, shared, protected_cash): (f64, u32, u64, bool, bool, u64),
    ) -> Option<usize> {
        if stock.sandbox || !self.pantry_check_due(clock) {
            return None;
        }
        self.next_pantry_check = clock + 10.0;
        if !self.pantry_needs_food(stock, clock) {
            return None;
        }
        let free = space.saturating_sub(self.inbound());
        let ingredients = &catalog.materials["food"];
        let transport = if freight {
            crate::market::freight_cents(distance)
        } else if shared {
            0
        } else {
            crate::market::fare_cents(distance)
        };
        let cost = (ingredients.price * 100.0).round() as u64 + transport;
        let day = pantry_day(clock);
        let already_reserved = if day == self.pantry_purchase.day {
            self.pantry_purchase.reserved_cents
        } else {
            0
        };
        let order = self.orders.len();
        if cost + already_reserved <= self.pantry_purchase.allowance_cents
            && cost <= stock.balance().saturating_sub(protected_cash)
            && u64::from(ingredients.pack) <= free
            && self
                .buy_with_fare(
                    catalog,
                    stock,
                    market,
                    "food",
                    (clock, distance, freight, transport),
                )
                .is_ok()
        {
            self.pantry_purchase.day = day;
            self.pantry_purchase.reserved_cents = already_reserved + cost;
            return shared.then_some(order);
        }
        None
    }

    pub(crate) fn set_pantry_policy(
        &mut self,
        enabled: bool,
        reserve_half_days: Option<u8>,
        allowance_cents: Option<u64>,
    ) -> Result<(), &'static str> {
        if reserve_half_days.is_some_and(|reserve| reserve > 14)
            || allowance_cents.is_some_and(|budget| budget > 10_000_000)
        {
            return Err("Pantry reserve or daily budget exceeds the supported limit.");
        }
        self.household_restock_off = !enabled;
        let policy = &mut self.pantry_purchase;
        if let Some(reserve) = reserve_half_days {
            policy.reserve_half_days = reserve;
        }
        if let Some(budget) = allowance_cents {
            policy.allowance_cents = budget;
        }
        Ok(())
    }

    pub fn pantry_controls(&mut self, reserve_change: i8, budget_change: i64, toggle: bool) {
        if toggle {
            self.household_restock_off = !self.household_restock_off;
        }
        let policy = &mut self.pantry_purchase;
        policy.reserve_half_days = policy
            .reserve_half_days
            .saturating_add_signed(reserve_change)
            .min(14);
        policy.allowance_cents = policy
            .allowance_cents
            .saturating_add_signed(budget_change)
            .min(10_000_000);
    }

    pub(crate) fn pantry_needs_food(&self, stock: &Stock, clock: f64) -> bool {
        let forecast = self.pantry_forecast(stock, clock);
        forecast
            .served
            .saturating_add(self.incoming_servings(clock))
            < forecast.target
    }

    fn incoming_servings(&self, clock: f64) -> u32 {
        let servings = |id: &str, quantity| {
            food::SERVINGS
                .iter()
                .find(|&&(material, _)| material == id)
                .map_or(0, |&(_, units)| quantity / units)
        };
        self.orders
            .iter()
            .filter(|order| order.buying)
            .map(|order| servings(&order.material, order.quantity))
            .sum::<u32>()
            + self.delivery.as_ref().map_or(0, |order| {
                let usable = order
                    .food
                    .as_ref()
                    .and_then(|lots| lots.get(&order.material))
                    .map_or(order.quantity, |lots| {
                        lots.iter()
                            .filter(|lot| lot.expires > order.eta.max(clock))
                            .map(|lot| lot.units)
                            .sum()
                    });
                servings(&order.material, usable)
            })
    }

    fn pantry_forecast(&self, stock: &Stock, clock: f64) -> food::Forecast {
        stock
            .pantry
            .forecast(clock, self.pantry_purchase.reserve_half_days, |id| {
                stock.available(id)
            })
    }

    pub fn pantry_purchase_status(&self, stock: &Stock, clock: f64) -> String {
        let policy = &self.pantry_purchase;
        let state = if self.household_restock_off {
            "off"
        } else {
            "on"
        };
        if stock.sandbox {
            return format!(
                "U Automatic food purchases {state}\n[ ] Reserve {:.1} days · Shift [ ] Daily limit R${:.0}\nFood forecasts are inactive in Sandbox.",
                f64::from(policy.reserve_half_days) / 2.0,
                policy.allowance_cents as f64 / 100.0,
            );
        }
        let forecast = self.pantry_forecast(stock, clock);
        let shortfall = forecast.target.saturating_sub(forecast.served);
        let reserve_status = if shortfall > 0 {
            format!("Reserve short by {shortfall} portions")
        } else {
            "Reserve covered".into()
        };
        let used = if policy.day == pantry_day(clock) {
            policy.reserved_cents
        } else {
            0
        };
        format!(
            "U Automatic food purchases {state}\n[ ] Reserve {:.1} days · Shift [ ] Daily limit R${:.0}\nR${:.2} reserved today including transport\n{reserve_status} · {}/{} portions usable before expiry\n{:.1} servings may spoil · {} expected from incoming orders\nReserve estimate uses current stores and expiry dates.",
            f64::from(policy.reserve_half_days) / 2.0,
            policy.allowance_cents as f64 / 100.0,
            used as f64 / 100.0,
            forecast.served,
            forecast.target,
            forecast.at_risk,
            self.incoming_servings(clock),
        )
    }

    pub fn reserved_at_home(&self, boarded: &[usize]) -> u64 {
        self.orders
            .iter()
            .enumerate()
            .filter(|(index, order)| !order.buying && !boarded.contains(index))
            .map(|(_, order)| u64::from(order.quantity))
            .sum()
    }

    pub fn inbound(&self) -> u64 {
        self.orders
            .iter()
            .filter(|order| order.buying)
            .map(|order| u64::from(order.quantity))
            .sum::<u64>()
            + self
                .delivery
                .as_ref()
                .map_or(0, |order| u64::from(order.quantity))
    }

    pub fn receive_goods(&mut self, stock: &mut Stock, space: u64, clock: f64) -> Option<Delivery> {
        let order = self.delivery.as_ref()?;
        if order.eta > clock || u64::from(order.quantity) > space {
            return None;
        }
        let mut order = self.delivery.take().expect("arrived freight");
        let goods = BTreeMap::from([(order.material.clone(), order.quantity)]);
        stock.receive_materials(&goods, order.food.take(), MaterialReason::SupplierFreight);
        if order.quantity > 0 {
            self.purchases = self.purchases.saturating_add(1);
        }
        Some(order)
    }

    pub fn finish_trip(&mut self, index: usize, stock: &mut Stock, space: u64) -> bool {
        let Some(order) = self.orders.get(index) else {
            return true;
        };
        if (order.buying || order.spoiled) && u64::from(order.quantity) > space {
            return false;
        }
        let order = self.orders.remove(index).expect("completed town trip");
        if (order.buying || order.spoiled) && order.quantity > 0 {
            let goods = BTreeMap::from([(order.material, order.quantity)]);
            let reason = if order.buying {
                MaterialReason::TownPickup
            } else {
                MaterialReason::Arrival
            };
            stock.receive_materials(&goods, order.food, reason);
            if order.buying {
                self.purchases = self.purchases.saturating_add(1);
            }
        }
        true
    }

    pub fn cancel_order(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        market: &mut Market,
        index: usize,
    ) -> Option<usize> {
        let order = self.orders.remove(index)?;
        if order.buying {
            market.cancel_pack(
                stock,
                &order.material,
                order.day,
                catalog.materials[&order.material].pack,
                order.cents,
                order.fare,
            );
            self.notice = "Purchase canceled. Shared savings refunded.".into();
            return Some(index);
        }
        let goods = BTreeMap::from([(order.material.clone(), order.quantity)]);
        if let Some(lots) = order.food {
            stock.receive_with_lots(&goods, lots);
        } else {
            stock.receive(&goods);
        }
        market.release_fare(order.fare);
        if let Some(entry) = self.bought.get_mut(&order.material)
            && entry.day == order.day
        {
            entry.units = entry.units.saturating_sub(order.quantity);
        }
        self.notice = "Sale canceled. Goods returned to stock.".into();
        Some(index)
    }

    pub fn settle(&mut self, index: usize, stock: &mut Stock) {
        if let Some(order) = self.orders.get_mut(index)
            && !order.buying
            && !order.spoiled
            && !order.settled
        {
            order.settled = true;
            stock.credit(order.cents, CashKind::Sales);
            self.receipts = self.receipts.saturating_add(1);
        }
    }

    pub fn automatic_sale_offer(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        id: &str,
        day: u64,
    ) -> (u32, Result<(u32, u64), &'static str>) {
        let policy = self.policies.get(id);
        let owned = stock.available(id);
        let default_reserve = Self::default_sale_reserve(id);
        let mut reserve = policy.map_or(default_reserve, |policy| policy.reserve);
        if let Some((_, units_per_portion)) = food::SERVINGS.iter().find(|(food, _)| *food == id) {
            let target = (15 * u32::from(self.pantry_purchase.reserve_half_days)).div_ceil(2);
            let other_portions = stock
                .food_portions()
                .saturating_sub(owned / units_per_portion);
            reserve = reserve.max(target.saturating_sub(other_portions) * units_per_portion);
        }
        reserve = reserve.max(stock.equipment.protected(id, owned));
        let item = &catalog.materials[id];
        let pack = item.pack;
        let surplus = owned.saturating_sub(reserve);
        let available = policy.map_or(surplus, |policy| {
            if policy.limit == 0 {
                surplus
            } else {
                let sold = if policy.day == day { policy.sold } else { 0 };
                surplus.min(policy.limit.saturating_sub(sold))
            }
        });
        let offer = if owned <= policy.map_or(default_reserve, |policy| policy.trigger) {
            Err("Below the sale trigger")
        } else if surplus < pack {
            Err("Reserve protected or less than one pack")
        } else if available < pack {
            Err("Daily sale limit reached")
        } else {
            self.quote_sale_order(catalog, stock, id, day, reserve)
                .map(|_| {
                    let sold = self.buyer_reserved(id, day);
                    let demand = (item.buyer.batches * pack).saturating_sub(sold);
                    let batches = (available.min(demand) / pack).min(32 - self.orders.len() as u32);
                    let cents = (0..batches)
                        .map(|batch| sale_cents(item, sold + batch * pack, pack))
                        .sum();
                    (batches * pack, cents)
                })
        };
        (reserve, offer)
    }

    pub fn auto_sell(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        market: &mut Market,
        clock: f64,
        fare: u64,
    ) {
        if stock.sandbox || clock < self.next_scan {
            return;
        }
        self.next_scan = clock + 1.0;
        let day = pantry_day(clock);
        let keys: Vec<_> = self
            .policies
            .iter()
            .filter(|(_, policy)| policy.enabled)
            .map(|(id, _)| id.clone())
            .collect();
        for id in keys {
            let (reserve, offer) = self.automatic_sale_offer(catalog, stock, &id, day);
            let Ok((offered, _)) = offer else {
                continue;
            };
            let policy = self.policies.get_mut(&id).expect("active sale policy");
            if policy.day != day {
                policy.day = day;
                policy.sold = 0;
            }
            let pack = catalog.materials[&id].pack;
            for _ in 0..offered / pack {
                let Ok(quantity) = self.reserve(catalog, stock, market, &id, (day, fare, reserve))
                else {
                    break;
                };
                self.note_sale_queued(clock);
                self.policies.get_mut(&id).expect("active sale policy").sold += quantity;
            }
        }
    }

    pub fn age_shipments(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        market: &mut Market,
        clock: f64,
        locked: &[usize],
    ) -> Vec<usize> {
        if stock.sandbox {
            return Vec::new();
        }
        if let Some(delivery) = &mut self.delivery
            && let Some(lots) = &mut delivery.food
        {
            let loss = food::discard_expired(lots, clock);
            delivery.quantity = delivery
                .quantity
                .saturating_sub(loss.get(&delivery.material).copied().unwrap_or(0));
            stock.record_spoilage(catalog, &loss);
        }
        let mut removed = Vec::new();
        for index in (0..self.orders.len()).rev() {
            let order = &mut self.orders[index];
            if order.settled {
                continue;
            }
            let Some(lots) = &mut order.food else {
                continue;
            };
            let loss = food::discard_expired(lots, clock);
            if loss.is_empty() {
                continue;
            }
            stock.record_spoilage(catalog, &loss);
            let reserved = order.quantity;
            order.quantity = order
                .quantity
                .saturating_sub(loss.get(&order.material).copied().unwrap_or(0));
            if order.buying {
                continue;
            }
            if !order.spoiled
                && let Some(entry) = self.bought.get_mut(&order.material)
                && entry.day == order.day
            {
                entry.units = entry.units.saturating_sub(reserved);
            }
            order.spoiled = true;
            if locked.contains(&index) {
                continue;
            }
            removed.push(index);
            let order = self.orders.remove(index).expect("spoiled queued sale");
            let goods = BTreeMap::from([(order.material, order.quantity)]);
            stock.receive_with_lots(&goods, order.food.unwrap_or_default());
            market.release_fare(order.fare);
            self.notice = "Reserved food spoiled before sale.".into();
        }
        removed
    }

    pub fn valid(&self, catalog: &Catalog) -> bool {
        if self
            .dispatch_at
            .is_some_and(|at| !at.is_finite() || at < 0.)
        {
            return false;
        }
        self.pantry_purchase.reserve_half_days <= 14
            && self.pantry_purchase.allowance_cents <= 10_000_000
            && self.pantry_purchase.reserved_cents <= 10_000_000
            && self.delivery.as_ref().is_none_or(|order| {
                order.eta >= 0.0
                    && catalog
                        .materials
                        .get(&order.material)
                        .is_some_and(|item| order.quantity <= item.pack)
            })
            && self.orders.len() <= 32
            && self.orders.iter().all(|order| {
                catalog.materials.get(&order.material).is_some_and(|item| {
                    (order.quantity > 0 || order.buying || order.spoiled)
                        && order.quantity <= item.pack
                        && order.fare <= 10_000
                        && (!order.hold_for_pickup || (!order.buying && order.fare == 0))
                })
            })
            && self.policies.keys().all(|id| {
                catalog
                    .materials
                    .get(id)
                    .is_some_and(|item| item.pack > 0 && item.price > 0.0)
            })
    }
}

fn pantry_day(clock: f64) -> u64 {
    ((540.0 + clock * 0.45) / 1440.0).floor() as u64
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::setup::WorldSetup;

    #[test]
    fn equipment_sales_keep_wear_with_the_village_and_allow_spare_tools() {
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
        let trade = Trade::default();
        let id = "carpentry-tools";
        stock.receive(&BTreeMap::from([(id.into(), 1)]));
        stock.use_tool(0, id, crate::equipment::Task::Building(0), 1.0, false);
        stock.equipment.release(|_, _| false);
        assert_eq!(
            trade.quote(&catalog, &stock, id, 0, 0),
            Err("Return borrowed tools or repair worn tools before selling.")
        );
        stock.receive(&BTreeMap::from([(id.into(), 1)]));
        assert_eq!(trade.quote(&catalog, &stock, id, 0, 0).unwrap().0, 1);
        assert_eq!(stock.equipment.wear(id), 1.0);
    }

    #[test]
    fn spoiled_sales_return_usable_food_without_refreshing_its_expiry() {
        let catalog = Catalog::default();
        let id = "greens";
        for booked in [false, true] {
            let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
            let mut market = Market::default();
            let mut trade = Trade::default();
            stock.receive_with_lots(
                &BTreeMap::from([(id.into(), 2)]),
                BTreeMap::from([(
                    id.into(),
                    [1.0, 200.0]
                        .into_iter()
                        .map(|expires| food::Lot {
                            units: 1,
                            expires,
                            preserved: false,
                            chilled: false,
                        })
                        .collect(),
                )]),
            );
            let fare = crate::market::fare_cents(12);
            assert_eq!(
                trade.reserve(&catalog, &mut stock, &mut market, id, (0, fare, 0)),
                Ok(2)
            );
            let locked: &[usize] = if booked { &[0] } else { &[] };
            let removed = trade.age_shipments(&catalog, &mut stock, &mut market, 2.0, locked);
            if booked {
                assert!(removed.is_empty());
                assert!(trade.orders[0].spoiled);
                assert_eq!(stock.available(id), 0);
                market.depart(&mut stock, fare);
                let balance = stock.balance();
                trade.settle(0, &mut stock);
                assert_eq!(stock.balance(), balance);
                assert!(trade.finish_trip(0, &mut stock, 1));
            } else {
                assert_eq!(removed, [0]);
            }
            assert_eq!(trade.receipts, 0);
            assert!(trade.orders.is_empty());
            assert_eq!(market.committed_fares(), 0);
            assert_eq!(stock.available(id), 1);
            assert_eq!(stock.pantry.lots[id][0].expires, 200.0);
            assert_eq!(stock.pantry.spoiled[id], 1);
        }
    }

    #[test]
    fn a_fully_spoiled_purchase_unloads_without_counting_as_fulfilled() {
        let catalog = Catalog::default();
        for freight in [false, true] {
            let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
            let mut market = Market::default();
            let mut trade = Trade::default();
            let original = stock.available("milk");
            trade
                .buy(
                    &catalog,
                    &mut stock,
                    &mut market,
                    "milk",
                    (0.0, 12, freight),
                )
                .unwrap();
            let clock = crate::weather::DAY * 2.0;
            trade.age_shipments(&catalog, &mut stock, &mut market, clock, &[0]);
            if freight {
                assert_eq!(
                    trade.receive_goods(&mut stock, 0, clock).unwrap().quantity,
                    0
                );
            } else {
                market.depart(&mut stock, trade.orders[0].fare);
                assert_eq!(trade.orders[0].quantity, 0);
                assert!(trade.finish_trip(0, &mut stock, 0));
            }
            assert_eq!(trade.purchases, 0);
            assert_eq!(stock.available("milk"), original);
            assert!(trade.orders.is_empty() && trade.delivery.is_none());
            assert_eq!(market.committed_fares(), 0);
        }
    }

    #[test]
    fn canceling_a_spoiled_purchase_releases_the_original_pack() {
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
        let mut market = Market::default();
        let mut trade = Trade::default();
        let available = market.supplier_available(&catalog, "milk", 0);
        let balance = stock.balance();
        trade
            .buy(&catalog, &mut stock, &mut market, "milk", (0.0, 12, false))
            .unwrap();

        trade.age_shipments(
            &catalog,
            &mut stock,
            &mut market,
            crate::weather::DAY * 2.0,
            &[],
        );
        assert_eq!(trade.orders[0].quantity, 0);
        assert_eq!(
            trade.cancel_order(&catalog, &mut stock, &mut market, 0),
            Some(0)
        );
        assert_eq!(market.supplier_available(&catalog, "milk", 0), available);
        assert_eq!(market.committed_fares(), 0);
        assert_eq!(stock.balance(), balance);
    }

    #[test]
    fn pantry_counts_only_freight_food_that_can_survive_to_arrival() {
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
        let mut market = Market::default();
        let mut trade = Trade::default();
        trade
            .buy(&catalog, &mut stock, &mut market, "milk", (0.0, 12, true))
            .unwrap();
        assert_eq!(trade.incoming_servings(0.0), 3);

        let delivery = trade.delivery.as_mut().unwrap();
        delivery.eta = delivery.food.as_ref().unwrap()["milk"][0].expires;
        assert_eq!(trade.incoming_servings(0.0), 0);
    }

    #[test]
    fn automatic_restock_uses_the_forecast_when_food_will_expire_first() {
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
        let mut market = Market::default();
        let mut trade = Trade::default();
        stock.age_food(&catalog, 0.0, 0.1, 0.0);
        for lot in stock.pantry.lots.values_mut().flatten() {
            lot.expires = 1.0;
        }
        assert!(stock.food_portions() >= 23);
        let forecast = trade.pantry_forecast(&stock, 0.0);
        assert_eq!(forecast.served, 1);
        assert_eq!(forecast.target, 23);
        assert!(forecast.at_risk >= 22.0);
        trade.maintain_pantry(
            &catalog,
            &mut stock,
            &mut market,
            (0.0, 12, 500, false, false, 0),
        );
        assert_eq!(trade.orders.len(), 1);
        assert_eq!(trade.orders[0].material, "food");
    }

    #[test]
    fn automatic_food_orders_wait_for_town_to_open() {
        let catalog = Catalog::default();
        for freight in [false, true] {
            let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
            let mut market = Market::default();
            let mut trade = Trade::default();
            trade.set_pantry_policy(true, Some(14), None).unwrap();
            let opening = 22.0 * crate::weather::HOUR;
            trade.maintain_pantry(
                &catalog,
                &mut stock,
                &mut market,
                (opening - 1.0, 12, 500, freight, false, 0),
            );
            assert!(trade.delivery.is_none() && trade.orders.is_empty());
            trade.maintain_pantry(
                &catalog,
                &mut stock,
                &mut market,
                (opening + 1.0, 12, 500, freight, false, 0),
            );
            assert_eq!(trade.delivery.is_some(), freight);
            assert_eq!(trade.orders.len(), usize::from(!freight));
        }
    }

    #[test]
    fn pantry_restock_can_use_supplier_freight_and_count_its_fee() {
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
        let mut market = Market::default();
        let mut trade = Trade::default();
        let cost = 4_800 + crate::market::freight_cents(12);
        trade
            .set_pantry_policy(true, Some(14), Some(cost - 1))
            .unwrap();
        trade.maintain_pantry(
            &catalog,
            &mut stock,
            &mut market,
            (0.0, 12, 500, true, false, 0),
        );
        assert!(trade.delivery.is_none());

        trade.set_pantry_policy(true, None, Some(cost)).unwrap();
        let balance = stock.balance();
        trade.maintain_pantry(
            &catalog,
            &mut stock,
            &mut market,
            (11.0, 12, 500, true, false, balance - cost + 1),
        );
        assert!(trade.delivery.is_none());
        assert_eq!(stock.balance(), balance);
        trade.maintain_pantry(
            &catalog,
            &mut stock,
            &mut market,
            (22.0, 12, 500, true, false, balance - cost),
        );
        assert_eq!(trade.delivery.as_ref().unwrap().material, "food");
        assert!(trade.orders.is_empty());
        assert_eq!(trade.pantry_purchase.reserved_cents, cost);
        assert_eq!(market.committed_fares(), 0);
    }

    #[test]
    fn emergency_food_budget_counts_each_reserved_pack_and_its_fare() {
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
        let mut market = Market::default();
        let mut trade = Trade::default();
        let cost = 4_800 + crate::market::fare_cents(12);
        trade.pantry_controls(11, (cost * 2) as i64 - 15_000, false);
        for clock in [0.0, 11.0, 22.0] {
            trade.maintain_pantry(
                &catalog,
                &mut stock,
                &mut market,
                (clock, 12, 500, false, false, 0),
            );
        }
        assert_eq!(trade.orders.len(), 2);
        assert_eq!(trade.pantry_purchase.reserved_cents, cost * 2);
        assert_eq!(market.committed_fares(), crate::market::fare_cents(12) * 2);
        trade.maintain_pantry(
            &catalog,
            &mut stock,
            &mut market,
            (3_200.0, 12, 500, false, false, 0),
        );
        assert_eq!(trade.orders.len(), 3);
        assert_eq!(trade.pantry_purchase.reserved_cents, cost);
        let save = serde_json::to_string(&trade).unwrap();
        let loaded: Trade = serde_json::from_str(&save).unwrap();
        assert_eq!(loaded.pantry_purchase.allowance_cents, cost * 2);
        assert_eq!(loaded.pantry_purchase.reserve_half_days, 14);
    }

    #[test]
    fn quote_and_reservation_agree_on_a_sale_spanning_buyer_price_tiers() {
        let catalog = Catalog::default();
        let item = &catalog.materials["wood"];
        let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
        let mut market = Market::default();
        let mut trade = Trade::default();
        let premium_units = 1;
        let previously_sold = item.buyer.full_price_batches * item.pack - premium_units;
        trade.bought.insert(
            "wood".into(),
            Daily {
                day: 0,
                units: previously_sold,
            },
        );
        let before = stock.available("wood");
        let premium = (item.price * item.buyer.ratio).floor() as u64 * 100;
        let bulk = (item.price * item.buyer.bulk_ratio).floor() as u64 * 100;
        let expected =
            (premium + bulk * u64::from(item.pack - premium_units)) / u64::from(item.pack);
        assert_eq!(
            trade.quote_sale_order(&catalog, &stock, "wood", 0, 0),
            Ok((item.pack, expected))
        );
        assert_eq!(
            trade.reserve(&catalog, &mut stock, &mut market, "wood", (0, 0, 0)),
            Ok(item.pack)
        );
        assert_eq!(trade.orders[0].cents, expected);
        assert_eq!(trade.buyer_reserved("wood", 0), previously_sold + item.pack);
        assert_eq!(stock.available("wood"), before - item.pack);
    }

    #[test]
    fn freight_waits_for_storage_after_its_scheduled_arrival() {
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
        let mut market = Market::default();
        let mut trade = Trade::default();
        let before = stock.balance();
        let wood = stock.available("wood");
        trade
            .buy(&catalog, &mut stock, &mut market, "wood", (0.0, 12, true))
            .unwrap();
        let eta = trade.delivery.as_ref().unwrap().eta;
        assert_eq!(stock.balance(), before - 43_200 - 4_460);
        assert!(trade.receive_goods(&mut stock, 200, eta - 0.1).is_none());
        assert!(trade.receive_goods(&mut stock, 10, eta).is_none());
        assert_eq!(stock.available("wood"), wood);
        assert!(trade.delivery.is_some());
        let saved = serde_json::to_vec(&trade).unwrap();
        let mut trade: Trade = serde_json::from_slice(&saved).unwrap();
        let unload_time = eta + 30.0;
        assert!(trade.receive_goods(&mut stock, 11, unload_time).is_none());
        assert_eq!(stock.balance(), before - 43_200 - 4_460);
        let delivered = trade.receive_goods(&mut stock, 12, unload_time).unwrap();
        assert_eq!(delivered.material, "wood");
        assert_eq!(delivered.quantity, 12);
        assert!(
            trade
                .receive_goods(&mut stock, 12, unload_time + 1.0)
                .is_none()
        );
        assert_eq!(trade.purchases, 1);
        assert_eq!(stock.available("wood"), wood + 12);
        assert!(
            stock
                .material_history(&catalog)
                .contains("Supplier freight")
        );
        assert!(trade.delivery.is_none());
    }

    #[test]
    fn automatic_sale_queues_all_eligible_packs_when_the_trigger_is_crossed() {
        let catalog = Catalog::default();
        let start = Stock::for_start(&WorldSetup::default(), &catalog);
        assert_eq!(start.available("wood"), 36);
        for (limit, batches, remaining) in [(0, 2, 12), (12, 1, 24)] {
            let mut stock = start.clone();
            let mut market = Market::default();
            let mut trade = Trade::default();
            let policy = trade.sale_policy("wood");
            policy.enabled = true;
            policy.trigger = 30;
            policy.limit = limit;
            let (_, offer) = trade.automatic_sale_offer(&catalog, &stock, "wood", 0);
            let (quantity, cents) = offer.unwrap();
            assert_eq!(quantity, 36 - remaining);
            trade.auto_sell(&catalog, &mut stock, &mut market, 0., 776);
            assert_eq!(trade.orders.len(), batches);
            assert_eq!(
                trade.orders.iter().map(|order| order.cents).sum::<u64>(),
                cents
            );
            assert_eq!(stock.available("wood"), remaining);
            assert_eq!(trade.policies["wood"].sold, 36 - remaining);
            assert_eq!(trade.sale_dispatch_wait(0.), Some(40.));
        }
    }

    #[test]
    fn automatic_sale_preview_includes_both_buyer_price_bands() {
        let catalog = Catalog::default();
        let wood = &catalog.materials["wood"];
        let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
        stock.receive(&BTreeMap::from([("wood".into(), 120)]));
        let mut market = Market::default();
        let mut trade = Trade::default();
        trade.sale_policy("wood").enabled = true;
        let premium = (wood.price * wood.buyer.ratio).floor() as u64 * 100;
        let bulk = (wood.price * wood.buyer.bulk_ratio).floor() as u64 * 100;
        assert!(premium > bulk);
        let expected = premium * u64::from(wood.buyer.full_price_batches)
            + bulk * u64::from(wood.buyer.batches - wood.buyer.full_price_batches);
        assert_eq!(
            trade.automatic_sale_offer(&catalog, &stock, "wood", 0).1,
            Ok((wood.pack * wood.buyer.batches, expected))
        );
        trade.auto_sell(&catalog, &mut stock, &mut market, 0., 776);
        assert_eq!(
            trade.orders.iter().map(|order| order.cents).sum::<u64>(),
            expected
        );
    }

    #[test]
    fn changing_pantry_reserve_changes_both_the_offer_and_automatic_sale() {
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
        let mut market = Market::default();
        let mut trade = Trade::default();
        trade.policies.entry("meals".into()).or_default().enabled = true;
        trade.pantry_controls(14, 0, false);
        assert!(
            trade
                .pantry_purchase_status(&stock, 0.0)
                .contains("Reserve short by")
        );
        let (protected, offer) = trade.automatic_sale_offer(&catalog, &stock, "meals", 0);
        assert!(protected >= stock.available("meals"));
        assert!(offer.is_err());
        trade.auto_sell(&catalog, &mut stock, &mut market, 0.0, 776);
        assert!(trade.orders.is_empty());

        trade.pantry_controls(-14, 0, false);
        assert!(
            trade
                .pantry_purchase_status(&stock, 0.0)
                .contains("Reserve covered")
        );
        let (protected, offer) = trade.automatic_sale_offer(&catalog, &stock, "meals", 0);
        assert_eq!(protected, 0);
        let (offered, _) = offer.unwrap();
        trade.auto_sell(&catalog, &mut stock, &mut market, 1.0, 776);
        assert_eq!(trade.orders[0].quantity, offered);
        assert_eq!(offered, catalog.materials["meals"].pack);
    }

    #[test]
    fn automatic_sales_protect_the_food_reserve_and_receipts_settle_once() {
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
        let mut market = Market::default();
        let mut trade = Trade::default();
        trade.policies.entry("meals".into()).or_default().enabled = true;
        trade.auto_sell(&catalog, &mut stock, &mut market, 0.0, 776);
        assert!(trade.orders.is_empty());
        assert_eq!(stock.available("meals"), 20);

        let before = stock.balance();
        assert_eq!(
            trade.reserve(&catalog, &mut stock, &mut market, "wood", (0, 776, 0)),
            Ok(12)
        );
        assert_eq!(stock.available("wood"), 24);
        assert_eq!(stock.balance(), before);
        assert_eq!(market.committed_fares(), 776);
        market.depart(&mut stock, 776);
        trade.settle(0, &mut stock);
        trade.settle(0, &mut stock);
        assert_eq!(trade.receipts, 1);
        assert_eq!(stock.balance(), before - 776 + 21_600);
    }
}
