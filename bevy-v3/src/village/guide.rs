use bevy::prelude::*;

const TOPICS: [(&str, &str); 3] = [
    (
        "Getting started",
        "Choose a campsite after the residents arrive.\n\
         Keep tents clear of the river, road and unloaded supplies.\n\
         Use B to open Build. Select a project and click the map to plan it.\n\
         Check F11 for progress and F10 for available supplies.\n\
         Space pauses or resumes time. Outside menus, 1–4 set the speed.\n\
         F5 saves the village. F6 opens the saved village library.",
    ),
    (
        "Camera and building",
        "WASD / Arrow keys · Pan     Shift · Pan faster\n\
         Q / E or right drag · Rotate     Scroll · Zoom\n\
         Home · Reset view     Left drag · Pan\n\
         B · Build     R · Rotate the current placement\n\
         F4 · Terrain tools     F11 · Find a project\n\
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
];

#[derive(Default)]
pub(super) struct Guide {
    page: Option<usize>,
}

impl Guide {
    pub(super) fn open(&self) -> bool {
        self.page.is_some()
    }

    /// Consume the whole frame when opening, reading or closing the guide.
    pub(super) fn controls(&mut self, keys: &ButtonInput<KeyCode>) -> bool {
        if keys.just_pressed(KeyCode::F1) {
            self.page = if self.open() { None } else { Some(0) };
            return true;
        }
        let Some(page) = self.page else {
            return false;
        };
        if keys.just_pressed(KeyCode::Escape) {
            self.page = None;
        } else if keys.just_pressed(KeyCode::PageDown) {
            self.page = Some((page + 1) % TOPICS.len());
        } else if keys.just_pressed(KeyCode::PageUp) {
            self.page = Some((page + TOPICS.len() - 1) % TOPICS.len());
        }
        true
    }

    pub(super) fn text(&self) -> Option<String> {
        let page = self.page?;
        let (title, body) = TOPICS[page];
        Some(format!(
            "Village guide · {title} · {}/{}\nPage Up/Down · F1 or Esc Close\n\n{body}",
            page + 1,
            TOPICS.len()
        ))
    }
}
