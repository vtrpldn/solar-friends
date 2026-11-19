use std::time::Duration;

use bevy::{
    animation::{AnimationPlayer, graph::*, transition::AnimationTransitions},
    asset::{AssetPath, embedded_path},
    gltf::GltfAssetLabel,
    prelude::*,
    scene::SceneInstanceReady,
};

use crate::{setup::WorldSetup, village::Village};

const CLIPS: usize = 31;
const RESIDENTS: usize = 6;

// Matches the baked clip order in scripts/export-v3-opening-models.mjs.
#[derive(Clone, Copy, PartialEq, Eq)]
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
            .add_systems(PostUpdate, animate);
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
            },
        ));
    }
}

fn animate(
    setup: Option<Res<WorldSetup>>,
    village: Option<Res<Village>>,
    (rehearsals, previews): (Query<&RehearsalPose>, Query<&PreviewPose>),
    clips: Res<Assets<AnimationClip>>,
    library: Res<Library>,
    mut players: Query<(
        &mut AnimatedResident,
        &mut AnimationPlayer,
        &mut AnimationTransitions,
    )>,
) {
    for (mut resident, mut player, mut transitions) in &mut players {
        let preview = previews.get(resident.actor).ok();
        let (pose, paused) = if let Some(preview) = preview {
            (preview.0, true)
        } else if let Ok(rehearsal) = rehearsals.get(resident.actor) {
            (rehearsal.0, rehearsal.1)
        } else if let (Some(setup), Some(village)) = (&setup, &village) {
            (
                village.motion(resident.index),
                setup.open || village.is_paused(),
            )
        } else {
            (Motion::Idle, false)
        };
        let clip = resident.index * CLIPS + pose as usize;
        let index = library.indices[clip];
        if resident.pose != Some(pose) {
            transitions
                .play(
                    &mut player,
                    index,
                    if preview.is_some() {
                        Duration::ZERO
                    } else {
                        Duration::from_millis(450)
                    },
                )
                .repeat();
            resident.pose = Some(pose);
        }
        if let Some(active) = player.animation_mut(index) {
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
