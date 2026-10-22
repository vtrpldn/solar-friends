use super::*;
fn building(kind: &str, id: usize, progress: f32) -> Building {
    serde_json::from_value(
        serde_json::json!({"id":id,"kind":kind,"x":20+id as i32*4,"y":20,"progress":progress}),
    )
    .unwrap()
}
fn legacy(v: &Village) -> bool {
    v.arrived
        && ready(v, "well")
        && ready(v, "home")
        && v.harvests > 0
        && ready(v, "kitchen")
        && v.meals_served > 0
}
#[test]
fn opening_matches_legacy_across_every_requirement_and_building_boundary() {
    for bits in 0..64 {
        for progress in [0., 99.99, 100., 101.] {
            let mut v = Village {
                arrived: bits & 1 != 0,
                harvests: u32::from(bits & 2 != 0),
                meals_served: u32::from(bits & 4 != 0),
                ..Default::default()
            };
            for (mask, kind) in [(8, "well"), (16, "home"), (32, "kitchen")] {
                if bits & mask != 0 {
                    v.buildings
                        .push(building(kind, v.buildings.len(), progress));
                }
            }
            assert_eq!(
                requirements_met(&v),
                legacy(&v),
                "bits {bits} progress {progress}"
            );
            assert_eq!(view(&v)["requirements_met"], legacy(&v));
        }
    }
}
#[test]
fn individual_requirements_do_not_latch_before_the_shared_chapter() {
    let mut v = Village {
        arrived: true,
        harvests: 1,
        buildings: vec![
            building("well", 0, 100.),
            building("home", 1, 100.),
            building("kitchen", 2, 100.),
        ],
        ..Default::default()
    };
    progression::update(&mut v);
    assert!(!v.progress.completed[0]);
    v.buildings[0].progress = 99.;
    v.meals_served = 1;
    progression::update(&mut v);
    assert!(!v.progress.completed[0]);
    v.buildings[0].progress = 100.;
    progression::update(&mut v);
    assert!(v.progress.completed[0]);
    assert_eq!(v.progress.tracked, 1);
    let events = v.events.len();
    v.buildings.clear();
    v.harvests = 0;
    v.meals_served = 0;
    progression::update(&mut v);
    assert!(v.progress.completed[0]);
    assert!(!requirements_met(&v));
    assert_eq!(v.events.len(), events);
    for kind in ["grove", "warehouse", "orchard"] {
        assert!(progression::unlocked(&v, kind));
    }
    assert!(!progression::unlocked(&v, "compost"));
}
#[test]
fn the_same_authored_chapter_compiles_and_measures_through_the_player_engine() {
    let mut d = Definition::builtin(modes::Mode::Sandbox);
    d.journal = Some(opening_journal());
    let (g, _) = compile(d).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
    let authored: serde_json::Value = serde_json::from_str(&g.scenario_journal()).unwrap();
    let v = g.app.world().resource::<Village>();
    assert_eq!(
        authored["chapters"][0]["goals"][0]["condition"]["complete"],
        requirements_met(v)
    );
    let mut g = Game::new();
    assert!(g.start_mode("story"));
    let report: serde_json::Value = serde_json::from_str(&g.story_opening()).unwrap();
    assert_eq!(report["chapter"], CHAPTER);
    assert_eq!(report["remaining_legacy_chapters"], 12);
    assert_eq!(report["goals"].as_array().unwrap().len(), 5);
    let saved = g.snapshot();
    g.story_opening();
    assert_eq!(g.snapshot(), saved);
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
    assert!(g.start_mode("sandbox"));
    assert_eq!(g.story_opening(), "null");
}
