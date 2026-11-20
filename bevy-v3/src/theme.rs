//! V2's paper look, shared by every V3 screen.
//!
//! Values come from `web/v02/weekend/weekend.css`: cream paper cards with a tan edge, a
//! hard drop shadow, rounded corners and dark green ink.

use bevy::prelude::*;

/// Body text and headings (`--ink`).
pub const INK: Color = Color::srgb_u8(0x40, 0x50, 0x3c);
/// Small uppercase captions such as "VILLAGE ALMANAC".
pub const CAPTION: Color = Color::srgb_u8(0x8a, 0x73, 0x4e);
/// Secondary text inside cards.
pub const MUTED: Color = Color::srgb_u8(0x6f, 0x77, 0x63);
/// Card and dialog background (`--paper`).
pub const PAPER: Color = Color::srgb_u8(0xff, 0xf7, 0xdf);
/// Borders around paper and buttons (`--edge`).
pub const EDGE: Color = Color::srgb_u8(0xbd, 0xa7, 0x7b);
/// Accent green (`--leaf`), used for meters and selected states.
pub const LEAF: Color = Color::srgb_u8(0x78, 0x95, 0x54);
pub const BUTTON: Color = Color::srgb_u8(0xff, 0xf4, 0xd3);
pub const BUTTON_HOVER: Color = Color::srgb_u8(0xff, 0xfb, 0xe9);
pub const BUTTON_PRESSED: Color = Color::srgb_u8(0xf3, 0xe6, 0xc0);
/// Buttons that cannot act right now, standing in for V2's 45% opacity.
pub const BUTTON_DISABLED: Color = Color::srgb_u8(0xf3, 0xec, 0xd6);
pub const BUTTON_SHADOW: Color = Color::srgb_u8(0xb1, 0x9a, 0x6e);
/// Pressed toggles and the current tab (`button.active`).
pub const ACTIVE: Color = Color::srgb_u8(0xe3, 0xed, 0xc5);
pub const ACTIVE_EDGE: Color = Color::srgb_u8(0x7b, 0x94, 0x57);
pub const ACTIVE_SHADOW: Color = Color::srgb_u8(0x6f, 0x85, 0x4b);
/// Empty part of a meter.
pub const TRACK: Color = Color::srgb_u8(0xe6, 0xdc, 0xbd);
/// Keyboard hint chips on buttons.
pub const KEY: Color = Color::srgb_u8(0xf7, 0xec, 0xcb);

pub const PANEL_RADIUS: f32 = 20.0;
pub const BUTTON_RADIUS: f32 = 12.0;

/// Border, rounding and padding for a paper panel's `Node`.
pub fn panel_node(node: Node) -> Node {
    Node {
        border: UiRect::all(px(2)),
        border_radius: BorderRadius::all(px(PANEL_RADIUS)),
        ..node
    }
}

/// Border and rounding for a paper button's `Node`.
pub fn button_node(node: Node) -> Node {
    Node {
        border: UiRect::all(px(2)),
        border_radius: BorderRadius::all(px(BUTTON_RADIUS)),
        ..node
    }
}

/// Colours and shadow of a floating paper panel.
pub fn panel() -> impl Bundle {
    (
        BackgroundColor(PAPER),
        BorderColor::all(EDGE),
        panel_shadow(),
    )
}

/// The two-part drop shadow under paper panels.
pub fn panel_shadow() -> BoxShadow {
    BoxShadow(vec![
        ShadowStyle {
            color: Color::srgba_u8(0x94, 0x7c, 0x50, 0x80),
            x_offset: px(0),
            y_offset: px(5),
            spread_radius: px(0),
            blur_radius: px(0),
        },
        ShadowStyle {
            color: Color::srgba_u8(0x3c, 0x48, 0x23, 0x26),
            x_offset: px(0),
            y_offset: px(9),
            spread_radius: px(0),
            blur_radius: px(22),
        },
    ])
}

/// Colours and shadow of a paper button at rest.
pub fn button() -> impl Bundle {
    (
        BackgroundColor(BUTTON),
        BorderColor::all(EDGE),
        BoxShadow::new(BUTTON_SHADOW, px(0), px(3), px(0), px(0)),
    )
}

/// Button fill for its interaction state.
pub fn button_fill(interaction: Interaction, enabled: bool) -> Color {
    match (enabled, interaction) {
        (false, _) => BUTTON_DISABLED,
        (true, Interaction::Pressed) => BUTTON_PRESSED,
        (true, Interaction::Hovered) => BUTTON_HOVER,
        (true, Interaction::None) => BUTTON,
    }
}

/// Repaints a paper button for its state, including V2's "active" toggle look.
pub fn paint_button(
    interaction: Interaction,
    enabled: bool,
    active: bool,
    background: &mut BackgroundColor,
    border: &mut BorderColor,
    shadow: &mut BoxShadow,
) {
    let fill = if active && enabled {
        ACTIVE
    } else {
        button_fill(interaction, enabled)
    };
    let edge = if active { ACTIVE_EDGE } else { EDGE };
    let drop = if active { ACTIVE_SHADOW } else { BUTTON_SHADOW };
    let lift = match (enabled, interaction) {
        (false, _) => 0.0,
        (true, Interaction::Hovered) => 5.0,
        (true, Interaction::Pressed) => 1.0,
        (true, Interaction::None) => 3.0,
    };
    if background.0 != fill {
        background.0 = fill;
    }
    if *border != BorderColor::all(edge) {
        *border = BorderColor::all(edge);
    }
    let wanted = BoxShadow::new(drop, px(0), px(lift), px(0), px(0));
    if *shadow != wanted {
        *shadow = wanted;
    }
}
