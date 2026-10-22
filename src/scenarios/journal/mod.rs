//! Authored journals own goals; the village owns only their measured progress.
use super::*;
pub const MAX_CHAPTERS: usize = 16;
pub const MAX_GOALS: usize = 64;
pub const MAX_GOALS_PER_CHAPTER: usize = 16;
pub const MAX_CONDITION_NODES: usize = 256;
pub const MAX_CONDITION_DEPTH: usize = 4;
pub const MAX_GROUP_SIZE: usize = 8;
pub(crate) mod delivery;
pub(crate) mod events;
pub(crate) mod land_use;
mod model;
mod runtime;
pub(crate) mod trade;
mod validation;
pub(crate) mod wellbeing;
pub use model::*;
pub use runtime::{advance, initialize, valid, view};
pub use validation::check;
#[cfg(test)]
mod tests;

pub fn catalog() -> serde_json::Value {
    let example =
        |name: &str, condition: GoalCondition| serde_json::json!({"name":name,"example":condition});
    serde_json::json!({"schema":1,"supported_modes":["sandbox"],"events":events::catalog(),"limits":{"chapters":MAX_CHAPTERS,"goals":MAX_GOALS,"goals_per_chapter":MAX_GOALS_PER_CHAPTER,"condition_nodes":MAX_CONDITION_NODES,"condition_depth":MAX_CONDITION_DEPTH,"group_size":MAX_GROUP_SIZE},"wellbeing":wellbeing::catalog(),"land_use":land_use::catalog(),"trade_materials":economy::NAMES.into_iter().filter(|name|*name!=economy::NAMES[economy::SCRAPS]).collect::<Vec<_>>(),"trade_directions":[TradeDirection::Purchase,TradeDirection::Sale],"production_materials":production::PRODUCTS.map(|i|economy::NAMES[i]),"target_limits":{"delivered":1_000_000,"traded":1_000_000,"produced":1_000_000,"buildings":256,"stored":economy::CAPACITY,"funds":1_000_000_000,"date":5_000_000,"harvests":1_000_000},"conditions":[
        example("Completed standing buildings",GoalCondition::Buildings{building:"home".into(),count:1,credit:BuildingCredit::Present,region:None}),
        example("Growing or harvest-ready crops",GoalCondition::Crops{crop:"beans".into(),count:1,stage:land_use::CropStage::Planted,region:None}),
        example("Established fruit orchards",GoalCondition::Orchards{count:1,stage:land_use::OrchardStage::Established,region:None}),
        example("Occupied or cared-for livestock enclosures",GoalCondition::Livestock{building:"goat_pasture".into(),count:1,stage:land_use::AnimalStage::CaredFor,region:None}),
        example("Planted or harvestable material plots",GoalCondition::MaterialSites{material:"timber".into(),count:1,stage:land_use::SourceStage::Planted,region:None}),
        example("Unreserved material at stores",GoalCondition::Stored{material:"timber".into(),count:12}),
        example("Community fund balance",GoalCondition::Funds{cents:30_000}),
        example("Game date",GoalCondition::Date{minute:1440.}),
        example("Harvest count",GoalCondition::Harvests{count:1,credit:CounterCredit::AfterActivation}),
        example("Resident-carried local deliveries",GoalCondition::Delivered{material:"walls".into(),count:2,credit:CounterCredit::AfterActivation,building:None}),
        example("Completed town trade",GoalCondition::Traded{direction:TradeDirection::Purchase,material:"plumbing".into(),count:2,credit:CounterCredit::AfterActivation}),
        example("Prepared material production",GoalCondition::Produced{material:"walls".into(),count:2,credit:CounterCredit::AfterActivation}),
        example("Sustain resident wellbeing",GoalCondition::Wellbeing{resident:None,energy_min:25.,hunger_max:65.,social_min:25.,happiness_min:0.,minutes:60}),
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
        .is_some_and(|j| j.conditions().any(needed))
}

fn production_baselines(condition: &GoalCondition, v: &Village) -> BTreeMap<String, u64> {
    fn visit(c: &GoalCondition, v: &Village, result: &mut BTreeMap<String, u64>) {
        match c {
            GoalCondition::Produced {
                material,
                credit: CounterCredit::AfterActivation,
                ..
            } => {
                if let Some(index) = economy::NAMES.iter().position(|key| *key == material) {
                    result.insert(material.clone(), v.production.accounting.outputs[index]);
                }
            }
            GoalCondition::All { conditions } | GoalCondition::Any { conditions } => {
                for c in conditions {
                    visit(c, v, result);
                }
            }
            _ => {}
        }
    }
    let mut result = BTreeMap::new();
    visit(condition, v, &mut result);
    result
}
