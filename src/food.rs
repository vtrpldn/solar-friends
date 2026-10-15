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
        logistics::pickup_reserved(v, p.id, material) + held(v, p.id, material, resident),
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
        "kitchen" if v.meals < 8 => {
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
pub fn gather(v: &mut Village, building: Option<usize>, x: f32, y: f32, amount: u32) {
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
        return;
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
    simulation::material_change(v, FOOD, amount, true);
    logistics::sync_totals(v);
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
            if available(v, p, material, Some(r.id)) > 0 {
                choices.push((
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
    choices.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.total_cmp(&b.1)).then(a.2.cmp(&b.2)));
    choices.first().map(|p| (p.3, p.4, p.5))
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
    let owner = store.owner;
    let i = r.activity_material.unwrap();
    // Consume this resident's saved claim before synchronising the global summary.
    logistics::spend(v, Some(owner), i, 1);
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
    fn full_harvest_storage_leaves_food_at_its_actual_patch_and_summaries_are_validated() {
        let mut g = kitchen();
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            let food = v.food;
            gather(&mut v, None, 3., 11., 2);
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
