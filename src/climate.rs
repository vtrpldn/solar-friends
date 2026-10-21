//! Seeded weather shared by soil, cisterns, generation and the forecast.
use crate::*;

pub const SEASON_DAYS: u32 = 21;
const INTRO_DAYS: u32 = 14;

/// Game-calendar parameters, frozen with an authored scenario. These are not
/// meteorological measurements; regional presets can choose their own balance.
#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Profile {
    pub season_days: u32,
    pub wet_rain_chance: u32,
    pub dry_rain_chance: u32,
    pub wet_evaporation: f32,
    pub dry_evaporation: f32,
    pub intro_days: u32,
}
impl Default for Profile {
    fn default() -> Self {
        Self {
            season_days: SEASON_DAYS,
            wet_rain_chance: 70,
            dry_rain_chance: 18,
            wet_evaporation: 0.9,
            dry_evaporation: 1.25,
            intro_days: INTRO_DAYS,
        }
    }
}
impl Profile {
    pub fn valid(&self) -> bool {
        (7..=90).contains(&self.season_days)
            && self.wet_rain_chance <= 100
            && self.dry_rain_chance <= 100
            && self.wet_evaporation.is_finite()
            && self.dry_evaporation.is_finite()
            && (0.5..=2.).contains(&self.wet_evaporation)
            && (0.5..=2.).contains(&self.dry_evaporation)
            && self.intro_days <= 14
    }
}
fn profile(v: &Village) -> Profile {
    v.scenario
        .as_ref()
        .and_then(|o| o.definition.rules.weather)
        .unwrap_or_default()
}
fn wet_in(profile: Profile, day: u32) -> bool {
    (day / profile.season_days).is_multiple_of(2)
}

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

pub fn season_is_wet(v: &Village, day: u32) -> bool {
    wet_in(profile(v), day)
}
fn seasonal(v: &Village, day: u32) -> bool {
    v.climate.enabled && (v.mode == modes::Mode::Sandbox || day >= profile(v).intro_days)
}
pub fn seasonal_rain(v: &Village, day: u32) -> bool {
    let p = profile(v);
    simulation::sample(v.simulation.seed, 40, day) % 100
        < if wet_in(p, day) {
            p.wet_rain_chance
        } else {
            p.dry_rain_chance
        }
}
fn rainy_day(v: &Village, day: u32) -> bool {
    if !seasonal(v, day) {
        return day % 3 != 2;
    }
    seasonal_rain(v, day)
}
pub fn day(v: &Village, day: u32) -> Day {
    let seasonal = seasonal(v, day);
    let p = profile(v);
    let wet = wet_in(p, day);
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
        season_day: day % p.season_days + 1,
        days_until_change: p.season_days - day % p.season_days,
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
            if wet {
                p.wet_evaporation
            } else {
                p.dry_evaporation
            }
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
    let seasonal = seasonal(v, index);
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
        "season_days": profile(v).season_days,
        "profile": profile(v),
        "current": at(v, v.minutes),
        "forecast": (0..7).map(|offset| day(v, today.saturating_add(offset))).collect::<Vec<_>>(),
        "note": "A compressed game calendar. Forecasts use the saved village seed. Dry weather dries soil faster and lowers river output; irrigation keeps plants growing. Beginner afternoon weather is controlled by this scenario’s weather profile."
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
