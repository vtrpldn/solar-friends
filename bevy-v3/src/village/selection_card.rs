//! The selected building's card, after V2's: state caption, name, what the building
//! gives (with a side bar), a short status inset, fill levels as meters, and the
//! construction record folded away under "Building notes". Actions follow in the menu.

use super::*;
use crate::{theme, ui_font::ui_font_styled, ui_font::ui_font_weight};

#[derive(Component)]
pub(super) struct SelectionCard;

#[derive(Component)]
enum Part {
    Caption,
    Title,
}

/// Rebuilt whenever the building's details change.
#[derive(Component)]
struct Details;

#[derive(Component)]
struct NotesToggle;

/// Whether the construction record is unfolded; it stays put between selections.
#[derive(Resource, Default)]
struct NotesOpen(bool);

/// A selected building's details, sorted for the card.
#[derive(Default, PartialEq, Debug)]
pub(super) struct Sorted {
    pub benefit: Option<String>,
    pub facts: Vec<String>,
    /// Label, fill fraction and the "8.0/8.0 L" reading.
    pub meters: Vec<(String, f32, String)>,
    pub notes: Vec<String>,
}

/// Splits the building's status lines into what it gives, current facts, fill levels
/// and its construction record.
pub(super) fn sort(lines: &str) -> Sorted {
    let mut sorted = Sorted::default();
    for line in lines.lines().map(str::trim).filter(|line| !line.is_empty()) {
        if let Some(meter) = meter(line) {
            sorted.meters.push(meter);
        } else if construction_note(line) {
            sorted.notes.push(line.into());
        } else if sorted.benefit.is_none() && line.contains(": ") && line.ends_with('.') {
            sorted.benefit = Some(line.into());
        } else {
            sorted.facts.push(line.into());
        }
    }
    sorted
}

/// "Wall assembly · 200.9 h" and "100 m² basic shell" describe how it was built.
fn construction_note(line: &str) -> bool {
    line.contains(" m² ")
        || line
            .rsplit_once(" · ")
            .is_some_and(|(_, value)| value.strip_suffix(" h").is_some_and(number))
}

fn number(text: &str) -> bool {
    text.parse::<f32>().is_ok()
}

/// "Drinking water · 8.0/8.0 L" becomes a labelled meter.
fn meter(line: &str) -> Option<(String, f32, String)> {
    let (label, reading) = line.rsplit_once(" · ")?;
    let (amounts, unit) = reading.split_once(' ').unwrap_or((reading, ""));
    let (level, capacity) = amounts.split_once('/')?;
    let (level, capacity) = (level.parse::<f32>().ok()?, capacity.parse::<f32>().ok()?);
    if capacity <= 0. || unit.contains(' ') || !amounts.contains('.') {
        return None;
    }
    Some((
        label.into(),
        (level / capacity).clamp(0., 1.),
        reading.into(),
    ))
}

pub(super) fn install(app: &mut App) {
    app.init_resource::<NotesOpen>()
        .add_systems(Update, (toggle_notes, refresh).chain().after(village_input));
}

pub(super) fn spawn(menu: &mut ChildSpawnerCommands, assets: &AssetServer) {
    menu.spawn((
        SelectionCard,
        Node {
            display: Display::None,
            width: percent(100),
            flex_direction: FlexDirection::Column,
            row_gap: px(8),
            padding: UiRect::bottom(px(6)),
            ..default()
        },
    ))
    .with_children(|card| {
        card.spawn((
            Part::Caption,
            Text::default(),
            ui_font_styled(assets, 11.0, 750, theme::CAPTION),
        ));
        card.spawn((
            Part::Title,
            Text::default(),
            ui_font_weight(assets, 21.0, 750),
        ));
        card.spawn((
            ConstructionProgressTrack,
            Node {
                display: Display::None,
                height: px(6),
                flex_shrink: 0.0,
                border_radius: BorderRadius::all(px(3)),
                overflow: Overflow::clip(),
                ..default()
            },
            BackgroundColor(theme::TRACK),
        ))
        .with_child((
            ConstructionProgressFill,
            Node {
                width: percent(0),
                height: percent(100),
                ..default()
            },
            BackgroundColor(theme::LEAF),
        ));
        card.spawn((
            Details,
            Node {
                flex_direction: FlexDirection::Column,
                row_gap: px(8),
                ..default()
            },
        ));
    });
}

fn toggle_notes(
    mut open: ResMut<NotesOpen>,
    toggles: Query<&Interaction, (With<NotesToggle>, Changed<Interaction>)>,
) {
    if toggles.iter().any(|press| *press == Interaction::Pressed) {
        open.0 = !open.0;
    }
}

#[allow(clippy::too_many_arguments)]
fn refresh(
    mut commands: Commands,
    (village, catalog, picker, assets): (
        Res<Village>,
        Res<Catalog>,
        Res<toolbar::PanelPicker>,
        Res<AssetServer>,
    ),
    open: Res<NotesOpen>,
    mut card: Single<&mut Node, With<SelectionCard>>,
    mut parts: Query<(&Part, &mut Text)>,
    details: Single<Entity, With<Details>>,
    mut shown: Local<Option<(String, bool)>>,
) {
    let content = (!picker.open)
        .then(|| village.selected_building_card(&catalog))
        .flatten();
    let display = if content.is_some() {
        Display::Flex
    } else {
        Display::None
    };
    if card.display != display {
        card.display = display;
    }
    let Some((caption, title, body)) = content else {
        *shown = None;
        return;
    };
    for (part, mut text) in &mut parts {
        let wanted = match part {
            Part::Caption => &caption,
            Part::Title => &title,
        };
        if text.0 != *wanted {
            text.0.clone_from(wanted);
        }
    }
    let key = (body, open.0);
    if shown.as_ref() == Some(&key) {
        return;
    }
    let sorted = sort(&key.0);
    *shown = Some(key);
    commands.entity(*details).despawn_children();
    commands.entity(*details).with_children(|details| {
        if let Some(benefit) = &sorted.benefit {
            details
                .spawn((
                    Node {
                        padding: UiRect::left(px(10)),
                        border: UiRect::left(px(3)),
                        ..default()
                    },
                    BorderColor::all(theme::LEAF),
                ))
                .with_child((
                    Text::new(benefit),
                    ui_font_weight(&assets, 14.0, 500),
                    bevy::text::LineHeight::RelativeToFont(1.4),
                ));
        }
        if !sorted.facts.is_empty() {
            details
                .spawn((
                    Node {
                        flex_direction: FlexDirection::Column,
                        row_gap: px(3),
                        padding: UiRect::axes(px(12), px(9)),
                        border_radius: BorderRadius::all(px(12)),
                        ..default()
                    },
                    BackgroundColor(theme::ACTIVE),
                ))
                .with_children(|inset| {
                    for fact in &sorted.facts {
                        inset.spawn((
                            Text::new(fact),
                            ui_font_weight(&assets, 14.0, 450),
                            bevy::text::LineHeight::RelativeToFont(1.35),
                        ));
                    }
                });
        }
        for (label, fraction, reading) in &sorted.meters {
            details
                .spawn(Node {
                    flex_direction: FlexDirection::Column,
                    row_gap: px(4),
                    ..default()
                })
                .with_children(|row| {
                    row.spawn(Node {
                        justify_content: JustifyContent::SpaceBetween,
                        ..default()
                    })
                    .with_children(|line| {
                        line.spawn((Text::new(label), ui_font_weight(&assets, 13.0, 600)));
                        line.spawn((
                            Text::new(reading),
                            ui_font_styled(&assets, 13.0, 450, theme::MUTED),
                        ));
                    });
                    row.spawn((
                        Node {
                            height: px(6),
                            border_radius: BorderRadius::all(px(3)),
                            overflow: Overflow::clip(),
                            ..default()
                        },
                        BackgroundColor(theme::TRACK),
                    ))
                    .with_child((
                        Node {
                            width: percent(fraction * 100.),
                            height: percent(100),
                            ..default()
                        },
                        BackgroundColor(theme::LEAF),
                    ));
                });
        }
        if !sorted.notes.is_empty() {
            details
                .spawn((
                    NotesToggle,
                    Button,
                    Node {
                        align_self: AlignSelf::FlexStart,
                        padding: UiRect::vertical(px(2)),
                        ..default()
                    },
                ))
                .with_child((
                    Text::new(if open.0 {
                        "Hide building notes"
                    } else {
                        "Building notes ›"
                    }),
                    ui_font_styled(&assets, 13.0, 600, theme::CAPTION),
                ));
            if open.0 {
                for note in &sorted.notes {
                    details.spawn((
                        Text::new(note),
                        ui_font_styled(&assets, 13.0, 450, theme::MUTED),
                    ));
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn house_details_sort_into_benefit_facts_meters_and_notes() {
        let sorted = sort(
            "Housing · 0/2 beds assigned\nHousing: 2 resting places for residents.\n100 m² basic shell\nWall assembly · 200.9 h\nPowered\nDrinking water · 8.0/8.0 L\nSewage · 0.4/16.0 L",
        );
        assert_eq!(
            sorted.benefit.as_deref(),
            Some("Housing: 2 resting places for residents.")
        );
        assert_eq!(sorted.facts, ["Housing · 0/2 beds assigned", "Powered"]);
        assert_eq!(sorted.meters.len(), 2);
        assert_eq!(sorted.meters[0].0, "Drinking water");
        assert_eq!(sorted.meters[0].1, 1.0);
        assert_eq!(sorted.meters[1].2, "0.4/16.0 L");
        assert_eq!(
            sorted.notes,
            ["100 m² basic shell", "Wall assembly · 200.9 h"]
        );
    }
}
