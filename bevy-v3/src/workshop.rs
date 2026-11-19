use bevy::{
    input::mouse::{AccumulatedMouseMotion, AccumulatedMouseScroll, MouseScrollUnit},
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
    elevation: f32,
    rotation: u8,
    zoom: f32,
    target: Vec3,
    scale_figure: bool,
    night: bool,
    guides: bool,
    export_notice: String,
}

#[derive(Component)]
struct WorkshopModel;

#[derive(Component)]
struct ScaleFigure;

const DEFAULT_ELEVATION: f32 = 37.72;

fn orbit_camera(heading: f32, elevation: f32, target: Vec3) -> Transform {
    let yaw = heading + std::f32::consts::FRAC_PI_4;
    let (up, level) = elevation.to_radians().sin_cos();
    let offset = Vec3::new(yaw.sin() * level, up, yaw.cos() * level) * 57.2;
    Transform::from_translation(target + offset).looking_at(target, Vec3::Y)
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
        elevation: DEFAULT_ELEVATION,
        rotation: 0,
        zoom: 1.0,
        target: Vec3::Y,
        scale_figure: false,
        night: false,
        guides: false,
        export_notice: String::new(),
    })
    .add_systems(Startup, setup)
    .add_systems(
        Update,
        (
            controls,
            show_model,
            show_scale_figure,
            capture_preview,
            draw_guides,
        )
            .chain(),
    );
    crate::village::register_building_models(&mut app);
    crate::village::register_opening_models(&mut app);
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
        orbit_camera(0.0, DEFAULT_ELEVATION, Vec3::Y),
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
        ScaleFigure,
        crate::village::opening_model(&assets, 0),
        Transform::default(),
        Visibility::Hidden,
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
    (mouse, motion, scroll): (
        Res<ButtonInput<MouseButton>>,
        Res<AccumulatedMouseMotion>,
        Res<AccumulatedMouseScroll>,
    ),
    (catalog, window): (Res<Catalog>, Single<&Window>),
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
    if keys.just_pressed(KeyCode::KeyH) {
        workshop.scale_figure = !workshop.scale_figure;
    }
    if keys.just_pressed(KeyCode::KeyN) {
        workshop.night = !workshop.night;
    }
    if keys.just_pressed(KeyCode::Home) {
        workshop.heading = 0.0;
        workshop.elevation = DEFAULT_ELEVATION;
        workshop.rotation = 0;
        workshop.zoom = 1.0;
        workshop.target = Vec3::Y;
    }
    if keys.just_pressed(KeyCode::KeyR) {
        workshop.rotation = (workshop.rotation + 1) % 4;
    }
    let tilt =
        i8::from(keys.pressed(KeyCode::ArrowUp)) - i8::from(keys.pressed(KeyCode::ArrowDown));
    if tilt != 0 {
        workshop.elevation =
            (workshop.elevation + f32::from(tilt) * time.delta_secs() * 45.0).clamp(10.0, 80.0);
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
    if window.focused {
        let delta = motion.delta;
        if delta != Vec2::ZERO && mouse.pressed(MouseButton::Right) {
            let view = orbit_camera(workshop.heading, workshop.elevation, workshop.target);
            let project = &catalog.projects[&workshop.projects[workshop.selected]];
            let scale = viewport_height(project, workshop.zoom) / window.height().max(1.0);
            workshop.target += (-*view.right() * delta.x + *view.up() * delta.y) * scale;
        } else if delta != Vec2::ZERO && mouse.pressed(MouseButton::Left) {
            workshop.heading -= delta.x * 0.008;
            workshop.elevation = (workshop.elevation + delta.y * 0.25).clamp(10.0, 80.0);
        }
        if scroll.delta.y != 0.0 {
            let sensitivity = match scroll.unit {
                MouseScrollUnit::Line => 0.12,
                MouseScrollUnit::Pixel => 0.002,
            };
            workshop.zoom = (workshop.zoom * (-scroll.delta.y * sensitivity).exp()).clamp(0.3, 3.0);
        }
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
            .spawn((
                WorkshopModel,
                building_model(&assets, project.model),
                Transform::default(),
            ))
            .id();
        *preview = Some((project.model, entity));
    }
    if let Some((_, entity)) = *preview {
        commands
            .entity(entity)
            .insert(Transform::from_rotation(Quat::from_rotation_y(
                f32::from(workshop.rotation) * std::f32::consts::FRAC_PI_2,
            )));
    }
    let (transform, projection) = &mut *camera;
    **transform = orbit_camera(workshop.heading, workshop.elevation, workshop.target);
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
        "{} · {}/{} · {mode}\n{} × {} m · {}\n←/→ Model · ↑/↓ Tilt · Q/E Orbit · +/− Zoom · R Rotate\nDrag Orbit · Right-drag Pan · Scroll Zoom\nN Lighting · G Guides · H Scale figure · Home Reset · F5 Export PNG\n{}",
        project.name, workshop.selected + 1, workshop.projects.len(),
        project.size[0] * 2, project.size[1] * 2, project.category, workshop.export_notice,
    )));
}

fn show_scale_figure(
    workshop: Res<Workshop>,
    catalog: Res<Catalog>,
    mut figure: Single<(&mut Transform, &mut Visibility), With<ScaleFigure>>,
) {
    if !workshop.is_changed() {
        return;
    }
    let project = &catalog.projects[&workshop.projects[workshop.selected]];
    let (figure_transform, visibility) = &mut *figure;
    figure_transform.translation = scale_figure_position(project.size, workshop.rotation);
    **visibility = if workshop.scale_figure {
        Visibility::Visible
    } else {
        Visibility::Hidden
    };
}

fn capture_preview(
    mut commands: Commands,
    keys: Res<ButtonInput<KeyCode>>,
    (mut workshop, catalog): (ResMut<Workshop>, Res<Catalog>),
    mut panel: Single<&mut Node, With<Text>>,
    pending: Query<(), With<Screenshot>>,
    scene: Query<(&SceneInstance, Option<&WorkshopModel>, Option<&ScaleFigure>)>,
    spawner: Res<SceneSpawner>,
) {
    if !pending.is_empty() {
        return;
    }
    panel.display = Display::Flex;
    if !keys.just_pressed(KeyCode::F5) {
        return;
    }
    let ready = |model| {
        scene.iter().any(|(instance, workshop_model, figure)| {
            (if model {
                workshop_model.is_some()
            } else {
                figure.is_some()
            }) && spawner.instance_is_ready(**instance)
        })
    };
    if !ready(true) || workshop.scale_figure && !ready(false) {
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
        "model_rotation_degrees": u16::from(workshop.rotation) * 90,
        "metres_per_cell": 2,
        "scale_figure": workshop.scale_figure,
        "light": if workshop.night { "night" } else { "day" },
        "camera": {
            "projection": "orthographic",
            "target_metres": workshop.target.to_array(),
            "heading_degrees": (workshop.heading.to_degrees() + 45.0).rem_euclid(360.0),
            "elevation_degrees": workshop.elevation,
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

fn scale_figure_position(size: [i32; 2], rotation: u8) -> Vec3 {
    let width = size[usize::from(rotation % 2)] as f32;
    Vec3::new(width + 0.65, 0.0, 0.6)
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
    let [mut x, mut z] = project.size.map(|cells| cells as f32);
    if !workshop.rotation.is_multiple_of(2) {
        std::mem::swap(&mut x, &mut z);
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scale_figure_uses_the_rotated_footprint_edge() {
        assert_eq!(scale_figure_position([3, 8], 0), Vec3::new(3.65, 0.0, 0.6));
        assert_eq!(scale_figure_position([3, 8], 1), Vec3::new(8.65, 0.0, 0.6));
    }
}
