mod map;

use std::{io, path::Path};

use serde::{Deserialize, Serialize};

use super::*;
use crate::construction::{LabOrder, LabStop};

#[derive(Deserialize, Serialize)]
struct Scenario {
    steps: u64,
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
    let scenario = serde_json::from_slice(&input)?;
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

const STEP: f64 = 0.1;
const SAMPLE_LIMIT: usize = 2160;

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
        let village = village.unwrap_or_else(|| {
            let setup = WorldSetup::default().session();
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
            let error = self
                .village
                .construction
                .lab_order(
                    catalog,
                    &mut self.village.stock,
                    ground,
                    clock,
                    &order.order,
                )
                .err();
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
                potable_liters: self.village.construction.potable_liters(),
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
    let catalog = Catalog::default();
    let (scenario, village) = load_inputs(scenario, save, &catalog)?;
    let runner = Runner::new(scenario, village, &catalog)?;
    open_lab(catalog, runner, None);
    Ok(())
}

pub(crate) fn replay_ui(path: &Path) -> io::Result<()> {
    let bytes = crate::save::read_bytes(path, 3 * crate::save::MAX_BYTES)?;
    let catalog = Catalog::default();
    let (runner, replay) = prepare_replay(serde_json::from_slice(&bytes)?, &catalog)?;
    open_lab(catalog, runner, Some(replay));
    Ok(())
}

fn open_lab(catalog: Catalog, runner: Runner, replay: Option<Replay>) {
    let mut app = App::new();
    if let Some(replay) = replay {
        app.insert_resource(replay);
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
        .init_resource::<map::MapVisible>()
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
        LabOrder::Build { key, x, z, .. } => format!("Build {key} at ({x}, {z})"),
        LabOrder::Produce { site, recipe } => format!("Produce {recipe} at project #{site}"),
        LabOrder::Buy { material, freight } => {
            let transport = if *freight { "freight" } else { "pickup" };
            format!("Buy {material} by {transport}")
        }
        LabOrder::Sell { material } => format!("Sell {material}"),
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
        LabOrder::Outside {
            resident, enabled, ..
        } => format!(
            "{} town work for resident {resident}",
            toggle_label(*enabled)
        ),
        LabOrder::FoodPolicy { enabled } => format!("{} food restocking", toggle_label(*enabled)),
        LabOrder::Grid { enabled } => format!("{} grid power", toggle_label(*enabled)),
        LabOrder::CollectWater { site } => format!("Collect river water for site #{site}"),
        LabOrder::Purify { site } => format!("Purify water at site #{site}"),
        LabOrder::ServiceWater { site } => format!("Service wastewater at site #{site}"),
    }
}

fn toggle_label(enabled: bool) -> &'static str {
    if enabled { "Enable" } else { "Disable" }
}

struct Playback {
    running: bool,
    replaying: bool,
    speed: usize,
    debt: f64,
    order: Option<String>,
    notice: String,
    view: LabView,
    inventory_page: usize,
    job_focus: Option<usize>,
    waiting_only: bool,
    farm_site: Option<usize>,
    clear_confirmation: Option<(usize, Option<usize>)>,
}

impl Default for Playback {
    fn default() -> Self {
        Self {
            running: false,
            replaying: false,
            speed: 2,
            debt: 0.0,
            order: None,
            notice: String::new(),
            view: LabView::default(),
            inventory_page: 0,
            job_focus: None,
            waiting_only: false,
            farm_site: None,
            clear_confirmation: None,
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
    time: Res<Time>,
    (keys, mut events): (
        Res<ButtonInput<KeyCode>>,
        MessageReader<bevy::input::keyboard::KeyboardInput>,
    ),
    mut playback: Local<Playback>,
    mut panel: Single<&mut Text>,
    (mut replay, mut map): (Option<ResMut<Replay>>, ResMut<map::MapVisible>),
) {
    playback.replaying = replay.is_some();
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
            playback.debt = 0.0;
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
        map.set_if_neq(map::MapVisible(false));
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
    map.set_if_neq(map::MapVisible(playback.view == LabView::Map));
    if keys.just_pressed(KeyCode::PageDown) {
        playback.inventory_page = playback.inventory_page.saturating_add(1);
    } else if keys.just_pressed(KeyCode::PageUp) {
        playback.inventory_page = playback.inventory_page.saturating_sub(1);
    }
    let rates = [1, 8, 32, 128];
    for (index, key) in [
        KeyCode::Digit1,
        KeyCode::Digit2,
        KeyCode::Digit3,
        KeyCode::Digit4,
    ]
    .into_iter()
    .enumerate()
    {
        if keys.just_pressed(key)
            && !(playback.view == LabView::Beds
                && keys.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]))
        {
            playback.speed = index;
            playback.debt = 0.0;
        }
    }
    if keys.just_pressed(KeyCode::Space) && !reached_end(&runner) {
        playback.running = !playback.running;
        playback.debt = 0.0;
    }
    if keys.just_pressed(KeyCode::KeyJ) && !playback.running && !reached_end(&runner) {
        runner.advance(&catalog);
    }
    if playback.running {
        let speed = f64::from(rates[playback.speed]);
        playback.debt = (playback.debt + time.delta_secs_f64().min(0.25) * speed).min(speed * 2.0);
        let start = std::time::Instant::now();
        while playback.debt >= STEP && !reached_end(&runner) && start.elapsed().as_millis() < 8 {
            runner.advance(&catalog);
            playback.debt -= STEP;
        }
    }
    if reached_end(&runner) {
        playback.running = false;
        if let Some(replay) = replay.as_deref_mut()
            && let Some(expected) = replay.expected.take()
        {
            playback.notice = match compare_replay(&runner, expected, replay.version) {
                Ok(()) => format!("Replay matched through step {}.", runner.index),
                Err(error) => error.to_string(),
            };
        }
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
            "Village map\nTab Switch view\nBlue Camp · Cream Residents · Green Completed · Gold Construction".into()
        } else {
            lab_inventory(
                &catalog,
                &village.stock,
                &playback.view,
                &mut playback.inventory_page,
            )
        };
        panel.set_if_neq(Text::new(format!(
            "Simulation lab · {status} · Step {} / {}\nSpace Run/Pause · J Single step · {order_control}F5 Report · F6 Checkpoint\n{}\n\n{details}",
            runner.index, limit, playback.notice,
        )));
        return;
    }
    let weather = lab_weather(village, &runner.setup);
    let spoiled = village
        .stock
        .pantry
        .spoiled
        .values()
        .copied()
        .fold(0, u64::saturating_add);
    let text = format!(
        "Simulation lab · {status}\nStep {} / {} · {:.1} simulation seconds · {}×\nSpace Run/Pause · J Single step · 1–4 Speed\n{order_control}F5 Export report · F6 Checkpoint · Tab Browse lab views\n{}\n\nR${:.2} · {} timber · {} meals · {:.1} L drinking water · {spoiled} units spoiled\nWeather · {:.1} °C · {:.2} mm/h rain · {:.0}% cloud\n{}\n{last}\n\n{}",
        runner.index,
        limit,
        village.clock,
        rates[playback.speed],
        playback.notice,
        village.stock.balance() as f64 / 100.0,
        village.stock.available("wood"),
        village.stock.available("meals"),
        village.construction.potable_liters(),
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
    fn partial_reports_replay_through_the_exported_step_only() {
        let catalog = Catalog::default();
        let scenario = Scenario {
            steps: 5_000,
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
            .init_resource::<map::MapVisible>()
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
    fn a_lab_checkpoint_restores_the_current_village_for_a_new_run() {
        let catalog = Catalog::default();
        let scenario = || Scenario {
            steps: 3,
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
    fn the_water_stop_includes_the_final_sample_and_skips_future_orders() {
        let catalog = Catalog::default();
        let first = run(
            Scenario {
                steps: 1,
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
