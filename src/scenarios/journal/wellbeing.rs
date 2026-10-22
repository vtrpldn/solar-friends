//! Per-goal consecutive observations of actual residents, independent of Story rules.
use super::*;
pub const MAX_MINUTES: u32 = 10080;
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Watch {
    pub last: f32,
    pub since: Option<f32>,
    pub total: u32,
    pub matching: u32,
}
fn conditions<'a>(list: &[&'a GoalCondition]) -> BTreeMap<String, &'a GoalCondition> {
    observation::conditions(list, |c| matches!(c, GoalCondition::Wellbeing { .. }))
}
pub fn watches(list: &[&GoalCondition], now: f32) -> BTreeMap<String, Watch> {
    conditions(list)
        .into_keys()
        .map(|key| {
            (
                key,
                Watch {
                    last: now,
                    since: None,
                    total: 0,
                    matching: 0,
                },
            )
        })
        .collect()
}
pub fn valid_condition(c: &GoalCondition) -> bool {
    let GoalCondition::Wellbeing {
        energy_min,
        hunger_max,
        social_min,
        happiness_min,
        minutes,
        ..
    } = c
    else {
        return false;
    };
    [energy_min, hunger_max, social_min, happiness_min]
        .into_iter()
        .all(|n| n.is_finite() && (0.0..=100.).contains(n))
        && (1..=MAX_MINUTES).contains(minutes)
}
pub fn references_valid(c: &GoalCondition, d: &Definition) -> bool {
    match c {
        GoalCondition::Wellbeing {
            resident: Some(id), ..
        } => residents::identities(d).contains_key(id),
        GoalCondition::All { conditions } | GoalCondition::Any { conditions } => {
            conditions.iter().all(|c| references_valid(c, d))
        }
        _ => true,
    }
}
fn resident_id(v: &Village, id: &str) -> Option<usize> {
    let o = v.scenario.as_ref()?;
    o.residents
        .get(id)
        .copied()
        .or_else(|| residents::identities(&o.definition).get(id).copied())
}
fn population(c: &GoalCondition, v: &Village) -> u32 {
    if matches!(
        c,
        GoalCondition::Wellbeing {
            resident: Some(_),
            ..
        }
    ) {
        1
    } else {
        v.skills.people.len() as u32
    }
}
fn counts(c: &GoalCondition, v: &Village, people: &[Resident]) -> (u32, u32) {
    let GoalCondition::Wellbeing {
        resident,
        energy_min,
        hunger_max,
        social_min,
        happiness_min,
        ..
    } = c
    else {
        unreachable!()
    };
    let total = population(c, v);
    if !skills::matches_residents(v, people) {
        return (total, 0);
    }
    let selected = resident.as_ref().and_then(|id| resident_id(v, id));
    let matching = people
        .iter()
        .filter(|p| resident.is_none() || selected == Some(p.id))
        .filter(|p| {
            p.energy >= *energy_min
                && p.hunger <= *hunger_max
                && p.social >= *social_min
                && p.happiness >= *happiness_min
        })
        .count() as u32;
    (total, matching)
}
pub(super) fn sample(
    record: &mut GoalState,
    list: &[&GoalCondition],
    v: &Village,
    people: &[Resident],
) {
    for (key, c) in conditions(list) {
        let Some(w) = record.wellbeing.get_mut(&key) else {
            continue;
        };
        let (total, matching) = counts(c, v, people);
        let qualified = total > 0 && matching == total;
        w.since = observation::since(
            w.last,
            w.since,
            w.total > 0 && w.matching == w.total,
            qualified,
            v.minutes,
            MINUTES_PER_SECOND * 0.25,
        );
        w.last = v.minutes;
        w.total = total;
        w.matching = matching;
    }
}
pub fn valid_watch(record: &GoalState, list: &[&GoalCondition], v: &Village) -> bool {
    let expected = conditions(list);
    if expected.len() != record.wellbeing.len() {
        return false;
    }
    let Some(activation) = record.activated_at else {
        return expected.is_empty();
    };
    let end = record.completed_at.unwrap_or(v.minutes);
    expected.iter().all(|(key, c)| {
        record.wellbeing.get(key).is_some_and(|w| {
            if w.total == 0 {
                w.matching == 0 && w.since.is_none() && w.last == activation
            } else {
                w.total == population(c, v)
                    && w.matching <= w.total
                    && observation::valid_period(
                        w.last,
                        w.since,
                        w.matching == w.total,
                        activation,
                        end,
                    )
            }
        })
    })
}
fn current_valid(
    record: &GoalState,
    list: &[&GoalCondition],
    end: Option<f32>,
    v: &Village,
    people: &[Resident],
) -> bool {
    conditions(list).iter().all(|(key, c)| {
        record.wellbeing.get(key).is_some_and(|w| {
            if let Some(end) = end {
                return w.last <= end;
            }
            if w.total == 0 {
                return record.activated_at == Some(v.minutes) && w.last == v.minutes;
            }
            w.last == v.minutes && counts(c, v, people) == (w.total, w.matching)
        })
    })
}
pub fn valid_people(v: &Village, people: &[Resident]) -> bool {
    let Some(journal) = v
        .scenario
        .as_ref()
        .and_then(|o| o.definition.journal.as_ref())
    else {
        return true;
    };
    let Some(state) = v.progress.scenario_journal.as_ref() else {
        return false;
    };
    journal.chapters.iter().flat_map(|c| &c.goals).all(|g| {
        let Some(r) = state.goals.get(&g.id) else {
            return false;
        };
        r.activated_at.is_none() || current_valid(r, &[&g.condition], r.completed_at, v, people)
    }) && journal.events.iter().all(|e| {
        let Some(r) = state.events.get(&e.id) else {
            return false;
        };
        current_valid(
            &r.watch,
            &e.conditions().collect::<Vec<_>>(),
            r.applied_at,
            v,
            people,
        )
    })
}
pub fn measure(c: &GoalCondition, record: &GoalState, v: &Village) -> (bool, serde_json::Value) {
    let GoalCondition::Wellbeing {
        resident,
        energy_min,
        hunger_max,
        social_min,
        happiness_min,
        minutes,
    } = c
    else {
        unreachable!()
    };
    let key = serde_json::to_string(c).unwrap();
    let w = record.wellbeing.get(&key);
    let elapsed = w
        .and_then(|w| w.since.map(|s| (w.last - s).max(0.)))
        .unwrap_or(0.)
        .min(*minutes as f32);
    let complete = elapsed >= *minutes as f32;
    let scope = if resident.is_some() {
        "the chosen friend"
    } else {
        "everyone"
    };
    let description = format!(
        "Keep {scope} at energy ≥ {energy_min}%, fullness ≥ {}%, connection ≥ {social_min}% and wellbeing ≥ {happiness_min}% for {minutes} consecutive observed minutes",
        100. - hunger_max
    );
    let observed = w.is_some_and(|w| w.total > 0);
    (
        complete,
        serde_json::json!({"kind":"wellbeing","unit":"duration_minutes","value":elapsed,"target":minutes,"complete":complete,"description":description,"people":{"observed":observed,"matching":w.map_or(0,|w|w.matching),"total":w.map_or(0,|w|w.total),"observed_at":w.map(|w|w.last),"frozen":record.completed_at.is_some()},"action":{"kind":"people","resident":resident.as_ref().and_then(|id|resident_id(v,id))},"note":"Uses actual needs, including friends who are asleep or away. Checked every native simulation step; any lapse or unobserved gap restarts the period. Time before the first qualifying observation after activation never counts. Pauses add no time. Completed goals keep their credit and final observation."}),
    )
}
pub fn catalog() -> serde_json::Value {
    serde_json::json!({"minimum_minutes":1,"maximum_minutes":MAX_MINUTES,"threshold_minimum":0,"threshold_maximum":100,"observation":"every_native_step","credit":"consecutive_after_activation"})
}
#[cfg(test)]
mod tests;
