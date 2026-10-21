//! Resident identity sets for social milestones and gathering attendance.
use crate::*;
const FIELDS: [&str; 4] = ["hobby_people", "social_people", "invited", "attended"];
/// Old masks describe the original five identities, never a reordered roster.
pub fn migrate(raw: &mut serde_json::Value) -> bool {
    let progress = &mut raw["village"]["progress"];
    if progress.is_null() {
        return true;
    }
    let Some(progress) = progress.as_object_mut() else {
        return false;
    };
    for (field, old) in [
        ("hobby_people", "hobby_mask"),
        ("social_people", "social_mask"),
        ("invited", "invited"),
        ("attended", "attended"),
    ] {
        if old != field && progress.contains_key(old) && progress.contains_key(field) {
            return false;
        }
        let value = progress.remove(old).unwrap_or(serde_json::json!(0));
        // A newer canonical field can be present in a supported legacy fixture.
        let value = progress.remove(field).unwrap_or(value);
        let Some(value) = convert(value) else {
            return false;
        };
        progress.insert(field.into(), value);
    }
    if let Some(plan) = progress
        .get_mut("gathering_delivery")
        .filter(|p| !p.is_null())
    {
        let Some(plan) = plan.as_object_mut() else {
            return false;
        };
        for field in ["invited", "attended"] {
            let Some(value) = plan.remove(field).and_then(convert) else {
                return false;
            };
            plan.insert(field.into(), value);
        }
    }
    true
}
fn convert(value: serde_json::Value) -> Option<serde_json::Value> {
    if value.is_array() {
        return Some(value);
    }
    let mask = value.as_u64().filter(|m| *m <= 31)?;
    Some(serde_json::json!(
        (0..5)
            .filter(|id| mask & (1 << id) != 0)
            .collect::<Vec<_>>()
    ))
}
fn valid_set(value: &serde_json::Value) -> bool {
    let Some(values) = value.as_array() else {
        return false;
    };
    let mut seen = participation::Set::new();
    values.iter().all(|v| {
        v.as_u64()
            .and_then(|id| usize::try_from(id).ok())
            .is_some_and(|id| seen.insert(id))
    })
}
pub fn valid_raw(raw: &serde_json::Value, legacy: bool) -> bool {
    let p = &raw["village"]["progress"];
    if p.is_null() {
        return legacy;
    }
    p.get("hobby_mask").is_none()
        && p.get("social_mask").is_none()
        && FIELDS.iter().all(|field| valid_set(&p[field]))
        && p.get("gathering_delivery")
            .filter(|p| !p.is_null())
            .is_none_or(|plan| {
                ["invited", "attended"]
                    .iter()
                    .all(|field| valid_set(&plan[field]))
            })
}
pub fn valid(v: &Village) -> bool {
    let p = &v.progress;
    [&p.hobby_people, &p.social_people, &p.invited, &p.attended]
        .iter()
        .all(|set| participation::owned(v, set))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn old_masks_preserve_their_original_members_and_other_saved_state() {
        let mut g = Game::new();
        let before: serde_json::Value = serde_json::from_str(&g.snapshot()).unwrap();
        let mut old = before.clone();
        old["village"]["version"] = 40.into();
        let p = old["village"]["progress"].as_object_mut().unwrap();
        p.remove("hobby_people");
        p.remove("social_people");
        p.insert("hobby_mask".into(), 21.into());
        p.insert("social_mask".into(), 10.into());
        assert!(g.restore(&old.to_string()));
        let now: serde_json::Value = serde_json::from_str(&g.snapshot()).unwrap();
        assert_eq!(
            now["village"]["progress"]["hobby_people"],
            serde_json::json!([0, 2, 4])
        );
        assert_eq!(
            now["village"]["progress"]["social_people"],
            serde_json::json!([1, 3])
        );
        assert!(now["village"]["progress"].get("hobby_mask").is_none());
        assert_eq!(now["residents"], before["residents"]);
        for field in ["economy", "skills", "workforce", "simulation", "buildings"] {
            assert_eq!(now["village"][field], before["village"][field]);
        }
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_eq!(g.snapshot(), saved);
        for _ in 0..60 {
            g.tick(0.1);
        }
        let saved = g.snapshot();
        let mut continued = Game::new();
        assert!(continued.restore(&saved));
        for _ in 0..60 {
            g.tick(0.1);
            continued.tick(0.1);
        }
        assert_eq!(g.snapshot(), continued.snapshot());
    }
    #[test]
    fn malformed_or_unowned_sets_cannot_replace_a_village() {
        let mut g = Game::new();
        let saved = g.snapshot();
        let current: serde_json::Value = serde_json::from_str(&saved).unwrap();
        for field in FIELDS {
            for value in [
                serde_json::json!([0, 0]),
                serde_json::json!([900]),
                serde_json::json!([-1]),
                serde_json::json!([0.5]),
                serde_json::json!(31),
                serde_json::Value::Null,
            ] {
                let mut bad = current.clone();
                bad["village"]["progress"][field] = value;
                assert!(!g.restore(&bad.to_string()), "accepted {field}");
                assert_eq!(g.snapshot(), saved);
            }
            let mut bad = current.clone();
            bad["village"]["progress"]
                .as_object_mut()
                .unwrap()
                .remove(field);
            assert!(!g.restore(&bad.to_string()));
            assert_eq!(g.snapshot(), saved);
        }
        for old_name in ["hobby_mask", "social_mask"] {
            let mut bad = current.clone();
            bad["village"]["progress"][old_name] = 31.into();
            assert!(!g.restore(&bad.to_string()));
            assert_eq!(g.snapshot(), saved);
            bad["village"]["version"] = 40.into();
            assert!(
                !g.restore(&bad.to_string()),
                "ambiguous old and new participation records"
            );
            assert_eq!(g.snapshot(), saved);
        }
        let mut bad = current.clone();
        bad["village"]["version"] = 40.into();
        bad["village"]["progress"]
            .as_object_mut()
            .unwrap()
            .remove("hobby_people");
        bad["village"]["progress"]["hobby_mask"] = 32.into();
        assert!(!g.restore(&bad.to_string()));
        assert_eq!(g.snapshot(), saved);
    }
    #[test]
    fn sparse_milestones_follow_the_roster_without_slot_limits() {
        let mut v = Village::default();
        v.skills.people = [42, 900, 1200]
            .into_iter()
            .map(|id| (id, skills::Person::default()))
            .collect();
        v.progress.hobby_people = [42, 900, 1200].into_iter().collect();
        v.progress.social_people = [900].into_iter().collect();
        assert!(valid(&v));
        v.progress.hobby_people.insert(0);
        assert!(!valid(&v));
    }
}
