use crate::*;

#[derive(Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Mode {
    #[default]
    Story,
    Sandbox,
}

/// Sandbox keeps daily life and ecology, while removing economic pressure.
pub fn replenish(v: &mut Village) {
    if v.mode != Mode::Sandbox {
        return;
    }
    v.food = v.food.max(80.);
    v.water = ecology::capacity(v);
    v.meals = v.meals.max(20);
    v.economy.money = v.economy.money.max(10_000_000);
    v.progress.tool_uses = 36;
}

#[wasm_bindgen]
impl Game {
    /// Starts a fresh mode; invalid input leaves the running village untouched.
    pub fn start_mode(&mut self, mode: &str) -> bool {
        let mode = match mode {
            "story" => Mode::Story,
            "sandbox" => Mode::Sandbox,
            _ => return false,
        };
        *self = Self::new();
        let mut v = self.app.world_mut().resource_mut::<Village>();
        v.mode = mode;
        if mode == Mode::Sandbox {
            v.events = vec!["An open clearing. Every possibility is yours to explore.".into()];
            v.wood = 100.;
            v.economy.stock[1..].fill(24);
            replenish(&mut v);
        }
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn story_unlocks_every_building_in_order() {
        let mut g = Game::new();
        assert!(g.place("greenhouse", 5, 5).contains("quest"));
        for kind in [
            "grove",
            "compost",
            "square",
            "workshop",
            "coop",
            "solar_farm",
            "streetlight",
        ] {
            assert!(!progression::unlocked(
                g.app.world().resource::<Village>(),
                kind
            ));
        }
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.progress.completed[0] = true;
        assert!(progression::unlocked(&v, "grove"));
        assert!(!progression::available(&v, 2));
        v.progress.completed[1] = true;
        assert!(progression::available(&v, 2));
        v.progress.completed = [true; 4];
        assert!(progression::unlocked(&v, "greenhouse"));
        assert!(!progression::unlocked(&v, "coop"));
        v.progress.later_completed[0] = true;
        assert!(progression::unlocked(&v, "coop"));
        v.progress.later_completed[1] = true;
        assert!(progression::unlocked(&v, "solar_farm"));
    }

    #[test]
    fn sandbox_builds_freely_and_round_trips_without_story_progress() {
        let mut g = Game::new();
        assert!(g.start_mode("sandbox"));
        let before = g.app.world().resource::<Village>().economy.money;
        assert_eq!(g.place("solar_farm", 5, 5), "ok");
        assert_eq!(g.place("greenhouse", 10, 5), "ok");
        assert_eq!(g.place("home", 15, 5), "ok");
        assert!(
            g.app
                .world()
                .resource::<Village>()
                .buildings
                .iter()
                .all(|b| b.progress == 100.)
        );
        assert_eq!(g.app.world().resource::<Village>().economy.money, before);
        assert!(!g.track_quest(0));
        g.app.world_mut().resource_mut::<Village>().food = 0.;
        g.tick(0.25);
        assert!(g.app.world().resource::<Village>().food > 79.);
        let saved = g.snapshot();
        let mut restored = Game::new();
        assert!(restored.restore(&saved));
        assert_eq!(restored.snapshot(), saved);
        assert_eq!(
            restored
                .app
                .world()
                .resource::<Village>()
                .progress
                .completed,
            [false; 4]
        );
        assert!(!g.start_mode("invalid"));
        assert_eq!(g.snapshot(), saved);
    }
}
