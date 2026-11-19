use bevy::{
    prelude::*,
    render::view::screenshot::{Screenshot, ScreenshotCaptured},
    scene::{SceneInstance, SceneSpawner},
};

use crate::{catalog::Catalog, ui_font::ui_font, village::building_model};

#[derive(Resource)]
struct Workshop {
    projects: Vec<String>,
    selected: usize,
    heading: f32,
    zoom: f32,
    night: bool,
    guides: bool,
    export_notice: String,
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
        guides: false,
        export_notice: String::new(),
    })
    .add_systems(Startup, setup)
    .add_systems(
        Update,
        (controls, show_model, capture_preview, draw_guides).chain(),
    );
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

fn controls(
    keys: Res<ButtonInput<KeyCode>>,
    time: Res<Time>,
    pending: Query<(), With<Screenshot>>,
    mut workshop: ResMut<Workshop>,
) {
    if !pending.is_empty() {
        return;
    }
    let len = workshop.projects.len();
    if keys.just_pressed(KeyCode::ArrowRight) {
        workshop.selected = (workshop.selected + 1) % len;
    } else if keys.just_pressed(KeyCode::ArrowLeft) {
        workshop.selected = (workshop.selected + len - 1) % len;
    }
    if keys.just_pressed(KeyCode::KeyG) {
        workshop.guides = !workshop.guides;
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

fn viewport_height(project: &crate::catalog::Project, zoom: f32) -> f32 {
    let footprint = project.size[0].max(project.size[1]) as f32 * 2.0;
    footprint.mul_add(1.4, 4.0) * zoom
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
        ortho.scaling_mode = bevy::camera::ScalingMode::FixedVertical {
            viewport_height: viewport_height(project, workshop.zoom),
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
        "{} · {}/{} · {mode}\n{} × {} m · {}\n←/→ Model · Q/E Orbit · +/− Zoom · N Lighting · G Guides · Home Reset · F5 Export PNG\n{}",
        project.name, workshop.selected + 1, workshop.projects.len(),
        project.size[0] * 2, project.size[1] * 2, project.category, workshop.export_notice,
    )));
}

fn capture_preview(
    mut commands: Commands,
    keys: Res<ButtonInput<KeyCode>>,
    (mut workshop, catalog): (ResMut<Workshop>, Res<Catalog>),
    mut panel: Single<&mut Node, With<Text>>,
    pending: Query<(), With<Screenshot>>,
    scene: Query<&SceneInstance>,
    spawner: Res<SceneSpawner>,
) {
    if !pending.is_empty() {
        return;
    }
    panel.display = Display::Flex;
    if !keys.just_pressed(KeyCode::F5) {
        return;
    }
    if !scene
        .single()
        .is_ok_and(|instance| spawner.instance_is_ready(**instance))
    {
        workshop.export_notice = "Wait for the model to finish loading.".into();
        return;
    }
    let path = crate::save::location(crate::setup::Mode::Story).and_then(|save| {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(std::io::Error::other)?;
        let dir = save.with_file_name("workshop");
        std::fs::create_dir_all(&dir)?;
        let model = &workshop.projects[workshop.selected];
        let light = if workshop.night { "night" } else { "day" };
        Ok(dir.join(format!("{model}-{light}-{}.png", stamp.as_nanos())))
    });
    let path = match path {
        Ok(path) => path,
        Err(error) => {
            workshop.export_notice = format!("Could not prepare export · {error}");
            return;
        }
    };
    let id = &workshop.projects[workshop.selected];
    let project = &catalog.projects[id];
    let mut metadata = serde_json::json!({
        "schema": "solar-friends.v3.workshop-preview.v1",
        "project": id,
        "model": project.model,
        "footprint_cells": project.size,
        "metres_per_cell": 2,
        "light": if workshop.night { "night" } else { "day" },
        "camera": {
            "projection": "orthographic",
            "heading_degrees": (workshop.heading.to_degrees() + 45.0).rem_euclid(360.0),
            "elevation_degrees": (35.0_f32 / 32.0_f32.hypot(32.0)).atan().to_degrees(),
            "viewport_height_metres": viewport_height(project, workshop.zoom),
        }
    });
    panel.display = Display::None;
    commands.spawn(Screenshot::primary_window()).observe(
        move |event: On<ScreenshotCaptured>, mut workshop: ResMut<Workshop>| {
            let result = event
                .image
                .clone()
                .try_into_dynamic()
                .map_err(|error| error.to_string())
                .and_then(|img| img.to_rgb8().save(&path).map_err(|error| error.to_string()));
            let result = result.and_then(|()| {
                metadata["image_pixels"] =
                    serde_json::json!([event.image.width(), event.image.height()]);
                serde_json::to_vec_pretty(&metadata)
                    .map_err(std::io::Error::from)
                    .and_then(|bytes| {
                        crate::save::atomic_write(&path.with_extension("json"), &bytes, 4096)
                    })
                    .map_err(|error| {
                        format!("PNG saved, but metadata could not be written · {error}")
                    })
            });
            workshop.export_notice = match result {
                Ok(()) => format!("Saved PNG and metadata · {}", path.display()),
                Err(error) => format!("Export · {error}"),
            };
        },
    );
}

fn draw_guides(
    workshop: Res<Workshop>,
    catalog: Res<Catalog>,
    pending: Query<(), With<Screenshot>>,
    mut gizmos: Gizmos,
) {
    if !workshop.guides || !pending.is_empty() {
        return;
    }
    let project = &catalog.projects[&workshop.projects[workshop.selected]];
    let [x, z] = project.size.map(|cells| cells as f32);
    let edge = (x.max(z) + 4.0).ceil() as i32;
    for marker in -edge..=edge {
        let distance = marker as f32;
        let extent = edge as f32;
        let tint = if marker.rem_euclid(2) == 0 {
            Color::srgba(0.75, 0.83, 0.75, 0.55)
        } else {
            Color::srgba(0.75, 0.83, 0.75, 0.3)
        };
        gizmos.line(
            Vec3::new(distance, 0.025, -extent),
            Vec3::new(distance, 0.025, extent),
            tint,
        );
        gizmos.line(
            Vec3::new(-extent, 0.025, distance),
            Vec3::new(extent, 0.025, distance),
            tint,
        );
    }
    gizmos.linestrip(
        [(-x, -z), (x, -z), (x, z), (-x, z), (-x, -z)].map(|(x, z)| Vec3::new(x, 0.05, z)),
        Color::srgb_u8(255, 211, 107),
    );
    gizmos.line(Vec3::ZERO, Vec3::Y * 2.0, Color::srgb_u8(109, 220, 255));
}
