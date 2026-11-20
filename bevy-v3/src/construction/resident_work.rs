use crate::{
    resident_animation::Motion,
    residents::{
        NeedTask,
        mind::{Conversation, MemoryKind},
    },
    setup::WorldSetup,
    weather::{DAY, HOUR, game_hour, weather_at},
};

use super::*;

pub(crate) struct HomeOption<'a> {
    pub id: usize,
    pub name: &'a str,
    pub position: IVec2,
    pub occupants: usize,
    pub beds: usize,
    pub assigned: bool,
    pub open: bool,
}

pub(super) const NAMES: [&str; 5] = ["Iara", "Bento", "Luz", "Cauã", "Nina"];

fn latrine_sites(terrain: &Terrain, camp: IVec2, index: usize) -> impl Iterator<Item = IVec2> + '_ {
    (6..=8).flat_map(move |radius| {
        (0..12).filter_map(move |direction| {
            let angle = ((direction + index) % 12) as f64 * std::f64::consts::TAU / 12.0;
            let (sin, cos) = angle.sin_cos();
            let cell = camp
                + IVec2::new(
                    (cos * f64::from(radius)).round() as i32,
                    (sin * f64::from(radius)).round() as i32,
                );
            let Vec2 { x, y: z } = world_position(cell.x as f32, cell.y as f32);
            let (river_center, river_width) = terrain.river(f64::from(z));
            (cell.cmpge(IVec2::splat(-30)).all()
                && cell.cmple(IVec2::splat(93)).all()
                && cell.distance_squared(STOCKPILE) >= 25
                && (f64::from(x) - river_center).abs() > river_width + 6.9)
                .then_some(cell)
        })
    })
}

fn recreation_activity(plans: &[Blueprint], task: &NeedTask) -> (Motion, &'static str) {
    match task
        .facility
        .and_then(|id| id.checked_sub(1))
        .and_then(|id| plans.get(id))
        .map(|plan| plan.key.as_str())
    {
        Some("fire-circle") => (Motion::FireSit, "Sitting by the fire"),
        Some("reading-room" | "outdoor-classroom" | "community-hall") => {
            (Motion::Read, "Reading for a while")
        }
        _ => (Motion::Stretch, "Taking a stretching break"),
    }
}

struct RestPose {
    position: Vec2,
    yaw: f32,
    visible: bool,
    motion: Motion,
}

impl Construction {
    fn resident_working(&self, index: usize) -> bool {
        self.residents[index]
            .assignment
            .as_ref()
            .is_some_and(|job| job.activity != Activity::Walk)
            || self.gathering.workers_at_site(index)
            || self.production.has_worker(index)
            || self.farming.has_worker(index)
            || self.changes.values().any(|job| job.worker == Some(index))
    }

    pub fn basic_needs_overview(&self, stock: &Stock, temperature: f64) -> String {
        let present = self
            .residents
            .iter()
            .enumerate()
            .filter(|(index, _)| !self.away_for_work(*index) && !self.driver_away(*index));
        let thirsty = present
            .clone()
            .filter(|(_, resident)| resident.health.levels[Need::Hydration as usize] < 30.0)
            .count();
        let daily_water = present
            .clone()
            .map(|(index, _)| {
                crate::residents::daily_drinking_liters(temperature, self.resident_working(index))
            })
            .sum();
        let sanitation = self.residents_needing_sanitation();
        let services =
            self.utilities
                .service_overview(thirsty, sanitation, daily_water, stock.sandbox);
        let portions = stock.food_portions();
        let food = if stock.sandbox {
            "Unlimited".into()
        } else if portions == 0 {
            "No ready food".into()
        } else {
            let days = f64::from(portions) / (self.residents.len() as f64 * 3.0);
            format!("{portions} portions · {days:.1} days estimated")
        };
        format!("{services}\nFood · {food}")
    }

    pub fn residents_needing_sanitation(&self) -> usize {
        self.residents
            .iter()
            .enumerate()
            .filter(|(index, resident)| {
                !self.away_for_work(*index)
                    && !self.driver_away(*index)
                    && [Need::Bladder, Need::Bowels, Need::Hygiene]
                        .into_iter()
                        .any(|need| resident.health.levels[need as usize] < 30.0)
            })
            .count()
    }

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
        for index in 0..self.residents.len() {
            if self.away_for_work(index) {
                continue;
            }
            let working = self.resident_working(index);
            let resident = &mut self.residents[index];
            let aspiration = &catalog.residents[index].aspiration;
            if !resident.health.mind.fulfilled
                && self.plans.iter().any(|plan| {
                    !plan.removed
                        && plan.key == aspiration.key
                        && plan.work >= catalog.projects[&plan.key].work
                })
            {
                resident.health.mind.fulfilled = true;
                resident.health.mind.remember(
                    MemoryKind::Milestone,
                    format!("{} is built. {}", aspiration.label, aspiration.reason),
                    clock,
                    None,
                );
            }
            resident.health.decay(
                &catalog.residents[index],
                temperature,
                working,
                stock.sandbox,
                f64::from(dt),
            );
        }
        for index in 0..self.residents.len() {
            let health = &mut self.residents[index].health;
            let timed_out = health.task.as_mut().is_some_and(|task| {
                !matches!(
                    task.kind,
                    Need::Sleep | Need::Rest | Need::FetchWater | Need::FilterWater
                ) && clock - *task.started_at.get_or_insert(clock) > 240.0
            });
            if timed_out {
                self.cancel_need(index, clock);
                self.residents[index].health.retry_at = clock + 15.0;
                continue;
            }
            if health
                .task
                .as_ref()
                .is_some_and(|task| matches!(task.kind, Need::Hygiene | Need::Social | Need::Fun))
                && [Need::Hunger, Need::Bladder, Need::Bowels, Need::Hydration]
                    .into_iter()
                    .any(|need| {
                        health.levels[need as usize] < 10.0
                            && (need != Need::Hunger || stock.has_meal())
                    })
            {
                self.cancel_need(index, clock);
            }
        }
        for index in 0..self.residents.len() {
            if self.residents[index].health.task.is_some() {
                self.step_need(index, catalog, stock, site, clock, dt);
            } else if self.residents[index].health.retry_at <= clock
                && !self.driver_booked(index)
                && !self.gathering.workers_at_site(index)
                && !self.production.has_worker(index)
                && !self.residents[index].town_work.active()
                && !self.farming.has_worker(index)
                && !self.working_change(index)
                && !self.working_water(index)
                && !self.working_upkeep(index)
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

    fn cancel_need(&mut self, index: usize, clock: f64) {
        let partner = self.residents[index]
            .health
            .task
            .as_ref()
            .and_then(|task| task.partner);
        let partner = partner.filter(|&other| {
            other != index
                && self.residents[other]
                    .health
                    .task
                    .as_ref()
                    .is_some_and(|task| task.kind == Need::Social && task.partner == Some(index))
        });
        for id in [Some(index), partner].into_iter().flatten() {
            let worker = &mut self.residents[id];
            worker.health.task = None;
            worker.health.retry_at = clock;
            worker.path.clear();
            worker.paused_waypoint = None;
            worker.route_retry_ticks = 0;
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
            if kind == Need::Social {
                if health.mind.quiet_until > clock
                    || health.energy < 35.0
                    || (self.residents[index].assignment.is_some()
                        && health.levels[Need::Social as usize] >= 35.0)
                {
                    return None;
                }
                let (partner, their_path) =
                    self.conversation_partner(index, catalog, site, clock)?;
                let (_, path) = self.need_route(index, catalog, site, kind)?;
                Some((kind, None, path, Some((partner, their_path))))
            } else {
                self.need_route(index, catalog, site, kind)
                    .map(|(facility, path)| (kind, facility, path, None))
            }
        });
        let idle = self.residents[index].assignment.is_none();
        if selected.is_none()
            && idle
            && !self.water_jobs.contains_key(&0)
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
                    .map(|(facility, path)| (kind, facility, path, None));
            }
        }
        let Some((kind, facility, path, partner_route)) = selected else {
            return;
        };
        if let Some((partner, their_path)) = partner_route {
            self.start_conversation(catalog, stock, [(index, path), (partner, their_path)]);
            return;
        }
        let task = NeedTask {
            kind,
            facility,
            elapsed: 0.0,
            started_at: None,
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
            conversation: None,
        };
        let worker = &mut self.residents[index];
        if kind == Need::Sleep {
            worker.health.last_night = Some(night);
        }
        worker.assignment = None;
        worker.leisure.visit = None;
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
        let path = |cell| {
            if kind == Need::Fun && self.recreation_spot_taken(index, cell) {
                return None;
            }
            self.resident_route(catalog, site, resident.position, cell)
        };
        let fallback = |cell| path(cell).map(|route| (None, route));
        let facility_path = |id: usize, loc, size| {
            if id == 0 {
                path(SUPPLY_SPOTS[index]).map(|path| (Some(id), path))
            } else {
                let entrance = self
                    .plans
                    .get(id - 1)
                    .and_then(|plan| building_entrance(plan, &catalog.projects[&plan.key]));
                entrance
                    .and_then(path)
                    .or_else(|| {
                        approach_points(loc, size, resident.position)
                            .into_iter()
                            .filter(|cell| Some(*cell) != entrance)
                            .find_map(path)
                    })
                    .map(|path| (Some(id), path))
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
        let available_service = |mut sources: Vec<(usize, IVec2, IVec2)>| {
            let favorites = &catalog.residents[index].favorites;
            sources.retain(|&(id, _, _)| {
                id == 0
                    || !self.residents.iter().enumerate().any(|(other, worker)| {
                        other != index
                            && worker
                                .health
                                .task
                                .as_ref()
                                .is_some_and(|task| task.facility == Some(id))
                    })
            });
            let score = |(id, location, _): (usize, IVec2, IVec2)| {
                let kind = if id == 0 {
                    "camp"
                } else {
                    self.plans
                        .get(id - 1)
                        .map_or("", |plan| catalog.projects[&plan.key].kind.as_str())
                };
                let preference = favorites
                    .iter()
                    .position(|key| key == kind)
                    .unwrap_or(favorites.len());
                let target = if id == 0 {
                    SUPPLY_SPOTS[index]
                } else {
                    location
                };
                (
                    preference,
                    resident.position.distance_squared(target.as_vec2()),
                )
            };
            sources.sort_by(|&a, &b| {
                let (a_rank, a_distance) = score(a);
                let (b_rank, b_distance) = score(b);
                a_rank.cmp(&b_rank).then(a_distance.total_cmp(&b_distance))
            });
            sources
                .into_iter()
                .find_map(|(id, loc, size)| facility_path(id, loc, size))
        };
        match kind {
            Need::Hydration => available_service(self.utilities.water_sources().collect()),
            Need::Hunger | Need::FilterWater => fallback(SUPPLY_SPOTS[index]),
            Need::FetchWater => bank(),
            Need::Hygiene => {
                available_service(self.utilities.wash_sources().collect()).or_else(bank)
            }
            Need::Bladder | Need::Bowels => {
                let waste = if kind == Need::Bowels { 1.5 } else { 0.5 };
                available_service(self.utilities.toilets(waste).collect())
                    .or_else(|| latrine_sites(terrain, camp, index).find_map(fallback))
            }
            Need::Rest | Need::Sleep => self.rest_route(index, catalog, site, &path),
            Need::Fun => {
                let sites = self.plans.iter().enumerate().filter_map(|(id, plan)| {
                    let definition = &catalog.projects[&plan.key];
                    (!plan.removed
                        && plan.work >= definition.work
                        && !self.changes.contains_key(&id)
                        && self.utilities.enabled(id)
                        && matches!(
                            definition.kind.as_str(),
                            "square"
                                | "reading-room"
                                | "outdoor-classroom"
                                | "exercise-garden"
                                | "volleyball-court"
                                | "community-hall"
                                | "picnic-table"
                                | "garden-bench"
                                | "fire-circle"
                                | "hammock"
                        ))
                    .then_some((id + 1, plan.position, plan.size))
                });
                available_service(sites.collect())
                    .or_else(|| fallback(camp + IVec2::new(index as i32 - 2, 1)))
            }
            Need::Social => fallback(camp + IVec2::new(index as i32 - 2, 1)),
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
        self.assign_home(index, catalog, home)
    }

    pub fn home_options<'a>(
        &'a self,
        catalog: &'a Catalog,
        resident: usize,
    ) -> impl Iterator<Item = HomeOption<'a>> + 'a {
        self.plans
            .iter()
            .enumerate()
            .filter_map(move |(home, plan)| {
                let definition = self.completed_shelter(catalog, home)?;
                if definition.kind != "home" || self.changes.contains_key(&home) {
                    return None;
                }
                let occupants = self
                    .residents
                    .iter()
                    .filter(|other| other.home == Some(home))
                    .count();
                Some(HomeOption {
                    id: home,
                    name: definition.name.as_str(),
                    position: plan.position,
                    occupants,
                    beds: definition.beds.unwrap_or(2),
                    assigned: self.residents[resident].home == Some(home),
                    open: self.utilities.enabled(home),
                })
            })
    }

    pub fn assign_home(
        &mut self,
        index: usize,
        catalog: &Catalog,
        home: usize,
    ) -> Result<String, &'static str> {
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

    fn resident_home_summary(&self, index: usize, catalog: &Catalog) -> String {
        let Some(home) = self.residents[index].home else {
            return if self.home_options(catalog, index).next().is_some() {
                "Unassigned · uses available shelter".into()
            } else {
                "Complete a house to assign a permanent home.".into()
            };
        };
        let housemates = self
            .residents
            .iter()
            .enumerate()
            .filter(|(other, worker)| *other != index && worker.home == Some(home))
            .map(|(other, _)| NAMES[other])
            .collect::<Vec<_>>();
        let name = &catalog.projects[&self.plans[home].key].name;
        let occupancy = if housemates.is_empty() {
            "Lives here alone.".to_owned()
        } else {
            format!("Lives with {}.", housemates.join(", "))
        };
        format!("{name} #{} · {occupancy}", home + 1)
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
            .find_map(|(id, plan, definition)| {
                let front = building_entrance(plan, definition)?;
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
        clock: f64,
    ) -> Option<(usize, VecDeque<Vec2>)> {
        self.willing_partners(index, catalog, clock)
            .into_iter()
            .find_map(|id| {
                let target = site.camp + IVec2::new(index as i32 - 2, 2);
                self.resident_route(catalog, site, self.residents[id].position, target)
                    .map(|path| (id, path))
            })
    }

    fn willing_partners(&self, index: usize, catalog: &Catalog, clock: f64) -> Vec<usize> {
        let initiator = &self.residents[index];
        let score = |id: usize| {
            let other = &self.residents[id];
            let shared = catalog.residents[id]
                .interests
                .iter()
                .filter(|topic| catalog.residents[index].interests.contains(topic))
                .count() as f64;
            (100.0 - other.health.levels[Need::Social as usize]) / 10.0
                + f64::from(initiator.health.friendships[id]) / 20.0
                + shared * 2.0
                - f64::from(other.position.distance(initiator.position)) / 3.0
        };
        let mut partners = self
            .residents
            .iter()
            .enumerate()
            .filter(|&(id, resident)| {
                let health = &resident.health;
                let social = health.levels[Need::Social as usize];
                let willing = if let Some(job) = &resident.assignment {
                    job.activity != Activity::Carry && social < 35.0
                } else {
                    let threshold = catalog.residents[id].temperament.accepts_at
                        + if health.friendships[index] >= 64 {
                            10.0
                        } else {
                            0.0
                        };
                    social < threshold
                        || (initiator.health.levels[Need::Social as usize] < 15.0
                            && health.energy >= 45.0)
                };
                id != index
                    && willing
                    && health.task.is_none()
                    && health.energy >= 35.0
                    && health.mind.quiet_until <= clock
                    && [Need::Hunger, Need::Bladder, Need::Bowels, Need::Hygiene]
                        .into_iter()
                        .all(|need| health.levels[need as usize] >= 30.0)
                    && !self.gathering.workers_at_site(id)
                    && !self.production.has_worker(id)
                    && !resident.town_work.active()
                    && !self.farming.has_worker(id)
                    && !self.working_change(id)
                    && !self.working_water(id)
                    && !self.working_upkeep(id)
                    && !self.driver_booked(id)
            })
            .collect::<Vec<_>>();
        partners.sort_by(|(a, _), (b, _)| score(*b).total_cmp(&score(*a)));
        partners.into_iter().map(|(id, _)| id).collect()
    }

    fn start_conversation(
        &mut self,
        catalog: &Catalog,
        stock: &Stock,
        [(a, a_path), (b, b_path)]: [(usize, VecDeque<Vec2>); 2],
    ) {
        let conversation = self.conversation(a, b, catalog, stock);
        for (id, partner, path) in [(a, b, a_path), (b, a, b_path)] {
            let worker = &mut self.residents[id];
            worker.assignment = None;
            worker.leisure.visit = None;
            worker.path = path;
            worker.health.task = Some(NeedTask {
                kind: Need::Social,
                partner: Some(partner),
                facility: None,
                elapsed: 0.0,
                started_at: None,
                duration: 18.0,
                returning: false,
                water: 0.0,
                conversation: Some(conversation.clone()),
            });
        }
    }

    pub(super) fn invite_at_fire(
        &mut self,
        index: usize,
        catalog: &Catalog,
        stock: &Stock,
        center: Vec2,
        clock: f64,
    ) {
        let health = &self.residents[index].health;
        if health.energy < 35.0
            || health.mind.quiet_until > clock
            || health.levels[Need::Social as usize]
                >= catalog.residents[index].temperament.accepts_at
        {
            return;
        }
        if let Some(other) = self
            .willing_partners(index, catalog, clock)
            .into_iter()
            .find(|&id| {
                let worker = &self.residents[id];
                self.free_for_leisure(id)
                    && worker.position.distance(center) <= 4.0
                    && worker.position.distance(self.residents[index].position) <= 2.5
            })
        {
            for (id, partner) in [(index, other), (other, index)] {
                let offset = self.residents[partner].position - self.residents[id].position;
                self.residents[id].yaw = offset.x.atan2(offset.y);
            }
            self.start_conversation(
                catalog,
                stock,
                [(index, VecDeque::new()), (other, VecDeque::new())],
            );
        }
    }

    fn concern(&self, index: usize, catalog: &Catalog, stock: &Stock) -> Option<&'static str> {
        let health = &self.residents[index].health;
        let level = |need: Need| health.levels[need as usize];
        if health.energy < 35.0 {
            Some("I need to rest before I take on anything else.")
        } else if level(Need::Hunger) < 30.0 {
            Some("It is hard to think about much until I have eaten.")
        } else if level(Need::Bladder).min(level(Need::Bowels)) < 30.0 {
            Some("I need a toilet break first.")
        } else if index == 0 && stock.food_portions() < self.residents.len() as u32 {
            Some("The pantry is getting low. I want us to have enough to share.")
        } else if index == 3
            && self
                .residents
                .iter()
                .any(|worker| worker.health.levels[Need::Hydration as usize] < 30.0)
        {
            Some("We need reliable drinking water. I want to help sort it out.")
        } else if index == 4 && level(Need::Hygiene) < 40.0 {
            Some("I would feel better after washing up.")
        } else if level(Need::Social) < 35.0 {
            if index == 2 {
                Some("I miss sitting down with someone without rushing.")
            } else {
                Some("I would like a little company.")
            }
        } else if level(Need::Fun) < catalog.residents[index].temperament.break_at {
            Some("I need a little time for something I enjoy.")
        } else {
            None
        }
    }

    fn conversation(
        &self,
        index: usize,
        partner: usize,
        catalog: &Catalog,
        stock: &Stock,
    ) -> Conversation {
        for resident in [index, partner] {
            if let Some(reason) = self.concern(resident, catalog, stock) {
                return Conversation::Support {
                    resident,
                    reason: reason.into(),
                };
            }
        }
        let interests = catalog.residents[index]
            .interests
            .iter()
            .filter(|topic| catalog.residents[partner].interests.contains(topic))
            .collect::<Vec<_>>();
        if interests.is_empty() {
            return Conversation::CatchUp;
        }
        let count = self.residents[index]
            .health
            .mind
            .memories
            .iter()
            .filter(|memory| memory.kind == MemoryKind::Conversation)
            .count();
        Conversation::interest(interests[count % interests.len()])
    }

    pub(crate) fn camp_is_reachable(&self, catalog: &Catalog, site: ConstructionSite) -> bool {
        self.resident_route(catalog, site, STOCKPILE.as_vec2(), site.camp + IVec2::Y)
            .is_some()
    }

    pub(super) fn resident_route(
        &self,
        catalog: &Catalog,
        site: ConstructionSite,
        from: Vec2,
        to: IVec2,
    ) -> Option<VecDeque<Vec2>> {
        let roads = self.finished_road_cells(catalog);
        route(
            from,
            to,
            |cell| self.blocked(catalog, site.terrain, site.land, site.camp, cell),
            |cell| roads.contains(&cell) || access_road(cell),
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
        let unavailable = self.residents[index]
            .health
            .task
            .as_ref()
            .filter(|task| {
                matches!(
                    task.kind,
                    Need::Hydration | Need::Hygiene | Need::Bladder | Need::Bowels | Need::Fun
                )
            })
            .and_then(|task| task.facility?.checked_sub(1))
            .is_some_and(|site| {
                !self.utilities.enabled(site)
                    || self.changes.contains_key(&site)
                    || self.plans.get(site).is_some_and(|plan| plan.removed)
            });
        if unavailable {
            self.cancel_need(index, clock + 5.0);
            return;
        }
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
        if task.kind == Need::Social {
            self.finish_conversation(index, catalog, task, clock);
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
                let used = if let Some(id) = task.facility {
                    self.utilities.receive_sewage(id, waste)
                } else {
                    self.utilities.record_latrine_use(waste);
                    true
                };
                if used {
                    levels[task.kind as usize] = 95.0;
                    levels[Need::Hygiene as usize] =
                        (levels[Need::Hygiene as usize] - 8.0).max(0.0);
                }
            }
            Need::Social => unreachable!("conversation handled as a pair"),
            Need::Fun => {
                levels[Need::Fun as usize] = 95.0;
                health.mind.remember(
                    MemoryKind::Personal,
                    format!(
                        "{}. {}",
                        recreation_activity(&self.plans, &task).1,
                        catalog.residents[index].reflection,
                    ),
                    clock,
                    None,
                );
                health.mind.quiet_until =
                    clock + 100.0 - catalog.residents[index].temperament.accepts_at;
            }
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

    fn finish_conversation(&mut self, index: usize, catalog: &Catalog, task: NeedTask, clock: f64) {
        self.residents[index].health.retry_at = clock + 3.0;
        let Some(partner) = task.partner.filter(|&partner| partner != index) else {
            return;
        };
        if !self.residents[partner]
            .health
            .task
            .as_ref()
            .is_some_and(|other| other.kind == Need::Social && other.partner == Some(index))
        {
            return;
        }
        let conversation = task.conversation.unwrap_or(Conversation::CatchUp);
        for (id, other) in [(index, partner), (partner, index)] {
            let health = &mut self.residents[id].health;
            health.task = None;
            health.retry_at = clock + 3.0;
            conversation.finish(
                health,
                &catalog.residents[id],
                id,
                (other, NAMES[other]),
                clock,
            );
        }
    }

    fn private_visit(&self, index: usize, catalog: &Catalog) -> Option<(&NeedTask, &Blueprint)> {
        let worker = &self.residents[index];
        let task = worker.health.task.as_ref()?;
        if !worker.path.is_empty() || task.elapsed <= 0.0 {
            return None;
        }
        let plan = self.plans.get(task.facility?.checked_sub(1)?)?;
        let private = matches!(task.kind, Need::Bladder | Need::Bowels)
            || (task.kind == Need::Hygiene && catalog.projects[&plan.key].kind == "home");
        private.then_some((task, plan))
    }

    fn resident_service_anchor(&self, index: usize, catalog: &Catalog) -> Option<(Vec2, f32)> {
        let worker = &self.residents[index];
        if !worker.path.is_empty() {
            return None;
        }
        let site = if let Some(task) = &worker.health.task {
            (task.kind == Need::Hygiene && task.elapsed > 0.0 && !task.returning)
                .then_some(task.facility?)?
                .checked_sub(1)?
        } else {
            self.production
                .jobs
                .iter()
                .find(|job| {
                    job.worker == Some(index) && job.phase == crate::production::Phase::Work
                })?
                .site
        };
        let plan = self.plans.get(site)?;
        let definition = &catalog.projects[&plan.key];
        let offset_m = match definition.kind.as_str() {
            "workshop" => Vec2::new(-0.2, 1.87),
            "kitchen" => Vec2::new(-1.55, 1.87),
            "wash-station" => Vec2::new(0.0, 0.52),
            _ => return None,
        };
        let entrance = building_entrance(plan, definition)?.as_vec2();
        if entrance.distance_squared(worker.position) >= 0.36 {
            return None;
        }
        let center = plan.position.as_vec2() + (plan.size.as_vec2() - Vec2::ONE) * 0.5;
        let angle = f32::from(plan.rotation) * std::f32::consts::FRAC_PI_2;
        let anchor = center + Vec2::from_angle(-angle).rotate(offset_m * 0.5);
        let inward = center - anchor;
        Some((anchor, inward.x.atan2(inward.y)))
    }

    fn rest_pose(&self, index: usize, catalog: &Catalog) -> Option<RestPose> {
        let worker = &self.residents[index];
        let task = worker.health.task.as_ref()?;
        if !worker.path.is_empty()
            || !matches!(task.kind, Need::Rest | Need::Sleep)
            || task.elapsed <= 0.0
        {
            return None;
        }
        let shelter = task
            .facility
            .and_then(|id| id.checked_sub(1))
            .and_then(|id| self.plans.get(id));
        let home = shelter.is_some_and(|plan| catalog.projects[&plan.key].kind == "home");
        let recessed = shelter
            .is_some_and(|plan| plan.key.contains("veranda") || plan.key.contains("courtyard"));
        let travel = if home {
            if recessed { 1.15 } else { 0.75 }
        } else {
            1.35
        };
        let facing = shelter.map_or(0., |plan| {
            f32::from(plan.rotation) * std::f32::consts::FRAC_PI_2
        });
        let remaining = task.duration - task.elapsed;
        let entering = task.elapsed < remaining;
        let inward = (task.elapsed.min(remaining) / 1.5).clamp(0.0, 1.0) as f32;
        Some(RestPose {
            position: worker.position - Vec2::new(facing.sin(), facing.cos()) * (travel * inward),
            yaw: facing + if entering { std::f32::consts::PI } else { 0. },
            visible: inward < if home { 0.82 } else { 0.64 },
            motion: if home { Motion::Walk } else { Motion::DuckWalk },
        })
    }

    pub fn resident_visual_position(&self, index: usize, catalog: &Catalog) -> (Vec2, bool) {
        if let Some(rest) = self.rest_pose(index, catalog) {
            return (rest.position, rest.visible);
        }
        let position = self.residents[index].position;
        let Some((task, plan)) = self.private_visit(index, catalog) else {
            let anchor = self
                .resident_service_anchor(index, catalog)
                .map_or(position, |(point, _)| point);
            return (anchor, true);
        };
        let center = plan.position.as_vec2() + (plan.size.as_vec2() - Vec2::ONE) * 0.5;
        let remaining = task.duration - task.elapsed;
        let transition = task.elapsed.min(remaining).clamp(0.0, 1.0) as f32;
        let visible = task.elapsed <= 1.0 || remaining <= 1.0;
        (position.lerp(center, transition), visible)
    }

    pub fn resident_visual_yaw(&self, index: usize, catalog: &Catalog) -> f32 {
        if let Some(rest) = self.rest_pose(index, catalog) {
            return rest.yaw;
        }
        if let Some((_, yaw)) = self.resident_service_anchor(index, catalog) {
            return yaw;
        }
        let worker = &self.residents[index];
        let Some(task) = worker
            .health
            .task
            .as_ref()
            .filter(|task| task.kind == Need::Social)
        else {
            return worker.yaw;
        };
        if worker.path.is_empty()
            && let Some(partner) = task.partner.and_then(|partner| self.residents.get(partner))
            && partner.path.is_empty()
        {
            let offset = partner.position - worker.position;
            if offset.length_squared() > 0.001 {
                return offset.x.atan2(offset.y);
            }
        }
        worker.yaw
    }

    fn conversation_motion(&self, index: usize, task: &NeedTask) -> Motion {
        let Some(partner) = task.partner else {
            return Motion::Chat;
        };
        let elapsed = self
            .residents
            .get(partner)
            .and_then(|resident| resident.health.task.as_ref())
            .filter(|other| other.kind == Need::Social && other.partner == Some(index))
            .map_or(task.elapsed, |other| task.elapsed.min(other.elapsed));
        if elapsed <= 0.0 {
            return Motion::Look;
        }
        if elapsed < 1.6 {
            return Motion::Wave;
        }
        let turn = ((elapsed - 1.6) / 3.5).floor() as usize % 2;
        if usize::from(index > partner) != turn {
            return Motion::Listen;
        }
        if matches!(task.conversation, Some(Conversation::Interest { .. }))
            && (12.0..14.0).contains(&elapsed)
        {
            return Motion::Laugh;
        }
        Motion::Chat
    }

    pub fn resident_motion(&self, index: usize, catalog: &Catalog, land: &Land) -> Motion {
        let worker = &self.residents[index];
        if let Some(task) = &worker.health.task {
            if !worker.path.is_empty() {
                return if task.returning {
                    Motion::CarryWalk
                } else {
                    Motion::Walk
                };
            }
            if self.private_visit(index, catalog).is_some() {
                return Motion::DuckWalk;
            }
            return match task.kind {
                Need::Hunger | Need::Hydration => Motion::Eat,
                Need::Hygiene if task.facility.is_none() => Motion::Bathe,
                Need::Hygiene => Motion::Wash,
                Need::Bladder => Motion::Pee,
                Need::Bowels => Motion::Toilet,
                Need::Social => self.conversation_motion(index, task),
                Need::Fun => recreation_activity(&self.plans, task).0,
                Need::Sleep | Need::Rest => self
                    .rest_pose(index, catalog)
                    .map_or(Motion::Rest, |rest| rest.motion),
                Need::FilterWater | Need::FetchWater => Motion::Work,
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
                crate::production::Phase::Return if job.returning_to_site => Motion::Walk,
                crate::production::Phase::Approach | crate::production::Phase::Return
                    if !worker.path.is_empty() =>
                {
                    Motion::CarryWalk
                }
                crate::production::Phase::Work
                    if matches!(
                        catalog.production[&job.recipe].kind.as_str(),
                        "garden"
                            | "greenhouse"
                            | "orchard"
                            | "grove"
                            | "coop"
                            | "goat_pasture"
                            | "compost"
                            | "apiary"
                    ) =>
                {
                    Motion::Tend
                }
                crate::production::Phase::Work => Motion::Work,
                _ if !worker.path.is_empty() => Motion::Walk,
                _ => Motion::Idle,
            };
        }
        if let Some((&site, job)) = self
            .gathering
            .orders
            .iter()
            .find(|(_, job)| job.worker == Some(index))
        {
            return match job.phase {
                GatherPhase::Return => Motion::CarryWalk,
                GatherPhase::Work
                    if land
                        .site(site)
                        .is_some_and(|site| site.recipe() == "fell_tree") =>
                {
                    Motion::Chop
                }
                GatherPhase::Work => Motion::Tend,
                _ => Motion::Walk,
            };
        }
        if let Some(job) = self
            .farming
            .jobs
            .iter()
            .find(|job| job.worker == Some(index))
        {
            return match job.phase {
                crate::farming::FarmPhase::Work => Motion::Tend,
                crate::farming::FarmPhase::Return if !job.output.is_empty() => Motion::CarryWalk,
                crate::farming::FarmPhase::Walk if !job.inputs.is_empty() => Motion::CarryWalk,
                _ => Motion::Walk,
            };
        }
        if let Some(motion) = self
            .service_motion(index)
            .or_else(|| self.water_motion(index))
        {
            return motion;
        }
        if let Some(visit) = &worker.leisure.visit {
            return visit.motion();
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

    pub(crate) fn all_residents_unavailable(&self) -> bool {
        self.residents.iter().enumerate().all(|(index, resident)| {
            resident
                .health
                .task
                .as_ref()
                .is_some_and(|task| task.kind == Need::Sleep && task.elapsed > 0.0)
                || self.away_for_work(index)
                || self.driver_away(index)
        })
    }

    pub(super) fn resident_action(
        &self,
        catalog: &Catalog,
        index: usize,
    ) -> std::borrow::Cow<'static, str> {
        let worker = &self.residents[index];
        let label = if worker.waiting_for_route() || worker.town_work.route_blocked {
            "Waiting for access"
        } else if worker.town_work.active() {
            worker.town_work.status()
        } else if self.driver_away(index) {
            "In town"
        } else if let Some(task) = &worker.health.task {
            if task.kind == Need::Fun {
                if worker.path.is_empty() {
                    recreation_activity(&self.plans, task).1
                } else {
                    "Walking to a recreation spot"
                }
            } else {
                task.kind.label()
            }
        } else if let Some(job) = &worker.assignment {
            match job.activity {
                Activity::Collect => "Collecting materials",
                Activity::Carry => {
                    let loads = job.haul.loads();
                    let unit = if loads == 1 { "load" } else { "loads" };
                    let destination = if let Haul::Stage { .. } = job.haul {
                        "nearby storage"
                    } else {
                        &catalog.projects[&self.plans[job.project].key].name
                    };
                    return format!("Carrying {loads} {unit} to {destination}").into();
                }
                Activity::Walk => "Walking to site",
                Activity::Build => "Building",
            }
        } else if self.production.has_worker(index) {
            "In production"
        } else if self.gathering.workers_at_site(index) {
            "Gathering"
        } else if let Some(activity) = self
            .service_activity(index)
            .or_else(|| self.water_activity(index))
        {
            activity
        } else if let Some(visit) = &worker.leisure.visit {
            visit.label()
        } else {
            "Available"
        };
        label.into()
    }

    pub fn draw_residents_lens(
        &self,
        catalog: &Catalog,
        terrain: &Terrain,
        hovered: Option<Vec3>,
        gizmos: &mut Gizmos,
    ) -> String {
        use std::fmt::Write;

        let mut label = "Residents · Green needs above 30% · Red needs at or below 30%".to_owned();
        let mut nearest = None;
        let mut nearest_distance = 9.0;
        let mut away = 0;
        for (index, worker) in self.residents.iter().enumerate() {
            if self.away_for_work(index) || self.driver_away(index) {
                away += 1;
                continue;
            }
            let health = &worker.health;
            let urgent = health.energy <= 30.0 || health.levels.iter().any(|level| *level <= 30.0);
            let color = if urgent {
                Color::srgb_u8(222, 112, 96)
            } else {
                Color::srgb_u8(136, 220, 148)
            };
            let Vec2 { x, y: z } = world_position(worker.position.x, worker.position.y);
            let ground = Vec3::new(x, terrain.height_at(x, z), z);
            let tip = ground + Vec3::Y * 4.0;
            gizmos.line(ground, tip, color);
            for axis in [Vec3::X, Vec3::Z] {
                gizmos.line(tip - axis * 0.6, tip + axis * 0.6, color);
            }
            if let Some(pointer) = hovered {
                let distance = pointer.xz().distance_squared(ground.xz());
                if distance < nearest_distance {
                    nearest = Some(index);
                    nearest_distance = distance;
                }
            }
        }
        if away > 0 {
            let _ = write!(label, " · {away} away");
        }
        if let Some(index) = nearest {
            let health = &self.residents[index].health;
            let _ = write!(
                label,
                "\n{} · {}",
                NAMES[index],
                self.resident_action(catalog, index)
            );
            for (name, level) in [
                "Energy", "Food", "Bladder", "Bowels", "Hygiene", "Social", "Fun", "Water",
            ]
            .into_iter()
            .zip(std::iter::once(health.energy).chain(health.levels))
            {
                if level <= 30.0 {
                    let _ = write!(label, " · {name} {level:.0}%");
                }
            }
        }
        label
    }

    pub(crate) fn lab_town_work(&self, resident: usize) -> &TownWork {
        &self.residents[resident].town_work
    }

    pub(crate) fn lab_resident_row(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        index: usize,
    ) -> String {
        let worker = &self.residents[index];
        let health = &worker.health;
        let (need, level) = [
            "Hunger",
            "Bladder",
            "Bowels",
            "Hygiene",
            "Social",
            "Fun",
            "Hydration",
        ]
        .into_iter()
        .zip(health.levels)
        .min_by(|a, b| a.1.total_cmp(&b.1))
        .expect("residents have needs");
        let action = self.resident_action(catalog, index);
        let mut line = format!(
            "{} · {action}\nEnergy {:.0}% · Food {:.0}% · Water {:.0}% · Lowest need {need} {level:.0}%",
            NAMES[index],
            health.energy,
            health.levels[Need::Hunger as usize],
            health.levels[Need::Hydration as usize]
        );
        if let Some(concern) = self.concern(index, catalog, stock) {
            line.push('\n');
            line.push_str(concern);
        }
        line
    }

    pub(crate) fn resident_story(catalog: &Catalog, selected: usize) -> String {
        use std::fmt::Write;

        let profile = &catalog.residents[selected];
        let mut story = format!(
            "{} · {}\n{}",
            NAMES[selected],
            profile.role,
            profile.traits.join(" · ")
        );
        for (label, text) in [
            ("Before the village", &profile.backstory),
            ("What I want", &profile.desire),
            ("What drives me", &profile.motivation),
            ("What I fear", &profile.fear),
            ("Where I struggle", &profile.flaw),
            ("What I need from others", &profile.boundary),
            ("Room to grow", &profile.growth),
        ] {
            let _ = write!(story, "\n\n{label}\n{text}");
        }
        story
    }

    pub(crate) fn resident_skills(&self, catalog: &Catalog, selected: usize) -> String {
        use crate::production::crafting::Skill;
        use std::fmt::Write;

        let worker = &self.residents[selected];
        let specialties = catalog.residents[selected]
            .strengths
            .iter()
            .filter_map(|key| {
                catalog
                    .projects
                    .get(key)
                    .map(|project| project.name.as_str())
            })
            .collect::<Vec<_>>()
            .join(" · ");
        let bonus = (100.0 * worker.experience_bonus()).floor();
        let mut skills = format!(
            "{} · Skills\n\nSpecialties · 25% faster\n{specialties}\n\nLearning by doing\n+{bonus}% work speed from experience (up to 15%)\n\nCraft skills",
            NAMES[selected]
        );
        for skill in [Skill::Woodworking, Skill::Basketry, Skill::Repair] {
            let _ = write!(
                skills,
                "\n{} · Level {}",
                skill.label(),
                worker.craft.level(selected, skill)
            );
        }
        skills
    }

    pub(crate) fn resident_relationships(&self, selected: usize) -> String {
        use std::fmt::Write;

        let health = &self.residents[selected].health;
        let mut relationships = format!("{} · Relationships", NAMES[selected]);
        for (id, &name) in NAMES.iter().enumerate().filter(|(id, _)| *id != selected) {
            let score = health.friendships[id];
            let label = friendship_label(score);
            let _ = write!(relationships, "\n\n{name} · {label} · {score}/100");
            if let Some(memory) = health
                .mind
                .memories
                .iter()
                .find(|memory| memory.partner == Some(id))
            {
                let _ = write!(relationships, "\n{}", memory.text);
            }
        }
        relationships
    }

    pub fn resident_status(&self, catalog: &Catalog, stock: &Stock, selected: usize) -> String {
        let mut rows = self
            .residents
            .iter()
            .enumerate()
            .map(|(index, worker)| {
                let action = self.resident_action(catalog, index);
                let health = &worker.health;
                let profile = &catalog.residents[index];
                let home = worker.home.map_or_else(
                    || "Any free bed".to_owned(),
                    |id| format!("{} #{}", catalog.projects[&self.plans[id].key].name, id + 1),
                );
                let marker = if index == selected { "› " } else { "" };
                format!(
                    "{marker}{} · {} · {home}\n{} · Energy {:.0}% · Water {:.0}% · Food {:.0}%",
                    NAMES[index],
                    profile.role,
                    action,
                    health.energy,
                    health.levels[Need::Hydration as usize],
                    health.levels[Need::Hunger as usize],
                )
            })
            .collect::<Vec<_>>()
            .join("\n");

        use std::fmt::Write;
        let worker = &self.residents[selected];
        let profile = &catalog.residents[selected];
        let mind = &worker.health.mind;
        let wish = &profile.aspiration;
        let stage = if self.plans.iter().any(|plan| {
            !plan.removed && plan.key == wish.key && plan.work >= catalog.projects[&plan.key].work
        }) {
            "Built"
        } else if self
            .plans
            .iter()
            .any(|plan| !plan.removed && plan.key == wish.key)
        {
            "Taking shape"
        } else {
            "Hoping for this"
        };
        let thought = match worker.health.task.as_ref().map(|task| task.kind) {
            Some(Need::Social) => {
                let topic = worker
                    .health
                    .task
                    .as_ref()
                    .and_then(|task| task.conversation.as_ref())
                    .map_or("life in the village", Conversation::topic);
                format!("Making time to talk about {topic}.")
            }
            Some(Need::Fun) => profile.reflection.clone(),
            Some(Need::Sleep | Need::Rest) => "Time to rest. The village can wait a little.".into(),
            _ => self
                .concern(selected, catalog, stock)
                .map(str::to_owned)
                .unwrap_or_else(|| {
                    if mind.fulfilled {
                        "Something I hoped for is here. I want to enjoy it too.".into()
                    } else {
                        wish.reason.clone()
                    }
                }),
        };
        let _ = write!(
            rows,
            "\n\n{} · {}\n{}\n\nHome\n{}\n\nNeeds · Energy {:.0}%",
            NAMES[selected],
            profile.role,
            profile.traits.join(" · "),
            self.resident_home_summary(selected, catalog),
            worker.health.energy,
        );
        for (label, need) in [
            ("Food", Need::Hunger),
            ("Water", Need::Hydration),
            ("Bladder", Need::Bladder),
            ("Bowels", Need::Bowels),
            ("Hygiene", Need::Hygiene),
            ("Social", Need::Social),
            ("Fun", Need::Fun),
        ] {
            let _ = write!(
                rows,
                " · {label} {:.0}%",
                worker.health.levels[need as usize]
            );
        }
        let _ = write!(
            rows,
            "\n\nOn my mind\n{thought}\n\nA personal hope\n{} · {stage}\n{}\n\n{}\n{}\nEnjoys {}.",
            wish.label,
            wish.reason,
            profile.bio,
            profile.effect,
            profile.hobby.to_lowercase(),
        );
        use crate::production::crafting::Skill;
        for skill in [Skill::Woodworking, Skill::Basketry, Skill::Repair] {
            let _ = write!(
                rows,
                "\n{} · Level {}",
                skill.label(),
                worker.craft.level(selected, skill)
            );
        }
        let ties = worker
            .health
            .friendships
            .iter()
            .enumerate()
            .filter(|&(id, score)| id != selected && *score > 0)
            .map(|(id, score)| {
                let relationship = friendship_label(*score);
                format!("{} · {relationship}", NAMES[id])
            })
            .collect::<Vec<_>>();
        if !ties.is_empty() {
            let _ = write!(rows, "\n{}", ties.join("  |  "));
        }
        rows.push_str("\n\nRecent memories");
        if mind.memories.is_empty() {
            rows.push_str("\nMemories will appear after conversations, personal time, and meaningful village milestones.");
        }
        for memory in mind.memories.iter().take(3) {
            let _ = write!(rows, "\n{}", memory.text);
        }
        rows
    }
}

fn friendship_label(score: i16) -> &'static str {
    match score {
        64.. => "Close friends",
        24.. => "Growing closer",
        _ => "Getting to know each other",
    }
}

pub(super) fn project_access_points(plan: &Blueprint, catalog: &Catalog, from: Vec2) -> Vec<IVec2> {
    let mut points = approach_points(plan.position, plan.size, from);
    if let Some(entrance) = building_entrance(plan, &catalog.projects[&plan.key]) {
        points.retain(|&cell| cell != entrance);
        points.insert(0, entrance);
    }
    points
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
    fn resident_home_summary_tracks_assignment_and_housemates() {
        let catalog = Catalog::default();
        let mut village = Construction::default();
        assert!(
            village
                .resident_home_summary(0, &catalog)
                .contains("Complete a house")
        );
        let mut home = village.proposed_site(&catalog, "house", IVec2::new(44, 36));
        home.work = catalog.projects["house"].work;
        village.plans.push(home);
        assert!(
            village
                .resident_home_summary(0, &catalog)
                .contains("Unassigned")
        );
        village.assign_home(0, &catalog, 0).unwrap();
        assert!(
            village
                .resident_home_summary(0, &catalog)
                .contains("Lives here alone.")
        );
        village.assign_home(1, &catalog, 0).unwrap();
        assert!(
            village
                .resident_home_summary(0, &catalog)
                .contains("Lives with Bento.")
        );
        village.clear_home(1);
        assert!(
            village
                .resident_home_summary(0, &catalog)
                .contains("Lives here alone.")
        );
    }

    #[test]
    fn automatic_speed_requires_every_resident_to_be_asleep_or_away() {
        let mut village = Construction::default();
        assert!(!village.all_residents_unavailable());
        for resident in &mut village.residents {
            resident.health.task = Some(crate::residents::NeedTask {
                kind: Need::Sleep,
                facility: None,
                elapsed: 1.0,
                started_at: None,
                duration: 100.0,
                water: 0.0,
                returning: false,
                partner: None,
                conversation: None,
            });
        }
        assert!(village.all_residents_unavailable());
        village.residents[0].health.task.as_mut().unwrap().elapsed = 0.0;
        assert!(!village.all_residents_unavailable());
        village.residents[0].health.task = None;
        assert!(!village.all_residents_unavailable());
    }

    #[test]
    fn a_shared_concern_records_one_memory_for_each_resident() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
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
        for (index, resident) in village.residents.iter_mut().enumerate() {
            resident.position = (camp + IVec2::new(index as i32 - 2, 3)).as_vec2();
            resident.health.levels = [100.0; 7];
            resident.health.mind.quiet_until = if index > 1 { 200.0 } else { 0.0 };
        }
        village.residents[0].health.levels[Need::Social as usize] = 25.0;
        village.residents[1].health.levels[Need::Social as usize] = 40.0;
        village.choose_need(0, &catalog, &stock, site, 0.0);
        assert!(
            village.residents[0]
                .health
                .task
                .as_ref()
                .is_some_and(|task| task.partner == Some(1))
        );
        for tick in 0..250 {
            village.tick_health(
                &catalog,
                &setup,
                &mut stock,
                site,
                f64::from(tick) / 10.0,
                0.1,
            );
        }
        assert_eq!(village.residents[0].health.friendships[1], 8);
        assert_eq!(village.residents[1].health.friendships[0], 4);
        assert_eq!(village.residents[0].health.mind.memories.len(), 1);
        assert_eq!(village.residents[1].health.mind.memories.len(), 1);
        assert!(
            village.residents[0].health.mind.memories[0]
                .text
                .contains("Bento listened")
        );
        let json = serde_json::to_string(&village).unwrap();
        let loaded: Construction = serde_json::from_str(&json).unwrap();
        assert_eq!(loaded.residents[1].health.mind.memories[0].partner, Some(0));
    }

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
    fn sleep_restores_fun_and_town_work_pauses_village_needs() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let terrain = setup.terrain();
        let land = Land::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut village = Construction::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        village.residents[0].health.task = Some(NeedTask {
            kind: Need::Sleep,
            facility: None,
            elapsed: 1.0,
            started_at: None,
            duration: 1000.0,
            water: 0.0,
            returning: false,
            partner: None,
            conversation: None,
        });
        village.residents[1].town_work.shift = Some(crate::town_work::Shift {
            phase: crate::town_work::Commute::Away,
            full_day: true,
            fare_due: false,
            until: 1000.0,
        });
        let fun = village.residents[0].health.levels[Need::Fun as usize];
        let away_levels = village.residents[1].health.levels;
        let away_energy = village.residents[1].health.energy;

        village.tick_health(&catalog, &setup, &mut stock, site, 0.0, 1.0);

        assert!(village.residents[0].health.levels[Need::Fun as usize] > fun);
        assert_eq!(village.residents[1].health.levels, away_levels);
        assert_eq!(village.residents[1].health.energy, away_energy);
    }

    #[test]
    fn urgent_thirst_interrupts_a_conversation_for_both_residents() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let terrain = setup.terrain();
        let land = Land::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut village = Construction::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        village.tick_services(&catalog, &setup, &mut stock, 0.0, 0.1);
        village.start_conversation(
            &catalog,
            &stock,
            [(0, VecDeque::new()), (1, VecDeque::new())],
        );
        village.residents[0].health.levels[Need::Hydration as usize] = 9.0;
        village.tick_health(&catalog, &setup, &mut stock, site, 0.0, 0.1);

        assert!(
            village.residents[0]
                .health
                .task
                .as_ref()
                .is_some_and(|task| task.kind == Need::Hydration)
        );
        assert!(village.residents[1].health.task.is_none());
    }

    #[test]
    fn residents_drink_from_a_nearby_free_source_before_walking_to_camp_storage() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let terrain = setup.terrain();
        let land = Land::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut village = Construction::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        village.utilities.sync(
            [crate::utilities::Facility {
                id: 1,
                kind: "well",
                location: IVec2::new(44, 36),
                size: IVec2::ONE,
                batteries: 0,
                panels: 0,
                working: false,
            }]
            .into_iter(),
        );
        assert_eq!(village.utilities.deliver_water(1, 0, 10.0), 10.0);
        for worker in &mut village.residents[..2] {
            worker.position = Vec2::new(42.0, 36.0);
            worker.health.levels[Need::Hydration as usize] = 40.0;
        }

        village.tick_health(&catalog, &setup, &mut stock, site, 0.0, 0.1);

        assert_eq!(
            village.residents[0].health.task.as_ref().unwrap().facility,
            Some(1)
        );
        assert_eq!(
            village.residents[1].health.task.as_ref().unwrap().facility,
            Some(0)
        );
    }

    #[test]
    fn conversation_partners_take_turns_and_only_shared_interests_trigger_laughter() {
        let catalog = Catalog::default();
        let mut village = Construction::default();
        village.residents[0].position = Vec2::ZERO;
        village.residents[1].position = Vec2::X;
        for (resident, partner) in [(0, 1), (1, 0)] {
            village.residents[resident].health.task = Some(NeedTask {
                kind: Need::Social,
                facility: None,
                elapsed: 0.0,
                started_at: None,
                duration: 18.,
                water: 0.,
                returning: false,
                partner: Some(partner),
                conversation: Some(Conversation::interest("growing")),
            });
        }
        assert!(matches!(
            village.resident_motion(0, &catalog, &Land::default()),
            Motion::Look
        ));
        assert_eq!(
            village.resident_visual_yaw(0, &catalog),
            std::f32::consts::FRAC_PI_2
        );
        assert_eq!(
            village.resident_visual_yaw(1, &catalog),
            -std::f32::consts::FRAC_PI_2
        );
        for worker in &mut village.residents[..2] {
            worker.health.task.as_mut().unwrap().elapsed = 1.;
        }
        assert!(matches!(
            village.resident_motion(1, &catalog, &Land::default()),
            Motion::Wave
        ));
        for worker in &mut village.residents[..2] {
            worker.health.task.as_mut().unwrap().elapsed = 3.;
        }
        assert!(matches!(
            village.resident_motion(0, &catalog, &Land::default()),
            Motion::Chat
        ));
        assert!(matches!(
            village.resident_motion(1, &catalog, &Land::default()),
            Motion::Listen
        ));
        for worker in &mut village.residents[..2] {
            worker.health.task.as_mut().unwrap().elapsed = 13.;
        }
        assert!(matches!(
            village.resident_motion(0, &catalog, &Land::default()),
            Motion::Listen
        ));
        assert!(matches!(
            village.resident_motion(1, &catalog, &Land::default()),
            Motion::Laugh
        ));
        village.residents[1]
            .health
            .task
            .as_mut()
            .unwrap()
            .conversation = Some(Conversation::Support {
            resident: 0,
            reason: "I need rest".into(),
        });
        assert!(matches!(
            village.resident_motion(1, &catalog, &Land::default()),
            Motion::Chat
        ));
    }

    #[test]
    fn gathering_uses_an_axe_only_when_felling_a_tree() {
        let catalog = Catalog::default();
        let land = Land::generate(&WorldSetup::default());
        let mut village = Construction::default();
        for (recipe, expected) in [("fell_tree", Motion::Chop), ("stone", Motion::Tend)] {
            let (site, _) = land
                .sites()
                .find(|(_, site)| site.recipe() == recipe)
                .unwrap();
            village.gathering.orders.insert(
                site,
                crate::gathering::GatherJob {
                    worker: Some(0),
                    work: 0.,
                    retry_at: 0.,
                    waiting_for_access: false,
                    phase: GatherPhase::Work,
                    remaining: None,
                    food_output: None,
                },
            );
            assert!(village.resident_motion(0, &catalog, &land) == expected);
            village.gathering.orders.clear();
        }
    }

    #[test]
    fn residents_duck_into_tents_and_face_out_when_leaving() {
        let catalog = Catalog::default();
        let mut village = Construction::default();
        let entrance = Vec2::new(40., 38.);
        village.residents[0].position = entrance;
        village.residents[0].health.task = Some(NeedTask {
            kind: Need::Sleep,
            facility: None,
            elapsed: 0.5,
            started_at: None,
            duration: 100.,
            water: 0.,
            returning: false,
            partner: None,
            conversation: None,
        });
        let (entry, visible) = village.resident_visual_position(0, &catalog);
        assert!(visible && entry.y < entrance.y);
        assert_eq!(
            village.resident_visual_yaw(0, &catalog),
            std::f32::consts::PI
        );
        assert!(matches!(
            village.resident_motion(0, &catalog, &Land::default()),
            Motion::DuckWalk
        ));
        village.residents[0].health.task.as_mut().unwrap().elapsed = 50.;
        assert!(!village.resident_visual_position(0, &catalog).1);
        village.residents[0].health.task.as_mut().unwrap().elapsed = 99.5;
        assert_eq!(village.resident_visual_position(0, &catalog), (entry, true));
        assert_eq!(village.resident_visual_yaw(0, &catalog), 0.);
        assert_eq!(village.residents[0].position, entrance);
    }

    #[test]
    fn washing_uses_the_rotated_station_anchor_only_after_arrival() {
        let catalog = Catalog::default();
        let mut village = Construction::default();
        let station =
            Construction::proposal(&catalog, "wash-station", IVec2::splat(40), IVec2::ONE, 1);
        let entrance = building_entrance(&station, &catalog.projects["wash-station"])
            .unwrap()
            .as_vec2();
        let center = station.position.as_vec2() + (station.size.as_vec2() - Vec2::ONE) * 0.5;
        village.plans.push(station);
        village.residents[0].position = entrance;
        village.residents[0].health.task = Some(NeedTask {
            kind: Need::Hygiene,
            facility: Some(1),
            elapsed: 0.,
            started_at: None,
            duration: 14.,
            water: 0.,
            returning: false,
            partner: None,
            conversation: None,
        });
        assert_eq!(
            village.resident_visual_position(0, &catalog),
            (entrance, true)
        );
        village.residents[0].health.task.as_mut().unwrap().elapsed = 1.;
        let (anchor, visible) = village.resident_visual_position(0, &catalog);
        assert!(visible && anchor.abs_diff_eq(center + Vec2::X * 0.26, 0.00001));
        assert_eq!(
            village.resident_visual_yaw(0, &catalog),
            -std::f32::consts::FRAC_PI_2
        );
        assert_eq!(village.residents[0].position, entrance);
    }

    #[test]
    fn private_visits_hide_residents_between_entry_and_exit() {
        let catalog = Catalog::default();
        let mut village = Construction::default();
        village
            .plans
            .push(village.proposed_site(&catalog, "eco_toilet", IVec2::splat(40)));
        let original = Vec2::new(40., 38.);
        village.residents[0].position = original;
        village.residents[0].health.task = Some(NeedTask {
            kind: Need::Bowels,
            facility: Some(1),
            elapsed: 0.5,
            started_at: None,
            duration: 10.,
            water: 0.,
            returning: false,
            partner: None,
            conversation: None,
        });
        assert!(matches!(
            village.resident_motion(0, &catalog, &Land::default()),
            Motion::DuckWalk
        ));
        let (position, visible) = village.resident_visual_position(0, &catalog);
        assert!(visible && position.y > original.y);
        village.residents[0].health.task.as_mut().unwrap().elapsed = 4.;
        assert!(!village.resident_visual_position(0, &catalog).1);
        village.residents[0].health.task.as_mut().unwrap().elapsed = 9.5;
        assert_eq!(
            village.resident_visual_position(0, &catalog),
            (position, true)
        );
        village.residents[0].health.task.as_mut().unwrap().facility = None;
        assert_eq!(
            village.resident_visual_position(0, &catalog),
            (original, true)
        );
        assert!(matches!(
            village.resident_motion(0, &catalog, &Land::default()),
            Motion::Toilet
        ));
    }

    #[test]
    fn a_resident_needing_fun_visits_a_finished_reading_room() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let terrain = setup.terrain();
        let land = Land::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut village = Construction::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        let mut reading_room = village.proposed_site(&catalog, "reading-room", IVec2::new(44, 36));
        reading_room.work = catalog.projects["reading-room"].work;
        village.plans.push(reading_room);
        village.residents[0].health.levels[Need::Fun as usize] = 5.0;

        village.choose_need(0, &catalog, &stock, site, 0.0);
        let task = village.residents[0].health.task.as_ref().unwrap();
        assert!(task.kind == Need::Fun);
        assert_eq!(task.facility, Some(1));
        village.residents[0].path.clear();
        village.residents[0].position = Vec2::new(42.0, 36.0);
        assert!(village.recreation_spot_taken(1, IVec2::new(42, 36)));
        assert!(matches!(
            village.resident_motion(0, &catalog, &Land::default()),
            Motion::Read
        ));
        assert_eq!(village.resident_action(&catalog, 0), "Reading for a while");
        village.step_need(0, &catalog, &mut stock, site, 22.0, 22.0);
        assert!(
            village.residents[0].health.mind.memories[0]
                .text
                .starts_with("Reading for a while.")
        );
    }

    #[test]
    fn temporary_latrine_stays_away_from_the_river_and_supplies() {
        let catalog = Catalog::default();
        let terrain = WorldSetup::default().terrain();
        let land = Land::default();
        let camp = IVec2::new(36, 36);
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp,
        };
        let mut village = Construction::default();
        let (facility, path) = village
            .need_route(0, &catalog, site, Need::Bladder)
            .unwrap();
        let target = path.back().unwrap().as_ivec2();
        let Vec2 { x, y: z } = world_position(target.x as f32, target.y as f32);
        let (center, width) = terrain.river(f64::from(z));
        assert!(facility.is_none());
        assert!(target.distance_squared(camp) >= 25);
        assert!(target.distance_squared(STOCKPILE) >= 25);
        assert!((f64::from(x) - center).abs() > width + 6.9);
        let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
        village.residents[0].health.levels[Need::Bladder as usize] = 5.0;
        village.choose_need(0, &catalog, &stock, site, 0.0);
        village.residents[0].position = target.as_vec2();
        village.residents[0].path.clear();
        village.step_need(0, &catalog, &mut stock, site, 6.0, 6.0);
        let save = serde_json::to_vec(&village).unwrap();
        let restored: Construction = serde_json::from_slice(&save).unwrap();
        assert!(
            restored
                .utilities
                .water_summary()
                .contains("0.5 L waste recorded")
        );
    }

    #[test]
    fn residents_choose_the_closer_toilet_even_if_it_was_built_later() {
        let catalog = Catalog::default();
        let terrain = WorldSetup::default().terrain();
        let land = Land::default();
        let mut village = Construction::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        let toilets = [IVec2::new(55, 36), IVec2::new(44, 36)];
        village
            .utilities
            .sync(toilets.into_iter().enumerate().map(|(index, location)| {
                crate::utilities::Facility {
                    id: index + 1,
                    kind: "eco_toilet",
                    location,
                    size: IVec2::ONE,
                    batteries: 0,
                    panels: 0,
                    working: false,
                }
            }));
        village.residents[0].position = Vec2::new(42.0, 36.0);

        assert_eq!(
            village
                .need_route(0, &catalog, site, Need::Bladder)
                .unwrap()
                .0,
            Some(2)
        );
    }

    #[test]
    fn a_drinking_trip_releases_a_source_that_switches_off() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let terrain = setup.terrain();
        let land = Land::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut village = Construction::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        village.utilities.sync(
            [crate::utilities::Facility {
                id: 1,
                kind: "well",
                location: IVec2::new(44, 36),
                size: IVec2::ONE,
                batteries: 0,
                panels: 0,
                working: false,
            }]
            .into_iter(),
        );
        assert_eq!(village.utilities.deliver_water(1, 0, 10.0), 10.0);
        village.residents[0].position = Vec2::new(42.0, 36.0);
        village.residents[0].health.levels[Need::Hydration as usize] = 40.0;
        village.choose_need(0, &catalog, &stock, site, 0.0);
        assert_eq!(
            village.residents[0].health.task.as_ref().unwrap().facility,
            Some(1)
        );

        village.utilities.toggle(0);
        village.tick_health(&catalog, &setup, &mut stock, site, 1.0, 0.1);
        assert!(village.residents[0].health.task.is_none());
        assert!(village.residents[0].path.is_empty());
        assert_eq!(village.residents[0].health.retry_at, 6.0);
    }

    #[test]
    fn a_stalled_drinking_trip_expires_and_retries_after_a_short_delay() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let terrain = setup.terrain();
        let land = Land::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut village = Construction::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        village.tick_services(&catalog, &setup, &mut stock, 0.0, 0.1);
        village.residents[0].health.levels[Need::Hydration as usize] = 40.0;
        village.choose_need(0, &catalog, &stock, site, 0.0);
        village.tick_health(&catalog, &setup, &mut stock, site, 0.0, 0.1);
        let saved = serde_json::to_vec(&village).unwrap();
        let mut resumed: Construction = serde_json::from_slice(&saved).unwrap();
        resumed.tick_health(&catalog, &setup, &mut stock, site, 241.0, 0.1);
        assert!(resumed.residents[0].health.task.is_none());
        assert_eq!(resumed.residents[0].health.retry_at, 256.0);
        assert!(resumed.residents[0].path.is_empty());
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
