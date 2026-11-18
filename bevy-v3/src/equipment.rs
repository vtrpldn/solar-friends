use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

const LIFE: f64 = 1_800.0;
const SOAP_LIFE: f64 = 10.0 * 60.0 / 0.45;
pub const TOOLS: [&str; 5] = [
    "bucket",
    "garden-tools",
    "carpentry-tools",
    "harvest-basket",
    "cleaning-kit",
];

#[derive(Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
pub enum Task {
    Building(usize),
    Production(usize),
    Cultivation(usize, usize),
    Gathering(usize),
    Water(usize),
}

#[derive(Clone, Deserialize, Serialize)]
struct Loan {
    item: String,
    task: Task,
}

#[derive(Clone, Default, Deserialize, Serialize)]
pub struct Equipment {
    wear: BTreeMap<String, f64>,
    loans: [Option<Loan>; 5],
    soap_left: f64,
}

impl Equipment {
    pub fn wear(&self, item: &str) -> f64 {
        self.wear.get(item).copied().unwrap_or_default()
    }

    pub fn ready(&self, item: &str, owned: u32, worker: Option<usize>, repairing: bool) -> bool {
        let broken = (self.wear(item) / LIFE).floor() as u32;
        let held = worker.is_some_and(|index| {
            self.loans[index]
                .as_ref()
                .is_some_and(|loan| loan.item == item)
        });
        held || owned
            > broken
                .max(u32::from(repairing))
                .saturating_add(self.borrowed(item))
    }

    pub fn borrowed(&self, item: &str) -> u32 {
        self.loans
            .iter()
            .flatten()
            .filter(|loan| loan.item == item)
            .count() as u32
    }

    pub fn protected(&self, item: &str, owned: u32) -> u32 {
        owned.min(((self.wear(item) / LIFE).ceil() as u32).saturating_add(self.borrowed(item)))
    }

    pub fn repair(&mut self, item: &str) {
        let wear = self.wear.entry(item.to_owned()).or_default();
        *wear = (*wear - LIFE).max(0.0);
    }

    pub fn release(&mut self, mut active: impl FnMut(usize, Task) -> bool) {
        for (index, slot) in self.loans.iter_mut().enumerate() {
            if slot.as_ref().is_some_and(|loan| !active(index, loan.task)) {
                *slot = None;
            }
        }
    }

    pub fn use_tool(
        &mut self,
        (worker, task): (usize, Task),
        item: &str,
        dt: f64,
        owned: u32,
        (sandbox, repairing): (bool, bool),
        soap: &mut u32,
    ) -> f64 {
        if self.loans[worker]
            .as_ref()
            .is_some_and(|loan| loan.item != item || loan.task != task)
        {
            self.loans[worker] = None;
        }
        let broken = (self.wear(item) / LIFE).floor() as u32;
        if self.loans[worker].is_none() {
            if owned <= broken.max(u32::from(repairing)) + self.borrowed(item) {
                return 1.0;
            }
            self.loans[worker] = Some(Loan {
                item: item.to_owned(),
                task,
            });
        }
        if item == "cleaning-kit" {
            if self.soap_left <= 0.0 {
                if *soap == 0 {
                    self.loans[worker] = None;
                    return 1.0;
                }
                *soap -= 1;
                self.soap_left = SOAP_LIFE;
            }
            self.soap_left = (self.soap_left - dt).max(0.0);
        }
        if !sandbox {
            let wear = self.wear.entry(item.to_owned()).or_default();
            *wear = (*wear + dt).min(f64::from(owned) * LIFE);
            let broken = (*wear / LIFE).floor() as u32;
            if self.borrowed(item) > owned.saturating_sub(broken) {
                self.loans[worker] = None;
            }
        }
        1.25
    }

    pub fn summary(&self, owned: impl Fn(&str) -> u32) -> String {
        TOOLS
            .into_iter()
            .filter_map(|item| {
                let count = owned(item);
                (count > 0).then(|| {
                    let spent = (self.wear(item) / LIFE).floor() as u32;
                    format!(
                        "{} {count} ({} broken, {} loaned)",
                        item.replace('-', " "),
                        spent.min(count),
                        self.borrowed(item)
                    )
                })
            })
            .collect::<Vec<_>>()
            .join(" · ")
    }

    pub fn valid(&self, owned: impl Fn(&str) -> u32) -> bool {
        (0.0..=SOAP_LIFE).contains(&self.soap_left)
            && self.wear.iter().all(|(item, &seconds)| {
                TOOLS.contains(&item.as_str())
                    && (0.0..=f64::from(owned(item)) * LIFE).contains(&seconds)
            })
            && self
                .loans
                .iter()
                .flatten()
                .all(|loan| TOOLS.contains(&loan.item.as_str()))
    }
}
