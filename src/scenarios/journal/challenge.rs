//! Native deadline boundaries are independent of rendering and playback speed.
use super::*;
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Definition {
    pub deadline: f32,
    pub failure_message: String,
}
pub fn step(v: &Village, requested: f32) -> (f32, Option<f32>) {
    let Some(journal) = v
        .scenario
        .as_ref()
        .and_then(|s| s.definition.journal.as_ref())
    else {
        return (requested, None);
    };
    let (Some(challenge), Some(state)) = (&journal.challenge, &v.progress.scenario_journal) else {
        return (requested, None);
    };
    if state.failed_at.is_some() && state.continued_at.is_none() {
        return (0., None);
    }
    if state.failed_at.is_none()
        && state.finished_at.is_none()
        && v.minutes + requested * MINUTES_PER_SECOND >= challenge.deadline
    {
        return (
            ((challenge.deadline - v.minutes) / MINUTES_PER_SECOND).max(0.),
            Some(challenge.deadline),
        );
    }
    (requested, None)
}
pub fn finish(journal: &Journal, state: &mut State, now: f32) {
    if let Some(c) = &journal.challenge
        && state.finished_at.is_none()
        && now >= c.deadline
        && state.failed_at.is_none()
    {
        state.failed_at = Some(c.deadline);
    }
}
pub fn valid(journal: &Journal, state: &State, now: f32) -> bool {
    let Some(c) = &journal.challenge else {
        return state.failed_at.is_none() && state.continued_at.is_none();
    };
    match state.failed_at {
        Some(at) => {
            at == c.deadline
                && match state.continued_at {
                    Some(continued) => {
                        continued == at
                            && now >= continued
                            && state
                                .finished_at
                                .is_none_or(|finished| finished >= continued)
                    }
                    None => now == at && state.finished_at.is_none(),
                }
        }
        None => {
            state.continued_at.is_none()
                && state
                    .finished_at
                    .map_or(now < c.deadline, |at| at <= c.deadline)
        }
    }
}
pub fn view(journal: &Journal, state: &State) -> serde_json::Value {
    journal.challenge.as_ref().map_or(serde_json::Value::Null, |c| serde_json::json!({
        "deadline": c.deadline, "failure_message": c.failure_message,
        "failed_at": state.failed_at, "continued_at": state.continued_at,
        "eligible": state.failed_at.is_none(),
        "status": if state.continued_at.is_some() { "unrestricted" } else if state.failed_at.is_some() { "failed" } else if state.finished_at.is_some() { "succeeded" } else { "active" }
    }))
}

/// The player explicitly leaves the failed challenge. Receipts and source remain intact.
pub fn continue_freely(v: &mut Village) -> bool {
    let Some(state) = v.progress.scenario_journal.as_mut() else {
        return false;
    };
    if state.failed_at != Some(v.minutes) || state.continued_at.is_some() {
        return false;
    }
    state.continued_at = Some(v.minutes);
    state.locked_buildings.clear();
    true
}
pub fn rules_locked(v: &Village) -> bool {
    v.scenario
        .as_ref()
        .and_then(|s| s.definition.journal.as_ref())
        .is_some_and(|j| j.challenge.is_some())
        && v.progress
            .scenario_journal
            .as_ref()
            .is_some_and(|s| s.finished_at.is_none() && s.continued_at.is_none())
}
