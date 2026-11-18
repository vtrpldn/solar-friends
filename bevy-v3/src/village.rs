use bevy::prelude::*;

use crate::{VillageCamera, setup::WorldSetup};

const ARRIVAL_SPOTS: [(f32, f32); 5] = [
    (30.0, -11.3),
    (30.8, -10.8),
    (31.7, -11.4),
    (32.6, -10.7),
    (33.3, -11.5),
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
        app.init_resource::<Village>()
            .insert_resource(Time::<Fixed>::from_hz(10.0))
            .add_systems(Startup, spawn_hud)
            .add_systems(Update, (village_input, show_hud).chain())
            .add_systems(FixedUpdate, advance_clock);
    }
}

#[derive(Resource, Default)]
struct Village {
    setup: Option<WorldSetup>,
    camp: Option<IVec2>,
    clock: f64,
    paused: bool,
}

#[derive(Component)]
struct VillageEntity;

#[derive(Component)]
struct VillageHud;

fn world_position(cell_x: f32, cell_z: f32) -> Vec2 {
    Vec2::new((cell_x - 32.0) * 2.0, (cell_z - 32.0) * 2.0)
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
    (mut meshes, mut materials): (ResMut<Assets<Mesh>>, ResMut<Assets<StandardMaterial>>),
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
        let marker = meshes.add(Capsule3d::new(0.25, 1.1));
        let colors = [
            [239, 126, 70],
            [83, 155, 198],
            [229, 180, 57],
            [122, 170, 106],
            [181, 125, 181],
        ];
        for ((cell_x, cell_z), (name, [r, g, b])) in
            ARRIVAL_SPOTS.into_iter().zip(NAMES.into_iter().zip(colors))
        {
            let Vec2 { x, y: z } = world_position(cell_x, cell_z);
            let y = terrain.height_at(x, z);
            commands.spawn((
                VillageEntity,
                Name::new(name),
                Mesh3d(marker.clone()),
                MeshMaterial3d(materials.add(Color::srgb_u8(r, g, b))),
                Transform::from_xyz(x, y + 0.8, z),
            ));
        }
    } else if setup.is_changed() {
        for entity in &entities {
            commands.entity(entity).insert(Visibility::Inherited);
        }
    }

    if keyboard.just_pressed(KeyCode::Space) && village.camp.is_some() {
        village.paused = !village.paused;
    }
    if village.camp.is_some() {
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
    let tent = meshes.add(Extrusion::new(
        Triangle2d::new(
            Vec2::new(-1.1, 0.0),
            Vec2::new(1.1, 0.0),
            Vec2::new(0.0, 1.4),
        ),
        2.1,
    ));
    let fabric = materials.add(Color::srgb_u8(200, 170, 107));
    for index in 0..NAMES.len() {
        let tent_x = x + index as f32 * 3.0;
        let tent_z = z - 3.0;
        commands.spawn((
            VillageEntity,
            Mesh3d(tent.clone()),
            MeshMaterial3d(fabric.clone()),
            Transform::from_xyz(tent_x, terrain.height_at(tent_x, tent_z), tent_z),
        ));
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
    let controls = if village.camp.is_none() {
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
