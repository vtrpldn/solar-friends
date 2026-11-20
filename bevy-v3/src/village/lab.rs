mod map;

use std::{
    io,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

use super::*;
use crate::construction::{LabOrder, LabStop};

#[derive(Deserialize, Serialize)]
struct Scenario {
    steps: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    setup: Option<WorldSetup>,
    #[serde(default)]
    orders: Vec<ScheduledOrder>,
    #[serde(default)]
    stop: LabStop,
}

#[derive(Deserialize, Serialize)]
struct ScheduledOrder {
    step: u64,
    order: LabOrder,
}

#[derive(Serialize)]
struct Sample {
    step: u64,
    seconds: f64,
    cash_centavos: u64,
    timber: u32,
    meals: u32,
    potable_liters: f64,
    minimum_hydration: f64,
    watershed: Option<crate::utilities::WatershedSample>,
    weather: WeatherSample,
    inventory: std::collections::BTreeMap<String, u32>,
    spoiled: std::collections::BTreeMap<String, u64>,
    residents: String,
}

#[derive(Serialize)]
struct WeatherSample {
    temperature_c: f64,
    rainfall_mm_per_hour: f64,
    cloud_cover: f64,
}

fn lab_weather(village: &Village, setup: &WorldSetup) -> WeatherSample {
    let weather = crate::weather::weather_at(village.clock, setup.biome(), setup.seed());
    WeatherSample {
        temperature_c: weather.temperature,
        rainfall_mm_per_hour: weather.rain,
        cloud_cover: weather.cloud,
    }
}

#[derive(Serialize)]
struct Outcome {
    step: u64,
    error: Option<String>,
}

#[derive(Serialize)]
struct Report<'a> {
    version: u32,
    scenario: &'a Scenario,
    initial: &'a serde_json::Value,
    step_seconds: f64,
    end_step: u64,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    partial: bool,
    stop_reason: Option<&'static str>,
    samples: &'a [Sample],
    trends: &'a TrendHistory,
    orders: &'a [Outcome],
    village: &'a Village,
}

pub(crate) fn run_file(scenario: &Path, save: Option<&Path>) -> io::Result<()> {
    let catalog = Catalog::default();
    let (scenario, village) = load_inputs(scenario, save, &catalog)?;
    let report = run(scenario, village, &catalog)?;
    serde_json::to_writer(io::stdout().lock(), &report.report())?;
    Ok(())
}

fn load_inputs(
    scenario: &Path,
    save: Option<&Path>,
    catalog: &Catalog,
) -> io::Result<(Scenario, Option<Village>)> {
    let input = crate::save::read_bytes(scenario, 1024 * 1024)?;
    let scenario: Scenario = serde_json::from_slice(&input)?;
    if scenario.setup.is_some() && save.is_some() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Choose either a scenario setup or a village checkpoint.",
        ));
    }
    let village = save
        .map(|path| crate::save::read(path, catalog))
        .transpose()?;
    Ok((scenario, village))
}

pub(crate) fn replay_file(path: &Path) -> io::Result<()> {
    let bytes = crate::save::read_bytes(path, 3 * crate::save::MAX_BYTES)?;
    let expected = serde_json::from_slice(&bytes)?;
    let end_step = verify_report(expected, &Catalog::default())?;
    println!("Replay matched through step {end_step}.");
    Ok(())
}

#[derive(Resource)]
struct Replay {
    expected: Option<serde_json::Value>,
    version: u64,
    limit: u64,
}

fn verify_report(expected: serde_json::Value, catalog: &Catalog) -> io::Result<u64> {
    let (mut runner, mut replay) = prepare_replay(expected, catalog)?;
    while runner.index < replay.limit && !runner.done() {
        runner.advance(catalog);
    }
    compare_replay(
        &runner,
        replay.expected.take().expect("replay report"),
        replay.version,
    )?;
    Ok(runner.index)
}

fn prepare_replay(
    mut expected: serde_json::Value,
    catalog: &Catalog,
) -> io::Result<(Runner, Replay)> {
    let Some(version @ 1..=7) = expected.get("version").and_then(serde_json::Value::as_u64) else {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Unsupported lab report version.",
        ));
    };
    let initial = expected
        .get_mut("initial")
        .ok_or_else(|| io::Error::other("Missing starting village."))?
        .take();
    let scenario = expected
        .get_mut("scenario")
        .ok_or_else(|| io::Error::other("Missing scenario."))?
        .take();
    let village: Village = serde_json::from_value(initial)?;
    if !village.valid_save(catalog) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Invalid starting village.",
        ));
    }
    let scenario: Scenario = serde_json::from_value(scenario)?;
    let limit = if expected["partial"] == true {
        expected["end_step"]
            .as_u64()
            .filter(|step| *step < scenario.steps)
            .ok_or_else(|| io::Error::other("Invalid partial report end step."))?
    } else {
        scenario.steps
    };
    let runner = Runner::new(scenario, Some(village), catalog)?;
    Ok((
        runner,
        Replay {
            expected: Some(expected),
            version,
            limit,
        },
    ))
}

fn compare_replay(runner: &Runner, expected: serde_json::Value, version: u64) -> io::Result<()> {
    let mut actual: serde_json::Value =
        serde_json::from_slice(&serde_json::to_vec(&runner.report())?)?;
    actual["initial"] = serde_json::Value::Null;
    actual["scenario"] = serde_json::Value::Null;
    if version < 7 {
        actual["version"] = version.into();
        actual
            .as_object_mut()
            .expect("report object")
            .remove("trends");
    }
    if version < 6
        && let Some(jobs) = actual
            .pointer_mut("/village/construction/production/jobs")
            .and_then(serde_json::Value::as_array_mut)
    {
        for job in jobs {
            job.as_object_mut()
                .expect("production job")
                .remove("waiting_for_access");
        }
    }
    if version < 5
        && let Some(plots) = actual
            .pointer_mut("/village/construction/farming/plots")
            .and_then(serde_json::Value::as_object_mut)
    {
        for plot in plots.values_mut() {
            if let Some(beds) = plot["beds"].as_array_mut() {
                for bed in beds {
                    bed.as_object_mut()
                        .expect("bed object")
                        .remove("irrigated_liters");
                }
            }
        }
    }
    if version < 4
        && let Some(samples) = actual["samples"].as_array_mut()
    {
        for sample in samples {
            let fields = sample.as_object_mut().expect("sample object");
            fields.remove("inventory");
            fields.remove("spoiled");
            if version < 3 {
                fields.remove("weather");
            }
            if version == 1 {
                fields.remove("watershed");
            }
        }
    }
    if version == 1 {
        let ground = "/village/construction/utilities/ground";
        if expected
            .pointer(ground)
            .and_then(|value| value.get("account"))
            .is_none()
            && let Some(account) = actual
                .pointer_mut(ground)
                .and_then(serde_json::Value::as_object_mut)
        {
            account.remove("account");
        }
    }
    if actual != expected {
        return Err(io::Error::other(
            "Replay diverged from the recorded results.",
        ));
    }
    Ok(())
}

const STEP: f64 = SIMULATION_STEP;
const SPEEDS: [(KeyCode, u16); 9] = [
    (KeyCode::Digit1, 1),
    (KeyCode::Digit2, 4),
    (KeyCode::Digit3, 16),
    (KeyCode::Digit4, 32),
    (KeyCode::Digit5, 64),
    (KeyCode::Digit6, 128),
    (KeyCode::Digit7, 256),
    (KeyCode::Digit8, 512),
    (KeyCode::Digit9, 1024),
];
const SAMPLE_LIMIT: usize = 2160;
const PLAYBACK_STOPS: [(LabStop, &str); 6] = [
    (LabStop::None, "Interval or scenario limit"),
    (LabStop::Harvest, "Crop ready"),
    (LabStop::CropFailed, "Crop failed or expired"),
    (LabStop::Hydration, "Urgent thirst"),
    (LabStop::Water, "Low drinking water"),
    (LabStop::Blocked, "Blocked job access"),
];
const RUN_INTERVALS: [(f64, &str); 6] = [
    (0.1, "0.1 day"),
    (1.0, "1 day"),
    (7.0, "7 days"),
    (30.0, "30 days"),
    (90.0, "90 days"),
    (365.0, "365 days"),
];

#[derive(Serialize)]
struct TrendSample {
    step: u64,
    cash_centavos: u64,
    potable_liters: f64,
    minimum_hydration: f64,
    food_units: u32,
}

#[derive(Default, Serialize)]
struct TrendHistory {
    #[serde(skip)]
    hour: Option<u64>,
    omitted: u64,
    samples: std::collections::VecDeque<TrendSample>,
}

impl TrendHistory {
    fn record(&mut self, step: u64, village: &Village) {
        let hour = (village.clock / crate::weather::HOUR) as u64;
        if self.hour == Some(hour) {
            if self.samples.back().is_none_or(|sample| sample.step != step) {
                return;
            }
            self.samples.pop_back();
        }
        self.hour = Some(hour);
        if self.samples.len() == SAMPLE_LIMIT {
            self.samples.pop_front();
            self.omitted = self.omitted.saturating_add(1);
        }
        self.samples.push_back(TrendSample {
            step,
            cash_centavos: village.stock.balance(),
            potable_liters: village.construction.utilities.stored_drinking_water(),
            minimum_hydration: village.construction.minimum_hydration(),
            food_units: village.stock.available("food"),
        });
    }
}

#[derive(Resource)]
struct Runner {
    scenario: Scenario,
    initial: serde_json::Value,
    village: Village,
    setup: WorldSetup,
    camp: IVec2,
    land: Land,
    terrain: crate::terrain::Terrain,
    terrain_key: (u64, u64, usize),
    index: u64,
    next_order: usize,
    samples: Vec<Sample>,
    trends: TrendHistory,
    outcomes: Vec<Outcome>,
    reason: Option<&'static str>,
    stride: u64,
}

impl Runner {
    fn new(scenario: Scenario, village: Option<Village>, catalog: &Catalog) -> io::Result<Self> {
        if scenario
            .orders
            .iter()
            .any(|order| order.step > scenario.steps)
            || scenario
                .orders
                .windows(2)
                .any(|pair| pair[1].step < pair[0].step)
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Orders must be sorted and within the run.",
            ));
        }
        if scenario
            .setup
            .as_ref()
            .is_some_and(|setup| setup.seed() == 0 || !setup.valid_save())
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Scenario setup contains an invalid seed or world setting.",
            ));
        }
        let village = village.unwrap_or_else(|| {
            Self::starting_village(
                &scenario.setup.clone().unwrap_or_default(),
                CLEARING_CAMP,
                catalog,
            )
        });
        let camp = village
            .camp
            .ok_or_else(|| io::Error::other("Place camp before running the lab."))?;
        let setup = village
            .setup
            .as_ref()
            .ok_or_else(|| io::Error::other("Village setup is missing."))?
            .clone();
        if scenario
            .setup
            .as_ref()
            .is_some_and(|requested| requested.session() != setup.session())
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "Scenario setup does not match the starting village.",
            ));
        }
        let stride = scenario.steps.div_ceil((SAMPLE_LIMIT - 1) as u64).max(1);
        let mut runner = Self {
            scenario,
            initial: serde_json::to_value(&village)?,
            land: Land::generate(&setup),
            terrain: village.terrain(&setup),
            terrain_key: village.terrain_key(),
            village,
            setup,
            camp,
            index: 0,
            next_order: 0,
            samples: Vec::new(),
            trends: TrendHistory::default(),
            outcomes: Vec::new(),
            reason: None,
            stride,
        };
        runner.observe(catalog);
        Ok(runner)
    }

    fn starting_village(setup: &WorldSetup, camp: IVec2, catalog: &Catalog) -> Village {
        Village {
            setup: Some(setup.session()),
            camp: Some(camp),
            arrival_time: ARRIVAL_DURATION,
            stock: Stock::for_start(setup, catalog),
            ..default()
        }
    }

    fn done(&self) -> bool {
        self.reason.is_some() || self.index == self.scenario.steps
    }

    fn sync_terrain(&mut self) {
        let key = self.village.terrain_key();
        if key != self.terrain_key {
            self.terrain = self.village.terrain(&self.setup);
            self.terrain_key = key;
        }
    }

    fn advance(&mut self, catalog: &Catalog) {
        if self.done() {
            return;
        }
        step(
            &mut self.village,
            catalog,
            &self.setup,
            ConstructionSite {
                terrain: &self.terrain,
                land: &self.land,
                camp: self.camp,
            },
            STEP,
        );
        self.sync_terrain();
        self.index += 1;
        self.observe(catalog);
    }

    fn observe(&mut self, catalog: &Catalog) {
        while let Some(order) = self
            .scenario
            .orders
            .get(self.next_order)
            .filter(|order| order.step == self.index)
        {
            let ground = ConstructionSite {
                terrain: &self.terrain,
                land: &self.land,
                camp: self.camp,
            };
            let clock = TownClock {
                seconds: self.village.clock,
                round_trip_km: self.setup.round_trip_km(),
            };
            let result = match &order.order {
                LabOrder::TerrainReset => {
                    self.village.terrain_editor.reset();
                    Ok(())
                }
                LabOrder::TerrainStroke { brush, points } => self
                    .village
                    .terrain_editor
                    .scripted_stroke(&self.terrain, *brush, points, |cell| {
                        self.village.construction.protects_terrain(cell)
                    }),
                order => self.village.construction.lab_order(
                    catalog,
                    &mut self.village.stock,
                    ground,
                    clock,
                    order,
                    self.setup.richness(),
                ),
            };
            let error = result.err();
            self.outcomes.push(Outcome {
                step: self.index,
                error,
            });
            self.next_order += 1;
            self.sync_terrain();
        }
        self.reason = self
            .village
            .construction
            .lab_stop_reason(self.scenario.stop, self.village.clock);
        self.trends.record(self.index, &self.village);
        if self.done() || self.index.is_multiple_of(self.stride) {
            self.samples.push(Sample {
                step: self.index,
                seconds: self.village.clock,
                cash_centavos: self.village.stock.balance(),
                timber: self.village.stock.available("wood"),
                meals: self.village.stock.available("meals"),
                potable_liters: self.village.construction.utilities.stored_drinking_water(),
                minimum_hydration: self.village.construction.minimum_hydration(),
                watershed: self.village.construction.utilities.watershed_sample(),
                weather: lab_weather(&self.village, &self.setup),
                inventory: catalog
                    .materials
                    .keys()
                    .filter_map(|id| {
                        let amount = self.village.stock.available(id);
                        (amount > 0).then(|| (id.clone(), amount))
                    })
                    .collect(),
                spoiled: self.village.stock.pantry.spoiled.clone(),
                residents: self.village.construction.resident_status(
                    catalog,
                    &self.village.stock,
                    0,
                ),
            });
        }
    }

    fn submit(&mut self, catalog: &Catalog, order: LabOrder) -> Result<(), &'static str> {
        self.submit_orders(catalog, [order])
    }

    fn submit_orders(
        &mut self,
        catalog: &Catalog,
        orders: impl IntoIterator<Item = LabOrder>,
    ) -> Result<(), &'static str> {
        if self.done() {
            return Err("The scenario is complete.");
        }
        self.scenario.orders.splice(
            self.next_order..self.next_order,
            orders.into_iter().map(|order| ScheduledOrder {
                step: self.index,
                order,
            }),
        );
        if self
            .samples
            .last()
            .is_some_and(|sample| sample.step == self.index)
        {
            self.samples.pop();
        }
        self.observe(catalog);
        Ok(())
    }

    fn latest_bed_outcome(&self, site: usize, bed: usize) -> Option<&Outcome> {
        self.scenario
            .orders
            .iter()
            .zip(&self.outcomes)
            .rev()
            .find_map(|(scheduled, outcome)| match &scheduled.order {
                LabOrder::Bed {
                    site: target,
                    bed: number,
                    ..
                }
                | LabOrder::ConfigureBed {
                    site: target,
                    bed: number,
                    ..
                } if *target == site && *number == bed => Some(outcome),
                _ => None,
            })
    }

    fn report(&self) -> Report<'_> {
        Report {
            version: 7,
            scenario: &self.scenario,
            initial: &self.initial,
            step_seconds: STEP,
            end_step: self.index,
            partial: !self.done(),
            stop_reason: self.reason,
            samples: &self.samples,
            trends: &self.trends,
            orders: &self.outcomes,
            village: &self.village,
        }
    }

    fn checkpoint(&self, path: &Path) -> io::Result<()> {
        crate::save::write(path, &self.village)
    }

    fn output_path(&self, kind: &str) -> io::Result<std::path::PathBuf> {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(io::Error::other)?;
        Ok(crate::save::location(self.setup.mode)?
            .with_file_name(format!("lab-{kind}-{}.json", nonce.as_nanos())))
    }

    fn export(&self, path: &Path) -> io::Result<()> {
        let bytes = serde_json::to_vec(&self.report())?;
        crate::save::atomic_write(path, &bytes, 3 * crate::save::MAX_BYTES)
    }
}

fn run(scenario: Scenario, village: Option<Village>, catalog: &Catalog) -> io::Result<Runner> {
    let mut runner = Runner::new(scenario, village, catalog)?;
    while !runner.done() {
        runner.advance(catalog);
    }
    Ok(runner)
}

pub(crate) fn run_ui(scenario: Option<&Path>, save: Option<&Path>) -> io::Result<()> {
    let source = scenario.map_or(LabSource::Story(WorldSetup::default()), |scenario| {
        LabSource::File {
            scenario: scenario.to_owned(),
            checkpoint: save.map(Path::to_owned),
        }
    });
    let catalog = Catalog::default();
    let runner = source.load(&catalog)?;
    open_lab(catalog, runner, None, Some(source));
    Ok(())
}

pub(crate) fn replay_ui(path: &Path) -> io::Result<()> {
    let bytes = crate::save::read_bytes(path, 3 * crate::save::MAX_BYTES)?;
    let catalog = Catalog::default();
    let (runner, replay) = prepare_replay(serde_json::from_slice(&bytes)?, &catalog)?;
    open_lab(catalog, runner, Some(replay), None);
    Ok(())
}

#[derive(Resource)]
enum LabSource {
    Story(WorldSetup),
    File {
        scenario: PathBuf,
        checkpoint: Option<PathBuf>,
    },
}

impl LabSource {
    fn load(&self, catalog: &Catalog) -> io::Result<Runner> {
        match self {
            Self::Story(setup) => Runner::new(
                Scenario {
                    steps: (365.0 * crate::weather::DAY / STEP).round() as u64,
                    setup: Some(setup.clone()),
                    orders: Vec::new(),
                    stop: LabStop::None,
                },
                Some(Runner::starting_village(setup, CAMP_SITES[1].1, catalog)),
                catalog,
            ),
            Self::File {
                scenario,
                checkpoint,
            } => {
                let (scenario, village) = load_inputs(scenario, checkpoint.as_deref(), catalog)?;
                Runner::new(scenario, village, catalog)
            }
        }
    }
}

fn open_lab(catalog: Catalog, runner: Runner, replay: Option<Replay>, source: Option<LabSource>) {
    let mut app = App::new();
    if let Some(replay) = replay {
        app.insert_resource(replay);
    }
    if let Some(source) = source {
        app.insert_resource(source);
    }
    app.insert_resource(catalog)
        .insert_resource(runner)
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                title: "Solar Friends V3 · Simulation lab".into(),
                ..default()
            }),
            ..default()
        }))
        .add_plugins(crate::ui_font::UiFontPlugin)
        .add_systems(Startup, setup_lab_window)
        .init_resource::<map::MapState>()
        .add_systems(Update, (update_lab_window, map::draw).chain())
        .run();
}

#[derive(Clone, Copy, Component, PartialEq, Eq)]
enum LabControl {
    Shortcut(KeyCode),
    CycleSpeed,
    SetInterval,
    AdvanceHour,
    FocusCamp,
    FindBuilding,
    OpenFile,
    ExportCheckpoint,
    ExportReport,
    View(LabView),
    Inventory,
    Confirm,
    Cancel,
}

#[derive(Component)]
struct LabControlLabel;

#[derive(Clone, Copy, Component, PartialEq, Eq)]
enum LabToolbar {
    Main,
    Jobs,
    Prompt,
    StorySettings,
}

fn setup_lab_window(mut commands: Commands, assets: Res<AssetServer>) {
    commands.spawn(Camera2d);
    let layout = commands
        .spawn(Node {
            position_type: PositionType::Absolute,
            top: px(10),
            left: px(24),
            right: px(24),
            flex_direction: FlexDirection::Column,
            row_gap: px(12),
            ..default()
        })
        .id();
    use LabControl::{AdvanceHour, CycleSpeed, SetInterval, Shortcut};

    let rows: [&[(LabControl, &str)]; 4] = [
        &[
            (Shortcut(KeyCode::Space), "Run / pause"),
            (Shortcut(KeyCode::KeyJ), "Single step"),
            (Shortcut(KeyCode::Tab), "Next view"),
            (Shortcut(KeyCode::F7), "New story run"),
            (Shortcut(KeyCode::F6), "Save lab"),
            (Shortcut(KeyCode::F9), "Load lab"),
            (LabControl::ExportReport, "Export report"),
            (LabControl::OpenFile, "Open lab file"),
            (LabControl::View(LabView::Trade), "Trade"),
            (LabControl::View(LabView::Residents), "Residents"),
            (LabControl::View(LabView::Jobs), "Jobs"),
        ],
        &[
            (CycleSpeed, "Cycle speed"),
            (AdvanceHour, "Advance 1 hour"),
            (SetInterval, "Set interval"),
            (Shortcut(KeyCode::F3), "Run interval"),
            (Shortcut(KeyCode::F4), "Cycle stop condition"),
            (LabControl::FocusCamp, "Focus camp"),
            (LabControl::FindBuilding, "Find building"),
            (LabControl::ExportCheckpoint, "Export checkpoint"),
            (LabControl::Inventory, "Inventory"),
            (LabControl::View(LabView::Trends), "Trends"),
        ],
        &[
            (LabControl::Confirm, "Confirm"),
            (LabControl::Cancel, "Cancel"),
        ],
        &[
            (Shortcut(KeyCode::ArrowUp), "Previous setting"),
            (Shortcut(KeyCode::ArrowDown), "Next setting"),
            (Shortcut(KeyCode::ArrowLeft), "Previous value"),
            (Shortcut(KeyCode::ArrowRight), "Next value"),
        ],
    ];
    let job_controls = [
        (Shortcut(KeyCode::KeyW), "All / waiting jobs"),
        (Shortcut(KeyCode::BracketLeft), "Previous site"),
        (Shortcut(KeyCode::BracketRight), "Next site"),
        (Shortcut(KeyCode::PageUp), "Previous page"),
        (Shortcut(KeyCode::PageDown), "Next page"),
    ];
    let job_rows = [rows[0], &job_controls];
    for (toolbar, rows) in [
        (LabToolbar::Main, &rows[..2]),
        (LabToolbar::Jobs, job_rows.as_slice()),
        (LabToolbar::Prompt, &rows[2..3]),
        (LabToolbar::StorySettings, &rows[2..]),
    ] {
        commands
            .spawn((
                toolbar,
                ChildOf(layout),
                Node {
                    display: if toolbar == LabToolbar::Main {
                        Display::Flex
                    } else {
                        Display::None
                    },
                    flex_direction: FlexDirection::Column,
                    flex_shrink: 0.0,
                    row_gap: px(6),
                    ..default()
                },
            ))
            .with_children(|toolbar| {
                for row in rows {
                    toolbar
                        .spawn(Node {
                            column_gap: px(6),
                            row_gap: px(6),
                            flex_wrap: FlexWrap::Wrap,
                            ..default()
                        })
                        .with_children(|group| {
                            for &(action, label) in *row {
                                group
                                    .spawn((
                                        Button,
                                        action,
                                        Node {
                                            padding: UiRect::axes(px(12), px(8)),
                                            ..default()
                                        },
                                        BackgroundColor(Color::srgb_u8(62, 83, 65)),
                                    ))
                                    .with_child((
                                        Text::new(label),
                                        LabControlLabel,
                                        ui_font(&assets, 15.0),
                                    ));
                            }
                        });
                }
            });
    }
    commands.spawn((Text::default(), ui_font(&assets, 18.0), ChildOf(layout)));
}

#[derive(Clone, Copy, Default, PartialEq, Eq)]
enum LabView {
    #[default]
    Overview,
    Stocked,
    AllItems,
    Jobs,
    Beds,
    Orders,
    Events,
    Map,
    Trends,
    Trade,
    Residents,
}

impl LabView {
    fn next(&self) -> Self {
        match self {
            Self::Overview => Self::Stocked,
            Self::Stocked => Self::AllItems,
            Self::AllItems => Self::Jobs,
            Self::Jobs => Self::Beds,
            Self::Beds => Self::Orders,
            Self::Orders => Self::Events,
            Self::Events => Self::Map,
            Self::Map => Self::Trends,
            Self::Trends => Self::Trade,
            Self::Trade => Self::Residents,
            Self::Residents => Self::Overview,
        }
    }
}

fn lab_sale_quote(runner: &Runner, catalog: &Catalog, id: &str, hold: bool) -> String {
    use std::fmt::Write as _;
    let village = &runner.village;
    let clock = TownClock {
        seconds: village.clock,
        round_trip_km: runner.setup.round_trip_km(),
    };
    let stock = &village.stock;
    let trade = &village.construction.trade;
    let (quantity, gross) = match trade.quote_sale_order(catalog, stock, id, clock.day(), 0) {
        Ok(quote) => quote,
        Err(reason) => return format!("Sale unavailable · {reason}"),
    };
    let item = &catalog.materials[id];
    let before = stock.available(id);
    let after = before.saturating_sub(quantity);
    let fuel = crate::market::fare_cents(clock.round_trip_km);
    let net = (gross as f64 - fuel as f64) / 100.0;
    let net = if net < 0.0 {
        format!("-R${:.2}", -net)
    } else {
        format!("R${net:.2}")
    };
    let transport = if hold {
        "Waiting for a shared pickup"
    } else {
        "Dedicated trip allowed"
    };
    let mut text = format!(
        "Sell {} · {} left in stock\nGross R${:.2} · Dedicated fuel R${:.2} · Net {net}\nShared pickup adds no fuel charge · {transport}",
        item.quantity_text(quantity.into()),
        item.quantity_text(after.into()),
        gross as f64 / 100.0,
        fuel as f64 / 100.0,
    );
    if let Some((_, serving)) = crate::food::SERVINGS
        .into_iter()
        .find(|(food, _)| *food == id)
    {
        let remaining = stock
            .food_portions()
            .saturating_sub(before / serving)
            .saturating_add(after / serving);
        let _ = write!(text, "\nHousehold food after sale · {remaining} portions");
    }
    text
}

#[derive(Default)]
struct LabTrade {
    selection: usize,
    hold_for_pickup: bool,
}

impl LabTrade {
    fn view(
        &mut self,
        runner: &mut Runner,
        catalog: &Catalog,
        keys: &ButtonInput<KeyCode>,
        replaying: bool,
    ) -> (String, Option<String>) {
        let mut options: Vec<_> = catalog
            .materials
            .iter()
            .filter(|(_, material)| material.pack > 0 && material.price > 0.0)
            .collect();
        options.sort_by(|a, b| a.1.name.cmp(&b.1.name).then_with(|| a.0.cmp(b.0)));
        if options.is_empty() {
            return ("Trade · No tradable materials".into(), None);
        }
        if keys.just_pressed(KeyCode::BracketRight) {
            self.selection = (self.selection + 1) % options.len();
        } else if keys.just_pressed(KeyCode::BracketLeft) {
            self.selection = (self.selection + options.len() - 1) % options.len();
        }
        let (id, material) = options[self.selection];
        let editable = !replaying && !runner.done();
        let mut notice = None;
        if editable {
            if keys.just_pressed(KeyCode::KeyH) {
                self.hold_for_pickup = !self.hold_for_pickup;
            }
            let order = if keys.just_pressed(KeyCode::KeyB) {
                Some(LabOrder::Buy {
                    material: id.clone(),
                    freight: false,
                })
            } else if keys.just_pressed(KeyCode::KeyS) {
                Some(LabOrder::Sell {
                    material: id.clone(),
                    hold_for_pickup: self.hold_for_pickup,
                })
            } else {
                None
            };
            if let Some(order) = order {
                notice = Some(match runner.submit(catalog, order) {
                    Ok(()) => runner
                        .outcomes
                        .last()
                        .and_then(|outcome| outcome.error.clone())
                        .unwrap_or_else(|| "Trade order accepted.".into()),
                    Err(error) => error.into(),
                });
            }
        }
        let actions = if editable {
            "\nB Fetch from town · S Sell one batch · H Toggle shared pickup"
        } else {
            ""
        };
        let buyer = &material.buyer.name;
        let quote = lab_sale_quote(runner, catalog, id, self.hold_for_pickup);
        (
            format!(
                "Resources & trade · {}\nTab Switch view · [ / ] Choose material{actions}\n\nIn stock · {}\nPurchase pack · {}\nSupplier · {}\nBuyer · {buyer}\n\n{quote}",
                material.name,
                material.quantity_text(runner.village.stock.available(id).into()),
                material.quantity_text(material.pack.into()),
                material.supplier_name,
            ),
            notice,
        )
    }
}

fn lab_resident_view(
    runner: &mut Runner,
    catalog: &Catalog,
    keys: &ButtonInput<KeyCode>,
    playback: &mut Playback,
) -> String {
    use std::fmt::Write as _;
    let count = super::NAMES.len();
    if keys.just_pressed(KeyCode::BracketRight) {
        playback.resident = (playback.resident + 1) % count;
    } else if keys.just_pressed(KeyCode::BracketLeft) {
        playback.resident = (playback.resident + count - 1) % count;
    }
    let resident = playback.resident;
    let story = !runner.village.stock.sandbox;
    let editable = story && !playback.replaying && !runner.done();
    if editable && keys.any_just_pressed([KeyCode::KeyT, KeyCode::KeyY]) {
        let recurring = keys.just_pressed(KeyCode::KeyY);
        let work = runner.village.construction.lab_town_work(resident);
        let enabled = if recurring {
            !work.repeating
        } else {
            !work.booked
        };
        let order = LabOrder::Outside {
            resident: resident + 1,
            enabled,
            recurring,
        };
        playback.notice = match runner.submit(catalog, order) {
            Ok(()) => runner
                .outcomes
                .last()
                .and_then(|outcome| outcome.error.clone())
                .unwrap_or_else(|| "Town work order accepted.".into()),
            Err(error) => error.into(),
        };
    }
    let mut text = "Residents\nTab Switch view · [ / ] Choose resident".to_owned();
    if editable {
        text.push_str(" · T Book/cancel day shift · Y Toggle weekdays");
    }
    let village = &runner.village;
    for index in 0..count {
        let marker = if resident == index { "> " } else { "" };
        let row = village
            .construction
            .lab_resident_row(catalog, &village.stock, index);
        let _ = write!(text, "\n\n{marker}{row}");
        if story {
            let work = village.construction.lab_town_work(index);
            let _ = write!(
                text,
                "\n{} · Weekdays {}",
                work.status(),
                if work.repeating { "on" } else { "off" }
            );
        }
    }
    text
}

fn lab_environment(village: &Village, setup: &WorldSetup) -> String {
    let weather = lab_weather(village, setup);
    let (income, expenses, grid) = village.stock.finance_totals();
    format!(
        "Weather · {:.1} °C · {:.2} mm/h rain · {:.0}% cloud\n{}\nIncome R${:.2} · Net expenses R${:.2} · Grid R${:.2}",
        weather.temperature_c,
        weather.rainfall_mm_per_hour,
        weather.cloud_cover * 100.0,
        village.construction.utilities.water_summary(),
        income as f64 / 100.0,
        expenses as f64 / 100.0,
        grid as f64 / 100.0,
    )
}

fn lab_trends(history: &TrendHistory, catalog: &Catalog, orders: usize) -> String {
    use std::fmt::Write as _;
    const DISPLAY_HOURS: usize = 240;
    let retained = history.samples.len();
    let charts = retained.min(DISPLAY_HOURS);
    let samples: Vec<_> = history.samples.iter().skip(retained - charts).collect();
    let Some((first, last)) = samples.first().zip(samples.last()) else {
        return "Simulation trends\nNo samples yet.".into();
    };
    let mut text = format!(
        "Simulation trends · {retained} hourly samples retained · {} older omitted · {orders} recorded orders\nCharts · Latest {charts} samples · Steps {}–{} · Tab Switch view",
        history.omitted, first.step, last.step
    );
    let food_mass = catalog.materials["food"].mass;
    for (label, unit, values) in [
        (
            "Savings",
            "R$",
            samples
                .iter()
                .map(|s| s.cash_centavos as f64 / 100.0)
                .collect::<Vec<_>>(),
        ),
        (
            "Clean water",
            "L",
            samples.iter().map(|s| s.potable_liters).collect(),
        ),
        (
            "Lowest hydration",
            "%",
            samples.iter().map(|s| s.minimum_hydration).collect(),
        ),
        (
            "Food ingredients",
            "kg",
            samples
                .iter()
                .map(|s| f64::from(s.food_units) * food_mass)
                .collect(),
        ),
    ] {
        let (low, high) = values
            .iter()
            .fold((f64::INFINITY, f64::NEG_INFINITY), |(low, high), &value| {
                (low.min(value), high.max(value))
            });
        let width = values.len().min(40);
        const ROWS: usize = 4;
        let levels: Vec<_> = (0..width)
            .map(|column| {
                let value = values[column * (values.len() - 1) / (width - 1).max(1)];
                if high > low {
                    ((value - low) / (high - low) * (ROWS - 1) as f64).round() as usize
                } else {
                    0
                }
            })
            .collect();
        let latest = values[values.len() - 1];
        let _ = write!(
            text,
            "\n\n{label} · {latest:.1} {unit} · range {low:.1}–{high:.1}"
        );
        for row in (0..ROWS).rev() {
            text.push('\n');
            text.extend(
                levels
                    .iter()
                    .map(|&level| if row == level { '+' } else { '-' }),
            );
        }
    }
    text
}

const INVENTORY_ROWS: usize = 12;

fn lab_inventory(catalog: &Catalog, stock: &Stock, view: &LabView, page: &mut usize) -> String {
    let mut items: Vec<_> = catalog
        .materials
        .iter()
        .filter_map(|(id, material)| {
            let available = stock.available(id);
            let spoiled = stock.pantry.spoiled.get(id).copied().unwrap_or_default();
            (*view == LabView::AllItems || available > 0 || spoiled > 0).then_some((
                &material.name,
                available,
                spoiled,
            ))
        })
        .collect();
    items.sort_unstable_by(|a, b| a.0.cmp(b.0));
    let pages = items.len().div_ceil(INVENTORY_ROWS).max(1);
    *page = (*page).min(pages - 1);
    let filter = if *view == LabView::AllItems {
        "All items"
    } else {
        "In stock or spoiled"
    };
    let mut text = format!(
        "Inventory · {filter} · Page {} of {pages}\nTab Switch view · Page Up/Down Browse\n",
        *page + 1,
    );
    if items.is_empty() {
        text.push_str("\nNo supplies or spoilage recorded.");
    }
    for (name, available, spoiled) in items
        .into_iter()
        .skip(*page * INVENTORY_ROWS)
        .take(INVENTORY_ROWS)
    {
        use std::fmt::Write as _;
        let _ = write!(text, "\n{name} · {available} available");
        if spoiled > 0 {
            let _ = write!(text, " · {spoiled} spoiled");
        }
    }
    text
}

fn lab_job_page(jobs: &[String], page: &mut usize, focus: &str, waiting_only: bool) -> String {
    const ROWS: usize = 9;
    let pages = jobs.len().div_ceil(ROWS).max(1);
    *page = (*page).min(pages - 1);
    let heading = if waiting_only {
        "Waiting jobs"
    } else {
        "Active jobs"
    };
    let mut text = format!(
        "{heading} · {focus} · Page {} of {pages}\nTab Switch view · Page Up/Down Browse · [ / ] Project · W Waiting filter\n",
        *page + 1
    );
    if jobs.is_empty() {
        text.push_str("\nNo matching jobs.");
    }
    for job in jobs.iter().skip(*page * ROWS).take(ROWS) {
        text.push('\n');
        text.push_str(job);
    }
    text
}

fn lab_order_page(runner: &Runner, page: &mut usize) -> String {
    use std::fmt::Write as _;
    const ROWS: usize = 9;
    let count = runner.outcomes.len();
    let pages = count.div_ceil(ROWS).max(1);
    *page = (*page).min(pages - 1);
    let mut text = format!(
        "Order history · Page {} of {pages}\nTab Switch view · Page Up/Down Browse\n",
        *page + 1
    );
    if count == 0 {
        text.push_str("\nNo orders processed.");
    }
    for (index, (scheduled, outcome)) in runner
        .scenario
        .orders
        .iter()
        .zip(&runner.outcomes)
        .enumerate()
        .rev()
        .skip(*page * ROWS)
        .take(ROWS)
    {
        let action = order_label(&scheduled.order);
        let result = outcome.error.as_deref().unwrap_or("Accepted");
        let _ = write!(
            text,
            "\n#{} · Step {} · {action} · {result}",
            index + 1,
            outcome.step
        );
    }
    text
}

fn order_label(order: &LabOrder) -> String {
    use crate::farming::FarmAction;
    match order {
        LabOrder::ResizeField {
            site,
            size: [width, depth],
        } => format!("Resize field #{site} to {width} × {depth}"),
        LabOrder::Copy { site, x, z } => format!("Copy project #{site} to ({x}, {z})"),
        LabOrder::TerrainReset => "Reset terrain heights".into(),
        LabOrder::TerrainStroke { points, .. } => {
            format!("Shape terrain at {} points", points.len())
        }
        LabOrder::Build { key, x, z, .. } => format!("Build {key} at ({x}, {z})"),
        LabOrder::Road {
            start: [x, z],
            end: [end_x, end_z],
        } => {
            format!("Plan road from ({x}, {z}) to ({end_x}, {end_z})")
        }
        LabOrder::Move { site, x, z, .. } => format!("Move project #{site} to ({x}, {z})"),
        LabOrder::Salvage { site } => format!("Salvage project #{site}"),
        LabOrder::Demolish { site } => format!("Demolish project #{site}"),
        LabOrder::MoveCraft { site, destination } => {
            format!("Move craft job from #{site} to #{destination}")
        }
        LabOrder::Produce { site, recipe } => format!("Produce {recipe} at project #{site}"),
        LabOrder::Gather { resource } => format!("Gather at resource #{resource}"),
        LabOrder::Buy { material, freight } => {
            let transport = if *freight { "freight" } else { "pickup" };
            format!("Buy {material} by {transport}")
        }
        LabOrder::Sell {
            material,
            hold_for_pickup,
        } => {
            if *hold_for_pickup {
                format!("Sell {material} on a shared trip")
            } else {
                format!("Sell {material}")
            }
        }
        LabOrder::Bed { site, bed, action } => {
            let action = match action {
                FarmAction::Prepare => "Prepare",
                FarmAction::Plant => "Plant",
                FarmAction::Harvest => "Harvest",
                FarmAction::Clear => "Clear",
                FarmAction::Amend => "Amend",
                FarmAction::Collect => "Collect residues from",
            };
            format!("{action} project #{site}, bed {bed}")
        }
        LabOrder::ConfigureBed { site, bed, .. } => format!("Configure project #{site}, bed {bed}"),
        LabOrder::AssignHome { resident, home } => match home {
            Some(home) => format!("Assign resident #{resident} to home #{home}"),
            None => format!("Clear resident #{resident}'s home assignment"),
        },
        LabOrder::Outside {
            resident, enabled, ..
        } => format!(
            "{} town work for resident {resident}",
            toggle_label(*enabled)
        ),
        LabOrder::SupplyTransport { freight } => {
            if *freight {
                "Use supplier freight for automatic supplies".into()
            } else {
                "Use resident pickup for automatic supplies".into()
            }
        }
        LabOrder::FoodPolicy { enabled, .. } => {
            format!("{} food restocking", toggle_label(*enabled))
        }
        LabOrder::SalePolicy {
            material, enabled, ..
        } => {
            format!("{} automatic sales for {material}", toggle_label(*enabled))
        }
        LabOrder::WorkPriority { group, level } => {
            format!("Set {} priority to {level}", group.label())
        }
        LabOrder::WorkerReservations {
            essentials,
            production,
        } => {
            format!("Reserve {essentials} for essentials and {production} for production")
        }
        LabOrder::InstantBuild { enabled } => {
            format!("{} instant build", toggle_label(*enabled))
        }
        LabOrder::BuildingPower { site, enabled } => {
            format!("{} power at project #{site}", toggle_label(*enabled))
        }
        LabOrder::Grid { enabled } => format!("{} grid power", toggle_label(*enabled)),
        LabOrder::InstallConnection { from, to, channel } => match channel {
            Some(channel) => {
                format!("Install water connection #{from} → #{to} · channel {channel}")
            }
            None => format!("Install power connection #{from} ↔ #{to}"),
        },
        LabOrder::SwitchConnection {
            from,
            to,
            channel,
            enabled,
        } => {
            let kind = if channel.is_some() { "water" } else { "power" };
            format!(
                "{} {kind} connection #{from} to #{to}",
                toggle_label(*enabled)
            )
        }
        LabOrder::RemoveConnection { from, to, channel } => {
            let kind = if channel.is_some() { "water" } else { "power" };
            format!("Remove {kind} connection #{from} to #{to}")
        }
        LabOrder::CollectWater { site } => format!("Collect river water for site #{site}"),
        LabOrder::CarryWater {
            source,
            site,
            channel,
        } => {
            format!(
                "Carry {} water from site #{source} to site #{site}",
                channel.label().to_lowercase()
            )
        }
        LabOrder::Purify { site } => format!("Purify water at site #{site}"),
        LabOrder::ServiceWater { site } => format!("Service wastewater at site #{site}"),
        LabOrder::WaterPolicy {
            site,
            fresh,
            enabled,
        } => {
            let policy = if *fresh {
                "drinking reserve"
            } else {
                "sanitation upkeep"
            };
            format!("{} {policy} at site #{site}", toggle_label(*enabled))
        }
    }
}

fn toggle_label(enabled: bool) -> &'static str {
    if enabled { "Enable" } else { "Disable" }
}

#[derive(Default)]
struct SpeedMeter {
    wall_seconds: f64,
    steps: u64,
    actual: Option<f64>,
}

impl SpeedMeter {
    fn observe(&mut self, elapsed: f64, steps: u64) {
        self.wall_seconds += elapsed;
        self.steps += steps;
        if self.wall_seconds >= 0.5 {
            self.actual = Some(self.steps as f64 * STEP / self.wall_seconds);
            self.wall_seconds = 0.0;
            self.steps = 0;
        }
    }
}

fn lab_save_path() -> io::Result<PathBuf> {
    Ok(crate::save::location(Mode::Story)?.with_file_name("lab-save.json"))
}

enum LabReplacement {
    Reload,
    File(PathBuf),
    SavedLab(PathBuf),
}

impl LabReplacement {
    fn load(
        &self,
        source: Option<&LabSource>,
        steps: u64,
        catalog: &Catalog,
    ) -> io::Result<(Runner, Option<Replay>)> {
        match self {
            Self::Reload => {
                let source = source.ok_or_else(|| io::Error::other("No original scenario."))?;
                Ok((source.load(catalog)?, None))
            }
            Self::File(path) | Self::SavedLab(path) => {
                if matches!(self, Self::File(_)) {
                    let bytes = crate::save::read_bytes(path, 3 * crate::save::MAX_BYTES)?;
                    let value: serde_json::Value = serde_json::from_slice(&bytes)?;
                    if value.get("scenario").is_some() {
                        let (runner, replay) = prepare_replay(value, catalog)?;
                        return Ok((runner, Some(replay)));
                    }
                }
                let village = crate::save::read(path, catalog)?;
                let runner = Runner::new(
                    Scenario {
                        steps,
                        setup: None,
                        orders: Vec::new(),
                        stop: LabStop::None,
                    },
                    Some(village),
                    catalog,
                )?;
                Ok((runner, None))
            }
        }
    }

    fn prompt(&self, source: Option<&LabSource>) -> &'static str {
        match self {
            Self::Reload if matches!(source, Some(LabSource::Story(_))) => {
                "Start a new Story lab run?"
            }
            Self::Reload => "Reload scenario?",
            Self::File(_) => "Open lab checkpoint or replay report?",
            Self::SavedLab(_) => "Load the saved lab village?",
        }
    }
}

struct StorySettings {
    world: WorldSetup,
    seed: String,
    selected: usize,
}

impl StorySettings {
    fn edit(&mut self, keys: &ButtonInput<KeyCode>, pressed: impl Fn(KeyCode) -> bool) {
        let options = WorldSetup::WORLD_OPTIONS;
        if pressed(KeyCode::ArrowDown) {
            self.selected = (self.selected + 1) % options.len();
        } else if pressed(KeyCode::ArrowUp) {
            self.selected = (self.selected + options.len() - 1) % options.len();
        }
        if pressed(KeyCode::ArrowLeft) || pressed(KeyCode::ArrowRight) {
            self.world
                .cycle_world_option(options[self.selected], pressed(KeyCode::ArrowRight));
        }
        WorldSetup::edit_seed_digits(&mut self.seed, keys);
    }

    fn prompt(&self, notice: &str) -> String {
        use std::fmt::Write as _;
        let mut text = format!(
            "New Story lab run\nSeed {}▏ · digits change seed\nUp/Down Select · Left/Right Change · Enter Start · Esc Cancel\nThis replaces the current lab run.\n",
            self.seed
        );
        for (index, action) in WorldSetup::WORLD_OPTIONS.into_iter().enumerate() {
            let marker = if self.selected == index { "> " } else { "  " };
            let _ = writeln!(text, "{marker}{}", self.world.label(action, false));
        }
        text.push_str(notice);
        text
    }
}

#[derive(Default)]
struct LabBuildSearch {
    query: String,
    selected: usize,
}

impl LabBuildSearch {
    fn matches<'a>(&self, catalog: &'a Catalog) -> Vec<(&'a String, &'a crate::catalog::Project)> {
        let query = self.query.trim().to_lowercase();
        let mut results: Vec<_> = catalog
            .build_options()
            .filter(|(_, project)| project.name.to_lowercase().contains(&query))
            .collect();
        results.sort_by(|a, b| a.1.name.cmp(&b.1.name).then_with(|| a.0.cmp(b.0)));
        results
    }

    fn prompt(&self, results: &[(&String, &crate::catalog::Project)]) -> String {
        use std::fmt::Write as _;
        const ROWS: usize = 9;
        let mut text = format!(
            "Find a building · {}▏\nType to filter · Up/Down Select · Enter Place · Esc Cancel\n",
            self.query
        );
        if results.is_empty() {
            text.push_str("\nNo matching buildings.");
        }
        let start = self.selected / ROWS * ROWS;
        for (index, (_, project)) in results.iter().enumerate().skip(start).take(ROWS) {
            let marker = if index == self.selected { "> " } else { "  " };
            let [width, depth] = project.size;
            let _ = write!(text, "\n{marker}{} · {width} × {depth}", project.name);
        }
        text
    }
}

struct Playback {
    running: bool,
    replaying: bool,
    speed: usize,
    debt: f64,
    speed_meter: SpeedMeter,
    interval: usize,
    custom_interval: Option<f64>,
    interval_entry: Option<String>,
    stop: usize,
    pause_at: Option<u64>,
    order: Option<String>,
    notice: String,
    view: LabView,
    inventory_page: usize,
    job_focus: Option<usize>,
    waiting_only: bool,
    farm_site: Option<usize>,
    clear_confirmation: Option<(usize, Option<usize>)>,
    replacement: Option<LabReplacement>,
    story_settings: Option<StorySettings>,
    trade: LabTrade,
    resident: usize,
    build_search: Option<LabBuildSearch>,
}

impl Playback {
    fn set_speed(&mut self, index: usize) {
        self.speed = index;
        self.reset_timing();
    }

    fn reset_timing(&mut self) {
        self.debt = 0.0;
        self.speed_meter = SpeedMeter::default();
    }

    fn start_interval(&mut self, start: u64, limit: u64, seconds: f64, label: &str) {
        let steps = (seconds / STEP).ceil() as u64;
        self.pause_at = Some(start.saturating_add(steps).min(limit));
        self.running = self.pause_at.is_some_and(|target| target > start);
        self.reset_timing();
        self.notice = format!(
            "Scheduled {label} through step {}",
            self.pause_at.unwrap_or(start)
        );
    }

    fn cycle_stop(&mut self) {
        self.stop = (self.stop + 1) % PLAYBACK_STOPS.len();
    }

    fn pause_on_condition(&mut self, runner: &Runner) -> bool {
        if self.stop == 0 || self.replaying || runner.done() {
            return false;
        }
        let condition = PLAYBACK_STOPS[self.stop].0;
        let Some(reason) = runner
            .village
            .construction
            .lab_stop_reason(condition, runner.village.clock)
        else {
            return false;
        };
        self.running = false;
        self.pause_at = None;
        self.reset_timing();
        self.notice = format!("Paused at step {} · {reason}", runner.index);
        true
    }

    fn advance_frame(&mut self, runner: &mut Runner, catalog: &Catalog, limit: u64, elapsed: f64) {
        if self.pause_on_condition(runner) {
            return;
        }
        let speed = f64::from(SPEEDS[self.speed].1);
        self.debt = (self.debt + elapsed.min(0.25) * speed).min(speed * 2.0);
        let before = runner.index;
        let endpoint = self.pause_at.unwrap_or(limit).min(limit);
        let start = std::time::Instant::now();
        while self.debt >= STEP
            && runner.index < endpoint
            && !runner.done()
            && start.elapsed().as_millis() < 8
        {
            runner.advance(catalog);
            self.debt -= STEP;
            if self.pause_on_condition(runner) {
                return;
            }
        }
        self.speed_meter.observe(elapsed, runner.index - before);
        if self.pause_at.is_some_and(|target| runner.index >= target) && !runner.done() {
            self.pause_at = None;
            self.running = false;
            self.reset_timing();
            self.notice = format!("Interval complete at step {}.", runner.index);
        }
    }

    fn set_custom_interval(&mut self, entry: &str) -> Result<(), &'static str> {
        let days = entry
            .trim()
            .parse::<f64>()
            .ok()
            .filter(|&days| days > 0.0 && days <= 365.0)
            .ok_or("Choose a duration greater than zero and at most 365 days.")?;
        self.custom_interval = Some(days);
        Ok(())
    }

    fn interval(&self) -> (f64, String) {
        self.custom_interval.map_or_else(
            || {
                let (days, label) = RUN_INTERVALS[self.interval];
                (days, label.into())
            },
            |days| (days, format!("{days} days")),
        )
    }

    fn interval_controls(&self) -> String {
        if self.replaying {
            return String::new();
        }
        format!(
            "F2 Interval {} · Shift+F2 Custom · F3 Run interval · Shift+J Advance 1h\nF4 Extra stop · {}\n",
            self.interval().1,
            PLAYBACK_STOPS[self.stop].1
        )
    }

    fn speed_label(&self) -> String {
        let target = SPEEDS[self.speed].1;
        let measured = self.speed_meter.actual.filter(|_| self.running);
        match measured {
            Some(actual) => {
                let limited = if self.debt > 1.0 && actual < f64::from(target) {
                    " · CPU limited"
                } else {
                    ""
                };
                format!("Actual {actual:.1}× / target {target}×{limited}")
            }
            None => format!("Target {target}×"),
        }
    }
}

impl Default for Playback {
    fn default() -> Self {
        Self {
            running: false,
            replaying: false,
            speed: 5,
            debt: 0.0,
            speed_meter: SpeedMeter::default(),
            interval: 3,
            custom_interval: None,
            interval_entry: None,
            stop: 0,
            pause_at: None,
            order: None,
            notice: String::new(),
            view: LabView::default(),
            inventory_page: 0,
            job_focus: None,
            waiting_only: false,
            farm_site: None,
            clear_confirmation: None,
            replacement: None,
            story_settings: None,
            trade: LabTrade::default(),
            resident: 0,
            build_search: None,
        }
    }
}

fn lab_bed_page(
    runner: &mut Runner,
    catalog: &Catalog,
    keys: &ButtonInput<KeyCode>,
    playback: &mut Playback,
) -> String {
    use crate::farming::FarmAction;

    let construction = &runner.village.construction;
    let plots = &construction.farming.plots;
    let Some((&first, _)) = plots.first_key_value() else {
        playback.farm_site = None;
        return "Cultivation\nTab Switch view\n\nNo cultivated plots.".into();
    };
    let current = playback
        .farm_site
        .filter(|site| plots.contains_key(site))
        .unwrap_or(first);
    let site = if keys.just_pressed(KeyCode::BracketRight) {
        plots
            .keys()
            .copied()
            .find(|&site| site > current)
            .unwrap_or(first)
    } else if keys.just_pressed(KeyCode::BracketLeft) {
        plots
            .keys()
            .rev()
            .copied()
            .find(|&site| site < current)
            .unwrap_or_else(|| *plots.last_key_value().expect("at least one plot").0)
    } else {
        current
    };
    if playback.farm_site != Some(site) {
        playback.farm_site = Some(site);
        playback.inventory_page = 0;
    }
    let index = playback
        .inventory_page
        .min(plots[&site].beds.len().saturating_sub(1));
    playback.inventory_page = index;
    let all_beds = keys.any_pressed([KeyCode::ControlLeft, KeyCode::ControlRight]);
    let mut orders = Vec::new();
    if !runner.done()
        && !playback.replaying
        && let Some(bed) = plots[&site].beds.get(index)
    {
        let beds = if all_beds {
            1..=plots[&site].beds.len()
        } else {
            index + 1..=index + 1
        };
        let site = site + 1;
        if keys.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]) {
            if let Some((_, action)) = [
                (KeyCode::Digit1, FarmAction::Prepare),
                (KeyCode::Digit2, FarmAction::Plant),
                (KeyCode::Digit3, FarmAction::Harvest),
                (KeyCode::Digit4, FarmAction::Clear),
                (KeyCode::Digit5, FarmAction::Amend),
                (KeyCode::Digit6, FarmAction::Collect),
            ]
            .into_iter()
            .find(|(key, _)| keys.just_pressed(*key))
            {
                orders.extend(beds.map(|bed| LabOrder::Bed { site, bed, action }));
            }
        } else {
            let crop = keys.just_pressed(KeyCode::KeyX).then(|| bed.crop.next());
            let density = keys.just_pressed(KeyCode::KeyY).then(|| bed.next_density());
            let irrigation = keys.just_pressed(KeyCode::KeyT).then_some(!bed.irrigation);
            let collect_residues = keys
                .just_pressed(KeyCode::KeyZ)
                .then_some(!bed.collect_residues);
            if crop.is_some()
                || density.is_some()
                || irrigation.is_some()
                || collect_residues.is_some()
            {
                orders.extend(beds.map(|bed| LabOrder::ConfigureBed {
                    site,
                    bed,
                    crop,
                    density,
                    irrigation,
                    collect_residues,
                }));
            }
        }
    }
    let clear_target = (site, (!all_beds).then_some(index));
    let clearing = matches!(
        orders.first(),
        Some(LabOrder::Bed {
            action: FarmAction::Clear,
            ..
        })
    );
    if clearing && playback.clear_confirmation != Some(clear_target) {
        playback.clear_confirmation = Some(clear_target);
        orders.clear();
    } else if clearing
        || !orders.is_empty()
        || playback
            .clear_confirmation
            .is_some_and(|(plot, bed)| plot != site || bed.is_some_and(|bed| bed != index))
        || keys.just_pressed(KeyCode::Escape)
    {
        playback.clear_confirmation = None;
    }
    if !orders.is_empty() {
        let count = orders.len();
        let start = runner.outcomes.len();
        playback.notice = match runner.submit_orders(catalog, orders) {
            Ok(()) => {
                let outcomes = &runner.outcomes[start..];
                let first_error = outcomes.iter().find_map(|outcome| outcome.error.as_deref());
                if count == 1 {
                    first_error.unwrap_or("Bed order accepted.").into()
                } else {
                    let accepted = outcomes
                        .iter()
                        .filter(|outcome| outcome.error.is_none())
                        .count();
                    let mut notice = format!("{accepted} of {count} bed orders accepted.");
                    if let Some(error) = first_error {
                        notice.push(' ');
                        notice.push_str(error);
                    }
                    notice
                }
            }
            Err(error) => error.into(),
        };
    }
    let construction = &runner.village.construction;
    let name = construction
        .lab_job_site_name(catalog, site)
        .unwrap_or("Cultivation");
    let mut details = construction
        .bed_status(site, index, runner.village.clock, true)
        .unwrap_or_else(|| "No beds.".into());
    if let Some(outcome) = runner.latest_bed_outcome(site + 1, index + 1) {
        use std::fmt::Write as _;
        let result = outcome.error.as_deref().unwrap_or("Accepted");
        let _ = write!(
            details,
            "\nLast bed order · Step {} · {result}",
            outcome.step
        );
    }
    if let Some((_, bed)) = playback.clear_confirmation.filter(|_| !runner.done()) {
        let instruction = if bed.is_some() {
            "Press Shift+4 again to clear the selected bed. Only residues remain. Esc cancels."
        } else {
            "Press Ctrl+Shift+4 again to clear every bed in this plot. Only residues remain. Esc cancels."
        };
        details.push('\n');
        details.push_str(instruction);
    }
    let controls = if runner.done() || playback.replaying {
        ""
    } else {
        "\nShift+1 Prepare · +2 Plant · +3 Harvest · +4 Clear · +5 Amend · +6 Collect\nX Crop · Y Density · T Irrigation · Z Residues\nHold Ctrl to apply an order to every bed in the plot"
    };
    format!(
        "Cultivation · {name} #{}\nTab Switch view · [ / ] Plot · Page Up/Down Bed{controls}\n\n{details}",
        site + 1
    )
}

type LabControlPresses<'w, 's> =
    Query<'w, 's, (&'static Interaction, &'static LabControl), Changed<Interaction>>;

type LabToolbarNodes<'w, 's> = Query<'w, 's, (&'static LabToolbar, &'static mut Node)>;

fn choose_lab_export(file_name: &str) -> Option<PathBuf> {
    rfd::FileDialog::new()
        .set_title("Export Balance Lab file")
        .set_file_name(file_name)
        .add_filter("Lab JSON", &["json"])
        .save_file()
}

fn update_lab_window(
    mut runner: ResMut<Runner>,
    catalog: Res<Catalog>,
    (mut commands, time, _main_thread): (
        Commands,
        Res<Time<bevy::time::Real>>,
        bevy::ecs::system::NonSendMarker,
    ),
    (keys, mut events, mut files): (
        Res<ButtonInput<KeyCode>>,
        MessageReader<bevy::input::keyboard::KeyboardInput>,
        MessageReader<bevy::window::FileDragAndDrop>,
    ),
    mut playback: Local<Playback>,
    (mut panel, controls, mut toolbars): (
        Single<&mut Text, Without<LabControlLabel>>,
        LabControlPresses,
        LabToolbarNodes,
    ),
    (mut replay, mut map, source): (
        Option<ResMut<Replay>>,
        ResMut<map::MapState>,
        Option<Res<LabSource>>,
    ),
) {
    let clicked = |action| {
        controls.iter().any(|(interaction, control)| {
            *interaction == Interaction::Pressed && *control == action
        })
    };
    let pressed = |key| keys.just_pressed(key) || clicked(LabControl::Shortcut(key));
    let active_toolbar = if playback.story_settings.is_some() {
        LabToolbar::StorySettings
    } else if playback.interval_entry.is_some() || playback.replacement.is_some() {
        LabToolbar::Prompt
    } else if playback.view == LabView::Jobs {
        LabToolbar::Jobs
    } else {
        LabToolbar::Main
    };
    let prompt = matches!(
        active_toolbar,
        LabToolbar::Prompt | LabToolbar::StorySettings
    );
    for (toolbar, mut node) in &mut toolbars {
        let display = if *toolbar == active_toolbar {
            Display::Flex
        } else {
            Display::None
        };
        if node.display != display {
            node.display = display;
        }
    }
    let cancel = keys.just_pressed(KeyCode::Escape) || (prompt && clicked(LabControl::Cancel));
    let confirm = keys.any_just_pressed([KeyCode::Enter, KeyCode::NumpadEnter])
        || (prompt && clicked(LabControl::Confirm));
    playback.replaying = replay.is_some();
    let dropped = files
        .read()
        .filter_map(|event| match event {
            bevy::window::FileDragAndDrop::DroppedFile { path_buf, .. } => Some(path_buf),
            _ => None,
        })
        .last();
    let shift = keys.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]);
    if !playback.replaying
        && playback.order.is_none()
        && playback.build_search.is_none()
        && playback.story_settings.is_none()
        && playback.replacement.is_none()
        && (clicked(LabControl::SetInterval) || (shift && keys.just_pressed(KeyCode::F2)))
    {
        playback.running = false;
        playback.pause_at = None;
        playback.reset_timing();
        playback.notice.clear();
        playback.interval_entry = Some(String::new());
        events.clear();
    }
    if let Some(mut entry) = playback.interval_entry.take() {
        map.visible = false;
        if cancel {
            events.clear();
            return;
        }
        if confirm {
            events.clear();
            match playback.set_custom_interval(&entry) {
                Ok(()) => {
                    playback.notice = format!("Interval set to {}.", playback.interval().1);
                    panel.set_if_neq(Text::new(playback.notice.clone()));
                    return;
                }
                Err(error) => playback.notice = error.into(),
            }
        } else {
            crate::construction::read_search_text(&mut entry, &mut events);
        }
        panel.set_if_neq(Text::new(format!(
            "Custom run interval\nDays · {entry}▏\nEnter Set duration · Esc Cancel\n{}",
            playback.notice
        )));
        playback.interval_entry = Some(entry);
        return;
    }
    if let Some(LabSource::Story(setup)) = source.as_deref()
        && playback.order.is_none()
        && playback.build_search.is_none()
        && playback.replacement.is_none()
    {
        if pressed(KeyCode::F7) {
            playback.running = false;
            playback.reset_timing();
            playback.notice.clear();
            playback.story_settings = Some(StorySettings {
                world: setup.clone(),
                seed: setup.seed().to_string(),
                selected: 0,
            });
        }
        if let Some(mut settings) = playback.story_settings.take() {
            map.visible = false;
            events.clear();
            if cancel {
                return;
            }
            if confirm {
                if let Ok(number) = settings.seed.parse::<std::num::NonZeroU32>() {
                    let next = LabSource::Story(settings.world.clone().with_seed(number));
                    match next.load(&catalog) {
                        Ok(opened) => {
                            *runner = opened;
                            *playback = Playback::default();
                            *map = map::MapState::default();
                            commands.insert_resource(next);
                            commands.remove_resource::<Replay>();
                            playback.notice = format!("Story lab started with seed {number}.");
                            panel.set_if_neq(Text::new(playback.notice.clone()));
                            return;
                        }
                        Err(load_error) => playback.notice = load_error.to_string(),
                    }
                } else {
                    playback.notice = "Enter a seed between 1 and 4294967295.".into();
                }
            } else {
                settings.edit(&keys, pressed);
            }
            panel.set_if_neq(Text::new(settings.prompt(&playback.notice)));
            playback.story_settings = Some(settings);
            return;
        }
    }
    if playback.order.is_none() && playback.build_search.is_none() {
        let file = dropped.cloned().or_else(|| {
            if playback.replacement.is_none() && clicked(LabControl::OpenFile) {
                rfd::FileDialog::new()
                    .set_title("Open Balance Lab checkpoint or replay")
                    .add_filter("Lab JSON", &["json"])
                    .pick_file()
            } else {
                None
            }
        });
        let replacement = if let Some(path) = file {
            Some(LabReplacement::File(path))
        } else if cancel {
            playback.replacement = None;
            None
        } else if pressed(KeyCode::F9) {
            match lab_save_path() {
                Ok(path) if path.is_file() => Some(LabReplacement::SavedLab(path)),
                Ok(_) => {
                    playback.notice = "No lab save yet.".into();
                    None
                }
                Err(error) => {
                    playback.notice = format!("Could not locate lab save · {error}");
                    None
                }
            }
        } else if keys.just_pressed(KeyCode::F8)
            || (playback.replacement.is_some() && clicked(LabControl::Confirm))
        {
            if let Some(candidate) = playback.replacement.take() {
                match candidate.load(source.as_deref(), runner.scenario.steps, &catalog) {
                    Ok((opened, imported_replay)) => {
                        *runner = opened;
                        *playback = Playback::default();
                        *map = map::MapState::default();
                        playback.notice = if let Some(imported_replay) = imported_replay {
                            commands.insert_resource(imported_replay);
                            "Replay loaded at step 0."
                        } else {
                            commands.remove_resource::<Replay>();
                            match candidate {
                                LabReplacement::Reload => "Scenario reloaded at step 0.",
                                LabReplacement::File(_) => "Checkpoint imported at step 0.",
                                LabReplacement::SavedLab(_) => "Lab save loaded at step 0.",
                            }
                        }
                        .into();
                        panel.set_if_neq(Text::new(playback.notice.clone()));
                        return;
                    }
                    Err(error) => playback.notice = format!("Could not open lab run · {error}"),
                }
                None
            } else {
                source.is_some().then_some(LabReplacement::Reload)
            }
        } else {
            None
        };
        if let Some(replacement) = replacement {
            playback.running = false;
            playback.reset_timing();
            playback.replacement = Some(replacement);
        }
        if let Some(replacement) = &playback.replacement {
            map.visible = false;
            events.clear();
            panel.set_if_neq(Text::new(format!(
                "{}\nF8 Confirm · Esc Cancel\nThis replaces the current lab run and its unsaved orders.",
                replacement.prompt(source.as_deref())
            )));
            return;
        }
    }
    let limit = replay
        .as_ref()
        .map_or(runner.scenario.steps, |replay| replay.limit);
    let reached_end = |runner: &Runner| runner.index >= limit || runner.done();
    if clicked(LabControl::FocusCamp) && playback.order.is_none() && playback.build_search.is_none()
    {
        playback.view = LabView::Map;
        playback.clear_confirmation = None;
        map.focus_camp(runner.camp);
    }
    if playback.order.is_none()
        && !playback.replaying
        && !reached_end(&runner)
        && (clicked(LabControl::FindBuilding)
            || (playback.view == LabView::Map && keys.just_pressed(KeyCode::Slash)))
        && playback.build_search.is_none()
    {
        playback.view = LabView::Map;
        playback.running = false;
        playback.reset_timing();
        playback.build_search = Some(LabBuildSearch::default());
        events.clear();
    }
    if let Some(mut search) = playback.build_search.take() {
        map.visible = false;
        if keys.just_pressed(KeyCode::Escape) {
            events.clear();
            return;
        }
        let typing = !keys.any_just_pressed([
            KeyCode::ArrowUp,
            KeyCode::ArrowDown,
            KeyCode::Enter,
            KeyCode::NumpadEnter,
        ]);
        if typing {
            let previous = search.query.clone();
            crate::construction::read_search_text(&mut search.query, &mut events);
            if previous != search.query {
                search.selected = 0;
            }
        } else {
            events.clear();
        }
        let results = search.matches(&catalog);
        if keys.just_pressed(KeyCode::ArrowDown) {
            search.selected = (search.selected + 1).min(results.len().saturating_sub(1));
        } else if keys.just_pressed(KeyCode::ArrowUp) {
            search.selected = search.selected.saturating_sub(1);
        } else if keys.any_just_pressed([KeyCode::Enter, KeyCode::NumpadEnter])
            && let Some((key, _)) = results.get(search.selected)
        {
            map.cancel_build();
            map.blueprint = Some(((*key).clone(), 0));
            panel.set_if_neq(Text::new(
                "Blueprint selected · Click a map cell to place it.",
            ));
            return;
        }
        panel.set_if_neq(Text::new(search.prompt(&results)));
        playback.build_search = Some(search);
        return;
    }
    if let Some(mut order) = playback.order.take() {
        if keys.just_pressed(KeyCode::Escape) {
            events.clear();
        } else if keys.just_pressed(KeyCode::Enter) {
            events.clear();
            let result = serde_json::from_str(&order)
                .map_err(|error| error.to_string())
                .and_then(|order| runner.submit(&catalog, order).map_err(str::to_owned));
            match result {
                Ok(()) => playback.notice.clear(),
                Err(error) => {
                    playback.notice = error;
                    playback.order = Some(order);
                }
            }
        } else {
            for event in events.read() {
                if event.state != bevy::input::ButtonState::Pressed {
                    continue;
                }
                if event.key_code == KeyCode::Backspace {
                    order.pop();
                } else if let Some(chars) = &event.text {
                    let room = 1024usize.saturating_sub(order.chars().count());
                    order.extend(chars.chars().filter(|c| !c.is_control()).take(room));
                }
            }
            playback.order = Some(order);
        }
    } else {
        events.clear();
        if keys.just_pressed(KeyCode::KeyO) && !reached_end(&runner) && !playback.replaying {
            playback.running = false;
            playback.reset_timing();
            playback.notice.clear();
            playback.clear_confirmation = None;
            playback.order = Some(String::new());
        }
        let save_checkpoint = if clicked(LabControl::ExportCheckpoint) {
            choose_lab_export("solar-friends-lab-checkpoint.json").map(Ok)
        } else if keys.just_pressed(KeyCode::F6) && shift {
            Some(runner.output_path("checkpoint"))
        } else if pressed(KeyCode::F6) {
            Some(lab_save_path())
        } else {
            None
        };
        if let Some(path) = save_checkpoint {
            playback.notice = match path.and_then(|path| {
                runner.checkpoint(&path)?;
                Ok(path)
            }) {
                Ok(path) => format!("Lab village saved to {}", path.display()),
                Err(error) => format!("Could not save lab village · {error}"),
            };
        }
        let save_report = if clicked(LabControl::ExportReport) {
            choose_lab_export("solar-friends-balance-evidence.json").map(Ok)
        } else if keys.just_pressed(KeyCode::F5) {
            Some(runner.output_path("report"))
        } else {
            None
        };
        if let Some(path) = save_report {
            playback.notice = match path.and_then(|path| {
                runner.export(&path)?;
                Ok(path)
            }) {
                Ok(path) => format!("Report saved to {}", path.display()),
                Err(error) => format!("Could not export report · {error}"),
            };
        }
    }
    if let Some(order) = &playback.order {
        map.visible = false;
        panel.set_if_neq(Text::new(format!(
            "Order at step {}\nEnter Submit · Esc Cancel\n\nExample {{\"type\":\"grid\",\"enabled\":false}}\n\n{order}▏\n{}",
            runner.index, playback.notice
        )));
        return;
    }
    let selected_view = controls
        .iter()
        .filter(|(interaction, _)| **interaction == Interaction::Pressed)
        .find_map(|(_, control)| match control {
            LabControl::View(view) => Some(*view),
            LabControl::Inventory => Some(if playback.view == LabView::Stocked {
                LabView::AllItems
            } else {
                LabView::Stocked
            }),
            _ => None,
        });
    if let Some(view) =
        selected_view.or_else(|| pressed(KeyCode::Tab).then(|| playback.view.next()))
    {
        playback.view = view;
        playback.inventory_page = 0;
        playback.clear_confirmation = None;
    }
    if playback.view == LabView::Map
        && keys.just_pressed(KeyCode::Enter)
        && let Some(project) = map.selected
    {
        playback.view = LabView::Jobs;
        playback.job_focus = Some(project);
        playback.inventory_page = 0;
    }
    map.visible = playback.view == LabView::Map;
    if !map.visible || playback.replaying || reached_end(&runner) {
        map.cancel_build();
    } else if let Some(order) = map.build_order(&catalog, &keys) {
        playback.notice = match runner.submit(&catalog, order) {
            Ok(()) => runner
                .outcomes
                .last()
                .and_then(|outcome| outcome.error.clone())
                .unwrap_or_else(|| "Blueprint placed.".into()),
            Err(error) => error.into(),
        };
    }
    if playback.view == LabView::Map && keys.any_just_pressed([KeyCode::PageDown, KeyCode::PageUp])
    {
        map.browse_sites(&runner, &catalog, keys.just_pressed(KeyCode::PageDown));
    } else if pressed(KeyCode::PageDown) {
        playback.inventory_page = playback.inventory_page.saturating_add(1);
    } else if pressed(KeyCode::PageUp) {
        playback.inventory_page = playback.inventory_page.saturating_sub(1);
    }
    for (index, (key, _)) in SPEEDS.into_iter().enumerate() {
        if keys.just_pressed(key)
            && !(playback.view == LabView::Beds
                && keys.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]))
        {
            playback.set_speed(index);
        }
    }
    if clicked(LabControl::CycleSpeed) {
        let speed = (playback.speed + 1) % SPEEDS.len();
        playback.set_speed(speed);
    }
    if pressed(KeyCode::Space) && !reached_end(&runner) {
        playback.running = !playback.running;
        playback.reset_timing();
    }
    if !playback.replaying && pressed(KeyCode::F4) {
        playback.cycle_stop();
    }
    if !playback.replaying
        && keys.just_pressed(KeyCode::F2)
        && playback.custom_interval.take().is_none()
    {
        playback.interval = (playback.interval + 1) % RUN_INTERVALS.len();
    }
    if !playback.replaying && !reached_end(&runner) {
        if pressed(KeyCode::F3) {
            let (days, label) = playback.interval();
            playback.start_interval(runner.index, limit, days * crate::weather::DAY, &label);
        } else if clicked(LabControl::AdvanceHour) || (keys.just_pressed(KeyCode::KeyJ) && shift) {
            playback.start_interval(runner.index, limit, crate::weather::HOUR, "one hour");
        }
    }
    if pressed(KeyCode::KeyJ) && !playback.running && !reached_end(&runner) {
        runner.advance(&catalog);
    }
    if playback.running {
        playback.advance_frame(&mut runner, &catalog, limit, time.delta_secs_f64());
    }
    if reached_end(&runner) {
        playback.running = false;
        playback.pause_at = None;
        if let Some(replay) = replay.as_deref_mut()
            && let Some(expected) = replay.expected.take()
        {
            playback.notice = match compare_replay(&runner, expected, replay.version) {
                Ok(()) => format!("Replay matched through step {}.", runner.index),
                Err(error) => error.to_string(),
            };
        }
    }
    if playback.view == LabView::Map
        && !playback.replaying
        && !runner.done()
        && let Some((order, success)) = map.service_order(&runner, &catalog, &keys)
    {
        playback.notice = match runner.submit(&catalog, order) {
            Ok(()) => runner
                .outcomes
                .last()
                .and_then(|outcome| outcome.error.clone())
                .unwrap_or_else(|| success.into()),
            Err(error) => error.into(),
        };
    }
    let village = &runner.village;
    let status = if playback.replaying {
        if reached_end(&runner) {
            "Replay ended"
        } else if playback.running {
            "Replaying"
        } else {
            "Replay paused"
        }
    } else {
        runner.reason.unwrap_or(if runner.done() {
            "Scenario complete"
        } else if playback.running {
            "Running"
        } else {
            "Paused"
        })
    };
    let order_control = if playback.replaying {
        ""
    } else {
        "O Enter order · "
    };
    let last = runner.outcomes.last().map_or_else(
        || "No scheduled orders processed".into(),
        |order| {
            format!(
                "Last order at step {} · {}",
                order.step,
                order.error.as_deref().unwrap_or("Accepted")
            )
        },
    );
    let interval_controls = playback.interval_controls();
    if playback.view != LabView::Overview {
        let playback = &mut *playback;
        let details = if playback.view == LabView::Jobs {
            let construction = &village.construction;
            if pressed(KeyCode::KeyW) {
                playback.waiting_only = !playback.waiting_only;
                playback.inventory_page = 0;
            }
            if playback
                .job_focus
                .is_some_and(|index| construction.lab_job_site_name(&catalog, index).is_none())
            {
                playback.job_focus = None;
                playback.inventory_page = 0;
            }
            let forward = pressed(KeyCode::BracketRight);
            if forward || pressed(KeyCode::BracketLeft) {
                let mut sites = construction.lab_job_sites();
                playback.job_focus = if forward {
                    sites.find(|&index| playback.job_focus.is_none_or(|focus| index > focus))
                } else {
                    sites
                        .filter(|&index| playback.job_focus.is_none_or(|focus| index < focus))
                        .last()
                };
                playback.inventory_page = 0;
            }
            let focus = playback
                .job_focus
                .and_then(|index| {
                    construction
                        .lab_job_site_name(&catalog, index)
                        .map(|name| format!("{name} #{}", index + 1))
                })
                .unwrap_or_else(|| "All projects".into());
            let jobs = construction.lab_jobs(
                &catalog,
                &village.stock,
                &runner.land,
                village.clock,
                playback.job_focus,
                playback.waiting_only,
            );
            lab_job_page(
                &jobs,
                &mut playback.inventory_page,
                &focus,
                playback.waiting_only,
            )
        } else if playback.view == LabView::Beds {
            lab_bed_page(&mut runner, &catalog, &keys, playback)
        } else if playback.view == LabView::Orders {
            lab_order_page(&runner, &mut playback.inventory_page)
        } else if playback.view == LabView::Trade {
            let (text, notice) =
                playback
                    .trade
                    .view(&mut runner, &catalog, &keys, playback.replaying);
            if let Some(notice) = notice {
                playback.notice = notice;
            }
            text
        } else if playback.view == LabView::Residents {
            lab_resident_view(&mut runner, &catalog, &keys, playback)
        } else if playback.view == LabView::Trends {
            lab_trends(&runner.trends, &catalog, runner.outcomes.len())
        } else if playback.view == LabView::Events {
            let (pages, text) = village
                .construction
                .event_log(playback.inventory_page, "Tab Switch view");
            playback.inventory_page = playback.inventory_page.min(pages - 1);
            text
        } else if playback.view == LabView::Map {
            let selection = map
                .selected
                .and_then(|project| {
                    village
                        .construction
                        .lab_map_project_status(&catalog, project, runner.camp)
                })
                .or_else(|| {
                    map.resource
                        .and_then(|site| map::resource_status(&runner, &catalog, site))
                })
                .unwrap_or_else(|| {
                    "Camp stores · Click a project or resource to inspect it".into()
                });
            let gather = if map.resource.is_some()
                && !playback.replaying
                && !runner.done()
                && map.blueprint.is_none()
            {
                " · G Queue gathering"
            } else {
                ""
            };
            let build = if let Some((key, rotation)) = &map.blueprint {
                let field = if key == "field" {
                    let size = map.field_size();
                    format!(
                        "\n{} × {} cells before rotation · Arrow keys Resize",
                        size.x, size.y
                    )
                } else {
                    String::new()
                };
                format!(
                    "\nPlace {} · {}° · [ / ] Blueprint · R Rotate · Esc Cancel{field}{}",
                    catalog.projects[key].name,
                    u16::from(*rotation) * 90,
                    map.preview_error
                        .map_or_else(String::new, |error| format!("\n{error}"))
                )
            } else if !playback.replaying && !runner.done() {
                " · B Build · / Find building".into()
            } else {
                String::new()
            };
            let editable = !playback.replaying && !runner.done();
            let water = map.water_details(&runner, editable);
            let project = map.project_details(&runner, &catalog, editable);
            format!(
                "Village map · {selection}\nTab Switch view · Drag Pan · Scroll Zoom · Home Camp · Page Up/Down Browse sites · Enter Inspect jobs{gather}{build}\nBlue Camp · Cream Residents · Green Completed · Gold Construction · Purple Resources{project}{water}"
            )
        } else {
            lab_inventory(
                &catalog,
                &village.stock,
                &playback.view,
                &mut playback.inventory_page,
            )
        };
        panel.set_if_neq(Text::new(format!(
            "Simulation lab · {status} · Step {} / {} · {}\nSpace Run/Pause · J Single step · 1–9 Speed · {order_control}F5 Report · F6 Save lab · F9 Load lab\n{interval_controls}{}\n\n{details}",
            runner.index, limit, playback.speed_label(), playback.notice,
        )));
        return;
    }
    let minutes = crate::weather::game_minutes(village.clock);
    let day = minutes / 1440 + 1;
    let hour = minutes / 60 % 24;
    let minute = minutes % 60;
    let environment = lab_environment(village, &runner.setup);
    let reload_control = if matches!(source.as_deref(), Some(LabSource::Story(_))) {
        " · F7 Story settings · F8 Restart"
    } else if source.is_some() {
        " · F8 Reload"
    } else {
        ""
    };
    let spoiled = village
        .stock
        .pantry
        .spoiled
        .values()
        .copied()
        .fold(0, u64::saturating_add);
    let text = format!(
        "Simulation lab · {status}\nDay {day} · {hour:02}:{minute:02} · Step {} / {} · {}\nSpace Run/Pause · J Single step · 1–9 Speed\n{order_control}F5 Report · F6 Save lab · F9 Load lab{reload_control} · Tab Browse lab views\nShift+F6 Export checkpoint · Drop checkpoint or replay report to open\n{interval_controls}{}\n\nR${:.2} · {} timber · {} meals · {:.1} L drinking water · {spoiled} units spoiled\n{environment}\n{last}\n\n{}",
        runner.index,
        limit,
        playback.speed_label(),
        playback.notice,
        village.stock.balance() as f64 / 100.0,
        village.stock.available("wood"),
        village.stock.available("meals"),
        village.construction.utilities.stored_drinking_water(),
        village
            .construction
            .resident_status(&catalog, &village.stock, 0)
    );
    panel.set_if_neq(Text::new(text));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lab_environment_reads_watershed_and_net_finance_totals() {
        use crate::stock::CashKind;
        let catalog = Catalog::default();
        let scenario = serde_json::from_str(r#"{"steps":2}"#).unwrap();
        let mut runner = Runner::new(scenario, None, &catalog).unwrap();
        runner.advance(&catalog);
        let stock = &mut runner.village.stock;
        stock.credit(1250, CashKind::Sales);
        stock.debit(550, CashKind::Construction);
        stock.credit(50, CashKind::Construction);
        stock.debit(100, CashKind::Electricity);
        let text = lab_environment(&runner.village, &runner.setup);
        assert!(text.contains("Aquifer"));
        assert!(text.contains("Flow"));
        assert!(text.contains("Income R$12.50 · Net expenses R$6.00 · Grid R$1.00"));
    }

    #[test]
    fn lab_build_search_matches_display_names_case_insensitively() {
        let catalog = Catalog::default();
        let search = LabBuildSearch {
            query: " GaThErInG ".into(),
            selected: 0,
        };
        let results = search.matches(&catalog);
        assert!(results.iter().any(|(key, _)| key.as_str() == "gathering"));
        assert!(
            results
                .iter()
                .all(|(_, project)| project.name.to_lowercase().contains("gathering"))
        );
        assert!(search.prompt(&results).contains("Enter Place"));
    }

    #[test]
    fn lab_residents_book_work_for_the_selected_resident_only() {
        let catalog = Catalog::default();
        let scenario = serde_json::from_str(r#"{"steps":2}"#).unwrap();
        let mut runner = Runner::new(scenario, None, &catalog).unwrap();
        let mut playback = Playback::default();
        let mut keys = ButtonInput::default();
        keys.press(KeyCode::BracketRight);
        keys.press(KeyCode::KeyY);
        let view = lab_resident_view(&mut runner, &catalog, &keys, &mut playback);
        assert!(view.contains("> Bento"));
        assert!(view.contains("Lowest need"));
        assert!(runner.village.construction.lab_town_work(1).repeating);
        assert!(!runner.village.construction.lab_town_work(0).repeating);
        playback.replaying = true;
        lab_resident_view(&mut runner, &catalog, &keys, &mut playback);
        assert_eq!(runner.scenario.orders.len(), 1);
    }

    #[test]
    fn lab_trade_quotes_use_the_same_batch_and_fuel_as_the_order() {
        let catalog = Catalog::default();
        let scenario = serde_json::from_str(r#"{"steps":2}"#).unwrap();
        let mut runner = Runner::new(scenario, None, &catalog).unwrap();
        let fuel = crate::market::fare_cents(runner.setup.round_trip_km()) as f64 / 100.0;
        let quote = lab_sale_quote(&runner, &catalog, "wood", true);
        assert!(quote.contains(&format!("Dedicated fuel R${fuel:.2}")));
        assert!(quote.contains("Waiting for a shared pickup"));
        runner
            .submit(
                &catalog,
                LabOrder::Sell {
                    material: "wood".into(),
                    hold_for_pickup: true,
                },
            )
            .unwrap();
        assert!(runner.outcomes.last().unwrap().error.is_none());
        let order = runner.village.construction.trade.orders.back().unwrap();
        let item = &catalog.materials["wood"];
        assert!(quote.contains(&format!(
            "Sell {}",
            item.quantity_text(order.quantity.into())
        )));
        assert_eq!(order.fare, 0);
    }

    #[test]
    fn lab_trade_records_a_held_sale_and_replay_cannot_submit() {
        let catalog = Catalog::default();
        let scenario = serde_json::from_str(r#"{"steps":2}"#).unwrap();
        let mut runner = Runner::new(scenario, None, &catalog).unwrap();
        let mut trade = LabTrade::default();
        let mut keys = ButtonInput::default();
        keys.press(KeyCode::KeyH);
        keys.press(KeyCode::KeyS);
        trade.view(&mut runner, &catalog, &keys, true);
        assert!(runner.scenario.orders.is_empty());
        trade.view(&mut runner, &catalog, &keys, false);
        assert!(matches!(
            runner.scenario.orders[0].order,
            LabOrder::Sell {
                hold_for_pickup: true,
                ..
            }
        ));
    }

    #[test]
    fn story_settings_change_land_and_capital_for_the_next_run() {
        let mut settings = StorySettings {
            world: WorldSetup::default(),
            seed: "42".into(),
            selected: 0,
        };
        let keys = ButtonInput::default();
        settings.edit(&keys, |key| key == KeyCode::ArrowRight);
        assert_eq!(settings.world.biome(), 1);
        for _ in 0..4 {
            settings.edit(&keys, |key| key == KeyCode::ArrowDown);
        }
        settings.edit(&keys, |key| key == KeyCode::ArrowLeft);
        let runner = LabSource::Story(settings.world)
            .load(&Catalog::default())
            .unwrap();
        assert_eq!(runner.setup.biome(), 1);
        assert_eq!(runner.village.stock.balance(), 300_000);
    }

    #[test]
    fn the_fileless_lab_starts_an_isolated_story_run() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default().with_seed(std::num::NonZeroU32::new(215).unwrap());
        let runner = LabSource::Story(setup).load(&catalog).unwrap();
        assert_eq!(runner.setup.seed(), 215);
        assert!(runner.setup.mode == Mode::Story);
        assert_eq!(runner.village.camp, Some(CAMP_SITES[1].1));
        assert_eq!(runner.index, 0);
        assert!(runner.scenario.orders.is_empty());
        assert!(runner.scenario.steps as f64 * STEP >= 365.0 * crate::weather::DAY);
        assert!(!Playback::default().running);
    }

    #[test]
    fn lab_toolbar_wraps_without_covering_the_readout() {
        use bevy::{
            asset::AssetPlugin,
            camera::{RenderTargetInfo, Viewport},
            text::TextPlugin,
            ui::{UiGlobalTransform, UiPlugin},
        };

        let mut app = App::new();
        app.add_plugins((
            MinimalPlugins,
            AssetPlugin::default(),
            bevy::input::InputPlugin,
            bevy::window::WindowPlugin {
                primary_window: None,
                exit_condition: bevy::window::ExitCondition::DontExit,
                ..default()
            },
            bevy::picking::DefaultPickingPlugins,
            TextPlugin,
            UiPlugin,
            crate::ui_font::UiFontPlugin,
        ))
        .init_asset::<Image>()
        .init_asset::<TextureAtlasLayout>()
        .add_systems(Startup, setup_lab_window);
        app.finish();
        app.cleanup();
        app.update();
        let world = app.world_mut();
        let font = world
            .resource_mut::<Assets<Font>>()
            .add(Font::try_from_bytes(include_bytes!("../outfit.ttf").to_vec()).unwrap());
        for mut style in world.query::<&mut TextFont>().iter_mut(world) {
            style.font = font.clone();
        }
        world
            .query_filtered::<&mut Text, Without<LabControlLabel>>()
            .single_mut(world)
            .unwrap()
            .0 = "Balance Lab readout".into();

        let mut previous_height = 0.0;
        for width in [1280, 800] {
            let world = app.world_mut();
            let mut camera = world.query::<&mut Camera>().single_mut(world).unwrap();
            let size = UVec2::new(width, 600);
            camera.computed.target_info = Some(RenderTargetInfo {
                physical_size: size,
                scale_factor: 1.0,
            });
            camera.viewport = Some(Viewport {
                physical_size: size,
                ..default()
            });
            app.update();

            let world = app.world_mut();
            let (toolbar, transform) = world
                .query::<(&LabToolbar, &ComputedNode, &UiGlobalTransform)>()
                .iter(world)
                .find_map(|(kind, node, transform)| {
                    (*kind == LabToolbar::Main).then_some((node, transform))
                })
                .unwrap();
            let height = toolbar.size().y;
            let toolbar_bottom = transform.translation.y + height * 0.5;
            let (readout, transform) = world
                .query_filtered::<(&ComputedNode, &UiGlobalTransform), (With<Text>, Without<LabControlLabel>)>()
                .single(world)
                .unwrap();
            let readout_top = transform.translation.y - readout.size().y * 0.5;
            assert!(height > previous_height, "toolbar should wrap at {width}px");
            assert!(
                readout_top >= toolbar_bottom,
                "readout must stay below the toolbar"
            );
            previous_height = height;
        }
    }

    #[test]
    fn trends_show_retained_steps_and_resource_ranges() {
        let catalog = Catalog::default();
        let scenario = serde_json::from_str(r#"{"steps":2}"#).unwrap();
        let mut runner = run(scenario, None, &catalog).unwrap();
        let mut history = TrendHistory::default();
        let mut step = 0;
        let mut record = |history: &mut TrendHistory, village: &mut Village, balance| {
            village.clock = step as f64 * crate::weather::HOUR + 0.01;
            village
                .stock
                .debit(village.stock.balance(), crate::stock::CashKind::Materials);
            village.stock.credit(balance, crate::stock::CashKind::Sales);
            history.record(step, village);
            history.record(step + 1, village);
            step += 1;
        };
        for balance in [100, 300, 200] {
            record(&mut history, &mut runner.village, balance);
        }
        let trends = lab_trends(&history, &catalog, 2);
        assert!(trends.contains("3 hourly samples retained"));
        assert!(trends.contains("Steps 0–2"));
        assert!(trends.contains("2 recorded orders"));
        assert!(trends.contains("Savings · 2.0 R$ · range 1.0–3.0\n-+-\n--+\n---\n+--"));
        assert!(trends.contains("Clean water"));
        assert!(trends.contains("Lowest hydration"));
        assert!(trends.contains("Food ingredients"));
        for _ in 0..SAMPLE_LIMIT {
            record(&mut history, &mut runner.village, 200);
        }
        assert_eq!(history.samples.len(), SAMPLE_LIMIT);
        assert_eq!(history.omitted, 3);
        let trends = lab_trends(&history, &catalog, 2);
        assert!(trends.contains("Latest 240 samples"));
        assert!(trends.contains("3 older omitted"));
    }

    #[test]
    fn a_scripted_road_stroke_builds_a_connected_route_and_replays() {
        let catalog = Catalog::default();
        let scenario = serde_json::from_str(
            r#"{
                "steps": 8000,
                "orders": [
                    {"step": 0, "order": {"type": "road", "start": [44, 36], "end": [46, 37]}}
                ]
            }"#,
        )
        .unwrap();
        let runner = run(scenario, None, &catalog).unwrap();
        assert!(
            runner.outcomes[0].error.is_none(),
            "{:?}",
            runner.outcomes[0].error
        );
        let cells: Vec<_> = runner
            .village
            .construction
            .finished_models(&catalog)
            .collect();
        assert_eq!(cells.len(), 4);
        let report =
            serde_json::from_slice(&serde_json::to_vec(&runner.report()).unwrap()).unwrap();
        assert_eq!(verify_report(report, &catalog).unwrap(), 8000);
    }

    #[test]
    fn terrain_strokes_change_the_saved_land_and_replay() {
        let catalog = Catalog::default();
        let scenario = serde_json::from_str(r#"{
            "steps": 10,
            "orders": [
                {"step": 0, "order": {"type": "terrain-stroke", "brush": "raise", "points": [[40,24],[42,24]]}},
                {"step": 1, "order": {"type": "terrain-stroke", "brush": "raise", "points": [[300,24]]}}
            ]
        }"#).unwrap();
        let runner = run(scenario, None, &catalog).unwrap();
        assert!(runner.outcomes[0].error.is_none());
        assert!(runner.outcomes[1].error.is_some());
        assert!(
            runner.terrain.elevation(40.0, 24.0) > runner.setup.terrain().elevation(40.0, 24.0)
        );
        let report =
            serde_json::from_slice(&serde_json::to_vec(&runner.report()).unwrap()).unwrap();
        assert_eq!(verify_report(report, &catalog).unwrap(), 10);

        let path = std::env::temp_dir().join(format!(
            "solar-v3-terrain-checkpoint-{}.json",
            std::process::id()
        ));
        runner.checkpoint(&path).unwrap();
        let loaded = save::read(&path, &catalog).unwrap();
        std::fs::remove_file(path).unwrap();
        assert_eq!(
            loaded.terrain(&runner.setup).elevation(40.0, 24.0),
            runner.terrain.elevation(40.0, 24.0)
        );
        let scenario = serde_json::from_str(
            r#"{
            "steps": 10,
            "orders": [{"step": 0, "order": {"type": "terrain-reset"}}]
        }"#,
        )
        .unwrap();
        let reset = run(scenario, Some(loaded), &catalog).unwrap();
        assert!(reset.outcomes[0].error.is_none());
        assert_eq!(
            reset.terrain.elevation(40.0, 24.0),
            reset.setup.terrain().elevation(40.0, 24.0)
        );
        let report = serde_json::from_slice(&serde_json::to_vec(&reset.report()).unwrap()).unwrap();
        assert_eq!(verify_report(report, &catalog).unwrap(), 10);
    }

    #[test]
    fn a_build_order_uses_a_terrain_stroke_from_the_same_step() {
        let catalog = Catalog::default();
        let scenario = serde_json::from_str(r#"{
            "steps": 1,
            "orders": [
                {"step": 0, "order": {"type": "terrain-stroke", "brush": "raise", "points": [[24,8]]}},
                {"step": 0, "order": {"type": "build", "key": "gathering", "x": 44, "z": 36}}
            ]
        }"#).unwrap();
        let runner = run(scenario, None, &catalog).unwrap();
        for outcome in &runner.outcomes {
            assert!(outcome.error.is_none(), "{:?}", outcome.error);
        }
        let base = runner.setup.terrain().with_camp(runner.camp);
        let original_foundation = base
            .foundation(IVec2::new(44, 36), IVec2::splat(2))
            .unwrap();
        let [foundation] = runner.village.construction.foundations.as_slice() else {
            panic!("Expected one foundation");
        };
        assert!(foundation.height() > original_foundation.height());

        let report =
            serde_json::from_slice(&serde_json::to_vec(&runner.report()).unwrap()).unwrap();
        assert_eq!(verify_report(report, &catalog).unwrap(), 1);
    }

    #[test]
    fn field_resize_checks_placement_before_queued_bed_work() {
        let catalog = Catalog::default();
        let scenario = serde_json::from_str(
            r#"{
            "steps": 1,
            "orders": [
                {"step":0,"order":{"type":"build","key":"field","x":44,"z":36,"size":[2,2]}},
                {"step":0,"order":{"type":"build","key":"field","x":48,"z":36,"size":[2,2]}},
                {"step":0,"order":{"type":"bed","site":1,"bed":1,"action":"Prepare"}},
                {"step":0,"order":{"type":"resize-field","site":1,"size":[6,2]}},
                {"step":0,"order":{"type":"resize-field","site":1,"size":[3,2]}}
            ]
        }"#,
        )
        .unwrap();
        let runner = run(scenario, None, &catalog).unwrap();
        for outcome in &runner.outcomes[..3] {
            assert!(outcome.error.is_none(), "{:?}", outcome.error);
        }
        assert_eq!(
            runner.outcomes[3].error.as_deref(),
            Some("Another project occupies that space.")
        );
        assert_eq!(
            runner.outcomes[4].error.as_deref(),
            Some("Finish this field’s jobs before resizing.")
        );
        let report = serde_json::to_value(runner.report()).unwrap();
        assert_eq!(
            report["village"]["construction"]["plans"][0]["size"],
            serde_json::json!([2, 2])
        );
    }

    #[test]
    fn resized_field_copies_replay_with_the_new_dimensions_and_rotation() {
        let catalog = Catalog::default();
        let scenario = serde_json::from_str(r#"{
            "steps": 1,
            "orders": [
                {"step":0,"order":{"type":"build","key":"field","x":44,"z":36,"size":[3,2],"rotation":1}},
                {"step":0,"order":{"type":"resize-field","site":1,"size":[4,3]}},
                {"step":0,"order":{"type":"copy","site":1,"x":49,"z":36}}
            ]
        }"#).unwrap();
        let runner = run(scenario, None, &catalog).unwrap();
        assert!(
            runner
                .outcomes
                .iter()
                .all(|outcome| outcome.error.is_none())
        );
        let report = serde_json::to_value(runner.report()).unwrap();
        let projects = &report["village"]["construction"]["plans"];
        assert_eq!(projects[0]["size"], serde_json::json!([3, 4]));
        assert_eq!(projects[1]["rotation"], 1);
        assert_eq!(projects[1]["size"], projects[0]["size"]);
        let recorded =
            serde_json::from_slice(&serde_json::to_vec(&runner.report()).unwrap()).unwrap();
        assert_eq!(verify_report(recorded, &catalog).unwrap(), 1);
    }

    #[test]
    fn sandbox_instant_build_orders_replay_both_construction_modes() {
        let catalog = Catalog::default();
        let scenario = serde_json::from_str(r#"{
            "setup":{"mode":"Sandbox","seed":42,"biome":0,"landscape":1,"water":1,"savings":1,"supplies":1},
            "steps":1,
            "orders":[
                {"step":0,"order":{"type":"instant-build","enabled":false}},
                {"step":0,"order":{"type":"instant-build","enabled":false}},
                {"step":0,"order":{"type":"build","key":"home-cottage","x":44,"z":36}},
                {"step":0,"order":{"type":"instant-build","enabled":true}},
                {"step":0,"order":{"type":"build","key":"home-cottage","x":49,"z":36}}
            ]
        }"#).unwrap();
        let runner = run(scenario, None, &catalog).unwrap();
        assert!(
            runner
                .outcomes
                .iter()
                .all(|outcome| outcome.error.is_none())
        );
        let report = serde_json::to_value(runner.report()).unwrap();
        let plans = &report["village"]["construction"]["plans"];
        let required_work = catalog.projects["home-cottage"].work;
        assert!(plans[0]["work"].as_f64().unwrap() < required_work);
        assert_eq!(plans[1]["work"].as_f64().unwrap(), required_work);
        assert_eq!(
            verify_report(
                serde_json::from_slice(&serde_json::to_vec(&runner.report()).unwrap()).unwrap(),
                &catalog
            )
            .unwrap(),
            1
        );
    }

    #[test]
    fn housing_orders_reserve_and_release_beds_in_replay() {
        let catalog = Catalog::default();
        let scenario = serde_json::from_str(r#"{
            "setup":{"mode":"Sandbox","seed":42,"biome":0,"landscape":1,"water":1,"savings":1,"supplies":1},
            "steps":2,
            "orders":[
                {"step":0,"order":{"type":"build","key":"home-cottage","x":44,"z":36}},
                {"step":1,"order":{"type":"building-power","site":1,"enabled":false}},
                {"step":1,"order":{"type":"building-power","site":1,"enabled":false}},
                {"step":1,"order":{"type":"assign-home","resident":1,"home":1}},
                {"step":1,"order":{"type":"building-power","site":1,"enabled":true}},
                {"step":1,"order":{"type":"assign-home","resident":1,"home":1}},
                {"step":1,"order":{"type":"assign-home","resident":2,"home":1}},
                {"step":1,"order":{"type":"assign-home","resident":1}},
                {"step":1,"order":{"type":"assign-home","resident":2,"home":1}}
            ]
        }"#).unwrap();
        let runner = run(scenario, None, &catalog).unwrap();
        let errors: Vec<_> = runner
            .outcomes
            .iter()
            .map(|outcome| outcome.error.as_deref())
            .collect();
        assert_eq!(
            errors,
            [
                None,
                None,
                None,
                Some("Reopen this home before assigning residents."),
                None,
                None,
                Some("This home has no free beds."),
                None,
                None
            ]
        );
        let report =
            serde_json::from_slice(&serde_json::to_vec(&runner.report()).unwrap()).unwrap();
        assert_eq!(verify_report(report, &catalog).unwrap(), 2);
    }

    #[test]
    fn scripted_pantry_budget_controls_restocks_and_replays() {
        let catalog = Catalog::default();
        let scenario = serde_json::from_str(r#"{
            "steps": 120,
            "orders": [
                {"step": 0, "order": {"type": "food-policy", "enabled": true, "reserve_half_days": 14, "allowance_cents": 0}},
                {"step": 100, "order": {"type": "food-policy", "enabled": true, "allowance_cents": 10000}}
            ]
        }"#).unwrap();
        let mut runner = Runner::new(scenario, None, &catalog).unwrap();
        while runner.index < 100 {
            runner.advance(&catalog);
        }
        assert!(runner.village.construction.trade.orders.is_empty());
        while !runner.done() {
            runner.advance(&catalog);
        }
        assert!(runner.outcomes.iter().all(|order| order.error.is_none()));
        assert_eq!(runner.village.construction.trade.orders.len(), 1);
        let report =
            serde_json::from_slice(&serde_json::to_vec(&runner.report()).unwrap()).unwrap();
        assert_eq!(verify_report(report, &catalog).unwrap(), 120);
    }

    #[test]
    fn scripted_pantry_freight_arrives_without_a_driver_and_replays() {
        let catalog = Catalog::default();
        let scenario = serde_json::from_str(r#"{
            "steps": 10000,
            "orders": [
                {"step": 0, "order": {"type": "supply-transport", "freight": true}},
                {"step": 0, "order": {"type": "food-policy", "enabled": true, "reserve_half_days": 14, "allowance_cents": 10000}}
            ]
        }"#).unwrap();
        let runner = run(scenario, None, &catalog).unwrap();
        assert!(runner.outcomes.iter().all(|order| order.error.is_none()));
        let construction = &runner.village.construction;
        assert_eq!(construction.trade.purchases, 1);
        assert!(construction.trade.delivery.is_none());
        assert!(construction.trade.orders.is_empty());
        assert!(construction.car_trip(0).is_none() && construction.car_trip(1).is_none());
        let report =
            serde_json::from_slice(&serde_json::to_vec(&runner.report()).unwrap()).unwrap();
        assert_eq!(verify_report(report, &catalog).unwrap(), 10000);
    }

    #[test]
    fn seed_freight_survives_checkpoint_and_resumes_planting() {
        let catalog = Catalog::default();
        let scenario = serde_json::from_str(r#"{
            "steps": 12000,
            "orders": [
                {"step": 0, "order": {"type": "build", "key": "field", "x": 40, "z": 36, "size": [2, 2]}},
                {"step": 0, "order": {"type": "supply-transport", "freight": true}},
                {"step": 0, "order": {"type": "food-policy", "enabled": false}}
            ]
        }"#).unwrap();
        let mut runner = Runner::new(scenario, None, &catalog).unwrap();
        assert!(runner.outcomes.iter().all(|order| order.error.is_none()));
        let bed = &mut runner
            .village
            .construction
            .farming
            .plots
            .get_mut(&0)
            .unwrap()
            .beds[0];
        bed.stage = crate::farming::Stage::Prepared;
        let seed = bed
            .requirements(crate::farming::FarmAction::Plant, 0.0)
            .unwrap()
            .0;
        for id in seed.keys() {
            let amount = runner.village.stock.available(id);
            runner
                .village
                .stock
                .reserve_available(&std::collections::BTreeMap::from([(id.clone(), amount)]));
        }
        let plant =
            serde_json::from_str(r#"{"type":"bed","site":1,"bed":1,"action":"Plant"}"#).unwrap();
        runner.submit(&catalog, plant).unwrap();
        assert!(runner.outcomes.last().unwrap().error.is_none());
        runner.advance(&catalog);
        assert!(
            runner.village.construction.farming.jobs[0]
                .seed_freight_eta
                .is_some()
        );

        let path = std::env::temp_dir().join(format!(
            "solar-seed-freight-checkpoint-{}.json",
            std::process::id()
        ));
        runner.checkpoint(&path).unwrap();
        let loaded = crate::save::read(&path, &catalog);
        std::fs::remove_file(path).unwrap();
        let scenario = serde_json::from_str(r#"{"steps":12000}"#).unwrap();
        let resumed = run(scenario, Some(loaded.unwrap()), &catalog).unwrap();
        let construction = &resumed.village.construction;
        assert!(construction.farming.plots[&0].beds[0].stage == crate::farming::Stage::Growing);
        assert!(
            construction
                .farming
                .jobs
                .iter()
                .all(|job| (job.site, job.bed) != (0, 0) || job.seed_freight_eta.is_none())
        );
        assert!(resumed.village.valid_save(&catalog));
    }

    #[test]
    fn automatic_pantry_purchase_shares_the_sale_trip_on_a_food_only_budget() {
        let catalog = Catalog::default();
        let scenario = serde_json::from_str(r#"{
            "steps": 2500,
            "orders": [
                {"step": 0, "order": {"type": "food-policy", "enabled": false}},
                {"step": 0, "order": {"type": "sell", "material": "wood"}},
                {"step": 100, "order": {"type": "food-policy", "enabled": true, "reserve_half_days": 14, "allowance_cents": 4800}}
            ]
        }"#).unwrap();
        let runner = run(scenario, None, &catalog).unwrap();
        assert!(runner.outcomes.iter().all(|order| order.error.is_none()));
        assert_eq!(runner.village.construction.trade.receipts, 1);
        assert_eq!(runner.village.construction.trade.purchases, 1);
        let report = serde_json::to_value(runner.report()).unwrap();
        assert_eq!(
            report["village"]["construction"]["opening"]["town_trips"],
            1
        );
    }

    #[test]
    fn an_away_day_shift_resumes_and_pays_wages_once() {
        let catalog = Catalog::default();
        let scenario = serde_json::from_str(
            r#"{
            "steps": 1500,
            "orders": [
                {"step": 0, "order": {"type": "outside", "resident": 1, "enabled": true}}
            ]
        }"#,
        )
        .unwrap();
        let runner = run(scenario, None, &catalog).unwrap();
        assert!(runner.outcomes[0].error.is_none());
        assert!(runner.village.construction.away_for_work(0));

        let path = std::env::temp_dir().join(format!(
            "solar-shift-checkpoint-{}.json",
            std::process::id()
        ));
        runner.checkpoint(&path).unwrap();
        let loaded = crate::save::read(&path, &catalog);
        std::fs::remove_file(path).unwrap();

        let scenario = serde_json::from_str(r#"{"steps":15000}"#).unwrap();
        let resumed = run(scenario, Some(loaded.unwrap()), &catalog).unwrap();
        assert!(!resumed.village.construction.away_for_work(0));
        let stock = serde_json::to_value(&resumed.village.stock).unwrap();
        assert_eq!(stock["ledger"]["TownWages"], 16_000);
        assert_eq!(stock["ledger"]["Commuting"], -800);
        assert!(resumed.village.valid_save(&catalog));
    }

    #[test]
    fn scripted_automatic_sales_respect_reserves_and_replay() {
        let catalog = Catalog::default();
        let scenario = serde_json::from_str(r#"{
            "steps": 2500,
            "orders": [
                {"step": 0, "order": {"type": "sale-policy", "material": "wood", "enabled": true, "reserve": 24, "trigger": 24, "limit": 12}}
            ]
        }"#).unwrap();
        let runner = run(scenario, None, &catalog).unwrap();
        assert!(runner.outcomes[0].error.is_none());
        assert_eq!(runner.village.stock.available("wood"), 24);
        assert_eq!(runner.village.construction.trade.receipts, 1);
        let report =
            serde_json::from_slice(&serde_json::to_vec(&runner.report()).unwrap()).unwrap();
        assert_eq!(verify_report(report, &catalog).unwrap(), 2500);
    }

    #[test]
    fn a_scenario_can_set_its_own_world_and_replay_it() {
        let catalog = Catalog::default();
        let mut input = serde_json::json!({
            "steps": 2,
            "setup": {
                "seed": 215,
                "biome": 2,
                "landscape": 2,
                "water": 0,
                "resources": 0,
                "savings": 0,
                "supplies": 0,
                "town": 2
            }
        });
        let scenario = serde_json::from_value(input.clone()).unwrap();
        let runner = run(scenario, None, &catalog).unwrap();
        assert_eq!(runner.setup.seed(), 215);
        assert_eq!(runner.setup.biome(), 2);
        assert_eq!(runner.setup.round_trip_km(), 36);
        assert_eq!(runner.initial["stock"]["cash"], 3000);
        let report =
            serde_json::from_slice(&serde_json::to_vec(&runner.report()).unwrap()).unwrap();
        assert_eq!(verify_report(report, &catalog).unwrap(), 2);

        input["setup"]["biome"] = serde_json::json!(3);
        let invalid = serde_json::from_value(input).unwrap();
        assert!(run(invalid, None, &catalog).is_err());
    }

    #[test]
    fn custom_intervals_accept_fractional_days_and_respect_the_run_limit() {
        let mut playback = Playback::default();
        for invalid in ["", "0", "-1", "NaN", "inf", "365.01"] {
            assert!(playback.set_custom_interval(invalid).is_err());
        }
        playback.set_custom_interval("0.25").unwrap();
        assert!(playback.set_custom_interval("0").is_err());
        let (days, label) = playback.interval();
        assert_eq!(days, 0.25);
        let seconds = days * crate::weather::DAY;
        playback.start_interval(10, 100_000, seconds, &label);
        assert_eq!(playback.pause_at, Some(10 + (seconds / STEP).ceil() as u64));
        playback.start_interval(10, 12, seconds, &label);
        assert_eq!(playback.pause_at, Some(12));
    }

    #[test]
    fn interval_stops_at_its_target_and_leaves_a_replayable_partial_report() {
        let catalog = Catalog::default();
        let mut runner = Runner::new(
            Scenario {
                steps: 12,
                setup: None,
                orders: vec![ScheduledOrder {
                    step: 4,
                    order: LabOrder::Grid { enabled: false },
                }],
                stop: LabStop::None,
            },
            None,
            &catalog,
        )
        .unwrap();
        let mut playback = Playback::default();
        playback.start_interval(runner.index, runner.scenario.steps, 0.3, "test interval");
        while playback.running {
            playback.advance_frame(&mut runner, &catalog, 12, 0.1);
        }
        assert_eq!(runner.index, 3);
        assert!(runner.outcomes.is_empty());
        assert_eq!(playback.notice, "Interval complete at step 3.");
        let partial =
            serde_json::from_slice(&serde_json::to_vec(&runner.report()).unwrap()).unwrap();
        assert_eq!(verify_report(partial, &catalog).unwrap(), 3);

        playback.start_interval(
            runner.index,
            runner.scenario.steps,
            crate::weather::HOUR,
            "one hour",
        );
        while !runner.done() {
            playback.advance_frame(&mut runner, &catalog, 12, 0.1);
        }
        assert_eq!(runner.index, 12);
        assert!(runner.village.construction.utilities.grid_off);
        assert_eq!(
            verify_report(
                serde_json::from_slice(&serde_json::to_vec(&runner.report()).unwrap()).unwrap(),
                &catalog
            )
            .unwrap(),
            12
        );
    }

    #[test]
    fn lab_speed_labels_distinguish_requested_and_achieved_rates() {
        let mut playback = Playback {
            running: true,
            ..default()
        };
        assert_eq!(playback.speed_label(), "Target 128×");
        playback.set_speed(8);
        playback.speed_meter.observe(0.25, 40);
        playback.speed_meter.observe(0.25, 120);
        playback.debt = 2.0;
        assert_eq!(
            playback.speed_label(),
            "Actual 32.0× / target 1024× · CPU limited"
        );
        playback.set_speed(0);
        assert_eq!(playback.speed_label(), "Target 1×");
        assert_eq!(playback.debt, 0.0);
    }

    #[test]
    fn partial_reports_replay_through_the_exported_step_only() {
        let catalog = Catalog::default();
        let scenario = Scenario {
            steps: 5_000,
            setup: None,
            orders: vec![ScheduledOrder {
                step: 2,
                order: LabOrder::Grid { enabled: false },
            }],
            stop: LabStop::None,
        };
        let mut runner = Runner::new(scenario, None, &catalog).unwrap();
        runner.advance(&catalog);
        assert!(!runner.done());
        assert!(runner.outcomes.is_empty());
        let report: serde_json::Value =
            serde_json::from_slice(&serde_json::to_vec(&runner.report()).unwrap()).unwrap();
        assert_eq!(report["partial"], true);
        assert_eq!(report["scenario"]["steps"], 5_000);
        assert_eq!(verify_report(report, &catalog).unwrap(), 1);
    }

    #[test]
    fn replay_window_stops_at_a_partial_report_and_rejects_live_input() {
        let catalog = Catalog::default();
        let scenario = Scenario {
            steps: 5,
            setup: None,
            orders: vec![ScheduledOrder {
                step: 2,
                order: LabOrder::Grid { enabled: false },
            }],
            stop: LabStop::None,
        };
        let mut recorded = Runner::new(scenario, None, &catalog).unwrap();
        recorded.advance(&catalog);
        let report =
            serde_json::from_slice(&serde_json::to_vec(&recorded.report()).unwrap()).unwrap();
        let (runner, replay) = prepare_replay(report, &catalog).unwrap();

        let mut app = App::new();
        app.add_plugins(MinimalPlugins)
            .insert_resource(catalog)
            .insert_resource(runner)
            .insert_resource(replay)
            .init_resource::<ButtonInput<KeyCode>>()
            .init_resource::<map::MapState>()
            .add_message::<bevy::input::keyboard::KeyboardInput>()
            .add_message::<bevy::window::FileDragAndDrop>()
            .add_systems(Update, update_lab_window);
        let panel = app.world_mut().spawn(Text::default()).id();
        let step = app
            .world_mut()
            .spawn((Interaction::None, LabControl::Shortcut(KeyCode::KeyJ)))
            .with_child((Text::new("Single step"), LabControlLabel))
            .id();
        let focus = app
            .world_mut()
            .spawn((Interaction::None, LabControl::FocusCamp))
            .id();
        let trade = app
            .world_mut()
            .spawn((Interaction::None, LabControl::View(LabView::Trade)))
            .id();
        let jobs = app
            .world_mut()
            .spawn((Interaction::None, LabControl::View(LabView::Jobs)))
            .id();
        let waiting = app
            .world_mut()
            .spawn((Interaction::None, LabControl::Shortcut(KeyCode::KeyW)))
            .id();
        let faster = app
            .world_mut()
            .spawn((Interaction::None, LabControl::CycleSpeed))
            .id();
        let key = |app: &mut App, key| {
            let mut keys = app.world_mut().resource_mut::<ButtonInput<KeyCode>>();
            keys.reset_all();
            keys.press(key);
            app.update();
        };
        key(&mut app, KeyCode::KeyO);
        let view = &app.world().get::<Text>(panel).unwrap().0;
        assert!(view.contains("Replay paused"));
        assert!(!view.contains("Enter order"));
        *app.world_mut().get_mut::<Interaction>(focus).unwrap() = Interaction::Pressed;
        app.update();
        assert!(app.world().resource::<map::MapState>().visible);
        *app.world_mut().get_mut::<Interaction>(trade).unwrap() = Interaction::Pressed;
        app.update();
        assert!(!app.world().resource::<map::MapState>().visible);
        assert_eq!(app.world().resource::<Runner>().index, 0);
        *app.world_mut().get_mut::<Interaction>(jobs).unwrap() = Interaction::Pressed;
        app.update();
        assert!(
            app.world()
                .get::<Text>(panel)
                .unwrap()
                .0
                .contains("Active jobs")
        );
        *app.world_mut().get_mut::<Interaction>(waiting).unwrap() = Interaction::Pressed;
        app.update();
        assert!(
            app.world()
                .get::<Text>(panel)
                .unwrap()
                .0
                .contains("Waiting jobs")
        );
        assert_eq!(app.world().resource::<Runner>().index, 0);
        *app.world_mut().get_mut::<Interaction>(faster).unwrap() = Interaction::Pressed;
        app.update();
        assert!(
            app.world()
                .get::<Text>(panel)
                .unwrap()
                .0
                .contains("Target 256×")
        );
        *app.world_mut().get_mut::<Interaction>(step).unwrap() = Interaction::Pressed;
        app.update();
        assert!(
            app.world()
                .get::<Text>(panel)
                .unwrap()
                .0
                .contains("Replay matched through step 1.")
        );
        key(&mut app, KeyCode::KeyJ);
        let runner = app.world().resource::<Runner>();
        assert_eq!(runner.index, 1);
        assert!(runner.outcomes.is_empty());
        assert!(!runner.village.construction.utilities.grid_off);
    }

    #[test]
    fn desktop_lab_reloads_an_edited_scenario_only_after_confirmation() {
        let path =
            std::env::temp_dir().join(format!("solar-lab-reload-{}.json", std::process::id()));
        std::fs::write(&path, r#"{"steps":3}"#).unwrap();
        let source = LabSource::File {
            scenario: path.clone(),
            checkpoint: None,
        };
        let catalog = Catalog::default();
        let mut runner = source.load(&catalog).unwrap();
        runner.advance(&catalog);
        let mut app = App::new();
        app.add_plugins(MinimalPlugins)
            .insert_resource(catalog)
            .insert_resource(runner)
            .insert_resource(source)
            .init_resource::<ButtonInput<KeyCode>>()
            .init_resource::<map::MapState>()
            .add_message::<bevy::input::keyboard::KeyboardInput>()
            .add_message::<bevy::window::FileDragAndDrop>()
            .add_systems(Update, update_lab_window);
        let panel = app.world_mut().spawn(Text::default()).id();
        let confirm = app
            .world_mut()
            .spawn((Interaction::None, LabControl::Confirm))
            .id();
        let press_reload = |app: &mut App| {
            let mut keys = app.world_mut().resource_mut::<ButtonInput<KeyCode>>();
            keys.reset_all();
            keys.press(KeyCode::F8);
            app.update();
        };
        std::fs::write(&path, r#"{"steps":8}"#).unwrap();
        press_reload(&mut app);
        assert!(
            app.world()
                .get::<Text>(panel)
                .unwrap()
                .0
                .contains("Confirm")
        );
        assert_eq!(app.world().resource::<Runner>().index, 1);
        app.world_mut()
            .resource_mut::<ButtonInput<KeyCode>>()
            .reset_all();
        *app.world_mut().get_mut::<Interaction>(confirm).unwrap() = Interaction::Pressed;
        app.update();
        let reloaded = app.world().resource::<Runner>();
        assert_eq!(reloaded.index, 0);
        assert_eq!(reloaded.scenario.steps, 8);
        let checkpoint = path.with_extension("checkpoint.json");
        let mut saved: Village = serde_json::from_value(reloaded.initial.clone()).unwrap();
        saved.clock = 20.0;
        crate::save::write(&checkpoint, &saved).unwrap();
        let window = app.world_mut().spawn_empty().id();
        app.world_mut()
            .resource_mut::<ButtonInput<KeyCode>>()
            .reset_all();
        app.world_mut()
            .write_message(bevy::window::FileDragAndDrop::DroppedFile {
                window,
                path_buf: checkpoint.clone(),
            });
        app.update();
        assert_eq!(app.world().resource::<Runner>().village.clock, 0.0);
        press_reload(&mut app);
        assert_eq!(app.world().resource::<Runner>().village.clock, 20.0);
        assert_eq!(app.world().resource::<Runner>().index, 0);
        let evidence = path.with_extension("evidence.json");
        let mut recorded = LabReplacement::SavedLab(checkpoint.clone())
            .load(None, 8, app.world().resource::<Catalog>())
            .unwrap()
            .0;
        recorded.advance(app.world().resource::<Catalog>());
        recorded.export(&evidence).unwrap();
        app.world_mut()
            .resource_mut::<ButtonInput<KeyCode>>()
            .reset_all();
        app.world_mut()
            .write_message(bevy::window::FileDragAndDrop::DroppedFile {
                window,
                path_buf: evidence.clone(),
            });
        app.update();
        assert!(!app.world().contains_resource::<Replay>());
        press_reload(&mut app);
        assert_eq!(app.world().resource::<Replay>().limit, 1);
        assert_eq!(app.world().resource::<Runner>().index, 0);
        std::fs::remove_file(evidence).unwrap();
        std::fs::remove_file(checkpoint).unwrap();
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn a_lab_checkpoint_restores_the_current_village_for_a_new_run() {
        let catalog = Catalog::default();
        let scenario = || Scenario {
            steps: 3,
            setup: None,
            orders: vec![],
            stop: LabStop::None,
        };
        let mut runner = Runner::new(scenario(), None, &catalog).unwrap();
        runner.advance(&catalog);
        runner
            .submit(&catalog, LabOrder::Grid { enabled: false })
            .unwrap();
        let path = std::env::temp_dir().join(format!(
            "solar-lab-checkpoint-test-{}.json",
            std::process::id()
        ));
        runner.checkpoint(&path).unwrap();
        let from_save = crate::save::read(&path, &catalog);
        std::fs::remove_file(path).unwrap();
        let resumed = Runner::new(scenario(), Some(from_save.unwrap()), &catalog).unwrap();
        assert_eq!(resumed.index, 0);
        assert_eq!(resumed.village.clock, runner.village.clock);
        assert!(resumed.village.construction.utilities.grid_off);
        assert!(resumed.outcomes.is_empty());
    }

    #[test]
    fn a_lab_purchase_at_night_cannot_spend_cash_or_create_an_order() {
        let catalog = Catalog::default();
        let mut village = run(
            Scenario {
                steps: 1,
                setup: None,
                orders: Vec::new(),
                stop: LabStop::None,
            },
            None,
            &catalog,
        )
        .unwrap()
        .village;
        village.clock = 12.0 * crate::weather::HOUR;
        let balance = village.stock.balance();
        let report = run(
            Scenario {
                steps: 1,
                setup: None,
                orders: vec![ScheduledOrder {
                    step: 0,
                    order: LabOrder::Buy {
                        material: "wood".into(),
                        freight: true,
                    },
                }],
                stop: LabStop::None,
            },
            Some(village),
            &catalog,
        )
        .unwrap();
        assert!(
            report.outcomes[0]
                .error
                .as_deref()
                .unwrap()
                .contains("Town is closed")
        );
        assert_eq!(report.village.stock.balance(), balance);
        assert!(report.village.construction.trade.delivery.is_none());
    }

    #[test]
    fn live_orders_are_replayed_in_sequence_without_duplicate_samples() {
        let catalog = Catalog::default();
        let mut runner = Runner::new(
            Scenario {
                steps: 3,
                setup: None,
                orders: Vec::new(),
                stop: LabStop::None,
            },
            None,
            &catalog,
        )
        .unwrap();
        runner.advance(&catalog);
        runner
            .submit(&catalog, LabOrder::Grid { enabled: false })
            .unwrap();
        runner
            .submit(&catalog, LabOrder::Grid { enabled: true })
            .unwrap();
        let history = lab_order_page(&runner, &mut 0);
        assert!(history.contains("#2 · Step 1 · Enable grid power · Accepted"));
        assert!(history.contains("#1 · Step 1 · Disable grid power · Accepted"));
        assert!(history.find("#2").unwrap() < history.find("#1").unwrap());
        assert_eq!(runner.samples.len(), 2);
        while !runner.done() {
            runner.advance(&catalog);
        }
        assert!(!runner.village.construction.utilities.grid_off);
        let data = serde_json::to_vec(&runner.report()).unwrap();
        assert_eq!(
            verify_report(serde_json::from_slice(&data).unwrap(), &catalog).unwrap(),
            3
        );
    }

    #[test]
    fn a_live_purchase_refreshes_the_hourly_sample_at_the_same_step() {
        let catalog = Catalog::default();
        let scenario = serde_json::from_str(r#"{"steps":3}"#).unwrap();
        let mut runner = Runner::new(scenario, None, &catalog).unwrap();
        let opening_cash = runner.village.stock.balance();
        assert_eq!(runner.trends.samples[0].cash_centavos, opening_cash);

        runner
            .submit(
                &catalog,
                LabOrder::Buy {
                    material: "wood".into(),
                    freight: true,
                },
            )
            .unwrap();
        let cash_after_order = runner.village.stock.balance();
        assert!(cash_after_order < opening_cash);
        assert_eq!(runner.trends.samples.len(), 1);
        assert_eq!(runner.trends.samples[0].cash_centavos, cash_after_order);

        while !runner.done() {
            runner.advance(&catalog);
        }
        let report =
            serde_json::from_slice(&serde_json::to_vec(&runner.report()).unwrap()).unwrap();
        assert_eq!(verify_report(report, &catalog).unwrap(), 3);
    }

    #[test]
    fn cultivation_shortcut_records_the_selected_bed_order_for_replay() {
        let catalog = Catalog::default();
        let scenario = serde_json::from_str(r#"{
            "steps": 2,
            "orders": [{"step": 0, "order": {"type":"build","key":"field","x":40,"z":36,"size":[2,2]}}]
        }"#).unwrap();
        let mut runner = Runner::new(scenario, None, &catalog).unwrap();
        let mut playback = Playback {
            farm_site: Some(0),
            inventory_page: 1,
            ..default()
        };
        let mut keys = ButtonInput::default();
        keys.press(KeyCode::KeyX);
        let detail = lab_bed_page(&mut runner, &catalog, &keys, &mut playback);
        assert!(detail.contains("Bush beans"));
        assert!(matches!(
            runner.scenario.orders[1].order,
            LabOrder::ConfigureBed {
                site: 1,
                bed: 2,
                ..
            }
        ));
        keys.reset_all();
        keys.press(KeyCode::ShiftLeft);
        keys.press(KeyCode::Digit1);
        let details = lab_bed_page(&mut runner, &catalog, &keys, &mut playback);
        assert!(details.contains("Bed 2/"));
        assert_eq!(playback.notice, "Bed order accepted.");
        assert!(matches!(
            runner.scenario.orders[2].order,
            LabOrder::Bed {
                site: 1,
                bed: 2,
                ..
            }
        ));
        while !runner.done() {
            runner.advance(&catalog);
        }
        let data = serde_json::to_vec(&runner.report()).unwrap();
        assert_eq!(
            verify_report(serde_json::from_slice(&data).unwrap(), &catalog).unwrap(),
            2
        );
    }

    #[test]
    fn bulk_lab_orders_keep_per_bed_results_and_replay() {
        let catalog = Catalog::default();
        let scenario = serde_json::from_str(
            r#"{
            "steps": 2,
            "orders": [
                {"step":0,"order":{"type":"build","key":"field","x":40,"z":36,"size":[2,2]}},
                {"step":0,"order":{"type":"bed","site":1,"bed":1,"action":"Prepare"}}
            ]
        }"#,
        )
        .unwrap();
        let mut runner = Runner::new(scenario, None, &catalog).unwrap();
        let mut playback = Playback::default();
        let mut keys = ButtonInput::default();
        keys.press(KeyCode::ControlLeft);
        keys.press(KeyCode::ShiftLeft);
        keys.press(KeyCode::Digit1);
        let first = lab_bed_page(&mut runner, &catalog, &keys, &mut playback);
        assert!(first.contains("Last bed order · Step 0 · Finish the current bed job"));
        keys.reset_all();
        playback.inventory_page = 1;
        let second = lab_bed_page(&mut runner, &catalog, &keys, &mut playback);
        assert!(second.contains("Last bed order · Step 0 · Accepted"));
        let count = runner.village.construction.farming.plots[&0].beds.len();
        assert!(count > 1);
        assert_eq!(runner.outcomes.len(), 2 + count);
        assert!(runner.outcomes[2].error.is_some());
        assert!(
            runner.outcomes[3..]
                .iter()
                .all(|outcome| outcome.error.is_none())
        );
        assert!(
            playback
                .notice
                .contains(&format!("{} of {count}", count - 1))
        );
        while !runner.done() {
            runner.advance(&catalog);
        }
        let data = serde_json::to_vec(&runner.report()).unwrap();
        assert_eq!(
            verify_report(serde_json::from_slice(&data).unwrap(), &catalog).unwrap(),
            2
        );
    }

    #[test]
    fn interactive_single_bed_clear_requires_confirmation_for_the_same_bed() {
        use crate::{
            construction::FarmControl,
            farming::{FarmAction, Stage},
        };

        let catalog = Catalog::default();
        let scenario = serde_json::from_str(
            r#"{
            "steps":1,
            "orders":[{"step":0,"order":{"type":"build","key":"field","x":40,"z":36,"size":[2,2]}}]
        }"#,
        )
        .unwrap();
        let mut runner = Runner::new(scenario, None, &catalog).unwrap();
        let clock = TownClock {
            seconds: runner.village.clock,
            round_trip_km: runner.setup.round_trip_km(),
        };
        let village = &mut runner.village;
        let construction = &mut village.construction;
        construction.production.selected = Some(0);
        construction.farming.open = true;
        for bed in &mut construction.farming.plots.get_mut(&0).unwrap().beds {
            bed.stage = Stage::Growing;
        }
        let clear = FarmControl::Work(FarmAction::Clear);
        construction.apply_farm_control(&catalog, &mut village.stock, clear, clock);
        assert!(construction.farming.jobs.is_empty());
        assert_eq!(construction.farming.pending_crop_clear, Some((0, Some(0))));

        construction.select_bed_number(2);
        construction.apply_farm_control(&catalog, &mut village.stock, clear, clock);
        assert!(construction.farming.jobs.is_empty());
        construction.apply_farm_control(&catalog, &mut village.stock, clear, clock);
        assert_eq!(construction.farming.jobs.len(), 1);
        assert_eq!(construction.farming.jobs[0].bed, 1);
    }

    #[test]
    fn bulk_clear_waits_for_confirmation_and_records_only_confirmed_orders() {
        let catalog = Catalog::default();
        let scenario = serde_json::from_str(
            r#"{
            "steps":2,
            "orders":[{"step":0,"order":{"type":"build","key":"field","x":40,"z":36,"size":[2,2]}}]
        }"#,
        )
        .unwrap();
        let mut runner = Runner::new(scenario, None, &catalog).unwrap();
        let mut playback = Playback::default();
        let mut keys = ButtonInput::default();
        keys.press(KeyCode::ControlLeft);
        keys.press(KeyCode::ShiftLeft);
        keys.press(KeyCode::Digit4);
        assert!(
            lab_bed_page(&mut runner, &catalog, &keys, &mut playback)
                .contains("Ctrl+Shift+4 again")
        );
        assert_eq!(runner.outcomes.len(), 1);
        keys.reset(KeyCode::Digit4);
        keys.press(KeyCode::Digit4);
        lab_bed_page(&mut runner, &catalog, &keys, &mut playback);
        let beds = runner.village.construction.farming.plots[&0].beds.len();
        assert_eq!(runner.outcomes.len(), 1 + beds);
        assert!(playback.clear_confirmation.is_none());
    }

    #[test]
    fn scripted_field_orders_reuse_the_bed_queue_validation() {
        let catalog = Catalog::default();
        let scenario = serde_json::from_str(r#"{
            "steps": 0,
            "orders": [
                {"step": 0, "order": {"type": "build", "key": "field", "x": 40, "z": 36, "size": [2, 2]}},
                {"step": 0, "order": {"type": "configure-bed", "site": 1, "bed": 1, "crop": "Beans"}},
                {"step": 0, "order": {"type": "bed", "site": 1, "bed": 1, "action": "Prepare"}},
                {"step": 0, "order": {"type": "bed", "site": 1, "bed": 1, "action": "Prepare"}},
                {"step": 0, "order": {"type": "outside", "resident": 2, "enabled": true, "recurring": true}}
            ]
        }"#).unwrap();
        let report = run(scenario, None, &catalog).unwrap();
        assert!(
            report.outcomes[..3]
                .iter()
                .all(|order| order.error.is_none()),
            "{:?}",
            report
                .outcomes
                .iter()
                .map(|order| &order.error)
                .collect::<Vec<_>>()
        );
        assert!(
            report.outcomes[3]
                .error
                .as_deref()
                .unwrap()
                .contains("current bed job")
        );
        assert!(report.outcomes[4].error.is_none());
        assert_eq!(report.village.construction.farming.jobs.len(), 1);
    }

    #[test]
    fn a_report_replays_and_detects_a_changed_result() {
        let catalog = Catalog::default();
        let scenario = Scenario {
            steps: 10,
            setup: None,
            orders: vec![ScheduledOrder {
                step: 2,
                order: LabOrder::Grid { enabled: false },
            }],
            stop: LabStop::None,
        };
        let report = run(scenario, None, &catalog).unwrap();
        let mut report: serde_json::Value =
            serde_json::from_slice(&serde_json::to_vec(&report.report()).unwrap()).unwrap();
        assert_eq!(verify_report(report.clone(), &catalog).unwrap(), 10);
        assert!(report["samples"].as_array().unwrap().last().unwrap()["watershed"]
            ["river_flow_liters_per_day"].as_f64().unwrap() > 0.0);
        assert_eq!(report["trends"]["omitted"], 0);
        assert_eq!(report["trends"]["samples"].as_array().unwrap().len(), 1);
        let mut changed_trend = report.clone();
        changed_trend["trends"]["samples"][0]["food_units"] = 0.into();
        assert!(verify_report(changed_trend, &catalog).is_err());
        let mut legacy = report.clone();
        legacy.as_object_mut().unwrap().remove("trends");
        legacy["version"] = 6.into();
        assert_eq!(verify_report(legacy.clone(), &catalog).unwrap(), 10);
        legacy["version"] = 3.into();
        for sample in legacy["samples"].as_array_mut().unwrap() {
            let fields = sample.as_object_mut().unwrap();
            fields.remove("inventory");
            fields.remove("spoiled");
        }
        assert_eq!(verify_report(legacy.clone(), &catalog).unwrap(), 10);
        legacy["version"] = 2.into();
        for sample in legacy["samples"].as_array_mut().unwrap() {
            sample.as_object_mut().unwrap().remove("weather");
        }
        assert_eq!(verify_report(legacy.clone(), &catalog).unwrap(), 10);
        legacy["version"] = 1.into();
        for sample in legacy["samples"].as_array_mut().unwrap() {
            sample.as_object_mut().unwrap().remove("watershed");
        }
        legacy
            .pointer_mut("/village/construction/utilities/ground")
            .unwrap()
            .as_object_mut()
            .unwrap()
            .remove("account");
        assert_eq!(verify_report(legacy, &catalog).unwrap(), 10);
        assert_eq!(
            report["samples"][0]["inventory"]["wood"],
            report["samples"][0]["timber"]
        );
        report["samples"][0]["spoiled"]["food"] = 1.into();
        assert!(
            verify_report(report, &catalog)
                .unwrap_err()
                .to_string()
                .contains("diverged")
        );
    }

    #[test]
    fn interactive_water_stop_pauses_without_changing_the_replay_scenario() {
        let catalog = Catalog::default();
        let mut first = Runner::new(
            Scenario {
                steps: 1,
                setup: None,
                orders: Vec::new(),
                stop: LabStop::None,
            },
            None,
            &catalog,
        )
        .unwrap();
        first.advance(&catalog);
        first
            .village
            .construction
            .utilities
            .take_water(Some(0), 0, 40.0);
        let mut runner = Runner::new(
            Scenario {
                steps: 12,
                setup: None,
                orders: Vec::new(),
                stop: LabStop::None,
            },
            Some(first.village),
            &catalog,
        )
        .unwrap();
        let mut playback = Playback::default();
        for _ in 0..4 {
            playback.cycle_stop();
        }
        playback.start_interval(0, 12, 0.3, "test interval");
        playback.advance_frame(&mut runner, &catalog, 12, 0.1);
        assert!(!playback.running);
        assert_eq!(runner.index, 0);
        assert!(playback.notice.contains("Less than 0.5 L"));
        assert!(runner.reason.is_none());
        let partial =
            serde_json::from_slice(&serde_json::to_vec(&runner.report()).unwrap()).unwrap();
        assert_eq!(verify_report(partial, &catalog).unwrap(), 0);

        playback.cycle_stop();
        playback.cycle_stop();
        playback.start_interval(0, 12, 0.3, "test interval");
        while playback.running {
            playback.advance_frame(&mut runner, &catalog, 12, 0.1);
        }
        assert_eq!(runner.index, 3);
    }

    #[test]
    fn water_stop_counts_drinking_water_in_a_switched_off_well() {
        use crate::utilities::Facility;

        let mut construction = Construction::default();
        construction.utilities.sync(std::iter::once(Facility {
            id: 1,
            kind: "well",
            location: IVec2::new(42, -13),
            size: IVec2::ONE,
            batteries: 0,
            panels: 0,
            working: false,
        }));
        construction.utilities.take_water(Some(0), 0, 40.0);
        assert_eq!(construction.utilities.deliver_water(1, 0, 2.0), 2.0);
        construction.utilities.toggle(0);
        assert_eq!(construction.utilities.potable_at(1), 0.0);
        assert_eq!(construction.utilities.stored_drinking_water(), 2.0);
        assert!(construction.lab_stop_reason(LabStop::Water, 0.0).is_none());
    }

    #[test]
    fn the_water_stop_includes_the_final_sample_and_skips_future_orders() {
        let catalog = Catalog::default();
        let first = run(
            Scenario {
                steps: 1,
                setup: None,
                orders: Vec::new(),
                stop: LabStop::None,
            },
            None,
            &catalog,
        )
        .unwrap();
        let mut village = first.village;
        village.construction.utilities.take_water(Some(0), 0, 40.0);
        let report = run(
            Scenario {
                steps: 100,
                setup: None,
                orders: vec![ScheduledOrder {
                    step: 1,
                    order: LabOrder::Grid { enabled: false },
                }],
                stop: LabStop::Water,
            },
            Some(village),
            &catalog,
        )
        .unwrap();
        assert_eq!(report.index, 0);
        assert!(report.reason.is_some());
        assert_eq!(report.samples[0].potable_liters, 0.0);
        assert!(report.outcomes.is_empty());
    }
}
