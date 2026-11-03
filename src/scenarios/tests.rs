use super::*;

fn encoded(d: &Definition) -> String {
    serde_json::to_string(d).unwrap()
}
fn report(raw: &str) -> serde_json::Value {
    serde_json::from_str(raw).unwrap()
}

#[test]
fn frozen_cast_membership_survives_cosmetics_but_rejects_replacement_or_missing_people() {
    for authored in [false, true] {
        let mut d = Definition::builtin(modes::Mode::Sandbox);
        if authored {
            d.start.residents = Some(residents::founders());
        }
        let (mut g, _) = compile(d).unwrap_or_else(|_| panic!("valid default cast"));
        let mut save: Save = serde_json::from_str(&g.snapshot()).unwrap();
        save.residents[0].name = "Renamed friend".into();
        assert!(matches_residents(&save.village, &save.residents));
        let valid = serde_json::to_string(&save).unwrap();
        assert!(g.restore(&valid));
        let before = g.snapshot();
        save.residents[0].id = 900;
        assert!(!matches_residents(&save.village, &save.residents));
        assert!(!g.restore(&serde_json::to_string(&save).unwrap()));
        assert_eq!(g.snapshot(), before);
        save.residents.remove(0);
        assert!(!matches_residents(&save.village, &save.residents));
        assert!(!g.restore(&serde_json::to_string(&save).unwrap()));
        assert_eq!(g.snapshot(), before);
    }
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
            material_recovery: Default::default(),
            crop: None,
            orchard: None,
            animals: None,
            battery: None,
            id: "future-garden".into(),
            kind: "garden".into(),
            x: 38,
            y: 34,
            state: BuildingState::Blueprint,
            recipe: "standard".into(),
            appearance: None,
        },
        Structure {
            material_recovery: Default::default(),
            crop: None,
            orchard: None,
            animals: None,
            battery: None,
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

#[test]
fn authored_deposits_are_finite_located_and_preserved_without_inventory_grants() {
    let mut d = Definition::builtin(modes::Mode::Sandbox);
    d.rules.land = true;
    d.map.deposits = Some(vec![GeologicalPatch {
        id: "our-stone".into(),
        material: "stone".into(),
        x: 5,
        y: 5,
        width: 4,
        height: 4,
        quantity: 40,
    }]);
    let (mut g, _) =
        compile(d).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
    let v = g.app.world().resource::<Village>();
    assert_eq!(v.land.deposits.len(), 1);
    assert_eq!(v.economy.land, [0., 40., 0.]);
    assert_eq!(land::deposit(v, 3, 6, 6).unwrap().remaining, 40);
    assert!(resource_sites::location(v, 3, 6, 6).is_ok());
    assert!(resource_sites::location(v, 3, 24, 24).is_err());
    let stock = v.economy.stock;
    let id = v.land.deposits[0].id;
    land::extract(&mut g.app.world_mut().resource_mut::<Village>(), id, 7);
    let v = g.app.world().resource::<Village>();
    assert_eq!(v.economy.stock, stock);
    assert_eq!(v.economy.land, [0., 33., 0.]);
    let raw = g.snapshot();
    let mut loaded = Game::new();
    assert!(loaded.restore(&raw));
    assert_eq!(loaded.snapshot(), raw);
    let mut forged: serde_json::Value = serde_json::from_str(&raw).unwrap();
    forged["village"]["land"]["deposits"][0]["maximum"] = 41.into();
    assert!(!loaded.restore(&forged.to_string()));
    assert_eq!(loaded.snapshot(), raw);
}
#[test]
fn empty_geology_and_invalid_patch_imports_are_atomic() {
    let mut d = Definition::builtin(modes::Mode::Sandbox);
    d.map.deposits = Some(vec![]);
    let (mut g, _) =
        compile(d.clone()).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
    assert!(g.app.world().resource::<Village>().land.deposits.is_empty());
    assert_eq!(g.app.world().resource::<Village>().economy.land, [0.; 3]);
    let before = g.snapshot();
    for (material, x, width, quantity) in [
        ("stone", i32::MAX, 4, 40),
        ("timber", 5, 4, 40),
        ("stone", 5, 4, 97),
        ("stone", 5, 0, 40),
    ] {
        d.map.deposits = Some(vec![GeologicalPatch {
            id: "patch".into(),
            material: material.into(),
            x,
            y: 5,
            width,
            height: 4,
            quantity,
        }]);
        assert!(g.load_scenario(&encoded(&d)).contains("invalid_deposits"));
        assert_eq!(g.snapshot(), before);
    }
}

#[test]
fn explicit_nature_preserves_identity_geometry_and_real_shade_on_opening_soil() {
    let mut d = Definition::builtin(modes::Mode::Sandbox);
    d.map.nature = Some(vec![NatureObject {
        id: "our-tree".into(),
        species: "jequitiba-rosa".into(),
        x: 32.,
        y: 35.,
        size: 1.,
    }]);
    let (mut g, _) =
        compile(d.clone()).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
    let v = g.app.world().resource::<Village>();
    assert_eq!(v.land.vegetation.len(), 1);
    assert!(!v.land.vegetation[0].cleared);
    assert!(land::ground(v, 32, 35).shade > 0.3);
    let tree = v.land.vegetation[0].clone();
    let cloned = v.clone();
    assert!(std::sync::Arc::ptr_eq(
        v.scenario.as_ref().unwrap(),
        cloned.scenario.as_ref().unwrap()
    ));
    let raw = g.snapshot();
    let mut copy = Game::new();
    assert!(copy.restore(&raw));
    assert_eq!(copy.snapshot(), raw);
    d.map.seed += 1;
    let (second, _) =
        compile(d).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
    assert_eq!(
        second.app.world().resource::<Village>().land.vegetation[0],
        tree
    );
}
#[test]
fn nature_catalog_generation_and_invalid_objects_are_bounded_and_read_only() {
    let mut g = Game::new();
    let before = g.snapshot();
    assert_eq!(g.generate_property(42), g.generate_property(42));
    assert_ne!(g.generate_property(42), g.generate_property(43));
    assert_eq!(g.snapshot(), before);
    let mut d = Definition::builtin(modes::Mode::Sandbox);
    for (species, size) in [("unknown-species", 1.), ("jucara", 2.)] {
        d.map.nature = Some(vec![NatureObject {
            id: "tree".into(),
            species: species.into(),
            x: 32.,
            y: 35.,
            size,
        }]);
        assert!(g.load_scenario(&encoded(&d)).contains("invalid_nature"));
        assert_eq!(g.snapshot(), before);
    }
    d.map.nature = Some(
        (0..9)
            .map(|i| NatureObject {
                id: format!("tree-{i}"),
                species: "jucara".into(),
                x: 32.,
                y: 35.,
                size: 1.,
            })
            .collect(),
    );
    assert!(g.load_scenario(&encoded(&d)).contains("invalid_nature"));
    assert_eq!(g.snapshot(), before);
}

#[test]
fn authored_terrain_freezes_baselines_and_changes_real_growing_conditions() {
    let mut d = Definition::builtin(modes::Mode::Sandbox);
    d.rules.land = true;
    let (original, _) =
        compile(d.clone()).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
    let before = original.land_report();
    let mut cells: Vec<TerrainCell> = serde_json::from_str(&original.terrain_template()).unwrap();
    assert_eq!(cells.len(), 4096);
    d.map.terrain = Some(cells.clone());
    let (same, _) =
        compile(d.clone()).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
    assert_eq!(same.land_report(), before);
    cells[12 * 64 + 12] = TerrainCell {
        habitat: "rocky-woodland".into(),
        fertility: 0.44,
        retention: 0.7,
        cover: 0.36,
    };
    d.map.terrain = Some(cells);
    let (mut changed, _) =
        compile(d).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
    let v = changed.app.world().resource::<Village>();
    let soil = land::ground(v, 12, 12);
    assert_eq!(soil.biome, "Rocky woodland");
    assert_eq!(soil.fertility, 0.44);
    assert_eq!(soil.retention, 0.7);
    assert!(land::growth(&soil) < land::growth(&land::ground(v, 12, 13)));
    let saved = changed.snapshot();
    let mut loaded = Game::new();
    assert!(loaded.restore(&saved));
    assert_eq!(loaded.snapshot(), saved);
}
#[test]
fn malformed_terrain_does_not_replace_the_current_village() {
    let mut g = Game::new();
    let before = g.snapshot();
    let mut d = Definition::builtin(modes::Mode::Sandbox);
    let mut cells: Vec<TerrainCell> = serde_json::from_str(&g.terrain_template()).unwrap();
    cells[0].habitat = "unsupported-habitat".into();
    d.map.terrain = Some(cells.clone());
    assert!(g.load_scenario(&encoded(&d)).contains("invalid_terrain"));
    assert_eq!(g.snapshot(), before);
    cells[0].habitat = "flower-meadow".into();
    cells[0].retention = 9.;
    d.map.terrain = Some(cells.clone());
    assert!(g.load_scenario(&encoded(&d)).contains("invalid_terrain"));
    assert_eq!(g.snapshot(), before);
    cells.pop();
    d.map.terrain = Some(cells);
    assert!(g.load_scenario(&encoded(&d)).contains("invalid_terrain"));
    assert_eq!(g.snapshot(), before);
}

#[test]
fn live_reports_omit_frozen_maps_without_changing_rules_or_becoming_saves() {
    let mut d = Definition::builtin(modes::Mode::Story);
    d.rules.logistics = false;
    d.rules.land = false;
    d.rules.utilities = false;
    let (mut g, _) =
        compile(d.clone()).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
    d.map.terrain = Some(serde_json::from_str(&g.terrain_template()).unwrap());
    assert!(g.load_scenario(&encoded(&d)).contains("\"ok\":true"));
    let before = g.snapshot();
    let report = g.report_state();
    assert!(report.len() * 2 < before.len());
    let mut full: serde_json::Value = serde_json::from_str(&before).unwrap();
    let view: serde_json::Value = serde_json::from_str(&report).unwrap();
    full["village"].as_object_mut().unwrap().remove("scenario");
    assert_eq!(view["village"], full["village"]);
    assert_eq!(view["environment"], full["environment"]);
    assert_eq!(view["residents"], full["residents"]);
    assert!(!g.restore(&report));
    assert_eq!(g.snapshot(), before);
}

#[test]
fn authored_weather_drives_the_first_day_forecast_and_survives_save_reload() {
    let mut d = Definition::builtin(modes::Mode::Story);
    d.rules.weather = Some(climate::Profile {
        season_days: 7,
        wet_rain_chance: 0,
        dry_rain_chance: 100,
        wet_evaporation: 0.7,
        dry_evaporation: 1.8,
        intro_days: 0,
    });
    let (mut g, _) =
        compile(d).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
    let v = g.app.world().resource::<Village>();
    for index in 0..28 {
        let forecast = climate::day(v, index);
        let wet = (index / 7) % 2 == 0;
        assert_eq!(forecast.rain_expected, !wet);
        assert_eq!(forecast.season_day, index % 7 + 1);
        assert_eq!(forecast.days_until_change, 7 - index % 7);
        assert_eq!(forecast.evaporation, if wet { 0.7 } else { 1.8 });
        let weather = climate::at(v, index as f32 * 1440. + forecast.rain_start + 15.);
        assert_eq!(weather.raining, !wet);
        assert_eq!(weather.evaporation, forecast.evaporation);
    }
    let saved = g.snapshot();
    let mut restored = Game::new();
    assert!(restored.restore(&saved));
    assert_eq!(restored.snapshot(), saved);
    assert_eq!(restored.weather_report(), g.weather_report());
}

#[test]
fn invalid_weather_is_rejected_without_installing_a_world() {
    let mut g = Game::new();
    let before = g.snapshot();
    for (key, value) in [
        ("season_days", 0_f64),
        ("season_days", 91.),
        ("wet_rain_chance", 101.),
        ("dry_rain_chance", 101.),
        ("wet_evaporation", 0.49),
        ("dry_evaporation", 2.01),
        ("intro_days", 15.),
    ] {
        let mut d = serde_json::to_value(Definition::builtin(modes::Mode::Story)).unwrap();
        d["rules"]["weather"] = serde_json::to_value(climate::Profile::default()).unwrap();
        d["rules"]["weather"][key] = if value.fract() == 0. {
            serde_json::json!(value as u32)
        } else {
            serde_json::json!(value)
        };
        let result = report(&g.load_scenario(&d.to_string()));
        assert_eq!(result["ok"], false);
        assert!(
            result["issues"]
                .as_array()
                .unwrap()
                .iter()
                .any(|i| i["code"] == "invalid_weather")
        );
        assert_eq!(g.snapshot(), before);
    }
}

#[test]
fn authored_residents_keep_identity_when_reordered_and_preserve_personal_details() {
    let mut d = Definition::builtin(modes::Mode::Sandbox);
    let people = d.start.residents.as_mut().unwrap();
    people[0].name = "João <vizinho>".into();
    people[0].pronouns = "ele/dele".into();
    people[0].biography = "Trouxe sementes e vontade de aprender.".into();
    people[0].routine_preferences = resident_preferences::NINA_V1;
    people.reverse();
    let (g, _) = compile(d).unwrap_or_else(|_| panic!("valid authored cast"));
    let person = g
        .app
        .world()
        .iter_entities()
        .find_map(|e| e.get::<Resident>().filter(|p| p.id == 0))
        .unwrap();
    assert_eq!(person.name, "João <vizinho>");
    assert_eq!(person.pronouns, "ele/dele");
    assert_eq!(person.biography, "Trouxe sementes e vontade de aprender.");
    assert_eq!(person.routine_preferences, resident_preferences::NINA_V1);
    let v = g.app.world().resource::<Village>();
    assert_eq!(v.scenario.as_ref().unwrap().residents["resident-iara"], 0);
}

#[test]
fn authored_resident_errors_do_not_silently_replace_the_cast() {
    let mut d = Definition::builtin(modes::Mode::Story);
    let people = d.start.residents.as_mut().unwrap();
    people[1].id = people[0].id.clone();
    people[2].preset_version = 999;
    people[3].name = " ".into();
    assert!(compile(d).is_err());
}

#[test]
fn authored_identity_bindings_survive_saves_and_reject_forged_ownership() {
    let d = Definition::builtin(modes::Mode::Sandbox);
    let (mut g, _) = compile(d).unwrap_or_else(|_| panic!("valid cast"));
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
    let mut forged: serde_json::Value = serde_json::from_str(&saved).unwrap();
    forged["village"]["scenario"]["residents"]["resident-iara"] = 1.into();
    assert!(!g.restore(&forged.to_string()));
    assert_eq!(g.snapshot(), saved);
    let mut old: serde_json::Value = serde_json::from_str(&saved).unwrap();
    old["village"]["version"] = 34.into();
    old["village"]["scenario"]["definition"]["start"]
        .as_object_mut()
        .unwrap()
        .remove("residents");
    old["village"]["scenario"]
        .as_object_mut()
        .unwrap()
        .remove("residents");
    for person in old["residents"].as_array_mut().unwrap() {
        person.as_object_mut().unwrap().remove("pronouns");
        person.as_object_mut().unwrap().remove("biography");
    }
    assert!(g.restore(&old.to_string()));
    let migrated: serde_json::Value = serde_json::from_str(&g.snapshot()).unwrap();
    assert_eq!(migrated["village"]["version"], SAVE_VERSION);
    assert_eq!(
        migrated["residents"][0]["routine_preferences"],
        old["residents"][0]["routine_preferences"]
    );
    assert_eq!(
        migrated["residents"][0]["energy"],
        old["residents"][0]["energy"]
    );
}

#[test]
fn authored_occupations_are_independent_of_founder_preset_and_can_be_absent() {
    let mut d = Definition::builtin(modes::Mode::Sandbox);
    let people = d.start.residents.as_mut().unwrap();
    people[0].occupation = Some(occupations::Profession::WaterTechnician);
    people[0].outside_shifts = true;
    people[1].occupation = Some(occupations::Profession::None);
    people.reverse();
    let (mut g, _) = compile(d.clone()).unwrap_or_else(|_| panic!("valid occupations"));
    let v = g.app.world().resource::<Village>();
    assert_eq!(occupations::job(v, 0).unwrap().income, 22000);
    assert!(v.economy.outside_jobs[&0]);
    assert!(occupations::job(v, 1).is_none());
    assert!(!g.set_resident_job(1, true));
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
    d.start
        .residents
        .as_mut()
        .unwrap()
        .iter_mut()
        .find(|p| p.preset == "bento")
        .unwrap()
        .outside_shifts = true;
    let error = compile(d).err().unwrap();
    assert!(
        error
            .issues
            .iter()
            .any(|i| i.code == "invalid_job_schedule")
    );
}

#[test]
fn starting_relationships_follow_authored_identity_not_cast_order_or_names() {
    let mut d = Definition::builtin(modes::Mode::Sandbox);
    let people = d.start.residents.as_mut().unwrap();
    people[0].name = "Sam".into();
    people[1].name = "Sam".into();
    people.reverse();
    d.start.relationships.push(relationships::Bond {
        from: "resident-iara".into(),
        to: "resident-bento".into(),
        memories: 8,
    });
    let (mut g, _) = compile(d.clone()).unwrap_or_else(|_| panic!("valid starting friendship"));
    let v = g.app.world().resource::<Village>();
    assert_eq!(crate::relationships::strength(&v.progress, 0, 1), 8);
    assert_eq!(crate::relationships::strength(&v.progress, 1, 0), 8);
    assert_eq!(crate::relationships::strength(&v.progress, 0, 2), 0);
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
    for (from, to, n) in [
        ("resident-bento", "resident-iara", 8),
        ("missing", "resident-iara", 1),
        ("resident-iara", "resident-iara", 1),
        ("resident-luz", "resident-nina", 101),
    ] {
        let mut invalid = d.clone();
        invalid.start.relationships.push(relationships::Bond {
            from: from.into(),
            to: to.into(),
            memories: n,
        });
        assert!(compile(invalid).is_err());
    }
}

#[test]
fn authored_personality_and_interests_are_independent_of_appearance_and_jobs() {
    let mut d = Definition::builtin(modes::Mode::Sandbox);
    let person = &mut d.start.residents.as_mut().unwrap()[0];
    person.personality = Some(personality::Profile {
        social_style: personality::SocialStyle::Reserved,
        work_interest: personality::Interest::Building,
    });
    d.start.residents.as_mut().unwrap().reverse();
    let (mut g, _) = compile(d).unwrap_or_else(|_| panic!("valid profile"));
    let mut q = g.app.world_mut().query::<&Resident>();
    let r = q.iter(g.app.world()).find(|r| r.id == 0).unwrap();
    assert_eq!(r.social_style, personality::SocialStyle::Reserved);
    assert_eq!(r.favorite, "build");
    assert_eq!(r.trait_name, "Reserved · builder");
    assert_eq!(r.energy, 88.);
    assert_eq!(r.routine_preferences, resident_preferences::IARA_V1);
    assert_eq!(
        occupations::job(g.app.world().resource::<Village>(), 0)
            .unwrap()
            .title,
        "Plant nursery assistant"
    );
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
}

#[test]
fn appearance_choices_can_repeat_without_retargeting_authored_residents() {
    let mut d = Definition::builtin(modes::Mode::Sandbox);
    for p in d.start.residents.as_mut().unwrap() {
        p.appearance = Some(resident_appearance::Look::from_preset(
            resident_appearance::Preset::Nina,
            1,
        ));
    }
    d.start.residents.as_mut().unwrap().reverse();
    let (mut g, _) = compile(d).unwrap_or_else(|_| panic!("supported independent looks"));
    let mut q = g.app.world_mut().query::<&Resident>();
    let people: Vec<_> = q.iter(g.app.world()).collect();
    assert!(people.iter().all(|p| p.appearance
        == resident_appearance::Look::from_preset(resident_appearance::Preset::Nina, 1)));
    let iara = people.iter().find(|p| p.id == 0).unwrap();
    assert_eq!(iara.name, "Iara");
    assert_eq!(iara.favorite, "garden");
    assert_eq!(iara.routine_preferences, resident_preferences::IARA_V1);
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
}

#[test]
fn road_rejections_explain_the_site_and_preserve_the_running_village() {
    let original = Definition::builtin(modes::Mode::Sandbox);
    let mut g = Game::new();
    let before = g.snapshot();
    for (cells, index, message) in [
        (vec![[0, 32]], 0, "map edge"),
        (vec![[61, 32]], 0, "riverbank"),
        (vec![[30, 29]], 0, "beside buildings"),
        (vec![[28, 30], [28, 30]], 1, "more than once"),
    ] {
        let mut d = original.clone();
        d.start.roads = cells.clone();
        let result = report(&g.load_scenario(&encoded(&d)));
        assert_eq!(result["ok"], false);
        let issue = &result["issues"][0];
        assert_eq!(issue["code"], "invalid_road");
        assert_eq!(issue["path"], format!("start.roads.{index}"));
        assert_eq!(issue["at"], serde_json::json!(cells[index]));
        assert!(issue["message"].as_str().unwrap().contains(message), "{issue}");
        assert_eq!(g.snapshot(), before);
    }
}
