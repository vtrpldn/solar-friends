//! Water storage and the crop cycle, measured in game minutes.
use super::*;

#[derive(Clone, Default, Serialize, Deserialize)]
pub struct Crop {
    pub planted: bool,
    pub growth: f32,
    pub moisture: f32,
}

pub fn raining(minutes: f32) -> bool {
    let day = (minutes / 1440.) as u32;
    let hour = minutes % 1440.;
    day % 3 != 2 && (840.0..1020.).contains(&hour)
}

pub fn capacity(v: &Village) -> f32 {
    // Arrival barrels remain useful before the first cistern is built.
    40. + 75.
        * v.buildings
            .iter()
            .filter(|b| b.kind == "well" && b.progress >= 100.)
            .count() as f32
}

pub fn needs_tending(b: &Building, water: f32) -> bool {
    b.kind == "garden"
        && b.progress >= 100.
        && (!b.crop.planted || b.crop.growth >= 180. || (b.crop.moisture <= 90. && water >= 2.))
}

pub fn advance(v: &mut Village, minutes: f32) {
    let rain = raining(v.minutes);
    if rain {
        let cisterns = v
            .buildings
            .iter()
            .filter(|b| b.kind == "well" && b.progress >= 100.)
            .count();
        if v.water < capacity(v) {
            v.water = (v.water + minutes * cisterns as f32 * 0.3).min(capacity(v));
        }
    }
    for b in &mut v.buildings {
        if b.kind != "garden" || b.progress < 100. || !b.crop.planted {
            continue;
        }
        if rain {
            b.crop.moisture = (b.crop.moisture + minutes * 3.).min(240.);
        }
        let wet_minutes = minutes.min(b.crop.moisture);
        b.crop.growth = (b.crop.growth + wet_minutes).min(180.);
        b.crop.moisture = (b.crop.moisture - minutes).max(0.);
    }
}

pub fn tend(v: &mut Village, r: &Resident) {
    let Some(index) = v.buildings.iter().position(|b| {
        needs_tending(b, v.water)
            && (b.x as f32 + 0.75 - r.target_x).abs() < 0.2
            && (b.y as f32 + 0.75 - r.target_y).abs() < 0.2
    }) else {
        return;
    };
    let crop = &mut v.buildings[index].crop;
    if !crop.planted {
        crop.planted = true;
        crop.growth = 0.;
    } else if crop.growth >= 180. {
        *crop = Crop::default();
        v.food += if r.favorite == "garden" { 8. } else { 5. };
        if v.progress.compost > 0 {
            v.progress.compost -= 1;
            v.food += 3.;
            v.progress.enriched_harvests += 1;
        }
        if progression::use_tool(v) {
            v.food += 2.;
        }
        v.harvests += 1;
    } else if v.water >= 2. {
        v.water -= 2.;
        crop.moisture = 240.;
    }
}
