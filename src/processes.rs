//! Owned passive batches. Shared fluid stores become connected services in Stage 5.
use crate::*;
use simulation::Id;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    Digestion,
    Filtration,
    Curing,
    Banana,
}
impl Kind {
    fn building(self) -> Option<&'static str> {
        match self {
            Self::Digestion => Some("biodigester"),
            Self::Filtration => Some("wetland"),
            Self::Banana => Some("banana_treatment"),
            Self::Curing => None,
        }
    }
    fn duration(self) -> f32 {
        match self {
            Self::Digestion => 480.,
            Self::Filtration => 360.,
            Self::Curing => 1440.,
            Self::Banana => 0.,
        }
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Processing,
    Paused,
    AwaitingOutput,
    Complete,
    Cancelled,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Batch {
    pub id: Id,
    pub kind: Kind,
    pub building: Option<usize>,
    pub x: i32,
    pub y: i32,
    pub created: f32,
    pub finished: Option<f32>,
    pub remaining: f32,
    pub phase: Phase,
    pub treated: f32,
}
impl Batch {
    pub fn active(&self) -> bool {
        matches!(
            self.phase,
            Phase::Processing | Phase::Paused | Phase::AwaitingOutput
        )
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct State {
    pub schema: u32,
    pub batches: Vec<Batch>,
    pub paused: Vec<usize>,
}
impl Default for State {
    fn default() -> Self {
        Self {
            schema: 1,
            batches: vec![],
            paused: vec![],
        }
    }
}
fn open(v: &Village, b: &Batch) -> bool {
    b.building.is_none_or(|id| {
        v.buildings.iter().any(|p| p.id == id && p.progress >= 100.)
            && building_work::job(v, id).is_none()
            && !v.processes.paused.contains(&id)
    }) && match b.kind {
        Kind::Digestion => v.circular.auto_feed,
        Kind::Filtration => v.circular.filter_water,
        Kind::Banana => v.circular.banana_treatment,
        Kind::Curing => true,
    }
}
pub fn held(v: &Village, kind: Kind) -> u32 {
    v.processes
        .batches
        .iter()
        .filter(|b| b.active() && b.kind == kind)
        .count() as u32
}
pub fn held_waste(v: &Village) -> f32 {
    held(v, Kind::Digestion) as f32 * 2.
}
pub fn held_greywater(v: &Village) -> f32 {
    held(v, Kind::Filtration) as f32 * 12.
}
pub fn held_gas(v: &Village) -> f32 {
    held(v, Kind::Digestion) as f32 * 4.
}
pub fn held_irrigation(v: &Village) -> f32 {
    held(v, Kind::Filtration) as f32 * 8.
}
fn spawn(
    v: &mut Village,
    kind: Kind,
    building: Option<usize>,
    x: i32,
    y: i32,
    remaining: f32,
) -> bool {
    if v.processes.batches.iter().filter(|b| b.active()).count() >= 256 {
        return false;
    }
    let Some(id) = v.simulation.allocate() else {
        return false;
    };
    v.processes.batches.push(Batch {
        id,
        kind,
        building,
        x,
        y,
        created: v.minutes,
        finished: None,
        remaining,
        phase: Phase::Processing,
        treated: 0.,
    });
    true
}
pub fn summaries(v: &mut Village) {
    let next = |kind| {
        v.processes
            .batches
            .iter()
            .filter(|b| b.active() && b.kind == kind)
            .map(|b| b.remaining)
            .reduce(f32::min)
            .unwrap_or(0.)
    };
    v.circular.digestion = next(Kind::Digestion);
    v.circular.filtration = next(Kind::Filtration);
    v.circular.curing = next(Kind::Curing);
    v.circular.pending_compost = held(v, Kind::Curing) * 2;
}
/// Explicit authored version-3 fixtures can stage an already committed process.
pub fn initialise(v: &mut Village) -> bool {
    v.processes = State::default();
    for (kind, remaining) in [
        (Kind::Digestion, v.circular.digestion),
        (Kind::Filtration, v.circular.filtration),
        (Kind::Curing, v.circular.curing),
    ] {
        if remaining <= 0. {
            continue;
        }
        let building = kind.building().and_then(|kind| {
            v.buildings
                .iter()
                .find(|b| b.kind == kind && b.progress >= 100.)
                .map(|b| (b.id, b.x, b.y))
        });
        if kind != Kind::Curing && building.is_none() {
            return false;
        }
        let (id, x, y) = building.map_or((None, CAMP.0 as i32, CAMP.1 as i32), |(id, x, y)| {
            (Some(id), x, y)
        });
        if !spawn(v, kind, id, x, y, remaining) {
            return false;
        }
    }
    summaries(v);
    true
}
pub fn cancel(v: &mut Village, id: Id) -> bool {
    let Some(b) = v
        .processes
        .batches
        .iter()
        .find(|b| b.id == id && b.active() && b.kind != Kind::Curing)
        .cloned()
    else {
        return false;
    };
    let batch = v.processes.batches.iter_mut().find(|p| p.id == id).unwrap();
    batch.phase = Phase::Cancelled;
    batch.finished = Some(v.minutes);
    match b.kind {
        Kind::Digestion => {
            v.circular.waste += 2.;
            v.progress.scraps = v.progress.scraps.saturating_add(2);
        }
        Kind::Filtration => v.circular.greywater += 12.,
        _ => {}
    }
    summaries(v);
    true
}
pub fn close(v: &mut Village, building: usize) {
    let ids: Vec<_> = v
        .processes
        .batches
        .iter()
        .filter(|b| b.active() && b.building == Some(building))
        .map(|b| b.id)
        .collect();
    for id in ids {
        cancel(v, id);
    }
    v.processes.paused.retain(|id| *id != building);
}
pub fn advance(v: &mut Village, minutes: f32) {
    let lost: Vec<_> = v
        .processes
        .batches
        .iter()
        .filter(|b| {
            b.active()
                && b.building
                    .is_some_and(|id| !v.buildings.iter().any(|p| p.id == id))
        })
        .map(|b| b.id)
        .collect();
    for id in lost {
        cancel(v, id);
    }
    let active: Vec<_> = v
        .processes
        .batches
        .iter()
        .filter(|b| b.active())
        .map(|b| b.id)
        .collect();
    for &id in &active {
        let before = v
            .processes
            .batches
            .iter()
            .find(|b| b.id == id)
            .unwrap()
            .clone();
        let running = open(v, &before);
        let b = v.processes.batches.iter_mut().find(|b| b.id == id).unwrap();
        if let Some(p) = b
            .building
            .and_then(|id| v.buildings.iter().find(|p| p.id == id))
        {
            b.x = p.x;
            b.y = p.y;
        }
        b.phase = if running {
            Phase::Processing
        } else {
            Phase::Paused
        };
        if !running {
            continue;
        }
        if before.kind == Kind::Banana {
            continue;
        }
        b.remaining = (b.remaining - minutes).max(0.);
        if b.remaining > 0. {
            continue;
        }
        let space = match before.kind {
            Kind::Digestion => {
                v.circular.biogas + production::held_biogas(v) as f32 + held_gas(v) <= 12.
            }
            Kind::Filtration => v.circular.reclaimed + held_irrigation(v) <= 60.,
            _ => true,
        };
        if !space {
            v.processes
                .batches
                .iter_mut()
                .find(|b| b.id == id)
                .unwrap()
                .phase = Phase::AwaitingOutput;
            continue;
        }
        // Allocate the detached sealed curing store before crediting gas.
        if before.kind == Kind::Digestion
            && !spawn(v, Kind::Curing, None, before.x, before.y, 1440.)
        {
            v.processes
                .batches
                .iter_mut()
                .find(|b| b.id == id)
                .unwrap()
                .phase = Phase::AwaitingOutput;
            continue;
        }
        let b = v.processes.batches.iter_mut().find(|b| b.id == id).unwrap();
        b.phase = Phase::Complete;
        b.finished = Some(v.minutes);
        match before.kind {
            Kind::Digestion => {
                v.circular.biogas += 4.;
                v.circular.batches = v.circular.batches.saturating_add(1);
                event(
                    v,
                    "A biodigester finished its sealed batch. Four cooking gas are ready; its digestate needs a full day to cure.",
                );
            }
            Kind::Filtration => {
                v.circular.reclaimed += 8.;
                v.circular.water_reused += 8.;
            }
            Kind::Curing => {
                v.progress.compost = v.progress.compost.saturating_add(2);
                v.progress.digestate_cured = true;
                event(
                    v,
                    "A sealed digestate store finished curing. Two compost are ready for the soil.",
                );
            }
            _ => {}
        }
    }
    // Each operating building owns its own duration and output reservation.
    let buildings: Vec<_> = v
        .buildings
        .iter()
        .filter(|p| p.progress >= 100. && building_work::job(v, p.id).is_none())
        .map(|p| (p.id, p.kind.clone(), p.x, p.y))
        .collect();
    for (building, name, x, y) in buildings {
        if active.iter().any(|id| {
            v.processes
                .batches
                .iter()
                .any(|b| b.id == *id && b.building == Some(building))
        }) {
            continue;
        }
        let kind = match name.as_str() {
            "biodigester" => Kind::Digestion,
            "wetland" => Kind::Filtration,
            "banana_treatment" => Kind::Banana,
            _ => continue,
        };
        if v.processes
            .batches
            .iter()
            .any(|b| b.active() && b.building == Some(building))
            || v.processes.paused.contains(&building)
        {
            continue;
        }
        let ready = match kind {
            Kind::Digestion => {
                v.circular.auto_feed
                    && v.circular.waste >= 2.
                    && v.progress.scraps >= 2
                    && v.circular.biogas + production::held_biogas(v) as f32 + held_gas(v) + 4.
                        <= 12.
            }
            Kind::Filtration => {
                v.circular.filter_water
                    && v.circular.greywater >= 12.
                    && v.circular.reclaimed + held_irrigation(v) + 8. <= 60.
            }
            Kind::Banana => v.circular.banana_treatment,
            _ => false,
        };
        if ready && spawn(v, kind, Some(building), x, y, kind.duration()) {
            match kind {
                Kind::Digestion => {
                    v.circular.waste -= 2.;
                    v.progress.scraps -= 2;
                }
                Kind::Filtration => v.circular.greywater -= 12.,
                _ => {}
            }
        }
    }
    // Digesters commit their sealed feed before planted beds draw the remainder.
    let banana_ids: Vec<_> = v
        .processes
        .batches
        .iter()
        .filter(|b| b.active() && b.kind == Kind::Banana && open(v, b))
        .map(|b| b.id)
        .collect();
    for id in banana_ids {
        let amount = (minutes / 240.).min(v.circular.waste);
        v.circular.waste -= amount;
        v.circular.waste_treated += amount;
        v.processes
            .batches
            .iter_mut()
            .find(|b| b.id == id)
            .unwrap()
            .treated += amount;
    }
    // Keep recent terminal records; active sealed stores are never discarded.
    let mut finished = 0;
    v.processes.batches.reverse();
    v.processes.batches.retain(|b| {
        if b.active() {
            true
        } else {
            finished += 1;
            finished <= 64
        }
    });
    v.processes.batches.reverse();
    summaries(v);
}
pub fn valid(v: &Village) -> bool {
    let p = &v.processes;
    if p.schema != 1 || p.batches.len() > 320 || p.paused.len() > 256 {
        return false;
    }
    if v.version == 3 {
        return p.batches.is_empty() && p.paused.is_empty();
    }
    let mut ids = std::collections::HashSet::new();
    let mut owners = std::collections::HashSet::new();
    if p.paused.iter().any(|id| {
        !ids.insert(*id)
            || !v.buildings.iter().any(|b| {
                b.id == *id
                    && matches!(
                        b.kind.as_str(),
                        "biodigester" | "wetland" | "banana_treatment"
                    )
            })
    }) {
        return false;
    }
    let good = p.batches.iter().all(|b| {
        b.id.0 > 0
            && b.id.0 < v.simulation.next_id
            && b.created.is_finite()
            && (0.0..=v.minutes).contains(&b.created)
            && b.finished.is_some() == !b.active()
            && b.finished
                .is_none_or(|t| t.is_finite() && (b.created..=v.minutes).contains(&t))
            && b.remaining.is_finite()
            && (0.0..=b.kind.duration()).contains(&b.remaining)
            && (b.phase != Phase::Complete || b.remaining == 0.)
            && (b.kind != Kind::Curing || b.phase != Phase::Cancelled)
            && (b.kind != Kind::Banana || b.phase != Phase::Complete)
            && b.treated.is_finite()
            && b.treated >= 0.
            && b.treated <= 1e9
            && (b.kind == Kind::Banana || b.treated == 0.)
            && (1..=MAP_SIZE - 2).contains(&b.x)
            && (1..=MAP_SIZE - 2).contains(&b.y)
            && if b.kind == Kind::Curing {
                b.building.is_none()
            } else {
                b.building.is_some()
                    && (!b.active()
                        || b.building.is_some_and(|id| {
                            owners.insert(id)
                                && v.buildings.iter().any(|p| {
                                    p.id == id && Some(p.kind.as_str()) == b.kind.building()
                                })
                        }))
            }
    });
    let next = |kind| {
        p.batches
            .iter()
            .filter(|b| b.active() && b.kind == kind)
            .map(|b| b.remaining)
            .reduce(f32::min)
            .unwrap_or(0.)
    };
    good && v.circular.digestion == next(Kind::Digestion)
        && v.circular.filtration == next(Kind::Filtration)
        && v.circular.curing == next(Kind::Curing)
        && v.circular.pending_compost == held(v, Kind::Curing) * 2
        && v.circular.waste + held_waste(v) <= 80.
        && v.circular.greywater + held_greywater(v) <= 120.
        && v.circular.biogas + production::held_biogas(v) as f32 + held_gas(v) <= 12.
        && v.circular.reclaimed + held_irrigation(v) <= 60.
}
pub fn view(v: &Village) -> serde_json::Value {
    let rows:Vec<_>=v.processes.batches.iter().map(|b|{
        let reason=if !b.active(){if b.phase==Phase::Cancelled{"Unprocessed inputs recovered once."}else{"Output credited once."}}else if !open(v,b){"Paused. Contents stay held at this process."}else if b.phase==Phase::AwaitingOutput{"Waiting for output space."}else if b.kind==Kind::Banana{"Treating sealed waste through the planted bed; no food or water outlet."}else{"Processing without a resident standing here."};
        serde_json::json!({"batch":b,"reason":reason,"duration":b.kind.duration(),"labour":0,"rate_per_day":if b.kind==Kind::Banana{Some(6)}else{None}})
    }).collect();
    serde_json::json!({"batches":rows,"paused":v.processes.paused,"held_waste":held_waste(v),"held_greywater":held_greywater(v),"reserved_gas":held_gas(v),"reserved_irrigation":held_irrigation(v),"note":"Each building owns its passive process. Detached sealed digestate stores keep curing after a building moves or closes."})
}
#[wasm_bindgen]
impl Game {
    pub fn set_process_paused(&mut self, building: usize, paused: bool) -> String {
        let mut v = self.app.world_mut().resource_mut::<Village>();
        if !v.buildings.iter().any(|b| {
            b.id == building
                && matches!(
                    b.kind.as_str(),
                    "biodigester" | "wetland" | "banana_treatment"
                )
        }) {
            return "Choose a biodigester, reed bed or banana treatment bed.".into();
        }
        if paused && !v.processes.paused.contains(&building) {
            v.processes.paused.push(building);
        } else if !paused {
            v.processes.paused.retain(|id| *id != building);
        }
        "ok".into()
    }
    pub fn cancel_passive_batch(&mut self, id: u32) -> String {
        let mut v = self.app.world_mut().resource_mut::<Village>();
        let b = v
            .processes
            .batches
            .iter()
            .find(|b| b.id == Id(id) && b.active())
            .cloned();
        let Some(b) = b else {
            return "That process has already finished or was cancelled.".into();
        };
        if b.kind == Kind::Curing {
            return "This sealed digestate store keeps curing until compost is ready.".into();
        }
        if !cancel(&mut v, Id(id)) {
            return "That process cannot be cancelled.".into();
        }
        if let Some(owner) = b.building
            && !v.processes.paused.contains(&owner)
        {
            v.processes.paused.push(owner);
        }
        "ok".into()
    }
}

#[cfg(test)]
#[path = "processes_tests.rs"]
mod tests;
