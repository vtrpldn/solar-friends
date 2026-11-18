use std::{io, path::Path};

use serde::{Deserialize, Serialize};

use super::*;
use crate::construction::{LabOrder, LabStop};

#[derive(Deserialize)]
struct Scenario {
    steps: u64,
    #[serde(default)]
    orders: Vec<ScheduledOrder>,
    #[serde(default)]
    stop: LabStop,
}

#[derive(Deserialize)]
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
