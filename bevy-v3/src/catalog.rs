use std::collections::BTreeMap;

use bevy::prelude::*;
use serde::Deserialize;

#[derive(Resource, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Catalog {
    pub materials: BTreeMap<String, Material>,
    pub resource_groups: Vec<ResourceGroup>,
    pub food_resources: ResourceGroup,
    pub projects: BTreeMap<String, Project>,
    pub gathering: BTreeMap<String, GatherRecipe>,
    pub production: BTreeMap<String, ProductionRecipe>,
    pub residents: [Profile; 5],
    pub animal_rations: BTreeMap<String, AnimalRation>,
    pub workshop_comparison: usize,
}

#[derive(Deserialize)]
pub struct ResourceGroup {
    pub name: String,
    pub ids: Vec<String>,
}

#[derive(Deserialize)]
pub struct Material {
    pub name: String,
    pub batch: u32,
    pub pack: u32,
    pub price: f64,
    pub supplier: u32,
    #[serde(rename = "supplierName")]
    pub supplier_name: String,
    unit: MaterialUnit,
    pub equipment: bool,
    pub mass: f64,
    pub volume: f64,
    pub buyer: Buyer,
    pub starting: u32,
}

#[derive(Deserialize)]
enum MaterialUnit {
    #[serde(rename = "kg")]
    Kilograms,
    #[serde(rename = "L")]
    Liters,
    #[serde(rename = "units")]
    Count,
}

impl Material {
    pub fn quantity_text(&self, stock_units: u64) -> String {
        match self.unit {
            MaterialUnit::Kilograms => format!("{} kg", stock_units as f64 * self.mass),
            MaterialUnit::Liters => format!("{stock_units} L"),
            MaterialUnit::Count => stock_units.to_string(),
        }
    }
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
    #[serde(default)]
    pub description: String,
    pub size: [i32; 2],
    pub model: usize,
    #[serde(default)]
    pub construction_models: [Option<usize>; 2],
    pub unpacking_model: Option<usize>,
    pub kind: String,
    pub category: String,
    pub materials: BTreeMap<String, u32>,
    pub work: f64,
    pub camp_essential: bool,
    pub repeatable: bool,
    pub beds: Option<usize>,
}

impl Project {
    pub fn construction_model(&self, work: f64) -> Option<usize> {
        if work >= self.work {
            return None;
        }
        let fraction = work / self.work;
        if fraction < 0.35
            && let Some(model) = self.unpacking_model
        {
            return Some(model);
        }
        Some(self.construction_models[usize::from(fraction >= 0.5)].unwrap_or(self.model))
    }
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
    #[serde(default)]
    pub water: f64,
    pub repair: Option<String>,
    pub craft: Option<Craft>,
}

#[derive(Deserialize)]
pub struct Craft {
    pub skill: crate::production::crafting::Skill,
    pub level: usize,
    pub tool: Option<String>,
    pub stages: Vec<String>,
}

impl Craft {
    pub fn stage(&self, fraction: f64) -> &str {
        let index =
            ((fraction * self.stages.len() as f64).floor() as usize).min(self.stages.len() - 1);
        &self.stages[index]
    }
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

impl Profile {
    pub fn work_preference(&self, project: &str) -> u8 {
        3 * u8::from(self.aspiration.key == project)
            + 2 * u8::from(self.strengths.iter().any(|key| key == project))
    }
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
    pub(crate) fn resource_entries(&self) -> impl Iterator<Item = (&str, &str, &Material)> {
        self.resource_groups
            .iter()
            .flat_map(|group| self.resource_group_entries(group))
    }

    pub(crate) fn resource_group_entries<'a>(
        &'a self,
        group: &'a ResourceGroup,
    ) -> impl Iterator<Item = (&'a str, &'a str, &'a Material)> {
        group
            .ids
            .iter()
            .map(|id| (group.name.as_str(), id.as_str(), &self.materials[id]))
    }

    pub fn loads(&self, project: &Project) -> u32 {
        self.loads_for(&project.materials)
    }

    pub fn loads_for(&self, materials: &BTreeMap<String, u32>) -> u32 {
        materials
            .iter()
            .map(|(id, units)| units.div_ceil(self.materials[id].batch))
            .sum()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn desktop_model_bundles_are_self_contained_and_cover_catalog_scenes() {
        let catalog = Catalog::default();
        for (bundle, bytes) in [
            ("buildings", include_bytes!("buildings.glb").as_slice()),
            ("land", include_bytes!("land.glb").as_slice()),
            ("opening", include_bytes!("opening.glb").as_slice()),
        ] {
            assert_eq!(&bytes[..4], b"glTF", "{bundle}");
            assert_eq!(&bytes[16..20], b"JSON", "{bundle}");
            let length = u32::from_le_bytes(bytes[12..16].try_into().unwrap()) as usize;
            let document: serde_json::Value = serde_json::from_slice(&bytes[20..20 + length])
                .unwrap_or_else(|error| panic!("invalid {bundle} model bundle: {error}"));
            for section in ["buffers", "images"] {
                for entry in document[section].as_array().into_iter().flatten() {
                    assert!(
                        entry.get("uri").is_none_or(|uri| {
                            uri.as_str().is_some_and(|uri| uri.starts_with("data:"))
                        }),
                        "{bundle} references an external {section} asset"
                    );
                }
            }
            if bundle == "buildings" {
                let scenes = document["scenes"].as_array().unwrap();
                for (key, project) in &catalog.projects {
                    let models = std::iter::once(project.model)
                        .chain(project.construction_models.into_iter().flatten())
                        .chain(project.unpacking_model);
                    for index in models {
                        assert!(
                            index < scenes.len(),
                            "{key} references missing scene {index}"
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn construction_uses_authored_stages_or_the_standard_model_until_completion() {
        let catalog = Catalog::default();
        let road = &catalog.projects["road"];
        let [Some(groundwork), Some(assembly)] = road.construction_models else {
            panic!("road stages must be bundled");
        };
        assert_ne!(groundwork, assembly);
        assert_eq!(road.construction_model(0.0), Some(groundwork));
        assert_eq!(road.construction_model(road.work * 0.5), Some(assembly));
        assert_eq!(road.construction_model(road.work), None);

        let gathering = &catalog.projects["gathering"];
        let unpacking = gathering
            .unpacking_model
            .expect("produce crates are bundled");
        assert_eq!(gathering.construction_model(0.0), Some(unpacking));
        assert_eq!(
            gathering.construction_model(gathering.work * 0.4),
            Some(gathering.model)
        );

        let fire = &catalog.projects["fire-circle"];
        assert_eq!(fire.construction_model(0.0), Some(fire.model));
        assert_eq!(fire.construction_model(fire.work), None);
    }
}
