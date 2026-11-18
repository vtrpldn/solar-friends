use std::collections::BTreeMap;

use bevy::prelude::*;
use serde::Deserialize;

#[derive(Resource, Deserialize)]
pub struct Catalog {
    pub materials: BTreeMap<String, Material>,
    pub projects: BTreeMap<String, Project>,
    pub gathering: BTreeMap<String, GatherRecipe>,
    pub production: BTreeMap<String, ProductionRecipe>,
}

#[derive(Deserialize)]
pub struct Material {
    pub name: String,
    pub batch: u32,
    pub pack: u32,
    pub price: f64,
    pub supplier: u32,
    pub mass: f64,
    pub volume: f64,
    pub starting: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub name: String,
    pub size: [i32; 2],
    pub model: usize,
    pub kind: String,
    pub category: String,
    pub materials: BTreeMap<String, u32>,
    pub work: f64,
    pub camp_essential: bool,
    pub repeatable: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GatherRecipe {
    pub name: String,
    pub output: BTreeMap<String, u32>,
    pub work: f64,
    #[serde(default)]
    pub renew: f64,
    #[serde(default)]
    pub gather_limit: u32,
    #[serde(default)]
    pub deposit: u32,
}

#[derive(Deserialize)]
pub struct ProductionRecipe {
    pub name: String,
    pub kind: String,
    pub input: BTreeMap<String, u32>,
    pub output: BTreeMap<String, u32>,
    pub work: f64,
    pub handcraft: bool,
}

impl Default for Catalog {
    fn default() -> Self {
        serde_json::from_str(include_str!("../data/construction.json"))
            .expect("the embedded construction catalog must be valid")
    }
}

impl Catalog {
    pub fn loads(&self, project: &Project) -> u32 {
        project
            .materials
            .iter()
            .map(|(id, units)| units.div_ceil(self.materials[id].batch))
            .sum()
    }
}
