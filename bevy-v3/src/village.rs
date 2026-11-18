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
    construction::{Construction, ConstructionSite, TownClock},
    land::Land,
    resident_animation::{Motion, ResidentAnimation},
    save,
    setup::{Mode, WorldSetup},
    stock::Stock,
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
        app.init_resource::<Village>()
            .init_resource::<CampPointer>()
            .init_resource::<Catalog>()
            .insert_resource(Time::<Fixed>::from_hz(10.0))
            .add_systems(Startup, spawn_hud)
            .add_systems(
                Update,
                (
                    save_controls,
                    read_camp_pointer,
                    village_input,
                    animate_arrival,
                    show_hud,
                    show_construction,
                )
                    .chain(),
            )
            .add_systems(Update, draw_blueprints)
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
    utility_panel: Option<UtilityPanel>,
    #[serde(skip)]
    camp_error: Option<&'static str>,
    #[serde(skip)]
    save_notice: String,
    #[serde(skip)]
    rebuild_scene: bool,
    stock: Stock,
    construction: Construction,
}

#[derive(Clone, Copy, PartialEq)]
enum UtilityPanel {
    Power,
    Water,
    Residents,
}

impl Village {
    pub fn seconds(&self) -> f64 {
        self.clock
    }

    pub fn is_paused(&self) -> bool {
        self.paused
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
) {
    if !window.focused {
        return;
    }
    if keyboard.just_pressed(KeyCode::F9) {
        match save::location(setup.mode).and_then(|path| save::read(&path, &catalog)) {
            Ok(mut loaded) => {
                *setup = loaded.setup.as_ref().expect("validated setup").session();
                loaded.save_notice = "Village loaded.".into();
                loaded.rebuild_scene = true;
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
struct BuiltProject(usize);

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
struct CampPointer(Option<IVec2>);

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
    pointer.0 = None;
    if !window.focused || setup.open || village.arrival_time < ARRIVAL_DURATION {
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
    if !mouse.just_released(MouseButton::Left) || input.take().is_none() {
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
        pointer.0 = Some(cell.floor().as_ivec2());
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
    (keyboard, pointer): (Res<ButtonInput<KeyCode>>, Res<CampPointer>),
    mut village: ResMut<Village>,
    mut camera: Single<&mut VillageCamera>,
    entities: Query<Entity, With<VillageEntity>>,
    (assets, catalog, land): (Res<AssetServer>, Res<Catalog>, Res<Land>),
) {
    if setup.open {
        if setup.is_changed() {
            for entity in &entities {
                commands.entity(entity).insert(Visibility::Hidden);
            }
        }
        return;
    }
    let terrain = setup.terrain();
    let new_world = village.setup.as_ref() != Some(&setup.session());
    if new_world || village.rebuild_scene {
        for entity in &entities {
            commands.entity(entity).despawn();
        }
        if new_world {
            *village = Village {
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

    if keyboard.just_pressed(KeyCode::KeyF) {
        village.show_forecast = !village.show_forecast;
    }
    if keyboard.just_pressed(KeyCode::Space) && village.camp.is_some() {
        village.paused = !village.paused;
    }
    if let Some(cell) = village.camp {
        let town = &mut *village;
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
        if keyboard.just_pressed(KeyCode::KeyV) {
            town.utility_panel = if town.utility_panel == Some(UtilityPanel::Water) {
                None
            } else {
                Some(UtilityPanel::Water)
            };
        }
        if keyboard.just_pressed(KeyCode::KeyO) && town.utility_panel == Some(UtilityPanel::Power) {
            town.construction.utilities.grid_off = !town.construction.utilities.grid_off;
        }
        if keyboard.just_pressed(KeyCode::KeyJ)
            && let Some(index) = town.construction.production.selected
        {
            town.construction.utilities.toggle(index);
        }
        if town.stock.sandbox && keyboard.just_pressed(KeyCode::KeyI) {
            town.construction.toggle_sandbox_construction();
        }
        if !town.stock.sandbox && keyboard.just_pressed(KeyCode::KeyU) {
            town.construction.toggle_auto_buy();
        }
        if keyboard.get_just_pressed().len() > 0 {
            town.construction.input(&keyboard, &catalog);
            town.construction
                .production_input(&catalog, &mut town.stock, &keyboard);
            town.construction.farm_input(
                &catalog,
                &mut town.stock,
                &keyboard,
                TownClock {
                    seconds: town.clock,
                    round_trip_km: setup.round_trip_km(),
                },
            );
            if !town.construction.menu
                && !town.construction.production.open
                && !town.construction.farming.open
                && let Some(speed) = SPEEDS
                    .iter()
                    .position(|(key, _)| keyboard.just_pressed(*key))
            {
                town.speed = speed;
            }
        }
        if let Some(position) = pointer.0
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
        }
        if let Some(position) = pointer.0
            && !town.construction.menu
        {
            town.construction.select_facility(&catalog, position);
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
    let Some(cell) = preset.or(pointer.0) else {
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
    let mut terrain = setup.terrain();
    if let Some(cell) = village.camp {
        terrain = terrain.with_camp(cell);
    }
    for (actor, mut transform, mut visibility) in &mut actors {
        let pose = match *actor {
            ArrivalActor::Resident(index) if village.camp.is_some() => {
                let worker = village.construction.worker(index);
                crate::arrival::Pose {
                    position: world_position(worker.position.x, worker.position.y),
                    yaw: worker.yaw,
                    step_height: 0.0,
                    visible: !village.construction.driver_away(index)
                        && !village.construction.resident_sleeping(index),
                }
            }
            ArrivalActor::Resident(index) => resident_pose(village.arrival_time, index),
            ArrivalActor::Car(index) => village.construction.car_trip(index).map_or_else(
                || vehicle_pose(village.arrival_time, index),
                |(elapsed, duration)| town_vehicle_pose(elapsed, duration),
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
    (catalog, land): (Res<Catalog>, Res<Land>),
) {
    if setup.open || village.paused {
        return;
    }
    if let Some(camp) = village.camp {
        let terrain = setup.terrain();
        let town = &mut *village;
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp,
        };
        for _ in 0..SPEEDS[town.speed].1 {
            town.clock += time.delta_secs_f64();
            town.construction.tick_services(
                &catalog,
                &setup,
                &mut town.stock,
                town.clock,
                time.delta_secs_f64(),
            );
            town.construction
                .tick_crops(&catalog, &setup, town.clock, time.delta_secs_f64());
            town.construction.tick_health(
                &catalog,
                &setup,
                &mut town.stock,
                site,
                town.clock,
                time.delta_secs(),
            );
            let clock = TownClock {
                seconds: town.clock,
                round_trip_km: setup.round_trip_km(),
            };
            town.construction
                .tick(&catalog, &mut town.stock, site, clock, time.delta_secs());
        }
    }
}

fn show_hud(
    setup: Res<WorldSetup>,
    village: Res<Village>,
    mut hud: Single<(&mut Text, &mut Node), With<VillageHud>>,
    (catalog, land): (Res<Catalog>, Res<Land>),
) {
    if !setup.is_changed() && !village.is_changed() {
        return;
    }
    let (text, node) = &mut *hud;
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
    let weather = weather_at(village.clock, setup.biome(), setup.seed());
    label.push('\n');
    label.push_str(&weather.summary());
    label.push_str(" · F Forecast");
    if village.show_forecast {
        label.push('\n');
        label.push_str(&forecast(village.clock, setup.biome(), setup.seed()));
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
        label.push_str("\nP Power · V Water · N Residents");
    }
    match village.utility_panel {
        Some(UtilityPanel::Power) => {
            label.push('\n');
            label.push_str(&village.construction.utilities.power_summary());
        }
        Some(UtilityPanel::Water) => {
            label.push('\n');
            label.push_str(&village.construction.utilities.water_summary());
        }
        Some(UtilityPanel::Residents) => {
            label.push('\n');
            label.push_str(&village.construction.resident_status(&catalog));
        }
        None => {}
    }
    if let Some(production) = village.construction.selected_production(&catalog) {
        label.push('\n');
        label.push_str(&production);
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
    catalog: Res<Catalog>,
    mut gizmos: Gizmos,
) {
    if !setup.open
        && let Some(camp) = village.camp
    {
        village
            .construction
            .draw(&catalog, &setup.terrain().with_camp(camp), &mut gizmos);
    }
}

fn show_construction(
    mut commands: Commands,
    setup: Res<WorldSetup>,
    village: Res<Village>,
    catalog: Res<Catalog>,
    assets: Res<AssetServer>,
    displayed: Query<&BuiltProject>,
) {
    if setup.open || !village.is_changed() {
        return;
    }
    let Some(camp) = village.camp else { return };
    let terrain = setup.terrain().with_camp(camp);
    let models = AssetPath::from_path_buf(embedded_path!("buildings.glb")).with_source("embedded");
    for (project, asset, position, yaw) in village.construction.finished_models(&catalog) {
        if displayed.iter().any(|model| model.0 == project) {
            continue;
        }
        let Vec2 { x, y: z } = position;
        commands.spawn((
            VillageEntity,
            BuiltProject(project),
            SceneRoot(
                assets.load(
                    models
                        .clone()
                        .with_label(GltfAssetLabel::Scene(asset).to_string()),
                ),
            ),
            Transform::from_xyz(x, terrain.height_at(x, z), z)
                .with_rotation(Quat::from_rotation_y(yaw)),
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
