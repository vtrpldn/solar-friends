mod chains_lens;
mod events;
mod farm_work;
mod food_lens;
mod gather_work;
mod inventory;
mod kitchen_work;
mod lab_orders;
pub(crate) use lab_orders::{LabOrder, LabStop};
mod leisure;
mod lifecycle;
pub(crate) use lifecycle::ProjectAction;
mod production_work;
mod project_list;
mod resident_work;
mod roads;
mod town_pickup;
mod trade_work;
pub(crate) use trade_work::{TradeOrder, TradePolicy};
mod upkeep;
mod water_work;
mod work_lens;
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

#[derive(Clone, Copy, Deserialize, Serialize)]
struct TownTrip {
    project: usize,
    #[serde(default)]
    farm_bed: Option<usize>,
    #[serde(default, alias = "export")]
    market_order: bool,
    driver: usize,
    #[serde(default)]
    vehicle: usize,
    elapsed: f64,
    duration: f64,
    boarded: bool,
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
    category: usize,
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
    #[serde(default)]
    upkeep: upkeep::Upkeep,
    #[serde(skip)]
    moving: Option<usize>,
    #[serde(default)]
    priority: Option<usize>,
    #[serde(default)]
    trip: Option<TownTrip>,
    #[serde(default)]
    second_trip: Option<TownTrip>,
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
    work: f64,
    #[serde(default)]
    pickups: u32,
    #[serde(default)]
    fare: u64,
    #[serde(default)]
    removed: bool,
    #[serde(default)]
    purchase: Option<lifecycle::Purchase>,
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
            category: 0,
            page: 0,
            rotation: 0,
            field_size: default_field_size(),
            status: String::new(),
            slow_sandbox: false,
            plans: Vec::new(),
            events: events::VillageEvents::default(),
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
            upkeep: upkeep::Upkeep::default(),
            moving: None,
            priority: None,
            trip: None,
            second_trip: None,
            residents: std::array::from_fn(|index| {
                let (x, z) = ARRIVAL_SPOTS[index];
                Worker {
                    position: Vec2::new(x, z),
                    yaw: 0.0,
                    speed: 0.0,
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
        let category = CATEGORIES[self.category];
        let query = self.build_query.trim().to_lowercase();
        let matches = |text: &str| text.to_lowercase().contains(&query);
        let mut projects: Vec<_> = catalog
            .projects
            .iter()
            .filter(|(id, project)| {
                if query.is_empty() {
                    return match category {
                        "All" => true,
                        "Camp essentials" => project.camp_essential,
                        _ => project.category == category,
                    };
                }
                let material_matches = |id: &String| matches(&catalog.materials[id].name);
                matches(id)
                    || matches(&project.name)
                    || matches(&project.description)
                    || matches(&project.category)
                    || project.materials.keys().any(material_matches)
                    || catalog.production.values().any(|recipe| {
                        recipe.kind == project.kind
                            && (matches(&recipe.name) || recipe.output.keys().any(material_matches))
                    })
            })
            .collect();
        if query.is_empty() && category == "Camp essentials" {
            let rank = ["gathering", "well", "shelter", "toilet"];
            projects.sort_by_key(|(id, _)| rank.iter().position(|key| *key == id.as_str()));
        } else {
            projects.sort_by(|(_, a), (_, b)| a.name.cmp(&b.name));
        }
        projects
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
        for event in text.read() {
            if event.state != bevy::input::ButtonState::Pressed {
                continue;
            }
            if event.key_code == KeyCode::Backspace {
                self.build_query.pop();
            } else if let Some(chars) = &event.text {
                let room = 60usize.saturating_sub(self.build_query.chars().count());
                self.build_query
                    .extend(chars.chars().filter(|c| !c.is_control()).take(room));
            }
        }
        true
    }

    pub fn toggle_build_search(&mut self) {
        self.editing_search = !self.editing_search;
        self.selection = None;
        self.page = 0;
        self.status.clear();
    }

    pub fn toggle_build_menu(&mut self) {
        self.menu = !self.menu;
        self.selection = None;
        self.status.clear();
    }

    pub fn change_build_category(&mut self, reverse: bool) {
        self.build_query.clear();
        self.category =
            (self.category + if reverse { CATEGORIES.len() - 1 } else { 1 }) % CATEGORIES.len();
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
        self.menu && !self.placing_project() && !self.editing_search
    }

    pub fn build_row_labels<'a>(&self, catalog: &'a Catalog) -> Vec<&'a str> {
        self.options(catalog)
            .into_iter()
            .skip(self.page * BUILD_ROWS)
            .take(BUILD_ROWS)
            .map(|(_, project)| project.name.as_str())
            .collect()
    }

    pub fn pick_build_row(&mut self, catalog: &Catalog, row: usize) {
        if let Some((id, _)) = self.options(catalog).get(self.page * BUILD_ROWS + row) {
            self.choose_blueprint(id);
        }
    }

    fn choose_blueprint(&mut self, id: &str) {
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

    pub fn input(&mut self, keyboard: &ButtonInput<KeyCode>, catalog: &Catalog) {
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
            self.toggle_build_menu();
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
            self.pick_build_row(catalog, index);
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
            "U Auto-buy off"
        } else {
            "U Auto-buy on"
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
            "I Instant build off"
        } else {
            "I Instant build on"
        }
    }

    pub fn instructions(&self, catalog: &Catalog) -> String {
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
                "Village road · Click to start · Shift-click to extend\nZ Undo stroke · B or Esc Finish\n{}",
                self.status
            );
        }
        if self.selection.as_deref() == Some("field") {
            return format!(
                "Cultivated field · {} × {} cells\n[ ] Width · Shift [ ] Depth · R Rotate {}°\nClick to designate · B Close\n{}",
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
            return format!(
                "{details}\nClick to plan · R Rotate ({degrees}°) · B Close\n{}",
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
        } else if !self.build_query.trim().is_empty() {
            (
                format!("Search results · {}", self.build_query),
                "/ Search · Tab Category · Page Up/Down · B Close",
            )
        } else {
            (
                CATEGORIES[self.category].to_owned(),
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

    fn reserve_project(
        market: &mut Market,
        stock: &mut Stock,
        catalog: &Catalog,
        blueprint: &mut Blueprint,
        clock: TownClock,
    ) -> Result<(), String> {
        if stock.sandbox {
            return Ok(());
        }
        let materials = &catalog.projects[&blueprint.key].materials;
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
        if matches!(key, "field" | "garden" | "road") {
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
            definition.model,
            Transform::from_xyz(x, height, z).with_rotation(Quat::from_rotation_y(
                f32::from(self.rotation) * std::f32::consts::FRAC_PI_2,
            )),
        ))
    }

    fn proposed_site(&self, catalog: &Catalog, key: &str, position: IVec2) -> Blueprint {
        let definition = &catalog.projects[key];
        Blueprint {
            key: key.to_owned(),
            position,
            size: if key == "field" {
                rotated_size(self.field_size, self.rotation)
            } else {
                size(definition, self.rotation)
            },
            rotation: self.rotation,
            loads: catalog.loads(definition),
            delivered: 0,
            work: 0.0,
            pickups: 0,
            fare: 0,
            removed: false,
            purchase: None,
        }
    }

    pub fn draw_project_site(
        &self,
        ground: ConstructionSite,
        catalog: &Catalog,
        stock: &Stock,
        clock: TownClock,
        position: IVec2,
        gizmos: &mut Gizmos,
    ) -> Option<String> {
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
            self.market
                .quote(
                    catalog,
                    &definition.materials,
                    stock,
                    clock.seconds,
                    clock.round_trip_km,
                )
                .map(|quote| {
                    if quote.trips == 0 {
                        "Supplies available locally".into()
                    } else {
                        let cost = quote.price + quote.fare * u64::from(quote.trips);
                        format!(
                            "R${:.2} including {} town pickup(s)",
                            cost as f64 / 100.0,
                            quote.trips
                        )
                    }
                })
        };
        let tint = if status.is_ok() {
            Color::srgb_u8(217, 237, 165)
        } else {
            Color::srgb_u8(216, 122, 92)
        };
        draw_footprint(ground.terrain, position, proposal.size, tint, gizmos);
        Some(match status {
            Ok(detail) => detail,
            Err(reason) => format!("Blocked · {reason}"),
        })
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
        if !sandbox
            && !definition.repeatable
            && self.plans.iter().enumerate().any(|(index, project)| {
                !project.removed && ignore != Some(index) && project.key == blueprint.key
            })
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

fn draw_footprint(
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
        if stock.sandbox {
            return (stock.units(), 1_000_000);
        }
        let boarded: Vec<_> = self
            .active_trips()
            .filter(|trip| trip.market_order && trip.boarded)
            .map(|trip| trip.project)
            .collect();
        let used = stock.units() + self.trade.reserved_at_home(&boarded);
        let expansions = self
            .plans
            .iter()
            .filter(|project| {
                let definition = &catalog.projects[&project.key];
                !project.removed
                    && project.work >= definition.work
                    && matches!(definition.kind.as_str(), "warehouse" | "covered-storage")
            })
            .count() as u64;
        (used, 600 * (1 + expansions))
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
                        batteries: definition.materials.get("batteries").copied().unwrap_or(0),
                        panels: definition.materials.get("panels").copied().unwrap_or(0),
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
        let active: Vec<_> = self
            .active_trips()
            .filter(|trip| trip.boarded && trip.farm_bed.is_none() && !trip.market_order)
            .map(|trip| trip.project)
            .collect();
        let fares = self
            .plans
            .iter()
            .enumerate()
            .fold(0u64, |total, (index, project)| {
                let trips = project
                    .pickups
                    .saturating_sub(u32::from(active.contains(&index)));
                total.saturating_add(project.fare.saturating_mul(u64::from(trips)))
            });
        let fares = self.farming.jobs.iter().fold(fares, |total, job| {
            let paid = self.active_trips().any(|trip| {
                trip.boarded && trip.project == job.site && trip.farm_bed == Some(job.bed)
            });
            total.saturating_add(
                job.fare
                    .saturating_mul(u64::from(job.pickups.saturating_sub(u32::from(paid)))),
            )
        });
        let export_paid: Vec<_> = self
            .active_trips()
            .filter(|trip| trip.market_order && trip.boarded)
            .map(|trip| trip.project)
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
                && if trip.market_order {
                    trip.farm_bed.is_none() && self.trade.orders.get(trip.project).is_some()
                } else if let Some(bed) = trip.farm_bed {
                    self.farming
                        .jobs
                        .iter()
                        .any(|job| job.site == trip.project && job.bed == bed && job.pickups > 0)
                } else {
                    self.plans
                        .get(trip.project)
                        .is_some_and(|project| !project.removed && project.pickups > 0)
                }
        }) && self.trip.zip(self.second_trip).is_none_or(|(a, b)| {
            a.driver != b.driver
                && a.vehicle != b.vehicle
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
        if !self.events.valid()
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
        self.plans.len() <= 128 * 128
            && self.plans.iter().all(|plan| {
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
                    && worker.craft.valid()
                    && worker.leisure.valid()
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
        let project = self.plans.iter().rev().find(|plan| !plan.removed)?;
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
    ) {
        let ConstructionSite {
            terrain,
            land,
            camp,
        } = site;
        stock
            .equipment
            .release(|worker, task| self.active_tool_task(worker, task));
        let space = self.storage_space(catalog, stock);
        let locked = self.booked_trade_orders();
        for index in
            self.trade
                .age_shipments(catalog, stock, &mut self.market, clock.seconds, &locked)
        {
            self.removed_trade_order(index);
        }
        self.trade.receive_goods(stock, space, clock.seconds);
        let space = self.storage_space(catalog, stock);
        self.trade.maintain_pantry(
            catalog,
            stock,
            &mut self.market,
            (clock.seconds, clock.round_trip_km, space),
        );
        self.trade.auto_sell(
            catalog,
            stock,
            &mut self.market,
            clock.seconds,
            crate::market::fare_cents(clock.round_trip_km),
        );
        self.tick_changes(catalog, stock, site, dt);
        self.tick_water_work(catalog, stock, site, clock.seconds, dt);
        self.tick_upkeep(catalog, stock, site, dt);
        self.restock_upkeep(catalog, stock, site.land, clock);
        self.tick_shifts(catalog, stock, site, clock, dt);
        self.tick_trip(catalog, stock, site, clock, dt);
        self.tick_gathering(catalog, stock, site, clock.seconds, dt);
        self.tick_production(catalog, stock, site, clock.seconds, dt);
        self.tick_farm_jobs(catalog, stock, site, clock.seconds, dt);
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
                if project.removed || project.work >= catalog.projects[&project.key].work {
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
            let tools_in_repair = self.repairing(catalog, "carpentry-tools");
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
                    let tools = stock.use_tool(
                        index,
                        "carpentry-tools",
                        ToolTask::Building(job.project),
                        f64::from(dt),
                        tools_in_repair,
                    );
                    project.work = (project.work
                        + f64::from(dt)
                            * skill
                            * tools
                            * experience
                            * efficiency
                            * worker.health.hydration_factor())
                    .min(catalog.projects[&project.key].work);
                    if project.work >= catalog.projects[&project.key].work {
                        self.events.record(
                            clock.seconds,
                            format!("{} completed.", catalog.projects[&project.key].name),
                        );
                    }
                    worker.experience += f64::from(dt);
                    worker.health.energy = (worker.health.energy - f64::from(dt) * 0.16).max(0.0);
                }
            }
            self.residents[index].assignment = Some(job);
        }
        stock
            .equipment
            .release(|worker, task| self.active_tool_task(worker, task));
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
        let candidates = self
            .priority
            .into_iter()
            .chain((0..self.plans.len()).filter(|index| Some(*index) != self.priority));
        for id in candidates {
            let project = &self.plans[id];
            let definition = &catalog.projects[&project.key];
            if project.removed
                || self.changes.contains_key(&id)
                || project.pickups > 0
                || project.work >= definition.work
            {
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
            !plan.removed
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
            || self.plans.iter().any(|plan| {
                !plan.removed
                    && plan.key != "road"
                    && inside(plan.position, plan.position + plan.size)
            })
    }
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

fn default_field_size() -> IVec2 {
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
