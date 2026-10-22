//! Physical opening battery assets and energy balances, without earned work history.
use super::*;
use electricity::{Kind, Node, Owner};
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BuildingBank {
    pub charge: f64,
    pub owned: bool,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GroundBank {
    pub id: String,
    pub x: i32,
    pub y: i32,
    pub capacity: f64,
    pub charge: f64,
}
pub fn capacity(kind: &str) -> Option<f64> {
    match kind {
        "home" => Some(4.),
        "solar_farm" => Some(36.),
        "hydro" => Some(18.),
        _ => None,
    }
}
pub fn owns_building_equipment(v: &Village, id: usize) -> bool {
    v.scenario.as_ref().is_some_and(|o| {
        o.definition.start.buildings.iter().any(|b| {
            b.battery.as_ref().is_some_and(|p| p.owned) && o.buildings.get(&b.id) == Some(&id)
        })
    })
}
pub fn valid_opening(v: &Village) -> bool {
    let Some(origin) = &v.scenario else {
        return true;
    };
    let d = &origin.definition;
    let equipment = d.start.batteries.len() as u64
        + d.start
            .buildings
            .iter()
            .filter(|b| b.battery.as_ref().is_some_and(|p| p.owned))
            .count() as u64;
    let charge = d
        .start
        .buildings
        .iter()
        .filter(|b| b.state == BuildingState::Completed)
        .filter_map(|b| {
            capacity(&b.kind).map(|_| {
                b.battery
                    .as_ref()
                    .map_or(if b.kind == "home" { 4. } else { 0. }, |p| p.charge)
            })
        })
        .chain(d.start.batteries.iter().map(|p| p.charge))
        .sum::<f64>();
    let mut identities = HashSet::new();
    let bindings = origin.batteries.len() == d.start.batteries.len()
        && d.start.batteries.iter().all(|b| {
            origin.batteries.get(&b.id).is_some_and(|id| {
                id.0 > 0
                    && id.0 < v.simulation.next_id
                    && identities.insert(*id)
                    && v.power
                        .network
                        .nodes
                        .iter()
                        .find(|n| n.id == *id)
                        .is_none_or(|n| n.kind == Kind::Battery)
            })
        });
    bindings
        && v.power.opening_equipment == equipment
        && (v.power.network.account.opening - charge).abs() < 0.000001
}
fn valid_charge(charge: f64, capacity: f64) -> bool {
    charge.is_finite() && (0.0..=capacity).contains(&charge)
}
pub fn check(d: &Definition, r: &mut Report) {
    if d.start.batteries.len() > 128 {
        r.push(
            "start.batteries",
            "battery_limit",
            "Use at most 128 standalone starting battery banks.",
        );
    }
    let mut ids = HashSet::new();
    for (i, b) in d.start.buildings.iter().enumerate().take(MAX_BUILDINGS + 1) {
        if let Some(bank) = &b.battery
            && (b.state != BuildingState::Completed
                || capacity(&b.kind).is_none_or(|cap| !valid_charge(bank.charge, cap)))
        {
            r.push(&format!("start.buildings.{i}.battery"),"invalid_starting_battery","Starting charge needs a completed home, solar farm or river generator, and must fit its battery capacity. Clear battery setup before using a construction project.");
            let issue = r.issues.last_mut().unwrap();
            issue.entity = Some(b.id.clone());
            issue.at = Some([b.x, b.y]);
        }
    }
    for (i, b) in d.start.batteries.iter().enumerate().take(129) {
        if !valid_key(&b.id)
            || !ids.insert(&b.id)
            || ![4., 18., 36.].contains(&b.capacity)
            || !valid_charge(b.charge, b.capacity)
        {
            r.push(&format!("start.batteries.{i}"),"invalid_starting_battery","Each standalone bank needs a unique identity, a supported 4, 18 or 36 unit capacity and charge from empty to its capacity.");
            let issue = r.issues.last_mut().unwrap();
            issue.entity = Some(b.id.clone());
            issue.at = Some([b.x, b.y]);
        }
    }
}
pub fn install(v: &mut Village) -> Result<(), Report> {
    let Some(origin) = v.scenario.clone() else {
        return Ok(());
    };
    if origin.definition.start.batteries.is_empty()
        && origin
            .definition
            .start
            .buildings
            .iter()
            .all(|b| b.battery.is_none())
    {
        return Ok(());
    }
    for b in &origin.definition.start.buildings {
        let Some(bank) = &b.battery else { continue };
        let id = origin.buildings[&b.id];
        let Some(node) = v
            .power
            .network
            .nodes
            .iter_mut()
            .find(|n| n.owner == Owner::Building(id) && n.capacity > 0.)
        else {
            return Err(Report::error(
                "start.buildings",
                "missing_battery",
                "This completed structure has no battery bank.",
            ));
        };
        node.charge = bank.charge;
    }
    for (i, b) in origin.definition.start.batteries.iter().enumerate() {
        if !power::batteries::placeable(v, b.x, b.y, None) {
            let mut r = Report::error(
                &format!("start.batteries.{i}"),
                "battery_location",
                "Keep the battery on clear inland ground, away from buildings, material plots, paths, other banks and the arrival camp.",
            );
            r.issues[0].entity = Some(b.id.clone());
            r.issues[0].at = Some([b.x, b.y]);
            return Err(r);
        }
        let Some(id) = v.simulation.allocate() else {
            return Err(Report::error(
                "start.batteries",
                "battery_identity_limit",
                "No battery identities remain.",
            ));
        };
        std::sync::Arc::make_mut(v.scenario.as_mut().unwrap())
            .batteries
            .insert(b.id.clone(), id);
        v.power.network.nodes.push(Node {
            id,
            owner: Owner::Ground,
            kind: Kind::Battery,
            x: b.x,
            y: b.y,
            size: 1,
            capacity: b.capacity,
            charge: b.charge,
            equipment: 1,
        });
    }
    let Some(network) =
        electricity::State::from_opening(v.power.network.nodes.clone(), v.simulation.next_id)
    else {
        return Err(Report::error(
            "start.batteries",
            "invalid_opening_energy",
            "Starting battery balances could not be initialized.",
        ));
    };
    v.power.network = network;
    v.power.opening_equipment = v
        .power
        .network
        .nodes
        .iter()
        .map(|n| u64::from(n.equipment))
        .sum();
    power::sync(v);
    navigation::refresh(v);
    Ok(())
}
pub fn catalog() -> serde_json::Value {
    serde_json::json!({"ground_limit":128,"capacities":[4,18,36],"buildings":[{"id":"home","capacity":4,"default_charge":4},{"id":"solar_farm","capacity":36,"default_charge":0},{"id":"hydro","capacity":18,"default_charge":0}],"example":BuildingBank{charge:0.,owned:true}})
}
#[cfg(test)]
mod tests {
    use super::*;
    fn definition() -> Definition {
        let mut d = Definition::builtin(modes::Mode::Sandbox);
        d.rules.logistics = true;
        d.rules.land = true;
        d.rules.utilities = true;
        let mut b = d.start.buildings[0].clone();
        b.id = "our-home".into();
        b.kind = "home".into();
        b.x = 25;
        b.y = 25;
        b.battery = Some(BuildingBank {
            charge: 1.5,
            owned: true,
        });
        d.start.buildings.push(b);
        d.start.batteries = vec![GroundBank {
            id: "our-bank".into(),
            x: 25,
            y: 30,
            capacity: 18.,
            charge: 7.25,
        }];
        d
    }
    #[test]
    fn authored_charge_and_owned_hardware_are_opening_assets_not_production_or_inventory_grants() {
        let (mut g, _) = compile(definition())
            .unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
        let v = g.app.world().resource::<Village>();
        let home = v
            .power
            .network
            .nodes
            .iter()
            .find(|n| n.kind == Kind::Roof)
            .unwrap();
        let bank = v
            .power
            .network
            .nodes
            .iter()
            .find(|n| n.owner == Owner::Ground)
            .unwrap();
        assert_eq!(home.charge, 1.5);
        assert_eq!(home.equipment, 1);
        assert_eq!(bank.charge, 7.25);
        assert_eq!(bank.equipment, 1);
        assert_eq!(v.scenario.as_ref().unwrap().batteries["our-bank"], bank.id);
        assert_eq!(v.power.opening_equipment, 2);
        assert_eq!(v.power.network.account.opening, 8.75);
        assert_eq!(v.power.network.account.generated, 0.);
        assert_eq!(v.power.stored, 7.25);
        let materials = v.simulation.materials.as_ref().unwrap();
        assert_eq!(materials.received[13], 0);
        assert_eq!(materials.spent[13], 0);
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_eq!(g.snapshot(), saved);
    }
    #[test]
    fn invalid_charge_ownership_and_placement_reject_without_replacing_a_running_world() {
        let (mut g, _) = compile(definition())
            .unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
        let before = g.snapshot();
        for (x, y) in [(32, 32), (25, 25), (0, 30), (63, 30)] {
            let mut d = definition();
            d.start.batteries[0].x = x;
            d.start.batteries[0].y = y;
            assert!(
                !serde_json::from_str::<serde_json::Value>(
                    &g.load_scenario(&serde_json::to_string(&d).unwrap())
                )
                .unwrap()["ok"]
                    .as_bool()
                    .unwrap()
            );
            assert_eq!(g.snapshot(), before);
        }
        let mut d = definition();
        d.start.batteries[0].charge = 19.;
        assert!(compile(d).is_err());
        let mut d = definition();
        d.start.buildings.last_mut().unwrap().state = BuildingState::Blueprint;
        assert!(compile(d).is_err());
    }
    #[test]
    fn actual_residents_move_and_salvage_opening_banks_without_recreating_energy_or_modules() {
        let (mut g, _) = compile(definition())
            .unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
        let bank = g
            .app
            .world()
            .resource::<Village>()
            .power
            .network
            .nodes
            .iter()
            .find(|n| n.owner == Owner::Ground)
            .unwrap()
            .id;
        assert_eq!(g.queue_battery_work(bank.0, "move", 25, 35), "ok");
        for _ in 0..6000 {
            g.tick(0.25);
            if g.app
                .world()
                .resource::<Village>()
                .power
                .battery_jobs
                .last()
                .unwrap()
                .finished
                .is_some()
            {
                break;
            }
        }
        let v = g.app.world().resource::<Village>();
        let n = v.power.network.nodes.iter().find(|n| n.id == bank).unwrap();
        assert_eq!([n.x, n.y], [25, 35]);
        assert_eq!(n.charge, 7.25);
        assert_eq!(n.equipment, 1);
        assert_eq!(v.power.opening_equipment, 2);
        let moved = g.snapshot();
        assert!(g.restore(&moved));
        assert_eq!(g.snapshot(), moved);
        assert_eq!(g.queue_battery_work(bank.0, "salvage", 0, 0), "ok");
        for _ in 0..6000 {
            g.tick(0.25);
            if g.app
                .world()
                .resource::<Village>()
                .power
                .battery_jobs
                .last()
                .unwrap()
                .finished
                .is_some()
            {
                break;
            }
        }
        let v = g.app.world().resource::<Village>();
        assert!(!v.power.network.nodes.iter().any(|n| n.id == bank));
        assert_eq!(v.scenario.as_ref().unwrap().batteries["our-bank"], bank);
        assert_eq!(v.power.salvaged_equipment, 1);
        assert_eq!(v.power.network.account.discharged, 7.25);
        assert_eq!(v.simulation.materials.as_ref().unwrap().received[13], 1);
        assert_eq!(v.simulation.materials.as_ref().unwrap().spent[13], 0);
        assert!(valid_opening(v));
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_eq!(g.snapshot(), saved);
    }
    #[test]
    fn forged_opening_asset_or_energy_balances_are_rejected_atomically() {
        let (mut g, _) = compile(definition())
            .unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
        let before = g.snapshot();
        let mut wrong_binding: serde_json::Value = serde_json::from_str(&before).unwrap();
        let roof = wrong_binding["village"]["power"]["network"]["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .find(|n| n["kind"] == "roof")
            .unwrap()["id"]
            .clone();
        wrong_binding["village"]["scenario"]["batteries"]["our-bank"] = roof;
        assert!(!g.restore(&wrong_binding.to_string()));
        assert_eq!(g.snapshot(), before);
        let mut raw: serde_json::Value = serde_json::from_str(&before).unwrap();
        raw["village"]["scenario"]["definition"]["start"]["batteries"] = serde_json::json!([]);
        assert!(!g.restore(&raw.to_string()));
        assert_eq!(g.snapshot(), before);
        let mut raw: serde_json::Value = serde_json::from_str(&before).unwrap();
        raw["village"]["scenario"]["definition"]["start"]["batteries"][0]["charge"] = 8.25.into();
        assert!(!g.restore(&raw.to_string()));
        assert_eq!(g.snapshot(), before);
    }
}
