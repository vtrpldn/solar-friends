//! Local electrical energy and cable flow. Gameplay owns installation and demand order.
use crate::MAP_SIZE;
pub use crate::simulation::Id;
use serde::{Deserialize, Serialize};
use std::collections::{HashSet, VecDeque};
const EPS: f64 = 0.000_001;
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "id", rename_all = "snake_case")]
pub enum Owner {
    Building(usize),
    Pump(Id),
    Ground,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    Solar,
    Hydro,
    Roof,
    Consumer,
    Pump,
    Battery,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Node {
    pub id: Id,
    pub owner: Owner,
    pub kind: Kind,
    pub x: i32,
    pub y: i32,
    pub size: i32,
    pub capacity: f64,
    pub charge: f64,
}
impl Node {
    fn valid(&self, next: u32) -> bool {
        self.id.0 > 0
            && self.id.0 < next
            && (1..MAP_SIZE - 1).contains(&self.x)
            && (1..MAP_SIZE - 1).contains(&self.y)
            && (1..=3).contains(&self.size)
            && self.charge.is_finite()
            && self.charge >= 0.
            && self.charge <= self.capacity
            && match self.kind {
                Kind::Solar => self.capacity == 36.,
                Kind::Hydro => self.capacity == 18.,
                Kind::Roof => self.capacity == 4.,
                Kind::Consumer | Kind::Pump => self.capacity == 0.,
                Kind::Battery => [4., 18., 36.].contains(&self.capacity),
            }
            && match self.owner {
                Owner::Pump(id) => id.0 > 0 && id.0 < next && id != self.id,
                _ => true,
            }
            && matches!(
                (self.owner, self.kind),
                (Owner::Ground, Kind::Battery)
                    | (Owner::Pump(_), Kind::Pump)
                    | (
                        Owner::Building(_),
                        Kind::Solar | Kind::Hydro | Kind::Roof | Kind::Consumer
                    )
            )
    }
    fn peak(&self) -> f64 {
        match self.kind {
            Kind::Solar => 6.,
            Kind::Hydro => 2.34,
            Kind::Roof => 0.6,
            _ => 0.,
        }
    }
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Account {
    pub opening: f64,
    pub generated: f64,
    pub consumed: f64,
    pub curtailed: f64,
    #[serde(default)]
    pub discharged: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct State {
    pub schema: u32,
    pub nodes: Vec<Node>,
    pub account: Account,
}
impl Default for State {
    fn default() -> Self {
        Self {
            schema: 1,
            nodes: vec![],
            account: Account::default(),
        }
    }
}
#[derive(Clone, Debug)]
pub struct Wire {
    pub id: Id,
    pub from: Id,
    pub to: Id,
    pub capacity_per_hour: f64,
}
#[derive(Clone, Debug)]
pub struct Frame {
    state: State,
    open: Vec<bool>,
    wires: Vec<Wire>,
    remaining: Vec<f64>,
    limits: Vec<f64>,
    pools: Vec<f64>,
}
impl State {
    /// Explicit authored opening balances; new live equipment must start empty.
    pub fn from_opening(nodes: Vec<Node>, next: u32) -> Option<Self> {
        let account = Account {
            opening: nodes.iter().map(|n| n.charge).sum(),
            ..Account::default()
        };
        let state = Self {
            nodes,
            account,
            ..Self::default()
        };
        state.valid(next).then_some(state)
    }
    pub fn valid(&self, next: u32) -> bool {
        let mut ids = HashSet::new();
        let mut owners = HashSet::new();
        self.schema == 1
            && self.nodes.len() <= 1024
            && self.nodes.iter().all(|n| {
                n.valid(next)
                    && ids.insert(n.id.0)
                    && (n.owner == Owner::Ground
                        || owners.insert(match n.owner {
                            Owner::Building(i) => (0, i as u64),
                            Owner::Pump(i) => (1, u64::from(i.0)),
                            Owner::Ground => unreachable!(),
                        }))
            })
            && [
                self.account.opening,
                self.account.generated,
                self.account.consumed,
                self.account.curtailed,
                self.account.discharged,
            ]
            .iter()
            .all(|n| n.is_finite() && (0. ..=1e9).contains(n))
            && (self.account.opening + self.account.generated
                - self.account.consumed
                - self.account.curtailed
                - self.account.discharged
                - self.nodes.iter().map(|n| n.charge).sum::<f64>())
            .abs()
                < 0.0001
    }
    /// Retiring detached storage dissipates its remaining charge, not useful demand.
    /// The caller owns resident work, cable detachment and any hardware recovery.
    pub fn retire_battery(&mut self, next: u32, id: Id) -> Result<Node, &'static str> {
        if !self.valid(next) {
            return Err("Invalid electrical ownership or accounts.");
        }
        let i = self
            .nodes
            .iter()
            .position(|n| n.id == id && n.owner == Owner::Ground && n.kind == Kind::Battery)
            .ok_or("Only a detached battery can be retired.")?;
        let discharged = self.account.discharged + self.nodes[i].charge;
        if discharged > 1e9 {
            return Err("The discharged-energy account is full.");
        }
        let node = self.nodes.remove(i);
        self.account.discharged = discharged;
        Ok(node)
    }
    /// Builds a disposable frame. Bad inputs leave the live state unchanged.
    pub fn begin(
        &self,
        next: u32,
        minutes: f64,
        open: &[Id],
        generation: &[(Id, f64)],
        wires: &[Wire],
    ) -> Result<Frame, &'static str> {
        if !self.valid(next)
            || !minutes.is_finite()
            || !(0. ..=1440.).contains(&minutes)
            || minutes == 0.
        {
            return Err("Invalid electrical state or interval.");
        }
        let index = |id| self.nodes.iter().position(|n| n.id == id);
        let mut opened = vec![false; self.nodes.len()];
        for id in open {
            let i = index(*id).ok_or("Unknown open electrical node.")?;
            if opened[i] {
                return Err("Duplicate open electrical node.");
            }
            opened[i] = true;
        }
        let mut pools: Vec<_> = self.nodes.iter().map(|n| n.charge).collect();
        let mut state = self.clone();
        let mut seen = HashSet::new();
        for &(id, rate) in generation {
            let i = index(id).ok_or("Unknown generator.")?;
            if !seen.insert(id.0)
                || !rate.is_finite()
                || rate < 0.
                || rate > self.nodes[i].peak() + EPS
                || rate > 0. && !opened[i]
            {
                return Err("Invalid or closed generator.");
            }
            let amount = rate.min(self.nodes[i].peak()) * minutes / 60.;
            pools[i] += amount;
            state.account.generated += amount;
        }
        let owned: f64 = pools.iter().sum();
        if state.account.generated > 1e9
            || state.account.consumed + owned > 1e9
            || state.account.curtailed + owned > 1e9
        {
            return Err("Electrical accounting limit reached.");
        }
        let mut ids: HashSet<_> = self.nodes.iter().map(|n| n.id.0).collect();
        let mut pairs = HashSet::new();
        let mut wires = wires.to_vec();
        wires.sort_by_key(|w| w.id.0);
        for w in &wires {
            let a = index(w.from).ok_or("Unknown cable endpoint.")?;
            let b = index(w.to).ok_or("Unknown cable endpoint.")?;
            if w.id.0 == 0
                || w.id.0 >= next
                || !ids.insert(w.id.0)
                || a == b
                || !pairs.insert((a.min(b), a.max(b)))
                || !w.capacity_per_hour.is_finite()
                || !(0. ..=120.).contains(&w.capacity_per_hour)
                || w.capacity_per_hour == 0.
                || self.nodes[a].kind == Kind::Roof
                || self.nodes[b].kind == Kind::Roof
            {
                return Err("Invalid cable or private rooftop connection.");
            }
        }
        let remaining: Vec<f64> = wires
            .iter()
            .map(|w| w.capacity_per_hour * minutes / 60.)
            .collect();
        Ok(Frame {
            state,
            open: opened,
            wires,
            limits: remaining.clone(),
            remaining,
            pools,
        })
    }
}
impl Frame {
    /// A moved pipe keeps its pump equipment, but cannot operate during rebuilding.
    pub(crate) fn relocate_pump(&mut self, id: Id, owner: Owner, x: i32, y: i32) {
        let i = self.state.nodes.iter().position(|n| n.id == id).unwrap();
        let n = &mut self.state.nodes[i];
        assert_eq!(n.kind, Kind::Pump);
        assert!(matches!(owner, Owner::Pump(_)));
        n.owner = owner;
        n.x = x;
        n.y = y;
        self.open[i] = false;
    }
    fn index(&self, id: Id) -> Option<usize> {
        self.state.nodes.iter().position(|n| n.id == id)
    }
    // BFS chooses shortest available routes, with stable cable identity ties.
    fn route(&self, start: usize, goal: impl Fn(usize) -> bool) -> Option<(usize, Vec<usize>)> {
        if !self.open[start] {
            return None;
        }
        let mut previous = vec![None; self.pools.len()];
        let mut queue = VecDeque::from([start]);
        previous[start] = Some((start, usize::MAX));
        while let Some(i) = queue.pop_front() {
            if goal(i) {
                let mut route = vec![];
                let mut cursor = i;
                while cursor != start {
                    let (parent, wire) = previous[cursor]?;
                    route.push(wire);
                    cursor = parent;
                }
                return Some((i, route));
            }
            for (k, w) in self.wires.iter().enumerate() {
                if self.remaining[k] <= EPS {
                    continue;
                }
                let target = if w.from == self.state.nodes[i].id {
                    w.to
                } else if w.to == self.state.nodes[i].id {
                    w.from
                } else {
                    continue;
                };
                let j = self.index(target)?;
                if self.open[j] && previous[j].is_none() {
                    previous[j] = Some((i, k));
                    queue.push_back(j);
                }
            }
        }
        None
    }
    fn transfer_limit(&self, path: &[usize], amount: f64) -> f64 {
        path.iter().fold(amount, |n, &i| n.min(self.remaining[i]))
    }
    fn use_path(&mut self, path: &[usize], amount: f64) {
        for &i in path {
            self.remaining[i] = (self.remaining[i] - amount).max(0.);
        }
    }
    /// Call actual essential operating loads before discretionary lighting.
    /// Unreachable or closed consumers receive zero; partial supply is explicit.
    pub fn spend(&mut self, node: Id, amount: f64) -> f64 {
        if !amount.is_finite() || amount <= 0. {
            return 0.;
        }
        let Some(target) = self.index(node) else {
            return 0.;
        };
        let mut delivered = 0.;
        while amount - delivered > EPS {
            let Some((source, path)) = self.route(target, |i| self.pools[i] > EPS) else {
                break;
            };
            let n = self.transfer_limit(&path, (amount - delivered).min(self.pools[source]));
            if n <= EPS {
                break;
            }
            self.pools[source] = (self.pools[source] - n).max(0.);
            self.use_path(&path, n);
            delivered += n;
        }
        self.state.account.consumed += delivered;
        delivered
    }
    /// Store unused generation locally, then through remaining cable capacity.
    /// Only energy that cannot be used or stored is curtailed.
    pub fn finish(self) -> State {
        self.finish_with_flows().0
    }
    pub fn finish_with_flows(mut self) -> (State, Vec<(Id, f64)>) {
        for source in 0..self.pools.len() {
            while self.pools[source] - self.state.nodes[source].capacity > EPS {
                let Some((target, path)) = self.route(source, |i| {
                    i != source && self.state.nodes[i].capacity - self.pools[i] > EPS
                }) else {
                    break;
                };
                let n = self.transfer_limit(
                    &path,
                    (self.pools[source] - self.state.nodes[source].capacity)
                        .min(self.state.nodes[target].capacity - self.pools[target]),
                );
                if n <= EPS {
                    break;
                }
                self.pools[source] -= n;
                self.pools[target] += n;
                self.use_path(&path, n);
            }
        }
        for (n, pool) in self.state.nodes.iter_mut().zip(self.pools) {
            n.charge = pool.min(n.capacity);
            self.state.account.curtailed += (pool - n.charge).max(0.);
        }
        let flows = self
            .wires
            .iter()
            .enumerate()
            .map(|(i, w)| (w.id, self.limits[i] - self.remaining[i]))
            .collect();
        (self.state, flows)
    }
    pub fn available(&self, node: Id) -> f64 {
        self.clone().spend(node, 1e9)
    }
    pub fn connected_to_storage(&self, node: Id) -> bool {
        let Some(start) = self.index(node) else {
            return false;
        };
        let mut probe = self.clone();
        probe.remaining.clone_from(&probe.limits);
        probe
            .route(start, |i| probe.state.nodes[i].capacity > 0.)
            .is_some()
    }
    /// Physical enabled circuits, independent of charge and this frame's spent bandwidth.
    pub fn circuits(&self) -> Vec<Vec<Id>> {
        let mut seen = vec![false; self.state.nodes.len()];
        let mut circuits = vec![];
        for start in 0..seen.len() {
            if seen[start] || !self.open[start] {
                continue;
            }
            let mut queue = VecDeque::from([start]);
            seen[start] = true;
            let mut nodes = vec![];
            while let Some(i) = queue.pop_front() {
                let id = self.state.nodes[i].id;
                nodes.push(id);
                for w in &self.wires {
                    let target = if w.from == id {
                        w.to
                    } else if w.to == id {
                        w.from
                    } else {
                        continue;
                    };
                    let j = self.index(target).unwrap();
                    if self.open[j] && !seen[j] {
                        seen[j] = true;
                        queue.push_back(j);
                    }
                }
            }
            nodes.sort_by_key(|id| id.0);
            circuits.push(nodes);
        }
        circuits.sort_by_key(|nodes| nodes[0].0);
        circuits
    }
    pub fn cable_used(&self, id: Id) -> Option<f64> {
        let i = self.wires.iter().position(|w| w.id == id)?;
        Some(self.limits[i] - self.remaining[i])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn node(id: u32, kind: Kind, charge: f64) -> Node {
        Node {
            id: Id(id),
            owner: if kind == Kind::Pump {
                Owner::Pump(Id(id + 10))
            } else if kind == Kind::Battery {
                Owner::Ground
            } else {
                Owner::Building(id as usize)
            },
            kind,
            x: id as i32 + 2,
            y: 5,
            size: 1,
            capacity: match kind {
                Kind::Solar | Kind::Battery => 36.,
                Kind::Hydro => 18.,
                Kind::Roof => 4.,
                _ => 0.,
            },
            charge,
        }
    }
    fn wire(id: u32, a: u32, b: u32, rate: f64) -> Wire {
        Wire {
            id: Id(id),
            from: Id(a),
            to: Id(b),
            capacity_per_hour: rate,
        }
    }
    fn state(nodes: Vec<Node>) -> State {
        State::from_opening(nodes, 100).unwrap()
    }
    fn open(s: &State) -> Vec<Id> {
        s.nodes.iter().map(|n| n.id).collect()
    }
    fn check(s: &State) {
        assert!(s.valid(100));
        let raw = serde_json::to_string(s).unwrap();
        let h: State = serde_json::from_str(&raw).unwrap();
        assert!(h.valid(100));
        assert_eq!(serde_json::to_string(&h).unwrap(), raw);
    }
    #[test]
    fn retiring_recovered_storage_accounts_for_discharge_without_inventing_consumption() {
        let mut s = state(vec![node(1, Kind::Battery, 12.), node(2, Kind::Solar, 5.)]);
        let removed = s.retire_battery(100, Id(1)).unwrap();
        assert_eq!(removed.charge, 12.);
        assert_eq!(s.nodes.len(), 1);
        assert_eq!(s.nodes[0].charge, 5.);
        assert_eq!(s.account.discharged, 12.);
        assert_eq!(s.account.consumed, 0.);
        assert_eq!(s.account.curtailed, 0.);
        check(&s);
        let raw = serde_json::to_string(&s).unwrap();
        assert!(s.retire_battery(100, Id(1)).is_err());
        assert!(s.retire_battery(100, Id(2)).is_err());
        assert_eq!(serde_json::to_string(&s).unwrap(), raw);
    }
    #[test]
    fn invalid_discharge_accounts_are_rejected_before_any_equipment_is_removed() {
        let original = state(vec![node(1, Kind::Battery, 4.)]);
        for amount in [-1., 1., f64::INFINITY] {
            let mut s = original.clone();
            s.account.discharged = amount;
            assert!(!s.valid(100));
            assert!(s.retire_battery(100, Id(1)).is_err());
            assert_eq!(s.nodes.len(), 1);
            assert_eq!(s.nodes[0].charge, 4.);
        }
    }
    #[test]
    fn isolated_batteries_cannot_supply_an_unconnected_consumer() {
        let s = state(vec![
            node(1, Kind::Solar, 36.),
            node(2, Kind::Hydro, 0.),
            node(3, Kind::Consumer, 0.),
        ]);
        let mut f = s
            .begin(100, 60., &open(&s), &[], &[wire(20, 2, 3, 12.)])
            .unwrap();
        assert_eq!(f.spend(Id(3), 1.), 0.);
        let s = f.finish();
        assert_eq!(s.nodes[0].charge, 36.);
        assert_eq!(s.account.consumed, 0.);
        check(&s);
    }
    #[test]
    fn cable_bottlenecks_limit_loads_and_actual_demand_order_sets_priority() {
        let s = state(vec![
            node(1, Kind::Solar, 10.),
            node(2, Kind::Consumer, 0.),
            node(3, Kind::Pump, 0.),
        ]);
        let wires = [wire(20, 1, 2, 12.), wire(21, 2, 3, 12.)];
        let mut f = s.begin(100, 1., &open(&s), &[], &wires).unwrap();
        assert_eq!(f.spend(Id(3), 0.15), 0.15);
        assert!((f.spend(Id(2), 0.1) - 0.05).abs() < EPS);
        assert!((f.cable_used(Id(20)).unwrap() - 0.2).abs() < EPS);
        assert!((f.cable_used(Id(21)).unwrap() - 0.15).abs() < EPS);
        assert_eq!(f.circuits(), vec![vec![Id(1), Id(2), Id(3)]]);
        let s = f.finish();
        assert!((s.nodes[0].charge - 9.8).abs() < EPS);
        assert!((s.account.consumed - 0.2).abs() < EPS);
        check(&s);
    }
    #[test]
    fn full_battery_can_supply_running_loads_directly_before_curtailed_surplus() {
        let s = state(vec![node(1, Kind::Solar, 36.), node(2, Kind::Consumer, 0.)]);
        let mut f = s
            .begin(100, 60., &open(&s), &[(Id(1), 6.)], &[wire(20, 1, 2, 12.)])
            .unwrap();
        assert_eq!(f.spend(Id(2), 3.), 3.);
        let s = f.finish();
        assert_eq!(s.nodes[0].charge, 36.);
        assert_eq!(s.account.generated, 6.);
        assert_eq!(s.account.consumed, 3.);
        assert_eq!(s.account.curtailed, 3.);
        check(&s);
    }
    #[test]
    fn surplus_charges_connected_storage_with_remaining_cable_capacity() {
        let s = state(vec![node(1, Kind::Solar, 36.), node(2, Kind::Hydro, 0.)]);
        let f = s
            .begin(100, 60., &open(&s), &[(Id(1), 6.)], &[wire(20, 1, 2, 2.)])
            .unwrap();
        let s = f.finish();
        assert_eq!(s.nodes[0].charge, 36.);
        assert_eq!(s.nodes[1].charge, 2.);
        assert_eq!(s.account.curtailed, 4.);
        check(&s);
    }
    #[test]
    fn private_roof_can_light_its_own_home_without_exporting_charge() {
        let s = state(vec![node(1, Kind::Roof, 2.), node(2, Kind::Consumer, 0.)]);
        assert!(
            s.begin(100, 60., &open(&s), &[], &[wire(20, 1, 2, 12.)])
                .is_err()
        );
        let mut f = s.begin(100, 60., &open(&s), &[], &[]).unwrap();
        assert_eq!(f.spend(Id(2), 1.), 0.);
        assert_eq!(f.spend(Id(1), 0.1), 0.1);
        let s = f.finish();
        assert_eq!(s.nodes[0].charge, 1.9);
        check(&s);
    }
    #[test]
    fn open_and_closed_endpoints_and_paused_cables_control_reachability() {
        let s = state(vec![
            node(1, Kind::Solar, 10.),
            node(2, Kind::Consumer, 0.),
            node(3, Kind::Consumer, 0.),
        ]);
        let wires = [wire(20, 1, 2, 12.), wire(21, 2, 3, 12.)];
        let mut f = s.begin(100, 60., &[Id(1), Id(3)], &[], &wires).unwrap();
        assert_eq!(f.spend(Id(3), 1.), 0.);
        assert_eq!(f.spend(Id(2), 1.), 0.);
        assert_eq!(f.circuits(), vec![vec![Id(1)], vec![Id(3)]]);
        check(&f.finish());
        let mut f = s.begin(100, 60., &open(&s), &[], &wires[..1]).unwrap();
        assert_eq!(f.spend(Id(3), 1.), 0.);
        assert_eq!(f.spend(Id(2), 1.), 1.);
        check(&f.finish());
    }
    #[test]
    fn bad_inputs_reject_without_changing_the_live_state() {
        let s = state(vec![node(1, Kind::Solar, 10.), node(2, Kind::Consumer, 0.)]);
        let raw = serde_json::to_string(&s).unwrap();
        for wires in [
            vec![wire(20, 1, 99, 12.)],
            vec![wire(1, 1, 2, 12.)],
            vec![wire(20, 1, 2, 12.), wire(21, 2, 1, 12.)],
            vec![wire(20, 1, 2, f64::NAN)],
        ] {
            assert!(s.begin(100, 1., &open(&s), &[], &wires).is_err());
        }
        assert!(s.begin(100, 1., &[Id(1), Id(1)], &[], &[]).is_err());
        assert!(s.begin(100, 1., &[], &[(Id(1), 6.)], &[]).is_err());
        assert!(s.begin(100, 1., &open(&s), &[(Id(2), 1.)], &[]).is_err());
        let mut forged = s.clone();
        forged.nodes[0].charge += 1.;
        assert!(!forged.valid(100));
        forged = s.clone();
        forged.account.generated = 1.;
        assert!(!forged.valid(100));
        let mut f = s.begin(100, 1., &open(&s), &[], &[]).unwrap();
        assert_eq!(f.spend(Id(1), f64::NAN), 0.);
        assert_eq!(f.spend(Id(1), -1.), 0.);
        assert_eq!(f.spend(Id(99), 1.), 0.);
        check(&f.finish());
        assert_eq!(serde_json::to_string(&s).unwrap(), raw);
    }
    #[test]
    fn alternative_routes_and_step_sizes_preserve_charge_and_actual_energy() {
        let start = state(vec![
            node(1, Kind::Solar, 10.),
            node(2, Kind::Consumer, 0.),
            node(3, Kind::Consumer, 0.),
            node(4, Kind::Consumer, 0.),
        ]);
        let wires = [
            wire(20, 1, 2, 1.),
            wire(21, 2, 4, 1.),
            wire(22, 1, 3, 2.),
            wire(23, 3, 4, 2.),
        ];
        let run = |mut s: State, step: f64| {
            for _ in 0..(60. / step) as usize {
                let mut f = s
                    .begin(100, step, &open(&s), &[(Id(1), 3.)], &wires)
                    .unwrap();
                assert!((f.spend(Id(4), 2.5 * step / 60.) - 2.5 * step / 60.).abs() < EPS);
                s = f.finish();
                check(&s);
            }
            s
        };
        let a = run(start.clone(), 60.);
        let b = run(start, 0.75);
        assert!((a.nodes[0].charge - b.nodes[0].charge).abs() < EPS);
        assert!((a.account.consumed - b.account.consumed).abs() < EPS);
        assert!((a.account.generated - b.account.generated).abs() < EPS);
    }
}
