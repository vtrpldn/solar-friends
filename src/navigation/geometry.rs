//! Exact footprint intersections and cell-boundary checks for walking segments.
use crate::{MAP_SIZE, Village, electricity::Owner, interactions, resource_sites};

#[derive(Clone, Copy)]
pub(super) struct Bounds {
    pub min: [f32; 2],
    pub max: [f32; 2],
}
impl Bounds {
    pub fn contains(self, p: [f32; 2]) -> bool {
        p[0] > self.min[0] && p[0] < self.max[0] && p[1] > self.min[1] && p[1] < self.max[1]
    }
    pub fn intersects(self, a: [f32; 2], b: [f32; 2]) -> bool {
        let (mut enter, mut leave) = (0_f64, 1_f64);
        for axis in 0..2 {
            let origin = f64::from(a[axis]);
            let delta = f64::from(b[axis]) - origin;
            let low = f64::from(self.min[axis]);
            let high = f64::from(self.max[axis]);
            if delta == 0. {
                if origin <= low || origin >= high {
                    return false;
                }
            } else {
                let u = (low - origin) / delta;
                let v = (high - origin) / delta;
                enter = enter.max(u.min(v));
                leave = leave.min(u.max(v));
                if enter >= leave {
                    return false;
                }
            }
        }
        enter < leave
    }
}
fn plot(size: i32, x: i32, y: i32) -> Bounds {
    let left = (x - size / 2) as f32 - 0.5;
    let back = (y - size / 2) as f32 - 0.5;
    Bounds {
        min: [left - 0.2, back - 0.2],
        max: [left + size as f32 + 0.2, back + size as f32 + 0.2],
    }
}
pub(super) fn obstacles(v: &Village) -> impl Iterator<Item = Bounds> + '_ {
    v.buildings
        .iter()
        .map(|b| plot(interactions::footprint_size(&b.kind), b.x, b.y))
        .chain(
            v.economy
                .sources
                .iter()
                .filter(|s| s.active)
                .map(|s| plot(resource_sites::size(s.material), s.x, s.y)),
        )
        .chain(
            v.power
                .network
                .nodes
                .iter()
                .filter(|n| n.owner == Owner::Ground)
                .map(|n| Bounds {
                    min: [n.x as f32 - 0.7, n.y as f32 - 0.7],
                    max: [n.x as f32 + 0.7, n.y as f32 + 0.7],
                }),
        )
}
/// The river mask changes only at integer cell boundaries. Check each crossing
/// and each intervening cell, including segments shorter than a sampling step.
pub(super) fn land_points(a: [f32; 2], b: [f32; 2]) -> Vec<[f32; 2]> {
    let mut cuts = vec![0_f64, 1_f64];
    for axis in 0..2 {
        let delta = f64::from(b[axis]) - f64::from(a[axis]);
        if delta == 0. {
            continue;
        }
        for edge in 1..MAP_SIZE {
            let t = (f64::from(edge) - f64::from(a[axis])) / delta;
            if t > 0. && t < 1. {
                cuts.push(t);
            }
        }
    }
    cuts.sort_by(f64::total_cmp);
    cuts.dedup();
    let point = |t: f64| {
        std::array::from_fn(|axis| {
            (f64::from(a[axis]) + (f64::from(b[axis]) - f64::from(a[axis])) * t) as f32
        })
    };
    let mut points = vec![a];
    for pair in cuts.windows(2) {
        points.push(point((pair[0] + pair[1]) / 2.));
        points.push(point(pair[1]));
    }
    points
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn open_footprints_allow_tangency_but_reject_any_interior_crossing() {
        let box_ = Bounds {
            min: [0., 0.],
            max: [1., 1.],
        };
        for (a, b, hit) in [
            ([-1., 0.], [2., 0.], false),
            ([-1., 1.], [1., -1.], false),
            ([-1., 0.000_001], [2., 0.000_001], true),
            ([-1., 0.5], [2., 0.5], true),
            ([0., 0.], [1., 1.], true),
            ([0., 0.], [0., 0.], false),
            ([0.5, 0.5], [0.5, 0.5], true),
        ] {
            assert_eq!(box_.intersects(a, b), hit);
            assert_eq!(box_.intersects(b, a), hit);
        }
    }
    #[test]
    fn river_cell_checks_cover_short_and_diagonal_crossings() {
        let points = land_points([1.999, 3.5], [2.001, 3.5]);
        assert!(points.contains(&[2., 3.5]));
        assert!(points.iter().any(|p| p[0] > 1.999 && p[0] < 2.));
        assert!(points.iter().any(|p| p[0] > 2. && p[0] < 2.001));
        let forward = land_points([1.9, 1.9], [3.1, 3.1]);
        assert!(forward.contains(&[2., 2.]) && forward.contains(&[3., 3.]));
        let mut reverse = land_points([3.1, 3.1], [1.9, 1.9]);
        reverse.reverse();
        assert_eq!(forward, reverse);
    }
}
