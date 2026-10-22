//! External support enters a real store, using the normal material/freshness API.
use super::*;
pub fn source_valid(d: &Definition, material: &str, count: u32, building: Option<&str>) -> bool {
    d.rules.logistics
        && economy::NAMES.contains(&material)
        && count > 0
        && count
            <= building
                .map_or(Some(economy::CAPACITY), |id| {
                    d.start
                        .buildings
                        .iter()
                        .find(|b| {
                            b.id == id
                                && logistics::receives_at_building(
                                    &b.kind,
                                    b.state == BuildingState::Completed,
                                )
                        })
                        .and_then(|b| {
                            logistics::receiving_capacity(
                                &b.kind,
                                b.state == BuildingState::Completed,
                            )
                        })
                })
                .unwrap_or(0)
}
fn store<'a>(v: &'a Village, building: Option<&str>) -> Option<&'a logistics::Store> {
    let owner = if let Some(key) = building {
        let id = *v.scenario.as_ref()?.buildings.get(key)?;
        logistics::building_owner(v, id)?
    } else {
        logistics::Owner::Camp
    };
    v.logistics
        .as_ref()?
        .stores
        .iter()
        .find(|p| p.owner == owner)
}
pub fn blocker(v: &Village, count: u32, building: Option<&str>) -> Option<&'static str> {
    let Some(p) = store(v, building) else {
        return Some(
            "The destination no longer has a receiving store. The delivery stays queued; it is never redirected.",
        );
    };
    if logistics::closing(v, p.owner)
        || building.is_some_and(|key| {
            v.scenario
                .as_ref()
                .and_then(|origin| origin.buildings.get(key))
                .is_some_and(|id| building_work::job(v, *id).is_some())
        })
    {
        return Some("Finish or cancel work on the destination before receiving this delivery.");
    }
    if logistics::room(v, p.owner) < count {
        return Some(
            "Make room for the entire delivery at its destination, including other reserved arrivals. No partial delivery is made.",
        );
    }
    let (x, y) = crate::camp(v);
    if building.is_none() {
        return (!navigation::clear(v, x, y))
            .then_some("Clear access to the arrival store before receiving this delivery.");
    }
    if !v.skills.people.keys().any(|&id| {
        logistics::approaches(v, p, id)
            .is_some_and(|to| navigation::work_route(v, [x, y], to).is_ok())
    }) {
        return Some(
            "Clear a walkable route from the arrival area to the destination before receiving this delivery.",
        );
    }
    None
}
pub fn deliver(v: &mut Village, material: &str, count: u32, building: Option<&str>) -> bool {
    if blocker(v, count, building).is_some() {
        return false;
    }
    let owner = store(v, building).unwrap().owner;
    let material = economy::NAMES
        .iter()
        .position(|key| *key == material)
        .unwrap();
    logistics::receive(v, owner, material, count)
}
pub fn valid_receipts(journal: &Journal, state: &State, v: &Village) -> bool {
    let mut totals = [0u64; economy::COUNT];
    for e in &journal.events {
        if let EventEffect::DeliverSupplies {
            material, count, ..
        } = &e.effect
            && state
                .events
                .get(&e.id)
                .is_some_and(|r| r.applied_at.is_some())
        {
            let Some(i) = economy::NAMES.iter().position(|key| *key == material) else {
                return false;
            };
            totals[i] += u64::from(*count);
        }
    }
    totals
        .iter()
        .enumerate()
        .all(|(i, n)| *n <= v.simulation.materials.as_ref().map_or(0, |m| m.received[i]))
}

pub fn destination(v: &Village, building: Option<&str>) -> Option<serde_json::Value> {
    let key = building?;
    let origin = v.scenario.as_ref()?;
    let source = origin
        .definition
        .start
        .buildings
        .iter()
        .find(|b| b.id == key)?;
    let live = origin
        .buildings
        .get(key)
        .and_then(|id| v.buildings.iter().find(|b| b.id == *id));
    Some(
        serde_json::json!({"kind":source.kind,"x":live.map_or(source.x,|b|b.x),"y":live.map_or(source.y,|b|b.y),"missing":live.is_none()}),
    )
}
