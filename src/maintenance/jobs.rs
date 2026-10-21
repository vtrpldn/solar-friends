//! Locally supplied, interruptible service work for one physical equipment unit.
use super::*;
use economy::{Bundle, COUNT, TOOLS};
use logistics::Owner;

pub const BUFFER: u32 = 12;
#[derive(Clone, Serialize, Deserialize)]
pub struct Job {
    pub id: Id,
    pub equipment: Equipment,
    pub anchor: [f32; 2],
    pub created: f32,
    pub finished: Option<f32>,
    pub cancelled: bool,
    pub paused: bool,
    pub work: f32,
    pub gain: f64,
    pub spent: Option<[[u64; 2]; COUNT]>,
}
impl Job {
    pub fn active(&self) -> bool {
        self.finished.is_none()
    }
    pub fn labour(&self) -> f32 {
        match self.equipment {
            Equipment::Pump(_) => 32.,
            Equipment::Workshop(_) => 24.,
            Equipment::Battery(_) => 36.,
            Equipment::Truck => 48.,
        }
    }
    pub fn kit(&self) -> Bundle {
        kit(self.equipment)
    }
}
pub fn kit(equipment: Equipment) -> Bundle {
    let mut n = [0; COUNT];
    match equipment {
        Equipment::Pump(_) => {
            n[8] = 1;
            n[9] = 1;
            n[TOOLS] = 1;
        }
        Equipment::Workshop(_) => {
            n[8] = 1;
            n[TOOLS] = 2;
        }
        Equipment::Battery(_) => {
            n[10] = 2;
            n[TOOLS] = 1;
        }
        Equipment::Truck => {
            n[4] = 2;
            n[8] = 1;
            n[TOOLS] = 1;
        }
    }
    n
}
pub fn job(v: &Village, id: Id) -> Option<&Job> {
    v.maintenance.jobs.iter().find(|j| j.id == id)
}
pub(crate) fn building(v: &Village, key: Equipment) -> Option<usize> {
    match key {
        Equipment::Workshop(id) => Some(id),
        Equipment::Battery(id) => v
            .power
            .network
            .nodes
            .iter()
            .find(|n| n.id == id)
            .and_then(|n| match n.owner {
                electricity::Owner::Building(id) => Some(id),
                _ => None,
            }),
        _ => None,
    }
}
fn location(v: &Village, key: Equipment) -> Option<[f32; 2]> {
    assets(v)
        .iter()
        .find(|a| a.equipment == key)
        .map(|a| a.location)
}
fn accessible(v: &Village, key: Equipment) -> bool {
    if building(v, key).is_some_and(|id| building_work::job(v, id).is_some()) {
        return false;
    }
    match key {
        Equipment::Pump(id) => v
            .power
            .network
            .nodes
            .iter()
            .find(|n| n.id == id)
            .is_some_and(|n| match n.owner {
                electricity::Owner::Pump(id) => {
                    pipes::line(v, id).is_some_and(|p| p.phase == pipes::Phase::Active)
                }
                _ => false,
            }),
        Equipment::Battery(id) => v
            .power
            .network
            .nodes
            .iter()
            .find(|n| n.id == id)
            .is_some_and(|n| {
                !matches!(n.owner, electricity::Owner::Carrier(_)) && !power::batteries::busy(v, id)
            }),
        Equipment::Truck => !v.economy.orders.iter().any(|o| o.status == "collecting"),
        Equipment::Workshop(id) => v.buildings.iter().any(|b| b.id == id && b.progress >= 100.),
    }
}
pub fn anchored(v: &Village, j: &Job) -> bool {
    location(v, j.equipment) == Some(j.anchor) && accessible(v, j.equipment)
}
pub fn in_service(v: &Village, equipment: Equipment) -> bool {
    v.maintenance
        .jobs
        .iter()
        .any(|j| j.active() && j.equipment == equipment)
}
pub fn needs(v: &Village, id: Id) -> Bundle {
    job(v, id)
        .filter(|j| j.active() && j.spent.is_none())
        .map_or([0; COUNT], Job::kit)
}
pub fn held(v: &Village, owner: Owner, i: usize) -> u32 {
    match owner {
        Owner::Maintenance(id) => needs(v, id)[i],
        _ => 0,
    }
}
pub fn demand(v: &Village, i: usize) -> u32 {
    v.maintenance
        .jobs
        .iter()
        .filter(|j| j.active() && j.spent.is_none())
        .map(|j| j.kit()[i])
        .sum()
}
pub fn unclaimed(v: &Village, i: usize) -> u32 {
    v.maintenance
        .jobs
        .iter()
        .filter(|j| j.active() && j.spent.is_none())
        .map(|j| {
            let store = v.logistics.as_ref().and_then(|s| {
                s.stores
                    .iter()
                    .find(|p| p.owner == Owner::Maintenance(j.id))
            });
            let here = store.map_or(0, |p| p.items[i]);
            let incoming = store.map_or(0, |p| {
                v.logistics
                    .as_ref()
                    .unwrap()
                    .shipments
                    .iter()
                    .filter(|h| h.to == p.id && h.material == i)
                    .map(|h| h.amount)
                    .sum()
            });
            j.kit()[i].saturating_sub(here + incoming)
        })
        .sum()
}
pub fn ready(v: &Village, j: &Job) -> bool {
    v.maintenance.enabled
        && j.active()
        && !j.paused
        && anchored(v, j)
        && (j.spent.is_some()
            || j.kit()
                .iter()
                .enumerate()
                .all(|(i, &n)| organics::available(v, Owner::Maintenance(j.id), i) >= n))
}
pub fn approach(v: &Village, id: Id, resident: usize) -> Option<[f32; 2]> {
    let j = job(v, id).filter(|j| ready(v, j))?;
    if let Some(b) = building(v, j.equipment).and_then(|id| v.buildings.iter().find(|b| b.id == id))
    {
        return spacing::approach(v, b, resident).map(|p| [p.0, p.1]);
    }
    let p = v
        .logistics
        .as_ref()?
        .stores
        .iter()
        .find(|p| p.owner == Owner::Maintenance(id))?;
    logistics::approaches(v, p, resident)
}
pub fn assign_target(r: &mut Resident, v: &Village, id: Id) -> bool {
    let Some(j) = job(v, id).filter(|j| ready(v, j)) else {
        return false;
    };
    let Some(point) = approach(v, id, r.id) else {
        return false;
    };
    r.task = "utility".into();
    r.activity_material = Some(id.0 as usize);
    r.activity_building = None;
    r.activity_batch = None;
    r.activity_store = None;
    r.reason = "Servicing village equipment with delivered spare parts.".into();
    r.remaining = (j.labour() - j.work) / MINUTES_PER_SECOND;
    (r.target_x, r.target_y) = (point[0], point[1]);
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
    let Some(j) = job(v, id).filter(|j| ready(v, j)).cloned() else {
        return false;
    };
    if r.task != "utility"
        || r.id >= 5
        || !minutes.is_finite()
        || minutes <= 0.
        || (r.x - r.target_x).hypot(r.y - r.target_y) > 0.08
        || (r.x - j.anchor[0]).hypot(r.y - j.anchor[1]) > 4.
        || approach(v, id, r.id).is_none_or(|p| (r.x - p[0]).hypot(r.y - p[1]) > 0.08)
    {
        return false;
    }
    if j.spent.is_none() {
        let mut receipt = [[0; 2]; COUNT];
        for (i, n) in j.kit().into_iter().enumerate() {
            if n > 0 {
                let before = v.simulation.materials.as_ref().unwrap().spent[i];
                logistics::spend(v, Some(Owner::Maintenance(id)), i, n);
                receipt[i] = [before, v.simulation.materials.as_ref().unwrap().spent[i]];
            }
        }
        let condition = v
            .maintenance
            .records
            .iter()
            .find(|r| r.equipment == j.equipment)
            .unwrap()
            .condition;
        let row = v.maintenance.jobs.iter_mut().find(|j| j.id == id).unwrap();
        row.spent = Some(receipt);
        row.gain = 100. - condition;
    }
    let amount = (minutes * skills::factor(v, r.id, skills::Skill::Care)).min(j.labour() - j.work);
    let gain = job(v, id).unwrap().gain;
    let row = v
        .maintenance
        .records
        .iter_mut()
        .find(|r| r.equipment == j.equipment)
        .unwrap();
    row.condition = (row.condition + gain * f64::from(amount / j.labour())).min(100.);
    let row = v.maintenance.jobs.iter_mut().find(|j| j.id == id).unwrap();
    row.work = (row.work + amount).min(j.labour());
    if row.work >= j.labour() {
        row.finished = Some(v.minutes);
        skills::award(v, r.id, skills::Skill::Care, 4);
        v.maintenance
            .records
            .iter_mut()
            .find(|r| r.equipment == j.equipment)
            .unwrap()
            .condition = 100.;
        event(
            v,
            format!(
                "{} serviced by a neighbour. Ready for use.",
                j.equipment.label()
            ),
        );
        logistics::sync(v);
        return true;
    }
    false
}
pub fn reconcile(v: &mut Village) {
    if v.maintenance.jobs.is_empty() {
        return;
    }
    let cancelled: Vec<_> = v
        .maintenance
        .jobs
        .iter()
        .filter(|j| j.active() && (!v.maintenance.enabled || !anchored(v, j)))
        .map(|j| j.id)
        .collect();
    for id in cancelled {
        let row = v.maintenance.jobs.iter_mut().find(|j| j.id == id).unwrap();
        row.finished = Some(v.minutes);
        row.cancelled = true;
    }
    // A closing or relocated unit leaves unused parts at the original worksite.
    // Preserve store IDs so carried loads can use the usual recovery path.
    if let Some(s) = &mut v.logistics {
        for p in &mut s.stores {
            if matches!(p.owner,Owner::Maintenance(id) if v.maintenance.jobs.iter().all(|j|j.id!=id||!j.active()))
            {
                p.owner = Owner::Ground;
                p.target = [0; COUNT];
            }
        }
    }
}
pub fn queue(v: &mut Village, equipment: Equipment) -> Result<Id, &'static str> {
    if !v.maintenance.enabled {
        return Err("Enable equipment condition before scheduling service.");
    }
    let Some(record) = v
        .maintenance
        .records
        .iter()
        .find(|r| r.equipment == equipment)
    else {
        return Err("Equipment not found.");
    };
    if record.condition > SERVICE_AT {
        return Err("This equipment is healthy. Schedule service when its condition reaches 70%.");
    }
    if in_service(v, equipment) {
        return Err("This equipment already has a service order.");
    }
    if !accessible(v, equipment) {
        return Err("Finish the equipment's trip, installation or crew work before servicing it.");
    }
    if v.maintenance.jobs.iter().filter(|j| j.active()).count() >= 64 {
        return Err("Finish some current service work first.");
    }
    let anchor = location(v, equipment).ok_or("Equipment is no longer here.")?;
    if v.simulation.next_id > u32::MAX - 2 {
        return Err("No service-order identities remain.");
    }
    v.maintenance
        .records
        .iter_mut()
        .find(|r| r.equipment == equipment)
        .unwrap()
        .automatic_deferred = false;
    let id = v.simulation.allocate().unwrap();
    let referenced: Vec<_> = v
        .workforce_peers
        .values()
        .flatten()
        .filter(|r| r.task == "utility")
        .filter_map(|r| r.activity_material)
        .collect();
    let mut history = 0;
    v.maintenance.jobs.reverse();
    v.maintenance.jobs.retain(|j| {
        if j.active() || referenced.contains(&(j.id.0 as usize)) {
            true
        } else {
            history += 1;
            history <= 32
        }
    });
    v.maintenance.jobs.reverse();
    v.maintenance.jobs.push(Job {
        id,
        equipment,
        anchor,
        created: v.minutes,
        finished: None,
        cancelled: false,
        paused: false,
        work: 0.,
        gain: 0.,
        spent: None,
    });
    logistics::sync(v);
    v.logistics.as_mut().unwrap().retry_after.clear();
    Ok(id)
}
pub fn cancel(v: &mut Village, id: Id) -> bool {
    let Some(row) = v
        .maintenance
        .jobs
        .iter_mut()
        .find(|j| j.id == id && j.active())
    else {
        return false;
    };
    row.finished = Some(v.minutes);
    row.cancelled = true;
    let key = row.equipment;
    if let Some(r) = v
        .maintenance
        .records
        .iter_mut()
        .find(|r| r.equipment == key)
    {
        r.automatic_deferred = true;
    }
    logistics::sync(v);
    true
}
pub fn valid(v: &Village) -> bool {
    if v.version == 3 {
        return v.maintenance.jobs.is_empty();
    }
    if v.maintenance.jobs.len() > 128
        || v.maintenance.jobs.iter().filter(|j| j.active()).count() > 64
    {
        return false;
    }
    let mut receipts: Vec<(usize, u64, u64)> = vec![];
    for (index, j) in v.maintenance.jobs.iter().enumerate() {
        let target_valid = match j.equipment {
            Equipment::Truck => true,
            Equipment::Workshop(id) => id < v.economy.next_building,
            Equipment::Pump(id) | Equipment::Battery(id) => id.0 > 0 && id.0 < v.simulation.next_id,
        };
        if !target_valid
            || j.id.0 == 0
            || j.id.0 >= v.simulation.next_id
            || v.maintenance.jobs[..index]
                .iter()
                .any(|p| p.id == j.id || p.active() && j.active() && p.equipment == j.equipment)
            || !j.created.is_finite()
            || !(0.0..=v.minutes).contains(&j.created)
            || !j.work.is_finite()
            || !(0.0..=j.labour()).contains(&j.work)
            || !j.gain.is_finite()
            || !(0.0..=100.).contains(&j.gain)
            || j.anchor
                .iter()
                .any(|n| !n.is_finite() || !(0.0..MAP_SIZE as f32).contains(n))
            || j.finished
                .is_some_and(|t| !t.is_finite() || !(j.created..=v.minutes).contains(&t))
            || j.cancelled && j.active()
            || !j.cancelled && !j.active() && j.work != j.labour()
            || j.spent.is_none() && (j.work != 0. || j.gain != 0.)
            || j.spent.is_some() && (j.work <= 0. || j.gain < 100. - SERVICE_AT)
            || j.active()
                && (!v.maintenance.enabled
                    || !anchored(v, j)
                    || j.work >= j.labour()
                    || v.logistics.as_ref().is_none_or(|s| {
                        !s.stores.iter().any(|p| p.owner == Owner::Maintenance(j.id))
                    }))
        {
            return false;
        }
        if let Some(receipt) = j.spent {
            for (i, ([a, b], n)) in receipt.into_iter().zip(j.kit()).enumerate() {
                if n == 0 {
                    if [a, b] != [0, 0] {
                        return false;
                    }
                } else {
                    if a.checked_add(u64::from(n)) != Some(b)
                        || v.simulation
                            .materials
                            .as_ref()
                            .is_none_or(|m| b > m.spent[i])
                        || receipts
                            .iter()
                            .any(|&(k, start, end)| k == i && a < end && b > start)
                    {
                        return false;
                    }
                    receipts.push((i, a, b));
                }
            }
        }
    }
    true
}

pub fn view(v: &Village) -> serde_json::Value {
    let rows:Vec<_>=v.maintenance.jobs.iter().map(|j|{
        let store=v.logistics.as_ref().and_then(|s|s.stores.iter().find(|p|p.owner==Owner::Maintenance(j.id)));
        let here=store.map_or([0;COUNT],|p|p.items);
        let incoming:Bundle=std::array::from_fn(|i|store.map_or(0,|p|v.logistics.as_ref().unwrap().shipments.iter().filter(|h|h.to==p.id&&h.material==i).map(|h|h.amount).sum()));
        let missing:Bundle=std::array::from_fn(|i|if j.spent.is_some(){0}else{j.kit()[i].saturating_sub(here[i]+incoming[i])});
        let phase=if j.cancelled{"cancelled"}else if !j.active(){"complete"}else if j.paused{"paused"}else if j.spent.is_some(){"working"}else if ready(v,j){"ready"}else{"awaiting_parts"};
        serde_json::json!({"job":j,"phase":phase,"labour_minutes":j.labour(),"kit":j.kit(),"here":here,"incoming":incoming,"missing":missing})
    }).collect();
    serde_json::json!(rows)
}
