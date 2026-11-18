use std::collections::{BTreeMap, VecDeque};

use serde::{Deserialize, Serialize};

use crate::{
    catalog::{Catalog, Material},
    market::Market,
    stock::{CashKind, Stock},
};

#[derive(Default, Deserialize, Serialize)]
pub struct Trade {
    pub orders: VecDeque<Export>,
    bought: BTreeMap<String, Daily>,
    pub policies: BTreeMap<String, Policy>,
    pub receipts: u64,
    #[serde(skip)]
    pub selected: usize,
    #[serde(skip)]
    pub page: usize,
    #[serde(skip)]
    pub notice: String,
    next_scan: f64,
}

#[derive(Deserialize, Serialize)]
pub struct Export {
    pub material: String,
    pub quantity: u32,
    pub cents: u64,
    pub fare: u64,
    pub day: u64,
    pub settled: bool,
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
        let quantity = stock.available(id).saturating_sub(protect).min(item.pack);
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
        stock.reserve_available(&BTreeMap::from([(id.to_owned(), quantity)]));
        let entry = self.bought.entry(id.to_owned()).or_default();
        if entry.day != day {
            *entry = Daily { day, units: 0 };
        }
        entry.units += quantity;
        self.orders.push_back(Export {
            material: id.into(),
            quantity,
            cents,
            fare,
            day,
            settled: false,
        });
        Ok(quantity)
    }

    pub fn cancel_last(&mut self, stock: &mut Stock, market: &mut Market, active: bool) {
        if self.orders.len() <= usize::from(active) {
            return;
        }
        let order = self.orders.pop_back().expect("queued sale");
        stock.receive(&BTreeMap::from([(order.material.clone(), order.quantity)]));
        market.release_fare(order.fare);
        if let Some(entry) = self.bought.get_mut(&order.material)
            && entry.day == order.day
        {
            entry.units = entry.units.saturating_sub(order.quantity);
        }
        self.notice = "Sale canceled. Goods returned to stock.".into();
    }

    pub fn settle(&mut self, stock: &mut Stock) {
        if let Some(order) = self.orders.front_mut()
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

    pub fn valid(&self, catalog: &Catalog) -> bool {
        self.orders.len() <= 32
            && self.orders.iter().all(|order| {
                catalog.materials.get(&order.material).is_some_and(|item| {
                    order.quantity > 0 && order.quantity <= item.pack && order.fare <= 10_000
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
        trade.settle(&mut stock);
        trade.settle(&mut stock);
        assert_eq!(trade.receipts, 1);
        assert_eq!(stock.balance(), before - 776 + 21_600);
    }
}
