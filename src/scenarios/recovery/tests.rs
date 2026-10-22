use super::*;
fn definition() -> Definition {
    let mut d = Definition::builtin(modes::Mode::Sandbox);
    d.rules.logistics = true;
    d.rules.land = true;
    d.start.buildings[0].material_recovery = Policy::Recipe;
    d
}
fn compiled(d: Definition) -> Game {
    compile(d)
        .unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()))
        .0
}
#[test]
fn inherited_fabric_is_not_loose_stock_purchase_or_construction_credit() {
    let d = definition();
    let mut g = compiled(d.clone());
    let v = g.app.world().resource::<Village>();
    let id = v.scenario.as_ref().unwrap().buildings[&d.start.buildings[0].id];
    let expected = materials("shed", "standard").map(|n| n / 2);
    assert_eq!(building_work::salvage(v, id), expected);
    assert_eq!(expected[0], 4);
    assert_eq!(expected[7], 3);
    assert!(
        v.economy
            .projects
            .iter()
            .all(|p| p.consumed.iter().all(|n| *n == 0))
    );
    let ledger = v.simulation.materials.as_ref().unwrap();
    assert!(ledger.received.iter().all(|n| *n == 0));
    assert!(ledger.spent.iter().all(|n| *n == 0));
    assert_eq!(v.buildings.iter().find(|b| b.id == id).unwrap().visits, 0);
    let before = g.snapshot();
    assert!(g.restore(&before));
    assert_eq!(g.snapshot(), before);
    let mut unknown = d;
    unknown.start.buildings[0].material_recovery = Policy::None;
    let g = compiled(unknown);
    assert_eq!(
        building_work::salvage(g.app.world().resource::<Village>(), id),
        [0; economy::COUNT]
    );
}
#[test]
fn native_recipe_catalog_excludes_equipment_tools_food_and_living_inputs() {
    for kind in progression::BUILDINGS {
        for recipe in ["standard", "local", "adobe"] {
            let Some(stages) = economy::recipe(kind, recipe) else {
                continue;
            };
            let mut total = [0; economy::COUNT];
            for s in stages {
                for (i, n) in s.items.into_iter().enumerate() {
                    total[i] += n;
                }
            }
            let embedded = materials(kind, recipe);
            for i in 0..economy::COUNT {
                assert_eq!(embedded[i], if i <= 12 { total[i] } else { 0 });
            }
            let catalog = catalog(kind);
            for (name, n) in catalog[recipe].as_object().unwrap() {
                let i = economy::NAMES.iter().position(|k| *k == name).unwrap();
                assert_eq!(n.as_u64().unwrap(), u64::from(embedded[i] / 2));
            }
        }
    }
}
#[test]
fn blueprint_policy_and_unknown_policy_are_rejected_without_mutating_the_current_world() {
    let mut d = definition();
    let mut g = compiled(d.clone());
    let before = g.snapshot();
    d.start.buildings[0].state = BuildingState::Blueprint;
    let report: serde_json::Value =
        serde_json::from_str(&g.load_scenario(&serde_json::to_string(&d).unwrap())).unwrap();
    assert_eq!(report["ok"], false);
    assert_eq!(report["issues"][0]["entity"], d.start.buildings[0].id);
    assert_eq!(g.snapshot(), before);
    let mut bad = serde_json::to_value(definition()).unwrap();
    bad["start"]["buildings"][0]["material_recovery"] = "unlimited".into();
    let report: serde_json::Value =
        serde_json::from_str(&g.load_scenario(&bad.to_string())).unwrap();
    assert_eq!(report["ok"], false);
    assert_eq!(g.snapshot(), before);
}
#[test]
fn actual_move_then_salvage_preserves_identity_and_recovers_only_once_after_resident_work() {
    let d = definition();
    let mut g = compiled(d.clone());
    let v = g.app.world().resource::<Village>();
    let id = v.scenario.as_ref().unwrap().buildings[&d.start.buildings[0].id];
    let returns = building_work::salvage(v, id);
    let received = v.simulation.materials.as_ref().unwrap().received;
    assert_eq!(g.queue_building_work(id, "move", 25, 25), "ok");
    for _ in 0..8000 {
        g.tick(0.25);
        if building_work::job(g.app.world().resource::<Village>(), id).is_none() {
            break;
        }
    }
    let v = g.app.world().resource::<Village>();
    let b = v.buildings.iter().find(|b| b.id == id).unwrap();
    assert_eq!((b.x, b.y, b.progress), (25, 25, 100.));
    assert_eq!(building_work::salvage(v, id), returns);
    assert_eq!(v.simulation.materials.as_ref().unwrap().received, received);
    let moved = g.snapshot();
    assert!(g.restore(&moved));
    assert_eq!(g.snapshot(), moved);
    assert_eq!(g.queue_building_work(id, "salvage", 0, 0), "ok");
    let queued = g.snapshot();
    assert!(g.restore(&queued));
    assert_eq!(g.snapshot(), queued);
    for _ in 0..8000 {
        g.tick(0.25);
        if !g
            .app
            .world()
            .resource::<Village>()
            .buildings
            .iter()
            .any(|b| b.id == id)
        {
            break;
        }
    }
    let v = g.app.world().resource::<Village>();
    assert!(!v.buildings.iter().any(|b| b.id == id));
    for i in [0, 7] {
        assert_eq!(
            v.simulation.materials.as_ref().unwrap().received[i] - received[i],
            u64::from(returns[i])
        );
        assert_eq!(v.simulation.materials.as_ref().unwrap().spent[i], 0);
    }
    assert_eq!(building_work::salvage(v, id), [0; economy::COUNT]);
    assert_ne!(g.queue_building_work(id, "salvage", 0, 0), "ok");
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
}
#[test]
fn demolition_does_not_return_inherited_materials_and_ownership_does_not_bind_future_ids() {
    let mut g = compiled(definition());
    let v = g.app.world().resource::<Village>();
    let id = v.buildings.iter().find(|b| b.kind == "shed").unwrap().id;
    assert_eq!(g.queue_building_work(id, "demolish", 0, 0), "ok");
    for _ in 0..8000 {
        g.tick(0.25);
        if !g
            .app
            .world()
            .resource::<Village>()
            .buildings
            .iter()
            .any(|b| b.id == id)
        {
            break;
        }
    }
    let v = g.app.world().resource::<Village>();
    assert!(!v.buildings.iter().any(|b| b.id == id));
    assert_eq!(owned(v, v.economy.next_building), [0; economy::COUNT]);
    assert_eq!(v.simulation.materials.as_ref().unwrap().received[0], 0);
    assert_eq!(v.simulation.materials.as_ref().unwrap().received[7], 0);
    let save = g.snapshot();
    assert!(g.restore(&save));
    assert_eq!(g.snapshot(), save);
}
#[test]
fn overlapping_receipts_do_not_duplicate_fabric_and_battery_hardware_stays_separate() {
    let mut d = definition();
    let b = &mut d.start.buildings[0];
    b.kind = "home".into();
    b.battery = Some(super::super::batteries::BuildingBank {
        charge: 2.,
        owned: true,
    });
    let mut g = compiled(d);
    let v = g.app.world().resource::<Village>();
    let id = v.buildings.iter().find(|b| b.kind == "home").unwrap().id;
    let expected = building_work::salvage(v, id);
    assert_eq!(expected[13], 0);
    assert_eq!(v.power.opening_equipment, 1);
    assert_eq!(owned(v, id)[13], 0);
    let before = g.snapshot();
    assert!(g.restore(&before));
    assert_eq!(g.snapshot(), before);
    // Both descriptions refer to the same structure, not two material grants.
    let mut v = g.app.world().resource::<Village>().clone();
    let mut paid = [0; economy::COUNT];
    for s in economy::recipe("home", "standard").unwrap() {
        for (i, n) in s.items.into_iter().enumerate() {
            paid[i] += n;
        }
    }
    v.economy
        .projects
        .iter_mut()
        .find(|p| p.building == id)
        .unwrap()
        .consumed = paid;
    assert_eq!(building_work::salvage(&v, id), expected);
}
#[test]
fn resident_salvage_leaves_one_owned_battery_without_duplicating_it_as_structure_stock() {
    let mut d = definition();
    let b = &mut d.start.buildings[0];
    b.kind = "home".into();
    b.battery = Some(super::super::batteries::BuildingBank {
        charge: 2.,
        owned: true,
    });
    let mut g = compiled(d);
    let v = g.app.world().resource::<Village>();
    let home = v.buildings.iter().find(|b| b.kind == "home").unwrap().id;
    let bank = v
        .power
        .network
        .nodes
        .iter()
        .find(|n| n.owner == electricity::Owner::Building(home))
        .unwrap()
        .id;
    let returned = building_work::salvage(v, home);
    assert_eq!(g.queue_building_work(home, "salvage", 0, 0), "ok");
    let queued = g.snapshot();
    assert!(g.restore(&queued));
    assert_eq!(g.snapshot(), queued);
    for _ in 0..8000 {
        g.tick(0.25);
        if !g
            .app
            .world()
            .resource::<Village>()
            .buildings
            .iter()
            .any(|b| b.id == home)
        {
            break;
        }
    }
    let v = g.app.world().resource::<Village>();
    assert!(!v.buildings.iter().any(|b| b.id == home));
    let recovered = v.power.network.nodes.iter().find(|n| n.id == bank).unwrap();
    assert_eq!(recovered.owner, electricity::Owner::Ground);
    assert_eq!(recovered.equipment, 1);
    assert_eq!(recovered.charge, 2.);
    assert_eq!(v.simulation.materials.as_ref().unwrap().received[13], 0);
    assert_eq!(
        v.simulation.materials.as_ref().unwrap().received[2],
        u64::from(returned[2])
    );
    assert_eq!(v.simulation.materials.as_ref().unwrap().spent[2], 0);
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
}
