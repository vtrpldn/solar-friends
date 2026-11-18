use bevy::{
    input::mouse::{AccumulatedMouseMotion, AccumulatedMouseScroll, MouseScrollUnit},
    prelude::*,
    window::{PrimaryWindow, WindowResolution},
};

mod arrival;
mod audio;
mod catalog;
mod construction;
mod gathering;
mod land;
mod market;
mod navigation;
mod save;
mod setup;
mod stock;
mod terrain;
mod ui_font;
mod village;
use setup::{WorldSetup, WorldSetupPlugin};

const CAMERA_HOME: Vec3 = Vec3::new(-26.0, 3.0, -12.0);
const CAMERA_HEIGHT: f32 = 40.0;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                title: "Solar Friends V3".into(),
                resolution: WindowResolution::new(1280, 800),
                ..default()
            }),
            ..default()
        }))
        .add_plugins((
            WorldSetupPlugin,
            village::VillagePlugin,
            ui_font::UiFontPlugin,
            audio::VillageAudio,
            land::LandPlugin,
        ))
        .add_systems(Startup, setup_scene)
        .add_systems(PostUpdate, update_land)
        .add_systems(Update, camera_controls)
        .run();
}

#[derive(Component)]
struct VillageCamera {
    target: Vec3,
    heading: f32,
}

fn camera_transform(target: Vec3, heading: f32) -> Transform {
    let offset = Quat::from_rotation_y(heading) * Vec3::new(32.0, 35.0, 32.0);
    Transform::from_translation(target + offset).looking_at(target, Vec3::Y)
}

fn setup_scene(mut commands: Commands) {
    commands.spawn((
        Camera3d::default(),
        Projection::Orthographic(OrthographicProjection {
            scaling_mode: bevy::camera::ScalingMode::FixedVertical {
                viewport_height: CAMERA_HEIGHT,
            },
            ..OrthographicProjection::default_3d()
        }),
        VillageCamera {
            target: CAMERA_HOME,
            heading: 0.0,
        },
        camera_transform(CAMERA_HOME, 0.0),
    ));
    commands.spawn((
        DirectionalLight {
            illuminance: 15_000.0,
            shadows_enabled: true,
            ..default()
        },
        Transform::from_xyz(-40.0, 65.0, 27.0).looking_at(Vec3::ZERO, Vec3::Y),
    ));
}

#[derive(Component)]
struct LandMesh;

#[derive(Component)]
struct GroundMesh;

fn update_land(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    setup: Res<WorldSetup>,
    old_land: Query<Entity, With<LandMesh>>,
    village: Res<village::Village>,
    mut drawn: Local<Option<(WorldSetup, Option<IVec2>)>>,
) {
    let camp = if setup.open { None } else { village.camp };
    let key = (setup.session(), camp);
    if drawn.as_ref() == Some(&key) {
        return;
    }
    *drawn = Some(key);
    for entity in &old_land {
        commands.entity(entity).despawn();
    }
    let mut terrain = setup.terrain();
    if let Some(cell) = camp {
        terrain = terrain.with_camp(cell);
    }
    commands.spawn((
        LandMesh,
        GroundMesh,
        Mesh3d(meshes.add(terrain.ground_mesh())),
        MeshMaterial3d(materials.add(setup.ground_color())),
    ));
    commands.spawn((
        LandMesh,
        Mesh3d(meshes.add(terrain.road_mesh())),
        MeshMaterial3d(materials.add(Color::srgb_u8(159, 120, 82))),
    ));
    commands.spawn((
        LandMesh,
        Mesh3d(meshes.add(terrain.river_mesh())),
        MeshMaterial3d(materials.add(Color::srgb_u8(75, 135, 147))),
    ));
}

fn camera_controls(
    keyboard: Res<ButtonInput<KeyCode>>,
    mouse: Res<ButtonInput<MouseButton>>,
    (motion, scroll): (Res<AccumulatedMouseMotion>, Res<AccumulatedMouseScroll>),
    window: Single<&Window, With<PrimaryWindow>>,
    time: Res<Time>,
    setup: Res<WorldSetup>,
    mut camera: Single<(&mut Transform, &mut Projection, &mut VillageCamera)>,
) {
    if setup.open || !window.focused {
        return;
    }
    let (transform, projection, view) = &mut *camera;
    let Projection::Orthographic(ortho) = &mut **projection else {
        return;
    };
    if keyboard.just_pressed(KeyCode::Home) {
        view.target = CAMERA_HOME;
        view.heading = 0.0;
        ortho.scale = 1.0;
    }
    let axis = |positive, negative| {
        i32::from(keyboard.any_pressed(positive)) as f32
            - i32::from(keyboard.any_pressed(negative)) as f32
    };
    let delta = time.delta_secs();
    let pan_x = axis(
        [KeyCode::KeyD, KeyCode::ArrowRight],
        [KeyCode::KeyA, KeyCode::ArrowLeft],
    );
    let pan_z = axis(
        [KeyCode::KeyS, KeyCode::ArrowDown],
        [KeyCode::KeyW, KeyCode::ArrowUp],
    );
    let turn =
        i32::from(keyboard.pressed(KeyCode::KeyE)) - i32::from(keyboard.pressed(KeyCode::KeyQ));
    let pan = Vec3::new(pan_x, 0.0, pan_z).normalize_or_zero();
    let dash = if keyboard.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]) {
        2.2
    } else {
        1.0
    };
    let heading = view.heading + std::f32::consts::FRAC_PI_4;
    let orientation = Quat::from_rotation_y(heading);
    view.target += orientation * pan * (24.0 * dash * ortho.scale.sqrt() * delta);
    if mouse.pressed(MouseButton::Left) {
        let distance_per_pixel = CAMERA_HEIGHT * ortho.scale / window.height().max(1.0);
        let drag = Vec3::new(-motion.delta.x, 0.0, -motion.delta.y);
        view.target += orientation * drag * distance_per_pixel;
    }
    view.heading += turn as f32 * delta * 1.2;
    if mouse.pressed(MouseButton::Right) {
        view.heading -= motion.delta.x / window.height().max(1.0) * std::f32::consts::TAU;
    }
    view.target.x = view.target.x.clamp(-124.0, 124.0);
    view.target.z = view.target.z.clamp(-124.0, 124.0);
    **transform = camera_transform(view.target, view.heading);

    let zoom = axis(
        [KeyCode::Minus, KeyCode::NumpadSubtract],
        [KeyCode::Equal, KeyCode::NumpadAdd],
    );
    let wheel_factor = match scroll.unit {
        MouseScrollUnit::Line => 0.12,
        MouseScrollUnit::Pixel => 0.002,
    };
    let change = zoom * delta * 1.3 - scroll.delta.y * wheel_factor;
    ortho.scale = (ortho.scale * change.exp()).clamp(1.0 / 6.0, 1.0 / 0.18);
}
