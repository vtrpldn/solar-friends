//! Scenario subscriptions observe successful domain transactions, never UI requests.
use super::*;
const LIMIT: u64 = 9_007_199_254_740_991;
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Ledger {
    pub purchased: [u64; economy::COUNT],
    pub sold: [u64; economy::COUNT],
    pub retired_purchased: [u64; economy::COUNT],
}
impl Ledger {
    pub fn amount(&self, direction: TradeDirection, material: &str) -> u64 {
        let index = economy::NAMES
            .iter()
            .position(|key| *key == material)
            .expect("validated trade material");
        match direction {
            TradeDirection::Purchase => self.purchased[index],
            TradeDirection::Sale => self.sold[index],
        }
    }
}
pub fn requested(journal: &Journal) -> bool {
    fn needed(c: &GoalCondition) -> bool {
        match c {
            GoalCondition::Traded { .. } => true,
            GoalCondition::All { conditions } | GoalCondition::Any { conditions } => {
                conditions.iter().any(needed)
            }
            _ => false,
        }
    }
    journal.conditions().any(needed)
}
pub fn received(v: &mut Village, items: &economy::Bundle) {
    let Some(ledger) = v
        .progress
        .scenario_journal
        .as_mut()
        .and_then(|s| s.trade.as_mut())
    else {
        return;
    };
    for (total, n) in ledger.purchased.iter_mut().zip(items) {
        *total = total
            .checked_add(u64::from(*n))
            .expect("trade counter overflow");
    }
}
pub fn sold(v: &mut Village, material: usize, amount: u32) {
    if let Some(ledger) = v
        .progress
        .scenario_journal
        .as_mut()
        .and_then(|s| s.trade.as_mut())
    {
        ledger.sold[material] = ledger.sold[material]
            .checked_add(u64::from(amount))
            .expect("trade counter overflow");
    }
}
pub fn retired(v: &mut Village, items: &[u64; economy::COUNT]) {
    if let Some(ledger) = v
        .progress
        .scenario_journal
        .as_mut()
        .and_then(|s| s.trade.as_mut())
    {
        for (total, n) in ledger.retired_purchased.iter_mut().zip(items) {
            *total = total.checked_add(*n).expect("trade history overflow");
        }
    }
}
pub fn baselines(condition: &GoalCondition, ledger: Option<&Ledger>) -> BTreeMap<String, u64> {
    fn visit(c: &GoalCondition, ledger: Option<&Ledger>, result: &mut BTreeMap<String, u64>) {
        match c {
            GoalCondition::Traded {
                direction,
                material,
                credit: CounterCredit::AfterActivation,
                ..
            } => {
                result.insert(
                    direction.key(material),
                    ledger.map_or(0, |l| l.amount(*direction, material)),
                );
            }
            GoalCondition::All { conditions } | GoalCondition::Any { conditions } => {
                for c in conditions {
                    visit(c, ledger, result);
                }
            }
            _ => {}
        }
    }
    let mut result = BTreeMap::new();
    visit(condition, ledger, &mut result);
    result
}
pub fn valid(ledger: &Ledger, v: &Village) -> bool {
    (0..economy::COUNT).all(|i| {
        let received = v.simulation.materials.as_ref().map_or(0, |m| m.received[i]);
        let spent = v.simulation.materials.as_ref().map_or(0, |m| m.spent[i]);
        let retained: u64 = v
            .economy
            .orders
            .iter()
            .filter(|o| o.status == "delivered")
            .map(|o| u64::from(o.items[i]))
            .sum();
        ledger.purchased[i] <= LIMIT
            && ledger.sold[i] <= LIMIT
            && ledger.retired_purchased[i] <= ledger.purchased[i]
            && ledger.purchased[i] == ledger.retired_purchased[i] + retained
            && ledger.purchased[i] <= received
            && ledger.sold[i] <= spent
            && (i != economy::SCRAPS || ledger.purchased[i] == 0 && ledger.sold[i] == 0)
    })
}
