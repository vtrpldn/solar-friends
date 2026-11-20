//! A paper loading screen while a newly opened village's models are still arriving, so
//! the player never watches the village pop in piece by piece.
//!
//! It arms whenever a village opens (leaving the title or setup screens, or launching
//! straight into one), shows only if loading takes longer than a moment, counts the
//! building and scenery models that have arrived, and closes when they all have.

use super::*;
use crate::{theme, ui_font::ui_font_styled, ui_font::ui_font_weight};

/// Loading shorter than this never shows the screen, to avoid a flash.
const SHOW_AFTER: f32 = 0.35;
/// A village that is still loading after this long is shown as it is.
const GIVE_UP: f32 = 30.0;

const LINES: [&str; 6] = [
    "Unpacking the village…",
    "Raising the roofs…",
    "Planting the trees…",
    "Filling the cisterns…",
    "Waking the residents…",
    "Lighting the fire circle…",
];

pub(super) fn install(app: &mut App) {
    app.init_resource::<Watching>()
        .add_systems(Startup, spawn)
        .add_systems(Update, (arm, show).chain());
}

#[derive(Component)]
struct Screen;

#[derive(Component)]
struct Fill;

#[derive(Component)]
struct Line;

#[derive(Component)]
struct Count;

fn spawn(mut commands: Commands, assets: Res<AssetServer>) {
    commands
        .spawn((
            Screen,
            Node {
                display: Display::None,
                position_type: PositionType::Absolute,
                left: px(0),
                right: px(0),
                top: px(0),
                bottom: px(0),
                align_items: AlignItems::Center,
                justify_content: JustifyContent::Center,
                ..default()
            },
            BackgroundColor(theme::TITLE_BG),
            GlobalZIndex(100),
            Interaction::None,
            bevy::ui::FocusPolicy::Block,
        ))
        .with_children(|screen| {
            screen
                .spawn(Node {
                    flex_direction: FlexDirection::Column,
                    align_items: AlignItems::Center,
                    row_gap: px(14),
                    width: px(380),
                    ..default()
                })
                .with_children(|stack| {
                    stack.spawn((
                        ImageNode::new(assets.load("embedded://solar_friends_v3/title-art.png")),
                        Node {
                            width: px(150),
                            aspect_ratio: Some(0.9),
                            ..default()
                        },
                    ));
                    stack.spawn((
                        Text::new("YOUR VILLAGE"),
                        ui_font_styled(&assets, 11.0, 750, theme::CAPTION),
                    ));
                    stack.spawn((
                        Line,
                        Text::new(LINES[0]),
                        ui_font_weight(&assets, 20.0, 700),
                    ));
                    stack
                        .spawn((
                            Node {
                                width: percent(100),
                                height: px(10),
                                border_radius: BorderRadius::all(px(5)),
                                overflow: Overflow::clip(),
                                ..default()
                            },
                            BackgroundColor(theme::TRACK),
                        ))
                        .with_child((
                            Fill,
                            Node {
                                width: percent(0),
                                height: percent(100),
                                border_radius: BorderRadius::all(px(5)),
                                ..default()
                            },
                            BackgroundColor(theme::LEAF),
                        ));
                    stack.spawn((
                        Count,
                        Text::default(),
                        ui_font_styled(&assets, 13.0, 500, theme::MUTED),
                    ));
                });
        });
}

/// Seconds since a village opened, while its models are still being watched.
#[derive(Resource, Default)]
struct Watching(Option<f32>);

/// Starts watching whenever a village opens, from the title or setup screens or at launch.
fn arm(
    setup: Res<WorldSetup>,
    village: Res<Village>,
    time: Res<Time<Real>>,
    mut watching: ResMut<Watching>,
    mut was_away: Local<Option<bool>>,
) {
    let away = setup.open || village.camp.is_none();
    if !away && was_away.is_none_or(|was| was) {
        watching.0 = Some(0.);
    } else if let Some(since) = &mut watching.0 {
        *since += time.delta_secs();
        if *since > GIVE_UP {
            watching.0 = None;
        }
    }
    *was_away = Some(away);
}

type Parts<'w, 's> = (
    Single<'w, 's, &'static mut Node, (With<Screen>, Without<Fill>)>,
    Single<'w, 's, &'static mut Node, (With<Fill>, Without<Screen>)>,
    Single<'w, 's, &'static mut Text, (With<Line>, Without<Count>)>,
    Single<'w, 's, &'static mut Text, (With<Count>, Without<Line>)>,
);

fn show(
    assets: Res<AssetServer>,
    mut watching: ResMut<Watching>,
    scenes: Query<&SceneRoot>,
    (mut screen, mut fill, mut line, mut count): Parts,
) {
    let total = scenes.iter().count();
    let ready = scenes
        .iter()
        .filter(|scene| assets.is_loaded_with_dependencies(&scene.0))
        .count();
    let Some(since) = watching.0 else {
        if screen.display != Display::None {
            screen.display = Display::None;
        }
        return;
    };
    if total > 0 && ready == total {
        watching.0 = None;
        screen.display = Display::None;
        return;
    }
    let display = if since >= SHOW_AFTER {
        Display::Flex
    } else {
        Display::None
    };
    if screen.display != display {
        screen.display = display;
    }
    let fraction = if total == 0 {
        0.
    } else {
        ready as f32 / total as f32
    };
    fill.width = percent(fraction * 100.);
    let wanted = LINES[(since / 2.2) as usize % LINES.len()];
    if line.0 != wanted {
        line.0 = wanted.into();
    }
    let wanted = format!("{ready} of {total} models ready");
    if count.0 != wanted {
        count.0 = wanted;
    }
}
