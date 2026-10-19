use super::*;

fn scene() -> Game {
    let mut g = Game::new();
    g.start_mode("sandbox");
    for (kind, x, y) in [
        ("home", 5, 5),
        ("kitchen", 12, 5),
        ("wetland", 18, 5),
        ("eco_toilet", 5, 11),
        ("biodigester", 12, 11),
        ("banana_treatment", 18, 11),
    ] {
        assert_eq!(g.place(kind, x, y), "ok");
    }
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        replenish(&mut v);
        v.mode = modes::Mode::Story;
        v.arrived = true;
        v.minutes = 540.;
        v.economy.outside_jobs.fill(false);
        v.progress.completed.fill(true);
        v.progress.later_completed.fill(true);
        v.production.targets[economy::MEALS] = 0;
        logistics::fixture_stock(&mut v, economy::FOOD, 60);
        logistics::fixture_stock(&mut v, economy::MEALS, 12);
    }
    let world = g.app.world_mut();
    for mut r in world.query::<&mut Resident>().iter_mut(world) {
        r.task = "idle".into();
        r.trip = None;
        r.remaining = 0.;
        r.requested = false;
        r.hunger = 0.;
        r.energy = 90.;
        r.social = 90.;
        r.last_meal_slot = 0;
        r.activity_building = None;
        r.activity_material = None;
        r.activity_batch = None;
        r.activity_store = None;
        r.x = CAMP.0 + (r.id as f32 - 2.) * 1.25;
        r.y = CAMP.1;
        r.target_x = r.x;
        r.target_y = r.y;
        r.walking = walking::State::default();
    }
    g
}
fn check(g: &mut Game) {
    let v = g.app.world().resource::<Village>();
    for c in Class::ALL {
        let i = c.index();
        assert!(
            (v.water_supply.opening[i] + v.water_supply.received[i]
                - v.water_supply.consumed[i]
                - total(v, c)
                - processes::sealed_liquid(v, c))
            .abs()
                < 0.0001,
            "{c:?} liquid account"
        );
    }
    let raw = g.snapshot();
    let report = view(g.app.world().resource::<Village>());
    assert_eq!(g.snapshot(), raw, "Liquid inspection is read-only");
    for p in report["tanks"].as_array().unwrap() {
        for i in 0..LIQUIDS {
            let stored = p["water"][i].as_f64().unwrap();
            let incoming = p["incoming"][i].as_f64().unwrap();
            let processing = p["reserved_processing"][i].as_f64().unwrap();
            let capacity = p["capacity"][i].as_f64().unwrap();
            assert!(
                (p["room"][i].as_f64().unwrap()
                    - (capacity - stored - incoming - processing).max(0.))
                .abs()
                    < EPS
            );
        }
    }
    let mut h = Game::new();
    assert!(h.restore(&raw));
    assert_eq!(h.snapshot(), raw);
}
fn until(g: &mut Game, test: impl Fn(&Village) -> bool) {
    for _ in 0..6000 {
        if test(g.app.world().resource::<Village>()) {
            return;
        }
        g.tick(0.25);
    }
    panic!("Liquid service did not finish: {}", g.water_report());
}
#[test]
fn washing_leaves_greywater_only_at_its_producer_and_full_local_space_blocks_more() {
    let mut g = scene();
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        let owner = Owner::Building(0);
        let fresh = v.water;
        sanitation::household_at(&mut v, owner, 2.);
        assert!((local(&v, owner, Class::Greywater) - 1.4).abs() < 0.00001);
        assert_eq!(local(&v, Owner::Building(2), Class::Greywater), 0.);
        assert_eq!(v.water, fresh - 2.);
        fixture_liquid(&mut v, Class::Greywater, 24.);
        fixture_at(&mut v, owner, Class::Greywater, 24.);
        let before = v.water;
        sanitation::household_at(&mut v, owner, 1.);
        assert_eq!(v.water, before);
        assert!(
            sanitation::washing_blocker(&v, owner, 1.)
                .unwrap()
                .contains("greywater buffer is full")
        );
    }
    check(&mut g);
}
#[test]
fn distant_sewage_and_greywater_cannot_start_a_local_treatment_process() {
    let mut g = scene();
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        fixture_liquid(&mut v, Class::Greywater, 12.);
        fixture_at(&mut v, Owner::Building(0), Class::Greywater, 12.);
        fixture_liquid(&mut v, Class::Sewage, 4.);
        fixture_at(&mut v, Owner::Building(3), Class::Sewage, 4.);
        organics::fixture(&mut v, economy::SCRAPS, 2);
        v.minutes += 480.;
        processes::advance(&mut v, 480.);
        assert_eq!(processes::held(&v, processes::Kind::Filtration), 0);
        assert_eq!(processes::held(&v, processes::Kind::Digestion), 0);
        assert_eq!(v.circular.waste_treated, 0.);
        assert_eq!(v.circular.water_reused, 0.);
        assert_eq!(v.circular.biogas, 0.);
        assert_eq!(local(&v, Owner::Building(0), Class::Greywater), 12.);
        assert_eq!(local(&v, Owner::Building(3), Class::Sewage), 4.);
    }
    check(&mut g);
}
#[test]
fn a_closed_greywater_load_requires_collection_and_delivery_before_filtration() {
    let mut g = scene();
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        fixture_liquid(&mut v, Class::Greywater, 12.);
        fixture_at(&mut v, Owner::Building(0), Class::Greywater, 12.);
    }
    until(&mut g, |v| {
        v.water_supply.trips.iter().any(|h| {
            h.class == Class::Greywater
                && h.carrying
                && tank(v, h.to).unwrap().owner == Owner::Building(2)
        })
    });
    let raw = g.snapshot();
    check(&mut g);
    {
        let v = g.app.world().resource::<Village>();
        assert_eq!(local(v, Owner::Building(2), Class::Greywater), 0.);
        assert_eq!(processes::held(v, processes::Kind::Filtration), 0);
    }
    let mut interrupted = Game::new();
    assert!(interrupted.restore(&raw));
    let carrier = interrupted
        .app
        .world()
        .resource::<Village>()
        .water_supply
        .trips
        .iter()
        .find(|h| h.class == Class::Greywater && h.carrying)
        .unwrap()
        .clone();
    assert!(
        interrupted
            .request(carrier.resident, "rest", false)
            .contains("Happy")
    );
    {
        let v = interrupted.app.world().resource::<Village>();
        let recovered = tank(v, carrier.recovery).unwrap();
        assert_eq!(recovered.water[Class::Greywater.index()], carrier.amount);
        assert_eq!(recovered.owner, Owner::Ground);
    }
    check(&mut interrupted);
    until(&mut g, |v| {
        processes::held(v, processes::Kind::Filtration) == 1
    });
    check(&mut g);
}
#[test]
fn early_villages_can_hand_over_sealed_contents_at_the_neighbouring_service_point() {
    let mut g = scene();
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.circular.auto_feed = false;
        v.circular.banana_treatment = false;
        fixture_liquid(&mut v, Class::Sewage, 12.);
        fixture_at(&mut v, Owner::Building(3), Class::Sewage, 12.);
    }
    let world = g.app.world_mut();
    for mut r in world.query::<&mut Resident>().iter_mut(world) {
        r.last_sanitation_day = 0;
    }
    until(&mut g, |v| v.water_supply.external[3] >= 12.);
    {
        let v = g.app.world().resource::<Village>();
        assert_eq!(v.water_supply.external[3], 12.);
        assert_eq!(v.circular.biogas, 0.);
        assert_eq!(v.circular.waste_treated, 0.);
        assert_eq!(owner_tank(v, Owner::Service).unwrap().water, [0.; LIQUIDS]);
    }
    check(&mut g);
}
#[test]
fn sandbox_accounts_for_its_explicit_excess_disposal_without_blocking_play() {
    let mut g = scene();
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.mode = modes::Mode::Sandbox;
        fixture_liquid(&mut v, Class::Greywater, 24.);
        fixture_at(&mut v, Owner::Building(0), Class::Greywater, 24.);
        let before = v.water;
        sanitation::household_at(&mut v, Owner::Building(0), 1.);
        assert_eq!(v.water, before - 1.);
        assert!((v.water_supply.sandbox_disposed[2] - 0.7).abs() < 0.00001);
        assert_eq!(local(&v, Owner::Building(0), Class::Greywater), 24.);
    }
    check(&mut g);
}

#[test]
fn forged_liquid_classes_batch_sources_and_external_handoffs_are_rejected_atomically() {
    let mut g = scene();
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        fixture_liquid(&mut v, Class::Sewage, 2.);
        fixture_at(&mut v, Owner::Building(4), Class::Sewage, 2.);
        organics::fixture(&mut v, economy::SCRAPS, 2);
        processes::advance(&mut v, 0.);
    }
    check(&mut g);
    let raw = g.snapshot();
    let saved: serde_json::Value = serde_json::from_str(&raw).unwrap();
    let batch = saved["village"]["processes"]["batches"]
        .as_array()
        .unwrap()
        .iter()
        .position(|b| b["kind"] == "digestion")
        .unwrap();
    let house = owner_tank(g.app.world().resource::<Village>(), Owner::Building(0))
        .unwrap()
        .id
        .0;
    for case in 0..5 {
        let mut bad = saved.clone();
        match case {
            0 => bad["village"]["water_supply"]["opening"][3] = 3.into(),
            1 => bad["village"]["water_supply"]["external"][3] = 1.into(),
            2 => bad["village"]["processes"]["batches"][batch]["input_tank"] = house.into(),
            3 => {
                bad["village"]["processes"]["batches"][batch]["recovery"] =
                    bad["village"]["processes"]["batches"][batch]["input_tank"].clone()
            }
            _ => bad["village"]["version"] = 18.into(),
        }
        assert!(!g.restore(&bad.to_string()));
        assert_eq!(g.snapshot(), raw);
    }
}
