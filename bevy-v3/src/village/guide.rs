use bevy::prelude::*;

const TOPICS: [(&str, &str); 7] = [
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
