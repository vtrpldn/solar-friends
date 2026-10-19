use super::*;
use jobs::{assign_target, job, ready, work};
use logistics::Owner;
fn scene() -> Game {
    let mut g = Game::new();
    g.start_mode("sandbox");
    for (kind, x, y) in [("workshop", 6, 6), ("solar_farm", 12, 6), ("home", 8, 16)] {
        assert_eq!(g.place(kind, x, y), "ok");
    }
    g.tick(0.25);
    g.set_equipment_condition(true);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.mode = modes::Mode::Story;
        v.minutes = 540.;
        v.arrived = true;
        v.progress.completed.fill(true);
        v.progress.later_completed.fill(true);
        for i in [4, 8, 9, 10, economy::TOOLS] {
            logistics::fixture_stock(&mut v, i, 0);
        }
        logistics::fixture_stock(&mut v, economy::FOOD, 40);
        logistics::fixture_stock(&mut v, economy::MEALS, 12);
    }
    g.set_outside_work(false);
    let world = g.app.world_mut();
    for mut r in world.query::<&mut Resident>().iter_mut(world) {
        r.task = "idle".into();
        r.remaining = 0.;
        r.trip = None;
        r.requested = false;
        r.activity_store = None;
        r.activity_material = None;
        r.activity_batch = None;
        r.activity_building = None;
        r.energy = 90.;
        r.hunger = 10.;
        r.social = 90.;
        r.x = CAMP.0 + r.id as f32 * 0.8;
        r.y = CAMP.1;
        r.target_x = r.x;
        r.target_y = r.y;
        r.walking = walking::State::default();
    }
    g
}
fn queued(g: &mut Game, key: Equipment) -> Id {
    g.app
        .world_mut()
        .resource_mut::<Village>()
        .maintenance
        .records
        .iter_mut()
        .find(|r| r.equipment == key)
        .unwrap()
        .condition = 40.;
    assert_eq!(
        g.queue_equipment_service(&serde_json::to_string(&key).unwrap()),
        "ok"
    );
    g.app
        .world()
        .resource::<Village>()
        .maintenance
        .jobs
        .last()
        .unwrap()
        .id
}
fn stock(g: &mut Game, id: Id, deliver: bool) {
    let mut v = g.app.world_mut().resource_mut::<Village>();
    let kit = job(&v, id).unwrap().kit();
    for (i, n) in kit.into_iter().enumerate() {
        if n > 0 {
            assert!(logistics::receive(&mut v, Owner::Camp, i, n));
            if deliver {
                organics::fixture_transfer(&mut v, Owner::Maintenance(id), i, n);
            }
        }
    }
}
fn worker(g: &mut Game, id: Id) -> Resident {
    let world = g.app.world_mut();
    let mut r = world
        .query::<&Resident>()
        .iter(world)
        .next()
        .unwrap()
        .clone();
    assert!(assign_target(&mut r, world.resource::<Village>(), id));
    [r.x, r.y] = [r.target_x, r.target_y];
    r
}
fn checkpoint(g: &mut Game) {
    let raw = g.snapshot();
    let mut copy = Game::new();
    assert!(copy.restore(&raw), "{}", g.maintenance_report());
    assert_eq!(copy.snapshot(), raw);
    let v = g.app.world().resource::<Village>();
    assert!(
        simulation::view(v)["materials"]
            .as_array()
            .unwrap()
            .iter()
            .all(|m| m["difference"] == 0.)
    );
}
#[test]
fn service_requires_local_parts_attendance_and_community_hours() {
    let mut g = scene();
    let id = queued(&mut g, Equipment::Workshop(0));
    stock(&mut g, id, false);
    assert!(!ready(
        g.app.world().resource::<Village>(),
        job(g.app.world().resource::<Village>(), id).unwrap()
    ));
    checkpoint(&mut g);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        let kit = job(&v, id).unwrap().kit();
        for (i, n) in kit.into_iter().enumerate() {
            if n > 0 {
                organics::fixture_transfer(&mut v, Owner::Maintenance(id), i, n);
            }
        }
    }
    let mut r = worker(&mut g, id);
    let mut v = g.app.world_mut().resource_mut::<Village>();
    let before = v.simulation.materials.as_ref().unwrap().spent;
    r.x += 1.;
    assert!(!work(&mut v, &r, 5.));
    r.x = r.target_x;
    v.minutes = 800.;
    assert!(!work(&mut v, &r, 5.));
    v.minutes = 900.;
    assert!(!work(&mut v, &r, f32::NAN));
    assert_eq!(v.simulation.materials.as_ref().unwrap().spent, before);
    assert_eq!(job(&v, id).unwrap().work, 0.);
}
#[test]
fn partial_service_uses_one_kit_and_survives_pause_save_and_resume() {
    let mut g = scene();
    let id = queued(&mut g, Equipment::Workshop(0));
    stock(&mut g, id, true);
    let r = worker(&mut g, id);
    let initial = g
        .app
        .world()
        .resource::<Village>()
        .simulation
        .materials
        .as_ref()
        .unwrap()
        .spent;
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(!work(&mut v, &r, 6.));
        assert_eq!(
            v.maintenance
                .records
                .iter()
                .find(|r| r.equipment == Equipment::Workshop(0))
                .unwrap()
                .condition,
            55.
        );
        assert_eq!(
            v.simulation.materials.as_ref().unwrap().spent[8] - initial[8],
            1
        );
        assert_eq!(
            v.simulation.materials.as_ref().unwrap().spent[economy::TOOLS]
                - initial[economy::TOOLS],
            2
        );
    }
    assert!(g.configure_equipment_service(id.0, true));
    checkpoint(&mut g);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(!work(&mut v, &r, 6.));
        assert_eq!(job(&v, id).unwrap().work, 6.);
    }
    assert!(g.configure_equipment_service(id.0, false));
    let r = worker(&mut g, id);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(work(&mut v, &r, 30.));
        assert!(!work(&mut v, &r, 30.));
        assert_eq!(
            v.maintenance
                .records
                .iter()
                .find(|r| r.equipment == Equipment::Workshop(0))
                .unwrap()
                .condition,
            100.
        );
        assert_eq!(
            v.simulation.materials.as_ref().unwrap().spent[8] - initial[8],
            1
        );
        assert_eq!(
            v.simulation.materials.as_ref().unwrap().spent[economy::TOOLS]
                - initial[economy::TOOLS],
            2
        );
    }
    checkpoint(&mut g);
}
#[test]
fn cancellation_recovers_unused_parts_but_keeps_partial_improvements_and_spending() {
    let mut g = scene();
    let key = Equipment::Workshop(0);
    let id = queued(&mut g, key);
    stock(&mut g, id, true);
    let before = g
        .app
        .world()
        .resource::<Village>()
        .simulation
        .materials
        .as_ref()
        .unwrap()
        .spent;
    assert!(g.cancel_equipment_service(id.0));
    assert!(!g.cancel_equipment_service(id.0));
    assert_eq!(
        g.app
            .world()
            .resource::<Village>()
            .simulation
            .materials
            .as_ref()
            .unwrap()
            .spent,
        before
    );
    checkpoint(&mut g);
    let id = queued(&mut g, key);
    stock(&mut g, id, true);
    let r = worker(&mut g, id);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(!work(&mut v, &r, 6.));
    }
    assert!(g.cancel_equipment_service(id.0));
    let v = g.app.world().resource::<Village>();
    assert_eq!(
        v.maintenance
            .records
            .iter()
            .find(|r| r.equipment == key)
            .unwrap()
            .condition,
        55.
    );
    assert_eq!(
        v.simulation.materials.as_ref().unwrap().spent[8] - before[8],
        1
    );
    assert_eq!(
        v.simulation.materials.as_ref().unwrap().spent[economy::TOOLS] - before[economy::TOOLS],
        2
    );
    checkpoint(&mut g);
}
#[test]
fn real_neighbours_haul_parts_and_complete_service_through_the_shared_queue() {
    let mut g = scene();
    let id = queued(&mut g, Equipment::Workshop(0));
    stock(&mut g, id, false);
    let mut carrying = false;
    let mut attended = false;
    let mut did_pause = false;
    for tick in 0..5 * 1920 {
        g.tick(0.25);
        let v = g.app.world().resource::<Village>();
        let j = job(v, id).unwrap();
        carrying |= v.logistics.as_ref().unwrap().shipments.iter().any(|h| {
            h.carrying
                && v.logistics
                    .as_ref()
                    .unwrap()
                    .stores
                    .iter()
                    .any(|p| p.id == h.to && p.owner == Owner::Maintenance(id))
        });
        attended |= j.work > 0.;
        if j.work > 0. && j.active() && !did_pause {
            let progress = j.work;
            assert!(g.configure_equipment_service(id.0, true));
            checkpoint(&mut g);
            g.tick(2.);
            assert_eq!(
                job(g.app.world().resource::<Village>(), id).unwrap().work,
                progress
            );
            assert!(g.configure_equipment_service(id.0, false));
            did_pause = true;
            continue;
        }
        if !j.active() {
            assert!(!j.cancelled);
            assert!(carrying && attended && did_pause);
            checkpoint(&mut g);
            return;
        }
        if tick % 500 == 0 {
            checkpoint(&mut g);
        }
    }
    panic!("service did not finish: {}", g.maintenance_report());
}
#[test]
fn a_closing_workshop_cancels_service_and_leaves_delivered_parts_recoverable() {
    let mut g = scene();
    let id = queued(&mut g, Equipment::Workshop(0));
    stock(&mut g, id, true);
    let before = g.app.world().resource::<Village>().economy.stock;
    assert_eq!(g.queue_building_work(0, "move", 18, 18), "ok");
    let v = g.app.world().resource::<Village>();
    assert!(job(v, id).unwrap().cancelled);
    assert_eq!(v.economy.stock, before);
    assert!(
        v.logistics
            .as_ref()
            .unwrap()
            .stores
            .iter()
            .any(|p| p.owner == Owner::Ground && p.items[8] == 1 && p.items[economy::TOOLS] == 2)
    );
    checkpoint(&mut g);
}
#[test]
fn cancelling_a_service_delivery_preserves_carried_parts_and_exact_saves() {
    let mut g = scene();
    let id = queued(&mut g, Equipment::Workshop(0));
    stock(&mut g, id, false);
    for _ in 0..2 * 1920 {
        g.tick(0.25);
        let v = g.app.world().resource::<Village>();
        if v.logistics.as_ref().unwrap().shipments.iter().any(|h| {
            h.carrying
                && v.logistics
                    .as_ref()
                    .unwrap()
                    .stores
                    .iter()
                    .any(|p| p.id == h.to && p.owner == Owner::Maintenance(id))
        }) {
            let before = v.economy.stock;
            assert!(g.cancel_equipment_service(id.0));
            checkpoint(&mut g);
            for _ in 0..400 {
                g.tick(0.25);
            }
            checkpoint(&mut g);
            let v = g.app.world().resource::<Village>();
            assert!(v.economy.stock[8] >= before[8]);
            assert!(v.economy.stock[economy::TOOLS] >= before[economy::TOOLS]);
            return;
        }
    }
    panic!("No service parcel was carried");
}
#[test]
fn truck_service_excludes_paid_pickups_until_the_job_is_finished_or_cancelled() {
    let mut g = scene();
    let id = queued(&mut g, Equipment::Truck);
    let before = g.snapshot();
    let mut bundle = [0; economy::COUNT];
    bundle[8] = 1;
    assert!(
        g.order_supplies_pickup(&serde_json::to_string(&bundle).unwrap(), 0)
            .contains("service")
    );
    assert_eq!(g.snapshot(), before);
    stock(&mut g, id, true);
    let r = worker(&mut g, id);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(work(&mut v, &r, 60.));
    }
    assert_eq!(
        g.order_supplies_pickup(&serde_json::to_string(&bundle).unwrap(), 0),
        "ok"
    );
    checkpoint(&mut g);
}
#[test]
fn corrupt_receipts_missing_stores_and_duplicate_equipment_orders_reject_atomically() {
    let mut g = scene();
    let id = queued(&mut g, Equipment::Workshop(0));
    stock(&mut g, id, true);
    let r = worker(&mut g, id);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(!work(&mut v, &r, 6.));
    }
    let raw = g.snapshot();
    let original: serde_json::Value = serde_json::from_str(&raw).unwrap();
    for (field, value) in [
        ("work", serde_json::json!(25.)),
        ("gain", serde_json::json!(-1)),
        ("spent", serde_json::Value::Null),
        ("anchor", serde_json::json!([20., 20.])),
        ("created", serde_json::json!(1e9)),
    ] {
        let mut bad = original.clone();
        bad["village"]["maintenance"]["jobs"][0][field] = value;
        assert!(!g.restore(&bad.to_string()), "{field}");
        assert_eq!(g.snapshot(), raw);
    }
    let mut missing = original.clone();
    missing["village"]["logistics"]["stores"]
        .as_array_mut()
        .unwrap()
        .retain(|p| p["owner"]["kind"] != "maintenance");
    assert!(!g.restore(&missing.to_string()));
    assert_eq!(g.snapshot(), raw);
    let mut bad = original.clone();
    bad["village"]["maintenance"]["jobs"][0]["spent"][8][1] = 9999.into();
    assert!(!g.restore(&bad.to_string()));
    assert_eq!(g.snapshot(), raw);
    let mut bad = original;
    let mut clone = bad["village"]["maintenance"]["jobs"][0].clone();
    clone["id"] = 1.into();
    bad["village"]["maintenance"]["jobs"]
        .as_array_mut()
        .unwrap()
        .push(clone);
    assert!(!g.restore(&bad.to_string()));
    assert_eq!(g.snapshot(), raw);
}

#[test]
fn spare_claims_and_healthy_or_duplicate_service_requests_are_atomic() {
    let mut g = scene();
    let before = g.snapshot();
    assert_ne!(g.queue_equipment_service("{\"kind\":\"truck\"}"), "ok");
    assert_eq!(g.snapshot(), before);
    let id = queued(&mut g, Equipment::Workshop(0));
    stock(&mut g, id, false);
    let before = g.snapshot();
    assert_ne!(
        g.queue_equipment_service("{\"kind\":\"workshop\",\"id\":0}"),
        "ok"
    );
    assert_eq!(g.snapshot(), before);
    assert_eq!(economy::free(g.app.world().resource::<Village>(), 8), 0);
    assert_eq!(
        economy::free(g.app.world().resource::<Village>(), economy::TOOLS),
        0
    );
    assert_ne!(g.sell_material(8, 1), "ok");
    assert_eq!(g.snapshot(), before);
    checkpoint(&mut g);
}
#[test]
fn a_river_generator_battery_receives_service_parts_from_its_safe_bank() {
    let mut g = scene();
    g.app.world_mut().resource_mut::<Village>().mode = modes::Mode::Sandbox;
    assert_eq!(g.place("hydro", 26, 5), "ok");
    g.app.world_mut().resource_mut::<Village>().mode = modes::Mode::Story;
    g.tick(0.25);
    let key = {
        let v = g.app.world().resource::<Village>();
        Equipment::Battery(
            v.power
                .network
                .nodes
                .iter()
                .find(|n| n.kind == electricity::Kind::Hydro)
                .unwrap()
                .id,
        )
    };
    let id = queued(&mut g, key);
    stock(&mut g, id, false);
    for tick in 0..5 * 1920 {
        g.tick(0.25);
        let v = g.app.world().resource::<Village>();
        if !job(v, id).unwrap().active() {
            assert!(!job(v, id).unwrap().cancelled);
            checkpoint(&mut g);
            return;
        }
        if tick % 500 == 0 {
            checkpoint(&mut g);
        }
    }
    panic!("River service did not finish: {}", g.maintenance_report());
}
#[test]
fn private_roof_batteries_use_their_own_service_kit_without_losing_charge() {
    let mut g = scene();
    let key = {
        let v = g.app.world().resource::<Village>();
        Equipment::Battery(
            v.power
                .network
                .nodes
                .iter()
                .find(|n| n.kind == electricity::Kind::Roof)
                .unwrap()
                .id,
        )
    };
    let id = queued(&mut g, key);
    stock(&mut g, id, true);
    let r = worker(&mut g, id);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        let before = v.power.network.clone();
        assert!(work(&mut v, &r, 40.));
        assert_eq!(
            serde_json::to_string(&v.power.network).unwrap(),
            serde_json::to_string(&before).unwrap()
        );
    }
    checkpoint(&mut g);
}

#[test]
fn disabling_condition_cancels_service_without_refunding_used_parts_or_healing_the_unit() {
    let mut g = scene();
    let id = queued(&mut g, Equipment::Workshop(0));
    stock(&mut g, id, true);
    let r = worker(&mut g, id);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(!work(&mut v, &r, 6.));
    }
    let spent = g
        .app
        .world()
        .resource::<Village>()
        .simulation
        .materials
        .as_ref()
        .unwrap()
        .spent;
    g.set_equipment_condition(false);
    assert!(
        job(g.app.world().resource::<Village>(), id)
            .unwrap()
            .cancelled
    );
    checkpoint(&mut g);
    g.set_equipment_condition(true);
    let v = g.app.world().resource::<Village>();
    assert_eq!(
        v.maintenance
            .records
            .iter()
            .find(|r| r.equipment == Equipment::Workshop(0))
            .unwrap()
            .condition,
        55.
    );
    assert_eq!(v.simulation.materials.as_ref().unwrap().spent, spent);
    checkpoint(&mut g);
}
