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

/// The bundled Outfit font, for text spans that set their own size and weight.
pub fn outfit(assets: &AssetServer) -> Handle<Font> {
    load_embedded_asset!(assets, "outfit.ttf")
}

/// Outfit at V2's body weight, in V2's ink colour.
pub fn ui_font(assets: &AssetServer, size: f32) -> impl Bundle {
    ui_font_weight(assets, size, 400)
}

/// Outfit at a chosen weight; V2 uses 600 for buttons and 750 for headings.
pub fn ui_font_weight(assets: &AssetServer, size: f32, weight: u16) -> impl Bundle {
    ui_font_styled(assets, size, weight, crate::theme::INK)
}

/// Outfit at a chosen weight and colour, for captions and status lines.
pub fn ui_font_styled(assets: &AssetServer, size: f32, weight: u16, color: Color) -> impl Bundle {
    (
        TextFont {
            weight: bevy::text::FontWeight(weight),
            ..TextFont::from_font_size(size).with_font(load_embedded_asset!(assets, "outfit.ttf"))
        },
        TextColor(color),
    )
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    fn u16_at(data: &[u8], at: usize) -> usize {
        usize::from(u16::from_be_bytes([data[at], data[at + 1]]))
    }

    fn u32_at(data: &[u8], at: usize) -> usize {
        u32::from_be_bytes(data[at..at + 4].try_into().unwrap()) as usize
    }

    /// Code points mapped by the font's format 4 and format 12 cmap subtables.
    fn mapped_characters(font: &[u8]) -> BTreeSet<u32> {
        let tables = u16_at(font, 4);
        let cmap = (0..tables)
            .map(|index| 12 + 16 * index)
            .find(|&record| &font[record..record + 4] == b"cmap")
            .map(|record| u32_at(font, record + 8))
            .expect("font has a cmap table");
        let mut mapped = BTreeSet::new();
        for encoding in 0..u16_at(font, cmap + 2) {
            let subtable = cmap + u32_at(font, cmap + 8 + 8 * encoding);
            match u16_at(font, subtable) {
                4 => {
                    let segments = u16_at(font, subtable + 6) / 2;
                    for segment in 0..segments {
                        let end = u16_at(font, subtable + 14 + 2 * segment);
                        let start = u16_at(font, subtable + 16 + 2 * segments + 2 * segment);
                        mapped.extend(start as u32..=end as u32);
                    }
                }
                12 => {
                    for group in 0..u32_at(font, subtable + 12) {
                        let at = subtable + 16 + 12 * group;
                        mapped.extend(u32_at(font, at) as u32..=u32_at(font, at + 4) as u32);
                    }
                }
                _ => {}
            }
        }
        mapped
    }

    fn sources(directory: &std::path::Path, found: &mut Vec<std::path::PathBuf>) {
        for entry in std::fs::read_dir(directory).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                // Art tools draw with their own fonts.
                if path.file_name().is_some_and(|name| name != "workshop") {
                    sources(&path, found);
                }
            } else if path
                .extension()
                .is_some_and(|extension| extension == "rs" || extension == "json")
            {
                found.push(path);
            }
        }
    }

    #[test]
    fn every_character_in_game_text_exists_in_the_ui_font() {
        let mapped = mapped_characters(include_bytes!("outfit.ttf"));
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let mut files = Vec::new();
        sources(&root.join("src"), &mut files);
        sources(&root.join("data"), &mut files);
        let missing: BTreeSet<_> = files
            .iter()
            .flat_map(|path| {
                let text = std::fs::read_to_string(path).unwrap();
                text.chars()
                    .filter(|character| {
                        !character.is_ascii() && !mapped.contains(&(*character as u32))
                    })
                    .map(|character| {
                        (
                            character,
                            path.strip_prefix(root).unwrap().display().to_string(),
                        )
                    })
                    .collect::<Vec<_>>()
            })
            .collect();
        assert!(
            missing.is_empty(),
            "Characters the UI font cannot draw: {missing:?}"
        );
    }
}
