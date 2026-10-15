//! Explicit authored circuits for native flow tests. Playthroughs use paid hauling.
use super::*;
use crate::simulation::Id;
pub(crate) fn charge(v: &mut Village, amount: f64) {
    network::sync(v);
    assert!(v.power.frame.is_none());
    let mut left = amount;
    for n in &mut v.power.network.nodes {
        if n.kind != electricity::Kind::Roof {
            n.charge = left.min(n.capacity);
            left -= n.charge;
        }
    }
    assert!(left.abs() < 0.000001);
    v.power.network.account = electricity::Account {
        opening: v.power.network.nodes.iter().map(|n| n.charge).sum(),
        ..Default::default()
    };
    network::summaries(v);
}
pub(crate) fn connect(v: &mut Village, from: Owner, to: Owner) -> Id {
    network::sync(v);
    let a = network::node(v, from).unwrap().id.0;
    let b = network::node(v, to).unwrap().id.0;
    let id = pipes::queue(v, utilities::Kind::Electricity, a, b).unwrap();
    let kit = pipes::line(v, id).unwrap().kit;
    for (i, n) in kit.into_iter().enumerate() {
        if n > 0 {
            assert!(logistics::receive(v, logistics::Owner::Utility(id), i, n));
        }
    }
    let mut g = Game::new();
    let world = g.app.world_mut();
    let mut r = world
        .query::<&Resident>()
        .iter(world)
        .next()
        .unwrap()
        .clone();
    for _ in 0..4000 {
        if pipes::line(v, id).unwrap().phase == pipes::Phase::Active {
            return id;
        }
        assert!(pipes::assign_target(&mut r, v, id));
        [r.x, r.y] = pipes::approach(v, id, r.id).unwrap();
        pipes::work(v, &r, 0.75);
    }
    panic!("Authored cable could not be installed");
}
pub(crate) fn pump(v: &mut Village, id: Id) {
    let generator = v
        .power
        .network
        .nodes
        .iter()
        .find(|n| matches!(n.kind, electricity::Kind::Solar | electricity::Kind::Hydro))
        .unwrap()
        .owner;
    connect(v, generator, Owner::Pump(id));
}
