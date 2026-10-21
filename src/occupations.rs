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
        title: "Nature guide",
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
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Profession {
    None,
    NurseryAssistant,
    BambooCarpenter,
    SchoolCook,
    NatureGuide,
    WaterTechnician,
}
impl Profession {
    pub fn definition(self) -> Option<Job> {
        match self {
            Self::None => None,
            Self::NurseryAssistant => Some(JOBS[0]),
            Self::BambooCarpenter => Some(JOBS[1]),
            Self::SchoolCook => Some(JOBS[2]),
            Self::NatureGuide => Some(JOBS[3]),
            Self::WaterTechnician => Some(JOBS[4]),
        }
    }
    pub fn skill(self) -> skills::Skill {
        match self {
            Self::BambooCarpenter => skills::Skill::Building,
            Self::SchoolCook => skills::Skill::Cooking,
            Self::WaterTechnician => skills::Skill::Care,
            _ => skills::Skill::Farming,
        }
    }
}
pub const FOUNDING_PROFESSIONS: [Profession; 5] = [
    Profession::NurseryAssistant,
    Profession::BambooCarpenter,
    Profession::SchoolCook,
    Profession::NatureGuide,
    Profession::WaterTechnician,
];
pub fn founding_professions() -> std::collections::BTreeMap<usize, Profession> {
    FOUNDING_PROFESSIONS.into_iter().enumerate().collect()
}
pub fn profession(v: &Village, id: usize) -> Option<Profession> {
    v.economy
        .outside_professions
        .get(&id)
        .copied()
        .filter(|p| *p != Profession::None)
}
pub fn job(v: &Village, id: usize) -> Option<Job> {
    profession(v, id).and_then(Profession::definition)
}
pub fn catalog() -> serde_json::Value {
    serde_json::json!([Profession::None,Profession::NurseryAssistant,Profession::BambooCarpenter,Profession::SchoolCook,Profession::NatureGuide,Profession::WaterTechnician].into_iter().map(|p|serde_json::json!({"key":p,"title":p.definition().map(|j|j.title).unwrap_or("No outside job"),"description":p.definition().map(|j|j.description).unwrap_or("Available for village life without an outside shift."),"income":p.definition().map(|j|j.income).unwrap_or(0)})).collect::<Vec<_>>())
}
pub fn resident_name(v: &Village, id: usize) -> String {
    v.workforce_peers
        .get(&id)
        .and_then(Option::as_ref)
        .map(|p| p.name.clone())
        .or_else(|| {
            v.scenario
                .as_ref()
                .and_then(|o| o.definition.start.residents.as_ref())
                .and_then(|people| people.iter().find(|p| p.slot() == Some(id)))
                .map(|p| p.name.clone())
        })
        .unwrap_or_else(|| NAMES.get(id).unwrap_or(&"Resident").to_string())
}
pub fn available(v: &Village, id: usize) -> bool {
    job(v, id).is_some()
        && v.economy.outside_jobs.get(&id) == Some(&true)
        && mobility::departure_time(v.minutes)
        && v.economy
            .outside_committed_days
            .get(&id)
            .is_some_and(|d| *d != (v.minutes / 1440.) as i32)
        && v.economy
            .work_day
            .get(&id)
            .is_some_and(|d| *d != (v.minutes / 1440.) as i32)
}
pub fn view(v: &Village) -> serde_json::Value {
    serde_json::json!(v.economy.outside_professions.iter().map(|(&id,&profession)| {
        let job=profession.definition();
        serde_json::json!({"id":id,"name":resident_name(v,id),"profession":profession,"title":job.map(|j|j.title).unwrap_or("No outside job"),"place":job.map(|j|j.place).unwrap_or(""),"description":job.map(|j|j.description).unwrap_or("Available for village life without an outside shift."),"income":job.map(|j|j.income).unwrap_or(0),"available":job.is_some(),"enabled":v.economy.outside_jobs.get(&id).copied().unwrap_or(false),"paid_today":v.economy.work_day.get(&id)==Some(&((v.minutes/1440.) as i32)),"committed_today":v.economy.outside_committed_days.get(&id)==Some(&((v.minutes/1440.) as i32))})
    }).collect::<Vec<_>>())
}
pub fn migrate(save: &mut Save) {
    let e = &mut save.village.economy;
    if e.outside_work
        && let Some(enabled) = e.outside_jobs.get_mut(&4)
    {
        *enabled = true;
    }
    if e.outside_committed_day >= 0 {
        for r in &save.residents {
            if r.trip
                .as_ref()
                .is_some_and(|t| t.purpose == mobility::Purpose::Work)
                && let Some(day) = e.outside_committed_days.get_mut(&r.id)
            {
                *day = e.outside_committed_day;
            }
        }
    }
    e.outside_work = false;
    e.outside_committed_day = -1;
}

/// Historical saves stored employment in five ordinal slots. Preserve every
/// existing setting and paid/committed day when decoding those saves.
pub fn migrate_records(raw: &mut serde_json::Value) -> bool {
    let Some(e) = raw["village"]["economy"].as_object_mut() else {
        return false;
    };
    for (field, fallback) in [
        ("outside_jobs", serde_json::json!(vec![false; 5])),
        ("outside_committed_days", serde_json::json!(vec![-1; 5])),
        ("work_day", serde_json::Value::Null),
    ] {
        let value = e.get(field).cloned().unwrap_or(fallback);
        let converted = if let Some(values) = value.as_array() {
            if values.len() != 5 {
                return false;
            }
            serde_json::Value::Object(
                values
                    .iter()
                    .enumerate()
                    .map(|(id, value)| (id.to_string(), value.clone()))
                    .collect(),
            )
        } else if value.is_object() {
            value
        } else {
            return false;
        };
        e.insert(field.into(), converted);
    }
    e.entry("outside_professions")
        .or_insert_with(|| serde_json::to_value(founding_professions()).unwrap());
    true
}
pub fn matches_residents(e: &economy::Economy, people: &[Resident]) -> bool {
    let ids: std::collections::BTreeSet<_> = people.iter().map(|p| p.id).collect();
    ids.len() == people.len()
        && e.outside_jobs.keys().copied().eq(ids.iter().copied())
        && e.outside_committed_days
            .keys()
            .copied()
            .eq(ids.iter().copied())
        && e.work_day.keys().copied().eq(ids.iter().copied())
        && e.outside_professions
            .keys()
            .copied()
            .eq(ids.iter().copied())
        && e.outside_jobs.iter().all(|(id, enabled)| {
            !enabled
                || e.outside_professions
                    .get(id)
                    .is_some_and(|p| *p != Profession::None)
        })
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
        assert_eq!(
            returned.village.economy.work_day,
            economy::founding_records(0)
        );
        assert!(!g.fast_forward_ready());
        let raw = g.snapshot();
        assert!(g.restore(&raw));
        for _ in 0..100 {
            g.tick(0.25);
        }
        assert_eq!(save(&mut g).village.economy.money, funds + 100000);
        assert_eq!(
            save(&mut g).village.economy.outside_jobs,
            economy::founding_records(false)
        );
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
            [(0, true), (1, true), (2, false), (3, false), (4, false)]
                .into_iter()
                .collect()
        );
    }
    #[test]
    fn previous_shared_job_settings_and_committed_trip_migrate() {
        let mut g = healthy();
        g.set_resident_job(0, true);
        g.tick(0.25);
        let mut old: serde_json::Value = serde_json::from_str(&g.snapshot()).unwrap();
        old["village"]["version"] = 35.into();
        let e = old["village"]["economy"].as_object_mut().unwrap();
        e.remove("outside_jobs");
        e.remove("outside_committed_days");
        e.insert("outside_work".into(), true.into());
        e.insert("outside_committed_day".into(), 0.into());
        assert!(g.restore(&old.to_string()));
        let s = save(&mut g);
        assert_eq!(
            s.village.economy.outside_jobs,
            [(0, false), (1, false), (2, false), (3, false), (4, true)]
                .into_iter()
                .collect()
        );
        assert_eq!(s.village.economy.outside_committed_days[&0], 0);
        let raw = g.snapshot();
        assert!(g.restore(&raw));
        assert_eq!(g.snapshot(), raw);
    }
    #[test]
    fn sparse_employment_uses_the_chosen_profession_and_pays_only_once() {
        let mut v = Village {
            minutes: 1020.,
            ..Village::default()
        };
        v.economy.outside_jobs = [(42, true)].into_iter().collect();
        v.economy.outside_committed_days = [(42, -1)].into_iter().collect();
        v.economy.work_day = [(42, -1)].into_iter().collect();
        v.economy.outside_professions = [(42, Profession::SchoolCook)].into_iter().collect();
        v.skills.people = [(42, skills::Person::default())].into_iter().collect();
        let mut person = initialization::founding_residents(CAMP).remove(0);
        person.id = 42;
        person.name = "João".into();
        v.workforce_peers.insert(42, Some(person.clone()));
        assert!(matches_residents(&v.economy, &[person]));
        v.minutes = 540.;
        assert!(available(&v, 42));
        assert!(!available(&v, 0));
        v.economy.outside_committed_days.insert(42, 0);
        v.minutes = 1020.;
        let before = v.economy.money;
        economy::finish_outside(&mut v, 42);
        assert_eq!(v.economy.money, before + 18000);
        assert_eq!(
            v.skills.people[&42].experience[skills::Skill::Cooking as usize],
            2
        );
        assert!(v.economy.ledger.last().unwrap().note.contains("João"));
        economy::finish_outside(&mut v, 42);
        economy::finish_outside(&mut v, 0);
        assert_eq!(v.economy.money, before + 18000);
        assert_eq!(v.economy.work_day[&42], 0);
    }
    #[test]
    fn legacy_employment_arrays_preserve_settings_history_and_other_state() {
        let mut g = healthy();
        let before = g.snapshot();
        let mut old: serde_json::Value = serde_json::from_str(&before).unwrap();
        old["village"]["version"] = 35.into();
        let e = &mut old["village"]["economy"];
        e["outside_jobs"] = serde_json::json!([true, false, true, false, true]);
        e["outside_committed_days"] = serde_json::json!([0, -1, 0, -1, 0]);
        e["work_day"] = serde_json::json!([-1, -1, 0, -1, -1]);
        e.as_object_mut().unwrap().remove("outside_professions");
        assert!(g.restore(&old.to_string()));
        let after: serde_json::Value = serde_json::from_str(&g.snapshot()).unwrap();
        for field in ["outside_jobs", "outside_committed_days", "work_day"] {
            for id in 0..5 {
                assert_eq!(
                    after["village"]["economy"][field][id.to_string()],
                    old["village"]["economy"][field][id]
                );
            }
        }
        assert_eq!(after["residents"], old["residents"]);
        assert_eq!(after["village"]["skills"], old["village"]["skills"]);
        assert_eq!(
            after["village"]["economy"]["money"],
            old["village"]["economy"]["money"]
        );
        let canonical = g.snapshot();
        assert!(g.restore(&canonical));
        assert_eq!(g.snapshot(), canonical);
        old["village"]["economy"]["work_day"] = serde_json::json!([-1, -1, -1, -1]);
        assert!(!g.restore(&old.to_string()));
        assert_eq!(g.snapshot(), canonical);
    }
    #[test]
    fn malformed_shared_toggle_and_jobless_commute_are_rejected_without_panics() {
        let mut g = healthy();
        let before = g.snapshot();
        let mut bad: serde_json::Value = serde_json::from_str(&before).unwrap();
        bad["village"]["economy"]["outside_work"] = true.into();
        bad["village"]["economy"]["outside_jobs"]
            .as_object_mut()
            .unwrap()
            .remove("4");
        assert!(!g.restore(&bad.to_string()));
        assert_eq!(g.snapshot(), before);
        g.set_resident_job(0, true);
        g.tick(0.25);
        let travelling = g.snapshot();
        let mut bad: serde_json::Value = serde_json::from_str(&travelling).unwrap();
        assert_eq!(bad["residents"][0]["trip"]["purpose"], "work");
        bad["village"]["economy"]["outside_jobs"]["0"] = false.into();
        bad["village"]["economy"]["outside_professions"]["0"] = "none".into();
        assert!(!g.restore(&bad.to_string()));
        assert_eq!(g.snapshot(), travelling);
    }
    #[test]
    fn current_employment_rejects_missing_or_orphaned_records_and_aliased_keys() {
        let mut g = healthy();
        let before = g.snapshot();
        for field in [
            "outside_jobs",
            "outside_committed_days",
            "work_day",
            "outside_professions",
        ] {
            for case in 0..4 {
                let mut bad: serde_json::Value = serde_json::from_str(&before).unwrap();
                let e = &mut bad["village"]["economy"];
                match case {
                    0 => {
                        e.as_object_mut().unwrap().remove(field);
                    }
                    1 => {
                        e[field].as_object_mut().unwrap().remove("0");
                    }
                    2 => {
                        let value = e[field]["0"].clone();
                        e[field]["42"] = value;
                    }
                    _ => {
                        let value = e[field]["0"].clone();
                        e[field].as_object_mut().unwrap().remove("0");
                        e[field]["00"] = value;
                    }
                }
                assert!(!g.restore(&bad.to_string()), "{field} case {case}");
                assert_eq!(g.snapshot(), before);
            }
        }
    }
}
