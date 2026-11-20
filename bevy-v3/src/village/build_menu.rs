//! The build catalog, after V2's "Let's build" sheet: a header with search and supply
//! toggles, a category sidebar, a grid of picture cards, and a details column for the
//! hovered card.

use super::*;
use crate::{
    construction::{BUILD_ROWS, Construction},
    theme,
    ui_font::{ui_font_styled, ui_font_weight},
};

#[derive(Component)]
struct BuildPanel;

/// "Camp essentials · 4 buildings", or the search heading while searching.
#[derive(Component)]
struct ResultCaption;

#[derive(Component)]
struct PageCaption;

#[derive(Component)]
struct BlueprintDetails;

#[derive(Component)]
struct CardName(usize);

#[derive(Component)]
struct CardDetail(usize);

#[derive(Component, Clone, Copy, PartialEq)]
enum BuildButton {
    Blueprint(usize),
    Category(usize),
    PreviousPage,
    NextPage,
    Search,
    ConstructionPolicy,
    SupplierConstruction,
    Close,
}

const SEARCH_PLACEHOLDER: &str = "Find something to build…";
const DETAILS_HINT: &str = "Point at a building to see what it needs.";

pub(super) fn visible(
    setup: &WorldSetup,
    village: &Village,
    saves: &SaveMenu,
    sound: &SoundSettings,
) -> bool {
    !setup.open
        && !saves.open
        && !sound.open
        && !village.guide.open()
        && !village.lenses.open
        && !village.editing_inventory
        && !village.terrain_editor.open
        && !village.advance_open()
        && !village.trade_open()
        && village.construction.browsing_blueprints()
}

pub(super) fn install(app: &mut App) {
    app.add_systems(Startup, spawn)
        .add_systems(
            Update,
            select.after(read_camp_pointer).before(village_input),
        )
        .add_systems(Update, refresh.after(village_input));
}

fn spawn(mut commands: Commands, assets: Res<AssetServer>) {
    commands
        .spawn((
            BuildPanel,
            Interaction::None,
            bevy::ui::FocusPolicy::Block,
            theme::panel_node(Node {
                display: Display::None,
                position_type: PositionType::Absolute,
                left: px(22),
                right: px(22),
                bottom: px(150),
                padding: UiRect::all(px(18)),
                flex_direction: FlexDirection::Column,
                row_gap: px(14),
                overflow: Overflow::scroll_y(),
                ..default()
            }),
            ScrollPosition::default(),
            theme::panel(),
        ))
        .with_children(|panel| {
            panel
                .spawn(Node {
                    column_gap: px(10),
                    align_items: AlignItems::Center,
                    flex_shrink: 0.,
                    ..default()
                })
                .with_children(|header| {
                    header.spawn((
                        Text::new("Let's build"),
                        ui_font_weight(&assets, 22.0, 750),
                        Node {
                            margin: UiRect::right(px(8)),
                            ..default()
                        },
                    ));
                    // A search field drawn as part of the sheet, not a browser input.
                    header
                        .spawn((
                            BuildButton::Search,
                            Button,
                            Node {
                                flex_grow: 1.,
                                padding: UiRect::axes(px(14), px(8)),
                                border: UiRect::all(px(2)),
                                border_radius: BorderRadius::all(px(12)),
                                column_gap: px(8),
                                align_items: AlignItems::Center,
                                justify_content: JustifyContent::SpaceBetween,
                                ..default()
                            },
                            BackgroundColor(theme::BUTTON_HOVER),
                            BorderColor::all(theme::EDGE),
                            BoxShadow::default(),
                        ))
                        .with_children(|field| {
                            field.spawn((
                                Text::new(SEARCH_PLACEHOLDER),
                                ui_font_styled(&assets, 15.0, 500, theme::MUTED),
                            ));
                            chip(field, &assets, "/");
                        });
                    for action in [
                        BuildButton::ConstructionPolicy,
                        BuildButton::SupplierConstruction,
                        BuildButton::Close,
                    ] {
                        button(header, &assets, action, "");
                    }
                });
            panel
                .spawn(Node {
                    column_gap: px(18),
                    align_items: AlignItems::FlexStart,
                    ..default()
                })
                .with_children(|body| {
                    body.spawn(Node {
                        flex_direction: FlexDirection::Column,
                        row_gap: px(4),
                        width: px(168),
                        flex_shrink: 0.,
                        ..default()
                    })
                    .with_children(|sidebar| {
                        for (index, name) in Construction::build_categories().iter().enumerate() {
                            sidebar
                                .spawn((
                                    BuildButton::Category(index),
                                    Button,
                                    Node {
                                        padding: UiRect::axes(px(12), px(6)),
                                        border: UiRect::all(px(2)),
                                        border_radius: BorderRadius::all(px(12)),
                                        ..default()
                                    },
                                    BackgroundColor(Color::NONE),
                                    BorderColor::all(Color::NONE),
                                    BoxShadow::default(),
                                ))
                                .with_child((Text::new(*name), ui_font_weight(&assets, 14.0, 600)));
                        }
                    });
                    body.spawn(Node {
                        flex_direction: FlexDirection::Column,
                        row_gap: px(10),
                        flex_grow: 1.,
                        align_items: AlignItems::Stretch,
                        ..default()
                    })
                    .with_children(|main| {
                        main.spawn((
                            ResultCaption,
                            Text::default(),
                            ui_font_styled(&assets, 13.0, 500, theme::MUTED),
                            TextLayout::new_with_justify(Justify::Center),
                        ));
                        main.spawn(Node {
                            flex_wrap: FlexWrap::Wrap,
                            column_gap: px(12),
                            row_gap: px(12),
                            ..default()
                        })
                        .with_children(|grid| {
                            for index in 0..BUILD_ROWS {
                                blueprint_card(grid, &assets, index);
                            }
                        });
                        main.spawn(Node {
                            column_gap: px(8),
                            align_items: AlignItems::Center,
                            justify_content: JustifyContent::Center,
                            ..default()
                        })
                        .with_children(|pager| {
                            button(pager, &assets, BuildButton::PreviousPage, "← Previous");
                            pager.spawn((
                                PageCaption,
                                Text::default(),
                                ui_font_styled(&assets, 13.0, 600, theme::MUTED),
                            ));
                            button(pager, &assets, BuildButton::NextPage, "Next →");
                        });
                        // Details sit under the cards, so the cards get the full row as
                        // in V2.
                        main.spawn((
                            BlueprintDetails,
                            Text::new(DETAILS_HINT),
                            ui_font(&assets, 14.0),
                            Node {
                                padding: UiRect::all(px(12)),
                                border_radius: BorderRadius::all(px(14)),
                                ..default()
                            },
                            BackgroundColor(theme::BUTTON),
                        ));
                    });
                });
        });
}

fn chip(parent: &mut ChildSpawnerCommands, assets: &AssetServer, key: &str) {
    parent
        .spawn((
            Node {
                padding: UiRect::axes(px(6), px(1)),
                border: UiRect::all(px(1)),
                border_radius: BorderRadius::all(px(5)),
                ..default()
            },
            BackgroundColor(theme::KEY),
            BorderColor::all(theme::EDGE),
        ))
        .with_child((Text::new(key), ui_font_weight(assets, 11.0, 600)));
}

fn button(
    parent: &mut ChildSpawnerCommands,
    assets: &AssetServer,
    action: BuildButton,
    label: &str,
) {
    parent
        .spawn((
            action,
            Button,
            theme::button_node(Node {
                padding: UiRect::axes(px(12), px(7)),
                flex_shrink: 0.,
                ..default()
            }),
            theme::button(),
        ))
        .with_child((Text::new(label), ui_font_weight(assets, 14.0, 600)));
}

/// A picture card: thumbnail, name and a one-line cost, with its number key in a chip.
fn blueprint_card(parent: &mut ChildSpawnerCommands, assets: &AssetServer, index: usize) {
    parent
        .spawn((
            BuildButton::Blueprint(index),
            Button,
            theme::button_node(Node {
                width: px(168),
                padding: UiRect::new(px(10), px(10), px(10), px(12)),
                flex_direction: FlexDirection::Column,
                align_items: AlignItems::Center,
                row_gap: px(4),
                ..default()
            }),
            theme::button(),
        ))
        .with_children(|card| {
            card.spawn(Node {
                position_type: PositionType::Absolute,
                top: px(8),
                left: px(8),
                ..default()
            })
            .with_children(|corner| chip(corner, assets, &(index + 1).to_string()));
            card.spawn((
                super::thumbnails::ThumbnailImage(index),
                ImageNode::default(),
                Node {
                    width: px(96),
                    height: px(72),
                    ..default()
                },
            ));
            card.spawn((
                CardName(index),
                Text::default(),
                ui_font_weight(assets, 14.0, 700),
                TextLayout::new_with_justify(Justify::Center),
            ));
            card.spawn((
                CardDetail(index),
                Text::default(),
                ui_font_styled(assets, 12.0, 500, theme::MUTED),
                TextLayout::new_with_justify(Justify::Center),
            ));
        });
}

fn select(
    (setup, catalog, saves, sound): (
        Res<WorldSetup>,
        Res<Catalog>,
        Res<SaveMenu>,
        Res<SoundSettings>,
    ),
    mut village: ResMut<Village>,
    buttons: Query<(&BuildButton, &Interaction), Changed<Interaction>>,
) {
    if visible(&setup, &village, &saves, &sound) {
        for (button, state) in &buttons {
            if *state == Interaction::Pressed {
                let sandbox = village.stock.sandbox;
                let build = &mut village.construction;
                match *button {
                    BuildButton::Blueprint(row) => build.pick_build_row(&catalog, row, sandbox),
                    BuildButton::Category(index) => build.set_build_category(index),
                    BuildButton::PreviousPage => build.turn_build_page(&catalog, false),
                    BuildButton::NextPage => build.turn_build_page(&catalog, true),
                    BuildButton::ConstructionPolicy if sandbox => {
                        build.toggle_sandbox_construction()
                    }
                    BuildButton::ConstructionPolicy => build.toggle_auto_buy(),
                    BuildButton::SupplierConstruction if !sandbox => {
                        build.toggle_supplier_construction()
                    }
                    BuildButton::SupplierConstruction => {}
                    BuildButton::Search => build.toggle_build_search(),
                    BuildButton::Close => build.toggle_build_menu(sandbox),
                }
                break;
            }
        }
    }
}

type CatalogTexts<'w, 's> = Query<
    'w,
    's,
    (
        &'static mut Text,
        &'static mut TextColor,
        Option<&'static CardName>,
        Option<&'static CardDetail>,
        (Has<ResultCaption>, Has<PageCaption>, Has<BlueprintDetails>),
    ),
>;

type CatalogButtons<'w, 's> = Query<
    'w,
    's,
    (
        &'static BuildButton,
        &'static Children,
        &'static Interaction,
        &'static mut Node,
        (
            &'static mut BackgroundColor,
            &'static mut BorderColor,
            &'static mut BoxShadow,
        ),
    ),
    Without<BuildPanel>,
>;

fn refresh(
    (setup, catalog, saves, sound): (
        Res<WorldSetup>,
        Res<Catalog>,
        Res<SaveMenu>,
        Res<SoundSettings>,
    ),
    village: Res<Village>,
    (window, scroll): (
        Single<&Window, With<PrimaryWindow>>,
        Res<bevy::input::mouse::AccumulatedMouseScroll>,
    ),
    dock: Single<&ComputedNode, With<toolbar::Toolbar>>,
    mut panel: Single<(&mut Node, &mut ScrollPosition, &Interaction), With<BuildPanel>>,
    mut buttons: CatalogButtons,
    mut texts: CatalogTexts,
) {
    let (panel, position, interaction) = &mut *panel;
    if !visible(&setup, &village, &saves, &sound) {
        panel.display = Display::None;
        position.y = 0.;
        return;
    }
    panel.display = Display::Flex;
    // Sit just above the dock, which wraps to more rows on narrow windows.
    let dock_height = dock.size().y * dock.inverse_scale_factor();
    let bottom = 18.0 + dock_height + 12.0;
    if panel.bottom != px(bottom) {
        panel.bottom = px(bottom);
    }
    let max_height = px((window.height() - bottom - top_bar_clearance()).max(0.));
    if panel.max_height != max_height {
        panel.max_height = max_height;
    }

    let construction = &village.construction;
    let sandbox = village.stock.sandbox;
    let projects = construction.build_rows(&catalog);
    let (page, pages) = construction.build_page(&catalog);
    let clock = TownClock {
        seconds: village.clock,
        round_trip_km: setup.round_trip_km(),
    };
    let mut hovered = **interaction != Interaction::None;
    let mut details = None;
    let mut cards: [Option<(String, String)>; BUILD_ROWS] = Default::default();
    let mut search = None;

    for (button, children, interaction, mut node, paint) in &mut buttons {
        let (mut background, mut border, mut shadow) = paint;
        hovered |= *interaction != Interaction::None && node.display != Display::None;
        let mut enabled = true;
        let mut active = false;
        let mut shown = true;
        let label = match *button {
            BuildButton::Blueprint(index) => {
                let project = projects.get(index);
                shown = project.is_some();
                if let Some((key, project)) = project {
                    let planned =
                        construction.blueprint_already_planned(key, project, sandbox, None);
                    enabled = !planned;
                    let missing = !sandbox && village.stock.missing(&project.materials).is_some();
                    let quote = missing.then(|| {
                        construction.blueprint_supply_quote(
                            &catalog,
                            &village.stock,
                            clock,
                            project,
                        )
                    });
                    if *interaction == Interaction::Hovered {
                        let supply = match &quote {
                            Some(Ok(text) | Err(text)) => text.as_str(),
                            None if sandbox => "Free in Sandbox",
                            None => "Supplies available locally",
                        };
                        let mut text = blueprint_details(&village.stock, &catalog, project, supply);
                        if planned {
                            text.push_str(
                                "\nAlready planned or built. Select the existing project to manage it.",
                            );
                        }
                        details = Some(text);
                    }
                    let [width, depth] = project.size;
                    let cost = if sandbox {
                        "Free".into()
                    } else if let Some(Ok(_)) = quote {
                        "Supplies to buy".into()
                    } else if missing {
                        "Missing materials".into()
                    } else {
                        format!("{} materials", project.materials.values().sum::<u32>())
                    };
                    cards[index] =
                        Some((project.name.clone(), format!("{cost} · {width}×{depth}")));
                }
                None
            }
            BuildButton::Category(index) => {
                active =
                    !construction.searching_blueprints() && construction.build_category() == index;
                // Categories read as a list; only the current one is raised.
                if !active {
                    let fill = if *interaction == Interaction::None {
                        Color::NONE
                    } else {
                        theme::BUTTON_HOVER
                    };
                    background.0 = fill;
                    *border = BorderColor::all(Color::NONE);
                    *shadow = BoxShadow::default();
                    continue;
                }
                None
            }
            BuildButton::PreviousPage | BuildButton::NextPage => {
                shown = pages > 1;
                None
            }
            BuildButton::Search => {
                let edge = if construction.editing_search {
                    theme::ACTIVE_EDGE
                } else {
                    theme::EDGE
                };
                *border = BorderColor::all(edge);
                search = Some(children[0]);
                continue;
            }
            BuildButton::ConstructionPolicy => {
                let label = if sandbox {
                    construction.sandbox_status()
                } else {
                    construction.auto_buy_status()
                };
                active = label.ends_with(" on");
                Some(label)
            }
            BuildButton::SupplierConstruction => {
                shown = !sandbox;
                Some(if construction.supplier_construction() {
                    "Supplies · Supplier freight"
                } else {
                    "Supplies · Resident pickup"
                })
            }
            BuildButton::Close => Some("Close catalog"),
        };
        let display = if shown { Display::Flex } else { Display::None };
        if node.display != display {
            node.display = display;
        }
        theme::paint_button(
            *interaction,
            enabled,
            active,
            &mut background,
            &mut border,
            &mut shadow,
        );
        if let Some(label) = label
            && let Ok((mut text, ..)) = texts.get_mut(children[0])
            && text.0 != label
        {
            text.0 = label.into();
        }
    }

    if let Some(field) = search
        && let Ok((mut text, mut color, ..)) = texts.get_mut(field)
    {
        let (wanted, tone) = if construction.editing_search {
            (format!("{}|", construction.build_query()), theme::INK)
        } else if construction.build_query().trim().is_empty() {
            (SEARCH_PLACEHOLDER.to_owned(), theme::MUTED)
        } else {
            (construction.build_query().to_owned(), theme::INK)
        };
        if text.0 != wanted {
            text.0 = wanted;
        }
        if color.0 != tone {
            color.0 = tone;
        }
    }

    let caption = construction.build_heading(&catalog);
    for (mut text, _, name, detail, (result, page_caption, details_text)) in &mut texts {
        let wanted = if let Some(CardName(index)) = name {
            cards[*index].as_ref().map(|card| card.0.clone())
        } else if let Some(CardDetail(index)) = detail {
            cards[*index].as_ref().map(|card| card.1.clone())
        } else if result {
            Some(caption.clone())
        } else if page_caption {
            Some(format!("Page {page} of {pages}"))
        } else if details_text {
            Some(details.clone().unwrap_or_else(|| DETAILS_HINT.to_owned()))
        } else {
            None
        };
        if let Some(wanted) = wanted
            && text.0 != wanted
        {
            text.0 = wanted;
        }
    }

    if hovered && scroll.delta.y != 0. {
        let step = match scroll.unit {
            bevy::input::mouse::MouseScrollUnit::Line => 34.,
            bevy::input::mouse::MouseScrollUnit::Pixel => 1.,
        };
        position.y = (position.y - scroll.delta.y * step).max(0.);
    }
}

fn blueprint_details(
    stock: &Stock,
    catalog: &Catalog,
    project: &crate::catalog::Project,
    supply_detail: &str,
) -> String {
    use std::fmt::Write;
    let [width, depth] = project.size;
    let mut details = format!(
        "{}\n{}\n{} × {} m · {:.1} person-hours · {} loads",
        project.name,
        project.description,
        width * 2,
        depth * 2,
        project.work * 0.45 / 60.0,
        catalog.loads(project),
    );
    project.append_assembly_estimate(&mut details);
    for (id, amount) in &project.materials {
        let missing = amount.saturating_sub(stock.available(id));
        let material = &catalog.materials[id];
        let _ = write!(
            details,
            "\n{} {}",
            material.quantity_text(u64::from(*amount)),
            material.name
        );
        if missing > 0 && !stock.sandbox {
            let _ = write!(
                details,
                " · {} missing",
                material.quantity_text(u64::from(missing))
            );
        }
    }
    let _ = write!(details, "\n{supply_detail}");
    details
}
