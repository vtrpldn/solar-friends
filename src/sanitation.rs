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
        }
    }
}
pub fn household_water(v: &mut Village, amount: f32) {
    let used = amount.min(v.water);
    v.water -= used;
    v.circular.greywater = (v.circular.greywater + used * 0.7).min(120.);
}
pub fn irrigation_water(v: &Village) -> f32 {
    if v.circular.reclaimed >= 2. {
        v.circular.reclaimed
    } else {
        v.water
    }
}
pub fn due(v: &Village, r: &Resident) -> bool {
    v.buildings
        .iter()
        .any(|b| b.kind == "eco_toilet" && b.progress >= 100. && b.next_visit <= v.minutes)
        && v.minutes.rem_euclid(1440.) >= 450. + r.id as f32 * 45.
        && r.last_sanitation_day < (v.minutes / 1440.) as i32
        && v.circular.waste < 80.
        && v.water >= 1.
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
    }) else {
        return;
    };
    v.buildings[index].next_visit = v.minutes + 12.;
    r.last_sanitation_day = (v.minutes / 1440.) as i32;
    v.circular.waste += 1.;
    v.circular.toilet_visits = v.circular.toilet_visits.saturating_add(1);
    v.buildings[index].visits = v.buildings[index].visits.saturating_add(1);
    household_water(v, 1.);
}
fn count(v: &Village, kind: &str) -> f32 {
    v.buildings
        .iter()
        .filter(|b| b.kind == kind && b.progress >= 100.)
        .count() as f32
}
pub fn advance(v: &mut Village, minutes: f32) {
    // Curing continues in a sealed store even if the digester is removed.
    if v.circular.pending_compost > 0 {
        v.circular.curing = (v.circular.curing - minutes).max(0.);
        if v.circular.curing == 0. {
            v.progress.compost = v
                .progress
                .compost
                .saturating_add(v.circular.pending_compost);
            v.circular.pending_compost = 0;
            event(
                v,
                "Digestate has finished curing. Two compost are ready for the soil.",
            );
        }
    }
    let digesters = count(v, "biodigester");
    if digesters > 0. && v.circular.auto_feed {
        if v.circular.digestion > 0. {
            v.circular.digestion = (v.circular.digestion - minutes * digesters).max(0.);
            if v.circular.digestion == 0. {
                v.circular.biogas += 4.;
                v.circular.pending_compost = 2;
                v.circular.curing = 1440.;
                v.circular.batches = v.circular.batches.saturating_add(1);
                event(
                    v,
                    "The biodigester made cooking gas. Its digestate now needs a full day to cure.",
                );
            }
        } else if v.circular.waste >= 2.
            && v.progress.scraps >= 2
            && v.circular.biogas <= 8.
            && v.circular.pending_compost == 0
        {
            v.circular.waste -= 2.;
            v.progress.scraps -= 2;
            v.circular.digestion = 480.;
        }
    }
    let wetlands = count(v, "wetland");
    if wetlands > 0. && v.circular.filter_water {
        if v.circular.filtration > 0. {
            v.circular.filtration = (v.circular.filtration - minutes * wetlands).max(0.);
            if v.circular.filtration == 0. {
                v.circular.reclaimed += 8.;
                v.circular.water_reused += 8.;
            }
        } else if v.circular.greywater >= 12. && v.circular.reclaimed <= 52. {
            v.circular.greywater -= 12.;
            v.circular.filtration = 360.;
        }
    }
}
pub fn valid(v: &Village) -> bool {
    let c = &v.circular;
    [
        (c.waste, 80.),
        (c.greywater, 120.),
        (c.reclaimed, 60.),
        (c.biogas, 12.),
        (c.digestion, 480.),
        (c.filtration, 360.),
        (c.curing, 1440.),
    ]
    .iter()
    .all(|&(n, max)| n.is_finite() && (0.0..=max).contains(&n))
        && c.water_reused.is_finite()
        && c.water_reused >= 0.
        && matches!(c.pending_compost, 0 | 2)
        && ((c.pending_compost == 0 && c.curing == 0.) || (c.pending_compost == 2 && c.curing > 0.))
        && (c.digestion == 0. || (c.pending_compost == 0 && c.biogas <= 8.))
        && (c.filtration == 0. || c.reclaimed <= 52.)
}
#[wasm_bindgen]
impl Game {
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
        g.start_mode("sandbox");
        for (kind, x, y) in [
            ("eco_toilet", 5, 5),
            ("biodigester", 8, 5),
            ("wetland", 12, 5),
            ("kitchen", 16, 5),
            ("garden", 19, 5),
        ] {
            assert_eq!(g.place(kind, x, y), "ok");
        }
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
            v.circular.waste = 4.;
            v.progress.scraps = 4;
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
        v.circular.greywater = 24.;
        let fresh = v.water;
        advance(&mut v, 1.);
        advance(&mut v, 360.);
        assert_eq!(v.circular.reclaimed, 8.);
        assert_eq!(v.water, fresh);
        interactions::start(&mut r, &v, 4, true);
        ecology::tend(&mut v, &r);
        ecology::tend(&mut v, &r);
        assert_eq!(v.circular.reclaimed, 6.);
        assert_eq!(v.water, fresh);
        v.water = 0.;
        v.food = 10.;
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
        v.circular.waste = 4.;
        v.progress.scraps = 4;
        advance(&mut v, 1.);
        assert_eq!(v.circular.digestion, 0.);
        assert_eq!(v.circular.waste, 4.);
        v.food = 20.;
        v.meals = 0;
        supplies::cook(&mut v);
        assert_eq!(v.meals, 6);
        assert_eq!(v.circular.biogas, 11.);
        v.circular.use_biogas = false;
        supplies::cook(&mut v);
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
        ] {
            let mut save: serde_json::Value = serde_json::from_str(&before).unwrap();
            save["village"]["circular"][key] = value.into();
            assert!(!g.restore(&save.to_string()));
            assert_eq!(g.snapshot(), before);
        }
    }
}
