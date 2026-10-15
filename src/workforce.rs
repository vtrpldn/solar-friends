//! Shared work offers and reservations derived from residents' saved activities.
use crate::*;

pub const CATEGORIES: [&str; 5] = ["construction", "hauling", "food", "materials", "care"];
#[derive(Clone, Serialize, Deserialize)]
pub struct State {
    pub preferences: [[u8; 5]; 5],
    pub days: Vec<Day>,
}
impl Default for State {
    fn default() -> Self {
        Self {
            preferences: [[1; 5]; 5],
            days: vec![],
        }
    }
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Day {
    pub day: u32,
    pub residents: [[f64; 5]; 5],
}
#[derive(Clone)]
pub struct Claim {
    pub task: String,
    pub building: Option<usize>,
    pub material: Option<usize>,
}
impl Claim {
    pub fn from_resident(r: &Resident) -> Option<Self> {
        (r.trip.is_none() && r.remaining > 0.).then(|| Self {
            task: r.task.clone(),
            building: r.activity_building,
            material: r.activity_material,
        })
    }
}
fn category(task: &str) -> Option<usize> {
    match task {
        "build" | "building_work" => Some(0),
        "haul" => Some(1),
        "cook" | "garden" | "gather" => Some(2),
        "source" | "prepare" | "craft" => Some(3),
        "water" | "compost" => Some(4),
        _ => None,
    }
}
pub fn valid(v: &Village) -> bool {
    let s = &v.workforce;
    s.preferences.iter().flatten().all(|n| *n <= 2)
        && s.days.len() <= 8
        && s.days.windows(2).all(|p| p[0].day < p[1].day)
        && s.days.iter().all(|d| {
            f64::from(d.day) * 1440. <= f64::from(v.minutes)
                && d.residents.iter().all(|row| {
                    row.iter().all(|n| n.is_finite() && *n >= 0.)
                        && row.iter().sum::<f64>()
                            <= (f64::from(v.minutes) - f64::from(d.day) * 1440.).min(1440.) + 0.001
                })
        })
}
pub fn record<'a>(
    v: &mut Village,
    from: f64,
    until: f64,
    people: impl IntoIterator<Item = &'a Resident>,
) {
    let activities: Vec<_> = people
        .into_iter()
        .filter(|r| r.trip.is_none())
        .filter_map(|r| category(&r.task).map(|c| (r.id, c)))
        .collect();
    let mut cursor = from;
    while cursor < until {
        let day = (cursor / 1440.).floor() as u32;
        let end = until.min((f64::from(day) + 1.) * 1440.);
        if v.workforce.days.last().is_none_or(|d| d.day != day) {
            v.workforce.days.push(Day {
                day,
                residents: [[0.; 5]; 5],
            });
            if v.workforce.days.len() > 8 {
                v.workforce.days.remove(0);
            }
        }
        for &(id, c) in &activities {
            v.workforce.days.last_mut().unwrap().residents[id][c] += end - cursor;
        }
        cursor = end;
    }
}
pub fn refresh<'a>(v: &mut Village, people: impl IntoIterator<Item = &'a Resident>) {
    v.activity_claims = std::array::from_fn(|_| None);
    v.workforce_peers = std::array::from_fn(|_| None);
    for r in people {
        if r.id < 5 {
            v.workforce_peers[r.id] = Some(r.clone());
        }
        if r.id < 5 && r.trip.is_none() && r.remaining > 0. {
            v.activity_claims[r.id] = Claim::from_resident(r);
        }
    }
}
fn count(v: &Village, id: usize, task: &str) -> f32 {
    v.activity_claims
        .iter()
        .enumerate()
        .filter(|(i, t)| *i != id && t.as_ref().is_some_and(|c| c.task == task))
        .count() as f32
}
fn projected(v: &Village, id: usize) -> (f32, f32) {
    let cooks = count(v, id, "cook");
    (
        v.food + count(v, id, "gather") * 2. - cooks * 3.,
        v.meals as f32 + cooks * 5.,
    )
}
pub fn urgent_food(v: &Village, id: usize) -> bool {
    let (food, meals) = projected(v, id);
    food < 6. && meals < 3.
}
pub fn ingredients(v: &Village, id: usize) -> bool {
    let (food, meals) = projected(v, id);
    food < 18. && food + meals < 30.
}
pub fn cooking(v: &Village, id: usize) -> bool {
    let cooks = count(v, id, "cook");
    let food = v.food - cooks * 3.;
    v.meals as f32 + cooks * 5. < 8.
        && food
            >= if v.supplies.use_eggs && v.supplies.eggs as f32 >= 2. + cooks * 2. {
                2.
            } else {
                3.
            }
}

#[derive(Serialize)]
pub struct Offer {
    pub task: String,
    pub building: Option<usize>,
    pub material: Option<usize>,
    pub destination: [f32; 2],
    pub travel_minutes: f32,
    pub score: f32,
    #[serde(skip)]
    urgency: f32,
    #[serde(skip)]
    reason: &'static str,
}
fn occupied(
    v: &Village,
    r: &Resident,
    task: &str,
    building: Option<usize>,
    material: Option<usize>,
) -> usize {
    v.activity_claims
        .iter()
        .enumerate()
        .filter(|(id, c)| {
            *id != r.id
                && c.as_ref().is_some_and(|c| {
                    c.task == task && c.building == building && c.material == material
                })
        })
        .count()
}
pub fn claim_available(
    v: &Village,
    r: &Resident,
    task: &str,
    building: Option<usize>,
    material: Option<usize>,
) -> bool {
    !requests::work(task)
        || task == "haul"
        || occupied(v, r, task, building, material)
            < if matches!(task, "build" | "building_work" | "water") {
                2
            } else {
                1
            }
}
/// A neighbour already walking to eat owns one portion. Essential food should
/// not send the whole village after the same last ingredient and interrupt all
/// foraging at once.
pub fn eating(v: &Village, id: usize) -> bool {
    v.food.floor() + v.meals as f32 > count(v, id, "eat")
}
fn score(v: &Village, r: &Resident, task: &str, urgency: f32, travel: f32) -> f32 {
    let c = category(task).unwrap();
    let preference = f32::from(v.workforce.preferences[r.id][c]) - 1.;
    // Bounded bonuses let urgent food and water win over normal preferences.
    // Workload includes travel, so a neighbour with a long route gets a turn off.
    let recent: f64 = v
        .workforce
        .days
        .iter()
        .rev()
        .take(2)
        .map(|d| d.residents[r.id][c])
        .sum();
    let total: f64 = v
        .simulation
        .days
        .iter()
        .rev()
        .take(2)
        .map(|d| d.residents[r.id][0] + d.residents[r.id][1])
        .sum();
    urgency + preference * 160. + if r.favorite == task { 35. } else { 0. }
        - travel * 1.5
        - recent.min(400.) as f32 * 0.3
        - total.min(800.) as f32 * 0.05
}
pub fn offers(v: &Village, r: &Resident) -> Vec<Offer> {
    let mut out = vec![];
    let mut add = |task: &str, building: Option<usize>, urgency: f32, reason: &'static str| {
        let mut worker = r.clone();
        assign(&mut worker, v, task, reason, false);
        if worker.task != task && building.is_none() {
            return;
        }
        if let Some(id) = building {
            let Some(b) = v.buildings.iter().find(|b| b.id == id) else {
                return;
            };
            let Some((x, y)) = spacing::approach(v, b, r.id) else {
                return;
            };
            worker.activity_building = Some(id);
            worker.task = task.into();
            worker.remaining = 10.;
            worker.target_x = x;
            worker.target_y = y;
        }
        let capacity = if matches!(task, "build" | "building_work" | "water") {
            2
        } else {
            1
        };
        if occupied(
            v,
            r,
            task,
            worker.activity_building,
            worker.activity_material,
        ) >= capacity
        {
            return;
        }
        let travel = (worker.x - worker.target_x).hypot(worker.y - worker.target_y)
            * MINUTES_PER_SECOND
            / 0.7;
        out.push(Offer {
            task: task.into(),
            building: worker.activity_building,
            material: worker.activity_material,
            destination: [worker.target_x, worker.target_y],
            travel_minutes: travel,
            score: score(v, r, task, urgency, travel),
            urgency,
            reason,
        });
    };
    if v.water < 24. && available(v, "water") {
        add(
            "water",
            None,
            1100.,
            "Carrying water for our essential daily needs.",
        );
    }
    if cooking(v, r.id) && available(v, "cook") && !situations::protected(v, r.id, "cook") {
        add(
            "cook",
            None,
            if v.meals < 3 {
                1000.
            } else if situations::helping(v, r.id) {
                700.
            } else {
                450.
            },
            "Preparing enough food for our next meals.",
        );
    }
    for b in &v.buildings {
        if economy::can_build(v, b.id) {
            let priority = v
                .economy
                .projects
                .iter()
                .find(|p| p.building == b.id)
                .map_or(1, |p| p.priority);
            add(
                "build",
                Some(b.id),
                620. + priority as f32 * 60.,
                "Working on a supplied project during our community hours.",
            );
        }
        if building_work::job(v, b.id).is_some() && !logistics::occupied_building(v, b.id) {
            add(
                "building_work",
                Some(b.id),
                650.,
                "Making time for our queued building crew work.",
            );
        }
        if ingredients(v, r.id) && ecology::needs_tending(b, sanitation::irrigation_water(v)) {
            add(
                "garden",
                Some(b.id),
                390.,
                "Tending our garden for the next meals.",
            );
        }
    }
    if let Some((task, _)) = economy::local_job(v) {
        add(
            &task,
            None,
            610.,
            if task == "source" {
                "Collecting a bounded batch for our approved projects."
            } else {
                "Preparing materials for our approved projects."
            },
        );
    }
    if v.progress.use_tools && v.progress.tool_uses == 0 && available(v, "craft") {
        add(
            "craft",
            None,
            660.,
            "Making tools to help with our next shared project.",
        );
    }
    if available(v, "compost") && v.progress.compost < 4 {
        add(
            "compost",
            None,
            230.,
            "Turning kitchen scraps into nourishment for our soil.",
        );
    }
    if ingredients(v, r.id) {
        add(
            "gather",
            None,
            300.,
            "Gathering a little food for our next meals.",
        );
    }
    if v.water < 70_f32.min(ecology::capacity(v) * 0.8) && available(v, "water") && v.water >= 24. {
        add(
            "water",
            None,
            180.,
            "Keeping a useful water reserve for tomorrow.",
        );
    }
    if logistics::pending(v, r.id) {
        let (travel, urgency) = logistics::quote(v, r).unwrap_or((0., -1000.));
        out.push(Offer {
            task: "haul".into(),
            building: None,
            material: None,
            destination: [r.x, r.y],
            travel_minutes: travel,
            score: score(v, r, "haul", urgency, travel),
            urgency,
            reason: "Bringing supplies along a clear route to where they are needed.",
        });
    }
    out.sort_by(|a, b| {
        b.score
            .total_cmp(&a.score)
            .then_with(|| a.task.cmp(&b.task))
            .then_with(|| a.building.cmp(&b.building))
    });
    out
}
pub fn choose_work(r: &mut Resident, v: &Village) -> bool {
    let Some(job) = offers(v, r).into_iter().find(|job| assigned_to(v, r, job)) else {
        return false;
    };
    assign(r, v, &job.task, job.reason, false);
    // The offer owns its target; the legacy task fallback must not select a
    // different project or occupied plot after the shared queue chose this one.
    r.task = job.task;
    r.reason = job.reason.into();
    r.activity_building = job.building;
    r.activity_material = job.material;
    (r.target_x, r.target_y) = (job.destination[0], job.destination[1]);
    true
}

fn willing(v: &Village, r: &Resident, task: &str) -> bool {
    r.trip.is_none()
        && !r.requested
        && r.energy >= 28.
        && r.hunger <= 60.
        && !sleeping_time(v.minutes, r)
        && !occupations::available(v, r.id)
        && !meal_slot(v.minutes).is_some_and(|s| s != r.last_meal_slot)
        && !situations::protected(v, r.id, task)
        && (r.remaining <= 0.
            || leisure::hobby(&r.task)
            || matches!(r.task.as_str(), "idle" | "socialize"))
}
/// Offer a limited position to the best available neighbour rather than always
/// giving it to the first entity in the simulation loop. Existing work keeps
/// its claim until completion or a needs interruption.
fn assigned_to(v: &Village, r: &Resident, job: &Offer) -> bool {
    if job.task == "haul" {
        return true;
    } // Shipment reservations own these slots.
    let capacity = if matches!(job.task.as_str(), "build" | "building_work" | "water") {
        2
    } else {
        1
    };
    let free = capacity - occupied(v, r, &job.task, job.building, job.material);
    let mut better = 0;
    for peer in v
        .workforce_peers
        .iter()
        .flatten()
        .filter(|peer| peer.id != r.id && willing(v, peer, &job.task))
    {
        let point = if let Some(id) = job.building {
            v.buildings
                .iter()
                .find(|b| b.id == id)
                .and_then(|b| spacing::approach(v, b, peer.id))
        } else if matches!(job.task.as_str(), "source" | "prepare") {
            let mut worker = peer.clone();
            assign(&mut worker, v, &job.task, job.reason, false);
            (worker.task == job.task && worker.activity_material == job.material)
                .then_some((worker.target_x, worker.target_y))
        } else {
            Some(destination(v, &job.task, peer.id))
        };
        let Some((x, y)) = point else {
            continue;
        };
        let travel = (peer.x - x).hypot(peer.y - y) * MINUTES_PER_SECOND / 0.7;
        let s = score(v, peer, &job.task, job.urgency, travel);
        if s > job.score || (s == job.score && peer.id < r.id) {
            better += 1;
        }
        if better >= free {
            return false;
        }
    }
    true
}

#[wasm_bindgen]
impl Game {
    pub fn set_work_preference(&mut self, resident: usize, category: &str, level: u8) -> String {
        let Some(c) = CATEGORIES.iter().position(|c| *c == category) else {
            return "Unknown work preference.".into();
        };
        if resident >= 5 || level > 2 {
            return "Choose a resident and a valid work preference.".into();
        }
        self.app
            .world_mut()
            .resource_mut::<Village>()
            .workforce
            .preferences[resident][c] = level;
        "ok".into()
    }
    pub fn work_report(&mut self) -> String {
        let mut v = self.app.world().resource::<Village>().clone();
        let people: Vec<_> = self
            .app
            .world_mut()
            .query::<&Resident>()
            .iter(self.app.world())
            .cloned()
            .collect();
        refresh(&mut v, people.iter());
        let choices: Vec<_> = people
            .iter()
            .map(|r| serde_json::json!({"resident":r.id,"offers":offers(&v,r)}))
            .collect();
        serde_json::json!({"categories":CATEGORIES,"preferences":v.workforce.preferences,"days":v.workforce.days,"choices":choices,"note":"Preferences guide community work; meals, rest, sleep, agreements and outside shifts take precedence. Non-hauling travel estimates use the existing walking speed."}).to_string()
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn scene() -> (Game, Village, Resident) {
        let mut g = Game::new();
        let saved: Save = serde_json::from_str(&g.snapshot()).unwrap();
        let mut v = saved.village;
        v.minutes = 570.;
        v.food = 12.;
        v.meals = 8;
        v.water = 30.;
        let mut r = saved.residents[0].clone();
        r.x = 12.;
        r.y = 11.;
        r.hunger = 10.;
        r.energy = 90.;
        r.social = 90.;
        r.trip = None;
        r.task = "idle".into();
        r.remaining = 0.;
        r.last_meal_slot = 0;
        (g, v, r)
    }
    #[test]
    fn preferences_change_real_choices_but_urgent_water_and_rest_win() {
        let (_, mut v, mut r) = scene();
        v.workforce.preferences[0][2] = 2;
        v.workforce.preferences[0][4] = 0;
        choose(&mut r, &v);
        assert_eq!(r.task, "gather");
        v.workforce.preferences[0][2] = 0;
        v.workforce.preferences[0][4] = 2;
        choose(&mut r, &v);
        assert_eq!(r.task, "water");
        v.water = 5.;
        v.workforce.preferences[0][4] = 0;
        choose(&mut r, &v);
        assert_eq!(r.task, "water");
        r.energy = 10.;
        choose(&mut r, &v);
        assert_eq!(r.task, "rest");
        r.energy = 90.;
        v.minutes = 850.;
        choose(&mut r, &v);
        assert!(
            leisure::hobby(&r.task),
            "Work preferences cannot extend community hours"
        );
    }
    #[test]
    fn shared_queue_honours_work_positions_travel_and_recent_chores() {
        let (_, mut v, mut r) = scene();
        let before = offers(&v, &r);
        let gather = before.iter().find(|o| o.task == "gather").unwrap();
        let initial = gather.score;
        v.activity_claims[1] = Some(Claim {
            task: "gather".into(),
            building: None,
            material: None,
        });
        assert!(!offers(&v, &r).iter().any(|o| o.task == "gather"));
        v.activity_claims[1] = None;
        record(&mut v, 540., 570., [&r]); // idle is not a chore
        assert_eq!(v.workforce.days[0].residents[0], [0.; 5]);
        r.task = "gather".into();
        record(&mut v, 540., 570., [&r]);
        let tired_score = offers(&v, &r)
            .into_iter()
            .find(|o| o.task == "gather")
            .unwrap()
            .score;
        assert!(tired_score < initial);
        r.x = 3.;
        r.y = 11.;
        assert!(
            offers(&v, &r)
                .into_iter()
                .find(|o| o.task == "gather")
                .unwrap()
                .score
                > tired_score
        );
    }
    #[test]
    fn project_priority_selects_the_actual_site_and_caps_the_crew() {
        let (mut g, _, mut r) = scene();
        assert_eq!(g.place("garden", 6, 6), "ok");
        assert_eq!(g.place("garden", 16, 6), "ok");
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.minutes = 570.;
        v.food = 80.;
        v.meals = 8;
        v.water = 40.;
        logistics::fixture_stage(&mut v, 0);
        logistics::fixture_stage(&mut v, 1);
        v.economy.projects[0].priority = 0;
        v.economy.projects[1].priority = 3;
        choose(&mut r, &v);
        assert_eq!(r.task, "build");
        assert_eq!(r.activity_building, Some(1));
        let b = &v.buildings[1];
        assert_eq!(
            (r.target_x, r.target_y),
            spacing::approach(&v, b, r.id).unwrap()
        );
        for id in [1, 2] {
            v.activity_claims[id] = Some(Claim {
                task: "build".into(),
                building: Some(1),
                material: None,
            });
        }
        choose(&mut r, &v);
        assert_eq!(
            r.activity_building,
            Some(0),
            "Two workers already cover the high priority site"
        );
        v.activity_claims[1] = None;
        choose(&mut r, &v);
        assert_eq!(
            r.activity_building,
            Some(1),
            "A released position becomes available again"
        );
    }
    #[test]
    fn limited_job_goes_to_the_best_available_neighbour_and_rotates() {
        let (_, mut v, mut first) = scene();
        v.water = 40.;
        let mut near = first.clone();
        near.id = 1;
        near.x = 3.;
        near.y = 12.25;
        refresh(&mut v, [&first, &near]);
        choose(&mut first, &v);
        assert!(
            leisure::hobby(&first.task),
            "First in the entity loop must not monopolise a shared chore"
        );
        choose(&mut near, &v);
        assert_eq!(near.task, "gather");
        record(&mut v, 540., 780., [&near]);
        v.minutes = 2010.;
        near.task = "idle".into();
        near.remaining = 0.;
        first.task = "idle".into();
        first.remaining = 0.;
        refresh(&mut v, [&first, &near]);
        choose(&mut first, &v);
        assert_eq!(
            first.task, "gather",
            "Recent workload gives the neighbour a turn off"
        );
    }
    #[test]
    fn preferences_reports_and_work_history_round_trip_without_query_mutation() {
        let (mut g, _, _) = scene();
        assert_eq!(g.set_work_preference(0, "hauling", 2), "ok");
        let before = g.snapshot();
        let report: serde_json::Value = serde_json::from_str(&g.work_report()).unwrap();
        assert_eq!(report["preferences"][0][1], 2);
        assert_eq!(g.snapshot(), before);
        assert_ne!(g.set_work_preference(5, "hauling", 2), "ok");
        assert_ne!(g.set_work_preference(0, "hauling", 3), "ok");
        assert_eq!(g.snapshot(), before);
        let mut restored = Game::new();
        assert!(restored.restore(&before));
        assert_eq!(restored.snapshot(), before);
        let mut bad: serde_json::Value = serde_json::from_str(&before).unwrap();
        bad["village"]["workforce"]["preferences"][0][1] = serde_json::json!(9);
        assert!(!restored.restore(&bad.to_string()));
        assert_eq!(restored.snapshot(), before);
    }
    #[test]
    fn chore_history_splits_midnight_and_releases_rest_days() {
        let (_, mut v, mut r) = scene();
        r.task = "haul".into();
        record(&mut v, 1430., 1450., [&r]);
        assert_eq!(v.workforce.days.len(), 2);
        assert_eq!(v.workforce.days[0].residents[0][1], 10.);
        assert_eq!(v.workforce.days[1].residents[0][1], 10.);
        for day in 2..12 {
            record(
                &mut v,
                f64::from(day) * 1440.,
                f64::from(day) * 1440. + 1.,
                [&r],
            );
        }
        assert_eq!(v.workforce.days.len(), 8);
        assert_eq!(v.workforce.days[0].day, 4);
        v.minutes = 16000.;
        assert!(valid(&v));
        v.workforce.days[0].residents[0][1] = 1441.;
        assert!(!valid(&v));
    }
    #[test]
    fn people_already_cooking_cover_portions_and_ingredients_once() {
        let g = Game::new();
        let mut v = g.app.world().resource::<Village>().clone();
        v.food = 6.;
        v.meals = 0;
        assert!(cooking(&v, 0));
        v.activity_claims[0] = Some(Claim {
            task: "cook".into(),
            building: None,
            material: None,
        });
        assert!(cooking(&v, 1));
        v.activity_claims[1] = Some(Claim {
            task: "cook".into(),
            building: None,
            material: None,
        });
        assert!(!cooking(&v, 2));
        assert!(!urgent_food(&v, 2));
        assert!(
            cooking(&v, 0),
            "A chooser excludes its own completed or cancelled activity"
        );
    }
    #[test]
    fn enough_foragers_can_cover_an_emergency_without_sending_everybody() {
        let g = Game::new();
        let mut v = g.app.world().resource::<Village>().clone();
        v.food = 2.;
        v.meals = 0;
        assert!(urgent_food(&v, 0));
        v.activity_claims[0] = Some(Claim {
            task: "gather".into(),
            building: None,
            material: None,
        });
        assert!(urgent_food(&v, 1));
        v.activity_claims[1] = Some(Claim {
            task: "gather".into(),
            building: None,
            material: None,
        });
        assert!(!urgent_food(&v, 2));
        v.activity_claims[0] = None;
        assert!(
            urgent_food(&v, 2),
            "Interrupted foraging releases the expected food"
        );
    }
}
