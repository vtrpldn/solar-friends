use super::*;
use crate::{
    theme,
    ui_font::{ui_font, ui_font_styled, ui_font_weight},
};

use bevy::prelude::*;

const TOPICS: [(&str, &str); 7] = [
    (
        "Getting started",
        "Choose a campsite after the residents arrive.\n\
         Keep tents clear of the river, road and unloaded supplies.\n\
         Use B to open Build. Select a project and click the map to plan it.\n\
         Check F11 for progress and F10 for available supplies.\n\
         Space pauses or resumes time. Outside menus, 1–4 set the speed.\n\
         F5 saves the village. F6 opens the saved village library.\n\
         Shift+F5 exports a local bug report with the current village state.",
    ),
    (
        "Keyboard & camera",
        "WASD / Arrow keys · Pan     Shift · Pan faster\n\
         Q / E or right drag · Rotate     Scroll or + / − · Zoom\n\
         Home · Camp     End · River bend     Shift+End · Whole plot     Shift+Home · Reset view\n\
         Space · Pause     1–4 · Speed     Esc · Cancel placement or close a panel\n\
         B · Build     / · Search     R · Rotate the current placement (Shift+R reverses)\n\
         F4 · Terrain tools     F11 · Projects     Shift+G · Grid\n\
         With no project selected, T opens terrain tools and J opens Projects.\n\
         In road planning, Shift-click extends and Z undoes the last stroke.",
    ),
    (
        "Village management",
        "N · Residents     P · Power     U / V · Water\n\
         M / H · Finances, trade and pantry (Tab switches pages)\n\
         F7 · Maintenance     F8 · Events     I / F10 · Stores in Story\n\
         F · Weather forecast     L · Advance time\n\
         Finances and maintenance are available in economy mode.",
    ),
    (
        "Construction and deliveries",
        "In economy mode, a plan reserves materials from stores.\n\
         With auto-buy enabled, missing supplies can be ordered for town pickup.\n\
         Residents collect the orders, haul loads to the site and then build.\n\
         Open F11 to see which stage is pending. Focus a site and press Z to prioritize it.\n\
         X cancels an unstarted plan or queues salvage. A boarded delivery must arrive first.",
    ),
    (
        "Stores and production",
        "F10 shows stock on hand and where goods have been committed.\n\
         Reserved supplies can already belong to a plan, order or batch.\n\
         Select a finished facility and press C to see its available recipes.\n\
         Residents collect ingredients, perform the work and return output to stores.\n\
         If the facility is waiting for power, check its supply with P.",
    ),
    (
        "Growing food",
        "Choose Cultivated field in Build and set its size before placing it.\n\
         [ ] changes width. Shift+[ ] changes depth. R rotates the field.\n\
         Select a field or garden and press K to manage cultivation.\n\
         Plan beds, sow crops and check moisture as they grow.\n\
         Press T on a selected bed to switch irrigation. V shows the village water supply.",
    ),
    (
        "Housing and village finances",
        "Use N and 1–5 to choose a resident. Click an available finished home.\n\
         T assigns the selected home, and Y clears the assignment.\n\
         In economy mode, H shows the village balance and upcoming commitments.\n\
         Tab opens Trade, then Pantry. Check the quote before placing an order.\n\
         Check F7 for upcoming upkeep and F8 for recent village events.",
    ),
];

#[derive(serde::Deserialize)]
struct Chapter {
    title: String,
    description: String,
    tip: String,
    boundary: String,
    facts: Option<Facts>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
enum Facts {
    Crops,
    Compost,
    Grid,
    Food,
}

impl Facts {
    fn text(&self, catalog: &Catalog) -> Vec<String> {
        use crate::{economy_reference, farming::Crop, food};
        match self {
            Self::Crops => Crop::ALL
                .map(|crop| format!("{} · {} favorable growth days", crop.label(), crop.days()))
                .into(),
            Self::Food => Crop::ALL
                .iter()
                .filter_map(|crop| {
                    food::shelf(crop.material()).map(|days| {
                        format!("{} · {days} days before ordinary spoilage", crop.label())
                    })
                })
                .collect(),
            Self::Grid => vec![format!(
                "Grid backup · Up to {} kW · R${:.2}/kWh",
                economy_reference::GRID_CAPACITY,
                economy_reference::GRID_TARIFF_CENTS / 100.0,
            )],
            Self::Compost => {
                let recipe = &catalog.production["compost"];
                vec![format!(
                    "Composting · {} kg residues → {} kg mature compost",
                    recipe.input["scraps"], recipe.output["compost"],
                )]
            }
        }
    }
}

fn chapters() -> &'static [Chapter] {
    static CHAPTERS: std::sync::OnceLock<Vec<Chapter>> = std::sync::OnceLock::new();
    CHAPTERS.get_or_init(|| {
        serde_json::from_str(include_str!("../../data/guide.json")).expect("embedded village guide")
    })
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Screen {
    Quick(usize),
    Index(usize),
    Chapter(usize),
    Diagram(usize),
    Search,
}

#[derive(Default)]
pub(super) struct Guide {
    screen: Option<Screen>,
    query: String,
    /// Diagram magnification relative to fitting the window; 1.0 fits.
    zoom: Option<f32>,
}

const ZOOM_STEP: f32 = 0.25;
const ZOOM_RANGE: (f32, f32) = (0.5, 4.0);

/// Chapters whose title or text contains every word of `query`, title matches first.
fn search_results(query: &str) -> Vec<usize> {
    let words: Vec<String> = query.split_whitespace().map(str::to_lowercase).collect();
    if words.is_empty() {
        return Vec::new();
    }
    let mut results: Vec<(bool, usize)> = chapters()
        .iter()
        .enumerate()
        .filter_map(|(index, chapter)| {
            let title = chapter.title.to_lowercase();
            let body = format!(
                "{title} {} {} {}",
                chapter.description, chapter.tip, chapter.boundary
            )
            .to_lowercase();
            words
                .iter()
                .all(|word| body.contains(word.as_str()))
                .then(|| {
                    (
                        !words.iter().all(|word| title.contains(word.as_str())),
                        index,
                    )
                })
        })
        .collect();
    results.sort();
    results
        .into_iter()
        .map(|(_, index)| index)
        .take(CHAPTER_KEYS.len())
        .collect()
}

const CHAPTER_KEYS: [KeyCode; 9] = [
    KeyCode::Digit1,
    KeyCode::Digit2,
    KeyCode::Digit3,
    KeyCode::Digit4,
    KeyCode::Digit5,
    KeyCode::Digit6,
    KeyCode::Digit7,
    KeyCode::Digit8,
    KeyCode::Digit9,
];

fn index_pages() -> usize {
    chapters().len().div_ceil(CHAPTER_KEYS.len())
}

fn turn_page(page: usize, pages: usize, forward: bool) -> usize {
    (page + if forward { 1 } else { pages - 1 }) % pages
}

#[derive(Component, Clone, Copy)]
enum GuideAction {
    Close,
    Previous,
    Next,
    SwitchView,
    Index,
    Chapter(usize),
    Diagram,
    Search,
    ZoomIn,
    ZoomOut,
    Fit,
}

impl GuideAction {
    fn apply(self, screen: Screen, query: &str) -> Screen {
        match (self, screen) {
            (Self::Search, _) => Screen::Search,
            (Self::Index, Screen::Search) => Screen::Index(0),
            (Self::Chapter(row), Screen::Quick(_)) => {
                if row < TOPICS.len() {
                    Screen::Quick(row)
                } else {
                    screen
                }
            }
            (Self::Chapter(row), Screen::Search) => search_results(query)
                .get(row)
                .map_or(screen, |&chapter| Screen::Chapter(chapter)),
            (Self::SwitchView, Screen::Quick(_)) => Screen::Index(0),
            (Self::SwitchView, _) => Screen::Quick(0),
            (Self::Index, Screen::Chapter(chapter) | Screen::Diagram(chapter)) => {
                Screen::Index(chapter / CHAPTER_KEYS.len())
            }
            (Self::Diagram, Screen::Chapter(chapter)) => Screen::Diagram(chapter),
            (Self::Diagram, Screen::Diagram(chapter)) => Screen::Chapter(chapter),
            (Self::Chapter(row), Screen::Index(page)) => {
                let chapter = page * CHAPTER_KEYS.len() + row;
                if chapter < chapters().len() {
                    Screen::Chapter(chapter)
                } else {
                    screen
                }
            }
            (Self::Chapter(row), Screen::Chapter(current)) => {
                let chapter = (current / CHAPTER_KEYS.len()) * CHAPTER_KEYS.len() + row;
                if chapter < chapters().len() {
                    Screen::Chapter(chapter)
                } else {
                    screen
                }
            }
            (Self::Chapter(row), Screen::Diagram(current)) => {
                let chapter = (current / CHAPTER_KEYS.len()) * CHAPTER_KEYS.len() + row;
                if chapter < chapters().len() {
                    Screen::Diagram(chapter)
                } else {
                    screen
                }
            }
            (Self::Previous | Self::Next, _) => {
                let forward = matches!(self, Self::Next);
                match screen {
                    Screen::Quick(page) => Screen::Quick(turn_page(page, TOPICS.len(), forward)),
                    Screen::Index(page) => Screen::Index(turn_page(page, index_pages(), forward)),
                    Screen::Chapter(page) => {
                        Screen::Chapter(turn_page(page, chapters().len(), forward))
                    }
                    Screen::Diagram(page) => {
                        Screen::Diagram(turn_page(page, chapters().len(), forward))
                    }
                    Screen::Search => screen,
                }
            }
            _ => screen,
        }
    }

    fn label(self, screen: Screen, query: &str) -> Option<String> {
        Some(match (self, screen) {
            (Self::Close, _) => "×".into(),
            (Self::Previous | Self::Next, Screen::Search) => return None,
            (Self::ZoomIn, Screen::Diagram(_)) => "Zoom in".into(),
            (Self::ZoomOut, Screen::Diagram(_)) => "Zoom out".into(),
            (Self::Fit, Screen::Diagram(_)) => "Fit to window".into(),
            (Self::ZoomIn | Self::ZoomOut | Self::Fit, _) => return None,
            (Self::Search, Screen::Search) => format!("Search: {query}|"),
            (Self::Search, _) => "Find a topic".into(),
            (Self::Index, Screen::Search) => "Chapter index".into(),
            (Self::Chapter(row), Screen::Quick(_)) => TOPICS.get(row)?.0.into(),
            (Self::Chapter(row), Screen::Search) => {
                let &chapter = search_results(query).get(row)?;
                chapters()[chapter].title.clone()
            }
            (Self::Previous, _) => "Previous".into(),
            (Self::Next, _) => "Next".into(),
            (Self::SwitchView, Screen::Quick(_)) => "Reference".into(),
            (Self::SwitchView, _) => "Quick guide".into(),
            (Self::Index, Screen::Chapter(_) | Screen::Diagram(_)) => "Chapter index".into(),
            (Self::Diagram, Screen::Chapter(_)) => "Show diagram".into(),
            (Self::Diagram, Screen::Diagram(_)) => "Chapter text".into(),
            (Self::Chapter(row), Screen::Index(page)) => chapters()
                .get(page * CHAPTER_KEYS.len() + row)?
                .title
                .clone(),
            (Self::Chapter(row), Screen::Chapter(current) | Screen::Diagram(current)) => {
                let page = current / CHAPTER_KEYS.len();
                chapters()
                    .get(page * CHAPTER_KEYS.len() + row)?
                    .title
                    .clone()
            }
            _ => return None,
        })
    }

    fn active(self, screen: Screen) -> bool {
        match (self, screen) {
            (Self::Search, Screen::Search) => true,
            (Self::Chapter(row), Screen::Quick(page)) => row == page,
            (Self::Chapter(row), Screen::Chapter(current) | Screen::Diagram(current)) => {
                row == current % CHAPTER_KEYS.len()
            }
            _ => false,
        }
    }
}

#[derive(Component)]
struct GuideSheet;

#[derive(Component)]
struct GuideArticleScroll;

#[derive(Component)]
struct GuideDiagram;

#[derive(Component)]
struct GuideDiagramImage;

#[derive(Component)]
struct GuideDiagramBar;

#[derive(Component)]
struct GuideTipBlock;

#[derive(Component)]
struct GuideFactsBlock;

#[derive(Component)]
enum GuideText {
    NavHeading,
    Caption,
    Title,
    Body,
    Tip,
    Facts,
    Boundary,
    Footer,
    ZoomReadout,
}

pub(super) fn install(app: &mut App) {
    guide_diagrams::install(app);
    app.add_systems(Startup, spawn_guide)
        .add_systems(
            Update,
            select_navigation
                .after(read_camp_pointer)
                .before(village_input),
        )
        .add_systems(
            Update,
            (show_guide, show_diagram, scroll_article)
                .chain()
                .after(show_hud),
        );
}

fn spawn_action_button(
    parent: &mut ChildSpawnerCommands,
    assets: &AssetServer,
    action: GuideAction,
    font_size: f32,
    node: Node,
) {
    parent
        .spawn((action, Button, theme::button_node(node), theme::button()))
        .with_child((Text::default(), ui_font_weight(assets, font_size, 600)));
}

fn spawn_guide(mut commands: Commands, assets: Res<AssetServer>) {
    commands
        .spawn((
            GuideSheet,
            Interaction::None,
            bevy::ui::FocusPolicy::Block,
            GlobalZIndex(20),
            theme::panel_node(Node {
                display: Display::None,
                position_type: PositionType::Absolute,
                left: px(28),
                right: px(28),
                top: px(super::TOP_BAR_CLEARANCE),
                bottom: px(88),
                flex_direction: FlexDirection::Column,
                overflow: Overflow::clip(),
                ..default()
            }),
            theme::panel(),
        ))
        .with_children(|sheet| {
            // Header bar after V2's `.guide-heading`.
            sheet
                .spawn((
                    Node {
                        align_items: AlignItems::Center,
                        justify_content: JustifyContent::SpaceBetween,
                        column_gap: px(16),
                        padding: UiRect::axes(px(22), px(14)),
                        border: UiRect::bottom(px(1)),
                        flex_shrink: 0.,
                        ..default()
                    },
                    BorderColor::all(theme::EDGE),
                ))
                .with_children(|header| {
                    header
                        .spawn(Node {
                            flex_direction: FlexDirection::Column,
                            row_gap: px(2),
                            ..default()
                        })
                        .with_children(|left| {
                            left.spawn((
                                Text::new("LEARN THE VILLAGE"),
                                ui_font_styled(&assets, 11., 750, theme::CAPTION),
                            ));
                            left.spawn((
                                Text::new("Village guide"),
                                ui_font_weight(&assets, 26., 750),
                            ));
                        });
                    header
                        .spawn(Node {
                            align_items: AlignItems::Center,
                            column_gap: px(10),
                            ..default()
                        })
                        .with_children(|right| {
                            right.spawn((
                                Text::new("Paused while you read"),
                                ui_font_styled(&assets, 12., 500, theme::MUTED),
                            ));
                            spawn_action_button(
                                right,
                                &assets,
                                GuideAction::SwitchView,
                                14.,
                                Node {
                                    padding: UiRect::axes(px(14), px(6)),
                                    ..default()
                                },
                            );
                            spawn_action_button(
                                right,
                                &assets,
                                GuideAction::Close,
                                20.,
                                Node {
                                    width: px(36),
                                    height: px(36),
                                    justify_content: JustifyContent::Center,
                                    align_items: AlignItems::Center,
                                    ..default()
                                },
                            );
                        });
                });

            // Two-column body: topic sidebar on the left, article & diagram on the right.
            sheet
                .spawn(Node {
                    flex_grow: 1.,
                    min_height: px(0),
                    ..default()
                })
                .with_children(|layout| {
                    layout
                        .spawn((
                            Node {
                                width: px(268),
                                flex_shrink: 0.,
                                flex_direction: FlexDirection::Column,
                                row_gap: px(8),
                                padding: UiRect::axes(px(14), px(16)),
                                border: UiRect::right(px(1)),
                                overflow: Overflow::scroll_y(),
                                ..default()
                            },
                            BackgroundColor(theme::GUIDE_NAV),
                            BorderColor::all(theme::EDGE),
                        ))
                        .with_children(|nav| {
                            nav.spawn((
                                GuideText::NavHeading,
                                Text::default(),
                                ui_font_styled(&assets, 11., 750, theme::CAPTION),
                            ));
                            spawn_action_button(
                                nav,
                                &assets,
                                GuideAction::Search,
                                14.,
                                Node {
                                    width: percent(100),
                                    padding: UiRect::axes(px(12), px(7)),
                                    ..default()
                                },
                            );
                            spawn_action_button(
                                nav,
                                &assets,
                                GuideAction::Index,
                                13.,
                                Node {
                                    width: percent(100),
                                    padding: UiRect::axes(px(12), px(6)),
                                    ..default()
                                },
                            );
                            nav.spawn(Node {
                                column_gap: px(8),
                                ..default()
                            })
                            .with_children(|pager| {
                                for action in [GuideAction::Previous, GuideAction::Next] {
                                    spawn_action_button(
                                        pager,
                                        &assets,
                                        action,
                                        13.,
                                        Node {
                                            flex_grow: 1.,
                                            justify_content: JustifyContent::Center,
                                            padding: UiRect::axes(px(10), px(5)),
                                            ..default()
                                        },
                                    );
                                }
                            });
                            nav.spawn(Node {
                                flex_direction: FlexDirection::Column,
                                row_gap: px(5),
                                margin: UiRect::top(px(4)),
                                ..default()
                            })
                            .with_children(|topics| {
                                for row in 0..CHAPTER_KEYS.len() {
                                    spawn_action_button(
                                        topics,
                                        &assets,
                                        GuideAction::Chapter(row),
                                        14.,
                                        Node {
                                            width: percent(100),
                                            padding: UiRect::axes(px(12), px(8)),
                                            ..default()
                                        },
                                    );
                                }
                            });
                        });

                    layout
                        .spawn((
                            GuideArticleScroll,
                            Interaction::None,
                            ScrollPosition::default(),
                            Node {
                                flex_grow: 1.,
                                min_width: px(0),
                                min_height: px(0),
                                flex_direction: FlexDirection::Column,
                                row_gap: px(12),
                                padding: UiRect::axes(px(28), px(22)),
                                overflow: Overflow::scroll_y(),
                                ..default()
                            },
                        ))
                        .with_children(|article| {
                            article
                                .spawn(Node {
                                    flex_direction: FlexDirection::Column,
                                    row_gap: px(2),
                                    flex_shrink: 0.,
                                    ..default()
                                })
                                .with_children(|heading| {
                                    heading.spawn((
                                        GuideText::Caption,
                                        Text::default(),
                                        ui_font_styled(&assets, 11., 750, theme::CAPTION),
                                    ));
                                    heading.spawn((
                                        GuideText::Title,
                                        Text::default(),
                                        ui_font_weight(&assets, 24., 750),
                                    ));
                                });

                            article
                                .spawn((
                                    GuideDiagramBar,
                                    Node {
                                        display: Display::None,
                                        align_items: AlignItems::Center,
                                        column_gap: px(8),
                                        flex_wrap: FlexWrap::Wrap,
                                        flex_shrink: 0.,
                                        ..default()
                                    },
                                ))
                                .with_children(|bar| {
                                    for action in [
                                        GuideAction::Diagram,
                                        GuideAction::Fit,
                                        GuideAction::ZoomIn,
                                        GuideAction::ZoomOut,
                                    ] {
                                        spawn_action_button(
                                            bar,
                                            &assets,
                                            action,
                                            13.,
                                            Node {
                                                padding: UiRect::axes(px(12), px(5)),
                                                ..default()
                                            },
                                        );
                                    }
                                    bar.spawn((
                                        GuideText::ZoomReadout,
                                        Text::default(),
                                        ui_font_styled(&assets, 12., 600, theme::MUTED),
                                    ));
                                });

                            article
                                .spawn((
                                    GuideDiagram,
                                    Interaction::None,
                                    ScrollPosition::default(),
                                    Node {
                                        display: Display::None,
                                        flex_shrink: 0.,
                                        padding: UiRect::all(px(16)),
                                        border: UiRect::all(px(1)),
                                        border_radius: BorderRadius::all(px(14)),
                                        overflow: Overflow::scroll(),
                                        ..default()
                                    },
                                    BackgroundColor(theme::CARD),
                                    BorderColor::all(theme::SUBTLE_BORDER),
                                ))
                                .with_child((
                                    GuideDiagramImage,
                                    ImageNode::default(),
                                    Node {
                                        flex_shrink: 0.,
                                        ..default()
                                    },
                                ));

                            article.spawn((
                                GuideText::Body,
                                Text::default(),
                                ui_font(&assets, 15.),
                                Node {
                                    flex_shrink: 0.,
                                    ..default()
                                },
                            ));

                            article
                                .spawn((
                                    GuideTipBlock,
                                    Node {
                                        display: Display::None,
                                        flex_direction: FlexDirection::Column,
                                        row_gap: px(4),
                                        flex_shrink: 0.,
                                        padding: UiRect::axes(px(16), px(12)),
                                        border: UiRect::left(px(4)),
                                        border_radius: BorderRadius::all(px(8)),
                                        ..default()
                                    },
                                    BackgroundColor(theme::INSET),
                                    BorderColor::all(theme::LEAF),
                                ))
                                .with_children(|tip| {
                                    tip.spawn((
                                        Text::new("MORE AUTONOMY"),
                                        ui_font_styled(&assets, 11., 750, theme::CAPTION),
                                    ));
                                    tip.spawn((
                                        GuideText::Tip,
                                        Text::default(),
                                        ui_font(&assets, 14.),
                                    ));
                                });

                            article
                                .spawn((
                                    GuideFactsBlock,
                                    Node {
                                        display: Display::None,
                                        flex_direction: FlexDirection::Column,
                                        row_gap: px(4),
                                        flex_shrink: 0.,
                                        padding: UiRect::axes(px(14), px(10)),
                                        border: UiRect::all(px(1)),
                                        border_radius: BorderRadius::all(px(10)),
                                        ..default()
                                    },
                                    BackgroundColor(theme::CARD),
                                    BorderColor::all(theme::SUBTLE_BORDER),
                                ))
                                .with_children(|facts| {
                                    facts.spawn((
                                        Text::new("REFERENCE FIGURES"),
                                        ui_font_styled(&assets, 10., 750, theme::CAPTION),
                                    ));
                                    facts.spawn((
                                        GuideText::Facts,
                                        Text::default(),
                                        ui_font_weight(&assets, 13., 500),
                                    ));
                                });

                            article.spawn((
                                GuideText::Boundary,
                                Text::default(),
                                ui_font_styled(&assets, 13., 400, theme::MUTED),
                                Node {
                                    flex_shrink: 0.,
                                    ..default()
                                },
                            ));

                            article.spawn((
                                GuideText::Footer,
                                Text::default(),
                                ui_font_styled(&assets, 12., 500, theme::MUTED),
                                Node {
                                    flex_shrink: 0.,
                                    margin: UiRect::top(px(6)),
                                    ..default()
                                },
                            ));
                        });
                });
        });
}

/// Pixels the diagram pans per second while an arrow key is held.
const PAN_SPEED: f32 = 900.0;

type DiagramFrame<'w, 's> = Single<
    'w,
    's,
    (&'static mut Node, &'static mut ScrollPosition),
    (With<GuideDiagram>, Without<GuideDiagramImage>),
>;

fn show_diagram(
    (setup, saves, sound): (Res<WorldSetup>, Res<SaveMenu>, Res<SoundSettings>),
    village: Res<Village>,
    window: Single<&Window, With<PrimaryWindow>>,
    (assets, images): (Res<AssetServer>, Res<Assets<Image>>),
    (keys, wheel, time): (
        Res<ButtonInput<KeyCode>>,
        Res<bevy::input::mouse::AccumulatedMouseScroll>,
        Res<Time<Real>>,
    ),
    mut frame: DiagramFrame,
    mut diagram: Single<(&mut ImageNode, &mut Node), With<GuideDiagramImage>>,
) {
    let (frame, scroll) = &mut *frame;
    let (image, node) = &mut *diagram;
    let Some(Screen::Diagram(index)) = active_screen(&village, &setup, &saves, &sound) else {
        frame.display = Display::None;
        scroll.0 = Vec2::ZERO;
        return;
    };
    let Some(handle) = guide_diagrams::load(&assets, &chapters()[index].title) else {
        frame.display = Display::None;
        return;
    };
    if image.image != handle {
        image.image = handle;
        scroll.0 = Vec2::ZERO;
    }
    let Some(texture) = images.get(&image.image) else {
        frame.display = Display::None;
        return;
    };
    let size = texture.size().as_vec2();
    let available =
        Vec2::new(window.width() - 420.0, window.height() - 360.0).max(Vec2::splat(160.));
    let fit = (available / size).min_element().clamp(0.0, 1.0);
    let shown = size * fit * village.guide.diagram_zoom();
    node.width = px(shown.x);
    node.height = px(shown.y);
    let visible = shown.min(available);
    frame.width = px(visible.x + 32.0);
    frame.height = px(visible.y + 32.0);
    frame.display = Display::Flex;
    let mut pan = Vec2::ZERO;
    for (key, direction) in [
        (KeyCode::ArrowLeft, Vec2::NEG_X),
        (KeyCode::ArrowRight, Vec2::X),
        (KeyCode::ArrowUp, Vec2::NEG_Y),
        (KeyCode::ArrowDown, Vec2::Y),
    ] {
        if keys.pressed(key) {
            pan += direction * PAN_SPEED * time.delta_secs();
        }
    }
    let step = match wheel.unit {
        bevy::input::mouse::MouseScrollUnit::Line => 34.,
        bevy::input::mouse::MouseScrollUnit::Pixel => 1.,
    };
    pan -= wheel.delta * step;
    scroll.0 = (scroll.0 + pan).clamp(Vec2::ZERO, (shown - visible).max(Vec2::ZERO));
}

fn scroll_article(
    (setup, saves, sound): (Res<WorldSetup>, Res<SaveMenu>, Res<SoundSettings>),
    village: Res<Village>,
    mut article: Single<(&Interaction, &mut ScrollPosition), With<GuideArticleScroll>>,
    scroll: Res<bevy::input::mouse::AccumulatedMouseScroll>,
    mut previous: Local<Option<Screen>>,
) {
    let screen = active_screen(&village, &setup, &saves, &sound);
    if *previous != screen {
        article.1.y = 0.;
        *previous = screen;
    }
    if screen.is_none() || matches!(screen, Some(Screen::Diagram(_))) {
        return;
    }
    if *article.0 != Interaction::None && scroll.delta.y != 0. {
        let step = match scroll.unit {
            bevy::input::mouse::MouseScrollUnit::Line => 34.,
            bevy::input::mouse::MouseScrollUnit::Pixel => 1.,
        };
        article.1.y = (article.1.y - scroll.delta.y * step).max(0.);
    }
}

fn active_screen(
    village: &Village,
    setup: &WorldSetup,
    saves: &SaveMenu,
    sound: &SoundSettings,
) -> Option<Screen> {
    if setup.open || saves.open || sound.open {
        return None;
    }
    village.guide.screen
}

fn select_navigation(
    (setup, saves, sound): (Res<WorldSetup>, Res<SaveMenu>, Res<SoundSettings>),
    mut village: ResMut<Village>,
    buttons: Query<(&GuideAction, &Interaction), Changed<Interaction>>,
) {
    if let Some(screen) = active_screen(&village, &setup, &saves, &sound)
        && let Some((action, _)) = buttons.iter().find(|(action, interaction)| {
            **interaction == Interaction::Pressed
                && action.label(screen, &village.guide.query).is_some()
        })
    {
        if matches!(action, GuideAction::Close) {
            village.guide.toggle();
        } else {
            village.guide.act(*action, screen);
        }
    }
}

type GuideContainers<'w, 's> = (
    Single<
        'w,
        's,
        &'static mut Node,
        (
            With<GuideSheet>,
            Without<GuideAction>,
            Without<GuideDiagramBar>,
            Without<GuideTipBlock>,
            Without<GuideFactsBlock>,
            Without<VillageHud>,
        ),
    >,
    Single<
        'w,
        's,
        &'static mut Node,
        (
            With<GuideDiagramBar>,
            Without<GuideSheet>,
            Without<GuideAction>,
            Without<GuideTipBlock>,
            Without<GuideFactsBlock>,
            Without<VillageHud>,
        ),
    >,
    Single<
        'w,
        's,
        &'static mut Node,
        (
            With<GuideTipBlock>,
            Without<GuideSheet>,
            Without<GuideAction>,
            Without<GuideDiagramBar>,
            Without<GuideFactsBlock>,
            Without<VillageHud>,
        ),
    >,
    Single<
        'w,
        's,
        &'static mut Node,
        (
            With<GuideFactsBlock>,
            Without<GuideSheet>,
            Without<GuideAction>,
            Without<GuideDiagramBar>,
            Without<GuideTipBlock>,
            Without<VillageHud>,
        ),
    >,
    Single<
        'w,
        's,
        &'static mut Node,
        (
            With<VillageHud>,
            Without<GuideSheet>,
            Without<GuideAction>,
            Without<GuideDiagramBar>,
            Without<GuideTipBlock>,
            Without<GuideFactsBlock>,
        ),
    >,
);

type GuideButtons<'w, 's> = Query<
    'w,
    's,
    (
        &'static GuideAction,
        &'static Children,
        &'static Interaction,
        &'static mut Node,
        &'static mut BackgroundColor,
        &'static mut BorderColor,
        &'static mut BoxShadow,
    ),
    (
        Without<GuideSheet>,
        Without<GuideDiagramBar>,
        Without<GuideTipBlock>,
        Without<GuideFactsBlock>,
        Without<VillageHud>,
    ),
>;

fn show_guide(
    (setup, saves, sound): (Res<WorldSetup>, Res<SaveMenu>, Res<SoundSettings>),
    (village, catalog): (Res<Village>, Res<Catalog>),
    (mut sheet, mut diagram_bar, mut tip_block, mut facts_block, mut hud): GuideContainers,
    mut buttons: GuideButtons,
    mut button_labels: Query<&mut Text, Without<GuideText>>,
    mut content: Query<(&GuideText, &mut Text)>,
) {
    let Some(screen) = active_screen(&village, &setup, &saves, &sound) else {
        if sheet.display != Display::None {
            sheet.display = Display::None;
        }
        return;
    };
    // The guide renders its own V2-style sheet instead of sharing the status card.
    hud.display = Display::None;
    sheet.display = Display::Flex;

    for (action, children, interaction, mut node, mut background, mut border, mut shadow) in
        &mut buttons
    {
        let Some(label) = action.label(screen, &village.guide.query) else {
            node.display = Display::None;
            continue;
        };
        node.display = Display::Flex;
        theme::paint_button(
            *interaction,
            true,
            action.active(screen),
            &mut background,
            &mut border,
            &mut shadow,
        );
        if let Ok(mut text) = button_labels.get_mut(children[0])
            && text.0 != label
        {
            text.0 = label;
        }
    }

    let (nav_heading, caption, title, body, tip, facts, boundary, footer, zoom_readout) =
        match screen {
            Screen::Quick(page) => {
                let (topic, text) = TOPICS[page];
                (
                    "QUICK TOPICS".to_owned(),
                    format!("QUICK GUIDE · {} OF {}", page + 1, TOPICS.len()),
                    format!("Village guide · {topic}"),
                    text.to_owned(),
                    String::new(),
                    String::new(),
                    String::new(),
                    "1–7 Topic · Page Up/Down · Tab Reference · / Search · F1 Close".to_owned(),
                    String::new(),
                )
            }
            Screen::Index(page) => (
                format!("SYSTEMS · PAGE {}/{}", page + 1, index_pages()),
                format!("VILLAGE REFERENCE · PAGE {}/{}", page + 1, index_pages()),
                "Choose a system".to_owned(),
                "Select a chapter on the left to read how it works, see its flow diagram, and check reference figures. Press / to search by keyword.".to_owned(),
                String::new(),
                String::new(),
                String::new(),
                "1–9 Open chapter · / Find · Page Up/Down · Tab Quick guide · F1 Close".to_owned(),
                String::new(),
            ),
            Screen::Chapter(index) => {
                let chapter = &chapters()[index];
                let page = index / CHAPTER_KEYS.len();
                let facts_text = chapter
                    .facts
                    .as_ref()
                    .map(|facts| facts.text(&catalog).join("\n"))
                    .unwrap_or_default();
                (
                    format!("SYSTEMS · PAGE {}/{}", page + 1, index_pages()),
                    format!("CHAPTER {} OF {}", index + 1, chapters().len()),
                    chapter.title.clone(),
                    chapter.description.clone(),
                    chapter.tip.clone(),
                    facts_text,
                    chapter.boundary.clone(),
                    "Page Up/Down · D Diagram · Backspace Index · / Search · F1 Close".to_owned(),
                    String::new(),
                )
            }
            Screen::Diagram(index) => {
                let chapter = &chapters()[index];
                let page = index / CHAPTER_KEYS.len();
                let zoom_pct = (village.guide.diagram_zoom() * 100.0).round() as i32;
                (
                    format!("SYSTEMS · PAGE {}/{}", page + 1, index_pages()),
                    format!("FLOW DIAGRAM · CHAPTER {} OF {}", index + 1, chapters().len()),
                    chapter.title.clone(),
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    "Arrows or wheel Pan · + / − Zoom · 0 Fit · D Chapter text · Backspace Index · F1 Close".to_owned(),
                    format!("{zoom_pct}%"),
                )
            }
            Screen::Search => {
                let results = search_results(&village.guide.query);
                let body = if village.guide.query.trim().is_empty() {
                    "Type a word such as water, compost, crops, tools or grid to filter chapters."
                        .to_owned()
                } else if results.is_empty() {
                    "No chapter mentions that yet. Try another word or return to the chapter index."
                        .to_owned()
                } else {
                    format!(
                        "{} matching chapters — pick one on the left or press 1–{}.",
                        results.len(),
                        results.len()
                    )
                };
                (
                    "MATCHING CHAPTERS".to_owned(),
                    "SEARCH THE GUIDE".to_owned(),
                    format!("Find a topic · {}|", village.guide.query),
                    body,
                    String::new(),
                    String::new(),
                    String::new(),
                    "Type to search · 1–9 or Enter Open · Tab Index · Esc Close".to_owned(),
                    String::new(),
                )
            }
        };

    diagram_bar.display = if matches!(screen, Screen::Chapter(_) | Screen::Diagram(_)) {
        Display::Flex
    } else {
        Display::None
    };
    tip_block.display = if tip.is_empty() {
        Display::None
    } else {
        Display::Flex
    };
    facts_block.display = if facts.is_empty() {
        Display::None
    } else {
        Display::Flex
    };

    for (part, mut text) in &mut content {
        let wanted = match part {
            GuideText::NavHeading => &nav_heading,
            GuideText::Caption => &caption,
            GuideText::Title => &title,
            GuideText::Body => &body,
            GuideText::Tip => &tip,
            GuideText::Facts => &facts,
            GuideText::Boundary => &boundary,
            GuideText::Footer => &footer,
            GuideText::ZoomReadout => &zoom_readout,
        };
        if text.0 != *wanted {
            text.0.clone_from(wanted);
        }
    }
}

impl Guide {
    pub(super) fn open(&self) -> bool {
        self.screen.is_some()
    }

    pub(super) fn open_camera_controls(&mut self) {
        self.screen = Some(Screen::Quick(1));
    }

    pub(super) fn toggle(&mut self) {
        self.screen = if self.open() {
            None
        } else {
            Some(Screen::Quick(0))
        };
    }

    fn act(&mut self, action: GuideAction, screen: Screen) {
        let zoom = self.zoom.unwrap_or(1.0);
        match action {
            GuideAction::Close => self.screen = None,
            GuideAction::ZoomIn => {
                self.zoom = Some((zoom + ZOOM_STEP).min(ZOOM_RANGE.1));
            }
            GuideAction::ZoomOut => {
                self.zoom = Some((zoom - ZOOM_STEP).max(ZOOM_RANGE.0));
            }
            GuideAction::Fit => self.zoom = None,
            _ => {
                let next = action.apply(screen, &self.query);
                self.enter(next);
            }
        }
    }

    /// Magnification for the open diagram, where 1.0 fits the window.
    fn diagram_zoom(&self) -> f32 {
        self.zoom.unwrap_or(1.0)
    }

    fn enter(&mut self, screen: Screen) {
        if !matches!(
            (self.screen, screen),
            (Some(Screen::Diagram(before)), Screen::Diagram(after)) if before == after
        ) {
            self.zoom = None;
        }
        if matches!(screen, Screen::Search) && !matches!(self.screen, Some(Screen::Search)) {
            self.query.clear();
        }
        self.screen = Some(screen);
    }

    /// Consume the whole frame when opening, reading or closing the guide.
    pub(super) fn controls(
        &mut self,
        keys: &ButtonInput<KeyCode>,
        text: &mut MessageReader<bevy::input::keyboard::KeyboardInput>,
    ) -> bool {
        if keys.just_pressed(KeyCode::F1) {
            self.toggle();
            text.clear();
            return true;
        }
        let Some(screen) = self.screen else {
            return false;
        };
        if matches!(screen, Screen::Search) {
            self.search_controls(keys, text);
            return true;
        }
        text.clear();
        let action = if keys.any_just_pressed([KeyCode::Equal, KeyCode::NumpadAdd]) {
            Some(GuideAction::ZoomIn)
        } else if keys.any_just_pressed([KeyCode::Minus, KeyCode::NumpadSubtract]) {
            Some(GuideAction::ZoomOut)
        } else if keys.any_just_pressed([KeyCode::Digit0, KeyCode::Numpad0]) {
            Some(GuideAction::Fit)
        } else if keys.just_pressed(KeyCode::Slash) {
            Some(GuideAction::Search)
        } else if keys.just_pressed(KeyCode::Tab) {
            Some(GuideAction::SwitchView)
        } else if keys.just_pressed(KeyCode::Backspace) {
            Some(GuideAction::Index)
        } else if keys.just_pressed(KeyCode::KeyD) {
            Some(GuideAction::Diagram)
        } else if keys.just_pressed(KeyCode::PageDown) {
            Some(GuideAction::Next)
        } else if keys.just_pressed(KeyCode::PageUp) {
            Some(GuideAction::Previous)
        } else {
            CHAPTER_KEYS
                .iter()
                .position(|key| keys.just_pressed(*key))
                .map(GuideAction::Chapter)
        };
        if let Some(action) = action.filter(|action| action.label(screen, &self.query).is_some()) {
            self.act(action, screen);
        }
        true
    }

    fn search_controls(
        &mut self,
        keys: &ButtonInput<KeyCode>,
        text: &mut MessageReader<bevy::input::keyboard::KeyboardInput>,
    ) {
        let row = if keys.any_just_pressed([KeyCode::Enter, KeyCode::NumpadEnter]) {
            Some(0)
        } else {
            CHAPTER_KEYS.iter().position(|key| keys.just_pressed(*key))
        };
        if let Some(row) = row {
            text.clear();
            self.enter(GuideAction::Chapter(row).apply(Screen::Search, &self.query));
            return;
        }
        if keys.just_pressed(KeyCode::Tab)
            || keys.just_pressed(KeyCode::Backspace) && self.query.is_empty()
        {
            text.clear();
            self.screen = Some(Screen::Index(0));
            return;
        }
        crate::construction::read_search_text(&mut self.query, text);
        self.query.retain(|character| !character.is_ascii_digit());
    }

    pub(super) fn text(&self, catalog: &Catalog) -> Option<String> {
        use std::fmt::Write;
        Some(match self.screen? {
            Screen::Quick(page) => {
                let (title, body) = TOPICS[page];
                format!(
                    "Village guide · {title} · {}/{}\nPage Up/Down · Tab Reference · F1 Close\n\n{body}",
                    page + 1,
                    TOPICS.len()
                )
            }
            Screen::Index(page) => {
                let mut label = format!(
                    "Village reference · {}/{}\n1–9 Open chapter · / Find · Page Up/Down · Tab Quick guide · F1 Close\n",
                    page + 1,
                    index_pages()
                );
                for (row, chapter) in chapters()
                    .iter()
                    .skip(page * CHAPTER_KEYS.len())
                    .take(CHAPTER_KEYS.len())
                    .enumerate()
                {
                    let _ = write!(label, "\n{} {}", row + 1, chapter.title);
                }
                label
            }
            Screen::Chapter(index) => {
                let chapter = &chapters()[index];
                let mut label = format!(
                    "{} · {}/{}\nPage Up/Down · D Diagram · Backspace Index · F1 Close",
                    chapter.title,
                    index + 1,
                    chapters().len()
                );
                for paragraph in [&chapter.description, &chapter.tip, &chapter.boundary] {
                    if !paragraph.is_empty() {
                        let _ = write!(label, "\n\n{paragraph}");
                    }
                }
                if let Some(facts) = &chapter.facts {
                    let _ = write!(label, "\n\n{}", facts.text(catalog).join("\n"));
                }
                label
            }
            Screen::Search => {
                let results = search_results(&self.query);
                let mut label = format!(
                    "Find a topic · {}|\nType to search · 1–9 or Enter Open · Tab Index · Esc Close\n",
                    self.query
                );
                if self.query.trim().is_empty() {
                    label.push_str("\nType a word such as water, compost or grid.");
                } else if results.is_empty() {
                    label.push_str("\nNo chapter mentions that yet.");
                }
                for (row, chapter) in results.iter().enumerate() {
                    let _ = write!(label, "\n{} {}", row + 1, chapters()[*chapter].title);
                }
                label
            }
            Screen::Diagram(index) => format!(
                "{} · {}/{}\nPage Up/Down · + / − Zoom · 0 Fit · Arrows or wheel Pan · D Chapter text · Backspace Index · F1 Close",
                chapters()[index].title,
                index + 1,
                chapters().len()
            ),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bevy::input::{
        ButtonState,
        keyboard::{Key, KeyboardInput},
    };

    /// Runs one frame of guide controls with `typed` delivered as keyboard text.
    fn guide_controls(guide: &mut Guide, keys: &ButtonInput<KeyCode>, typed: &[&str]) -> bool {
        let mut world = World::new();
        world.init_resource::<Messages<KeyboardInput>>();
        for text in typed {
            world.write_message(KeyboardInput {
                key_code: KeyCode::KeyA,
                logical_key: Key::Character((*text).into()),
                state: ButtonState::Pressed,
                text: Some((*text).into()),
                repeat: false,
                window: Entity::PLACEHOLDER,
            });
        }
        let mut state =
            bevy::ecs::system::SystemState::<MessageReader<KeyboardInput>>::new(&mut world);
        let mut reader = state.get_mut(&mut world);
        guide.controls(keys, &mut reader)
    }

    #[test]
    fn diagrams_zoom_in_steps_and_reset_on_another_chapter() {
        let mut guide = Guide::default();
        let mut keys = ButtonInput::default();
        let mut press = |guide: &mut Guide, key| {
            keys.press(key);
            guide_controls(guide, &keys, &[]);
            keys.reset_all();
        };
        for key in [KeyCode::F1, KeyCode::Tab, KeyCode::Digit1, KeyCode::KeyD] {
            press(&mut guide, key);
        }
        assert!(matches!(guide.screen, Some(Screen::Diagram(0))));
        press(&mut guide, KeyCode::Equal);
        press(&mut guide, KeyCode::Equal);
        assert_eq!(guide.diagram_zoom(), 1.5);
        press(&mut guide, KeyCode::Digit0);
        assert_eq!(guide.diagram_zoom(), 1.0);
        for _ in 0..8 {
            press(&mut guide, KeyCode::Minus);
        }
        assert_eq!(guide.diagram_zoom(), ZOOM_RANGE.0);
        press(&mut guide, KeyCode::PageDown);
        assert!(matches!(guide.screen, Some(Screen::Diagram(1))));
        assert_eq!(guide.diagram_zoom(), 1.0);
    }

    #[test]
    fn slash_finds_a_chapter_by_what_it_explains() {
        let mut guide = Guide::default();
        let mut keys = ButtonInput::default();
        keys.press(KeyCode::F1);
        guide_controls(&mut guide, &keys, &[]);
        keys.reset_all();
        keys.press(KeyCode::Slash);
        guide_controls(&mut guide, &keys, &["/"]);
        keys.reset_all();
        assert!(matches!(guide.screen, Some(Screen::Search)));
        assert_eq!(guide.query, "");
        guide_controls(&mut guide, &keys, &["s", "a", "n", "i", "t"]);
        let results = search_results(&guide.query);
        assert!(!results.is_empty());
        assert!(chapters()[results[0]].title.starts_with("Sanitation"));
        keys.press(KeyCode::Enter);
        guide_controls(&mut guide, &keys, &[]);
        assert!(matches!(guide.screen, Some(Screen::Chapter(chapter)) if chapter == results[0]));
    }

    #[test]
    fn native_reference_can_open_the_last_chapter_and_return_to_its_index() {
        let mut guide = Guide::default();
        let mut keys = ButtonInput::default();
        for key in [KeyCode::F1, KeyCode::Tab, KeyCode::PageUp, KeyCode::Digit9] {
            keys.press(key);
            assert!(guide_controls(&mut guide, &keys, &[]));
            keys.reset_all();
        }
        assert!(
            guide
                .text(&Catalog::default())
                .unwrap()
                .starts_with("Inspecting village conditions")
        );
        keys.press(KeyCode::Backspace);
        assert!(guide_controls(&mut guide, &keys, &[]));
        assert!(
            guide
                .text(&Catalog::default())
                .unwrap()
                .starts_with("Village reference · 3/3")
        );
    }
}
