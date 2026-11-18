use serde::{Deserialize, Serialize};

#[derive(Default, Deserialize, Serialize)]
pub struct Production {
    pub jobs: Vec<Batch>,
    #[serde(skip)]
    pub open: bool,
    #[serde(skip)]
    pub selected: Option<usize>,
    #[serde(skip)]
    pub notice: String,
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
    pub delivered_output: Option<std::collections::BTreeMap<String, u32>>,
}

#[derive(Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
pub enum Phase {
    Pickup,
    Approach,
    Work,
    Return,
}

impl Production {
    pub fn has_worker(&self, index: usize) -> bool {
        self.jobs.iter().any(|job| job.worker == Some(index))
    }
}
