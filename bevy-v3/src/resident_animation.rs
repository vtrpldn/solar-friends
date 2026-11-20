use std::time::Duration;

use bevy::{
    animation::{AnimationPlayer, graph::*, transition::AnimationTransitions},
    app::AnimationSystems,
    asset::{AssetPath, embedded_path},
    gltf::GltfAssetLabel,
    prelude::*,
    scene::SceneInstanceReady,
};

use crate::{
    setup::WorldSetup,
    village::{Village, resident_motion::ResidentMotion},
};

const CLIPS: usize = 31;
const RESIDENTS: usize = 6;

// Matches the baked clip order in scripts/export-v3-opening-models.mjs.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Motion {
    Idle,
    Walk,
    CarryWalk,
    Work,
    Wash,
    Eat,
    Chat,
    Stretch,
    Chop,
    Rest,
    Read,
    GroundRead,
    FireSit,
    GroundRelax,
    Breathe,
    Yawn,
    NeckStretch,
    ShoulderRoll,
    Sit,
    Water,
    Tend,
    Carry,
    DuckWalk,
    Look,
    Bathe,
    Pee,
    Toilet,
    Play,
    Wave,
    Listen,
    Laugh,
}

impl Motion {
    fn is_gait(self) -> bool {
        matches!(self, Self::Walk | Self::CarryWalk | Self::DuckWalk)
    }
}

const START_SPEED: f32 = 0.12;
const STOP_SPEED: f32 = 0.06;
const STOP_HOLD: f32 = 0.14;

fn village_pose(
    current: Option<Motion>,
    requested: Motion,
    ground_speed: f32,
    still_time: &mut f32,
    dt: f32,
) -> Motion {
    if requested != Motion::Idle && !requested.is_gait() {
        *still_time = 0.0;
        return requested;
    }

    let current_gait = current.filter(|pose| pose.is_gait());
    if ground_speed >= START_SPEED || (current_gait.is_some() && ground_speed > STOP_SPEED) {
        *still_time = 0.0;
        return if requested.is_gait() {
            requested
        } else {
            current_gait.unwrap_or(Motion::Walk)
        };
    }

    if let Some(gait) = current_gait {
        *still_time += dt;
        if *still_time < STOP_HOLD {
            return gait;
        }
    }
    *still_time = 0.0;
    Motion::Idle
}

fn playback_speed(pose: Motion, ground_speed: f32, game_speed: f32) -> f32 {
    let reference_pace = match pose {
        Motion::Walk => 1.8,
        Motion::CarryWalk => 1.4,
        Motion::DuckWalk => 1.2,
        _ => return game_speed.sqrt().min(3.0),
    };
    let rate = ground_speed / reference_pace;
    // Match the ground at walking speeds and compress the fastest cycles
    // so a 16× simulation still shows recognizable steps.
    const FULL_RATE: f32 = 6.0;
    (rate.min(FULL_RATE) + (rate - FULL_RATE).max(0.0) * 0.65).min(13.0)
}

#[derive(Component)]
pub struct ResidentAnimation(pub usize);

#[derive(Component)]
pub struct RehearsalPose(pub Motion, pub bool);

#[derive(Component)]
pub struct PreviewPose(pub Motion, pub f32);

#[derive(Component)]
struct AnimatedResident {
    index: usize,
    actor: Entity,
    pose: Option<Motion>,
    still_time: f32,
    paused_transitions: Option<AnimationTransitions>,
}

#[derive(Resource)]
struct Library {
    graph: Handle<AnimationGraph>,
    indices: Vec<AnimationNodeIndex>,
    clips: Vec<Handle<AnimationClip>>,
}

pub struct ResidentAnimationPlugin;

impl Plugin for ResidentAnimationPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, load_graph)
            .add_observer(bind_animation_player)
            .add_systems(PostUpdate, animate.before(AnimationSystems));
    }
}

fn load_graph(
    mut commands: Commands,
    assets: Res<AssetServer>,
    mut graphs: ResMut<Assets<AnimationGraph>>,
) {
    let source = AssetPath::from_path_buf(embedded_path!("opening.glb")).with_source("embedded");
    let clips: Vec<_> = (0..RESIDENTS * CLIPS)
        .map(|index| {
            assets.load(
                source
                    .clone()
                    .with_label(GltfAssetLabel::Animation(index).to_string()),
            )
        })
        .collect();
    let (graph, indices) = AnimationGraph::from_clips(clips.iter().cloned());
    commands.insert_resource(Library {
        graph: graphs.add(graph),
        indices,
        clips,
    });
}

fn bind_animation_player(
    event: On<SceneInstanceReady>,
    mut commands: Commands,
    library: Res<Library>,
    residents: Query<&ResidentAnimation>,
    children: Query<&Children>,
    players: Query<(), With<AnimationPlayer>>,
) {
    let Ok(resident) = residents.get(event.entity) else {
        return;
    };
    for child in children
        .iter_descendants(event.entity)
        .filter(|entity| players.contains(*entity))
    {
        commands.entity(child).insert((
            AnimationGraphHandle(library.graph.clone()),
            AnimationTransitions::new(),
            AnimatedResident {
                index: resident.0,
                actor: event.entity,
                pose: None,
                still_time: 0.0,
                paused_transitions: None,
            },
        ));
    }
}

fn animate(
    (time, setup): (Res<Time>, Option<Res<WorldSetup>>),
    village: Option<Res<Village>>,
    (rehearsals, previews, motions): (
        Query<&RehearsalPose>,
        Query<&PreviewPose>,
        Query<&ResidentMotion>,
    ),
    clips: Res<Assets<AnimationClip>>,
    (catalog, land): (
        Option<Res<crate::catalog::Catalog>>,
        Option<Res<crate::land::Land>>,
    ),
    library: Res<Library>,
    mut players: Query<(
        &mut AnimatedResident,
        &mut AnimationPlayer,
        &mut AnimationTransitions,
    )>,
) {
    for (mut resident, mut player, mut transitions) in &mut players {
        let preview = previews.get(resident.actor).ok();
        let rehearsal = rehearsals.get(resident.actor).ok();
        let motion = if preview.is_none() && rehearsal.is_none() {
            motions.get(resident.actor).ok()
        } else {
            None
        };
        let (mut pose, mut paused) = if let Some(preview) = preview {
            (preview.0, true)
        } else if let Some(rehearsal) = rehearsal {
            (rehearsal.0, rehearsal.1)
        } else if let (Some(setup), Some(village), Some(catalog), Some(land)) =
            (&setup, &village, &catalog, &land)
        {
            (
                village.motion(resident.index, catalog, land),
                setup.open || village.is_paused(),
            )
        } else {
            (Motion::Idle, false)
        };
        if let Some(motion) = motion {
            paused |= motion.paused;
            pose = if paused {
                resident.pose.unwrap_or(pose)
            } else {
                village_pose(
                    resident.pose,
                    pose,
                    motion.ground_speed,
                    &mut resident.still_time,
                    time.delta_secs(),
                )
            };
        }
        if let Some(saved_transitions) = resident.paused_transitions.take() {
            *transitions = saved_transitions;
            if !paused {
                for (_, active) in player.playing_animations_mut() {
                    active.resume();
                }
            }
        }
        let clip = resident.index * CLIPS + pose as usize;
        let index = library.indices[clip];
        if resident.pose != Some(pose) {
            transitions
                .play(
                    &mut player,
                    index,
                    if preview.is_some() {
                        Duration::ZERO
                    } else if let Some(motion) = motion {
                        let seconds =
                            if pose.is_gait() || resident.pose.is_some_and(Motion::is_gait) {
                                0.14
                            } else {
                                0.30
                            };
                        Duration::from_secs_f32(seconds / motion.game_speed.sqrt().min(2.0))
                    } else {
                        Duration::from_millis(450)
                    },
                )
                .repeat();
            resident.pose = Some(pose);
        }
        if let Some(motion) = motion {
            if paused {
                // Bevy advances fade weights independently of clip time.
                resident.paused_transitions = Some(std::mem::take(&mut *transitions));
            }
            for (node, active) in player.playing_animations_mut() {
                if paused {
                    active.pause();
                } else {
                    active.resume();
                    // Outgoing clips keep their own cadence until the fade ends.
                    if *node == index {
                        active.set_speed(playback_speed(
                            pose,
                            motion.ground_speed,
                            motion.game_speed,
                        ));
                    }
                }
            }
        } else if let Some(active) = player.animation_mut(index) {
            if let Some((preview, clip)) = preview.zip(clips.get(&library.clips[clip])) {
                active.set_seek_time(preview.1.rem_euclid(clip.duration().max(f32::EPSILON)));
            }
            if paused {
                active.pause();
            } else {
                active.resume();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gait_cadence_follows_rendered_speed_with_a_high_speed_limit() {
        assert_eq!(playback_speed(Motion::Walk, 0.0, 1.0), 0.0);
        assert_eq!(playback_speed(Motion::Walk, 0.9, 1.0), 0.5);
        assert_eq!(playback_speed(Motion::Walk, 1.8, 16.0), 1.0);
        assert_eq!(playback_speed(Motion::CarryWalk, 1.4, 1.0), 1.0);
        assert_eq!(playback_speed(Motion::DuckWalk, 1.2, 1.0), 1.0);
        assert_eq!(playback_speed(Motion::Walk, 7.2, 4.0), 4.0);
        let fast = playback_speed(Motion::Walk, 14.4, 8.0);
        let fastest = playback_speed(Motion::Walk, 28.8, 16.0);
        assert!(fast > 7.0 && fastest > fast && fastest <= 13.0);
        assert_eq!(playback_speed(Motion::Walk, 100.0, 16.0), 13.0);
        assert_eq!(playback_speed(Motion::Work, 0.0, 16.0), 3.0);
    }

    #[test]
    fn a_brief_stop_keeps_the_gait_but_a_sustained_stop_goes_idle() {
        let mut still = 0.0;
        let mut pose = Some(Motion::CarryWalk);
        for (requested, speed, expected) in [
            (Motion::Idle, 0.0, Motion::CarryWalk),
            (Motion::CarryWalk, 0.08, Motion::CarryWalk),
            (Motion::Idle, 0.0, Motion::CarryWalk),
            (Motion::Walk, 0.0, Motion::CarryWalk),
            (Motion::Walk, 0.0, Motion::Idle),
            (Motion::Walk, 0.08, Motion::Idle),
            (Motion::Walk, 0.12, Motion::Walk),
            (Motion::Work, 0.0, Motion::Work),
        ] {
            let next = village_pose(pose, requested, speed, &mut still, 0.05);
            assert_eq!(next, expected);
            pose = Some(next);
        }
    }
}
