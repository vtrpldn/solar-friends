use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::{
    catalog::Catalog,
    setup::{Mode, WorldSetup},
};

#[derive(Default, Deserialize, Serialize)]
pub struct Stock {
    pub cash: u32,
    #[serde(default)]
    centavos: u8,
    #[serde(default)]
    pub sandbox: bool,
    materials: BTreeMap<String, u32>,
}

impl Stock {
    pub fn for_start(settings: &WorldSetup, catalog: &Catalog) -> Self {
        let (numerator, denominator) = settings.supply_scale();
        let materials = catalog
            .materials
            .iter()
            .map(|(id, material)| {
                let scaled = material.starting * numerator;
                let count = if id == "wood" {
                    (scaled + denominator / 2) / denominator
                } else {
                    scaled.div_ceil(denominator)
                };
                (id.clone(), count)
            })
            .collect();
        Self {
            cash: settings.starting_cash(),
            centavos: 0,
            sandbox: settings.mode == Mode::Sandbox,
            materials,
        }
    }

    pub fn available(&self, id: &str) -> u32 {
        self.materials.get(id).copied().unwrap_or(0)
    }

    pub fn receive(&mut self, goods: &BTreeMap<String, u32>) {
        for (id, units) in goods {
            let count = self.materials.entry(id.clone()).or_default();
            *count = count.saturating_add(*units);
        }
    }

    pub fn balance(&self) -> u64 {
        u64::from(self.cash) * 100 + u64::from(self.centavos)
    }

    pub fn debit(&mut self, cents: u64) {
        let balance = self
            .balance()
            .checked_sub(cents)
            .expect("purchase was quoted against available balance");
        self.cash = (balance / 100) as u32;
        self.centavos = (balance % 100) as u8;
    }

    pub fn reserve_available(&mut self, bill: &BTreeMap<String, u32>) {
        for (id, units) in bill {
            let count = self.materials.entry(id.clone()).or_default();
            *count -= (*count).min(*units);
        }
    }
}
