use super::*;
use crate::electricity::{Id, Owner};
use batteries::{Action, Phase};
fn until(g: &mut Game, goal: impl Fn(&Village) -> bool, label: &str) {
    for _ in 0..12 * 1920 {
        if goal(g.app.world().resource::<Village>()) {
            return;
        }
        g.tick(0.25);
    }
    panic!("{label}: {}", g.electricity_report());
}
fn check(g: &mut Game) {
    let raw = g.snapshot();
    let v = g.app.world().resource::<Village>();
    assert!(valid(v), "{}", g.electricity_report());
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
fn recovered() -> Game {
    static OPENING: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    let raw = OPENING.get_or_init(|| {
        let mut g = Game::new();
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.arrived = true;
            v.minutes = 540.;
            v.progress.completed.fill(true);
            v.progress.later_completed.fill(true);
            v.progress.use_tools = false;
            v.production.targets[economy::MEALS] = 0;
            v.economy.money = 2000000;
            v.economy
                .outside_jobs
                .values_mut()
                .for_each(|enabled| *enabled = false);
            logistics::fixture_stock(&mut v, economy::FOOD, 60);
            logistics::fixture_stock(&mut v, economy::MEALS, 12);
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
        assert_eq!(g.place("solar_farm", 5, 5), "ok");
        let mut kit = [0; economy::COUNT];
        for stage in economy::recipe("solar_farm", "standard").unwrap() {
            for (i, n) in stage.items.into_iter().enumerate() {
                kit[i] += n;
            }
        }
        assert_eq!(
            g.order_supplies_pickup(&serde_json::to_string(&kit).unwrap(), 4),
            "ok"
        );
        until(
            &mut g,
            |v| v.buildings[0].progress == 100.,
            "Resident construction from real paid equipment",
        );
        until(
            &mut g,
            |v| v.power.stored > 1.,
            "Real solar charge before removal",
        );
        assert_eq!(
            g.app.world().resource::<Village>().power.network.nodes[0].equipment,
            1
        );
        check(&mut g);
        assert_eq!(g.queue_building_work(0, "demolish", 0, 0), "ok");
        until(
            &mut g,
            |v| v.buildings.iter().all(|b| b.id != 0),
            "Resident removes the generator and retains its bank",
        );
        assert_eq!(
            g.app.world().resource::<Village>().power.network.nodes[0].owner,
            Owner::Ground
        );
        check(&mut g);
        g.snapshot()
    });
    let mut g = Game::new();
    assert!(g.restore(raw));
    g
}
fn bank(g: &Game) -> Id {
    g.app
        .world()
        .resource::<Village>()
        .power
        .network
        .nodes
        .iter()
        .find(|n| n.owner == Owner::Ground)
        .unwrap()
        .id
}
fn job(g: &Game) -> batteries::Job {
    g.app
        .world()
        .resource::<Village>()
        .power
        .battery_jobs
        .last()
        .unwrap()
        .clone()
}
fn buy(g: &mut Game, items: [u32; economy::COUNT]) {
    let raw = serde_json::to_string(&items).unwrap();
    for _ in 0..2 * 1920 {
        if g.order_supplies_pickup(&raw, 4) == "ok" {
            return;
        }
        g.tick(0.25);
    }
    panic!("No resident could collect the ordered equipment");
}
fn recipe(kind: &str) -> [u32; economy::COUNT] {
    let mut items = [0; economy::COUNT];
    for stage in economy::recipe(kind, "standard").unwrap() {
        for (i, n) in stage.items.into_iter().enumerate() {
            items[i] += n;
        }
    }
    items
}
#[test]
fn recovered_hardware_is_reused_in_real_construction_and_never_returned_with_the_building_body() {
    let mut g = recovered();
    let old = bank(&g);
    assert_eq!(g.queue_battery_work(old.0, "salvage", 0, 0), "ok");
    until(
        &mut g,
        |v| v.power.salvaged_equipment == 1,
        "Initial reusable unit is recovered",
    );
    assert_eq!(g.place("solar_farm", 10, 5), "ok");
    let building = g.app.world().resource::<Village>().buildings[0].id;
    let mut kit = recipe("solar_farm");
    assert_eq!(kit[13], 1);
    kit[13] = 0;
    buy(&mut g, kit);
    until(
        &mut g,
        |v| v.buildings[0].progress == 100.,
        "Residents reuse the salvaged equipment in a paid project",
    );
    {
        let v = g.app.world().resource::<Village>();
        assert_eq!(
            network::node(v, Owner::Building(building))
                .unwrap()
                .equipment,
            1
        );
        assert_eq!(v.simulation.materials.as_ref().unwrap().spent[13], 2);
        assert_eq!(v.economy.stock[13], 0);
    }
    check(&mut g);
    assert_eq!(g.queue_building_work(building, "salvage", 0, 0), "ok");
    assert_eq!(
        building_work::job(g.app.world().resource::<Village>(), building)
            .unwrap()
            .returns[13],
        0
    );
    until(
        &mut g,
        |v| v.buildings.is_empty(),
        "Building body salvage preserves the intact bank separately",
    );
    assert_eq!(g.app.world().resource::<Village>().economy.stock[13], 0);
    let next = bank(&g);
    assert_ne!(next, old);
    assert_eq!(g.queue_battery_work(next.0, "salvage", 0, 0), "ok");
    until(
        &mut g,
        |v| v.power.salvaged_equipment == 2,
        "The reused equipment can be recovered exactly once again",
    );
    assert_eq!(g.app.world().resource::<Village>().economy.stock[13], 1);
    check(&mut g);
}
#[test]
fn moving_a_connected_bank_requires_crew_cable_reinstallation() {
    let mut g = recovered();
    let bank = bank(&g);
    assert_eq!(g.place("streetlight", 12, 5), "ok");
    buy(&mut g, recipe("streetlight"));
    until(
        &mut g,
        |v| v.buildings[0].progress == 100.,
        "Residents construct the connected lamp",
    );
    let lamp = g.app.world().resource::<Village>().buildings[0].id;
    let port = network::node(g.app.world().resource::<Village>(), Owner::Building(lamp))
        .unwrap()
        .id;
    let cable = super::cable_tests::install(&mut g, bank.0, port.0);
    assert!(network::connected(
        g.app.world().resource::<Village>(),
        Owner::Building(lamp)
    ));
    assert_eq!(g.queue_battery_work(bank.0, "move", 14, 20), "ok");
    assert!(!network::connected(
        g.app.world().resource::<Village>(),
        Owner::Building(lamp)
    ));
    check(&mut g);
    until(
        &mut g,
        |v| v.power.battery_jobs.last().unwrap().phase == Phase::Carrying,
        "Actual packing disconnects the old cable",
    );
    check(&mut g);
    until(
        &mut g,
        |v| v.power.battery_jobs.last().unwrap().phase == Phase::Complete,
        "Connected bank reaches and is installed at its reserved plot",
    );
    until(
        &mut g,
        |v| {
            v.pipes
                .lines
                .iter()
                .any(|p| p.id != cable && p.plan.kind == utilities::Kind::Electricity)
        },
        "Residents dismantle the old cable before planning its replacement",
    );
    let replacement = g
        .app
        .world()
        .resource::<Village>()
        .pipes
        .lines
        .last()
        .unwrap()
        .clone();
    assert_ne!(replacement.id, cable);
    assert_ne!(replacement.phase, pipes::Phase::Active);
    assert!(!network::connected(
        g.app.world().resource::<Village>(),
        Owner::Building(lamp)
    ));
    check(&mut g);
    // Buy only the replacement shortfall; dismantling has retained part of the kit.
    let kit = {
        let v = g.app.world().resource::<Village>();
        std::array::from_fn(|i| replacement.kit[i].saturating_sub(v.economy.stock[i]))
    };
    if kit.iter().any(|n| *n > 0) {
        buy(&mut g, kit);
    }
    until(
        &mut g,
        |v| pipes::line(v, replacement.id).unwrap().phase == pipes::Phase::Active,
        "Paid replacement parts are delivered and installed by residents",
    );
    assert!(network::connected(
        g.app.world().resource::<Village>(),
        Owner::Building(lamp)
    ));
    check(&mut g);
}
#[test]
fn an_actual_carrier_moves_the_owned_bank_and_a_needs_break_puts_it_down_without_losing_charge() {
    let mut g = recovered();
    let bank = bank(&g);
    let charge = batteries::bank(g.app.world().resource::<Village>(), bank)
        .unwrap()
        .charge;
    assert_eq!(g.queue_battery_work(bank.0, "move", 14, 20), "ok");
    let id = job(&g).id;
    assert!(g.place("garden", 14, 20).contains("recovered battery"));
    assert_ne!(g.toggle_road(14, 20), "ok");
    check(&mut g);
    until(
        &mut g,
        |v| batteries::job(v, id).unwrap().phase == Phase::Carrying,
        "Packing takes resident attendance before physical transport",
    );
    let carrier = batteries::job(g.app.world().resource::<Village>(), id)
        .unwrap()
        .carrier
        .unwrap();
    {
        let mut v = g.app.world().resource::<Village>().clone();
        v.minutes = (v.minutes / 1440.).floor() * 1440. + 600.;
        let mut query = g.app.world_mut().query::<&Resident>();
        let r = query.iter(g.app.world()).find(|r| r.id == carrier).unwrap();
        assert_eq!(
            town_pickup::blocker(&v, r).as_deref(),
            Some("Finish carrying the battery before driving.")
        );
    }
    assert_eq!(
        batteries::bank(g.app.world().resource::<Village>(), bank)
            .unwrap()
            .owner,
        Owner::Carrier(carrier)
    );
    check(&mut g);
    for _ in 0..4 {
        g.tick(0.25);
    }
    {
        let world = g.app.world_mut();
        let mut r = world
            .query::<&mut Resident>()
            .iter_mut(world)
            .find(|r| r.id == carrier)
            .unwrap();
        r.energy = 20.;
    }
    g.tick(0.25);
    {
        let v = g.app.world().resource::<Village>();
        let j = batteries::job(v, id).unwrap();
        assert_eq!(j.phase, Phase::Packing);
        assert_eq!(j.carrier, None);
        let n = batteries::bank(v, bank).unwrap();
        assert_eq!(n.owner, Owner::Ground);
        assert_eq!(n.charge, charge);
        assert!(batteries::placeable(v, n.x, n.y, Some(n.id)));
    }
    check(&mut g);
    until(
        &mut g,
        |v| batteries::job(v, id).unwrap().phase == Phase::Complete,
        "Rested residents finish actual transport and installation",
    );
    let v = g.app.world().resource::<Village>();
    let n = batteries::bank(v, bank).unwrap();
    assert_eq!((n.x, n.y), (14, 20));
    assert_eq!(n.owner, Owner::Ground);
    assert_eq!(n.charge, charge);
    assert_eq!(n.equipment, 1);
    assert_eq!(v.power.salvaged_equipment, 0);
    check(&mut g);
}
#[test]
fn careful_resident_salvage_returns_the_paid_battery_once_and_accounts_for_its_discharge() {
    let mut g = recovered();
    let bank = bank(&g);
    let (charge, received, consumed) = {
        let v = g.app.world().resource::<Village>();
        (
            batteries::bank(v, bank).unwrap().charge,
            v.simulation.materials.as_ref().unwrap().received[13],
            v.power.network.account.consumed,
        )
    };
    assert_eq!(g.queue_battery_work(bank.0, "salvage", 0, 0), "ok");
    let id = job(&g).id;
    assert_eq!(job(&g).work, 0.);
    assert_eq!(job(&g).action, Action::Salvage);
    check(&mut g);
    until(
        &mut g,
        |v| batteries::job(v, id).unwrap().work > 0.,
        "A resident reaches and begins careful salvage",
    );
    check(&mut g);
    until(
        &mut g,
        |v| batteries::job(v, id).unwrap().phase == Phase::Complete,
        "Resident salvage finishes before equipment is credited",
    );
    let v = g.app.world().resource::<Village>();
    assert!(batteries::bank(v, bank).is_none());
    assert_eq!(v.power.network.account.discharged, charge);
    assert_eq!(v.power.network.account.consumed, consumed);
    assert_eq!(v.power.salvaged_equipment, 1);
    assert_eq!(
        v.simulation.materials.as_ref().unwrap().received[13],
        received + 1
    );
    assert_eq!(v.economy.stock[13], 1);
    check(&mut g);
    let raw = g.snapshot();
    assert_ne!(g.queue_battery_work(bank.0, "salvage", 0, 0), "ok");
    assert_ne!(g.cancel_battery_work(id.0), "ok");
    assert_eq!(g.snapshot(), raw);
}
#[test]
fn supplies_put_down_on_a_reserved_destination_wait_for_collection_without_invalidating_the_move() {
    let mut g = recovered();
    let bank = bank(&g);
    assert_eq!(g.queue_battery_work(bank.0, "move", 14, 20), "ok");
    until(
        &mut g,
        |v| v.power.battery_jobs.last().unwrap().phase == Phase::Carrying,
        "A neighbour packs the bank",
    );
    let id = job(&g).id;
    let carrier = job(&g).carrier.unwrap();
    // Stage a dropped supplies pile after the destination was reserved. The
    // reservation still owns the ground while ordinary hauling can clear it.
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        let store = logistics::create(&mut v, logistics::Owner::Ground, 14., 20., 1).unwrap();
        let mut items = [0; economy::COUNT];
        items[2] = 1;
        logistics::receive_salvage(&mut v, store, items);
    }
    check(&mut g);
    let mut actor = {
        let world = g.app.world_mut();
        world
            .query::<&Resident>()
            .iter(world)
            .find(|r| r.id == carrier)
            .unwrap()
            .clone()
    };
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        [actor.x, actor.y] = batteries::approach(&v, id, carrier).unwrap();
        assert!(!batteries::work(&mut v, &actor, 1.));
        assert_eq!(
            batteries::bank(&v, bank).unwrap().owner,
            Owner::Carrier(carrier)
        );
    }
    until(
        &mut g,
        |v| batteries::job(v, id).unwrap().phase == Phase::Complete,
        "Neighbours collect the dropped supplies, then finish installing the bank",
    );
    let n = batteries::bank(g.app.world().resource::<Village>(), bank).unwrap();
    assert_eq!([n.x, n.y], [14, 20]);
    check(&mut g);
}
#[test]
fn battery_commands_reject_bad_plots_duplicate_claims_and_forged_hardware_without_mutation() {
    let mut g = recovered();
    let bank = bank(&g);
    let raw = g.snapshot();
    for (x, y) in [(62, 5), (0, 0), (10, 13)] {
        assert_ne!(g.queue_battery_work(bank.0, "move", x, y), "ok");
        assert_eq!(g.snapshot(), raw);
    }
    assert_eq!(g.queue_battery_work(bank.0, "move", 14, 20), "ok");
    let id = job(&g).id;
    let queued = g.snapshot();
    assert_ne!(g.queue_battery_work(bank.0, "salvage", 0, 0), "ok");
    assert_eq!(g.snapshot(), queued);
    for field in ["carrier", "work", "destination", "equipment"] {
        let mut bad: serde_json::Value = serde_json::from_str(&queued).unwrap();
        match field {
            "carrier" => bad["village"]["power"]["battery_jobs"][0]["carrier"] = 0.into(),
            "work" => bad["village"]["power"]["battery_jobs"][0]["work"] = 12.into(),
            "destination" => {
                bad["village"]["power"]["battery_jobs"][0]["destination"] =
                    serde_json::json!([62, 5])
            }
            _ => bad["village"]["power"]["network"]["nodes"][0]["equipment"] = 2.into(),
        }
        assert!(!g.restore(&bad.to_string()), "Accepted {field}");
        assert_eq!(g.snapshot(), queued);
    }
    assert_eq!(g.cancel_battery_work(id.0), "ok");
    assert_eq!(job(&g).phase, Phase::Cancelled);
    check(&mut g);
}
#[test]
fn free_preview_equipment_cannot_be_salvaged_into_purchased_hardware() {
    let mut g = Game::new();
    g.start_fixture_mode("sandbox");
    assert_eq!(g.place("solar_farm", 5, 5), "ok");
    g.app
        .world_mut()
        .resource_mut::<Village>()
        .economy
        .outside_jobs
        .values_mut()
        .for_each(|enabled| *enabled = false);
    assert_eq!(g.queue_building_work(0, "demolish", 0, 0), "ok");
    until(
        &mut g,
        |v| v.buildings.is_empty(),
        "Free preview source is removed",
    );
    let bank = bank(&g);
    let received = g
        .app
        .world()
        .resource::<Village>()
        .simulation
        .materials
        .as_ref()
        .unwrap()
        .received[13];
    assert_eq!(g.queue_battery_work(bank.0, "salvage", 0, 0), "ok");
    let id = job(&g).id;
    until(
        &mut g,
        |v| batteries::job(v, id).unwrap().phase == Phase::Complete,
        "Free hardware has no paid recovery credit",
    );
    let v = g.app.world().resource::<Village>();
    assert_eq!(v.power.salvaged_equipment, 0);
    assert_eq!(
        v.simulation.materials.as_ref().unwrap().received[13],
        received
    );
    check(&mut g);
}
