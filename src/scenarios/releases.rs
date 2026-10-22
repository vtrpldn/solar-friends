//! Self-contained frozen content. Imported packages never execute code or assets.
use super::*;
pub const FORMAT: &str = "solar-friends-release";
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Compatibility {
    pub game: u32,
    pub ruleset: u32,
    pub assets: u32,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Credit {
    pub release: String,
    pub revision: u32,
    pub author: String,
}
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
    pub compatibility: Compatibility,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub credits: Vec<Credit>,
    pub definition: Definition,
}
fn author(value: &str) -> bool {
    !value.trim().is_empty() && value.chars().count() <= 80
}
pub fn definition(raw: serde_json::Value) -> Result<Definition, Report> {
    let package: Package = serde_json::from_value(raw).map_err(|_| {
        Report::error(
            "release",
            "invalid_release",
            "This release has missing or unsupported fields. Keep its original file.",
        )
    })?;
    if package.format != FORMAT
        || package.schema != 1
        || package.compatibility.game != 1
        || package.compatibility.ruleset != 1
        || package.compatibility.assets != 1
    {
        return Err(Report::error(
            "release.compatibility",
            "unsupported_release",
            "This release needs a different game, rules or artwork version. Keep its original file; existing villages have not been changed.",
        ));
    }
    let d = &package.definition;
    if !valid_key(&package.id)
        || package.content_revision == 0
        || package.content_revision != d.revision
        || package.content_revision != d.map.revision
        || package.title != d.title
        || package.description != d.description
        || !author(&package.author)
        || package.credits.len() > 16
        || package
            .credits
            .iter()
            .any(|c| !valid_key(&c.release) || c.revision == 0 || !author(&c.author))
    {
        return Err(Report::error(
            "release",
            "invalid_release_metadata",
            "Use matching content/map revisions and titles, a release identity, an author name of 1–80 characters and at most sixteen supported source credits.",
        ));
    }
    if d.map.terrain.is_none()
        || d.map.nature.is_none()
        || d.map.deposits.is_none()
        || d.map.biome.is_none()
        || d.rules.weather.is_none()
        || d.start.residents.is_none()
    {
        return Err(Report::error(
            "release.definition",
            "unresolved_release",
            "A release must include its resolved ground, vegetation, deposits, biome, weather and founding cast. Open its draft and save a new release.",
        ));
    }
    Ok(package.definition)
}
pub fn catalog() -> serde_json::Value {
    serde_json::json!({"format":FORMAT,"schema":1,"compatibility":{"game":1,"ruleset":1,"assets":1},"maximum_bytes":MAX_BYTES,"maximum_author":80,"maximum_credits":16})
}
#[cfg(test)]
mod tests;
