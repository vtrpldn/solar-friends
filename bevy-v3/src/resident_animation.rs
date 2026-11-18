use std::time::Duration;

use bevy::{
    animation::{AnimationPlayer, graph::*, transition::AnimationTransitions},
    asset::{AssetPath, embedded_path},
    gltf::GltfAssetLabel,
    prelude::*,
    scene::SceneInstanceReady,
};

use crate::{setup::WorldSetup, village::Village};

const CLIPS: usize = 10;
const RESIDENTS: usize = 5;

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
}

#[derive(Component)]
pub struct ResidentAnimation(pub usize);

#[derive(Component)]
struct AnimatedResident {
    index: usize,
    pose: Option<Motion>,
}

#[derive(Resource)]
struct Library {
    graph: Handle<AnimationGraph>,
    indices: Vec<AnimationNodeIndex>,
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
    let clips = (0..RESIDENTS * CLIPS).map(|index| {
        assets.load(
            source
                .clone()
                .with_label(GltfAssetLabel::Animation(index).to_string()),
        )
    });
    let (graph, indices) = AnimationGraph::from_clips(clips);
    commands.insert_resource(Library {
        graph: graphs.add(graph),
        indices,
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
                pose: None,
            },
        ));
    }
}

fn animate(
    setup: Res<WorldSetup>,
    village: Res<Village>,
    library: Res<Library>,
    mut players: Query<(
        &mut AnimatedResident,
        &mut AnimationPlayer,
        &mut AnimationTransitions,
    )>,
) {
    for (mut resident, mut player, mut transitions) in &mut players {
        let pose = village.motion(resident.index);
        let index = library.indices[resident.index * CLIPS + pose as usize];
        if resident.pose != Some(pose) {
            transitions
                .play(&mut player, index, Duration::from_millis(450))
                .repeat();
            resident.pose = Some(pose);
        }
        if let Some(active) = player.animation_mut(index) {
            if setup.open || village.is_paused() {
                active.pause();
            } else {
                active.resume();
            }
        }
    }
}
