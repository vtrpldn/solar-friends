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
struct Report {
    version: u32,
    scenario: Scenario,
    initial: serde_json::Value,
    step_seconds: f64,
    end_step: u64,
    stop_reason: Option<&'static str>,
    samples: Vec<Sample>,
    orders: Vec<Outcome>,
    village: Village,
}

pub(crate) fn run_file(scenario: &Path, save: Option<&Path>) -> io::Result<()> {
    let catalog = Catalog::default();
    let input = crate::save::read_bytes(scenario, 1024 * 1024)?;
    let scenario = serde_json::from_slice(&input)?;
    let village = save
        .map(|path| crate::save::read(path, &catalog))
        .transpose()?;
    let report = run(scenario, village, &catalog)?;
    serde_json::to_writer(io::stdout().lock(), &report)?;
    Ok(())
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
    let end_step = report.end_step;
    let mut actual: serde_json::Value = serde_json::from_slice(&serde_json::to_vec(&report)?)?;
    actual["initial"] = serde_json::Value::Null;
    actual["scenario"] = serde_json::Value::Null;
    if actual != expected {
        return Err(io::Error::other(
            "Replay diverged from the recorded results.",
        ));
    }
    Ok(end_step)
}

fn run(scenario: Scenario, village: Option<Village>, catalog: &Catalog) -> io::Result<Report> {
    const SAMPLE_LIMIT: usize = 2160;
    const STEP: f64 = 0.1;
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
    let mut village = village.unwrap_or_else(|| {
        let setup = WorldSetup::default().session();
        Village {
            setup: Some(setup.clone()),
            camp: Some(CAMP_SITES[2].1),
            arrival_time: ARRIVAL_DURATION,
            stock: Stock::for_start(&setup, catalog),
            ..default()
        }
    });
    let initial = serde_json::to_value(&village)?;
    let camp = village
        .camp
        .ok_or_else(|| io::Error::other("Place camp before running the lab."))?;
    let setup = village
        .setup
        .as_ref()
        .ok_or_else(|| io::Error::other("Village setup is missing."))?
        .clone();
    let land = Land::generate(&setup);
    let mut orders = scenario.orders.iter().peekable();
    let mut outcomes = Vec::new();
    let mut samples = Vec::new();
    let stride = scenario.steps.div_ceil((SAMPLE_LIMIT - 1) as u64).max(1);
    let mut terrain = village.terrain(&setup);
    let mut terrain_key = village.terrain_key();
    let mut index = 0;
    let (end_step, stop_reason) = loop {
        while orders.peek().is_some_and(|order| order.step == index) {
            let order = orders.next().expect("scheduled order");
            let ground = ConstructionSite {
                terrain: &terrain,
                land: &land,
                camp,
            };
            let clock = TownClock {
                seconds: village.clock,
                round_trip_km: setup.round_trip_km(),
            };
            let error = village
                .construction
                .lab_order(catalog, &mut village.stock, ground, clock, &order.order)
                .err();
            outcomes.push(Outcome { step: index, error });
            if village.terrain_key() != terrain_key {
                terrain = village.terrain(&setup);
                terrain_key = village.terrain_key();
            }
        }
        let reason = village
            .construction
            .lab_stop_reason(scenario.stop, village.clock);
        if reason.is_some() || index == scenario.steps || index.is_multiple_of(stride) {
            samples.push(Sample {
                step: index,
                seconds: village.clock,
                cash_centavos: village.stock.balance(),
                timber: village.stock.available("wood"),
                meals: village.stock.available("meals"),
                potable_liters: village.construction.potable_liters(),
                minimum_hydration: village.construction.minimum_hydration(),
                residents: village
                    .construction
                    .resident_status(catalog, &village.stock, 0),
            });
        }
        if reason.is_some() || index == scenario.steps {
            break (index, reason);
        }
        step(
            &mut village,
            catalog,
            &setup,
            ConstructionSite {
                terrain: &terrain,
                land: &land,
                camp,
            },
            STEP,
        );
        if village.terrain_key() != terrain_key {
            terrain = village.terrain(&setup);
            terrain_key = village.terrain_key();
        }
        index += 1;
    };
    Ok(Report {
        version: 1,
        scenario,
        initial,
        step_seconds: STEP,
        end_step,
        stop_reason,
        samples,
        orders: outcomes,
        village,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

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
            report.orders[..3].iter().all(|order| order.error.is_none()),
            "{:?}",
            report
                .orders
                .iter()
                .map(|order| &order.error)
                .collect::<Vec<_>>()
        );
        assert!(
            report.orders[3]
                .error
                .as_deref()
                .unwrap()
                .contains("current bed job")
        );
        assert!(report.orders[4].error.is_none());
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
            serde_json::from_slice(&serde_json::to_vec(&report).unwrap()).unwrap();
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
        assert_eq!(report.end_step, 0);
        assert!(report.stop_reason.is_some());
        assert_eq!(report.samples[0].potable_liters, 0.0);
        assert!(report.orders.is_empty());
    }
}
