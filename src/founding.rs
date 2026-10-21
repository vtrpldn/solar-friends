//! Existing property handed to the group when a new game mode begins.
use crate::*;

#[cfg(test)]
pub fn start(v: &mut Village) {
    let (cx, cy) = crate::camp(v);
    land::disturb_plot(v, 10, cx as i32, cy as i32, 0.05);
    for (kind, dx, dy) in [("shed", -2, -3), ("warehouse", 4, -3)] {
        let (x, y) = (cx as i32 + dx, cy as i32 + dy);
        let id = v.economy.next_building;
        v.economy.next_building += 1;
        v.buildings.push(Building {
            id,
            kind: kind.into(),
            x,
            y,
            progress: 100.,
            contributors: crate::participation::Set::new(),
            next_visit: 0.,
            visits: 0,
            crop: Default::default(),
            poultry: Default::default(),
            agriculture: Default::default(),
        });
        land::disturb(v, kind, x, y);
    }
    logistics::sync(v);
    // Supplies arrive already unpacked in the existing storage house. Preserve
    // their lot ages and quantities; this is a move, never a second opening grant.
    if let Some(s) = v.logistics.as_mut() {
        let camp = s
            .stores
            .iter()
            .position(|p| p.owner == logistics::Owner::Camp)
            .unwrap();
        let store = s
            .stores
            .iter()
            .position(|p| matches!(p.owner, logistics::Owner::Warehouse(_)))
            .unwrap();
        // Food goes indoors first; Sandbox's larger material grant may also
        // use the arrival store until the player adds further warehouses.
        for i in [
            economy::FOOD,
            economy::MEALS,
            economy::EGGS,
            economy::MILK,
            economy::HONEY,
        ]
        .into_iter()
        .chain((0..economy::COUNT).filter(|i| {
            ![
                economy::FOOD,
                economy::MEALS,
                economy::EGGS,
                economy::MILK,
                economy::HONEY,
            ]
            .contains(i)
        })) {
            let room = s.stores[store].capacity - s.stores[store].items.iter().sum::<u32>();
            let n = room.min(s.stores[camp].items[i]);
            let lots = freshness::take(&mut s.stores[camp].food_lots, i, n);
            freshness::merge(&mut s.stores[store].food_lots, lots);
            s.stores[camp].items[i] -= n;
            s.stores[store].items[i] += n;
        }
    }
    logistics::sync_totals(v);
    production::sync(v);
    maintenance::sync(v);
    v.events=vec!["Five friends arrive with supplies, a shared shed and a storage house. Homes are still needed for overnight stays.".into()];
}

pub fn weather_shelter(v: &Village) -> bool {
    let weather = climate::at(v, v.minutes);
    weather.raining || (660.0..960.).contains(&v.minutes.rem_euclid(1440.)) && weather.clouds < 0.55
}
pub fn quiet_spot(v: &Village, id: usize) -> Option<(f32, f32)> {
    v.buildings
        .iter()
        .filter(|b| b.kind == "shed" && b.progress >= 100.)
        .find_map(|b| quiet_spot_at(v, b, id))
}
pub fn quiet_spot_at(v: &Village, b: &Building, id: usize) -> Option<(f32, f32)> {
    const SPOTS: [(f32, f32); 5] = [
        (-0.85, -0.85),
        (0.85, -0.85),
        (-0.85, 0.85),
        (0.85, 0.85),
        (0., 0.),
    ];
    let slot = roster::slot(v, id)?;
    (0..SPOTS.len())
        .map(|n| {
            let (x, y) = SPOTS[(n + slot) % SPOTS.len()];
            (b.x as f32 + x, b.y as f32 + y)
        })
        .find(|p| navigation::clear(v, p.0, p.1) && spacing::free_spot(v, *p, id))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn both_modes_start_with_owned_shelter_storage_and_exact_saves() {
        for mode in ["story", "sandbox"] {
            let mut g = Game::new();
            assert!(g.start_mode(mode));
            let v = g.app.world().resource::<Village>();
            assert_eq!(v.map_size, MAP_SIZE);
            assert_eq!(v.camp, (MAP_SIZE as f32 / 2., MAP_SIZE as f32 / 2.));
            assert!(
                v.buildings
                    .iter()
                    .all(|b| (b.x - MAP_SIZE / 2).abs() <= 4 && (b.y - MAP_SIZE / 2).abs() <= 4)
            );
            assert_eq!(v.land.water.len(), (MAP_SIZE * MAP_SIZE) as usize);
            assert_eq!(v.buildings.len(), 2);
            assert!(ready(v, "shed") && ready(v, "warehouse"));
            assert!(
                shelter(v, 0).is_none(),
                "A daytime roof must not become a bed"
            );
            let store = v
                .logistics
                .as_ref()
                .unwrap()
                .stores
                .iter()
                .find(|p| matches!(p.owner, logistics::Owner::Warehouse(_)))
                .unwrap();
            assert_eq!(
                store.items[economy::FOOD],
                economy::quantity(v, economy::FOOD)
            );
            assert!(store.items[economy::FOOD] > 0);
            assert!(simulation::valid(v));
            let saved = g.snapshot();
            assert!(
                g.restore(&saved),
                "The actual new-game property must reload"
            );
            assert_eq!(g.snapshot(), saved);
        }
    }
    #[test]
    fn rain_and_strong_sun_offer_five_separate_reachable_sheltered_places() {
        let mut g = Game::new();
        g.start_mode("story");
        let saved: Save = serde_json::from_str(&g.snapshot()).unwrap();
        let mut v = saved.village;
        for minute in [720., 900.] {
            v.minutes = minute;
            assert!(weather_shelter(&v));
            let mut spots: Vec<(f32, f32)> = vec![];
            for mut r in saved.residents.clone() {
                r.task = "idle".into();
                r.energy = 90.;
                r.hunger = 0.;
                r.social = 90.;
                let (task, reason) = leisure::choose(&r, &v);
                assert_eq!(task, "daydream");
                assign(&mut r, &v, task, reason, false);
                assert!(navigation::work_route(&v, [r.x, r.y], [r.target_x, r.target_y]).is_ok());
                assert!(v.buildings.iter().any(|b| b.kind == "shed"
                    && (r.target_x - b.x as f32).abs() <= 0.851
                    && (r.target_y - b.y as f32).abs() <= 0.851));
                assert!(spots.iter().all(
                    |&(x, y)| (r.target_x - x).hypot(r.target_y - y) >= spacing::PERSONAL_SPACE
                ));
                spots.push((r.target_x, r.target_y));
                v.workforce_peers.insert(r.id, Some(r.clone()));
            }
        }
    }
    #[test]
    fn useful_work_is_not_blocked_by_a_village_clock_and_tired_people_still_rest() {
        for minute in [450., 800., 1100.] {
            let mut g = Game::new();
            g.place("garden", 5, 5);
            let saved: Save = serde_json::from_str(&g.snapshot()).unwrap();
            let mut v = saved.village;
            v.minutes = minute;
            v.economy
                .outside_jobs
                .values_mut()
                .for_each(|enabled| *enabled = false);
            let stage = economy::recipe("garden", "standard").unwrap()[0].items;
            for (i, n) in stage.into_iter().enumerate().filter(|(_, n)| *n > 0) {
                logistics::receive(&mut v, logistics::Owner::Site(0), i, n);
            }
            economy::rebalance(&mut v);
            let mut r = saved.residents[1].clone();
            r.task = "idle".into();
            r.energy = 90.;
            r.hunger = 5.;
            r.social = 90.;
            r.trip = None;
            r.sleep = Default::default();
            choose(&mut r, &v);
            assert_eq!(r.task, "build", "Energetic residents can work at {minute}");
            r.energy = 20.;
            choose(&mut r, &v);
            assert_eq!(r.task, "rest");
        }
    }
}
