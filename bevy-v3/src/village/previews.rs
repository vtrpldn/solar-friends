//! Developer scenes seeded into the ordinary village runtime with saves disabled.

use std::ffi::OsString;

use super::*;
use crate::{construction::LabOrder, weather};

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum Preview {
    Downtime,
    Utilities(UtilitiesPreview),
    Arrival,
    Needs(UtilitiesPreview),
    Rest,
    Wildlife,
    Scale(ScalePreview),
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub(crate) struct UtilitiesPreview {
    interactions: bool,
    seed: u32,
    hour: Option<f64>,
    rain: bool,
}

impl Preview {
    pub(crate) fn parse<'a>(
        args: impl IntoIterator<Item = &'a OsString>,
    ) -> Result<Option<Self>, String> {
        let mut args = args
            .into_iter()
            .map(|arg| arg.to_str().unwrap_or_default())
            .peekable();
        let mut scene = None;
        let mut utilities = UtilitiesPreview::default();
        let mut utilities_option = None;
        let mut unrecognized = None;
        while let Some(arg) = args.next() {
            let (flag, inline) = arg
                .split_once('=')
                .map_or((arg, None), |(key, value)| (key, Some(value)));
            let mut value = || inline.or_else(|| args.next_if(|value| !value.starts_with("--")));
            let next = match flag {
                "--downtime-preview" => Self::Downtime,
                "--utilities-preview" => Self::Utilities(UtilitiesPreview::default()),
                "--arrival-preview" => Self::Arrival,
                "--needs-preview" => Self::Needs(UtilitiesPreview::default()),
                "--rest-preview" => Self::Rest,
                "--wildlife-preview" => Self::Wildlife,
                "--scale-preview" => Self::Scale(match value() {
                    None | Some("" | "default") => ScalePreview::Default,
                    Some("homes") => ScalePreview::Homes,
                    Some("new-homes") => ScalePreview::NewHomes,
                    Some(_) => {
                        return Err("--scale-preview expects default, homes, or new-homes.".into());
                    }
                }),
                "--interactions" | "--land-seed" | "--lighting-hour" | "--lighting-rain" => {
                    utilities_option = Some(flag);
                    match flag {
                        "--interactions" => utilities.interactions = true,
                        "--land-seed" => {
                            utilities.seed = value()
                                .unwrap_or_default()
                                .parse()
                                .map_err(|_| "--land-seed expects an unsigned 32-bit integer.")?;
                        }
                        "--lighting-hour" => {
                            utilities.hour = Some(
                                value()
                                    .ok_or("--lighting-hour expects an hour between 0 and 24.")?
                                    .parse::<f64>()
                                    .ok()
                                    .filter(|hour| hour.is_finite())
                                    .unwrap_or(12.0)
                                    .clamp(0.0, 24.0),
                            );
                        }
                        "--lighting-rain" => utilities.rain = true,
                        _ => unreachable!(),
                    }
                    continue;
                }
                _ => {
                    unrecognized.get_or_insert(arg);
                    continue;
                }
            };
            if scene.replace(next).is_some() {
                return Err("Choose one village preview at a time.".into());
            }
        }
        let Some(scene) = scene else {
            return if let Some(flag) = utilities_option {
                Err(format!(
                    "{flag} requires --utilities-preview or --needs-preview."
                ))
            } else {
                Ok(None)
            };
        };
        if let Some(arg) = unrecognized {
            return Err(format!("Unexpected village preview argument {arg}."));
        }
        Ok(Some(match scene {
            Self::Utilities(_) => Self::Utilities(utilities),
            Self::Needs(_) => Self::Needs(utilities),
            _ if utilities_option.is_some() => {
                return Err(format!(
                    "{} requires --utilities-preview or --needs-preview.",
                    utilities_option.expect("utility preview option")
                ));
            }
            _ => scene,
        }))
    }

    pub(crate) fn title(self) -> &'static str {
        match self {
            Self::Downtime => "Downtime preview",
            Self::Utilities(_) => "Utilities preview",
            Self::Arrival => "Arrival preview",
            Self::Needs(_) => "Needs preview",
            Self::Rest => "Rest preview",
            Self::Wildlife => "Wildlife preview",
            Self::Scale(_) => "Scale preview",
        }
    }

    pub(crate) fn start(self, app: &mut App) -> Result<(), String> {
        let (mode, seed, clock) = match self {
            Self::Downtime => (Mode::Story, None, 1300.0),
            Self::Utilities(options) => (Mode::Story, Some(options.seed), options.clock()),
            Self::Needs(options) => (Mode::Story, Some(options.seed), 200.0),
            Self::Arrival | Self::Rest | Self::Wildlife => (Mode::Story, Some(0), 0.0),
            Self::Scale(_) => (Mode::Sandbox, Some(42), 400.0),
        };
        let mut scene = PreviewVillage::new(self.title(), mode, seed, clock);
        match self {
            Self::Downtime => prepare_downtime(&mut scene)?,
            Self::Utilities(options) => {
                prepare_utilities(&mut scene, options.interactions)?;
                scene.village.preview_rain =
                    (options.hour.is_some() || options.interactions || options.rain)
                        .then_some(options.rain);
                scene.village.paused = options.hour.is_some() || options.rain;
            }
            Self::Arrival => prepare_arrival(&mut scene),
            Self::Needs(options) => {
                let home = prepare_utilities(&mut scene, options.interactions)?;
                prepare_needs(&mut scene, home);
                scene.village.paused = options.hour.is_some();
            }
            Self::Rest => prepare_rest(&mut scene),
            Self::Wildlife => {
                prepare_wildlife(&mut scene);
                app.insert_resource(crate::wildlife::WildlifePreview(
                    scene.village.session_serial,
                ));
            }
            Self::Scale(variant) => {
                prepare_scale(&mut scene, variant)?;
                scene.village.paused = true;
                scene.village.preview_rain = Some(false);
            }
        }
        scene.village.stock.sandbox = mode == Mode::Sandbox;
        app.insert_resource(scene.setup)
            .insert_resource(scene.village)
            .insert_resource(SaveMenu {
                preview: true,
                ..default()
            });
        Ok(())
    }
}

impl UtilitiesPreview {
    fn clock(self) -> f64 {
        if let Some(hour) = self.hour {
            // Start on the following day, including when the hour is before the 09:00 epoch.
            (hour + 24.0 - 9.0) * weather::HOUR
        } else if self.interactions {
            0.0
        } else {
            1100.0
        }
    }
}

struct PreviewVillage {
    village: Village,
    setup: WorldSetup,
    land: Land,
    catalog: Catalog,
}

impl PreviewVillage {
    fn new(title: &str, mode: Mode, seed: Option<u32>, clock: f64) -> Self {
        let mut setup = WorldSetup::default().session();
        setup.mode = mode;
        if let Some(seed) = seed {
            setup = setup.with_preview_seed(seed);
        }
        let catalog = Catalog::default();
        let land = Land::generate(&setup);
        let mut stock = Stock::for_start(&setup, &catalog);
        // Build the fixture through the normal placement rules without material costs.
        stock.sandbox = true;
        let village = Village {
            setup: Some(setup.clone()),
            camp: Some(CLEARING_CAMP),
            arrival_time: ARRIVAL_DURATION,
            clock,
            stock,
            rebuild_scene: true,
            save_notice: format!("{title} · This village is not saved."),
            ..default()
        };
        Self {
            village,
            setup,
            land,
            catalog,
        }
    }

    fn order(&mut self, order: &LabOrder) -> Result<(), String> {
        let terrain = self.village.terrain(&self.setup);
        let site = ConstructionSite {
            terrain: &terrain,
            land: &self.land,
            camp: self.village.camp.expect("the fixture has a camp"),
        };
        let clock = TownClock {
            seconds: self.village.clock,
            round_trip_km: self.setup.round_trip_km(),
        };
        self.village.construction.lab_order(
            &self.catalog,
            &mut self.village.stock,
            site,
            clock,
            order,
            self.setup.richness(),
        )
    }

    fn build_at(
        &mut self,
        key: &str,
        cell: IVec2,
        rotation: u8,
        size: Option<IVec2>,
    ) -> Result<usize, String> {
        self.order(&LabOrder::Build {
            key: key.into(),
            x: cell.x,
            z: cell.y,
            rotation,
            size: size.map(|size| size.to_array()),
        })?;
        Ok(self.village.construction.project_count())
    }

    fn build(
        &mut self,
        key: &str,
        cell: IVec2,
        rotation: u8,
        size: Option<IVec2>,
    ) -> Result<usize, String> {
        let mut offsets = (-16i32..=16)
            .flat_map(|dz| (-16i32..=16).map(move |dx| IVec2::new(dx, dz)))
            .collect::<Vec<_>>();
        offsets.sort_by_key(|offset| (offset.abs().max_element(), offset.length_squared()));
        offsets
            .into_iter()
            .find_map(|offset| self.build_at(key, cell + offset, rotation, size).ok())
            .ok_or_else(|| format!("Could not place {key} near ({}, {})", cell.x, cell.y))
    }

    fn focus(&mut self, cell: IVec2, zoom: f32) {
        let position = world_position(cell.x as f32, cell.y as f32);
        let terrain = self.village.terrain(&self.setup);
        self.village.camera_view = Some(CameraView {
            target: Vec3::new(
                position.x,
                terrain.height_at(position.x, position.y),
                position.y,
            ),
            heading: 0.0,
            polar: crate::default_camera_polar(),
            zoom,
        });
    }
}

const UTILITY_SITES: [(&str, i32, i32); 11] = [
    ("solar_farm", 27, 39),
    ("well", 33, 39),
    ("workshop", 38, 39),
    ("warehouse", 45, 39),
    ("garden", 45, 31),
    ("eco_toilet", 39, 30),
    ("banana_treatment", 43, 25),
    ("wetland", 34, 30),
    ("house", 27, 30),
    ("streetlight", 30, 37),
    ("fire-circle", 33, 36),
];

fn prepare_downtime(scene: &mut PreviewVillage) -> Result<(), String> {
    scene.village.stock.cash = 3000;
    for (key, x, z) in UTILITY_SITES {
        scene.build(key, IVec2::new(x, z), 0, None)?;
    }
    scene.village.construction.prepare_downtime_preview();
    Ok(())
}

const INTERACTION_SITES: [(&str, i32, i32); 5] = [
    ("goat_pasture", 53, 31),
    ("coop", 53, 40),
    ("wash-station", 34, 44),
    ("shed", 38, 46),
    ("square", 44, 47),
];

fn prepare_utilities(scene: &mut PreviewVillage, interactions: bool) -> Result<usize, String> {
    let extra_sites = if interactions {
        &INTERACTION_SITES[..]
    } else {
        &[]
    };
    let mut ids = std::collections::BTreeMap::new();
    for &(key, x, z) in UTILITY_SITES.iter().chain(extra_sites) {
        let id = scene.build(key, IVec2::new(x, z), 0, None)?;
        ids.insert(key, id);
    }

    let solar = ids["solar_farm"];
    let house = ids["house"];
    let well = ids["well"];
    let toilet = ids["eco_toilet"];
    let construction = &mut scene.village.construction;
    construction.prepare_utility_preview_batteries(&scene.catalog, solar, house);
    let utilities = &mut construction.utilities;
    for key in ["well", "workshop", "streetlight", "eco_toilet"] {
        utilities.install_power_link(solar, ids[key]);
    }
    for (from, to, channel) in [
        (well, 0, 0),
        (well, ids["garden"], 1),
        (toilet, ids["banana_treatment"], 3),
    ] {
        utilities.install_water_link(from, to, channel);
    }
    for (id, channel, liters) in [
        (well, 0, 30.0),
        (well, 1, 40.0),
        (toilet, 3, 10.0),
        (ids["wetland"], 2, 12.0),
    ] {
        utilities.deliver_water(id, channel, liters);
    }
    if interactions {
        for key in ["goat_pasture", "coop", "wash-station"] {
            let id = ids[key];
            let capacity = utilities
                .water_site(id)
                .expect("preview water site")
                .capacity[0];
            utilities.deliver_water(id, 0, capacity);
        }
    }
    construction.sync_utility_facilities(&scene.catalog);

    let stock = &mut scene.village.stock;
    stock.sandbox = false;
    stock.cash = 3000;
    let supplies = scene
        .catalog
        .materials
        .keys()
        .filter_map(|key| {
            let amount: u32 = match key.as_str() {
                "wood" => 60,
                "electrical" | "plumbing" => 40,
                _ => 20,
            };
            let missing = amount.saturating_sub(stock.available(key));
            (missing > 0).then(|| (key.clone(), missing))
        })
        .collect();
    stock.receive(&supplies);

    if interactions {
        let goat_pasture = ids["goat_pasture"];
        let coop = ids["coop"];
        scene
            .village
            .construction
            .prepare_utility_preview_interactions(
                &scene.catalog,
                scene.village.clock,
                [goat_pasture, coop],
            );
        for (site, recipe) in [(goat_pasture, "milk"), (coop, "eggs")] {
            scene.order(&LabOrder::Produce {
                site,
                recipe: recipe.into(),
            })?;
        }
    }
    Ok(house)
}

fn prepare_arrival(scene: &mut PreviewVillage) {
    scene.village.camp = None;
    scene.village.arrival_time = 0.0;
    scene.focus(crate::construction::STOCKPILE, 1.0);
}

fn prepare_needs(scene: &mut PreviewVillage, house: usize) {
    scene.village.preview_rain = Some(false);
    scene.village.construction.prepare_needs_preview();
    scene
        .village
        .construction
        .utilities
        .deliver_water(house, 0, 5.0);
}

fn prepare_rest(scene: &mut PreviewVillage) {
    scene.village.camp = None;
    scene.village.construction.prepare_rest_preview();
    scene.focus(crate::construction::STOCKPILE + IVec2::new(0, 2), 1.0);
}

fn prepare_wildlife(scene: &mut PreviewVillage) {
    scene.village.camp = None;
    scene.focus(crate::construction::STOCKPILE + IVec2::new(0, 2), 1.0);
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum ScalePreview {
    Default,
    Homes,
    NewHomes,
}

fn prepare_scale(scene: &mut PreviewVillage, variant: ScalePreview) -> Result<(), String> {
    const VILLAGE: &[(&str, i32, i32)] = &[
        ("house", 44, 44),
        ("home-family", 54, 44),
        ("home-shared", 66, 44),
        ("kitchen", 44, 55),
        ("workshop", 56, 55),
        ("warehouse", 66, 55),
        ("garden", 44, 65),
        ("greenhouse", 52, 65),
        ("goat_pasture", 60, 65),
        ("solar_farm", 72, 65),
        ("rain-barrel", 40, 44),
        ("wayfinding-sign", 40, 47),
        ("supply-5", 40, 50),
        ("orchard", 44, 77),
        ("grove", 54, 77),
    ];
    const HOMES: &[(&str, i32, i32)] = &[
        ("home-cottage", 35, 44),
        ("home-longhouse", 85, 44),
        ("house", 44, 43),
        ("home-gable", 54, 43),
        ("adobe-gable", 64, 43),
        ("home-family", 74, 43),
        ("home-veranda", 44, 55),
        ("adobe-veranda", 54, 55),
        ("home-courtyard", 64, 55),
        ("home-shared", 76, 55),
    ];
    const NEW_HOMES: &[(&str, i32, i32)] = &[
        ("home-studio", 35, 43),
        ("home-lane", 47, 43),
        ("home-garden", 59, 43),
        ("home-ochre", 71, 43),
        ("home-deep-porch", 83, 43),
        ("home-blue-gallery", 35, 57),
        ("home-paired", 47, 57),
        ("home-broad-veranda", 59, 57),
        ("home-shaded-retreat", 71, 57),
        ("home-ranch", 83, 57),
    ];
    let (sites, streets, focus) = match variant {
        ScalePreview::Default => (VILLAGE, &[(42, 74, 51)][..], IVec2::new(56, 57)),
        ScalePreview::Homes => (HOMES, &[(42, 83, 51), (42, 83, 63)][..], IVec2::new(63, 52)),
        ScalePreview::NewHomes => (
            NEW_HOMES,
            &[(35, 93, 51), (35, 93, 65)][..],
            IVec2::new(62, 53),
        ),
    };
    for &(start, end, z) in streets {
        scene.order(&LabOrder::Road {
            start: [start, z],
            end: [end, z],
        })?;
    }
    for &(key, x, z) in sites {
        scene.build_at(key, IVec2::new(x, z), 0, None)?;
    }

    // V3 uses its current footbridge model at both comparison crossings.
    for cell in [IVec2::new(6, 48), IVec2::new(5, 39)] {
        scene.build_at("bridge", cell, 0, None)?;
    }
    scene
        .village
        .construction
        .prepare_scale_preview(&scene.catalog);
    scene.focus(focus, 46.0 / crate::CAMERA_HEIGHT);
    scene.village.construction.record_event(
        scene.village.clock,
        "Physical-scale review · 2 m per tile.".into(),
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn start(args: &[&str]) -> App {
        let args = args.iter().map(OsString::from).collect::<Vec<_>>();
        let mut app = App::new();
        Preview::parse(&args)
            .unwrap()
            .unwrap()
            .start(&mut app)
            .unwrap();
        let menu = app.world().resource::<SaveMenu>();
        let village = app.world().resource::<Village>();
        let mode = village.mode().unwrap();
        assert!(menu.preview);
        assert!(menu.continue_path(mode).is_err());
        assert!(menu.directory(mode).is_err());
        save_session(menu, village, &Catalog::default()).unwrap();
        app
    }

    #[test]
    fn downtime_preview_starts_an_evening_village_without_save_access() {
        let app = start(&["--downtime-preview"]);
        let village = app.world().resource::<Village>();
        assert_eq!(village.camp, Some(CLEARING_CAMP));
        assert!(village.mode() == Some(Mode::Story));
        assert_eq!(weather::game_minutes(village.clock), 1125);
        assert!(!village.stock.sandbox);
    }

    #[test]
    fn utilities_preview_starts_with_connected_and_stocked_facilities() {
        let app = start(&["--utilities-preview"]);
        let world = app.world();
        let village = world.resource::<Village>();
        let utilities = &village.construction.utilities;
        assert_eq!(world.resource::<WorldSetup>().seed(), 0);
        assert_eq!(village.clock, 1100.0);
        assert!(!village.is_paused());
        assert_eq!(utilities.battery_meter(1), Some((24.0, 24.0)));
        assert_eq!(utilities.battery_meter(9), Some((3.0, 4.0)));
        assert!(utilities.has_rooftop_solar(8));
        for target in [2, 3, 6, 10] {
            assert!(utilities.power_link_exists(1, target));
        }
        for (from, to, channel) in [(2, 0, 0), (2, 5, 1), (6, 7, 3)] {
            assert!(utilities.water_link_exists(from, to, channel));
        }
        assert_eq!(
            utilities.water_site(2).unwrap().levels,
            [30.0, 40.0, 0.0, 0.0]
        );
        assert_eq!(utilities.water_site(6).unwrap().levels[3], 10.0);
        assert_eq!(utilities.water_site(8).unwrap().levels[2], 12.0);
    }

    #[test]
    fn utilities_interactions_starts_at_nine_with_animal_jobs() {
        let app = start(&["--utilities-preview", "--interactions", "--land-seed=7"]);
        let world = app.world();
        let village = world.resource::<Village>();
        let construction = &village.construction;
        let catalog = Catalog::default();
        assert_eq!(world.resource::<WorldSetup>().seed(), 7);
        assert_eq!(village.clock, 0.0);
        assert_eq!(construction.project_count(), 16);
        for (site, kind, recipe) in [
            (12, "goat_pasture", "Collect milk"),
            (13, "coop", "Collect eggs"),
            (14, "wash-station", ""),
        ] {
            let water = construction.utilities.water_site(site).unwrap();
            assert_eq!(water.kind, kind);
            assert_eq!(water.levels[0], water.capacity[0]);
            if !recipe.is_empty() {
                let status = construction.production_site_status(
                    &catalog,
                    &village.stock,
                    site - 1,
                    village.clock,
                );
                assert!(status.contains(recipe), "{status}");
            }
        }
    }

    #[test]
    fn utilities_lighting_starts_paused_with_the_requested_hour_and_rain() {
        let app = start(&[
            "--lighting-rain",
            "--utilities-preview",
            "--land-seed=7",
            "--lighting-hour=6.5",
        ]);
        let world = app.world();
        let village = world.resource::<Village>();
        assert!(village.is_paused());
        assert_eq!(weather::game_hour(village.clock), 6.5);
        let conditions = village.weather(world.resource::<WorldSetup>());
        assert!(conditions.rain > 0.05);
        assert_eq!(conditions.cloud, 0.85);
    }

    #[test]
    fn arrival_preview_starts_before_the_cars_park() {
        let app = start(&["--arrival-preview"]);
        let village = app.world().resource::<Village>();
        assert!(village.camp.is_none());
        assert_eq!(village.arrival_time, 0.0);
        let target = village.camera_view.unwrap().target.xz();
        let stockpile = crate::construction::STOCKPILE;
        assert_eq!(
            target,
            world_position(stockpile.x as f32, stockpile.y as f32)
        );
    }

    #[test]
    fn needs_preview_starts_with_five_different_low_needs() {
        let app = start(&["--needs-preview"]);
        let village = app.world().resource::<Village>();
        assert_eq!(village.camp, Some(CLEARING_CAMP));
        assert_eq!(village.clock, 200.0);
        for (index, need) in ["Food", "Bladder", "Hygiene", "Social", "Fun"]
            .into_iter()
            .enumerate()
        {
            let meters = village.construction.resident_need_meters(index);
            assert_eq!(meters[0], ("Energy", 80.0 + 3.0 * index as f64));
            assert!(meters.contains(&(need, 8.0)), "{meters:?}");
        }
        assert_eq!(
            village.construction.utilities.water_site(9).unwrap().levels[0],
            5.0
        );
    }

    #[test]
    fn rest_preview_starts_with_five_tired_residents_at_the_stockpile() {
        let app = start(&["--rest-preview"]);
        let village = app.world().resource::<Village>();
        assert!(village.camp.is_none());
        assert_eq!(village.arrival_time, ARRIVAL_DURATION);
        for index in 0..NAMES.len() {
            assert_eq!(
                village.construction.resident_need_meters(index)[0],
                ("Energy", 10.0)
            );
        }
    }

    #[test]
    fn scale_preview_variants_start_paused_with_their_own_camera_and_roads() {
        let catalog = Catalog::default();
        for (flag, focus, roads, projects) in [
            ("--scale-preview", Vec2::new(48.0, 50.0), 33, 50),
            ("--scale-preview=homes", Vec2::new(62.0, 40.0), 84, 96),
            ("--scale-preview=new-homes", Vec2::new(60.0, 42.0), 118, 130),
        ] {
            let app = start(&[flag]);
            let village = app.world().resource::<Village>();
            assert!(village.is_paused());
            assert!(village.mode() == Some(Mode::Sandbox));
            assert_eq!(village.clock, 400.0);
            let view = village.camera_view.unwrap();
            assert_eq!(view.target.xz(), focus);
            assert_eq!(view.zoom * crate::CAMERA_HEIGHT, 46.0);
            assert_eq!(
                village.construction.road_project_counts(&catalog),
                (roads, roads)
            );
            assert_eq!(
                village.construction.finished_models(&catalog).count(),
                projects
            );
        }
    }

    #[test]
    fn wildlife_preview_starts_with_four_birds_in_flight() {
        let mut app = start(&["--wildlife-preview"]);
        assert!(app.world().resource::<Village>().camp.is_none());
        app.init_resource::<Time>()
            .init_resource::<Assets<Mesh>>()
            .init_resource::<Assets<StandardMaterial>>()
            .add_plugins(crate::wildlife::WildlifePlugin);
        app.update();

        let world = app.world_mut();
        let mut visitors = world.query::<(&Name, &Transform)>();
        let birds = visitors
            .iter(world)
            .filter(|(name, _)| name.as_str() == "Wildlife visitor")
            .collect::<Vec<_>>();
        assert_eq!(birds.len(), 4);
        assert!(birds.iter().all(|(_, pose)| pose.scale == Vec3::ONE));
    }
}
