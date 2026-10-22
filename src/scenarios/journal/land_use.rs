//! Current living assets, not harvest credit or a promise of future production.
use super::*;
#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CropStage {
    Planted,
    Ready,
}
#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OrchardStage {
    Established,
    Ready,
}
#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnimalStage {
    Stocked,
    CaredFor,
}
#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceStage {
    Planted,
    Ready,
}
pub fn valid(c: &GoalCondition) -> bool {
    match c {
        GoalCondition::Crops { crop, count, .. } => {
            ecology::crop_kind(crop) && (1..=256).contains(count)
        }
        GoalCondition::Orchards { count, .. } => (1..=256).contains(count),
        GoalCondition::Livestock {
            building, count, ..
        } => {
            ["goat_pasture", "apiary", "coop"].contains(&building.as_str())
                && (1..=256).contains(count)
        }
        GoalCondition::MaterialSites {
            material,
            count,
            stage,
            ..
        } => {
            economy::NAMES[..5]
                .iter()
                .position(|m| *m == material)
                .is_some_and(|i| i < 2 || *stage == SourceStage::Ready)
                && (1..=256).contains(count)
        }
        _ => false,
    }
}
fn inside(v: &Village, region: &Option<String>, x: i32, y: i32, size: i32) -> bool {
    region.as_ref().is_none_or(|id| {
        v.scenario.as_ref().is_some_and(|o| {
            o.definition
                .map
                .regions
                .iter()
                .any(|r| r.id == *id && r.contains_square(x, y, size))
        })
    })
}
fn open(v: &Village, b: &Building, region: &Option<String>) -> bool {
    b.progress >= 100.
        && building_work::job(v, b.id).is_none()
        && inside(v, region, b.x, b.y, interactions::footprint_size(&b.kind))
}
fn building_action(
    v: &Village,
    kinds: &[&str],
    region: &Option<String>,
    fallback: &str,
) -> serde_json::Value {
    v.buildings.iter().find(|b|kinds.contains(&b.kind.as_str())&&open(v,b,region)).map_or_else(||serde_json::json!({"kind":"build","building":fallback,"region":region}),|b|serde_json::json!({"kind":"cultivation","building":b.kind,"id":b.id,"region":region}))
}
pub fn measure(c: &GoalCondition, v: &Village) -> (bool, serde_json::Value) {
    let (kind, value, target, region, description, action, note) = match c {
        GoalCondition::Crops {
            crop,
            count,
            stage,
            region,
        } => {
            let value = v
                .buildings
                .iter()
                .filter(|b| {
                    open(v, b, region)
                        && ecology::farm(b)
                        && b.crop.planted
                        && b.crop.kind == *crop
                        && (*stage == CropStage::Planted
                            || b.crop.growth >= ecology::duration(&b.crop))
                })
                .count();
            (
                "crops",
                value,
                *count,
                region,
                format!(
                    "Have {count} {} {} of {crop}",
                    if *stage == CropStage::Ready {
                        "harvest-ready"
                    } else {
                        "planted"
                    },
                    if *count == 1 { "bed" } else { "beds" }
                ),
                building_action(v, &["garden", "greenhouse"], region, "garden"),
                "Counts completed gardens and greenhouses with the selected current crop. Ready crops also count as planted. Empty beds, next-crop plans and projects do not count. Starting plants count; this does not credit a harvest.",
            )
        }
        GoalCondition::Orchards {
            count,
            stage,
            region,
        } => {
            let value = v
                .buildings
                .iter()
                .filter(|b| {
                    open(v, b, region)
                        && b.kind == "orchard"
                        && b.agriculture.enabled
                        && b.agriculture.fruiting
                        && (*stage == OrchardStage::Established || b.agriculture.pending > 0)
                })
                .count();
            (
                "orchards",
                value,
                *count,
                region,
                format!(
                    "Have {count} {} {}",
                    if *stage == OrchardStage::Ready {
                        "fruit-ready"
                    } else {
                        "established"
                    },
                    if *count == 1 { "orchard" } else { "orchards" }
                ),
                building_action(v, &["orchard"], region, "orchard"),
                "Counts completed, enabled orchards with established fruit trees. Fruit-ready means uncollected fruit is present. Young trees, disabled orchards and projects do not count. Starting trees count; collection history does not.",
            )
        }
        GoalCondition::Livestock {
            building,
            count,
            stage,
            region,
        } => {
            let value = v
                .buildings
                .iter()
                .filter(|b| {
                    open(v, b, region)
                        && b.kind == *building
                        && b.agriculture.stocked
                        && (*stage == AnimalStage::Stocked
                            || match b.kind.as_str() {
                                "coop" => b.poultry.remaining > 0.,
                                "goat_pasture" => b.agriculture.cared_until > v.minutes,
                                "apiary" => {
                                    b.agriculture.cared_until > v.minutes
                                        && agriculture::flowers(v, b) > 0
                                }
                                _ => false,
                            })
                })
                .count();
            (
                "livestock",
                value,
                *count,
                region,
                format!(
                    "Have {count} {} {} {}",
                    if *stage == AnimalStage::CaredFor {
                        "currently cared-for"
                    } else {
                        "occupied"
                    },
                    building.replace('_', " "),
                    if *count == 1 {
                        "enclosure"
                    } else {
                        "enclosures"
                    }
                ),
                building_action(v, &[building.as_str()], region, building),
                "Counts occupied completed enclosures, not individual animals or boxed livestock. Care means goats have an unexpired care period, bees have an unexpired inspection and nearby flowering forage, or hens have an active paid feeding batch. Starting care counts. This measures current care, not a continuous welfare guarantee or completed output.",
            )
        }
        GoalCondition::MaterialSites {
            material,
            count,
            stage,
            region,
        } => {
            let index = economy::NAMES
                .iter()
                .position(|m| *m == material)
                .expect("validated site material");
            let value = v
                .economy
                .sources
                .iter()
                .enumerate()
                .filter(|(i, s)| {
                    s.active
                        && s.player_placed
                        && s.material == index
                        && inside(v, region, s.x, s.y, resource_sites::size(s.material))
                        && if *stage == SourceStage::Planted {
                            s.planted
                        } else {
                            (s.material >= 2 || s.planted && s.growth >= 1.)
                                && resource_sites::available(v, *i)
                                    >= if s.material == 0 { 8. } else { 1. }
                        }
                })
                .count();
            (
                "material_sites",
                value,
                *count,
                region,
                format!(
                    "Have {count} {} {material} {}",
                    if *stage == SourceStage::Planted {
                        "planted"
                    } else {
                        "harvestable"
                    },
                    if *count == 1 { "plot" } else { "plots" }
                ),
                serde_json::json!({"kind":"land","material":material,"region":region}),
                "Counts active player-established plots, including authored starting plots. Planted timber and bamboo can still be growing. Harvestable plots must have at least one normal extraction batch: eight timber units or one unit of another material. Empty, cleared or exhausted finite sites do not count. Materials in storage and old extraction receipts do not count.",
            )
        }
        _ => unreachable!("land use condition"),
    };
    let region_title = region
        .as_ref()
        .and_then(|id| {
            v.scenario
                .as_ref()?
                .definition
                .map
                .regions
                .iter()
                .find(|r| r.id == *id)
        })
        .map(|r| r.title.as_str());
    let description = region_title.map_or_else(
        || description.clone(),
        |title| format!("{description}, with the full footprint inside {title}"),
    );
    let complete = value >= target as usize;
    (
        complete,
        serde_json::json!({"kind":kind,"unit":"count","complete":complete,"value":value,"target":target,"description":description,"note":note,"action":action}),
    )
}
pub fn catalog() -> serde_json::Value {
    serde_json::json!({"limit":256,"crops":ecology::CROPS,"crop_stages":[{"id":CropStage::Planted,"name":"Currently planted"},{"id":CropStage::Ready,"name":"Ready to harvest"}],"orchard_stages":[{"id":OrchardStage::Established,"name":"Established fruit trees"},{"id":OrchardStage::Ready,"name":"Fruit ready to collect"}],"animal_buildings":["goat_pasture","apiary","coop"],"animal_stages":[{"id":AnimalStage::Stocked,"name":"Animals present"},{"id":AnimalStage::CaredFor,"name":"Current care provided"}],"materials":economy::NAMES[..5],"source_stages":[{"id":SourceStage::Planted,"name":"Timber or bamboo planted"},{"id":SourceStage::Ready,"name":"At least one harvest batch available"}]})
}
#[cfg(test)]
mod tests;
