//! Everyday decisions share the same thresholds in the chooser and worker offers.
use crate::*;

pub fn recovering(r: &Resident) -> bool {
    r.energy < 28. || (r.task == "rest" && r.energy < 60. && r.hunger < 75.)
}
pub fn company(r: &Resident) -> bool {
    r.social < 35. || (r.task == "socialize" && r.social < 75.)
}
pub fn meal_due(r: &Resident, now: f32) -> bool {
    r.hunger > 60. || meal_slot(now).is_some_and(|slot| slot != r.last_meal_slot)
}
pub fn foraging(v: &Village, r: &Resident) -> bool {
    workforce::urgent_food(v, r.id) || (r.hunger > 60. && !workforce::eating(v, r.id))
}
pub fn free_time(r: &Resident) -> bool {
    leisure::hobby(&r.task) || matches!(r.task.as_str(), "idle" | "socialize" | "rest")
}

/// Eat or recover before accepting a journey that would predictably force an
/// interruption. Conservatively allow for cargo walking and active work,
/// converting the resident tick rates into game minutes.
pub fn preparation(v: &Village, r: &Resident, travel: f32, work: f32) -> Option<&'static str> {
    if r.hunger + (travel + work) * 0.13 / MINUTES_PER_SECOND > 60. && workforce::eating(v, r.id) {
        Some("eat")
    } else if r.energy - (travel * 0.06 + work * 0.11) / MINUTES_PER_SECOND < 28. {
        Some("rest")
    } else {
        None
    }
}

/// A break is a deadline for starting chores, with a bounded allowance to put
/// down a carried load or finish an attended piece of work. Serious needs and
/// commitments are handled separately and always interrupt this allowance.
pub fn finishing(v: &Village, r: &Resident) -> bool {
    let m = v.minutes.rem_euclid(1440.);
    if !((720.0..735.).contains(&m) || (960.0..975.).contains(&m))
        || r.energy < 28.
        || r.hunger > 60.
        || r.social < 35.
        || occupations::available(v, r.id)
        || sleeping_time(v.minutes, r)
    {
        return false;
    }
    if r.task == "haul" {
        return v.logistics.as_ref().is_some_and(|s| {
            s.shipments.iter().any(|h| {
                if h.resident != r.id || !h.carrying {
                    return false;
                }
                let mut here = [r.x, r.y];
                let mut distance = 0.;
                for point in h.route.iter().skip(h.next) {
                    distance += (point[0] - here[0]).hypot(point[1] - here[1]);
                    here = *point;
                }
                distance * MINUTES_PER_SECOND / 0.7 <= 15.
            })
        });
    }
    if r.task == "water" {
        return v.water_supply.trips.iter().any(|h| {
            h.resident == r.id
                && h.carrying
                && navigation::work_route(v, [r.x, r.y], h.dropoff)
                    .is_ok_and(|(route, _)| route.minutes + h.handling <= 15.)
        });
    }
    requests::work(&r.task)
        && r.remaining > 0.
        && r.remaining <= 5.
        && (r.x - r.target_x).hypot(r.y - r.target_y) <= 0.08
}

pub fn fits_before_break(v: &Village, travel: f32, work: f32) -> bool {
    let m = v.minutes.rem_euclid(1440.);
    let end = if (540.0..720.).contains(&m) {
        720.
    } else if (900.0..960.).contains(&m) {
        960.
    } else {
        return true; // Reports may inspect offers outside community hours.
    };
    travel + work <= end - m
}

#[cfg(test)]
mod tests {
    use super::*;
    fn scene() -> (Game, Village, Resident) {
        let mut g = Game::new();
        let saved: Save = serde_json::from_str(&g.snapshot()).unwrap();
        let mut v = saved.village;
        v.minutes = 570.;
        v.arrived = true;
        logistics::fixture_stock(&mut v, economy::FOOD, 40);
        logistics::fixture_stock(&mut v, economy::MEALS, 8);
        water::fixture_fresh(&mut v, 40.);
        let mut r = saved.residents[0].clone();
        r.task = "idle".into();
        r.remaining = 0.;
        r.trip = None;
        r.hunger = 10.;
        r.energy = 90.;
        r.social = 90.;
        r.last_meal_slot = 0;
        r.x = CAMP.0;
        r.y = CAMP.1;
        r.target_x = r.x;
        r.target_y = r.y;
        (g, v, r)
    }
    #[test]
    fn recovery_and_company_have_meaningful_stopping_points() {
        let (_, v, mut r) = scene();
        r.energy = 20.;
        choose(&mut r, &v);
        assert_eq!(r.task, "rest");
        r.energy = 40.;
        r.remaining = 0.;
        choose(&mut r, &v);
        assert_eq!(
            r.task, "rest",
            "A timer must not send an exhausted person back to chores"
        );
        r.energy = 65.;
        r.social = 20.;
        choose(&mut r, &v);
        assert_eq!(
            r.task, "socialize",
            "Loneliness must matter even during community hours"
        );
        r.social = 60.;
        choose(&mut r, &v);
        assert_eq!(r.task, "socialize");
        r.social = 80.;
        choose(&mut r, &v);
        assert_ne!(
            r.task, "socialize",
            "A satisfied need releases the resident for useful work"
        );
    }
    #[test]
    fn pressing_needs_interrupt_leisure_in_the_real_tick() {
        for (energy, hunger, social, expected) in [
            (20., 10., 90., "rest"),
            (90., 80., 90., "eat"),
            (90., 10., 20., "socialize"),
        ] {
            let (mut g, v, mut person) = scene();
            *g.app.world_mut().resource_mut::<Village>() = v;
            person.task = "daydream".into();
            person.remaining = 100.;
            person.energy = energy;
            person.hunger = hunger;
            person.social = social;
            let mut q = g.app.world_mut().query::<&mut Resident>();
            *q.iter_mut(g.app.world_mut()).find(|r| r.id == 0).unwrap() = person;
            g.tick(0.1);
            let save: Save = serde_json::from_str(&g.snapshot()).unwrap();
            assert_eq!(save.residents[0].task, expected);
        }
    }
    #[test]
    fn a_nearly_finished_project_gets_a_short_lunch_allowance() {
        let (mut g, _, mut r) = scene();
        assert_eq!(g.place("garden", 13, 15), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.arrived = true;
            v.minutes = 719.9;
            logistics::fixture_stock(&mut v, economy::FOOD, 40);
            logistics::fixture_stock(&mut v, economy::MEALS, 8);
            logistics::fixture_stage(&mut v, 0);
            assign(&mut r, &v, "build", "Finishing this section.", false);
            r.remaining = 3.;
            r.x = r.target_x;
            r.y = r.target_y;
        }
        let mut q = g.app.world_mut().query::<&mut Resident>();
        *q.iter_mut(g.app.world_mut()).find(|r| r.id == 0).unwrap() = r;
        g.tick(0.1);
        let save: Save = serde_json::from_str(&g.snapshot()).unwrap();
        assert_eq!(save.residents[0].task, "build");
        assert!(save.village.buildings[0].progress > 0.);
        let checkpoint = g.snapshot();
        let mut copy = Game::new();
        assert!(copy.restore(&checkpoint));
        for _ in 0..100 {
            g.tick(0.25);
            copy.tick(0.25);
        }
        assert_eq!(g.snapshot(), copy.snapshot());
        let save: Save = serde_json::from_str(&g.snapshot()).unwrap();
        assert_ne!(
            save.residents[0].task, "build",
            "The allowance cannot create an extra work shift"
        );
    }
    #[test]
    fn a_carried_load_reaches_the_site_at_lunch_but_hunger_can_interrupt() {
        for urgent in [false, true] {
            let (mut g, mut v, mut r) = scene();
            *g.app.world_mut().resource_mut::<Village>() = v.clone();
            assert_eq!(g.place("garden", 13, 15), "ok");
            v = g.app.world().resource::<Village>().clone();
            assign(&mut r, &v, "haul", "Bringing supplies.", false);
            let load = loop {
                assert!(logistics::advance(&mut v, &mut r, &[], 0.25));
                let h = v
                    .logistics
                    .as_ref()
                    .unwrap()
                    .shipments
                    .iter()
                    .find(|h| h.resident == r.id)
                    .unwrap();
                if h.carrying && (r.x - h.dropoff[0]).hypot(r.y - h.dropoff[1]) < 1. {
                    break h.clone();
                }
            };
            v.minutes = 719.9;
            if urgent {
                r.hunger = 80.;
            }
            *g.app.world_mut().resource_mut::<Village>() = v;
            let mut q = g.app.world_mut().query::<&mut Resident>();
            *q.iter_mut(g.app.world_mut()).find(|p| p.id == 0).unwrap() = r;
            g.tick(0.1);
            let s: Save = serde_json::from_str(&g.snapshot()).unwrap();
            if urgent {
                assert_eq!(s.residents[0].task, "eat");
                assert!(
                    s.village
                        .logistics
                        .as_ref()
                        .unwrap()
                        .stores
                        .iter()
                        .any(|p| p.owner == logistics::Owner::Ground
                            && p.items[load.material] == load.amount)
                );
            } else {
                assert_eq!(s.residents[0].task, "haul");
                for _ in 0..40 {
                    g.tick(0.25);
                }
                let s: Save = serde_json::from_str(&g.snapshot()).unwrap();
                assert!(
                    !s.village
                        .logistics
                        .as_ref()
                        .unwrap()
                        .shipments
                        .iter()
                        .any(|h| h.id == load.id)
                );
                assert!(
                    s.village
                        .logistics
                        .as_ref()
                        .unwrap()
                        .stores
                        .iter()
                        .any(|p| p.id == load.to && p.items[load.material] >= load.amount)
                );
                assert_ne!(s.residents[0].task, "haul");
            }
            let checkpoint = g.snapshot();
            assert!(g.restore(&checkpoint));
            assert_eq!(g.snapshot(), checkpoint);
        }
    }
    #[test]
    fn a_carried_water_container_reaches_its_tank_before_lunch() {
        let (mut g, _, mut r) = scene();
        g.start_mode("sandbox");
        assert_eq!(g.place("home", 7, 10), "ok");
        let mut v = g.app.world().resource::<Village>().clone();
        v.arrived = true;
        v.minutes = 570.;
        logistics::fixture_stock(&mut v, economy::FOOD, 40);
        logistics::fixture_stock(&mut v, economy::MEALS, 8);
        water::fixture_fresh(&mut v, 0.);
        water::add(&mut v, water::Owner::Camp, water::Class::Fresh, 40.);
        water::sync(&mut v);
        assign(&mut r, &v, "water", "Bringing water home.", false);
        let mut carried = None;
        for _ in 0..600 {
            water::advance(&mut v, &mut r, &[], 0.25);
            if let Some(h) = v
                .water_supply
                .trips
                .iter()
                .find(|h| h.resident == r.id && h.carrying)
                && (r.x - h.dropoff[0]).hypot(r.y - h.dropoff[1]) < 1.
            {
                carried = Some(h.clone());
                break;
            }
        }
        let carried = carried.expect("The resident must physically collect the water");
        v.minutes = 719.9;
        *g.app.world_mut().resource_mut::<Village>() = v;
        let mut q = g.app.world_mut().query::<&mut Resident>();
        *q.iter_mut(g.app.world_mut()).find(|p| p.id == 0).unwrap() = r;
        g.tick(0.1);
        let s: Save = serde_json::from_str(&g.snapshot()).unwrap();
        assert_eq!(s.residents[0].task, "water");
        for _ in 0..40 {
            g.tick(0.25);
        }
        let s: Save = serde_json::from_str(&g.snapshot()).unwrap();
        assert!(
            !s.village
                .water_supply
                .trips
                .iter()
                .any(|h| h.id == carried.id)
        );
        assert!(water::tank(&s.village, carried.to).unwrap().water[carried.class.index()] > 0.);
        let checkpoint = g.snapshot();
        assert!(g.restore(&checkpoint));
        assert_eq!(g.snapshot(), checkpoint);
    }
    #[test]
    fn residents_prepare_for_a_long_errand_before_starting_it() {
        let (_, mut v, mut r) = scene();
        logistics::fixture_stock(&mut v, economy::FOOD, 12);
        logistics::fixture_stock(&mut v, economy::MEALS, 0);
        r.hunger = 59.9;
        choose(&mut r, &v);
        assert_eq!(r.task, "eat");
        assert!(r.reason.contains("before a long errand"));
        r.task = "idle".into();
        r.hunger = 10.;
        r.energy = 29.;
        choose(&mut r, &v);
        assert_eq!(r.task, "rest");
        assert!(r.reason.contains("before a long errand"));
    }
    #[test]
    fn an_idle_resident_notices_new_animal_care_without_waiting_for_a_hobby_timer() {
        let (mut g, _, mut r) = scene();
        g.start_mode("sandbox");
        assert_eq!(g.place("apiary", 13, 15), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.arrived = true;
            v.minutes = 570.;
            logistics::fixture_stock(&mut v, economy::FOOD, 40);
            logistics::fixture_stock(&mut v, economy::MEALS, 8);
            water::fixture_fresh(&mut v, 40.);
        }
        r.task = "daydream".into();
        r.remaining = 90.;
        r.work_check_at = 560.;
        let mut q = g.app.world_mut().query::<&mut Resident>();
        *q.iter_mut(g.app.world_mut()).find(|p| p.id == 0).unwrap() = r;
        g.tick(0.1);
        let s: Save = serde_json::from_str(&g.snapshot()).unwrap();
        assert_eq!(s.residents[0].task, "garden");
        assert_eq!(s.residents[0].activity_building, Some(0));
    }
    #[test]
    fn a_worker_who_cannot_fit_a_batch_does_not_hold_the_position_for_others() {
        let (_, mut v, mut near) = scene();
        logistics::fixture_stock(&mut v, economy::FOOD, 12);
        v.minutes = 685.;
        let job = workforce::offers(&v, &near)
            .into_iter()
            .find(|o| o.task == "gather")
            .unwrap();
        near.x = job.destination[0];
        near.y = job.destination[1];
        let mut far = near.clone();
        far.id = 1;
        far.x += 2.5;
        v.workforce.preferences[0][2] = 0;
        v.workforce.preferences[1][2] = 2;
        workforce::refresh(&mut v, [&near, &far]);
        let remote = workforce::offers(&v, &far)
            .into_iter()
            .find(|o| o.task == "gather")
            .unwrap();
        assert!(
            remote.blocker.is_some(),
            "The favourite worker cannot fit the journey plus batch"
        );
        choose(&mut near, &v);
        assert_eq!(
            near.task, "gather",
            "A neighbour who can finish should take the available position"
        );
    }
    #[test]
    fn hunger_relief_keeps_making_progress_even_when_lonely() {
        let (mut g, mut v, mut r) = scene();
        v.mode = modes::Mode::Story;
        logistics::fixture_stock(&mut v, economy::FOOD, 12);
        logistics::fixture_stock(&mut v, economy::MEALS, 0);
        for store in &mut v.logistics.as_mut().unwrap().stores {
            for lot in &mut store.food_lots {
                lot.expires = v.minutes + 1.;
            }
        }
        r.hunger = 80.;
        r.social = 20.;
        workforce::refresh(&mut v, [&r]);
        // Existing food will expire before anyone can sit down to eat it.
        assert!(!workforce::eating(&v, r.id));
        assert!(!workforce::urgent_food(&v, r.id));
        assign(&mut r, &v, "gather", "Finding something I can eat.", false);
        r.x = r.target_x;
        r.y = r.target_y;
        *g.app.world_mut().resource_mut::<Village>() = v;
        let mut q = g.app.world_mut().query::<&mut Resident>();
        *q.iter_mut(g.app.world_mut()).find(|p| p.id == 0).unwrap() = r;
        g.tick(0.1);
        g.tick(0.1);
        let s: Save = serde_json::from_str(&g.snapshot()).unwrap();
        assert_eq!(s.residents[0].task, "gather");
        assert!(
            s.residents[0].remaining < 9.85,
            "Loneliness must not keep restarting urgent food work"
        );
    }
    #[test]
    fn serious_hunger_can_end_an_extended_rest_once_the_resident_can_walk() {
        let (_, mut v, mut r) = scene();
        logistics::fixture_stock(&mut v, economy::FOOD, 0);
        logistics::fixture_stock(&mut v, economy::MEALS, 0);
        r.task = "rest".into();
        r.energy = 40.;
        r.hunger = 85.;
        choose(&mut r, &v);
        assert_eq!(
            r.task, "gather",
            "Recovering to full readiness cannot come before finding food"
        );
        r.energy = 20.;
        choose(&mut r, &v);
        assert_eq!(
            r.task, "rest",
            "An exhausted resident still needs enough energy to move safely"
        );
    }
    #[test]
    fn late_offers_explain_why_a_long_errand_should_wait() {
        let (_, mut v, r) = scene();
        v.minutes = 719.;
        logistics::fixture_stock(&mut v, economy::FOOD, 12);
        let offers = workforce::offers(&v, &r);
        assert!(!offers.is_empty());
        assert!(offers.iter().all(|o| o.blocker.is_some()));
        let mut person = r;
        choose(&mut person, &v);
        assert!(leisure::hobby(&person.task));
    }
}
