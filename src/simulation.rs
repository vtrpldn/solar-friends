//! Persisted identities, observed resident time, and material accounting.
use crate::*;
use std::collections::{BTreeMap, BTreeSet};

pub const SCHEMA: u32 = 2;
pub const CATEGORIES: [&str; 8] = [
    "travel",
    "village_work",
    "outside_work",
    "meals",
    "rest",
    "social",
    "leisure",
    "sleep",
];
pub const LABELS: [&str; 8] = [
    "Travelling",
    "Village work",
    "Outside job",
    "Meals",
    "Rest",
    "Social time",
    "Leisure",
    "Sleep",
];
const MAX_COUNTER: u64 = 9_007_199_254_740_991;

/// One namespace for shipments, inventories, work, batches and connections.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Id(pub u32);

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Day {
    pub day: u32,
    pub first: f64,
    pub last: f64,
    pub residents: BTreeMap<usize, [f64; 8]>,
}

#[derive(Clone, Default, Serialize, Deserialize)]
pub struct Materials {
    pub opening: [u32; economy::COUNT],
    pub received: [u64; economy::COUNT],
    pub spent: [u64; economy::COUNT],
}

#[derive(Clone, Serialize, Deserialize)]
pub struct State {
    pub schema: u32,
    pub seed: u32,
    pub next_id: u32,
    pub days: Vec<Day>,
    pub materials: Option<Materials>,
}
impl Default for State {
    fn default() -> Self {
        Self {
            schema: SCHEMA,
            seed: 78593,
            next_id: 1,
            days: vec![],
            materials: None,
        }
    }
}
impl State {
    pub fn allocate(&mut self) -> Option<Id> {
        let next = self.next_id.checked_add(1)?;
        let id = Id(self.next_id);
        self.next_id = next;
        Some(id)
    }
}

/// Stateless seeded sampling keeps future land/weather independent of queries.
pub fn sample(seed: u32, domain: u32, index: u32) -> u32 {
    let mut n = seed ^ domain.wrapping_mul(0x9e3779b9) ^ index.wrapping_mul(0x85ebca6b);
    n ^= n >> 16;
    n = n.wrapping_mul(0x7feb352d);
    n ^= n >> 15;
    n = n.wrapping_mul(0x846ca68b);
    n ^ (n >> 16)
}

pub fn start_materials(v: &mut Village) {
    if v.simulation.materials.is_none() {
        v.simulation.materials = Some(Materials {
            opening: std::array::from_fn(|i| economy::quantity(v, i)),
            ..Materials::default()
        });
    }
}
pub fn material_change(v: &mut Village, material: usize, amount: u32, incoming: bool) {
    start_materials(v);
    let ledger = v.simulation.materials.as_mut().unwrap();
    let n = if incoming {
        &mut ledger.received[material]
    } else {
        &mut ledger.spent[material]
    };
    *n = n
        .checked_add(u64::from(amount))
        .expect("material accounting overflow");
}

pub fn activity(r: &Resident) -> usize {
    if let Some(trip) = &r.trip {
        if trip.phase == mobility::Phase::Away {
            return match trip.purpose {
                mobility::Purpose::Work => 2,
                mobility::Purpose::Overnight => 7,
                mobility::Purpose::Pickup => 0,
            };
        }
        return 0;
    }
    // A nature walk is leisure throughout, including the walk itself.
    if leisure::hobby(&r.task) {
        return 6;
    }
    if (r.x - r.target_x).hypot(r.y - r.target_y) > 0.08 {
        return 0;
    }
    match r.task.as_str() {
        "sleep" => 7,
        "eat" => 3,
        "rest" => 4,
        "socialize" | "gathering" => 5,
        "idle" => 6,
        task if leisure::hobby(task) => 6,
        _ => 1,
    }
}

pub fn record_time(state: &mut State, from: f64, until: f64, activities: &[(usize, usize)]) {
    let mut ids = BTreeSet::new();
    if !from.is_finite()
        || !until.is_finite()
        || from < 0.
        || activities
            .iter()
            .any(|(id, category)| *category >= CATEGORIES.len() || !ids.insert(*id))
        || until <= from
    {
        return;
    }
    let mut cursor = from;
    while cursor < until {
        let day = (cursor / 1440.).floor() as u32;
        let end = until.min((f64::from(day) + 1.) * 1440.);
        if state.days.last().is_none_or(|d| d.day != day) {
            state.days.push(Day {
                day,
                first: cursor,
                last: cursor,
                residents: activities.iter().map(|(id, _)| (*id, [0.; 8])).collect(),
            });
            if state.days.len() > 8 {
                state.days.remove(0);
            }
        }
        let entry = state.days.last_mut().unwrap();
        for &(resident, category) in activities {
            entry.residents.entry(resident).or_insert([0.; 8])[category] += end - cursor;
        }
        entry.last = end;
        cursor = end;
    }
}

pub fn migrate(raw: &mut serde_json::Value) -> bool {
    if raw["village"]["simulation"].is_null() {
        return true;
    }
    let state = &mut raw["village"]["simulation"];
    if state["schema"] == SCHEMA {
        return true;
    }
    if state["schema"] != 1 {
        return false;
    }
    let Some(days) = state["days"].as_array_mut() else {
        return false;
    };
    for day in days {
        let Some(rows) = day["residents"].as_array() else {
            return false;
        };
        if rows.len() != 5 {
            return false;
        }
        day["residents"] = serde_json::Value::Object(
            rows.iter()
                .enumerate()
                .map(|(id, row)| (id.to_string(), row.clone()))
                .collect(),
        );
    }
    state["schema"] = SCHEMA.into();
    true
}

pub fn valid(v: &Village) -> bool {
    let s = &v.simulation;
    if s.schema != SCHEMA || s.next_id == 0 || s.days.len() > 8 {
        return false;
    }
    if let Some(m) = &s.materials
        && m.received.iter().chain(&m.spent).any(|&n| n > MAX_COUNTER)
    {
        return false;
    }
    let mut previous = None;
    for d in &s.days {
        let start = f64::from(d.day) * 1440.;
        if previous.is_some_and(|day| day >= d.day)
            || !d.first.is_finite()
            || !d.last.is_finite()
            || d.first < start
            || d.last < d.first
            || d.last > start + 1440.
            || d.last > f64::from(v.minutes) + 0.001
            || !d.residents.keys().eq(v.skills.people.keys())
            || d.residents.values().any(|row| {
                row.iter().any(|n| !n.is_finite() || *n < 0.)
                    || row.iter().sum::<f64>() > d.last - d.first + 0.001
            })
        {
            return false;
        }
        previous = Some(d.day);
    }
    let mut ids = std::collections::HashSet::new();
    v.building_jobs
        .iter()
        .filter_map(|j| j.id)
        .all(|id| id.0 > 0 && id.0 < s.next_id && ids.insert(id))
}

pub fn view(v: &Village) -> serde_json::Value {
    let materials:Vec<_>=(0..economy::COUNT).map(|i| {
        let present=economy::quantity(v,i);
        let expected=v.simulation.materials.as_ref().map(|m|i128::from(m.opening[i])+i128::from(m.received[i])-i128::from(m.spent[i]));
        serde_json::json!({"material":economy::NAMES[i],"on_hand":present,"reserved":(economy::reserved(v,i)+crate::production::input_demand(v,i)+crate::gatherings::reserved(v,i)+crate::restoration::reserved_amount(v,i)+crate::planting::reserved(v,i)+crate::pipes::demand(v,i)+crate::maintenance::jobs::demand(v,i)).min(present),"committed_to_utilities":v.pipes.lines.iter().filter(|p|p.live()&&p.spent.is_some()).map(|p|p.kit[i]).sum::<u32>(),"processing":crate::restoration::processing(v,i)+crate::organics::processing(v,i)+v.production.batches.iter().filter(|b|b.active()&&b.committed).map(|b|b.inputs[i]).sum::<u32>(),"available":economy::free(v,i),"incoming":economy::incoming(v,i),"consumed_in_projects":v.economy.projects.iter().map(|p|u64::from(p.consumed[i])).sum::<u64>(),"salvage_receivable":v.building_jobs.iter().map(|j|u64::from(j.returns[i])).sum::<u64>(),"expected_on_hand":expected.map(|n|n as f64),"difference":expected.map(|n|i128::from(present)-n).map(|n|n as f64)})
    }).collect();
    serde_json::json!({"story":crate::outcomes::report(v),"schema":v.simulation.schema,"seed":v.simulation.seed,"terrain_sample":sample(v.simulation.seed,1,0),"next_id":v.simulation.next_id,"categories":CATEGORIES,"labels":LABELS,"days":v.simulation.days,"materials":materials,"inventory_model":if v.logistics.is_some(){"located_stores"}else{"shared_stock"},"logistics":logistics::view(v),"production":crate::production::view(v),"maintenance":crate::maintenance::report(v),"restoration":crate::restoration::view(v),"water":crate::water::view(v),"water_connections":crate::pipes::view_filtered(v,Some(false)),"electricity":crate::power::report(v),"gathering":v.progress.gathering_delivery,"freshness":crate::freshness::view(v),"processes":crate::processes::view(v),"note":"Time covers observed simulation minutes only. Material differences expose edits outside normal transactions; incoming orders and salvage remain separate from owned stock."})
}

#[wasm_bindgen]
impl Game {
    pub fn simulation_report(&self) -> String {
        view(self.app.world().resource::<Village>()).to_string()
    }
    pub fn set_simulation_seed(&mut self, seed: u32) -> bool {
        let mut v = self.app.world_mut().resource_mut::<Village>();
        if v.scenario.is_some()
            || v.arrived
            || v.minutes != 480.
            || !v.buildings.is_empty()
            || !v.economy.sources.is_empty()
            || !v.economy.orders.is_empty()
            || !v.land.soil.is_empty()
            || v.economy.land != resource_sites::LAND
        {
            return false;
        }
        crate::land::reseed(&mut v, seed);
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn time_splits_midnight_without_counting_unobserved_time_or_queries() {
        let mut state = State::default();
        record_time(&mut state, 1439.5, 1440.5, &[(0, 0), (1, 7)]);
        assert_eq!(state.days.len(), 2);
        assert_eq!(state.days[0].residents[&0][0], 0.5);
        assert_eq!(state.days[1].residents[&1][7], 0.5);
        let before = state.days.clone();
        record_time(&mut state, 1440.5, 1440.5, &[(0, 0)]);
        assert_eq!(state.days, before);
        for day in 2..12 {
            record_time(
                &mut state,
                f64::from(day) * 1440.,
                f64::from(day) * 1440. + 1.,
                &[(0, 6)],
            );
        }
        assert_eq!(state.days.len(), 8);
        assert_eq!(state.days[0].day, 4);
    }
    #[test]
    fn real_time_is_accounted_for_each_resident_and_preserved_by_reload() {
        let mut g = Game::new();
        let before = g.snapshot();
        g.simulation_report();
        g.dev_inspect();
        assert_eq!(g.snapshot(), before);
        for _ in 0..80 {
            g.tick(0.25);
        }
        let s = g.app.world().resource::<Village>();
        for row in s.simulation.days[0].residents.values() {
            assert_eq!(row.iter().sum::<f64>(), 60.);
        }
        let mut restored = Game::new();
        assert!(restored.restore(&g.snapshot()));
        for _ in 0..80 {
            g.tick(0.25);
            restored.tick(0.25);
        }
        assert_eq!(g.snapshot(), restored.snapshot());
    }
    #[test]
    fn time_categories_follow_the_activity_and_distinguish_sleep_from_a_commute() {
        let mut g = Game::new();
        let mut q = g.app.world_mut().query::<&Resident>();
        let mut r = q.iter(g.app.world()).next().unwrap().clone();
        r.task = "nature_walk".into();
        r.target_x = r.x + 5.;
        assert_eq!(activity(&r), 6);
        r.task = "build".into();
        assert_eq!(activity(&r), 0);
        r.target_x = r.x;
        r.target_y = r.y;
        assert_eq!(activity(&r), 1);
        r.task = "eat".into();
        assert_eq!(activity(&r), 3);
        for (purpose, expected) in [
            (mobility::Purpose::Work, 2),
            (mobility::Purpose::Overnight, 7),
            (mobility::Purpose::Pickup, 0),
        ] {
            r.trip = Some(mobility::Trip {
                purpose,
                phase: mobility::Phase::Away,
                return_at: 2000.,
                order: None,
            });
            assert_eq!(activity(&r), expected);
            r.trip.as_mut().unwrap().phase = mobility::Phase::Returning;
            assert_eq!(activity(&r), 0);
        }
    }
    #[test]
    fn material_bookkeeping_separates_ownership_reservations_and_incoming() {
        let mut g = Game::new();
        assert_eq!(g.place("garden", 5, 5), "ok");
        let mut v = g.app.world_mut().resource_mut::<Village>();
        let before = economy::quantity(&v, 0);
        assert_eq!(view(&v)["materials"][0]["difference"], 0.);
        assert!(economy::reserved(&v, 0) > 0);
        economy::add(&mut v, 0, 8);
        economy::remove(&mut v, 0, 2);
        assert_eq!(economy::quantity(&v, 0), before + 6);
        assert_eq!(view(&v)["materials"][0]["difference"], 0.);
        v.logistics.as_mut().unwrap().stores[0].items[0] += 3;
        assert_eq!(view(&v)["materials"][0]["difference"], 3.);
    }
    #[test]
    fn stable_ids_never_reuse_cancelled_work_and_reject_corrupt_references() {
        let mut g = Game::new();
        g.start_fixture_mode("sandbox");
        assert_eq!(g.place("garden", 5, 5), "ok");
        assert_eq!(g.queue_building_work(0, "demolish", 0, 0), "ok");
        let first = g.app.world().resource::<Village>().building_jobs[0]
            .id
            .unwrap();
        assert_eq!(g.cancel_building_work(0), "ok");
        assert_eq!(g.queue_building_work(0, "salvage", 0, 0), "ok");
        assert!(
            g.app.world().resource::<Village>().building_jobs[0]
                .id
                .unwrap()
                .0
                > first.0
        );
        let before = g.snapshot();
        let mut invalid: serde_json::Value = serde_json::from_str(&before).unwrap();
        invalid["village"]["building_jobs"][0]["id"] = 999.into();
        assert!(!g.restore(&invalid.to_string()));
        assert_eq!(g.snapshot(), before);
        let mut state = State {
            next_id: u32::MAX,
            ..State::default()
        };
        assert!(state.allocate().is_none());
        assert_eq!(state.next_id, u32::MAX);
    }
    #[test]
    fn invalid_time_and_schema_fail_atomically_and_sampling_is_stable() {
        let mut g = Game::new();
        g.tick(0.25);
        let before = g.snapshot();
        for (key, value) in [("schema", 0), ("next_id", 0)] {
            let mut s: serde_json::Value = serde_json::from_str(&before).unwrap();
            s["village"]["simulation"][key] = value.into();
            assert!(!g.restore(&s.to_string()));
            assert_eq!(g.snapshot(), before);
        }
        let mut s: serde_json::Value = serde_json::from_str(&before).unwrap();
        s["village"]["simulation"]["days"][0]["residents"]["0"][0] = (-1).into();
        assert!(!g.restore(&s.to_string()));
        assert_eq!(g.snapshot(), before);
        assert_eq!(sample(17, 1, 9), sample(17, 1, 9));
        assert_ne!(sample(17, 1, 9), sample(17, 2, 9));
        let mut seed = Game::new();
        assert!(seed.set_simulation_seed(17));
        let saved = seed.snapshot();
        assert!(seed.restore(&saved));
        assert_eq!(seed.snapshot(), saved);
        seed.tick(0.25);
        assert!(!seed.set_simulation_seed(19));
    }
}

#[cfg(test)]
mod identity_tests {
    use super::*;
    #[test]
    fn sparse_ids_split_midnight_and_reject_duplicate_or_invalid_observations() {
        let mut s = State::default();
        record_time(&mut s, 1439.5, 1440.5, &[(42, 7), (7, 0)]);
        assert_eq!(
            s.days[0].residents.keys().copied().collect::<Vec<_>>(),
            vec![7, 42]
        );
        assert_eq!(s.days[0].residents[&42][7], 0.5);
        assert_eq!(s.days[1].residents[&7][0], 0.5);
        let before = serde_json::to_string(&s).unwrap();
        for activity in [vec![(42, 0), (42, 1)], vec![(7, 8)]] {
            record_time(&mut s, 1440.5, 1441., &activity);
            assert_eq!(serde_json::to_string(&s).unwrap(), before);
        }
        for (a, b) in [(f64::NAN, 1441.), (1440.5, f64::INFINITY), (-1., 0.)] {
            record_time(&mut s, a, b, &[(42, 7)]);
            assert_eq!(serde_json::to_string(&s).unwrap(), before);
        }
        let mut shuffled = State::default();
        record_time(&mut shuffled, 1439.5, 1440.5, &[(7, 0), (42, 7)]);
        assert_eq!(shuffled.days, s.days);
    }
    #[test]
    fn supported_old_time_arrays_migrate_without_changing_accounts_or_continuation() {
        let mut reference = Game::new();
        for _ in 0..40 {
            reference.tick(0.25);
        }
        let saved = reference.snapshot();
        for version in [30, 31, 32] {
            let mut raw: serde_json::Value = serde_json::from_str(&saved).unwrap();
            raw["village"]["version"] = version.into();
            let state = &mut raw["village"]["simulation"];
            state["schema"] = 1.into();
            for day in state["days"].as_array_mut().unwrap() {
                day["residents"] = serde_json::Value::Array(
                    (0..5)
                        .map(|id| day["residents"][id.to_string()].clone())
                        .collect(),
                );
            }
            if version <= 31 {
                let work = &mut raw["village"]["workforce"];
                work.as_object_mut().unwrap().remove("schema");
                work["preferences"] = serde_json::Value::Array(
                    (0..5)
                        .map(|id| work["preferences"][id.to_string()].clone())
                        .collect(),
                );
                for day in work["days"].as_array_mut().unwrap() {
                    day["residents"] = serde_json::Value::Array(
                        (0..5)
                            .map(|id| day["residents"][id.to_string()].clone())
                            .collect(),
                    );
                }
            }
            if version <= 30 {
                let skills = &mut raw["village"]["skills"];
                skills["schema"] = 1.into();
                skills["people"] = serde_json::Value::Array(
                    (0..5)
                        .map(|id| skills["people"][id.to_string()].clone())
                        .collect(),
                );
            }
            let mut copy = Game::new();
            assert!(copy.restore(&raw.to_string()));
            assert_eq!(copy.snapshot(), saved);
            let mut control = Game::new();
            assert!(control.restore(&saved));
            for _ in 0..20 {
                control.tick(0.25);
                copy.tick(0.25);
            }
            assert_eq!(copy.snapshot(), control.snapshot());
        }
    }
    #[test]
    fn missing_or_aliased_time_rows_do_not_replace_a_running_world() {
        let mut g = Game::new();
        g.tick(0.25);
        let before = g.snapshot();
        let source: serde_json::Value = serde_json::from_str(&before).unwrap();
        for mode in 0..4 {
            let mut raw = source.clone();
            let rows = raw["village"]["simulation"]["days"][0]["residents"]
                .as_object_mut()
                .unwrap();
            match mode {
                0 => {
                    rows.remove("0");
                }
                1 => {
                    let row = rows["0"].clone();
                    rows.insert("00".into(), row);
                }
                2 => {
                    let row = rows.remove("0").unwrap();
                    rows.insert("42".into(), row);
                }
                _ => {
                    raw["village"].as_object_mut().unwrap().remove("simulation");
                }
            }
            assert!(!g.restore(&raw.to_string()));
            assert_eq!(g.snapshot(), before);
        }
    }
}
