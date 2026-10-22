use super::*;
fn condition(minutes: u32, resident: Option<&str>) -> GoalCondition {
    GoalCondition::Wellbeing {
        resident: resident.map(str::to_owned),
        energy_min: 25.,
        hunger_max: 65.,
        social_min: 25.,
        happiness_min: 0.,
        minutes,
    }
}
fn definition(c: GoalCondition) -> Definition {
    let mut d = Definition::builtin(modes::Mode::Sandbox);
    d.journal=Some(serde_json::from_value(serde_json::json!({"schema":1,"introduction":"Room to live","completion":"Keep caring for each other.","chapters":[{"id":"first","title":"Settling in","description":"","goals":[{"id":"comfortable","title":"Feel at home","description":"","optional":false,"condition":c}]}]})).unwrap());
    d
}
fn game(d: Definition) -> Game {
    compile(d)
        .unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()))
        .0
}
fn report(g: &Game) -> serde_json::Value {
    serde_json::from_str(&g.scenario_journal()).unwrap()
}
fn view(g: &Game) -> serde_json::Value {
    report(g)["chapters"][0]["goals"][0]["condition"].clone()
}
fn people(g: &mut Game) -> Vec<Resident> {
    let world = g.app.world_mut();
    let mut q = world.query::<&Resident>();
    q.iter(world).cloned().collect()
}
fn edit(g: &mut Game, id: usize, energy: f32) {
    let world = g.app.world_mut();
    let mut q = world.query::<&mut Resident>();
    for mut p in q.iter_mut(world) {
        if p.id == id {
            p.energy = energy;
        }
    }
}
fn sample(g: &mut Game) {
    let p = people(g);
    observe(&mut g.app.world_mut().resource_mut::<Village>(), &p);
}
#[test]
fn actual_steps_earn_time_with_no_arrival_or_story_rule_shortcut_and_pause_is_exact() {
    let mut g = game(definition(condition(2, None)));
    assert_eq!(view(&g)["value"], 0.);
    assert_eq!(view(&g)["people"]["total"], 5);
    assert_eq!(view(&g)["people"]["matching"], 5);
    let saved = g.snapshot();
    g.tick(0.);
    assert_eq!(g.snapshot(), saved);
    g.tick(0.25);
    assert_eq!(view(&g)["value"], 0.75);
    assert!(report(&g)["finished_at"].is_null());
    g.tick(0.25);
    assert_eq!(view(&g)["value"], 1.5);
    g.tick(0.25);
    assert_eq!(view(&g)["value"], 2.);
    assert!(report(&g)["finished_at"].is_number());
    let saved = g.snapshot();
    assert!(g.restore(&saved));
}
#[test]
fn a_lapse_resets_a_partial_period_and_recovery_starts_a_fresh_observation() {
    let mut g = game(definition(condition(3, None)));
    g.tick(0.25);
    g.tick(0.25);
    assert_eq!(view(&g)["value"], 1.5);
    edit(&mut g, 0, 10.);
    sample(&mut g);
    assert_eq!(view(&g)["value"], 0.);
    assert_eq!(view(&g)["people"]["matching"], 4);
    g.tick(0.25);
    assert_eq!(view(&g)["value"], 0.);
    edit(&mut g, 0, 80.);
    sample(&mut g);
    assert_eq!(view(&g)["value"], 0.);
    for _ in 0..3 {
        g.tick(0.25);
    }
    assert_eq!(view(&g)["value"], 2.25);
    assert!(report(&g)["finished_at"].is_null());
    g.tick(0.25);
    assert!(report(&g)["finished_at"].is_number());
}
#[test]
fn unobserved_clock_jumps_cannot_complete_a_healthy_period() {
    let mut g = game(definition(condition(60, None)));
    g.tick(0.25);
    assert_eq!(view(&g)["value"], 0.75);
    g.app.world_mut().resource_mut::<Village>().minutes += 360.;
    sample(&mut g);
    assert_eq!(view(&g)["value"], 0.);
    assert!(report(&g)["finished_at"].is_null());
}
#[test]
fn a_later_chapter_cannot_borrow_earlier_healthy_time_and_pending_activation_saves_exactly() {
    let mut d = definition(GoalCondition::Date { minute: 483. });
    let c = condition(3, None);
    let next=serde_json::from_value(serde_json::json!({"id":"later","title":"Time together","description":"","goals":[{"id":"later-health","title":"Another steady period","description":"","optional":false,"condition":c}]})).unwrap();
    d.journal.as_mut().unwrap().chapters.push(next);
    let mut g = game(d);
    for _ in 0..4 {
        g.tick(0.25);
    }
    let r = report(&g);
    assert_eq!(r["chapters"][1]["goals"][0]["condition"]["value"], 0.);
    assert_eq!(
        r["chapters"][1]["goals"][0]["condition"]["people"]["observed"],
        false
    );
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
    g.tick(0.25);
    assert_eq!(
        report(&g)["chapters"][1]["goals"][0]["condition"]["value"],
        0.
    );
    for _ in 0..3 {
        g.tick(0.25);
    }
    assert!(report(&g)["finished_at"].is_null());
    g.tick(0.25);
    assert!(report(&g)["finished_at"].is_number());
}
#[test]
fn population_and_selected_friend_use_stable_identity_and_survive_live_cosmetics() {
    for n in [1, 5, 12] {
        let mut d = definition(condition(2, None));
        let original = residents::founders();
        d.start.residents = Some(
            (0..n)
                .map(|i| {
                    let mut p = original[i % 5].clone();
                    p.id = format!("friend-{i:02}");
                    p.name = "Sam".into();
                    p
                })
                .collect(),
        );
        let mut g = game(d.clone());
        assert_eq!(view(&g)["people"]["total"], n);
        let mut selected = condition(2, Some("friend-00"));
        d.journal.as_mut().unwrap().chapters[0].goals[0].condition = selected.clone();
        d.start.resident_setup = vec![super::super::super::arrival::Setup {
            resident: format!("friend-{:02}", n - 1),
            position: None,
            needs: Some(super::super::super::arrival::Needs {
                energy: 10.,
                hunger: 20.,
                social: 70.,
            }),
        }];
        let mut a = game(d.clone());
        d.start.residents.as_mut().unwrap().reverse();
        let b = game(d);
        assert_eq!(view(&a), view(&b));
        assert_eq!(view(&a)["people"]["total"], 1);
        assert_eq!(view(&a)["people"]["matching"], u32::from(n > 1));
        let id = view(&a)["action"]["resident"].as_u64().unwrap() as usize;
        let before = a.snapshot();
        assert!(a.change_resident_identity(id, "João <friend>", "nina", 1));
        assert_eq!(view(&a)["people"], view(&b)["people"]);
        let renamed = a.snapshot();
        assert!(a.restore(&renamed));
        assert_eq!(a.snapshot(), renamed);
        assert_ne!(renamed, before);
        if let GoalCondition::Wellbeing { resident, .. } = &mut selected {
            *resident = None;
        }
        assert!(valid_condition(&selected));
        let saved = g.snapshot();
        assert!(g.restore(&saved));
    }
}
#[test]
fn actual_needs_include_fullness_connection_and_derived_wellbeing() {
    for (field, minimum) in [
        ("energy_min", 99.),
        ("hunger_max", 0.),
        ("social_min", 99.),
        ("happiness_min", 99.),
    ] {
        let mut raw = serde_json::to_value(condition(1, None)).unwrap();
        raw[field] = serde_json::json!(minimum);
        let g = game(definition(serde_json::from_value(raw).unwrap()));
        assert!(view(&g)["people"]["matching"].as_u64().unwrap() < 5);
        assert_eq!(view(&g)["value"], 0.);
    }
}
#[test]
fn invalid_thresholds_missing_scope_and_duration_limits_reject_atomically_in_goals_and_events() {
    let mut g = game(definition(condition(2, None)));
    let before = g.snapshot();
    for (field, value) in [
        ("energy_min", serde_json::json!(101)),
        ("hunger_max", serde_json::json!(-1)),
        ("social_min", serde_json::json!(100.1)),
        ("happiness_min", serde_json::json!(-0.1)),
        ("minutes", serde_json::json!(0)),
        ("minutes", serde_json::json!(MAX_MINUTES + 1)),
        ("resident", serde_json::json!("absent")),
    ] {
        let mut bad = serde_json::to_value(definition(condition(2, None))).unwrap();
        bad["journal"]["chapters"][0]["goals"][0]["condition"][field] = value;
        let result: serde_json::Value =
            serde_json::from_str(&g.load_scenario(&bad.to_string())).unwrap();
        assert_eq!(result["ok"], false, "{field}");
        assert_eq!(g.snapshot(), before);
    }
    let mut d = definition(GoalCondition::Date { minute: 900. });
    d.journal.as_mut().unwrap().events=serde_json::from_value(serde_json::json!([{"id":"scope","title":"Our friend","when":{"kind":"threshold","condition":condition(2,Some("absent"))},"effect":{"kind":"grant_funds","cents":100}}])).unwrap();
    assert!(compile(d).is_err());
}
#[test]
fn partial_watch_restore_rejects_missing_or_forged_periods_and_inconsistent_live_needs() {
    let mut g = game(definition(condition(3, None)));
    g.tick(0.25);
    g.tick(0.25);
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
    for case in [
        "missing",
        "unknown",
        "future",
        "before-activation",
        "population",
        "matching",
        "live-needs",
    ] {
        let mut bad: serde_json::Value = serde_json::from_str(&saved).unwrap();
        let watches = &mut bad["village"]["progress"]["scenario_journal"]["goals"]["comfortable"]["wellbeing"];
        let key = watches.as_object().unwrap().keys().next().unwrap().clone();
        match case {
            "missing" => {
                watches.as_object_mut().unwrap().clear();
            }
            "unknown" => {
                watches["unknown"] = watches[&key].clone();
            }
            "future" => {
                watches[&key]["last"] = serde_json::json!(900.);
            }
            "before-activation" => {
                watches[&key]["since"] = serde_json::json!(0.);
            }
            "population" => {
                watches[&key]["total"] = serde_json::json!(12);
            }
            "matching" => {
                watches[&key]["matching"] = serde_json::json!(0);
            }
            "live-needs" => {
                bad["residents"][0]["energy"] = serde_json::json!(10.);
            }
            _ => unreachable!(),
        };
        assert!(!g.restore(&bad.to_string()), "{case}");
        assert_eq!(g.snapshot(), saved);
    }
    let mut other = Game::new();
    assert!(other.restore(&saved));
    for _ in 0..10 {
        g.tick(0.25);
        other.tick(0.25);
    }
    assert_eq!(g.snapshot(), other.snapshot());
    assert!(report(&g)["finished_at"].is_number());
}
#[test]
fn nested_event_periods_pay_once_and_completed_observations_freeze_without_forcing_needs() {
    let mut d = definition(condition(2, None));
    let initial = d.start.funds;
    d.journal.as_mut().unwrap().events=serde_json::from_value(serde_json::json!([{"id":"support","title":"Room to live","when":{"kind":"threshold","condition":{"kind":"all","conditions":[condition(2,None),condition(1,Some("resident-iara"))]}},"effect":{"kind":"grant_funds","cents":100}}])).unwrap();
    let mut g = game(d);
    for _ in 0..3 {
        g.tick(0.25);
    }
    assert_eq!(report(&g)["events"][0]["status"], "applied");
    assert_eq!(
        g.app.world().resource::<Village>().economy.money,
        initial + 100
    );
    let frozen = view(&g);
    edit(&mut g, 0, 10.);
    g.tick(0.25);
    assert_eq!(view(&g), frozen);
    assert_eq!(view(&g)["people"]["frozen"], true);
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
    for _ in 0..20 {
        g.tick(0.25);
    }
    assert_eq!(
        g.app.world().resource::<Village>().economy.money,
        initial + 100
    );
}
#[test]
fn asleep_and_offsite_friends_still_belong_to_the_needs_scope() {
    let c = condition(2, Some("resident-iara"));
    let mut g = game(definition(c.clone()));
    let mut all = people(&mut g);
    let v = g.app.world().resource::<Village>();
    let p = all.iter_mut().find(|p| p.id == 0).unwrap();
    p.task = "outside".into();
    p.trip = Some(mobility::Trip {
        purpose: mobility::Purpose::Work,
        phase: mobility::Phase::Away,
        return_at: 1020.,
        order: None,
    });
    assert_eq!(counts(&c, v, &all), (1, 1));
    let p = all.iter_mut().find(|p| p.id == 0).unwrap();
    p.energy = 10.;
    assert_eq!(counts(&c, v, &all), (1, 0));
    let p = all.iter_mut().find(|p| p.id == 0).unwrap();
    p.task = "sleep".into();
    p.trip.as_mut().unwrap().purpose = mobility::Purpose::Overnight;
    sleep::tick(p, v.minutes);
    assert_eq!(counts(&c, v, &all), (1, 0));
    all.iter_mut().find(|p| p.id == 0).unwrap().energy = 90.;
    assert_eq!(counts(&c, v, &all), (1, 1));
}
