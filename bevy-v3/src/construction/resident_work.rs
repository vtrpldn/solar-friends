use crate::{
    resident_animation::Motion,
    residents::NeedTask,
    setup::WorldSetup,
    weather::{DAY, HOUR, game_hour, weather_at},
};

use super::*;

const NAMES: [&str; 5] = ["Iara", "Bento", "Luz", "Cauã", "Nina"];

impl Construction {
    pub fn tick_health(
        &mut self,
        catalog: &Catalog,
        setup: &WorldSetup,
        stock: &mut Stock,
        site: ConstructionSite,
        clock: f64,
        dt: f32,
    ) {
        let temperature = weather_at(clock, setup.biome(), setup.seed()).temperature;
        for (index, resident) in self.residents.iter_mut().enumerate() {
            let working = resident
                .assignment
                .as_ref()
                .is_some_and(|job| job.activity != Activity::Walk)
                || self.gathering.workers_at_site(index)
                || self.production.has_worker(index)
                || self.farming.has_worker(index)
                || self.changes.values().any(|job| job.worker == Some(index));
            resident.health.decay(
                &catalog.residents[index],
                temperature,
                working,
                stock.sandbox,
                f64::from(dt),
            );
        }
        for index in 0..self.residents.len() {
            if self.residents[index].health.task.is_some() {
                self.step_need(index, catalog, stock, site, clock, dt);
            } else if self.residents[index].health.retry_at <= clock
                && !self.trip.as_ref().is_some_and(|trip| trip.driver == index)
                && !self.gathering.workers_at_site(index)
                && !self.production.has_worker(index)
                && !self.residents[index].town_work.active()
                && !self.farming.has_worker(index)
                && !self.working_change(index)
                && !self.residents[index]
                    .assignment
                    .as_ref()
                    .is_some_and(|job| job.activity == Activity::Carry)
            {
                self.choose_need(index, catalog, stock, site, clock);
                self.residents[index].health.retry_at = clock + 3.0;
            }
        }
    }

    fn choose_need(
        &mut self,
        index: usize,
        catalog: &Catalog,
        stock: &Stock,
        site: ConstructionSite,
        clock: f64,
    ) {
        let health = &self.residents[index].health;
        let profile = &catalog.residents[index];
        let mut options = health.pending(profile, clock, stock.has_meal());
        let hour = game_hour(clock);
        let night = ((clock + 4.0 * HOUR) / DAY).floor() as u64;
        let urgent = options.iter().any(|need| {
            matches!(
                need,
                Need::Hunger | Need::Hydration | Need::Bladder | Need::Bowels
            ) && health.levels[*need as usize] < 15.0
        });
        let ready_for_sleep = [Need::Bladder, Need::Bowels, Need::Hydration]
            .into_iter()
            .all(|need| health.levels[need as usize] > 20.0)
            && (health.levels[Need::Hunger as usize] > 20.0 || !stock.has_meal());
        if ready_for_sleep
            && (hour >= profile.temperament.bedtime || hour < 5.0)
            && health.last_night != Some(night)
        {
            options.insert(0, Need::Sleep);
        } else if !urgent && health.energy < 25.0 {
            options.insert(0, Need::Rest);
        }
        let mut selected = options.into_iter().find_map(|kind| {
            self.need_route(index, catalog, site, kind)
                .map(|(facility, path)| (kind, facility, path))
        });
        let idle = self.residents[index].assignment.is_none();
        if selected.is_none()
            && idle
            && let Some(water) = self.utilities.camp_water()
        {
            let kind = if water[0] < 30.0 && water[1] >= 1.0 {
                Some(Need::FilterWater)
            } else if water[0] < 30.0 && water[1] < 12.0 {
                Some(Need::FetchWater)
            } else {
                None
            };
            if let Some(kind) = kind
                && !self.residents.iter().any(|resident| {
                    resident
                        .health
                        .task
                        .as_ref()
                        .is_some_and(|task| task.kind == kind)
                })
            {
                selected = self
                    .need_route(index, catalog, site, kind)
                    .map(|(facility, path)| (kind, facility, path));
            }
        }
        let Some((kind, facility, path)) = selected else {
            return;
        };
        let mut task = NeedTask {
            kind,
            facility,
            elapsed: 0.0,
            duration: match kind {
                Need::Hydration => 2.0,
                Need::Bladder => 6.0,
                Need::Bowels => 10.0,
                Need::Hunger => 12.0,
                Need::Hygiene => 14.0,
                Need::Social => 18.0,
                Need::Fun => 22.0,
                Need::Sleep => (7.5 + 1.5 * (1.0 - health.energy / 100.0)) * HOUR,
                Need::Rest => {
                    let shift = &self.residents[index].town_work;
                    let construction_pending = self
                        .plans
                        .iter()
                        .any(|plan| !plan.removed && plan.work < catalog.projects[&plan.key].work);
                    let target = if shift.booked || shift.repeating || !construction_pending {
                        80.0
                    } else {
                        60.0
                    };
                    ((target - health.energy) / 0.45).max(1.0)
                }
                Need::FetchWater => 4.0,
                Need::FilterWater => 18.0,
            },
            returning: false,
            water: 0.0,
            partner: None,
        };
        if kind == Need::Social {
            let Some((partner, route)) = self.conversation_partner(index, catalog, site) else {
                return;
            };
            task.partner = Some(partner);
            let resident = &mut self.residents[partner];
            resident.health.task = Some(NeedTask {
                kind,
                partner: Some(index),
                facility: None,
                elapsed: 0.0,
                duration: 18.0,
                returning: false,
                water: 0.0,
            });
            resident.path = route;
        }
        let worker = &mut self.residents[index];
        if kind == Need::Sleep {
            worker.health.last_night = Some(night);
        }
        worker.assignment = None;
        worker.path = path;
        worker.health.task = Some(task);
    }

    fn need_route(
        &self,
        index: usize,
        catalog: &Catalog,
        site: ConstructionSite,
        kind: Need,
    ) -> Option<(Option<usize>, VecDeque<Vec2>)> {
        let ConstructionSite {
            terrain,
            land: _,
            camp,
        } = site;
        let resident = &self.residents[index];
        let path = |cell| self.resident_route(catalog, site, resident.position, cell);
        let fallback = |cell| path(cell).map(|route| (None, route));
        let facility_path = |id, loc, size| {
            if id == 0 {
                path(SUPPLY_SPOTS[index]).map(|path| (Some(id), path))
            } else {
                approach_points(loc, size, resident.position)
                    .into_iter()
                    .find_map(|cell| path(cell).map(|path| (Some(id), path)))
            }
        };
        let bank = || {
            let row = resident.position.y.clamp(-25.0, 88.0).round() as i32;
            [0, -2, 2, -4, 4, -7, 7, -10, 10]
                .into_iter()
                .find_map(|dz| {
                    let z = row + dz;
                    let (center, width) = terrain.river(f64::from(z - 32) * 2.0);
                    let col = (32.0 + (center + width + 3.0) / 2.0).ceil() as i32;
                    fallback(IVec2::new(col, z))
                })
        };
        match kind {
            Need::Hydration => self
                .utilities
                .water_sources()
                .find_map(|(id, loc, size)| facility_path(id, loc, size)),
            Need::Hunger | Need::FilterWater => fallback(SUPPLY_SPOTS[index]),
            Need::FetchWater => bank(),
            Need::Hygiene => self
                .utilities
                .wash_sources()
                .find_map(|(id, loc, size)| facility_path(id, loc, size))
                .or_else(bank),
            Need::Bladder | Need::Bowels => {
                let waste = if kind == Need::Bowels { 1.5 } else { 0.5 };
                self.utilities
                    .toilets(waste)
                    .find_map(|(id, loc, size)| facility_path(id, loc, size))
                    .or_else(|| fallback(camp + IVec2::new(index as i32 - 3, 3)))
            }
            Need::Rest | Need::Sleep => self.rest_route(index, catalog, site, &path),
            Need::Fun | Need::Social => fallback(camp + IVec2::new(index as i32 - 2, 1)),
        }
    }

    fn completed_shelter<'a>(&self, catalog: &'a Catalog, index: usize) -> Option<&'a Project> {
        let plan = self.plans.get(index)?;
        let definition = catalog.projects.get(&plan.key)?;
        (!plan.removed
            && plan.work >= definition.work
            && (definition.kind == "home" || plan.key.starts_with("canvas-tent")))
        .then_some(definition)
    }

    pub(super) fn valid_homes(&self, catalog: &Catalog) -> bool {
        self.residents.iter().all(|resident| {
            resident.home.is_none_or(|home| {
                self.completed_shelter(catalog, home)
                    .is_some_and(|definition| {
                        definition.kind == "home"
                            && self
                                .residents
                                .iter()
                                .filter(|other| other.home == Some(home))
                                .count()
                                <= definition.beds.unwrap_or(2)
                    })
            })
        })
    }

    pub fn assign_selected_home(
        &mut self,
        index: usize,
        catalog: &Catalog,
    ) -> Result<String, &'static str> {
        let home = self
            .production
            .selected
            .ok_or("Select a completed home on the map.")?;
        let definition = self
            .completed_shelter(catalog, home)
            .filter(|definition| definition.kind == "home" && !self.changes.contains_key(&home))
            .ok_or("Select a completed home on the map.")?;
        if !self.utilities.enabled(home) {
            return Err("Reopen this home before assigning residents.");
        }
        let people = self
            .residents
            .iter()
            .enumerate()
            .filter(|&(id, other)| id != index && other.home == Some(home))
            .count();
        if people >= definition.beds.unwrap_or(2) {
            return Err("This home has no free beds.");
        }
        self.residents[index].home = Some(home);
        Ok(format!(
            "{} assigned to {} #{}.",
            NAMES[index],
            definition.name,
            home + 1
        ))
    }

    pub fn clear_home(&mut self, index: usize) -> String {
        self.residents[index].home = None;
        format!("{} can use any free bed.", NAMES[index])
    }

    fn rest_route(
        &self,
        index: usize,
        catalog: &Catalog,
        site: ConstructionSite,
        path: &impl Fn(IVec2) -> Option<VecDeque<Vec2>>,
    ) -> Option<(Option<usize>, VecDeque<Vec2>)> {
        let resident = &self.residents[index];
        let mut choices = self
            .plans
            .iter()
            .enumerate()
            .filter_map(|(id, plan)| {
                let definition = self.completed_shelter(catalog, id)?;
                if self.changes.contains_key(&id) || !self.utilities.enabled(id) {
                    return None;
                }
                let occupied = self
                    .residents
                    .iter()
                    .enumerate()
                    .filter(|&(other, worker)| {
                        other != index
                            && (worker.home == Some(id)
                                || worker.health.task.as_ref().is_some_and(|task| {
                                    matches!(task.kind, Need::Rest | Need::Sleep)
                                        && task.facility == Some(id + 1)
                                }))
                    })
                    .count();
                (occupied < definition.beds.unwrap_or(2)).then_some((id, plan, definition))
            })
            .collect::<Vec<_>>();
        choices.sort_by(|(a, left, a_def), (b, right, b_def)| {
            (resident.home != Some(*a), a_def.kind != "home")
                .cmp(&(resident.home != Some(*b), b_def.kind != "home"))
                .then_with(|| {
                    left.position
                        .as_vec2()
                        .distance_squared(resident.position)
                        .total_cmp(&right.position.as_vec2().distance_squared(resident.position))
                })
        });
        choices
            .into_iter()
            .find_map(|(id, plan, _)| {
                let start = plan.position;
                let size = plan.size;
                let front = start
                    + match plan.rotation {
                        0 => IVec2::new(size.x / 2, size.y),
                        1 => IVec2::new(size.x, size.y / 2),
                        2 => IVec2::new(size.x / 2, -1),
                        _ => IVec2::new(-1, size.y / 2),
                    };
                path(front).map(|route| (Some(id + 1), route))
            })
            .or_else(|| {
                let camp = site.camp;
                path(camp + IVec2::new((index % 2) as i32 * 2, 0))
                    .or_else(|| {
                        approach_points(
                            camp + IVec2::new(-1, -3),
                            IVec2::new(5, 3),
                            resident.position,
                        )
                        .into_iter()
                        .find_map(path)
                    })
                    .map(|route| (None, route))
            })
    }

    fn conversation_partner(
        &self,
        index: usize,
        catalog: &Catalog,
        site: ConstructionSite,
    ) -> Option<(usize, VecDeque<Vec2>)> {
        self.residents
            .iter()
            .enumerate()
            .filter(|(id, resident)| {
                *id != index
                    && resident.assignment.is_none()
                    && resident.health.task.is_none()
                    && resident.health.energy >= 35.0
                    && resident.health.levels[Need::Social as usize]
                        < catalog.residents[*id].temperament.accepts_at
                    && !self.gathering.workers_at_site(*id)
                    && !self.production.has_worker(*id)
                    && !resident.town_work.active()
                    && !self.farming.has_worker(*id)
                    && !self.working_change(*id)
                    && !self.trip.as_ref().is_some_and(|trip| trip.driver == *id)
            })
            .find_map(|(id, resident)| {
                let target = site.camp + IVec2::new(index as i32 - 2, 2);
                self.resident_route(catalog, site, resident.position, target)
                    .map(|path| (id, path))
            })
    }

    pub(super) fn resident_route(
        &self,
        catalog: &Catalog,
        site: ConstructionSite,
        from: Vec2,
        to: IVec2,
    ) -> Option<VecDeque<Vec2>> {
        route(
            from,
            to,
            |cell| self.blocked(catalog, site.terrain, site.land, site.camp, cell),
            access_road,
        )
    }

    fn step_need(
        &mut self,
        index: usize,
        catalog: &Catalog,
        stock: &mut Stock,
        site: ConstructionSite,
        clock: f64,
        dt: f32,
    ) {
        let resident = &mut self.residents[index];
        let mut task = resident.health.task.take().expect("active resident task");
        resident.move_along_path(dt, task.returning);
        if !resident.path.is_empty() {
            resident.health.task = Some(task);
            return;
        }
        if let Some(partner) = task.partner
            && !self.residents[partner].path.is_empty()
        {
            self.residents[index].health.task = Some(task);
            return;
        }
        let resident = &mut self.residents[index];
        task.elapsed += f64::from(dt);
        if matches!(task.kind, Need::Sleep | Need::Rest) {
            let recovery = if task.kind == Need::Sleep { 0.13 } else { 0.45 };
            resident.health.energy = (resident.health.energy + recovery * f64::from(dt)).min(100.0);
        }
        if task.elapsed < task.duration {
            resident.health.task = Some(task);
            return;
        }
        let health = &mut resident.health;
        let levels = &mut health.levels;
        match task.kind {
            Need::Hydration => {
                if task
                    .facility
                    .is_some_and(|id| self.utilities.drink(id, 0.5))
                {
                    levels[Need::Hydration as usize] =
                        (levels[Need::Hydration as usize] + 20.0).min(100.0);
                }
            }
            Need::Hunger => {
                if stock.eat() {
                    health.last_meal = Some(clock);
                    levels[Need::Hunger as usize] = 90.0;
                    levels[Need::Bladder as usize] =
                        (levels[Need::Bladder as usize] - 5.0).max(0.0);
                    levels[Need::Bowels as usize] = (levels[Need::Bowels as usize] - 4.0).max(0.0);
                }
            }
            Need::Hygiene => {
                if let Some(id) = task.facility {
                    if self.utilities.wash(id) {
                        levels[Need::Hygiene as usize] = 95.0;
                    }
                } else {
                    levels[Need::Hygiene as usize] = 78.0;
                }
            }
            Need::Bladder | Need::Bowels => {
                let waste = if task.kind == Need::Bowels { 1.5 } else { 0.5 };
                if task
                    .facility
                    .is_none_or(|id| self.utilities.receive_sewage(id, waste))
                {
                    levels[task.kind as usize] = 95.0;
                    levels[Need::Hygiene as usize] =
                        (levels[Need::Hygiene as usize] - 8.0).max(0.0);
                }
            }
            Need::Social => {
                levels[Need::Social as usize] = 95.0;
                levels[Need::Fun as usize] = (levels[Need::Fun as usize] + 15.0).min(100.0);
                if let Some(partner) = task.partner {
                    health.friendships[partner] = (health.friendships[partner] + 4).min(100);
                }
            }
            Need::Fun => levels[Need::Fun as usize] = 95.0,
            Need::FilterWater => self.utilities.purify_camp_water(),
            Need::FetchWater if task.returning => self.utilities.put_camp_water(task.water),
            Need::FetchWater => {
                let from = resident.position;
                if let Some(path) = self.resident_route(catalog, site, from, SUPPLY_SPOTS[index]) {
                    task.water = self.utilities.carry_river_water(12.0);
                    task.returning = true;
                    self.residents[index].path = path;
                    self.residents[index].health.task = Some(task);
                }
            }
            Need::Rest | Need::Sleep => {}
        }
        self.residents[index].health.retry_at = clock + 3.0;
    }

    pub fn resident_motion(&self, index: usize) -> Motion {
        let worker = &self.residents[index];
        if let Some(task) = &worker.health.task {
            if !worker.path.is_empty() {
                return if task.returning {
                    Motion::CarryWalk
                } else {
                    Motion::Walk
                };
            }
            return match task.kind {
                Need::Hunger | Need::Hydration => Motion::Eat,
                Need::Hygiene => Motion::Wash,
                Need::Social => Motion::Chat,
                Need::Fun => Motion::Stretch,
                Need::Sleep | Need::Rest => Motion::Rest,
                Need::FilterWater | Need::FetchWater => Motion::Work,
                _ => Motion::Idle,
            };
        }
        if let Some(job) = &worker.assignment {
            return match job.activity {
                Activity::Build => Motion::Work,
                Activity::Carry => Motion::CarryWalk,
                _ => Motion::Walk,
            };
        }
        if let Some(job) = self
            .production
            .jobs
            .iter()
            .find(|job| job.worker == Some(index))
        {
            return match job.phase {
                crate::production::Phase::Approach | crate::production::Phase::Return
                    if !worker.path.is_empty() =>
                {
                    Motion::CarryWalk
                }
                crate::production::Phase::Work => Motion::Work,
                _ if !worker.path.is_empty() => Motion::Walk,
                _ => Motion::Idle,
            };
        }
        if let Some(job) = self
            .gathering
            .orders
            .values()
            .find(|job| job.worker == Some(index))
        {
            return match job.phase {
                GatherPhase::Return => Motion::CarryWalk,
                GatherPhase::Work => Motion::Chop,
                _ => Motion::Walk,
            };
        }
        if !worker.path.is_empty() {
            Motion::Walk
        } else {
            Motion::Idle
        }
    }

    pub fn resident_sleeping(&self, index: usize) -> bool {
        self.residents[index]
            .health
            .task
            .as_ref()
            .is_some_and(|task| matches!(task.kind, Need::Rest | Need::Sleep) && task.elapsed > 0.0)
    }

    pub fn resident_status(&self, catalog: &Catalog, selected: usize) -> String {
        self.residents
            .iter()
            .enumerate()
            .map(|(index, worker)| {
                let action = if worker.town_work.active() {
                    worker.town_work.status()
                } else if self.driver_away(index) {
                    "In town"
                } else if let Some(task) = &worker.health.task {
                    task.kind.label()
                } else if let Some(job) = &worker.assignment {
                    match job.activity {
                        Activity::Collect => "Collecting materials",
                        Activity::Carry => "Hauling",
                        Activity::Walk => "Walking to site",
                        Activity::Build => "Building",
                    }
                } else if self.production.has_worker(index) {
                    "In production"
                } else if self.gathering.workers_at_site(index) {
                    "Gathering"
                } else {
                    "Available"
                };
                let health = &worker.health;
                let profile = &catalog.residents[index];
                let home = worker.home.map_or_else(
                    || "Any free bed".to_owned(),
                    |id| format!("{} #{}", catalog.projects[&self.plans[id].key].name, id + 1),
                );
                let marker = if index == selected { "› " } else { "" };
                format!(
                    "{marker}{} · {} · {home}\n{} · Energy {:.0}% · Water {:.0}% · Food {:.0}%\n{}",
                    NAMES[index],
                    profile.role,
                    action,
                    health.energy,
                    health.levels[Need::Hydration as usize],
                    health.levels[Need::Hunger as usize],
                    profile.bio
                )
            })
            .collect::<Vec<_>>()
            .join("\n\n")
    }
}

pub(super) fn approach_points(start: IVec2, size: IVec2, from: Vec2) -> Vec<IVec2> {
    let mut candidates = Vec::new();
    for row in 0..size.y {
        candidates.extend([start + IVec2::new(-1, row), start + IVec2::new(size.x, row)]);
    }
    for column in 0..size.x {
        candidates.extend([
            start + IVec2::new(column, -1),
            start + IVec2::new(column, size.y),
        ]);
    }
    candidates.sort_by(|a, b| {
        a.as_vec2()
            .distance_squared(from)
            .total_cmp(&b.as_vec2().distance_squared(from))
    });
    candidates
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn home_assignments_reserve_beds_and_guide_residents_at_night() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let camp = IVec2::new(36, 36);
        let terrain = setup.terrain().with_camp(camp);
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp,
        };
        let mut stock = Stock::for_start(&setup, &catalog);
        stock.sandbox = true;
        let mut construction = Construction::default();
        for target in [IVec2::new(44, 36), IVec2::new(52, 36)] {
            construction.selection = Some("home-cottage".into());
            construction.plan(
                &catalog,
                &mut stock,
                site,
                target,
                TownClock {
                    seconds: 0.0,
                    round_trip_km: 12,
                },
            );
        }
        construction.select_facility(IVec2::new(52, 36));
        construction.assign_selected_home(0, &catalog).unwrap();
        assert_eq!(
            construction.assign_selected_home(1, &catalog),
            Err("This home has no free beds.")
        );
        construction.residents[0].position = Vec2::new(42.0, 40.0);
        construction.residents[1].position = Vec2::new(50.0, 41.0);
        let night = 15.0 * HOUR;
        construction.choose_need(0, &catalog, &stock, site, night);
        construction.choose_need(1, &catalog, &stock, site, night);
        assert_eq!(
            construction.residents[0]
                .health
                .task
                .as_ref()
                .unwrap()
                .facility,
            Some(2)
        );
        assert_eq!(
            construction.residents[1]
                .health
                .task
                .as_ref()
                .unwrap()
                .facility,
            Some(1)
        );
        let json = serde_json::to_string(&construction).unwrap();
        let mut saved: Construction = serde_json::from_str(&json).unwrap();
        assert!(saved.valid_homes(&catalog));
        assert_eq!(saved.residents[0].home, Some(1));
        saved.clear_home(0);
        assert!(saved.residents[0].home.is_none());
    }

    #[test]
    fn thirsty_resident_walks_to_water_and_consumes_half_a_liter() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let terrain = setup.terrain();
        let land = Land::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut village = Construction::default();
        village.residents[0].health.levels[Need::Hydration as usize] = 20.0;
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        village.tick_services(&catalog, &setup, &mut stock, 0.0, 0.1);
        let start = village.residents[0].position;
        for tick in 0..250 {
            village.tick_health(
                &catalog,
                &setup,
                &mut stock,
                site,
                f64::from(tick) * 0.1,
                0.1,
            );
            if village.utilities.camp_water().unwrap()[0] < 40.0 {
                break;
            }
        }
        assert_ne!(village.residents[0].position, start);
        assert_eq!(village.utilities.camp_water().unwrap()[0], 39.5);
        assert!(village.residents[0].health.levels[Need::Hydration as usize] > 38.0);
    }
}
