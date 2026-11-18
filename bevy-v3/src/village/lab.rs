use std::{io, path::Path};

use serde::{Deserialize, Serialize};

use super::*;
use crate::construction::LabOrder;

#[derive(Deserialize)]
struct Scenario {
    steps: u64,
    #[serde(default)]
    orders: Vec<ScheduledOrder>,
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
    for index in 0..=scenario.steps {
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
        if index == scenario.steps || index.is_multiple_of(stride) {
            samples.push(Sample {
                step: index,
                seconds: village.clock,
                cash_centavos: village.stock.balance(),
                timber: village.stock.available("wood"),
                meals: village.stock.available("meals"),
                residents: village
                    .construction
                    .resident_status(catalog, &village.stock, 0),
            });
        }
        if index < scenario.steps {
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
        }
    }
    Ok(Report {
        step_seconds: STEP,
        samples,
        orders: outcomes,
        village,
    })
}
