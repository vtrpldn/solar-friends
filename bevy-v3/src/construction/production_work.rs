use std::borrow::Cow;

use crate::{
    catalog::ProductionRecipe,
    production::{
        Batch, Phase,
        growth::{Conditions, Growth, Irrigation},
    },
    setup::WorldSetup,
    weather::{DAY, growing_season, weather_at},
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
        self.production.selected = index;
        self.production.open = false;
        self.production.page = 0;
        self.production.notice.clear();
    }

    pub(super) fn recipes<'a>(
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
            .filter(|(_, recipe)| recipe.kind == *kind)
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
        if keyboard.any_just_pressed([KeyCode::PageDown, KeyCode::PageUp]) {
            self.page_recipes(catalog, keyboard.just_pressed(KeyCode::PageDown));
        }
        if let Some(row) = PAGE_KEYS.iter().position(|key| keyboard.just_pressed(*key)) {
            self.queue_recipe_row(catalog, stock, row);
        }
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

    fn craft_blocker(
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
        if let Some(tool) = &craft.tool
            && !stock.equipment.ready(
                tool,
                stock.available(tool),
                worker,
                self.repairing(catalog, tool),
            )
        {
            return Some("Waiting for usable shared carpentry tools.".into());
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
            Ok(inputs) => inputs.map(|inputs| stock.reserve_available(&inputs)),
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

    fn batch_inputs(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        index: usize,
        id: &str,
    ) -> Result<Option<BTreeMap<String, u32>>, String> {
        let recipe = &catalog.production[id];
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

    pub(super) fn batch_status(
        &self,
        job: &Batch,
        recipe: &ProductionRecipe,
        clock: f64,
    ) -> String {
        if job.waiting_for_access && job.retry_at > clock {
            return "Waiting for access".into();
        }
        match job.phase {
            Phase::Pickup | Phase::Approach | Phase::Work
                if recipe.water > 0.0
                    && !job.watered
                    && self.utilities.potable_at(job.site + 1) < recipe.water =>
            {
                "Waiting for drinking water".into()
            }
            Phase::Pickup => "Collecting ingredients".into(),
            Phase::Approach => "Bringing ingredients".into(),
            Phase::Work if job.using_biogas => {
                format!("{:.0}% worked · Biogas", job.work / recipe.work * 100.0)
            }
            Phase::Work
                if needs_power(&job.recipe, recipe) && !self.utilities.powered(job.site) =>
            {
                "Waiting for power".into()
            }
            Phase::Work if recipe.craft.is_some() => {
                let fraction = job.work / recipe.work;
                let stage = recipe.craft.as_ref().expect("craft recipe").stage(fraction);
                format!("{:.0}% · {stage}", fraction * 100.0)
            }
            Phase::Work => format!("{:.0}% worked", job.work / recipe.work * 100.0),
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

    pub fn selected_production(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        clock: f64,
    ) -> Option<String> {
        let index = self.production.selected?;
        let site = self.plans.get(index)?;
        let definition = &catalog.projects[&site.key];
        let name = &definition.name;
        let recipes = self.recipes(catalog, index);
        let mut text = name.clone();
        if !site.removed && site.work < definition.work {
            use std::fmt::Write;
            let _ = write!(text, " · {}", self.project_status(catalog, index));
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
        if let Some(job) = self.production.jobs.iter().find(|job| job.site == index) {
            let recipe = &catalog.production[&job.recipe];
            let state = self.batch_status(job, recipe, clock);
            text.push_str(&format!(" · {} · {state}", recipe.name));
        }
        if let Some(animals) = self.livestock.animals.get(&index) {
            text.push_str(&format!(
                "\nHealth {:.0}% · feed {:.2} kg · water {:.1} L · {} ready",
                animals.health,
                animals.feed,
                animals.water,
                animals.available()
            ));
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
        let rain = weather_at(clock, setup.biome(), setup.seed()).rain;
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
            })
    }

    pub(super) fn tick_production(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        site: ConstructionSite,
        clock: f64,
        dt: f32,
    ) {
        self.expire_batch_food(catalog, stock, site, clock);
        self.assign_producers(catalog, stock, site, clock);
        for index in (0..self.production.jobs.len()).rev() {
            if self.production.jobs[index].phase == Phase::Growing
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
            worker.move_along_path(dt, matches!(phase, Phase::Approach | Phase::Return));
            if !worker.path.is_empty() {
                continue;
            }
            let position = worker.position;
            let recipe = &catalog.production[&job.recipe];
            let ConstructionSite {
                terrain,
                land,
                camp,
            } = site;
            let path = |from, to| {
                route(
                    from,
                    to,
                    |cell| self.blocked(catalog, terrain, land, camp, cell),
                    access_road,
                )
            };
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
                        if !self.utilities.drink(job.site + 1, recipe.water) {
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
                    let rate = recipe.craft.as_ref().map_or(boost, |craft| {
                        let worker = &mut self.residents[worker_index];
                        worker.craft.practice(worker_index, craft.skill, seconds)
                            * worker.health.hydration_factor()
                    });
                    job.work = (job.work + seconds * rate).min(recipe.work);
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
                    let Some(path) = route(
                        position,
                        SUPPLY_SPOTS[worker_index],
                        |cell| self.blocked(catalog, terrain, land, camp, cell),
                        access_road,
                    ) else {
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
                    let output = job.delivered_output.as_ref().unwrap_or(&recipe.output);
                    let units: u64 = output.values().map(|v| u64::from(*v)).sum();
                    if self.storage_space(catalog, stock) < units {
                        continue;
                    }
                    if let Some(lots) = &job.food_output {
                        stock.receive_with_lots(output, lots.clone());
                    } else {
                        stock.receive(output);
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

    fn expire_batch_food(
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
            let from = self.residents[worker].position;
            let path = self.resident_route(catalog, site, from, SUPPLY_SPOTS[worker]);
            let job = &mut self.production.jobs[index];
            job.delivered_output = Some(good);
            job.food_output = Some(surviving);
            job.food_input = None;
            job.phase = Phase::Return;
            if let Some(path) = path {
                self.residents[worker].path = path;
            } else {
                self.residents[worker].path.clear();
                job.worker = None;
            }
            self.production.notice =
                "Reserved food spoiled. Usable ingredients are being returned.".into();
        }
    }

    fn assign_producers(
        &mut self,
        catalog: &Catalog,
        stock: &Stock,
        site: ConstructionSite,
        clock: f64,
    ) {
        let mut jobs: Vec<_> = self
            .production
            .jobs
            .iter()
            .enumerate()
            .filter_map(|(index, job)| {
                (job.worker.is_none() && job.phase != Phase::Growing && job.retry_at <= clock)
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
            let resident = &self.residents[index];
            if resident.assignment.is_some()
                || self.gathering.workers_at_site(index)
                || self.production.has_worker(index)
                || self.farming.has_worker(index)
                || self.working_change(index)
                || self.working_water(index)
                || self.working_upkeep(index)
                || resident.health.task.is_some()
                || resident.town_work.active()
                || self.driver_booked(index)
            {
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
                    && self.try_assign_producer(job, index, catalog, site, stock)
                {
                    self.production.jobs[job].waiting_for_access = false;
                    break;
                }
            }
        }
        for job in jobs {
            self.production.jobs[job].retry_at = clock + 1.0;
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
        if !stock.sandbox
            && batch.phase != Phase::Return
            && !batch.watered
            && self.utilities.potable_at(batch.site + 1) + 1e-8 < recipe.water
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
                .water_site(batch.site + 1)
                .is_some_and(|node| node.levels[0] + node.levels[1] >= biology.on_site_water)
        {
            return false;
        }
        let phase = self.production.jobs[job].phase;
        let returning = phase == Phase::Return;
        let project = &self.plans[self.production.jobs[job].site];
        let ConstructionSite {
            terrain,
            land,
            camp,
        } = site;
        let path = |from, to| {
            route(
                from,
                to,
                |cell| self.blocked(catalog, terrain, land, camp, cell),
                access_road,
            )
        };
        let resident = &self.residents[index];
        if !returning
            && self
                .craft_blocker(catalog, stock, recipe, Some(index))
                .is_some()
        {
            return false;
        }
        let supply = SUPPLY_SPOTS[index];
        let assigned_path = if phase == Phase::Harvest {
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
    fn residents_choose_preferred_production_from_the_available_queue() {
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
        for (key, recipe, cell) in [
            ("grove", "bananas", IVec2::new(44, 36)),
            ("orchard", "fruit", IVec2::new(50, 36)),
        ] {
            let mut plan = village.proposed_site(&catalog, key, cell);
            plan.work = catalog.projects[key].work;
            plan.delivered = plan.loads;
            let index = village.plans.len();
            village.plans.push(plan);
            village.queue_batch(&catalog, &mut stock, index, recipe);
        }
        village.assign_producers(&catalog, &stock, site, 0.0);
        assert_eq!(village.production.jobs[1].worker, Some(0));
        assert_ne!(village.production.jobs[0].worker, Some(0));
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
            village.batch_status(job, &catalog.production["solar_upgrade"], 1.0),
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
        assert_eq!(
            village.utilities.deliver_water(1, 0, recipe.water),
            recipe.water
        );
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
