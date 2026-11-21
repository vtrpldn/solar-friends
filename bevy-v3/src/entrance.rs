//! The plot entrance where the access road crosses the map edge: V2's clay-roof portal,
//! its short fence wings and the roadside electricity pole whose cables run off to town.

use bevy::{
    asset::{AssetPath, embedded_asset, embedded_path},
    gltf::GltfAssetLabel,
    prelude::*,
};

use crate::{
    arrival::{MAP_START, road_center},
    terrain::Terrain,
};

const PORTAL: usize = 0;
const POLE: usize = 1;
const ENTRANCE_Z: f32 = MAP_START + 5.0;
const POLE_SIDE: f32 = 6.8;
const CABLE_HEIGHT: f32 = 6.55;
const CABLE_SEGMENTS: usize = 8;

pub struct EntrancePlugin;

impl Plugin for EntrancePlugin {
    fn build(&self, app: &mut App) {
        embedded_asset!(app, "entrance.glb");
    }
}

fn model(assets: &AssetServer, index: usize) -> SceneRoot {
    let path = AssetPath::from_path_buf(embedded_path!("entrance.glb")).with_source("embedded");
    SceneRoot(assets.load(path.with_label(GltfAssetLabel::Scene(index).to_string())))
}

/// Spawns the entrance pieces, each tagged with `marker` so the caller can clear them on redraw.
pub fn spawn(
    commands: &mut Commands,
    assets: &AssetServer,
    meshes: &mut Assets<Mesh>,
    materials: &mut Assets<StandardMaterial>,
    terrain: &Terrain,
    marker: impl Bundle + Clone,
) {
    let ground = |x: f32, z: f32| Vec3::new(x, terrain.height_at(x, z), z);
    let entrance_x = road_center(ENTRANCE_Z);
    commands.spawn((
        marker.clone(),
        model(assets, PORTAL),
        Transform::from_translation(ground(entrance_x, ENTRANCE_Z)),
    ));

    // Open fence wings: posts and rails stand outside both lanes.
    let post_mesh = meshes.add(Cuboid::new(0.19, 1.4, 0.19));
    let rail_mesh = meshes.add(Cuboid::new(2.5, 0.12, 0.1));
    let post_material = materials.add(Color::srgb_u8(0x87, 0x67, 0x49));
    let rail_material = materials.add(Color::srgb_u8(0xb1, 0x9a, 0x6a));
    for side in [-1.0f32, 1.0] {
        let inner = ground(entrance_x + side * 5.1, ENTRANCE_Z);
        let outer = ground(entrance_x + side * 7.6, ENTRANCE_Z);
        for post in [inner, outer] {
            commands.spawn((
                marker.clone(),
                Mesh3d(post_mesh.clone()),
                MeshMaterial3d(post_material.clone()),
                Transform::from_translation(post + Vec3::Y * 0.7),
            ));
        }
        let span = outer - inner;
        for height in [0.5, 1.0] {
            commands.spawn((
                marker.clone(),
                Mesh3d(rail_mesh.clone()),
                MeshMaterial3d(rail_material.clone()),
                Transform::from_translation((inner + outer) * 0.5 + Vec3::Y * height)
                    .with_rotation(Quat::from_rotation_z((span.y / span.x).atan()))
                    .with_scale(Vec3::new(span.length() / 2.5, 1.0, 1.0)),
            ));
        }
    }

    let pole_z = ENTRANCE_Z + 3.0;
    let pole = ground(road_center(pole_z) + POLE_SIDE, pole_z);
    commands.spawn((
        marker.clone(),
        model(assets, POLE),
        Transform::from_translation(pole),
    ));

    // The supply cables sag gently on their way off the map, towards town.
    let edge = ground(road_center(MAP_START) + POLE_SIDE, MAP_START);
    let cable_mesh = meshes.add(Cylinder::new(0.018, 1.0));
    let cable_material = materials.add(Color::srgb_u8(0x33, 0x4f, 0x4e));
    for offset in [-0.75, 0.0, 0.75] {
        let start = pole + Vec3::new(offset, CABLE_HEIGHT, 0.0);
        let end = edge + Vec3::new(offset, CABLE_HEIGHT, 0.0);
        let middle = start.lerp(end, 0.5) - Vec3::Y * 0.4;
        let point = |t: f32| {
            let u = 1.0 - t;
            start * u * u + middle * 2.0 * u * t + end * t * t
        };
        for segment in 0..CABLE_SEGMENTS {
            let a = point(segment as f32 / CABLE_SEGMENTS as f32);
            let b = point((segment + 1) as f32 / CABLE_SEGMENTS as f32);
            let along = b - a;
            commands.spawn((
                marker.clone(),
                Mesh3d(cable_mesh.clone()),
                MeshMaterial3d(cable_material.clone()),
                Transform::from_translation((a + b) * 0.5)
                    .with_rotation(Quat::from_rotation_arc(Vec3::Y, along.normalize()))
                    .with_scale(Vec3::new(1.0, along.length(), 1.0)),
            ));
        }
    }
}
