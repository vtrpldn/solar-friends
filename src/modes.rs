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
    pub fn remove_sandbox_building(&mut self, id: usize) -> bool {
        let mut v = self.app.world_mut().resource_mut::<Village>();
        if v.mode != Mode::Sandbox {
            return false;
        }
        let Some(building) = v.buildings.iter().find(|b| b.id == id) else {
            return false;
        };
        if building.kind == "warehouse"
            && economy::storage(&v) > economy::capacity(&v).saturating_sub(300)
        {
            return false;
        }
        let home = building.kind == "home";
        v.buildings.retain(|b| b.id != id);
        v.economy.projects.retain(|p| p.building != id);
        v.power.disabled.retain(|&building| building != id);
        v.power.stored = v.power.stored.min(power::supply(&v).capacity);
        v.water = v.water.min(ecology::capacity(&v));
        let village = v.clone();
        let mut q = self.app.world_mut().query::<&mut Resident>();
        for mut r in q.iter_mut(self.app.world_mut()) {
            if r.trip.is_none()
                && (r.visit_building == Some(id)
                    || r.activity_building == Some(id)
                    || (home && matches!(r.task.as_str(), "sleep" | "rest")))
            {
                r.visit_building = None;
                r.activity_building = None;
                r.activity_material = None;
                assign(
                    &mut r,
                    &village,
                    "rest",
                    "Taking a break while the clearing changes.",
                    false,
                );
            }
        }
        true
    }
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

    #[test]
    fn sandbox_removal_cleans_visits_power_and_frees_the_plot() {
        let mut g = Game::new();
        g.start_mode("sandbox");
        assert_eq!(g.place("solar_farm", 5, 5), "ok");
        assert_eq!(g.place("home", 12, 5), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.power.stored = 20.;
        }
        assert!(g.remove_sandbox_building(0));
        assert_eq!(g.app.world().resource::<Village>().power.stored, 0.);
        let mut q = g.app.world_mut().query::<&mut Resident>();
        let mut r = q.iter_mut(g.app.world_mut()).find(|r| r.id == 0).unwrap();
        r.visit_building = Some(1);
        r.activity_building = Some(1);
        r.task = "visit".into();
        assert!(g.remove_sandbox_building(1));
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_eq!(g.place("garden", 12, 5), "ok");
        let before = g.snapshot();
        assert!(!g.remove_sandbox_building(99));
        assert_eq!(g.snapshot(), before);
        let mut story = Game::new();
        assert_eq!(story.place("home", 5, 5), "ok");
        let before = story.snapshot();
        assert!(!story.remove_sandbox_building(0));
        assert_eq!(story.snapshot(), before);
    }
}
