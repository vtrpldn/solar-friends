//! Separate activity spots and gentle, deterministic pedestrian steering.
use super::*;

pub const PERSONAL_SPACE: f32 = 1.1;

pub fn land(x: f32, y: f32) -> bool {
    (0.3..=MAP_SIZE as f32 - 0.3).contains(&x)
        && (0.3..=MAP_SIZE as f32 - 0.3).contains(&y)
        && !river_bank(x.floor() as i32, y.floor() as i32)
}

pub(crate) fn clear_plot(b: &Building, x: f32, y: f32) -> bool {
    let size = interactions::footprint_size(&b.kind);
    let left = (b.x - size / 2) as f32 - 0.5;
    let back = (b.y - size / 2) as f32 - 0.5;
    x <= left - 0.2
        || x >= left + size as f32 + 0.2
        || y <= back - 0.2
        || y >= back + size as f32 + 0.2
}

pub fn material_spot(v: &Village, x: f32, y: f32, id: usize) -> Option<(f32, f32)> {
    let mut spots: Vec<(f32, f32)> = vec![];
    for radius in [0.7, 1.4, 2.1, 2.8, 3.5] {
        for angle in [90f32, 45., 0., 135., -45., 180., 225., -90.] {
            let angle = angle.to_radians();
            let p = (x + radius * angle.cos(), y + radius * angle.sin());
            if land(p.0, p.1)
                && p.0 < 25.8 + (p.1 * 0.32).sin() * 0.65 - 2.3
                && v.buildings.iter().all(|b| clear_plot(b, p.0, p.1))
                && spots
                    .iter()
                    .all(|q| (p.0 - q.0).hypot(p.1 - q.1) >= PERSONAL_SPACE)
            {
                spots.push(p);
                if spots.len() > id {
                    return Some(spots[id]);
                }
            }
        }
    }
    None
}

pub fn approach(v: &Village, b: &Building, id: usize) -> Option<(f32, f32)> {
    let mut spots: Vec<(f32, f32)> = Vec::new();
    // Start along the visible front of the building, then try the sides.
    // Wider rings leave room around neighbours and the edge of the lot.
    for extra in [0.55, 1.2, 1.85] {
        let radius = interactions::radius(&b.kind) as f32 + extra;
        for angle in [45f32, 0., 90., -45., 135., -90., 180., 225.] {
            let angle = angle.to_radians();
            let p = (
                b.x as f32 + radius * angle.cos(),
                b.y as f32 + radius * angle.sin(),
            );
            if land(p.0, p.1)
                && v.buildings.iter().all(|other| clear_plot(other, p.0, p.1))
                && spots
                    .iter()
                    .all(|q| (p.0 - q.0).hypot(p.1 - q.1) >= PERSONAL_SPACE)
            {
                spots.push(p);
                if spots.len() == 5 {
                    return Some(spots[id]);
                }
            }
        }
    }
    spots.get(id).copied()
}

pub fn building(r: &Resident, v: &Village) -> Option<usize> {
    r.activity_building.or_else(|| {
        // Older saves located work by its shared approach point.
        v.buildings
            .iter()
            .find(|b| {
                (b.x as f32 + 0.75 - r.target_x).abs() < 0.2
                    && (b.y as f32 + 0.75 - r.target_y).abs() < 0.2
            })
            .map(|b| b.id)
    })
}

pub fn walk(r: &mut Resident, neighbours: &[(usize, f32, f32)], dt: f32) {
    let dx = r.target_x - r.x;
    let dy = r.target_y - r.y;
    let distance = dx.hypot(dy);
    let (ux, uy) = (dx / distance, dy / distance);
    let (mut sx, mut sy) = (ux, uy);
    for &(id, x, y) in neighbours {
        if id == r.id {
            continue;
        }
        let (nx, ny) = (x - r.x, y - r.y);
        let gap = nx.hypot(ny);
        if gap < PERSONAL_SPACE * 1.5 && nx * ux + ny * uy > -0.1 {
            let weight = (1. - gap / (PERSONAL_SPACE * 1.5)).max(0.);
            // Both walkers keep to their own right when approaching head-on.
            sx += uy * weight * 2.;
            sy -= ux * weight * 2.;
            if gap > 0.001 {
                sx -= nx / gap * weight;
                sy -= ny / gap * weight;
            }
        }
    }
    let length = sx.hypot(sy).max(0.001);
    let step = (dt * 0.7).min(distance);
    let p = (r.x + sx / length * step, r.y + sy / length * step);
    let direct = (r.x + ux * step, r.y + uy * step);
    if land(p.0, p.1) {
        (r.x, r.y) = p;
    } else if land(direct.0, direct.1) {
        (r.x, r.y) = direct;
    } else if land(direct.0, r.y) {
        // Follow a bank corner along one axis rather than waiting forever for
        // a diagonal step to cross a non-land tile.
        r.x = direct.0;
    } else if land(r.x, direct.1) {
        r.y = direct.1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn a_return_walk_can_leave_a_riverbank_corner() {
        let mut g = Game::new();
        let mut q = g.app.world_mut().query::<&mut Resident>();
        let mut r = q.iter_mut(g.app.world_mut()).next().unwrap().clone();
        r.x = 23.707;
        r.y = 12.994;
        r.target_x = 10.;
        r.target_y = 15.1;
        assert!(land(r.x, r.y));
        for _ in 0..200 {
            if (r.x - r.target_x).hypot(r.y - r.target_y) < 0.08 {
                break;
            }
            walk(&mut r, &[], 0.25);
            assert!(land(r.x, r.y));
        }
        assert!((r.x - r.target_x).hypot(r.y - r.target_y) < 0.08);
    }

    #[test]
    fn neighbours_get_separate_accessible_spots_at_every_building() {
        let mut game = Game::new();
        assert!(game.restore(include_str!("../web/artwork/village-preview.json")));
        let v = game.app.world().resource::<Village>();
        for b in &v.buildings {
            let spots: Vec<_> = (0..5).map(|id| approach(v, b, id).unwrap()).collect();
            for (i, &(x, y)) in spots.iter().enumerate() {
                assert!(land(x, y), "{} has an inaccessible approach", b.kind);
                for other in v.buildings.iter().filter(|other| other.id != b.id) {
                    assert!(!interactions::occupies(
                        other,
                        x.round() as i32,
                        y.round() as i32
                    ));
                }
                for &(ox, oy) in &spots[i + 1..] {
                    assert!(
                        (x - ox).hypot(y - oy) >= PERSONAL_SPACE,
                        "{} crowds neighbours",
                        b.kind
                    );
                }
            }
        }
    }

    #[test]
    fn material_workers_have_reachable_separate_spots_at_every_source() {
        let mut game = Game::new();
        for (material, x, y) in [(0, 5, 5), (1, 10, 5), (2, 15, 5), (3, 20, 20), (4, 5, 10)] {
            assert_eq!(game.place_source(material, x, y), "ok");
        }
        let v = game.app.world().resource::<Village>();
        for source in &v.economy.sources {
            let a = material_spot(v, source.x as f32, source.y as f32, 2).unwrap();
            let b = material_spot(v, source.x as f32, source.y as f32, 3).unwrap();
            assert!(land(a.0, a.1) && land(b.0, b.1));
            assert!((a.0 - b.0).hypot(a.1 - b.1) >= PERSONAL_SPACE);
        }
    }
    #[test]
    fn preparation_spots_do_not_enter_adjacent_buildings() {
        let mut game = Game::new();
        game.app
            .world_mut()
            .resource_mut::<Village>()
            .progress
            .completed = [true; 4];
        assert_eq!(game.place("workshop", 8, 8), "ok");
        assert_eq!(game.place("home", 11, 8), "ok");
        assert_eq!(game.place("home", 12, 14), "ok");
        let v = game.app.world().resource::<Village>();
        for (x, y) in [(8., 8.), CAMP] {
            let a = material_spot(v, x, y, 2).unwrap();
            let b = material_spot(v, x, y, 3).unwrap();
            assert!((a.0 - b.0).hypot(a.1 - b.1) >= PERSONAL_SPACE);
            for p in [a, b] {
                assert!(v.buildings.iter().all(|building| !interactions::occupies(
                    building,
                    p.0.round() as i32,
                    p.1.round() as i32
                )));
            }
        }
    }
    #[test]
    fn tightly_packed_buildings_do_not_fall_back_to_a_shared_point() {
        let mut game = Game::new();
        crate::logistics::fixture_stock(
            &mut game.app.world_mut().resource_mut::<Village>(),
            0,
            1000,
        );
        for x in (2..=10).step_by(2) {
            for y in (2..=10).step_by(2) {
                assert_eq!(game.place("garden", x, y), "ok");
            }
        }
        let mut v = game.app.world().resource::<Village>().clone();
        for b in &mut v.buildings {
            b.progress = 100.;
        }
        let b = v.buildings.iter().find(|b| b.x == 6 && b.y == 6).unwrap();
        assert!(approach(&v, b, 4).is_none());
        let mut q = game.app.world_mut().query::<&Resident>();
        let mut r = q
            .iter(game.app.world())
            .find(|r| r.id == 4)
            .unwrap()
            .clone();
        interactions::start(&mut r, &v, b.id, true);
        assert_eq!(r.task, "rest");
        assert!(r.visit_building.is_none());
    }

    #[test]
    fn work_is_shared_across_available_plots_in_small_teams() {
        let mut game = Game::new();
        assert_eq!(game.place("garden", 6, 6), "ok");
        assert_eq!(game.place("garden", 10, 6), "ok");
        let mut v = game.app.world().resource::<Village>().clone();
        for task in ["build", "garden"] {
            if task == "build" {
                crate::logistics::fixture_stage(&mut v, 0);
                crate::logistics::fixture_stage(&mut v, 1);
            }
            if task == "garden" {
                for b in &mut v.buildings {
                    b.progress = 100.;
                }
            }
            let chosen: Vec<_> = (0..5)
                .map(|id| destination_building(&v, task, id).unwrap().id)
                .collect();
            assert_eq!(chosen, [0, 0, 1, 1, 0]);
        }
    }

    #[test]
    fn walkers_pass_each_other_and_reach_their_destinations() {
        let mut game = Game::new();
        let mut q = game.app.world_mut().query::<&Resident>();
        let mut people: Vec<_> = q.iter(game.app.world()).take(2).cloned().collect();
        people[0].x = 5.;
        people[0].y = 8.;
        people[0].target_x = 15.;
        people[0].target_y = 8.;
        people[1].x = 15.;
        people[1].y = 8.;
        people[1].target_x = 5.;
        people[1].target_y = 8.;
        let mut closest = f32::MAX;
        for _ in 0..160 {
            let neighbours: Vec<_> = people.iter().map(|r| (r.id, r.x, r.y)).collect();
            for r in &mut people {
                if (r.x - r.target_x).hypot(r.y - r.target_y) > 0.08 {
                    walk(r, &neighbours, 0.25);
                }
            }
            closest = closest.min((people[0].x - people[1].x).hypot(people[0].y - people[1].y));
        }
        assert!(closest >= 0.9, "Walkers passed too closely: {closest}");
        assert!(
            people
                .iter()
                .all(|r| (r.x - r.target_x).hypot(r.y - r.target_y) <= 0.08)
        );
    }

    #[test]
    fn separate_work_spots_preserve_targets_and_older_saves() {
        let mut game = Game::new();
        assert_eq!(game.place("garden", 6, 6), "ok");
        crate::logistics::fixture_finish(&mut game.app.world_mut().resource_mut::<Village>(), 0);
        let v = game.app.world().resource::<Village>().clone();
        let mut q = game.app.world_mut().query::<&mut Resident>();
        for mut r in q.iter_mut(game.app.world_mut()) {
            assign(&mut r, &v, "garden", "test", true);
        }
        let saved = game.snapshot();
        let mut restored = Game::new();
        assert!(restored.restore(&saved));
        assert_eq!(saved, restored.snapshot());
        let mut legacy: serde_json::Value = serde_json::from_str(&saved).unwrap();
        for r in legacy["residents"].as_array_mut().unwrap() {
            r.as_object_mut().unwrap().remove("activity_building");
            r["target_x"] = 6.75.into();
            r["target_y"] = 6.75.into();
        }
        assert!(restored.restore(&legacy.to_string()));
        let v = restored.app.world().resource::<Village>().clone();
        let mut q = restored.app.world_mut().query::<&Resident>();
        assert!(
            q.iter(restored.app.world())
                .all(|r| building(r, &v) == Some(0))
        );
        legacy["residents"][0]["activity_building"] = 99.into();
        assert!(!restored.restore(&legacy.to_string()));
    }
}
