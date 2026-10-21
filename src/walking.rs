//! Routed village work. Needs, leisure and off-site commutes keep their current
//! routines until their located services are introduced.
use crate::*;

#[derive(Clone, Default, Serialize, Deserialize)]
pub struct State {
    pub route: Option<Journey>,
    pub blocked: Option<Blocker>,
}
impl State {
    pub fn empty(&self) -> bool {
        self.route.is_none() && self.blocked.is_none()
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Journey {
    pub layout: u32,
    pub goal: [f32; 2],
    pub points: Vec<[f32; 2]>,
    pub next: usize,
    pub exiting: bool,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Blocker {
    pub task: String,
    pub building: Option<usize>,
    pub material: Option<usize>,
    pub goal: [f32; 2],
    pub layout: u32,
    pub retry_at: f32,
    pub reason: String,
}
pub fn supports(task: &str) -> bool {
    requests::work(task) || matches!(task, "visit" | "eat" | "gathering")
}
pub fn clear(r: &mut Resident) {
    r.walking.route = None;
}

pub fn target(v: &Village, r: &Resident) -> Result<[f32; 2], &'static str> {
    if r.task == "utility" {
        let id = r
            .activity_material
            .and_then(|n| u32::try_from(n).ok())
            .map(simulation::Id)
            .ok_or("This utility work has ended.")?;
        return utilities::crew_approach(v, id, r.id)
            .ok_or("This service job needs an available crew position and a clear route.");
    }
    if r.task == "restore" {
        let id = r
            .activity_material
            .and_then(|n| u32::try_from(n).ok())
            .map(simulation::Id)
            .ok_or("This soil work has ended.")?;
        return restoration::approach(v, id, r.id)
            .ok_or("Soil work needs delivered compost and a clear approach.");
    }
    if r.task == "eat" {
        return food::target(v, r);
    }
    if r.task == "water" {
        return water::target(v, r);
    }
    if matches!(r.task.as_str(), "prepare" | "craft" | "cook") {
        let id = r
            .activity_batch
            .ok_or("This activity no longer has a production batch.")?;
        let batch = production::batch(v, id).ok_or("This production batch is no longer active.")?;
        if !production::ready(v, batch) {
            return Err("This batch is waiting for inputs, an open worksite or output space.");
        }
        return production::approach(v, id, r.id)
            .map(|p| [p.0, p.1])
            .ok_or("Leave a clear approach to this production worksite.");
    }
    if r.task == "source" {
        let i = r
            .activity_material
            .ok_or("This activity no longer has a material worksite.")?;
        if !economy::local_job(v).is_some_and(|(task, index)| task == r.task && index == i) {
            return Err(
                "The material batch is not ready. Check inputs, project demand and output space.",
            );
        }
        let base = if r.task == "source" {
            let s = &v.economy.sources[i];
            (s.x as f32, s.y as f32)
        } else {
            v.buildings
                .iter()
                .find(|b| b.kind == "workshop" && b.progress >= 100.)
                .map_or(crate::camp(v), |b| (b.x as f32, b.y as f32))
        };
        return spacing::material_spot(v, base.0, base.1, r.id)
            .map(|p| [p.0, p.1])
            .ok_or("Leave a clear work position beside this material site.");
    }
    if let Some(id) = r.activity_building.or(r.visit_building) {
        let b = v
            .buildings
            .iter()
            .find(|b| b.id == id)
            .ok_or("The worksite has been removed.")?;
        if r.task == "build" {
            if !economy::can_build(v, id) {
                return Err("This construction stage is waiting for supplies or another job.");
            }
        } else if r.task == "building_work" {
            if building_work::job(v, id).is_none() || logistics::occupied_building(v, id) {
                return Err("The crew work is finished or is waiting for stored contents to move.");
            }
        } else if b.progress < 100. || building_work::job(v, id).is_some() {
            return Err("The requested worksite is closed for construction or crew work.");
        }
        if r.task == "garden"
            && !ecology::needs_tending(v, b, water::irrigation(v, water::Owner::Building(b.id)))
        {
            return Err("This plot is growing or needs water before tending can continue.");
        }
        return spacing::approach(v, b, r.id)
            .map(|p| [p.0, p.1])
            .ok_or("Leave a clear approach and a little room around this worksite.");
    }
    if r.task == "gather" {
        let base = (3., 11. + r.id as f32 * 1.25);
        if navigation::clear(v, base.0, base.1) && spacing::free_spot(v, base, r.id) {
            return Ok([base.0, base.1]);
        }
        return spacing::material_spot(v, base.0, base.1, r.id)
            .map(|p| [p.0, p.1])
            .ok_or("Leave a clear gathering spot along the western trees.");
    }
    Err("This activity no longer has a worksite.")
}
pub fn quote(v: &Village, r: &Resident) -> Result<(navigation::Route, bool), &'static str> {
    let goal = target(v, r)?;
    if cooling_down(v, r) {
        return Err("This route is blocked. Leave a clear path or wait for the next access check.");
    }
    navigation::work_route(v, [r.x, r.y], goal)
}
fn cooling_down(v: &Village, r: &Resident) -> bool {
    r.walking.blocked.as_ref().is_some_and(|b| {
        b.task == r.task
            && b.building == r.activity_building.or(r.visit_building)
            && b.material == r.activity_material
            && b.goal == [r.target_x, r.target_y]
            && b.layout == logistics::layout(v)
            && b.retry_at > v.minutes
    })
}
pub fn block(v: &Village, r: &mut Resident, reason: &str) {
    let job = Blocker {
        task: r.task.clone(),
        building: r.activity_building.or(r.visit_building),
        material: r.activity_material,
        goal: [r.target_x, r.target_y],
        layout: logistics::layout(v),
        retry_at: v.minutes + 30.,
        reason: reason.into(),
    };
    requests::pause(r);
    if let Some(q) = r.help.as_mut().filter(|q| q.active()) {
        q.phase = requests::Phase::Blocked;
        q.reason = reason.into();
    }
    r.walking.route = None;
    if !cooling_down(v, r) {
        r.walking.blocked = Some(job);
    }
    r.task = "idle".into();
    r.reason = format!("{reason} Taking a break where there is room.");
    r.remaining = 12.;
    r.activity_building = None;
    r.activity_material = None;
    r.activity_store = None;
    r.activity_batch = None;
    r.visit_building = None;
    r.requested = false;
    r.target_x = r.x;
    r.target_y = r.y;
    r.work_check_at = v.minutes;
}
fn step(
    v: &Village,
    r: &mut Resident,
    neighbours: &[(usize, f32, f32)],
    point: [f32; 2],
    dt: f32,
    exiting: bool,
) {
    let dt = if r.task == "water" {
        dt * skills::factor(v, r.id, skills::Skill::Logistics)
    } else {
        dt
    };
    let final_goal = (r.target_x, r.target_y);
    (r.target_x, r.target_y) = (point[0], point[1]);
    let old = [r.x, r.y];
    let origin = r.walking.route.as_ref().map_or(old, |p| p.points[0]);
    let speed = if v.roads.contains(&(r.x.round() as i32, r.y.round() as i32))
        && v.roads
            .contains(&(point[0].round() as i32, point[1].round() as i32))
    {
        1. / 0.6
    } else {
        1.
    };
    let allowed = |to| {
        if exiting {
            navigation::departure_turn(v, origin, to, point)
        } else {
            navigation::segment(v, old, to) && navigation::segment(v, to, point)
        }
    };
    if (r.x - point[0]).hypot(r.y - point[1]) > 0.001 {
        spacing::walk(v, r, neighbours, dt * speed);
    }
    if !allowed([r.x, r.y]) || (r.x - old[0]).hypot(r.y - old[1]) < 0.00001 {
        (r.x, r.y) = (old[0], old[1]);
        let dx = point[0] - r.x;
        let dy = point[1] - r.y;
        let distance = dx.hypot(dy);
        if distance > 0.001 {
            let n = (dt * speed * 0.7).min(distance);
            let p = [r.x + dx / distance * n, r.y + dy / distance * n];
            if allowed(p) {
                (r.x, r.y) = (p[0], p[1]);
            }
        }
    }
    (r.target_x, r.target_y) = final_goal;
}
/// True consumes this frame in travel or a safe handoff. Production only runs
/// after a later frame observes arrival at the actual work approach.
pub fn advance(v: &Village, r: &mut Resident, neighbours: &[(usize, f32, f32)], dt: f32) -> bool {
    // Utility crews work along a corridor. Finishing a cell changes the next
    // attended position without ending the resident's whole activity.
    if r.task == "utility" {
        let goal = match target(v, r) {
            Ok(goal) => goal,
            Err(reason) => {
                block(v, r, reason);
                return true;
            }
        };
        if let Some(reason) = r
            .activity_material
            .and_then(|n| u32::try_from(n).ok())
            .and_then(|id| utilities::crew_reason(v, simulation::Id(id)))
            && r.reason != reason
        {
            r.reason = reason.into();
        }
        if goal != [r.target_x, r.target_y] {
            (r.target_x, r.target_y) = (goal[0], goal[1]);
            clear(r);
        }
    }
    let layout = logistics::layout(v);
    if r.walking
        .route
        .as_ref()
        .is_none_or(|p| p.layout != layout || p.goal != [r.target_x, r.target_y])
    {
        let Ok(goal) = target(v, r) else {
            block(v, r, target(v, r).unwrap_err());
            return true;
        };
        let plan = navigation::work_route(v, [r.x, r.y], goal);
        let Ok((plan, exiting)) = plan else {
            block(v, r, plan.unwrap_err());
            return true;
        };
        (r.target_x, r.target_y) = (goal[0], goal[1]);
        r.walking.route = Some(Journey {
            layout,
            goal,
            points: plan.points,
            next: 1,
            exiting,
        });
        r.walking.blocked = None;
    }
    if (r.x - r.target_x).hypot(r.y - r.target_y) <= 0.08 {
        return false;
    }
    let j = r.walking.route.as_ref().unwrap();
    if !j.exiting
        && let Some(point) = j.points.get(j.next)
    {
        let stationary: Vec<_> = neighbours
            .iter()
            .filter(|(id, x, y)| {
                *id != r.id
                    && v.workforce_peers[*id].as_ref().is_some_and(|p| {
                        p.trip.is_none() && (p.x - p.target_x).hypot(p.y - p.target_y) <= 0.08
                    })
                    && (*x - r.x).hypot(*y - r.y) < 5.
            })
            .map(|(_, x, y)| [*x, *y])
            .collect();
        if (r.x - point[0]).hypot(r.y - point[1]) < 2.
            && stationary
                .iter()
                .any(|p| (p[0] - point[0]).hypot(p[1] - point[1]) < spacing::PERSONAL_SPACE)
            && let Ok(plan) = navigation::route_avoiding(v, [r.x, r.y], j.goal, &stationary)
        {
            let j = r.walking.route.as_mut().unwrap();
            j.points = plan.points;
            j.next = 1;
        }
    }
    let j = r.walking.route.as_ref().unwrap();
    let Some(point) = j.points.get(j.next).copied() else {
        r.walking.route = None;
        return true;
    };
    let exiting = j.exiting;
    step(v, r, neighbours, point, dt, exiting);
    r.energy = (r.energy - dt * 0.035).max(0.);
    if (r.x - point[0]).hypot(r.y - point[1]) <= 0.08 {
        r.x = point[0];
        r.y = point[1];
        let j = r.walking.route.as_mut().unwrap();
        j.next += 1;
        j.exiting = false;
    }
    true
}
pub fn valid(v: &Village, r: &Resident) -> bool {
    let finite = |p: &[f32; 2]| {
        p.iter()
            .all(|n| n.is_finite() && (0.0..=MAP_SIZE as f32).contains(n))
    };
    r.walking.route.as_ref().is_none_or(|p| {
        p.points.len() <= ((MAP_SIZE * MAP_SIZE) as usize + 3)
            && !p.points.is_empty()
            && p.next > 0
            && p.next <= p.points.len()
            && finite(&p.goal)
            && p.points.last() == Some(&p.goal)
            && p.points.iter().all(finite)
            && (!p.exiting || p.next == 1)
            && (p.layout != logistics::layout(v)
                || (navigation::clear(v, p.goal[0], p.goal[1])
                    && p.points.windows(2).enumerate().all(|(i, points)| {
                        if i == 0 {
                            navigation::exit_segment(v, points[0], points[1])
                        } else {
                            navigation::segment(v, points[0], points[1])
                        }
                    })
                    && (!supports(&r.task)
                        || (p.goal == [r.target_x, r.target_y]
                            && (if p.next == p.points.len() {
                                (r.x - p.goal[0]).hypot(r.y - p.goal[1]) <= 0.08
                            } else if p.exiting {
                                navigation::departure_step(v, p.points[0], [r.x, r.y])
                                    && navigation::exit_segment(v, p.points[0], p.points[p.next])
                            } else {
                                navigation::segment(v, [r.x, r.y], p.points[p.next])
                            })))))
    }) && r.walking.blocked.as_ref().is_none_or(|b| {
        supports(&b.task)
            && finite(&b.goal)
            && b.reason.len() <= 200
            && b.retry_at.is_finite()
            && (0.0..=v.minutes + 30.01).contains(&b.retry_at)
            && b.building.is_none_or(|id| id < v.economy.next_building)
            && b.material.is_none_or(|i| {
                if b.task == "source" {
                    i < v.economy.sources.len()
                } else if matches!(b.task.as_str(), "utility" | "restore") {
                    // A blocker is a historical message. Its work identity
                    // may outlive a cancelled or pruned order; active resident
                    // references are checked separately by save validation.
                    u32::try_from(i).is_ok_and(|id| id > 0 && id < v.simulation.next_id)
                } else {
                    i < economy::COUNT
                }
            })
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn scene() -> (Game, Village, Resident) {
        let mut g = Game::new();
        g.start_fixture_mode("sandbox");
        assert_eq!(g.place("home", 10, 9), "ok");
        let mut v = g.app.world().resource::<Village>().clone();
        v.minutes = 570.;
        navigation::refresh(&mut v);
        let mut r = g
            .app
            .world_mut()
            .query::<&Resident>()
            .iter(g.app.world())
            .next()
            .unwrap()
            .clone();
        r.x = 3.;
        r.y = 9.;
        r.trip = None;
        assign(&mut r, &v, "visit", "test", true);
        r.activity_building = Some(0);
        r.visit_building = Some(0);
        (g, v, r)
    }
    fn arrive(v: &Village, r: &mut Resident) -> usize {
        for frame in 0..2000 {
            let old = [r.x, r.y];
            let origin = r.walking.route.as_ref().map_or(old, |p| p.points[0]);
            let exiting = r.walking.route.as_ref().is_some_and(|p| p.exiting)
                || !navigation::clear(v, r.x, r.y);
            if !advance(v, r, &[], 0.1) {
                return frame;
            }
            assert!(
                if exiting {
                    navigation::departure_step(v, origin, [r.x, r.y])
                } else {
                    navigation::segment(v, old, [r.x, r.y])
                },
                "Crossed a foundation or the river"
            );
            assert!(valid(v, r));
        }
        panic!(
            "Resident did not arrive: {} at ({}, {}) toward ({}, {}): {}",
            r.reason,
            r.x,
            r.y,
            r.target_x,
            r.target_y,
            serde_json::to_string(&r.walking).unwrap()
        );
    }
    #[test]
    fn work_and_visits_detour_around_foundations_and_can_leave_an_occupied_origin() {
        let (_, mut v, mut r) = scene();
        v.buildings.push(Building {
            id: 1,
            kind: "home".into(),
            x: 6,
            y: 9,
            ..v.buildings[0].clone()
        });
        navigation::refresh(&mut v);
        let (plan, _) = quote(&v, &r).unwrap();
        assert!(
            plan.distance
                > (r.x - plan.points.last().unwrap()[0])
                    .hypot(r.y - plan.points.last().unwrap()[1])
        );
        arrive(&v, &mut r);
        assert!(valid(&v, &r));
        (r.x, r.y) = (6., 9.);
        clear(&mut r);
        assert!(quote(&v, &r).unwrap().1);
        arrive(&v, &mut r);
        assert!(valid(&v, &r));
        v.buildings.push(Building {
            id: 2,
            kind: "hydro".into(),
            x: (river_center(10.) - 1.35).ceil() as i32,
            y: 10,
            ..v.buildings[0].clone()
        });
        navigation::refresh(&mut v);
        (r.x, r.y) = ((river_center(10.) - 1.35).ceil(), 10.);
        clear(&mut r);
        assert!(!spacing::land(r.x, r.y));
        assert!(quote(&v, &r).unwrap().1);
        arrive(&v, &mut r);
        assert!(valid(&v, &r));
    }
    #[test]
    fn roads_reduce_actual_work_travel_and_layout_changes_retarget_the_destination() {
        let (_, v, r) = scene();
        let mut paved = v.clone();
        for x in 2..=14 {
            for y in 5..=13 {
                if navigation::clear(&paved, x as f32, y as f32) {
                    paved.roads.push((x, y));
                }
            }
        }
        navigation::refresh(&mut paved);
        let mut a = r.clone();
        let mut b = r.clone();
        let plain = arrive(&v, &mut a);
        let road = arrive(&paved, &mut b);
        assert!(
            road < plain * 8 / 10,
            "{road} road frames vs {plain} plain frames"
        );
        let mut moved = v.clone();
        let mut traveller = r.clone();
        advance(&moved, &mut traveller, &[], 0.1);
        let old = traveller.walking.route.as_ref().unwrap().goal;
        moved.buildings[0].x = 16;
        navigation::refresh(&mut moved);
        advance(&moved, &mut traveller, &[], 0.1);
        assert_ne!(traveller.walking.route.as_ref().unwrap().goal, old);
        assert!(traveller.target_x > 14.);
        arrive(&moved, &mut traveller);
        assert!(valid(&moved, &traveller));
    }
    #[test]
    fn blocked_routes_release_the_activity_and_recover_after_access_changes() {
        let (_, mut v, mut r) = scene();
        // A full column of occupied plots divides the western village from this site.
        let template = v.buildings[0].clone();
        for y in (1..MAP_SIZE).step_by(2) {
            v.buildings.push(Building {
                id: v.buildings.len(),
                x: 6,
                y,
                ..template.clone()
            });
        }
        navigation::refresh(&mut v);
        assert!(quote(&v, &r).is_err());
        let mut work = v.clone();
        work.buildings[0].kind = "garden".into();
        crate::logistics::fixture_stock(&mut work, crate::economy::FOOD, (0.) as u32);
        crate::logistics::fixture_stock(&mut work, crate::economy::MEALS, 0);
        let offers = workforce::offers(&work, &r);
        let garden = offers.iter().find(|o| o.task == "garden").unwrap();
        assert!(garden.blocker.is_some());
        assert!(garden.travel_minutes.is_none());
        let mut neighbour = r.clone();
        assert!(workforce::choose_work(&mut neighbour, &work));
        assert_eq!(
            neighbour.task, "gather",
            "A blocked garden must leave the resident free for reachable food work"
        );
        assert!(advance(&v, &mut r, &[], 0.1));
        assert_eq!(r.task, "idle");
        assert!(!r.requested);
        assert!(r.walking.blocked.is_some());
        let retry = r.walking.blocked.as_ref().unwrap().retry_at;
        assign(&mut r, &v, "visit", "test", true);
        r.activity_building = Some(0);
        r.visit_building = Some(0);
        assert!(cooling_down(&v, &r));
        block(&v, &mut r, "Route remains blocked.");
        assert_eq!(r.walking.blocked.as_ref().unwrap().retry_at, retry);
        v.buildings.retain(|b| b.id == 0);
        navigation::refresh(&mut v);
        assign(&mut r, &v, "visit", "test", true);
        r.activity_building = Some(0);
        r.visit_building = Some(0);
        assert!(!cooling_down(&v, &r));
        arrive(&v, &mut r);
        assert!(r.walking.blocked.is_none());
    }
    #[test]
    fn mid_route_checkpoints_are_exact_and_invalid_geometry_is_rejected_atomically() {
        let (mut g, v, mut r) = scene();
        advance(&v, &mut r, &[], 0.1);
        let id = r.id;
        *g.app
            .world_mut()
            .query::<&mut Resident>()
            .iter_mut(g.app.world_mut())
            .find(|p| p.id == id)
            .unwrap() = r;
        let before = g.snapshot();
        let mut h = Game::new();
        assert!(h.restore(&before));
        assert_eq!(h.snapshot(), before);
        for _ in 0..40 {
            g.tick(0.1);
            h.tick(0.1);
            assert_eq!(g.snapshot(), h.snapshot());
        }
        let mut bad: serde_json::Value = serde_json::from_str(&before).unwrap();
        let journey = &mut bad["residents"][id]["walking"]["route"];
        journey["points"][1] = serde_json::json!([10., 9.]);
        let unchanged = h.snapshot();
        assert!(!h.restore(&bad.to_string()));
        assert_eq!(h.snapshot(), unchanged);
        let mut bad: serde_json::Value = serde_json::from_str(&before).unwrap();
        bad["residents"][id]["target_x"] = serde_json::json!(10.);
        bad["residents"][id]["target_y"] = serde_json::json!(9.);
        let journey = &mut bad["residents"][id]["walking"]["route"];
        journey["goal"] = serde_json::json!([10., 9.]);
        journey["points"] = serde_json::json!([[10., 9.]]);
        journey["next"] = serde_json::json!(1);
        assert!(
            !h.restore(&bad.to_string()),
            "A forged completed route cannot grant access inside a foundation"
        );
        assert_eq!(h.snapshot(), unchanged);
    }
    #[test]
    fn the_resident_loop_finishes_the_same_requested_batch_sooner_with_roads() {
        fn finish(paved: bool) -> usize {
            let mut g = Game::new();
            g.start_fixture_mode("sandbox");
            assert_eq!(g.place("home", 7, 12), "ok");
            {
                let mut v = g.app.world_mut().resource_mut::<Village>();
                v.arrived = true;
                v.minutes = 540.;
                crate::logistics::fixture_stock(&mut v, crate::economy::FOOD, (80.) as u32);
                crate::logistics::fixture_stock(&mut v, crate::economy::MEALS, 10);
                crate::water::fixture_fresh(&mut v, 40.);
                if paved {
                    for x in 2..=12 {
                        for y in 8..=16 {
                            if navigation::clear(&v, x as f32, y as f32) {
                                v.roads.push((x, y));
                            }
                        }
                    }
                }
            }
            for mut r in g
                .app
                .world_mut()
                .query::<&mut Resident>()
                .iter_mut(g.app.world_mut())
            {
                r.task = "idle".into();
                r.activity_store = None;
                r.remaining = 90.;
                r.energy = 90.;
                r.hunger = 10.;
                // Keep the requested worker ready; the other neighbours take
                // social breaks so this comparison isolates road travel.
                r.social = if r.id == 0 { 90. } else { 10. };
                r.last_meal_slot = 0;
                (r.x, r.y) = (10. + r.id as f32, 13.);
                (r.target_x, r.target_y) = (r.x, r.y);
            }
            assert!(g.request(0, "gather", false).contains("Happy"));
            for frame in 0..2000 {
                let r = g
                    .app
                    .world_mut()
                    .query::<&Resident>()
                    .iter(g.app.world())
                    .find(|r| r.id == 0)
                    .unwrap();
                if r.help.as_ref().unwrap().phase == requests::Phase::Complete {
                    assert_eq!(g.app.world().resource::<Village>().supplies.gathered, 2.);
                    return frame;
                }
                let old = [r.x, r.y];
                g.tick(0.1);
                let r = g
                    .app
                    .world_mut()
                    .query::<&Resident>()
                    .iter(g.app.world())
                    .find(|r| r.id == 0)
                    .unwrap();
                assert!(navigation::segment(
                    g.app.world().resource::<Village>(),
                    old,
                    [r.x, r.y]
                ));
                assert_ne!(r.help.as_ref().unwrap().phase, requests::Phase::Blocked);
            }
            panic!("Requested forage did not complete");
        }
        let plain = finish(false);
        let paved = finish(true);
        assert!(
            paved < plain * 9 / 10,
            "{paved} paved frames vs {plain} plain frames"
        );
    }
    #[test]
    fn steering_at_a_crowded_corner_keeps_the_next_waypoint_reachable() {
        let (_, mut v, mut r) = scene();
        let mut b = v.buildings[0].clone();
        b.kind = "garden".into();
        b.x = 13;
        b.y = 10;
        v.buildings = vec![b];
        navigation::refresh(&mut v);
        (r.x, r.y) = (11.15, 10.75);
        (r.target_x, r.target_y) = (12., 11.);
        let point = [12., 11.];
        assert!(navigation::segment(&v, [r.x, r.y], point));
        step(&v, &mut r, &[(1, 11.4, 11.2)], point, 0.25, false);
        assert!(
            navigation::segment(&v, [r.x, r.y], point),
            "Avoiding a neighbour cannot strand a walker behind a plot corner"
        );
    }
}
