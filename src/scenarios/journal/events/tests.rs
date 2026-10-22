use super::*;
fn definition(
    events: Vec<EventDefinition>,
    funds: i64,
    target: i64,
) -> crate::scenarios::Definition {
    let mut d = crate::scenarios::Definition::builtin(modes::Mode::Sandbox);
    d.rules.logistics = true;
    d.start.funds = funds;
    d.journal = Some(Journal {
        schema: 1,
        introduction: "Our story".into(),
        completion: "Keep living here".into(),
        chapters: vec![Chapter {
            id: "one".into(),
            title: "One".into(),
            description: String::new(),
            goals: vec![Goal {
                id: "fund".into(),
                title: "Our fund".into(),
                description: String::new(),
                optional: false,
                condition: GoalCondition::Funds { cents: target },
            }],
        }],
        events,
    });
    d
}
fn event(id: &str, trigger: EventTrigger, effect: EventEffect) -> EventDefinition {
    EventDefinition {
        id: id.into(),
        title: format!("Event {id}"),
        trigger,
        condition: None,
        effect,
    }
}
fn game(d: crate::scenarios::Definition) -> Game {
    crate::scenarios::compile(d)
        .unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()))
        .0
}
fn report(g: &Game) -> serde_json::Value {
    serde_json::from_str(&g.scenario_journal()).unwrap()
}
#[test]
fn event_effects_use_pre_effect_observations_and_apply_once_after_restore() {
    let mut intro = event(
        "intro",
        EventTrigger::Start,
        EventEffect::GrantFunds { cents: 100 },
    );
    intro.title = "É🌻".repeat(33);
    let mut conditional = event(
        "support",
        EventTrigger::Threshold {
            condition: GoalCondition::Funds { cents: 100 },
        },
        EventEffect::GrantFunds { cents: 150 },
    );
    conditional.condition = Some(GoalCondition::Stored {
        material: "timber".into(),
        count: 1,
    });
    let mut g = game(definition(
        vec![
            intro,
            conditional,
            event(
                "goal",
                EventTrigger::Goal {
                    goal: "fund".into(),
                },
                EventEffect::Message {
                    text: "We can begin <together>.".into(),
                },
            ),
            event(
                "chapter",
                EventTrigger::Chapter {
                    chapter: "one".into(),
                },
                EventEffect::Message {
                    text: "Our first chapter is complete.".into(),
                },
            ),
            event(
                "date",
                EventTrigger::Date { minute: 480.5 },
                EventEffect::Message {
                    text: "A little later.".into(),
                },
            ),
        ],
        0,
        250,
    ));
    assert_eq!(g.app.world().resource::<Village>().economy.money, 100);
    assert_eq!(report(&g)["events"][1]["status"], "watching");
    let saved = g.snapshot();
    g.tick(0.);
    assert_eq!(g.snapshot(), saved);
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
    g.tick(0.25);
    assert_eq!(g.app.world().resource::<Village>().economy.money, 250);
    assert!(
        report(&g)["finished_at"].is_null(),
        "Effects do not complete an earlier goal in the same observation"
    );
    assert_eq!(report(&g)["events"][1]["status"], "applied");
    g.tick(0.25);
    assert!(report(&g)["finished_at"].is_number());
    assert!(
        report(&g)["events"]
            .as_array()
            .unwrap()
            .iter()
            .all(|e| e["status"] == "applied")
    );
    let v = g.app.world().resource::<Village>();
    assert_eq!(v.events[0], "Our first chapter is complete.");
    assert_eq!(
        v.economy
            .ledger
            .iter()
            .filter(|e| e.note.starts_with("Scenario support:"))
            .count(),
        2
    );
    assert!(v.economy.ledger.iter().all(|e| e.note.len() <= 200));
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
    for _ in 0..20 {
        g.tick(0.25);
    }
    assert_eq!(g.app.world().resource::<Village>().economy.money, 250);
    for mutation in ["receipt", "timestamp", "watch", "message-phase", "orphan"] {
        let stable = g.snapshot();
        let mut bad: serde_json::Value = serde_json::from_str(&stable).unwrap();
        let events = &mut bad["village"]["progress"]["scenario_journal"]["events"];
        match mutation {
            "receipt" => events["intro"]["result"]["cents"] = serde_json::json!(101),
            "timestamp" => events["intro"]["applied_at"] = serde_json::json!(9_000_000),
            "message-phase" => {
                events["goal"]["applied_at"] = serde_json::Value::Null;
                events["goal"]["result"] = serde_json::Value::Null;
            }
            "watch" => events["intro"]["watch"]["activated_at"] = serde_json::json!(481),
            _ => events["unknown"] = events["intro"].clone(),
        }
        assert!(!g.restore(&bad.to_string()), "{mutation}");
        assert_eq!(g.snapshot(), stable);
    }
}
#[test]
fn queued_grants_wait_for_full_room_and_keep_their_trigger_across_saves() {
    let mut grant = event(
        "support",
        EventTrigger::Start,
        EventEffect::GrantFunds { cents: 500 },
    );
    grant.condition = Some(GoalCondition::Funds {
        cents: 1_000_000_000,
    });
    let mut g = game(definition(vec![grant], 1_000_000_000, 0));
    assert_eq!(report(&g)["events"][0]["status"], "waiting_for_fund_space");
    assert!(
        report(&g)["finished_at"].is_number(),
        "Events may continue after village success"
    );
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
    let mut items = [0u32; economy::COUNT];
    items[9] = 1;
    assert_eq!(
        g.order_supplies(&serde_json::to_string(&items).unwrap()),
        "ok"
    );
    let before = g.app.world().resource::<Village>().economy.money;
    g.tick(0.25);
    assert_eq!(
        g.app.world().resource::<Village>().economy.money,
        before + 500
    );
    assert_eq!(report(&g)["events"][0]["status"], "applied");
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
    g.tick(0.25);
    assert_eq!(
        g.app.world().resource::<Village>().economy.money,
        before + 500
    );
}
#[test]
fn event_only_conditions_subscribe_to_real_domain_activity() {
    let mut g = game(definition(
        vec![
            event(
                "produce",
                EventTrigger::Threshold {
                    condition: GoalCondition::Produced {
                        material: "walls".into(),
                        count: 2,
                        credit: CounterCredit::AfterActivation,
                    },
                },
                EventEffect::Message {
                    text: "Made here".into(),
                },
            ),
            event(
                "trade",
                EventTrigger::Threshold {
                    condition: GoalCondition::Traded {
                        direction: TradeDirection::Purchase,
                        material: "plumbing".into(),
                        count: 1,
                        credit: CounterCredit::AfterActivation,
                    },
                },
                EventEffect::Message {
                    text: "Received".into(),
                },
            ),
            event(
                "haul",
                EventTrigger::Threshold {
                    condition: GoalCondition::Delivered {
                        material: "walls".into(),
                        count: 2,
                        credit: CounterCredit::AfterActivation,
                        building: Some("starting-warehouse".into()),
                    },
                },
                EventEffect::Message {
                    text: "Carried home".into(),
                },
            ),
            event(
                "healthy",
                EventTrigger::Threshold {
                    condition: GoalCondition::Maintain {
                        outcome: ObservedOutcome::Pantry,
                        minutes: 15,
                    },
                },
                EventEffect::Message {
                    text: "Comfortable".into(),
                },
            ),
        ],
        100_000,
        900_000_000,
    ));
    let v = g.app.world().resource::<Village>();
    assert!(
        v.progress
            .scenario_journal
            .as_ref()
            .unwrap()
            .trade
            .is_some()
    );
    assert!(
        v.progress
            .scenario_journal
            .as_ref()
            .unwrap()
            .delivery
            .is_some()
    );
    assert!(super::super::needs_outcomes(v));
    assert_eq!(g.set_production_target(6, 26), "ok");
    let warehouse = g
        .app
        .world()
        .resource::<Village>()
        .scenario
        .as_ref()
        .unwrap()
        .buildings["starting-warehouse"];
    let mut target = [0u32; economy::COUNT];
    target[6] = 2;
    assert_eq!(
        g.set_storage_target(warehouse, &serde_json::to_string(&target).unwrap()),
        "ok"
    );
    let mut order = [0u32; economy::COUNT];
    order[9] = 1;
    assert_eq!(
        g.order_supplies(&serde_json::to_string(&order).unwrap()),
        "ok"
    );
    for _ in 0..6000 {
        g.tick(0.25);
        if report(&g)["events"]
            .as_array()
            .unwrap()
            .iter()
            .all(|e| e["status"] == "applied")
        {
            break;
        }
    }
    assert!(
        report(&g)["events"]
            .as_array()
            .unwrap()
            .iter()
            .all(|e| e["status"] == "applied"),
        "{}",
        g.scenario_journal()
    );
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
}
#[test]
fn event_limits_references_rules_and_effects_are_validated_before_installation() {
    let good = event(
        "support",
        EventTrigger::Start,
        EventEffect::GrantFunds { cents: 1 },
    );
    let mut g = game(definition(vec![good.clone()], 0, 100));
    let stable = g.snapshot();
    for bad in [
        event(
            "bad",
            EventTrigger::Goal {
                goal: "unknown".into(),
            },
            EventEffect::Message {
                text: "Hello".into(),
            },
        ),
        event(
            "bad",
            EventTrigger::Chapter {
                chapter: "missing".into(),
            },
            EventEffect::Message {
                text: "Hello".into(),
            },
        ),
        event(
            "bad",
            EventTrigger::Date { minute: -1. },
            EventEffect::Message {
                text: "Hello".into(),
            },
        ),
        event(
            "bad",
            EventTrigger::Start,
            EventEffect::GrantFunds { cents: 0 },
        ),
        event(
            "bad",
            EventTrigger::Start,
            EventEffect::GrantFunds { cents: 100_000_001 },
        ),
        event(
            "bad",
            EventTrigger::Start,
            EventEffect::Message { text: "".into() },
        ),
    ] {
        let raw = serde_json::to_string(&definition(vec![bad], 0, 100)).unwrap();
        assert!(
            !serde_json::from_str::<serde_json::Value>(&g.load_scenario(&raw)).unwrap()["ok"]
                .as_bool()
                .unwrap()
        );
        assert_eq!(g.snapshot(), stable);
    }
    assert!(crate::scenarios::compile(definition(vec![good.clone(); 2], 0, 100)).is_err());
    let events: Vec<_> = (0..64)
        .map(|i| {
            event(
                &format!("event-{i}"),
                EventTrigger::Start,
                EventEffect::GrantFunds { cents: 1 },
            )
        })
        .collect();
    let mut maximal = game(definition(events.clone(), 0, 100));
    assert_eq!(maximal.app.world().resource::<Village>().economy.money, 64);
    let saved = maximal.snapshot();
    assert!(maximal.restore(&saved));
    assert_eq!(maximal.snapshot(), saved);
    let mut excess = events;
    excess.push(event(
        "extra",
        EventTrigger::Start,
        EventEffect::Message { text: "No".into() },
    ));
    assert!(crate::scenarios::compile(definition(excess, 0, 100)).is_err());
    let mut disabled = definition(
        vec![event(
            "produce",
            EventTrigger::Threshold {
                condition: GoalCondition::Produced {
                    material: "walls".into(),
                    count: 1,
                    credit: CounterCredit::Run,
                },
            },
            EventEffect::Message {
                text: "Done".into(),
            },
        )],
        0,
        100,
    );
    disabled.rules.logistics = false;
    assert!(crate::scenarios::compile(disabled).is_err());
}
