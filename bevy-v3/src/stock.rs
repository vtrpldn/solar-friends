use std::collections::BTreeMap;

use crate::setup::WorldSetup;

#[derive(Default)]
pub struct Stock {
    pub cash: u32,
    materials: BTreeMap<&'static str, u32>,
}

impl Stock {
    pub fn for_start(settings: &WorldSetup) -> Self {
        let (numerator, denominator) = settings.supply_scale();
        let mut materials = [
            ("tools", 4),
            ("meals", 20),
            ("food", 12),
            ("hardware", 7),
            ("roofing", 8),
            ("tarp", 1),
            ("tank", 1),
            ("plumbing", 1),
            ("sanitation", 1),
        ]
        .into_iter()
        .map(|(id, units)| (id, (units * numerator).div_ceil(denominator)))
        .collect::<BTreeMap<_, _>>();
        materials.insert("wood", (36 * numerator + denominator / 2) / denominator);
        Self {
            cash: settings.starting_cash(),
            materials,
        }
    }

    pub fn available(&self, id: &str) -> u32 {
        self.materials.get(id).copied().unwrap_or(0)
    }
}
