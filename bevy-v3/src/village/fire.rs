use bevy::prelude::*;

use super::{BuiltProject, Village};

#[derive(Component)]
pub(super) struct Flame {
    index: usize,
    phase: f32,
}

#[derive(Component)]
pub(super) struct FireLight(f32);

#[derive(Default)]
pub(super) struct FireAssets {
    cone: Handle<Mesh>,
    colors: [Handle<StandardMaterial>; 3],
}

pub(super) fn light_new_fires(
    mut commands: Commands,
    village: Res<Village>,
    projects: Query<(Entity, &BuiltProject), Added<BuiltProject>>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut fire_assets: Local<Option<FireAssets>>,
) {
    for (entity, project) in &projects {
        if !village.construction.is_fire_circle(project.index) {
            continue;
        }
        let assets = fire_assets.get_or_insert_with(|| FireAssets {
            cone: meshes.add(Cone {
                radius: 0.17,
                height: 0.7,
            }),
            colors: [
                Color::srgb_u8(248, 117, 32),
                Color::srgb_u8(255, 180, 47),
                Color::srgb_u8(255, 232, 160),
            ]
            .map(|base_color| {
                materials.add(StandardMaterial {
                    base_color,
                    unlit: true,
                    ..default()
                })
            }),
        });
        let phase = project.index as f32 * 2.73;
        for index in 0..5 {
            let inner = index == 4;
            let angle = index as f32 * std::f32::consts::FRAC_PI_2;
            let offset = if inner { 0.0 } else { 0.17 };
            commands.spawn((
                Flame { index, phase },
                Mesh3d(assets.cone.clone()),
                MeshMaterial3d(assets.colors[if inner { 2 } else { index % 2 }].clone()),
                Transform::from_xyz(angle.sin() * offset, 0.48, angle.cos() * offset),
                ChildOf(entity),
            ));
        }
        commands.spawn((
            FireLight(phase),
            PointLight {
                color: Color::srgb_u8(255, 174, 85),
                intensity: 950.0,
                range: 9.0,
                radius: 0.18,
                ..default()
            },
            Transform::from_xyz(0.0, 0.85, 0.0),
            ChildOf(entity),
        ));
    }
}

pub(super) fn animate_fires(
    time: Res<Time>,
    mut flames: Query<(&Flame, &mut Transform)>,
    mut lights: Query<(&FireLight, &mut PointLight)>,
) {
    for (flame, mut transform) in &mut flames {
        let time = time.elapsed_secs() + flame.phase;
        let index = flame.index as f32;
        let pulse =
            1.0 + (time * 5.3 + index * 1.7).sin() * 0.18 + (time * 8.1 + index).sin() * 0.08;
        let inner = flame.index == 4;
        let half_height = if inner { 0.25 } else { 0.35 };
        let width = if inner { 0.14 / 0.17 } else { 1.0 };
        transform.scale = Vec3::new(width, half_height / 0.35 * pulse, width);
        transform.translation.y = 0.18 + half_height * pulse;
        transform.rotation = Quat::from_rotation_z((time * 3.7 + index).sin() * 0.12);
    }
    for (fire, mut light) in &mut lights {
        let time = time.elapsed_secs() + fire.0;
        light.intensity = 950.0 + (time * 5.3).sin() * 86.0 + (time * 8.1).sin() * 65.0;
    }
}
