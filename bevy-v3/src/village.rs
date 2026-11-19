use crate::{audio::SoundSettings, utilities::NetworkView};
mod build_menu;
mod building_lighting;
mod building_preview;
mod construction_models;
mod cultivation_surface;
mod diagnostics;
mod fire;
mod guide;
pub(crate) mod lab;
mod land_lens;
mod lens_picker;
use lens_picker::{LensPicker, MapLens};
mod library_ui;
mod livestock_motion;
mod resource_lens;
mod resource_trends;
mod road_surface;
mod toolbar;
mod vehicle_motion;

use library_ui::{autosave_named, library_controls};

use bevy::{
    asset::{AssetPath, embedded_asset, embedded_path},
    gltf::GltfAssetLabel,
    picking::prelude::{MeshRayCast, MeshRayCastSettings},
    prelude::*,
    window::PrimaryWindow,
};
use serde::{Deserialize, Serialize};

use crate::{
    GroundMesh, VillageCamera,
    arrival::{
        ARRIVAL_DURATION, MAP_START, ROAD_END, resident_pose, road_center, road_width,
        town_vehicle_pose, vehicle_pose, world_position,
    },
    catalog::Catalog,
    construction::{Construction, ConstructionSite, TownClock, WaterAction},
    land::Land,
    resident_animation::{Motion, ResidentAnimation},
    save,
    save_library::{self, SaveMenu},
    setup::{Mode, WorldSetup},
    stock::Stock,
    terrain::{Terrain, TerrainEditor},
    time_advance::Advance,
    ui_font::ui_font,
    weather::{forecast, weather_at},
};

pub(crate) const SIMULATION_HZ: f64 = 10.0;

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

impl Plugin for VillagePlugin {
    fn build(&self, app: &mut App) {
        embedded_asset!(app, "opening.glb");
        register_building_models(app);
        road_surface::install(app);
        building_preview::install(app);
        build_menu::install(app);
        toolbar::install(app);
        guide::install(app);
        library_ui::install(app);
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
            .add_systems(
                Update,
                (
                    save_controls,
                    library_controls,
                    read_camp_pointer,
                    village_input,
                    crate::camera_controls,
                    advance_days,
                    animate_arrival,
                    draw_blueprints,
                    show_hud,
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
            && (1.0 / 6.0..=1.0 / 0.18).contains(&self.zoom)
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
    show_forecast: bool,
    #[serde(skip)]
    advance: Advance,
    #[serde(skip)]
    utility_panel: Option<UtilityPanel>,
    #[serde(skip)]
    selected_resident: usize,
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
    inventory_equipment: bool,
    #[serde(skip)]
    inventory_search: String,
    #[serde(skip)]
    editing_inventory: bool,
    #[serde(skip)]
    projects_page: usize,
    #[serde(skip)]
    guide: guide::Guide,
    #[serde(skip)]
    lenses: LensPicker,
    #[serde(skip)]
    show_grid: bool,
    #[serde(skip)]
    open_projects_only: bool,
    #[serde(skip)]
    housing_notice: String,
    #[serde(skip)]
    camp_error: Option<&'static str>,
    #[serde(skip)]
    save_notice: String,
    #[serde(skip)]
    rebuild_scene: bool,
    #[serde(skip)]
    session_serial: u64,
    #[serde(default)]
    terrain_editor: TerrainEditor,
    #[serde(skip)]
    water_panel: WaterControls,
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
}

impl Village {
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

    pub fn mode(&self) -> Option<Mode> {
        self.setup.as_ref().map(|setup| setup.mode)
    }

    pub fn seconds(&self) -> f64 {
        self.clock
    }

    pub fn map_input_blocked(&self) -> bool {
        self.guide.open()
            || self.lenses.open
            || self.construction.editing_search
            || self.editing_inventory
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
        }
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
        ) {
            let terrain = self.terrain(setup);
            camera.target = Vec3::new(point.x, terrain.height_at(point.x, point.y), point.y);
            self.utility_panel = None;
        }
    }

    fn toggle_inventory_view(&mut self) {
        self.inventory_equipment = !self.inventory_equipment;
        self.inventory_search.clear();
        self.inventory_page = 0;
    }

    fn change_panel_page(&mut self, catalog: &Catalog, land: &Land, forward: bool) {
        let (pages, page) = match self.utility_panel {
            Some(UtilityPanel::Pantry) => {
                let Some(page) = &mut self.pantry_batch_page else {
                    return;
                };
                let pages = self.stock.pantry.batches(catalog, *page).0;
                *page = (*page).min(pages - 1);
                (pages, page)
            }
            Some(UtilityPanel::Finances) if self.finance_history_open => (
                self.stock.finance_history(self.finance_history_page).0,
                &mut self.finance_history_page,
            ),
            Some(UtilityPanel::Projects) => (
                self.construction
                    .projects_panel(catalog, self.projects_page, self.open_projects_only)
                    .0,
                &mut self.projects_page,
            ),
            Some(UtilityPanel::Inventory) => (
                self.construction
                    .inventory_panel(
                        catalog,
                        &self.stock,
                        land,
                        self.inventory_page,
                        self.inventory_equipment,
                        &self.inventory_search,
                    )
                    .0,
                &mut self.inventory_page,
            ),
            Some(UtilityPanel::Events) => (
                self.construction.event_log(self.event_page, "F8 Close").0,
                &mut self.event_page,
            ),
            _ => return,
        };
        *page = (*page + if forward { 1 } else { pages - 1 }) % pages;
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

    fn checkpoint_advance(&mut self) {
        self.paused = true;
        self.advance_checkpoint = true;
    }

    fn planning_pause(&self) -> bool {
        self.utility_panel.is_some()
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

    pub fn motion(&self, index: usize) -> Motion {
        if self.camp.is_some() {
            return self.construction.resident_motion(index);
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
    if !window.focused || saves.open {
        return;
    }
    let resume = setup.open
        && village.setup.is_none()
        && buttons.iter().any(|(interaction, action)| {
            *interaction == Interaction::Pressed && matches!(action, crate::setup::Action::Continue)
        });
    if resume || keyboard.just_pressed(KeyCode::F9) {
        let path = if resume {
            save::autosave_location(setup.mode)
        } else {
            save::location(setup.mode)
        };
        match path.and_then(|path| save::read(&path, &catalog)) {
            Ok(mut loaded) => {
                *setup = loaded.setup.as_ref().expect("validated setup").session();
                loaded.save_notice = "Village loaded.".into();
                loaded.rebuild_scene = true;
                loaded.session_serial = village.session_serial.wrapping_add(1);
                saves.attached = None;
                *village = loaded;
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

fn autosave_continue(
    time: Res<Time<Real>>,
    setup: Res<WorldSetup>,
    saves: Res<SaveMenu>,
    mut village: ResMut<Village>,
    mut next: Local<f64>,
) {
    let now = time.elapsed_secs_f64();
    if setup.open || saves.open || village.camp.is_none() || village.advance.running.is_some() {
        return;
    }
    if !village.advance_checkpoint && now < next.max(10.0) {
        return;
    }
    village.advance_checkpoint = false;
    *next = now + 10.0;
    let Some(mode) = village.mode() else { return };
    if let Err(error) = saves
        .continue_path(mode)
        .and_then(|path| save::write(&path, &village))
    {
        village.save_notice = format!("Could not autosave village: {error}");
    }
}

#[derive(Component)]
struct VillageEntity;

#[derive(Component)]
struct VillageHud;

#[derive(Component)]
struct BuiltProject {
    index: usize,
    rooftop_solar: bool,
}

#[derive(Component)]
enum ArrivalActor {
    Resident(usize),
    Car(usize),
}

fn opening_model(assets: &AssetServer, index: usize) -> SceneRoot {
    let path = AssetPath::from_path_buf(embedded_path!("opening.glb")).with_source("embedded");
    SceneRoot(assets.load(path.with_label(GltfAssetLabel::Scene(index).to_string())))
}

fn spawn_hud(mut commands: Commands, assets: Res<AssetServer>) {
    commands.spawn((
        VillageHud,
        Interaction::None,
        bevy::ui::FocusPolicy::Block,
        Text::default(),
        ui_font(&assets, 17.0),
        Node {
            display: Display::None,
            position_type: PositionType::Absolute,
            top: px(20),
            left: px(20),
            padding: UiRect::all(px(14)),
            ..default()
        },
        BackgroundColor(Color::srgb_u8(31, 45, 35)),
    ));
}

#[derive(Resource, Default)]
struct CampPointer {
    preset: Option<IVec2>,
    clicked: Option<GroundHit>,
    hovered: Option<GroundHit>,
}

#[derive(Resource, Default, PartialEq)]
struct MapNotice(Option<String>);

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
    ground: Query<(), With<GroundMesh>>,
    ui: Query<&Interaction>,
    mut raycast: MeshRayCast,
    (mut input, mut pointer): (Local<Option<Vec2>>, ResMut<CampPointer>),
) {
    pointer.preset = None;
    pointer.clicked = None;
    pointer.hovered = None;
    if !window.focused
        || setup.open
        || village.map_input_blocked()
        || village.arrival_time < ARRIVAL_DURATION
        || crate::pointer_over_ui(&ui)
    {
        *input = None;
        return;
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
    let Ok(ray) = camera.viewport_to_world(transform, cursor) else {
        return;
    };
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
    }
}

const CAMP_OFFSET: IVec2 = IVec2::new(-1, -3);
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

    if village.guide.controls(&keyboard) {
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
        village.show_forecast = !village.show_forecast;
    }
    if keyboard.just_pressed(KeyCode::Space)
        && village.camp.is_some()
        && !village.terrain_editor.open
    {
        village.paused = !village.paused;
    }
    if village.camp.is_some()
        && !village.terrain_editor.open
        && keyboard.get_just_pressed().len() > 0
        && village.advance.controls(&keyboard)
    {
        village.checkpoint_advance();
        return;
    }
    if village.advance.open {
        return;
    }
    let terrain = village.terrain(&setup);
    if let Some(cell) = village.camp {
        let town = &mut *village;
        town.terrain_editor.controls(&keyboard);
        if town.terrain_editor.open {
            if let Some(hit) = pointer.clicked {
                town.terrain_editor.stroke(&terrain, hit.world, |cell| {
                    town.construction.protects_terrain(cell)
                });
            }
            return;
        }
        if keyboard.just_pressed(KeyCode::KeyH) && !town.stock.sandbox {
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
                Some(UtilityPanel::Pantry) => Some(UtilityPanel::Finances),
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
            if keyboard.just_pressed(KeyCode::KeyT) {
                town.construction.toggle_shift(town.selected_resident);
            }
            if keyboard.just_pressed(KeyCode::KeyY) {
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
            town.construction.kitchen_controls(&keyboard);
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
        if keyboard.just_pressed(KeyCode::F11) {
            town.utility_panel = if town.utility_panel == Some(UtilityPanel::Projects) {
                None
            } else {
                Some(UtilityPanel::Projects)
            };
            town.projects_page = 0;
        }
        if town.utility_panel == Some(UtilityPanel::Projects) {
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
        if keyboard.just_pressed(KeyCode::F10) {
            town.utility_panel = if town.utility_panel == Some(UtilityPanel::Inventory) {
                None
            } else {
                Some(UtilityPanel::Inventory)
            };
            town.inventory_page = 0;
        }
        if town.utility_panel == Some(UtilityPanel::Inventory) {
            if keyboard.just_pressed(KeyCode::Tab) {
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
                Some(UtilityPanel::Upkeep)
            };
        }
        if town.utility_panel == Some(UtilityPanel::Upkeep) {
            if let Some(hit) = pointer.clicked {
                town.construction.select_facility(hit.cell);
            }
            town.construction.upkeep_input(&keyboard);
            return;
        }
        if keyboard.just_pressed(KeyCode::KeyV) {
            town.utility_panel = if town.utility_panel == Some(UtilityPanel::Water) {
                None
            } else {
                Some(UtilityPanel::Water)
            };
        }
        if town.utility_panel == Some(UtilityPanel::Water) {
            town.water_panel
                .input(&keyboard, pointer.clicked, &mut town.construction);
            return;
        }
        if keyboard.just_pressed(KeyCode::KeyO) && town.utility_panel == Some(UtilityPanel::Power) {
            town.construction.utilities.grid_off = !town.construction.utilities.grid_off;
        }
        if keyboard.just_pressed(KeyCode::KeyJ)
            && let Some(index) = town.construction.production.selected
        {
            town.construction.utilities.toggle(index);
        }
        if keyboard.just_pressed(KeyCode::KeyL)
            && let Some(index) = town.construction.production.selected
        {
            town.construction.utilities.toggle_cooling(index);
        }
        if town.utility_panel == Some(UtilityPanel::Residents) {
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
        if !town.stock.sandbox && keyboard.just_pressed(KeyCode::KeyU) {
            town.construction.toggle_auto_buy();
        }
        if keyboard.get_just_pressed().len() > 0 {
            town.construction.input(&keyboard, &catalog);
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
    village.camp_error = None;
    village.camp = Some(cell);
    let clock = village.clock;
    village.stock.update_finance_clock(clock);
    village
        .construction
        .record_event(clock, "Camp is ready.".into());
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
    time: Res<Time>,
    setup: Res<WorldSetup>,
    mut village: ResMut<Village>,
    mut actors: Query<(&ArrivalActor, &mut Transform, &mut Visibility)>,
    mut tents: Query<&mut Visibility, (With<VillageEntity>, Without<ArrivalActor>)>,
) {
    if setup.open {
        return;
    }
    if village.arrival_time >= ARRIVAL_DURATION && !setup.is_changed() && !village.is_changed() {
        return;
    }
    if village.arrival_time < ARRIVAL_DURATION {
        village.arrival_time = (village.arrival_time + time.delta_secs()).min(ARRIVAL_DURATION);
    }
    let terrain = village.terrain(&setup);
    for (actor, mut transform, mut visibility) in &mut actors {
        let pose = match *actor {
            ArrivalActor::Resident(index) if village.camp.is_some() => {
                let worker = village.construction.worker(index);
                crate::arrival::Pose {
                    position: world_position(worker.position.x, worker.position.y),
                    yaw: worker.yaw,
                    step_height: 0.0,
                    visible: !village.construction.driver_away(index)
                        && !village.construction.resident_sleeping(index)
                        && !village.construction.away_for_work(index),
                }
            }
            ArrivalActor::Resident(index) => resident_pose(village.arrival_time, index),
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
    for mut visibility in &mut tents {
        *visibility = Visibility::Inherited;
    }
}

fn advance_clock(
    time: Res<Time<Fixed>>,
    setup: Res<WorldSetup>,
    mut village: ResMut<Village>,
    (catalog, land, saves): (Res<Catalog>, Res<Land>, Res<SaveMenu>),
) {
    if setup.open || saves.open || village.is_paused() {
        return;
    }
    let Some(camp) = village.camp else { return };
    let terrain = village.terrain(&setup);
    let site = ConstructionSite {
        terrain: &terrain,
        land: &land,
        camp,
    };
    let mut budget = UNAVAILABLE_SPEED;
    let started = std::time::Instant::now();
    loop {
        let cost = UNAVAILABLE_SPEED / village.effective_speed();
        if budget < cost {
            break;
        }
        budget -= cost;
        step(&mut village, &catalog, &setup, site, time.delta_secs_f64());
        if started.elapsed() >= LIVE_STEP_BUDGET {
            break;
        }
    }
}

fn advance_days(
    setup: Res<WorldSetup>,
    mut village: ResMut<Village>,
    (catalog, land, saves): (Res<Catalog>, Res<Land>, Res<SaveMenu>),
) {
    if setup.open || saves.open || village.advance.running.is_none() {
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
    let started = std::time::Instant::now();
    loop {
        step(&mut village, &catalog, &setup, site, run.dt);
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

fn show_hud(
    setup: Res<WorldSetup>,
    village: Res<Village>,
    mut hud: Single<(&mut Text, &mut Node), With<VillageHud>>,
    (catalog, land, saves): (Res<Catalog>, Res<Land>, Res<SaveMenu>),
    (placement, sound): (Res<MapNotice>, Res<SoundSettings>),
    mut resource_trends: Local<resource_trends::ResourceTrends>,
) {
    if !saves.is_changed()
        && !setup.is_changed()
        && !village.is_changed()
        && !placement.is_changed()
        && !sound.is_changed()
    {
        return;
    }
    let utilities = &village.construction.utilities;
    let savings = village.stock.balance() as f64 / 100.0;
    let food = village.stock.food_portions();
    let energy = utilities.stored_energy();
    let water = utilities.stored_drinking_water();
    let rates = if !setup.open && village.camp.is_some() {
        resource_trends.sample(
            village.session_serial,
            village.clock,
            [savings, f64::from(food), energy, water],
        )
    } else {
        None
    };
    let rate = |index, unit| resource_trends::hourly_rate(rates.map(|rates| rates[index]), unit);
    let (text, node) = &mut *hud;
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
    node.display = Display::Flex;
    node.top = px(20);
    node.bottom = Val::Auto;
    if village.trade_open()
        || (village.utility_panel.is_none() && village.construction.production.open)
    {
        node.right = px(toolbar::PANEL_WIDTH + 40.0);
    }
    if let Some(page) = village.guide.text().or_else(|| village.lenses.text()) {
        text.0 = page;
        return;
    }
    let minute = (540.0 + village.clock * 0.45) as u64;
    let hour = minute / 60 % 24;
    let day = minute / 1440 + 1;
    let controls = if village.arrival_time < ARRIVAL_DURATION {
        "Arriving at the village".into()
    } else if village.camp.is_none() {
        village
            .camp_error
            .unwrap_or("Click to choose camp · 1 Shade · 2 Entrance · 3 Clearing")
            .into()
    } else if village.paused && !village.construction.menu {
        "B Build · Space Resume".into()
    } else {
        village
            .construction
            .instructions(&catalog, village.stock.sandbox)
    };
    let speed = if village.planning_pause() {
        "Paused".into()
    } else {
        village.speed_label()
    };
    let stock = if village.stock.sandbox {
        format!(
            "Sandbox · I {}\nWater {water:.0} L ({})",
            village.construction.sandbox_status(),
            rate(3, ""),
        )
    } else {
        format!(
            "R${savings:.2} ({}) · Food {food} portions ({}) · {} timber\nBattery {energy:.1} kWh ({}) · Water {water:.0} L ({}) · U {}",
            rate(0, "R$"),
            rate(1, ""),
            village.stock.available("wood"),
            rate(2, ""),
            rate(3, ""),
            village.construction.auto_buy_status(),
        )
    };
    let mut label = format!(
        "Day {day}   {hour:02}:{:02}   {speed}\n{stock}\n{controls}",
        minute % 60
    );
    if let Some(notice) = &placement.0 {
        label.push('\n');
        label.push_str(notice);
    }
    let weather = weather_at(village.clock, setup.biome(), setup.seed());
    label.push('\n');
    label.push_str(&weather.summary());
    label.push_str(" · F Forecast · F1 Guide · Shift+F1 Sound");
    if village.show_forecast {
        label.push('\n');
        label.push_str(&forecast(village.clock, setup.biome(), setup.seed()));
    }
    if village.camp.is_some() {
        label.push('\n');
        label.push_str(&village.advance.status());
        if village.advance.open && village.advance.running.is_none() {
            label.push_str(&village.construction.advance_milestones(
                &catalog,
                &setup,
                village.clock,
                village.advance.days,
            ));
        }
    }
    if village.terrain_editor.open {
        label.push('\n');
        label.push_str(&village.terrain_editor.label());
    }
    if village.camp.is_some()
        && !village.stock.sandbox
        && let Some(status) = village.construction.opening_milestones_status(&catalog)
    {
        label.push('\n');
        label.push_str(&status);
    }
    if let Some(progress) = village.construction.latest_progress(&catalog) {
        label.push('\n');
        label.push_str(&progress);
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
    if village.camp.is_some() {
        label.push_str(
            "\nP Power · V Water · N Residents · H Finances · F4 Terrain · F7 Maintenance · F8 Events · F10 Stores · F11 Projects · Shift+L Map lenses · Shift+G Grid",
        );
    }
    if village.camp.is_some()
        && village.utility_panel.is_none()
        && !village.construction.menu
        && !village.advance.open
        && !village.terrain_editor.open
    {
        label.push('\n');
        label.push_str(
            &village
                .construction
                .basic_needs_overview(&village.stock, weather.temperature),
        );
    }
    match village.utility_panel {
        Some(UtilityPanel::Power) => {
            label.push('\n');
            label.push_str(&village.construction.utilities.power_summary());
        }
        Some(UtilityPanel::Projects) => {
            label.push('\n');
            label.push_str(
                &village
                    .construction
                    .projects_panel(&catalog, village.projects_page, village.open_projects_only)
                    .1,
            );
            if let Some(freight) = village
                .construction
                .construction_freight_status(village.clock)
            {
                label.push('\n');
                label.push_str(&freight);
            }
        }
        Some(UtilityPanel::Inventory) => {
            use std::fmt::Write;
            let cursor = if village.editing_inventory {
                "▏ · Enter Done"
            } else {
                " · / Search"
            };
            let _ = write!(
                label,
                "\nFind material · {}{cursor}",
                village.inventory_search
            );
            label.push('\n');
            label.push_str(
                &village
                    .construction
                    .inventory_panel(
                        &catalog,
                        &village.stock,
                        &land,
                        village.inventory_page,
                        village.inventory_equipment,
                        &village.inventory_search,
                    )
                    .1,
            );
            label.push('\n');
            label.push_str(&village.stock.processing_summary(&catalog));
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
            label.push_str(&village.construction.upkeep_status(&catalog));
        }
        Some(UtilityPanel::Water) => {
            label.push('\n');
            label.push_str(&village.construction.utilities.water_summary());
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
            label.push('\n');
            label.push_str("1–5 Select resident · Click home · T Assign · Y Clear\n");
            if !village.housing_notice.is_empty() {
                label.push_str(&village.housing_notice);
                label.push('\n');
            }
            label.push_str(&village.construction.resident_status(
                &catalog,
                &village.stock,
                village.selected_resident,
            ));
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
            } else {
                label.push_str(
                    &village
                        .construction
                        .finance_summary(&village.stock, village.selected_resident),
                );
                label.push('\n');
                label.push_str(&village.construction.replacement_costs(
                    &catalog,
                    &village.stock,
                    &land,
                ));
                label.push('\n');
                label.push_str(&village.construction.expansion_reserve_label());
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
            label.push_str(
                &village
                    .stock
                    .pantry
                    .batches(&catalog, village.pantry_batch_page.unwrap_or_default())
                    .1,
            );
            label.push_str("\nTab Finances");
        }
        Some(UtilityPanel::Pantry) => {
            label.push('\n');
            label.push_str(&village.stock.pantry.status(
                &catalog,
                village.construction.utilities.powered_cold_storage(),
            ));
            label.push('\n');
            label.push_str(
                &village
                    .construction
                    .trade
                    .pantry_purchase_status(&village.stock, village.clock),
            );
            label.push('\n');
            label.push_str(&village.construction.production.kitchen_policy.status());
            label.push_str("\nR Food batches · Tab Finances");
        }
        None => {}
    }
    if let Some(production) =
        village
            .construction
            .selected_production(&catalog, &village.stock, village.clock)
    {
        label.push('\n');
        label.push_str(&production);
    }
    if let Some(status) = village
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
    if let Some(farm) = village
        .construction
        .farm_status(&catalog, &village.stock, village.clock)
    {
        label.push('\n');
        label.push_str(&farm);
    }
    if let Some(index) = village.construction.production.selected
        && let Some(service) = village.construction.utilities.facility_status(index)
    {
        label.push('\n');
        label.push_str(&service);
    }
    if !village.save_notice.is_empty() {
        label.push('\n');
        label.push_str(&village.save_notice);
    }
    if text.0 != label {
        text.0 = label;
    }
}

fn draw_blueprints(
    setup: Res<WorldSetup>,
    village: Res<Village>,
    (catalog, land): (Res<Catalog>, Res<Land>),
    pointer: Res<CampPointer>,
    keyboard: Res<ButtonInput<KeyCode>>,
    mut gizmos: Gizmos,
    (mut map_notice, mut land_lens, mut grid): (
        ResMut<MapNotice>,
        Local<land_lens::LandLens>,
        Local<crate::terrain::TerrainGrid>,
    ),
) {
    let mut notice = None;
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
        if network_lens.is_none()
            && matches!(
                village.utility_panel,
                Some(UtilityPanel::Power | UtilityPanel::Water)
            )
        {
            village.construction.utilities.draw_network(
                &terrain,
                if village.utility_panel == Some(UtilityPanel::Power) {
                    NetworkView::Power
                } else {
                    NetworkView::Water
                },
                &mut gizmos,
            );
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
                            (&village.stock, &land),
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
            Some(MapLens::Residents) => Some(village.construction.draw_residents_lens(
                &catalog,
                &terrain,
                pointer.hovered.map(|hit| hit.world),
                &mut gizmos,
            )),
            Some(MapLens::Work) => Some(village.construction.draw_work_lens(
                &catalog,
                &terrain,
                pointer.hovered.map(|hit| hit.cell),
                &mut gizmos,
            )),
            Some(MapLens::Construction) => construction_notice,
            Some(MapLens::Power | MapLens::Water | MapLens::Sanitation) | None => {
                network_lens.map(|view| {
                    village.construction.utilities.draw_lens(
                        &terrain,
                        view,
                        (
                            pointer.hovered.map(|hit| hit.cell),
                            village.lenses.network_site,
                        ),
                        &mut gizmos,
                    )
                })
            }
        };
        if let Some(hit) = pointer.hovered {
            if village.terrain_editor.open {
                village
                    .terrain_editor
                    .draw_preview(&terrain, hit.world, &mut gizmos);
            } else if village.planning_roads() {
                let extend = village.extend_road(&keyboard);
                village
                    .construction
                    .draw_road_route(&terrain, hit.cell, extend, &mut gizmos);
            } else if village.construction.placing_project() {
                notice = village.construction.draw_project_site(
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
                );
            }
        }
    }
    if !setup.open
        && village.camp.is_none()
        && let Some(hit) = pointer.hovered
    {
        let terrain = village.terrain(&setup);
        let issue = camp_placement_error(&terrain, &land, hit.cell, false);
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
    }
    map_notice.set_if_neq(MapNotice(notice));
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
            .any(|(index, _, _, _)| *index == shown.index)
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
            .find(|(_, view, _)| view.index == project)
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
            save_library::recover(&directory, id, Mode::Story, &catalog)
                .unwrap()
                .clock,
            0.0
        );
        let exported = save_library::export(&directory, id, Mode::Story, &catalog).unwrap();
        assert_eq!(save::read(&exported, &catalog).unwrap().clock, 0.0);
        std::fs::remove_dir_all(directory).unwrap();
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
        village.construction.input(&keys, &catalog);
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
