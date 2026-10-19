//! Owned solar, river and rooftop batteries with connected electrical demand.
use super::*;
pub(crate) mod batteries;
mod network;
pub(crate) fn replace_pump(v: &mut Village, previous: simulation::Id, next: simulation::Id) {
    network::replace_pump(v, previous, next);
}
use crate::electricity::{Frame, Owner};

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Power {
    pub stored: f32,
    pub disabled: Vec<usize>,
    pub network: electricity::State,
    pub opening_equipment: u64,
    pub salvaged_equipment: u64,
    pub retired_equipment: u64,
    pub battery_jobs: Vec<batteries::Job>,
    #[serde(skip)]
    pub frame: Option<Frame>,
}
#[derive(Serialize)]
pub struct Connection {
    pub id: usize,
    pub source: &'static str,
    pub enabled: bool,
    pub connected: bool,
    pub load: f32,
    pub light_level: f32,
}
#[derive(Serialize)]
pub struct Supply {
    pub farms: usize,
    pub hydros: usize,
    pub solar_generation: f32,
    pub hydro_generation: f32,
    pub capacity: f32,
    pub stored: f32,
    pub generation: f32,
    pub demand: f32,
    pub pump_demand: f32,
    pub grid_level: f32,
    pub darkness: f32,
    pub connections: Vec<Connection>,
}
pub fn load(kind: &str) -> f32 {
    match kind {
        "kitchen" | "workshop" => 0.6,
        "greenhouse" => 0.5,
        "square" => 0.4,
        "well" | "warehouse" => 0.2,
        "coop" | "streetlight" | "eco_toilet" => 0.1,
        _ => 0.,
    }
}
pub fn darkness(minutes: f32) -> f32 {
    let altitude = (((minutes.rem_euclid(1440.) / 60. - 6.) / 12.) * std::f32::consts::PI).sin();
    ((0.18 - altitude) / 0.65).clamp(0., 1.)
}
pub fn sync(v: &mut Village) {
    network::sync(v);
}
pub fn initialise(v: &mut Village) -> bool {
    network::initialise(v)
}
pub fn supply(v: &Village) -> Supply {
    let active = |kind: &str| {
        v.buildings
            .iter()
            .filter(|b| b.kind == kind && b.progress >= 100.)
            .count()
    };
    let dark = darkness(v.minutes);
    let mut forecast = network::frame(v, 1., v.minutes).ok();
    let pumps = pipes::pump_loads(v, 1.);
    let pump_demand = pipes::pump_demand(v);
    for (id, need) in pumps {
        if let Some(node) = network::node(v, Owner::Pump(id))
            && let Some(f) = forecast.as_mut()
        {
            f.spend(node.id, need);
        }
    }
    let mut grid_demand = 0.;
    let mut delivered_lighting = 0.;
    let connections = v
        .buildings
        .iter()
        .map(|b| {
            let source = match b.kind.as_str() {
                "home" => "roof",
                "solar_farm" => "solar",
                "hydro" => "hydro",
                k if load(k) > 0. => "grid",
                _ => "none",
            };
            let node = network::node(v, Owner::Building(b.id));
            let enabled = b.progress >= 100.
                && !v.power.disabled.contains(&b.id)
                && building_work::job(v, b.id).is_none();
            let connected = node.is_some_and(|n| {
                forecast
                    .as_ref()
                    .is_some_and(|f| f.connected_to_storage(n.id))
            });
            let need = node.map_or(0., |n| network::light_load(v, n) * f64::from(dark) / 60.);
            let delivered = if enabled {
                node.and_then(|n| forecast.as_mut().map(|f| f.spend(n.id, need)))
                    .unwrap_or(0.)
            } else {
                0.
            };
            if source == "grid" && enabled {
                grid_demand += load(&b.kind) * dark;
                delivered_lighting += delivered as f32 * 60.;
            }
            Connection {
                id: b.id,
                source,
                enabled,
                connected,
                load: load(&b.kind),
                light_level: if !enabled || !connected {
                    0.
                } else if need <= 0. {
                    1.
                } else {
                    (delivered / need).clamp(0., 1.) as f32
                },
            }
        })
        .collect();
    let generated = |kind| {
        v.power
            .network
            .nodes
            .iter()
            .filter(|n| n.kind == kind)
            .map(|n| network::generation(v, n, v.minutes))
            .sum::<f64>() as f32
    };
    let solar_generation = generated(electricity::Kind::Solar);
    let hydro_generation = generated(electricity::Kind::Hydro);
    Supply {
        farms: active("solar_farm"),
        hydros: active("hydro"),
        solar_generation,
        hydro_generation,
        capacity: network::capacity(v) as f32,
        stored: network::stored(v) as f32,
        generation: solar_generation + hydro_generation,
        demand: grid_demand + pump_demand,
        pump_demand,
        grid_level: if grid_demand > 0. {
            (delivered_lighting / grid_demand).clamp(0., 1.)
        } else if network::capacity(v) > 0. {
            1.
        } else {
            0.
        },
        darkness: dark,
        connections,
    }
}
pub fn advance(v: &mut Village, minutes: f32) {
    network::begin(v, minutes);
}
pub fn finish_frame(v: &mut Village, minutes: f32) {
    network::finish(v, minutes);
    batteries::finish_ready(v);
}
pub fn pump_available(v: &Village, id: simulation::Id) -> f64 {
    network::available(v, Owner::Pump(id))
}
pub fn pump_connected(v: &Village, id: simulation::Id) -> bool {
    network::connected(v, Owner::Pump(id))
}
pub(crate) fn workshop_available(v: &Village, owner: Owner) -> f64 {
    network::available(v, owner)
}
pub(crate) fn workshop_connected(v: &Village, owner: Owner) -> bool {
    network::connected(v, owner)
}
pub(crate) fn spend_workshop(v: &mut Village, owner: Owner, amount: f64) -> f64 {
    network::spend(v, owner, amount)
}
pub fn spend_pump(v: &mut Village, id: simulation::Id, energy: f64) -> f64 {
    network::spend(v, Owner::Pump(id), energy)
}
pub fn valid(v: &Village) -> bool {
    let mut ids = std::collections::HashSet::new();
    let disabled = v.power.disabled.iter().all(|id| {
        ids.insert(*id)
            && v.buildings
                .iter()
                .any(|b| b.id == *id && load(&b.kind) > 0.)
    });
    if !disabled || !v.power.stored.is_finite() || v.power.stored < 0. {
        return false;
    }
    if v.version == 3 {
        let capacity = v
            .buildings
            .iter()
            .filter(|b| {
                b.progress >= 100. || building_work::original_progress(v, b.id) == Some(100.)
            })
            .map(|b| match b.kind.as_str() {
                "solar_farm" => 36.,
                "hydro" => 18.,
                _ => 0.,
            })
            .sum::<f32>();
        return v.power.network.nodes.is_empty()
            && v.power.network.account.opening == 0.
            && v.power.network.account.generated == 0.
            && v.power.network.account.consumed == 0.
            && v.power.network.account.curtailed == 0.
            && v.power.network.account.discharged == 0.
            && v.power.opening_equipment == 0
            && v.power.salvaged_equipment == 0
            && v.power.retired_equipment == 0
            && v.power.battery_jobs.is_empty()
            && v.power.stored <= capacity + 0.001;
    }
    network::valid(v) && batteries::valid(v)
}
pub fn report(v: &Village) -> serde_json::Value {
    serde_json::json!({"network":v.power.network,"supply":supply(v),"circuits":network::circuit_report(v),"frame_error":network::frame(v,1.,v.minutes).err(),"endpoints":endpoints(v),"connections":pipes::view_filtered(v,Some(true)),"batteries":batteries::view(v),"note":"Charge belongs to each source or recovered battery. Installed cables limit local flow; private roof batteries do not supply shared equipment. Crossed corridors only join at connected ports; pumps run before attended tools and lighting."})
}
#[wasm_bindgen]
impl Game {
    pub fn electricity_report(&self) -> String {
        report(self.app.world().resource::<Village>()).to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn village() -> Village {
        let mut game = Game::new();
        game.app
            .world_mut()
            .resource_mut::<Village>()
            .progress
            .completed = [true; 4];
        game.app
            .world_mut()
            .resource_mut::<Village>()
            .progress
            .later_completed = [true; crate::progression::LATER_CHAPTERS];
        assert_eq!(game.place("solar_farm", 5, 5), "ok");
        assert_eq!(game.place("streetlight", 10, 5), "ok");
        assert_eq!(game.place("home", 14, 5), "ok");
        let mut v = game.app.world().resource::<Village>().clone();
        for b in &mut v.buildings {
            b.progress = 100.;
        }
        crate::logistics::sync(&mut v);
        v.maintenance = maintenance::State::default();
        v.minutes = 360.;
        fixtures::connect(&mut v, Owner::Building(0), Owner::Building(1));
        freshness::fixture_reseed(&mut v);
        v.economy.ledger.clear();
        v
    }
    fn run(v: &mut Village, minutes: u32) {
        for _ in 0..minutes {
            v.minutes += 1.;
            advance(v, 1.);
            finish_frame(v, 1.);
        }
    }
    #[test]
    fn sunlight_charges_and_battery_powers_the_night() {
        let mut v = village();
        run(&mut v, 720);
        assert!(v.power.stored > 35. && v.power.stored <= 36.);
        v.minutes = 1260.;
        let before = v.power.stored;
        run(&mut v, 60);
        assert!((before - v.power.stored - 0.1).abs() < 0.001);
        assert_eq!(supply(&v).connections[1].light_level, 1.);
        assert_eq!(supply(&v).generation, 0.);
    }
    #[test]
    fn unfinished_farms_empty_batteries_and_rooftop_independence() {
        let mut v = village();
        v.buildings[0].progress = 99.;
        v.pipes = pipes::State::default();
        v.logistics
            .as_mut()
            .unwrap()
            .stores
            .retain(|s| !matches!(s.owner, logistics::Owner::Utility(_)));
        v.power.network = electricity::State::default();
        network::sync(&mut v);
        run(&mut v, 720);
        v.minutes = 1260.;
        let p = supply(&v);
        assert_eq!(p.stored, 0.);
        assert_eq!(p.grid_level, 0.);
        assert_eq!(p.connections[2].source, "roof");
        assert_eq!(p.connections[2].light_level, 1.);
        crate::logistics::fixture_finish(&mut v, 0);
        fixtures::connect(&mut v, Owner::Building(0), Owner::Building(1));
        fixtures::charge(&mut v, 0.0005);
        assert!(supply(&v).grid_level > 0. && supply(&v).grid_level < 1.);
        run(&mut v, 1);
        assert_eq!(v.power.stored, 0.);
    }
    #[test]
    fn switching_loads_off_preserves_charge_and_multiple_farms_add_capacity() {
        let mut v = village();
        fixtures::charge(&mut v, 10.);
        v.minutes = 1260.;
        v.power.disabled.push(1);
        run(&mut v, 60);
        assert_eq!(v.power.stored, 10.);
        assert_eq!(supply(&v).connections[1].light_level, 0.);
        let mut second = v.buildings[0].clone();
        second.id = v.buildings.len();
        second.x = 20;
        v.buildings.push(second);
        network::sync(&mut v);
        v.minutes = 720.;
        assert_eq!(supply(&v).capacity, 72.);
        let expected: f32 = v
            .buildings
            .iter()
            .filter(|b| b.kind == "solar_farm")
            .map(|b| 6. * land::solar_exposure(&v, 3, b.x, b.y))
            .sum();
        assert!((supply(&v).generation - expected).abs() < 0.001);
        assert!(expected > 6. && expected <= 12.);
    }
    #[test]
    fn owned_save_round_trip_and_missing_or_corrupt_power_are_checked() {
        let mut game = Game::new();
        let mut v = village();
        fixtures::charge(&mut v, 12.);
        v.power.disabled.push(1);
        game.app.insert_resource(v);
        let save = game.snapshot();
        let mut restored = Game::new();
        assert!(restored.restore(&save));
        assert_eq!(restored.snapshot(), save);
        let mut old: serde_json::Value = serde_json::from_str(&save).unwrap();
        old["village"].as_object_mut().unwrap().remove("power");
        assert!(!restored.restore(&old.to_string()));
        assert_eq!(restored.snapshot(), save);
        for bad in [
            serde_json::json!({"stored":-1}),
            serde_json::json!({"stored":37}),
            serde_json::json!({"disabled":[1,1]}),
            serde_json::json!({"disabled":[2]}),
        ] {
            old["village"]["power"] = bad;
            assert!(!restored.restore(&old.to_string()));
        }
    }
    #[test]
    fn failed_storage_stays_charged_and_worn_systems_reduce_charging_and_cable_rate() {
        let mut v = village();
        v.minutes = 720.;
        v.maintenance.enabled = true;
        maintenance::sync(&mut v);
        fixtures::charge(&mut v, 12.);
        let id = v
            .power
            .network
            .nodes
            .iter()
            .find(|n| n.kind == electricity::Kind::Solar)
            .unwrap()
            .id;
        let key = maintenance::Equipment::Battery(id);
        let node = v
            .power
            .network
            .nodes
            .iter()
            .find(|n| n.id == id)
            .unwrap()
            .clone();
        let healthy = network::generation(&v, &node, 720.);
        v.maintenance
            .records
            .iter_mut()
            .find(|r| r.equipment == key)
            .unwrap()
            .condition = 40.;
        assert!((network::generation(&v, &node, 720.) - healthy * 0.75).abs() < 1e-6);
        assert_eq!(network::wires(&v)[0].capacity_per_hour, 9.);
        v.maintenance
            .records
            .iter_mut()
            .find(|r| r.equipment == key)
            .unwrap()
            .condition = 10.;
        v.minutes = 1260.;
        advance(&mut v, 60.);
        finish_frame(&mut v, 60.);
        assert_eq!(
            v.power
                .network
                .nodes
                .iter()
                .find(|n| n.id == id)
                .unwrap()
                .charge,
            12.
        );
        assert_eq!(v.power.network.account.consumed, 0.);
        assert!(valid(&v));
    }
}

#[cfg(test)]
mod hydro_tests {
    use super::*;
    #[test]
    fn river_generator_requires_bank_access_and_powers_the_night_in_dry_weather() {
        let mut g = Game::new();
        g.start_mode("sandbox");
        assert_ne!(g.place("hydro", 5, 5), "ok");
        assert_ne!(g.place("hydro", 25, 5), "ok");
        assert_eq!(g.place("hydro", 26, 5), "ok");
        assert_eq!(g.place("streetlight", 20, 5), "ok");
        let mut v = g.app.world().resource::<Village>().clone();
        fixtures::connect(&mut v, Owner::Building(0), Owner::Building(1));
        v.minutes = 2. * 1440. + 1260.;
        let p = supply(&v);
        assert_eq!(p.hydros, 1);
        assert_eq!(p.farms, 0);
        assert_eq!(p.capacity, 18.);
        assert!((p.generation - 1.17).abs() < 0.001);
        assert_eq!(p.grid_level, 1.);
        advance(&mut v, 60.);
        finish_frame(&mut v, 60.);
        assert!(v.power.stored > 1.);
        for id in 0..5 {
            assert!(spacing::approach(&v, &v.buildings[0], id).is_some());
        }
        let mut restored = Game::new();
        assert!(restored.restore(&g.snapshot()));
    }
}

pub fn endpoints(v: &Village) -> Vec<utilities::Endpoint> {
    v.power
        .network
        .nodes
        .iter()
        .filter(|n| n.kind != electricity::Kind::Roof)
        .filter_map(|n| {
            let kind = match n.owner {
                Owner::Building(id) => v.buildings.iter().find(|b| b.id == id)?.kind.clone(),
                Owner::Pump(_) => "pump".into(),
                Owner::Ground => "battery".into(),
                Owner::Carrier(_) => return None,
            };
            let ports = if kind == "hydro" {
                utilities::hydro_ports(
                    v,
                    v.buildings
                        .iter()
                        .find(|b| matches!(n.owner,Owner::Building(id) if b.id==id))?,
                )
            } else if kind == "pump" {
                vec![utilities::Port {
                    edge: [n.x as f32, n.y as f32],
                    cell: [n.x, n.y],
                    bank_lead: false,
                }]
            } else {
                utilities::ports(v, n.size, n.x, n.y)
            };
            Some(utilities::Endpoint {
                id: i64::from(n.id.0),
                kind,
                x: n.x,
                y: n.y,
                size: n.size,
                supply: true,
                receive: true,
                ready: match n.owner {
                    Owner::Pump(id) => pipes::line(v, id)
                        .is_some_and(|p| p.live() && p.phase != pipes::Phase::Removing),
                    _ => network::open(v, n),
                },
                ports,
            })
        })
        .collect()
}
pub fn electrical_node(v: &Village, id: i64) -> Option<&electricity::Node> {
    let id = u32::try_from(id).ok()?;
    v.power
        .network
        .nodes
        .iter()
        .find(|n| n.id == simulation::Id(id))
}
pub fn electrical_open(v: &Village, id: i64) -> bool {
    electrical_node(v, id).is_some_and(|n| network::open(v, n))
}
pub fn shared_kind(kind: &str) -> bool {
    matches!(kind, "solar_farm" | "hydro" | "pump" | "battery") || load(kind) > 0.
}

#[cfg(test)]
mod cable_tests;

#[cfg(test)]
pub(crate) mod fixtures;

#[cfg(test)]
mod battery_tests;
