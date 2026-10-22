use super::*;
fn goal(id: &str, condition: GoalCondition) -> Goal {
    Goal {
        id: id.into(),
        title: format!("Goal {id}"),
        description: String::new(),
        optional: false,
        condition,
    }
}
fn chapter(id: &str, goals: Vec<Goal>) -> Chapter {
    Chapter {
        id: id.into(),
        title: format!("Chapter {id}"),
        description: String::new(),
        goals,
    }
}
fn scenario(chapters: Vec<Chapter>) -> Definition {
    let mut d = Definition::builtin(modes::Mode::Sandbox);
    d.journal = Some(Journal {
        schema: 1,
        introduction: "Our own beginning".into(),
        completion: "Keep enjoying village life.".into(),
        chapters,
    });
    d
}
fn game(d: Definition) -> Game {
    compile(d)
        .unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()))
        .0
}
fn state(g: &mut Game) -> serde_json::Value {
    serde_json::from_str(&g.scenario_journal()).unwrap()
}
#[test]
fn current_assets_credit_and_post_activation_buildings_are_distinct() {
    let mut current = game(scenario(vec![chapter(
        "opening",
        vec![goal(
            "shed",
            GoalCondition::Buildings {
                building: "shed".into(),
                count: 1,
                credit: BuildingCredit::Present,
                region: None,
            },
        )],
    )]));
    assert!(state(&mut current)["finished_at"].is_number());
    let mut fresh = game(scenario(vec![chapter(
        "opening",
        vec![goal(
            "new-shed",
            GoalCondition::Buildings {
                building: "shed".into(),
                count: 1,
                credit: BuildingCredit::AfterActivation,
                region: None,
            },
        )],
    )]));
    assert!(state(&mut fresh)["finished_at"].is_null());
    assert_eq!(fresh.place("shed", 25, 25), "ok");
    fresh.tick(0.25);
    assert!(state(&mut fresh)["finished_at"].is_number());
    let checkpoint = fresh.snapshot();
    assert!(fresh.restore(&checkpoint));
    assert_eq!(fresh.snapshot(), checkpoint);
}
#[test]
fn prior_goals_and_chapters_advance_in_bounded_observation_order() {
    let mut g = game(scenario(vec![
        chapter(
            "first",
            vec![
                goal("fund", GoalCondition::Funds { cents: 0 }),
                goal(
                    "follow",
                    GoalCondition::Goal {
                        goal: "fund".into(),
                    },
                ),
            ],
        ),
        chapter(
            "second",
            vec![goal("time", GoalCondition::Date { minute: 480. })],
        ),
    ]));
    let start = state(&mut g);
    assert!(start["chapters"][0]["goals"][0]["completed_at"].is_number());
    assert!(start["chapters"][0]["goals"][1]["completed_at"].is_null());
    g.tick(0.25);
    let first = state(&mut g);
    assert!(first["chapters"][0]["completed_at"].is_number());
    assert!(first["chapters"][1]["goals"][0]["activated_at"].is_number());
    assert!(first["finished_at"].is_null());
    g.tick(0.25);
    assert!(state(&mut g)["finished_at"].is_number());
}
#[test]
fn harvest_credit_uses_the_goal_activation_baseline_and_survives_reload() {
    let d = scenario(vec![
        chapter(
            "wait",
            vec![goal("morning", GoalCondition::Date { minute: 482. })],
        ),
        chapter(
            "grow",
            vec![
                goal(
                    "earned",
                    GoalCondition::Harvests {
                        count: 2,
                        credit: CounterCredit::AfterActivation,
                    },
                ),
                goal(
                    "lifetime",
                    GoalCondition::Harvests {
                        count: 3,
                        credit: CounterCredit::Run,
                    },
                ),
            ],
        ),
    ]);
    let mut g = game(d);
    g.app.world_mut().resource_mut::<Village>().harvests = 3;
    for _ in 0..3 {
        g.tick(0.25);
    }
    let baseline = g
        .app
        .world()
        .resource::<Village>()
        .progress
        .scenario_journal
        .as_ref()
        .unwrap()
        .goals["earned"]
        .harvest_baseline;
    assert_eq!(baseline, 3);
    g.app.world_mut().resource_mut::<Village>().harvests = 4;
    g.tick(0.25);
    assert!(state(&mut g)["finished_at"].is_null());
    let saved = g.snapshot();
    let mut restored = Game::new();
    assert!(restored.restore(&saved));
    assert_eq!(restored.snapshot(), saved);
    for world in [&mut g, &mut restored] {
        world.app.world_mut().resource_mut::<Village>().harvests = 5;
        world.tick(0.25);
    }
    assert_eq!(g.snapshot(), restored.snapshot());
    assert!(state(&mut g)["finished_at"].is_number());
}
#[test]
fn optional_goals_can_finish_later_and_group_progress_is_native() {
    let mut optional = goal("later", GoalCondition::Date { minute: 482. });
    optional.optional = true;
    let mut g = game(scenario(vec![chapter(
        "one",
        vec![
            goal(
                "main",
                GoalCondition::All {
                    conditions: vec![
                        GoalCondition::Funds { cents: 1 },
                        GoalCondition::Any {
                            conditions: vec![
                                GoalCondition::Stored {
                                    material: "timber".into(),
                                    count: 1,
                                },
                                GoalCondition::Date { minute: 1_000_000. },
                            ],
                        },
                    ],
                },
            ),
            optional,
        ],
    )]));
    let start = state(&mut g);
    assert!(start["finished_at"].is_number());
    assert!(start["chapters"][0]["goals"][1]["completed_at"].is_null());
    for _ in 0..4 {
        g.tick(0.25);
    }
    assert!(state(&mut g)["chapters"][0]["goals"][1]["completed_at"].is_number());
}
#[test]
fn invalid_journals_reject_cycles_missing_references_future_deadlocks_and_limits() {
    for condition in [
        GoalCondition::Goal {
            goal: "missing".into(),
        },
        GoalCondition::Goal {
            goal: "same".into(),
        },
        GoalCondition::All { conditions: vec![] },
        GoalCondition::Buildings {
            building: "castle".into(),
            count: 1,
            credit: BuildingCredit::Present,
            region: None,
        },
        GoalCondition::Date { minute: f32::NAN },
    ] {
        assert!(
            compile(scenario(vec![chapter(
                "one",
                vec![goal("same", condition)]
            )]))
            .is_err()
        );
    }
    let cyclic = scenario(vec![chapter(
        "one",
        vec![
            goal("a", GoalCondition::Goal { goal: "b".into() }),
            goal("b", GoalCondition::Goal { goal: "a".into() }),
        ],
    )]);
    assert!(compile(cyclic).is_err());
    let future = scenario(vec![
        chapter(
            "one",
            vec![goal("a", GoalCondition::Goal { goal: "b".into() })],
        ),
        chapter("two", vec![goal("b", GoalCondition::Funds { cents: 0 })]),
    ]);
    assert!(compile(future).is_err());
    let mut deep = GoalCondition::Funds { cents: 0 };
    for _ in 0..6 {
        deep = GoalCondition::All {
            conditions: vec![deep],
        };
    }
    assert!(compile(scenario(vec![chapter("one", vec![goal("deep", deep)])])).is_err());
}
#[test]
fn journal_runtime_corruption_is_atomic_and_normal_saves_remain_unchanged() {
    let mut ordinary = Game::new();
    assert!(state(&mut ordinary).is_null());
    let raw = ordinary.snapshot();
    assert!(ordinary.restore(&raw));
    assert_eq!(ordinary.snapshot(), raw);
    let mut g = game(scenario(vec![chapter(
        "one",
        vec![goal("later", GoalCondition::Date { minute: 900. })],
    )]));
    let good = g.snapshot();
    for problem in ["missing", "orphan", "time", "duplicate_baseline", "future"] {
        let mut broken: serde_json::Value = serde_json::from_str(&good).unwrap();
        let runtime = &mut broken["village"]["progress"]["scenario_journal"];
        match problem {
            "missing" => *runtime = serde_json::Value::Null,
            "orphan" => {
                runtime["goals"]["alien"] = runtime["goals"]["later"].clone();
            }
            "time" => runtime["last_sample"] = (-1).into(),
            "duplicate_baseline" => {
                runtime["goals"]["later"]["building_baseline"] = serde_json::json!([0, 0])
            }
            _ => runtime["goals"]["later"]["activated_at"] = 999999.into(),
        }
        assert!(!g.restore(&broken.to_string()), "{problem}");
        assert_eq!(g.snapshot(), good);
    }
}

#[test]
fn stored_targets_do_not_count_paid_incoming_orders_and_reports_do_not_advance_time() {
    let mut d = scenario(vec![chapter(
        "stores",
        vec![goal(
            "timber",
            GoalCondition::Stored {
                material: "timber".into(),
                count: 101,
            },
        )],
    )]);
    d.rules.logistics = true;
    let mut g = game(d);
    let mut items = [0u32; economy::COUNT];
    items[0] = 1;
    assert_eq!(
        g.order_supplies(&serde_json::to_string(&items).unwrap()),
        "ok"
    );
    g.tick(0.25);
    let before = g.snapshot();
    let report = state(&mut g);
    assert_eq!(
        report["chapters"][0]["goals"][0]["condition"]["value"],
        100.
    );
    assert_eq!(report["chapters"][0]["goals"][0]["status"], "active");
    assert!(report["finished_at"].is_null());
    assert_eq!(g.snapshot(), before);
    assert!(g.restore(&before));
    assert_eq!(g.snapshot(), before);
}

#[test]
fn maintained_outcomes_credit_only_current_post_activation_observations() {
    let mut g = game(scenario(vec![chapter(
        "one",
        vec![goal(
            "pantry",
            GoalCondition::Maintain {
                outcome: ObservedOutcome::Pantry,
                minutes: 60,
            },
        )],
    )]));
    let activated = g.app.world().resource::<Village>().minutes;
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.progress.outcomes.current[outcomes::PANTRY] = 300.;
        v.progress.outcomes.best[outcomes::PANTRY] = 360.;
        v.progress.outcomes.qualifies[outcomes::PANTRY] = true;
        v.progress.outcomes.last_sample = Some(activated);
        advance(&mut v);
    }
    assert_eq!(
        state(&mut g)["chapters"][0]["goals"][0]["condition"]["value"],
        0.
    );
    for elapsed in [15., 30., 45.] {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.minutes = activated + elapsed;
        v.progress.outcomes.last_sample = Some(v.minutes);
        advance(&mut v);
    }
    assert_eq!(
        state(&mut g)["chapters"][0]["goals"][0]["condition"]["value"],
        45.
    );
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.progress.outcomes.current[outcomes::PANTRY] = 0.;
        v.progress.outcomes.qualifies[outcomes::PANTRY] = false;
        advance(&mut v);
    }
    assert!(state(&mut g)["finished_at"].is_null());
    assert_eq!(
        state(&mut g)["chapters"][0]["goals"][0]["condition"]["value"],
        0.
    );
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.minutes = activated + 120.;
        v.progress.outcomes.last_sample = Some(v.minutes);
        v.progress.outcomes.current[outcomes::PANTRY] = 60.;
        v.progress.outcomes.qualifies[outcomes::PANTRY] = true;
        advance(&mut v);
    }
    assert!(state(&mut g)["finished_at"].is_number());
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
    let mut disabled = scenario(vec![chapter(
        "one",
        vec![goal(
            "dry",
            GoalCondition::Maintain {
                outcome: ObservedOutcome::Dry,
                minutes: 60,
            },
        )],
    )]);
    disabled.rules.climate = false;
    assert!(compile(disabled).is_err());
    for minutes in [0, 14, 16, 361, u32::MAX] {
        assert!(
            compile(scenario(vec![chapter(
                "one",
                vec![goal(
                    "bad",
                    GoalCondition::Maintain {
                        outcome: ObservedOutcome::Pantry,
                        minutes
                    }
                )]
            )]))
            .is_err()
        );
    }
}

#[test]
fn regional_buildings_require_the_entire_native_footprint() {
    let mut d = scenario(vec![chapter(
        "one",
        vec![goal(
            "home",
            GoalCondition::Buildings {
                building: "home".into(),
                count: 1,
                credit: BuildingCredit::AfterActivation,
                region: Some("homes".into()),
            },
        )],
    )]);
    d.map.regions.push(Region {
        id: "homes".into(),
        title: "Our homes".into(),
        x: 24,
        y: 24,
        width: 2,
        height: 2,
    });
    let mut g = game(d.clone());
    assert_eq!(g.place("home", 26, 25), "ok");
    g.tick(0.25);
    assert_eq!(
        state(&mut g)["chapters"][0]["goals"][0]["condition"]["value"],
        0.
    );
    let mut inside = game(d.clone());
    assert_eq!(inside.place("home", 25, 25), "ok");
    inside.tick(0.25);
    assert!(state(&mut inside)["finished_at"].is_number());
    assert!(
        state(&mut inside)["chapters"][0]["goals"][0]["condition"]["description"]
            .as_str()
            .unwrap()
            .contains("Our homes")
    );
    assert_eq!(
        state(&mut inside)["chapters"][0]["goals"][0]["condition"]["action"]["region"],
        "homes"
    );
    let saved = inside.snapshot();
    assert!(inside.restore(&saved));
    assert_eq!(inside.snapshot(), saved);
    let original = g.snapshot();
    d.map.regions.clear();
    assert!(
        !serde_json::from_str::<serde_json::Value>(
            &g.load_scenario(&serde_json::to_string(&d).unwrap())
        )
        .unwrap()["ok"]
            .as_bool()
            .unwrap()
    );
    assert_eq!(g.snapshot(), original);
    d.journal = None;
    for region in [
        Region {
            id: "a".into(),
            title: "A".into(),
            x: 63,
            y: 0,
            width: 2,
            height: 1,
        },
        Region {
            id: "a".into(),
            title: "A".into(),
            x: 0,
            y: 0,
            width: i32::MAX,
            height: 1,
        },
        Region {
            id: "a".into(),
            title: "".into(),
            x: 0,
            y: 0,
            width: 1,
            height: 1,
        },
    ] {
        d.map.regions = vec![region];
        assert!(compile(d.clone()).is_err());
    }
    d.map.regions = vec![
        Region {
            id: "a".into(),
            title: "A".into(),
            x: 0,
            y: 0,
            width: 64,
            height: 64
        };
        2
    ];
    assert!(compile(d.clone()).is_err());
    d.map.regions = (0..32)
        .map(|i| Region {
            id: format!("r{i}"),
            title: format!("Area {i}"),
            x: 0,
            y: 0,
            width: 64,
            height: 64,
        })
        .collect();
    assert!(compile(d.clone()).is_ok());
    d.map.regions.push(Region {
        id: "last".into(),
        title: "Last".into(),
        x: 1,
        y: 1,
        width: 1,
        height: 1,
    });
    assert!(compile(d).is_err());
}

#[test]
fn region_edges_follow_one_two_and_three_cell_building_anchors() {
    for kind in ["well", "home", "shed"] {
        let size = interactions::footprint_size(kind);
        let mut g = game(Definition::builtin(modes::Mode::Sandbox));
        assert_eq!(g.place(kind, 25, 25), "ok");
        let v = g.app.world().resource::<Village>();
        let b = v
            .buildings
            .iter()
            .find(|b| b.kind == kind && b.x == 25 && b.y == 25)
            .unwrap();
        let mut region = Region {
            id: "a".into(),
            title: "A".into(),
            x: 25 - size / 2,
            y: 25 - size / 2,
            width: size,
            height: size,
        };
        assert!(region.contains_building(b));
        region.x += 1;
        assert!(!region.contains_building(b));
        region.x -= 1;
        region.height -= 1;
        assert!(!region.contains_building(b));
    }
}
