use bevy::ui::FocusPolicy;

use super::*;
use crate::{
    construction::BUILD_ROWS,
    theme,
    ui_font::{ui_font_styled, ui_font_weight},
};

const CARD_WIDTH: f32 = 316.0;
const RECENT_EVENTS_LIMIT: usize = 8;

#[derive(Component)]
struct ProjectsCard;

#[derive(Component, Clone, Copy)]
enum ProjectsAction {
    Close,
    Focus(usize),
    ToggleRoads,
    ToggleBuilt,
    Page(bool),
    ToggleEvents,
}

#[derive(Component, Clone, Copy)]
enum ProjectsSection {
    Freight,
    Empty,
    UnderwayList,
    UnderwayRow(usize),
    BuiltSection,
    BuiltList,
    BuiltRow(usize),
    Pager,
    EventsBody,
}

#[derive(Component, Clone, Copy)]
enum ProjectsText {
    Freight,
    RoadsTitle,
    RoadsToggle,
    BuiltTitle,
    BuiltToggle,
    PageLabel,
    EventsToggle,
    RowName { slot: usize, built: bool },
    RowBadge { slot: usize, built: bool },
    RowDetail(usize),
    EventLine(usize),
}

#[derive(Component, Clone, Copy)]
struct RowProgressTrack(usize);

#[derive(Component, Clone, Copy)]
struct RowProgressFill(usize);

pub(super) fn install(app: &mut App) {
    app.add_systems(Startup, spawn)
        .add_systems(Update, input.after(read_camp_pointer).before(village_input))
        .add_systems(Update, (refresh, scroll_card).chain().after(show_hud));
}

pub(super) fn visible(
    village: &Village,
    setup: &WorldSetup,
    saves: &SaveMenu,
    sound: &SoundSettings,
) -> bool {
    village.utility_panel == Some(UtilityPanel::Projects)
        && !village.guide.open()
        && !village.lenses.open
        && !setup.open
        && !saves.open
        && !sound.open
        && !build_menu::visible(setup, village, saves, sound)
}

fn spawn_project_row(
    parent: &mut ChildSpawnerCommands,
    assets: &AssetServer,
    slot: usize,
    built: bool,
) {
    let section = if built {
        ProjectsSection::BuiltRow(slot)
    } else {
        ProjectsSection::UnderwayRow(slot)
    };
    parent
        .spawn((
            section,
            Node {
                display: Display::None,
                flex_direction: FlexDirection::Column,
                row_gap: px(3),
                width: percent(100),
                flex_shrink: 0.,
                ..default()
            },
        ))
        .with_children(|entry| {
            entry
                .spawn((
                    ProjectsAction::Focus(slot),
                    Button,
                    theme::button_node(Node {
                        width: percent(100),
                        padding: UiRect::new(px(6), px(10), px(5), px(5)),
                        column_gap: px(8),
                        align_items: AlignItems::Center,
                        ..default()
                    }),
                    theme::button(),
                ))
                .with_children(|button| {
                    button.spawn((
                        thumbnails::ThumbnailImage(slot),
                        ImageNode::default(),
                        Node {
                            display: Display::None,
                            width: px(36),
                            height: px(30),
                            flex_shrink: 0.,
                            ..default()
                        },
                    ));
                    button.spawn((
                        ProjectsText::RowName { slot, built },
                        Text::default(),
                        ui_font_weight(assets, 12.5, 600),
                        Node {
                            flex_grow: 1.,
                            min_width: px(0),
                            ..default()
                        },
                    ));
                    button.spawn((
                        ProjectsText::RowBadge { slot, built },
                        Text::default(),
                        ui_font_styled(
                            assets,
                            if built { 15. } else { 11. },
                            if built { 750 } else { 600 },
                            if built { theme::LEAF } else { theme::CAPTION },
                        ),
                    ));
                });

            if !built {
                entry
                    .spawn((
                        RowProgressTrack(slot),
                        Node {
                            display: Display::None,
                            width: percent(100),
                            height: px(6),
                            border_radius: BorderRadius::MAX,
                            overflow: Overflow::clip(),
                            ..default()
                        },
                        BackgroundColor(theme::TRACK),
                    ))
                    .with_child((
                        RowProgressFill(slot),
                        Node {
                            width: percent(0),
                            height: percent(100),
                            border_radius: BorderRadius::MAX,
                            ..default()
                        },
                        BackgroundColor(theme::LEAF),
                    ));
                entry.spawn((
                    ProjectsText::RowDetail(slot),
                    Text::default(),
                    ui_font_styled(assets, 11., 400, theme::MUTED),
                    Node {
                        display: Display::None,
                        padding: UiRect::horizontal(px(4)),
                        ..default()
                    },
                ));
            }
        });
}

fn spawn(mut commands: Commands, assets: Res<AssetServer>) {
    commands
        .spawn((
            super::BelowTopBar,
            ProjectsCard,
            Interaction::None,
            FocusPolicy::Block,
            GlobalZIndex(10),
            theme::panel_node(Node {
                display: Display::None,
                position_type: PositionType::Absolute,
                left: px(22),
                top: px(top_bar_clearance()),
                width: px(CARD_WIDTH),
                flex_direction: FlexDirection::Column,
                padding: UiRect::all(px(16)),
                row_gap: px(10),
                overflow: Overflow::scroll_y(),
                ..default()
            }),
            ScrollPosition::default(),
            theme::panel(),
        ))
        .with_children(|card| {
            // Header
            card.spawn(Node {
                align_items: AlignItems::Center,
                justify_content: JustifyContent::SpaceBetween,
                column_gap: px(8),
                flex_shrink: 0.,
                ..default()
            })
            .with_children(|header| {
                header
                    .spawn(Node {
                        flex_direction: FlexDirection::Column,
                        row_gap: px(1),
                        ..default()
                    })
                    .with_children(|left| {
                        left.spawn((
                            Text::new("VILLAGE WORK"),
                            ui_font_styled(&assets, 10., 750, theme::CAPTION),
                        ));
                        left.spawn((
                            Text::new("Your projects"),
                            ui_font_weight(&assets, 22., 750),
                        ));
                    });
                header
                    .spawn((
                        ProjectsAction::Close,
                        Button,
                        Node {
                            width: px(30),
                            height: px(30),
                            border: UiRect::all(px(2)),
                            border_radius: BorderRadius::MAX,
                            align_items: AlignItems::Center,
                            justify_content: JustifyContent::Center,
                            flex_shrink: 0.,
                            ..default()
                        },
                        theme::button(),
                    ))
                    .with_child((Text::new("×"), ui_font_weight(&assets, 18., 700)));
            });

            // Optional reserved freight inset
            card.spawn((
                ProjectsSection::Freight,
                Node {
                    display: Display::None,
                    padding: UiRect::axes(px(10), px(8)),
                    border: UiRect::left(px(3)),
                    border_radius: BorderRadius::all(px(8)),
                    flex_shrink: 0.,
                    ..default()
                },
                BackgroundColor(theme::INSET),
                BorderColor::all(theme::LEAF),
            ))
            .with_child((
                ProjectsText::Freight,
                Text::default(),
                ui_font_weight(&assets, 11.5, 500),
            ));

            // Empty message
            card.spawn((
                ProjectsSection::Empty,
                Text::new("No projects here yet. Open Build to start a project."),
                ui_font_styled(&assets, 12., 400, theme::MUTED),
                Node {
                    display: Display::None,
                    flex_shrink: 0.,
                    ..default()
                },
            ));

            // Underway projects list
            card.spawn((
                ProjectsSection::UnderwayList,
                Node {
                    display: Display::None,
                    flex_direction: FlexDirection::Column,
                    row_gap: px(8),
                    width: percent(100),
                    flex_shrink: 0.,
                    ..default()
                },
            ))
            .with_children(|list| {
                for slot in 0..BUILD_ROWS {
                    spawn_project_row(list, &assets, slot, false);
                }
            });

            // Optional Roads group toggle
            card.spawn((
                ProjectsAction::ToggleRoads,
                Button,
                crate::audio::DisclosureSound,
                theme::button_node(Node {
                    display: Display::None,
                    width: percent(100),
                    padding: UiRect::axes(px(10), px(6)),
                    justify_content: JustifyContent::SpaceBetween,
                    align_items: AlignItems::Center,
                    column_gap: px(8),
                    flex_shrink: 0.,
                    ..default()
                }),
                theme::button(),
            ))
            .with_children(|row| {
                row.spawn((
                    ProjectsText::RoadsTitle,
                    Text::default(),
                    ui_font_weight(&assets, 12., 600),
                ));
                row.spawn((
                    ProjectsText::RoadsToggle,
                    Text::new("+"),
                    ui_font_styled(&assets, 13., 700, theme::CAPTION),
                ));
            });

            // Collapsible "Around the village · N built" section
            card.spawn((
                ProjectsSection::BuiltSection,
                Node {
                    display: Display::None,
                    flex_direction: FlexDirection::Column,
                    row_gap: px(8),
                    width: percent(100),
                    border: UiRect::top(px(1)),
                    padding: UiRect::top(px(10)),
                    flex_shrink: 0.,
                    ..default()
                },
                BorderColor::all(theme::SUBTLE_BORDER),
            ))
            .with_children(|section| {
                section
                    .spawn((
                        ProjectsAction::ToggleBuilt,
                        Button,
                        crate::audio::DisclosureSound,
                        theme::button_node(Node {
                            width: percent(100),
                            padding: UiRect::axes(px(10), px(6)),
                            justify_content: JustifyContent::SpaceBetween,
                            align_items: AlignItems::Center,
                            column_gap: px(8),
                            ..default()
                        }),
                        theme::button(),
                    ))
                    .with_children(|toggle| {
                        toggle.spawn((
                            ProjectsText::BuiltTitle,
                            Text::new("Around the village · 0 built"),
                            ui_font_weight(&assets, 12.5, 650),
                        ));
                        toggle.spawn((
                            ProjectsText::BuiltToggle,
                            Text::new("−"),
                            ui_font_styled(&assets, 13., 700, theme::CAPTION),
                        ));
                    });

                section
                    .spawn((
                        ProjectsSection::BuiltList,
                        Node {
                            display: Display::None,
                            flex_direction: FlexDirection::Column,
                            row_gap: px(6),
                            width: percent(100),
                            ..default()
                        },
                    ))
                    .with_children(|list| {
                        for slot in 0..BUILD_ROWS {
                            spawn_project_row(list, &assets, slot, true);
                        }
                    });
            });

            // In-card paging (‹ page ›)
            card.spawn((
                ProjectsSection::Pager,
                Node {
                    display: Display::None,
                    align_items: AlignItems::Center,
                    justify_content: JustifyContent::SpaceBetween,
                    column_gap: px(8),
                    width: percent(100),
                    flex_shrink: 0.,
                    ..default()
                },
            ))
            .with_children(|pager| {
                pager
                    .spawn((
                        ProjectsAction::Page(false),
                        Button,
                        theme::button_node(Node {
                            padding: UiRect::axes(px(12), px(5)),
                            align_items: AlignItems::Center,
                            justify_content: JustifyContent::Center,
                            ..default()
                        }),
                        theme::button(),
                    ))
                    .with_child((Text::new("‹"), ui_font_weight(&assets, 14., 700)));
                pager.spawn((
                    ProjectsText::PageLabel,
                    Text::new("1 / 1"),
                    ui_font_styled(&assets, 12., 600, theme::MUTED),
                ));
                pager
                    .spawn((
                        ProjectsAction::Page(true),
                        Button,
                        theme::button_node(Node {
                            padding: UiRect::axes(px(12), px(5)),
                            align_items: AlignItems::Center,
                            justify_content: JustifyContent::Center,
                            ..default()
                        }),
                        theme::button(),
                    ))
                    .with_child((Text::new("›"), ui_font_weight(&assets, 14., 700)));
            });

            // Collapsible "Recent events" section
            card.spawn((
                Node {
                    flex_direction: FlexDirection::Column,
                    row_gap: px(8),
                    width: percent(100),
                    border: UiRect::top(px(1)),
                    padding: UiRect::top(px(10)),
                    flex_shrink: 0.,
                    ..default()
                },
                BorderColor::all(theme::SUBTLE_BORDER),
            ))
            .with_children(|events| {
                events
                    .spawn((
                        ProjectsAction::ToggleEvents,
                        Button,
                        crate::audio::DisclosureSound,
                        theme::button_node(Node {
                            width: percent(100),
                            padding: UiRect::axes(px(10), px(6)),
                            justify_content: JustifyContent::SpaceBetween,
                            align_items: AlignItems::Center,
                            column_gap: px(8),
                            ..default()
                        }),
                        theme::button(),
                    ))
                    .with_children(|toggle| {
                        toggle.spawn((
                            Text::new("Recent events"),
                            ui_font_weight(&assets, 12.5, 650),
                        ));
                        toggle.spawn((
                            ProjectsText::EventsToggle,
                            Text::new("+"),
                            ui_font_styled(&assets, 13., 700, theme::CAPTION),
                        ));
                    });

                events
                    .spawn((
                        ProjectsSection::EventsBody,
                        Node {
                            display: Display::None,
                            flex_direction: FlexDirection::Column,
                            row_gap: px(5),
                            width: percent(100),
                            padding: UiRect::axes(px(4), px(2)),
                            ..default()
                        },
                    ))
                    .with_children(|body| {
                        for index in 0..RECENT_EVENTS_LIMIT {
                            body.spawn((
                                ProjectsText::EventLine(index),
                                Text::default(),
                                ui_font_styled(&assets, 11.5, 400, theme::MUTED),
                                Node {
                                    display: Display::None,
                                    ..default()
                                },
                            ));
                        }
                    });
            });
        });
}

type RefreshState<'w> = (
    Res<'w, Village>,
    Res<'w, Catalog>,
    Res<'w, WorldSetup>,
    Res<'w, SaveMenu>,
    Res<'w, SoundSettings>,
);

type CardNode<'w, 's> = Single<
    'w,
    's,
    (&'static mut Node, &'static mut ScrollPosition),
    (
        With<ProjectsCard>,
        Without<ProjectsSection>,
        Without<ProjectsAction>,
        Without<ProjectsText>,
        Without<RowProgressTrack>,
        Without<RowProgressFill>,
    ),
>;

type SectionNodes<'w, 's> = Query<
    'w,
    's,
    (&'static ProjectsSection, &'static mut Node),
    (
        Without<ProjectsCard>,
        Without<ProjectsAction>,
        Without<ProjectsText>,
        Without<RowProgressTrack>,
        Without<RowProgressFill>,
    ),
>;

type ActionButtons<'w, 's> = Query<
    'w,
    's,
    (
        &'static ProjectsAction,
        &'static Interaction,
        &'static mut Node,
        &'static mut BackgroundColor,
        &'static mut BorderColor,
        &'static mut BoxShadow,
    ),
    (
        Without<ProjectsCard>,
        Without<ProjectsSection>,
        Without<ProjectsText>,
        Without<RowProgressTrack>,
        Without<RowProgressFill>,
    ),
>;

type CardTexts<'w, 's> = Query<
    'w,
    's,
    (
        &'static ProjectsText,
        &'static mut Text,
        &'static mut TextColor,
        &'static mut Node,
    ),
    (
        Without<ProjectsCard>,
        Without<ProjectsSection>,
        Without<ProjectsAction>,
        Without<RowProgressTrack>,
        Without<RowProgressFill>,
    ),
>;

type ProgressBars<'w, 's> = (
    Query<
        'w,
        's,
        (&'static RowProgressTrack, &'static mut Node),
        (
            Without<ProjectsCard>,
            Without<ProjectsSection>,
            Without<ProjectsAction>,
            Without<ProjectsText>,
            Without<RowProgressFill>,
        ),
    >,
    Query<
        'w,
        's,
        (&'static RowProgressFill, &'static mut Node),
        (
            Without<ProjectsCard>,
            Without<ProjectsSection>,
            Without<ProjectsAction>,
            Without<ProjectsText>,
            Without<RowProgressTrack>,
        ),
    >,
);

type LayoutQuery<'w, 's> = (
    Single<'w, 's, &'static Window, With<PrimaryWindow>>,
    Single<'w, 's, &'static ComputedNode, With<toolbar::Toolbar>>,
);

type InputContext<'w> = (
    Res<'w, Catalog>,
    Res<'w, Land>,
    Res<'w, WorldSetup>,
    Res<'w, SaveMenu>,
    Res<'w, SoundSettings>,
);

fn refresh(
    (village, catalog, setup, saves, sound): RefreshState,
    (window, dock): LayoutQuery,
    mut card: CardNode,
    mut sections: SectionNodes,
    mut buttons: ActionButtons,
    mut texts: CardTexts,
    (mut tracks, mut fills): ProgressBars,
) {
    let open = visible(&village, &setup, &saves, &sound);
    let (card_node, scroll) = &mut *card;
    let display = if open { Display::Flex } else { Display::None };
    if card_node.display != display {
        card_node.display = display;
    }
    if !open {
        scroll.y = 0.0;
        return;
    }

    let dock_height = dock.size().y * dock.inverse_scale_factor();
    let clearance = if dock_height > 0.0 {
        dock_height + 42.0
    } else {
        110.0
    };
    let max_height = px((window.height() - top_bar_clearance() - clearance).max(160.0));
    if card_node.max_height != max_height {
        card_node.max_height = max_height;
    }

    let view = village.construction.project_list_view(
        &catalog,
        &village.stock,
        village.projects_page,
        village.open_projects_only,
        village.project_roads_expanded,
        village.clock,
    );
    let freight = village.construction.reserved_freight_status(village.clock);
    let events = if village.project_events_expanded {
        village.construction.recent_event_lines(RECENT_EVENTS_LIMIT)
    } else {
        Vec::new()
    };

    let has_underway_on_page = view.rows.iter().any(|row| !row.done);
    let has_built_on_page = view.rows.iter().any(|row| row.done);
    let built_expanded = !village.open_projects_only;
    let show_empty = view.underway_count == 0 && view.built_count == 0 && view.roads.0 == 0;

    for (section, mut node) in &mut sections {
        let shown = match *section {
            ProjectsSection::Freight => freight.is_some(),
            ProjectsSection::Empty => show_empty,
            ProjectsSection::UnderwayList => has_underway_on_page,
            ProjectsSection::UnderwayRow(slot) => view.rows.get(slot).is_some_and(|row| !row.done),
            ProjectsSection::BuiltSection => view.built_count > 0 || !show_empty,
            ProjectsSection::BuiltList => built_expanded && has_built_on_page,
            ProjectsSection::BuiltRow(slot) => {
                built_expanded && view.rows.get(slot).is_some_and(|row| row.done)
            }
            ProjectsSection::Pager => view.pages > 1,
            ProjectsSection::EventsBody => village.project_events_expanded,
        };
        let target = if shown { Display::Flex } else { Display::None };
        if node.display != target {
            node.display = target;
        }
    }

    for (&action, &interaction, mut node, mut fill, mut edge, mut shadow) in &mut buttons {
        let (shown, active) = match action {
            ProjectsAction::ToggleRoads => (view.roads.0 > 0, village.project_roads_expanded),
            ProjectsAction::ToggleBuilt => (true, built_expanded && view.built_count > 0),
            ProjectsAction::ToggleEvents => (true, village.project_events_expanded),
            _ => (true, false),
        };
        if matches!(action, ProjectsAction::ToggleRoads) {
            let target = if shown { Display::Flex } else { Display::None };
            if node.display != target {
                node.display = target;
            }
        }
        if !shown {
            continue;
        }
        theme::paint_button(interaction, true, active, &mut fill, &mut edge, &mut shadow);
    }

    for (track, mut node) in &mut tracks {
        let shown = view
            .rows
            .get(track.0)
            .is_some_and(|row| !row.done && row.progress.is_some());
        let target = if shown { Display::Flex } else { Display::None };
        if node.display != target {
            node.display = target;
        }
    }
    for (fill, mut node) in &mut fills {
        let pct = view
            .rows
            .get(fill.0)
            .and_then(|row| row.progress)
            .unwrap_or(0.0)
            * 100.0;
        let target = percent(pct);
        if node.width != target {
            node.width = target;
        }
    }

    for (part, mut text, mut color, mut node) in &mut texts {
        match *part {
            ProjectsText::Freight => {
                let wanted = freight.as_deref().unwrap_or("");
                if text.0 != wanted {
                    text.0 = wanted.into();
                }
            }
            ProjectsText::RoadsTitle => {
                let (total, ready) = view.roads;
                let wanted = format!("Roads · {total} tiles · {ready} ready");
                if text.0 != wanted {
                    text.0 = wanted;
                }
            }
            ProjectsText::RoadsToggle => {
                let wanted = if village.project_roads_expanded {
                    "−"
                } else {
                    "+"
                };
                if text.0 != wanted {
                    text.0 = wanted.into();
                }
            }
            ProjectsText::BuiltTitle => {
                let wanted = format!("Around the village · {} built", view.built_count);
                if text.0 != wanted {
                    text.0 = wanted;
                }
            }
            ProjectsText::BuiltToggle => {
                let wanted = if built_expanded { "−" } else { "+" };
                if text.0 != wanted {
                    text.0 = wanted.into();
                }
            }
            ProjectsText::PageLabel => {
                let wanted = format!("{} / {}", view.page + 1, view.pages);
                if text.0 != wanted {
                    text.0 = wanted;
                }
            }
            ProjectsText::EventsToggle => {
                let wanted = if village.project_events_expanded {
                    "−"
                } else {
                    "+"
                };
                if text.0 != wanted {
                    text.0 = wanted.into();
                }
            }
            ProjectsText::RowName { slot, built } => {
                if let Some(row) = view.rows.get(slot)
                    && row.done == built
                {
                    let wanted = if row.priority {
                        format!("{} · Priority", row.name)
                    } else {
                        row.name.clone()
                    };
                    if text.0 != wanted {
                        text.0 = wanted;
                    }
                }
            }
            ProjectsText::RowBadge { slot, built } => {
                if let Some(row) = view.rows.get(slot)
                    && row.done == built
                {
                    if text.0 != row.badge {
                        text.0.clone_from(&row.badge);
                    }
                    let wanted_color = if built && row.badge == "✓" {
                        theme::LEAF
                    } else if built {
                        theme::NEED_LOW
                    } else {
                        theme::CAPTION
                    };
                    if color.0 != wanted_color {
                        color.0 = wanted_color;
                    }
                }
            }
            ProjectsText::RowDetail(slot) => {
                let wanted = view
                    .rows
                    .get(slot)
                    .filter(|row| !row.done)
                    .map_or("", |row| row.detail.as_str());
                let target = if wanted.is_empty() {
                    Display::None
                } else {
                    Display::Flex
                };
                if node.display != target {
                    node.display = target;
                }
                if text.0 != wanted {
                    text.0 = wanted.into();
                }
            }
            ProjectsText::EventLine(index) => {
                let wanted = if events.is_empty() && index == 0 {
                    "No village events recorded."
                } else {
                    events.get(index).map_or("", String::as_str)
                };
                let target = if wanted.is_empty() {
                    Display::None
                } else {
                    Display::Flex
                };
                if node.display != target {
                    node.display = target;
                }
                if text.0 != wanted {
                    text.0 = wanted.into();
                }
            }
        }
    }
}

fn scroll_card(
    scroll: Res<bevy::input::mouse::AccumulatedMouseScroll>,
    mut card: Single<(&Node, &Interaction, &mut ScrollPosition), With<ProjectsCard>>,
    buttons: Query<&Interaction, (With<ProjectsAction>, Without<ProjectsCard>)>,
) {
    let (node, interaction, position) = &mut *card;
    if node.display == Display::None || scroll.delta.y == 0.0 {
        return;
    }
    let hovered = **interaction != Interaction::None
        || buttons.iter().any(|state| *state != Interaction::None);
    if hovered {
        let step = match scroll.unit {
            bevy::input::mouse::MouseScrollUnit::Line => 34.0,
            bevy::input::mouse::MouseScrollUnit::Pixel => 1.0,
        };
        position.y = (position.y - scroll.delta.y * step).max(0.0);
    }
}

fn input(
    mut village: ResMut<Village>,
    (catalog, land, setup, saves, sound): InputContext,
    mut camera: Single<&mut VillageCamera>,
    buttons: Query<(&ProjectsAction, &Interaction), Changed<Interaction>>,
) {
    if !visible(&village, &setup, &saves, &sound) {
        return;
    }
    for (&action, &interaction) in &buttons {
        if interaction != Interaction::Pressed {
            continue;
        }
        match action {
            ProjectsAction::Close => {
                village.utility_panel = None;
                return;
            }
            ProjectsAction::Focus(row) => {
                village.focus_project_row(&catalog, &setup, &mut camera, row);
                return;
            }
            ProjectsAction::ToggleRoads => {
                village.toggle_project_roads();
            }
            ProjectsAction::ToggleBuilt => {
                village.open_projects_only = !village.open_projects_only;
                village.projects_page = 0;
            }
            ProjectsAction::Page(forward) => {
                village.change_panel_page(&catalog, &land, forward);
            }
            ProjectsAction::ToggleEvents => {
                village.project_events_expanded = !village.project_events_expanded;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn projects_card_pages_toggles_sections_and_focuses_projects() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default().session();
        let land = Land::default();
        let mut village = Village {
            camp: Some(CLEARING_CAMP),
            setup: Some(setup.clone()),
            utility_panel: Some(UtilityPanel::Projects),
            ..default()
        };
        village.stock.sandbox = true;
        let terrain = village.terrain(&setup);
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: setup.round_trip_km(),
        };
        for offset in 0..10 {
            let cell = IVec2::new(26 + (offset % 5) * 4, 26 + (offset / 5) * 4);
            village.construction.place_inventory_producer("well", true);
            village.construction.place_blueprint(
                &catalog,
                &mut village.stock,
                ConstructionSite {
                    terrain: &terrain,
                    land: &land,
                    camp: CLEARING_CAMP,
                },
                cell,
                clock,
                false,
            );
        }
        village.construction.menu = false;
        assert!(
            village
                .construction
                .project_list_view(&catalog, &village.stock, 0, false, false, 0.0)
                .pages
                >= 2
        );

        let mut app = App::new();
        app.insert_resource(village)
            .insert_resource(catalog)
            .insert_resource(land)
            .insert_resource(setup)
            .init_resource::<SaveMenu>()
            .init_resource::<SoundSettings>()
            .add_systems(Update, input);
        app.world_mut().spawn(VillageCamera {
            target: Vec3::ZERO,
            heading: 0.0,
            polar: crate::default_camera_polar(),
        });

        let press = |app: &mut App, action: ProjectsAction| {
            let entity = app.world_mut().spawn((action, Interaction::Pressed)).id();
            app.update();
            app.world_mut().entity_mut(entity).despawn();
        };

        assert_eq!(app.world().resource::<Village>().projects_page, 0);
        press(&mut app, ProjectsAction::Page(true));
        assert_eq!(app.world().resource::<Village>().projects_page, 1);
        press(&mut app, ProjectsAction::Page(false));
        assert_eq!(app.world().resource::<Village>().projects_page, 0);

        press(&mut app, ProjectsAction::ToggleBuilt);
        assert!(app.world().resource::<Village>().open_projects_only);
        press(&mut app, ProjectsAction::ToggleBuilt);
        assert!(!app.world().resource::<Village>().open_projects_only);

        press(&mut app, ProjectsAction::ToggleEvents);
        assert!(app.world().resource::<Village>().project_events_expanded);
        press(&mut app, ProjectsAction::ToggleEvents);
        assert!(!app.world().resource::<Village>().project_events_expanded);

        press(&mut app, ProjectsAction::Focus(0));
        assert!(app.world().resource::<Village>().utility_panel.is_none());
        let target = app
            .world_mut()
            .query::<&VillageCamera>()
            .single(app.world())
            .unwrap()
            .target;
        assert_ne!(target, Vec3::ZERO);

        app.world_mut().resource_mut::<Village>().utility_panel = Some(UtilityPanel::Projects);
        press(&mut app, ProjectsAction::Close);
        assert!(app.world().resource::<Village>().utility_panel.is_none());
    }
}
