use bevy::prelude::*;

use crate::{VillageCamera, setup::WorldSetup, terrain::land_random, village::Village};

pub const DAY: f64 = 3200.0;
pub const HOUR: f64 = DAY / 24.0;
const MONTH_DAYS: [usize; 12] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTHS: [&str; 12] = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

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

pub(crate) fn game_minutes(seconds: f64) -> u64 {
    (540.0 + seconds * 0.45) as u64
}

pub(crate) fn remaining_game_minutes(seconds: f64) -> u64 {
    (seconds.max(0.0) * (60.0 / HOUR)).ceil() as u64
}

pub fn game_hour(seconds: f64) -> f64 {
    (9.0 + seconds / HOUR).rem_euclid(24.0)
}

pub fn step_weather(clock: f64, dt: f64, biome: usize, seed: u32) -> Weather {
    weather_at((clock - dt * 0.5).max(0.0), biome, seed)
}

pub fn weather_at(seconds: f64, biome: usize, seed: u32) -> Weather {
    let day = (seconds / DAY + 9.0 / 24.0).floor() as i64;
    let month = month_at(day);
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

fn month_and_day(day: i64) -> (usize, usize) {
    let mut day_of_year = (day + 304).rem_euclid(365) as usize;
    let mut month = 0;
    while day_of_year >= MONTH_DAYS[month] {
        day_of_year -= MONTH_DAYS[month];
        month += 1;
    }
    (month, day_of_year + 1)
}

fn month_at(day: i64) -> usize {
    month_and_day(day).0
}

pub fn calendar_label(seconds: f64) -> String {
    let elapsed = (game_minutes(seconds) / 1440) as i64;
    let (month, day) = month_and_day(elapsed);
    let year = (304 + elapsed) / 365 + 1;
    let season = ["Summer", "Autumn", "Winter", "Spring"][season_at(seconds)];
    format!("{day} {} · Year {year} · {season}", MONTHS[month])
}

pub fn recharge_season(seconds: f64, biome: usize) -> f64 {
    let day = (seconds / DAY + 9.0 / 24.0).floor() as i64;
    let rain = RAIN_MM[biome];
    rain[month_at(day)] / rain.into_iter().fold(0.0, f64::max)
}

fn season_at(seconds: f64) -> usize {
    let day = (304.0 + (540.0 + seconds * 0.45) / 1440.0).rem_euclid(365.0);
    ((day + 31.0).rem_euclid(365.0) / 91.25).floor() as usize
}

pub fn growing_season(seconds: f64, biome: usize) -> f64 {
    [
        [1.0, 0.9, 0.7, 1.0],
        [1.0, 0.8, 0.45, 0.8],
        [1.0, 0.8, 0.3, 0.45],
    ][biome][season_at(seconds)]
}

pub fn sun_height(seconds: f64) -> f64 {
    (((game_hour(seconds) - 6.0) * std::f64::consts::PI / 12.0).sin()).max(0.0)
}

fn sample(seed: u32, day: i64, salt: u32) -> f64 {
    let hash = |value: u32| (value ^ (value >> 16)).wrapping_mul(0x45d9f3b);
    let value = hash(hash(seed ^ (day as u32).wrapping_mul(0x45d9f3b) ^ salt));
    f64::from(value ^ (value >> 16)) / 4294967296.0
}

impl Weather {
    pub fn summary(self, seconds: f64) -> String {
        let state = if self.rain > 0.05 {
            "Rain"
        } else if self.cloud > 0.5 {
            "Cloudy"
        } else if (6.0..18.0).contains(&game_hour(seconds)) {
            "Sunny"
        } else {
            "Clear night"
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
                "Dry / trace rain"
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

#[derive(Default)]
struct CloudCover {
    scene: Option<(u32, usize, bool)>,
    seconds: f64,
    amount: f32,
}

impl CloudCover {
    fn update(
        &mut self,
        scene: (u32, usize, bool),
        seconds: f64,
        weather: Weather,
        dt: f32,
    ) -> f32 {
        if self.scene != Some(scene) || seconds < self.seconds {
            self.scene = Some(scene);
            self.amount = f32::from(weather.rain > 0.05);
        }
        self.seconds = seconds;
        self.amount += (weather.cloud as f32 - self.amount) * (1. - (-dt / 3.).exp());
        self.amount
    }
}

fn sunlight(
    setup: Res<WorldSetup>,
    village: Res<Village>,
    // Menu thumbnails light their own render layers; the village sun has none.
    mut sun: Single<
        (&mut DirectionalLight, &mut Transform),
        Without<bevy::camera::visibility::RenderLayers>,
    >,
    mut ambient: ResMut<GlobalAmbientLight>,
    mut sky: ResMut<ClearColor>,
    mut fog: Single<&mut DistanceFog, With<VillageCamera>>,
    (time, mut cover): (Res<Time<Real>>, Local<CloudCover>),
) {
    let seconds = if setup.open { 400.0 } else { village.seconds() };
    let weather = weather_at(seconds, setup.biome(), setup.seed());
    let hour = game_hour(seconds);
    let angle = ((hour - 6.0) * std::f64::consts::PI / 12.0) as f32;
    let height = sun_height(seconds) as f32;
    let daylight = (height * 5.0).min(1.0);
    let dt = if !setup.open && village.is_paused() {
        0.
    } else {
        time.delta_secs().min(0.1)
    };
    let cloud = cover.update(
        (setup.seed(), setup.biome(), setup.open),
        seconds,
        weather,
        dt,
    );
    let (light, transform) = &mut *sun;
    let direction = Vec3::new(angle.cos() * 85.0, (height * 75.0).max(4.0), 28.0);
    transform.rotation = Transform::from_translation(direction)
        .looking_at(Vec3::ZERO, Vec3::Y)
        .rotation;
    light.illuminance = 4_400.0 * daylight * (2.1 + height * 1.3) * (1.0 - cloud * 0.88);
    let warmth = (1.0 - (height * 2.0).min(1.0)) * (1.0 - cloud);
    let daylight_color = Color::srgb_u8(255, 226, 168).to_linear();
    let sunset_color = Color::srgb_u8(255, 173, 114).to_linear();
    let overcast = Color::srgb_u8(214, 227, 239).to_linear();
    light.color = Color::LinearRgba(
        daylight_color
            .mix(&sunset_color, warmth)
            .mix(&overcast, cloud),
    );
    // V2's sky light is a warm hemisphere (#e4eff6 over #777455) that stays near 45% of
    // midday after sunset, so the ground still reads olive at dusk rather than blue-black.
    // A blue night tint greyed the grass; V2's night keeps a warm, slightly green cast.
    ambient.color = Color::srgb(
        0.86 + 0.14 * daylight,
        0.90 + 0.10 * daylight,
        0.80 + 0.20 * daylight,
    );
    ambient.brightness = 500.0 + 60.0 * daylight * (0.8 + cloud * 0.35);
    sky.0 = Color::srgb(
        0.08 + daylight * (0.63 - cloud * 0.12),
        0.12 + daylight * (0.68 - cloud * 0.15),
        0.22 + daylight * (0.68 - cloud * 0.16),
    );
    let daylight_fog = Color::srgb_u8(203, 213, 172).to_srgba();
    fog.color = Color::Srgba(
        sky.0
            .to_srgba()
            .mix(&daylight_fog, daylight * (1.0 - cloud * 0.65)),
    );
}

const RAIN_DROPS: usize = 600;
const RAIN_HEIGHT: f32 = 20.;

#[derive(Default)]
struct RainField {
    seed: Option<u32>,
    offsets: Vec<Vec3>,
    phase: f32,
}

impl RainField {
    fn update(&mut self, seed: u32, seconds: f32) {
        if self.seed != Some(seed) {
            self.seed = Some(seed);
            self.phase = 0.;
            let mut rng = land_random(seed ^ 0x36a1);
            self.offsets = (0..RAIN_DROPS)
                .map(|_| {
                    Vec3::new(
                        (rng() as f32 - 0.5) * 50.,
                        rng() as f32 * RAIN_HEIGHT,
                        (rng() as f32 - 0.5) * 50.,
                    )
                })
                .collect();
        }
        self.phase = (self.phase + seconds.min(0.1) * 12.).rem_euclid(RAIN_HEIGHT);
    }
}

fn rain(
    setup: Res<WorldSetup>,
    village: Res<Village>,
    camera: Single<&VillageCamera>,
    time: Res<Time<Real>>,
    mut field: Local<RainField>,
    mut gizmos: Gizmos,
) {
    if setup.open || village.camp.is_none() {
        return;
    }
    let weather = weather_at(village.seconds(), setup.biome(), setup.seed());
    if weather.rain <= 0.05 {
        return;
    }
    field.update(setup.seed(), time.delta_secs());
    let terrain = village.terrain(&setup);
    for offset in &field.offsets {
        let x = camera.target.x + offset.x;
        let z = camera.target.z + offset.z;
        let height = (offset.y - field.phase).rem_euclid(RAIN_HEIGHT);
        let point = Vec3::new(x, terrain.height_at(x, z) + height, z);
        gizmos.line(
            point,
            point + Vec3::Y * 0.16,
            Color::srgba_u8(219, 232, 236, 178),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cloud_transitions_use_real_time_and_reset_for_a_new_scene() {
        let mut cover = CloudCover::default();
        let dry = Weather {
            rain: 0.,
            cloud: 0.,
            temperature: 20.,
        };
        let wet = Weather {
            rain: 1.,
            cloud: 1.,
            temperature: 20.,
        };
        assert_eq!(cover.update((42, 0, false), 0., dry, 0.), 0.);
        assert_eq!(cover.update((42, 0, false), 1., wet, 0.), 0.);
        let after = cover.update((42, 0, false), 1., wet, 3.);
        assert!((after - (1. - (-1_f32).exp())).abs() < 0.000001);
        assert_eq!(cover.update((43, 0, false), 0., wet, 0.), 1.);
    }

    #[test]
    fn forecasts_match_the_source_climate_model() {
        assert_eq!(calendar_label(0.0), "1 Nov · Year 1 · Spring");
        assert_eq!(calendar_label(61.0 * DAY), "1 Jan · Year 2 · Summer");
        // Expected rows from V2's forecast at midnight and for all three biomes.
        for (time, biome, seed, rows) in [
            (
                1999.0,
                0,
                42,
                [
                    "Day 1 · Light rain · 15–25 °C",
                    "Day 2 · Rainy · 15–25 °C",
                    "Day 3 · Rainy · 15–30 °C",
                ],
            ),
            (
                2000.0,
                0,
                42,
                [
                    "Day 2 · Rainy · 15–25 °C",
                    "Day 3 · Rainy · 15–30 °C",
                    "Day 4 · Rainy · 15–30 °C",
                ],
            ),
            (
                23000.0,
                1,
                10,
                [
                    "Day 8 · Dry / trace rain · 15–25 °C",
                    "Day 9 · Dry / trace rain · 15–30 °C",
                    "Day 10 · Rainy · 15–30 °C",
                ],
            ),
            (
                29000.0,
                2,
                42,
                [
                    "Day 10 · Dry / trace rain · 25–35 °C",
                    "Day 11 · Dry / trace rain · 20–35 °C",
                    "Day 12 · Dry / trace rain · 25–35 °C",
                ],
            ),
        ] {
            assert_eq!(forecast(time, biome, seed), rows.join("\n"));
        }
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
