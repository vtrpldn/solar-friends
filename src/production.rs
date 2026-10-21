//! Located preparation buffers and once-only production batches.
use crate::*;
use economy::{Bundle, COUNT};
use logistics::Owner;
use simulation::Id;

pub const BUFFER: u32 = 60;
const LABOUR: f32 = 10.;
pub const POWERED_SPEED: f32 = 2.;
pub const WORKSHOP_ENERGY_PER_HOUR: f64 = 1.2;
const PRODUCTS: [usize; 6] = [5, 6, 7, economy::TOOLS, 8, economy::MEALS];
pub fn task(material: usize) -> &'static str {
    if material == economy::MEALS {
        "cook"
    } else if material == economy::TOOLS {
        "craft"
    } else {
        "prepare"
    }
}
pub fn matches_task(material: usize, activity: &str) -> bool {
    task(material) == activity
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    AwaitingInputs,
    Hauling,
    Ready,
    Processing,
    AwaitingOutput,
    AwaitingWater,
    AwaitingPower,
    AwaitingService,
    Paused,
    Complete,
    Cancelled,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    Camp,
    Workshop,
    Kitchen,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Site {
    pub kind: Kind,
    pub id: Id,
    pub building: Option<usize>,
    pub x: f32,
    pub y: f32,
    pub paused: bool,
    #[serde(default)]
    pub powered: bool,
    #[serde(default)]
    pub energy_used: f64,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Batch {
    pub id: Id,
    pub site: Id,
    pub material: usize,
    pub inputs: Bundle,
    #[serde(default)]
    pub food_lots: Vec<freshness::Lot>,
    #[serde(default)]
    pub spoiled: bool,
    pub output: u32,
    pub work: f32,
    pub last_worker: Option<usize>,
    #[serde(default)]
    pub contributors: u8,
    pub committed: bool,
    pub biogas: bool,
    #[serde(default)]
    pub manual: bool,
    pub phase: Phase,
    pub created: f32,
    pub finished: Option<f32>,
}
impl Batch {
    pub fn active(&self) -> bool {
        !matches!(self.phase, Phase::Complete | Phase::Cancelled)
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct State {
    pub schema: u32,
    pub sites: Vec<Site>,
    pub batches: Vec<Batch>,
    pub targets: Bundle,
    pub accounting: Accounting,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Accounting {
    pub biogas_used: u64,
    pub retired_biogas: u64,
    pub inputs: [u64; COUNT],
    pub outputs: [u64; COUNT],
    pub retired_inputs: [u64; COUNT],
    pub retired_outputs: [u64; COUNT],
}
impl Default for State {
    fn default() -> Self {
        Self {
            schema: 1,
            sites: vec![],
            batches: vec![],
            targets: std::array::from_fn(|i| if i == economy::MEALS { 8 } else { 0 }),
            accounting: Accounting::default(),
        }
    }
}
pub fn site(v: &Village, id: Id) -> Option<&Site> {
    v.production.sites.iter().find(|s| s.id == id)
}
pub fn batch(v: &Village, id: Id) -> Option<&Batch> {
    v.production.batches.iter().find(|b| b.id == id)
}
pub fn building(v: &Village, id: Id) -> Option<usize> {
    site(v, id).and_then(|s| s.building)
}
pub fn closing(v: &Village, id: Id) -> bool {
    site(v, id).is_none_or(|s| {
        s.building.is_some_and(|id| {
            v.buildings.iter().all(|b| b.id != id) || building_work::job(v, id).is_some()
        })
    })
}
pub fn operational(v: &Village, id: Id) -> bool {
    site(v, id).is_some_and(|s| {
        !s.paused
            && !closing(v, id)
            && s.building
                .is_none_or(|id| v.buildings.iter().any(|b| b.id == id && b.progress >= 100.))
    })
}
fn recipe(material: usize, kind: Kind, eggs: bool, gas: bool) -> Option<(Bundle, u32)> {
    let workshop = kind == Kind::Workshop;
    if material != economy::MEALS && (eggs || gas || kind == Kind::Kitchen) {
        return None;
    }
    let mut inputs = [0; COUNT];
    let (items, output): (&[(usize, u32)], u32) = match material {
        economy::MEALS if kind == Kind::Kitchen && eggs => (
            &[(economy::FOOD, 2), (economy::EGGS, 2)],
            7 + u32::from(gas),
        ),
        economy::MEALS if kind == Kind::Kitchen => (&[(economy::FOOD, 3)], 5 + u32::from(gas)),
        5 => (&[(0, 2), (8, 1)], 1),
        6 => (&[(2, 2)], 2),
        7 if workshop => (&[(2, 2), (0, 1)], 2),
        economy::TOOLS if workshop => (&[(0, 8)], 12),
        8 if workshop => (&[(4, 1), (3, 1)], 2),
        8 => (&[(4, 2)], 1),
        _ => return None,
    };
    for &(i, n) in items {
        inputs[i] = n;
    }
    Some((inputs, output))
}
pub fn owner(v: &Village, id: Id) -> Owner {
    match site(v, id) {
        Some(s) if s.kind == Kind::Kitchen => Owner::Pantry(s.building.unwrap()),
        _ => Owner::Production(id),
    }
}
pub fn pantry_site(v: &Village, building: usize) -> Option<Id> {
    v.production
        .sites
        .iter()
        .find(|s| s.kind == Kind::Kitchen && s.building == Some(building))
        .map(|s| s.id)
}
pub fn held_biogas(v: &Village) -> u32 {
    v.production
        .batches
        .iter()
        .filter(|b| b.active() && b.committed && b.biogas)
        .count() as u32
}
fn free_biogas(v: &Village) -> f32 {
    v.circular.biogas
        - v.production
            .batches
            .iter()
            .filter(|b| b.active() && !b.committed && b.biogas)
            .count() as f32
}
fn choice(v: &Village, id: Id, material: usize) -> Option<(Bundle, u32, bool)> {
    let kind = site(v, id)?.kind;
    let eggs =
        material == economy::MEALS && v.supplies.use_eggs && economy::free(v, economy::EGGS) >= 2;
    let gas = material == economy::MEALS && v.circular.use_biogas && free_biogas(v) >= 1.;
    let (inputs, output) = recipe(material, kind, eggs, gas)?;
    Some((inputs, output, gas))
}
fn service_ready(v: &Village, b: &Batch) -> bool {
    b.material != economy::MEALS
        || (building(v, b.site)
            .is_some_and(|id| sanitation::washing_ready(v, water::Owner::Building(id), 1.))
            && (b.committed || !b.biogas || v.circular.biogas >= 1.))
}
/// Preparation and its input carriage inherit the project that still needs
/// this output. Ordinary stock targets keep their normal queue position.
pub fn project_priority(v: &Village, material: usize) -> Option<u32> {
    v.economy
        .projects
        .iter()
        .filter(|p| !p.paused)
        .filter_map(|p| {
            let b = v
                .buildings
                .iter()
                .find(|b| b.id == p.building && b.progress < 100.)?;
            let remaining: u32 = economy::recipe(&b.kind, &p.recipe)?
                .iter()
                .skip(p.stage + usize::from(p.committed))
                .map(|s| s.items[material])
                .sum();
            (remaining > economy::quantity(v, material)).then_some(p.priority)
        })
        .max()
}
pub fn power_blocker(v: &Village, id: Id) -> Option<&'static str> {
    let s = site(v, id)?;
    if s.kind == Kind::Workshop
        && s.building
            .is_some_and(|id| maintenance::servicing(v, maintenance::Equipment::Workshop(id)))
    {
        return Some(
            "The workshop is being serviced. Its saved batches resume after service or cancellation.",
        );
    }
    if !s.powered {
        return None;
    }
    if s.building
        .is_some_and(|id| maintenance::performance(v, maintenance::Equipment::Workshop(id)) <= 0.)
    {
        return Some(
            "Powered tools need service. Switch to hand tools or arrange spare parts and resident repair.",
        );
    }
    let owner = crate::electricity::Owner::Building(s.building?);
    if !power::workshop_connected(v, owner) {
        Some("Connect this workshop to a local circuit, or switch to hand tools.")
    } else if power::workshop_available(v, owner) <= 0.000001 {
        Some(
            "The workshop circuit has no available energy or cable capacity. Wait for generation or switch to hand tools.",
        )
    } else {
        None
    }
}
fn store(v: &Village, id: Id) -> Option<&logistics::Store> {
    v.logistics
        .as_ref()?
        .stores
        .iter()
        .find(|p| p.owner == owner(v, id))
}
fn pending(v: &Village, id: Id) -> Option<&Batch> {
    v.production
        .batches
        .iter()
        .find(|b| b.site == id && b.active())
}
pub fn needs(v: &Village, id: Id) -> Bundle {
    pending(v, id)
        .filter(|b| !b.committed)
        .map_or([0; COUNT], |b| b.inputs)
}
pub fn inbound(v: &Village, id: Id, i: usize) -> u32 {
    let Some(p) = store(v, id) else {
        return 0;
    };
    v.logistics
        .as_ref()
        .unwrap()
        .shipments
        .iter()
        .filter(|h| h.to == p.id && h.material == i)
        .map(|h| h.amount)
        .sum()
}
fn present(v: &Village, id: Id, i: usize) -> u32 {
    store(v, id).map_or(0, |p| {
        p.items[i]
            .saturating_sub(logistics::pickup_reserved(v, p.id, i) + food::held(v, p.id, i, None))
    })
}
pub fn held(v: &Village, owner: Owner, i: usize) -> u32 {
    if let Some(id) = match owner {
        Owner::Production(id) => Some(id),
        Owner::Pantry(b) => pantry_site(v, b),
        _ => None,
    } {
        needs(v, id)[i].min(present(v, id, i))
    } else {
        0
    }
}
pub fn unclaimed(v: &Village, i: usize) -> u32 {
    v.production
        .batches
        .iter()
        .filter(|b| b.active() && !b.committed)
        .map(|b| b.inputs[i].saturating_sub(present(v, b.site, i) + inbound(v, b.site, i)))
        .sum()
}
pub fn future(v: &Village, i: usize) -> u32 {
    v.production
        .batches
        .iter()
        .filter(|b| b.active() && b.material == i)
        .map(|b| b.output)
        .sum()
}
pub fn reserved_space(v: &Village) -> u32 {
    v.production
        .batches
        .iter()
        .filter(|b| b.active())
        .map(|b| {
            let inputs = b.inputs.iter().sum::<u32>();
            let outputs = b.output + u32::from(b.material == economy::MEALS);
            if b.committed {
                inputs.max(outputs)
            } else {
                outputs.saturating_sub(inputs)
            }
        })
        .sum()
}
pub fn input_demand(v: &Village, i: usize) -> u32 {
    v.production
        .batches
        .iter()
        .filter(|b| b.active() && !b.committed)
        .map(|b| b.inputs[i])
        .sum()
}
pub fn site_space(v: &Village, owner: Owner) -> u32 {
    if let Some(id) = match owner {
        Owner::Production(id) => Some(id),
        Owner::Pantry(b) => pantry_site(v, b),
        _ => None,
    } {
        pending(v, id).map_or(0, |b| {
            let inputs = b.inputs.iter().sum::<u32>();
            let outputs = b.output + u32::from(b.material == economy::MEALS);
            if b.committed {
                inputs.max(outputs)
            } else {
                // A pantry top-up must leave room for this pot's net output
                // before a resident starts cooking, including its scraps.
                outputs.saturating_sub(inputs)
            }
        })
    } else {
        0
    }
}
pub fn demand(v: &Village) -> Bundle {
    expanded_demand(v, None)
}
fn expanded_demand(v: &Village, ignore_queued: Option<usize>) -> Bundle {
    let mut gross = economy::gross_needs(v);
    let workshop = v
        .production
        .sites
        .iter()
        .any(|s| s.kind == Kind::Workshop && operational(v, s.id));
    let supplied = |i| {
        economy::quantity(v, i)
            + economy::incoming(v, i)
            + if ignore_queued == Some(i) {
                0
            } else {
                future(v, i)
            }
    };
    let mut need = [0; COUNT];
    // Prepared goods precede their fitting dependency; each owned or queued
    // input is credited once after all upstream requirements have been added.
    for i in PRODUCTS {
        need[i] = gross[i].saturating_sub(supplied(i));
        if let Some((inputs, output)) = recipe(
            i,
            if i == economy::MEALS {
                Kind::Kitchen
            } else if workshop {
                Kind::Workshop
            } else {
                Kind::Camp
            },
            false,
            false,
        ) {
            for j in 0..COUNT {
                gross[j] = gross[j].saturating_add(inputs[j] * need[i].div_ceil(output));
            }
        }
    }
    for i in (0..COUNT).filter(|i| !PRODUCTS.contains(i)) {
        need[i] = gross[i].saturating_sub(supplied(i));
    }
    need
}
pub fn sync(v: &mut Village) {
    if v.logistics.is_none() {
        return;
    }
    let mut wanted = vec![(None, crate::camp(v).0, crate::camp(v).1, Kind::Camp)];
    wanted.extend(
        v.buildings
            .iter()
            .filter(|b| matches!(b.kind.as_str(), "workshop" | "kitchen") && b.progress >= 100.)
            .map(|b| {
                (
                    Some(b.id),
                    b.x as f32,
                    b.y as f32,
                    if b.kind == "kitchen" {
                        Kind::Kitchen
                    } else {
                        Kind::Workshop
                    },
                )
            }),
    );
    for (building, x, y, kind) in wanted {
        if !v.production.sites.iter().any(|s| s.building == building)
            && v.simulation.next_id < u32::MAX - 1
        {
            let id = v.simulation.allocate().unwrap();
            if kind != Kind::Kitchen {
                assert!(logistics::create(v, Owner::Production(id), x, y, BUFFER).is_some());
            }
            v.production.sites.push(Site {
                kind,
                id,
                building,
                x,
                y,
                paused: false,
                powered: false,
                energy_used: 0.,
            });
        }
    }
    for s in &mut v.production.sites {
        if let Some(b) = s
            .building
            .and_then(|id| v.buildings.iter().find(|b| b.id == id))
        {
            (s.x, s.y) = (b.x as f32, b.y as f32);
        }
    }
    let cancel: Vec<_> = v
        .production
        .batches
        .iter()
        .filter(|b| b.active() && closing(v, b.site))
        .map(|b| b.id)
        .collect();
    for id in cancel {
        cancel_batch(v, id);
    }
    for b in v
        .production
        .batches
        .iter_mut()
        .filter(|b| b.active() && !b.committed && b.material == economy::MEALS)
    {
        let eggs = b.inputs[economy::EGGS] > 0 && v.supplies.use_eggs;
        b.biogas = b.biogas && v.circular.use_biogas;
        (b.inputs, b.output) = recipe(economy::MEALS, Kind::Kitchen, eggs, b.biogas).unwrap();
    }
    // Unstarted batches release their promises when demand disappears. Keep
    // committed work, and allow at most one final recipe-sized surplus.
    for _ in 0..3 {
        let mut cancel = vec![];
        for material in PRODUCTS {
            let committed: u32 = v
                .production
                .batches
                .iter()
                .filter(|b| b.active() && b.committed && b.material == material)
                .map(|b| b.output)
                .sum();
            let mut remaining =
                expanded_demand(v, Some(material))[material].saturating_sub(committed);
            for b in v
                .production
                .batches
                .iter()
                .filter(|b| b.active() && !b.committed && !b.manual && b.material == material)
            {
                if remaining == 0 {
                    cancel.push(b.id);
                } else {
                    remaining = remaining.saturating_sub(b.output);
                }
            }
        }
        if cancel.is_empty() {
            break;
        }
        for id in cancel {
            cancel_batch(v, id);
        }
    }
    let updates: Vec<_> = v
        .production
        .batches
        .iter()
        .filter(|b| b.active())
        .map(|b| {
            let phase = if !operational(v, b.site) {
                Phase::Paused
            } else if site(v, b.site).is_some_and(|s| {
                s.kind == Kind::Workshop
                    && s.building.is_some_and(|id| {
                        maintenance::servicing(v, maintenance::Equipment::Workshop(id))
                    })
            }) && b.work < LABOUR
                && (b.committed || inputs_ready(v, b))
            {
                Phase::AwaitingService
            } else if power_blocker(v, b.site).is_some()
                && b.work < LABOUR
                && (b.committed || inputs_ready(v, b))
            {
                Phase::AwaitingPower
            } else if !service_ready(v, b)
                && (b.committed || (0..COUNT).all(|i| present(v, b.site, i) >= b.inputs[i]))
            {
                Phase::AwaitingWater
            } else if b.committed {
                if b.work >= LABOUR {
                    Phase::AwaitingOutput
                } else {
                    Phase::Processing
                }
            } else if (0..COUNT).all(|i| present(v, b.site, i) >= b.inputs[i]) {
                Phase::Ready
            } else if (0..COUNT).any(|i| inbound(v, b.site, i) > 0) {
                Phase::Hauling
            } else {
                Phase::AwaitingInputs
            };
            (b.id, phase)
        })
        .collect();
    for (id, phase) in updates {
        v.production
            .batches
            .iter_mut()
            .find(|b| b.id == id)
            .unwrap()
            .phase = phase;
    }
    let finishing: Vec<_> = v
        .production
        .batches
        .iter()
        .filter(|b| {
            b.active()
                && b.committed
                && b.work >= LABOUR
                && operational(v, b.site)
                && service_ready(v, b)
        })
        .map(|b| b.id)
        .collect();
    for id in finishing {
        finish(v, id);
    }
}
pub fn dispatch(v: &mut Village) {
    if v.logistics.is_none() {
        return;
    }
    let mut sites: Vec<_> = v.production.sites.iter().map(|s| s.id).collect();
    sites.sort_by_key(|id| building(v, *id).is_none());
    for id in sites {
        if !operational(v, id) || pending(v, id).is_some() {
            continue;
        }
        let need = demand(v);
        for material in PRODUCTS {
            if need[material] > 0 && spawn(v, id, material, false).is_some() {
                break;
            }
        }
    }
}
fn can_spawn(v: &Village, id: Id, material: usize) -> bool {
    if !operational(v, id) || pending(v, id).is_some() {
        return false;
    }
    let Some((inputs, output, _)) = choice(v, id, material) else {
        return false;
    };
    if !(0..COUNT).all(|i| economy::free(v, i) >= inputs[i]) {
        return false;
    }
    let Some(p) = store(v, id) else {
        return false;
    };
    let existing: u32 = (0..COUNT).map(|i| inputs[i].min(present(v, id, i))).sum();
    let inputs_total = inputs.iter().sum::<u32>();
    let output = output + u32::from(material == economy::MEALS);
    economy::capacity(v).saturating_sub(economy::storage(v)) >= output.saturating_sub(inputs_total)
        && logistics::room(v, p.owner) + existing >= inputs_total.max(output)
}
fn spawn(v: &mut Village, id: Id, material: usize, manual: bool) -> Option<Id> {
    if !can_spawn(v, id, material) {
        return None;
    }
    let (inputs, output, biogas) = choice(v, id, material)?;
    let batch_id = v.simulation.allocate()?;
    let phase = if (0..COUNT).all(|i| present(v, id, i) >= inputs[i]) {
        Phase::Ready
    } else {
        Phase::AwaitingInputs
    };
    v.production.batches.push(Batch {
        id: batch_id,
        site: id,
        material,
        inputs,
        food_lots: vec![],
        spoiled: false,
        output,
        work: 0.,
        last_worker: None,
        contributors: 0,
        committed: false,
        biogas,
        manual,
        phase,
        created: v.minutes,
        finished: None,
    });
    v.logistics.as_mut()?.retry_after = [0.; 5];
    Some(batch_id)
}
pub fn can_order_tools(v: &Village) -> bool {
    v.production
        .batches
        .iter()
        .any(|b| b.active() && b.material == economy::TOOLS && operational(v, b.site))
        || (economy::quantity(v, economy::TOOLS)
            + future(v, economy::TOOLS)
            + economy::incoming(v, economy::TOOLS)
            <= 24
            && v.production
                .sites
                .iter()
                .any(|s| can_spawn(v, s.id, economy::TOOLS)))
}
// Read-only explanations share the queue's eligibility checks; dispatch keeps its allocation-free predicate.
fn spawn_blocker(v: &Village, id: Id, material: usize) -> Option<String> {
    if can_spawn(v, id, material) {
        return None;
    }
    if !operational(v, id) {
        return Some("Finish or resume this worksite first.".into());
    }
    if pending(v, id).is_some() {
        return Some("This worksite is finishing another saved batch.".into());
    }
    let (inputs, _, _) = choice(v, id, material)?;
    let missing: Vec<_> = (0..COUNT)
        .filter_map(|i| {
            let n = inputs[i].saturating_sub(economy::free(v, i));
            (n > 0).then(|| format!("{n} {}", economy::NAMES[i].replace('_', " ")))
        })
        .collect();
    if !missing.is_empty() {
        return Some(format!(
            "Still needed for one batch: {}. Supply these inputs locally or through Trade; neighbours then carry them here.",
            missing.join(" · ")
        ));
    }
    Some("Make room in this worksite and the village stores before starting another batch.".into())
}
pub fn tool_request_blocker(v: &Village) -> Option<String> {
    if can_order_tools(v) {
        return None;
    }
    let tools = economy::quantity(v, economy::TOOLS)
        + future(v, economy::TOOLS)
        + economy::incoming(v, economy::TOOLS);
    if tools > 24 {
        return Some(format!(
            "We already have {tools} tool uses stored, being made or ordered. Use some before requesting another batch."
        ));
    }
    let workshops: Vec<_> = v
        .production
        .sites
        .iter()
        .filter(|s| s.kind == Kind::Workshop)
        .collect();
    if workshops.is_empty() {
        return Some("Build and finish a workshop before crafting tools.".into());
    }
    let open: Vec<_> = workshops.iter().filter(|s| operational(v, s.id)).collect();
    if open.is_empty() {
        if workshops.iter().any(|s| {
            s.paused
                && !closing(v, s.id)
                && s.building
                    .is_some_and(|id| v.buildings.iter().any(|b| b.id == id && b.progress >= 100.))
        }) {
            return Some("Resume the workshop in Construction → Preparing materials before requesting tools.".into());
        }
        return Some(
            "Finish construction or crew work on a workshop before requesting tools.".into(),
        );
    }
    let Some(site) = open.iter().find(|s| pending(v, s.id).is_none()) else {
        return Some("Our open workshops are finishing other saved batches. Let one finish before requesting tools.".into());
    };
    spawn_blocker(v, site.id, economy::TOOLS)
}
pub fn order_tools(v: &mut Village, at: Option<usize>) -> Option<Id> {
    if let Some(b) = v.production.batches.iter().find(|b| {
        b.active()
            && b.material == economy::TOOLS
            && operational(v, b.site)
            && at.is_none_or(|id| building(v, b.site) == Some(id))
    }) {
        return Some(b.id);
    }
    if economy::quantity(v, economy::TOOLS)
        + future(v, economy::TOOLS)
        + economy::incoming(v, economy::TOOLS)
        > 24
    {
        return None;
    }
    let ids: Vec<_> = v
        .production
        .sites
        .iter()
        .filter(|s| at.is_none_or(|id| s.building == Some(id)))
        .map(|s| s.id)
        .collect();
    for id in ids {
        if let Some(b) = spawn(v, id, economy::TOOLS, true) {
            logistics::rebalance(v);
            return Some(b);
        }
    }
    None
}

pub fn can_order_meals(v: &Village) -> bool {
    v.production
        .batches
        .iter()
        .any(|b| b.active() && b.material == economy::MEALS && operational(v, b.site))
        || (economy::quantity(v, economy::MEALS)
            + future(v, economy::MEALS)
            + economy::incoming(v, economy::MEALS)
            <= 24
            && v.production
                .sites
                .iter()
                .any(|s| can_spawn(v, s.id, economy::MEALS)))
}
pub fn order_meals(v: &mut Village, at: Option<usize>) -> Option<Id> {
    if let Some(b) = v.production.batches.iter().find(|b| {
        b.active()
            && b.material == economy::MEALS
            && operational(v, b.site)
            && at.is_none_or(|id| building(v, b.site) == Some(id))
    }) {
        return Some(b.id);
    }
    if economy::quantity(v, economy::MEALS)
        + future(v, economy::MEALS)
        + economy::incoming(v, economy::MEALS)
        > 24
    {
        return None;
    }
    let ids: Vec<_> = v
        .production
        .sites
        .iter()
        .filter(|s| at.is_none_or(|id| s.building == Some(id)))
        .map(|s| s.id)
        .collect();
    for id in ids {
        if let Some(b) = spawn(v, id, economy::MEALS, true) {
            logistics::rebalance(v);
            return Some(b);
        }
    }
    None
}

pub fn inputs_ready(v: &Village, b: &Batch) -> bool {
    (0..COUNT).all(|i| present(v, b.site, i) >= b.inputs[i])
}
pub fn ready(v: &Village, b: &Batch) -> bool {
    b.active()
        && operational(v, b.site)
        && b.work < LABOUR
        && service_ready(v, b)
        && power_blocker(v, b.site).is_none()
        && (b.committed || (0..COUNT).all(|i| present(v, b.site, i) >= b.inputs[i]))
}
pub fn jobs(v: &Village) -> impl Iterator<Item = &Batch> {
    v.production.batches.iter().filter(|b| ready(v, b))
}
pub fn approach(v: &Village, id: Id, resident: usize) -> Option<(f32, f32)> {
    let s = site(v, batch(v, id)?.site)?;
    if let Some(id) = s.building {
        spacing::approach(v, v.buildings.iter().find(|b| b.id == id)?, resident)
    } else {
        spacing::material_spot(v, s.x, s.y, resident)
    }
}
pub fn assign_batch(r: &mut Resident, v: &Village, id: Id) -> bool {
    let Some(b) = batch(v, id).filter(|b| ready(v, b)) else {
        return false;
    };
    let Some((x, y)) = approach(v, id, r.id) else {
        return false;
    };
    r.task = task(b.material).into();
    r.activity_batch = Some(id);
    r.activity_material = Some(b.material);
    r.activity_building = matches!(b.material, economy::TOOLS | economy::MEALS)
        .then(|| building(v, b.site))
        .flatten();
    r.target_x = x;
    r.target_y = y;
    r.remaining = LABOUR - b.work;
    true
}
fn work_speed(v: &Village, s: &Site) -> f32 {
    let factor = s
        .building
        .filter(|_| s.kind == Kind::Workshop)
        .map_or(1., |id| {
            maintenance::performance(v, maintenance::Equipment::Workshop(id))
        }) as f32;
    if s.powered {
        POWERED_SPEED * factor
    } else {
        0.5 + 0.5 * factor
    }
}
pub fn work(v: &mut Village, r: &Resident, seconds: f32) -> bool {
    let Some(id) = r.activity_batch else {
        return false;
    };
    let Some(b) = batch(v, id).filter(|b| ready(v, b)).cloned() else {
        return false;
    };
    if !matches_task(b.material, &r.task)
        || (r.x - r.target_x).hypot(r.y - r.target_y) > 0.08
        || seconds <= 0.
        || !seconds.is_finite()
        || r.id >= 5
    {
        return false;
    }
    let s = site(v, b.site).unwrap();
    let radius = if s.building.is_some() { 3.0 } else { 3.6 };
    if (r.x - s.x).hypot(r.y - s.y) > radius || !navigation::exit_segment(v, [s.x, s.y], [r.x, r.y])
    {
        return false;
    }
    let equipment = s.building.filter(|_| s.kind == Kind::Workshop);
    let powered = s.powered;
    let skill = if b.material == economy::MEALS {
        skills::Skill::Cooking
    } else {
        skills::Skill::Craft
    };
    let speed = work_speed(v, s) * skills::factor(v, r.id, skill);
    let requested = seconds.min((LABOUR - b.work) / speed);
    let work = if powered {
        let owner = crate::electricity::Owner::Building(s.building.unwrap());
        let per_second = WORKSHOP_ENERGY_PER_HOUR * f64::from(MINUTES_PER_SECOND) / 60.;
        let delivered = power::spend_workshop(v, owner, f64::from(requested) * per_second);
        if delivered <= 0. {
            return false;
        }
        v.production
            .sites
            .iter_mut()
            .find(|s| s.id == b.site)
            .unwrap()
            .energy_used += delivered;
        (delivered / per_second) as f32 * speed
    } else {
        requested * speed
    }
    .min(LABOUR - b.work);
    if let Some(id) = equipment {
        maintenance::used(
            v,
            maintenance::Equipment::Workshop(id),
            f64::from(work / speed * MINUTES_PER_SECOND),
        );
    }
    if !b.committed {
        if b.biogas {
            v.circular.biogas -= 1.;
            v.production.accounting.biogas_used += 1;
        }
        let mut food_lots = vec![];
        for (i, &n) in b.inputs.iter().enumerate() {
            freshness::merge(
                &mut food_lots,
                logistics::take(v, Some(owner(v, b.site)), i, n),
            );
            v.production.accounting.inputs[i] += u64::from(n);
        }
        v.production
            .batches
            .iter_mut()
            .find(|b| b.id == id)
            .unwrap()
            .food_lots = food_lots;
        v.production
            .batches
            .iter_mut()
            .find(|b| b.id == id)
            .unwrap()
            .committed = true;
    }
    let b = v
        .production
        .batches
        .iter_mut()
        .find(|b| b.id == id)
        .unwrap();
    b.work = (b.work + work).min(LABOUR);
    if let Some(person) = b.last_worker {
        b.contributors |= 1 << person;
    }
    b.contributors |= 1 << r.id;
    b.last_worker = Some(r.id);
    b.phase = Phase::Processing;
    finish(v, id)
}
fn finish(v: &mut Village, id: Id) -> bool {
    let Some(b) = batch(v, id)
        .filter(|b| b.active() && b.committed && b.work >= LABOUR && service_ready(v, b))
        .cloned()
    else {
        return false;
    };
    if logistics::room(v, owner(v, b.site)) + site_space(v, owner(v, b.site))
        < b.output + u32::from(b.material == economy::MEALS)
    {
        v.production
            .batches
            .iter_mut()
            .find(|b| b.id == id)
            .unwrap()
            .phase = Phase::AwaitingOutput;
        return false;
    }
    let current = v
        .production
        .batches
        .iter_mut()
        .find(|b| b.id == id)
        .unwrap();
    current.phase = Phase::Complete;
    current.food_lots.clear();
    current.finished = Some(v.minutes);
    assert!(logistics::receive(
        v,
        owner(v, b.site),
        b.material,
        b.output
    ));
    v.production.accounting.outputs[b.material] += u64::from(b.output);
    let contributors = b.contributors | b.last_worker.map_or(0, |id| 1 << id);
    for person in 0..5 {
        if contributors & (1 << person) != 0 {
            skills::award(
                v,
                person,
                if b.material == economy::MEALS {
                    skills::Skill::Cooking
                } else {
                    skills::Skill::Craft
                },
                3,
            );
        }
    }
    if b.material == economy::MEALS {
        sanitation::household_at(v, water::Owner::Building(building(v, b.site).unwrap()), 1.);
        v.supplies.used += b.inputs[economy::FOOD] as f32;
        v.supplies.meals_cooked += b.output;
        assert!(logistics::receive(v, owner(v, b.site), economy::SCRAPS, 1));
        v.progress.egg_meal |= b.inputs[economy::EGGS] > 0;
        v.progress.biogas_meal |= b.biogas;
        situations::cooked(v, b.last_worker.unwrap());
    } else if b.material == economy::TOOLS {
        v.progress.tools_crafted = v.progress.tools_crafted.saturating_add(1);
    } else {
        v.progress.prepared_batches = v.progress.prepared_batches.saturating_add(1);
    }
    true
}
pub fn cancel_batch(v: &mut Village, id: Id) -> bool {
    let Some(b) = batch(v, id).filter(|b| b.active()).cloned() else {
        return false;
    };
    let current = v
        .production
        .batches
        .iter_mut()
        .find(|b| b.id == id)
        .unwrap();
    current.phase = Phase::Cancelled;
    current.food_lots.clear();
    current.committed = false;
    current.finished = Some(v.minutes);
    if b.committed {
        if b.biogas {
            v.circular.biogas += 1.;
            v.production.accounting.biogas_used -= 1;
        }
        for (i, &n) in b.inputs.iter().enumerate() {
            if freshness::lifetime(i).is_some() {
                let lots = b
                    .food_lots
                    .iter()
                    .filter(|l| l.material == i)
                    .cloned()
                    .collect();
                assert!(logistics::receive_preserved(v, owner(v, b.site), i, lots));
            } else {
                assert!(logistics::receive(v, owner(v, b.site), i, n));
            }
            v.production.accounting.inputs[i] -= u64::from(n);
        }
    }
    true
}
pub fn view(v: &Village) -> serde_json::Value {
    let wanted = demand(v);
    let recipes: Vec<_> = v.production.sites.iter().map(|s| {
        let variants: &[(bool, bool)] = if s.kind == Kind::Kitchen {
            &[(false, false), (true, false), (false, true), (true, true)]
        } else {
            &[(false, false)]
        };
        let recipes: Vec<_> = PRODUCTS.into_iter().flat_map(|i| {
            variants.iter().filter_map(move |&(eggs, gas)| {
                recipe(i, s.kind, eggs, gas).map(|(inputs, output)| serde_json::json!({
                    "material": i, "inputs": inputs, "output": output,
                    "fresh_water": u32::from(i == economy::MEALS), "biogas": gas
                }))
            })
        }).collect();
        let service_blocker = power_blocker(v, s.id).or_else(|| (s.kind == Kind::Kitchen).then(|| {
            s.building.and_then(|id| sanitation::washing_blocker(v,water::Owner::Building(id),1.))
        }).flatten());
        let idle_reason = (operational(v,s.id) && pending(v,s.id).is_none()).then(|| {
            if PRODUCTS.into_iter().any(|i|wanted[i]>0 && can_spawn(v,s.id,i)) { return None; }
            PRODUCTS.into_iter().find_map(|i| {
                (wanted[i]>0 && choice(v,s.id,i).is_some()).then(|| {
                    spawn_blocker(v,s.id,i).map(|reason|format!("To prepare {}: {reason}",economy::NAMES[i].replace('_'," ")))
                }).flatten()
            })
        }).flatten();
        serde_json::json!({"site":s.id,"recipes":recipes,"idle_reason":idle_reason,"reserved_space":site_space(v,owner(v,s.id)),"service_blocker":service_blocker,"work_speed":work_speed(v,s),"energy_per_hour":if s.powered{WORKSHOP_ENERGY_PER_HOUR}else{0.}})
    }).collect();
    serde_json::json!({"sites":v.production.sites,"batches":v.production.batches,"targets":v.production.targets,"accounting":v.production.accounting,
        "recipes":recipes,"buffer_capacity":BUFFER,"labour_minutes":LABOUR*MINUTES_PER_SECOND,"labour_seconds":LABOUR,"reserved_space":reserved_space(v),
        "note":"Preparation inputs and outputs belong to the worksite buffer; kitchen pots use their existing pantry. Hauling changes their location; work consumes staged inputs once and credits outputs once."})
}
pub fn finish_frame<'a>(v: &mut Village, residents: impl IntoIterator<Item = &'a Resident>) {
    let mut retained = std::collections::HashSet::new();
    let mut working = std::collections::HashSet::new();
    for r in residents {
        retained.extend(
            [r.activity_batch, r.help.as_ref().and_then(|q| q.batch)]
                .into_iter()
                .flatten(),
        );
        if matches!(r.task.as_str(), "prepare" | "craft" | "cook")
            && r.trip.is_none()
            && r.remaining > 0.
            && (r.x - r.target_x).hypot(r.y - r.target_y) <= 0.08
        {
            working.extend(r.activity_batch);
        }
    }
    let open: std::collections::HashSet<_> = v
        .production
        .sites
        .iter()
        .filter(|s| operational(v, s.id))
        .map(|s| s.id)
        .collect();
    let water_ready: Vec<_> = v
        .production
        .sites
        .iter()
        .filter(|s| {
            building(v, s.id)
                .is_some_and(|id| sanitation::washing_ready(v, water::Owner::Building(id), 1.))
        })
        .map(|s| s.id)
        .collect();
    let no_service: std::collections::HashSet<_> = v
        .production
        .sites
        .iter()
        .filter(|s| {
            s.kind == Kind::Workshop
                && s.building.is_some_and(|id| {
                    maintenance::servicing(v, maintenance::Equipment::Workshop(id))
                })
        })
        .map(|s| s.id)
        .collect();
    let no_power: std::collections::HashSet<_> = v
        .production
        .sites
        .iter()
        .filter(|s| power_blocker(v, s.id).is_some())
        .map(|s| s.id)
        .collect();
    for b in v
        .production
        .batches
        .iter_mut()
        .filter(|b| b.active() && b.committed && b.work < LABOUR)
    {
        b.phase = if no_service.contains(&b.site) {
            Phase::AwaitingService
        } else if no_power.contains(&b.site) {
            Phase::AwaitingPower
        } else if b.material == economy::MEALS && !water_ready.contains(&b.site) {
            Phase::AwaitingWater
        } else if open.contains(&b.site) && working.contains(&b.id) {
            Phase::Processing
        } else {
            Phase::Paused
        };
    }
    let recent: std::collections::HashSet<_> = v
        .production
        .batches
        .iter()
        .rev()
        .filter(|b| !b.active())
        .take(64)
        .map(|b| b.id)
        .collect();
    for b in v.production.batches.iter().filter(|b| {
        !b.active()
            && !retained.contains(&b.id)
            && !recent.contains(&b.id)
            && b.phase == Phase::Complete
    }) {
        v.production.accounting.retired_biogas += u64::from(b.biogas);
        for (i, &n) in b.inputs.iter().enumerate() {
            v.production.accounting.retired_inputs[i] += u64::from(n);
        }
        v.production.accounting.retired_outputs[b.material] += u64::from(b.output);
    }
    v.production
        .batches
        .retain(|b| b.active() || retained.contains(&b.id) || recent.contains(&b.id));
    let sites: std::collections::HashSet<_> = v.production.batches.iter().map(|b| b.site).collect();
    v.production.sites.retain(|s| {
        s.building
            .is_none_or(|id| v.buildings.iter().any(|b| b.id == id))
            || sites.contains(&s.id)
    });
}
pub fn valid(v: &Village) -> bool {
    let p = &v.production;
    if p.accounting
        .inputs
        .iter()
        .chain(&p.accounting.outputs)
        .chain(&p.accounting.retired_inputs)
        .chain(&p.accounting.retired_outputs)
        .any(|n| *n > 9_007_199_254_740_991)
        || p.schema != 1
        || p.sites.len() > 1024
        || p.batches.len() > 4096
        || p.targets
            .iter()
            .enumerate()
            .any(|(i, n)| *n > 30 || (*n > 0 && !PRODUCTS.contains(&i)))
    {
        return false;
    }
    let mut sites = std::collections::HashSet::new();
    let mut places = std::collections::HashSet::new();
    if p.sites.iter().any(|s| {
        !sites.insert(s.id)
            || !places.insert(s.building)
            || (s.kind == Kind::Camp) != s.building.is_none()
            || (s.kind != Kind::Workshop && (s.powered || s.energy_used != 0.))
            || !s.energy_used.is_finite()
            || !(0. ..=1e9).contains(&s.energy_used)
            || s.id.0 == 0
            || s.id.0 >= v.simulation.next_id
            || ![s.x, s.y]
                .iter()
                .all(|x| x.is_finite() && (0.0..=MAP_SIZE as f32).contains(x))
            || s.building.is_some_and(|id| id >= v.economy.next_building)
            || s.building
                .and_then(|id| v.buildings.iter().find(|b| b.id == id))
                .is_some_and(|b| match s.kind {
                    Kind::Workshop => {
                        b.kind != "workshop" || (s.x, s.y) != (b.x as f32, b.y as f32)
                    }
                    Kind::Kitchen => b.kind != "kitchen" || (s.x, s.y) != (b.x as f32, b.y as f32),
                    Kind::Camp => true,
                })
            || (!closing(v, s.id) && store(v, s.id).is_none())
            || s.building.is_none() && (s.x, s.y) != crate::camp(v)
    }) {
        return false;
    }
    if p.sites.iter().map(|s| s.energy_used).sum::<f64>()
        > v.power.network.account.consumed + 0.000001
    {
        return false;
    }
    let mut ids = std::collections::HashSet::new();
    let mut active = std::collections::HashSet::new();
    p.batches.iter().all(|b| {
        let Some(s) = site(v, b.site) else {
            return false;
        };
        let Some((inputs, output)) =
            recipe(b.material, s.kind, b.inputs[economy::EGGS] > 0, b.biogas)
        else {
            return false;
        };
        b.id.0 > 0
            && b.contributors <= 31
            && ids.insert(b.id)
            && b.id.0 < v.simulation.next_id
            && (!b.active() || active.insert(b.site))
            && (!b.manual || matches!(b.material, economy::TOOLS | economy::MEALS))
            && (!b.spoiled || (b.material == economy::MEALS && b.phase == Phase::Cancelled))
            && b.inputs == inputs
            && b.output == output
            && b.work.is_finite()
            && (0.0..=LABOUR).contains(&b.work)
            && match b.last_worker {
                Some(id) => id < 5 && b.work > 0.,
                None => b.work == 0.,
            }
            && b.created.is_finite()
            && (0.0..=v.minutes).contains(&b.created)
            && b.finished.is_some() == !b.active()
            && b.finished
                .is_none_or(|t| t.is_finite() && (b.created..=v.minutes).contains(&t))
            && match b.phase {
                Phase::AwaitingInputs | Phase::Hauling | Phase::Ready => {
                    !b.committed && b.work == 0.
                }
                Phase::AwaitingWater => {
                    b.material == economy::MEALS && (b.committed || b.work == 0.)
                }
                Phase::AwaitingService => {
                    s.kind == Kind::Workshop && b.work < LABOUR && (b.committed || b.work == 0.)
                }
                Phase::AwaitingPower => {
                    s.kind == Kind::Workshop
                        && s.powered
                        && b.work < LABOUR
                        && (b.committed || b.work == 0.)
                }
                Phase::Processing => b.committed && b.work < LABOUR,
                Phase::AwaitingOutput => b.committed && b.work == LABOUR,
                Phase::Complete => b.committed && b.work == LABOUR,
                Phase::Cancelled => !b.committed,
                Phase::Paused => b.committed || b.work == 0.,
            }
    }) && free_biogas(v) >= 0.
        && p.accounting.biogas_used <= 9_007_199_254_740_991
        && p.accounting.retired_biogas <= p.accounting.biogas_used
        && p.accounting.biogas_used
            == p.accounting.retired_biogas
                + p.batches.iter().filter(|b| b.committed && b.biogas).count() as u64
        && (0..COUNT).all(|i| {
            let inputs = u128::from(p.accounting.retired_inputs[i])
                + p.batches
                    .iter()
                    .filter(|b| b.committed)
                    .map(|b| u128::from(b.inputs[i]))
                    .sum::<u128>();
            let outputs = u128::from(p.accounting.retired_outputs[i])
                + p.batches
                    .iter()
                    .filter(|b| b.phase == Phase::Complete && b.material == i)
                    .map(|b| u128::from(b.output))
                    .sum::<u128>();
            inputs == u128::from(p.accounting.inputs[i])
                && outputs == u128::from(p.accounting.outputs[i])
        })
}

#[wasm_bindgen]
impl Game {
    pub fn set_workshop_powered(&mut self, id: u32, enabled: bool) -> String {
        {
            let mut v = self.app.world_mut().resource_mut::<Village>();
            let Some(s) = site(&v, Id(id)).filter(|s| s.kind == Kind::Workshop) else {
                return "Choose a workshop; camp preparation and cooking use manual tools.".into();
            };
            if enabled
                && (closing(&v, s.id)
                    || !power::workshop_connected(
                        &v,
                        crate::electricity::Owner::Building(s.building.unwrap()),
                    ))
            {
                return "Install a cable from a local generator or battery before using powered tools.".into();
            }
            v.production
                .sites
                .iter_mut()
                .find(|s| s.id == Id(id))
                .unwrap()
                .powered = enabled;
            economy::rebalance(&mut v);
        }
        self.sync_help();
        self.sync_production_activities();
        "ok".into()
    }
    pub fn production_report(&self) -> String {
        view(self.app.world().resource::<Village>()).to_string()
    }
    pub fn set_production_target(&mut self, material: usize, n: u32) -> String {
        if !PRODUCTS.contains(&material) || n > 30 {
            return "Choose a prepared material and a village reserve of 0–30 units.".into();
        }
        let mut v = self.app.world_mut().resource_mut::<Village>();
        v.production.targets[material] = n;
        economy::rebalance(&mut v);
        "ok".into()
    }
    pub fn set_production_paused(&mut self, id: u32, paused: bool) -> String {
        {
            let mut v = self.app.world_mut().resource_mut::<Village>();
            let Some(site) = v.production.sites.iter_mut().find(|s| s.id == Id(id)) else {
                return "Production worksite not found.".into();
            };
            site.paused = paused;
            economy::rebalance(&mut v);
        }
        self.sync_production_activities();
        "ok".into()
    }
    pub fn cancel_production_batch(&mut self, id: u32) -> String {
        {
            let mut v = self.app.world_mut().resource_mut::<Village>();
            let Some(b) = batch(&v, Id(id)).filter(|b| b.active()).cloned() else {
                return "Active production batch not found.".into();
            };
            cancel_batch(&mut v, b.id);
            v.production
                .sites
                .iter_mut()
                .find(|s| s.id == b.site)
                .unwrap()
                .paused = true;
            economy::rebalance(&mut v);
        }
        self.sync_help();
        self.sync_production_activities();
        "ok".into()
    }
}
impl Game {
    pub(crate) fn sync_production_activities(&mut self) {
        let v = self.app.world().resource::<Village>().clone();
        for mut r in self
            .app
            .world_mut()
            .query::<&mut Resident>()
            .iter_mut(self.app.world_mut())
        {
            if r.activity_batch
                .is_some_and(|id| batch(&v, id).is_none_or(|b| !ready(&v, b)))
            {
                assign(
                    &mut r,
                    &v,
                    "idle",
                    "The batch is waiting. Taking a break where there is room.",
                    false,
                );
                requests::observe(&mut r, &v);
            }
        }
    }
}

#[cfg(test)]
pub(crate) fn fixture_inputs(v: &mut Village, id: Id) {
    let b = batch(v, id).unwrap().clone();
    let owner = owner(v, b.site);
    let s = v.logistics.as_mut().unwrap();
    assert!(s.shipments.is_empty());
    let from = s
        .stores
        .iter()
        .position(|p| p.owner == Owner::Camp)
        .unwrap();
    let to = s.stores.iter().position(|p| p.owner == owner).unwrap();
    for (i, &n) in b.inputs.iter().enumerate() {
        assert!(s.stores[from].items[i] >= n);
        let lots = freshness::take(&mut s.stores[from].food_lots, i, n);
        freshness::merge(&mut s.stores[to].food_lots, lots);
        s.stores[from].items[i] -= n;
        s.stores[to].items[i] += n;
    }
    logistics::sync_totals(v);
    sync(v);
    logistics::rebalance(v);
}

#[cfg(test)]
#[path = "kitchen_tests.rs"]
mod kitchen_tests;

#[cfg(test)]
mod tests {
    use super::*;
    pub fn scene() -> Game {
        let mut g = Game::new();
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.progress.completed = [true; 4];
            v.progress.use_tools = false;
            v.arrived = true;
            v.minutes = 540.;
            crate::logistics::fixture_stock(&mut v, crate::economy::FOOD, (80.) as u32);
            crate::logistics::fixture_stock(&mut v, crate::economy::MEALS, 10);
            crate::water::fixture_fresh(&mut v, 40.);
        }
        assert_eq!(g.place("workshop", 6, 6), "ok");
        logistics::fixture_finish(&mut g.app.world_mut().resource_mut::<Village>(), 0);
        for mut r in g
            .app
            .world_mut()
            .query::<&mut Resident>()
            .iter_mut(g.app.world_mut())
        {
            r.task = "idle".into();
            r.activity_store = None;
            r.remaining = 0.;
            r.trip = None;
            r.hunger = 10.;
            r.social = 90.;
            r.energy = 90.;
            r.last_meal_slot = 0;
            r.x = CAMP.0 + (r.id as f32 - 2.) * 1.25;
            r.y = CAMP.1;
            r.target_x = r.x;
            r.target_y = r.y;
        }
        logistics::fixture_stock(&mut g.app.world_mut().resource_mut::<Village>(), 7, 0);
        assert_eq!(g.set_production_target(7, 2), "ok");
        g
    }
    fn worker(g: &mut Game) -> Resident {
        g.app
            .world_mut()
            .query::<&Resident>()
            .iter(g.app.world())
            .find(|r| r.id == 0)
            .unwrap()
            .clone()
    }
    fn checkpoint(g: &mut Game) {
        let s = g.snapshot();
        assert!(g.restore(&s));
        assert_eq!(g.snapshot(), s);
    }
    #[test]
    fn idle_reserve_explains_missing_inputs_without_reserving_or_spending_them() {
        let mut g = scene();
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.production.targets = [0; COUNT];
        v.production.targets[5] = 2;
        logistics::fixture_stock(&mut v, 5, 0);
        logistics::fixture_stock(&mut v, 0, 4);
        logistics::fixture_stock(&mut v, 8, 0);
        logistics::fixture_stock(&mut v, 4, 0);
        let before = serde_json::to_string(&*v).unwrap();
        let report = view(&v);
        let camp = report["recipes"]
            .as_array()
            .unwrap()
            .iter()
            .find(|r| {
                r["site"]
                    == v.production
                        .sites
                        .iter()
                        .find(|s| s.kind == Kind::Camp)
                        .unwrap()
                        .id
                        .0
            })
            .unwrap();
        assert!(camp["idle_reason"].as_str().unwrap().contains("1 fittings"));
        assert_eq!(serde_json::to_string(&*v).unwrap(), before);
        logistics::fixture_stock(&mut v, 8, 1);
        let camp_id = v
            .production
            .sites
            .iter()
            .find(|s| s.kind == Kind::Camp)
            .unwrap()
            .id;
        assert!(can_spawn(&v, camp_id, 5));
        let report = view(&v);
        assert!(
            report["recipes"]
                .as_array()
                .unwrap()
                .iter()
                .find(|r| r["site"] == camp_id.0)
                .unwrap()["idle_reason"]
                .is_null()
        );
    }
    #[test]
    fn tool_refusal_identifies_the_actual_shortage_or_stock_limit() {
        let mut g = scene();
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.production.targets = [0; COUNT];
        logistics::fixture_stock(&mut v, economy::TOOLS, 0);
        logistics::fixture_stock(&mut v, 0, 7);
        assert!(
            tool_request_blocker(&v)
                .unwrap()
                .contains("other saved batches")
        );
        let active: Vec<_> = v
            .production
            .batches
            .iter()
            .filter(|b| b.active())
            .map(|b| b.id)
            .collect();
        for id in active {
            assert!(cancel_batch(&mut v, id));
        }
        assert!(tool_request_blocker(&v).unwrap().contains("1 timber"));
        logistics::fixture_stock(&mut v, 0, 8);
        assert!(can_order_tools(&v));
        assert!(tool_request_blocker(&v).is_none());
        logistics::fixture_stock(&mut v, economy::TOOLS, 25);
        let before = serde_json::to_string(&*v).unwrap();
        assert!(tool_request_blocker(&v).unwrap().contains("25 tool uses"));
        assert_eq!(serde_json::to_string(&*v).unwrap(), before);
        logistics::fixture_stock(&mut v, economy::TOOLS, 0);
        for site in &mut v.production.sites {
            if site.kind == Kind::Workshop {
                site.paused = true;
            }
        }
        assert!(
            tool_request_blocker(&v)
                .unwrap()
                .starts_with("Resume the workshop")
        );
    }
    #[test]
    fn project_priority_reaches_preparation_offers_and_releases_them_when_paused() {
        let mut g = scene();
        assert_eq!(g.place("home", 13, 13), "ok");
        let id = {
            let v = g.app.world().resource::<Village>();
            v.production
                .batches
                .iter()
                .find(|b| b.material == 7 && b.active())
                .unwrap()
                .id
        };
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            fixture_inputs(&mut v, id);
        }
        let r = worker(&mut g);
        let score = |g: &Game| {
            workforce::offers(g.app.world().resource::<Village>(), &r)
                .into_iter()
                .find(|o| o.batch == Some(id))
                .expect("A real roof batch is ready for attendance")
                .score
        };
        let ordinary = score(&g);
        assert_eq!(g.configure_project(1, 3, false, "standard"), "ok");
        assert!(
            score(&g) > ordinary,
            "Prioritising housing must also prioritise its ready roof preparation"
        );
        assert_eq!(g.configure_project(1, 3, true, "standard"), "ok");
        assert_eq!(
            score(&g),
            ordinary,
            "Paused construction must not prioritise ordinary reserve production"
        );
    }
    #[test]
    fn work_requires_staged_inputs_and_attendance_and_credits_output_once_at_the_workshop() {
        let mut g = scene();
        let mut r = worker(&mut g);
        let mut v = g.app.world_mut().resource_mut::<Village>();
        let id = v
            .production
            .batches
            .iter()
            .find(|b| b.material == 7)
            .unwrap()
            .id;
        assert_eq!(batch(&v, id).unwrap().phase, Phase::AwaitingInputs);
        assert_eq!(simulation::view(&v)["materials"][0]["reserved"], 1);
        assert_eq!(simulation::view(&v)["materials"][2]["reserved"], 2);
        assert!(!assign_batch(&mut r, &v, id));
        fixture_inputs(&mut v, id);
        assert!(assign_batch(&mut r, &v, id));
        let before = v.wood;
        assert!(!work(&mut v, &r, 10.));
        assert_eq!(v.wood, before);
        (r.x, r.y) = (r.target_x, r.target_y);
        assert!(!work(&mut v, &r, 4.));
        assert_eq!(batch(&v, id).unwrap().work, 4.);
        assert_eq!(simulation::view(&v)["materials"][0]["reserved"], 0);
        assert_eq!(simulation::view(&v)["materials"][0]["processing"], 1);
        assert_eq!(simulation::view(&v)["production"], view(&v));
        assert_eq!(v.wood, before - 1.);
        assert_eq!(
            site_space(&v, Owner::Production(batch(&v, id).unwrap().site)),
            3
        );
        assert!(work(&mut v, &r, 6.));
        let site_id = batch(&v, id).unwrap().site;
        assert_eq!(store(&v, site_id).unwrap().items[7], 2);
        assert_eq!(
            v.logistics
                .as_ref()
                .unwrap()
                .stores
                .iter()
                .find(|p| p.owner == Owner::Camp)
                .unwrap()
                .items[7],
            0
        );
        assert!(!work(&mut v, &r, 10.));
        assert_eq!(store(&v, site_id).unwrap().items[7], 2);
        assert!(
            simulation::view(&v)["materials"]
                .as_array()
                .unwrap()
                .iter()
                .all(|m| m["difference"] == 0.)
        );
    }
    #[test]
    fn partial_work_survives_reload_rest_and_cancellation_with_exact_input_recovery() {
        let mut g = scene();
        let mut r = worker(&mut g);
        let id = {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            let id = v.production.batches[0].id;
            fixture_inputs(&mut v, id);
            assert!(assign_batch(&mut r, &v, id));
            (r.x, r.y) = (r.target_x, r.target_y);
            assert!(!work(&mut v, &r, 3.));
            id
        };
        checkpoint(&mut g);
        let before = g.app.world().resource::<Village>().wood;
        assert_eq!(g.cancel_production_batch(id.0), "ok");
        assert_eq!(g.app.world().resource::<Village>().wood, before + 1.);
        assert_ne!(g.cancel_production_batch(id.0), "ok");
        checkpoint(&mut g);
        assert!(
            serde_json::from_str::<serde_json::Value>(&g.simulation_report()).unwrap()["materials"]
                .as_array()
                .unwrap()
                .iter()
                .all(|m| m["difference"] == 0.)
        );
    }
    #[test]
    fn real_residents_haul_inputs_then_finish_a_bounded_batch_and_queries_are_read_only() {
        let mut g = scene();
        let mut delivered = false;
        let mut complete = false;
        for frame in 0..5000 {
            let v = g.app.world().resource::<Village>();
            delivered |= v.logistics.as_ref().unwrap().shipments.iter().any(|h| {
                h.carrying
                    && matches!(
                        v.logistics
                            .as_ref()
                            .unwrap()
                            .stores
                            .iter()
                            .find(|p| p.id == h.to)
                            .unwrap()
                            .owner,
                        Owner::Production(_)
                    )
            });
            complete |= v
                .production
                .batches
                .iter()
                .any(|b| b.material == 7 && b.phase == Phase::Complete);
            if frame % 20 == 0 {
                checkpoint(&mut g);
            }
            if complete {
                break;
            }
            g.tick(0.25);
        }
        assert!(
            delivered && complete,
            "delivered={delivered}, complete={complete}: {}",
            g.snapshot()
        );
        let before = g.snapshot();
        let report = g.production_report();
        assert_eq!(g.snapshot(), before);
        assert!(report.contains("complete"));
        for _ in 0..1500 {
            g.tick(0.25);
        }
        assert_eq!(
            g.app
                .world()
                .resource::<Village>()
                .production
                .batches
                .iter()
                .filter(|b| b.material == 7)
                .count(),
            1
        );
        checkpoint(&mut g);
    }
    #[test]
    fn invalid_targets_and_batch_references_are_atomic() {
        let mut g = scene();
        let before = g.snapshot();
        assert_ne!(g.set_production_target(0, 4), "ok");
        assert_ne!(g.set_production_target(7, 31), "ok");
        assert_eq!(g.snapshot(), before);
        let mut s: serde_json::Value = serde_json::from_str(&before).unwrap();
        s["village"]["production"]["batches"][0]["site"] = serde_json::json!(u32::MAX - 1);
        assert!(!g.restore(&s.to_string()));
        assert_eq!(g.snapshot(), before);
    }
    #[test]
    fn dependent_fitting_batches_are_credited_once_and_unstarted_work_releases_its_inputs() {
        let mut g = scene();
        assert_eq!(g.set_production_target(7, 0), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            logistics::fixture_stock(&mut v, 5, 0);
            logistics::fixture_stock(&mut v, 8, 0);
        }
        assert_eq!(g.set_production_target(5, 1), "ok");
        let v = g.app.world().resource::<Village>();
        let fitting: Vec<_> = v
            .production
            .batches
            .iter()
            .filter(|b| b.active() && b.material == 8)
            .collect();
        assert_eq!(fitting.len(), 1);
        assert_eq!(fitting[0].output, 2);
        assert_eq!(
            demand(v)[8],
            0,
            "Queued fittings already cover the frame dependency"
        );
        assert_eq!(g.set_production_target(5, 0), "ok");
        assert!(
            g.app
                .world()
                .resource::<Village>()
                .production
                .batches
                .iter()
                .all(|b| !b.active())
        );
        assert_eq!(
            g.app
                .world()
                .resource::<Village>()
                .production
                .accounting
                .inputs,
            [0; COUNT]
        );
        checkpoint(&mut g);
    }
    #[test]
    fn pausing_a_station_releases_its_worker_and_preserves_partial_labour() {
        let mut g = scene();
        let mut r = worker(&mut g);
        let (id, site_id) = {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            let id = v.production.batches[0].id;
            fixture_inputs(&mut v, id);
            assert!(assign_batch(&mut r, &v, id));
            (r.x, r.y) = (r.target_x, r.target_y);
            assert!(!work(&mut v, &r, 3.));
            (id, batch(&v, id).unwrap().site)
        };
        *g.app
            .world_mut()
            .query::<&mut Resident>()
            .iter_mut(g.app.world_mut())
            .find(|p| p.id == 0)
            .unwrap() = r;
        assert_eq!(g.set_production_paused(site_id.0, true), "ok");
        assert_ne!(worker(&mut g).task, "prepare");
        for _ in 0..80 {
            g.tick(0.25);
        }
        assert_eq!(
            batch(g.app.world().resource::<Village>(), id).unwrap().work,
            3.
        );
        checkpoint(&mut g);
        assert_eq!(g.set_production_paused(site_id.0, false), "ok");
        for _ in 0..3000 {
            if !batch(g.app.world().resource::<Village>(), id)
                .unwrap()
                .active()
            {
                break;
            }
            g.tick(0.25);
        }
        assert_eq!(
            batch(g.app.world().resource::<Village>(), id)
                .unwrap()
                .phase,
            Phase::Complete
        );
        assert_eq!(
            g.app
                .world()
                .resource::<Village>()
                .production
                .accounting
                .outputs[7],
            2
        );
        checkpoint(&mut g);
    }
    #[test]
    fn moving_a_workshop_refunds_and_evacuates_contents_before_packing() {
        let mut g = scene();
        let mut r = worker(&mut g);
        let id = {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            let id = v.production.batches[0].id;
            fixture_inputs(&mut v, id);
            assert!(assign_batch(&mut r, &v, id));
            (r.x, r.y) = (r.target_x, r.target_y);
            assert!(!work(&mut v, &r, 2.));
            id
        };
        assert_eq!(g.queue_building_work(0, "move", 16, 6), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            assert_eq!(batch(&v, id).unwrap().phase, Phase::Cancelled);
            assert!(logistics::occupied_building(&v, 0));
            assert!(!building_work::work(&mut v, 0, 1000.));
            assert_eq!(v.buildings[0].x, 6);
        }
        checkpoint(&mut g);
        assert!(g.request(0, "building_work", false).contains("Happy"));
        assert_eq!(
            worker(&mut g).task,
            "haul",
            "The requested crew member helps evacuate this workshop's buffer"
        );
        for frame in 0..7000 {
            if g.app.world().resource::<Village>().building_jobs.is_empty() {
                break;
            }
            g.tick(0.25);
            if frame % 40 == 0 {
                checkpoint(&mut g);
            }
        }
        let v = g.app.world().resource::<Village>();
        assert!(v.building_jobs.is_empty());
        assert_eq!(v.buildings[0].x, 16);
        assert!(
            v.production
                .sites
                .iter()
                .find(|s| s.building == Some(0))
                .is_some_and(|s| s.x == 16.)
        );
        assert!(
            simulation::view(v)["materials"]
                .as_array()
                .unwrap()
                .iter()
                .all(|m| m["difference"] == 0.)
        );
        checkpoint(&mut g);
    }
    #[test]
    fn a_preparation_request_brings_its_own_inputs_and_finishes_the_same_batch_after_rest() {
        let mut g = scene();
        for id in 1..5 {
            assert!(g.set_resident_job(id, true));
        }
        let batch_id = g.app.world().resource::<Village>().production.batches[0].id;
        assert!(g.request(0, "prepare", false).contains("Happy"));
        assert_eq!(worker(&mut g).help.unwrap().batch, Some(batch_id));
        assert_eq!(worker(&mut g).task, "haul");
        for _ in 0..3000 {
            g.tick(0.25);
            if batch(g.app.world().resource::<Village>(), batch_id)
                .unwrap()
                .work
                > 1.
            {
                break;
            }
        }
        let progress = batch(g.app.world().resource::<Village>(), batch_id)
            .unwrap()
            .work;
        assert!(progress > 1. && progress < 10.);
        g.app
            .world_mut()
            .query::<&mut Resident>()
            .iter_mut(g.app.world_mut())
            .find(|r| r.id == 0)
            .unwrap()
            .energy = 20.;
        g.tick(0.25);
        assert_eq!(worker(&mut g).task, "rest");
        checkpoint(&mut g);
        for _ in 0..10000 {
            if worker(&mut g).help.as_ref().unwrap().phase == requests::Phase::Complete {
                break;
            }
            g.tick(0.25);
        }
        assert_eq!(
            worker(&mut g).help.unwrap().phase,
            requests::Phase::Complete
        );
        assert_eq!(
            batch(g.app.world().resource::<Village>(), batch_id)
                .unwrap()
                .phase,
            Phase::Complete
        );
        assert_eq!(
            g.app
                .world()
                .resource::<Village>()
                .production
                .accounting
                .outputs[7],
            2
        );
        checkpoint(&mut g);
    }
    #[test]
    fn a_forged_commit_cannot_skip_spending_inputs() {
        let mut g = scene();
        let before = g.snapshot();
        let mut bad: serde_json::Value = serde_json::from_str(&before).unwrap();
        let b = &mut bad["village"]["production"]["batches"][0];
        b["committed"] = true.into();
        b["work"] = 1.into();
        b["phase"] = "processing".into();
        assert!(!g.restore(&bad.to_string()));
        assert_eq!(g.snapshot(), before);
    }
    #[test]
    fn a_full_output_pile_stops_the_next_batch_without_spending_inputs() {
        let mut g = scene();
        let site_id = g.app.world().resource::<Village>().production.batches[0].site;
        assert_eq!(g.set_production_target(7, 0), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            logistics::fixture_stock(&mut v, 5, 60);
            let s = v.logistics.as_mut().unwrap();
            let camp = s
                .stores
                .iter()
                .position(|s| s.owner == Owner::Camp)
                .unwrap();
            let pile = s
                .stores
                .iter()
                .position(|s| s.owner == Owner::Production(site_id))
                .unwrap();
            s.stores[camp].items[5] -= 60;
            s.stores[pile].items[5] += 60;
            logistics::sync_totals(&mut v);
        }
        let wood = g.app.world().resource::<Village>().wood;
        assert_eq!(g.set_production_target(7, 2), "ok");
        assert!(
            g.app
                .world()
                .resource::<Village>()
                .production
                .batches
                .iter()
                .all(|b| !b.active())
        );
        assert_eq!(g.app.world().resource::<Village>().wood, wood);
        checkpoint(&mut g);
        for _ in 0..2500 {
            let v = g.app.world().resource::<Village>();
            assert!(
                v.logistics
                    .as_ref()
                    .unwrap()
                    .stores
                    .iter()
                    .all(|p| p.items.iter().sum::<u32>() + site_space(v, p.owner) <= p.capacity)
            );
            if v.production.accounting.outputs[7] > 0 {
                break;
            }
            g.tick(0.25);
        }
        assert_eq!(
            g.app
                .world()
                .resource::<Village>()
                .production
                .accounting
                .outputs[7],
            2
        );
        checkpoint(&mut g);
    }
    #[test]
    fn several_stations_cannot_promise_the_same_last_inputs() {
        let mut g = scene();
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            logistics::fixture_stock(&mut v, 0, 2);
            logistics::fixture_stock(&mut v, 2, 4);
        }
        for (x, y) in [(15, 6), (20, 6)] {
            assert_eq!(g.place("workshop", x, y), "ok");
            let id = g
                .app
                .world()
                .resource::<Village>()
                .buildings
                .last()
                .unwrap()
                .id;
            logistics::fixture_finish(&mut g.app.world_mut().resource_mut::<Village>(), id);
            assert_eq!(g.set_production_target(7, 6), "ok");
        }
        let v = g.app.world().resource::<Village>();
        assert_eq!(
            v.production
                .batches
                .iter()
                .filter(|b| b.active() && b.material == 7)
                .count(),
            2
        );
        assert_eq!(input_demand(v, 0), 2);
        assert_eq!(input_demand(v, 2), 4);
        assert_eq!(economy::free(v, 0), 0);
        assert_eq!(economy::free(v, 2), 0);
        checkpoint(&mut g);
    }
    fn tool_scene() -> Game {
        let mut g = scene();
        assert_eq!(g.set_production_target(7, 0), "ok");
        g
    }
    #[test]
    fn tools_use_staged_inputs_and_output_space_through_checkpoint_and_cancellation() {
        let mut g = tool_scene();
        assert!(g.request(0, "craft", false).contains("Happy"));
        let id = worker(&mut g).help.unwrap().batch.unwrap();
        let mut r = worker(&mut g);
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            let before = economy::quantity(&v, 0);
            fixture_inputs(&mut v, id);
            assert!(assign_batch(&mut r, &v, id));
            assert!(!work(&mut v, &r, 4.));
            assert_eq!(economy::quantity(&v, 0), before);
            (r.x, r.y) = (r.target_x, r.target_y);
            assert!(!work(&mut v, &r, 4.));
            assert_eq!(economy::quantity(&v, 0), before - 8);
            assert_eq!(reserved_space(&v), 12);
            assert_eq!(v.progress.tool_uses, 0);
        }
        checkpoint(&mut g);
        let mut cancelled = Game::new();
        assert!(cancelled.restore(&g.snapshot()));
        let timber = cancelled.app.world().resource::<Village>().wood;
        assert_eq!(cancelled.cancel_production_batch(id.0), "ok");
        assert_eq!(
            cancelled.app.world().resource::<Village>().wood,
            timber + 8.
        );
        assert_ne!(cancelled.cancel_production_batch(id.0), "ok");
        checkpoint(&mut cancelled);
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            assert!(work(&mut v, &r, 6.));
            assert_eq!(economy::quantity(&v, economy::TOOLS), 12);
            assert_eq!(
                store(&v, batch(&v, id).unwrap().site).unwrap().items[economy::TOOLS],
                12
            );
            assert_eq!(v.production.accounting.outputs[economy::TOOLS], 12);
            assert_eq!(v.progress.tools_crafted, 1);
            assert!(!work(&mut v, &r, 10.));
        }
        checkpoint(&mut g);
    }
    #[test]
    fn tools_must_reach_the_actual_worksite_and_each_use_is_spent_once() {
        let mut g = tool_scene();
        assert_eq!(g.place("garden", 12, 10), "ok");
        let mut v = g.app.world_mut().resource_mut::<Village>();
        let id = v.buildings.last().unwrap().id;
        logistics::fixture_stock(&mut v, economy::TOOLS, 2);
        v.progress.use_tools = true;
        assert_eq!(logistics::site_tools(&v, id), 0);
        assert!(!progression::use_tool(&mut v, id));
        assert_eq!(v.progress.tool_uses, 2);
        logistics::fixture_stage(&mut v, id);
        assert_eq!(logistics::site_tools(&v, id), 1);
        assert!(progression::use_tool(&mut v, id));
        assert!(!progression::use_tool(&mut v, id));
        assert_eq!(v.progress.tool_uses, 1);
        assert_eq!(
            v.simulation.materials.as_ref().unwrap().spent[economy::TOOLS],
            1
        );
        assert!(
            economy::can_build(&v, id),
            "Optional tools cannot block ordinary construction"
        );
        assert!(economy::build(&mut v, id, 1000.));
        assert_eq!(v.progress.tool_uses, 1);
    }
    #[test]
    fn expanding_tool_output_reserves_room_before_inputs_are_spent() {
        let mut g = tool_scene();
        assert_eq!(g.place("workshop", 15, 5), "ok");
        let mut v = g.app.world_mut().resource_mut::<Village>();
        logistics::fixture_finish(&mut v, 1);
        economy::rebalance(&mut v);
        let room = economy::capacity(&v) - economy::storage(&v);
        economy::add(&mut v, 2, room);
        let timber = economy::quantity(&v, 0);
        assert!(order_tools(&mut v, Some(0)).is_none());
        assert_eq!(economy::quantity(&v, 0), timber);
        economy::remove(&mut v, 2, 4);
        let id = order_tools(&mut v, Some(0)).unwrap();
        assert_eq!(reserved_space(&v), 4);
        assert_eq!(economy::storage(&v), economy::capacity(&v));
        assert!(
            order_tools(&mut v, Some(1)).is_none(),
            "A second station cannot overbook output room"
        );
        assert!(cancel_batch(&mut v, id));
        assert_eq!(economy::capacity(&v) - economy::storage(&v), 4);
        assert!(order_tools(&mut v, Some(1)).is_some());
    }
    #[test]
    fn a_workshop_visit_binds_its_requested_batch_to_the_selected_building() {
        let mut g = tool_scene();
        assert_eq!(g.place("workshop", 15, 5), "ok");
        logistics::fixture_finish(&mut g.app.world_mut().resource_mut::<Village>(), 1);
        assert!(g.visit_building(0, 1).contains("Happy"));
        let q = worker(&mut g).help.unwrap();
        assert_eq!(q.building, Some(1));
        assert_eq!(q.material, Some(economy::TOOLS));
        assert_eq!(
            building(
                g.app.world().resource::<Village>(),
                batch(g.app.world().resource::<Village>(), q.batch.unwrap())
                    .unwrap()
                    .site
            ),
            Some(1)
        );
        let before = g.snapshot();
        assert!(
            g.visit_building(0, 0)
                .contains("already helping at workshop 2")
        );
        assert_eq!(g.snapshot(), before);
        assert!(g.visit_building(0, 1).contains("already accepted"));
        assert_eq!(g.snapshot(), before);
        checkpoint(&mut g);
    }
    #[test]
    fn a_forged_tool_summary_cannot_add_distant_tools() {
        let mut g = tool_scene();
        let before = g.snapshot();
        let mut forged: serde_json::Value = serde_json::from_str(&before).unwrap();
        forged["village"]["progress"]["tool_uses"] = 12.into();
        assert!(!g.restore(&forged.to_string()));
        assert_eq!(g.snapshot(), before);
    }
}

#[cfg(test)]
#[path = "production_power_tests.rs"]
mod power_tests;
