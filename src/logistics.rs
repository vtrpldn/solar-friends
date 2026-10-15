//! Located material ownership and resident-carried shipments.
use crate::*;
use economy::{Bundle, COUNT};
use simulation::Id;

const LOAD: u32 = 12;
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "id", rename_all = "snake_case")]
pub enum Owner {
    Camp,
    Warehouse(usize),
    Source(usize),
    Site(usize),
    Production(Id),
    Pantry(usize),
    Ground,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Store {
    pub id: Id,
    pub owner: Owner,
    pub x: f32,
    pub y: f32,
    pub capacity: u32,
    pub items: Bundle,
    #[serde(default)]
    pub food_lots: Vec<freshness::Lot>,
    pub target: Bundle,
    #[serde(default)]
    pub managed: bool,
    #[serde(default)]
    pub blocker: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Shipment {
    pub id: Id,
    pub resident: usize,
    pub from: Id,
    pub to: Id,
    pub recovery: Id,
    pub material: usize,
    pub amount: u32,
    pub carrying: bool,
    #[serde(default)]
    pub food_lots: Vec<freshness::Lot>,
    pub pickup: [f32; 2],
    pub dropoff: [f32; 2],
    pub route: Vec<[f32; 2]>,
    pub next: usize,
    pub layout: u32,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct State {
    pub schema: u32,
    pub stores: Vec<Store>,
    pub shipments: Vec<Shipment>,
    pub retry_after: [f32; 5],
    pub layout: u32,
}
impl Default for State {
    fn default() -> Self {
        Self {
            schema: 1,
            stores: vec![],
            shipments: vec![],
            retry_after: [0.; 5],
            layout: 0,
        }
    }
}
fn sum(items: &Bundle) -> u32 {
    items.iter().sum()
}
pub(crate) fn closing(v: &Village, owner: Owner) -> bool {
    match owner {
        Owner::Warehouse(id) | Owner::Pantry(id) => building_work::job(v, id).is_some(),
        Owner::Production(id) => production::closing(v, id),
        _ => false,
    }
}
fn general(owner: Owner) -> bool {
    !matches!(owner, Owner::Site(_))
}
pub fn total(v: &Village, i: usize) -> u32 {
    let s = v.logistics.as_ref().unwrap();
    s.stores.iter().map(|p| p.items[i]).sum::<u32>()
        + s.shipments
            .iter()
            .filter(|p| p.carrying && p.material == i)
            .map(|p| p.amount)
            .sum::<u32>()
}
pub fn project_items(v: &Village, id: usize) -> Bundle {
    v.logistics
        .as_ref()
        .and_then(|s| s.stores.iter().find(|p| p.owner == Owner::Site(id)))
        .map_or([0; COUNT], |p| p.items)
}
fn travelling(v: &Village, id: usize, i: usize) -> u32 {
    let s = v.logistics.as_ref().unwrap();
    let Some(to) = s.stores.iter().find(|p| p.owner == Owner::Site(id)) else {
        return 0;
    };
    s.shipments
        .iter()
        .filter(|h| h.to == to.id && h.material == i)
        .map(|h| h.amount)
        .sum()
}
fn held(s: &State, id: Id, i: usize) -> u32 {
    s.shipments
        .iter()
        .filter(|h| !h.carrying && h.from == id && h.material == i)
        .map(|h| h.amount)
        .sum()
}
pub(crate) fn pickup_reserved(v: &Village, id: Id, i: usize) -> u32 {
    v.logistics.as_ref().map_or(0, |s| held(s, id, i))
}
fn usable(v: &Village, p: &Store, i: usize) -> u32 {
    p.items[i].saturating_sub(
        pickup_reserved(v, p.id, i)
            + production::held(v, p.owner, i)
            + crate::food::held(v, p.id, i, None)
            + gatherings::held(v, p.id, i),
    )
}
fn arriving(s: &State, id: Id) -> u32 {
    s.shipments
        .iter()
        .filter(|h| h.to == id)
        .map(|h| h.amount)
        .sum()
}
pub fn free(v: &Village, i: usize) -> u32 {
    let s = v.logistics.as_ref().unwrap();
    if i >= economy::FOOD {
        return s
            .stores
            .iter()
            .filter(|p| !closing(v, p.owner))
            .map(|p| usable(v, p, i))
            .sum::<u32>()
            .saturating_sub(production::unclaimed(v, i));
    }
    let accessible = s
        .stores
        .iter()
        .filter(|p| general(p.owner) && !closing(v, p.owner))
        .map(|p| usable(v, p, i))
        .sum::<u32>();
    total(v, i)
        .saturating_sub(economy::reserved(v, i) + production::input_demand(v, i))
        .min(accessible.saturating_sub(production::unclaimed(v, i)))
}
pub fn project_ready(v: &Village, id: usize, needs: Bundle) -> bool {
    let s = v.logistics.as_ref().unwrap();
    let Some(store) = s.stores.iter().find(|p| p.owner == Owner::Site(id)) else {
        return false;
    };
    let on_site: Bundle =
        std::array::from_fn(|i| store.items[i].saturating_sub(held(s, store.id, i)));
    (0..COUNT).all(|i| on_site[i] >= needs[i])
}
pub fn sync_totals(v: &mut Village) {
    if v.logistics.is_none() {
        return;
    }
    let totals: Bundle = std::array::from_fn(|i| total(v, i));
    v.wood = totals[0] as f32;
    v.economy.stock = totals;
    v.economy.stock[0] = 0;
    v.progress.tool_uses = totals[economy::TOOLS];
    v.food = totals[economy::FOOD] as f32;
    v.meals = totals[economy::MEALS];
    v.supplies.eggs = totals[economy::EGGS];
    v.progress.compost = totals[economy::COMPOST];
    v.progress.scraps = totals[economy::SCRAPS];
}
pub(crate) fn create(v: &mut Village, owner: Owner, x: f32, y: f32, capacity: u32) -> Option<Id> {
    let id = v.simulation.allocate()?;
    v.logistics.as_mut()?.stores.push(Store {
        id,
        owner,
        x,
        y,
        capacity,
        items: [0; COUNT],
        food_lots: vec![],
        target: [0; COUNT],
        managed: false,
        blocker: None,
    });
    Some(id)
}
pub fn initialise(v: &mut Village) -> bool {
    if v.logistics.is_some() {
        return true;
    }
    let items: Bundle = std::array::from_fn(|i| economy::quantity(v, i));
    v.logistics = Some(State::default());
    if create(v, Owner::Camp, CAMP.0, CAMP.1, economy::CAPACITY).is_none() {
        v.logistics = None;
        return false;
    }
    sync(v);
    for (i, &n) in items.iter().enumerate() {
        let mut left = n;
        for p in v
            .logistics
            .as_mut()
            .unwrap()
            .stores
            .iter_mut()
            .filter(|p| matches!(p.owner, Owner::Camp | Owner::Warehouse(_)))
        {
            let amount = left.min(p.capacity.saturating_sub(sum(&p.items)));
            p.items[i] = amount;
            freshness::add(&mut p.food_lots, i, amount, v.minutes);
            left -= amount;
        }
        if left > 0 {
            return false;
        }
    }
    sync_totals(v);
    true
}
pub(crate) fn layout(v: &Village) -> u32 {
    let mut h = 2166136261u32;
    let mut mix = |n: u32| h = (h ^ n).wrapping_mul(16777619);
    for b in &v.buildings {
        mix(b.id as u32);
        mix(b.x as u32);
        mix(b.y as u32);
        mix(interactions::footprint_size(&b.kind) as u32);
    }
    for s in &v.economy.sources {
        mix(s.active as u32);
        mix(s.material as u32);
        mix(s.x as u32);
        mix(s.y as u32);
    }
    for &(x, y) in &v.roads {
        mix(x as u32);
        mix(y as u32);
    }
    h
}
pub fn sync(v: &mut Village) {
    if v.logistics.is_none() {
        return;
    }
    let stamp = layout(v);
    if v.logistics.as_ref().unwrap().layout != stamp {
        let s = v.logistics.as_mut().unwrap();
        s.layout = stamp;
        s.retry_after = [0.; 5];
        for p in &mut s.stores {
            p.blocker = None;
        }
    }
    let mut wanted = vec![];
    for b in &v.buildings {
        if matches!(
            b.kind.as_str(),
            "kitchen" | "coop" | "grove" | "square" | "compost" | "biodigester"
        ) && (b.progress >= 100. || building_work::original_progress(v, b.id) == Some(100.))
        {
            wanted.push((Owner::Pantry(b.id), b.x as f32, b.y as f32, 60));
        } else if b.kind == "warehouse"
            && (b.progress >= 100. || building_work::original_progress(v, b.id) == Some(100.))
        {
            wanted.push((Owner::Warehouse(b.id), b.x as f32, b.y as f32, 300));
        } else if (b.progress < 100. && building_work::original_progress(v, b.id) != Some(100.))
            || ecology::farm(b)
        {
            wanted.push((Owner::Site(b.id), b.x as f32, b.y as f32, 150));
        }
    }
    for (i, p) in v
        .economy
        .sources
        .iter()
        .enumerate()
        .filter(|(_, p)| p.active)
    {
        wanted.push((Owner::Source(i), p.x as f32, p.y as f32, 60));
    }
    wanted.extend(
        v.production
            .sites
            .iter()
            .filter(|s| {
                s.kind != production::Kind::Kitchen
                    && s.building
                        .is_none_or(|id| v.buildings.iter().any(|b| b.id == id))
            })
            .map(|s| (Owner::Production(s.id), s.x, s.y, production::BUFFER)),
    );
    for &(owner, x, y, capacity) in &wanted {
        if !v
            .logistics
            .as_ref()
            .unwrap()
            .stores
            .iter()
            .any(|p| p.owner == owner)
        {
            create(v, owner, x, y, capacity);
        } else if let Some(p) = v
            .logistics
            .as_mut()
            .unwrap()
            .stores
            .iter_mut()
            .find(|p| p.owner == owner && sum(&p.items) == 0)
        {
            p.x = x;
            p.y = y;
        }
    }
    let s = v.logistics.as_mut().unwrap();
    for p in &mut s.stores {
        if !matches!(p.owner, Owner::Camp | Owner::Ground) && !wanted.iter().any(|w| w.0 == p.owner)
        {
            p.owner = Owner::Ground;
            p.capacity = p.capacity.max(sum(&p.items));
            p.target = [0; COUNT];
        }
    }
    s.stores.retain(|p| {
        p.owner != Owner::Ground
            || sum(&p.items) > 0
            || s.shipments
                .iter()
                .any(|h| [h.from, h.to, h.recovery].contains(&p.id))
    });
}
pub fn receive(v: &mut Village, owner: Owner, i: usize, n: u32) -> bool {
    let mut lots = vec![];
    freshness::add(&mut lots, i, n, v.minutes);
    receive_dated(v, owner, i, n, lots)
}
pub fn receive_preserved(
    v: &mut Village,
    owner: Owner,
    i: usize,
    lots: Vec<freshness::Lot>,
) -> bool {
    let n = lots.iter().map(|l| l.amount).sum();
    receive_dated(v, owner, i, n, lots)
}
fn receive_dated(
    v: &mut Village,
    owner: Owner,
    i: usize,
    n: u32,
    lots: Vec<freshness::Lot>,
) -> bool {
    if n == 0 {
        return true;
    }
    if n > room(v, owner) {
        return false;
    }
    let Some(s) = v.logistics.as_ref() else {
        return false;
    };
    let Some(index) = s
        .stores
        .iter()
        .position(|p| p.owner == owner && sum(&p.items) + arriving(s, p.id) + n <= p.capacity)
    else {
        return false;
    };
    simulation::material_change(v, i, n, true);
    let p = &mut v.logistics.as_mut().unwrap().stores[index];
    p.items[i] += n;
    freshness::merge(&mut p.food_lots, lots);
    sync_totals(v);
    true
}
pub fn source_space(v: &Village, index: usize) -> u32 {
    v.logistics
        .as_ref()
        .and_then(|s| {
            s.stores
                .iter()
                .find(|p| p.owner == Owner::Source(index))
                .map(|p| p.capacity - sum(&p.items) - arriving(s, p.id))
        })
        .unwrap_or(0)
}
pub fn room(v: &Village, owner: Owner) -> u32 {
    let Some(s) = &v.logistics else {
        return economy::capacity(v).saturating_sub(economy::storage(v));
    };
    s.stores.iter().find(|p| p.owner == owner).map_or(0, |p| {
        p.capacity.saturating_sub(
            sum(&p.items)
                + arriving(s, p.id)
                + production::site_space(v, p.owner)
                + food::reserved_space(v, Some(p.owner))
                + organics::reserved_space(v, p.owner)
                + if owner == Owner::Camp {
                    (0..COUNT).map(|i| economy::incoming(v, i)).sum()
                } else {
                    0
                },
        )
    })
}
/// A ground owner can have many piles; meals consume the exact saved store claim.
pub fn spend_at(v: &mut Village, id: Id, i: usize, n: u32) -> bool {
    let Some(s) = v.logistics.as_ref() else {
        return false;
    };
    let Some(index) = s
        .stores
        .iter()
        .position(|p| p.id == id && p.items[i].saturating_sub(held(s, p.id, i)) >= n)
    else {
        return false;
    };
    simulation::material_change(v, i, n, false);
    let p = &mut v.logistics.as_mut().unwrap().stores[index];
    freshness::take(&mut p.food_lots, i, n);
    p.items[i] -= n;
    sync_totals(v);
    true
}
pub fn spend(v: &mut Village, owner: Option<Owner>, i: usize, n: u32) {
    let _ = take(v, owner, i, n);
}
pub fn take(v: &mut Village, owner: Option<Owner>, i: usize, n: u32) -> Vec<freshness::Lot> {
    if n == 0 {
        return vec![];
    }
    let s = v.logistics.as_ref().unwrap();
    let mut choices: Vec<_> = s
        .stores
        .iter()
        .enumerate()
        .filter(|(_, p)| {
            owner.map_or(
                (general(p.owner) || i >= economy::FOOD) && !closing(v, p.owner),
                |o| p.owner == o,
            )
        })
        .map(|(j, p)| {
            (
                j,
                if owner.is_some() {
                    p.items[i].saturating_sub(held(s, p.id, i))
                } else {
                    usable(v, p, i)
                },
            )
        })
        .collect();
    assert!(
        choices.iter().map(|(_, n)| n).sum::<u32>() >= n,
        "spending material absent from its store"
    );
    simulation::material_change(v, i, n, false);
    let mut left = n;
    let mut lots = vec![];
    while left > 0 {
        let (choice, _) = choices
            .iter()
            .enumerate()
            .filter(|(_, (_, n))| *n > 0)
            .min_by(|(_, a), (_, b)| {
                if freshness::lifetime(i).is_some() {
                    let stores = &v.logistics.as_ref().unwrap().stores;
                    let expiry = |index: usize| {
                        stores[index]
                            .food_lots
                            .iter()
                            .find(|l| l.material == i)
                            .unwrap()
                            .expires
                    };
                    expiry(a.0).total_cmp(&expiry(b.0)).then(a.0.cmp(&b.0))
                } else {
                    a.0.cmp(&b.0)
                }
            })
            .unwrap();
        let (index, available) = choices[choice];
        let p = &mut v.logistics.as_mut().unwrap().stores[index];
        let dated = p
            .food_lots
            .iter()
            .find(|l| l.material == i)
            .map_or(available, |l| l.amount);
        let taken = left.min(available).min(dated);
        freshness::merge(&mut lots, freshness::take(&mut p.food_lots, i, taken));
        p.items[i] -= taken;
        choices[choice].1 -= taken;
        left -= taken;
    }
    sync_totals(v);
    lots
}
pub fn rebalance(v: &mut Village) {
    sync(v);
    let s = v.logistics.as_ref().unwrap();
    let mut available: Bundle = std::array::from_fn(|i| {
        s.stores
            .iter()
            .filter(|p| general(p.owner) && !closing(v, p.owner))
            .map(|p| usable(v, p, i))
            .sum::<u32>()
            .saturating_sub(production::unclaimed(v, i))
    });
    let mut order: Vec<_> = (0..v.economy.projects.len()).collect();
    order.sort_by_key(|&i| {
        (
            std::cmp::Reverse(v.economy.projects[i].priority),
            v.economy.projects[i].building,
        )
    });
    for p in &mut v.economy.projects {
        p.reserved = [0; COUNT];
    }
    for index in order {
        let p = &v.economy.projects[index];
        let Some(b) = v
            .buildings
            .iter()
            .find(|b| b.id == p.building && b.progress < 100.)
        else {
            continue;
        };
        let stages = economy::recipe(&b.kind, &p.recipe).unwrap();
        if p.paused || p.committed || p.stage >= stages.len() {
            continue;
        }
        let needs = stages[p.stage].items;
        let on_site = project_items(v, b.id);
        let fixed: Bundle = std::array::from_fn(|i| {
            on_site[i]
                .saturating_add(travelling(v, b.id, i))
                .min(needs[i])
        });
        for i in 0..COUNT {
            let n = available[i].min(needs[i] - fixed[i]);
            available[i] -= n;
            v.economy.projects[index].reserved[i] = fixed[i] + n;
        }
    }
}
fn needs(v: &Village, owner: Owner) -> Bundle {
    let mut items = match owner {
        Owner::Site(id) => v
            .economy
            .projects
            .iter()
            .find(|p| p.building == id && !p.paused && !p.committed)
            .and_then(|p| {
                v.buildings
                    .iter()
                    .find(|b| b.id == id && b.progress < 100.)
                    .and_then(|b| {
                        economy::recipe(&b.kind, &p.recipe)?
                            .get(p.stage)
                            .map(|s| s.items)
                    })
            })
            .unwrap_or([0; COUNT]),
        Owner::Production(id) => production::needs(v, id),
        Owner::Pantry(id) => crate::food::needs(v, id),
        _ => [0; COUNT],
    };
    if let Owner::Site(id) = owner
        && tool_target(v, id)
    {
        items[economy::TOOLS] = 1;
    }
    crate::organics::needs(v, owner, &mut items);
    items
}
fn tool_target(v: &Village, id: usize) -> bool {
    v.progress.use_tools
        && building_work::job(v, id).is_none()
        && v.buildings.iter().any(|b| {
            b.id == id
                && ((b.progress < 100.
                    && v.economy
                        .projects
                        .iter()
                        .any(|p| p.building == id && !p.paused))
                    || (b.progress >= 100. && ecology::farm(b) && b.crop.planted))
        })
}
pub fn site_tools(v: &Village, id: usize) -> u32 {
    v.logistics
        .as_ref()
        .and_then(|s| s.stores.iter().find(|p| p.owner == Owner::Site(id)))
        .map_or(0, |p| {
            p.items[economy::TOOLS].saturating_sub(pickup_reserved(v, p.id, economy::TOOLS))
        })
}
pub(crate) fn approaches(v: &Village, p: &Store, id: usize) -> Option<[f32; 2]> {
    // A put-down load can lie in a narrow walkable corridor. Pick it up where
    // it actually rests rather than requiring a ring of space around it.
    if p.owner == Owner::Ground && navigation::clear(v, p.x, p.y) {
        return Some([p.x, p.y]);
    }
    let (x, y) = match p.owner {
        Owner::Warehouse(b) | Owner::Site(b) | Owner::Pantry(b) => {
            spacing::approach(v, v.buildings.iter().find(|p| p.id == b)?, id)?
        }
        Owner::Production(site) if production::building(v, site).is_some() => {
            let b = production::building(v, site).unwrap();
            spacing::approach(v, v.buildings.iter().find(|p| p.id == b)?, id)?
        }
        _ => {
            let radius = match p.owner {
                Owner::Source(i) => {
                    resource_sites::size(v.economy.sources.get(i)?.material) as f32 / 2. + 0.6
                }
                _ => 0.8,
            };
            let mut spots: Vec<(f32, f32)> = vec![];
            for extra in [0., 0.7, 1.4, 2.1] {
                for angle in [45f32, 0., 90., -45., 135., -90., 180., 225.] {
                    let a = angle.to_radians();
                    let q = (
                        p.x + (radius + extra) * a.cos(),
                        p.y + (radius + extra) * a.sin(),
                    );
                    if navigation::clear(v, q.0, q.1)
                        && spots
                            .iter()
                            .all(|r| (q.0 - r.0).hypot(q.1 - r.1) >= spacing::PERSONAL_SPACE)
                    {
                        spots.push(q);
                    }
                    if spots.len() > id {
                        let q = [spots[id].0, spots[id].1];
                        return doorway(v, p, q).then_some(q);
                    }
                }
            }
            return None;
        }
    };
    (navigation::clear(v, x, y) && doorway(v, p, [x, y])).then_some([x, y])
}
fn doorway(v: &Village, p: &Store, to: [f32; 2]) -> bool {
    // River generators are supplied from a land approach. Their connection to
    // that approach crosses water; the resident's walking route never does.
    let river_structure = v
        .buildings
        .iter()
        .any(|b| b.kind == "hydro" && p.owner == Owner::Site(b.id));
    let steps = ((to[0] - p.x).hypot(to[1] - p.y) / 0.1).ceil().max(1.) as u32;
    (0..=steps).all(|i| {
        let t = i as f32 / steps as f32;
        let x = p.x + (to[0] - p.x) * t;
        let y = p.y + (to[1] - p.y) * t;
        (spacing::land(x, y) || river_structure)
            && v.buildings
                .iter()
                .filter(|b| !matches!(p.owner,Owner::Site(id)|Owner::Warehouse(id)|Owner::Pantry(id) if id==b.id)
                    && !matches!(p.owner,Owner::Production(id) if production::building(v,id)==Some(b.id)))
                .all(|b| spacing::clear_plot(b, x, y))
            && v.economy
                .sources
                .iter()
                .enumerate()
                .filter(|(index, s)| s.active && p.owner != Owner::Source(*index))
                .all(|(_, s)| {
                    let n = resource_sites::size(s.material);
                    let left = (s.x - n / 2) as f32 - 0.5;
                    let top = (s.y - n / 2) as f32 - 0.5;
                    x <= left - 0.2
                        || x >= left + n as f32 + 0.2
                        || y <= top - 0.2
                        || y >= top + n as f32 + 0.2
                })
    })
}
#[derive(Clone)]
struct Candidate {
    from: Id,
    to: Id,
    material: usize,
    amount: u32,
    rank: (u32, u32, u32),
}
fn delivery_priority(v: &Village, to: Owner, material: usize) -> u32 {
    let kind = match to {
        Owner::Pantry(id) => v
            .buildings
            .iter()
            .find(|b| b.id == id)
            .map(|b| b.kind.as_str()),
        _ => None,
    };
    // Routine redistribution must not indefinitely postpone useful food or waste treatment.
    if kind == Some("biodigester") && material == economy::SCRAPS && v.circular.waste >= 4. {
        return 1;
    }
    if kind == Some("coop") {
        return if v.food >= 18. { 1 } else { 3 };
    }
    if supplies::urgent(v) { 1 } else { 2 }
}
fn candidates(v: &Village) -> Vec<Candidate> {
    let Some(s) = &v.logistics else {
        return vec![];
    };
    let mut out = vec![];
    // Evacuate queued warehouses and release excess staging before dismantling.
    for from in &s.stores {
        if from.owner == Owner::Ground
            && s.shipments.iter().any(|h| h.from == from.id && !h.carrying)
        {
            continue;
        }
        for i in 0..COUNT {
            let available = usable(v, from, i);
            if available == 0 {
                continue;
            }
            let excess = match from.owner {
                Owner::Site(_) | Owner::Pantry(_) => {
                    available.saturating_sub(needs(v, from.owner)[i])
                }
                Owner::Warehouse(_) if from.managed && !closing(v, from.owner) => {
                    available.saturating_sub(from.target[i])
                }
                _ => available,
            };
            let returning = matches!(
                from.owner,
                Owner::Site(_)
                    | Owner::Source(_)
                    | Owner::Ground
                    | Owner::Production(_)
                    | Owner::Pantry(_)
            ) || closing(v, from.owner)
                || (matches!(from.owner, Owner::Warehouse(_)) && from.managed);
            if returning && excess > 0 && organics::return_surplus(v, from.owner, i, excess) {
                for to in s.stores.iter().filter(|p| {
                    matches!(p.owner, Owner::Camp | Owner::Warehouse(_))
                        && p.id != from.id
                        && !closing(v, p.owner)
                }) {
                    let wanted = if to.managed {
                        to.target[i].saturating_sub(
                            to.items[i]
                                + s.shipments
                                    .iter()
                                    .filter(|h| h.to == to.id && h.material == i)
                                    .map(|h| h.amount)
                                    .sum::<u32>(),
                        )
                    } else {
                        u32::MAX
                    };
                    let room = room(v, to.owner).min(wanted);
                    let n = excess.min(room).min(LOAD);
                    if n > 0 {
                        out.push(Candidate {
                            from: from.id,
                            to: to.id,
                            material: i,
                            amount: n,
                            rank: (
                                if closing(v, from.owner) { 0 } else { 2 },
                                u32::from(i >= economy::FOOD),
                                from.id.0,
                            ),
                        });
                    }
                }
            }
        }
    }
    for p in v
        .economy
        .projects
        .iter()
        .filter(|p| !p.paused && !p.committed)
    {
        let Some(to) = s.stores.iter().find(|s| s.owner == Owner::Site(p.building)) else {
            continue;
        };
        let required = needs(v, to.owner);
        let on_site = to.items;
        for i in 0..COUNT {
            let missing = p.reserved[i]
                .min(required[i])
                .saturating_sub(on_site[i] + travelling(v, p.building, i));
            if missing == 0 {
                continue;
            }
            for from in s
                .stores
                .iter()
                .filter(|p| general(p.owner) && !closing(v, p.owner))
            {
                let n = missing.min(usable(v, from, i)).min(LOAD);
                if n > 0 {
                    out.push(Candidate {
                        from: from.id,
                        to: to.id,
                        material: i,
                        amount: n,
                        rank: (1, 3 - p.priority, p.building as u32),
                    });
                }
            }
        }
    }
    // A planned shared meal can use kitchen portions without waiting for a surplus pantry.
    if let Some(party) = gatherings::active(v)
        .filter(|p| p.spent_after.is_none() && !closing(v, Owner::Pantry(p.building)))
        && let Some(to) = s.stores.iter().find(|p| p.id == party.store)
    {
        let incoming: u32 = s
            .shipments
            .iter()
            .filter(|h| h.to == to.id && h.material == economy::MEALS)
            .map(|h| h.amount)
            .sum();
        let missing = gatherings::PORTIONS.saturating_sub(to.items[economy::MEALS] + incoming);
        for from in s
            .stores
            .iter()
            .filter(|p| p.id != to.id && !closing(v, p.owner))
        {
            let amount = missing
                .min(gatherings::held(v, from.id, economy::MEALS) + usable(v, from, economy::MEALS))
                .min(room(v, to.owner));
            if amount > 0 {
                out.push(Candidate {
                    from: from.id,
                    to: to.id,
                    material: economy::MEALS,
                    amount,
                    rank: (1, 0, to.id.0),
                });
            }
        }
    }
    // Kitchen ingredients and hen feed use the same claimed, resident-carried loads.
    for to in s.stores.iter().filter(|p| {
        matches!(
            p.owner,
            Owner::Pantry(_) | Owner::Site(_) | Owner::Source(_)
        ) && !closing(v, p.owner)
    }) {
        let required = needs(v, to.owner);
        for (i, &required) in required.iter().enumerate().skip(economy::FOOD) {
            let pending = s
                .shipments
                .iter()
                .filter(|h| h.to == to.id && h.material == i)
                .map(|h| h.amount)
                .sum::<u32>();
            let missing = required.saturating_sub(to.items[i] + pending);
            for from in s
                .stores
                .iter()
                .filter(|p| p.id != to.id && !closing(v, p.owner))
            {
                let excess = usable(v, from, i).saturating_sub(needs(v, from.owner)[i]);
                if i == economy::SCRAPS && missing >= 2 && excess < 2 {
                    continue;
                }
                if i == economy::COMPOST
                    && matches!(to.owner, Owner::Source(_))
                    && missing >= 2
                    && excess < 2
                {
                    continue;
                }
                let amount = missing.min(excess).min(room(v, to.owner)).min(LOAD);
                if amount > 0 {
                    out.push(Candidate {
                        from: from.id,
                        to: to.id,
                        material: i,
                        amount,
                        rank: (delivery_priority(v, to.owner, i), 0, to.id.0),
                    });
                }
            }
        }
    }
    // Tool supplies are optional: absence never blocks a construction stage.
    // Each worksite receives one use, through the same claimed cargo routes.
    for to in s
        .stores
        .iter()
        .filter(|p| matches!(p.owner,Owner::Site(id) if tool_target(v,id)))
    {
        let pending = s
            .shipments
            .iter()
            .filter(|h| h.to == to.id && h.material == economy::TOOLS)
            .map(|h| h.amount)
            .sum::<u32>();
        let missing = 1u32.saturating_sub(to.items[economy::TOOLS] + pending);
        for from in s
            .stores
            .iter()
            .filter(|p| general(p.owner) && !closing(v, p.owner) && p.id != to.id)
        {
            let amount = missing
                .min(usable(v, from, economy::TOOLS))
                .min(room(v, to.owner));
            if amount > 0 {
                out.push(Candidate {
                    from: from.id,
                    to: to.id,
                    material: economy::TOOLS,
                    amount,
                    rank: (1, 4, to.id.0),
                });
            }
        }
    }
    for b in v.production.batches.iter().filter(|b| {
        b.material != economy::MEALS
            && b.active()
            && !b.committed
            && production::operational(v, b.site)
    }) {
        let Some(to) = s
            .stores
            .iter()
            .find(|p| p.owner == Owner::Production(b.site))
        else {
            continue;
        };
        for i in 0..COUNT {
            let onsite = to.items[i].saturating_sub(held(s, to.id, i));
            let missing = b.inputs[i].saturating_sub(onsite + production::inbound(v, b.site, i));
            for from in s
                .stores
                .iter()
                .filter(|p| p.id != to.id && general(p.owner) && !closing(v, p.owner))
            {
                let amount = missing
                    .min(usable(v, from, i))
                    .min(LOAD)
                    .min(room(v, to.owner));
                if amount > 0 {
                    out.push(Candidate {
                        from: from.id,
                        to: to.id,
                        material: i,
                        amount,
                        rank: (1, 4, b.id.0),
                    });
                }
            }
        }
    }
    for to in s
        .stores
        .iter()
        .filter(|p| matches!(p.owner, Owner::Warehouse(_)) && !closing(v, p.owner))
    {
        for i in 0..COUNT {
            let pending = s
                .shipments
                .iter()
                .filter(|h| h.to == to.id && h.material == i)
                .map(|h| h.amount)
                .sum::<u32>();
            let missing = to.target[i].saturating_sub(to.items[i] + pending).min(
                to.capacity
                    .saturating_sub(sum(&to.items) + arriving(s, to.id)),
            );
            if missing == 0 {
                continue;
            }
            for from in s.stores.iter().filter(|p| p.owner == Owner::Camp) {
                let n = missing
                    .min(from.items[i].saturating_sub(held(s, from.id, i)))
                    .min(economy::free(v, i))
                    .min(LOAD);
                if n > 0 {
                    out.push(Candidate {
                        from: from.id,
                        to: to.id,
                        material: i,
                        amount: n,
                        rank: (3, 0, to.id.0),
                    });
                }
            }
        }
    }
    out.sort_by_key(|c| c.rank);
    out
}
pub fn pending(v: &Village, id: usize) -> bool {
    v.logistics
        .as_ref()
        .is_some_and(|s| v.minutes >= s.retry_after[id])
        && !candidates(v).is_empty()
}
type Plan = (Candidate, [f32; 2], [f32; 2], navigation::Route, f32);
fn plan(v: &Village, r: &Resident) -> Option<Plan> {
    let options = candidates(v);
    let mut best = None;
    for c in options {
        if best.as_ref().is_some_and(
            |(b, _, _, _, _): &(Candidate, [f32; 2], [f32; 2], navigation::Route, f32)| {
                c.rank > b.rank
            },
        ) {
            break;
        }
        let s = v.logistics.as_ref().unwrap();
        let from = s.stores.iter().find(|p| p.id == c.from).unwrap();
        let to = s.stores.iter().find(|p| p.id == c.to).unwrap();
        if !requests::matches_haul(v, r, from.owner, to.owner) {
            continue;
        }
        let Some(a) = approaches(v, from, r.id) else {
            continue;
        };
        let Some(b) = approaches(v, to, r.id) else {
            continue;
        };
        let Ok(first) = navigation::route(v, [r.x, r.y], a) else {
            continue;
        };
        let Ok(second) = navigation::route(v, a, b) else {
            continue;
        };
        let effort = first.minutes + second.minutes;
        if best.as_ref().is_none_or(|(_, _, _, _, n)| effort < *n) {
            best = Some((c, a, b, first, effort));
        }
    }
    best
}
/// The same two reachable routes used when a resident claims a load.
pub fn quote(v: &Village, r: &Resident) -> Option<(f32, f32)> {
    plan(v, r).map(|(c, _, _, _, minutes)| {
        let urgency = match c.rank.0 {
            0 => 850.,
            1 => 600. + 3u32.saturating_sub(c.rank.1) as f32 * 60.,
            2 => 380.,
            _ => 200.,
        };
        (minutes, urgency)
    })
}
fn claim(v: &mut Village, r: &mut Resident) -> bool {
    let destinations: std::collections::HashSet<_> = candidates(v).iter().map(|c| c.to).collect();
    let best = plan(v, r);
    let Some((c, a, b, path, _)) = best else {
        for p in &mut v.logistics.as_mut().unwrap().stores {
            if destinations.contains(&p.id) {
                p.blocker=Some("No clear hauling route. Leave an accessible path around the pickup and receiving plot.".into());
            }
        }
        return false;
    };
    for p in &mut v.logistics.as_mut().unwrap().stores {
        if [c.from, c.to].contains(&p.id) {
            p.blocker = None;
        }
    }
    if v.simulation.next_id.checked_add(2).is_none() {
        return false;
    }
    let recovery = create(v, Owner::Ground, r.x, r.y, LOAD).unwrap();
    let id = v.simulation.allocate().unwrap();
    let layout = v.logistics.as_ref().unwrap().layout;
    v.logistics.as_mut().unwrap().shipments.push(Shipment {
        id,
        resident: r.id,
        from: c.from,
        to: c.to,
        recovery,
        material: c.material,
        amount: c.amount,
        carrying: false,
        food_lots: vec![],
        pickup: a,
        dropoff: b,
        route: path.points,
        next: 1,
        layout,
    });
    (r.target_x, r.target_y) = (a[0], a[1]);
    r.remaining = 100.;
    r.activity_building = None;
    r.activity_material = None;
    r.activity_batch = None;
    r.visit_building = None;
    r.reason = format!(
        "Collecting {} {} for a local delivery.",
        c.amount,
        economy::NAMES[c.material]
    );
    true
}
fn valid_destination(v: &Village, h: &Shipment) -> bool {
    let s = v.logistics.as_ref().unwrap();
    let Some(to) = s.stores.iter().find(|p| p.id == h.to) else {
        return false;
    };
    if closing(v, to.owner) {
        return false;
    }
    match to.owner {
        Owner::Site(id) => {
            needs(v, to.owner)[h.material]
                >= project_items(v, id)[h.material] + travelling(v, id, h.material)
        }
        Owner::Ground => false,
        Owner::Pantry(_) => {
            let incoming = s
                .shipments
                .iter()
                .filter(|p| p.to == h.to && p.material == h.material)
                .map(|p| p.amount)
                .sum::<u32>();
            needs(v, to.owner)[h.material] >= to.items[h.material] + incoming
        }
        Owner::Production(id) => {
            let present = to.items[h.material].saturating_sub(held(s, to.id, h.material));
            production::needs(v, id)[h.material] >= present + production::inbound(v, id, h.material)
        }
        _ => true,
    }
}
pub fn interrupt(v: &mut Village, r: &Resident) {
    let Some(s) = v.logistics.as_mut() else {
        return;
    };
    let Some(index) = s.shipments.iter().position(|h| h.resident == r.id) else {
        return;
    };
    let mut h = s.shipments.remove(index);
    if h.carrying {
        let p = s.stores.iter_mut().find(|p| p.id == h.recovery).unwrap();
        p.items[h.material] += h.amount;
        freshness::merge(&mut p.food_lots, std::mem::take(&mut h.food_lots));
        p.x = r.x;
        p.y = r.y;
    }
    sync(v);
    rebalance(v);
}
fn walk(
    v: &Village,
    r: &mut Resident,
    neighbours: &[(usize, f32, f32)],
    target: [f32; 2],
    dt: f32,
) {
    let final_target = (r.target_x, r.target_y);
    (r.target_x, r.target_y) = (target[0], target[1]);
    let old = (r.x, r.y);
    let speed = if v.roads.contains(&(r.x.round() as i32, r.y.round() as i32))
        && v.roads
            .contains(&(target[0].round() as i32, target[1].round() as i32))
    {
        1. / 0.6
    } else {
        1.
    };
    if (r.x - target[0]).hypot(r.y - target[1]) > 0.001 {
        spacing::walk(r, neighbours, dt * speed);
    }
    if !navigation::segment(v, [old.0, old.1], [r.x, r.y])
        || !navigation::segment(v, [r.x, r.y], target)
    {
        (r.x, r.y) = old;
        let dx = target[0] - r.x;
        let dy = target[1] - r.y;
        let distance = dx.hypot(dy);
        let step = (dt * speed * 0.7).min(distance);
        if distance > 0.001 {
            let p = (r.x + dx / distance * step, r.y + dy / distance * step);
            if navigation::segment(v, [r.x, r.y], [p.0, p.1])
                && navigation::segment(v, [p.0, p.1], target)
            {
                (r.x, r.y) = p;
            }
        }
    }
    (r.target_x, r.target_y) = final_target;
}
/// Called after needs and routines choose the resident's current activity.
pub fn advance(
    v: &mut Village,
    r: &mut Resident,
    neighbours: &[(usize, f32, f32)],
    dt: f32,
) -> bool {
    if v.logistics.is_none() {
        return false;
    }
    if r.task != "haul" {
        interrupt(v, r);
        return false;
    }
    if !v
        .logistics
        .as_ref()
        .unwrap()
        .shipments
        .iter()
        .any(|h| h.resident == r.id)
        && !claim(v, r)
    {
        v.logistics.as_mut().unwrap().retry_after[r.id] = v.minutes + 30.;
        assign(
            r,
            v,
            "rest",
            "No clear supply route is available. Leave space around stores and projects.",
            false,
        );
        return true;
    }
    let index = v
        .logistics
        .as_ref()
        .unwrap()
        .shipments
        .iter()
        .position(|h| h.resident == r.id)
        .unwrap();
    let h = v.logistics.as_ref().unwrap().shipments[index].clone();
    if !valid_destination(v, &h) {
        interrupt(v, r);
        r.remaining = 0.;
        return true;
    }
    if h.carrying {
        r.reason = format!(
            "Carrying {} {} to the receiving site.",
            h.amount,
            economy::NAMES[h.material]
        );
    }
    let target = if h.carrying { h.dropoff } else { h.pickup };
    if h.layout != v.logistics.as_ref().unwrap().layout
        || h.route
            .get(h.next)
            .is_some_and(|p| !navigation::clear(v, p[0], p[1]))
    {
        let Ok(path) = navigation::route(v, [r.x, r.y], target) else {
            interrupt(v, r);
            r.remaining = 0.;
            return true;
        };
        let s = v.logistics.as_mut().unwrap();
        let h = &mut s.shipments[index];
        h.route = path.points;
        h.next = 1;
        h.layout = s.layout;
    }
    let point = v.logistics.as_ref().unwrap().shipments[index]
        .route
        .get(v.logistics.as_ref().unwrap().shipments[index].next)
        .copied();
    if let Some(p) = point {
        walk(v, r, neighbours, p, dt);
        r.energy = (r.energy - dt * 0.06).max(0.);
        if (r.x - p[0]).hypot(r.y - p[1]) <= 0.08 {
            r.x = p[0];
            r.y = p[1];
            v.logistics.as_mut().unwrap().shipments[index].next += 1;
        }
        return true;
    }
    if !h.carrying {
        let Ok(path) = navigation::route(v, [r.x, r.y], h.dropoff) else {
            interrupt(v, r);
            r.remaining = 0.;
            return true;
        };
        let s = v.logistics.as_mut().unwrap();
        let source = s.stores.iter_mut().find(|p| p.id == h.from).unwrap();
        let food_lots = freshness::take(&mut source.food_lots, h.material, h.amount);
        source.items[h.material] -= h.amount;
        let h = &mut s.shipments[index];
        h.food_lots = food_lots;
        h.carrying = true;
        h.route = path.points;
        h.next = 1;
        (r.target_x, r.target_y) = (h.dropoff[0], h.dropoff[1]);
        r.reason = format!(
            "Carrying {} {} to the receiving site.",
            h.amount,
            economy::NAMES[h.material]
        );
    } else {
        let s = v.logistics.as_mut().unwrap();
        let target = s.stores.iter_mut().find(|p| p.id == h.to).unwrap();
        target.items[h.material] += h.amount;
        freshness::merge(&mut target.food_lots, h.food_lots);
        s.shipments.remove(index);
        r.remaining = 0.;
        sync(v);
        rebalance(v);
    }
    true
}
pub fn occupied_building(v: &Village, id: usize) -> bool {
    v.logistics.as_ref().is_some_and(|s| {
        s.stores
            .iter()
            .filter(|p| matches!(p.owner,Owner::Site(b)|Owner::Warehouse(b)|Owner::Pantry(b) if b==id)
                || matches!(p.owner,Owner::Production(site) if production::building(v,site)==Some(id)))
            .any(|p| {
                sum(&p.items) > 0 || s.shipments.iter().any(|h| h.from == p.id || h.to == p.id)
            })
    })
}
pub fn salvage_store(v: &mut Village, x: i32, y: i32) -> Option<Id> {
    create(v, Owner::Ground, x as f32, y as f32, 150)
}
pub fn receive_salvage(v: &mut Village, id: Id, items: Bundle) {
    for (i, &n) in items.iter().enumerate() {
        simulation::material_change(v, i, n, true);
    }
    v.logistics
        .as_mut()
        .unwrap()
        .stores
        .iter_mut()
        .find(|p| p.id == id)
        .unwrap()
        .items = items;
    sync_totals(v);
}
pub fn view(v: &Village) -> serde_json::Value {
    serde_json::json!({"stores":v.logistics.as_ref().map(|s|&s.stores),"shipments":v.logistics.as_ref().map(|s|&s.shipments),"load_capacity":LOAD})
}
pub fn valid(v: &Village, residents: &[Resident]) -> bool {
    let Some(s) = &v.logistics else {
        return v.version == 3;
    };
    if v.version != 13
        || s.schema != 1
        || s.stores.len() > 2048
        || s.shipments.len() > 5
        || s.shipments
            .iter()
            .any(|h| h.amount == 0 || h.amount > LOAD || h.material >= COUNT)
        || s.retry_after
            .iter()
            .any(|n| !n.is_finite() || *n < 0. || *n > v.minutes + 31.)
    {
        return false;
    }
    let mut ids = std::collections::HashSet::new();
    for id in v
        .building_jobs
        .iter()
        .filter_map(|j| j.id)
        .chain(s.stores.iter().map(|p| p.id))
        .chain(s.shipments.iter().map(|h| h.id))
    {
        if id.0 == 0 || id.0 >= v.simulation.next_id || !ids.insert(id) {
            return false;
        }
    }
    let mut owners = vec![];
    for p in &s.stores {
        if !p.x.is_finite()
            || !p.y.is_finite()
            || !(0.3..=27.7).contains(&p.x)
            || !(0.3..=27.7).contains(&p.y)
            || p.capacity > 600
            || p.blocker.as_ref().is_some_and(|s| s.len() > 200)
            || p.items.iter().chain(&p.target).any(|n| *n > 600)
            || sum(&p.items) > p.capacity
            || sum(&p.target) > p.capacity
            || sum(&p.items)
                + arriving(s, p.id)
                + production::site_space(v, p.owner)
                + food::reserved_space(v, Some(p.owner))
                + organics::reserved_space(v, p.owner)
                > p.capacity
        {
            return false;
        }
        if p.owner != Owner::Ground && owners.contains(&p.owner) {
            return false;
        }
        owners.push(p.owner);
        let anchored = match p.owner {
            Owner::Camp => p.capacity == economy::CAPACITY && (p.x, p.y) == CAMP,
            Owner::Warehouse(id) => {
                p.capacity == 300
                    && v.buildings.iter().any(|b| {
                        b.id == id
                            && b.kind == "warehouse"
                            && (b.progress >= 100.
                                || building_work::original_progress(v, id) == Some(100.))
                            && (p.x, p.y) == (b.x as f32, b.y as f32)
                    })
            }
            Owner::Pantry(id) => {
                p.capacity == 60
                    && v.buildings.iter().any(|b| {
                        b.id == id
                            && matches!(
                                b.kind.as_str(),
                                "kitchen" | "coop" | "grove" | "square" | "compost" | "biodigester"
                            )
                            && (b.progress >= 100.
                                || building_work::original_progress(v, id) == Some(100.))
                            && (p.x, p.y) == (b.x as f32, b.y as f32)
                    })
            }
            Owner::Site(id) => {
                p.capacity == 150
                    && v.buildings.iter().any(|b| {
                        b.id == id
                            && (b.progress < 100. || ecology::farm(b))
                            && (p.x, p.y) == (b.x as f32, b.y as f32)
                    })
            }
            Owner::Source(i) => {
                p.capacity == 60
                    && v.economy
                        .sources
                        .get(i)
                        .is_some_and(|s| s.active && (p.x, p.y) == (s.x as f32, s.y as f32))
            }
            Owner::Ground => p.capacity <= 300,
            Owner::Production(id) => {
                p.capacity == production::BUFFER
                    && production::site(v, id).is_some_and(|s| {
                        s.kind != production::Kind::Kitchen
                            && (s.x, s.y) == (p.x, p.y)
                            && s.building.is_none_or(|id| {
                                v.buildings.iter().any(|b| {
                                    b.id == id
                                        && b.kind == "workshop"
                                        && (b.x as f32, b.y as f32) == (p.x, p.y)
                                })
                            })
                    })
            }
        };
        if !anchored || (0..COUNT).any(|i| held(s, p.id, i) > p.items[i]) {
            return false;
        }
    }
    if v.food != total(v, economy::FOOD) as f32
        || v.meals != total(v, economy::MEALS)
        || v.supplies.eggs != total(v, economy::EGGS)
        || v.progress.tool_uses != total(v, economy::TOOLS)
        || v.progress.compost != total(v, economy::COMPOST)
        || v.progress.scraps != total(v, economy::SCRAPS)
        || !owners.contains(&Owner::Camp)
        || (0..COUNT).any(|i| {
            if i == 0 {
                v.wood != total(v, i) as f32
            } else {
                v.economy.stock[i] != total(v, i)
            }
        })
    {
        return false;
    }
    let mut workers = std::collections::HashSet::new();
    let mut recoveries = std::collections::HashSet::new();
    for h in &s.shipments {
        if h.resident >= 5
            || !workers.insert(h.resident)
            || !recoveries.insert(h.recovery)
            || s.shipments
                .iter()
                .any(|other| [other.from, other.to].contains(&h.recovery))
            || h.material >= COUNT
            || h.amount == 0
            || h.amount > LOAD
            || h.from == h.to
            || h.route.len() > 1024
            || h.route.is_empty()
            || h.next > h.route.len()
            || h.route.iter().chain([&h.pickup, &h.dropoff]).any(|p| {
                p.iter()
                    .any(|n| !n.is_finite() || !(0.3..=27.7).contains(n))
            })
            || !s.stores.iter().any(|p| p.id == h.from)
            || !s.stores.iter().any(|p| p.id == h.to)
            || !s.stores.iter().any(|p| {
                p.id == h.recovery
                    && p.owner == Owner::Ground
                    && sum(&p.items) == 0
                    && p.capacity == LOAD
            })
            || residents
                .iter()
                .find(|r| r.id == h.resident)
                .is_none_or(|r| {
                    r.trip
                        .as_ref()
                        .is_some_and(|t| t.phase == mobility::Phase::Away)
                })
        {
            return false;
        }
    }
    true
}
#[wasm_bindgen]
impl Game {
    pub fn set_storage_target(&mut self, building: usize, items: &str) -> String {
        let Ok(target) = serde_json::from_str::<Bundle>(items) else {
            return "Choose valid storage targets.".into();
        };
        if target.iter().any(|n| *n > 300) || sum(&target) > 300 {
            return "A storage house holds 300 material units.".into();
        }
        let mut v = self.app.world_mut().resource_mut::<Village>();
        let Some(p) = v.logistics.as_mut().and_then(|s| {
            s.stores
                .iter_mut()
                .find(|p| p.owner == Owner::Warehouse(building))
        }) else {
            return "Finish a storage house first.".into();
        };
        p.target = target;
        p.managed = true;
        v.logistics.as_mut().unwrap().retry_after = [0.; 5];
        "ok".into()
    }
    pub fn logistics_report(&self) -> String {
        view(self.app.world().resource::<Village>()).to_string()
    }
}

#[cfg(test)]
pub fn fixture_stock(v: &mut Village, i: usize, n: u32) {
    assert!(v.logistics.as_ref().unwrap().shipments.is_empty());
    for p in &mut v.logistics.as_mut().unwrap().stores {
        p.items[i] = 0;
    }
    let mut left = n;
    for p in v
        .logistics
        .as_mut()
        .unwrap()
        .stores
        .iter_mut()
        .filter(|p| matches!(p.owner, Owner::Camp | Owner::Warehouse(_)))
    {
        let amount = left.min(p.capacity.saturating_sub(sum(&p.items)));
        p.items[i] = amount;
        left -= amount;
    }
    while left > 0 {
        let id = create(v, Owner::Ground, CAMP.0, CAMP.1, 300).unwrap();
        let n = left.min(300);
        v.logistics
            .as_mut()
            .unwrap()
            .stores
            .iter_mut()
            .find(|p| p.id == id)
            .unwrap()
            .items[i] = n;
        left -= n;
    }
    sync_totals(v);
    freshness::fixture_reseed(v);
    v.simulation.materials = None;
    simulation::start_materials(v);
}
#[cfg(test)]
pub fn fixture_finish(v: &mut Village, id: usize) {
    v.buildings
        .iter_mut()
        .find(|b| b.id == id)
        .unwrap()
        .progress = 100.;
    production::sync(v);
    sync(v);
}
#[cfg(test)]
pub fn fixture_stage(v: &mut Village, id: usize) {
    sync(v);
    let mut required = needs(v, Owner::Site(id));
    required[economy::TOOLS] = required[economy::TOOLS].min(total(v, economy::TOOLS));
    let site = v
        .logistics
        .as_ref()
        .unwrap()
        .stores
        .iter()
        .position(|p| p.owner == Owner::Site(id))
        .unwrap();
    for (i, &required) in required.iter().enumerate() {
        let mut missing =
            required.saturating_sub(v.logistics.as_ref().unwrap().stores[site].items[i]);
        for source in 0..v.logistics.as_ref().unwrap().stores.len() {
            if source == site || !general(v.logistics.as_ref().unwrap().stores[source].owner) {
                continue;
            }
            let n = missing.min(v.logistics.as_ref().unwrap().stores[source].items[i]);
            let s = v.logistics.as_mut().unwrap();
            let lots = freshness::take(&mut s.stores[source].food_lots, i, n);
            freshness::merge(&mut s.stores[site].food_lots, lots);
            s.stores[source].items[i] -= n;
            s.stores[site].items[i] += n;
            missing -= n;
        }
        assert_eq!(
            missing, 0,
            "unit fixture must supply the stage before calling construction directly"
        );
    }
    rebalance(v);
}

#[cfg(test)]
mod tests {
    use super::*;
    fn scene(x: i32, y: i32) -> Game {
        let mut g = Game::new();
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.arrived = true;
            v.minutes = 540.;
            crate::logistics::fixture_stock(&mut v, crate::economy::FOOD, (80.) as u32);
        }
        let mut q = g.app.world_mut().query::<&mut Resident>();
        for mut r in q.iter_mut(g.app.world_mut()) {
            r.task = "idle".into();
            r.activity_store = None;
            r.remaining = 0.;
            r.x = CAMP.0 + (r.id as f32 - 2.) * 1.25;
            r.y = CAMP.1;
            r.target_x = r.x;
            r.target_y = r.y;
            r.hunger = 10.;
            r.social = 90.;
            r.last_meal_slot = 0;
        }
        assert_eq!(g.place("garden", x, y), "ok");
        g
    }
    fn complete(g: &mut Game) -> f32 {
        for n in 0..4000 {
            if g.app.world().resource::<Village>().buildings[0].progress >= 100. {
                return g.app.world().resource::<Village>().minutes;
            }
            g.tick(0.25);
            if n % 40 == 0 {
                let saved = g.snapshot();
                assert!(g.restore(&saved), "invalid hauling checkpoint at tick {n}");
                assert_eq!(g.snapshot(), saved);
            }
        }
        panic!("supplied starter garden did not complete: {}", g.snapshot());
    }
    #[test]
    fn construction_waits_for_located_inputs_and_real_residents_deliver_them() {
        let mut g = scene(13, 15);
        let v = g.app.world().resource::<Village>();
        let opening = total(v, 0);
        assert!(!economy::can_build(v, 0));
        assert_eq!(project_items(v, 0), [0; COUNT]);
        assert!(!economy::build(
            &mut g.app.world_mut().resource_mut::<Village>(),
            0,
            100.
        ));
        let done = complete(&mut g);
        assert!(done < 720.);
        let v = g.app.world().resource::<Village>();
        assert_eq!(total(v, 0), opening - 4);
        assert_eq!(v.wood, total(v, 0) as f32);
        assert!(
            simulation::view(v)["materials"]
                .as_array()
                .unwrap()
                .iter()
                .all(|m| m["difference"] == 0.)
        );
    }
    #[test]
    fn distant_storage_takes_longer_and_a_useful_road_improves_actual_completion() {
        let mut near = scene(13, 15);
        let near_done = complete(&mut near);
        let mut far = scene(20, 20);
        let far_done = complete(&mut far);
        assert!(far_done > near_done + 10.);
        let mut paved = scene(20, 20);
        for x in 7..=21 {
            for y in 11..=21 {
                paved.toggle_road(x, y);
            }
        }
        let paved_done = complete(&mut paved);
        assert!(
            paved_done < far_done,
            "paved {paved_done}, unpaved {far_done}"
        );
    }
    #[test]
    fn interrupted_cargo_is_put_down_once_and_survives_reload() {
        let mut g = scene(20, 20);
        for _ in 0..1000 {
            g.tick(0.25);
            if g.app
                .world()
                .resource::<Village>()
                .logistics
                .as_ref()
                .unwrap()
                .shipments
                .iter()
                .any(|h| h.carrying)
            {
                break;
            }
        }
        let s = g
            .app
            .world()
            .resource::<Village>()
            .logistics
            .as_ref()
            .unwrap();
        let h = s.shipments.iter().find(|h| h.carrying).unwrap().clone();
        let opening: Bundle =
            std::array::from_fn(|i| total(g.app.world().resource::<Village>(), i));
        assert!(g.request(h.resident, "rest", true).contains("lend a hand"));
        g.tick(0.25);
        let v = g.app.world().resource::<Village>();
        assert!(
            !v.logistics
                .as_ref()
                .unwrap()
                .shipments
                .iter()
                .any(|p| p.id == h.id)
        );
        let pile = v
            .logistics
            .as_ref()
            .unwrap()
            .stores
            .iter()
            .find(|p| p.id == h.recovery)
            .unwrap();
        assert_eq!(pile.items[h.material], h.amount);
        assert_eq!(
            &opening[..economy::FOOD],
            &(0..economy::FOOD).map(|i| total(v, i)).collect::<Vec<_>>()[..]
        );
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_eq!(g.snapshot(), saved);
        complete(&mut g);
    }
    #[test]
    fn cancellation_during_a_trip_recovers_every_unspent_item() {
        let mut g = scene(20, 20);
        let opening: Bundle =
            std::array::from_fn(|i| total(g.app.world().resource::<Village>(), i));
        for _ in 0..1000 {
            g.tick(0.25);
            if g.app
                .world()
                .resource::<Village>()
                .logistics
                .as_ref()
                .unwrap()
                .shipments
                .iter()
                .any(|h| h.carrying)
            {
                break;
            }
        }
        assert_eq!(g.cancel_project(0), "ok");
        g.tick(0.25);
        let v = g.app.world().resource::<Village>();
        assert_eq!(
            &opening[..economy::FOOD],
            &(0..economy::FOOD).map(|i| total(v, i)).collect::<Vec<_>>()[..]
        );
        assert!(v.buildings.is_empty());
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_eq!(saved, g.snapshot());
        for _ in 0..1000 {
            g.tick(0.25);
        }
        let v = g.app.world().resource::<Village>();
        assert_eq!(
            &opening[..economy::FOOD],
            &(0..economy::FOOD).map(|i| total(v, i)).collect::<Vec<_>>()[..]
        );
    }
    #[test]
    fn moving_storage_evacuates_before_packing_and_checkpoints_every_stage() {
        let mut g = Game::new();
        g.start_mode("sandbox");
        assert_eq!(g.place("warehouse", 8, 8), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.mode = modes::Mode::Story;
            v.minutes = 540.;
            v.arrived = true;
            let s = v.logistics.as_mut().unwrap();
            let camp = s
                .stores
                .iter()
                .position(|p| p.owner == Owner::Camp)
                .unwrap();
            let warehouse = s
                .stores
                .iter()
                .position(|p| p.owner == Owner::Warehouse(0))
                .unwrap();
            s.stores[camp].items[0] -= 24;
            s.stores[warehouse].items[0] = 24;
        }
        let mut q = g.app.world_mut().query::<&mut Resident>();
        for mut r in q.iter_mut(g.app.world_mut()) {
            r.task = "idle".into();
            r.activity_store = None;
            r.remaining = 0.;
            r.hunger = 10.;
            r.social = 90.;
            r.last_meal_slot = 0;
        }
        assert_eq!(g.queue_building_work(0, "move", 18, 18), "ok");
        assert!(!building_work::work(
            &mut g.app.world_mut().resource_mut::<Village>(),
            0,
            100.
        ));
        let mut packed = false;
        for n in 0..5000 {
            g.tick(0.25);
            let v = g.app.world().resource::<Village>();
            if let Some(job) = v.building_jobs.first() {
                if job.stage == building_work::Stage::Rebuild {
                    packed = true;
                    assert!(!occupied_building(v, 0));
                }
            } else {
                assert!(packed);
                assert_eq!((v.buildings[0].x, v.buildings[0].y), (18, 18));
                assert_eq!(total(v, 0), 100);
                return;
            }
            if n % 20 == 0 {
                let saved = g.snapshot();
                assert!(g.restore(&saved), "move checkpoint {n}");
                assert_eq!(g.snapshot(), saved);
            }
        }
        panic!("storage move did not finish");
    }
    #[test]
    fn a_dropped_load_in_a_narrow_corridor_can_be_recovered() {
        let mut g = Game::new();
        g.start_mode("sandbox");
        assert_eq!(g.place("kitchen", 10, 10), "ok");
        assert_eq!(g.place("garden", 13, 10), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.mode = modes::Mode::Story;
            v.minutes = 540.;
            v.arrived = true;
            crate::logistics::fixture_stock(&mut v, crate::economy::MEALS, 20);
            assert!(navigation::clear(&v, 11., 10.3));
            let id = create(&mut v, Owner::Ground, 11., 10.3, LOAD).unwrap();
            let s = v.logistics.as_mut().unwrap();
            let camp = s
                .stores
                .iter()
                .position(|p| p.owner == Owner::Camp)
                .unwrap();
            let pile = s.stores.iter().position(|p| p.id == id).unwrap();
            s.stores[camp].items[6] -= 6;
            s.stores[pile].items[6] = 6;
        }
        let mut q = g.app.world_mut().query::<&mut Resident>();
        for mut r in q.iter_mut(g.app.world_mut()) {
            r.task = "idle".into();
            r.activity_store = None;
            r.remaining = 0.;
            r.hunger = 10.;
            r.social = 90.;
            r.last_meal_slot = 0;
        }
        for _ in 0..1000 {
            g.tick(0.25);
        }
        let v = g.app.world().resource::<Village>();
        assert_eq!(total(v, 6), 24);
        assert!(
            v.logistics
                .as_ref()
                .unwrap()
                .stores
                .iter()
                .all(|p| p.owner != Owner::Ground || sum(&p.items) == 0)
        );
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_eq!(g.snapshot(), saved);
    }
    #[test]
    fn incoming_orders_keep_their_unloading_space_and_storage_targets_are_atomic() {
        let mut g = Game::new();
        g.start_mode("sandbox");
        assert_eq!(g.place("warehouse", 5, 5), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            for i in 0..COUNT {
                fixture_stock(&mut v, i, 0);
            }
            fixture_stock(&mut v, 0, 580);
        }
        let mut order = [0; COUNT];
        order[2] = 20;
        assert_eq!(
            g.order_supplies(&serde_json::to_string(&order).unwrap()),
            "ok"
        );
        order[2] = 1;
        let before = g.snapshot();
        assert_ne!(
            g.order_supplies(&serde_json::to_string(&order).unwrap()),
            "ok"
        );
        assert_eq!(g.snapshot(), before);
        assert_eq!(room(g.app.world().resource::<Village>(), Owner::Camp), 0);
        let invalid = [u32::MAX; COUNT];
        assert_ne!(
            g.set_storage_target(0, &serde_json::to_string(&invalid).unwrap()),
            "ok"
        );
        assert_eq!(g.snapshot(), before);
        assert_ne!(
            g.set_storage_target(999, &serde_json::to_string(&[0; COUNT]).unwrap()),
            "ok"
        );
        assert_eq!(g.snapshot(), before);
    }
    #[test]
    fn unreachable_storage_reports_a_blocker_and_does_not_trap_workers() {
        let mut g = Game::new();
        g.start_mode("sandbox");
        assert_eq!(g.place("warehouse", 15, 18), "ok");
        for x in [12, 14, 16, 18] {
            for y in [15, 21] {
                assert_eq!(g.place("home", x, y), "ok");
            }
        }
        for x in [12, 18] {
            for y in [17, 19] {
                assert_eq!(g.place("home", x, y), "ok");
            }
        }
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            for i in 0..COUNT {
                fixture_stock(&mut v, i, 0);
            }
            v.mode = modes::Mode::Story;
            v.minutes = 540.;
            v.arrived = true;
            let warehouse = v
                .logistics
                .as_mut()
                .unwrap()
                .stores
                .iter_mut()
                .find(|p| p.owner == Owner::Warehouse(0))
                .unwrap();
            warehouse.items[0] = 4;
            warehouse.items[2] = 4;
            sync_totals(&mut v);
            v.simulation.materials = None;
            simulation::start_materials(&mut v);
        }
        let mut q = g.app.world_mut().query::<&mut Resident>();
        for mut r in q.iter_mut(g.app.world_mut()) {
            r.task = "idle".into();
            r.activity_store = None;
            r.remaining = 0.;
            r.x = 10. + (r.id as f32 - 2.) * 1.25;
            r.y = 13.;
            r.target_x = r.x;
            r.target_y = r.y;
            r.hunger = 10.;
            r.social = 90.;
            r.last_meal_slot = 0;
        }
        assert_eq!(g.place("garden", 20, 5), "ok");
        for _ in 0..120 {
            g.tick(0.25);
        }
        let v = g.app.world().resource::<Village>().clone();
        assert_eq!(v.buildings.last().unwrap().progress, 0.);
        assert!(
            v.logistics
                .as_ref()
                .unwrap()
                .shipments
                .iter()
                .all(|h| h.material >= economy::FOOD)
        );
        assert_eq!(total(&v, 0), 4);
        assert!(
            v.logistics
                .as_ref()
                .unwrap()
                .stores
                .iter()
                .find(|p| matches!(p.owner, Owner::Site(_)))
                .unwrap()
                .blocker
                .is_some()
        );
        let mut q = g.app.world_mut().query::<&Resident>();
        assert!(q.iter(g.app.world()).filter(|r| r.task == "haul").all(|r| {
            v.logistics
                .as_ref()
                .unwrap()
                .shipments
                .iter()
                .any(|h| h.resident == r.id && h.material >= economy::FOOD)
        }));
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_eq!(g.snapshot(), saved);
    }
    #[test]
    fn lowering_a_storage_target_queues_a_return_instead_of_teleporting_goods() {
        let mut g = Game::new();
        g.start_mode("sandbox");
        assert_eq!(g.place("warehouse", 5, 5), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.mode = modes::Mode::Story;
            v.minutes = 540.;
            v.arrived = true;
        }
        let mut q = g.app.world_mut().query::<&mut Resident>();
        for mut r in q.iter_mut(g.app.world_mut()) {
            r.task = "idle".into();
            r.activity_store = None;
            r.remaining = 0.;
            r.hunger = 10.;
            r.social = 90.;
            r.last_meal_slot = 0;
        }
        let mut target = [0; COUNT];
        target[0] = 24;
        assert_eq!(
            g.set_storage_target(0, &serde_json::to_string(&target).unwrap()),
            "ok"
        );
        for _ in 0..2000 {
            g.tick(0.25);
        }
        let in_store = |g: &Game| {
            g.app
                .world()
                .resource::<Village>()
                .logistics
                .as_ref()
                .unwrap()
                .stores
                .iter()
                .find(|p| p.owner == Owner::Warehouse(0))
                .unwrap()
                .items[0]
        };
        assert_eq!(in_store(&g), 24);
        assert_eq!(
            g.set_storage_target(0, &serde_json::to_string(&[0; COUNT]).unwrap()),
            "ok"
        );
        assert_eq!(in_store(&g), 24);
        for _ in 0..4000 {
            g.tick(0.25);
        }
        assert_eq!(in_store(&g), 0);
        assert_eq!(total(g.app.world().resource::<Village>(), 0), 100);
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_eq!(g.snapshot(), saved);
    }
    #[test]
    fn routine_pantry_topups_do_not_starve_bounded_preparation() {
        let mut g = Game::new();
        g.start_mode("sandbox");
        assert_eq!(g.place("workshop", 5, 5), "ok");
        assert_eq!(g.place("garden", 13, 5), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.mode = modes::Mode::Story;
            v.minutes = 540.;
            v.arrived = true;
            crate::logistics::fixture_stock(&mut v, crate::economy::FOOD, (12.) as u32);
            crate::logistics::fixture_stock(&mut v, crate::economy::MEALS, 6);
            fixture_stock(&mut v, 5, 0);
        }
        assert_eq!(g.place("home", 16, 12), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            fixture_stage(&mut v, 2);
            economy::build(&mut v, 2, 100.);
            assert!(supplies::needs_ingredients(&v));
            assert!(!supplies::urgent(&v));
        }
        let mut q = g.app.world_mut().query::<&mut Resident>();
        for mut r in q.iter_mut(g.app.world_mut()) {
            r.task = "idle".into();
            r.activity_store = None;
            r.remaining = 0.;
            r.hunger = 10.;
            r.social = 90.;
            r.last_meal_slot = 0;
        }
        for _ in 0..1800 {
            g.tick(0.25);
        }
        let v = g.app.world().resource::<Village>();
        assert!(v.progress.prepared_batches > 0);
        assert!(v.food >= 0.);
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_eq!(g.snapshot(), saved);
    }
    #[test]
    fn project_and_town_identity_exhaustion_leave_the_world_unchanged() {
        let mut g = Game::new();
        g.app
            .world_mut()
            .resource_mut::<Village>()
            .economy
            .next_building = u32::MAX as usize;
        let before = g.snapshot();
        assert_ne!(g.place("garden", 5, 5), "ok");
        assert_eq!(g.snapshot(), before);
        g.app
            .world_mut()
            .resource_mut::<Village>()
            .economy
            .next_order = u32::MAX;
        let before = g.snapshot();
        let mut items = [0; COUNT];
        items[0] = 1;
        assert_ne!(
            g.order_supplies(&serde_json::to_string(&items).unwrap()),
            "ok"
        );
        assert_eq!(g.snapshot(), before);
    }
    #[test]
    fn a_river_generator_receives_real_cargo_from_the_bank() {
        let mut g = scene(13, 15);
        assert_eq!(g.cancel_project(0), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.progress.completed = [true; 4];
            v.progress.later_completed = [true; progression::LATER_CHAPTERS];
            economy::add(&mut v, 13, 1);
            economy::add(&mut v, 14, 1);
        }
        assert_eq!(g.place("hydro", 26, 5), "ok");
        complete(&mut g);
        let v = g.app.world().resource::<Village>();
        assert_eq!(v.buildings[0].kind, "hydro");
        assert_eq!(v.buildings[0].progress, 100.);
        assert_eq!(total(v, 13), 0);
        assert_eq!(total(v, 14), 0);
        assert!(
            simulation::view(v)["materials"]
                .as_array()
                .unwrap()
                .iter()
                .all(|m| m["difference"] == 0.)
        );
    }
    #[test]
    fn malformed_locations_cargo_and_shared_id_collisions_fail_atomically() {
        let mut g = scene(20, 20);
        g.tick(0.25);
        let saved = g.snapshot();
        for edit in 0..5 {
            let mut bad: serde_json::Value = serde_json::from_str(&saved).unwrap();
            match edit {
                0 => bad["village"]["logistics"]["stores"][0]["items"][0] = u32::MAX.into(),
                1 => bad["village"]["logistics"]["shipments"][0]["amount"] = u32::MAX.into(),
                2 => bad["village"]["logistics"]["shipments"][0]["from"] = 9999.into(),
                3 => {
                    bad["village"]["logistics"]["shipments"][0]["id"] =
                        bad["village"]["logistics"]["stores"][0]["id"].clone()
                }
                _ => bad["village"]["logistics"] = serde_json::Value::Null,
            }
            assert!(!g.restore(&bad.to_string()));
            assert_eq!(g.snapshot(), saved);
        }
    }
    #[test]
    fn hauling_at_a_crowded_corner_keeps_the_next_waypoint_reachable() {
        let mut g = Game::new();
        g.start_mode("sandbox");
        assert_eq!(g.place("garden", 13, 10), "ok");
        let v = g.app.world().resource::<Village>().clone();
        let mut r = g
            .app
            .world_mut()
            .query::<&Resident>()
            .iter(g.app.world())
            .next()
            .unwrap()
            .clone();
        (r.x, r.y) = (11.15, 10.75);
        (r.target_x, r.target_y) = (12., 11.);
        let point = [12., 11.];
        assert!(navigation::segment(&v, [r.x, r.y], point));
        walk(&v, &mut r, &[(1, 11.4, 11.2)], point, 0.25);
        assert!(
            navigation::segment(&v, [r.x, r.y], point),
            "Avoiding a neighbour cannot strand cargo behind a plot corner"
        );
    }
}
