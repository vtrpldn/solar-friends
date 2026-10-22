//! One campaign chapter uses the authored condition evaluator. The remaining
//! chapters and permanent campaign receipt remain behind progression's adapter.
use super::*;
use journal::{BuildingCredit, CounterCredit, GoalCondition, milestones::Kind};
pub const CHAPTER: &str = "shared-beginning";
pub const GOALS: [&str; 5] = [
    "welcome-friends",
    "first-cistern",
    "first-home",
    "first-harvest",
    "first-cooked-meal",
];
fn building(kind: &str) -> GoalCondition {
    GoalCondition::Buildings {
        building: kind.into(),
        count: 1,
        credit: BuildingCredit::Present,
        region: None,
    }
}
static OPENING: std::sync::LazyLock<GoalCondition> =
    std::sync::LazyLock::new(|| GoalCondition::All {
        conditions: vec![
            GoalCondition::Milestone {
                milestone: Kind::Arrived,
                count: 1,
            },
            building("well"),
            building("home"),
            GoalCondition::Harvests {
                count: 1,
                credit: CounterCredit::Run,
            },
            GoalCondition::All {
                conditions: vec![
                    building("kitchen"),
                    GoalCondition::Milestone {
                        milestone: Kind::MealsServed,
                        count: 1,
                    },
                ],
            },
        ],
    });
pub fn requirements_met(v: &Village) -> bool {
    journal::measure_run(&OPENING, v).0
}
pub fn view(v: &Village) -> serde_json::Value {
    if v.mode != modes::Mode::Story {
        return serde_json::Value::Null;
    }
    let (met, measured) = journal::measure_run(&OPENING, v);
    let goals:Vec<_> = GOALS.into_iter().zip(measured["conditions"].as_array().unwrap()).map(|(id,condition)| {
        let complete=condition["complete"].as_bool().unwrap();
        serde_json::json!({"id":id,"value":condition.get("value").cloned().unwrap_or(serde_json::json!(u32::from(complete))),"target":1,"complete":complete,"condition":condition})
    }).collect();
    serde_json::json!({"schema":1,"chapter":CHAPTER,"legacy_index":0,"evaluator":"scenario-conditions-v1","credit":"simultaneous-until-chapter-completion","completed":v.progress.completed[0],"requirements_met":met,"goals":goals,"unlocks":["grove","warehouse","orchard"],"remaining_legacy_chapters":progression::CHAPTER_COUNT-1})
}
#[cfg(test)]
mod tests;

/// The bridge's authored definition can also compile as an ordinary Sandbox
/// journal. One All goal preserves simultaneous credit until the chapter ends.
pub fn opening_journal() -> journal::Journal {
    journal::Journal {
        schema:1,roles:vec![],challenge:None,introduction:"Five friends begin a shared home.".into(),completion:"Follow Roots for Tomorrow in the campaign journal.".into(),events:vec![],locked_buildings:vec![],
        chapters:vec![journal::Chapter {id:CHAPTER.into(),title:"A Shared Beginning".into(),description:"Welcome the founding friends, establish water and shelter, harvest food and serve a cooked meal.".into(),goals:vec![journal::Goal {id:"shared-beginning-ready".into(),title:"Establish our first home".into(),description:"These requirements must hold together before the chapter is complete.".into(),optional:false,condition:OPENING.clone()}]}],
    }
}
pub fn check(d: &Definition, report: &mut Report) {
    if d.rules.mode == modes::Mode::Story && d.journal.is_none() {
        let mut bridge = d.clone();
        bridge.rules.mode = modes::Mode::Sandbox;
        bridge.journal = Some(opening_journal());
        journal::check(&bridge, report);
    }
}
