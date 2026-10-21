//! The visible perimeter forest and its shade share one seeded, persistent model.
use super::*;
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
    (t.species < 4).then_some((
        if t.species == 1 { 1.8 } else { 2.8 } * t.size,
        if t.species == 1 { 0.45 } else { 0.65 },
    ))
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
