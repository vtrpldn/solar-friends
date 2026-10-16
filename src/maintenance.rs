//! Equipment condition follows owned hardware, not its current map position.
use crate::*;
use simulation::Id;

pub const SERVICE_AT: f64 = 70.;
pub const FAILURE_AT: f64 = 10.;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "id", rename_all = "snake_case")]
pub enum Equipment {
    Pump(Id),
    Workshop(usize),
    Battery(Id),
    Truck,
}
impl Equipment {
    fn rates(self) -> (f64, f64) {
        // Fictional balance: exposure per day, then damage per unit of actual use.
        match self {
            Self::Pump(_) => (0.20, 0.012),
            Self::Workshop(_) => (0.12, 0.004),
            Self::Battery(_) => (0.10, 0.015),
            Self::Truck => (0.08, 0.015),
        }
    }
    fn label(self) -> &'static str {
        match self {
            Self::Pump(_) => "Water pump",
            Self::Workshop(_) => "Workshop tools",
            Self::Battery(_) => "Battery system",
            Self::Truck => "Shared pickup",
        }
    }
    fn units(self) -> &'static str {
        match self {
            Self::Pump(_) => "water pumped",
            Self::Workshop(_) => "attended work minutes",
            Self::Battery(_) => "observed charge movement",
            Self::Truck => "completed driving minutes",
        }
    }
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Record {
    pub equipment: Equipment,
    pub commissioned: f32,
    pub condition: f64,
    pub exposure_minutes: f64,
    pub use_units: f64,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct State {
    pub schema: u32,
    pub enabled: bool,
    pub records: Vec<Record>,
}
impl Default for State {
    fn default() -> Self {
        Self {
            schema: 1,
            enabled: false,
            records: vec![],
        }
    }
}
#[derive(Clone)]
struct Asset {
    equipment: Equipment,
    location: [f32; 2],
    sheltered: bool,
}
fn assets(v: &Village) -> Vec<Asset> {
    let mut result = vec![Asset {
        equipment: Equipment::Truck,
        location: [CAMP.0, CAMP.1],
        sheltered: false,
    }];
    result.extend(v.buildings.iter().filter_map(|b| {
        (b.kind == "workshop"
            && (b.progress >= 100. || building_work::original_progress(v, b.id) == Some(100.)))
        .then_some(Asset {
            equipment: Equipment::Workshop(b.id),
            location: [b.x as f32, b.y as f32],
            sheltered: true,
        })
    }));
    result.extend(v.power.network.nodes.iter().filter_map(|n| {
        let equipment = if n.capacity > 0. {
            Equipment::Battery(n.id)
        } else if n.kind == electricity::Kind::Pump {
            Equipment::Pump(n.id)
        } else {
            return None;
        };
        Some(Asset {
            equipment,
            location: [n.x as f32, n.y as f32],
            sheltered: matches!(n.owner, electricity::Owner::Carrier(_))
                || n.kind == electricity::Kind::Roof,
        })
    }));
    result
}
pub fn sync(v: &mut Village) {
    // The condition model is staged behind an explicit switch until attended
    // repairs and player controls are delivered. Existing play keeps its rules.
    let wanted = assets(v);
    v.maintenance
        .records
        .retain(|r| wanted.iter().any(|a| a.equipment == r.equipment));
    if !v.maintenance.enabled {
        return;
    }
    for a in wanted {
        if !v
            .maintenance
            .records
            .iter()
            .any(|r| r.equipment == a.equipment)
        {
            v.maintenance.records.push(Record {
                equipment: a.equipment,
                commissioned: v.minutes,
                condition: 100.,
                exposure_minutes: 0.,
                use_units: 0.,
            });
        }
    }
}
pub fn advance(v: &mut Village, minutes: f32) {
    sync(v);
    if !v.maintenance.enabled || !minutes.is_finite() || minutes <= 0. {
        return;
    }
    let rain = climate::at(v, v.minutes - minutes / 2.).rain;
    let wanted = assets(v);
    for r in &mut v.maintenance.records {
        let sheltered = wanted
            .iter()
            .find(|a| a.equipment == r.equipment)
            .unwrap()
            .sheltered;
        let exposure = f64::from(minutes)
            * if sheltered {
                0.5
            } else {
                1. + f64::from(rain) * 0.25
            };
        r.exposure_minutes += exposure;
        r.condition = (r.condition - exposure / 1440. * r.equipment.rates().0).max(0.);
    }
}
pub fn used(v: &mut Village, equipment: Equipment, units: f64) {
    if !v.maintenance.enabled || !units.is_finite() || units <= 0. {
        return;
    }
    if let Some(r) = v
        .maintenance
        .records
        .iter_mut()
        .find(|r| r.equipment == equipment)
    {
        if units > 1e9 - r.use_units {
            return;
        }
        r.use_units += units;
        r.condition = (r.condition - units * equipment.rates().1).max(0.);
    }
}
pub fn pump_used(v: &mut Village, line: Id, water: f64) {
    if !v.maintenance.enabled {
        return;
    }
    if let Some(node) = v
        .power
        .network
        .nodes
        .iter()
        .find(|n| n.owner == electricity::Owner::Pump(line))
    {
        used(v, Equipment::Pump(node.id), water);
    }
}
pub fn factor(condition: f64) -> f64 {
    if condition <= FAILURE_AT {
        0.
    } else if condition >= SERVICE_AT {
        1.
    } else {
        0.5 + 0.5 * (condition - FAILURE_AT) / (SERVICE_AT - FAILURE_AT)
    }
}
pub fn valid(v: &Village) -> bool {
    let wanted = assets(v);
    let records = &v.maintenance.records;
    v.maintenance.schema == 1
        && (!v.maintenance.enabled || records.len() == wanted.len())
        && records.len() <= 1701
        && records.iter().enumerate().all(|(i, r)| {
            wanted.iter().any(|a| a.equipment == r.equipment)
                && !records[..i].iter().any(|p| p.equipment == r.equipment)
                && r.commissioned.is_finite()
                && (0.0..=v.minutes).contains(&r.commissioned)
                && r.condition.is_finite()
                && (0.0..=100.).contains(&r.condition)
                && [r.exposure_minutes, r.use_units]
                    .iter()
                    .all(|n| n.is_finite() && (0.0..=1e9).contains(n))
        })
}
pub fn report(v: &Village) -> serde_json::Value {
    let rows: Vec<_> = assets(v).iter().map(|a| {
        let r = v.maintenance.records.iter().find(|r| r.equipment == a.equipment);
        let condition = r.map_or(100., |r| r.condition);
        serde_json::json!({"equipment":a.equipment,"name":a.equipment.label(),"location":a.location,
            "condition":condition,"service_due":condition<=SERVICE_AT,"failed":condition<=FAILURE_AT,
            "condition_factor":factor(condition),"use_units":r.map_or(0.,|r|r.use_units),"unit":a.equipment.units(),
            "exposure_minutes":r.map_or(0.,|r|r.exposure_minutes)})
    }).collect();
    serde_json::json!({"schema":v.maintenance.schema,"enabled":v.maintenance.enabled,"service_at":SERVICE_AT,"failure_at":FAILURE_AT,
        "operating_penalties_active":false,"equipment":rows})
}
#[wasm_bindgen]
impl Game {
    pub fn maintenance_report(&self) -> String {
        report(self.app.world().resource::<Village>()).to_string()
    }
    pub fn set_equipment_condition(&mut self, enabled: bool) {
        let mut v = self.app.world_mut().resource_mut::<Village>();
        v.maintenance.enabled = enabled;
        sync(&mut v);
    }
}

#[cfg(test)]
mod tests;
