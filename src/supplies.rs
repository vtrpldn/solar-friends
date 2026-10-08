//! Gentle food production: fed hens lay eggs; kitchens stretch ingredients.
use super::*;

pub fn urgent(v: &Village) -> bool {
    // Leave a full round of portions while foragers walk to separate patches.
    v.food < 6. && v.meals < 3
}
pub fn needs_ingredients(v: &Village) -> bool {
    v.food < 18. && v.food + (v.meals as f32) < 30.
}
pub fn needs_meals(v: &Village) -> bool {
    v.meals < 8
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
            .filter(|b| b.kind == "coop" && b.progress >= 100. && b.poultry.remaining > 0.)
            .count() as u32;
    for b in &mut v.buildings {
        if b.kind != "coop" || b.progress < 100. {
            continue;
        }
        if b.poultry.remaining <= 0. {
            // Keep six ingredients for residents, and avoid wasting feed at capacity.
            if !v.supplies.feed_hens || v.food < 9. || reserved_eggs + 3 > 12 {
                continue;
            }
            v.food -= 3.;
            v.supplies.used += 3.;
            b.poultry.remaining = 720.;
            reserved_eggs += 3;
        }
        b.poultry.remaining = (b.poultry.remaining - elapsed).max(0.);
        if b.poultry.remaining == 0. {
            let laid = 3.min(12u32.saturating_sub(v.supplies.eggs));
            v.supplies.eggs += laid;
            v.supplies.eggs_laid += laid;
            v.progress.eggs_collected += laid;
        }
    }
}
pub fn can_cook(v: &Village) -> bool {
    v.water >= 1. && (v.food >= 3. || (v.supplies.use_eggs && v.supplies.eggs >= 2 && v.food >= 2.))
}
pub fn cook(v: &mut Village) {
    if !can_cook(v) {
        return;
    }
    let eggs = v.supplies.use_eggs && v.supplies.eggs >= 2 && v.food >= 2.;
    let ingredients = if eggs { 2. } else { 3. };
    let meals = if eggs { 7 } else { 5 };
    v.food -= ingredients;
    v.water -= 1.;
    if eggs {
        v.supplies.eggs -= 2;
    }
    v.meals += meals;
    v.supplies.used += ingredients;
    v.supplies.meals_cooked += meals;
    v.progress.scraps = v.progress.scraps.saturating_add(1);
}
pub fn valid(v: &Village) -> bool {
    let s = &v.supplies;
    s.eggs <= 60
        && [s.gathered, s.used]
            .iter()
            .all(|n| n.is_finite() && *n >= 0.)
        && v.buildings
            .iter()
            .all(|b| b.poultry.remaining.is_finite() && (0.0..=720.).contains(&b.poultry.remaining))
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
            .later_completed = [true; 3];
        assert_eq!(game.place("coop", 5, 5), "ok");
        let mut v = game.app.world().resource::<Village>().clone();
        v.buildings[0].progress = 100.;
        v.minutes = 360.;
        v.economy.ledger.clear();
        v
    }
    fn run(v: &mut Village, minutes: u32) {
        for _ in 0..minutes {
            v.minutes += 1.;
            advance(v, 1.);
        }
    }
    #[test]
    fn feed_is_paid_once_and_eggs_need_daylight() {
        let mut v = coop();
        v.food = 9.;
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
        v.supplies.eggs = 60;
        run(&mut v, 10);
        assert_eq!(v.food, food);
        v.supplies.eggs = 0;
        v.buildings[0].progress = 99.;
        run(&mut v, 10);
        assert_eq!(v.food, food);
    }
    #[test]
    fn several_coops_reserve_only_a_dozen_eggs_and_keep_legacy_surplus() {
        let mut v = coop();
        v.food = 100.;
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
        v.supplies.eggs = 60;
        run(&mut v, 1440);
        assert_eq!(v.supplies.eggs, 60);
        assert_eq!(v.food, 88.);
    }
    #[test]
    fn recipes_account_for_inputs_and_fallback() {
        let mut v = coop();
        v.food = 2.;
        v.water = 1.;
        v.supplies.eggs = 2;
        cook(&mut v);
        assert_eq!((v.food, v.water, v.supplies.eggs, v.meals), (0., 0., 0, 7));
        cook(&mut v);
        assert_eq!(v.meals, 7);
        v.food = 3.;
        v.water = 1.;
        v.supplies.eggs = 2;
        v.supplies.use_eggs = false;
        cook(&mut v);
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
            v.food = 0.;
            v.wood = 100.;
            v.water = 100.;
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
