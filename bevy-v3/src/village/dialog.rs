//! The frame V2 puts around its almanac screens: a dimmed village, a sidebar of screens,
//! the sheet itself and a close button, all above the top bar and the dock.
//!
//! The sheet is the status card (`spawn_hud`), sized here while a panel is open; screen
//! content lives in each screen's own module.

use super::*;
use crate::{theme, ui_font::ui_font_styled, ui_font::ui_font_weight};

/// Margin between the dialog and the window edges.
const MARGIN: f32 = 24.0;
/// Width of the screen list on the left of the dialog.
const SIDEBAR: f32 = 196.0;
const GAP: f32 = 12.0;
/// Draw order above the village UI, so the dimming covers the top bar and dock.
const BACKDROP_Z: i32 = 10;
const DIALOG_Z: i32 = 11;

/// Screens in V2's almanac order, then the rest of V3's panels.
const SCREENS: [(UtilityPanel, &str); 10] = [
    (UtilityPanel::Finances, "Finances"),
    (UtilityPanel::Inventory, "Items & equipment"),
    (UtilityPanel::Crafting, "Crafting"),
    (UtilityPanel::Pantry, "Food"),
    (UtilityPanel::Trade, "Town trade"),
    (UtilityPanel::Water, "Water"),
    (UtilityPanel::Power, "Power"),
    (UtilityPanel::Residents, "Residents"),
    (UtilityPanel::Upkeep, "Maintenance"),
    (UtilityPanel::Events, "Village events"),
];

#[derive(Component)]
struct Backdrop;

#[derive(Component)]
struct Sidebar;

#[derive(Component, Clone, Copy)]
struct ScreenTab(UtilityPanel);

#[derive(Component)]
struct CloseDialog;

pub(super) fn install(app: &mut App) {
    app.add_systems(Startup, spawn).add_systems(
        Update,
        (input.before(village_input), frame.after(fit_and_scroll_hud)),
    );
}

fn spawn(mut commands: Commands, assets: Res<AssetServer>) {
    commands.spawn((
        Backdrop,
        Interaction::None,
        bevy::ui::FocusPolicy::Block,
        Node {
            display: Display::None,
            position_type: PositionType::Absolute,
            left: px(0),
            right: px(0),
            top: px(0),
            bottom: px(0),
            ..default()
        },
        BackgroundColor(Color::srgba(0.14, 0.18, 0.12, 0.55)),
        GlobalZIndex(BACKDROP_Z),
    ));
    commands
        .spawn((
            Sidebar,
            Interaction::None,
            bevy::ui::FocusPolicy::Block,
            theme::panel_node(Node {
                display: Display::None,
                position_type: PositionType::Absolute,
                left: px(MARGIN),
                top: px(MARGIN),
                bottom: px(MARGIN),
                width: px(SIDEBAR),
                padding: UiRect::all(px(14)),
                flex_direction: FlexDirection::Column,
                row_gap: px(6),
                ..default()
            }),
            theme::panel(),
            GlobalZIndex(DIALOG_Z),
        ))
        .with_children(|sidebar| {
            sidebar.spawn((
                Text::new("VILLAGE ALMANAC"),
                ui_font_styled(&assets, 11.0, 750, theme::CAPTION),
                Node {
                    margin: UiRect::bottom(px(8)),
                    ..default()
                },
            ));
            for (panel, label) in SCREENS {
                sidebar
                    .spawn((
                        ScreenTab(panel),
                        Button,
                        Node {
                            padding: UiRect::axes(px(12), px(8)),
                            border: UiRect::all(px(2)),
                            border_radius: BorderRadius::all(px(10)),
                            ..default()
                        },
                        BackgroundColor(Color::NONE),
                        BorderColor::all(Color::NONE),
                    ))
                    .with_child((Text::new(label), ui_font_weight(&assets, 14.0, 600)));
            }
            sidebar.spawn(Node {
                flex_grow: 1.,
                ..default()
            });
            sidebar.spawn((
                Text::new("Paused while you plan"),
                ui_font_styled(&assets, 12.0, 500, theme::MUTED),
            ));
        });
    commands
        .spawn((
            CloseDialog,
            Button,
            theme::button_node(Node {
                display: Display::None,
                position_type: PositionType::Absolute,
                width: px(34),
                height: px(34),
                justify_content: JustifyContent::Center,
                align_items: AlignItems::Center,
                border_radius: BorderRadius::all(px(17)),
                ..default()
            }),
            theme::button(),
            GlobalZIndex(DIALOG_Z + 1),
        ))
        .with_child((Text::new("×"), ui_font_weight(&assets, 20.0, 600)));
}

fn input(
    mut village: ResMut<Village>,
    tabs: Query<(&ScreenTab, &Interaction), Changed<Interaction>>,
    close: Query<&Interaction, (With<CloseDialog>, Changed<Interaction>)>,
) {
    if !village.modal_panel() {
        return;
    }
    if close
        .iter()
        .any(|interaction| *interaction == Interaction::Pressed)
    {
        village.utility_panel = None;
        return;
    }
    if let Some((tab, _)) = tabs
        .iter()
        .find(|(_, interaction)| **interaction == Interaction::Pressed)
    {
        village.open_panel(tab.0);
    }
}

type FrameNodes<'w, 's> = (
    Single<'w, 's, &'static mut Node, (With<Backdrop>, Without<Sidebar>, Without<CloseDialog>)>,
    Single<'w, 's, &'static mut Node, (With<Sidebar>, Without<Backdrop>, Without<CloseDialog>)>,
    Single<'w, 's, &'static mut Node, (With<CloseDialog>, Without<Backdrop>, Without<Sidebar>)>,
);

type Sheet<'w, 's> = Single<
    'w,
    's,
    (&'static mut Node, &'static mut GlobalZIndex),
    (
        With<VillageHud>,
        Without<Backdrop>,
        Without<Sidebar>,
        Without<CloseDialog>,
    ),
>;

fn frame(
    (village, setup): (Res<Village>, Res<WorldSetup>),
    (mut backdrop, mut sidebar, mut close): FrameNodes,
    mut sheet: Sheet,
    mut menu: Query<&mut GlobalZIndex, (With<toolbar::PanelMenuMarker>, Without<VillageHud>)>,
    mut tabs: Query<(
        &ScreenTab,
        &Interaction,
        &mut BackgroundColor,
        &mut BorderColor,
    )>,
) {
    let open = !setup.open && village.modal_panel();
    let display = if open { Display::Flex } else { Display::None };
    for node in [&mut **backdrop, &mut **sidebar, &mut **close] {
        if node.display != display {
            node.display = display;
        }
    }
    let (node, z) = &mut *sheet;
    let layer = if open { DIALOG_Z } else { 0 };
    if z.0 != layer {
        z.0 = layer;
    }
    for mut z in &mut menu {
        if z.0 != layer {
            z.0 = layer;
        }
    }
    if !open {
        return;
    }
    // The sheet fills the dialog between the sidebar and the action column.
    let right = MARGIN + toolbar::PANEL_WIDTH + GAP;
    let wanted = (
        px(MARGIN + SIDEBAR + GAP),
        px(right),
        px(MARGIN),
        px(MARGIN),
    );
    if (node.left, node.right, node.top, node.bottom) != wanted {
        node.left = wanted.0;
        node.right = wanted.1;
        node.top = wanted.2;
        node.bottom = wanted.3;
        node.max_width = Val::Auto;
        node.max_height = Val::Auto;
    }
    if close.right != px(right + 14.) {
        close.right = px(right + 14.);
        close.top = px(MARGIN + 14.);
    }
    for (tab, interaction, mut background, mut border) in &mut tabs {
        let active = village.utility_panel == Some(tab.0);
        let fill = if active {
            theme::ACTIVE
        } else if *interaction == Interaction::None {
            Color::NONE
        } else {
            theme::BUTTON_HOVER
        };
        if background.0 != fill {
            background.0 = fill;
        }
        let edge = if active {
            theme::ACTIVE_EDGE
        } else {
            Color::NONE
        };
        if *border != BorderColor::all(edge) {
            *border = BorderColor::all(edge);
        }
    }
}
