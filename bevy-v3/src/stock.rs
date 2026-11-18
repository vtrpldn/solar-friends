use std::collections::BTreeMap;

use crate::{catalog::Catalog, setup::WorldSetup};

#[derive(Default)]
pub struct Stock {
    pub cash: u32,
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
            materials,
        }
    }

    pub fn available(&self, id: &str) -> u32 {
        self.materials.get(id).copied().unwrap_or(0)
    }

    pub fn reserve(&mut self, bill: &BTreeMap<String, u32>) -> Result<(), String> {
        if let Some((id, _)) = bill.iter().find(|(id, count)| self.available(id) < **count) {
            return Err(id.clone());
        }
        for (id, units) in bill {
            *self.materials.entry(id.clone()).or_default() -= *units;
        }
        Ok(())
    }
}
