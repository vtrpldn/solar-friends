//! Player-authored content is compiled into a fresh world, never patched into a save.
use crate::*;
use std::collections::{BTreeMap, HashSet};

mod compile;
mod definition;
pub(crate) use definition::*;

#[derive(Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    Error,
    Warning,
}
#[derive(Clone, Serialize)]
pub struct Issue {
    pub severity: Severity,
    pub code: String,
    pub path: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub at: Option<[i32; 2]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity: Option<String>,
}
#[derive(Default, Serialize)]
pub struct Report {
    pub ok: bool,
    pub issues: Vec<Issue>,
}
impl Report {
    pub fn error(path: &str, code: &str, message: impl Into<String>) -> Self {
        let mut report = Self::default();
        report.push(path, code, message);
        report
    }
    pub fn push(&mut self, path: &str, code: &str, message: impl Into<String>) {
        self.issues.push(Issue {
            severity: Severity::Error,
            code: code.into(),
            path: path.into(),
            message: message.into(),
            at: None,
            entity: None,
        });
    }
    pub fn has_errors(&self) -> bool {
        self.issues
            .iter()
            .any(|i| matches!(i.severity, Severity::Error))
    }
}

pub(crate) fn valid_key(key: &str) -> bool {
    !key.is_empty()
        && key.len() <= 80
        && key
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'-' | b'_'))
}

pub(crate) fn parse(data: &str) -> Result<Definition, Report> {
    if data.len() > MAX_BYTES {
        return Err(Report::error(
            "",
            "file_too_large",
            "This scenario is too large to open.",
        ));
    }
    let value: serde_json::Value = serde_json::from_str(data)
        .map_err(|_| Report::error("", "invalid_json", "This file is not a readable scenario."))?;
    if value["format"] != FORMAT || value["schema"].as_u64() != Some(u64::from(SCHEMA)) {
        return Err(Report::error(
            "schema",
            "unsupported_format",
            "This scenario format is not supported by this game version.",
        ));
    }
    serde_json::from_value(value).map_err(|_| Report::error("", "invalid_definition", "A scenario field is missing or has an unsupported value. Keep the original file and check its game version."))
}

pub(crate) fn compile(definition: Definition) -> Result<(Game, Report), Report> {
    compile::build(definition)
}

pub(crate) fn valid_origin(v: &Village) -> bool {
    let Some(origin) = &v.scenario else {
        return true;
    };
    let d = &origin.definition;
    let mut ids = HashSet::new();
    origin.schema == SCHEMA
        && !compile::check(d).has_errors()
        && d.map.camp.map(|n| n as f32) == [v.camp.0, v.camp.1]
        && d.map.seed == v.simulation.seed
        && origin.buildings.len() == d.start.buildings.len()
        && d.start.buildings.iter().all(|b| {
            origin
                .buildings
                .get(&b.id)
                .is_some_and(|id| *id < v.economy.next_building && ids.insert(*id))
        })
}

#[wasm_bindgen]
impl Game {
    /// A reusable authoring document. This is not a playable save file.
    pub fn scenario_template(&self, mode: &str) -> String {
        let definition = match mode {
            "story" => Some(Definition::builtin(modes::Mode::Story)),
            "sandbox" => Some(Definition::builtin(modes::Mode::Sandbox)),
            _ => None,
        };
        serde_json::to_string(&definition).unwrap()
    }

    pub fn scenario_catalog(&self) -> String {
        let buildings: Vec<_> = progression::BUILDINGS.iter().map(|kind| {
            let recipes: Vec<_> = ["standard", "local", "adobe"].into_iter()
                .filter(|recipe| economy::recipe(kind, recipe).is_some()).collect();
            serde_json::json!({"id":kind,"size":interactions::footprint_size(kind),"recipes":recipes,
                "appearances":if *kind=="home" {HOME_APPEARANCES.to_vec()}else{vec![]}})
        }).collect();
        serde_json::json!({"schema":SCHEMA,"format":FORMAT,"map_size":MAP_SIZE,
            "max_buildings":MAX_BUILDINGS,"materials":economy::NAMES,"buildings":buildings})
        .to_string()
    }

    pub fn validate_scenario(&self, data: &str) -> String {
        let report = match parse(data).and_then(compile) {
            Ok((_, report)) => report,
            Err(report) => report,
        };
        serde_json::to_string(&report).unwrap()
    }

    /// Commit only after the entire definition has compiled successfully.
    pub fn load_scenario(&mut self, data: &str) -> String {
        let report = match parse(data).and_then(compile) {
            Ok((candidate, report)) => {
                *self = candidate;
                report
            }
            Err(report) => report,
        };
        serde_json::to_string(&report).unwrap()
    }
}

#[cfg(test)]
mod tests;
