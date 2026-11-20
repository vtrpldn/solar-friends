//! Thumbnails rendered from the V2 asset library's equipment models.

use bevy::{
    asset::{embedded_asset, load_embedded_asset},
    prelude::*,
};

#[derive(Clone, Copy, PartialEq)]
pub(in crate::village) enum Item {
    Tools,
    Crates,
    Wheelbarrow,
    Bucket,
    CleaningKit,
    WateringCan,
    Bicycle,
}

impl Item {
    pub(super) fn for_material(id: &str) -> Option<Self> {
        match id {
            "garden-tools" | "carpentry-tools" => Some(Self::Tools),
            "produce-crates" | "harvest-basket" => Some(Self::Crates),
            "wheelbarrow" => Some(Self::Wheelbarrow),
            "bucket" => Some(Self::Bucket),
            "cleaning-kit" => Some(Self::CleaningKit),
            "watering-can" => Some(Self::WateringCan),
            "bicycle" => Some(Self::Bicycle),
            _ => None,
        }
    }

    pub(super) fn image(self, assets: &AssetServer) -> ImageNode {
        let handle = match self {
            Self::Tools => load_embedded_asset!(assets, "art/resource-tools.png"),
            Self::Crates => load_embedded_asset!(assets, "art/produce-crates.png"),
            Self::Wheelbarrow => load_embedded_asset!(assets, "art/wheelbarrow.png"),
            Self::Bucket => load_embedded_asset!(assets, "art/resource-tank.png"),
            Self::CleaningKit => load_embedded_asset!(assets, "art/resource-sanitation.png"),
            Self::WateringCan => load_embedded_asset!(assets, "art/watering-can.png"),
            Self::Bicycle => load_embedded_asset!(assets, "art/bicycle.png"),
        };
        ImageNode::new(handle)
    }
}

pub(in crate::village) fn install(app: &mut App) {
    embedded_asset!(app, "art/resource-tools.png");
    embedded_asset!(app, "art/produce-crates.png");
    embedded_asset!(app, "art/wheelbarrow.png");
    embedded_asset!(app, "art/resource-tank.png");
    embedded_asset!(app, "art/resource-sanitation.png");
    embedded_asset!(app, "art/watering-can.png");
    embedded_asset!(app, "art/bicycle.png");
}
