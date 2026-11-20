use bevy::{math::EulerRot, prelude::*, scene::SceneInstanceReady};

use super::{BuiltProject, Village, outdoor_animation_time};
use crate::setup::WorldSetup;

enum Joint {
    Body,
    Head,
    Tail,
    Leg(usize),
}

#[derive(Component)]
struct LivestockJoint {
    joint: Joint,
    goat: bool,
    phase: f32,
    rest: Transform,
}

pub(super) fn install(app: &mut App) {
    app.add_observer(collect_joints)
        .add_systems(Update, animate.after(super::show_construction));
}

fn collect_joints(
    event: On<SceneInstanceReady>,
    mut commands: Commands,
    projects: Query<&BuiltProject>,
    descendants: Query<&Children>,
    nodes: Query<(&Name, &Transform)>,
) {
    let Ok(project) = projects.get(event.entity) else {
        return;
    };
    for entity in descendants.iter_descendants(event.entity) {
        let Ok((name, rest)) = nodes.get(entity) else {
            continue;
        };
        let Some((goat, index, joint)) = parse_joint(name.as_str()) else {
            continue;
        };
        commands.entity(entity).insert(LivestockJoint {
            joint,
            goat,
            phase: project.index as f32 * 2.73 + index as f32 * 5.37,
            rest: *rest,
        });
    }
}

fn parse_joint(name: &str) -> Option<(bool, usize, Joint)> {
    let (kind, rest) = name.strip_prefix("livestock-")?.split_once('-')?;
    let goat = match kind {
        "goat" => true,
        "chicken" => false,
        _ => return None,
    };
    let (index, joint) = rest.split_once('-')?;
    let joint = match joint {
        "body" => Joint::Body,
        "head" => Joint::Head,
        "tail" => Joint::Tail,
        leg => Joint::Leg(leg.strip_prefix("leg-")?.parse::<usize>().ok()?.min(3)),
    };
    Some((goat, index.parse().ok()?, joint))
}

fn animate(
    village: Res<Village>,
    setup: Res<WorldSetup>,
    mut joints: Query<(&LivestockJoint, &mut Transform)>,
) {
    if setup.open {
        return;
    }
    let elapsed = outdoor_animation_time(village.seconds());
    for (joint, mut transform) in &mut joints {
        let time = elapsed + joint.phase;
        let envelope = (time * 0.35).sin();
        let walk = envelope.max(0.0).powi(4);
        let goat = joint.goat;
        let mut pose = joint.rest;
        match joint.joint {
            Joint::Body => {
                let direction = if goat { Vec3::X } else { Vec3::Z };
                pose.translation += direction * (0.22 * envelope * walk);
                pose.rotation =
                    Quat::from_rotation_y((time * 0.7).sin() * 0.12 * (1.0 - walk)) * pose.rotation;
            }
            Joint::Head => {
                let peck = (((time * if goat { 1.1 } else { 3.1 }).sin() + 1.0) * 0.5).powi(4)
                    * (1.0 - walk);
                let tilt = if goat {
                    (0.0, -peck * 0.75)
                } else {
                    (peck * 0.85, 0.0)
                };
                pose.rotation *=
                    Quat::from_euler(EulerRot::XYZ, tilt.0, (time * 0.6).sin() * 0.12, tilt.1);
            }
            Joint::Tail => pose.rotation *= Quat::from_rotation_x((time * 3.3).sin() * 0.12),
            Joint::Leg(index) => {
                let stride = (time * if goat { 5.0 } else { 9.0 }).sin() * walk;
                pose.rotation *= if goat {
                    Quat::from_rotation_z(stride * 0.22 * [1.0, -1.0, -1.0, 1.0][index])
                } else {
                    Quat::from_rotation_x(stride * 0.3 * if index == 0 { -1.0 } else { 1.0 })
                };
            }
        }
        transform.set_if_neq(pose);
    }
}
