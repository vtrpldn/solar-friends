use std::collections::BTreeMap;

use bevy::prelude::*;
use serde::Deserialize;

#[derive(Resource, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Catalog {
    pub materials: BTreeMap<String, Material>,
    pub projects: BTreeMap<String, Project>,
    pub gathering: BTreeMap<String, GatherRecipe>,
    pub production: BTreeMap<String, ProductionRecipe>,
    pub residents: [Profile; 5],
    pub animal_rations: BTreeMap<String, AnimalRation>,
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
    pub buyer: Buyer,
    pub starting: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Buyer {
    pub name: String,
    pub batches: u32,
    pub full_price_batches: u32,
    pub ratio: f64,
    pub bulk_ratio: f64,
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
    pub beds: Option<usize>,
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
    #[serde(default)]
    pub preserved: BTreeMap<String, f64>,
    pub biology: Option<Biology>,
    pub biogas: Option<f64>,
}

#[derive(Deserialize)]
pub struct Biology {
    pub days: f64,
    pub window: Option<f64>,
    pub seasonal: bool,
    pub planting_fraction: f64,
    pub on_site_water: f64,
    pub care: Option<[f64; 2]>,
}

#[derive(Deserialize)]
pub struct Profile {
    pub role: String,
    pub bio: String,
    pub rates: BTreeMap<String, f64>,
    pub strengths: Vec<String>,
    pub temperament: Temperament,
    pub interests: Vec<String>,
    pub favorites: Vec<String>,
    pub hobby: String,
    pub aspiration: Aspiration,
    pub reflection: String,
}

#[derive(Deserialize)]
pub struct Aspiration {
    pub key: String,
    pub label: String,
    pub reason: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Temperament {
    pub social_at: f64,
    pub accepts_at: f64,
    pub break_at: f64,
    pub bedtime: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimalRation {
    pub days: f64,
    pub fodder: u32,
    pub water: f64,
    pub product: String,
    pub daily_output: f64,
    pub batch: u32,
    pub shelf_days: f64,
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
