use super::*;

#[derive(Clone, Copy)]
enum Location {
    Stores,
    Reserved,
    Processing,
    Transit,
    Installed,
}

type Ledger<'a> = BTreeMap<&'a str, [u64; 5]>;

fn record(ledger: &mut Ledger, items: &BTreeMap<String, u32>, location: Location) {
    for (id, &amount) in items {
        add(ledger, id, amount, location);
    }
}

fn add(ledger: &mut Ledger, id: &str, amount: u32, location: Location) {
    if let Some(row) = ledger.get_mut(id) {
        row[location as usize] += u64::from(amount);
    }
}

impl Construction {
    fn inventory<'a>(&self, catalog: &'a Catalog, stock: &Stock) -> Ledger<'a> {
        use crate::{farming::FarmPhase, production::Phase};
        let mut ledger: Ledger<'a> = catalog
            .materials
            .keys()
            .map(|id| (id.as_str(), [0; 5]))
            .collect();
        for (id, row) in &mut ledger {
            row[Location::Stores as usize] = u64::from(stock.available(id));
        }
        if stock.sandbox {
            return ledger;
        }
        for (index, plan) in self
            .plans
            .iter()
            .enumerate()
            .filter(|(_, plan)| !plan.removed)
        {
            let def = &catalog.projects[&plan.key];
            let location = if plan.work >= def.work {
                Location::Installed
            } else {
                Location::Reserved
            };
            record(&mut ledger, &def.materials, location);
            for (recipe, installed) in [
                ("cold_storage", self.utilities.has_cold_storage(index)),
                ("solar_upgrade", self.utilities.has_rooftop_solar(index)),
            ] {
                if installed {
                    record(
                        &mut ledger,
                        &catalog.production[recipe].input,
                        Location::Installed,
                    );
                }
            }
        }
        for job in &self.production.jobs {
            let recipe = &catalog.production[&job.recipe];
            if job.phase == Phase::Return {
                record(
                    &mut ledger,
                    job.delivered_output.as_ref().unwrap_or(&recipe.output),
                    Location::Transit,
                );
            } else {
                record(&mut ledger, &recipe.input, Location::Processing);
            }
        }
        for job in &self.farming.jobs {
            if job.phase == FarmPhase::Return {
                record(&mut ledger, &job.output, Location::Transit);
            } else if job.pickups == 0 {
                record(&mut ledger, &job.inputs, Location::Processing);
            }
        }
        for inputs in self.service_materials(catalog) {
            record(&mut ledger, &inputs, Location::Processing);
        }
        for (index, order) in self
            .trade
            .orders
            .iter()
            .enumerate()
            .filter(|(_, order)| !order.settled)
        {
            let aboard = self
                .active_trips()
                .any(|trip| trip.market_order && trip.project == index && trip.boarded);
            let location = if aboard {
                Location::Transit
            } else {
                Location::Reserved
            };
            add(&mut ledger, &order.material, order.quantity, location);
        }
        if let Some(delivery) = &self.trade.delivery {
            add(
                &mut ledger,
                &delivery.material,
                delivery.quantity,
                Location::Transit,
            );
        }
        ledger
    }

    pub fn replacement_costs(&self, catalog: &Catalog, stock: &Stock) -> String {
        let mut totals = [0.0; 5];
        for (id, amounts) in self.inventory(catalog, stock) {
            let item = &catalog.materials[id];
            let unit_price = item.price / f64::from(item.pack.max(1));
            for (total, amount) in totals.iter_mut().zip(amounts) {
                *total += unit_price * amount as f64;
            }
        }
        let [stored, reserved, processing, transit, installed] = totals;
        format!(
            "Material replacement estimates\nStores R${stored:.2} · Reserved R${reserved:.2} · In work R${processing:.2}\nIn transit R${transit:.2} · Installed R${installed:.2}"
        )
    }

    pub fn inventory_panel(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        page: usize,
    ) -> (usize, String) {
        use std::fmt::Write;
        const ROWS: usize = 9;
        let ledger = self.inventory(catalog, stock);
        let mut rows: Vec<_> = ledger
            .into_iter()
            .filter(|(_, amounts)| amounts.iter().any(|&amount| amount > 0))
            .collect();
        rows.sort_by(|(a, _), (b, _)| catalog.materials[*a].name.cmp(&catalog.materials[*b].name));
        let pages = rows.len().div_ceil(ROWS).max(1);
        let page = page.min(pages - 1);
        let (used, capacity) = self.storage(catalog, stock);
        let mut text = format!(
            "Stores {used}/{capacity} units · {}/{} · Page Up/Down · F10 Close",
            page + 1,
            pages
        );
        for (id, row) in rows.iter().skip(page * ROWS).take(ROWS) {
            let _ = write!(text, "\n{}", catalog.materials[*id].name);
            for (&amount, label) in
                row.iter()
                    .zip(["stored", "reserved", "in work", "in transit", "installed"])
            {
                if amount > 0 {
                    let _ = write!(text, " · {amount} {label}");
                }
            }
        }
        (pages, text)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::setup::WorldSetup;

    #[test]
    fn a_trade_pack_is_counted_once_as_it_moves_from_stores_to_transit() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut village = Construction::default();
        let initial = u64::from(stock.available("wood"));
        let amount = village
            .trade
            .reserve(
                &catalog,
                &mut stock,
                &mut village.market,
                "wood",
                (0, crate::market::fare_cents(12), 0),
            )
            .unwrap();
        assert_eq!(
            village.inventory(&catalog, &stock)["wood"],
            [initial - u64::from(amount), u64::from(amount), 0, 0, 0]
        );
        village.trip = Some(TownTrip {
            project: 0,
            farm_bed: None,
            market_order: true,
            driver: 0,
            vehicle: 0,
            elapsed: 0.0,
            duration: 55.0,
            boarded: true,
        });
        assert_eq!(
            village.inventory(&catalog, &stock)["wood"],
            [initial - u64::from(amount), 0, 0, u64::from(amount), 0]
        );
    }
}
