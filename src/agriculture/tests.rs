use super::*;
fn scene(kind: &str) -> Game {
    let mut g = Game::new();
    assert!(g.start_mode("sandbox"));
    assert_eq!(g.place(kind, 6, 6), "ok");
    let mut v = g.app.world_mut().resource_mut::<Village>();
    v.mode = modes::Mode::Story;
    v.progress.completed = [true; 4];
    v.progress.later_completed = [true; progression::LATER_CHAPTERS];
    logistics::fixture_stock(&mut v, FODDER, 0);
    logistics::fixture_stock(&mut v, economy::FOOD, 12);
    g
}
fn checkpoint(g: &mut Game) {
    let saved = g.snapshot();
    let mut copy = Game::new();
    assert!(copy.restore(&saved));
    assert_eq!(copy.snapshot(), saved);
}
fn accounts(v: &Village) {
    assert!(
        simulation::view(v)["materials"]
            .as_array()
            .unwrap()
            .iter()
            .all(|m| m["difference"] == 0.)
    );
}
fn advance(v: &mut Village, minutes: u32) {
    for _ in 0..minutes {
        v.minutes += 1.;
        agriculture::advance(v, 1.);
        freshness::advance(v);
    }
}
fn feed(v: &mut Village) {
    logistics::fixture_stock(v, FODDER, 8);
    organics::fixture_transfer(v, Owner::Pantry(0), FODDER, 8);
    water::fixture_at(v, water::Owner::Building(0), water::Class::Fresh, 6.);
}
#[test]
fn goats_require_locally_delivered_feed_and_fresh_drinking_water_and_real_collection() {
    let mut g = scene("goat_pasture");
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(!ready(&v, &v.buildings[0]));
        logistics::fixture_stock(&mut v, FODDER, 8);
        assert!(
            !ready(&v, &v.buildings[0]),
            "Feed in camp cannot feed distant goats"
        );
        organics::fixture_transfer(&mut v, Owner::Pantry(0), FODDER, 8);
        assert!(
            !ready(&v, &v.buildings[0]),
            "Drinking water must reach the trough"
        );
        water::fixture_at(&mut v, water::Owner::Building(0), water::Class::Fresh, 6.);
        let fresh = water::total(&v, water::Class::Fresh);
        assert!(tend(&mut v, 0));
        assert!(!tend(&mut v, 0));
        assert_eq!(economy::quantity(&v, FODDER), 6);
        assert_eq!(water::total(&v, water::Class::Fresh), fresh - 2.);
        advance(&mut v, 1440);
        assert_eq!(economy::quantity(&v, MILK), 0);
        assert_eq!(v.buildings[0].agriculture.pending, 4);
        // Daily care is independent of collection, and never duplicates the ready milk.
        assert!(tend(&mut v, 0));
        assert!(tend(&mut v, 0));
        assert!(!tend(&mut v, 0));
        assert_eq!(economy::quantity(&v, MILK), 4);
        assert_eq!(economy::quantity(&v, SCRAPS), 1);
        assert_eq!(v.progress.milk_collected, 4);
        assert_eq!(food::pantry(&v, 0).unwrap().items[MILK], 4);
        accounts(&v);
    }
    checkpoint(&mut g);
}
#[test]
fn full_milk_reserves_do_not_stop_daily_care_or_create_unlimited_milk() {
    let mut g = scene("goat_pasture");
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        feed(&mut v);
        logistics::fixture_stock(&mut v, MILK, 8);
        assert!(ready(&v, &v.buildings[0]));
        assert!(tend(&mut v, 0));
        advance(&mut v, 1440);
        assert_eq!(v.buildings[0].agriculture.pending, 0);
        assert_eq!(economy::quantity(&v, MILK), 8);
        assert!(tend(&mut v, 0));
        assert_eq!(economy::quantity(&v, FODDER), 4);
        assert!(v.buildings[0].agriculture.welfare >= 90.);
        assert!(!tend(&mut v, 0));
        accounts(&v);
    }
    checkpoint(&mut g);
}
#[test]
fn missing_feed_stops_milk_and_wellbeing_recovers_after_attended_care() {
    let mut g = scene("goat_pasture");
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        advance(&mut v, 2880);
        assert_eq!(v.buildings[0].agriculture.pending, 0);
        let welfare = v.buildings[0].agriculture.welfare;
        assert!(welfare < 40.);
        feed(&mut v);
        assert!(tend(&mut v, 0));
        assert!(v.buildings[0].agriculture.welfare > welfare);
        advance(&mut v, 1440);
        assert!((2..=4).contains(&v.buildings[0].agriculture.pending));
        accounts(&v);
    }
    checkpoint(&mut g);
}
#[test]
fn bees_require_flowers_and_inspection_and_pollinate_only_nearby_open_plots() {
    let mut g = scene("apiary");
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(tend(&mut v, 0));
        advance(&mut v, 1440);
        assert_eq!(v.buildings[0].agriculture.growth, 0.);
    }
    assert_eq!(g.place("orchard", 10, 6), "ok");
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        logistics::fixture_finish(&mut v, 1);
        assert_eq!(flowers(&v, &v.buildings[0]), 1);
        assert!(pollinated(&v, &v.buildings[1]));
        advance(&mut v, 1440);
        assert_eq!(v.buildings[0].agriculture.pending, 3);
        assert_eq!(economy::quantity(&v, HONEY), 0);
        assert!(tend(&mut v, 0));
        assert!(tend(&mut v, 0));
        assert_eq!(economy::quantity(&v, HONEY), 3);
        v.buildings[1].x = 20;
        logistics::sync(&mut v);
        water::sync(&mut v);
        assert_eq!(flowers(&v, &v.buildings[0]), 0);
        assert!(!pollinated(&v, &v.buildings[1]));
        accounts(&v);
    }
    checkpoint(&mut g);
}
#[test]
fn orchard_waits_for_moisture_and_keeps_its_trees_after_harvest() {
    let mut g = scene("orchard");
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.minutes = 1200.;
        advance(&mut v, 120);
        assert_eq!(v.buildings[0].agriculture.growth, 0.);
        for _ in 0..20 {
            land::water_plot(&mut v, 3, 6, 6, 1.);
            advance(&mut v, 720);
            if v.buildings[0].agriculture.pending > 0 {
                break;
            }
        }
        assert!(v.buildings[0].agriculture.fruiting);
        assert_eq!(v.buildings[0].agriculture.pending, 8);
        assert!(tend(&mut v, 0));
        assert!(v.buildings[0].agriculture.fruiting);
        assert_eq!(v.buildings[0].agriculture.growth, 0.);
        assert_eq!(v.progress.orchard_fruit, 8);
        let orchard = &v.buildings[0];
        assert_eq!(orchard.kind, "orchard");
        accounts(&v);
    }
    checkpoint(&mut g);
}
#[test]
fn rotating_after_beans_rebuilds_soil_without_duplicating_harvest_credit() {
    let mut g = scene("garden");
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        let before = land::condition(&v, 2, 6, 6);
        rotation(&mut v, 0, "beans");
        rotation(&mut v, 0, "maize");
        let after = land::condition(&v, 2, 6, 6);
        assert!(after.nutrients > before.nutrients);
        assert_eq!(v.progress.crop_rotations, 1);
        rotation(&mut v, 0, "maize");
        assert_eq!(v.progress.crop_rotations, 1);
        accounts(&v);
    }
    checkpoint(&mut g);
}
#[test]
fn forage_crops_produce_fodder_not_household_ingredients_and_hens_can_use_it() {
    let mut g = scene("garden");
    assert!(g.configure_crop(0, "fodder", true));
    let mut r = g
        .app
        .world_mut()
        .query::<&Resident>()
        .iter(g.app.world())
        .next()
        .unwrap()
        .clone();
    r.target_x = 6.75;
    r.target_y = 6.75;
    r.activity_building = Some(0);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        ecology::tend(&mut v, &r);
        v.buildings[0].crop.growth = 480.;
        let food = v.food;
        ecology::tend(&mut v, &r);
        assert_eq!(v.food, food);
        assert!(economy::quantity(&v, FODDER) >= 10);
        accounts(&v);
    }
    assert_eq!(g.place("coop", 12, 6), "ok");
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        logistics::fixture_finish(&mut v, 1);
        organics::fixture_transfer(&mut v, Owner::Pantry(1), FODDER, 2);
        let food = v.food;
        v.minutes = 601.;
        let fodder = economy::quantity(&v, FODDER);
        supplies::advance(&mut v, 1.);
        assert_eq!(v.food, food);
        assert_eq!(economy::quantity(&v, FODDER), fodder - 2);
        assert!(v.buildings[1].poultry.remaining > 0.);
        accounts(&v);
    }
    checkpoint(&mut g);
}
#[test]
fn produce_expiry_and_meal_claims_follow_the_actual_owned_product() {
    let mut g = scene("goat_pasture");
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        logistics::fixture_stock(&mut v, economy::FOOD, 0);
        logistics::fixture_stock(&mut v, MILK, 2);
        logistics::fixture_stock(&mut v, HONEY, 3);
        let p = v
            .logistics
            .as_ref()
            .unwrap()
            .stores
            .iter()
            .find(|p| p.items[MILK] > 0)
            .unwrap();
        assert_eq!(freshness::amount(&p.food_lots, MILK), 2);
        v.minutes += 2880.;
        freshness::advance(&mut v);
        assert_eq!(economy::quantity(&v, MILK), 0);
        assert_eq!(economy::quantity(&v, HONEY), 3);
        assert_eq!(v.freshness.expired[MILK], 2);
        accounts(&v);
    }
    checkpoint(&mut g);
}
#[test]
fn forged_farm_state_is_rejected_atomically_and_reading_outlooks_never_mutates_it() {
    let mut g = scene("apiary");
    let saved = g.snapshot();
    assert!(!g.agriculture_report().is_empty());
    assert_eq!(g.snapshot(), saved);
    for (field, value) in [
        ("pending", serde_json::json!(100)),
        ("cared_until", serde_json::json!(1000000)),
        ("growth", serde_json::json!(-1)),
        ("welfare", serde_json::json!(101)),
    ] {
        let mut bad: serde_json::Value = serde_json::from_str(&saved).unwrap();
        bad["village"]["buildings"][0]["agriculture"][field] = value;
        assert!(!g.restore(&bad.to_string()));
        assert_eq!(g.snapshot(), saved);
    }
}
#[test]
fn closed_sites_pause_growth_and_a_move_preserves_the_herd_and_harvest() {
    let mut g = scene("goat_pasture");
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        feed(&mut v);
        assert!(tend(&mut v, 0));
        advance(&mut v, 120);
    }
    assert_eq!(g.queue_building_work(0, "move", 18, 18), "ok");
    let before = g.app.world().resource::<Village>().buildings[0]
        .agriculture
        .growth;
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        advance(&mut v, 120);
        assert_eq!(v.buildings[0].agriculture.growth, before);
        assert!(!tend(&mut v, 0));
    }
    checkpoint(&mut g);
}

#[test]
fn pausing_milk_production_keeps_the_daily_feed_and_water_commitment() {
    let mut g = scene("goat_pasture");
    assert!(g.configure_agriculture(0, false));
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        feed(&mut v);
        assert!(tend(&mut v, 0));
        advance(&mut v, 1440);
        assert_eq!(v.buildings[0].agriculture.pending, 0);
        assert!(ready(&v, &v.buildings[0]));
        assert!(tend(&mut v, 0));
        assert_eq!(economy::quantity(&v, FODDER), 4);
        accounts(&v);
    }
    checkpoint(&mut g);
}

#[test]
fn an_empty_kitchen_receives_ingredients_before_optional_animal_feed_and_compost() {
    let mut g = scene("kitchen");
    assert_eq!(g.place("goat_pasture", 12, 6), "ok");
    let mut r = g
        .app
        .world_mut()
        .query::<&Resident>()
        .iter(g.app.world())
        .next()
        .unwrap()
        .clone();
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        logistics::fixture_finish(&mut v, 1);
        v.minutes = 600.;
        logistics::fixture_stock(&mut v, economy::MEALS, 0);
        logistics::fixture_stock(&mut v, economy::FOOD, 24);
        logistics::fixture_stock(&mut v, FODDER, 12);
        r.x = CAMP.0;
        r.y = CAMP.1;
        r.task = "haul".into();
        r.remaining = 100.;
        r.activity_building = None;
        navigation::refresh(&mut v);
        assert!(logistics::advance(&mut v, &mut r, &[], 0.25));
        let h = v
            .logistics
            .as_ref()
            .unwrap()
            .shipments
            .iter()
            .find(|h| h.resident == r.id)
            .unwrap();
        assert_eq!(h.material, economy::FOOD);
        let to = v
            .logistics
            .as_ref()
            .unwrap()
            .stores
            .iter()
            .find(|p| p.id == h.to)
            .unwrap();
        assert_eq!(to.owner, Owner::Pantry(0));
        accounts(&v);
    }
}
