//! Seeded weather shared by soil, cisterns, generation and the forecast.
use crate::*;

pub const SEASON_DAYS: u32 = 21;
const INTRO_DAYS: u32 = 14;

#[derive(Clone, Default, Serialize, Deserialize)]
pub struct State {
    pub enabled: bool,
}

#[derive(Clone, Copy, Serialize)]
pub struct Day {
    pub day: u32,
    pub season: &'static str,
    pub season_day: u32,
    pub days_until_change: u32,
    pub rain_expected: bool,
    pub rain_start: f32,
    pub rain_end: f32,
    pub rain_strength: f32,
    pub river_factor: f32,
    pub evaporation: f32,
}

#[derive(Clone, Copy, Serialize)]
pub struct Weather {
    pub raining: bool,
    pub rain: f32,
    pub clouds: f32,
    pub wet: f32,
    pub solar_factor: f32,
    pub river_factor: f32,
    pub evaporation: f32,
}

fn wet_season(day: u32) -> bool {
    (day / SEASON_DAYS).is_multiple_of(2)
}
fn rainy_day(v: &Village, day: u32) -> bool {
    if !v.climate.enabled || day < INTRO_DAYS {
        return day % 3 != 2;
    }
    simulation::sample(v.simulation.seed, 40, day) % 100 < if wet_season(day) { 70 } else { 18 }
}
pub fn day(v: &Village, day: u32) -> Day {
    let seasonal = v.climate.enabled && day >= INTRO_DAYS;
    let wet = wet_season(day);
    let expected = rainy_day(v, day);
    let sample = |domain| simulation::sample(v.simulation.seed, domain, day);
    let start = if seasonal {
        720. + (sample(41) % 5) as f32 * 60.
    } else {
        840.
    };
    let duration = if seasonal {
        if wet {
            120. + (sample(42) % 5) as f32 * 30.
        } else {
            60. + (sample(42) % 3) as f32 * 30.
        }
    } else {
        180.
    };
    let recent_rain = (0..5)
        .filter(|offset| rainy_day(v, day.saturating_sub(*offset)))
        .count() as f32;
    Day {
        day,
        season: if wet { "wet" } else { "dry" },
        season_day: day % SEASON_DAYS + 1,
        days_until_change: SEASON_DAYS - day % SEASON_DAYS,
        rain_expected: expected,
        rain_start: start,
        rain_end: start + duration,
        rain_strength: if seasonal {
            0.65 + (sample(43) % 56) as f32 / 100.
        } else {
            1.
        },
        river_factor: if seasonal {
            (if wet { 0.95 } else { 0.6 }) + recent_rain * 0.06
        } else if expected {
            1.
        } else {
            0.65
        },
        evaporation: if seasonal {
            if wet { 0.9 } else { 1.25 }
        } else {
            1.
        },
    }
}
fn smooth(value: f32) -> f32 {
    let n = value.clamp(0., 1.);
    n * n * (3. - 2. * n)
}
pub fn at(v: &Village, minutes: f32) -> Weather {
    let index = (minutes / 1440.) as u32;
    let d = day(v, index);
    let minute = minutes.rem_euclid(1440.);
    let seasonal = v.climate.enabled && index >= INTRO_DAYS;
    let raining = if seasonal {
        d.rain_expected && (d.rain_start..d.rain_end).contains(&minute)
    } else {
        ecology::raining(minutes)
    };
    let buildup = smooth((minute - d.rain_start + 30.) / 30.);
    let clearing = 1. - smooth((minute - d.rain_end) / 60.);
    let clouds = if d.rain_expected {
        0.12 + 0.88 * buildup * clearing
    } else {
        0.06
    };
    let wet = if !d.rain_expected {
        0.
    } else if raining {
        smooth((minute - d.rain_start) / 40.)
    } else if minute >= d.rain_end {
        1. - smooth((minute - d.rain_end) / 120.)
    } else {
        0.
    };
    Weather {
        raining,
        rain: if raining { d.rain_strength } else { 0. },
        clouds,
        wet,
        solar_factor: if seasonal { 1. - clouds * 0.5 } else { 1. },
        river_factor: if seasonal {
            d.river_factor + if raining { 0.1 } else { 0. }
        } else if raining {
            1.3
        } else {
            d.river_factor
        },
        evaporation: d.evaporation,
    }
}
pub fn view(v: &Village) -> serde_json::Value {
    let today = (v.minutes / 1440.) as u32;
    serde_json::json!({
        "enabled": v.climate.enabled,
        "season_days": SEASON_DAYS,
        "current": at(v, v.minutes),
        "forecast": (0..7).map(|offset| day(v, today.saturating_add(offset))).collect::<Vec<_>>(),
        "note": "A compressed game calendar. Forecasts use the saved village seed. Dry weather dries soil faster and lowers river output; irrigation keeps plants growing. New arrivals have two weeks of familiar afternoon weather."
    })
}
#[wasm_bindgen]
impl Game {
    pub fn weather_report(&self) -> String {
        view(self.app.world().resource::<Village>()).to_string()
    }
    pub fn set_seasons_enabled(&mut self, enabled: bool) -> bool {
        let mut v = self.app.world_mut().resource_mut::<Village>();
        if v.mode != modes::Mode::Sandbox {
            return false;
        }
        v.climate.enabled = enabled;
        true
    }
}

#[cfg(test)]
mod tests;
