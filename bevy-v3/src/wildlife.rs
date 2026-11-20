use bevy::prelude::*;

use crate::{
    arrival::world_position,
    construction::STOCKPILE,
    setup::WorldSetup,
    terrain::{Terrain, land_random},
    village::Village,
};

mod capybaras;

const PALETTES: [[u32; 3]; 3] = [
    [0x79954a, 0x456d43, 0x6c9fc0],
    [0xa18b62, 0x6b7350, 0xe0b057],
    [0x9c977b, 0x667461, 0xd9c38c],
];

pub struct WildlifePlugin;

#[derive(Resource)]
pub(crate) struct WildlifePreview(pub(crate) u64);

impl Plugin for WildlifePlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, prepare_models)
            .add_systems(PostUpdate, (update_visitors, capybaras::update));
    }
}

#[derive(Resource)]
struct Models {
    shape: Handle<Mesh>,
    cube: Handle<Mesh>,
    capybara: [Handle<StandardMaterial>; 2],
    palettes: [[Handle<StandardMaterial>; 3]; 3],
    butterfly_body: Handle<StandardMaterial>,
    beak: Handle<StandardMaterial>,
}

fn prepare_models(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    let mut material = |rgb: u32| {
        materials.add(StandardMaterial {
            base_color: Color::srgb_u8((rgb >> 16) as u8, (rgb >> 8) as u8, rgb as u8),
            perceptual_roughness: 1.0,
            ..default()
        })
    };
    commands.insert_resource(Models {
        shape: meshes.add(Sphere::new(1.0).mesh().ico(0).expect("icosahedron")),
        cube: meshes.add(Cuboid::from_size(Vec3::ONE)),
        capybara: [material(0xa38653), material(0x342e25)],
        palettes: PALETTES.map(|palette| palette.map(&mut material)),
        butterfly_body: material(0x534b38),
        beak: material(0xb9a36d),
    });
}

#[derive(Default)]
struct VisitClock {
    session: Option<u64>,
    elapsed: f32,
    next: f32,
    visits: u32,
}

#[derive(Component)]
struct Visitor {
    butterfly: bool,
    began: f32,
    center: Vec2,
    direction: Vec2,
    phase: f32,
}

impl Visitor {
    fn progress(&self, age: f32) -> f32 {
        age / if self.butterfly { 24.0 } else { 18.0 }
    }

    fn transform(&self, terrain: &Terrain, age: f32) -> Transform {
        let (distance, sway_rate, sway_width, altitude) = if self.butterfly {
            (22.0, 1.7, 1.1, 1.1)
        } else {
            (100.0, 0.45, 0.8, 9.0)
        };
        let progress = self.progress(age);
        let sway = (age * sway_rate + self.phase).sin() * sway_width;
        let Vec2 { x, y: z } = self.center
            + self.direction * ((progress - 0.5) * distance)
            + self.direction.perp() * sway;
        Transform {
            translation: Vec3::new(
                x,
                terrain.height_at(x, z) + altitude + (age * 2.0 + self.phase).sin() * 0.15,
                z,
            ),
            rotation: Quat::from_rotation_y(self.direction.x.atan2(self.direction.y)),
            scale: Vec3::splat((progress * 8.0).min((1.0 - progress) * 8.0).min(1.0)),
        }
    }
}

#[derive(Component)]
struct Wing(f32);

fn update_visitors(
    mut commands: Commands,
    (setup, village, models, time): (Res<WorldSetup>, Res<Village>, Res<Models>, Res<Time>),
    preview: Option<Res<WildlifePreview>>,
    mut clock: Local<VisitClock>,
    mut visitors: Query<(Entity, &Visitor, &Children, &mut Transform), Without<Wing>>,
    mut wings: Query<(&Wing, &mut Transform), Without<Visitor>>,
) {
    const PREVIEW_RANDOM: f64 = 0.75;
    const PREVIEW_WARMUP: f32 = 27.0;
    let serial = village.terrain_key().0;
    let new_session = clock.session != Some(serial);
    let preview = preview.is_some_and(|preview| preview.0 == serial);
    let first_preview_visit = new_session && preview;
    if setup.open || new_session {
        for (entity, _, _, _) in &mut visitors {
            commands.entity(entity).despawn();
        }
        if new_session {
            *clock = VisitClock {
                session: Some(serial),
                next: 8.0 + land_random(setup.seed() ^ 0x785c)() as f32 * 15.0,
                ..default()
            };
        }
        if setup.open || !first_preview_visit {
            return;
        }
    }
    if village.is_paused() {
        return;
    }
    let Some(anchor) = village.camp.or(preview.then_some(STOCKPILE)) else {
        return;
    };
    clock.elapsed += time.delta_secs();
    let mut age = 0.0;
    if first_preview_visit {
        // V2 fast-forwards the initial cooldown to show a flock already in flight.
        clock.next = 8.0 + PREVIEW_RANDOM as f32 * 15.0;
        clock.elapsed += PREVIEW_WARMUP;
        age = PREVIEW_WARMUP - clock.next;
    }
    if clock.elapsed >= clock.next && visitors.is_empty() {
        let mut seeded = land_random(setup.seed() ^ clock.visits.wrapping_mul(0x9e3779b9));
        let mut random = || if preview { PREVIEW_RANDOM } else { seeded() };
        let butterfly = random() < 0.4;
        let count = if butterfly {
            1 + (random() * 2.0) as u32
        } else {
            2 + (random() * 3.0) as u32
        };
        let direction = Vec2::from_angle(random() as f32 * std::f32::consts::TAU);
        let center = world_position(anchor.x as f32, anchor.y as f32)
            + Vec2::new(random() as f32 - 0.5, random() as f32 - 0.5) * 32.0;
        let terrain = first_preview_visit.then(|| village.terrain(&setup));
        for index in 0..count {
            let visitor = Visitor {
                butterfly,
                began: clock.elapsed - age,
                center: center + direction.perp() * index as f32 * 1.7,
                direction,
                phase: random() as f32 * std::f32::consts::TAU,
            };
            let transform = terrain.as_ref().map_or_else(
                || Transform::from_scale(Vec3::splat(0.001)),
                |terrain| visitor.transform(terrain, age),
            );
            spawn_visitor(&mut commands, &models, setup.biome(), visitor, transform);
        }
        clock.next = clock.elapsed - age + 45.0 + random() as f32 * 65.0;
        clock.visits = clock.visits.wrapping_add(1);
    }
    if visitors.is_empty() {
        return;
    }
    let terrain = village.terrain(&setup);
    for (entity, visitor, children, mut transform) in &mut visitors {
        let age = clock.elapsed - visitor.began;
        if visitor.progress(age) >= 1.0 {
            commands.entity(entity).despawn();
            continue;
        }
        *transform = visitor.transform(&terrain, age);
        let (wing_rate, wing_range) = if visitor.butterfly {
            (22.0, 1.1)
        } else {
            (9.0, 0.6)
        };
        for child in children.iter() {
            if let Ok((wing, mut pose)) = wings.get_mut(child) {
                pose.rotation = Quat::from_rotation_z(
                    wing.0 * (age * wing_rate + visitor.phase).sin() * wing_range,
                );
            }
        }
    }
}

fn spawn_visitor(
    commands: &mut Commands,
    models: &Models,
    biome: usize,
    visitor: Visitor,
    transform: Transform,
) {
    let butterfly = visitor.butterfly;
    let [bird, wing, butterfly_wing] = &models.palettes[biome];
    let shape = |material: &Handle<StandardMaterial>, translation: Vec3, scale: Vec3| {
        (
            Mesh3d(models.shape.clone()),
            MeshMaterial3d(material.clone()),
            Transform::from_translation(translation).with_scale(scale),
        )
    };
    commands
        .spawn((
            visitor,
            Name::new("Wildlife visitor"),
            transform,
            Visibility::Inherited,
        ))
        .with_children(|body| {
            if butterfly {
                body.spawn(shape(
                    &models.butterfly_body,
                    Vec3::ZERO,
                    Vec3::new(0.035, 0.035, 0.12),
                ));
            } else {
                body.spawn(shape(bird, Vec3::ZERO, Vec3::new(0.14, 0.13, 0.32)));
                body.spawn(shape(
                    bird,
                    Vec3::new(0.0, 0.08, 0.28),
                    Vec3::new(0.12, 0.12, 0.13),
                ));
                body.spawn(shape(
                    &models.beak,
                    Vec3::new(0.0, 0.06, 0.41),
                    Vec3::new(0.045, 0.04, 0.09),
                ));
                body.spawn(shape(
                    wing,
                    Vec3::new(0.0, 0.0, -0.32),
                    Vec3::new(0.11, 0.035, 0.18),
                ));
            }
            for side in [-1.0, 1.0] {
                let (pivot, offset, scale, material) = if butterfly {
                    (0.02, 0.13, Vec3::new(0.16, 0.025, 0.14), butterfly_wing)
                } else {
                    (0.09, 0.30, Vec3::new(0.38, 0.025, 0.15), wing)
                };
                body.spawn((
                    Wing(side),
                    Transform::from_xyz(side * pivot, 0.0, 0.0),
                    Visibility::Inherited,
                ))
                .with_child(shape(material, Vec3::X * side * offset, scale));
            }
        });
}
