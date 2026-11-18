use bevy::prelude::*;

use crate::{catalog::Catalog, ui_font::ui_font, village::building_model};

#[derive(Resource)]
struct Workshop {
    projects: Vec<String>,
    selected: usize,
    heading: f32,
    zoom: f32,
    night: bool,
}

pub fn run() {
    let catalog = Catalog::default();
    let mut projects: Vec<_> = catalog.projects.keys().cloned().collect();
    projects.sort_by(|a, b| catalog.projects[a].name.cmp(&catalog.projects[b].name));
    let mut app = App::new();
    app.add_plugins(DefaultPlugins.set(WindowPlugin {
        primary_window: Some(Window {
            title: "Solar Friends V3 · Workshop".into(),
            ..default()
        }),
        ..default()
    }))
    .add_plugins(crate::ui_font::UiFontPlugin)
    .insert_resource(catalog)
    .insert_resource(Workshop {
        projects,
        selected: 0,
        heading: 0.0,
        zoom: 1.0,
        night: false,
    })
    .add_systems(Startup, setup)
    .add_systems(Update, (controls, show_model).chain());
    crate::village::register_building_models(&mut app);
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
        Projection::Orthographic(OrthographicProjection::default_3d()),
        crate::camera_transform(Vec3::Y, 0.0),
    ));
    commands.spawn((
        DirectionalLight {
            shadows_enabled: true,
            ..default()
        },
        Transform::from_xyz(-8.0, 12.0, 6.0).looking_at(Vec3::ZERO, Vec3::Y),
    ));
    commands.spawn((
        Mesh3d(meshes.add(Plane3d::default().mesh().size(120.0, 120.0))),
        MeshMaterial3d(materials.add(Color::srgb_u8(115, 130, 115))),
    ));
    commands.spawn((
        Text::default(),
        ui_font(&assets, 18.0),
        Node {
            position_type: PositionType::Absolute,
            left: px(24),
            top: px(24),
            padding: UiRect::all(px(16)),
            ..default()
        },
        BackgroundColor(Color::srgb_u8(31, 45, 35)),
    ));
}

fn controls(keys: Res<ButtonInput<KeyCode>>, time: Res<Time>, mut workshop: ResMut<Workshop>) {
    let len = workshop.projects.len();
    if keys.just_pressed(KeyCode::ArrowRight) {
        workshop.selected = (workshop.selected + 1) % len;
    } else if keys.just_pressed(KeyCode::ArrowLeft) {
        workshop.selected = (workshop.selected + len - 1) % len;
    }
    if keys.just_pressed(KeyCode::KeyN) {
        workshop.night = !workshop.night;
    }
    if keys.just_pressed(KeyCode::Home) {
        workshop.heading = 0.0;
        workshop.zoom = 1.0;
    }
    let turn = i8::from(keys.pressed(KeyCode::KeyE)) - i8::from(keys.pressed(KeyCode::KeyQ));
    if turn != 0 {
        workshop.heading += f32::from(turn) * time.delta_secs();
    }
    let zoom = i8::from(keys.any_pressed([KeyCode::Equal, KeyCode::NumpadAdd]))
        - i8::from(keys.any_pressed([KeyCode::Minus, KeyCode::NumpadSubtract]));
    if zoom != 0 {
        workshop.zoom =
            (workshop.zoom * (-f32::from(zoom) * time.delta_secs()).exp()).clamp(0.3, 3.0);
    }
}

fn show_model(
    mut commands: Commands,
    (assets, catalog, workshop): (Res<AssetServer>, Res<Catalog>, Res<Workshop>),
    mut preview: Local<Option<(usize, Entity)>>,
    (mut light, mut ambient): (Single<&mut DirectionalLight>, ResMut<GlobalAmbientLight>),
    mut camera: Single<(&mut Transform, &mut Projection), With<Camera3d>>,
    mut text: Single<&mut Text>,
) {
    if !workshop.is_changed() {
        return;
    }
    let project = &catalog.projects[&workshop.projects[workshop.selected]];
    if preview.is_none_or(|(model, _)| model != project.model) {
        if let Some((_, entity)) = *preview {
            commands.entity(entity).despawn();
        }
        let entity = commands
            .spawn((building_model(&assets, project.model), Transform::default()))
            .id();
        *preview = Some((project.model, entity));
    }
    let (transform, projection) = &mut *camera;
    **transform = crate::camera_transform(Vec3::Y, workshop.heading);
    if let Projection::Orthographic(ortho) = &mut **projection {
        let footprint = project.size[0].max(project.size[1]) as f32 * 2.0;
        ortho.scaling_mode = bevy::camera::ScalingMode::FixedVertical {
            viewport_height: footprint.mul_add(1.4, 4.0) * workshop.zoom,
        };
    }
    let mode = if workshop.night {
        light.illuminance = 800.0;
        light.color = Color::srgb_u8(157, 176, 227);
        ambient.brightness = 60.0;
        "Night"
    } else {
        light.illuminance = 14500.0;
        light.color = Color::srgb_u8(255, 236, 201);
        ambient.brightness = 350.0;
        "Day"
    };
    text.set_if_neq(Text::new(format!(
        "{} · {}/{} · {mode}\n{} × {} m · {}\n←/→ Model · Q/E Orbit · +/− Zoom · N Lighting · Home Reset",
        project.name, workshop.selected + 1, workshop.projects.len(),
        project.size[0] * 2, project.size[1] * 2, project.category,
    )));
}
