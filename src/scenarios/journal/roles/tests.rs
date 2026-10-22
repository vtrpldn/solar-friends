use super::*;
fn definition() -> crate::scenarios::Definition {
    let mut d = crate::scenarios::Definition::builtin(modes::Mode::Sandbox);
    d.rules.learning = true;
    d.journal = Some(Journal {
        roles: vec![Role {
            id: "grower".into(),
            title: "Our grower".into(),
            binding: Binding::Capability {
                skill: experience::Domain::Growing,
                minimum_level: 1,
            },
        }],
        challenge: None,
        schema: 1,
        introduction: "Our friends".into(),
        completion: "Keep living here.".into(),
        locked_buildings: vec![],
        chapters: vec![Chapter {
            id: "opening".into(),
            title: "Arrival".into(),
            description: String::new(),
            goals: vec![Goal {
                id: "later".into(),
                title: "A later date".into(),
                description: String::new(),
                optional: false,
                condition: GoalCondition::Date { minute: 5000. },
            }],
        }],
        events: vec![events::EventDefinition {
            id: "hello".into(),
            title: "An idea".into(),
            speaker: Some(Speaker::Role {
                role: "grower".into(),
            }),
            trigger: events::EventTrigger::Start,
            condition: None,
            effect: events::EventEffect::Message {
                text: "Let us plant together.".into(),
            },
        }],
    });
    let people = d.start.residents.as_mut().unwrap();
    for p in people {
        p.experience = Some(experience::Experience {
            background: experience::Background::Newcomer,
            levels: [(experience::Domain::Growing, 2)].into_iter().collect(),
        });
    }
    d
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
fn capability_roles_use_declared_skill_then_stable_identity_and_survive_live_changes() {
    let d = definition();
    let expected = d
        .start
        .residents
        .as_ref()
        .unwrap()
        .iter()
        .map(|p| p.id.clone())
        .min()
        .unwrap();
    let mut reversed = d.clone();
    reversed.start.residents.as_mut().unwrap().reverse();
    let mut a = game(d);
    let b = game(reversed);
    assert_eq!(
        report(&a)["events"][0]["speaker"],
        report(&b)["events"][0]["speaker"]
    );
    assert_eq!(
        report(&a)["events"][0]["speaker"]["source_resident"],
        expected
    );
    let id = report(&a)["events"][0]["speaker"]["resident"]
        .as_u64()
        .unwrap() as usize;
    assert!(a.change_resident_identity(id, "New name", "nina", 1));
    {
        let mut v = a.app.world_mut().resource_mut::<Village>();
        for person in v.skills.people.values_mut() {
            person.experience[2] = skills::MAX;
        }
    }
    assert_eq!(
        report(&a)["events"][0]["speaker"]["source_resident"],
        expected
    );
    let saved = a.snapshot();
    assert!(a.restore(&saved));
    assert_eq!(a.snapshot(), saved);
    assert_eq!(
        report(&a)["events"][0]["speaker"]["source_resident"],
        expected
    );
}
#[test]
fn a_higher_declared_level_wins_even_when_another_person_sorts_first() {
    let mut d = definition();
    let p = d
        .start
        .residents
        .as_mut()
        .unwrap()
        .iter_mut()
        .max_by_key(|p| p.id.clone())
        .unwrap();
    let expected = p.id.clone();
    p.experience
        .as_mut()
        .unwrap()
        .levels
        .insert(experience::Domain::Growing, 3);
    let g = game(d);
    assert_eq!(
        report(&g)["events"][0]["speaker"]["source_resident"],
        expected
    );
}
#[test]
fn default_cast_and_single_friend_speakers_resolve_without_fixed_numeric_slots() {
    let mut d = definition();
    d.start.residents = None;
    d.journal.as_mut().unwrap().roles[0].binding = Binding::Resident {
        resident: "resident-nina".into(),
    };
    let g = game(d.clone());
    assert_eq!(report(&g)["events"][0]["speaker"]["resident"], 4);
    d.start.residents = Some(vec![residents::founders().pop().unwrap()]);
    d.journal.as_mut().unwrap().events[0].speaker = Some(Speaker::Resident {
        resident: "resident-nina".into(),
    });
    let mut g = game(d);
    assert_eq!(report(&g)["events"][0]["speaker"]["resident"], 0);
    let saved = g.snapshot();
    assert!(g.restore(&saved));
}
#[test]
fn missing_role_person_capability_or_wrong_effect_is_rejected_atomically() {
    let source = definition();
    let mut g = game(source.clone());
    let saved = g.snapshot();
    for variant in 0..7 {
        let mut d = source.clone();
        let j = d.journal.as_mut().unwrap();
        match variant {
            0 => {
                j.roles[0].binding = Binding::Resident {
                    resident: "missing".into(),
                }
            }
            1 => {
                j.roles[0].binding = Binding::Capability {
                    skill: experience::Domain::Cooking,
                    minimum_level: 1,
                }
            }
            2 => {
                j.events[0].speaker = Some(Speaker::Role {
                    role: "missing".into(),
                })
            }
            3 => {
                j.events[0].speaker = Some(Speaker::Resident {
                    resident: "missing".into(),
                })
            }
            4 => j.events[0].effect = events::EventEffect::GrantFunds { cents: 100 },
            5 => {
                j.roles[0].binding = Binding::Capability {
                    skill: experience::Domain::Growing,
                    minimum_level: 0,
                }
            }
            _ => j.roles.push(j.roles[0].clone()),
        }
        let result: serde_json::Value =
            serde_json::from_str(&g.load_scenario(&serde_json::to_string(&d).unwrap())).unwrap();
        assert_eq!(result["ok"], false);
        assert_eq!(g.snapshot(), saved);
    }
    let mut d = source;
    d.rules.learning = false;
    assert!(crate::scenarios::compile(d).is_err());
}

#[test]
fn twelve_repeated_templates_keep_roles_on_authored_identities() {
    let mut d = definition();
    let person = d.start.residents.as_ref().unwrap()[0].clone();
    d.start.residents = Some(
        (0..12)
            .map(|i| {
                let mut p = person.clone();
                p.id = format!("friend-{i:02}");
                p.name = format!("Friend {i}");
                p
            })
            .collect(),
    );
    d.start.residents.as_mut().unwrap().reverse();
    let mut g = game(d);
    assert_eq!(
        report(&g)["events"][0]["speaker"]["source_resident"],
        "friend-00"
    );
    assert_eq!(report(&g)["events"][0]["speaker"]["resident"], 0);
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
}

#[test]
fn role_limits_and_removal_require_repair_instead_of_retargeting() {
    let mut d = definition();
    let expected = resolve(&d, &d.journal.as_ref().unwrap().roles[0].binding).unwrap();
    d.journal.as_mut().unwrap().roles[0].binding = Binding::Resident {
        resident: expected.clone(),
    };
    d.start
        .residents
        .as_mut()
        .unwrap()
        .retain(|p| p.id != expected);
    let result = crate::scenarios::compile(d.clone())
        .err()
        .expect("missing friend must fail");
    assert!(
        result
            .issues
            .iter()
            .any(|i| i.code == "missing_required_role")
    );
    d = definition();
    d.journal.as_mut().unwrap().roles.clear();
    assert!(crate::scenarios::compile(d).is_err());
    d = definition();
    let base = d.journal.as_ref().unwrap().roles[0].clone();
    d.journal.as_mut().unwrap().roles = (0..17)
        .map(|i| {
            let mut r = base.clone();
            r.id = format!("role-{i}");
            r
        })
        .collect();
    assert!(
        crate::scenarios::compile(d)
            .err()
            .unwrap()
            .issues
            .iter()
            .any(|i| i.code == "role_limit")
    );
}
