pub mod crafting;
pub mod growth;

use serde::{Deserialize, Serialize};

#[derive(Default, Deserialize, Serialize)]
pub struct Production {
    pub jobs: Vec<Batch>,
    #[serde(skip)]
    pub open: bool,
    #[serde(skip)]
    pub selected: Option<usize>,
    #[serde(skip)]
    pub page: usize,
    #[serde(skip)]
    pub notice: String,
    #[serde(default)]
    pub growing_sites: std::collections::BTreeMap<usize, growth::Ground>,
}

#[derive(Deserialize, Serialize)]
pub struct Batch {
    pub site: usize,
    pub recipe: String,
    pub worker: Option<usize>,
    pub phase: Phase,
    pub work: f64,
    pub retry_at: f64,
    #[serde(default)]
    pub water_to_deliver: f64,
    #[serde(default)]
    pub food_input: Option<crate::food::FoodLots>,
    #[serde(default)]
    pub food_output: Option<crate::food::FoodLots>,
    #[serde(default)]
    pub delivered_output: Option<std::collections::BTreeMap<String, u32>>,
    #[serde(default)]
    pub growth: Option<growth::Growth>,
    #[serde(default)]
    pub watered: bool,
    #[serde(default)]
    pub using_biogas: bool,
}

#[derive(Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
pub enum Phase {
    Pickup,
    Approach,
    Work,
    Return,
    Growing,
    Harvest,
}

impl Production {
    pub fn has_worker(&self, index: usize) -> bool {
        self.jobs.iter().any(|job| job.worker == Some(index))
    }
}
