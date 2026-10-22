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
        challenge: None,
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
        locked_buildings: vec![],
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

#[test]
fn building_unlocks_gate_new_plans_and_restore_exactly() {
    let mut d = definition(
        vec![event(
            "home",
            EventTrigger::Date { minute: 482. },
            EventEffect::UnlockBuilding {
                building: "home".into(),
            },
        )],
        0,
        0,
    );
    d.rules.logistics = false;
    d.journal.as_mut().unwrap().locked_buildings = vec!["home".into()];
    let mut g = game(d);
    assert!(!progression::unlocked(
        g.app.world().resource::<Village>(),
        "home"
    ));
    let before = g.snapshot();
    assert_ne!(g.place("home", 25, 25), "ok");
    assert_eq!(g.snapshot(), before);
    assert!(g.restore(&before));
    for _ in 0..10 {
        g.tick(0.25);
    }
    assert!(progression::unlocked(
        g.app.world().resource::<Village>(),
        "home"
    ));
    assert_eq!(report(&g)["events"][0]["status"], "applied");
    let unlocked = g.snapshot();
    assert!(g.restore(&unlocked));
    assert_eq!(g.snapshot(), unlocked);
    for (source, locked) in [(&before, false), (&unlocked, true)] {
        let mut bad: serde_json::Value = serde_json::from_str(source).unwrap();
        bad["village"]["progress"]["scenario_journal"]["locked_buildings"] = if locked {
            serde_json::json!(["home"])
        } else {
            serde_json::json!([])
        };
        assert!(!g.restore(&bad.to_string()));
        assert_eq!(g.snapshot(), unlocked);
    }
    assert_eq!(g.place("home", 25, 25), "ok");
}

#[test]
fn unlock_reachability_rejects_self_dependencies_but_accepts_real_alternatives() {
    let unlock = event(
        "home",
        EventTrigger::Goal {
            goal: "fund".into(),
        },
        EventEffect::UnlockBuilding {
            building: "home".into(),
        },
    );
    let mut d = definition(vec![unlock], 0, 0);
    let j = d.journal.as_mut().unwrap();
    j.locked_buildings = vec!["home".into()];
    j.chapters[0].goals[0].condition = GoalCondition::Buildings {
        building: "home".into(),
        count: 1,
        credit: BuildingCredit::AfterActivation,
        region: None,
    };
    let rejected = crate::scenarios::compile(d.clone()).err().unwrap();
    assert!(
        serde_json::to_string(&rejected)
            .unwrap()
            .contains("unlock_deadlock")
    );
    let blocked = d.journal.as_ref().unwrap().chapters[0].goals[0]
        .condition
        .clone();
    d.journal.as_mut().unwrap().chapters[0].goals[0].condition = GoalCondition::Any {
        conditions: vec![blocked.clone(), GoalCondition::Funds { cents: 0 }],
    };
    assert!(crate::scenarios::compile(d.clone()).is_ok());
    d.journal.as_mut().unwrap().chapters[0].goals[0].condition = blocked;
    let mut home = d.start.buildings[0].clone();
    home.id = "gifted-home".into();
    home.kind = "home".into();
    home.x = 25;
    home.y = 25;
    home.appearance = None;
    home.recipe = "standard".into();
    home.state = BuildingState::Blueprint;
    d.start.buildings.push(home);
    assert!(
        crate::scenarios::compile(d.clone()).is_ok(),
        "A gifted blueprint can be finished while new plans remain locked"
    );
    d.start.buildings.last_mut().unwrap().state = BuildingState::Completed;
    assert!(
        crate::scenarios::compile(d.clone()).is_err(),
        "A completed gift cannot satisfy after-activation credit"
    );
    if let GoalCondition::Buildings { credit, .. } =
        &mut d.journal.as_mut().unwrap().chapters[0].goals[0].condition
    {
        *credit = BuildingCredit::Present;
    }
    assert!(crate::scenarios::compile(d).is_ok());
    let mut unused = definition(vec![], 0, 0);
    unused.journal.as_mut().unwrap().locked_buildings = vec!["workshop".into()];
    assert!(
        crate::scenarios::compile(unused.clone()).is_ok(),
        "Unused permanent exclusions are valid"
    );
    unused.journal.as_mut().unwrap().chapters[0].goals[0].condition = GoalCondition::Produced {
        material: "tools".into(),
        count: 1,
        credit: CounterCredit::Run,
    };
    assert!(crate::scenarios::compile(unused).is_err());
}

#[test]
fn supply_events_wait_for_full_room_latch_intent_and_account_exactly_once() {
    let mut gift = event(
        "gift",
        EventTrigger::Start,
        EventEffect::DeliverSupplies {
            material: "meals".into(),
            count: 2,
            building: None,
        },
    );
    gift.condition = Some(GoalCondition::Stored {
        material: "timber".into(),
        count: 600,
    });
    let mut d = definition(vec![gift], 0, 0);
    for inventory in &mut d.start.inventories {
        inventory.items.clear();
        if matches!(inventory.owner, InventoryOwner::Camp) {
            inventory.items.insert("timber".into(), 600);
        }
    }
    let mut g = game(d);
    assert_eq!(report(&g)["events"][0]["status"], "waiting_for_delivery");
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
    g.tick(0.);
    assert_eq!(g.snapshot(), saved);
    assert_eq!(g.sell_material(0, 1), "ok");
    g.tick(0.25);
    assert_eq!(
        report(&g)["events"][0]["status"],
        "waiting_for_delivery",
        "One free slot cannot receive a two-unit delivery"
    );
    assert_eq!(
        economy::quantity(g.app.world().resource::<Village>(), economy::MEALS),
        0
    );
    let waiting = g.snapshot();
    assert!(g.restore(&waiting));
    assert_eq!(g.snapshot(), waiting);
    assert_eq!(g.sell_material(0, 1), "ok");
    g.tick(0.25);
    assert_eq!(
        report(&g)["events"][0]["status"],
        "applied",
        "The queued gift survives its now-false timber guard"
    );
    let v = g.app.world().resource::<Village>();
    assert_eq!(
        v.simulation.materials.as_ref().unwrap().received[economy::MEALS],
        2
    );
    assert_eq!(economy::quantity(v, economy::MEALS), 2);
    let store = v
        .logistics
        .as_ref()
        .unwrap()
        .stores
        .iter()
        .find(|p| p.owner == logistics::Owner::Camp)
        .unwrap();
    assert_eq!(
        store
            .food_lots
            .iter()
            .filter(|l| l.material == economy::MEALS)
            .map(|l| l.amount)
            .sum::<u32>(),
        2
    );
    let applied = g.snapshot();
    assert!(g.restore(&applied));
    assert_eq!(g.snapshot(), applied);
    for mutation in ["count", "destination", "accounting"] {
        let mut bad: serde_json::Value = serde_json::from_str(&applied).unwrap();
        if mutation == "accounting" {
            bad["village"]["simulation"]["materials"]["received"][economy::MEALS] =
                serde_json::json!(0);
        } else {
            let result =
                &mut bad["village"]["progress"]["scenario_journal"]["events"]["gift"]["result"];
            if mutation == "count" {
                result["count"] = serde_json::json!(3);
            } else {
                result["building"] = serde_json::json!("starting-warehouse");
            }
        }
        assert!(!g.restore(&bad.to_string()), "{mutation}");
        assert_eq!(g.snapshot(), applied);
    }
    for _ in 0..20 {
        g.tick(0.25);
    }
    assert_eq!(
        g.app
            .world()
            .resource::<Village>()
            .simulation
            .materials
            .as_ref()
            .unwrap()
            .received[economy::MEALS],
        2
    );
}

#[test]
fn supply_events_bind_real_buildings_and_reject_impossible_source_deliveries() {
    let gift = event(
        "gift",
        EventTrigger::Start,
        EventEffect::DeliverSupplies {
            material: "frames".into(),
            count: 12,
            building: Some("starting-warehouse".into()),
        },
    );
    let mut d = definition(vec![gift], 0, 0);
    for inventory in &mut d.start.inventories {
        inventory.items.clear();
    }
    let mut g = game(d.clone());
    assert_eq!(report(&g)["events"][0]["status"], "applied");
    let v = g.app.world().resource::<Village>();
    let id = v.scenario.as_ref().unwrap().buildings["starting-warehouse"];
    assert_eq!(
        v.logistics
            .as_ref()
            .unwrap()
            .stores
            .iter()
            .find(|p| p.owner == logistics::Owner::Warehouse(id))
            .unwrap()
            .items[5],
        12
    );
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
    for (material, count, building, logistics) in [
        ("frames", 301, Some("starting-warehouse"), true),
        ("frames", 1, Some("missing"), true),
        ("unknown", 1, None, true),
        ("frames", 0, None, true),
        ("frames", 601, None, true),
        ("frames", 1, None, false),
    ] {
        let mut bad = d.clone();
        bad.rules.logistics = logistics;
        bad.journal.as_mut().unwrap().events[0].effect = EventEffect::DeliverSupplies {
            material: material.into(),
            count,
            building: building.map(str::to_string),
        };
        assert!(crate::scenarios::compile(bad).is_err());
    }
    // Real move work closes the store to external support until it is cancelled.
    d.journal.as_mut().unwrap().events[0].trigger = EventTrigger::Date { minute: 481. };
    let mut unfinished = d.clone();
    unfinished
        .start
        .buildings
        .iter_mut()
        .find(|b| b.id == "starting-warehouse")
        .unwrap()
        .state = BuildingState::Blueprint;
    let mut site = game(unfinished);
    let site_id = site
        .app
        .world()
        .resource::<Village>()
        .scenario
        .as_ref()
        .unwrap()
        .buildings["starting-warehouse"];
    assert_eq!(site.queue_building_work(site_id, "demolish", 0, 0), "ok");
    for _ in 0..4 {
        site.tick(0.25);
    }
    assert_eq!(report(&site)["events"][0]["status"], "waiting_for_delivery");
    assert!(
        report(&site)["events"][0]["delivery_blocker"]
            .as_str()
            .unwrap()
            .contains("Finish or cancel")
    );
    assert_eq!(site.cancel_building_work(site_id), "ok");
    site.tick(0.25);
    assert_eq!(report(&site)["events"][0]["status"], "applied");
    let mut pending = game(d);
    let id = pending
        .app
        .world()
        .resource::<Village>()
        .scenario
        .as_ref()
        .unwrap()
        .buildings["starting-warehouse"];
    assert_eq!(pending.queue_building_work(id, "move", 25, 25), "ok");
    for _ in 0..4 {
        pending.tick(0.25);
    }
    assert_eq!(
        report(&pending)["events"][0]["status"],
        "waiting_for_delivery"
    );
    assert!(
        report(&pending)["events"][0]["delivery_blocker"]
            .as_str()
            .unwrap()
            .contains("Finish or cancel")
    );
    assert_eq!(pending.cancel_building_work(id), "ok");
    pending.tick(0.25);
    assert_eq!(report(&pending)["events"][0]["status"], "applied");
}

#[test]
fn disconnected_supply_destinations_wait_without_inventing_a_delivery() {
    let mut d = definition(
        vec![event(
            "gift",
            EventTrigger::Start,
            EventEffect::DeliverSupplies {
                material: "frames".into(),
                count: 12,
                building: Some("starting-warehouse".into()),
            },
        )],
        0,
        0,
    );
    for inventory in &mut d.start.inventories {
        inventory.items.clear();
    }
    d.map.nature = Some(vec![]);
    d.map.river = Some(world::River {
        schema: 1,
        centers: vec![40.; MAP_SIZE as usize],
    });
    d.map.clearings.push(crate::scenarios::Clearing {
        x: 48,
        y: 29,
        size: 8,
        disturbance: 0.05,
    });
    d.start
        .buildings
        .iter_mut()
        .find(|b| b.id == "starting-warehouse")
        .unwrap()
        .x = 48;
    let mut g = game(d);
    assert_eq!(report(&g)["events"][0]["status"], "waiting_for_delivery");
    assert!(
        report(&g)["events"][0]["delivery_blocker"]
            .as_str()
            .unwrap()
            .contains("walkable route")
    );
    let before = g.snapshot();
    assert!(g.restore(&before));
    assert_eq!(g.snapshot(), before);
    for _ in 0..8 {
        g.tick(0.25);
    }
    assert_eq!(report(&g)["events"][0]["status"], "waiting_for_delivery");
    assert_eq!(
        g.app
            .world()
            .resource::<Village>()
            .simulation
            .materials
            .as_ref()
            .unwrap()
            .received[5],
        0
    );
}

#[test]
fn unrestricted_continuation_releases_locks_without_fabricating_unlock_events() {
    let mut d = definition(vec![event("later", EventTrigger::Date { minute: 700. }, EventEffect::UnlockBuilding { building: "home".into() })], 0, 100);
    d.start.minutes = 600.;
    let journal = d.journal.as_mut().unwrap();
    journal.locked_buildings = vec!["home".into()];
    journal.challenge = Some(crate::scenarios::journal::challenge::Definition { deadline: 600.5, failure_message: "Time passed.".into() });
    let mut g = game(d);
    g.tick(0.25);
    assert!(!progression::unlocked(g.app.world().resource::<Village>(), "home"));
    assert!(g.continue_scenario_freely());
    assert!(progression::unlocked(g.app.world().resource::<Village>(), "home"));
    assert_eq!(report(&g)["events"][0]["status"], "watching");
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
}

#[test]
fn boundary_effect_is_once_only_and_cannot_cascade_into_challenge_success() {
    let mut d = definition(vec![event("support", EventTrigger::Date { minute: 600.5 }, EventEffect::GrantFunds { cents: 100 })], 0, 100);
    d.start.minutes = 600.;
    d.journal.as_mut().unwrap().challenge = Some(crate::scenarios::journal::challenge::Definition { deadline: 600.5, failure_message: "The goal was not observed in time.".into() });
    let mut g = game(d);
    g.tick(0.25);
    assert_eq!(report(&g)["challenge"]["status"], "failed");
    assert_eq!(report(&g)["events"][0]["status"], "applied");
    assert_eq!(g.app.world().resource::<Village>().economy.money, 100);
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert!(g.continue_scenario_freely());
    g.tick(0.25);
    assert!(report(&g)["finished_at"].is_number());
    assert_eq!(report(&g)["challenge"]["status"], "unrestricted");
    assert_eq!(g.app.world().resource::<Village>().economy.money, 100);
}
