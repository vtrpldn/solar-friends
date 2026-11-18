use bevy::prelude::*;

use crate::{VillageCamera, setup::WorldSetup, terrain::land_random, village::Village};

pub const DAY: f64 = 3200.0;
pub const HOUR: f64 = DAY / 24.0;
const MONTH_DAYS: [usize; 12] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// INMET 1991–2020 normals for the three V2 scenario biomes.
// See docs/simulation-climate-sources.json for station provenance.
const RAIN_MM: [[f64; 12]; 3] = [
    [
        292.1, 257.7, 229.1, 87.0, 66.3, 59.7, 48.4, 32.3, 83.3, 127.2, 143.9, 231.3,
    ],
    [
        206.0, 179.5, 226.0, 145.2, 26.9, 3.3, 1.5, 16.3, 38.1, 141.8, 253.1, 241.1,
    ],
    [
        83.5, 78.1, 83.6, 45.8, 11.0, 5.7, 4.5, 1.7, 2.3, 9.2, 46.5, 47.1,
    ],
];
const RAIN_DAYS: [[f64; 12]; 3] = [
    [17., 14., 13., 6., 6., 5., 4., 4., 7., 10., 11., 13.],
    [16., 14., 14., 9., 3., 1., 0., 2., 4., 10., 17., 18.],
    [6., 6., 6., 4., 2., 2., 1., 1., 0., 1., 3., 4.],
];
const TEMPERATURE: [[f64; 12]; 3] = [
    [
        23.1, 23.5, 22.5, 21.2, 18.4, 17.5, 17.2, 18.1, 19.1, 20.5, 21.2, 22.6,
    ],
    [
        21.9, 21.9, 21.8, 21.6, 20.3, 19.3, 19.3, 21.0, 22.8, 23.1, 21.7, 21.7,
    ],
    [
        28.2, 28.1, 28.0, 27.6, 26.6, 25.2, 24.6, 25.2, 26.9, 28.5, 28.8, 28.6,
    ],
];

#[derive(Clone, Copy)]
pub struct Weather {
    pub rain: f64,
    pub cloud: f64,
    pub temperature: f64,
}

pub fn game_hour(seconds: f64) -> f64 {
    (9.0 + seconds / HOUR).rem_euclid(24.0)
}

pub fn weather_at(seconds: f64, biome: usize, seed: u32) -> Weather {
    let day = (seconds / DAY + 9.0 / 24.0).floor() as i64;
    let mut day_of_year = (day + 304).rem_euclid(365) as usize;
    let mut month = 0;
    while day_of_year >= MONTH_DAYS[month] {
        day_of_year -= MONTH_DAYS[month];
        month += 1;
    }
    let hour = game_hour(seconds);
    let days = RAIN_DAYS[biome][month];
    let normals = RAIN_MM[biome][month];
    let month_days = MONTH_DAYS[month] as f64;
    let wet = sample(seed, day.div_euclid(3), 17) < days / month_days;
    let start = (sample(seed, day, 29) * 19.0).floor();
    let rain = if days == 0.0 {
        normals / month_days / 24.0
    } else if wet && hour.floor() >= start && hour.floor() < start + 6.0 {
        (normals / days) * (0.5 + sample(seed, day, 47)) / 6.0
    } else {
        0.0
    };
    let cloud = if rain > 0.05 {
        0.85
    } else if wet {
        0.65
    } else {
        0.15 + 0.3 * sample(seed, day.div_euclid(3), 61)
    };
    let temperature = TEMPERATURE[biome][month]
        + 4.0 * ((hour - 9.0) * std::f64::consts::PI / 12.0).sin()
        + (sample(seed, day, 71) - 0.5) * 4.0;
    Weather {
        rain,
        cloud,
        temperature,
    }
}

fn sample(seed: u32, day: i64, salt: u32) -> f64 {
    let hash = |value: u32| (value ^ (value >> 16)).wrapping_mul(0x45d9f3b);
    let value = hash(hash(seed ^ (day as u32).wrapping_mul(0x45d9f3b) ^ salt));
    f64::from(value ^ (value >> 16)) / 4294967296.0
}

impl Weather {
    pub fn summary(self) -> String {
        let state = if self.rain > 0.05 {
            "Rain"
        } else if self.cloud > 0.5 {
            "Cloudy"
        } else {
            "Fair"
        };
        format!("{state} · {:.0} °C", self.temperature.round())
    }
}

pub fn forecast(seconds: f64, biome: usize, seed: u32) -> String {
    let start_day = (seconds / DAY + 9.0 / 24.0).floor();
    (0..3)
        .map(|offset| {
            let day = start_day + f64::from(offset);
            let mut low = f64::INFINITY;
            let mut high = f64::NEG_INFINITY;
            let mut rain = 0.0;
            for hour in 0..24 {
                let value = weather_at((day * 24.0 + f64::from(hour) - 8.5) * HOUR, biome, seed);
                low = low.min(value.temperature);
                high = high.max(value.temperature);
                rain += value.rain;
            }
            let rain = if rain < 1.0 {
                "Dry"
            } else if rain < 10.0 {
                "Light rain"
            } else {
                "Rainy"
            };
            format!(
                "Day {:.0} · {} · {:.0}–{:.0} °C",
                day + 1.0,
                rain,
                (low / 5.0).floor() * 5.0,
                (high / 5.0).ceil() * 5.0
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

pub struct WeatherPlugin;

impl Plugin for WeatherPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Update, (sunlight, rain));
    }
}

fn sunlight(
    setup: Res<WorldSetup>,
    village: Res<Village>,
    mut sun: Single<(&mut DirectionalLight, &mut Transform)>,
    mut ambient: ResMut<GlobalAmbientLight>,
    mut sky: ResMut<ClearColor>,
) {
    let seconds = if setup.open { 400.0 } else { village.seconds() };
    let weather = weather_at(seconds, setup.biome(), setup.seed());
    let hour = game_hour(seconds);
    let angle = ((hour - 6.0) * std::f64::consts::PI / 12.0) as f32;
    let height = if (6.0..18.0).contains(&hour) {
        angle.sin().max(0.0)
    } else {
        0.0
    };
    let daylight = (height * 5.0).min(1.0);
    let cloud = weather.cloud as f32;
    let (light, transform) = &mut *sun;
    let direction = Vec3::new(angle.cos() * 85.0, (height * 75.0).max(4.0), 28.0);
    transform.rotation = Transform::from_translation(direction)
        .looking_at(Vec3::ZERO, Vec3::Y)
        .rotation;
    light.illuminance = 4_400.0 * daylight * (2.1 + height * 1.3) * (1.0 - cloud * 0.88);
    let warmth = (1.0 - (height * 2.0).min(1.0)) * (1.0 - cloud);
    light.color = Color::srgb(1.0, 0.95 - warmth * 0.25, 0.86 - warmth * 0.45);
    ambient.color = Color::srgb(0.56 + 0.44 * daylight, 0.67 + 0.33 * daylight, 1.0);
    ambient.brightness = 45.0 + 430.0 * daylight * (0.8 + cloud * 0.35);
    sky.0 = Color::srgb(
        0.08 + daylight * (0.63 - cloud * 0.12),
        0.12 + daylight * (0.68 - cloud * 0.15),
        0.22 + daylight * (0.68 - cloud * 0.16),
    );
}

fn rain(
    setup: Res<WorldSetup>,
    village: Res<Village>,
    camera: Single<&VillageCamera>,
    time: Res<Time>,
    mut phase: Local<f32>,
    mut gizmos: Gizmos,
) {
    if setup.open || village.camp.is_none() {
        return;
    }
    let weather = weather_at(village.seconds(), setup.biome(), setup.seed());
    if weather.rain <= 0.05 {
        return;
    }
    if !village.is_paused() {
        *phase = (*phase + time.delta_secs() * 12.0) % 24.0;
    }
    let terrain = setup.terrain();
    let mut rng = land_random(setup.seed() ^ 0x36a1);
    for _ in 0..180 {
        let x = camera.target.x + (rng() as f32 - 0.5) * 50.0;
        let z = camera.target.z + (rng() as f32 - 0.5) * 50.0;
        let height = (rng() as f32 * 24.0 - *phase).rem_euclid(24.0);
        let point = Vec3::new(x, terrain.height_at(x, z) + height, z);
        gizmos.line(
            point,
            point + Vec3::new(0.06, 0.55, 0.0),
            Color::srgba(0.74, 0.83, 0.97, 0.35),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn forecasts_match_the_source_climate_model() {
        for (time, biome, seed, rain, cloud, temperature) in [
            (0.0, 0, 42, 1.391004679594048, 0.85, 19.39254175107926),
            (23000.0, 1, 10, 0.0, 0.2303803928894922, 23.58614738320908),
            (29000.0, 2, 42, 0.0, 0.34841461102478205, 32.19882599257777),
        ] {
            let weather = weather_at(time, biome, seed);
            assert!((weather.rain - rain).abs() < 1e-9);
            assert!((weather.cloud - cloud).abs() < 1e-9);
            assert!((weather.temperature - temperature).abs() < 1e-9);
        }
    }
}
