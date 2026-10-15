use super::*;
fn scene(kinds: &[&str]) -> Game {
    let mut g = Game::new();
    g.start_mode("sandbox");
    for (i, kind) in kinds.iter().enumerate() {
        assert_eq!(g.place(kind, 5 + i as i32 * 5, 5), "ok");
    }
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.mode = modes::Mode::Story;
        v.arrived = true;
        v.minutes = 540.;
        v.progress.completed = [true; 4];
        v.progress.later_completed = [true; 9];
        v.circular.banana_treatment = false;
        freshness::fixture_reseed(&mut v);
    }
    g
}
fn step(v: &mut Village, minutes: f32) {
    v.minutes += minutes;
    advance(v, minutes);
    freshness::advance(v);
}
fn checkpoint(g: &mut Game) {
    let saved = g.snapshot();
    assert!(g.restore(&saved), "invalid passive checkpoint: {saved}");
    assert_eq!(g.snapshot(), saved);
}
fn owned(v: &Village, building: usize) -> &Batch {
    v.processes
        .batches
        .iter()
        .find(|b| b.building == Some(building) && b.active())
        .unwrap()
}
#[test]
fn independent_digesters_keep_their_own_progress_and_pause_without_a_worker() {
    let mut g = scene(&["biodigester", "biodigester"]);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.circular.waste = 4.;
        v.progress.scraps = 4;
        step(&mut v, 1.);
        assert_eq!(held_gas(&v), 8.);
        assert_ne!(owned(&v, 0).id, owned(&v, 1).id);
        step(&mut v, 120.);
        assert_eq!(owned(&v, 0).remaining, 360.);
        assert_eq!(owned(&v, 1).remaining, 360.);
    }
    assert_eq!(g.set_process_paused(0, true), "ok");
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        step(&mut v, 120.);
        assert_eq!(owned(&v, 0).remaining, 360.);
        assert_eq!(owned(&v, 0).phase, Phase::Paused);
        assert_eq!(owned(&v, 1).remaining, 240.);
        assert_eq!(v.circular.waste, 0.);
    }
    checkpoint(&mut g);
}
#[test]
fn output_capacity_is_reserved_across_competing_filters_and_inputs_are_not_overbooked() {
    let mut g = scene(&["wetland", "wetland", "wetland"]);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.circular.greywater = 36.;
        v.circular.reclaimed = 44.;
        let fresh = v.water;
        step(&mut v, 1.);
        assert_eq!(held(&v, Kind::Filtration), 2);
        assert_eq!(v.circular.greywater, 12.);
        assert_eq!(held_irrigation(&v), 16.);
        step(&mut v, 360.);
        assert_eq!(v.circular.reclaimed, 60.);
        assert_eq!(v.circular.water_reused, 16.);
        assert_eq!(v.circular.greywater, 12.);
        assert_eq!(v.water, fresh);
        step(&mut v, 1.);
        assert_eq!(held(&v, Kind::Filtration), 0);
        assert_eq!(v.circular.greywater, 12.);
    }
    checkpoint(&mut g);
}
#[test]
fn cancelling_returns_sealed_inputs_once_and_protects_room_for_their_return() {
    let mut g = scene(&["biodigester", "wetland"]);
    let (gas, water) = {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.circular.waste = 2.;
        v.progress.scraps = 2;
        v.circular.greywater = 12.;
        step(&mut v, 1.);
        let ids = (owned(&v, 0).id, owned(&v, 1).id);
        v.circular.waste = 78.;
        v.circular.greywater = 108.;
        sanitation::household_water(&mut v, 1.);
        assert_eq!(v.circular.greywater, 108.);
        ids
    };
    assert_eq!(g.cancel_passive_batch(gas.0), "ok");
    assert_eq!(g.cancel_passive_batch(water.0), "ok");
    assert_ne!(g.cancel_passive_batch(gas.0), "ok");
    {
        let v = g.app.world().resource::<Village>();
        assert_eq!(v.circular.waste, 80.);
        assert_eq!(v.progress.scraps, 2);
        assert_eq!(v.circular.greywater, 120.);
        assert_eq!(v.circular.biogas, 0.);
        assert_eq!(v.circular.reclaimed, 0.);
        assert!(v.processes.paused.contains(&0) && v.processes.paused.contains(&1));
    }
    checkpoint(&mut g);
}
#[test]
fn moving_keeps_the_same_sealed_batch_and_demolition_returns_unprocessed_inputs() {
    let mut g = scene(&["biodigester"]);
    let id = {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.circular.waste = 2.;
        v.progress.scraps = 2;
        step(&mut v, 1.);
        owned(&v, 0).id
    };
    assert_eq!(g.queue_building_work(0, "move", 5, 11), "ok");
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        step(&mut v, 120.);
        assert_eq!(owned(&v, 0).remaining, 480.);
        assert_eq!(owned(&v, 0).phase, Phase::Paused);
        assert!(building_work::work(&mut v, 0, 1000.));
        assert!(building_work::work(&mut v, 0, 1000.));
        step(&mut v, 120.);
        let b = owned(&v, 0);
        assert_eq!(b.id, id);
        assert_eq!((b.x, b.y), (5, 11));
        assert_eq!(b.remaining, 360.);
    }
    checkpoint(&mut g);
    assert_eq!(g.queue_building_work(0, "demolish", 0, 0), "ok");
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert_eq!(v.circular.waste, 2.);
        assert_eq!(v.progress.scraps, 2);
        assert!(building_work::work(&mut v, 0, 1000.));
        assert_eq!(held(&v, Kind::Digestion), 0);
        assert_eq!(v.circular.biogas, 0.);
    }
    checkpoint(&mut g);
}
#[test]
fn detached_curing_survives_the_original_building_and_credits_compost_once() {
    let mut g = scene(&["biodigester"]);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.circular.waste = 2.;
        v.progress.scraps = 2;
        step(&mut v, 1.);
        step(&mut v, 480.);
        assert_eq!(v.circular.biogas, 4.);
        assert_eq!(held(&v, Kind::Curing), 1);
        assert_eq!(v.circular.pending_compost, 2);
    }
    assert_eq!(g.queue_building_work(0, "demolish", 0, 0), "ok");
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(building_work::work(&mut v, 0, 1000.));
        step(&mut v, 1439.);
        assert_eq!(v.progress.compost, 0);
    }
    checkpoint(&mut g);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        step(&mut v, 1.);
        assert_eq!(v.progress.compost, 2);
        assert_eq!(v.circular.pending_compost, 0);
        step(&mut v, 1440.);
        assert_eq!(v.progress.compost, 2);
        assert_eq!(v.circular.biogas, 4.);
    }
    checkpoint(&mut g);
}
#[test]
fn passive_processes_finish_during_normal_sleep_without_creating_a_resident_job() {
    let mut g = scene(&["biodigester", "wetland"]);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.minutes = 1320.;
        v.circular.waste = 2.;
        v.progress.scraps = 2;
        v.circular.greywater = 12.;
        freshness::fixture_reseed(&mut v);
    }
    for _ in 0..650 {
        g.tick(0.25);
    }
    {
        let v = g.app.world().resource::<Village>();
        assert_eq!(v.circular.biogas, 4.);
        assert_eq!(v.circular.reclaimed, 8.);
        assert_eq!(v.circular.batches, 1);
        assert!(v.minutes % 1440. < 480.);
    }
    checkpoint(&mut g);
}
#[test]
fn malformed_owners_summaries_and_shared_id_collisions_fail_atomically() {
    let mut g = scene(&["biodigester"]);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.circular.waste = 2.;
        v.progress.scraps = 2;
        step(&mut v, 1.);
    }
    let before = g.snapshot();
    let saved: serde_json::Value = serde_json::from_str(&before).unwrap();
    let occupied_id = saved["village"]["logistics"]["stores"][0]["id"].clone();
    for (field, value) in [
        ("remaining", serde_json::json!(481)),
        ("building", serde_json::json!(999)),
        ("id", occupied_id),
    ] {
        let mut bad: serde_json::Value = serde_json::from_str(&before).unwrap();
        bad["village"]["processes"]["batches"][0][field] = value;
        assert!(!g.restore(&bad.to_string()));
        assert_eq!(g.snapshot(), before);
    }
    let mut bad: serde_json::Value = serde_json::from_str(&before).unwrap();
    bad["village"]["circular"]["digestion"] = 400.into();
    assert!(!g.restore(&bad.to_string()));
    assert_eq!(g.snapshot(), before);
}

#[test]
fn adding_another_digester_never_accelerates_a_committed_batch() {
    let mut g = scene(&["biodigester"]);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.circular.waste = 6.;
        v.progress.scraps = 6;
        step(&mut v, 1.);
        step(&mut v, 120.);
        assert_eq!(owned(&v, 0).remaining, 360.);
    }
    assert_eq!(g.place("biodigester", 10, 5), "ok");
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        logistics::fixture_finish(&mut v, 1);
        step(&mut v, 1.);
        assert_eq!(owned(&v, 0).remaining, 359.);
        assert_eq!(owned(&v, 1).remaining, 480.);
        assert_eq!(v.circular.waste, 2.);
        assert_eq!(v.progress.scraps, 2);
    }
    checkpoint(&mut g);
}
#[test]
fn daily_toilet_visits_leave_enough_sealed_space_for_process_input_recovery() {
    let mut g = scene(&["eco_toilet", "biodigester"]);
    let r = g
        .app
        .world_mut()
        .query::<&Resident>()
        .iter(g.app.world())
        .find(|r| r.id == 0)
        .unwrap()
        .clone();
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.circular.waste = 2.;
        v.progress.scraps = 2;
        step(&mut v, 1.);
        v.circular.waste = 77.5;
        assert!(!sanitation::due(&v, &r));
        v.circular.waste = 77.;
        assert!(sanitation::due(&v, &r));
    }
    checkpoint(&mut g);
}

#[test]
fn ready_process_feedback_distinguishes_staged_inputs_from_missing_inputs() {
    let mut g = scene(&["biodigester", "wetland"]);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        let initial = view(&v);
        assert!(
            initial["stations"][0]["reason"]
                .as_str()
                .unwrap()
                .starts_with("Waiting")
        );
        v.circular.waste = 2.;
        v.progress.scraps = 2;
        v.circular.greywater = 12.;
        let ready = view(&v);
        assert!(
            ready["stations"][0]["reason"]
                .as_str()
                .unwrap()
                .starts_with("Ready to digest")
        );
        assert!(
            ready["stations"][1]["reason"]
                .as_str()
                .unwrap()
                .starts_with("Ready to filter")
        );
        step(&mut v, 1.);
        assert_eq!(held(&v, Kind::Digestion), 1);
        assert_eq!(held(&v, Kind::Filtration), 1);
        let running = view(&v);
        assert!(
            running["stations"][0]["reason"]
                .as_str()
                .unwrap()
                .starts_with("Digesting")
        );
        assert!(
            running["stations"][1]["reason"]
                .as_str()
                .unwrap()
                .starts_with("Filtering")
        );
    }
    checkpoint(&mut g);
}
