use bevy::ui::FocusPolicy;

use super::*;
use crate::{
    theme,
    ui_font::{ui_font_styled, ui_font_weight},
};

const BACKDROP: Color = Color::srgba_u8(0x28, 0x30, 0x20, 0x8c);

#[derive(Component)]
struct AdvanceBackdrop;

#[derive(Component)]
struct AdvanceDialog;

#[derive(Component)]
struct ProgressSection;

#[derive(Component)]
struct ProgressFill;

#[derive(Component)]
struct MilestonesList;

#[derive(Component)]
enum AdvanceText {
    DaysValue,
    DaysWarning,
    FastNote,
    ProgressLabel,
    MilestonesEmpty,
}

#[derive(Component, Clone, Copy)]
enum AdvanceModalButton {
    Cancel,
    Adjust(i16),
    Fast,
    Start,
    Stop,
}

pub(super) fn install(app: &mut App) {
    app.add_systems(Startup, spawn)
        .add_systems(Update, input.after(read_camp_pointer).before(village_input))
        .add_systems(Update, (refresh, scroll_dialog).chain().after(show_hud));
}

pub(super) fn visible(
    village: &Village,
    setup: &WorldSetup,
    saves: &SaveMenu,
    sound: &SoundSettings,
) -> bool {
    village.advance.open && !setup.open && !saves.open && !sound.open
}

fn spawn_button(
    parent: &mut ChildSpawnerCommands,
    assets: &AssetServer,
    action: AdvanceModalButton,
    label: &str,
    padding: UiRect,
) {
    parent
        .spawn((
            action,
            Button,
            FocusPolicy::Pass,
            theme::button_node(Node {
                padding,
                align_items: AlignItems::Center,
                justify_content: JustifyContent::Center,
                ..default()
            }),
            theme::button(),
        ))
        .with_child((
            FocusPolicy::Pass,
            Text::new(label),
            ui_font_weight(assets, 13., 600),
        ));
}

fn spawn(mut commands: Commands, assets: Res<AssetServer>) {
    commands
        .spawn((
            AdvanceBackdrop,
            Interaction::None,
            FocusPolicy::Block,
            GlobalZIndex(25),
            Node {
                display: Display::None,
                position_type: PositionType::Absolute,
                left: px(0),
                right: px(0),
                top: px(0),
                bottom: px(0),
                align_items: AlignItems::Center,
                justify_content: JustifyContent::Center,
                padding: UiRect::all(px(24)),
                ..default()
            },
            BackgroundColor(BACKDROP),
        ))
        .with_children(|backdrop| {
            backdrop
                .spawn((
                    AdvanceDialog,
                    Interaction::None,
                    FocusPolicy::Block,
                    theme::panel_node(Node {
                        width: px(560),
                        max_width: vw(90),
                        max_height: vh(85),
                        flex_direction: FlexDirection::Column,
                        padding: UiRect::all(px(22)),
                        row_gap: px(14),
                        overflow: Overflow::scroll_y(),
                        ..default()
                    }),
                    theme::panel(),
                ))
                .with_children(|card| {
                    // Header
                    card.spawn((
                        FocusPolicy::Pass,
                        Node {
                            align_items: AlignItems::Center,
                            justify_content: JustifyContent::SpaceBetween,
                            column_gap: px(12),
                            flex_shrink: 0.,
                            ..default()
                        },
                    ))
                    .with_children(|header| {
                        header
                            .spawn((
                                FocusPolicy::Pass,
                                Node {
                                    flex_direction: FlexDirection::Column,
                                    row_gap: px(2),
                                    ..default()
                                },
                            ))
                            .with_children(|left| {
                                left.spawn((
                                    FocusPolicy::Pass,
                                    Text::new("PASS TIME"),
                                    ui_font_styled(&assets, 10., 750, theme::CAPTION),
                                ));
                                left.spawn((
                                    FocusPolicy::Pass,
                                    Text::new("Advance days"),
                                    ui_font_weight(&assets, 24., 750),
                                ));
                            });
                        header
                            .spawn((
                                AdvanceModalButton::Cancel,
                                Button,
                                FocusPolicy::Pass,
                                Node {
                                    width: px(32),
                                    height: px(32),
                                    border: UiRect::all(px(2)),
                                    border_radius: BorderRadius::MAX,
                                    align_items: AlignItems::Center,
                                    justify_content: JustifyContent::Center,
                                    flex_shrink: 0.,
                                    ..default()
                                },
                                theme::button(),
                            ))
                            .with_child((
                                FocusPolicy::Pass,
                                Text::new("×"),
                                ui_font_weight(&assets, 18., 700),
                            ));
                    });

                    // Explanation
                    card.spawn((
                        FocusPolicy::Pass,
                        Text::new(
                            "Advance 1–365 days from now. The game pauses afterward so you can review what changed.",
                        ),
                        ui_font_styled(&assets, 13., 400, theme::MUTED),
                    ));

                    // Days stepper
                    card.spawn((
                        FocusPolicy::Pass,
                        Node {
                            flex_direction: FlexDirection::Column,
                            row_gap: px(6),
                            flex_shrink: 0.,
                            ..default()
                        },
                    ))
                    .with_children(|section| {
                        section.spawn((
                            FocusPolicy::Pass,
                            Text::new("DAYS TO SIMULATE"),
                            ui_font_styled(&assets, 10., 750, theme::CAPTION),
                        ));
                        section
                            .spawn((
                                FocusPolicy::Pass,
                                Node {
                                    align_items: AlignItems::Center,
                                    column_gap: px(6),
                                    ..default()
                                },
                            ))
                            .with_children(|row| {
                                spawn_button(
                                    row,
                                    &assets,
                                    AdvanceModalButton::Adjust(-7),
                                    "-7",
                                    UiRect::axes(px(10), px(6)),
                                );
                                spawn_button(
                                    row,
                                    &assets,
                                    AdvanceModalButton::Adjust(-1),
                                    "‹",
                                    UiRect::axes(px(12), px(6)),
                                );
                                row.spawn((
                                    FocusPolicy::Pass,
                                    Node {
                                        flex_grow: 1.,
                                        justify_content: JustifyContent::Center,
                                        padding: UiRect::axes(px(12), px(7)),
                                        border: UiRect::all(px(1)),
                                        border_radius: BorderRadius::all(px(10)),
                                        ..default()
                                    },
                                    BackgroundColor(theme::CARD),
                                    BorderColor::all(theme::SUBTLE_BORDER),
                                ))
                                .with_child((
                                    AdvanceText::DaysValue,
                                    FocusPolicy::Pass,
                                    Text::default(),
                                    ui_font_weight(&assets, 15., 700),
                                ));
                                spawn_button(
                                    row,
                                    &assets,
                                    AdvanceModalButton::Adjust(1),
                                    "›",
                                    UiRect::axes(px(12), px(6)),
                                );
                                spawn_button(
                                    row,
                                    &assets,
                                    AdvanceModalButton::Adjust(7),
                                    "+7",
                                    UiRect::axes(px(10), px(6)),
                                );
                            });
                        section.spawn((
                            AdvanceText::DaysWarning,
                            FocusPolicy::Pass,
                            Text::new("Choose between 1 and 365 days."),
                            ui_font_styled(&assets, 12., 600, theme::NEED_LOW),
                            Node {
                                display: Display::None,
                                ..default()
                            },
                        ));
                    });

                    // Fast simulation toggle card
                    card.spawn((
                        FocusPolicy::Pass,
                        Node {
                            flex_direction: FlexDirection::Column,
                            row_gap: px(6),
                            padding: UiRect::all(px(12)),
                            border: UiRect::all(px(1)),
                            border_radius: BorderRadius::all(px(12)),
                            flex_shrink: 0.,
                            ..default()
                        },
                        BackgroundColor(theme::CARD),
                        BorderColor::all(theme::SUBTLE_BORDER),
                    ))
                    .with_children(|fast| {
                        fast.spawn((
                            FocusPolicy::Pass,
                            Node {
                                align_items: AlignItems::Center,
                                justify_content: JustifyContent::SpaceBetween,
                                column_gap: px(10),
                                ..default()
                            },
                        ))
                        .with_children(|row| {
                            row.spawn((
                                FocusPolicy::Pass,
                                Text::new("SIMULATION SPEED"),
                                ui_font_styled(&assets, 10., 750, theme::CAPTION),
                            ));
                            spawn_button(
                                row,
                                &assets,
                                AdvanceModalButton::Fast,
                                "Fast simulation",
                                UiRect::axes(px(12), px(5)),
                            );
                        });
                        fast.spawn((
                            AdvanceText::FastNote,
                            FocusPolicy::Pass,
                            Text::default(),
                            ui_font_styled(&assets, 12., 400, theme::MUTED),
                        ));
                    });

                    // Progress bar while running
                    card.spawn((
                        ProgressSection,
                        FocusPolicy::Pass,
                        Node {
                            display: Display::None,
                            flex_direction: FlexDirection::Column,
                            row_gap: px(6),
                            padding: UiRect::all(px(12)),
                            border: UiRect::left(px(3)),
                            border_radius: BorderRadius::all(px(10)),
                            flex_shrink: 0.,
                            ..default()
                        },
                        BackgroundColor(theme::INSET),
                        BorderColor::all(theme::LEAF),
                    ))
                    .with_children(|progress| {
                        progress.spawn((
                            AdvanceText::ProgressLabel,
                            FocusPolicy::Pass,
                            Text::default(),
                            ui_font_weight(&assets, 13., 600),
                        ));
                        progress
                            .spawn((
                                FocusPolicy::Pass,
                                Node {
                                    width: percent(100),
                                    height: px(9),
                                    border_radius: BorderRadius::MAX,
                                    ..default()
                                },
                                BackgroundColor(theme::TRACK),
                            ))
                            .with_child((
                                ProgressFill,
                                FocusPolicy::Pass,
                                Node {
                                    width: percent(0),
                                    height: percent(100),
                                    border_radius: BorderRadius::MAX,
                                    ..default()
                                },
                                BackgroundColor(theme::LEAF),
                            ));
                    });

                    // Upcoming milestones section
                    card.spawn((
                        FocusPolicy::Pass,
                        Node {
                            flex_direction: FlexDirection::Column,
                            row_gap: px(8),
                            padding: UiRect::all(px(12)),
                            border: UiRect::all(px(1)),
                            border_radius: BorderRadius::all(px(12)),
                            flex_shrink: 0.,
                            ..default()
                        },
                        BackgroundColor(theme::CARD),
                        BorderColor::all(theme::SUBTLE_BORDER),
                    ))
                    .with_children(|section| {
                        section.spawn((
                            FocusPolicy::Pass,
                            Text::new("UPCOMING MILESTONES"),
                            ui_font_styled(&assets, 10., 750, theme::CAPTION),
                        ));
                        section.spawn((
                            AdvanceText::MilestonesEmpty,
                            FocusPolicy::Pass,
                            Text::new(
                                "No harvests or animal production underway yet. Plant crops or care for animals to see their next milestones.",
                            ),
                            ui_font_styled(&assets, 12., 400, theme::MUTED),
                        ));
                        section.spawn((
                            MilestonesList,
                            FocusPolicy::Pass,
                            Node {
                                flex_direction: FlexDirection::Column,
                                row_gap: px(8),
                                ..default()
                            },
                        ));
                    });

                    // Footer buttons
                    card.spawn((
                        FocusPolicy::Pass,
                        Node {
                            justify_content: JustifyContent::FlexEnd,
                            column_gap: px(10),
                            padding: UiRect::top(px(4)),
                            flex_shrink: 0.,
                            ..default()
                        },
                    ))
                    .with_children(|footer| {
                        spawn_button(
                            footer,
                            &assets,
                            AdvanceModalButton::Cancel,
                            "Cancel",
                            UiRect::axes(px(16), px(8)),
                        );
                        spawn_button(
                            footer,
                            &assets,
                            AdvanceModalButton::Start,
                            "Advance time",
                            UiRect::axes(px(16), px(8)),
                        );
                        spawn_button(
                            footer,
                            &assets,
                            AdvanceModalButton::Stop,
                            "Stop advance",
                            UiRect::axes(px(16), px(8)),
                        );
                    });
                });
        });
}

fn button_state(action: AdvanceModalButton, village: &Village) -> (bool, bool, bool) {
    let running = village.advance.running.is_some();
    match action {
        AdvanceModalButton::Cancel => (!running, !running, false),
        AdvanceModalButton::Adjust(_) => (true, !running, false),
        AdvanceModalButton::Fast => (true, !running, village.advance.fast),
        AdvanceModalButton::Start => (!running, !running && village.advance.can_start(), false),
        AdvanceModalButton::Stop => (running, running, false),
    }
}

fn parse_milestones(raw: &str) -> Vec<(String, String)> {
    raw.lines()
        .map(str::trim)
        .filter(|line| {
            !line.is_empty()
                && !line.starts_with("Upcoming harvests")
                && !line.starts_with("No upcoming milestones")
        })
        .map(|line| {
            let mut parts = line.splitn(4, " · ");
            let when = parts.next().unwrap_or("");
            let event = parts.next().unwrap_or("");
            let window = parts.next().unwrap_or("");
            let detail = parts.next().unwrap_or("");
            if event.is_empty() {
                (line.to_owned(), String::new())
            } else {
                let heading = format!("{when} · {event}");
                let note = if detail.is_empty() {
                    window.to_owned()
                } else {
                    format!("{window} · {detail}")
                };
                (heading, note)
            }
        })
        .collect()
}

type ModalNodes<'w, 's> = (
    Single<
        'w,
        's,
        &'static mut Node,
        (
            With<AdvanceBackdrop>,
            Without<ProgressSection>,
            Without<ProgressFill>,
            Without<AdvanceText>,
            Without<AdvanceModalButton>,
        ),
    >,
    Single<
        'w,
        's,
        &'static mut Node,
        (
            With<ProgressSection>,
            Without<AdvanceBackdrop>,
            Without<ProgressFill>,
            Without<AdvanceText>,
            Without<AdvanceModalButton>,
        ),
    >,
    Single<
        'w,
        's,
        &'static mut Node,
        (
            With<ProgressFill>,
            Without<AdvanceBackdrop>,
            Without<ProgressSection>,
            Without<AdvanceText>,
            Without<AdvanceModalButton>,
        ),
    >,
    Single<'w, 's, Entity, With<MilestonesList>>,
);

type ModalTexts<'w, 's> = Query<
    'w,
    's,
    (&'static AdvanceText, &'static mut Text, &'static mut Node),
    (
        Without<AdvanceBackdrop>,
        Without<ProgressSection>,
        Without<ProgressFill>,
        Without<AdvanceModalButton>,
    ),
>;

type ModalButtons<'w, 's> = Query<
    'w,
    's,
    (
        &'static AdvanceModalButton,
        &'static Interaction,
        &'static mut Node,
        &'static mut BackgroundColor,
        &'static mut BorderColor,
        &'static mut BoxShadow,
    ),
    (
        Without<AdvanceBackdrop>,
        Without<ProgressSection>,
        Without<ProgressFill>,
        Without<AdvanceText>,
    ),
>;

fn refresh(
    mut commands: Commands,
    (village, catalog, assets): (Res<Village>, Res<Catalog>, Res<AssetServer>),
    (setup, saves, sound): (Res<WorldSetup>, Res<SaveMenu>, Res<SoundSettings>),
    (mut backdrop, mut progress_box, mut progress_fill, milestones_entity): ModalNodes,
    mut texts: ModalTexts,
    mut buttons: ModalButtons,
    mut previous_milestones: Local<Vec<(String, String)>>,
) {
    let open = visible(&village, &setup, &saves, &sound);
    let display = if open { Display::Flex } else { Display::None };
    if backdrop.display != display {
        backdrop.display = display;
    }
    if !open {
        return;
    }

    let days = village.advance.days_selected();
    let days_label = if days == 1 {
        "1 day".to_owned()
    } else {
        format!("{days} days")
    };
    let fast_note = if village.advance.fast {
        "Larger time steps speed up the advance. Resident decisions and resource totals can differ from normal play."
    } else {
        "Every moment is simulated exactly as in live play."
    };

    let progress = village.advance.progress();
    let progress_display = if progress.is_some() {
        Display::Flex
    } else {
        Display::None
    };
    if progress_box.display != progress_display {
        progress_box.display = progress_display;
    }
    let progress_text = if let Some((fraction, fast)) = progress {
        let width = percent(fraction * 100.0);
        if progress_fill.width != width {
            progress_fill.width = width;
        }
        format!(
            "Advancing {} day(s){} · {:.0}%",
            village.advance.target_days(),
            if fast { " (fast)" } else { "" },
            fraction * 100.0
        )
    } else {
        String::new()
    };

    let raw_milestones = village.construction.advance_milestones(
        &catalog,
        &setup,
        village.clock,
        village.advance.remaining_days(),
    );
    let milestones = parse_milestones(&raw_milestones);
    let empty_milestones = milestones.is_empty();
    if *previous_milestones != milestones {
        let mut list = commands.entity(*milestones_entity);
        list.despawn_related::<Children>();
        list.with_children(|rows| {
            for (heading, note) in &milestones {
                rows.spawn((
                    FocusPolicy::Pass,
                    Node {
                        flex_direction: FlexDirection::Column,
                        row_gap: px(2),
                        padding: UiRect::bottom(px(6)),
                        border: UiRect::bottom(px(1)),
                        ..default()
                    },
                    BorderColor::all(theme::SUBTLE_BORDER),
                ))
                .with_children(|row| {
                    row.spawn((
                        FocusPolicy::Pass,
                        Text::new(heading),
                        ui_font_weight(&assets, 13., 600),
                    ));
                    if !note.is_empty() {
                        row.spawn((
                            FocusPolicy::Pass,
                            Text::new(note),
                            ui_font_styled(&assets, 12., 400, theme::MUTED),
                        ));
                    }
                });
            }
        });
        *previous_milestones = milestones;
    }

    for (part, mut text, mut node) in &mut texts {
        match part {
            AdvanceText::DaysValue => {
                if text.0 != days_label {
                    text.0.clone_from(&days_label);
                }
            }
            AdvanceText::DaysWarning => {
                let warn_display = if village.advance.can_start() {
                    Display::None
                } else {
                    Display::Flex
                };
                if node.display != warn_display {
                    node.display = warn_display;
                }
            }
            AdvanceText::FastNote => {
                if text.0 != fast_note {
                    text.0 = fast_note.into();
                }
            }
            AdvanceText::ProgressLabel => {
                if text.0 != progress_text {
                    text.0.clone_from(&progress_text);
                }
            }
            AdvanceText::MilestonesEmpty => {
                let empty_display = if empty_milestones {
                    Display::Flex
                } else {
                    Display::None
                };
                if node.display != empty_display {
                    node.display = empty_display;
                }
            }
        }
    }

    for (&action, &interaction, mut node, mut fill, mut edge, mut shadow) in &mut buttons {
        let (shown, enabled, active) = button_state(action, &village);
        let btn_display = if shown { Display::Flex } else { Display::None };
        if node.display != btn_display {
            node.display = btn_display;
        }
        if !shown {
            continue;
        }
        theme::paint_button(
            interaction,
            enabled,
            active,
            &mut fill,
            &mut edge,
            &mut shadow,
        );
    }
}

fn scroll_dialog(
    village: Res<Village>,
    (setup, saves, sound): (Res<WorldSetup>, Res<SaveMenu>, Res<SoundSettings>),
    mut dialog: Single<(&Interaction, &mut ScrollPosition), With<AdvanceDialog>>,
    scroll: Res<bevy::input::mouse::AccumulatedMouseScroll>,
) {
    if !visible(&village, &setup, &saves, &sound) {
        dialog.1.y = 0.;
        return;
    }
    if *dialog.0 != Interaction::None && scroll.delta.y != 0. {
        let step = match scroll.unit {
            bevy::input::mouse::MouseScrollUnit::Line => 34.,
            bevy::input::mouse::MouseScrollUnit::Pixel => 1.,
        };
        dialog.1.y = (dialog.1.y - scroll.delta.y * step).max(0.);
    }
}

fn input(
    mut village: ResMut<Village>,
    (setup, saves, sound): (Res<WorldSetup>, Res<SaveMenu>, Res<SoundSettings>),
    buttons: Query<(&AdvanceModalButton, &Interaction), Changed<Interaction>>,
) {
    if !visible(&village, &setup, &saves, &sound) {
        return;
    }
    for (&button, &interaction) in &buttons {
        if interaction != Interaction::Pressed {
            continue;
        }
        let (shown, enabled, _) = button_state(button, &village);
        if !shown || !enabled {
            continue;
        }
        let action = match button {
            AdvanceModalButton::Cancel | AdvanceModalButton::Stop => AdvanceAction::Toggle,
            AdvanceModalButton::Adjust(delta) => AdvanceAction::Adjust(delta),
            AdvanceModalButton::Fast => AdvanceAction::Fast,
            AdvanceModalButton::Start => AdvanceAction::Start,
        };
        village.apply_advance_action(action);
        if matches!(
            button,
            AdvanceModalButton::Cancel | AdvanceModalButton::Stop
        ) {
            return;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn advance_modal_steps_days_toggles_fast_starts_and_stops() {
        let mut village = Village {
            camp: Some(CLEARING_CAMP),
            ..default()
        };
        village.apply_advance_action(AdvanceAction::Toggle);
        assert!(village.advance.open);

        let mut app = App::new();
        app.insert_resource(village)
            .insert_resource(WorldSetup::default().session())
            .init_resource::<SaveMenu>()
            .init_resource::<SoundSettings>()
            .add_systems(Update, input);

        let press = |app: &mut App, button: AdvanceModalButton| {
            let entity = app.world_mut().spawn((button, Interaction::Pressed)).id();
            app.update();
            app.world_mut().entity_mut(entity).despawn();
        };

        press(&mut app, AdvanceModalButton::Adjust(7));
        assert_eq!(app.world().resource::<Village>().advance.days_selected(), 8);

        press(&mut app, AdvanceModalButton::Adjust(-1));
        assert_eq!(app.world().resource::<Village>().advance.days_selected(), 7);

        press(&mut app, AdvanceModalButton::Fast);
        assert!(app.world().resource::<Village>().advance.fast);

        press(&mut app, AdvanceModalButton::Start);
        assert!(app.world().resource::<Village>().advance.running.is_some());

        press(&mut app, AdvanceModalButton::Stop);
        let village = app.world().resource::<Village>();
        assert!(village.advance.running.is_none());
        assert!(!village.advance.open);
        assert!(village.is_paused());
    }

    #[test]
    fn advance_modal_cancel_closes_without_starting() {
        let mut village = Village {
            camp: Some(CLEARING_CAMP),
            ..default()
        };
        village.apply_advance_action(AdvanceAction::Toggle);

        let mut app = App::new();
        app.insert_resource(village)
            .insert_resource(WorldSetup::default().session())
            .init_resource::<SaveMenu>()
            .init_resource::<SoundSettings>()
            .add_systems(Update, input);

        app.world_mut()
            .spawn((AdvanceModalButton::Cancel, Interaction::Pressed));
        app.update();
        let village = app.world().resource::<Village>();
        assert!(!village.advance.open);
        assert!(village.advance.running.is_none());
    }
}
