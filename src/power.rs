//! Shared solar and river generation and stored energy for village lighting.
use super::*;

const STORAGE_PER_FARM: f32 = 36.;
const PEAK_GENERATION: f32 = 6.;

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Power {
    pub stored: f32,
    pub disabled: Vec<usize>,
}
#[derive(Serialize)]
pub struct Connection {
    pub id: usize,
    pub source: &'static str,
    pub enabled: bool,
    pub load: f32,
    pub light_level: f32,
}
#[derive(Serialize)]
pub struct Supply {
    pub farms: usize,
    pub hydros: usize,
    pub solar_generation: f32,
    pub hydro_generation: f32,
    pub capacity: f32,
    pub stored: f32,
    pub generation: f32,
    pub demand: f32,
    pub grid_level: f32,
    pub darkness: f32,
    pub connections: Vec<Connection>,
}
pub fn load(kind: &str) -> f32 {
    match kind {
        "kitchen" | "workshop" => 0.6,
        "greenhouse" => 0.5,
        "square" => 0.4,
        "well" | "warehouse" => 0.2,
        "coop" | "streetlight" | "eco_toilet" => 0.1,
        _ => 0.,
    }
}
fn farms(v: &Village) -> usize {
    v.buildings
        .iter()
        .filter(|b| b.kind == "solar_farm" && b.progress >= 100.)
        .count()
}
fn hydros(v: &Village) -> usize {
    v.buildings
        .iter()
        .filter(|b| b.kind == "hydro" && b.progress >= 100.)
        .count()
}
fn capacity(v: &Village) -> f32 {
    farms(v) as f32 * STORAGE_PER_FARM
        + hydros(v) as f32 * 18.
        + crate::building_work::held_capacity(v, "solar_farm") as f32 * STORAGE_PER_FARM
        + crate::building_work::held_capacity(v, "hydro") as f32 * 18.
}
fn hydro_generation(v: &Village, minutes: f32) -> f32 {
    let flow = if ecology::raining(minutes) {
        1.3
    } else if (minutes / 1440.) as u32 % 3 == 2 {
        0.65
    } else {
        1.
    };
    hydros(v) as f32 * 1.8 * flow
}
fn rates(v: &Village, minutes: f32) -> (f32, f32, f32) {
    let altitude = (((minutes.rem_euclid(1440.) / 60.) - 6.) / 12. * std::f32::consts::PI).sin();
    let darkness = ((0.18 - altitude) / 0.65).clamp(0., 1.);
    let sunlight: f32 = v
        .buildings
        .iter()
        .filter(|b| b.kind == "solar_farm" && b.progress >= 100.)
        .map(|b| land::solar_exposure(v, interactions::footprint_size(&b.kind), b.x, b.y))
        .sum();
    let generation = sunlight * PEAK_GENERATION * altitude.max(0.) + hydro_generation(v, minutes);
    let demand = v
        .buildings
        .iter()
        .filter(|b| b.progress >= 100. && !v.power.disabled.contains(&b.id))
        .map(|b| load(&b.kind))
        .sum::<f32>()
        * darkness;
    (generation, demand, darkness)
}
pub fn supply(v: &Village) -> Supply {
    let farms = farms(v);
    let hydros = hydros(v);
    let capacity = capacity(v);
    let (generation, demand, darkness) = rates(v, v.minutes);
    let stored = v.power.stored.min(capacity);
    // Fade during the final minute of charge; sunlight can directly supply a
    // partially lit grid at dawn. No on/off oscillation around an empty battery.
    let grid_level = if capacity <= f32::EPSILON {
        0.
    } else if demand <= f32::EPSILON {
        1.
    } else {
        ((generation + stored * 60.) / demand).clamp(0., 1.)
    };
    Supply {
        farms,
        hydros,
        solar_generation: (generation - hydro_generation(v, v.minutes)).max(0.),
        hydro_generation: hydro_generation(v, v.minutes),
        capacity,
        stored,
        generation,
        demand,
        grid_level,
        darkness,
        connections: v
            .buildings
            .iter()
            .map(|b| {
                let source = if b.kind == "home" {
                    "roof"
                } else if load(&b.kind) > 0. {
                    "grid"
                } else if b.kind == "hydro" {
                    "hydro"
                } else if b.kind == "solar_farm" {
                    "solar"
                } else {
                    "none"
                };
                let enabled = b.progress >= 100. && !v.power.disabled.contains(&b.id);
                Connection {
                    id: b.id,
                    source,
                    enabled,
                    load: load(&b.kind),
                    light_level: if !enabled {
                        0.
                    } else if source == "roof" {
                        1.
                    } else if source == "grid" {
                        grid_level
                    } else {
                        0.
                    },
                }
            })
            .collect(),
    }
}
pub fn advance(v: &mut Village, minutes: f32) {
    let capacity = capacity(v);
    // Evaluate at the middle of the actual simulated interval, including dawn.
    let midpoint = v.minutes - minutes / 2.;
    let (generation, demand, darkness) = rates(v, midpoint);
    if minutes > 0. && darkness > 0.5 {
        v.progress.river_night |= hydro_generation(v, midpoint) > 0.;
        v.progress.night_lights |= demand > 0.
            && (generation > 0. || v.power.stored > 0.)
            && v.buildings.iter().any(|b| {
                b.kind == "streetlight" && b.progress >= 100. && !v.power.disabled.contains(&b.id)
            });
    }
    v.power.stored = (v.power.stored + (generation - demand) * minutes / 60.).clamp(0., capacity);
}
pub fn valid(v: &Village) -> bool {
    let mut ids = std::collections::HashSet::new();
    v.power.stored.is_finite()
        && v.power.stored >= 0.
        && v.power.stored <= capacity(v) + 0.001
        && v.power.disabled.iter().all(|id| {
            ids.insert(*id)
                && v.buildings
                    .iter()
                    .any(|b| b.id == *id && load(&b.kind) > 0.)
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn village() -> Village {
        let mut game = Game::new();
        game.app
            .world_mut()
            .resource_mut::<Village>()
            .progress
            .completed = [true; 4];
        game.app
            .world_mut()
            .resource_mut::<Village>()
            .progress
            .later_completed = [true; crate::progression::LATER_CHAPTERS];
        assert_eq!(game.place("solar_farm", 5, 5), "ok");
        assert_eq!(game.place("streetlight", 10, 5), "ok");
        assert_eq!(game.place("home", 14, 5), "ok");
        let mut v = game.app.world().resource::<Village>().clone();
        for b in &mut v.buildings {
            b.progress = 100.;
        }
        crate::logistics::sync(&mut v);
        v.minutes = 360.;
        freshness::fixture_reseed(&mut v);
        v.economy.ledger.clear();
        v
    }
    fn run(v: &mut Village, minutes: u32) {
        for _ in 0..minutes {
            v.minutes += 1.;
            advance(v, 1.);
        }
    }
    #[test]
    fn sunlight_charges_and_battery_powers_the_night() {
        let mut v = village();
        run(&mut v, 720);
        assert!(v.power.stored > 35. && v.power.stored <= 36.);
        v.minutes = 1260.;
        let before = v.power.stored;
        run(&mut v, 60);
        assert!((before - v.power.stored - 0.1).abs() < 0.001);
        assert_eq!(supply(&v).connections[1].light_level, 1.);
        assert_eq!(supply(&v).generation, 0.);
    }
    #[test]
    fn unfinished_farms_empty_batteries_and_rooftop_independence() {
        let mut v = village();
        v.buildings[0].progress = 99.;
        run(&mut v, 720);
        v.minutes = 1260.;
        let p = supply(&v);
        assert_eq!(p.stored, 0.);
        assert_eq!(p.grid_level, 0.);
        assert_eq!(p.connections[2].source, "roof");
        assert_eq!(p.connections[2].light_level, 1.);
        crate::logistics::fixture_finish(&mut v, 0);
        v.power.stored = 0.0005;
        assert!(supply(&v).grid_level > 0. && supply(&v).grid_level < 1.);
        run(&mut v, 1);
        assert_eq!(v.power.stored, 0.);
    }
    #[test]
    fn switching_loads_off_preserves_charge_and_multiple_farms_add_capacity() {
        let mut v = village();
        v.power.stored = 10.;
        v.minutes = 1260.;
        v.power.disabled.push(1);
        run(&mut v, 60);
        assert_eq!(v.power.stored, 10.);
        assert_eq!(supply(&v).connections[1].light_level, 0.);
        let mut second = v.buildings[0].clone();
        second.id = v.buildings.len();
        second.x = 20;
        v.buildings.push(second);
        v.minutes = 720.;
        assert_eq!(supply(&v).capacity, 72.);
        let expected: f32 = v
            .buildings
            .iter()
            .filter(|b| b.kind == "solar_farm")
            .map(|b| 6. * land::solar_exposure(&v, 3, b.x, b.y))
            .sum();
        assert!((supply(&v).generation - expected).abs() < 0.001);
        assert!(expected > 6. && expected <= 12.);
    }
    #[test]
    fn save_migration_round_trip_and_corrupt_power_are_checked() {
        let mut game = Game::new();
        let mut v = village();
        v.power.stored = 12.;
        v.power.disabled.push(1);
        game.app.insert_resource(v);
        let save = game.snapshot();
        let mut restored = Game::new();
        assert!(restored.restore(&save));
        assert_eq!(restored.snapshot(), save);
        let mut old: serde_json::Value = serde_json::from_str(&save).unwrap();
        old["village"].as_object_mut().unwrap().remove("power");
        assert!(restored.restore(&old.to_string()));
        assert_eq!(restored.app.world().resource::<Village>().power.stored, 0.);
        for bad in [
            serde_json::json!({"stored":-1}),
            serde_json::json!({"stored":37}),
            serde_json::json!({"disabled":[1,1]}),
            serde_json::json!({"disabled":[2]}),
        ] {
            old["village"]["power"] = bad;
            assert!(!restored.restore(&old.to_string()));
        }
    }
}

#[cfg(test)]
mod hydro_tests {
    use super::*;
    #[test]
    fn river_generator_requires_bank_access_and_powers_the_night_in_dry_weather() {
        let mut g = Game::new();
        g.start_mode("sandbox");
        assert_ne!(g.place("hydro", 5, 5), "ok");
        assert_ne!(g.place("hydro", 25, 5), "ok");
        assert_eq!(g.place("hydro", 26, 5), "ok");
        assert_eq!(g.place("streetlight", 20, 5), "ok");
        let mut v = g.app.world().resource::<Village>().clone();
        v.minutes = 2. * 1440. + 1260.;
        v.power.stored = 0.;
        let p = supply(&v);
        assert_eq!(p.hydros, 1);
        assert_eq!(p.farms, 0);
        assert_eq!(p.capacity, 18.);
        assert!((p.generation - 1.17).abs() < 0.001);
        assert_eq!(p.grid_level, 1.);
        advance(&mut v, 60.);
        assert!(v.power.stored > 1.);
        for id in 0..5 {
            assert!(spacing::approach(&v, &v.buildings[0], id).is_some());
        }
        let mut restored = Game::new();
        assert!(restored.restore(&g.snapshot()));
    }
}
