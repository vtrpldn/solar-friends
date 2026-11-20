use std::borrow::Cow;

use crate::{
    catalog::ProductionRecipe,
    production::{
        Batch, Phase,
        growth::{Conditions, Growth, Irrigation},
    },
    setup::WorldSetup,
    weather::{DAY, growing_season, step_weather},
};

use super::{resident_work::project_access_points, *};

impl Construction {
    pub fn select_facility(&mut self, cell: IVec2) {
        let index = self
            .plans
            .iter()
            .enumerate()
            .find(|(_, plan)| {
                cell.cmpge(plan.position).all()
                    && cell.cmplt(plan.position + plan.size).all()
                    && !plan.removed
            })
            .map(|(index, _)| index);
        self.select_project(index);
    }

    pub(super) fn select_project(&mut self, index: Option<usize>) {
        if self.production.selected != index {
            self.farming.pending_crop_clear = None;
        }
        self.production.selected = index;
        self.production.open = false;
        self.production.page = 0;
        self.production.craft_destination = 0;
        self.production.notice.clear();
    }

    pub(super) fn empty_goat_pen(&self, index: usize) -> bool {
        self.plans[index].key == "goat-pasture-empty"
            && !self.livestock.animals.contains_key(&index)
    }

    pub(super) fn installed_goats<'a>(
        &self,
        catalog: &'a Catalog,
        index: usize,
    ) -> Option<&'a BTreeMap<String, u32>> {
        (self.plans[index].key == "goat-pasture-empty" && !self.empty_goat_pen(index))
            .then_some(&catalog.production["stock-goats"].input)
    }

    pub(crate) fn recipes<'a>(
        &self,
        catalog: &'a Catalog,
        index: usize,
    ) -> Vec<(&'a String, &'a ProductionRecipe)> {
        let plan = &self.plans[index];
        let definition = &catalog.projects[&plan.key];
        if plan.removed || self.changes.contains_key(&index) || plan.work < definition.work {
            return Vec::new();
        }
        let kind = &definition.kind;
        let mut recipes: Vec<_> = catalog
            .production
            .iter()
            .filter(|(id, recipe)| {
                recipe.kind == *kind && (id.as_str() == "stock-goats") == self.empty_goat_pen(index)
            })
            .collect();
        recipes.sort_by_key(|(_, recipe)| recipe.repair.is_some());
        recipes
    }

    pub fn production_input(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        keyboard: &ButtonInput<KeyCode>,
    ) {
        if keyboard.just_pressed(KeyCode::KeyB) {
            self.production.open = false;
        }
        if keyboard.just_pressed(KeyCode::KeyT) {
            self.cycle_facility_irrigation(catalog);
        }
        if keyboard.just_pressed(KeyCode::KeyC) {
            self.toggle_recipes(catalog);
        }
        if !self.production.open || self.menu {
            return;
        }
        if keyboard.just_pressed(KeyCode::BracketRight) {
            self.cycle_craft_workspace(catalog, true);
        } else if keyboard.just_pressed(KeyCode::BracketLeft) {
            self.cycle_craft_workspace(catalog, false);
        }
        if keyboard.just_pressed(KeyCode::KeyM)
            && !keyboard.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight])
        {
            self.move_selected_craft(catalog, stock);
            return;
        }
        if keyboard.any_just_pressed([KeyCode::PageDown, KeyCode::PageUp]) {
            self.page_recipes(catalog, keyboard.just_pressed(KeyCode::PageDown));
        }
        if let Some(row) = PAGE_KEYS.iter().position(|key| keyboard.just_pressed(*key)) {
            self.queue_recipe_row(catalog, stock, row);
        }
    }

    pub fn craft_workspace_label(&self, catalog: &Catalog) -> Option<(String, usize)> {
        let source = self.production.selected?;
        let (_, destinations) = self.craft_destinations(catalog, source);
        let &destination = destinations.get(
            self.production
                .craft_destination
                .min(destinations.len().saturating_sub(1)),
        )?;
        let name = &catalog.projects[&self.plans[destination].key].name;
        Some((
            format!("Move to {name} #{}", destination + 1),
            destinations.len(),
        ))
    }

    pub fn cycle_craft_workspace(&mut self, catalog: &Catalog, forward: bool) {
        let Some(source) = self.production.selected else {
            return;
        };
        let count = self.craft_destinations(catalog, source).1.len();
        if count > 0 {
            let current = self.production.craft_destination.min(count - 1);
            self.production.craft_destination = if forward {
                (current + 1) % count
            } else {
                (current + count - 1) % count
            };
        }
    }

    pub fn move_selected_craft(&mut self, catalog: &Catalog, stock: &mut Stock) {
        let Some(source) = self.production.selected else {
            return;
        };
        let (job, destinations) = self.craft_destinations(catalog, source);
        if let Some(job) = job
            && let Some(&destination) = destinations.get(
                self.production
                    .craft_destination
                    .min(destinations.len().saturating_sub(1)),
            )
        {
            self.select_project(Some(destination));
            self.production.open = true;
            self.move_craft_job(catalog, stock, job, destination);
        }
    }

    pub(super) fn craft_destinations(
        &self,
        catalog: &Catalog,
        source: usize,
    ) -> (Option<usize>, Vec<usize>) {
        let Some(job) = self.production.jobs.iter().position(|job| {
            job.site == source
                && job.phase != Phase::Return
                && catalog.production[&job.recipe].craft.is_some()
        }) else {
            return (None, Vec::new());
        };
        let recipe = &catalog.production[&self.production.jobs[job].recipe];
        let destinations = self
            .plans
            .iter()
            .enumerate()
            .filter_map(|(id, plan)| {
                let definition = &catalog.projects[&plan.key];
                (id != source
                    && !plan.removed
                    && plan.work >= definition.work
                    && definition.kind == recipe.kind
                    && !self.changes.contains_key(&id)
                    && self.utilities.enabled(id)
                    && !self.production.jobs.iter().any(|job| job.site == id))
                .then_some(id)
            })
            .collect();
        (Some(job), destinations)
    }

    pub(super) fn move_craft_job(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        index: usize,
        destination: usize,
    ) {
        let job = &mut self.production.jobs[index];
        if let Some(worker) = job.worker.take() {
            self.residents[worker].path.clear();
        }
        job.site = destination;
        job.phase = Phase::Pickup;
        job.retry_at = 0.0;
        job.waiting_for_access = false;
        stock
            .equipment
            .release(|worker, task| self.active_tool_task(worker, task));
        self.production.notice = format!(
            "Job moved to {} #{}.",
            catalog.projects[&self.plans[destination].key].name,
            destination + 1
        );
    }

    fn selected_irrigation_site(&self, catalog: &Catalog) -> Option<usize> {
        self.production.selected.filter(|&index| {
            self.recipes(catalog, index).iter().any(|(_, recipe)| {
                recipe
                    .biology
                    .as_ref()
                    .is_some_and(|biology| biology.care.is_some())
            })
        })
    }

    pub fn facility_irrigation(&self, catalog: &Catalog) -> Option<Irrigation> {
        let index = self.selected_irrigation_site(catalog)?;
        Some(
            self.production
                .growing_sites
                .get(&index)
                .map_or_else(Irrigation::default, |ground| ground.irrigation),
        )
    }

    pub fn cycle_facility_irrigation(&mut self, catalog: &Catalog) {
        if let Some(index) = self.selected_irrigation_site(catalog) {
            let ground = self.production.growing_sites.entry(index).or_default();
            ground.irrigation = ground.irrigation.cycle();
        }
    }

    pub fn has_recipes(&self, catalog: &Catalog) -> bool {
        self.production
            .selected
            .is_some_and(|index| !self.recipes(catalog, index).is_empty())
    }

    pub fn toggle_recipes(&mut self, catalog: &Catalog) {
        if self.has_recipes(catalog) {
            self.production.open = !self.production.open;
        }
    }

    pub fn page_recipes(&mut self, catalog: &Catalog, forward: bool) {
        if let Some(index) = self.production.selected {
            let pages = self
                .recipes(catalog, index)
                .len()
                .div_ceil(PAGE_KEYS.len())
                .max(1);
            self.production.page =
                (self.production.page + if forward { 1 } else { pages - 1 }) % pages;
        }
    }

    pub fn recipe_page_labels(&self, catalog: &Catalog) -> Vec<String> {
        let Some(index) = self.production.selected else {
            return Vec::new();
        };
        self.recipes(catalog, index)
            .iter()
            .skip(self.production.page * PAGE_KEYS.len())
            .take(PAGE_KEYS.len())
            .map(|(_, recipe)| recipe.name.clone())
            .collect()
    }

    pub fn recipe_row_details(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        row: usize,
    ) -> Option<String> {
        use std::fmt::Write;
        let site = self.production.selected?;
        let recipes = self.recipes(catalog, site);
        let (id, recipe) = recipes.get(self.production.page * PAGE_KEYS.len() + row)?;
        let materials = |items: &BTreeMap<String, u32>| {
            items
                .iter()
                .map(|(id, &amount)| {
                    let item = &catalog.materials[id];
                    format!("{} {}", item.quantity_text(u64::from(amount)), item.name)
                })
                .collect::<Vec<_>>()
                .join(", ")
        };
        let mut detail = format!(
            "{}\n{:.0} game minutes of work",
            recipe.name,
            (recipe.work * 0.45).ceil()
        );
        let inputs = self.recipe_materials(catalog, site, id);
        if !inputs.is_empty() {
            let _ = write!(detail, "\nUses {}", materials(&inputs));
        }
        if !recipe.output.is_empty() {
            let _ = write!(detail, "\nProduces {}", materials(&recipe.output));
        }
        if recipe.water > 0.0 {
            let _ = write!(detail, "\nNeeds {} L of water", recipe.water);
        }
        if let Some(craft) = &recipe.craft {
            let _ = write!(detail, "\n{} level {}", craft.skill.label(), craft.level);
            if let Some(tool) = &craft.tool {
                let _ = write!(detail, " · {}", catalog.materials[tool].name);
            }
        }
        if let Some(tool) = &recipe.repair {
            let owned = stock.available(tool);
            let equipment = &stock.equipment;
            if let Some(condition) = equipment.condition_percent(tool, owned) {
                let broken = equipment.broken(tool).min(owned);
                let _ = write!(
                    detail,
                    "\n{owned} owned · {broken} broken · {condition:.0}% condition"
                );
            }
        }
        if let Some(biology) = &recipe.biology {
            let _ = write!(detail, "\n{} days of growth at full rate", biology.days);
        }
        if let Err(reason) = self.batch_inputs(catalog, stock, site, id) {
            let _ = write!(detail, "\n{reason}");
        }
        Some(detail)
    }

    pub fn queue_recipe_row(&mut self, catalog: &Catalog, stock: &mut Stock, row: usize) {
        let Some(index) = self.production.selected else {
            return;
        };
        let recipes = self.recipes(catalog, index);
        let Some((id, _)) = recipes
            .get(self.production.page * PAGE_KEYS.len() + row)
            .copied()
        else {
            return;
        };
        self.queue_batch(catalog, stock, index, id);
    }

    pub(super) fn craft_blocker(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        recipe: &ProductionRecipe,
        worker: Option<usize>,
    ) -> Option<String> {
        let craft = recipe.craft.as_ref()?;
        let qualified =
            |index: usize| self.residents[index].craft.level(index, craft.skill) >= craft.level;
        if !worker.map_or_else(|| (0..self.residents.len()).any(qualified), qualified) {
            return Some(format!(
                "Needs {} level {}.",
                craft.skill.label(),
                craft.level
            ));
        }
        if let Some(tool) = &craft.tool {
            let owned = stock.available(tool);
            if !stock
                .equipment
                .ready(tool, owned, worker, self.repairing(catalog, tool))
            {
                return Some(if owned > 0 && stock.equipment.broken(tool) >= owned {
                    "Waiting for carpentry tool repair.".into()
                } else {
                    "Waiting for shared carpentry tools.".into()
                });
            }
        }
        None
    }

    pub(super) fn queue_batch(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        index: usize,
        id: &str,
    ) {
        let food_input = match self.batch_inputs(catalog, stock, index, id) {
            Ok(inputs) => inputs.map(|inputs| {
                stock.reserve_materials(&inputs, crate::stock::MaterialReason::ProductionInput)
            }),
            Err(reason) => {
                self.production.notice = reason;
                return;
            }
        };
        self.production.jobs.push(Batch {
            site: index,
            recipe: id.into(),
            worker: None,
            phase: Phase::Pickup,
            work: 0.0,
            retry_at: 0.0,
            waiting_for_access: false,
            returning_to_site: false,
            water_to_deliver: 0.0,
            food_input,
            food_output: None,
            delivered_output: None,
            growth: None,
            watered: false,
            using_biogas: false,
        });
        self.production.notice.clear();
    }

    pub(super) fn batch_inputs(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        index: usize,
        id: &str,
    ) -> Result<Option<BTreeMap<String, u32>>, String> {
        let recipe = &catalog.production[id];
        let empty_pen = self.empty_goat_pen(index);
        if id == "stock-goats" && !empty_pen {
            return Err("This pen already has goats.".into());
        }
        if empty_pen && id != "stock-goats" {
            return Err("Stock the pen with two goats first.".into());
        }
        if let Some(tool) = &recipe.repair {
            if self.repairing(catalog, tool) {
                return Err("A repair is already queued for this equipment.".into());
            }
            if stock.equipment.borrowed(tool) > 0 {
                return Err("Wait for the borrowed equipment to be returned.".into());
            }
            if stock.equipment.wear(tool) == 0.0 {
                return Err("This equipment does not need repair.".into());
            }
        }
        if id == "solar_upgrade" && self.utilities.has_rooftop_solar(index) {
            return Err("Rooftop solar is already installed.".into());
        }
        if id == "cold_storage" && self.utilities.has_cold_storage(index) {
            return Err("Cold storage is already installed.".into());
        }
        if let Some(ration) = catalog.animal_rations.get(&recipe.kind)
            && !stock.sandbox
            && id != "stock-goats"
        {
            let pen = self
                .livestock
                .animals
                .get(&index)
                .ok_or("The animal pen is being prepared.")?;
            if id == ration.product && pen.available() == 0 {
                return Err("There is nothing ready to collect.".into());
            }
            if id.starts_with("care-") {
                if pen.fed_days(ration) > ration.days - 0.25 {
                    return Err("The animals already have enough feed and water.".into());
                }
                if self.utilities.potable_at(index + 1) < ration.water {
                    return Err("Waiting for animal drinking water.".into());
                }
            }
        }
        if let Some(reason) = self.craft_blocker(catalog, stock, recipe, None) {
            return Err(reason);
        }
        if self.production.jobs.iter().any(|job| job.site == index) {
            return Err("Finish the current batch first.".into());
        }
        if stock.sandbox {
            return Ok(None);
        }
        let inputs = self.recipe_materials(catalog, index, id);
        if let Some(material) = stock.missing(&inputs) {
            return Err(format!(
                "Not enough {} in supplies.",
                catalog.materials[material].name
            ));
        }
        Ok(Some(inputs.into_owned()))
    }

    pub(super) fn recipe_materials<'a>(
        &self,
        catalog: &'a Catalog,
        site: usize,
        id: &str,
    ) -> Cow<'a, BTreeMap<String, u32>> {
        let mut inputs = Cow::Borrowed(&catalog.production[id].input);
        if id == "wood"
            && self
                .production
                .growing_sites
                .get(&site)
                .is_some_and(|ground| ground.harvests > 0)
        {
            inputs.to_mut().insert("tree_starts".into(), 4);
        }
        inputs
    }

    fn batch_storage_full(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        job: &Batch,
        clock: f64,
    ) -> bool {
        let recipe = &catalog.production[&job.recipe];
        let units = |goods: &BTreeMap<String, u32>| {
            goods.values().map(|&count| u64::from(count)).sum::<u64>()
        };
        let expected = if job.phase == Phase::Return {
            u64::from(
                !production_load(
                    catalog,
                    job.delivered_output.as_ref().unwrap_or(&recipe.output),
                )
                .is_empty(),
            )
        } else if let Some(output) = &job.delivered_output {
            units(output)
        } else if let Some((growth, biology)) = job.growth.as_ref().zip(recipe.biology.as_ref()) {
            units(&growth.output(biology, clock, &recipe.output))
        } else if !stock.sandbox
            && let Some(ration) = catalog.animal_rations.get(&recipe.kind)
            && job.recipe == ration.product
        {
            self.livestock
                .animals
                .get(&job.site)
                .map_or(0, |pen| u64::from(pen.available().min(ration.batch)))
        } else {
            units(&recipe.output)
        };
        expected > 0 && self.storage_space(catalog, stock) < expected
    }

    pub(super) fn production_route_blocked(&self, job: &Batch, clock: f64) -> bool {
        (job.waiting_for_access && job.retry_at > clock)
            || job
                .worker
                .is_some_and(|worker| self.residents[worker].waiting_for_route())
    }

    pub(super) fn batch_blocker(
        &self,
        job: &Batch,
        catalog: &Catalog,
        stock: &Stock,
        clock: f64,
    ) -> Option<String> {
        let recipe = &catalog.production[&job.recipe];
        if !matches!(job.phase, Phase::Return | Phase::Growing) && !self.utilities.enabled(job.site)
        {
            return Some("Building switched off".into());
        }
        if self.production_route_blocked(job, clock) {
            return Some("Waiting for access".into());
        }
        if matches!(job.phase, Phase::Pickup | Phase::Work)
            && let Some(reason) = self.craft_blocker(catalog, stock, recipe, job.worker)
        {
            return Some(reason);
        }
        if (job.phase == Phase::Work || (job.phase == Phase::Return && !job.returning_to_site))
            && self.batch_storage_full(catalog, stock, job, clock)
        {
            return Some("Waiting for storage space".into());
        }
        match job.phase {
            Phase::Pickup | Phase::Approach | Phase::Work
                if recipe.water > 0.0
                    && !job.watered
                    && self.utilities.potable_at(job.site + 1) < recipe.water =>
            {
                Some("Waiting for drinking water".into())
            }
            Phase::Pickup | Phase::Approach | Phase::Work
                if recipe.kind == "kitchen"
                    && recipe.water > 0.0
                    && !job.watered
                    && !self.utilities.greywater_space(job.site + 1, recipe.water) =>
            {
                Some("Waiting for greywater storage".into())
            }
            Phase::Work
                if !job.using_biogas
                    && needs_power(&job.recipe, recipe)
                    && !self.utilities.powered(job.site) =>
            {
                Some("Waiting for power".into())
            }
            _ => None,
        }
    }

    pub(super) fn batch_status(
        &self,
        job: &Batch,
        catalog: &Catalog,
        stock: &Stock,
        clock: f64,
    ) -> String {
        if let Some(blocker) = self.batch_blocker(job, catalog, stock, clock) {
            return blocker;
        }
        let recipe = &catalog.production[&job.recipe];
        match job.phase {
            Phase::Pickup if job.recipe == "stock-goats" => "Collecting goats from supplies".into(),
            Phase::Approach if job.recipe == "stock-goats" => "Leading goats to the pen".into(),
            Phase::Work if job.recipe == "stock-goats" => "Settling goats in the pen".into(),
            Phase::Pickup => "Collecting ingredients".into(),
            Phase::Approach => "Bringing ingredients".into(),
            Phase::Work if job.using_biogas => {
                format!("{:.0}% worked · Biogas", job.work / recipe.work * 100.0)
            }
            Phase::Work if recipe.craft.is_some() => {
                let fraction = job.work / recipe.work;
                let stage = recipe.craft.as_ref().expect("craft recipe").stage(fraction);
                format!("{:.0}% · {stage}", fraction * 100.0)
            }
            Phase::Work => format!("{:.0}% worked", job.work / recipe.work * 100.0),
            Phase::Return if job.returning_to_site => "Returning for the next load".into(),
            Phase::Return if recipe.output.contains_key("wheelbarrow") => {
                "Wheeling the assembled wheelbarrow to stores".into()
            }
            Phase::Return => "Carrying output to stores".into(),
            Phase::Growing => format!(
                "{:.1} game days remaining",
                job.growth
                    .as_ref()
                    .map_or(0.0, |growth| growth.remaining / DAY)
            ),
            Phase::Harvest => {
                let expired = job
                    .growth
                    .as_ref()
                    .zip(recipe.biology.as_ref())
                    .is_some_and(|(growth, biology)| {
                        growth.output(biology, clock, &recipe.output).is_empty()
                    });
                if expired {
                    "Crop lost · awaiting clearing"
                } else {
                    "Ready for resident collection"
                }
                .into()
            }
        }
    }

    pub(crate) fn production_site_status(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        index: usize,
        clock: f64,
    ) -> String {
        use std::fmt::Write as _;
        let mut text = String::new();
        if let Some(pen) = self.livestock.animals.get(&index) {
            let _ = write!(text, "\n{}", pen.care_summary());
        }
        if let Some(job) = self.production.jobs.iter().find(|job| job.site == index) {
            let name = &catalog.production[&job.recipe].name;
            let status = self.batch_status(job, catalog, stock, clock);
            let _ = write!(text, "\n{name} · {status}");
        }
        text
    }

    pub fn selected_production(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        clock: f64,
    ) -> Option<String> {
        let index = self.production.selected?;
        let site = self.plans.get(index)?;
        let definition = &catalog.projects[&site.key];
        let name = if self.installed_goats(catalog, index).is_some() {
            &catalog.projects["goat_pasture"].name
        } else {
            &definition.name
        };
        let recipes = self.recipes(catalog, index);
        if site.removed {
            return None;
        }
        let mut text = format!("{name} #{}", index + 1);
        if site.work < definition.work {
            use std::fmt::Write;
            let _ = write!(text, " · {}", self.project_status(catalog, index));
            if let Some((phase, progress)) = self.selected_construction_progress(catalog) {
                let _ = write!(text, "\n{phase} · {:.0}%", (progress * 100.0).floor());
            }
            if let Some(minutes) = self.construction_delivery_minutes(index, clock) {
                let _ = write!(text, " · {minutes} game minutes remaining");
            }
            let _ = write!(
                text,
                "\n{} × {} m · Labor {:.0}/{:.0} person-minutes · Delivered {}/{} loads",
                site.size.x * 2,
                site.size.y * 2,
                site.work * 0.45,
                definition.work * 0.45,
                site.delivered,
                site.loads,
            );
            if !site.materials(catalog).is_empty() {
                text.push_str("\nMaterials for this plan");
                for (row, (id, amount)) in site.materials(catalog).iter().enumerate() {
                    text.push_str(if row % 3 == 0 { "\n" } else { " · " });
                    let material = &catalog.materials[id];
                    let quantity = material.quantity_text(u64::from(*amount));
                    let _ = write!(text, "{quantity} {}", material.name);
                }
            }
            let crew: Vec<_> = self
                .residents
                .iter()
                .enumerate()
                .filter(|(_, worker)| {
                    worker
                        .assignment
                        .as_ref()
                        .is_some_and(|job| job.project == index)
                })
                .map(|(index, _)| super::resident_work::NAMES[index])
                .collect();
            if crew.is_empty() {
                text.push_str("\nNo crew assigned yet");
            } else {
                let _ = write!(text, "\nAssigned · {}", crew.join(", "));
            }
        }
        let active_job = self.production.jobs.iter().find(|job| job.site == index);
        if site.work >= definition.work {
            use std::fmt::Write;
            if active_job.is_none() && !self.changes.contains_key(&index) {
                let state = self
                    .utilities
                    .operational_blocker(index)
                    .unwrap_or("Ready to use");
                let _ = write!(text, " · {state}");
            }
            match definition.kind.as_str() {
                "goat_pasture" if self.empty_goat_pen(index) && active_job.is_none() => {
                    text.push_str("\nEmpty · C Recipes to stock with two goats");
                }
                "home" => {
                    let capacity = definition.beds.unwrap_or(2);
                    let assigned = self
                        .residents
                        .iter()
                        .filter(|resident| resident.home == Some(index))
                        .count();
                    let _ = write!(text, "\nHousing · {assigned}/{capacity} beds assigned");
                }
                _ => {}
            }
        }
        if let Some(job) = active_job {
            use std::fmt::Write;
            let recipe = &catalog.production[&job.recipe];
            let state = self.batch_status(job, catalog, stock, clock);
            text.push_str(&format!(" · {} · {state}", recipe.name));
            if job.phase == Phase::Growing {
                text.push_str("\nNo resident needs to wait here");
            } else {
                let crafting = recipe.craft.is_some();
                let waiting = if crafting {
                    "Waiting for a qualified resident"
                } else {
                    "Waiting for a resident"
                };
                let resident = job
                    .worker
                    .map_or(waiting, |worker| super::resident_work::NAMES[worker]);
                let label = if crafting {
                    "Craft progress"
                } else {
                    "Batch progress"
                };
                let progress = (100.0 * job.work / recipe.work).floor().clamp(0.0, 100.0);
                let _ = write!(text, "\n{label} {progress:.0}% · {resident}");
            }
        } else if definition.kind == "kitchen"
            && site.work >= definition.work
            && !self.changes.contains_key(&index)
        {
            text.push('\n');
            text.push_str(&self.idle_kitchen_status(catalog, stock, clock, index));
        }
        if let Some(animals) = self.livestock.animals.get(&index) {
            text.push('\n');
            text.push_str(&animals.care_summary());
        }
        if let Some(ground) = self.production.growing_sites.get(&index)
            && recipes.iter().any(|(_, recipe)| {
                recipe
                    .biology
                    .as_ref()
                    .is_some_and(|bio| bio.care.is_some())
            })
        {
            text.push_str(&format!(
                "\nSoil {:.0}% moisture · {:.0}% fertility · T Irrigation: {}",
                ground.moisture * 100.0,
                ground.fertility * 100.0,
                ground.irrigation.label()
            ));
        }
        if self.production.open {
            for (index, (_, recipe)) in recipes
                .iter()
                .skip(self.production.page * PAGE_KEYS.len())
                .take(PAGE_KEYS.len())
                .enumerate()
            {
                text.push_str(&format!("\n{} {}", index + 1, recipe.name));
            }
            let pages = recipes.len().div_ceil(PAGE_KEYS.len());
            if pages > 1 {
                text.push_str(&format!(
                    "\nPage Up/Down · {}/{}",
                    self.production.page + 1,
                    pages
                ));
            }
            let (craft, destinations) = self.craft_destinations(catalog, index);
            if craft.is_some() {
                if let Some(&destination) = destinations.get(
                    self.production
                        .craft_destination
                        .min(destinations.len().saturating_sub(1)),
                ) {
                    use std::fmt::Write;
                    let workspace = &catalog.projects[&self.plans[destination].key].name;
                    let _ = write!(
                        text,
                        "\nM Move unfinished job to {workspace} #{}",
                        destination + 1
                    );
                    if destinations.len() > 1 {
                        text.push_str(" · [ / ] Choose workspace");
                    }
                } else {
                    text.push_str("\nNo other free, enabled workspace");
                }
            }
            text.push_str("\nC Close recipes");
        } else if !recipes.is_empty() && !self.menu {
            text.push_str(" · C Recipes");
        }
        if catalog.projects[&site.key].kind == "supply-5" {
            let tools = stock.equipment.summary(|item| stock.available(item));
            if !tools.is_empty() {
                text.push('\n');
                text.push_str(&tools);
            }
        }
        if !definition.benefit.is_empty() {
            text.push('\n');
            text.push_str(&definition.benefit);
        } else if site.work >= definition.work
            && let Some(activity) = super::leisure::recreation_benefit(&definition.kind)
        {
            use std::fmt::Write;
            let _ = write!(
                text,
                "\nRecreation · {activity} · Helps residents recover fun"
            );
        }
        definition.append_assembly_estimate(&mut text);
        if !self.production.notice.is_empty() {
            text.push('\n');
            text.push_str(&self.production.notice);
        }
        Some(text)
    }

    pub fn tick_animals(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        land: &crate::land::Land,
        clock: f64,
        dt: f64,
    ) {
        let mut batches = Vec::new();
        let mut forage_origin = None;
        for (index, project) in self.plans.iter().enumerate() {
            let definition = &catalog.projects[&project.key];
            if project.removed || project.work < definition.work {
                continue;
            }
            let Some(ration) = catalog.animal_rations.get(&definition.kind) else {
                continue;
            };
            if self.empty_goat_pen(index) {
                continue;
            }
            let pen = self.livestock.animals.entry(index).or_default();
            if !stock.sandbox {
                pen.tick(ration, clock, dt);
            }
            if self.changes.contains_key(&index)
                || !self.utilities.enabled(index)
                || self.production.jobs.iter().any(|job| job.site == index)
            {
                continue;
            }
            if stock.sandbox {
                batches.push((index, ration.product.clone()));
                continue;
            }
            if pen.fed_days(ration) <= 0.25 {
                if stock.available("fodder") < ration.fodder {
                    forage_origin.get_or_insert(project.position);
                } else if self.utilities.potable_at(index + 1) >= ration.water {
                    batches.push((index, format!("care-{}", definition.kind)));
                    continue;
                }
            }
            if pen.available() > 0 {
                batches.push((index, ration.product.clone()));
            }
        }
        if let Some(origin) = forage_origin {
            self.gathering.queue_forage(land, origin, clock);
        }
        for (index, id) in batches {
            if stock.missing(&catalog.production[&id].input).is_none() {
                self.queue_batch(catalog, stock, index, &id);
            }
        }
    }

    pub fn tick_growth(
        &mut self,
        catalog: &Catalog,
        setup: &WorldSetup,
        stock: &Stock,
        clock: f64,
        elapsed: f64,
    ) {
        if stock.sandbox {
            return;
        }
        let rain = step_weather(clock, elapsed, setup.biome(), setup.seed()).rain;
        let season = growing_season(clock, setup.biome());
        for (&site, ground) in &mut self.production.growing_sites {
            if !self
                .production
                .jobs
                .iter()
                .any(|job| job.site == site && job.phase == Phase::Growing)
            {
                ground.fertility = (ground.fertility + elapsed / (180.0 * DAY)).min(1.0);
            }
        }
        for job in &mut self.production.jobs {
            if job.phase == Phase::Return {
                continue;
            }
            let Some(growth) = &mut job.growth else {
                continue;
            };
            let Some(biology) = &catalog.production[&job.recipe].biology else {
                continue;
            };
            let ground = self.production.growing_sites.entry(job.site).or_default();
            growth.tick(
                biology,
                ground,
                Conditions {
                    clock,
                    elapsed,
                    rain,
                    season,
                    timber: job.recipe == "wood",
                },
                |liters| self.utilities.irrigate(job.site, liters),
            );
            if job.phase == Phase::Growing && growth.ripe_at.is_some() {
                job.phase = Phase::Harvest;
            }
        }
    }

    pub fn schedule_perennial_work(&mut self, catalog: &Catalog, stock: &mut Stock) {
        let queued = self
            .plans
            .iter()
            .enumerate()
            .filter_map(|(index, plan)| {
                let definition = &catalog.projects[&plan.key];
                if plan.removed
                    || plan.work < definition.work
                    || self.changes.contains_key(&index)
                    || !self.utilities.enabled(index)
                    || self.production.jobs.iter().any(|job| job.site == index)
                {
                    return None;
                }
                let recipe = match definition.kind.as_str() {
                    "orchard" => "fruit",
                    "grove" => "bananas",
                    "apiary" => "honey",
                    _ => return None,
                };
                Some((index, recipe))
            })
            .collect::<Vec<_>>();
        for (site, recipe) in queued {
            self.queue_batch(catalog, stock, site, recipe);
        }
    }

    pub(super) fn valid_production(&self, catalog: &Catalog) -> bool {
        self.production
            .growing_sites
            .iter()
            .all(|(&index, ground)| {
                ground.valid() && self.plans.get(index).is_some_and(|plan| !plan.removed)
            })
            && self.production.jobs.len() <= self.plans.len()
            && self.production.jobs.iter().all(|job| {
                self.plans.get(job.site).is_some_and(|site| {
                    let Some(definition) = catalog.projects.get(&site.key) else {
                        return false;
                    };
                    site.work >= definition.work
                        && catalog.production.get(&job.recipe).is_some_and(|recipe| {
                            definition.kind == recipe.kind
                                && (0.0..=recipe.work).contains(&job.work)
                                && (!job.using_biogas
                                    || recipe.kind == "kitchen" && needs_power(&job.recipe, recipe))
                                && match (&job.growth, &recipe.biology) {
                                    (Some(growth), Some(bio)) => {
                                        let limit = bio.days
                                            + if job.recipe == "fruit" { 610.0 } else { 0.0 };
                                        growth.valid(limit)
                                            && match job.phase {
                                                Phase::Growing => {
                                                    job.worker.is_none() && growth.ripe_at.is_none()
                                                }
                                                Phase::Harvest | Phase::Work | Phase::Return => {
                                                    growth.ripe_at.is_some()
                                                }
                                                _ => false,
                                            }
                                    }
                                    (None, _) => {
                                        !matches!(job.phase, Phase::Growing | Phase::Harvest)
                                    }
                                    (Some(_), None) => false,
                                }
                        })
                }) && job.worker.is_none_or(|index| index < self.residents.len())
                    && job.retry_at >= 0.0
                    && job.delivered_output.as_ref().is_none_or(|output| {
                        output.keys().all(|id| catalog.materials.contains_key(id))
                    })
                    && (!job.returning_to_site
                        || job.phase == Phase::Return && job.delivered_output.is_some())
            })
    }

    #[cfg(test)]
    pub(super) fn tick_production(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        site: ConstructionSite,
        clock: f64,
        dt: f32,
    ) {
        self.expire_batch_food(catalog, stock, site, clock);
        self.tick_production_group(catalog, stock, site, clock, dt, None);
    }

    pub(super) fn tick_production_group(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        site: ConstructionSite,
        clock: f64,
        dt: f32,
        group: Option<WorkGroup>,
    ) {
        let in_group = |job: &Batch| {
            group.is_none_or(|group| {
                group == WorkGroup::for_output(&catalog.production[&job.recipe].output)
            })
        };
        if self.reservation_pass.is_some() {
            self.assign_producers(catalog, stock, site, clock, in_group);
            return;
        }
        for job in &mut self.production.jobs {
            if in_group(job)
                && matches!(job.phase, Phase::Pickup | Phase::Harvest | Phase::Work)
                && let Some(worker) = job.worker
                && (self.residents[worker].health.energy < 25.0
                    || !self.utilities.enabled(job.site))
            {
                self.residents[worker].path.clear();
                job.worker = None;
                job.retry_at = clock;
            }
        }
        self.assign_producers(catalog, stock, site, clock, in_group);
        for index in (0..self.production.jobs.len()).rev() {
            if !in_group(&self.production.jobs[index])
                || self.production.jobs[index].phase == Phase::Growing
                || clock < self.production.jobs[index].retry_at
            {
                continue;
            }
            self.production.jobs[index].waiting_for_access = false;
            let job = &self.production.jobs[index];
            let Some(worker_index) = job.worker else {
                continue;
            };
            let worker = &mut self.residents[worker_index];
            let phase = job.phase;
            worker.move_along_path(
                dt,
                phase == Phase::Approach || (phase == Phase::Return && !job.returning_to_site),
            );
            if !worker.path.is_empty() {
                continue;
            }
            let position = worker.position;
            let recipe = &catalog.production[&job.recipe];
            let path = |from, to| self.resident_route(catalog, site, from, to);
            match phase {
                Phase::Growing => unreachable!("growth is handled before resident work"),
                Phase::Harvest => self.production.jobs[index].phase = Phase::Work,
                Phase::Pickup => {
                    let facility = &self.plans[job.site];
                    let Some(path) = project_access_points(facility, catalog, position)
                        .into_iter()
                        .find_map(|cell| path(position, cell))
                    else {
                        self.production.jobs[index].retry_at = clock + 5.0;
                        self.production.jobs[index].waiting_for_access = true;
                        continue;
                    };
                    self.residents[worker_index].path = path;
                    self.production.jobs[index].phase = Phase::Approach;
                }
                Phase::Approach => self.production.jobs[index].phase = Phase::Work,
                Phase::Work => {
                    if self.batch_storage_full(catalog, stock, job, clock) {
                        continue;
                    }
                    if self
                        .craft_blocker(catalog, stock, recipe, Some(worker_index))
                        .is_some()
                    {
                        let job = &mut self.production.jobs[index];
                        job.worker = None;
                        job.phase = Phase::Pickup;
                        job.retry_at = clock + 3.0;
                        continue;
                    }
                    let tool = production_tool(recipe);
                    let repairing = tool.is_some_and(|tool| self.repairing(catalog, tool));
                    let job = &mut self.production.jobs[index];
                    if !self.utilities.enabled(job.site) {
                        continue;
                    }
                    if !stock.sandbox && !job.watered && recipe.water > 0.0 {
                        let supplied = if recipe.kind == "kitchen" {
                            self.utilities
                                .use_water_with_greywater(job.site + 1, recipe.water)
                        } else {
                            self.utilities.drink(job.site + 1, recipe.water)
                        };
                        if !supplied {
                            job.worker = None;
                            job.phase = Phase::Pickup;
                            job.retry_at = clock + 1.0;
                            continue;
                        }
                        job.watered = true;
                    }
                    if needs_power(&job.recipe, recipe)
                        && !self.utilities.powered(job.site)
                        && !job.using_biogas
                    {
                        if recipe.kind != "kitchen"
                            || !self.utilities.burn_biogas(recipe.biogas.unwrap_or(0.2))
                        {
                            continue;
                        }
                        job.using_biogas = true;
                    }
                    if !stock.sandbox
                        && !job.watered
                        && let Some(biology) = &recipe.biology
                        && biology.on_site_water > 0.0
                    {
                        if !self.utilities.irrigate(job.site, biology.on_site_water) {
                            job.worker = None;
                            job.phase = Phase::Pickup;
                            job.retry_at = clock + 12.0;
                            continue;
                        }
                        job.watered = true;
                    }
                    let animal = catalog.animal_rations.get(&recipe.kind);
                    if job.recipe.starts_with("care-")
                        && let Some(ration) = animal
                        && job.water_to_deliver == 0.0
                    {
                        if !stock.sandbox && !self.utilities.drink(job.site + 1, ration.water) {
                            continue;
                        }
                        job.water_to_deliver = ration.water;
                    }
                    let boost = tool.map_or(1.0, |tool| {
                        stock.use_tool(
                            worker_index,
                            tool,
                            ToolTask::Production(job.site),
                            f64::from(dt),
                            repairing,
                        )
                    });
                    let seconds = f64::from(dt);
                    let worker = &mut self.residents[worker_index];
                    let rate = if let Some(craft) = &recipe.craft {
                        worker.craft.practice(worker_index, craft.skill, seconds)
                            * worker.health.hydration_factor()
                    } else {
                        let power = if recipe.kind == "workshop" && self.utilities.powered(job.site)
                        {
                            2.0
                        } else {
                            1.0
                        };
                        boost
                            * power
                            * worker.work_multiplier(
                                &catalog.residents[worker_index],
                                &self.plans[job.site].key,
                            )
                    };
                    job.work = (job.work + seconds * rate).min(recipe.work);
                    worker.experience += seconds;
                    worker.health.energy = (worker.health.energy - seconds * 0.12).max(0.0);
                    if !stock.sandbox
                        && job.growth.is_none()
                        && let Some(biology) = &recipe.biology
                        && job.work >= recipe.work * biology.planting_fraction
                    {
                        let ground = self.production.growing_sites.entry(job.site).or_default();
                        job.growth = Some(Growth::start(&job.recipe, biology, ground));
                        job.phase = Phase::Growing;
                        job.worker = None;
                        job.food_input = None;
                        continue;
                    }
                    if job.work < recipe.work {
                        continue;
                    }
                    if job.recipe == "stock-goats" {
                        self.livestock.animals.entry(job.site).or_default();
                        self.production.jobs.remove(index);
                        self.production.notice = "Two goats moved into the pen.".into();
                        self.record_event(clock, self.production.notice.clone());
                        continue;
                    }
                    if job.recipe == "cold_storage" {
                        self.utilities.install_cold_storage(job.site);
                        self.production.jobs.remove(index);
                        continue;
                    }
                    if job.recipe == "solar_upgrade" {
                        if self.utilities.install_rooftop_solar(job.site) {
                            self.production.notice = "Rooftop solar and battery installed.".into();
                            self.production.jobs.remove(index);
                        }
                        continue;
                    }
                    let Some(path) =
                        self.resident_route(catalog, site, position, SUPPLY_SPOTS[worker_index])
                    else {
                        self.production.jobs[index].retry_at = clock + 5.0;
                        self.production.jobs[index].waiting_for_access = true;
                        continue;
                    };
                    if let Some(ration) = animal
                        && let Some(pen) = self
                            .livestock
                            .animals
                            .get_mut(&self.production.jobs[index].site)
                    {
                        let job = &mut self.production.jobs[index];
                        if job.recipe.starts_with("care-") {
                            if !stock.sandbox {
                                pen.feed(ration, job.water_to_deliver);
                            }
                            self.production.jobs.remove(index);
                            continue;
                        }
                        if job.recipe == ration.product {
                            let (quantity, lots) = pen.collect(ration, stock.sandbox);
                            job.delivered_output = Some(quantity);
                            job.food_output = Some(lots);
                        }
                    }
                    let job = &mut self.production.jobs[index];
                    if let Some(growth) = &job.growth
                        && let Some(biology) = &recipe.biology
                    {
                        job.delivered_output = Some(growth.output(biology, clock, &recipe.output));
                        self.production
                            .growing_sites
                            .entry(job.site)
                            .or_default()
                            .harvests += 1;
                    }
                    if job.food_output.is_none() {
                        job.food_output = Some(crate::food::fresh(
                            job.delivered_output.as_ref().unwrap_or(&recipe.output),
                            clock,
                            &recipe.preserved,
                        ));
                    }
                    stock.record_processing(&job.recipe);
                    job.food_input = None;
                    self.residents[worker_index].path = path;
                    self.production.jobs[index].phase = Phase::Return;
                }
                Phase::Return => {
                    if job.returning_to_site {
                        let workspace = &self.plans[job.site];
                        let approaches = project_access_points(workspace, catalog, position);
                        let at_workspace = approaches.iter().any(|cell| cell.as_vec2() == position);
                        let next_path = if at_workspace {
                            path(position, SUPPLY_SPOTS[worker_index])
                        } else {
                            approaches.into_iter().find_map(|cell| path(position, cell))
                        };
                        if let Some(path) = next_path {
                            self.residents[worker_index].path = path;
                            self.production.jobs[index].returning_to_site = !at_workspace;
                        } else {
                            let job = &mut self.production.jobs[index];
                            job.waiting_for_access = true;
                            job.retry_at = clock + 5.0;
                        }
                        continue;
                    }
                    if self.batch_storage_full(catalog, stock, job, clock) {
                        continue;
                    }
                    let output = job.delivered_output.as_ref().unwrap_or(&recipe.output);
                    let load = production_load_with_limit(
                        catalog,
                        output,
                        self.storage_space(catalog, stock),
                    );
                    if load.is_empty() && output.values().any(|&units| units > 0) {
                        self.production.notice = "Output exceeds hand-carry capacity.".into();
                        continue;
                    }
                    let mut remaining = output.clone();
                    for (id, units) in &load {
                        *remaining.get_mut(id).expect("load is part of output") -= units;
                    }
                    remaining.retain(|_, units| *units > 0);
                    let next_path = if remaining.is_empty() {
                        None
                    } else {
                        let workspace = &self.plans[job.site];
                        project_access_points(workspace, catalog, position)
                            .into_iter()
                            .find_map(|cell| path(position, cell))
                    };
                    let job = &mut self.production.jobs[index];
                    let lots = job
                        .food_output
                        .as_mut()
                        .map(|lots| take_load_lots(lots, &load));
                    stock.receive_materials(
                        &load,
                        lots,
                        crate::stock::MaterialReason::ProductionDelivery,
                    );
                    if !remaining.is_empty() {
                        job.delivered_output = Some(remaining);
                        job.returning_to_site = true;
                        if let Some(path) = next_path {
                            self.residents[worker_index].path = path;
                        } else {
                            job.waiting_for_access = true;
                            job.retry_at = clock + 5.0;
                        }
                        continue;
                    }
                    if let Some(tool) = &recipe.repair {
                        stock.equipment.repair(tool);
                    }
                    self.production.jobs.remove(index);
                    self.production.notice = format!("{}: batch in stores.", recipe.name);
                    self.record_event(clock, self.production.notice.clone());
                }
            }
        }
    }

    pub(super) fn expire_batch_food(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        site: ConstructionSite,
        clock: f64,
    ) {
        if stock.sandbox {
            return;
        }
        for index in (0..self.production.jobs.len()).rev() {
            let job = &mut self.production.jobs[index];
            let outbound = job.phase != Phase::Return;
            let lots = if outbound {
                &mut job.food_input
            } else {
                &mut job.food_output
            };
            let Some(lots) = lots else { continue };
            let lost = crate::food::discard_expired(lots, clock);
            if lost.is_empty() {
                continue;
            }
            stock.record_spoilage(catalog, &lost);
            let recipe = &catalog.production[&job.recipe];
            let mut good = if outbound {
                recipe.input.clone()
            } else {
                job.delivered_output
                    .as_ref()
                    .unwrap_or(&recipe.output)
                    .clone()
            };
            for (id, units) in lost {
                if let Some(quantity) = good.get_mut(&id) {
                    *quantity = quantity.saturating_sub(units);
                }
            }
            if good.values().all(|&units| units == 0) {
                if let Some(worker) = job.worker {
                    self.residents[worker].clear_work_route();
                }
                self.production.jobs.remove(index);
                self.production.notice = if outbound {
                    "All reserved ingredients spoiled."
                } else {
                    "The finished batch spoiled before reaching stores."
                }
                .into();
                continue;
            }
            if !outbound {
                job.delivered_output = Some(good);
                continue;
            }
            let surviving = std::mem::take(lots);
            let Some(worker) = job.worker else {
                stock.receive_with_lots(&good, surviving);
                self.production.jobs.remove(index);
                continue;
            };
            let resident = &self.residents[worker];
            let path = if resident.health.task.is_none() && !resident.town_work.active() {
                self.resident_route(catalog, site, resident.position, SUPPLY_SPOTS[worker])
            } else {
                None
            };
            let job = &mut self.production.jobs[index];
            job.delivered_output = Some(good);
            job.food_output = Some(surviving);
            job.food_input = None;
            job.phase = Phase::Return;
            self.residents[worker].clear_work_route();
            if let Some(path) = path {
                self.residents[worker].path = path;
            } else {
                job.worker = None;
            }
            self.production.notice =
                "Reserved food spoiled. Usable ingredients are being returned.".into();
        }
    }

    pub(super) fn reserve_animal_care_workers(
        &mut self,
        catalog: &Catalog,
        stock: &Stock,
        site: ConstructionSite,
        clock: f64,
    ) {
        self.assign_producers(catalog, stock, site, clock, |job| {
            matches!(job.recipe.as_str(), "care-coop" | "care-goat_pasture")
        });
    }

    pub(super) fn reserve_farm_batch_workers(
        &mut self,
        catalog: &Catalog,
        stock: &Stock,
        site: ConstructionSite,
        clock: f64,
    ) {
        self.assign_producers(catalog, stock, site, clock, |job| {
            matches!(job.recipe.as_str(), "eggs" | "milk" | "honey")
                || catalog.production[&job.recipe]
                    .biology
                    .as_ref()
                    .is_some_and(|biology| biology.care.is_some())
        });
    }

    fn assign_producers(
        &mut self,
        catalog: &Catalog,
        stock: &Stock,
        site: ConstructionSite,
        clock: f64,
        in_group: impl Fn(&Batch) -> bool,
    ) {
        let mut jobs: Vec<_> = self
            .production
            .jobs
            .iter()
            .enumerate()
            .filter_map(|(index, job)| {
                (in_group(job)
                    && job.worker.is_none()
                    && job.phase != Phase::Growing
                    && job.retry_at <= clock)
                    .then_some(index)
            })
            .collect();
        if jobs.is_empty() {
            return;
        }
        for &job in &jobs {
            self.production.jobs[job].waiting_for_access = false;
        }
        let hungry = self
            .residents
            .iter()
            .any(|resident| resident.health.levels[Need::Hunger as usize] < 15.0);
        for index in 0..self.residents.len() {
            if !self.work_candidate(index) {
                continue;
            }
            jobs.sort_by_key(|&job| {
                let batch = &self.production.jobs[job];
                let food = hungry
                    && crate::food::SERVINGS
                        .iter()
                        .any(|(id, _)| catalog.production[&batch.recipe].output.contains_key(*id));
                let preference =
                    catalog.residents[index].work_preference(&self.plans[batch.site].key);
                (!food, std::cmp::Reverse(preference), job)
            });
            for &job in &jobs {
                if self.production.jobs[job].worker.is_none()
                    && (self.residents[index].health.energy >= 25.0
                        || self.production.jobs[job].phase == Phase::Return)
                    && self.try_assign_producer(job, index, catalog, site, stock)
                {
                    self.production.jobs[job].waiting_for_access = false;
                    break;
                }
            }
        }
        if self.reservation_pass.is_none() {
            for job in jobs {
                self.production.jobs[job].retry_at = clock + 1.0;
            }
        }
    }

    fn try_assign_producer(
        &mut self,
        job: usize,
        index: usize,
        catalog: &Catalog,
        site: ConstructionSite,
        stock: &Stock,
    ) -> bool {
        let batch = &self.production.jobs[job];
        let recipe = &catalog.production[&batch.recipe];
        if batch.phase != Phase::Return && !self.utilities.enabled(batch.site) {
            return false;
        }
        if !stock.sandbox
            && batch.phase != Phase::Return
            && !batch.watered
            && recipe.water > 0.0
            && (self.utilities.potable_at(batch.site + 1) + 1e-8 < recipe.water
                || recipe.kind == "kitchen"
                    && !self.utilities.greywater_space(batch.site + 1, recipe.water))
        {
            return false;
        }
        if !stock.sandbox
            && batch.phase != Phase::Return
            && !batch.watered
            && let Some(biology) = &catalog.production[&batch.recipe].biology
            && biology.on_site_water > 0.0
            && !self
                .utilities
                .can_irrigate(batch.site, biology.on_site_water)
        {
            return false;
        }
        let phase = self.production.jobs[job].phase;
        let returning = phase == Phase::Return;
        let project = &self.plans[self.production.jobs[job].site];
        let path = |from, to| self.resident_route(catalog, site, from, to);
        let resident = &self.residents[index];
        if !returning
            && self
                .craft_blocker(catalog, stock, recipe, Some(index))
                .is_some()
        {
            return false;
        }
        let supply = SUPPLY_SPOTS[index];
        let assigned_path =
            if matches!(phase, Phase::Harvest | Phase::Work) || batch.returning_to_site {
                project_access_points(project, catalog, resident.position)
                    .into_iter()
                    .find_map(|cell| path(resident.position, cell))
            } else if returning
                || project_access_points(project, catalog, supply.as_vec2())
                    .into_iter()
                    .any(|cell| path(supply.as_vec2(), cell).is_some())
            {
                path(resident.position, supply)
            } else {
                None
            };
        let Some(path) = assigned_path else {
            self.production.jobs[job].waiting_for_access = true;
            return false;
        };
        self.residents[index].path = path;
        self.production.jobs[job].worker = Some(index);
        true
    }
}

pub(super) fn production_load(
    catalog: &Catalog,
    output: &BTreeMap<String, u32>,
) -> BTreeMap<String, u32> {
    production_load_with_limit(catalog, output, u64::MAX)
}

pub(super) fn production_load_with_limit(
    catalog: &Catalog,
    output: &BTreeMap<String, u32>,
    mut spaces: u64,
) -> BTreeMap<String, u32> {
    if spaces == 0 {
        return BTreeMap::new();
    }
    if output.get("wheelbarrow").is_some_and(|&units| units > 0) {
        return BTreeMap::from([("wheelbarrow".into(), 1)]);
    }
    let (mut mass, mut volume) = (30.0, 0.12);
    let mut load = BTreeMap::new();
    for (id, &units) in output {
        let material = &catalog.materials[id];
        let count = units
            .min(((mass + 1e-8) / material.mass).floor() as u32)
            .min(((volume + 1e-8) / material.volume).floor() as u32)
            .min(spaces.min(u64::from(u32::MAX)) as u32);
        if count > 0 {
            load.insert(id.clone(), count);
            mass -= f64::from(count) * material.mass;
            volume -= f64::from(count) * material.volume;
            spaces -= u64::from(count);
        }
    }
    load
}

pub(super) fn take_load_lots(
    lots: &mut crate::food::FoodLots,
    load: &BTreeMap<String, u32>,
) -> crate::food::FoodLots {
    let mut taken = BTreeMap::new();
    for (id, &units) in load {
        let Some(source) = lots.get_mut(id) else {
            continue;
        };
        let mut remaining = units;
        let mut delivery = Vec::new();
        for lot in source.iter_mut().filter(|lot| lot.units > 0) {
            let count = remaining.min(lot.units);
            if count == 0 {
                break;
            }
            delivery.push(crate::food::Lot {
                units: count,
                ..lot.clone()
            });
            lot.units -= count;
            remaining -= count;
        }
        source.retain(|lot| lot.units > 0);
        if !delivery.is_empty() {
            taken.insert(id.clone(), delivery);
        }
    }
    taken
}

fn production_tool(recipe: &ProductionRecipe) -> Option<&str> {
    if let Some(craft) = &recipe.craft {
        return craft.tool.as_deref();
    }
    match recipe.kind.as_str() {
        "garden" | "greenhouse" | "compost" => Some("garden-tools"),
        "orchard" | "grove" => Some("harvest-basket"),
        "supply-5" if !recipe.output.contains_key("harvest-basket") => Some("carpentry-tools"),
        _ => None,
    }
}

fn needs_power(id: &str, recipe: &ProductionRecipe) -> bool {
    !recipe.handcraft
        && id != "cold_storage"
        && matches!(recipe.kind.as_str(), "kitchen" | "workshop")
}

#[cfg(test)]
mod upgrade_tests {
    use super::*;

    #[test]
    fn lab_site_status_reports_livestock_rations() {
        let catalog = Catalog::default();
        let mut village = Construction::default();
        let mut pen = crate::livestock::Pen::default();
        pen.health = 85.0;
        pen.feed = 2.5;
        pen.water = 7.0;
        village.livestock.animals.insert(0, pen);
        assert_eq!(
            village.production_site_status(&catalog, &Stock::default(), 0, 0.0),
            "\nHealth 85% · feed 2.50 kg · water 7.0 L · 0 ready"
        );
    }

    #[test]
    fn fully_spoiled_kitchen_batches_release_the_site_without_a_route() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let camp = IVec2::new(36, 36);
        let terrain = setup.terrain().with_camp(camp);
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp,
        };
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut village = Construction::default();
        let mut kitchen = village.proposed_site(&catalog, "kitchen", IVec2::new(44, 36));
        kitchen.work = catalog.projects["kitchen"].work;
        village.plans.push(kitchen);
        let recipe = &catalog.production["cook_greens"];
        let after_expiry = 90.0 * DAY;

        for phase in [Phase::Pickup, Phase::Return] {
            stock.receive(&recipe.input);
            village.queue_batch(&catalog, &mut stock, 0, "cook_greens");
            let job = &mut village.production.jobs[0];
            job.phase = phase;
            job.retry_at = after_expiry + 5.0;
            job.waiting_for_access = true;
            if phase == Phase::Return {
                job.food_input = None;
                job.food_output =
                    Some(crate::food::fresh(&recipe.output, 0.0, &Default::default()));
            }
            village.expire_batch_food(&catalog, &mut stock, site, after_expiry);
            assert!(village.production.jobs.is_empty());
        }
    }

    #[test]
    fn surviving_ingredients_wait_for_a_hauler_without_interrupting_resident_care() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let terrain = setup.terrain();
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut village = Construction::default();
        let mut kitchen = village.proposed_site(&catalog, "kitchen", IVec2::new(44, 36));
        kitchen.work = catalog.projects["kitchen"].work;
        village.plans.push(kitchen);
        stock.receive(&catalog.production["cook_greens"].input);
        village.queue_batch(&catalog, &mut stock, 0, "cook_greens");
        let job = &mut village.production.jobs[0];
        job.worker = Some(0);
        let lot = |expires| crate::food::Lot {
            units: 2,
            expires,
            preserved: false,
            chilled: false,
        };
        job.food_input = Some(BTreeMap::from([(
            "greens".into(),
            vec![lot(1.0), lot(10.0)],
        )]));
        let waypoint = SUPPLY_SPOTS[1].as_vec2();
        village.residents[0].path = VecDeque::from([waypoint]);
        village.residents[0].health.task = Some(crate::residents::NeedTask {
            kind: Need::Sleep,
            facility: None,
            elapsed: 0.0,
            started_at: None,
            duration: 100.0,
            water: 0.0,
            returning: false,
            partner: None,
            conversation: None,
        });

        village.expire_batch_food(&catalog, &mut stock, site, 5.0);

        let job = &village.production.jobs[0];
        assert!(job.phase == Phase::Return);
        assert_eq!(job.worker, None);
        assert_eq!(job.delivered_output.as_ref().unwrap()["greens"], 2);
        assert_eq!(job.food_output.as_ref().unwrap()["greens"][0].expires, 10.0);
        assert_eq!(village.residents[0].path.front(), Some(&waypoint));
    }

    #[test]
    fn selected_house_shows_assembly_estimates_and_why_builders_are_waiting() {
        let catalog = Catalog::default();
        let mut village = Construction::default();
        let mut house = village.proposed_site(&catalog, "home-cottage", IVec2::new(44, 36));
        house.pickups = 1;
        house.delivered = house.loads / 2;
        village.plans.push(house.clone());
        village.production.selected = Some(0);
        assert_eq!(
            village.selected_construction_progress(&catalog),
            Some(("Collecting materials", 0.0))
        );
        village.plans[0].pickups = 0;
        let fraction = f64::from(house.delivered) / f64::from(house.loads);
        assert_eq!(
            village.selected_construction_progress(&catalog),
            Some(("Delivering supplies", fraction))
        );
        house.pickups = 0;
        house.delivered = house.loads;
        house.work = catalog.projects["home-cottage"].work / 2.0;
        village.plans[0] = house;
        for resident in &mut village.residents {
            resident.health.energy = 20.0;
        }
        let text = village
            .selected_production(&catalog, &Stock::default(), 0.0)
            .unwrap();
        assert!(text.contains("Supplies ready · residents resting, meeting needs, or away"));
        assert!(text.contains("64 m² basic shell"));
        assert!(text.contains("Foundation and level floor · 96.0 h"));
        assert!(text.contains("Materials for this plan"));
        assert!(text.contains("Building · 50%"));
        assert!(text.contains("Housing: 1 resting places for residents."));
    }

    #[test]
    fn bulky_production_returns_in_multiple_conserved_loads() {
        let catalog = Catalog::default();
        let mut setup = WorldSetup::default();
        setup.mode = crate::setup::Mode::Sandbox;
        let camp = IVec2::new(36, 36);
        let terrain = setup.terrain().with_camp(camp);
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp,
        };
        let mut stock = Stock::for_start(&setup, &catalog);
        let initial_logs = stock.available("logs");
        let mut village = Construction::default();
        let mut trees = village.proposed_site(&catalog, "supply-0", IVec2::new(44, 36));
        trees.work = catalog.projects["supply-0"].work;
        trees.delivered = trees.loads;
        village.plans.push(trees);
        village.queue_batch(&catalog, &mut stock, 0, "wood");
        village.production.jobs[0].worker = Some(0);
        village.production.jobs[0].phase = Phase::Return;
        village.production.jobs[0].work = catalog.production["wood"].work;
        village.residents[0].position = SUPPLY_SPOTS[0].as_vec2();
        for cell in project_access_points(&village.plans[0], &catalog, SUPPLY_SPOTS[0].as_vec2()) {
            let obstacle = village.proposed_site(&catalog, "supply-5", cell);
            village.plans.push(obstacle);
        }
        village.tick_production(&catalog, &mut stock, site, 0.0, 0.1);
        assert_eq!(stock.available("logs") - initial_logs, 5);
        assert!(village.production.jobs[0].returning_to_site);
        assert!(village.production.jobs[0].waiting_for_access);
        assert!(village.residents[0].path.is_empty());
        let saved = serde_json::to_string(&village).unwrap();
        village = serde_json::from_str(&saved).unwrap();
        assert!(village.valid_save(&catalog, &stock));
        village.plans.truncate(1);
        for step in 1..20_000 {
            village.tick_production(&catalog, &mut stock, site, f64::from(step) * 0.1, 0.1);
            if village.production.jobs.is_empty() {
                break;
            }
        }
        assert!(village.production.jobs.is_empty());
        assert_eq!(stock.available("logs") - initial_logs, 48);
        assert_eq!(
            production_load_with_limit(&catalog, &BTreeMap::from([("logs".into(), 48)]), 2),
            BTreeMap::from([("logs".into(), 2)])
        );
        assert_eq!(
            production_load(
                &catalog,
                &BTreeMap::from([("wheelbarrow".into(), 2), ("logs".into(), 1)])
            ),
            BTreeMap::from([("wheelbarrow".into(), 1)])
        );
    }

    #[test]
    fn crafting_distinguishes_borrowed_tools_from_broken_tools() {
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
        stock.receive(&BTreeMap::from([("carpentry-tools".into(), 1)]));
        let village = Construction::default();
        let recipe = &catalog.production["craft_garden-tools"];
        assert_eq!(
            village.craft_blocker(&catalog, &stock, recipe, Some(1)),
            None
        );
        let task = ToolTask::Production(0);
        stock.use_tool(1, "carpentry-tools", task, 1.0, false);
        assert_eq!(
            village
                .craft_blocker(&catalog, &stock, recipe, Some(3))
                .as_deref(),
            Some("Waiting for shared carpentry tools.")
        );
        stock.use_tool(1, "carpentry-tools", task, 1_800.0, false);
        assert_eq!(
            stock.equipment.condition_percent("carpentry-tools", 1),
            Some(0.0)
        );
        assert_eq!(
            village
                .craft_blocker(&catalog, &stock, recipe, Some(3))
                .as_deref(),
            Some("Waiting for carpentry tool repair.")
        );
    }

    #[test]
    fn recipe_controls_move_unfinished_craft_work_without_resetting_progress() {
        let catalog = Catalog::default();
        let mut setup = WorldSetup::default();
        setup.mode = crate::setup::Mode::Sandbox;
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut village = Construction::default();
        for x in 44..47 {
            let mut shop = village.proposed_site(&catalog, "supply-5", IVec2::new(x, 36));
            shop.work = catalog.projects["supply-5"].work;
            shop.delivered = shop.loads;
            village.plans.push(shop);
        }
        stock.receive(&BTreeMap::from([("carpentry-tools".into(), 1)]));
        village.queue_batch(&catalog, &mut stock, 0, "craft_garden-tools");
        assert_eq!(
            village.production.jobs.len(),
            1,
            "{}",
            village.production.notice
        );
        village.production.jobs[0].work = 7.0;
        village.production.jobs[0].worker = Some(0);
        village.residents[0].path.push_back(Vec2::new(45.0, 36.0));
        village.select_project(Some(0));
        village.toggle_recipes(&catalog);
        assert!(
            village
                .selected_production(&catalog, &stock, 0.0)
                .unwrap()
                .contains("Craft progress 3% · Iara")
        );
        let mut keyboard = ButtonInput::default();
        keyboard.press(KeyCode::BracketRight);
        village.production_input(&catalog, &mut stock, &keyboard);
        keyboard.reset_all();
        keyboard.press(KeyCode::KeyM);
        village.production_input(&catalog, &mut stock, &keyboard);
        let job = &village.production.jobs[0];
        assert_eq!(job.site, 2);
        assert_eq!(job.work, 7.0);
        assert!(job.worker.is_none());
        assert!(job.phase == Phase::Pickup);
        assert!(village.residents[0].path.is_empty());
        assert_eq!(village.production.selected, Some(2));
        assert!(
            village
                .selected_production(&catalog, &stock, 0.0)
                .unwrap()
                .contains("Craft progress 3% · Waiting for a qualified resident")
        );
        let land = Land::default();
        let terrain = setup.terrain();
        let ground = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        let order: LabOrder =
            serde_json::from_str(r#"{"type":"move-craft","site":3,"destination":1}"#).unwrap();
        village
            .lab_order(&catalog, &mut stock, ground, clock, &order, 1.0)
            .unwrap();
        assert_eq!(village.production.jobs[0].site, 0);
        assert_eq!(village.production.jobs[0].work, 7.0);
        assert_eq!(village.production.selected, Some(2));
    }

    #[test]
    fn powered_workshop_doubles_machine_work_and_gives_residents_experience() {
        let catalog = Catalog::default();
        let mut setup = WorldSetup::default();
        setup.mode = crate::setup::Mode::Sandbox;
        let camp = IVec2::new(36, 36);
        let terrain = setup.terrain().with_camp(camp);
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp,
        };
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut village = Construction::default();
        let mut workshop = village.proposed_site(&catalog, "workshop", IVec2::new(44, 36));
        workshop.work = catalog.projects["workshop"].work;
        workshop.delivered = workshop.loads;
        village.plans.push(workshop);
        village.queue_batch(&catalog, &mut stock, 0, "frames");
        village.production.jobs[0].worker = Some(1);
        village.production.jobs[0].phase = Phase::Work;
        village.tick_services(&catalog, &setup, &mut stock, 1.0, 1.0);
        assert!(village.utilities.powered(0));
        let expected =
            2.0 * village.residents[1].work_multiplier(&catalog.residents[1], "workshop");
        let fill = BTreeMap::from([("stone".into(), (1_000_000 - stock.units()) as u32)]);
        stock.receive(&fill);
        village.tick_production(&catalog, &mut stock, site, 1.0, 1.0);
        let job = &village.production.jobs[0];
        assert_eq!(job.work, 0.0);
        assert_eq!(village.residents[1].experience, 0.0);
        assert_eq!(
            village.batch_status(job, &catalog, &stock, 1.0),
            "Waiting for storage space"
        );
        stock.reserve_available(&fill);
        village.tick_production(&catalog, &mut stock, site, 1.0, 1.0);
        assert_eq!(village.production.jobs[0].work, expected);
        assert_eq!(village.residents[1].experience, 1.0);
    }

    #[test]
    fn residents_prioritize_food_when_the_village_is_hungry_then_use_preferences() {
        let catalog = Catalog::default();
        let mut setup = WorldSetup::default();
        setup.mode = crate::setup::Mode::Sandbox;
        let camp = IVec2::new(36, 36);
        let terrain = setup.terrain().with_camp(camp);
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp,
        };
        for (food_level, expected_site) in [(80.0, 1), (10.0, 0)] {
            let mut stock = Stock::for_start(&setup, &catalog);
            let mut village = Construction::default();
            village.residents[1].health.levels[Need::Hunger as usize] = food_level;
            for (key, recipe, cell) in [
                ("coop", "eggs", IVec2::new(44, 36)),
                ("supply-0", "wood", IVec2::new(50, 36)),
            ] {
                let mut plan = village.proposed_site(&catalog, key, cell);
                plan.work = catalog.projects[key].work;
                plan.delivered = plan.loads;
                let index = village.plans.len();
                village.plans.push(plan);
                village.queue_batch(&catalog, &mut stock, index, recipe);
            }
            village.tick_production(&catalog, &mut stock, site, 0.0, 0.1);
            let job = village
                .production
                .jobs
                .iter()
                .find(|job| job.worker == Some(0))
                .unwrap();
            assert_eq!(job.site, expected_site);
            let job = village
                .production
                .jobs
                .iter_mut()
                .find(|job| job.site == expected_site)
                .unwrap();
            job.phase = Phase::Work;
            job.work = 5.0;
            village.residents[0].health.energy = 24.0;
            village.tick_production(&catalog, &mut stock, site, 2.0, 0.1);
            let job = village
                .production
                .jobs
                .iter()
                .find(|job| job.site == expected_site)
                .unwrap();
            assert!(job.worker.is_some_and(|worker| worker != 0));
            assert_eq!(job.work, 5.0);
            if expected_site == 0 {
                let plan = &village.plans[0];
                village.utilities.sync(std::iter::once(Facility {
                    id: 1,
                    kind: "coop",
                    location: plan.position,
                    size: plan.size,
                    batteries: 0,
                    panels: 0,
                    working: true,
                }));
                village.utilities.toggle(0);
                village.tick_production(&catalog, &mut stock, site, 3.0, 0.1);
                let job = &village.production.jobs[0];
                assert!(job.worker.is_none());
                assert_eq!(job.work, 5.0);
                assert_eq!(
                    village.batch_status(job, &catalog, &stock, 3.0),
                    "Building switched off"
                );
                village.utilities.toggle(0);
                village.tick_production(&catalog, &mut stock, site, 4.0, 0.1);
                assert!(village.production.jobs[0].worker.is_some());
            }
        }
    }

    #[test]
    fn production_prefers_the_marked_entrance_over_a_nearer_side() {
        let catalog = Catalog::default();
        let village = Construction::default();
        let origin = IVec2::new(44, 36);
        let kitchen = village.proposed_site(&catalog, "kitchen", origin);
        let from = (origin - IVec2::Y).as_vec2();
        let front = building_entrance(&kitchen, &catalog.projects["kitchen"]).unwrap();
        let points = project_access_points(&kitchen, &catalog, from);
        assert_eq!(points[0], front);
        assert_eq!(points[1], from.as_ivec2());
        assert_eq!(points.iter().filter(|&&cell| cell == front).count(), 1);
    }

    #[test]
    fn access_stop_marks_failed_routes_but_ignores_normal_retry() {
        use crate::construction::LabStop;

        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        stock.sandbox = true;
        let land = Land::default();
        let camp = IVec2::new(36, 36);
        let terrain = setup.terrain().with_camp(camp);
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp,
        };
        let mut village = Construction::default();
        let mut house = village.proposed_site(&catalog, "home-cottage", IVec2::new(44, 36));
        house.work = catalog.projects["home-cottage"].work;
        let entrances = super::super::resident_work::approach_points(
            house.position,
            house.size,
            camp.as_vec2(),
        );
        village.plans.push(house);
        village.tick_services(&catalog, &setup, &mut stock, 0.0, 0.1);
        village.queue_batch(&catalog, &mut stock, 0, "solar_upgrade");

        village.tick_production(&catalog, &mut stock, site, 0.0, 0.1);
        assert!(village.production.jobs[0].worker.is_some());
        assert_eq!(village.lab_stop_reason(LabStop::Blocked, 0.0), None);
        let worker = village.production.jobs[0].worker.unwrap();
        village.residents[worker].path.clear();

        for cell in entrances {
            let mut obstruction = village.proposed_site(&catalog, "fire-circle", cell);
            obstruction.work = catalog.projects["fire-circle"].work;
            village.plans.push(obstruction);
        }
        village.tick_production(&catalog, &mut stock, site, 1.0, 0.1);
        assert_eq!(
            village.lab_stop_reason(LabStop::Blocked, 1.0),
            Some("A job is waiting for access.")
        );
        let job = &village.production.jobs[0];
        assert_eq!(
            village.batch_status(job, &catalog, &stock, 1.0),
            "Waiting for access"
        );

        village.plans.truncate(1);
        village.tick_production(&catalog, &mut stock, site, 6.0, 0.1);
        assert_eq!(village.lab_stop_reason(LabStop::Blocked, 6.0), None);
        assert!(village.production.jobs[0].phase == Phase::Approach);
    }

    #[test]
    fn sandbox_schedules_perennial_harvests_and_livestock_without_duplicates() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        stock.sandbox = true;
        let mut village = Construction::default();
        for key in ["orchard", "grove", "apiary", "coop"] {
            let mut plan = village.proposed_site(&catalog, key, IVec2::new(44, 36));
            plan.work = catalog.projects[key].work;
            village.plans.push(plan);
        }
        for _ in 0..2 {
            village.tick_growth(&catalog, &setup, &stock, 0.1, 0.1);
            village.schedule_perennial_work(&catalog, &mut stock);
            village.tick_animals(&catalog, &mut stock, &Land::default(), 0.1, 0.1);
        }
        assert_eq!(
            village
                .production
                .jobs
                .iter()
                .map(|job| &*job.recipe)
                .collect::<Vec<_>>(),
            ["fruit", "bananas", "honey", "eggs"]
        );
        assert!(
            village
                .production
                .jobs
                .iter()
                .all(|job| job.growth.is_none())
        );
    }

    #[test]
    fn livestock_schedules_forage_and_collection_without_player_orders() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let land = Land::generate(&setup);
        let mut stock = Stock::for_start(&setup, &catalog);
        stock.reserve_available(&BTreeMap::from([(
            "fodder".into(),
            stock.available("fodder"),
        )]));
        let mut village = Construction::default();
        let mut coop = village.proposed_site(&catalog, "coop", IVec2::new(41, 36));
        coop.work = catalog.projects["coop"].work;
        village.plans.push(coop);

        for _ in 0..2 {
            village.tick_animals(&catalog, &mut stock, &land, 0.1, 0.1);
        }
        assert_eq!(village.gathering.orders.len(), 1);
        let forage = *village.gathering.orders.keys().next().unwrap();
        assert_eq!(land.site(forage).unwrap().recipe(), "gather-wild-forage");

        let ration = &catalog.animal_rations["coop"];
        let pen = village.livestock.animals.get_mut(&0).unwrap();
        pen.feed(ration, ration.water);
        pen.tick(ration, DAY, DAY);
        village.tick_animals(&catalog, &mut stock, &land, DAY + 0.1, 0.1);
        assert_eq!(village.production.jobs.len(), 1);
        assert_eq!(village.production.jobs[0].recipe, "eggs");
    }

    #[test]
    fn a_workbench_repair_restores_a_worn_tool() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        stock.sandbox = true;
        let land = Land::default();
        let camp = IVec2::new(36, 36);
        let terrain = setup.terrain().with_camp(camp);
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp,
        };
        let mut village = Construction {
            selection: Some("supply-5".into()),
            ..default()
        };
        village.plan(
            &catalog,
            &mut stock,
            site,
            IVec2::new(44, 36),
            TownClock {
                seconds: 0.0,
                round_trip_km: 12,
            },
        );
        stock.sandbox = false;
        stock.receive(&BTreeMap::from([
            ("garden-tools".into(), 1),
            ("repair_supplies".into(), 1),
            ("carpentry-tools".into(), 1),
        ]));
        let task = ToolTask::Cultivation(2, 0);
        assert_eq!(stock.use_tool(0, "garden-tools", task, 1.0, false), 1.25);
        village.queue_batch(&catalog, &mut stock, 0, "repair_garden-tools");
        assert!(village.production.jobs.is_empty());
        stock.equipment.release(|_, _| false);
        let parts = stock.available("repair_supplies");
        village.queue_batch(&catalog, &mut stock, 0, "repair_garden-tools");
        assert_eq!(stock.available("repair_supplies"), parts - 1);
        village.tick_production(&catalog, &mut stock, site, 0.0, 0.1);
        assert_eq!(village.production.jobs[0].worker, Some(1));
        for step in 1..4_000 {
            village.tick_production(&catalog, &mut stock, site, f64::from(step) * 0.1, 0.1);
            if village.production.jobs.is_empty() {
                break;
            }
        }
        assert!(village.production.jobs.is_empty());
        assert_eq!(stock.equipment.wear("garden-tools"), 0.0);
        assert!(stock.equipment.valid(|id| stock.available(id)));
    }

    #[test]
    fn cooking_without_grid_power_reserves_biogas_once_per_batch() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        stock.sandbox = true;
        let land = Land::default();
        let camp = IVec2::new(36, 36);
        let terrain = setup.terrain().with_camp(camp);
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp,
        };
        let mut village = Construction {
            selection: Some("kitchen".into()),
            ..default()
        };
        village.plan(
            &catalog,
            &mut stock,
            site,
            IVec2::new(44, 36),
            TownClock {
                seconds: 0.0,
                round_trip_km: 12,
            },
        );
        stock.sandbox = false;
        let recipe = &catalog.production["cook_greens"];
        stock.receive(&recipe.input);
        let before = stock.available("meals");
        village.utilities.grid_off = true;
        village.utilities.biogas = 1.0;
        village.queue_batch(&catalog, &mut stock, 0, "cook_greens");
        village.tick_services(&catalog, &setup, &mut stock, 0.0, 0.1);
        village.utilities.take_water(Some(1), 0, 6.0);
        village.tick_production(&catalog, &mut stock, site, 0.0, 0.1);
        assert!(village.production.jobs[0].worker.is_none());
        village.production.selected = Some(0);
        let details = village.selected_production(&catalog, &stock, 0.0).unwrap();
        assert!(details.contains("Waiting for drinking water"));
        assert!(details.contains("Batch progress 0% · Waiting for a resident"));
        assert_eq!(
            village.utilities.deliver_water(1, 0, recipe.water),
            recipe.water
        );
        village.utilities.deliver_water(1, 2, 24.0);
        village.tick_production(&catalog, &mut stock, site, 0.1, 0.1);
        assert!(village.production.jobs[0].worker.is_none());
        assert_eq!(village.utilities.potable_at(1), recipe.water);
        assert_eq!(village.utilities.take_water(Some(1), 2, 24.0), 24.0);
        let mut consumed = 0.0;
        for step in 1..4_000 {
            let clock = f64::from(step) * 0.1;
            village.tick_services(&catalog, &setup, &mut stock, clock, 0.1);
            let available = village.utilities.potable_at(1);
            village.tick_production(&catalog, &mut stock, site, clock, 0.1);
            consumed += available - village.utilities.potable_at(1);
            if village.production.jobs.is_empty() {
                break;
            }
        }
        assert!(village.production.jobs.is_empty());
        assert_eq!(stock.available("meals"), before + recipe.output["meals"]);
        assert!((consumed - recipe.water).abs() < 1e-9);
        assert!(
            (village.utilities.water_site(1).unwrap().levels[2] - recipe.water * 0.8).abs() < 1e-9
        );
        assert!(stock.processing_summary(&catalog).contains("1 batch"));
        assert!((village.utilities.biogas - 0.8).abs() < 1e-9);
    }

    #[test]
    fn compost_cures_with_the_worker_released_and_is_later_delivered() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        stock.sandbox = true;
        let land = Land::default();
        let camp = IVec2::new(36, 36);
        let terrain = setup.terrain().with_camp(camp);
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp,
        };
        let mut village = Construction {
            selection: Some("compost".into()),
            ..default()
        };
        village.plan(
            &catalog,
            &mut stock,
            site,
            IVec2::new(44, 36),
            TownClock {
                seconds: 0.0,
                round_trip_km: 12,
            },
        );
        stock.sandbox = false;
        let recipe = &catalog.production["compost"];
        stock.receive(&recipe.input);
        let before = stock.available("compost");
        village.queue_batch(&catalog, &mut stock, 0, "compost");
        for step in 0..3_000 {
            village.tick_production(&catalog, &mut stock, site, f64::from(step) * 0.1, 0.1);
            if village.production.jobs[0].phase == Phase::Growing {
                break;
            }
        }
        let curing = &village.production.jobs[0];
        assert!(curing.phase == Phase::Growing);
        assert!(curing.worker.is_none());
        assert_eq!(stock.available("compost"), before);
        let save = serde_json::to_string(&village).unwrap();
        let mut village: Construction = serde_json::from_str(&save).unwrap();
        assert!(village.valid_save(&catalog, &stock));
        village.tick_growth(&catalog, &setup, &stock, 61.0 * DAY, 60.0 * DAY);
        assert!(village.production.jobs[0].phase == Phase::Harvest);
        assert_eq!(stock.available("compost"), before);
        for step in 0..3_000 {
            village.tick_production(
                &catalog,
                &mut stock,
                site,
                61.0 * DAY + f64::from(step) * 0.1,
                0.1,
            );
            if village.production.jobs.is_empty() {
                break;
            }
        }
        assert!(village.production.jobs.is_empty());
        assert_eq!(
            stock.available("compost"),
            before + recipe.output["compost"]
        );
    }

    #[test]
    fn residents_stock_an_empty_goat_pen_once_and_save_the_herd() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let camp = IVec2::new(36, 36);
        let terrain = setup.terrain().with_camp(camp);
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp,
        };
        let mut village = Construction::default();
        let key = "goat-pasture-empty";
        let mut plan = village.proposed_site(&catalog, key, IVec2::new(44, 36));
        plan.delivered = plan.loads;
        plan.work = catalog.projects[key].work;
        village.plans.push(plan);

        village.tick_services(&catalog, &setup, &mut stock, 0.0, 0.1);
        village.tick_animals(&catalog, &mut stock, &land, 0.0, 0.1);
        assert!(village.empty_goat_pen(0));
        assert_eq!(
            village.finished_model(&catalog, 0),
            catalog.projects[key].model
        );
        assert!(village.production.jobs.is_empty());
        assert_eq!(village.recipes(&catalog, 0)[0].0, "stock-goats");

        let goats = &catalog.production["stock-goats"].input;
        stock.receive(goats);
        let before = stock.available("goats");
        village.production.selected = Some(0);
        assert!(
            village
                .selected_production(&catalog, &stock, 0.0)
                .unwrap()
                .contains("Empty · C Recipes")
        );
        village.queue_recipe_row(&catalog, &mut stock, 0);
        assert!(
            village
                .selected_production(&catalog, &stock, 0.0)
                .unwrap()
                .contains("Collecting goats from supplies")
        );
        assert_eq!(stock.available("goats"), before - 2);
        assert!(village.empty_goat_pen(0));
        for step in 0..4_000 {
            village.tick_production(&catalog, &mut stock, site, f64::from(step) * 0.1, 0.1);
            if village.production.jobs.is_empty() {
                break;
            }
        }
        assert!(village.production.jobs.is_empty());
        assert_eq!(village.installed_goats(&catalog, 0), Some(goats));
        assert!(
            village
                .selected_production(&catalog, &stock, 0.0)
                .unwrap()
                .starts_with("Goat pen #1")
        );
        assert!(
            village
                .batch_inputs(&catalog, &stock, 0, "stock-goats")
                .is_err()
        );
        let serialized = serde_json::to_string(&village).unwrap();
        let restored: Construction = serde_json::from_str(&serialized).unwrap();
        assert!(restored.valid_save(&catalog, &stock));
        assert_eq!(restored.installed_goats(&catalog, 0), Some(goats));
        assert_eq!(
            restored.finished_model(&catalog, 0),
            catalog.projects["goat_pasture"].model
        );
    }

    #[test]
    fn residents_install_solar_from_stock_and_the_finished_home_charges() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        stock.sandbox = true;
        let land = Land::default();
        let camp = IVec2::new(36, 36);
        let terrain = setup.terrain().with_camp(camp);
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp,
        };
        let mut village = Construction {
            selection: Some("home-cottage".into()),
            ..default()
        };
        village.plan(
            &catalog,
            &mut stock,
            site,
            IVec2::new(44, 36),
            TownClock {
                seconds: 0.0,
                round_trip_km: 12,
            },
        );
        stock.sandbox = false;
        let parts = &catalog.production["solar_upgrade"].input;
        stock.receive(parts);
        let before = stock.available("panels");
        village.tick_services(&catalog, &setup, &mut stock, 0.0, 0.1);
        village.queue_batch(&catalog, &mut stock, 0, "solar_upgrade");
        assert_eq!(stock.available("panels"), before - 1);
        assert!(!village.utilities.has_rooftop_solar(0));
        village.utilities.grid_off = true;
        for step in 0..4_000 {
            let clock = f64::from(step) * 0.1;
            village.tick_production(&catalog, &mut stock, site, clock, 0.1);
            if village.production.jobs.is_empty() {
                break;
            }
        }
        assert!(village.utilities.has_rooftop_solar(0));
        village.tick_services(&catalog, &setup, &mut stock, 300.0, 50.0);
        let after = village.utilities.facility_status(0).unwrap();
        assert!(after.contains("kWh stored"));
        assert!(!after.contains("0.00/4 kWh stored"));
        village.queue_batch(&catalog, &mut stock, 0, "solar_upgrade");
        assert!(village.production.jobs.is_empty());
        assert_eq!(stock.available("panels"), before - 1);
        let serialized = serde_json::to_string(&village).unwrap();
        let restored: Construction = serde_json::from_str(&serialized).unwrap();
        assert_eq!(restored.utilities.facility_status(0), Some(after));
        assert!(restored.valid_save(&catalog, &stock));
    }
}
