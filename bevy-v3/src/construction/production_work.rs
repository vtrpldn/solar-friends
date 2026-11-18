use crate::{
    catalog::ProductionRecipe,
    production::{Batch, Phase},
};

use super::*;

impl Construction {
    pub fn select_facility(&mut self, catalog: &Catalog, cell: IVec2) {
        self.production.selected = self
            .plans
            .iter()
            .enumerate()
            .find(|(_, plan)| {
                cell.cmpge(plan.position).all()
                    && cell.cmplt(plan.position + plan.size).all()
                    && plan.work >= catalog.projects[&plan.key].work
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
        let kind = &catalog.projects[&self.plans[index].key].kind;
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
        let Some((id, recipe)) = recipes.get(number).copied() else {
            return;
        };
        if self.production.jobs.iter().any(|job| job.site == index) {
            self.production.notice = "Finish the current batch first.".into();
            return;
        }
        if !stock.sandbox {
            if let Some(material) = stock.missing(&recipe.input) {
                self.production.notice = format!(
                    "Not enough {} in supplies.",
                    catalog.materials[material].name
                );
                return;
            }
            stock.reserve_available(&recipe.input);
        }
        self.production.jobs.push(Batch {
            site: index,
            recipe: id.clone(),
            worker: None,
            phase: Phase::Pickup,
            work: 0.0,
            retry_at: 0.0,
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
                Phase::Work if needs_power(recipe) && !self.utilities.powered(job.site) => {
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
                    if needs_power(recipe) && !self.utilities.powered(job.site) {
                        continue;
                    }
                    let job = &mut self.production.jobs[index];
                    job.work = (job.work + f64::from(dt)).min(recipe.work);
                    if job.work < recipe.work {
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
                    self.residents[worker_index].path = path;
                    self.production.jobs[index].phase = Phase::Return;
                }
                Phase::Return => {
                    stock.receive(&recipe.output);
                    self.production.jobs.remove(index);
                    self.production.notice = format!("{}: batch in stores.", recipe.name);
                }
            }
        }
    }

    fn assign_producer(&mut self, job: usize, catalog: &Catalog, site: ConstructionSite) {
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
                || self.trip.as_ref().is_some_and(|trip| trip.driver == index)
            {
                continue;
            }
            let supply = SUPPLY_SPOTS[index];
            if perimeter(project.position, project.size, supply.as_vec2())
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

fn needs_power(recipe: &ProductionRecipe) -> bool {
    !recipe.handcraft && matches!(recipe.kind.as_str(), "kitchen" | "workshop")
}
