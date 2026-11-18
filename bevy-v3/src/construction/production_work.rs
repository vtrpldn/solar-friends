use crate::{
    catalog::ProductionRecipe,
    production::{
        Batch, Phase,
        growth::{Conditions, Growth},
    },
    setup::WorldSetup,
    weather::{DAY, growing_season, weather_at},
};

use super::*;

impl Construction {
    pub fn select_facility(&mut self, cell: IVec2) {
        self.production.selected = self
            .plans
            .iter()
            .enumerate()
            .find(|(_, plan)| {
                cell.cmpge(plan.position).all()
                    && cell.cmplt(plan.position + plan.size).all()
                    && !plan.removed
            })
            .map(|(index, _)| index);
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
        let Some(index) = self.production.selected else {
            return;
        };
        let recipes = self.recipes(catalog, index);
        if keyboard.just_pressed(KeyCode::KeyT)
            && recipes.iter().any(|(_, recipe)| {
                recipe
                    .biology
                    .as_ref()
                    .is_some_and(|bio| bio.care.is_some())
            })
        {
            let ground = self.production.growing_sites.entry(index).or_default();
            ground.irrigation = ground.irrigation.cycle();
        }
        if keyboard.just_pressed(KeyCode::KeyC) && !recipes.is_empty() {
            self.production.open = !self.production.open;
        }
        if !self.production.open || self.menu {
            return;
        }
        let pages = recipes.len().div_ceil(PAGE_KEYS.len()).max(1);
        if keyboard.just_pressed(KeyCode::PageDown) {
            self.production.page = (self.production.page + 1) % pages;
        } else if keyboard.just_pressed(KeyCode::PageUp) {
            self.production.page = (self.production.page + pages - 1) % pages;
        }
        let Some(number) = PAGE_KEYS.iter().position(|key| keyboard.just_pressed(*key)) else {
            return;
        };
        let Some((id, _)) = recipes
            .get(self.production.page * PAGE_KEYS.len() + number)
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
        let recipe = &catalog.production[id];
        if let Some(tool) = &recipe.repair
            && (self.repairing(catalog, tool)
                || stock.equipment.borrowed(tool) > 0
                || stock.equipment.wear(tool) == 0.0)
        {
            self.production.notice = if self.repairing(catalog, tool) {
                "A repair is already queued for this equipment."
            } else if stock.equipment.borrowed(tool) > 0 {
                "Wait for the borrowed equipment to be returned."
            } else {
                "This equipment does not need repair."
            }
            .into();
            return;
        }
        if id == "solar_upgrade" && self.utilities.has_rooftop_solar(index) {
            self.production.notice = "Rooftop solar is already installed.".into();
            return;
        }
        if id == "cold_storage" && self.utilities.has_cold_storage(index) {
            self.production.notice = "Cold storage is already installed.".into();
            return;
        }
        if let Some(ration) = catalog.animal_rations.get(&recipe.kind)
            && !stock.sandbox
        {
            let Some(pen) = self.livestock.animals.get(&index) else {
                return;
            };
            if id == ration.product && pen.available() == 0 {
                self.production.notice = "There is nothing ready to collect.".into();
                return;
            }
            if id.starts_with("care-") {
                if pen.fed_days(ration) > ration.days - 0.25 {
                    self.production.notice =
                        "The animals already have enough feed and water.".into();
                    return;
                }
                if self.utilities.potable_at(index + 1) < ration.water {
                    self.production.notice = "Waiting for animal drinking water.".into();
                    return;
                }
            }
        }
        if let Some(reason) = self.craft_blocker(catalog, stock, recipe, None) {
            self.production.notice = reason;
            return;
        }
        if self.production.jobs.iter().any(|job| job.site == index) {
            self.production.notice = "Finish the current batch first.".into();
            return;
        }
        let food_input = if !stock.sandbox {
            let mut inputs = recipe.input.clone();
            if id == "wood"
                && self
                    .production
                    .growing_sites
                    .get(&index)
                    .is_some_and(|ground| ground.harvests > 0)
            {
                inputs.insert("tree_starts".into(), 4);
            }
            if let Some(material) = stock.missing(&inputs) {
                self.production.notice = format!(
                    "Not enough {} in supplies.",
                    catalog.materials[material].name
                );
                return;
            }
            Some(stock.reserve_available(&inputs))
        } else {
            None
        };
        self.production.jobs.push(Batch {
            site: index,
            recipe: id.into(),
            worker: None,
            phase: Phase::Pickup,
            work: 0.0,
            retry_at: 0.0,
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

    pub fn selected_production(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        clock: f64,
    ) -> Option<String> {
        let index = self.production.selected?;
        let site = self.plans.get(index)?;
        let name = &catalog.projects[&site.key].name;
        let recipes = self.recipes(catalog, index);
        let mut text = name.clone();
        if let Some(job) = self.production.jobs.iter().find(|job| job.site == index) {
            let recipe = &catalog.production[&job.recipe];
            let state = match job.phase {
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
            };
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

    pub fn tick_animals(&mut self, catalog: &Catalog, stock: &mut Stock, clock: f64, dt: f64) {
        let mut care = Vec::new();
        for (index, project) in self.plans.iter().enumerate() {
            let definition = &catalog.projects[&project.key];
            if project.removed || project.work < definition.work {
                continue;
            }
            let Some(ration) = catalog.animal_rations.get(&definition.kind) else {
                continue;
            };
            let pen = self.livestock.animals.entry(index).or_default();
            if stock.sandbox {
                continue;
            }
            pen.tick(ration, clock, dt);
            if pen.fed_days(ration) <= 0.25
                && self.utilities.potable_at(index + 1) >= ration.water
                && stock.available("fodder") >= ration.fodder
                && !self.production.jobs.iter().any(|job| job.site == index)
            {
                care.push((index, format!("care-{}", definition.kind)));
            }
        }
        for (index, id) in care {
            if stock.missing(&catalog.production[&id].input).is_none() {
                self.queue_batch(catalog, stock, index, &id);
            }
        }
    }

    pub fn tick_growth(
        &mut self,
        catalog: &Catalog,
        setup: &WorldSetup,
        stock: &mut Stock,
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
        for index in (0..self.production.jobs.len()).rev() {
            let job = &self.production.jobs[index];
            if job.phase == Phase::Growing || clock < job.retry_at {
                continue;
            }
            let Some(worker_index) = job.worker else {
                self.assign_producer(index, catalog, site, stock);
                self.production.jobs[index].retry_at = clock + 1.0;
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
                    let Some(path) = perimeter(facility.position, facility.size, position)
                        .into_iter()
                        .find_map(|cell| path(position, cell))
                    else {
                        self.production.jobs[index].retry_at = clock + 5.0;
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

    fn assign_producer(
        &mut self,
        job: usize,
        catalog: &Catalog,
        site: ConstructionSite,
        stock: &Stock,
    ) {
        let batch = &self.production.jobs[job];
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
            return;
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
        for (index, resident) in self.residents.iter().enumerate() {
            if resident.assignment.is_some()
                || self.gathering.workers_at_site(index)
                || self.production.has_worker(index)
                || self.farming.has_worker(index)
                || self.working_change(index)
                || self.working_water(index)
                || self.working_upkeep(index)
                || self.residents[index].health.task.is_some()
                || self.residents[index].town_work.active()
                || self.driver_booked(index)
            {
                continue;
            }
            if !returning
                && self
                    .craft_blocker(
                        catalog,
                        stock,
                        &catalog.production[&batch.recipe],
                        Some(index),
                    )
                    .is_some()
            {
                continue;
            }
            if phase == Phase::Harvest {
                if let Some(path) = perimeter(project.position, project.size, resident.position)
                    .into_iter()
                    .find_map(|cell| path(resident.position, cell))
                {
                    self.residents[index].path = path;
                    self.production.jobs[job].worker = Some(index);
                    return;
                }
                continue;
            }
            let supply = SUPPLY_SPOTS[index];
            if !returning
                && perimeter(project.position, project.size, supply.as_vec2())
                    .into_iter()
                    .all(|cell| path(supply.as_vec2(), cell).is_none())
            {
                continue;
            }
            let Some(path) = path(resident.position, supply) else {
                continue;
            };
            self.residents[index].path = path;
            self.production.jobs[job].worker = Some(index);
            return;
        }
    }
}

fn perimeter(start: IVec2, size: IVec2, from: Vec2) -> Vec<IVec2> {
    let mut cells = Vec::new();
    for z in 0..size.y {
        cells.extend([start + IVec2::new(-1, z), start + IVec2::new(size.x, z)]);
    }
    for x in 0..size.x {
        cells.extend([start + IVec2::new(x, -1), start + IVec2::new(x, size.y)]);
    }
    cells.sort_by(|a, b| {
        a.as_vec2()
            .distance_squared(from)
            .total_cmp(&b.as_vec2().distance_squared(from))
    });
    cells
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
        for step in 0..4_000 {
            let clock = f64::from(step) * 0.1;
            village.tick_services(&catalog, &setup, &mut stock, clock, 0.1);
            village.tick_production(&catalog, &mut stock, site, clock, 0.1);
            if village.production.jobs.is_empty() {
                break;
            }
        }
        assert!(village.production.jobs.is_empty());
        assert_eq!(stock.available("meals"), before + recipe.output["meals"]);
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
        village.tick_growth(&catalog, &setup, &mut stock, 61.0 * DAY, 60.0 * DAY);
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
