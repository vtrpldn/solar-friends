//! Separate non-potable water and sealed waste cycles, measured in game minutes.
use super::*;

pub fn unused_day() -> i32 {
    -1
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Circular {
    pub waste: f32,
    pub greywater: f32,
    pub reclaimed: f32,
    pub biogas: f32,
    pub digestion: f32,
    pub filtration: f32,
    pub curing: f32,
    pub pending_compost: u32,
    pub auto_feed: bool,
    pub filter_water: bool,
    pub use_biogas: bool,
    pub toilet_visits: u32,
    pub batches: u32,
    pub water_reused: f32,
    pub banana_treatment: bool,
    pub waste_treated: f32,
}
impl Default for Circular {
    fn default() -> Self {
        Self {
            waste: 0.,
            greywater: 0.,
            reclaimed: 0.,
            biogas: 0.,
            digestion: 0.,
            filtration: 0.,
            curing: 0.,
            pending_compost: 0,
            auto_feed: true,
            filter_water: true,
            use_biogas: true,
            toilet_visits: 0,
            batches: 0,
            water_reused: 0.,
            banana_treatment: true,
            waste_treated: 0.,
        }
    }
}
pub fn household_at(v: &mut Village, owner: water::Owner, amount: f32) {
    let amount = f64::from(amount.max(0.));
    let room = water::local_room(v, owner, water::Class::Greywater);
    let allowed = if !sandbox::utilities(v) {
        amount
    } else {
        amount.min(room / 0.7)
    };
    let used = water::draw(v, owner, water::Class::Fresh, allowed);
    let created = used * 0.7;
    let delivered = water::produce(v, owner, water::Class::Greywater, created);
    if !sandbox::utilities(v) && created > delivered {
        water::sandbox_excess(v, water::Class::Greywater, created - delivered);
    }
}
pub fn washing_ready(v: &Village, owner: water::Owner, amount: f64) -> bool {
    washing_blocker(v, owner, amount).is_none()
}
pub fn washing_blocker(v: &Village, owner: water::Owner, amount: f64) -> Option<&'static str> {
    if water::local(v, owner, water::Class::Fresh) < amount {
        Some(
            "Waiting for fresh water delivered here. Reclaimed irrigation cannot be used for cooking or handwashing.",
        )
    } else if sandbox::utilities(v)
        && water::local_room(v, owner, water::Class::Greywater) < amount * 0.7
    {
        Some(
            "The local greywater buffer is full. Neighbours need to deliver a closed container to a reed bed or the neighbouring service point, or install a greywater line.",
        )
    } else {
        None
    }
}
pub fn usable_toilet(v: &Village, id: usize) -> bool {
    let owner = water::Owner::Building(id);
    washing_ready(v, owner, 1.)
        && (!sandbox::utilities(v) || water::local_room(v, owner, water::Class::Sewage) >= 1.)
}
#[cfg(test)]
pub fn household_water(v: &mut Village, amount: f32) {
    household_at(v, water::Owner::Camp, amount);
}
pub fn due(v: &Village, r: &Resident) -> bool {
    v.buildings.iter().any(|b| {
        b.kind == "eco_toilet"
            && b.progress >= 100.
            && b.next_visit <= v.minutes
            && usable_toilet(v, b.id)
    }) && v.minutes.rem_euclid(1440.) >= 450. + r.id as f32 * 45.
        && r.last_sanitation_day < (v.minutes / 1440.) as i32
}
pub fn use_toilet(v: &mut Village, r: &mut Resident) {
    let id = spacing::building(r, v);
    if !due(v, r) || (r.x - r.target_x).hypot(r.y - r.target_y) > 0.1 {
        return;
    }
    let Some(index) = v.buildings.iter().position(|b| {
        Some(b.id) == id
            && b.kind == "eco_toilet"
            && b.progress >= 100.
            && b.next_visit <= v.minutes
            && usable_toilet(v, b.id)
    }) else {
        return;
    };
    v.buildings[index].next_visit = v.minutes + 12.;
    r.last_sanitation_day = (v.minutes / 1440.) as i32;
    let owner = water::Owner::Building(v.buildings[index].id);
    let stored = water::produce(v, owner, water::Class::Sewage, 1.);
    if !sandbox::utilities(v) && stored < 1. {
        water::sandbox_excess(v, water::Class::Sewage, 1. - stored);
    }
    v.circular.toilet_visits = v.circular.toilet_visits.saturating_add(1);
    v.buildings[index].visits = v.buildings[index].visits.saturating_add(1);
    household_at(v, water::Owner::Building(v.buildings[index].id), 1.);
}
pub fn advance(v: &mut Village, minutes: f32) {
    processes::advance(v, minutes);
}
pub fn valid(v: &Village) -> bool {
    let c = &v.circular;
    if c.biogas + production::held_biogas(v) as f32 > 12. {
        return false;
    }
    let capacity = |class, legacy| {
        if v.version == 3 {
            legacy
        } else {
            water::storage_capacity(v, class) as f32 + 0.001
        }
    };
    [
        (c.waste, capacity(water::Class::Sewage, 80.)),
        (c.greywater, capacity(water::Class::Greywater, 120.)),
        (c.reclaimed, capacity(water::Class::Irrigation, 60.)),
        (c.biogas, 12.),
        (c.digestion, 480.),
        (c.filtration, 360.),
        (c.curing, 1440.),
    ]
    .iter()
    .all(|&(n, max)| n.is_finite() && (0.0..=max).contains(&n))
        && c.water_reused.is_finite()
        && c.water_reused >= 0.
        && c.waste_treated.is_finite()
        && c.waste_treated >= 0.
        && c.pending_compost <= 512
        && ((c.pending_compost == 0 && c.curing == 0.) || (c.pending_compost > 0 && c.curing > 0.))
}
#[wasm_bindgen]
impl Game {
    pub fn configure_banana_treatment(&mut self, enabled: bool) {
        self.app
            .world_mut()
            .resource_mut::<Village>()
            .circular
            .banana_treatment = enabled;
    }
    pub fn configure_sanitation(&mut self, auto_feed: bool, filter_water: bool, use_biogas: bool) {
        let mut v = self.app.world_mut().resource_mut::<Village>();
        v.circular.auto_feed = auto_feed;
        v.circular.filter_water = filter_water;
        v.circular.use_biogas = use_biogas;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn setup() -> Game {
        let mut g = Game::new();
        g.start_fixture_mode("sandbox");
        assert!(g.configure_sandbox_rules(false, true, true));
        for (kind, x, y) in [
            ("eco_toilet", 5, 5),
            ("biodigester", 8, 5),
            ("wetland", 12, 5),
            ("kitchen", 16, 5),
            ("garden", 19, 5),
        ] {
            assert_eq!(g.place(kind, x, y), "ok");
        }
        water::replenish(&mut g.app.world_mut().resource_mut::<Village>());
        g
    }
    #[test]
    fn toilets_require_arrival_handwashing_and_one_visit_per_resident_day() {
        let mut g = setup();
        let mut q = g.app.world_mut().query::<&Resident>();
        let mut r = q.iter(g.app.world()).find(|r| r.id == 0).unwrap().clone();
        let mut v = g.app.world().resource::<Village>().clone();
        interactions::start(&mut r, &v, 0, true);
        use_toilet(&mut v, &mut r);
        assert_eq!(v.circular.waste, 0.);
        r.x = r.target_x;
        r.y = r.target_y;
        let fresh = v.water;
        use_toilet(&mut v, &mut r);
        use_toilet(&mut v, &mut r);
        assert_eq!(v.circular.waste, 1.);
        assert_eq!(v.circular.toilet_visits, 1);
        assert_eq!(v.water, fresh - 1.);
        assert!((v.circular.greywater - 0.7).abs() < 0.001);
        v.minutes += 1440.;
        use_toilet(&mut v, &mut r);
        assert_eq!(v.circular.waste, 2.);
    }
    #[test]
    fn sealed_batches_pause_reload_finish_once_and_cure_before_fertilising() {
        let mut g = setup();
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            crate::water::fixture_liquid(&mut v, crate::water::Class::Sewage, 4.);
            crate::organics::fixture(&mut v, crate::economy::SCRAPS, 4);
            advance(&mut v, 1.);
            assert_eq!(v.circular.waste, 2.);
            assert_eq!(v.progress.scraps, 2);
            advance(&mut v, 240.);
            assert_eq!(v.circular.digestion, 240.);
        }
        let mut restored = Game::new();
        assert!(restored.restore(&g.snapshot()));
        restored.configure_sanitation(false, true, true);
        {
            let mut v = restored.app.world_mut().resource_mut::<Village>();
            advance(&mut v, 300.);
            assert_eq!(v.circular.digestion, 240.);
        }
        restored.configure_sanitation(true, true, true);
        let mut v = restored.app.world_mut().resource_mut::<Village>();
        advance(&mut v, 240.);
        assert_eq!(v.circular.biogas, 4.);
        assert_eq!(v.progress.compost, 0);
        assert_eq!(v.circular.pending_compost, 2);
        v.circular.auto_feed = false; // Curing is independent of new digester feed.
        advance(&mut v, 1439.);
        assert_eq!(v.progress.compost, 0);
        advance(&mut v, 1.);
        assert_eq!(v.progress.compost, 2);
        assert_eq!(v.circular.batches, 1);
        assert!(valid(&v));
    }
    #[test]
    fn wetland_water_is_never_drunk_and_gardens_use_it_before_freshwater() {
        let mut g = setup();
        let mut q = g.app.world_mut().query::<&Resident>();
        let mut r = q.iter(g.app.world()).next().unwrap().clone();
        let mut v = g.app.world().resource::<Village>().clone();
        crate::water::fixture_liquid(&mut v, crate::water::Class::Greywater, 24.);
        let fresh = v.water;
        advance(&mut v, 1.);
        advance(&mut v, 360.);
        assert_eq!(v.circular.reclaimed, 8.);
        assert_eq!(v.water, fresh);
        water::fixture_at(
            &mut v,
            water::Owner::Building(4),
            water::Class::Irrigation,
            4.,
        );
        interactions::start(&mut r, &v, 4, true);
        ecology::tend(&mut v, &r);
        ecology::tend(&mut v, &r);
        assert_eq!(v.circular.reclaimed, 6.);
        assert_eq!(v.water, fresh);
        crate::water::fixture_fresh(&mut v, 0.);
        crate::logistics::fixture_stock(&mut v, crate::economy::FOOD, (10.) as u32);
        assert!(!supplies::can_cook(&v));
        advance(&mut v, 1.);
        v.circular.filter_water = false;
        advance(&mut v, 360.);
        assert_eq!(v.circular.filtration, 360.);
    }
    #[test]
    fn gas_stretches_meals_and_full_outputs_do_not_spend_feedstock() {
        let g = setup();
        let mut v = g.app.world().resource::<Village>().clone();
        v.circular.biogas = 12.;
        crate::water::fixture_liquid(&mut v, crate::water::Class::Sewage, 4.);
        crate::organics::fixture(&mut v, crate::economy::SCRAPS, 4);
        advance(&mut v, 1.);
        assert_eq!(v.circular.digestion, 0.);
        assert_eq!(v.circular.waste, 4.);
        crate::logistics::fixture_stock(&mut v, crate::economy::FOOD, (20.) as u32);
        crate::logistics::fixture_stock(&mut v, crate::economy::MEALS, 0);
        supplies::fixture_cook(&mut v);
        assert_eq!(v.meals, 6);
        assert_eq!(v.circular.biogas, 11.);
        v.circular.use_biogas = false;
        supplies::fixture_cook(&mut v);
        assert_eq!(v.meals, 11);
        assert_eq!(v.circular.biogas, 11.);
    }
    #[test]
    fn corrupt_circular_saves_fail_without_changing_the_live_village() {
        let mut g = setup();
        let before = g.snapshot();
        for (key, value) in [
            ("reclaimed", 61.),
            ("biogas", -1.),
            ("digestion", 481.),
            ("curing", 1.),
            ("waste_treated", -1.),
        ] {
            let mut save: serde_json::Value = serde_json::from_str(&before).unwrap();
            save["village"]["circular"][key] = value.into();
            assert!(!g.restore(&save.to_string()));
            assert_eq!(g.snapshot(), before);
        }
    }
    #[test]
    fn banana_beds_conserve_waste_without_producing_water_food_or_fuel() {
        let mut g = setup();
        assert_eq!(g.place("banana_treatment", 8, 10), "ok");
        let mut v = g.app.world().resource::<Village>().clone();
        v.circular.auto_feed = false;
        v.circular.filter_water = false;
        crate::water::fixture_liquid(&mut v, crate::water::Class::Sewage, 7.);
        let outputs = (
            v.water,
            v.food,
            v.circular.reclaimed,
            v.circular.biogas,
            v.progress.compost,
        );
        advance(&mut v, 120.);
        assert_eq!(v.circular.waste, 6.5);
        assert_eq!(v.circular.waste_treated, 0.5);
        advance(&mut v, 1440.);
        assert_eq!(v.circular.waste, 0.5);
        advance(&mut v, 1440.);
        assert_eq!(v.circular.waste, 0.);
        assert_eq!(v.circular.waste_treated, 7.);
        assert_eq!(
            outputs,
            (
                v.water,
                v.food,
                v.circular.reclaimed,
                v.circular.biogas,
                v.progress.compost
            )
        );
        assert!(valid(&v));
    }
    #[test]
    fn banana_treatment_pauses_for_controls_and_building_work_and_survives_reload() {
        let mut g = setup();
        assert_eq!(g.place("banana_treatment", 8, 10), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.circular.auto_feed = false;
            crate::water::fixture_liquid(&mut v, crate::water::Class::Sewage, 4.);
            advance(&mut v, 240.);
        }
        g.configure_banana_treatment(false);
        let mut restored = Game::new();
        assert!(restored.restore(&g.snapshot()));
        assert_eq!(restored.snapshot(), g.snapshot());
        {
            let mut v = restored.app.world_mut().resource_mut::<Village>();
            advance(&mut v, 240.);
            assert_eq!(v.circular.waste, 3.);
        }
        restored.configure_banana_treatment(true);
        let id = restored
            .app
            .world()
            .resource::<Village>()
            .buildings
            .last()
            .unwrap()
            .id;
        assert_eq!(restored.queue_building_work(id, "move", 12, 10), "ok");
        let mut v = restored.app.world_mut().resource_mut::<Village>();
        advance(&mut v, 240.);
        assert_eq!(v.circular.waste, 3.);
        assert_eq!(v.circular.waste_treated, 1.);
    }
    #[test]
    fn multiple_banana_beds_share_the_same_waste_store_with_digesters() {
        let mut g = setup();
        for x in [8, 12] {
            assert_eq!(g.place("banana_treatment", x, 10), "ok");
        }
        let mut v = g.app.world().resource::<Village>().clone();
        crate::water::fixture_liquid(&mut v, crate::water::Class::Sewage, 3.);
        crate::organics::fixture(&mut v, crate::economy::SCRAPS, 2);
        advance(&mut v, 120.);
        assert_eq!(v.circular.waste, 0.);
        assert_eq!(v.circular.waste_treated, 1.);
        assert_eq!(v.circular.digestion, 480.);
        assert_eq!(v.progress.scraps, 0);
    }
}
