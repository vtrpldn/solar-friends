//! Bounded learning follows useful completed transactions, never elapsed idling.
use crate::*;
use std::collections::BTreeMap;

pub const COUNT: usize = 6;
pub const MAX: u16 = 160;
pub const LABELS: [&str; COUNT] = [
    "Building",
    "Hauling",
    "Growing",
    "Cooking",
    "Making",
    "Equipment care",
];
#[derive(Clone, Copy)]
pub enum Skill {
    Building,
    Logistics,
    Farming,
    Cooking,
    Craft,
    Care,
}
#[derive(Clone, Default, Serialize, Deserialize)]
pub struct Person {
    pub experience: [u16; COUNT],
    pub today: [u8; COUNT],
    pub day: u32,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct State {
    pub schema: u32,
    pub enabled: bool,
    pub people: BTreeMap<usize, Person>,
}
impl Default for State {
    fn default() -> Self {
        Self {
            schema: 2,
            enabled: true,
            people: (0..5).map(|id| (id, Person::default())).collect(),
        }
    }
}
pub fn matches_residents(v: &Village, residents: &[Resident]) -> bool {
    let mut seen = std::collections::HashSet::new();
    v.skills.people.len() == residents.len()
        && residents
            .iter()
            .all(|r| v.skills.people.contains_key(&r.id) && seen.insert(r.id))
}
/// Only the decoder calls this for supported older save versions.
pub fn migrate(raw: &mut serde_json::Value) -> bool {
    if raw["village"]["skills"].is_null() {
        return true;
    }
    let skills = &mut raw["village"]["skills"];
    if skills["schema"] != 1 {
        return true;
    }
    let Some(people) = skills["people"].as_array() else {
        return false;
    };
    if people.len() != 5 {
        return false;
    }
    skills["people"] = serde_json::Value::Object(
        people
            .iter()
            .enumerate()
            .map(|(id, p)| (id.to_string(), p.clone()))
            .collect(),
    );
    skills["schema"] = 2.into();
    true
}

pub fn task(task: &str) -> Option<Skill> {
    Some(match task {
        "build" | "building_work" => Skill::Building,
        "haul" | "water" => Skill::Logistics,
        "garden" | "gather" | "restore" | "compost" => Skill::Farming,
        "cook" => Skill::Cooking,
        "source" | "prepare" | "craft" => Skill::Craft,
        "utility" => Skill::Care,
        _ => return None,
    })
}
pub fn level(xp: u16) -> u8 {
    [12, 32, 60, 100, 160].iter().filter(|&&n| xp >= n).count() as u8
}
pub fn factor(v: &Village, resident: usize, skill: Skill) -> f32 {
    if !v.skills.enabled {
        return 1.;
    }
    1. + v.skills.people.get(&resident).map_or(0., |p| {
        f32::from(level(p.experience[skill as usize])) * 0.03
    })
}
pub fn award(v: &mut Village, resident: usize, skill: Skill, points: u8) {
    if !v.skills.enabled || points == 0 {
        return;
    }
    let Some(p) = v.skills.people.get_mut(&resident) else {
        return;
    };
    let day = (v.minutes / 1440.) as u32;
    if p.day != day {
        p.day = day;
        p.today = [0; COUNT];
    }
    let i = skill as usize;
    let n = points
        .min(6u8.saturating_sub(p.today[i]))
        .min(12u8.saturating_sub(p.today.iter().sum()));
    let n = u16::from(n).min(MAX - p.experience[i]);
    p.experience[i] += n;
    p.today[i] += n as u8;
}
pub fn valid(v: &Village) -> bool {
    v.skills.schema == 2
        && v.skills.people.values().all(|p| {
            p.day <= (v.minutes / 1440.) as u32
                && p.experience.iter().all(|&n| n <= MAX)
                && p.today.iter().all(|&n| n <= 6)
                && p.today.iter().sum::<u8>() <= 12
                && p.today
                    .iter()
                    .zip(p.experience)
                    .all(|(&n, xp)| u16::from(n) <= xp)
        })
}
pub fn view(v: &Village) -> serde_json::Value {
    let people: Vec<_> =
        v.skills
            .people
            .iter()
            .map(|(id, p)| {
                let current_day = p.day == (v.minutes / 1440.) as u32;
                let entries: Vec<_> = p.experience.iter().enumerate().map(|(i,&xp)| {
            let rank = level(xp);
            let next = [12,32,60,100,160].get(rank as usize).copied();
            serde_json::json!({"name":LABELS[i],"experience":xp,"level":rank,"next":next,
                "bonus_percent":if v.skills.enabled {rank*3} else {0},
                "enough_today":current_day && (p.today[i]>=6 || p.today.iter().sum::<u8>()>=12)})
        }).collect();
                serde_json::json!({"id":id,"skills":entries})
            })
            .collect();
    serde_json::json!({"enabled":v.skills.enabled,"daily_domain_limit":6,"daily_total_limit":12,"maximum_bonus":15,"people":people})
}
#[wasm_bindgen]
impl Game {
    pub fn set_resident_learning(&mut self, enabled: bool) {
        self.app
            .world_mut()
            .resource_mut::<Village>()
            .skills
            .enabled = enabled;
    }
    pub fn skills_report(&self) -> String {
        view(self.app.world().resource::<Village>()).to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn person(g: &mut Game) -> Resident {
        let mut q = g.app.world_mut().query::<&Resident>();
        q.iter(g.app.world()).find(|r| r.id == 0).unwrap().clone()
    }
    fn kitchen() -> (Game, Resident) {
        let mut g = Game::new();
        g.start_fixture_mode("sandbox");
        assert_eq!(g.place("kitchen", 5, 5), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.mode = modes::Mode::Story;
            v.minutes = 570.;
            v.skills.enabled = true;
            logistics::fixture_stock(&mut v, economy::FOOD, 40);
            logistics::fixture_stock(&mut v, economy::MEALS, 0);
            water::fixture_fresh(&mut v, 40.);
            food::fixture_stage(&mut v, 0);
            economy::rebalance(&mut v);
        }
        let mut r = person(&mut g);
        r.energy = 90.;
        r.hunger = 10.;
        r.social = 90.;
        r.last_meal_slot = 0;
        let v = g.app.world().resource::<Village>();
        assign(&mut r, v, "cook", "A useful pot.", false);
        r.x = r.target_x;
        r.y = r.target_y;
        (g, r)
    }
    #[test]
    fn practice_is_bounded_per_domain_day_and_lifetime_and_can_be_paused() {
        let mut g = Game::new();
        let mut v = g.app.world_mut().resource_mut::<Village>();
        for _ in 0..100 {
            award(&mut v, 0, Skill::Farming, 3);
        }
        assert_eq!(v.skills.people[&0].experience[2], 6);
        award(&mut v, 0, Skill::Cooking, 6);
        award(&mut v, 0, Skill::Craft, 6);
        assert_eq!(
            v.skills.people[&0].experience[4], 0,
            "A second daily cap limits grinding across chores"
        );
        v.skills.enabled = false;
        v.minutes += 1440.;
        award(&mut v, 0, Skill::Farming, 6);
        assert_eq!(factor(&v, 0, Skill::Farming), 1.);
        assert_eq!(v.skills.people[&0].experience[2], 6);
        v.skills.enabled = true;
        for day in 1..100 {
            v.minutes = day as f32 * 1440. + 570.;
            award(&mut v, 0, Skill::Farming, 6);
        }
        assert_eq!(v.skills.people[&0].experience[2], MAX);
        assert!((factor(&v, 0, Skill::Farming) - 1.15).abs() < 0.00001);
        assert!(valid(&v));
    }
    #[test]
    fn a_partial_or_cancelled_pot_teaches_nothing_and_a_finished_pot_teaches_once() {
        let (mut g, r) = kitchen();
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(!production::work(&mut v, &r, 4.));
        assert_eq!(v.skills.people[&0].experience[3], 0);
        assert!(production::cancel_batch(&mut v, r.activity_batch.unwrap()));
        assert_eq!(v.skills.people[&0].experience[3], 0);
        let (mut g, r) = kitchen();
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(production::work(&mut v, &r, 10.));
        let earned = v.skills.people[&0].experience[3];
        assert!(earned > 0);
        assert!(!production::work(&mut v, &r, 10.));
        assert_eq!(v.skills.people[&0].experience[3], earned);
    }
    #[test]
    fn experience_improves_real_labour_without_extra_inputs_or_output() {
        let (mut novice, a) = kitchen();
        let (mut expert, b) = kitchen();
        expert
            .app
            .world_mut()
            .resource_mut::<Village>()
            .skills
            .people
            .get_mut(&0)
            .unwrap()
            .experience[3] = MAX;
        {
            let mut v = novice.app.world_mut().resource_mut::<Village>();
            assert!(!production::work(&mut v, &a, 9.));
        }
        {
            let mut v = expert.app.world_mut().resource_mut::<Village>();
            assert!(production::work(&mut v, &b, 9.));
        }
        production::work(
            &mut novice.app.world_mut().resource_mut::<Village>(),
            &a,
            1.,
        );
        let left = novice.app.world().resource::<Village>();
        let right = expert.app.world().resource::<Village>();
        assert_eq!(
            left.production.accounting.inputs,
            right.production.accounting.inputs
        );
        assert_eq!(
            left.production.accounting.outputs,
            right.production.accounting.outputs
        );
        assert_eq!(left.skills.people[&0].experience[3], 3);
        assert_eq!(right.skills.people[&0].experience[3], MAX);
    }
    #[test]
    fn only_delivered_useful_cargo_earns_experience_and_a_pickup_interruption_does_not() {
        let mut g = Game::new();
        assert_eq!(g.place("garden", 13, 15), "ok");
        let mut v = g.app.world().resource::<Village>().clone();
        v.minutes = 570.;
        let mut r = person(&mut g);
        r.x = CAMP.0;
        r.y = CAMP.1;
        assign(&mut r, &v, "haul", "Bringing the site kit.", false);
        for _ in 0..500 {
            logistics::advance(&mut v, &mut r, &[], 0.25);
            if v.logistics
                .as_ref()
                .unwrap()
                .shipments
                .iter()
                .any(|h| h.resident == 0 && h.carrying)
            {
                break;
            }
        }
        assert_eq!(v.skills.people[&0].experience[1], 0);
        assert!(
            v.logistics
                .as_ref()
                .unwrap()
                .shipments
                .iter()
                .any(|h| h.carrying)
        );
        let mut interrupted = v.clone();
        let mut idle = r.clone();
        idle.task = "rest".into();
        logistics::interrupt(&mut interrupted, &idle);
        assert_eq!(interrupted.skills.people[&0].experience[1], 0);
        for _ in 0..500 {
            logistics::advance(&mut v, &mut r, &[], 0.25);
            if r.remaining <= 0. {
                break;
            }
        }
        assert!(v.skills.people[&0].experience[1] > 0);
        assert!(logistics::project_items(&v, 0).iter().sum::<u32>() > 0);
    }
    #[test]
    fn skill_quotes_reduce_cargo_time_but_keep_the_same_route_and_road_benefits() {
        let mut g = Game::new();
        assert_eq!(g.place("garden", 18, 18), "ok");
        let mut r = person(&mut g);
        r.x = CAMP.0;
        r.y = CAMP.1;
        let mut v = g.app.world().resource::<Village>().clone();
        let ordinary = logistics::quote(&v, &r).unwrap().0;
        v.skills.people.get_mut(&0).unwrap().experience[1] = MAX;
        let trained = logistics::quote(&v, &r).unwrap().0;
        assert!(trained < ordinary);
        assert!((ordinary / trained - 1.15).abs() < 0.0001);
        v.skills.enabled = false;
        assert_eq!(logistics::quote(&v, &r).unwrap().0, ordinary);
    }
    #[test]
    fn a_paid_outside_shift_teaches_the_matching_skill_once() {
        let mut g = Game::new();
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.minutes = 1020.;
        *v.economy.outside_committed_days.get_mut(&2).unwrap() = 0;
        economy::finish_outside(&mut v, 2);
        assert_eq!(v.skills.people[&2].experience[3], 2);
        let money = v.economy.money;
        economy::finish_outside(&mut v, 2);
        assert_eq!(v.skills.people[&2].experience[3], 2);
        assert_eq!(v.economy.money, money);
        economy::finish_outside(&mut v, 1);
        assert_eq!(v.skills.people[&1].experience[0], 0);
    }
    #[test]
    fn all_actual_batch_contributors_learn_only_when_the_output_finishes() {
        let (mut g, a) = kitchen();
        let mut b = a.clone();
        b.id = 1;
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(!production::work(&mut v, &a, 5.));
        assert_eq!(v.skills.people[&0].experience[3], 0);
        assert!(production::work(&mut v, &b, 5.));
        assert_eq!(v.skills.people[&0].experience[3], 3);
        assert_eq!(v.skills.people[&1].experience[3], 3);
    }
    #[test]
    fn production_contribution_sets_migrate_and_continue_without_double_learning() {
        let (mut g, a) = kitchen();
        assert!(!production::work(
            &mut g.app.world_mut().resource_mut::<Village>(),
            &a,
            5.
        ));
        let mut old: serde_json::Value = serde_json::from_str(&g.snapshot()).unwrap();
        old["village"]["version"] = 37.into();
        for building in old["village"]["buildings"].as_array_mut().unwrap() {
            building["contributors"] = 0.into();
        }
        old["village"]["production"]["batches"][0]["contributors"] = 1.into();
        assert!(g.restore(&old.to_string()));
        let migrated = g.snapshot();
        let mut copy = Game::new();
        assert!(copy.restore(&migrated));
        assert_eq!(copy.snapshot(), migrated);
        let current: serde_json::Value = serde_json::from_str(&migrated).unwrap();
        for value in [
            serde_json::json!([0, 0]),
            serde_json::json!([42]),
            serde_json::Value::Null,
        ] {
            let mut bad = current.clone();
            bad["village"]["production"]["batches"][0]["contributors"] = value;
            assert!(!g.restore(&bad.to_string()));
            assert_eq!(g.snapshot(), migrated);
        }
        let mut b = a.clone();
        b.id = 1;
        assert!(production::work(
            &mut g.app.world_mut().resource_mut::<Village>(),
            &b,
            5.
        ));
        assert!(production::work(
            &mut copy.app.world_mut().resource_mut::<Village>(),
            &b,
            5.
        ));
        assert_eq!(g.snapshot(), copy.snapshot());
        let v = g.app.world().resource::<Village>();
        assert_eq!(v.skills.people[&0].experience[3], 3);
        assert_eq!(v.skills.people[&1].experience[3], 3);
        let v = &mut g.app.world_mut().resource_mut::<Village>();
        assert!(!production::work(v, &b, 5.));
        assert_eq!(v.skills.people[&0].experience[3], 3);
        assert_eq!(v.skills.people[&1].experience[3], 3);
    }
    #[test]
    fn service_learning_requires_the_completed_supplied_job() {
        let mut g = Game::new();
        g.start_fixture_mode("sandbox");
        assert_eq!(g.place("workshop", 6, 6), "ok");
        g.set_equipment_condition(true);
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.minutes = 570.;
            v.skills.enabled = true;
            v.maintenance
                .records
                .iter_mut()
                .find(|p| p.equipment == maintenance::Equipment::Workshop(0))
                .unwrap()
                .condition = 40.;
        }
        assert_eq!(
            g.queue_equipment_service(r#"{"kind":"workshop","id":0}"#),
            "ok"
        );
        let id = g
            .app
            .world()
            .resource::<Village>()
            .maintenance
            .jobs
            .last()
            .unwrap()
            .id;
        let mut r = person(&mut g);
        let mut v = g.app.world_mut().resource_mut::<Village>();
        for (i, n) in maintenance::jobs::kit(maintenance::Equipment::Workshop(0))
            .into_iter()
            .enumerate()
        {
            if n > 0 {
                organics::fixture_transfer(&mut v, logistics::Owner::Maintenance(id), i, n);
            }
        }
        assert!(maintenance::jobs::assign_target(&mut r, &v, id));
        r.x = r.target_x;
        r.y = r.target_y;
        assert!(!maintenance::jobs::work(&mut v, &r, 23.));
        assert_eq!(v.skills.people[&0].experience[5], 0);
        assert!(maintenance::jobs::work(&mut v, &r, 1.));
        assert_eq!(v.skills.people[&0].experience[5], 4);
        maintenance::jobs::work(&mut v, &r, 20.);
        assert_eq!(v.skills.people[&0].experience[5], 4);
    }
    #[test]
    fn earned_experience_and_future_outcomes_survive_an_exact_checkpoint() {
        let (mut g, r) = kitchen();
        assert!(production::work(
            &mut g.app.world_mut().resource_mut::<Village>(),
            &r,
            10.
        ));
        let saved = g.snapshot();
        let mut copy = Game::new();
        assert!(copy.restore(&saved));
        assert_eq!(copy.snapshot(), saved);
        for _ in 0..200 {
            g.tick(0.25);
            copy.tick(0.25);
        }
        assert_eq!(g.snapshot(), copy.snapshot());
    }
    #[test]
    fn an_available_novice_can_work_and_mastery_never_overrules_rest() {
        let mut g = Game::new();
        let mut novice = person(&mut g);
        let mut v = g.app.world().resource::<Village>().clone();
        v.minutes = 570.;
        logistics::fixture_stock(&mut v, economy::FOOD, 12);
        logistics::fixture_stock(&mut v, economy::MEALS, 8);
        water::fixture_fresh(&mut v, 40.);
        novice.task = "idle".into();
        novice.remaining = 0.;
        novice.energy = 90.;
        novice.hunger = 10.;
        novice.social = 90.;
        novice.last_meal_slot = 0;
        let mut expert = novice.clone();
        expert.id = 1;
        expert.task = "build".into();
        expert.remaining = 100.;
        v.skills.people.get_mut(&1).unwrap().experience = [MAX; COUNT];
        workforce::refresh(&mut v, [&novice, &expert]);
        choose(&mut novice, &v);
        assert_eq!(novice.task, "gather");
        assert_eq!(factor(&v, 0, Skill::Farming), 1.);
        novice.energy = 20.;
        v.skills.people.get_mut(&0).unwrap().experience = [MAX; COUNT];
        choose(&mut novice, &v);
        assert_eq!(novice.task, "rest");
    }
    #[test]
    fn reports_are_read_only_and_malformed_learning_saves_are_atomic() {
        let mut g = Game::new();
        let saved = g.snapshot();
        g.skills_report();
        assert_eq!(g.snapshot(), saved);
        for (path, value) in [
            ("schema", serde_json::json!(9)),
            ("people", serde_json::json!([])),
        ] {
            let mut bad: serde_json::Value = serde_json::from_str(&saved).unwrap();
            bad["village"]["skills"][path] = value;
            assert!(!g.restore(&bad.to_string()));
            assert_eq!(g.snapshot(), saved);
        }
        for (field, value) in [("experience", 161), ("today", 7)] {
            let mut bad: serde_json::Value = serde_json::from_str(&saved).unwrap();
            bad["village"]["skills"]["people"]["0"][field][0] = value.into();
            assert!(!g.restore(&bad.to_string()));
            assert_eq!(g.snapshot(), saved);
        }
        let mut old: serde_json::Value = serde_json::from_str(&saved).unwrap();
        old["village"]["version"] = 23.into();
        old["village"].as_object_mut().unwrap().remove("skills");
        assert!(g.restore(&old.to_string()));
        let resumed = g.snapshot();
        assert!(g.restore(&resumed));
        assert_eq!(g.snapshot(), resumed);
    }
}

#[cfg(test)]
mod identity_tests {
    use super::*;
    #[test]
    fn sparse_id_skill_records_are_independent_of_order_and_missing_ids() {
        let mut v = Village::default();
        v.skills.people.clear();
        v.skills.people.insert(
            42,
            Person {
                experience: [60; COUNT],
                ..Default::default()
            },
        );
        v.skills.people.insert(7, Person::default());
        award(&mut v, 42, Skill::Cooking, 3);
        award(&mut v, 7, Skill::Building, 2);
        award(&mut v, 0, Skill::Care, 6);
        assert_eq!(v.skills.people[&42].experience[3], 63);
        assert_eq!(v.skills.people[&7].experience[0], 2);
        assert!(!v.skills.people.contains_key(&0));
        assert!(factor(&v, 42, Skill::Cooking) > factor(&v, 7, Skill::Cooking));
        let mut residents = crate::initialization::founding_residents(CAMP);
        residents.truncate(2);
        residents[0].id = 42;
        residents[1].id = 7;
        assert!(matches_residents(&v, &residents));
        residents.reverse();
        assert!(matches_residents(&v, &residents));
        residents[0].id = 42;
        assert!(!matches_residents(&v, &residents));
        let report = view(&v);
        assert_eq!(report["people"][0]["id"], 7);
        assert_eq!(report["people"][1]["id"], 42);
        assert!(valid(&v));
    }
    #[test]
    fn old_slot_skills_migrate_without_losing_identity_history_or_runtime_state() {
        let mut g = Game::new();
        let mut raw: serde_json::Value = serde_json::from_str(&g.snapshot()).unwrap();
        for id in 0..5 {
            raw["village"]["skills"]["people"][id.to_string()]["experience"][0] = (id * 12).into();
        }
        let mut reference = Game::new();
        assert!(reference.restore(&raw.to_string()));
        let expected = reference.snapshot();
        raw["village"]["version"] = 30.into();
        raw["village"]["skills"]["schema"] = 1.into();
        raw["village"]["skills"]["people"] = serde_json::Value::Array(
            (0..5)
                .map(|id| raw["village"]["skills"]["people"][id.to_string()].clone())
                .collect(),
        );
        assert!(g.restore(&raw.to_string()));
        assert_eq!(g.snapshot(), expected);
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_eq!(g.snapshot(), saved);
    }
    #[test]
    fn orphan_missing_aliased_and_unmigrated_skill_records_are_atomic() {
        let mut g = Game::new();
        let before = g.snapshot();
        let source: serde_json::Value = serde_json::from_str(&before).unwrap();
        for mode in 0..6 {
            let mut raw = source.clone();
            let people = raw["village"]["skills"]["people"].as_object_mut().unwrap();
            match mode {
                0 => {
                    people.remove("0");
                }
                1 => {
                    let p = people.remove("0").unwrap();
                    people.insert("42".into(), p);
                }
                2 => {
                    let p = people["0"].clone();
                    people.insert("00".into(), p);
                }
                3 => {
                    raw["village"]["skills"]["schema"] = 1.into();
                    raw["village"]["skills"]["people"] = serde_json::json!([]);
                }
                5 => {
                    raw["village"].as_object_mut().unwrap().remove("skills");
                }
                _ => {
                    raw["village"]["version"] = 30.into();
                    raw["village"]["skills"]["schema"] = 1.into();
                    raw["village"]["skills"]["people"] = serde_json::json!([]);
                }
            }
            assert!(!g.restore(&raw.to_string()));
            assert_eq!(g.snapshot(), before);
        }
    }
}
