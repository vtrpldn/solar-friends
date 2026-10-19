use super::*;
use crate::{Resident, ecology, logistics, power};
fn garden() -> Game {
    let mut g = Game::new();
    g.start_mode("sandbox");
    assert_eq!(g.place("garden", 5, 5), "ok");
    g
}
#[test]
fn wetness_lives_in_the_ground_and_rain_does_not_enter_a_greenhouse() {
    let mut g = garden();
    assert_eq!(g.place("greenhouse", 9, 5), "ok");
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.minutes = 900.;
        for b in &mut v.buildings {
            b.crop.planted = true;
        }
        ecology::advance(&mut v, 60.);
        assert!((condition(&v, 2, 5, 5).moisture - 0.5).abs() < 0.0001);
        assert_eq!(condition(&v, 2, 9, 5).moisture, 0.);
        assert!((v.buildings[0].crop.moisture - 120.).abs() < 0.001);
        assert_eq!(v.buildings[1].crop.moisture, 0.);
        assert!(valid(&v));
        water_plot(&mut v, 2, 5, 5, 1.);
        v.buildings.clear();
        v.economy.projects.clear();
        logistics::sync(&mut v);
        v.minutes = 1080.;
        advance_fallow(&mut v, 60.);
        assert!(
            (condition(&v, 2, 5, 5).moisture - 0.75).abs() < 0.0001,
            "Clearing a garden preserves its water and normal drying"
        );
    }
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
}
#[test]
fn depleted_soil_grows_and_yields_less_and_attended_compost_improves_it() {
    let mut healthy = garden();
    let mut tired = garden();
    {
        let mut v = tired.app.world_mut().resource_mut::<Village>();
        for s in &mut v.land.soil {
            s.nutrients = 0.4;
        }
    }
    for g in [&mut healthy, &mut tired] {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.buildings[0].crop.planted = true;
        water_plot(&mut v, 2, 5, 5, 1.);
        ecology::advance(&mut v, 60.);
    }
    assert!(
        healthy.app.world().resource::<Village>().buildings[0]
            .crop
            .growth
            > tired.app.world().resource::<Village>().buildings[0]
                .crop
                .growth
    );
    let mut q = tired.app.world_mut().query::<&Resident>();
    let mut resident = q
        .iter(tired.app.world())
        .find(|r| r.favorite != "garden")
        .unwrap()
        .clone();
    resident.target_x = 5.75;
    resident.target_y = 5.75;
    let mut outputs = vec![];
    for g in [&mut healthy, &mut tired] {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.buildings[0].crop.growth = 180.;
        let before = v.food;
        ecology::tend(&mut v, &resident);
        outputs.push(v.food - before);
    }
    assert!(
        outputs[0] > outputs[1],
        "Same crop and worker yield less on depleted ground"
    );
    {
        let mut v = tired.app.world_mut().resource_mut::<Village>();
        let before = condition(&v, 2, 5, 5);
        crate::organics::fixture(&mut v, crate::economy::COMPOST, 1);
        v.buildings[0].crop.planted = true;
        v.buildings[0].crop.growth = 180.;
        sync_moisture(&mut v);
        ecology::tend(&mut v, &resident);
        assert_eq!(v.progress.compost, 0);
        assert_eq!(v.progress.enriched_harvests, 1);
        let after = condition(&v, 2, 5, 5);
        assert!(after.nutrients > before.nutrients);
        assert!(after.fertility > before.fertility);
        assert!(after.disturbance < before.disturbance);
        assert!(valid(&v));
    }
    let saved = tired.snapshot();
    assert!(tired.restore(&saved));
    assert_eq!(tired.snapshot(), saved);
}
#[test]
fn tree_shade_saves_water_but_heavy_shade_reduces_crop_growth() {
    let mut open = garden();
    let mut shaded = garden();
    // Move the paired garden away from arrival so two neighbouring groves fit.
    for g in [&mut open, &mut shaded] {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.buildings[0].x = 18;
        v.buildings[0].y = 18;
    }
    assert_eq!(shaded.place("grove", 15, 18), "ok");
    assert_eq!(shaded.place("grove", 18, 15), "ok");
    for g in [&mut open, &mut shaded] {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.buildings[0].crop.planted = true;
        water_plot(&mut v, 2, 18, 18, 1.);
        ecology::advance(&mut v, 60.);
    }
    let a = open.app.world().resource::<Village>();
    let b = shaded.app.world().resource::<Village>();
    assert!(condition(b, 2, 18, 18).shade > 0.4);
    assert!(b.buildings[0].crop.moisture > a.buildings[0].crop.moisture);
    assert!(b.buildings[0].crop.growth < a.buildings[0].crop.growth);
}
#[test]
fn visible_tree_canopies_reduce_solar_output_and_cutting_reduces_shade() {
    let mut g = Game::new();
    g.start_mode("sandbox");
    assert_eq!(g.place("solar_farm", 18, 18), "ok");
    g.app.world_mut().resource_mut::<Village>().minutes = 720.;
    let before = power::supply(g.app.world().resource::<Village>()).solar_generation;
    assert_eq!(g.place("grove", 15, 15), "ok");
    let after = power::supply(g.app.world().resource::<Village>()).solar_generation;
    assert!(after < before);
    assert!(after > 0.);
    let mut h = Game::new();
    assert_eq!(h.place_source(0, 5, 5), "ok");
    {
        let mut v = h.app.world_mut().resource_mut::<Village>();
        v.economy.sources[0].growth = 1.;
        v.economy.sources[0].remaining = 32.;
        let before = ground(&v, 6, 6).shade;
        crate::resource_sites::harvested(&mut v, 0, 8);
        assert!(ground(&v, 6, 6).shade < before);
        assert!(ground(&v, 6, 6).shade > 0.);
    }
    assert_eq!(h.clear_source(0), "ok");
    assert_eq!(ground(h.app.world().resource::<Village>(), 6, 6).shade, 0.);
}
#[test]
fn moisture_edits_and_forged_crop_summaries_fail_without_changing_the_world() {
    let mut g = garden();
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.buildings[0].crop.planted = true;
        water_plot(&mut v, 2, 5, 5, 0.5);
    }
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    for change in 0..4 {
        let mut bad: serde_json::Value = serde_json::from_str(&saved).unwrap();
        match change {
            0 => bad["village"]["land"]["water"] = serde_json::json!([]),
            1 => bad["village"]["land"]["water"][27] = 1.into(),
            2 => bad["village"]["land"]["water"][145] = 2.into(),
            _ => bad["village"]["buildings"][0]["crop"]["moisture"] = 119.into(),
        }
        assert!(!g.restore(&bad.to_string()));
        assert_eq!(g.snapshot(), saved);
    }
    assert!(!g.restore(&saved.replace("\"version\":14", "\"version\":11")));
}

#[test]
fn fixture_bootstrap_rejects_invalid_water_instead_of_clamping_it() {
    let g = garden();
    let mut v = g.app.world().resource::<Village>().clone();
    v.buildings[0].crop.planted = true;
    v.buildings[0].crop.moisture = 241.;
    assert!(!initialise(&mut v));
}

#[test]
fn crop_outlook_matches_actual_harvest_and_next_planting_without_mutation() {
    let mut g = garden();
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.buildings[0].crop.planted = true;
        v.buildings[0].crop.growth = 180.;
    }
    let saved = g.snapshot();
    let outlook: serde_json::Value = serde_json::from_str(&g.crop_outlook(0)).unwrap();
    assert_eq!(g.snapshot(), saved);
    assert_eq!(g.crop_outlook(999), "{}");
    let mut q = g.app.world_mut().query::<&Resident>();
    let mut r = q
        .iter(g.app.world())
        .find(|r| r.favorite != "garden")
        .unwrap()
        .clone();
    r.target_x = 5.75;
    r.target_y = 5.75;
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        let before = v.food;
        ecology::tend(&mut v, &r);
        assert_eq!(
            v.food - before,
            outlook["harvest_min"].as_f64().unwrap() as f32
        );
    }
    assert!(g.configure_crop(0, "beans", true));
    let saved = g.snapshot();
    let outlook: serde_json::Value = serde_json::from_str(&g.crop_outlook(0)).unwrap();
    assert_eq!(outlook["crop"], "beans");
    assert_eq!(outlook["harvest_min"], 10);
    assert_eq!(g.snapshot(), saved);
}

#[test]
fn legal_border_gardens_have_four_ground_cells_and_save_all_their_water() {
    let mut g = Game::new();
    g.start_mode("sandbox");
    assert_eq!(g.place("garden", 1, 1), "ok");
    let preview: serde_json::Value = serde_json::from_str(&g.land_preview("garden", 1, 1)).unwrap();
    assert_eq!(preview["cells"], 4);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert_eq!(v.land.soil.len(), 4);
        v.buildings[0].crop.planted = true;
        water_plot(&mut v, 2, 1, 1, 1.);
        for i in [0, 1, 28, 29] {
            assert_eq!(v.land.water[i], 1.);
        }
        assert!(valid(&v));
        ecology::advance(&mut v, 60.);
        for i in [0, 1, 28, 29] {
            assert!(v.land.water[i] > 0.5);
            assert!(v.land.water[i] < 1.);
        }
    }
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
}
#[test]
fn grove_canopy_stays_during_packing_and_returns_only_after_rebuilding() {
    let mut g = Game::new();
    g.start_mode("sandbox");
    assert_eq!(g.place("grove", 15, 15), "ok");
    let before = ground(g.app.world().resource::<Village>(), 16, 16).shade;
    assert_eq!(g.queue_building_work(0, "move", 5, 5), "ok");
    assert_eq!(
        ground(g.app.world().resource::<Village>(), 16, 16).shade,
        before
    );
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(crate::building_work::work(&mut v, 0, 1000.));
        assert_eq!(ground(&v, 16, 16).shade, 0.);
        assert_eq!(ground(&v, 6, 6).shade, 0.);
        assert!(crate::building_work::work(&mut v, 0, 1000.));
        assert!(ground(&v, 6, 6).shade > 0.);
    }
    assert_eq!(g.queue_building_work(0, "demolish", 0, 0), "ok");
    assert!(ground(g.app.world().resource::<Village>(), 6, 6).shade > 0.);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(crate::building_work::work(&mut v, 0, 1000.));
        assert_eq!(ground(&v, 6, 6).shade, 0.);
    }
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
}
