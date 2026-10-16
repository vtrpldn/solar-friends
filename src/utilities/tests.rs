use super::*;
fn scene() -> Game {
    let mut g = Game::new();
    g.start_fixture_mode("sandbox");
    for (kind, x, y) in [
        ("well", 5, 5),
        ("garden", 12, 5),
        ("kitchen", 16, 5),
        ("wetland", 5, 18),
        ("eco_toilet", 12, 18),
        ("banana_treatment", 17, 18),
        ("biodigester", 20, 12),
        ("solar_farm", 6, 9),
        ("streetlight", 18, 9),
    ] {
        assert_eq!(g.place(kind, x, y), "ok", "{kind}");
    }
    g
}
fn assert_path(v: &Village, p: &Plan) {
    assert!(!p.cells.is_empty());
    assert_eq!(p.cells.first(), Some(&p.start.cell));
    assert_eq!(p.cells.last(), Some(&p.end.cell));
    assert!(p.cells.iter().all(|c| clear(v, c[0], c[1])));
    assert!(
        p.cells
            .windows(2)
            .all(|c| (c[0][0] - c[1][0]).abs() + (c[0][1] - c[1][1]).abs() == 1)
    );
    let unique: std::collections::HashSet<_> = p.cells.iter().collect();
    assert_eq!(unique.len(), p.cells.len());
    for port in [&p.start, &p.end] {
        if port.bank_lead {
            assert_eq!(port.edge[1], port.cell[1] as f32);
            assert!((0.5..=3.5).contains(&(port.edge[0] - port.cell[0] as f32)));
        } else {
            assert_eq!(
                (port.edge[0] - port.cell[0] as f32).abs()
                    + (port.edge[1] - port.cell[1] as f32).abs(),
                0.5
            );
        }
    }
}
#[test]
fn utility_classes_only_expose_compatible_directions_and_distinct_water() {
    let g = scene();
    let v = g.app.world().resource::<Village>();
    for (kind, from, to) in [
        (Kind::Fresh, -1, 2),
        (Kind::Fresh, 0, 1),
        (Kind::Irrigation, 3, 1),
        (Kind::Greywater, 2, 3),
        (Kind::Sewage, 4, 5),
        (Kind::Sewage, 4, 6),
        (Kind::Electricity, electrical(v, 7), electrical(v, 8)),
    ] {
        assert_path(v, &plan(v, kind, from, to).unwrap());
    }
    for (kind, from, to) in [
        (Kind::Fresh, 3, 2),
        (Kind::Irrigation, 3, 2),
        (Kind::Greywater, 2, 1),
        (Kind::Sewage, 4, 1),
        (Kind::Electricity, electrical(v, 7), 2_000),
        (Kind::Fresh, 0, 0),
        (Kind::Fresh, 2, 0),
    ] {
        assert!(plan(v, kind, from, to).is_err());
    }
    assert!(Kind::parse("waste").is_none());
}
#[test]
fn footprint_ports_use_real_one_two_and_three_cell_boundaries() {
    let g = scene();
    let v = g.app.world().resource::<Village>();
    for kind in [Kind::Fresh, Kind::Electricity] {
        for e in endpoints(v, kind) {
            let left = e.x as f32 - (e.size / 2) as f32 - 0.5;
            let back = e.y as f32 - (e.size / 2) as f32 - 0.5;
            for p in e.ports {
                let [x, y] = p.edge;
                assert!(
                    x == left
                        || x == left + e.size as f32
                        || y == back
                        || y == back + e.size as f32
                );
                assert!(
                    x >= left
                        && x <= left + e.size as f32
                        && y >= back
                        && y <= back + e.size as f32
                );
                assert!(!inside(e.size, e.x, e.y, p.cell[0], p.cell[1]));
            }
        }
    }
}
#[test]
fn shortest_routes_share_clear_road_corridors_without_entering_buildings() {
    let mut g = Game::new();
    g.start_fixture_mode("sandbox");
    assert_eq!(g.place("well", 5, 5), "ok");
    assert_eq!(g.place("garden", 12, 5), "ok");
    let v = g.app.world().resource::<Village>();
    let p = plan(v, Kind::Fresh, 0, 1).unwrap();
    assert_eq!(p.cells.len(), 5);
    for cell in &p.cells {
        assert_eq!(g.toggle_road(cell[0], cell[1]), "ok");
    }
    let v = g.app.world().resource::<Village>();
    let roads = plan(v, Kind::Fresh, 0, 1).unwrap();
    assert_eq!(p.cells, roads.cells);
    assert_eq!(roads.road_cells, 5);
    assert_path(v, &roads);
}
#[test]
fn blueprints_sources_soil_jobs_and_move_destinations_are_obstacles() {
    let mut g = scene();
    assert_eq!(g.place_source(0, 13, 11), "ok");
    assert_eq!(g.queue_building_work(8, "move", 8, 22), "ok");
    let v = g.app.world().resource::<Village>();
    assert!(!clear(v, 13, 11));
    assert!(!clear(v, 8, 22));
    let mut v = v.clone();
    v.buildings[1].progress = 0.;
    assert!(!clear(&v, 12, 5));
    assert!(plan(&v, Kind::Fresh, 0, 1).unwrap_err().contains("Finish"));
    v.restoration.push(restoration::Job {
        id: simulation::Id(999),
        x: 9,
        y: 9,
        size: 2,
        building: None,
        source: None,
        created: v.minutes,
        finished: None,
        cancelled: false,
        work: 0.,
        spent: None,
    });
    assert!(!clear(&v, 8, 8));
    assert_path(&v, &plan(&v, Kind::Fresh, 0, 2).unwrap());
}
#[test]
fn inaccessible_and_separated_ports_produce_actionable_failures() {
    let g = scene();
    let mut v = g.app.world().resource::<Village>().clone();
    let template = v.buildings[8].clone();
    for (x, y) in [(5, 4), (4, 5), (5, 6), (6, 5)] {
        let mut block = template.clone();
        block.x = x;
        block.y = y;
        block.id = 100 + v.buildings.len();
        v.buildings.push(block);
    }
    assert!(
        plan(&v, Kind::Fresh, 0, 1)
            .unwrap_err()
            .contains("footprint edge")
    );
    v.buildings.truncate(9);
    for y in 1..MAP_SIZE - 1 {
        let mut block = template.clone();
        block.x = 9;
        block.y = y;
        block.id = 100 + v.buildings.len();
        v.buildings.push(block);
    }
    assert!(
        plan(&v, Kind::Fresh, 0, 1)
            .unwrap_err()
            .contains("No clear corridor")
    );
}
#[test]
fn hydro_ports_only_reach_the_safe_bank_and_routes_never_cross_water() {
    let mut g = scene();
    assert_eq!(
        g.place("hydro", (river_center(5.) - 1.35).ceil() as i32, 5),
        "ok"
    );
    let v = g.app.world().resource::<Village>();
    let endpoint = endpoints(v, Kind::Electricity)
        .into_iter()
        .find(|e| e.kind == "hydro")
        .unwrap();
    assert_eq!(endpoint.ports.len(), 1);
    assert!(endpoint.ports[0].bank_lead);
    assert_path(
        v,
        &plan(v, Kind::Electricity, electrical(v, 9), electrical(v, 8)).unwrap(),
    );
    for x in -1..=MAP_SIZE {
        for y in -1..=MAP_SIZE {
            if river_bank(x, y)
                || !(1..MAP_SIZE - 1).contains(&x)
                || !(1..MAP_SIZE - 1).contains(&y)
            {
                assert!(!clear(v, x, y));
            }
        }
    }
    let mut blocked = v.clone();
    let mut obstacle = blocked.buildings[8].clone();
    obstacle.x = endpoint.ports[0].cell[0];
    obstacle.y = 5;
    obstacle.id = 100;
    blocked.buildings.push(obstacle);
    assert!(
        plan(
            &blocked,
            Kind::Electricity,
            electrical(&blocked, 9),
            electrical(&blocked, 8)
        )
        .unwrap_err()
        .contains("footprint edge")
    );
}
#[test]
fn previews_are_read_only_repeatable_and_recompute_after_real_moves() {
    let mut g = scene();
    let before = g.snapshot();
    for _ in 0..3 {
        assert_eq!(
            g.utility_preview("fresh", 0, 1),
            g.utility_preview("fresh", 0, 1)
        );
        assert!(g.utility_endpoints("irrigation").contains("wetland"));
        assert!(
            g.utility_preview("bad", 0, 1)
                .contains("Unknown utility class")
        );
        assert!(g.utility_endpoints("bad").contains("Unknown utility class"));
        assert_eq!(g.snapshot(), before);
    }
    let preview = g.utility_preview("fresh", 0, 1);
    let mut restored = Game::new();
    assert!(restored.restore(&before));
    assert_eq!(restored.utility_preview("fresh", 0, 1), preview);
    assert_eq!(g.queue_building_work(0, "move", 5, 24), "ok");
    assert!(
        g.utility_preview("fresh", 0, 1)
            .contains("Finish building work")
    );
    assert_eq!(g.cancel_building_work(0), "ok");
    assert_eq!(g.utility_preview("fresh", 0, 1), preview);
}

#[test]
fn renewable_plots_have_separate_compatible_ports_and_keep_their_identities() {
    let mut g = scene();
    assert_eq!(g.place_source(0, 5, 24), "ok");
    assert_eq!(g.place_source(1, 12, 24), "ok");
    assert_eq!(g.place_source(3, 18, 24), "ok");
    let v = g.app.world().resource::<Village>();
    assert_path(v, &plan(v, Kind::Fresh, 0, -2).unwrap());
    assert_path(v, &plan(v, Kind::Irrigation, 3, -3).unwrap());
    assert!(plan(v, Kind::Greywater, 2, -2).is_err());
    assert!(plan(v, Kind::Fresh, 0, -4).is_err());
    assert_eq!(g.clear_source(0), "ok");
    let v = g.app.world().resource::<Village>();
    assert!(plan(v, Kind::Fresh, 0, -2).is_err());
    assert_path(v, &plan(v, Kind::Fresh, 0, -3).unwrap());
}

fn electrical(v: &Village, building: usize) -> i64 {
    i64::from(
        v.power
            .network
            .nodes
            .iter()
            .find(|n| n.owner == crate::electricity::Owner::Building(building))
            .unwrap()
            .id
            .0,
    )
}
