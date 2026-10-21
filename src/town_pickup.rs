//! Small town orders can travel home in the collective's shared pickup truck.
use crate::*;

pub const CAPACITY: u32 = 40;
pub const DRIVE_MINUTES: f32 = 120.;
pub fn drive_minutes(v: &Village) -> f32 {
    DRIVE_MINUTES / maintenance::performance(v, maintenance::Equipment::Truck).max(0.5) as f32
}
pub fn ordered_minutes(v: &Village, id: u32) -> f32 {
    v.economy
        .orders
        .iter()
        .find(|o| o.id == id)
        .and_then(|o| o.pickup_minutes)
        .unwrap_or(DRIVE_MINUTES)
}

pub fn blocker(v: &Village, r: &Resident) -> Option<String> {
    let reason = if !v.skills.people.contains_key(&r.id) {
        "Choose a resident to drive."
    } else if !v.arrived || r.task == "arrive" {
        "Wait until everyone has reached the village."
    } else if !(480.0..960.).contains(&v.minutes.rem_euclid(1440.)) {
        "Town pickups leave between 08:00 and 16:00."
    } else if maintenance::performance(v, maintenance::Equipment::Truck) <= 0. {
        "The pickup needs repair. Order a delivery or arrange its service first."
    } else if maintenance::jobs::in_service(v, maintenance::Equipment::Truck) {
        "The pickup is booked for service. Finish or cancel its maintenance first."
    } else if r.trip.is_some() {
        "Already away or commuting."
    } else if v
        .power
        .battery_jobs
        .iter()
        .any(|j| j.phase == power::batteries::Phase::Carrying && j.carrier == Some(r.id))
    {
        "Finish carrying the battery before driving."
    } else if r.task == "sleep" || sleep::due(r, v.minutes) {
        "Needs to finish sleeping."
    } else if r.energy < 40. {
        "Needs at least 40 energy to drive."
    } else if r.hunger > 65. {
        "Needs a meal before driving."
    } else if situations::protected(v, r.id, "pickup") {
        "Taking an agreed day off."
    } else if v.economy.orders.iter().any(|o| o.status == "collecting") {
        "The shared pickup truck is already in use."
    } else {
        return None;
    };
    Some(reason.into())
}

fn send_driver(g: &mut Game, id: usize) {
    let mut v = g.app.world().resource::<Village>().clone();
    {
        let mut query = g.app.world_mut().query::<&mut Resident>();
        let mut r = query
            .iter_mut(g.app.world_mut())
            .find(|r| r.id == id)
            .unwrap();
        // Finish the physical handoff in the command itself: a save or another
        // order can follow before the next tick has a chance to clean up work.
        logistics::interrupt(&mut v, &r);
        water::interrupt(&mut v, &r);
        requests::pause(&mut r);
        sleep::pause(&mut r);
        r.task = "pickup".into();
        r.requested = true;
        r.remaining = 0.;
        mobility::begin(&mut r, &v, mobility::Purpose::Pickup);
    }
    *g.app.world_mut().resource_mut::<Village>() = v;
}

pub fn finish(v: &mut Village, order: u32, driver: usize) {
    let Some(i) = v
        .economy
        .orders
        .iter()
        .position(|o| o.id == order && o.pickup_by == Some(driver) && o.status == "collecting")
    else {
        return;
    };
    let items = v.economy.orders[i].items;
    v.economy.orders[i].status = "delivered".into();
    let duration = v.economy.orders[i].pickup_minutes.unwrap_or(DRIVE_MINUTES);
    maintenance::used(v, maintenance::Equipment::Truck, f64::from(duration));
    for (material, quantity) in items.into_iter().enumerate() {
        economy::add(v, material, quantity);
    }
    v.economy.last_delivery = v.minutes;
    economy::rebalance(v);
    event(
        v,
        format!(
            "Town pickup {} is back at camp. Supplies await local distribution.",
            order + 1
        ),
    );
}

// Cross-check orders and residents so reload cannot orphan a paid pickup or
// invent a second driver carrying the same bundle.
pub fn valid(v: &Village, residents: &[Resident]) -> bool {
    let active: Vec<_> = v
        .economy
        .orders
        .iter()
        .filter(|o| o.status == "collecting")
        .collect();
    active.len() <= 1
        && active.into_iter().all(|o| {
            residents
                .iter()
                .filter(|r| {
                    r.id == o.pickup_by.unwrap_or(usize::MAX)
                        && r.trip.as_ref().is_some_and(|t| {
                            t.purpose == mobility::Purpose::Pickup
                                && t.order == Some(o.id)
                                && t.phase != mobility::Phase::Returning
                        })
                })
                .count()
                == 1
        })
}

#[wasm_bindgen]
impl Game {
    pub fn order_supplies_pickup(&mut self, data: &str, resident: usize) -> String {
        let items = match economy::parse_items(data) {
            Ok(b) => b,
            Err(e) => return e,
        };
        if items.iter().sum::<u32>() > CAPACITY {
            return "The pickup truck holds at most 40 supply units. Split the order or choose delivery.".into();
        }
        let v = self.app.world().resource::<Village>().clone();
        let mut query = self.app.world_mut().query::<&Resident>();
        let Some(r) = query.iter(self.app.world()).find(|r| r.id == resident) else {
            return "Choose a resident to drive.".into();
        };
        if let Some(reason) = blocker(&v, r) {
            return reason;
        }
        if let Err(e) = economy::place_order(
            &mut self.app.world_mut().resource_mut::<Village>(),
            items,
            Some(resident),
        ) {
            return e;
        }
        send_driver(self, resident);
        "ok".into()
    }

    pub fn collect_order(&mut self, order: u32, resident: usize) -> String {
        let v = self.app.world().resource::<Village>().clone();
        let Some(o) = v.economy.orders.iter().find(|o| o.id == order) else {
            return "Order not found.".into();
        };
        if o.status != "confirmed" {
            return "Only orders awaiting dispatch can switch to pickup.".into();
        }
        if o.items.iter().sum::<u32>() > CAPACITY {
            return "This order exceeds the truck's 40-unit capacity.".into();
        }
        let mut query = self.app.world_mut().query::<&Resident>();
        let Some(r) = query.iter(self.app.world()).find(|r| r.id == resident) else {
            return "Choose a resident to drive.".into();
        };
        if let Some(reason) = blocker(&v, r) {
            return reason;
        }
        {
            let mut village = self.app.world_mut().resource_mut::<Village>();
            let now = village.minutes;
            let duration = drive_minutes(&village);
            let o = village
                .economy
                .orders
                .iter_mut()
                .find(|o| o.id == order)
                .unwrap();
            o.pickup_by = Some(resident);
            o.status = "collecting".into();
            o.paid -= 4000;
            if let Some(t) = &mut o.terms {
                t.fee = 2000;
                t.arrival = None;
            }
            o.dispatch = now;
            o.arrival = now + duration;
            o.pickup_minutes = Some(duration);
            economy::contribute(
                &mut village,
                -4000,
                "Delivery changed to pickup: R$ 40 fee refund",
            );
        }
        send_driver(self, resident);
        "ok".into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn healthy() -> Game {
        let mut g = Game::new();
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.arrived = true;
            v.minutes = 600.;
            crate::logistics::fixture_stock(&mut v, crate::economy::FOOD, (80.) as u32);
            crate::logistics::fixture_stock(&mut v, crate::economy::MEALS, 10);
        }
        let mut query = g.app.world_mut().query::<&mut Resident>();
        for mut r in query.iter_mut(g.app.world_mut()) {
            r.task = "idle".into();
            r.activity_store = None;
            r.trip = None;
            r.energy = 90.;
            r.hunger = 10.;
            r.social = 90.;
            r.remaining = 90.;
            r.target_x = r.x;
            r.target_y = r.y;
        }
        g
    }
    fn bundle() -> String {
        let mut b = [0u32; economy::COUNT];
        b[12] = 2;
        serde_json::to_string(&b).unwrap()
    }
    fn state(g: &mut Game) -> Save {
        serde_json::from_str(&g.snapshot()).unwrap()
    }
    fn until(g: &mut Game, condition: impl Fn(&Save) -> bool) {
        for _ in 0..4000 {
            if condition(&state(g)) {
                return;
            }
            g.tick(0.25);
        }
        panic!("Pickup did not finish");
    }
    #[test]
    fn sparse_drivers_own_their_pickups_and_unknown_drivers_are_rejected() {
        let mut g = healthy();
        assert_eq!(g.order_supplies_pickup(&bundle(), 0), "ok");
        let world = g.app.world_mut();
        let mut r = world
            .query::<&Resident>()
            .iter(world)
            .find(|r| r.id == 0)
            .unwrap()
            .clone();
        r.id = 900;
        let mut v = world.resource_mut::<Village>();
        v.skills.people.insert(900, skills::Person::default());
        v.economy.orders.last_mut().unwrap().pickup_by = Some(900);
        assert!(economy::valid(&v));
        assert!(valid(&v, &[r.clone()]));
        let mut unknown = r.clone();
        unknown.id = 1200;
        assert_eq!(
            blocker(&v, &unknown).as_deref(),
            Some("Choose a resident to drive.")
        );
        let person = v.skills.people.remove(&900).unwrap();
        assert!(!economy::valid(&v));
        v.skills.people.insert(900, person);
        assert!(!valid(&v, &[unknown]));
    }
    #[test]
    fn pickup_returns_same_day_once_and_survives_each_trip_phase() {
        let mut g = healthy();
        g.set_equipment_condition(true);
        let before = state(&mut g);
        assert_eq!(g.order_supplies_pickup(&bundle(), 0), "ok");
        let leaving = state(&mut g);
        assert_eq!(
            leaving.village.economy.money,
            before.village.economy.money - 56000 - 2000
        );
        assert_eq!(economy::incoming(&leaving.village, 12), 2);
        assert_eq!(economy::quantity(&leaving.village, 12), 0);
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        until(&mut g, |s| {
            s.residents[0]
                .trip
                .as_ref()
                .is_some_and(|t| t.phase == mobility::Phase::Away)
        });
        let away = state(&mut g);
        assert!(away.village.minutes > before.village.minutes);
        assert!(
            (away.residents[0].trip.as_ref().unwrap().return_at
                - away.village.minutes
                - DRIVE_MINUTES)
                .abs()
                < 1.
        );
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        for _ in 0..100 {
            g.tick(0.25);
        }
        assert_eq!(
            economy::quantity(&state(&mut g).village, 12),
            0,
            "Supplies must travel home first"
        );
        until(&mut g, |s| {
            s.residents[0]
                .trip
                .as_ref()
                .is_some_and(|t| t.phase == mobility::Phase::Returning)
        });
        let returned = state(&mut g);
        assert!(returned.village.minutes < 1440.);
        assert_eq!(returned.village.economy.orders[0].status, "delivered");
        assert_eq!(economy::quantity(&returned.village, 12), 2);
        assert_eq!(economy::incoming(&returned.village, 12), 0);
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        until(&mut g, |s| s.residents[0].trip.is_none());
        finish(&mut g.app.world_mut().resource_mut::<Village>(), 0, 0);
        assert_eq!(
            state(&mut g)
                .village
                .maintenance
                .records
                .iter()
                .find(|r| r.equipment == maintenance::Equipment::Truck)
                .unwrap()
                .use_units,
            f64::from(DRIVE_MINUTES)
        );
        assert_eq!(
            economy::quantity(&state(&mut g).village, 12),
            2,
            "Cargo is received exactly once"
        );
    }
    #[test]
    fn pickup_interrupting_a_meal_clears_its_store_reservation_before_saving() {
        let mut g = healthy();
        let store = state(&mut g).village.logistics.unwrap().stores[0].id;
        {
            let mut query = g.app.world_mut().query::<&mut Resident>();
            let mut r = query
                .iter_mut(g.app.world_mut())
                .find(|r| r.id == 0)
                .unwrap();
            r.task = "eat".into();
            r.activity_store = Some(store);
            r.activity_material = Some(economy::FOOD);
        }
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_eq!(g.order_supplies_pickup(&bundle(), 0), "ok");
        assert!(state(&mut g).residents[0].activity_store.is_none());
        for phase in [
            mobility::Phase::Leaving,
            mobility::Phase::Away,
            mobility::Phase::Returning,
        ] {
            until(&mut g, |s| {
                s.residents[0]
                    .trip
                    .as_ref()
                    .is_some_and(|t| t.phase == phase)
            });
            let saved = g.snapshot();
            assert!(
                g.restore(&saved),
                "pickup saves must reload during {phase:?}"
            );
        }
    }
    #[test]
    fn pickup_releases_pending_and_carried_water_before_an_immediate_save() {
        for carrying in [false, true] {
            for convert in [false, true] {
                let mut g = healthy();
                {
                    let mut v = g.app.world_mut().resource_mut::<Village>();
                    water::draw(&mut v, water::Owner::Camp, water::Class::Fresh, 100.);
                }
                let v = g.app.world().resource::<Village>().clone();
                {
                    let mut q = g.app.world_mut().query::<&mut Resident>();
                    let mut r = q.iter_mut(g.app.world_mut()).find(|r| r.id == 0).unwrap();
                    assign(&mut r, &v, "water", "Bringing fresh water home.", false);
                }
                until(&mut g, |s| {
                    s.village
                        .water_supply
                        .trips
                        .iter()
                        .any(|h| h.resident == 0 && h.carrying == carrying)
                });
                let before = state(&mut g);
                let raw = g.snapshot();
                assert!(g.restore(&raw));
                if convert {
                    assert_eq!(g.order_supplies(&bundle()), "ok");
                    let id = state(&mut g).village.economy.orders.last().unwrap().id;
                    assert_eq!(g.collect_order(id, 0), "ok");
                } else {
                    assert_eq!(g.order_supplies_pickup(&bundle(), 0), "ok");
                }
                let after = state(&mut g);
                assert!(
                    after
                        .village
                        .water_supply
                        .trips
                        .iter()
                        .all(|h| h.resident != 0)
                );
                assert_eq!(
                    water::total(&after.village, water::Class::Fresh),
                    water::total(&before.village, water::Class::Fresh)
                );
                let saved = g.snapshot();
                let mut copy = Game::new();
                assert!(
                    copy.restore(&saved),
                    "pickup interruption must save without an intervening tick"
                );
                assert_eq!(copy.snapshot(), saved);
            }
        }
    }
    #[test]
    fn pickup_preserves_reserved_and_carried_materials_before_an_immediate_save() {
        for carrying in [false, true] {
            for convert in [false, true] {
                let mut g = healthy();
                assert_eq!(g.place("garden", 6, 6), "ok");
                {
                    let mut q = g.app.world_mut().query::<&mut Resident>();
                    q.iter_mut(g.app.world_mut())
                        .find(|r| r.id == 0)
                        .unwrap()
                        .remaining = 0.;
                }
                until(&mut g, |s| {
                    s.village
                        .logistics
                        .as_ref()
                        .unwrap()
                        .shipments
                        .iter()
                        .any(|h| h.resident == 0 && h.carrying == carrying)
                });
                let before = state(&mut g);
                if convert {
                    assert_eq!(g.order_supplies(&bundle()), "ok");
                    let id = state(&mut g).village.economy.orders.last().unwrap().id;
                    assert_eq!(g.collect_order(id, 0), "ok");
                } else {
                    assert_eq!(g.order_supplies_pickup(&bundle(), 0), "ok");
                }
                let after = state(&mut g);
                assert!(
                    after
                        .village
                        .logistics
                        .as_ref()
                        .unwrap()
                        .shipments
                        .iter()
                        .all(|h| h.resident != 0)
                );
                for i in 0..economy::COUNT {
                    assert_eq!(
                        economy::quantity(&after.village, i),
                        economy::quantity(&before.village, i)
                    );
                }
                let raw = g.snapshot();
                let mut copy = Game::new();
                assert!(copy.restore(&raw));
                assert_eq!(copy.snapshot(), raw);
            }
        }
    }
    #[test]
    fn delivery_conversion_refunds_fee_and_cannot_repeat_or_cancel() {
        let mut g = healthy();
        let funds = state(&mut g).village.economy.money;
        assert_eq!(g.order_supplies(&bundle()), "ok");
        assert_eq!(g.collect_order(0, 0), "ok");
        let s = state(&mut g);
        assert_eq!(s.village.economy.money, funds - 56000 - 2000);
        assert_eq!(s.village.economy.orders[0].pickup_by, Some(0));
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        let before = g.snapshot();
        assert_ne!(g.collect_order(0, 1), "ok");
        assert_ne!(g.cancel_order(0), "ok");
        assert_eq!(g.snapshot(), before);
    }
    #[test]
    fn unsafe_drivers_capacity_funds_and_busy_truck_refuse_atomically() {
        let mut g = healthy();
        let before = g.snapshot();
        let mut large = [0u32; economy::COUNT];
        large[0] = 41;
        assert_ne!(
            g.order_supplies_pickup(&serde_json::to_string(&large).unwrap(), 0),
            "ok"
        );
        assert_ne!(g.order_supplies_pickup(&bundle(), 99), "ok");
        assert_eq!(g.snapshot(), before);
        g.app
            .world_mut()
            .query::<&mut Resident>()
            .iter_mut(g.app.world_mut())
            .find(|r| r.id == 0)
            .unwrap()
            .energy = 10.;
        let before = g.snapshot();
        assert_ne!(g.order_supplies_pickup(&bundle(), 0), "ok");
        assert_eq!(g.snapshot(), before);
        assert_eq!(g.order_supplies_pickup(&bundle(), 1), "ok");
        let before = g.snapshot();
        assert_ne!(g.order_supplies_pickup(&bundle(), 2), "ok");
        assert_eq!(g.snapshot(), before);
        let mut poor = healthy();
        poor.app.world_mut().resource_mut::<Village>().economy.money = 0;
        let before = poor.snapshot();
        assert_ne!(poor.order_supplies_pickup(&bundle(), 0), "ok");
        assert_eq!(poor.snapshot(), before);
        let mut late = healthy();
        late.app.world_mut().resource_mut::<Village>().minutes = 1080.;
        let before = late.snapshot();
        assert_ne!(late.order_supplies_pickup(&bundle(), 0), "ok");
        assert_eq!(late.snapshot(), before);
    }
    #[test]
    fn orphaned_or_mismatched_pickup_saves_are_rejected_atomically() {
        let mut g = healthy();
        assert_eq!(g.order_supplies_pickup(&bundle(), 0), "ok");
        let original = g.snapshot();
        let mut bad: serde_json::Value = serde_json::from_str(&original).unwrap();
        bad["residents"][0]["trip"] = serde_json::Value::Null;
        bad["residents"][0]["task"] = "idle".into();
        assert!(!g.restore(&bad.to_string()));
        assert_eq!(g.snapshot(), original);
        let mut bad: serde_json::Value = serde_json::from_str(&original).unwrap();
        bad["residents"][0]["trip"]["order"] = 999.into();
        assert!(!g.restore(&bad.to_string()));
        assert_eq!(g.snapshot(), original);
    }

    #[test]
    fn pickup_uses_its_lower_fee_and_dispatched_delivery_cannot_switch() {
        let mut g = healthy();
        g.app.world_mut().resource_mut::<Village>().economy.money = 2700;
        let mut items = [0u32; economy::COUNT];
        items[0] = 1;
        let data = serde_json::to_string(&items).unwrap();
        let before = g.snapshot();
        assert_ne!(g.order_supplies(&data), "ok");
        assert_eq!(g.snapshot(), before);
        assert_eq!(g.order_supplies_pickup(&data, 0), "ok");
        assert_eq!(state(&mut g).village.economy.money, 0);

        let mut dispatched = healthy();
        assert_eq!(dispatched.order_supplies(&bundle()), "ok");
        {
            let mut v = dispatched.app.world_mut().resource_mut::<Village>();
            v.minutes = 800.;
            economy::advance(&mut v, 0.);
        }
        let before = dispatched.snapshot();
        assert_ne!(dispatched.collect_order(0, 0), "ok");
        assert_eq!(dispatched.snapshot(), before);
    }
    #[test]
    fn a_worn_pickup_fixes_its_duration_at_confirmation_and_returns_despite_later_wear() {
        let mut g = healthy();
        g.set_equipment_condition(true);
        g.set_automatic_service(false);
        g.app
            .world_mut()
            .resource_mut::<Village>()
            .maintenance
            .records
            .iter_mut()
            .find(|r| r.equipment == maintenance::Equipment::Truck)
            .unwrap()
            .condition = 40.;
        assert_eq!(g.order_supplies_pickup(&bundle(), 0), "ok");
        assert_eq!(
            state(&mut g).village.economy.orders[0].pickup_minutes,
            Some(160.)
        );
        until(&mut g, |s| {
            s.residents[0]
                .trip
                .as_ref()
                .is_some_and(|t| t.phase == mobility::Phase::Away)
        });
        g.app
            .world_mut()
            .resource_mut::<Village>()
            .maintenance
            .records
            .iter_mut()
            .find(|r| r.equipment == maintenance::Equipment::Truck)
            .unwrap()
            .condition = 10.;
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        until(&mut g, |s| {
            s.village.economy.orders[0].status == "delivered"
        });
        let s = state(&mut g);
        assert_eq!(
            s.village
                .maintenance
                .records
                .iter()
                .find(|r| r.equipment == maintenance::Equipment::Truck)
                .unwrap()
                .use_units,
            160.
        );
        assert_eq!(s.village.economy.orders[0].pickup_minutes, Some(160.));
    }
}
