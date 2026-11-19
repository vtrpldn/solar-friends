use std::collections::{BinaryHeap, VecDeque};

use bevy::prelude::*;

const MIN: i32 = -31;
const WIDTH: usize = 126;
const MAX: i32 = MIN + WIDTH as i32 - 1;

fn cell_index(cell: IVec2) -> Option<usize> {
    if cell.cmplt(IVec2::splat(MIN)).any() || cell.cmpgt(IVec2::splat(MAX)).any() {
        return None;
    }
    let cell = cell - IVec2::splat(MIN);
    Some(cell.y as usize * WIDTH + cell.x as usize)
}

fn grid_cell(index: usize) -> IVec2 {
    IVec2::new((index % WIDTH) as i32 + MIN, (index / WIDTH) as i32 + MIN)
}

pub fn route(
    from: Vec2,
    to: IVec2,
    mut blocked: impl FnMut(IVec2) -> bool,
    road: impl Fn(IVec2) -> bool,
) -> Option<VecDeque<Vec2>> {
    cell_index(to)?;
    if blocked(to) {
        return None;
    }
    search(
        from,
        |cell| cell == to,
        |cell| {
            let distance = (cell - to).abs();
            (distance.x + distance.y) * 13
        },
        blocked,
        road,
    )
}

pub fn reaches_any(from: Vec2, targets: &[IVec2], mut blocked: impl FnMut(IVec2) -> bool) -> bool {
    let goals: Vec<_> = targets
        .iter()
        .copied()
        .filter(|&cell| cell_index(cell).is_some() && !blocked(cell))
        .collect();
    let Some(first) = goals.first().copied() else {
        return false;
    };
    let (minimum, maximum) = goals.iter().fold((first, first), |(low, high), &cell| {
        (low.min(cell), high.max(cell))
    });
    search(
        from,
        |cell| goals.contains(&cell),
        |cell| {
            let delta = (cell - cell.clamp(minimum, maximum)).abs();
            (delta.x + delta.y) * 13
        },
        blocked,
        |_| false,
    )
    .is_some()
}

fn search(
    from: Vec2,
    goal: impl Fn(IVec2) -> bool,
    estimate: impl Fn(IVec2) -> i32,
    mut blocked: impl FnMut(IVec2) -> bool,
    road: impl Fn(IVec2) -> bool,
) -> Option<VecDeque<Vec2>> {
    let start = (from + Vec2::splat(0.5)).floor().as_ivec2();
    let start_index = cell_index(start)?;
    let mut distance = vec![i32::MAX; WIDTH * WIDTH];
    let mut parent = vec![None; WIDTH * WIDTH];
    let mut queue = BinaryHeap::new();
    distance[start_index] = 0;
    queue.push((std::cmp::Reverse(estimate(start)), 0, start_index));

    while let Some((_, queued_cost, current)) = queue.pop() {
        let cost = distance[current];
        if queued_cost != cost {
            continue;
        }
        let position = grid_cell(current);
        if goal(position) {
            let mut path = VecDeque::new();
            let mut node = current;
            while let Some(parent_index) = parent[node] {
                path.push_front(grid_cell(node).as_vec2());
                node = parent_index;
            }
            if path.is_empty() && from != position.as_vec2() {
                path.push_back(position.as_vec2());
            }
            return Some(path);
        }
        for direction in [IVec2::X, IVec2::NEG_X, IVec2::Y, IVec2::NEG_Y] {
            let next = position + direction;
            let Some(index) = cell_index(next) else {
                continue;
            };
            let next_cost = cost + if road(next) { 13 } else { 20 };
            if next_cost >= distance[index] || blocked(next) {
                continue;
            }
            distance[index] = next_cost;
            parent[index] = Some(current);
            queue.push((
                std::cmp::Reverse(next_cost + estimate(next)),
                next_cost,
                index,
            ));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn routes_around_blocked_cells() {
        let path = route(
            Vec2::ZERO,
            IVec2::new(2, 0),
            |cell| cell == IVec2::X,
            |_| false,
        )
        .unwrap();
        assert_eq!(path.len(), 4);
        assert_eq!(path.back(), Some(&Vec2::new(2.0, 0.0)));
        assert!(!path.contains(&Vec2::X));
    }
}
