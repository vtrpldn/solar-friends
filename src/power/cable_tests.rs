use super::*;
use crate::electricity::{Kind as NodeKind, Owner};
fn scene() -> Game {
    scene_with(&[])
}
fn scene_with(extra: &[(&str, i32, i32)]) -> Game {
    let mut g = Game::new();
    g.start_fixture_mode("sandbox");
    for (kind, x, y) in [
        ("solar_farm", 5, 5),
        ("streetlight", 12, 5),
        ("home", 18, 5),
    ]
    .into_iter()
    .chain(extra.iter().copied())
    {
        assert_eq!(g.place(kind, x, y), "ok");
    }
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.mode = modes::Mode::Story;
        v.arrived = true;
        v.minutes = 540.;
        v.economy.money = 2000000;
        v.economy.outside_jobs.fill(false);
        v.progress.completed.fill(true);
        v.progress.later_completed.fill(true);
        v.progress.use_tools = false;
        v.production.targets[economy::MEALS] = 0;
        for i in 0..economy::COUNT {
            logistics::fixture_stock(&mut v, i, 0);
        }
        logistics::fixture_stock(&mut v, economy::FOOD, 60);
        logistics::fixture_stock(&mut v, economy::MEALS, 12);
        for n in &mut v.power.network.nodes {
            n.charge = match n.kind {
                NodeKind::Solar => 10.,
                NodeKind::Roof => 2.,
                _ => 0.,
            };
        }
        v.power.network.account.opening = 12.;
        network::summaries(&mut v);
    }
    let world = g.app.world_mut();
    for mut r in world.query::<&mut Resident>().iter_mut(world) {
        r.task = "idle".into();
        r.trip = None;
        r.help = None;
        r.remaining = 0.;
        r.requested = false;
        r.energy = 90.;
        r.hunger = 0.;
        r.social = 90.;
        r.last_meal_slot = 0;
        r.activity_building = None;
        r.activity_material = None;
        r.activity_batch = None;
        r.activity_store = None;
        r.x = CAMP.0 + (r.id as f32 - 2.) * 1.25;
        r.y = CAMP.1;
        r.target_x = r.x;
        r.target_y = r.y;
        r.walking = walking::State::default();
    }
    g
}
fn id(g: &Game, building: usize) -> u32 {
    network::node(
        g.app.world().resource::<Village>(),
        Owner::Building(building),
    )
    .unwrap()
    .id
    .0
}
fn check(g: &mut Game) {
    let raw = g.snapshot();
    let v = g.app.world().resource::<Village>();
    assert!(valid(v));
    assert!(pipes::valid(v), "{}", pipes::view(v));
    assert!(
        simulation::view(v)["materials"]
            .as_array()
            .unwrap()
            .iter()
            .all(|m| m["difference"].as_f64() == Some(0.))
    );
    let mut h = Game::new();
    assert!(h.restore(&raw));
    assert_eq!(h.snapshot(), raw);
}
fn until(g: &mut Game, goal: impl Fn(&Village) -> bool, label: &str) {
    for _ in 0..8 * 1920 {
        if goal(g.app.world().resource::<Village>()) {
            return;
        }
        g.tick(0.25);
    }
    panic!("{label}: {}", g.electricity_report());
}
pub(super) fn install(g: &mut Game, from: u32, to: u32) -> simulation::Id {
    let before = g.snapshot();
    let quote: serde_json::Value =
        serde_json::from_str(&g.electrical_connection_quote(from, to)).unwrap();
    assert_eq!(quote["allowed"], true, "{quote}");
    assert_eq!(g.snapshot(), before);
    assert_eq!(quote["parts"][9], 0);
    assert_eq!(quote["parts"][14], 0);
    assert_eq!(g.queue_electrical_connection(from, to), "ok");
    let line = g
        .app
        .world()
        .resource::<Village>()
        .pipes
        .lines
        .last()
        .unwrap()
        .id;
    check(g);
    let raw = g.snapshot();
    assert_ne!(g.queue_electrical_connection(to, from), "ok");
    assert_eq!(g.snapshot(), raw);
    finish_installation(g, line, &quote["parts"]);
    line
}
fn finish_installation(g: &mut Game, line: simulation::Id, parts: &serde_json::Value) {
    let mut ordered = false;
    for _ in 0..2 * 1920 {
        if g.order_supplies_pickup(&parts.to_string(), 4) == "ok" {
            ordered = true;
            break;
        }
        g.tick(0.25);
    }
    assert!(ordered, "A resident must be able to collect this kit");
    until(
        g,
        |v| {
            v.logistics.as_ref().unwrap().shipments.iter().any(|h| {
                h.carrying
                    && v.logistics
                        .as_ref()
                        .unwrap()
                        .stores
                        .iter()
                        .any(|p| p.id == h.to && p.owner == logistics::Owner::Utility(line))
            })
        },
        "Resident carries paid cable parts",
    );
    check(g);
    until(
        g,
        |v| pipes::line(v, line).unwrap().phase == pipes::Phase::Installing,
        "Resident begins laying the cable",
    );
    check(g);
    until(
        g,
        |v| pipes::line(v, line).unwrap().phase == pipes::Phase::Active,
        "Resident commissions the complete corridor",
    );
    check(g);
}
#[test]
fn paid_cable_work_commissions_local_lighting_and_dismantling_recovers_parts_once() {
    let mut g = scene();
    let from = id(&g, 0);
    let to = id(&g, 1);
    let line = install(&mut g, from, to);
    until(
        &mut g,
        |v| {
            v.minutes.rem_euclid(1440.) >= 1260.
                && pipes::line(v, line).unwrap().transferred > 0.
                && v.progress.night_lights
        },
        "Actual connected evening lighting",
    );
    check(&mut g);
    {
        let v = g.app.world().resource::<Village>();
        let p = pipes::line(v, line).unwrap();
        assert!(p.transferred > 0.);
        assert_eq!(p.energy_used, 0.);
        assert!(
            supply(v)
                .connections
                .iter()
                .find(|c| c.id == 1)
                .unwrap()
                .connected
        );
    }
    assert!(g.set_power_enabled(1, false));
    let before = network::node(g.app.world().resource::<Village>(), Owner::Building(0))
        .unwrap()
        .charge;
    for _ in 0..80 {
        g.tick(0.25);
    }
    let after = network::node(g.app.world().resource::<Village>(), Owner::Building(0))
        .unwrap()
        .charge;
    assert!((before - after).abs() < 0.0001);
    let c = supply(g.app.world().resource::<Village>())
        .connections
        .into_iter()
        .find(|c| c.id == 1)
        .unwrap();
    assert!(c.connected);
    assert!(!c.enabled);
    assert_eq!(c.light_level, 0.);
    assert!(g.set_power_enabled(1, true));
    assert_eq!(g.configure_electrical_connection(line.0, 3, true), "ok");
    let flow = pipes::line(g.app.world().resource::<Village>(), line)
        .unwrap()
        .transferred;
    for _ in 0..80 {
        g.tick(0.25);
    }
    assert_eq!(
        pipes::line(g.app.world().resource::<Village>(), line)
            .unwrap()
            .transferred,
        flow
    );
    assert_eq!(
        supply(g.app.world().resource::<Village>())
            .connections
            .iter()
            .find(|c| c.id == 1)
            .unwrap()
            .light_level,
        0.
    );
    check(&mut g);
    assert_eq!(g.configure_electrical_connection(line.0, 3, false), "ok");
    let before = g
        .app
        .world()
        .resource::<Village>()
        .simulation
        .materials
        .as_ref()
        .unwrap()
        .received;
    let kit = pipes::line(g.app.world().resource::<Village>(), line)
        .unwrap()
        .kit;
    assert_eq!(g.remove_electrical_connection(line.0), "ok");
    until(
        &mut g,
        |v| pipes::line(v, line).unwrap().phase == pipes::Phase::Retired,
        "Actual cable dismantling",
    );
    check(&mut g);
    let v = g.app.world().resource::<Village>();
    for i in [8, 10] {
        assert_eq!(
            v.simulation.materials.as_ref().unwrap().received[i] - before[i],
            u64::from(kit[i] / 2)
        );
    }
    let raw = g.snapshot();
    assert_ne!(g.remove_electrical_connection(line.0), "ok");
    assert_eq!(g.snapshot(), raw);
}
#[test]
fn roof_ports_and_forged_cables_cannot_bypass_electrical_ownership() {
    let mut g = scene();
    let from = id(&g, 0);
    let private = id(&g, 2);
    assert_ne!(g.queue_electrical_connection(from, private), "ok");
    let to = id(&g, 1);
    assert_eq!(g.queue_electrical_connection(from, to), "ok");
    check(&mut g);
    let raw = g.snapshot();
    for key in ["endpoint", "kind", "kit"] {
        let mut bad: serde_json::Value = serde_json::from_str(&raw).unwrap();
        match key {
            "endpoint" => {
                bad["village"]["pipes"]["lines"][0]["anchors"][1]["endpoint"] = private.into()
            }
            "kind" => bad["village"]["pipes"]["lines"][0]["plan"]["kind"] = "fresh".into(),
            _ => bad["village"]["pipes"]["lines"][0]["kit"][14] = 1.into(),
        }
        assert!(!g.restore(&bad.to_string()));
        assert_eq!(g.snapshot(), raw);
    }
}

#[test]
fn a_resident_installed_cable_supplies_only_its_own_water_pump() {
    let mut g = scene_with(&[("well", 5, 12), ("kitchen", 12, 12)]);
    let quote: serde_json::Value =
        serde_json::from_str(&g.water_connection_quote("fresh", 3, 4)).unwrap();
    assert_eq!(quote["allowed"], true);
    assert_eq!(g.queue_water_connection("fresh", 3, 4), "ok");
    let liquid = g
        .app
        .world()
        .resource::<Village>()
        .pipes
        .lines
        .last()
        .unwrap()
        .id;
    finish_installation(&mut g, liquid, &quote["parts"]);
    let cooked = g.app.world().resource::<Village>().supplies.meals_cooked;
    let reply = g.request(2, "cook", true);
    assert!(reply.contains("lend a hand"), "{reply}");
    until(
        &mut g,
        |v| v.supplies.meals_cooked > cooked,
        "A real pot creates receiving room",
    );
    {
        let v = g.app.world().resource::<Village>();
        assert!(water::local_room(v, water::Owner::Building(4), water::Class::Fresh) > 0.);
        assert_eq!(pipes::line(v, liquid).unwrap().transferred, 0.);
        assert!(!pump_connected(v, liquid));
        assert!(v.power.stored > 0.);
    }
    let from = id(&g, 0);
    let pump = network::node(g.app.world().resource::<Village>(), Owner::Pump(liquid))
        .unwrap()
        .id
        .0;
    let cable = install(&mut g, from, pump);
    until(
        &mut g,
        |v| pipes::line(v, liquid).unwrap().transferred > 0.,
        "Connected pump spends circuit energy on real water flow",
    );
    check(&mut g);
    {
        let v = g.app.world().resource::<Village>();
        let p = pipes::line(v, liquid).unwrap();
        let wire = pipes::line(v, cable).unwrap();
        assert!((p.energy_used - p.transferred * pipes::ENERGY_PER_WATER).abs() < 0.0001);
        assert!((wire.transferred - p.energy_used).abs() < 0.0001);
        assert!(pump_connected(v, liquid));
    }
    assert_eq!(g.configure_electrical_connection(cable.0, 1, true), "ok");
    let transferred = pipes::line(g.app.world().resource::<Village>(), liquid)
        .unwrap()
        .transferred;
    for _ in 0..80 {
        g.tick(0.25);
    }
    let v = g.app.world().resource::<Village>();
    assert_eq!(pipes::line(v, liquid).unwrap().transferred, transferred);
    assert!(!pump_connected(v, liquid));
    check(&mut g);
}

#[test]
fn relocating_a_cistern_preserves_the_pump_port_and_requires_real_route_reinstallation() {
    let mut g = scene_with(&[("well", 5, 12), ("kitchen", 12, 12)]);
    let quote: serde_json::Value =
        serde_json::from_str(&g.water_connection_quote("fresh", 3, 4)).unwrap();
    assert_eq!(g.queue_water_connection("fresh", 3, 4), "ok");
    let liquid = g
        .app
        .world()
        .resource::<Village>()
        .pipes
        .lines
        .last()
        .unwrap()
        .id;
    finish_installation(&mut g, liquid, &quote["parts"]);
    let pump = network::node(g.app.world().resource::<Village>(), Owner::Pump(liquid))
        .unwrap()
        .id
        .0;
    let source = id(&g, 0);
    let cable = install(&mut g, source, pump);
    assert_eq!(g.queue_building_work(3, "move", 5, 18), "ok");
    until(
        &mut g,
        |v| {
            v.pipes.lines.iter().any(|p| {
                p.id != liquid
                    && p.plan.kind == utilities::Kind::Fresh
                    && p.plan.from == 3
                    && p.plan.to == 4
            })
        },
        "Resident removes the old route and a new water route is planned",
    );
    let replacement = g
        .app
        .world()
        .resource::<Village>()
        .pipes
        .lines
        .iter()
        .find(|p| {
            p.id != liquid
                && p.plan.kind == utilities::Kind::Fresh
                && p.plan.from == 3
                && p.plan.to == 4
        })
        .unwrap()
        .id;
    {
        let v = g.app.world().resource::<Village>();
        assert_eq!(
            network::node(v, Owner::Pump(replacement)).unwrap().id.0,
            pump
        );
        assert!(network::node(v, Owner::Pump(liquid)).is_none());
        assert!(!pump_connected(v, replacement));
        assert_eq!(pipes::line(v, liquid).unwrap().phase, pipes::Phase::Retired);
        assert!(matches!(
            pipes::line(v, cable).unwrap().phase,
            pipes::Phase::Removing | pipes::Phase::Retired
        ));
    }
    check(&mut g);
    until(
        &mut g,
        |v| {
            v.pipes.lines.iter().any(|p| {
                p.id != cable
                    && p.plan.kind == utilities::Kind::Electricity
                    && p.plan.to == i64::from(pump)
            })
        },
        "Electrical reconnection is planned at the moved pump",
    );
    let next_cable = g
        .app
        .world()
        .resource::<Village>()
        .pipes
        .lines
        .iter()
        .find(|p| {
            p.id != cable
                && p.plan.kind == utilities::Kind::Electricity
                && p.plan.to == i64::from(pump)
        })
        .unwrap()
        .id;
    for route in [replacement, next_cable] {
        let material: serde_json::Value = serde_json::to_value(
            pipes::line(g.app.world().resource::<Village>(), route)
                .unwrap()
                .kit,
        )
        .unwrap();
        let mut ordered = false;
        for _ in 0..2 * 1920 {
            if g.order_supplies_pickup(&material.to_string(), 4) == "ok" {
                ordered = true;
                break;
            }
            g.tick(0.25);
        }
        assert!(ordered);
    }
    check(&mut g);
    until(
        &mut g,
        |v| {
            pipes::line(v, replacement).unwrap().phase == pipes::Phase::Active
                && pipes::line(v, next_cable).unwrap().phase == pipes::Phase::Active
        },
        "Residents install and commission replacement water and electrical routes",
    );
    let v = g.app.world().resource::<Village>();
    assert!(pump_connected(v, replacement));
    assert_eq!(
        network::node(v, Owner::Pump(replacement)).unwrap().id.0,
        pump
    );
    assert!(pipes::line(v, next_cable).unwrap().spent.is_some());
    check(&mut g);
}
