use super::*;
use logistics::Owner;

fn empty() -> Game {
    let mut g = Game::new();
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.arrived = true;
        v.minutes = 540.;
        crate::water::fixture_fresh(&mut v, 40.);
        v.progress.completed = [true; 4];
        v.production.targets = [0; COUNT];
        for i in [FOOD, MEALS, EGGS] {
            logistics::fixture_stock(&mut v, i, 0);
        }
    }
    for mut r in g
        .app
        .world_mut()
        .query::<&mut Resident>()
        .iter_mut(g.app.world_mut())
    {
        r.task = "idle".into();
        r.remaining = 0.;
        r.requested = false;
        r.hunger = 0.;
        r.energy = 90.;
        r.social = 90.;
        r.last_meal_slot = 0;
    }
    g
}
fn checkpoint(g: &mut Game) {
    let saved = g.snapshot();
    assert!(g.restore(&saved), "invalid dated-food checkpoint: {saved}");
    assert_eq!(saved, g.snapshot());
}
fn camp(v: &Village) -> &logistics::Store {
    v.logistics
        .as_ref()
        .unwrap()
        .stores
        .iter()
        .find(|p| p.owner == Owner::Camp)
        .unwrap()
}
fn conserved(v: &Village) {
    assert!(
        simulation::view(v)["materials"]
            .as_array()
            .unwrap()
            .iter()
            .all(|m| m["difference"] == 0.)
    );
}

#[test]
fn fifo_consumption_and_refunds_preserve_the_exact_dates_of_mixed_lots() {
    let mut g = empty();
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(logistics::receive(&mut v, Owner::Camp, FOOD, 4));
        v.minutes += 60.;
        assert!(logistics::receive(&mut v, Owner::Camp, FOOD, 3));
        let original = camp(&v).food_lots.clone();
        let taken = logistics::take(&mut v, Some(Owner::Camp), FOOD, 5);
        assert_eq!(
            taken.iter().map(|l| l.amount).collect::<Vec<_>>(),
            vec![4, 1]
        );
        assert_eq!(taken[0].produced, 540.);
        assert_eq!(taken[1].produced, 600.);
        assert_eq!(camp(&v).food_lots[0].amount, 2);
        assert!(logistics::receive_preserved(
            &mut v,
            Owner::Camp,
            FOOD,
            taken
        ));
        assert_eq!(camp(&v).food_lots, original);
        conserved(&v);
    }
    checkpoint(&mut g);
}
#[test]
fn village_spending_uses_older_lots_at_other_stores_before_a_newer_lot_at_the_first_store() {
    let mut g = empty();
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(logistics::receive(&mut v, Owner::Camp, FOOD, 2));
        v.minutes = 600.;
        assert!(logistics::receive(&mut v, Owner::Camp, FOOD, 3));
        logistics::create(&mut v, Owner::Ground, 4., 4., 12).unwrap();
        assert!(logistics::receive_preserved(
            &mut v,
            Owner::Ground,
            FOOD,
            vec![Lot {
                material: FOOD,
                amount: 2,
                produced: 570.,
                expires: 6330.
            }]
        ));
        let taken = logistics::take(&mut v, None, FOOD, 4);
        assert_eq!(
            taken
                .iter()
                .map(|l| (l.produced, l.amount))
                .collect::<Vec<_>>(),
            vec![(540., 2), (570., 2)]
        );
        assert_eq!(camp(&v).items[FOOD], 3);
        assert_eq!(camp(&v).food_lots[0].produced, 600.);
        conserved(&v);
    }
    checkpoint(&mut g);
}
#[test]
fn residents_skip_portions_that_will_spoil_before_they_can_walk_and_eat() {
    let mut g = empty();
    let mut r = g
        .app
        .world_mut()
        .query::<&Resident>()
        .iter(g.app.world())
        .next()
        .unwrap()
        .clone();
    r.x = CAMP.0;
    r.y = CAMP.1;
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.minutes = 6300.;
        assert!(logistics::receive_preserved(
            &mut v,
            Owner::Camp,
            FOOD,
            vec![Lot {
                material: FOOD,
                amount: 2,
                produced: 540.5,
                expires: 6300.5
            }]
        ));
        let fresh = logistics::create(&mut v, Owner::Ground, 12., 13., 12).unwrap();
        assert!(logistics::receive(&mut v, Owner::Ground, FOOD, 2));
        assert_eq!(food::meal(&v, &r).unwrap().0, fresh);
    }
    checkpoint(&mut g);
}
#[test]
fn expiration_removes_owned_food_once_and_survives_an_exact_reload() {
    let mut g = empty();
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(logistics::receive(&mut v, Owner::Camp, FOOD, 4));
        v.minutes = 540. + lifetime(FOOD).unwrap();
        advance(&mut v);
        assert_eq!(v.food, 0.);
        assert_eq!(v.freshness.expired[FOOD], 4);
        assert_eq!(v.simulation.materials.as_ref().unwrap().spent[FOOD], 4);
        advance(&mut v);
        assert_eq!(v.freshness.expired[FOOD], 4);
        conserved(&v);
    }
    checkpoint(&mut g);
}
fn cargo() -> (Game, usize) {
    let mut g = empty();
    logistics::fixture_stock(&mut g.app.world_mut().resource_mut::<Village>(), FOOD, 36);
    assert_eq!(g.place("kitchen", 6, 6), "ok");
    logistics::fixture_finish(&mut g.app.world_mut().resource_mut::<Village>(), 0);
    for _ in 0..1000 {
        let v = g.app.world().resource::<Village>();
        if let Some(resident) = v
            .logistics
            .as_ref()
            .unwrap()
            .shipments
            .iter()
            .find(|h| h.material == FOOD && h.carrying)
            .map(|h| h.resident)
        {
            return (g, resident);
        }
        g.tick(0.25);
    }
    panic!("ingredient delivery did not leave the store");
}
#[test]
fn walking_and_putting_down_cargo_cannot_refresh_food() {
    let (mut g, resident) = cargo();
    let r = g
        .app
        .world_mut()
        .query::<&Resident>()
        .iter(g.app.world())
        .find(|r| r.id == resident)
        .unwrap()
        .clone();
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        let lots = v
            .logistics
            .as_ref()
            .unwrap()
            .shipments
            .iter()
            .find(|h| h.resident == resident)
            .unwrap()
            .food_lots
            .clone();
        assert_eq!(lots[0].produced, 540.);
        logistics::interrupt(&mut v, &r);
        let recovered = v
            .logistics
            .as_ref()
            .unwrap()
            .stores
            .iter()
            .find(|p| p.owner == Owner::Ground && p.items[FOOD] > 0)
            .unwrap();
        assert_eq!(recovered.food_lots, lots);
        conserved(&v);
    }
    checkpoint(&mut g);
}
#[test]
fn partial_spoilage_in_transit_shrinks_the_load_without_creating_or_losing_fresh_food() {
    let (mut g, resident) = cargo();
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.minutes = 6300.;
        fixture_reseed(&mut v);
        let h = v
            .logistics
            .as_mut()
            .unwrap()
            .shipments
            .iter_mut()
            .find(|h| h.resident == resident)
            .unwrap();
        let n = h.amount;
        assert!(n >= 2);
        h.food_lots = vec![
            Lot {
                material: FOOD,
                amount: 1,
                produced: 540.5,
                expires: 6300.5,
            },
            Lot {
                material: FOOD,
                amount: n - 1,
                produced: 6300.,
                expires: 12060.,
            },
        ];
        v.minutes = 6300.75;
        advance(&mut v);
        let h = v
            .logistics
            .as_ref()
            .unwrap()
            .shipments
            .iter()
            .find(|h| h.resident == resident)
            .unwrap();
        assert_eq!(h.amount, n - 1);
        assert_eq!(amount(&h.food_lots, FOOD), n - 1);
        assert_eq!(v.freshness.expired[FOOD], 1);
        conserved(&v);
    }
    checkpoint(&mut g);
}
#[test]
fn spoiled_committed_inputs_cancel_the_pot_and_return_only_fresh_inputs_and_gas() {
    let mut g = empty();
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.minutes = 6300.;
        v.supplies.use_eggs = true;
        v.circular.use_biogas = true;
        v.circular.biogas = 3.;
        logistics::fixture_stock(&mut v, FOOD, 2);
        logistics::fixture_stock(&mut v, EGGS, 2);
    }
    assert_eq!(g.place("kitchen", 6, 6), "ok");
    let mut r = g
        .app
        .world_mut()
        .query::<&Resident>()
        .iter(g.app.world())
        .next()
        .unwrap()
        .clone();
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        logistics::fixture_finish(&mut v, 0);
        food::fixture_stage(&mut v, 0);
        let id = production::order_meals(&mut v, Some(0)).unwrap();
        assert!(production::assign_batch(&mut r, &v, id));
        (r.x, r.y) = (r.target_x, r.target_y);
        assert!(!production::work(&mut v, &r, 3.));
        assert_eq!(v.circular.biogas, 2.);
        let b = v
            .production
            .batches
            .iter_mut()
            .find(|b| b.id == id)
            .unwrap();
        let ingredients = b.food_lots.iter_mut().find(|l| l.material == FOOD).unwrap();
        ingredients.produced = 540.5;
        ingredients.expires = 6300.5;
        v.minutes = 6300.75;
        advance(&mut v);
        let b = production::batch(&v, id).unwrap();
        assert_eq!(b.phase, production::Phase::Cancelled);
        assert!(b.spoiled);
        assert_eq!(v.food, 0.);
        assert_eq!(v.meals, 0);
        assert_eq!(v.supplies.eggs, 2);
        assert_eq!(v.circular.biogas, 3.);
        assert_eq!(v.production.accounting.inputs, [0; COUNT]);
        assert_eq!(v.freshness.expired[FOOD], 2);
        assert_eq!(
            v.simulation.materials.as_ref().unwrap().spent[FOOD],
            2,
            "Committed ingredients were already spent; expiry must not spend them again"
        );
        let pantry = food::pantry(&v, 0).unwrap();
        assert_eq!(pantry.food_lots[0].material, EGGS);
        assert_eq!(pantry.food_lots[0].produced, 6300.);
        assert!(!production::cancel_batch(&mut v, id));
        conserved(&v);
    }
    checkpoint(&mut g);
}
#[test]
fn invalid_food_dates_amounts_and_summary_edits_are_rejected_atomically() {
    let mut g = empty();
    assert!(logistics::receive(
        &mut g.app.world_mut().resource_mut::<Village>(),
        Owner::Camp,
        FOOD,
        4
    ));
    let before = g.snapshot();
    for (field, value) in [
        ("amount", serde_json::json!(5)),
        ("produced", serde_json::json!(600)),
        ("expires", serde_json::json!(99999)),
    ] {
        let mut bad: serde_json::Value = serde_json::from_str(&before).unwrap();
        bad["village"]["logistics"]["stores"][0]["food_lots"][0][field] = value;
        assert!(!g.restore(&bad.to_string()));
        assert_eq!(g.snapshot(), before);
    }
}

#[test]
fn gathered_neighbours_cannot_serve_expired_portions_or_receive_shared_meal_rewards() {
    let mut g = empty();
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.minutes = 6300.;
        assert!(logistics::receive(&mut v, Owner::Camp, MEALS, 5));
    }
    assert_eq!(g.place("square", 6, 6), "ok");
    logistics::fixture_finish(&mut g.app.world_mut().resource_mut::<Village>(), 0);
    assert_eq!(g.host_gathering(), "ok");
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        gatherings::fixture_table(&mut v);
        let table = v.progress.gathering_delivery.as_ref().unwrap().store;
        let lot = &mut v
            .logistics
            .as_mut()
            .unwrap()
            .stores
            .iter_mut()
            .find(|p| p.id == table)
            .unwrap()
            .food_lots[0];
        lot.produced = 1980.5;
        lot.expires = 6300.5;
        assert!(gatherings::advance(
            &mut v,
            &[0, 1, 2, 3, 4].into_iter().collect()
        ));
        v.minutes = 6300.75;
        advance(&mut v);
        v.progress.attended = [0, 1, 2].into_iter().collect();
        gatherings::advance(&mut v, &[0, 1, 2, 3, 4].into_iter().collect());
        assert!(!gatherings::served(&v));
        assert_eq!(v.meals, 0);
        assert_eq!(v.supplies.portions_eaten, 0);
        assert_eq!(v.freshness.expired[MEALS], 5);
        gatherings::finish(&mut v, false);
        let p = v.progress.gathering_delivery.as_ref().unwrap();
        assert_eq!(p.phase, gatherings::Phase::Failed);
        assert_eq!(p.attended.len(), 3);
        assert_eq!(v.progress.gatherings, 0);
        assert!(v.progress.friendships.is_empty());
        conserved(&v);
    }
    checkpoint(&mut g);
}

#[test]
fn residents_prefer_a_prepared_meal_to_older_raw_ingredients() {
    let mut g = empty();
    let r = g
        .app
        .world_mut()
        .query::<&Resident>()
        .iter(g.app.world())
        .next()
        .unwrap()
        .clone();
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(logistics::receive(&mut v, Owner::Camp, FOOD, 3));
        v.minutes = 3000.;
        assert!(logistics::receive(&mut v, Owner::Camp, MEALS, 2));
        assert_eq!(food::meal(&v, &r).unwrap().1, MEALS);
    }
    checkpoint(&mut g);
}
