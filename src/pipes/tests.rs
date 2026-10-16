use super::*;
fn scene() -> Game {
    let mut g = Game::new();
    g.start_mode("sandbox");
    for (kind, x, y) in [("well", 5, 5), ("kitchen", 12, 5), ("solar_farm", 5, 18)] {
        assert_eq!(g.place(kind, x, y), "ok");
    }
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        for i in 0..COUNT {
            logistics::fixture_stock(&mut v, i, 0);
        }
        logistics::fixture_stock(&mut v, economy::FOOD, 40);
        logistics::fixture_stock(&mut v, economy::MEALS, 12);
        v.mode = modes::Mode::Story;
        v.arrived = true;
        v.minutes = 540.;
        power::fixtures::charge(&mut v, 10.);
        v.progress.completed = [true; 4];
        v.progress.later_completed = [true; 9];
        v.production.targets[economy::MEALS] = 0;
        water::fixture_fresh(&mut v, 60.);
    }
    let world = g.app.world_mut();
    let mut q = world.query::<&mut Resident>();
    for mut r in q.iter_mut(world) {
        r.task = "idle".into();
        r.trip = None;
        r.remaining = 0.;
        r.requested = false;
        r.energy = 90.;
        r.hunger = 0.;
        r.social = 90.;
        r.last_meal_slot = 0;
        r.x = 10. + (r.id as f32 - 2.) * 1.25;
        r.y = 13.;
        r.target_x = r.x;
        r.target_y = r.y;
        r.walking = walking::State::default();
    }
    g
}
fn checkpoint(g: &mut Game) {
    let raw = g.snapshot();
    assert!(g.restore(&raw), "{}", g.water_connections());
    assert_eq!(g.snapshot(), raw);
}
fn supplies(v: &mut Village, id: Id) {
    let p = line(v, id).unwrap().clone();
    for i in 0..COUNT {
        if p.kit[i] > 0 {
            assert!(logistics::receive(v, Owner::Camp, i, p.kit[i]));
        }
    }
}
fn until(g: &mut Game, test: impl Fn(&Village) -> bool, label: &str) {
    for _ in 0..5 * 1920 {
        if test(g.app.world().resource::<Village>()) {
            return;
        }
        g.tick(0.25);
    }
    panic!("{label}: {}", g.water_connections());
}
fn queued(g: &mut Game) -> Id {
    assert_eq!(g.queue_water_connection("fresh", 0, 1), "ok");
    g.app.world().resource::<Village>().pipes.lines[0].id
}
#[test]
fn planned_lines_wait_for_delivered_parts_and_residents_work_along_the_corridor() {
    let mut g = scene();
    let id = queued(&mut g);
    checkpoint(&mut g);
    {
        let v = g.app.world().resource::<Village>();
        assert!(!ready(v, line(v, id).unwrap()));
        assert_eq!(line(v, id).unwrap().work, 0.);
    }
    supplies(&mut g.app.world_mut().resource_mut::<Village>(), id);
    until(
        &mut g,
        |v| {
            v.logistics.as_ref().unwrap().shipments.iter().any(|h| {
                v.logistics
                    .as_ref()
                    .unwrap()
                    .stores
                    .iter()
                    .any(|p| p.id == h.to && p.owner == Owner::Utility(id))
            })
        },
        "Actual kit shipment",
    );
    checkpoint(&mut g);
    until(
        &mut g,
        |v| line(v, id).unwrap().phase == Phase::Installing,
        "Resident begins laying pipe",
    );
    checkpoint(&mut g);
    let partial = line(g.app.world().resource::<Village>(), id).unwrap().work;
    assert_eq!(g.configure_water_connection(id.0, 1, true), "ok");
    for _ in 0..120 {
        g.tick(0.25);
    }
    assert_eq!(
        line(g.app.world().resource::<Village>(), id).unwrap().work,
        partial
    );
    checkpoint(&mut g);
    assert_eq!(g.configure_water_connection(id.0, 1, false), "ok");
    checkpoint(&mut g);
    let start = g.app.world().resource::<Village>().minutes;
    until(
        &mut g,
        |v| line(v, id).unwrap().phase == Phase::Active,
        "Corridor and pump completed",
    );
    checkpoint(&mut g);
    let v = g.app.world().resource::<Village>();
    let p = line(v, id).unwrap();
    assert!(v.minutes - start >= p.labour() - p.work.min(1.));
    assert_eq!(p.work, p.labour());
    assert!(p.spent.is_some());
    assert!(v.simulation.materials.as_ref().unwrap().spent[14] >= 1);
}
fn install_direct(g: &mut Game, id: Id) {
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        supplies(&mut v, id);
        let parts = line(&v, id).unwrap().kit;
        for (i, &n) in parts.iter().enumerate() {
            if n > 0 {
                organics::fixture_transfer(&mut v, Owner::Utility(id), i, n);
            }
        }
    }
    let world = g.app.world_mut();
    let mut r = world
        .query::<&Resident>()
        .iter(world)
        .next()
        .unwrap()
        .clone();
    for _ in 0..1000 {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        if line(&v, id).unwrap().phase == Phase::Active {
            return;
        }
        assert!(assign_target(&mut r, &v, id));
        let point = approach(&v, id, r.id).unwrap();
        r.x = point[0];
        r.y = point[1];
        work(&mut v, &r, 0.75);
    }
    panic!("Installation did not finish")
}
#[test]
fn a_worker_cannot_install_remotely_or_skip_a_corridor_cell() {
    let mut g = scene();
    let id = queued(&mut g);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        supplies(&mut v, id);
        let parts = line(&v, id).unwrap().kit;
        for (i, &n) in parts.iter().enumerate() {
            if n > 0 {
                organics::fixture_transfer(&mut v, Owner::Utility(id), i, n);
            }
        }
    }
    let world = g.app.world_mut();
    let mut r = world
        .query::<&Resident>()
        .iter(world)
        .next()
        .unwrap()
        .clone();
    let mut v = world.resource_mut::<Village>();
    assert!(assign_target(&mut r, &v, id));
    r.x = 24.;
    r.y = 24.;
    assert!(!work(&mut v, &r, 200.));
    assert_eq!(line(&v, id).unwrap().work, 0.);
    let point = approach(&v, id, r.id).unwrap();
    r.x = point[0];
    r.y = point[1];
    assert!(!work(&mut v, &r, 200.));
    assert_eq!(line(&v, id).unwrap().work, 4.);
    assert!(!work(&mut v, &r, 200.));
    assert_eq!(
        line(&v, id).unwrap().work,
        4.,
        "The next cell needs a new attended position"
    );
}
#[test]
fn pumping_conserves_water_and_spends_energy_with_real_flow_and_capacity_limits() {
    let mut g = scene();
    let id = queued(&mut g);
    install_direct(&mut g, id);
    power::fixtures::pump(&mut g.app.world_mut().resource_mut::<Village>(), id);
    let mut v = g.app.world().resource::<Village>().clone();
    let owners: Vec<_> = v.water_supply.tanks.iter().map(|t| t.owner).collect();
    for owner in owners {
        water::draw(&mut v, owner, water::Class::Fresh, 1000.);
    }
    water::add(&mut v, water::Owner::Building(0), water::Class::Fresh, 20.);
    water::add(&mut v, water::Owner::Camp, water::Class::Fresh, 40.);
    let destination = water::Owner::Building(1);
    water::draw(&mut v, destination, water::Class::Fresh, 6.);
    power::fixtures::charge(&mut v, 1.);
    let total = water::total(&v, water::Class::Fresh);
    pump_interval(&mut v, 10.);
    assert!((water::available(&v, destination, water::Class::Fresh) - 2.).abs() < 1e-8);
    assert!((v.power.stored - 0.95).abs() < 1e-6);
    assert!((water::total(&v, water::Class::Fresh) - total).abs() < 1e-8);
    pump_interval(&mut v, 100.);
    assert_eq!(water::available(&v, destination, water::Class::Fresh), 6.);
    water::draw(&mut v, destination, water::Class::Fresh, 6.);
    power::fixtures::charge(&mut v, 0.025);
    pump_interval(&mut v, 100.);
    assert!((water::available(&v, destination, water::Class::Fresh) - 1.).abs() < 1e-6);
    assert_eq!(v.power.stored, 0.);
    let before = water::available(&v, destination, water::Class::Fresh);
    pump_interval(&mut v, 100.);
    assert_eq!(
        water::available(&v, destination, water::Class::Fresh),
        before
    );
}
#[test]
fn pause_duplicate_invalid_class_and_forged_paid_routes_preserve_the_live_world() {
    let mut g = scene();
    let id = queued(&mut g);
    let raw = g.snapshot();
    assert_ne!(g.queue_water_connection("fresh", 0, 1), "ok");
    assert_eq!(g.snapshot(), raw);
    assert_ne!(g.queue_water_connection("sewage", 0, 1), "ok");
    assert_eq!(g.snapshot(), raw);
    g.water_connections();
    g.water_connection_quote("fresh", 0, 1);
    assert_eq!(g.snapshot(), raw);
    install_direct(&mut g, id);
    checkpoint(&mut g);
    assert_eq!(g.configure_water_connection(id.0, 3, true), "ok");
    checkpoint(&mut g);
    let before = g.snapshot();
    assert_ne!(g.configure_water_connection(id.0, 4, false), "ok");
    assert_eq!(g.snapshot(), before);
    for field in ["id", "kit", "edge", "phase", "energy"] {
        let mut bad: serde_json::Value = serde_json::from_str(&before).unwrap();
        let reused_id = bad["village"]["water_supply"]["tanks"][0]["id"].clone();
        let p = &mut bad["village"]["pipes"]["lines"][0];
        match field {
            "id" => p["id"] = reused_id,
            "kit" => p["kit"][14] = 0.into(),
            "edge" => p["plan"]["start"]["edge"] = serde_json::json!([20., 20.]),
            "phase" => {
                p["work"] = 0.into();
                p["phase"] = "active".into()
            }
            _ => p["energy_used"] = 10.into(),
        }
        assert!(!g.restore(&bad.to_string()), "Accepted forged {field}");
        assert_eq!(g.snapshot(), before);
    }
}
fn add_ready(g: &mut Game, kind: &str, x: i32, y: i32) -> usize {
    assert_eq!(g.place(kind, x, y), "ok");
    let mut v = g.app.world_mut().resource_mut::<Village>();
    let id = v.buildings.last().unwrap().id;
    logistics::fixture_finish(&mut v, id);
    id
}
fn empty_fresh(v: &mut Village) {
    let owners: Vec<_> = v.water_supply.tanks.iter().map(|t| t.owner).collect();
    for owner in owners {
        water::draw(v, owner, water::Class::Fresh, 1000.);
    }
}
fn dismantle_direct(g: &mut Game, id: Id) {
    let world = g.app.world_mut();
    let mut r = world
        .query::<&Resident>()
        .iter(world)
        .next()
        .unwrap()
        .clone();
    for _ in 0..1000 {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        if line(&v, id).unwrap().phase == Phase::Retired
            || line(&v, id).unwrap().removal_work >= line(&v, id).unwrap().removal_labour()
        {
            return;
        }
        if !assign_target(&mut r, &v, id) {
            advance(&mut v, 0.);
            continue;
        }
        let point = approach(&v, id, r.id).unwrap();
        r.x = point[0];
        r.y = point[1];
        work(&mut v, &r, 0.75);
    }
    panic!("Dismantling did not finish")
}
#[test]
fn pumps_respect_pickup_and_receiver_reservations_owned_by_real_carriers() {
    let mut g = scene();
    let id = queued(&mut g);
    install_direct(&mut g, id);
    let world = g.app.world_mut();
    let mut r = world
        .query::<&Resident>()
        .iter(world)
        .next()
        .unwrap()
        .clone();
    let mut v = world.resource_mut::<Village>();
    empty_fresh(&mut v);
    water::add(&mut v, water::Owner::Camp, water::Class::Fresh, 40.);
    water::add(&mut v, water::Owner::Building(0), water::Class::Fresh, 20.);
    r.task = "water".into();
    r.remaining = 10.;
    water::advance(&mut v, &mut r, &[], 0.25);
    let trip = &v.water_supply.trips[0];
    assert_eq!(trip.to, line(&v, id).unwrap().anchors[1].endpoint);
    assert_eq!(trip.amount, 6.);
    let from = water::available(&v, water::Owner::Building(0), water::Class::Fresh);
    let energy = v.power.stored;
    pump_interval(&mut v, 60.);
    assert_eq!(
        water::available(&v, water::Owner::Building(1), water::Class::Fresh),
        0.
    );
    assert_eq!(
        water::available(&v, water::Owner::Building(0), water::Class::Fresh),
        from
    );
    assert_eq!(v.power.stored, energy);
}
#[test]
fn competing_pumps_use_player_priority_without_duplicating_the_source() {
    let mut g = scene();
    let home = add_ready(&mut g, "home", 18, 10);
    let first = queued(&mut g);
    install_direct(&mut g, first);
    power::fixtures::pump(&mut g.app.world_mut().resource_mut::<Village>(), first);
    assert_eq!(g.queue_water_connection("fresh", 0, home as i32), "ok");
    let second = g
        .app
        .world()
        .resource::<Village>()
        .pipes
        .lines
        .last()
        .unwrap()
        .id;
    install_direct(&mut g, second);
    power::fixtures::pump(&mut g.app.world_mut().resource_mut::<Village>(), second);
    assert_eq!(g.configure_water_connection(first.0, 0, false), "ok");
    assert_eq!(g.configure_water_connection(second.0, 3, false), "ok");
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        empty_fresh(&mut v);
        water::add(&mut v, water::Owner::Building(0), water::Class::Fresh, 1.);
        power::fixtures::charge(&mut v, 10.);
        pump_interval(&mut v, 10.);
        assert_eq!(
            water::available(&v, water::Owner::Building(home), water::Class::Fresh),
            1.
        );
        assert_eq!(
            water::available(&v, water::Owner::Building(1), water::Class::Fresh),
            0.
        );
        assert_eq!(water::total(&v, water::Class::Fresh), 1.);
    }
    checkpoint(&mut g);
}
#[test]
fn irrigation_lines_cannot_supply_a_kitchen_and_never_credit_fresh_water() {
    let mut g = scene();
    let wetland = add_ready(&mut g, "wetland", 12, 18);
    let garden = add_ready(&mut g, "garden", 18, 18);
    assert_ne!(
        g.queue_water_connection("irrigation", wetland as i32, 1),
        "ok"
    );
    assert_eq!(
        g.queue_water_connection("irrigation", wetland as i32, garden as i32),
        "ok"
    );
    let id = g.app.world().resource::<Village>().pipes.lines[0].id;
    install_direct(&mut g, id);
    power::fixtures::pump(&mut g.app.world_mut().resource_mut::<Village>(), id);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        water::add(
            &mut v,
            water::Owner::Building(wetland),
            water::Class::Irrigation,
            8.,
        );
        let before = v.water;
        pump_interval(&mut v, 20.);
        assert_eq!(
            water::available(&v, water::Owner::Building(garden), water::Class::Irrigation),
            4.
        );
        assert_eq!(v.water, before);
        assert_eq!(v.circular.reclaimed, 8.);
    }
    checkpoint(&mut g);
}
#[test]
fn removal_requires_corridor_work_and_recovers_a_defined_kit_once() {
    let mut g = scene();
    let id = queued(&mut g);
    install_direct(&mut g, id);
    let original = g.app.world().resource::<Village>().pipes.lines[0].kit;
    assert_eq!(g.remove_water_connection(id.0), "ok");
    assert_eq!(
        line(g.app.world().resource::<Village>(), id)
            .unwrap()
            .removal_work,
        0.
    );
    checkpoint(&mut g);
    let before = g
        .app
        .world()
        .resource::<Village>()
        .simulation
        .materials
        .as_ref()
        .unwrap()
        .received;
    dismantle_direct(&mut g, id);
    checkpoint(&mut g);
    let v = g.app.world().resource::<Village>();
    for i in 0..COUNT {
        let expected = if i == 14 {
            original[i]
        } else {
            original[i] / 2
        };
        assert_eq!(
            v.simulation.materials.as_ref().unwrap().received[i] - before[i],
            u64::from(expected)
        );
    }
    let raw = g.snapshot();
    assert_ne!(g.remove_water_connection(id.0), "ok");
    assert_eq!(g.snapshot(), raw);
    for _ in 0..100 {
        advance(&mut g.app.world_mut().resource_mut::<Village>(), 0.);
    }
    assert_eq!(g.snapshot(), raw);
}
#[test]
fn cancelling_before_installation_releases_owned_parts_without_a_salvage_grant() {
    let mut g = scene();
    let id = queued(&mut g);
    supplies(&mut g.app.world_mut().resource_mut::<Village>(), id);
    until(
        &mut g,
        |v| {
            v.logistics
                .as_ref()
                .unwrap()
                .shipments
                .iter()
                .any(|h| h.carrying)
        },
        "Kit is physically carried",
    );
    let before = g
        .app
        .world()
        .resource::<Village>()
        .simulation
        .materials
        .as_ref()
        .unwrap()
        .received;
    assert_eq!(g.remove_water_connection(id.0), "ok");
    checkpoint(&mut g);
    assert_eq!(
        g.app
            .world()
            .resource::<Village>()
            .simulation
            .materials
            .as_ref()
            .unwrap()
            .received,
        before
    );
    assert!(reconciled(&mut g));
}
fn reconciled(g: &mut Game) -> bool {
    let report: serde_json::Value = serde_json::from_str(&g.simulation_report()).unwrap();
    report["materials"]
        .as_array()
        .unwrap()
        .iter()
        .all(|m| m["difference"].as_f64() == Some(0.))
}
#[test]
fn moving_a_cistern_detaches_the_line_preserves_water_and_queues_a_replacement() {
    let mut g = scene();
    let id = queued(&mut g);
    install_direct(&mut g, id);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        empty_fresh(&mut v);
        water::add(&mut v, water::Owner::Building(0), water::Class::Fresh, 20.);
    }
    assert_eq!(g.queue_building_work(0, "move", 5, 24), "ok");
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        building_work::work(&mut v, 0, 24.);
        building_work::work(&mut v, 0, 36.);
        assert_eq!(line(&v, id).unwrap().phase, Phase::Removing);
        assert!(line(&v, id).unwrap().replacement);
        assert_eq!(water::total(&v, water::Class::Fresh), 20.);
    }
    checkpoint(&mut g);
    dismantle_direct(&mut g, id);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        building_work::work(&mut v, 0, 200.);
        advance(&mut v, 0.);
        assert!(
            v.pipes
                .lines
                .iter()
                .any(|p| p.id != id && p.phase == Phase::AwaitingInputs && p.anchors[0].y == 24)
        );
        assert_eq!(water::total(&v, water::Class::Fresh), 20.);
    }
    checkpoint(&mut g);
}
#[test]
fn dismantled_parts_wait_for_output_space_instead_of_overfilling_storage() {
    let mut g = scene();
    let id = queued(&mut g);
    install_direct(&mut g, id);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        let room = economy::capacity(&v) - economy::storage(&v);
        assert!(logistics::receive(&mut v, Owner::Camp, 2, room));
    }
    let receipts = g
        .app
        .world()
        .resource::<Village>()
        .simulation
        .materials
        .as_ref()
        .unwrap()
        .received;
    assert_eq!(g.remove_water_connection(id.0), "ok");
    dismantle_direct(&mut g, id);
    checkpoint(&mut g);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert_eq!(line(&v, id).unwrap().phase, Phase::Removing);
        assert!(!ready(&v, line(&v, id).unwrap()));
        assert_eq!(v.simulation.materials.as_ref().unwrap().received, receipts);
        let p = line(&v, id).unwrap();
        let returned = p
            .kit
            .iter()
            .enumerate()
            .map(|(i, &n)| if i == 14 { n } else { n / 2 })
            .sum::<u32>();
        logistics::spend(&mut v, Some(Owner::Camp), 2, returned);
        advance(&mut v, 0.);
        assert_eq!(line(&v, id).unwrap().phase, Phase::Retired);
        assert_eq!(
            v.simulation.materials.as_ref().unwrap().received[14],
            receipts[14] + 1
        );
    }
    checkpoint(&mut g);
    assert!(reconciled(&mut g));
}
#[test]
fn arrival_barrels_only_refill_for_housed_neighbours_when_an_active_line_uses_them() {
    let mut g = scene();
    let a = add_ready(&mut g, "home", 18, 10);
    add_ready(&mut g, "home", 18, 15);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        water::replenish(&mut v);
        water::draw(&mut v, water::Owner::Camp, water::Class::Fresh, 40.);
        assert!(!water::has_work(&v));
    }
    assert_eq!(g.queue_water_connection("fresh", -1, a as i32), "ok");
    let id = g.app.world().resource::<Village>().pipes.lines[0].id;
    install_direct(&mut g, id);
    {
        let v = g.app.world().resource::<Village>();
        assert!(uses_camp(v));
        assert!(water::has_work(v));
    }
    assert_eq!(g.configure_water_connection(id.0, 1, true), "ok");
    let v = g.app.world().resource::<Village>();
    assert!(!uses_camp(v));
    assert!(!water::has_work(v));
}

fn sanitation_scene() -> Game {
    let mut g = scene();
    g.app.world_mut().resource_mut::<Village>().mode = modes::Mode::Sandbox;
    for (kind, x, y) in [
        ("eco_toilet", 5, 11),
        ("biodigester", 12, 11),
        ("wetland", 18, 11),
        ("banana_treatment", 18, 18),
    ] {
        assert_eq!(g.place(kind, x, y), "ok");
    }
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.mode = modes::Mode::Story;
        v.circular.auto_feed = false;
        v.circular.banana_treatment = false;
        v.circular.filter_water = false;
    }
    g
}
#[test]
fn installed_sewage_lines_transfer_only_owned_sealed_contents_and_stop_without_power() {
    let mut g = sanitation_scene();
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        water::fixture_liquid(&mut v, water::Class::Sewage, 6.);
        water::fixture_at(&mut v, water::Owner::Building(3), water::Class::Sewage, 6.);
    }
    assert_eq!(g.queue_water_connection("sewage", 3, 4), "ok");
    let id = g.app.world().resource::<Village>().pipes.lines[0].id;
    install_direct(&mut g, id);
    power::fixtures::pump(&mut g.app.world_mut().resource_mut::<Village>(), id);
    checkpoint(&mut g);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        let fresh = v.water;
        v.minutes += 60.;
        pump_interval(&mut v, 60.);
        assert_eq!(
            water::local(&v, water::Owner::Building(3), water::Class::Sewage),
            0.
        );
        assert_eq!(
            water::local(&v, water::Owner::Building(4), water::Class::Sewage),
            6.
        );
        assert_eq!(v.water, fresh);
        assert_eq!(v.circular.reclaimed, 0.);
        assert_eq!(v.circular.biogas, 0.);
        assert_eq!(line(&v, id).unwrap().transferred, 6.);
        assert!((line(&v, id).unwrap().energy_used - 0.15).abs() < 0.00001);
        assert_eq!(
            water::produce(&mut v, water::Owner::Building(3), water::Class::Sewage, 2.),
            2.
        );
        power::fixtures::charge(&mut v, 0.);
        v.minutes += 60.;
        pump_interval(&mut v, 60.);
        assert_eq!(line(&v, id).unwrap().transferred, 6.);
    }
    checkpoint(&mut g);
    assert!(reconciled(&mut g));
}
#[test]
fn a_greywater_line_supplies_its_local_reed_bed_and_cannot_be_used_as_fresh_water() {
    let mut g = sanitation_scene();
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        water::fixture_liquid(&mut v, water::Class::Greywater, 12.);
        water::fixture_at(
            &mut v,
            water::Owner::Building(1),
            water::Class::Greywater,
            12.,
        );
    }
    assert_ne!(g.queue_water_connection("fresh", 1, 5), "ok");
    assert_eq!(g.queue_water_connection("greywater", 1, 5), "ok");
    let id = g.app.world().resource::<Village>().pipes.lines[0].id;
    install_direct(&mut g, id);
    power::fixtures::pump(&mut g.app.world_mut().resource_mut::<Village>(), id);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        let fresh = v.water;
        v.minutes += 60.;
        pump_interval(&mut v, 60.);
        assert_eq!(
            water::local(&v, water::Owner::Building(5), water::Class::Greywater),
            12.
        );
        assert_eq!(
            water::available(&v, water::Owner::Building(5), water::Class::Fresh),
            0.
        );
        v.circular.filter_water = true;
        processes::advance(&mut v, 0.);
        assert_eq!(processes::held_greywater(&v), 12.);
        v.minutes += 360.;
        processes::advance(&mut v, 360.);
        assert_eq!(v.circular.reclaimed, 8.);
        assert_eq!(v.circular.greywater, 0.);
        assert_eq!(v.water, fresh);
        assert_eq!(v.water_supply.consumed[2], 12.);
        assert_eq!(v.water_supply.received[1], 8.);
    }
    checkpoint(&mut g);
}

fn pump_interval(v: &mut Village, minutes: f32) {
    // A night interval isolates actual pumping from solar generation.
    if v.minutes < 1260. {
        v.minutes = 1260.;
    }
    v.minutes += minutes;
    power::advance(v, minutes);
    advance(v, minutes);
    power::finish_frame(v, minutes);
}

#[test]
fn pump_condition_counts_only_water_that_reaches_the_receiving_tank() {
    let mut g = scene();
    g.set_equipment_condition(true);
    let id = queued(&mut g);
    install_direct(&mut g, id);
    power::fixtures::pump(&mut g.app.world_mut().resource_mut::<Village>(), id);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        empty_fresh(&mut v);
        water::add(&mut v, water::Owner::Building(0), water::Class::Fresh, 20.);
        let node = v
            .power
            .network
            .nodes
            .iter()
            .find(|n| n.owner == electricity::Owner::Pump(id))
            .unwrap()
            .id;
        let key = maintenance::Equipment::Pump(node);
        let used = |v: &Village| {
            v.maintenance
                .records
                .iter()
                .find(|r| r.equipment == key)
                .unwrap()
                .use_units
        };
        assert_eq!(used(&v), 0.);
        power::advance(&mut v, 60.);
        advance(&mut v, 60.);
        power::finish_frame(&mut v, 60.);
        assert!(line(&v, id).unwrap().transferred > 0.);
        assert!((used(&v) - line(&v, id).unwrap().transferred).abs() < 1e-9);
        v.pipes
            .lines
            .iter_mut()
            .find(|p| p.id == id)
            .unwrap()
            .paused = true;
        let before = used(&v);
        power::advance(&mut v, 60.);
        advance(&mut v, 60.);
        power::finish_frame(&mut v, 60.);
        assert_eq!(used(&v), before);
    }
    checkpoint(&mut g);
}
