use super::*;
fn scene(kinds: &[&str]) -> Game {
    let mut g = Game::new();
    g.start_mode("sandbox");
    for (i, kind) in kinds.iter().enumerate() {
        assert_eq!(g.place(kind, 5 + i as i32 * 5, 5), "ok");
    }
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.minutes = 540.;
        v.circular.banana_treatment = false;
    }
    g
}
fn checkpoint(g: &mut Game) {
    let saved = g.snapshot();
    {
        let v = g.app.world().resource::<Village>();
        assert!(processes::valid(v), "processes");
        assert!(logistics::valid(v, &[]), "logistics");
        assert!(economy::valid(v), "economy");
        assert!(sanitation::valid(v), "sanitation");
        assert!(power::valid(v), "power");
    }
    assert!(g.restore(&saved), "{saved}");
    assert_eq!(g.snapshot(), saved);
}
#[test]
fn remote_scraps_need_delivery_and_cancellation_returns_to_the_same_pantry_once() {
    let mut g = scene(&["biodigester"]);
    let id = {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.circular.waste = 2.;
        logistics::fixture_stock(&mut v, SCRAPS, 2);
        processes::advance(&mut v, 1.);
        assert!(v.processes.batches.is_empty());
        fixture_transfer(&mut v, Owner::Pantry(0), SCRAPS, 2);
        processes::advance(&mut v, 1.);
        assert_eq!(v.progress.scraps, 0);
        assert_eq!(processing(&v, SCRAPS), 2);
        let id = v.processes.batches[0].id;
        logistics::fixture_stock(&mut v, 0, 0);
        assert!(logistics::receive(&mut v, Owner::Pantry(0), 0, 58));
        assert!(
            !logistics::receive(&mut v, Owner::Pantry(0), 0, 1),
            "Sealed feed retains its return space"
        );
        id
    };
    checkpoint(&mut g);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(processes::cancel(&mut v, id));
        assert!(!processes::cancel(&mut v, id));
        assert_eq!(available(&v, Owner::Pantry(0), SCRAPS), 2);
        assert_eq!(v.progress.scraps, 2);
    }
    checkpoint(&mut g);
}
#[test]
fn compost_is_made_locally_and_remote_soil_cannot_consume_it() {
    let mut g = scene(&["compost", "garden"]);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        fixture(&mut v, SCRAPS, 2);
        assert!(turn(&mut v, 0));
        assert!(!turn(&mut v, 0));
        assert_eq!(available(&v, Owner::Pantry(0), COMPOST), 1);
        assert_eq!(available(&v, Owner::Site(1), COMPOST), 0);
        assert_eq!(v.progress.compost, 1);
        let b = &mut v.buildings[1];
        b.crop.planted = true;
        b.crop.growth = 180.;
        let mut r = Resident {
            id: 0,
            activity_building: Some(1),
            ..g_resident()
        };
        r.favorite = "build".into();
        ecology::tend(&mut v, &r);
        assert_eq!(v.progress.enriched_harvests, 0);
        assert_eq!(v.progress.compost, 1);
    }
    checkpoint(&mut g);
}
fn g_resident() -> Resident {
    let mut g = Game::new();
    let world = g.app.world_mut();
    world
        .query::<&Resident>()
        .iter(world)
        .next()
        .unwrap()
        .clone()
}
#[test]
fn curing_receives_a_local_pile_once_even_after_its_digester_is_gone() {
    let mut g = scene(&["biodigester"]);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.circular.waste = 2.;
        fixture(&mut v, SCRAPS, 2);
        processes::advance(&mut v, 1.);
        processes::advance(&mut v, 480.);
        assert!(
            v.processes
                .batches
                .iter()
                .any(|b| b.kind == processes::Kind::Curing && b.active())
        );
        v.buildings.clear();
        v.economy.projects.clear();
        logistics::sync(&mut v);
        processes::advance(&mut v, 1440.);
        assert_eq!(v.progress.compost, 2);
        let p = v
            .logistics
            .as_ref()
            .unwrap()
            .stores
            .iter()
            .find(|p| p.items[COMPOST] > 0)
            .unwrap();
        assert_eq!(p.owner, Owner::Ground);
        assert_eq!((p.x, p.y), (5., 5.));
        processes::advance(&mut v, 1440.);
        assert_eq!(v.progress.compost, 2);
    }
    checkpoint(&mut g);
}
#[test]
fn forged_organic_totals_and_old_playable_versions_are_rejected_atomically() {
    let mut g = scene(&["compost"]);
    let saved = g.snapshot();
    for key in ["compost", "scraps"] {
        let mut raw: serde_json::Value = serde_json::from_str(&saved).unwrap();
        raw["village"]["progress"][key] = 1.into();
        assert!(!g.restore(&raw.to_string()));
        assert_eq!(g.snapshot(), saved);
    }
    let mut raw: serde_json::Value = serde_json::from_str(&saved).unwrap();
    raw["village"]["version"] = 12.into();
    assert!(!g.restore(&raw.to_string()));
    assert_eq!(g.snapshot(), saved);
}
#[test]
fn scraps_cannot_be_bought_and_compost_has_a_real_purchase_price() {
    let mut g = scene(&[]);
    let mut b = [0; COUNT];
    b[SCRAPS] = 1;
    let saved = g.snapshot();
    assert!(
        g.order_supplies(&serde_json::to_string(&b).unwrap())
            .contains("scraps")
    );
    assert_eq!(g.snapshot(), saved);
    b[SCRAPS] = 0;
    b[COMPOST] = 1;
    assert_eq!(g.order_supplies(&serde_json::to_string(&b).unwrap()), "ok");
}

#[test]
fn sealed_feed_and_curing_keep_their_global_storage_room_until_output_is_received() {
    let mut g = scene(&["biodigester"]);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.circular.waste = 2.;
        fixture(&mut v, SCRAPS, 2);
        processes::advance(&mut v, 1.);
        let left = economy::capacity(&v) - economy::storage(&v);
        assert!(logistics::receive(&mut v, Owner::Camp, 0, left));
        assert_eq!(economy::storage(&v), economy::capacity(&v));
        v.minutes += 480.;
        processes::advance(&mut v, 480.);
        assert_eq!(economy::storage(&v), economy::capacity(&v));
        assert_eq!(v.progress.compost, 0);
        v.minutes += 1440.;
        processes::advance(&mut v, 1440.);
        assert_eq!(v.progress.compost, 2);
        assert_eq!(economy::storage(&v), economy::capacity(&v));
    }
    checkpoint(&mut g);
}
#[test]
fn a_sealed_digester_cannot_load_without_its_local_recovery_store() {
    let mut g = scene(&["biodigester"]);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.circular.waste = 2.;
        fixture(&mut v, SCRAPS, 2);
        processes::advance(&mut v, 1.);
    }
    let saved = g.snapshot();
    let mut bad: serde_json::Value = serde_json::from_str(&saved).unwrap();
    bad["village"]["logistics"]["stores"]
        .as_array_mut()
        .unwrap()
        .retain(|p| p["owner"]["kind"] != "pantry");
    assert!(!g.restore(&bad.to_string()));
    assert_eq!(g.snapshot(), saved);
}

#[test]
fn two_scraps_split_between_stores_can_reach_one_compost_station() {
    let mut g = scene(&["compost", "kitchen"]);
    let mut r = g_resident();
    r.x = CAMP.0;
    r.y = CAMP.1;
    r.target_x = r.x;
    r.target_y = r.y;
    r.requested = false;
    r.help = None;
    r.walking = walking::State::default();
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        logistics::fixture_stock(&mut v, SCRAPS, 2);
        fixture_transfer(&mut v, Owner::Pantry(1), SCRAPS, 1);
        for _ in 0..2400 {
            if available(&v, Owner::Pantry(0), SCRAPS) == 2 {
                break;
            }
            r.task = "haul".into();
            r.remaining = 100.;
            logistics::advance(&mut v, &mut r, &[], 0.25);
        }
        assert_eq!(
            available(&v, Owner::Pantry(0), SCRAPS),
            2,
            "Separate single portions must not be stranded by a minimum load size"
        );
        assert!(turn(&mut v, 0));
        assert_eq!(v.progress.compost, 1);
        assert_eq!(v.progress.scraps, 0);
    }
}

#[test]
fn a_queued_kitchen_pot_does_not_hide_an_independent_requested_harvest() {
    let mut g = scene(&["kitchen"]);
    assert_eq!(g.place_source(1, 10, 10), "ok");
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        logistics::fixture_stock(&mut v, economy::MEALS, 0);
        v.water = 40.;
        let source = &mut v.economy.sources[0];
        source.growth = 1.;
        source.remaining = source.maximum;
        food::fixture_stage(&mut v, 0);
        assert!(production::order_meals(&mut v, Some(0)).is_some());
    }
    assert_eq!(g.harvest_source(0), "ok");
    let v = g.app.world().resource::<Village>();
    assert!(production::jobs(v).any(|b| b.material == economy::MEALS));
    assert_eq!(economy::local_job(v), Some(("source".into(), 0)));
    assert!(
        workforce::offers(v, &g_resident())
            .iter()
            .any(|o| o.task == "source" && o.material == Some(0))
    );
}
