//! Shared traversal, continuous-period clocks and live observation ownership.
use super::*;
pub(super) fn conditions<'a>(
    list: &[&'a GoalCondition],
    accept: fn(&GoalCondition) -> bool,
) -> BTreeMap<String, &'a GoalCondition> {
    fn visit<'a>(
        c: &'a GoalCondition,
        out: &mut BTreeMap<String, &'a GoalCondition>,
        accept: fn(&GoalCondition) -> bool,
    ) {
        if accept(c) {
            out.insert(
                serde_json::to_string(c).expect("bounded finite condition"),
                c,
            );
        }
        if let GoalCondition::All { conditions } | GoalCondition::Any { conditions } = c {
            for c in conditions {
                visit(c, out, accept);
            }
        }
    }
    let mut out = BTreeMap::new();
    for c in list {
        visit(c, &mut out, accept);
    }
    out
}
pub(super) fn tolerance(now: f32) -> f32 {
    (now.abs() * f32::EPSILON).max(0.0001)
}
pub(super) fn since(
    last: f32,
    since: Option<f32>,
    was_qualified: bool,
    qualified: bool,
    now: f32,
    max_gap: f32,
) -> Option<f32> {
    if !qualified {
        return None;
    }
    let gap = now - last;
    if was_qualified && gap >= 0. && gap <= max_gap + tolerance(now) {
        since.or(Some(now))
    } else {
        Some(now)
    }
}
pub(super) fn valid_period(
    last: f32,
    since: Option<f32>,
    qualified: bool,
    activation: f32,
    end: f32,
) -> bool {
    last.is_finite()
        && (activation..=end).contains(&last)
        && match since {
            Some(start) => qualified && start.is_finite() && (activation..=last).contains(&start),
            None => !qualified,
        }
}
pub fn observe(v: &mut Village, people: &[Resident]) {
    let Some(origin) = v.scenario.clone() else {
        return;
    };
    let Some(journal) = origin.definition.journal.as_ref() else {
        return;
    };
    let Some(state) = v.progress.scenario_journal.as_ref() else {
        return;
    };
    let live = |r: &GoalState| !r.wellbeing.is_empty() || !r.services.is_empty();
    if !state
        .goals
        .values()
        .any(|r| r.completed_at.is_none() && live(r))
        && !state
            .events
            .values()
            .any(|e| e.applied_at.is_none() && live(&e.watch))
    {
        return;
    }
    let mut state = v.progress.scenario_journal.take().unwrap();
    let mut readings = services::Frame::new(v, people);
    for chapter in &journal.chapters {
        for goal in &chapter.goals {
            let r = state.goals.get_mut(&goal.id).unwrap();
            if r.activated_at.is_some() && r.completed_at.is_none() {
                wellbeing::sample(r, &[&goal.condition], v, people);
                services::sample(r, &[&goal.condition], v, &mut readings);
            }
        }
    }
    for e in &journal.events {
        let r = state.events.get_mut(&e.id).unwrap();
        if r.applied_at.is_none() {
            let conditions = e.conditions().collect::<Vec<_>>();
            wellbeing::sample(&mut r.watch, &conditions, v, people);
            services::sample(&mut r.watch, &conditions, v, &mut readings);
        }
    }
    v.progress.scenario_journal = Some(state);
}
