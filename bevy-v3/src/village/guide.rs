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
        "Camera and building",
        "WASD / Arrow keys · Pan     Shift · Pan faster\n\
         Q / E or right drag · Rotate     Scroll · Zoom\n\
         Home · Camp     End · River bend     Shift+Home · Reset view\n\
         B · Build     R · Rotate the current placement\n\
         F4 · Terrain tools     F11 · Find a project     Shift+G · Grid\n\
         In road planning, Shift-click extends and Z undoes the last stroke.",
    ),
    (
        "Village management",
        "N · Residents     P · Power     V · Water\n\
         H · Finances, trade and pantry (Tab switches pages)\n\
         F7 · Maintenance     F8 · Events     F10 · Stores\n\
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
}

fn chapters() -> &'static [Chapter] {
    static CHAPTERS: std::sync::OnceLock<Vec<Chapter>> = std::sync::OnceLock::new();
    CHAPTERS.get_or_init(|| {
        serde_json::from_str(include_str!("../../data/guide.json")).expect("embedded village guide")
    })
}

#[derive(Clone, Copy)]
enum Screen {
    Quick(usize),
    Index(usize),
    Chapter(usize),
}

#[derive(Default)]
pub(super) struct Guide {
    screen: Option<Screen>,
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

impl Guide {
    pub(super) fn open(&self) -> bool {
        self.screen.is_some()
    }

    pub(super) fn toggle(&mut self) {
        self.screen = if self.open() {
            None
        } else {
            Some(Screen::Quick(0))
        };
    }

    /// Consume the whole frame when opening, reading or closing the guide.
    pub(super) fn controls(&mut self, keys: &ButtonInput<KeyCode>) -> bool {
        if keys.just_pressed(KeyCode::F1) {
            self.toggle();
            return true;
        }
        let Some(screen) = self.screen else {
            return false;
        };
        if keys.just_pressed(KeyCode::Tab) {
            self.screen = Some(match screen {
                Screen::Quick(_) => Screen::Index(0),
                Screen::Index(_) | Screen::Chapter(_) => Screen::Quick(0),
            });
        } else if keys.just_pressed(KeyCode::Backspace) {
            if let Screen::Chapter(chapter) = screen {
                self.screen = Some(Screen::Index(chapter / CHAPTER_KEYS.len()));
            }
        } else if keys.any_just_pressed([KeyCode::PageDown, KeyCode::PageUp]) {
            let forward = keys.just_pressed(KeyCode::PageDown);
            self.screen = Some(match screen {
                Screen::Quick(page) => Screen::Quick(turn_page(page, TOPICS.len(), forward)),
                Screen::Index(page) => Screen::Index(turn_page(page, index_pages(), forward)),
                Screen::Chapter(page) => {
                    Screen::Chapter(turn_page(page, chapters().len(), forward))
                }
            });
        } else if let Screen::Index(page) = screen
            && let Some(row) = CHAPTER_KEYS.iter().position(|key| keys.just_pressed(*key))
        {
            let chapter = page * CHAPTER_KEYS.len() + row;
            if chapter < chapters().len() {
                self.screen = Some(Screen::Chapter(chapter));
            }
        }
        true
    }

    pub(super) fn text(&self) -> Option<String> {
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
                    "Village reference · {}/{}\n1–9 Open chapter · Page Up/Down · Tab Quick guide · F1 Close\n",
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
                    "{} · {}/{}\nPage Up/Down · Backspace Index · F1 Close",
                    chapter.title,
                    index + 1,
                    chapters().len()
                );
                for paragraph in [&chapter.description, &chapter.tip, &chapter.boundary] {
                    if !paragraph.is_empty() {
                        label.push('\n');
                        let mut width = 0;
                        for word in paragraph.split_whitespace() {
                            let length = word.chars().count();
                            if width == 0 || width + 1 + length > 78 {
                                label.push('\n');
                                width = length;
                            } else {
                                label.push(' ');
                                width += length + 1;
                            }
                            label.push_str(word);
                        }
                    }
                }
                label
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_reference_can_open_the_last_chapter_and_return_to_its_index() {
        let mut guide = Guide::default();
        let mut keys = ButtonInput::default();
        for key in [KeyCode::F1, KeyCode::Tab, KeyCode::PageUp, KeyCode::Digit9] {
            keys.press(key);
            assert!(guide.controls(&keys));
            keys.reset_all();
        }
        assert!(
            guide
                .text()
                .unwrap()
                .starts_with("Inspecting village conditions")
        );
        keys.press(KeyCode::Backspace);
        assert!(guide.controls(&keys));
        assert!(guide.text().unwrap().starts_with("Village reference · 3/3"));
    }
}
