//! The visible perimeter forest and its shade share one seeded, persistent model.
use super::*;
#[derive(Serialize)]
pub struct Species {
    pub key: &'static str,
    pub name: &'static str,
    pub art_index: usize,
    pub crown_radius: f32,
    pub shade_strength: f32,
    pub min_size: f32,
    pub max_size: f32,
    pub spacing: f32,
}
pub const SPECIES: [Species; 12] = [
    species("jequitiba-rosa", "Jequitibá-rosa", 0, 2.8, 0.65, 1.7),
    species("jucara", "Juçara", 1, 1.8, 0.45, 1.5),
    species("embauba", "Embaúba", 2, 2.8, 0.65, 1.7),
    species("pau-brasil", "Pau-brasil", 3, 2.8, 0.65, 1.7),
    species("forest-ferns", "Forest ferns", 4, 0., 0., 0.6),
    species("bromeliads", "Bromeliads", 5, 0., 0., 0.6),
    species("meadow-wildflowers", "Meadow wildflowers", 6, 0., 0., 0.6),
    species("dry-grasses", "Dry grasses", 7, 0., 0., 0.6),
    species("granite-outcrop", "Granite outcrop", 8, 0., 0., 0.9),
    species("quartz-stones", "Quartz stones", 9, 0., 0., 0.8),
    species("clay-ironstone", "Clay and ironstone", 10, 0., 0., 0.9),
    species("mossy-stones", "Mossy river stones", 11, 0., 0., 0.8),
];
const fn species(
    key: &'static str,
    name: &'static str,
    art_index: usize,
    crown_radius: f32,
    shade_strength: f32,
    spacing: f32,
) -> Species {
    Species {
        key,
        name,
        art_index,
        crown_radius,
        shade_strength,
        min_size: 0.65,
        max_size: 1.15,
        spacing,
    }
}
pub fn species_index(key: &str) -> Option<usize> {
    SPECIES.iter().position(|s| s.key == key)
}
pub fn default_nature(seed: u32, camp: [i32; 2]) -> Vec<crate::scenarios::NatureObject> {
    generate(seed)
        .into_iter()
        .filter(|t| {
            let inside = t.x >= camp[0] as f32 - 5.5
                && t.x < camp[0] as f32 + 4.5
                && t.y >= camp[1] as f32 - 5.5
                && t.y < camp[1] as f32 + 4.5;
            !inside && !crate::river_bank(t.x.floor() as i32, t.y.floor() as i32)
        })
        .map(|t| crate::scenarios::NatureObject {
            id: format!("nature-{}", t.index),
            species: SPECIES[t.species].key.into(),
            x: t.x,
            y: t.y,
            size: t.size,
        })
        .collect()
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Tree {
    pub index: u32,
    pub x: f32,
    pub y: f32,
    pub species: usize,
    pub size: f32,
    pub cleared: bool,
}
pub fn generate(seed: u32) -> Vec<Tree> {
    (0..(1000 * MAP_SIZE * MAP_SIZE / 4096) as u32)
        .filter_map(|index| {
            let sample = |domain| simulation::sample(seed, domain, index) as f64 / u32::MAX as f64;
            let x = (sample(71) * (MAP_SIZE + 4) as f64 - 2.) as f32;
            let y = (sample(72) * (MAP_SIZE + 4) as f64 - 2.) as f32;
            // The founding meadow remains open; the rest of the property is alive.
            if (2.5..23.).contains(&x) && (2.5..25.).contains(&y)
                || x > crate::river_center(y) - 2.5
            {
                return None;
            }
            // Broad seeded groves alternate with open ground instead of an even scatter.
            let phase = (seed % 997) as f32 / 997. * std::f32::consts::TAU;
            let grove = (x * 0.22 + phase).sin() + (y * 0.19 - phase).cos();
            if grove < 0.3 {
                return None;
            }
            let biome = habitat(seed, x, y).0;
            // Keep understory accents sparse enough that individual trees read clearly.
            let detail = index % 5 < 2;
            let species = if detail {
                match biome {
                    "Atlantic forest" => 4 + index as usize % 2,
                    "River meadow" => {
                        if index % 2 == 0 {
                            4
                        } else {
                            11
                        }
                    }
                    "Rocky woodland" => 8 + index as usize % 2,
                    "Clay terraces" => {
                        if index % 2 == 0 {
                            7
                        } else {
                            10
                        }
                    }
                    "Dry woodland" => 7,
                    _ => 6,
                }
            } else {
                index as usize / 3 % 4
            };
            Some(Tree {
                index,
                x,
                y,
                species,
                size: (if detail { 0.7 } else { 0.65 } + sample(73) * 0.45) as f32,
                cleared: false,
            })
        })
        .collect()
}
fn crown(t: &Tree) -> Option<(f32, f32)> {
    SPECIES
        .get(t.species)
        .filter(|s| s.crown_radius > 0.)
        .map(|s| (s.crown_radius * t.size, s.shade_strength))
}

fn exposure(trees: &[Tree], x: i32, y: i32) -> f32 {
    let mut light = 1.;
    for t in trees.iter().filter(|t| !t.cleared) {
        let Some((radius, strength)) = crown(t) else {
            continue;
        };
        let distance = (x as f32 - t.x - 0.8).hypot(y as f32 - t.y - 0.8);
        light *= 1. - strength * (1. - distance / radius).max(0.);
    }
    light
}
pub fn rebuild(v: &mut Village) {
    // Splat each crown only into nearby cells, rather than comparing every
    // property cell to every plant whenever a foundation clears vegetation.
    let mut light = vec![1.; (MAP_SIZE * MAP_SIZE) as usize];
    for t in v.land.vegetation.iter().filter(|t| !t.cleared) {
        let Some((radius, strength)) = crown(t) else {
            continue;
        };
        for y in ((t.y + 0.8 - radius).floor() as i32).max(0)
            ..=((t.y + 0.8 + radius).ceil() as i32).min(MAP_SIZE - 1)
        {
            for x in ((t.x + 0.8 - radius).floor() as i32).max(0)
                ..=((t.x + 0.8 + radius).ceil() as i32).min(MAP_SIZE - 1)
            {
                let distance = (x as f32 - t.x - 0.8).hypot(y as f32 - t.y - 0.8);
                light[(y * MAP_SIZE + x) as usize] *=
                    1. - strength * (1. - distance / radius).max(0.);
            }
        }
    }
    v.land.natural_light = light;
}
pub fn light(v: &Village, x: i32, y: i32) -> f32 {
    if (0..MAP_SIZE).contains(&x)
        && (0..MAP_SIZE).contains(&y)
        && v.land.natural_light.len() == (MAP_SIZE * MAP_SIZE) as usize
    {
        v.land.natural_light[(y * MAP_SIZE + x) as usize]
    } else {
        exposure(&v.land.vegetation, x, y)
    }
}
pub fn clear(v: &mut Village, n: i32, x: i32, y: i32) {
    let left = x as f32 - (n / 2) as f32 - 0.5;
    let back = y as f32 - (n / 2) as f32 - 0.5;
    let mut changed = false;
    for t in &mut v.land.vegetation {
        if !t.cleared
            && t.x >= left
            && t.x < left + n as f32
            && t.y >= back
            && t.y < back + n as f32
        {
            t.cleared = true;
            changed = true;
        }
    }
    if changed {
        rebuild(v);
    }
}
pub fn generate_for(v: &Village) -> Vec<Tree> {
    if let Some(objects) = v
        .scenario
        .as_ref()
        .and_then(|o| o.definition.map.nature.as_ref())
    {
        return objects
            .iter()
            .enumerate()
            .filter_map(|(i, p)| {
                Some(Tree {
                    index: i as u32,
                    x: p.x,
                    y: p.y,
                    size: p.size,
                    species: species_index(&p.species)?,
                    cleared: false,
                })
            })
            .collect();
    }
    let mut trees = generate(v.simulation.seed);
    if v.scenario.as_ref().is_some_and(|o| {
        o.definition.map.river.as_ref().map(|r| &r.centers)
            != crate::world::default_river().as_ref().map(|r| &r.centers)
    }) {
        trees.retain(|t| !crate::world::bank(v, t.x.floor() as i32, t.y.floor() as i32));
    }
    trees
}
pub fn valid(v: &Village) -> bool {
    let expected = generate_for(v);
    expected.len() == v.land.vegetation.len()
        && expected.iter().zip(&v.land.vegetation).all(|(a, b)| {
            a.index == b.index
                && a.x == b.x
                && a.y == b.y
                && a.species == b.species
                && a.size == b.size
                && (!b.cleared
                    || v.land.soil.iter().any(|s| {
                        s.x == (b.x + 0.5).floor() as i32 && s.y == (b.y + 0.5).floor() as i32
                    }))
        })
}
