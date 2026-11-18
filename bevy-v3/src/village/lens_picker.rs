use bevy::prelude::*;

#[derive(Clone, Copy, PartialEq)]
pub(super) enum MapLens {
    Land,
    Resources,
    Ecology,
    Access,
    Construction,
    Power,
    Water,
    Sanitation,
    Work,
    Food,
    Chains,
}

const LENSES: [(KeyCode, MapLens, &str); 9] = [
    (KeyCode::Digit1, MapLens::Land, "Land & slope"),
    (KeyCode::Digit2, MapLens::Resources, "Resources"),
    (KeyCode::Digit3, MapLens::Ecology, "Ecology"),
    (KeyCode::Digit4, MapLens::Access, "Access"),
    (KeyCode::Digit5, MapLens::Construction, "Construction"),
    (KeyCode::Digit6, MapLens::Power, "Power"),
    (KeyCode::Digit7, MapLens::Water, "Water"),
    (KeyCode::Digit8, MapLens::Sanitation, "Sanitation"),
    (KeyCode::Digit9, MapLens::Work, "Work"),
];

const SECOND_PAGE: [(KeyCode, MapLens, &str); 2] = [
    (KeyCode::Digit1, MapLens::Food, "Food"),
    (KeyCode::Digit2, MapLens::Chains, "Material chains"),
];

#[derive(Default)]
pub(super) struct LensPicker {
    pub open: bool,
    pub active: Option<MapLens>,
    next_page: bool,
    pub material: usize,
}

impl LensPicker {
    pub(super) fn controls(&mut self, keys: &ButtonInput<KeyCode>, material_count: usize) -> bool {
        let shift = keys.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]);
        if shift && keys.just_pressed(KeyCode::KeyL) {
            self.open = !self.open;
            self.next_page = false;
            return true;
        }
        if self.open {
            if keys.just_pressed(KeyCode::Escape) {
                self.open = false;
            } else if keys.just_pressed(KeyCode::Digit0) {
                self.active = None;
                self.open = false;
            } else if keys.any_just_pressed([KeyCode::PageUp, KeyCode::PageDown]) {
                self.next_page = !self.next_page;
            } else if self.next_page {
                for (key, lens, _) in SECOND_PAGE {
                    if keys.just_pressed(key) {
                        self.active = Some(lens);
                        self.open = false;
                    }
                }
            } else if let Some(&(_, lens, _)) =
                LENSES.iter().find(|(key, _, _)| keys.just_pressed(*key))
            {
                self.active = Some(lens);
                self.open = false;
            }
            return true;
        }
        if shift && self.active == Some(MapLens::Chains) && material_count > 0 {
            if keys.just_pressed(KeyCode::PageUp) {
                self.material = (self.material + material_count - 1) % material_count;
                return true;
            }
            if keys.just_pressed(KeyCode::PageDown) {
                self.material = (self.material + 1) % material_count;
                return true;
            }
        }
        let shortcuts = [
            (
                KeyCode::F2,
                if shift {
                    MapLens::Access
                } else {
                    MapLens::Land
                },
            ),
            (KeyCode::F3, MapLens::Resources),
            (KeyCode::F12, MapLens::Ecology),
        ];
        let picked = if shift && keys.just_pressed(KeyCode::F11) {
            Some(MapLens::Construction)
        } else {
            shortcuts
                .into_iter()
                .find_map(|(key, lens)| keys.just_pressed(key).then_some(lens))
        };
        if let Some(lens) = picked {
            self.active = (self.active != Some(lens)).then_some(lens);
            return true;
        }
        false
    }

    pub(super) fn text(&self) -> Option<String> {
        use std::fmt::Write;
        if !self.open {
            return None;
        }
        let page = if self.next_page { 2 } else { 1 };
        let mut text = format!("Map lenses · {page}/2 · Page Up/Down · Esc Close\n0 Normal view");
        let options = if self.next_page {
            SECOND_PAGE.as_slice()
        } else {
            LENSES.as_slice()
        };
        for (index, &(_, lens, label)) in options.iter().enumerate() {
            let active = if self.active == Some(lens) {
                " · Active"
            } else {
                ""
            };
            let _ = write!(text, "\n{} {label}{active}", index + 1);
        }
        Some(text)
    }
}
