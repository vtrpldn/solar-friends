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
    pub notice: String,
    next_scan: f64,
    #[serde(default)]
    next_pantry_check: f64,
    #[serde(default)]
    pub household_restock_off: bool,
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
        let protect = protect.max(stock.equipment.protected(id, owned));
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
            3500 + u64::from(distance) * 80
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
        let household = |id: &str| matches!(id, "food" | "meals");
        let incoming = self
            .orders
            .iter()
            .filter(|order| order.buying && household(&order.material))
            .map(|order| order.quantity)
            .sum::<u32>()
            + self
                .delivery
                .as_ref()
                .filter(|order| household(&order.material))
                .map_or(0, |order| order.quantity);
        if stock.food_portions().saturating_add(incoming) >= 23 {
            return;
        }
        let free = space.saturating_sub(self.inbound());
        let cheapest = ["food", "meals"];
        for id in cheapest {
            if u64::from(catalog.materials[id].pack) <= free
                && self
                    .buy(catalog, stock, market, id, (clock, distance, false))
                    .is_ok()
            {
                return;
            }
        }
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

    pub fn receive_goods(&mut self, stock: &mut Stock, space: u64, clock: f64) {
        let Some(order) = &self.delivery else { return };
        if order.eta <= clock && u64::from(order.quantity) <= space {
            let order = self.delivery.take().expect("arrived freight");
            let goods = BTreeMap::from([(order.material, order.quantity)]);
            if let Some(lots) = order.food {
                stock.receive_with_lots(&goods, lots);
            } else {
                stock.receive(&goods);
            }
            self.purchases = self.purchases.saturating_add(1);
        }
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

    pub fn cancel_last(
        &mut self,
        stock: &mut Stock,
        market: &mut Market,
        active: &[usize],
    ) -> Option<usize> {
        let index = (0..self.orders.len())
            .rev()
            .find(|index| !active.contains(index))?;
        let order = self.orders.remove(index).expect("queued order");
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
        let day = ((540.0 + clock * 0.45) / 1440.0).floor() as u64;
        let keys: Vec<_> = self
            .policies
            .iter()
            .filter(|(_, policy)| policy.enabled)
            .map(|(id, _)| id.clone())
            .collect();
        for id in keys {
            let policy = self.policies.get_mut(&id).expect("active sale policy");
            if policy.day != day {
                policy.day = day;
                policy.sold = 0;
            }
            let pack = catalog.materials[&id].pack;
            let portions = match id.as_str() {
                "food" | "meals" => 1,
                "eggs" => 4,
                "milk" => 2,
                _ => 0,
            };
            let protect =
                stock
                    .available(&id)
                    .checked_div(portions)
                    .map_or(policy.reserve, |servings| {
                        let other_food = stock.food_portions().saturating_sub(servings);
                        policy
                            .reserve
                            .max(30u32.saturating_sub(other_food) * portions)
                    });
            if stock.available(&id) <= policy.trigger
                || stock.available(&id).saturating_sub(protect) < pack
                || (policy.limit != 0 && policy.sold + pack > policy.limit)
            {
                continue;
            }
            if let Ok(quantity) = self.reserve(catalog, stock, market, &id, (day, fare, protect)) {
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
        self.delivery.as_ref().is_none_or(|order| {
            order.eta >= 0.0
                && catalog
                    .materials
                    .get(&order.material)
                    .is_some_and(|item| order.quantity <= item.pack)
        }) && self.orders.len() <= 32
            && self.orders.iter().all(|order| {
                catalog.materials.get(&order.material).is_some_and(|item| {
                    (order.quantity > 0 || order.buying || order.spoiled)
                        && order.quantity <= item.pack
                        && order.fare <= 10_000
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::setup::WorldSetup;

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
        trade.receive_goods(&mut stock, 200, eta - 0.1);
        trade.receive_goods(&mut stock, 10, eta);
        assert_eq!(stock.available("wood"), wood);
        assert!(trade.delivery.is_some());
        trade.receive_goods(&mut stock, 12, eta);
        assert_eq!(stock.available("wood"), wood + 12);
        assert!(trade.delivery.is_none());
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
