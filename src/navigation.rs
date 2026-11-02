//! Shared geometry and read-only cost estimates for hauling and village work.
use crate::*;
use std::{cmp::Reverse, collections::BinaryHeap, sync::Arc};
mod geometry;

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
        && world::walkable(v, x, y)
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
    let mut land = world::walkable(v, from[0], from[1]);
    if !land
        && !v
            .buildings
            .iter()
            .any(|b| b.kind == "hydro" && !spacing::clear_plot(b, from[0], from[1]))
    {
        return false;
    }
    let obstacles: Vec<_> = geometry::obstacles(v).collect();
    let mut outside: Vec<_> = obstacles.iter().map(|b| !b.contains(from)).collect();
    for leg in path.windows(2) {
        let from = leg[0];
        let to = leg[1];
        for (bounds, out) in obstacles.iter().zip(&mut outside) {
            if *out && bounds.intersects(from, to) {
                return false;
            }
            *out |= !bounds.contains(to);
        }
        for [x, y] in geometry::land_points(from, to) {
            if world::walkable(v, x, y) {
                land = true;
            } else if land {
                return false;
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
    a.iter().chain(&b).all(|n| n.is_finite())
        && clear(v, a[0], a[1])
        && clear(v, b[0], b[1])
        && geometry::obstacles(v).all(|bounds| !bounds.intersects(a, b))
        && geometry::land_points(a, b)
            .into_iter()
            .all(|p| world::walkable(v, p[0], p[1]))
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
fn links(v: &Village, p: [f32; 2], grid: &Grid, free: &[bool]) -> Vec<usize> {
    let x = p[0].round() as i32;
    let y = p[1].round() as i32;
    let origin = cell(x.clamp(0, MAP_SIZE - 1), y.clamp(0, MAP_SIZE - 1)).unwrap();
    let mut choices = vec![];
    for dy in -1..=1 {
        for dx in -1..=1 {
            if let Some(i) = cell(x + dx, y + dy)
                && free[i]
                // The caller checked p and free[] checked the grid endpoint.
                && !grid.obstacles.blocks(origin, p, point(i))
                && geometry::land_points(p, point(i)).into_iter().all(|p| world::walkable(v, p[0], p[1]))
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
    obstacles: geometry::LocalObstacles,
}
impl Grid {
    fn new(v: &Village, layout: u32) -> Self {
        let size = (MAP_SIZE * MAP_SIZE) as usize;
        let obstacles = geometry::LocalObstacles::new(geometry::obstacles(v).collect());
        let free: Vec<_> = (0..size)
            .map(|i| {
                let p = point(i);
                // Integer grid centres use the same open plot bounds as clear(),
                // with the existing nearby index instead of a full object scan.
                world::walkable(v, p[0], p[1]) && !obstacles.contains(i, p)
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
                    // Both endpoints already passed the exact clear() check.
                    || obstacles.blocks(current, point(current), point(next))
                    || !geometry::land_points(point(current), point(next))
                        .into_iter()
                        .all(|p| world::walkable(v, p[0], p[1]))
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
            obstacles,
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

/// Cell-centre access on the same graph used by resident routes. This is a
/// read-only editor query, not a promise about transient pedestrian crowding.
pub(crate) fn access_cells(v: &Village, from: [f32; 2]) -> Vec<(bool, bool)> {
    let grid = grid(v);
    let starts = if clear(v, from[0], from[1]) {
        links(v, from, &grid, &grid.free)
    } else {
        vec![]
    };
    let paths = search(v, from, &[], &grid, &grid.free, starts, &[]);
    grid.free
        .iter()
        .enumerate()
        .map(|(i, &walkable)| {
            // Routing can finish through a fractional endpoint link even when
            // a conservative diagonal grid edge is absent. Match its goal
            // links as well as the grid component itself.
            let reachable = walkable
                && (paths.distances[i] != u32::MAX
                    || links(v, point(i), &grid, &grid.free)
                        .iter()
                        .any(|&goal| paths.distances[goal] != u32::MAX));
            (walkable, reachable)
        })
        .collect()
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
    route_to(v, from, to, people, true)
}
fn route_to(
    v: &Village,
    from: [f32; 2],
    to: [f32; 2],
    people: &[[f32; 2]],
    bounded: bool,
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
    let starts = links(v, from, &grid, free)
        .into_iter()
        .filter(|&i| crowd_clear(from, point(i), people))
        .collect::<Vec<_>>();
    let goals = links(v, to, &grid, free)
        .into_iter()
        .filter(|&i| crowd_clear(point(i), to, people))
        .collect::<Vec<_>>();
    if starts.is_empty() || goals.is_empty() {
        return Err("There is no clear approach to this route.");
    }
    let terminals: Vec<_> = goals
        .iter()
        .filter(|_| bounded)
        .map(|&i| (i, (cost(v, point(i), to) * 1000.).round() as u32))
        .collect();
    let paths = search(v, from, people, &grid, free, starts, &terminals);
    finish_route(v, from, to, people, goals, &paths)
}

struct Paths {
    distances: Vec<u32>,
    previous: Vec<Option<usize>>,
}
fn search(
    v: &Village,
    from: [f32; 2],
    people: &[[f32; 2]],
    grid: &Grid,
    free: &[bool],
    starts: Vec<usize>,
    terminals: &[(usize, u32)],
) -> Paths {
    let mut distances = vec![u32::MAX; grid.free.len()];
    let mut previous = vec![None; grid.free.len()];
    let mut queue = BinaryHeap::new();
    for start in starts {
        let n = (cost(v, from, point(start)) * 1000.).round() as u32;
        distances[start] = n;
        queue.push(Reverse((n, start)));
    }
    let mut ceiling = u32::MAX;
    while let Some(Reverse((score, current))) = queue.pop() {
        // Include equal-cost entries to preserve deterministic endpoint and
        // predecessor ties. Terminal approach cost is part of the full route;
        // reaching the first goal cell alone is not enough to stop.
        if score > ceiling {
            break;
        }
        if score != distances[current] {
            continue;
        }
        if let Some((_, approach)) = terminals.iter().find(|(i, _)| *i == current) {
            ceiling = ceiling.min(score.saturating_add(*approach));
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
    Paths {
        distances,
        previous,
    }
}
fn finish_route(
    v: &Village,
    from: [f32; 2],
    to: [f32; 2],
    people: &[[f32; 2]],
    goals: Vec<usize>,
    paths: &Paths,
) -> Result<Route, &'static str> {
    let Paths {
        distances,
        previous,
    } = paths;
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

/// A short-lived review context. Its immutable village borrow prevents reuse
/// after geometry or road costs change, and no route history enters a save.
pub(crate) struct RoutesFrom<'a> {
    village: &'a Village,
    from: [f32; 2],
    grid: Arc<Grid>,
    paths: Paths,
}
impl<'a> RoutesFrom<'a> {
    pub(crate) fn new(v: &'a Village, from: [f32; 2]) -> Option<Self> {
        if !clear(v, from[0], from[1]) {
            return None;
        }
        let grid = grid(v);
        let starts = links(v, from, &grid, &grid.free);
        if starts.is_empty() {
            return None;
        }
        let paths = search(v, from, &[], &grid, &grid.free, starts, &[]);
        Some(Self {
            village: v,
            from,
            grid,
            paths,
        })
    }
    pub(crate) fn route(&self, to: [f32; 2]) -> Result<Route, &'static str> {
        if !clear(self.village, to[0], to[1]) {
            return Err("The destination approach is blocked.");
        }
        if (self.from[0] - to[0]).hypot(self.from[1] - to[1]) < 0.001 {
            return Ok(Route {
                points: vec![self.from],
                distance: 0.,
                minutes: 0.,
            });
        }
        let goals = links(self.village, to, &self.grid, &self.grid.free);
        if goals.is_empty() {
            return Err("There is no clear approach to this route.");
        }
        finish_route(self.village, self.from, to, &[], goals, &self.paths)
    }
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
    fn indexed_grid_occupancy_matches_exhaustive_clear_and_segments() {
        let kinds = [
            "home",
            "shed",
            "garden",
            "hydro",
            "warehouse",
            "streetlight",
            "banana_treatment",
            "greenhouse",
        ];
        let mut seed = 719_u32;
        for scene in 0..12 {
            let mut v = Village::default();
            for id in 0..(scene % 5) * 64 {
                seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
                let x = (seed % MAP_SIZE as u32) as i32;
                seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
                let y = (seed % MAP_SIZE as u32) as i32;
                v.buildings.push(Building {
                    id,
                    kind: kinds[(id + scene) % kinds.len()].into(),
                    x,
                    y,
                    progress: if id % 3 == 0 { 0. } else { 100. },
                    contributors: Default::default(),
                    next_visit: 0.,
                    visits: 0,
                    crop: Default::default(),
                    poultry: Default::default(),
                    agriculture: Default::default(),
                });
            }
            for material in 0..5 {
                v.economy.sources.push(economy::Source {
                    material,
                    x: 6 + scene as i32 * 3,
                    y: 4 + material as i32 * 11,
                    active: (scene + material) % 3 != 0,
                    ..Default::default()
                });
            }
            for i in 0..8 {
                v.power.network.nodes.push(electricity::Node {
                    id: simulation::Id(i + 1),
                    owner: if i % 2 == 0 {
                        electricity::Owner::Ground
                    } else {
                        electricity::Owner::Carrier(0)
                    },
                    kind: electricity::Kind::Battery,
                    x: 4 + i as i32 * 7,
                    y: 5 + scene as i32 * 4,
                    size: 1,
                    capacity: 4.,
                    charge: 0.,
                    equipment: 0,
                });
            }
            v.roads = (2..50).map(|x| (x, 2 + scene as i32)).collect();
            let grid = Grid::new(&v, 0);
            for (i, &free) in grid.free.iter().enumerate() {
                let p = point(i);
                assert_eq!(free, clear(&v, p[0], p[1]), "scene {scene}, cell {i}");
                if i % 17 != 0 {
                    continue;
                }
                let [x, y] = p.map(|n| n as i32);
                let expected: Vec<_> = DIRECTIONS
                    .into_iter()
                    .filter_map(|(dx, dy)| {
                        let next = cell(x + dx, y + dy)?;
                        let q = point(next);
                        (free
                            && clear(&v, q[0], q[1])
                            && (dx == 0
                                || dy == 0
                                || (clear(&v, (x + dx) as f32, y as f32)
                                    && clear(&v, x as f32, (y + dy) as f32)))
                            && segment(&v, p, q))
                        .then(|| (next, (cost(&v, p, q) * 1000.).round() as u32))
                    })
                    .collect();
                assert_eq!(grid.edges[i], expected, "scene {scene}, edges {i}");
            }
        }
    }

    #[test]
    fn bounded_destination_search_matches_exhaustive_routes_with_roads_crowds_and_obstacles() {
        let mut g = Game::new();
        g.start_fixture_mode("sandbox");
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
        for x in 3..=20 {
            assert_eq!(g.toggle_road(x, 2), "ok");
        }
        // Match the simulation's shared derived grid; rebuilding the same
        // 4096-cell geometry twice per sample would dominate this oracle test.
        refresh(&mut g.app.world_mut().resource_mut::<Village>());
        let v = g.app.world().resource::<Village>();
        let crowds = [
            vec![],
            vec![[5., 5.], [6., 5.], [7., 5.]],
            vec![[10., 10.], [22.2, 15.4], [31.5, 32.5]],
        ];
        let mut seed = 42_u32;
        let mut point = || {
            seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
            (seed % 620) as f32 / 10. + 0.5
        };
        let mut success = 0;
        let mut refused = 0;
        for people in &crowds {
            for _ in 0..300 {
                let from = [point(), point()];
                let to = [point(), point()];
                let bounded = route_to(v, from, to, people, true);
                if bounded.is_ok() {
                    success += 1;
                } else {
                    refused += 1;
                }
                assert_eq!(
                    serde_json::to_value(&bounded).unwrap(),
                    serde_json::to_value(route_to(v, from, to, people, false)).unwrap(),
                    "from {from:?} to {to:?}, crowd {people:?}"
                );
            }
        }
        assert!(
            success > 100 && refused > 0,
            "success {success}, refused {refused}"
        );
        // Exercise local/fractional endpoint ties explicitly, including the
        // enclosed clearing and invalid endpoints on either side of a river.
        for from in [
            [3., 3.],
            [3.2, 3.7],
            [10., 10.],
            [10., 6.],
            [62., 3.],
            [f32::NAN, 3.],
        ] {
            for to in [[3., 3.], [4.2, 4.7], [10., 10.], [10., 6.], [62., 3.]] {
                assert_eq!(
                    serde_json::to_value(route_to(v, from, to, &[], true)).unwrap(),
                    serde_json::to_value(route_to(v, from, to, &[], false)).unwrap()
                );
            }
        }
    }
    #[test]
    fn nearby_destination_does_not_search_the_entire_reachable_map() {
        let g = Game::new();
        let v = g.app.world().resource::<Village>();
        let grid = grid(v);
        let from = [3., 3.];
        let to = [4., 4.];
        let starts = links(v, from, &grid, &grid.free);
        let goals = links(v, to, &grid, &grid.free);
        let terminals: Vec<_> = goals
            .iter()
            .map(|&i| (i, (cost(v, point(i), to) * 1000.).round() as u32))
            .collect();
        let bounded = search(v, from, &[], &grid, &grid.free, starts.clone(), &terminals);
        let exhaustive = search(v, from, &[], &grid, &grid.free, starts, &[]);
        assert!(bounded.distances.iter().filter(|&&n| n != u32::MAX).count() < 100);
        assert!(
            exhaustive
                .distances
                .iter()
                .filter(|&&n| n != u32::MAX)
                .count()
                > 1000
        );
        assert_eq!(
            serde_json::to_value(finish_route(v, from, to, &[], goals.clone(), &bounded)).unwrap(),
            serde_json::to_value(finish_route(v, from, to, &[], goals, &exhaustive)).unwrap()
        );
    }
    #[test]
    fn fractional_grid_links_match_the_original_segment_checks() {
        let mut g = Game::new();
        g.start_fixture_mode("sandbox");
        assert_eq!(g.place("well", 6, 10), "ok");
        assert_eq!(g.place("garden", 13, 15), "ok");
        let v = g.app.world().resource::<Village>();
        let grid = grid(v);
        for y in 0..MAP_SIZE {
            for x in 0..MAP_SIZE {
                for offset in [
                    [0., 0.],
                    [-0.49, -0.49],
                    [0.49, 0.49],
                    [-0.49, 0.49],
                    [0.49, -0.49],
                ] {
                    let p = [x as f32 + offset[0], y as f32 + offset[1]];
                    if !clear(v, p[0], p[1]) {
                        continue;
                    }
                    let mut expected = Vec::new();
                    for dy in -1..=1 {
                        for dx in -1..=1 {
                            if let Some(i) =
                                cell(p[0].round() as i32 + dx, p[1].round() as i32 + dy)
                                && grid.free[i]
                                && segment(v, p, point(i))
                            {
                                expected.push(i);
                            }
                        }
                    }
                    assert_eq!(links(v, p, &grid, &grid.free), expected, "{p:?}");
                }
            }
        }
    }

    #[test]
    fn opening_route_batch_matches_individual_quotes_including_fractional_and_blocked_goals() {
        let mut g = Game::new();
        g.start_fixture_mode("sandbox");
        assert_eq!(g.place("well", 6, 10), "ok");
        assert_eq!(g.place("garden", 13, 15), "ok");
        for x in 8..13 {
            assert_eq!(g.toggle_road(x, 12), "ok");
        }
        let saved = g.snapshot();
        {
            let v = g.app.world().resource::<Village>();
            for from in [[8., 10.], [8.55, 10.55]] {
                let batch = RoutesFrom::new(v, from).unwrap();
                for x in [2., 6., 8., 8.55, 13., 20., 35., 60.] {
                    for y in [2., 10., 10.55, 12., 15., 30., 60.] {
                        let expected = route(v, from, [x, y]);
                        let actual = batch.route([x, y]);
                        match (expected, actual) {
                            (Ok(a), Ok(b)) => assert_eq!(
                                serde_json::to_value(a).unwrap(),
                                serde_json::to_value(b).unwrap()
                            ),
                            (Err(a), Err(b)) => assert_eq!(a, b),
                            _ => panic!(
                                "Batch and individual route disagree at {from:?} → [{x}, {y}]"
                            ),
                        }
                    }
                }
            }
            assert!(RoutesFrom::new(v, [6., 10.]).is_none());
        }
        assert_eq!(
            saved,
            g.snapshot(),
            "Opening queries must not change a saved village"
        );
    }

    #[test]
    fn a_fractional_route_cannot_clip_a_cistern_corner_between_samples() {
        let mut g = Game::new();
        g.start_fixture_mode("sandbox");
        assert_eq!(g.place("well", 6, 10), "ok");
        let v = g.app.world().resource::<Village>();
        for x in [-1., 1.] {
            for y in [-1., 1.] {
                let from = [6. + x * 0.9463263, 10. + y * 0.592515];
                let to = [6., 10. + y];
                assert!(clear(v, from[0], from[1]) && clear(v, to[0], to[1]));
                assert!(
                    !segment(v, from, to),
                    "The short line cuts through the cistern's clearance corner"
                );
                let route = route(v, from, to).unwrap();
                assert!(route.points.len() > 2);
                for leg in route.points.windows(2) {
                    for step in 0..=1000 {
                        let t = step as f32 / 1000.;
                        assert!(clear(
                            v,
                            leg[0][0] + (leg[1][0] - leg[0][0]) * t,
                            leg[0][1] + (leg[1][1] - leg[0][1]) * t
                        ));
                    }
                }
            }
        }
    }
    #[test]
    fn standing_neighbours_do_not_trap_a_route_at_an_occupied_grid_corner() {
        let mut g = Game::new();
        g.start_fixture_mode("sandbox");
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
        g.start_fixture_mode("sandbox");
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
        g.start_fixture_mode("sandbox");
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
        g.start_fixture_mode("sandbox");
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
        g.start_fixture_mode("sandbox");
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
        g.start_fixture_mode("sandbox");
        assert!(route(g.app.world().resource::<Village>(), [2., 3.], [62., 3.]).is_err());
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
        g.start_fixture_mode("sandbox");
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
