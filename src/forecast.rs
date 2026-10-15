//! Conditional projections replay the real simulation in an isolated village.
//! The desktop runs this bounded query in a worker, never in its rendering loop.
use crate::*;

#[derive(Serialize)]
struct Project {
    building: usize,
    completed_at: Option<f32>,
    window: Option<[f32; 2]>,
    blocker: Option<String>,
    on_site: economy::Bundle,
    reserved: economy::Bundle,
}

fn waiting(v: &Village, id: usize) -> String {
    let Some(p) = v.economy.projects.iter().find(|p| p.building == id) else {
        return "This project was removed during the forecast.".into();
    };
    if p.paused {
        return "This project is paused. Resume it to make room for construction work.".into();
    }
    if building_work::job(v, id).is_some() {
        return "Building crew work takes precedence at this site.".into();
    }
    if let Some(reason) = v.logistics.as_ref().and_then(|s| {
        s.stores
            .iter()
            .find(|s| s.owner == logistics::Owner::Site(id))
            .and_then(|s| s.blocker.as_ref())
    }) {
        return reason.clone();
    }
    let b = v.buildings.iter().find(|b| b.id == id).unwrap();
    let missing = !p.committed
        && economy::recipe(&b.kind, &p.recipe)
            .unwrap()
            .get(p.stage)
            .is_some_and(|s| s.items.iter().enumerate().any(|(i, n)| *n > p.reserved[i]));
    if missing {
        return requests::supply_wait(v, id);
    }
    if v.economy.outside_jobs.iter().all(|enabled| *enabled) {
        return "All five neighbours have outside shifts. Keep someone available during community hours for hauling and construction.".into();
    }
    if !economy::can_build(v, id) {
        return "Reserved supplies did not reach the site within this window. Review outside shifts, helping requests, storage access and receiving room.".into();
    }
    if !v.workforce_peers.iter().flatten().any(|r| {
        spacing::approach(v, b, r.id)
            .is_some_and(|(x, y)| navigation::work_route(v, [r.x, r.y], [x, y]).is_ok())
    }) {
        return "No neighbour has a clear route to this supplied worksite. Leave a clear path and approach around its plot.".into();
    }
    "Supplied work did not finish within this window. Review outside shifts, helping requests and competing projects.".into()
}

#[wasm_bindgen]
impl Game {
    /// No command is sent to the live village. Dates assume that the player
    /// keeps current plans, schedules and requests and makes no new purchases.
    pub fn project_forecast(&mut self, days: u8) -> String {
        if !(1..=14).contains(&days) {
            return serde_json::json!({"error":"Choose a forecast window of 1–14 days."})
                .to_string();
        }
        let saved = self.snapshot();
        let mut copy = Game::new();
        if !copy.restore(&saved) {
            return serde_json::json!({"error":"This checkpoint cannot be forecast. Export it for inspection."}).to_string();
        }
        let original = copy.app.world().resource::<Village>();
        let based_at = original.minutes;
        let mut projects: Vec<_> = original
            .economy
            .projects
            .iter()
            .filter(|p| {
                original
                    .buildings
                    .iter()
                    .any(|b| b.id == p.building && b.progress < 100.)
                    && building_work::original_progress(original, p.building)
                        .is_none_or(|p| p < 100.)
            })
            .map(|p| Project {
                building: p.building,
                completed_at: None,
                window: None,
                blocker: None,
                on_site: logistics::project_items(original, p.building),
                reserved: p.reserved,
            })
            .collect();
        let paid_orders: Vec<_> = original
            .economy
            .orders
            .iter()
            .filter(|o| !matches!(o.status.as_str(), "delivered" | "cancelled"))
            .cloned()
            .collect();
        let before_funds = original.economy.money;
        // Tick at the same bounded step as play. Inspect native state rather
        // than serialising every frame; only the final report crosses to JS.
        let frames = u32::from(days) * 1920;
        for frame in 0..=frames {
            let v = copy.app.world().resource::<Village>();
            for p in projects
                .iter_mut()
                .filter(|p| p.completed_at.is_none() && p.blocker.is_none())
            {
                match v.buildings.iter().find(|b| b.id == p.building) {
                    Some(b) if b.progress >= 100. => {
                        p.completed_at = Some(v.minutes);
                        p.window = Some([
                            ((v.minutes / 30.).floor() * 30.).max(based_at),
                            (v.minutes / 30.).ceil() * 30.,
                        ]);
                    }
                    None => {
                        p.blocker = Some("This project was removed during the forecast.".into())
                    }
                    _ => {}
                }
            }
            if frame == frames {
                break;
            }
            copy.tick(0.25);
        }
        let v = copy.app.world().resource::<Village>();
        for p in projects
            .iter_mut()
            .filter(|p| p.completed_at.is_none() && p.blocker.is_none())
        {
            p.blocker = Some(waiting(v, p.building));
        }
        serde_json::json!({"schema":1,"based_at":based_at,"through":v.minutes,"days":days,
            "funds_before":before_funds,"funds_projected":v.economy.money,"projects":projects,
            "paid_orders":paid_orders,
            "assumptions":"Current plans, work preferences, outside shifts and requests stay unchanged. Residents keep their needs and community hours. Paid orders and local production continue; no new purchases or player actions are assumed. Dates are rounded to half-hour windows and are conditional, not promises."}).to_string()
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
            crate::logistics::fixture_stock(&mut v, crate::economy::FOOD, (80.) as u32);
            crate::logistics::fixture_stock(&mut v, crate::economy::MEALS, 10);
            crate::water::fixture_fresh(&mut v, 40.);
        }
        for mut r in g
            .app
            .world_mut()
            .query::<&mut Resident>()
            .iter_mut(g.app.world_mut())
        {
            r.task = "idle".into();
            r.activity_store = None;
            r.remaining = 0.;
            r.trip = None;
            r.energy = 90.;
            r.hunger = 10.;
            r.social = 90.;
            r.last_meal_slot = 0;
            r.x = CAMP.0 + (r.id as f32 - 2.) * 1.25;
            r.y = CAMP.1;
            r.target_x = r.x;
            r.target_y = r.y;
        }
        assert_eq!(g.place("garden", 13, 15), "ok");
        g
    }
    fn report(g: &mut Game, days: u8) -> serde_json::Value {
        let before = g.snapshot();
        let r = serde_json::from_str(&g.project_forecast(days)).unwrap();
        let r: serde_json::Value = r;
        if (1..=14).contains(&days) {
            assert!(r["error"].is_null(), "{r}");
        }
        assert_eq!(
            g.snapshot(),
            before,
            "Forecasting must not reserve goods, allocate work, pay income or advance the live clock"
        );
        r
    }
    #[test]
    fn forecast_completion_and_funds_match_real_play_and_survive_checkpoints() {
        let mut g = scene();
        let before = g.snapshot();
        let r = report(&mut g, 1);
        let expected = r["projects"][0]["completed_at"].as_f64().unwrap();
        let bounds = r["projects"][0]["window"].as_array().unwrap();
        assert!(bounds[0].as_f64().unwrap() <= expected && bounds[1].as_f64().unwrap() >= expected);
        let mut h = Game::new();
        assert!(h.restore(&before));
        assert_eq!(report(&mut h, 1), r);
        let mut completed = None;
        while g.app.world().resource::<Village>().minutes < r["through"].as_f64().unwrap() as f32 {
            g.tick(0.25);
            let v = g.app.world().resource::<Village>();
            if completed.is_none() && v.buildings[0].progress >= 100. {
                completed = Some(v.minutes);
            }
        }
        assert_eq!(completed.unwrap() as f64, expected);
        assert_eq!(
            g.app.world().resource::<Village>().economy.money,
            r["funds_projected"].as_i64().unwrap()
        );
    }
    #[test]
    fn outside_shifts_change_both_project_timing_and_the_same_horizon_funds() {
        let mut local = scene();
        let mut away = scene();
        away.set_outside_work(true);
        for id in 0..5 {
            assert!(away.set_resident_job(id, true));
        }
        let local = report(&mut local, 2);
        let away = report(&mut away, 2);
        let finish = local["projects"][0]["completed_at"].as_f64().unwrap();
        assert!(
            away["projects"][0]["completed_at"]
                .as_f64()
                .is_none_or(|t| t > finish)
        );
        assert!(
            away["funds_projected"].as_i64().unwrap() > local["funds_projected"].as_i64().unwrap()
        );
        assert_eq!(away["through"], local["through"]);
        assert!(
            away["projects"][0]["blocker"]
                .as_str()
                .is_some_and(|s| s.contains("outside shifts"))
        );
    }
    #[test]
    fn paused_and_unfunded_projects_report_blockers_and_invalid_windows_are_atomic() {
        let mut g = scene();
        assert_eq!(g.configure_project(0, 1, true, "standard"), "ok");
        let paused = report(&mut g, 1);
        assert!(paused["projects"][0]["completed_at"].is_null());
        assert!(
            paused["projects"][0]["blocker"]
                .as_str()
                .unwrap()
                .contains("paused")
        );
        assert_eq!(g.configure_project(0, 1, false, "standard"), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            for i in 0..economy::COUNT {
                logistics::fixture_stock(&mut v, i, 0);
            }
            economy::rebalance(&mut v);
        }
        let missing = report(&mut g, 1);
        assert!(missing["projects"][0]["completed_at"].is_null());
        assert!(
            missing["projects"][0]["blocker"]
                .as_str()
                .unwrap()
                .contains("needs")
        );
        assert!(report(&mut g, 0)["error"].is_string());
        assert!(report(&mut g, 15)["error"].is_string());
    }
    #[test]
    fn a_paid_delivery_is_included_and_cannot_be_used_before_arrival() {
        let mut g = scene();
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            for i in 0..economy::COUNT {
                logistics::fixture_stock(&mut v, i, 0);
            }
            economy::rebalance(&mut v);
        }
        let needed = economy::shortage(g.app.world().resource::<Village>());
        assert_eq!(
            g.order_supplies(&serde_json::to_string(&needed).unwrap()),
            "ok"
        );
        let arrival = g.app.world().resource::<Village>().economy.orders[0].arrival;
        let r = report(&mut g, 2);
        assert_eq!(
            r["paid_orders"][0]["arrival"].as_f64().unwrap(),
            arrival as f64
        );
        assert!(r["projects"][0]["completed_at"].as_f64().unwrap() > arrival as f64);
    }
}
