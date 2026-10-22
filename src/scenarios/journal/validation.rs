use super::*;
pub fn check(d: &Definition, report: &mut Report) {
    let Some(journal) = &d.journal else {
        return;
    };
    if journal.schema != 1
        || journal.introduction.chars().count() > 2000
        || journal.completion.chars().count() > 1000
        || journal.chapters.is_empty()
        || journal.chapters.len() > MAX_CHAPTERS
    {
        report.push("journal", "invalid_journal", "Use journal version 1, 1–16 chapters, an introduction up to 2,000 characters and completion text up to 1,000 characters.");
    }
    if d.rules.mode != modes::Mode::Sandbox {
        report.push("journal", "unsupported_story_adapter", "Use Sandbox rules for an authored journal. The official Story adapter is not available yet.");
    }
    let mut chapters = HashSet::new();
    let mut ids = BTreeMap::new();
    let mut nodes = 0;
    for (index, chapter) in journal.chapters.iter().enumerate() {
        if !valid_key(&chapter.id)
            || !chapters.insert(&chapter.id)
            || !text(&chapter.title, 100)
            || chapter.description.chars().count() > 1000
            || chapter.goals.is_empty()
            || chapter.goals.len() > MAX_GOALS_PER_CHAPTER
            || chapter.goals.iter().all(|g| g.optional)
        {
            report.push(&format!("journal.chapters.{index}"), "invalid_chapter", "Use a unique chapter identity, a title, at most sixteen goals and at least one required goal.");
        }
        for goal in &chapter.goals {
            if !valid_key(&goal.id)
                || ids.insert(goal.id.clone(), index).is_some()
                || !text(&goal.title, 100)
                || goal.description.chars().count() > 1000
            {
                report.push("journal.chapters", "invalid_goal", "Give every goal a unique identity, a title up to 100 characters and description up to 1,000 characters.");
            }
            if !condition(&goal.condition, 0, &mut nodes) {
                report.push("journal.chapters", "invalid_condition", "Use supported goal conditions, positive bounded targets and nonempty groups nested at most four levels.");
            }
        }
    }
    if ids.len() > MAX_GOALS || nodes > MAX_CONDITION_NODES {
        report.push(
            "journal",
            "journal_limit",
            "Use at most 64 goals and 256 total condition nodes.",
        );
    }
    if report.has_errors() {
        return;
    }
    let mut dependencies = BTreeMap::new();
    for (index, chapter) in journal.chapters.iter().enumerate() {
        for goal in &chapter.goals {
            let mut refs = vec![];
            references(&goal.condition, &mut refs);
            for reference in &refs {
                if ids
                    .get(*reference)
                    .is_none_or(|&owner| !goal.optional && owner > index)
                {
                    report.push("journal.chapters", "unreachable_goal", "A required goal cannot depend on a later chapter. Every referenced goal must exist.");
                }
            }
            dependencies.insert(goal.id.as_str(), refs);
        }
    }
    let mut visited = HashSet::new();
    let mut visiting = HashSet::new();
    for id in dependencies.keys() {
        if cycle(id, &dependencies, &mut visiting, &mut visited) {
            report.push(
                "journal.chapters",
                "goal_cycle",
                "Goal dependencies must not contain a cycle.",
            );
            break;
        }
    }
}
fn text(value: &str, max: usize) -> bool {
    !value.trim().is_empty() && value.chars().count() <= max
}
fn condition(c: &GoalCondition, depth: usize, nodes: &mut usize) -> bool {
    *nodes += 1;
    if depth > MAX_CONDITION_DEPTH || *nodes > MAX_CONDITION_NODES {
        return false;
    }
    match c {
        GoalCondition::Buildings {
            building, count, ..
        } => progression::BUILDINGS.contains(&building.as_str()) && (1..=256).contains(count),
        GoalCondition::Stored { material, count } => {
            economy::NAMES.contains(&material.as_str()) && (1..=economy::CAPACITY).contains(count)
        }
        GoalCondition::Funds { cents } => (0..=1_000_000_000).contains(cents),
        GoalCondition::Date { minute } => minute.is_finite() && (0.0..=5_000_000.).contains(minute),
        GoalCondition::Harvests { count, .. } => (1..=1_000_000).contains(count),
        GoalCondition::Goal { goal } => valid_key(goal),
        GoalCondition::All { conditions } | GoalCondition::Any { conditions } => {
            !conditions.is_empty()
                && conditions.len() <= MAX_GROUP_SIZE
                && conditions.iter().all(|c| condition(c, depth + 1, nodes))
        }
    }
}
fn references<'a>(c: &'a GoalCondition, out: &mut Vec<&'a str>) {
    match c {
        GoalCondition::Goal { goal } => out.push(goal),
        GoalCondition::All { conditions } | GoalCondition::Any { conditions } => {
            for child in conditions {
                references(child, out);
            }
        }
        _ => {}
    }
}
fn cycle<'a>(
    id: &'a str,
    dependencies: &BTreeMap<&'a str, Vec<&'a str>>,
    visiting: &mut HashSet<&'a str>,
    visited: &mut HashSet<&'a str>,
) -> bool {
    if visited.contains(id) {
        return false;
    }
    if !visiting.insert(id) {
        return true;
    }
    if let Some(refs) = dependencies.get(id) {
        for reference in refs {
            if cycle(reference, dependencies, visiting, visited) {
                return true;
            }
        }
    }
    visiting.remove(id);
    visited.insert(id);
    false
}
