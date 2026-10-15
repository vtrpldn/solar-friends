//! Seeded ground and persistent, spatially bounded extraction reserves.
use crate::{Game, MAP_SIZE, Village, interactions, resource_sites, river_bank, simulation};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Deposit {
    pub id: simulation::Id,
    pub material: usize,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub maximum: u32,
    pub remaining: u32,
}
impl Deposit {
    pub fn contains(&self, x: i32, y: i32) -> bool {
        (self.x..self.x + self.width).contains(&x) && (self.y..self.y + self.height).contains(&y)
    }
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Soil {
    pub x: i32,
    pub y: i32,
    pub nutrients: f32,
    pub disturbance: f32,
    pub cover: f32,
}
#[derive(Clone, Default, Serialize, Deserialize)]
pub struct State {
    pub schema: u32,
    pub seed: u32,
    pub revision: u32,
    pub deposits: Vec<Deposit>,
    pub soil: Vec<Soil>,
}
#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct Ground {
    pub fertility: f32,
    pub retention: f32,
    pub cover: f32,
    pub nutrients: f32,
    pub disturbance: f32,
}
// Broad geological regions are legible across seeds; the amount at each patch varies.
const REGIONS: [(i32, i32, i32, i32); 9] = [
    (1, 1, 16, 11),
    (12, 14, 9, 12),
    (1, 18, 9, 9),
    (17, 17, 4, 7),
    (21, 21, 6, 6),
    (17, 24, 4, 3),
    (1, 8, 9, 16),
    (13, 1, 9, 6),
    (10, 24, 10, 3),
];
fn quantities(seed: u32, material: usize) -> [u32; 3] {
    let total = resource_sites::LAND[material - 2] as u32;
    let third = total / 3;
    let spread = (third / 4).max(1);
    let a = third - spread + simulation::sample(seed, 41, material as u32) % (2 * spread + 1);
    let b = third - spread + simulation::sample(seed, 42, material as u32) % (2 * spread + 1);
    [a, b, total - a - b]
}
pub fn initialise(v: &mut Village) -> bool {
    let Some(end) = v.simulation.next_id.checked_add(9) else {
        return false;
    };
    if v.economy
        .land
        .iter()
        .enumerate()
        .any(|(i, n)| !n.is_finite() || *n < 0. || *n > resource_sites::LAND[i] || n.fract() != 0.)
    {
        return false;
    }
    let mut state = State {
        schema: 1,
        seed: v.simulation.seed,
        ..State::default()
    };
    for material in 2..5 {
        let mut depleted =
            resource_sites::LAND[material - 2] as u32 - v.economy.land[material - 2] as u32;
        for (part, maximum) in quantities(state.seed, material).into_iter().enumerate() {
            let (x, y, width, height) = REGIONS[(material - 2) * 3 + part];
            let used = depleted.min(maximum);
            depleted -= used;
            state.deposits.push(Deposit {
                id: simulation::Id(v.simulation.next_id + state.deposits.len() as u32),
                material,
                x,
                y,
                width,
                height,
                maximum,
                remaining: maximum - used,
            });
        }
    }
    v.simulation.next_id = end;
    v.land = state;
    // This path authors a new village or an explicit version-3 development fixture.
    // Playable version-11 saves are validated, never repaired or replenished here.
    for index in 0..v.economy.sources.len() {
        let s = &v.economy.sources[index];
        if s.material < 2 {
            continue;
        }
        let Some(d) = deposit(v, s.material, s.x, s.y).cloned() else {
            return false;
        };
        let s = &mut v.economy.sources[index];
        s.deposit = Some(d.id);
        s.maximum = d.maximum as f32;
        if s.active {
            s.remaining = d.remaining as f32;
        }
    }
    true
}
pub fn reseed(v: &mut Village, seed: u32) {
    v.simulation.seed = seed;
    v.land.seed = seed;
    for (i, d) in v.land.deposits.iter_mut().enumerate() {
        d.maximum = quantities(seed, d.material)[i % 3];
        d.remaining = d.maximum;
    }
    v.land.revision = v.land.revision.saturating_add(1);
}
pub fn deposit(v: &Village, material: usize, x: i32, y: i32) -> Option<&Deposit> {
    if !(2..5).contains(&material)
        || !(1..MAP_SIZE - 1).contains(&x)
        || !(1..MAP_SIZE - 1).contains(&y)
    {
        return None;
    }
    let n = resource_sites::size(material);
    v.land
        .deposits
        .iter()
        .filter(|d| d.material == material)
        .filter_map(|d| {
            let overlap = (x - n / 2..x - n / 2 + n)
                .flat_map(|a| (y - n / 2..y - n / 2 + n).map(move |b| (a, b)))
                .filter(|&(a, b)| d.contains(a, b))
                .count();
            (overlap > 0).then_some((d, overlap))
        })
        .max_by(|(a, n), (b, m)| n.cmp(m).then_with(|| b.id.0.cmp(&a.id.0)))
        .map(|(d, _)| d)
}
pub fn extract(v: &mut Village, id: simulation::Id, amount: u32) {
    let Some(d) = v.land.deposits.iter_mut().find(|d| d.id == id) else {
        return;
    };
    assert!(
        amount <= d.remaining,
        "extraction exceeds its local deposit"
    );
    d.remaining -= amount;
    let remaining = d.remaining;
    for s in &mut v.economy.sources {
        if s.active && s.deposit == Some(id) {
            s.remaining = remaining as f32;
        }
    }
    sync(v);
    v.land.revision = v.land.revision.saturating_add(1);
}
fn sync(v: &mut Village) {
    v.economy.land = std::array::from_fn(|i| {
        v.land
            .deposits
            .iter()
            .filter(|d| d.material == i + 2)
            .map(|d| d.remaining as f32)
            .sum()
    });
}
pub fn ground(v: &Village, x: i32, y: i32) -> Ground {
    let index = (y * MAP_SIZE + x) as u32;
    let starter = (4..=16).contains(&x) && (4..=16).contains(&y);
    let sample = |domain| simulation::sample(v.land.seed, domain, index) as f64 / u32::MAX as f64;
    let base_fertility = if starter {
        0.72
    } else {
        0.35 + sample(51) as f32 * 0.6
    };
    let base_cover = if starter {
        0.35
    } else {
        0.2 + sample(53) as f32 * 0.7
    };
    let edit = v.land.soil.iter().find(|s| s.x == x && s.y == y);
    let nutrients = edit.map_or(1., |s| s.nutrients);
    let disturbance = edit.map_or(0., |s| s.disturbance);
    Ground {
        fertility: (base_fertility * nutrients * (1. - disturbance * 0.3)).clamp(0., 1.),
        retention: if starter {
            1.
        } else {
            0.65 + sample(52) as f32 * 0.7
        },
        cover: edit.map_or(base_cover, |s| s.cover),
        nutrients,
        disturbance,
    }
}
pub fn disturb(v: &mut Village, kind: &str, x: i32, y: i32) {
    let n = interactions::footprint_size(kind);
    let impact: f32 = if matches!(kind, "garden" | "grove" | "banana_treatment") {
        0.08
    } else {
        0.4
    };
    for a in x - n / 2..x - n / 2 + n {
        for b in y - n / 2..y - n / 2 + n {
            if !(1..MAP_SIZE - 1).contains(&a)
                || !(1..MAP_SIZE - 1).contains(&b)
                || river_bank(a, b)
            {
                continue;
            }
            if let Some(s) = v.land.soil.iter_mut().find(|s| s.x == a && s.y == b) {
                s.disturbance = (s.disturbance + impact).min(1.);
                s.cover *= 1. - impact;
            } else {
                let base = ground(v, a, b);
                v.land.soil.push(Soil {
                    x: a,
                    y: b,
                    nutrients: 1.,
                    disturbance: impact,
                    cover: base.cover * (1. - impact),
                });
            }
        }
    }
    v.land.soil.sort_by_key(|s| (s.y, s.x));
    v.land.revision = v.land.revision.saturating_add(1);
}
pub fn valid(v: &Village) -> bool {
    if v.land.schema != 1
        || v.land.seed != v.simulation.seed
        || v.land.deposits.len() != 9
        || v.land.soil.len() > 676
    {
        return false;
    }
    let mut ids = std::collections::HashSet::new();
    for (index, d) in v.land.deposits.iter().enumerate() {
        let material = index / 3 + 2;
        let (x, y, width, height) = REGIONS[index];
        if d.id.0 == 0
            || d.id.0 >= v.simulation.next_id
            || !ids.insert(d.id)
            || d.material != material
            || (d.x, d.y, d.width, d.height) != (x, y, width, height)
            || d.maximum != quantities(v.land.seed, material)[index % 3]
            || d.remaining > d.maximum
        {
            return false;
        }
    }
    let mut last = None;
    for s in &v.land.soil {
        if !(1..MAP_SIZE - 1).contains(&s.x)
            || !(1..MAP_SIZE - 1).contains(&s.y)
            || river_bank(s.x, s.y)
            || last.is_some_and(|key| key >= (s.y, s.x))
            || [s.nutrients, s.disturbance, s.cover]
                .iter()
                .any(|n| !n.is_finite() || !(0.0..=1.).contains(n))
        {
            return false;
        }
        last = Some((s.y, s.x));
    }
    v.economy.land.iter().enumerate().all(|(i, &n)| {
        n == v
            .land
            .deposits
            .iter()
            .filter(|d| d.material == i + 2)
            .map(|d| d.remaining as f32)
            .sum::<f32>()
    })
}
pub fn view(v: &Village) -> serde_json::Value {
    let cells: Vec<_> = (1..MAP_SIZE - 1)
        .flat_map(|y| (1..MAP_SIZE - 1).map(move |x| (x, y)))
        .filter(|&(x, y)| !river_bank(x, y))
        .map(|(x, y)| serde_json::json!({"x":x,"y":y,"ground":ground(v,x,y)}))
        .collect();
    serde_json::json!({"seed":v.land.seed,"revision":v.land.revision,"deposits":v.land.deposits,"cells":cells})
}
#[wasm_bindgen]
impl Game {
    pub fn land_report(&self) -> String {
        view(self.app.world().resource::<Village>()).to_string()
    }
    pub fn land_preview(&self, kind: &str, x: i32, y: i32) -> String {
        let v = self.app.world().resource::<Village>();
        if !(1..MAP_SIZE - 1).contains(&x) || !(1..MAP_SIZE - 1).contains(&y) {
            return "{}".into();
        }
        let material = match kind {
            "source_timber" => Some(0),
            "source_bamboo" => Some(1),
            "source_earth" => Some(2),
            "source_stone" => Some(3),
            "source_salvage" => Some(4),
            _ => None,
        };
        let n = if kind == "road" {
            1
        } else if let Some(m) = material {
            resource_sites::size(m)
        } else if crate::economy::recipe(kind, "standard").is_some() {
            interactions::footprint_size(kind)
        } else {
            return "{}".into();
        };
        let mut rows = vec![];
        for a in x - n / 2..x - n / 2 + n {
            for b in y - n / 2..y - n / 2 + n {
                if !(1..MAP_SIZE - 1).contains(&a)
                    || !(1..MAP_SIZE - 1).contains(&b)
                    || river_bank(a, b)
                {
                    return "{}".into();
                }
                rows.push(ground(v, a, b));
            }
        }
        let count = rows.len() as f32;
        let soil = Ground {
            fertility: rows.iter().map(|r| r.fertility).sum::<f32>() / count,
            retention: rows.iter().map(|r| r.retention).sum::<f32>() / count,
            nutrients: rows.iter().map(|r| r.nutrients).sum::<f32>() / count,
            cover: rows.iter().map(|r| r.cover).sum::<f32>() / count,
            disturbance: rows.iter().map(|r| r.disturbance).sum::<f32>() / count,
        };
        let patch = material
            .filter(|m| *m >= 2)
            .and_then(|m| deposit(v, m, x, y));
        serde_json::json!({"x":x,"y":y,"cells":rows.len(),"ground":soil,"deposit":patch})
            .to_string()
    }
}
#[cfg(test)]
mod tests;
