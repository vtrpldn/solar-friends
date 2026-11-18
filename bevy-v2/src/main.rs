use bevy::{prelude::*, window::WindowResolution};

mod terrain;
use terrain::Terrain;

fn main() {
    App::new()
        .insert_resource(Terrain::new(42, 1.0, 1.0))
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                title: "Solar Friends V2".into(),
                resolution: WindowResolution::new(1280, 800),
                ..default()
            }),
            ..default()
        }))
        .add_systems(Startup, setup)
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

fn setup(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    terrain: Res<Terrain>,
) {
    commands.spawn((
        Camera3d::default(),
        Projection::Orthographic(OrthographicProjection {
            scale: 0.055,
            ..OrthographicProjection::default_3d()
        }),
        VillageCamera {
            target: Vec3::new(-26.0, 3.0, -12.0),
            heading: 0.0,
        },
        camera_transform(Vec3::new(-26.0, 3.0, -12.0), 0.0),
    ));
    commands.spawn((
        DirectionalLight {
            illuminance: 15_000.0,
            ..default()
        },
        Transform::from_xyz(-40.0, 65.0, 27.0).looking_at(Vec3::ZERO, Vec3::Y),
    ));
    commands.spawn((
        Mesh3d(meshes.add(terrain.ground_mesh())),
        MeshMaterial3d(materials.add(Color::srgb_u8(159, 173, 114))),
    ));
    commands.spawn((
        Mesh3d(meshes.add(terrain.river_mesh())),
        MeshMaterial3d(materials.add(Color::srgb_u8(75, 135, 147))),
    ));
}

fn camera_controls(
    keyboard: Res<ButtonInput<KeyCode>>,
    time: Res<Time>,
    mut camera: Single<(&mut Transform, &mut Projection, &mut VillageCamera)>,
) {
    let (transform, projection, view) = &mut *camera;
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
    let turn = axis(
        [KeyCode::KeyE, KeyCode::KeyE],
        [KeyCode::KeyQ, KeyCode::KeyQ],
    );
    view.heading += turn * delta;
    let pan = Vec3::new(pan_x, 0.0, pan_z).normalize_or_zero();
    let speed = if keyboard.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]) {
        60.0
    } else {
        18.0
    };
    let heading = view.heading + std::f32::consts::FRAC_PI_4;
    view.target += Quat::from_rotation_y(heading) * pan * speed * delta;
    view.target.x = view.target.x.clamp(-128.0, 128.0);
    view.target.z = view.target.z.clamp(-128.0, 128.0);
    **transform = camera_transform(view.target, view.heading);
    if let Projection::Orthographic(ortho) = &mut **projection {
        let zoom = axis(
            [KeyCode::Minus, KeyCode::NumpadSubtract],
            [KeyCode::Equal, KeyCode::NumpadAdd],
        );
        ortho.scale = (ortho.scale * (zoom * delta).exp()).clamp(0.012, 0.28);
    }
}
