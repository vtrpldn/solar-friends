use bevy::{asset::load_embedded_asset, ui::FocusPolicy};

use super::*;
use crate::{
    theme,
    ui_font::{ui_font_styled, ui_font_weight},
};

const STORY_CAPTIONS: [&str; 7] = [
    "BEFORE THE VILLAGE",
    "WHAT I WANT",
    "WHAT DRIVES ME",
    "WHAT I FEAR",
    "WHERE I STRUGGLE",
    "WHAT I NEED FROM OTHERS",
    "ROOM TO GROW",
];

#[derive(Component)]
struct ResidentsLayout;

#[derive(Component)]
struct RosterPortrait(usize);

#[derive(Component)]
enum RosterText {
    Activity(usize),
    Need(usize),
}

#[derive(Component)]
struct ResidentPortrait;

#[derive(Component)]
enum HeaderText {
    Name,
    Role,
    Traits,
}

#[derive(Component)]
struct TabPanel(ResidentProfile);

#[derive(Component)]
struct PaidWorkCard;

#[derive(Component)]
struct ActivityText;

#[derive(Component)]
struct PaidWorkText;

#[derive(Component)]
struct HomeValueText;

#[derive(Component)]
struct HomeNoteText;

#[derive(Component)]
struct MeterLabel(usize);

#[derive(Component)]
struct MeterFill(usize);

#[derive(Component)]
struct WorkPriorityText(WorkGroup);

#[derive(Component)]
struct ReservationText(bool);

#[derive(Component)]
enum OverviewNoteText {
    Thought,
    HopeTitle,
    HopeReason,
    AboutHeading,
    AboutBody,
    Memories,
}

#[derive(Component)]
struct StoryText(usize);

#[derive(Component)]
struct SpecialtiesList;

#[derive(Component)]
struct SkillsBonusText;

#[derive(Component)]
struct SkillsBonusFill;

#[derive(Component)]
struct CraftSkillText(usize);

#[derive(Component)]
struct RelationshipPortrait(usize);

#[derive(Component)]
enum RelationshipText {
    Header(usize),
    Memory(usize),
}

#[derive(Component)]
struct RelationshipFill(usize);

#[derive(Component)]
struct ButtonLabel;

#[derive(Component, Clone, Copy)]
enum ResidentButton {
    Select(usize),
    FindInVillage,
    ViewProject,
    Tab(ResidentProfile),
    ToggleShift,
    ToggleWeekdayShift,
    StepHome(bool),
    WorkPriorityStep(WorkGroup, bool),
    WorkerReservationStep(bool, bool),
}

#[derive(Resource)]
struct ResidentPortraits([Handle<Image>; NAMES.len()]);

pub(super) fn install(app: &mut App) {
    app.add_systems(Startup, load_portraits)
        .add_systems(Update, input.after(village_input).before(show_hud))
        .add_systems(
            Update,
            (
                refresh_layout_and_roster,
                refresh_header_and_overview,
                refresh_notes_and_story,
                refresh_skills_and_relationships,
                paint_buttons,
            )
                .chain()
                .after(show_hud),
        );
}

fn load_portraits(mut commands: Commands, assets: Res<AssetServer>) {
    commands.insert_resource(ResidentPortraits([
        load_embedded_asset!(&*assets, "resident_portraits/iara.png"),
        load_embedded_asset!(&*assets, "resident_portraits/bento.png"),
        load_embedded_asset!(&*assets, "resident_portraits/luz.png"),
        load_embedded_asset!(&*assets, "resident_portraits/caua.png"),
        load_embedded_asset!(&*assets, "resident_portraits/nina.png"),
    ]));
}

fn residents_open(
    village: &Village,
    setup: &WorldSetup,
    saves: &SaveMenu,
    sound: &SoundSettings,
) -> bool {
    village.utility_panel == Some(UtilityPanel::Residents)
        && !village.guide.open()
        && !village.lenses.open
        && !setup.open
        && !saves.open
        && !sound.open
        && !build_menu::visible(setup, village, saves, sound)
}

fn need_color(value: f64) -> Color {
    if value < 25. {
        theme::NEED_LOW
    } else if value < 50. {
        theme::NEED_WARN
    } else {
        theme::NEED_GOOD
    }
}

fn spawn_action_button(
    parent: &mut ChildSpawnerCommands,
    assets: &AssetServer,
    action: ResidentButton,
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
            ButtonLabel,
            FocusPolicy::Pass,
            Text::new(label),
            ui_font_weight(assets, 13., 600),
        ));
}

pub(super) fn spawn(parent: &mut ChildSpawnerCommands, assets: &AssetServer) {
    parent
        .spawn((
            ResidentsLayout,
            FocusPolicy::Pass,
            Node {
                display: Display::None,
                flex_direction: FlexDirection::Row,
                flex_wrap: FlexWrap::Wrap,
                align_items: AlignItems::FlexStart,
                column_gap: px(16),
                row_gap: px(12),
                width: percent(100),
                padding: UiRect::top(px(6)),
                flex_shrink: 0.,
                ..default()
            },
        ))
        .with_children(|layout| {
            spawn_roster(layout, assets);
            spawn_detail(layout, assets);
        });
}

fn spawn_roster(parent: &mut ChildSpawnerCommands, assets: &AssetServer) {
    parent
        .spawn((
            FocusPolicy::Pass,
            Node {
                width: px(196),
                flex_shrink: 0.,
                flex_direction: FlexDirection::Column,
                row_gap: px(7),
                ..default()
            },
        ))
        .with_children(|roster| {
            for (index, &name) in NAMES.iter().enumerate() {
                roster
                    .spawn((
                        ResidentButton::Select(index),
                        Button,
                        FocusPolicy::Pass,
                        theme::button_node(Node {
                            width: percent(100),
                            align_items: AlignItems::Center,
                            column_gap: px(9),
                            padding: UiRect::axes(px(9), px(8)),
                            ..default()
                        }),
                        theme::button(),
                    ))
                    .with_children(|card| {
                        card.spawn((
                            RosterPortrait(index),
                            FocusPolicy::Pass,
                            ImageNode::default(),
                            Node {
                                width: px(40),
                                height: px(30),
                                flex_shrink: 0.,
                                ..default()
                            },
                        ));
                        card.spawn((
                            FocusPolicy::Pass,
                            Node {
                                flex_direction: FlexDirection::Column,
                                row_gap: px(1),
                                flex_grow: 1.,
                                min_width: px(0),
                                ..default()
                            },
                        ))
                        .with_children(|info| {
                            info.spawn((
                                FocusPolicy::Pass,
                                Text::new(name),
                                ui_font_weight(assets, 14., 700),
                            ));
                            info.spawn((
                                RosterText::Activity(index),
                                FocusPolicy::Pass,
                                Text::default(),
                                ui_font_styled(assets, 11., 500, theme::MUTED),
                            ));
                            info.spawn((
                                RosterText::Need(index),
                                FocusPolicy::Pass,
                                Text::default(),
                                ui_font_styled(assets, 11., 600, theme::LEAF),
                            ));
                        });
                    });
            }
        });
}

fn spawn_detail(parent: &mut ChildSpawnerCommands, assets: &AssetServer) {
    parent
        .spawn((
            FocusPolicy::Pass,
            Node {
                flex_grow: 1.,
                flex_basis: px(220),
                min_width: px(0),
                flex_direction: FlexDirection::Column,
                row_gap: px(12),
                ..default()
            },
        ))
        .with_children(|detail| {
            spawn_header(detail, assets);
            spawn_tabs(detail, assets);
            spawn_overview_tab(detail, assets);
            spawn_story_tab(detail, assets);
            spawn_skills_tab(detail, assets);
            spawn_relationships_tab(detail, assets);
        });
}

fn spawn_header(parent: &mut ChildSpawnerCommands, assets: &AssetServer) {
    parent
        .spawn((
            FocusPolicy::Pass,
            Node {
                flex_direction: FlexDirection::Column,
                row_gap: px(10),
                flex_shrink: 0.,
                ..default()
            },
        ))
        .with_children(|header| {
            header
                .spawn((
                    FocusPolicy::Pass,
                    Node {
                        align_items: AlignItems::Center,
                        column_gap: px(14),
                        ..default()
                    },
                ))
                .with_children(|row| {
                    row.spawn((
                        FocusPolicy::Pass,
                        Node {
                            padding: UiRect::all(px(4)),
                            border: UiRect::all(px(1)),
                            border_radius: BorderRadius::all(px(14)),
                            flex_shrink: 0.,
                            ..default()
                        },
                        BackgroundColor(theme::ACTIVE),
                        BorderColor::all(theme::ACTIVE_EDGE),
                    ))
                    .with_child((
                        ResidentPortrait,
                        FocusPolicy::Pass,
                        ImageNode::default(),
                        Node {
                            width: px(80),
                            height: px(60),
                            ..default()
                        },
                    ));
                    row.spawn((
                        FocusPolicy::Pass,
                        Node {
                            flex_direction: FlexDirection::Column,
                            row_gap: px(2),
                            min_width: px(0),
                            ..default()
                        },
                    ))
                    .with_children(|identity| {
                        identity.spawn((
                            HeaderText::Name,
                            FocusPolicy::Pass,
                            Text::default(),
                            ui_font_weight(assets, 22., 750),
                        ));
                        identity.spawn((
                            HeaderText::Role,
                            FocusPolicy::Pass,
                            Text::default(),
                            ui_font_styled(assets, 14., 500, theme::MUTED),
                        ));
                        identity.spawn((
                            HeaderText::Traits,
                            FocusPolicy::Pass,
                            Text::default(),
                            ui_font_styled(assets, 12., 600, theme::LEAF),
                        ));
                    });
                });

            header
                .spawn((
                    FocusPolicy::Pass,
                    Node {
                        flex_wrap: FlexWrap::Wrap,
                        column_gap: px(8),
                        row_gap: px(6),
                        ..default()
                    },
                ))
                .with_children(|actions| {
                    spawn_action_button(
                        actions,
                        assets,
                        ResidentButton::FindInVillage,
                        "Find in village",
                        UiRect::axes(px(12), px(6)),
                    );
                    spawn_action_button(
                        actions,
                        assets,
                        ResidentButton::ViewProject,
                        "View project",
                        UiRect::axes(px(12), px(6)),
                    );
                });
        });
}

fn spawn_tabs(parent: &mut ChildSpawnerCommands, assets: &AssetServer) {
    parent
        .spawn((
            FocusPolicy::Pass,
            Node {
                flex_wrap: FlexWrap::Wrap,
                column_gap: px(6),
                row_gap: px(6),
                padding: UiRect::bottom(px(10)),
                border: UiRect::bottom(px(1)),
                flex_shrink: 0.,
                ..default()
            },
            BorderColor::all(theme::SUBTLE_BORDER),
        ))
        .with_children(|tabs| {
            for profile in ResidentProfile::ALL {
                spawn_action_button(
                    tabs,
                    assets,
                    ResidentButton::Tab(profile),
                    profile.label(),
                    UiRect::axes(px(12), px(6)),
                );
            }
        });
}

fn spawn_overview_tab(parent: &mut ChildSpawnerCommands, assets: &AssetServer) {
    parent
        .spawn((
            TabPanel(ResidentProfile::Overview),
            FocusPolicy::Pass,
            Node {
                display: Display::None,
                flex_direction: FlexDirection::Column,
                flex_shrink: 0.,
                row_gap: px(12),
                ..default()
            },
        ))
        .with_children(|overview| {
            // Activity inset
            overview
                .spawn((
                    FocusPolicy::Pass,
                    Node {
                        flex_direction: FlexDirection::Column,
                        row_gap: px(2),
                        padding: UiRect::axes(px(12), px(9)),
                        border: UiRect::left(px(3)),
                        border_radius: BorderRadius::all(px(8)),
                        ..default()
                    },
                    BackgroundColor(theme::INSET),
                    BorderColor::all(theme::LEAF),
                ))
                .with_children(|inset| {
                    inset.spawn((
                        FocusPolicy::Pass,
                        Text::new("RIGHT NOW"),
                        ui_font_styled(assets, 10., 750, theme::CAPTION),
                    ));
                    inset.spawn((
                        ActivityText,
                        FocusPolicy::Pass,
                        Text::default(),
                        ui_font_weight(assets, 14., 600),
                    ));
                });

            // Paid work in town card
            overview
                .spawn((
                    PaidWorkCard,
                    FocusPolicy::Pass,
                    Node {
                        flex_direction: FlexDirection::Column,
                        row_gap: px(7),
                        padding: UiRect::all(px(12)),
                        border: UiRect::all(px(1)),
                        border_radius: BorderRadius::all(px(12)),
                        ..default()
                    },
                    BackgroundColor(theme::CARD),
                    BorderColor::all(theme::SUBTLE_BORDER),
                ))
                .with_children(|card| {
                    card.spawn((
                        FocusPolicy::Pass,
                        Text::new("PAID WORK IN TOWN"),
                        ui_font_styled(assets, 10., 750, theme::CAPTION),
                    ));
                    card.spawn((
                        PaidWorkText,
                        FocusPolicy::Pass,
                        Text::default(),
                        ui_font_weight(assets, 13., 500),
                    ));
                    card.spawn((
                        FocusPolicy::Pass,
                        Node {
                            flex_wrap: FlexWrap::Wrap,
                            column_gap: px(8),
                            row_gap: px(6),
                            margin: UiRect::top(px(2)),
                            ..default()
                        },
                    ))
                    .with_children(|row| {
                        spawn_action_button(
                            row,
                            assets,
                            ResidentButton::ToggleShift,
                            "Book one day shift",
                            UiRect::axes(px(11), px(6)),
                        );
                        spawn_action_button(
                            row,
                            assets,
                            ResidentButton::ToggleWeekdayShift,
                            "Repeat weekday shifts",
                            UiRect::axes(px(11), px(6)),
                        );
                    });
                });

            // Home stepper
            overview
                .spawn((
                    FocusPolicy::Pass,
                    Node {
                        flex_direction: FlexDirection::Column,
                        row_gap: px(6),
                        ..default()
                    },
                ))
                .with_children(|section| {
                    section.spawn((
                        FocusPolicy::Pass,
                        Text::new("HOME"),
                        ui_font_styled(assets, 11., 750, theme::CAPTION),
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
                        .with_children(|stepper| {
                            spawn_action_button(
                                stepper,
                                assets,
                                ResidentButton::StepHome(false),
                                "‹",
                                UiRect::axes(px(10), px(5)),
                            );
                            stepper
                                .spawn((
                                    FocusPolicy::Pass,
                                    Node {
                                        flex_grow: 1.,
                                        min_width: px(0),
                                        padding: UiRect::axes(px(10), px(6)),
                                        border: UiRect::all(px(1)),
                                        border_radius: BorderRadius::all(px(10)),
                                        ..default()
                                    },
                                    BackgroundColor(theme::CARD),
                                    BorderColor::all(theme::SUBTLE_BORDER),
                                ))
                                .with_child((
                                    HomeValueText,
                                    FocusPolicy::Pass,
                                    Text::default(),
                                    ui_font_weight(assets, 13., 600),
                                ));
                            spawn_action_button(
                                stepper,
                                assets,
                                ResidentButton::StepHome(true),
                                "›",
                                UiRect::axes(px(10), px(5)),
                            );
                        });
                    section.spawn((
                        HomeNoteText,
                        FocusPolicy::Pass,
                        Text::default(),
                        ui_font_styled(assets, 12., 500, theme::MUTED),
                    ));
                });

            // Needs meters
            overview
                .spawn((
                    FocusPolicy::Pass,
                    Node {
                        flex_direction: FlexDirection::Column,
                        row_gap: px(6),
                        ..default()
                    },
                ))
                .with_children(|section| {
                    section.spawn((
                        FocusPolicy::Pass,
                        Text::new("NEEDS"),
                        ui_font_styled(assets, 11., 750, theme::CAPTION),
                    ));
                    section
                        .spawn((
                            FocusPolicy::Pass,
                            Node {
                                flex_wrap: FlexWrap::Wrap,
                                row_gap: px(8),
                                column_gap: px(14),
                                ..default()
                            },
                        ))
                        .with_children(|meters| {
                            for index in 0..8 {
                                meters
                                    .spawn((
                                        FocusPolicy::Pass,
                                        Node {
                                            width: px(136),
                                            flex_direction: FlexDirection::Column,
                                            row_gap: px(3),
                                            ..default()
                                        },
                                    ))
                                    .with_children(|meter| {
                                        meter.spawn((
                                            MeterLabel(index),
                                            FocusPolicy::Pass,
                                            Text::default(),
                                            ui_font_weight(assets, 13., 600),
                                        ));
                                        meter
                                            .spawn((
                                                FocusPolicy::Pass,
                                                Node {
                                                    width: percent(100),
                                                    height: px(8),
                                                    border_radius: BorderRadius::MAX,
                                                    ..default()
                                                },
                                                BackgroundColor(theme::TRACK),
                                            ))
                                            .with_child((
                                                MeterFill(index),
                                                FocusPolicy::Pass,
                                                Node {
                                                    height: percent(100),
                                                    border_radius: BorderRadius::MAX,
                                                    ..default()
                                                },
                                                BackgroundColor::default(),
                                            ));
                                    });
                            }
                        });
                });

            // Work priorities & worker reservations card
            overview
                .spawn((
                    FocusPolicy::Pass,
                    Node {
                        flex_direction: FlexDirection::Column,
                        row_gap: px(7),
                        padding: UiRect::all(px(12)),
                        border: UiRect::all(px(1)),
                        border_radius: BorderRadius::all(px(12)),
                        ..default()
                    },
                    BackgroundColor(theme::CARD),
                    BorderColor::all(theme::SUBTLE_BORDER),
                ))
                .with_children(|card| {
                    card.spawn((
                        FocusPolicy::Pass,
                        Text::new("VILLAGE WORK PRIORITIES"),
                        ui_font_styled(assets, 10., 750, theme::CAPTION),
                    ));
                    for group in WorkGroup::ALL {
                        card.spawn((
                            FocusPolicy::Pass,
                            Node {
                                align_items: AlignItems::Center,
                                justify_content: JustifyContent::SpaceBetween,
                                column_gap: px(8),
                                ..default()
                            },
                        ))
                        .with_children(|row| {
                            row.spawn((
                                FocusPolicy::Pass,
                                Text::new(group.label()),
                                ui_font_weight(assets, 13., 600),
                            ));
                            row.spawn((
                                FocusPolicy::Pass,
                                Node {
                                    align_items: AlignItems::Center,
                                    column_gap: px(4),
                                    flex_shrink: 0.,
                                    ..default()
                                },
                            ))
                            .with_children(|stepper| {
                                spawn_action_button(
                                    stepper,
                                    assets,
                                    ResidentButton::WorkPriorityStep(group, false),
                                    "‹",
                                    UiRect::axes(px(8), px(3)),
                                );
                                stepper
                                    .spawn((
                                        FocusPolicy::Pass,
                                        Node {
                                            min_width: px(66),
                                            justify_content: JustifyContent::Center,
                                            padding: UiRect::axes(px(7), px(3)),
                                            border_radius: BorderRadius::all(px(8)),
                                            ..default()
                                        },
                                        BackgroundColor(theme::INSET),
                                    ))
                                    .with_child((
                                        WorkPriorityText(group),
                                        FocusPolicy::Pass,
                                        Text::default(),
                                        ui_font_weight(assets, 12., 600),
                                    ));
                                spawn_action_button(
                                    stepper,
                                    assets,
                                    ResidentButton::WorkPriorityStep(group, true),
                                    "›",
                                    UiRect::axes(px(8), px(3)),
                                );
                            });
                        });
                    }
                    card.spawn((
                        FocusPolicy::Pass,
                        Node {
                            height: px(1),
                            width: percent(100),
                            margin: UiRect::vertical(px(2)),
                            ..default()
                        },
                        BackgroundColor(theme::SUBTLE_BORDER),
                    ));
                    for (essential, label) in [
                        (true, "Reserve for essentials"),
                        (false, "Reserve for production"),
                    ] {
                        card.spawn((
                            FocusPolicy::Pass,
                            Node {
                                align_items: AlignItems::Center,
                                justify_content: JustifyContent::SpaceBetween,
                                column_gap: px(8),
                                ..default()
                            },
                        ))
                        .with_children(|row| {
                            row.spawn((
                                FocusPolicy::Pass,
                                Text::new(label),
                                ui_font_weight(assets, 13., 600),
                            ));
                            row.spawn((
                                FocusPolicy::Pass,
                                Node {
                                    align_items: AlignItems::Center,
                                    column_gap: px(4),
                                    flex_shrink: 0.,
                                    ..default()
                                },
                            ))
                            .with_children(|stepper| {
                                spawn_action_button(
                                    stepper,
                                    assets,
                                    ResidentButton::WorkerReservationStep(essential, false),
                                    "‹",
                                    UiRect::axes(px(8), px(3)),
                                );
                                stepper
                                    .spawn((
                                        FocusPolicy::Pass,
                                        Node {
                                            min_width: px(44),
                                            justify_content: JustifyContent::Center,
                                            padding: UiRect::axes(px(7), px(3)),
                                            border_radius: BorderRadius::all(px(8)),
                                            ..default()
                                        },
                                        BackgroundColor(theme::INSET),
                                    ))
                                    .with_child((
                                        ReservationText(essential),
                                        FocusPolicy::Pass,
                                        Text::default(),
                                        ui_font_weight(assets, 12., 600),
                                    ));
                                spawn_action_button(
                                    stepper,
                                    assets,
                                    ResidentButton::WorkerReservationStep(essential, true),
                                    "›",
                                    UiRect::axes(px(8), px(3)),
                                );
                            });
                        });
                    }
                });

            // Personal notes (On my mind, A personal hope, About, Recent memories)
            overview
                .spawn((
                    FocusPolicy::Pass,
                    Node {
                        flex_direction: FlexDirection::Column,
                        row_gap: px(10),
                        ..default()
                    },
                ))
                .with_children(|notes| {
                    spawn_note_block(notes, assets, "ON MY MIND", OverviewNoteText::Thought);
                    notes
                        .spawn((
                            FocusPolicy::Pass,
                            Node {
                                flex_direction: FlexDirection::Column,
                                row_gap: px(3),
                                ..default()
                            },
                        ))
                        .with_children(|block| {
                            block.spawn((
                                FocusPolicy::Pass,
                                Text::new("A PERSONAL HOPE"),
                                ui_font_styled(assets, 11., 750, theme::CAPTION),
                            ));
                            block.spawn((
                                OverviewNoteText::HopeTitle,
                                FocusPolicy::Pass,
                                Text::default(),
                                ui_font_weight(assets, 14., 600),
                            ));
                            block.spawn((
                                OverviewNoteText::HopeReason,
                                FocusPolicy::Pass,
                                Text::default(),
                                ui_font_styled(assets, 13., 400, theme::MUTED),
                            ));
                        });
                    notes
                        .spawn((
                            FocusPolicy::Pass,
                            Node {
                                flex_direction: FlexDirection::Column,
                                row_gap: px(3),
                                ..default()
                            },
                        ))
                        .with_children(|block| {
                            block.spawn((
                                OverviewNoteText::AboutHeading,
                                FocusPolicy::Pass,
                                Text::default(),
                                ui_font_styled(assets, 11., 750, theme::CAPTION),
                            ));
                            block.spawn((
                                OverviewNoteText::AboutBody,
                                FocusPolicy::Pass,
                                Text::default(),
                                ui_font_weight(assets, 13., 400),
                            ));
                        });
                    spawn_note_block(notes, assets, "RECENT MEMORIES", OverviewNoteText::Memories);
                });
        });
}

fn spawn_note_block(
    parent: &mut ChildSpawnerCommands,
    assets: &AssetServer,
    caption: &str,
    marker: OverviewNoteText,
) {
    parent
        .spawn((
            FocusPolicy::Pass,
            Node {
                flex_direction: FlexDirection::Column,
                row_gap: px(3),
                ..default()
            },
        ))
        .with_children(|block| {
            block.spawn((
                FocusPolicy::Pass,
                Text::new(caption),
                ui_font_styled(assets, 11., 750, theme::CAPTION),
            ));
            block.spawn((
                marker,
                FocusPolicy::Pass,
                Text::default(),
                ui_font_weight(assets, 13., 400),
            ));
        });
}

fn spawn_story_tab(parent: &mut ChildSpawnerCommands, assets: &AssetServer) {
    parent
        .spawn((
            TabPanel(ResidentProfile::Story),
            FocusPolicy::Pass,
            Node {
                display: Display::None,
                flex_direction: FlexDirection::Column,
                flex_shrink: 0.,
                row_gap: px(12),
                ..default()
            },
        ))
        .with_children(|story| {
            for (index, caption) in STORY_CAPTIONS.into_iter().enumerate() {
                story
                    .spawn((
                        FocusPolicy::Pass,
                        Node {
                            flex_direction: FlexDirection::Column,
                            row_gap: px(3),
                            ..default()
                        },
                    ))
                    .with_children(|section| {
                        section.spawn((
                            FocusPolicy::Pass,
                            Text::new(caption),
                            ui_font_styled(assets, 11., 750, theme::CAPTION),
                        ));
                        section.spawn((
                            StoryText(index),
                            FocusPolicy::Pass,
                            Text::default(),
                            ui_font_weight(assets, 14., 400),
                        ));
                    });
            }
        });
}

fn spawn_skills_tab(parent: &mut ChildSpawnerCommands, assets: &AssetServer) {
    parent
        .spawn((
            TabPanel(ResidentProfile::Skills),
            FocusPolicy::Pass,
            Node {
                display: Display::None,
                flex_direction: FlexDirection::Column,
                flex_shrink: 0.,
                row_gap: px(14),
                ..default()
            },
        ))
        .with_children(|skills| {
            skills
                .spawn((
                    FocusPolicy::Pass,
                    Node {
                        flex_direction: FlexDirection::Column,
                        row_gap: px(6),
                        ..default()
                    },
                ))
                .with_children(|section| {
                    section.spawn((
                        FocusPolicy::Pass,
                        Text::new("Specialties · 25% faster"),
                        ui_font_styled(assets, 12., 750, theme::CAPTION),
                    ));
                    section.spawn((
                        SpecialtiesList,
                        FocusPolicy::Pass,
                        Node {
                            flex_wrap: FlexWrap::Wrap,
                            column_gap: px(7),
                            row_gap: px(7),
                            ..default()
                        },
                    ));
                });

            skills
                .spawn((
                    FocusPolicy::Pass,
                    Node {
                        flex_direction: FlexDirection::Column,
                        row_gap: px(5),
                        ..default()
                    },
                ))
                .with_children(|section| {
                    section.spawn((
                        FocusPolicy::Pass,
                        Text::new("LEARNING BY DOING"),
                        ui_font_styled(assets, 11., 750, theme::CAPTION),
                    ));
                    section.spawn((
                        SkillsBonusText,
                        FocusPolicy::Pass,
                        Text::default(),
                        ui_font_weight(assets, 14., 600),
                    ));
                    section
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
                            SkillsBonusFill,
                            FocusPolicy::Pass,
                            Node {
                                height: percent(100),
                                border_radius: BorderRadius::MAX,
                                ..default()
                            },
                            BackgroundColor(theme::LEAF),
                        ));
                    section.spawn((
                        FocusPolicy::Pass,
                        Text::new(
                            "Hands-on work gradually improves efficiency, up to a 15% bonus.",
                        ),
                        ui_font_styled(assets, 12., 400, theme::MUTED),
                    ));
                });

            skills
                .spawn((
                    FocusPolicy::Pass,
                    Node {
                        flex_direction: FlexDirection::Column,
                        row_gap: px(6),
                        ..default()
                    },
                ))
                .with_children(|section| {
                    section.spawn((
                        FocusPolicy::Pass,
                        Text::new("CRAFT SKILLS"),
                        ui_font_styled(assets, 11., 750, theme::CAPTION),
                    ));
                    section
                        .spawn((
                            FocusPolicy::Pass,
                            Node {
                                flex_wrap: FlexWrap::Wrap,
                                column_gap: px(8),
                                row_gap: px(8),
                                ..default()
                            },
                        ))
                        .with_children(|row| {
                            for index in 0..3 {
                                row.spawn((
                                    FocusPolicy::Pass,
                                    Node {
                                        padding: UiRect::axes(px(11), px(7)),
                                        border: UiRect::all(px(1)),
                                        border_radius: BorderRadius::all(px(10)),
                                        ..default()
                                    },
                                    BackgroundColor(theme::CARD),
                                    BorderColor::all(theme::SUBTLE_BORDER),
                                ))
                                .with_child((
                                    CraftSkillText(index),
                                    FocusPolicy::Pass,
                                    Text::default(),
                                    ui_font_weight(assets, 13., 600),
                                ));
                            }
                        });
                });
        });
}

fn spawn_relationships_tab(parent: &mut ChildSpawnerCommands, assets: &AssetServer) {
    parent
        .spawn((
            TabPanel(ResidentProfile::Relationships),
            FocusPolicy::Pass,
            Node {
                display: Display::None,
                flex_direction: FlexDirection::Column,
                flex_shrink: 0.,
                row_gap: px(10),
                ..default()
            },
        ))
        .with_children(|relationships| {
            relationships.spawn((
                FocusPolicy::Pass,
                Text::new("GROWING TOGETHER"),
                ui_font_styled(assets, 11., 750, theme::CAPTION),
            ));
            relationships.spawn((
                FocusPolicy::Pass,
                Text::new(
                    "Residents make time for willing friends, shared interests, and listening. Sleep, urgent needs, and quiet time come first.",
                ),
                ui_font_styled(assets, 13., 400, theme::MUTED),
            ));
            for slot in 0..4 {
                relationships
                    .spawn((
                        FocusPolicy::Pass,
                        Node {
                            align_items: AlignItems::Center,
                            column_gap: px(12),
                            padding: UiRect::vertical(px(9)),
                            border: UiRect::bottom(px(1)),
                            ..default()
                        },
                        BorderColor::all(theme::SUBTLE_BORDER),
                    ))
                    .with_children(|row| {
                        row.spawn((
                            RelationshipPortrait(slot),
                            FocusPolicy::Pass,
                            ImageNode::default(),
                            Node {
                                width: px(44),
                                height: px(33),
                                flex_shrink: 0.,
                                ..default()
                            },
                        ));
                        row.spawn((
                            FocusPolicy::Pass,
                            Node {
                                flex_direction: FlexDirection::Column,
                                row_gap: px(4),
                                flex_grow: 1.,
                                min_width: px(0),
                                ..default()
                            },
                        ))
                        .with_children(|body| {
                            body.spawn((
                                RelationshipText::Header(slot),
                                FocusPolicy::Pass,
                                Text::default(),
                                ui_font_weight(assets, 13., 600),
                            ));
                            body.spawn((
                                FocusPolicy::Pass,
                                Node {
                                    width: percent(100),
                                    height: px(8),
                                    border_radius: BorderRadius::MAX,
                                    ..default()
                                },
                                BackgroundColor(theme::TRACK),
                            ))
                            .with_child((
                                RelationshipFill(slot),
                                FocusPolicy::Pass,
                                Node {
                                    height: percent(100),
                                    border_radius: BorderRadius::MAX,
                                    ..default()
                                },
                                BackgroundColor(theme::LEAF),
                            ));
                            body.spawn((
                                RelationshipText::Memory(slot),
                                FocusPolicy::Pass,
                                Text::default(),
                                ui_font_styled(assets, 12., 400, theme::MUTED),
                            ));
                        });
                    });
            }
        });
}

type RosterQuery<'w, 's> = (
    Single<'w, 's, &'static mut Node, (With<ResidentsLayout>, Without<TabPanel>)>,
    Query<'w, 's, (&'static TabPanel, &'static mut Node), Without<ResidentsLayout>>,
    Query<'w, 's, (&'static RosterPortrait, &'static mut ImageNode)>,
    Query<
        'w,
        's,
        (
            &'static RosterText,
            &'static mut Text,
            &'static mut TextColor,
        ),
    >,
);

fn refresh_layout_and_roster(
    (village, catalog, portraits): (Res<Village>, Res<Catalog>, Res<ResidentPortraits>),
    (setup, saves, sound): (Res<WorldSetup>, Res<SaveMenu>, Res<SoundSettings>),
    (mut layout, mut tabs, mut roster_portraits, mut roster_texts): RosterQuery,
) {
    let open = residents_open(&village, &setup, &saves, &sound);
    let display = if open { Display::Flex } else { Display::None };
    if layout.display != display {
        layout.display = display;
    }
    if !open {
        return;
    }
    for (tab, mut node) in &mut tabs {
        let tab_display = if tab.0 == village.resident_profile {
            Display::Flex
        } else {
            Display::None
        };
        if node.display != tab_display {
            node.display = tab_display;
        }
    }
    for (portrait, mut image) in &mut roster_portraits {
        if image.image != portraits.0[portrait.0] {
            image.image = portraits.0[portrait.0].clone();
        }
    }
    let roster_info: Vec<_> = (0..NAMES.len())
        .map(|index| village.construction.resident_roster_info(&catalog, index))
        .collect();
    for (part, mut text, mut color) in &mut roster_texts {
        match *part {
            RosterText::Activity(index) => {
                let wanted = &roster_info[index].0;
                if text.0 != *wanted {
                    text.0.clone_from(wanted);
                }
            }
            RosterText::Need(index) => {
                let (_, need, value) = roster_info[index];
                let wanted = format!("{need} {value:.0}%");
                if text.0 != wanted {
                    text.0 = wanted;
                }
                let wanted_color = need_color(value);
                if color.0 != wanted_color {
                    color.0 = wanted_color;
                }
            }
        }
    }
}

type OverviewTexts<'w, 's> = (
    Query<
        'w,
        's,
        (&'static HeaderText, &'static mut Text),
        (
            Without<ActivityText>,
            Without<PaidWorkText>,
            Without<HomeValueText>,
            Without<HomeNoteText>,
            Without<MeterLabel>,
            Without<WorkPriorityText>,
            Without<ReservationText>,
        ),
    >,
    Single<
        'w,
        's,
        &'static mut Text,
        (
            With<ActivityText>,
            Without<HeaderText>,
            Without<PaidWorkText>,
            Without<HomeValueText>,
            Without<HomeNoteText>,
            Without<MeterLabel>,
            Without<WorkPriorityText>,
            Without<ReservationText>,
        ),
    >,
    Single<
        'w,
        's,
        &'static mut Text,
        (
            With<PaidWorkText>,
            Without<HeaderText>,
            Without<ActivityText>,
            Without<HomeValueText>,
            Without<HomeNoteText>,
            Without<MeterLabel>,
            Without<WorkPriorityText>,
            Without<ReservationText>,
        ),
    >,
    Single<
        'w,
        's,
        &'static mut Text,
        (
            With<HomeValueText>,
            Without<HeaderText>,
            Without<ActivityText>,
            Without<PaidWorkText>,
            Without<HomeNoteText>,
            Without<MeterLabel>,
            Without<WorkPriorityText>,
            Without<ReservationText>,
        ),
    >,
    Single<
        'w,
        's,
        &'static mut Text,
        (
            With<HomeNoteText>,
            Without<HeaderText>,
            Without<ActivityText>,
            Without<PaidWorkText>,
            Without<HomeValueText>,
            Without<MeterLabel>,
            Without<WorkPriorityText>,
            Without<ReservationText>,
        ),
    >,
    Query<
        'w,
        's,
        (&'static MeterLabel, &'static mut Text),
        (
            Without<HeaderText>,
            Without<ActivityText>,
            Without<PaidWorkText>,
            Without<HomeValueText>,
            Without<HomeNoteText>,
            Without<WorkPriorityText>,
            Without<ReservationText>,
        ),
    >,
    Query<
        'w,
        's,
        (&'static WorkPriorityText, &'static mut Text),
        (
            Without<HeaderText>,
            Without<ActivityText>,
            Without<PaidWorkText>,
            Without<HomeValueText>,
            Without<HomeNoteText>,
            Without<MeterLabel>,
            Without<ReservationText>,
        ),
    >,
    Query<
        'w,
        's,
        (&'static ReservationText, &'static mut Text),
        (
            Without<HeaderText>,
            Without<ActivityText>,
            Without<PaidWorkText>,
            Without<HomeValueText>,
            Without<HomeNoteText>,
            Without<MeterLabel>,
            Without<WorkPriorityText>,
        ),
    >,
);

type MeterFills<'w, 's> = Query<
    'w,
    's,
    (
        &'static MeterFill,
        &'static mut Node,
        &'static mut BackgroundColor,
    ),
    Without<PaidWorkCard>,
>;

fn refresh_header_and_overview(
    (village, catalog, portraits): (Res<Village>, Res<Catalog>, Res<ResidentPortraits>),
    (setup, saves, sound): (Res<WorldSetup>, Res<SaveMenu>, Res<SoundSettings>),
    mut portrait: Single<&mut ImageNode, With<ResidentPortrait>>,
    mut paid_card: Single<&mut Node, With<PaidWorkCard>>,
    mut texts: OverviewTexts,
    mut fills: MeterFills,
) {
    if !residents_open(&village, &setup, &saves, &sound) {
        return;
    }
    let selected = village.selected_resident;
    if portrait.image != portraits.0[selected] {
        portrait.image = portraits.0[selected].clone();
    }
    let profile = &catalog.residents[selected];
    let traits = profile.traits.join(" · ");
    for (part, mut text) in &mut texts.0 {
        let wanted = match part {
            HeaderText::Name => NAMES[selected],
            HeaderText::Role => profile.role.as_str(),
            HeaderText::Traits => traits.as_str(),
        };
        if text.0 != wanted {
            text.0 = wanted.into();
        }
    }

    if !village.resident_overview_open() {
        return;
    }

    let current = village
        .construction
        .resident_activity_summary(&catalog, selected);
    if texts.1.0 != current {
        texts.1.0 = current;
    }

    let paid_display = if village.stock.sandbox {
        Display::None
    } else {
        Display::Flex
    };
    if paid_card.display != paid_display {
        paid_card.display = paid_display;
    }
    if !village.stock.sandbox {
        let shift = village
            .construction
            .resident_shift_summary(selected, village.clock);
        if texts.2.0 != shift {
            texts.2.0 = shift;
        }
    }

    let (home_value, home_note, _) = village
        .construction
        .resident_home_display(&catalog, selected);
    if texts.3.0 != home_value {
        texts.3.0 = home_value;
    }
    let full_home_note = if village.housing_notice.is_empty() {
        home_note
    } else {
        format!("{home_note}\n{}", village.housing_notice)
    };
    if texts.4.0 != full_home_note {
        texts.4.0 = full_home_note;
    }

    let values = village.construction.resident_need_meters(selected);
    for (label, mut text) in &mut texts.5 {
        let (name, value) = values[label.0];
        let wanted = format!("{name} {value:.0}%");
        if text.0 != wanted {
            text.0 = wanted;
        }
    }
    for (fill, mut node, mut background) in &mut fills {
        let value = values[fill.0].1;
        let width = percent(value.clamp(0., 100.) as f32);
        if node.width != width {
            node.width = width;
        }
        let color = need_color(value);
        if background.0 != color {
            background.0 = color;
        }
    }
    for (item, mut text) in &mut texts.6 {
        let (_, label) = village.construction.resident_work_priority(item.0);
        if text.0 != label {
            text.0 = label.into();
        }
    }
    for (item, mut text) in &mut texts.7 {
        let wanted = village
            .construction
            .resident_worker_reservation(item.0)
            .to_string();
        if text.0 != wanted {
            text.0 = wanted;
        }
    }
}

fn refresh_notes_and_story(
    (village, catalog): (Res<Village>, Res<Catalog>),
    (setup, saves, sound): (Res<WorldSetup>, Res<SaveMenu>, Res<SoundSettings>),
    mut notes_texts: Query<(&OverviewNoteText, &mut Text), Without<StoryText>>,
    mut story_texts: Query<(&StoryText, &mut Text), Without<OverviewNoteText>>,
) {
    if !residents_open(&village, &setup, &saves, &sound) {
        return;
    }
    let selected = village.selected_resident;
    match village.resident_profile {
        ResidentProfile::Overview => {
            let notes = village
                .construction
                .resident_notes(&catalog, &village.stock, selected);
            for (part, mut text) in &mut notes_texts {
                let wanted = match part {
                    OverviewNoteText::Thought => &notes.thought,
                    OverviewNoteText::HopeTitle => &notes.hope_heading,
                    OverviewNoteText::HopeReason => &notes.hope_reason,
                    OverviewNoteText::AboutHeading => &notes.about_heading,
                    OverviewNoteText::AboutBody => &notes.about_body,
                    OverviewNoteText::Memories => &notes.memories,
                };
                if text.0 != *wanted {
                    text.0.clone_from(wanted);
                }
            }
        }
        ResidentProfile::Story => {
            let sections = Construction::resident_story_sections(&catalog, selected);
            for (part, mut text) in &mut story_texts {
                let wanted = sections[part.0];
                if text.0 != wanted {
                    text.0 = wanted.into();
                }
            }
        }
        ResidentProfile::Skills | ResidentProfile::Relationships => {}
    }
}

type SkillsRelQueries<'w, 's> = (
    Single<'w, 's, Entity, With<SpecialtiesList>>,
    Single<
        'w,
        's,
        &'static mut Text,
        (
            With<SkillsBonusText>,
            Without<CraftSkillText>,
            Without<RelationshipText>,
        ),
    >,
    Single<'w, 's, &'static mut Node, (With<SkillsBonusFill>, Without<RelationshipFill>)>,
    Query<
        'w,
        's,
        (&'static CraftSkillText, &'static mut Text),
        (Without<SkillsBonusText>, Without<RelationshipText>),
    >,
    Query<'w, 's, (&'static RelationshipPortrait, &'static mut ImageNode)>,
    Query<
        'w,
        's,
        (
            &'static RelationshipText,
            &'static mut Text,
            &'static mut Node,
        ),
        (
            Without<SkillsBonusText>,
            Without<CraftSkillText>,
            Without<SkillsBonusFill>,
            Without<RelationshipFill>,
        ),
    >,
    Query<'w, 's, (&'static RelationshipFill, &'static mut Node), Without<SkillsBonusFill>>,
);

fn refresh_skills_and_relationships(
    mut commands: Commands,
    (village, catalog, assets, portraits): (
        Res<Village>,
        Res<Catalog>,
        Res<AssetServer>,
        Res<ResidentPortraits>,
    ),
    (setup, saves, sound): (Res<WorldSetup>, Res<SaveMenu>, Res<SoundSettings>),
    mut queries: SkillsRelQueries,
    mut specialties_resident: Local<Option<usize>>,
) {
    if !residents_open(&village, &setup, &saves, &sound) {
        return;
    }
    let selected = village.selected_resident;
    match village.resident_profile {
        ResidentProfile::Skills => {
            if *specialties_resident != Some(selected) {
                let mut container = commands.entity(*queries.0);
                container.despawn_related::<Children>();
                container.with_children(|chips| {
                    for key in &catalog.residents[selected].strengths {
                        if let Some(project) = catalog.projects.get(key) {
                            chips
                                .spawn((
                                    FocusPolicy::Pass,
                                    Node {
                                        padding: UiRect::axes(px(10), px(5)),
                                        border_radius: BorderRadius::all(px(8)),
                                        ..default()
                                    },
                                    BackgroundColor(theme::INSET),
                                ))
                                .with_child((
                                    FocusPolicy::Pass,
                                    Text::new(project.name.clone()),
                                    ui_font_weight(&assets, 13., 600),
                                ));
                        }
                    }
                });
                *specialties_resident = Some(selected);
            }
            let bonus = village.construction.resident_experience_bonus(selected);
            let bonus_label = format!("+{bonus:.0}% speed on all work");
            if queries.1.0 != bonus_label {
                queries.1.0 = bonus_label;
            }
            let width = percent((bonus / 15.0 * 100.0).clamp(0., 100.) as f32);
            if queries.2.width != width {
                queries.2.width = width;
            }
            let levels = village.construction.resident_craft_levels(selected);
            for (part, mut text) in &mut queries.3 {
                let (label, level) = levels[part.0];
                let wanted = format!("{label} · Level {level}");
                if text.0 != wanted {
                    text.0 = wanted;
                }
            }
        }
        ResidentProfile::Relationships => {
            let rows = village.construction.resident_relationship_rows(selected);
            for (slot, mut image) in &mut queries.4 {
                let partner_id = rows[slot.0].0;
                if image.image != portraits.0[partner_id] {
                    image.image = portraits.0[partner_id].clone();
                }
            }
            for (part, mut text, mut node) in &mut queries.5 {
                match *part {
                    RelationshipText::Header(slot) => {
                        let (_, name, label, score, _) = &rows[slot];
                        let wanted = format!("{name} · {label} · {score}/100");
                        if text.0 != wanted {
                            text.0 = wanted;
                        }
                    }
                    RelationshipText::Memory(slot) => {
                        let memory = rows[slot].4.as_deref().unwrap_or("");
                        let display = if memory.is_empty() {
                            Display::None
                        } else {
                            Display::Flex
                        };
                        if node.display != display {
                            node.display = display;
                        }
                        if text.0 != memory {
                            text.0 = memory.into();
                        }
                    }
                }
            }
            for (slot, mut node) in &mut queries.6 {
                let width = percent((rows[slot.0].3 as f32).clamp(0., 100.));
                if node.width != width {
                    node.width = width;
                }
            }
        }
        ResidentProfile::Overview | ResidentProfile::Story => {}
    }
}

fn button_state(
    action: ResidentButton,
    village: &Village,
    catalog: &Catalog,
) -> (bool, bool, bool, Option<String>) {
    let selected = village.selected_resident;
    match action {
        ResidentButton::Select(index) => (true, true, index == selected, None),
        ResidentButton::FindInVillage => (
            true,
            !village.construction.away_for_work(selected),
            false,
            None,
        ),
        ResidentButton::ViewProject => {
            let label = village
                .construction
                .resident_project_label(catalog, selected);
            (label.is_some(), label.is_some(), false, label)
        }
        ResidentButton::Tab(profile) => (true, true, profile == village.resident_profile, None),
        ResidentButton::ToggleShift => {
            let label = village.construction.shift_action(selected, false);
            (
                label.is_some(),
                label.is_some(),
                false,
                label.map(str::to_owned),
            )
        }
        ResidentButton::ToggleWeekdayShift => {
            let repeating = village
                .construction
                .resident_weekday_shift_repeating(selected);
            (true, true, repeating, None)
        }
        ResidentButton::StepHome(_) => {
            let (_, _, has_choices) = village
                .construction
                .resident_home_display(catalog, selected);
            (true, has_choices, false, None)
        }
        ResidentButton::WorkPriorityStep(group, forward) => {
            let (level, _) = village.construction.resident_work_priority(group);
            let enabled = if forward { level < 3 } else { level > 0 };
            (true, enabled, false, None)
        }
        ResidentButton::WorkerReservationStep(essential, forward) => {
            let count = village.construction.resident_worker_reservation(essential);
            let enabled = if forward { count < 5 } else { count > 0 };
            (true, enabled, false, None)
        }
    }
}

type ResidentButtons<'w, 's> = Query<
    'w,
    's,
    (
        &'static ResidentButton,
        &'static Interaction,
        &'static Children,
        &'static mut Node,
        &'static mut BackgroundColor,
        &'static mut BorderColor,
        &'static mut BoxShadow,
    ),
>;

fn paint_buttons(
    (village, catalog): (Res<Village>, Res<Catalog>),
    (setup, saves, sound): (Res<WorldSetup>, Res<SaveMenu>, Res<SoundSettings>),
    mut buttons: ResidentButtons,
    mut labels: Query<&mut Text, With<ButtonLabel>>,
) {
    if !residents_open(&village, &setup, &saves, &sound) {
        return;
    }
    for (action, interaction, children, mut node, mut fill, mut edge, mut shadow) in &mut buttons {
        let (visible, enabled, active, dynamic_label) = button_state(*action, &village, &catalog);
        let display = if visible {
            Display::Flex
        } else {
            Display::None
        };
        if node.display != display {
            node.display = display;
        }
        if !visible {
            continue;
        }
        theme::paint_button(
            *interaction,
            enabled,
            active,
            &mut fill,
            &mut edge,
            &mut shadow,
        );
        if let Some(label) = dynamic_label
            && let Some(&first) = children.first()
            && let Ok(mut text) = labels.get_mut(first)
            && text.0 != label
        {
            text.0 = label;
        }
    }
}

fn input(
    mut village: ResMut<Village>,
    (catalog, setup, saves, sound): (
        Res<Catalog>,
        Res<WorldSetup>,
        Res<SaveMenu>,
        Res<SoundSettings>,
    ),
    mut cameras: Query<&mut VillageCamera>,
    hud: Single<&Node, With<VillageHud>>,
    buttons: Query<(&ResidentButton, &Interaction), Changed<Interaction>>,
) {
    if hud.display == Display::None || !residents_open(&village, &setup, &saves, &sound) {
        return;
    }
    for (&action, &interaction) in &buttons {
        if interaction != Interaction::Pressed {
            continue;
        }
        let (visible, enabled, _, _) = button_state(action, &village, &catalog);
        if !visible || !enabled {
            continue;
        }
        let town = &mut *village;
        match action {
            ResidentButton::Select(index) => town.select_resident(index),
            ResidentButton::FindInVillage => {
                let Ok(mut camera) = cameras.single_mut() else {
                    continue;
                };
                let (position, _) = town
                    .construction
                    .resident_visual_position(town.selected_resident, &catalog);
                let position = world_position(position.x, position.y);
                let height = town.terrain(&setup).height_at(position.x, position.y);
                camera.target = Vec3::new(position.x, height, position.y);
                town.utility_panel = None;
                return;
            }
            ResidentButton::ViewProject => {
                let Ok(mut camera) = cameras.single_mut() else {
                    continue;
                };
                let resident = town.selected_resident;
                if town.construction.select_resident_project(resident) {
                    town.utility_panel = None;
                    town.focus_selected_project(&setup, &mut camera);
                    return;
                }
            }
            ResidentButton::Tab(profile) => town.resident_profile = profile,
            ResidentButton::ToggleShift => {
                let resident = town.selected_resident;
                town.construction.toggle_shift(resident);
            }
            ResidentButton::ToggleWeekdayShift => {
                let resident = town.selected_resident;
                town.construction.toggle_weekday_shift(resident);
            }
            ResidentButton::StepHome(forward) => {
                let resident = town.selected_resident;
                town.housing_notice = town
                    .construction
                    .resident_home_step(&catalog, resident, forward);
            }
            ResidentButton::WorkPriorityStep(group, forward) => {
                let (level, _) = town.construction.resident_work_priority(group);
                let next = if forward {
                    (level + 1).min(3)
                } else {
                    level.saturating_sub(1)
                };
                town.construction.set_work_priority(group, next);
            }
            ResidentButton::WorkerReservationStep(essential, forward) => {
                let count = town.construction.resident_worker_reservation(essential);
                let next = if forward {
                    (count + 1).min(5)
                } else {
                    count.saturating_sub(1)
                };
                town.construction.set_worker_reservation(essential, next);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resident_dialog_widgets_switch_residents_tabs_shifts_and_priorities() {
        let mut village = Village {
            camp: Some(CLEARING_CAMP),
            utility_panel: Some(UtilityPanel::Residents),
            ..default()
        };
        village
            .construction
            .set_work_priority(WorkGroup::Production, 2);

        let mut app = App::new();
        app.insert_resource(village)
            .init_resource::<Catalog>()
            .insert_resource(WorldSetup::default().session())
            .init_resource::<SaveMenu>()
            .init_resource::<SoundSettings>()
            .add_systems(Update, input);

        let world = app.world_mut();
        world.spawn((VillageHud, Node::default()));
        world.spawn(VillageCamera {
            target: Vec3::ZERO,
            heading: 0.,
            polar: crate::default_camera_polar(),
        });

        let press = |app: &mut App, action: ResidentButton| {
            let entity = app.world_mut().spawn((action, Interaction::Pressed)).id();
            app.update();
            app.world_mut().entity_mut(entity).despawn();
        };

        press(&mut app, ResidentButton::Select(2));
        assert_eq!(app.world().resource::<Village>().selected_resident, 2);

        press(&mut app, ResidentButton::Tab(ResidentProfile::Skills));
        assert!(app.world().resource::<Village>().resident_profile == ResidentProfile::Skills);

        press(&mut app, ResidentButton::ToggleShift);
        assert_eq!(
            app.world()
                .resource::<Village>()
                .construction
                .shift_action(2, false),
            Some("Cancel day shift")
        );

        press(&mut app, ResidentButton::ToggleWeekdayShift);
        assert!(
            app.world()
                .resource::<Village>()
                .construction
                .resident_weekday_shift_repeating(2)
        );

        press(
            &mut app,
            ResidentButton::WorkPriorityStep(WorkGroup::Production, true),
        );
        assert_eq!(
            app.world()
                .resource::<Village>()
                .construction
                .resident_work_priority(WorkGroup::Production)
                .0,
            3
        );

        press(&mut app, ResidentButton::WorkerReservationStep(true, true));
        assert_eq!(
            app.world()
                .resource::<Village>()
                .construction
                .resident_worker_reservation(true),
            2
        );

        press(&mut app, ResidentButton::FindInVillage);
        assert!(app.world().resource::<Village>().utility_panel.is_none());
    }
}
