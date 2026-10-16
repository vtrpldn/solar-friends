//! Player-established cultivation and finite extraction plots.
use crate::{CAMP, Game, MAP_SIZE, Resident, Village, economy, event, interactions, river_bank};
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
    if !(1..MAP_SIZE - 1).contains(&x) || !(1..MAP_SIZE - 1).contains(&y) {
        return Err("Choose an inland clearing inside the village.");
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
    if material >= 2 {
        let Some(deposit) = crate::land::deposit(v, material, x, y) else {
            return Err("No matching deposit here. Check the land map for another patch.");
        };
        if crate::sandbox::land(v) && deposit.remaining == 0 {
            return Err(
                "This local deposit is exhausted. Choose another patch or buy supplies in town.",
            );
        }
    }
    if plot.iter().any(|&(plot_x, plot_y)| {
        ((plot_x as f32 - CAMP.0).abs() < 1.5 && (plot_y as f32 - CAMP.1).abs() < 1.5)
            || crate::building_work::reserved(v, plot_x, plot_y, None)
            || crate::restoration::reserved(v, plot_x, plot_y)
            || crate::power::batteries::reserved(v, plot_x, plot_y, None)
            || crate::pipes::reserved(v, plot_x, plot_y)
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
pub fn water_available(v: &Village, index: usize) -> bool {
    crate::water::irrigation(v, crate::water::Owner::Source(index)) >= 2.
}
pub fn care(v: &Village, index: usize) -> bool {
    let Some(s) = v.economy.sources.get(index) else {
        return false;
    };
    s.active
        && s.material < 2
        && water_available(v, index)
        && if s.planted {
            crate::sandbox::land(v) && s.growth < 1. && s.moisture < 120.
        } else {
            (s.auto_replant || s.plant_requested) && crate::planting::ready(v, index)
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
pub fn available(v: &Village, index: usize) -> f32 {
    let s = &v.economy.sources[index];
    if s.material >= 2 && !crate::sandbox::land(v) {
        s.maximum
    } else {
        s.remaining
    }
}
pub fn wanted(v: &Village, index: usize, needs: &economy::Bundle) -> bool {
    let s = &v.economy.sources[index];
    s.active
        && (care(v, index)
            || ((s.auto_harvest && needs[s.material] > 0 || s.harvest_requested)
                && available(v, index) >= if s.material == 0 { 8. } else { 1. }
                && economy::capacity(v) - economy::storage(v)
                    >= if s.material == 0 { 8 } else { 1 }))
}
pub fn finish(v: &mut Village, index: usize) -> bool {
    if !care(v, index) {
        return false;
    }
    let material = v.economy.sources[index].material;
    if !v.economy.sources[index].planted {
        if material == 0 && v.economy.sources[index].harvests > 0 {
            v.progress.timber_replanted = true;
        }
        let source = &v.economy.sources[index];
        let (n, x, y) = (size(material), source.x, source.y);
        crate::land::disturb_plot(v, n, x, y, 0.08);
        crate::planting::consume(v, index);
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
    crate::water::irrigate(v, crate::water::Owner::Source(index));
    let s = &v.economy.sources[index];
    let (n, x, y) = (size(s.material), s.x, s.y);
    crate::land::water_plot(v, n, x, y, 1.);
    true
}
pub fn harvested(v: &mut Village, index: usize, amount: u32) {
    let material = v.economy.sources[index].material;
    v.economy.sources[index].harvest_requested = false;
    v.economy.sources[index].harvests = v.economy.sources[index].harvests.saturating_add(1);
    if material >= 2 {
        let id = v.economy.sources[index]
            .deposit
            .expect("finite site has a local deposit");
        crate::land::extract(v, id, amount);
        let s = &v.economy.sources[index];
        let (n, x, y) = (size(s.material), s.x, s.y);
        crate::land::disturb_plot(v, n, x, y, amount as f32 * 0.01);
    } else {
        let s = &v.economy.sources[index];
        let (n, x, y) = (size(s.material), s.x, s.y);
        crate::land::harvest_soil(v, n, x, y, false);
        let s = &mut v.economy.sources[index];
        s.remaining -= amount as f32;
        if s.remaining == 0. {
            s.growth = 0.;
            s.moisture = 0.;
            s.planted = material == 1 && s.auto_replant;
        }
    }
    crate::land::sync_moisture(v);
}
pub fn advance(v: &mut Village, minutes: f32) {
    let mut matured = 0;
    for i in 0..v.economy.sources.len() {
        let s = &v.economy.sources[i];
        if !s.active || s.material >= 2 {
            continue;
        }
        let (n, x, y, material, planted, growth) =
            (size(s.material), s.x, s.y, s.material, s.planted, s.growth);
        let condition = crate::land::condition(v, n, x, y);
        let wet = crate::land::plot_water(
            v,
            n,
            x,
            y,
            minutes,
            crate::land::RootZone {
                capacity: 1440.,
                drying: 1.,
                covered: false,
            },
        );
        if !planted || growth >= 1. {
            continue;
        }
        let s = &mut v.economy.sources[i];
        s.growth = (s.growth
            + wet / (if material == 0 { 5760. } else { 2880. }) * crate::land::growth(&condition))
        .min(1.);
        if s.growth >= 1. {
            s.remaining = s.maximum;
            matured += 1;
        }
    }
    crate::land::sync_moisture(v);
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
        || v.economy.sources.len() > ((crate::MAP_SIZE - 2) * (crate::MAP_SIZE - 2)) as usize
    {
        return false;
    }
    for (i, s) in v.economy.sources.iter().enumerate() {
        if !s.player_placed
            || s.material >= 5
            || !(1..MAP_SIZE - 1).contains(&s.x)
            || !(1..MAP_SIZE - 1).contains(&s.y)
            || if s.material < 2 {
                s.maximum != maximum(s.material) || s.deposit.is_some()
            } else {
                crate::land::deposit(v, s.material, s.x, s.y).is_none_or(|d| {
                    s.deposit != Some(d.id)
                        || s.maximum != d.maximum as f32
                        || s.active && s.remaining != d.remaining as f32
                })
            }
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
        if s.material >= 2 && (s.planted || s.restored || s.growth != 1.) {
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
        if v.economy.sources.len() >= ((crate::MAP_SIZE - 2) * (crate::MAP_SIZE - 2)) as usize {
            return "This village has reached its plot limit.".into();
        }
        if v.logistics.is_some() && v.simulation.next_id.checked_add(1).is_none() {
            return "Material location identity limit reached.".into();
        }
        let cost = if !crate::sandbox::logistics(&v) {
            0
        } else {
            [4000, 1000, 1500, 2500, 1500][material]
        };
        if v.economy.money < cost {
            return "The shared fund cannot cover establishing this plot.".into();
        }
        economy::contribute(&mut v, cost, "Establishing a material plot");
        let deposit =
            (material >= 2).then(|| crate::land::deposit(&v, material, x, y).unwrap().clone());
        let remaining = deposit.as_ref().map_or(0., |d| d.remaining as f32);
        let maximum = deposit
            .as_ref()
            .map_or_else(|| maximum(material), |d| d.maximum as f32);
        v.economy.sources.push(economy::Source {
            deposit: deposit.as_ref().map(|d| d.id),
            material,
            x,
            y,
            remaining,
            maximum,
            restored: false,
            player_placed: true,
            active: true,
            growth: if material < 2 { 0. } else { 1. },
            moisture: 0.,
            planted: false,
            auto_replant: true,
            auto_harvest: true,
            harvest_requested: false,
            plant_requested: material < 2,
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
        let limited = crate::sandbox::land(&v);
        let Some(s) = v.economy.sources.get_mut(index).filter(|s| s.active) else {
            return "Site not found.".into();
        };
        if (if s.material >= 2 && !limited {
            s.maximum
        } else {
            s.remaining
        }) < if s.material == 0 { 8. } else { 1. }
        {
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
            s.moisture = 0.;
            if s.material < 2 {
                s.growth = 0.;
            }
            s.harvest_requested = false;
            s.plant_requested = false;
            crate::restoration::reconcile(&mut v);
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
        self.sync_restoration_activities();
        "ok".into()
    }
}
pub fn options() -> serde_json::Value {
    serde_json::json!([
        {"material":0,"key":"source_timber","name":"Timber trees","cost":4000,"planting_material":economy::TREE_STARTS,"planting_amount":4,"size":3,"days":4,"description":"Mark a timber plot · deliver four timber seedlings · resident planting"},
        {"material":1,"key":"source_bamboo","name":"Bamboo plot","cost":1000,"planting_material":economy::BAMBOO_STARTS,"planting_amount":1,"size":2,"days":2,"description":"Mark a bamboo plot · deliver one bamboo start · shoots regrow after cutting"},
        {"material":2,"key":"source_earth","name":"Earth digging","cost":1500,"size":2,"days":0,"description":"Choose an earth extraction area · finite local deposit"},
        {"material":3,"key":"source_stone","name":"Stone quarry","cost":2500,"size":2,"days":0,"description":"Place on stony southeast ground · finite local stone deposit"},
        {"material":4,"key":"source_salvage","name":"Salvage recovery","cost":1500,"size":2,"days":0,"description":"Sort reclaimed material from the property · finite local deposit"}
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
        let soil=crate::land::condition(v,size(s.material),s.x,s.y);
        let rate=crate::land::growth(&soil);
        let status=if s.material>=2&&!crate::sandbox::land(v){"Sandbox extraction does not deplete this patch; its saved reserve is preserved."}else if s.material>=2{if s.remaining>0.{"Finite local deposit · shared only by sites on this patch."}else{"Local deposit exhausted · choose another patch or purchase in town."}}
        else if !s.planted{if s.auto_replant||s.plant_requested{if !crate::planting::ready(v,index){"Planting waits for delivered stock. Order timber seedlings or bamboo starts in Trade, then let neighbours haul them to this plot."}else if !water_available(v,index){"Replanting waits for two irrigation water."}else{"Planting queued for a neighbour with enough energy."}}else{"Cut plot · choose whether to plant again."}}
        else if s.growth>=1.{"Mature · ready for a harvest batch."}else if s.moisture<=0.{"Growth paused · needs irrigation or rain."}else{"Growing · neighbours water the plot when they have the energy."};
        serde_json::json!({"index":index,"name":names[s.material],"status":status,"ready":available(v,index)>=if s.material==0{8.}else{1.},"care":care(v,index),"deposit":s.deposit,"remaining":s.remaining,"unlimited":s.material>=2&&!crate::sandbox::land(v),"maximum":s.maximum,"growth_percent":(s.growth*100.).floor(),"soil":soil,"growth_multiplier":rate,"hours_left":((1.-s.growth)*if s.material==0{96.}else{48.}/rate).ceil(),"replant_cost":if s.material==0{4000}else{0},"planting_stock":crate::planting::required(v,index).map(|(material,amount)|serde_json::json!({"material":material,"amount":amount,"here":crate::organics::available(v,crate::logistics::Owner::Source(index),material)})),"batch":if s.material==0{8}else{4}})
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
        assert_eq!(v.economy.money, 296000);
        assert_eq!(v.water, water_before);
        assert!(!v.economy.sources[0].planted);
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
            crate::organics::fixture_transfer(
                &mut v,
                crate::logistics::Owner::Source(0),
                economy::TREE_STARTS,
                4,
            );
            crate::water::fixture_at(
                &mut v,
                crate::water::Owner::Source(0),
                crate::water::Class::Fresh,
                2.,
            );
            assert!(finish(&mut v, 0));
            advance(&mut v, 1440.);
            assert_eq!(v.economy.sources[0].growth, 0.25);
            let growth = v.economy.sources[0].growth;
            advance(&mut v, 600.);
            assert!(
                v.economy.sources[0].growth > growth,
                "Visible perimeter shade keeps a little water after the unshaded day"
            );
            let dry_growth = v.economy.sources[0].growth;
            advance(&mut v, 600.);
            assert_eq!(v.economy.sources[0].growth, dry_growth);
            for _ in 0..3 {
                crate::water::fixture_at(
                    &mut v,
                    crate::water::Owner::Source(0),
                    crate::water::Class::Fresh,
                    2.,
                );
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
            assert!(!finish(&mut v, 0));
            crate::logistics::fixture_stock(&mut v, economy::TREE_STARTS, 4);
            crate::organics::fixture_transfer(
                &mut v,
                crate::logistics::Owner::Source(0),
                economy::TREE_STARTS,
                4,
            );
            crate::water::fixture_at(
                &mut v,
                crate::water::Owner::Source(0),
                crate::water::Class::Fresh,
                2.,
            );
            assert!(finish(&mut v, 0));
            assert_eq!(v.economy.money, funds);
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
            crate::organics::fixture_transfer(
                &mut v,
                crate::logistics::Owner::Source(0),
                economy::BAMBOO_STARTS,
                1,
            );
            crate::water::fixture_at(
                &mut v,
                crate::water::Owner::Source(0),
                crate::water::Class::Fresh,
                2.,
            );
            assert!(finish(&mut v, 0));
            advance(&mut v, 1440.);
            crate::water::fixture_at(
                &mut v,
                crate::water::Owner::Source(0),
                crate::water::Class::Fresh,
                2.,
            );
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
            crate::water::fixture_at(
                &mut v,
                crate::water::Owner::Source(0),
                crate::water::Class::Fresh,
                2.,
            );
            assert!(finish(&mut v, 0));
            assert_eq!(v.economy.money, funds);
        }
        assert_eq!(g.configure_source(0, false, false), "ok");
        let checkpoint = g.snapshot();
        assert!(g.restore(&checkpoint));
    }
    #[test]
    fn quarries_only_share_their_own_patch_and_relocation_cannot_duplicate_stone() {
        let mut g = Game::new();
        assert_eq!(g.place_source(3, 18, 18), "ok");
        assert_eq!(g.place_source(3, 40, 23), "ok");
        let first = g.app.world().resource::<Village>().economy.sources[0].remaining;
        let second = g.app.world().resource::<Village>().economy.sources[1].remaining;
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.economy.sources[0].harvest_requested = true;
            let before = economy::quantity(&v, 3);
            economy::finish_job(&mut v, "source", 0);
            assert_eq!(economy::quantity(&v, 3), before + 4);
            assert_eq!(v.economy.land[1], 92.);
            assert_eq!(v.economy.sources[0].remaining, first - 4.);
            assert_eq!(v.economy.sources[1].remaining, second);
        }
        assert_eq!(g.clear_source(0), "ok");
        assert_eq!(g.place_source(3, 18, 18), "ok");
        assert_eq!(
            g.app.world().resource::<Village>().economy.sources[2].remaining,
            first - 4.
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
            crate::organics::fixture_transfer(
                &mut v,
                crate::logistics::Owner::Source(0),
                economy::TREE_STARTS,
                4,
            );
            crate::water::fixture_at(
                &mut v,
                crate::water::Owner::Source(0),
                crate::water::Class::Fresh,
                2.,
            );
            assert!(finish(&mut v, 0));
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
            assert!(view(&v).to_string().contains("delivered stock"));
        }
        assert_eq!(g.replant_source(0), "ok");
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
            crate::logistics::fixture_stock(&mut v, crate::economy::FOOD, (17.) as u32);
            crate::logistics::fixture_stock(&mut v, crate::economy::MEALS, 12);
            crate::logistics::fixture_finish(&mut v, 0);
            crate::organics::fixture_transfer(
                &mut v,
                crate::logistics::Owner::Source(0),
                economy::TREE_STARTS,
                4,
            );
            crate::water::fixture_at(
                &mut v,
                crate::water::Owner::Source(0),
                crate::water::Class::Fresh,
                2.,
            );
            assert!(finish(&mut v, 0));
            v.economy.sources[0].growth = 1.;
            v.economy.sources[0].remaining = 32.;
        }
        let mut q = g.app.world_mut().query::<&mut Resident>();
        for mut r in q.iter_mut(g.app.world_mut()) {
            r.task = "idle".into();
            r.activity_store = None;
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
            r.activity_store = None;
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
