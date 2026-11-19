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

#[derive(Clone, Copy)]
pub(crate) enum AdvanceAction {
    Toggle,
    Adjust(i16),
    Method,
    Start,
}

impl Advance {
    pub fn controls(&mut self, keys: &ButtonInput<KeyCode>) -> bool {
        if keys.just_pressed(KeyCode::KeyL) && self.apply(AdvanceAction::Toggle) {
            return true;
        }
        let increment = if keys.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]) {
            7
        } else {
            1
        };
        for (key, action) in [
            (KeyCode::BracketLeft, AdvanceAction::Adjust(-increment)),
            (KeyCode::BracketRight, AdvanceAction::Adjust(increment)),
            (KeyCode::KeyA, AdvanceAction::Method),
            (KeyCode::Enter, AdvanceAction::Start),
        ] {
            if keys.just_pressed(key) {
                self.apply(action);
            }
        }
        false
    }

    pub fn apply(&mut self, action: AdvanceAction) -> bool {
        if matches!(action, AdvanceAction::Toggle) {
            if self.running.take().is_some() {
                self.open = false;
                self.result = "Advance stopped. The village is paused.".into();
                return true;
            } else {
                self.open = !self.open;
            }
            return false;
        }
        if !self.open || self.running.is_some() {
            return false;
        }
        match action {
            AdvanceAction::Adjust(delta) => {
                self.days = self.days.saturating_add_signed(delta).clamp(1, 365)
            }
            AdvanceAction::Method => self.fast = !self.fast,
            AdvanceAction::Start => {
                self.result.clear();
                self.running = Some(Run::new(self.days, self.fast));
            }
            AdvanceAction::Toggle => {}
        }
        false
    }

    pub fn done(&mut self) {
        self.running = None;
        self.open = false;
        self.result = format!("Advanced {} day(s). The village is paused.", self.days);
    }

    pub fn remaining_days(&self) -> f64 {
        self.running.as_ref().map_or(f64::from(self.days), |run| {
            (run.total - run.steps) as f64 * run.dt / DAY
        })
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
            return if self.result.is_empty() {
                "L Advance days".into()
            } else {
                format!("{} · L Advance days", self.result)
            };
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
