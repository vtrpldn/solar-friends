//! Age follows owned food through storage, cargo and committed cooking inputs.
use crate::*;
use economy::{COUNT, EGGS, FOOD, HONEY, MEALS, MILK};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Lot {
    pub material: usize,
    pub amount: u32,
    pub produced: f32,
    pub expires: f32,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct State {
    pub schema: u32,
    pub expired: [u64; COUNT],
}
impl Default for State {
    fn default() -> Self {
        Self {
            schema: 1,
            expired: [0; COUNT],
        }
    }
}
/// Fictional game balance, measured from harvest, cooking or first receipt.
pub fn lifetime(material: usize) -> Option<f32> {
    match material {
        FOOD => Some(4. * 1440.),
        MEALS => Some(3. * 1440.),
        EGGS => Some(8. * 1440.),
        MILK => Some(2. * 1440.),
        HONEY => Some(28. * 1440.),
        _ => None,
    }
}
pub fn amount(lots: &[Lot], material: usize) -> u32 {
    lots.iter()
        .filter(|l| l.material == material)
        .map(|l| l.amount)
        .sum()
}
pub fn merge(lots: &mut Vec<Lot>, incoming: impl IntoIterator<Item = Lot>) {
    for lot in incoming {
        if lot.amount == 0 {
            continue;
        }
        if let Some(existing) = lots.iter_mut().find(|l| {
            l.material == lot.material && l.produced == lot.produced && l.expires == lot.expires
        }) {
            existing.amount = existing
                .amount
                .checked_add(lot.amount)
                .expect("food lot overflow");
        } else {
            lots.push(lot);
        }
    }
    lots.sort_by(|a, b| {
        a.expires
            .total_cmp(&b.expires)
            .then(a.material.cmp(&b.material))
            .then(a.produced.total_cmp(&b.produced))
    });
}
pub fn add(lots: &mut Vec<Lot>, material: usize, n: u32, now: f32) {
    if let Some(life) = lifetime(material) {
        merge(
            lots,
            [Lot {
                material,
                amount: n,
                produced: now,
                expires: now + life,
            }],
        );
    }
}
pub fn take(lots: &mut Vec<Lot>, material: usize, n: u32) -> Vec<Lot> {
    if lifetime(material).is_none() || n == 0 {
        return vec![];
    }
    assert!(
        amount(lots, material) >= n,
        "food absent from its dated lots"
    );
    let mut left = n;
    let mut out = vec![];
    for lot in lots.iter_mut().filter(|l| l.material == material) {
        let picked = left.min(lot.amount);
        if picked > 0 {
            out.push(Lot {
                amount: picked,
                ..lot.clone()
            });
            lot.amount -= picked;
            left -= picked;
        }
        if left == 0 {
            break;
        }
    }
    lots.retain(|l| l.amount > 0);
    out
}
fn discard(lots: &mut Vec<Lot>, now: f32) -> [u32; COUNT] {
    let mut expired = [0; COUNT];
    lots.retain(|l| {
        if l.expires <= now {
            expired[l.material] += l.amount;
            false
        } else {
            true
        }
    });
    expired
}
fn valid_lots(v: &Village, lots: &[Lot], items: &economy::Bundle) -> bool {
    if lots.len() > 4096 {
        return false;
    }
    if lots.iter().any(|l| {
        let Some(life) = lifetime(l.material) else {
            return true;
        };
        l.amount == 0
            || l.amount > 600
            || !l.produced.is_finite()
            || !l.expires.is_finite()
            || l.produced < 0.
            || l.produced > v.minutes
            || l.expires != l.produced + life
            || l.expires <= l.produced
            || (v.mode == modes::Mode::Story && l.expires <= v.minutes)
    }) {
        return false;
    }
    if lots.windows(2).any(|w| w[0].expires > w[1].expires) {
        return false;
    }
    [FOOD, MEALS, EGGS, MILK, HONEY]
        .into_iter()
        .all(|i| amount(lots, i) == items[i])
}
pub fn valid(v: &Village) -> bool {
    if v.freshness.schema != 1
        || v.freshness.expired.iter().enumerate().any(|(i, n)| {
            (*n > 0 && lifetime(i).is_none())
                || *n > 9_007_199_254_740_991
                || v.simulation
                    .materials
                    .as_ref()
                    .is_some_and(|m| *n > m.spent[i])
        })
    {
        return false;
    }
    let Some(s) = &v.logistics else {
        return v.version == 3;
    };
    s.stores
        .iter()
        .all(|p| valid_lots(v, &p.food_lots, &p.items))
        && s.shipments.iter().all(|h| {
            let mut items = [0; COUNT];
            if h.carrying {
                items[h.material] = h.amount;
            }
            valid_lots(v, &h.food_lots, &items)
        })
        && v.production.batches.iter().all(|b| {
            let items = if b.active() && b.committed {
                b.inputs
            } else {
                [0; COUNT]
            };
            valid_lots(v, &b.food_lots, &items)
        })
}
pub fn advance(v: &mut Village) {
    if v.mode == modes::Mode::Sandbox || v.logistics.is_none() {
        return;
    }
    let mut spent = [0u32; COUNT];
    let mut spoiled_stores = vec![];
    let s = v.logistics.as_mut().unwrap();
    for p in &mut s.stores {
        let expired = discard(&mut p.food_lots, v.minutes);
        for i in [FOOD, MEALS, EGGS, MILK, HONEY] {
            if expired[i] > 0 {
                p.items[i] -= expired[i];
                spent[i] += expired[i];
                spoiled_stores.push((p.id, i));
            }
        }
    }
    s.shipments.retain_mut(|h| {
        if !h.carrying {
            return !spoiled_stores.contains(&(h.from, h.material));
        }
        let expired = discard(&mut h.food_lots, v.minutes);
        let n = expired[h.material];
        h.amount -= n;
        spent[h.material] += n;
        h.amount > 0
    });
    for i in [FOOD, MEALS, EGGS, MILK, HONEY] {
        if spent[i] > 0 {
            simulation::material_change(v, i, spent[i], false);
            v.freshness.expired[i] += u64::from(spent[i]);
        }
    }
    logistics::sync_totals(v);
    let mut failed = vec![];
    for b in v
        .production
        .batches
        .iter_mut()
        .filter(|b| b.active() && b.committed)
    {
        let expired = discard(&mut b.food_lots, v.minutes);
        if expired.iter().any(|n| *n > 0) {
            for i in [FOOD, MEALS, EGGS, MILK, HONEY] {
                v.freshness.expired[i] += u64::from(expired[i]);
            }
            b.spoiled = true;
            failed.push(b.id);
        }
    }
    for id in failed {
        production::cancel_batch(v, id);
        event(
            v,
            "Ingredients in an interrupted pot spoiled. Any fresh inputs and held gas were recovered; neighbours can prepare another pot.",
        );
    }
    if spent.iter().any(|n| *n > 0) {
        event(
            v,
            "Some stored or carried food spoiled. Supplies shows the losses and the next portions to use.",
        );
    }
}
pub fn view(v: &Village) -> serde_json::Value {
    let mut due = [0u32; COUNT];
    let mut next: [Option<f32>; COUNT] = [None; COUNT];
    let mut inspect = |lots: &[Lot]| {
        for l in lots {
            if l.expires <= v.minutes + 1440. {
                due[l.material] += l.amount;
            }
            next[l.material] = Some(next[l.material].map_or(l.expires, |t| t.min(l.expires)));
        }
    };
    if let Some(s) = &v.logistics {
        for p in &s.stores {
            inspect(&p.food_lots);
        }
        for h in &s.shipments {
            inspect(&h.food_lots);
        }
    }
    for b in &v.production.batches {
        if b.active() {
            inspect(&b.food_lots);
        }
    }
    serde_json::json!({"enabled":v.mode==modes::Mode::Story,"expired":v.freshness.expired,"due_within_day":due,"next_expiry":next,"lifetimes":[{"material":FOOD,"minutes":lifetime(FOOD)},{"material":MEALS,"minutes":lifetime(MEALS)},{"material":EGGS,"minutes":lifetime(EGGS)},{"material":MILK,"minutes":lifetime(MILK)},{"material":HONEY,"minutes":lifetime(HONEY)}],"note":"Game balance days. Moving food or refunding inputs preserves its age. Prepared meals first; use the oldest reachable portions of each kind."})
}
#[cfg(test)]
pub(crate) fn fixture_reseed(v: &mut Village) {
    if let Some(s) = &mut v.logistics {
        for p in &mut s.stores {
            p.food_lots.clear();
            for i in [FOOD, MEALS, EGGS, MILK, HONEY] {
                add(&mut p.food_lots, i, p.items[i], v.minutes);
            }
        }
        for h in &mut s.shipments {
            h.food_lots.clear();
            if h.carrying {
                add(&mut h.food_lots, h.material, h.amount, v.minutes);
            }
        }
    }
    for b in &mut v.production.batches {
        b.food_lots.clear();
        if b.active() && b.committed {
            for i in [FOOD, MEALS, EGGS, MILK, HONEY] {
                add(&mut b.food_lots, i, b.inputs[i], v.minutes);
            }
        }
    }
    v.freshness = State::default();
}

#[cfg(test)]
#[path = "freshness_tests.rs"]
mod tests;
