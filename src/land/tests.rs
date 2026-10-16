use super::*;
use crate::{building_work, economy, logistics};

#[test]
fn seeded_ground_is_repeatable_and_arrival_land_is_viable() {
    let mut g = Game::new();
    let v = g.app.world().resource::<Village>().clone();
    assert!(valid(&v));
    assert_eq!(v.economy.land, resource_sites::LAND);
    let original = g.snapshot();
    assert_eq!(g.land_report(), g.land_report());
    assert_eq!(
        g.snapshot(),
        original,
        "inspecting ground cannot change the village"
    );
    let mut changed = v.clone();
    changed.simulation.seed = 93421;
    assert!(initialise(&mut changed));
    assert_ne!(ground(&v, 20, 18), ground(&changed, 20, 18));
    assert_ne!(v.land.deposits[0].maximum, changed.land.deposits[0].maximum);
    for seed in 0..64 {
        changed.simulation.seed = seed;
        assert!(initialise(&mut changed));
        assert_eq!(ground(&changed, 6, 6).fertility, 0.72);
        assert_eq!(ground(&changed, 6, 6).retention, 1.);
        assert!(valid(&changed));
    }
}

#[test]
fn sites_on_one_patch_share_depletion_but_other_patches_survive() {
    let mut g = Game::new();
    for (x, y) in [(18, 18), (18, 21), (23, 23)] {
        assert_eq!(g.place_source(3, x, y), "ok");
    }
    let v = g.app.world().resource::<Village>();
    let patch = v.economy.sources[0].deposit.unwrap();
    assert_eq!(v.economy.sources[1].deposit, Some(patch));
    assert_ne!(v.economy.sources[2].deposit, Some(patch));
    let first = v.economy.sources[0].remaining;
    let other = v.economy.sources[2].remaining;
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        for _ in 0..first as u32 {
            extract(&mut v, patch, 1);
        }
        assert_eq!(v.economy.sources[0].remaining, 0.);
        assert_eq!(v.economy.sources[1].remaining, 0.);
        assert_eq!(v.economy.sources[2].remaining, other);
        assert_eq!(v.economy.land[1], 96. - first);
        assert!(valid(&v));
    }
    assert_eq!(g.clear_source(0), "ok");
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
    assert!(
        g.place_source(3, 18, 18)
            .contains("local deposit is exhausted")
    );
    assert_eq!(
        g.snapshot(),
        saved,
        "replacing an exhausted quarry cannot refill it"
    );
    assert_eq!(g.harvest_source(2), "ok");
}

#[test]
fn no_deposit_cannot_be_worked_even_when_property_has_reserves() {
    let mut g = Game::new();
    let saved = g.snapshot();
    assert!(g.place_source(4, 18, 10).contains("No matching deposit"));
    assert_eq!(g.snapshot(), saved);
    assert_eq!(g.place_source(4, 5, 10), "ok");
}

#[test]
fn construction_changes_soil_when_work_starts_and_removal_keeps_it() {
    let mut g = Game::new();
    let initial = ground(g.app.world().resource::<Village>(), 5, 5);
    assert_eq!(g.place("home", 5, 5), "ok");
    assert!(g.app.world().resource::<Village>().land.soil.is_empty());
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        let stage = economy::recipe("home", "standard").unwrap()[0].items;
        for (i, amount) in stage.into_iter().enumerate() {
            if amount > 0 {
                assert!(logistics::receive(
                    &mut v,
                    logistics::Owner::Site(0),
                    i,
                    amount
                ));
            }
        }
        economy::build(&mut v, 0, 1.);
        let after = ground(&v, 5, 5);
        assert!(after.disturbance > initial.disturbance);
        assert!(after.fertility < initial.fertility);
        let edits = v.land.soil.clone();
        economy::build(&mut v, 0, 1.);
        assert_eq!(
            v.land.soil, edits,
            "work ticks do not repeatedly disturb foundations"
        );
    }
    let soil = g.app.world().resource::<Village>().land.soil.clone();
    assert_eq!(g.queue_building_work(0, "demolish", 0, 0), "ok");
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(building_work::work(&mut v, 0, 1000.));
        assert!(v.buildings.is_empty());
        assert_eq!(v.land.soil, soil);
    }
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
}

#[test]
fn moving_only_disturbs_destination_when_rebuilding_is_attended() {
    let mut g = Game::new();
    g.start_mode("sandbox");
    assert!(g.configure_sandbox_rules(false, true, true));
    assert_eq!(g.place("home", 5, 5), "ok");
    assert_eq!(g.queue_building_work(0, "move", 18, 18), "ok");
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        let initial = ground(&v, 18, 18);
        assert!(building_work::work(&mut v, 0, 1000.));
        assert_eq!(
            ground(&v, 18, 18),
            initial,
            "packing is not work at the new site"
        );
        building_work::work(&mut v, 0, 1.);
        let after = ground(&v, 18, 18);
        assert!(after.disturbance > initial.disturbance);
        let soil = v.land.soil.clone();
        building_work::work(&mut v, 0, 1.);
        assert_eq!(v.land.soil, soil);
    }
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
}

#[test]
fn malformed_land_and_cross_system_identity_collisions_are_rejected_atomically() {
    let mut g = Game::new();
    assert_eq!(g.place_source(3, 18, 18), "ok");
    let saved = g.snapshot();
    for field in ["remaining", "maximum", "x", "material", "id"] {
        let mut bad: serde_json::Value = serde_json::from_str(&saved).unwrap();
        bad["village"]["land"]["deposits"][0][field] = 999999.into();
        assert!(!g.restore(&bad.to_string()), "reject {field}");
        assert_eq!(g.snapshot(), saved);
    }
    for mutation in 0..5 {
        let mut bad: serde_json::Value = serde_json::from_str(&saved).unwrap();
        match mutation {
            0 => bad["village"]["land"]["seed"] = 5.into(),
            1 => {
                bad["village"]["land"]["deposits"][0]["id"] =
                    bad["village"]["logistics"]["stores"][0]["id"].clone()
            }
            2 => bad["village"]["economy"]["sources"][0]["deposit"] = 1.into(),
            3 => {
                bad["village"]["land"]["soil"] =
                    serde_json::json!([{"x":5,"y":5,"cover":0.3,"nutrients":1.,"disturbance":1.1}])
            }
            _ => {
                bad["village"].as_object_mut().unwrap().remove("land");
            }
        }
        assert!(!g.restore(&bad.to_string()), "reject mutation {mutation}");
        assert_eq!(g.snapshot(), saved);
    }
}

#[test]
fn footprint_previews_use_every_cell_and_remain_read_only() {
    let mut g = Game::new();
    let saved = g.snapshot();
    let single: serde_json::Value = serde_json::from_str(&g.land_preview("road", 5, 5)).unwrap();
    let home: serde_json::Value = serde_json::from_str(&g.land_preview("home", 5, 5)).unwrap();
    assert_eq!(single["cells"], 1);
    assert_eq!(home["cells"], 4);
    assert_eq!(single["ground"]["fertility"], home["ground"]["fertility"]);
    let mean_shade=(4..=5).flat_map(|y|(4..=5).map(move |x|(x,y))).map(|(x,y)|serde_json::from_str::<serde_json::Value>(&g.land_preview("road",x,y)).unwrap()["ground"]["shade"].as_f64().unwrap()).sum::<f64>()/4.;
    assert!((home["ground"]["shade"].as_f64().unwrap() - mean_shade).abs() < 0.000001);
    let quarry: serde_json::Value =
        serde_json::from_str(&g.land_preview("source_stone", 18, 18)).unwrap();
    assert_eq!(quarry["deposit"]["material"], 3);
    assert_eq!(quarry["deposit"]["remaining"], quarry["deposit"]["maximum"]);
    assert_eq!(g.land_preview("unknown", 5, 5), "{}");
    assert_eq!(g.land_preview("home", i32::MAX, 5), "{}");
    assert_eq!(g.snapshot(), saved);
}
