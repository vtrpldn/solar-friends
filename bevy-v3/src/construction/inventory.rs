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

fn record_output(
    ledger: &mut Ledger,
    catalog: &Catalog,
    output: &BTreeMap<String, u32>,
    carrying: bool,
) {
    let load = if carrying {
        super::production_work::production_load(catalog, output)
    } else {
        BTreeMap::new()
    };
    for (id, &amount) in output {
        let carried = load.get(id).copied().unwrap_or(0);
        add(ledger, id, carried, Location::Transit);
        add(ledger, id, amount - carried, Location::Processing);
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
            if let Some(shipment) = self.construction_freight_cargo(index) {
                for (id, &amount) in plan.materials(catalog) {
                    let cargo = shipment.get(id).copied().unwrap_or(0).min(amount);
                    add(&mut ledger, id, cargo, Location::Transit);
                    add(&mut ledger, id, amount - cargo, location);
                }
            } else {
                record(&mut ledger, plan.materials(catalog), location);
            }
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
                let output = job.delivered_output.as_ref().unwrap_or(&recipe.output);
                record_output(
                    &mut ledger,
                    catalog,
                    output,
                    job.worker.is_some() && !job.returning_to_site,
                );
            } else {
                record(
                    &mut ledger,
                    &self.recipe_materials(catalog, job.site, &job.recipe),
                    Location::Processing,
                );
            }
        }
        for job in &self.farming.jobs {
            if matches!(job.phase, FarmPhase::Return | FarmPhase::CollectOutput) {
                record_output(
                    &mut ledger,
                    catalog,
                    &job.output,
                    job.worker.is_some() && job.phase == FarmPhase::Return,
                );
            } else {
                let location = if job.pickups > 0 {
                    Location::Reserved
                } else {
                    Location::Processing
                };
                record(&mut ledger, &job.inputs, location);
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
        equipment: bool,
        search: &str,
    ) -> (usize, String) {
        use std::fmt::Write;
        const ROWS: usize = 9;
        let search = search.trim().to_lowercase();
        let ledger = self.inventory(catalog, stock);
        let mut rows: Vec<_> = ledger
            .into_iter()
            .filter(|(id, amounts)| {
                catalog.materials[*id].equipment == equipment
                    && (search.is_empty()
                        || catalog.materials[*id].name.to_lowercase().contains(&search))
                    && amounts.iter().any(|&amount| amount > 0)
            })
            .collect();
        rows.sort_by(|(a, _), (b, _)| catalog.materials[*a].name.cmp(&catalog.materials[*b].name));
        let pages = rows.len().div_ceil(ROWS).max(1);
        let page = page.min(pages - 1);
        let (used, capacity) = self.storage(catalog, stock);
        let heading = if equipment {
            "Items & equipment"
        } else {
            "Resources"
        };
        let mut text = format!(
            "{heading} · Stores {used}/{capacity} units · {}/{} · Tab Switch view · Page Up/Down · F10 Close",
            page + 1,
            pages
        );
        if rows.is_empty() {
            text.push_str("\nNo matching stock.");
        }
        for (id, row) in rows.iter().skip(page * ROWS).take(ROWS) {
            let item = &catalog.materials[*id];
            let _ = write!(text, "\n{}", item.name);
            for (&amount, label) in
                row.iter()
                    .zip(["stored", "reserved", "in work", "in transit", "installed"])
            {
                if amount > 0 {
                    let _ = write!(text, " · {} {label}", item.quantity_text(amount));
                }
            }
            if crate::equipment::TOOLS.contains(id) {
                let count = stock.available(id);
                let repairing = self.repairing(catalog, id);
                let equipment = &stock.equipment;
                let ready = equipment.available(id, count, repairing);
                let broken = equipment.broken(id).min(count);
                let borrowers = equipment
                    .borrowers(id)
                    .map(|index| crate::village::NAMES[index])
                    .collect::<Vec<_>>();
                let _ = write!(
                    text,
                    "\n  {ready} ready · {broken} broken · {} in use",
                    borrowers.len()
                );
                if !borrowers.is_empty() {
                    let _ = write!(text, " ({})", borrowers.join(", "));
                }
                if let Some(condition) = equipment.condition_percent(id, count) {
                    let _ = write!(text, " · {condition:.0}% condition");
                }
                if repairing {
                    text.push_str(" · Repair queued");
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
    fn a_paid_blueprint_keeps_its_material_bill_after_catalog_changes() {
        let mut catalog = Catalog::default();
        let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
        let mut village = Construction::default();
        let mut plan = village.proposed_site(&catalog, "well", IVec2::ZERO);
        Construction::reserve_project(
            &mut village.market,
            &mut stock,
            &catalog,
            &mut plan,
            TownClock {
                seconds: 0.0,
                round_trip_km: 12,
            },
        )
        .unwrap();
        let paid = plan.materials(&catalog)["plumbing"];
        let saved = serde_json::to_vec(&plan).unwrap();
        catalog
            .projects
            .get_mut("well")
            .unwrap()
            .materials
            .insert("plumbing".into(), paid + 10);
        village.plans.push(serde_json::from_slice(&saved).unwrap());
        assert_eq!(
            village.inventory(&catalog, &stock)["plumbing"][Location::Reserved as usize],
            u64::from(paid)
        );
    }

    #[test]
    fn paid_seed_inputs_remain_in_the_ledger_until_they_reach_the_bed() {
        use crate::farming::{FarmAction, FarmJob, FarmPhase};

        let catalog = Catalog::default();
        let stock = Stock::for_start(&WorldSetup::default(), &catalog);
        let mut village = Construction::default();
        let material = "greens_seed";
        let initial = u64::from(stock.available(material));
        village.farming.jobs.push(FarmJob {
            site: 0,
            bed: 0,
            action: FarmAction::Plant,
            worker: None,
            phase: FarmPhase::Pickup,
            work: 0.0,
            required: 10.0,
            inputs: BTreeMap::from([(material.into(), 2)]),
            output: Default::default(),
            food_output: None,
            retry: 0.0,
            pickups: 1,
            fare: 776,
        });
        assert_eq!(
            village.inventory(&catalog, &stock)[material],
            [initial, 2, 0, 0, 0]
        );
        village.farming.jobs[0].pickups = 0;
        assert_eq!(
            village.inventory(&catalog, &stock)[material],
            [initial, 0, 2, 0, 0]
        );
    }

    #[test]
    fn only_the_current_production_load_is_in_transit() {
        use crate::production::Phase;

        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
        let mut village = Construction::default();
        let mut site = village.proposed_site(&catalog, "supply-0", IVec2::ZERO);
        site.work = catalog.projects["supply-0"].work;
        site.delivered = site.loads;
        village.plans.push(site);
        stock.sandbox = true;
        village.queue_batch(&catalog, &mut stock, 0, "wood");
        stock.sandbox = false;
        let initial = u64::from(stock.available("logs"));
        village.production.jobs[0].phase = Phase::Return;
        assert_eq!(
            village.inventory(&catalog, &stock)["logs"],
            [initial, 0, 48, 0, 0]
        );
        village.production.jobs[0].worker = Some(0);
        assert_eq!(
            village.inventory(&catalog, &stock)["logs"],
            [initial, 0, 43, 5, 0]
        );

        stock.receive(&BTreeMap::from([("logs".into(), 5)]));
        let job = &mut village.production.jobs[0];
        job.delivered_output = Some(BTreeMap::from([("logs".into(), 43)]));
        job.returning_to_site = true;
        assert_eq!(
            village.inventory(&catalog, &stock)["logs"],
            [initial + 5, 0, 43, 0, 0]
        );
    }

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
