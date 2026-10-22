//! Initial circumstances belong to one scenario, never reusable character presets.
use super::*;
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Needs {
    pub energy: f32,
    pub hunger: f32,
    pub social: f32,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Setup {
    pub resident: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position: Option<[f32; 2]>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub needs: Option<Needs>,
}
pub fn defaults() -> serde_json::Value {
    let rows: BTreeMap<_, _> = initialization::founding_residents(CAMP)
        .into_iter()
        .map(|r| {
            (
                residents::PRESETS[r.id],
                Needs {
                    energy: r.energy,
                    hunger: r.hunger,
                    social: r.social,
                },
            )
        })
        .collect();
    serde_json::json!(rows)
}
pub fn check(d: &Definition, r: &mut Report) {
    if d.start.resident_setup.len() > residents::MAX_RESIDENTS {
        r.push(
            "start.resident_setup",
            "starting_resident_limit",
            "Use at most one starting setup per resident in this cast.",
        );
    }
    let ids = residents::identities(d);
    let mut seen = HashSet::new();
    for (i, s) in d
        .start
        .resident_setup
        .iter()
        .enumerate()
        .take(residents::MAX_RESIDENTS + 1)
    {
        if !ids.contains_key(&s.resident)
            || !seen.insert(&s.resident)
            || s.position.is_some_and(|p| {
                p.iter()
                    .any(|n| !n.is_finite() || !(1.0..=(MAP_SIZE - 2) as f32).contains(n))
            })
            || s.needs.as_ref().is_some_and(|n| {
                [n.energy, n.hunger, n.social]
                    .iter()
                    .any(|n| !n.is_finite() || !(0.0..=100.).contains(n))
            })
        {
            r.push(&format!("start.resident_setup.{i}"),"invalid_resident_start","Choose each existing resident once, needs from 0–100%, and a finite starting position inside the property. Starting settings cannot contain tasks, cargo or work history.");
            let issue = r.issues.last_mut().unwrap();
            issue.entity = Some(s.resident.clone());
            issue.at = s.position.map(|p| p.map(|n| n.floor() as i32));
        }
    }
}
pub fn apply(d: &Definition, people: &mut [Resident], v: &Village) {
    let ids = residents::identities(d);
    for s in &d.start.resident_setup {
        let Some(person) = ids
            .get(&s.resident)
            .and_then(|id| people.iter_mut().find(|p| p.id == *id))
        else {
            continue;
        };
        if let Some([x, y]) = s.position {
            person.x = x;
            person.y = y;
            person.target_x = x;
            person.target_y = y;
            person.reason = "Arriving at my starting place.".into();
        }
        if let Some(n) = &s.needs {
            person.energy = n.energy;
            person.hunger = n.hunger;
            person.social = n.social;
            person.happiness = resident_wellbeing(v, person);
        }
    }
}
pub fn validate_positions(d: &Definition, people: &[Resident], v: &Village) -> Result<(), Report> {
    let ids = residents::identities(d);
    for (i, s) in d
        .start
        .resident_setup
        .iter()
        .enumerate()
        .filter(|(_, s)| s.position.is_some())
    {
        let p = people
            .iter()
            .find(|p| Some(&p.id) == ids.get(&s.resident))
            .unwrap();
        let camp = roster::camp_spot(v, p.id);
        let q = [p.x, p.y];
        let reason = if !navigation::clear(v, p.x, p.y)
            || navigation::route(v, q, [camp.0, camp.1]).is_err()
        {
            Some(
                "Choose clear, walkable ground connected to this resident's arrival clearing; buildings, material plots, battery banks and river water can block it.",
            )
        } else if people.iter().any(|other| {
            other.id != p.id && (other.x - p.x).hypot(other.y - p.y) < spacing::PERSONAL_SPACE
        }) {
            Some("Leave at least 1.1 cells of breathing space from every other starting resident.")
        } else {
            None
        };
        if let Some(reason) = reason {
            let mut r = Report::error(
                &format!("start.resident_setup.{i}.position"),
                "resident_start_location",
                reason,
            );
            r.issues[0].entity = Some(s.resident.clone());
            r.issues[0].at = Some([p.x.floor() as i32, p.y.floor() as i32]);
            return Err(r);
        }
    }
    Ok(())
}
#[cfg(test)]
mod tests;
