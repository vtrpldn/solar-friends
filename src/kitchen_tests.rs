use super::*;

fn scene(eggs: bool, gas: f32) -> (Game, Id, Resident) {
    let mut g = Game::new();
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.progress.completed = [true; 4];
        v.arrived = true;
        v.minutes = 540.;
        crate::water::fixture_fresh(&mut v, 40.);
        v.supplies.use_eggs = eggs;
        v.circular.use_biogas = true;
        v.circular.biogas = gas;
        v.production.targets = [0; COUNT];
        logistics::fixture_stock(&mut v, economy::FOOD, 30);
        logistics::fixture_stock(&mut v, economy::MEALS, 0);
        logistics::fixture_stock(&mut v, economy::EGGS, 4);
    }
    assert_eq!(g.place("kitchen", 5, 5), "ok");
    let mut r = g
        .app
        .world_mut()
        .query::<&Resident>()
        .iter(g.app.world())
        .next()
        .unwrap()
        .clone();
    let id = {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        logistics::fixture_finish(&mut v, 0);
        food::fixture_stage(&mut v, 0);
        let id = order_meals(&mut v, Some(0)).unwrap();
        assert!(assign_batch(&mut r, &v, id));
        (r.x, r.y) = (r.target_x, r.target_y);
        id
    };
    (g, id, r)
}

fn checkpoint(g: &mut Game) {
    let saved = g.snapshot();
    assert!(g.restore(&saved), "invalid kitchen checkpoint: {saved}");
    assert_eq!(g.snapshot(), saved);
}

#[test]
fn a_saved_pot_commits_local_inputs_once_and_requires_attended_work() {
    let (mut g, id, r) = scene(false, 0.);
    let food = g.app.world().resource::<Village>().food;
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(!work(&mut v, &r, 3.));
        assert_eq!(v.food, food - 3.);
        assert_eq!(v.meals, 0);
        v.minutes += 30.;
        sync(&mut v);
        assert_eq!(batch(&v, id).unwrap().work, 3.);
        assert_eq!(batch(&v, id).unwrap().last_worker, Some(r.id));
    }
    checkpoint(&mut g);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(work(&mut v, &r, 7.));
        assert!(!work(&mut v, &r, 10.));
        assert_eq!(v.food, food - 3.);
        assert_eq!(v.meals, 5);
        assert_eq!(food::pantry(&v, 0).unwrap().items[economy::MEALS], 5);
        assert_eq!(v.water, 39.);
        assert_eq!(v.situations.cooking[0][r.id], 1);
        assert_eq!(v.progress.scraps, 1);
        assert!(
            simulation::view(&v)["materials"]
                .as_array()
                .unwrap()
                .iter()
                .all(|m| m["difference"] == 0.)
        );
    }
    checkpoint(&mut g);
}

#[test]
fn reclaimed_water_cannot_resume_a_saved_pot_but_fresh_water_can() {
    let (mut g, id, r) = scene(false, 0.);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(!work(&mut v, &r, 3.));
        crate::water::fixture_fresh(&mut v, 0.);
        crate::water::fixture_irrigation(&mut v, 20.);
        sync(&mut v);
        assert_eq!(batch(&v, id).unwrap().phase, Phase::AwaitingWater);
        assert!(!work(&mut v, &r, 7.));
        assert_eq!(batch(&v, id).unwrap().work, 3.);
        assert_eq!(v.meals, 0);
    }
    checkpoint(&mut g);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        crate::water::fixture_fresh(&mut v, 1.);
        assert!(work(&mut v, &r, 7.));
        assert_eq!(v.water, 0.);
        assert_eq!(v.circular.reclaimed, 20.);
        assert_eq!(v.circular.greywater, 0.7);
    }
    checkpoint(&mut g);
}

#[test]
fn cancellation_returns_the_same_eggs_food_and_held_gas_once() {
    let (mut g, id, r) = scene(true, 12.);
    let original = g.app.world().resource::<Village>().clone();
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert_eq!(batch(&v, id).unwrap().output, 8);
        assert!(!work(&mut v, &r, 4.));
        assert_eq!(v.food, original.food - 2.);
        assert_eq!(v.supplies.eggs, original.supplies.eggs - 2);
        assert_eq!(v.circular.biogas, 11.);
        assert_eq!(held_biogas(&v), 1);
        assert_eq!(v.water, original.water);
    }
    checkpoint(&mut g);
    assert_eq!(g.cancel_production_batch(id.0), "ok");
    assert_ne!(g.cancel_production_batch(id.0), "ok");
    let v = g.app.world().resource::<Village>();
    assert_eq!(v.food, original.food);
    assert_eq!(v.supplies.eggs, original.supplies.eggs);
    assert_eq!(v.circular.biogas, 12.);
    assert_eq!(held_biogas(v), 0);
    assert_eq!(v.production.accounting.inputs, [0; COUNT]);
    assert_eq!(v.production.accounting.biogas_used, 0);
    assert_eq!(v.meals, 0);
    checkpoint(&mut g);
}

#[test]
fn a_partial_gas_pot_holds_refund_capacity_before_another_digestion_batch() {
    let (mut g, id, r) = scene(true, 9.);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.progress.later_completed = [true; 9];
    }
    assert_eq!(g.place("biodigester", 12, 5), "ok");
    let mut v = g.app.world_mut().resource_mut::<Village>();
    logistics::fixture_finish(&mut v, 1);
    v.circular.waste = 2.;
    crate::organics::fixture(&mut v, crate::economy::SCRAPS, 2);
    assert!(!work(&mut v, &r, 4.));
    assert_eq!(v.circular.biogas, 8.);
    sanitation::advance(&mut v, 1.);
    assert_eq!(v.circular.digestion, 0., "Refund room belongs to the pot");
    assert_eq!(v.circular.waste, 2.);
    assert!(work(&mut v, &r, 6.));
    assert_eq!(batch(&v, id).unwrap().phase, Phase::Complete);
    sanitation::advance(&mut v, 1.);
    assert_eq!(v.circular.digestion, 480.);
    sanitation::advance(&mut v, 480.);
    assert_eq!(v.circular.biogas, 12.);
    assert!(sanitation::valid(&v));
}

#[test]
fn moving_a_kitchen_refunds_the_pot_and_waits_for_its_pantry_to_be_evacuated() {
    let (mut g, id, r) = scene(true, 4.);
    let food = g.app.world().resource::<Village>().food;
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(!work(&mut v, &r, 4.));
    }
    assert_eq!(g.queue_building_work(0, "move", 16, 6), "ok");
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert_eq!(batch(&v, id).unwrap().phase, Phase::Cancelled);
        assert_eq!(v.food, food);
        assert_eq!(v.circular.biogas, 4.);
        assert!(logistics::occupied_building(&v, 0));
        assert!(!building_work::work(&mut v, 0, 1000.));
        assert_eq!(v.buildings[0].x, 5);
        assert!(food::pantry(&v, 0).unwrap().items[economy::FOOD] >= 2);
    }
    checkpoint(&mut g);
}

#[test]
fn recipe_switches_change_an_unstarted_pot_and_preserve_a_started_recipe() {
    let (mut g, id, _) = scene(true, 4.);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.supplies.use_eggs = false;
        v.circular.use_biogas = false;
        sync(&mut v);
        let b = batch(&v, id).unwrap();
        assert_eq!(b.inputs[economy::FOOD], 3);
        assert_eq!(b.inputs[economy::EGGS], 0);
        assert_eq!(b.output, 5);
        assert!(!b.biogas);
    }
    checkpoint(&mut g);
    let (mut g, id, r2) = scene(true, 4.);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(!work(&mut v, &r2, 4.));
        v.supplies.use_eggs = false;
        v.circular.use_biogas = false;
        sync(&mut v);
        assert_eq!(batch(&v, id).unwrap().output, 8);
        assert!(work(&mut v, &r2, 6.));
        assert_eq!(v.meals, 8);
        assert!(v.progress.egg_meal && v.progress.biogas_meal);
        assert_eq!(v.circular.biogas, 3.);
    }
    checkpoint(&mut g);
}

#[test]
fn incoming_pantry_supplies_leave_room_for_the_committed_pot() {
    let (mut g, id, r) = scene(false, 0.);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(!work(&mut v, &r, 4.));
        let room = logistics::room(&v, Owner::Pantry(0));
        assert!(logistics::receive(
            &mut v,
            Owner::Pantry(0),
            economy::EGGS,
            room
        ));
        assert!(!logistics::receive(
            &mut v,
            Owner::Pantry(0),
            economy::EGGS,
            1
        ));
    }
    checkpoint(&mut g);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(work(&mut v, &r, 6.));
        sync(&mut v);
        assert_eq!(batch(&v, id).unwrap().phase, Phase::Complete);
        assert_eq!(v.meals, 5);
        assert_eq!(v.situations.cooking[0][r.id], 1);
        assert_eq!(v.water, 39.);
        assert_eq!(
            food::pantry(&v, 0).unwrap().items.iter().sum::<u32>(),
            BUFFER
        );
    }
    checkpoint(&mut g);
}

#[test]
fn malformed_cooking_recipes_workers_and_gas_promises_are_rejected_atomically() {
    let (mut g, id, r) = scene(true, 1.);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(!work(&mut v, &r, 3.));
    }
    let saved = g.snapshot();
    for (field, value) in [
        ("output", serde_json::json!(80)),
        ("last_worker", serde_json::json!(5)),
        ("last_worker", serde_json::Value::Null),
        ("biogas", serde_json::json!(false)),
    ] {
        let mut bad: serde_json::Value = serde_json::from_str(&saved).unwrap();
        let b = bad["village"]["production"]["batches"]
            .as_array_mut()
            .unwrap()
            .iter_mut()
            .find(|b| b["id"] == id.0)
            .unwrap();
        b[field] = value;
        assert!(!g.restore(&bad.to_string()), "accepted forged {field}");
        assert_eq!(g.snapshot(), saved);
    }
}

#[test]
fn a_full_kitchen_reserves_space_for_the_meals_and_their_scraps_together() {
    let (mut g, id, r) = scene(false, 0.);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(!work(&mut v, &r, 1.));
        let owner = Owner::Pantry(0);
        let room = logistics::room(&v, owner);
        assert!(logistics::receive(&mut v, owner, 0, room));
        assert!(!logistics::receive(&mut v, owner, 0, 1));
        assert!(work(&mut v, &r, 9.));
        assert_eq!(batch(&v, id).unwrap().phase, Phase::Complete);
        let p = food::pantry(&v, 0).unwrap();
        assert_eq!(p.items[economy::MEALS], 5);
        assert_eq!(p.items[economy::SCRAPS], 1);
        assert_eq!(p.items.iter().sum::<u32>(), p.capacity);
    }
    checkpoint(&mut g);
}
