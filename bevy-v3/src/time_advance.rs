use bevy::prelude::*;

use crate::weather::DAY;

pub struct Advance {
    pub open: bool,
    pub days: u16,
    pub fast: bool,
    pub running: Option<Run>,
    result: String,
}

pub struct Run {
    total: u64,
    steps: u64,
    pub dt: f64,
}

impl Default for Advance {
    fn default() -> Self {
        Self {
            open: false,
            days: 1,
            fast: false,
            running: None,
            result: String::new(),
        }
    }
}

impl Advance {
    pub fn controls(&mut self, keys: &ButtonInput<KeyCode>) {
        if keys.just_pressed(KeyCode::KeyL) {
            if self.running.take().is_some() {
                self.result = "Advance stopped. The village is at the time shown.".into();
            } else {
                self.open = !self.open;
            }
        }
        if !self.open || self.running.is_some() {
            return;
        }
        let increment = if keys.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]) {
            7
        } else {
            1
        };
        if keys.just_pressed(KeyCode::BracketLeft) {
            self.days = self.days.saturating_sub(increment).max(1);
        }
        if keys.just_pressed(KeyCode::BracketRight) {
            self.days = (self.days + increment).min(365);
        }
        if keys.just_pressed(KeyCode::KeyA) {
            self.fast = !self.fast;
        }
        if keys.just_pressed(KeyCode::Enter) {
            self.result.clear();
            self.running = Some(Run::new(self.days, self.fast));
        }
    }

    pub fn done(&mut self) {
        self.running = None;
        self.result = format!("Advanced {} day(s).", self.days);
    }

    pub fn status(&self) -> String {
        if let Some(run) = &self.running {
            return format!(
                "Advancing {} days · {:.0}%\nL Stop here",
                self.days,
                100.0 * run.steps as f64 / run.total as f64
            );
        }
        if !self.open {
            return "L Advance days".into();
        }
        let method = if self.fast {
            "Fast approximate"
        } else {
            "Exact replay"
        };
        format!(
            "Advance {} day(s) · {method}\n[ / ] Days · Shift ±7 · A Method · Enter Start · L Close\n{}",
            self.days, self.result
        )
    }
}

impl Run {
    fn new(days: u16, fast: bool) -> Self {
        let dt = if fast { 1.0 } else { 0.1 };
        Self {
            total: (f64::from(days) * DAY / dt).round() as u64,
            steps: 0,
            dt,
        }
    }

    pub fn record_step(&mut self) -> bool {
        self.steps += 1;
        self.steps >= self.total
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn both_methods_advance_the_same_days_with_different_step_sizes() {
        let exact = Run::new(3, false);
        let fast = Run::new(3, true);
        assert_eq!(exact.total, 10 * fast.total);
        assert_eq!(exact.total as f64 * exact.dt, 3.0 * DAY);
        assert_eq!(fast.total as f64 * fast.dt, 3.0 * DAY);
    }
}
