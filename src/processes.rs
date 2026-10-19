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
            assert!(organics::recover(v, &b));
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
        if before.kind == Kind::Curing && !organics::cured(v, before.x, before.y) {
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
                // The cured pile was received at the batch location before completion.
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
                    && organics::available(v, logistics::Owner::Pantry(building), economy::SCRAPS)
                        >= 2
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
                    logistics::spend(
                        v,
                        Some(logistics::Owner::Pantry(building)),
                        economy::SCRAPS,
                        2,
                    );
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
            && (!b.active()
                || b.kind != Kind::Digestion
                || b.building.is_some_and(|id| {
                    v.logistics.as_ref().is_some_and(|s| {
                        s.stores
                            .iter()
                            .any(|p| p.owner == logistics::Owner::Pantry(id))
                    })
                }))
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
fn reason(v: &Village, b: &Batch) -> &'static str {
    if !b.active() {
        if b.phase == Phase::Cancelled {
            "Unprocessed inputs recovered once."
        } else {
            "Output credited once."
        }
    } else if !open(v, b) {
        "Paused. Contents stay held at this process."
    } else if b.phase == Phase::AwaitingOutput {
        "Waiting for output space."
    } else if b.kind == Kind::Banana {
        if v.circular.waste > 0. {
            "Treating sealed waste through the planted bed; no food or water outlet."
        } else {
            "Waiting for sealed toilet waste."
        }
    } else {
        match b.kind {
            Kind::Digestion => "Digesting without a resident standing here.",
            Kind::Filtration => "Filtering without a resident standing here.",
            Kind::Curing => "Curing in a sealed store without resident attendance.",
            Kind::Banana => unreachable!(),
        }
    }
}
fn station_reason(v: &Village, kind: Kind, id: usize) -> &'static str {
    if building_work::job(v, id).is_some() {
        return "Closed while residents change this building. Its batch stays sealed.";
    }
    if v.processes.paused.contains(&id) {
        return "Station paused. Its contents stay held here.";
    }
    if let Some(b) = v
        .processes
        .batches
        .iter()
        .find(|b| b.active() && b.building == Some(id))
    {
        return reason(v, b);
    }
    match kind {
        Kind::Digestion if !v.circular.auto_feed => "Automatic digestion is paused.",
        Kind::Digestion
            if v.circular.biogas + production::held_biogas(v) as f32 + held_gas(v) + 4. > 12. =>
        {
            "Make room for four cooking gas. Kitchens use stored gas before another batch can start."
        }
        Kind::Digestion
            if v.circular.waste < 2.
                || organics::available(v, logistics::Owner::Pantry(id), economy::SCRAPS) < 2 =>
        {
            "Waiting for two sealed waste and two scraps delivered to this digester."
        }
        Kind::Digestion => "Ready to digest when time resumes.",
        Kind::Filtration if !v.circular.filter_water => "Automatic filtration is paused.",
        Kind::Filtration if v.circular.reclaimed + held_irrigation(v) + 8. > 60. => {
            "Make room for eight irrigation water. Gardens use reclaimed water first."
        }
        Kind::Filtration if v.circular.greywater < 12. => "Waiting for twelve greywater.",
        Kind::Filtration => "Ready to filter when time resumes.",
        Kind::Banana if !v.circular.banana_treatment => "Automatic banana treatment is paused.",
        Kind::Banana => "Waiting for sealed toilet waste.",
        _ => "Curing in a sealed store.",
    }
}
pub fn view(v: &Village) -> serde_json::Value {
    let definitions = serde_json::json!([
        {"kind":Kind::Digestion,"name":"Biodigester","duration":480,"inputs":"2 sealed waste · 2 kitchen scraps","outputs":"4 cooking gas · 2 digestate for curing"},
        {"kind":Kind::Filtration,"name":"Reed bed","duration":360,"inputs":"12 greywater","outputs":"8 irrigation water"},
        {"kind":Kind::Curing,"name":"Digestate curing","duration":1440,"inputs":"2 sealed digestate","outputs":"2 compost"},
        {"kind":Kind::Banana,"name":"Banana treatment bed","duration":0,"inputs":"Up to 6 sealed waste per day","outputs":"No food or water outlet"}
    ]);
    let rows:Vec<_>=v.processes.batches.iter().map(|b|serde_json::json!({"batch":b,"reason":reason(v,b),"duration":b.kind.duration(),"labour":0})).collect();
    let stations:Vec<_>=v.buildings.iter().filter_map(|b|{
        let kind=match b.kind.as_str(){"biodigester"=>Kind::Digestion,"wetland"=>Kind::Filtration,"banana_treatment"=>Kind::Banana,_=>return None};
        (b.progress>=100.||building_work::job(v,b.id).is_some()).then(||serde_json::json!({"building":b.id,"kind":kind,"x":b.x,"y":b.y,"paused":v.processes.paused.contains(&b.id),"closed":building_work::job(v,b.id).is_some(),"reason":station_reason(v,kind,b.id)}))
    }).collect();
    let mut growing:Vec<_>=v.buildings.iter().filter(|b|ecology::farm(b)&&b.crop.planted).map(|b|{
        let duration=ecology::duration(&b.crop);
        let soil=crate::land::condition(v,crate::interactions::footprint_size(&b.kind),b.x,b.y);
        let growth=crate::land::growth(&soil);
        serde_json::json!({"building":b.id,"soil":soil,"growth_multiplier":growth,"yield_multiplier":crate::land::yield_factor(&soil),"health":(soil.fertility/0.6).min(1.)*(1.-(soil.shade-0.4).max(0.)*0.5),"name":format!("{} {}",if b.kind=="greenhouse"{"Greenhouse"}else{"Garden"},b.id+1),"x":b.x,"y":b.y,"progress":b.crop.growth/duration*100.,"duration":duration,"remaining":(duration-b.crop.growth)/growth,"reason":if b.progress<100.{"Paused while residents change this building."}else if b.crop.growth>=duration{"Ready for a resident to harvest."}else if b.crop.moisture<=0.{"Dry. Growth waits for irrigation or suitable rain."}else{"Growing while the soil is moist; no worker attendance needed."}})
    }).collect();
    growing.extend(v.economy.sources.iter().filter(|s|s.active&&s.material<2&&s.planted).map(|s|{
        let soil=crate::land::condition(v,crate::resource_sites::size(s.material),s.x,s.y);
        let growth=crate::land::growth(&soil);
        let duration=if s.material==0{5760.}else{2880.}/if s.restored{1.25}else{1.}/growth;
        serde_json::json!({"soil":soil,"growth_multiplier":growth,"name":if s.material==0{"Timber trees"}else{"Bamboo"},"x":s.x,"y":s.y,"progress":s.growth*100.,"duration":duration,"remaining":(1.-s.growth)*duration,"reason":if s.growth>=1.{"Mature. A resident can harvest a batch."}else if s.moisture<=0.{"Dry. Growth waits for irrigation or rain."}else{"Growing while the soil is moist; no worker attendance needed."}})
    }));
    serde_json::json!({"batches":rows,"stations":stations,"definitions":definitions,"growing":growing,"paused":v.processes.paused,"held_waste":held_waste(v),"held_greywater":held_greywater(v),"reserved_gas":held_gas(v),"reserved_irrigation":held_irrigation(v),"note":"Each building owns its passive process. Detached sealed digestate stores keep curing after a building moves or closes."})
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
