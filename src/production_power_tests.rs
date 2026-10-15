use super::*;
use crate::electricity::Owner as ElectricalOwner;
fn scene(connected: bool) -> (Game, Id, Id) {
    let mut g = tests::scene();
    g.app
        .world_mut()
        .resource_mut::<Village>()
        .progress
        .later_completed
        .fill(true);
    assert_eq!(g.place("solar_farm", 15, 6), "ok");
    let (site, batch) = {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        logistics::fixture_finish(&mut v, 1);
        let batch = v
            .production
            .batches
            .iter()
            .find(|b| b.active() && b.material == 7)
            .unwrap()
            .id;
        let site = self::batch(&v, batch).unwrap().site;
        fixture_inputs(&mut v, batch);
        if connected {
            power::fixtures::connect(
                &mut v,
                ElectricalOwner::Building(1),
                ElectricalOwner::Building(0),
            );
        }
        power::fixtures::charge(&mut v, 10.);
        (site, batch)
    };
    (g, site, batch)
}
fn worker(g: &mut Game, id: Id) -> Resident {
    let world = g.app.world_mut();
    let mut r = world
        .query::<&Resident>()
        .iter(world)
        .next()
        .unwrap()
        .clone();
    assert!(assign_batch(&mut r, world.resource::<Village>(), id));
    [r.x, r.y] = [r.target_x, r.target_y];
    r
}
fn work_for(g: &mut Game, r: &Resident, seconds: f32) -> bool {
    let mut v = g.app.world_mut().resource_mut::<Village>();
    v.minutes += seconds * MINUTES_PER_SECOND;
    power::advance(&mut v, seconds * MINUTES_PER_SECOND);
    let finished = work(&mut v, r, seconds);
    power::finish_frame(&mut v, seconds * MINUTES_PER_SECOND);
    finished
}
fn checkpoint(g: &mut Game) {
    let raw = g.snapshot();
    assert!(valid(g.app.world().resource::<Village>()));
    let mut h = Game::new();
    assert!(h.restore(&raw));
    assert_eq!(h.snapshot(), raw);
}
#[test]
fn powered_tools_double_attended_work_with_metered_energy_and_default_manual_work_stays_free() {
    let (mut manual, _, batch) = scene(false);
    let r = worker(&mut manual, batch);
    assert!(!work_for(&mut manual, &r, 2.));
    let v = manual.app.world().resource::<Village>();
    assert_eq!(self::batch(v, batch).unwrap().work, 2.);
    assert_eq!(v.power.network.account.consumed, 0.);
    checkpoint(&mut manual);
    let (mut powered, site, batch) = scene(true);
    assert_eq!(powered.set_workshop_powered(site.0, true), "ok");
    let r = worker(&mut powered, batch);
    assert!(!work_for(&mut powered, &r, 2.));
    let v = powered.app.world().resource::<Village>();
    assert!((self::batch(v, batch).unwrap().work - 4.).abs() < 0.00001);
    let expected = 2. * f64::from(MINUTES_PER_SECOND) / 60. * WORKSHOP_ENERGY_PER_HOUR;
    assert!((v.power.network.account.consumed - expected).abs() < 0.000001);
    assert!((self::site(v, site).unwrap().energy_used - expected).abs() < 0.000001);
    checkpoint(&mut powered);
    assert!(work_for(&mut powered, &r, 3.));
    let v = powered.app.world().resource::<Village>();
    assert_eq!(self::batch(v, batch).unwrap().phase, Phase::Complete);
    assert_eq!(v.production.accounting.outputs[7], 2);
    assert!((self::site(v, site).unwrap().energy_used - 0.3).abs() < 0.000001);
    checkpoint(&mut powered);
}
#[test]
fn outage_preserves_committed_inputs_and_saved_work_and_manual_fallback_finishes_once() {
    let (mut g, site, batch) = scene(true);
    assert_eq!(g.set_workshop_powered(site.0, true), "ok");
    let r = worker(&mut g, batch);
    assert!(!work_for(&mut g, &r, 2.));
    let cable = g
        .app
        .world()
        .resource::<Village>()
        .pipes
        .lines
        .last()
        .unwrap()
        .id;
    assert_eq!(g.configure_electrical_connection(cable.0, 1, true), "ok");
    let inputs = g
        .app
        .world()
        .resource::<Village>()
        .production
        .accounting
        .inputs;
    let energy = g
        .app
        .world()
        .resource::<Village>()
        .power
        .network
        .account
        .consumed;
    assert!(!work_for(&mut g, &r, 2.));
    {
        let v = g.app.world().resource::<Village>();
        assert!((self::batch(v, batch).unwrap().work - 4.).abs() < 0.00001);
        assert_eq!(self::batch(v, batch).unwrap().phase, Phase::AwaitingPower);
        assert_eq!(v.production.accounting.inputs, inputs);
        assert_eq!(v.power.network.account.consumed, energy);
        assert!(power_blocker(v, site).unwrap().contains("hand tools"));
    }
    checkpoint(&mut g);
    assert_eq!(g.set_workshop_powered(site.0, false), "ok");
    assert!(work_for(&mut g, &r, 6.));
    assert!(!work_for(&mut g, &r, 6.));
    let v = g.app.world().resource::<Village>();
    assert_eq!(v.production.accounting.inputs, inputs);
    assert_eq!(v.production.accounting.outputs[7], 2);
    assert_eq!(v.power.network.account.consumed, energy);
    checkpoint(&mut g);
}
#[test]
fn tools_only_spend_energy_during_attendance_and_cancelled_work_keeps_its_electrical_cost() {
    let (mut g, site, batch) = scene(true);
    assert_eq!(g.set_workshop_powered(site.0, true), "ok");
    let mut r = worker(&mut g, batch);
    let spot = [r.x, r.y];
    r.x = 22.;
    r.y = 22.;
    assert!(!work_for(&mut g, &r, 2.));
    assert_eq!(
        g.app
            .world()
            .resource::<Village>()
            .power
            .network
            .account
            .consumed,
        0.
    );
    assert!(
        !self::batch(g.app.world().resource::<Village>(), batch)
            .unwrap()
            .committed
    );
    [r.x, r.y] = spot;
    assert!(!work_for(&mut g, &r, 1.));
    let energy = g
        .app
        .world()
        .resource::<Village>()
        .power
        .network
        .account
        .consumed;
    assert!(energy > 0.);
    assert_eq!(g.cancel_production_batch(batch.0), "ok");
    assert_ne!(g.cancel_production_batch(batch.0), "ok");
    let v = g.app.world().resource::<Village>();
    assert_eq!(v.production.accounting.inputs[0], 0);
    assert_eq!(v.production.accounting.inputs[2], 0);
    assert_eq!(v.power.network.account.consumed, energy);
    assert_eq!(self::site(v, site).unwrap().energy_used, energy);
    checkpoint(&mut g);
}
#[test]
fn power_modes_require_a_workshop_circuit_and_forged_energy_is_rejected_atomically() {
    let (mut g, site, _) = scene(false);
    let raw = g.snapshot();
    assert_ne!(g.set_workshop_powered(site.0, true), "ok");
    assert_eq!(g.snapshot(), raw);
    let camp = g
        .app
        .world()
        .resource::<Village>()
        .production
        .sites
        .iter()
        .find(|s| s.kind == Kind::Camp)
        .unwrap()
        .id;
    assert_ne!(g.set_workshop_powered(camp.0, true), "ok");
    assert_eq!(g.snapshot(), raw);
    for (field, index, value) in [
        ("powered", 0, serde_json::json!(true)),
        ("energy_used", 1, serde_json::json!(1.)),
    ] {
        let mut bad: serde_json::Value = serde_json::from_str(&raw).unwrap();
        bad["village"]["production"]["sites"][index][field] = value;
        assert!(!g.restore(&bad.to_string()));
        assert_eq!(g.snapshot(), raw);
    }
}
