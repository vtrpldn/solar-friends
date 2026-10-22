use super::*;
fn definition(v: &Village) -> Option<&Journal> {
    v.scenario.as_ref()?.definition.journal.as_ref()
}
pub(super) fn observation(conditions: &[&GoalCondition], state: &State, v: &Village) -> GoalState {
    let mut buildings: Vec<_> = v
        .buildings
        .iter()
        .filter(|b| b.progress >= 100.)
        .map(|b| b.id)
        .collect();
    buildings.sort_unstable();
    GoalState {
        activated_at: Some(v.minutes),
        completed_at: None,
        harvest_baseline: v.harvests,
        building_baseline: buildings,
        production_baseline: conditions
            .iter()
            .flat_map(|c| production_baselines(c, v))
            .collect(),
        trade_baseline: conditions
            .iter()
            .flat_map(|c| trade::baselines(c, state.trade.as_ref()))
            .collect(),
        delivery_baseline: conditions
            .iter()
            .flat_map(|c| delivery::baselines(c, state.delivery.as_ref()))
            .collect(),
    }
}
fn activate(chapter: &Chapter, state: &mut State, v: &Village) {
    for goal in &chapter.goals {
        let record = observation(&[&goal.condition], state, v);
        state.goals.insert(goal.id.clone(), record);
    }
}
pub(super) fn baseline_shape(record: &GoalState, v: &Village) -> bool {
    record.building_baseline.len() <= ((MAP_SIZE - 2) * (MAP_SIZE - 2)) as usize
        && !record
            .building_baseline
            .windows(2)
            .any(|pair| pair[0] >= pair[1])
        && !record
            .building_baseline
            .iter()
            .any(|id| *id >= v.economy.next_building)
        && record.harvest_baseline <= v.harvests
}
pub(super) fn valid_watch(
    record: &GoalState,
    conditions: &[&GoalCondition],
    state: &State,
    v: &Village,
) -> bool {
    fn bounded(actual: &BTreeMap<String, u64>, current: BTreeMap<String, u64>) -> bool {
        actual.len() == current.len()
            && actual
                .iter()
                .all(|(key, value)| current.get(key).is_some_and(|limit| value <= limit))
    }
    baseline_shape(record, v)
        && bounded(
            &record.production_baseline,
            conditions
                .iter()
                .flat_map(|c| production_baselines(c, v))
                .collect(),
        )
        && bounded(
            &record.trade_baseline,
            conditions
                .iter()
                .flat_map(|c| trade::baselines(c, state.trade.as_ref()))
                .collect(),
        )
        && bounded(
            &record.delivery_baseline,
            conditions
                .iter()
                .flat_map(|c| delivery::baselines(c, state.delivery.as_ref()))
                .collect(),
        )
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
        events: BTreeMap::new(),
        locked_buildings: journal.locked_buildings.iter().cloned().collect(),
        last_sample: v.minutes,
        finished_at: None,
        trade: trade::requested(journal).then(trade::Ledger::default),
        delivery: delivery::initialize(journal),
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
    state.events = events::initialize(journal, &state, v);
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
                && measure(
                    &goal.condition,
                    record,
                    &previous,
                    v,
                    state.trade.as_ref(),
                    state.delivery.as_ref(),
                )
                .0
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
    events::advance(journal, &mut state, v);
    state.last_sample = v.minutes;
    v.progress.scenario_journal = Some(state);
}
pub(super) fn measure(
    c: &GoalCondition,
    record: &GoalState,
    goals: &HashSet<String>,
    v: &Village,
    trade_ledger: Option<&trade::Ledger>,
    delivery_ledger: Option<&delivery::Ledger>,
) -> (bool, serde_json::Value) {
    use serde_json::json;
    let (value, target, label) = match c {
        GoalCondition::Buildings {
            building,
            count,
            credit,
            region,
        } => {
            let n = v
                .buildings
                .iter()
                .filter(|b| {
                    b.kind == *building
                        && b.progress >= 100.
                        && region.as_ref().is_none_or(|id| {
                            v.scenario.as_ref().is_some_and(|s| {
                                s.definition
                                    .map
                                    .regions
                                    .iter()
                                    .any(|r| r.id == *id && r.contains_building(b))
                            })
                        })
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
            let label = if let Some(region) = region.as_ref().and_then(|id| {
                v.scenario
                    .as_ref()?
                    .definition
                    .map
                    .regions
                    .iter()
                    .find(|r| r.id == *id)
            }) {
                format!("{label}, with the full footprint inside {}", region.title)
            } else {
                label
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
            format!(
                "Reach day {} at {:02}:{:02}",
                (*minute / 1440.).floor() as u32 + 1,
                (*minute % 1440. / 60.).floor() as u32,
                (*minute % 60.).floor() as u32
            ),
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
        GoalCondition::Delivered {
            material,
            count,
            credit,
            building,
        } => {
            let key = delivery::key(building.as_deref(), material);
            let total = delivery_ledger
                .and_then(|l| l.totals.get(&key))
                .copied()
                .unwrap_or(0);
            let baseline = if *credit == CounterCredit::AfterActivation {
                record.delivery_baseline.get(&key).copied().unwrap_or(0)
            } else {
                0
            };
            let target = building
                .as_ref()
                .and_then(|id| {
                    v.scenario
                        .as_ref()?
                        .definition
                        .start
                        .buildings
                        .iter()
                        .find(|b| b.id == *id)
                })
                .map_or_else(
                    || "the arrival store".into(),
                    |b| {
                        let runtime = v.scenario.as_ref().and_then(|s| s.buildings.get(&b.id));
                        v.buildings
                            .iter()
                            .find(|live| Some(&live.id) == runtime)
                            .map_or_else(
                                || format!("the removed starting {}", b.kind.replace('_', " ")),
                                |live| {
                                    format!(
                                        "{} at ({}, {})",
                                        live.kind.replace('_', " "),
                                        live.x,
                                        live.y
                                    )
                                },
                            )
                    },
                );
            (
                total.saturating_sub(baseline) as f64,
                f64::from(*count),
                format!(
                    "Carry {count} units of {material} to {target} {}",
                    if *credit == CounterCredit::Run {
                        "during this playthrough"
                    } else {
                        "after this goal starts"
                    }
                ),
            )
        }
        GoalCondition::Traded {
            direction,
            material,
            count,
            credit,
        } => {
            let baseline = if *credit == CounterCredit::AfterActivation {
                record
                    .trade_baseline
                    .get(&direction.key(material))
                    .copied()
                    .unwrap_or(0)
            } else {
                0
            };
            let amount = trade_ledger
                .map_or(0, |l| l.amount(*direction, material))
                .saturating_sub(baseline);
            (
                amount as f64,
                f64::from(*count),
                format!(
                    "{} {count} units of {material} {}",
                    if *direction == TradeDirection::Purchase {
                        "Receive a town purchase of"
                    } else {
                        "Sell"
                    },
                    if *credit == CounterCredit::Run {
                        "during this playthrough"
                    } else {
                        "after this goal starts"
                    }
                ),
            )
        }
        GoalCondition::Produced {
            material,
            count,
            credit,
        } => {
            let index = economy::NAMES
                .iter()
                .position(|key| *key == material)
                .expect("validated produced material");
            let baseline = if *credit == CounterCredit::AfterActivation {
                record
                    .production_baseline
                    .get(material)
                    .copied()
                    .unwrap_or(0)
            } else {
                0
            };
            let amount = v.production.accounting.outputs[index].saturating_sub(baseline);
            (
                amount as f64,
                f64::from(*count),
                format!(
                    "Produce {count} units of {} {}",
                    economy::LABELS[index].to_lowercase(),
                    if *credit == CounterCredit::Run {
                        "during this playthrough"
                    } else {
                        "after this goal starts"
                    }
                ),
            )
        }
        GoalCondition::Maintain { outcome, minutes } => {
            // Credit only the post-activation portion of the current consecutive
            // observed period. Earlier best periods and unobserved time never count.
            let age = v
                .progress
                .outcomes
                .last_sample
                .zip(record.activated_at)
                .map_or(0., |(sample, activation)| (sample - activation).max(0.));
            let elapsed = v.progress.outcomes.current[outcome.index()].min(age);
            (
                f64::from(elapsed),
                f64::from(*minutes),
                format!(
                    "{} for {minutes} consecutive observed minutes after this goal starts",
                    outcome.name()
                ),
            )
        }
        GoalCondition::Goal { goal } => {
            let done = goals.contains(goal);
            let title = definition(v)
                .and_then(|j| {
                    j.chapters
                        .iter()
                        .flat_map(|c| &c.goals)
                        .find(|g| g.id == *goal)
                })
                .map(|g| g.title.as_str())
                .unwrap_or("earlier goal");
            return (
                done,
                json!({"kind":"goal","goal":goal,"complete":done,"description":format!("Complete {title}"),"action":{"kind":"goal","goal":goal}}),
            );
        }
        GoalCondition::All { conditions } | GoalCondition::Any { conditions } => {
            let results: Vec<_> = conditions
                .iter()
                .map(|c| measure(c, record, goals, v, trade_ledger, delivery_ledger))
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
    let (kind, unit) = match c {
        GoalCondition::Buildings { .. } => ("buildings", "count"),
        GoalCondition::Stored { .. } => ("stored", "count"),
        GoalCondition::Funds { .. } => ("funds", "cents"),
        GoalCondition::Date { .. } => ("date", "minutes"),
        GoalCondition::Harvests { .. } => ("harvests", "count"),
        GoalCondition::Produced { .. } => ("produced", "count"),
        GoalCondition::Traded { .. } => ("traded", "count"),
        GoalCondition::Delivered { .. } => ("delivered", "count"),
        GoalCondition::Maintain { .. } => ("maintain", "duration_minutes"),
        _ => unreachable!(),
    };
    let note = if let GoalCondition::Maintain { outcome, .. } = c {
        let minimums = outcomes::food_minimums(v);
        Some(match outcome {
            ObservedOutcome::Pantry => format!("After arrival, every resident must have hunger at most 65 and energy at least 25, with access to at least {} stored food portions for this population.", minimums[0]),
            ObservedOutcome::Diet => format!("After arrival, every resident must have hunger at most 65 and energy at least 25, with access to at least {} stored food portions for this population. This observation does not measure dietary variety.", minimums[1]),
            ObservedOutcome::Services => "Residents must be healthy, with an occupied home and completed kitchen, washing available at every occupied home and kitchen, and every completed ecological toilet usable.".into(),
            ObservedOutcome::Night => "At least one streetlight must be connected, enabled and fully illuminated while native darkness exceeds 0.5.".into(),
            ObservedOutcome::Dry => format!("During the dry season, every resident must be healthy and housed, with social wellbeing at least 25, working household services and access to at least {} stored food portions.", minimums[2]),
        })
    } else {
        None
    };
    let action = match c {
        GoalCondition::Buildings {
            building, region, ..
        } => {
            let mut action = json!({"kind":"build","building":building});
            if let Some(region) = region {
                action["region"] = json!(region);
            }
            action
        }
        GoalCondition::Produced { material, .. } => {
            json!({"kind":"production","material":material})
        }
        GoalCondition::Delivered {
            material, building, ..
        } => {
            json!({"kind":"delivery","material":material,"destination":building.as_ref().and_then(|id|v.scenario.as_ref()?.buildings.get(id))})
        }
        GoalCondition::Traded { material, .. } => json!({"kind":"trade","material":material}),
        GoalCondition::Stored { material, .. } => json!({"kind":"trade","material":material}),
        GoalCondition::Funds { .. } => json!({"kind":"trade"}),
        GoalCondition::Harvests { .. } => json!({"kind":"build","building":"garden"}),
        _ => serde_json::Value::Null,
    };
    (
        complete,
        json!({"kind":kind,"unit":unit,"complete":complete,"value":value,"target":target,"description":label,"action":action,"note":note}),
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
            let condition=if record.activated_at.is_some(){measure(&goal.condition,record,&completed,v,state.trade.as_ref(),state.delivery.as_ref()).1}else{serde_json::Value::Null};
            serde_json::json!({"id":goal.id,"title":goal.title,"description":goal.description,"optional":goal.optional,"status":status,"activated_at":record.activated_at,"completed_at":record.completed_at,"condition":condition})
        }).collect();
        serde_json::json!({"id":chapter.id,"title":chapter.title,"description":chapter.description,"completed_at":state.chapters[&chapter.id],"goals":goals})
    }).collect();
    serde_json::json!({"schema":1,"introduction":journal.introduction,"completion":journal.completion,"finished_at":state.finished_at,"chapters":chapters,"events":events::view(journal,state,v)})
}

pub fn valid(v: &Village) -> bool {
    let Some(journal) = definition(v) else {
        return v.progress.scenario_journal.is_none();
    };
    let Some(state) = &v.progress.scenario_journal else {
        return false;
    };
    if !events::valid(journal, state, v) {
        return false;
    }
    if !delivery::valid(state.delivery.as_ref(), journal, v) {
        return false;
    }
    if state.trade.is_some() != trade::requested(journal)
        || state
            .trade
            .as_ref()
            .is_some_and(|ledger| !trade::valid(ledger, v))
    {
        return false;
    }
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
            if !baseline_shape(record, v)
                || active && !valid_watch(record, &[&goal.condition], state, v)
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
                || !record.production_baseline.is_empty()
                || !record.trade_baseline.is_empty()
                || !record.delivery_baseline.is_empty()
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
