//! Root-zone wetness is saved in the ground; crop fields are validated summaries.
use super::*;
use crate::ecology;
#[derive(Clone, Copy)]
pub struct RootZone {
    pub capacity: f32,
    pub drying: f32,
    pub covered: bool,
}

fn cells(n: i32, x: i32, y: i32) -> impl Iterator<Item = (i32, i32)> {
    let valid = (1..MAP_SIZE - 1).contains(&x) && (1..MAP_SIZE - 1).contains(&y);
    let (x, y) = if valid { (x, y) } else { (0, 0) };
    (x - n / 2..x - n / 2 + n)
        .flat_map(move |a| (y - n / 2..y - n / 2 + n).map(move |b| (a, b)))
        .filter(move |&(a, b)| {
            valid && (0..MAP_SIZE).contains(&a) && (0..MAP_SIZE).contains(&b) && !river_bank(a, b)
        })
}
pub fn wetness(v: &Village, n: i32, x: i32, y: i32) -> f32 {
    let values: Vec<_> = cells(n, x, y)
        .map(|(a, b)| v.land.water[(b * MAP_SIZE + a) as usize])
        .collect();
    if values.is_empty() {
        0.
    } else {
        values.iter().sum::<f32>() / values.len() as f32
    }
}
pub fn water_plot(v: &mut Village, n: i32, x: i32, y: i32, wetness: f32) {
    for (a, b) in cells(n, x, y) {
        v.land.water[(b * MAP_SIZE + a) as usize] = wetness.clamp(0., 1.);
    }
    v.land.revision = v.land.revision.saturating_add(1);
    sync_moisture(v);
}
pub fn sync_moisture(v: &mut Village) {
    for i in 0..v.buildings.len() {
        let b = &v.buildings[i];
        if !ecology::farm(b) || b.progress < 100. {
            continue;
        }
        let water = if b.crop.planted {
            wetness(v, interactions::footprint_size(&b.kind), b.x, b.y)
                * ecology::moisture_capacity(b)
        } else {
            0.
        };
        v.buildings[i].crop.moisture = water;
    }
    for i in 0..v.economy.sources.len() {
        let s = &v.economy.sources[i];
        if !s.active || s.material >= 2 {
            continue;
        }
        let water = if s.planted {
            wetness(v, resource_sites::size(s.material), s.x, s.y) * 1440.
        } else {
            0.
        };
        v.economy.sources[i].moisture = water;
    }
}
fn step_cell(
    v: &mut Village,
    x: i32,
    y: i32,
    minutes: f32,
    profile: RootZone,
    weather: crate::climate::Weather,
) -> f32 {
    let RootZone {
        capacity,
        drying,
        covered,
    } = profile;
    let index = (y * MAP_SIZE + x) as usize;
    let rain = if !covered { 3. * weather.rain } else { 0. };
    let start = v.land.water[index];
    if start == 0. && rain == 0. {
        return 0.;
    }
    let g = ground(v, x, y);
    let drying = drying / g.retention
        * (1. - g.shade * 0.35)
        * (1. - (g.cover - 0.35).max(0.) * 0.2)
        * (1. + (weather.evaporation - 1.) * if covered { 0.4 } else { 1. });
    let wet = if rain > 0. {
        minutes
    } else {
        minutes.min(start * capacity / drying)
    };
    v.land.water[index] = (start + (rain - drying) * minutes / capacity).clamp(0., 1.);
    wet
}
pub fn plot_water(v: &mut Village, n: i32, x: i32, y: i32, minutes: f32, profile: RootZone) -> f32 {
    if !crate::sandbox::land(v) {
        return minutes;
    }
    let mut wet = 0.;
    let mut count = 0;
    let weather = crate::climate::at(v, v.minutes);
    for (a, b) in cells(n, x, y) {
        wet += step_cell(v, a, b, minutes, profile, weather);
        count += 1;
    }
    if count == 0 { 0. } else { wet / count as f32 }
}
pub fn advance_fallow(v: &mut Village, minutes: f32) {
    if !crate::sandbox::land(v) {
        return;
    }
    let weather = crate::climate::at(v, v.minutes);
    let mut tended = [false; (MAP_SIZE * MAP_SIZE) as usize];
    let mut covered = [false; (MAP_SIZE * MAP_SIZE) as usize];
    for b in &v.buildings {
        if b.progress < 100. {
            continue;
        }
        for (x, y) in cells(interactions::footprint_size(&b.kind), b.x, b.y) {
            let i = (y * MAP_SIZE + x) as usize;
            tended[i] = ecology::farm(b) || b.kind == "orchard";
            covered[i] = !matches!(
                b.kind.as_str(),
                "garden" | "grove" | "orchard" | "banana_treatment" | "compost"
            );
        }
    }
    for s in &v.economy.sources {
        if s.active && s.material < 2 {
            for (x, y) in cells(resource_sites::size(s.material), s.x, s.y) {
                tended[(y * MAP_SIZE + x) as usize] = true;
            }
        }
    }
    for y in 0..MAP_SIZE {
        for x in 0..MAP_SIZE {
            let i = (y * MAP_SIZE + x) as usize;
            if !tended[i] && !river_bank(x, y) {
                step_cell(
                    v,
                    x,
                    y,
                    minutes,
                    RootZone {
                        capacity: 240.,
                        drying: 1.,
                        covered: covered[i],
                    },
                    weather,
                );
            }
        }
    }
    sync_moisture(v);
}
pub fn moisture_valid(v: &Village) -> bool {
    v.land.water.len() == (MAP_SIZE * MAP_SIZE) as usize
        && v.land.water.iter().enumerate().all(|(i, n)| {
            n.is_finite()
                && (0.0..=1.).contains(n)
                && (*n == 0. || {
                    let x = i as i32 % MAP_SIZE;
                    let y = i as i32 / MAP_SIZE;
                    (0..MAP_SIZE).contains(&x) && (0..MAP_SIZE).contains(&y) && !river_bank(x, y)
                })
        })
        && v.buildings
            .iter()
            .filter(|b| ecology::farm(b) && b.progress >= 100.)
            .all(|b| {
                (b.crop.moisture
                    - if b.crop.planted {
                        wetness(v, interactions::footprint_size(&b.kind), b.x, b.y)
                            * ecology::moisture_capacity(b)
                    } else {
                        0.
                    })
                .abs()
                    < 0.001
            })
        && v.economy
            .sources
            .iter()
            .filter(|s| s.active && s.material < 2)
            .all(|s| {
                (s.moisture
                    - if s.planted {
                        wetness(v, resource_sites::size(s.material), s.x, s.y) * 1440.
                    } else {
                        0.
                    })
                .abs()
                    < 0.001
            })
}
pub fn condition(v: &Village, n: i32, x: i32, y: i32) -> Ground {
    if !crate::sandbox::land(v) {
        return Ground {
            fertility: 0.72,
            retention: 1.,
            cover: 0.35,
            nutrients: 1.,
            disturbance: 0.,
            moisture: 1.,
            shade: 0.,
        };
    }
    let mut out = Ground {
        fertility: 0.,
        retention: 0.,
        cover: 0.,
        nutrients: 0.,
        disturbance: 0.,
        moisture: 0.,
        shade: 0.,
    };
    let mut count = 0.;
    for (a, b) in cells(n, x, y) {
        let g = ground(v, a, b);
        count += 1.;
        out.fertility += g.fertility;
        out.retention += g.retention;
        out.cover += g.cover;
        out.nutrients += g.nutrients;
        out.disturbance += g.disturbance;
        out.moisture += g.moisture;
        out.shade += g.shade;
    }
    if count > 0. {
        out.fertility /= count;
        out.retention /= count;
        out.cover /= count;
        out.nutrients /= count;
        out.disturbance /= count;
        out.moisture /= count;
        out.shade /= count;
    }
    out
}
pub fn growth(g: &Ground) -> f32 {
    let soil = if g.fertility < 0.6 {
        0.55 + 0.75 * g.fertility
    } else if g.fertility > 0.82 {
        1. + (g.fertility - 0.82) * 1.2
    } else {
        1.
    };
    soil * (1. - (g.shade - 0.4).max(0.) * 0.8)
}
pub fn yield_factor(g: &Ground) -> f32 {
    growth(g).clamp(0.55, 1.25)
}
pub fn solar_exposure(v: &Village, n: i32, x: i32, y: i32) -> f32 {
    1. - condition(v, n, x, y).shade * 0.8
}
pub fn shade(v: &Village, x: i32, y: i32) -> f32 {
    let mut exposure = vegetation::light(v, x, y);
    for b in &v.buildings {
        let standing = b.progress >= 100.
            || crate::building_work::job(v, b.id).is_some_and(|j| {
                j.original_progress >= 100. && j.stage != crate::building_work::Stage::Rebuild
            });
        if standing && matches!(b.kind.as_str(), "grove" | "orchard" | "banana_treatment") {
            let (radius, strength) = if b.kind == "grove" || b.kind == "orchard" {
                (3.5, 0.75)
            } else {
                (2.5, 0.5)
            };
            let distance = (x as f32 - b.x as f32 - 1.).hypot(y as f32 - b.y as f32 - 1.);
            exposure *= 1. - strength * (1. - distance / radius).max(0.);
        }
    }
    for s in &v.economy.sources {
        if !s.active || s.material >= 2 || !s.planted {
            continue;
        }
        let canopy = if s.growth >= 1. {
            s.remaining / s.maximum
        } else {
            s.growth
        };
        let distance = (x as f32 - s.x as f32 - 1.).hypot(y as f32 - s.y as f32 - 1.);
        exposure *= 1.
            - canopy
                * (if s.material == 0 { 0.7 } else { 0.45 })
                * (1. - distance / (if s.material == 0 { 3.5 } else { 2.5 })).max(0.);
    }
    (1. - exposure).clamp(0., 0.85)
}
pub fn harvest_soil(v: &mut Village, n: i32, x: i32, y: i32, compost: bool) {
    if !crate::sandbox::land(v) {
        return;
    }
    for (a, b) in cells(n, x, y) {
        if !v.land.soil.iter().any(|s| s.x == a && s.y == b) {
            let g = ground(v, a, b);
            v.land.soil.push(Soil {
                x: a,
                y: b,
                nutrients: g.nutrients,
                disturbance: g.disturbance,
                cover: g.cover,
            });
        }
        let s = v
            .land
            .soil
            .iter_mut()
            .find(|s| s.x == a && s.y == b)
            .unwrap();
        s.nutrients = (s.nutrients - 0.005 + if compost { 0.1 } else { 0. }).clamp(0.2, 1.25);
        if compost {
            s.disturbance = (s.disturbance - 0.02).max(0.);
            s.cover = (s.cover + 0.03).min(1.);
        }
    }
    v.land.soil.sort_by_key(|s| (s.y, s.x));
    v.land.revision = v.land.revision.saturating_add(1);
}
