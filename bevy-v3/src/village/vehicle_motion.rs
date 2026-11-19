use bevy::{prelude::*, scene::SceneInstanceReady};

use super::ArrivalActor;

#[derive(Component)]
struct Wheel {
    car: Entity,
    rest: Quat,
}

pub(super) fn install(app: &mut App) {
    app.add_observer(attach_wheels)
        .add_systems(Update, turn_wheels.after(super::animate_arrival));
}

pub(super) fn terrain_rotation(position: Vec2, yaw: f32, height: impl Fn(Vec2) -> f32) -> Quat {
    let (sin, cos) = yaw.sin_cos();
    let forward = Vec2::new(sin, cos) * 1.4;
    let right = Vec2::new(cos, -sin) * 0.8;
    let pitch = -(height(position + forward) - height(position - forward)).atan2(2.8);
    let roll = (height(position + right) - height(position - right)).atan2(1.6);
    Quat::from_euler(EulerRot::YXZ, yaw, pitch, roll)
}

fn attach_wheels(
    event: On<SceneInstanceReady>,
    mut commands: Commands,
    actors: Query<&ArrivalActor>,
    children: Query<&Children>,
    nodes: Query<(&Name, &Transform)>,
) {
    if !matches!(actors.get(event.entity), Ok(ArrivalActor::Car(_))) {
        return;
    }
    for entity in children.iter_descendants(event.entity) {
        if let Ok((name, transform)) = nodes.get(entity)
            && name.as_str().starts_with("vehicle-wheel-")
        {
            commands.entity(entity).insert(Wheel {
                car: event.entity,
                rest: transform.rotation,
            });
        }
    }
}

fn turn_wheels(
    cars: Query<&Transform, With<ArrivalActor>>,
    mut wheels: Query<(&Wheel, &mut Transform), Without<ArrivalActor>>,
) {
    for (wheel, mut transform) in &mut wheels {
        let Ok(car) = cars.get(wheel.car) else {
            continue;
        };
        let angle = (car.translation.z + 22.0) / 0.41;
        let rotation = wheel.rest * Quat::from_rotation_y(angle);
        if transform.rotation != rotation {
            transform.rotation = rotation;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vehicle_follows_the_grade_in_its_heading() {
        let height = |point: Vec2| point.y * 0.25;
        let rotated = terrain_rotation(Vec2::ZERO, 0.0, height) * Vec3::Z;
        assert!((rotated.y / rotated.z - 0.25).abs() < 1e-6);
    }
}
