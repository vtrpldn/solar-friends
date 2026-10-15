//! Shared geometry and read-only cost estimates for hauling and village work.
use crate::*;
use std::{cmp::Reverse, collections::BinaryHeap, sync::Arc};

#[derive(Clone, Debug, Serialize)]
pub struct Route {
    pub points: Vec<[f32; 2]>,
    pub distance: f32,
    pub minutes: f32,
}
fn source_clear(s: &economy::Source, x: f32, y: f32) -> bool {
    let n = resource_sites::size(s.material) as f32;
    let left = s.x as f32 - (n / 2.).floor() - 0.5;
    let top = s.y as f32 - (n / 2.).floor() - 0.5;
    x <= left - 0.2 || x >= left + n + 0.2 || y <= top - 0.2 || y >= top + n + 0.2
}
pub fn clear(v: &Village, x: f32, y: f32) -> bool {
    x.is_finite()
        && y.is_finite()
        && spacing::land(x, y)
        && power::batteries::clear_at(v, x, y)
        && v.buildings.iter().all(|b| spacing::clear_plot(b, x, y))
        && v.economy
            .sources
            .iter()
            .filter(|s| s.active)
            .all(|s| source_clear(s, x, y))
}
/// Leave an occupied origin without entering any other plot or re-entering a
/// boundary already crossed. This is also the line of access to a worksite.
pub fn departure_step(v: &Village, from: [f32; 2], to: [f32; 2]) -> bool {
    departure_path(v, &[from, to])
}
/// Keep the occupied-origin permission across a steering turn, including the
/// water beside a river generator. Each plot boundary may be crossed once.
pub(crate) fn departure_turn(v: &Village, origin: [f32; 2], turn: [f32; 2], to: [f32; 2]) -> bool {
    clear(v, to[0], to[1]) && departure_path(v, &[origin, turn, to])
}
fn departure_path(v: &Village, path: &[[f32; 2]]) -> bool {
    let from = path[0];
    if path.iter().flatten().any(|n| !n.is_finite()) {
        return false;
    }
    let mut land = spacing::land(from[0], from[1]);
    if !land
        && !v
            .buildings
            .iter()
            .any(|b| b.kind == "hydro" && !spacing::clear_plot(b, from[0], from[1]))
    {
        return false;
    }
    let sources: Vec<_> = v.economy.sources.iter().filter(|s| s.active).collect();
    let mut buildings_out: Vec<_> = v
        .buildings
        .iter()
        .map(|b| spacing::clear_plot(b, from[0], from[1]))
        .collect();
    let mut sources_out: Vec<_> = sources
        .iter()
        .map(|s| source_clear(s, from[0], from[1]))
        .collect();
    let banks: Vec<_> = v
        .power
        .network
        .nodes
        .iter()
        .filter(|n| n.owner == crate::electricity::Owner::Ground)
        .collect();
    let mut banks_out: Vec<_> = banks
        .iter()
        .map(|n| power::batteries::clear_bank(n, from[0], from[1]))
        .collect();
    for leg in path.windows(2) {
        let from = leg[0];
        let to = leg[1];
        let steps = ((from[0] - to[0]).hypot(from[1] - to[1]) / 0.1)
            .ceil()
            .max(1.) as u32;
        for i in 0..=steps {
            let t = i as f32 / steps as f32;
            let x = from[0] + (to[0] - from[0]) * t;
            let y = from[1] + (to[1] - from[1]) * t;
            if spacing::land(x, y) {
                land = true;
            } else if land {
                return false;
            }
            for (j, b) in v.buildings.iter().enumerate() {
                if spacing::clear_plot(b, x, y) {
                    buildings_out[j] = true;
                } else if buildings_out[j] {
                    return false;
                }
            }
            for (j, n) in banks.iter().enumerate() {
                if power::batteries::clear_bank(n, x, y) {
                    banks_out[j] = true;
                } else if banks_out[j] {
                    return false;
                }
            }
            for (j, s) in sources.iter().enumerate() {
                if source_clear(s, x, y) {
                    sources_out[j] = true;
                } else if sources_out[j] {
                    return false;
                }
            }
        }
    }
    true
}
pub fn exit_segment(v: &Village, from: [f32; 2], to: [f32; 2]) -> bool {
    clear(v, to[0], to[1]) && departure_step(v, from, to)
}

/// A resident already inside a plot can walk out through its own edge. Normal
/// travel remains on the shared route graph; this never grants a shortcut into
/// a different foundation.
pub fn work_route(
    v: &Village,
    from: [f32; 2],
    to: [f32; 2],
) -> Result<(Route, bool), &'static str> {
    if clear(v, from[0], from[1]) {
        return route(v, from, to).map(|r| (r, false));
    }
    if !clear(v, to[0], to[1]) {
        return Err("The work approach is blocked.");
    }
    let mut best: Option<Route> = None;
    for direction in 0..16 {
        let angle = direction as f32 * std::f32::consts::TAU / 16.;
        for step in 1..=18 {
            let radius = step as f32 * 0.25;
            let p = [
                from[0] + radius * angle.cos(),
                from[1] + radius * angle.sin(),
            ];
            if !exit_segment(v, from, p) {
                continue;
            }
            if let Ok(mut path) = route(v, p, to) {
                let distance = (from[0] - p[0]).hypot(from[1] - p[1]);
                path.points.insert(0, from);
                path.distance += distance;
                path.minutes += distance * MINUTES_PER_SECOND / 0.7;
                if best.as_ref().is_none_or(|b| path.minutes < b.minutes) {
                    best = Some(path);
                }
            }
            break;
        }
    }
    best.map(|r| (r, true))
        .ok_or("There is no clear way out to this worksite.")
}
pub(crate) fn segment(v: &Village, a: [f32; 2], b: [f32; 2]) -> bool {
    let distance = (b[0] - a[0]).hypot(b[1] - a[1]);
    let steps = (distance / 0.1).ceil().max(1.) as u32;
    (0..=steps).all(|i| {
        let t = i as f32 / steps as f32;
        clear(v, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
    })
}
fn point(cell: usize) -> [f32; 2] {
    [
        (cell % MAP_SIZE as usize) as f32,
        (cell / MAP_SIZE as usize) as f32,
    ]
}
fn cell(x: i32, y: i32) -> Option<usize> {
    ((0..MAP_SIZE).contains(&x) && (0..MAP_SIZE).contains(&y))
        .then_some((y * MAP_SIZE + x) as usize)
}
fn road(v: &Village, p: [f32; 2]) -> bool {
    v.roads
        .contains(&(p[0].round() as i32, p[1].round() as i32))
}
pub fn cost(v: &Village, a: [f32; 2], b: [f32; 2]) -> f32 {
    (b[0] - a[0]).hypot(b[1] - a[1]) * if road(v, a) && road(v, b) { 0.6 } else { 1. }
}
fn links(v: &Village, p: [f32; 2], free: &[bool]) -> Vec<usize> {
    let x = p[0].round() as i32;
    let y = p[1].round() as i32;
    let mut choices = vec![];
    for dy in -1..=1 {
        for dx in -1..=1 {
            if let Some(i) = cell(x + dx, y + dy)
                && free[i]
                && segment(v, p, point(i))
            {
                choices.push(i);
            }
        }
    }
    choices
}
const DIRECTIONS: [(i32, i32); 8] = [
    (1, 0),
    (-1, 0),
    (0, 1),
    (0, -1),
    (1, 1),
    (1, -1),
    (-1, 1),
    (-1, -1),
];
/// Derived geometry only. Caches never enter saves or change simulation time.
pub struct Grid {
    layout: u32,
    free: Vec<bool>,
    edges: Vec<Vec<(usize, u32)>>,
}
impl Grid {
    fn new(v: &Village, layout: u32) -> Self {
        let size = (MAP_SIZE * MAP_SIZE) as usize;
        let free: Vec<_> = (0..size)
            .map(|i| {
                let p = point(i);
                clear(v, p[0], p[1])
            })
            .collect();
        let mut edges = vec![vec![]; size];
        for current in 0..size {
            if !free[current] {
                continue;
            }
            let [x, y] = point(current);
            for (dx, dy) in DIRECTIONS {
                let Some(next) = cell(x as i32 + dx, y as i32 + dy) else {
                    continue;
                };
                if !free[next]
                    || (dx != 0
                        && dy != 0
                        && (!free[cell(x as i32 + dx, y as i32).unwrap()]
                            || !free[cell(x as i32, y as i32 + dy).unwrap()]))
                    || !segment(v, point(current), point(next))
                {
                    continue;
                }
                edges[current].push((
                    next,
                    (cost(v, point(current), point(next)) * 1000.).round() as u32,
                ));
            }
        }
        Self {
            layout,
            free,
            edges,
        }
    }
}
fn grid(v: &Village) -> Arc<Grid> {
    let layout = logistics::layout(v);
    v.navigation
        .as_ref()
        .filter(|g| g.layout == layout)
        .cloned()
        .unwrap_or_else(|| Arc::new(Grid::new(v, layout)))
}
pub fn refresh(v: &mut Village) {
    v.navigation = Some(grid(v));
}

pub fn route(v: &Village, from: [f32; 2], to: [f32; 2]) -> Result<Route, &'static str> {
    route_avoiding(v, from, to, &[])
}
fn crowd_clear(a: [f32; 2], b: [f32; 2], people: &[[f32; 2]]) -> bool {
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    let length = dx * dx + dy * dy;
    people.iter().all(|p| {
        let start = (a[0] - p[0]).hypot(a[1] - p[1]);
        let t = if length <= 0.000001 {
            0.
        } else {
            ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length
        };
        if start < spacing::PERSONAL_SPACE {
            t <= 0.00001 && (b[0] - p[0]).hypot(b[1] - p[1]) >= start
        } else {
            let t = t.clamp(0., 1.);
            (a[0] + t * dx - p[0]).hypot(a[1] + t * dy - p[1]) >= spacing::PERSONAL_SPACE
        }
    })
}
pub(crate) fn route_avoiding(
    v: &Village,
    from: [f32; 2],
    to: [f32; 2],
    people: &[[f32; 2]],
) -> Result<Route, &'static str> {
    if !clear(v, from[0], from[1]) {
        return Err("The pickup approach is blocked.");
    }
    if !clear(v, to[0], to[1]) {
        return Err("The destination approach is blocked.");
    }
    if (from[0] - to[0]).hypot(from[1] - to[1]) < 0.001 {
        return Ok(Route {
            points: vec![from],
            distance: 0.,
            minutes: 0.,
        });
    }
    let grid = grid(v);
    let size = grid.free.len();
    let crowd_free;
    let free = if people.is_empty() {
        &grid.free
    } else {
        crowd_free = grid
            .free
            .iter()
            .enumerate()
            .map(|(i, &free)| {
                free && people.iter().all(|p| {
                    (point(i)[0] - p[0]).hypot(point(i)[1] - p[1]) >= spacing::PERSONAL_SPACE
                })
            })
            .collect::<Vec<_>>();
        &crowd_free
    };
    let starts = links(v, from, free)
        .into_iter()
        .filter(|&i| crowd_clear(from, point(i), people))
        .collect::<Vec<_>>();
    let goals = links(v, to, free)
        .into_iter()
        .filter(|&i| crowd_clear(point(i), to, people))
        .collect::<Vec<_>>();
    if starts.is_empty() || goals.is_empty() {
        return Err("There is no clear approach to this route.");
    }
    let mut distances = vec![u32::MAX; size];
    let mut previous = vec![None; size];
    let mut queue = BinaryHeap::new();
    for start in starts {
        let n = (cost(v, from, point(start)) * 1000.).round() as u32;
        distances[start] = n;
        queue.push(Reverse((n, start)));
    }
    while let Some(Reverse((score, current))) = queue.pop() {
        if score != distances[current] {
            continue;
        }
        for &(next, edge) in &grid.edges[current] {
            if !free[next] || !crowd_clear(point(current), point(next), people) {
                continue;
            }
            let candidate = score + edge;
            if candidate < distances[next] {
                distances[next] = candidate;
                previous[next] = Some(current);
                queue.push(Reverse((candidate, next)));
            }
        }
    }
    let target = goals
        .into_iter()
        .filter(|&i| distances[i] != u32::MAX)
        .min_by_key(|&i| {
            (
                distances[i] + (cost(v, point(i), to) * 1000.).round() as u32,
                i,
            )
        })
        .ok_or("No walkable route reaches this destination.")?;
    let mut points = vec![to];
    let mut at = Some(target);
    while let Some(i) = at {
        points.push(point(i));
        at = previous[i];
    }
    points.push(from);
    points.reverse();
    points.dedup();
    let mut effort: f32 = points.windows(2).map(|p| cost(v, p[0], p[1])).sum();
    // Very short fractional approaches need not walk to a grid centre first.
    // Keep this edge local: road prices describe a step, not an unpaved gap
    // between two remote road endpoints.
    if (from[0] - to[0]).hypot(from[1] - to[1]) <= 1.
        && segment(v, from, to)
        && crowd_clear(from, to, people)
        && cost(v, from, to) <= effort
    {
        points = vec![from, to];
        effort = cost(v, from, to);
    }
    let distance = points
        .windows(2)
        .map(|p| (p[1][0] - p[0][0]).hypot(p[1][1] - p[0][1]))
        .sum();
    Ok(Route {
        points,
        distance,
        minutes: effort * MINUTES_PER_SECOND / 0.7,
    })
}

#[wasm_bindgen]
impl Game {
    pub fn route_quote(&self, from_x: f32, from_y: f32, to_x: f32, to_y: f32) -> String {
        let v = self.app.world().resource::<Village>();
        let (route, blocker) = match route(v, [from_x, from_y], [to_x, to_y]) {
            Ok(route) => (Some(route), None),
            Err(blocker) => (None, Some(blocker)),
        };
        serde_json::json!({"route":route,"blocker":blocker,"model":"routed_work",
            "note":"Clear-ground route estimate used by hauling and village work. Needs, leisure and off-site commutes retain their current routines."}).to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn standing_neighbours_do_not_trap_a_route_at_an_occupied_grid_corner() {
        let mut g = Game::new();
        g.start_mode("sandbox");
        assert_eq!(g.place("square", 6, 6), "ok");
        let raw = g.snapshot();
        let v = g.app.world().resource::<Village>();
        let from = [8., 10.];
        let to = [8.55, 6.];
        let people = [[7.8031225, 7.8031225], [6., 8.55]];
        let ordinary = route(v, from, to).unwrap();
        assert!(ordinary.points.iter().any(|p| (p[0]-people[0][0]).hypot(p[1]-people[0][1]) < spacing::PERSONAL_SPACE));
        let detour = route_avoiding(v, from, to, &people).unwrap();
        for leg in detour.points.windows(2) {
            assert!(segment(v, leg[0], leg[1]));
            for step in 0..=100 {
                let t = step as f32 / 100.;
                let p = [
                    leg[0][0] + (leg[1][0] - leg[0][0]) * t,
                    leg[0][1] + (leg[1][1] - leg[0][1]) * t,
                ];
                assert!(
                    people
                        .iter()
                        .all(|q| (p[0] - q[0]).hypot(p[1] - q[1])
                            >= spacing::PERSONAL_SPACE - 0.0001)
                );
            }
        }
        assert!(detour.distance < ordinary.distance + 8.);
        assert_eq!(g.snapshot(), raw);
    }
    #[test]
    fn derived_graph_reuse_and_invalidation_preserve_queries_and_exact_routes() {
        let mut g = Game::new();
        g.start_mode("sandbox");
        let before = g.snapshot();
        refresh(&mut g.app.world_mut().resource_mut::<Village>());
        assert_eq!(g.snapshot(), before);
        let old = g
            .app
            .world()
            .resource::<Village>()
            .navigation
            .as_ref()
            .unwrap()
            .clone();
        refresh(&mut g.app.world_mut().resource_mut::<Village>());
        assert!(Arc::ptr_eq(
            &old,
            g.app
                .world()
                .resource::<Village>()
                .navigation
                .as_ref()
                .unwrap()
        ));
        let path = route(g.app.world().resource::<Village>(), [3., 3.], [13., 3.]).unwrap();
        let mut uncached = g.app.world().resource::<Village>().clone();
        uncached.navigation = None;
        assert_eq!(
            serde_json::to_string(&path).unwrap(),
            serde_json::to_string(&route(&uncached, [3., 3.], [13., 3.]).unwrap()).unwrap()
        );
        for x in 3..=13 {
            g.toggle_road(x, 3);
        }
        refresh(&mut g.app.world_mut().resource_mut::<Village>());
        assert!(!Arc::ptr_eq(
            &old,
            g.app
                .world()
                .resource::<Village>()
                .navigation
                .as_ref()
                .unwrap()
        ));
        assert!(
            route(g.app.world().resource::<Village>(), [3., 3.], [13., 3.])
                .unwrap()
                .minutes
                < path.minutes
        );
    }
    #[test]
    fn an_occupied_origin_can_exit_but_cannot_cross_another_building() {
        let mut g = Game::new();
        g.start_mode("sandbox");
        g.place("home", 8, 8);
        g.place("home", 12, 8);
        let v = g.app.world().resource::<Village>();
        let (p, exiting) = work_route(v, [8., 8.], [16., 8.]).unwrap();
        assert!(exiting);
        assert_eq!(p.points[0], [8., 8.]);
        assert!(exit_segment(v, p.points[0], p.points[1]));
        assert!(p.points[1..].windows(2).all(|p| segment(v, p[0], p[1])));
        assert!(!departure_step(v, [8., 8.], [12., 8.]));
        assert!(!departure_step(v, [10., 8.], [8., 8.]));
    }
    #[test]
    fn roads_improve_the_same_route_without_spending_goods_or_time() {
        let mut g = Game::new();
        g.start_mode("sandbox");
        let open = route(g.app.world().resource::<Village>(), [3., 3.], [13., 3.]).unwrap();
        for x in 3..=13 {
            assert_eq!(g.toggle_road(x, 3), "ok");
        }
        let before = g.snapshot();
        let paved = route(g.app.world().resource::<Village>(), [3., 3.], [13., 3.]).unwrap();
        assert!((paved.distance - open.distance).abs() < 0.001);
        assert!((paved.minutes / open.minutes - 0.6).abs() < 0.001);
        g.route_quote(3., 3., 13., 3.);
        assert_eq!(g.snapshot(), before);
    }
    #[test]
    fn routes_detour_around_foundations_and_never_cut_a_corner() {
        let mut g = Game::new();
        g.start_mode("sandbox");
        assert_eq!(g.place("home", 8, 8), "ok");
        let v = g.app.world().resource::<Village>();
        let path = route(v, [4., 8.], [12., 8.]).unwrap();
        assert!(path.distance > 8.);
        assert!(path.points.windows(2).all(|p| segment(v, p[0], p[1])));
        assert!(route(v, [4., 8.], [8., 8.]).is_err());
        assert!(!segment(v, [6., 7.], [7., 6.]));
    }
    #[test]
    fn river_and_enclosed_clearings_have_honest_blockers() {
        let mut g = Game::new();
        g.start_mode("sandbox");
        assert!(route(g.app.world().resource::<Village>(), [2., 3.], [27., 3.]).is_err());
        for (x, y) in [
            (8, 4),
            (10, 4),
            (12, 4),
            (8, 6),
            (12, 6),
            (8, 8),
            (10, 8),
            (12, 8),
        ] {
            assert_eq!(g.place("home", x, y), "ok");
        }
        let v = g.app.world().resource::<Village>();
        assert!(clear(v, 10., 6.));
        assert!(route(v, [3., 3.], [10., 6.]).is_err());
        assert!(route(v, [f32::NAN, 3.], [3., 3.]).is_err());
        assert!(route(v, [3., 3.], [f32::INFINITY, 3.]).is_err());
    }
    #[test]
    fn fractional_approaches_and_zero_distance_remain_walkable() {
        let g = Game::new();
        let v = g.app.world().resource::<Village>();
        let path = route(v, [3.2, 3.4], [9.3, 7.8]).unwrap();
        assert_eq!(path.points.first(), Some(&[3.2, 3.4]));
        assert_eq!(path.points.last(), Some(&[9.3, 7.8]));
        assert!(path.points.windows(2).all(|p| segment(v, p[0], p[1])));
        assert_eq!(route(v, [4., 4.], [4., 4.]).unwrap().minutes, 0.);
        let short = route(v, [3.1, 3.1], [3.2, 3.2]).unwrap();
        assert_eq!(short.points, vec![[3.1, 3.1], [3.2, 3.2]]);
        assert!((short.distance - 0.02_f32.sqrt()).abs() < 0.001);
    }
    #[test]
    fn a_source_plot_changes_access_and_road_edits_change_cost_immediately() {
        let mut g = Game::new();
        g.start_mode("sandbox");
        let open = route(g.app.world().resource::<Village>(), [4., 5.], [12., 5.]).unwrap();
        assert_eq!(g.place_source(0, 8, 5), "ok");
        let v = g.app.world().resource::<Village>();
        assert!(!clear(v, 8., 5.));
        let around = route(v, [4., 5.], [12., 5.]).unwrap();
        assert!(around.distance > open.distance);
        for x in 3..=13 {
            assert_eq!(g.toggle_road(x, 3), "ok");
        }
        let before = g.route_quote(3., 3., 13., 3.);
        assert_eq!(before, g.route_quote(3., 3., 13., 3.));
        for x in 3..=13 {
            assert_eq!(g.toggle_road(x, 3), "ok");
        }
        let unpaved: serde_json::Value =
            serde_json::from_str(&g.route_quote(3., 3., 13., 3.)).unwrap();
        let paved: serde_json::Value = serde_json::from_str(&before).unwrap();
        assert!(
            unpaved["route"]["minutes"].as_f64().unwrap()
                > paved["route"]["minutes"].as_f64().unwrap()
        );
    }
}
