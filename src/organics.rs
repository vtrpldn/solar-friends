//! Kitchen scraps, animal residues and mature compost have the same physical owners as other goods.
use crate::*;
use economy::{Bundle, COMPOST, COUNT, SCRAPS};
use logistics::Owner;

pub fn available(v: &Village, owner: Owner, material: usize) -> u32 {
    v.logistics
        .as_ref()
        .and_then(|s| s.stores.iter().find(|p| p.owner == owner))
        .map_or(0, |p| {
            p.items[material].saturating_sub(logistics::pickup_reserved(v, p.id, material))
        })
}
pub fn needs(v: &Village, owner: Owner, items: &mut Bundle) {
    match owner {
        Owner::Pantry(id) if !logistics::closing(v, owner) => {
            if let Some(b) = v
                .buildings
                .iter()
                .find(|b| b.id == id && b.progress >= 100.)
            {
                if b.kind == "compost" && wants_compost(v) {
                    items[SCRAPS] = 2;
                }
                if b.kind == "biodigester"
                    && v.circular.auto_feed
                    && !v.processes.paused.contains(&id)
                    && !v
                        .processes
                        .batches
                        .iter()
                        .any(|p| p.active() && p.building == Some(id))
                {
                    items[SCRAPS] = 2;
                }
            }
        }
        Owner::Site(id)
            if building_work::job(v, id).is_none()
                && v.buildings.iter().any(|b| {
                    b.id == id && b.progress >= 100. && ecology::farm(b) && b.crop.planted
                }) =>
        {
            items[COMPOST] = 1;
        }
        _ => {}
    }
}
pub fn wants_compost(v: &Village) -> bool {
    let staged: u32 = v.logistics.as_ref().map_or(0, |s| {
        s.stores
            .iter()
            .filter(|p| {
                matches!(
                    p.owner,
                    Owner::Site(_) | Owner::Source(_) | Owner::Restoration(_)
                )
            })
            .map(|p| p.items[COMPOST])
            .sum()
    });
    v.progress.compost.saturating_sub(staged) < 4
}
/// Keep small byproduct piles for direct use instead of returning every portion to camp.
pub fn return_surplus(v: &Village, owner: Owner, i: usize, n: u32) -> bool {
    if logistics::closing(v, owner) {
        return true;
    }
    let Owner::Pantry(id) = owner else {
        return true;
    };
    let kind = v
        .buildings
        .iter()
        .find(|b| b.id == id)
        .map(|b| b.kind.as_str());
    !matches!((kind,i), (Some("kitchen"),SCRAPS) if n<12)
        && !matches!((kind,i),(Some("compost"),COMPOST) if n<4)
}
pub fn can_turn(v: &Village, building: usize) -> bool {
    v.buildings
        .iter()
        .any(|b| b.id == building && b.kind == "compost" && b.progress >= 100.)
        && building_work::job(v, building).is_none()
        && available(v, Owner::Pantry(building), SCRAPS) >= 2
}
pub fn turn(v: &mut Village, building: usize) -> bool {
    if !can_turn(v, building) {
        return false;
    }
    let owner = Owner::Pantry(building);
    // Consuming the two scraps makes room for their one compost output.
    logistics::spend(v, Some(owner), SCRAPS, 2);
    assert!(logistics::receive(v, owner, COMPOST, 1));
    true
}
/// Keep the digester's emptied feed space for once-only sealed-input recovery.
pub fn processing(v: &Village, i: usize) -> u32 {
    if i != SCRAPS {
        return 0;
    }
    v.processes
        .batches
        .iter()
        .filter(|b| b.active() && b.kind == processes::Kind::Digestion)
        .count() as u32
        * 2
}
pub fn reserved_space(v: &Village, owner: Owner) -> u32 {
    let Owner::Pantry(id) = owner else {
        return 0;
    };
    v.processes
        .batches
        .iter()
        .filter(|b| b.active() && b.kind == processes::Kind::Digestion && b.building == Some(id))
        .count() as u32
        * 2
}
fn ground(v: &mut Village, x: i32, y: i32, material: usize, n: u32) -> bool {
    let Some(id) = logistics::salvage_store(v, x, y) else {
        return false;
    };
    let mut items = [0; COUNT];
    items[material] = n;
    logistics::receive_salvage(v, id, items);
    true
}
pub fn cured(v: &mut Village, x: i32, y: i32) -> bool {
    ground(v, x, y, COMPOST, 2)
}
pub fn recover(v: &mut Village, b: &processes::Batch) -> bool {
    if let Some(id) = b.building
        && v.logistics
            .as_ref()
            .is_some_and(|s| s.stores.iter().any(|p| p.owner == Owner::Pantry(id)))
    {
        logistics::receive(v, Owner::Pantry(id), SCRAPS, 2)
    } else {
        ground(v, b.x, b.y, SCRAPS, 2)
    }
}
/// Version 3 is an explicit development-fixture authoring format, not a playable save.
pub fn author_fixture(raw: &mut serde_json::Value) {
    fn bundles(value: &mut serde_json::Value) {
        match value {
            serde_json::Value::Object(fields) => {
                for (key, value) in fields {
                    if [
                        "stock",
                        "reserved",
                        "consumed",
                        "returns",
                        "items",
                        "target",
                        "targets",
                        "expired",
                        "opening",
                        "received",
                        "spent",
                        "outputs",
                        "inputs",
                        "retired_inputs",
                        "retired_outputs",
                        "cancelled",
                    ]
                    .contains(&key.as_str())
                        && let Some(a) = value.as_array_mut()
                        && a.len() < COUNT
                        && a.iter().all(serde_json::Value::is_number)
                    {
                        a.resize(COUNT, 0.into());
                    }
                    bundles(value);
                }
            }
            serde_json::Value::Array(a) => {
                for v in a {
                    bundles(v);
                }
            }
            _ => {}
        }
    }
    bundles(raw);
    if let Some(v) = raw["village"].as_object_mut() {
        v.remove("water_supply");
    }
}

#[cfg(test)]
pub fn fixture(v: &mut Village, material: usize, n: u32) {
    logistics::sync(v);
    logistics::fixture_stock(v, material, n);
    let mut left = n;
    let owners: Vec<_> = v
        .logistics
        .as_ref()
        .unwrap()
        .stores
        .iter()
        .filter(|p| match p.owner {
            Owner::Pantry(id) => {
                material == SCRAPS
                    && v.buildings
                        .iter()
                        .any(|b| b.id == id && matches!(b.kind.as_str(), "compost" | "biodigester"))
            }
            Owner::Site(id) => {
                material == COMPOST && v.buildings.iter().any(|b| b.id == id && ecology::farm(b))
            }
            Owner::Source(_) => material == COMPOST,
            _ => false,
        })
        .map(|p| p.id)
        .collect();
    let camp = v
        .logistics
        .as_ref()
        .unwrap()
        .stores
        .iter()
        .find(|p| p.owner == Owner::Camp)
        .unwrap()
        .id;
    for id in owners {
        let amount = left.min(if material == SCRAPS { 2 } else { n });
        left -= amount;
        let s = v.logistics.as_mut().unwrap();
        s.stores.iter_mut().find(|p| p.id == camp).unwrap().items[material] -= amount;
        s.stores.iter_mut().find(|p| p.id == id).unwrap().items[material] += amount;
    }
    logistics::sync_totals(v);
}

#[cfg(test)]
pub fn fixture_transfer(v: &mut Village, owner: Owner, material: usize, n: u32) {
    let s = v.logistics.as_mut().unwrap();
    let to = s.stores.iter().position(|p| p.owner == owner).unwrap();
    let mut left = n.saturating_sub(s.stores[to].items[material]);
    for i in 0..s.stores.len() {
        if i != to {
            let amount = left.min(s.stores[i].items[material]);
            s.stores[i].items[material] -= amount;
            s.stores[to].items[material] += amount;
            left -= amount;
        }
    }
    assert_eq!(left, 0);
    logistics::sync_totals(v);
}

#[cfg(test)]
mod tests;
