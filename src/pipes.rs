//! Installed water lines: owned kits, attended corridor work and metered pumping.
use crate::*;
use economy::{Bundle, COUNT};
use logistics::Owner;
use simulation::Id;
use utilities::{Kind, Plan};

pub const BUFFER: u32 = 300;
pub const FLOW_PER_MINUTE: f64 = 0.2;
pub const ENERGY_PER_WATER: f64 = 0.025;
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    AwaitingInputs,
    Installing,
    Active,
    Removing,
    Retired,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Anchor {
    pub kind: String,
    pub x: i32,
    pub y: i32,
    pub size: i32,
    pub tank: Id,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Line {
    pub id: Id,
    pub plan: Plan,
    pub anchors: [Anchor; 2],
    pub kit: Bundle,
    pub phase: Phase,
    pub paused: bool,
    pub priority: u8,
    pub work: f32,
    pub removal_work: f32,
    pub created: f32,
    pub finished: Option<f32>,
    pub spent: Option<[[u64; 2]; COUNT]>,
    pub replacement: bool,
    pub transferred: f64,
    pub energy_used: f64,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct State {
    pub schema: u32,
    pub lines: Vec<Line>,
}
impl Default for State {
    fn default() -> Self {
        Self {
            schema: 1,
            lines: vec![],
        }
    }
}
impl Line {
    pub fn live(&self) -> bool {
        self.phase != Phase::Retired
    }
    pub fn labour(&self) -> f32 {
        self.plan.cells.len() as f32 * 4. + 12.
    }
    pub fn removal_labour(&self) -> f32 {
        self.plan.cells.len() as f32 + 4.
    }
    pub fn location(&self) -> [i32; 2] {
        let cells = &self.plan.cells;
        if self.phase == Phase::Removing {
            if self.removal_work < 4. {
                cells[0]
            } else {
                cells[(cells.len() - 1).saturating_sub((self.removal_work - 4.).floor() as usize)]
            }
        } else if self.work < cells.len() as f32 * 4. {
            cells[(self.work / 4.).floor() as usize]
        } else {
            cells[0]
        }
    }
}
pub fn line(v: &Village, id: Id) -> Option<&Line> {
    v.pipes.lines.iter().find(|p| p.id == id)
}
fn owner(id: i32) -> Option<water::Owner> {
    if id == -1 {
        Some(water::Owner::Camp)
    } else if id >= 0 {
        Some(water::Owner::Building(id as usize))
    } else {
        id.checked_neg()?
            .checked_sub(2)
            .map(|i| water::Owner::Source(i as usize))
    }
}
fn class(kind: Kind) -> Option<water::Class> {
    match kind {
        Kind::Fresh => Some(water::Class::Fresh),
        Kind::Irrigation => Some(water::Class::Irrigation),
        Kind::Greywater => Some(water::Class::Greywater),
        Kind::Sewage => Some(water::Class::Sewage),
        _ => None,
    }
}
pub fn kit(plan: &Plan) -> Bundle {
    let mut k = [0; COUNT];
    k[8] = 2;
    k[9] = (plan.cells.len() as u32).div_ceil(3) + 1;
    k[10] = 1;
    k[14] = 1;
    k
}
pub fn needs(v: &Village, id: Id) -> Bundle {
    line(v, id)
        .filter(|p| p.live() && p.spent.is_none())
        .map_or([0; COUNT], |p| p.kit)
}
pub fn held(v: &Village, owner: Owner, i: usize) -> u32 {
    match owner {
        Owner::Utility(id) => needs(v, id)[i],
        _ => 0,
    }
}
pub fn demand(v: &Village, i: usize) -> u32 {
    v.pipes
        .lines
        .iter()
        .filter(|p| p.live() && p.spent.is_none())
        .map(|p| p.kit[i])
        .sum()
}
pub fn unclaimed(v: &Village, i: usize) -> u32 {
    v.pipes
        .lines
        .iter()
        .filter(|p| p.live() && p.spent.is_none())
        .map(|p| {
            let store = v
                .logistics
                .as_ref()
                .and_then(|s| s.stores.iter().find(|s| s.owner == Owner::Utility(p.id)));
            let present = store.map_or(0, |s| s.items[i]);
            let incoming = store.map_or(0, |s| {
                v.logistics
                    .as_ref()
                    .unwrap()
                    .shipments
                    .iter()
                    .filter(|h| h.to == s.id && h.material == i)
                    .map(|h| h.amount)
                    .sum()
            });
            p.kit[i].saturating_sub(present + incoming)
        })
        .sum()
}
pub fn closing(v: &Village, id: Id) -> bool {
    line(v, id).is_none_or(|p| {
        p.paused || matches!(p.phase, Phase::Active | Phase::Removing | Phase::Retired)
    })
}
pub fn reserved(v: &Village, x: i32, y: i32) -> bool {
    v.pipes
        .lines
        .iter()
        .any(|p| p.live() && p.plan.cells.contains(&[x, y]))
}
fn anchored(v: &Village, id: i32, a: &Anchor) -> bool {
    owner(id)
        .and_then(|o| water::owner_tank(v, o))
        .is_some_and(|p| p.id == a.tank && (p.x, p.y) == (a.x as f32, a.y as f32))
}
fn present_owner(v: &Village, id: i32) -> bool {
    owner(id).and_then(|o| water::owner_tank(v, o)).is_some()
}
fn endpoint_open(v: &Village, id: i32, a: &Anchor) -> bool {
    anchored(v, id, a) && water::tank(v, a.tank).is_some_and(|t| water::open(v, t))
}
pub fn ready(v: &Village, p: &Line) -> bool {
    if p.paused || !p.live() {
        return false;
    }
    if p.phase == Phase::Removing {
        return p.removal_work < p.removal_labour();
    }
    if !matches!(p.phase, Phase::AwaitingInputs | Phase::Installing)
        || !endpoint_open(v, p.plan.from, &p.anchors[0])
        || !endpoint_open(v, p.plan.to, &p.anchors[1])
    {
        return false;
    }
    p.spent.is_some()
        || (0..COUNT).all(|i| organics::available(v, Owner::Utility(p.id), i) >= p.kit[i])
}
pub fn approach(v: &Village, id: Id, resident: usize) -> Option<[f32; 2]> {
    let p = line(v, id).filter(|p| ready(v, p))?;
    let cell = p.location();
    let centre = [cell[0] as f32, cell[1] as f32];
    for radius in [0.7, 1.1] {
        for turn in 0..8 {
            let angle = (resident as f32 / 5. + turn as f32 / 8.) * std::f32::consts::TAU;
            let q = [
                centre[0] + radius * angle.cos(),
                centre[1] + radius * angle.sin(),
            ];
            if navigation::segment(v, centre, q) {
                return Some(q);
            }
        }
    }
    navigation::clear(v, centre[0], centre[1]).then_some(centre)
}
pub fn assign_target(r: &mut Resident, v: &Village, id: Id) -> bool {
    let Some(q) = approach(v, id, r.id) else {
        return false;
    };
    r.task = "utility".into();
    r.activity_material = Some(id.0 as usize);
    r.activity_building = None;
    r.activity_batch = None;
    r.activity_store = None;
    r.remaining = 10.;
    r.reason = work_reason(line(v, id).unwrap()).into();
    (r.target_x, r.target_y) = (q[0], q[1]);
    true
}
pub fn work_reason(p: &Line) -> &'static str {
    if p.phase == Phase::Removing {
        "Dismantling our water connection along its marked corridor."
    } else {
        "Installing our water connection along its marked corridor."
    }
}
fn release_store(v: &mut Village, id: Id) {
    if let Some(s) = v
        .logistics
        .as_mut()
        .and_then(|s| s.stores.iter_mut().find(|p| p.owner == Owner::Utility(id)))
    {
        s.owner = Owner::Ground;
        s.target = [0; COUNT];
    }
}
fn retire_uninstalled(v: &mut Village, id: Id) {
    let p = v.pipes.lines.iter_mut().find(|p| p.id == id).unwrap();
    p.phase = Phase::Retired;
    p.finished = Some(v.minutes);
    release_store(v, id);
}
/// This runs after local containers follow building moves. It never creates
/// new orders or calls logistics recursively; replacement planning is separate.
pub fn reconcile(v: &mut Village) {
    let changed: Vec<_> = v
        .pipes
        .lines
        .iter()
        .filter(|p| {
            p.live()
                && p.phase != Phase::Removing
                && (!anchored(v, p.plan.from, &p.anchors[0])
                    || !anchored(v, p.plan.to, &p.anchors[1]))
        })
        .map(|p| {
            (
                p.id,
                p.spent.is_some(),
                present_owner(v, p.plan.from) && present_owner(v, p.plan.to),
            )
        })
        .collect();
    for (id, paid, replace) in changed {
        let p = v.pipes.lines.iter_mut().find(|p| p.id == id).unwrap();
        p.replacement = replace;
        p.paused = false;
        p.removal_work = 0.;
        if paid {
            p.phase = Phase::Removing
        } else {
            retire_uninstalled(v, id)
        }
    }
}
fn propose(
    v: &Village,
    kind: Kind,
    from: i32,
    to: i32,
) -> Result<(Plan, [Anchor; 2]), &'static str> {
    let water_class = class(kind).ok_or("Choose a supported liquid class for this line.")?;
    let plan = utilities::plan(v, kind, from, to)?;
    let endpoints = utilities::endpoints(v, kind);
    let anchor = |id| -> Result<Anchor, &'static str> {
        let e = endpoints
            .iter()
            .find(|p| p.id == id)
            .ok_or("That endpoint is missing.")?;
        let tank = owner(id)
            .and_then(|o| water::owner_tank(v, o))
            .ok_or("This building has no water buffer yet.")?;
        if tank.capacity[water_class.index()] <= 0. {
            return Err("This container cannot hold that water class.");
        }
        Ok(Anchor {
            kind: e.kind.clone(),
            x: e.x,
            y: e.y,
            size: e.size,
            tank: tank.id,
        })
    };
    Ok((plan, [anchor(from)?, anchor(to)?]))
}
pub fn queue(v: &mut Village, kind: Kind, from: i32, to: i32) -> Result<Id, &'static str> {
    if v.pipes.lines.iter().filter(|p| p.live()).count() >= 64 || v.pipes.lines.len() >= 256 {
        return Err("Finish or remove an existing water line first.");
    }
    if v.pipes.lines.iter().any(|p| {
        p.live()
            && p.phase != Phase::Removing
            && p.plan.kind == kind
            && p.plan.from == from
            && p.plan.to == to
    }) {
        return Err("This connection is already planned or installed.");
    }
    let (plan, anchors) = propose(v, kind, from, to)?;
    if v.simulation.next_id.checked_add(2).is_none() {
        return Err("No connection identities remain.");
    }
    let id = v.simulation.allocate().unwrap();
    let cell = plan.cells[0];
    let parts = kit(&plan);
    v.pipes.lines.push(Line {
        id,
        plan,
        anchors,
        kit: parts,
        phase: Phase::AwaitingInputs,
        paused: false,
        priority: 1,
        work: 0.,
        removal_work: 0.,
        created: v.minutes,
        finished: None,
        spent: None,
        replacement: false,
        transferred: 0.,
        energy_used: 0.,
    });
    logistics::create(
        v,
        Owner::Utility(id),
        cell[0] as f32,
        cell[1] as f32,
        BUFFER,
    )
    .unwrap();
    economy::rebalance(v);
    Ok(id)
}
pub fn remove(v: &mut Village, id: Id) -> bool {
    let Some(p) = v
        .pipes
        .lines
        .iter_mut()
        .find(|p| p.id == id && p.live() && p.phase != Phase::Removing)
    else {
        return false;
    };
    p.replacement = false;
    p.paused = false;
    if p.spent.is_some() {
        p.phase = Phase::Removing;
        p.removal_work = 0.;
    } else {
        retire_uninstalled(v, id);
    }
    economy::rebalance(v);
    true
}
fn finish_removal(v: &mut Village, id: Id) -> bool {
    let Some(p) = line(v, id)
        .filter(|p| p.phase == Phase::Removing && p.removal_work >= p.removal_labour())
        .cloned()
    else {
        return false;
    };
    let returned: Bundle = std::array::from_fn(|i| if i == 14 { p.kit[i] } else { p.kit[i] / 2 });
    if returned.iter().sum::<u32>() > economy::capacity(v).saturating_sub(economy::storage(v)) {
        return false;
    }
    for (i, &n) in returned.iter().enumerate() {
        if n > 0 {
            assert!(logistics::receive(v, Owner::Utility(id), i, n));
        }
    }
    let row = v.pipes.lines.iter_mut().find(|p| p.id == id).unwrap();
    row.phase = Phase::Retired;
    row.finished = Some(v.minutes);
    release_store(v, id);
    economy::rebalance(v);
    true
}
pub fn work(v: &mut Village, r: &Resident, minutes: f32) -> bool {
    let Some(id) = r
        .activity_material
        .and_then(|n| u32::try_from(n).ok())
        .map(Id)
    else {
        return false;
    };
    let Some(p) = line(v, id).cloned() else {
        return true;
    };
    if !ready(v, &p) {
        return true;
    }
    let Some(target) = approach(v, id, r.id) else {
        return true;
    };
    if r.task != "utility" || minutes <= 0. || (r.x - target[0]).hypot(r.y - target[1]) > 0.08 {
        return false;
    }
    if p.phase == Phase::Removing {
        let boundary = if p.removal_work < 4. {
            4.
        } else {
            4. + (p.removal_work - 4.).floor() + 1.
        };
        let amount = minutes
            .min(boundary - p.removal_work)
            .min(p.removal_labour() - p.removal_work);
        let row = v.pipes.lines.iter_mut().find(|p| p.id == id).unwrap();
        row.removal_work += amount;
        if row.removal_work >= p.removal_labour() {
            finish_removal(v, id);
            return true;
        }
    } else {
        if p.spent.is_none() {
            let mut paid = [[0; 2]; COUNT];
            for (i, range) in paid.iter_mut().enumerate() {
                if p.kit[i] > 0 {
                    let before = v.simulation.materials.as_ref().unwrap().spent[i];
                    logistics::spend(v, Some(Owner::Utility(id)), i, p.kit[i]);
                    *range = [before, before + u64::from(p.kit[i])];
                }
            }
            let row = v.pipes.lines.iter_mut().find(|p| p.id == id).unwrap();
            row.spent = Some(paid);
            row.phase = Phase::Installing;
        }
        let boundary = if p.work < p.plan.cells.len() as f32 * 4. {
            ((p.work / 4.).floor() + 1.) * 4.
        } else {
            p.labour()
        };
        let amount = minutes.min(boundary - p.work).min(p.labour() - p.work);
        let row = v.pipes.lines.iter_mut().find(|p| p.id == id).unwrap();
        row.work += amount;
        if row.work >= p.labour() {
            row.phase = Phase::Active;
            event(
                v,
                "A neighbour finished installing and commissioning a water line.",
            );
            return true;
        }
    }
    false
}
fn reason(v: &Village, p: &Line) -> &'static str {
    if p.phase == Phase::Retired {
        return if p.replacement {
            "Waiting to plan a replacement at the new location."
        } else {
            "Removed; recovered materials remain at the route."
        };
    }
    if p.paused {
        return "Paused; water and delivered parts remain owned.";
    }
    if p.phase == Phase::Removing {
        return if p.removal_work >= p.removal_labour() {
            "Dismantled kit is held here. Make room in village storage to recover it."
        } else {
            "Resident dismantling is queued; the pump is off."
        };
    }
    if !endpoint_open(v, p.plan.from, &p.anchors[0]) || !endpoint_open(v, p.plan.to, &p.anchors[1])
    {
        return "Disconnected while endpoint building work finishes.";
    }
    if p.phase == Phase::AwaitingInputs {
        return if ready(v, p) {
            "Parts delivered; waiting for resident installation."
        } else {
            "Waiting for parts to reach this route."
        };
    }
    if p.phase == Phase::Installing {
        return "Residents are laying the corridor and commissioning the pump.";
    }
    let c = class(p.plan.kind).unwrap();
    let from = water::tank(v, p.anchors[0].tank).unwrap();
    let to = water::tank(v, p.anchors[1].tank).unwrap();
    if water::free(v, from, c, None) <= 0. {
        "Source is empty or reserved for carrying."
    } else if water::room(v, to, c) <= 0. {
        "Receiving buffer is full or promised to a carrier."
    } else if !power::pump_connected(v, p.id) {
        "Connect this pump to a local electrical circuit; manual delivery remains available."
    } else if power::pump_available(v, p.id) <= 0. {
        "This circuit has no available energy or cable capacity; manual delivery remains available."
    } else {
        "Pumping within the line's flow and power limits."
    }
}
pub fn advance(v: &mut Village, minutes: f32) {
    reconcile(v);
    let finished: Vec<_> = v
        .pipes
        .lines
        .iter()
        .filter(|p| p.phase == Phase::Removing && p.removal_work >= p.removal_labour() && !p.paused)
        .map(|p| p.id)
        .collect();
    for id in finished {
        finish_removal(v, id);
    }
    let replacements: Vec<_> = v
        .pipes
        .lines
        .iter()
        .filter(|p| p.phase == Phase::Retired && p.replacement)
        .map(|p| (p.id, p.plan.kind, p.plan.from, p.plan.to, p.priority))
        .collect();
    for (id, kind, from, to, priority) in replacements {
        if !present_owner(v, from)
            || !present_owner(v, to)
            || v.pipes.lines.iter().any(|p| {
                p.live()
                    && p.phase != Phase::Removing
                    && p.plan.kind == kind
                    && p.plan.from == from
                    && p.plan.to == to
            })
        {
            v.pipes
                .lines
                .iter_mut()
                .find(|p| p.id == id)
                .unwrap()
                .replacement = false;
            continue;
        }
        if let Ok(next) = queue(v, kind, from, to) {
            v.pipes
                .lines
                .iter_mut()
                .find(|p| p.id == id)
                .unwrap()
                .replacement = false;
            v.pipes
                .lines
                .iter_mut()
                .find(|p| p.id == next)
                .unwrap()
                .priority = priority;
        }
    }
    if minutes <= 0. {
        return;
    }
    let mut ids: Vec<_> = v
        .pipes
        .lines
        .iter()
        .filter(|p| p.phase == Phase::Active && !p.paused)
        .map(|p| (std::cmp::Reverse(p.priority), p.id.0))
        .collect();
    ids.sort_unstable();
    for (_, id) in ids {
        let p = line(v, Id(id)).unwrap().clone();
        if !endpoint_open(v, p.plan.from, &p.anchors[0])
            || !endpoint_open(v, p.plan.to, &p.anchors[1])
        {
            continue;
        }
        let c = class(p.plan.kind).unwrap();
        let i = c.index();
        let source = water::tank(v, p.anchors[0].tank).unwrap();
        let target = water::tank(v, p.anchors[1].tank).unwrap();
        let amount = (f64::from(minutes) * FLOW_PER_MINUTE)
            .min(water::free(v, source, c, None))
            .min(water::room(v, target, c))
            .min(power::pump_available(v, p.id) / ENERGY_PER_WATER);
        if amount <= 0. {
            continue;
        }
        let energy = power::spend_pump(v, p.id, amount * ENERGY_PER_WATER);
        let amount = energy / ENERGY_PER_WATER;
        if amount <= 0. {
            continue;
        }
        v.water_supply
            .tanks
            .iter_mut()
            .find(|t| t.id == p.anchors[0].tank)
            .unwrap()
            .water[i] -= amount;
        v.water_supply
            .tanks
            .iter_mut()
            .find(|t| t.id == p.anchors[1].tank)
            .unwrap()
            .water[i] += amount;
        let row = v.pipes.lines.iter_mut().find(|p| p.id == Id(id)).unwrap();
        row.transferred += amount;
        row.energy_used += energy;
    }
    water::summaries(v);
}
pub fn view(v: &Village) -> serde_json::Value {
    let rows:Vec<_>=v.pipes.lines.iter().map(|p|{
        let items=v.logistics.as_ref().and_then(|s|s.stores.iter().find(|s|s.owner==Owner::Utility(p.id))).map_or([0;COUNT],|s|s.items);
        serde_json::json!({"line":p,"reason":reason(v,p),"parts_here":items,"labour_minutes":p.labour(),"removal_minutes":p.removal_labour(),"ready":ready(v,p)})
    }).collect();
    serde_json::json!({"lines":rows,"flow_per_hour":FLOW_PER_MINUTE*60.,"energy_per_water":ENERGY_PER_WATER,"power_source":"shared_battery"})
}
pub fn pump_loads(v: &Village, minutes: f64) -> Vec<(Id, f64)> {
    v.pipes
        .lines
        .iter()
        .filter_map(|p| {
            if p.phase != Phase::Active
                || p.paused
                || !endpoint_open(v, p.plan.from, &p.anchors[0])
                || !endpoint_open(v, p.plan.to, &p.anchors[1])
            {
                return None;
            }
            let c = class(p.plan.kind)?;
            let source = water::tank(v, p.anchors[0].tank)?;
            let target = water::tank(v, p.anchors[1].tank)?;
            let amount = (minutes * FLOW_PER_MINUTE)
                .min(water::free(v, source, c, None))
                .min(water::room(v, target, c));
            (amount > 0.).then_some((p.id, amount * ENERGY_PER_WATER))
        })
        .collect()
}
pub fn pump_demand(v: &Village) -> f32 {
    pump_loads(v, 1.).iter().map(|(_, n)| n * 60.).sum::<f64>() as f32
}
pub fn uses_camp(v: &Village) -> bool {
    v.pipes.lines.iter().any(|p| {
        p.phase == Phase::Active
            && !p.paused
            && p.plan.kind == Kind::Fresh
            && p.plan.from == -1
            && endpoint_open(v, p.plan.to, &p.anchors[1])
    })
}
pub fn prune(v: &mut Village, people: &[Resident]) {
    let mut history = 0;
    v.pipes.lines.reverse();
    v.pipes.lines.retain(|p| {
        if p.live()
            || p.replacement
            || people
                .iter()
                .any(|r| r.task == "utility" && r.activity_material == Some(p.id.0 as usize))
        {
            true
        } else {
            history += 1;
            history <= 32
        }
    });
    v.pipes.lines.reverse();
}
pub fn valid(v: &Village) -> bool {
    if v.version == 3 {
        return v.pipes.lines.is_empty();
    }
    if v.pipes.schema != 1 || v.pipes.lines.len() > 256 {
        return false;
    }
    let mut paid: Vec<Vec<(u64, u64)>> = (0..COUNT).map(|_| vec![]).collect();
    let mut pairs = std::collections::HashSet::new();
    for p in &v.pipes.lines {
        if p.id.0 == 0
            || p.id.0 >= v.simulation.next_id
            || class(p.plan.kind).is_none()
            || p.plan.from == p.plan.to
            || p.kit != kit(&p.plan)
            || p.priority > 3
            || p.plan.cells.is_empty()
            || p.plan.cells.len() > 676
            || !p.work.is_finite()
            || !(0.0..=p.labour()).contains(&p.work)
            || !p.removal_work.is_finite()
            || !(0.0..=p.removal_labour()).contains(&p.removal_work)
            || !p.created.is_finite()
            || !(0.0..=v.minutes).contains(&p.created)
            || p.finished
                .is_some_and(|t| !t.is_finite() || !(p.created..=v.minutes).contains(&t))
            || (p.phase == Phase::Retired) != p.finished.is_some()
            || [p.transferred, p.energy_used]
                .iter()
                .any(|n| !n.is_finite() || *n < 0.)
            || (p.energy_used - p.transferred * ENERGY_PER_WATER).abs() > 0.001
            || p.phase == Phase::AwaitingInputs && (p.spent.is_some() || p.work != 0.)
            || matches!(p.phase, Phase::Installing | Phase::Active | Phase::Removing)
                && p.spent.is_none()
            || p.phase == Phase::Installing && (p.work <= 0. || p.work >= p.labour())
            || p.phase == Phase::Active && p.work != p.labour()
            || p.spent.is_none() && (p.work != 0. || p.transferred != 0. || p.removal_work != 0.)
            || p.replacement && !matches!(p.phase, Phase::Removing | Phase::Retired)
            || p.plan.road_cells > p.plan.cells.len()
            || !matches!(p.phase, Phase::Removing | Phase::Retired) && p.removal_work != 0.
        {
            return false;
        }
        if p.live()
            && p.phase != Phase::Removing
            && (!pairs.insert((p.plan.kind as u8, p.plan.from, p.plan.to))
                || !anchored(v, p.plan.from, &p.anchors[0])
                || !anchored(v, p.plan.to, &p.anchors[1]))
        {
            return false;
        }
        let source_ok = match p.plan.kind {
            Kind::Fresh => matches!(p.anchors[0].kind.as_str(), "camp" | "well"),
            Kind::Irrigation => p.anchors[0].kind == "wetland",
            Kind::Greywater => matches!(
                p.anchors[0].kind.as_str(),
                "camp" | "home" | "kitchen" | "eco_toilet"
            ),
            Kind::Sewage => p.anchors[0].kind == "eco_toilet",
            _ => false,
        };
        let receiver_ok = match p.plan.kind {
            Kind::Fresh => matches!(
                p.anchors[1].kind.as_str(),
                "home"
                    | "kitchen"
                    | "garden"
                    | "greenhouse"
                    | "eco_toilet"
                    | "source_timber"
                    | "source_bamboo"
            ),
            Kind::Irrigation => matches!(
                p.anchors[1].kind.as_str(),
                "garden" | "greenhouse" | "source_timber" | "source_bamboo"
            ),
            Kind::Greywater => p.anchors[1].kind == "wetland",
            Kind::Sewage => matches!(
                p.anchors[1].kind.as_str(),
                "biodigester" | "banana_treatment"
            ),
            _ => false,
        };
        if !source_ok || !receiver_ok {
            return false;
        }
        let cells = &p.plan.cells;
        let mut seen = std::collections::HashSet::new();
        if cells.iter().any(|c| {
            !(1..MAP_SIZE - 1).contains(&c[0])
                || !(1..MAP_SIZE - 1).contains(&c[1])
                || river_bank(c[0], c[1])
                || !seen.insert(*c)
                || p.live() && !utilities::clear(v, c[0], c[1])
        }) || cells
            .windows(2)
            .any(|c| (c[0][0] - c[1][0]).abs() + (c[0][1] - c[1][1]).abs() != 1)
            || cells[0] != p.plan.start.cell
            || *cells.last().unwrap() != p.plan.end.cell
        {
            return false;
        }
        for ((a, port), endpoint) in p
            .anchors
            .iter()
            .zip([&p.plan.start, &p.plan.end])
            .zip([p.plan.from, p.plan.to])
        {
            let size = match a.kind.as_str() {
                "camp" => 1,
                "source_timber" => 3,
                "source_bamboo" => 2,
                k => interactions::footprint_size(k),
            };
            if size != a.size
                || a.tank.0 == 0
                || a.tank.0 >= v.simulation.next_id
                || !port_geometry(a, port)
                || !anchor_identity(v, endpoint, a)
            {
                return false;
            }
        }
        if p.live()
            && v.logistics
                .as_ref()
                .is_none_or(|s| !s.stores.iter().any(|s| s.owner == Owner::Utility(p.id)))
        {
            return false;
        }
        if let Some(ranges) = p.spent {
            for i in 0..COUNT {
                let [a, b] = ranges[i];
                if p.kit[i] == 0 {
                    if a != 0 || b != 0 {
                        return false;
                    }
                } else {
                    if a.checked_add(u64::from(p.kit[i])) != Some(b)
                        || v.simulation
                            .materials
                            .as_ref()
                            .is_none_or(|m| b > m.spent[i])
                    {
                        return false;
                    }
                    paid[i].push((a, b));
                }
            }
        }
    }
    for ranges in &mut paid {
        ranges.sort_unstable();
        if ranges.windows(2).any(|r| r[0].1 > r[1].0) {
            return false;
        }
    }
    true
}
fn port_geometry(a: &Anchor, p: &utilities::Port) -> bool {
    if !(1..MAP_SIZE - 1).contains(&a.x)
        || !(1..MAP_SIZE - 1).contains(&a.y)
        || !(1..=3).contains(&a.size)
        || p.bank_lead
    {
        return false;
    }
    let left = a.x - a.size / 2;
    let top = a.y - a.size / 2;
    (0..a.size).any(|n| {
        [
            ([left + n, top - 1], [(left + n) as f32, top as f32 - 0.5]),
            ([left - 1, top + n], [left as f32 - 0.5, (top + n) as f32]),
            (
                [left + n, top + a.size],
                [(left + n) as f32, (top + a.size) as f32 - 0.5],
            ),
            (
                [left + a.size, top + n],
                [(left + a.size) as f32 - 0.5, (top + n) as f32],
            ),
        ]
        .iter()
        .any(|(cell, edge)| p.cell == *cell && p.edge == *edge)
    })
}
fn anchor_identity(v: &Village, id: i32, a: &Anchor) -> bool {
    match owner(id) {
        Some(water::Owner::Camp) => a.kind == "camp" && (a.x as f32, a.y as f32) == CAMP,
        Some(water::Owner::Source(index)) => v.economy.sources.get(index).is_some_and(|s| {
            a.kind
                == if s.material == 0 {
                    "source_timber"
                } else {
                    "source_bamboo"
                }
                && s.material < 2
        }),
        Some(water::Owner::Building(id)) => {
            !matches!(a.kind.as_str(), "camp" | "source_timber" | "source_bamboo")
                && v.buildings
                    .iter()
                    .find(|b| b.id == id)
                    .is_none_or(|b| b.kind == a.kind)
        }
        _ => false,
    }
}
#[wasm_bindgen]
impl Game {
    pub fn water_connections(&self) -> String {
        view(self.app.world().resource::<Village>()).to_string()
    }
    pub fn water_connection_quote(&self, kind: &str, from: i32, to: i32) -> String {
        let v = self.app.world().resource::<Village>();
        match Kind::parse(kind)
            .ok_or("Choose fresh water, irrigation, greywater or sealed sewage.")
            .and_then(|k| {
                if v.pipes.lines.iter().any(|p| {
                    p.live()
                        && p.phase != Phase::Removing
                        && p.plan.kind == k
                        && p.plan.from == from
                        && p.plan.to == to
                }) {
                    Err("This connection is already planned or installed.")
                } else {
                    propose(v, k, from, to)
                }
            }) {
            Ok((plan, _)) => {
                let parts = kit(&plan);
                serde_json::json!({"allowed":true,"labour_minutes":plan.cells.len() as f32*4.+12.,"parts":parts,"plan":plan,"flow_per_hour":12.,"energy_per_water":ENERGY_PER_WATER}).to_string()
            }
            Err(reason) => serde_json::json!({"allowed":false,"reason":reason}).to_string(),
        }
    }
    pub fn queue_water_connection(&mut self, kind: &str, from: i32, to: i32) -> String {
        let Some(kind) = Kind::parse(kind) else {
            return "Choose fresh water, irrigation, greywater or sealed sewage.".into();
        };
        match queue(
            &mut self.app.world_mut().resource_mut::<Village>(),
            kind,
            from,
            to,
        ) {
            Ok(_) => "ok".into(),
            Err(e) => e.into(),
        }
    }
    pub fn configure_water_connection(&mut self, id: u32, priority: u8, paused: bool) -> String {
        if priority > 3 {
            return "Choose a priority from zero to three.".into();
        }
        let mut v = self.app.world_mut().resource_mut::<Village>();
        let Some(p) = v
            .pipes
            .lines
            .iter_mut()
            .find(|p| p.id == Id(id) && p.live())
        else {
            return "This water line has ended.".into();
        };
        p.priority = priority;
        p.paused = paused;
        economy::rebalance(&mut v);
        "ok".into()
    }
    pub fn remove_water_connection(&mut self, id: u32) -> String {
        if remove(&mut self.app.world_mut().resource_mut::<Village>(), Id(id)) {
            "ok".into()
        } else {
            "This water line is already ending.".into()
        }
    }
}

#[cfg(test)]
mod tests;
