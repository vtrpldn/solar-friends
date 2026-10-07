//! Water storage and the crop cycle, measured in game minutes.
use super::*;

#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Crop {
    pub planted: bool,
    pub growth: f32,
    pub moisture: f32,
    pub kind: String,
    pub next_kind: String,
    pub replant: bool,
    pub harvests: u8,
    pub nursery: f32,
}
impl Default for Crop {
    fn default() -> Self {
        Self {
            planted: false,
            growth: 0.,
            moisture: 0.,
            kind: "lettuce".into(),
            next_kind: "lettuce".into(),
            replant: true,
            harvests: 0,
            nursery: 0.,
        }
    }
}
pub fn crop_kind(kind: &str) -> bool {
    matches!(kind, "lettuce" | "beans" | "tomatoes")
}
pub fn farm(b: &Building) -> bool {
    matches!(b.kind.as_str(), "garden" | "greenhouse")
}
pub fn duration(c: &Crop) -> f32 {
    match c.kind.as_str() {
        "beans" => 360.,
        "tomatoes" if c.harvests == 0 => 300.,
        "tomatoes" => 180.,
        _ => 180.,
    }
}
pub fn moisture_capacity(b: &Building) -> f32 {
    if b.kind == "greenhouse" { 480. } else { 240. }
}
pub fn valid(b: &Building) -> bool {
    let c = &b.crop;
    crop_kind(&c.kind)
        && crop_kind(&c.next_kind)
        && c.harvests <= 2
        && c.growth.is_finite()
        && (0.0..=duration(c)).contains(&c.growth)
        && c.moisture.is_finite()
        && (0.0..=moisture_capacity(b)).contains(&c.moisture)
        && c.nursery.is_finite()
        && (0.0..480.).contains(&c.nursery)
        && (c.planted || (c.growth == 0. && c.moisture == 0. && c.harvests == 0))
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
    farm(b)
        && b.progress >= 100.
        && ((!b.crop.planted && b.crop.replant)
            || (b.crop.planted
                && (b.crop.growth >= duration(&b.crop) || (b.crop.moisture <= 90. && water >= 2.))))
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
        if !farm(b) || b.progress < 100. || !b.crop.planted {
            continue;
        }
        if rain && b.kind != "greenhouse" {
            b.crop.moisture = (b.crop.moisture + minutes * 3.).min(240.);
        }
        let drying = if b.crop.kind == "beans" { 0.5 } else { 1. };
        let wet_minutes = minutes.min(b.crop.moisture / drying);
        b.crop.growth = (b.crop.growth + wet_minutes).min(duration(&b.crop));
        b.crop.moisture = (b.crop.moisture - minutes * drying).max(0.);
        if b.kind == "greenhouse" && v.seedlings < 12 {
            let progress = b.crop.nursery + wet_minutes;
            v.seedlings += ((progress / 480.).floor() as u32).min(12 - v.seedlings);
            b.crop.nursery = progress % 480.;
        }
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
    let capacity = moisture_capacity(&v.buildings[index]);
    let outdoor = v.buildings[index].kind == "garden";
    let crop = &mut v.buildings[index].crop;
    if !crop.planted {
        crop.planted = true;
        crop.kind = crop.next_kind.clone();
        crop.harvests = 0;
        crop.growth = if outdoor && v.seedlings > 0 {
            v.seedlings -= 1;
            duration(crop) * 0.25
        } else {
            0.
        };
    } else if crop.growth >= duration(crop) {
        let mut yield_food = match crop.kind.as_str() {
            "beans" => 10.,
            "tomatoes" => 6.,
            _ => 5.,
        };
        if crop.kind == "tomatoes" && crop.harvests > 0 && v.progress.compost == 0 {
            yield_food -= 2.;
        }
        if crop.kind == "tomatoes" && crop.harvests < 2 {
            crop.harvests += 1;
            crop.growth = 0.;
        } else {
            crop.planted = false;
            crop.growth = 0.;
            crop.moisture = 0.;
            crop.harvests = 0;
        }
        let before = v.food;
        v.food += yield_food + if r.favorite == "garden" { 3. } else { 0. };
        if v.progress.compost > 0 {
            v.progress.compost -= 1;
            v.food += 3.;
            v.progress.enriched_harvests += 1;
        }
        if progression::use_tool(v) {
            v.food += 2.;
        }
        v.supplies.gathered += v.food - before;
        v.harvests += 1;
    } else if v.water >= 2. {
        v.water -= 2.;
        crop.moisture = capacity;
    }
}

#[cfg(test)]
mod farming_tests {
    use super::*;
    fn setup(kind: &str) -> (Game, Resident) {
        let mut g = Game::new();
        assert_eq!(g.place(kind, 5, 5), "ok");
        g.app.world_mut().resource_mut::<Village>().buildings[0].progress = 100.;
        let mut q = g.app.world_mut().query::<&Resident>();
        let mut r = q
            .iter(g.app.world())
            .find(|r| r.favorite != "garden")
            .unwrap()
            .clone();
        r.target_x = 5.75;
        r.target_y = 5.75;
        (g, r)
    }
    #[test]
    fn tomato_cycle_finishes_three_harvests_before_switching_and_respects_pause() {
        let (mut g, r) = setup("garden");
        assert!(g.configure_crop(0, "tomatoes", true));
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            tend(&mut v, &r);
        }
        assert!(g.configure_crop(0, "beans", false));
        let mut v = g.app.world_mut().resource_mut::<Village>();
        let initial = v.food;
        for round in 0..3 {
            assert_eq!(v.buildings[0].crop.kind, "tomatoes");
            v.buildings[0].crop.growth = duration(&v.buildings[0].crop);
            tend(&mut v, &r);
            assert_eq!(v.buildings[0].crop.planted, round < 2);
        }
        assert_eq!(v.food - initial, 14.);
        tend(&mut v, &r);
        assert!(!v.buildings[0].crop.planted);
        drop(v);
        assert!(g.configure_crop(0, "beans", true));
        let mut v = g.app.world_mut().resource_mut::<Village>();
        tend(&mut v, &r);
        assert_eq!(v.buildings[0].crop.kind, "beans");
    }
    #[test]
    fn greenhouse_excludes_rain_and_nursery_accelerates_outdoor_planting() {
        let (mut g, r) = setup("greenhouse");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.minutes = 900.;
            tend(&mut v, &r);
            advance(&mut v, 10.);
            assert_eq!(v.buildings[0].crop.moisture, 0.);
            assert_eq!(v.buildings[0].crop.growth, 0.);
            tend(&mut v, &r);
            assert_eq!(v.buildings[0].crop.moisture, 480.);
            advance(&mut v, 480.);
            assert_eq!(v.seedlings, 1);
        }
        assert_eq!(g.place("garden", 8, 5), "ok");
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.buildings[1].progress = 100.;
        let mut outdoor = r.clone();
        outdoor.target_x = 8.75;
        tend(&mut v, &outdoor);
        assert_eq!(v.buildings[1].crop.growth, 45.);
        assert_eq!(v.seedlings, 0);
    }
    #[test]
    fn beans_retain_moisture_and_new_crop_saves_round_trip() {
        let (mut g, r) = setup("garden");
        assert!(g.configure_crop(0, "beans", true));
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.minutes = 500.;
            tend(&mut v, &r);
            tend(&mut v, &r);
            advance(&mut v, 300.);
            assert_eq!(v.buildings[0].crop.growth, 300.);
            assert_eq!(v.buildings[0].crop.moisture, 90.);
        }
        let saved = g.snapshot();
        let mut other = Game::new();
        assert!(other.restore(&saved));
        assert_eq!(other.snapshot(), saved);
        let mut bad: serde_json::Value = serde_json::from_str(&saved).unwrap();
        bad["village"]["buildings"][0]["crop"]["kind"] = serde_json::json!("unknown");
        assert!(!other.restore(&bad.to_string()));
        assert!(!g.configure_crop(0, "unknown", true));
    }
}
