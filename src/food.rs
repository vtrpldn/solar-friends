//! Food shares material ownership, cargo and conservation accounting.
use crate::*;
use economy::{Bundle, COUNT, EGGS, FOOD, MEALS};
use logistics::{Owner, Store};
use simulation::Id;

pub fn held(v: &Village, store: Id, material: usize, except: Option<usize>) -> u32 {
    v.workforce_peers
        .iter()
        .flatten()
        .filter(|r| {
            Some(r.id) != except
                && r.trip.is_none()
                && r.task == "eat"
                && r.remaining > 0.
                && r.activity_store == Some(store)
                && r.activity_material == Some(material)
        })
        .count() as u32
}
pub fn available(v: &Village, p: &Store, material: usize, resident: Option<usize>) -> u32 {
    p.items[material].saturating_sub(
        logistics::pickup_reserved(v, p.id, material)
            + held(v, p.id, material, resident)
            + gatherings::held(v, p.id, material),
    )
}
pub fn needs(v: &Village, building: usize) -> Bundle {
    let mut n = [0; COUNT];
    let Some(b) = v
        .buildings
        .iter()
        .find(|b| b.id == building && b.progress >= 100.)
    else {
        return n;
    };
    if building_work::job(v, building).is_some() {
        return n;
    }
    match b.kind.as_str() {
        "kitchen" => {
            // Keep a small pantry through meal breaks; sending it back to camp
            // after each pot creates repeated, unnecessary food trips.
            n[MEALS] = 16;
            n[FOOD] = 6;
            if v.supplies.use_eggs {
                n[EGGS] = 2;
            }
        }
        "coop"
            if v.supplies.feed_hens
                && v.food >= 9.
                && v.supplies.eggs < 12
                && b.poultry.remaining <= 0. =>
        {
            n[FOOD] = 3;
        }
        _ => {}
    }
    n[MEALS] = n[MEALS].max(gatherings::needs(v, building));
    if let Some(site) = production::pantry_site(v, building) {
        let inputs = production::needs(v, site);
        for i in 0..COUNT {
            n[i] = n[i].max(inputs[i]);
        }
    }
    n
}
pub fn pantry(v: &Village, building: usize) -> Option<&Store> {
    v.logistics
        .as_ref()?
        .stores
        .iter()
        .find(|p| p.owner == Owner::Pantry(building))
}
/// Harvests stay beside their plants; wild forage is put down at the patch.
/// A full store leaves a recoverable pile instead of silently discarding food.
pub fn gather(v: &mut Village, building: Option<usize>, x: f32, y: f32, amount: u32) -> u32 {
    let amount = amount.min(economy::capacity(v).saturating_sub(economy::storage(v)));
    if amount == 0 {
        return 0;
    }
    let owner = building
        .and_then(|id| v.buildings.iter().find(|b| b.id == id))
        .map(|b| {
            if ecology::farm(b) {
                Owner::Site(b.id)
            } else {
                Owner::Pantry(b.id)
            }
        });
    if owner.is_some_and(|o| logistics::receive(v, o, FOOD, amount)) {
        return amount;
    }
    let id = logistics::create(
        v,
        Owner::Ground,
        x.clamp(0.3, 27.7),
        y.clamp(0.3, 27.7),
        amount.max(12),
    )
    .expect("food pile identity exhausted");
    let owner_items = v
        .logistics
        .as_mut()
        .unwrap()
        .stores
        .iter_mut()
        .find(|p| p.id == id)
        .unwrap();
    owner_items.items[FOOD] = amount;
    freshness::add(&mut owner_items.food_lots, FOOD, amount, v.minutes);
    simulation::material_change(v, FOOD, amount, true);
    logistics::sync_totals(v);
    amount
}
/// Fresh forage can feed its picker even when building materials fill storage.
pub fn forage_yield(v: &Village, building: Option<usize>) -> u32 {
    if v.buildings
        .iter()
        .any(|b| Some(b.id) == building && b.kind == "grove" && b.progress >= 100.)
    {
        6
    } else {
        2
    }
}
pub fn forage(v: &mut Village, r: &mut Resident) -> u32 {
    let amount = forage_yield(v, r.activity_building);
    let stored = gather(v, r.activity_building, r.x, r.y, amount);
    if stored > 0 {
        return stored;
    }
    if r.hunger <= 60. {
        return 0;
    }
    simulation::material_change(v, FOOD, 1, true);
    simulation::material_change(v, FOOD, 1, false);
    r.hunger = (r.hunger - 45.).max(0.);
    v.supplies.used += 1.;
    v.supplies.portions_eaten += 1;
    if let Some(slot) = meal_slot(v.minutes) {
        r.last_meal_slot = slot;
    }
    1
}
pub fn reserved_space(v: &Village, owner: Option<Owner>) -> u32 {
    v.buildings
        .iter()
        .filter(|b| {
            b.kind == "coop"
                && b.poultry.remaining > 0.
                && owner.is_none_or(|o| o == Owner::Pantry(b.id))
        })
        .count() as u32
        * 3
}
pub fn meal(v: &Village, r: &Resident) -> Option<(Id, usize, [f32; 2])> {
    let mut choices = vec![];
    for p in &v.logistics.as_ref()?.stores {
        if [MEALS, FOOD]
            .into_iter()
            .all(|i| available(v, p, i, Some(r.id)) == 0)
        {
            continue;
        }
        let Some(point) = logistics::approaches(v, p, r.id) else {
            continue;
        };
        let Ok((route, _)) = navigation::work_route(v, [r.x, r.y], point) else {
            continue;
        };
        for material in [MEALS, FOOD] {
            let available_now = available(v, p, material, Some(r.id));
            let ready_at = v.minutes + route.minutes + 5. * MINUTES_PER_SECOND;
            let edible: Vec<_> = p
                .food_lots
                .iter()
                .filter(|l| {
                    l.material == material
                        && (v.mode == modes::Mode::Sandbox || l.expires > ready_at)
                })
                .collect();
            let future = edible
                .iter()
                .map(|l| l.amount)
                .sum::<u32>()
                .saturating_sub(p.items[material] - available_now);
            if available_now > 0 && future > 0 {
                let expires = edible.first().map_or(f32::INFINITY, |l| l.expires);
                choices.push((
                    expires,
                    material != MEALS,
                    route.minutes,
                    p.id.0,
                    p.id,
                    material,
                    point,
                ));
            }
        }
    }
    choices.sort_by(|a, b| {
        a.0.total_cmp(&b.0)
            .then(a.1.cmp(&b.1))
            .then(a.2.total_cmp(&b.2))
            .then(a.3.cmp(&b.3))
    });
    choices.first().map(|p| (p.4, p.5, p.6))
}
pub fn assign(r: &mut Resident, v: &Village) -> bool {
    let Some((store, material, point)) = meal(v, r) else {
        return false;
    };
    r.activity_store = Some(store);
    r.activity_material = Some(material);
    r.activity_building = None;
    (r.target_x, r.target_y) = (point[0], point[1]);
    true
}
pub fn target(v: &Village, r: &Resident) -> Result<[f32; 2], &'static str> {
    let p = v
        .logistics
        .as_ref()
        .and_then(|s| s.stores.iter().find(|p| Some(p.id) == r.activity_store))
        .ok_or("This food store is no longer available.")?;
    let i = r
        .activity_material
        .filter(|i| matches!(*i, FOOD | MEALS))
        .ok_or("Choose a stored portion first.")?;
    if available(v, p, i, Some(r.id)) == 0 {
        return Err("This store has no unclaimed portions. Gather food or bring a meal here.");
    }
    let point = [r.target_x, r.target_y];
    if navigation::clear(v, point[0], point[1])
        && (point[0] - p.x).hypot(point[1] - p.y) <= 4.5
        && navigation::exit_segment(v, [p.x, p.y], point)
    {
        Ok(point)
    } else {
        Err("Leave a clear approach to this food store.")
    }
}
pub fn eat(v: &mut Village, r: &mut Resident) -> bool {
    let Ok(p) = target(v, r) else {
        return false;
    };
    if (r.x - p[0]).hypot(r.y - p[1]) > 0.12 {
        return false;
    }
    let store = v
        .logistics
        .as_ref()
        .unwrap()
        .stores
        .iter()
        .find(|p| Some(p.id) == r.activity_store)
        .unwrap();
    let store_id = store.id;
    let i = r.activity_material.unwrap();
    // Consume this resident's saved claim before synchronising the global summary.
    if !logistics::spend_at(v, store_id, i, 1) {
        return false;
    }
    r.activity_store = None;
    v.supplies.portions_eaten += 1;
    if i == MEALS {
        v.meals_served += 1;
        r.hunger = (r.hunger - 65.).max(0.);
        r.social = (r.social + 8.).min(100.);
    } else {
        v.supplies.used += 1.;
        r.hunger = (r.hunger - 45.).max(0.);
    }
    true
}

#[cfg(test)]
pub fn fixture_stage(v: &mut Village, id: usize) {
    logistics::sync(v);
    let Some(to) = v
        .logistics
        .as_ref()
        .unwrap()
        .stores
        .iter()
        .position(|p| p.owner == Owner::Pantry(id))
    else {
        return;
    };
    let mut required = needs(v, id);
    if v.buildings
        .iter()
        .any(|b| b.id == id && b.kind == "kitchen")
    {
        required[FOOD] = 6;
        required[EGGS] = 2;
    }
    for i in [FOOD, EGGS] {
        let mut missing =
            required[i].saturating_sub(v.logistics.as_ref().unwrap().stores[to].items[i]);
        for from in 0..v.logistics.as_ref().unwrap().stores.len() {
            if from == to {
                continue;
            }
            let n = missing.min(v.logistics.as_ref().unwrap().stores[from].items[i]);
            let s = v.logistics.as_mut().unwrap();
            let lots = freshness::take(&mut s.stores[from].food_lots, i, n);
            freshness::merge(&mut s.stores[to].food_lots, lots);
            s.stores[from].items[i] -= n;
            s.stores[to].items[i] += n;
            missing -= n;
        }
    }
    logistics::sync_totals(v);
}

#[cfg(test)]
mod tests {
    use super::*;
    fn kitchen() -> Game {
        let mut g = Game::new();
        assert_eq!(g.place("kitchen", 5, 5), "ok");
        logistics::fixture_finish(&mut g.app.world_mut().resource_mut::<Village>(), 0);
        g
    }
    fn resident(g: &mut Game, id: usize) -> Resident {
        g.app
            .world_mut()
            .query::<&Resident>()
            .iter(g.app.world())
            .find(|r| r.id == id)
            .unwrap()
            .clone()
    }
    fn conserved(v: &Village) {
        assert!(
            simulation::view(v)["materials"]
                .as_array()
                .unwrap()
                .iter()
                .all(|m| m["difference"].as_f64() == Some(0.))
        );
    }
    #[test]
    fn kitchens_need_local_inputs_and_leave_their_meals_at_the_kitchen() {
        let mut g = kitchen();
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert_eq!(v.food, 36.);
        assert!(!supplies::can_cook(&v));
        let before = serde_json::to_string(&*v).unwrap();
        assert!(!supplies::cook_at(&mut v, 0));
        assert_eq!(serde_json::to_string(&*v).unwrap(), before);
        fixture_stage(&mut v, 0);
        assert_eq!(pantry(&v, 0).unwrap().items[FOOD], 6);
        assert!(supplies::cook_at(&mut v, 0));
        assert_eq!((v.food, v.meals), (33., 5));
        let p = pantry(&v, 0).unwrap();
        assert_eq!((p.items[FOOD], p.items[MEALS]), (3, 5));
        assert_eq!(
            v.logistics
                .as_ref()
                .unwrap()
                .stores
                .iter()
                .find(|p| p.owner == Owner::Camp)
                .unwrap()
                .items[MEALS],
            0
        );
        conserved(&v);
    }
    #[test]
    fn meals_are_claimed_at_a_real_store_and_cannot_be_eaten_remotely() {
        let mut g = kitchen();
        let mut r = resident(&mut g, 0);
        let mut v = g.app.world_mut().resource_mut::<Village>();
        fixture_stage(&mut v, 0);
        assert!(supplies::cook_at(&mut v, 0));
        r.task = "eat".into();
        r.remaining = 5.;
        r.hunger = 80.;
        r.x = CAMP.0;
        r.y = CAMP.1;
        assert!(assign(&mut r, &v));
        assert_eq!(r.activity_material, Some(MEALS));
        assert!(!eat(&mut v, &mut r));
        assert_eq!(v.meals, 5);
        r.x = r.target_x;
        r.y = r.target_y;
        assert!(eat(&mut v, &mut r));
        assert_eq!((v.meals, r.hunger), (4, 15.));
        assert!(!eat(&mut v, &mut r));
        assert_eq!(v.meals, 4);
        conserved(&v);
    }
    #[test]
    fn a_full_kitchen_preserves_inputs_and_two_residents_cannot_claim_one_portion() {
        let mut g = kitchen();
        let mut a = resident(&mut g, 0);
        let mut b = resident(&mut g, 1);
        let mut v = g.app.world_mut().resource_mut::<Village>();
        logistics::fixture_stock(&mut v, FOOD, 3);
        fixture_stage(&mut v, 0);
        assert!(logistics::receive(&mut v, Owner::Pantry(0), MEALS, 57));
        assert!(!supplies::cook_at(&mut v, 0));
        assert_eq!((v.food, v.meals), (3., 57));
        logistics::fixture_stock(&mut v, FOOD, 1);
        logistics::fixture_stock(&mut v, MEALS, 0);
        a.x = CAMP.0;
        a.y = CAMP.1;
        a.task = "eat".into();
        a.remaining = 5.;
        b.x = CAMP.0;
        b.y = CAMP.1;
        b.task = "eat".into();
        b.remaining = 5.;
        assert!(assign(&mut a, &v));
        v.workforce_peers[0] = Some(a);
        assert!(!assign(&mut b, &v));
        assert_eq!(economy::free(&v, FOOD), 0);
        conserved(&v);
    }
    #[test]
    fn sales_and_gatherings_cannot_spend_reserved_food_even_immediately_after_reload() {
        let mut g = Game::new();
        g.start_mode("sandbox");
        assert_eq!(g.place("warehouse", 5, 5), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.mode = modes::Mode::Story;
            logistics::fixture_stock(&mut v, FOOD, 0);
            assert!(logistics::receive(&mut v, Owner::Warehouse(0), FOOD, 40));
        }
        assert_eq!(g.queue_building_work(0, "move", 15, 18), "ok");
        let before = g.snapshot();
        assert_ne!(g.sell_surplus(1), "ok");
        assert_ne!(g.exchange_parts(), "ok");
        assert_eq!(g.snapshot(), before);
        let mut g = Game::new();
        g.start_mode("sandbox");
        assert_eq!(g.place("square", 5, 5), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.mode = modes::Mode::Story;
            v.minutes = 540.;
            v.arrived = true;
            logistics::fixture_stock(&mut v, FOOD, 0);
            logistics::fixture_stock(&mut v, MEALS, 5);
        }
        {
            let mut v = g.app.world().resource::<Village>().clone();
            let mut q = g.app.world_mut().query::<&mut Resident>();
            for mut r in q.iter_mut(g.app.world_mut()) {
                r.energy = 90.;
                r.hunger = 10.;
                crate::assign(&mut r, &v, "eat", "test", false);
                v.workforce_peers[r.id] = Some(r.clone());
            }
        }
        let before = g.snapshot();
        assert!(g.restore(&before));
        assert_eq!(economy::free(g.app.world().resource::<Village>(), MEALS), 0);
        assert_ne!(g.host_gathering(), "ok");
        assert_eq!(g.snapshot(), before);
    }
    #[test]
    fn a_blocked_meal_route_releases_its_store_claim_and_can_reload() {
        let mut g = Game::new();
        let v = g.app.world().resource::<Village>().clone();
        {
            let mut q = g.app.world_mut().query::<&mut Resident>();
            let mut r = q.iter_mut(g.app.world_mut()).find(|r| r.id == 0).unwrap();
            crate::assign(&mut r, &v, "eat", "test", true);
            assert!(r.activity_store.is_some());
            walking::block(&v, &mut r, "The route is blocked.");
            assert!(r.activity_store.is_none());
            assert!(r.activity_material.is_none());
        }
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_eq!(g.snapshot(), saved);
    }
    #[test]
    fn authored_stock_summaries_are_derived_after_bootstrap_and_bought_eggs_reload() {
        let mut g = Game::new();
        let mut authored: serde_json::Value = serde_json::from_str(&g.snapshot()).unwrap();
        authored["village"]["version"] = 3.into();
        authored["village"]["logistics"] = serde_json::Value::Null;
        authored["village"]["production"] =
            serde_json::to_value(production::State::default()).unwrap();
        authored["village"]["simulation"]["materials"] = serde_json::Value::Null;
        authored["village"]["food"] = 80.into();
        authored["village"]["meals"] = 10.into();
        assert!(g.restore(&authored.to_string()));
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_eq!(g.snapshot(), saved);
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            assert!(logistics::receive(&mut v, Owner::Camp, EGGS, 100));
        }
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_eq!(g.snapshot(), saved);
    }
    #[test]
    fn full_village_storage_blocks_pots_and_fresh_foraging_still_feeds_its_picker() {
        let mut g = kitchen();
        let mut r = resident(&mut g, 0);
        let mut v = g.app.world_mut().resource_mut::<Village>();
        logistics::fixture_stock(&mut v, FOOD, 3);
        fixture_stage(&mut v, 0);
        let wood = economy::capacity(&v) - (economy::storage(&v) - economy::quantity(&v, 0));
        logistics::fixture_stock(&mut v, 0, wood);
        assert_eq!(economy::storage(&v), economy::capacity(&v));
        let food = v.food;
        let water = v.water;
        assert!(!supplies::cook_at(&mut v, 0));
        assert_eq!((v.food, v.water, v.meals), (food, water, 0));
        for i in 0..COUNT {
            logistics::fixture_stock(&mut v, i, 0);
        }
        logistics::fixture_stock(&mut v, 0, 600);
        r.x = 3.;
        r.y = 11.;
        r.hunger = 80.;
        r.task = "gather".into();
        assert_eq!(forage(&mut v, &mut r), 1);
        assert_eq!((v.food, r.hunger), (0., 35.));
        assert_eq!(economy::storage(&v), 600);
        assert_eq!(v.supplies.portions_eaten, 1);
        conserved(&v);
    }
    #[test]
    fn eating_from_one_ground_pile_cannot_consume_another_piles_portion() {
        let mut g = Game::new();
        let mut r = resident(&mut g, 0);
        let mut v = g.app.world_mut().resource_mut::<Village>();
        logistics::fixture_stock(&mut v, FOOD, 0);
        gather(&mut v, None, 3., 11., 1);
        gather(&mut v, None, 20., 20., 1);
        let piles: Vec<_> = v
            .logistics
            .as_ref()
            .unwrap()
            .stores
            .iter()
            .filter(|p| p.owner == Owner::Ground)
            .map(|p| p.id)
            .collect();
        r.x = 20.;
        r.y = 20.;
        r.task = "eat".into();
        r.remaining = 5.;
        assert!(assign(&mut r, &v));
        assert_eq!(r.activity_store, Some(piles[1]));
        r.x = r.target_x;
        r.y = r.target_y;
        assert!(eat(&mut v, &mut r));
        let stores = &v.logistics.as_ref().unwrap().stores;
        assert_eq!(
            stores.iter().find(|p| p.id == piles[0]).unwrap().items[FOOD],
            1
        );
        assert_eq!(
            stores.iter().find(|p| p.id == piles[1]).unwrap().items[FOOD],
            0
        );
        conserved(&v);
    }
    #[test]
    fn unreachable_food_keeps_hungry_neighbours_foraging_until_they_can_eat() {
        let mut g = Game::new();
        g.start_mode("sandbox");
        assert_eq!(g.place("warehouse", 15, 18), "ok");
        for x in [12, 14, 16, 18] {
            for y in [15, 21] {
                assert_eq!(g.place("home", x, y), "ok");
            }
        }
        for x in [12, 18] {
            for y in [17, 19] {
                assert_eq!(g.place("home", x, y), "ok");
            }
        }
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.mode = modes::Mode::Story;
            v.minutes = 540.;
            v.arrived = true;
            logistics::fixture_stock(&mut v, FOOD, 0);
            logistics::fixture_stock(&mut v, MEALS, 0);
            assert!(logistics::receive(&mut v, Owner::Warehouse(0), FOOD, 40));
        }
        {
            let mut q = g.app.world_mut().query::<&mut Resident>();
            for mut r in q.iter_mut(g.app.world_mut()) {
                r.task = "rest".into();
                r.remaining = 100.;
                r.energy = 90.;
                r.social = 90.;
                r.hunger = 0.;
                r.last_meal_slot = 0;
                r.x = 10. + (r.id as f32 - 2.) * 1.25;
                r.y = 13.;
                r.target_x = r.x;
                r.target_y = r.y;
                if r.id == 0 {
                    r.hunger = 80.;
                    r.remaining = 0.;
                }
            }
        }
        let r = resident(&mut g, 0);
        assert!(meal(g.app.world().resource::<Village>(), &r).is_none());
        for _ in 0..2400 {
            g.tick(0.25);
            if resident(&mut g, 0).hunger < 60. {
                break;
            }
        }
        assert!(
            resident(&mut g, 0).hunger < 60.,
            "Forage and eat locally while stored food remains inaccessible"
        );
        assert!(g.app.world().resource::<Village>().supplies.gathered >= 2.);
        conserved(g.app.world().resource::<Village>());
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_eq!(g.snapshot(), saved);
    }

    #[test]
    fn full_harvest_storage_leaves_food_at_its_actual_patch_and_summaries_are_validated() {
        let mut g = kitchen();
        assert_eq!(g.place("garden", 5, 10), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            logistics::fixture_finish(&mut v, 1);
            assert!(logistics::receive(&mut v, Owner::Site(1), FOOD, 150));
            let food = v.food;
            gather(&mut v, Some(1), 3., 11., 2);
            assert_eq!(v.food, food + 2.);
            assert!(
                v.logistics
                    .as_ref()
                    .unwrap()
                    .stores
                    .iter()
                    .any(|p| p.owner == Owner::Ground
                        && (p.x, p.y) == (3., 11.)
                        && p.items[FOOD] == 2)
            );
            conserved(&v);
        }
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_eq!(g.snapshot(), saved);
        for key in ["food", "meals"] {
            let mut bad: serde_json::Value = serde_json::from_str(&saved).unwrap();
            bad["village"][key] = 999.into();
            assert!(!g.restore(&bad.to_string()));
            assert_eq!(g.snapshot(), saved);
        }
    }
}
