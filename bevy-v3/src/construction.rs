mod chains_lens;
mod events;
mod farm_work;
pub(crate) use farm_work::FarmControl;
mod food_lens;
mod gather_work;
mod inventory;
pub(crate) use inventory::{INVENTORY_ROWS, InventoryView, inventory_rows};
mod kitchen_work;
mod lab_orders;
pub(crate) use lab_orders::{LabOrder, LabStop};
mod leisure;
mod lifecycle;
mod opening;
pub(crate) use lifecycle::ProjectAction;
mod production_work;
mod project_list;
mod resident_work;
mod roads;
mod town_pickup;
mod trade_work;
pub(crate) use trade_work::{SaleSetting, TradeOrder, TradePolicy};
mod upkeep;
mod water_work;
mod work_lens;
mod work_policy;
pub(crate) use work_policy::WorkGroup;
mod work_shift;

pub use water_work::WaterAction;

use std::{
    collections::{BTreeMap, VecDeque},
    sync::Arc,
};

use bevy::prelude::*;
use serde::{Deserialize, Serialize};

use crate::{
    arrival::{ARRIVAL_SPOTS, MAP_START, ROAD_END, road_center, road_width, world_position},
    catalog::{Catalog, Project},
    equipment::Task as ToolTask,
    farming::Farming,
    gathering::{GatherPhase, Gathering},
    land::Land,
    livestock::Livestock,
    market::{Market, trip_seconds},
    navigation::route,
    production::Production,
    residents::{Health, Need},
    stock::Stock,
    terrain::{Foundation, Terrain},
    town_work::TownWork,
    trade::Trade,
    utilities::{Facility, Utilities},
};

fn construction_crew_limit(definition: &Project, size: IVec2) -> usize {
    ((definition.work / 350.0).ceil() as usize)
        .max((size.x as usize * size.y as usize).div_ceil(2))
        .clamp(2, 3)
}

fn construction_crew_efficiency(builders: usize) -> f64 {
    1.0 / (1.0 + 0.12 * builders.saturating_sub(1) as f64)
}

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
const STORAGE_EXPANSION: u64 = 600;
pub(crate) const BUILD_ROWS: usize = 8;

pub(crate) const PAGE_KEYS: [KeyCode; BUILD_ROWS] = [
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

impl TownClock {
    pub(crate) fn day(self) -> u64 {
        crate::weather::game_minutes(self.seconds) / 1440
    }
}

#[derive(Clone, Copy, Deserialize, Serialize)]
struct TownTrip {
    project: usize,
    #[serde(default)]
    farm_bed: Option<usize>,
    #[serde(default, alias = "export")]
    market_order: bool,
    #[serde(default)]
    exports: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    return_purchase: Option<usize>,
    driver: usize,
    #[serde(default)]
    vehicle: usize,
    elapsed: f64,
    duration: f64,
    boarded: bool,
}

impl TownTrip {
    fn extra_orders(self) -> impl Iterator<Item = usize> {
        (0..u32::BITS as usize).filter(move |&index| self.exports & (1 << index) != 0)
    }

    fn trade_orders(self) -> impl Iterator<Item = usize> {
        self.market_order
            .then_some(self.project)
            .into_iter()
            .chain(self.extra_orders())
            .chain(self.return_purchase)
    }

    fn covers_order(self, index: usize) -> bool {
        self.return_purchase == Some(index)
            || (self.market_order && self.project == index)
            || (index < u32::BITS as usize && self.exports & (1 << index) != 0)
    }
}

#[derive(Deserialize, Serialize)]
pub struct Construction {
    #[serde(skip)]
    pub menu: bool,
    #[serde(skip)]
    build_query: String,
    #[serde(skip)]
    pub editing_search: bool,
    #[serde(skip)]
    road_planning: roads::RoadPlanning,
    #[serde(skip)]
    selection: Option<String>,
    #[serde(skip)]
    category: Option<usize>,
    #[serde(skip)]
    page: usize,
    #[serde(skip)]
    rotation: u8,
    #[serde(skip, default = "default_field_size")]
    field_size: IVec2,
    #[serde(skip)]
    status: String,
    #[serde(default)]
    slow_sandbox: bool,
    plans: Vec<Blueprint>,
    #[serde(default)]
    events: events::VillageEvents,
    #[serde(default)]
    opening: opening::OpeningMilestones,
    #[serde(default)]
    building_history: VecDeque<lifecycle::DismantledBuilding>,
    #[serde(default)]
    pub foundations: Arc<Vec<Foundation>>,
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
    changes: BTreeMap<usize, lifecycle::ChangeJob>,
    #[serde(default)]
    water_jobs: BTreeMap<usize, water_work::WaterJob>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pending_connections: Vec<(usize, WaterAction)>,
    #[serde(default)]
    upkeep: upkeep::Upkeep,
    #[serde(skip)]
    moving: Option<usize>,
    #[serde(default)]
    priority: Option<usize>,
    #[serde(default)]
    work_policy: work_policy::WorkPolicy,
    #[serde(skip)]
    reservation_pass: Option<[bool; 5]>,
    #[serde(default)]
    trip: Option<TownTrip>,
    #[serde(default)]
    second_trip: Option<TownTrip>,
    #[serde(default)]
    pickup_manifests: [town_pickup::PickupManifest; 2],
    #[serde(default)]
    supplier_construction: bool,
    #[serde(default)]
    construction_delivery: Option<town_pickup::ConstructionDelivery>,
    #[serde(default)]
    logistics_policy: town_pickup::LogisticsPolicy,
    residents: [Worker; 5],
}

#[derive(Clone, Deserialize, Serialize)]
struct Blueprint {
    key: String,
    position: IVec2,
    size: IVec2,
    rotation: u8,
    loads: u32,
    delivered: u32,
    #[serde(default)]
    staged: u32,
    #[serde(default)]
    depot: Option<usize>,
    work: f64,
    #[serde(default)]
    pickups: u32,
    #[serde(default)]
    fare: u64,
    #[serde(default)]
    removed: bool,
    #[serde(default)]
    purchase: Option<lifecycle::Purchase>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    materials_paid: Option<BTreeMap<String, u32>>,
}

impl Blueprint {
    fn materials<'a>(&'a self, catalog: &'a Catalog) -> &'a BTreeMap<String, u32> {
        self.materials_paid
            .as_ref()
            .unwrap_or(&catalog.projects[&self.key].materials)
    }
}

#[derive(Clone, Copy, PartialEq, Deserialize, Serialize)]
enum Activity {
    Collect,
    Carry,
    Walk,
    Build,
}

#[derive(Clone, Copy, Default, Deserialize, Serialize)]
enum Haul {
    #[default]
    Direct,
    Stage {
        depot: usize,
        loads: u32,
    },
    FromDepot {
        depot: usize,
        loads: u32,
    },
}

impl Haul {
    fn depot(self) -> Option<usize> {
        match self {
            Self::Direct => None,
            Self::Stage { depot, .. } | Self::FromDepot { depot, .. } => Some(depot),
        }
    }

    fn loads(self) -> u32 {
        match self {
            Self::Direct => 1,
            Self::Stage { loads, .. } | Self::FromDepot { loads, .. } => loads,
        }
    }
}

#[derive(Deserialize, Serialize)]
struct Assignment {
    project: usize,
    spot: IVec2,
    activity: Activity,
    to_site: VecDeque<Vec2>,
    #[serde(default)]
    haul: Haul,
}

#[derive(Deserialize, Serialize)]
pub struct Worker {
    pub position: Vec2,
    pub yaw: f32,
    speed: f32,
    #[serde(skip, default = "default_walking_pace")]
    walking_pace: f32,
    #[serde(skip)]
    crowded: bool,
    #[serde(skip)]
    sidestep_cells: [Option<IVec2>; 9],
    #[serde(default, skip_serializing_if = "Option::is_none")]
    paused_waypoint: Option<Vec2>,
    #[serde(default, skip_serializing_if = "zero_retry_ticks")]
    route_retry_ticks: u8,
    path: VecDeque<Vec2>,
    assignment: Option<Assignment>,
    experience: f64,
    #[serde(default)]
    craft: crate::production::crafting::Experience,
    retry: f32,
    #[serde(default)]
    health: Health,
    #[serde(default)]
    home: Option<usize>,
    #[serde(default)]
    leisure: leisure::Leisure,
    #[serde(default)]
    town_work: TownWork,
}

impl Default for Construction {
    fn default() -> Self {
        Self {
            menu: false,
            build_query: String::new(),
            editing_search: false,
            road_planning: roads::RoadPlanning::default(),
            selection: None,
            category: None,
            page: 0,
            rotation: 0,
            field_size: default_field_size(),
            status: String::new(),
            slow_sandbox: false,
            plans: Vec::new(),
            events: events::VillageEvents::default(),
            opening: opening::OpeningMilestones::default(),
            building_history: VecDeque::new(),
            foundations: Arc::default(),
            market: Market::default(),
            trade: Trade::default(),
            gathering: Gathering::default(),
            farming: Farming::default(),
            livestock: Livestock::default(),
            production: Production::default(),
            utilities: Utilities::default(),
            changes: BTreeMap::new(),
            water_jobs: BTreeMap::new(),
            pending_connections: Vec::new(),
            upkeep: upkeep::Upkeep::default(),
            moving: None,
            priority: None,
            work_policy: work_policy::WorkPolicy::default(),
            reservation_pass: None,
            trip: None,
            second_trip: None,
            pickup_manifests: Default::default(),
            supplier_construction: false,
            construction_delivery: None,
            logistics_policy: town_pickup::LogisticsPolicy::default(),
            residents: std::array::from_fn(|index| {
                let (x, z) = ARRIVAL_SPOTS[index];
                Worker {
                    position: Vec2::new(x, z),
                    yaw: 0.0,
                    speed: 0.0,
                    walking_pace: default_walking_pace(),
                    crowded: false,
                    sidestep_cells: [None; 9],
                    paused_waypoint: None,
                    route_retry_ticks: 0,
                    path: VecDeque::new(),
                    assignment: None,
                    experience: 0.0,
                    craft: crate::production::crafting::Experience::default(),
                    retry: 0.0,
                    health: Health::new(index),
                    home: None,
                    leisure: leisure::Leisure::default(),
                    town_work: TownWork::default(),
                }
            }),
        }
    }
}

impl Worker {
    fn blocked_construction_project(&self) -> Option<usize> {
        let job = self.assignment.as_ref()?;
        self.waiting_for_route().then_some(job.project)
    }

    fn waiting_for_route(&self) -> bool {
        self.paused_waypoint.is_some() && self.paused_waypoint.as_ref() == self.path.front()
    }

    fn clear_work_route(&mut self) {
        if self.health.task.is_none() && !self.town_work.active() {
            self.path.clear();
            self.paused_waypoint = None;
        }
    }

    fn work_multiplier(&self, profile: &crate::catalog::Profile, project: &str) -> f64 {
        let skill = if profile.strengths.iter().any(|key| key == project) {
            1.25
        } else {
            1.0
        };
        skill * (1.0 + self.experience_bonus()) * self.health.hydration_factor()
    }

    fn experience_bonus(&self) -> f64 {
        (self.experience / 10_000.0).clamp(0.0, 0.15)
    }

    fn move_along_path(&mut self, dt: f32, carrying: bool) {
        self.move_with_pace(dt, carrying, 1.0);
    }

    fn move_with_pace(&mut self, dt: f32, carrying: bool, pace_boost: f32) {
        let Some(&next) = self.path.front() else {
            self.speed = 0.0;
            return;
        };
        if self.paused_waypoint == Some(next) {
            self.speed = 0.0;
            return;
        }
        let offset = next - self.position;
        let distance = offset.length();
        let pace = if carrying { 0.72 } else { 0.95 };
        let fatigue = if self.health.energy < 35.0 { 0.8 } else { 1.0 };
        let braking = if self.path.len() == 1 {
            (distance * 2.0).clamp(0.25, 1.0)
        } else {
            1.0
        };
        self.speed =
            (self.speed + dt * 1.8).min(pace * self.walking_pace * fatigue * braking * pace_boost);
        let step = self.speed * dt * if self.crowded { 0.65 } else { 1.0 };
        if distance > 0.001 {
            self.yaw = offset.x.atan2(offset.y);
        }
        if distance <= step {
            self.position = next;
            self.path.pop_front();
        } else {
            let direction = offset / distance;
            let straight = self.position + direction * step;
            let side = straight + Vec2::new(direction.y, -direction.x) * (dt * 0.18);
            self.position = if self.crowded && distance > 0.1 && self.sidestep_is_clear(side, next)
            {
                side
            } else {
                straight
            };
        }
        self.health.energy = (self.health.energy - f64::from(dt) * 0.025).max(0.0);
    }

    fn sidestep_is_clear(&self, side: Vec2, next: Vec2) -> bool {
        let cell = |point: Vec2| (point + Vec2::splat(0.5)).floor().as_ivec2();
        let [start, side, end] = [self.position, side, next].map(cell);
        let minimum = start.min(side).min(end);
        let maximum = start.max(side).max(end);
        (maximum - minimum).cmple(IVec2::ONE).all()
            && (minimum.x..=maximum.x).all(|x| {
                (minimum.y..=maximum.y)
                    .all(|y| self.sidestep_cells.contains(&Some(IVec2::new(x, y))))
            })
    }
}

fn default_walking_pace() -> f32 {
    1.0
}

fn zero_retry_ticks(ticks: &u8) -> bool {
    *ticks == 0
}

impl Construction {
    pub(crate) fn clear_arrival_positions(&mut self, catalog: &Catalog, site: ConstructionSite) {
        for index in 0..self.residents.len() {
            let position = self.residents[index].position;
            let origin = position.round().as_ivec2();
            let blocked = |cell| self.blocked(catalog, site.terrain, site.land, site.camp, cell);
            if !blocked(origin) {
                continue;
            }
            let destination = (-8..=8)
                .flat_map(|x| (-8..=8).map(move |z| origin + IVec2::new(x, z)))
                .filter(|&cell| {
                    !blocked(cell)
                        && self.residents.iter().enumerate().all(|(other, resident)| {
                            other == index
                                || resident.position.distance_squared(cell.as_vec2()) > 0.49
                        })
                })
                .min_by(|left, right| {
                    left.as_vec2()
                        .distance_squared(position)
                        .total_cmp(&right.as_vec2().distance_squared(position))
                });
            if let Some(cell) = destination {
                self.residents[index].position = cell.as_vec2();
            }
        }
    }

    pub(crate) fn project_count(&self) -> usize {
        self.plans.iter().filter(|plan| !plan.removed).count()
    }

    pub fn refresh_resident_crowding(&mut self, catalog: &Catalog, site: ConstructionSite) {
        let present: [Option<Vec2>; 5] = std::array::from_fn(|index| {
            (!self.driver_away(index) && !self.away_for_work(index))
                .then_some(self.residents[index].position)
        });
        for index in 0..self.residents.len() {
            if present[index].is_some()
                && (self.residents[index].assignment.is_some()
                    || self.production.has_worker(index)
                    || self.working_change(index)
                    || self.working_upkeep(index)
                    || self.working_water(index)
                    || self.gathering.workers_at_site(index)
                    || self.farming.has_worker(index)
                    || self.driver_booked(index)
                    || self.residents[index].town_work.active()
                    || self.residents[index].leisure.visit.is_some()
                    || self.residents[index].health.task.is_some())
            {
                self.refresh_resident_route(index, catalog, site);
            } else {
                self.residents[index].paused_waypoint = None;
                self.residents[index].route_retry_ticks = 0;
            }
            let crowded = present[index].is_some_and(|position| {
                present.iter().enumerate().any(|(other, point)| {
                    index != other
                        && point.is_some_and(|point| {
                            position.distance_squared(point) < 0.75_f32.powi(2)
                        })
                })
            });
            let cells = if crowded {
                let origin = (self.residents[index].position + Vec2::splat(0.5))
                    .floor()
                    .as_ivec2();
                std::array::from_fn(|offset| {
                    let cell = origin + IVec2::new(offset as i32 % 3 - 1, offset as i32 / 3 - 1);
                    (cell.cmpge(IVec2::splat(-31)).all()
                        && cell.cmple(IVec2::splat(94)).all()
                        && !self.blocked(catalog, site.terrain, site.land, site.camp, cell))
                    .then_some(cell)
                })
            } else {
                [None; 9]
            };
            self.residents[index].crowded = crowded;
            self.residents[index].sidestep_cells = cells;
            self.residents[index].walking_pace = 0.92 + index as f32 * 0.035;
        }
    }

    fn refresh_resident_route(&mut self, index: usize, catalog: &Catalog, site: ConstructionSite) {
        let worker = &self.residents[index];
        let grid_count = self.farm_grid_waypoints(index).unwrap_or(worker.path.len());
        let blocked_waypoint = (grid_count > 0).then(|| worker.path[0]).filter(|waypoint| {
            let cell = waypoint.round().as_ivec2();
            cell != worker.position.round().as_ivec2()
                && self.blocked(catalog, site.terrain, site.land, site.camp, cell)
        });
        if blocked_waypoint.is_some()
            && blocked_waypoint == worker.paused_waypoint
            && worker.route_retry_ticks > 0
        {
            self.residents[index].route_retry_ticks -= 1;
            return;
        }
        let replacement = blocked_waypoint
            .and_then(|_| worker.path.get(grid_count - 1))
            .and_then(|&goal| {
                let mut path =
                    self.resident_route(catalog, site, worker.position, goal.round().as_ivec2())?;
                if path.back().copied().unwrap_or(worker.position) != goal {
                    path.push_back(goal);
                }
                path.extend(worker.path.iter().skip(grid_count).copied());
                Some(path)
            });
        let worker = &mut self.residents[index];
        if let Some(path) = replacement {
            worker.path = path;
            worker.paused_waypoint = None;
            worker.route_retry_ticks = 0;
        } else {
            worker.paused_waypoint = blocked_waypoint;
            worker.route_retry_ticks = if blocked_waypoint.is_some() { 9 } else { 0 };
        }
    }

    pub fn protects_terrain(&self, cell: IVec2) -> bool {
        self.plans.iter().any(|plan| {
            !plan.removed
                && cell.cmpge(plan.position - IVec2::splat(2)).all()
                && cell
                    .cmplt(plan.position + plan.size + IVec2::splat(2))
                    .all()
        })
    }

    pub fn is_placing(&self) -> bool {
        self.selection.is_some() || self.moving.is_some()
    }

    fn options<'a>(&self, catalog: &'a Catalog) -> Vec<(&'a String, &'a Project)> {
        let category = CATEGORIES[self.category.unwrap_or_default()];
        let query = self.build_query.trim().to_lowercase();
        catalog
            .build_options()
            .filter(|(_, project)| {
                if !query.is_empty() {
                    return project.search_text.contains(&query);
                }
                match category {
                    "All" => true,
                    "Camp essentials" => project.camp_essential,
                    _ => project.category == category,
                }
            })
            .collect()
    }

    pub fn build_search_input(
        &mut self,
        keys: &ButtonInput<KeyCode>,
        text: &mut MessageReader<bevy::input::keyboard::KeyboardInput>,
    ) -> bool {
        if !self.menu || self.moving.is_some() {
            text.clear();
            return false;
        }
        if keys.just_pressed(KeyCode::Slash) {
            self.toggle_build_search();
            text.clear();
            return true;
        }
        if !self.editing_search {
            text.clear();
            return false;
        }
        if keys.any_just_pressed([KeyCode::Enter, KeyCode::NumpadEnter]) {
            self.editing_search = false;
            text.clear();
            return true;
        }
        read_search_text(&mut self.build_query, text);
        true
    }

    pub fn toggle_build_search(&mut self) {
        self.editing_search = !self.editing_search;
        self.selection = None;
        self.page = 0;
        self.status.clear();
    }

    pub fn toggle_build_menu(&mut self, sandbox: bool) {
        self.menu = !self.menu;
        if self.menu {
            self.category.get_or_insert(usize::from(sandbox));
        } else {
            self.editing_search = false;
        }
        self.selection = None;
        self.status.clear();
    }

    pub fn change_build_category(&mut self, reverse: bool) {
        self.editing_search = false;
        self.build_query.clear();
        let step = if reverse { CATEGORIES.len() - 1 } else { 1 };
        self.category = Some((self.category.unwrap_or_default() + step) % CATEGORIES.len());
        self.page = 0;
        self.selection = None;
        self.status.clear();
    }

    pub fn turn_build_page(&mut self, catalog: &Catalog, forward: bool) {
        let pages = self.options(catalog).len().div_ceil(BUILD_ROWS).max(1);
        self.page = (self.page + if forward { 1 } else { pages - 1 }) % pages;
        self.selection = None;
    }

    pub fn browsing_blueprints(&self) -> bool {
        self.menu && !self.placing_project()
    }

    pub(crate) fn build_heading(&self, catalog: &Catalog) -> String {
        let count = self.options(catalog).len();
        self.build_result_heading(count)
    }

    fn build_result_heading(&self, count: usize) -> String {
        let title = if self.editing_search {
            format!("Search {}▏", self.build_query)
        } else if self.build_query.trim().is_empty() {
            CATEGORIES[self.category.unwrap_or_default()].to_owned()
        } else {
            format!("Search results · {}", self.build_query)
        };
        let unit = if count == 1 { "building" } else { "buildings" };
        format!("{title} · {count} {unit}")
    }

    pub fn build_rows<'a>(&self, catalog: &'a Catalog) -> Vec<(&'a String, &'a Project)> {
        self.options(catalog)
            .into_iter()
            .skip(self.page * BUILD_ROWS)
            .take(BUILD_ROWS)
            .collect()
    }

    pub fn blueprint_already_planned(
        &self,
        key: &str,
        definition: &Project,
        sandbox: bool,
        ignore: Option<usize>,
    ) -> bool {
        !sandbox
            && !definition.repeatable
            && self.plans.iter().enumerate().any(|(index, project)| {
                !project.removed && ignore != Some(index) && project.key == key
            })
    }

    pub fn pick_build_row(&mut self, catalog: &Catalog, row: usize, sandbox: bool) {
        if let Some((key, definition)) = self.build_rows(catalog).get(row) {
            if self.blueprint_already_planned(key, definition, sandbox, None) {
                self.status =
                    "Already planned or built. Select the existing project to manage it.".into();
            } else {
                self.choose_blueprint(key);
            }
        }
    }

    fn choose_blueprint(&mut self, id: &str) {
        self.editing_search = false;
        self.selection = Some(id.to_owned());
        self.rotation = 0;
        self.field_size = default_field_size();
        self.status.clear();
    }

    pub fn rotate_placement(&mut self) {
        self.rotation = (self.rotation + 1) % 4;
    }

    pub fn cancel_placement(&mut self) {
        self.selection = None;
        self.moving = None;
        self.status.clear();
    }

    pub fn placing_field(&self) -> bool {
        self.selection.as_deref() == Some("field")
    }

    pub fn resize_field_placement(&mut self, delta: IVec2) {
        self.field_size = (self.field_size + delta).clamp(IVec2::splat(2), IVec2::splat(32));
    }

    pub fn input(&mut self, keyboard: &ButtonInput<KeyCode>, catalog: &Catalog, sandbox: bool) {
        if self.moving.is_some() {
            if keyboard.just_pressed(KeyCode::KeyR) {
                self.rotate_placement();
            }
            if keyboard.just_pressed(KeyCode::KeyB) {
                self.cancel_placement();
            }
            return;
        }
        if keyboard.just_pressed(KeyCode::KeyB) {
            self.toggle_build_menu(sandbox);
        }
        if !self.menu {
            return;
        }
        if keyboard.just_pressed(KeyCode::Tab) {
            self.change_build_category(
                keyboard.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]),
            );
        }
        if keyboard.any_just_pressed([KeyCode::PageDown, KeyCode::PageUp]) {
            self.turn_build_page(catalog, keyboard.just_pressed(KeyCode::PageDown));
        }
        if let Some(index) = PAGE_KEYS.iter().position(|key| keyboard.just_pressed(*key)) {
            self.pick_build_row(catalog, index, sandbox);
        }
        if self.placing_field()
            && let Some(delta) = field_size_input(keyboard)
        {
            self.resize_field_placement(delta);
        }
        if self.selection.is_some() && keyboard.just_pressed(KeyCode::KeyR) {
            self.rotate_placement();
        }
    }

    pub fn auto_buy_status(&self) -> &'static str {
        if self.market.auto_buy_off {
            "Auto-buy off"
        } else {
            "Auto-buy on"
        }
    }

    pub fn toggle_auto_buy(&mut self) {
        self.market.auto_buy_off = !self.market.auto_buy_off;
    }

    fn active_trips(&self) -> impl Iterator<Item = &TownTrip> {
        self.trip.iter().chain(self.second_trip.iter())
    }

    fn driver_booked(&self, index: usize) -> bool {
        self.active_trips().any(|trip| trip.driver == index)
    }

    pub fn driver_away(&self, index: usize) -> bool {
        self.active_trips()
            .any(|trip| trip.driver == index && trip.boarded)
    }

    pub fn car_trip(&self, index: usize) -> Option<(f64, f64)> {
        self.active_trips()
            .find(|trip| index == trip.vehicle && trip.boarded)
            .map(|trip| (trip.elapsed, trip.duration))
    }

    pub fn toggle_sandbox_construction(&mut self) {
        self.slow_sandbox = !self.slow_sandbox;
    }

    pub fn sandbox_status(&self) -> &'static str {
        if self.slow_sandbox {
            "Instant build off"
        } else {
            "Instant build on"
        }
    }

    pub fn instructions(&self, catalog: &Catalog, sandbox: bool) -> String {
        if self.moving.is_some() {
            return format!(
                "Click destination · R Rotate {}° · B Cancel move\n{}",
                u32::from(self.rotation) * 90,
                self.status
            );
        }
        if !self.menu {
            return "B Build · Space Pause · 1–4 Speed".into();
        }
        if self.planning_roads() {
            return format!(
                "Village road · Click to start · Shift-click to extend\nZ Undo stroke · B or Esc Finish and keep the plan\n{}",
                self.status
            );
        }
        if self.selection.as_deref() == Some("field") {
            return format!(
                "Cultivated field · {} × {} cells\n[ ] Width · Shift [ ] Depth · R Rotate {}°\nClick to designate · Shift-click Repeat · Esc Cancel\n{}",
                self.field_size.x,
                self.field_size.y,
                u32::from(self.rotation) * 90,
                self.status
            );
        }
        if let Some(key) = &self.selection {
            let definition = &catalog.projects[key];
            let degrees = u32::from(self.rotation) * 90;
            let dimensions = size(definition, self.rotation);
            let materials: Vec<_> = definition
                .materials
                .iter()
                .map(|(id, amount)| format!("{amount} {}", catalog.materials[id].name))
                .collect();
            let bill = materials
                .chunks(3)
                .map(|row| row.join(" · "))
                .collect::<Vec<_>>()
                .join("\n");
            let labor_hours = definition.work * 0.45 / 60.0;
            let mut details = format!(
                "{} · {} × {} m · {:.1} person-hours · {} loads",
                definition.name,
                dimensions.x * 2,
                dimensions.y * 2,
                labor_hours,
                catalog.loads(definition)
            );
            if !definition.description.is_empty() {
                let mut width = 0;
                for word in definition.description.split_whitespace() {
                    let length = word.chars().count();
                    if width == 0 || width + 1 + length > 80 {
                        details.push('\n');
                        width = length;
                    } else {
                        details.push(' ');
                        width += 1 + length;
                    }
                    details.push_str(word);
                }
            }
            if !bill.is_empty() {
                details.push_str("\nMaterials\n");
                details.push_str(&bill);
            }
            if key == "bridge" {
                details.push_str("\nSpan the river with both ends on dry land.");
            } else if Self::uses_foundation(key) {
                details.push_str("\nThe footprint levels automatically when you place the plan.");
            }
            let repeat = if sandbox || definition.repeatable {
                " · Shift-click Repeat"
            } else {
                ""
            };
            return format!(
                "{details}\nClick to plan · R Rotate ({degrees}°){repeat} · Esc Cancel\n{}",
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
        let (title, controls) = if self.editing_search {
            (
                format!("Search {}▏", self.build_query),
                "Type to filter · Enter Apply",
            )
        } else {
            (
                self.build_result_heading(options.len()),
                "/ Search · Tab Category · Page Up/Down · B Close",
            )
        };
        let list = if list.is_empty() {
            "No matching projects"
        } else if self.editing_search {
            &list
        } else {
            ""
        };
        format!(
            "{title} · {}/{}\n{controls}\n{list}\n{}",
            self.page + 1,
            pages,
            self.status
        )
    }

    pub fn place_blueprint(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        site: ConstructionSite,
        position: IVec2,
        clock: TownClock,
        repeat: bool,
    ) {
        let keep = self
            .selection
            .as_ref()
            .filter(|key| {
                repeat
                    && self.moving.is_none()
                    && !self.planning_roads()
                    && (stock.sandbox || catalog.projects[*key].repeatable)
            })
            .cloned();
        self.plan(catalog, stock, site, position, clock);
        if let Some(key) = keep {
            self.selection = Some(key);
        }
    }

    pub fn plan(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        site: ConstructionSite,
        position: IVec2,
        clock: TownClock,
    ) {
        if let Some(index) = self.moving {
            self.queue_move(catalog, stock, site, position, index);
            return;
        }
        if self.planning_roads() {
            self.plan_roads(catalog, stock, site, position, clock, false);
            return;
        }
        let Some(key) = &self.selection else { return };
        let is_field = key == "field";
        let ConstructionSite {
            terrain,
            land,
            camp,
        } = site;
        let definition = &catalog.projects[key];
        let mut blueprint = self.proposed_site(catalog, key, position);
        if let Some(error) = self.placement_error(
            terrain,
            land,
            camp,
            &blueprint,
            definition,
            (catalog, stock.sandbox, None),
        ) {
            self.status = error.into();
            return;
        }
        if let Err(error) =
            Self::reserve_project(&mut self.market, stock, catalog, &mut blueprint, clock)
        {
            self.status = error;
            return;
        }
        self.status = if is_field || (stock.sandbox && !self.slow_sandbox) {
            blueprint.delivered = blueprint.loads;
            blueprint.work = definition.work;
            format!("{} built.", definition.name)
        } else if stock.sandbox {
            format!("{} planned.", definition.name)
        } else if self.supplier_construction && Self::fits_construction_freight(catalog, &blueprint)
        {
            format!(
                "{} planned. Missing materials queued for supplier freight.",
                definition.name
            )
        } else if blueprint.pickups > 0 {
            format!(
                "{} planned. Missing materials ordered for town pickup.",
                definition.name
            )
        } else {
            format!("{} planned. Materials reserved.", definition.name)
        };
        if Self::uses_foundation(&blueprint.key)
            && let Some(pad) = terrain.foundation(blueprint.position, blueprint.size)
        {
            self.add_foundation(pad);
        }
        if is_field {
            self.farming.plots.insert(
                self.plans.len(),
                crate::farming::Plot::new("field", self.field_size)
                    .expect("valid field dimensions"),
            );
        }
        self.plans.push(blueprint);
        self.record_event(clock.seconds, self.status.clone());
        self.selection = None;
    }

    pub fn adjust_expansion_reserve(&mut self, increase: bool, large_step: bool) {
        self.market.adjust_expansion_reserve(increase, large_step);
    }

    pub fn set_expansion_reserve(&mut self, cents: u64) {
        self.market.set_expansion_reserve(cents);
    }

    pub fn expansion_reserve_label(&self) -> String {
        format!(
            "Expansion reserve R${:.2} · [ / ] R$100 · Shift [ / ] R$1000",
            self.market.expansion_reserve() as f64 / 100.0,
        )
    }

    fn reserve_project(
        market: &mut Market,
        stock: &mut Stock,
        catalog: &Catalog,
        blueprint: &mut Blueprint,
        clock: TownClock,
    ) -> Result<(), String> {
        let materials = &catalog.projects[&blueprint.key].materials;
        blueprint.materials_paid = Some(materials.clone());
        if stock.sandbox {
            blueprint.delivered = blueprint.loads;
            return Ok(());
        }
        let quote = market.quote(
            catalog,
            materials,
            stock,
            clock.seconds,
            clock.round_trip_km,
        )?;
        blueprint.pickups = quote.trips;
        blueprint.fare = quote.fare;
        if quote.trips > 0 {
            blueprint.purchase = Some(lifecycle::Purchase {
                units: quote.units.clone(),
                price: quote.price,
                day: quote.day,
                trips: quote.trips,
            });
        }
        market.reserve(stock, materials, &quote);
        Ok(())
    }

    fn uses_foundation(key: &str) -> bool {
        !matches!(key, "road" | "bridge" | "field")
    }

    fn add_foundation(&mut self, pad: Foundation) {
        if !self.foundations.contains(&pad) {
            Arc::make_mut(&mut self.foundations).push(pad);
        }
    }

    fn project_foundation(
        &self,
        terrain: &Terrain,
        position: IVec2,
        size: IVec2,
    ) -> Result<Foundation, &'static str> {
        let pad = terrain
            .foundation(position, size)
            .ok_or("Leave space between foundations at different heights.")?;
        if self.foundations.len() >= 4094 && !self.foundations.contains(&pad) {
            return Err("This village has reached the foundation limit.");
        }
        Ok(pad)
    }

    pub fn placing_project(&self) -> bool {
        self.selection.is_some() || self.moving.is_some()
    }

    pub fn preview_model(
        &self,
        catalog: &Catalog,
        terrain: &Terrain,
        position: IVec2,
    ) -> Option<(usize, Transform)> {
        let key = self
            .moving
            .map(|index| self.plans[index].key.as_str())
            .or(self.selection.as_deref())?;
        if matches!(key, "field" | "road") {
            return None;
        }
        let definition = &catalog.projects[key];
        let footprint = size(definition, self.rotation);
        let center = position.as_vec2() + (footprint.as_vec2() - Vec2::ONE) * 0.5;
        let Vec2 { x, y: z } = world_position(center.x, center.y);
        let height = if Self::uses_foundation(key) {
            terrain.foundation(position, footprint).map_or_else(
                || terrain.height_at(x, z),
                crate::terrain::Foundation::height,
            )
        } else {
            terrain.height_at(x, z)
        };
        Some((
            self.moving.map_or(definition.model, |index| {
                self.finished_model(catalog, index)
            }),
            Transform::from_xyz(x, height, z).with_rotation(Quat::from_rotation_y(
                f32::from(self.rotation) * std::f32::consts::FRAC_PI_2,
            )),
        ))
    }

    fn proposed_site(&self, catalog: &Catalog, key: &str, position: IVec2) -> Blueprint {
        Self::proposal(catalog, key, position, self.field_size, self.rotation)
    }

    fn proposal(
        catalog: &Catalog,
        key: &str,
        position: IVec2,
        field_size: IVec2,
        rotation: u8,
    ) -> Blueprint {
        let definition = &catalog.projects[key];
        Blueprint {
            key: key.to_owned(),
            position,
            size: if key == "field" {
                rotated_size(field_size, rotation)
            } else {
                size(definition, rotation)
            },
            rotation,
            loads: catalog.loads(definition),
            delivered: 0,
            staged: 0,
            depot: None,
            work: 0.0,
            pickups: 0,
            fare: 0,
            removed: false,
            purchase: None,
            materials_paid: None,
        }
    }

    pub fn blueprint_supply_quote(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        clock: TownClock,
        definition: &Project,
    ) -> Result<String, String> {
        self.construction_supply_quote(catalog, stock, clock, &definition.materials)
    }

    fn construction_supply_quote(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        clock: TownClock,
        materials: &BTreeMap<String, u32>,
    ) -> Result<String, String> {
        if stock.sandbox {
            return Ok("Free in Sandbox".into());
        }
        let quote = self.market.quote(
            catalog,
            materials,
            stock,
            clock.seconds,
            clock.round_trip_km,
        )?;
        if quote.trips == 0 {
            return Ok("Supplies available locally".into());
        }
        let pickup_cost = quote.price + quote.fare * u64::from(quote.trips);
        let trips = quote.trips;
        let pickup = format!(
            "R${:.2} including {trips} town pickup(s)",
            pickup_cost as f64 / 100.0
        );
        if self.supplier_construction
            && let Some(trips) = Self::construction_freight_trips(catalog, quote.units)
        {
            let freight_cost =
                quote.price + crate::market::freight_cents(clock.round_trip_km) * u64::from(trips);
            if self
                .market
                .can_replace_fares_with_freight(stock, 0, freight_cost)
            {
                return Ok(format!(
                    "R${:.2} including {trips} supplier load(s)",
                    freight_cost as f64 / 100.0
                ));
            }
            return Ok(format!(
                "{pickup} · Freight exceeds available expansion funds"
            ));
        }
        Ok(pickup)
    }

    pub fn draw_project_site(
        &self,
        ground: ConstructionSite,
        catalog: &Catalog,
        stock: &Stock,
        clock: TownClock,
        position: IVec2,
        gizmos: &mut Gizmos,
    ) -> Option<(String, bool)> {
        let key = self
            .moving
            .map(|index| self.plans[index].key.as_str())
            .or(self.selection.as_deref())?;
        let proposal = self.proposed_site(catalog, key, position);
        let definition = &catalog.projects[key];
        let status = if let Some(reason) = self.placement_error(
            ground.terrain,
            ground.land,
            ground.camp,
            &proposal,
            definition,
            (catalog, stock.sandbox, self.moving),
        ) {
            Err(reason.to_owned())
        } else if self.moving.is_some() || stock.sandbox {
            Ok("Site available".into())
        } else {
            self.blueprint_supply_quote(catalog, stock, clock, definition)
        };
        let tint = if status.is_ok() {
            Color::srgb_u8(217, 237, 165)
        } else {
            Color::srgb_u8(216, 122, 92)
        };
        draw_footprint(ground.terrain, position, proposal.size, tint, gizmos);
        if key == "field"
            && let Some(plot) = crate::farming::Plot::new("field", self.field_size)
        {
            let center = position.as_vec2() + (proposal.size.as_vec2() - Vec2::ONE) * 0.5;
            let origin = world_position(center.x, center.y);
            let rotation =
                Vec2::from_angle(-f32::from(self.rotation) * std::f32::consts::FRAC_PI_2);
            for bed in plot.beds {
                let half = bed.dimensions * 0.5;
                let corners = [
                    Vec2::new(-half.x, -half.y),
                    Vec2::new(half.x, -half.y),
                    Vec2::new(half.x, half.y),
                    Vec2::new(-half.x, half.y),
                ];
                for edge in 0..4 {
                    let a = corners[edge];
                    let b = corners[(edge + 1) % 4];
                    let steps = a.distance(b).ceil() as u32;
                    gizmos.linestrip(
                        (0..=steps).map(|step| {
                            let point = origin
                                + rotation
                                    .rotate(bed.offset + a.lerp(b, step as f32 / steps as f32));
                            Vec3::new(
                                point.x,
                                ground.terrain.height_at(point.x, point.y) + 0.13,
                                point.y,
                            )
                        }),
                        tint,
                    );
                }
            }
        }
        let show_access = status.is_ok() && !matches!(key, "road" | "bridge");
        if show_access {
            let entrance = building_entrance(&proposal, definition);
            let spots = build_perimeter(position, proposal.size)
                .into_iter()
                .filter(|&cell| {
                    !self.blocked(catalog, ground.terrain, ground.land, ground.camp, cell)
                });
            for cell in spots {
                let Vec2 { x, y: z } = world_position(cell.x as f32, cell.y as f32);
                let y = ground.terrain.height_at(x, z) + 0.15;
                let (radius, tint) = if entrance == Some(cell) {
                    (0.38, Color::srgb_u8(243, 190, 85))
                } else {
                    (0.24, Color::srgb_u8(85, 185, 216))
                };
                gizmos.circle(
                    Isometry3d::new(
                        Vec3::new(x, y, z),
                        Quat::from_rotation_x(-std::f32::consts::FRAC_PI_2),
                    ),
                    radius,
                    tint,
                );
            }
        }
        let available = status.is_ok();
        let label = match status {
            Ok(detail) if show_access => format!("{detail} · Blue Work access · Gold Entrance"),
            Ok(detail) => detail,
            Err(reason) => format!("Blocked · {reason}"),
        };
        Some((label, available))
    }

    fn placement_error(
        &self,
        terrain: &Terrain,
        land: &Land,
        camp: IVec2,
        blueprint: &Blueprint,
        definition: &Project,
        (catalog, sandbox, ignore): (&Catalog, bool, Option<usize>),
    ) -> Option<&'static str> {
        if self.blueprint_already_planned(&blueprint.key, definition, sandbox, ignore) {
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
        if Self::uses_foundation(&blueprint.key)
            && let Err(reason) = self.project_foundation(terrain, start, blueprint.size)
        {
            return Some(reason);
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
                !project.removed
                    && project.key == "groundwater-well"
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
        if self.plans.iter().enumerate().any(|(index, other)| {
            ignore != Some(index)
                && !other.removed
                && overlaps(other.position, other.position + other.size)
        }) || self.changes.iter().any(|(index, job)| {
            ignore != Some(*index)
                && job
                    .target
                    .as_ref()
                    .is_some_and(|target| overlaps(target.position, target.position + target.size))
        }) {
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
        let source = SUPPLY_SPOTS[2].as_vec2();
        let existing_blocked = |cell| self.blocked(catalog, terrain, land, camp, cell);
        let footprint = |cell: IVec2| cell.cmpge(start).all() && cell.cmplt(end).all();
        let proposed_blocked = |cell| {
            footprint(cell) || self.blocked_ignoring(catalog, terrain, land, camp, cell, ignore)
        };
        if !road && !bridge {
            let lost_route = |targets: &[IVec2]| {
                crate::navigation::route_to_any(source, targets, existing_blocked)
                    .is_some_and(|path| path.iter().any(|point| footprint(point.as_ivec2())))
                    && crate::navigation::route_to_any(source, targets, proposed_blocked).is_none()
            };
            for door in [camp, camp + IVec2::new(2, 0)] {
                if lost_route(&[door]) {
                    return Some("Keep the camp tent entrances reachable from the supplies.");
                }
            }
            for (index, existing) in self.plans.iter().enumerate() {
                if existing.removed
                    || ignore == Some(index)
                    || matches!(existing.key.as_str(), "road" | "bridge")
                {
                    continue;
                }
                if let Some(entrance) =
                    building_entrance(existing, &catalog.projects[&existing.key])
                {
                    if footprint(entrance) && !existing_blocked(entrance) {
                        return Some("Keep the existing building's entrance clear.");
                    }
                    if lost_route(&[entrance]) {
                        return Some("Keep a walking route to the existing building's entrance.");
                    }
                } else if lost_route(&build_perimeter(existing.position, existing.size)) {
                    return Some("Keep a walking route to the existing work site.");
                }
            }
        }
        if !road && !bridge {
            let water_targets = |proposed: bool, camp_spot: IVec2| {
                self.utilities
                    .water_sources()
                    .flat_map(|(id, position, size)| {
                        if id == 0 {
                            return vec![camp_spot];
                        }
                        if proposed && ignore == Some(id - 1) {
                            build_perimeter(start, blueprint.size)
                        } else {
                            build_perimeter(position, size)
                        }
                    })
                    .collect::<Vec<_>>()
            };
            for (index, resident) in self.residents.iter().enumerate() {
                if self.driver_away(index) || self.away_for_work(index) {
                    continue;
                }
                let from = resident.position;
                let stores = [SUPPLY_SPOTS[index]];
                let loses_access = |before: &[IVec2], after: &[IVec2]| {
                    crate::navigation::route_to_any(from, before, existing_blocked).is_some_and(
                        |path| {
                            (before != after
                                || path.is_empty() && footprint(from.round().as_ivec2())
                                || path.iter().any(|point| footprint(point.as_ivec2())))
                                && crate::navigation::route_to_any(from, after, proposed_blocked)
                                    .is_none()
                        },
                    )
                };
                if loses_access(&stores, &stores) {
                    return Some("Leave residents a walking route to the food stores.");
                }
                let previous_water = water_targets(false, stores[0]);
                let proposed_water = if ignore.is_some() {
                    water_targets(true, stores[0])
                } else {
                    previous_water.clone()
                };
                if loses_access(&previous_water, &proposed_water) {
                    return Some("Leave residents a walking route to drinking water.");
                }
            }
        }
        if !road {
            let targets = if bridge {
                let along = if blueprint.rotation.is_multiple_of(2) {
                    IVec2::X
                } else {
                    IVec2::Y
                };
                vec![start - along, start + along * blueprint.size.max_element()]
            } else {
                build_perimeter(start, blueprint.size)
            };
            let accessible =
                crate::navigation::route_to_any(source, &targets, proposed_blocked).is_some();
            if !accessible {
                return Some(if bridge {
                    "Keep one bridge end reachable from the village."
                } else {
                    "Leave a walking route from the supplies to the work site."
                });
            }
        }
        if let Some(entrance) = building_entrance(blueprint, definition)
            && route(source, entrance, proposed_blocked, access_road).is_none()
        {
            return Some("Leave a walking route to the proposed entrance or rotate the building.");
        }
        None
    }

    pub fn draw(
        &self,
        catalog: &Catalog,
        terrain: &Terrain,
        construction_lens: bool,
        hovered: Option<IVec2>,
        gizmos: &mut Gizmos,
    ) -> Option<String> {
        let mut detail = None;
        for (index, plan) in self.plans.iter().enumerate() {
            let definition = &catalog.projects[&plan.key];
            let selected = self.production.selected == Some(index);
            let unfinished = plan.work < definition.work;
            let changing = self.changes.contains_key(&index);
            if plan.removed || !(selected || unfinished || construction_lens && changing) {
                continue;
            }
            let color = if construction_lens && (unfinished || changing) {
                if changing {
                    Color::srgb_u8(190, 167, 248)
                } else if plan.pickups > 0 || plan.delivered < plan.loads {
                    Color::srgb_u8(243, 200, 108)
                } else {
                    Color::srgb_u8(136, 220, 148)
                }
            } else if selected {
                Color::srgb_u8(109, 220, 255)
            } else {
                Color::srgb_u8(230, 244, 158)
            };
            if construction_lens
                && hovered.is_some_and(|cell| {
                    cell.cmpge(plan.position).all() && cell.cmplt(plan.position + plan.size).all()
                })
            {
                detail = Some(format!(
                    "{} #{} · {}",
                    definition.name,
                    index + 1,
                    self.project_status(catalog, index)
                ));
            }
            draw_footprint(terrain, plan.position, plan.size, color, gizmos);
        }
        for job in self.changes.values() {
            if let Some(target) = &job.target {
                draw_footprint(
                    terrain,
                    target.position,
                    target.size,
                    Color::srgb_u8(190, 167, 248),
                    gizmos,
                );
            }
        }
        construction_lens.then(|| {
            let legend =
                "Construction · Gold supplies pending · Green building · Purple changes queued";
            detail.map_or_else(|| legend.to_owned(), |detail| format!("{legend}\n{detail}"))
        })
    }
}

fn draw_lens_marker(
    terrain: &Terrain,
    position: IVec2,
    size: IVec2,
    color: Color,
    gizmos: &mut Gizmos,
) {
    let center = position.as_vec2() + (size.as_vec2() - Vec2::ONE) * 0.5;
    let Vec2 { x, y: z } = world_position(center.x, center.y);
    let base = Vec3::new(x, terrain.height_at(x, z), z);
    let tip = base + Vec3::Y * 7.0;
    gizmos.line(base, tip, color);
    for axis in [Vec3::X, Vec3::Z] {
        gizmos.line(tip - axis * 0.7, tip + axis * 0.7, color);
    }
}

pub(crate) fn read_search_text(
    query: &mut String,
    text: &mut MessageReader<bevy::input::keyboard::KeyboardInput>,
) {
    for event in text.read() {
        if event.state != bevy::input::ButtonState::Pressed {
            continue;
        }
        if event.key_code == KeyCode::Backspace {
            query.pop();
        } else if let Some(chars) = &event.text {
            let room = 60usize.saturating_sub(query.chars().count());
            query.extend(chars.chars().filter(|c| !c.is_control()).take(room));
        }
    }
}

pub(crate) fn draw_footprint(
    terrain: &Terrain,
    position: IVec2,
    size: IVec2,
    tint: Color,
    gizmos: &mut Gizmos,
) {
    let low = world_position(position.x as f32, position.y as f32) - Vec2::ONE;
    let high = low + size.as_vec2() * 2.0;
    let points = [
        low,
        Vec2::new(low.x, high.y),
        high,
        Vec2::new(high.x, low.y),
        low,
    ];
    for line in points.windows(2) {
        let length = line[0].distance(line[1]).ceil() as usize;
        gizmos.linestrip(
            (0..=length).map(|step| {
                let Vec2 { x, y: z } = line[0].lerp(line[1], step as f32 / length as f32);
                Vec3::new(x, terrain.height_at(x, z) + 0.1, z)
            }),
            tint,
        );
    }
}

impl Construction {
    pub fn storage(&self, catalog: &Catalog, stock: &Stock) -> (u64, u64) {
        self.storage_without(catalog, stock, None)
    }

    fn storage_without(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        excluded_project: Option<usize>,
    ) -> (u64, u64) {
        if stock.sandbox {
            return (stock.units(), 1_000_000);
        }
        let boarded: Vec<_> = self
            .active_trips()
            .filter(|trip| trip.boarded)
            .flat_map(|trip| trip.trade_orders())
            .collect();
        let used = stock.units() + self.trade.reserved_at_home(&boarded);
        let expansions = self
            .plans
            .iter()
            .enumerate()
            .filter(|(index, project)| {
                let definition = &catalog.projects[&project.key];
                excluded_project != Some(*index)
                    && !project.removed
                    && project.work >= definition.work
                    && matches!(definition.kind.as_str(), "warehouse" | "covered-storage")
            })
            .count() as u64;
        (used, STORAGE_EXPANSION * (1 + expansions))
    }

    fn storage_space(&self, catalog: &Catalog, stock: &Stock) -> u64 {
        let (used, capacity) = self.storage(catalog, stock);
        capacity.saturating_sub(used)
    }

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
                    if project.removed || project.work < definition.work {
                        return None;
                    }
                    let working = self.production.jobs.iter().any(|job| {
                        job.site == index
                            && job.phase == crate::production::Phase::Work
                            && !job.using_biogas
                            && !catalog.production[&job.recipe].handcraft
                            && job.recipe != "cold_storage"
                    });
                    Some(Facility {
                        id: index + 1,
                        kind: &definition.kind,
                        location: project.position,
                        size: project.size,
                        batteries: project
                            .materials(catalog)
                            .get("batteries")
                            .copied()
                            .unwrap_or(0),
                        panels: project
                            .materials(catalog)
                            .get("panels")
                            .copied()
                            .unwrap_or(0),
                        working,
                    })
                }),
        );
        if !stock.sandbox {
            self.age_assets(catalog, clock, dt);
        }
        self.utilities
            .tick(setup, stock, self.market.committed_fares(), clock, dt);
    }

    pub fn valid_save(&self, catalog: &Catalog, stock: &Stock) -> bool {
        if self.foundations.len() > 4094 || !self.foundations.iter().all(|pad| pad.valid()) {
            return false;
        }
        let fares = self
            .plans
            .iter()
            .enumerate()
            .fold(0u64, |total, (index, project)| {
                let trips = self
                    .remaining_freight_pickups(catalog, index)
                    .or_else(|| self.remaining_boarded_pickups(catalog, index))
                    .unwrap_or(project.pickups);
                total.saturating_add(project.fare.saturating_mul(u64::from(trips)))
            });
        let fares = self.farming.jobs.iter().fold(fares, |total, job| {
            let paid = job.seed_freight_eta.is_some()
                || self.active_trips().any(|trip| {
                    trip.boarded && trip.project == job.site && trip.farm_bed == Some(job.bed)
                });
            total.saturating_add(
                job.fare
                    .saturating_mul(u64::from(job.pickups.saturating_sub(u32::from(paid)))),
            )
        });
        let export_paid: Vec<_> = self
            .active_trips()
            .filter(|trip| trip.boarded)
            .flat_map(|trip| trip.trade_orders())
            .collect();
        let fares = self
            .trade
            .orders
            .iter()
            .enumerate()
            .fold(fares, |total, (index, order)| {
                if export_paid.contains(&index) {
                    total
                } else {
                    total.saturating_add(order.fare)
                }
            });
        let trip_valid = self.active_trips().all(|trip| {
            trip.driver < self.residents.len()
                && trip.vehicle < 2
                && (0.0..=trip.duration).contains(&trip.elapsed)
                && (1.0..=500.0).contains(&trip.duration)
                && (trip.boarded || trip.elapsed == 0.0)
                && self.valid_trip_trade_cargo(catalog, *trip)
                && if trip.market_order {
                    trip.farm_bed.is_none() && self.trade.orders.get(trip.project).is_some()
                } else if let Some(bed) = trip.farm_bed {
                    self.farming.jobs.iter().any(|job| {
                        job.site == trip.project
                            && job.bed == bed
                            && job.pickups > 0
                            && job.seed_freight_eta.is_none()
                    })
                } else {
                    self.plans
                        .get(trip.project)
                        .is_some_and(|project| !project.removed && project.pickups > 0)
                }
        }) && self.trip.zip(self.second_trip).is_none_or(|(a, b)| {
            a.driver != b.driver
                && a.vehicle != b.vehicle
                && !a.trade_orders().any(|index| b.covers_order(index))
                && if a.market_order || b.market_order {
                    a.market_order != b.market_order || a.project != b.project
                } else {
                    (a.project, a.farm_bed) != (b.project, b.farm_bed)
                }
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
        }) && self.farming.jobs.iter().all(|job| {
            job.output
                .keys()
                .all(|id| catalog.materials.contains_key(id))
        });
        let animals_valid = self.livestock.animals.iter().all(|(index, pen)| {
            self.plans
                .get(*index)
                .and_then(|plan| catalog.projects.get(&plan.key))
                .and_then(|definition| catalog.animal_rations.get(&definition.kind))
                .is_some_and(|ration| pen.valid(ration))
        });
        let changes_valid = self.priority.is_none_or(|index| index < self.plans.len())
            && self.changes.iter().all(|(&index, job)| {
                self.plans.get(index).is_some_and(|plan| !plan.removed)
                    && (0.0..=job.required).contains(&job.work)
                    && job.worker.is_none_or(|index| index < self.residents.len())
                    && job.target.as_ref().is_none_or(|target| {
                        target.position.cmpge(IVec2::splat(-30)).all()
                            && target.position.cmple(IVec2::splat(94)).all()
                            && target.rotation <= 3
                    })
            });
        let seed_freight = self
            .farming
            .jobs
            .iter()
            .filter(|job| job.seed_freight_eta.is_some())
            .count();
        if seed_freight > 1
            || (seed_freight > 0
                && (self.construction_delivery.is_some() || self.trade.delivery.is_some()))
            || !self.valid_construction_delivery(catalog)
            || !self.valid_pickup_manifests(catalog)
            || !self.logistics_policy.valid()
            || !self.work_policy.valid()
            || !self.events.valid()
            || !self.production.kitchen_policy.valid()
            || !self.upkeep.valid(self.plans.len())
            || !self.valid_water_jobs()
            || !self.valid_homes(catalog)
            || !changes_valid
            || !self.trade.valid(catalog)
            || !animals_valid
            || !farms_valid
            || !services_valid
            || !trip_valid
            || !self.market.valid_save(catalog, stock, fares)
            || !self.valid_production(catalog)
        {
            return false;
        }
        self.valid_haul_reservations()
            && self.plans.len() <= 128 * 128
            && self.plans.iter().enumerate().all(|(index, plan)| {
                catalog.projects.get(&plan.key).is_some_and(|definition| {
                    plan.rotation <= 3
                        && plan.position.cmpge(IVec2::splat(-30)).all()
                        && plan.position.cmple(IVec2::splat(94)).all()
                        && if plan.key == "field" {
                            crate::farming::Plot::field_size_valid(plan.size)
                        } else {
                            plan.size == size(definition, plan.rotation)
                        }
                        && (plan.position + plan.size).cmple(IVec2::splat(94)).all()
                        && plan.materials(catalog).iter().all(|(id, &amount)| {
                            amount <= 100_000 && catalog.materials.contains_key(id)
                        })
                        && plan.purchase.as_ref().is_none_or(|order| {
                            order.trips >= plan.pickups
                                && order.units.iter().all(|(id, &units)| {
                                    units > 0
                                        && plan
                                            .materials(catalog)
                                            .get(id)
                                            .is_some_and(|&bill| units <= bill)
                                })
                        })
                        && plan.loads == catalog.loads_for(plan.materials(catalog))
                        && plan.staged <= plan.loads.saturating_sub(plan.delivered)
                        && plan.depot.map_or(plan.staged == 0, |depot| {
                            depot != index
                                && !plan.removed
                                && plan.pickups == 0
                                && plan.delivered < plan.loads
                                && self.valid_haul_depot(catalog, depot)
                        })
                        && plan.delivered <= plan.loads
                        && (plan.pickups == 0 || plan.delivered == 0 && plan.work == 0.0)
                        && (0.0..=definition.work).contains(&plan.work)
                        && (plan.delivered == plan.loads || plan.work == 0.0)
                })
            })
            && self.residents.iter().enumerate().all(|(index, worker)| {
                let in_bounds = |point: Vec2| {
                    point.cmpge(Vec2::splat(-31.0)).all() && point.cmple(Vec2::splat(94.0)).all()
                };
                worker.health.valid()
                    && worker.town_work.valid()
                    && !(worker.town_work.active() && self.driver_booked(index))
                    && worker.craft.valid()
                    && worker.leisure.valid()
                    && in_bounds(worker.position)
                    && worker.path.len() <= 128 * 128
                    && worker.path.iter().copied().all(in_bounds)
                    && worker.paused_waypoint.is_none_or(in_bounds)
                    && worker.route_retry_ticks <= 9
                    && worker.assignment.as_ref().is_none_or(|job| {
                        job.project < self.plans.len()
                            && match job.haul {
                                Haul::Direct => true,
                                Haul::Stage { depot, loads } | Haul::FromDepot { depot, loads } => {
                                    let limit = if matches!(job.haul, Haul::Stage { .. }) {
                                        4
                                    } else {
                                        2
                                    };
                                    self.plans[job.project].depot == Some(depot)
                                        && (1..=limit).contains(&loads)
                                        && matches!(
                                            job.activity,
                                            Activity::Carry | Activity::Collect
                                        )
                                }
                            }
                            && job.to_site.len() <= 128 * 128
                            && job.to_site.iter().copied().all(in_bounds)
                    })
            })
    }

    pub fn latest_progress(&self, catalog: &Catalog) -> Option<String> {
        let (index, project) = self
            .plans
            .iter()
            .enumerate()
            .rev()
            .find(|(_, plan)| !plan.removed)?;
        let name = &catalog.projects[&project.key].name;
        Some(format!("{name}: {}", self.project_status(catalog, index)))
    }

    pub fn worker(&self, index: usize) -> &Worker {
        &self.residents[index]
    }

    pub fn cultivated_sites<'a>(
        &'a self,
        catalog: &'a Catalog,
    ) -> impl Iterator<Item = (&'a str, IVec2, IVec2)> {
        self.plans.iter().filter_map(|plan| {
            let definition = &catalog.projects[&plan.key];
            (!plan.removed
                && plan.work >= definition.work
                && matches!(
                    definition.kind.as_str(),
                    "field" | "garden" | "grove" | "orchard" | "greenhouse"
                ))
            .then_some((definition.name.as_str(), plan.position, plan.size))
        })
    }

    pub fn has_cultivation_surface(&self, project: usize) -> bool {
        matches!(self.plans[project].key.as_str(), "field" | "garden")
    }

    pub fn project_kind<'a>(&self, catalog: &'a Catalog, project: usize) -> Option<&'a str> {
        let plan = self.plans.get(project)?;
        (!plan.removed).then(|| catalog.projects[&plan.key].kind.as_str())
    }

    pub fn is_fire_circle(&self, project: usize) -> bool {
        self.plans[project].key == "fire-circle"
    }

    pub fn construction_models<'a>(
        &'a self,
        catalog: &'a Catalog,
    ) -> impl Iterator<Item = (usize, usize, Vec2, f32)> + 'a {
        self.plans
            .iter()
            .enumerate()
            .filter_map(|(index, project)| {
                if project.removed {
                    return None;
                }
                let model = catalog.projects[&project.key].construction_model(project.work)?;
                let center =
                    project.position.as_vec2() + (project.size.as_vec2() - Vec2::ONE) * 0.5;
                Some((
                    index,
                    model,
                    world_position(center.x, center.y),
                    f32::from(project.rotation) * std::f32::consts::FRAC_PI_2,
                ))
            })
    }

    fn finished_model(&self, catalog: &Catalog, index: usize) -> usize {
        let plan = &self.plans[index];
        let key = if plan.key == "goat-pasture-empty" && !self.empty_goat_pen(index) {
            "goat_pasture"
        } else {
            &plan.key
        };
        catalog.projects[key].model
    }

    pub fn finished_models<'a>(
        &'a self,
        catalog: &'a Catalog,
    ) -> impl Iterator<Item = (usize, usize, Vec2, f32)> + 'a {
        self.plans
            .iter()
            .enumerate()
            .filter_map(|(index, project)| {
                if project.removed || project.work < catalog.projects[&project.key].work {
                    return None;
                }
                let model = self.finished_model(catalog, index);
                let base = project.position.as_vec2() + (project.size.as_vec2() - Vec2::ONE) * 0.5;
                Some((
                    index,
                    model,
                    world_position(base.x, base.y),
                    f32::from(project.rotation) * std::f32::consts::FRAC_PI_2,
                ))
            })
    }

    fn repairing(&self, catalog: &Catalog, item: &str) -> bool {
        self.production
            .jobs
            .iter()
            .any(|job| catalog.production[&job.recipe].repair.as_deref() == Some(item))
    }

    fn active_tool_task(&self, index: usize, task: ToolTask) -> bool {
        let resident = &self.residents[index];
        if resident.health.task.is_some()
            || resident.town_work.active()
            || resident.health.energy < 25.0
        {
            return false;
        }
        match task {
            ToolTask::Building(site) => resident
                .assignment
                .as_ref()
                .is_some_and(|job| job.project == site && job.activity == Activity::Build),
            ToolTask::Production(site) => self
                .production
                .jobs
                .iter()
                .any(|job| job.site == site && job.worker == Some(index)),
            ToolTask::Cultivation(site, bed) => self
                .farming
                .jobs
                .iter()
                .any(|job| job.site == site && job.bed == bed && job.worker == Some(index)),
            ToolTask::Gathering(site) => self
                .gathering
                .orders
                .get(&site)
                .is_some_and(|job| job.worker == Some(index)),
            ToolTask::Water(id) => self
                .water_jobs
                .get(&id)
                .is_some_and(|job| job.assigned_to(index)),
        }
    }

    pub fn tick(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        site: ConstructionSite,
        clock: TownClock,
        dt: f32,
        raining: bool,
    ) {
        stock
            .equipment
            .release(|worker, task| self.active_tool_task(worker, task));
        let locked = self.booked_trade_orders();
        for index in
            self.trade
                .age_shipments(catalog, stock, &mut self.market, clock.seconds, &locked)
        {
            self.removed_trade_order(index);
        }
        let space = self.storage_space(catalog, stock);
        if let Some(order) = self.trade.receive_goods(stock, space, clock.seconds) {
            let item = &catalog.materials[&order.material];
            let message = if order.quantity == 0 {
                format!("Supplier freight arrived with no usable {}.", item.name)
            } else {
                format!(
                    "Supplier delivered {} of {}.",
                    item.quantity_text(u64::from(order.quantity)),
                    item.name,
                )
            };
            self.record_event(clock.seconds, message);
        }
        let space = self.storage_space(catalog, stock);
        if !self.supplier_construction
            || (self.construction_delivery.is_none() && !self.seed_freight_active())
        {
            let shared_trip = (!self.supplier_construction)
                .then(|| self.sale_trip_for_return_purchase())
                .flatten();
            let purchase = self.trade.maintain_pantry(
                catalog,
                stock,
                &mut self.market,
                (
                    clock.seconds,
                    clock.round_trip_km,
                    space,
                    self.supplier_construction,
                    shared_trip.is_some(),
                ),
            );
            if let Some((slot, order)) = shared_trip.zip(purchase) {
                self.attach_return_purchase(slot, order);
            }
        }
        self.trade.auto_sell(
            catalog,
            stock,
            &mut self.market,
            clock.seconds,
            crate::market::fare_cents(clock.round_trip_km),
        );
        self.tick_shifts(catalog, stock, site, clock, dt);
        self.tick_trip(catalog, stock, site, clock, dt);
        self.maintain_water(catalog, stock.sandbox, clock.seconds);
        self.expire_batch_food(catalog, stock, site, clock.seconds);
        let urgent = self.residents.iter().enumerate().any(|(index, resident)| {
            resident.health.levels[Need::Hunger as usize] < 15.0
                || (!self.away_for_work(index)
                    && resident.health.levels[Need::Hydration as usize] < 30.0)
        });
        let order = self.work_policy.dispatch_order(urgent);
        let (essential, production) = self.reserved_workers();
        // Reserve assignments first. The normal pass advances jobs and assigns any
        // residents whose reserved work was unavailable.
        for group in order {
            let workers = match group {
                WorkGroup::Essentials if urgent => [true; 5],
                WorkGroup::Essentials | WorkGroup::Maintenance => essential,
                WorkGroup::Production => production,
                WorkGroup::Construction => continue,
            };
            if workers.iter().any(|&reserved| reserved) {
                self.reservation_pass = Some(workers);
                self.tick_work_group(group, catalog, stock, site, clock, (dt, raining));
            }
        }
        self.reservation_pass = None;
        for group in order {
            self.tick_work_group(group, catalog, stock, site, clock, (dt, raining));
        }
        stock
            .equipment
            .release(|worker, task| self.active_tool_task(worker, task));
    }

    fn tick_work_group(
        &mut self,
        group: WorkGroup,
        catalog: &Catalog,
        stock: &mut Stock,
        site: ConstructionSite,
        clock: TownClock,
        (dt, raining): (f32, bool),
    ) {
        match group {
            WorkGroup::Essentials => {
                self.tick_water_group(catalog, stock, site, clock.seconds, dt, Some(group));
                self.tick_production_group(catalog, stock, site, clock.seconds, dt, Some(group));
                self.tick_farm_jobs(catalog, stock, site, clock.seconds, dt);
                self.tick_gathering(catalog, stock, site, clock.seconds, dt, group);
            }
            WorkGroup::Maintenance => {
                self.tick_water_group(catalog, stock, site, clock.seconds, dt, Some(group));
                self.tick_upkeep(catalog, stock, site, dt);
                if self.reservation_pass.is_none() {
                    self.restock_upkeep(catalog, stock, site.land, clock);
                }
            }
            WorkGroup::Production => {
                self.tick_gathering(catalog, stock, site, clock.seconds, dt, group);
                self.tick_production_group(catalog, stock, site, clock.seconds, dt, Some(group));
            }
            WorkGroup::Construction => {
                self.tick_changes(catalog, stock, site, clock.seconds, dt);
                self.tick_builders(catalog, stock, site, clock.seconds, dt, raining);
            }
        }
    }

    fn tick_builders(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        site: ConstructionSite,
        clock: f64,
        dt: f32,
        raining: bool,
    ) {
        let ConstructionSite {
            terrain,
            land,
            camp,
        } = site;
        for index in 0..self.residents.len() {
            if self.driver_booked(index)
                || self.gathering.workers_at_site(index)
                || self.production.has_worker(index)
                || self.farming.has_worker(index)
                || self.residents[index].health.task.is_some()
                || self.residents[index].town_work.active()
                || self.working_change(index)
                || self.working_water(index)
                || self.working_upkeep(index)
            {
                continue;
            }
            if let Some(job) = &self.residents[index].assignment {
                let project = &self.plans[job.project];
                if project.removed
                    || project.work >= catalog.projects[&project.key].work
                    || (job.activity != Activity::Carry
                        && self.residents[index].health.energy < 25.0)
                {
                    self.residents[index].assignment = None;
                    self.residents[index].path.clear();
                }
            }
            if self.residents[index].assignment.is_none()
                && self.residents[index].health.energy < 25.0
            {
                continue;
            }
            if self.residents[index].assignment.is_none() {
                self.residents[index].retry -= dt;
                if self.residents[index].retry <= 0.0 {
                    self.assign(index, catalog, terrain, land, camp);
                    self.residents[index].retry = 2.0;
                }
            }
            let tools_in_repair = self.repairing(catalog, "carpentry-tools");
            let building_in_rain = raining
                && self.residents[index]
                    .assignment
                    .as_ref()
                    .is_some_and(|job| job.activity == Activity::Build);
            let rain = self.opening_rain_factor(catalog, building_in_rain, stock.sandbox);
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
                    match job.haul {
                        Haul::Stage { loads, .. } => {
                            project.staged += loads;
                            continue;
                        }
                        Haul::FromDepot { loads, .. } => {
                            project.staged -= loads;
                            project.delivered += loads;
                        }
                        Haul::Direct => project.delivered += 1,
                    }
                    job.haul = Haul::Direct;
                    if project.delivered < project.loads {
                        continue;
                    }
                    project.depot = None;
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
                    let work_multiplier =
                        worker.work_multiplier(&catalog.residents[index], &project.key);
                    let efficiency = construction_crew_efficiency(crew + 1);
                    let hunger = if worker.health.levels[Need::Hunger as usize] < 15.0 {
                        0.65
                    } else {
                        1.0
                    };
                    let tools = stock.use_tool(
                        index,
                        "carpentry-tools",
                        ToolTask::Building(job.project),
                        f64::from(dt),
                        tools_in_repair,
                    );
                    project.work = (project.work
                        + f64::from(dt) * work_multiplier * tools * efficiency * hunger * rain)
                        .min(catalog.projects[&project.key].work);
                    if project.work >= catalog.projects[&project.key].work {
                        let definition = &catalog.projects[&project.key];
                        let detail = match project.key.as_str() {
                            "gathering" => "Somewhere to sit together at last.",
                            "shelter" => "A roof for our first night.",
                            "water" => "Water close at hand.",
                            _ if definition.kind == "eco_toilet" => {
                                "A little privacy goes a long way."
                            }
                            _ => "Ready for the community to use.",
                        };
                        self.events
                            .record(clock, format!("{} is ready. {detail}", definition.name));
                    }
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
        let profile = &catalog.residents[index];
        let mut candidates: Vec<_> = self
            .plans
            .iter()
            .enumerate()
            .filter_map(|(id, project)| {
                let definition = &catalog.projects[&project.key];
                (!project.removed
                    && !self.changes.contains_key(&id)
                    && project.pickups == 0
                    && project.work < definition.work)
                    .then_some(id)
            })
            .collect();
        candidates.sort_by_key(|&id| {
            let key = &self.plans[id].key;
            let preference = profile.work_preference(key);
            (self.priority != Some(id), std::cmp::Reverse(preference))
        });
        for id in candidates {
            let project = &self.plans[id];
            let definition = &catalog.projects[&project.key];
            let crew: Vec<_> = self
                .residents
                .iter()
                .filter_map(|worker| worker.assignment.as_ref().filter(|job| job.project == id))
                .collect();
            let limit = construction_crew_limit(definition, project.size);
            if crew.len() >= limit {
                continue;
            }
            let hauling = project.delivered < project.loads;
            let supply = SUPPLY_SPOTS[index];
            let reserved = |from_depot| {
                crew.iter()
                    .filter(|job| {
                        matches!(job.activity, Activity::Collect | Activity::Carry)
                            && matches!(job.haul, Haul::FromDepot { .. }) == from_depot
                    })
                    .map(|job| job.haul.loads())
                    .sum::<u32>()
            };
            let available_staged = project.staged.saturating_sub(reserved(true));
            let available_at_camp = project
                .loads
                .saturating_sub(project.delivered + project.staged + reserved(false));
            if hauling && available_staged == 0 && available_at_camp == 0 {
                continue;
            }
            let site = ConstructionSite {
                terrain,
                land,
                camp,
            };
            let path = |from, to| self.resident_route(catalog, site, from, to);
            let depot = if hauling {
                self.haul_depots(catalog, id, available_staged > 0)
                    .into_iter()
                    .find_map(|depot| {
                        let storage = &self.plans[depot];
                        let from = if available_staged > 0 {
                            position
                        } else {
                            supply.as_vec2()
                        };
                        resident_work::project_access_points(storage, catalog, from)
                            .into_iter()
                            .find_map(|cell| path(from, cell).map(|route| (depot, cell, route)))
                    })
            } else {
                None
            };
            let (haul, start) = match &depot {
                Some((depot, cell, _)) if available_staged > 0 => (
                    Haul::FromDepot {
                        depot: *depot,
                        loads: available_staged.min(2),
                    },
                    cell.as_vec2(),
                ),
                Some((depot, cell, _)) => (
                    Haul::Stage {
                        depot: *depot,
                        loads: available_at_camp.min(4),
                    },
                    cell.as_vec2(),
                ),
                None if hauling && available_at_camp > 0 => (Haul::Direct, supply.as_vec2()),
                None if hauling => continue,
                None => (Haul::Direct, position),
            };
            let mut spots = build_perimeter(project.position, project.size);
            spots.sort_by(|a, b| {
                a.as_vec2()
                    .distance_squared(start)
                    .total_cmp(&b.as_vec2().distance_squared(start))
            });
            let Some((spot, to_site)) = spots
                .into_iter()
                .filter(|spot| !crew.iter().any(|worker| worker.spot == *spot))
                .find_map(|spot| path(start, spot).map(|route| (spot, route)))
            else {
                continue;
            };
            let (path, to_site, activity) = match (hauling, depot) {
                (true, Some((_, _, to_depot))) => match haul {
                    Haul::Stage { .. } => {
                        let Some(to_supply) = path(position, supply) else {
                            continue;
                        };
                        (to_supply, to_depot, Activity::Collect)
                    }
                    _ => (to_depot, to_site, Activity::Collect),
                },
                (true, None) => {
                    let Some(to_supply) = path(position, supply) else {
                        continue;
                    };
                    (to_supply, to_site, Activity::Collect)
                }
                (false, _) => (to_site, VecDeque::new(), Activity::Walk),
            };
            if let Haul::Stage { depot, .. } | Haul::FromDepot { depot, .. } = haul {
                self.plans[id].depot = Some(depot);
            }
            let worker = &mut self.residents[index];
            worker.path = path;
            worker.assignment = Some(Assignment {
                project: id,
                spot,
                to_site,
                activity,
                haul,
            });
            return;
        }
    }

    fn valid_haul_depot(&self, catalog: &Catalog, depot: usize) -> bool {
        self.plans.get(depot).is_some_and(|plan| {
            !plan.removed
                && catalog.projects.get(&plan.key).is_some_and(|definition| {
                    plan.work >= definition.work
                        && matches!(
                            definition.kind.as_str(),
                            "warehouse" | "covered-storage" | "supply-5"
                        )
                })
        })
    }

    fn valid_haul_reservations(&self) -> bool {
        let mut counts = BTreeMap::<usize, (u64, u64)>::new();
        for job in self
            .residents
            .iter()
            .filter_map(|worker| worker.assignment.as_ref())
        {
            if matches!(job.activity, Activity::Carry | Activity::Collect) {
                let (from_camp, from_depot) = counts.entry(job.project).or_default();
                let loads = u64::from(job.haul.loads());
                if matches!(job.haul, Haul::FromDepot { .. }) {
                    *from_depot += loads;
                } else {
                    *from_camp += loads;
                }
            }
        }
        counts.into_iter().all(|(index, (camp, depot))| {
            self.plans.get(index).is_some_and(|plan| {
                depot <= u64::from(plan.staged)
                    && !plan.removed
                    && plan.pickups == 0
                    && camp + u64::from(plan.staged) + u64::from(plan.delivered)
                        <= u64::from(plan.loads)
            })
        })
    }

    fn clear_haul_depot(&mut self, index: usize) {
        for project in &mut self.plans {
            if project.depot == Some(index) {
                project.depot = None;
                project.staged = 0;
            }
        }
        for resident in &mut self.residents {
            if resident
                .assignment
                .as_ref()
                .is_some_and(|job| job.haul.depot() == Some(index))
            {
                resident.assignment = None;
                resident.path.clear();
            }
        }
    }

    fn haul_depots(&self, catalog: &Catalog, index: usize, collecting_staged: bool) -> Vec<usize> {
        let project = &self.plans[index];
        if let Some(depot) = project.depot {
            return if collecting_staged || !self.changes.contains_key(&depot) {
                vec![depot]
            } else {
                Vec::new()
            };
        }
        let origin = STOCKPILE.as_vec2();
        let target = project.position.as_vec2();
        let mut candidates: Vec<_> = self
            .plans
            .iter()
            .enumerate()
            .filter_map(|(id, plan)| {
                let location = plan.position.as_vec2();
                let distance = location.distance(target);
                (id != index
                    && !self.changes.contains_key(&id)
                    && self.valid_haul_depot(catalog, id)
                    && distance < 8.0
                    && origin.distance(location) + distance < origin.distance(target) * 1.35)
                    .then_some((id, distance))
            })
            .collect();
        candidates.sort_by(|a, b| a.1.total_cmp(&b.1));
        candidates.into_iter().map(|(id, _)| id).collect()
    }

    fn blocked(
        &self,
        catalog: &Catalog,
        terrain: &Terrain,
        land: &Land,
        camp: IVec2,
        cell: IVec2,
    ) -> bool {
        self.blocked_ignoring(catalog, terrain, land, camp, cell, None)
    }

    fn blocked_ignoring(
        &self,
        catalog: &Catalog,
        terrain: &Terrain,
        land: &Land,
        camp: IVec2,
        cell: IVec2,
        ignore: Option<usize>,
    ) -> bool {
        let Vec2 { x, y: z } = world_position(cell.x as f32, cell.y as f32);
        let (center, width) = terrain.river(f64::from(z));
        let inside = |start: IVec2, end: IVec2| cell.cmpge(start).all() && cell.cmplt(end).all();
        let crossing = self.plans.iter().enumerate().any(|(index, plan)| {
            ignore != Some(index)
                && !plan.removed
                && plan.key == "bridge"
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
            || self.plans.iter().enumerate().any(|(index, plan)| {
                ignore != Some(index)
                    && !plan.removed
                    && plan.key != "road"
                    && inside(plan.position, plan.position + plan.size)
            })
    }
}

fn building_entrance(plan: &Blueprint, definition: &Project) -> Option<IVec2> {
    if !matches!(
        definition.kind.as_str(),
        "home" | "workshop" | "kitchen" | "wash-station" | "eco_toilet"
    ) && !plan.key.starts_with("canvas-tent")
    {
        return None;
    }
    let start = plan.position;
    let end = start + plan.size;
    // For an even frontage, use the same center cell residents already
    // use when returning home.
    let middle = start + plan.size / 2;
    Some(match plan.rotation {
        0 => IVec2::new(middle.x, end.y),
        1 => IVec2::new(end.x, middle.y),
        2 => IVec2::new(middle.x, start.y - 1),
        _ => IVec2::new(start.x - 1, middle.y),
    })
}

fn build_perimeter(position: IVec2, size: IVec2) -> Vec<IVec2> {
    let mut spots = Vec::new();
    for z in 0..size.y {
        spots.extend([IVec2::new(-1, z), IVec2::new(size.x, z)]);
    }
    for x in 0..size.x {
        spots.extend([IVec2::new(x, size.y), IVec2::new(x, -1)]);
    }
    spots.iter_mut().for_each(|spot| *spot += position);
    spots
}

fn access_road(cell: IVec2) -> bool {
    let Vec2 { x, y: z } = world_position(cell.x as f32, cell.y as f32);
    (MAP_START..=ROAD_END).contains(&z) && (x - road_center(z)).abs() < road_width(z)
}

fn size(definition: &Project, rotation: u8) -> IVec2 {
    rotated_size(IVec2::from_array(definition.size), rotation)
}

fn rotated_size(size: IVec2, rotation: u8) -> IVec2 {
    if rotation.is_multiple_of(2) {
        size
    } else {
        IVec2::new(size.y, size.x)
    }
}

pub(crate) fn default_field_size() -> IVec2 {
    IVec2::splat(2)
}

fn field_size_input(keyboard: &ButtonInput<KeyCode>) -> Option<IVec2> {
    let amount = i32::from(keyboard.just_pressed(KeyCode::BracketRight))
        - i32::from(keyboard.just_pressed(KeyCode::BracketLeft));
    let axis = if keyboard.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]) {
        IVec2::Y
    } else {
        IVec2::X
    };
    (amount != 0).then_some(axis * amount)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::setup::WorldSetup;

    #[test]
    fn every_catalog_blueprint_has_a_valid_site_on_the_default_sandbox_plot() {
        let catalog = Catalog::default();
        let mut setup = WorldSetup::default();
        setup.mode = crate::setup::Mode::Sandbox;
        let camp = IVec2::new(36, 36);
        let terrain = setup.terrain().with_camp(camp);
        let land = Land::generate(&setup);
        let ground = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp,
        };
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: setup.round_trip_km(),
        };
        let mut candidates: Vec<_> = (-30..94)
            .flat_map(|z| (-30..94).map(move |x| IVec2::new(x, z)))
            .collect();
        candidates.sort_by_key(|&position| (position - IVec2::new(44, 36)).length_squared());
        for (key, project) in &catalog.projects {
            let mut construction = Construction::default();
            let (position, rotation) = (0..4)
                .find_map(|rotation| {
                    candidates
                        .iter()
                        .copied()
                        .find(|&position| {
                            let proposal = Construction::proposal(
                                &catalog,
                                key,
                                position,
                                default_field_size(),
                                rotation,
                            );
                            construction
                                .placement_error(
                                    &terrain,
                                    &land,
                                    camp,
                                    &proposal,
                                    project,
                                    (&catalog, true, None),
                                )
                                .is_none()
                        })
                        .map(|position| (position, rotation))
                })
                .unwrap_or_else(|| panic!("{key} has no valid placement"));
            let order = LabOrder::Build {
                key: key.clone(),
                x: position.x,
                z: position.y,
                rotation,
                size: None,
            };
            let mut stock = Stock::for_start(&setup, &catalog);
            construction
                .lab_order(
                    &catalog,
                    &mut stock,
                    ground,
                    clock,
                    &order,
                    setup.richness(),
                )
                .unwrap_or_else(|error| panic!("{key} at {position}: {error}"));
            let plan = &construction.plans[0];
            assert_eq!(&plan.key, key);
            assert_eq!(plan.delivered, plan.loads, "{key}");
            if key == "road" {
                assert_eq!(plan.work, 0.0);
            } else {
                assert_eq!(plan.work, project.work, "{key}");
                assert_eq!(
                    construction.finished_models(&catalog).next().unwrap().1,
                    project.model
                );
            }
            assert!(construction.valid_save(&catalog, &stock), "{key}");

            if matches!(
                key.as_str(),
                "gathering" | "shelter" | "road" | "bridge" | "water-pump"
            ) {
                let story = WorldSetup::default();
                let mut stock = Stock::for_start(&story, &catalog);
                let mut construction = Construction::default();
                construction
                    .lab_order(
                        &catalog,
                        &mut stock,
                        ground,
                        clock,
                        &order,
                        story.richness(),
                    )
                    .unwrap_or_else(|error| panic!("Story {key}: {error}"));
                assert_eq!(construction.plans[0].delivered, 0, "{key}");
                assert_eq!(construction.plans[0].work, 0.0, "{key}");
                for step in 0..32_000 {
                    construction.tick(
                        &catalog,
                        &mut stock,
                        ground,
                        TownClock {
                            seconds: f64::from(step) / 10.0,
                            ..clock
                        },
                        0.1,
                        false,
                    );
                    if construction.plans[0].work >= project.work {
                        break;
                    }
                }
                let plan = &construction.plans[0];
                assert_eq!(plan.delivered, plan.loads, "Story {key}");
                assert_eq!(plan.work, project.work, "Story {key}");
                assert!(construction.valid_save(&catalog, &stock), "Story {key}");
            }
        }
    }

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
        let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
        stock.sandbox = true;
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
        construction.select_facility(IVec2::new(44, 36));
        construction.production.open = true;
        let index = construction
            .recipes(&catalog, 0)
            .into_iter()
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
            construction.tick(&catalog, &mut stock, site, clock, 0.1, false);
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
        let mut saved_between_loads = false;
        for step in 0..16_000 {
            let clock = TownClock {
                seconds: f64::from(step) / 10.0,
                round_trip_km: 12,
            };
            construction.tick(&catalog, &mut stock, site, clock, 0.1, false);
            let Some(job) = construction.gathering.orders.get(&deposit) else {
                break;
            };
            if !returning {
                assert_eq!(stock.available("stone"), 0);
            }
            returning |= job.phase == GatherPhase::Return;
            if !saved_between_loads && job.phase == GatherPhase::CollectOutput {
                let delivered = stock.available("stone");
                assert!((1..output).contains(&delivered));
                assert_eq!(job.remaining.as_ref().unwrap()["stone"], output - delivered);
                construction =
                    serde_json::from_slice(&serde_json::to_vec(&construction).unwrap()).unwrap();
                assert!(construction.gathering.valid_save(&land, &catalog));
                saved_between_loads = true;
            }
        }
        assert!(returning);
        assert!(saved_between_loads);
        assert!(construction.gathering.orders.is_empty());
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
            construction.tick(&catalog, &mut stock, site, clock, 0.1, false);
        }
        assert_eq!(construction.plans[0].pickups, 0);
        assert_eq!(stock.balance(), 872_824);
        assert!(construction.valid_save(&catalog, &stock));
    }

    #[test]
    fn pitching_tents_moves_only_residents_whose_arrival_spots_are_blocked() {
        let terrain = WorldSetup::default().terrain();
        let catalog = Catalog::default();
        let land = Land::default();
        let camp = IVec2::new(33, -9);
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp,
        };
        let mut village = Construction::default();
        let before = village
            .residents
            .each_ref()
            .map(|resident| resident.position);
        let blocked = before.map(|position| {
            village.blocked(&catalog, &terrain, &land, camp, position.round().as_ivec2())
        });
        assert!(blocked.iter().any(|&occupied| occupied));
        assert!(blocked.iter().any(|&occupied| !occupied));
        village.clear_arrival_positions(&catalog, site);
        for ((resident, before), was_blocked) in village.residents.iter().zip(before).zip(blocked) {
            assert_eq!(resident.position != before, was_blocked);
            assert!(!village.blocked(
                &catalog,
                &terrain,
                &land,
                camp,
                resident.position.round().as_ivec2()
            ));
        }
    }

    #[test]
    fn a_blueprint_across_the_river_requires_a_completed_crossing() {
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
        let mut village = Construction {
            selection: Some("fire-circle".into()),
            ..default()
        };
        assert!(village.camp_is_reachable(&catalog, site));
        assert!(!village.camp_is_reachable(
            &catalog,
            ConstructionSite {
                camp: IVec2::new(-24, 36),
                ..site
            },
        ));
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        village.plan(&catalog, &mut stock, site, IVec2::new(-24, 36), clock);
        assert!(village.plans.is_empty());
        assert_eq!(
            village.status,
            "Leave a walking route from the supplies to the work site."
        );
    }

    #[test]
    fn placing_over_an_open_entrance_is_rejected_but_a_road_keeps_it_open() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        stock.sandbox = true;
        let terrain = setup.terrain();
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        let mut village = Construction {
            selection: Some("home-cottage".into()),
            rotation: 1,
            ..default()
        };
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        village.plan(&catalog, &mut stock, site, IVec2::new(44, 36), clock);
        let entrance =
            building_entrance(&village.plans[0], &catalog.projects["home-cottage"]).unwrap();
        assert_eq!(entrance, IVec2::new(48, 38));
        village.selection = Some("fire-circle".into());
        village.plan(&catalog, &mut stock, site, entrance, clock);
        assert_eq!(village.plans.len(), 1);
        assert_eq!(
            village.status,
            "Keep the existing building's entrance clear."
        );
        village.selection = Some("road".into());
        village.plan(&catalog, &mut stock, site, entrance, clock);
        assert_eq!(village.plans.len(), 2);
    }

    #[test]
    fn a_blueprint_cannot_cut_off_an_existing_entrance() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        stock.sandbox = true;
        let terrain = setup.terrain();
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        let mut village = Construction {
            selection: Some("home-cottage".into()),
            ..default()
        };
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        village.plan(&catalog, &mut stock, site, IVec2::new(44, 36), clock);
        let entrance =
            building_entrance(&village.plans[0], &catalog.projects["home-cottage"]).unwrap();
        for side in [IVec2::X, IVec2::NEG_X] {
            let obstacle = village.proposed_site(&catalog, "fire-circle", entrance + side);
            village.plans.push(obstacle);
        }
        village.selection = Some("fire-circle".into());
        village.plan(&catalog, &mut stock, site, entrance + IVec2::Y, clock);
        assert_eq!(village.plans.len(), 3);
        assert_eq!(
            village.status,
            "Keep a walking route to the existing building's entrance."
        );
    }

    #[test]
    fn a_blueprint_preserves_the_last_work_spot_of_an_existing_project() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        stock.sandbox = true;
        let terrain = setup.terrain();
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        let mut village = Construction {
            selection: Some("fire-circle".into()),
            ..default()
        };
        let center = IVec2::new(47, 36);
        village.plan(&catalog, &mut stock, site, center, clock);
        for side in [IVec2::X, IVec2::NEG_X, IVec2::Y] {
            let obstacle = village.proposed_site(&catalog, "fire-circle", center + side);
            village.plans.push(obstacle);
        }
        village.selection = Some("fire-circle".into());
        village.plan(&catalog, &mut stock, site, center - IVec2::Y, clock);
        assert_eq!(village.plans.len(), 4);
        assert_eq!(
            village.status,
            "Keep a walking route to the existing work site."
        );
    }

    #[test]
    fn a_house_with_a_blocked_front_can_be_placed_after_rotating() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        stock.sandbox = true;
        let terrain = setup.terrain();
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        let mut village = Construction {
            selection: Some("home-cottage".into()),
            ..default()
        };
        let cell = IVec2::new(44, 36);
        let house = village.proposed_site(&catalog, "home-cottage", cell);
        let entrance = building_entrance(&house, &catalog.projects["home-cottage"]).unwrap();
        village
            .plans
            .push(village.proposed_site(&catalog, "fire-circle", entrance));
        village.plan(&catalog, &mut stock, site, cell, clock);
        assert_eq!(village.plans.len(), 1);
        assert_eq!(
            village.status,
            "Leave a walking route to the proposed entrance or rotate the building."
        );
        village.rotation = 1;
        village.plan(&catalog, &mut stock, site, cell, clock);
        assert_eq!(village.plans.len(), 2);
    }

    #[test]
    fn a_new_blueprint_cannot_trap_a_resident_away_from_food() {
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
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        let mut village = Construction::default();
        let isolated = IVec2::new(47, 36);
        village.residents[0].position = isolated.as_vec2();
        for offset in [IVec2::X, IVec2::NEG_X, IVec2::Y] {
            village
                .plans
                .push(village.proposed_site(&catalog, "fire-circle", isolated + offset));
        }
        village.selection = Some("fire-circle".into());
        village.plan(&catalog, &mut stock, site, isolated - IVec2::Y, clock);
        assert_eq!(village.plans.len(), 3);
        assert_eq!(
            village.status,
            "Leave residents a walking route to the food stores."
        );
    }

    #[test]
    fn selecting_power_shortages_visits_only_affected_projects_and_wraps() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut village = Construction::default();
        for x in [40, 42, 44] {
            village.plans.push(Construction::proposal(
                &catalog,
                "streetlight",
                IVec2::new(x, 36),
                default_field_size(),
                0,
            ));
        }
        village
            .utilities
            .sync(village.plans.iter().enumerate().map(|(index, plan)| {
                crate::utilities::Facility {
                    id: index + 1,
                    kind: "streetlight",
                    location: plan.position,
                    size: plan.size,
                    batteries: 0,
                    panels: 0,
                    working: false,
                }
            }));
        village.utilities.toggle(1);
        village.utilities.grid_off = true;
        village
            .utilities
            .tick(&setup, &mut stock, 0, 16.0 * crate::weather::HOUR, 0.1);

        for index in [0, 2, 0] {
            assert!(village.select_power_shortage().is_some());
            assert_eq!(village.production.selected, Some(index));
        }
    }

    #[test]
    fn copying_a_field_preserves_its_rotation_and_footprint() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let footprint = IVec2::new(3, 5);
        let field = Construction::proposal(&catalog, "field", IVec2::new(40, 36), footprint, 1);
        let mut village = Construction {
            plans: vec![field],
            ..default()
        };
        village.production.selected = Some(0);
        let mut keys = ButtonInput::default();
        keys.press(KeyCode::ControlLeft);
        keys.press(KeyCode::KeyD);
        village.lifecycle_input(&catalog, &mut stock, &keys);

        assert_eq!(village.selection.as_deref(), Some("field"));
        assert_eq!(village.rotation, 1);
        assert_eq!(village.field_size, footprint);
        assert_eq!(village.plans.len(), 1);
    }

    #[test]
    fn shift_placement_keeps_repeatable_blueprints_selected() {
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
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        let mut village = Construction {
            selection: Some("field".into()),
            ..default()
        };
        village.place_blueprint(&catalog, &mut stock, site, IVec2::new(40, 36), clock, true);
        assert_eq!(village.plans.len(), 1);
        assert_eq!(village.selection.as_deref(), Some("field"));
        village.place_blueprint(&catalog, &mut stock, site, IVec2::new(45, 36), clock, false);
        assert_eq!(village.plans.len(), 2);
        assert!(village.selection.is_none());
    }

    #[test]
    fn build_menu_opens_in_the_v2_category_for_each_mode() {
        let catalog = Catalog::default();
        for (sandbox, initial, next) in [
            (false, "gathering", "shelter"),
            (true, "shelter", "orchard"),
        ] {
            let mut construction = Construction::default();
            construction.toggle_build_menu(sandbox);
            assert_eq!(construction.build_rows(&catalog)[0].0, initial);
            construction.change_build_category(false);
            construction.toggle_build_menu(sandbox);
            construction.toggle_build_menu(sandbox);
            assert_eq!(construction.build_rows(&catalog)[0].0, next);
        }
    }

    #[test]
    fn sandbox_builds_a_catalog_project_without_spending_stock() {
        let mut setup = WorldSetup::default();
        setup.mode = crate::setup::Mode::Sandbox;
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let initial_wood = stock.available("wood");
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
        assert_eq!(stock.available("wood"), initial_wood);
    }

    #[test]
    fn residents_prefer_their_aspiration_unless_the_player_prioritizes_another_build() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let camp = IVec2::new(36, 36);
        let terrain = setup.terrain().with_camp(camp);
        let land = Land::default();
        let mut village = Construction::default();
        for (key, cell) in [
            ("gathering", IVec2::new(44, 36)),
            ("orchard", IVec2::new(49, 36)),
        ] {
            let mut plan = village.proposed_site(&catalog, key, cell);
            plan.delivered = plan.loads;
            village.plans.push(plan);
        }
        village.assign(0, &catalog, &terrain, &land, camp);
        assert_eq!(village.residents[0].assignment.take().unwrap().project, 1);
        village.priority = Some(0);
        village.assign(0, &catalog, &terrain, &land, camp);
        assert_eq!(village.residents[0].assignment.take().unwrap().project, 0);
    }

    #[test]
    fn construction_routes_detour_around_a_new_blueprint() {
        let catalog = Catalog::default();
        let camp = IVec2::new(36, 36);
        let terrain = WorldSetup::default().terrain().with_camp(camp);
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp,
        };
        let mut village = Construction::default();
        let obstacle = IVec2::new(45, 36);
        let goal = Vec2::new(47.0, 36.125);
        village
            .plans
            .push(village.proposed_site(&catalog, "supply-5", obstacle));
        village
            .plans
            .push(village.proposed_site(&catalog, "gathering", IVec2::new(45, 37)));
        village.residents[0].position = IVec2::new(44, 36).as_vec2();
        village.residents[0].path = VecDeque::from([obstacle.as_vec2(), goal]);
        village.refresh_resident_route(0, &catalog, site);
        let path = &village.residents[0].path;
        assert_eq!(path.back(), Some(&goal));
        assert!(!path.contains(&obstacle.as_vec2()));
        village.residents[0].path = VecDeque::from([obstacle.as_vec2()]);
        village.refresh_resident_route(0, &catalog, site);
        let worker = &mut village.residents[0];
        let position = worker.position;
        worker.move_along_path(1.0, false);
        assert_eq!(worker.position, position);
        assert!(!worker.path.is_empty());
        worker.assignment = Some(Assignment {
            project: 1,
            spot: obstacle,
            activity: Activity::Walk,
            to_site: VecDeque::new(),
            haul: Haul::Direct,
        });
        assert_eq!(worker.blocked_construction_project(), Some(1));
        assert_eq!(village.project_status(&catalog, 1), "Waiting for access");
        assert_eq!(
            village.lab_stop_reason(LabStop::Blocked, 0.0),
            Some("A job is waiting for access.")
        );
        let retry_ticks = village.residents[0].route_retry_ticks;
        let encoded = serde_json::to_string(&village).unwrap();
        village = serde_json::from_str(&encoded).unwrap();
        assert_eq!(village.residents[0].route_retry_ticks, retry_ticks);
        village.refresh_resident_route(0, &catalog, site);
        assert_eq!(village.residents[0].route_retry_ticks, retry_ticks - 1);
        village.plans[0].removed = true;
        village.refresh_resident_route(0, &catalog, site);
        assert_eq!(village.lab_stop_reason(LabStop::Blocked, 0.0), None);
        let worker = &mut village.residents[0];
        worker.move_along_path(1.0, false);
        assert_ne!(worker.position, position);
        let mut setup = WorldSetup::default();
        setup.mode = crate::setup::Mode::Sandbox;
        let mut stock = Stock::for_start(&setup, &catalog);
        let coop = village.proposed_site(&catalog, "coop", IVec2::new(50, 36));
        village.plans.push(coop);
        village.queue_batch(&catalog, &mut stock, 2, "eggs");
        village.production.jobs[0].worker = Some(0);
        village.residents[0].assignment = None;
        village.residents[0].position = IVec2::new(44, 36).as_vec2();
        village.residents[0].path = VecDeque::from([obstacle.as_vec2()]);
        village.plans[0].removed = false;
        village.refresh_resident_crowding(&catalog, site);
        let job = &village.production.jobs[0];
        assert_eq!(
            village.batch_status(job, &catalog, &stock, 0.0),
            "Waiting for access"
        );
        assert_eq!(
            village.lab_stop_reason(LabStop::Blocked, 0.0),
            Some("A job is waiting for access.")
        );
        village.plans[0].removed = true;
        village.refresh_resident_crowding(&catalog, site);
        assert_eq!(village.lab_stop_reason(LabStop::Blocked, 0.0), None);
        village.production.jobs[0].worker = None;
        let worker = &mut village.residents[0];
        worker.health.task = Some(crate::residents::NeedTask {
            kind: Need::Hunger,
            facility: None,
            elapsed: 0.0,
            started_at: None,
            duration: 12.0,
            water: 0.0,
            returning: false,
            partner: None,
            conversation: None,
        });
        village.plans[0].removed = false;
        village.refresh_resident_crowding(&catalog, site);
        assert_eq!(village.resident_action(&catalog, 0), "Waiting for access");
        assert_eq!(village.lab_stop_reason(LabStop::Blocked, 0.0), None);
        village.plans[0].removed = true;
        village.refresh_resident_crowding(&catalog, site);
        assert!(!village.residents[0].waiting_for_route());
        village.residents[0].health.task = None;
        village.plans[0].removed = false;
        village.trip = Some(TownTrip {
            project: 0,
            farm_bed: None,
            market_order: false,
            exports: 0,
            return_purchase: None,
            driver: 0,
            vehicle: 0,
            elapsed: 0.0,
            duration: 20.0,
            boarded: false,
        });
        village.refresh_resident_crowding(&catalog, site);
        assert!(village.residents[0].waiting_for_route());
        village.trip.as_mut().unwrap().boarded = true;
        village.refresh_resident_crowding(&catalog, site);
        assert!(!village.residents[0].waiting_for_route());
    }

    #[test]
    fn residents_slow_down_when_another_resident_is_close() {
        let catalog = Catalog::default();
        let terrain = WorldSetup::default().terrain();
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        let mut village = Construction::default();
        village.residents[0].position = Vec2::ZERO;
        village.residents[1].position = Vec2::Y * 0.5;
        village.refresh_resident_crowding(&catalog, site);
        let worker = &mut village.residents[0];
        worker.path.push_back(Vec2::X * 5.0);
        worker.move_along_path(1.0, false);
        assert!((worker.position.x - 0.95 * 0.92 * 0.65).abs() < 1e-6);
        village.residents[1].position = Vec2::Y * 3.0;
        village.refresh_resident_crowding(&catalog, site);
        let worker = &mut village.residents[0];
        worker.move_along_path(1.0, false);
        assert!((worker.position.x - 0.95 * 0.92 * 1.65).abs() < 1e-6);
        assert!((village.residents[4].walking_pace - 1.06).abs() < 1e-6);
    }

    #[test]
    fn crowded_residents_sidestep_only_when_the_corridor_is_clear() {
        let mut village = Construction::default();
        let worker = &mut village.residents[0];
        worker.crowded = true;
        worker.position = Vec2::new(0.0, -0.499);
        worker.path = VecDeque::from([Vec2::X]);
        worker.sidestep_cells = [None; 9];
        worker.sidestep_cells[..4].copy_from_slice(&[
            Some(IVec2::ZERO),
            Some(IVec2::X),
            Some(IVec2::NEG_Y),
            Some(IVec2::new(1, -1)),
        ]);
        worker.move_along_path(0.1, false);
        let sidestepped = worker.position;
        worker.position = Vec2::new(0.0, -0.499);
        worker.speed = 0.0;
        worker.sidestep_cells[2] = None;
        worker.move_along_path(0.1, false);
        assert!(sidestepped.y < -0.5);
        assert!(worker.position.y > -0.5);
    }

    #[test]
    fn residents_brake_for_the_destination_but_not_intermediate_waypoints() {
        let mut construction = Construction::default();
        let worker = &mut construction.residents[0];
        let destination = Vec2::new(0.25, 0.0);
        worker.position = Vec2::ZERO;
        worker.speed = 0.95;
        worker.path = VecDeque::from([destination, Vec2::X]);
        worker.move_along_path(0.1, false);
        let through_speed = worker.speed;
        worker.position = Vec2::ZERO;
        worker.path = VecDeque::from([destination]);
        worker.move_along_path(0.1, false);
        assert_eq!(worker.speed, through_speed * 0.5);
        for _ in 0..20 {
            worker.move_along_path(0.1, false);
        }
        assert_eq!(worker.position, destination);
        assert!(worker.path.is_empty());
    }

    #[test]
    fn tired_residents_walk_and_haul_more_slowly() {
        for (carrying, pace) in [(false, 0.95), (true, 0.72)] {
            let mut construction = Construction::default();
            let worker = &mut construction.residents[0];
            worker.position = Vec2::ZERO;
            worker.path.push_back(Vec2::new(8.0, 0.0));
            worker.health.energy = 34.0;
            worker.move_along_path(1.0, carrying);
            assert!((worker.position.x - pace * 0.8).abs() < 1e-6);
            assert_eq!(worker.health.energy, 34.0 - 0.025);
            worker.health.energy = 35.0;
            worker.move_along_path(1.0, carrying);
            assert!((worker.position.x - pace * 1.8).abs() < 1e-6);
        }
    }

    #[test]
    fn construction_respects_builder_needs_and_opening_rain() {
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
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        let work_in_one_tick = |energy, food, raining, sheltered| {
            let mut stock = Stock::for_start(&setup, &catalog);
            let mut village = Construction::default();
            let mut plan = village.proposed_site(&catalog, "gathering", IVec2::new(44, 36));
            plan.delivered = plan.loads;
            village.plans.push(plan);
            if sheltered {
                let mut shelter = village.proposed_site(&catalog, "shelter", IVec2::new(42, 40));
                shelter.work = catalog.projects["shelter"].work;
                shelter.delivered = shelter.loads;
                village.plans.push(shelter);
            }
            for resident in &mut village.residents {
                resident.health.energy = 0.0;
            }
            let worker = &mut village.residents[0];
            worker.health.energy = energy;
            worker.health.levels[Need::Hunger as usize] = food;
            worker.assignment = Some(Assignment {
                project: 0,
                spot: IVec2::new(43, 36),
                activity: Activity::Build,
                to_site: VecDeque::new(),
                haul: Haul::Direct,
            });
            village.tick(&catalog, &mut stock, site, clock, 1.0, raining);
            village.plans[0].work
        };
        let normal = work_in_one_tick(75.0, 80.0, false, false);
        assert!(normal > 0.0);
        assert!((work_in_one_tick(75.0, 10.0, false, false) / normal - 0.65).abs() < 1e-8);
        assert_eq!(work_in_one_tick(24.0, 80.0, false, false), 0.0);
        assert!((work_in_one_tick(75.0, 80.0, true, false) / normal - 0.8).abs() < 1e-8);
        assert_eq!(work_in_one_tick(75.0, 80.0, true, true), normal);
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
        construction.select_project(Some(0));
        assert!(
            construction
                .selected_production(&catalog, &stock, 0.0)
                .unwrap()
                .contains("No crew assigned yet")
        );
        let mut saw_transit = false;
        let mut saw_assembly = false;
        let mut saw_named_crew = false;
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
                false,
            );
            let status = construction.project_status(&catalog, 0);
            saw_named_crew |= construction
                .selected_production(&catalog, &stock, 0.0)
                .unwrap()
                .contains("Assigned ·");
            saw_transit |= status.contains("loads delivered · 1 in transit")
                || status.contains("loads delivered · 2 in transit")
                || status.contains("loads delivered · 3 in transit");
            saw_assembly |= status.contains("assembly left");
            let project = &construction.plans[0];
            assert!(project.delivered <= loads);
            if project.delivered < loads {
                assert_eq!(project.work, 0.0);
            }
            if construction.finished_models(&catalog).next().is_some() {
                break;
            }
        }
        assert!(saw_transit && saw_assembly && saw_named_crew);
        assert_eq!(construction.finished_models(&catalog).count(), 1);
        assert_eq!(construction.plans[0].delivered, loads);
        assert!(
            construction
                .latest_event()
                .is_some_and(|event| { event.contains("Somewhere to sit together at last.") })
        );
        assert_eq!(stock.available("wood"), 28);
    }

    #[test]
    fn residents_stage_loads_at_nearby_storage_before_delivering_them() {
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
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        let mut construction = Construction {
            selection: Some("gathering".into()),
            ..default()
        };
        let mut depot = construction.proposed_site(&catalog, "warehouse", IVec2::new(39, 31));
        depot.work = catalog.projects["warehouse"].work;
        depot.delivered = depot.loads;
        construction.plans.push(depot);
        construction.plan(&catalog, &mut stock, site, IVec2::new(44, 36), clock);
        assert_eq!(construction.plans.len(), 2);

        let mut saw_staging = false;
        let mut depot_delivery = None;
        let mut saw_resident_staging_label = false;
        for _ in 0..8_000 {
            construction.tick(&catalog, &mut stock, site, clock, 0.1, false);
            let resident_status = construction.resident_status(&catalog, &stock, 0);
            saw_resident_staging_label |= resident_status
                .lines()
                .any(|line| line.contains("Carrying ") && line.contains("to nearby storage"));
            let target = &construction.plans[1];
            if target.staged > 0 && !saw_staging {
                assert_eq!(target.delivered, 0);
                assert!(construction.project_status(&catalog, 1).contains(&format!(
                    "at nearby storage ({} #1)",
                    catalog.projects["warehouse"].name
                )));
                let json = serde_json::to_string(&construction).unwrap();
                construction = serde_json::from_str(&json).unwrap();
                assert!(construction.valid_save(&catalog, &stock));
                construction.plans[0].depot = Some(0);
                assert!(!construction.valid_save(&catalog, &stock));
                construction.plans[0].depot = None;
                saw_staging = true;
            }
            if depot_delivery.is_none()
                && construction.residents.iter().any(|worker| {
                    worker.assignment.as_ref().is_some_and(|job| {
                        job.activity == Activity::Carry
                            && matches!(job.haul, Haul::FromDepot { .. })
                    })
                })
            {
                assert!(resident_status.lines().any(|line| {
                    line.contains("Carrying ") && line.contains("to Gathering place")
                }));
                depot_delivery = Some(serde_json::to_string(&construction).unwrap());
            }
            if construction.finished_models(&catalog).count() == 2 {
                break;
            }
        }
        assert!(saw_staging && saw_resident_staging_label);
        assert_eq!(construction.finished_models(&catalog).count(), 2);
        assert_eq!(construction.plans[1].staged, 0);
        assert_eq!(stock.available("wood"), 28);

        let mut interrupted: Construction =
            serde_json::from_str(&depot_delivery.expect("resident carrying loads from the depot"))
                .unwrap();
        interrupted.production.selected = Some(0);
        interrupted.apply_project_action(&catalog, &mut stock, ProjectAction::Demolish);
        assert!(interrupted.changes.contains_key(&0));
        assert!(interrupted.haul_depots(&catalog, 1, false).is_empty());
        assert_eq!(interrupted.haul_depots(&catalog, 1, true), vec![0]);
        // Start near the end of the warehouse's multi-day demolition.
        let demolition = interrupted.changes.get_mut(&0).unwrap();
        demolition.work = demolition.required - 1.0;
        for _ in 0..8_000 {
            interrupted.tick(&catalog, &mut stock, site, clock, 0.1, false);
            if interrupted.plans[0].removed
                && interrupted.plans[1].work >= catalog.projects["gathering"].work
            {
                break;
            }
        }
        assert!(interrupted.plans[0].removed);
        assert_eq!(interrupted.plans[1].depot, None);
        assert_eq!(interrupted.plans[1].staged, 0);
        assert!(interrupted.valid_save(&catalog, &stock));
        assert_eq!(interrupted.finished_models(&catalog).count(), 1);
        assert_eq!(interrupted.plans[1].delivered, interrupted.plans[1].loads);
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
