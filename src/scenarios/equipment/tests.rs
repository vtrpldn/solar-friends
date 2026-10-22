use super::*;
fn definition() -> Definition {
    let mut d = Definition::builtin(modes::Mode::Sandbox);
    d.rules.logistics = true;
    d.rules.land = true;
    d.rules.utilities = true;
    d.rules.maintenance = true;
    d.start.automatic_service = Some(false);
    for (id, kind, x, y) in [
        ("home", "home", 25, 25),
        ("shop", "workshop", 22, 25),
        ("solar", "solar_farm", 28, 25),
        ("well", "well", 25, 28),
        ("kitchen", "kitchen", 22, 28),
    ] {
        let mut b = d.start.buildings[0].clone();
        b.id = id.into();
        b.kind = kind.into();
        b.x = x;
        b.y = y;
        d.start.buildings.push(b);
    }
    d.start.batteries.push(super::super::batteries::GroundBank {
        id: "bank".into(),
        x: 27,
        y: 29,
        capacity: 18.,
        charge: 5.,
    });
    let (g, _) =
        compile(d.clone()).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
    let p: serde_json::Value = serde_json::from_str(&g.scenario_route_preview(
        &serde_json::to_string(&d).unwrap(),
        "fresh",
        r#"{"kind":"building","id":"well"}"#,
        r#"{"kind":"building","id":"kitchen"}"#,
    ))
    .unwrap();
    assert_eq!(p["allowed"], true);
    d.start.routes.push(super::super::routes::Route {
        id: "pipe".into(),
        kind: utilities::Kind::Fresh,
        from: super::super::routes::Endpoint::Building("well".into()),
        to: super::super::routes::Endpoint::Building("kitchen".into()),
        state: BuildingState::Completed,
        cells: serde_json::from_value(p["cells"].clone()).unwrap(),
    });
    d.start.equipment = vec![
        (Asset::Truck, 0.),
        (Asset::Workshop("shop".into()), 40.),
        (Asset::BuildingBattery("home".into()), 15.),
        (Asset::BuildingBattery("solar".into()), 60.),
        (Asset::Battery("bank".into()), 30.),
        (Asset::Pump("pipe".into()), 5.),
    ]
    .into_iter()
    .map(|(asset, condition)| StartingCondition {
        asset,
        condition,
        defer_automatic: false,
    })
    .collect();
    d
}
#[test]
fn every_supported_opening_asset_has_exact_condition_without_use_damage_or_repair_credit() {
    let d = definition();
    let (mut g, _) =
        compile(d.clone()).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
    let v = g.app.world().resource::<Village>();
    assert!(!v.maintenance.automatic);
    assert!(v.maintenance.jobs.is_empty());
    for c in &d.start.equipment {
        let e = resolve(v, &c.asset).unwrap();
        let r = v
            .maintenance
            .records
            .iter()
            .find(|r| r.equipment == e)
            .unwrap();
        assert_eq!(r.condition, c.condition);
        assert_eq!(r.commissioned, d.start.minutes);
        assert_eq!(r.use_units, 0.);
        assert_eq!(r.exposure_minutes, 0.);
        assert_eq!(
            maintenance::performance(v, e),
            maintenance::factor(c.condition)
        );
    }
    assert!(
        v.simulation
            .materials
            .as_ref()
            .unwrap()
            .spent
            .iter()
            .all(|n| *n == 0)
    );
    assert!(
        v.simulation
            .materials
            .as_ref()
            .unwrap()
            .received
            .iter()
            .all(|n| *n == 0)
    );
    assert_eq!(v.power.network.account.opening, 9.);
    let before = g.snapshot();
    let preview: serde_json::Value =
        serde_json::from_str(&g.scenario_equipment(&serde_json::to_string(&d).unwrap())).unwrap();
    assert_eq!(preview["allowed"], true);
    assert_eq!(preview["equipment"].as_array().unwrap().len(), 6);
    assert_eq!(g.snapshot(), before);
    assert!(g.restore(&before));
    assert_eq!(g.snapshot(), before);
}
#[test]
fn dormant_conditions_are_retained_without_penalties_or_wear_and_deferred_assets_do_not_auto_queue()
{
    let mut d = definition();
    d.rules.maintenance = false;
    d.start.automatic_service = Some(true);
    let (mut g, _) =
        compile(d.clone()).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
    let before = g
        .app
        .world()
        .resource::<Village>()
        .maintenance
        .records
        .clone();
    for _ in 0..40 {
        g.tick(0.25);
    }
    let v = g.app.world().resource::<Village>();
    assert!(v.maintenance.jobs.is_empty());
    for r in &v.maintenance.records {
        assert_eq!(
            r.condition,
            before
                .iter()
                .find(|p| p.equipment == r.equipment)
                .unwrap()
                .condition
        );
        assert_eq!(maintenance::performance(v, r.equipment), 1.);
    }
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
    d.rules.maintenance = true;
    for c in &mut d.start.equipment {
        c.defer_automatic = true;
    }
    let (mut g, _) =
        compile(d).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
    for _ in 0..20 {
        g.tick(0.25);
    }
    assert!(
        g.app
            .world()
            .resource::<Village>()
            .maintenance
            .jobs
            .is_empty()
    );
}
#[test]
fn invalid_missing_duplicate_and_unfinished_asset_conditions_are_atomic() {
    let d = definition();
    let (mut g, _) =
        compile(d.clone()).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
    let saved = g.snapshot();
    for mutation in 0..7 {
        let mut bad = d.clone();
        match mutation {
            0 => bad.start.equipment[0].condition = 101.,
            1 => bad.start.equipment[0].condition = -1.,
            2 => bad.start.equipment[0].asset = Asset::Battery("unknown".into()),
            3 => bad.start.equipment.push(bad.start.equipment[0].clone()),
            4 => {
                bad.start
                    .buildings
                    .iter_mut()
                    .find(|b| b.id == "shop")
                    .unwrap()
                    .state = BuildingState::Blueprint
            }
            5 => bad.start.routes[0].state = BuildingState::Blueprint,
            _ => bad.start.equipment[0].asset = Asset::BuildingBattery("kitchen".into()),
        };
        let result: serde_json::Value =
            serde_json::from_str(&g.load_scenario(&serde_json::to_string(&bad).unwrap())).unwrap();
        assert_eq!(result["ok"], false);
        assert_eq!(g.snapshot(), saved);
    }
}
#[test]
fn actual_residents_repair_inherited_failure_using_real_parts_and_attended_service() {
    let mut d = definition();
    d.start
        .equipment
        .retain(|c| matches!(c.asset, Asset::Truck));
    let (mut g, _) =
        compile(d).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
    assert_eq!(g.queue_equipment_service(r#"{"kind":"truck"}"#), "ok");
    for _ in 0..8000 {
        g.tick(0.25);
        if g.app
            .world()
            .resource::<Village>()
            .maintenance
            .jobs
            .iter()
            .any(|j| j.finished.is_some())
        {
            break;
        }
    }
    let v = g.app.world().resource::<Village>();
    let j = v
        .maintenance
        .jobs
        .iter()
        .find(|j| j.equipment == Equipment::Truck)
        .unwrap();
    assert!(j.finished.is_some());
    assert!(!j.cancelled);
    assert!(j.spent.is_some());
    assert!(j.work >= j.labour());
    assert!(
        v.maintenance
            .records
            .iter()
            .find(|r| r.equipment == Equipment::Truck)
            .unwrap()
            .condition
            > 99.
    );
    for (i, n) in j.kit().iter().enumerate() {
        assert!(v.simulation.materials.as_ref().unwrap().spent[i] >= u64::from(*n));
    }
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
}
