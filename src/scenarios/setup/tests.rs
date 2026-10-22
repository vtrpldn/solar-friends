use super::*;
fn definition(population: usize) -> Definition {
    let mut d = Definition::builtin(modes::Mode::Sandbox);
    d.rules.logistics = true;
    d.rules.utilities = true;
    let presets = super::super::residents::founders();
    d.start.residents = Some(
        (0..population)
            .map(|i| {
                let mut p = presets[i % presets.len()].clone();
                p.id = format!("friend-{i}");
                p.name = format!("Friend {i}");
                p
            })
            .collect(),
    );
    d.start.inventories.clear();
    d.start.fresh_water = 0.;
    d
}
fn compiled(d: Definition) -> (Game, Report) {
    compile(d).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()))
}
fn building(d: &mut Definition, id: &str, kind: &str, x: i32, y: i32) {
    let mut b = d.start.buildings[0].clone();
    b.id = id.into();
    b.kind = kind.into();
    b.x = x;
    b.y = y;
    d.start.buildings.push(b);
}
fn stock(d: &mut Definition, values: &[(&str, u32)]) {
    d.start.inventories = vec![Inventory {
        owner: InventoryOwner::Camp,
        items: values.iter().map(|(k, n)| (k.to_string(), *n)).collect(),
        food_lots: vec![],
    }];
}
#[test]
fn one_five_and_twelve_friends_scale_beds_meal_rounds_and_native_water_targets() {
    for count in [1, 5, 12] {
        let mut d = definition(count);
        stock(&mut d, &[("food", 5), ("eggs", 50)]);
        let (mut g, r) = compiled(d);
        let v = g.app.world().resource::<Village>();
        let s = summarize(v);
        assert_eq!(s.population, count);
        assert_eq!(s.beds, 0);
        assert_eq!(s.unhoused, count);
        assert_eq!(s.edible_portions, 5);
        assert_eq!(s.shared_meal_portions, count);
        assert_eq!(
            s.fresh_refill_target,
            (count as f64 * 8.).min(water::CAMP_CAPACITIES[0])
        );
        assert_eq!(r.issues.iter().any(|i| i.code == "opening_food"), count > 5);
        assert!(r.ok);
        let before = g.snapshot();
        let api: serde_json::Value = serde_json::from_str(&g.scenario_setup_report()).unwrap();
        assert_eq!(api["opening"], true);
        assert_eq!(g.snapshot(), before);
        assert!(g.restore(&before));
        assert_eq!(g.snapshot(), before);
    }
}
#[test]
fn real_homes_replace_camp_targets_but_projects_and_sheds_never_count_as_beds() {
    let mut d = definition(5);
    building(&mut d, "one-home", "home", 25, 25);
    building(&mut d, "future-home", "home", 25, 29);
    d.start.buildings.last_mut().unwrap().state = BuildingState::Blueprint;
    let (g, r) = compiled(d.clone());
    let s = summarize(g.app.world().resource::<Village>());
    assert_eq!(s.beds, 3);
    assert_eq!(s.unhoused, 2);
    assert_eq!(s.fresh_refill_target, 24.);
    assert!(
        r.issues
            .iter()
            .any(|i| i.code == "overnight_beds" && i.message.contains("2 will stay elsewhere"))
    );
    d.start.buildings.last_mut().unwrap().state = BuildingState::Completed;
    let (g, r) = compiled(d);
    assert_eq!(
        summarize(g.app.world().resource::<Village>()).fresh_refill_target,
        16.
    );
    assert!(!r.issues.iter().any(|i| i.code == "overnight_beds"));
}
#[test]
fn relaxed_rule_notes_replace_finite_resource_warnings_and_disabled_modes_are_distinguished() {
    let mut d = definition(12);
    d.rules.logistics = false;
    d.rules.utilities = false;
    let (mut game, r) = compiled(d.clone());
    let before = game.snapshot();
    let api: serde_json::Value = serde_json::from_str(&game.scenario_setup_report()).unwrap();
    assert!(api["access"].get("food").is_none());
    assert!(api["access"].get("fresh_water").is_none());
    assert!(api["access"].get("toilets").is_none());
    assert!(api["access"].get("housed_residents").is_some());
    assert_eq!(game.snapshot(), before);
    assert!(
        r.issues
            .iter()
            .any(|i| i.code == "automatic_starting_supplies"
                && matches!(i.severity, Severity::Information))
    );
    assert!(
        r.issues
            .iter()
            .any(|i| i.code == "automatic_starting_water")
    );
    assert!(!r.issues.iter().any(|i| matches!(
        i.code.as_str(),
        "opening_food" | "opening_water_reserve" | "no_rain_cistern"
    )));
    d.rules.mode = modes::Mode::Story;
    d.start.residents = None;
    let (_, r) = compiled(d);
    assert!(r.issues.iter().any(|i| i.code == "opening_food"));
    assert!(
        !r.issues
            .iter()
            .any(|i| i.code == "automatic_starting_supplies")
    );
}
#[test]
fn ready_planting_and_eggs_are_not_edible_stock_and_dated_food_can_expire_before_the_next_hour() {
    let mut d = definition(5);
    building(&mut d, "harvest", "garden", 25, 25);
    d.start.buildings.last_mut().unwrap().crop = Some(super::super::farming::StartingCrop {
        crop: "lettuce".into(),
        stage: super::super::farming::Stage::Mature,
        next_crop: "lettuce".into(),
        replant: true,
        soil_wetness: 0.5,
    });
    stock(&mut d, &[("eggs", 20)]);
    let (_, r) = compiled(d.clone());
    assert!(r.issues.iter().any(|i| i.code == "opening_food"));
    stock(&mut d, &[("food", 5)]);
    let life = freshness::lifetime(economy::FOOD).unwrap();
    d.start.inventories[0].food_lots = vec![StartingFood {
        material: "food".into(),
        amount: 5,
        age_minutes: life - 30.,
    }];
    let (g, r) = compiled(d.clone());
    assert_eq!(
        summarize(g.app.world().resource::<Village>()).edible_expiring_hour,
        5
    );
    assert!(r.issues.iter().any(|i| i.code == "opening_food_age"));
    d.rules.logistics = false;
    d.rules.mode = modes::Mode::Story;
    d.start.residents = None;
    let (g, r) = compiled(d);
    assert_eq!(
        summarize(g.app.world().resource::<Village>()).edible_expiring_hour,
        0
    );
    assert!(!r.issues.iter().any(|i| i.code == "opening_food_age"));
}
#[test]
fn animal_guidance_distinguishes_empty_stocked_and_already_cared_for_starts() {
    let mut d = definition(5);
    building(&mut d, "goats", "goat_pasture", 25, 25);
    building(&mut d, "hens", "coop", 25, 30);
    building(&mut d, "bees", "apiary", 20, 25);
    let (g, r) = compiled(d.clone());
    let s = summarize(g.app.world().resource::<Village>());
    assert_eq!(s.goat_fodder_needed, 2);
    assert_eq!(s.hen_fodder_needed, 2);
    for code in [
        "goat_opening_feed",
        "hen_opening_feed",
        "opening_bee_forage",
    ] {
        assert!(
            r.issues
                .iter()
                .any(|i| i.code == code && i.entity.is_some() && i.at.is_some())
        );
    }
    stock(&mut d, &[("fodder", 4)]);
    let (_, r) = compiled(d.clone());
    assert!(
        !r.issues
            .iter()
            .any(|i| i.code == "goat_opening_feed" || i.code == "hen_opening_feed")
    );
    let mut cared = d.clone();
    cared.start.inventories.clear();
    for b in cared
        .start
        .buildings
        .iter_mut()
        .filter(|b| ["goat_pasture", "coop"].contains(&b.kind.as_str()))
    {
        b.animals = Some(super::super::animals::StartingAnimals {
            stocked: true,
            stocking_requested: false,
            enabled: true,
            care_remaining: if b.kind == "coop" { 720. } else { 1440. },
            welfare: 70.,
            ready: false,
        });
    }
    let (g, r) = compiled(cared);
    let s = summarize(g.app.world().resource::<Village>());
    assert_eq!((s.goat_groups_due, s.hen_groups_due), (0, 0));
    assert!(
        !r.issues
            .iter()
            .any(|i| i.code == "goat_opening_feed" || i.code == "hen_opening_feed")
    );
    for b in d
        .start
        .buildings
        .iter_mut()
        .filter(|b| ["goat_pasture", "coop", "apiary"].contains(&b.kind.as_str()))
    {
        b.animals = Some(super::super::animals::StartingAnimals {
            stocked: false,
            stocking_requested: false,
            enabled: true,
            care_remaining: 0.,
            welfare: 70.,
            ready: false,
        });
    }
    let (g, r) = compiled(d);
    let s = summarize(g.app.world().resource::<Village>());
    assert_eq!(s.goat_groups_due, 0);
    assert_eq!(s.hen_groups_due, 0);
    assert!(!r.issues.iter().any(|i| matches!(
        i.code.as_str(),
        "goat_opening_feed" | "hen_opening_feed" | "opening_bee_forage"
    )));
}
#[test]
fn several_coops_compete_with_goats_and_keep_the_native_raw_food_threshold_between_cycles() {
    let mut d = definition(5);
    building(&mut d, "goats", "goat_pasture", 25, 25);
    building(&mut d, "hens-a", "coop", 25, 30);
    building(&mut d, "hens-b", "coop", 22, 30);
    stock(&mut d, &[("fodder", 2), ("food", 9)]);
    let (g, r) = compiled(d.clone());
    let s = summarize(g.app.world().resource::<Village>());
    assert_eq!(s.hen_raw_food_target, 12);
    assert!(r.issues.iter().any(|i| i.code == "hen_opening_feed"));
    stock(&mut d, &[("fodder", 2), ("food", 12)]);
    let (_, r) = compiled(d);
    assert!(!r.issues.iter().any(|i| i.code == "hen_opening_feed"));
}
#[test]
fn full_material_storage_warns_without_invalidating_an_intentional_challenge() {
    let mut d = definition(5);
    let store = d
        .start
        .buildings
        .iter()
        .find(|b| b.kind == "warehouse")
        .unwrap()
        .id
        .clone();
    stock(&mut d, &[("stone", 600)]);
    d.start.inventories.push(Inventory {
        owner: InventoryOwner::Building(store),
        items: [("timber".into(), 300)].into_iter().collect(),
        food_lots: vec![],
    });
    let (g, r) = compiled(d);
    let s = summarize(g.app.world().resource::<Village>());
    assert_eq!((s.storage_used, s.storage_capacity), (900, 900));
    assert!(r.ok);
    assert!(
        r.issues
            .iter()
            .any(|i| i.code == "opening_storage_full" && matches!(i.severity, Severity::Warning))
    );
}

#[test]
fn opening_access_uses_real_routes_and_keeps_challenges_playable() {
    let mut d = definition(5);
    d.map.nature = Some(Vec::new());
    d.map.deposits = Some(Vec::new());
    d.map.river = Some(world::River {
        schema: 1,
        centers: vec![20.; MAP_SIZE as usize],
    });
    building(&mut d, "isolated-cistern", "well", 10, 10);
    let (mut game, report) = compiled(d.clone());
    let issue = report
        .issues
        .iter()
        .find(|i| {
            i.code == "opening_building_access" && i.entity.as_deref() == Some("isolated-cistern")
        })
        .expect("Disconnected cistern must be located in the review");
    assert_eq!(issue.at, Some([10, 10]));
    assert!(
        issue
            .message
            .starts_with("Cistern has no reachable work approach")
    );
    assert!(report.ok);
    let before = game.snapshot();
    assert!(game.restore(&before));
    assert_eq!(game.snapshot(), before);
    d.map.river = None;
    let (_, connected) = compiled(d);
    assert!(
        !connected
            .issues
            .iter()
            .any(|i| i.code == "opening_building_access"
                && i.entity.as_deref() == Some("isolated-cistern"))
    );
}

#[test]
fn long_opening_routes_use_the_closest_actual_starting_resident() {
    let mut d = definition(5);
    d.map.river = None;
    building(&mut d, "distant-cistern", "well", 3, 3);
    let (_, far) = compiled(d.clone());
    assert!(
        far.issues
            .iter()
            .any(|i| i.code == "opening_building_travel"
                && i.entity.as_deref() == Some("distant-cistern"))
    );
    d.start.resident_setup.push(super::super::arrival::Setup {
        resident: "friend-4".into(),
        position: Some([6., 6.]),
        needs: None,
    });
    let (_, near) = compiled(d);
    assert!(!near.issues.iter().any(|i| matches!(
        i.code.as_str(),
        "opening_building_travel" | "opening_building_access"
    ) && i.entity.as_deref() == Some("distant-cistern")));
}

#[test]
fn opening_service_review_distinguishes_owned_unreachable_and_partial_reserves() {
    let mut d = definition(5);
    d.map.nature = Some(Vec::new());
    d.map.deposits = Some(Vec::new());
    d.map.river = Some(world::River {
        schema: 1,
        centers: vec![20.; MAP_SIZE as usize],
    });
    building(&mut d, "isolated-store", "warehouse", 10, 10);
    building(&mut d, "isolated-water", "well", 10, 15);
    d.start.inventories = vec![Inventory {
        owner: InventoryOwner::Building("isolated-store".into()),
        items: [("food".into(), 10)].into(),
        food_lots: vec![],
    }];
    d.start.liquids = Some(vec![StartingLiquids {
        owner: InventoryOwner::Building("isolated-water".into()),
        contents: [("fresh".into(), 3.5)].into(),
    }]);
    d.start.fresh_water = 3.5;
    let (mut game, report) = compiled(d.clone());
    assert!(
        report
            .issues
            .iter()
            .any(|i| i.code == "opening_food_access")
    );
    assert!(
        report
            .issues
            .iter()
            .any(|i| i.code == "opening_water_access")
    );
    let before = game.snapshot();
    let reading: serde_json::Value = serde_json::from_str(&game.scenario_setup_report()).unwrap();
    assert_eq!(reading["summary"]["edible_portions"], 10);
    assert_eq!(reading["summary"]["fresh_water"], 3.5);
    for kind in ["food", "fresh_water"] {
        assert_eq!(reading["access"][kind]["value"], 0.);
        assert_eq!(reading["access"][kind]["accessible"], false);
    }
    assert_eq!(game.snapshot(), before);
    d.start.inventories.push(Inventory {
        owner: InventoryOwner::Camp,
        items: [("food".into(), 2)].into(),
        food_lots: vec![],
    });
    d.start.liquids.as_mut().unwrap().push(StartingLiquids {
        owner: InventoryOwner::Camp,
        contents: [("fresh".into(), 2.)].into(),
    });
    d.start.fresh_water = 5.5;
    let (mut partial, report) = compiled(d.clone());
    assert!(
        report
            .issues
            .iter()
            .any(|i| i.code == "opening_water_access" && i.message.contains("2.0 of 5.5"))
    );
    let reading: serde_json::Value =
        serde_json::from_str(&partial.scenario_setup_report()).unwrap();
    for kind in ["food", "fresh_water"] {
        assert_eq!(reading["access"][kind]["value"], 2.);
        assert_eq!(reading["access"][kind]["accessible"], true);
    }
    d.map.river = None;
    let (mut connected, report) = compiled(d);
    assert!(!report.issues.iter().any(|i| matches!(
        i.code.as_str(),
        "opening_food_access" | "opening_water_access"
    )));
    let reading: serde_json::Value =
        serde_json::from_str(&connected.scenario_setup_report()).unwrap();
    assert_eq!(reading["access"]["food"]["value"], 12.);
    assert_eq!(reading["access"]["fresh_water"]["value"], 5.5);
}

#[test]
fn housing_and_toilet_review_use_assigned_routes_and_local_buffers() {
    let mut d = definition(5);
    d.map.nature = Some(Vec::new());
    d.map.deposits = Some(Vec::new());
    d.map.river = Some(world::River {
        schema: 1,
        centers: vec![20.; MAP_SIZE as usize],
    });
    building(&mut d, "isolated-home", "home", 10, 10);
    building(&mut d, "reachable-home", "home", 25, 25);
    building(&mut d, "our-toilet", "eco_toilet", 25, 30);
    let (mut game, report) = compiled(d.clone());
    assert!(report.issues.iter().any(
        |i| i.code == "opening_housing_access" && i.entity.as_deref() == Some("isolated-home")
    ));
    assert!(
        report
            .issues
            .iter()
            .any(|i| i.code == "opening_toilet_supplies"
                && i.entity.as_deref() == Some("our-toilet")
                && i.message.contains("fresh water"))
    );
    let before = game.snapshot();
    let reading: serde_json::Value = serde_json::from_str(&game.scenario_setup_report()).unwrap();
    assert_eq!(reading["summary"]["beds"], 6);
    assert_eq!(reading["summary"]["unhoused"], 0);
    assert_eq!(reading["summary"]["ecological_toilets"], 1);
    assert_eq!(reading["access"]["housed_residents"]["value"], 2.);
    assert_eq!(reading["access"]["toilets"]["value"], 0.);
    assert_eq!(game.snapshot(), before);
    d.start.fresh_water = 4.;
    d.start.liquids = Some(vec![StartingLiquids {
        owner: InventoryOwner::Building("our-toilet".into()),
        contents: [("fresh".into(), 4.)].into(),
    }]);
    for blocked in [None, Some("greywater"), Some("sewage")] {
        let mut test = d.clone();
        if let Some(class) = blocked {
            test.start.liquids.as_mut().unwrap()[0]
                .contents
                .insert(class.into(), 16.);
        }
        let (mut g, report) = compiled(test);
        let reading: serde_json::Value = serde_json::from_str(&g.scenario_setup_report()).unwrap();
        assert_eq!(
            reading["access"]["toilets"]["value"],
            if blocked.is_some() { 0. } else { 1. }
        );
        assert_eq!(
            report
                .issues
                .iter()
                .any(|i| i.code == "opening_toilet_supplies"),
            blocked.is_some()
        );
    }
    d.map.river = None;
    let (mut connected, report) = compiled(d);
    assert!(
        !report
            .issues
            .iter()
            .any(|i| i.code == "opening_housing_access")
    );
    let reading: serde_json::Value =
        serde_json::from_str(&connected.scenario_setup_report()).unwrap();
    assert_eq!(reading["access"]["housed_residents"]["value"], 5.);
    assert_eq!(reading["access"]["toilets"]["value"], 1.);
}
