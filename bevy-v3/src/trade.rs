use std::collections::{BTreeMap, VecDeque};

use serde::{Deserialize, Serialize};

use crate::{
    catalog::{Catalog, Material},
    food::{self, FoodLots},
    market::Market,
    stock::{CashKind, Stock},
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

impl Trade {
    pub fn tradable(catalog: &Catalog) -> Vec<(&str, &Material)> {
        catalog
            .materials
            .iter()
            .filter(|(_, item)| item.pack > 0 && item.price > 0.0)
            .map(|(id, item)| (id.as_str(), item))
            .collect()
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
        let sold = self
            .bought
            .get(id)
            .filter(|entry| entry.day == day)
            .map_or(0, |entry| entry.units);
        if sold + quantity > item.buyer.batches * item.pack {
            return Err("The buyer has enough for today.");
        }
        if f64::from(quantity) * item.mass > 350.0 + 1e-8
            || f64::from(quantity) * item.volume > 1.2 + 1e-8
        {
            return Err("This batch needs a larger vehicle.");
        }
        let rate = |before| {
            let ratio = if before / item.pack < item.buyer.full_price_batches {
                item.buyer.ratio
            } else {
                item.buyer.bulk_ratio
            };
            (item.price * ratio).floor() as u64 * 100
        };
        let first = quantity.min((sold / item.pack + 1) * item.pack - sold);
        let cents = (rate(sold) * u64::from(first)
            + rate(sold + first) * u64::from(quantity - first))
            / u64::from(item.pack);
        Ok((quantity, cents))
    }

    pub fn reserve(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        market: &mut Market,
        id: &str,
        (day, fare, protect): (u64, u64, u32),
    ) -> Result<u32, &'static str> {
        if self.orders.len() >= 32 {
            return Err("The town sale queue is full.");
        }
        let (quantity, cents) = self.quote(catalog, stock, id, day, protect)?;
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
        if freight && self.delivery.is_some() {
            return Err("A freight order is already on the way.");
        }
        if !freight && self.orders.len() >= 32 {
            return Err("The town order queue is full.");
        }
        let day = ((540.0 + clock * 0.45) / 1440.0).floor() as u64;
        let fare = if freight {
            crate::market::freight_cents(distance)
        } else {
            crate::market::fare_cents(distance)
        };
        let (quantity, cents) = market.buy_pack(catalog, stock, id, (day, fare, freight))?;
        let food = food::fresh(
            &BTreeMap::from([(id.to_owned(), quantity)]),
            clock,
            &BTreeMap::new(),
        );
        if freight {
            let eta = clock + 360.0 / 0.45 + crate::market::trip_seconds(distance);
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

    pub fn maintain_pantry(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        market: &mut Market,
        (clock, distance, space): (f64, u32, u64),
    ) {
        if stock.sandbox || self.household_restock_off || clock < self.next_pantry_check {
            return;
        }
        self.next_pantry_check = clock + 10.0;
        let servings = |id: &str, quantity| {
            food::SERVINGS
                .iter()
                .find(|&&(material, _)| material == id)
                .map_or(0, |&(_, units)| quantity / units)
        };
        let incoming: u32 = self
            .orders
            .iter()
            .filter(|order| order.buying)
            .map(|order| servings(&order.material, order.quantity))
            .sum::<u32>()
            + self
                .delivery
                .as_ref()
                .map_or(0, |order| servings(&order.material, order.quantity));
        let forecast = self.pantry_forecast(stock, clock);
        if forecast.served.saturating_add(incoming) >= forecast.target {
            return;
        }
        let free = space.saturating_sub(self.inbound());
        let ingredients = &catalog.materials["food"];
        let cost = (ingredients.price * 100.0).round() as u64 + crate::market::fare_cents(distance);
        let day = pantry_day(clock);
        let already_reserved = if day == self.pantry_purchase.day {
            self.pantry_purchase.reserved_cents
        } else {
            0
        };
        if cost + already_reserved <= self.pantry_purchase.allowance_cents
            && u64::from(ingredients.pack) <= free
            && self
                .buy(catalog, stock, market, "food", (clock, distance, false))
                .is_ok()
        {
            self.pantry_purchase.day = day;
            self.pantry_purchase.reserved_cents = already_reserved + cost;
        }
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

    fn pantry_forecast(&self, stock: &Stock, clock: f64) -> food::Forecast {
        stock
            .pantry
            .forecast(clock, self.pantry_purchase.reserve_half_days, |id| {
                stock.available(id)
            })
    }

    pub fn pantry_purchase_status(&self, stock: &Stock, clock: f64) -> String {
        let forecast = self.pantry_forecast(stock, clock);
        let policy = &self.pantry_purchase;
        let state = if self.household_restock_off {
            "off"
        } else {
            "on"
        };
        let used = if policy.day == pantry_day(clock) {
            policy.reserved_cents
        } else {
            0
        };
        format!(
            "U Automatic food purchases {state}\n[ ] Reserve {:.1} days · Shift [ ] Daily limit R${:.0}\nR${:.2} reserved today including fuel\nStored food covers {}/{} meals · {:.1} servings may spoil",
            f64::from(policy.reserve_half_days) / 2.0,
            policy.allowance_cents as f64 / 100.0,
            used as f64 / 100.0,
            forecast.served,
            forecast.target,
            forecast.at_risk
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
        if let Some(lots) = order.food.take() {
            stock.receive_with_lots(&goods, lots);
        } else {
            stock.receive(&goods);
        }
        self.purchases = self.purchases.saturating_add(1);
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
        if order.buying || order.spoiled {
            let goods = BTreeMap::from([(order.material, order.quantity)]);
            if let Some(lots) = order.food {
                stock.receive_with_lots(&goods, lots);
            } else {
                stock.receive(&goods);
            }
            if order.buying {
                self.purchases = self.purchases.saturating_add(1);
            }
        }
        true
    }

    pub fn cancel_order(
        &mut self,
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
                order.quantity,
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
        let mut reserve = policy.map_or(0, |policy| policy.reserve);
        if let Some((_, units_per_portion)) = food::SERVINGS.iter().find(|(food, _)| *food == id) {
            let target = (15 * u32::from(self.pantry_purchase.reserve_half_days)).div_ceil(2);
            let other_portions = stock
                .food_portions()
                .saturating_sub(owned / units_per_portion);
            reserve = reserve.max(target.saturating_sub(other_portions) * units_per_portion);
        }
        reserve = reserve.max(stock.equipment.protected(id, owned));
        let pack = catalog.materials[id].pack;
        let offer = if owned <= policy.map_or(0, |policy| policy.trigger) {
            Err("Below the sale trigger")
        } else if owned.saturating_sub(reserve) < pack {
            Err("Reserve protected or less than one pack")
        } else if policy.is_some_and(|policy| {
            let sold = if policy.day == day { policy.sold } else { 0 };
            policy.limit > 0 && sold + pack > policy.limit
        }) {
            Err("Daily sale limit reached")
        } else {
            self.quote(catalog, stock, id, day, reserve)
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
            if offer.is_ok()
                && let Ok(quantity) =
                    self.reserve(catalog, stock, market, &id, (day, fare, reserve))
            {
                let policy = self.policies.get_mut(&id).expect("active sale policy");
                if policy.day != day {
                    policy.day = day;
                    policy.sold = 0;
                }
                policy.sold += quantity;
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
        trade.maintain_pantry(&catalog, &mut stock, &mut market, (0.0, 12, 500));
        assert_eq!(trade.orders.len(), 1);
        assert_eq!(trade.orders[0].material, "food");
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
            trade.maintain_pantry(&catalog, &mut stock, &mut market, (clock, 12, 500));
        }
        assert_eq!(trade.orders.len(), 2);
        assert_eq!(trade.pantry_purchase.reserved_cents, cost * 2);
        assert_eq!(market.committed_fares(), crate::market::fare_cents(12) * 2);
        trade.maintain_pantry(&catalog, &mut stock, &mut market, (3_200.0, 12, 500));
        assert_eq!(trade.orders.len(), 3);
        assert_eq!(trade.pantry_purchase.reserved_cents, cost);
        let save = serde_json::to_string(&trade).unwrap();
        let loaded: Trade = serde_json::from_str(&save).unwrap();
        assert_eq!(loaded.pantry_purchase.allowance_cents, cost * 2);
        assert_eq!(loaded.pantry_purchase.reserve_half_days, 14);
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
        let delivered = trade.receive_goods(&mut stock, 12, eta).unwrap();
        assert_eq!(delivered.material, "wood");
        assert_eq!(delivered.quantity, 12);
        assert!(trade.receive_goods(&mut stock, 12, eta + 1.0).is_none());
        assert_eq!(trade.purchases, 1);
        assert_eq!(stock.available("wood"), wood + 12);
        assert!(trade.delivery.is_none());
    }

    #[test]
    fn changing_pantry_reserve_changes_both_the_offer_and_automatic_sale() {
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
        let mut market = Market::default();
        let mut trade = Trade::default();
        trade.policies.entry("meals".into()).or_default().enabled = true;
        trade.pantry_controls(14, 0, false);
        let (protected, offer) = trade.automatic_sale_offer(&catalog, &stock, "meals", 0);
        assert!(protected >= stock.available("meals"));
        assert!(offer.is_err());
        trade.auto_sell(&catalog, &mut stock, &mut market, 0.0, 776);
        assert!(trade.orders.is_empty());

        trade.pantry_controls(-14, 0, false);
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
