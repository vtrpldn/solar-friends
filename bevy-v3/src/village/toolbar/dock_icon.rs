use super::{Action, UtilityPanel};
use crate::theme;
use bevy::{
    asset::{embedded_asset, load_embedded_asset},
    prelude::*,
};

pub(super) fn install(app: &mut App) {
    embedded_asset!(app, "dock_icons/build.png");
    embedded_asset!(app, "dock_icons/projects.png");
    embedded_asset!(app, "dock_icons/residents.png");
    embedded_asset!(app, "dock_icons/terrain.png");
}

pub(super) fn spawn(button: &mut EntityCommands, assets: &AssetServer, action: Action) {
    // V2 uses these four outlines as text glyphs. The white masks keep the
    // outlines without relying on Outfit and take their colour from the theme.
    let image = match action {
        Action::Build => load_embedded_asset!(assets, "dock_icons/build.png"),
        Action::ResourcePanel(UtilityPanel::Projects) => {
            load_embedded_asset!(assets, "dock_icons/projects.png")
        }
        Action::ResourcePanel(UtilityPanel::Residents) => {
            load_embedded_asset!(assets, "dock_icons/residents.png")
        }
        Action::Terrain => load_embedded_asset!(assets, "dock_icons/terrain.png"),
        _ => return,
    };
    button.with_child((
        ImageNode::new(image).with_color(theme::INK),
        Node {
            width: px(14),
            height: px(14),
            flex_shrink: 0.,
            ..default()
        },
    ));
}
