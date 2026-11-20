use bevy::{
    camera::primitives::{Aabb, MeshAabb},
    gltf::GltfMaterialExtras,
    math::Affine3A,
    prelude::*,
    scene::SceneInstanceReady,
    transform::helper::TransformHelper,
};

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
struct WindowSpill(Vec3);

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
    panes: Query<(
        &MeshMaterial3d<StandardMaterial>,
        &GltfMaterialExtras,
        &Mesh3d,
    )>,
    transforms: TransformHelper,
    (meshes, mut materials): (Res<Assets<Mesh>>, ResMut<Assets<StandardMaterial>>),
) {
    let Ok(project) = projects.get(event.entity) else {
        return;
    };
    let Ok(root) = transforms.compute_global_transform(event.entity) else {
        return;
    };
    let to_root = root.affine().inverse();
    let mut front = None;
    let mut windowed = false;
    for entity in descendants.iter_descendants(event.entity) {
        let Ok((material, extras, mesh)) = panes.get(entity) else {
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
        if let Some(bounds) = meshes.get(&mesh.0).and_then(MeshAabb::compute_aabb)
            && let Ok(transform) = transforms.compute_global_transform(entity)
        {
            let (center, spill) = window_spill(bounds, to_root * transform.affine());
            if front.is_none_or(|(z, _)| center.z > z) {
                front = Some((center.z, spill));
            }
        }
    }
    if windowed {
        let spill = front.map_or(Vec3::new(0.8, 1.4, 2.1), |(_, spill)| spill);
        commands.entity(event.entity).insert(WindowSpill(spill));
    }
}

fn window_spill(bounds: Aabb, to_root: Affine3A) -> (Vec3, Vec3) {
    let center: Vec3 = to_root.transform_point3a(bounds.center).into();
    let matrix = to_root.matrix3;
    let extents = matrix.x_axis.abs() * bounds.half_extents.x
        + matrix.y_axis.abs() * bounds.half_extents.y
        + matrix.z_axis.abs() * bounds.half_extents.z;
    let outward = if extents.x < extents.z {
        Vec3::X * if center.x < 0.0 { -1.0 } else { 1.0 }
    } else {
        Vec3::Z * if center.z < 0.0 { -1.0 } else { 1.0 }
    };
    (center, center + outward * 0.45)
}

fn update_lighting(
    (village, setup, catalog): (Res<Village>, Res<WorldSetup>, Res<Catalog>),
    camera: Single<&VillageCamera>,
    projects: Query<(&BuiltProject, &Transform, Option<&WindowSpill>), Without<BuildingLight>>,
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
            material.emissive = warm.to_linear() * (amount * 1.1);
            // Like the workshop's lamps: glow at face value instead of being scaled down
            // by the camera's exposure, which left powered windows nearly dark.
            material.emissive_exposure_weight = 0.0;
            pane.amount = amount;
        }
    }

    let mut candidates = Vec::new();
    if night > 0.0 {
        for (project, transform, spill) in &projects {
            if !powered(project.index) {
                continue;
            }
            let Some(kind) = village.construction.project_kind(&catalog, project.index) else {
                continue;
            };
            let offset = if let Some(spill) = spill {
                spill.0
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
                spill.is_some(),
            ));
        }
        candidates.sort_unstable_by(|a, b| a.0.total_cmp(&b.0).then(a.1.cmp(&b.1)));
    }
    for (slot, mut light, mut transform, mut visibility) in &mut lights {
        if let Some(&(_, _, position, windowed)) = candidates.get(slot.0) {
            // Bright enough to read next to the campfire (40 000), as V2's lamps do.
            light.intensity = night * if windowed { 12_000.0 } else { 30_000.0 };
            light.range = if windowed { 10.0 } else { 16.0 };
            transform.translation = position;
            *visibility = Visibility::Visible;
        } else if *visibility != Visibility::Hidden {
            *visibility = Visibility::Hidden;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rotated_window_spills_outside_the_wall_it_faces() {
        let bounds = Aabb::from_min_max(Vec3::new(-0.5, -0.4, -0.02), Vec3::new(0.5, 0.4, 0.02));
        let transform = Transform::from_xyz(-2.0, 1.5, 0.5)
            .with_rotation(Quat::from_rotation_y(std::f32::consts::FRAC_PI_2));
        let (center, light) = window_spill(bounds, transform.compute_affine());
        assert_eq!(center, transform.translation);
        assert!(light.abs_diff_eq(Vec3::new(-2.45, 1.5, 0.5), 1e-5));
    }
}
