use super::{lighting, ui_font};
use crate::{
    resident_animation::{Motion, PreviewPose, ResidentAnimation, ResidentAnimationPlugin},
    village::{opening_model, register_opening_models},
};
use bevy::prelude::*;

const POSES: [(&str, Motion); 31] = {
    use Motion::*;
    [
        ("idle", Idle),
        ("walk", Walk),
        ("carry-walk", CarryWalk),
        ("duck-walk", DuckWalk),
        ("work", Work),
        ("chop", Chop),
        ("look", Look),
        ("breathe", Breathe),
        ("sit", Sit),
        ("water", Water),
        ("tend", Tend),
        ("carry", Carry),
        ("rest", Rest),
        ("eat", Eat),
        ("wash", Wash),
        ("bathe", Bathe),
        ("pee", Pee),
        ("toilet", Toilet),
        ("chat", Chat),
        ("read", Read),
        ("play", Play),
        ("stretch", Stretch),
        ("wave", Wave),
        ("listen", Listen),
        ("laugh", Laugh),
        ("neck-stretch", NeckStretch),
        ("shoulder-roll", ShoulderRoll),
        ("yawn", Yawn),
        ("fire-sit", FireSit),
        ("ground-read", GroundRead),
        ("ground-relax", GroundRelax),
    ]
};

#[derive(Default, Resource)]
struct Lineup {
    pose: usize,
    view: usize,
    night: bool,
    frozen: bool,
    clock: f32,
}

#[derive(Component)]
struct Controls;

#[derive(Component)]
struct Nameplate(Vec3);

pub fn run(initial_pose: Option<&str>) {
    let pose = if let Some(name) = initial_pose {
        let Some(pose) = POSES.iter().position(|(label, _)| *label == name) else {
            eprintln!("Unknown resident pose: {name}");
            return;
        };
        pose
    } else {
        0
    };
    let mut app = App::new();
    app.add_plugins(DefaultPlugins.set(WindowPlugin {
        primary_window: Some(Window {
            title: "Solar Friends V3 · Resident lineup".into(),
            ..default()
        }),
        ..default()
    }))
    .add_plugins((
        crate::ui_font::UiFontPlugin,
        ResidentAnimationPlugin,
        super::navigation::ArtNavigationPlugin(super::navigation::ArtTool::Residents),
    ))
    .insert_resource(Lineup { pose, ..default() })
    .init_resource::<GlobalAmbientLight>()
    .add_systems(Startup, setup)
    .add_systems(Update, (controls, position_nameplates));
    register_opening_models(&mut app);
    app.run();
}

fn setup(
    mut commands: Commands,
    assets: Res<AssetServer>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    commands.spawn((
        Camera3d::default(),
        Projection::Orthographic(OrthographicProjection {
            scaling_mode: bevy::camera::ScalingMode::AutoMin {
                min_width: 10.2,
                min_height: 4.6,
            },
            ..OrthographicProjection::default_3d()
        }),
        Transform::from_xyz(0., 4., 10.).looking_at(Vec3::Y * 0.8, Vec3::Y),
    ));
    commands.spawn((
        DirectionalLight {
            shadows_enabled: true,
            ..default()
        },
        Transform::from_xyz(-4., 8., 5.).looking_at(Vec3::ZERO, Vec3::Y),
    ));
    commands.spawn((
        Mesh3d(meshes.add(Plane3d::default().mesh().size(100., 100.))),
        MeshMaterial3d(materials.add(Color::srgb_u8(188, 196, 140))),
    ));
    let names = ["Resident", "Iara", "Bento", "Luz", "Cauã", "Nina"];
    for (column, (rig, scene)) in [(5, 9), (0, 0), (1, 1), (2, 2), (3, 3), (4, 4)]
        .into_iter()
        .enumerate()
    {
        let position = Vec3::new((column as f32 - 2.5) * 1.6, 0., 0.);
        commands.spawn((
            opening_model(&assets, scene),
            ResidentAnimation(rig),
            PreviewPose(Motion::Idle, 0.),
            Transform::from_translation(position),
        ));
        commands.spawn((
            Nameplate(position),
            Text::new(names[column]),
            TextLayout::new_with_justify(Justify::Center),
            TextColor(Color::srgb_u8(25, 42, 33)),
            ui_font(&assets, 20.),
            BackgroundColor(Color::srgba(0.93, 0.94, 0.85, 0.88)),
            Node {
                position_type: PositionType::Absolute,
                width: px(100),
                padding: UiRect::vertical(px(5)),
                ..default()
            },
        ));
    }
    commands.spawn((
        Controls,
        Text::default(),
        ui_font(&assets, 18.),
        BackgroundColor(Color::srgba(0.08, 0.14, 0.11, 0.91)),
        Node {
            position_type: PositionType::Absolute,
            top: px(48),
            left: px(16),
            padding: UiRect::all(px(14)),
            ..default()
        },
    ));
}

fn position_nameplates(
    camera: Single<(&Camera, &GlobalTransform)>,
    mut nameplates: Query<(&Nameplate, &mut Node)>,
) {
    let (camera, transform) = *camera;
    for (nameplate, mut node) in &mut nameplates {
        if let Ok(position) = camera.world_to_viewport(transform, nameplate.0) {
            node.left = px(position.x - 50.);
            node.top = px(position.y + 24.);
        }
    }
}

fn controls(
    mut lineup: ResMut<Lineup>,
    time: Res<Time>,
    keys: Res<ButtonInput<KeyCode>>,
    mut actors: Query<(&mut Transform, &mut PreviewPose)>,
    (mut text, mut sun): (
        Single<&mut Text, With<Controls>>,
        Single<&mut DirectionalLight>,
    ),
    (mut ambient, mut background): (ResMut<GlobalAmbientLight>, ResMut<ClearColor>),
) {
    use KeyCode::*;
    if keys.just_pressed(ArrowUp) {
        lineup.pose = (lineup.pose + POSES.len() - 1) % POSES.len();
    }
    if keys.just_pressed(ArrowDown) {
        lineup.pose = (lineup.pose + 1) % POSES.len();
    }
    if keys.just_pressed(KeyV) {
        lineup.view = (lineup.view + 1) % 3;
    }
    if keys.just_pressed(KeyN) {
        lineup.night = !lineup.night;
    }
    if keys.just_pressed(Space) {
        lineup.frozen = !lineup.frozen;
    }
    let step = if keys.pressed(ShiftLeft) || keys.pressed(ShiftRight) {
        0.5
    } else {
        0.05
    };
    if keys.just_pressed(ArrowLeft) || keys.just_pressed(ArrowRight) || keys.just_pressed(Home) {
        let delta =
            f32::from(keys.just_pressed(ArrowRight)) - f32::from(keys.just_pressed(ArrowLeft));
        lineup.clock = if keys.just_pressed(Home) {
            0.
        } else {
            (lineup.clock + delta * step).clamp(0., 18.)
        };
        lineup.frozen = true;
    } else if !lineup.frozen {
        lineup.clock = (lineup.clock + time.delta_secs().min(0.05)).rem_euclid(18.);
    }
    let (name, motion) = POSES[lineup.pose];
    let (view, yaw) = [
        ("Front", 0.3),
        ("Side", std::f32::consts::FRAC_PI_2),
        ("Back", std::f32::consts::PI),
    ][lineup.view];
    for (mut transform, mut pose) in &mut actors {
        transform.rotation = Quat::from_rotation_y(yaw);
        *pose = PreviewPose(motion, lineup.clock);
    }
    let (illuminance, color, brightness, mode) = lighting(lineup.night);
    sun.illuminance = if lineup.night { 0. } else { illuminance };
    sun.color = color;
    ambient.brightness = brightness;
    background.0 = if lineup.night {
        Color::srgb_u8(53, 71, 62)
    } else {
        Color::srgb_u8(217, 221, 189)
    };
    text.set_if_neq(Text::new(format!(
        "Resident lineup  ·  {name}  ·  {view}  ·  {mode}\n{} {:.2} s\nUp/Down pose   V view   N light   Space freeze   Left/Right scrub   Home reset time",
        if lineup.frozen { "Frozen at" } else { "Time" }, lineup.clock
    )));
}
