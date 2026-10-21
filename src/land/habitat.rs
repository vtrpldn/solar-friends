//! Broad, reproducible habitats connect the painted landscape to growing conditions.
use crate::river_center;
#[derive(serde::Serialize)]
pub struct Habitat {
    pub key: &'static str,
    pub name: &'static str,
    pub geology: &'static str,
    pub fertility: f32,
    pub retention: f32,
    pub cover: f32,
}
pub const HABITATS: [Habitat; 8] = [
    Habitat {
        key: "river-meadow",
        name: "River meadow",
        geology: "Alluvial silt",
        fertility: 0.88,
        retention: 1.32,
        cover: 0.85,
    },
    Habitat {
        key: "rocky-woodland",
        name: "Rocky woodland",
        geology: "Granite and quartz",
        fertility: 0.44,
        retention: 0.70,
        cover: 0.36,
    },
    Habitat {
        key: "clay-terraces",
        name: "Clay terraces",
        geology: "Red clay and ironstone",
        fertility: 0.62,
        retention: 1.28,
        cover: 0.48,
    },
    Habitat {
        key: "atlantic-forest",
        name: "Atlantic forest",
        geology: "Deep forest loam",
        fertility: 0.90,
        retention: 1.18,
        cover: 0.92,
    },
    Habitat {
        key: "dry-woodland",
        name: "Dry woodland",
        geology: "Sandy weathered soil",
        fertility: 0.50,
        retention: 0.76,
        cover: 0.46,
    },
    Habitat {
        key: "flower-meadow",
        name: "Flower meadow",
        geology: "Mixed loam",
        fertility: 0.74,
        retention: 1.00,
        cover: 0.65,
    },
    Habitat {
        key: "cerrado-savanna",
        name: "Cerrado savanna",
        geology: "Weathered red soil",
        fertility: 0.48,
        retention: 0.88,
        cover: 0.58,
    },
    Habitat {
        key: "caatinga-woodland",
        name: "Caatinga woodland",
        geology: "Stony dry woodland soil",
        fertility: 0.55,
        retention: 0.80,
        cover: 0.45,
    },
];
pub fn by_key(key: &str) -> Option<&'static Habitat> {
    HABITATS.iter().find(|h| h.key == key)
}
pub fn authored(v: &crate::Village, x: i32, y: i32) -> Option<&crate::scenarios::TerrainCell> {
    if !(0..crate::MAP_SIZE).contains(&x) || !(0..crate::MAP_SIZE).contains(&y) {
        return None;
    }
    v.scenario
        .as_ref()?
        .definition
        .map
        .terrain
        .as_ref()?
        .get((y * crate::MAP_SIZE + x) as usize)
}
/// Name, substrate, fertility, water retention and living ground cover.
pub fn habitat(seed: u32, x: f32, y: f32) -> (&'static str, &'static str, f32, f32, f32) {
    profile(seed, x, y, Some(river_center(y)))
}
pub fn for_village(
    v: &crate::Village,
    x: f32,
    y: f32,
) -> (&'static str, &'static str, f32, f32, f32) {
    if let Some(cell) = authored(v, x.floor() as i32, y.floor() as i32)
        && let Some(h) = by_key(&cell.habitat)
    {
        return (
            h.name,
            h.geology,
            cell.fertility,
            cell.retention,
            cell.cover,
        );
    }
    profile(v.land.seed, x, y, crate::world::center(v, y))
}
fn profile(
    seed: u32,
    x: f32,
    y: f32,
    river: Option<f32>,
) -> (&'static str, &'static str, f32, f32, f32) {
    let phase = (seed % 997) as f32 / 997. * std::f32::consts::TAU;
    let wave = (y * 0.13 + phase).sin() * 2.;
    if river.is_some_and(|center| (x - center).abs() < 4.5) {
        ("River meadow", "Alluvial silt", 0.88, 1.32, 0.85)
    } else if x > 21. + wave * 0.6 && (8.0..20.).contains(&y) {
        ("Rocky woodland", "Granite and quartz", 0.44, 0.70, 0.36)
    } else if y > 23. + (x * 0.18 + phase).sin() * 1.8 && x > 14. {
        ("Clay terraces", "Red clay and ironstone", 0.62, 1.28, 0.48)
    } else if y > 23. + wave * 0.5 && x < 14. {
        ("Atlantic forest", "Deep forest loam", 0.90, 1.18, 0.92)
    } else if x > 18. + wave * 0.5 && y < 8. {
        ("Dry woodland", "Sandy weathered soil", 0.50, 0.76, 0.46)
    } else {
        ("Flower meadow", "Mixed loam", 0.74, 1.00, 0.65)
    }
}
