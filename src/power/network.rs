//! Village ownership and lifecycle around the electrical flow model.
use super::*;
use crate::electricity::{self, Id, Kind as NodeKind, Node, Owner, State, Wire};

fn building_kind(kind: &str) -> Option<(NodeKind, f64)> {
    match kind {
        "solar_farm" => Some((NodeKind::Solar, 36.)),
        "hydro" => Some((NodeKind::Hydro, 18.)),
        "home" => Some((NodeKind::Roof, 4.)),
        k if load(k) > 0. => Some((NodeKind::Consumer, 0.)),
        _ => None,
    }
}
fn wanted(v: &Village) -> Vec<(Owner, NodeKind, i32, i32, i32, f64)> {
    let mut nodes: Vec<_> = v
        .buildings
        .iter()
        .filter(|b| b.progress >= 100. || building_work::original_progress(v, b.id) == Some(100.))
        .filter_map(|b| {
            building_kind(&b.kind).map(|(kind, capacity)| {
                (
                    Owner::Building(b.id),
                    kind,
                    b.x,
                    b.y,
                    interactions::footprint_size(&b.kind),
                    capacity,
                )
            })
        })
        .collect();
    nodes.extend(
        v.pipes
            .lines
            .iter()
            .filter(|p| (p.live() || p.replacement) && p.plan.kind != utilities::Kind::Electricity)
            .map(|p| {
                (
                    Owner::Pump(p.id),
                    NodeKind::Pump,
                    p.plan.cells[0][0],
                    p.plan.cells[0][1],
                    1,
                    0.,
                )
            }),
    );
    nodes
}
pub fn stored(v: &Village) -> f64 {
    v.power
        .network
        .nodes
        .iter()
        .filter(|n| n.kind != NodeKind::Roof)
        .map(|n| n.charge)
        .sum()
}
pub fn capacity(v: &Village) -> f64 {
    v.power
        .network
        .nodes
        .iter()
        .filter(|n| n.kind != NodeKind::Roof)
        .map(|n| n.capacity)
        .sum()
}
pub fn summaries(v: &mut Village) {
    v.power.stored = stored(v) as f32;
}
pub(crate) fn replace_pump(v: &mut Village, previous: Id, next: Id) {
    let Some(n) = v
        .power
        .network
        .nodes
        .iter_mut()
        .find(|n| n.owner == Owner::Pump(previous))
    else {
        return;
    };
    let cell = v
        .pipes
        .lines
        .iter()
        .find(|p| p.id == next)
        .unwrap()
        .plan
        .cells[0];
    n.owner = Owner::Pump(next);
    n.x = cell[0];
    n.y = cell[1];
    if let Some(f) = &mut v.power.frame {
        f.relocate_pump(n.id, n.owner, n.x, n.y);
    }
}
pub fn sync(v: &mut Village) {
    if v.version == 3 || v.power.frame.is_some() {
        return;
    }
    let wanted = wanted(v);
    let detached: Vec<_> = v
        .power
        .network
        .nodes
        .iter()
        .filter(|n| {
            n.capacity > 0.
                && matches!(n.owner, Owner::Building(_))
                && !wanted.iter().any(|d| d.0 == n.owner)
        })
        .cloned()
        .collect();
    let mut recovery = vec![];
    if !detached.is_empty() {
        let mut placement = v.clone();
        for n in detached {
            if let Some(p) = batteries::recovery_location(&placement, &n) {
                recovery.push((n.id, p));
                let reserved = placement
                    .power
                    .network
                    .nodes
                    .iter_mut()
                    .find(|b| b.id == n.id)
                    .unwrap();
                reserved.owner = Owner::Ground;
                reserved.kind = NodeKind::Battery;
                reserved.size = 1;
                [reserved.x, reserved.y] = p;
            }
        }
    }
    let nodes = &mut v.power.network.nodes;
    nodes.retain_mut(|n| {
        if matches!(n.owner, Owner::Ground | Owner::Carrier(_)) {
            return true;
        }
        if let Some(&(_, kind, x, y, size, capacity)) = wanted.iter().find(|d| d.0 == n.owner) {
            n.kind = kind;
            n.x = x;
            n.y = y;
            n.size = size;
            n.capacity = capacity;
            return true;
        }
        if n.capacity > 0. {
            if let Some((_, p)) = recovery.iter().find(|(id, _)| *id == n.id) {
                n.x = p[0];
                n.y = p[1];
            }
            n.owner = Owner::Ground;
            n.kind = NodeKind::Battery;
            n.size = 1;
            true
        } else {
            false
        }
    });
    for (owner, kind, x, y, size, capacity) in wanted {
        if v.power.network.nodes.iter().any(|n| n.owner == owner) {
            continue;
        }
        let Some(id) = v.simulation.allocate() else {
            continue;
        };
        let equipment = match owner {
            Owner::Building(id) if capacity > 0. => batteries::installed_equipment(v, id),
            _ => 0,
        };
        v.power.network.nodes.push(Node {
            id,
            owner,
            kind,
            x,
            y,
            size,
            capacity,
            charge: 0.,
            equipment,
        });
    }
    summaries(v);
}
pub fn initialise(v: &mut Village) -> bool {
    let inherited = f64::from(v.power.stored);
    v.power.network = State::default();
    v.power.frame = None;
    v.power.battery_jobs.clear();
    v.power.salvaged_equipment = 0;
    v.power.retired_equipment = 0;
    sync(v);
    v.power.opening_equipment = v
        .power
        .network
        .nodes
        .iter()
        .map(|n| u64::from(n.equipment))
        .sum();
    let mut left = inherited;
    for n in &mut v.power.network.nodes {
        if n.kind == NodeKind::Roof {
            n.charge = n.capacity;
        } else {
            let amount = left.min(n.capacity);
            n.charge = amount;
            left -= amount;
        }
    }
    if left > 0.001 {
        return false;
    }
    v.power.network.account.opening = v.power.network.nodes.iter().map(|n| n.charge).sum();
    summaries(v);
    valid(v)
}
pub fn open(v: &Village, n: &Node) -> bool {
    match n.owner {
        Owner::Building(id) => {
            v.buildings
                .iter()
                .any(|b| b.id == id && b.progress >= 100. && b.x == n.x && b.y == n.y)
                && building_work::job(v, id).is_none()
        }
        Owner::Pump(id) => pipes::line(v, id).is_some_and(|p| {
            p.phase == pipes::Phase::Active
                && p.plan.kind != utilities::Kind::Electricity
                && p.plan.cells[0] == [n.x, n.y]
        }),
        Owner::Ground => !batteries::busy(v, n.id),
        Owner::Carrier(_) => false,
    }
}
pub fn node(v: &Village, owner: Owner) -> Option<&Node> {
    v.power.network.nodes.iter().find(|n| n.owner == owner)
}
pub fn generation(v: &Village, n: &Node, minutes: f32) -> f64 {
    if !open(v, n) {
        return 0.;
    }
    let altitude = ((((f64::from(minutes).rem_euclid(1440.) / 60.) - 6.) / 12.)
        * std::f64::consts::PI)
        .sin()
        .max(0.);
    let sun = || f64::from(land::solar_exposure(v, n.size, n.x, n.y));
    match n.kind {
        NodeKind::Solar => 6. * altitude * sun(),
        NodeKind::Roof => 0.6 * altitude * sun(),
        NodeKind::Hydro => {
            1.8 * if ecology::raining(minutes) {
                1.3
            } else if (minutes / 1440.) as u32 % 3 == 2 {
                0.65
            } else {
                1.
            }
        }
        _ => 0.,
    }
}
pub fn wires(v: &Village) -> Vec<Wire> {
    v.pipes
        .lines
        .iter()
        .filter(|p| {
            p.plan.kind == utilities::Kind::Electricity
                && p.phase == pipes::Phase::Active
                && !p.paused
        })
        .map(|p| Wire {
            id: p.id,
            from: p.anchors[0].endpoint,
            to: p.anchors[1].endpoint,
            capacity_per_hour: 12.,
        })
        .collect()
}
pub fn frame(v: &Village, minutes: f64, at: f32) -> Result<electricity::Frame, &'static str> {
    let opened: Vec<_> = v
        .power
        .network
        .nodes
        .iter()
        .filter(|n| open(v, n))
        .map(|n| n.id)
        .collect();
    let generation: Vec<_> = v
        .power
        .network
        .nodes
        .iter()
        .filter_map(|n| {
            let rate = generation(v, n, at);
            (rate > 0.).then_some((n.id, rate))
        })
        .collect();
    v.power.network.begin(
        v.simulation.next_id,
        minutes,
        &opened,
        &generation,
        &wires(v),
    )
}
pub fn circuit_report(v: &Village) -> serde_json::Value {
    let Ok(f) = frame(v, 1., v.minutes) else {
        return serde_json::json!([]);
    };
    let pumps = pipes::pump_loads(v, 1.);
    let groups:Vec<_> = f.circuits().into_iter().map(|ids| {
        let nodes: Vec<_> = v.power.network.nodes.iter().filter(|n| ids.contains(&n.id)).collect();
        let owns = |owner| nodes.iter().any(|n| n.owner == owner);
        let demand: f64 = nodes.iter().map(|n| light_load(v, n)).sum();
        let pump_demand: f64 = pumps.iter().filter(|(id, _)| owns(Owner::Pump(*id))).map(|(_, n)| n*60.).sum();
        let powered_tools: f64 = v.production.sites.iter().filter(|s| s.powered && s.building.is_some_and(|id| owns(Owner::Building(id)))).count() as f64 * production::WORKSHOP_ENERGY_PER_HOUR;
        serde_json::json!({"id":ids[0],"nodes":ids,"private_roof":nodes.iter().all(|n| n.kind==NodeKind::Roof),
            "stored":nodes.iter().map(|n|n.charge).sum::<f64>(),"capacity":nodes.iter().map(|n|n.capacity).sum::<f64>(),
            "generation":nodes.iter().map(|n|generation(v,n,v.minutes)).sum::<f64>(),
            "full_night_lighting":demand,"pump_demand":pump_demand,"powered_tools_when_attended":powered_tools})
    }).collect();
    serde_json::json!(groups)
}
pub fn begin(v: &mut Village, minutes: f32) {
    sync(v);
    if minutes <= 0. {
        return;
    }
    v.power.frame = frame(v, f64::from(minutes), v.minutes - minutes / 2.).ok();
}
pub fn spend(v: &mut Village, owner: Owner, amount: f64) -> f64 {
    let Some(id) = node(v, owner).map(|n| n.id) else {
        return 0.;
    };
    v.power.frame.as_mut().map_or(0., |f| f.spend(id, amount))
}
pub fn available(v: &Village, owner: Owner) -> f64 {
    let Some(id) = node(v, owner).map(|n| n.id) else {
        return 0.;
    };
    v.power.frame.as_ref().map_or_else(
        || frame(v, 1., v.minutes).map_or(0., |f| f.available(id)),
        |f| f.available(id),
    )
}
pub fn connected(v: &Village, owner: Owner) -> bool {
    let Some(id) = node(v, owner).map(|n| n.id) else {
        return false;
    };
    v.power.frame.as_ref().map_or_else(
        || frame(v, 1., v.minutes).is_ok_and(|f| f.connected_to_storage(id)),
        |f| f.connected_to_storage(id),
    )
}
pub fn light_load(v: &Village, n: &Node) -> f64 {
    match n.owner {
        Owner::Building(id) if !v.power.disabled.contains(&id) => {
            v.buildings.iter().find(|b| b.id == id).map_or(0., |b| {
                if b.kind == "home" {
                    0.05
                } else {
                    f64::from(load(&b.kind))
                }
            })
        }
        _ => 0.,
    }
}
pub fn finish(v: &mut Village, minutes: f32) {
    if let Some(mut f) = v.power.frame.take() {
        let darkness = f64::from(super::darkness(v.minutes - minutes / 2.));
        for n in &v.power.network.nodes {
            let need = light_load(v, n) * darkness * f64::from(minutes) / 60.;
            let delivered = f.spend(n.id, need);
            if delivered > 0.
                && darkness > 0.5
                && matches!(n.owner,Owner::Building(id) if v.buildings.iter().any(|b|b.id==id&&b.kind=="streetlight"))
            {
                v.progress.night_lights = true;
            }
            if n.kind == NodeKind::Hydro
                && generation(v, n, v.minutes - minutes / 2.) > 0.
                && darkness > 0.5
            {
                v.progress.river_night = true;
            }
        }
        let (state, flows) = f.finish_with_flows();
        v.power.network = state;
        for (id, energy) in flows {
            if let Some(p) = v.pipes.lines.iter_mut().find(|p| p.id == id) {
                p.transferred += energy;
            }
        }
    }
    sync(v);
    pipes::reconcile(v);
    summaries(v);
}
pub fn valid(v: &Village) -> bool {
    if !v.power.network.valid(v.simulation.next_id) || v.power.frame.is_some() {
        return false;
    }
    let wanted = wanted(v);
    v.power.network.nodes.iter().all(|n| {
        (matches!(n.owner, Owner::Ground | Owner::Carrier(_))
            && n.size == 1
            && !river_bank(n.x, n.y))
            || wanted.iter().any(|&(owner, kind, x, y, size, capacity)| {
                (n.owner, n.kind, n.x, n.y, n.size, n.capacity)
                    == (owner, kind, x, y, size, capacity)
                    && n.equipment
                        == match owner {
                            Owner::Building(id) if capacity > 0. => {
                                batteries::installed_equipment(v, id)
                            }
                            _ => 0,
                        }
            })
    }) && wanted
        .iter()
        .all(|d| v.power.network.nodes.iter().any(|n| n.owner == d.0))
        && v.power.stored == stored(v) as f32
}

#[cfg(test)]
mod tests {
    use super::*;
    fn scene() -> Game {
        let mut g = Game::new();
        g.start_mode("sandbox");
        for (kind, x, y) in [
            ("solar_farm", 5, 5),
            ("home", 12, 5),
            ("streetlight", 18, 5),
        ] {
            assert_eq!(g.place(kind, x, y), "ok");
        }
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.minutes = 1260.;
            v.economy.outside_jobs.fill(false);
            sync(&mut v);
            for n in &mut v.power.network.nodes {
                n.charge = match n.kind {
                    NodeKind::Solar => 10.,
                    NodeKind::Roof => 2.,
                    _ => 0.,
                };
            }
            v.power.network.account.opening = 12.;
            summaries(&mut v);
        }
        g
    }
    fn check(g: &mut Game) {
        let v = g.app.world().resource::<Village>();
        assert!(valid(v));
        let raw = g.snapshot();
        let mut h = Game::new();
        assert!(h.restore(&raw));
        assert_eq!(h.snapshot(), raw);
    }
    #[test]
    fn simultaneous_source_recovery_reserves_distinct_clear_ground_for_each_bank() {
        let mut g = Game::new();
        g.start_mode("sandbox");
        assert_eq!(g.place("solar_farm", 5, 5), "ok");
        assert_eq!(g.place("solar_farm", 10, 5), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            for n in &mut v.power.network.nodes {
                n.charge = 6.;
            }
            v.power.network.account.opening = 12.;
            v.buildings.clear();
            v.economy.projects.clear();
            // Both former generators prefer the same small clearing. Roads
            // remain walkable, but cannot receive recovered equipment.
            v.roads = (1..MAP_SIZE - 1)
                .flat_map(|y| (1..MAP_SIZE - 1).map(move |x| (x, y)))
                .filter(|&(x, y)| {
                    !river_bank(x, y)
                        && ((x - 10).abs() >= 2 || (y - 13).abs() >= 2)
                        && (x, y) != (8, 8)
                        && (x, y) != (18, 20)
                })
                .collect();
            logistics::sync(&mut v);
            assert_eq!(v.power.network.nodes.len(), 2);
            let a = &v.power.network.nodes[0];
            let b = &v.power.network.nodes[1];
            assert_eq!(a.owner, Owner::Ground);
            assert_eq!(b.owner, Owner::Ground);
            assert_ne!([a.x, a.y], [b.x, b.y]);
            assert_eq!(a.charge + b.charge, 12.);
            assert!(super::batteries::valid(&v));
        }
        check(&mut g);
    }
    #[test]
    fn rainy_river_generation_is_a_valid_electrical_frame() {
        let mut g = Game::new();
        g.start_mode("sandbox");
        let (x, y) = (26, 5);
        assert_eq!(g.place("hydro", x, y), "ok");
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.minutes = 900.;
        assert!(ecology::raining(v.minutes));
        let before = v.power.network.account.generated;
        begin(&mut v, 1.);
        assert!(
            v.power.frame.is_some(),
            "Rain must not disable the circuit frame"
        );
        finish(&mut v, 1.);
        assert!(v.power.network.account.generated > before);
        assert!(valid(&v));
    }
    #[test]
    fn native_sources_and_roofs_own_their_energy_but_a_distant_lamp_stays_unpowered() {
        let mut g = scene();
        check(&mut g);
        let raw = g.snapshot();
        g.electricity_report();
        assert_eq!(g.snapshot(), raw);
        {
            let v = g.app.world().resource::<Village>();
            let supply = super::super::supply(v);
            assert_eq!(supply.stored, 10.);
            assert_eq!(
                supply
                    .connections
                    .iter()
                    .find(|c| c.id == 1)
                    .unwrap()
                    .light_level,
                1.
            );
            assert_eq!(
                supply
                    .connections
                    .iter()
                    .find(|c| c.id == 2)
                    .unwrap()
                    .light_level,
                0.
            );
            assert!(
                !supply
                    .connections
                    .iter()
                    .find(|c| c.id == 2)
                    .unwrap()
                    .connected
            );
        }
        for _ in 0..80 {
            g.tick(0.25);
        }
        check(&mut g);
        let v = g.app.world().resource::<Village>();
        assert_eq!(node(v, Owner::Building(0)).unwrap().charge, 10.);
        assert!(node(v, Owner::Building(1)).unwrap().charge < 2.);
        assert!(!v.progress.night_lights);
    }
    #[test]
    fn switching_a_light_off_removes_its_unmet_demand_without_spending_charge() {
        let mut g = scene();
        let before = super::super::supply(g.app.world().resource::<Village>());
        assert!((before.demand - 0.1).abs() < 0.0001);
        assert!(g.set_power_enabled(2, false));
        let after = super::super::supply(g.app.world().resource::<Village>());
        assert_eq!(after.demand, 0.);
        assert!(
            !after
                .connections
                .iter()
                .find(|c| c.id == 2)
                .unwrap()
                .enabled
        );
        assert_eq!(after.stored, 10.);
        check(&mut g);
    }
    #[test]
    fn real_generator_relocation_and_removal_preserve_the_owned_battery() {
        let mut g = scene();
        let original = g
            .app
            .world()
            .resource::<Village>()
            .power
            .network
            .nodes
            .iter()
            .find(|n| n.kind == NodeKind::Solar)
            .unwrap()
            .id;
        assert_eq!(g.queue_building_work(0, "move", 5, 20), "ok");
        let mut completed = false;
        for _ in 0..20000 {
            g.tick(0.25);
            let v = g.app.world().resource::<Village>();
            if v.building_jobs.iter().all(|j| j.building != 0) {
                completed = true;
                break;
            }
        }
        assert!(completed, "Actual resident relocation must finish");
        check(&mut g);
        {
            let v = g.app.world().resource::<Village>();
            let n = node(v, Owner::Building(0)).unwrap();
            assert_eq!(n.id, original);
            assert_eq!((n.x, n.y), (5, 20));
            assert_eq!(n.charge, 10.);
        }
        assert_eq!(g.queue_building_work(0, "demolish", 0, 0), "ok");
        completed = false;
        for _ in 0..12000 {
            g.tick(0.25);
            if g.app
                .world()
                .resource::<Village>()
                .buildings
                .iter()
                .all(|b| b.id != 0)
            {
                completed = true;
                break;
            }
        }
        assert!(completed);
        check(&mut g);
        let v = g.app.world().resource::<Village>();
        let recovered = v
            .power
            .network
            .nodes
            .iter()
            .find(|n| n.id == original)
            .unwrap();
        assert_eq!(recovered.owner, Owner::Ground);
        assert_eq!(recovered.kind, NodeKind::Battery);
        assert_eq!(recovered.charge, 10.);
        assert_eq!(v.power.stored, 10.);
    }
    #[test]
    fn river_generator_removal_keeps_its_charge_on_the_accessible_bank() {
        let mut g = Game::new();
        g.start_mode("sandbox");
        assert_eq!(g.place("hydro", 26, 5), "ok");
        let id;
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.economy.outside_jobs.fill(false);
            sync(&mut v);
            let n = v
                .power
                .network
                .nodes
                .iter_mut()
                .find(|n| n.kind == NodeKind::Hydro)
                .unwrap();
            id = n.id;
            n.charge = 12.;
            v.power.network.account.opening = 12.;
            summaries(&mut v);
        }
        assert_eq!(g.queue_building_work(0, "demolish", 0, 0), "ok");
        let mut done = false;
        for _ in 0..12000 {
            g.tick(0.25);
            if g.app.world().resource::<Village>().buildings.is_empty() {
                done = true;
                break;
            }
        }
        assert!(done);
        check(&mut g);
        let v = g.app.world().resource::<Village>();
        let n = v.power.network.nodes.iter().find(|n| n.id == id).unwrap();
        assert_eq!(n.owner, Owner::Ground);
        assert_eq!(n.charge, 12.);
        assert_eq!(n.capacity, 18.);
        assert!(batteries::placeable(v, n.x, n.y, Some(n.id)));
        assert!(!utilities::clear(v, n.x, n.y));
        assert!(!river_bank(n.x, n.y));
        let raw = g.snapshot();
        let mut bad: serde_json::Value = serde_json::from_str(&raw).unwrap();
        let row = bad["village"]["power"]["network"]["nodes"]
            .as_array_mut()
            .unwrap()
            .iter_mut()
            .find(|n| n["id"].as_u64() == Some(u64::from(id.0)))
            .unwrap();
        row["x"] = 26.into();
        row["y"] = 5.into();
        assert!(!g.restore(&bad.to_string()));
        assert_eq!(g.snapshot(), raw);
    }
    #[test]
    fn forged_banks_and_old_save_versions_fail_without_altering_the_live_scene() {
        let mut g = scene();
        let raw = g.snapshot();
        for key in ["charge", "ledger", "owner", "identity", "old_version"] {
            let mut bad: serde_json::Value = serde_json::from_str(&raw).unwrap();
            match key {
                "charge" => bad["village"]["power"]["network"]["nodes"][0]["charge"] = 11.into(),
                "ledger" => bad["village"]["power"]["network"]["account"]["opening"] = 13.into(),
                "owner" => {
                    bad["village"]["power"]["network"]["nodes"][0]["owner"]["id"] = 999.into()
                }
                "identity" => {
                    bad["village"]["power"]["network"]["nodes"][0]["id"] =
                        bad["village"]["logistics"]["stores"][0]["id"].clone()
                }
                _ => bad["village"]["version"] = 19.into(),
            };
            assert!(!g.restore(&bad.to_string()), "Forged {key}");
            assert_eq!(g.snapshot(), raw);
        }
    }
}
