//! Bounded one-shot scenario events, with durable effect receipts.
use super::*;
pub const MAX_EVENTS: usize = 64;
mod model;
mod runtime;
mod supplies;
mod unlocks;
mod validation;
pub use model::*;
pub use runtime::{advance, initialize, valid, view};
pub use unlocks::check as check_unlocks;
pub use validation::check;
#[cfg(test)]
mod tests;
pub fn catalog() -> serde_json::Value {
    serde_json::json!({"maximum":MAX_EVENTS,"condition_nodes":MAX_CONDITION_NODES,"repetition":"once","trigger_examples":[EventTrigger::Start,EventTrigger::Goal{goal:"earlier-goal".into()},EventTrigger::Chapter{chapter:"chapter-one".into()},EventTrigger::Date{minute:1440.},EventTrigger::Threshold{condition:GoalCondition::Funds{cents:30_000}}],"effect_examples":[EventEffect::Message{text:"Our neighbours have news.".into()},EventEffect::GrantFunds{cents:10_000},EventEffect::UnlockBuilding{building:"home".into()},EventEffect::DeliverSupplies{material:"timber".into(),count:12,building:None}],"maximum_delivery_units":economy::CAPACITY,"maximum_grant_cents":100_000_000,"note":"Eligibility is sampled before any effects. Events apply in authored order, once. Queued grants and supplies wait for full destination capacity; supplies also require clear access and never redirect when a destination disappears; earlier effects cannot trigger another event until a later observation."})
}
