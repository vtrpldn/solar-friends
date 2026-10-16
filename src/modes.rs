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
    if !sandbox::utilities(v) {
        water::replenish(v);
    }
    if sandbox::logistics(v) {
        return;
    }
    let _ = logistics::receive(
        v,
        logistics::Owner::Camp,
        economy::FOOD,
        80u32.saturating_sub(economy::quantity(v, economy::FOOD)),
    );
    let _ = logistics::receive(
        v,
        logistics::Owner::Camp,
        economy::MEALS,
        20u32.saturating_sub(economy::quantity(v, economy::MEALS)),
    );
    v.economy.money = v.economy.money.max(10_000_000);
    for (material, target) in [(economy::TREE_STARTS, 8u32), (economy::BAMBOO_STARTS, 2u32)] {
        let missing = target.saturating_sub(economy::quantity(v, material));
        if missing > 0 {
            let _ = logistics::receive(v, logistics::Owner::Camp, material, missing);
        }
    }
    if v.buildings
        .iter()
        .any(|b| matches!(b.kind.as_str(), "goat_pasture" | "coop") && b.progress >= 100.)
    {
        let missing = 12u32.saturating_sub(economy::quantity(v, economy::FODDER));
        let _ = logistics::receive(v, logistics::Owner::Camp, economy::FODDER, missing);
    }
    let missing = 36u32.saturating_sub(economy::quantity(v, economy::TOOLS));
    if missing > 0 {
        let _ = logistics::receive(v, logistics::Owner::Camp, economy::TOOLS, missing);
    }
}

#[wasm_bindgen]
impl Game {
    pub fn remove_sandbox_building(&mut self, id: usize) -> bool {
        if self.app.world().resource::<Village>().mode != Mode::Sandbox {
            return false;
        }
        self.queue_building_work(id, "demolish", 0, 0) == "ok"
    }

    /// Starts a fresh mode; invalid input leaves the running village untouched.
    pub fn start_mode(&mut self, mode: &str) -> bool {
        self.initialise_mode(mode, true)
    }
}
impl Game {
    #[cfg(test)]
    pub(crate) fn start_fixture_mode(&mut self, mode: &str) -> bool {
        self.initialise_mode(mode, false)
    }
    fn initialise_mode(&mut self, mode: &str, founding: bool) -> bool {
        let mode = match mode {
            "story" => Mode::Story,
            "sandbox" => Mode::Sandbox,
            _ => return false,
        };
        *self = Self::new();
        let mut v = self.app.world_mut().resource_mut::<Village>();
        v.mode = mode;
        v.sandbox_rules = sandbox::Rules::default();
        v.skills.enabled = mode == Mode::Story;
        v.market.enabled = mode == Mode::Story;
        v.climate.enabled = mode == Mode::Story;
        v.maintenance.enabled = mode == Mode::Story;
        v.maintenance.automatic = mode == Mode::Story;
        if mode == Mode::Sandbox {
            v.maintenance = maintenance::State::default();
            v.events = vec!["An open clearing. Every possibility is yours to explore.".into()];
            v.wood = 100.;
            v.economy.stock[1..].fill(24);
            v.economy.stock[economy::TREE_STARTS] = 8;
            v.economy.stock[economy::FODDER] = 0;
            for i in [economy::MILK, economy::HONEY, economy::GOATS, economy::BEES] {
                v.economy.stock[i] = 0;
            }
            v.economy.stock[economy::BAMBOO_STARTS] = 2;
            v.logistics = None;
            logistics::initialise(&mut v);
            replenish(&mut v);
            v.simulation.materials = None;
            simulation::start_materials(&mut v);
        }
        if founding {
            founding::start(&mut v);
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
        assert!(g.start_fixture_mode("sandbox"));
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
        crate::logistics::fixture_stock(
            &mut g.app.world_mut().resource_mut::<Village>(),
            crate::economy::FOOD,
            (0.) as u32,
        );
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
        assert!(!g.start_fixture_mode("invalid"));
        assert_eq!(g.snapshot(), saved);
    }

    #[test]
    fn sandbox_removal_cleans_visits_and_keeps_recovered_battery_plots_occupied() {
        let mut g = Game::new();
        g.start_fixture_mode("sandbox");
        assert_eq!(g.place("solar_farm", 5, 5), "ok");
        assert_eq!(g.place("home", 12, 5), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            crate::power::fixtures::charge(&mut v, 20.);
        }
        assert!(g.remove_sandbox_building(0));
        assert_eq!(g.app.world().resource::<Village>().power.stored, 20.);
        let queued = g.snapshot();
        assert!(g.restore(&queued));
        crate::building_work::work(&mut g.app.world_mut().resource_mut::<Village>(), 0, 18.);
        assert_eq!(g.app.world().resource::<Village>().power.stored, 20.);
        assert!(
            g.app
                .world()
                .resource::<Village>()
                .power
                .network
                .nodes
                .iter()
                .any(|n| n.owner == crate::electricity::Owner::Ground && n.charge == 20.)
        );
        let mut q = g.app.world_mut().query::<&mut Resident>();
        let mut r = q.iter_mut(g.app.world_mut()).find(|r| r.id == 0).unwrap();
        r.visit_building = Some(1);
        r.activity_building = Some(1);
        r.task = "visit".into();
        r.activity_store = None;
        assert!(g.remove_sandbox_building(1));
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_ne!(g.place("garden", 12, 5), "ok");
        crate::building_work::work(&mut g.app.world_mut().resource_mut::<Village>(), 1, 18.);
        assert!(g.place("garden", 12, 5).contains("recovered battery"));
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
