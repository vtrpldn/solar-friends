//! Reusable people contain authored settings, never village identity or history.
use super::*;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Preset {
    format: String,
    schema: u32,
    resident: serde_json::Value,
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    content_revision: Option<u32>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    author: Option<String>,
    #[serde(default)]
    compatibility: Option<releases::Compatibility>,
    #[serde(default)]
    credits: Vec<releases::Credit>,
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
    if preset.format != "solar-friends-resident" || !matches!(preset.schema, 1 | 2) {
        return Report::error(
            "schema",
            "unsupported_resident_preset",
            "Keep the original file; this resident preset needs a different format version.",
        );
    }
    if preset.schema == 2 {
        let supported = preset
            .compatibility
            .as_ref()
            .is_some_and(|c| c.game == 1 && c.ruleset == 1 && c.assets == 1);
        if !supported {
            return Report::error(
                "compatibility",
                "unsupported_resident_compatibility",
                "This resident needs a different game, rules or artwork version. Keep its original file.",
            );
        }
        let author = |s: &str| !s.trim().is_empty() && s.chars().count() <= 80;
        if !preset.id.as_deref().is_some_and(valid_key)
            || !preset.content_revision.is_some_and(|v| v > 0)
            || !preset
                .title
                .as_deref()
                .is_some_and(|s| !s.trim().is_empty() && s.chars().count() <= 100)
            || !preset
                .description
                .as_deref()
                .is_some_and(|s| s.chars().count() <= 1200)
            || !preset.author.as_deref().is_some_and(author)
            || preset.credits.len() > 16
            || preset
                .credits
                .iter()
                .any(|c| !valid_key(&c.release) || c.revision == 0 || !author(&c.author))
        {
            return Report::error(
                "",
                "invalid_resident_metadata",
                "Add a resident package identity, positive revision, title, description, author of 1–80 characters and at most sixteen source credits.",
            );
        }
    } else if preset.id.is_some()
        || preset.content_revision.is_some()
        || preset.title.is_some()
        || preset.description.is_some()
        || preset.author.is_some()
        || preset.compatibility.is_some()
        || !preset.credits.is_empty()
    {
        return Report::error(
            "schema",
            "invalid_resident_metadata",
            "Versioned resident metadata requires resident package format 2. Keep the original file.",
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

#[cfg(test)]
mod package_tests {
    use super::*;
    fn file() -> serde_json::Value {
        let mut resident = serde_json::to_value(residents::founders().remove(0)).unwrap();
        resident.as_object_mut().unwrap().remove("id");
        serde_json::json!({"format":"solar-friends-resident","schema":2,"id":"julia","content_revision":1,"title":"Júlia","description":"A friend with seeds","author":"João","compatibility":{"game":1,"ruleset":1,"assets":1},"resident":resident,"credits":[]})
    }
    #[test]
    fn versioned_packages_validate_metadata_and_all_compatibility_dimensions() {
        let source = file();
        assert!(validate(&source.to_string(), false).ok);
        for key in ["game", "ruleset", "assets"] {
            let mut future = source.clone();
            future["compatibility"][key] = 999.into();
            let report = validate(&future.to_string(), true);
            assert!(!report.ok);
            assert_eq!(report.issues[0].code, "unsupported_resident_compatibility");
        }
        for key in [
            "id",
            "content_revision",
            "title",
            "description",
            "author",
            "compatibility",
        ] {
            let mut missing = source.clone();
            missing.as_object_mut().unwrap().remove(key);
            assert!(!validate(&missing.to_string(), true).ok, "{key}");
        }
        for (key, value) in [
            ("author", serde_json::json!(" ")),
            ("title", serde_json::json!("")),
            ("content_revision", serde_json::json!(0)),
            ("id", serde_json::json!("not a key")),
            ("description", serde_json::json!("x".repeat(1201))),
        ] {
            let mut bad = source.clone();
            bad[key] = value;
            assert!(!validate(&bad.to_string(), true).ok, "{key}");
        }
        let mut bad = source;
        bad["credits"] = serde_json::json!([{"release":"source","revision":0,"author":"Someone"}]);
        assert!(!validate(&bad.to_string(), true).ok);
    }
}
