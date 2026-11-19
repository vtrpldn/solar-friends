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
    residents: String,
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

fn verify_report(mut expected: serde_json::Value, catalog: &Catalog) -> io::Result<u64> {
    if expected.get("version").and_then(serde_json::Value::as_u64) != Some(1) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Unsupported lab report version.",
        ));
    }
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
    let report = run(serde_json::from_value(scenario)?, Some(village), catalog)?;
    let end_step = report.index;
    let mut actual: serde_json::Value =
        serde_json::from_slice(&serde_json::to_vec(&report.report())?)?;
    actual["initial"] = serde_json::Value::Null;
    actual["scenario"] = serde_json::Value::Null;
    if actual != expected {
        return Err(io::Error::other(
            "Replay diverged from the recorded results.",
        ));
    }
    Ok(end_step)
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
                residents: self.village.construction.resident_status(
                    catalog,
                    &self.village.stock,
                    0,
                ),
            });
        }
    }

    fn submit(&mut self, catalog: &Catalog, order: LabOrder) -> Result<(), &'static str> {
        if self.done() {
            return Err("The scenario is complete.");
        }
        self.scenario.orders.insert(
            self.next_order,
            ScheduledOrder {
                step: self.index,
                order,
            },
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

    fn report(&self) -> Report<'_> {
        Report {
            version: 1,
            scenario: &self.scenario,
            initial: &self.initial,
            step_seconds: STEP,
            end_step: self.index,
            stop_reason: self.reason,
            samples: &self.samples,
            orders: &self.outcomes,
            village: &self.village,
        }
    }

    fn export(&self) -> io::Result<std::path::PathBuf> {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(io::Error::other)?;
        let path = crate::save::location(self.setup.mode)?
            .with_file_name(format!("lab-report-{}.json", nonce.as_nanos()));
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
    App::new()
        .insert_resource(catalog)
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
        .add_systems(Update, update_lab_window)
        .run();
    Ok(())
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

struct Playback {
    running: bool,
    speed: usize,
    debt: f64,
    order: Option<String>,
    notice: String,
}

impl Default for Playback {
    fn default() -> Self {
        Self {
            running: false,
            speed: 2,
            debt: 0.0,
            order: None,
            notice: String::new(),
        }
    }
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
) {
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
        if keys.just_pressed(KeyCode::KeyO) && !runner.done() {
            playback.running = false;
            playback.debt = 0.0;
            playback.notice.clear();
            playback.order = Some(String::new());
        }
        if keys.just_pressed(KeyCode::F5) && runner.done() {
            playback.notice = match runner.export() {
                Ok(path) => format!("Report saved to {}", path.display()),
                Err(error) => format!("Could not export report · {error}"),
            };
        }
    }
    if let Some(order) = &playback.order {
        panel.set_if_neq(Text::new(format!(
            "Order at step {}\nEnter Submit · Esc Cancel\n\nExample {{\"type\":\"grid\",\"enabled\":false}}\n\n{order}▏\n{}",
            runner.index, playback.notice
        )));
        return;
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
        if keys.just_pressed(key) {
            playback.speed = index;
            playback.debt = 0.0;
        }
    }
    if keys.just_pressed(KeyCode::Space) && !runner.done() {
        playback.running = !playback.running;
        playback.debt = 0.0;
    }
    if keys.just_pressed(KeyCode::KeyJ) && !playback.running {
        runner.advance(&catalog);
    }
    if playback.running {
        let speed = f64::from(rates[playback.speed]);
        playback.debt = (playback.debt + time.delta_secs_f64().min(0.25) * speed).min(speed * 2.0);
        let start = std::time::Instant::now();
        while playback.debt >= STEP && !runner.done() && start.elapsed().as_millis() < 8 {
            runner.advance(&catalog);
            playback.debt -= STEP;
        }
    }
    if runner.done() {
        playback.running = false;
    }
    let village = &runner.village;
    let status = runner.reason.unwrap_or(if runner.done() {
        "Scenario complete"
    } else if playback.running {
        "Running"
    } else {
        "Paused"
    });
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
    let text = format!(
        "Simulation lab · {status}\nStep {} / {} · {:.1} simulation seconds · {}×\nSpace Run/Pause · J Single step · 1–4 Speed\nO Enter order · F5 Export completed report\n{}\n\nR${:.2} · {} timber · {} meals · {:.1} L drinking water\n{last}\n\n{}",
        runner.index,
        runner.scenario.steps,
        village.clock,
        rates[playback.speed],
        playback.notice,
        village.stock.balance() as f64 / 100.0,
        village.stock.available("wood"),
        village.stock.available("meals"),
        village.construction.potable_liters(),
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
        report["samples"][0]["cash_centavos"] = 0.into();
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
