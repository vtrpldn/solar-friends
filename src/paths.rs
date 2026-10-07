use serde::{Deserialize, Serialize};

// Half-tile samples retain individual shortcuts without tying paths to buildings.
pub const SIDE: usize = crate::MAP_SIZE as usize * 2;
const MAX_WEAR: f32 = 12.;
#[derive(Clone, Serialize, Deserialize)]
pub struct Paths {
    pub wear: Vec<f32>,
    pub revision: u64,
}
impl Default for Paths {
    fn default() -> Self {
        Self {
            wear: vec![0.; SIDE * SIDE],
            revision: 0,
        }
    }
}
impl Paths {
    pub fn valid(&self) -> bool {
        self.wear.len() == SIDE * SIDE
            && self
                .wear
                .iter()
                .all(|w| w.is_finite() && (0. ..=MAX_WEAR).contains(w))
    }

    pub fn walk(&mut self, from: (f32, f32), to: (f32, f32)) {
        let distance = (to.0 - from.0).hypot(to.1 - from.1);
        let samples = (distance / 0.05).ceil() as usize;
        // Deposit distance, not frames or elapsed time: resting never wears a road.
        for sample in 0..samples {
            let t = (sample as f32 + 0.5) / samples as f32;
            let x = (from.0 + (to.0 - from.0) * t) * 2.;
            let y = (from.1 + (to.1 - from.1) * t) * 2.;
            for iy in y.floor() as i32..=y.floor() as i32 + 1 {
                for ix in x.floor() as i32..=x.floor() as i32 + 1 {
                    if ix < 0 || iy < 0 || ix >= SIDE as i32 || iy >= SIDE as i32 {
                        continue;
                    }
                    let wx = ix as f32 / 2.;
                    let wy = iy as f32 / 2.;
                    if wx >= 25.8 + (wy * 0.32).sin() * 0.65 - 2.3 {
                        continue;
                    }
                    let weight = (1. - (x - ix as f32).abs()) * (1. - (y - iy as f32).abs());
                    let cell = &mut self.wear[iy as usize * SIDE + ix as usize];
                    let old = (*cell * 4.).floor();
                    *cell = (*cell + distance / samples as f32 * weight).min(MAX_WEAR);
                    if (*cell * 4.).floor() != old {
                        self.revision = self.revision.wrapping_add(1);
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn paths_follow_repeated_walks_not_the_center() {
        let mut paths = Paths::default();
        for _ in 0..24 {
            paths.walk((3., 4.), (8., 4.));
        }
        assert!(paths.wear[8 * SIDE + 10] > 8.);
        assert_eq!(paths.wear[26 * SIDE + 20], 0.);
        let before = paths.wear.clone();
        paths.walk((5., 4.), (5., 4.));
        assert_eq!(paths.wear, before);
        assert!(paths.valid());
    }
    #[test]
    fn wear_is_independent_of_tick_size() {
        let mut whole = Paths::default();
        let mut split = Paths::default();
        whole.walk((3., 4.), (8., 4.));
        for i in 0..100 {
            split.walk((3. + i as f32 * 0.05, 4.), (3. + (i + 1) as f32 * 0.05, 4.));
        }
        for (a, b) in whole.wear.iter().zip(&split.wear) {
            assert!((a - b).abs() < 0.002);
        }
    }
    #[test]
    fn simulation_saves_wear_and_accepts_older_saves() {
        let mut game = crate::Game::new();
        for _ in 0..80 {
            game.tick(0.1);
        }
        let snapshot = game.snapshot();
        let mut value: serde_json::Value = serde_json::from_str(&snapshot).unwrap();
        assert!(
            value["village"]["paths"]["wear"]
                .as_array()
                .unwrap()
                .iter()
                .any(|w| w.as_f64().unwrap() > 0.)
        );
        let mut restored = crate::Game::new();
        assert!(restored.restore(&snapshot));
        let after: serde_json::Value = serde_json::from_str(&restored.snapshot()).unwrap();
        assert_eq!(after["village"]["paths"], value["village"]["paths"]);
        value["village"].as_object_mut().unwrap().remove("paths");
        assert!(restored.restore(&value.to_string()));
        let legacy: serde_json::Value = serde_json::from_str(&restored.snapshot()).unwrap();
        assert!(
            legacy["village"]["paths"]["wear"]
                .as_array()
                .unwrap()
                .iter()
                .all(|w| w.as_f64().unwrap() == 0.)
        );
        value["village"]["paths"] = serde_json::json!({"wear": [], "revision": 0});
        assert!(!restored.restore(&value.to_string()));
    }

    #[test]
    fn river_and_outside_map_stay_unworn() {
        let mut paths = Paths::default();
        paths.walk((25., 4.), (28., 4.));
        paths.walk((-2., -2.), (-1., -1.));
        assert!(paths.wear.iter().all(|w| *w == 0.));
    }
}
