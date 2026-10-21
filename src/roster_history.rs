//! Migration and raw-shape validation for sparse resident work histories.
use crate::*;
use serde_json::{Value, json};
fn indexed(value: Value) -> Option<Value> {
    if value.is_object() {
        return Some(value);
    }
    let values = value.as_array()?;
    if values.len() != 5 {
        return None;
    }
    Some(Value::Object(
        values
            .iter()
            .enumerate()
            .filter(|(_, v)| **v != json!(0))
            .map(|(id, v)| (id.to_string(), v.clone()))
            .collect(),
    ))
}
pub fn migrate(raw: &mut Value) -> bool {
    if let Some(s) = raw["village"]
        .get_mut("situations")
        .filter(|s| !s.is_null())
    {
        let Some(days) = s["cooking"].as_array_mut().filter(|d| d.len() == 3) else {
            return false;
        };
        for day in days {
            let Some(value) = indexed(day.take()) else {
                return false;
            };
            *day = value;
        }
        if let Some(a) = s.get_mut("active").filter(|a| !a.is_null())
            && !a["helpers"].is_array()
        {
            let Some(mask) = a["helpers"].as_u64().filter(|m| *m <= 31) else {
                return false;
            };
            a["helpers"] = json!(
                (0..5)
                    .filter(|id| mask & (1 << id) != 0)
                    .collect::<Vec<_>>()
            );
        }
    }
    if let Some(s) = raw["village"].get_mut("logistics").filter(|s| !s.is_null()) {
        match s["schema"].as_u64() {
            Some(1) => {
                let Some(value) = indexed(s["retry_after"].take()) else {
                    return false;
                };
                s["retry_after"] = value;
                s["schema"] = 2.into();
            }
            Some(2) => (),
            _ => return false,
        }
    }
    true
}
fn keys(value: &Value) -> bool {
    value.as_object().is_some_and(|rows| {
        rows.keys().all(|key| {
            key.parse::<usize>()
                .ok()
                .is_some_and(|id| id.to_string() == *key)
        })
    })
}
fn set(value: &Value) -> bool {
    let mut seen = participation::Set::new();
    value.as_array().is_some_and(|ids| {
        ids.iter().all(|id| {
            id.as_u64()
                .and_then(|id| usize::try_from(id).ok())
                .is_some_and(|id| seen.insert(id))
        })
    })
}
pub fn valid_raw(raw: &Value, legacy: bool) -> bool {
    let s = &raw["village"]["situations"];
    (if s.is_null() {
        legacy
    } else {
        s["cooking"]
            .as_array()
            .is_some_and(|days| days.len() == 3 && days.iter().all(keys))
            && s.get("day").is_some_and(Value::is_u64)
            && s.get("resolved_count").is_some_and(Value::is_u64)
            && s.get("active")
                .is_some_and(|a| a.is_null() || set(&a["helpers"]))
    }) && raw["village"]["logistics"]
        .as_object()
        .is_none_or(|s| s.get("retry_after").is_some_and(keys))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn legacy_cooking_helpers_and_retry_times_survive_without_resetting_other_records() {
        let mut g = Game::new();
        let mut old: Value = serde_json::from_str(&g.snapshot()).unwrap();
        old["village"]["version"] = 41.into();
        old["village"]["situations"]["cooking"] =
            json!([[0, 0, 3, 0, 0], [0, 0, 4, 0, 0], [0, 0, 0, 0, 0]]);
        old["village"]["situations"]["active"] = json!({"resident":2,"opened":480,"response":"day_off","agreed":480,"helpers":2,"recovery":36,"worry":2,"resolved":null,"story_check_in":false});
        old["village"]["logistics"]["schema"] = 1.into();
        old["village"]["logistics"]["retry_after"] = json!([490, 0, 505, 0, 0]);
        assert!(g.restore(&old.to_string()));
        let now: Value = serde_json::from_str(&g.snapshot()).unwrap();
        assert_eq!(
            now["village"]["situations"]["cooking"],
            json!([{"2":3},{"2":4},{}])
        );
        assert_eq!(
            now["village"]["situations"]["active"]["helpers"],
            json!([1])
        );
        assert_eq!(now["village"]["situations"]["active"]["recovery"], 36.);
        assert_eq!(
            now["village"]["logistics"]["retry_after"],
            json!({"0":490.,"2":505.})
        );
        for field in ["economy", "skills", "simulation", "workforce"] {
            assert_eq!(now["village"][field], old["village"][field]);
        }
        assert_eq!(now["residents"], old["residents"]);
        let saved = g.snapshot();
        for helpers in [
            json!([1, 1]),
            json!([900]),
            json!([2]),
            json!([-1]),
            json!(2),
        ] {
            let mut bad = now.clone();
            bad["village"]["situations"]["active"]["helpers"] = helpers;
            assert!(!g.restore(&bad.to_string()));
            assert_eq!(g.snapshot(), saved);
        }
        let mut copy = Game::new();
        assert!(copy.restore(&saved));
        assert_eq!(copy.snapshot(), saved);
        for _ in 0..60 {
            g.tick(0.1);
            copy.tick(0.1);
        }
        assert_eq!(g.snapshot(), copy.snapshot());
    }
    #[test]
    fn malformed_histories_and_orphaned_cooks_cannot_replace_a_village() {
        let mut g = Game::new();
        let saved = g.snapshot();
        let current: Value = serde_json::from_str(&saved).unwrap();
        for bad_day in [
            json!({"900":3}),
            json!({"01":3}),
            json!({"0":1001}),
            json!([0, 0, 0, 0, 0]),
            json!({"0":-1}),
        ] {
            let mut bad = current.clone();
            bad["village"]["situations"]["cooking"][0] = bad_day;
            assert!(!g.restore(&bad.to_string()));
            assert_eq!(g.snapshot(), saved);
        }
        for retry in [
            json!({"900":490}),
            json!({"01":490}),
            json!({"0":9999}),
            json!([0, 0, 0, 0, 0]),
            json!({"0":-1}),
        ] {
            let mut bad = current.clone();
            bad["village"]["logistics"]["retry_after"] = retry;
            assert!(!g.restore(&bad.to_string()));
            assert_eq!(g.snapshot(), saved);
        }
        for field in ["active", "cooking", "day", "resolved_count"] {
            let mut bad = current.clone();
            bad["village"]["situations"]
                .as_object_mut()
                .unwrap()
                .remove(field);
            assert!(!g.restore(&bad.to_string()));
            assert_eq!(g.snapshot(), saved);
        }
        for field in ["situations", "logistics"] {
            let mut bad = current.clone();
            bad["village"].as_object_mut().unwrap().remove(field);
            assert!(!g.restore(&bad.to_string()));
            assert_eq!(g.snapshot(), saved);
        }
    }
}
