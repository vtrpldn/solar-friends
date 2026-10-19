use crate::*;

#[derive(Clone, Copy)]
pub struct Job {
    pub title: &'static str,
    pub place: &'static str,
    pub description: &'static str,
    pub income: i64,
}
pub const NAMES: [&str; 5] = ["Iara", "Bento", "Luz", "Cauã", "Nina"];
pub const JOBS: [Job; 5] = [
    Job {
        title: "Plant nursery assistant",
        place: "a native plant nursery",
        description: "Propagates native seedlings and helps neighbours bring degraded land back to life.",
        income: 16000,
    },
    Job {
        title: "Bamboo carpenter",
        place: "a local building cooperative",
        description: "Makes bamboo frames and repairs verandas using practical, low-impact building skills.",
        income: 24000,
    },
    Job {
        title: "School canteen cook",
        place: "the nearby rural school",
        description: "Cooks seasonal lunches for local children and swaps recipes with the kitchen team.",
        income: 18000,
    },
    Job {
        title: "Atlantic Forest guide",
        place: "a community ecotourism group",
        description: "Leads nature walks, identifies edible plants, and shares the forest's stories with visitors.",
        income: 20000,
    },
    Job {
        title: "Rainwater systems technician",
        place: "a regional water cooperative",
        description: "Services cisterns and pumps so neighbouring households can rely on clean stored rainwater.",
        income: 22000,
    },
];
pub fn available(v: &Village, id: usize) -> bool {
    id < 5
        && v.economy.outside_jobs[id]
        && mobility::departure_time(v.minutes)
        && v.economy.outside_committed_days[id] != (v.minutes / 1440.) as i32
        && v.economy.work_day[id] != (v.minutes / 1440.) as i32
}
pub fn view(v: &Village) -> serde_json::Value {
    serde_json::json!((0..5).map(|id| serde_json::json!({"id":id,"name":NAMES[id],"title":JOBS[id].title,"place":JOBS[id].place,"description":JOBS[id].description,"income":JOBS[id].income,"enabled":v.economy.outside_jobs[id],"paid_today":v.economy.work_day[id]==(v.minutes/1440.) as i32,"committed_today":v.economy.outside_committed_days[id]==(v.minutes/1440.) as i32})).collect::<Vec<_>>())
}
pub fn migrate(save: &mut Save) {
    let e = &mut save.village.economy;
    if e.outside_work {
        e.outside_jobs[4] = true;
    }
    if e.outside_committed_day >= 0 {
        for r in &save.residents {
            if r.trip
                .as_ref()
                .is_some_and(|t| t.purpose == mobility::Purpose::Work)
                && let Some(day) = e.outside_committed_days.get_mut(r.id)
            {
                *day = e.outside_committed_day;
            }
        }
    }
    e.outside_work = false;
    e.outside_committed_day = -1;
}

#[cfg(test)]
mod tests {
    use super::*;
    fn healthy() -> Game {
        let mut g = Game::new();
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.arrived = true;
            v.minutes = 540.;
            crate::logistics::fixture_stock(&mut v, crate::economy::FOOD, (80.) as u32);
            crate::logistics::fixture_stock(&mut v, crate::economy::MEALS, 10);
        }
        let mut q = g.app.world_mut().query::<&mut Resident>();
        for mut r in q.iter_mut(g.app.world_mut()) {
            r.task = "idle".into();
            r.activity_store = None;
            r.remaining = 90.;
            r.energy = 90.;
            r.hunger = 20.;
            r.social = 90.;
            r.last_meal_slot = 0;
            r.target_x = r.x;
            r.target_y = r.y;
        }
        g
    }
    fn save(g: &mut Game) -> Save {
        serde_json::from_str(&g.snapshot()).unwrap()
    }
    #[test]
    fn five_independent_jobs_leave_pay_once_and_finish_when_disabled() {
        let mut g = healthy();
        for id in 0..5 {
            assert!(g.set_resident_job(id, true));
        }
        g.tick(0.25);
        assert!(save(&mut g).residents.iter().all(|r| {
            r.trip
                .as_ref()
                .is_some_and(|t| t.purpose == mobility::Purpose::Work)
        }));
        let raw = g.snapshot();
        assert!(g.restore(&raw));
        assert_eq!(g.snapshot(), raw);
        for _ in 0..1000 {
            if save(&mut g).residents.iter().all(|r| {
                r.trip
                    .as_ref()
                    .is_some_and(|t| t.phase == mobility::Phase::Away)
            }) {
                break;
            }
            g.tick(0.25);
        }
        assert!(g.fast_forward_ready());
        let funds = save(&mut g).village.economy.money;
        for id in 0..5 {
            assert!(g.set_resident_job(id, false));
        }
        let raw = g.snapshot();
        assert!(g.restore(&raw));
        g.app.world_mut().resource_mut::<Village>().minutes = 1019.;
        g.tick(0.25);
        assert_eq!(save(&mut g).village.economy.money, funds);
        g.app.world_mut().resource_mut::<Village>().minutes = 1020.;
        g.tick(0.25);
        let returned = save(&mut g);
        assert_eq!(returned.village.economy.money, funds + 100000);
        assert_eq!(returned.village.economy.work_day, [0; 5]);
        assert!(!g.fast_forward_ready());
        let raw = g.snapshot();
        assert!(g.restore(&raw));
        for _ in 0..100 {
            g.tick(0.25);
        }
        assert_eq!(save(&mut g).village.economy.money, funds + 100000);
        assert_eq!(save(&mut g).village.economy.outside_jobs, [false; 5]);
    }
    #[test]
    fn toggles_are_individual_and_tired_residents_rest_instead() {
        let mut g = healthy();
        assert!(g.set_resident_job(0, true));
        assert!(g.set_resident_job(1, true));
        let before = g.snapshot();
        assert!(!g.set_resident_job(99, true));
        assert_eq!(g.snapshot(), before);
        assert!(!g.request(2, "outside", true).contains("lend a hand"));
        g.app
            .world_mut()
            .query::<&mut Resident>()
            .iter_mut(g.app.world_mut())
            .find(|r| r.id == 0)
            .unwrap()
            .energy = 20.;
        g.tick(0.25);
        let s = save(&mut g);
        assert!(s.residents[0].trip.is_none());
        assert!(s.residents[1].trip.is_some());
        assert!(s.residents[2..].iter().all(|r| r.trip.is_none()));
        assert_eq!(
            s.village.economy.outside_jobs,
            [true, true, false, false, false]
        );
    }
    #[test]
    fn previous_shared_job_settings_and_committed_trip_migrate() {
        let mut g = healthy();
        g.set_resident_job(0, true);
        g.tick(0.25);
        let mut old: serde_json::Value = serde_json::from_str(&g.snapshot()).unwrap();
        let e = old["village"]["economy"].as_object_mut().unwrap();
        e.remove("outside_jobs");
        e.remove("outside_committed_days");
        e.insert("outside_work".into(), true.into());
        e.insert("outside_committed_day".into(), 0.into());
        assert!(g.restore(&old.to_string()));
        let s = save(&mut g);
        assert_eq!(
            s.village.economy.outside_jobs,
            [false, false, false, false, true]
        );
        assert_eq!(s.village.economy.outside_committed_days[0], 0);
        let raw = g.snapshot();
        assert!(g.restore(&raw));
        assert_eq!(g.snapshot(), raw);
    }
}
