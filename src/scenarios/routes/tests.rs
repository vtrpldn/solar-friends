use super::*;
fn definition() -> Definition {
    let mut d = Definition::builtin(modes::Mode::Sandbox);
    d.rules.logistics = true;
    d.rules.land = true;
    d.rules.utilities = true;
    d.rules.maintenance = true;
    for (id, kind, x, y) in [
        ("kitchen", "kitchen", 25, 25),
        ("well", "well", 25, 28),
        ("wetland", "wetland", 22, 25),
        ("toilet", "eco_toilet", 20, 28),
        ("banana", "banana_treatment", 20, 25),
        ("garden", "garden", 25, 22),
        ("solar", "solar_farm", 28, 25),
    ] {
        let mut b = d.start.buildings[0].clone();
        b.id = id.into();
        b.kind = kind.into();
        b.x = x;
        b.y = y;
        b.battery = None;
        d.start.buildings.push(b);
    }
    d
}
fn add(
    d: &mut Definition,
    id: &str,
    kind: Kind,
    from: Endpoint,
    to: Endpoint,
    state: BuildingState,
) {
    let (mut g, _) =
        compile(d.clone()).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
    let raw = serde_json::to_string(d).unwrap();
    let before = g.snapshot();
    let p: serde_json::Value = serde_json::from_str(&g.scenario_route_preview(
        &raw,
        match kind {
            Kind::Fresh => "fresh",
            Kind::Irrigation => "irrigation",
            Kind::Greywater => "greywater",
            Kind::Sewage => "sewage",
            Kind::Electricity => "electricity",
        },
        &serde_json::to_string(&from).unwrap(),
        &serde_json::to_string(&to).unwrap(),
    ))
    .unwrap();
    assert_eq!(p["allowed"], true, "{p}");
    assert_eq!(g.snapshot(), before);
    d.start.routes.push(Route {
        id: id.into(),
        kind,
        from,
        to,
        state,
        cells: serde_json::from_value(p["cells"].clone()).unwrap(),
    });
}
fn building(id: &str) -> Endpoint {
    Endpoint::Building(id.into())
}
#[test]
fn authored_routes_bind_real_ports_own_opening_kits_without_spend_and_restore_exactly() {
    let mut d = definition();
    for (id, kind, from, to) in [
        ("fresh", Kind::Fresh, building("well"), building("kitchen")),
        (
            "grey",
            Kind::Greywater,
            building("kitchen"),
            building("wetland"),
        ),
        (
            "reuse",
            Kind::Irrigation,
            building("wetland"),
            building("garden"),
        ),
        (
            "sealed",
            Kind::Sewage,
            building("toilet"),
            building("banana"),
        ),
    ] {
        add(&mut d, id, kind, from, to, BuildingState::Completed);
    }
    // A cable can be listed before the liquid route that creates its pump.
    add(
        &mut d,
        "cable",
        Kind::Electricity,
        building("solar"),
        Endpoint::Pump("fresh".into()),
        BuildingState::Completed,
    );
    d.start.routes.rotate_right(1);
    let (mut g, _) =
        compile(d.clone()).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
    let v = g.app.world().resource::<Village>();
    assert_eq!(v.pipes.lines.len(), 5);
    assert_eq!(v.scenario.as_ref().unwrap().routes.len(), 5);
    assert!(v.pipes.lines.iter().all(|p| p.phase == pipes::Phase::Active
        && p.spent.is_none()
        && p.transferred == 0.
        && p.energy_used == 0.
        && pipes::needs(v, p.id) == [0; economy::COUNT]));
    assert!(
        v.simulation
            .materials
            .as_ref()
            .unwrap()
            .received
            .iter()
            .all(|n| *n == 0)
    );
    assert!(
        v.simulation
            .materials
            .as_ref()
            .unwrap()
            .spent
            .iter()
            .all(|n| *n == 0)
    );
    let stores = &v.logistics.as_ref().unwrap().stores;
    for line in &v.pipes.lines {
        let store = stores
            .iter()
            .find(|s| s.owner == logistics::Owner::Utility(line.id))
            .unwrap();
        assert!(store.items.iter().all(|n| *n == 0));
        assert!(
            !v.logistics
                .as_ref()
                .unwrap()
                .shipments
                .iter()
                .any(|h| h.to == store.id)
        );
    }
    assert_eq!(v.power.network.account.generated, 0.);
    assert!(
        v.maintenance
            .records
            .iter()
            .any(|r| matches!(r.equipment, maintenance::Equipment::Pump(_)))
    );
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
    for _ in 0..40 {
        g.tick(0.25);
    }
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
}
#[test]
fn planned_route_requires_real_parts_and_resident_work_without_opening_ownership() {
    let mut d = definition();
    add(
        &mut d,
        "new-pipe",
        Kind::Fresh,
        building("well"),
        building("kitchen"),
        BuildingState::Blueprint,
    );
    let (mut g, _) =
        compile(d).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
    let v = g.app.world().resource::<Village>();
    let p = &v.pipes.lines[0];
    assert_eq!(p.phase, pipes::Phase::AwaitingInputs);
    assert!(!owns(v, p.id));
    assert_eq!(pipes::needs(v, p.id), p.kit);
    assert_eq!(p.work, 0.);
    assert_eq!(p.transferred, 0.);
    let id = p.id;
    let kit = p.kit;
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
    for _ in 0..6000 {
        g.tick(0.25);
        if pipes::line(g.app.world().resource::<Village>(), id)
            .unwrap()
            .phase
            == pipes::Phase::Active
        {
            break;
        }
    }
    let v = g.app.world().resource::<Village>();
    let p = pipes::line(v, id).unwrap();
    assert_eq!(p.phase, pipes::Phase::Active);
    assert!(p.spent.is_some());
    assert!(!owns(v, id));
    for (i, n) in kit.iter().enumerate() {
        assert!(v.simulation.materials.as_ref().unwrap().spent[i] >= u64::from(*n));
    }
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
}
#[test]
fn invalid_port_corridor_identity_class_and_binding_reject_atomically() {
    let mut d = definition();
    add(
        &mut d,
        "pipe",
        Kind::Fresh,
        building("well"),
        building("kitchen"),
        BuildingState::Completed,
    );
    let (mut g, _) =
        compile(d.clone()).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
    let before = g.snapshot();
    for change in 0..8 {
        let mut bad = d.clone();
        let r = &mut bad.start.routes[0];
        match change {
            0 => r.cells[0] = [25, 28],
            1 => r.cells.push(r.cells[0]),
            2 => r.cells[0] = [63, 63],
            3 => r.kind = Kind::Sewage,
            4 => r.from = Endpoint::Battery("missing".into()),
            5 => r.cells[0] = [32, 32],
            6 => r.to = r.from.clone(),
            _ => {
                let copy = r.clone();
                bad.start.routes.push(copy)
            }
        };
        let report: serde_json::Value =
            serde_json::from_str(&g.load_scenario(&serde_json::to_string(&bad).unwrap())).unwrap();
        assert_eq!(report["ok"], false);
        assert_eq!(g.snapshot(), before);
    }
    let mut save: serde_json::Value = serde_json::from_str(&before).unwrap();
    // Save shape is checked below through its actual serialized village field.
    let village = save.get_mut("village").unwrap();
    village["scenario"]["routes"]["pipe"] = serde_json::json!(1);
    assert!(!g.restore(&save.to_string()));
    assert_eq!(g.snapshot(), before);
}

#[test]
fn starting_pump_moves_real_water_spends_real_energy_and_residents_recover_the_kit_once() {
    let mut d = definition();
    d.start.fresh_water = 10.;
    d.start.liquids = Some(vec![StartingLiquids {
        owner: InventoryOwner::Building("well".into()),
        contents: [("fresh".into(), 10.)].into_iter().collect(),
    }]);
    d.start.batteries.push(super::super::batteries::GroundBank {
        id: "charged-bank".into(),
        x: 27,
        y: 29,
        capacity: 18.,
        charge: 5.,
    });
    add(
        &mut d,
        "water-line",
        Kind::Fresh,
        building("well"),
        building("kitchen"),
        BuildingState::Completed,
    );
    add(
        &mut d,
        "powered-pump",
        Kind::Electricity,
        Endpoint::Battery("charged-bank".into()),
        Endpoint::Pump("water-line".into()),
        BuildingState::Completed,
    );
    let (mut g, _) =
        compile(d).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
    let id = g
        .app
        .world()
        .resource::<Village>()
        .scenario
        .as_ref()
        .unwrap()
        .routes["water-line"];
    for _ in 0..60 {
        g.tick(0.25);
    }
    let v = g.app.world().resource::<Village>();
    let p = pipes::line(v, id).unwrap();
    assert!(p.transferred > 0.);
    assert!((p.energy_used - p.transferred * pipes::ENERGY_PER_WATER).abs() < 0.00001);
    assert!(v.power.network.account.consumed > 0.);
    assert_eq!(v.power.network.account.opening, 5.);
    let kit = p.kit;
    let before = v.simulation.materials.as_ref().unwrap().received;
    assert_eq!(g.remove_water_connection(id.0), "ok");
    for _ in 0..6000 {
        g.tick(0.25);
        if pipes::line(g.app.world().resource::<Village>(), id)
            .unwrap()
            .phase
            == pipes::Phase::Retired
        {
            break;
        }
    }
    let v = g.app.world().resource::<Village>();
    let p = pipes::line(v, id).unwrap();
    assert_eq!(p.phase, pipes::Phase::Retired);
    assert!(p.removal_work >= p.removal_labour());
    for i in [8, 9, 10, 14] {
        let n = if i == 14 { kit[i] } else { kit[i] / 2 };
        assert_eq!(
            v.simulation.materials.as_ref().unwrap().received[i] - before[i],
            u64::from(n)
        );
        assert_eq!(v.simulation.materials.as_ref().unwrap().spent[i], 0);
    }
    assert_ne!(g.remove_water_connection(id.0), "ok");
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
    for _ in 0..40 {
        g.tick(0.25);
    }
    let v = g.app.world().resource::<Village>();
    for i in [8, 9, 10, 14] {
        assert_eq!(
            v.simulation.materials.as_ref().unwrap().received[i] - before[i],
            u64::from(if i == 14 { kit[i] } else { kit[i] / 2 })
        );
    }
}

#[test]
fn authored_detours_are_preserved_and_do_not_get_replaced_by_shortest_previews() {
    let mut d = definition();
    d.start.routes.push(Route {
        id: "around-the-clearing".into(),
        kind: Kind::Fresh,
        from: building("well"),
        to: building("kitchen"),
        state: BuildingState::Completed,
        cells: vec![[26, 28], [26, 27], [26, 26], [26, 25]],
    });
    let (mut g, _) =
        compile(d.clone()).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
    let v = g.app.world().resource::<Village>();
    assert_eq!(v.pipes.lines[0].plan.cells, d.start.routes[0].cells);
    assert_eq!(v.pipes.lines[0].kit[9], 3);
    let before = g.snapshot();
    let endpoints: serde_json::Value = serde_json::from_str(
        &g.scenario_utility_endpoints(&serde_json::to_string(&d).unwrap(), "fresh"),
    )
    .unwrap();
    assert_eq!(endpoints["allowed"], true);
    assert_eq!(g.snapshot(), before);
    assert!(g.restore(&before));
    assert_eq!(g.snapshot(), before);
}
