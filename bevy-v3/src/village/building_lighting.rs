use bevy::{gltf::GltfMaterialExtras, prelude::*, scene::SceneInstanceReady};

use super::{BuiltProject, Village};
use crate::{VillageCamera, catalog::Catalog, setup::WorldSetup, weather::sun_height};

const LIGHT_LIMIT: usize = 8;

#[derive(Component)]
struct WindowPane {
    project: usize,
    original: Color,
    amount: f32,
}

#[derive(Component)]
struct Windowed;

#[derive(Component)]
struct BuildingLight(usize);

pub(super) fn install(app: &mut App) {
    app.add_observer(collect_windows)
        .add_systems(Startup, spawn_lights)
        .add_systems(Update, update_lighting.after(super::show_construction));
}

fn spawn_lights(mut commands: Commands) {
    for slot in 0..LIGHT_LIMIT {
        commands.spawn((
            BuildingLight(slot),
            PointLight {
                color: Color::srgb_u8(255, 203, 118),
                intensity: 0.0,
                range: 10.0,
                ..default()
            },
            Visibility::Hidden,
        ));
    }
}

fn collect_windows(
    event: On<SceneInstanceReady>,
    mut commands: Commands,
    projects: Query<&BuiltProject>,
    descendants: Query<&Children>,
    panes: Query<(&MeshMaterial3d<StandardMaterial>, &GltfMaterialExtras)>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    let Ok(project) = projects.get(event.entity) else {
        return;
    };
    let mut windowed = false;
    for entity in descendants.iter_descendants(event.entity) {
        let Ok((material, extras)) = panes.get(entity) else {
            continue;
        };
        if !serde_json::from_str::<serde_json::Value>(&extras.value)
            .is_ok_and(|data| data["windowPane"] == true)
        {
            continue;
        }
        let Some(material) = materials.get(&material.0).cloned() else {
            continue;
        };
        let original = material.base_color;
        commands.entity(entity).insert((
            MeshMaterial3d(materials.add(material)),
            WindowPane {
                project: project.index,
                original,
                amount: -1.0,
            },
        ));
        windowed = true;
    }
    if windowed {
        commands.entity(event.entity).insert(Windowed);
    }
}

fn update_lighting(
    (village, setup, catalog): (Res<Village>, Res<WorldSetup>, Res<Catalog>),
    camera: Single<&VillageCamera>,
    projects: Query<(&BuiltProject, &Transform, Has<Windowed>), Without<BuildingLight>>,
    mut panes: Query<(&mut WindowPane, &MeshMaterial3d<StandardMaterial>)>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut lights: Query<(
        &BuildingLight,
        &mut PointLight,
        &mut Transform,
        &mut Visibility,
    )>,
) {
    let night = if setup.open {
        0.0
    } else {
        1.0 - (sun_height(village.seconds()) as f32 * 5.0).min(1.0)
    };
    let powered = |project| village.construction.utilities.powered(project);
    let warm = Color::srgb_u8(255, 210, 154);
    for (mut pane, material) in &mut panes {
        let amount = if powered(pane.project) { night } else { 0.0 };
        if (pane.amount - amount).abs() > 0.001
            && let Some(material) = materials.get_mut(&material.0)
        {
            material.base_color = pane.original.mix(&warm, amount * 0.65);
            material.emissive = warm.to_linear() * (amount * 0.85);
            pane.amount = amount;
        }
    }

    let mut candidates = Vec::new();
    if night > 0.0 {
        for (project, transform, windowed) in &projects {
            if !powered(project.index) {
                continue;
            }
            let Some(kind) = village.construction.project_kind(&catalog, project.index) else {
                continue;
            };
            let offset = if windowed {
                Vec3::new(0.8, 1.4, 2.1)
            } else {
                let height = match kind {
                    "streetlight" => 2.7,
                    "home" | "kitchen" | "workshop" | "shed" | "warehouse" | "square" => 1.6,
                    _ => continue,
                };
                Vec3::Y * height
            };
            let distance = transform.translation.distance_squared(camera.target);
            candidates.push((
                distance,
                project.index,
                transform.transform_point(offset),
                windowed,
            ));
        }
        candidates.sort_unstable_by(|a, b| a.0.total_cmp(&b.0).then(a.1.cmp(&b.1)));
    }
    for (slot, mut light, mut transform, mut visibility) in &mut lights {
        if let Some(&(_, _, position, windowed)) = candidates.get(slot.0) {
            light.intensity = night * if windowed { 150.0 } else { 520.0 };
            light.range = if windowed { 5.0 } else { 10.0 };
            transform.translation = position;
            *visibility = Visibility::Visible;
        } else if *visibility != Visibility::Hidden {
            *visibility = Visibility::Hidden;
        }
    }
}
