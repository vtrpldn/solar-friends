//! Credit a physical resident dropoff only after its shipment has been removed.
use super::*;
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Ledger {
    pub totals: BTreeMap<String, u64>,
}
pub fn key(building: Option<&str>, material: &str) -> String {
    building.map_or_else(
        || format!("camp:{material}"),
        |id| format!("building:{id}:{material}"),
    )
}
fn visit(condition: &GoalCondition, only_activation: bool, result: &mut BTreeMap<String, u64>) {
    match condition {
        GoalCondition::Delivered {
            building,
            material,
            credit,
            ..
        } if !only_activation || *credit == CounterCredit::AfterActivation => {
            result.insert(key(building.as_deref(), material), 0);
        }
        GoalCondition::All { conditions } | GoalCondition::Any { conditions } => {
            for c in conditions {
                visit(c, only_activation, result);
            }
        }
        _ => {}
    }
}
pub fn initialize(journal: &Journal) -> Option<Ledger> {
    let mut totals = BTreeMap::new();
    for condition in journal.conditions() {
        visit(condition, false, &mut totals);
    }
    (!totals.is_empty()).then_some(Ledger { totals })
}
pub fn baselines(condition: &GoalCondition, ledger: Option<&Ledger>) -> BTreeMap<String, u64> {
    let mut result = BTreeMap::new();
    visit(condition, true, &mut result);
    for (key, value) in &mut result {
        *value = ledger.and_then(|l| l.totals.get(key)).copied().unwrap_or(0);
    }
    result
}
pub fn received(v: &mut Village, owner: logistics::Owner, material: usize, amount: u32) {
    if v.progress
        .scenario_journal
        .as_ref()
        .and_then(|s| s.delivery.as_ref())
        .is_none()
    {
        return;
    }
    let building = match owner {
        logistics::Owner::Camp => None,
        logistics::Owner::Warehouse(id)
        | logistics::Owner::Site(id)
        | logistics::Owner::Pantry(id) => Some(id),
        logistics::Owner::Production(id) => {
            let Some(building) = production::building(v, id) else {
                return;
            };
            Some(building)
        }
        _ => return,
    };
    let authored = if let Some(id) = building {
        let Some(origin) = v.scenario.as_ref() else {
            return;
        };
        let Some((key, _)) = origin.buildings.iter().find(|(_, value)| **value == id) else {
            return;
        };
        Some(key.as_str())
    } else {
        None
    };
    let key = key(authored, economy::NAMES[material]);
    if let Some(total) = v
        .progress
        .scenario_journal
        .as_mut()
        .and_then(|s| s.delivery.as_mut())
        .and_then(|l| l.totals.get_mut(&key))
    {
        *total = total
            .checked_add(u64::from(amount))
            .expect("delivery counter overflow");
    }
}
pub fn valid(ledger: Option<&Ledger>, journal: &Journal, v: &Village) -> bool {
    let expected = initialize(journal);
    match (ledger, expected) {
        (None, None) => true,
        (Some(actual), Some(expected)) => {
            actual.totals.len() == expected.totals.len()
                && actual.totals.keys().eq(expected.totals.keys())
                && actual.totals.values().all(|n| *n <= 9_007_199_254_740_991)
                && actual.totals.values().copied().sum::<u64>()
                    <= u64::from(v.simulation.next_id) * u64::from(logistics::LOAD)
        }
        _ => false,
    }
}
pub fn targets_valid(c: &GoalCondition, d: &Definition) -> bool {
    match c {
        GoalCondition::Delivered {
            building: Some(id), ..
        } => d.start.buildings.iter().any(|b| {
            b.id == *id
                && logistics::receives_at_building(&b.kind, b.state == BuildingState::Completed)
        }),
        GoalCondition::All { conditions } | GoalCondition::Any { conditions } => {
            conditions.iter().all(|c| targets_valid(c, d))
        }
        _ => true,
    }
}
