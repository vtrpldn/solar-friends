//! Conservative reachability: ignore resource/land limits, but do not let an
//! unlock depend on work that necessarily needs the still-locked building.
use super::*;
fn available(kind: &str, unlocked: &HashSet<String>, d: &crate::scenarios::Definition) -> bool {
    unlocked.contains(kind) || d.start.buildings.iter().any(|b| b.kind == kind)
}
fn possible(
    c: &GoalCondition,
    goals: &HashSet<String>,
    unlocked: &HashSet<String>,
    d: &crate::scenarios::Definition,
) -> bool {
    match c {
        GoalCondition::Buildings {
            building,
            count,
            credit,
            ..
        } => {
            unlocked.contains(building)
                || d.start
                    .buildings
                    .iter()
                    .filter(|b| {
                        b.kind == *building
                            && (*credit == BuildingCredit::Present
                                || b.state == BuildingState::Blueprint)
                    })
                    .count()
                    >= *count as usize
        }
        GoalCondition::Produced { material, .. } => match material.as_str() {
            "tools" | "tiles" => available("workshop", unlocked, d),
            "meals" => available("kitchen", unlocked, d),
            _ => true,
        },
        GoalCondition::Maintain {
            outcome: ObservedOutcome::Services | ObservedOutcome::Dry,
            ..
        } => available("home", unlocked, d) && available("kitchen", unlocked, d),
        GoalCondition::Maintain {
            outcome: ObservedOutcome::Night,
            ..
        } => available("streetlight", unlocked, d),
        GoalCondition::Goal { goal } => goals.contains(goal),
        GoalCondition::All { conditions } => {
            conditions.iter().all(|c| possible(c, goals, unlocked, d))
        }
        GoalCondition::Any { conditions } => {
            conditions.iter().any(|c| possible(c, goals, unlocked, d))
        }
        _ => true,
    }
}
pub fn check(d: &crate::scenarios::Definition, report: &mut Report) {
    let Some(journal) = &d.journal else {
        return;
    };
    if journal.locked_buildings.is_empty() {
        return;
    }
    let mut unlocked: HashSet<String> = progression::BUILDINGS
        .iter()
        .filter(|kind| !journal.locked_buildings.iter().any(|key| key == **kind))
        .map(|kind| (*kind).into())
        .collect();
    let mut goals = HashSet::new();
    let mut events = HashSet::new();
    for _ in 0..MAX_GOALS + MAX_EVENTS + MAX_CHAPTERS + progression::BUILDINGS.len() + 1 {
        let before = (unlocked.len(), goals.len(), events.len());
        for (i, chapter) in journal.chapters.iter().enumerate() {
            if i == 0
                || journal.chapters[i - 1]
                    .goals
                    .iter()
                    .filter(|g| !g.optional)
                    .all(|g| goals.contains(&g.id))
            {
                for goal in &chapter.goals {
                    if possible(&goal.condition, &goals, &unlocked, d) {
                        goals.insert(goal.id.clone());
                    }
                }
            }
        }
        for event in &journal.events {
            let trigger = match &event.trigger {
                EventTrigger::Start | EventTrigger::Date { .. } => true,
                EventTrigger::Goal { goal } => goals.contains(goal),
                EventTrigger::Chapter { chapter } => journal
                    .chapters
                    .iter()
                    .find(|c| c.id == *chapter)
                    .is_some_and(|c| {
                        c.goals
                            .iter()
                            .filter(|g| !g.optional)
                            .all(|g| goals.contains(&g.id))
                    }),
                EventTrigger::Threshold { condition } => possible(condition, &goals, &unlocked, d),
            };
            if trigger
                && event
                    .condition
                    .as_ref()
                    .is_none_or(|c| possible(c, &goals, &unlocked, d))
            {
                events.insert(event.id.clone());
                if let EventEffect::UnlockBuilding { building } = &event.effect {
                    unlocked.insert(building.clone());
                }
            }
        }
        if before == (unlocked.len(), goals.len(), events.len()) {
            break;
        }
    }
    if journal
        .chapters
        .iter()
        .flat_map(|c| &c.goals)
        .any(|g| !g.optional && !goals.contains(&g.id))
    {
        report.push("journal.events","unlock_deadlock","Required progression has no reachable path through its goal dependencies and starting building locks. Move an unlock earlier, change its conditions, or provide a starting building/project. This check does not prove resource or land solvability.");
    }
}
