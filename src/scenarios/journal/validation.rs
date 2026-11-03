use super::*;
pub fn check(d: &Definition, report: &mut Report) {
    let Some(journal) = &d.journal else {
        return;
    };
    roles::check(d, report);
    events::check(d, report);
    if journal.challenge.as_ref().is_some_and(|c| {
        !c.deadline.is_finite()
            || c.deadline <= d.start.minutes
            || c.deadline > 5_000_000.
            || !text(&c.failure_message, 1000)
    }) {
        report.push("journal.challenge", "invalid_challenge", "Choose a deadline after arrival and no later than minute 5,000,000, with a failure message of 1–1,000 characters.");
    }
    if journal.schema != 1
        || journal.introduction.chars().count() > 2000
        || journal.completion.chars().count() > 1000
        || journal.chapters.is_empty()
        || journal.chapters.len() > MAX_CHAPTERS
    {
        report.push("journal", "invalid_journal", "Use journal version 1, 1–16 chapters, an introduction up to 2,000 characters and completion text up to 1,000 characters.");
    }
    if d.rules.mode != modes::Mode::Sandbox {
        report.push(
            "journal",
            "unsupported_story_adapter",
            "Use Sandbox rules for a custom journal. The official Story uses its campaign adapter.",
        );
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
        for (goal_index, goal) in chapter.goals.iter().enumerate() {
            if !valid_key(&goal.id)
                || ids.insert(goal.id.clone(), index).is_some()
                || !text(&goal.title, 100)
                || goal.description.chars().count() > 1000
            {
                report.push("journal.chapters", "invalid_goal", "Give every goal a unique identity, a title up to 100 characters and description up to 1,000 characters.");
            }
            if !operations::setup_valid(&goal.condition, d) {
                report.push("journal.chapters", "unsupported_operation_rules", "Enable material logistics for production, material logistics and local utilities for treatment, or local utilities for generation and lighting goals.");
            }
            if !services::setup_valid(&goal.condition, d) {
                report.push("journal.chapters","unsupported_service_setup","Accessible food requires materials and hauling; water, sanitation and lighting require connected local utilities. A housed-person target cannot exceed this founding cast.");
            }
            if !wellbeing::references_valid(&goal.condition, d) {
                report.push("journal.chapters","missing_wellbeing_resident","Choose an existing cast member or everyone for each wellbeing condition. Removing a friend leaves their goals for you to repair.");
            }
            if !delivery::targets_valid(&goal.condition, d) {
                report.push("journal.chapters","missing_delivery_destination","Choose an existing starting building with a receiving inventory, a construction blueprint, or the arrival store.");
            }
            if !d.rules.logistics && needs_production(&goal.condition) {
                report.push("journal.chapters","disabled_production_goal","Enable materials, hauling and resident work before requiring preparation, resident deliveries or material plots.");
            }
            if !d.rules.climate && needs_climate(&goal.condition) {
                report.push(
                    "journal.chapters",
                    "disabled_climate_goal",
                    "Enable seasonal weather before requiring a dry-season outcome.",
                );
            }
            report_missing_regions(
                &goal.condition,
                d,
                &format!("journal.chapters.{index}.goals.{goal_index}.condition"),
                report,
            );
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
    if !report.has_errors() {
        events::check_unlocks(d, report);
    }
}
fn text(value: &str, max: usize) -> bool {
    !value.trim().is_empty() && value.chars().count() <= max
}
pub(super) fn condition(c: &GoalCondition, depth: usize, nodes: &mut usize) -> bool {
    *nodes += 1;
    if depth > MAX_CONDITION_DEPTH || *nodes > MAX_CONDITION_NODES {
        return false;
    }
    match c {
        GoalCondition::Buildings {
            building, count, ..
        } => progression::BUILDINGS.contains(&building.as_str()) && (1..=256).contains(count),
        GoalCondition::Operating { .. } => operations::valid(c),
        GoalCondition::Crops { .. }
        | GoalCondition::Orchards { .. }
        | GoalCondition::Livestock { .. }
        | GoalCondition::MaterialSites { .. } => land_use::valid(c),
        GoalCondition::Stored { material, count } => {
            economy::NAMES.contains(&material.as_str()) && (1..=economy::CAPACITY).contains(count)
        }
        GoalCondition::Funds { cents } => (0..=1_000_000_000).contains(cents),
        GoalCondition::Date { minute } => minute.is_finite() && (0.0..=5_000_000.).contains(minute),
        GoalCondition::Delivered {
            material, count, ..
        } => economy::NAMES.contains(&material.as_str()) && (1..=1_000_000).contains(count),
        GoalCondition::Traded {
            material, count, ..
        } => {
            economy::NAMES.contains(&material.as_str())
                && material != economy::NAMES[economy::SCRAPS]
                && (1..=1_000_000).contains(count)
        }
        GoalCondition::Produced {
            material, count, ..
        } => {
            economy::NAMES
                .iter()
                .position(|key| *key == material)
                .is_some_and(|i| production::PRODUCTS.contains(&i))
                && (1..=1_000_000).contains(count)
        }
        GoalCondition::Milestone { milestone, count } => (1..=milestone.maximum()).contains(count),
        GoalCondition::Harvests { count, .. } => (1..=1_000_000).contains(count),
        GoalCondition::Service { .. } => services::valid_condition(c),
        GoalCondition::Wellbeing { .. } => wellbeing::valid_condition(c),
        GoalCondition::Maintain { outcome, minutes } => {
            (15..=outcomes::TARGETS[outcome.index()] as u32).contains(minutes)
                && minutes.is_multiple_of(15)
        }
        GoalCondition::Goal { goal } => valid_key(goal),
        GoalCondition::All { conditions } | GoalCondition::Any { conditions } => {
            !conditions.is_empty()
                && conditions.len() <= MAX_GROUP_SIZE
                && conditions.iter().all(|c| condition(c, depth + 1, nodes))
        }
    }
}
pub(super) fn references<'a>(c: &'a GoalCondition, out: &mut Vec<&'a str>) {
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

pub(super) fn needs_climate(condition: &GoalCondition) -> bool {
    match condition {
        GoalCondition::Maintain {
            outcome: ObservedOutcome::Dry,
            ..
        } => true,
        GoalCondition::All { conditions } | GoalCondition::Any { conditions } => {
            conditions.iter().any(needs_climate)
        }
        _ => false,
    }
}

fn report_missing_regions(c: &GoalCondition, d: &Definition, path: &str, report: &mut Report) {
    match c {
        GoalCondition::All { conditions } | GoalCondition::Any { conditions } => {
            for (index, child) in conditions.iter().enumerate() {
                report_missing_regions(child, d, &format!("{path}.conditions.{index}"), report);
            }
        }
        _ if !regions_exist(c, d) => report.push(
            &format!("{path}.region"),
            "missing_goal_region",
            "Choose an existing named region for this regional goal.",
        ),
        _ => {}
    }
}

pub(super) fn regions_exist(c: &GoalCondition, d: &Definition) -> bool {
    match c {
        GoalCondition::Buildings {
            region: Some(id), ..
        }
        | GoalCondition::Operating {
            region: Some(id), ..
        }
        | GoalCondition::Crops {
            region: Some(id), ..
        }
        | GoalCondition::Orchards {
            region: Some(id), ..
        }
        | GoalCondition::Livestock {
            region: Some(id), ..
        }
        | GoalCondition::MaterialSites {
            region: Some(id), ..
        } => d.map.regions.iter().any(|r| r.id == *id),
        GoalCondition::All { conditions } | GoalCondition::Any { conditions } => {
            conditions.iter().all(|c| regions_exist(c, d))
        }
        _ => true,
    }
}

pub(super) fn needs_production(c: &GoalCondition) -> bool {
    match c {
        GoalCondition::Produced { .. }
        | GoalCondition::Delivered { .. }
        | GoalCondition::MaterialSites { .. } => true,
        GoalCondition::All { conditions } | GoalCondition::Any { conditions } => {
            conditions.iter().any(needs_production)
        }
        _ => false,
    }
}
