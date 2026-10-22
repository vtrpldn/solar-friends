//! Bounded one-shot scenario events, with durable effect receipts.
use super::*;
pub const MAX_EVENTS: usize = 64;
mod model;
mod runtime;
mod validation;
pub use model::*;
pub use runtime::{advance, initialize, valid, view};
pub use validation::check;
#[cfg(test)]
mod tests;
pub fn catalog() -> serde_json::Value {
    serde_json::json!({"maximum":MAX_EVENTS,"condition_nodes":MAX_CONDITION_NODES,"repetition":"once","trigger_examples":[EventTrigger::Start,EventTrigger::Goal{goal:"earlier-goal".into()},EventTrigger::Chapter{chapter:"chapter-one".into()},EventTrigger::Date{minute:1440.},EventTrigger::Threshold{condition:GoalCondition::Funds{cents:30_000}}],"effect_examples":[EventEffect::Message{text:"Our neighbours have news.".into()},EventEffect::GrantFunds{cents:10_000}],"maximum_grant_cents":100_000_000,"note":"Eligibility is sampled before any effects. Events apply in authored order, once. A queued funding grant waits until the entire amount fits the shared fund; earlier effects cannot trigger another event until a later observation."})
}
