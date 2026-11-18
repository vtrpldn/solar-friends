mod farm_work;
mod gather_work;
mod production_work;
mod resident_work;
mod town_pickup;
mod trade_work;
mod work_shift;

use std::collections::VecDeque;

use bevy::prelude::*;
use serde::{Deserialize, Serialize};

use crate::{
    arrival::{ARRIVAL_SPOTS, MAP_START, ROAD_END, road_center, road_width, world_position},
    catalog::{Catalog, Project},
    farming::Farming,
    gathering::{GatherPhase, Gathering},
    land::Land,
    livestock::Livestock,
    market::{Market, trip_seconds},
    navigation::route,
    production::Production,
    residents::{Health, Need},
    stock::Stock,
    terrain::Terrain,
    town_work::TownWork,
    trade::Trade,
    utilities::{Facility, Utilities},
};

const CATEGORIES: [&str; 10] = [
    "Camp essentials",
    "Homes & shelter",
    "Food & farming",
    "Animals",
    "Water & sanitation",
    "Power",
    "Storage & production",
    "Paths & boundaries",
    "Community & leisure",
    "All",
];
const PAGE_KEYS: [KeyCode; 8] = [
    KeyCode::Digit1,
    KeyCode::Digit2,
    KeyCode::Digit3,
    KeyCode::Digit4,
    KeyCode::Digit5,
    KeyCode::Digit6,
    KeyCode::Digit7,
    KeyCode::Digit8,
];

const STOCKPILE: IVec2 = IVec2::new(32, -13);
const SUPPLY_SPOTS: [IVec2; 5] = [
    IVec2::new(31, -13),
    IVec2::new(33, -13),
    IVec2::new(32, -12),
    IVec2::new(31, -12),
    IVec2::new(33, -12),
];

#[derive(Clone, Copy)]
pub struct ConstructionSite<'a> {
    pub terrain: &'a Terrain,
    pub land: &'a Land,
    pub camp: IVec2,
}

#[derive(Clone, Copy)]
pub struct TownClock {
    pub seconds: f64,
    pub round_trip_km: u32,
}

#[derive(Deserialize, Serialize)]
struct TownTrip {
    project: usize,
    #[serde(default)]
    farm_bed: Option<usize>,
    #[serde(default)]
    export: bool,
    driver: usize,
    elapsed: f64,
    duration: f64,
    boarded: bool,
}

#[derive(Deserialize, Serialize)]
pub struct Construction {
    #[serde(skip)]
    pub menu: bool,
    #[serde(skip)]
    selection: Option<String>,
    #[serde(skip)]
    category: usize,
    #[serde(skip)]
    page: usize,
    #[serde(skip)]
    rotation: u8,
    #[serde(skip)]
    status: String,
    #[serde(default)]
    slow_sandbox: bool,
    plans: Vec<Blueprint>,
    #[serde(default)]
    market: Market,
    #[serde(default)]
    pub trade: Trade,
    #[serde(default)]
    pub gathering: Gathering,
    #[serde(default)]
    pub farming: Farming,
    #[serde(default)]
    livestock: Livestock,
    #[serde(default)]
    pub production: Production,
    #[serde(default)]
    pub utilities: Utilities,
    #[serde(default)]
    trip: Option<TownTrip>,
    residents: [Worker; 5],
}

#[derive(Deserialize, Serialize)]
struct Blueprint {
    key: String,
    position: IVec2,
    size: IVec2,
    rotation: u8,
    loads: u32,
    delivered: u32,
    work: f64,
    #[serde(default)]
    pickups: u32,
    #[serde(default)]
    fare: u64,
}

#[derive(Clone, Copy, PartialEq, Deserialize, Serialize)]
enum Activity {
    Collect,
    Carry,
    Walk,
    Build,
}

#[derive(Deserialize, Serialize)]
struct Assignment {
    project: usize,
    spot: IVec2,
    activity: Activity,
    to_site: VecDeque<Vec2>,
}

#[derive(Deserialize, Serialize)]
pub struct Worker {
    pub position: Vec2,
    pub yaw: f32,
    speed: f32,
    path: VecDeque<Vec2>,
    assignment: Option<Assignment>,
    experience: f64,
    retry: f32,
    #[serde(default)]
    health: Health,
    #[serde(default)]
    town_work: TownWork,
}

impl Default for Construction {
    fn default() -> Self {
        Self {
            menu: false,
            selection: None,
            category: 0,
            page: 0,
            rotation: 0,
            status: String::new(),
            slow_sandbox: false,
            plans: Vec::new(),
            market: Market::default(),
            trade: Trade::default(),
            gathering: Gathering::default(),
            farming: Farming::default(),
            livestock: Livestock::default(),
            production: Production::default(),
            utilities: Utilities::default(),
            trip: None,
            residents: std::array::from_fn(|index| {
                let (x, z) = ARRIVAL_SPOTS[index];
                Worker {
                    position: Vec2::new(x, z),
                    yaw: 0.0,
                    speed: 0.0,
                    path: VecDeque::new(),
                    assignment: None,
                    experience: 0.0,
                    retry: 0.0,
                    health: Health::new(index),
                    town_work: TownWork::default(),
                }
            }),
        }
    }
}

impl Worker {
    fn move_along_path(&mut self, dt: f32, carrying: bool) {
        let Some(&next) = self.path.front() else {
            self.speed = 0.0;
            return;
        };
        let offset = next - self.position;
        let distance = offset.length();
        self.speed = (self.speed + dt * 1.8).min(if carrying { 0.72 } else { 0.95 });
        let step = self.speed * dt;
        if distance > 0.001 {
            self.yaw = offset.x.atan2(offset.y);
        }
        if distance <= step {
            self.position = next;
            self.path.pop_front();
        } else {
            self.position += offset / distance * step;
        }
    }
}

impl Construction {
    pub fn is_placing(&self) -> bool {
        self.selection.is_some()
    }

    fn options<'a>(&self, catalog: &'a Catalog) -> Vec<(&'a String, &'a Project)> {
        let category = CATEGORIES[self.category];
        let mut projects: Vec<_> = catalog
            .projects
            .iter()
            .filter(|(_, project)| match category {
                "All" => true,
                "Camp essentials" => project.camp_essential,
                _ => project.category == category,
            })
            .collect();
        if category == "Camp essentials" {
            let rank = ["gathering", "well", "shelter", "toilet"];
            projects.sort_by_key(|(id, _)| rank.iter().position(|key| *key == id.as_str()));
        } else {
            projects.sort_by(|(_, a), (_, b)| a.name.cmp(&b.name));
        }
        projects
    }

    pub fn input(&mut self, keyboard: &ButtonInput<KeyCode>, catalog: &Catalog) {
        if keyboard.just_pressed(KeyCode::KeyB) {
            self.menu = !self.menu;
            self.selection = None;
            self.status.clear();
        }
        if !self.menu {
            return;
        }
        if keyboard.just_pressed(KeyCode::Tab) {
            let reverse = keyboard.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]);
            self.category =
                (self.category + if reverse { CATEGORIES.len() - 1 } else { 1 }) % CATEGORIES.len();
            self.page = 0;
            self.selection = None;
            self.status.clear();
        }
        let options = self.options(catalog);
        let pages = options.len().div_ceil(PAGE_KEYS.len()).max(1);
        if keyboard.just_pressed(KeyCode::PageDown) {
            self.page = (self.page + 1) % pages;
            self.selection = None;
        } else if keyboard.just_pressed(KeyCode::PageUp) {
            self.page = (self.page + pages - 1) % pages;
            self.selection = None;
        }
        if let Some(index) = PAGE_KEYS.iter().position(|key| keyboard.just_pressed(*key))
            && let Some((id, _)) = options.get(self.page * PAGE_KEYS.len() + index)
        {
            self.selection = Some((*id).clone());
            self.rotation = 0;
            self.status.clear();
        }
        if self.selection.is_some() && keyboard.just_pressed(KeyCode::KeyR) {
            self.rotation = (self.rotation + 1) % 4;
        }
    }

    pub fn auto_buy_status(&self) -> &'static str {
        if self.market.auto_buy_off {
            "U Auto-buy off"
        } else {
            "U Auto-buy on"
        }
    }

    pub fn toggle_auto_buy(&mut self) {
        self.market.auto_buy_off = !self.market.auto_buy_off;
    }

    pub fn driver_away(&self, index: usize) -> bool {
        self.trip
            .as_ref()
            .is_some_and(|trip| trip.driver == index && trip.boarded)
    }

    pub fn car_trip(&self, index: usize) -> Option<(f64, f64)> {
        self.trip
            .as_ref()
            .filter(|trip| index == 0 && trip.boarded)
            .map(|trip| (trip.elapsed, trip.duration))
    }

    pub fn toggle_sandbox_construction(&mut self) {
        self.slow_sandbox = !self.slow_sandbox;
    }

    pub fn sandbox_status(&self) -> &'static str {
        if self.slow_sandbox {
            "I Instant build off"
        } else {
            "I Instant build on"
        }
    }

    pub fn instructions(&self, catalog: &Catalog) -> String {
        if !self.menu {
            return "B Build · Space Pause · 1–4 Speed".into();
        }
        if let Some(key) = &self.selection {
            let definition = &catalog.projects[key];
            let degrees = u32::from(self.rotation) * 90;
            return format!(
                "{} · {} loads · {:.0} work seconds\nClick to plan · R Rotate ({degrees}°) · B Close\n{}",
                definition.name,
                catalog.loads(definition),
                definition.work,
                self.status
            );
        }
        let options = self.options(catalog);
        let pages = options.len().div_ceil(PAGE_KEYS.len()).max(1);
        let list = options
            .iter()
            .skip(self.page * PAGE_KEYS.len())
            .take(PAGE_KEYS.len())
            .enumerate()
            .map(|(i, (_, definition))| format!("{} {}", i + 1, definition.name))
            .collect::<Vec<_>>()
            .join("\n");
        format!(
            "{} · {}/{}\nTab Category · Page Up/Down · B Close\n{list}\n{}",
            CATEGORIES[self.category],
            self.page + 1,
            pages,
            self.status
        )
    }

    pub fn plan(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        site: ConstructionSite,
        position: IVec2,
        clock: TownClock,
    ) {
        let Some(key) = &self.selection else { return };
        let ConstructionSite {
            terrain,
            land,
            camp,
        } = site;
        let definition = &catalog.projects[key];
        let mut blueprint = Blueprint {
            key: key.clone(),
            position,
            size: size(definition, self.rotation),
            rotation: self.rotation,
            loads: catalog.loads(definition),
            delivered: 0,
            work: 0.0,
            pickups: 0,
            fare: 0,
        };
        if let Some(error) = self.placement_error(
            terrain,
            land,
            camp,
            &blueprint,
            definition,
            (catalog, stock.sandbox),
        ) {
            self.status = error.into();
            return;
        }
        if !stock.sandbox {
            let quote = match self.market.quote(
                catalog,
                &definition.materials,
                stock,
                clock.seconds,
                clock.round_trip_km,
            ) {
                Ok(quote) => quote,
                Err(error) => {
                    self.status = error;
                    return;
                }
            };
            blueprint.pickups = quote.trips;
            blueprint.fare = quote.fare;
            self.market.reserve(stock, &definition.materials, &quote);
        }
        self.status = if stock.sandbox && !self.slow_sandbox && key != "road" {
            blueprint.delivered = blueprint.loads;
            blueprint.work = definition.work;
            format!("{} built.", definition.name)
        } else if stock.sandbox {
            format!("{} planned.", definition.name)
        } else if blueprint.pickups > 0 {
            format!(
                "{} planned. Missing materials ordered for town pickup.",
                definition.name
            )
        } else {
            format!("{} planned. Materials reserved.", definition.name)
        };
        self.plans.push(blueprint);
        self.selection = None;
    }

    fn placement_error(
        &self,
        terrain: &Terrain,
        land: &Land,
        camp: IVec2,
        blueprint: &Blueprint,
        definition: &Project,
        (catalog, sandbox): (&Catalog, bool),
    ) -> Option<&'static str> {
        if !sandbox
            && !definition.repeatable
            && self
                .plans
                .iter()
                .any(|project| project.key == blueprint.key)
        {
            return Some("Already planned.");
        }
        let start = blueprint.position;
        let bridge = blueprint.key == "bridge";
        let road = blueprint.key == "road";
        let riverside = matches!(definition.kind.as_str(), "hydro" | "water-pump");
        let near_river = |cell: Vec2, margin: f64| {
            let Vec2 { x, y: z } = world_position(cell.x, cell.y);
            let (center, width) = terrain.river(f64::from(z));
            (f64::from(x) - center).abs() <= width + 1.9 + margin
        };
        let end = start + blueprint.size;
        if start.cmplt(IVec2::splat(-30)).any() || end.cmpgt(IVec2::splat(94)).any() {
            return Some("Keep buildings inside the plot boundary.");
        }
        if bridge {
            let along = if blueprint.rotation.is_multiple_of(2) {
                IVec2::X
            } else {
                IVec2::Y
            };
            let length = blueprint.size.max_element();
            let middle = start.as_vec2() + along.as_vec2() * (length - 1) as f32 * 0.5;
            if !near_river(middle, 0.0)
                || near_river((start - along).as_vec2(), 0.7)
                || near_river((start + along * length).as_vec2(), 0.7)
            {
                return Some("Span the river with both bridge ends on dry land.");
            }
        }
        if definition.kind == "hydro"
            && !near_river(start.as_vec2() + blueprint.size.as_vec2() * 0.5, 3.0)
        {
            return Some("Place the generator beside the river.");
        }
        if definition.kind == "water-pump"
            && !near_river(start.as_vec2() + Vec2::splat(0.5), 3.0)
            && !self.plans.iter().any(|project| {
                project.key == "groundwater-well"
                    && project.work >= catalog.projects[&project.key].work
                    && (project.position - start).as_vec2().length() <= 6.0
            })
        {
            return Some("Place the pump beside the river or a completed well.");
        }
        let overlaps = |plot_start: IVec2, plot_end: IVec2| {
            start.cmplt(plot_end).all() && end.cmpgt(plot_start).all()
        };
        if overlaps(camp + IVec2::new(-1, -3), camp + IVec2::new(4, 1)) {
            return Some("Leave the tents clear.");
        }
        if overlaps(STOCKPILE, STOCKPILE + IVec2::ONE) {
            return Some("Leave the supplies accessible.");
        }
        if self
            .plans
            .iter()
            .any(|other| overlaps(other.position, other.position + other.size))
        {
            return Some("Another project occupies that space.");
        }
        for column in start.x..end.x {
            for row in start.y..end.y {
                if land
                    .site_at(IVec2::new(column, row))
                    .is_some_and(|index| !self.gathering.felled(index))
                {
                    return Some("A tree or natural resource occupies that space.");
                }
                let Vec2 { x, y: z } = world_position(column as f32, row as f32);
                if !road
                    && (MAP_START..=ROAD_END).contains(&z)
                    && (x - road_center(z)).abs() < road_width(z) + 1.0
                {
                    return Some("Keep the access road and parking clear.");
                }
                if !bridge && !riverside && near_river(Vec2::new(column as f32, row as f32), 1.0) {
                    return Some("Keep projects back from the riverbank.");
                }
            }
        }
        None
    }

    pub fn draw(&self, catalog: &Catalog, terrain: &Terrain, gizmos: &mut Gizmos) {
        for plan in self
            .plans
            .iter()
            .filter(|plan| plan.work < catalog.projects[&plan.key].work)
        {
            let left_top =
                world_position(plan.position.x as f32, plan.position.y as f32) - Vec2::ONE;
            let right_bottom = left_top + plan.size.as_vec2() * 2.0;
            let corners = [
                left_top,
                Vec2::new(left_top.x, right_bottom.y),
                right_bottom,
                Vec2::new(right_bottom.x, left_top.y),
                left_top,
            ];
            gizmos.linestrip(
                corners.map(|point| {
                    Vec3::new(point.x, terrain.height_at(point.x, point.y) + 0.1, point.y)
                }),
                Color::srgb_u8(230, 244, 158),
            );
        }
    }
}

impl Construction {
    pub fn tick_services(
        &mut self,
        catalog: &Catalog,
        setup: &crate::setup::WorldSetup,
        stock: &mut Stock,
        clock: f64,
        dt: f64,
    ) {
        self.utilities.sync(
            self.plans
                .iter()
                .enumerate()
                .filter_map(|(index, project)| {
                    let definition = &catalog.projects[&project.key];
                    if project.work < definition.work {
                        return None;
                    }
                    let working = self.production.jobs.iter().any(|job| {
                        job.site == index
                            && job.phase == crate::production::Phase::Work
                            && !catalog.production[&job.recipe].handcraft
                    });
                    Some(Facility {
                        id: index + 1,
                        kind: &definition.kind,
                        location: project.position,
                        size: project.size,
                        batteries: definition.materials.get("batteries").copied().unwrap_or(0),
                        panels: definition.materials.get("panels").copied().unwrap_or(0),
                        working,
                    })
                }),
        );
        self.utilities
            .tick(setup, stock, self.market.committed_fares(), clock, dt);
    }

    pub fn valid_save(&self, catalog: &Catalog, stock: &Stock) -> bool {
        let active = self
            .trip
            .as_ref()
            .filter(|trip| trip.boarded && trip.farm_bed.is_none() && !trip.export)
            .map(|trip| trip.project);
        let fares = self
            .plans
            .iter()
            .enumerate()
            .fold(0u64, |total, (index, project)| {
                let trips = project
                    .pickups
                    .saturating_sub(u32::from(active == Some(index)));
                total.saturating_add(project.fare.saturating_mul(u64::from(trips)))
            });
        let fares = self.farming.jobs.iter().fold(fares, |total, job| {
            let paid = self.trip.as_ref().is_some_and(|trip| {
                trip.boarded && trip.project == job.site && trip.farm_bed == Some(job.bed)
            });
            total.saturating_add(
                job.fare
                    .saturating_mul(u64::from(job.pickups.saturating_sub(u32::from(paid)))),
            )
        });
        let export_paid = self
            .trip
            .as_ref()
            .is_some_and(|trip| trip.export && trip.boarded);
        let fares = self
            .trade
            .orders
            .iter()
            .enumerate()
            .fold(fares, |total, (index, order)| {
                if index == 0 && export_paid {
                    total
                } else {
                    total.saturating_add(order.fare)
                }
            });
        let trip_valid = self.trip.as_ref().is_none_or(|trip| {
            trip.driver < self.residents.len()
                && if trip.export {
                    self.trade.orders.front().is_some()
                } else if let Some(bed) = trip.farm_bed {
                    self.farming
                        .jobs
                        .iter()
                        .any(|job| job.site == trip.project && job.bed == bed && job.pickups > 0)
                } else {
                    self.plans
                        .get(trip.project)
                        .is_some_and(|project| project.pickups > 0)
                }
                && (0.0..=trip.duration).contains(&trip.elapsed)
                && (0.0..=500.0).contains(&trip.duration)
        });
        let services_valid = self.utilities.valid_save(|index, kind| {
            self.plans
                .get(index)
                .and_then(|project| catalog.projects.get(&project.key))
                .is_some_and(|definition| definition.kind == kind)
        });
        let farms_valid = self.farming.valid_save(|index| {
            self.plans.get(index).is_some_and(|project| {
                matches!(project.key.as_str(), "garden" | "greenhouse" | "field")
            })
        });
        let animals_valid = self.livestock.animals.iter().all(|(index, pen)| {
            self.plans
                .get(*index)
                .and_then(|plan| catalog.projects.get(&plan.key))
                .and_then(|definition| catalog.animal_rations.get(&definition.kind))
                .is_some_and(|ration| pen.valid(ration))
        });
        if !self.trade.valid(catalog)
            || !animals_valid
            || !farms_valid
            || !services_valid
            || !trip_valid
            || !self.market.valid_save(catalog, stock, fares)
            || !self.valid_production(catalog)
        {
            return false;
        }
        self.plans.len() <= 128 * 128
            && self.plans.iter().all(|plan| {
                catalog.projects.get(&plan.key).is_some_and(|definition| {
                    plan.rotation <= 3
                        && plan.position.cmpge(IVec2::splat(-30)).all()
                        && plan.position.cmple(IVec2::splat(94)).all()
                        && plan.size == size(definition, plan.rotation)
                        && (plan.position + plan.size).cmple(IVec2::splat(94)).all()
                        && plan.loads == catalog.loads(definition)
                        && plan.delivered <= plan.loads
                        && (plan.pickups == 0 || plan.delivered == 0 && plan.work == 0.0)
                        && (0.0..=definition.work).contains(&plan.work)
                        && (plan.delivered == plan.loads || plan.work == 0.0)
                })
            })
            && self.residents.iter().all(|worker| {
                let in_bounds = |point: Vec2| {
                    point.cmpge(Vec2::splat(-31.0)).all() && point.cmple(Vec2::splat(94.0)).all()
                };
                worker.health.valid()
                    && in_bounds(worker.position)
                    && worker.path.len() <= 128 * 128
                    && worker.path.iter().copied().all(in_bounds)
                    && worker.assignment.as_ref().is_none_or(|job| {
                        job.project < self.plans.len()
                            && job.to_site.len() <= 128 * 128
                            && job.to_site.iter().copied().all(in_bounds)
                    })
            })
    }

    pub fn latest_progress(&self, catalog: &Catalog) -> Option<String> {
        let project = self.plans.last()?;
        let definition = &catalog.projects[&project.key];
        let status = if project.work >= definition.work {
            "Ready".into()
        } else if project.pickups > 0 {
            format!("{} town pickup(s) remaining", project.pickups)
        } else if project.delivered < project.loads {
            format!("{} of {} loads delivered", project.delivered, project.loads)
        } else {
            format!("{:.0}% built", project.work / definition.work * 100.0)
        };
        Some(format!("{}: {status}", definition.name))
    }

    pub fn worker(&self, index: usize) -> &Worker {
        &self.residents[index]
    }

    pub fn finished_models<'a>(
        &'a self,
        catalog: &'a Catalog,
    ) -> impl Iterator<Item = (usize, usize, Vec2, f32)> + 'a {
        self.plans
            .iter()
            .enumerate()
            .filter_map(|(index, project)| {
                if project.work < catalog.projects[&project.key].work {
                    return None;
                }
                let model = catalog.projects[&project.key].model;
                let base = project.position.as_vec2() + (project.size.as_vec2() - Vec2::ONE) * 0.5;
                Some((
                    index,
                    model,
                    world_position(base.x, base.y),
                    f32::from(project.rotation) * std::f32::consts::FRAC_PI_2,
                ))
            })
    }

    pub fn tick(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        site: ConstructionSite,
        clock: TownClock,
        dt: f32,
    ) {
        let ConstructionSite {
            terrain,
            land,
            camp,
        } = site;
        self.trade.auto_sell(
            catalog,
            stock,
            &mut self.market,
            clock.seconds,
            crate::market::fare_cents(clock.round_trip_km),
        );
        self.tick_shifts(catalog, stock, site, clock, dt);
        self.tick_trip(catalog, stock, site, clock, dt);
        self.tick_gathering(catalog, stock, site, clock.seconds, dt);
        self.tick_production(catalog, stock, site, clock.seconds, dt);
        self.tick_farm_jobs(catalog, stock, site, clock.seconds, dt);
        for index in 0..self.residents.len() {
            if self.trip.as_ref().is_some_and(|trip| trip.driver == index)
                || self.gathering.workers_at_site(index)
                || self.production.has_worker(index)
                || self.farming.has_worker(index)
                || self.residents[index].health.task.is_some()
                || self.residents[index].town_work.active()
            {
                continue;
            }
            if let Some(job) = &self.residents[index].assignment {
                let project = &self.plans[job.project];
                if project.work >= catalog.projects[&project.key].work {
                    self.residents[index].assignment = None;
                    self.residents[index].path.clear();
                }
            }
            if self.residents[index].assignment.is_none() {
                self.residents[index].retry -= dt;
                if self.residents[index].retry <= 0.0 {
                    self.assign(index, catalog, terrain, land, camp);
                    self.residents[index].retry = 2.0;
                }
            }
            let worker = &mut self.residents[index];
            let Some(mut job) = worker.assignment.take() else {
                continue;
            };
            worker.move_along_path(dt, job.activity == Activity::Carry);
            if !worker.path.is_empty() {
                worker.assignment = Some(job);
                continue;
            }
            let project = &mut self.plans[job.project];
            match job.activity {
                Activity::Collect => {
                    worker.path = std::mem::take(&mut job.to_site);
                    job.activity = Activity::Carry;
                }
                Activity::Carry => {
                    project.delivered += 1;
                    if project.delivered < project.loads {
                        continue;
                    }
                    job.activity = Activity::Build;
                }
                Activity::Walk => job.activity = Activity::Build,
                Activity::Build => {
                    let crew = self
                        .residents
                        .iter()
                        .filter(|other| {
                            other.assignment.as_ref().is_some_and(|other| {
                                other.project == job.project && other.activity == Activity::Build
                            })
                        })
                        .count();
                    let worker = &mut self.residents[index];
                    let skilled = catalog.residents[index].strengths.contains(&project.key);
                    let skill = if skilled { 1.25 } else { 1.0 };
                    let experience = 1.0 + (worker.experience / 10_000.0).min(0.15);
                    let efficiency = 1.0 / (1.0 + 0.12 * crew as f64);
                    project.work = (project.work
                        + f64::from(dt)
                            * skill
                            * experience
                            * efficiency
                            * worker.health.hydration_factor())
                    .min(catalog.projects[&project.key].work);
                    worker.experience += f64::from(dt);
                    worker.health.energy = (worker.health.energy - f64::from(dt) * 0.16).max(0.0);
                }
            }
            self.residents[index].assignment = Some(job);
        }
    }

    fn assign(
        &mut self,
        index: usize,
        catalog: &Catalog,
        terrain: &Terrain,
        land: &Land,
        camp: IVec2,
    ) {
        let position = self.residents[index].position;
        for (id, project) in self.plans.iter().enumerate() {
            let definition = &catalog.projects[&project.key];
            if project.pickups > 0 || project.work >= definition.work {
                continue;
            }
            let crew: Vec<_> = self
                .residents
                .iter()
                .filter_map(|worker| worker.assignment.as_ref().filter(|job| job.project == id))
                .collect();
            let limit = ((definition.work / 350.0).ceil() as usize)
                .max(((project.size.x * project.size.y) as usize).div_ceil(2))
                .clamp(2, 3);
            if crew.len() >= limit
                || (project.delivered < project.loads
                    && project.delivered + crew.len() as u32 >= project.loads)
            {
                continue;
            }
            let hauling = project.delivered < project.loads;
            let supply = SUPPLY_SPOTS[index];
            let start = if hauling { supply.as_vec2() } else { position };
            let mut spots = Vec::new();
            for z in 0..project.size.y {
                spots.extend([IVec2::new(-1, z), IVec2::new(project.size.x, z)]);
            }
            for x in 0..project.size.x {
                spots.extend([IVec2::new(x, project.size.y), IVec2::new(x, -1)]);
            }
            spots.iter_mut().for_each(|spot| *spot += project.position);
            spots.sort_by(|a, b| {
                a.as_vec2()
                    .distance_squared(start)
                    .total_cmp(&b.as_vec2().distance_squared(start))
            });
            let path = |from, to| {
                route(
                    from,
                    to,
                    |cell| self.blocked(catalog, terrain, land, camp, cell),
                    access_road,
                )
            };
            let Some((spot, to_site)) = spots
                .into_iter()
                .filter(|spot| !crew.iter().any(|worker| worker.spot == *spot))
                .find_map(|spot| path(start, spot).map(|route| (spot, route)))
            else {
                continue;
            };
            let (path, to_site, activity) = if hauling {
                let Some(to_supply) = path(position, supply) else {
                    continue;
                };
                (to_supply, to_site, Activity::Collect)
            } else {
                (to_site, VecDeque::new(), Activity::Walk)
            };
            let worker = &mut self.residents[index];
            worker.path = path;
            worker.assignment = Some(Assignment {
                project: id,
                spot,
                to_site,
                activity,
            });
            return;
        }
    }

    fn blocked(
        &self,
        catalog: &Catalog,
        terrain: &Terrain,
        land: &Land,
        camp: IVec2,
        cell: IVec2,
    ) -> bool {
        let Vec2 { x, y: z } = world_position(cell.x as f32, cell.y as f32);
        let (center, width) = terrain.river(f64::from(z));
        let inside = |start: IVec2, end: IVec2| cell.cmpge(start).all() && cell.cmplt(end).all();
        let crossing = self.plans.iter().any(|plan| {
            plan.key == "bridge"
                && plan.work >= catalog.projects[&plan.key].work
                && inside(plan.position, plan.position + plan.size)
        });
        if crossing {
            return false;
        }
        (f64::from(x) - center).abs() <= width + 1.9
            || cell == STOCKPILE
            || land
                .site_at(cell)
                .is_some_and(|index| !self.gathering.felled(index))
            || inside(camp + IVec2::new(-1, -3), camp + IVec2::new(4, 0))
            || self
                .plans
                .iter()
                .any(|plan| plan.key != "road" && inside(plan.position, plan.position + plan.size))
    }
}

fn access_road(cell: IVec2) -> bool {
    let Vec2 { x, y: z } = world_position(cell.x as f32, cell.y as f32);
    (MAP_START..=ROAD_END).contains(&z) && (x - road_center(z)).abs() < road_width(z)
}

fn size(definition: &Project, rotation: u8) -> IVec2 {
    let [width, depth] = definition.size;
    if rotation.is_multiple_of(2) {
        IVec2::new(width, depth)
    } else {
        IVec2::new(depth, width)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::setup::WorldSetup;

    #[test]
    fn timber_batch_reserves_input_and_returns_finished_output() {
        let mut setup = WorldSetup::default();
        setup.mode = crate::setup::Mode::Sandbox;
        let catalog = Catalog::default();
        let terrain = setup.terrain();
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut construction = Construction {
            selection: Some("supply-5".into()),
            ..default()
        };
        construction.plan(
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
        let recipe = &catalog.production["saw_timber"];
        stock.receive(&recipe.input);
        let before = stock.available("wood");
        construction.select_facility(&catalog, IVec2::new(44, 36));
        construction.production.open = true;
        let index = catalog
            .production
            .iter()
            .filter(|(_, recipe)| recipe.kind == "supply-5")
            .position(|(id, _)| id == "saw_timber")
            .unwrap();
        let mut keyboard = ButtonInput::default();
        keyboard.press(PAGE_KEYS[index]);
        construction.production_input(&catalog, &mut stock, &keyboard);
        assert_eq!(stock.available("logs"), 0);
        for step in 0..8_000 {
            let clock = TownClock {
                seconds: f64::from(step) / 10.0,
                round_trip_km: 12,
            };
            construction.tick(&catalog, &mut stock, site, clock, 0.1);
            if construction.production.jobs.is_empty() {
                break;
            }
            assert_eq!(stock.available("wood"), before);
        }
        assert_eq!(stock.available("wood"), before + recipe.output["wood"]);
    }

    #[test]
    fn gathered_goods_enter_stock_only_after_the_return_walk() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let terrain = setup.terrain();
        let land = Land::generate(&setup);
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        let mut construction = Construction::default();
        let deposit = land.site_at(IVec2::new(45, -26)).unwrap();
        construction.gathering.select(&land, Some(deposit));
        construction
            .gathering
            .queue(&catalog, &land, terrain.seed, setup.richness(), 0.0);
        let output = catalog.gathering["stone"].output["stone"];
        let mut returning = false;
        for step in 0..2_000 {
            let clock = TownClock {
                seconds: f64::from(step) / 10.0,
                round_trip_km: 12,
            };
            construction.tick(&catalog, &mut stock, site, clock, 0.1);
            if construction.gathering.orders.is_empty() {
                break;
            }
            returning |= construction.gathering.orders[&deposit].phase == GatherPhase::Return;
            assert_eq!(stock.available("stone"), 0);
        }
        assert!(returning);
        assert_eq!(stock.available("stone"), output);
    }

    #[test]
    fn residents_wait_for_town_pickup_before_cistern_hauling() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let terrain = setup.terrain();
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        let mut construction = Construction {
            selection: Some("well".into()),
            ..default()
        };
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        construction.plan(&catalog, &mut stock, site, IVec2::new(44, 36), clock);
        assert_eq!(construction.plans[0].pickups, 1);
        for _ in 0..1_000 {
            if construction.plans[0].pickups == 0 {
                break;
            }
            assert_eq!(construction.plans[0].delivered, 0);
            construction.tick(&catalog, &mut stock, site, clock, 0.1);
        }
        assert_eq!(construction.plans[0].pickups, 0);
        assert_eq!(stock.balance(), 872_824);
        assert!(construction.valid_save(&catalog, &stock));
    }

    #[test]
    fn sandbox_builds_a_catalog_project_without_spending_stock() {
        let mut setup = WorldSetup::default();
        setup.mode = crate::setup::Mode::Sandbox;
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let terrain = setup.terrain();
        let camp = IVec2::new(36, 36);
        let mut construction = Construction {
            selection: Some("home-family".into()),
            ..default()
        };
        let empty = Land::default();
        construction.plan(
            &catalog,
            &mut stock,
            ConstructionSite {
                terrain: &terrain,
                land: &empty,
                camp,
            },
            IVec2::new(44, 36),
            TownClock {
                seconds: 0.0,
                round_trip_km: 12,
            },
        );
        assert_eq!(construction.finished_models(&catalog).count(), 1);
        assert_eq!(stock.available("wood"), 36);
    }

    #[test]
    fn residents_haul_all_reserved_loads_before_assembling() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let terrain = setup.terrain();
        let land = Land::default();
        let camp = IVec2::new(36, 36);
        let mut construction = Construction {
            selection: Some("gathering".into()),
            ..default()
        };
        construction.plan(
            &catalog,
            &mut stock,
            ConstructionSite {
                terrain: &terrain,
                land: &land,
                camp,
            },
            IVec2::new(44, 36),
            TownClock {
                seconds: 0.0,
                round_trip_km: 12,
            },
        );
        let loads = catalog.loads(&catalog.projects["gathering"]);
        for _ in 0..8_000 {
            construction.tick(
                &catalog,
                &mut stock,
                ConstructionSite {
                    terrain: &terrain,
                    land: &land,
                    camp,
                },
                TownClock {
                    seconds: 0.0,
                    round_trip_km: 12,
                },
                0.1,
            );
            let project = &construction.plans[0];
            assert!(project.delivered <= loads);
            if project.delivered < loads {
                assert_eq!(project.work, 0.0);
            }
            if construction.finished_models(&catalog).next().is_some() {
                break;
            }
        }
        assert_eq!(construction.finished_models(&catalog).count(), 1);
        assert_eq!(construction.plans[0].delivered, loads);
        assert_eq!(stock.available("wood"), 28);
    }

    #[test]
    fn blueprint_reserves_supplies_only_after_valid_placement() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let terrain = setup.terrain();
        let land = Land::default();
        let camp = IVec2::new(36, 36);
        let mut construction = Construction {
            selection: Some("gathering".into()),
            ..default()
        };

        construction.plan(
            &catalog,
            &mut stock,
            ConstructionSite {
                terrain: &terrain,
                land: &land,
                camp,
            },
            camp,
            TownClock {
                seconds: 0.0,
                round_trip_km: 12,
            },
        );
        assert_eq!(stock.available("wood"), 36);
        assert!(construction.plans.is_empty());

        construction.plan(
            &catalog,
            &mut stock,
            ConstructionSite {
                terrain: &terrain,
                land: &land,
                camp,
            },
            IVec2::new(44, 36),
            TownClock {
                seconds: 0.0,
                round_trip_km: 12,
            },
        );
        assert_eq!(stock.available("wood"), 28);
        assert_eq!(stock.available("hardware"), 6);
        assert_eq!(construction.plans.len(), 1);

        construction.selection = Some("well".into());
        construction.market.auto_buy_off = true;
        construction.plan(
            &catalog,
            &mut stock,
            ConstructionSite {
                terrain: &terrain,
                land: &land,
                camp,
            },
            IVec2::new(50, 36),
            TownClock {
                seconds: 0.0,
                round_trip_km: 12,
            },
        );
        assert_eq!(stock.available("hardware"), 6);
        assert_eq!(construction.plans.len(), 1);
    }
}
