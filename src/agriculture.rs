//! Perennial fruit and small livestock, with local inputs and attended collection.
use crate::*;
use economy::{FODDER, HONEY, MILK, SCRAPS};
use logistics::Owner;

#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Plot {
    pub enabled: bool,
    pub growth: f32,
    pub cared_until: f32,
    pub welfare: f32,
    pub pending: u32,
    pub harvested: u32,
    pub rotations: u32,
    pub previous_crop: String,
    pub fruiting: bool,
}
impl Default for Plot {
    fn default() -> Self {
        Self {
            enabled: true,
            growth: 0.,
            cared_until: 0.,
            welfare: 70.,
            pending: 0,
            harvested: 0,
            rotations: 0,
            previous_crop: String::new(),
            fruiting: false,
        }
    }
}
pub fn kind(b: &Building) -> bool {
    matches!(b.kind.as_str(), "orchard" | "goat_pasture" | "apiary")
}
fn open(v: &Village, b: &Building) -> bool {
    b.progress >= 100. && b.agriculture.enabled && building_work::job(v, b.id).is_none()
}
pub fn flowers(v: &Village, b: &Building) -> usize {
    v.buildings
        .iter()
        .filter(|p| {
            p.id != b.id
                && p.progress >= 100.
                && building_work::job(v, p.id).is_none()
                && (p.x - b.x).abs().max((p.y - b.y).abs()) <= 6
                && (matches!(p.kind.as_str(), "orchard" | "grove")
                    || p.kind == "garden"
                        && p.crop.planted
                        && matches!(p.crop.kind.as_str(), "beans" | "tomatoes"))
        })
        .count()
}
pub fn pollinated(v: &Village, b: &Building) -> bool {
    v.buildings.iter().any(|h| {
        h.kind == "apiary"
            && open(v, h)
            && h.agriculture.cared_until > v.minutes
            && flowers(v, h) > 0
            && (h.x - b.x).abs().max((h.y - b.y).abs()) <= 6
    })
}
pub fn wanted(v: &Village, id: usize) -> bool {
    let Some(b) = v.buildings.iter().find(|b| b.id == id) else {
        return false;
    };
    if b.crop.kind == "fodder" || (!b.crop.planted && b.crop.next_kind == "fodder") {
        return economy::quantity(v, FODDER) < 24;
    }
    if !kind(b) {
        return supplies::needs_ingredients(v);
    }
    if !open(v, b) {
        return false;
    }
    match b.kind.as_str() {
        "goat_pasture" => economy::quantity(v, MILK) < 8 || b.agriculture.cared_until <= v.minutes,
        "apiary" => economy::quantity(v, HONEY) < 8 || b.agriculture.cared_until <= v.minutes,
        _ => supplies::needs_ingredients(v) || !b.agriculture.fruiting,
    }
}
pub fn needs(v: &Village, owner: Owner, items: &mut economy::Bundle) {
    if let Owner::Pantry(id) = owner
        && let Some(b) = v
            .buildings
            .iter()
            .find(|b| b.id == id && b.kind == "goat_pasture" && open(v, b))
        && b.agriculture.cared_until <= v.minutes
    {
        items[FODDER] = 2;
    }
}
pub fn ready(v: &Village, b: &Building) -> bool {
    if !open(v, b) || !wanted(v, b.id) {
        return false;
    }
    let p = &b.agriculture;
    let owner = Owner::Pantry(b.id);
    if b.kind == "goat_pasture" && p.cared_until <= v.minutes {
        return organics::available(v, owner, FODDER) >= 2
            && water::available(v, water::Owner::Building(b.id), water::Class::Fresh) >= 2.;
    }
    if b.kind == "apiary" && p.cared_until <= v.minutes {
        return true;
    }
    if p.pending > 0 {
        let below_target = match b.kind.as_str() {
            "goat_pasture" => economy::quantity(v, MILK) < 8,
            "apiary" => economy::quantity(v, HONEY) < 8,
            _ => supplies::needs_ingredients(v),
        };
        return below_target
            && logistics::room(v, owner) >= p.pending + u32::from(b.kind == "goat_pasture")
            && economy::capacity(v).saturating_sub(economy::storage(v))
                >= p.pending + u32::from(b.kind == "goat_pasture");
    }
    match b.kind.as_str() {
        "orchard" => {
            water::irrigation(v, water::Owner::Building(b.id)) >= 2.
                && land::condition(v, 3, b.x, b.y).moisture <= 0.375
        }
        "goat_pasture" => {
            p.cared_until <= v.minutes
                && organics::available(v, owner, FODDER) >= 2
                && water::available(v, water::Owner::Building(b.id), water::Class::Fresh) >= 2.
        }
        "apiary" => p.cared_until <= v.minutes,
        _ => false,
    }
}
pub fn tend(v: &mut Village, id: usize) -> bool {
    let Some(index) = v.buildings.iter().position(|b| b.id == id && ready(v, b)) else {
        return false;
    };
    let b = v.buildings[index].clone();
    let owner = Owner::Pantry(id);
    if b.agriculture.pending > 0 && (b.kind == "orchard" || b.agriculture.cared_until > v.minutes) {
        let material = match b.kind.as_str() {
            "goat_pasture" => MILK,
            "apiary" => HONEY,
            _ => economy::FOOD,
        };
        let n = b.agriculture.pending;
        if !logistics::receive(v, owner, material, n) {
            return false;
        }
        if b.kind == "goat_pasture" {
            assert!(logistics::receive(v, owner, SCRAPS, 1));
        }
        match material {
            MILK => v.progress.milk_collected = v.progress.milk_collected.saturating_add(n),
            HONEY => v.progress.honey_collected = v.progress.honey_collected.saturating_add(n),
            _ => v.progress.orchard_fruit = v.progress.orchard_fruit.saturating_add(n),
        }
        let p = &mut v.buildings[index].agriculture;
        p.pending = 0;
        p.harvested = p.harvested.saturating_add(n);
        if material == economy::FOOD {
            v.supplies.gathered += n as f32;
            v.progress.fruit = v.progress.fruit.saturating_add(n);
        }
        return true;
    }
    match b.kind.as_str() {
        "goat_pasture" => {
            if water::draw(v, water::Owner::Building(id), water::Class::Fresh, 2.) < 2. {
                return false;
            }
            logistics::spend(v, Some(owner), FODDER, 2);
            let p = &mut v.buildings[index].agriculture;
            p.cared_until = v.minutes + 1440.;
            p.welfare = (p.welfare + 25.).min(100.);
        }
        "apiary" => {
            v.buildings[index].agriculture.cared_until = v.minutes + 2880.;
        }
        "orchard" => {
            if water::irrigate(v, water::Owner::Building(id)) {
                land::water_plot(v, 3, b.x, b.y, 1.);
            }
        }
        _ => return false,
    }
    true
}
pub fn advance(v: &mut Village, minutes: f32) {
    let start = v.minutes - minutes;
    let daylight =
        |t: f32| (t / 1440.).floor() * 720. + (t.rem_euclid(1440.) - 360.).clamp(0., 720.);
    let sun = (daylight(v.minutes) - daylight(start)).max(0.);
    for index in 0..v.buildings.len() {
        let b = v.buildings[index].clone();
        if !kind(&b) || !open(v, &b) {
            continue;
        }
        let p = &b.agriculture;
        match b.kind.as_str() {
            "orchard" => {
                let soil = land::condition(v, 3, b.x, b.y);
                let wet = land::plot_water(
                    v,
                    3,
                    b.x,
                    b.y,
                    minutes,
                    land::RootZone {
                        capacity: 1440.,
                        drying: 0.5,
                        covered: false,
                    },
                );
                if p.pending > 0 {
                    continue;
                }
                let duration = if p.fruiting { 2880. } else { 8640. };
                let growth = (p.growth + wet * land::growth(&soil)).min(duration);
                let bonus = u32::from(pollinated(v, &b)) * 2;
                let p = &mut v.buildings[index].agriculture;
                p.growth = growth;
                if growth >= duration {
                    p.fruiting = true;
                    p.growth = 0.;
                    p.pending = 8 + bonus;
                }
            }
            "goat_pasture" => {
                let attended = (p.cared_until - start).clamp(0., minutes);
                let expired = minutes - attended;
                let can_produce = economy::quantity(v, MILK) < 8;
                let p = &mut v.buildings[index].agriculture;
                p.welfare = (p.welfare - expired * 0.015).max(0.);
                if p.pending == 0 && attended > 0. && can_produce {
                    p.growth = (p.growth + attended).min(1440.);
                    if p.growth >= 1439.9 {
                        p.growth = 0.;
                        p.pending = if p.welfare >= 40. { 4 } else { 2 };
                    }
                }
            }
            "apiary" => {
                if p.pending > 0
                    || p.cared_until <= start
                    || flowers(v, &b) == 0
                    || economy::quantity(v, HONEY) >= 8
                {
                    continue;
                }
                let p = &mut v.buildings[index].agriculture;
                p.growth = (p.growth + sun).min(720.);
                if p.growth >= 720. {
                    p.growth = 0.;
                    p.pending = 3;
                }
            }
            _ => {}
        }
    }
}
pub fn rotation(v: &mut Village, id: usize, crop: &str) {
    let Some(b) = v.buildings.iter_mut().find(|b| b.id == id) else {
        return;
    };
    let previous = b.agriculture.previous_crop.clone();
    b.agriculture.previous_crop = crop.into();
    let rotated =
        previous == "beans" && matches!(crop, "maize" | "cassava" | "lettuce" | "tomatoes");
    if rotated {
        b.agriculture.rotations = b.agriculture.rotations.saturating_add(1);
        v.progress.crop_rotations = v.progress.crop_rotations.saturating_add(1);
    }
    let (n, x, y) = (interactions::footprint_size(&b.kind), b.x, b.y);
    // Legume residues replenish nutrients; changing to a food crop improves cover too.
    if crop == "beans" || rotated {
        land::restore_soil(v, n, x, y, if rotated { 0.24 } else { 0.12 });
    }
}
pub fn valid(v: &Village, b: &Building) -> bool {
    let p = &b.agriculture;
    p.growth.is_finite()
        && (0.0..=8640.).contains(&p.growth)
        && p.cared_until.is_finite()
        && (0.0..=v.minutes + 2880.).contains(&p.cared_until)
        && p.welfare.is_finite()
        && (0.0..=100.).contains(&p.welfare)
        && p.pending <= 10
        && (p.previous_crop.is_empty() || ecology::crop_kind(&p.previous_crop))
        && (kind(b) || (p.pending == 0 && p.growth == 0. && p.cared_until == 0. && !p.fruiting))
}
#[wasm_bindgen]
impl Game {
    pub fn configure_agriculture(&mut self, id: usize, enabled: bool) -> bool {
        let mut v = self.app.world_mut().resource_mut::<Village>();
        let Some(b) = v.buildings.iter_mut().find(|b| b.id == id && kind(b)) else {
            return false;
        };
        b.agriculture.enabled = enabled;
        true
    }
    pub fn agriculture_report(&self) -> String {
        let v = self.app.world().resource::<Village>();
        let plots:Vec<_>=v.buildings.iter().filter(|b|kind(b)).map(|b|{
            let p=&b.agriculture;
            let status=if building_work::job(v,b.id).is_some(){"Closed for crew work"}
                else if b.progress<100.{"Under construction"}else if !p.enabled{"Care paused"}
                else if p.pending>0 {if ready(v,b){"Ready for a resident to collect"}else if b.kind=="goat_pasture" && economy::quantity(v,MILK)>=8 || b.kind=="apiary" && economy::quantity(v,HONEY)>=8 || b.kind=="orchard" && !supplies::needs_ingredients(v){"Enough produce stored; collection waits"}else{"Waiting for care, supplies or storage space"}}
                else if b.kind=="orchard" {if land::condition(v,3,b.x,b.y).moisture<=0.{"Growth paused: dry roots"}else if p.fruiting{"Fruit is growing"}else{"Fruit trees are establishing"}}
                else if p.cared_until<=v.minutes {if b.kind=="apiary"{"Needs a resident to inspect the hive"}else if organics::available(v,Owner::Pantry(b.id),FODDER)<2{"Waiting for two delivered fodder"}else if water::available(v,water::Owner::Building(b.id),water::Class::Fresh)<2.{"Waiting for two fresh drinking water"}else{"Needs a resident to feed and check the goats"}}
                else if b.kind=="apiary" && flowers(v,b)==0{"No flowering garden, grove or orchard within six tiles"}
                else if b.kind=="apiary" && economy::quantity(v,HONEY)>=8{"Enough honey stored"}
                else if b.kind=="goat_pasture" && economy::quantity(v,MILK)>=8{"Enough milk stored; care continues"}
                else{"Growing the next batch"};
            serde_json::json!({"building":b.id,"status":status,"ready":ready(v,b),"flowers":flowers(v,b),"pollinated":pollinated(v,b),"fodder_here":organics::available(v,Owner::Pantry(b.id),FODDER),"fresh_water_here":water::available(v,water::Owner::Building(b.id),water::Class::Fresh),"duration":if b.kind=="orchard"{if p.fruiting{2880.}else{8640.}}else if b.kind=="apiary"{720.}else{1440.}})
        }).collect();
        serde_json::json!({"plots":plots,"fodder":economy::quantity(v,FODDER),"milk":economy::quantity(v,MILK),"honey":economy::quantity(v,HONEY)}).to_string()
    }
}
