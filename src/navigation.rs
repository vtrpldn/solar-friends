//! Routes and read-only cost estimates for resident material hauling.
//! Other resident activities retain the existing movement system.
use crate::*;
use std::{cmp::Reverse, collections::BinaryHeap};

#[derive(Clone, Debug, Serialize)]
pub struct Route {
    pub points: Vec<[f32; 2]>,
    pub distance: f32,
    pub minutes: f32,
}
pub fn clear(v: &Village, x: f32, y: f32) -> bool {
    x.is_finite()
        && y.is_finite()
        && spacing::land(x, y)
        && v.buildings.iter().all(|b| spacing::clear_plot(b, x, y))
        && v.economy.sources.iter().filter(|s| s.active).all(|s| {
            let n = resource_sites::size(s.material) as f32;
            let left = s.x as f32 - (n / 2.).floor() - 0.5;
            let top = s.y as f32 - (n / 2.).floor() - 0.5;
            x <= left - 0.2 || x >= left + n + 0.2 || y <= top - 0.2 || y >= top + n + 0.2
        })
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
pub fn route(v: &Village, from: [f32; 2], to: [f32; 2]) -> Result<Route, &'static str> {
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
    let size = (MAP_SIZE * MAP_SIZE) as usize;
    let free: Vec<_> = (0..size)
        .map(|i| {
            let p = point(i);
            clear(v, p[0], p[1])
        })
        .collect();
    let starts = links(v, from, &free);
    let goals = links(v, to, &free);
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
        let [x, y] = point(current);
        for (dx, dy) in [
            (1, 0),
            (-1, 0),
            (0, 1),
            (0, -1),
            (1, 1),
            (1, -1),
            (-1, 1),
            (-1, -1),
        ] {
            let Some(next) = cell(x as i32 + dx, y as i32 + dy) else {
                continue;
            };
            if !free[next] {
                continue;
            }
            if dx != 0
                && dy != 0
                && (!free[cell(x as i32 + dx, y as i32).unwrap()]
                    || !free[cell(x as i32, y as i32 + dy).unwrap()])
            {
                continue;
            }
            if !segment(v, point(current), point(next)) {
                continue;
            }
            let candidate = score + (cost(v, point(current), point(next)) * 1000.).round() as u32;
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
        serde_json::json!({"route":route,"blocker":blocker,"model":"planned_haul",
            "note":"Hauling route estimate. Ordinary resident walks still use the existing movement system."}).to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
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
