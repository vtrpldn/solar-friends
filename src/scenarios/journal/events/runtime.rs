use super::*;
pub fn initialize(journal: &Journal, state: &State, v: &Village) -> BTreeMap<String, EventRecord> {
    journal
        .events
        .iter()
        .map(|e| {
            let conditions: Vec<_> = e.conditions().collect();
            (
                e.id.clone(),
                EventRecord {
                    watch: super::super::runtime::observation(&conditions, state, v),
                    triggered_at: None,
                    applied_at: None,
                    result: None,
                },
            )
        })
        .collect()
}
fn happened(trigger: &EventTrigger, state: &State, v: &Village) -> bool {
    match trigger {
        EventTrigger::Start => true,
        EventTrigger::Goal { goal } => state
            .goals
            .get(goal)
            .is_some_and(|g| g.completed_at.is_some()),
        EventTrigger::Chapter { chapter } => {
            state.chapters.get(chapter).is_some_and(Option::is_some)
        }
        EventTrigger::Date { minute } => v.minutes >= *minute,
        EventTrigger::Threshold { .. } => true,
    }
}
pub fn advance(journal: &Journal, state: &mut State, v: &mut Village) {
    if journal.events.is_empty() {
        return;
    }
    let completed: HashSet<_> = state
        .goals
        .iter()
        .filter(|(_, g)| g.completed_at.is_some())
        .map(|(id, _)| id.clone())
        .collect();
    // Every eligibility decision sees the same pre-effect village. EventDefinition
    // order resolves simultaneous effects; grants cannot form same-step chains.
    let ready: Vec<_> = journal
        .events
        .iter()
        .filter(|event| {
            let record = &state.events[&event.id];
            record.applied_at.is_none()
                && (record.triggered_at.is_some()
                    || happened(&event.trigger, state, v)
                        && event.conditions().all(|c| {
                            super::super::runtime::measure(
                                c,
                                &record.watch,
                                &completed,
                                v,
                                state.trade.as_ref(),
                                state.delivery.as_ref(),
                            )
                            .0
                        }))
        })
        .collect();
    for event in ready {
        let record = state.events.get_mut(&event.id).unwrap();
        record.triggered_at.get_or_insert(v.minutes);
        let result = match &event.effect {
            EventEffect::DeliverSupplies {
                material,
                count,
                building,
            } => supplies::deliver(v, material, *count, building.as_deref()).then(|| {
                EffectResult::SuppliesDelivered {
                    material: material.clone(),
                    count: *count,
                    building: building.clone(),
                }
            }),
            EventEffect::Message { text } => {
                crate::event(v, text.clone());
                Some(EffectResult::Message)
            }
            EventEffect::UnlockBuilding { building } => {
                state.locked_buildings.remove(building);
                Some(EffectResult::BuildingUnlocked {
                    building: building.clone(),
                })
            }
            EventEffect::GrantFunds { cents } => economy::scenario_grant(v, *cents, &event.title)
                .then_some(EffectResult::Funds { cents: *cents }),
        };
        if let Some(result) = result {
            record.applied_at = Some(v.minutes);
            record.result = Some(result);
        }
    }
}
pub fn valid(journal: &Journal, state: &State, v: &Village) -> bool {
    let mut expected: std::collections::BTreeSet<_> = journal
        .locked_buildings
        .iter()
        .filter(|kind| {
            !journal.events.iter().any(|e| {
                matches!(&e.effect,EventEffect::UnlockBuilding{building} if building==*kind)
                    && state
                        .events
                        .get(&e.id)
                        .is_some_and(|record| record.applied_at.is_some())
            })
        })
        .cloned()
        .collect();
    if state.continued_at.is_some() { expected.clear(); }
    if !supplies::valid_receipts(journal, state, v) || state.locked_buildings != expected {
        return false;
    }
    if state.events.len() != journal.events.len() {
        return false;
    }
    let origin = v.scenario.as_ref().unwrap();
    let start = origin.definition.start.minutes;
    let mut buildings: Vec<_> = origin
        .definition
        .start
        .buildings
        .iter()
        .filter(|b| b.state == BuildingState::Completed)
        .filter_map(|b| origin.buildings.get(&b.id).copied())
        .collect();
    buildings.sort_unstable();
    journal.events.iter().all(|event| {
        let Some(record) = state.events.get(&event.id) else {
            return false;
        };
        let conditions: Vec<_> = event.conditions().collect();
        if record.watch.activated_at != Some(start)
            || record.watch.completed_at.is_some()
            || record.watch.harvest_baseline != 0
            || record.watch.building_baseline != buildings
            || !super::super::runtime::valid_watch(&record.watch, &conditions, state, v)
            || record
                .watch
                .production_baseline
                .values()
                .chain(record.watch.trade_baseline.values())
                .chain(record.watch.delivery_baseline.values())
                .any(|n| *n != 0)
        {
            return false;
        }
        if record
            .triggered_at
            .is_some_and(|n| !n.is_finite() || n < start || n > v.minutes)
            || record.applied_at.is_some_and(|n| {
                !n.is_finite()
                    || record.triggered_at.is_none_or(|trigger| n < trigger)
                    || n > v.minutes
            })
        {
            return false;
        }
        if let Some(time) = record.triggered_at {
            let earliest = match &event.trigger {
                EventTrigger::Date { minute } => Some(*minute),
                EventTrigger::Goal { goal } => state.goals.get(goal).and_then(|g| g.completed_at),
                EventTrigger::Chapter { chapter } => state.chapters.get(chapter).copied().flatten(),
                _ => Some(start),
            };
            if earliest.is_none_or(|earliest| time < earliest) {
                return false;
            }
        }
        match (&record.result, &event.effect, record.applied_at) {
            (None, EventEffect::UnlockBuilding { .. }, None) => record.triggered_at.is_none(),
            (None, EventEffect::Message { .. }, None) => record.triggered_at.is_none(),
            (None, EventEffect::GrantFunds { .. } | EventEffect::DeliverSupplies { .. }, None) => {
                true
            }
            (
                Some(EffectResult::SuppliesDelivered {
                    material,
                    count,
                    building,
                }),
                EventEffect::DeliverSupplies {
                    material: expected,
                    count: amount,
                    building: destination,
                },
                Some(_),
            ) => material == expected && count == amount && building == destination,
            (
                Some(EffectResult::BuildingUnlocked { building }),
                EventEffect::UnlockBuilding { building: expected },
                Some(_),
            ) => building == expected,
            (Some(EffectResult::Message), EventEffect::Message { .. }, Some(_)) => true,
            (
                Some(EffectResult::Funds { cents }),
                EventEffect::GrantFunds { cents: expected },
                Some(_),
            ) => cents == expected,
            _ => false,
        }
    })
}
pub fn view(journal: &Journal, state: &State, v: &Village) -> serde_json::Value {
    serde_json::json!(journal.events.iter().map(|e|{let record=&state.events[&e.id];serde_json::json!({"speaker":roles::speaker(v,e.speaker.as_ref()),"id":e.id,"title":e.title,"when":e.trigger,"effect":e.effect,"triggered_at":record.triggered_at,"applied_at":record.applied_at,"result":record.result,"status":if record.applied_at.is_some(){"applied"}else if record.triggered_at.is_some(){if matches!(e.effect,EventEffect::DeliverSupplies{..}){"waiting_for_delivery"}else{"waiting_for_fund_space"}}else{"watching"},"shared_fund_cents":v.economy.money,"destination":if let EventEffect::DeliverSupplies{building,..}=&e.effect{supplies::destination(v,building.as_deref())}else{None},"delivery_blocker":if record.triggered_at.is_some()&&record.applied_at.is_none(){if let EventEffect::DeliverSupplies{count,building,..}=&e.effect{supplies::blocker(v,*count,building.as_deref())}else{None}}else{None}})}).collect::<Vec<_>>())
}
