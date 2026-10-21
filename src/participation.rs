//! Persistent work credit is a set of resident identities, never bit positions.
use crate::*;
use std::collections::BTreeSet;
pub type Set = BTreeSet<usize>;
pub fn owned(v: &Village, people: &Set) -> bool {
    people.iter().all(|id| v.skills.people.contains_key(id))
}
pub fn award(v: &mut Village, people: &Set, skill: skills::Skill, points: u8) {
    for &id in people {
        skills::award(v, id, skill, points);
    }
}
fn migrate_rows(rows: Option<&mut serde_json::Value>) -> bool {
    let Some(rows) = rows else {
        return true;
    };
    let Some(rows) = rows.as_array_mut() else {
        return false;
    };
    for row in rows {
        let Some(row) = row.as_object_mut() else {
            return false;
        };
        let value = row.entry("contributors").or_insert(serde_json::json!(0));
        if value.is_array() {
            continue;
        }
        let Some(mask) = value.as_u64().filter(|m| *m <= 31) else {
            return false;
        };
        *value = serde_json::json!(
            (0..5)
                .filter(|id| mask & (1 << id) != 0)
                .collect::<Vec<_>>()
        );
    }
    true
}
pub fn migrate(raw: &mut serde_json::Value) -> bool {
    migrate_rows(raw.get_mut("village").and_then(|v| v.get_mut("buildings")))
        && migrate_rows(
            raw.get_mut("village")
                .and_then(|v| v.get_mut("production"))
                .and_then(|p| p.get_mut("batches")),
        )
}
pub fn valid_raw(raw: &serde_json::Value) -> bool {
    [
        &raw["village"]["buildings"],
        &raw["village"]["production"]["batches"],
    ]
    .iter()
    .all(|rows| {
        rows.as_array().is_none_or(|rows| {
            rows.iter().all(|row| {
                let Some(ids) = row["contributors"].as_array() else {
                    return false;
                };
                let mut seen = BTreeSet::new();
                ids.iter().all(|id| {
                    id.as_u64()
                        .and_then(|id| usize::try_from(id).ok())
                        .is_some_and(|id| seen.insert(id))
                })
            })
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sparse_contributors_receive_one_credit_each() {
        let mut v = Village::default();
        v.skills.people = [
            (42, skills::Person::default()),
            (900, skills::Person::default()),
        ]
        .into_iter()
        .collect();
        let contributors: Set = [42, 900, 42].into_iter().collect();
        assert_eq!(contributors.len(), 2);
        assert!(owned(&v, &contributors));
        award(&mut v, &contributors, skills::Skill::Building, 3);
        assert_eq!(v.skills.people[&42].experience[0], 3);
        assert_eq!(v.skills.people[&900].experience[0], 3);
        assert!(!owned(&v, &[0].into_iter().collect()));
    }
    #[test]
    fn original_artwork_saves_keep_absent_production_absent_during_migration() {
        for source in [
            include_str!("../web/artwork/village-preview.json"),
            include_str!("../web/artwork/resident-preview.json"),
        ] {
            let mut raw: serde_json::Value = serde_json::from_str(source).unwrap();
            assert!(raw["village"].get("production").is_none());
            assert!(migrate(&mut raw));
            assert!(raw["village"].get("production").is_none());
            assert!(
                raw["village"]["buildings"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .all(|b| b["contributors"].is_array())
            );
            let mut g = Game::new();
            assert!(g.restore(source));
            let canonical = g.snapshot();
            assert!(g.restore(&canonical));
            assert_eq!(g.snapshot(), canonical);
        }
    }
    #[test]
    fn legacy_building_credit_is_preserved_and_bad_sets_cannot_replace_a_village() {
        let mut g = Game::new();
        assert_eq!(g.place("garden", 5, 5), "ok");
        let mut old: serde_json::Value = serde_json::from_str(&g.snapshot()).unwrap();
        old["village"]["version"] = 37.into();
        old["village"]["buildings"][0]["contributors"] = 23.into();
        assert!(g.restore(&old.to_string()));
        let current: serde_json::Value = serde_json::from_str(&g.snapshot()).unwrap();
        assert_eq!(
            current["village"]["buildings"][0]["contributors"],
            serde_json::json!([0, 1, 2, 4])
        );
        assert_eq!(current["residents"], old["residents"]);
        assert_eq!(current["village"]["skills"], old["village"]["skills"]);
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_eq!(g.snapshot(), saved);
        for value in [
            serde_json::json!([0, 0]),
            serde_json::json!([42]),
            serde_json::json!([-1]),
            serde_json::json!([1.5]),
            serde_json::json!(23),
            serde_json::Value::Null,
        ] {
            let mut bad = current.clone();
            bad["village"]["buildings"][0]["contributors"] = value;
            assert!(!g.restore(&bad.to_string()));
            assert_eq!(g.snapshot(), saved);
        }
        let mut missing = current.clone();
        missing["village"]["buildings"][0]
            .as_object_mut()
            .unwrap()
            .remove("contributors");
        assert!(!g.restore(&missing.to_string()));
        assert_eq!(g.snapshot(), saved);
        old["village"]["buildings"][0]["contributors"] = 32.into();
        assert!(!g.restore(&old.to_string()));
        assert_eq!(g.snapshot(), saved);
    }
}
