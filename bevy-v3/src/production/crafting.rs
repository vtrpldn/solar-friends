use serde::{Deserialize, Serialize};

const THRESHOLDS: [f64; 4] = [0.0, 2_400.0, 14_400.0, 48_000.0];
const STARTING: [[f64; 3]; 5] = [
    [0.0, 14_400.0, 0.0],
    [14_400.0, 0.0, 14_400.0],
    [0.0, 2_400.0, 0.0],
    [2_400.0, 0.0, 14_400.0],
    [2_400.0, 0.0, 2_400.0],
];

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Skill {
    Woodworking,
    Basketry,
    Repair,
}

impl Skill {
    pub fn label(self) -> &'static str {
        ["Woodworking", "Basketry", "Equipment repair"][self as usize]
    }
}

#[derive(Default, Deserialize, Serialize)]
pub struct Experience([f64; 3]);

impl Experience {
    pub fn level(&self, resident: usize, skill: Skill) -> usize {
        let skill = skill as usize;
        let seconds = STARTING[resident][skill] + self.0[skill];
        THRESHOLDS.partition_point(|&threshold| seconds >= threshold) - 1
    }

    pub fn practice(&mut self, resident: usize, skill: Skill, dt: f64) -> f64 {
        let level = self.level(resident, skill);
        let seconds = &mut self.0[skill as usize];
        *seconds = (*seconds + dt).min(100_000.0 - STARTING[resident][skill as usize]);
        0.75 + level as f64 * 0.15
    }

    pub fn valid(&self) -> bool {
        self.0
            .iter()
            .all(|experience| (0.0..=100_000.0).contains(experience))
    }
}
