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
    matches!(
        kind,
        "lettuce" | "beans" | "tomatoes" | "maize" | "cassava" | "fodder"
    )
}
pub fn farm(b: &Building) -> bool {
    matches!(b.kind.as_str(), "garden" | "greenhouse")
}
pub fn duration(c: &Crop) -> f32 {
    match c.kind.as_str() {
        "beans" => 360.,
        "maize" => 720.,
        "cassava" => 1440.,
        "fodder" => 480.,
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
        && (0.0..=480.).contains(&c.nursery)
        && (c.planted || (c.growth == 0. && c.moisture == 0. && c.harvests == 0))
}

pub fn raining(minutes: f32) -> bool {
    let day = (minutes / 1440.) as u32;
    let hour = minutes % 1440.;
    day % 3 != 2 && (840.0..1020.).contains(&hour)
}

pub fn capacity(v: &Village) -> f32 {
    water::capacity(v)
}

pub fn needs_tending(v: &Village, b: &Building, water: f32) -> bool {
    if agriculture::kind(b) {
        return agriculture::ready(v, b);
    }
    farm(b)
        && building_work::job(v, b.id).is_none()
        && b.progress >= 100.
        && ((!b.crop.planted && b.crop.replant)
            || (b.crop.planted
                && (b.crop.growth >= duration(&b.crop)
                    || (sandbox::land(v) && b.crop.moisture <= 90. && water >= 2.))))
}

pub fn advance(v: &mut Village, minutes: f32) {
    water::rain(v, minutes);
    agriculture::advance(v, minutes);
    for i in 0..v.buildings.len() {
        let b = &v.buildings[i];
        if !farm(b) || b.progress < 100. {
            continue;
        }
        let (n, x, y, cap, covered, drying, planted) = (
            interactions::footprint_size(&b.kind),
            b.x,
            b.y,
            moisture_capacity(b),
            b.kind == "greenhouse",
            if matches!(b.crop.kind.as_str(), "beans" | "cassava" | "fodder") {
                0.5
            } else {
                1.
            },
            b.crop.planted,
        );
        let condition = land::condition(v, n, x, y);
        let wet_minutes = land::plot_water(
            v,
            n,
            x,
            y,
            minutes,
            land::RootZone {
                capacity: cap,
                drying,
                covered,
            },
        );
        if !planted {
            continue;
        }
        let b = &mut v.buildings[i];
        b.crop.growth =
            (b.crop.growth + wet_minutes * land::growth(&condition)).min(duration(&b.crop));
        if covered {
            planting::raise(v, i, wet_minutes * land::growth(&condition));
        }
    }
    land::sync_moisture(v);
}

fn harvest_base(v: &Village, b: &Building) -> u32 {
    let crop = &b.crop;
    let base = match crop.kind.as_str() {
        "beans" => 10.,
        "maize" => 14.,
        "cassava" => 20.,
        "fodder" => 10.,
        "tomatoes"
            if crop.harvests > 0
                && organics::available(v, logistics::Owner::Site(b.id), economy::COMPOST) == 0 =>
        {
            4.
        }
        "tomatoes" => 6.,
        _ => 5.,
    };
    let g = land::condition(v, interactions::footprint_size(&b.kind), b.x, b.y);
    (base
        * land::yield_factor(&g)
        * if agriculture::pollinated(v, b) && matches!(crop.kind.as_str(), "beans" | "tomatoes") {
            1.15
        } else {
            1.
        })
    .round()
    .max(1.) as u32
        + if organics::available(v, logistics::Owner::Site(b.id), economy::COMPOST) > 0 {
            3
        } else {
            0
        }
        + if v.progress.use_tools && logistics::site_tools(v, b.id) > 0 {
            2
        } else {
            0
        }
}
fn harvest_yield(v: &Village, r: &Resident, index: usize) -> u32 {
    harvest_base(v, &v.buildings[index]) + if r.favorite == "garden" { 3 } else { 0 }
}
pub fn harvest_blocker(v: &Village, b: &Building, r: &Resident) -> Option<&'static str> {
    if !farm(b) || !b.crop.planted || b.crop.growth < duration(&b.crop) {
        return None;
    }
    let output = harvest_base(v, b) + if r.favorite == "garden" { 3 } else { 0 };
    (economy::capacity(v).saturating_sub(economy::storage(v)) < output
        || logistics::room(v, logistics::Owner::Site(b.id)) < output)
        .then_some("The harvest needs room at this plot and in village storage before it can be collected.")
}
#[wasm_bindgen]
impl Game {
    pub fn crop_outlook(&self, id: usize) -> String {
        let v = self.app.world().resource::<Village>();
        let Some(b) = v.buildings.iter().find(|b| b.id == id && farm(b)) else {
            return "{}".into();
        };
        let mut next = b.clone();
        if !next.crop.planted {
            next.crop.kind = next.crop.next_kind.clone();
            next.crop.harvests = 0;
        }
        let soil = land::condition(v, interactions::footprint_size(&b.kind), b.x, b.y);
        let minimum = harvest_base(v, &next);
        serde_json::json!({"crop":next.crop.kind,"harvest_min":minimum,"harvest_max":minimum+3,"soil":soil,"growth_multiplier":land::growth(&soil),"nursery_minutes":480./land::growth(&soil),"seedlings_here":organics::available(v,logistics::Owner::Site(b.id),economy::SEEDLINGS),"rotations":b.agriculture.rotations,"previous_crop":b.agriculture.previous_crop,"pollinated":agriculture::pollinated(v,b),"product":if next.crop.kind=="fodder"{"fodder"}else{"food"}}).to_string()
    }
}
pub fn tend(v: &mut Village, r: &Resident) {
    let building = spacing::building(r, v);
    if let Some(id) = building.filter(|id| {
        v.buildings
            .iter()
            .any(|b| b.id == *id && agriculture::kind(b))
    }) {
        if agriculture::tend(v, id) {
            skills::award(v, r.id, skills::Skill::Farming, 2);
        }
        return;
    }
    let Some(index) = v.buildings.iter().position(|b| {
        needs_tending(v, b, water::irrigation(v, water::Owner::Building(b.id)))
            && Some(b.id) == building
    }) else {
        return;
    };
    let b = &v.buildings[index];
    let (site_id, n, x, y, outdoor) = (
        b.id,
        interactions::footprint_size(&b.kind),
        b.x,
        b.y,
        b.kind == "garden",
    );
    let harvesting = b.crop.planted && b.crop.growth >= duration(&b.crop);
    let output = if harvesting {
        harvest_yield(v, r, index)
    } else {
        0
    };
    if harvesting
        && (economy::capacity(v).saturating_sub(economy::storage(v)) < output
            || logistics::room(v, logistics::Owner::Site(site_id)) < output)
    {
        return;
    }
    let seedling = outdoor
        && !v.buildings[index].crop.planted
        && organics::available(v, logistics::Owner::Site(site_id), economy::SEEDLINGS) > 0;
    if seedling {
        logistics::spend(
            v,
            Some(logistics::Owner::Site(site_id)),
            economy::SEEDLINGS,
            1,
        );
        v.progress.seedlings_used = v.progress.seedlings_used.saturating_add(1);
    }
    let mut learned = false;
    let crop = &mut v.buildings[index].crop;
    if !crop.planted {
        learned = true;
        crop.planted = true;
        crop.kind = crop.next_kind.clone();
        crop.harvests = 0;
        crop.growth = if seedling { duration(crop) * 0.25 } else { 0. };
    } else if harvesting {
        if crop.kind == "tomatoes" && crop.harvests < 2 {
            crop.harvests += 1;
            crop.growth = 0.;
        } else {
            crop.planted = false;
            crop.growth = 0.;
            crop.moisture = 0.;
            crop.harvests = 0;
        }
        let harvested_kind = v.buildings[index].crop.kind.clone();
        let compost = organics::available(v, logistics::Owner::Site(site_id), economy::COMPOST) > 0;
        if compost {
            logistics::spend(
                v,
                Some(logistics::Owner::Site(site_id)),
                economy::COMPOST,
                1,
            );
            v.progress.enriched_harvests += 1;
        }
        progression::use_tool(v, site_id);
        land::harvest_soil(v, n, x, y, compost);
        agriculture::rotation(v, site_id, &harvested_kind);
        if harvested_kind == "fodder" {
            assert!(logistics::receive(
                v,
                logistics::Owner::Site(site_id),
                economy::FODDER,
                output
            ));
        } else {
            food::gather(v, Some(site_id), r.x, r.y, output);
            v.supplies.gathered += output as f32;
        }
        v.harvests += 1;
        learned = true;
    } else if water::irrigate(v, water::Owner::Building(site_id)) {
        land::water_plot(v, n, x, y, 1.);
        learned = true;
    }
    if learned {
        skills::award(
            v,
            r.id,
            skills::Skill::Farming,
            if harvesting { 3 } else { 1 },
        );
    }
    land::sync_moisture(v);
}

#[cfg(test)]
mod farming_tests {
    use super::*;
    fn setup(kind: &str) -> (Game, Resident) {
        let mut g = Game::new();
        g.app
            .world_mut()
            .resource_mut::<Village>()
            .progress
            .completed = [true; 4];
        g.app
            .world_mut()
            .resource_mut::<Village>()
            .progress
            .later_completed = [true; crate::progression::LATER_CHAPTERS];
        assert_eq!(g.place(kind, 5, 5), "ok");
        crate::logistics::fixture_finish(&mut g.app.world_mut().resource_mut::<Village>(), 0);
        crate::water::fixture_at(
            &mut g.app.world_mut().resource_mut::<Village>(),
            crate::water::Owner::Building(0),
            crate::water::Class::Fresh,
            4.,
        );
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
        crate::logistics::fixture_finish(&mut v, 1);
        crate::organics::fixture_transfer(&mut v, logistics::Owner::Site(1), economy::SEEDLINGS, 1);
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
            let shade = land::condition(&v, 2, 5, 5).shade;
            assert!((v.buildings[0].crop.moisture - (90. + 52.5 * shade)).abs() < 0.001);
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
