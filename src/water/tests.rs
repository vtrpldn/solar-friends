use super::*;
fn scene() -> Game {
    let mut g = Game::new();
    g.start_fixture_mode("sandbox");
    for (kind, x, y) in [
        ("well", 5, 5),
        ("kitchen", 12, 5),
        ("garden", 18, 5),
        ("wetland", 5, 18),
        ("eco_toilet", 12, 18),
    ] {
        assert_eq!(g.place(kind, x, y), "ok");
    }
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.mode = modes::Mode::Story;
        v.arrived = true;
        v.minutes = 540.;
        v.progress.completed = [true; 4];
        v.progress.later_completed = [true; 9];
        v.production.targets[economy::MEALS] = 0;
        fixture(&mut v, 0., 0.);
    }
    let world = g.app.world_mut();
    let mut q = world.query::<&mut Resident>();
    for mut r in q.iter_mut(world) {
        r.task = "idle".into();
        r.activity_store = None;
        r.activity_building = None;
        r.activity_material = None;
        r.activity_batch = None;
        r.requested = false;
        r.remaining = 0.;
        r.energy = 90.;
        r.hunger = 0.;
        r.social = 90.;
        r.last_meal_slot = 0;
        r.x = CAMP.0 + (r.id as f32 - 2.) * 1.25;
        r.y = CAMP.1;
        r.target_x = r.x;
        r.target_y = r.y;
        r.walking = walking::State::default();
    }
    g
}
fn until(g: &mut Game, test: impl Fn(&Village) -> bool, label: &str) {
    for _ in 0..6000 {
        if test(g.app.world().resource::<Village>()) {
            return;
        }
        g.tick(0.25);
    }
    panic!("{label}: {}", g.water_report());
}
fn checkpoint(g: &mut Game) {
    let saved = g.snapshot();
    let mut h = Game::new();
    assert!(h.restore(&saved), "invalid water checkpoint");
    assert_eq!(h.snapshot(), saved);
}
fn reconciled(v: &Village) {
    for class in Class::ALL {
        let i = class.index();
        assert!(
            (v.water_supply.opening[i] + v.water_supply.received[i]
                - v.water_supply.consumed[i]
                - total(v, class)
                - processes::sealed_liquid(v, class))
            .abs()
                < 0.0001
        );
    }
}
#[test]
fn kitchens_and_toilets_cannot_spend_remote_or_reclaimed_water() {
    let mut g = scene();
    let mut v = g.app.world_mut().resource_mut::<Village>();
    assert_eq!(add(&mut v, Owner::Building(0), Class::Fresh, 20.), 20.);
    assert_eq!(add(&mut v, Owner::Building(3), Class::Irrigation, 8.), 8.);
    assert_eq!(available(&v, Owner::Building(1), Class::Fresh), 0.);
    assert_eq!(draw(&mut v, Owner::Building(1), Class::Fresh, 1.), 0.);
    assert_eq!(add(&mut v, Owner::Building(1), Class::Irrigation, 2.), 0.);
    let before = (v.water, v.circular.reclaimed);
    sanitation::household_at(&mut v, Owner::Building(4), 1.);
    assert_eq!((v.water, v.circular.reclaimed), before);
    assert_eq!(v.circular.greywater, 0.);
    reconciled(&v);
}
#[test]
fn actual_carriers_reserve_collect_deliver_and_reload_without_duplicating_water() {
    let mut g = scene();
    add(
        &mut g.app.world_mut().resource_mut::<Village>(),
        Owner::Building(0),
        Class::Fresh,
        24.,
    );
    until(
        &mut g,
        |v| v.water_supply.trips.iter().any(|h| !h.carrying),
        "water pickup reservation",
    );
    checkpoint(&mut g);
    {
        let v = g.app.world().resource::<Village>();
        assert_eq!(v.water_supply.received[0], 24.);
        assert_eq!(total(v, Class::Fresh), 24.);
        assert!(v.water_supply.trips.iter().all(|h| h.amount <= LOAD));
    }
    until(
        &mut g,
        |v| v.water_supply.trips.iter().any(|h| h.carrying),
        "physical collection",
    );
    checkpoint(&mut g);
    {
        let v = g.app.world().resource::<Village>();
        let h = v.water_supply.trips.iter().find(|h| h.carrying).unwrap();
        assert_eq!(tank(v, h.to).unwrap().water[0], 0.);
        reconciled(v);
    }
    until(
        &mut g,
        |v| available(v, Owner::Camp, Class::Fresh) >= 10.,
        "physical delivery",
    );
    checkpoint(&mut g);
    reconciled(g.app.world().resource::<Village>());
}
#[test]
fn interrupted_carried_water_uses_its_reserved_container_and_preserves_ownership() {
    let mut g = scene();
    add(
        &mut g.app.world_mut().resource_mut::<Village>(),
        Owner::Building(0),
        Class::Fresh,
        24.,
    );
    until(
        &mut g,
        |v| v.water_supply.trips.iter().any(|h| h.carrying),
        "carried water",
    );
    let v = g.app.world().resource::<Village>();
    let h = v
        .water_supply
        .trips
        .iter()
        .find(|h| h.carrying)
        .unwrap()
        .clone();
    let before = total(v, Class::Fresh);
    let receipts = v.water_supply.received;
    assert!(g.request(h.resident, "rest", false).contains("Happy"));
    let v = g.app.world().resource::<Village>();
    assert!(!v.water_supply.trips.iter().any(|p| p.id == h.id));
    let recovery = tank(v, h.recovery).unwrap();
    assert_eq!(recovery.owner, Owner::Ground);
    assert_eq!(recovery.water[0], h.amount);
    assert_eq!(total(v, Class::Fresh), before);
    assert_eq!(v.water_supply.received, receipts);
    checkpoint(&mut g);
}
#[test]
fn treated_water_fallback_is_credited_at_collection_and_not_usable_until_delivery() {
    let mut g = scene();
    until(
        &mut g,
        |v| {
            v.water_supply
                .trips
                .iter()
                .any(|h| h.from.is_none() && !h.carrying)
        },
        "treated-water collection trip",
    );
    assert_eq!(g.app.world().resource::<Village>().water, 0.);
    checkpoint(&mut g);
    until(
        &mut g,
        |v| {
            v.water_supply
                .trips
                .iter()
                .any(|h| h.from.is_none() && h.carrying)
        },
        "treated-water pickup",
    );
    let v = g.app.world().resource::<Village>();
    assert!(v.water > 0.);
    assert_eq!(available(v, Owner::Camp, Class::Fresh), 0.);
    assert!(v.water_supply.received[0] > 0.);
    checkpoint(&mut g);
    until(
        &mut g,
        |v| available(v, Owner::Camp, Class::Fresh) >= 10.,
        "treated-water delivery",
    );
    checkpoint(&mut g);
    reconciled(g.app.world().resource::<Village>());
}
#[test]
fn rain_fills_only_the_cistern_that_catches_it_and_respects_local_capacity() {
    let mut g = scene();
    let mut v = g.app.world_mut().resource_mut::<Village>();
    v.minutes = 900.;
    add(&mut v, Owner::Building(0), Class::Fresh, 74.);
    rain(&mut v, 60.);
    assert_eq!(available(&v, Owner::Building(0), Class::Fresh), 75.);
    assert_eq!(available(&v, Owner::Camp, Class::Fresh), 0.);
    assert_eq!(available(&v, Owner::Building(1), Class::Fresh), 0.);
    assert_eq!(v.water_supply.received[0], 75.);
    assert!(v.progress.rain_caught);
    v.progress.rain_caught = false;
    rain(&mut v, 60.);
    assert!(!v.progress.rain_caught);
    assert_eq!(v.water_supply.received[0], 75.);
    reconciled(&v);
}
#[test]
fn resident_irrigation_delivery_keeps_the_reed_beds_output_separate_from_fresh_water() {
    let mut g = scene();
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        add(&mut v, Owner::Camp, Class::Fresh, 32.);
        add(&mut v, Owner::Building(3), Class::Irrigation, 8.);
    }
    until(
        &mut g,
        |v| {
            v.water_supply
                .trips
                .iter()
                .any(|h| h.class == Class::Irrigation && h.carrying)
        },
        "irrigation cargo",
    );
    checkpoint(&mut g);
    until(
        &mut g,
        |v| available(v, Owner::Building(2), Class::Irrigation) >= 2.,
        "irrigation delivery",
    );
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert_eq!(available(&v, Owner::Building(1), Class::Irrigation), 0.);
        let fresh = v.water;
        assert!(irrigate(&mut v, Owner::Building(2)));
        assert_eq!(v.water, fresh);
        assert!(v.progress.reclaimed_irrigation);
        reconciled(&v);
    }
    checkpoint(&mut g);
}
#[test]
fn forged_totals_accounts_shared_ids_and_remote_pickups_are_rejected_atomically() {
    let mut g = scene();
    add(
        &mut g.app.world_mut().resource_mut::<Village>(),
        Owner::Building(0),
        Class::Fresh,
        24.,
    );
    until(
        &mut g,
        |v| !v.water_supply.trips.is_empty(),
        "water reservation",
    );
    let saved = g.snapshot();
    for kind in 0..4 {
        let mut bad: serde_json::Value = serde_json::from_str(&saved).unwrap();
        match kind {
            0 => bad["village"]["water"] = 999.into(),
            1 => bad["village"]["water_supply"]["opening"][0] = 99.into(),
            2 => {
                bad["village"]["water_supply"]["tanks"][0]["id"] =
                    bad["village"]["logistics"]["stores"][0]["id"].clone()
            }
            _ => {
                bad["village"]["water_supply"]["trips"][0]["pickup"] = serde_json::json!([20., 20.])
            }
        };
        assert!(!g.restore(&bad.to_string()));
        assert_eq!(g.snapshot(), saved);
    }
}
#[test]
fn moving_containers_leave_water_at_the_original_plot() {
    let mut g = scene();
    add(
        &mut g.app.world_mut().resource_mut::<Village>(),
        Owner::Building(0),
        Class::Fresh,
        20.,
    );
    assert_eq!(g.queue_building_work(0, "move", 5, 24), "ok");
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        building_work::work(&mut v, 0, 24.);
        building_work::work(&mut v, 0, 36.);
        assert_eq!(total(&v, Class::Fresh), 20.);
        assert_eq!(available(&v, Owner::Building(0), Class::Fresh), 0.);
        assert!(
            v.water_supply
                .tanks
                .iter()
                .any(|p| p.owner == Owner::Ground && p.x == 5. && p.y == 5. && p.water[0] == 20.)
        );
        reconciled(&v);
    }
    checkpoint(&mut g);
}
#[test]
fn small_recoverable_loads_can_be_collected_and_sync_never_discards_a_residue() {
    let mut g = scene();
    let mut v = g.app.world().resource::<Village>().clone();
    let id = v.simulation.allocate().unwrap();
    v.water_supply.tanks.push(Tank {
        id,
        owner: Owner::Ground,
        x: 10.7,
        y: 13.,
        capacity: [0.25, 0., 0., 0.],
        water: [0.25, 0., 0., 0.],
    });
    v.water_supply.received[0] += 0.25;
    summaries(&mut v);
    let world = g.app.world_mut();
    let r = world.query::<&Resident>().iter(world).next().unwrap();
    let q = quote(&v, r).unwrap();
    assert_eq!(q.from, Some(id));
    assert_eq!(q.amount, 0.25);
    let p = v
        .water_supply
        .tanks
        .iter_mut()
        .find(|p| p.id == id)
        .unwrap();
    p.water[0] = EPS / 2.;
    v.water_supply.consumed[0] = 0.25 - EPS / 2.;
    summaries(&mut v);
    let before = total(&v, Class::Fresh);
    sync(&mut v);
    assert_eq!(total(&v, Class::Fresh), before);
    assert!(tank(&v, id).is_some());
    reconciled(&v);
}
#[test]
fn healthy_local_reserves_wait_for_a_useful_refill_batch() {
    let mut g = scene();
    let mut v = g.app.world().resource::<Village>().clone();
    replenish(&mut v);
    draw(&mut v, Owner::Building(1), Class::Fresh, 1.);
    draw(&mut v, Owner::Building(2), Class::Fresh, 2.);
    assert!(
        !has_work(&v),
        "Five water at the kitchen and two at the garden need no top-up chore"
    );
    draw(&mut v, Owner::Building(1), Class::Fresh, 4.);
    let world = g.app.world_mut();
    let r = world.query::<&Resident>().iter(world).next().unwrap();
    let q = quote(&v, r).unwrap();
    assert_eq!(q.to, owner_tank(&v, Owner::Building(1)).unwrap().id);
    assert_eq!(q.amount, 5.);
}
#[test]
fn household_buffers_replace_the_camp_reserve_after_everyone_is_housed() {
    let mut g = scene();
    g.start_fixture_mode("sandbox");
    assert_eq!(g.place("home", 5, 10), "ok");
    assert_eq!(g.place("home", 18, 10), "ok");
    let mut v = g.app.world().resource::<Village>().clone();
    replenish(&mut v);
    draw(&mut v, Owner::Camp, Class::Fresh, 40.);
    assert!((0..5).all(|id| shelter(&v, id).is_some()));
    assert!(
        !has_work(&v),
        "An unused arrival reserve must not generate hauling work"
    );
    let home = shelter(&v, 0).unwrap().id;
    draw(&mut v, Owner::Building(home), Class::Fresh, 8.);
    let world = g.app.world_mut();
    let r = world.query::<&Resident>().iter(world).next().unwrap();
    let q = quote(&v, r).unwrap();
    assert_eq!(q.to, owner_tank(&v, Owner::Building(home)).unwrap().id);
    assert_eq!(q.amount, 8.);
}
#[test]
fn an_incoming_essential_load_lowers_reserve_urgency_for_other_consumers() {
    let mut g = scene();
    let mut v = g.app.world().resource::<Village>().clone();
    replenish(&mut v);
    draw(&mut v, Owner::Camp, Class::Fresh, 40.);
    let world = g.app.world_mut();
    let people: Vec<_> = world.query::<&Resident>().iter(world).cloned().collect();
    let mut first = people[0].clone();
    first.task = "water".into();
    first.remaining = 10.;
    advance(&mut v, &mut first, &[], 0.25);
    assert_eq!(
        v.water_supply.trips[0].to,
        owner_tank(&v, Owner::Camp).unwrap().id
    );
    assert_eq!(v.water_supply.trips[0].amount, 12.);
    draw(&mut v, Owner::Building(1), Class::Fresh, 6.);
    let next = quote(&v, &people[1]).unwrap();
    assert_eq!(
        next.to,
        owner_tank(&v, Owner::Building(1)).unwrap().id,
        "Promised essential water leaves the other carrier free to supply the kitchen"
    );
}

#[test]
fn sparse_carriers_move_owned_water_and_unknown_carriers_cannot_claim_it() {
    let mut g = scene();
    g.set_resident_learning(true);
    let world = g.app.world_mut();
    let mut r = world
        .query::<&Resident>()
        .iter(world)
        .next()
        .unwrap()
        .clone();
    r.id = 900;
    r.task = "water".into();
    r.remaining = 10.;
    let mut v = world.resource_mut::<Village>();
    v.skills.people.insert(900, skills::Person::default());
    assert_eq!(add(&mut v, Owner::Building(0), Class::Fresh, 24.), 24.);
    let mut unknown = r.clone();
    unknown.id = 1200;
    let before = serde_json::to_value(&*v).unwrap();
    let actor = serde_json::to_value(&unknown).unwrap();
    assert!(quote(&v, &unknown).is_none());
    assert!(!assign_target(&v, &mut unknown));
    assert!(!advance(&mut v, &mut unknown, &[], 0.25));
    assert_eq!(serde_json::to_value(&*v).unwrap(), before);
    assert_eq!(serde_json::to_value(&unknown).unwrap(), actor);
    assert!(assign_target(&v, &mut r));
    let mut carried = false;
    let mut started = false;
    for _ in 0..3000 {
        advance(&mut v, &mut r, &[], 0.25);
        if let Some(h) = v.water_supply.trips.iter().find(|h| h.resident == 900) {
            started = true;
            carried |= h.carrying;
            assert!(valid(&v, &[r.clone()]));
            let person = v.skills.people.remove(&900).unwrap();
            assert!(!valid(&v, &[r.clone()]));
            v.skills.people.insert(900, person);
        } else if started {
            break;
        }
    }
    assert!(carried);
    assert!(v.water_supply.trips.is_empty());
    assert_eq!(total(&v, Class::Fresh), 24.);
    assert!(v.skills.people[&900].experience[skills::Skill::Logistics as usize] > 0);
    reconciled(&v);
}
