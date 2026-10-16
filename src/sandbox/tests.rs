use super::*;
fn game() -> Game {
    let mut g = Game::new();
    assert!(g.start_fixture_mode("sandbox"));
    g
}
fn state(g: &mut Game) -> Save {
    serde_json::from_str(&g.snapshot()).unwrap()
}
fn valid_save(g: &mut Game) {
    let saved = g.snapshot();
    let mut copy = Game::new();
    assert!(copy.restore(&saved));
    assert_eq!(copy.snapshot(), saved);
}
#[test]
fn story_keeps_all_rules_and_cannot_change_them() {
    let mut g = Game::new();
    let before = g.snapshot();
    assert!(!g.configure_sandbox_rules(false, false, false));
    assert_eq!(before, g.snapshot());
    let v = &state(&mut g).village;
    assert!(logistics(v) && land(v) && utilities(v));
    let report = g.sandbox_rules_report();
    assert_eq!(report, g.sandbox_rules_report());
    assert_eq!(before, g.snapshot());
}
#[test]
fn free_defaults_and_constrained_construction_use_the_same_real_work() {
    let mut g = game();
    assert_eq!(state(&mut g).village.sandbox_rules, Rules::default());
    assert_eq!(g.place("home", 5, 5), "ok");
    assert_eq!(state(&mut g).village.buildings[0].progress, 100.);
    assert!(g.configure_sandbox_rules(true, false, false));
    assert_eq!(g.place("garden", 13, 10), "ok");
    assert_eq!(state(&mut g).village.buildings[1].progress, 0.);
    let mut hauled = false;
    for _ in 0..3840 {
        g.tick(0.25);
        let s = state(&mut g);
        hauled |= s.residents.iter().any(|r| r.task == "haul");
        if s.village.buildings[1].progress >= 100. {
            break;
        }
    }
    assert!(
        hauled,
        "Residents must actually bring the new project's supplies"
    );
    assert_eq!(state(&mut g).village.buildings[1].progress, 100.);
    valid_save(&mut g);
    assert!(
        serde_json::from_str::<serde_json::Value>(&g.simulation_report()).unwrap()["materials"]
            .as_array()
            .unwrap()
            .iter()
            .all(|m| m["difference"] == 0.)
    );
}
#[test]
fn switching_off_does_not_finish_or_cancel_existing_construction() {
    let mut g = game();
    assert!(g.configure_sandbox_rules(true, false, false));
    assert_eq!(g.place("home", 5, 5), "ok");
    assert_eq!(g.configure_project(0, 3, true, "standard"), "ok");
    let before = state(&mut g).village;
    assert!(g.configure_sandbox_rules(false, false, false));
    let after = state(&mut g).village;
    assert_eq!(before.buildings[0].progress, after.buildings[0].progress);
    assert_eq!(
        serde_json::to_string(&before.economy.projects).unwrap(),
        serde_json::to_string(&after.economy.projects).unwrap()
    );
    assert_eq!(g.place("garden", 13, 10), "ok");
    assert_eq!(state(&mut g).village.buildings[1].progress, 100.);
    valid_save(&mut g);
}
#[test]
fn enabling_supplies_uses_preserved_food_dates_instead_of_refreshing_stock() {
    let mut g = game();
    let before = state(&mut g);
    let end = before
        .village
        .logistics
        .as_ref()
        .unwrap()
        .stores
        .iter()
        .flat_map(|p| &p.food_lots)
        .map(|l| l.expires)
        .fold(0., f32::max);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.minutes = end + 1.;
    }
    assert!(state(&mut g).village.food > 0.);
    valid_save(&mut g);
    assert!(g.configure_sandbox_rules(true, false, false));
    let after = state(&mut g).village;
    assert_eq!(after.food, 0.);
    assert!(after.freshness.expired[economy::FOOD] > 0);
    valid_save(&mut g);
}
#[test]
fn land_history_survives_neutral_growth_and_non_depleting_extraction() {
    let mut g = game();
    assert_eq!(g.place_source(2, 4, 4), "ok");
    let mut v = g.app.world().resource::<Village>().clone();
    let deposit = v.economy.sources[0].deposit.unwrap();
    let old = serde_json::to_string(&v.land).unwrap();
    land::extract(&mut v, deposit, 4);
    assert_eq!(old, serde_json::to_string(&v.land).unwrap());
    v.sandbox_rules.land = true;
    let before = v.economy.sources[0].remaining;
    land::extract(&mut v, deposit, 4);
    assert_eq!(v.economy.sources[0].remaining, before - 4.);
    land::extract(&mut v, deposit, (before - 4.) as u32);
    assert_eq!(v.economy.sources[0].remaining, 0.);
    v.sandbox_rules.land = false;
    assert!(resource_sites::available(&v, 0) > 0.);
    land::extract(&mut v, deposit, 4);
    assert_eq!(v.economy.sources[0].remaining, 0.);
    g.app.insert_resource(v);
    valid_save(&mut g);
}
#[test]
fn dry_growth_can_be_relaxed_without_rewatering_the_saved_ground() {
    let mut g = game();
    assert_eq!(g.place("garden", 5, 5), "ok");
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.buildings[0].crop.planted = true;
        let water = v.land.water.clone();
        let soil = serde_json::to_string(&v.land.soil).unwrap();
        ecology::advance(&mut v, 60.);
        assert_eq!(v.buildings[0].crop.growth, 60.);
        assert!(
            !ecology::needs_tending(&v, &v.buildings[0], 10.),
            "Neutral growth must not create pointless irrigation chores"
        );
        assert_eq!(v.land.water, water);
        assert_eq!(serde_json::to_string(&v.land.soil).unwrap(), soil);
        v.sandbox_rules.land = true;
        ecology::advance(&mut v, 60.);
        assert_eq!(v.buildings[0].crop.growth, 60.);
    }
    valid_save(&mut g);
}
#[test]
fn free_power_is_explicit_and_never_creates_owned_battery_charge() {
    let mut g = game();
    assert_eq!(g.place("streetlight", 10, 5), "ok");
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.minutes = 1260.;
        power::advance(&mut v, 60.);
        power::finish_frame(&mut v, 60.);
        assert!(v.sandbox_rules.supplied_energy > 0.);
        assert_eq!(v.power.stored, 0.);
        assert_eq!(power::supply(&v).connections[0].light_level, 1.);
        assert_eq!(v.power.network.account.consumed, 0.);
    }
    let before = g.snapshot();
    let report = g.electricity_report();
    assert_eq!(report, g.electricity_report());
    assert_eq!(before, g.snapshot());
    assert!(g.configure_sandbox_rules(false, false, true));
    assert_eq!(
        power::supply(g.app.world().resource::<Village>()).connections[0].light_level,
        0.
    );
    assert_eq!(g.place("solar_farm", 5, 5), "ok");
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        power::fixtures::connect(
            &mut v,
            electricity::Owner::Building(1),
            electricity::Owner::Building(0),
        );
        power::fixtures::charge(&mut v, 10.);
    }
    assert!(g.configure_sandbox_rules(false, false, false));
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        let supplied = v.sandbox_rules.supplied_energy;
        power::advance(&mut v, 60.);
        power::finish_frame(&mut v, 60.);
        assert_eq!(v.power.stored, 10.);
        assert!(v.sandbox_rules.supplied_energy > supplied);
    }
    valid_save(&mut g);
}
#[test]
fn water_and_pantry_options_are_independent() {
    let mut g = game();
    assert!(g.configure_sandbox_rules(true, false, true));
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        let all = water::local(&v, water::Owner::Camp, water::Class::Fresh);
        water::draw(&mut v, water::Owner::Camp, water::Class::Fresh, all);
        modes::replenish(&mut v);
        assert_eq!(v.water, 0.);
    }
    assert!(g.configure_sandbox_rules(true, false, false));
    assert!(state(&mut g).village.water > 0.);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        let all = water::local(&v, water::Owner::Camp, water::Class::Fresh);
        water::draw(&mut v, water::Owner::Camp, water::Class::Fresh, all);
        logistics::fixture_stock(&mut v, economy::FOOD, 0);
    }
    assert!(g.configure_sandbox_rules(false, false, true));
    let v = state(&mut g).village;
    assert_eq!(v.water, 0.);
    assert!(v.food >= 80.);
    valid_save(&mut g);
}
#[test]
fn options_keep_paid_orders_and_other_optional_systems_unchanged() {
    let mut g = game();
    g.set_supplier_variation(true);
    g.set_seasons_enabled(true);
    g.set_resident_learning(true);
    let mut basket = [0u32; economy::COUNT];
    basket[0] = 1;
    assert_eq!(
        g.order_supplies(&serde_json::to_string(&basket).unwrap()),
        "ok"
    );
    let old = state(&mut g).village;
    assert!(g.configure_sandbox_rules(true, true, true));
    let new = state(&mut g).village;
    assert_eq!(
        serde_json::to_string(&new.economy.orders).unwrap(),
        serde_json::to_string(&old.economy.orders).unwrap()
    );
    assert_eq!(new.market.enabled, old.market.enabled);
    assert_eq!(new.market.used, old.market.used);
    assert_eq!(new.climate.enabled, old.climate.enabled);
    assert_eq!(new.skills.enabled, old.skills.enabled);
    assert_eq!(new.maintenance.enabled, old.maintenance.enabled);
    valid_save(&mut g);
}
#[test]
fn every_rule_combination_has_exact_saved_continuation() {
    for mask in 0..8 {
        let mut g = game();
        assert!(g.configure_sandbox_rules(mask & 1 != 0, mask & 2 != 0, mask & 4 != 0));
        assert_eq!(g.place("garden", 5, 5), "ok");
        let saved = g.snapshot();
        let mut copy = Game::new();
        assert!(copy.restore(&saved));
        assert_eq!(copy.snapshot(), saved);
        for _ in 0..40 {
            g.tick(0.25);
            copy.tick(0.25);
        }
        assert_eq!(g.snapshot(), copy.snapshot());
    }
}
#[test]
fn old_sandbox_saves_keep_their_existing_soil_and_utility_rules() {
    let mut g = game();
    let mut raw: serde_json::Value = serde_json::from_str(&g.snapshot()).unwrap();
    raw["village"]["version"] = 25.into();
    raw["village"]
        .as_object_mut()
        .unwrap()
        .remove("sandbox_rules");
    assert!(g.restore(&raw.to_string()));
    let v = state(&mut g).village;
    assert!(!logistics(&v) && land(&v) && utilities(&v));
    assert_eq!(v.version, SAVE_VERSION);
    valid_save(&mut g);
    let before = g.snapshot();
    for bad in [
        serde_json::json!(-1),
        serde_json::json!(1e10),
        serde_json::json!("unknown"),
    ] {
        let mut invalid: serde_json::Value = serde_json::from_str(&before).unwrap();
        invalid["village"]["sandbox_rules"]["supplied_energy"] = bad;
        assert!(!g.restore(&invalid.to_string()));
        assert_eq!(g.snapshot(), before);
    }
}
