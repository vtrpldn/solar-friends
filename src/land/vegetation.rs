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
    (0..170)
        .filter_map(|index| {
            let sample = |domain| simulation::sample(seed, domain, index) as f64 / u32::MAX as f64;
            let x = (sample(71) * 32. - 2.) as f32;
            let y = (sample(72) * 32. - 2.) as f32;
            if x > 1. && x < 27. && y > 1. && y < 27.
                || (x - (25.8 + (y * 0.32).sin() * 0.65)).abs() < 1.8
            {
                return None;
            }
            Some(Tree {
                index,
                x,
                y,
                species: index as usize % 4,
                size: (0.65 + sample(73) * 0.55) as f32,
                cleared: false,
            })
        })
        .collect()
}
fn exposure(trees: &[Tree], x: i32, y: i32) -> f32 {
    let mut light = 1.;
    for t in trees.iter().filter(|t| !t.cleared) {
        let radius = if t.species == 1 { 1.8 } else { 2.8 } * t.size;
        let distance = (x as f32 - t.x - 0.8).hypot(y as f32 - t.y - 0.8);
        let strength = if t.species == 1 { 0.45 } else { 0.65 };
        light *= 1. - strength * (1. - distance / radius).max(0.);
    }
    light
}
pub fn rebuild(v: &mut Village) {
    v.land.natural_light = (0..MAP_SIZE)
        .flat_map(|y| (0..MAP_SIZE).map(move |x| (x, y)))
        .map(|(x, y)| exposure(&v.land.vegetation, x, y))
        .collect();
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
pub fn valid(v: &Village) -> bool {
    let expected = generate(v.land.seed);
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
