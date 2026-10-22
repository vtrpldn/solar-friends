//! Authored journals own goals; the village owns only their measured progress.
use super::*;
pub const MAX_CHAPTERS: usize = 16;
pub const MAX_GOALS: usize = 64;
pub const MAX_GOALS_PER_CHAPTER: usize = 16;
pub const MAX_CONDITION_NODES: usize = 256;
pub const MAX_CONDITION_DEPTH: usize = 4;
pub const MAX_GROUP_SIZE: usize = 8;
mod model;
mod runtime;
mod validation;
pub use model::*;
pub use runtime::{advance, initialize, valid, view};
pub use validation::check;
#[cfg(test)]
mod tests;

pub fn catalog() -> serde_json::Value {
    let example =
        |name: &str, condition: GoalCondition| serde_json::json!({"name":name,"example":condition});
    serde_json::json!({"schema":1,"supported_modes":["sandbox"],"limits":{"chapters":MAX_CHAPTERS,"goals":MAX_GOALS,"goals_per_chapter":MAX_GOALS_PER_CHAPTER,"condition_nodes":MAX_CONDITION_NODES,"condition_depth":MAX_CONDITION_DEPTH,"group_size":MAX_GROUP_SIZE},"target_limits":{"buildings":256,"stored":economy::CAPACITY,"funds":1_000_000_000,"date":5_000_000,"harvests":1_000_000},"conditions":[
        example("Completed standing buildings",GoalCondition::Buildings{building:"home".into(),count:1,credit:BuildingCredit::Present}),
        example("Unreserved material at stores",GoalCondition::Stored{material:"timber".into(),count:12}),
        example("Community fund balance",GoalCondition::Funds{cents:30_000}),
        example("Game date",GoalCondition::Date{minute:1440.}),
        example("Harvest count",GoalCondition::Harvests{count:1,credit:CounterCredit::AfterActivation}),
        example("Maintain an observed village outcome",GoalCondition::Maintain{outcome:ObservedOutcome::Pantry,minutes:60}),
        example("Prior goal completion",GoalCondition::Goal{goal:"another-goal".into()}),
        example("All conditions",GoalCondition::All{conditions:vec![GoalCondition::Funds{cents:0}]}),
        example("Any condition",GoalCondition::Any{conditions:vec![GoalCondition::Funds{cents:0}]})
    ],"outcomes":([ObservedOutcome::Pantry,ObservedOutcome::Diet,ObservedOutcome::Services,ObservedOutcome::Night,ObservedOutcome::Dry].map(|outcome|serde_json::json!({"id":outcome,"name":outcome.name(),"maximum_minutes":outcomes::TARGETS[outcome.index()],"observation_minutes":15}))),"building_credit":[BuildingCredit::Present,BuildingCredit::AfterActivation],"counter_credit":[CounterCredit::Run,CounterCredit::AfterActivation]})
}

/// Outcome measurement is a scenario subscription, independent of rule presets.
pub fn needs_outcomes(v: &Village) -> bool {
    fn needed(condition: &GoalCondition) -> bool {
        match condition {
            GoalCondition::Maintain { .. } => true,
            GoalCondition::All { conditions } | GoalCondition::Any { conditions } => {
                conditions.iter().any(needed)
            }
            _ => false,
        }
    }
    v.scenario
        .as_ref()
        .and_then(|s| s.definition.journal.as_ref())
        .is_some_and(|j| {
            j.chapters
                .iter()
                .any(|c| c.goals.iter().any(|g| needed(&g.condition)))
        })
}
