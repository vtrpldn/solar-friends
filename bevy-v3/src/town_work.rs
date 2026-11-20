use serde::{Deserialize, Serialize};

#[derive(Default, Deserialize, Serialize)]
pub struct TownWork {
    pub repeating: bool,
    pub booked: bool,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub route_blocked: bool,
    pub last_day: Option<u64>,
    pub shift: Option<Shift>,
}

#[derive(Deserialize, Serialize)]
pub struct Shift {
    pub phase: Commute,
    pub full_day: bool,
    pub fare_due: bool,
    pub until: f64,
}

#[derive(Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
pub enum Commute {
    Outbound,
    Away,
    Inbound,
}

pub const JOBS: [(&str, u64); 5] = [
    ("Plant nursery assistant", 80),
    ("Carpentry repairs", 100),
    ("Community café cook", 80),
    ("Solar installation assistant", 100),
    ("Environmental education tutor", 90),
];

pub const RETURN_FARE: u64 = 800;

impl TownWork {
    pub fn active(&self) -> bool {
        self.shift.is_some()
    }

    pub fn away(&self) -> bool {
        self.shift
            .as_ref()
            .is_some_and(|shift| shift.phase == Commute::Away)
    }

    pub fn valid(&self) -> bool {
        self.shift.as_ref().is_none_or(|shift| {
            !self.booked && self.last_day.is_some() && shift.until.is_finite() && shift.until >= 0.0
        })
    }

    pub fn status(&self) -> &'static str {
        match self.shift.as_ref().map(|shift| shift.phase) {
            Some(Commute::Outbound) => "Walking to the bus",
            Some(Commute::Away) => "Working in town",
            Some(Commute::Inbound) => "Returning to camp",
            None if self.booked => "Day shift booked",
            None if self.repeating => "Weekday shifts on",
            None => "Available to book",
        }
    }
}
