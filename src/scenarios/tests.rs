use super::*;

fn encoded(d: &Definition) -> String {
    serde_json::to_string(d).unwrap()
}
fn report(raw: &str) -> serde_json::Value {
    serde_json::from_str(raw).unwrap()
}

#[test]
fn both_official_modes_compile_with_the_original_located_supplies_and_freshness() {
    for mode in [modes::Mode::Story, modes::Mode::Sandbox] {
        let d = Definition::builtin(mode);
        let (mut g, result) =
            compile(d.clone()).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
        assert!(result.ok);
        let v = g.app.world().resource::<Village>();
        assert_eq!(v.camp, (32., 32.));
        assert_eq!(v.minutes, 480.);
        assert_eq!(v.buildings.len(), 2);
        assert!(ready(v, "shed") && ready(v, "warehouse"));
        let sandbox = mode == modes::Mode::Sandbox;
        assert_eq!(v.economy.money, if sandbox { 10_000_000 } else { 300_000 });
        assert_eq!(v.water, if sandbox { 40. } else { 32. });
        assert_eq!(economy::quantity(v, 0), if sandbox { 100 } else { 32 });
        assert_eq!(
            economy::quantity(v, economy::FOOD),
            if sandbox { 80 } else { 36 }
        );
        assert_eq!(
            economy::quantity(v, economy::MEALS),
            if sandbox { 20 } else { 0 }
        );
        let ledger = v.simulation.materials.as_ref().unwrap();
        for i in 0..economy::COUNT {
            let authored: u32 = d
                .start
                .inventories
                .iter()
                .map(|p| p.items.get(economy::NAMES[i]).copied().unwrap_or(0))
                .sum();
            assert_eq!(economy::quantity(v, i), authored);
            assert_eq!(ledger.opening[i], authored);
            assert_eq!(
                ledger.received[i], 0,
                "Starting stock is not a second delivery"
            );
            assert_eq!(ledger.spent[i], 0);
        }
        let indoor = v
            .logistics
            .as_ref()
            .unwrap()
            .stores
            .iter()
            .find(|p| p.owner == logistics::Owner::Warehouse(1))
            .unwrap();
        assert_eq!(
            indoor.items[economy::FOOD],
            economy::quantity(v, economy::FOOD)
        );
        assert!(
            indoor.food_lots.iter().all(|l| l.produced == 480.
                && l.expires == 480. + freshness::lifetime(l.material).unwrap())
        );
        assert_eq!(v.scenario.as_ref().unwrap().definition.id, d.id);
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_eq!(g.snapshot(), saved);
    }
}

#[test]
fn compilation_and_read_only_validation_are_repeatable_without_replacing_the_active_world() {
    let mut running = Game::new();
    let mut d = Definition::builtin(modes::Mode::Story);
    d.map.seed = 987654;
    let bytes = encoded(&d);
    let before = running.snapshot();
    let a = running.validate_scenario(&bytes);
    let b = running.validate_scenario(&bytes);
    assert_eq!(a, b);
    assert_eq!(running.snapshot(), before);
    assert!(report(&a)["ok"].as_bool().unwrap());
    assert!(
        report(&running.load_scenario(&bytes))["ok"]
            .as_bool()
            .unwrap()
    );
    let initial = running.snapshot();
    let mut second = Game::new();
    assert!(
        report(&second.load_scenario(&bytes))["ok"]
            .as_bool()
            .unwrap()
    );
    assert_eq!(second.snapshot(), initial);
    for _ in 0..400 {
        running.tick(0.25);
        second.tick(0.25);
    }
    assert_eq!(running.snapshot(), second.snapshot());
    let lived = running.snapshot();
    assert!(running.restore(&lived));
    assert_eq!(running.snapshot(), lived);
    assert!(
        report(&running.load_scenario(&bytes))["ok"]
            .as_bool()
            .unwrap()
    );
    assert_eq!(
        running.snapshot(),
        initial,
        "Restarting compiles the authored baseline, not the lived-in test"
    );
}

#[test]
fn invalid_content_ownership_geometry_and_capacity_leave_the_active_village_intact() {
    let original = Definition::builtin(modes::Mode::Story);
    let mut invalid = vec![];
    let mut d = original.clone();
    d.start.buildings[1].id = d.start.buildings[0].id.clone();
    invalid.push((d, "duplicate_building"));
    let mut d = original.clone();
    d.start.buildings[1].x = 30;
    invalid.push((d, "invalid_placement"));
    let mut d = original.clone();
    d.start.buildings[0].kind = "castle".into();
    invalid.push((d, "unknown_building"));
    let mut d = original.clone();
    d.start.inventories[0].items.insert("food".into(), 301);
    invalid.push((d, "storage_capacity"));
    let mut d = original.clone();
    d.start.inventories[0].owner = InventoryOwner::Building("absent".into());
    invalid.push((d, "missing_store"));
    let mut d = original.clone();
    d.start.inventories[0].owner = InventoryOwner::Building("starting-shed".into());
    invalid.push((d, "incompatible_store"));
    let mut d = original.clone();
    d.start.inventories[0].items.insert("diamonds".into(), 1);
    invalid.push((d, "invalid_material"));
    let mut d = original.clone();
    d.start.inventories.push(d.start.inventories[0].clone());
    invalid.push((d, "duplicate_store"));
    let mut d = original.clone();
    d.start.fresh_water = 100.;
    invalid.push((d, "water_capacity"));
    let mut d = original.clone();
    d.map.width = 1024;
    invalid.push((d, "unsupported_map"));
    let mut d = original.clone();
    d.map.clearings[0].x = i32::MAX;
    invalid.push((d, "invalid_clearing"));
    let mut d = original.clone();
    d.map.camp = [2, 2];
    invalid.push((d, "invalid_camp"));
    let mut d = original.clone();
    d.start.roads = vec![[30, 29]];
    invalid.push((d, "invalid_road"));
    let mut d = original.clone();
    d.start.roads = vec![[28, 30], [28, 30]];
    invalid.push((d, "invalid_road"));
    let mut g = Game::new();
    let before = g.snapshot();
    for (d, code) in invalid {
        let result = report(&g.load_scenario(&encoded(&d)));
        assert_eq!(result["ok"], false, "{result}");
        assert!(
            result["issues"]
                .as_array()
                .unwrap()
                .iter()
                .any(|i| i["code"] == code),
            "{code}: {result}"
        );
        assert_eq!(
            g.snapshot(),
            before,
            "{code} must not replace the live world"
        );
    }
    for data in ["not json".into(), "{}".into(), "x".repeat(MAX_BYTES + 1)] {
        assert_eq!(report(&g.load_scenario(&data))["ok"], false);
        assert_eq!(g.snapshot(), before);
    }
}

#[test]
fn blueprints_supported_appearances_and_located_inputs_compile_without_free_salvage() {
    let mut d = Definition::builtin(modes::Mode::Story);
    d.start.buildings.extend([
        Structure {
            id: "future-garden".into(),
            kind: "garden".into(),
            x: 38,
            y: 34,
            state: BuildingState::Blueprint,
            recipe: "standard".into(),
            appearance: None,
        },
        Structure {
            id: "adobe-house".into(),
            kind: "home".into(),
            x: 26,
            y: 29,
            state: BuildingState::Completed,
            recipe: "adobe".into(),
            appearance: Some("adobe-veranda".into()),
        },
    ]);
    let (mut g, _) =
        compile(d).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
    let v = g.app.world().resource::<Village>();
    let garden = v.buildings.iter().find(|b| b.kind == "garden").unwrap();
    assert_eq!(garden.progress, 0.);
    let home = v.buildings.iter().find(|b| b.kind == "home").unwrap();
    assert_eq!(home.progress, 100.);
    let p = v
        .economy
        .projects
        .iter()
        .find(|p| p.building == home.id)
        .unwrap();
    assert_eq!(p.appearance, Some(5));
    assert_eq!(building_work::salvage(v, home.id), [0; economy::COUNT]);
    assert!(
        v.power
            .network
            .nodes
            .iter()
            .any(|n| n.owner == electricity::Owner::Building(home.id))
    );
    let saved = g.snapshot();
    assert!(g.restore(&saved));
}

#[test]
fn rule_profiles_apply_before_initialization_and_origins_survive_as_immutable_content() {
    let mut d = Definition::builtin(modes::Mode::Sandbox);
    d.rules.logistics = true;
    d.rules.land = true;
    d.rules.utilities = true;
    d.rules.climate = true;
    d.rules.learning = true;
    d.rules.maintenance = true;
    d.rules.market = true;
    d.start.funds = 1200;
    d.start.inventories.iter_mut().for_each(|p| p.items.clear());
    let (mut g, _) =
        compile(d.clone()).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
    g.tick(0.25);
    let v = g.app.world().resource::<Village>();
    assert_eq!(
        v.economy.money, 1200,
        "Constrained Sandbox does not inherit comfort grants"
    );
    assert!(sandbox::logistics(v) && sandbox::land(v) && sandbox::utilities(v));
    assert!(v.climate.enabled && v.skills.enabled && v.maintenance.enabled && v.market.enabled);
    assert_eq!(
        encoded(&v.scenario.as_ref().unwrap().definition),
        encoded(&d)
    );
    assert!(!g.set_simulation_seed(123));
    let saved = g.snapshot();
    let mut invalid: serde_json::Value = serde_json::from_str(&saved).unwrap();
    invalid["village"]["scenario"]["definition"]["schema"] = 999.into();
    assert!(!g.restore(&invalid.to_string()));
    assert_eq!(g.snapshot(), saved);
    let mut old: serde_json::Value = serde_json::from_str(&Game::new().snapshot()).unwrap();
    old["village"]["version"] = 29.into();
    assert!(
        g.restore(&old.to_string()),
        "Current pre-builder saves retain their village"
    );
    assert!(g.app.world().resource::<Village>().scenario.is_none());
}
