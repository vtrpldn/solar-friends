//! Attended soil work with delivered compost and persistent partial progress.
use crate::*;
use economy::COMPOST;
use logistics::Owner;
use simulation::Id;
pub const LABOUR: f32 = 32.;
#[derive(Clone, Serialize, Deserialize)]
pub struct Job {
    pub id: Id,
    pub x: i32,
    pub y: i32,
    pub size: i32,
    pub building: Option<usize>,
    pub source: Option<usize>,
    pub created: f32,
    pub finished: Option<f32>,
    pub cancelled: bool,
    pub work: f32,
    pub spent: Option<[u64; 2]>,
}
impl Job {
    pub fn active(&self) -> bool {
        self.finished.is_none()
    }
}
pub fn job(v: &Village, id: Id) -> Option<&Job> {
    v.restoration.iter().find(|j| j.id == id)
}
fn covers(j: &Job, x: i32, y: i32) -> bool {
    (j.x - j.size / 2..j.x - j.size / 2 + j.size).contains(&x)
        && (j.y - j.size / 2..j.y - j.size / 2 + j.size).contains(&y)
}
pub fn reserved(v: &Village, x: i32, y: i32) -> bool {
    v.restoration.iter().any(|j| j.active() && covers(j, x, y))
}
fn contains(n: i32, x: i32, y: i32, a: i32, b: i32) -> bool {
    (x - n / 2..x - n / 2 + n).contains(&a) && (y - n / 2..y - n / 2 + n).contains(&b)
}
fn target(v: &Village, x: i32, y: i32) -> Result<Job, &'static str> {
    let mut j = Job {
        id: Id(0),
        x,
        y,
        size: 2,
        building: None,
        source: None,
        created: v.minutes,
        finished: None,
        cancelled: false,
        work: 0.,
        spent: None,
    };
    if !(1..MAP_SIZE - 1).contains(&x) || !(1..MAP_SIZE - 1).contains(&y) {
        return Err("Choose ground inside the village.");
    }
    if let Some(b) = v
        .buildings
        .iter()
        .find(|b| contains(interactions::footprint_size(&b.kind), b.x, b.y, x, y))
    {
        if b.progress < 100.
            || building_work::job(v, b.id).is_some()
            || !matches!(b.kind.as_str(), "garden" | "greenhouse" | "grove")
        {
            return Err("Restore a growing plot or a clearing, away from building work.");
        }
        j.x = b.x;
        j.y = b.y;
        j.size = interactions::footprint_size(&b.kind);
        j.building = Some(b.id);
    } else if let Some((i, s)) = v
        .economy
        .sources
        .iter()
        .enumerate()
        .find(|(_, s)| s.active && contains(resource_sites::size(s.material), s.x, s.y, x, y))
    {
        if s.material >= 2 {
            return Err("Clear the extraction site before restoring its ground.");
        }
        j.x = s.x;
        j.y = s.y;
        j.size = resource_sites::size(s.material);
        j.source = Some(i);
    }
    for a in j.x - j.size / 2..j.x - j.size / 2 + j.size {
        for b in j.y - j.size / 2..j.y - j.size / 2 + j.size {
            if !(0..MAP_SIZE).contains(&a)
                || !(0..MAP_SIZE).contains(&b)
                || river_bank(a, b)
                || v.roads.contains(&(a, b))
                || building_work::reserved(v, a, b, None)
                || power::batteries::reserved(v, a, b, None)
                || pipes::reserved(v, a, b)
            {
                return Err("Keep restoration on clear land, away from roads and river water.");
            }
            if reserved(v, a, b) {
                return Err("Soil work is already queued on this ground.");
            }
            if v.buildings.iter().any(|p| {
                Some(p.id) != j.building
                    && contains(interactions::footprint_size(&p.kind), p.x, p.y, a, b)
            }) || v.economy.sources.iter().enumerate().any(|(i, s)| {
                s.active
                    && Some(i) != j.source
                    && contains(resource_sites::size(s.material), s.x, s.y, a, b)
            }) {
                return Err("Choose a whole growing plot or a clear patch of ground.");
            }
        }
    }
    let g = land::condition(v, j.size, j.x, j.y);
    if g.nutrients >= 1.249 && g.disturbance <= 0.001 && g.cover >= 0.95 {
        return Err("This ground already has rich soil and good cover.");
    }
    Ok(j)
}
fn anchored(v: &Village, j: &Job) -> bool {
    j.building.is_none_or(|id| {
        v.buildings.iter().any(|b| {
            b.id == id
                && interactions::footprint_size(&b.kind) == j.size
                && (b.x, b.y) == (j.x, j.y)
                && matches!(b.kind.as_str(), "garden" | "greenhouse" | "grove")
        })
    }) && j.source.is_none_or(|i| {
        v.economy.sources.get(i).is_some_and(|s| {
            s.active
                && s.material < 2
                && resource_sites::size(s.material) == j.size
                && (s.x, s.y) == (j.x, j.y)
        })
    })
}
fn open(v: &Village, j: &Job) -> bool {
    anchored(v, j)
        && j.building.is_none_or(|id| {
            building_work::job(v, id).is_none()
                && v.buildings.iter().any(|b| b.id == id && b.progress >= 100.)
        })
}
pub fn held(v: &Village, owner: Owner, i: usize) -> u32 {
    if i != COMPOST {
        return 0;
    }
    let Owner::Restoration(id) = owner else {
        return 0;
    };
    if job(v, id).is_some_and(|j| j.active() && j.spent.is_none()) {
        2
    } else {
        0
    }
}
pub fn reserved_amount(v: &Village, i: usize) -> u32 {
    if i != COMPOST {
        return 0;
    }
    v.restoration
        .iter()
        .filter(|j| j.active() && j.spent.is_none())
        .count() as u32
        * 2
}
pub fn processing(v: &Village, i: usize) -> u32 {
    if i != COMPOST {
        return 0;
    }
    v.restoration
        .iter()
        .filter(|j| j.active() && j.spent.is_some())
        .count() as u32
        * 2
}
pub fn unclaimed(v: &Village, i: usize) -> u32 {
    if i != COMPOST {
        return 0;
    }
    let Some(s) = &v.logistics else {
        return 0;
    };
    v.restoration
        .iter()
        .filter(|j| j.active() && j.spent.is_none())
        .map(|j| {
            let Some(p) = s
                .stores
                .iter()
                .find(|p| p.owner == Owner::Restoration(j.id))
            else {
                return 2;
            };
            let arriving: u32 = s
                .shipments
                .iter()
                .filter(|h| h.to == p.id && h.material == COMPOST)
                .map(|h| h.amount)
                .sum();
            2u32.saturating_sub(p.items[COMPOST] + arriving)
        })
        .sum()
}
pub fn ready(v: &Village, j: &Job) -> bool {
    j.active()
        && open(v, j)
        && (j.spent.is_some() || organics::available(v, Owner::Restoration(j.id), COMPOST) >= 2)
}
pub fn approach(v: &Village, id: Id, resident: usize) -> Option<[f32; 2]> {
    let j = job(v, id)?;
    if !ready(v, j) {
        return None;
    }
    let p = v
        .logistics
        .as_ref()?
        .stores
        .iter()
        .find(|p| p.owner == Owner::Restoration(id))?;
    logistics::approaches(v, p, resident)
}
pub fn assign_target(r: &mut Resident, v: &Village, id: Id) -> bool {
    let Some(j) = job(v, id).filter(|j| ready(v, j)) else {
        return false;
    };
    let Some(p) = v
        .logistics
        .as_ref()
        .and_then(|s| s.stores.iter().find(|p| p.owner == Owner::Restoration(id)))
    else {
        return false;
    };
    let Some(point) = logistics::approaches(v, p, r.id) else {
        return false;
    };
    r.task = "restore".into();
    r.activity_material = Some(id.0 as usize);
    r.activity_building = None;
    r.activity_batch = None;
    r.activity_store = None;
    r.reason = "Applying delivered compost and restoring the soil.".into();
    r.remaining = (LABOUR - j.work) / MINUTES_PER_SECOND;
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
    if r.task != "restore"
        || minutes <= 0.
        || (r.x - r.target_x).hypot(r.y - r.target_y) > 0.08
        || (r.x - j.x as f32).hypot(r.y - j.y as f32) > j.size as f32 / 2. + 3.
    {
        return false;
    }
    if j.spent.is_none() {
        let before = v
            .simulation
            .materials
            .as_ref()
            .map_or(0, |m| m.spent[COMPOST]);
        logistics::spend(v, Some(Owner::Restoration(id)), COMPOST, 2);
        let after = v.simulation.materials.as_ref().unwrap().spent[COMPOST];
        v.restoration.iter_mut().find(|j| j.id == id).unwrap().spent = Some([before, after]);
    }
    let amount = minutes.min(LABOUR - j.work);
    land::restore_soil(v, j.size, j.x, j.y, amount / LABOUR);
    let row = v.restoration.iter_mut().find(|j| j.id == id).unwrap();
    row.work = (row.work + amount).min(LABOUR);
    let complete = row.work >= LABOUR;
    if complete {
        row.finished = Some(v.minutes);
        if let Some(i) = j.source {
            v.economy.sources[i].restored = true;
        }
        event(
            v,
            "A neighbour finished restoring a plot. Its richer soil and ground cover stay with the land.",
        );
        logistics::sync(v);
    }
    complete
}
pub fn cancel(v: &mut Village, id: Id) -> bool {
    let Some(j) = v.restoration.iter_mut().find(|j| j.id == id && j.active()) else {
        return false;
    };
    j.finished = Some(v.minutes);
    j.cancelled = true;
    logistics::sync(v);
    true
}
pub fn reconcile(v: &mut Village) {
    let ids: Vec<_> = v
        .restoration
        .iter()
        .filter(|j| {
            j.active()
                && (!anchored(v, j)
                    || j.building
                        .is_some_and(|id| building_work::job(v, id).is_some()))
        })
        .map(|j| j.id)
        .collect();
    for id in ids {
        cancel(v, id);
    }
}
pub fn queue(v: &mut Village, x: i32, y: i32) -> Result<Id, String> {
    let mut j = target(v, x, y).map_err(str::to_owned)?;
    if economy::free(v, COMPOST) < 2 {
        return Err("Set aside two available compost for this soil work.".into());
    }
    if v.restoration.iter().filter(|j| j.active()).count() >= 128 {
        return Err("Finish an existing soil job first.".into());
    }
    if v.simulation.next_id.checked_add(2).is_none() {
        return Err("No work-order identities remain.".into());
    }
    j.id = v
        .simulation
        .allocate()
        .ok_or("No work-order identities remain.")?;
    let id = j.id;
    // Keep bounded history; active jobs and their exact material claims persist.
    let mut history = 0;
    v.restoration.reverse();
    v.restoration.retain(|j| {
        if j.active() {
            true
        } else {
            history += 1;
            history <= 32
        }
    });
    v.restoration.reverse();
    v.restoration.push(j);
    logistics::sync(v);
    v.logistics.as_mut().unwrap().retry_after = [0.; 5];
    Ok(id)
}
pub fn view(v: &Village) -> serde_json::Value {
    let rows:Vec<_>=v.restoration.iter().map(|j|{
        let supplied=organics::available(v,Owner::Restoration(j.id),COMPOST);
        let phase=if j.cancelled{"cancelled"}else if !j.active(){"complete"}else if j.spent.is_some(){"working"}else if supplied>=2{"ready"}else{"awaiting_inputs"};
        serde_json::json!({"job":j,"phase":phase,"compost_here":supplied,"remaining":(LABOUR-j.work).max(0.),"ground":land::condition(v,j.size,j.x,j.y)})
    }).collect();
    serde_json::json!({"jobs":rows,"compost_cost":2,"labour_minutes":LABOUR})
}
pub fn valid(v: &Village) -> bool {
    if v.version == 3 {
        return v.restoration.is_empty();
    }
    if v.restoration.len() > 256 {
        return false;
    }
    let mut spent = vec![];
    for j in &v.restoration {
        if j.id.0 == 0
            || j.id.0 >= v.simulation.next_id
            || !matches!(j.size, 2 | 3)
            || !(1..MAP_SIZE - 1).contains(&j.x)
            || !(1..MAP_SIZE - 1).contains(&j.y)
            || j.building.is_some() && j.source.is_some()
            || !j.created.is_finite()
            || !(0.0..=v.minutes).contains(&j.created)
            || !j.work.is_finite()
            || !(0.0..=LABOUR).contains(&j.work)
            || j.finished
                .is_some_and(|t| !t.is_finite() || !(j.created..=v.minutes).contains(&t))
            || j.cancelled && j.finished.is_none()
            || (!j.cancelled && j.finished.is_some() && j.work != LABOUR)
            || (j.spent.is_none() && j.work != 0.)
            || (j.spent.is_some() && j.work <= 0.)
            || j.active() && (!anchored(v, j) || j.work >= LABOUR)
        {
            return false;
        }
        if let Some([a, b]) = j.spent {
            if a.checked_add(2) != Some(b)
                || v.simulation
                    .materials
                    .as_ref()
                    .is_none_or(|m| b > m.spent[COMPOST])
            {
                return false;
            }
            spent.push((a, b));
        }
        if j.active() {
            if !open(v, j)
                || v.logistics
                    .as_ref()
                    .is_none_or(|s| !s.stores.iter().any(|p| p.owner == Owner::Restoration(j.id)))
            {
                return false;
            }
            if j.building.is_none() && j.source.is_none() && j.size != 2 {
                return false;
            }
            for a in j.x - j.size / 2..j.x - j.size / 2 + j.size {
                for b in j.y - j.size / 2..j.y - j.size / 2 + j.size {
                    if v.buildings.iter().any(|p| {
                        Some(p.id) != j.building
                            && contains(interactions::footprint_size(&p.kind), p.x, p.y, a, b)
                    }) || v.economy.sources.iter().enumerate().any(|(i, p)| {
                        p.active
                            && Some(i) != j.source
                            && contains(resource_sites::size(p.material), p.x, p.y, a, b)
                    }) || river_bank(a, b)
                        || !(0..MAP_SIZE).contains(&a)
                        || !(0..MAP_SIZE).contains(&b)
                        || v.roads.contains(&(a, b))
                        || v.restoration
                            .iter()
                            .any(|other| other.id != j.id && other.active() && covers(other, a, b))
                    {
                        return false;
                    }
                }
            }
        }
    }
    if reserved_amount(v, COMPOST) > economy::quantity(v, COMPOST) {
        return false;
    }
    spent.sort_unstable();
    spent.windows(2).all(|p| p[0].1 <= p[1].0)
}
#[wasm_bindgen]
impl Game {
    pub fn restoration_report(&self) -> String {
        view(self.app.world().resource::<Village>()).to_string()
    }
    pub fn restoration_preview(&self, x: i32, y: i32) -> String {
        let v = self.app.world().resource::<Village>();
        match target(v,x,y) {Ok(j)=>serde_json::json!({"allowed":true,"x":j.x,"y":j.y,"size":j.size,"compost":2,"minutes":LABOUR,"ground":land::condition(v,j.size,j.x,j.y)}).to_string(),Err(reason)=>serde_json::json!({"allowed":false,"reason":reason}).to_string()}
    }
    pub fn restore_plot(&mut self, x: i32, y: i32) -> String {
        let mut v = self.app.world_mut().resource_mut::<Village>();
        match queue(&mut v, x, y) {
            Ok(_) => "ok".into(),
            Err(e) => e,
        }
    }
    pub fn cancel_restoration(&mut self, id: u32) -> String {
        {
            let mut v = self.app.world_mut().resource_mut::<Village>();
            if !cancel(&mut v, Id(id)) {
                return "Active soil work not found.".into();
            }
        }
        self.sync_restoration_activities();
        "ok".into()
    }
}
impl Game {
    pub(crate) fn sync_restoration_activities(&mut self) {
        let v = self.app.world().resource::<Village>().clone();
        for mut r in self
            .app
            .world_mut()
            .query::<&mut Resident>()
            .iter_mut(self.app.world_mut())
        {
            if r.task == "restore"
                && r.activity_material
                    .is_none_or(|id| job(&v, Id(id as u32)).is_none_or(|j| !j.active()))
            {
                assign(
                    &mut r,
                    &v,
                    "rest",
                    "The soil work has ended. Taking a break.",
                    false,
                );
            }
        }
    }
}

#[cfg(test)]
mod tests;
