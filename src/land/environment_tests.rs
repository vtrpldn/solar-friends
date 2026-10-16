use super::*;
use crate::{building_work, economy, logistics, power};
fn edge_tree(g: &mut Game) -> (u32, i32, i32) {
    for seed in 0..64 {
        assert!(g.set_simulation_seed(seed));
        if let Some(t) = g
            .app
            .world()
            .resource::<Village>()
            .land
            .vegetation
            .iter()
            .find(|t| {
                let (x, y) = ((t.x + 0.5).floor() as i32, (t.y + 0.5).floor() as i32);
                (1..27).contains(&x) && (1..27).contains(&y) && !river_bank(x, y)
            })
        {
            return (
                t.index,
                (t.x + 0.5).floor() as i32,
                (t.y + 0.5).floor() as i32,
            );
        }
    }
    panic!("Seeded forest must expose a legal edge clearing");
}
fn checkpoint(g: &mut Game) {
    let s = g.snapshot();
    assert!(!s.contains("natural_light"));
    assert!(g.restore(&s));
    assert_eq!(g.snapshot(), s);
}
#[test]
fn perimeter_trees_and_cached_shade_are_seeded_and_queries_leave_them_unchanged() {
    let mut g = Game::new();
    let first = g.snapshot();
    let v = g.app.world().resource::<Village>();
    assert!(!v.land.vegetation.is_empty());
    assert_eq!(v.land.vegetation, vegetation::generate(v.land.seed));
    assert_ne!(
        v.land.vegetation,
        vegetation::generate(v.land.seed.wrapping_add(1))
    );
    let mut uncached = v.clone();
    uncached.land.natural_light.clear();
    for y in 0..28 {
        for x in 0..28 {
            assert_eq!(ground(v, x, y), ground(&uncached, x, y));
        }
    }
    assert_eq!(g.land_report(), g.land_report());
    assert_eq!(g.snapshot(), first);
    checkpoint(&mut g);
}
#[test]
fn roads_clear_only_their_actual_trunks_and_removal_keeps_the_soil_and_clearing() {
    let mut g = Game::new();
    let (index, x, y) = edge_tree(&mut g);
    let before = ground(g.app.world().resource::<Village>(), x, y);
    assert_eq!(g.toggle_road(x, y), "ok");
    let v = g.app.world().resource::<Village>();
    assert!(
        v.land
            .vegetation
            .iter()
            .find(|t| t.index == index)
            .unwrap()
            .cleared
    );
    assert!(ground(v, x, y).disturbance > before.disturbance);
    assert!(ground(v, x, y).cover < before.cover);
    let soil = v.land.soil.clone();
    let trees = v.land.vegetation.clone();
    assert_eq!(g.toggle_road(x, y), "ok");
    let v = g.app.world().resource::<Village>();
    assert_eq!(v.land.soil, soil);
    assert_eq!(v.land.vegetation, trees);
    assert!(valid(v));
    checkpoint(&mut g);
}
#[test]
fn a_blueprint_keeps_natural_trees_until_foundation_work_actually_starts() {
    let mut g = Game::new();
    let (index, x, y) = edge_tree(&mut g);
    assert_eq!(g.place("home", x, y), "ok");
    assert!(
        !g.app
            .world()
            .resource::<Village>()
            .land
            .vegetation
            .iter()
            .find(|t| t.index == index)
            .unwrap()
            .cleared
    );
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        let stage = economy::recipe("home", "standard").unwrap()[0].items;
        for (i, n) in stage.into_iter().enumerate() {
            if n > 0 {
                assert!(logistics::receive(&mut v, logistics::Owner::Site(0), i, n));
            }
        }
        economy::build(&mut v, 0, 1.);
        assert!(
            v.land
                .vegetation
                .iter()
                .find(|t| t.index == index)
                .unwrap()
                .cleared
        );
    }
    checkpoint(&mut g);
}
#[test]
fn banana_canopies_shade_solar_even_while_treatment_is_paused_and_move_with_the_bed() {
    let mut g = Game::new();
    g.start_fixture_mode("sandbox");
    assert!(g.configure_sandbox_rules(false, true, true));
    assert_eq!(g.place("solar_farm", 18, 18), "ok");
    g.app.world_mut().resource_mut::<Village>().minutes = 720.;
    let before = power::supply(g.app.world().resource::<Village>()).solar_generation;
    assert_eq!(g.place("banana_treatment", 15, 16), "ok");
    let shaded = power::supply(g.app.world().resource::<Village>()).solar_generation;
    assert!(shaded < before);
    g.configure_banana_treatment(false);
    assert_eq!(
        power::supply(g.app.world().resource::<Village>()).solar_generation,
        shaded
    );
    assert_eq!(g.queue_building_work(1, "move", 5, 16), "ok");
    assert_eq!(
        power::supply(g.app.world().resource::<Village>()).solar_generation,
        shaded
    );
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(building_work::work(&mut v, 1, 1000.));
        assert!(v.building_jobs[0].stage == building_work::Stage::Rebuild);
        assert_eq!(power::supply(&v).solar_generation, before);
    }
    checkpoint(&mut g);
}
#[test]
fn extraction_changes_the_worked_soil_and_clearing_a_site_keeps_its_history() {
    let mut g = Game::new();
    assert_eq!(g.place_source(3, 18, 18), "ok");
    let before = g.app.world().resource::<Village>().land.soil.clone();
    assert_eq!(g.harvest_source(0), "ok");
    assert_eq!(g.app.world().resource::<Village>().land.soil, before);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(economy::finish_job(&mut v, "source", 0));
        assert!((ground(&v, 18, 18).disturbance - 0.04).abs() < 0.00001);
    }
    let soil = g.app.world().resource::<Village>().land.soil.clone();
    assert_eq!(g.clear_source(0), "ok");
    assert_eq!(g.app.world().resource::<Village>().land.soil, soil);
    checkpoint(&mut g);
}
#[test]
fn restoration_recovers_road_soil_without_recreating_cleared_trees_or_deposits() {
    let mut g = Game::new();
    let (_, x, y) = edge_tree(&mut g);
    assert_eq!(g.toggle_road(x, y), "ok");
    assert_eq!(g.toggle_road(x, y), "ok");
    let mut v = g.app.world_mut().resource_mut::<Village>();
    let trees = v.land.vegetation.clone();
    let deposits = v.land.deposits.clone();
    let before = ground(&v, x, y);
    restore_soil(&mut v, 2, x, y, 1.);
    let after = ground(&v, x, y);
    assert!(after.nutrients > before.nutrients);
    assert!(after.disturbance < before.disturbance);
    assert!(after.cover > before.cover);
    assert_eq!(v.land.vegetation, trees);
    assert_eq!(v.land.deposits, deposits);
}
#[test]
fn forged_forest_geometry_or_unrecorded_clearing_cannot_change_a_village() {
    let mut g = Game::new();
    let saved = g.snapshot();
    for (field, value) in [
        ("x", serde_json::json!(12.)),
        ("species", serde_json::json!(9)),
        ("cleared", serde_json::json!(true)),
    ] {
        let mut bad: serde_json::Value = serde_json::from_str(&saved).unwrap();
        bad["village"]["land"]["vegetation"][0][field] = value;
        assert!(!g.restore(&bad.to_string()), "accepted forged {field}");
        assert_eq!(g.snapshot(), saved);
    }
}
