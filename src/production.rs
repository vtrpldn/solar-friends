//! Located preparation buffers and once-only production batches.
use crate::*;
use economy::{Bundle, COUNT};
use logistics::Owner;
use simulation::Id;

pub const BUFFER: u32 = 60;
const LABOUR: f32 = 10.;
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    AwaitingInputs,
    Hauling,
    Ready,
    Processing,
    AwaitingOutput,
    Paused,
    Complete,
    Cancelled,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Site {
    pub id: Id,
    pub building: Option<usize>,
    pub x: f32,
    pub y: f32,
    pub paused: bool,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Batch {
    pub id: Id,
    pub site: Id,
    pub material: usize,
    pub inputs: Bundle,
    pub output: u32,
    pub work: f32,
    pub committed: bool,
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
pub struct Accounting {
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
            targets: [0; COUNT],
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
fn recipe(material: usize, workshop: bool) -> Option<(Bundle, u32)> {
    let mut inputs = [0; COUNT];
    let (items, output): (&[(usize, u32)], u32) = match material {
        5 => (&[(0, 2), (8, 1)], 1),
        6 => (&[(2, 2)], 2),
        7 if workshop => (&[(2, 2), (0, 1)], 2),
        8 if workshop => (&[(4, 1), (3, 1)], 2),
        8 => (&[(4, 2)], 1),
        _ => return None,
    };
    for &(i, n) in items {
        inputs[i] = n;
    }
    Some((inputs, output))
}
fn store(v: &Village, id: Id) -> Option<&logistics::Store> {
    v.logistics
        .as_ref()?
        .stores
        .iter()
        .find(|p| p.owner == Owner::Production(id))
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
        p.items[i].saturating_sub(logistics::pickup_reserved(v, p.id, i))
    })
}
pub fn held(v: &Village, owner: Owner, i: usize) -> u32 {
    if let Owner::Production(id) = owner {
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
        .filter(|b| b.active() && b.committed)
        .map(|b| b.inputs.iter().sum::<u32>().max(b.output))
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
    if let Owner::Production(id) = owner {
        pending(v, id)
            .filter(|b| b.committed)
            .map_or(0, |b| b.inputs.iter().sum::<u32>().max(b.output))
    } else {
        0
    }
}
pub fn demand(v: &Village) -> Bundle {
    let mut need = economy::shortage(v);
    let workshop = v
        .production
        .sites
        .iter()
        .any(|s| s.building.is_some() && operational(v, s.id));
    for i in [5, 6, 7, 8] {
        if let Some((inputs, output)) = recipe(i, workshop) {
            for j in 0..COUNT {
                need[j] +=
                    (inputs[j] * need[i].div_ceil(output)).saturating_sub(economy::free(v, j));
            }
        }
    }
    need
}
pub fn sync(v: &mut Village) {
    if v.logistics.is_none() {
        return;
    }
    let mut wanted = vec![(None, CAMP.0, CAMP.1)];
    wanted.extend(
        v.buildings
            .iter()
            .filter(|b| b.kind == "workshop" && b.progress >= 100.)
            .map(|b| (Some(b.id), b.x as f32, b.y as f32)),
    );
    for (building, x, y) in wanted {
        if !v.production.sites.iter().any(|s| s.building == building)
            && v.simulation.next_id < u32::MAX - 1
        {
            let id = v.simulation.allocate().unwrap();
            assert!(logistics::create(v, Owner::Production(id), x, y, BUFFER).is_some());
            v.production.sites.push(Site {
                id,
                building,
                x,
                y,
                paused: false,
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
    let updates: Vec<_> = v
        .production
        .batches
        .iter()
        .filter(|b| b.active())
        .map(|b| {
            let phase = if !operational(v, b.site) || !work_time(v.minutes) {
                Phase::Paused
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
        .filter(|b| b.active() && b.committed && b.work >= LABOUR && operational(v, b.site))
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
    let sites: Vec<_> = v.production.sites.iter().map(|s| s.id).collect();
    for id in sites {
        if !operational(v, id) || pending(v, id).is_some() {
            continue;
        }
        let need = demand(v);
        for material in [5, 6, 7, 8] {
            let Some((inputs, output)) = recipe(material, building(v, id).is_some()) else {
                continue;
            };
            if need[material] == 0 || !(0..COUNT).all(|i| economy::free(v, i) >= inputs[i]) {
                continue;
            }
            let Some(p) = store(v, id) else {
                continue;
            };
            let existing: u32 = (0..COUNT).map(|i| inputs[i].min(present(v, id, i))).sum();
            let footprint = inputs.iter().sum::<u32>().max(output);
            if logistics::room(v, p.owner) + existing < footprint {
                continue;
            }
            let Some(batch_id) = v.simulation.allocate() else {
                return;
            };
            v.production.batches.push(Batch {
                id: batch_id,
                site: id,
                material,
                inputs,
                output,
                work: 0.,
                committed: false,
                phase: Phase::AwaitingInputs,
                created: v.minutes,
                finished: None,
            });
            break;
        }
    }
}
pub fn ready(v: &Village, b: &Batch) -> bool {
    b.active()
        && operational(v, b.site)
        && b.work < LABOUR
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
    r.task = "prepare".into();
    r.activity_batch = Some(id);
    r.activity_material = Some(b.material);
    r.activity_building = None;
    r.target_x = x;
    r.target_y = y;
    r.remaining = LABOUR - b.work;
    true
}
pub fn work(v: &mut Village, r: &Resident, seconds: f32) -> bool {
    let Some(id) = r.activity_batch else {
        return false;
    };
    let Some(b) = batch(v, id).filter(|b| ready(v, b)).cloned() else {
        return false;
    };
    if !work_time(v.minutes)
        || r.task != "prepare"
        || (r.x - r.target_x).hypot(r.y - r.target_y) > 0.08
        || seconds <= 0.
        || !seconds.is_finite()
    {
        return false;
    }
    let s = site(v, b.site).unwrap();
    let radius = if s.building.is_some() { 3.0 } else { 3.6 };
    if (r.x - s.x).hypot(r.y - s.y) > radius || !navigation::exit_segment(v, [s.x, s.y], [r.x, r.y])
    {
        return false;
    }
    if !b.committed {
        for (i, &n) in b.inputs.iter().enumerate() {
            logistics::spend(v, Some(Owner::Production(b.site)), i, n);
            v.production.accounting.inputs[i] += u64::from(n);
        }
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
    b.work = (b.work + seconds).min(LABOUR);
    b.phase = Phase::Processing;
    finish(v, id)
}
fn finish(v: &mut Village, id: Id) -> bool {
    let Some(b) = batch(v, id)
        .filter(|b| b.active() && b.committed && b.work >= LABOUR)
        .cloned()
    else {
        return false;
    };
    if logistics::room(v, Owner::Production(b.site)) + site_space(v, Owner::Production(b.site))
        < b.output
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
    current.finished = Some(v.minutes);
    assert!(logistics::receive(
        v,
        Owner::Production(b.site),
        b.material,
        b.output
    ));
    v.production.accounting.outputs[b.material] += u64::from(b.output);
    v.progress.prepared_batches = v.progress.prepared_batches.saturating_add(1);
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
    current.committed = false;
    current.finished = Some(v.minutes);
    if b.committed {
        for (i, &n) in b.inputs.iter().enumerate() {
            assert!(logistics::receive(v, Owner::Production(b.site), i, n));
            v.production.accounting.inputs[i] -= u64::from(n);
        }
    }
    true
}
pub fn view(v: &Village) -> serde_json::Value {
    serde_json::json!({"sites":v.production.sites,"batches":v.production.batches,"targets":v.production.targets,"accounting":v.production.accounting,
        "buffer_capacity":BUFFER,"labour_seconds":LABOUR,"reserved_space":reserved_space(v),
        "note":"Preparation inputs and outputs belong to the worksite buffer. Hauling changes their location; work consumes staged inputs once and credits outputs once."})
}
pub fn prune<'a>(v: &mut Village, residents: impl IntoIterator<Item = &'a Resident>) {
    let retained: std::collections::HashSet<_> = residents
        .into_iter()
        .flat_map(|r| [r.activity_batch, r.help.as_ref().and_then(|q| q.batch)])
        .flatten()
        .collect();
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
            .any(|(i, n)| *n > 30 || (*n > 0 && !(5..=8).contains(&i)))
    {
        return false;
    }
    let mut sites = std::collections::HashSet::new();
    let mut places = std::collections::HashSet::new();
    if p.sites.iter().any(|s| {
        !sites.insert(s.id)
            || !places.insert(s.building)
            || s.id.0 == 0
            || s.id.0 >= v.simulation.next_id
            || ![s.x, s.y]
                .iter()
                .all(|x| x.is_finite() && (0.0..=MAP_SIZE as f32).contains(x))
            || s.building.is_some_and(|id| id >= v.economy.next_building)
            || s.building
                .and_then(|id| v.buildings.iter().find(|b| b.id == id))
                .is_some_and(|b| b.kind != "workshop")
            || (!closing(v, s.id) && store(v, s.id).is_none())
            || s.building.is_none() && (s.x, s.y) != CAMP
    }) {
        return false;
    }
    let mut ids = std::collections::HashSet::new();
    let mut active = std::collections::HashSet::new();
    p.batches.iter().all(|b| {
        let Some(s) = site(v, b.site) else {
            return false;
        };
        let Some((inputs, output)) = recipe(b.material, s.building.is_some()) else {
            return false;
        };
        b.id.0 > 0
            && ids.insert(b.id)
            && b.id.0 < v.simulation.next_id
            && (!b.active() || active.insert(b.site))
            && b.inputs == inputs
            && b.output == output
            && b.work.is_finite()
            && (0.0..=LABOUR).contains(&b.work)
            && b.created.is_finite()
            && (0.0..=v.minutes).contains(&b.created)
            && b.finished.is_some() == !b.active()
            && b.finished
                .is_none_or(|t| t.is_finite() && (b.created..=v.minutes).contains(&t))
            && match b.phase {
                Phase::AwaitingInputs | Phase::Hauling | Phase::Ready => {
                    !b.committed && b.work == 0.
                }
                Phase::Processing => b.committed && b.work < LABOUR,
                Phase::AwaitingOutput => b.committed && b.work == LABOUR,
                Phase::Complete => b.committed && b.work == LABOUR,
                Phase::Cancelled => !b.committed,
                Phase::Paused => b.committed || b.work == 0.,
            }
    }) && (0..COUNT).all(|i| {
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
    pub fn production_report(&self) -> String {
        view(self.app.world().resource::<Village>()).to_string()
    }
    pub fn set_production_target(&mut self, material: usize, n: u32) -> String {
        if !(5..=8).contains(&material) || n > 30 {
            return "Choose a prepared material and a village reserve of 0–30 units.".into();
        }
        let mut v = self.app.world_mut().resource_mut::<Village>();
        v.production.targets[material] = n;
        economy::rebalance(&mut v);
        "ok".into()
    }
    pub fn set_production_paused(&mut self, id: u32, paused: bool) -> String {
        let mut v = self.app.world_mut().resource_mut::<Village>();
        let Some(site) = v.production.sites.iter_mut().find(|s| s.id == Id(id)) else {
            return "Production worksite not found.".into();
        };
        site.paused = paused;
        economy::rebalance(&mut v);
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
        "ok".into()
    }
}

#[cfg(test)]
pub(crate) fn fixture_inputs(v: &mut Village, id: Id) {
    let b = batch(v, id).unwrap().clone();
    let s = v.logistics.as_mut().unwrap();
    assert!(s.shipments.is_empty());
    let from = s
        .stores
        .iter()
        .position(|p| p.owner == Owner::Camp)
        .unwrap();
    let to = s
        .stores
        .iter()
        .position(|p| p.owner == Owner::Production(b.site))
        .unwrap();
    for (i, &n) in b.inputs.iter().enumerate() {
        assert!(s.stores[from].items[i] >= n);
        s.stores[from].items[i] -= n;
        s.stores[to].items[i] += n;
    }
    logistics::sync_totals(v);
    sync(v);
    logistics::rebalance(v);
}

#[cfg(test)]
mod tests {
    use super::*;
    pub fn scene() -> Game {
        let mut g = Game::new();
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.progress.completed = [true; 4];
            v.arrived = true;
            v.minutes = 540.;
            v.food = 80.;
            v.meals = 10;
            v.water = 40.;
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
        assert!(!assign_batch(&mut r, &v, id));
        fixture_inputs(&mut v, id);
        assert!(assign_batch(&mut r, &v, id));
        let before = v.wood;
        assert!(!work(&mut v, &r, 10.));
        assert_eq!(v.wood, before);
        (r.x, r.y) = (r.target_x, r.target_y);
        assert!(!work(&mut v, &r, 4.));
        assert_eq!(batch(&v, id).unwrap().work, 4.);
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
}
