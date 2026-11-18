use bevy::{
    asset::{embedded_asset, load_embedded_asset},
    prelude::*,
};

pub struct UiFontPlugin;

impl Plugin for UiFontPlugin {
    fn build(&self, app: &mut App) {
        embedded_asset!(app, "outfit.ttf");
    }
}

pub fn ui_font(assets: &AssetServer, size: f32) -> TextFont {
    TextFont::from_font_size(size).with_font(load_embedded_asset!(assets, "outfit.ttf"))
}
