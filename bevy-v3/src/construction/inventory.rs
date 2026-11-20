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

pub(crate) const INVENTORY_ROWS: usize = 9;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Producer<'a> {
    Site(usize),
    Blueprint(&'a str),
    CraftRecipe(&'a str),
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) enum CraftView {
    #[default]
    Make,
    Repair,
    Jobs,
}

impl CraftView {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::Make => "Make",
            Self::Repair => "Repair",
            Self::Jobs => "Jobs",
        }
    }
}

#[derive(Clone, Copy, Default, PartialEq, Eq)]
pub(crate) enum InventoryView {
    #[default]
    Resources,
    Equipment,
    Food,
    Production,
}

impl InventoryView {
    pub(crate) fn next(self) -> Self {
        match self {
            Self::Resources => Self::Equipment,
            Self::Equipment => Self::Food,
            Self::Food => Self::Production,
            Self::Production => Self::Resources,
        }
    }

    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::Resources => "Resources",
            Self::Equipment => "Items & equipment",
            Self::Food => "Food",
            Self::Production => "Production sites",
        }
    }
}

pub(crate) fn inventory_rows<'a>(
    catalog: &'a Catalog,
    page: usize,
    view: InventoryView,
    search: &str,
) -> (
    usize,
    impl Iterator<Item = (&'a str, &'a str, &'a crate::catalog::Material)> + use<'a>,
) {
    let search = search.trim().to_lowercase();
    let groups = if view == InventoryView::Food {
        std::slice::from_ref(&catalog.food_resources)
    } else {
        catalog.resource_groups.as_slice()
    };
    let rows: Vec<_> = groups
        .iter()
        .flat_map(|group| catalog.resource_group_entries(group))
        .filter(|(_, _, material)| {
            material.equipment == (view == InventoryView::Equipment)
                && (search.is_empty() || material.name.to_lowercase().contains(&search))
        })
        .collect();
    let pages = rows.len().div_ceil(INVENTORY_ROWS).max(1);
    let offset = page.min(pages - 1) * INVENTORY_ROWS;
    (pages, rows.into_iter().skip(offset).take(INVENTORY_ROWS))
}

impl Construction {
    pub(crate) fn crafting_rows<'a>(
        &self,
        catalog: &'a Catalog,
        stock: &Stock,
        page: usize,
        view: CraftView,
    ) -> (usize, Vec<(Producer<'a>, String)>) {
        let rows: Vec<_> = if view == CraftView::Jobs {
            self.production
                .jobs
                .iter()
                .filter_map(|job| {
                    let recipe = &catalog.production[&job.recipe];
                    recipe.craft.as_ref()?;
                    Some((
                        Producer::Site(job.site),
                        format!("{} · Workspace #{}", recipe.name, job.site + 1),
                    ))
                })
                .collect()
        } else {
            catalog
                .production
                .iter()
                .filter_map(|(id, recipe)| {
                    recipe.craft.as_ref()?;
                    let relevant = match &recipe.repair {
                        Some(tool) => view == CraftView::Repair && stock.available(tool) > 0,
                        None => view == CraftView::Make,
                    };
                    relevant.then(|| (Producer::CraftRecipe(id), recipe.name.clone()))
                })
                .collect()
        };
        let pages = rows.len().div_ceil(INVENTORY_ROWS).max(1);
        let offset = page.min(pages - 1) * INVENTORY_ROWS;
        (
            pages,
            rows.into_iter().skip(offset).take(INVENTORY_ROWS).collect(),
        )
    }

    pub(crate) fn craft_workspaces(&self, catalog: &Catalog, recipe: &str) -> Vec<usize> {
        self.plans
            .iter()
            .enumerate()
            .filter_map(|(site, _)| {
                self.recipes(catalog, site)
                    .iter()
                    .any(|(id, _)| id.as_str() == recipe)
                    .then_some(site)
            })
            .collect()
    }

    pub(crate) fn craft_workspace_name(&self, catalog: &Catalog, site: usize) -> String {
        format!(
            "{} #{}",
            catalog.projects[&self.plans[site].key].name,
            site + 1
        )
    }

    pub(crate) fn craft_job_workspaces(&self, catalog: &Catalog, site: usize) -> Vec<usize> {
        self.craft_destinations(catalog, site).1
    }

    pub(crate) fn move_crafting_from_site(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        source: usize,
        destination: usize,
    ) -> bool {
        let (job, destinations) = self.craft_destinations(catalog, source);
        if let Some(job) = job
            && destinations.contains(&destination)
        {
            self.move_craft_job(catalog, stock, job, destination);
            true
        } else {
            false
        }
    }

    pub(crate) fn craft_recipe_summary(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        id: &str,
    ) -> String {
        use std::fmt::Write;
        let recipe = &catalog.production[id];
        let mut text = recipe.name.clone();
        if let Some(craft) = &recipe.craft {
            let qualified = self
                .residents
                .iter()
                .enumerate()
                .filter_map(|(index, resident)| {
                    (resident.craft.level(index, craft.skill) >= craft.level)
                        .then_some(crate::village::NAMES[index])
                })
                .collect::<Vec<_>>();
            let minutes = (recipe.work * 0.45 / (0.75 + craft.level as f64 * 0.15)).ceil();
            let _ = write!(
                text,
                "\n{} level {} · About {minutes:.0} game minutes of work",
                craft.skill.label(),
                craft.level
            );
            let _ = write!(
                text,
                "\nQualified residents · {}",
                if qualified.is_empty() {
                    "None yet".into()
                } else {
                    qualified.join(", ")
                }
            );
            if let Some(tool) = &craft.tool {
                let _ = write!(text, "\nRequires {}", catalog.materials[tool].name);
            }
            let _ = write!(text, "\n{}", craft.stages.join(" → "));
        }
        if let Some(tool) = &recipe.repair {
            let owned = stock.available(tool);
            let equipment = &stock.equipment;
            if let Some(condition) = equipment.condition_percent(tool, owned) {
                let broken = equipment.broken(tool).min(owned);
                let _ = write!(
                    text,
                    "\n{owned} owned · {broken} broken · {condition:.0}% condition"
                );
            }
        }
        for (material, quantity) in &recipe.input {
            let _ = write!(
                text,
                "\n{} · {quantity} needed · {} available",
                catalog.materials[material].name,
                stock.available(material)
            );
        }
        text
    }

    pub(crate) fn craft_job_worker(&self, site: usize) -> &'static str {
        self.production
            .jobs
            .iter()
            .find(|job| job.site == site)
            .and_then(|job| job.worker)
            .map_or("Waiting for an available resident", |resident| {
                crate::village::NAMES[resident]
            })
    }

    pub(crate) fn crafting_plan(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        recipe: &str,
        preferred: Option<usize>,
    ) -> Result<usize, String> {
        let workspaces = self.craft_workspaces(catalog, recipe);
        let mut reason = "Build a suitable workspace first.".to_string();
        if let Some(site) = preferred
            && !workspaces.contains(&site)
        {
            return Err("The selected workspace is unavailable.".into());
        }
        for site in workspaces
            .into_iter()
            .filter(|site| preferred.is_none_or(|choice| choice == *site))
        {
            if !self.utilities.enabled(site) {
                reason = "Switch on the workspace first.".into();
                continue;
            }
            match self.batch_inputs(catalog, stock, site, recipe) {
                Ok(_) => return Ok(site),
                Err(blocker) => reason = blocker,
            }
        }
        Err(reason)
    }

    pub(crate) fn start_crafting(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        recipe: &str,
        preferred: Option<usize>,
    ) -> Option<usize> {
        let site = self.crafting_plan(catalog, stock, recipe, preferred).ok()?;
        self.queue_batch(catalog, stock, site, recipe);
        Some(site)
    }

    pub(crate) fn inventory_producers<'a>(
        &self,
        catalog: &'a Catalog,
        page: usize,
        search: &str,
        sandbox: bool,
    ) -> (usize, Vec<(Producer<'a>, String)>) {
        let search = search.trim().to_lowercase();
        let matches = |name: &str| name.to_lowercase().contains(&search);
        let matches_recipe = |recipe: &crate::catalog::ProductionRecipe| {
            matches(&recipe.name)
                || recipe.output.keys().any(|id| {
                    catalog
                        .materials
                        .get(id)
                        .is_some_and(|material| matches(&material.name))
                })
        };
        let mut rows: Vec<_> = self
            .plans
            .iter()
            .enumerate()
            .filter_map(|(index, plan)| {
                let definition = &catalog.projects[&plan.key];
                if plan.removed || plan.work < definition.work || self.changes.contains_key(&index)
                {
                    return None;
                }
                let recipes = self.recipes(catalog, index);
                let plot = self.farming.plots.get(&index);
                if recipes.is_empty() && plot.is_none() {
                    return None;
                }
                let label = format!("{} #{}", definition.name, index + 1);
                let found = matches(&label)
                    || recipes.iter().any(|(_, recipe)| matches_recipe(recipe))
                    || plot
                        .is_some_and(|plot| plot.beds.iter().any(|bed| matches(bed.crop.label())));
                found.then_some((Producer::Site(index), format!("Open · {label}")))
            })
            .collect();
        if !search.is_empty() {
            rows.extend(catalog.build_options().filter_map(|(key, definition)| {
                let matches_building = matches(&definition.name);
                let matches_production = catalog.production.values().any(|recipe| {
                    recipe.kind == definition.kind && (matches_building || matches_recipe(recipe))
                });
                (matches_production
                    && !self.blueprint_already_planned(key, definition, sandbox, None))
                .then(|| {
                    (
                        Producer::Blueprint(key),
                        format!("Build producer · {}", definition.name),
                    )
                })
            }));
        }
        let pages = rows.len().div_ceil(INVENTORY_ROWS).max(1);
        let offset = page.min(pages - 1) * INVENTORY_ROWS;
        (
            pages,
            rows.into_iter().skip(offset).take(INVENTORY_ROWS).collect(),
        )
    }

    pub(crate) fn open_inventory_producer(
        &mut self,
        catalog: &Catalog,
        site: usize,
    ) -> Option<Vec2> {
        self.farming.close();
        self.select_project(Some(site));
        if self.has_selected_plot() {
            self.toggle_beds();
        } else {
            self.toggle_recipes(catalog);
        }
        self.selected_project_center()
    }

    pub(crate) fn inventory_production_summary(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        page: usize,
        search: &str,
        clock: f64,
    ) -> String {
        use std::fmt::Write;
        let (pages, rows) = self.inventory_producers(catalog, page, search, stock.sandbox);
        let page = page.min(pages - 1) + 1;
        let mut text = format!(
            "Production sites · {page}/{pages} · Tab Switch view · Page Up/Down · F10 Close"
        );
        if rows.is_empty() {
            text.push_str("\nNo completed production sites match. Search for a building, crop, recipe or product.");
        }
        for (producer, _) in rows {
            let Producer::Site(site) = producer else {
                continue;
            };
            let name = &catalog.projects[&self.plans[site].key].name;
            let _ = write!(text, "\n{name} #{}", site + 1);
            if let Some(plot) = self.farming.plots.get(&site) {
                let ready = plot
                    .beds
                    .iter()
                    .filter(|bed| {
                        bed.stage == crate::farming::Stage::Harvestable
                            && !bed.harvest_expired(clock)
                    })
                    .count();
                let jobs = self
                    .farming
                    .jobs
                    .iter()
                    .filter(|job| job.site == site)
                    .count();
                let _ = write!(
                    text,
                    " · {} beds · {ready} ready to harvest · {jobs} jobs",
                    plot.beds.len()
                );
            } else {
                let activity = self.production_site_status(catalog, stock, site, clock);
                let enabled = self.utilities.enabled(site);
                if !enabled {
                    text.push_str(" · Switched off");
                }
                if activity.is_empty() && enabled {
                    text.push_str(" · No batch queued");
                } else {
                    text.push_str(&activity);
                }
            }
        }
        text
    }

    pub(crate) fn place_inventory_producer(&mut self, key: &str, sandbox: bool) {
        self.farming.close();
        self.select_project(None);
        self.cancel_placement();
        if !self.menu {
            self.toggle_build_menu(sandbox);
        }
        self.choose_blueprint(key);
    }

    fn inventory<'a>(&self, catalog: &'a Catalog, stock: &Stock, land: &Land) -> Ledger<'a> {
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
            let pickup = self.construction_pickup_cargo(index);
            let freight = self.construction_freight_cargo(index);
            if pickup.is_some() || freight.is_some() {
                for (id, &amount) in plan.materials(catalog) {
                    let cargo = pickup
                        .as_ref()
                        .into_iter()
                        .chain(freight)
                        .filter_map(|shipment| shipment.get(id))
                        .copied()
                        .sum::<u32>()
                        .min(amount);
                    add(&mut ledger, id, cargo, Location::Transit);
                    add(&mut ledger, id, amount - cargo, location);
                }
            } else {
                record(&mut ledger, plan.materials(catalog), location);
            }
            if let Some(goats) = self.installed_goats(catalog, index) {
                record(&mut ledger, goats, Location::Installed);
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
        for (&index, job) in &self.gathering.orders {
            if !matches!(job.phase, GatherPhase::Return | GatherPhase::CollectOutput) {
                continue;
            }
            if let Some(site) = land.site(index) {
                let output = job.remaining_output(&catalog.gathering[site.recipe()].output);
                record_output(
                    &mut ledger,
                    catalog,
                    output,
                    job.worker.is_some() && job.phase == GatherPhase::Return,
                );
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
                .any(|trip| trip.covers_order(index) && trip.boarded);
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

    pub fn replacement_costs(&self, catalog: &Catalog, stock: &Stock, land: &Land) -> String {
        let mut totals = [0.0; 5];
        for (id, amounts) in self.inventory(catalog, stock, land) {
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

    pub fn pantry_commitments(&self, catalog: &Catalog, stock: &Stock, land: &Land) -> String {
        use std::fmt::Write;

        let ledger = self.inventory(catalog, stock, land);
        let mut text = String::from("Food committed and on the way");
        for (id, _) in crate::food::FOODS {
            let item = &catalog.materials[id];
            let [_, reserved, processing, transit, _] = ledger[id];
            if reserved == 0 && processing == 0 && transit == 0 {
                continue;
            }
            let _ = write!(text, "\n{}", item.name);
            for (amount, status) in [
                (reserved, "reserved"),
                (processing, "in work"),
                (transit, "in transit"),
            ] {
                if amount > 0 {
                    let _ = write!(text, " · {} {status}", item.quantity_text(amount));
                }
            }
        }
        if !text.contains('\n') {
            text.push_str("\nNo food committed or in transit.");
        }
        text
    }

    pub fn inventory_panel(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        land: &Land,
        page: usize,
        view: InventoryView,
        search: &str,
    ) -> (usize, String) {
        use std::fmt::Write;
        let ledger = self.inventory(catalog, stock, land);
        let (pages, rows) = inventory_rows(catalog, page, view, search);
        let page = page.min(pages - 1);
        let (used, capacity) = self.storage(catalog, stock);
        let heading = view.label();
        let mut text = format!(
            "{heading} · Stores {used}/{capacity} units · {}/{} · Tab Switch view · Page Up/Down · F10 Close",
            page + 1,
            pages
        );
        let mut rows = rows.peekable();
        if rows.peek().is_none() {
            text.push_str("\nNo matching stock.");
        }
        let mut previous_group = "";
        for (group, id, item) in rows {
            if group != previous_group && view != InventoryView::Equipment {
                let _ = write!(text, "\n{group}");
                previous_group = group;
            }
            let row = ledger[id];
            let _ = write!(
                text,
                "\n{} · {} available",
                item.name,
                item.quantity_text(row[Location::Stores as usize])
            );
            for (&amount, label) in
                row[1..]
                    .iter()
                    .zip(["reserved", "in work", "in transit", "installed"])
            {
                if amount > 0 {
                    let _ = write!(text, " · {} {label}", item.quantity_text(amount));
                }
            }
            if crate::equipment::TOOLS.contains(&id) {
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

    #[test]
    fn village_crafting_reserves_inputs_at_the_chosen_workspace() {
        let catalog = Catalog::default();
        let key = "supply-5";
        let id = "craft_harvest-basket";
        let mut construction = Construction::default();
        for x in [42, 45] {
            let mut plan = construction.proposed_site(&catalog, key, IVec2::new(x, 36));
            plan.work = catalog.projects[key].work;
            construction.plans.push(plan);
        }
        let mut stock = Stock::default();
        stock.receive(&BTreeMap::from([
            ("bamboo".into(), 4),
            ("carpentry-tools".into(), 1),
        ]));
        assert_eq!(
            construction.crafting_plan(&catalog, &stock, id, None),
            Ok(0)
        );
        assert_eq!(
            construction.start_crafting(&catalog, &mut stock, id, Some(1)),
            Some(1)
        );
        assert_eq!(stock.available("bamboo"), 2);
        assert_eq!(
            construction.start_crafting(&catalog, &mut stock, id, Some(1)),
            None
        );
        assert_eq!(stock.available("bamboo"), 2);
        assert_eq!(
            construction
                .crafting_rows(&catalog, &stock, 0, CraftView::Jobs)
                .1[0]
                .0,
            Producer::Site(1)
        );
        assert!(construction.move_crafting_from_site(&catalog, &mut stock, 1, 0));
        assert_eq!(stock.available("bamboo"), 2);
        assert_eq!(
            construction
                .crafting_rows(&catalog, &stock, 0, CraftView::Jobs)
                .1[0]
                .0,
            Producer::Site(0)
        );
    }

    #[test]
    fn producer_search_finds_recipe_outputs_at_completed_sites() {
        let catalog = Catalog::default();
        let mut construction = Construction::default();
        let key = "supply-5";
        let mut ready = construction.proposed_site(&catalog, key, IVec2::new(42, 36));
        ready.work = catalog.projects[key].work;
        let planned = construction.proposed_site(&catalog, key, IVec2::new(45, 36));
        construction.plans.extend([ready, planned]);

        let (_, rows) = construction.inventory_producers(&catalog, 0, " TIMBER PIECES ", true);
        assert_eq!(
            rows[0],
            (Producer::Site(0), "Open · Timber workbench #1".into())
        );
        assert!(
            rows.iter()
                .any(|(producer, _)| *producer == Producer::Blueprint(key))
        );
        assert!(
            !rows
                .iter()
                .any(|(producer, _)| *producer == Producer::Site(1))
        );
        let summary = construction.inventory_production_summary(
            &catalog,
            &Stock::default(),
            0,
            "timber pieces",
            0.0,
        );
        assert!(summary.contains("Timber workbench #1 · No batch queued"));
        assert!(!summary.contains("Timber workbench #2"));
        assert!(construction.open_inventory_producer(&catalog, 0).is_some());
        assert_eq!(construction.production.selected, Some(0));
        assert!(construction.production.open);
        construction.place_inventory_producer(key, true);
        assert_eq!(construction.selection.as_deref(), Some(key));
        let mut keyboard = ButtonInput::default();
        keyboard.press(KeyCode::KeyR);
        construction.input(&keyboard, &catalog, true);
        assert_eq!(construction.rotation, 1);
    }

    #[test]
    fn food_view_lists_v2_foods_and_excludes_farm_supplies() {
        let catalog = Catalog::default();
        let (_, rows) = inventory_rows(&catalog, 0, InventoryView::Food, "");
        let ids: Vec<_> = rows.map(|(_, id, _)| id).collect();
        assert_eq!(
            ids,
            [
                "food", "greens", "beans", "corn", "meals", "eggs", "milk", "honey"
            ]
        );
    }

    #[test]
    fn resource_groups_cover_every_material_and_label_filtered_rows() {
        let catalog = Catalog::default();
        let ids: Vec<_> = catalog
            .resource_groups
            .iter()
            .flat_map(|group| &group.ids)
            .collect();
        let unique: std::collections::BTreeSet<_> = ids.iter().copied().collect();
        assert_eq!(ids.len(), unique.len());
        assert_eq!(unique, catalog.materials.keys().collect());
        let stock = Stock::for_start(&WorldSetup::default(), &catalog);
        let material = &catalog.materials["plumbing"];
        let (_, text) = Construction::default().inventory_panel(
            &catalog,
            &stock,
            &Land::default(),
            0,
            InventoryView::Resources,
            &material.name,
        );
        assert!(text.contains(&format!(
            "Manufactured / industrial materials\n{}",
            material.name
        )));
    }

    #[test]
    fn inventory_search_keeps_depleted_supplies_visible() {
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
        let village = Construction::default();
        let item = &catalog.materials["plumbing"];
        let available = stock.available("plumbing");
        stock.reserve_available(&BTreeMap::from([("plumbing".into(), available)]));
        assert_eq!(stock.available("plumbing"), 0);
        let (_, text) = village.inventory_panel(
            &catalog,
            &stock,
            &Land::default(),
            0,
            InventoryView::Resources,
            &item.name,
        );
        assert!(text.contains(&format!(
            "{} · {} available",
            item.name,
            item.quantity_text(0)
        )));
    }

    #[test]
    fn pantry_commitments_show_food_freight_before_it_reaches_stores() {
        let catalog = Catalog::default();
        let land = Land::default();
        let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
        let mut village = Construction::default();
        assert!(
            village
                .pantry_commitments(&catalog, &stock, &land)
                .contains("No food committed")
        );
        let before = stock.available("greens");
        village
            .trade
            .buy(
                &catalog,
                &mut stock,
                &mut village.market,
                "greens",
                (0.0, 12, true),
            )
            .unwrap();
        let text = village.pantry_commitments(&catalog, &stock, &land);
        assert!(text.contains(&catalog.materials["greens"].name));
        assert!(text.contains("in transit"));
        assert_eq!(stock.available("greens"), before);
    }
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
            village.inventory(&catalog, &stock, &Land::default())["plumbing"]
                [Location::Reserved as usize],
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
            waiting_for_access: false,
            pickups: 1,
            fare: 776,
            seed_freight_eta: None,
        });
        assert_eq!(
            village.inventory(&catalog, &stock, &Land::default())[material],
            [initial, 2, 0, 0, 0]
        );
        village.farming.jobs[0].pickups = 0;
        assert_eq!(
            village.inventory(&catalog, &stock, &Land::default())[material],
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
            village.inventory(&catalog, &stock, &Land::default())["logs"],
            [initial, 0, 48, 0, 0]
        );
        village.production.jobs[0].worker = Some(0);
        assert_eq!(
            village.inventory(&catalog, &stock, &Land::default())["logs"],
            [initial, 0, 43, 5, 0]
        );

        stock.receive(&BTreeMap::from([("logs".into(), 5)]));
        let job = &mut village.production.jobs[0];
        job.delivered_output = Some(BTreeMap::from([("logs".into(), 43)]));
        job.returning_to_site = true;
        assert_eq!(
            village.inventory(&catalog, &stock, &Land::default())["logs"],
            [initial + 5, 0, 43, 0, 0]
        );
    }

    #[test]
    fn gathering_ledger_counts_only_one_load_in_transit() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let land = Land::generate(&setup);
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut village = Construction::default();
        let deposit = land.site_at(IVec2::new(45, -26)).unwrap();
        let initial = u64::from(stock.available("stone"));
        let total = catalog.gathering["stone"].output["stone"];
        village
            .gathering
            .queue_resource(
                &catalog,
                &land,
                deposit,
                (setup.terrain().seed, setup.richness(), 0.0),
            )
            .unwrap();
        assert_eq!(
            village.inventory(&catalog, &stock, &land)["stone"],
            [initial, 0, 0, 0, 0]
        );

        let job = village.gathering.orders.get_mut(&deposit).unwrap();
        job.worker = Some(0);
        job.phase = GatherPhase::Return;
        let load = super::super::production_work::production_load(
            &catalog,
            &catalog.gathering["stone"].output,
        );
        let carried = load["stone"];
        assert!((1..total).contains(&carried));
        assert_eq!(
            village.inventory(&catalog, &stock, &land)["stone"],
            [
                initial,
                0,
                u64::from(total - carried),
                u64::from(carried),
                0
            ],
        );

        stock.receive(&load);
        let job = village.gathering.orders.get_mut(&deposit).unwrap();
        job.phase = GatherPhase::CollectOutput;
        job.remaining = Some(BTreeMap::from([("stone".into(), total - carried)]));
        assert_eq!(
            village.inventory(&catalog, &stock, &land)["stone"],
            [
                initial + u64::from(carried),
                0,
                u64::from(total - carried),
                0,
                0
            ],
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
            village.inventory(&catalog, &stock, &Land::default())["wood"],
            [initial - u64::from(amount), u64::from(amount), 0, 0, 0]
        );
        village.trip = Some(TownTrip {
            project: 0,
            farm_bed: None,
            market_order: true,
            exports: 0,
            return_purchase: None,
            driver: 0,
            vehicle: 0,
            elapsed: 0.0,
            duration: 55.0,
            boarded: true,
        });
        assert_eq!(
            village.inventory(&catalog, &stock, &Land::default())["wood"],
            [initial - u64::from(amount), 0, 0, u64::from(amount), 0]
        );
    }
}
