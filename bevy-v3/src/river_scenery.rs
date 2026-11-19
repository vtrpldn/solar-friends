use bevy::prelude::*;

use crate::{
    LandMesh,
    terrain::{Terrain, land_random},
};

pub fn spawn_banks(
    commands: &mut Commands,
    meshes: &mut Assets<Mesh>,
    materials: &mut Assets<StandardMaterial>,
    terrain: &Terrain,
    dry_biome: bool,
    rock_mesh: Handle<Mesh>,
    rock_materials: &[Handle<StandardMaterial>; 3],
) {
    let mut random = land_random(terrain.seed ^ 0x81e6a);
    let reed = meshes.add(Cone::new(1.0, 1.0).mesh().resolution(3));
    let colors = if dry_biome {
        [Color::srgb_u8(142, 144, 89), Color::srgb_u8(170, 161, 107)]
    } else {
        [Color::srgb_u8(98, 125, 78), Color::srgb_u8(130, 150, 83)]
    }
    .map(|color| materials.add(color));
    let bank = |z, side, extra| {
        let (center, width) = terrain.river(z);
        (center + side * (width + extra)) as f32
    };
    for _ in 0..if dry_biome { 22 } else { 38 } {
        let z = -123.0 + random() * 246.0;
        let side = if random() < 0.5 { -1.0 } else { 1.0 };
        let x = bank(z, side, 0.65 + random() * 0.35);
        for _ in 0..2 + (random() * 5.0) as usize {
            let pebble_z = z + (random() - 0.5) * 2.6;
            let pebble_x = bank(pebble_z, side, 0.45 + random() * 0.9);
            let radius = (0.09 + random() * 0.18) as f32;
            let color = (random() * 3.0) as usize;
            let yaw = (random() * std::f64::consts::PI) as f32;
            let y = terrain.height_at(pebble_x, pebble_z as f32) + radius * 0.3;
            commands.spawn((
                LandMesh,
                Mesh3d(rock_mesh.clone()),
                MeshMaterial3d(rock_materials[color].clone()),
                Transform::from_xyz(pebble_x, y, pebble_z as f32)
                    .with_scale(Vec3::new(1.15, 0.65, 0.85) * radius)
                    .with_rotation(Quat::from_rotation_y(yaw)),
            ));
        }
        for index in 0..4 + (random() * 6.0) as usize {
            let height = (0.45 + random() * 0.65) as f32;
            let radius = (0.045 + random() * 0.035) as f32;
            let x = x + ((random() - 0.5) * 0.35) as f32;
            let z = (z + (random() - 0.5) * 1.5) as f32;
            let y = terrain.height_at(x, z) + height * 0.5 + 0.04;
            let lean = (random() as f32 - 0.5) * 0.25;
            let yaw = random() as f32 * std::f32::consts::PI;
            commands.spawn((
                LandMesh,
                Mesh3d(reed.clone()),
                MeshMaterial3d(colors[index % 2].clone()),
                Transform::from_xyz(x, y, z)
                    .with_scale(Vec3::new(radius, height, radius))
                    .with_rotation(Quat::from_euler(EulerRot::XYZ, lean, yaw, -lean)),
            ));
        }
    }

    let log_mesh = meshes.add(Cylinder::new(1.0, 1.0).mesh().resolution(7));
    let bark = materials.add(Color::srgb_u8(121, 102, 76));
    for _ in 0..5 {
        let z = -116.0 + random() * 232.0;
        let side = if random() < 0.5 { -1.0 } else { 1.0 };
        let x = bank(z, side, 1.15);
        let length = (1.1 + random() * 0.65) as f32;
        let radius = (0.11 + random() * 0.055) as f32;
        let tangent = Vec3::new(
            bank(z + 0.5, side, 1.15) - bank(z - 0.5, side, 1.15),
            0.0,
            1.0,
        );
        let y = terrain.height_at(x, z as f32) + radius + 0.04;
        commands.spawn((
            LandMesh,
            Mesh3d(log_mesh.clone()),
            MeshMaterial3d(bark.clone()),
            Transform::from_xyz(x, y, z as f32)
                .with_scale(Vec3::new(radius, length, radius))
                .with_rotation(Quat::from_rotation_arc(Vec3::Y, tangent.normalize())),
        ));
    }
}
