use super::*;
fn scene() -> Game {
    let mut g = Game::new();
    g.start_fixture_mode("sandbox");
    assert!(g.configure_sandbox_rules(false, true, true));
    assert_eq!(g.place("garden", 5, 5), "ok");
    logistics::fixture_stock(&mut g.app.world_mut().resource_mut::<Village>(), COMPOST, 4);
    g
}
fn worker(g: &mut Game) -> Resident {
    let world = g.app.world_mut();
    world
        .query::<&Resident>()
        .iter(world)
        .next()
        .unwrap()
        .clone()
}
fn checkpoint(g: &mut Game) {
    let saved = g.snapshot();
    assert!(g.restore(&saved), "invalid restoration checkpoint: {saved}");
    assert_eq!(g.snapshot(), saved);
}
fn stage(g: &mut Game, id: Id) {
    organics::fixture_transfer(
        &mut g.app.world_mut().resource_mut::<Village>(),
        Owner::Restoration(id),
        COMPOST,
        2,
    );
}
#[test]
fn queued_jobs_reserve_available_compost_without_moving_or_spending_it() {
    let mut g = scene();
    let before = land::condition(g.app.world().resource::<Village>(), 2, 5, 5);
    assert_eq!(g.restore_plot(5, 5), "ok");
    assert_eq!(g.restore_plot(9, 5), "ok");
    let saved = g.snapshot();
    assert_ne!(g.restore_plot(13, 5), "ok");
    assert_eq!(g.snapshot(), saved);
    {
        let v = g.app.world().resource::<Village>();
        assert_eq!(v.progress.compost, 4);
        assert_eq!(economy::free(v, COMPOST), 0);
        assert_eq!(land::condition(v, 2, 5, 5), before);
        assert_eq!(organics::available(v, Owner::Camp, COMPOST), 4);
        assert!(v.restoration.iter().all(|j| !ready(v, j)));
    }
    checkpoint(&mut g);
}
#[test]
fn work_needs_delivery_and_actual_arrival_then_changes_soil_gradually_once() {
    let mut g = scene();
    let mut r = worker(&mut g);
    assert_eq!(g.restore_plot(5, 5), "ok");
    let id = g.app.world().resource::<Village>().restoration[0].id;
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(!assign_target(&mut r, &v, id));
        assert!(!work(&mut v, &r, 32.));
    }
    stage(&mut g, id);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(assign_target(&mut r, &v, id));
        assert!(!work(&mut v, &r, 16.));
        assert_eq!(v.progress.compost, 4);
        (r.x, r.y) = (r.target_x, r.target_y);
        assert!(!work(&mut v, &r, 16.));
        assert_eq!(v.progress.compost, 2);
        assert!((land::condition(&v, 2, 5, 5).nutrients - 1.125).abs() < 0.0001);
    }
    checkpoint(&mut g);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(work(&mut v, &r, 16.));
        assert!(!work(&mut v, &r, 32.));
        assert_eq!(v.progress.compost, 2);
        assert!((land::condition(&v, 2, 5, 5).nutrients - 1.25).abs() < 0.0001);
        assert_eq!(v.restoration[0].spent, Some([0, 2]));
    }
    checkpoint(&mut g);
}
#[test]
fn cancellation_preserves_delivered_goods_or_the_already_applied_partial_soil() {
    let mut g = scene();
    assert_eq!(g.restore_plot(5, 5), "ok");
    let id = g.app.world().resource::<Village>().restoration[0].id;
    stage(&mut g, id);
    assert_eq!(g.cancel_restoration(id.0), "ok");
    assert_ne!(g.cancel_restoration(id.0), "ok");
    assert_eq!(g.app.world().resource::<Village>().progress.compost, 4);
    checkpoint(&mut g);
    assert_eq!(g.restore_plot(5, 5), "ok");
    let id = g.app.world().resource::<Village>().restoration[1].id;
    stage(&mut g, id);
    let mut r = worker(&mut g);
    let soil = {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assign_target(&mut r, &v, id);
        (r.x, r.y) = (r.target_x, r.target_y);
        work(&mut v, &r, 8.);
        land::condition(&v, 2, 5, 5)
    };
    assert_eq!(g.cancel_restoration(id.0), "ok");
    assert_eq!(g.app.world().resource::<Village>().progress.compost, 2);
    assert_eq!(
        land::condition(g.app.world().resource::<Village>(), 2, 5, 5),
        soil
    );
    checkpoint(&mut g);
}
#[test]
fn soil_jobs_reserve_their_whole_grid_footprint_and_preview_is_read_only() {
    let mut g = scene();
    let before = g.snapshot();
    assert!(g.restoration_preview(9, 9).contains("\"allowed\":true"));
    assert_eq!(g.snapshot(), before);
    assert_eq!(g.restore_plot(9, 9), "ok");
    assert_ne!(g.restore_plot(8, 8), "ok");
    assert_ne!(g.toggle_road(9, 9), "ok");
    assert_ne!(g.place("home", 9, 9), "ok");
    assert_ne!(g.place_source(1, 9, 9), "ok");
    checkpoint(&mut g);
    let id = g.app.world().resource::<Village>().restoration[0].id;
    assert_eq!(g.cancel_restoration(id.0), "ok");
    assert_eq!(g.toggle_road(9, 9), "ok");
}
#[test]
fn changing_a_target_building_cancels_soil_work_without_erasing_the_soil() {
    let mut g = scene();
    assert_eq!(g.restore_plot(5, 5), "ok");
    let id = g.app.world().resource::<Village>().restoration[0].id;
    stage(&mut g, id);
    let mut r = worker(&mut g);
    let soil = {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assign_target(&mut r, &v, id);
        (r.x, r.y) = (r.target_x, r.target_y);
        work(&mut v, &r, 8.);
        land::condition(&v, 2, 5, 5)
    };
    assert_eq!(g.queue_building_work(0, "demolish", 0, 0), "ok");
    assert!(g.app.world().resource::<Village>().restoration[0].cancelled);
    assert_eq!(
        land::condition(g.app.world().resource::<Village>(), 2, 5, 5),
        soil
    );
    checkpoint(&mut g);
}
#[test]
fn plantation_enrichment_queues_real_work_and_clearing_cancels_its_order() {
    let mut g = scene();
    assert_eq!(g.place_source(0, 10, 5), "ok");
    let before = g.app.world().resource::<Village>().progress.compost;
    assert_eq!(g.restore_source(0), "ok");
    {
        let v = g.app.world().resource::<Village>();
        assert!(!v.economy.sources[0].restored);
        assert_eq!(v.progress.compost, before);
        assert_eq!(v.restoration[0].size, 3);
    }
    assert_eq!(g.clear_source(0), "ok");
    assert!(g.app.world().resource::<Village>().restoration[0].cancelled);
    checkpoint(&mut g);
}
#[test]
fn forged_work_or_claims_fail_without_changing_the_live_world() {
    let mut g = scene();
    assert_eq!(g.restore_plot(5, 5), "ok");
    let saved = g.snapshot();
    for (field, value) in [
        ("work", serde_json::json!(1)),
        ("size", serde_json::json!(3)),
        ("spent", serde_json::json!([0, 2])),
    ] {
        let mut bad: serde_json::Value = serde_json::from_str(&saved).unwrap();
        bad["village"]["restoration"][0][field] = value;
        assert!(!g.restore(&bad.to_string()), "accepted {field}");
        assert_eq!(g.snapshot(), saved);
    }
    let mut bad: serde_json::Value = serde_json::from_str(&saved).unwrap();
    bad["village"]["logistics"]["stores"]
        .as_array_mut()
        .unwrap()
        .retain(|p| p["owner"]["kind"] != "restoration");
    assert!(!g.restore(&bad.to_string()));
    assert_eq!(g.snapshot(), saved);
}

#[test]
fn a_ready_soil_order_has_a_real_walking_route_and_a_shared_work_offer() {
    let mut g = scene();
    g.app.world_mut().resource_mut::<Village>().minutes = 540.;
    assert_eq!(g.restore_plot(9, 9), "ok");
    let id = g.app.world().resource::<Village>().restoration[0].id;
    stage(&mut g, id);
    let mut r = worker(&mut g);
    let v = g.app.world().resource::<Village>();
    assert!(assign_target(&mut r, v, id));
    assert!(walking::quote(v, &r).is_ok());
    assert!(
        workforce::offers(v, &r)
            .iter()
            .any(|o| o.task == "restore" && o.blocker.is_none())
    );
}
