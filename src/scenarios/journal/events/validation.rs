use super::*;
pub fn check(d: &crate::scenarios::Definition, report: &mut Report) {
    let Some(journal) = d.journal.as_ref() else {
        return;
    };
    if journal.events.len() > MAX_EVENTS {
        report.push(
            "journal.events",
            "event_limit",
            "Use at most 64 one-shot events.",
        );
    }
    let mut ids = HashSet::new();
    let mut nodes = 0;
    let goals: HashSet<_> = journal
        .chapters
        .iter()
        .flat_map(|c| c.goals.iter().map(|g| g.id.as_str()))
        .collect();
    for event in &journal.events {
        let trigger_valid = match &event.trigger {
            EventTrigger::Start | EventTrigger::Threshold { .. } => true,
            EventTrigger::Goal { goal } => goals.contains(goal.as_str()),
            EventTrigger::Chapter { chapter } => journal.chapters.iter().any(|c| c.id == *chapter),
            EventTrigger::Date { minute } => {
                minute.is_finite() && (0.0..=5_000_000.).contains(minute)
            }
        };
        let effect_valid = match &event.effect {
            EventEffect::Message { text } => {
                !text.trim().is_empty() && text.chars().count() <= 1000
            }
            EventEffect::GrantFunds { cents } => (1..=100_000_000).contains(cents),
        };
        if !valid_key(&event.id)
            || !ids.insert(&event.id)
            || event.title.trim().is_empty()
            || event.title.chars().count() > 100
            || !trigger_valid
            || !effect_valid
        {
            report.push("journal.events","invalid_event","Give every one-shot event a unique identity, a title, an existing goal/chapter or supported trigger, and a message up to 1,000 characters or positive funding up to R$ 1,000,000.");
        }
        for condition in event.conditions() {
            let mut references = vec![];
            super::super::validation::references(condition, &mut references);
            if !super::super::validation::condition(condition, 0, &mut nodes)
                || !super::super::validation::regions_exist(condition, d)
                || !delivery::targets_valid(condition, d)
                || !d.rules.logistics && super::super::validation::needs_production(condition)
                || !d.rules.climate && super::super::validation::needs_climate(condition)
                || references.iter().any(|goal| !goals.contains(goal))
            {
                report.push("journal.events","invalid_event_condition","Use supported conditions and existing references for event thresholds and guards. Enable any rules required by those observations.");
            }
        }
    }
    if nodes > MAX_CONDITION_NODES {
        report.push(
            "journal.events",
            "event_condition_limit",
            "Use at most 256 event condition nodes, in addition to the goal condition budget.",
        );
    }
}
