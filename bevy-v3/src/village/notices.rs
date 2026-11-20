//! Village news and map readouts, each where the player will look for it:
//!
//! - what changed (a project's progress, a village event, a save) arrives as a short
//!   toast above the dock and fades;
//! - the first camp's goals stay in a small checklist under the stat cards;
//! - what lies under the cursor, and whether a placement works there, follows the
//!   cursor;
//! - an active map lens explains its colours with swatches.

use std::collections::VecDeque;

use bevy::ui::UiGlobalTransform;

use super::*;
use crate::{theme, ui_font::ui_font_styled, ui_font::ui_font_weight};

/// Seconds a toast stays, the last of which it spends fading.
const TOAST_SECONDS: f32 = 6.0;
const TOAST_LIMIT: usize = 3;

pub(super) fn install(app: &mut App) {
    app.init_resource::<News>()
        .add_systems(Startup, spawn)
        .add_systems(
            Update,
            (collect_news, show_toasts, show_goals, show_tip, show_legend).after(show_hud),
        );
}

struct Toast {
    title: Option<String>,
    body: String,
    age: f32,
}

/// Latest progress, latest event, save notice, advance result and action feedback.
type Snapshot = (Option<String>, Option<String>, String, String, String);

#[derive(Resource, Default)]
struct News {
    toasts: VecDeque<Toast>,
    /// What was last seen, so only changes become toasts.
    seen: Option<Snapshot>,
}

#[derive(Component)]
struct ToastStack;

#[derive(Component)]
struct GoalCard;

#[derive(Component)]
struct GoalRow(usize);

#[derive(Component)]
struct GoalDot(usize);

#[derive(Component)]
struct GoalHeading;

#[derive(Component)]
struct CursorTip;

#[derive(Component)]
struct CursorTipText;

#[derive(Component)]
struct LegendCard;

#[derive(Component)]
struct LegendRows;

fn paper_card(node: Node) -> impl Bundle {
    (theme::panel_node(node), theme::panel())
}

fn spawn(mut commands: Commands, assets: Res<AssetServer>) {
    commands.spawn((
        ToastStack,
        Node {
            position_type: PositionType::Absolute,
            left: px(22),
            bottom: px(120),
            width: px(320),
            flex_direction: FlexDirection::ColumnReverse,
            row_gap: px(8),
            ..default()
        },
        Pickable::IGNORE,
        GlobalZIndex(6),
    ));
    commands
        .spawn((
            GoalCard,
            BelowTopBar,
            paper_card(Node {
                display: Display::None,
                position_type: PositionType::Absolute,
                left: px(22),
                top: px(top_bar_clearance()),
                padding: UiRect::axes(px(14), px(10)),
                flex_direction: FlexDirection::Column,
                row_gap: px(5),
                ..default()
            }),
            Pickable::IGNORE,
        ))
        .with_children(|card| {
            card.spawn((
                GoalHeading,
                Text::new("FIRST CAMP"),
                ui_font_styled(&assets, 11.0, 750, theme::CAPTION),
            ));
            for index in 0..3 {
                card.spawn((
                    GoalRow(index),
                    Node {
                        align_items: AlignItems::Center,
                        column_gap: px(8),
                        ..default()
                    },
                ))
                .with_children(|row| {
                    row.spawn((
                        GoalDot(index),
                        Node {
                            width: px(10),
                            height: px(10),
                            border: UiRect::all(px(2)),
                            border_radius: BorderRadius::all(px(5)),
                            ..default()
                        },
                        BorderColor::all(theme::LEAF),
                    ));
                    row.spawn((Text::default(), ui_font_weight(&assets, 14.0, 500)));
                });
            }
        });
    commands
        .spawn((
            CursorTip,
            paper_card(Node {
                display: Display::None,
                position_type: PositionType::Absolute,
                max_width: px(300),
                padding: UiRect::axes(px(12), px(7)),
                ..default()
            }),
            Pickable::IGNORE,
            GlobalZIndex(30),
        ))
        .with_child((
            CursorTipText,
            Text::default(),
            ui_font_weight(&assets, 13.0, 500),
        ));
    commands
        .spawn((
            LegendCard,
            paper_card(Node {
                display: Display::None,
                position_type: PositionType::Absolute,
                right: px(22),
                top: px(RIGHT_PANEL_TOP),
                width: px(260),
                padding: UiRect::all(px(14)),
                flex_direction: FlexDirection::Column,
                row_gap: px(6),
                ..default()
            }),
            Pickable::IGNORE,
            GlobalZIndex(11),
        ))
        .with_child((
            LegendRows,
            Node {
                flex_direction: FlexDirection::Column,
                row_gap: px(6),
                ..default()
            },
        ));
}

/// "Fire circle: Complete" reads as a titled toast; other news is a single line.
fn toast(text: &str) -> Toast {
    let (title, body) = match text.split_once(": ") {
        Some((title, body)) if !title.contains(' ') || title.len() < 32 => {
            (Some(title.to_owned()), body.to_owned())
        }
        _ => (None, text.to_owned()),
    };
    Toast {
        title,
        body,
        age: 0.,
    }
}

/// Whether a sheet sits where toasts appear: the build catalog, a dialog or the guide.
fn covered(village: &Village) -> bool {
    village.modal_panel() || village.guide.open() || village.construction.menu
}

fn collect_news(
    village: Res<Village>,
    catalog: Res<Catalog>,
    setup: Res<WorldSetup>,
    time: Res<Time<Real>>,
    mut news: ResMut<News>,
) {
    // Toasts wait, without ageing, while a sheet covers their place above the dock.
    let delta = if covered(&village) {
        0.
    } else {
        time.delta_secs()
    };
    for toast in &mut news.toasts {
        toast.age += delta;
    }
    news.toasts.retain(|toast| toast.age < TOAST_SECONDS);
    if setup.open || village.camp.is_none() {
        news.seen = None;
        return;
    }
    let now = (
        village.construction.latest_progress(&catalog),
        village.construction.latest_event().map(str::to_owned),
        village.save_notice.clone(),
        village.advance.result().to_owned(),
        village.construction.construction_notice().to_owned(),
    );
    let Some(seen) = news.seen.replace(now.clone()) else {
        // A newly opened village announces only how it is being kept.
        if !now.2.is_empty() {
            news.toasts.push_back(toast(&now.2));
        }
        return;
    };
    let mut fresh = Vec::new();
    // Milestones such as "Complete" are news; running counts of loads and hours are not.
    if now.0 != seen.0
        && let Some(progress) = &now.0
        && !progress.chars().any(|character| character.is_ascii_digit())
    {
        fresh.push(toast(progress));
    }
    if now.1 != seen.1
        && let Some(event) = &now.1
    {
        fresh.push(toast(event));
    }
    if now.2 != seen.2 && !now.2.is_empty() {
        fresh.push(toast(&now.2));
    }
    if now.3 != seen.3 && !now.3.is_empty() {
        fresh.push(toast(&now.3));
    }
    // Feedback on what the player just did, such as a wage or a refused order.
    if now.4 != seen.4 && !now.4.is_empty() && Some(&now.4) != now.1.as_ref() {
        fresh.push(toast(&strip_key_hints_block(&now.4)));
    }
    for toast in fresh {
        news.toasts.push_back(toast);
        if news.toasts.len() > TOAST_LIMIT {
            news.toasts.pop_front();
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn show_toasts(
    mut commands: Commands,
    news: Res<News>,
    assets: Res<AssetServer>,
    stack: Single<(Entity, &mut Node), With<ToastStack>>,
    toolbar: Single<&ComputedNode, With<toolbar::Toolbar>>,
    village: Res<Village>,
    mut shown: Local<Vec<(Option<String>, String)>>,
    mut fades: Query<(&ToastAge, &mut BackgroundColor, &mut BorderColor)>,
    mut texts: Query<(&ToastAge, &mut TextColor)>,
) {
    let (stack, mut node) = stack.into_inner();
    // Just above the dock, which can wrap to two rows.
    let bottom = px(18. + toolbar.size().y * toolbar.inverse_scale_factor() + 12.);
    if node.bottom != bottom {
        node.bottom = bottom;
    }
    let display = if covered(&village) {
        Display::None
    } else {
        Display::Flex
    };
    if node.display != display {
        node.display = display;
    }
    let wanted: Vec<_> = news
        .toasts
        .iter()
        .map(|toast| (toast.title.clone(), toast.body.clone()))
        .collect();
    if *shown != wanted {
        commands.entity(stack).despawn_children();
        commands.entity(stack).with_children(|stack| {
            for (index, toast) in news.toasts.iter().enumerate() {
                stack
                    .spawn((
                        ToastAge(index),
                        paper_card(Node {
                            flex_direction: FlexDirection::Column,
                            row_gap: px(2),
                            padding: UiRect::axes(px(14), px(9)),
                            ..default()
                        }),
                    ))
                    .with_children(|card| {
                        if let Some(title) = &toast.title {
                            card.spawn((
                                ToastAge(index),
                                Text::new(title),
                                ui_font_weight(&assets, 15.0, 700),
                            ));
                        }
                        card.spawn((
                            ToastAge(index),
                            Text::new(&toast.body),
                            ui_font_weight(&assets, 14.0, 450),
                        ));
                    });
            }
        });
        *shown = wanted;
    }
    // The last second fades the card and its words together.
    let alpha = |index: usize| {
        news.toasts
            .get(index)
            .map_or(1., |toast| (TOAST_SECONDS - toast.age).clamp(0., 1.))
    };
    for (age, mut fill, mut edge) in &mut fades {
        let a = alpha(age.0);
        fill.0 = theme::PAPER.with_alpha(a);
        *edge = BorderColor::all(theme::EDGE.with_alpha(a));
    }
    for (age, mut color) in &mut texts {
        color.0 = color.0.with_alpha(alpha(age.0));
    }
}

#[derive(Component)]
struct ToastAge(usize);

type Screens<'w> = (
    Res<'w, Village>,
    Res<'w, Catalog>,
    Res<'w, WorldSetup>,
    Res<'w, SaveMenu>,
    Res<'w, SoundSettings>,
);

type GoalParts<'w, 's> = (
    Query<'w, 's, (&'static GoalRow, &'static Children, &'static mut Node), Without<GoalCard>>,
    Query<'w, 's, (&'static GoalDot, &'static mut BackgroundColor)>,
    Query<'w, 's, &'static mut Text, Without<GoalHeading>>,
);

fn show_goals(
    (village, catalog, setup, saves, sound): Screens,
    mut card: Single<&mut Node, With<GoalCard>>,
    (mut rows, mut dots, mut texts): GoalParts,
) {
    let goals = (village.hud_note() || village.paused)
        .then(|| village.construction.opening_goals(&catalog))
        .flatten()
        .filter(|_| {
            !village.stock.sandbox
                && !projects_card::visible(&village, &setup, &saves, &sound)
                && !build_menu::visible(&setup, &village, &saves, &sound)
                && !village.terrain_editor.open
                && village.utility_panel.is_none()
                && !village.guide.open()
                // The placement and road summary takes this corner meanwhile.
                && !village.construction.is_placing()
                && !village.planning_roads()
        });
    let display = if goals.is_some() {
        Display::Flex
    } else {
        Display::None
    };
    if card.display != display {
        card.display = display;
    }
    let Some(goals) = goals else {
        return;
    };
    for (row, children, mut node) in &mut rows {
        let (name, done) = goals[row.0];
        node.display = Display::Flex;
        for child in children.iter() {
            if let Ok(mut text) = texts.get_mut(child) {
                let wanted = if done {
                    format!("{name} · Built")
                } else {
                    name.to_owned()
                };
                if text.0 != wanted {
                    text.0 = wanted;
                }
            }
        }
    }
    for (dot, mut fill) in &mut dots {
        let wanted = if goals[dot.0].1 {
            theme::LEAF
        } else {
            Color::NONE
        };
        if fill.0 != wanted {
            fill.0 = wanted;
        }
    }
}

/// The hover readout without a lens legend, which has its own card.
fn tip_text(notice: &str, lens: bool) -> &str {
    if lens {
        notice.split_once('\n').map_or("", |(_, rest)| rest)
    } else {
        notice
    }
}

fn show_tip(
    notice: Res<MapNotice>,
    village: Res<Village>,
    window: Single<&Window, With<PrimaryWindow>>,
    mut tip: Single<(&mut Node, &mut BorderColor), With<CursorTip>>,
    mut text: Single<&mut Text, With<CursorTipText>>,
) {
    let (node, edge) = &mut *tip;
    let lens = village.lenses.active.is_some() || village.lenses.network_view().is_some();
    // The terrain tools show their reading in their own card; placement feedback, such
    // as why a spot is blocked, belongs right here at the cursor.
    let wanted = notice
        .0
        .as_deref()
        .filter(|_| !village.terrain_editor.open)
        .map(|notice| strip_key_hints_block(tip_text(notice, lens)))
        .unwrap_or_default();
    // Beside the cursor, or beside the screen-centre reticle when steering by keyboard.
    let anchor = window
        .cursor_position()
        .or_else(|| Some(Vec2::new(window.width(), window.height()) / 2.));
    let Some(anchor) = anchor.filter(|_| !wanted.is_empty()) else {
        if node.display != Display::None {
            node.display = Display::None;
        }
        return;
    };
    if text.0 != wanted {
        text.0 = wanted;
    }
    node.display = Display::Flex;
    let scale = crate::theme::UI_SCALE;
    let left = ((anchor.x + 18.) / scale).min(window.width() / scale - 320.);
    let top = ((anchor.y + 20.) / scale).min(window.height() / scale - 80.);
    node.left = px(left.max(8.));
    node.top = px(top.max(8.));
    let colour = if notice.1 == Some(false) {
        theme::NEED_LOW
    } else {
        theme::EDGE
    };
    if **edge != BorderColor::all(colour) {
        **edge = BorderColor::all(colour);
    }
}

/// Lines with their keyboard hints removed, dropping lines that held only hints.
fn strip_key_hints_block(text: &str) -> String {
    text.lines()
        .map(strip_key_hints)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

/// A lens legend such as "Resources · Green available · Gray depleted" as a title and
/// rows, each with a colour swatch when it names one.
/// A legend row: its colour swatch, if it names one, and what it means.
type LegendRow = (Option<Color>, String);

fn legend(line: &str) -> Option<(String, Vec<LegendRow>)> {
    let mut parts = line.split(" · ");
    let title = parts.next()?.to_owned();
    let rows: Vec<_> = parts
        .map(|part| {
            let (word, meaning) = part.split_once(' ').unwrap_or((part, ""));
            let colour = match word {
                "Green" => Some(Color::srgb_u8(136, 220, 148)),
                "Gold" | "Yellow" => Some(Color::srgb_u8(243, 200, 108)),
                "Gray" | "Grey" => Some(Color::srgb_u8(147, 146, 140)),
                "Red" => Some(Color::srgb_u8(226, 112, 96)),
                "Blue" => Some(Color::srgb_u8(109, 220, 255)),
                "Orange" => Some(Color::srgb_u8(240, 160, 90)),
                "Purple" => Some(Color::srgb_u8(180, 140, 220)),
                "White" => Some(Color::srgb_u8(240, 240, 235)),
                _ => None,
            };
            match colour {
                Some(colour) if !meaning.is_empty() => (Some(colour), capitalise(meaning)),
                _ => (None, part.to_owned()),
            }
        })
        .collect();
    (!rows.is_empty()).then_some((title, rows))
}

fn capitalise(text: &str) -> String {
    let mut characters = text.chars();
    characters
        .next()
        .map(|first| first.to_uppercase().chain(characters).collect())
        .unwrap_or_default()
}

#[allow(clippy::too_many_arguments)]
fn show_legend(
    mut commands: Commands,
    notice: Res<MapNotice>,
    village: Res<Village>,
    assets: Res<AssetServer>,
    mut card: Single<&mut Node, (With<LegendCard>, Without<lens_card::LensCard>)>,
    lens_picker: Single<(&Node, &ComputedNode, &UiGlobalTransform), With<lens_card::LensCard>>,
    rows: Single<Entity, With<LegendRows>>,
    mut shown: Local<Option<String>>,
) {
    // Under the lens picker while it is open, otherwise where the picker would be.
    let (picker, size, at) = *lens_picker;
    let top = if picker.display == Display::Flex {
        let bottom = (at.translation.y + size.size().y / 2.) * size.inverse_scale_factor();
        px(bottom + 12.)
    } else {
        px(RIGHT_PANEL_TOP)
    };
    if card.top != top {
        card.top = top;
    }
    let lens = village.lenses.active.is_some() || village.lenses.network_view().is_some();
    let line = notice
        .0
        .as_deref()
        .filter(|_| lens && !village.guide.open())
        .and_then(|notice| notice.lines().next());
    let parsed = line.and_then(legend);
    let display = if parsed.is_some() {
        Display::Flex
    } else {
        Display::None
    };
    if card.display != display {
        card.display = display;
    }
    if shown.as_deref() == line || parsed.is_none() {
        return;
    }
    *shown = line.map(str::to_owned);
    let (title, entries) = parsed.expect("parsed legend");
    commands.entity(*rows).despawn_children();
    commands.entity(*rows).with_children(|rows| {
        rows.spawn((
            Text::new(title.to_uppercase()),
            ui_font_styled(&assets, 11.0, 750, theme::CAPTION),
        ));
        for (colour, meaning) in entries {
            rows.spawn(Node {
                align_items: AlignItems::Center,
                column_gap: px(8),
                ..default()
            })
            .with_children(|row| {
                if let Some(colour) = colour {
                    row.spawn((
                        Node {
                            width: px(12),
                            height: px(12),
                            border: UiRect::all(px(1)),
                            border_radius: BorderRadius::all(px(3)),
                            flex_shrink: 0.,
                            ..default()
                        },
                        BackgroundColor(colour),
                        BorderColor::all(theme::EDGE),
                    ));
                }
                row.spawn((Text::new(meaning), ui_font_weight(&assets, 13.0, 500)));
            });
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lens_legends_become_colour_rows() {
        let (title, rows) =
            legend("Resources · Green available · Gold queued or recovering · Gray depleted")
                .unwrap();
        assert_eq!(title, "Resources");
        assert_eq!(rows.len(), 3);
        assert_eq!(rows[1].1, "Queued or recovering");
        let (_, plain) = legend("Water · Drinking water · Greywater").unwrap();
        assert!(plain.iter().all(|(colour, _)| colour.is_none()));
        assert_eq!(plain[0].1, "Drinking water");
    }

    #[test]
    fn progress_toasts_carry_a_title() {
        let progress = toast("Fire circle: Complete");
        assert_eq!(progress.title.as_deref(), Some("Fire circle"));
        assert_eq!(progress.body, "Complete");
        let event = toast("Nina purified 6.4 L of drinking water.");
        assert!(event.title.is_none());
    }

    #[test]
    fn the_tip_leaves_the_legend_to_its_card() {
        assert_eq!(
            tip_text("Resources · Green available\nRaw wood · Available", true),
            "Raw wood · Available"
        );
        assert_eq!(
            tip_text("Click to pitch camp here.", false),
            "Click to pitch camp here."
        );
    }
}
