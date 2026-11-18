use std::collections::{BTreeMap, HashSet};

use bevy::prelude::*;
use serde::{Deserialize, Serialize};

use crate::{
    arrival::world_position,
    setup::WorldSetup,
    stock::{CashKind, Stock},
    terrain::Terrain,
    weather::{DAY, recharge_season, sun_height, weather_at},
};

const GRID_CAPACITY: f64 = 4.0;
const GRID_TARIFF_CENTS: f64 = 95.0;

#[derive(Default, Deserialize, Serialize)]
pub struct Utilities {
    nodes: BTreeMap<usize, Node>,
    ground: Option<Hydrology>,
    #[serde(skip)]
    links: Vec<Pipe>,
    #[serde(skip)]
    power_links: Vec<(usize, usize)>,
    #[serde(skip)]
    power_members: HashSet<usize>,
    #[serde(skip)]
    topology_valid: bool,
    pub grid_off: bool,
    grid_debt_cents: f64,
    grid_spent: f64,
    grid_import_kw: f64,
    grid_import_total: f64,
    generation_kw: f64,
    demand_kw: f64,
    used_kwh: f64,
    generated_kwh: f64,
    storage_loss_kwh: f64,
    curtailed_kwh: f64,
    pub biogas: f64,
    #[serde(default)]
    waste_removed: f64,
}

#[derive(Deserialize, Serialize)]
struct Node {
    kind: String,
    location: IVec2,
    size: IVec2,
    capacity: [f64; 4],
    water: [f64; 4],
    powered: bool,
    enabled: bool,
    battery: f64,
    charge: f64,
    solar_kw: f64,
    #[serde(default)]
    solar_upgrade: bool,
    demanding: bool,
    #[serde(default)]
    cold_storage: bool,
    #[serde(default)]
    maintain_fresh: bool,
    #[serde(default)]
    maintain_sanitation: bool,
}

#[derive(Clone, Copy, Deserialize, Serialize)]
struct Pipe {
    from: usize,
    to: usize,
    channel: usize,
}

#[derive(Deserialize, Serialize)]
struct Hydrology {
    capacity: f64,
    groundwater: f64,
    river: f64,
    runoff: f64,
    flow: f64,
}

#[derive(Clone, Copy)]
pub struct WaterSite<'a> {
    pub kind: &'a str,
    pub location: IVec2,
    pub size: IVec2,
    pub levels: [f64; 4],
    pub capacity: [f64; 4],
    pub enabled: bool,
    pub maintain_fresh: bool,
    pub maintain_sanitation: bool,
}

impl WaterSite<'_> {
    pub fn space(&self, channel: usize) -> f64 {
        (self.capacity[channel] - self.levels[channel]).max(0.0)
    }
}

pub struct Facility<'a> {
    pub id: usize,
    pub kind: &'a str,
    pub location: IVec2,
    pub size: IVec2,
    pub batteries: u32,
    pub panels: u32,
    pub working: bool,
}

impl Utilities {
    pub fn sync<'a>(&mut self, facilities: impl Iterator<Item = Facility<'a>>) {
        let first = !self.topology_valid;
        self.nodes.entry(0).or_insert_with(|| Node {
            kind: "camp".into(),
            location: IVec2::new(32, -13),
            size: IVec2::ONE,
            capacity: [40.0, 60.0, 120.0, 80.0],
            water: [40.0, 0.0, 0.0, 0.0],
            powered: true,
            enabled: true,
            battery: 0.0,
            charge: 0.0,
            solar_kw: 0.0,
            solar_upgrade: false,
            demanding: false,
            cold_storage: false,
            maintain_fresh: false,
            maintain_sanitation: false,
        });
        let mut changed = first;
        for facility in facilities {
            let entry = self.nodes.entry(facility.id);
            if matches!(entry, std::collections::btree_map::Entry::Vacant(_)) {
                changed = true;
            }
            let node = entry.or_insert_with(|| Node {
                kind: facility.kind.into(),
                location: facility.location,
                size: facility.size,
                capacity: capacity(facility.kind),
                water: [0.0; 4],
                powered: true,
                enabled: true,
                battery: f64::from(facility.batteries) * 4.0,
                charge: 0.0,
                solar_kw: f64::from(facility.panels) * 0.6,
                solar_upgrade: false,
                demanding: false,
                cold_storage: false,
                maintain_fresh: false,
                maintain_sanitation: false,
            });
            if node.location != facility.location || node.size != facility.size {
                node.location = facility.location;
                node.size = facility.size;
                changed = true;
            }
            node.demanding = facility.working;
        }
        if changed {
            self.links = self.connections();
            self.power_links = self.power_tree();
            self.power_members = self.power_links.iter().flat_map(|&(a, b)| [a, b]).collect();
            self.topology_valid = true;
        }
    }

    pub fn remove_facility(&mut self, building: usize) {
        if let Some(node) = self.nodes.remove(&(building + 1)) {
            self.curtailed_kwh += node.charge;
            self.topology_valid = false;
        }
    }

    pub fn valid_save(&self, valid_building: impl Fn(usize, &str) -> bool) -> bool {
        self.nodes.iter().all(|(id, node)| {
            (*id == 0 && node.kind == "camp" || *id > 0 && valid_building(*id - 1, &node.kind))
                && node.capacity
                    == if *id == 0 {
                        [40.0, 60.0, 120.0, 80.0]
                    } else {
                        capacity(&node.kind)
                    }
                && node
                    .water
                    .iter()
                    .zip(node.capacity)
                    .all(|(amount, cap)| (0.0..=cap + 1e-8).contains(amount))
                && (!node.solar_upgrade
                    || node.kind == "home" && node.solar_kw == 0.6 && node.battery == 4.0)
                && (0.0..=node.battery + 1e-8).contains(&node.charge)
        }) && self.ground.as_ref().is_none_or(|ground| {
            ground.capacity > 0.0
                && (0.0..=ground.capacity).contains(&ground.groundwater)
                && ground.river >= 0.0
                && ground.runoff >= 0.0
                && ground.flow >= 0.0
        }) && (0.0..1.0).contains(&self.grid_debt_cents)
    }

    pub fn water_sources(&self) -> impl Iterator<Item = (usize, IVec2, IVec2)> + '_ {
        self.nodes
            .iter()
            .filter(|(_, node)| {
                node.enabled
                    && node.water[0] >= 0.5
                    && !matches!(node.kind.as_str(), "coop" | "goat_pasture")
            })
            .map(|(&id, node)| (id, node.location, node.size))
    }

    pub fn wash_sources(&self) -> impl Iterator<Item = (usize, IVec2, IVec2)> + '_ {
        self.nodes
            .iter()
            .filter(|(_, node)| {
                node.enabled
                    && node.water[0] >= 1.0
                    && node.capacity[2] - node.water[2] >= 0.8
                    && matches!(
                        node.kind.as_str(),
                        "camp" | "wash-station" | "eco_toilet" | "home"
                    )
            })
            .map(|(&id, node)| (id, node.location, node.size))
    }

    pub fn toilets(&self, waste: f64) -> impl Iterator<Item = (usize, IVec2, IVec2)> + '_ {
        self.nodes
            .iter()
            .filter(move |(_, node)| {
                node.enabled
                    && matches!(node.kind.as_str(), "eco_toilet" | "home")
                    && node.capacity[3] - node.water[3] >= waste
            })
            .map(|(&id, node)| (id, node.location, node.size))
    }

    pub fn irrigate(&mut self, plot: usize, amount: f64) -> bool {
        let Some(node) = self.nodes.get_mut(&(plot + 1)) else {
            return false;
        };
        if !node.enabled || node.water[0] + node.water[1] < amount {
            return false;
        }
        let untreated = node.water[1].min(amount);
        node.water[1] -= untreated;
        node.water[0] -= amount - untreated;
        true
    }

    pub fn potable_at(&self, facility: usize) -> f64 {
        self.nodes
            .get(&facility)
            .filter(|node| node.enabled)
            .map_or(0.0, |node| node.water[0])
    }

    pub fn drink(&mut self, id: usize, liters: f64) -> bool {
        let Some(node) = self.nodes.get_mut(&id) else {
            return false;
        };
        if !node.enabled || node.water[0] + 1e-8 < liters {
            return false;
        }
        node.water[0] = (node.water[0] - liters).max(0.0);
        true
    }

    pub fn wash(&mut self, id: usize) -> bool {
        let Some(node) = self.nodes.get_mut(&id) else {
            return false;
        };
        if !node.enabled || node.water[0] < 1.0 || node.capacity[2] - node.water[2] < 0.8 {
            return false;
        }
        node.water[0] -= 1.0;
        node.water[2] += 0.8;
        true
    }

    pub fn receive_sewage(&mut self, id: usize, liters: f64) -> bool {
        let Some(node) = self.nodes.get_mut(&id) else {
            return false;
        };
        if !node.enabled || node.capacity[3] - node.water[3] < liters {
            return false;
        }
        node.water[3] += liters;
        true
    }

    pub fn water_site(&self, id: usize) -> Option<WaterSite<'_>> {
        let node = self.nodes.get(&id)?;
        Some(WaterSite {
            kind: &node.kind,
            location: node.location,
            size: node.size,
            levels: node.water,
            capacity: node.capacity,
            enabled: node.enabled,
            maintain_fresh: node.maintain_fresh,
            maintain_sanitation: node.maintain_sanitation,
        })
    }

    pub fn water_ids(&self) -> impl Iterator<Item = usize> + '_ {
        self.nodes
            .iter()
            .filter_map(|(&id, node)| node.capacity.iter().any(|&n| n > 0.0).then_some(id))
    }

    pub fn water_at(&self, cell: IVec2) -> Option<usize> {
        self.water_ids().find(|id| {
            let node = &self.nodes[id];
            cell.cmpge(node.location).all() && cell.cmplt(node.location + node.size).all()
        })
    }

    pub fn toggle_water_policy(&mut self, id: usize, fresh: bool) -> bool {
        let Some(node) = self.nodes.get_mut(&id) else {
            return false;
        };
        if fresh && node.capacity[0] > 0.0 && node.capacity[1] > 0.0 {
            node.maintain_fresh = !node.maintain_fresh;
            true
        } else if !fresh
            && (node.capacity[2] > 0.0 || node.capacity[3] > 0.0)
            && !matches!(
                node.kind.as_str(),
                "wetland" | "biodigester" | "banana_treatment"
            )
        {
            node.maintain_sanitation = !node.maintain_sanitation;
            true
        } else {
            false
        }
    }

    pub fn take_water(&mut self, source: Option<usize>, channel: usize, liters: f64) -> f64 {
        if let Some(id) = source {
            let Some(node) = self.nodes.get_mut(&id).filter(|node| node.enabled) else {
                return 0.0;
            };
            let liters = liters.min(node.water[channel]);
            node.water[channel] -= liters;
            liters
        } else if channel == 1 {
            self.carry_river_water(liters)
        } else {
            0.0
        }
    }

    pub fn deliver_water(&mut self, id: usize, channel: usize, liters: f64) -> f64 {
        let Some(node) = self.nodes.get_mut(&id).filter(|node| node.enabled) else {
            return 0.0;
        };
        let accepted = liters.min((node.capacity[channel] - node.water[channel]).max(0.0));
        node.water[channel] += accepted;
        accepted
    }

    pub fn purify_water(&mut self, id: usize) {
        if let Some(node) = self.nodes.get_mut(&id).filter(|node| node.enabled) {
            transform_water(node, 1, 0, 12.0, 1.0);
        }
    }

    pub fn service_waste(&mut self, id: usize) {
        if let Some(node) = self.nodes.get_mut(&id).filter(|node| node.enabled) {
            self.waste_removed += node.water[2] + node.water[3];
            node.water[2..].fill(0.0);
        }
    }

    pub fn camp_water(&self) -> Option<[f64; 4]> {
        self.nodes.get(&0).map(|camp| camp.water)
    }

    pub fn carry_river_water(&mut self, amount: f64) -> f64 {
        let Some(ground) = &mut self.ground else {
            return 0.0;
        };
        let amount = amount.min(ground.river);
        ground.river -= amount;
        amount
    }

    pub fn put_camp_water(&mut self, amount: f64) {
        if let Some(camp) = self.nodes.get_mut(&0) {
            let accepted = (camp.capacity[1] - camp.water[1]).min(amount);
            camp.water[1] += accepted;
            if let Some(ground) = &mut self.ground {
                ground.runoff += amount - accepted;
            }
        }
    }

    pub fn purify_camp_water(&mut self) {
        self.purify_water(0);
    }

    pub fn powered(&self, building: usize) -> bool {
        self.nodes
            .get(&(building + 1))
            .is_some_and(|node| node.enabled && node.powered)
    }

    pub fn enabled(&self, building: usize) -> bool {
        self.nodes
            .get(&(building + 1))
            .is_none_or(|node| node.enabled)
    }

    pub fn toggle(&mut self, building: usize) {
        if let Some(node) = self.nodes.get_mut(&(building + 1))
            && (light_load(&node.kind) > 0.0
                || node.battery > 0.0
                || node.solar_kw > 0.0
                || node.kind == "hydro")
        {
            node.enabled = !node.enabled;
        }
    }

    pub fn install_rooftop_solar(&mut self, building: usize) -> bool {
        let Some(node) = self
            .nodes
            .get_mut(&(building + 1))
            .filter(|node| node.kind == "home")
        else {
            return false;
        };
        node.solar_upgrade = true;
        node.solar_kw = 0.6;
        node.battery = 4.0;
        self.topology_valid = false;
        true
    }

    pub fn has_rooftop_solar(&self, building: usize) -> bool {
        self.nodes
            .get(&(building + 1))
            .is_some_and(|node| node.solar_upgrade)
    }

    pub fn install_cold_storage(&mut self, building: usize) {
        if let Some(node) = self.nodes.get_mut(&(building + 1)) {
            node.cold_storage = true;
        }
    }

    pub fn has_cold_storage(&self, building: usize) -> bool {
        self.nodes
            .get(&(building + 1))
            .is_some_and(|node| node.cold_storage)
    }

    pub fn powered_cold_storage(&self) -> f64 {
        self.nodes
            .values()
            .filter(|node| node.cold_storage && node.enabled && node.powered)
            .count() as f64
            * 80.0
    }

    pub fn facility_status(&self, building: usize) -> Option<String> {
        let node = self.nodes.get(&(building + 1))?;
        let switchable = light_load(&node.kind) > 0.0
            || node.battery > 0.0
            || node.solar_kw > 0.0
            || node.kind == "hydro";
        let mut status = String::new();
        if switchable {
            let state = if !node.enabled {
                "Off"
            } else if node.powered {
                "Powered"
            } else {
                "No power"
            };
            status.push_str(&format!("{state} · J Switch"));
        }
        if node.capacity.iter().any(|capacity| *capacity > 0.0) {
            if !status.is_empty() {
                status.push_str(" · ");
            }
            status.push_str(&format!("Water {:.1} L", node.water[0] + node.water[1]));
        }
        if node.solar_upgrade {
            if !status.is_empty() {
                status.push_str(" · ");
            }
            status.push_str(&format!(
                "Rooftop solar · {:.2}/{:.0} kWh stored",
                node.charge, node.battery
            ));
        }
        (!status.is_empty()).then_some(status)
    }

    pub fn power_summary(&self) -> String {
        let stored: f64 = self.nodes.values().map(|node| node.charge).sum();
        format!(
            "Power · {:.2} kW solar/hydro · {:.2} kW demand\n{stored:.2} kWh stored · {:.2} kW grid · R${:.2} used\nGrid {} · O Switch grid",
            self.generation_kw,
            self.demand_kw,
            self.grid_import_kw,
            self.grid_spent / 100.0,
            if self.grid_off { "off" } else { "on" },
        )
    }

    pub fn water_summary(&self) -> String {
        let water = self.nodes.values().fold([0.0; 4], |mut total, node| {
            for (channel, quantity) in node.water.iter().enumerate() {
                total[channel] += quantity;
            }
            total
        });
        let mut text = format!(
            "Water · {:.1} L drinking · {:.1} L untreated\n{:.1} L greywater · {:.1} L sewage",
            water[0], water[1], water[2], water[3],
        );
        if let Some(ground) = &self.ground {
            text.push_str(&format!(
                "\nAquifer {:.0} L · River {:.0} L/day",
                ground.groundwater, ground.flow
            ));
        }
        text
    }

    pub fn tick(
        &mut self,
        setup: &WorldSetup,
        stock: &mut Stock,
        committed: u64,
        clock: f64,
        dt: f64,
    ) {
        let weather = weather_at((clock - dt * 0.5).max(0.0), setup.biome(), setup.seed());
        let season = recharge_season(clock, setup.biome());
        let rainfall = weather.rain;
        let ground = self
            .ground
            .get_or_insert_with(|| Hydrology::new(setup.water_factor(), season));
        ground.step(setup.water_factor(), season, rainfall, dt);
        let flow = ground.flow;
        let hours = dt * 0.45 / 60.0;
        let terrain = setup.terrain();
        self.electricity(
            stock,
            committed,
            PowerStep {
                sun: sun_height(clock),
                cloud: weather.cloud,
                flow,
                rainfall,
                hours,
                terrain: &terrain,
            },
        );
        self.process_water(&terrain, setup.water_factor(), rainfall, hours);
        self.transfer(hours);
    }

    fn electricity(&mut self, stock: &mut Stock, committed: u64, step: PowerStep) {
        let PowerStep {
            sun,
            cloud,
            flow,
            rainfall,
            hours,
            terrain,
        } = step;
        #[derive(Default)]
        struct Circuit {
            generation: f64,
            stored: f64,
            capacity: f64,
            available: f64,
        }

        let circuit_of = |id| {
            if self.power_members.contains(&id) {
                0
            } else {
                id
            }
        };
        let mut circuits = BTreeMap::<usize, Circuit>::new();
        let wells: Vec<_> = self
            .nodes
            .values()
            .filter(|node| node.kind == "groundwater-well" && node.enabled && node.water[1] > 0.0)
            .map(|node| node.location)
            .collect();
        let mut demand = Vec::new();
        for (&id, node) in &self.nodes {
            if !node.enabled {
                continue;
            }
            let output = match node.kind.as_str() {
                "solar_farm" | "home" => node.solar_kw * sun * (1.0 - 0.75 * cloud),
                "hydro" => (flow * 9.81 * 5.0 * 0.65 / 86_400_000.0).min(2.34),
                _ => 0.0,
            };
            let circuit = circuits.entry(circuit_of(id)).or_default();
            circuit.generation += output;
            circuit.capacity += node.battery;
            circuit.stored += node.charge;
            let mut kw = match node.kind.as_str() {
                "well"
                    if (node.water[1] > 0.0 || rainfall > 0.05)
                        && node.water[0] < node.capacity[0] - 0.01 =>
                {
                    0.08
                }
                "water-pump"
                    if node.water[1] < node.capacity[1] - 0.01
                        && (near_river(terrain, node.location)
                            || wells
                                .iter()
                                .any(|&location| distance(location, node.location) <= 6.0)) =>
                {
                    0.18
                }
                "well" | "water-pump" => 0.0,
                _ if sun < 0.15 => light_load(&node.kind),
                _ => 0.0,
            };
            if node.demanding && matches!(node.kind.as_str(), "kitchen" | "workshop") {
                kw += 0.45;
            }
            if node.cold_storage {
                kw += 0.08;
            }
            demand.push((circuit_of(id), priority(&node.kind), id, kw));
        }
        demand.sort_by_key(|&(circuit, priority, id, _)| (circuit, priority, id));
        self.generation_kw = circuits.values().map(|circuit| circuit.generation).sum();
        self.demand_kw = demand.iter().map(|&(_, _, _, kw)| kw).sum();
        self.grid_import_kw = 0.0;
        for circuit in circuits.values_mut() {
            circuit.available = circuit.stored + circuit.generation * hours;
        }
        let mut grid = if self.grid_off || !self.nodes.get(&0).is_some_and(|camp| camp.enabled) {
            0.0
        } else {
            GRID_CAPACITY * hours
        };
        let budget = stock.balance().saturating_sub(committed) as f64;
        for (network, _, id, kw) in demand {
            let available = &mut circuits.get_mut(&network).expect("power circuit").available;
            let required = kw * hours;
            let deficit = (required - *available).max(0.0);
            let cost = deficit * GRID_TARIFF_CENTS;
            if network == 0
                && deficit > 0.0
                && deficit <= grid + 1e-9
                && self.grid_debt_cents + cost <= budget
            {
                self.grid_debt_cents += cost;
                self.grid_spent += cost;
                grid -= deficit;
                self.grid_import_kw += deficit / hours;
                self.grid_import_total += deficit;
                *available += deficit;
            }
            let node = self.nodes.get_mut(&id).expect("demand site");
            node.powered = *available + 1e-9 >= required;
            if node.powered {
                *available = (*available - required).max(0.0);
                self.used_kwh += required;
            }
        }
        let debit = self.grid_debt_cents.floor() as u64;
        if debit > 0 {
            stock.debit(debit, CashKind::Electricity);
            self.grid_debt_cents -= debit as f64;
        }
        self.generated_kwh += self.generation_kw * hours;
        for circuit in circuits.values_mut() {
            let loss = (circuit.available - circuit.stored)
                .max(0.0)
                .min((circuit.capacity - circuit.stored).max(0.0) / 0.9)
                * 0.1;
            self.storage_loss_kwh += loss;
            circuit.available -= loss;
            self.curtailed_kwh += (circuit.available - circuit.capacity).max(0.0);
            circuit.available = circuit.available.min(circuit.capacity);
        }
        for (&id, node) in &mut self.nodes {
            if node.enabled && node.battery > 0.0 {
                let circuit = &circuits[&circuit_of(id)];
                node.charge = circuit.available * node.battery / circuit.capacity;
            }
        }
    }

    fn process_water(&mut self, terrain: &Terrain, water_factor: f64, rain: f64, hours: f64) {
        let Some(ground) = &mut self.ground else {
            return;
        };
        let mut pumping = Vec::new();
        let mut claimed = HashSet::new();
        let catchments: Vec<_> = self
            .nodes
            .iter()
            .filter_map(|(&index, node)| {
                let area = match node.kind.as_str() {
                    "well" if node.enabled => 16.0,
                    "rain-barrel" if node.enabled => 1.0,
                    _ => return None,
                };
                let roof = self
                    .nodes
                    .iter()
                    .filter(|(id, roof)| {
                        !claimed.contains(*id)
                            && matches!(
                                roof.kind.as_str(),
                                "home" | "shed" | "warehouse" | "kitchen" | "workshop"
                            )
                            && distance(roof.location, node.location) <= 6.0
                    })
                    .min_by(|(_, a), (_, b)| {
                        distance(a.location, node.location)
                            .total_cmp(&distance(b.location, node.location))
                    });
                if let Some((&id, roof)) = roof {
                    claimed.insert(id);
                    Some((index, area + f64::from(roof.size.x * roof.size.y * 4)))
                } else {
                    Some((index, area))
                }
            })
            .collect();
        for (id, area) in catchments {
            let node = self.nodes.get_mut(&id).expect("rain catchment");
            let total = area * rain * hours;
            let collected = (total * 0.8).min(node.capacity[1] - node.water[1]).max(0.0);
            node.water[1] += collected;
            ground.runoff += total - collected;
        }
        for (&id, node) in &mut self.nodes {
            if !node.enabled {
                continue;
            }
            match node.kind.as_str() {
                "groundwater-well" => {
                    let extraction = (8.0 * hours * water_factor)
                        .min(node.capacity[1] - node.water[1])
                        .min(ground.groundwater)
                        .max(0.0);
                    ground.groundwater -= extraction;
                    node.water[1] += extraction;
                }
                "water-pump" if node.powered && node.water[1] < node.capacity[1] - 0.01 => {
                    pumping.push(id)
                }
                "well" if node.powered => transform_water(node, 1, 0, 25.0 * hours, 1.0),
                "wetland" => transform_water(node, 2, 1, 10.0 * hours, 0.85),
                "banana_treatment" | "biodigester" => {
                    let used = (8.0 * hours).min(node.water[3]);
                    node.water[3] -= used;
                    if node.kind == "biodigester" {
                        self.biogas += used * 0.15;
                    }
                }
                _ => {}
            }
        }
        for id in pumping {
            let pump = &self.nodes[&id];
            let location = pump.location;
            let volume = (600.0 * hours).min(pump.capacity[1] - pump.water[1]);
            let well = self
                .nodes
                .iter_mut()
                .filter(|(_, node)| {
                    node.kind == "groundwater-well"
                        && node.enabled
                        && distance(node.location, location) <= 6.0
                })
                .min_by(|(_, a), (_, b)| {
                    distance(a.location, location).total_cmp(&distance(b.location, location))
                });
            let from_well = if let Some((_, well)) = well {
                let amount = volume.min(well.water[1]);
                well.water[1] -= amount;
                amount
            } else {
                0.0
            };
            let from_river = if near_river(terrain, location) {
                (volume - from_well).min(ground.river)
            } else {
                0.0
            };
            ground.river -= from_river;
            self.nodes.get_mut(&id).expect("pump").water[1] += from_well + from_river;
        }
    }

    fn connections(&self) -> Vec<Pipe> {
        let mut links = Vec::new();
        let wells: Vec<_> = self
            .nodes
            .iter()
            .filter(|(_, node)| node.kind == "well")
            .map(|(id, _)| *id)
            .collect();
        let tanks: Vec<_> = self
            .nodes
            .iter()
            .filter(|(_, node)| node.kind == "water-storage")
            .map(|(id, _)| *id)
            .collect();
        let pumps: Vec<_> = self
            .nodes
            .iter()
            .filter(|(_, node)| node.kind == "water-pump")
            .map(|(id, _)| *id)
            .collect();
        let irrigation: Vec<_> = self
            .nodes
            .iter()
            .filter(|(_, node)| matches!(node.kind.as_str(), "rain-barrel" | "wetland"))
            .map(|(id, _)| *id)
            .collect();
        let grey: Vec<_> = self
            .nodes
            .iter()
            .filter(|(_, node)| node.kind == "wetland")
            .map(|(id, _)| *id)
            .collect();
        let sewage: Vec<_> = self
            .nodes
            .iter()
            .filter(|(_, node)| matches!(node.kind.as_str(), "biodigester" | "banana_treatment"))
            .map(|(id, _)| *id)
            .collect();
        let mut fresh: Vec<_> = wells.iter().chain(&tanks).copied().collect();
        if fresh.is_empty() {
            fresh.push(0);
        }
        for (&id, node) in &self.nodes {
            let nearest = |sources: &[usize]| {
                sources
                    .iter()
                    .copied()
                    .filter(|peer| *peer != id)
                    .min_by(|a, b| {
                        distance(self.nodes[a].location, node.location)
                            .total_cmp(&distance(self.nodes[b].location, node.location))
                            .then_with(|| a.cmp(b))
                    })
            };
            let mut pipe_in = |channel, nodes| {
                if let Some(from) = nearest(nodes) {
                    links.push(Pipe {
                        from,
                        to: id,
                        channel,
                    });
                }
            };
            match node.kind.as_str() {
                "well" => pipe_in(1, &pumps),
                "water-storage" => {
                    pipe_in(0, &wells);
                    pipe_in(1, &pumps);
                }
                _ if node.capacity[0] > 0.0 => pipe_in(0, &fresh),
                _ => {}
            }
            if matches!(
                node.kind.as_str(),
                "garden" | "greenhouse" | "orchard" | "grove"
            ) {
                pipe_in(1, &irrigation);
                pipe_in(1, &pumps);
            }
            if node.capacity[2] > 0.0
                && node.kind != "wetland"
                && let Some(to) = nearest(&grey)
            {
                links.push(Pipe {
                    from: id,
                    to,
                    channel: 2,
                });
            }
            if node.capacity[3] > 0.0
                && !matches!(node.kind.as_str(), "biodigester" | "banana_treatment")
                && let Some(to) = nearest(&sewage)
            {
                links.push(Pipe {
                    from: id,
                    to,
                    channel: 3,
                });
            }
        }
        links
    }

    fn power_tree(&self) -> Vec<(usize, usize)> {
        let mut unjoined: Vec<_> = self
            .nodes
            .iter()
            .filter_map(|(&id, node)| {
                (id != 0
                    && (node.battery > 0.0
                        || light_load(&node.kind) > 0.0
                        || (node.kind != "water-storage"
                            && self.links.iter().any(|pipe| pipe.from == id))))
                .then_some((
                    id,
                    0,
                    self.nodes[&0].location.distance_squared(node.location),
                    0,
                ))
            })
            .collect();
        let mut links = Vec::with_capacity(unjoined.len());
        while !unjoined.is_empty() {
            let index = (0..unjoined.len())
                .min_by_key(|&i| {
                    let (id, _, distance, order) = unjoined[i];
                    (distance, order, id)
                })
                .expect("unconnected utility nodes");
            let (to, from, _, _) = unjoined.swap_remove(index);
            links.push((from, to));
            let position = self.nodes[&to].location;
            for (candidate, nearest, best, order) in &mut unjoined {
                let distance = position.distance_squared(self.nodes[candidate].location);
                if distance < *best {
                    *best = distance;
                    *nearest = to;
                    *order = links.len();
                }
            }
        }
        links
    }

    pub fn draw_network(&self, terrain: &Terrain, power: bool, gizmos: &mut Gizmos) {
        let center = |node: &Node| {
            let cell = node.location.as_vec2() + (node.size.as_vec2() - Vec2::ONE) * 0.5;
            world_position(cell.x, cell.y)
        };
        let draw = |gizmos: &mut Gizmos, pair: (usize, usize), color: Color, channel: usize| {
            let (Some(from), Some(to)) = (self.nodes.get(&pair.0), self.nodes.get(&pair.1)) else {
                return;
            };
            let steps = (center(from).distance(center(to)) / 2.0).ceil().max(1.0) as usize;
            let lift = if channel == 4 {
                0.55
            } else {
                0.18 + channel as f32 * 0.06
            };
            let tint = if from.enabled && to.enabled && (!power || from.powered && to.powered) {
                color
            } else {
                Color::srgb_u8(120, 125, 128)
            };
            gizmos.linestrip(
                (0..=steps).map(|step| {
                    let Vec2 { x, y: z } =
                        center(from).lerp(center(to), step as f32 / steps as f32);
                    Vec3::new(x, terrain.height_at(x, z) + lift, z)
                }),
                tint,
            );
        };
        if power {
            for &pair in &self.power_links {
                draw(gizmos, pair, Color::srgb_u8(255, 221, 114), 4);
            }
        } else {
            let colors = [
                Color::srgb_u8(101, 214, 255),
                Color::srgb_u8(117, 223, 149),
                Color::srgb_u8(196, 161, 252),
                Color::srgb_u8(234, 163, 90),
            ];
            for pipe in &self.links {
                draw(
                    gizmos,
                    (pipe.from, pipe.to),
                    colors[pipe.channel],
                    pipe.channel,
                );
            }
        }
    }

    fn transfer(&mut self, hours: f64) {
        let mut counts = BTreeMap::<(usize, usize), usize>::new();
        for pipe in &self.links {
            let recipient = &self.nodes[&pipe.to];
            if recipient.enabled
                && recipient.capacity[pipe.channel] - recipient.water[pipe.channel] > 0.0001
            {
                *counts.entry((pipe.from, pipe.channel)).or_default() += 1;
            }
        }
        let shares: BTreeMap<_, _> = counts
            .into_iter()
            .map(|((from, channel), recipients)| {
                (
                    (from, channel),
                    self.nodes[&from].water[channel] / recipients as f64,
                )
            })
            .collect();
        for &Pipe { from, to, channel } in &self.links {
            let source = &self.nodes[&from];
            let target = &self.nodes[&to];
            if !source.enabled || !target.enabled {
                continue;
            }
            let amount = (24.0 * hours)
                .min(shares.get(&(from, channel)).copied().unwrap_or(0.0))
                .min(source.water[channel])
                .min(target.capacity[channel] - target.water[channel])
                .max(0.0);
            self.nodes.get_mut(&from).expect("pipe source").water[channel] -= amount;
            self.nodes.get_mut(&to).expect("pipe recipient").water[channel] += amount;
        }
    }
}

struct PowerStep<'a> {
    sun: f64,
    cloud: f64,
    flow: f64,
    rainfall: f64,
    hours: f64,
    terrain: &'a Terrain,
}

impl Hydrology {
    fn new(factor: f64, season: f64) -> Self {
        let capacity = 120_000.0 * factor;
        let groundwater = capacity * (0.35 + 0.4 * season);
        let river = 8000.0 * factor * (0.15 + 0.85 * season);
        Self {
            capacity,
            groundwater,
            river,
            runoff: 0.0,
            flow: river,
        }
    }

    fn step(&mut self, factor: f64, season: f64, rainfall: f64, dt: f64) {
        let days = dt / DAY;
        self.runoff += rainfall * 24.0 * days * 4000.0;
        let released = self.runoff * -(-days / 2.0).exp_m1();
        self.runoff -= released;
        let recharge = (self.capacity - self.groundwater).min(released * 0.6);
        self.groundwater += recharge;
        let base = self.groundwater * -(-days / 180.0).exp_m1();
        self.groundwater -= base;
        self.river += released - recharge + base + 8000.0 * factor * (0.15 + 0.85 * season) * days;
        let out = self.river * -(-days).exp_m1();
        self.river -= out;
        self.flow = out / days;
    }
}

fn transform_water(node: &mut Node, from: usize, to: usize, volume: f64, retained: f64) {
    let amount = node.water[from]
        .min(volume)
        .min((node.capacity[to] - node.water[to]) / retained)
        .max(0.0);
    node.water[from] -= amount;
    node.water[to] += amount * retained;
}

fn distance(a: IVec2, b: IVec2) -> f64 {
    f64::from((a - b).as_vec2().length())
}

fn near_river(terrain: &Terrain, cell: IVec2) -> bool {
    let Vec2 { x, y: z } = world_position(cell.x as f32 + 0.5, cell.y as f32 + 0.5);
    let (center, width) = terrain.river(f64::from(z));
    (f64::from(x) - center).abs() <= width + 4.9
}

fn priority(kind: &str) -> u8 {
    match kind {
        "water-pump" | "well" | "camp" => 0,
        "eco_toilet" | "biodigester" | "banana_treatment" => 1,
        "home" | "streetlight" => 2,
        "kitchen" => 3,
        "greenhouse" | "coop" | "goat_pasture" => 4,
        _ => 6,
    }
}

fn light_load(kind: &str) -> f64 {
    match kind {
        "water-pump" => 0.18,
        "well" => 0.08,
        "kitchen" | "workshop" | "square" => 0.025,
        "shed" | "streetlight" => 0.015,
        "greenhouse" | "warehouse" | "home" => 0.02,
        "coop" => 0.01,
        _ => 0.0,
    }
}

fn capacity(kind: &str) -> [f64; 4] {
    match kind {
        "supply-0" => [0.0, 120.0, 0.0, 0.0],
        "supply-1" | "rain-barrel" => [0.0, 60.0, 0.0, 0.0],
        "groundwater-well" => [0.0, 40.0, 0.0, 0.0],
        "water-pump" => [0.0, 12.0, 0.0, 0.0],
        "well" => [1000.0, 1000.0, 0.0, 0.0],
        "water-storage" => [250.0, 250.0, 0.0, 0.0],
        "home" => [8.0, 0.0, 24.0, 16.0],
        "kitchen" => [6.0, 0.0, 24.0, 0.0],
        "eco_toilet" => [8.0, 0.0, 16.0, 16.0],
        "garden" | "greenhouse" | "orchard" | "grove" => [4.0, 12.0, 0.0, 0.0],
        "goat_pasture" => [40.0, 0.0, 0.0, 0.0],
        "coop" => [6.0, 0.0, 0.0, 0.0],
        "wetland" => [0.0, 60.0, 24.0, 0.0],
        "biodigester" => [0.0, 0.0, 0.0, 24.0],
        "banana_treatment" => [0.0, 0.0, 0.0, 40.0],
        "wash-station" => [8.0, 0.0, 24.0, 0.0],
        _ => [0.0; 4],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::Catalog;

    #[test]
    fn automatic_links_use_nearby_nodes_and_keep_isolated_power_local() {
        let setup = WorldSetup::default();
        let mut stock = Stock::for_start(&setup, &Catalog::default());
        let mut utilities = Utilities {
            grid_off: true,
            ..default()
        };
        let node = |id, kind, dx, dz, batteries, panels| Facility {
            id,
            kind,
            location: IVec2::new(32 + dx, -13 + dz),
            size: IVec2::ONE,
            batteries,
            panels,
            working: kind == "workshop",
        };
        utilities.sync(
            [
                node(1, "workshop", 9, 0, 0, 0),
                node(2, "home", 2, 0, 0, 0),
                node(3, "rain-barrel", 4, 0, 0, 0),
                node(4, "garden", 4, 1, 0, 0),
                node(5, "solar_farm", 12, 0, 0, 6),
            ]
            .into_iter(),
        );
        assert_eq!(utilities.power_links, [(0, 2), (2, 3), (3, 1)]);
        assert!(
            utilities
                .links
                .iter()
                .any(|p| (p.from, p.to, p.channel) == (3, 4, 1))
        );
        utilities.tick(&setup, &mut stock, 0, 1.0, 0.1);
        assert!(utilities.generation_kw > 0.45);
        assert!(!utilities.powered(0));

        utilities.sync([node(6, "solar_farm", 10, 0, 1, 6)].into_iter());
        assert_eq!(utilities.power_links.last(), Some(&(1, 6)));
        utilities.tick(&setup, &mut stock, 0, 2.0, 0.1);
        assert!(utilities.powered(0));
        assert_eq!(utilities.grid_import_kw, 0.0);
        assert!(utilities.nodes[&6].charge > 0.0);
    }

    #[test]
    fn grid_buys_only_consumed_energy_and_off_grid_can_block_machines() {
        let setup = WorldSetup::default();
        let mut stock = Stock::for_start(&setup, &Catalog::default());
        let mut utilities = Utilities::default();
        utilities.sync(
            [Facility {
                id: 1,
                kind: "workshop",
                location: IVec2::new(44, 36),
                size: IVec2::splat(3),
                batteries: 0,
                panels: 0,
                working: true,
            }]
            .into_iter(),
        );
        let before = stock.balance();
        for step in 0..100 {
            utilities.tick(&setup, &mut stock, 0, f64::from(step) * 0.1, 0.1);
        }
        assert!(utilities.powered(0));
        assert!((utilities.grid_import_total - 0.45 * (10.0 * 0.45 / 60.0)).abs() < 1e-9);
        assert!(stock.balance() < before);
        utilities.grid_off = true;
        utilities.tick(&setup, &mut stock, 0, 11.0, 0.1);
        assert!(!utilities.powered(0));
        assert_eq!(utilities.grid_import_kw, 0.0);
    }

    #[test]
    fn wetland_treats_greywater_without_adding_drinking_water() {
        let setup = WorldSetup::default();
        let mut stock = Stock::for_start(&setup, &Catalog::default());
        let mut utilities = Utilities::default();
        utilities.sync(
            [Facility {
                id: 1,
                kind: "wetland",
                location: IVec2::new(44, 36),
                size: IVec2::splat(3),
                batteries: 0,
                panels: 0,
                working: false,
            }]
            .into_iter(),
        );
        utilities.nodes.get_mut(&0).unwrap().water[2] = 10.0;
        for step in 0..100 {
            utilities.tick(&setup, &mut stock, 0, f64::from(step) * 0.1, 0.1);
        }
        let camp = &utilities.nodes[&0];
        let wetland = &utilities.nodes[&1];
        assert_eq!(camp.water[0], 40.0);
        assert_eq!(wetland.water[0], 0.0);
        assert!(wetland.water[1] > 0.0);
        assert!(camp.water[2] + wetland.water[1] + wetland.water[2] < 10.0);
    }
}
