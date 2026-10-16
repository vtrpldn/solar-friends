//! Resident packing, physical transport and recovery of owned battery equipment.
use super::*;
use crate::electricity::{Id, Kind as NodeKind, Node, Owner};
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Action {
    Move,
    Salvage,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Packing,
    Carrying,
    Installing,
    Salvaging,
    Complete,
    Cancelled,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Job {
    pub id: Id,
    pub bank: Id,
    pub action: Action,
    pub phase: Phase,
    pub origin: [i32; 2],
    pub destination: Option<[i32; 2]>,
    pub carrier: Option<usize>,
    pub work: f32,
    pub created: f32,
    pub finished: Option<f32>,
    pub recovered: u8,
}
impl Job {
    pub fn active(&self) -> bool {
        !matches!(self.phase, Phase::Complete | Phase::Cancelled)
    }
}
pub fn job(v: &Village, id: Id) -> Option<&Job> {
    v.power.battery_jobs.iter().find(|j| j.id == id)
}
pub fn bank(v: &Village, id: Id) -> Option<&Node> {
    v.power
        .network
        .nodes
        .iter()
        .find(|n| n.id == id && n.capacity > 0.)
}
pub fn busy(v: &Village, id: Id) -> bool {
    v.power
        .battery_jobs
        .iter()
        .any(|j| j.bank == id && j.active())
}
pub fn installed_equipment(v: &Village, id: usize) -> u8 {
    v.economy
        .projects
        .iter()
        .find(|p| p.building == id)
        .map_or(0, |p| p.consumed[13].min(1) as u8)
}
pub fn retained_equipment(v: &Village, id: usize) -> u32 {
    v.power
        .network
        .nodes
        .iter()
        .find(|n| n.owner == Owner::Building(id))
        .map_or(0, |n| u32::from(n.equipment))
}
pub fn total(j: &Job) -> f32 {
    match j.phase {
        Phase::Packing => 12.,
        Phase::Installing => 18.,
        Phase::Salvaging => 36.,
        _ => 0.,
    }
}
pub fn reason(j: &Job) -> &'static str {
    match j.phase {
        Phase::Packing => "Disconnecting and packing our recovered battery.",
        Phase::Carrying => "Bringing our battery to its reserved plot.",
        Phase::Installing => "Installing our battery at its new plot.",
        Phase::Salvaging => "Carefully recovering reusable battery equipment.",
        _ => "The battery work is finished.",
    }
}
pub fn reserved(v: &Village, x: i32, y: i32, ignore: Option<Id>) -> bool {
    v.power
        .network
        .nodes
        .iter()
        .any(|n| Some(n.id) != ignore && n.owner == Owner::Ground && (n.x, n.y) == (x, y))
        || v.power
            .battery_jobs
            .iter()
            .any(|j| j.active() && Some(j.bank) != ignore && j.destination == Some([x, y]))
}
pub fn placeable(v: &Village, x: i32, y: i32, ignore: Option<Id>) -> bool {
    plot_clear(v,x,y,ignore)
        && !v.logistics.as_ref().is_some_and(|s|s.stores.iter().any(|p|p.owner==logistics::Owner::Ground&&p.items.iter().any(|n|*n>0)&&[p.x.round() as i32,p.y.round() as i32]==[x,y]))
        && !v.water_supply.tanks.iter().any(|t|t.water.iter().any(|n|*n>0.000001)&&[t.x.round() as i32,t.y.round() as i32]==[x,y]
            && (t.owner==water::Owner::Ground||matches!(t.owner,water::Owner::Building(id) if v.buildings.iter().all(|b|b.id!=id))))
}
fn plot_clear(v: &Village, x: i32, y: i32, ignore: Option<Id>) -> bool {
    utilities::base_clear(v, x, y)
        && !v.roads.contains(&(x, y))
        && !pipes::reserved(v, x, y)
        && !reserved(v, x, y, ignore)
}
fn nearest(
    v: &Village,
    id: Id,
    point: [f32; 2],
    avoid: Option<[i32; 2]>,
    radius: Option<f32>,
) -> Option<[i32; 2]> {
    let mut cells: Vec<_> = (1..MAP_SIZE - 1)
        .flat_map(|y| (1..MAP_SIZE - 1).map(move |x| [x, y]))
        .filter(|p| {
            Some(*p) != avoid
                && radius
                    .is_none_or(|r| (p[0] as f32 - point[0]).hypot(p[1] as f32 - point[1]) <= r)
        })
        .collect();
    cells.sort_by(|a, b| {
        ((a[0] as f32 - point[0]).hypot(a[1] as f32 - point[1]))
            .total_cmp(&(b[0] as f32 - point[0]).hypot(b[1] as f32 - point[1]))
    });
    cells.into_iter().find(|p| {
        placeable(v, p[0], p[1], Some(id))
            && navigation::route(v, [CAMP.0, CAMP.1], [p[0] as f32, p[1] as f32]).is_ok()
    })
}
pub fn recovery_location(v: &Village, n: &Node) -> Option<[i32; 2]> {
    nearest(v, n.id, [n.x as f32, n.y as f32], None, None)
}
pub fn can_recover_after(v: &Village, id: usize) -> bool {
    let Some(n) = v
        .power
        .network
        .nodes
        .iter()
        .find(|n| n.owner == Owner::Building(id) && n.capacity > 0.)
    else {
        return true;
    };
    let mut copy = v.clone();
    copy.buildings.retain(|b| b.id != id);
    let avoid = building_work::job(v, id)
        .filter(|j| j.returns.iter().any(|n| *n > 0))
        .map(|j| [j.original_x, j.original_y]);
    nearest(&copy, n.id, [n.x as f32, n.y as f32], avoid, None).is_some()
}
pub fn ready(v: &Village, j: &Job, resident: usize) -> bool {
    j.active()
        && bank(v, j.bank).is_some()
        && match j.phase {
            Phase::Carrying => j.carrier == Some(resident),
            Phase::Packing | Phase::Salvaging | Phase::Installing => {
                j.work < total(j)
                    && !v
                        .power
                        .network
                        .nodes
                        .iter()
                        .any(|n| n.owner == Owner::Carrier(resident))
            }
            _ => false,
        }
}
pub fn approach(v: &Village, id: Id, resident: usize) -> Option<[f32; 2]> {
    let j = job(v, id).filter(|j| ready(v, j, resident))?;
    let n = bank(v, j.bank)?;
    let point = if j.phase == Phase::Carrying {
        j.destination?
    } else {
        [n.x, n.y]
    };
    for turn in 0..8 {
        let a = (resident as f32 / 5. + turn as f32 / 8.) * std::f32::consts::TAU;
        let p = [
            point[0] as f32 + a.cos() * 0.9,
            point[1] as f32 + a.sin() * 0.9,
        ];
        if navigation::clear(v, p[0], p[1]) {
            return Some(p);
        }
    }
    None
}
pub fn assign_target(r: &mut Resident, v: &Village, id: Id) -> bool {
    let Some(p) = approach(v, id, r.id) else {
        return false;
    };
    r.task = "utility".into();
    r.activity_material = Some(id.0 as usize);
    r.activity_building = None;
    r.activity_batch = None;
    r.activity_store = None;
    r.remaining = 10.;
    r.reason = reason(job(v, id).unwrap()).into();
    [r.target_x, r.target_y] = p;
    true
}
fn relocate(v: &mut Village, id: Id, owner: Owner, p: [i32; 2]) {
    let n = v
        .power
        .network
        .nodes
        .iter_mut()
        .find(|n| n.id == id)
        .unwrap();
    n.owner = owner;
    n.x = p[0];
    n.y = p[1];
    if let Some(f) = &mut v.power.frame {
        f.relocate_battery(id, owner, p[0], p[1]);
    }
}
pub fn interrupt(v: &mut Village, r: &Resident) {
    let Some(j) = v
        .power
        .battery_jobs
        .iter()
        .find(|j| j.phase == Phase::Carrying && j.carrier == Some(r.id))
        .cloned()
    else {
        return;
    };
    if r.task == "utility" && r.activity_material == Some(j.id.0 as usize) && r.trip.is_none() {
        return;
    }
    // Keep ownership with the carrier until there is an actual safe nearby handoff.
    let Some(p) = nearest(v, j.bank, [r.x, r.y], None, Some(2.5)) else {
        return;
    };
    relocate(v, j.bank, Owner::Ground, p);
    let row = v
        .power
        .battery_jobs
        .iter_mut()
        .find(|p| p.id == j.id)
        .unwrap();
    row.phase = Phase::Packing;
    row.work = 0.;
    row.carrier = None;
    row.origin = p;
    event(
        v,
        "Our battery was put down safely before a break. Its relocation stays queued.",
    );
}
pub fn work(v: &mut Village, r: &Resident, minutes: f32) -> bool {
    let Some(j) = r
        .activity_material
        .and_then(|id| u32::try_from(id).ok())
        .and_then(|id| job(v, Id(id)))
        .cloned()
    else {
        return false;
    };
    if !ready(v, &j, r.id) || r.task != "utility" || !minutes.is_finite() || minutes <= 0. {
        return false;
    }
    let Some(p) = approach(v, j.id, r.id) else {
        return false;
    };
    if (r.x - p[0]).hypot(r.y - p[1]) > 0.08 {
        return false;
    }
    if j.phase == Phase::Carrying {
        let dest = j.destination.unwrap();
        if !placeable(v, dest[0], dest[1], Some(j.bank)) {
            return false;
        }
        relocate(v, j.bank, Owner::Ground, dest);
        let row = v
            .power
            .battery_jobs
            .iter_mut()
            .find(|p| p.id == j.id)
            .unwrap();
        row.phase = Phase::Installing;
        row.carrier = None;
        row.work = 0.;
        return false;
    }
    let pace = skills::factor(v, r.id, skills::Skill::Care);
    let row = v
        .power
        .battery_jobs
        .iter_mut()
        .find(|p| p.id == j.id)
        .unwrap();
    row.work = (row.work + minutes * pace).min(total(&j));
    if row.work < total(&j) {
        return false;
    }
    if j.phase == Phase::Packing {
        row.phase = Phase::Carrying;
        row.work = 0.;
        row.carrier = Some(r.id);
        let n = bank(v, j.bank).unwrap();
        relocate(v, j.bank, Owner::Carrier(r.id), [n.x, n.y]);
    } else if j.phase == Phase::Installing {
        row.phase = Phase::Complete;
        row.finished = Some(v.minutes);
        skills::award(v, r.id, skills::Skill::Care, 4);
        event(
            v,
            "Our battery is installed. Neighbours can reconnect its cables.",
        );
        return true;
    }
    false
}
pub fn reserve(v: &Village) -> u32 {
    v.power
        .battery_jobs
        .iter()
        .filter(|j| j.active() && j.action == Action::Salvage)
        .filter_map(|j| bank(v, j.bank))
        .map(|n| u32::from(n.equipment))
        .sum()
}
pub fn finish_ready(v: &mut Village) {
    if v.power.frame.is_some() {
        return;
    }
    let ids: Vec<_> = v
        .power
        .battery_jobs
        .iter()
        .filter(|j| j.phase == Phase::Salvaging && j.work >= total(j))
        .map(|j| j.id)
        .collect();
    for id in ids {
        let j = job(v, id).unwrap().clone();
        let Some(n) = bank(v, j.bank).cloned() else {
            continue;
        };
        if v.power.network.account.discharged + n.charge > 1e9 {
            continue;
        }
        let store = if n.equipment > 0 {
            if economy::storage(v) > economy::capacity(v) {
                continue;
            }
            let Some(store) =
                logistics::create(v, logistics::Owner::Ground, n.x as f32, n.y as f32, 1)
            else {
                continue;
            };
            Some(store)
        } else {
            None
        };
        v.power
            .network
            .retire_battery(v.simulation.next_id, j.bank)
            .unwrap();
        let row = v
            .power
            .battery_jobs
            .iter_mut()
            .find(|p| p.id == id)
            .unwrap();
        row.phase = Phase::Complete;
        row.finished = Some(v.minutes);
        row.recovered = n.equipment;
        if let Some(store) = store {
            let mut items = [0; economy::COUNT];
            items[13] = u32::from(n.equipment);
            logistics::receive_salvage(v, store, items);
            v.power.salvaged_equipment += u64::from(n.equipment);
        }
        event(
            v,
            "Battery salvage is finished. Remaining charge was safely discharged; recorded reusable equipment awaits collection.",
        );
    }
    network::summaries(v);
    pipes::reconcile(v);
}
pub fn prune(v: &mut Village, residents: &[Resident]) {
    let mut history = 0;
    let mut retired = 0;
    v.power.battery_jobs.reverse();
    v.power.battery_jobs.retain(|j| {
        if j.active()
            || residents
                .iter()
                .any(|r| r.task == "utility" && r.activity_material == Some(j.id.0 as usize))
        {
            return true;
        }
        history += 1;
        if history <= 32 {
            true
        } else {
            retired += u64::from(j.recovered);
            false
        }
    });
    v.power.battery_jobs.reverse();
    v.power.retired_equipment += retired;
}
pub fn valid(v: &Village) -> bool {
    if v.version == 3 {
        return v.power.battery_jobs.is_empty();
    }
    let p = &v.power;
    let available =
        p.opening_equipment + v.simulation.materials.as_ref().map_or(0, |m| m.spent[13]);
    if p.opening_equipment > 1_000_000_000
        || p.salvaged_equipment > 1_000_000_000
        || p.retired_equipment > p.salvaged_equipment
        || p.network
            .nodes
            .iter()
            .map(|n| u64::from(n.equipment))
            .sum::<u64>()
            + p.salvaged_equipment
            > available
        || p.salvaged_equipment
            != p.retired_equipment
                + p.battery_jobs
                    .iter()
                    .map(|j| u64::from(j.recovered))
                    .sum::<u64>()
        || p.battery_jobs.len() > 256
    {
        return false;
    }
    let mut ids = std::collections::HashSet::new();
    let mut active = std::collections::HashSet::new();
    let mut destinations = std::collections::HashSet::new();
    for j in &p.battery_jobs {
        if j.id.0 == 0
            || j.id.0 >= v.simulation.next_id
            || j.bank.0 == 0
            || j.bank.0 >= v.simulation.next_id
            || !ids.insert(j.id)
            || !j.work.is_finite()
            || j.work < 0.
            || !j.created.is_finite()
            || !(0. ..=v.minutes).contains(&j.created)
            || j.finished.is_some() != !j.active()
            || j.finished
                .is_some_and(|t| !t.is_finite() || !(j.created..=v.minutes).contains(&t))
            || j.carrier.is_some_and(|id| id >= 5)
            || (j.action == Action::Move) != j.destination.is_some()
            || j.destination.is_some_and(|d| {
                d.iter().any(|n| !(1..MAP_SIZE - 1).contains(n)) || river_bank(d[0], d[1])
            })
            || j.recovered > 1
            || (j.recovered > 0 && (j.action != Action::Salvage || j.phase != Phase::Complete))
            || j.origin.iter().any(|n| !(1..MAP_SIZE - 1).contains(n))
            || river_bank(j.origin[0], j.origin[1])
            || (j.phase == Phase::Carrying) != j.carrier.is_some()
        {
            return false;
        }
        if j.active() {
            let Some(n) = bank(v, j.bank) else {
                return false;
            };
            if n.kind != NodeKind::Battery
                || !active.insert(j.bank)
                || j.work > total(j)
                || matches!(j.phase, Phase::Packing | Phase::Installing) && j.work >= total(j)
                || (j.phase == Phase::Carrying && n.owner != Owner::Carrier(j.carrier.unwrap()))
                || (j.phase != Phase::Carrying && n.owner != Owner::Ground)
                || match j.action {
                    Action::Move => {
                        !matches!(
                            j.phase,
                            Phase::Packing | Phase::Carrying | Phase::Installing
                        ) || j.destination.is_none_or(|d| {
                            !destinations.insert(d) || !plot_clear(v, d[0], d[1], Some(j.bank))
                        })
                    }
                    Action::Salvage => j.phase != Phase::Salvaging || j.destination.is_some(),
                }
            {
                return false;
            }
        }
    }
    p.network.nodes.iter().all(|n| match n.owner {
        Owner::Carrier(id) => p
            .battery_jobs
            .iter()
            .any(|j| j.bank == n.id && j.phase == Phase::Carrying && j.carrier == Some(id)),
        Owner::Ground => placeable(v, n.x, n.y, Some(n.id)),
        _ => true,
    })
}
pub fn view(v: &Village) -> serde_json::Value {
    serde_json::json!({"jobs":v.power.battery_jobs,"opening_equipment":v.power.opening_equipment,"salvaged_equipment":v.power.salvaged_equipment,"note":"Packing, transport and installation require a resident. Salvage returns only recorded reusable battery equipment; remaining charge is discharged separately."})
}
fn move_reason(v: &Village, id: Id, x: i32, y: i32) -> Result<(), &'static str> {
    let n = bank(v, id)
        .filter(|n| n.owner == Owner::Ground && n.kind == NodeKind::Battery)
        .ok_or("Choose a recovered battery on the ground.")?;
    if busy(v, id) {
        return Err("This battery already has resident work queued.");
    }
    if [x, y] == [n.x, n.y] || !placeable(v, x, y, Some(id)) {
        return Err(
            "Choose an empty land cell, clear of roads, utility routes, piles and other reserved work.",
        );
    }
    navigation::work_route(v, [n.x as f32, n.y as f32], [x as f32, y as f32])
        .map_err(|_| "Leave a reachable route to the battery's destination.")?;
    Ok(())
}
#[wasm_bindgen]
impl Game {
    pub fn battery_plot_available(&self, bank: u32, x: i32, y: i32) -> bool {
        let v = self.app.world().resource::<Village>();
        self::bank(v, Id(bank)).is_some_and(|n| n.owner == Owner::Ground && [x, y] != [n.x, n.y])
            && !busy(v, Id(bank))
            && placeable(v, x, y, Some(Id(bank)))
    }
    pub fn battery_move_quote(&self, bank: u32, x: i32, y: i32) -> String {
        let result = move_reason(self.app.world().resource::<Village>(), Id(bank), x, y);
        serde_json::json!({"allowed":result.is_ok(),"reason":result.err().unwrap_or("Residents will pack, carry and install the battery. Existing cables must be dismantled and reinstalled."),"packing_minutes":12,"installation_minutes":18}).to_string()
    }
    pub fn queue_battery_work(&mut self, bank: u32, action: &str, x: i32, y: i32) -> String {
        {
            let mut v = self.app.world_mut().resource_mut::<Village>();
            let id = Id(bank);
            let Some(n) = self::bank(&v, id)
                .filter(|n| n.owner == Owner::Ground && n.kind == NodeKind::Battery)
                .cloned()
            else {
                return "Choose a recovered battery on the ground.".into();
            };
            if busy(&v, id) {
                return "This battery already has resident work queued.".into();
            }
            let (action, phase, dest) = match action {
                "move" => (Action::Move, Phase::Packing, Some([x, y])),
                "salvage" => (Action::Salvage, Phase::Salvaging, None),
                _ => return "Choose move or careful battery salvage.".into(),
            };
            if let Some(d) = dest
                && let Err(reason) = move_reason(&v, id, d[0], d[1])
            {
                return reason.into();
            }
            let reserve = if action == Action::Salvage {
                u32::from(n.equipment)
            } else {
                0
            };
            if economy::storage(&v) + reserve > economy::capacity(&v) {
                return "Make receiving room for the recovered battery equipment first.".into();
            }
            if v.power.battery_jobs.len() >= 256
                || v.simulation
                    .next_id
                    .checked_add(1 + u32::from(reserve > 0))
                    .is_none()
            {
                return "Finish existing equipment work before queuing more.".into();
            }
            let job = v.simulation.allocate().unwrap();
            let created = v.minutes;
            v.power.battery_jobs.push(Job {
                id: job,
                bank: id,
                action,
                phase,
                origin: [n.x, n.y],
                destination: dest,
                carrier: None,
                work: 0.,
                created,
                finished: None,
                recovered: 0,
            });
            economy::rebalance(&mut v);
            maintenance::sync(&mut v);
        }
        self.sync_maintenance_activities();
        "ok".into()
    }
    pub fn cancel_battery_work(&mut self, id: u32) -> String {
        let mut v = self.app.world_mut().resource_mut::<Village>();
        let now = v.minutes;
        let Some(j) = v
            .power
            .battery_jobs
            .iter_mut()
            .find(|j| j.id == Id(id) && j.active())
        else {
            return "Active battery work not found.".into();
        };
        if matches!(j.phase, Phase::Carrying | Phase::Installing) {
            return "Let the carrier put the battery down before cancelling its relocation.".into();
        }
        j.phase = Phase::Cancelled;
        j.finished = Some(now);
        economy::rebalance(&mut v);
        "ok".into()
    }
}

pub fn clear_at(v: &Village, x: f32, y: f32) -> bool {
    v.power
        .network
        .nodes
        .iter()
        .filter(|n| n.owner == Owner::Ground)
        .all(|n| clear_bank(n, x, y))
}
pub fn clear_bank(n: &Node, x: f32, y: f32) -> bool {
    x <= n.x as f32 - 0.7 || x >= n.x as f32 + 0.7 || y <= n.y as f32 - 0.7 || y >= n.y as f32 + 0.7
}
