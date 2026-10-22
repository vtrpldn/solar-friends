use super::*;
fn definition(v: &Village) -> Option<&Journal> {
    v.scenario.as_ref()?.definition.journal.as_ref()
}
fn activate(chapter: &Chapter, state: &mut State, v: &Village) {
    let mut buildings: Vec<_> = v
        .buildings
        .iter()
        .filter(|b| b.progress >= 100.)
        .map(|b| b.id)
        .collect();
    buildings.sort_unstable();
    for goal in &chapter.goals {
        state.goals.insert(
            goal.id.clone(),
            GoalState {
                activated_at: Some(v.minutes),
                completed_at: None,
                harvest_baseline: v.harvests,
                building_baseline: buildings.clone(),
            },
        );
    }
}
pub fn initialize(v: &mut Village) {
    let Some(origin) = v.scenario.clone() else {
        return;
    };
    let Some(journal) = origin.definition.journal.as_ref() else {
        return;
    };
    let mut state = State {
        schema: 1,
        last_sample: v.minutes,
        finished_at: None,
        chapters: journal
            .chapters
            .iter()
            .map(|c| (c.id.clone(), None))
            .collect(),
        goals: journal
            .chapters
            .iter()
            .flat_map(|c| c.goals.iter().map(|g| (g.id.clone(), GoalState::default())))
            .collect(),
    };
    activate(&journal.chapters[0], &mut state, v);
    v.progress.scenario_journal = Some(state);
    advance(v);
}
pub fn advance(v: &mut Village) {
    let Some(origin) = v.scenario.clone() else {
        return;
    };
    let Some(journal) = origin.definition.journal.as_ref() else {
        return;
    };
    let Some(mut state) = v.progress.scenario_journal.take() else {
        return;
    };
    // References see the previous observation. Dependency chains cannot loop
    // or cascade through an unbounded number of effects in one simulation step.
    let previous: HashSet<String> = state
        .goals
        .iter()
        .filter(|(_, g)| g.completed_at.is_some())
        .map(|(id, _)| id.clone())
        .collect();
    for chapter in &journal.chapters {
        for goal in &chapter.goals {
            let record = &state.goals[&goal.id];
            if record.activated_at.is_some()
                && record.completed_at.is_none()
                && measure(&goal.condition, record, &previous, v).0
            {
                state.goals.get_mut(&goal.id).unwrap().completed_at = Some(v.minutes);
            }
        }
    }
    if let Some(index) = journal
        .chapters
        .iter()
        .position(|c| state.chapters[&c.id].is_none())
    {
        let chapter = &journal.chapters[index];
        if chapter
            .goals
            .iter()
            .filter(|g| !g.optional)
            .all(|g| state.goals[&g.id].completed_at.is_some())
        {
            state.chapters.insert(chapter.id.clone(), Some(v.minutes));
            if let Some(next) = journal.chapters.get(index + 1) {
                activate(next, &mut state, v);
            } else {
                state.finished_at = Some(v.minutes);
            }
        }
    }
    state.last_sample = v.minutes;
    v.progress.scenario_journal = Some(state);
}
fn measure(
    c: &GoalCondition,
    record: &GoalState,
    goals: &HashSet<String>,
    v: &Village,
) -> (bool, serde_json::Value) {
    use serde_json::json;
    let (value, target, label) = match c {
        GoalCondition::Buildings {
            building,
            count,
            credit,
        } => {
            let n = v
                .buildings
                .iter()
                .filter(|b| {
                    b.kind == *building
                        && b.progress >= 100.
                        && (*credit == BuildingCredit::Present
                            || record.building_baseline.binary_search(&b.id).is_err())
                })
                .count();
            let label = if *credit == BuildingCredit::Present {
                format!("Have {count} completed {building} buildings")
            } else {
                format!(
                    "Have {count} {building} buildings completed after activation and still standing"
                )
            };
            (n as f64, f64::from(*count), label)
        }
        GoalCondition::Stored { material, count } => {
            let i = economy::NAMES
                .iter()
                .position(|name| *name == material)
                .expect("validated material");
            (
                f64::from(economy::free(v, i)),
                f64::from(*count),
                format!("Keep {count} unreserved {material} units at stores"),
            )
        }
        GoalCondition::Funds { cents } => (
            v.economy.money as f64,
            *cents as f64,
            format!("Reach a community fund of R$ {:.2}", *cents as f64 / 100.),
        ),
        GoalCondition::Date { minute } => (
            f64::from(v.minutes),
            f64::from(*minute),
            format!("Reach game minute {minute}"),
        ),
        GoalCondition::Harvests { count, credit } => {
            let n = if *credit == CounterCredit::Run {
                v.harvests
            } else {
                v.harvests.saturating_sub(record.harvest_baseline)
            };
            (
                f64::from(n),
                f64::from(*count),
                format!(
                    "Complete {count} harvests {}",
                    if *credit == CounterCredit::Run {
                        "during this run"
                    } else {
                        "after this goal activates"
                    }
                ),
            )
        }
        GoalCondition::Goal { goal } => {
            let done = goals.contains(goal);
            return (
                done,
                json!({"kind":"goal","goal":goal,"complete":done,"description":format!("Complete goal {goal}")}),
            );
        }
        GoalCondition::All { conditions } | GoalCondition::Any { conditions } => {
            let results: Vec<_> = conditions
                .iter()
                .map(|c| measure(c, record, goals, v))
                .collect();
            let all = matches!(c, GoalCondition::All { .. });
            let complete = if all {
                results.iter().all(|r| r.0)
            } else {
                results.iter().any(|r| r.0)
            };
            return (
                complete,
                json!({"kind":if all{"all"}else{"any"},"complete":complete,"conditions":results.into_iter().map(|r|r.1).collect::<Vec<_>>()}),
            );
        }
    };
    let complete = value >= target;
    let action = match c {
        GoalCondition::Buildings { building, .. } => json!({"kind":"build","building":building}),
        GoalCondition::Stored { material, .. } => json!({"kind":"trade","material":material}),
        GoalCondition::Funds { .. } => json!({"kind":"trade"}),
        GoalCondition::Harvests { .. } => json!({"kind":"build","building":"garden"}),
        _ => serde_json::Value::Null,
    };
    (
        complete,
        json!({"complete":complete,"value":value,"target":target,"description":label,"action":action}),
    )
}
pub fn view(v: &Village) -> serde_json::Value {
    let (Some(journal), Some(state)) = (definition(v), &v.progress.scenario_journal) else {
        return serde_json::Value::Null;
    };
    let completed: HashSet<String> = state
        .goals
        .iter()
        .filter(|(_, g)| g.completed_at.is_some())
        .map(|(id, _)| id.clone())
        .collect();
    let chapters:Vec<_>=journal.chapters.iter().map(|chapter| {
        let goals:Vec<_>=chapter.goals.iter().map(|goal| {
            let record=&state.goals[&goal.id];
            let status=if record.completed_at.is_some(){"complete"}else if record.activated_at.is_some(){"active"}else{"locked"};
            let condition=if record.activated_at.is_some(){measure(&goal.condition,record,&completed,v).1}else{serde_json::Value::Null};
            serde_json::json!({"id":goal.id,"title":goal.title,"description":goal.description,"optional":goal.optional,"status":status,"activated_at":record.activated_at,"completed_at":record.completed_at,"condition":condition})
        }).collect();
        serde_json::json!({"id":chapter.id,"title":chapter.title,"description":chapter.description,"completed_at":state.chapters[&chapter.id],"goals":goals})
    }).collect();
    serde_json::json!({"schema":1,"introduction":journal.introduction,"completion":journal.completion,"finished_at":state.finished_at,"chapters":chapters})
}

pub fn valid(v: &Village) -> bool {
    let Some(journal) = definition(v) else {
        return v.progress.scenario_journal.is_none();
    };
    let Some(state) = &v.progress.scenario_journal else {
        return false;
    };
    if state.schema != 1
        || !state.last_sample.is_finite()
        || state.last_sample != v.minutes
        || state.goals.len()
            != journal
                .chapters
                .iter()
                .map(|c| c.goals.len())
                .sum::<usize>()
        || state.chapters.len() != journal.chapters.len()
    {
        return false;
    }
    let start = v.scenario.as_ref().unwrap().definition.start.minutes;
    let time = |n: f32| n.is_finite() && (start..=v.minutes).contains(&n);
    let mut future = false;
    let mut activated = start;
    let mut last_completed = None;
    for chapter in &journal.chapters {
        let Some(completed) = state.chapters.get(&chapter.id) else {
            return false;
        };
        if future && completed.is_some() || completed.is_some_and(|n| !time(n) || n < activated) {
            return false;
        }
        let active = !future;
        for goal in &chapter.goals {
            let Some(record) = state.goals.get(&goal.id) else {
                return false;
            };
            if record.building_baseline.len() > ((MAP_SIZE - 2) * (MAP_SIZE - 2)) as usize
                || record
                    .building_baseline
                    .windows(2)
                    .any(|pair| pair[0] >= pair[1])
                || record
                    .building_baseline
                    .iter()
                    .any(|&id| id >= v.economy.next_building)
                || record.harvest_baseline > v.harvests
            {
                return false;
            }
            if active {
                if record.activated_at != Some(activated)
                    || record
                        .completed_at
                        .is_some_and(|n| !time(n) || n < activated)
                {
                    return false;
                }
                if let Some(done) = completed
                    && !goal.optional
                    && record.completed_at.is_none_or(|n| n > *done)
                {
                    return false;
                }
            } else if record.activated_at.is_some()
                || record.completed_at.is_some()
                || record.harvest_baseline != 0
                || !record.building_baseline.is_empty()
            {
                return false;
            }
        }
        if active
            && completed.is_none()
            && chapter
                .goals
                .iter()
                .filter(|g| !g.optional)
                .all(|g| state.goals[&g.id].completed_at.is_some())
        {
            return false;
        }
        if let Some(done) = completed {
            activated = *done;
            last_completed = Some(*done);
        } else if !future {
            future = true;
        }
    }
    if future {
        state.finished_at.is_none()
    } else {
        state.finished_at == last_completed && state.finished_at.is_some_and(time)
    }
}
