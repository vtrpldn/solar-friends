//! Versioned authored river geometry. Gameplay reads the frozen run definition;
//! older saves without scenario provenance retain the original property.
use crate::*;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct River {
    pub schema: u32,
    pub centers: Vec<f32>,
}
pub fn default_river() -> Option<River> {
    Some(River {
        schema: 1,
        centers: (0..MAP_SIZE).map(|y| river_center(y as f32)).collect(),
    })
}
pub fn valid(river: &Option<River>) -> bool {
    river.as_ref().is_none_or(|r| {
        r.schema == 1
            && r.centers.len() == MAP_SIZE as usize
            && r.centers
                .iter()
                .all(|x| x.is_finite() && (2.0..=(MAP_SIZE - 1) as f32).contains(x))
            && r.centers.windows(2).all(|p| (p[0] - p[1]).abs() <= 1.)
    })
}
pub fn center(v: &Village, y: f32) -> Option<f32> {
    if let Some(origin) = &v.scenario {
        center_in(&origin.definition.map, y)
    } else {
        Some(river_center(y))
    }
}
pub fn center_in(map: &scenarios::Map, y: f32) -> Option<f32> {
    let river = map.river.as_ref()?;
    let row = y.clamp(0., (MAP_SIZE - 1) as f32).floor() as usize;
    river.centers.get(row).copied()
}
pub fn bank_in(map: &scenarios::Map, x: i32, y: i32) -> bool {
    center_in(map, y as f32).is_some_and(|c| (x as f32 - c).abs() <= 2.3)
}
pub fn bank(v: &Village, x: i32, y: i32) -> bool {
    if let Some(origin) = &v.scenario {
        bank_in(&origin.definition.map, x, y)
    } else {
        river_bank(x, y)
    }
}
pub fn hydro(v: &Village, x: i32, y: i32) -> bool {
    center(v, y as f32).is_some_and(|c| {
        x as f32 >= c - 1.35
            && (x as f32) < c - 0.35
            && [-1, 1]
                .into_iter()
                .all(|dy| center(v, (y + dy) as f32).is_some_and(|next| (next - c).abs() <= 0.25))
    })
}
pub fn inland_footprint(v: &Village, kind: &str, x: i32, y: i32) -> bool {
    let size = interactions::footprint_size(kind);
    (x - size / 2..x - size / 2 + size).all(|a| {
        (y - size / 2..y - size / 2 + size)
            .all(|b| (0..MAP_SIZE).contains(&a) && (0..MAP_SIZE).contains(&b) && !bank(v, a, b))
    })
}
pub fn walkable(v: &Village, x: f32, y: f32) -> bool {
    (0.3..=MAP_SIZE as f32 - 0.3).contains(&x)
        && (0.3..=MAP_SIZE as f32 - 0.3).contains(&y)
        && !bank(v, x.floor() as i32, y.floor() as i32)
}

#[wasm_bindgen]
impl Game {
    /// Read-only cell-centre navigation from the authored arrival camp.
    /// Sample after an editing transaction, never during a pointer preview.
    pub fn navigation_overlay(&self) -> String {
        let v = self.app.world().resource::<Village>();
        let (x, y) = crate::camp(v);
        let cells: Vec<_> = navigation::access_cells(v, [x, y])
            .into_iter()
            .enumerate()
            .map(|(i, (walkable, reachable))| {
                serde_json::json!({"x":i % MAP_SIZE as usize,"y":i / MAP_SIZE as usize,"walkable":walkable,"reachable":reachable})
            })
            .collect();
        serde_json::json!({"schema":1,"width":MAP_SIZE,"height":MAP_SIZE,"origin":[x,y],"origin_clear":navigation::clear(v,x,y),"cells":cells}).to_string()
    }

    /// Owned fresh-water containers and actual resident access; no future supply
    /// or neighbour service is treated as owned stock. Query after transactions.
    pub fn fresh_water_overlay(&mut self) -> String {
        let people: Vec<_> = self
            .app
            .world_mut()
            .query::<&Resident>()
            .iter(self.app.world())
            .cloned()
            .collect();
        let v = self.app.world().resource::<Village>();
        let participants = food::service_participants(v, &people);
        let mut access = vec![false; participants.len()];
        let mut available = 0.;
        let sources: Vec<_> = v.water_supply.tanks.iter()
            .filter(|p| p.owner != water::Owner::Service && p.capacity[water::Class::Fresh.index()] > 0.)
            .map(|p| {
                let open = water::open(v, p);
                let free = water::free(v, p, water::Class::Fresh, None);
                let reached: Vec<_> = participants.iter().enumerate().filter_map(|(i, r)| {
                    if water::reachable(v, p, r) {
                        if open && free > 0. { access[i] = true; }
                        Some(r.id)
                    } else { None }
                }).collect();
                if open && !reached.is_empty() { available += free; }
                serde_json::json!({"id":p.id,"owner":p.owner,"x":p.x,"y":p.y,"open":open,"available":free,"reachable_by":reached})
            }).collect();
        serde_json::json!({"schema":1,"enabled":sandbox::utilities(v),"sources":sources,"participants":participants.iter().map(|p|p.id).collect::<Vec<_>>(),"available":available,"accessible":!access.is_empty() && access.iter().all(|a|*a),"camp_fallback":people.iter().all(|p|p.trip.is_some())}).to_string()
    }

    /// Canonical map masks for renderers and editor overlays. Callers should
    /// sample these when authored geometry changes, not on pointer movement.
    pub fn world_geometry(&self) -> String {
        let v = self.app.world().resource::<Village>();
        let cells = (0..MAP_SIZE).flat_map(|y| (0..MAP_SIZE).map(move |x| [x, y]));
        let banks: Vec<_> = cells.clone().filter(|p| bank(v, p[0], p[1])).collect();
        let hydro_sites: Vec<_> = cells.filter(|p| hydro(v, p[0], p[1])).collect();
        let river = v
            .scenario
            .as_ref()
            .map_or_else(default_river, |o| o.definition.map.river.clone());
        serde_json::json!({"schema":1,"width":MAP_SIZE,"height":MAP_SIZE,"river":river,"banks":banks,"hydro_sites":hydro_sites}).to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn definition() -> scenarios::Definition {
        scenarios::Definition::builtin(modes::Mode::Sandbox)
    }
    fn compile(d: scenarios::Definition) -> Game {
        scenarios::compile(d)
            .unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()))
            .0
    }
    #[test]
    fn navigation_overlay_matches_clear_cells_and_real_routes_without_mutation() {
        for river in [
            None,
            Some(River {
                schema: 1,
                centers: vec![20.; 64],
            }),
        ] {
            let mut d = definition();
            d.map.nature = None;
            d.map.river = river;
            let mut g = compile(d);
            assert_eq!(g.place("home", 45, 45), "ok");
            let before = g.snapshot();
            let overlay: serde_json::Value = serde_json::from_str(&g.navigation_overlay()).unwrap();
            assert_eq!(overlay["schema"], 1);
            assert_eq!(overlay["origin_clear"], true);
            let cells = overlay["cells"].as_array().unwrap();
            assert_eq!(cells.len(), 4096);
            let v = g.app.world().resource::<Village>();
            let (cx, cy) = crate::camp(v);
            for (i, cell) in cells.iter().enumerate() {
                let x = (i % 64) as f32;
                let y = (i / 64) as f32;
                assert_eq!(cell["x"], i % 64);
                assert_eq!(cell["y"], i / 64);
                let clear = navigation::clear(v, x, y);
                assert_eq!(cell["walkable"], clear);
                if !clear || i % 71 == 0 {
                    assert_eq!(
                        cell["reachable"],
                        navigation::route(v, [cx, cy], [x, y]).is_ok(),
                        "cell {x},{y}"
                    );
                }
            }
            assert_eq!(cells[45 * 64 + 45]["walkable"], false);
            assert_eq!(cells[10 * 64 + 10]["walkable"], true);
            assert_eq!(
                cells[10 * 64 + 10]["reachable"],
                v.scenario.as_ref().unwrap().definition.map.river.is_none()
            );
            assert_eq!(g.snapshot(), before);
        }
    }
    #[test]
    fn absent_river_frees_former_banks_and_removes_hydro_and_riparian_ground() {
        let mut d = definition();
        d.map.river = None;
        let mut g = compile(d);
        let v = g.app.world().resource::<Village>();
        assert!(!bank(v, 61, 10));
        assert!(!hydro(v, 61, 10));
        assert!(walkable(v, 61., 10.));
        assert_ne!(land::ground(v, 61, 10).biome, "River meadow");
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&g.land_report()).unwrap()["cells"]
                .as_array()
                .unwrap()
                .len(),
            4096
        );
        assert_eq!(g.toggle_road(61, 10), "ok");
        assert_ne!(g.place("hydro", 61, 5), "ok");
        let snapshot = g.snapshot();
        let mut loaded = Game::new();
        assert!(loaded.restore(&snapshot));
        assert_eq!(loaded.snapshot(), snapshot);
    }
    #[test]
    fn moved_course_drives_routes_building_roads_corridors_and_saves() {
        let mut d = definition();
        d.map.nature = None;
        d.map.river = Some(River {
            schema: 1,
            centers: vec![20.; 64],
        });
        let mut g = compile(d);
        let v = g.app.world().resource::<Village>();
        assert!(bank(v, 20, 10));
        assert!(!bank(v, 61, 10));
        assert!(!utilities::clear(v, 20, 10));
        assert!(!walkable(v, 20., 10.));
        assert!(navigation::route(v, [16., 10.], [25., 10.]).is_err());
        assert_eq!(land::ground(v, 17, 10).biome, "River meadow");
        assert!(
            v.land
                .vegetation
                .iter()
                .all(|t| !bank(v, t.x.floor() as i32, t.y.floor() as i32))
        );
        assert_ne!(g.toggle_road(20, 10), "ok");
        assert_eq!(g.toggle_road(61, 10), "ok");
        assert_ne!(g.place("home", 20, 10), "ok");
        assert_eq!(g.place("hydro", 19, 10), "ok");
        let raw = g.snapshot();
        let mut loaded = Game::new();
        assert!(loaded.restore(&raw));
        assert_eq!(loaded.snapshot(), raw);
    }
    #[test]
    fn footprint_cells_and_generator_orientation_follow_bends() {
        let mut d = definition();
        let mut centers = vec![20.; 64];
        centers[9] = 19.;
        d.map.nature = None;
        d.map.river = Some(River { schema: 1, centers });
        let g = compile(d);
        let v = g.app.world().resource::<Village>();
        assert!(!bank(v, 17, 10));
        assert!(bank(v, 17, 9));
        assert!(!inland_footprint(v, "home", 17, 10));
        assert!(building_work::placement(v, "home", 17, 10, None).is_err());
        assert!(!hydro(v, 19, 10));
        let mask: serde_json::Value = serde_json::from_str(&g.world_geometry()).unwrap();
        assert!(
            mask["banks"]
                .as_array()
                .unwrap()
                .contains(&serde_json::json!([17, 9]))
        );
        assert!(
            !mask["hydro_sites"]
                .as_array()
                .unwrap()
                .contains(&serde_json::json!([19, 10]))
        );
    }
    #[test]
    fn invalid_courses_are_atomic_and_legacy_queries_match_every_cell() {
        let mut g = compile(definition());
        let before = g.snapshot();
        for centers in [
            vec![20.; 63],
            vec![100.; 64],
            (0..64)
                .map(|y| if y % 2 == 0 { 20. } else { 30. })
                .collect(),
        ] {
            let mut d = definition();
            d.map.nature = None;
            d.map.river = Some(River { schema: 1, centers });
            let report = g.load_scenario(&serde_json::to_string(&d).unwrap());
            assert!(report.contains("invalid_river"));
            assert_eq!(g.snapshot(), before);
        }
        let v = g.app.world().resource::<Village>();
        for y in 0..64 {
            for x in 0..64 {
                assert_eq!(bank(v, x, y), river_bank(x, y));
            }
        }
    }
}
