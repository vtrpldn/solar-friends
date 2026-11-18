use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::{
    catalog::Catalog,
    stock::{CashKind, Stock},
};

const RESERVE: u64 = 10_000;
const CARGO_MASS: f64 = 350.0;
const CARGO_VOLUME: f64 = 1.2;

#[derive(Clone, Default, Deserialize, Serialize)]
pub struct Market {
    suppliers: BTreeMap<String, Allocation>,
    pub auto_buy_off: bool,
    committed_fares: u64,
}

#[derive(Clone, Deserialize, Serialize)]
struct Allocation {
    day: u64,
    units: u32,
}

pub struct Quote {
    pub units: BTreeMap<String, u32>,
    pub price: u64,
    pub trips: u32,
    pub fare: u64,
    pub day: u64,
}

impl Market {
    pub fn committed_fares(&self) -> u64 {
        self.committed_fares
    }

    pub fn quote(
        &self,
        catalog: &Catalog,
        bill: &BTreeMap<String, u32>,
        stock: &Stock,
        clock: f64,
        round_trip_km: u32,
    ) -> Result<Quote, String> {
        let day = ((540.0 + clock * 0.45) / 1440.0).floor() as u64;
        let mut units = BTreeMap::new();
        let mut total: f64 = 0.0;
        for (id, amount) in bill {
            let missing = amount.saturating_sub(stock.available(id));
            if missing == 0 || stock.sandbox {
                continue;
            }
            if self.auto_buy_off {
                return Err(format!(
                    "Not enough {} in supplies.",
                    catalog.materials[id].name
                ));
            }
            let item = &catalog.materials[id];
            if item.pack == 0 || item.price == 0.0 {
                return Err(format!("Produce {} locally first.", item.name));
            }
            let used = self
                .suppliers
                .get(id)
                .filter(|allocation| allocation.day == day)
                .map_or(0, |allocation| allocation.units);
            if item.supplier.saturating_sub(used) < missing {
                return Err(format!(
                    "The supplier has insufficient {} today.",
                    item.name
                ));
            }
            units.insert(id.clone(), missing);
            total += f64::from(missing) * item.price / f64::from(item.pack);
        }
        let trips = cargo_trips(catalog, units.clone())?;
        let fare = fare_cents(round_trip_km);
        let price = (total * 100.0).ceil() as u64;
        if !units.is_empty()
            && price + fare * u64::from(trips) + RESERVE + self.committed_fares > stock.balance()
        {
            return Err(
                "Shared savings cannot cover materials and pickup while keeping R$100 in reserve."
                    .into(),
            );
        }
        Ok(Quote {
            units,
            price,
            trips,
            fare,
            day,
        })
    }

    pub fn reserve(&mut self, stock: &mut Stock, bill: &BTreeMap<String, u32>, quote: &Quote) {
        stock.reserve_available(bill);
        stock.debit(quote.price, CashKind::Materials);
        self.committed_fares += quote.fare * u64::from(quote.trips);
        for (id, units) in &quote.units {
            let allocation = self.suppliers.entry(id.clone()).or_insert(Allocation {
                day: quote.day,
                units: 0,
            });
            if allocation.day != quote.day {
                *allocation = Allocation {
                    day: quote.day,
                    units: 0,
                };
            }
            allocation.units += units;
        }
    }

    pub fn buy_pack(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        id: &str,
        (day, fare, freight): (u64, u64, bool),
    ) -> Result<(u32, u64), &'static str> {
        let item = &catalog.materials[id];
        let quantity = item.pack;
        if quantity == 0 || item.price <= 0.0 {
            return Err("This resource is produced locally.");
        }
        let (mass_limit, volume_limit) = if freight {
            (5000.0, 12.0)
        } else {
            (350.0, 1.2)
        };
        if item.mass * f64::from(quantity) > mass_limit + 1e-8
            || item.volume * f64::from(quantity) > volume_limit + 1e-8
        {
            return Err("This pack is too large for the chosen vehicle.");
        }
        let used = self
            .suppliers
            .get(id)
            .filter(|entry| entry.day == day)
            .map_or(0, |entry| entry.units);
        if item.supplier.saturating_sub(used) < quantity {
            return Err("The supplier has not got enough stock today.");
        }
        let price = (item.price * 100.0).round() as u64;
        if stock.balance().saturating_sub(self.committed_fares) < price + fare {
            return Err("Shared savings cannot cover the order and transport.");
        }
        let entry = self
            .suppliers
            .entry(id.into())
            .or_insert(Allocation { day, units: 0 });
        if entry.day != day {
            *entry = Allocation { day, units: 0 };
        }
        entry.units += quantity;
        stock.debit(
            price,
            if matches!(id, "food" | "meals" | "eggs" | "milk" | "honey") {
                CashKind::Food
            } else {
                CashKind::Materials
            },
        );
        if freight {
            stock.debit(fare, CashKind::Freight);
        } else {
            self.committed_fares += fare;
        }
        Ok((quantity, price))
    }

    pub fn cancel_pack(
        &mut self,
        stock: &mut Stock,
        id: &str,
        day: u64,
        quantity: u32,
        price: u64,
        fare: u64,
    ) {
        if let Some(entry) = self.suppliers.get_mut(id)
            && entry.day == day
        {
            entry.units = entry.units.saturating_sub(quantity);
        }
        stock.credit(
            price,
            if matches!(id, "food" | "meals" | "eggs" | "milk" | "honey") {
                CashKind::Food
            } else {
                CashKind::Materials
            },
        );
        self.release_fare(fare);
    }

    pub fn hold_fare(&mut self, stock: &Stock, fare: u64) -> bool {
        if stock.balance().saturating_sub(self.committed_fares) < fare {
            return false;
        }
        self.committed_fares += fare;
        true
    }

    pub fn release_fare(&mut self, fare: u64) {
        self.committed_fares -= fare;
    }

    pub fn refund_construction(
        &mut self,
        stock: &mut Stock,
        units: &BTreeMap<String, u32>,
        (day, price, travel): (u64, u64, u64),
    ) {
        for (id, quantity) in units {
            if let Some(entry) = self.suppliers.get_mut(id)
                && entry.day == day
            {
                entry.units = entry.units.saturating_sub(*quantity);
            }
        }
        stock.credit(price, CashKind::Materials);
        self.release_fare(travel);
    }

    pub fn depart(&mut self, stock: &mut Stock, fare: u64) {
        stock.debit(fare, CashKind::Fuel);
        self.committed_fares -= fare;
    }

    pub fn valid_save(&self, catalog: &Catalog, stock: &Stock, fares: u64) -> bool {
        fares == self.committed_fares
            && fares <= stock.balance()
            && self.suppliers.iter().all(|(id, allocation)| {
                catalog
                    .materials
                    .get(id)
                    .is_some_and(|item| allocation.units <= item.supplier)
            })
    }
}

fn cargo_trips(catalog: &Catalog, mut pending: BTreeMap<String, u32>) -> Result<u32, String> {
    let mut trips = 0;
    while !pending.is_empty() {
        let mut mass = CARGO_MASS;
        let mut volume = CARGO_VOLUME;
        let mut loaded_any = false;
        pending.retain(|id, remaining| {
            let item = &catalog.materials[id];
            let fit = ((mass / item.mass).min(volume / item.volume) + 1e-8).floor() as u32;
            let load = (*remaining).min(fit);
            *remaining -= load;
            mass -= f64::from(load) * item.mass;
            volume -= f64::from(load) * item.volume;
            loaded_any |= load != 0;
            *remaining > 0
        });
        if !loaded_any {
            return Err("These materials need a larger delivery vehicle.".into());
        }
        trips += 1;
    }
    Ok(trips)
}

pub fn fare_cents(round_trip_km: u32) -> u64 {
    ((f64::from(round_trip_km) / 10.0) * 6.47 * 100.0).round() as u64
}

pub fn trip_seconds(round_trip_km: u32) -> f64 {
    (f64::from(round_trip_km) / 40.0 * 60.0 + 12.0) / 0.45
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::setup::WorldSetup;

    #[test]
    fn cistern_quote_matches_reference_and_charges_fuel_on_departure() {
        let catalog = Catalog::default();
        let project = &catalog.projects["well"];
        let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
        let mut market = Market::default();
        let quote = market
            .quote(&catalog, &project.materials, &stock, 0.0, 12)
            .unwrap();
        assert_eq!((quote.price, quote.trips, quote.fare), (126_400, 1, 776));
        market.reserve(&mut stock, &project.materials, &quote);
        assert_eq!(stock.balance(), 873_600);
        assert_eq!(stock.available("plumbing"), 0);
        market.depart(&mut stock, quote.fare);
        assert_eq!(stock.balance(), 872_824);
    }
}
