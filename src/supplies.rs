//! Gentle food production: fed hens lay eggs; kitchens stretch ingredients.
use super::*;

pub(crate) const HEN_FODDER: u32 = 2;
pub(crate) const HEN_FOOD: u32 = 3;
pub(crate) const HEN_FOOD_RESERVE: f32 = 9.;

pub fn urgent(v: &Village) -> bool {
    // Leave a full round of portions while foragers walk to separate patches.
    v.food < 6. && v.meals + food::other_portions(v) < 3
}
pub fn needs_ingredients(v: &Village) -> bool {
    v.food < 18. && v.food + ((v.meals + food::other_portions(v)) as f32) < 30.
}

#[derive(Clone, Default, Serialize, Deserialize)]
pub struct Poultry {
    pub remaining: f32,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Supplies {
    pub eggs: u32,
    pub feed_hens: bool,
    pub use_eggs: bool,
    pub day: u32,
    pub gathered: f32,
    pub used: f32,
    pub eggs_laid: u32,
    pub meals_cooked: u32,
    pub portions_eaten: u32,
}
impl Default for Supplies {
    fn default() -> Self {
        Self {
            eggs: 0,
            feed_hens: true,
            use_eggs: true,
            day: 0,
            gathered: 0.,
            used: 0.,
            eggs_laid: 0,
            meals_cooked: 0,
            portions_eaten: 0,
        }
    }
}
pub fn advance(v: &mut Village, minutes: f32) {
    let day = (v.minutes / 1440.) as u32;
    if v.supplies.day != day {
        v.supplies.day = day;
        v.supplies.gathered = 0.;
        v.supplies.used = 0.;
        v.supplies.eggs_laid = 0;
        v.supplies.meals_cooked = 0;
        v.supplies.portions_eaten = 0;
    }
    // Integrate only the daylight part of this step, including dawn/dusk edges.
    let start = v.minutes - minutes;
    let daylight =
        |t: f32| (t / 1440.).floor() * 720. + (t.rem_euclid(1440.) - 360.).clamp(0., 720.);
    let elapsed = (daylight(v.minutes) - daylight(start)).max(0.);
    if elapsed == 0. {
        return;
    }
    // Reserve space for fed batches too, so several coops cannot overproduce.
    let mut reserved_eggs = v.supplies.eggs
        + 3 * v
            .buildings
            .iter()
            .filter(|b| b.kind == "coop" && b.agriculture.stocked && b.poultry.remaining > 0.)
            .count() as u32;
    let coops: Vec<_> = v
        .buildings
        .iter()
        .filter(|b| {
            b.kind == "coop"
                && b.agriculture.stocked
                && b.progress >= 100.
                && building_work::job(v, b.id).is_none()
        })
        .map(|b| b.id)
        .collect();
    for id in coops {
        let index = v.buildings.iter().position(|b| b.id == id).unwrap();
        if v.buildings[index].poultry.remaining <= 0. {
            let local =
                food::pantry(v, id).map_or(0, |p| food::available(v, p, economy::FOOD, None));
            let fodder = organics::available(v, logistics::Owner::Pantry(id), economy::FODDER) >= HEN_FODDER;
            if !v.supplies.feed_hens
                || (!fodder && (v.food < HEN_FOOD_RESERVE || local < HEN_FOOD))
                || reserved_eggs + 3 > 12
            {
                continue;
            }
            logistics::spend(
                v,
                Some(logistics::Owner::Pantry(id)),
                if fodder {
                    economy::FODDER
                } else {
                    economy::FOOD
                },
                if fodder { HEN_FODDER } else { HEN_FOOD },
            );
            if !fodder {
                v.supplies.used += HEN_FOOD as f32;
            }
            v.buildings[index].poultry.remaining = 720.;
            reserved_eggs += 3;
        }
        let remaining = &mut v.buildings[index].poultry.remaining;
        *remaining = (*remaining - elapsed).max(0.);
        if *remaining == 0. {
            let laid = 3.min(12u32.saturating_sub(v.supplies.eggs));
            if logistics::receive(v, logistics::Owner::Pantry(id), economy::EGGS, laid) {
                v.supplies.eggs_laid += laid;
                v.progress.eggs_collected += laid;
            } else {
                v.buildings[index].poultry.remaining = 0.001;
            }
        }
    }
}
/// Extend only material-vector fields; identities, coordinates and quantities stay unchanged.
pub(crate) fn migrate_hens(raw: &mut serde_json::Value) {
    fn extend(value: &mut serde_json::Value) {
        match value {
            serde_json::Value::Object(fields) => {
                for (key, value) in fields {
                    if [
                        "stock",
                        "items",
                        "reserved",
                        "consumed",
                        "opening",
                        "received",
                        "spent",
                        "target",
                        "targets",
                        "inputs",
                        "outputs",
                        "retired_inputs",
                        "retired_outputs",
                        "expired",
                        "prices",
                        "returns",
                        "kit",
                    ]
                    .contains(&key.as_str())
                        && let Some(items) = value.as_array_mut()
                        && items.len() == 29
                    {
                        items.push(if items.first().is_some_and(|v| v.is_array()) {
                            serde_json::json!([0, 0])
                        } else {
                            0.into()
                        });
                    }
                    extend(value);
                }
            }
            serde_json::Value::Array(items) => {
                for item in items {
                    extend(item);
                }
            }
            _ => {}
        }
    }
    extend(raw);
    let coops: std::collections::HashSet<_> = raw["village"]["buildings"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|b| b["kind"] == "coop")
        .filter_map(|b| b["id"].as_u64())
        .collect();
    if let Some(projects) = raw["village"]["economy"]["projects"].as_array_mut() {
        for p in projects {
            if p["building"].as_u64().is_some_and(|id| coops.contains(&id)) {
                p["recipe"] = "legacy".into();
            }
        }
    }
}

#[cfg(test)]
pub fn can_cook_at(v: &Village, id: usize) -> bool {
    let Some(b) = v
        .buildings
        .iter()
        .find(|b| b.id == id && b.kind == "kitchen" && b.progress >= 100.)
    else {
        return false;
    };
    if building_work::job(v, b.id).is_some()
        || water::available(v, water::Owner::Building(b.id), water::Class::Fresh) < 1.
    {
        return false;
    }
    let Some(p) = food::pantry(v, id) else {
        return false;
    };
    let ingredients = food::available(v, p, economy::FOOD, None);
    let eggs = v.supplies.use_eggs && food::available(v, p, economy::EGGS, None) >= 2;
    let extra =
        if eggs { 3 } else { 2 } + u32::from(v.circular.use_biogas && v.circular.biogas >= 1.);
    economy::capacity(v).saturating_sub(economy::storage(v)) >= extra
        && ingredients >= if eggs { 2 } else { 3 }
        && logistics::room(v, p.owner)
            >= if eggs { 7 - 4 } else { 5 - 3 }
                + u32::from(v.circular.use_biogas && v.circular.biogas >= 1.)
}
#[cfg(test)]
pub fn can_cook(v: &Village) -> bool {
    v.buildings.iter().any(|b| can_cook_at(v, b.id))
}
#[cfg(test)]
pub fn cook_at(v: &mut Village, id: usize) -> bool {
    if !can_cook_at(v, id) {
        return false;
    }
    let Some(batch) = production::order_meals(v, Some(id)) else {
        return false;
    };
    let mut g = Game::new();
    let mut r = g
        .app
        .world_mut()
        .query::<&Resident>()
        .iter(g.app.world())
        .next()
        .unwrap()
        .clone();
    if !production::assign_batch(&mut r, v, batch) {
        return false;
    }
    r.x = r.target_x;
    r.y = r.target_y;
    production::work(v, &r, 10.)
}

#[cfg(test)]
pub fn fixture_cook(v: &mut Village) {
    if let Some(id) = v
        .buildings
        .iter()
        .find(|b| b.kind == "kitchen" && b.progress >= 100.)
        .map(|b| b.id)
    {
        food::fixture_stage(v, id);
    }
    if let Some(id) = v
        .buildings
        .iter()
        .find(|b| can_cook_at(v, b.id))
        .map(|b| b.id)
    {
        cook_at(v, id);
    }
}

pub fn valid(v: &Village) -> bool {
    let s = &v.supplies;
    s.eggs <= economy::capacity(v)
        && [s.gathered, s.used]
            .iter()
            .all(|n| n.is_finite() && *n >= 0.)
        && v.buildings.iter().all(|b| {
            b.poultry.remaining.is_finite()
                && (0.0..=720.).contains(&b.poultry.remaining)
                && (b.kind == "coop" || b.poultry.remaining == 0.)
                && (b.agriculture.stocked || b.poultry.remaining == 0.)
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn coop() -> Village {
        let mut game = Game::new();
        game.app
            .world_mut()
            .resource_mut::<Village>()
            .progress
            .completed = [true; 4];
        game.app
            .world_mut()
            .resource_mut::<Village>()
            .progress
            .later_completed = [true; crate::progression::LATER_CHAPTERS];
        assert_eq!(game.place("coop", 5, 5), "ok");
        let mut v = game.app.world().resource::<Village>().clone();
        crate::logistics::fixture_finish(&mut v, 0);
        v.maintenance = maintenance::State::default();
        v.minutes = 360.;
        freshness::fixture_reseed(&mut v);
        v.economy.ledger.clear();
        v
    }
    fn run(v: &mut Village, minutes: u32) {
        logistics::sync(v);
        let ids: Vec<_> = v
            .buildings
            .iter()
            .filter(|b| b.kind == "coop")
            .map(|b| b.id)
            .collect();
        for id in ids {
            food::fixture_stage(v, id);
        }
        for _ in 0..minutes {
            v.minutes += 1.;
            advance(v, 1.);
        }
    }
    #[test]
    fn feed_is_paid_once_and_eggs_need_daylight() {
        let mut v = coop();
        crate::logistics::fixture_stock(&mut v, crate::economy::FOOD, (9.) as u32);
        run(&mut v, 719);
        assert_eq!(v.food, 6.);
        assert_eq!(v.supplies.eggs, 0);
        run(&mut v, 1);
        assert_eq!(v.supplies.eggs, 3);
        run(&mut v, 720);
        assert_eq!(v.supplies.eggs, 3);
        run(&mut v, 720);
        assert_eq!(v.food, 6.);
        assert_eq!(v.supplies.eggs, 3);
    }
    #[test]
    fn controls_capacity_and_unfinished_coops_do_not_spend_feed() {
        let mut v = coop();
        let food = v.food;
        v.supplies.feed_hens = false;
        run(&mut v, 10);
        assert_eq!(v.food, food);
        v.supplies.feed_hens = true;
        crate::logistics::fixture_stock(&mut v, crate::economy::EGGS, 60);
        run(&mut v, 10);
        assert_eq!(v.food, food);
        crate::logistics::fixture_stock(&mut v, crate::economy::EGGS, 0);
        v.buildings[0].progress = 99.;
        run(&mut v, 10);
        assert_eq!(v.food, food);
    }
    #[test]
    fn several_coops_reserve_only_a_dozen_eggs_and_keep_legacy_surplus() {
        let mut v = coop();
        crate::logistics::fixture_stock(&mut v, crate::economy::FOOD, (100.) as u32);
        let building = v.buildings[0].clone();
        for id in 1..6 {
            let mut b = building.clone();
            b.id = id;
            v.buildings.push(b);
        }
        run(&mut v, 720);
        assert_eq!(v.supplies.eggs, 12);
        assert_eq!(v.food, 88.);
        run(&mut v, 2880);
        assert_eq!(v.supplies.eggs, 12);
        assert_eq!(v.food, 88.);
        crate::logistics::fixture_stock(&mut v, crate::economy::EGGS, 60);
        run(&mut v, 1440);
        assert_eq!(v.supplies.eggs, 60);
        assert_eq!(v.food, 88.);
    }
    #[test]
    fn recipes_account_for_inputs_and_fallback() {
        let mut g = Game::new();
        assert_eq!(g.place("kitchen", 5, 5), "ok");
        let mut v = g.app.world().resource::<Village>().clone();
        logistics::fixture_finish(&mut v, 0);
        crate::logistics::fixture_stock(&mut v, crate::economy::FOOD, (2.) as u32);
        crate::water::fixture_fresh(&mut v, 1.);
        crate::logistics::fixture_stock(&mut v, crate::economy::EGGS, 2);
        fixture_cook(&mut v);
        assert_eq!((v.food, v.water, v.supplies.eggs, v.meals), (0., 0., 0, 7));
        fixture_cook(&mut v);
        assert_eq!(v.meals, 7);
        crate::logistics::fixture_stock(&mut v, crate::economy::FOOD, (3.) as u32);
        crate::water::fixture_fresh(&mut v, 1.);
        crate::logistics::fixture_stock(&mut v, crate::economy::EGGS, 2);
        v.supplies.use_eggs = false;
        fixture_cook(&mut v);
        assert_eq!((v.food, v.water, v.supplies.eggs, v.meals), (0., 0., 2, 12));
        assert_eq!(v.supplies.meals_cooked, 12);
        assert_eq!(v.supplies.used, 5.);
    }
    #[test]
    fn old_saves_migrate_and_feed_progress_survives_reload() {
        let mut game = Game::new();
        let mut v = coop();
        run(&mut v, 100);
        game.app.insert_resource(v);
        let mut restored = Game::new();
        assert!(restored.restore(&game.snapshot()));
        assert_eq!(
            restored.app.world().resource::<Village>().buildings[0]
                .poultry
                .remaining,
            620.
        );
        let mut old: serde_json::Value = serde_json::from_str(&game.snapshot()).unwrap();
        old["village"].as_object_mut().unwrap().remove("supplies");
        old["village"]["buildings"][0]
            .as_object_mut()
            .unwrap()
            .remove("poultry");
        assert!(restored.restore(&old.to_string()));
        assert_eq!(restored.app.world().resource::<Village>().supplies.eggs, 0);
        old["village"]["supplies"] = serde_json::json!({"eggs":61});
        assert!(!restored.restore(&old.to_string()));
    }
    #[test]
    fn empty_pantry_can_recover_without_a_grove() {
        let mut game = Game::new();
        {
            let mut v = game.app.world_mut().resource_mut::<Village>();
            crate::logistics::fixture_stock(&mut v, crate::economy::FOOD, (0.) as u32);
            crate::logistics::fixture_stock(&mut v, 0, 100);
            crate::water::fixture_fresh(&mut v, 100.);
            v.minutes = 540.;
        }
        for _ in 0..800 {
            game.tick(0.25);
        }
        let v = game.app.world().resource::<Village>();
        assert!(v.supplies.gathered > 0.);
        assert!(v.supplies.portions_eaten > 0 || v.food > 0.);
    }
}
