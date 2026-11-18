use bevy::{
    asset::{AssetPath, embedded_asset, embedded_path},
    gltf::GltfAssetLabel,
    picking::prelude::{MeshRayCast, MeshRayCastSettings},
    prelude::*,
    window::PrimaryWindow,
};

use crate::{
    GroundMesh, VillageCamera,
    arrival::{
        ARRIVAL_DURATION, MAP_START, ROAD_END, resident_pose, road_center, road_width,
        vehicle_pose, world_position,
    },
    catalog::Catalog,
    construction::Construction,
    setup::WorldSetup,
    stock::Stock,
    ui_font::ui_font,
};

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
        app.init_resource::<Village>()
            .init_resource::<CampPointer>()
            .init_resource::<Catalog>()
            .insert_resource(Time::<Fixed>::from_hz(10.0))
            .add_systems(Startup, spawn_hud)
            .add_systems(
                Update,
                (read_camp_pointer, village_input, animate_arrival, show_hud).chain(),
            )
            .add_systems(Update, draw_blueprints)
            .add_systems(FixedUpdate, advance_clock);
    }
}

#[derive(Resource, Default)]
pub struct Village {
    setup: Option<WorldSetup>,
    pub camp: Option<IVec2>,
    clock: f64,
    arrival_time: f32,
    paused: bool,
    camp_error: Option<&'static str>,
    stock: Stock,
    construction: Construction,
}

#[derive(Component)]
struct VillageEntity;

#[derive(Component)]
struct VillageHud;

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
    if !window.focused
        || setup.open
        || (village.camp.is_some() && !village.construction.is_placing())
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
    (assets, catalog): (Res<AssetServer>, Res<Catalog>),
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
    if village.setup.as_ref() != Some(&setup.session()) {
        for entity in &entities {
            commands.entity(entity).despawn();
        }
        *village = Village {
            setup: Some(setup.session()),
            stock: Stock::for_start(&setup, &catalog),
            ..default()
        };
        camera.target = Vec3::new(0.0, 2.0, -86.0);
        for (index, name) in NAMES.into_iter().enumerate() {
            commands.spawn((
                VillageEntity,
                ArrivalActor::Resident(index),
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

    if keyboard.just_pressed(KeyCode::Space) && village.camp.is_some() {
        village.paused = !village.paused;
    }
    if let Some(cell) = village.camp {
        let town = &mut *village;
        if keyboard.get_just_pressed().len() > 0 {
            town.construction.input(&keyboard, &catalog);
        }
        if let Some(position) = pointer.0 {
            town.construction
                .plan(&catalog, &mut town.stock, &terrain, cell, position);
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
    if preset.is_none()
        && let Some(error) = custom_camp_error(&terrain, cell)
    {
        village.camp_error = Some(error);
        return;
    }
    village.camp_error = None;
    village.camp = Some(cell);
    let terrain = terrain.with_camp(cell);
    let Vec2 { x, y: z } = world_position(cell.x as f32, cell.y as f32);
    camera.target = Vec3::new(x, terrain.height_at(x, z), z);
    for index in 0..2 {
        let tent_x = x + index as f32 * 3.0;
        let tent_z = z - 3.0;
        commands.spawn((
            VillageEntity,
            opening_model(&assets, NAMES.len() + index * 2),
            Transform::from_xyz(tent_x, terrain.height_at(tent_x, tent_z), tent_z),
        ));
    }
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
            ArrivalActor::Resident(index) => resident_pose(village.arrival_time, index),
            ArrivalActor::Car(index) => vehicle_pose(village.arrival_time, index),
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

fn advance_clock(time: Res<Time<Fixed>>, setup: Res<WorldSetup>, mut village: ResMut<Village>) {
    if !setup.open && !village.paused && village.camp.is_some() {
        village.clock += time.delta_secs_f64();
    }
}

fn show_hud(
    setup: Res<WorldSetup>,
    village: Res<Village>,
    mut hud: Single<(&mut Text, &mut Node), With<VillageHud>>,
    catalog: Res<Catalog>,
) {
    if !setup.is_changed() && !village.is_changed() {
        return;
    }
    let (text, node) = &mut *hud;
    node.display = if setup.open {
        Display::None
    } else {
        Display::Flex
    };
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
    let label = format!(
        "Day {day}   {hour:02}:{:02}   R${}\n{} timber · {} meals\n{controls}",
        minute % 60,
        village.stock.cash,
        village.stock.available("wood"),
        village.stock.available("meals"),
    );
    if text.0 != label {
        text.0 = label;
    }
}

fn draw_blueprints(setup: Res<WorldSetup>, village: Res<Village>, mut gizmos: Gizmos) {
    if !setup.open
        && let Some(camp) = village.camp
    {
        village
            .construction
            .draw(&setup.terrain().with_camp(camp), &mut gizmos);
    }
}
