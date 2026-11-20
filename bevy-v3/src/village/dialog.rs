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
const SIDEBAR: f32 = 176.0;
const GAP: f32 = 12.0;
/// The screen's caption and title sit above the sidebar, across the sheet's top.
const SIDEBAR_TOP: f32 = 64.0;
/// Draw order above the village UI, so the dimming covers the top bar and dock.
const BACKDROP_Z: i32 = 10;
/// The shared paper sheet behind the sidebar and the screen.
const FRAME_Z: i32 = 11;
const DIALOG_Z: i32 = 12;

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

/// One paper sheet holding the sidebar and the screen, as in V2.
#[derive(Component)]
struct Frame;

#[derive(Component, Clone, Copy)]
struct ScreenTabLabel(UtilityPanel);

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
    commands.spawn((
        Frame,
        theme::panel_node(Node {
            display: Display::None,
            position_type: PositionType::Absolute,
            left: px(MARGIN),
            right: px(MARGIN),
            top: px(MARGIN),
            bottom: px(MARGIN),
            ..default()
        }),
        theme::panel(),
        GlobalZIndex(FRAME_Z),
    ));
    commands
        .spawn((
            Sidebar,
            Interaction::None,
            bevy::ui::FocusPolicy::Block,
            Node {
                display: Display::None,
                position_type: PositionType::Absolute,
                left: px(MARGIN),
                top: px(MARGIN + SIDEBAR_TOP),
                bottom: px(MARGIN),
                width: px(SIDEBAR),
                padding: UiRect::new(px(14), px(14), px(0), px(14)),
                border: UiRect::right(px(1)),
                flex_direction: FlexDirection::Column,
                row_gap: px(4),
                ..default()
            },
            BorderColor::all(theme::SUBTLE_BORDER),
            GlobalZIndex(DIALOG_Z),
        ))
        .with_children(|sidebar| {
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
                    .with_child((
                        ScreenTabLabel(panel),
                        Text::new(label),
                        ui_font_styled(&assets, 14.0, 600, theme::INK),
                    ));
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
    Single<
        'w,
        's,
        &'static mut Node,
        (
            With<Backdrop>,
            Without<Sidebar>,
            Without<CloseDialog>,
            Without<Frame>,
        ),
    >,
    Single<
        'w,
        's,
        &'static mut Node,
        (
            With<Sidebar>,
            Without<Backdrop>,
            Without<CloseDialog>,
            Without<Frame>,
        ),
    >,
    Single<
        'w,
        's,
        &'static mut Node,
        (
            With<CloseDialog>,
            Without<Backdrop>,
            Without<Sidebar>,
            Without<Frame>,
        ),
    >,
    Single<
        'w,
        's,
        &'static mut Node,
        (
            With<Frame>,
            Without<Backdrop>,
            Without<Sidebar>,
            Without<CloseDialog>,
        ),
    >,
);

type Sheet<'w, 's> = Single<
    'w,
    's,
    (
        &'static mut Node,
        &'static mut GlobalZIndex,
        &'static mut BackgroundColor,
        &'static mut BorderColor,
        &'static mut BoxShadow,
    ),
    (
        With<VillageHud>,
        Without<Backdrop>,
        Without<Sidebar>,
        Without<CloseDialog>,
        Without<Frame>,
        Without<ScreenTab>,
    ),
>;

type Tabs<'w, 's> = Query<
    'w,
    's,
    (
        &'static ScreenTab,
        &'static Interaction,
        &'static mut BackgroundColor,
        &'static mut BorderColor,
    ),
    Without<VillageHud>,
>;

fn frame(
    (village, setup): (Res<Village>, Res<WorldSetup>),
    (mut backdrop, mut sidebar, mut close, mut paper): FrameNodes,
    mut sheet: Sheet,
    mut menu: Query<&mut GlobalZIndex, (With<toolbar::PanelMenuMarker>, Without<VillageHud>)>,
    mut tabs: Tabs,
    mut labels: Query<(&ScreenTabLabel, &mut TextColor)>,
) {
    let open = !setup.open && village.modal_panel();
    let display = if open { Display::Flex } else { Display::None };
    for node in [&mut **backdrop, &mut **sidebar, &mut **close, &mut **paper] {
        if node.display != display {
            node.display = display;
        }
    }
    let (node, z, background, border, shadow) = &mut *sheet;
    let layer = if open { DIALOG_Z } else { 0 };
    if z.0 != layer {
        z.0 = layer;
    }
    for mut z in &mut menu {
        if z.0 != layer {
            z.0 = layer;
        }
    }
    // Inside the dialog the sheet is part of the shared paper; outside it is its own card.
    let (fill, edge) = if open {
        (Color::NONE, Color::NONE)
    } else {
        (theme::PAPER, theme::EDGE)
    };
    if background.0 != fill {
        background.0 = fill;
        **border = BorderColor::all(edge);
        **shadow = if open {
            BoxShadow::default()
        } else {
            theme::panel_shadow()
        };
    }
    if !open {
        return;
    }
    // The sheet fills the dialog between the sidebar and the action column, or to the
    // edge when the screen carries its own controls.
    let right = if village.widget_screen() {
        MARGIN
    } else {
        MARGIN + toolbar::PANEL_WIDTH + GAP
    };
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
    if close.right != px(MARGIN + 14.) {
        close.right = px(MARGIN + 14.);
        close.top = px(MARGIN + 14.);
    }
    // V2 fills the open screen's tab in deep green with paper lettering.
    for (tab, interaction, mut background, mut border) in &mut tabs {
        let active = village.utility_panel == Some(tab.0);
        let fill = if active {
            theme::INK
        } else if *interaction == Interaction::None {
            Color::NONE
        } else {
            theme::BUTTON_HOVER
        };
        if background.0 != fill {
            background.0 = fill;
        }
        let edge = if active { theme::INK } else { Color::NONE };
        if *border != BorderColor::all(edge) {
            *border = BorderColor::all(edge);
        }
    }
    for (label, mut color) in &mut labels {
        let wanted = if village.utility_panel == Some(label.0) {
            theme::PAPER
        } else {
            theme::INK
        };
        if color.0 != wanted {
            color.0 = wanted;
        }
    }
}
