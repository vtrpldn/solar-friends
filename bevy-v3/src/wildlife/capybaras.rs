use super::*;
use crate::{arrival::world_position, construction::STOCKPILE, terrain::Terrain};

#[derive(Component)]
pub(super) struct Capybara {
    start: f32,
    side: f64,
    position: Vec2,
}

#[derive(Component)]
pub(super) enum Joint {
    Body,
    Head,
    Leg(f32),
}

fn bank(terrain: &Terrain, z: f32, side: f64) -> Vec2 {
    let (center, width) = terrain.river(f64::from(z));
    Vec2::new((center + side * (width + 3.0)) as f32, z)
}

fn clear(village: &Village, point: Vec2) -> bool {
    point.abs().max_element() < 125.0 && village.wildlife_clear(point)
}

pub(super) fn update(
    mut commands: Commands,
    (setup, village, models, time): (Res<WorldSetup>, Res<Village>, Res<Models>, Res<Time>),
    mut clock: Local<VisitClock>,
    mut visitors: Query<(Entity, &mut Capybara, &Children, &mut Transform), Without<Joint>>,
    mut joints: Query<(&Joint, &mut Transform, Option<&Children>), Without<Capybara>>,
) {
    let serial = village.terrain_key().0;
    if setup.open || clock.session != Some(serial) {
        for (entity, ..) in &mut visitors {
            commands.entity(entity).despawn();
        }
        *clock = VisitClock {
            session: Some(serial),
            next: 25.0 + 60.0 * land_random(setup.seed() ^ 0xc47b)() as f32,
            ..default()
        };
        return;
    }
    if village.is_paused() || village.camp.is_none() {
        return;
    }
    clock.elapsed += time.delta_secs();
    if visitors.is_empty() {
        if clock.elapsed < clock.next {
            return;
        }
        let terrain = village.terrain(&setup);
        let mut random = land_random(setup.seed() ^ 0xc47b ^ clock.visits.wrapping_mul(0x9e3779b9));
        let stockpile = world_position(STOCKPILE.x as f32, STOCKPILE.y as f32);
        let start = stockpile.y + (random() as f32 - 0.5) * 30.0;
        let side = if random() < 0.5 { -1.0 } else { 1.0 };
        for offset in [0.0, 2.4] {
            let start = start + offset;
            if (0..25).all(|step| clear(&village, bank(&terrain, start + step as f32 * 0.2, side)))
            {
                spawn(
                    &mut commands,
                    &models,
                    Capybara {
                        start,
                        side,
                        position: bank(&terrain, start, side),
                    },
                );
            }
        }
        clock.elapsed = 0.0;
        clock.next = 100.0 + random() as f32 * 100.0;
        clock.visits = clock.visits.wrapping_add(1);
        return;
    }
    let terrain = village.terrain(&setup);
    let age = clock.elapsed;
    for (entity, mut animal, children, mut transform) in &mut visitors {
        if age >= 60.0 {
            commands.entity(entity).despawn();
            continue;
        }
        let travel = 0.2 * (age.min(12.0) + (age - 48.0).max(0.0));
        let next = bank(&terrain, animal.start + travel, animal.side);
        let walking = !(12.0..=48.0).contains(&age) && clear(&village, next);
        if walking {
            animal.position = next;
        }
        let Vec2 { x, y: z } = animal.position;
        let ahead = bank(&terrain, z + 0.1, animal.side);
        transform.translation = Vec3::new(x, terrain.height_at(x, z), z);
        transform.rotation = Quat::from_rotation_y((ahead.x - x).atan2(0.1));
        transform.scale = Vec3::splat((age / 2.0).min((60.0 - age) / 2.0).min(1.0));
        for child in children.iter() {
            let Ok((joint, mut pose, descendants)) = joints.get_mut(child) else {
                continue;
            };
            match *joint {
                Joint::Body => {
                    pose.translation.y = if walking {
                        (age * 5.0).sin().abs() * 0.025
                    } else {
                        (age * 1.5).sin() * 0.008
                    };
                    let head = descendants.and_then(|parts| parts.iter().next());
                    if let Some(head) = head
                        && let Ok((Joint::Head, mut pose, _)) = joints.get_mut(head)
                    {
                        pose.rotation = Quat::from_rotation_x(if walking {
                            0.0
                        } else {
                            0.18 + (age * 0.7).sin() * 0.12
                        });
                    }
                }
                Joint::Leg(phase) => {
                    pose.rotation = Quat::from_rotation_x(if walking {
                        (age * 5.0 + phase).sin() * 0.28
                    } else {
                        0.0
                    });
                }
                Joint::Head => {}
            }
        }
    }
}

fn spawn(commands: &mut Commands, models: &Models, animal: Capybara) {
    let [coat, dark] = &models.capybara;
    let shape = |mesh: &Handle<Mesh>,
                 material: &Handle<StandardMaterial>,
                 at: [f32; 3],
                 scale: [f32; 3]| {
        (
            Mesh3d(mesh.clone()),
            MeshMaterial3d(material.clone()),
            Transform::from_translation(at.into()).with_scale(scale.into()),
        )
    };
    let ball = |at, scale| shape(&models.shape, coat, at, scale);
    commands
        .spawn((
            animal,
            Name::new("Riverbank capybara"),
            Transform::from_scale(Vec3::ZERO),
            Visibility::Inherited,
        ))
        .with_children(|root| {
            root.spawn((Joint::Body, Transform::default(), Visibility::Inherited))
                .with_children(|body| {
                    body.spawn((
                        Joint::Head,
                        Transform::from_xyz(0.0, 0.79, 0.43),
                        Visibility::Inherited,
                    ))
                    .with_children(|head| {
                        head.spawn(ball([0.0, 0.0, 0.16], [0.19, 0.18, 0.36]));
                        head.spawn(ball([0.0, -0.035, 0.45], [0.17, 0.13, 0.19]));
                        for side in [-1.0, 1.0] {
                            head.spawn(ball([side * 0.14, 0.14, 0.0], [0.046, 0.07, 0.035]));
                            head.spawn(shape(
                                &models.shape,
                                dark,
                                [side * 0.16, 0.06, 0.19],
                                [0.013, 0.025, 0.025],
                            ));
                            head.spawn(shape(
                                &models.shape,
                                dark,
                                [side * 0.09, 0.065, 0.61],
                                [0.018, 0.013, 0.007],
                            ));
                        }
                    });
                    body.spawn(ball([0.0, 0.61, -0.06], [0.30, 0.36, 0.66]));
                    body.spawn(ball([0.0, 0.72, -0.34], [0.30, 0.30, 0.34]));
                });
            for x in [-0.21_f32, 0.21] {
                for z in [-0.4_f32, 0.4] {
                    let phase = if x.signum() == z.signum() {
                        0.0
                    } else {
                        std::f32::consts::PI
                    };
                    root.spawn((
                        Joint::Leg(phase),
                        Transform::from_xyz(x, 0.43, z),
                        Visibility::Inherited,
                    ))
                    .with_children(|leg| {
                        leg.spawn(shape(
                            &models.cube,
                            coat,
                            [0.0, -0.18, 0.0],
                            [0.11, 0.36, 0.13],
                        ));
                        leg.spawn(shape(
                            &models.cube,
                            coat,
                            [0.0, -0.39, 0.025],
                            [0.13, 0.08, 0.20],
                        ));
                    });
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn riverbank_visitors_spawn_walk_and_leave() {
        let mut app = App::new();
        let setup = WorldSetup::default().session();
        let terrain = setup.terrain();
        app.insert_resource(setup)
            .init_resource::<Village>()
            .init_resource::<Time>()
            .init_resource::<Assets<Mesh>>()
            .init_resource::<Assets<StandardMaterial>>()
            .add_systems(Startup, prepare_models)
            .add_systems(Update, update);
        app.world_mut().resource_mut::<Village>().camp = Some(IVec2::splat(36));
        app.update();

        let advance = |app: &mut App, seconds| {
            app.world_mut()
                .resource_mut::<Time>()
                .advance_by(Duration::from_secs(seconds));
            app.update();
        };
        advance(&mut app, 85);
        advance(&mut app, 3);
        let world = app.world_mut();
        let mut animals = world.query::<(&Capybara, &Transform)>();
        assert_eq!(animals.iter(world).count(), 2);
        for (animal, pose) in animals.iter(world) {
            let expected = bank(&terrain, animal.start + 0.6, animal.side);
            assert!(pose.translation.xz().abs_diff_eq(expected, 0.001));
            assert_eq!(pose.scale, Vec3::ONE);
        }

        advance(&mut app, 57);
        assert_eq!(animals.iter(app.world()).count(), 0);
    }
}
