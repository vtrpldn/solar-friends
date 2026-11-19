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
    let Some(version @ 1..=6) = expected.get("version").and_then(serde_json::Value::as_u64) else {
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
    if version < 6 {
        actual["version"] = version.into();
        if let Some(jobs) = actual
            .pointer_mut("/village/construction/production/jobs")
            .and_then(serde_json::Value::as_array_mut)
        {
            for job in jobs {
                job.as_object_mut()
                    .expect("production job")
                    .remove("waiting_for_access");
            }
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
            let setup = scenario.setup.clone().unwrap_or_default().session();
            Village {
                setup: Some(setup.clone()),
                camp: Some(CAMP_SITES[2].1),
                arrival_time: ARRIVAL_DURATION,
                stock: Stock::for_start(&setup, catalog),
                ..default()
            }
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
            outcomes: Vec::new(),
            reason: None,
            stride,
        };
        runner.observe(catalog);
        Ok(runner)
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
            version: 6,
            scenario: &self.scenario,
            initial: &self.initial,
            step_seconds: STEP,
            end_step: self.index,
            partial: !self.done(),
            stop_reason: self.reason,
            samples: &self.samples,
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

    fn export(&self) -> io::Result<std::path::PathBuf> {
        let path = self.output_path("report")?;
        let bytes = serde_json::to_vec(&self.report())?;
        crate::save::atomic_write(&path, &bytes, 3 * crate::save::MAX_BYTES)?;
        Ok(path)
    }
}

fn run(scenario: Scenario, village: Option<Village>, catalog: &Catalog) -> io::Result<Runner> {
    let mut runner = Runner::new(scenario, village, catalog)?;
    while !runner.done() {
        runner.advance(catalog);
    }
    Ok(runner)
}

pub(crate) fn run_ui(scenario: &Path, save: Option<&Path>) -> io::Result<()> {
    let source = LabSource {
        scenario: scenario.to_owned(),
        checkpoint: save.map(Path::to_owned),
    };
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
struct LabSource {
    scenario: PathBuf,
    checkpoint: Option<PathBuf>,
}

impl LabSource {
    fn load(&self, catalog: &Catalog) -> io::Result<Runner> {
        let (scenario, village) = load_inputs(&self.scenario, self.checkpoint.as_deref(), catalog)?;
        Runner::new(scenario, village, catalog)
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

fn setup_lab_window(mut commands: Commands, assets: Res<AssetServer>) {
    commands.spawn(Camera2d);
    commands.spawn((
        Text::default(),
        ui_font(&assets, 18.0),
        Node {
            margin: UiRect::all(px(24)),
            ..default()
        },
    ));
}

#[derive(Default, PartialEq, Eq)]
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
            Self::Map => Self::Overview,
        }
    }
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

struct Playback {
    running: bool,
    replaying: bool,
    speed: usize,
    debt: f64,
    speed_meter: SpeedMeter,
    interval: usize,
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
    reload_confirmation: bool,
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

    fn interval_controls(&self) -> String {
        if self.replaying {
            return String::new();
        }
        format!(
            "F2 Interval {} · F3 Run interval · Shift+J Advance 1h\nF4 Extra stop · {}\n",
            RUN_INTERVALS[self.interval].1, PLAYBACK_STOPS[self.stop].1
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
            reload_confirmation: false,
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
        .bed_status(site, index, runner.village.clock)
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

fn update_lab_window(
    mut runner: ResMut<Runner>,
    catalog: Res<Catalog>,
    time: Res<Time<bevy::time::Real>>,
    (keys, mut events): (
        Res<ButtonInput<KeyCode>>,
        MessageReader<bevy::input::keyboard::KeyboardInput>,
    ),
    mut playback: Local<Playback>,
    mut panel: Single<&mut Text>,
    (mut replay, mut map, source): (
        Option<ResMut<Replay>>,
        ResMut<map::MapState>,
        Option<Res<LabSource>>,
    ),
) {
    playback.replaying = replay.is_some();
    if let Some(source) = &source
        && playback.order.is_none()
    {
        if playback.reload_confirmation && keys.just_pressed(KeyCode::Escape) {
            playback.reload_confirmation = false;
        } else if keys.just_pressed(KeyCode::F8) {
            if playback.reload_confirmation {
                playback.reload_confirmation = false;
                match source.load(&catalog) {
                    Ok(reloaded) => {
                        *runner = reloaded;
                        *playback = Playback::default();
                        *map = map::MapState::default();
                        playback.notice = "Scenario reloaded at step 0.".into();
                    }
                    Err(error) => playback.notice = format!("Could not reload scenario · {error}"),
                }
            } else {
                playback.running = false;
                playback.reset_timing();
                playback.reload_confirmation = true;
            }
        }
        if playback.reload_confirmation {
            map.visible = false;
            events.clear();
            panel.set_if_neq(Text::new(
                "Reload scenario?\nF8 Confirm · Esc Cancel\nThis replaces the current lab run and its unsaved orders.",
            ));
            return;
        }
    }
    let limit = replay
        .as_ref()
        .map_or(runner.scenario.steps, |replay| replay.limit);
    let reached_end = |runner: &Runner| runner.index >= limit || runner.done();
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
        if keys.just_pressed(KeyCode::F6) {
            playback.notice = match runner.output_path("checkpoint").and_then(|path| {
                runner.checkpoint(&path)?;
                Ok(path)
            }) {
                Ok(path) => format!("Checkpoint saved to {}", path.display()),
                Err(error) => format!("Could not save checkpoint · {error}"),
            };
        }
        if keys.just_pressed(KeyCode::F5) {
            playback.notice = match runner.export() {
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
    if keys.just_pressed(KeyCode::Tab) {
        playback.view = playback.view.next();
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
    if keys.just_pressed(KeyCode::PageDown) {
        playback.inventory_page = playback.inventory_page.saturating_add(1);
    } else if keys.just_pressed(KeyCode::PageUp) {
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
    if keys.just_pressed(KeyCode::Space) && !reached_end(&runner) {
        playback.running = !playback.running;
        playback.reset_timing();
    }
    if !playback.replaying && keys.just_pressed(KeyCode::F4) {
        playback.cycle_stop();
    }
    if !playback.replaying && keys.just_pressed(KeyCode::F2) {
        playback.interval = (playback.interval + 1) % RUN_INTERVALS.len();
    }
    if !playback.replaying && !reached_end(&runner) {
        if keys.just_pressed(KeyCode::F3) {
            let (days, label) = RUN_INTERVALS[playback.interval];
            playback.start_interval(runner.index, limit, days * crate::weather::DAY, label);
        } else if keys.just_pressed(KeyCode::KeyJ)
            && keys.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight])
        {
            playback.start_interval(runner.index, limit, crate::weather::HOUR, "one hour");
        }
    }
    if keys.just_pressed(KeyCode::KeyJ) && !playback.running && !reached_end(&runner) {
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
        && let Some((order, success)) = map.service_order(&runner, &keys)
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
            if keys.just_pressed(KeyCode::KeyW) {
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
            let forward = keys.just_pressed(KeyCode::BracketRight);
            if forward || keys.just_pressed(KeyCode::BracketLeft) {
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
                        .lab_map_project_status(&catalog, project)
                })
                .or_else(|| {
                    map.resource
                        .and_then(|site| map::resource_status(&runner, &catalog, site))
                })
                .unwrap_or_else(|| "Click a project or resource to inspect it".into());
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
                " · B Build".into()
            } else {
                String::new()
            };
            let water = map.water_details(&runner, !playback.replaying && !runner.done());
            format!(
                "Village map · {selection}\nTab Switch view · Enter Inspect selected jobs{gather}{build}\nBlue Camp · Cream Residents · Green Completed · Gold Construction · Purple Resources{water}"
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
            "Simulation lab · {status} · Step {} / {} · {}\nSpace Run/Pause · J Single step · 1–9 Speed · {order_control}F5 Report · F6 Checkpoint\n{interval_controls}{}\n\n{details}",
            runner.index, limit, playback.speed_label(), playback.notice,
        )));
        return;
    }
    let weather = lab_weather(village, &runner.setup);
    let reload_control = if source.is_some() {
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
        "Simulation lab · {status}\nStep {} / {} · {:.1} simulation seconds · {}\nSpace Run/Pause · J Single step · 1–9 Speed\n{order_control}F5 Export report · F6 Checkpoint{reload_control} · Tab Browse lab views\n{interval_controls}{}\n\nR${:.2} · {} timber · {} meals · {:.1} L drinking water · {spoiled} units spoiled\nWeather · {:.1} °C · {:.2} mm/h rain · {:.0}% cloud\n{}\n{last}\n\n{}",
        runner.index,
        limit,
        village.clock,
        playback.speed_label(),
        playback.notice,
        village.stock.balance() as f64 / 100.0,
        village.stock.available("wood"),
        village.stock.available("meals"),
        village.construction.utilities.stored_drinking_water(),
        weather.temperature_c,
        weather.rainfall_mm_per_hour,
        weather.cloud_cover * 100.0,
        village.construction.utilities.water_summary(),
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
            .add_systems(Update, update_lab_window);
        let panel = app.world_mut().spawn(Text::default()).id();
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
        key(&mut app, KeyCode::KeyJ);
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
        let source = LabSource {
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
            .add_systems(Update, update_lab_window);
        let panel = app.world_mut().spawn(Text::default()).id();
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
        press_reload(&mut app);
        let reloaded = app.world().resource::<Runner>();
        assert_eq!(reloaded.index, 0);
        assert_eq!(reloaded.scenario.steps, 8);
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
        let mut legacy = report.clone();
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
