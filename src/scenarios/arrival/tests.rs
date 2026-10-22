use super::*;
fn definition() -> Definition {
    let mut d = Definition::builtin(modes::Mode::Sandbox);
    d.rules.logistics = true;
    let mut people = residents::founders();
    people[0].id = "our-friend".into();
    d.start.residents = Some(people);
    d.start.resident_setup = vec![Setup {
        resident: "our-friend".into(),
        position: Some([25., 30.]),
        needs: Some(Needs {
            energy: 12.,
            hunger: 82.,
            social: 20.,
        }),
    }];
    d
}
fn compiled(d: Definition) -> Game {
    compile(d)
        .unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()))
        .0
}
#[test]
fn exact_opening_needs_and_position_do_not_fabricate_activity_or_loose_resources() {
    let d = definition();
    let mut g = compiled(d);
    let s: serde_json::Value = serde_json::from_str(&g.snapshot()).unwrap();
    let p = s["residents"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["id"] == 0)
        .unwrap();
    assert_eq!(
        [p["x"].as_f64().unwrap(), p["y"].as_f64().unwrap()],
        [25., 30.]
    );
    assert_eq!(p["energy"], 12.);
    assert_eq!(p["hunger"], 82.);
    assert_eq!(p["social"], 20.);
    assert!((p["happiness"].as_f64().unwrap() - 14.9).abs() < 0.0001);
    assert_eq!(p["task"], "arrive");
    assert_eq!(p["remaining"], 0.);
    assert_eq!(p["requested"], false);
    assert_eq!(p["trip"], serde_json::Value::Null);
    assert!(
        s["village"]["simulation"]["materials"]["received"]
            .as_array()
            .unwrap()
            .iter()
            .all(|n| n == 0)
    );
    assert!(
        s["village"]["simulation"]["days"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    let saved = g.snapshot();
    let view: serde_json::Value = serde_json::from_str(&g.report_state()).unwrap();
    assert_eq!(view["scenario_ref"]["residents"]["our-friend"], 0);
    assert_eq!(g.snapshot(), saved);
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
}
#[test]
fn stable_identity_survives_cast_reordering_and_default_founders_also_accept_setup() {
    let d = definition();
    let mut a = compiled(d.clone());
    let mut changed = d;
    changed.start.residents.as_mut().unwrap().reverse();
    let mut b = compiled(changed);
    let a: serde_json::Value = serde_json::from_str(&a.snapshot()).unwrap();
    let b: serde_json::Value = serde_json::from_str(&b.snapshot()).unwrap();
    assert_eq!(a["residents"], b["residents"]);
    assert_eq!(
        a["village"]["scenario"]["residents"],
        b["village"]["scenario"]["residents"]
    );
    let mut d = Definition::builtin(modes::Mode::Sandbox);
    d.start.resident_setup = vec![Setup {
        resident: "resident-iara".into(),
        position: None,
        needs: Some(Needs {
            energy: 50.,
            hunger: 60.,
            social: 40.,
        }),
    }];
    let mut g = compiled(d);
    let view: serde_json::Value = serde_json::from_str(&g.report_state()).unwrap();
    assert_eq!(view["scenario_ref"]["residents"]["resident-iara"], 0);
    let p = view["residents"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["id"] == 0)
        .unwrap();
    assert_eq!(p["energy"], 50.);
}
#[test]
fn invalid_needs_unknown_people_blocked_disconnected_and_overlapping_positions_are_atomic() {
    let mut g = compiled(definition());
    let before = g.snapshot();
    for change in 0..9 {
        let mut d = definition();
        match change {
            0 => d.start.resident_setup[0].needs.as_mut().unwrap().energy = 101.,
            1 => d.start.resident_setup[0].needs.as_mut().unwrap().hunger = -1.,
            2 => d.start.resident_setup[0].resident = "missing".into(),
            3 => d
                .start
                .resident_setup
                .push(d.start.resident_setup[0].clone()),
            4 => d.start.resident_setup[0].position = Some([63., 30.]),
            5 => d.start.resident_setup[0].position = Some([36., 29.]),
            6 => d.start.resident_setup[0].position = Some([62., 30.]),
            7 => {
                d.start.resident_setup.push(Setup {
                    resident: "resident-bento".into(),
                    position: Some([25.5, 30.]),
                    needs: None,
                });
            }
            _ => {
                d.map.river.as_mut().unwrap().centers.fill(40.);
                d.start.resident_setup[0].position = Some([50., 30.]);
            }
        }
        let report: serde_json::Value =
            serde_json::from_str(&g.load_scenario(&serde_json::to_string(&d).unwrap())).unwrap();
        assert_eq!(report["ok"], false, "{report}");
        assert_eq!(g.snapshot(), before);
    }
}
#[test]
fn first_choices_follow_real_needs_and_checkpointed_needs_are_not_reseeded() {
    let mut d = definition();
    let s = &mut d.start.resident_setup[0];
    s.needs = Some(Needs {
        energy: 88.,
        hunger: 95.,
        social: 70.,
    });
    s.position = Some([32., 35.]);
    let mut g = compiled(d);
    for _ in 0..5 {
        g.tick(0.25);
    }
    let saved = g.snapshot();
    let v: serde_json::Value = serde_json::from_str(&saved).unwrap();
    let p = v["residents"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["id"] == 0)
        .unwrap();
    assert_eq!(p["task"], "eat");
    assert!(p["hunger"].as_f64().unwrap() != 95.);
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
}
#[test]
fn full_custom_cast_uses_separate_spots_and_presets_reject_scenario_circumstances() {
    let mut d = definition();
    let base = residents::founders();
    d.start.residents = Some(
        (0..12)
            .map(|i| {
                let mut p = base[i % 5].clone();
                p.id = format!("friend-{i:02}");
                p
            })
            .collect(),
    );
    d.start.resident_setup = (0..12)
        .map(|i| Setup {
            resident: format!("friend-{i:02}"),
            position: Some([20. + (i % 4) as f32 * 2., 20. + (i / 4) as f32 * 2.]),
            needs: Some(Needs {
                energy: 30. + i as f32,
                hunger: 10.,
                social: 70.,
            }),
        })
        .collect();
    let mut g = compiled(d);
    let save = g.snapshot();
    assert!(g.restore(&save));
    assert_eq!(g.snapshot(), save);
    let mut person = serde_json::to_value(&base[0]).unwrap();
    person.as_object_mut().unwrap().remove("id");
    let mut preset =
        serde_json::json!({"format":"solar-friends-resident","schema":1,"resident":person});
    assert!(super::super::resident_presets::validate(&preset.to_string(), false).ok);
    preset["resident"]["energy"] = 30.into();
    assert!(!super::super::resident_presets::validate(&preset.to_string(), false).ok);
}
