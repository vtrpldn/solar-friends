//! Shared memories follow resident identities, never roster positions.
use crate::*;
use std::collections::{BTreeMap, BTreeSet};
pub type Graph = BTreeMap<usize, BTreeMap<usize, u32>>;
pub fn strength(p: &progression::Progress, from: usize, to: usize) -> u32 {
    p.friendships
        .get(&from)
        .and_then(|row| row.get(&to))
        .copied()
        .unwrap_or(0)
}
pub fn remember(v: &mut Village, from: usize, to: usize) {
    if from == to || !v.skills.people.contains_key(&from) || !v.skills.people.contains_key(&to) {
        return;
    }
    let next = strength(&v.progress, from, to).saturating_add(1);
    v.progress
        .friendships
        .entry(from)
        .or_default()
        .insert(to, next);
}
pub fn valid(v: &Village, people: &[Resident]) -> bool {
    let ids: BTreeSet<_> = people.iter().map(|r| r.id).collect();
    ids.len() == people.len()
        && v.progress.friendships.iter().all(|(from, row)| {
            ids.contains(from)
                && !row.is_empty()
                && row
                    .iter()
                    .all(|(to, n)| from != to && ids.contains(to) && *n > 0)
        })
}
pub fn migrate(raw: &mut serde_json::Value) -> bool {
    if raw["village"]
        .get("progress")
        .is_some_and(|p| !p.is_object())
        || raw["village"]["progress"]
            .get("friendships")
            .is_some_and(serde_json::Value::is_null)
    {
        return false;
    }
    let value = &mut raw["village"]["progress"]["friendships"];
    if value.is_object() {
        return true;
    }
    if value.is_null() {
        *value = serde_json::json!({});
        return true;
    }
    let Some(values) = value.as_array() else {
        return false;
    };
    if values.len() != 25 {
        return false;
    }
    let mut graph = Graph::new();
    for (slot, value) in values.iter().enumerate() {
        let Some(n) = value.as_u64().and_then(|n| u32::try_from(n).ok()) else {
            return false;
        };
        if n > 0 {
            graph.entry(slot / 5).or_default().insert(slot % 5, n);
        }
    }
    *value = serde_json::to_value(graph).unwrap();
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sparse_identities_and_reordered_people_keep_independent_memories() {
        let mut v = Village::default();
        v.skills.people = [
            (42, skills::Person::default()),
            (900, skills::Person::default()),
        ]
        .into_iter()
        .collect();
        let mut people = initialization::founding_residents(CAMP);
        people.truncate(2);
        people[0].id = 42;
        people[1].id = 900;
        people[0].name = "Sam".into();
        people[1].name = "Sam".into();
        remember(&mut v, 42, 900);
        remember(&mut v, 900, 42);
        remember(&mut v, 42, 900);
        remember(&mut v, 42, 42);
        remember(&mut v, 42, 0);
        assert_eq!(strength(&v.progress, 42, 900), 2);
        assert_eq!(strength(&v.progress, 900, 42), 1);
        assert_eq!(strength(&v.progress, 0, 1), 0);
        assert!(valid(&v, &people));
        people.reverse();
        assert!(valid(&v, &people));
        assert_eq!(strength(&v.progress, 42, 900), 2);
        v.progress
            .friendships
            .get_mut(&42)
            .unwrap()
            .insert(900, u32::MAX);
        remember(&mut v, 42, 900);
        assert_eq!(strength(&v.progress, 42, 900), u32::MAX);
    }
    #[test]
    fn legacy_matrix_migrates_directional_history_without_changing_people() {
        let mut g = Game::new();
        let mut old: serde_json::Value = serde_json::from_str(&g.snapshot()).unwrap();
        old["village"]["version"] = 36.into();
        let mut matrix = vec![0u32; 25];
        matrix[1] = 7;
        matrix[5] = 3;
        matrix[19] = 9;
        old["village"]["progress"]["friendships"] = serde_json::json!(matrix);
        old["residents"].as_array_mut().unwrap().reverse();
        assert!(g.restore(&old.to_string()));
        let after: serde_json::Value = serde_json::from_str(&g.snapshot()).unwrap();
        assert_eq!(after["residents"], old["residents"]);
        assert_eq!(after["village"]["economy"], old["village"]["economy"]);
        assert_eq!(after["village"]["skills"], old["village"]["skills"]);
        assert_eq!(
            after["village"]["progress"]["friendships"],
            serde_json::json!({"0":{"1":7},"1":{"0":3},"3":{"4":9}})
        );
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_eq!(g.snapshot(), saved);
        old["village"]["progress"]["friendships"] = serde_json::json!(vec![0; 24]);
        assert!(!g.restore(&old.to_string()));
        assert_eq!(g.snapshot(), saved);
        old["village"]["progress"]["friendships"] = serde_json::Value::Null;
        assert!(!g.restore(&old.to_string()));
        assert_eq!(g.snapshot(), saved);
        old["village"]["progress"] = serde_json::Value::Null;
        assert!(!g.restore(&old.to_string()));
        assert_eq!(g.snapshot(), saved);
    }
    #[test]
    fn invalid_relationship_records_are_rejected_atomically() {
        let mut g = Game::new();
        let before = g.snapshot();
        for graph in [
            serde_json::json!({"0":{"0":1}}),
            serde_json::json!({"0":{"42":1}}),
            serde_json::json!({"42":{"0":1}}),
            serde_json::json!({"00":{"1":1}}),
            serde_json::json!({"0":{"01":1}}),
            serde_json::json!({"0":{}}),
            serde_json::json!({"0":{"1":0}}),
            serde_json::Value::Null,
        ] {
            let mut bad: serde_json::Value = serde_json::from_str(&before).unwrap();
            bad["village"]["progress"]["friendships"] = graph;
            assert!(!g.restore(&bad.to_string()));
            assert_eq!(g.snapshot(), before);
        }
        let mut bad: serde_json::Value = serde_json::from_str(&before).unwrap();
        bad["village"]["progress"]
            .as_object_mut()
            .unwrap()
            .remove("friendships");
        assert!(!g.restore(&bad.to_string()));
        assert_eq!(g.snapshot(), before);
    }
}
