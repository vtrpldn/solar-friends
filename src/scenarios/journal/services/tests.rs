use super::*;
fn condition(service: Kind, minimum: f64, minutes: u32) -> GoalCondition {
    GoalCondition::Service {
        service,
        minimum,
        minutes,
    }
}
fn definition(c: GoalCondition) -> Definition {
    let mut d = Definition::builtin(modes::Mode::Sandbox);
    d.rules.logistics = true;
    d.rules.utilities = true;
    d.start.fresh_water = 12.;
    for p in &mut d.start.inventories {
        p.items.clear();
    }
    d.start.inventories[0].items.insert("food".into(), 12);
    d.journal=Some(serde_json::from_value(serde_json::json!({"schema":1,"introduction":"Services for our friends","completion":"Keep caring for this place.","chapters":[{"id":"first","title":"A place to live","description":"","goals":[{"id":"service","title":"A working settlement","description":"","optional":false,"condition":c}]}]})).unwrap());
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
fn reading(g: &mut Game, kind: Kind) -> Reading {
    let p = people(g);
    let v = g.app.world().resource::<Village>();
    Frame::new(v, &p).reading(kind, v)
}
fn add(d: &mut Definition, id: &str, kind: &str, x: i32, y: i32) -> usize {
    let mut b = d.start.buildings[0].clone();
    b.id = id.into();
    b.kind = kind.into();
    b.x = x;
    b.y = y;
    d.start.buildings.push(b);
    d.start.buildings.len() - 1
}
fn tick(g: &mut Game, seconds: u32) {
    for _ in 0..seconds * 4 {
        g.tick(0.25);
    }
}
#[test]
fn real_food_and_water_access_earn_declared_quarter_hour_observations_without_paused_credit() {
    for kind in [Kind::Food, Kind::FreshWater] {
        let mut g = game(definition(condition(kind, 6., 15)));
        assert_eq!(view(&g)["value"], 0.);
        assert_eq!(view(&g)["service"]["value"], 12.);
        assert_eq!(view(&g)["service"]["qualifies"], true);
        let before = g.snapshot();
        g.tick(0.);
        assert_eq!(g.snapshot(), before);
        tick(&mut g, 4);
        assert_eq!(view(&g)["value"], 0.);
        assert!(report(&g)["finished_at"].is_null());
        tick(&mut g, 1);
        assert_eq!(view(&g)["value"], 15.);
        assert!(report(&g)["finished_at"].is_number());
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_eq!(g.snapshot(), saved);
    }
}
#[test]
fn a_real_stock_loss_interrupts_the_period_before_the_next_routine_access_check() {
    let mut d = definition(condition(Kind::Food, 37., 60));
    d.start.inventories[0].items.insert("food".into(), 37);
    let mut g = game(d);
    tick(&mut g, 5);
    assert_eq!(view(&g)["value"], 15.);
    assert_eq!(g.sell_material(economy::FOOD, 1), "ok");
    let paused = g.snapshot();
    assert!(g.restore(&paused));
    assert_eq!(g.snapshot(), paused);
    g.tick(0.25);
    assert_eq!(view(&g)["value"], 0.);
    assert_eq!(view(&g)["service"]["value"], 36.);
    assert_eq!(view(&g)["service"]["qualifies"], false);
}
#[test]
fn food_counts_actual_edible_dated_stores_not_eggs_or_unreachable_supplies() {
    let mut d = definition(condition(Kind::Food, 1., 15));
    d.start.inventories[0].items.clear();
    d.start.inventories[0].items.insert("eggs".into(), 12);
    let mut g = game(d);
    assert_eq!(reading(&mut g, Kind::Food).value, 0.);
    let mut d = definition(condition(Kind::Food, 1., 15));
    d.start.inventories[0].food_lots = vec![StartingFood {
        material: "food".into(),
        amount: 12,
        age_minutes: freshness::lifetime(economy::FOOD).unwrap() - 1.,
    }];
    let mut g = game(d);
    assert_eq!(reading(&mut g, Kind::Food).value, 0.);
    let mut d = definition(condition(Kind::Food, 1., 15));
    d.map.river.as_mut().unwrap().centers.fill(40.);
    d.map.nature = Some(vec![]);
    add(&mut d, "far-store", "warehouse", 50, 25);
    let items = d.start.inventories[0].items.clone();
    d.start.inventories[0].items.clear();
    d.start.inventories.push(Inventory {
        owner: InventoryOwner::Building("far-store".into()),
        items,
        food_lots: vec![],
    });
    let mut g = game(d);
    let r = reading(&mut g, Kind::Food);
    assert_eq!(r.value, 0.);
    assert!(!r.accessible);
    assert_eq!(
        economy::quantity(g.app.world().resource::<Village>(), economy::FOOD),
        12
    );
}
#[test]
fn fresh_water_excludes_irrigation_and_inaccessible_owned_containers() {
    let mut d = definition(condition(Kind::FreshWater, 0.1, 15));
    d.start.fresh_water = 2.5;
    d.map.river.as_mut().unwrap().centers.fill(40.);
    d.map.nature = Some(vec![]);
    add(&mut d, "far-cistern", "well", 50, 25);
    d.start.liquids = Some(vec![
        StartingLiquids {
            owner: InventoryOwner::Building("far-cistern".into()),
            contents: BTreeMap::from([("fresh".into(), 2.5)]),
        },
        StartingLiquids {
            owner: InventoryOwner::Camp,
            contents: BTreeMap::from([("irrigation".into(), 4.)]),
        },
    ]);
    let mut g = game(d);
    let r = reading(&mut g, Kind::FreshWater);
    assert_eq!(r.value, 0.);
    assert!(!r.accessible);
    assert_eq!(
        water::total(g.app.world().resource::<Village>(), water::Class::Fresh),
        2.5
    );
    let mut g = game(definition(condition(Kind::FreshWater, 6., 60)));
    tick(&mut g, 5);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        let available = water::local(&v, water::Owner::Camp, water::Class::Fresh);
        assert!(available > 0.);
        assert_eq!(
            water::draw(&mut v, water::Owner::Camp, water::Class::Fresh, available),
            available
        );
    }
    g.tick(0.25);
    assert_eq!(view(&g)["value"], 0.);
    assert_eq!(view(&g)["service"]["qualifies"], false);
}
#[test]
fn all_away_access_uses_the_arrival_clearing_instead_of_vacuous_success() {
    let mut g = game(definition(condition(Kind::FreshWater, 6., 15)));
    let mut p = people(&mut g);
    for r in &mut p {
        r.trip = Some(mobility::Trip {
            purpose: mobility::Purpose::Work,
            phase: mobility::Phase::Away,
            return_at: 1020.,
            order: None,
        });
    }
    let v = g.app.world().resource::<Village>();
    let mut frame = Frame::new(v, &p);
    assert_eq!(frame.reading(Kind::FreshWater, v).value, 12.);
    assert!(frame.reading(Kind::FreshWater, v).accessible);
    assert!(frame.reading(Kind::Food, v).accessible);
    assert_eq!(food::service_participants(v, &p).len(), 1);
    assert_eq!(frame.reading(Kind::Toilets, v).value, 0.);
    assert!(!frame.reading(Kind::Toilets, v).accessible);
}
#[test]
fn assigned_reachable_homes_count_people_and_resident_building_work_closes_them() {
    let mut d = definition(condition(Kind::HousedResidents, 5., 60));
    add(&mut d, "home-one", "home", 25, 25);
    add(&mut d, "home-two", "home", 20, 25);
    let mut g = game(d);
    assert_eq!(view(&g)["service"]["value"], 5.);
    tick(&mut g, 5);
    assert_eq!(view(&g)["value"], 15.);
    let id = g
        .app
        .world()
        .resource::<Village>()
        .buildings
        .iter()
        .find(|b| b.kind == "home")
        .unwrap()
        .id;
    assert_eq!(g.queue_building_work(id, "demolish", 0, 0), "ok");
    g.tick(0.25);
    assert_eq!(view(&g)["value"], 0.);
    assert_eq!(view(&g)["service"]["value"], 3.);
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
    let mut g = game(definition(condition(Kind::HousedResidents, 1., 15)));
    assert_eq!(reading(&mut g, Kind::HousedResidents).value, 0.);
}
#[test]
fn sanitation_needs_local_handwashing_and_real_greywater_and_sewage_space() {
    for blocked in [None, Some("greywater"), Some("sewage")] {
        let mut d = definition(condition(Kind::Toilets, 1., 15));
        add(&mut d, "our-toilet", "eco_toilet", 25, 25);
        let mut contents = BTreeMap::from([("fresh".into(), 4.)]);
        if let Some(class) = blocked {
            contents.insert(class.into(), 16.);
        }
        d.start.fresh_water = 4.;
        d.start.liquids = Some(vec![StartingLiquids {
            owner: InventoryOwner::Building("our-toilet".into()),
            contents,
        }]);
        let mut g = game(d);
        let r = reading(&mut g, Kind::Toilets);
        assert_eq!(r.value, if blocked.is_none() { 1. } else { 0. });
        assert_eq!(r.accessible, blocked.is_none());
    }
}
fn night_definition() -> Definition {
    let mut d = definition(condition(Kind::NightLights, 1., 60));
    d.start.minutes = 1200.;
    let i = add(&mut d, "our-solar", "solar_farm", 25, 25);
    d.start.buildings[i].battery = Some(super::super::super::batteries::BuildingBank {
        charge: 12.,
        owned: true,
    });
    add(&mut d, "our-lamp", "streetlight", 28, 25);
    let g = game(d.clone());
    let raw = serde_json::to_string(&d).unwrap();
    let p: serde_json::Value = serde_json::from_str(&g.scenario_route_preview(
        &raw,
        "electricity",
        "{\"kind\":\"building\",\"id\":\"our-solar\"}",
        "{\"kind\":\"building\",\"id\":\"our-lamp\"}",
    ))
    .unwrap();
    assert_eq!(p["allowed"], true, "{p}");
    d.start.routes.push(super::super::super::routes::Route {
        id: "our-cable".into(),
        kind: utilities::Kind::Electricity,
        from: super::super::super::routes::Endpoint::Building("our-solar".into()),
        to: super::super::super::routes::Endpoint::Building("our-lamp".into()),
        state: BuildingState::Completed,
        cells: serde_json::from_value(p["cells"].clone()).unwrap(),
    });
    d
}
#[test]
fn lighting_requires_a_live_charged_circuit_at_night_and_checks_every_step() {
    let d = night_definition();
    let mut disconnected = d.clone();
    disconnected.start.routes.clear();
    let mut g = game(disconnected);
    assert_eq!(reading(&mut g, Kind::NightLights).value, 0.);
    let mut g = game(d);
    assert_eq!(view(&g)["service"]["value"], 1.);
    g.tick(0.25);
    assert_eq!(view(&g)["value"], 0.75);
    let id = g
        .app
        .world()
        .resource::<Village>()
        .buildings
        .iter()
        .find(|b| b.kind == "streetlight")
        .unwrap()
        .id;
    assert!(g.set_power_enabled(id, false));
    g.tick(0.25);
    assert_eq!(view(&g)["value"], 0.);
    assert_eq!(view(&g)["service"]["value"], 0.);
    assert!(g.set_power_enabled(id, true));
    g.tick(0.25);
    assert_eq!(view(&g)["value"], 0.);
    g.tick(0.25);
    assert_eq!(view(&g)["value"], 0.75);
    let p = people(&mut g);
    let mut daylight = g.app.world().resource::<Village>().clone();
    daylight.minutes = 720.;
    assert_eq!(
        Frame::new(&daylight, &p)
            .reading(Kind::NightLights, &daylight)
            .value,
        0.
    );
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
}
#[test]
fn service_limits_rule_requirements_and_impossible_population_targets_are_atomic() {
    let mut g = game(definition(condition(Kind::Food, 6., 15)));
    let before = g.snapshot();
    for c in [
        condition(Kind::Food, 0., 15),
        condition(Kind::Food, 1.5, 15),
        condition(Kind::FreshWater, 0.01, 15),
        condition(Kind::Toilets, 1., 16),
        condition(Kind::NightLights, 1., 0),
        condition(Kind::HousedResidents, 6., 15),
    ] {
        let d = definition(c);
        let result: serde_json::Value =
            serde_json::from_str(&g.load_scenario(&serde_json::to_string(&d).unwrap())).unwrap();
        assert_eq!(result["ok"], false);
        assert_eq!(g.snapshot(), before);
    }
    for k in [
        Kind::Food,
        Kind::FreshWater,
        Kind::Toilets,
        Kind::NightLights,
    ] {
        let mut d = definition(condition(k, 1., 15));
        d.rules.logistics = false;
        d.rules.utilities = false;
        assert!(compile(d).is_err());
    }
}
#[test]
fn malformed_saved_observations_cannot_forge_future_past_or_stale_service_periods() {
    let mut g = game(definition(condition(Kind::Food, 6., 60)));
    tick(&mut g, 7);
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    for case in [
        "missing",
        "extra",
        "future",
        "backdated",
        "negative",
        "fractional",
        "false-access",
        "stale",
    ] {
        let mut bad: serde_json::Value = serde_json::from_str(&saved).unwrap();
        let watches =
            &mut bad["village"]["progress"]["scenario_journal"]["goals"]["service"]["services"];
        let key = watches.as_object().unwrap().keys().next().unwrap().clone();
        match case {
            "missing" => {
                watches.as_object_mut().unwrap().clear();
            }
            "extra" => {
                watches["unknown"] = watches[&key].clone();
            }
            "future" => {
                watches[&key]["last"] = serde_json::json!(900.);
            }
            "backdated" => {
                watches[&key]["since"] = serde_json::json!(0.);
            }
            "negative" => {
                watches[&key]["reading"]["value"] = serde_json::json!(-1.);
            }
            "fractional" => {
                watches[&key]["reading"]["value"] = serde_json::json!(12.5);
            }
            "false-access" => {
                watches[&key]["reading"]["accessible"] = serde_json::json!(false);
            }
            "stale" => {
                watches[&key]["last"] = serde_json::json!(480.);
            }
            _ => unreachable!(),
        };
        assert!(!g.restore(&bad.to_string()), "{case}");
        assert_eq!(g.snapshot(), saved);
    }
    let p = people(&mut g);
    g.app.world_mut().resource_mut::<Village>().minutes += 90.;
    super::super::observe(&mut g.app.world_mut().resource_mut::<Village>(), &p);
    assert_eq!(view(&g)["value"], 0.);
}
#[test]
fn service_event_receipts_and_partial_saves_continue_exactly_with_reordered_twelve_person_cast() {
    let mut d = definition(condition(Kind::FreshWater, 6., 60));
    let founders = residents::founders();
    d.start.residents = Some(
        (0..12)
            .rev()
            .map(|i| {
                let mut p = founders[i % 5].clone();
                p.id = format!("friend-{i:02}");
                p
            })
            .collect(),
    );
    d.journal.as_mut().unwrap().events=serde_json::from_value(serde_json::json!([{"id":"support","title":"Working water","when":{"kind":"threshold","condition":condition(Kind::FreshWater,6.,15)},"effect":{"kind":"grant_funds","cents":100}}])).unwrap();
    let initial = d.start.funds;
    let mut g = game(d);
    tick(&mut g, 6);
    let saved = g.snapshot();
    let mut copy = Game::new();
    assert!(copy.restore(&saved));
    assert_eq!(copy.snapshot(), saved);
    for _ in 0..200 {
        g.tick(0.25);
        copy.tick(0.25);
    }
    assert_eq!(g.snapshot(), copy.snapshot());
    assert_eq!(
        g.app.world().resource::<Village>().economy.money,
        initial + 100
    );
    assert!(report(&g)["finished_at"].is_number());
    let final_save = g.snapshot();
    assert!(g.restore(&final_save));
    assert_eq!(g.snapshot(), final_save);
}
#[test]
fn later_chapters_and_locked_service_buildings_do_not_receive_premature_credit() {
    let mut d = definition(GoalCondition::Date { minute: 483. });
    d.journal.as_mut().unwrap().chapters.push(serde_json::from_value(serde_json::json!({"id":"later","title":"Steady reserves","description":"","goals":[{"id":"later-water","title":"A new period","description":"","optional":false,"condition":condition(Kind::FreshWater,6.,15)}]})).unwrap());
    let mut g = game(d);
    for _ in 0..4 {
        g.tick(0.25);
    }
    let r = report(&g);
    assert!(r["chapters"][1]["goals"][0]["condition"]["service"]["value"].is_null());
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    g.tick(0.25);
    tick(&mut g, 4);
    assert!(report(&g)["finished_at"].is_null());
    tick(&mut g, 1);
    assert!(report(&g)["finished_at"].is_number());
    for (k, b) in [
        (Kind::HousedResidents, "home"),
        (Kind::Toilets, "eco_toilet"),
        (Kind::NightLights, "streetlight"),
    ] {
        let mut d = definition(condition(k, 1., 15));
        let j = d.journal.as_mut().unwrap();
        j.locked_buildings = vec![b.into()];
        j.events=serde_json::from_value(serde_json::json!([{"id":"unlock","title":"More services","when":{"kind":"goal","goal":"service"},"effect":{"kind":"unlock_building","building":b}}])).unwrap();
        assert!(compile(d).is_err());
    }
}
