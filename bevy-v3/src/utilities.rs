use std::collections::{BTreeMap, BTreeSet, HashSet};

use bevy::prelude::*;
use serde::{Deserialize, Serialize};

use crate::{
    arrival::world_position,
    economy_reference::{GRID_CAPACITY, GRID_TARIFF_CENTS},
    setup::WorldSetup,
    stock::{CashKind, Stock},
    terrain::Terrain,
    weather::{DAY, recharge_season, sun_height, weather_at},
};

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum NetworkView {
    Power,
    Water,
    Liquid(usize),
    Sanitation,
}

const LIQUID_NAMES: [&str; 4] = ["Drinking water", "Irrigation", "Greywater", "Sewage"];

pub(crate) fn waste_tank_warning(liters: f64, capacity: f64) -> Option<&'static str> {
    if capacity <= 0.0 || liters < 0.9 * capacity {
        None
    } else if liters >= capacity - 0.1 {
        Some("full")
    } else {
        Some("nearly full")
    }
}

impl NetworkView {
    fn channels(self) -> std::ops::Range<usize> {
        match self {
            Self::Power => 0..0,
            Self::Water => 0..LIQUID_NAMES.len(),
            Self::Liquid(channel) => channel..channel + 1,
            Self::Sanitation => 2..LIQUID_NAMES.len(),
        }
    }
}

#[derive(Default, Deserialize, Serialize)]
pub struct Utilities {
    nodes: BTreeMap<usize, Node>,
    ground: Option<Hydrology>,
    #[serde(skip)]
    links: Vec<Pipe>,
    #[serde(skip)]
    power_links: Vec<(usize, usize)>,
    #[serde(skip)]
    power_circuits: BTreeMap<usize, usize>,
    #[serde(default, skip_serializing_if = "BTreeSet::is_empty")]
    disabled_power_links: BTreeSet<(usize, usize)>,
    #[serde(default, skip_serializing_if = "BTreeSet::is_empty")]
    installed_power_links: BTreeSet<(usize, usize)>,
    #[serde(default, skip_serializing_if = "BTreeSet::is_empty")]
    disabled_water_links: BTreeSet<(usize, usize, usize)>,
    #[serde(default, skip_serializing_if = "BTreeSet::is_empty")]
    installed_water_links: BTreeSet<(usize, usize, usize)>,
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
    #[serde(default, skip_serializing_if = "zero_liters")]
    latrine_waste_liters: f64,
}

fn zero_liters(liters: &f64) -> bool {
    *liters == 0.0
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
    #[serde(default = "full_service")]
    service_factor: f64,
    demanding: bool,
    #[serde(default)]
    cold_storage: bool,
    #[serde(default)]
    cooling_paused: bool,
    #[serde(default)]
    maintain_fresh: bool,
    #[serde(default)]
    maintain_sanitation: bool,
}

impl Node {
    fn matches_view(&self, view: NetworkView) -> bool {
        if view == NetworkView::Power {
            light_load(&self.kind) > 0.0
                || self.solar_kw > 0.0
                || self.battery > 0.0
                || self.kind == "hydro"
                || self.demanding
        } else {
            view.channels().any(|channel| self.capacity[channel] > 0.0)
        }
    }
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
    #[serde(default)]
    account: Option<WaterAccount>,
}

#[derive(Serialize)]
pub struct WatershedSample {
    aquifer_capacity_liters: f64,
    groundwater_liters: f64,
    river_reserve_liters: f64,
    river_flow_liters_per_day: f64,
    runoff_liters: f64,
}

#[derive(Default, Deserialize, Serialize)]
struct WaterAccount {
    initial: f64,
    rain: f64,
    upstream: f64,
    recharged: f64,
    baseflow: f64,
    groundwater_extracted: f64,
    river_extracted: f64,
    outflow: f64,
    catchment_rain: f64,
    captured: f64,
    catchment_overflow: f64,
    returned: f64,
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
    pub fn supports_water_policy(&self, fresh: bool) -> bool {
        if fresh {
            self.capacity[0] > 0.0 && self.capacity[1] > 0.0
        } else {
            (self.capacity[2] > 0.0 || self.capacity[3] > 0.0)
                && !matches!(self.kind, "wetland" | "biodigester" | "banana_treatment")
        }
    }

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
    pub(crate) fn ensure_camp(&mut self) {
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
            service_factor: full_service(),
            demanding: false,
            cold_storage: false,
            cooling_paused: false,
            maintain_fresh: true,
            maintain_sanitation: true,
        });
    }

    pub fn sync<'a>(&mut self, facilities: impl Iterator<Item = Facility<'a>>) {
        let first = !self.topology_valid;
        self.ensure_camp();
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
                service_factor: full_service(),
                demanding: false,
                cold_storage: false,
                cooling_paused: false,
                maintain_fresh: matches!(facility.kind, "well" | "water-storage"),
                maintain_sanitation: capacity(facility.kind)[3] > 0.0
                    && !matches!(facility.kind, "biodigester" | "banana_treatment"),
            });
            if node.location != facility.location || node.size != facility.size {
                node.location = facility.location;
                node.size = facility.size;
                changed = true;
            }
            node.demanding = facility.working;
        }
        if changed {
            self.rebuild_topology();
        }
    }

    fn rebuild_topology(&mut self) {
        self.links = self.connections();
        self.power_links = self.power_tree();
        for &(a, b) in &self.installed_power_links {
            if !self.power_link_exists(a, b) {
                self.power_links.push((a, b));
            }
        }
        self.rebuild_power_circuits();
        self.topology_valid = true;
    }

    pub fn remove_facility(&mut self, building: usize) {
        let id = building + 1;
        if let Some(node) = self.nodes.remove(&id) {
            self.disabled_power_links
                .retain(|&(a, b)| a != id && b != id);
            self.installed_power_links
                .retain(|&(a, b)| a != id && b != id);
            self.disabled_water_links
                .retain(|&(from, to, _)| from != id && to != id);
            self.installed_water_links
                .retain(|&(from, to, _)| from != id && to != id);
            self.curtailed_kwh += node.charge;
            self.topology_valid = false;
        }
    }

    pub fn valid_save(&self, valid_building: impl Fn(usize, &str) -> bool) -> bool {
        self.disabled_water_links
            .iter()
            .chain(&self.installed_water_links)
            .all(|&(from, to, channel)| {
                from != to
                    && channel < LIQUID_NAMES.len()
                    && self.nodes.contains_key(&from)
                    && self.nodes.contains_key(&to)
            })
            && self
                .disabled_power_links
                .iter()
                .chain(&self.installed_power_links)
                .all(|&(a, b)| a < b && self.nodes.contains_key(&a) && self.nodes.contains_key(&b))
            && self.nodes.iter().all(|(id, node)| {
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
                    && (0.0..=1.0).contains(&node.service_factor)
                    && (!node.solar_upgrade
                        || node.kind == "home"
                            && node.solar_kw == 0.6
                            && (3.2..=4.0).contains(&node.battery))
                    && (0.0..=node.battery + 1e-8).contains(&node.charge)
            })
            && self.ground.as_ref().is_none_or(|ground| {
                ground.capacity > 0.0
                    && (0.0..=ground.capacity).contains(&ground.groundwater)
                    && ground.river >= 0.0
                    && ground.runoff >= 0.0
                    && ground.flow >= 0.0
                    && ground.account.as_ref().is_none_or(WaterAccount::valid)
            })
            && (0.0..1.0).contains(&self.grid_debt_cents)
            && self.biogas.is_finite()
            && self.biogas >= 0.0
            && self.latrine_waste_liters.is_finite()
            && self.latrine_waste_liters >= 0.0
    }

    pub fn water_sources(&self) -> impl Iterator<Item = (usize, IVec2, IVec2)> + '_ {
        self.water_sources_with(0.5)
    }

    pub(crate) fn water_sources_with(
        &self,
        amount: f64,
    ) -> impl Iterator<Item = (usize, IVec2, IVec2)> + '_ {
        self.nodes
            .iter()
            .filter(move |(_, node)| {
                node.enabled
                    && node.water[0] >= amount
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

    pub fn record_latrine_use(&mut self, liters: f64) {
        self.latrine_waste_liters += liters;
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
        let Some(site) = self.water_site(id) else {
            return false;
        };
        let enabled = if fresh {
            !site.maintain_fresh
        } else {
            !site.maintain_sanitation
        };
        self.set_water_policy(id, fresh, enabled)
    }

    pub fn set_water_policy(&mut self, id: usize, fresh: bool, enabled: bool) -> bool {
        if !self
            .water_site(id)
            .is_some_and(|site| site.supports_water_policy(fresh))
        {
            return false;
        }
        let node = self.nodes.get_mut(&id).expect("validated water site");
        if fresh {
            node.maintain_fresh = enabled;
        } else {
            node.maintain_sanitation = enabled;
        }
        true
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

    pub fn purify_water(&mut self, id: usize) -> f64 {
        self.nodes
            .get_mut(&id)
            .filter(|node| node.enabled)
            .map_or(0.0, |node| transform_water(node, 1, 0, 12.0, 1.0))
    }

    pub fn service_waste(&mut self, id: usize) -> f64 {
        let Some(node) = self.nodes.get_mut(&id).filter(|node| node.enabled) else {
            return 0.0;
        };
        let removed = node.water[2] + node.water[3];
        self.waste_removed += removed;
        node.water[2..].fill(0.0);
        removed
    }

    pub fn camp_water(&self) -> Option<[f64; 4]> {
        self.nodes.get(&0).map(|camp| camp.water)
    }

    pub fn carry_river_water(&mut self, amount: f64) -> f64 {
        let Some(ground) = &mut self.ground else {
            return 0.0;
        };
        let amount = amount.min(ground.river);
        ground.extract_river(amount);
        amount
    }

    pub fn put_camp_water(&mut self, amount: f64) {
        if let Some(camp) = self.nodes.get_mut(&0) {
            let accepted = (camp.capacity[1] - camp.water[1]).min(amount);
            camp.water[1] += accepted;
            if let Some(ground) = &mut self.ground {
                ground.account().returned += amount - accepted;
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

    pub fn building_switch(&self, building: usize) -> Option<bool> {
        let node = self.nodes.get(&(building + 1))?;
        (light_load(&node.kind) > 0.0
            || node.battery > 0.0
            || node.solar_kw > 0.0
            || node.kind == "hydro")
            .then_some(node.enabled)
    }

    pub fn toggle(&mut self, building: usize) {
        if let Some(enabled) = self.building_switch(building)
            && let Some(node) = self.nodes.get_mut(&(building + 1))
        {
            node.enabled = !enabled;
        }
    }

    pub fn update_condition(&mut self, building: usize, service_factor: f64, battery: f64) {
        if let Some(node) = self.nodes.get_mut(&(building + 1)) {
            node.service_factor = service_factor;
            if node.charge > battery {
                self.curtailed_kwh += node.charge - battery;
                node.charge = battery;
            }
            node.battery = battery;
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
            node.cooling_paused = false;
        }
    }

    pub fn cooling_switch(&self, building: usize) -> Option<bool> {
        self.nodes
            .get(&(building + 1))
            .filter(|node| node.cold_storage)
            .map(|node| !node.cooling_paused)
    }

    pub fn toggle_cooling(&mut self, building: usize) {
        if let Some(node) = self
            .nodes
            .get_mut(&(building + 1))
            .filter(|node| node.cold_storage)
        {
            node.cooling_paused = !node.cooling_paused;
        }
    }

    pub fn burn_biogas(&mut self, units: f64) -> bool {
        if self.biogas < units {
            return false;
        }
        self.biogas -= units;
        true
    }

    pub fn has_cold_storage(&self, building: usize) -> bool {
        self.nodes
            .get(&(building + 1))
            .is_some_and(|node| node.cold_storage)
    }

    pub fn installed_cold_storage(&self) -> f64 {
        self.nodes.values().filter(|node| node.cold_storage).count() as f64 * 80.0
    }

    pub fn powered_cold_storage(&self) -> f64 {
        self.nodes
            .values()
            .filter(|node| {
                node.cold_storage && !node.cooling_paused && node.enabled && node.powered
            })
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
        for (channel, name) in LIQUID_NAMES.iter().enumerate() {
            let capacity = node.capacity[channel];
            if capacity <= 0.0 {
                continue;
            }
            let liters = node.water[channel];
            if !status.is_empty() {
                status.push('\n');
            }
            use std::fmt::Write;
            let _ = write!(status, "{name} · {liters:.1}/{capacity:.1} L");
            if channel >= 2
                && let Some(warning) = waste_tank_warning(liters, capacity)
            {
                let _ = write!(status, " · Tank {warning}");
            }
        }
        if node.cold_storage {
            status.push_str("\nCold storage ");
            status.push_str(if node.cooling_paused {
                "off"
            } else if node.enabled && node.powered {
                "active"
            } else {
                "waiting for power"
            });
            status.push_str(" · L Switch cooling");
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

    pub fn service_overview(
        &self,
        thirsty: usize,
        sanitation_waiting: usize,
        daily_water: f64,
        sandbox: bool,
    ) -> String {
        let enabled = || self.nodes.values().filter(|node| node.enabled);
        let shortage = self.power_shortages().count();
        let power = if shortage > 0 {
            format!("{shortage} buildings undersupplied")
        } else if self.grid_import_kw > 0.0 {
            format!("{:.2} kW grid backup", self.grid_import_kw)
        } else if self.demand_kw > 0.0 {
            "Demand supplied".into()
        } else {
            "No demand".into()
        };
        let fresh: f64 = enabled()
            .filter(|node| !matches!(node.kind.as_str(), "coop" | "goat_pasture"))
            .map(|node| node.water[0])
            .sum();
        let water = if sandbox {
            "Sandbox".into()
        } else if thirsty > 0 {
            format!("{fresh:.1} L potable · {thirsty} thirsty")
        } else if fresh < 0.5 {
            "No drinking water".into()
        } else if daily_water > 0.0 {
            let hours = fresh / daily_water * 24.0;
            let warning = if hours < 6.0 { " · Low reserve" } else { "" };
            format!("{fresh:.1} L potable · {hours:.1}h estimated{warning}")
        } else {
            format!("{fresh:.1} L potable")
        };
        let sanitation = if sanitation_waiting > 0 {
            format!("{sanitation_waiting} residents need care")
        } else if self.toilets(1.5).next().is_none() {
            "Camp latrine fallback".into()
        } else if enabled().any(|node| {
            (2..4).any(|channel| {
                waste_tank_warning(node.water[channel], node.capacity[channel]).is_some()
            })
        }) {
            "Waste tanks filling".into()
        } else if self.wash_sources().next().is_none() {
            "No stocked washing facility".into()
        } else {
            "Toilet and washing capacity available".into()
        };
        format!("Power · {power}\nWater · {water} · Sanitation · {sanitation}")
    }

    pub fn stored_energy(&self) -> f64 {
        self.nodes
            .values()
            .fold(0.0, |total, node| total + node.charge)
    }

    pub fn stored_drinking_water(&self) -> f64 {
        self.nodes
            .values()
            .fold(0.0, |total, node| total + node.water[0])
    }

    pub fn water_link_exists(&self, from: usize, to: usize, channel: usize) -> bool {
        self.links
            .iter()
            .any(|pipe| (pipe.from, pipe.to, pipe.channel) == (from, to, channel))
    }

    pub fn install_water_link(&mut self, from: usize, to: usize, channel: usize) {
        self.installed_water_links.insert((from, to, channel));
        self.topology_valid = false;
    }

    pub fn water_link_count(&self) -> usize {
        self.links.len()
    }

    pub fn water_link(&self, row: usize) -> Option<(usize, usize, &'static str, bool)> {
        let pipe = self.links.get(row).or_else(|| self.links.last())?;
        Some((
            pipe.from,
            pipe.to,
            LIQUID_NAMES[pipe.channel],
            self.water_link_enabled(*pipe),
        ))
    }

    pub fn toggle_water_link(&mut self, row: usize) {
        if let Some(pipe) = self.links.get(row).or_else(|| self.links.last()) {
            let key = (pipe.from, pipe.to, pipe.channel);
            if !self.disabled_water_links.remove(&key) {
                self.disabled_water_links.insert(key);
            }
        }
    }

    fn water_link_enabled(&self, pipe: Pipe) -> bool {
        !self
            .disabled_water_links
            .contains(&(pipe.from, pipe.to, pipe.channel))
    }

    pub fn power_link_exists(&self, from: usize, to: usize) -> bool {
        let endpoints = (from.min(to), from.max(to));
        self.power_links
            .iter()
            .any(|&(a, b)| (a.min(b), a.max(b)) == endpoints)
    }

    pub fn install_power_link(&mut self, from: usize, to: usize) {
        self.installed_power_links
            .insert((from.min(to), from.max(to)));
        self.topology_valid = false;
    }

    pub fn power_at(&self, cell: IVec2) -> Option<usize> {
        self.nodes.iter().find_map(|(&id, node)| {
            (cell.cmpge(node.location).all() && cell.cmplt(node.location + node.size).all())
                .then_some(id)
        })
    }

    pub fn connection_row(
        &self,
        from: usize,
        to: usize,
        channel: Option<usize>,
    ) -> Option<(usize, bool)> {
        if let Some(channel) = channel {
            let row = self
                .links
                .iter()
                .position(|pipe| (pipe.from, pipe.to, pipe.channel) == (from, to, channel))?;
            Some((row, self.water_link_enabled(self.links[row])))
        } else {
            let key = (from.min(to), from.max(to));
            let row = self
                .power_links
                .iter()
                .position(|&(a, b)| (a.min(b), a.max(b)) == key)?;
            Some((row, self.power_link_open(from, to)))
        }
    }

    pub fn is_manual_link(&self, row: usize, power: bool) -> bool {
        if power {
            self.power_link(row)
                .is_some_and(|(a, b, _)| self.installed_power_links.contains(&(a.min(b), a.max(b))))
        } else {
            self.links
                .get(row)
                .or_else(|| self.links.last())
                .is_some_and(|pipe| {
                    self.installed_water_links
                        .contains(&(pipe.from, pipe.to, pipe.channel))
                })
        }
    }

    pub fn remove_manual_link(&mut self, row: usize, power: bool) {
        let removed = if power {
            self.power_link(row).is_some_and(|(a, b, _)| {
                let key = (a.min(b), a.max(b));
                let removed = self.installed_power_links.remove(&key);
                if removed {
                    self.disabled_power_links.remove(&key);
                }
                removed
            })
        } else {
            self.links
                .get(row)
                .or_else(|| self.links.last())
                .is_some_and(|pipe| {
                    let key = (pipe.from, pipe.to, pipe.channel);
                    let removed = self.installed_water_links.remove(&key);
                    if removed {
                        self.disabled_water_links.remove(&key);
                    }
                    removed
                })
        };
        if removed {
            self.rebuild_topology();
        }
    }

    pub fn power_link_count(&self) -> usize {
        self.power_links.len()
    }

    pub fn power_link(&self, row: usize) -> Option<(usize, usize, bool)> {
        let &(a, b) = self
            .power_links
            .get(row)
            .or_else(|| self.power_links.last())?;
        Some((a, b, self.power_link_open(a, b)))
    }

    pub fn toggle_power_link(&mut self, row: usize) {
        if let Some((a, b, _)) = self.power_link(row) {
            let pair = (a.min(b), a.max(b));
            if !self.disabled_power_links.remove(&pair) {
                self.disabled_power_links.insert(pair);
            }
            self.rebuild_power_circuits();
        }
    }

    fn power_link_open(&self, a: usize, b: usize) -> bool {
        !self.disabled_power_links.contains(&(a.min(b), a.max(b)))
    }

    fn rebuild_power_circuits(&mut self) {
        fn root(parents: &BTreeMap<usize, usize>, mut node: usize) -> usize {
            while let Some(&parent) = parents.get(&node) {
                node = parent;
            }
            node
        }

        let mut parents = BTreeMap::new();
        for &(from, to) in &self.power_links {
            if self.power_link_open(from, to) {
                let a = root(&parents, from);
                let b = root(&parents, to);
                if a != b {
                    parents.insert(a.max(b), a.min(b));
                }
            }
        }
        self.power_circuits = parents.keys().map(|&id| (id, root(&parents, id))).collect();
    }

    pub fn power_shortages(&self) -> impl Iterator<Item = usize> + '_ {
        self.nodes
            .iter()
            .filter_map(|(&id, node)| (node.enabled && !node.powered).then_some(id))
    }

    pub fn power_summary(&self) -> String {
        let stored = self.stored_energy();
        let capacity: f64 = self.nodes.values().map(|node| node.battery).sum();
        format!(
            "Power · {:.2} kW solar/hydro · {:.2} kW demand\nBattery {stored:.2}/{capacity:.2} kWh · {:.2} kW grid · R${:.2} used\nGrid {} · O Switch grid",
            self.generation_kw,
            self.demand_kw,
            self.grid_import_kw,
            self.grid_spent / 100.0,
            if self.grid_off { "off" } else { "on" },
        )
    }

    pub fn watershed_sample(&self) -> Option<WatershedSample> {
        self.ground.as_ref().map(|ground| WatershedSample {
            aquifer_capacity_liters: ground.capacity,
            groundwater_liters: ground.groundwater,
            river_reserve_liters: ground.river,
            river_flow_liters_per_day: ground.flow,
            runoff_liters: ground.runoff,
        })
    }

    pub fn waste_tanks_needing_attention(
        &self,
    ) -> impl Iterator<Item = (usize, usize, &'static str, &'static str)> + '_ {
        self.nodes.iter().flat_map(|(&id, node)| {
            LIQUID_NAMES
                .iter()
                .enumerate()
                .skip(2)
                .filter_map(move |(channel, &name)| {
                    let warning = waste_tank_warning(node.water[channel], node.capacity[channel])?;
                    Some((id, channel, name, warning))
                })
        })
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
        if self.latrine_waste_liters > 0.0 {
            text.push_str(&format!(
                "\nCamp latrine · {:.1} L waste recorded",
                self.latrine_waste_liters
            ));
        }
        if let Some(ground) = &self.ground {
            text.push_str(&format!(
                "\nAquifer {:.0} / {:.0} L · River reserve {:.0} L · Flow {:.0} L/day",
                ground.groundwater, ground.capacity, ground.river, ground.flow
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

        let circuit_of = |id| self.power_circuits.get(&id).copied().unwrap_or(id);

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
            circuit.generation += output * node.service_factor;
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
            if node.cold_storage && !node.cooling_paused {
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
            let account = ground.account();
            account.catchment_rain += total;
            account.captured += collected;
            account.catchment_overflow += total - collected;
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
                    ground.account().groundwater_extracted += extraction;
                    ground.groundwater -= extraction;
                    node.water[1] += extraction;
                }
                "water-pump" if node.powered && node.water[1] < node.capacity[1] - 0.01 => {
                    pumping.push(id)
                }
                "well" if node.powered => {
                    transform_water(node, 1, 0, 25.0 * hours * node.service_factor, 1.0);
                }
                "wetland" => {
                    transform_water(node, 2, 1, 10.0 * hours, 0.85);
                }
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
            let volume =
                (600.0 * hours * pump.service_factor).min(pump.capacity[1] - pump.water[1]);
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
            ground.extract_river(from_river);
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
        for &(from, to, channel) in &self.installed_water_links {
            if !links
                .iter()
                .any(|pipe| (pipe.from, pipe.to, pipe.channel) == (from, to, channel))
            {
                links.push(Pipe { from, to, channel });
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

    pub fn draw_queued_connection(
        &self,
        terrain: &Terrain,
        (from, to): (usize, usize),
        channel: Option<usize>,
        progress: f32,
        gizmos: &mut Gizmos,
    ) {
        let (Some(from), Some(to)) = (self.nodes.get(&from), self.nodes.get(&to)) else {
            return;
        };
        let center = |node: &Node| {
            let cell = node.location.as_vec2() + (node.size.as_vec2() - Vec2::ONE) * 0.5;
            world_position(cell.x, cell.y)
        };
        let (from, to) = (center(from), center(to));
        let steps = (from.distance(to) / 2.0).ceil().max(1.0) as usize;
        let lift = channel.map_or(0.68, |channel| 0.3 + channel as f32 * 0.06);
        let point_at = |fraction| {
            let Vec2 { x, y: z } = from.lerp(to, fraction);
            Vec3::new(x, terrain.height_at(x, z) + lift, z)
        };
        for step in 0..steps {
            let start = step as f32 / steps as f32;
            let end = (step as f32 + 0.55) / steps as f32;
            if progress > start {
                gizmos.line(
                    point_at(start),
                    point_at(end.min(progress)),
                    Color::srgb_u8(255, 213, 127),
                );
            }
            if progress < end {
                gizmos.line(
                    point_at(start.max(progress)),
                    point_at(end),
                    Color::srgb_u8(173, 177, 182),
                );
            }
        }
    }

    pub fn draw_network(&self, terrain: &Terrain, view: NetworkView, gizmos: &mut Gizmos) {
        let power = view == NetworkView::Power;
        let center = |node: &Node| {
            let cell = node.location.as_vec2() + (node.size.as_vec2() - Vec2::ONE) * 0.5;
            world_position(cell.x, cell.y)
        };
        let draw = |gizmos: &mut Gizmos,
                    pair: (usize, usize),
                    color: Color,
                    channel: usize,
                    enabled: bool| {
            let (Some(from), Some(to)) = (self.nodes.get(&pair.0), self.nodes.get(&pair.1)) else {
                return;
            };
            let steps = (center(from).distance(center(to)) / 2.0).ceil().max(1.0) as usize;
            let lift = if channel == 4 {
                0.55
            } else {
                0.18 + channel as f32 * 0.06
            };
            let active = enabled && (!power || (from.powered && to.powered));
            let tint = if from.enabled && to.enabled && active {
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
                draw(
                    gizmos,
                    pair,
                    Color::srgb_u8(255, 221, 114),
                    4,
                    self.power_link_open(pair.0, pair.1),
                );
            }
        } else {
            let colors = [
                Color::srgb_u8(101, 214, 255),
                Color::srgb_u8(117, 223, 149),
                Color::srgb_u8(196, 161, 252),
                Color::srgb_u8(234, 163, 90),
            ];
            for pipe in &self.links {
                if !view.channels().contains(&pipe.channel) {
                    continue;
                }
                draw(
                    gizmos,
                    (pipe.from, pipe.to),
                    colors[pipe.channel],
                    pipe.channel,
                    self.water_link_enabled(*pipe),
                );
            }
        }
    }

    pub fn focus_lens_site(
        &self,
        view: NetworkView,
        selected: Option<usize>,
        forward: bool,
    ) -> Option<(usize, Vec2)> {
        let sites = || {
            self.nodes
                .iter()
                .filter(|(_, node)| node.matches_view(view))
        };
        let (id, node) = if forward {
            sites()
                .find(|&(&id, _)| selected.is_none_or(|previous| id > previous))
                .or_else(|| sites().next())?
        } else {
            sites()
                .rev()
                .find(|&(&id, _)| selected.is_none_or(|previous| id < previous))
                .or_else(|| sites().next_back())?
        };
        let center = node.location.as_vec2() + (node.size.as_vec2() - Vec2::ONE) * 0.5;
        Some((*id, world_position(center.x, center.y)))
    }

    pub fn draw_lens(
        &self,
        terrain: &Terrain,
        view: NetworkView,
        (hovered, focused): (Option<IVec2>, Option<usize>),
        gizmos: &mut Gizmos,
    ) -> String {
        use std::fmt::Write;

        self.draw_network(terrain, view, gizmos);
        let mut label = match view {
            NetworkView::Power => {
                "Power · Green available · Red unmet demand · Gray off or idle".into()
            }
            NetworkView::Water => {
                "Water · Blue fresh · Green irrigation · Purple greywater · Orange sewage".into()
            }
            NetworkView::Liquid(channel) => format!(
                "Water · {} · Shift+Page Up/Down Change liquid\nBlue enabled · Gold empty supply · Red waste storage full · Gray off",
                LIQUID_NAMES[channel]
            ),
            NetworkView::Sanitation => {
                "Sanitation · Purple greywater · Orange sewage pipes · Red storage full".into()
            }
        };
        label.push_str("\nCtrl+Page Up/Down Find facility");
        let displayed_hover = hovered.and_then(|cell| {
            self.nodes.iter().find_map(|(&id, node)| {
                (node.matches_view(view)
                    && cell.cmpge(node.location).all()
                    && cell.cmplt(node.location + node.size).all())
                .then_some(id)
            })
        });
        let inspected = displayed_hover.or(focused);
        for (&id, node) in self
            .nodes
            .iter()
            .filter(|(_, node)| node.matches_view(view))
        {
            let channels = view.channels();
            let (color, detail) = match view {
                NetworkView::Power => {
                    let (state, color) = if !node.enabled {
                        ("Switched off", Color::srgb_u8(147, 146, 140))
                    } else if node.powered {
                        ("Powered", Color::srgb_u8(136, 220, 148))
                    } else {
                        ("Waiting for power", Color::srgb_u8(222, 112, 96))
                    };
                    (color, state)
                }
                NetworkView::Water | NetworkView::Liquid(_) | NetworkView::Sanitation => {
                    if !node.enabled {
                        (Color::srgb_u8(147, 146, 140), "Switched off")
                    } else if channels.clone().any(|channel| {
                        channel >= 2
                            && node.capacity[channel] > 0.0
                            && node.water[channel] >= node.capacity[channel] - 0.01
                    }) {
                        (Color::srgb_u8(222, 112, 96), "Storage full")
                    } else if let NetworkView::Liquid(channel @ 0..=1) = view
                        && node.water[channel] < 0.01
                    {
                        (Color::srgb_u8(243, 200, 108), "Empty")
                    } else {
                        (Color::srgb_u8(101, 214, 255), "Enabled")
                    }
                }
            };
            let center = node.location.as_vec2() + (node.size.as_vec2() - Vec2::ONE) * 0.5;
            let Vec2 { x, y: z } = world_position(center.x, center.y);
            let ground = Vec3::new(x, terrain.height_at(x, z), z);
            let tip = ground + Vec3::Y * 6.0;
            gizmos.line(ground, tip, color);
            for axis in [Vec3::X, Vec3::Z] {
                gizmos.line(tip - axis * 0.6, tip + axis * 0.6, color);
            }
            if inspected == Some(id) {
                let _ = write!(label, "\n{} · {detail}", node.kind.replace('-', " "));
                if view == NetworkView::Power && node.battery > 0.0 {
                    let _ = write!(label, " · {:.2}/{:.2} kWh", node.charge, node.battery);
                } else if view != NetworkView::Power {
                    for channel in channels.filter(|&channel| node.capacity[channel] > 0.0) {
                        let _ = write!(
                            label,
                            " · {} {:.1}/{:.1} L",
                            LIQUID_NAMES[channel], node.water[channel], node.capacity[channel]
                        );
                    }
                }
            }
        }
        label
    }

    fn transfer(&mut self, hours: f64) {
        let mut counts = BTreeMap::<(usize, usize), usize>::new();
        for pipe in &self.links {
            if !self.water_link_enabled(*pipe) {
                continue;
            }
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
        for &pipe in &self.links {
            if !self.water_link_enabled(pipe) {
                continue;
            }
            let Pipe { from, to, channel } = pipe;
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
            account: Some(WaterAccount {
                initial: groundwater + river,
                ..Default::default()
            }),
        }
    }

    fn account(&mut self) -> &mut WaterAccount {
        self.account.get_or_insert_with(|| WaterAccount {
            initial: self.groundwater + self.river + self.runoff,
            ..Default::default()
        })
    }

    fn extract_river(&mut self, volume: f64) {
        self.account().river_extracted += volume;
        self.river -= volume;
    }

    fn step(&mut self, factor: f64, season: f64, rainfall: f64, dt: f64) {
        let days = dt / DAY;
        let rain = rainfall * 24.0 * days * 4000.0;
        let upstream = 8000.0 * factor * (0.15 + 0.85 * season) * days;
        self.account();
        self.runoff += rain;
        let released = self.runoff * -(-days / 2.0).exp_m1();
        self.runoff -= released;
        let recharge = (self.capacity - self.groundwater).min(released * 0.6);
        self.groundwater += recharge;
        let base = self.groundwater * -(-days / 180.0).exp_m1();
        self.groundwater -= base;
        self.river += released - recharge + base + upstream;
        let out = self.river * -(-days).exp_m1();
        self.river -= out;
        self.flow = out / days;
        let account = self.account();
        account.rain += rain;
        account.upstream += upstream;
        account.recharged += recharge;
        account.baseflow += base;
        account.outflow += out;
    }
}

impl WaterAccount {
    fn valid(&self) -> bool {
        [
            self.initial,
            self.rain,
            self.upstream,
            self.recharged,
            self.baseflow,
            self.groundwater_extracted,
            self.river_extracted,
            self.outflow,
            self.catchment_rain,
            self.captured,
            self.catchment_overflow,
            self.returned,
        ]
        .into_iter()
        .all(|volume| volume.is_finite() && volume >= 0.0)
    }
}

fn transform_water(node: &mut Node, from: usize, to: usize, volume: f64, retained: f64) -> f64 {
    let amount = node.water[from]
        .min(volume)
        .min((node.capacity[to] - node.water[to]) / retained)
        .max(0.0);
    node.water[from] -= amount;
    node.water[to] += amount * retained;
    amount
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

fn full_service() -> f64 {
    1.0
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
    #[test]
    fn older_hydrology_saves_begin_a_balanced_water_account() {
        let mut ground: Hydrology = serde_json::from_str(
            r#"{"capacity":120000,"groundwater":50000,"river":5000,"runoff":300,"flow":6500}"#,
        )
        .unwrap();
        ground.step(1.0, 0.7, 0.4, DAY / 24.0);
        ground.extract_river(12.0);
        let account = ground.account.as_ref().unwrap();
        assert_eq!(account.initial, 55_300.0);
        assert_eq!(account.river_extracted, 12.0);
        let remaining = ground.groundwater + ground.river + ground.runoff;
        let ledger = account.initial + account.rain + account.upstream
            - account.river_extracted
            - account.outflow;
        assert!((remaining - ledger).abs() < 1e-8);
    }

    use super::*;
    use crate::catalog::Catalog;

    #[test]
    fn selected_sanitation_facility_shows_each_tank_and_its_warning() {
        let mut utilities = Utilities::default();
        utilities.sync(std::iter::once(Facility {
            id: 1,
            kind: "eco_toilet",
            location: IVec2::new(44, 36),
            size: IVec2::ONE,
            batteries: 0,
            panels: 0,
            working: false,
        }));
        utilities.nodes.get_mut(&1).unwrap().water = [4.0, 0.0, 14.5, 16.0];

        let status = utilities.facility_status(0).unwrap();
        assert!(status.contains("Drinking water · 4.0/8.0 L"));
        assert!(status.contains("Greywater · 14.5/16.0 L · Tank nearly full"));
        assert!(status.contains("Sewage · 16.0/16.0 L · Tank full"));
        assert!(!status.contains("Irrigation"));
    }

    #[test]
    fn cooling_switch_removes_load_without_switching_off_the_kitchen() {
        let setup = WorldSetup::default();
        let mut stock = Stock::for_start(&setup, &Catalog::default());
        let mut utilities = Utilities::default();
        utilities.sync(
            [Facility {
                id: 1,
                kind: "kitchen",
                location: IVec2::new(44, 36),
                size: IVec2::ONE,
                batteries: 0,
                panels: 0,
                working: false,
            }]
            .into_iter(),
        );
        utilities.install_cold_storage(0);
        utilities.tick(&setup, &mut stock, 0, 1.0, 0.1);
        assert_eq!(utilities.powered_cold_storage(), 80.0);
        assert_eq!(utilities.demand_kw, 0.08);
        assert!(utilities.power_shortages().next().is_none());
        utilities.grid_off = true;
        utilities.tick(&setup, &mut stock, 0, 2.0, 0.1);
        assert_eq!(utilities.power_shortages().collect::<Vec<_>>(), [1]);

        utilities.toggle_cooling(0);
        utilities.tick(&setup, &mut stock, 0, 3.0, 0.1);
        assert!(utilities.power_shortages().next().is_none());
        assert_eq!(utilities.powered_cold_storage(), 0.0);
        assert_eq!(utilities.installed_cold_storage(), 80.0);
        assert_eq!(utilities.demand_kw, 0.0);
        assert!(utilities.powered(0));
        let save = serde_json::to_string(&utilities).unwrap();
        let loaded: Utilities = serde_json::from_str(&save).unwrap();
        assert!(
            loaded
                .facility_status(0)
                .unwrap()
                .contains("Cold storage off")
        );
    }

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
        let water_link = utilities
            .links
            .iter()
            .position(|pipe| (pipe.from, pipe.to, pipe.channel) == (3, 4, 1))
            .unwrap();
        utilities.deliver_water(3, 1, 10.0);
        utilities.toggle_water_link(water_link);
        utilities.transfer(1.0);
        assert_eq!(utilities.nodes[&4].water[1], 0.0);
        let mut reopened: Utilities =
            serde_json::from_str(&serde_json::to_string(&utilities).unwrap()).unwrap();
        reopened.sync(std::iter::empty());
        assert_eq!(
            reopened.water_link(water_link),
            Some((3, 4, "Irrigation", false))
        );
        reopened.toggle_water_link(water_link);
        reopened.transfer(1.0);
        assert!(reopened.nodes[&4].water[1] > 0.0);

        utilities.tick(&setup, &mut stock, 0, 1.0, 0.1);
        assert!(utilities.generation_kw > 0.45);
        assert!(!utilities.powered(0));

        utilities.sync([node(6, "solar_farm", 10, 0, 1, 6)].into_iter());
        assert_eq!(utilities.power_links.last(), Some(&(1, 6)));
        utilities.tick(&setup, &mut stock, 0, 2.0, 0.1);
        assert!(utilities.powered(0));
        assert_eq!(utilities.grid_import_kw, 0.0);
        assert!(utilities.nodes[&6].charge > 0.0);

        let link = utilities.power_link_count() - 1;
        utilities.toggle_power_link(link);
        utilities.tick(&setup, &mut stock, 0, 3.0, 0.1);
        assert!(!utilities.powered(0));
        let mut restored: Utilities =
            serde_json::from_str(&serde_json::to_string(&utilities).unwrap()).unwrap();
        restored.sync(std::iter::empty());
        assert_eq!(restored.power_link(link), Some((1, 6, false)));
        restored.toggle_power_link(link);
        restored.tick(&setup, &mut stock, 0, 4.0, 0.1);
        assert!(restored.powered(0));

        restored.toggle_power_link(link);
        restored.install_power_link(6, 0);
        restored.sync(std::iter::empty());
        restored.tick(&setup, &mut stock, 0, 5.0, 0.1);
        assert_eq!(restored.power_link(link), Some((1, 6, false)));
        assert!(restored.power_link_exists(0, 6));
        assert!(restored.powered(0));

        let mut loaded: Utilities =
            serde_json::from_str(&serde_json::to_string(&restored).unwrap()).unwrap();
        loaded.sync(std::iter::empty());
        loaded.tick(&setup, &mut stock, 0, 6.0, 0.1);
        assert!(loaded.power_link_exists(6, 0));
        assert!(loaded.powered(0));

        let manual = (0..loaded.power_link_count())
            .find(|&row| loaded.is_manual_link(row, true))
            .unwrap();
        loaded.remove_manual_link(manual, true);
        loaded.tick(&setup, &mut stock, 0, 7.0, 0.1);
        assert!(!loaded.power_link_exists(0, 6));
        assert!(!loaded.powered(0));
        loaded.remove_manual_link(link, true);
        assert!(loaded.power_link_exists(1, 6));
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
