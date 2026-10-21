//! Versioned regional defaults. Resolved maps remain authoritative after generation.
use super::*;
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Biome {
    pub id: String,
    pub version: u32,
}
#[derive(Serialize)]
pub struct Preset {
    pub id: &'static str,
    pub version: u32,
    pub name: &'static str,
    pub summary: &'static str,
    pub weather: climate::Profile,
}
pub fn presets() -> [Preset; 3] {
    [
        Preset {
            id: "mata-atlantica",
            version: 1,
            name: "Mata Atlântica",
            summary: "Layered forest and open clearings. Balance shade, cultivation and captured rain.",
            weather: climate::Profile {
                intro_days: 0,
                ..Default::default()
            },
        },
        Preset {
            id: "cerrado",
            version: 1,
            name: "Cerrado",
            summary: "Open savanna woodland and grasses. Prepare water storage for the dry season.",
            weather: climate::Profile {
                season_days: 21,
                wet_rain_chance: 72,
                dry_rain_chance: 10,
                wet_evaporation: 0.95,
                dry_evaporation: 1.4,
                intro_days: 0,
            },
        },
        Preset {
            id: "caatinga",
            version: 1,
            name: "Caatinga",
            summary: "Living dry woodland, shrubs and cacti. Protect soil cover and plan reliable water access.",
            weather: climate::Profile {
                season_days: 28,
                wet_rain_chance: 45,
                dry_rain_chance: 6,
                wet_evaporation: 1.05,
                dry_evaporation: 1.6,
                intro_days: 0,
            },
        },
    ]
}
pub fn get(id: &str) -> Option<Preset> {
    presets().into_iter().find(|p| p.id == id)
}
pub fn generate(id: &str, seed: u32) -> Option<Map> {
    let preset = get(id)?;
    let mut map = Definition::builtin(modes::Mode::Sandbox).map;
    map.seed = seed;
    map.biome = Some(Biome {
        id: id.into(),
        version: preset.version,
    });
    map.deposits = Some(land::default_deposits(seed));
    let mut cells = Vec::with_capacity((MAP_SIZE * MAP_SIZE) as usize);
    for y in 0..MAP_SIZE {
        for x in 0..MAP_SIZE {
            let n = simulation::sample(seed, 180, (y * MAP_SIZE + x) as u32);
            let wave = (x as f32 * 0.17 + seed as f32 * 0.001).sin() + (y as f32 * 0.13).cos();
            let key =
                if world::center_in(&map, y as f32).is_some_and(|r| (x as f32 - r).abs() < 4.5) {
                    "river-meadow"
                } else if id == "mata-atlantica" {
                    let name = land::habitat::habitat(seed, x as f32, y as f32).0;
                    land::habitat::HABITATS
                        .iter()
                        .find(|h| h.name == name)
                        .unwrap()
                        .key
                } else if wave > 1.25 {
                    "rocky-woodland"
                } else if wave < -1.3 {
                    "clay-terraces"
                } else if id == "cerrado" {
                    "cerrado-savanna"
                } else {
                    "caatinga-woodland"
                };
            let h = land::habitat::by_key(key).unwrap();
            let variation = (n % 101) as f32 / 100. - 0.5;
            cells.push(TerrainCell {
                habitat: key.into(),
                fertility: (h.fertility + variation * 0.12).clamp(0., 1.),
                retention: (h.retention + variation * 0.1).clamp(0.65, 1.35),
                cover: (h.cover + variation * 0.18).clamp(0., 1.),
            });
        }
    }
    map.terrain = Some(cells);
    map.nature = Some(if id == "mata-atlantica" {
        land::vegetation::default_nature(seed, map.camp)
    } else {
        let mut plants: Vec<NatureObject> = Vec::new();
        for index in 0..1000u32 {
            let sample = |domain| simulation::sample(seed, domain, index) as f64 / u32::MAX as f64;
            let x = (sample(181) * MAP_SIZE as f64) as f32;
            let y = (sample(182) * MAP_SIZE as f64) as f32;
            if (x - map.camp[0] as f32).abs() < 6. && (y - map.camp[1] as f32).abs() < 6.
                || world::bank_in(&map, x.floor() as i32, y.floor() as i32)
                || sample(183) > 0.38
            {
                continue;
            }
            let s = if id == "cerrado" { 12 } else { 16 } + (index as usize % 4);
            let species = &land::vegetation::SPECIES[s];
            if plants
                .iter()
                .any(|p| (p.x - x).hypot(p.y - y) < species.spacing)
            {
                continue;
            }
            plants.push(NatureObject {
                id: format!("nature-{index}"),
                species: species.key.into(),
                x,
                y,
                size: (0.75 + sample(184) * 0.3) as f32,
            });
        }
        plants
    });
    Some(map)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn all_three_biomes_generate_frozen_repeatable_playable_properties() {
        for preset in presets() {
            for seed in [17, 99991] {
                let map = generate(preset.id, seed).unwrap();
                assert_eq!(
                    serde_json::to_string(&map).unwrap(),
                    serde_json::to_string(&generate(preset.id, seed).unwrap()).unwrap()
                );
                assert_eq!(map.terrain.as_ref().unwrap().len(), 4096);
                assert!(map.nature.as_ref().unwrap().len() > 100);
                if preset.id != "mata-atlantica" {
                    let first = if preset.id == "cerrado" { 12 } else { 16 };
                    for plant in map.nature.as_ref().unwrap() {
                        let index = land::vegetation::species_index(&plant.species).unwrap();
                        assert!((first..first + 4).contains(&index));
                        assert!(!world::bank_in(
                            &map,
                            plant.x.floor() as i32,
                            plant.y.floor() as i32
                        ));
                    }
                    for i in first..first + 4 {
                        assert!(
                            map.nature
                                .as_ref()
                                .unwrap()
                                .iter()
                                .any(|p| p.species == land::vegetation::SPECIES[i].key)
                        );
                    }
                }
                let mut d = Definition::builtin(modes::Mode::Sandbox);
                d.map = map;
                d.rules.climate = true;
                let (mut g, _) =
                    compile(d).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
                assert_eq!(
                    serde_json::from_str::<serde_json::Value>(&g.weather_report()).unwrap()["profile"]
                        ["intro_days"],
                    0
                );
                let saved = g.snapshot();
                let mut copy = Game::new();
                assert!(copy.restore(&saved));
                assert_eq!(copy.snapshot(), saved);
                assert_eq!(copy.land_report(), g.land_report());
                assert_eq!(copy.weather_report(), g.weather_report());
            }
        }
    }
    #[test]
    fn unsupported_biome_versions_and_unresolved_maps_do_not_replace_the_current_world() {
        let mut g = Game::new();
        let before = g.snapshot();
        let mut d = Definition::builtin(modes::Mode::Sandbox);
        d.map = generate("caatinga", 42).unwrap();
        d.map.biome.as_mut().unwrap().version = 99;
        let r: serde_json::Value =
            serde_json::from_str(&g.load_scenario(&serde_json::to_string(&d).unwrap())).unwrap();
        assert_eq!(r["ok"], false);
        assert_eq!(g.snapshot(), before);
        d.map.biome.as_mut().unwrap().version = 1;
        d.map.nature = None;
        let r: serde_json::Value =
            serde_json::from_str(&g.load_scenario(&serde_json::to_string(&d).unwrap())).unwrap();
        assert_eq!(r["ok"], false);
        assert_eq!(g.snapshot(), before);
        assert!(generate("unknown", 42).is_none());
    }
}
