//! Reusable people contain authored settings, never village identity or history.
use super::*;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Preset {
    format: String,
    schema: u32,
    resident: serde_json::Value,
}
pub fn validate(raw: &str, unrestricted: bool) -> Report {
    if raw.len() > 64 * 1024 {
        return Report::error("", "file_too_large", "Keep a resident preset under 64 KiB.");
    }
    let Ok(mut preset) = serde_json::from_str::<Preset>(raw) else {
        return Report::error(
            "",
            "invalid_resident_preset",
            "This is not a supported resident preset.",
        );
    };
    if preset.format != "solar-friends-resident" || preset.schema != 1 {
        return Report::error(
            "schema",
            "unsupported_resident_preset",
            "Keep the original file; this resident preset needs a different format version.",
        );
    }
    let Some(person) = preset.resident.as_object_mut() else {
        return Report::error(
            "resident",
            "invalid_resident",
            "Choose a resident definition.",
        );
    };
    if person.contains_key("id") {
        return Report::error(
            "resident.id",
            "resident_identity",
            "Reusable residents cannot carry a village identity.",
        );
    }
    person.insert("id".into(), "resident-preset".into());
    let Ok(person) = serde_json::from_value::<residents::Person>(preset.resident) else {
        return Report::error(
            "resident",
            "invalid_resident",
            "A resident setting is missing, unknown or unavailable.",
        );
    };
    let mut definition = Definition::builtin(modes::Mode::Sandbox);
    definition.rules.learning = true;
    definition.start.residents = Some(vec![person]);
    definition.start.resident_balance = if unrestricted {
        experience::Policy::Unrestricted
    } else {
        experience::Policy::Balanced
    };
    let mut report = Report::default();
    residents::check(&definition, &mut report);
    experience::check(&definition, &mut report);
    report.ok = !report.has_errors();
    report
}

#[cfg(test)]
mod tests {
    use super::*;
    fn preset() -> serde_json::Value {
        let mut person = serde_json::to_value(residents::founders().remove(0)).unwrap();
        person.as_object_mut().unwrap().remove("id");
        serde_json::json!({"format":"solar-friends-resident","schema":1,"resident":person})
    }
    #[test]
    fn presets_validate_independently_without_mutating_a_running_village() {
        let mut game = Game::new();
        let before = game.snapshot();
        let mut file = preset();
        assert!(validate(&file.to_string(), false).ok);
        file["resident"]["experience"] =
            serde_json::json!({"background":"newcomer","levels":{"building":5}});
        assert!(!validate(&file.to_string(), false).ok);
        assert!(validate(&file.to_string(), true).ok);
        file["resident"]["id"] = "stolen-identity".into();
        assert!(!validate(&file.to_string(), true).ok);
        assert_eq!(game.snapshot(), before);
    }
    #[test]
    fn unsupported_or_runtime_data_cannot_enter_a_resident_preset() {
        for field in ["task", "energy", "hunger", "help", "unknown"] {
            let mut file = preset();
            file["resident"][field] = "idle".into();
            assert!(!validate(&file.to_string(), true).ok, "{field}");
        }
        let mut file = preset();
        file["schema"] = 999.into();
        assert!(!validate(&file.to_string(), true).ok);
        assert!(!validate(&" ".repeat(64 * 1024 + 1), true).ok);
    }
}
