use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::{
    catalog::{Catalog, Project},
    stock::Stock,
};

const RESERVE: u64 = 10_000;
const CARGO_MASS: f64 = 350.0;
const CARGO_VOLUME: f64 = 1.2;

#[derive(Default, Deserialize, Serialize)]
pub struct Market {
    suppliers: BTreeMap<String, Allocation>,
    pub auto_buy_off: bool,
    committed_fares: u64,
}

#[derive(Deserialize, Serialize)]
struct Allocation {
    day: u64,
    units: u32,
}

pub struct Quote {
    pub units: BTreeMap<String, u32>,
    pub price: u64,
    pub trips: u32,
    pub fare: u64,
    day: u64,
}

impl Market {
    pub fn committed_fares(&self) -> u64 {
        self.committed_fares
    }

    pub fn quote(
        &self,
        catalog: &Catalog,
        project: &Project,
        stock: &Stock,
        clock: f64,
        round_trip_km: u32,
    ) -> Result<Quote, String> {
        let day = ((540.0 + clock * 0.45) / 1440.0).floor() as u64;
        let mut units = BTreeMap::new();
        let mut total: f64 = 0.0;
        for (id, amount) in &project.materials {
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
        let fare = ((f64::from(round_trip_km) / 10.0) * 6.47 * 100.0).round() as u64;
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

    pub fn reserve(&mut self, stock: &mut Stock, project: &Project, quote: &Quote) {
        stock.reserve_available(&project.materials);
        stock.debit(quote.price);
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

    pub fn depart(&mut self, stock: &mut Stock, fare: u64) {
        stock.debit(fare);
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
        let quote = market.quote(&catalog, project, &stock, 0.0, 12).unwrap();
        assert_eq!((quote.price, quote.trips, quote.fare), (126_400, 1, 776));
        market.reserve(&mut stock, project, &quote);
        assert_eq!(stock.balance(), 873_600);
        assert_eq!(stock.available("plumbing"), 0);
        market.depart(&mut stock, quote.fare);
        assert_eq!(stock.balance(), 872_824);
    }
}
