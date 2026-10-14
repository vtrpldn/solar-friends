//! Persistent, bounded helping orders. Resident activities remain the claims.
use crate::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Accepted,
    Travelling,
    Working,
    Paused,
    Blocked,
    Complete,
    Cancelled,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Request {
    pub id: simulation::Id,
    pub task: String,
    pub building: Option<usize>,
    pub material: Option<usize>,
    pub destination: Option<(i32, i32)>,
    pub created: f32,
    pub finished: Option<f32>,
    pub remaining: f32,
    pub phase: Phase,
    pub reason: String,
}
impl Request {
    pub fn active(&self) -> bool {
        !matches!(self.phase, Phase::Complete | Phase::Cancelled)
    }
}
pub fn work(task: &str) -> bool {
    matches!(
        task,
        "build"
            | "building_work"
            | "gather"
            | "garden"
            | "water"
            | "cook"
            | "compost"
            | "craft"
            | "source"
            | "prepare"
    )
}
pub fn allowed(task: &str) -> bool {
    work(task) || matches!(task, "eat" | "rest" | "socialize" | "outside")
}
pub fn pending(r: &Resident, task: &str) -> bool {
    r.help
        .as_ref()
        .is_some_and(|q| q.active() && q.task == task)
}
fn continuous(task: &str) -> bool {
    matches!(task, "build" | "building_work" | "outside")
}
fn finish(r: &mut Resident, v: &Village, phase: Phase, reason: &str) {
    if let Some(q) = r.help.as_mut() {
        q.phase = phase;
        q.reason = reason.into();
        q.finished = Some(v.minutes);
    }
    if r.requested {
        r.remaining = 0.;
    }
    r.requested = false;
}
pub fn observe(r: &mut Resident, v: &Village) {
    let Some(q) = r.help.as_ref().filter(|q| q.active()).cloned() else {
        return;
    };
    if q.task == "build" {
        match v.buildings.iter().find(|b| Some(b.id) == q.building) {
            None => {
                finish(
                    r,
                    v,
                    Phase::Cancelled,
                    "That project was removed. Your request is cancelled.",
                );
                return;
            }
            Some(b) if b.progress >= 100. => {
                finish(r, v, Phase::Complete, "The requested building is ready.");
                return;
            }
            _ => {}
        }
    } else if q.task == "building_work"
        && q.building
            .is_some_and(|id| building_work::job(v, id).is_none())
    {
        let b = v.buildings.iter().find(|b| Some(b.id) == q.building);
        let done = if let Some((x, y)) = q.destination {
            b.is_some_and(|b| b.progress >= 100. && (b.x, b.y) == (x, y))
        } else {
            b.is_none()
        };
        finish(
            r,
            v,
            if done {
                Phase::Complete
            } else {
                Phase::Cancelled
            },
            if done {
                "The requested crew job is finished."
            } else {
                "The crew job was cancelled."
            },
        );
        return;
    } else if q.task == "outside"
        && r.trip.is_none()
        && v.economy.work_day[r.id] >= (q.created / 1440.) as i32
    {
        finish(
            r,
            v,
            Phase::Complete,
            "The outside shift is finished and the income has reached the community fund.",
        );
        return;
    } else if q
        .building
        .is_some_and(|id| !v.buildings.iter().any(|b| b.id == id))
        || (q.task == "source"
            && q.material
                .is_some_and(|i| v.economy.sources.get(i).is_none_or(|s| !s.active)))
    {
        finish(
            r,
            v,
            Phase::Cancelled,
            "The requested worksite was removed.",
        );
        return;
    }
    let matching = r.requested && (r.task == q.task || (r.task == "haul" && continuous(&q.task)));
    if matching {
        let away = r
            .trip
            .as_ref()
            .is_some_and(|t| t.phase == mobility::Phase::Away);
        let travelling = if let Some(t) = &r.trip {
            t.phase != mobility::Phase::Away
        } else {
            (r.x - r.target_x).hypot(r.y - r.target_y) > 0.08 || r.task == "haul"
        };
        let q = r.help.as_mut().unwrap();
        q.phase = if travelling {
            Phase::Travelling
        } else {
            Phase::Working
        };
        q.reason = if away {
            "Working the outside shift.".into()
        } else {
            r.reason.clone()
        };
    } else if q.phase != Phase::Blocked {
        let q = r.help.as_mut().unwrap();
        q.phase = Phase::Paused;
        q.reason = match r.task.as_str() {
            "eat" => "Paused for a meal. The request will continue afterwards.",
            "rest" => "Paused for rest. The request is saved.",
            "sleep" => "Paused for sleep. The request will continue during community hours.",
            "sanitation" => "Paused for a private moment. The request is saved.",
            _ if work(&q.task) && !work_time(v.minutes) => {
                "Waiting for community hours: 09:00–12:00 and 15:00–16:00."
            }
            _ => "Waiting for a safe moment to continue.",
        }
        .into();
    }
}
pub fn pause(r: &mut Resident) {
    if let Some(q) = r.help.as_mut().filter(|q| q.active()) {
        if r.requested && r.task == q.task && !continuous(&q.task) {
            q.remaining = r.remaining.max(0.01);
        }
        q.phase = Phase::Paused;
        q.reason = "Waiting for a safe moment to continue.".into();
        r.requested = false;
    }
}
fn wait(r: &mut Resident, phase: Phase, reason: &str) -> bool {
    let q = r.help.as_mut().unwrap();
    q.phase = phase;
    q.reason = reason.into();
    r.requested = false;
    false
}
pub fn resume(r: &mut Resident, v: &Village) -> bool {
    observe(r, v);
    let Some(q) = r.help.as_ref().filter(|q| q.active()).cloned() else {
        return false;
    };
    if work(&q.task) && !work_time(v.minutes) && !(q.task == "gather" && supplies::urgent(v)) {
        return wait(
            r,
            Phase::Paused,
            "Waiting for community hours: 09:00–12:00 and 15:00–16:00.",
        );
    }
    if situations::protected(v, r.id, &q.task) {
        return wait(
            r,
            Phase::Paused,
            "Our community agreement comes first. The request is saved.",
        );
    }
    let task = if q.task == "build" {
        let id = q.building.unwrap();
        if v.economy
            .projects
            .iter()
            .any(|p| p.building == id && p.paused)
        {
            return wait(
                r,
                Phase::Blocked,
                "This project is paused. Resume it in Construction or cancel the request.",
            );
        }
        if economy::can_build(v, id) {
            "build"
        } else {
            "haul"
        }
    } else if q.task == "building_work"
        && q.building
            .is_some_and(|id| logistics::occupied_building(v, id))
    {
        "haul"
    } else {
        q.task.as_str()
    };
    if task == "haul" {
        let mut worker = r.clone();
        worker.task = "haul".into();
        worker.requested = true;
        if logistics::quote(v, &worker).is_none() {
            return wait(
                r,
                Phase::Blocked,
                "Waiting for site supplies or an accessible supply route. Check project materials and leave clear approaches.",
            );
        }
    } else if matches!(task, "source" | "prepare") {
        if !economy::local_job(v).is_some_and(|(t, i)| t == task && Some(i) == q.material) {
            return wait(
                r,
                Phase::Blocked,
                "That batch is not ready. Check its inputs, output space and current project demand.",
            );
        }
    } else if task != "build" && task != "building_work" && !available(v, task) {
        return wait(
            r,
            Phase::Blocked,
            "The requested batch is not ready. Check its supplies or cancel this request.",
        );
    }
    if !workforce::claim_available(v, r, task, q.building, q.material) {
        return wait(
            r,
            Phase::Blocked,
            "Another neighbour is using that work position. I will wait for a turn.",
        );
    }
    assign(
        r,
        v,
        task,
        "Continuing the work you asked me to help with.",
        true,
    );
    if let Some(id) = q.building.filter(|_| task != "haul") {
        let Some(b) = v.buildings.iter().find(|b| b.id == id) else {
            return false;
        };
        let Some((x, y)) = spacing::approach(v, b, r.id) else {
            return wait(
                r,
                Phase::Blocked,
                "The worksite has no clear approach. Leave some breathing space around it.",
            );
        };
        r.task = task.into();
        r.activity_building = Some(id);
        r.target_x = x;
        r.target_y = y;
    }
    if r.task != task {
        return wait(
            r,
            Phase::Blocked,
            "There is no clear work position at the requested site.",
        );
    }
    r.activity_material = q.material;
    if !continuous(&q.task) {
        r.remaining = q.remaining;
    }
    observe(r, v);
    true
}
pub fn completed_batch(r: &mut Resident, v: &Village, completed: bool) {
    let Some(q) = r
        .help
        .as_ref()
        .filter(|q| q.active() && q.task == r.task && r.requested)
    else {
        return;
    };
    if continuous(&q.task) {
        observe(r, v);
        return;
    }
    if completed {
        finish(
            r,
            v,
            Phase::Complete,
            "Finished the batch you asked me to help with.",
        );
    } else {
        r.help.as_mut().unwrap().remaining = 10.;
        wait(
            r,
            Phase::Blocked,
            "This batch could not finish. Its supplies, demand or worksite changed.",
        );
    }
}
pub fn matches_haul(r: &Resident, from: logistics::Owner, to: logistics::Owner) -> bool {
    let Some(q) = r
        .help
        .as_ref()
        .filter(|q| q.active() && r.requested && r.task == "haul")
    else {
        return true;
    };
    match (q.task.as_str(), q.building) {
        ("build", Some(id)) => to == logistics::Owner::Site(id),
        ("building_work", Some(id)) => {
            matches!(from,logistics::Owner::Warehouse(b)|logistics::Owner::Site(b) if b==id)
        }
        _ => true,
    }
}
pub fn enqueue(v: &mut Village, r: &mut Resident, task: &str, encourage: bool) -> String {
    let building = if task == "build" {
        v.economy
            .projects
            .iter()
            .filter(|p| {
                building_work::job(v, p.building).is_none()
                    && v.buildings
                        .iter()
                        .any(|b| b.id == p.building && b.progress < 100.)
            })
            .max_by_key(|p| (p.priority, std::cmp::Reverse(p.building)))
            .map(|p| p.building)
    } else if task == "building_work" {
        v.building_jobs.first().map(|j| j.building)
    } else if task == "rest" {
        shelter(v, r.id).map(|b| b.id)
    } else if matches!(
        task,
        "source" | "prepare" | "outside" | "water" | "gather" | "rest" | "socialize" | "eat"
    ) {
        if matches!(task, "source" | "prepare" | "outside" | "water" | "gather") {
            None
        } else {
            destination_building(v, task, r.id).map(|b| b.id)
        }
    } else {
        destination_building(v, task, r.id).map(|b| b.id)
    };
    let material = if matches!(task, "source" | "prepare") {
        economy::local_job(v).map(|(_, i)| i)
    } else {
        None
    };
    let Some(id) = v.simulation.allocate() else {
        return "The work identity limit has been reached.".into();
    };
    logistics::interrupt(v, r);
    let destination = building
        .and_then(|id| building_work::job(v, id))
        .and_then(|j| j.destination);
    r.help = Some(Request {
        id,
        task: task.into(),
        building,
        material,
        destination,
        created: v.minutes,
        finished: None,
        remaining: if task == "eat" {
            5.
        } else if matches!(task, "rest" | "socialize") {
            12.
        } else {
            10.
        },
        phase: Phase::Accepted,
        reason: "Your request is accepted.".into(),
    });
    r.requested = false;
    if !resume(r, v) {
        assign(
            r,
            v,
            "rest",
            "Your request is saved. Taking a break until it can continue.",
            false,
        );
    }
    let reason = if encourage {
        "You explained why this matters. I'll lend a hand."
    } else {
        "Happy to help with your request."
    };
    format!("{}: {reason} {}", r.name, r.help.as_ref().unwrap().reason)
}
pub fn valid(v: &Village, r: &Resident) -> bool {
    let Some(q) = &r.help else {
        return true;
    };
    q.id.0 > 0
        && q.id.0 < v.simulation.next_id
        && allowed(&q.task)
        && q.created.is_finite()
        && (0.0..=v.minutes).contains(&q.created)
        && q.remaining.is_finite()
        && (0.0..=100.).contains(&q.remaining)
        && q.reason.len() <= 300
        && q.finished
            .is_none_or(|at| at.is_finite() && at >= q.created && at <= v.minutes)
        && (q.active() == q.finished.is_none())
        && q.building.is_none_or(|id| {
            id < v.economy.next_building && (!q.active() || v.buildings.iter().any(|b| b.id == id))
        })
        && (!matches!(
            q.task.as_str(),
            "build" | "building_work" | "garden" | "cook" | "compost" | "craft"
        ) || q.building.is_some())
        && q.material.is_none_or(|i| {
            if q.task == "source" {
                v.economy
                    .sources
                    .get(i)
                    .is_some_and(|s| !q.active() || s.active)
            } else {
                q.task == "prepare" && i < economy::COUNT
            }
        })
        && (matches!(q.task.as_str(), "source" | "prepare") == q.material.is_some())
        && (q.task != "prepare" || q.material.is_some_and(|i| (5..=8).contains(&i)))
        && (q.task != "building_work"
            || !q.active()
            || q.building.is_some_and(|id| {
                building_work::job(v, id).is_some_and(|j| j.destination == q.destination)
            }))
        && (!matches!(
            q.task.as_str(),
            "source" | "prepare" | "outside" | "water" | "gather"
        ) || q.building.is_none())
        && q.destination.is_none_or(|(x, y)| {
            q.task == "building_work"
                && (1..MAP_SIZE - 1).contains(&x)
                && (1..MAP_SIZE - 1).contains(&y)
        })
}

#[wasm_bindgen]
impl Game {
    pub fn cancel_help(&mut self, id: usize) -> String {
        let mut v = self.app.world().resource::<Village>().clone();
        let mut query = self.app.world_mut().query::<&mut Resident>();
        let Some(mut r) = query.iter_mut(self.app.world_mut()).find(|r| r.id == id) else {
            return "Resident not found.".into();
        };
        if r.help.as_ref().is_none_or(|q| !q.active()) {
            return "There is no active request to cancel.".into();
        }
        if r.requested {
            logistics::interrupt(&mut v, &r);
        }
        finish(
            &mut r,
            &v,
            Phase::Cancelled,
            "You cancelled this request. Carried supplies remain recoverable.",
        );
        self.app.insert_resource(v);
        "ok".into()
    }
}

impl Game {
    pub(crate) fn sync_help(&mut self) {
        let v = self.app.world().resource::<Village>().clone();
        let mut query = self.app.world_mut().query::<&mut Resident>();
        for mut r in query.iter_mut(self.app.world_mut()) {
            observe(&mut r, &v);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn scene() -> Game {
        let mut g = Game::new();
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.arrived = true;
            v.minutes = 540.;
            v.food = 80.;
            v.meals = 10;
            v.water = 40.;
        }
        let mut q = g.app.world_mut().query::<&mut Resident>();
        for mut r in q.iter_mut(g.app.world_mut()) {
            r.task = "idle".into();
            r.remaining = 90.;
            r.energy = 90.;
            r.hunger = 10.;
            r.social = 90.;
            r.last_meal_slot = 0;
            r.x = CAMP.0 + (r.id as f32 - 2.) * 1.25;
            r.y = CAMP.1;
            r.target_x = r.x;
            r.target_y = r.y;
        }
        g
    }
    fn person(g: &mut Game, id: usize) -> Resident {
        g.app
            .world_mut()
            .query::<&Resident>()
            .iter(g.app.world())
            .find(|r| r.id == id)
            .unwrap()
            .clone()
    }
    fn until(g: &mut Game, mut test: impl FnMut(&mut Game) -> bool) {
        for _ in 0..12000 {
            if test(g) {
                return;
            }
            g.tick(0.25);
        }
        panic!("Request failed to make progress: {}", g.snapshot());
    }
    fn checkpoint(g: &mut Game) {
        let saved = g.snapshot();
        let mut copy = Game::new();
        assert!(copy.restore(&saved));
        assert_eq!(copy.snapshot(), saved);
        for _ in 0..4 {
            g.tick(0.25);
            copy.tick(0.25);
        }
        assert_eq!(g.snapshot(), copy.snapshot());
    }
    #[test]
    fn accepted_requests_travel_finish_once_and_deduplicate_without_allocating() {
        let mut g = scene();
        assert!(g.request(0, "gather", false).contains("Happy"));
        let initial = g.snapshot();
        let id = person(&mut g, 0).help.unwrap().id;
        assert!(g.request(0, "gather", false).contains("already accepted"));
        assert_eq!(g.snapshot(), initial);
        assert_eq!(g.app.world().resource::<Village>().food, 80.);
        g.tick(0.25);
        assert_eq!(person(&mut g, 0).help.unwrap().phase, Phase::Travelling);
        checkpoint(&mut g);
        until(&mut g, |g| {
            person(g, 0).help.as_ref().unwrap().phase == Phase::Working
        });
        checkpoint(&mut g);
        until(&mut g, |g| {
            person(g, 0).help.as_ref().unwrap().phase == Phase::Complete
        });
        assert_eq!(g.app.world().resource::<Village>().supplies.gathered, 2.);
        assert_eq!(person(&mut g, 0).help.unwrap().id, id);
        for _ in 0..80 {
            g.tick(0.25);
        }
        assert_eq!(g.app.world().resource::<Village>().supplies.gathered, 2.);
        checkpoint(&mut g);
    }
    #[test]
    fn a_rest_interruption_preserves_partial_work_and_eventually_resumes() {
        let mut g = scene();
        g.request(0, "gather", false);
        until(&mut g, |g| {
            person(g, 0).help.as_ref().unwrap().phase == Phase::Working
        });
        for _ in 0..8 {
            g.tick(0.25);
        }
        {
            let mut q = g.app.world_mut().query::<&mut Resident>();
            q.iter_mut(g.app.world_mut())
                .find(|r| r.id == 0)
                .unwrap()
                .energy = 20.;
        }
        g.tick(0.25);
        let r = person(&mut g, 0);
        let q = r.help.unwrap();
        assert_eq!(r.task, "rest");
        assert_eq!(q.phase, Phase::Paused);
        assert!(q.reason.contains("rest"));
        assert!(q.remaining > 0. && q.remaining < 10.);
        checkpoint(&mut g);
        until(&mut g, |g| {
            person(g, 0).help.as_ref().unwrap().phase == Phase::Complete
        });
        assert_eq!(g.app.world().resource::<Village>().supplies.gathered, 2.);
    }
    #[test]
    fn queued_work_waits_through_the_evening_and_sleep_without_extending_shifts() {
        let mut g = scene();
        g.app.world_mut().resource_mut::<Village>().minutes = 1000.;
        assert!(g.request(0, "gather", false).contains("Happy"));
        assert_eq!(person(&mut g, 0).help.unwrap().phase, Phase::Paused);
        let id = person(&mut g, 0).help.unwrap().id;
        let mut slept = false;
        until(&mut g, |g| {
            let r = person(g, 0);
            let v = g.app.world().resource::<Village>();
            slept |= r.task == "sleep";
            if r.requested && work(&r.task) {
                assert!(work_time(v.minutes));
            }
            assert_eq!(r.help.as_ref().unwrap().id, id);
            r.help.unwrap().phase == Phase::Complete
        });
        assert!(slept);
        checkpoint(&mut g);
    }
    #[test]
    fn helping_a_project_includes_its_haul_and_follows_all_construction_stages() {
        let mut g = scene();
        assert_eq!(g.place("garden", 6, 6), "ok");
        assert_eq!(g.place("garden", 18, 18), "ok");
        g.app.world_mut().resource_mut::<Village>().economy.projects[1].priority = 3;
        assert!(g.request(0, "build", false).contains("Happy"));
        assert_eq!(person(&mut g, 0).help.unwrap().building, Some(1));
        let mut hauled = false;
        until(&mut g, |g| {
            let r = person(g, 0);
            let v = g.app.world().resource::<Village>();
            for h in v
                .logistics
                .as_ref()
                .unwrap()
                .shipments
                .iter()
                .filter(|h| h.resident == 0)
            {
                let store = v
                    .logistics
                    .as_ref()
                    .unwrap()
                    .stores
                    .iter()
                    .find(|p| p.id == h.to)
                    .unwrap();
                assert_eq!(store.owner, logistics::Owner::Site(1));
                hauled = true;
            }
            r.help.unwrap().phase == Phase::Complete
        });
        assert!(hauled);
        assert_eq!(
            g.app.world().resource::<Village>().buildings[1].progress,
            100.
        );
        checkpoint(&mut g);
    }
    #[test]
    fn cancellation_and_corrupt_request_references_are_atomic() {
        let mut g = scene();
        g.request(0, "gather", false);
        let saved = g.snapshot();
        let mut bad: serde_json::Value = serde_json::from_str(&saved).unwrap();
        bad["residents"][0]["help"]["id"] = serde_json::json!(1);
        assert!(!g.restore(&bad.to_string()));
        assert_eq!(g.snapshot(), saved);
        bad = serde_json::from_str(&saved).unwrap();
        bad["residents"][0]["help"]["task"] = serde_json::json!("nature_walk");
        assert!(!g.restore(&bad.to_string()));
        assert_eq!(g.snapshot(), saved);
        assert_eq!(g.cancel_help(0), "ok");
        assert_eq!(person(&mut g, 0).help.unwrap().phase, Phase::Cancelled);
        let cancelled = g.snapshot();
        assert_ne!(g.cancel_help(0), "ok");
        assert_eq!(g.snapshot(), cancelled);
        checkpoint(&mut g);
        assert!(g.request(0, "gather", false).contains("Happy"));
        assert!(person(&mut g, 0).help.unwrap().id.0 > 2);
    }
    #[test]
    fn a_busy_kitchen_queues_the_second_request_without_double_claiming_a_batch() {
        let mut g = scene();
        assert_eq!(g.place("kitchen", 8, 8), "ok");
        logistics::fixture_finish(&mut g.app.world_mut().resource_mut::<Village>(), 0);
        assert!(g.request(0, "cook", false).contains("Happy"));
        assert!(g.request(1, "cook", false).contains("Happy"));
        assert_eq!(person(&mut g, 1).help.unwrap().phase, Phase::Blocked);
        checkpoint(&mut g);
        until(&mut g, |g| {
            let a = person(g, 0);
            let b = person(g, 1);
            assert!(!(a.requested && a.task == "cook" && b.requested && b.task == "cook"));
            a.help.unwrap().phase == Phase::Complete && b.help.unwrap().phase == Phase::Complete
        });
        assert_eq!(
            g.app.world().resource::<Village>().supplies.meals_cooked,
            10
        );
        checkpoint(&mut g);
    }
    #[test]
    fn a_batch_with_lost_inputs_reports_a_blocker_instead_of_false_completion() {
        let mut g = scene();
        assert_eq!(g.place("kitchen", 8, 8), "ok");
        logistics::fixture_finish(&mut g.app.world_mut().resource_mut::<Village>(), 0);
        assert!(g.request(0, "cook", false).contains("Happy"));
        g.app.world_mut().resource_mut::<Village>().food = 2.;
        {
            let mut query = g.app.world_mut().query::<&mut Resident>();
            for mut r in query.iter_mut(g.app.world_mut()).filter(|r| r.id != 0) {
                r.social = 50.;
            }
        }
        until(&mut g, |g| {
            person(g, 0).help.unwrap().phase == Phase::Blocked
        });
        assert_eq!(g.app.world().resource::<Village>().supplies.meals_cooked, 0);
        assert!(
            person(&mut g, 0)
                .help
                .unwrap()
                .reason
                .contains("could not finish")
        );
        checkpoint(&mut g);
    }
    #[test]
    fn cancelling_a_building_request_puts_carried_supplies_down_without_losing_them() {
        let mut g = scene();
        assert_eq!(g.place("garden", 18, 18), "ok");
        g.request(0, "build", false);
        until(&mut g, |g| {
            g.app
                .world()
                .resource::<Village>()
                .logistics
                .as_ref()
                .unwrap()
                .shipments
                .iter()
                .any(|h| h.resident == 0 && h.carrying)
        });
        let before: [u32; economy::COUNT] =
            std::array::from_fn(|i| economy::quantity(g.app.world().resource::<Village>(), i));
        assert_eq!(g.cancel_help(0), "ok");
        let v = g.app.world().resource::<Village>();
        assert_eq!(before, std::array::from_fn(|i| economy::quantity(v, i)));
        assert!(
            !v.logistics
                .as_ref()
                .unwrap()
                .shipments
                .iter()
                .any(|h| h.resident == 0)
        );
        assert!(
            v.logistics
                .as_ref()
                .unwrap()
                .stores
                .iter()
                .any(|p| p.owner == logistics::Owner::Ground && p.items.iter().any(|n| *n > 0))
        );
        checkpoint(&mut g);
    }
    #[test]
    fn cancelled_projects_and_crew_jobs_detach_requests_before_the_next_save() {
        let mut g = scene();
        assert_eq!(g.place("garden", 6, 6), "ok");
        g.request(0, "build", false);
        assert_eq!(g.cancel_project(0), "ok");
        assert_eq!(person(&mut g, 0).help.unwrap().phase, Phase::Cancelled);
        checkpoint(&mut g);
        assert_eq!(g.place("garden", 6, 6), "ok");
        logistics::fixture_finish(&mut g.app.world_mut().resource_mut::<Village>(), 1);
        assert_eq!(g.queue_building_work(1, "move", 18, 18), "ok");
        assert!(g.request(0, "building_work", false).contains("Happy"));
        assert_eq!(person(&mut g, 0).help.unwrap().destination, Some((18, 18)));
        assert_eq!(g.cancel_building_work(1), "ok");
        assert_eq!(person(&mut g, 0).help.unwrap().phase, Phase::Cancelled);
        checkpoint(&mut g);
        assert_eq!(g.queue_building_work(1, "demolish", 0, 0), "ok");
        g.request(0, "building_work", false);
        until(&mut g, |g| {
            person(g, 0).help.unwrap().phase == Phase::Complete
        });
        assert!(g.app.world().resource::<Village>().buildings.is_empty());
        checkpoint(&mut g);
    }
}
