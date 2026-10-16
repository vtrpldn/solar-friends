//! Earned Story outcomes use actual work and consecutive village observations.
use crate::*;
pub const PANTRY: usize = 0;
pub const DIET: usize = 1;
pub const SERVICES: usize = 2;
pub const NIGHT: usize = 3;
pub const DRY: usize = 4;
pub const TARGETS: [f32; 5] = [360., 1440., 720., 240., 720.];
pub const HOUSING_BUDGET: i64 = 120_000;
const MONEY_LIMIT: i64 = 9_007_199_254_740_991;
#[derive(Clone, Serialize, Deserialize)]
pub struct Housing {
    pub building: usize,
    pub started: f32,
    pub spending: i64,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct State {
    pub schema: u32,
    pub last_sample: Option<f32>,
    pub current: [f32; 5],
    pub best: [f32; 5],
    pub qualifies: [bool; 5],
    pub food_at_stores: u32,
    pub food_access: bool,
    pub services_ready: bool,
    pub leisure_day: bool,
    pub soil_improved: bool,
    pub order_received: bool,
    pub resources_sold: bool,
    pub shortest_delivery: Option<f32>,
    pub net_spending: i64,
    pub housing: Vec<Housing>,
    pub best_housing_spend: Option<i64>,
}
impl Default for State {
    fn default() -> Self {
        Self {
            schema: 1,
            last_sample: None,
            current: [0.; 5],
            best: [0.; 5],
            qualifies: [false; 5],
            food_at_stores: 0,
            food_access: false,
            services_ready: false,
            leisure_day: false,
            soil_improved: false,
            order_received: false,
            resources_sold: false,
            shortest_delivery: None,
            net_spending: 0,
            housing: vec![],
            best_housing_spend: None,
        }
    }
}
pub fn earned(v: &Village, index: usize) -> bool {
    v.progress.outcomes.best[index] >= TARGETS[index]
}
pub fn payment(v: &mut Village, amount: i64) {
    if v.mode == modes::Mode::Story {
        v.progress.outcomes.net_spending =
            (v.progress.outcomes.net_spending.saturating_add(amount))
                .clamp(-MONEY_LIMIT, MONEY_LIMIT);
    }
}
pub fn refund(v: &mut Village, amount: i64) {
    payment(v, amount.saturating_neg());
}
pub fn start_housing(v: &mut Village, building: usize) {
    if v.mode != modes::Mode::Story || v.buildings.iter().filter(|b| b.kind == "home").count() < 2 {
        return;
    }
    let s = &mut v.progress.outcomes;
    s.housing.push(Housing {
        building,
        started: v.minutes,
        spending: s.net_spending,
    });
}
pub fn delivered(v: &mut Village, owner: logistics::Owner, material: usize, started: Option<f32>) {
    if v.mode != modes::Mode::Story || material > economy::TOOLS {
        return;
    }
    if !matches!(owner,logistics::Owner::Site(id) if v.buildings.iter().any(|b|b.id==id&&b.progress<100.))
    {
        return;
    }
    let Some(time) = started.map(|t| v.minutes - t).filter(|t| *t > 0.) else {
        return;
    };
    let s = &mut v.progress.outcomes;
    s.shortest_delivery = Some(s.shortest_delivery.map_or(time, |old| old.min(time)));
}
fn services(v: &Village) -> bool {
    let homes: Vec<_> = v
        .buildings
        .iter()
        .filter(|b| {
            b.kind == "home"
                && b.progress >= 100.
                && (0..5).any(|id| shelter(v, id).is_some_and(|h| h.id == b.id))
        })
        .collect();
    let kitchens: Vec<_> = v
        .buildings
        .iter()
        .filter(|b| b.kind == "kitchen" && b.progress >= 100.)
        .collect();
    !homes.is_empty()
        && !kitchens.is_empty()
        && homes
            .into_iter()
            .chain(kitchens)
            .all(|b| sanitation::washing_ready(v, water::Owner::Building(b.id), 1.))
        && v.buildings
            .iter()
            .filter(|b| b.kind == "eco_toilet" && b.progress >= 100.)
            .all(|b| sanitation::usable_toilet(v, b.id))
}
pub fn observe(v: &mut Village, people: &[Resident]) {
    if v.mode != modes::Mode::Story {
        return;
    }
    // Work completion and refunds are not deferred to the observation interval.
    let mut remaining = vec![];
    for h in std::mem::take(&mut v.progress.outcomes.housing) {
        if let Some(b) = v
            .buildings
            .iter()
            .find(|b| b.id == h.building && b.kind == "home")
        {
            if b.progress >= 100. {
                let spend = (v.progress.outcomes.net_spending - h.spending).clamp(0, MONEY_LIMIT);
                let s = &mut v.progress.outcomes;
                s.best_housing_spend =
                    Some(s.best_housing_spend.map_or(spend, |old| old.min(spend)));
            } else {
                remaining.push(h);
            }
        }
    }
    v.progress.outcomes.housing = remaining;
    v.progress.outcomes.soil_improved |= v
        .restoration
        .iter()
        .any(|j| j.finished.is_some() && !j.cancelled);
    v.progress.outcomes.order_received |= v.economy.orders.iter().any(|o| o.status == "delivered");
    if !v.progress.outcomes.leisure_day {
        v.progress.outcomes.leisure_day = v.simulation.days.iter().any(|day| {
            let start = f64::from(day.day) * 1440.;
            day.first <= start + 0.001
                && day.last >= start + 1440. - 0.001
                && day.residents.iter().all(|r| {
                    let awake = r[0] + r[1] + r[3] + r[4] + r[5] + r[6];
                    awake >= 120. && (r[4] + r[5] + r[6]) / awake > 0.5
                })
        });
    }
    let healthy =
        v.arrived && people.len() == 5 && people.iter().all(|r| r.hunger <= 65. && r.energy >= 25.);
    // Urgent needs or an empty owned pantry invalidate a period immediately,
    // even between the more expensive route/access observations.
    let owned = food::owned_portions(v);
    for (index, minimum) in [(PANTRY, 12), (DIET, 8), (DRY, 6)] {
        if !healthy || owned < minimum {
            v.progress.outcomes.current[index] = 0.;
            v.progress.outcomes.qualifies[index] = false;
        }
    }
    if v.progress
        .outcomes
        .last_sample
        .is_some_and(|last| v.minutes - last < 15.)
    {
        return;
    }
    let (pantry, access) = food::observed_access(v, people);
    let power = power::supply(v);
    let night = power.darkness > 0.5
        && v.buildings.iter().any(|b| {
            b.kind == "streetlight"
                && power
                    .connections
                    .iter()
                    .any(|c| c.id == b.id && c.enabled && c.connected && c.light_level >= 0.99)
        });
    let services_ready = services(v);
    let housed = v
        .buildings
        .iter()
        .filter(|b| b.kind == "home" && b.progress >= 100.)
        .count()
        >= 2;
    let qualifies = [
        healthy && access && pantry >= 12,
        healthy && access && pantry >= 8,
        healthy && services_ready,
        night,
        healthy
            && access
            && pantry >= 6
            && services_ready
            && housed
            && people.iter().all(|r| r.social >= 25.)
            && v.climate.enabled
            && climate::day(v, (v.minutes / 1440.) as u32).season == "dry",
    ];
    let s = &mut v.progress.outcomes;
    let elapsed = s.last_sample.map_or(0., |last| v.minutes - last);
    for i in 0..5 {
        s.current[i] = if qualifies[i] && s.qualifies[i] && elapsed > 0. && elapsed <= 30. {
            (s.current[i] + elapsed).min(TARGETS[i])
        } else {
            0.
        };
        s.best[i] = s.best[i].max(s.current[i]);
        s.qualifies[i] = qualifies[i];
    }
    s.last_sample = Some(v.minutes);
    s.food_at_stores = pantry;
    s.food_access = access;
    s.services_ready = services_ready;
}
pub fn valid(v: &Village) -> bool {
    let s = &v.progress.outcomes;
    s.schema == 1
        && s.net_spending.unsigned_abs() <= MONEY_LIMIT as u64
        && s.housing.len() <= 676
        && s.last_sample
            .is_none_or(|n| n.is_finite() && n >= 0. && n <= v.minutes)
        && s.best_housing_spend
            .is_none_or(|n| (0..=MONEY_LIMIT).contains(&n))
        && s.shortest_delivery
            .is_none_or(|n| n.is_finite() && n > 0. && n <= v.minutes)
        && (0..5).all(|i| {
            s.current[i].is_finite()
                && s.best[i].is_finite()
                && (0.0..=TARGETS[i]).contains(&s.best[i])
                && s.current[i] >= 0.
                && s.current[i] <= s.best[i]
                && (s.current[i] == 0. || s.qualifies[i])
        })
        && s.housing.iter().enumerate().all(|(i, h)| {
            h.started.is_finite()
                && h.started >= 0.
                && h.started <= v.minutes
                && h.spending.unsigned_abs() <= MONEY_LIMIT as u64
                && v.buildings
                    .iter()
                    .any(|b| b.id == h.building && b.kind == "home")
                && s.housing[..i].iter().all(|old| old.building != h.building)
        })
}

pub fn report(v: &Village) -> serde_json::Value {
    serde_json::json!({"building_paths":progression::BUILDINGS,"state":v.progress.outcomes,"observation_minutes":15,"target_minutes":TARGETS,"housing_budget":HOUSING_BUDGET,"note":"Consecutive quarter-hour observations credit the best earned period. Current periods restart after a lapse; earlier earned periods remain. Net housing spending excludes salaries and sales, includes refunds and retains existing starting materials."})
}
#[wasm_bindgen]
impl Game {
    pub fn story_outcomes_report(&self) -> String {
        report(self.app.world().resource::<Village>()).to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn scene() -> (Game, Village, Vec<Resident>) {
        let mut g = Game::new();
        assert!(g.start_mode("sandbox"));
        for (kind, x, y) in [("home", 6, 8), ("home", 10, 8), ("kitchen", 13, 10)] {
            assert_eq!(g.place(kind, x, y), "ok");
        }
        let saved: Save = serde_json::from_str(&g.snapshot()).unwrap();
        let mut v = saved.village;
        v.mode = modes::Mode::Story;
        v.arrived = true;
        v.minutes = 600.;
        logistics::fixture_stock(&mut v, economy::FOOD, 100);
        logistics::fixture_stock(&mut v, economy::MEALS, 8);
        water::fixture_fresh(&mut v, 50.);
        for id in 0..3 {
            water::fixture_at(&mut v, water::Owner::Building(id), water::Class::Fresh, 4.);
        }
        let people = saved
            .residents
            .into_iter()
            .map(|mut r| {
                r.trip = None;
                r.task = "idle".into();
                r.remaining = 0.;
                r.requested = false;
                r.hunger = 5.;
                r.energy = 90.;
                r.social = 90.;
                r.last_meal_slot = 0;
                r.x = CAMP.0 + (r.id as f32 - 2.) * 0.8;
                r.y = CAMP.1;
                r.target_x = r.x;
                r.target_y = r.y;
                r
            })
            .collect();
        (g, v, people)
    }
    fn install(g: &mut Game, v: Village, people: Vec<Resident>) {
        *g.app.world_mut().resource_mut::<Village>() = v;
        let mut q = g.app.world_mut().query::<&mut Resident>();
        for mut r in q.iter_mut(g.app.world_mut()) {
            *r = people[r.id].clone();
        }
    }
    #[test]
    fn observations_need_consecutive_real_periods_and_retain_earlier_success() {
        let (_, mut v, people) = scene();
        observe(&mut v, &people);
        assert_eq!(v.progress.outcomes.current[PANTRY], 0.);
        for _ in 0..24 {
            v.minutes += 15.;
            observe(&mut v, &people);
        }
        assert!(earned(&v, PANTRY));
        assert!(v.progress.outcomes.food_access);
        let best = v.progress.outcomes.best[PANTRY];
        let mut hungry = people.clone();
        hungry[0].hunger = 80.;
        v.minutes += 1.;
        observe(&mut v, &hungry);
        assert_eq!(v.progress.outcomes.current[PANTRY], 0.);
        assert_eq!(v.progress.outcomes.best[PANTRY], best);
        v.minutes += 60.;
        observe(&mut v, &people);
        assert_eq!(
            v.progress.outcomes.current[PANTRY], 0.,
            "A clock gap cannot earn a missing hour"
        );
        assert!(earned(&v, PANTRY));
    }
    #[test]
    fn claimed_food_and_eggs_are_not_free_pantry_portions() {
        let (_, mut v, mut people) = scene();
        logistics::fixture_stock(&mut v, economy::FOOD, 12);
        logistics::fixture_stock(&mut v, economy::MEALS, 0);
        logistics::fixture_stock(&mut v, economy::EGGS, 20);
        assign(&mut people[0], &v, "eat", "Eating.", false);
        workforce::refresh(&mut v, people.iter());
        let (free, access) = food::observed_access(&v, &people);
        assert_eq!(free, 11);
        assert!(access);
        observe(&mut v, &people);
        v.minutes += 15.;
        observe(&mut v, &people);
        assert_eq!(v.progress.outcomes.current[PANTRY], 0.);
        assert_eq!(v.progress.outcomes.food_at_stores, 11);
    }
    #[test]
    fn dairy_and_honey_are_observed_as_real_food() {
        for material in [economy::MILK, economy::HONEY] {
            let (_, mut v, people) = scene();
            logistics::fixture_stock(&mut v, economy::FOOD, 0);
            logistics::fixture_stock(&mut v, economy::MEALS, 0);
            logistics::fixture_stock(&mut v, material, 12);
            assert_eq!(food::observed_access(&v, &people), (12, true));
            observe(&mut v, &people);
            v.minutes += 15.;
            observe(&mut v, &people);
            assert_eq!(v.progress.outcomes.current[PANTRY], 15.);
        }
    }
    #[test]
    fn food_that_will_expire_before_a_meal_is_not_observed_as_accessible() {
        let (_, mut v, people) = scene();
        for store in &mut v.logistics.as_mut().unwrap().stores {
            for lot in &mut store.food_lots {
                lot.expires = v.minutes + 1.;
            }
        }
        assert_eq!(food::observed_access(&v, &people), (0, false));
        observe(&mut v, &people);
        assert!(!v.progress.outcomes.food_access);
    }
    #[test]
    fn local_services_require_real_fresh_water_and_waste_space() {
        let (_, mut v, people) = scene();
        assert!(services(&v));
        water::draw(&mut v, water::Owner::Building(2), water::Class::Fresh, 10.);
        assert!(!services(&v));
        water::fixture_at(&mut v, water::Owner::Building(2), water::Class::Fresh, 4.);
        let tank = v
            .water_supply
            .tanks
            .iter_mut()
            .find(|p| p.owner == water::Owner::Building(2))
            .unwrap();
        tank.water[water::Class::Greywater.index()] =
            tank.capacity[water::Class::Greywater.index()];
        assert!(!services(&v));
        observe(&mut v, &people);
        assert!(!v.progress.outcomes.services_ready);
    }
    #[test]
    fn dry_outcome_requires_beds_food_and_services_in_the_same_period() {
        let (_, mut v, people) = scene();
        v.climate.enabled = true;
        let day = (21..84)
            .find(|d| climate::day(&v, *d).season == "dry")
            .unwrap();
        v.minutes = day as f32 * 1440. + 600.;
        logistics::fixture_stock(&mut v, economy::FOOD, 40);
        logistics::fixture_stock(&mut v, economy::MEALS, 8);
        observe(&mut v, &people);
        v.minutes += 15.;
        observe(&mut v, &people);
        assert_eq!(v.progress.outcomes.current[DRY], 15.);
        v.buildings[1].progress = 0.;
        v.minutes += 15.;
        observe(&mut v, &people);
        assert_eq!(v.progress.outcomes.current[DRY], 0.);
        v.buildings[1].progress = 100.;
        water::draw(&mut v, water::Owner::Building(2), water::Class::Fresh, 10.);
        v.minutes += 15.;
        observe(&mut v, &people);
        assert_eq!(v.progress.outcomes.current[DRY], 0.);
    }
    #[test]
    fn a_partial_or_busy_day_cannot_claim_majority_leisure() {
        let (_, mut v, people) = scene();
        v.minutes = 1440.;
        v.simulation.days = vec![simulation::Day {
            day: 0,
            first: 600.,
            last: 1440.,
            residents: [[0., 0., 0., 0., 0., 0., 840., 0.]; 5],
        }];
        observe(&mut v, &people);
        assert!(!v.progress.outcomes.leisure_day);
        v.simulation.days[0] = simulation::Day {
            day: 0,
            first: 0.,
            last: 1440.,
            residents: [[0., 600., 0., 0., 0., 0., 360., 480.]; 5],
        };
        observe(&mut v, &people);
        assert!(!v.progress.outcomes.leisure_day);
        for row in &mut v.simulation.days[0].residents {
            row[1] = 360.;
            row[6] = 600.;
        }
        observe(&mut v, &people);
        assert!(v.progress.outcomes.leisure_day);
    }
    #[test]
    fn the_real_tick_samples_and_a_partial_window_continues_exactly() {
        let (mut g, v, people) = scene();
        install(&mut g, v, people);
        for _ in 0..240 {
            g.tick(0.25);
        }
        let saved = g.snapshot();
        let mut copy = Game::new();
        assert!(copy.restore(&saved));
        assert_eq!(copy.snapshot(), saved);
        for _ in 0..300 {
            g.tick(0.25);
            copy.tick(0.25);
        }
        assert_eq!(copy.snapshot(), g.snapshot());
        let s: Save = serde_json::from_str(&g.snapshot()).unwrap();
        assert!(
            earned(&s.village, PANTRY),
            "Actual resident routines keep the observed reserve for six hours"
        );
        assert!(valid(&s.village));
    }
    #[test]
    fn reports_do_not_advance_observations_and_bad_windows_are_atomic() {
        let (mut g, mut v, people) = scene();
        observe(&mut v, &people);
        install(&mut g, v, people);
        let saved = g.snapshot();
        g.story_outcomes_report();
        g.simulation_report();
        assert_eq!(g.snapshot(), saved);
        for (field, value) in [
            ("current", serde_json::json!([361., 0., 0., 0., 0.])),
            ("best", serde_json::json!([0., 0., 0., 0., 721.])),
        ] {
            let mut bad: serde_json::Value = serde_json::from_str(&saved).unwrap();
            bad["village"]["progress"]["outcomes"][field] = value;
            assert!(!g.restore(&bad.to_string()));
            assert_eq!(g.snapshot(), saved);
        }
        let mut bad: serde_json::Value = serde_json::from_str(&saved).unwrap();
        bad["village"]["progress"]["outcomes"]["net_spending"] = serde_json::json!(i64::MIN);
        assert!(!g.restore(&bad.to_string()));
        assert_eq!(g.snapshot(), saved);
    }
    #[test]
    fn paid_orders_refund_once_and_sales_or_salary_cannot_hide_spending() {
        let (mut g, v, people) = scene();
        install(&mut g, v, people);
        let mut basket = [0; economy::COUNT];
        basket[0] = 1;
        assert_eq!(
            g.order_supplies(&serde_json::to_string(&basket).unwrap()),
            "ok"
        );
        let v = g.app.world().resource::<Village>();
        let order = v.economy.orders.last().unwrap().clone();
        assert_eq!(v.progress.outcomes.net_spending, order.paid);
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.economy.outside_committed_days[0] = 0;
            economy::finish_outside(&mut v, 0);
            assert_eq!(v.progress.outcomes.net_spending, order.paid);
        }
        assert_eq!(g.sell_material(0, 1), "ok");
        assert_eq!(
            g.app
                .world()
                .resource::<Village>()
                .progress
                .outcomes
                .net_spending,
            order.paid
        );
        assert_eq!(g.cancel_order(order.id), "ok");
        assert_eq!(
            g.app
                .world()
                .resource::<Village>()
                .progress
                .outcomes
                .net_spending,
            0
        );
        let saved = g.snapshot();
        assert_ne!(g.cancel_order(order.id), "ok");
        assert_eq!(g.snapshot(), saved);
    }
    #[test]
    fn housing_measures_actual_spending_since_placement_without_income_offsets() {
        let mut g = Game::new();
        assert_eq!(g.place("home", 8, 8), "ok");
        assert!(
            g.app
                .world()
                .resource::<Village>()
                .progress
                .outcomes
                .housing
                .is_empty()
        );
        logistics::fixture_finish(&mut g.app.world_mut().resource_mut::<Village>(), 0);
        assert_eq!(g.place("home", 12, 7), "ok");
        let saved: Save = serde_json::from_str(&g.snapshot()).unwrap();
        let people = saved.residents;
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert_eq!(v.progress.outcomes.housing.len(), 1);
        payment(&mut v, 80000);
        refund(&mut v, 10000);
        logistics::fixture_finish(&mut v, 1);
        observe(&mut v, &people);
        assert_eq!(v.progress.outcomes.best_housing_spend, Some(70000));
        assert!(v.progress.outcomes.housing.is_empty());
        assert!(valid(&v));
    }
    #[test]
    fn short_deliveries_require_an_actual_completed_construction_leg() {
        let (mut g, mut v, _) = scene();
        *g.app.world_mut().resource_mut::<Village>() = v;
        assert_eq!(g.place("garden", 18, 18), "ok");
        v = g.app.world().resource::<Village>().clone();
        delivered(&mut v, logistics::Owner::Camp, 0, Some(580.));
        assert!(v.progress.outcomes.shortest_delivery.is_none());
        delivered(&mut v, logistics::Owner::Site(3), economy::FOOD, Some(580.));
        assert!(v.progress.outcomes.shortest_delivery.is_none());
        delivered(&mut v, logistics::Owner::Site(3), 0, None);
        assert!(v.progress.outcomes.shortest_delivery.is_none());
        delivered(&mut v, logistics::Owner::Site(3), 0, Some(580.));
        assert_eq!(v.progress.outcomes.shortest_delivery, Some(20.));
    }
}
