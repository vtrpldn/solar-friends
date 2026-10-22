use super::*;
fn condition(building: &str, state: Stage) -> GoalCondition {
    GoalCondition::Operating {
        building: building.into(),
        state,
        count: 2,
        region: None,
    }
}
fn definition(c: GoalCondition) -> Definition {
    let mut d = Definition::builtin(modes::Mode::Sandbox);
    d.rules.logistics = true;
    d.rules.utilities = true;
    d.map.nature = Some(vec![]);
    for store in &mut d.start.inventories {
        store.items.clear();
    }
    d.start.inventories[0].items = [("food".into(), 12)].into_iter().collect();
    d.start
        .inventories
        .iter_mut()
        .find(|s| matches!(s.owner, InventoryOwner::Camp))
        .unwrap()
        .items
        .insert("timber".into(), 32);
    d.journal=Some(serde_json::from_value(serde_json::json!({"schema":1,"introduction":"Working infrastructure","completion":"Keep caring for it","chapters":[{"id":"first","title":"Useful buildings","description":"","goals":[{"id":"operation","title":"Keep things working","description":"","optional":false,"condition":c}]}]})).unwrap());
    d
}
fn add(d: &mut Definition, kind: &str, x: i32, y: i32) -> usize {
    let mut b = d.start.buildings[0].clone();
    b.id = format!("our-{kind}");
    b.kind = kind.into();
    b.x = x;
    b.y = y;
    d.start.buildings.push(b);
    d.start.buildings.len() - 1
}
fn game(d: Definition) -> Game {
    compile(d)
        .unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()))
        .0
}
fn reading(g: &Game) -> serde_json::Value {
    let v = g.app.world().resource::<Village>();
    let c = &v
        .scenario
        .as_ref()
        .unwrap()
        .definition
        .journal
        .as_ref()
        .unwrap()
        .chapters[0]
        .goals[0]
        .condition;
    measure(c, v).1
}
fn workshop(state: Stage) -> (Game, usize, simulation::Id) {
    let mut d = definition(condition("workshop", state));
    let id = add(&mut d, "workshop", 25, 25);
    let mut g = game(d);
    let batch = {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        production::order_tools(&mut v, Some(id)).unwrap()
    };
    (g, id, batch)
}
#[test]
fn completed_workshop_needs_delivered_inputs_and_real_work_to_be_underway() {
    let (mut g, building, batch) = workshop(Stage::Ready);
    assert_eq!(reading(&g)["value"], 0);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        production::fixture_inputs(&mut v, batch);
    }
    assert_eq!(reading(&g)["value"], 1);
    let underway = condition("workshop", Stage::Underway);
    assert_eq!(
        measure(&underway, g.app.world().resource::<Village>()).1["value"],
        0
    );
    let mut worker = {
        let world = g.app.world_mut();
        let mut q = world.query::<&Resident>();
        q.iter(world).next().unwrap().clone()
    };
    {
        let v = g.app.world().resource::<Village>();
        let target = production::approach(v, batch, worker.id).unwrap();
        worker.x = target.0;
        worker.y = target.1;
        worker.target_x = target.0;
        worker.target_y = target.1;
        worker.task = "craft".into();
        worker.activity_batch = Some(batch);
    }
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(!production::work(&mut v, &worker, 0.25));
        assert_eq!(measure(&underway, &v).1["value"], 1);
        assert!(
            v.production
                .batches
                .iter()
                .any(|b| b.id == batch && b.work > 0. && b.work < 10.)
        );
    }
    let site = g
        .app
        .world()
        .resource::<Village>()
        .production
        .sites
        .iter()
        .find(|s| s.building == Some(building))
        .unwrap()
        .id;
    assert_eq!(g.set_production_paused(site.0, true), "ok");
    assert_eq!(reading(&g)["value"], 0);
    assert_eq!(
        measure(&underway, g.app.world().resource::<Village>()).1["value"],
        0
    );
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
}
#[test]
fn powered_workshop_requires_real_power_and_can_return_to_hand_tools() {
    let (mut g, building, batch) = workshop(Stage::Ready);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        production::fixture_inputs(&mut v, batch);
    }
    assert_eq!(reading(&g)["value"], 1);
    let site = g
        .app
        .world()
        .resource::<Village>()
        .production
        .sites
        .iter()
        .find(|s| s.building == Some(building))
        .unwrap()
        .id;
    assert_ne!(g.set_workshop_powered(site.0, true), "ok");
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.production
            .sites
            .iter_mut()
            .find(|s| s.id == site)
            .unwrap()
            .powered = true;
    }
    assert_eq!(reading(&g)["value"], 0);
    assert_eq!(g.set_workshop_powered(site.0, false), "ok");
    assert_eq!(reading(&g)["value"], 1);
}

#[test]
fn passive_treatment_needs_committed_inputs_and_rechecks_pause_and_output() {
    let mut d = definition(condition("wetland", Stage::Underway));
    let id = add(&mut d, "wetland", 25, 25);
    let mut g = game(d);
    assert_eq!(reading(&g)["value"], 0);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        water::fixture_liquid(&mut v, water::Class::Greywater, 12.);
        water::fixture_at(
            &mut v,
            water::Owner::Building(id),
            water::Class::Greywater,
            12.,
        );
        processes::advance(&mut v, 0.);
    }
    assert_eq!(reading(&g)["value"], 1);
    assert_eq!(g.set_process_paused(id, true), "ok");
    assert_eq!(reading(&g)["value"], 0);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        processes::advance(&mut v, 0.);
    }
    assert_eq!(g.set_process_paused(id, false), "ok");
    assert_eq!(reading(&g)["value"], 0); // The authoritative paused phase changes on the next process observation.
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        processes::advance(&mut v, 1.);
    }
    assert_eq!(reading(&g)["value"], 1);
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        processes::advance(&mut v, 360.);
    }
    assert_eq!(reading(&g)["value"], 0);
}
#[test]
fn banana_bed_without_local_sewage_is_not_operating() {
    let mut d = definition(condition("banana_treatment", Stage::Underway));
    let id = add(&mut d, "banana_treatment", 25, 25);
    let mut g = game(d);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        processes::advance(&mut v, 1.);
    }
    assert_eq!(reading(&g)["value"], 0);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        water::fixture_liquid(&mut v, water::Class::Sewage, 2.);
        water::fixture_at(&mut v, water::Owner::Building(id), water::Class::Sewage, 2.);
        processes::advance(&mut v, 1.);
        assert!(v.circular.waste_treated > 0.);
    }
    assert_eq!(reading(&g)["value"], 1);
    assert_eq!(g.set_process_paused(id, true), "ok");
    assert_eq!(reading(&g)["value"], 0);
}
#[test]
fn solar_generation_uses_sunlight_not_a_finished_sprite_or_charged_battery() {
    let mut d = definition(condition("solar_farm", Stage::Generating));
    d.start.minutes = 720.;
    let index = add(&mut d, "solar_farm", 25, 25);
    d.start.buildings[index].battery = Some(crate::scenarios::batteries::BuildingBank {
        charge: 12.,
        owned: true,
    });
    let mut g = game(d.clone());
    assert_eq!(reading(&g)["value"], 1);
    assert!(g.configure_sandbox_rules(true, true, false));
    assert_eq!(reading(&g)["value"], 0);
    d.start.minutes = 1200.;
    let g = game(d);
    assert_eq!(reading(&g)["value"], 0);
}
#[test]
fn unsupported_operation_rules_regions_counts_and_unlock_loops_are_rejected() {
    let source = definition(condition("workshop", Stage::Ready));
    for variant in 0..6 {
        let mut d = source.clone();
        let GoalCondition::Operating {
            building,
            state,
            count,
            region,
        } = &mut d.journal.as_mut().unwrap().chapters[0].goals[0].condition
        else {
            unreachable!()
        };
        match variant {
            0 => *count = 0,
            1 => *count = 257,
            2 => *state = Stage::Generating,
            3 => *region = Some("missing".into()),
            4 => *building = "home".into(),
            _ => d.rules.logistics = false,
        }
        assert!(compile(d).is_err());
    }
    let mut d = source;
    d.journal.as_mut().unwrap().locked_buildings = vec!["workshop".into()];
    assert!(
        compile(d)
            .err()
            .unwrap()
            .issues
            .iter()
            .any(|i| i.code == "unlock_deadlock")
    );
}

#[test]
fn a_region_must_contain_the_whole_footprint_and_closing_stops_credit() {
    let mut d = definition(condition("solar_farm", Stage::Generating));
    d.start.minutes = 720.;
    let id = add(&mut d, "solar_farm", 25, 25);
    d.map.regions = vec![Region {
        id: "yard".into(),
        title: "Our solar yard".into(),
        x: 25,
        y: 25,
        width: 1,
        height: 1,
    }];
    let GoalCondition::Operating { region, .. } =
        &mut d.journal.as_mut().unwrap().chapters[0].goals[0].condition
    else {
        unreachable!()
    };
    *region = Some("yard".into());
    assert_eq!(reading(&game(d.clone()))["value"], 0);
    d.map.regions[0].x = 24;
    d.map.regions[0].y = 24;
    d.map.regions[0].width = 3;
    d.map.regions[0].height = 3;
    let mut g = game(d);
    assert_eq!(reading(&g)["value"], 1);
    assert_eq!(g.queue_building_work(id, "demolish", 0, 0), "ok");
    assert_eq!(reading(&g)["value"], 0);
}
#[test]
fn lights_require_real_night_supply_and_enabled_connections() {
    let mut d = definition(condition("streetlight", Stage::Lit));
    d.start.minutes = 1200.;
    let solar = add(&mut d, "solar_farm", 25, 25);
    let lamp = add(&mut d, "streetlight", 28, 25);
    d.start.buildings[solar].battery = Some(crate::scenarios::batteries::BuildingBank {
        charge: 12.,
        owned: true,
    });
    let g = game(d.clone());
    assert_eq!(reading(&g)["value"], 0);
    let route: serde_json::Value = serde_json::from_str(&g.scenario_route_preview(
        &serde_json::to_string(&d).unwrap(),
        "electricity",
        "{\"kind\":\"building\",\"id\":\"our-solar_farm\"}",
        "{\"kind\":\"building\",\"id\":\"our-streetlight\"}",
    ))
    .unwrap();
    assert_eq!(route["allowed"], true, "{route}");
    d.start.routes.push(crate::scenarios::routes::Route {
        id: "our-cable".into(),
        kind: utilities::Kind::Electricity,
        from: crate::scenarios::routes::Endpoint::Building("our-solar_farm".into()),
        to: crate::scenarios::routes::Endpoint::Building("our-streetlight".into()),
        state: BuildingState::Completed,
        cells: serde_json::from_value(route["cells"].clone()).unwrap(),
    });
    let mut g = game(d.clone());
    assert_eq!(reading(&g)["value"], 1);
    assert!(g.set_power_enabled(lamp, false));
    assert_eq!(reading(&g)["value"], 0);
    d.start.minutes = 720.;
    assert_eq!(reading(&game(d))["value"], 0);
}

#[test]
fn biodigester_requires_owned_local_feed_and_honours_its_live_toggle() {
    let mut d = definition(condition("biodigester", Stage::Underway));
    let index = add(&mut d, "biodigester", 25, 25);
    let identity = d.start.buildings[index].id.clone();
    d.start.inventories.push(serde_json::from_value(serde_json::json!({"owner":{"kind":"building","building":identity},"items":{"scraps":2}})).unwrap());
    d.start.liquids = Some(vec![
        StartingLiquids {
            owner: InventoryOwner::Camp,
            contents: [("fresh".into(), f64::from(d.start.fresh_water))]
                .into_iter()
                .collect(),
        },
        StartingLiquids {
            owner: InventoryOwner::Building(identity),
            contents: [("sewage".into(), 2.)].into_iter().collect(),
        },
    ]);
    let mut g = game(d);
    assert_eq!(reading(&g)["value"], 0);
    g.tick(0.25);
    assert_eq!(reading(&g)["value"], 1);
    g.configure_sanitation(false, true, true);
    assert_eq!(reading(&g)["value"], 0);
    g.configure_sanitation(true, true, true);
    assert_eq!(reading(&g)["value"], 1);
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
}
