//! Persisted departures, time away and visible returns to the village.
use crate::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Purpose {
    Work,
    Overnight,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Leaving,
    Away,
    Returning,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Trip {
    pub purpose: Purpose,
    pub phase: Phase,
    pub return_at: f32,
}

pub fn departure_time(minutes: f32) -> bool {
    (540.0..600.).contains(&minutes.rem_euclid(1440.))
}
pub fn gate(v: &Village, id: usize) -> (f32, f32) {
    let preferred = 13. + (id as f32 - 2.) * 1.25;
    let clear =
        |x, y| spacing::land(x, y) && v.buildings.iter().all(|b| spacing::clear_plot(b, x, y));
    for offset in 0..28 {
        for sign in [1., -1.] {
            let y = preferred + offset as f32 * sign;
            if clear(0.4, y) {
                return (0.4, y);
            }
        }
    }
    // The southern edge stays beyond buildable foundations, even in a dense village.
    for x in 1..=22 {
        if clear(x as f32, 27.6) {
            return (x as f32, 27.6);
        }
    }
    (10., 27.6)
}
pub fn begin(r: &mut Resident, v: &Village, purpose: Purpose) {
    let day = (v.minutes / 1440.).floor() * 1440.;
    let morning = 360. + r.id as f32 * 10.;
    let return_at = match purpose {
        Purpose::Work => day + 1020.,
        Purpose::Overnight => {
            day + morning
                + if v.minutes.rem_euclid(1440.) < morning {
                    0.
                } else {
                    1440.
                }
        }
    };
    r.trip = Some(Trip {
        purpose,
        phase: Phase::Leaving,
        return_at,
    });
    r.activity_building = None;
    r.activity_material = None;
    r.visit_building = None;
    (r.target_x, r.target_y) = gate(v, r.id);
    r.reason=match purpose {
        Purpose::Work=>"Walking out for my 09:00–17:00 job. I'll bring my contribution home after work.",
        Purpose::Overnight=>"There is no bed for me yet. Staying with neighbours tonight and returning in the morning.",
    }.into();
}

pub fn advance(
    r: &mut Resident,
    v: &mut Village,
    neighbours: &[(usize, f32, f32)],
    dt: f32,
) -> bool {
    let Some(mut trip) = r.trip.clone() else {
        return false;
    };
    if trip.purpose == Purpose::Work && trip.phase == Phase::Leaving {
        v.economy.outside_committed_day = (trip.return_at / 1440.).floor() as i32;
    }
    if trip.phase != Phase::Returning && v.minutes >= trip.return_at {
        if trip.phase == Phase::Away {
            if trip.purpose == Purpose::Work {
                economy::finish_outside(v, r.id);
            }
            // A new building may have occupied the old departure spot while away.
            (r.x, r.y) = gate(v, r.id);
        }
        trip.phase = Phase::Returning;
        r.task = "return".into();
        (r.target_x, r.target_y) = spacing::material_spot(v, CAMP.0, CAMP.1, r.id).unwrap_or(CAMP);
        r.reason = match trip.purpose {
            Purpose::Work => "Back from work. Walking into the village for the evening.",
            Purpose::Overnight => {
                "Back from staying with neighbours. Walking into the village this morning."
            }
        }
        .into();
    }
    if trip.phase == Phase::Away {
        // Food and water while off-site are supplied there, not drawn from village stores.
        r.hunger = (r.hunger
            + dt * if trip.purpose == Purpose::Overnight {
                0.045
            } else {
                0.13
            })
        .min(100.);
        r.social = (r.social - dt * 0.035).max(0.);
        if trip.purpose == Purpose::Overnight {
            r.energy = (r.energy + dt * 0.20).min(100.);
        } else {
            r.energy = (r.energy - dt * 0.08).max(0.);
            let lunch = (v.minutes / 1440.).floor() as i32 * 3 + 1;
            if v.minutes.rem_euclid(1440.) >= 720. && r.last_meal_slot != lunch {
                r.hunger = (r.hunger - 45.).max(0.);
                r.last_meal_slot = lunch;
            }
        }
    } else if (r.target_x - r.x).hypot(r.target_y - r.y) > 0.08 {
        spacing::walk(r, neighbours, dt);
        r.energy = (r.energy - dt * 0.035).max(0.);
        r.hunger = (r.hunger + dt * 0.13).min(100.);
        r.social = (r.social - dt * 0.035).max(0.);
        v.water = (v.water - dt * 0.009).max(0.);
    } else if trip.phase == Phase::Leaving {
        trip.phase = Phase::Away;
        r.reason=match trip.purpose {
            Purpose::Work=>"Working at a neighbouring farm until 17:00. Lunch is provided there.",
            Purpose::Overnight=>"Sleeping at our neighbours' place. Back in the morning; I still need a village bed.",
        }.into();
    } else {
        r.trip = None;
        choose(r, v);
        return true;
    }
    r.happiness = (r.energy * 0.30
        + (100. - r.hunger) * 0.35
        + r.social * 0.25
        + if shelter(v, r.id).is_some() { 8. } else { 0. }
        - situations::concern(v, r.id))
    .clamp(0., 100.);
    r.trip = Some(trip);
    true
}

pub fn valid(v: &Village, r: &Resident) -> bool {
    let Some(t) = &r.trip else {
        return r.task != "return";
    };
    if !t.return_at.is_finite()
        || t.return_at < 0.
        || t.return_at > v.minutes + 1440.
        || r.activity_building.is_some()
        || r.visit_building.is_some()
        || r.activity_material.is_some()
    {
        return false;
    }
    let expected = match t.purpose {
        Purpose::Work => 1020.,
        Purpose::Overnight => 360. + r.id as f32 * 10.,
    };
    if (t.return_at.rem_euclid(1440.) - expected).abs() > 0.01 {
        return false;
    }
    if t.purpose == Purpose::Work
        && t.phase != Phase::Returning
        && v.economy.outside_committed_day != (t.return_at / 1440.) as i32
    {
        return false;
    }
    let task = if t.phase == Phase::Returning {
        "return"
    } else {
        match t.purpose {
            Purpose::Work => "outside",
            Purpose::Overnight => "sleep",
        }
    };
    if r.task != task {
        return false;
    }
    if t.phase == Phase::Returning {
        t.return_at <= v.minutes
    } else {
        t.return_at > v.minutes
            && (t.phase != Phase::Away || (r.x - r.target_x).hypot(r.y - r.target_y) <= 0.1)
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
            v.minutes = 540.;
            v.food = 80.;
            v.meals = 10;
            v.water = 40.;
        }
        let mut q = g.app.world_mut().query::<&mut Resident>();
        for mut r in q.iter_mut(g.app.world_mut()) {
            r.task = "idle".into();
            r.remaining = 90.;
            r.energy = 90.;
            r.hunger = 20.;
            r.social = 90.;
            r.last_meal_slot = 0;
            r.x = CAMP.0 + (r.id as f32 - 2.) * 1.25;
            r.y = CAMP.1;
            r.target_x = r.x;
            r.target_y = r.y;
        }
        g
    }
    fn residents(g: &mut Game) -> Vec<Resident> {
        serde_json::from_str::<Save>(&g.snapshot())
            .unwrap()
            .residents
    }
    fn round_trip(g: &mut Game) {
        let saved = g.snapshot();
        let mut restored = Game::new();
        assert!(restored.restore(&saved));
        assert_eq!(restored.snapshot(), saved);
    }
    fn until(g: &mut Game, test: impl Fn(&[Resident]) -> bool) {
        for _ in 0..1600 {
            if test(&residents(g)) {
                return;
            }
            g.tick(0.25);
        }
        panic!("Departure/return did not finish");
    }
    fn home(g: &mut Game, x: i32, y: i32) {
        assert_eq!(g.place("home", x, y), "ok");
        g.app
            .world_mut()
            .resource_mut::<Village>()
            .buildings
            .last_mut()
            .unwrap()
            .progress = 100.;
    }

    #[test]
    fn jobs_leave_disappear_and_return_with_one_payment_even_if_disabled() {
        let mut g = healthy();
        home(&mut g, 8, 8);
        g.set_outside_work(true);
        g.tick(0.25);
        assert_eq!(
            residents(&mut g)[4].trip.as_ref().unwrap().phase,
            Phase::Leaving
        );
        round_trip(&mut g);
        let fund = g.app.world().resource::<Village>().economy.money;
        until(&mut g, |rs| {
            rs[4].trip.as_ref().is_some_and(|t| t.phase == Phase::Away)
        });
        assert!(g.visit_building(4, 0).contains("away"));
        assert!(g.request(4, "rest", false).contains("away"));
        round_trip(&mut g);
        g.set_outside_work(false);
        g.app.world_mut().resource_mut::<Village>().minutes = 1019.;
        g.tick(0.25);
        assert_eq!(g.app.world().resource::<Village>().economy.money, fund);
        g.app.world_mut().resource_mut::<Village>().minutes = 1020.;
        g.tick(0.25);
        assert_eq!(
            residents(&mut g)[4].trip.as_ref().unwrap().phase,
            Phase::Returning
        );
        assert_eq!(
            g.app.world().resource::<Village>().economy.money,
            fund + 18000
        );
        round_trip(&mut g);
        until(&mut g, |rs| rs[4].trip.is_none());
        for _ in 0..100 {
            g.tick(0.25);
        }
        assert_eq!(
            g.app.world().resource::<Village>().economy.money,
            fund + 18000
        );
    }
    #[test]
    fn the_paid_job_is_reserved_on_request_and_cannot_be_double_booked() {
        let mut g = healthy();
        g.set_outside_work(true);
        assert!(g.request(0, "outside", true).contains("lend a hand"));
        assert_eq!(
            g.app
                .world()
                .resource::<Village>()
                .economy
                .outside_committed_day,
            0
        );
        let before = g.snapshot();
        assert!(!g.request(1, "outside", true).contains("lend a hand"));
        assert_eq!(g.snapshot(), before);
        g.tick(0.25);
        assert!(residents(&mut g)[4].trip.is_none());
        round_trip(&mut g);
    }
    #[test]
    fn only_neighbours_without_beds_leave_and_new_beds_wait_until_morning() {
        let mut g = healthy();
        home(&mut g, 8, 8);
        g.app.world_mut().resource_mut::<Village>().minutes = 1380.;
        g.tick(0.25);
        let rs = residents(&mut g);
        assert!(rs[..3].iter().all(|r| r.trip.is_none()));
        assert!(rs[3..].iter().all(|r| {
            r.trip
                .as_ref()
                .is_some_and(|t| t.purpose == Purpose::Overnight)
        }));
        until(&mut g, |rs| {
            rs[3..]
                .iter()
                .all(|r| r.trip.as_ref().is_some_and(|t| t.phase == Phase::Away))
        });
        round_trip(&mut g);
        home(&mut g, 12, 8);
        g.tick(0.25);
        assert_eq!(
            residents(&mut g)[3].trip.as_ref().unwrap().phase,
            Phase::Away
        );
        g.app.world_mut().resource_mut::<Village>().minutes = 1830.;
        g.tick(0.25);
        let rs = residents(&mut g);
        assert_eq!(rs[3].trip.as_ref().unwrap().phase, Phase::Returning);
        assert_eq!(rs[4].trip.as_ref().unwrap().phase, Phase::Away);
        g.app.world_mut().resource_mut::<Village>().minutes = 1840.;
        g.tick(0.25);
        until(&mut g, |rs| rs.iter().all(|r| r.trip.is_none()));
        round_trip(&mut g);
    }
    #[test]
    fn off_site_sleep_does_not_consume_village_stores_and_invalid_trips_are_atomic() {
        let mut g = healthy();
        g.app.world_mut().resource_mut::<Village>().minutes = 1380.;
        g.tick(0.25);
        until(&mut g, |rs| {
            rs.iter()
                .all(|r| r.trip.as_ref().is_some_and(|t| t.phase == Phase::Away))
        });
        g.app.world_mut().resource_mut::<Village>().minutes = 1440.;
        let before = g.app.world().resource::<Village>().clone();
        let energy = residents(&mut g)[0].energy;
        for _ in 0..40 {
            g.tick(0.25);
        }
        let after = g.app.world().resource::<Village>();
        assert_eq!(after.food, before.food);
        assert_eq!(after.meals, before.meals);
        assert_eq!(after.water, before.water);
        assert!(residents(&mut g)[0].energy > energy);
        round_trip(&mut g);
        let saved = g.snapshot();
        for (key, value) in [
            ("return_at", serde_json::json!(999999)),
            ("phase", serde_json::json!("missing")),
            ("purpose", serde_json::json!("work")),
        ] {
            let mut bad: serde_json::Value = serde_json::from_str(&saved).unwrap();
            bad["residents"][0]["trip"][key] = value;
            assert!(!g.restore(&bad.to_string()));
            assert_eq!(g.snapshot(), saved);
        }
    }
    #[test]
    fn departure_gates_avoid_buildings_and_pending_returns_use_a_clear_gate() {
        let mut g = healthy();
        home(&mut g, 1, 13);
        let v = g.app.world().resource::<Village>();
        for id in 0..5 {
            let (x, y) = gate(v, id);
            assert!(spacing::land(x, y));
            assert!(v.buildings.iter().all(|b| spacing::clear_plot(b, x, y)));
        }
    }
}
