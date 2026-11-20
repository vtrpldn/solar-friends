use crate::{audio::SoundSettings, utilities::NetworkView};
mod almanac;
mod build_menu;
mod building_lighting;
mod building_preview;
mod construction_models;
mod cultivation_surface;
mod diagnostics;
mod fire;
mod guide;
mod guide_diagrams;
pub(crate) mod lab;
mod land_lens;
mod lens_picker;
mod thumbnails;
use lens_picker::{LensPicker, MapLens};
mod library_ui;
mod livestock_motion;
mod resident_meters;
pub(crate) mod resident_motion;
mod resource_lens;
mod resource_trends;
mod road_surface;
mod toolbar;
pub(crate) use toolbar::PanelPicker;
mod vehicle_motion;

use library_ui::{autosave_named, library_controls};

use bevy::{
    asset::{AssetPath, embedded_asset, embedded_path},
    gltf::GltfAssetLabel,
    picking::prelude::{MeshRayCast, MeshRayCastSettings},
    prelude::*,
    window::{PrimaryWindow, WindowCloseRequested},
};
use serde::{Deserialize, Serialize};

use crate::{
    GroundMesh, VillageCamera,
    arrival::{
        ARRIVAL_DURATION, MAP_START, ROAD_END, resident_pose, road_center, road_width,
        town_vehicle_pose, vehicle_pose, world_position,
    },
    catalog::Catalog,
    construction::{
        Construction, ConstructionSite, InventoryView, SaleSetting, TownClock, WaterAction,
        WorkGroup,
    },
    land::Land,
    resident_animation::{Motion, ResidentAnimation},
    save,
    save_library::{self, SaveMenu},
    setup::{Mode, WorldSetup},
    stock::Stock,
    terrain::{Terrain, TerrainEditor},
    time_advance::{Advance, AdvanceAction},
    ui_font::ui_font,
    weather::{forecast, weather_at},
};

pub(crate) const SIMULATION_HZ: f64 = 10.0;
pub(crate) const SIMULATION_STEP: f64 = 1.0 / SIMULATION_HZ;

const SPEEDS: [(KeyCode, u8); 4] = [
    (KeyCode::Digit1, 1),
    (KeyCode::Digit2, 4),
    (KeyCode::Digit3, 8),
    (KeyCode::Digit4, 16),
];
const UNAVAILABLE_SPEED: u8 = 64;
const LIVE_STEP_BUDGET: std::time::Duration = std::time::Duration::from_millis(8);
pub(crate) const NAMES: [&str; 5] = ["Iara", "Bento", "Luz", "Cauã", "Nina"];
const CLEARING_CAMP: IVec2 = IVec2::new(36, 36);
const CAMP_SITES: [(KeyCode, IVec2); 3] = [
    (KeyCode::Digit1, IVec2::new(28, 31)),
    (KeyCode::Digit2, IVec2::new(33, -9)),
    (KeyCode::Digit3, CLEARING_CAMP),
];

pub struct VillagePlugin;

pub(crate) fn start_downtime_preview(app: &mut App) -> Result<(), String> {
    let setup = WorldSetup::default().session();
    let catalog = Catalog::default();
    let land = Land::generate(&setup);
    let camp = CLEARING_CAMP;
    let mut village = Village {
        setup: Some(setup.clone()),
        camp: Some(camp),
        arrival_time: ARRIVAL_DURATION,
        clock: 1300.0,
        stock: Stock::for_start(&setup, &catalog),
        rebuild_scene: true,
        save_notice: "Downtime preview · This village is not saved.".into(),
        ..default()
    };
    village.stock.cash = 3000;
    village.stock.sandbox = true;
    let clock = TownClock {
        seconds: village.clock,
        round_trip_km: setup.round_trip_km(),
    };
    for (key, x, z) in [
        ("solar_farm", 27, 39),
        ("well", 33, 39),
        ("workshop", 38, 39),
        ("warehouse", 45, 39),
        ("garden", 45, 31),
        ("eco_toilet", 39, 30),
        ("banana_treatment", 43, 25),
        ("wetland", 34, 30),
        ("house", 27, 30),
        ("streetlight", 30, 37),
        ("fire-circle", 33, 36),
    ] {
        let terrain = village.terrain(&setup);
        let ground = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp,
        };
        let mut offsets = (-16i32..=16)
            .flat_map(|dz| (-16i32..=16).map(move |dx| (dx, dz)))
            .collect::<Vec<_>>();
        offsets.sort_by_key(|&(dx, dz)| (dx.abs().max(dz.abs()), dx * dx + dz * dz));
        if !offsets.into_iter().any(|(dx, dz)| {
            village
                .construction
                .lab_order(
                    &catalog,
                    &mut village.stock,
                    ground,
                    clock,
                    &crate::construction::LabOrder::Build {
                        key: key.into(),
                        x: x + dx,
                        z: z + dz,
                        rotation: 0,
                        size: None,
                    },
                    setup.richness(),
                )
                .is_ok()
        }) {
            return Err(format!("Could not place {key} in the downtime preview"));
        }
    }
    village.stock.sandbox = false;
    village.construction.prepare_downtime_preview();
    app.insert_resource(setup)
        .insert_resource(village)
        .insert_resource(SaveMenu {
            preview: true,
            ..default()
        });
    Ok(())
}

impl Plugin for VillagePlugin {
    fn build(&self, app: &mut App) {
        register_opening_models(app);
        register_building_models(app);
        road_surface::install(app);
        building_preview::install(app);
        build_menu::install(app);
        thumbnails::install(app);
        toolbar::install(app);
        guide::install(app);
        library_ui::install(app);
        resident_meters::install(app);
        building_lighting::install(app);
        livestock_motion::install(app);
        vehicle_motion::install(app);
        app.add_systems(PostUpdate, cultivation_surface::show_beds)
            .add_systems(
                PostUpdate,
                crate::sync_camera_view.before(TransformSystems::Propagate),
            );
        app.init_resource::<Village>()
            .init_resource::<CampPointer>()
            .init_resource::<MapNotice>()
            .init_resource::<SoundSettings>()
            .init_resource::<Catalog>()
            .init_resource::<SaveMenu>()
            .insert_resource(Time::<Fixed>::from_hz(SIMULATION_HZ))
            .add_systems(Startup, spawn_hud)
            .add_systems(PreUpdate, save_on_window_close)
            .add_systems(
                Update,
                (
                    save_controls,
                    library_controls,
                    read_camp_pointer,
                    (village_input, almanac::sites::input).chain(),
                    crate::camera_controls,
                    advance_days,
                    animate_arrival,
                    draw_blueprints,
                    show_hud,
                    (
                        almanac::refresh,
                        almanac::sites::refresh,
                        almanac::sites::paint,
                    )
                        .chain(),
                    fit_and_scroll_hud,
                    show_construction,
                    construction_models::show_in_progress,
                    fire::light_new_fires,
                    fire::animate_fires,
                )
                    .chain(),
            )
            .add_systems(
                Update,
                (autosave_named, autosave_continue)
                    .chain()
                    .after(advance_days),
            )
            .add_systems(FixedUpdate, advance_clock);
    }
}

#[derive(Clone, Copy, PartialEq, Deserialize, Serialize)]
pub(super) struct CameraView {
    pub target: Vec3,
    pub heading: f32,
    #[serde(default = "crate::default_camera_polar")]
    pub polar: f32,
    pub zoom: f32,
}

impl CameraView {
    fn valid(self) -> bool {
        self.target.is_finite()
            && self.target.x.abs() <= 124.0
            && self.target.z.abs() <= 124.0
            && self.target.y.abs() <= 128.0
            && self.heading.is_finite()
            && crate::CAMERA_POLAR_LIMITS.contains(&self.polar)
            && (1.0 / 6.0..=crate::CAMERA_MAX_ZOOM_OUT).contains(&self.zoom)
    }
}

#[derive(Resource, Default, Deserialize, Serialize)]
pub struct Village {
    setup: Option<WorldSetup>,
    pub camp: Option<IVec2>,
    clock: f64,
    arrival_time: f32,
    paused: bool,
    speed: usize,
    #[serde(default)]
    pub(super) camera_view: Option<CameraView>,
    #[serde(skip)]
    pub(crate) show_forecast: bool,
    #[serde(skip)]
    advance: Advance,
    #[serde(skip)]
    utility_panel: Option<UtilityPanel>,
    #[serde(skip)]
    selected_resident: usize,
    #[serde(skip)]
    resident_profile: ResidentProfile,
    #[serde(skip)]
    finance_history_open: bool,
    #[serde(skip)]
    finance_history_page: usize,
    #[serde(skip)]
    pantry_batch_page: Option<usize>,
    #[serde(skip)]
    event_page: usize,
    #[serde(skip)]
    inventory_page: usize,
    #[serde(skip)]
    inventory_view: InventoryView,
    #[serde(skip)]
    craft_view: crate::construction::CraftView,
    #[serde(skip)]
    craft_recipe: Option<String>,
    #[serde(skip)]
    craft_workspace: Option<usize>,
    #[serde(skip)]
    craft_job_site: Option<usize>,
    #[serde(skip)]
    inventory_search: String,
    #[serde(skip)]
    numeric_entry: Option<(NumericTarget, String)>,
    #[serde(skip)]
    editing_inventory: bool,
    #[serde(skip)]
    projects_page: usize,
    #[serde(skip)]
    upkeep_page: usize,
    #[serde(skip)]
    guide: guide::Guide,
    #[serde(skip)]
    lenses: LensPicker,
    #[serde(skip)]
    show_grid: bool,
    #[serde(skip)]
    open_projects_only: bool,
    project_roads_expanded: bool,
    project_events_expanded: bool,
    #[serde(skip)]
    housing_notice: String,
    #[serde(skip)]
    camp_error: Option<&'static str>,
    #[serde(skip)]
    pub(crate) save_notice: String,
    #[serde(skip)]
    rebuild_scene: bool,
    #[serde(skip)]
    session_serial: u64,
    #[serde(default)]
    terrain_editor: TerrainEditor,
    #[serde(skip)]
    water_panel: WaterControls,
    #[serde(skip)]
    power_link: usize,
    #[serde(skip)]
    power_source: usize,
    #[serde(skip)]
    power_target: usize,
    #[serde(skip)]
    power_notice: String,
    #[serde(skip)]
    water_link: usize,
    #[serde(skip)]
    connect_road_strokes: bool,
    #[serde(skip)]
    advance_checkpoint: bool,
    stock: Stock,
    construction: Construction,
}

#[derive(Default)]
struct WaterControls {
    target: usize,
    source: Option<usize>,
    channel: usize,
    message: String,
}

const WATER_CHANNELS: [&str; 4] = ["Drinking", "Irrigation", "Greywater", "Sewage"];

#[derive(Clone, Copy)]
enum WaterCommand {
    Camp { source: bool },
    NextChannel,
    River,
    Carry,
    Purify,
    Sanitation,
    Policy(bool),
}

impl WaterControls {
    fn input(
        &mut self,
        keyboard: &ButtonInput<KeyCode>,
        hit: Option<GroundHit>,
        construction: &mut Construction,
    ) {
        let shift = keyboard.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]);
        if let Some(id) = hit.and_then(|hit| construction.utilities.water_at(hit.cell)) {
            self.select_facility(id, shift);
        }
        if keyboard.just_pressed(KeyCode::KeyC) {
            self.apply(WaterCommand::Camp { source: shift }, construction);
        }
        if let Some(channel) = [
            KeyCode::Digit1,
            KeyCode::Digit2,
            KeyCode::Digit3,
            KeyCode::Digit4,
        ]
        .into_iter()
        .position(|key| keyboard.just_pressed(key))
        {
            self.channel = channel;
        }
        let commands = [
            (KeyCode::KeyM, WaterCommand::Policy(true)),
            (KeyCode::KeyL, WaterCommand::Policy(false)),
            (KeyCode::KeyR, WaterCommand::River),
            (KeyCode::KeyT, WaterCommand::Carry),
            (KeyCode::KeyY, WaterCommand::Purify),
            (KeyCode::KeyK, WaterCommand::Sanitation),
        ];
        if let Some((_, command)) = commands
            .into_iter()
            .find(|(key, _)| keyboard.just_pressed(*key))
        {
            self.apply(command, construction);
        }
    }

    fn select_facility(&mut self, facility: usize, source: bool) {
        if source {
            self.source = Some(facility);
        } else {
            self.target = facility;
        }
        self.message.clear();
    }

    fn apply(&mut self, command: WaterCommand, construction: &mut Construction) {
        let action = match command {
            WaterCommand::Camp { source } => {
                self.select_facility(0, source);
                return;
            }
            WaterCommand::NextChannel => {
                self.channel = (self.channel + 1) % WATER_CHANNELS.len();
                return;
            }
            WaterCommand::Policy(drinking) => {
                self.message = if construction
                    .utilities
                    .toggle_water_policy(self.target, drinking)
                {
                    "Water policy updated."
                } else {
                    "This facility does not support that water policy."
                }
                .into();
                return;
            }
            WaterCommand::River => WaterAction::Carry {
                source: None,
                channel: 1,
            },
            WaterCommand::Carry => {
                let Some(source) = self.source else {
                    self.message = "Shift-click a water source first.".into();
                    return;
                };
                WaterAction::Carry {
                    source: Some(source),
                    channel: self.channel,
                }
            }
            WaterCommand::Purify => WaterAction::Purify,
            WaterCommand::Sanitation => WaterAction::Sanitation,
        };
        self.message = match construction.queue_water(self.target, action) {
            Ok(()) => "Water job queued.".into(),
            Err(reason) => reason.into(),
        };
    }
}

#[derive(Clone, Copy, Default, PartialEq)]
enum ResidentProfile {
    #[default]
    Overview,
    Story,
    Skills,
    Relationships,
}

impl ResidentProfile {
    const ALL: [Self; 4] = [
        Self::Overview,
        Self::Story,
        Self::Skills,
        Self::Relationships,
    ];

    fn label(self) -> &'static str {
        match self {
            Self::Overview => "Overview",
            Self::Story => "Story",
            Self::Skills => "Skills",
            Self::Relationships => "Relationships",
        }
    }

    fn next(self) -> Self {
        Self::ALL[(self as usize + 1) % Self::ALL.len()]
    }
}

#[derive(Clone, Copy, PartialEq)]
enum UtilityPanel {
    Power,
    Water,
    Residents,
    Finances,
    Trade,
    Pantry,
    Upkeep,
    Events,
    Inventory,
    Projects,
    Crafting,
}

impl Village {
    fn craft_workspace_choices(&self, catalog: &Catalog) -> Vec<usize> {
        if let Some(site) = self.craft_job_site {
            self.construction.craft_job_workspaces(catalog, site)
        } else if let Some(recipe) = &self.craft_recipe {
            self.construction.craft_workspaces(catalog, recipe)
        } else {
            Vec::new()
        }
    }

    fn craft_move_target(&self, catalog: &Catalog) -> Option<usize> {
        let site = self.craft_job_site?;
        let destinations = self.construction.craft_job_workspaces(catalog, site);
        self.craft_workspace
            .filter(|choice| destinations.contains(choice))
            .or_else(|| destinations.first().copied())
    }
    fn producer_view(&self) -> bool {
        self.utility_panel == Some(UtilityPanel::Crafting)
            || (self.utility_panel == Some(UtilityPanel::Inventory)
                && self.inventory_view == InventoryView::Production)
    }

    fn producer_rows<'a>(
        &self,
        catalog: &'a Catalog,
    ) -> (usize, Vec<(crate::construction::Producer<'a>, String)>) {
        if self.utility_panel == Some(UtilityPanel::Crafting) {
            self.construction.crafting_rows(
                catalog,
                &self.stock,
                self.inventory_page,
                self.craft_view,
            )
        } else {
            self.construction.inventory_producers(
                catalog,
                self.inventory_page,
                &self.inventory_search,
                self.stock.sandbox,
            )
        }
    }

    pub fn camp_focus(&self, setup: &WorldSetup) -> Option<Vec3> {
        let camp = self.camp?;
        let Vec2 { x, y: z } = world_position(camp.x as f32, camp.y as f32);
        Some(Vec3::new(x, self.terrain(setup).height_at(x, z), z))
    }

    pub fn terrain_key(&self) -> (u64, u64, usize) {
        (
            self.session_serial,
            self.terrain_editor.revision,
            self.construction.foundations.len(),
        )
    }

    pub(crate) fn wildlife_clear(&self, point: Vec2) -> bool {
        self.construction.wildlife_clear(point)
    }

    pub fn terrain(&self, setup: &WorldSetup) -> Terrain {
        let terrain = setup.terrain();
        match self.camp.filter(|_| !setup.open) {
            Some(cell) => self.terrain_editor.terrain(
                terrain
                    .with_camp(cell)
                    .with_foundations(&self.construction.foundations),
            ),
            None => terrain,
        }
    }

    pub fn session_setup(&self) -> Option<&WorldSetup> {
        self.setup.as_ref()
    }

    pub(crate) fn story_resume_summary(&self) -> String {
        if self.camp.is_none() {
            return "Choose a place for your tents.".into();
        }
        let projects = self.construction.project_count();
        let noun = if projects == 1 { "project" } else { "projects" };
        format!(
            "{projects} {noun} · R${:.2} shared savings",
            self.stock.balance() as f64 / 100.0
        )
    }

    pub fn mode(&self) -> Option<Mode> {
        self.setup.as_ref().map(|setup| setup.mode)
    }

    pub fn seconds(&self) -> f64 {
        self.clock
    }

    pub fn editing_terrain(&self) -> bool {
        self.terrain_editor.open
    }

    pub(crate) fn dismiss_game_view(&mut self) -> bool {
        if self.guide.open() {
            self.guide.toggle();
            return true;
        }
        if self.lenses.open {
            self.lenses.open = false;
            return true;
        }
        if self.numeric_entry.take().is_some() {
            return true;
        }
        if self.terrain_editor.open {
            self.terrain_editor.toggle();
        } else if self.editing_inventory {
            self.editing_inventory = false;
        } else if self.construction.editing_search {
            self.construction.toggle_build_search();
        } else if self.construction.is_placing() {
            self.construction.cancel_placement();
        } else if self.construction.production.selected.is_some() {
            self.construction.clear_selected_project();
        } else if self.utility_panel.take().is_some() {
            self.pantry_batch_page = None;
        } else if self.construction.menu {
            self.construction.toggle_build_menu(self.stock.sandbox);
        } else {
            return false;
        }
        true
    }

    pub fn map_input_blocked(&self) -> bool {
        self.guide.open()
            || self.lenses.open
            || self.construction.editing_search
            || self.editing_inventory
    }

    fn resident_overview_open(&self) -> bool {
        self.utility_panel == Some(UtilityPanel::Residents)
            && self.resident_profile == ResidentProfile::Overview
    }

    fn select_resident(&mut self, index: usize) {
        self.selected_resident = index;
        self.housing_notice.clear();
    }

    fn set_resident_home(&mut self, catalog: &Catalog, assign: bool) {
        self.housing_notice = if assign {
            self.construction
                .assign_selected_home(self.selected_resident, catalog)
                .unwrap_or_else(str::to_owned)
        } else {
            self.construction.clear_home(self.selected_resident)
        };
    }

    fn focus_network_site(
        &mut self,
        setup: &WorldSetup,
        camera: &mut VillageCamera,
        forward: bool,
    ) {
        let Some(view) = self.lenses.network_view() else {
            return;
        };
        if let Some((id, point)) =
            self.construction
                .utilities
                .focus_lens_site(view, self.lenses.network_site, forward)
        {
            let terrain = self.terrain(setup);
            self.lenses.network_site = Some(id);
            camera.target = Vec3::new(point.x, terrain.height_at(point.x, point.y), point.y);
            // Utility ids are plan indices shifted by one; id 0 is the camp.
            if let Some(index) = id.checked_sub(1) {
                self.construction.select_built_project(index);
            } else {
                self.construction.clear_selected_project();
            }
        }
    }

    fn queue_selected_power_connection(&mut self) {
        self.power_notice = match self.construction.queue_power_connection(
            &mut self.stock,
            self.power_source,
            self.power_target,
        ) {
            Ok(()) => "Power connection queued.".into(),
            Err(reason) => reason.into(),
        };
    }

    fn queue_selected_water_connection(&mut self) {
        self.water_panel.message = match self.water_panel.source {
            Some(source) => match self.construction.queue_water_connection(
                &mut self.stock,
                source,
                self.water_panel.target,
                self.water_panel.channel,
            ) {
                Ok(()) => "Water connection queued.".into(),
                Err(error) => error.into(),
            },
            None => "Shift-click a water source first.".into(),
        };
    }

    fn utility_link_count(&self) -> usize {
        match self.utility_panel {
            Some(UtilityPanel::Water) => self.construction.utilities.water_link_count(),
            Some(UtilityPanel::Power) => self.construction.utilities.power_link_count(),
            _ => 0,
        }
    }

    fn move_utility_link(&mut self, forward: bool) {
        let count = self.utility_link_count();
        if count > 0 {
            let selected = if self.utility_panel == Some(UtilityPanel::Water) {
                &mut self.water_link
            } else {
                &mut self.power_link
            };
            let current = (*selected).min(count - 1);
            *selected = (current + if forward { 1 } else { count - 1 }) % count;
        }
    }

    fn selected_installation(&self) -> Option<(usize, usize, Option<usize>)> {
        match self.utility_panel {
            Some(UtilityPanel::Power) => Some((self.power_source, self.power_target, None)),
            Some(UtilityPanel::Water) => Some((
                self.water_panel.source?,
                self.water_panel.target,
                Some(self.water_panel.channel),
            )),
            _ => None,
        }
    }

    fn has_queued_utility_installation(&self) -> bool {
        match self.utility_panel {
            Some(UtilityPanel::Power | UtilityPanel::Water) => self
                .construction
                .queued_utility_connections(self.utility_panel == Some(UtilityPanel::Power))
                .next()
                .is_some(),
            _ => false,
        }
    }

    fn focus_next_utility_installation(&mut self, setup: &WorldSetup, camera: &mut VillageCamera) {
        let power = self.utility_panel == Some(UtilityPanel::Power);
        let current = self
            .selected_installation()
            .and_then(|(from, to, channel)| self.construction.queued_connection(from, to, channel));
        let queue = || self.construction.queued_utility_connections(power);
        let Some(next) = queue()
            .filter(|edge| current.is_none_or(|current| *edge > current))
            .min()
            .or_else(|| queue().min())
        else {
            return;
        };
        let (from, to, channel) = next;
        if let Some(channel) = channel {
            self.water_panel.source = Some(from);
            self.water_panel.select_facility(to, false);
            self.water_panel.channel = channel;
        } else {
            self.power_source = from;
            self.power_target = to;
            self.power_notice.clear();
        }
        if let Some(site) = self.construction.utilities.water_site(from) {
            let center = site.location.as_vec2() + (site.size.as_vec2() - Vec2::ONE) * 0.5;
            let point = world_position(center.x, center.y);
            let terrain = self.terrain(setup);
            camera.target = Vec3::new(point.x, terrain.height_at(point.x, point.y), point.y);
        }
    }

    fn can_cancel_selected_installation(&self) -> bool {
        self.selected_installation()
            .is_some_and(|(from, to, channel)| {
                self.construction
                    .queued_connection(from, to, channel)
                    .is_some()
            })
    }

    fn cancel_selected_installation(&mut self) {
        if let Some((from, to, channel)) = self.selected_installation()
            && self
                .construction
                .cancel_connection_installation(from, to, channel)
        {
            let notice = if channel.is_some() {
                &mut self.water_panel.message
            } else {
                &mut self.power_notice
            };
            *notice = "Connection installation cancelled.".into();
        }
    }

    fn can_remove_selected_utility_link(&self) -> bool {
        match self.utility_panel {
            Some(UtilityPanel::Power) => self
                .construction
                .utilities
                .is_manual_link(self.power_link, true),
            Some(UtilityPanel::Water) => self
                .construction
                .utilities
                .is_manual_link(self.water_link, false),
            _ => false,
        }
    }

    fn remove_selected_utility_link(&mut self) {
        match self.utility_panel {
            Some(UtilityPanel::Power) => self
                .construction
                .utilities
                .remove_manual_link(self.power_link, true),
            Some(UtilityPanel::Water) => self
                .construction
                .utilities
                .remove_manual_link(self.water_link, false),
            _ => {}
        }
    }

    fn toggle_selected_utility_link(&mut self) {
        match self.utility_panel {
            Some(UtilityPanel::Water) => self
                .construction
                .utilities
                .toggle_water_link(self.water_link),
            Some(UtilityPanel::Power) => self
                .construction
                .utilities
                .toggle_power_link(self.power_link),
            _ => {}
        }
    }

    fn focus_next_power_shortage(&mut self, setup: &WorldSetup, camera: &mut VillageCamera) {
        if let Some(point) = self.construction.select_power_shortage() {
            let terrain = self.terrain(setup);
            camera.target = Vec3::new(point.x, terrain.height_at(point.x, point.y), point.y);
        }
    }

    fn focus_next_waste_tank(&mut self, setup: &WorldSetup, camera: &mut VillageCamera) {
        let current = (self.water_panel.target, self.water_panel.channel);
        let mut tanks = self
            .construction
            .utilities
            .waste_tanks_needing_attention()
            .map(|(id, channel, _, _)| (id, channel));
        let Some(first) = tanks.next() else { return };
        let (id, channel) = if first > current {
            first
        } else {
            tanks.find(|&tank| tank > current).unwrap_or(first)
        };
        let Some(site) = self.construction.utilities.water_site(id) else {
            return;
        };
        let center = site.location.as_vec2() + (site.size.as_vec2() - Vec2::ONE) * 0.5;
        let point = world_position(center.x, center.y);
        let terrain = self.terrain(setup);
        camera.target = Vec3::new(point.x, terrain.height_at(point.x, point.y), point.y);
        self.water_panel.select_facility(id, false);
        self.water_panel.channel = channel;
    }

    /// Whether the status card is just a short note: no panel, reference or tool open.
    fn hud_note(&self) -> bool {
        self.camp.is_some()
            && self.utility_panel.is_none()
            && !self.guide.open()
            && !self.lenses.open
            && self.lenses.active.is_none()
            && !self.advance_open()
            && !self.terrain_editor.open
            && !self.trade_open()
            && !self.construction.menu
            && !self.construction.production.open
            && !self.construction.farming.open
            && !self.show_forecast
    }

    fn selected_project_focus(&self) -> Option<Vec2> {
        if self.utility_panel.is_some()
            || self.advance_open()
            || self.construction.menu
            || self.construction.is_placing()
            || self.construction.production.open
            || self.construction.farming.open
        {
            return None;
        }
        self.construction.selected_project_center()
    }

    /// Caption, title and details for the selected building's card, as V2 shows them:
    /// "READY TO USE", "Solar farm #1", then status lines.
    fn selected_building_card(&self, catalog: &Catalog) -> Option<(String, String, String)> {
        self.selected_project_focus()?;
        let production = self
            .construction
            .selected_production(catalog, &self.stock, self.clock)?;
        let mut lines = production.lines();
        let first = lines.next().unwrap_or_default();
        let (title, state) = first.split_once(" · ").unwrap_or((first, ""));
        let mut body: Vec<String> = lines.map(str::to_owned).collect();
        if let Some(index) = self.construction.production.selected
            && let Some(service) = self.construction.utilities.facility_status(index)
        {
            body.push(service);
        }
        if let Some(status) = self.construction.lifecycle_status(catalog, &self.stock) {
            body.push(status);
        }
        let body: Vec<String> = body
            .iter()
            .flat_map(|text| text.lines())
            .map(strip_key_hints)
            .filter(|line| !line.is_empty())
            .collect();
        Some((state.to_uppercase(), title.to_owned(), body.join("\n")))
    }

    /// Model shown beside the selected building's actions, while they are on screen.
    fn selected_building_model(&self, catalog: &Catalog) -> Option<usize> {
        self.selected_project_focus()?;
        let key = self.construction.selected_project_key()?;
        catalog.projects.get(key).map(|project| project.model)
    }

    fn focus_selected_project(&self, setup: &WorldSetup, camera: &mut VillageCamera) -> bool {
        let Some(point) = self.selected_project_focus() else {
            return false;
        };
        let terrain = self.terrain(setup);
        camera.target = Vec3::new(point.x, terrain.height_at(point.x, point.y), point.y);
        true
    }

    fn toggle_project_roads(&mut self) {
        self.project_roads_expanded = !self.project_roads_expanded;
        self.projects_page = 0;
    }

    fn focus_project_row(
        &mut self,
        catalog: &Catalog,
        setup: &WorldSetup,
        camera: &mut VillageCamera,
        row: usize,
    ) {
        if let Some(point) = self.construction.focus_project(
            catalog,
            row,
            self.projects_page,
            self.open_projects_only,
            self.project_roads_expanded,
        ) {
            let terrain = self.terrain(setup);
            camera.target = Vec3::new(point.x, terrain.height_at(point.x, point.y), point.y);
            self.utility_panel = None;
        }
    }

    fn toggle_inventory_view(&mut self) {
        self.inventory_view = self.inventory_view.next();
        self.inventory_search.clear();
        self.inventory_page = 0;
    }

    fn change_panel_page(&mut self, catalog: &Catalog, land: &Land, forward: bool) {
        let (pages, page) = match self.utility_panel {
            Some(UtilityPanel::Pantry) => {
                let Some(page) = &mut self.pantry_batch_page else {
                    return;
                };
                let pages = self.stock.pantry.batches(catalog, page.saturating_sub(1)).0 + 1;
                *page = (*page).min(pages - 1);
                (pages, page)
            }
            Some(UtilityPanel::Finances) if self.finance_history_open => (
                self.stock.finance_history(self.finance_history_page).0,
                &mut self.finance_history_page,
            ),
            Some(UtilityPanel::Projects) => (
                self.construction
                    .projects_panel(
                        catalog,
                        &self.stock,
                        self.projects_page,
                        self.open_projects_only,
                        self.project_roads_expanded,
                        self.clock,
                    )
                    .0,
                &mut self.projects_page,
            ),
            Some(UtilityPanel::Inventory | UtilityPanel::Crafting) if self.producer_view() => {
                (self.producer_rows(catalog).0, &mut self.inventory_page)
            }
            Some(UtilityPanel::Inventory) => (
                self.construction
                    .inventory_panel(
                        catalog,
                        &self.stock,
                        land,
                        self.inventory_page,
                        self.inventory_view,
                        &self.inventory_search,
                    )
                    .0,
                &mut self.inventory_page,
            ),
            Some(UtilityPanel::Events) => (
                self.construction.event_log(self.event_page, "F8 Close").0,
                &mut self.event_page,
            ),
            Some(UtilityPanel::Upkeep) => (self.construction.upkeep_pages(), &mut self.upkeep_page),
            _ => return,
        };
        *page = ((*page).min(pages - 1) + if forward { 1 } else { pages - 1 }) % pages;
    }

    #[cfg(test)]
    pub(crate) fn trade_test_state(&self) -> (u64, usize, bool) {
        (
            self.stock.balance(),
            self.construction.trade.orders.len(),
            self.construction.trade.delivery.is_some(),
        )
    }

    pub fn trade_open(&self) -> bool {
        self.utility_panel == Some(UtilityPanel::Trade)
    }

    pub fn advance_open(&self) -> bool {
        self.advance.open
    }

    pub fn planning_roads(&self) -> bool {
        self.construction.planning_roads()
    }

    fn finish_road_planning(&mut self) {
        self.construction.finish_roads();
        self.connect_road_strokes = false;
    }

    fn extend_road(&self, keys: &ButtonInput<KeyCode>) -> bool {
        self.connect_road_strokes || keys.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight])
    }

    fn utility_owns_advance_key(&self) -> bool {
        self.utility_panel == Some(UtilityPanel::Water)
            || self.construction.production.selected.is_some_and(|index| {
                self.construction.utilities.cooling_switch(index).is_some()
                    && matches!(self.utility_panel, None | Some(UtilityPanel::Power))
                    && !self.construction.is_placing()
                    && !self.construction.menu
            })
    }

    fn advance_keyboard_action(&self, keys: &ButtonInput<KeyCode>) -> Option<AdvanceAction> {
        if !self.advance.open
            && self.utility_owns_advance_key()
            && !keys.any_pressed([KeyCode::AltLeft, KeyCode::AltRight])
        {
            return None;
        }
        self.advance.keyboard_action(keys)
    }

    fn apply_advance_action(&mut self, action: AdvanceAction) {
        let was_open = self.advance.open;
        if self.advance.apply(action) {
            self.checkpoint_advance();
        }
        if !was_open && self.advance.open {
            self.construction.cancel_placement();
            self.construction.menu = false;
            self.construction.production.open = false;
            self.construction.farming.close();
            self.utility_panel = None;
        }
    }

    fn checkpoint_advance(&mut self) {
        self.paused = true;
        self.advance_checkpoint = true;
    }

    fn planning_pause(&self) -> bool {
        self.guide.open()
            || self.utility_panel.is_some()
            || (self.construction.menu && !self.construction.placing_project())
    }

    pub fn is_paused(&self) -> bool {
        self.paused
            || self.planning_pause()
            || self.advance.open
            || self.terrain_editor.open
            || self.planning_roads()
    }

    fn effective_speed(&self) -> u8 {
        if self.camp.is_some() && !self.is_paused() && self.construction.all_residents_unavailable()
        {
            UNAVAILABLE_SPEED
        } else {
            SPEEDS[self.speed].1
        }
    }

    fn speed_label(&self) -> String {
        let speed = self.effective_speed();
        if speed == UNAVAILABLE_SPEED {
            format!("{speed}× Auto")
        } else {
            format!("{speed}×")
        }
    }

    pub fn motion(&self, index: usize, catalog: &Catalog, land: &Land) -> Motion {
        if self.camp.is_some() {
            return self.construction.resident_motion(index, catalog, land);
        }
        if self.arrival_time < ARRIVAL_DURATION && resident_pose(self.arrival_time, index).visible {
            let now = resident_pose(self.arrival_time, index).position;
            if !resident_pose(self.arrival_time + 0.05, index)
                .position
                .abs_diff_eq(now, 0.001)
            {
                return Motion::Walk;
            }
        }
        Motion::Idle
    }

    pub fn tree_felled(&self, index: usize) -> bool {
        self.construction.gathering.felled(index)
    }

    pub fn forage_depleted(&self, index: usize, limit: u32) -> bool {
        self.construction
            .gathering
            .forage_depleted(index, limit, self.clock)
    }

    pub fn valid_save(&self, catalog: &Catalog) -> bool {
        let Some(setup) = &self.setup else {
            return false;
        };
        if self.camera_view.is_some_and(|view| !view.valid()) {
            return false;
        }
        if !setup.valid_save()
            || !(0.0..=ARRIVAL_DURATION).contains(&self.arrival_time)
            || self.stock.sandbox != (setup.mode == Mode::Sandbox)
            || self.speed >= SPEEDS.len()
            || self.clock < 0.0
            || !self.clock.is_finite()
            || !self.stock.valid_food()
            || !self.stock.valid_cash_flow()
            || !self.stock.valid_material_ledger(catalog)
            || !self.stock.valid_processing(catalog)
            || !self.stock.equipment.valid(|id| self.stock.available(id))
            || !self.terrain_editor.valid()
        {
            return false;
        }
        if let Some(camp) = self.camp
            && (self.arrival_time < ARRIVAL_DURATION
                || (custom_camp_error(&setup.terrain(), camp).is_some()
                    && !CAMP_SITES.iter().any(|(_, preset)| *preset == camp)))
        {
            return false;
        }
        self.construction.valid_save(catalog, &self.stock)
            && self.construction.valid_dispatch_time(self.clock)
            && self
                .construction
                .valid_building_history(catalog, self.clock)
            && self
                .construction
                .gathering
                .valid_save(&Land::generate(setup), catalog)
    }
}

fn save_controls(
    keyboard: Res<ButtonInput<KeyCode>>,
    buttons: Query<(&Interaction, &crate::setup::Action), Changed<Interaction>>,
    window: Single<&Window, With<PrimaryWindow>>,
    catalog: Res<Catalog>,
    mut setup: ResMut<WorldSetup>,
    mut village: ResMut<Village>,
    mut saves: ResMut<SaveMenu>,
) {
    if !window.focused || saves.open || saves.preview {
        return;
    }
    let resume = if setup.open && village.setup.is_none() {
        buttons
            .iter()
            .find_map(|(interaction, action)| match (interaction, action) {
                (Interaction::Pressed, crate::setup::Action::Continue(mode)) => Some(*mode),
                _ => None,
            })
    } else {
        None
    };
    if resume.is_some() || keyboard.just_pressed(KeyCode::F9) {
        let restored = if let Some(mode) = resume {
            restore_continuation(&saves, mode, &catalog)
        } else {
            save::location(setup.mode)
                .and_then(|path| save::read(&path, &catalog))
                .map(|village| (village, None))
        };
        match restored {
            Ok((mut loaded, named_slot)) => {
                *setup = loaded.setup.as_ref().expect("validated setup").session();
                loaded.save_notice = "Village loaded.".into();
                loaded.rebuild_scene = true;
                loaded.session_serial = village.session_serial.wrapping_add(1);
                saves.attached = named_slot.map(|id| (setup.mode, id, loaded.session_serial));
                *village = loaded;
            }
            Err(error) if resume.is_some() => {
                village.save_notice = format!(
                    "Could not continue the autosave: {error}\nThe autosave was preserved. Open Saved villages to load a named village."
                );
            }
            Err(error) => village.save_notice = format!("Could not load village: {error}"),
        }
    } else if keyboard.just_pressed(KeyCode::F5) && !setup.open && village.setup.is_some() {
        let shift = keyboard.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]);
        village.save_notice = if shift {
            diagnostics::export_notice(&village, &catalog, &window)
        } else {
            match save::location(setup.mode).and_then(|path| save::write(&path, &village)) {
                Ok(()) => "Village saved.".into(),
                Err(error) => format!("Could not save village: {error}"),
            }
        };
    }
}

pub(crate) fn restore_continuation(
    menu: &SaveMenu,
    mode: Mode,
    catalog: &Catalog,
) -> std::io::Result<(Village, Option<u64>)> {
    let (snapshot, slot) = save::read_continuation(&menu.continue_path(mode)?, catalog)?;
    if snapshot.mode() != Some(mode) {
        return Err(std::io::Error::other("autosave belongs to another mode"));
    }
    if let Some(id) = slot
        && let Ok(village) = menu
            .directory(mode)
            .and_then(|path| save_library::load(&path, id, mode, catalog))
    {
        return Ok((village, Some(id)));
    }
    Ok((snapshot, None))
}

pub(crate) fn save_active_village(
    menu: &SaveMenu,
    village: &Village,
    catalog: &Catalog,
) -> std::io::Result<()> {
    let Some((mode, id, serial)) = menu.attached else {
        return Ok(());
    };
    if village.session_serial == serial && village.mode() == Some(mode) {
        save_library::autosave(&menu.directory(mode)?, id, mode, village, catalog)?;
    }
    Ok(())
}

fn write_continuation(
    menu: &SaveMenu,
    mode: Mode,
    village: &Village,
    catalog: &Catalog,
) -> std::io::Result<()> {
    let slot = menu.attached.and_then(|(attached_mode, id, serial)| {
        (attached_mode == mode && serial == village.session_serial).then_some(id)
    });
    save::write_continuation(&menu.continue_path(mode)?, village, slot, catalog)
}

pub(crate) fn save_session(
    menu: &SaveMenu,
    village: &Village,
    catalog: &Catalog,
) -> std::io::Result<()> {
    if menu.preview {
        return Ok(());
    }
    let Some(mode) = village.mode() else {
        return Ok(());
    };
    match save_active_village(menu, village, catalog) {
        Ok(()) => write_continuation(menu, mode, village, catalog),
        Err(error) => {
            save::write_continuation(&menu.continue_path(mode)?, village, None, catalog)?;
            Err(error)
        }
    }
}

fn save_on_window_close(
    mut requests: MessageReader<WindowCloseRequested>,
    primary: Query<Entity, With<PrimaryWindow>>,
    menu: Res<SaveMenu>,
    catalog: Res<Catalog>,
    mut village: ResMut<Village>,
) {
    if !requests
        .read()
        .any(|request| primary.contains(request.window))
    {
        return;
    }
    if village.advance.running.is_some() {
        village.apply_advance_action(AdvanceAction::Toggle);
    }
    if let Err(error) = save_session(&menu, &village, &catalog) {
        warn!("Could not save village on exit: {error}");
    }
}

fn autosave_continue(
    time: Res<Time<Real>>,
    setup: Res<WorldSetup>,
    saves: Res<SaveMenu>,
    catalog: Res<Catalog>,
    mut village: ResMut<Village>,
    mut next: Local<f64>,
) {
    let now = time.elapsed_secs_f64();
    if setup.open
        || saves.open
        || saves.preview
        || village.camp.is_none()
        || village.advance.running.is_some()
    {
        return;
    }
    if !village.advance_checkpoint && now < next.max(10.0) {
        return;
    }
    village.advance_checkpoint = false;
    *next = now + 10.0;
    let Some(mode) = village.mode() else { return };
    if let Err(error) = write_continuation(&saves, mode, &village, &catalog) {
        village.save_notice = format!("Could not autosave village: {error}");
    }
}

#[derive(Component)]
struct VillageEntity;

#[derive(Component)]
struct VillageHud;

#[derive(Component)]
struct VillageHudText;

#[derive(Component)]
struct ConstructionProgressTrack;

#[derive(Component)]
struct ConstructionProgressFill;

#[derive(Component)]
struct BuiltProject {
    index: usize,
    model: usize,
    rooftop_solar: bool,
}

#[derive(Component)]
enum ArrivalActor {
    Resident(usize),
    Car(usize),
}

pub(crate) fn register_opening_models(app: &mut App) {
    embedded_asset!(app, "opening.glb");
}

pub(crate) fn opening_model(assets: &AssetServer, index: usize) -> SceneRoot {
    let path = AssetPath::from_path_buf(embedded_path!("opening.glb")).with_source("embedded");
    SceneRoot(assets.load(path.with_label(GltfAssetLabel::Scene(index).to_string())))
}

fn spawn_hud(mut commands: Commands, assets: Res<AssetServer>) {
    commands
        .spawn((
            VillageHud,
            UiTransform::default(),
            Interaction::None,
            bevy::ui::FocusPolicy::Block,
            crate::theme::panel_node(Node {
                display: Display::None,
                position_type: PositionType::Absolute,
                top: px(18),
                left: px(22),
                padding: UiRect::all(px(18)),
                flex_direction: FlexDirection::Column,
                row_gap: px(6),
                overflow: Overflow::scroll_y(),
                ..default()
            }),
            crate::theme::panel(),
        ))
        .with_children(|hud| {
            almanac::spawn(hud, &assets);
            resident_meters::spawn(hud, &assets);
            hud.spawn((
                VillageHudText,
                Text::default(),
                ui_font(&assets, 15.0),
                Node {
                    flex_shrink: 0.,
                    ..default()
                },
            ));
        });
}

#[derive(Default, PartialEq)]
struct HudScrollContext {
    panel: Option<UtilityPanel>,
    resident_view: Option<(ResidentProfile, usize)>,
}

type HudFrame<'w, 's> = Single<
    'w,
    's,
    (
        &'static mut Node,
        &'static mut ScrollPosition,
        &'static Interaction,
        &'static mut UiTransform,
    ),
    With<VillageHud>,
>;

fn fit_and_scroll_hud(
    window: Single<&Window, With<PrimaryWindow>>,
    toolbar: Single<&ComputedNode, With<toolbar::Toolbar>>,
    mut hud: HudFrame,
    (village, setup): (Res<Village>, Res<WorldSetup>),
    mut previous_panel: Local<HudScrollContext>,
    scroll: Res<bevy::input::mouse::AccumulatedMouseScroll>,
) {
    let (node, position, interaction, transform) = &mut *hud;
    let toolbar_height = toolbar.size().y * toolbar.inverse_scale_factor();
    // While nothing is open, status reads as V2's short note centred above the dock
    // instead of a block over the village.
    let note = !setup.open && village.hud_note();
    let shift = if note {
        Val2::new(percent(-50), px(0))
    } else {
        Val2::ZERO
    };
    if transform.translation != shift {
        transform.translation = shift;
    }
    if note {
        let bottom = px(18. + toolbar_height + 14.);
        if node.bottom != bottom || node.top != Val::Auto || node.left != percent(50) {
            node.top = Val::Auto;
            node.bottom = bottom;
            node.left = percent(50);
            node.right = Val::Auto;
            node.max_width = px(640);
        }
    }
    // Sheets start below the top bar and stop above the dock.
    let available_height =
        (window.height() - TOP_BAR_CLEARANCE - 18. - toolbar_height - 14.).max(0.);
    let max_height = px(available_height);
    if node.max_height != max_height {
        node.max_height = max_height;
    }
    let resident_view = (village.utility_panel == Some(UtilityPanel::Residents))
        .then_some((village.resident_profile, village.selected_resident));
    let panel = HudScrollContext {
        panel: village.utility_panel,
        resident_view,
    };
    if *previous_panel != panel || node.display == Display::None {
        position.y = 0.;
        *previous_panel = panel;
    }
    if **interaction != Interaction::None && scroll.delta.y != 0. {
        let step = match scroll.unit {
            bevy::input::mouse::MouseScrollUnit::Line => 34.,
            bevy::input::mouse::MouseScrollUnit::Pixel => 1.,
        };
        position.y = (position.y - scroll.delta.y * step).max(0.);
    }
}

#[derive(Resource, Default)]
struct CampPointer {
    preset: Option<IVec2>,
    clicked: Option<GroundHit>,
    hovered: Option<GroundHit>,
    resident: Option<usize>,
    /// Building whose model was clicked, which beats the ground cell under the cursor.
    project: Option<usize>,
    terrain_stroke: Vec<Vec3>,
    terrain_stroke_finished: bool,
}

#[derive(Resource, Default, PartialEq)]
struct MapNotice(Option<String>, Option<bool>);

#[derive(Clone, Copy)]
struct GroundHit {
    cell: IVec2,
    world: Vec3,
}

fn read_camp_pointer(
    (setup, village): (Res<WorldSetup>, Res<Village>),
    (mouse, window): (
        Res<ButtonInput<MouseButton>>,
        Single<&Window, With<PrimaryWindow>>,
    ),
    camera: Single<(&Camera, &GlobalTransform), With<VillageCamera>>,
    (ground, actors): (Query<(), With<GroundMesh>>, Query<ResidentPick>),
    (buildings, ui): (BuildingPick, Query<&Interaction>),
    mut raycast: MeshRayCast,
    (mut input, mut pointer): (Local<Option<Vec2>>, ResMut<CampPointer>),
) {
    pointer.preset = None;
    pointer.clicked = None;
    pointer.hovered = None;
    pointer.resident = None;
    pointer.project = None;
    if pointer.terrain_stroke_finished {
        pointer.terrain_stroke.clear();
        pointer.terrain_stroke_finished = false;
    }
    let painting = village.terrain_editor.open;
    if !window.focused
        || setup.open
        || village.map_input_blocked()
        || village.arrival_time < ARRIVAL_DURATION
        || crate::pointer_over_ui(&ui)
    {
        *input = None;
        pointer.terrain_stroke.clear();
        return;
    }
    if !painting || mouse.just_pressed(MouseButton::Left) {
        pointer.terrain_stroke.clear();
    }
    if mouse.just_pressed(MouseButton::Left) {
        *input = window.cursor_position();
    }
    let Some(cursor) = window.cursor_position() else {
        *input = None;
        return;
    };
    if input.is_some_and(|start| start.distance(cursor) > 5.0) {
        *input = None;
    }
    let clicked = mouse.just_released(MouseButton::Left) && input.take().is_some();
    if !clicked
        && village.camp.is_some()
        && !village.terrain_editor.open
        && !village.planning_roads()
        && !village.construction.placing_project()
        && village.lenses.active.is_none()
    {
        return;
    }
    let (camera, transform) = *camera;
    if clicked
        && village.camp.is_some()
        && !painting
        && !village.planning_roads()
        && !village.construction.placing_project()
    {
        pointer.resident = resident_under_cursor(camera, transform, cursor, &actors);
        if pointer.resident.is_some() {
            return;
        }
    }
    let Ok(ray) = camera.viewport_to_world(transform, cursor) else {
        return;
    };
    if clicked
        && village.camp.is_some()
        && !painting
        && !village.planning_roads()
        && !village.construction.placing_project()
        && village.lenses.active.is_none()
    {
        pointer.project = building_under_cursor(ray, &mut raycast, &buildings);
    }
    let filter = |entity| ground.contains(entity);
    let settings = MeshRayCastSettings::default().with_filter(&filter);
    if let Some((_, hit)) = raycast.cast_ray(ray, &settings).first() {
        let cell = hit.point.xz() * 0.5 + Vec2::splat(32.5);
        let hit = GroundHit {
            cell: cell.floor().as_ivec2(),
            world: hit.point,
        };
        pointer.hovered = Some(hit);
        if clicked {
            pointer.clicked = Some(hit);
        }
        if painting && mouse.just_pressed(MouseButton::Left) {
            pointer.terrain_stroke.push(hit.world);
        } else if painting
            && !pointer.terrain_stroke.is_empty()
            && (mouse.pressed(MouseButton::Left) || mouse.just_released(MouseButton::Left))
        {
            let last = *pointer
                .terrain_stroke
                .last()
                .expect("active terrain stroke");
            let distance = last.xz().distance(hit.world.xz());
            if distance >= 2.0 {
                let steps = (distance / 2.0).floor() as usize;
                for step in 1..=steps.min(256 - pointer.terrain_stroke.len()) {
                    pointer
                        .terrain_stroke
                        .push(last.lerp(hit.world, step as f32 * 2.0 / distance));
                }
            }
        }
    }
    if painting && mouse.just_released(MouseButton::Left) {
        pointer.terrain_stroke_finished = true;
    }
}

type ResidentPick = (
    &'static ArrivalActor,
    &'static GlobalTransform,
    &'static InheritedVisibility,
);

type BuildingPick<'w, 's> = (
    Query<'w, 's, &'static ChildOf>,
    Query<'w, 's, &'static BuiltProject>,
    Query<'w, 's, &'static construction_models::ConstructionModel>,
);

/// The project owning the first model surface under the cursor, if any.
fn building_under_cursor(
    ray: Ray3d,
    raycast: &mut MeshRayCast,
    (parents, built, staged): &BuildingPick,
) -> Option<usize> {
    building_hit(
        ray,
        raycast,
        (parents, built, staged),
        RayCastVisibility::VisibleInView,
    )
}

fn building_hit(
    ray: Ray3d,
    raycast: &mut MeshRayCast,
    (parents, built, staged): (
        &Query<&ChildOf>,
        &Query<&BuiltProject>,
        &Query<&construction_models::ConstructionModel>,
    ),
    visibility: RayCastVisibility,
) -> Option<usize> {
    let settings = MeshRayCastSettings::default().with_visibility(visibility);
    let (mut entity, _) = *raycast.cast_ray(ray, &settings).first()?;
    for _ in 0..32 {
        if let Ok(building) = built.get(entity) {
            return Some(building.index);
        }
        if let Ok(model) = staged.get(entity) {
            return Some(model.project);
        }
        entity = parents.get(entity).ok()?.parent();
    }
    None
}

/// Screen-space pick radius around a resident's torso, in logical pixels.
const RESIDENT_PICK_RADIUS: f32 = 26.0;

/// Picks the visible resident whose torso is nearest the cursor on screen.
fn resident_under_cursor(
    camera: &Camera,
    transform: &GlobalTransform,
    cursor: Vec2,
    actors: &Query<ResidentPick>,
) -> Option<usize> {
    nearest_resident(
        cursor,
        actors
            .iter()
            .filter(|(_, _, visible)| visible.get())
            .filter_map(|(actor, place, _)| {
                let ArrivalActor::Resident(index) = *actor else {
                    return None;
                };
                let torso = place.translation() + Vec3::Y * 0.8;
                Some((index, camera.world_to_viewport(transform, torso).ok()?))
            }),
    )
}

fn nearest_resident(cursor: Vec2, residents: impl Iterator<Item = (usize, Vec2)>) -> Option<usize> {
    residents
        .map(|(index, screen)| (index, screen.distance(cursor)))
        .filter(|(_, distance)| *distance <= RESIDENT_PICK_RADIUS)
        .min_by(|a, b| a.1.total_cmp(&b.1))
        .map(|(index, _)| index)
}

/// Drops keyboard hints such as "J Switch" or "Shift+M Move" from a " · " separated
/// line, for cards whose buttons already offer those actions.
fn strip_key_hints(line: &str) -> String {
    let is_key = |word: &str| {
        word.contains('+')
            || (word.len() <= 3
                && word
                    .chars()
                    .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
                && word.chars().any(|c| c.is_ascii_uppercase()))
    };
    line.split(" · ")
        .filter_map(|segment| {
            let mut words = segment.splitn(2, ' ');
            match (words.next(), words.next()) {
                (Some(key), Some(rest))
                    if is_key(key) && rest.chars().next().is_some_and(char::is_uppercase) =>
                {
                    // "J Wait up to 3.5h" keeps its value; "J Switch" is only a shortcut.
                    rest.chars().any(|c| c.is_ascii_digit()).then_some(rest)
                }
                _ => Some(segment),
            }
        })
        .collect::<Vec<_>>()
        .join(" · ")
}

/// Top of right-hand panels, below the clock card and its Guide and Lenses buttons.
const RIGHT_PANEL_TOP: f32 = 176.0;

/// Space the top bar's stat cards take, so panels open beneath them.
const TOP_BAR_CLEARANCE: f32 = 112.0;

const CAMP_OFFSET: IVec2 = IVec2::new(-1, -3);
const CAMP_ACCESS_ERROR: &str = "Choose somewhere reachable from the supplies.";
const CAMP_SIZE: IVec2 = IVec2::new(5, 4);

fn camp_placement_error(
    terrain: &Terrain,
    land: &Land,
    cell: IVec2,
    preset: bool,
) -> Option<&'static str> {
    let start = cell + CAMP_OFFSET;
    let end = start + CAMP_SIZE;
    if (start.x..end.x).any(|x| (start.y..end.y).any(|z| land.occupied(IVec2::new(x, z)))) {
        return Some("Leave the trees and natural resources clear.");
    }
    if preset {
        None
    } else {
        custom_camp_error(terrain, cell)
    }
}

fn custom_camp_error(terrain: &crate::terrain::Terrain, cell: IVec2) -> Option<&'static str> {
    if !(-28..=90).contains(&cell.x) || !(-26..=91).contains(&cell.y) {
        return Some("Keep the tents inside the plot.");
    }
    let start = cell + CAMP_OFFSET;
    let end = start + CAMP_SIZE;
    for column in start.x..end.x {
        for row in start.y..end.y {
            let Vec2 { x, y: z } = world_position(column as f32, row as f32);
            let (center, width) = terrain.river(f64::from(z));
            if (f64::from(x) - center).abs() <= width + 3.9 {
                return Some("Keep the tents back from the river.");
            }
            if (MAP_START..=ROAD_END).contains(&z)
                && (x - road_center(z)).abs() < road_width(z) + 1.0
            {
                return Some("Leave the access road clear.");
            }
            if column == 32 && row == -13 {
                return Some("Leave the unloaded supplies clear.");
            }
        }
    }
    None
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum NumericTarget {
    Food,
    ExpansionReserve,
    MaintenanceParts,
    MaintenanceShopping,
    MinimumLoad,
    DispatchWait,
    Sale(SaleSetting),
    Bed,
    FieldDimensions,
    WorkPriority(WorkGroup),
    WorkerReservation(bool),
}

fn apply_numeric_entry(
    target: NumericTarget,
    entry: &str,
    construction: &mut Construction,
    catalog: &Catalog,
) {
    match target {
        NumericTarget::Bed => {
            if let Ok(number) = entry.parse::<usize>() {
                construction.select_bed_number(number);
            }
        }
        NumericTarget::WorkPriority(group) => {
            if let Ok(level) = entry.parse() {
                construction.set_work_priority(group, level);
            }
        }
        NumericTarget::WorkerReservation(essential) => {
            if let Ok(count) = entry.parse() {
                construction.set_worker_reservation(essential, count);
            }
        }
        NumericTarget::MinimumLoad => {
            if let Ok(percent) = entry.parse::<u32>() {
                construction.set_minimum_dispatch_fill(percent.min(100) as u8);
            }
        }
        NumericTarget::DispatchWait => {
            if let Ok(hours) = entry.parse::<f64>() {
                construction.set_dispatch_wait((hours.clamp(0., 24.) * 2.).round() as u8);
            }
        }
        NumericTarget::Sale(setting) => {
            if let Ok(quantity) = entry.parse::<f64>() {
                construction.set_sale_quantity(catalog, setting, quantity);
            }
        }
        _ => {
            let Ok(reais) = entry.parse::<u64>() else {
                return;
            };
            let cents = reais.min(100_000) * 100;
            match target {
                NumericTarget::ExpansionReserve => construction.set_expansion_reserve(cents),
                NumericTarget::Food => {
                    let trade = &mut construction.trade;
                    let _ =
                        trade.set_pantry_policy(!trade.household_restock_off, None, Some(cents));
                }
                NumericTarget::MaintenanceParts | NumericTarget::MaintenanceShopping => {
                    construction
                        .set_upkeep_budget(target == NumericTarget::MaintenanceShopping, cents);
                }
                NumericTarget::MinimumLoad
                | NumericTarget::DispatchWait
                | NumericTarget::Sale(_)
                | NumericTarget::Bed
                | NumericTarget::FieldDimensions
                | NumericTarget::WorkPriority(_)
                | NumericTarget::WorkerReservation(_) => unreachable!(),
            }
        }
    }
}

fn village_input(
    mut commands: Commands,
    (setup, mut build_text): (
        Res<WorldSetup>,
        MessageReader<bevy::input::keyboard::KeyboardInput>,
    ),
    (keyboard, pointer, saves, mut sound): (
        Res<ButtonInput<KeyCode>>,
        Res<CampPointer>,
        Res<SaveMenu>,
        ResMut<SoundSettings>,
    ),
    mut village: ResMut<Village>,
    mut camera: Single<(&mut VillageCamera, &mut Projection)>,
    entities: Query<Entity, With<VillageEntity>>,
    (assets, catalog, land): (Res<AssetServer>, Res<Catalog>, Res<Land>),
) {
    if (sound.open || keyboard.just_pressed(KeyCode::F1)) && sound.controls(&keyboard) {
        return;
    }
    if saves.open {
        return;
    }
    if setup.open {
        if setup.is_changed() {
            for entity in &entities {
                commands.entity(entity).insert(Visibility::Hidden);
            }
        }
        return;
    }
    let (camera, projection) = &mut *camera;
    let new_world = village.setup.as_ref() != Some(&setup.session());
    if new_world || village.rebuild_scene {
        for entity in &entities {
            commands.entity(entity).despawn();
        }
        if new_world {
            let sandbox = setup.mode == Mode::Sandbox;
            let camp = (sandbox
                && camp_placement_error(&setup.terrain(), &land, CLEARING_CAMP, true).is_none())
            .then_some(CLEARING_CAMP);
            *village = Village {
                session_serial: village.session_serial.wrapping_add(1),
                setup: Some(setup.session()),
                stock: Stock::for_start(&setup, &catalog),
                arrival_time: if sandbox { ARRIVAL_DURATION } else { 0.0 },
                camp,
                ..default()
            };
            if camp.is_some() {
                village
                    .construction
                    .record_event(0.0, "Camp is ready.".into());
            }
        }
        village.rebuild_scene = false;
        camera.target = Vec3::new(0.0, 2.0, -86.0);
        if let Some(cell) = village.camp {
            camera.target = spawn_tents(&mut commands, &assets, &setup, cell);
        }
        camera.heading = 0.0;
        camera.polar = crate::default_camera_polar();
        if let Projection::Orthographic(ortho) = &mut **projection {
            ortho.scale = village.camera_view.map_or(1.0, |view| view.zoom);
        }
        if let Some(view) = village.camera_view {
            camera.target = view.target;
            camera.heading = view.heading;
            camera.polar = view.polar;
        }
        for (index, name) in NAMES.into_iter().enumerate() {
            commands.spawn((
                VillageEntity,
                ArrivalActor::Resident(index),
                ResidentAnimation(index),
                Name::new(name),
                opening_model(&assets, index),
                Visibility::Hidden,
            ));
        }
        for index in 0..2 {
            commands.spawn((
                VillageEntity,
                ArrivalActor::Car(index),
                opening_model(&assets, NAMES.len() + index * 2 + 1),
            ));
        }
    }

    if village.numeric_entry.as_ref().is_some_and(|(target, _)| {
        if *target == NumericTarget::FieldDimensions {
            return village.utility_panel.is_some()
                || !village.construction.can_resize_selected_field();
        }
        if *target == NumericTarget::Bed {
            return village.utility_panel.is_some()
                || !village.construction.farming.open
                || !village.construction.has_selected_plot();
        }
        village.utility_panel
            != Some(match target {
                NumericTarget::Bed | NumericTarget::FieldDimensions => unreachable!(),
                NumericTarget::WorkPriority(_) | NumericTarget::WorkerReservation(_) => {
                    UtilityPanel::Residents
                }
                NumericTarget::Food => UtilityPanel::Pantry,
                NumericTarget::ExpansionReserve => UtilityPanel::Finances,
                NumericTarget::MinimumLoad
                | NumericTarget::DispatchWait
                | NumericTarget::Sale(_) => UtilityPanel::Trade,
                NumericTarget::MaintenanceParts | NumericTarget::MaintenanceShopping => {
                    UtilityPanel::Upkeep
                }
            })
    }) {
        village.numeric_entry = None;
    }
    if let Some((target, entry)) = &mut village.numeric_entry {
        if keyboard.any_just_pressed([KeyCode::Enter, KeyCode::NumpadEnter]) {
            let (target, entry) = village.numeric_entry.take().expect("active numeric entry");
            if target == NumericTarget::FieldDimensions {
                if let Some(camp) = village.camp {
                    let terrain = village.terrain(&setup);
                    let sandbox = village.stock.sandbox;
                    village.construction.set_field_dimensions(
                        &catalog,
                        ConstructionSite {
                            terrain: &terrain,
                            land: &land,
                            camp,
                        },
                        &entry,
                        sandbox,
                    );
                }
            } else {
                apply_numeric_entry(target, &entry, &mut village.construction, &catalog);
            }
        } else {
            crate::construction::read_search_text(entry, &mut build_text);
            let decimal = matches!(target, NumericTarget::DispatchWait | NumericTarget::Sale(_));
            let dimensions = *target == NumericTarget::FieldDimensions;
            entry.retain(|character| {
                character.is_ascii_digit()
                    || decimal && character == '.'
                    || dimensions && character == ' '
            });
            entry.truncate(if matches!(target, NumericTarget::Sale(_)) {
                14
            } else if dimensions {
                12
            } else {
                6
            });
        }
        build_text.clear();
        return;
    }

    if village.guide.open() {
        village.guide.controls(&keyboard, &mut build_text);
        build_text.clear();
        return;
    }

    if village.utility_panel == Some(UtilityPanel::Inventory)
        && (village.editing_inventory || keyboard.just_pressed(KeyCode::Slash))
    {
        if keyboard.just_pressed(KeyCode::Slash) && !village.editing_inventory {
            village.editing_inventory = true;
            build_text.clear();
        } else if keyboard.any_just_pressed([KeyCode::Enter, KeyCode::NumpadEnter]) {
            village.editing_inventory = false;
            build_text.clear();
        } else {
            crate::construction::read_search_text(&mut village.inventory_search, &mut build_text);
            village.inventory_page = 0;
        }
        return;
    }

    if (village.construction.editing_search || keyboard.just_pressed(KeyCode::Slash))
        && village
            .construction
            .build_search_input(&keyboard, &mut build_text)
    {
        return;
    }
    build_text.clear();

    if village.guide.controls(&keyboard, &mut build_text) {
        return;
    }

    if village.camp.is_some() && village.lenses.controls(&keyboard, catalog.materials.len()) {
        return;
    }

    if village.lenses.network_view().is_some()
        && keyboard.any_pressed([KeyCode::ControlLeft, KeyCode::ControlRight])
        && keyboard.any_just_pressed([KeyCode::PageUp, KeyCode::PageDown])
    {
        village.focus_network_site(&setup, camera, keyboard.just_pressed(KeyCode::PageDown));
        return;
    }

    if village.camp.is_some()
        && keyboard.just_pressed(KeyCode::KeyG)
        && keyboard.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight])
    {
        village.show_grid = !village.show_grid;
        return;
    }

    if village.planning_roads()
        && let Some(camp) = village.camp
    {
        let terrain = village.terrain(&setup);
        let town = &mut *village;
        if keyboard.any_just_pressed([KeyCode::KeyB, KeyCode::Escape]) {
            town.finish_road_planning();
        } else if keyboard.just_pressed(KeyCode::KeyZ) {
            town.construction.undo_roads(&mut town.stock);
        } else if let Some(hit) = pointer.clicked {
            let extend = town.extend_road(&keyboard);
            town.construction.plan_roads(
                &catalog,
                &mut town.stock,
                ConstructionSite {
                    terrain: &terrain,
                    land: &land,
                    camp,
                },
                hit.cell,
                TownClock {
                    seconds: town.clock,
                    round_trip_km: setup.round_trip_km(),
                },
                extend,
            );
        }
        return;
    }
    if keyboard.just_pressed(KeyCode::KeyF) {
        let forecast = keyboard.any_pressed([KeyCode::AltLeft, KeyCode::AltRight]);
        if forecast || !village.focus_selected_project(&setup, camera) {
            village.show_forecast = !village.show_forecast;
        }
    }
    if village.camp.is_some()
        && !village.terrain_editor.open
        && let Some(action) = village.advance_keyboard_action(&keyboard)
    {
        village.apply_advance_action(action);
        return;
    }
    if village.advance.open {
        return;
    }
    if keyboard.just_pressed(KeyCode::Space)
        && village.camp.is_some()
        && !village.terrain_editor.open
    {
        village.paused = !village.paused;
    }
    let terrain = village.terrain(&setup);
    if let Some(cell) = village.camp {
        let town = &mut *village;
        let main_view = town.utility_panel.is_none()
            && !town.construction.menu
            && !town.construction.production.open
            && !town.construction.farming.open;
        let terrain_shortcut = keyboard.just_pressed(KeyCode::KeyT)
            && !keyboard.just_pressed(KeyCode::F4)
            && (town.terrain_editor.open
                || (main_view && town.construction.production.selected.is_none()));
        if terrain_shortcut {
            town.terrain_editor.toggle();
            return;
        }
        town.terrain_editor.controls(&keyboard);
        if town.terrain_editor.open {
            if pointer.terrain_stroke_finished && !pointer.terrain_stroke.is_empty() {
                town.terrain_editor
                    .stroke_path(&terrain, &pointer.terrain_stroke, |cell| {
                        town.construction.protects_terrain(cell)
                    });
            }
            return;
        }
        let finances_shortcut = keyboard.just_pressed(KeyCode::KeyM)
            && (main_view || town.utility_panel == Some(UtilityPanel::Finances));
        if (keyboard.just_pressed(KeyCode::KeyH) || finances_shortcut) && !town.stock.sandbox {
            town.utility_panel = if matches!(
                town.utility_panel,
                Some(UtilityPanel::Finances | UtilityPanel::Trade | UtilityPanel::Pantry)
            ) {
                None
            } else {
                Some(UtilityPanel::Finances)
            };
        }
        if keyboard.just_pressed(KeyCode::Tab) {
            town.utility_panel = match town.utility_panel {
                Some(UtilityPanel::Finances) => Some(UtilityPanel::Trade),
                Some(UtilityPanel::Trade) => Some(UtilityPanel::Pantry),
                Some(UtilityPanel::Pantry) if !town.stock.sandbox => Some(UtilityPanel::Finances),
                other => other,
            };
        }
        if matches!(
            town.utility_panel,
            Some(UtilityPanel::Finances | UtilityPanel::Trade | UtilityPanel::Pantry)
        ) && [KeyCode::KeyB, KeyCode::KeyC, KeyCode::KeyK]
            .iter()
            .any(|key| keyboard.just_pressed(*key))
        {
            town.utility_panel = None;
        }
        if town.utility_panel == Some(UtilityPanel::Finances) {
            if !town.finance_history_open
                && keyboard.any_just_pressed([KeyCode::BracketLeft, KeyCode::BracketRight])
            {
                town.construction.adjust_expansion_reserve(
                    keyboard.just_pressed(KeyCode::BracketRight),
                    keyboard.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]),
                );
                return;
            }
            if keyboard.just_pressed(KeyCode::KeyR) {
                town.finance_history_open = !town.finance_history_open;
                town.finance_history_page = 0;
            }
            if town.finance_history_open
                && keyboard.any_just_pressed([KeyCode::PageUp, KeyCode::PageDown])
            {
                town.change_panel_page(&catalog, &land, keyboard.just_pressed(KeyCode::PageDown));
            }
            if let Some(index) = [
                KeyCode::Digit1,
                KeyCode::Digit2,
                KeyCode::Digit3,
                KeyCode::Digit4,
                KeyCode::Digit5,
            ]
            .iter()
            .position(|key| keyboard.just_pressed(*key))
            {
                town.selected_resident = index;
            }
            if !town.stock.sandbox && keyboard.just_pressed(KeyCode::KeyT) {
                town.construction.toggle_shift(town.selected_resident);
            }
            if !town.stock.sandbox && keyboard.just_pressed(KeyCode::KeyY) {
                town.construction
                    .toggle_weekday_shift(town.selected_resident);
            }
        }
        if town.utility_panel == Some(UtilityPanel::Pantry) {
            if keyboard.just_pressed(KeyCode::KeyR) {
                town.pantry_batch_page = town.pantry_batch_page.is_none().then_some(0);
                return;
            }
            if town.pantry_batch_page.is_some() {
                if keyboard.any_just_pressed([KeyCode::PageUp, KeyCode::PageDown]) {
                    town.change_panel_page(
                        &catalog,
                        &land,
                        keyboard.just_pressed(KeyCode::PageDown),
                    );
                }
                return;
            }
            if !town.stock.sandbox {
                town.construction.kitchen_controls(&keyboard);
            }
            if keyboard.just_pressed(KeyCode::KeyD) {
                town.construction.toggle_supplier_construction();
                return;
            }
            if keyboard.just_pressed(KeyCode::KeyT) {
                town.stock.pantry.priority = town.stock.pantry.priority.next();
            }
            let bracket = i8::from(keyboard.just_pressed(KeyCode::BracketRight))
                - i8::from(keyboard.just_pressed(KeyCode::BracketLeft));
            let toggle = keyboard.just_pressed(KeyCode::KeyU);
            let (reserve, budget) =
                if keyboard.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]) {
                    (0, i64::from(bracket) * 2_500)
                } else {
                    (bracket, 0)
                };
            town.construction
                .trade
                .pantry_controls(reserve, budget, toggle);
            if toggle {
                return;
            }
        }
        if town.utility_panel == Some(UtilityPanel::Trade) {
            town.construction.trade_input(
                &catalog,
                &mut town.stock,
                &keyboard,
                TownClock {
                    seconds: town.clock,
                    round_trip_km: setup.round_trip_km(),
                },
            );
            if keyboard.any_just_pressed([KeyCode::KeyG, KeyCode::KeyJ, KeyCode::KeyU]) {
                return;
            }
        }
        if keyboard.just_pressed(KeyCode::KeyP) {
            town.utility_panel = if town.utility_panel == Some(UtilityPanel::Power) {
                None
            } else {
                Some(UtilityPanel::Power)
            };
        }
        if keyboard.just_pressed(KeyCode::KeyN) {
            town.utility_panel = if town.utility_panel == Some(UtilityPanel::Residents) {
                None
            } else {
                Some(UtilityPanel::Residents)
            };
        }
        let projects_shortcut = keyboard.just_pressed(KeyCode::KeyJ)
            && ((main_view && town.construction.production.selected.is_none())
                || town.utility_panel == Some(UtilityPanel::Projects));
        if keyboard.just_pressed(KeyCode::F11) || projects_shortcut {
            town.utility_panel = if town.utility_panel == Some(UtilityPanel::Projects) {
                None
            } else {
                Some(UtilityPanel::Projects)
            };
            town.projects_page = 0;
            if town.utility_panel.is_none() {
                return;
            }
        }
        if town.utility_panel == Some(UtilityPanel::Projects) {
            if keyboard.just_pressed(KeyCode::KeyR) {
                town.project_events_expanded = !town.project_events_expanded;
            }
            if keyboard.just_pressed(KeyCode::KeyG)
                && town.construction.road_project_counts(&catalog).0 > 0
            {
                town.toggle_project_roads();
            }
            if keyboard.just_pressed(KeyCode::Tab) {
                town.open_projects_only = !town.open_projects_only;
                town.projects_page = 0;
            }
            if keyboard.any_just_pressed([KeyCode::PageUp, KeyCode::PageDown]) {
                town.change_panel_page(&catalog, &land, keyboard.just_pressed(KeyCode::PageDown));
            }
            if let Some(row) = crate::construction::PAGE_KEYS
                .iter()
                .position(|key| keyboard.just_pressed(*key))
            {
                town.focus_project_row(&catalog, &setup, camera, row);
            }
            return;
        }
        let stores_shortcut = keyboard.just_pressed(KeyCode::KeyI)
            && !town.stock.sandbox
            && (main_view || town.utility_panel == Some(UtilityPanel::Inventory));
        if keyboard.just_pressed(KeyCode::F10) || stores_shortcut {
            town.utility_panel = if town.utility_panel == Some(UtilityPanel::Inventory) {
                None
            } else {
                Some(UtilityPanel::Inventory)
            };
            town.inventory_page = 0;
        }
        if matches!(
            town.utility_panel,
            Some(UtilityPanel::Inventory | UtilityPanel::Crafting)
        ) {
            if town.utility_panel == Some(UtilityPanel::Inventory)
                && keyboard.just_pressed(KeyCode::Tab)
            {
                town.toggle_inventory_view();
            }
            if keyboard.any_just_pressed([KeyCode::PageUp, KeyCode::PageDown]) {
                town.change_panel_page(&catalog, &land, keyboard.just_pressed(KeyCode::PageDown));
            }
            return;
        }
        if keyboard.just_pressed(KeyCode::F8) {
            town.utility_panel = if town.utility_panel == Some(UtilityPanel::Events) {
                None
            } else {
                Some(UtilityPanel::Events)
            };
            town.event_page = 0;
        }
        if town.utility_panel == Some(UtilityPanel::Events) {
            if keyboard.any_just_pressed([KeyCode::PageUp, KeyCode::PageDown]) {
                town.change_panel_page(&catalog, &land, keyboard.just_pressed(KeyCode::PageDown));
            }
            return;
        }
        if keyboard.just_pressed(KeyCode::F7) && !town.stock.sandbox {
            town.utility_panel = if town.utility_panel == Some(UtilityPanel::Upkeep) {
                None
            } else {
                town.upkeep_page = 0;
                Some(UtilityPanel::Upkeep)
            };
        }
        if town.utility_panel == Some(UtilityPanel::Upkeep) {
            if keyboard.any_just_pressed([KeyCode::PageUp, KeyCode::PageDown]) {
                town.change_panel_page(&catalog, &land, keyboard.just_pressed(KeyCode::PageDown));
            }
            if let Some(hit) = pointer.clicked {
                town.construction.select_facility(hit.cell);
            }
            town.construction.upkeep_input(&keyboard);
            return;
        }
        let water_shortcut = main_view
            && keyboard.just_pressed(KeyCode::KeyU)
            && !keyboard.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]);
        if keyboard.just_pressed(KeyCode::KeyV) || water_shortcut {
            town.utility_panel = if town.utility_panel == Some(UtilityPanel::Water) {
                None
            } else {
                Some(UtilityPanel::Water)
            };
            if water_shortcut {
                return;
            }
        }
        if town.utility_panel == Some(UtilityPanel::Water) {
            if keyboard.just_pressed(KeyCode::PageUp) {
                town.focus_next_utility_installation(&setup, camera);
                return;
            }
            if keyboard.just_pressed(KeyCode::KeyU) {
                town.queue_selected_water_connection();
                return;
            }
            if keyboard.any_just_pressed([KeyCode::BracketLeft, KeyCode::BracketRight]) {
                town.move_utility_link(keyboard.just_pressed(KeyCode::BracketRight));
            }
            if keyboard.just_pressed(KeyCode::KeyG) {
                town.toggle_selected_utility_link();
            }
            if keyboard.just_pressed(KeyCode::PageDown) {
                town.focus_next_waste_tank(&setup, camera);
                return;
            }
            town.water_panel
                .input(&keyboard, pointer.clicked, &mut town.construction);
            return;
        }
        if town.utility_panel == Some(UtilityPanel::Power) {
            if keyboard.just_pressed(KeyCode::PageUp) {
                town.focus_next_utility_installation(&setup, camera);
                return;
            }
            let shift = keyboard.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]);
            let endpoint = if keyboard.just_pressed(KeyCode::KeyC) {
                Some(0)
            } else {
                pointer
                    .clicked
                    .and_then(|hit| town.construction.utilities.power_at(hit.cell))
            };
            if let Some(id) = endpoint {
                if shift {
                    town.power_source = id;
                } else {
                    town.power_target = id;
                }
                town.power_notice.clear();
                if shift || keyboard.just_pressed(KeyCode::KeyC) {
                    return;
                }
            }
            if keyboard.just_pressed(KeyCode::KeyU) {
                town.queue_selected_power_connection();
                return;
            }
            if keyboard.any_just_pressed([KeyCode::BracketLeft, KeyCode::BracketRight]) {
                town.move_utility_link(keyboard.just_pressed(KeyCode::BracketRight));
            }
            if keyboard.just_pressed(KeyCode::KeyT) {
                town.toggle_selected_utility_link();
            }
            if keyboard.just_pressed(KeyCode::KeyO) {
                town.construction.utilities.grid_off = !town.construction.utilities.grid_off;
            }
            if keyboard.just_pressed(KeyCode::PageDown) {
                town.focus_next_power_shortage(&setup, camera);
                return;
            }
        }
        if keyboard.just_pressed(KeyCode::KeyJ)
            && let Some(index) = town.construction.production.selected
        {
            town.construction.utilities.toggle(index);
        }
        if keyboard.just_pressed(KeyCode::KeyL)
            && town.utility_owns_advance_key()
            && let Some(index) = town.construction.production.selected
        {
            town.construction.utilities.toggle_cooling(index);
        }
        if town.utility_panel == Some(UtilityPanel::Residents) {
            if keyboard.just_pressed(KeyCode::Tab) {
                town.resident_profile = town.resident_profile.next();
            }
            if let Some(index) = [
                KeyCode::Digit1,
                KeyCode::Digit2,
                KeyCode::Digit3,
                KeyCode::Digit4,
                KeyCode::Digit5,
            ]
            .iter()
            .position(|key| keyboard.just_pressed(*key))
            {
                town.select_resident(index);
            }
            if !town.resident_overview_open() {
                return;
            }
            if let Some(hit) = pointer.clicked {
                town.construction.select_facility(hit.cell);
                town.housing_notice.clear();
            }
            if keyboard.just_pressed(KeyCode::KeyT) {
                town.set_resident_home(&catalog, true);
            } else if keyboard.just_pressed(KeyCode::KeyY) {
                town.set_resident_home(&catalog, false);
            }
            return;
        }
        if town.stock.sandbox && keyboard.just_pressed(KeyCode::KeyI) {
            town.construction.toggle_sandbox_construction();
        }
        if !town.stock.sandbox
            && keyboard.just_pressed(KeyCode::KeyU)
            && (town.construction.menu
                || keyboard.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]))
        {
            town.construction.toggle_auto_buy();
        }
        if keyboard.get_just_pressed().len() > 0 {
            town.construction
                .input(&keyboard, &catalog, town.stock.sandbox);
            if !matches!(
                town.utility_panel,
                Some(UtilityPanel::Finances | UtilityPanel::Trade | UtilityPanel::Pantry)
            ) {
                town.construction
                    .production_input(&catalog, &mut town.stock, &keyboard);
                town.construction.farm_input(
                    &catalog,
                    &mut town.stock,
                    &keyboard,
                    ConstructionSite {
                        terrain: &terrain,
                        land: &land,
                        camp: cell,
                    },
                    TownClock {
                        seconds: town.clock,
                        round_trip_km: setup.round_trip_km(),
                    },
                );
            }
            if town.utility_panel.is_none() {
                town.construction
                    .lifecycle_input(&catalog, &mut town.stock, &keyboard);
            }
            if !town.construction.menu
                && !town.construction.production.open
                && !town.construction.farming.open
                && !matches!(
                    town.utility_panel,
                    Some(UtilityPanel::Finances | UtilityPanel::Trade | UtilityPanel::Pantry)
                )
                && let Some(speed) = SPEEDS
                    .iter()
                    .position(|(key, _)| keyboard.just_pressed(*key))
            {
                town.speed = speed;
            }
        }
        if let Some(position) = pointer.clicked.map(|hit| hit.cell)
            && town.construction.is_placing()
        {
            town.construction.place_blueprint(
                &catalog,
                &mut town.stock,
                ConstructionSite {
                    terrain: &terrain,
                    land: &land,
                    camp: cell,
                },
                position,
                TownClock {
                    seconds: town.clock,
                    round_trip_km: setup.round_trip_km(),
                },
                keyboard.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]),
            );
        } else if let Some(index) = pointer.resident
            && !town.construction.menu
        {
            town.select_resident(index);
            town.utility_panel = Some(UtilityPanel::Residents);
        } else if let Some(index) = pointer.project
            && !town.construction.menu
        {
            town.construction.select_built_project(index);
            town.construction.gathering.select(&land, None);
        } else if let Some(position) = pointer.clicked.map(|hit| hit.cell)
            && !town.construction.menu
        {
            town.construction.select_facility(position);
            town.construction
                .gathering
                .select(&land, land.site_at(position));
        }
        if keyboard.just_pressed(KeyCode::KeyG) && !town.construction.menu {
            town.construction.gathering.queue(
                &catalog,
                &land,
                terrain.seed,
                setup.richness(),
                town.clock,
            );
        }
        return;
    }
    if village.arrival_time < ARRIVAL_DURATION {
        return;
    }
    let preset = pointer.preset.or_else(|| {
        CAMP_SITES
            .into_iter()
            .find_map(|(key, cell)| keyboard.just_pressed(key).then_some(cell))
    });
    let Some(cell) = preset.or(pointer.clicked.map(|hit| hit.cell)) else {
        return;
    };
    if let Some(error) = camp_placement_error(&terrain, &land, cell, preset.is_some()) {
        village.camp_error = Some(error);
        return;
    }
    if preset.is_none()
        && !village.construction.camp_is_reachable(
            &catalog,
            ConstructionSite {
                terrain: &terrain,
                land: &land,
                camp: cell,
            },
        )
    {
        village.camp_error = Some(CAMP_ACCESS_ERROR);
        return;
    }
    village.camp_error = None;
    village.camp = Some(cell);
    village.construction.clear_arrival_positions(
        &catalog,
        ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: cell,
        },
    );
    let clock = village.clock;
    village.stock.update_finance_clock(clock);
    if !village.stock.sandbox {
        village.construction.record_event(
            clock,
            "Iara · We have tents, meals and drinking water. There’s a spare tarp in the supplies if the weather turns.".into(),
        );
    }
    village.construction.record_event(
        clock,
        "Camp is ready. Choose what your community needs first.".into(),
    );
    camera.target = spawn_tents(&mut commands, &assets, &setup, cell);
}

fn spawn_tents(
    commands: &mut Commands,
    assets: &AssetServer,
    setup: &WorldSetup,
    cell: IVec2,
) -> Vec3 {
    let terrain = setup.terrain().with_camp(cell);
    let Vec2 { x, y: z } = world_position(cell.x as f32, cell.y as f32);
    for index in 0..2 {
        let tent_x = x + index as f32 * 3.0;
        let tent_z = z - 3.0;
        commands.spawn((
            VillageEntity,
            opening_model(assets, NAMES.len() + index * 2),
            Transform::from_xyz(tent_x, terrain.height_at(tent_x, tent_z), tent_z),
        ));
    }
    Vec3::new(x, terrain.height_at(x, z), z)
}

fn animate_arrival(
    (mut commands, time): (Commands, Res<Time>),
    setup: Res<WorldSetup>,
    saves: Res<SaveMenu>,
    catalog: Res<Catalog>,
    mut village: ResMut<Village>,
    mut actors: Query<(
        Entity,
        &ArrivalActor,
        &mut Transform,
        &mut Visibility,
        Option<&mut resident_motion::ResidentMotion>,
    )>,
    mut tents: Query<&mut Visibility, (With<VillageEntity>, Without<ArrivalActor>)>,
) {
    if setup.open {
        return;
    }
    let update_arrival =
        village.arrival_time < ARRIVAL_DURATION || setup.is_changed() || village.is_changed();
    let paused = village.is_paused() || saves.open;
    if village.arrival_time < ARRIVAL_DURATION && !paused {
        village.arrival_time = (village.arrival_time + time.delta_secs()).min(ARRIVAL_DURATION);
    }
    let terrain = village.terrain(&setup);
    let game_speed = f32::from(village.effective_speed());
    for (entity, actor, mut transform, mut visibility, motion) in &mut actors {
        if let ArrivalActor::Resident(index) = *actor
            && village.camp.is_some()
        {
            let worker = village.construction.worker(index);
            let (position, visible) = village
                .construction
                .resident_visual_position(index, &catalog);
            let visible = visible
                && !village.construction.driver_away(index)
                && !village.construction.away_for_work(index);
            // Entering or leaving a visual anchor changes the resident's placement
            // independently of path movement (doorways, work stations, and rest poses).
            let anchor_offset = position - worker.position;
            let anchored = !anchor_offset.abs_diff_eq(Vec2::ZERO, 0.0001);
            let yaw =
                Quat::from_rotation_y(village.construction.resident_visual_yaw(index, &catalog));
            let target = world_position(position.x, position.y);
            let first_frame = motion.is_none();
            let mut initial = resident_motion::ResidentMotion::new(target, visible, anchored);
            let mut existing = motion;
            let motion = existing.as_deref_mut().unwrap_or(&mut initial);
            motion.game_speed = game_speed;
            motion.paused = paused;
            let rendered = motion.step(target, visible, anchored, time.delta_secs());
            let cell = position + (rendered - target) * 0.5 - anchor_offset;
            let height = village
                .construction
                .bridge_walk_height(&catalog, &terrain, cell)
                .unwrap_or_else(|| terrain.height_at(rendered.x, rendered.y));
            let rotation = if first_frame || *visibility == Visibility::Hidden {
                yaw
            } else if paused {
                transform.rotation
            } else {
                resident_motion::turn(transform.rotation, yaw, game_speed, time.delta_secs())
            };
            transform.set_if_neq(Transform {
                translation: Vec3::new(rendered.x, height, rendered.y),
                rotation,
                ..*transform
            });
            visibility.set_if_neq(if visible {
                Visibility::Inherited
            } else {
                Visibility::Hidden
            });
            if first_frame {
                commands.entity(entity).insert(initial);
            }
            continue;
        }
        if !update_arrival {
            continue;
        }
        let pose = match *actor {
            ArrivalActor::Resident(index) => {
                if motion.is_some() {
                    commands
                        .entity(entity)
                        .remove::<resident_motion::ResidentMotion>();
                }
                resident_pose(village.arrival_time, index)
            }
            ArrivalActor::Car(index) => village.construction.car_trip(index).map_or_else(
                || vehicle_pose(village.arrival_time, index),
                |(elapsed, duration)| town_vehicle_pose(elapsed, duration, index),
            ),
        };
        let Vec2 { x, y: z } = pose.position;
        transform.translation = Vec3::new(x, terrain.height_at(x, z) + pose.step_height, z);
        transform.rotation = if matches!(actor, ArrivalActor::Car(_)) {
            vehicle_motion::terrain_rotation(pose.position, pose.yaw, |point| {
                terrain.height_at(point.x, point.y)
            })
        } else {
            Quat::from_rotation_y(pose.yaw)
        };
        *visibility = if pose.visible {
            Visibility::Inherited
        } else {
            Visibility::Hidden
        };
    }
    if update_arrival {
        for mut visibility in &mut tents {
            *visibility = Visibility::Inherited;
        }
    }
}

fn advance_clock(
    time: Res<Time<Fixed>>,
    setup: Res<WorldSetup>,
    mut village: ResMut<Village>,
    (catalog, land, saves): (Res<Catalog>, Res<Land>, Res<SaveMenu>),
    mut budget: Local<u8>,
) {
    if setup.open || saves.open || village.is_paused() {
        *budget = 0;
        return;
    }
    let Some(camp) = village.camp else {
        *budget = 0;
        return;
    };
    let terrain = village.terrain(&setup);
    let site = ConstructionSite {
        terrain: &terrain,
        land: &land,
        camp,
    };
    *budget += UNAVAILABLE_SPEED;
    let started = bevy::platform::time::Instant::now();
    loop {
        let cost = UNAVAILABLE_SPEED / village.effective_speed();
        if *budget < cost {
            break;
        }
        *budget -= cost;
        step(&mut village, &catalog, &setup, site, time.delta_secs_f64());
        if started.elapsed() >= LIVE_STEP_BUDGET {
            *budget = 0;
            break;
        }
    }
}

fn advance_days(
    setup: Res<WorldSetup>,
    mut village: ResMut<Village>,
    (catalog, land, saves): (Res<Catalog>, Res<Land>, Res<SaveMenu>),
) {
    if setup.open || saves.open || village.guide.open() || village.advance.running.is_none() {
        return;
    }
    let (Some(camp), Some(mut run)) = (village.camp, village.advance.running.take()) else {
        return;
    };
    let terrain = village.terrain(&setup);
    let site = ConstructionSite {
        terrain: &terrain,
        land: &land,
        camp,
    };
    let started = bevy::platform::time::Instant::now();
    let dt = run.step_seconds();
    loop {
        step(&mut village, &catalog, &setup, site, dt);
        if run.record_step() {
            village.advance.done();
            village.checkpoint_advance();
            return;
        }
        if started.elapsed() >= std::time::Duration::from_millis(12) {
            break;
        }
    }
    village.advance.running = Some(run);
}

fn step(
    town: &mut Village,
    catalog: &Catalog,
    setup: &WorldSetup,
    site: ConstructionSite,
    dt: f64,
) {
    town.clock += dt;
    town.stock.replenish_sandbox(catalog);
    town.construction.refresh_resident_crowding(catalog, site);
    town.stock.update_finance_clock(town.clock);
    town.construction
        .tick_services(catalog, setup, &mut town.stock, town.clock, dt);
    let cooling = town.construction.utilities.powered_cold_storage();
    town.stock.age_food(catalog, town.clock, dt, cooling);
    town.construction
        .tick_animals(catalog, &mut town.stock, site.land, town.clock, dt);
    town.construction.tick_crops(catalog, setup, town.clock, dt);
    town.construction.schedule_crop_work(
        catalog,
        &mut town.stock,
        TownClock {
            seconds: town.clock,
            round_trip_km: setup.round_trip_km(),
        },
    );
    town.construction
        .tick_growth(catalog, setup, &town.stock, town.clock, dt);
    town.construction
        .schedule_perennial_work(catalog, &mut town.stock);
    town.construction
        .tick_health(catalog, setup, &mut town.stock, site, town.clock, dt as f32);
    town.construction
        .manage_kitchens(catalog, &mut town.stock, town.clock);
    let clock = TownClock {
        seconds: town.clock,
        round_trip_km: setup.round_trip_km(),
    };
    let raining = weather_at(town.clock, setup.biome(), setup.seed()).rain > 0.05;
    town.construction
        .tick(catalog, &mut town.stock, site, clock, dt as f32, raining);
    if !town.stock.sandbox {
        town.construction
            .update_opening_milestones(catalog, town.clock, town.stock.balance());
    }
    town.construction
        .tick_leisure(catalog, setup, &town.stock, site, town.clock, dt as f32);
}

type ConstructionProgressNodes<'w, 's> = Query<
    'w,
    's,
    (&'static mut Node, Has<ConstructionProgressTrack>),
    (
        Or<(
            With<ConstructionProgressTrack>,
            With<ConstructionProgressFill>,
        )>,
        Without<VillageHud>,
    ),
>;

type VillageHudNodes<'w, 's> = (
    Single<'w, 's, &'static mut Text, With<VillageHudText>>,
    Single<'w, 's, &'static mut Node, With<VillageHud>>,
);

fn show_hud(
    setup: Res<WorldSetup>,
    village: Res<Village>,
    (mut text, mut node): VillageHudNodes,
    mut progress_nodes: ConstructionProgressNodes,
    (catalog, land, saves): (Res<Catalog>, Res<Land>, Res<SaveMenu>),
    (placement, sound): (Res<MapNotice>, Res<SoundSettings>),
) {
    if !saves.is_changed()
        && !setup.is_changed()
        && !village.is_changed()
        && !placement.is_changed()
        && !sound.is_changed()
    {
        return;
    }
    for (mut node, track) in &mut progress_nodes {
        if track {
            node.display = Display::None;
        }
    }
    node.max_width = Val::Auto;
    if sound.open {
        node.display = Display::Flex;
        node.left = Val::Auto;
        node.right = px(20);
        node.top = px(20);
        node.bottom = Val::Auto;
        text.0 = sound.label();
        return;
    }
    if saves.open {
        node.display = Display::Flex;
        node.left = Val::Auto;
        node.right = px(20);
        node.top = px(20);
        node.bottom = Val::Auto;
        text.0 = saves.label();
        return;
    }
    node.left = px(20);
    node.right = Val::Auto;
    if setup.open {
        node.display = if village.save_notice.is_empty() {
            Display::None
        } else {
            Display::Flex
        };
        node.top = Val::Auto;
        node.bottom = px(20);
        text.0.clone_from(&village.save_notice);
        return;
    }
    // The catalog carries its own headings and hints.
    if build_menu::visible(&setup, &village, &saves, &sound) {
        node.display = Display::None;
        return;
    }
    node.display = Display::Flex;
    // Below the top bar's stat cards; panels and reference pages get more room than the
    // short status notes shown while playing.
    node.top = px(TOP_BAR_CLEARANCE);
    node.bottom = Val::Auto;
    // An open panel becomes a wide almanac sheet beside its action column.
    let sheet = village.utility_panel.is_some() && !village.guide.open() && !village.lenses.open;
    node.right = if sheet {
        px(toolbar::PANEL_WIDTH + 60.0)
    } else {
        Val::Auto
    };
    node.max_width = if sheet {
        Val::Auto
    } else if village.guide.open() || village.lenses.open || village.lenses.active.is_some() {
        Val::Vw(46.0)
    } else {
        px(520)
    };
    if village.trade_open()
        || (village.utility_panel.is_none() && village.construction.production.open)
    {
        node.right = px(toolbar::PANEL_WIDTH + 40.0);
    }
    if let Some(page) = village
        .guide
        .text(&catalog)
        .or_else(|| village.lenses.text())
    {
        text.0 = page;
        return;
    }
    let controls = if village.arrival_time < ARRIVAL_DURATION {
        "Arriving at the village".into()
    } else if village.camp.is_none() {
        village
            .camp_error
            .unwrap_or("Click to choose camp · 1 Shade · 2 Entrance · 3 Clearing")
            .into()
    } else if village.paused && !village.construction.menu {
        String::new()
    } else {
        village
            .construction
            .instructions(&catalog, village.stock.sandbox)
    };
    // The clock, stock counters, date and weather live in the top bar; this card only
    // carries what the player is doing right now.
    let mut label = if controls == "B Build · Space Pause · 1–4 Speed" {
        String::new()
    } else {
        controls
    };
    if let Some(notice) = &placement.0 {
        label.push('\n');
        label.push_str(notice);
    }
    if village.show_forecast {
        label.push('\n');
        label.push_str(&forecast(village.clock, setup.biome(), setup.seed()));
    }
    if village.camp.is_some() && village.advance.has_status() {
        label.push('\n');
        label.push_str(&village.advance.status(village.utility_owns_advance_key()));
        if village.advance.open {
            label.push_str(&village.construction.advance_milestones(
                &catalog,
                &setup,
                village.clock,
                village.advance.remaining_days(),
            ));
        }
    }
    if village.terrain_editor.open {
        label.push('\n');
        label.push_str(&village.terrain_editor.label());
    }
    if village.camp.is_some()
        && !sheet
        && !village.stock.sandbox
        && let Some(status) = village.construction.opening_milestones_status(&catalog)
    {
        label.push('\n');
        label.push_str(&status);
    }
    if !sheet && let Some(progress) = village.construction.latest_progress(&catalog) {
        label.push('\n');
        label.push_str(&progress);
    }
    if village.camp.is_some()
        && village.utility_panel.is_none()
        && !village.construction.is_placing()
        && let Some(event) = village.construction.latest_event()
    {
        label.push('\n');
        label.push_str(event);
    }
    if let Some(natural) =
        village
            .construction
            .gathering
            .selected_status(&catalog, &land, village.clock, |job| {
                village
                    .construction
                    .gathering_route_blocked(job, village.clock)
            })
    {
        label.push('\n');
        label.push_str(&natural);
    }
    match village.utility_panel {
        Some(UtilityPanel::Power) => {
            label.push('\n');
            label.push_str(
                &village
                    .construction
                    .utilities
                    .power_details(village.stock.sandbox),
            );
            label.push_str(&village.construction.connection_summary(
                &catalog,
                village.power_link,
                true,
            ));
            label.push_str(&village.construction.power_installation_summary(
                &catalog,
                village.power_source,
                village.power_target,
            ));
            if !village.power_notice.is_empty() {
                label.push('\n');
                label.push_str(&village.power_notice);
            }
            label.push_str(&village.construction.power_shortage_summary(&catalog));
            label.push_str(&village.construction.queued_installation_hint(true));
        }
        Some(UtilityPanel::Projects) => {
            label.push('\n');
            label.push_str(
                &village
                    .construction
                    .projects_panel(
                        &catalog,
                        &village.stock,
                        village.projects_page,
                        village.open_projects_only,
                        village.project_roads_expanded,
                        village.clock,
                    )
                    .1,
            );
            if let Some(freight) = village.construction.reserved_freight_status(village.clock) {
                label.push('\n');
                label.push_str(&freight);
            }
            if village.project_events_expanded {
                label.push_str("\n\nRecent events · R Hide");
                village.construction.append_recent_events(&mut label, 0, 8);
            }
        }
        Some(UtilityPanel::Inventory) => {
            use std::fmt::Write;
            let cursor = if village.editing_inventory {
                "| · Enter Done"
            } else {
                " · / Search"
            };
            let search_label = if village.inventory_view == InventoryView::Production {
                "Find producer"
            } else {
                "Find material"
            };
            let _ = write!(
                label,
                "\n{search_label} · {}{cursor}",
                village.inventory_search
            );
            label.push('\n');
            if village.inventory_view == InventoryView::Production {
                label.push_str(&village.construction.inventory_production_summary(
                    &catalog,
                    &village.stock,
                    village.inventory_page,
                    &village.inventory_search,
                    village.clock,
                ));
            } else {
                label.push_str(
                    &village
                        .construction
                        .inventory_panel(
                            &catalog,
                            &village.stock,
                            &land,
                            village.inventory_page,
                            village.inventory_view,
                            &village.inventory_search,
                        )
                        .1,
                );
            }
            label.push('\n');
            label.push_str(&village.stock.processing_summary(&catalog));
        }
        Some(UtilityPanel::Crafting) => {
            use std::fmt::Write;
            let (pages, rows) = village.producer_rows(&catalog);
            let page = village.inventory_page.min(pages - 1) + 1;
            let _ = write!(
                label,
                "\nCrafting & repairs · {} · {page}/{pages}",
                village.craft_view.label()
            );
            if rows.is_empty() {
                label.push_str(match village.craft_view {
                    crate::construction::CraftView::Make => "\nNo craft recipes available.",
                    crate::construction::CraftView::Repair => "\nNo owned equipment to repair.",
                    crate::construction::CraftView::Jobs => "\nNo crafting jobs underway.",
                });
            }
            if let Some(id) = &village.craft_recipe {
                label.push('\n');
                label.push_str(&village.construction.craft_recipe_summary(
                    &catalog,
                    &village.stock,
                    id,
                ));
                match village.construction.crafting_plan(
                    &catalog,
                    &village.stock,
                    id,
                    village.craft_workspace,
                ) {
                    Ok(site) => {
                        let name = village.construction.craft_workspace_name(&catalog, site);
                        let _ = write!(label, "\n{name} · Ready to start");
                    }
                    Err(reason) => {
                        if let Some(site) = village.craft_workspace
                            && village
                                .construction
                                .craft_workspaces(&catalog, id)
                                .contains(&site)
                        {
                            let name = village.construction.craft_workspace_name(&catalog, site);
                            let _ = write!(label, "\n{name}");
                        }
                        let _ = write!(label, "\n{reason}");
                    }
                }
            } else if village.craft_view == crate::construction::CraftView::Jobs {
                for (target, name) in rows {
                    if let crate::construction::Producer::Site(site) = target {
                        let status = village.construction.production_site_status(
                            &catalog,
                            &village.stock,
                            site,
                            village.clock,
                        );
                        let worker = village.construction.craft_job_worker(site);
                        let _ = write!(label, "\n{name} · {worker}{status}");
                    }
                }
                if let Some(site) = village.craft_job_site {
                    let name = village.construction.craft_workspace_name(&catalog, site);
                    let _ = write!(label, "\nSelected workspace · {name}");
                    if let Some(destination) = village.craft_move_target(&catalog) {
                        let target = village
                            .construction
                            .craft_workspace_name(&catalog, destination);
                        let _ = write!(label, "\nMove unfinished job to {target}");
                    } else {
                        label.push_str("\nNo eligible destination for this job.");
                    }
                }
            }
        }
        Some(UtilityPanel::Events) => {
            label.push('\n');
            label.push_str(
                &village
                    .construction
                    .event_log(village.event_page, "F8 Close")
                    .1,
            );
        }
        Some(UtilityPanel::Upkeep) => {
            label.push('\n');
            label.push_str(
                &village
                    .construction
                    .upkeep_status(&catalog, village.upkeep_page),
            );
        }
        Some(UtilityPanel::Water) => {
            label.push('\n');
            label.push_str(&village.construction.utilities.water_details());
            label.push_str("\nSanitation · ");
            label.push_str(
                &village
                    .construction
                    .utilities
                    .sanitation_status(village.construction.residents_needing_sanitation()),
            );
            label.push_str(&village.construction.waste_tank_summary(&catalog));
            label.push_str(&village.construction.queued_installation_hint(false));
            label.push_str(&village.construction.connection_summary(
                &catalog,
                village.water_link,
                false,
            ));
            label.push_str("\nBlue Drinking · Green Irrigation\nPurple Greywater · Amber Sewage");
            let panel = &village.water_panel;
            label.push('\n');
            label.push_str(&village.construction.water_panel(
                panel.target,
                panel.source,
                panel.channel,
                village.clock,
            ));
            if !panel.message.is_empty() {
                label.push('\n');
                label.push_str(&panel.message);
            }
        }
        Some(UtilityPanel::Residents) => {
            let selected = village.selected_resident;
            label.push_str("\n1–5 Select resident · Tab Change profile view\n\n");
            match village.resident_profile {
                ResidentProfile::Overview => {
                    label.push_str("Click home · T Assign · Y Clear\n");
                    if !village.housing_notice.is_empty() {
                        label.push_str(&village.housing_notice);
                        label.push('\n');
                    }
                    if !village.stock.sandbox {
                        label.push_str(
                            &village
                                .construction
                                .resident_shift_summary(selected, village.clock),
                        );
                        label.push_str("\n\n");
                    }
                    // The roster cards already list everyone; keep the selected resident.
                    let status =
                        village
                            .construction
                            .resident_status(&catalog, &village.stock, selected);
                    label.push_str(
                        status
                            .split_once("\n\n")
                            .map_or(status.as_str(), |(_, profile)| profile),
                    );
                }
                ResidentProfile::Story => {
                    label.push_str(&Construction::resident_story(&catalog, selected));
                }
                ResidentProfile::Skills => {
                    label.push_str(&village.construction.resident_skills(&catalog, selected));
                }
                ResidentProfile::Relationships => {
                    label.push_str(&village.construction.resident_relationships(selected));
                }
            }
        }
        Some(UtilityPanel::Finances) => {
            label.push('\n');
            if village.finance_history_open {
                label.push_str(
                    &village
                        .stock
                        .finance_history(village.finance_history_page)
                        .1,
                );
                label.push('\n');
                label.push_str(&village.stock.material_history(&catalog));
            } else {
                label.push_str(&village.construction.finance_summary(
                    &catalog,
                    &village.stock,
                    village.selected_resident,
                    TownClock {
                        seconds: village.clock,
                        round_trip_km: setup.round_trip_km(),
                    },
                ));
                label.push('\n');
                label.push_str(&village.construction.replacement_costs(
                    &catalog,
                    &village.stock,
                    &land,
                ));
                label.push('\n');
                label.push_str(&village.construction.expansion_reserve_label());
                if !village.stock.sandbox {
                    use std::fmt::Write;
                    label.push_str(
                        "\nConstruction auto-buy accounts for this reserve before placing new orders.\nThe village starts with its land and two cars already owned. Each car has an estimated book value of R$60,000.",
                    );
                    let distance = setup.round_trip_km();
                    let _ = write!(
                        label,
                        "\nTown pickup or export · {distance} km round trip · R${:.2} fuel · About {:.0} game minutes",
                        crate::market::fare_cents(distance) as f64 / 100.0,
                        crate::market::trip_seconds(distance) * 0.45,
                    );
                }
                label.push_str("\nR Recent transactions");
            }
            label.push_str("\nTab Town trade");
        }
        Some(UtilityPanel::Trade) => {
            label.push('\n');
            label.push_str(&village.construction.trade_status(
                &catalog,
                &village.stock,
                TownClock {
                    seconds: village.clock,
                    round_trip_km: setup.round_trip_km(),
                },
            ));
            label.push_str("\nTab Pantry");
        }
        Some(UtilityPanel::Pantry) if village.pantry_batch_page.is_some() => {
            label.push('\n');
            if village.stock.sandbox {
                label.push_str("Food batches · Unlimited food · No spoilage\nR Pantry");
            } else if village.pantry_batch_page == Some(0) {
                label.push_str(
                    &village
                        .stock
                        .pantry
                        .shelves(&catalog, |id| village.stock.available(id)),
                );
                label.push('\n');
                label.push_str(&village.construction.pantry_commitments(
                    &catalog,
                    &village.stock,
                    &land,
                ));
                label.push_str("\nR Pantry · Tab Finances");
            } else {
                let page = village
                    .pantry_batch_page
                    .unwrap_or_default()
                    .saturating_sub(1);
                label.push_str(&village.stock.pantry.batches(&catalog, page).1);
                label.push_str("\nTab Finances");
            }
        }
        Some(UtilityPanel::Pantry) => {
            label.push('\n');
            if village.stock.sandbox {
                let utilities = &village.construction.utilities;
                use std::fmt::Write;
                let _ = write!(
                    label,
                    "Unlimited food · No spoilage\nKitchen automation is inactive\nRefrigeration · {:.0}/{:.0} L powered · Chill first: {}",
                    utilities.powered_cold_storage(),
                    utilities.installed_cold_storage(),
                    village.stock.pantry.priority.label(),
                );
            } else {
                label.push_str(&village.stock.pantry.status(
                    &catalog,
                    village.construction.utilities.powered_cold_storage(),
                    village.construction.utilities.installed_cold_storage(),
                ));
            }
            label.push('\n');
            label.push_str(&village.construction.pantry_purchase_status(
                &catalog,
                &village.stock,
                TownClock {
                    seconds: village.clock,
                    round_trip_km: setup.round_trip_km(),
                },
            ));
            label.push('\n');
            if !village.stock.sandbox
                && let Some(warning) = village.stock.pantry.use_soon(&catalog, village.clock)
            {
                label.push_str(&warning);
                label.push('\n');
            }
            if village.stock.sandbox {
                label.push_str("R Food batches");
            } else {
                label.push_str(&village.construction.production.kitchen_policy.status());
                label.push_str("\nR Food batches · Tab Finances");
            }
        }
        None => {}
    }
    if let Some(endpoints) = village.selected_installation() {
        label.push_str(
            &village
                .construction
                .connection_quote(&catalog, &village.stock, endpoints),
        );
    }
    // A selected building is described by its card beside the action buttons.
    let card = village.selected_project_focus().is_some();
    if !card
        && let Some(production) =
            village
                .construction
                .selected_production(&catalog, &village.stock, village.clock)
    {
        label.push('\n');
        label.push_str(&production);
    }
    // The construction bar sits on the selection card.
    if card
        && let Some((_, fraction)) = village
            .construction
            .selected_construction_progress(&catalog)
    {
        for (mut node, track) in &mut progress_nodes {
            if track {
                node.display = Display::Flex;
            } else {
                node.width = percent((fraction * 100.0) as f32);
            }
        }
    }
    if !card
        && let Some(status) = village
            .construction
            .lifecycle_status(&catalog, &village.stock)
    {
        label.push('\n');
        label.push_str(&status);
    }
    let notice = village.construction.construction_notice();
    if !notice.is_empty() && !village.construction.menu {
        label.push('\n');
        label.push_str(notice);
    }
    if let Some(farm) = village.construction.farm_status(
        &catalog,
        &village.stock,
        TownClock {
            seconds: village.clock,
            round_trip_km: setup.round_trip_km(),
        },
    ) {
        label.push('\n');
        label.push_str(&farm);
    }
    if !card
        && let Some(index) = village.construction.production.selected
        && let Some(service) = village.construction.utilities.facility_status(index)
    {
        label.push('\n');
        label.push_str(&service);
    }
    if !village.save_notice.is_empty() {
        label.push('\n');
        label.push_str(&village.save_notice);
    }
    // Panel buttons already offer the keyboard actions their text used to list.
    let label = if sheet {
        label
            .trim_start_matches('\n')
            .lines()
            .filter_map(|line| {
                // Keep paragraph breaks; drop lines that held nothing but shortcuts.
                let stripped = strip_key_hints(line);
                (line.is_empty() || !stripped.is_empty()).then_some(stripped)
            })
            .collect::<Vec<_>>()
            .join("\n")
    } else if village.hud_note() {
        // Like V2's toast the note stays short: the current goal and the latest message.
        let lines: Vec<&str> = label.lines().filter(|line| !line.is_empty()).collect();
        match lines.as_slice() {
            [first, .., last] => format!("{first}\n{last}"),
            _ => lines.join("\n"),
        }
    } else {
        label.trim_start_matches('\n').to_owned()
    };
    let meters = village.resident_overview_open() || sheet;
    node.display = if label.is_empty() && !meters {
        Display::None
    } else {
        Display::Flex
    };
    if text.0 != label {
        text.0 = label;
    }
}

type CampPreview = Option<(IVec2, Option<&'static str>)>;

fn draw_blueprints(
    setup: Res<WorldSetup>,
    village: Res<Village>,
    (catalog, land): (Res<Catalog>, Res<Land>),
    pointer: Res<CampPointer>,
    keyboard: Res<ButtonInput<KeyCode>>,
    mut gizmos: Gizmos,
    (mut map_notice, mut land_lens, mut grid, mut camp_preview): (
        ResMut<MapNotice>,
        Local<land_lens::LandLens>,
        Local<crate::terrain::TerrainGrid>,
        Local<CampPreview>,
    ),
) {
    let mut notice = None;
    let mut available = None;
    if !setup.open
        && let Some(camp) = village.camp
    {
        let terrain = village.terrain(&setup);
        if village.show_grid {
            grid.draw(village.terrain_key(), &terrain, &mut gizmos);
        }
        let construction_notice = village.construction.draw(
            &catalog,
            &terrain,
            village.lenses.active == Some(MapLens::Construction),
            pointer.hovered.map(|hit| hit.cell),
            &mut gizmos,
        );
        let network_lens = village.lenses.network_view();
        let panel_network = match village.utility_panel {
            Some(UtilityPanel::Power) => Some(NetworkView::Power),
            Some(UtilityPanel::Water) => Some(NetworkView::Water),
            _ => None,
        };
        if let Some(network) = network_lens.or(panel_network) {
            if network_lens.is_none() {
                village
                    .construction
                    .utilities
                    .draw_network(&terrain, network, &mut gizmos);
            }
            village
                .construction
                .draw_utility_installations(&terrain, network, &mut gizmos);
        }
        notice = match village.lenses.active {
            Some(MapLens::Land) => Some(land_lens.draw(
                village.terrain_key(),
                &terrain,
                pointer.hovered.map(|hit| hit.world),
                &mut gizmos,
            )),
            Some(lens @ (MapLens::Resources | MapLens::Ecology)) => Some(resource_lens::draw(
                &village,
                &setup,
                &terrain,
                &catalog,
                &land,
                (pointer.hovered, lens == MapLens::Ecology),
                &mut gizmos,
            )),
            Some(MapLens::Access) => Some(village.construction.draw_access_lens(
                &catalog,
                &terrain,
                &land,
                pointer.hovered.map(|hit| hit.cell),
                &mut gizmos,
            )),
            Some(MapLens::Chains) => {
                catalog
                    .materials
                    .keys()
                    .nth(village.lenses.material)
                    .map(|material| {
                        village.construction.draw_chains_lens(
                            &catalog,
                            &terrain,
                            (&village.stock, &land, village.clock),
                            material,
                            pointer.hovered.map(|hit| hit.cell),
                            &mut gizmos,
                        )
                    })
            }
            Some(MapLens::Food) => Some(village.construction.draw_food_lens(
                &catalog,
                &terrain,
                &village.stock,
                village.clock,
                pointer.hovered.map(|hit| hit.cell),
                &mut gizmos,
            )),
            Some(MapLens::Comfort) => Some(village.construction.draw_comfort_lens(
                &catalog,
                &terrain,
                pointer.hovered.map(|hit| hit.cell),
                &mut gizmos,
            )),
            Some(MapLens::Residents) => Some("Residents".to_owned()),
            Some(MapLens::Work) => Some(village.construction.draw_work_lens(
                &catalog,
                &terrain,
                (&village.stock, village.clock),
                pointer.hovered.map(|hit| hit.cell),
                &mut gizmos,
            )),
            Some(MapLens::Construction) => construction_notice,
            Some(MapLens::Power | MapLens::Water | MapLens::Sanitation) | None => {
                network_lens.map(|view| {
                    let mut label = village.construction.utilities.draw_lens(
                        &terrain,
                        view,
                        (
                            pointer.hovered.map(|hit| hit.cell),
                            village.lenses.network_site,
                        ),
                        &mut gizmos,
                    );
                    label.push_str(
                        &village
                            .construction
                            .utility_site_list(&catalog, view == NetworkView::Power),
                    );
                    label
                })
            }
        };
        if matches!(
            village.lenses.active,
            Some(MapLens::Residents | MapLens::Comfort | MapLens::Access | MapLens::Work)
        ) && let Some(label) = &mut notice
        {
            label.push_str(
                " · Green residents with no needs below 30% · Red residents with urgent needs",
            );
            village.construction.draw_resident_markers(
                &catalog,
                &terrain,
                pointer.hovered.map(|hit| hit.world),
                &mut gizmos,
                label,
            );
        }
        if village.terrain_editor.open
            && !pointer.terrain_stroke_finished
            && pointer.terrain_stroke.len() > 1
        {
            gizmos.linestrip(
                pointer.terrain_stroke.iter().map(|point| {
                    Vec3::new(point.x, terrain.height_at(point.x, point.z) + 0.18, point.z)
                }),
                Color::srgb_u8(255, 225, 160),
            );
        }
        if let Some(hit) = pointer.hovered {
            if village.terrain_editor.open {
                village
                    .terrain_editor
                    .draw_preview(&terrain, hit.world, &mut gizmos);
                notice = Some(
                    village
                        .terrain_editor
                        .inspect_brush(&terrain, hit.world, |cell| {
                            village.construction.protects_terrain(cell)
                        }),
                );
            } else if village.planning_roads() {
                let extend = village.extend_road(&keyboard);
                let (label, valid) = village.construction.draw_road_route(
                    ConstructionSite {
                        terrain: &terrain,
                        land: &land,
                        camp,
                    },
                    &catalog,
                    (
                        &village.stock,
                        TownClock {
                            seconds: village.clock,
                            round_trip_km: setup.round_trip_km(),
                        },
                    ),
                    hit.cell,
                    extend,
                    &mut gizmos,
                );
                notice = Some(label);
                available = Some(valid);
            } else if village.construction.placing_project()
                && let Some((label, valid)) = village.construction.draw_project_site(
                    ConstructionSite {
                        terrain: &terrain,
                        land: &land,
                        camp,
                    },
                    &catalog,
                    &village.stock,
                    TownClock {
                        seconds: village.clock,
                        round_trip_km: setup.round_trip_km(),
                    },
                    hit.cell,
                    &mut gizmos,
                )
            {
                notice = Some(label);
                available = Some(valid);
            }
        }
    }
    if !setup.open
        && village.camp.is_none()
        && let Some(hit) = pointer.hovered
    {
        let terrain = village.terrain(&setup);
        if setup.is_changed()
            || land.is_changed()
            || camp_preview.is_none_or(|(cell, _)| cell != hit.cell)
        {
            let issue = camp_placement_error(&terrain, &land, hit.cell, false).or_else(|| {
                (!village.construction.camp_is_reachable(
                    &catalog,
                    ConstructionSite {
                        terrain: &terrain,
                        land: &land,
                        camp: hit.cell,
                    },
                ))
                .then_some(CAMP_ACCESS_ERROR)
            });
            *camp_preview = Some((hit.cell, issue));
        }
        let issue = camp_preview.and_then(|(_, issue)| issue);
        let tint = if issue.is_some() {
            Color::srgb_u8(240, 105, 96)
        } else {
            Color::srgb_u8(156, 220, 142)
        };
        crate::construction::draw_footprint(
            &terrain,
            hit.cell + CAMP_OFFSET,
            CAMP_SIZE,
            tint,
            &mut gizmos,
        );
        notice = Some(issue.unwrap_or("Click to pitch camp here.").into());
    } else {
        *camp_preview = None;
    }
    map_notice.set_if_neq(MapNotice(notice, available));
}

pub(crate) fn register_building_models(app: &mut App) {
    embedded_asset!(app, "buildings.glb");
}

pub(crate) fn building_model(assets: &AssetServer, model: usize) -> SceneRoot {
    let path = AssetPath::from_path_buf(embedded_path!("buildings.glb")).with_source("embedded");
    SceneRoot(assets.load(path.with_label(GltfAssetLabel::Scene(model).to_string())))
}

fn show_construction(
    mut commands: Commands,
    setup: Res<WorldSetup>,
    village: Res<Village>,
    catalog: Res<Catalog>,
    (assets, mut meshes, mut materials): (
        Res<AssetServer>,
        ResMut<Assets<Mesh>>,
        ResMut<Assets<StandardMaterial>>,
    ),
    mut solar_model: Local<Option<(Handle<Mesh>, Handle<StandardMaterial>)>>,
    mut displayed: Query<(Entity, &mut BuiltProject, &mut Transform)>,
) {
    if setup.open || !village.is_changed() {
        return;
    }
    if village.camp.is_none() {
        return;
    }
    let terrain = village.terrain(&setup);
    let models_to_show: Vec<_> = village.construction.finished_models(&catalog).collect();
    for (entity, shown, _) in &displayed {
        if !models_to_show
            .iter()
            .any(|(index, model, _, _)| *index == shown.index && *model == shown.model)
        {
            commands.entity(entity).despawn();
        }
    }
    for (project, asset, position, yaw) in models_to_show {
        let Vec2 { x, y: z } = position;
        let place = Transform::from_xyz(x, terrain.height_at(x, z), z)
            .with_rotation(Quat::from_rotation_y(yaw));
        let rooftop_solar = village.construction.utilities.has_rooftop_solar(project);
        let (entity, add_panel) = if let Some((entity, mut shown, mut placed)) = displayed
            .iter_mut()
            .find(|(_, view, _)| view.index == project && view.model == asset)
        {
            if *placed != place {
                *placed = place;
            }
            let add_panel = rooftop_solar && !shown.rooftop_solar;
            if add_panel {
                shown.rooftop_solar = true;
            }
            (entity, add_panel)
        } else {
            let mut building = commands.spawn((
                VillageEntity,
                BuiltProject {
                    index: project,
                    model: asset,
                    rooftop_solar,
                },
                Visibility::Inherited,
                place,
            ));
            if !village.construction.has_cultivation_surface(project) {
                building.insert(building_model(&assets, asset));
            }
            if village.construction.is_road(project) {
                building.insert(road_surface::RoadSurface);
            }
            (building.id(), rooftop_solar)
        };
        if add_panel {
            let (mesh, material) = solar_model.get_or_insert_with(|| {
                (
                    meshes.add(Cuboid::new(1.2, 0.07, 0.8)),
                    materials.add(Color::srgb_u8(67, 107, 121)),
                )
            });
            commands.spawn((
                Mesh3d(mesh.clone()),
                MeshMaterial3d(material.clone()),
                Transform::from_xyz(-0.8, 3.2, 0.6)
                    .with_rotation(Quat::from_rotation_x(1.05_f32.atan2(1.78))),
                ChildOf(entity),
            ));
        }
    }
}

fn outdoor_animation_time(seconds: f64) -> f32 {
    // The fire and livestock frequencies are multiples of 0.05 radians per second.
    // Reduce by a shared period before converting to f32 to keep motion smooth in old villages.
    seconds.rem_euclid(20.0 * std::f64::consts::TAU) as f32
}

#[cfg(test)]
mod tests {
    use super::*;
    use bevy::ecs::system::RunSystemOnce;

    #[test]
    fn cards_drop_keyboard_hints_their_buttons_already_offer() {
        assert_eq!(
            strip_key_hints("Housing · 0/2 beds assigned · C Recipes"),
            "Housing · 0/2 beds assigned"
        );
        assert_eq!(
            strip_key_hints("Shift+M Move · X Salvage · Shift+X Demolish"),
            ""
        );
        assert_eq!(strip_key_hints("Powered · J Switch"), "Powered");
        assert_eq!(
            strip_key_hints("Trigger 16 kg · Y Daily cap 32 kg"),
            "Trigger 16 kg · Daily cap 32 kg"
        );
        assert_eq!(strip_key_hints("100 m² basic shell"), "100 m² basic shell");
        assert_eq!(
            strip_key_hints("Drinking water · 0.0/8.0 L"),
            "Drinking water · 0.0/8.0 L"
        );
    }

    #[test]
    fn stepping_through_lens_facilities_selects_each_building() {
        let mut setup = WorldSetup::default().session();
        setup.mode = Mode::Sandbox;
        let catalog = Catalog::default();
        let terrain = setup.terrain();
        let land = Land::generate(&setup);
        let camp = CAMP_SITES[2].1;
        let mut village = Village {
            setup: Some(setup.clone()),
            camp: Some(camp),
            stock: Stock::for_start(&setup, &catalog),
            ..default()
        };
        village
            .construction
            .lab_order(
                &catalog,
                &mut village.stock,
                ConstructionSite {
                    terrain: &terrain,
                    land: &land,
                    camp,
                },
                TownClock {
                    seconds: 0.0,
                    round_trip_km: 12,
                },
                &crate::construction::LabOrder::Build {
                    key: "well".into(),
                    x: 44,
                    z: 36,
                    rotation: 0,
                    size: None,
                },
                setup.richness(),
            )
            .unwrap();
        village
            .construction
            .utilities
            .sync(std::iter::once(crate::utilities::Facility {
                id: 1,
                kind: "well",
                location: IVec2::new(44, 36),
                size: IVec2::splat(3),
                batteries: 0,
                panels: 0,
                working: true,
            }));
        village.lenses.choose(Some(MapLens::Water));
        let mut camera = VillageCamera {
            target: Vec3::ZERO,
            heading: 0.0,
            polar: 0.7,
        };
        village.focus_network_site(&setup, &mut camera, true);
        assert_eq!(village.lenses.network_site, Some(0));
        assert_eq!(village.construction.production.selected, None);
        village.focus_network_site(&setup, &mut camera, true);
        assert_eq!(village.lenses.network_site, Some(1));
        assert_eq!(village.construction.production.selected, Some(0));
    }

    #[test]
    fn clicking_a_roof_selects_the_building_that_owns_it() {
        let mut app = App::new();
        app.add_plugins((MinimalPlugins, TransformPlugin, AssetPlugin::default()))
            .init_asset::<Mesh>();
        let roof = Mesh::from(Cuboid::new(2.0, 1.0, 2.0));
        let bounds = bevy::camera::primitives::MeshAabb::compute_aabb(&roof).unwrap();
        let mesh = app.world_mut().resource_mut::<Assets<Mesh>>().add(roof);
        app.world_mut()
            .spawn((
                BuiltProject {
                    index: 7,
                    model: 0,
                    rooftop_solar: false,
                },
                Transform::default(),
            ))
            .with_child((
                Mesh3d(mesh),
                bounds,
                Visibility::default(),
                Transform::from_xyz(0.0, 3.0, 0.0),
            ));
        app.update();
        let picked = app
            .world_mut()
            .run_system_once(
                |mut raycast: MeshRayCast,
                 parents: Query<&ChildOf>,
                 built: Query<&BuiltProject>,
                 staged: Query<&construction_models::ConstructionModel>| {
                    let down = Ray3d::new(Vec3::new(0.0, 10.0, 0.0), Dir3::NEG_Y);
                    let miss = Ray3d::new(Vec3::new(5.0, 10.0, 0.0), Dir3::NEG_Y);
                    let tables = (&parents, &built, &staged);
                    (
                        building_hit(down, &mut raycast, tables, RayCastVisibility::Any),
                        building_hit(miss, &mut raycast, tables, RayCastVisibility::Any),
                    )
                },
            )
            .unwrap();
        assert_eq!(picked, (Some(7), None));
    }

    #[test]
    fn clicking_picks_the_nearest_resident_within_reach() {
        let cursor = Vec2::new(100.0, 100.0);
        let residents = [(0, Vec2::new(120.0, 100.0)), (3, Vec2::new(105.0, 98.0))];
        assert_eq!(nearest_resident(cursor, residents.into_iter()), Some(3));
        let far = [(1, Vec2::new(100.0, 100.0 + RESIDENT_PICK_RADIUS + 1.0))];
        assert_eq!(nearest_resident(cursor, far.into_iter()), None);
    }

    #[test]
    fn downtime_preview_starts_an_evening_village_without_save_access() {
        let mut app = App::new();
        start_downtime_preview(&mut app).unwrap();
        let world = app.world();
        let village = world.resource::<Village>();
        let menu = world.resource::<SaveMenu>();
        assert_eq!(village.camp, Some(CLEARING_CAMP));
        assert!(village.mode() == Some(Mode::Story));
        assert_eq!(crate::weather::game_minutes(village.clock), 1125);
        assert!(!village.stock.sandbox);
        assert!(menu.continue_path(Mode::Story).is_err());
        assert!(menu.directory(Mode::Story).is_err());
        save_session(menu, village, &Catalog::default()).unwrap();
    }

    #[test]
    fn dispatch_policy_accepts_exact_fill_and_half_hour_wait() {
        let catalog = Catalog::default();
        let stock = Stock::for_start(&WorldSetup::default(), &catalog);
        let mut construction = Construction::default();
        let clock = TownClock {
            seconds: 0.,
            round_trip_km: 12,
        };
        apply_numeric_entry(
            NumericTarget::MinimumLoad,
            "37",
            &mut construction,
            &catalog,
        );
        apply_numeric_entry(
            NumericTarget::DispatchWait,
            "3.5",
            &mut construction,
            &catalog,
        );
        assert!(
            construction
                .trade_status(&catalog, &stock, clock)
                .contains("Minimum load 37% · J Wait up to 3.5h")
        );
        apply_numeric_entry(
            NumericTarget::MinimumLoad,
            "999",
            &mut construction,
            &catalog,
        );
        apply_numeric_entry(
            NumericTarget::DispatchWait,
            "48",
            &mut construction,
            &catalog,
        );
        assert!(
            construction
                .trade_status(&catalog, &stock, clock)
                .contains("Minimum load 100% · J Wait up to 24.0h")
        );
    }

    #[test]
    fn unfocused_desktop_keeps_running_unless_the_village_is_paused() {
        let setup = WorldSetup::default().session();
        let catalog = Catalog::default();
        let stock = Stock::for_start(&setup, &catalog);
        let mut app = App::new();
        app.insert_resource(setup)
            .insert_resource(catalog)
            .init_resource::<Land>()
            .init_resource::<SaveMenu>()
            .insert_resource(Time::<Fixed>::from_hz(SIMULATION_HZ))
            .insert_resource(Village {
                camp: Some(IVec2::new(36, 36)),
                stock,
                ..default()
            })
            .add_systems(FixedUpdate, advance_clock);
        app.world_mut().spawn((
            Window {
                focused: false,
                ..default()
            },
            PrimaryWindow,
        ));
        app.world_mut()
            .resource_mut::<Time<Fixed>>()
            .advance_by(std::time::Duration::from_secs_f64(SIMULATION_STEP));

        app.world_mut().run_schedule(FixedUpdate);
        assert_eq!(app.world().resource::<Village>().clock, SIMULATION_STEP);

        app.world_mut().resource_mut::<Village>().paused = true;
        app.world_mut().run_schedule(FixedUpdate);
        assert_eq!(app.world().resource::<Village>().clock, SIMULATION_STEP);

        app.world_mut().resource_mut::<Village>().paused = false;
        app.world_mut().run_schedule(FixedUpdate);
        assert_eq!(
            app.world().resource::<Village>().clock,
            2.0 * SIMULATION_STEP
        );
    }

    #[test]
    fn opening_the_guide_pauses_story_arrival() {
        let mut app = App::new();
        app.insert_resource(WorldSetup::default().session())
            .init_resource::<Village>()
            .init_resource::<SaveMenu>()
            .init_resource::<Catalog>()
            .init_resource::<Time>()
            .add_systems(Update, animate_arrival);
        app.world_mut()
            .resource_mut::<Time>()
            .advance_by(std::time::Duration::from_secs(1));
        app.update();
        let arrived = app.world().resource::<Village>().arrival_time;
        assert_eq!(arrived, 1.0);

        app.world_mut().resource_mut::<Village>().guide.toggle();
        app.update();
        assert_eq!(app.world().resource::<Village>().arrival_time, arrived);

        app.world_mut().resource_mut::<Village>().guide.toggle();
        app.update();
        assert_eq!(app.world().resource::<Village>().arrival_time, 2.0);
    }

    #[test]
    fn continue_autosave_preserves_an_unreadable_existing_village() {
        let setup = WorldSetup::default().session();
        let catalog = Catalog::default();
        let mut village = Village {
            setup: Some(setup.clone()),
            stock: Stock::for_start(&setup, &catalog),
            ..default()
        };
        let path = std::env::temp_dir().join(format!(
            "solar-v3-continue-test-{}.json",
            std::process::id()
        ));
        save::write_continuation(&path, &village, None, &catalog).unwrap();
        village.clock = 12.0;
        save::write_continuation(&path, &village, None, &catalog).unwrap();
        assert_eq!(save::read(&path, &catalog).unwrap().clock, 12.0);

        let damaged = b"{\"version\":1,\"village\":";
        std::fs::write(&path, damaged).unwrap();
        assert!(save::write_continuation(&path, &village, None, &catalog).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), damaged);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn named_save_preserves_and_restores_previous_snapshot() {
        let setup = WorldSetup::default().session();
        let catalog = Catalog::default();
        let mut village = Village {
            setup: Some(setup.clone()),
            clock: 0.0,
            stock: Stock::for_start(&setup, &catalog),
            ..default()
        };
        let directory =
            std::env::temp_dir().join(format!("solar-v3-slot-test-{}", std::process::id()));
        let id = save_library::create(&directory, Mode::Story, "First village", &village).unwrap();
        village.clock = 120.0;
        save_library::autosave(&directory, id, Mode::Story, &village, &catalog).unwrap();
        save_library::rename(&directory, id, Mode::Story, "River camp").unwrap();
        let rows = save_library::list(&directory, Mode::Story).unwrap();
        assert_eq!(rows[0].name, "River camp");
        assert!(rows[0].recovery);
        assert_eq!(
            save_library::load(&directory, id, Mode::Story, &catalog)
                .unwrap()
                .clock,
            120.0
        );
        assert_eq!(
            save_library::recover(&directory, id, Mode::Story, &catalog, None)
                .unwrap()
                .clock,
            0.0
        );
        let exported = save_library::export(&directory, id, Mode::Story, |name| {
            Some(directory.join("exports").join(name))
        })
        .unwrap()
        .unwrap();
        assert_eq!(save::read(&exported, &catalog).unwrap().clock, 0.0);
        village.clock = 180.0;
        assert_eq!(
            save_library::recover(&directory, id, Mode::Story, &catalog, Some(&village))
                .unwrap()
                .clock,
            120.0
        );
        assert_eq!(
            save_library::recover(&directory, id, Mode::Story, &catalog, None)
                .unwrap()
                .clock,
            180.0
        );
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn waste_tank_navigation_cycles_channels_and_wraps_between_sites() {
        let setup = WorldSetup::default().session();
        let mut village = Village::default();
        let utilities = &mut village.construction.utilities;
        utilities.sync([1, 2].into_iter().map(|id| crate::utilities::Facility {
            id,
            kind: "eco_toilet",
            location: IVec2::new(40 + id as i32, 36),
            size: IVec2::ONE,
            batteries: 0,
            panels: 0,
            working: false,
        }));
        utilities.deliver_water(1, 2, 16.0);
        utilities.deliver_water(1, 3, 16.0);
        utilities.deliver_water(2, 3, 16.0);

        let mut camera = VillageCamera {
            target: Vec3::ZERO,
            heading: 0.0,
            polar: crate::default_camera_polar(),
        };
        for (id, channel) in [(1, 2), (1, 3), (2, 3), (1, 2)] {
            village.focus_next_waste_tank(&setup, &mut camera);
            assert_eq!(
                (village.water_panel.target, village.water_panel.channel),
                (id, channel)
            );
            let expected = world_position(40.0 + id as f32, 36.0);
            assert_eq!(Vec2::new(camera.target.x, camera.target.z), expected);
        }
    }

    #[test]
    fn closing_the_primary_window_saves_the_active_named_village() {
        let setup = WorldSetup::default().session();
        let catalog = Catalog::default();
        let mut village = Village {
            setup: Some(setup.clone()),
            stock: Stock::for_start(&setup, &catalog),
            ..default()
        };
        let directory =
            std::env::temp_dir().join(format!("solar-v3-close-save-test-{}", std::process::id()));
        let id = save_library::create(&directory, Mode::Story, "River camp", &village).unwrap();
        village.clock = 120.0;
        let mut app = App::new();
        app.insert_resource(village)
            .insert_resource(catalog)
            .insert_resource(SaveMenu {
                test_directory: Some(directory.clone()),
                attached: Some((Mode::Story, id, 0)),
                ..default()
            })
            .add_message::<WindowCloseRequested>()
            .add_systems(PreUpdate, save_on_window_close);
        let window = app.world_mut().spawn(PrimaryWindow).id();
        app.world_mut()
            .write_message(WindowCloseRequested { window });
        app.update();

        let menu = app.world().resource::<SaveMenu>();
        let catalog = app.world().resource::<Catalog>();
        let (restored, slot) = restore_continuation(menu, Mode::Story, catalog).unwrap();
        assert_eq!(slot, Some(id));
        assert_eq!(restored.clock, 120.0);
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn continue_reopens_the_named_slot_and_falls_back_if_it_is_removed() {
        let setup = WorldSetup::default().session();
        let catalog = Catalog::default();
        let mut village = Village {
            setup: Some(setup.clone()),
            stock: Stock::for_start(&setup, &catalog),
            session_serial: 7,
            ..default()
        };
        let directory = std::env::temp_dir().join(format!(
            "solar-v3-named-continue-test-{}",
            std::process::id()
        ));
        let id = save_library::create(&directory, Mode::Story, "River camp", &village).unwrap();
        let mut menu = SaveMenu {
            test_directory: Some(directory.clone()),
            attached: Some((Mode::Story, id, village.session_serial)),
            ..default()
        };
        write_continuation(&menu, Mode::Story, &village, &catalog).unwrap();
        village.clock = 120.0;
        save_active_village(&menu, &village, &catalog).unwrap();

        village.session_serial += 1;
        village.clock = 240.0;
        save_active_village(&menu, &village, &catalog).unwrap();
        menu.attached = None;
        let (restored, slot) = restore_continuation(&menu, Mode::Story, &catalog).unwrap();
        assert_eq!(slot, Some(id));
        assert_eq!(restored.clock, 120.0);

        save_library::remove(&directory, id).unwrap();
        let (restored, slot) = restore_continuation(&menu, Mode::Story, &catalog).unwrap();
        assert_eq!(slot, None);
        assert_eq!(restored.clock, 0.0);

        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn dropping_an_exported_snapshot_imports_an_independent_named_village() {
        let directory =
            std::env::temp_dir().join(format!("solar-v3-slot-import-test-{}", std::process::id()));
        let menu = SaveMenu {
            test_directory: Some(directory.clone()),
            ..default()
        };
        let catalog = Catalog::default();
        let mut setup = WorldSetup::default();
        setup.mode = Mode::Sandbox;
        let sandbox_directory = menu.directory(Mode::Sandbox).unwrap();
        let village = Village {
            setup: Some(setup.session()),
            stock: Stock::for_start(&setup, &catalog),
            speed: 1,
            ..default()
        };
        let original =
            save_library::create(&sandbox_directory, Mode::Sandbox, "River camp", &village)
                .unwrap();
        let export = save_library::export(&sandbox_directory, original, Mode::Sandbox, |name| {
            Some(sandbox_directory.join("exports").join(name))
        })
        .unwrap()
        .unwrap();
        use bevy::window::FileDragAndDrop;
        let mut app = App::new();
        app.add_message::<FileDragAndDrop>()
            .insert_resource(menu)
            .insert_resource(catalog)
            .add_systems(Update, library_ui::import_dropped_snapshot);
        let window = app.world_mut().spawn(PrimaryWindow).id();
        let drop = |app: &mut App, path_buf| {
            app.world_mut()
                .write_message(FileDragAndDrop::DroppedFile { window, path_buf });
            app.update();
        };

        drop(&mut app, export.clone());
        assert_eq!(
            save_library::list(&sandbox_directory, Mode::Sandbox)
                .unwrap()
                .len(),
            1
        );

        app.world_mut().resource_mut::<SaveMenu>().open = true;
        drop(&mut app, export);
        let menu = app.world().resource::<SaveMenu>();
        let catalog = app.world().resource::<Catalog>();
        let imported = menu.rows[menu.selected].id;
        assert_eq!(menu.rows[menu.selected].name, "River camp");
        assert!(menu.browse_mode == Mode::Sandbox);
        assert!(menu.status.contains("Imported a copy"));
        assert_ne!(original, imported);
        assert!(save_library::load(&sandbox_directory, imported, Mode::Sandbox, catalog).is_ok());
        assert_eq!(
            save_library::list(&sandbox_directory, Mode::Sandbox)
                .unwrap()
                .len(),
            2
        );
        let invalid = directory.join("invalid.json");
        std::fs::write(&invalid, b"{}").unwrap();
        drop(&mut app, invalid);
        let menu = app.world().resource::<SaveMenu>();
        assert!(menu.status.starts_with("Could not import village"));
        assert_eq!(menu.rows[menu.selected].id, imported);
        assert_eq!(menu.rows.len(), 2);
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn save_library_exports_unreadable_data_without_changing_the_slot() {
        let directory =
            std::env::temp_dir().join(format!("solar-v3-slot-export-test-{}", std::process::id()));
        std::fs::create_dir_all(&directory).unwrap();
        let slot = directory.join("slot-42.json");
        let payload = serde_json::json!({"futureVillageField": [1, 2]});
        let container = serde_json::json!({
            "version": save::VERSION,
            "id": 42,
            "name": "River camp",
            "mode": Mode::Story,
            "updated": 42,
            "current": payload,
            "previous": null
        });
        let bytes = serde_json::to_vec(&container).unwrap();
        std::fs::write(&slot, &bytes).unwrap();

        let catalog = Catalog::default();
        assert!(save_library::load(&directory, 42, Mode::Story, &catalog).is_err());
        assert_eq!(
            save_library::export(&directory, 42, Mode::Story, |_| None).unwrap(),
            None
        );
        assert!(save_library::export(&directory, 42, Mode::Story, |_| Some(slot.clone())).is_err());
        assert_eq!(std::fs::read(&slot).unwrap(), bytes);
        let exported = save_library::export(&directory, 42, Mode::Story, |name| {
            Some(directory.join("exports").join(name))
        })
        .unwrap()
        .unwrap();
        let data: serde_json::Value =
            serde_json::from_slice(&std::fs::read(exported).unwrap()).unwrap();
        assert_eq!(data["village"], payload);
        assert_eq!(std::fs::read(&slot).unwrap(), bytes);

        let truncated = br#"{"version":"#;
        std::fs::write(&slot, truncated).unwrap();
        let exported = save_library::export(&directory, 42, Mode::Story, |name| {
            Some(directory.join("exports").join(name))
        })
        .unwrap()
        .unwrap();
        assert!(exported.to_string_lossy().ends_with(".backup.json"));
        assert_eq!(std::fs::read(exported).unwrap(), truncated);
        assert_eq!(std::fs::read(slot).unwrap(), truncated);
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn exact_advance_matches_fixed_simulation_and_checkpoints_the_result() {
        let setup = WorldSetup::default().session();
        let catalog = Catalog::default();
        let camp = IVec2::new(36, 36);
        let opening = Village {
            setup: Some(setup.clone()),
            camp: Some(camp),
            clock: crate::weather::DAY - crate::weather::HOUR,
            arrival_time: ARRIVAL_DURATION,
            stock: Stock::for_start(&setup, &catalog),
            ..default()
        };
        let opening_save = serde_json::to_vec(&opening).unwrap();
        let mut app = App::new();
        app.insert_resource(setup.clone())
            .insert_resource(catalog)
            .init_resource::<Land>()
            .init_resource::<SaveMenu>()
            .insert_resource(opening)
            .add_systems(Update, advance_days);
        {
            let mut village = app.world_mut().resource_mut::<Village>();
            village.apply_advance_action(AdvanceAction::Toggle);
            village.apply_advance_action(AdvanceAction::Start);
        }

        let mut fixed: Village = serde_json::from_slice(&opening_save).unwrap();
        let terrain = fixed.terrain(&setup);
        let land = app.world().resource::<Land>();
        let catalog = app.world().resource::<Catalog>();
        let site = ConstructionSite {
            terrain: &terrain,
            land,
            camp,
        };
        let steps = (crate::weather::DAY / SIMULATION_STEP).round() as u64;
        for _ in 0..steps {
            step(&mut fixed, catalog, &setup, site, SIMULATION_STEP);
        }
        fixed.paused = true;

        for _ in 0..steps {
            if app.world().resource::<Village>().advance.running.is_none() {
                break;
            }
            app.update();
        }
        let advanced = app.world().resource::<Village>();
        assert!(advanced.advance_checkpoint);
        assert_eq!(advanced.clock, fixed.clock);
        assert!(serde_json::to_value(advanced).unwrap() == serde_json::to_value(fixed).unwrap());
    }

    #[test]
    fn fast_advance_finishes_construction_and_produces_a_loadable_village() {
        let setup = WorldSetup::default().session();
        let catalog = Catalog::default();
        let terrain = setup.terrain();
        let land = Land::default();
        let camp = IVec2::new(36, 36);
        let start = 8.0 * crate::weather::HOUR;
        let mut village = Village {
            setup: Some(setup.clone()),
            camp: Some(camp),
            clock: start,
            arrival_time: ARRIVAL_DURATION,
            stock: Stock::for_start(&setup, &catalog),
            ..default()
        };
        let mut keys = ButtonInput::default();
        keys.press(KeyCode::KeyB);
        keys.press(KeyCode::Digit1);
        village
            .construction
            .input(&keys, &catalog, village.stock.sandbox);
        village.construction.plan(
            &catalog,
            &mut village.stock,
            ConstructionSite {
                terrain: &terrain,
                land: &land,
                camp,
            },
            IVec2::new(44, 36),
            TownClock {
                seconds: start,
                round_trip_km: setup.round_trip_km(),
            },
        );
        assert_eq!(village.construction.finished_models(&catalog).count(), 0);
        village.apply_advance_action(AdvanceAction::Toggle);
        village.apply_advance_action(AdvanceAction::Fast);
        village.apply_advance_action(AdvanceAction::Adjust(1));
        village.apply_advance_action(AdvanceAction::Start);

        let mut app = App::new();
        app.insert_resource(setup)
            .insert_resource(catalog)
            .insert_resource(land)
            .init_resource::<SaveMenu>()
            .insert_resource(village)
            .add_systems(Update, advance_days);
        let mut updates = 0;
        while app.world().resource::<Village>().advance.running.is_some() {
            app.update();
            updates += 1;
            assert!(updates < 100_000, "fast advance did not finish");
        }

        let advanced = app.world().resource::<Village>();
        let catalog = app.world().resource::<Catalog>();
        assert!(advanced.advance_checkpoint && advanced.is_paused());
        assert!((advanced.clock - (start + 2.0 * crate::weather::DAY)).abs() < 1e-6);
        assert_eq!(advanced.construction.finished_models(catalog).count(), 1);
        let restored: Village =
            serde_json::from_slice(&serde_json::to_vec(advanced).unwrap()).unwrap();
        assert!(restored.valid_save(catalog));
        assert_eq!(restored.clock, advanced.clock);
    }

    #[test]
    fn stopping_a_partial_advance_checkpoints_the_paused_village() {
        let setup = WorldSetup::default().session();
        let catalog = Catalog::default();
        let stock = Stock::for_start(&setup, &catalog);
        let directory =
            std::env::temp_dir().join(format!("solar-v3-partial-advance-{}", std::process::id()));
        let mut village = Village {
            setup: Some(setup.clone()),
            camp: Some(IVec2::new(36, 36)),
            arrival_time: ARRIVAL_DURATION,
            stock,
            ..default()
        };
        village.apply_advance_action(AdvanceAction::Toggle);
        village.apply_advance_action(AdvanceAction::Start);
        let mut app = App::new();
        app.insert_resource(village)
            .insert_resource(setup)
            .insert_resource(catalog)
            .init_resource::<Land>()
            .init_resource::<Time<Real>>()
            .insert_resource(SaveMenu {
                test_directory: Some(directory.clone()),
                ..default()
            })
            .add_systems(Update, (advance_days, autosave_continue).chain());
        app.update();
        let elapsed = app.world().resource::<Village>().clock;
        assert!(elapsed > 0.0 && elapsed < crate::weather::DAY);
        app.world_mut()
            .resource_mut::<Village>()
            .apply_advance_action(AdvanceAction::Toggle);
        app.update();

        let (restored, _) = restore_continuation(
            app.world().resource::<SaveMenu>(),
            Mode::Story,
            app.world().resource::<Catalog>(),
        )
        .unwrap();
        assert!(restored.is_paused());
        assert!(restored.advance.running.is_none());
        assert_eq!(restored.clock, elapsed);
        assert_eq!(
            serde_json::to_value(restored).unwrap(),
            serde_json::to_value(app.world().resource::<Village>()).unwrap()
        );
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn water_policy_shortcut_yields_to_an_open_advance_dialog() {
        let mut village = Village {
            utility_panel: Some(UtilityPanel::Water),
            ..default()
        };
        let mut keys = ButtonInput::default();
        keys.press(KeyCode::KeyL);
        assert!(village.advance_keyboard_action(&keys).is_none());

        keys.press(KeyCode::AltLeft);
        let action = village.advance_keyboard_action(&keys).unwrap();
        village.apply_advance_action(action);
        assert!(village.advance.open);

        keys.reset_all();
        keys.press(KeyCode::KeyL);
        assert!(matches!(
            village.advance_keyboard_action(&keys),
            Some(AdvanceAction::Toggle)
        ));
    }

    #[test]
    fn advance_dialog_closes_planning_tools_and_preserves_pause_on_cancel() {
        let mut village = Village {
            utility_panel: Some(UtilityPanel::Projects),
            ..default()
        };
        let catalog = Catalog::default();
        let mut keys = ButtonInput::default();
        keys.press(KeyCode::KeyB);
        keys.press(KeyCode::Digit1);
        village
            .construction
            .input(&keys, &catalog, village.stock.sandbox);
        assert!(village.construction.placing_project());

        village.apply_advance_action(AdvanceAction::Toggle);
        assert!(village.is_paused());
        assert!(!village.construction.placing_project());
        assert!(!village.construction.menu);
        assert!(village.utility_panel.is_none());

        keys.reset_all();
        keys.press(KeyCode::Escape);
        let cancel = village.advance.keyboard_action(&keys).unwrap();
        village.apply_advance_action(cancel);
        assert!(!village.is_paused());

        village.apply_advance_action(AdvanceAction::Toggle);
        village.apply_advance_action(AdvanceAction::Start);
        village.apply_advance_action(AdvanceAction::Toggle);
        assert!(village.is_paused());
        assert!(village.advance_checkpoint);
    }

    #[test]
    fn selected_project_focus_centers_the_camera_and_respects_panels() {
        let mut setup = WorldSetup::default().session();
        setup.mode = Mode::Sandbox;
        let catalog = Catalog::default();
        let terrain = setup.terrain();
        let land = Land::generate(&setup);
        let camp = CAMP_SITES[2].1;
        let mut village = Village {
            setup: Some(setup.clone()),
            camp: Some(camp),
            stock: Stock::for_start(&setup, &catalog),
            ..default()
        };
        village
            .construction
            .lab_order(
                &catalog,
                &mut village.stock,
                ConstructionSite {
                    terrain: &terrain,
                    land: &land,
                    camp,
                },
                TownClock {
                    seconds: 0.0,
                    round_trip_km: 12,
                },
                &crate::construction::LabOrder::Build {
                    key: "home-cottage".into(),
                    x: 44,
                    z: 36,
                    rotation: 0,
                    size: None,
                },
                setup.richness(),
            )
            .unwrap();
        let point = village
            .construction
            .focus_project(&catalog, 0, 0, false, false)
            .unwrap();
        let mut camera = VillageCamera {
            target: Vec3::ZERO,
            heading: 0.4,
            polar: 0.7,
        };
        assert!(village.focus_selected_project(&setup, &mut camera));
        assert_eq!(
            camera.target,
            Vec3::new(point.x, terrain.height_at(point.x, point.y), point.y)
        );
        assert_eq!(camera.heading, 0.4);
        village.utility_panel = Some(UtilityPanel::Inventory);
        assert!(!village.focus_selected_project(&setup, &mut camera));
    }

    #[test]
    fn village_save_rejects_a_dispatch_wait_from_the_future() {
        let setup = WorldSetup::default().session();
        let catalog = Catalog::default();
        let village = Village {
            stock: Stock::for_start(&setup, &catalog),
            setup: Some(setup),
            clock: 100.0,
            ..default()
        };
        assert!(village.valid_save(&catalog));

        let mut snapshot = serde_json::to_value(village).unwrap();
        for (start, valid) in [(100.0, true), (101.0, false)] {
            snapshot["construction"]["logistics_policy"]["waiting_since"] = start.into();
            let restored: Village = serde_json::from_value(snapshot.clone()).unwrap();
            assert_eq!(restored.valid_save(&catalog), valid);
        }
    }

    #[test]
    fn save_resumes_a_village_during_a_material_delivery() {
        let setup = WorldSetup::default().session();
        let catalog = Catalog::default();
        let terrain = setup.terrain();
        let land = Land::default();
        let camp = IVec2::new(36, 36);
        let mut village = Village {
            setup: Some(setup.clone()),
            camp: Some(camp),
            clock: 0.0,
            arrival_time: ARRIVAL_DURATION,
            stock: Stock::for_start(&setup, &catalog),
            ..default()
        };

        let mut keys = ButtonInput::default();
        keys.press(KeyCode::KeyB);
        keys.press(KeyCode::Digit1);
        village
            .construction
            .input(&keys, &catalog, village.stock.sandbox);
        village.construction.plan(
            &catalog,
            &mut village.stock,
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
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp,
        };
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        for _ in 0..200 {
            village
                .construction
                .tick(&catalog, &mut village.stock, site, clock, 0.1, false);
        }

        let path =
            std::env::temp_dir().join(format!("solar-v3-save-test-{}.json", std::process::id()));
        save::write(&path, &village).unwrap();
        let mut resumed = save::read(&path, &catalog).unwrap();
        std::fs::remove_file(path).unwrap();

        for _ in 0..2_000 {
            village
                .construction
                .tick(&catalog, &mut village.stock, site, clock, 0.1, false);
            resumed
                .construction
                .tick(&catalog, &mut resumed.stock, site, clock, 0.1, false);
        }
        assert_eq!(
            serde_json::to_value(village).unwrap(),
            serde_json::to_value(resumed).unwrap()
        );
    }
}
