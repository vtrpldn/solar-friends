use super::*;
fn scene() -> Game {
    let mut g = Game::new();
    assert!(g.start_mode("sandbox"));
    assert_eq!(g.place("workshop", 6, 6), "ok");
    assert_eq!(g.place("solar_farm", 12, 6), "ok");
    g.tick(0.25);
    g
}
fn checkpoint(g: &mut Game) {
    let raw = g.snapshot();
    let mut copy = Game::new();
    assert!(copy.restore(&raw));
    assert_eq!(copy.snapshot(), raw);
}
fn condition(g: &Game, key: Equipment) -> f64 {
    g.app
        .world()
        .resource::<Village>()
        .maintenance
        .records
        .iter()
        .find(|r| r.equipment == key)
        .unwrap()
        .condition
}
#[test]
fn reports_are_read_only_and_condition_is_staged_until_repairs_are_available() {
    let mut g = scene();
    let before = g.snapshot();
    let report: serde_json::Value = serde_json::from_str(&g.maintenance_report()).unwrap();
    assert_eq!(g.snapshot(), before);
    assert_eq!(report["enabled"], false);
    assert_eq!(report["operating_penalties_active"], false);
    assert_eq!(report["equipment"].as_array().unwrap().len(), 3);
    g.tick(60.);
    assert!(
        g.app
            .world()
            .resource::<Village>()
            .maintenance
            .records
            .is_empty()
    );
}
#[test]
fn exposure_and_actual_use_accumulate_and_toggling_never_resets_wear() {
    let mut g = scene();
    g.set_equipment_condition(true);
    let key = Equipment::Workshop(0);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.minutes += 60.;
        advance(&mut v, 60.);
        used(&mut v, key, 20.);
    }
    assert!(condition(&g, key) < 99.93);
    let worn = condition(&g, key);
    g.set_equipment_condition(false);
    g.tick(20.);
    assert_eq!(condition(&g, key), worn);
    g.set_equipment_condition(true);
    assert_eq!(condition(&g, key), worn);
    checkpoint(&mut g);
}
#[test]
fn invalid_usage_cannot_restore_condition_or_poison_a_valid_save() {
    let mut g = scene();
    g.set_equipment_condition(true);
    let before = g.snapshot();
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        for n in [-1., 0., f64::NAN, f64::INFINITY, f64::MAX] {
            used(&mut v, Equipment::Truck, n);
        }
        used(&mut v, Equipment::Workshop(999), 40.);
        pump_used(&mut v, Id(999), 40.);
    }
    assert_eq!(g.snapshot(), before);
    checkpoint(&mut g);
}
#[test]
fn duplicate_dangling_future_and_invalid_condition_records_reject_atomically() {
    let mut g = scene();
    g.set_equipment_condition(true);
    let raw = g.snapshot();
    let original: serde_json::Value = serde_json::from_str(&raw).unwrap();
    for (field, value) in [
        ("condition", serde_json::json!(-0.1)),
        ("condition", serde_json::json!(100.1)),
        ("use_units", serde_json::json!(-1)),
        ("commissioned", serde_json::json!(1e8)),
        ("equipment", serde_json::json!({"kind":"workshop","id":999})),
    ] {
        let mut bad = original.clone();
        bad["village"]["maintenance"]["records"][0][field] = value;
        assert!(!g.restore(&bad.to_string()), "{field}");
        assert_eq!(g.snapshot(), raw);
    }
    let mut unknown_schema = original.clone();
    unknown_schema["village"]["maintenance"]["schema"] = 2.into();
    assert!(!g.restore(&unknown_schema.to_string()));
    assert_eq!(g.snapshot(), raw);
    let mut missing = original.clone();
    missing["village"]["maintenance"]["records"]
        .as_array_mut()
        .unwrap()
        .pop();
    assert!(!g.restore(&missing.to_string()));
    assert_eq!(g.snapshot(), raw);
    let mut bad = original;
    let row = bad["village"]["maintenance"]["records"][0].clone();
    bad["village"]["maintenance"]["records"]
        .as_array_mut()
        .unwrap()
        .push(row);
    assert!(!g.restore(&bad.to_string()));
    assert_eq!(g.snapshot(), raw);
}
#[test]
fn owned_battery_movement_and_charge_keep_the_same_worn_record() {
    let mut g = scene();
    g.set_equipment_condition(true);
    let mut v = g.app.world_mut().resource_mut::<Village>();
    let id = v
        .power
        .network
        .nodes
        .iter()
        .find(|n| n.capacity > 0.)
        .unwrap()
        .id;
    let key = Equipment::Battery(id);
    used(&mut v, key, 100.);
    let before = v
        .maintenance
        .records
        .iter()
        .find(|r| r.equipment == key)
        .unwrap()
        .condition;
    let n = v
        .power
        .network
        .nodes
        .iter_mut()
        .find(|n| n.id == id)
        .unwrap();
    n.owner = electricity::Owner::Ground;
    n.kind = electricity::Kind::Battery;
    n.x = 20;
    n.y = 20;
    let charge = n.charge;
    sync(&mut v);
    assert_eq!(
        v.maintenance
            .records
            .iter()
            .find(|r| r.equipment == key)
            .unwrap()
            .condition,
        before
    );
    assert_eq!(
        v.power
            .network
            .nodes
            .iter()
            .find(|n| n.id == id)
            .unwrap()
            .charge,
        charge
    );
    assert!(valid(&v));
}
#[test]
fn equipment_removal_reconciles_even_while_condition_is_disabled() {
    let mut g = scene();
    g.set_equipment_condition(true);
    g.set_equipment_condition(false);
    let mut v = g.app.world_mut().resource_mut::<Village>();
    v.buildings.retain(|b| b.kind != "workshop");
    sync(&mut v);
    assert!(
        !v.maintenance
            .records
            .iter()
            .any(|r| matches!(r.equipment, Equipment::Workshop(_)))
    );
    assert!(valid(&v));
}
#[test]
fn exact_reload_preserves_future_weather_wear_and_real_charge_changes() {
    let mut g = scene();
    g.set_equipment_condition(true);
    let before = g.snapshot();
    let mut copy = Game::new();
    assert!(copy.restore(&before));
    for _ in 0..80 {
        g.tick(0.25);
        copy.tick(0.25);
    }
    assert_eq!(g.snapshot(), copy.snapshot());
    assert!(
        g.app
            .world()
            .resource::<Village>()
            .maintenance
            .records
            .iter()
            .any(|r| matches!(r.equipment, Equipment::Battery(_)) && r.use_units > 0.)
    );
    checkpoint(&mut g);
}
#[test]
fn service_warning_precedes_failure_and_use_never_deletes_owned_energy() {
    assert_eq!(factor(100.), 1.);
    assert_eq!(factor(SERVICE_AT), 1.);
    assert!((0.5..1.).contains(&factor(40.)));
    assert_eq!(factor(FAILURE_AT), 0.);
    let mut g = scene();
    g.set_equipment_condition(true);
    let mut v = g.app.world_mut().resource_mut::<Village>();
    let n = v
        .power
        .network
        .nodes
        .iter()
        .find(|n| n.capacity > 0.)
        .unwrap();
    let key = Equipment::Battery(n.id);
    let energy = n.charge;
    used(&mut v, key, 1e6);
    assert_eq!(
        v.maintenance
            .records
            .iter()
            .find(|r| r.equipment == key)
            .unwrap()
            .condition,
        0.
    );
    assert_eq!(
        v.power
            .network
            .nodes
            .iter()
            .find(|n| Equipment::Battery(n.id) == key)
            .unwrap()
            .charge,
        energy
    );
}

#[test]
fn new_equipment_can_be_saved_immediately_after_free_placement() {
    let mut g = scene();
    g.set_equipment_condition(true);
    assert_eq!(g.place("workshop", 18, 6), "ok");
    checkpoint(&mut g);
    assert_eq!(g.place("home", 18, 12), "ok");
    checkpoint(&mut g);
    g.tick(0.25);
    checkpoint(&mut g);
}

#[test]
fn automatic_service_books_once_and_explicit_cancellation_defers_rebooking() {
    let mut g = scene();
    g.set_equipment_condition(true);
    g.set_automatic_service(true);
    g.app
        .world_mut()
        .resource_mut::<Village>()
        .maintenance
        .records
        .iter_mut()
        .find(|r| r.equipment == Equipment::Workshop(0))
        .unwrap()
        .condition = 69.;
    g.tick(0.25);
    let id = g.app.world().resource::<Village>().maintenance.jobs[0].id;
    assert!(g.cancel_equipment_service(id.0));
    for _ in 0..20 {
        g.tick(0.25);
    }
    assert!(
        g.app
            .world()
            .resource::<Village>()
            .maintenance
            .jobs
            .iter()
            .all(|j| !j.active())
    );
    checkpoint(&mut g);
    assert_eq!(
        g.queue_equipment_service("{\"kind\":\"workshop\",\"id\":0}"),
        "ok"
    );
    assert!(
        !g.app
            .world()
            .resource::<Village>()
            .maintenance
            .records
            .iter()
            .find(|r| r.equipment == Equipment::Workshop(0))
            .unwrap()
            .automatic_deferred
    );
    checkpoint(&mut g);
}
