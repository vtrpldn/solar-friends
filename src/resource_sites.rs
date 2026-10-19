//! Player-established cultivation and finite extraction plots.
use crate::{
    CAMP, Game, MAP_SIZE, Resident, Village, ecology, economy, event, interactions, river_bank,
};
use wasm_bindgen::prelude::*;
pub const LAND: [f32; 3] = [140., 96., 24.];
pub fn default_land() -> [f32; 3] {
    LAND
}
pub fn maximum(material: usize) -> f32 {
    [32., 24., 140., 96., 24.][material]
}
pub fn size(material: usize) -> i32 {
    if material == 0 { 3 } else { 2 }
}
pub fn occupies(s: &economy::Source, x: i32, y: i32) -> bool {
    let n = size(s.material);
    s.active
        && (s.x - n / 2..s.x - n / 2 + n).contains(&x)
        && (s.y - n / 2..s.y - n / 2 + n).contains(&y)
}
fn cells(material: usize, x: i32, y: i32) -> Vec<(i32, i32)> {
    let n = size(material);
    (x - n / 2..x - n / 2 + n)
        .flat_map(|plot_x| (y - n / 2..y - n / 2 + n).map(move |plot_y| (plot_x, plot_y)))
        .collect()
}
pub fn conflicts(v: &Village, kind: &str, x: i32, y: i32) -> bool {
    let n = interactions::footprint_size(kind);
    (x - n / 2..x - n / 2 + n).any(|plot_x| {
        (y - n / 2..y - n / 2 + n).any(|plot_y| {
            v.economy
                .sources
                .iter()
                .any(|s| occupies(s, plot_x, plot_y))
        })
    })
}
pub fn location(v: &Village, material: usize, x: i32, y: i32) -> Result<(), &'static str> {
    if material >= 5 {
        return Err("Unknown material site.");
    }
    let plot = cells(material, x, y);
    if plot.iter().any(|&(plot_x, plot_y)| {
        !(1..MAP_SIZE - 1).contains(&plot_x)
            || !(1..MAP_SIZE - 1).contains(&plot_y)
            || river_bank(plot_x, plot_y)
    }) {
        return Err("Choose an inland clearing inside the village.");
    }
    if material == 3 && (x < 17 || y < 17) {
        return Err("Stone-bearing ground is in the southeast of the property.");
    }
    if plot.iter().any(|&(plot_x, plot_y)| {
        ((plot_x as f32 - CAMP.0).abs() < 1.5 && (plot_y as f32 - CAMP.1).abs() < 1.5)
            || crate::building_work::reserved(v, plot_x, plot_y, None)
            || v.roads.contains(&(plot_x, plot_y))
            || v.buildings
                .iter()
                .any(|b| interactions::occupies(b, plot_x, plot_y))
            || v.economy
                .sources
                .iter()
                .any(|s| occupies(s, plot_x, plot_y))
    }) {
        return Err("Keep buildings, paths, other plots and the arrival clearing free.");
    }
    Ok(())
}
pub fn water_available(v: &Village) -> bool {
    crate::sanitation::irrigation_water(v) >= 2.
}
fn water(v: &mut Village) {
    if v.circular.reclaimed >= 2. {
        v.circular.reclaimed -= 2.;
        v.progress.reclaimed_irrigation = true;
    } else {
        v.water -= 2.;
    }
}
fn replant_cost(material: usize) -> i64 {
    if material == 0 { 4000 } else { 0 }
}
pub fn care(v: &Village, index: usize) -> bool {
    let Some(s) = v.economy.sources.get(index) else {
        return false;
    };
    s.active
        && s.material < 2
        && water_available(v)
        && if s.planted {
            s.growth < 1. && s.moisture < 120.
        } else {
            (s.auto_replant || s.plant_requested) && v.economy.money >= replant_cost(s.material)
        }
}
pub fn reason(v: &Village, index: usize) -> &'static str {
    if care(v, index) {
        if v.economy.sources[index].planted {
            "Watering our growing material crops."
        } else {
            if v.economy.sources[index].material == 0 {
                "Planting the next timber crop."
            } else {
                "Encouraging new bamboo shoots."
            }
        }
    } else {
        "Harvesting materials from our chosen plot."
    }
}
pub fn wanted(v: &Village, index: usize, needs: &economy::Bundle) -> bool {
    let s = &v.economy.sources[index];
    s.active
        && (care(v, index)
            || ((s.auto_harvest && needs[s.material] > 0 || s.harvest_requested)
                && s.remaining >= if s.material == 0 { 8. } else { 1. }
                && economy::capacity(v) - economy::storage(v)
                    >= if s.material == 0 { 8 } else { 1 }))
}
pub fn finish(v: &mut Village, index: usize) -> bool {
    if !care(v, index) {
        return false;
    }
    let material = v.economy.sources[index].material;
    if !v.economy.sources[index].planted {
        if material == 0 {
            economy::contribute(v, replant_cost(material), "Timber seedlings for replanting");
            v.progress.timber_replanted = true;
        }
        v.economy.sources[index].plant_requested = false;
        v.economy.sources[index].planted = true;
        v.economy.sources[index].growth = 0.;
        event(
            v,
            if material == 0 {
                "A new timber crop has been planted. It needs time and water to mature."
            } else {
                "Bamboo is growing again from its roots. It needs time and water to mature."
            },
        );
    }
    water(v);
    v.economy.sources[index].moisture = 1440.;
    true
}
pub fn harvested(v: &mut Village, index: usize, amount: u32) {
    let material = v.economy.sources[index].material;
    v.economy.sources[index].harvest_requested = false;
    v.economy.sources[index].harvests = v.economy.sources[index].harvests.saturating_add(1);
    if material >= 2 {
        v.economy.land[material - 2] -= amount as f32;
        for s in &mut v.economy.sources {
            if s.active && s.material == material {
                s.remaining = v.economy.land[material - 2];
            }
        }
    } else {
        let s = &mut v.economy.sources[index];
        s.remaining -= amount as f32;
        if s.remaining == 0. {
            s.growth = 0.;
            s.moisture = 0.;
            s.planted = material == 1 && s.auto_replant;
        }
    }
}
pub fn advance(v: &mut Village, minutes: f32) {
    let rain = ecology::raining(v.minutes);
    let mut matured = 0;
    for s in &mut v.economy.sources {
        if !s.active || s.material >= 2 || !s.planted || s.growth >= 1. {
            continue;
        }
        if rain {
            s.moisture = 1440.;
        }
        let wet = minutes.min(s.moisture);
        s.moisture = (s.moisture - minutes).max(0.);
        s.growth = (s.growth
            + wet / (if s.material == 0 { 5760. } else { 2880. })
                * if s.restored { 1.25 } else { 1. })
        .min(1.);
        if s.growth >= 1. {
            s.remaining = s.maximum;
            matured += 1;
        }
    }
    if matured > 0 {
        event(
            v,
            "A cultivated material plot is mature. Neighbours will harvest for projects, or you can request a batch.",
        );
    }
}
pub fn retire_legacy(v: &mut Village, residents: &mut [Resident]) {
    let legacy = [
        (0, 0, 2, 72.),
        (1, 0, 25, 96.),
        (2, 22, 0, 140.),
        (3, 22, 27, 64.),
        (4, 0, 20, 24.),
    ];
    if v.economy.sources.len() == 5
        && v.economy
            .sources
            .iter()
            .zip(legacy)
            .all(|(s, (m, x, y, max))| {
                !s.player_placed
                    && s.material == m
                    && s.x == x
                    && s.y == y
                    && s.maximum == max
                    && s.remaining.is_finite()
                    && s.remaining >= 0.
                    && s.remaining <= max
            })
    {
        for s in &v.economy.sources {
            if !s.player_placed && s.material >= 2 && s.material < 5 {
                v.economy.land[s.material - 2] = s.remaining.min(LAND[s.material - 2]);
            }
        }
        v.economy.sources.clear();
        for r in residents {
            if r.task == "source" {
                crate::walking::clear(r);
                r.task = "idle".into();
                r.reason = "Choose where our new material plots belong.".into();
                r.remaining = 0.;
                r.activity_material = None;
                r.requested = false;
                r.target_x = r.x;
                r.target_y = r.y;
            }
        }
    }
}
pub fn valid(v: &Village) -> bool {
    if v.economy
        .land
        .iter()
        .enumerate()
        .any(|(i, n)| !n.is_finite() || *n < 0. || *n > LAND[i] || n.fract() != 0.)
        || v.economy.sources.len() > 676
    {
        return false;
    }
    for (i, s) in v.economy.sources.iter().enumerate() {
        if !s.player_placed
            || s.material >= 5
            || s.maximum != maximum(s.material)
            || !s.remaining.is_finite()
            || s.remaining < 0.
            || s.remaining > s.maximum
            || s.remaining.fract() != 0.
            || !s.growth.is_finite()
            || !(0.0..=1.).contains(&s.growth)
            || !s.moisture.is_finite()
            || !(0.0..=1440.).contains(&s.moisture)
        {
            return false;
        }
        if s.material >= 2
            && (s.planted
                || s.restored
                || s.growth != 1.
                || s.active && s.remaining != v.economy.land[s.material - 2])
        {
            return false;
        }
        if s.material < 2
            && (s.remaining > 0. && (!s.planted || s.growth != 1.)
                || s.material == 0 && s.remaining % 8. != 0.
                || s.planted && s.growth == 1. && s.remaining == 0.)
        {
            return false;
        }
        if s.active {
            let plot = cells(s.material, s.x, s.y);
            if plot.iter().any(|&(plot_x, plot_y)| {
                !(1..MAP_SIZE - 1).contains(&plot_x)
                    || !(1..MAP_SIZE - 1).contains(&plot_y)
                    || river_bank(plot_x, plot_y)
                    || ((plot_x as f32 - CAMP.0).abs() < 1.5
                        && (plot_y as f32 - CAMP.1).abs() < 1.5)
                    || v.roads.contains(&(plot_x, plot_y))
                    || v.buildings
                        .iter()
                        .any(|b| interactions::occupies(b, plot_x, plot_y))
                    || v.economy
                        .sources
                        .iter()
                        .take(i)
                        .any(|other| occupies(other, plot_x, plot_y))
            }) || s.material == 3 && (s.x < 17 || s.y < 17)
            {
                return false;
            }
        } else if s.remaining != 0. || s.planted || s.harvest_requested || s.plant_requested {
            return false;
        }
    }
    true
}
#[wasm_bindgen]
impl Game {
    pub fn place_source(&mut self, material: usize, x: i32, y: i32) -> String {
        let mut v = self.app.world_mut().resource_mut::<Village>();
        if let Err(message) = location(&v, material, x, y) {
            return message.into();
        }
        if v.economy.sources.len() >= 676 {
            return "This village has reached its plot limit.".into();
        }
        if v.logistics.is_some() && v.simulation.next_id.checked_add(1).is_none() {
            return "Material location identity limit reached.".into();
        }
        if material >= 2 && v.economy.land[material - 2] <= 0. {
            return "This property’s reserve has been exhausted. Buy supplies in town.".into();
        }
        let cost = if v.mode == crate::modes::Mode::Sandbox {
            0
        } else {
            [8000, 3000, 1500, 2500, 1500][material]
        };
        if v.economy.money < cost {
            return "The shared fund cannot cover establishing this plot.".into();
        }
        if material < 2 && !water_available(&v) {
            return "Set aside two irrigation water for planting.".into();
        }
        economy::contribute(&mut v, cost, "Establishing a material plot");
        if material < 2 {
            water(&mut v);
        }
        let remaining = if material < 2 {
            0.
        } else {
            v.economy.land[material - 2]
        };
        v.economy.sources.push(economy::Source {
            material,
            x,
            y,
            remaining,
            maximum: maximum(material),
            restored: false,
            player_placed: true,
            active: true,
            growth: if material < 2 { 0. } else { 1. },
            moisture: if material < 2 { 1440. } else { 0. },
            planted: material < 2,
            auto_replant: true,
            auto_harvest: true,
            harvest_requested: false,
            plant_requested: false,
            harvests: 0,
        });
        crate::logistics::sync(&mut v);
        event(&mut v, "A player-managed material plot is established.");
        "ok".into()
    }
    pub fn configure_source(&mut self, index: usize, replant: bool, harvest: bool) -> String {
        let mut v = self.app.world_mut().resource_mut::<Village>();
        let Some(s) = v.economy.sources.get_mut(index).filter(|s| s.active) else {
            return "Site not found.".into();
        };
        s.auto_replant = replant;
        s.auto_harvest = harvest;
        "ok".into()
    }
    pub fn harvest_source(&mut self, index: usize) -> String {
        let mut v = self.app.world_mut().resource_mut::<Village>();
        let Some(s) = v.economy.sources.get_mut(index).filter(|s| s.active) else {
            return "Site not found.".into();
        };
        if s.remaining < if s.material == 0 { 8. } else { 1. } {
            return "This plot is not ready to harvest. Check growth or remaining reserves.".into();
        }
        s.harvest_requested = true;
        "ok".into()
    }
    pub fn replant_source(&mut self, index: usize) -> String {
        let mut v = self.app.world_mut().resource_mut::<Village>();
        let Some(s) = v.economy.sources.get(index).filter(|s| s.active) else {
            return "Site not found.".into();
        };
        if s.material >= 2 || s.planted {
            return "That plot does not need replanting.".into();
        }
        if v.economy.money < replant_cost(s.material) || !water_available(&v) {
            return "Set aside irrigation water and seedling funds before replanting.".into();
        }
        v.economy.sources[index].plant_requested = true;
        "ok".into()
    }
    pub fn clear_source(&mut self, index: usize) -> String {
        {
            let mut v = self.app.world_mut().resource_mut::<Village>();
            let Some(s) = v.economy.sources.get_mut(index).filter(|s| s.active) else {
                return "Site not found.".into();
            };
            s.active = false;
            s.remaining = 0.;
            s.planted = false;
            s.harvest_requested = false;
            s.plant_requested = false;
            crate::logistics::sync(&mut v);
        }
        let mut q = self.app.world_mut().query::<&mut Resident>();
        for mut r in q.iter_mut(self.app.world_mut()) {
            if r.task == "source" && r.activity_material == Some(index) {
                crate::walking::clear(&mut r);
                r.task = "idle".into();
                r.reason = "That plot was cleared.".into();
                r.remaining = 0.;
                r.activity_material = None;
                r.requested = false;
                r.target_x = r.x;
                r.target_y = r.y;
            }
        }
        self.sync_help();
        "ok".into()
    }
}
pub fn options() -> serde_json::Value {
    serde_json::json!([
        {"material":0,"key":"source_timber","name":"Timber trees","cost":8000,"size":3,"days":4,"description":"Plant four timber trees · harvest whole trees · replant renewably"},
        {"material":1,"key":"source_bamboo","name":"Bamboo plot","cost":3000,"size":2,"days":2,"description":"Cultivate bamboo · shoots regrow after cutting"},
        {"material":2,"key":"source_earth","name":"Earth digging","cost":1500,"size":2,"days":0,"description":"Choose an earth extraction area · finite property reserve"},
        {"material":3,"key":"source_stone","name":"Stone quarry","cost":2500,"size":2,"days":0,"description":"Place on stony southeast ground · finite shared stone reserve"},
        {"material":4,"key":"source_salvage","name":"Salvage recovery","cost":1500,"size":2,"days":0,"description":"Sort reclaimed material from the property · finite shared reserve"}
    ])
}
pub fn view(v: &Village) -> serde_json::Value {
    let names = [
        "Timber trees",
        "Bamboo plot",
        "Earth digging",
        "Stone quarry",
        "Salvage recovery",
    ];
    let rows:Vec<_>=v.economy.sources.iter().enumerate().filter(|(_,s)|s.active).map(|(index,s)|{
        let status=if s.material>=2{if s.remaining>0.{"Finite reserve shared by all sites on this property."}else{"Property reserve exhausted · purchase material in town."}}
        else if !s.planted{if s.auto_replant||s.plant_requested{if v.economy.money<replant_cost(s.material){"Replanting waits for seedling funds."}else if !water_available(v){"Replanting waits for two irrigation water."}else{"Replanting queued for normal community work hours."}}else{"Cut plot · choose whether to plant again."}}
        else if s.growth>=1.{"Mature · ready for a harvest batch."}else if s.moisture<=0.{"Growth paused · needs irrigation or rain."}else{"Growing · neighbours water the plot during normal work hours."};
        serde_json::json!({"index":index,"name":names[s.material],"status":status,"ready":s.remaining>=if s.material==0{8.}else{1.},"care":care(v,index),"growth_percent":(s.growth*100.).floor(),"hours_left":((1.-s.growth)*if s.material==0{96.}else{48.}/if s.restored{1.25}else{1.}).ceil(),"replant_cost":replant_cost(s.material),"batch":if s.material==0{8}else{4}})
    }).collect();
    serde_json::json!(rows)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fresh_land_is_empty_and_placement_is_paid_atomic_and_conflict_checked() {
        let mut g = Game::new();
        assert!(
            g.app
                .world()
                .resource::<Village>()
                .economy
                .sources
                .is_empty()
        );
        let water_before = g.app.world().resource::<Village>().water;
        let original = g.snapshot();
        assert_ne!(g.place_source(3, 5, 5), "ok");
        assert_eq!(g.snapshot(), original);
        assert_eq!(g.place_source(0, 5, 5), "ok");
        let v = g.app.world().resource::<Village>();
        assert_eq!(v.economy.money, 292000);
        assert_eq!(v.water, water_before - 2.);
        assert_eq!(v.economy.sources[0].remaining, 0.);
        let saved = g.snapshot();
        assert_ne!(g.place_source(1, 5, 5), "ok");
        assert_ne!(g.place("home", 5, 5), "ok");
        assert_ne!(g.toggle_road(5, 5), "ok");
        assert_eq!(g.snapshot(), saved);
        assert!(g.restore(&saved));
    }
    #[test]
    fn crops_need_water_and_time_then_harvest_whole_trees_and_replant_once() {
        let mut g = Game::new();
        assert_eq!(g.place_source(0, 5, 5), "ok");
        assert_ne!(g.harvest_source(0), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            advance(&mut v, 1440.);
            assert_eq!(v.economy.sources[0].growth, 0.25);
            let growth = v.economy.sources[0].growth;
            advance(&mut v, 600.);
            assert_eq!(v.economy.sources[0].growth, growth);
            for _ in 0..3 {
                assert!(finish(&mut v, 0));
                advance(&mut v, 1440.);
            }
            assert_eq!(v.economy.sources[0].remaining, 32.);
        }
        let checkpoint = g.snapshot();
        assert!(g.restore(&checkpoint));
        assert_eq!(g.harvest_source(0), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            let wood = v.wood;
            economy::finish_job(&mut v, "source", 0);
            assert_eq!(v.wood, wood + 8.);
            assert_eq!(v.economy.sources[0].remaining, 24.);
            for _ in 0..3 {
                v.economy.sources[0].harvest_requested = true;
                economy::finish_job(&mut v, "source", 0);
            }
            assert!(!v.economy.sources[0].planted);
            let funds = v.economy.money;
            assert!(finish(&mut v, 0));
            assert_eq!(v.economy.money, funds - 4000);
            assert!(!finish(&mut v, 0));
            assert_eq!(v.economy.sources[0].remaining, 0.);
            assert!(valid(&v));
        }
        let checkpoint = g.snapshot();
        assert!(g.restore(&checkpoint));
    }
    #[test]
    fn bamboo_regrows_from_roots_without_seedling_charge_and_manual_controls_hold() {
        let mut g = Game::new();
        assert_eq!(g.place_source(1, 5, 5), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            advance(&mut v, 1440.);
            assert!(finish(&mut v, 0));
            advance(&mut v, 1440.);
            assert_eq!(v.economy.sources[0].remaining, 24.);
            let funds = v.economy.money;
            for _ in 0..6 {
                v.economy.sources[0].harvest_requested = true;
                economy::finish_job(&mut v, "source", 0);
            }
            assert!(v.economy.sources[0].planted);
            assert_eq!(v.economy.sources[0].growth, 0.);
            assert!(finish(&mut v, 0));
            assert_eq!(v.economy.money, funds);
        }
        assert_eq!(g.configure_source(0, false, false), "ok");
        let checkpoint = g.snapshot();
        assert!(g.restore(&checkpoint));
    }
    #[test]
    fn multiple_quarries_share_reserves_and_relocation_cannot_duplicate_stone() {
        let mut g = Game::new();
        assert_eq!(g.place_source(3, 18, 18), "ok");
        assert_eq!(g.place_source(3, 21, 22), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.economy.sources[0].harvest_requested = true;
            let before = economy::quantity(&v, 3);
            economy::finish_job(&mut v, "source", 0);
            assert_eq!(economy::quantity(&v, 3), before + 4);
            assert_eq!(v.economy.land[1], 92.);
            assert!(v.economy.sources.iter().all(|s| s.remaining == 92.));
        }
        assert_eq!(g.clear_source(0), "ok");
        assert_eq!(g.place_source(3, 18, 18), "ok");
        assert_eq!(
            g.app.world().resource::<Village>().economy.sources[2].remaining,
            92.
        );
        let checkpoint = g.snapshot();
        assert!(g.restore(&checkpoint));
    }
    #[test]
    fn corrupted_growth_and_reserves_are_rejected_without_changing_village() {
        let mut g = Game::new();
        assert_eq!(g.place_source(0, 5, 5), "ok");
        let saved = g.snapshot();
        for (field, value) in [("growth", 2.), ("remaining", 8.), ("moisture", -1.)] {
            let mut bad: serde_json::Value = serde_json::from_str(&saved).unwrap();
            bad["village"]["economy"]["sources"][0][field] = value.into();
            assert!(!g.restore(&bad.to_string()));
            assert_eq!(g.snapshot(), saved);
        }
    }
    #[test]
    fn harvest_settings_and_unfunded_replanting_survive_reload() {
        let mut g = Game::new();
        assert_eq!(g.place_source(0, 5, 5), "ok");
        assert_eq!(g.configure_source(0, true, false), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.economy.sources[0].growth = 1.;
            v.economy.sources[0].remaining = 32.;
            let mut needs = [0; economy::COUNT];
            needs[0] = 8;
            assert!(!wanted(&v, 0, &needs));
        }
        assert_eq!(g.harvest_source(0), "ok");
        let checkpoint = g.snapshot();
        assert!(g.restore(&checkpoint));
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            assert!(wanted(&v, 0, &[0; economy::COUNT]));
            for _ in 0..4 {
                v.economy.sources[0].harvest_requested = true;
                economy::finish_job(&mut v, "source", 0);
            }
            v.economy.money = 3999;
            assert!(!care(&v, 0));
            assert!(!finish(&mut v, 0));
            assert!(!v.economy.sources[0].planted);
            assert_eq!(v.economy.money, 3999);
            assert!(view(&v).to_string().contains("seedling funds"));
        }
        assert_ne!(g.replant_source(0), "ok");
        let checkpoint = g.snapshot();
        assert!(g.restore(&checkpoint));
    }
    #[test]
    fn an_explicit_harvest_gets_a_turn_before_repeated_gardening() {
        let mut g = Game::new();
        assert_eq!(g.place("garden", 6, 6), "ok");
        assert_eq!(g.place_source(0, 18, 18), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.arrived = true;
            v.minutes = 540.;
            v.food = 17.;
            v.meals = 12;
            crate::logistics::fixture_finish(&mut v, 0);
            v.economy.sources[0].growth = 1.;
            v.economy.sources[0].remaining = 32.;
        }
        let mut q = g.app.world_mut().query::<&mut Resident>();
        for mut r in q.iter_mut(g.app.world_mut()) {
            r.task = "idle".into();
            r.remaining = 0.;
        }
        assert_eq!(g.harvest_source(0), "ok");
        for _ in 0..1200 {
            g.tick(0.25);
            if g.app.world().resource::<Village>().economy.sources[0].harvests > 0 {
                break;
            }
        }
        let v = g.app.world().resource::<Village>();
        assert_eq!(v.economy.sources[0].harvests, 1);
        assert_eq!(v.economy.sources[0].remaining, 24.);
        assert!(!v.economy.sources[0].harvest_requested);
    }

    #[test]
    fn clearing_an_assigned_plot_preserves_other_indices_and_stops_work() {
        let mut g = Game::new();
        for _ in 0..16 {
            assert_eq!(g.place_source(2, 5, 5), "ok");
            let index = g.app.world().resource::<Village>().economy.sources.len() - 1;
            assert_eq!(g.clear_source(index), "ok");
        }
        assert_eq!(g.place_source(2, 5, 5), "ok");
        {
            let mut q = g.app.world_mut().query::<&mut Resident>();
            let mut r = q.iter_mut(g.app.world_mut()).find(|r| r.id == 2).unwrap();
            r.task = "source".into();
            r.activity_material = Some(16);
            r.remaining = 20.;
        }
        let checkpoint = g.snapshot();
        assert!(
            g.restore(&checkpoint),
            "Source indices are not material indices"
        );
        assert_eq!(g.clear_source(16), "ok");
        let mut q = g.app.world_mut().query::<&Resident>();
        let r = q.iter(g.app.world()).find(|r| r.id == 2).unwrap();
        assert_eq!(r.task, "idle");
        assert_eq!(r.activity_material, None);
        assert_eq!(r.remaining, 0.);
        assert_eq!(g.app.world().resource::<Village>().economy.land[0], 140.);
        let checkpoint = g.snapshot();
        assert!(g.restore(&checkpoint));
    }
    #[test]
    fn fractional_reserves_and_inactive_requests_are_rejected_atomically() {
        let mut g = Game::new();
        assert_eq!(g.place_source(3, 18, 18), "ok");
        assert_eq!(g.clear_source(0), "ok");
        let saved = g.snapshot();
        let mut bad: serde_json::Value = serde_json::from_str(&saved).unwrap();
        bad["village"]["economy"]["land"][0] = 139.5.into();
        assert!(!g.restore(&bad.to_string()));
        bad = serde_json::from_str(&saved).unwrap();
        bad["village"]["economy"]["sources"][0]["plant_requested"] = true.into();
        assert!(!g.restore(&bad.to_string()));
        assert_eq!(g.snapshot(), saved);
    }
}
