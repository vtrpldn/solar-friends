//! Reusable land contains resolved physical baselines, never settlement state.
use super::*;
pub const FORMAT: &str = "solar-friends-map";
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Package {
    pub format: String,
    pub schema: u32,
    pub id: String,
    pub content_revision: u32,
    pub title: String,
    pub description: String,
    pub author: String,
    pub compatibility: releases::Compatibility,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub credits: Vec<releases::Credit>,
    pub map: Map,
    pub weather: climate::Profile,
}
fn author(value: &str) -> bool {
    !value.trim().is_empty() && value.chars().count() <= 80
}
pub fn validate(raw: &str) -> Report {
    if raw.len() > MAX_BYTES {
        return Report::error("", "file_too_large", "Keep shared maps under 2 MiB.");
    }
    let Ok(value) = serde_json::from_str::<serde_json::Value>(raw) else {
        return Report::error(
            "",
            "invalid_map_package",
            "This is not a readable map package. Keep its original file.",
        );
    };
    let explicit_river = value
        .get("map")
        .and_then(serde_json::Value::as_object)
        .is_some_and(|map| map.contains_key("river"));
    let Ok(package) = serde_json::from_value::<Package>(value) else {
        return Report::error(
            "",
            "invalid_map_package",
            "This map has missing or unsupported fields. Keep its original file.",
        );
    };
    if package.format != FORMAT
        || package.schema != 1
        || package.compatibility.game != 1
        || package.compatibility.ruleset != 1
        || package.compatibility.assets != 1
    {
        return Report::error(
            "compatibility",
            "unsupported_map_package",
            "This map needs a different game, rules or artwork version. Keep its original file; existing creations have not been changed.",
        );
    }
    if !valid_key(&package.id)
        || package.content_revision == 0
        || package.content_revision != package.map.revision
        || package.title.trim().is_empty()
        || package.title.chars().count() > 100
        || package.description.chars().count() > 2000
        || !author(&package.author)
        || package.credits.len() > 16
        || package
            .credits
            .iter()
            .any(|c| !valid_key(&c.release) || c.revision == 0 || !author(&c.author))
    {
        return Report::error(
            "",
            "invalid_map_metadata",
            "Use supported map identities, matching positive content/map revisions, a title up to 100 characters, description up to 2,000 characters, author of 1–80 characters and at most sixteen source credits.",
        );
    }
    if !explicit_river
        || package.map.terrain.is_none()
        || package.map.nature.is_none()
        || package.map.deposits.is_none()
        || package.map.biome.is_none()
    {
        return Report::error(
            "map",
            "unresolved_map_package",
            "A shared map must include its resolved ground, natural plants, finite reserves, explicit river or river-free setting and regional biome.",
        );
    }
    let mut report = Report::default();
    map_validation::check(&package.map, &mut report);
    if !package.weather.valid() {
        report.push(
            "weather",
            "invalid_weather",
            "Use a supported seasonal weather profile.",
        );
    }
    report.ok = !report.has_errors();
    report
}
pub fn catalog() -> serde_json::Value {
    serde_json::json!({"format":FORMAT,"schema":1,"compatibility":{"game":1,"ruleset":1,"assets":1},"maximum_bytes":MAX_BYTES,"maximum_author":80,"maximum_credits":16})
}
#[cfg(test)]
mod tests;
