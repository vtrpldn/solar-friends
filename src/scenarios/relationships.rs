use super::*;
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Bond {
    pub from: String,
    pub to: String,
    pub memories: u32,
}
pub fn check(d: &Definition, r: &mut Report) {
    let people = residents::identities(d);
    let mut pairs = HashSet::new();
    for (i, bond) in d.start.relationships.iter().enumerate() {
        let pair = if bond.from < bond.to {
            (&bond.from, &bond.to)
        } else {
            (&bond.to, &bond.from)
        };
        if bond.from == bond.to
            || !people.contains_key(&bond.from)
            || !people.contains_key(&bond.to)
            || !(1..=100).contains(&bond.memories)
            || !pairs.insert(pair)
        {
            r.push(&format!("start.relationships.{i}"),"invalid_relationship","Choose two different cast members and 1–100 shared memories. Each pair may appear only once.");
        }
    }
}
pub fn apply(d: &Definition, v: &mut Village) {
    let people = residents::identities(d);
    for bond in &d.start.relationships {
        let from = people[&bond.from];
        let to = people[&bond.to];
        v.progress
            .friendships
            .entry(from)
            .or_default()
            .insert(to, bond.memories);
        v.progress
            .friendships
            .entry(to)
            .or_default()
            .insert(from, bond.memories);
    }
}
