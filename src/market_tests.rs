use super::*;

fn village(day: u32) -> Game {
    let mut g = Game::new();
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.minutes = day as f32 * 1440. + 540.;
        v.arrived = true;
        v.economy.money = 5_000_000;
        logistics::fixture_stock(&mut v, economy::FOOD, 36);
    }
    let mut people = g.app.world_mut().query::<&mut Resident>();
    for mut r in people.iter_mut(g.app.world_mut()) {
        r.task = "idle".into();
        r.energy = 95.;
        r.hunger = 10.;
        r.social = 90.;
        r.remaining = 0.;
        r.target_x = r.x;
        r.target_y = r.y;
    }
    g
}
fn chosen(g: &Game) -> (usize, u32) {
    let v = g.app.world().resource::<Village>();
    offer(v, today(v) / WEEK)
}
fn items(material: usize, units: u32) -> String {
    serde_json::to_string(&std::array::from_fn::<_, { economy::COUNT }, _>(|i| {
        if i == material { units } else { 0 }
    }))
    .unwrap()
}
fn quote(g: &Game, data: &str, pickup: bool) -> serde_json::Value {
    serde_json::from_str(&g.supply_order_quote(data, pickup)).unwrap()
}
fn view(g: &Game) -> &Village {
    g.app.world().resource::<Village>()
}
fn exact(g: &mut Game) {
    let s = g.snapshot();
    assert!(g.restore(&s));
    assert_eq!(g.snapshot(), s);
}
fn claim(g: &mut Game, material: usize, units: u32) -> u32 {
    let data = items(material, units);
    let q = quote(g, &data, false);
    assert_eq!(q["allowed"], true, "{q}");
    let id = view(g).economy.next_order;
    assert_eq!(
        g.order_supplies_quoted(&data, q["token"].as_str().unwrap()),
        "ok"
    );
    id
}
#[test]
fn seeded_prices_stay_modest_introductory_and_independent_of_queries() {
    let mut g = village(14);
    let before = g.snapshot();
    for day in 0..126 {
        let v = view(&g);
        let p = prices(v, day, true);
        for (n, base) in p.into_iter().zip(economy::PRICES) {
            assert!(n >= base * 90 / 100 && n <= base * 110 / 100);
        }
        if day < INTRO_DAYS {
            assert_eq!(p, economy::PRICES);
        }
        assert_eq!(prices(v, day, false), economy::PRICES);
        assert_eq!(prices(v, day, true), prices(v, day, true));
    }
    let first = g.supplier_report();
    g.supplier_report();
    quote(&g, &items(0, 1), false);
    assert_eq!(g.supplier_report(), first);
    assert_eq!(g.snapshot(), before);
    let futures: Vec<_> = (2..14).map(|p| offer(view(&g), p)).collect();
    g.app.world_mut().resource_mut::<Village>().simulation.seed += 1;
    assert_ne!(
        futures,
        (2..14).map(|p| offer(view(&g), p)).collect::<Vec<_>>()
    );
}
#[test]
fn finite_discount_applies_only_to_remaining_units_and_regular_goods_remain_available() {
    let mut g = village(14);
    let (material, stock) = chosen(&g);
    let data = items(material, stock + 2);
    let q = quote(&g, &data, false);
    let regular = q["terms"]["prices"][material].as_i64().unwrap();
    assert_eq!(q["terms"]["discount"]["units"], stock);
    assert_eq!(
        q["total"],
        i64::from(stock) * (regular * 90 / 100) + regular * 2 + 6000
    );
    let money = view(&g).economy.money;
    assert_eq!(
        g.order_supplies_quoted(&data, q["token"].as_str().unwrap()),
        "ok"
    );
    assert_eq!(money - view(&g).economy.money, q["total"].as_i64().unwrap());
    let regular_quote = quote(&g, &items(material, 1), false);
    assert_eq!(regular_quote["allowed"], true);
    assert!(regular_quote["terms"]["discount"].is_null());
    assert_eq!(regular_quote["total"], regular + 6000);
    assert_eq!(available(view(&g), 2), 0);
    for essential in [economy::FOOD, economy::TOOLS, 8, 9, 10, 14] {
        assert_eq!(quote(&g, &items(essential, 1), false)["allowed"], true);
    }
    exact(&mut g);
}
#[test]
fn stale_price_stock_and_delivery_confirmations_do_not_spend_or_allocate() {
    let mut g = village(14);
    let (material, stock) = chosen(&g);
    let data = items(material, 1);
    let q = quote(&g, &data, false);
    claim(&mut g, material, stock);
    let before = g.snapshot();
    assert!(
        g.order_supplies_quoted(&data, q["token"].as_str().unwrap())
            .contains("Review the basket")
    );
    assert_eq!(g.snapshot(), before);
    let q = quote(&g, &data, false);
    g.set_supplier_variation(false);
    let before = g.snapshot();
    assert_ne!(
        g.order_supplies_quoted(&data, q["token"].as_str().unwrap()),
        "ok"
    );
    assert_eq!(g.snapshot(), before);
    let mut g = village(20);
    let data = items(0, 1);
    let q = quote(&g, &data, false);
    g.app.world_mut().resource_mut::<Village>().minutes = 21. * 1440. + 540.;
    let before = g.snapshot();
    assert_ne!(
        g.order_supplies_quoted(&data, q["token"].as_str().unwrap()),
        "ok"
    );
    assert_eq!(g.snapshot(), before);
    let mut g = village(14);
    g.app.world_mut().resource_mut::<Village>().minutes = 14. * 1440. + 479.;
    let q = quote(&g, &data, false);
    g.app.world_mut().resource_mut::<Village>().minutes += 1.;
    let before = g.snapshot();
    assert_ne!(
        g.order_supplies_quoted(&data, q["token"].as_str().unwrap()),
        "ok"
    );
    assert_eq!(g.snapshot(), before);
}
#[test]
fn cancellations_refund_and_release_once_without_refreshing_a_later_weeks_offer() {
    let mut g = village(20);
    g.app.world_mut().resource_mut::<Village>().minutes = 20. * 1440. + 1430.;
    let (material, stock) = chosen(&g);
    let money = view(&g).economy.money;
    let old = claim(&mut g, material, stock);
    let paid = view(&g).economy.orders[0].paid;
    g.app.world_mut().resource_mut::<Village>().minutes = 21. * 1440. + 30.;
    let (next, quantity) = chosen(&g);
    claim(&mut g, next, quantity);
    assert_eq!(available(view(&g), 3), 0);
    assert_eq!(g.cancel_order(old), "ok");
    assert_eq!(available(view(&g), 3), 0);
    let refunded = view(&g).economy.money;
    assert!(refunded > money - paid - view(&g).economy.orders[1].paid);
    let snapshot = g.snapshot();
    assert_ne!(g.cancel_order(old), "ok");
    assert_eq!(g.snapshot(), snapshot);
    g.set_supplier_variation(false);
    g.set_supplier_variation(true);
    assert_eq!(available(view(&g), 3), 0);
    exact(&mut g);
}
#[test]
fn cancelled_current_offer_can_be_bought_again_but_never_refunded_twice() {
    let mut g = village(14);
    let (material, stock) = chosen(&g);
    let money = view(&g).economy.money;
    let id = claim(&mut g, material, stock);
    assert_eq!(g.cancel_order(id), "ok");
    assert_eq!(view(&g).economy.money, money);
    assert_eq!(available(view(&g), 2), stock);
    claim(&mut g, material, stock);
    assert_eq!(available(view(&g), 2), 0);
    let before = g.snapshot();
    assert_ne!(g.cancel_order(id), "ok");
    assert_eq!(g.snapshot(), before);
    exact(&mut g);
}
#[test]
fn promised_delivery_and_paid_prices_survive_option_changes_and_new_weeks() {
    let mut g = village(20);
    claim(&mut g, 0, 2);
    let receipt = view(&g).economy.orders[0].clone();
    let money = view(&g).economy.money;
    g.set_supplier_variation(false);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.minutes = receipt.dispatch;
        economy::advance(&mut v, 0.);
        assert_eq!(v.economy.orders[0].status, "dispatched");
        assert_eq!(v.economy.orders[0].arrival, receipt.arrival);
        v.minutes = 28. * 1440. + 540.;
        freshness::advance(&mut v);
        economy::advance(&mut v, 0.);
    }
    assert_eq!(view(&g).economy.orders[0].paid, receipt.paid);
    assert_eq!(view(&g).economy.orders[0].terms, receipt.terms);
    assert_eq!(view(&g).economy.money, money);
    let wood = view(&g).wood;
    economy::advance(&mut g.app.world_mut().resource_mut::<Village>(), 0.);
    assert_eq!(view(&g).wood, wood);
    exact(&mut g);
}
#[test]
fn freight_delays_are_announced_bounded_and_fixed_in_receipts() {
    let mut g = village(14);
    let day = (14..100)
        .find(|d| {
            delivery(view(&g), *d as f32 * 1440. + 600., true)
                > delivery(view(&g), *d as f32 * 1440. + 600., false)
        })
        .unwrap();
    g.app.world_mut().resource_mut::<Village>().minutes = day as f32 * 1440. + 540.;
    freshness::advance(&mut g.app.world_mut().resource_mut::<Village>());
    let data = items(8, 1);
    let q = quote(&g, &data, false);
    let due = q["terms"]["arrival"].as_f64().unwrap() as f32;
    let base = delivery(view(&g), view(&g).minutes + 120., false);
    assert_eq!(due, base + 1440.);
    assert_eq!(
        g.order_supplies_quoted(&data, q["token"].as_str().unwrap()),
        "ok"
    );
    g.set_supplier_variation(false);
    g.app.world_mut().resource_mut::<Village>().climate.enabled = false;
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.minutes = base;
        economy::advance(&mut v, 0.);
        assert_eq!(v.economy.orders[0].status, "dispatched");
        v.minutes = due;
        economy::advance(&mut v, 0.);
        assert_eq!(v.economy.orders[0].status, "delivered");
    }
    exact(&mut g);
}
#[test]
fn switching_to_a_real_pickup_keeps_prices_and_discount_and_only_refunds_the_fee() {
    let mut g = village(14);
    let (material, stock) = chosen(&g);
    let id = claim(&mut g, material, stock);
    let before = view(&g).economy.orders[0].clone();
    let money = view(&g).economy.money;
    assert_eq!(g.collect_order(id, 0), "ok");
    assert_eq!(view(&g).economy.money, money + 4000);
    let after = &view(&g).economy.orders[0];
    assert_eq!(after.paid, before.paid - 4000);
    assert_eq!(
        after.terms.as_ref().unwrap().prices,
        before.terms.as_ref().unwrap().prices
    );
    assert_eq!(
        after.terms.as_ref().unwrap().discount,
        before.terms.as_ref().unwrap().discount
    );
    assert_eq!(available(view(&g), 2), 0);
    exact(&mut g);
    for _ in 0..1600 {
        g.tick(0.25);
        if view(&g).economy.orders[0].status == "delivered" {
            break;
        }
    }
    assert_eq!(view(&g).economy.orders[0].status, "delivered");
    assert_eq!(view(&g).economy.orders[0].paid, before.paid - 4000);
    exact(&mut g);
    let accounts: serde_json::Value = serde_json::from_str(&g.simulation_report()).unwrap();
    assert!(
        accounts["materials"]
            .as_array()
            .unwrap()
            .iter()
            .all(|m| m["difference"].as_f64() == Some(0.))
    );
}
#[test]
fn directly_quoted_pickup_and_saved_continuations_use_the_same_agreed_terms() {
    let mut g = village(14);
    let data = items(8, 2);
    let q = quote(&g, &data, true);
    assert_eq!(
        g.order_supplies_pickup_quoted(&data, 1, q["token"].as_str().unwrap()),
        "ok"
    );
    for _ in 0..100 {
        g.tick(0.25);
    }
    let saved = g.snapshot();
    let mut copy = Game::new();
    assert!(copy.restore(&saved));
    assert_eq!(copy.snapshot(), saved);
    for _ in 0..500 {
        g.tick(0.25);
        copy.tick(0.25);
    }
    assert_eq!(copy.snapshot(), g.snapshot());
    assert_eq!(
        view(&g).economy.orders[0].paid,
        q["total"].as_i64().unwrap()
    );
}
#[test]
fn pruning_paid_order_history_does_not_restock_the_current_offer() {
    let mut g = village(14);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        for i in 0..economy::COUNT {
            logistics::fixture_stock(&mut v, i, 0);
        }
        v.minutes = 14. * 1440. + 479.;
    }
    let (material, stock) = chosen(&g);
    claim(&mut g, material, stock);
    let other = if material == 2 { 3 } else { 2 };
    for _ in 0..99 {
        claim(&mut g, other, 1);
    }
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.minutes = v.economy.orders[0].arrival;
        economy::advance(&mut v, 0.);
    }
    assert_eq!(view(&g).economy.orders.len(), 100);
    claim(&mut g, other, 1);
    assert!(view(&g).economy.orders.iter().all(|o| o.id != 0));
    assert_eq!(available(view(&g), 2), 0);
    assert!(quote(&g, &items(material, 1), false)["terms"]["discount"].is_null());
    exact(&mut g);
}
#[test]
fn invalid_receipts_and_offer_counters_fail_atomically() {
    let mut g = village(14);
    let (material, stock) = chosen(&g);
    claim(&mut g, material, stock);
    let saved = g.snapshot();
    let mutations: [(&str, serde_json::Value); 8] = [
        ("schema", 9.into()),
        ("used", (stock + 1).into()),
        ("last_period", 99.into()),
        ("used", 0.into()),
        ("price", 1.into()),
        ("paid", 1.into()),
        ("arrival", 999999.into()),
        ("material", 999.into()),
    ];
    for (field, value) in mutations {
        let mut bad: serde_json::Value = serde_json::from_str(&saved).unwrap();
        match field {
            "price" => bad["village"]["economy"]["orders"][0]["terms"]["prices"][0] = value,
            "paid" | "arrival" => bad["village"]["economy"]["orders"][0][field] = value,
            "material" => {
                bad["village"]["economy"]["orders"][0]["terms"]["discount"][field] = value
            }
            _ => bad["village"]["market"][field] = value,
        };
        assert!(!g.restore(&bad.to_string()), "{field}");
        assert_eq!(g.snapshot(), saved);
    }
}
#[test]
fn introductory_and_steady_sandbox_orders_keep_the_existing_prices_and_calendar() {
    let mut g = Game::new();
    assert!(view(&g).market.enabled);
    assert_eq!(
        terms(view(&g), [1; economy::COUNT], false).prices,
        economy::PRICES
    );
    assert!(g.start_fixture_mode("sandbox"));
    assert!(!view(&g).market.enabled);
    g.set_supplier_variation(true);
    let early = terms(view(&g), [1; economy::COUNT], false);
    assert!(early.active && early.discount.is_some());
    assert_ne!(early.prices, economy::PRICES);
    exact(&mut g);
    g.set_supplier_variation(false);
    g.app.world_mut().resource_mut::<Village>().minutes = 40. * 1440. + 540.;
    let before = terms(view(&g), [1; economy::COUNT], false);
    assert_eq!(before.prices, economy::PRICES);
    assert!(before.discount.is_none());
    assert_eq!(before.arrival, Some(41. * 1440. + 600.));
    g.set_supplier_variation(true);
    assert_ne!(
        terms(view(&g), [1; economy::COUNT], false).prices,
        before.prices
    );
    g.set_supplier_variation(false);
    assert_eq!(terms(view(&g), [1; economy::COUNT], false), before);
    exact(&mut g);
}
