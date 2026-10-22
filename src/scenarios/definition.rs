use super::Biome;
use crate::*;
use std::collections::BTreeMap;

pub const SCHEMA: u32 = 1;
pub const FORMAT: &str = "solar-friends-scenario";
pub const MAX_BYTES: usize = 2 * 1024 * 1024;
pub const MAX_BUILDINGS: usize = 256;

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Definition {
    pub format: String,
    pub schema: u32,
    pub id: String,
    pub revision: u32,
    pub title: String,
    pub description: String,
    pub map: Map,
    pub rules: Rules,
    pub start: Start,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub journal: Option<super::journal::Journal>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Map {
    pub id: String,
    pub revision: u32,
    pub generator: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub biome: Option<Biome>,
    pub width: i32,
    pub height: i32,
    pub seed: u32,
    pub camp: [i32; 2],
    pub camera: [f32; 2],
    pub clearings: Vec<Clearing>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub regions: Vec<Region>,
    #[serde(default = "world::default_river")]
    pub river: Option<world::River>,
    #[serde(default)]
    pub deposits: Option<Vec<GeologicalPatch>>,
    #[serde(default)]
    pub nature: Option<Vec<NatureObject>>,
    #[serde(default)]
    pub terrain: Option<Vec<TerrainCell>>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Region {
    pub id: String,
    pub title: String,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}
impl Region {
    pub fn contains_building(&self, b: &Building) -> bool {
        let size = interactions::footprint_size(&b.kind);
        let (x, y) = (b.x - size / 2, b.y - size / 2);
        x >= self.x
            && y >= self.y
            && x + size <= self.x + self.width
            && y + size <= self.y + self.height
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TerrainCell {
    pub habitat: String,
    pub fertility: f32,
    pub retention: f32,
    pub cover: f32,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NatureObject {
    pub id: String,
    pub species: String,
    pub x: f32,
    pub y: f32,
    pub size: f32,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GeologicalPatch {
    pub id: String,
    pub material: String,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub quantity: u32,
}
impl GeologicalPatch {
    pub fn material_index(&self) -> Option<usize> {
        economy::NAMES
            .iter()
            .position(|key| *key == self.material)
            .filter(|i| (2..5).contains(i))
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Clearing {
    pub x: i32,
    pub y: i32,
    pub size: i32,
    pub disturbance: f32,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Rules {
    pub mode: modes::Mode,
    pub logistics: bool,
    pub land: bool,
    pub utilities: bool,
    pub climate: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub weather: Option<climate::Profile>,
    pub maintenance: bool,
    pub learning: bool,
    pub market: bool,
}
impl Rules {
    pub fn for_mode(mode: modes::Mode) -> Self {
        let constrained = mode == modes::Mode::Story;
        Self {
            mode,
            logistics: constrained,
            land: constrained,
            utilities: constrained,
            climate: constrained,
            weather: None,
            maintenance: constrained,
            learning: constrained,
            market: constrained,
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Start {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub residents: Option<Vec<super::residents::Person>>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub relationships: Vec<super::relationships::Bond>,
    #[serde(
        default,
        skip_serializing_if = "super::experience::Policy::is_balanced"
    )]
    pub resident_balance: super::experience::Policy,
    pub minutes: f32,
    pub funds: i64,
    pub fresh_water: f32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub liquids: Option<Vec<StartingLiquids>>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub resource_sites: Vec<super::sites::StartingSite>,
    pub buildings: Vec<Structure>,
    pub roads: Vec<[i32; 2]>,
    pub inventories: Vec<Inventory>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StartingLiquids {
    pub owner: InventoryOwner,
    pub contents: BTreeMap<String, f64>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Structure {
    pub id: String,
    pub kind: String,
    pub x: i32,
    pub y: i32,
    pub state: BuildingState,
    pub recipe: String,
    pub appearance: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub crop: Option<super::farming::StartingCrop>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub orchard: Option<super::orchards::StartingOrchard>,
}
#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BuildingState {
    Completed,
    Blueprint,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Inventory {
    pub owner: InventoryOwner,
    pub items: BTreeMap<String, u32>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub food_lots: Vec<StartingFood>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StartingFood {
    pub material: String,
    pub amount: u32,
    pub age_minutes: f32,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    content = "building",
    rename_all = "snake_case",
    deny_unknown_fields
)]
pub enum InventoryOwner {
    Camp,
    Building(String),
}

/// Frozen content provenance travels with a run, independently of editor drafts.
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Origin {
    pub schema: u32,
    pub definition: Definition,
    pub buildings: BTreeMap<String, usize>,
    #[serde(default)]
    pub residents: BTreeMap<String, usize>,
}

pub const HOME_APPEARANCES: [&str; 6] = [
    "home",
    "home-veranda",
    "home-gable",
    "home-courtyard",
    "adobe-gable",
    "adobe-veranda",
];

impl Definition {
    pub fn builtin(mode: modes::Mode) -> Self {
        let middle = MAP_SIZE / 2;
        let sandbox = mode == modes::Mode::Sandbox;
        let mut items = economy::Economy::default().stock;
        items[0] = 32;
        if sandbox {
            items.fill(24);
            for i in [
                economy::EGGS,
                economy::COMPOST,
                economy::SCRAPS,
                economy::SEEDLINGS,
                economy::FODDER,
                economy::MILK,
                economy::HONEY,
                economy::GOATS,
                economy::BEES,
            ] {
                items[i] = 0;
            }
            items[0] = 100;
            items[economy::FOOD] = 80;
            items[economy::MEALS] = 20;
            items[economy::TOOLS] = 36;
            items[economy::TREE_STARTS] = 8;
            items[economy::BAMBOO_STARTS] = 2;
        }
        // Default supplies are deliberately located, food indoors first.
        let mut indoor = [0u32; economy::COUNT];
        let mut room = 300;
        for i in [
            economy::FOOD,
            economy::MEALS,
            economy::EGGS,
            economy::MILK,
            economy::HONEY,
        ]
        .into_iter()
        .chain((0..economy::COUNT).filter(|i| {
            ![
                economy::FOOD,
                economy::MEALS,
                economy::EGGS,
                economy::MILK,
                economy::HONEY,
            ]
            .contains(i)
        })) {
            let n = room.min(items[i]);
            indoor[i] = n;
            items[i] -= n;
            room -= n;
        }
        let named = |bundle: economy::Bundle| {
            bundle
                .into_iter()
                .enumerate()
                .filter(|(_, n)| *n > 0)
                .map(|(i, n)| (economy::NAMES[i].to_string(), n))
                .collect()
        };
        let key = if sandbox { "sandbox" } else { "story" };
        Self {
            journal: None,
            format: FORMAT.into(),
            schema: SCHEMA,
            id: format!("builtin-{key}"),
            revision: 1,
            title: if sandbox { "An open clearing" } else { "A shared beginning" }.into(),
            description: "Five friends arrive with supplies, a shared shed and a storage house. Homes are still needed for overnight stays.".into(),
            map: Map {
                id: "founding-property".into(),
                revision: 1,
                generator: "property-v1".into(),
                biome: None,
                river: world::default_river(),
                terrain: None,
                nature: Some(land::vegetation::default_nature(simulation::State::default().seed,[middle,middle])),
                deposits: Some(land::default_deposits(simulation::State::default().seed)),
                width: MAP_SIZE,
                height: MAP_SIZE,
                seed: simulation::State::default().seed,
                camp: [middle, middle],
                camera: [middle as f32, middle as f32],
                regions: vec![],
                clearings: vec![Clearing { x: middle, y: middle, size: 10, disturbance: 0.05 }],
            },
            rules: Rules::for_mode(mode),
            start: Start {
                residents: Some(super::residents::founders()),
                relationships:vec![],
                resident_balance:super::experience::Policy::Balanced,
                minutes: 480.,
                funds: if sandbox { 10_000_000 } else { 300_000 },
                fresh_water: if sandbox { 40. } else { 32. },
                liquids:None,
                resource_sites:vec![],
                buildings: [("shed", -2, -3), ("warehouse", 4, -3)]
                    .into_iter()
                    .map(|(kind, dx, dy)| Structure {
                        id: format!("starting-{kind}"),
                        kind: kind.into(),
                        x: middle + dx,
                        y: middle + dy,
                        state: BuildingState::Completed,
                        recipe: "standard".into(),
                        appearance: None,
                        crop:None,
                        orchard:None,
                    })
                    .collect(),
                roads: vec![],
                inventories: vec![
                    Inventory { owner: InventoryOwner::Building("starting-warehouse".into()), items: named(indoor), food_lots: vec![] },
                    Inventory { owner: InventoryOwner::Camp, items: named(items), food_lots: vec![] },
                ],
            },
        }
    }
}
