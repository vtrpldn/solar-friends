use bevy::{
    asset::{AssetPath, embedded_asset, embedded_path},
    gltf::GltfAssetLabel,
    prelude::*,
};

use crate::{
    VillageCamera,
    arrival::{ARRIVAL_DURATION, resident_pose, vehicle_pose, world_position},
    setup::WorldSetup,
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
            .insert_resource(Time::<Fixed>::from_hz(10.0))
            .add_systems(Startup, spawn_hud)
            .add_systems(Update, (village_input, animate_arrival, show_hud).chain())
            .add_systems(FixedUpdate, advance_clock);
    }
}

#[derive(Resource, Default)]
struct Village {
    setup: Option<WorldSetup>,
    camp: Option<IVec2>,
    clock: f64,
    arrival_time: f32,
    paused: bool,
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

fn spawn_hud(mut commands: Commands) {
    commands.spawn((
        VillageHud,
        Text::default(),
        TextFont::from_font_size(17.0),
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

fn village_input(
    mut commands: Commands,
    setup: Res<WorldSetup>,
    keyboard: Res<ButtonInput<KeyCode>>,
    mut village: ResMut<Village>,
    mut camera: Single<&mut VillageCamera>,
    entities: Query<Entity, With<VillageEntity>>,
    assets: Res<AssetServer>,
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
    if village.camp.is_some() || village.arrival_time < ARRIVAL_DURATION {
        return;
    }
    let Some((_, cell)) = CAMP_SITES
        .into_iter()
        .find(|(key, _)| keyboard.just_pressed(*key))
    else {
        return;
    };
    village.camp = Some(cell);
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
    village.arrival_time = (village.arrival_time + time.delta_secs()).min(ARRIVAL_DURATION);
    let terrain = setup.terrain();
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
        "Arriving at the village"
    } else if village.camp.is_none() {
        "Choose camp · 1 Shade · 2 Entrance · 3 Clearing"
    } else if village.paused {
        "Space to resume"
    } else {
        "Space to pause"
    };
    let label = format!("Day {day}   {hour:02}:{:02}\n{controls}", minute % 60);
    if text.0 != label {
        text.0 = label;
    }
}
