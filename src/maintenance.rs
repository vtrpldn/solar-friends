//! Equipment condition follows owned hardware, not its current map position.
use crate::*;
use simulation::Id;

pub mod jobs;

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
            Self::Pump(_) => (0.50, 0.012),
            Self::Workshop(_) => (0.60, 0.004),
            Self::Battery(_) => (0.45, 0.015),
            Self::Truck => (0.45, 0.015),
        }
    }
    pub(crate) fn label(self) -> &'static str {
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
    #[serde(default)]
    pub automatic_deferred: bool,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct State {
    pub schema: u32,
    pub enabled: bool,
    pub automatic: bool,
    pub records: Vec<Record>,
    pub jobs: Vec<jobs::Job>,
}
impl Default for State {
    fn default() -> Self {
        Self {
            schema: 1,
            enabled: false,
            automatic: false,
            records: vec![],
            jobs: vec![],
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
        location: [crate::camp(v).0, crate::camp(v).1],
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
            // Planned ports do not own a pump yet. A commissioned pump keeps
            // its record when relocation gives its node a replacement line.
            let owned=matches!(n.owner,electricity::Owner::Pump(id) if pipes::line(v,id).is_some_and(|p|pipes::installed(v,p)));
            if !owned && !v.maintenance.records.iter().any(|r|r.equipment==Equipment::Pump(n.id)) {return None;}
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
/// Physical equipment present before any authored overrides.
pub(crate) fn starting_assets(v: &Village) -> Vec<(Equipment, [f32; 2])> {
    assets(v)
        .into_iter()
        .map(|a| (a.equipment, a.location))
        .collect()
}
/// Seed current physical condition without accumulated wear or service history.
/// Disabled maintenance retains the baseline without aging it.
pub(crate) fn seed_condition(
    v: &mut Village,
    equipment: Equipment,
    condition: f64,
    deferred: bool,
) -> bool {
    if !condition.is_finite()
        || !(0.0..=100.).contains(&condition)
        || !assets(v).iter().any(|a| a.equipment == equipment)
    {
        return false;
    }
    let record = Record {
        equipment,
        commissioned: v.minutes,
        condition,
        exposure_minutes: 0.,
        use_units: 0.,
        automatic_deferred: deferred,
    };
    if let Some(r) = v.maintenance.records.iter_mut().find(|r| r.equipment == equipment) {
        *r = record;
    } else {
        v.maintenance.records.push(record);
    }
    true
}
pub fn sync(v: &mut Village) {
    if !v.maintenance.enabled && v.maintenance.records.is_empty() && v.maintenance.jobs.is_empty() {
        return;
    }
    // Disabled Sandbox equipment retains its saved condition without aging.
    jobs::reconcile(v);
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
                automatic_deferred: false,
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
    if v.maintenance.automatic {
        let due: Vec<_> = v
            .maintenance
            .records
            .iter()
            .filter(|r| {
                r.condition <= SERVICE_AT
                    && !r.automatic_deferred
                    && !jobs::in_service(v, r.equipment)
            })
            .map(|r| r.equipment)
            .collect();
        for equipment in due {
            let _ = jobs::queue(v, equipment);
        }
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
pub fn servicing(v: &Village, equipment: Equipment) -> bool {
    v.maintenance.enabled
        && v.maintenance
            .jobs
            .iter()
            .any(|j| j.equipment == equipment && j.active() && j.spent.is_some())
}
pub fn performance(v: &Village, equipment: Equipment) -> f64 {
    if !v.maintenance.enabled {
        return 1.;
    }
    if servicing(v, equipment) {
        return 0.;
    }
    v.maintenance
        .records
        .iter()
        .find(|r| r.equipment == equipment)
        .map_or(1., |r| factor(r.condition))
}
pub fn pump_performance(v: &Village, line: Id) -> f64 {
    v.power
        .network
        .nodes
        .iter()
        .find(|n| n.owner == electricity::Owner::Pump(line))
        .map_or(1., |n| performance(v, Equipment::Pump(n.id)))
}
pub fn valid(v: &Village) -> bool {
    let wanted = assets(v);
    let records = &v.maintenance.records;
    jobs::valid(v)
        && v.maintenance.schema == 1
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
        let estimate=r.and_then(|r| {
            let elapsed=f64::from(v.minutes-r.commissioned)/1440.;
            let rates=a.equipment.rates();let wear=r.exposure_minutes/1440.*rates.0+r.use_units*rates.1;
            (elapsed>=1.&&wear>0.).then(||((condition-SERVICE_AT).max(0.)/(wear/elapsed)).ceil())
        });
        serde_json::json!({"equipment":a.equipment,"name":a.equipment.label(),"location":a.location,
            "condition":condition,"service_due":condition<=SERVICE_AT,"failed":condition<=FAILURE_AT,
            "condition_factor":performance(v,a.equipment),"in_service":servicing(v,a.equipment),"use_units":r.map_or(0.,|r|r.use_units),"unit":a.equipment.units(),
            "estimated_days_to_service":estimate,"service_kit":jobs::kit(a.equipment),"automatic_deferred":r.is_some_and(|r|r.automatic_deferred),"exposure_minutes":r.map_or(0.,|r|r.exposure_minutes)})
    }).collect();
    serde_json::json!({"schema":v.maintenance.schema,"enabled":v.maintenance.enabled,"automatic":v.maintenance.automatic,"service_at":SERVICE_AT,"failure_at":FAILURE_AT,
        "operating_penalties_active":v.maintenance.enabled,"equipment":rows,"jobs":jobs::view(v)})
}
#[wasm_bindgen]
impl Game {
    pub fn set_automatic_service(&mut self, enabled: bool) {
        self.app
            .world_mut()
            .resource_mut::<Village>()
            .maintenance
            .automatic = enabled;
    }
    pub fn queue_equipment_service(&mut self, data: &str) -> String {
        let Ok(key) = serde_json::from_str::<Equipment>(data) else {
            return "Choose existing equipment.".into();
        };
        match jobs::queue(&mut self.app.world_mut().resource_mut::<Village>(), key) {
            Ok(_) => "ok".into(),
            Err(e) => e.into(),
        }
    }
    pub fn configure_equipment_service(&mut self, id: u32, paused: bool) -> bool {
        {
            let mut v = self.app.world_mut().resource_mut::<Village>();
            let Some(j) = v
                .maintenance
                .jobs
                .iter_mut()
                .find(|j| j.id == Id(id) && j.active())
            else {
                return false;
            };
            j.paused = paused;
        }
        self.sync_maintenance_activities();
        true
    }
    pub fn cancel_equipment_service(&mut self, id: u32) -> bool {
        let result = jobs::cancel(&mut self.app.world_mut().resource_mut::<Village>(), Id(id));
        if result {
            self.sync_maintenance_activities();
        }
        result
    }
    pub fn maintenance_report(&self) -> String {
        report(self.app.world().resource::<Village>()).to_string()
    }
    pub fn set_equipment_condition(&mut self, enabled: bool) {
        {
            let mut v = self.app.world_mut().resource_mut::<Village>();
            v.maintenance.enabled = enabled;
            sync(&mut v);
            logistics::sync(&mut v);
        }
        self.sync_maintenance_activities();
    }
}

#[cfg(test)]
mod tests;

impl Game {
    pub(crate) fn sync_maintenance_activities(&mut self) {
        let v = self.app.world().resource::<Village>().clone();
        for mut r in self
            .app
            .world_mut()
            .query::<&mut Resident>()
            .iter_mut(self.app.world_mut())
        {
            if r.task == "utility"
                && r.activity_material
                    .and_then(|n| u32::try_from(n).ok())
                    .and_then(|id| jobs::job(&v, Id(id)))
                    .is_some_and(|j| !j.active() || j.paused)
            {
                assign(
                    &mut r,
                    &v,
                    "rest",
                    "The service work is paused or finished. Taking a break.",
                    false,
                );
            }
        }
    }
}

#[cfg(test)]
mod repair_tests;
