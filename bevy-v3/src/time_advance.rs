use bevy::prelude::*;

use crate::{village::SIMULATION_STEP, weather::DAY};

pub struct Advance {
    pub open: bool,
    days: u16,
    day_entry: Option<u16>,
    pub running: Option<Run>,
    result: String,
}

pub struct Run {
    total: u64,
    steps: u64,
}

impl Default for Advance {
    fn default() -> Self {
        Self {
            open: false,
            days: 1,
            day_entry: None,
            running: None,
            result: String::new(),
        }
    }
}

#[derive(Clone, Copy)]
pub(crate) enum AdvanceAction {
    Toggle,
    Adjust(i16),
    Digit(u16),
    Backspace,
    Start,
}

impl Advance {
    pub fn keyboard_action(&self, keys: &ButtonInput<KeyCode>) -> Option<AdvanceAction> {
        if keys.just_pressed(KeyCode::KeyL)
            || (self.open && self.running.is_none() && keys.just_pressed(KeyCode::Escape))
        {
            return Some(AdvanceAction::Toggle);
        }
        if !self.open || self.running.is_some() {
            return None;
        }
        let digits = [
            [KeyCode::Digit0, KeyCode::Numpad0],
            [KeyCode::Digit1, KeyCode::Numpad1],
            [KeyCode::Digit2, KeyCode::Numpad2],
            [KeyCode::Digit3, KeyCode::Numpad3],
            [KeyCode::Digit4, KeyCode::Numpad4],
            [KeyCode::Digit5, KeyCode::Numpad5],
            [KeyCode::Digit6, KeyCode::Numpad6],
            [KeyCode::Digit7, KeyCode::Numpad7],
            [KeyCode::Digit8, KeyCode::Numpad8],
            [KeyCode::Digit9, KeyCode::Numpad9],
        ];
        if let Some(digit) = digits.iter().position(|pair| keys.any_just_pressed(*pair)) {
            return Some(AdvanceAction::Digit(digit as u16));
        }
        let increment = if keys.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]) {
            7
        } else {
            1
        };
        [
            (KeyCode::BracketLeft, AdvanceAction::Adjust(-increment)),
            (KeyCode::BracketRight, AdvanceAction::Adjust(increment)),
            (KeyCode::Backspace, AdvanceAction::Backspace),
            (KeyCode::Enter, AdvanceAction::Start),
            (KeyCode::NumpadEnter, AdvanceAction::Start),
        ]
        .into_iter()
        .find_map(|(key, action)| keys.just_pressed(key).then_some(action))
    }

    pub fn apply(&mut self, action: AdvanceAction) -> bool {
        if matches!(action, AdvanceAction::Toggle) {
            if self.running.take().is_some() {
                self.open = false;
                self.result = "Advance stopped. The village is paused.".into();
                return true;
            } else {
                self.open = !self.open;
                self.day_entry = None;
            }
            return false;
        }
        if !self.open || self.running.is_some() {
            return false;
        }
        match action {
            AdvanceAction::Adjust(delta) => {
                self.days = self
                    .selected_days()
                    .saturating_add_signed(delta)
                    .clamp(1, 365);
                self.day_entry = None;
            }
            AdvanceAction::Digit(digit) => {
                let value = self.day_entry.unwrap_or_default();
                if value < 100 {
                    self.day_entry = Some(value * 10 + digit);
                }
            }
            AdvanceAction::Backspace => {
                self.day_entry = Some(self.selected_days() / 10);
            }
            AdvanceAction::Start if self.can_start() => {
                self.days = self.selected_days();
                self.day_entry = None;
                self.result.clear();
                self.running = Some(Run::new(self.days));
            }
            AdvanceAction::Toggle | AdvanceAction::Start => {}
        }
        false
    }

    pub fn done(&mut self) {
        self.running = None;
        self.open = false;
        self.result = format!("Advanced {} day(s). The village is paused.", self.days);
    }

    fn selected_days(&self) -> u16 {
        self.day_entry.unwrap_or(self.days)
    }

    pub fn can_start(&self) -> bool {
        (1..=365).contains(&self.selected_days())
    }

    pub fn remaining_days(&self) -> f64 {
        self.running
            .as_ref()
            .map_or(f64::from(self.selected_days()), |run| {
                (run.total - run.steps) as f64 * SIMULATION_STEP / DAY
            })
    }

    pub fn status(&self, contextual_shortcut: bool) -> String {
        if let Some(run) = &self.running {
            return format!(
                "Advancing {} days · {:.0}%\nL Stop here",
                self.days,
                100.0 * run.steps as f64 / run.total as f64
            );
        }
        if !self.open {
            let shortcut = if contextual_shortcut { "Alt+L" } else { "L" };
            return if self.result.is_empty() {
                format!("{shortcut} Advance days")
            } else {
                format!("{} · {shortcut} Advance days", self.result)
            };
        }
        let entry_status = if self.can_start() {
            "Enter Start"
        } else {
            "Choose 1–365 days"
        };
        format!(
            "Advance {} day(s)\nType days or use [ / ] · Shift ±7 · {entry_status} · L Close",
            self.selected_days(),
        )
    }
}

impl Run {
    fn new(days: u16) -> Self {
        Self {
            total: (f64::from(days) * DAY / SIMULATION_STEP).round() as u64,
            steps: 0,
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
    fn entered_days_drive_the_forecast_and_enforce_the_advance_limit() {
        let mut advance = Advance::default();
        advance.apply(AdvanceAction::Toggle);
        for digit in [3, 6, 6] {
            advance.apply(AdvanceAction::Digit(digit));
        }
        advance.apply(AdvanceAction::Start);
        assert!(advance.running.is_none());

        advance.apply(AdvanceAction::Backspace);
        advance.apply(AdvanceAction::Digit(5));
        assert_eq!(advance.remaining_days(), 365.0);
        advance.apply(AdvanceAction::Start);
        let run = advance.running.as_ref().unwrap();
        assert_eq!(run.total as f64 * SIMULATION_STEP, 365.0 * DAY);
    }
}
