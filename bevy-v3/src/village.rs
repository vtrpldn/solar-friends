use crate::utilities::NetworkView;
mod cultivation_surface;
mod guide;
mod land_lens;
mod lens_picker;
use lens_picker::{LensPicker, MapLens};
mod library_ui;
mod resource_lens;
mod road_surface;

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

const SPEEDS: [(KeyCode, u8); 4] = [
    (KeyCode::Digit1, 1),
    (KeyCode::Digit2, 4),
    (KeyCode::Digit3, 8),
    (KeyCode::Digit4, 16),
];
const NAMES: [&str; 5] = ["Iara", "Bento", "Luz", "Cauã", "Nina"];
const CAMP_SITES: [(KeyCode, IVec2); 3] = [
    (KeyCode::Digit1, IVec2::new(28, 31)),
    (KeyCode::Digit2, IVec2::new(33, -9)),
    (KeyCode::Digit3, IVec2::new(36, 36)),
];

pub struct VillagePlugin;

impl Plugin for VillagePlugin {
    fn build(&self, app: &mut App) {
        embedded_asset!(app, "opening.glb");
        embedded_asset!(app, "buildings.glb");
        road_surface::install(app);
        app.add_systems(PostUpdate, cultivation_surface::show_beds);
        app.init_resource::<Village>()
            .init_resource::<CampPointer>()
            .init_resource::<MapNotice>()
            .init_resource::<Catalog>()
            .init_resource::<SaveMenu>()
            .insert_resource(Time::<Fixed>::from_hz(10.0))
            .add_systems(Startup, spawn_hud)
            .add_systems(
                Update,
                (
                    save_controls,
                    library_controls,
                    read_camp_pointer,
                    village_input,
                    advance_days,
                    animate_arrival,
                    draw_blueprints,
                    show_hud,
                    show_construction,
                )
                    .chain(),
            )
            .add_systems(Update, autosave_named)
            .add_systems(FixedUpdate, advance_clock);
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
    event_page: usize,
    #[serde(skip)]
    inventory_page: usize,
    #[serde(skip)]
    projects_page: usize,
    #[serde(skip)]
    guide: guide::Guide,
    #[serde(skip)]
    lenses: LensPicker,
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

impl WaterControls {
    fn input(
        &mut self,
        keyboard: &ButtonInput<KeyCode>,
        hit: Option<GroundHit>,
        construction: &mut Construction,
    ) {
        let shift = keyboard.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]);
        if let Some(id) = hit.and_then(|hit| construction.utilities.water_at(hit.cell)) {
            if shift {
                self.source = Some(id);
            } else {
                self.target = id;
            }
            self.message.clear();
        }
        if keyboard.just_pressed(KeyCode::KeyC) {
            if shift {
                self.source = Some(0);
            } else {
                self.target = 0;
            }
            self.message.clear();
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
        if keyboard.any_just_pressed([KeyCode::KeyM, KeyCode::KeyL]) {
            self.message = if construction
                .utilities
                .toggle_water_policy(self.target, keyboard.just_pressed(KeyCode::KeyM))
            {
                "Water policy updated."
            } else {
                "This facility does not support that water policy."
            }
            .into();
            return;
        }
        let action = if keyboard.just_pressed(KeyCode::KeyR) {
            WaterAction::Carry {
                source: None,
                channel: 1,
            }
        } else if keyboard.just_pressed(KeyCode::KeyT) {
            let Some(source) = self.source else {
                self.message = "Shift-click a water source first.".into();
                return;
            };
            WaterAction::Carry {
                source: Some(source),
                channel: self.channel,
            }
        } else if keyboard.just_pressed(KeyCode::KeyY) {
            WaterAction::Purify
        } else if keyboard.just_pressed(KeyCode::KeyK) {
            WaterAction::Sanitation
        } else {
            return;
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

    pub fn mode(&self) -> Option<Mode> {
        self.setup.as_ref().map(|setup| setup.mode)
    }

    pub fn seconds(&self) -> f64 {
        self.clock
    }

    pub fn map_input_blocked(&self) -> bool {
        self.guide.open() || self.lenses.open
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

    pub fn is_paused(&self) -> bool {
        self.paused || self.advance.open || self.terrain_editor.open || self.planning_roads()
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

    pub fn valid_save(&self, catalog: &Catalog) -> bool {
        let Some(setup) = &self.setup else {
            return false;
        };
        if !setup.valid_save()
            || !(0.0..=ARRIVAL_DURATION).contains(&self.arrival_time)
            || self.stock.sandbox != (setup.mode == Mode::Sandbox)
            || self.speed >= SPEEDS.len()
            || self.clock < 0.0
            || !self.clock.is_finite()
            || !self.stock.valid_food()
            || !self.stock.valid_cash_flow()
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
                .gathering
                .valid_save(&Land::generate(setup))
    }
}

fn save_controls(
    keyboard: Res<ButtonInput<KeyCode>>,
    window: Single<&Window, With<PrimaryWindow>>,
    catalog: Res<Catalog>,
    mut setup: ResMut<WorldSetup>,
    mut village: ResMut<Village>,
    mut saves: ResMut<SaveMenu>,
) {
    if !window.focused || saves.open {
        return;
    }
    if keyboard.just_pressed(KeyCode::F9) {
        match save::location(setup.mode).and_then(|path| save::read(&path, &catalog)) {
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
        village.save_notice =
            match save::location(setup.mode).and_then(|path| save::write(&path, &village)) {
                Ok(()) => "Village saved.".into(),
                Err(error) => format!("Could not save village: {error}"),
            };
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
    mut raycast: MeshRayCast,
    mut input: Local<Option<Vec2>>,
    mut pointer: ResMut<CampPointer>,
) {
    pointer.clicked = None;
    pointer.hovered = None;
    if !window.focused
        || setup.open
        || village.map_input_blocked()
        || village.arrival_time < ARRIVAL_DURATION
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

fn custom_camp_error(terrain: &crate::terrain::Terrain, cell: IVec2) -> Option<&'static str> {
    if !(-28..=90).contains(&cell.x) || !(-26..=91).contains(&cell.y) {
        return Some("Keep the tents inside the plot.");
    }
    for column in cell.x - 1..=cell.x + 3 {
        for row in cell.y - 3..=cell.y {
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
    setup: Res<WorldSetup>,
    (keyboard, pointer, saves): (Res<ButtonInput<KeyCode>>, Res<CampPointer>, Res<SaveMenu>),
    mut village: ResMut<Village>,
    mut camera: Single<&mut VillageCamera>,
    entities: Query<Entity, With<VillageEntity>>,
    (assets, catalog, land): (Res<AssetServer>, Res<Catalog>, Res<Land>),
) {
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
    let new_world = village.setup.as_ref() != Some(&setup.session());
    if new_world || village.rebuild_scene {
        for entity in &entities {
            commands.entity(entity).despawn();
        }
        if new_world {
            *village = Village {
                session_serial: village.session_serial.wrapping_add(1),
                setup: Some(setup.session()),
                stock: Stock::for_start(&setup, &catalog),
                ..default()
            };
        }
        village.rebuild_scene = false;
        camera.target = Vec3::new(0.0, 2.0, -86.0);
        if let Some(cell) = village.camp {
            camera.target = spawn_tents(&mut commands, &assets, &setup, cell);
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

    if village.guide.controls(&keyboard) {
        return;
    }

    if village.camp.is_some() && village.lenses.controls(&keyboard, catalog.materials.len()) {
        return;
    }

    if village.planning_roads()
        && let Some(camp) = village.camp
    {
        let terrain = village.terrain(&setup);
        let town = &mut *village;
        if keyboard.any_just_pressed([KeyCode::KeyB, KeyCode::Escape]) {
            town.construction.finish_roads();
        } else if keyboard.just_pressed(KeyCode::KeyZ) {
            town.construction.undo_roads(&mut town.stock);
        } else if let Some(hit) = pointer.clicked {
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
                keyboard.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]),
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
    {
        village.advance.controls(&keyboard);
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
            if keyboard.just_pressed(KeyCode::KeyR) {
                town.finance_history_open = !town.finance_history_open;
                town.finance_history_page = 0;
            }
            if town.finance_history_open
                && keyboard.any_just_pressed([KeyCode::PageUp, KeyCode::PageDown])
            {
                let (pages, _) = town.stock.finance_history(town.finance_history_page);
                town.finance_history_page = if keyboard.just_pressed(KeyCode::PageDown) {
                    (town.finance_history_page + 1) % pages
                } else {
                    (town.finance_history_page + pages - 1) % pages
                };
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
                let pages = town
                    .construction
                    .projects_panel(&catalog, town.projects_page, town.open_projects_only)
                    .0;
                town.projects_page = if keyboard.just_pressed(KeyCode::PageDown) {
                    (town.projects_page + 1) % pages
                } else {
                    (town.projects_page + pages - 1) % pages
                };
            }
            if let Some(point) = town.construction.focus_project(
                &catalog,
                &keyboard,
                town.projects_page,
                town.open_projects_only,
            ) {
                camera.target = Vec3::new(point.x, terrain.height_at(point.x, point.y), point.y);
                town.utility_panel = None;
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
            if keyboard.any_just_pressed([KeyCode::PageUp, KeyCode::PageDown]) {
                let pages = town
                    .construction
                    .inventory_panel(&catalog, &town.stock, town.inventory_page)
                    .0;
                town.inventory_page = if keyboard.just_pressed(KeyCode::PageDown) {
                    (town.inventory_page + 1) % pages
                } else {
                    (town.inventory_page + pages - 1) % pages
                };
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
            let pages = town.construction.event_log(town.event_page).0;
            if keyboard.just_pressed(KeyCode::PageDown) {
                town.event_page = (town.event_page + 1) % pages;
            } else if keyboard.just_pressed(KeyCode::PageUp) {
                town.event_page = (town.event_page + pages - 1) % pages;
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
                town.selected_resident = index;
                town.housing_notice.clear();
            }
            if let Some(hit) = pointer.clicked {
                town.construction.select_facility(hit.cell);
                town.housing_notice.clear();
            }
            if keyboard.just_pressed(KeyCode::KeyT) {
                town.housing_notice = town
                    .construction
                    .assign_selected_home(town.selected_resident, &catalog)
                    .unwrap_or_else(str::to_owned);
            } else if keyboard.just_pressed(KeyCode::KeyY) {
                town.housing_notice = town.construction.clear_home(town.selected_resident);
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
            town.construction.plan(
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
    let preset = CAMP_SITES
        .into_iter()
        .find_map(|(key, cell)| keyboard.just_pressed(key).then_some(cell));
    let Some(cell) = preset.or(pointer.clicked.map(|hit| hit.cell)) else {
        return;
    };
    let natural_site = (cell.x - 1..=cell.x + 3)
        .any(|x| (cell.y - 3..=cell.y).any(|z| land.occupied(IVec2::new(x, z))));
    let placement_error = if natural_site {
        Some("Leave the trees and natural resources clear.")
    } else if preset.is_none() {
        custom_camp_error(&terrain, cell)
    } else {
        None
    };
    if let Some(error) = placement_error {
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
        transform.rotation = Quat::from_rotation_y(pose.yaw);
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
    for _ in 0..SPEEDS[village.speed].1 {
        step(&mut village, &catalog, &setup, site, time.delta_secs_f64());
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
    town.stock.update_finance_clock(town.clock);
    town.construction
        .tick_services(catalog, setup, &mut town.stock, town.clock, dt);
    let cooling = town.construction.utilities.powered_cold_storage();
    town.stock.age_food(catalog, town.clock, dt, cooling);
    town.construction
        .tick_animals(catalog, &mut town.stock, town.clock, dt);
    town.construction.tick_crops(catalog, setup, town.clock, dt);
    town.construction
        .tick_growth(catalog, setup, &mut town.stock, town.clock, dt);
    town.construction
        .tick_health(catalog, setup, &mut town.stock, site, town.clock, dt as f32);
    town.construction
        .manage_kitchens(catalog, &mut town.stock, town.clock);
    let clock = TownClock {
        seconds: town.clock,
        round_trip_km: setup.round_trip_km(),
    };
    town.construction
        .tick(catalog, &mut town.stock, site, clock, dt as f32);
    town.construction
        .tick_leisure(catalog, setup, &town.stock, site, town.clock, dt as f32);
}

fn show_hud(
    setup: Res<WorldSetup>,
    village: Res<Village>,
    mut hud: Single<(&mut Text, &mut Node), With<VillageHud>>,
    (catalog, land, saves): (Res<Catalog>, Res<Land>, Res<SaveMenu>),
    placement: Res<MapNotice>,
) {
    if !saves.is_changed()
        && !setup.is_changed()
        && !village.is_changed()
        && !placement.is_changed()
    {
        return;
    }
    let (text, node) = &mut *hud;
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
        village.construction.instructions(&catalog)
    };
    let speed = SPEEDS[village.speed].1;
    let stock = if village.stock.sandbox {
        format!("Sandbox · {}", village.construction.sandbox_status())
    } else {
        format!(
            "R${:.2} · {} timber · {} meals · {}",
            village.stock.balance() as f64 / 100.0,
            village.stock.available("wood"),
            village.stock.available("meals"),
            village.construction.auto_buy_status(),
        )
    };
    let mut label = format!(
        "Day {day}   {hour:02}:{:02}   {speed}×\n{stock}\n{controls}",
        minute % 60
    );
    if let Some(notice) = &placement.0 {
        label.push('\n');
        label.push_str(notice);
    }
    let weather = weather_at(village.clock, setup.biome(), setup.seed());
    label.push('\n');
    label.push_str(&weather.summary());
    label.push_str(" · F Forecast · F1 Guide");
    if village.show_forecast {
        label.push('\n');
        label.push_str(&forecast(village.clock, setup.biome(), setup.seed()));
    }
    if village.camp.is_some() {
        label.push('\n');
        label.push_str(&village.advance.status());
    }
    if village.terrain_editor.open {
        label.push('\n');
        label.push_str(&village.terrain_editor.label());
    }
    if let Some(progress) = village.construction.latest_progress(&catalog) {
        label.push('\n');
        label.push_str(&progress);
    }
    if let Some(natural) =
        village
            .construction
            .gathering
            .selected_status(&catalog, &land, village.clock)
    {
        label.push('\n');
        label.push_str(&natural);
    }
    if village.camp.is_some() {
        label.push_str(
            "\nP Power · V Water · N Residents · H Finances · F4 Terrain · F7 Maintenance · F8 Events · F10 Stores · F11 Projects · Shift+L Map lenses",
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
        }
        Some(UtilityPanel::Inventory) => {
            label.push('\n');
            label.push_str(
                &village
                    .construction
                    .inventory_panel(&catalog, &village.stock, village.inventory_page)
                    .1,
            );
        }
        Some(UtilityPanel::Events) => {
            label.push('\n');
            label.push_str(&village.construction.event_log(village.event_page).1);
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
            label.push_str("\nTab Finances");
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
    if let Some(status) = village.construction.lifecycle_status(&catalog) {
        label.push('\n');
        label.push_str(&status);
    }
    let notice = village.construction.construction_notice();
    if !notice.is_empty() && !village.construction.menu {
        label.push('\n');
        label.push_str(notice);
    }
    if let Some(farm) = village.construction.farm_status(village.clock) {
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
    (mut map_notice, mut land_lens): (ResMut<MapNotice>, Local<land_lens::LandLens>),
) {
    let mut notice = None;
    if !setup.open
        && let Some(camp) = village.camp
    {
        let terrain = village.terrain(&setup);
        let construction_notice = village.construction.draw(
            &catalog,
            &terrain,
            village.lenses.active == Some(MapLens::Construction),
            pointer.hovered.map(|hit| hit.cell),
            &mut gizmos,
        );
        let network_lens = match village.lenses.active {
            Some(MapLens::Power) => Some(NetworkView::Power),
            Some(MapLens::Water) => Some(NetworkView::Water),
            Some(MapLens::Sanitation) => Some(NetworkView::Sanitation),
            _ => None,
        };
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
            Some(MapLens::Residents) => Some(village.construction.draw_residents_lens(
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
                        pointer.hovered.map(|hit| hit.cell),
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
                let extend = keyboard.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]);
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
    map_notice.set_if_neq(MapNotice(notice));
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
    let models = AssetPath::from_path_buf(embedded_path!("buildings.glb")).with_source("embedded");
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
                building.insert(SceneRoot(
                    assets.load(
                        models
                            .clone()
                            .with_label(GltfAssetLabel::Scene(asset).to_string()),
                    ),
                ));
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
                .tick(&catalog, &mut village.stock, site, clock, 0.1);
        }

        let path =
            std::env::temp_dir().join(format!("solar-v3-save-test-{}.json", std::process::id()));
        save::write(&path, &village).unwrap();
        let mut resumed = save::read(&path, &catalog).unwrap();
        std::fs::remove_file(path).unwrap();

        for _ in 0..2_000 {
            village
                .construction
                .tick(&catalog, &mut village.stock, site, clock, 0.1);
            resumed
                .construction
                .tick(&catalog, &mut resumed.stock, site, clock, 0.1);
        }
        assert_eq!(
            serde_json::to_value(village).unwrap(),
            serde_json::to_value(resumed).unwrap()
        );
    }
}
