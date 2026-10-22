//! Authored physical condition without fictional aging, use or repair history.
use super::*;
use maintenance::Equipment;
#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    content = "id",
    rename_all = "snake_case",
    deny_unknown_fields
)]
pub enum Asset {
    Truck,
    Workshop(String),
    BuildingBattery(String),
    Battery(String),
    Pump(String),
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StartingCondition {
    pub asset: Asset,
    pub condition: f64,
    #[serde(default)]
    pub defer_automatic: bool,
}
fn supported(d: &Definition, a: &Asset) -> bool {
    match a {
        Asset::Truck => true,
        Asset::Workshop(id) => d
            .start
            .buildings
            .iter()
            .any(|b| b.id == *id && b.kind == "workshop" && b.state == BuildingState::Completed),
        Asset::BuildingBattery(id) => d.start.buildings.iter().any(|b| {
            b.id == *id
                && super::batteries::capacity(&b.kind).is_some()
                && b.state == BuildingState::Completed
        }),
        Asset::Battery(id) => d.start.batteries.iter().any(|b| b.id == *id),
        Asset::Pump(id) => d.start.routes.iter().any(|r| {
            r.id == *id
                && r.kind != utilities::Kind::Electricity
                && r.state == BuildingState::Completed
        }),
    }
}
fn at(d: &Definition, a: &Asset) -> Option<[i32; 2]> {
    match a {
        Asset::Truck => Some(d.map.camp),
        Asset::Workshop(id) | Asset::BuildingBattery(id) => d
            .start
            .buildings
            .iter()
            .find(|b| b.id == *id)
            .map(|b| [b.x, b.y]),
        Asset::Battery(id) => d
            .start
            .batteries
            .iter()
            .find(|b| b.id == *id)
            .map(|b| [b.x, b.y]),
        Asset::Pump(id) => d
            .start
            .routes
            .iter()
            .find(|r| r.id == *id)
            .and_then(|r| r.cells.first().copied()),
    }
}
pub fn check(d: &Definition, r: &mut Report) {
    if d.start.equipment.len() > 449 {
        r.push(
            "start.equipment",
            "equipment_limit",
            "Use at most one starting condition per physical equipment unit.",
        );
    }
    let mut seen = HashSet::new();
    for (i, c) in d.start.equipment.iter().enumerate().take(450) {
        if !c.condition.is_finite()
            || !(0.0..=100.).contains(&c.condition)
            || !supported(d, &c.asset)
            || !seen.insert(&c.asset)
        {
            r.push(&format!("start.equipment.{i}"),"invalid_starting_condition","Set condition from 0 to 100 percent once per existing workshop, battery, installed pump or shared pickup. Construction projects and planned pumps cannot have inherited wear.");
            let issue = r.issues.last_mut().unwrap();
            issue.at = at(d, &c.asset);
            issue.entity = match &c.asset {
                Asset::Truck => None,
                Asset::Workshop(id)
                | Asset::BuildingBattery(id)
                | Asset::Battery(id)
                | Asset::Pump(id) => Some(id.clone()),
            };
        }
    }
}
fn resolve(v: &Village, a: &Asset) -> Option<Equipment> {
    let o = v.scenario.as_ref()?;
    let owner = match a {
        Asset::Truck => return Some(Equipment::Truck),
        Asset::Workshop(key) => return o.buildings.get(key).copied().map(Equipment::Workshop),
        Asset::BuildingBattery(key) => electricity::Owner::Building(*o.buildings.get(key)?),
        Asset::Battery(key) => return o.batteries.get(key).copied().map(Equipment::Battery),
        Asset::Pump(key) => electricity::Owner::Pump(*o.routes.get(key)?),
    };
    let node = v.power.network.nodes.iter().find(|n| n.owner == owner)?;
    Some(if matches!(a, Asset::Pump(_)) {
        Equipment::Pump(node.id)
    } else {
        Equipment::Battery(node.id)
    })
}
pub fn install(v: &mut Village) -> Result<(), Report> {
    let Some(o) = v.scenario.clone() else {
        return Ok(());
    };
    if let Some(automatic) = o.definition.start.automatic_service {
        v.maintenance.automatic = automatic;
    }
    for (i, c) in o.definition.start.equipment.iter().enumerate() {
        let Some(e) = resolve(v, &c.asset) else {
            return Err(Report::error(
                &format!("start.equipment.{i}"),
                "missing_equipment",
                "This opening equipment is unavailable. Finish its structure or clear its starting condition.",
            ));
        };
        if !maintenance::seed_condition(v, e, c.condition, c.defer_automatic) {
            return Err(Report::error(
                &format!("start.equipment.{i}"),
                "missing_equipment",
                "Only existing physical equipment can inherit a starting condition.",
            ));
        }
    }
    Ok(())
}
fn available(v: &Village) -> Vec<Asset> {
    let Some(o) = &v.scenario else { return vec![] };
    let d = &o.definition;
    std::iter::once(Asset::Truck)
        .chain(
            d.start
                .buildings
                .iter()
                .filter_map(|b| match b.kind.as_str() {
                    "workshop" => Some(Asset::Workshop(b.id.clone())),
                    k if super::batteries::capacity(k).is_some() => {
                        Some(Asset::BuildingBattery(b.id.clone()))
                    }
                    _ => None,
                }),
        )
        .chain(
            d.start
                .batteries
                .iter()
                .map(|b| Asset::Battery(b.id.clone())),
        )
        .chain(
            d.start
                .routes
                .iter()
                .filter(|r| r.kind != utilities::Kind::Electricity)
                .map(|r| Asset::Pump(r.id.clone())),
        )
        .filter(|a| supported(d, a))
        .collect()
}
pub fn catalog() -> serde_json::Value {
    serde_json::json!({"condition_min":0,"condition_max":100,"service_at":maintenance::SERVICE_AT,"failure_at":maintenance::FAILURE_AT})
}
#[wasm_bindgen]
impl Game {
    pub fn scenario_equipment(&self, raw: &str) -> String {
        let result=parse(raw).and_then(compile).map(|(g,_)|{
            let v=g.app.world().resource::<Village>();let physical=maintenance::starting_assets(v);
            let rows:Vec<_>=available(v).into_iter().filter_map(|a|{
                let e=resolve(v,&a)?;let (_,location)=physical.iter().find(|(key,_)|*key==e)?;
                let record=v.maintenance.records.iter().find(|r|r.equipment==e);
                Some(serde_json::json!({"asset":a,"name":e.label(),"location":location,"condition":record.map_or(100.,|r|r.condition),"defer_automatic":record.is_some_and(|r|r.automatic_deferred)}))
            }).collect();
            serde_json::json!({"allowed":true,"equipment":rows,"enabled":v.maintenance.enabled,"automatic":v.maintenance.automatic,"preview_only":true})
        });
        result.unwrap_or_else(|r|serde_json::json!({"allowed":false,"reason":r.issues.first().map(|i|&i.message),"preview_only":true})).to_string()
    }
}
#[cfg(test)]
mod tests;
