use crate::{
    catalog::ProductionRecipe,
    production::{Batch, Phase},
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
        self.production.notice.clear();
    }

    fn recipes<'a>(
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
        catalog
            .production
            .iter()
            .filter(|(_, recipe)| recipe.kind == *kind)
            .collect()
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
        if keyboard.just_pressed(KeyCode::KeyC) && !recipes.is_empty() {
            self.production.open = !self.production.open;
        }
        if !self.production.open || self.menu {
            return;
        }
        let Some(number) = PAGE_KEYS.iter().position(|key| keyboard.just_pressed(*key)) else {
            return;
        };
        let Some((id, _)) = recipes.get(number).copied() else {
            return;
        };
        self.queue_batch(catalog, stock, index, id);
    }

    fn queue_batch(&mut self, catalog: &Catalog, stock: &mut Stock, index: usize, id: &str) {
        let recipe = &catalog.production[id];
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
        if self.production.jobs.iter().any(|job| job.site == index) {
            self.production.notice = "Finish the current batch first.".into();
            return;
        }
        let food_input = if !stock.sandbox {
            if let Some(material) = stock.missing(&recipe.input) {
                self.production.notice = format!(
                    "Not enough {} in supplies.",
                    catalog.materials[material].name
                );
                return;
            }
            Some(stock.reserve_available(&recipe.input))
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
        });
        self.production.notice.clear();
    }

    pub fn selected_production(&self, catalog: &Catalog) -> Option<String> {
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
                Phase::Work
                    if needs_power(&job.recipe, recipe) && !self.utilities.powered(job.site) =>
                {
                    "Waiting for power".into()
                }
                Phase::Work if recipe.handcraft => {
                    format!("{:.0}% crafted", job.work / recipe.work * 100.0)
                }
                Phase::Work => format!("{:.0}% worked", job.work / recipe.work * 100.0),
                Phase::Return => "Carrying output to stores".into(),
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
        if self.production.open {
            for (index, (_, recipe)) in recipes.iter().enumerate().take(PAGE_KEYS.len()) {
                text.push_str(&format!("\n{} {}", index + 1, recipe.name));
            }
            text.push_str("\nC Close recipes");
        } else if !recipes.is_empty() && !self.menu {
            text.push_str(" · C Recipes");
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

    pub(super) fn valid_production(&self, catalog: &Catalog) -> bool {
        self.production.jobs.len() <= self.plans.len()
            && self.production.jobs.iter().all(|job| {
                self.plans.get(job.site).is_some_and(|site| {
                    let Some(definition) = catalog.projects.get(&site.key) else {
                        return false;
                    };
                    site.work >= definition.work
                        && catalog.production.get(&job.recipe).is_some_and(|recipe| {
                            definition.kind == recipe.kind
                                && (0.0..=recipe.work).contains(&job.work)
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
            if clock < job.retry_at {
                continue;
            }
            let Some(worker_index) = job.worker else {
                self.assign_producer(index, catalog, site);
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
                    if needs_power(&job.recipe, recipe) && !self.utilities.powered(job.site) {
                        continue;
                    }
                    let animal = catalog.animal_rations.get(&recipe.kind);
                    if job.recipe.starts_with("care-")
                        && let Some(ration) = animal
                        && job.water_to_deliver == 0.0
                    {
                        if !stock.sandbox && !self.utilities.drink(job.site + 1, ration.water) {
                            continue;
                        }
                        self.production.jobs[index].water_to_deliver = ration.water;
                    }
                    let job = &mut self.production.jobs[index];
                    job.work = (job.work + f64::from(dt)).min(recipe.work);
                    if job.work < recipe.work {
                        continue;
                    }
                    if job.recipe == "cold_storage" {
                        self.utilities.install_cold_storage(job.site);
                        self.production.jobs.remove(index);
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

    fn assign_producer(&mut self, job: usize, catalog: &Catalog, site: ConstructionSite) {
        let returning = self.production.jobs[job].phase == Phase::Return;
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
                || self.residents[index].health.task.is_some()
                || self.residents[index].town_work.active()
                || self.trip.as_ref().is_some_and(|trip| trip.driver == index)
            {
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

fn needs_power(id: &str, recipe: &ProductionRecipe) -> bool {
    !recipe.handcraft
        && id != "cold_storage"
        && matches!(recipe.kind.as_str(), "kitchen" | "workshop")
}
