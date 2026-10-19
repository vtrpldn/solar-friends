//! Located planting stock. Vegetable starts are optional; forestry stock is required.
use crate::*;
use economy::{BAMBOO_STARTS, SEEDLINGS, TREE_STARTS};
use logistics::Owner;

pub fn required(v: &Village, index: usize) -> Option<(usize, u32)> {
    let s = v.economy.sources.get(index)?;
    if !s.active || s.material >= 2 || s.planted || !(s.auto_replant || s.plant_requested) {
        return None;
    }
    match s.material {
        0 => Some((TREE_STARTS, 4)),
        1 if s.harvests == 0 => Some((BAMBOO_STARTS, 1)),
        _ => None,
    }
}
pub fn ready(v: &Village, index: usize) -> bool {
    required(v, index).is_none_or(|(i, n)| organics::available(v, Owner::Source(index), i) >= n)
}
pub fn needs(v: &Village, owner: Owner, items: &mut economy::Bundle) {
    if let Owner::Source(index) = owner {
        if let Some((i, n)) = required(v, index) {
            items[i] = n;
        }
    } else if let Owner::Site(id) = owner
        && building_work::job(v, id).is_none()
        && v.buildings
            .iter()
            .any(|b| b.id == id && b.kind == "garden" && b.progress >= 100. && b.crop.replant)
    {
        items[SEEDLINGS] = 1;
    }
}
pub fn held(v: &Village, owner: Owner, i: usize) -> u32 {
    if let Owner::Source(index) = owner
        && let Some((material, n)) = required(v, index)
        && i == material
    {
        n
    } else {
        0
    }
}
pub fn reserved(v: &Village, i: usize) -> u32 {
    let needed: u32 = (0..v.economy.sources.len())
        .filter_map(|index| required(v, index))
        .filter(|(material, _)| *material == i)
        .map(|(_, n)| n)
        .sum();
    needed.min(economy::quantity(v, i))
}
pub fn unclaimed(v: &Village, i: usize) -> u32 {
    let Some(s) = &v.logistics else {
        return 0;
    };
    (0..v.economy.sources.len())
        .filter_map(|index| {
            let (material, n) = required(v, index)?;
            if material != i {
                return None;
            }
            let p = s.stores.iter().find(|p| p.owner == Owner::Source(index))?;
            let incoming: u32 = s
                .shipments
                .iter()
                .filter(|h| h.to == p.id && h.material == i)
                .map(|h| h.amount)
                .sum();
            Some(n.saturating_sub(p.items[i] + incoming))
        })
        .sum()
}
pub fn consume(v: &mut Village, index: usize) {
    if let Some((i, n)) = required(v, index) {
        logistics::spend(v, Some(Owner::Source(index)), i, n);
    }
}
pub fn return_surplus(v: &Village, owner: Owner, i: usize, n: u32) -> bool {
    !(i == SEEDLINGS
        && n <= 4
        && matches!(owner,Owner::Site(id) if building_work::job(v,id).is_none() && v.buildings.iter().any(|b|b.id==id&&b.kind=="greenhouse"&&b.progress>=100.)))
}
pub fn raise(v: &mut Village, index: usize, growing_minutes: f32) {
    let b = &v.buildings[index];
    if b.kind != "greenhouse"
        || b.progress < 100.
        || !b.crop.planted
        || building_work::job(v, b.id).is_some()
    {
        return;
    }
    let owner = Owner::Site(b.id);
    let mut progress = b.crop.nursery + growing_minutes;
    while progress >= 480. {
        if economy::quantity(v, SEEDLINGS) + economy::incoming(v, SEEDLINGS) >= 12
            || organics::available(v, owner, SEEDLINGS) >= 4
            || logistics::room(v, owner) == 0
            || economy::capacity(v) <= economy::storage(v)
        {
            progress = 480.;
            break;
        }
        if !logistics::receive(v, owner, SEEDLINGS, 1) {
            progress = 480.;
            break;
        }
        v.progress.seedlings_raised = v.progress.seedlings_raised.saturating_add(1);
        progress -= 480.;
    }
    v.buildings[index].crop.nursery = progress;
}

#[cfg(test)]
mod tests {
    use super::*;
    fn greenhouse() -> Game {
        let mut g = Game::new();
        g.start_fixture_mode("sandbox");
        assert_eq!(g.place("greenhouse", 5, 5), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.buildings[0].crop.planted = true;
            land::water_plot(&mut v, 2, 5, 5, 1.);
        }
        g
    }
    fn checkpoint(g: &mut Game) {
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_eq!(g.snapshot(), saved);
    }
    #[test]
    fn marking_a_plot_does_not_plant_water_or_spend_its_stock() {
        let mut g = Game::new();
        crate::water::fixture_fresh(&mut g.app.world_mut().resource_mut::<Village>(), 0.);
        assert_eq!(g.place_source(0, 5, 5), "ok");
        let v = g.app.world().resource::<Village>();
        let s = &v.economy.sources[0];
        assert!(!s.planted);
        assert_eq!(s.growth, 0.);
        assert_eq!(s.moisture, 0.);
        assert_eq!(v.water, 0.);
        assert_eq!(economy::quantity(v, TREE_STARTS), 4);
        assert_eq!(organics::available(v, Owner::Source(0), TREE_STARTS), 0);
        assert_eq!(required(v, 0), Some((TREE_STARTS, 4)));
        assert!(!resource_sites::care(v, 0));
        checkpoint(&mut g);
    }
    #[test]
    fn forestry_requires_delivered_stock_and_commits_it_once_without_a_second_charge() {
        let mut g = Game::new();
        assert_eq!(g.place_source(0, 5, 5), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            let funds = v.economy.money;
            assert!(!resource_sites::finish(&mut v, 0));
            organics::fixture_transfer(&mut v, Owner::Source(0), TREE_STARTS, 4);
            assert_eq!(economy::free(&v, TREE_STARTS), 0);
            crate::water::fixture_at(
                &mut v,
                crate::water::Owner::Source(0),
                crate::water::Class::Fresh,
                2.,
            );
            assert!(resource_sites::finish(&mut v, 0));
            assert!(!resource_sites::finish(&mut v, 0));
            assert_eq!(v.economy.money, funds);
            assert_eq!(economy::quantity(&v, TREE_STARTS), 0);
            assert!(v.economy.sources[0].planted);
            assert!(!v.progress.timber_replanted);
            assert_eq!(
                v.simulation.materials.as_ref().unwrap().spent[TREE_STARTS],
                4
            );
        }
        checkpoint(&mut g);
    }
    #[test]
    fn nursery_output_stays_at_its_greenhouse_and_waits_at_its_reserve() {
        let mut g = greenhouse();
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            raise(&mut v, 0, 2400.);
            assert_eq!(v.seedlings, 4);
            assert_eq!(organics::available(&v, Owner::Site(0), SEEDLINGS), 4);
            assert_eq!(organics::available(&v, Owner::Camp, SEEDLINGS), 0);
            assert_eq!(v.buildings[0].crop.nursery, 480.);
            assert_eq!(v.progress.seedlings_raised, 4);
            raise(&mut v, 0, 480.);
            assert_eq!(v.seedlings, 4);
        }
        checkpoint(&mut g);
    }
    #[test]
    fn a_full_nursery_store_retains_ready_growth_until_output_room_opens() {
        let mut g = greenhouse();
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            logistics::fixture_stock(&mut v, 0, 0);
            logistics::fixture_stock(&mut v, 1, 0);
            logistics::fixture_stock(&mut v, 2, 150);
            organics::fixture_transfer(&mut v, Owner::Site(0), 2, 150);
            raise(&mut v, 0, 480.);
            assert_eq!(v.seedlings, 0);
            assert_eq!(v.buildings[0].crop.nursery, 480.);
            logistics::spend(&mut v, Some(Owner::Site(0)), 2, 1);
            raise(&mut v, 0, 0.);
            assert_eq!(v.seedlings, 1);
            assert_eq!(v.progress.seedlings_raised, 1);
            assert_eq!(v.buildings[0].crop.nursery, 0.);
        }
        checkpoint(&mut g);
    }
    #[test]
    fn closing_a_greenhouse_stops_new_seedlings_without_erasing_its_existing_stock() {
        let mut g = greenhouse();
        raise(&mut g.app.world_mut().resource_mut::<Village>(), 0, 480.);
        assert_eq!(g.queue_building_work(0, "move", 18, 18), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            raise(&mut v, 0, 480.);
            assert_eq!(v.seedlings, 1);
        }
        checkpoint(&mut g);
    }
    #[test]
    fn seedling_summary_cannot_be_forged_or_mint_remote_goods() {
        let mut g = greenhouse();
        raise(&mut g.app.world_mut().resource_mut::<Village>(), 0, 480.);
        let saved = g.snapshot();
        let mut bad: serde_json::Value = serde_json::from_str(&saved).unwrap();
        bad["village"]["seedlings"] = 12.into();
        assert!(!g.restore(&bad.to_string()));
        assert_eq!(g.snapshot(), saved);
    }
}
