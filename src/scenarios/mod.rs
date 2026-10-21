//! Player-authored content is compiled into a fresh world, never patched into a save.
use crate::*;
use std::collections::{BTreeMap, HashSet};

mod biomes;
mod compile;
pub(crate) use biomes::Biome;
mod definition;
mod relationships;
mod residents;
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

pub(crate) fn biome_weather(id: &str) -> Option<climate::Profile> {
    biomes::get(id).map(|p| p.weather)
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
        && origin.residents == residents::bindings(d)
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

    pub fn terrain_template(&self) -> String {
        let v = self.app.world().resource::<Village>();
        let mut base = v.clone();
        base.land.soil.clear();
        let cells: Vec<_> = (0..MAP_SIZE)
            .flat_map(|y| (0..MAP_SIZE).map(move |x| (x, y)))
            .map(|(x, y)| {
                let ground = land::ground(&base, x, y);
                TerrainCell {
                    habitat: land::habitat::HABITATS
                        .iter()
                        .find(|h| h.name == ground.biome)
                        .unwrap()
                        .key
                        .into(),
                    fertility: ground.fertility,
                    retention: ground.retention,
                    cover: ground.cover,
                }
            })
            .collect();
        serde_json::to_string(&cells).unwrap()
    }

    pub fn generate_biome_property(&self, biome: &str, seed: u32) -> String {
        serde_json::to_string(&biomes::generate(biome, seed)).unwrap()
    }

    pub fn generate_property(&self, seed: u32) -> String {
        let mut map = Definition::builtin(modes::Mode::Sandbox).map;
        map.seed = seed;
        map.nature = Some(land::vegetation::default_nature(seed, map.camp));
        map.deposits = Some(land::default_deposits(seed));
        serde_json::to_string(&map).unwrap()
    }

    pub fn scenario_catalog(&self) -> String {
        let buildings: Vec<_> = progression::BUILDINGS.iter().map(|kind| {
            let recipes: Vec<_> = ["standard", "local", "adobe"].into_iter()
                .filter(|recipe| economy::recipe(kind, recipe).is_some()).collect();
            serde_json::json!({"id":kind,"size":interactions::footprint_size(kind),"recipes":recipes,
                "appearances":if *kind=="home" {HOME_APPEARANCES.to_vec()}else{vec![]}})
        }).collect();
        serde_json::json!({"schema":SCHEMA,"format":FORMAT,"map_size":MAP_SIZE,
            "max_buildings":MAX_BUILDINGS,"weather":climate::Profile::default(),"biomes":biomes::presets(),"resident_routines":resident_preferences::catalog(),"resident_personality":personality::catalog(),"resident_presets":residents::founders(),"occupations":occupations::catalog(),"nature":land::vegetation::SPECIES,"habitats":land::habitat::HABITATS,"materials":economy::NAMES,"buildings":buildings})
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
