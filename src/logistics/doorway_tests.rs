use super::*;

fn reference(v: &Village, p: &Store, to: [f32; 2]) -> bool {
    // A blueprint can enclose a walker carrying goods. Its interrupted load
    // remains inside that plot, reachable through the same bounded departure
    // geometry as an occupied worksite. It cannot cross another foundation.
    if p.owner == Owner::Ground {
        return navigation::exit_segment(v, [p.x, p.y], to);
    }
    // River generators are supplied from a land approach. Their connection to
    // that approach crosses water; the resident's walking route never does.
    let river_structure = v
        .buildings
        .iter()
        .any(|b| b.kind == "hydro" && (p.owner == Owner::Site(b.id) || matches!(p.owner, Owner::Maintenance(id) if maintenance::jobs::job(v,id).and_then(|j|maintenance::jobs::building(v,j.equipment))==Some(b.id))));
    let steps = ((to[0] - p.x).hypot(to[1] - p.y) / 0.1).ceil().max(1.) as u32;
    (0..=steps).all(|i| {
        let t = i as f32 / steps as f32;
        let x = p.x + (to[0] - p.x) * t;
        let y = p.y + (to[1] - p.y) * t;
        (world::walkable(v, x, y) || river_structure)
            && v.buildings
                .iter()
                .filter(|b| !matches!(p.owner,Owner::Site(id)|Owner::Warehouse(id)|Owner::Pantry(id) if id==b.id)
                    && !matches!(p.owner,Owner::Production(id) if production::building(v,id)==Some(b.id))
                    && !matches!(p.owner,Owner::Maintenance(id) if maintenance::jobs::job(v,id).is_some_and(|j|matches!(j.equipment,maintenance::Equipment::Workshop(k) if k==b.id)||matches!(j.equipment,maintenance::Equipment::Battery(k) if v.power.network.nodes.iter().any(|n|n.id==k&&n.owner==electricity::Owner::Building(b.id)))))
                    && !matches!(p.owner,Owner::Restoration(id) if restoration::job(v,id).and_then(|j|j.building)==Some(b.id)))
                .all(|b| spacing::clear_plot(b, x, y))
            && v.economy
                .sources
                .iter()
                .enumerate()
                .filter(|(index, s)| s.active && p.owner != Owner::Source(*index) && !matches!(p.owner,Owner::Restoration(id) if restoration::job(v,id).and_then(|j|j.source)==Some(*index)))
                .all(|(_, s)| {
                    let n = resource_sites::size(s.material);
                    let left = (s.x - n / 2) as f32 - 0.5;
                    let top = (s.y - n / 2) as f32 - 0.5;
                    x <= left - 0.2
                        || x >= left + n as f32 + 0.2
                        || y <= top - 0.2
                        || y >= top + n as f32 + 0.2
                })
    })
}

#[test]
fn prepared_doorway_matches_the_original_sampled_geometry() {
    let mut g = Game::new();
    assert!(g.start_mode("sandbox"));
    let kinds = [
        "home",
        "warehouse",
        "kitchen",
        "garden",
        "shed",
        "workshop",
        "well",
        "compost",
    ];
    for (i, (x, y)) in (4..60)
        .step_by(4)
        .flat_map(|y| (4..60).step_by(4).map(move |x| (x, y)))
        .enumerate()
    {
        let _ = g.place(kinds[i % kinds.len()], x, y);
    }
    let v = g.app.world().resource::<Village>();
    let stores = &v.logistics.as_ref().unwrap().stores;
    assert!(v.buildings.len() > 100);
    let mut checked = 0;
    for p in stores {
        for (dx, dy) in [
            (-3.2, 0.),
            (0., -3.2),
            (3.2, 0.),
            (0., 3.2),
            (-1.7, -1.7),
            (1.7, 1.7),
            (0., 0.),
            (0.2, -0.2),
        ] {
            let to = [p.x + dx, p.y + dy];
            assert_eq!(
                doorway(v, p, to),
                reference(v, p, to),
                "owner {:?}, destination {to:?}",
                p.owner
            );
            checked += 1;
        }
    }
    // Exercise exact open plot boundaries and neighbouring representable values.
    let mut p = stores[0].clone();
    p.owner = Owner::Camp;
    for b in &v.buildings {
        let n = interactions::footprint_size(&b.kind);
        let edge = (b.x - n / 2) as f32 - 0.5 - 0.2;
        p.x = edge;
        p.y = b.y as f32;
        for x in [
            edge,
            f32::from_bits(edge.to_bits() - 1),
            f32::from_bits(edge.to_bits() + 1),
        ] {
            for dy in [0., 0.1, 1.] {
                let to = [x, p.y + dy];
                assert_eq!(
                    doorway(v, &p, to),
                    reference(v, &p, to),
                    "boundary of {} {}",
                    b.kind,
                    b.id
                );
                checked += 1;
            }
        }
    }
    assert!(checked > 2000);
}
