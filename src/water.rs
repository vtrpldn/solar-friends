//! Located fresh water and irrigation. Sealed waste is never ordinary cargo.
use crate::*;
use simulation::Id;
pub const LOAD: f64 = 12.;
const EPS: f64 = 0.000_001;
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Class {
    Fresh,
    Irrigation,
}
impl Class {
    pub fn index(self) -> usize {
        match self {
            Self::Fresh => 0,
            Self::Irrigation => 1,
        }
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "id", rename_all = "snake_case")]
pub enum Owner {
    Camp,
    Building(usize),
    Source(usize),
    Ground,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Tank {
    pub id: Id,
    pub owner: Owner,
    pub x: f32,
    pub y: f32,
    pub capacity: [f64; 2],
    pub water: [f64; 2],
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Trip {
    pub id: Id,
    pub recovery: Id,
    pub resident: usize,
    pub from: Option<Id>,
    pub to: Id,
    pub class: Class,
    pub amount: f64,
    pub carrying: bool,
    pub handling: f32,
    pub pickup: [f32; 2],
    pub dropoff: [f32; 2],
}
#[derive(Clone, Default, Serialize, Deserialize)]
pub struct State {
    pub schema: u32,
    pub tanks: Vec<Tank>,
    pub trips: Vec<Trip>,
    pub opening: [f64; 2],
    pub received: [f64; 2],
    pub consumed: [f64; 2],
}
fn caps(kind: &str) -> Option<[f64; 2]> {
    Some(match kind {
        "well" => [75., 0.],
        "home" => [8., 0.],
        "kitchen" => [6., 0.],
        "eco_toilet" => [8., 0.],
        "garden" | "greenhouse" => [4., 4.],
        "wetland" => [0., 60.],
        _ => return None,
    })
}
pub fn tank(v: &Village, id: Id) -> Option<&Tank> {
    v.water_supply.tanks.iter().find(|p| p.id == id)
}
pub(crate) fn owner_tank(v: &Village, owner: Owner) -> Option<&Tank> {
    v.water_supply.tanks.iter().find(|p| p.owner == owner)
}
fn wanted(v: &Village) -> Vec<(Owner, f32, f32, [f64; 2])> {
    let mut out = vec![(Owner::Camp, CAMP.0, CAMP.1, [40., 60.])];
    out.extend(v.buildings.iter().filter_map(|b| {
        if b.progress < 100. && building_work::original_progress(v, b.id) != Some(100.) {
            return None;
        }
        Some((
            Owner::Building(b.id),
            b.x as f32,
            b.y as f32,
            caps(&b.kind)?,
        ))
    }));
    out.extend(
        v.economy
            .sources
            .iter()
            .enumerate()
            .filter(|(_, s)| s.active && s.material < 2)
            .map(|(i, s)| (Owner::Source(i), s.x as f32, s.y as f32, [4., 4.])),
    );
    out
}
fn incoming(v: &Village, id: Id, class: Class) -> f64 {
    v.water_supply
        .trips
        .iter()
        .filter(|h| h.to == id && h.class == class)
        .map(|h| h.amount)
        .sum()
}
fn claimed(v: &Village, id: Id, class: Class, except: Option<usize>) -> f64 {
    v.water_supply
        .trips
        .iter()
        .filter(|h| {
            h.from == Some(id) && !h.carrying && h.class == class && Some(h.resident) != except
        })
        .map(|h| h.amount)
        .sum()
}
pub(crate) fn free(v: &Village, p: &Tank, class: Class, except: Option<usize>) -> f64 {
    (p.water[class.index()] - claimed(v, p.id, class, except)).max(0.)
}
pub(crate) fn room(v: &Village, p: &Tank, class: Class) -> f64 {
    (p.capacity[class.index()] - p.water[class.index()] - incoming(v, p.id, class)).max(0.)
}
pub(crate) fn open(v: &Village, p: &Tank) -> bool {
    match p.owner {
        Owner::Building(id) => {
            v.buildings.iter().any(|b| b.id == id && b.progress >= 100.)
                && building_work::job(v, id).is_none()
        }
        Owner::Source(i) => v
            .economy
            .sources
            .get(i)
            .is_some_and(|s| s.active && s.material < 2),
        _ => true,
    }
}
pub fn total(v: &Village, class: Class) -> f64 {
    v.water_supply
        .tanks
        .iter()
        .map(|p| p.water[class.index()])
        .sum::<f64>()
        + v.water_supply
            .trips
            .iter()
            .filter(|h| h.carrying && h.class == class)
            .map(|h| h.amount)
            .sum::<f64>()
}
pub fn summaries(v: &mut Village) {
    v.water = total(v, Class::Fresh) as f32;
    v.circular.reclaimed = total(v, Class::Irrigation) as f32;
}
pub fn capacity(v: &Village) -> f32 {
    if v.water_supply.schema == 0 {
        40. + 75.
            * v.buildings
                .iter()
                .filter(|b| b.kind == "well" && b.progress >= 100.)
                .count() as f32
    } else {
        v.water_supply
            .tanks
            .iter()
            .map(|p| p.capacity[0])
            .sum::<f64>() as f32
    }
}
pub fn sync(v: &mut Village) {
    if v.water_supply.schema != 1 {
        return;
    }
    let wanted = wanted(v);
    let retire: Vec<_> = v
        .water_supply
        .tanks
        .iter()
        .filter(|p| {
            p.owner != Owner::Ground
                && !wanted
                    .iter()
                    .any(|w| w.0 == p.owner && w.1 == p.x && w.2 == p.y)
        })
        .map(|p| p.id)
        .collect();
    for id in retire {
        let n = [
            incoming(v, id, Class::Fresh),
            incoming(v, id, Class::Irrigation),
        ];
        let p = v
            .water_supply
            .tanks
            .iter_mut()
            .find(|p| p.id == id)
            .unwrap();
        p.owner = Owner::Ground;
        p.capacity = std::array::from_fn(|i| p.water[i] + n[i]);
    }
    for (owner, x, y, capacity) in wanted {
        if !v.water_supply.tanks.iter().any(|p| p.owner == owner)
            && let Some(id) = v.simulation.allocate()
        {
            v.water_supply.tanks.push(Tank {
                id,
                owner,
                x,
                y,
                capacity,
                water: [0.; 2],
            });
        }
    }
    let referenced: Vec<_> = v
        .water_supply
        .trips
        .iter()
        .flat_map(|h| h.from.into_iter().chain([h.to, h.recovery]))
        .collect();
    v.water_supply.tanks.retain(|p| {
        p.owner != Owner::Ground || p.water.iter().any(|n| *n > 0.) || referenced.contains(&p.id)
    });
    summaries(v);
}
pub fn initialise(v: &mut Village) -> bool {
    let amounts = [f64::from(v.water), f64::from(v.circular.reclaimed)];
    if amounts
        .iter()
        .any(|n| !n.is_finite() || *n < 0. || *n > 150000.)
    {
        return false;
    }
    v.water_supply = State {
        schema: 1,
        opening: amounts,
        ..State::default()
    };
    sync(v);
    for class in [Class::Fresh, Class::Irrigation] {
        let mut left = amounts[class.index()];
        // Authored scenes can explicitly stage already supplied consumer buffers.
        // New playable buildings always receive empty containers through sync.
        if class == Class::Fresh {
            for p in &mut v.water_supply.tanks {
                if !matches!(p.owner, Owner::Camp | Owner::Ground) && p.capacity[0] < 75. {
                    let n = left.min(p.capacity[0].min(4.));
                    p.water[0] = n;
                    left -= n;
                }
            }
        }
        for p in &mut v.water_supply.tanks {
            let n = left.min(p.capacity[class.index()] - p.water[class.index()]);
            p.water[class.index()] += n;
            left -= n;
        }
        while left > EPS {
            // Explicit authored/test supplies beyond fixed containers remain
            // in real, separate arrival barrels rather than a shared counter.
            let Some(id) = v.simulation.allocate() else {
                return false;
            };
            let amount = left.min(if class == Class::Fresh { 75. } else { 60. });
            let mut contents = [0.; 2];
            contents[class.index()] = amount;
            v.water_supply.tanks.push(Tank {
                id,
                owner: Owner::Ground,
                x: CAMP.0 + 0.7,
                y: CAMP.1,
                capacity: contents,
                water: contents,
            });
            left -= amount;
        }
    }
    summaries(v);
    true
}
pub fn available(v: &Village, owner: Owner, class: Class) -> f32 {
    owner_tank(v, owner)
        .filter(|p| open(v, p))
        .map_or(0., |p| free(v, p, class, None) as f32)
}
pub fn irrigation(v: &Village, owner: Owner) -> f32 {
    let n = available(v, owner, Class::Irrigation);
    if n >= 2. {
        n
    } else {
        available(v, owner, Class::Fresh)
    }
}
pub fn draw(v: &mut Village, owner: Owner, class: Class, amount: f64) -> f64 {
    let Some(id) = owner_tank(v, owner).filter(|p| open(v, p)).map(|p| p.id) else {
        return 0.;
    };
    let n = amount
        .max(0.)
        .min(free(v, tank(v, id).unwrap(), class, None));
    v.water_supply
        .tanks
        .iter_mut()
        .find(|p| p.id == id)
        .unwrap()
        .water[class.index()] -= n;
    v.water_supply.consumed[class.index()] += n;
    summaries(v);
    n
}
pub fn irrigate(v: &mut Village, owner: Owner) -> bool {
    let class = if available(v, owner, Class::Irrigation) >= 2. {
        Class::Irrigation
    } else {
        Class::Fresh
    };
    if available(v, owner, class) < 2. {
        return false;
    }
    draw(v, owner, class, 2.);
    if class == Class::Irrigation {
        v.progress.reclaimed_irrigation = true;
    }
    true
}
pub fn add(v: &mut Village, owner: Owner, class: Class, amount: f64) -> f64 {
    sync(v);
    let Some(id) = owner_tank(v, owner).map(|p| p.id) else {
        return 0.;
    };
    let n = amount.max(0.).min(room(v, tank(v, id).unwrap(), class));
    v.water_supply
        .tanks
        .iter_mut()
        .find(|p| p.id == id)
        .unwrap()
        .water[class.index()] += n;
    v.water_supply.received[class.index()] += n;
    summaries(v);
    n
}
pub fn rain(v: &mut Village, minutes: f32) {
    sync(v);
    if !ecology::raining(v.minutes) {
        return;
    }
    let ids: Vec<_> = v
        .buildings
        .iter()
        .filter(|b| b.kind == "well" && b.progress >= 100. && building_work::job(v, b.id).is_none())
        .map(|b| b.id)
        .collect();
    for id in ids {
        if add(
            v,
            Owner::Building(id),
            Class::Fresh,
            f64::from(minutes) * 0.3,
        ) > 0.
        {
            v.progress.rain_caught = true;
        }
    }
}
pub fn replenish(v: &mut Village) {
    sync(v);
    let tanks = v.water_supply.tanks.clone();
    for p in tanks {
        if p.owner != Owner::Ground && p.capacity[0] > 0. {
            let n = room(v, &p, Class::Fresh);
            if n > 0. {
                add(v, p.owner, Class::Fresh, n);
            }
        }
    }
}
fn demand(v: &Village, p: &Tank) -> (f64, bool, f32) {
    if !open(v, p) {
        return (0., false, 0.);
    }
    match p.owner {
        Owner::Camp => {
            // Arrival barrels serve neighbours without a home. Once everyone
            // is housed, refill their actual household buffers instead of
            // shuttling a reserve into an unused camp and back out again.
            let people = if pipes::uses_camp(v) {
                5
            } else {
                (0..5).filter(|&r| shelter(v, r).is_none()).count()
            };
            let essential = people as f64 * 2.4;
            (
                people as f64 * 8.,
                false,
                if p.water[0] + incoming(v, p.id, Class::Fresh) < essential {
                    1100.
                } else {
                    140.
                },
            )
        }
        Owner::Building(id) => match v
            .buildings
            .iter()
            .find(|b| b.id == id)
            .map(|b| b.kind.as_str())
        {
            Some("kitchen") => (6., false, if p.water[0] < 1. { 1080. } else { 260. }),
            Some("eco_toilet") => (8., false, if p.water[0] < 1. { 1050. } else { 200. }),
            Some("home") => {
                let people = (0..5)
                    .filter(|&r| shelter(v, r).is_some_and(|b| b.id == id))
                    .count();
                (
                    if people > 0 { 8. } else { 0. },
                    false,
                    if p.water[0] < 1. { 600. } else { 180. },
                )
            }
            Some("garden" | "greenhouse") => (
                4.,
                true,
                if p.water.iter().copied().fold(0., f64::max) < 2. {
                    850.
                } else {
                    240.
                },
            ),
            _ => (0., false, 0.),
        },
        Owner::Source(_) => (
            4.,
            true,
            if p.water.iter().copied().fold(0., f64::max) < 2. {
                740.
            } else {
                220.
            },
        ),
        Owner::Ground => (0., false, 0.),
    }
}
fn surplus(v: &Village, p: &Tank, class: Class, except: Option<usize>) -> f64 {
    let reserve = match p.owner {
        Owner::Camp | Owner::Ground => 0.,
        Owner::Building(id)
            if v.buildings
                .iter()
                .any(|b| b.id == id && matches!(b.kind.as_str(), "well" | "wetland")) =>
        {
            0.
        }
        _ => demand(v, p).0,
    };
    (free(v, p, class, except) - reserve).max(0.)
}
fn deficit(v: &Village, p: &Tank) -> Option<(f64, bool, f32)> {
    let (desired, irrigation, urgency) = demand(v, p);
    if desired <= 0. {
        return None;
    }
    let fresh = p.water[0] + incoming(v, p.id, Class::Fresh);
    let used_irrigation = if irrigation {
        p.water[1] + incoming(v, p.id, Class::Irrigation)
    } else {
        0.
    };
    let low = if p.owner == Owner::Camp {
        desired * 0.8
    } else {
        2.
    };
    // A low-water trigger and a larger refill target prevent repeated tiny
    // trips. Incoming loads already own their receiving space and satisfy it.
    if fresh.max(used_irrigation) >= low {
        return None;
    }
    let missing = desired - fresh - used_irrigation;
    (missing > EPS).then_some((missing, irrigation, urgency))
}
pub fn has_work(v: &Village) -> bool {
    !v.water_supply.trips.is_empty() || v.water_supply.tanks.iter().any(|p| deficit(v, p).is_some())
}
pub fn approach(v: &Village, p: &Tank, resident: usize) -> Option<[f32; 2]> {
    match p.owner {
        Owner::Building(id) => {
            spacing::approach(v, v.buildings.iter().find(|b| b.id == id)?, resident)
                .map(|p| [p.0, p.1])
        }
        Owner::Source(i) => {
            let s = v.economy.sources.get(i)?;
            spacing::material_spot(v, s.x as f32, s.y as f32, resident).map(|p| [p.0, p.1])
        }
        Owner::Ground if navigation::clear(v, p.x, p.y) => Some([p.x, p.y]),
        _ => spacing::material_spot(v, p.x, p.y, resident).map(|p| [p.0, p.1]),
    }
}
fn tap(v: &Village, resident: usize) -> Option<[f32; 2]> {
    for offset in 0..=10 {
        for sign in [1., -1.] {
            let p = [
                1.,
                13. + (resident as f32 - 2.) * 0.65 + offset as f32 * sign,
            ];
            if navigation::clear(v, p[0], p[1]) && spacing::free_spot(v, (p[0], p[1]), resident) {
                return Some(p);
            }
        }
    }
    None
}
fn near(p: &Tank, point: [f32; 2]) -> bool {
    (point[0] - p.x).hypot(point[1] - p.y) <= 3.51
}
#[derive(Clone)]
pub struct Quote {
    pub from: Option<Id>,
    pub to: Id,
    pub class: Class,
    pub amount: f64,
    pub pickup: [f32; 2],
    pub dropoff: [f32; 2],
    pub minutes: f32,
    pub urgency: f32,
}
pub fn quote(v: &Village, r: &Resident) -> Option<Quote> {
    if let Some(h) = v.water_supply.trips.iter().find(|h| h.resident == r.id) {
        return Some(Quote {
            from: h.from,
            to: h.to,
            class: h.class,
            amount: h.amount,
            pickup: h.pickup,
            dropoff: h.dropoff,
            minutes: 0.,
            urgency: 1000.,
        });
    }
    let mut options = vec![];
    for to in &v.water_supply.tanks {
        let Some((missing, irrigation, urgency)) = deficit(v, to) else {
            continue;
        };
        let minimum = if irrigation && to.water[0].max(to.water[1]) < 2. {
            EPS
        } else {
            1. - EPS
        };
        if missing < minimum {
            continue;
        }
        let Some(dropoff) = approach(v, to, r.id) else {
            continue;
        };
        let mut supplied = false;
        for class in [Class::Irrigation, Class::Fresh] {
            if class == Class::Fresh
                && options
                    .iter()
                    .any(|q: &Quote| q.to == to.id && q.class == Class::Irrigation)
            {
                continue;
            }
            if class == Class::Irrigation && !irrigation {
                continue;
            }
            for from in v
                .water_supply
                .tanks
                .iter()
                .filter(|p| p.id != to.id && open(v, p))
            {
                let amount = missing
                    .min(LOAD)
                    .min(surplus(v, from, class, None))
                    .min(room(v, to, class));
                if amount
                    < if from.owner == Owner::Ground {
                        EPS
                    } else {
                        minimum
                    }
                {
                    continue;
                }
                let Some(pickup) = approach(v, from, r.id) else {
                    continue;
                };
                let Ok((first, _)) = navigation::work_route(v, [r.x, r.y], pickup) else {
                    continue;
                };
                let Ok(last) = navigation::route(v, pickup, dropoff) else {
                    continue;
                };
                supplied = true;
                options.push(Quote {
                    from: Some(from.id),
                    to: to.id,
                    class,
                    amount,
                    pickup,
                    dropoff,
                    minutes: first.minutes + last.minutes + 6.,
                    urgency: urgency + if class == Class::Irrigation { 25. } else { 0. },
                });
            }
        }
        if !supplied && to.capacity[0] > 0. {
            let Some(pickup) = tap(v, r.id) else {
                continue;
            };
            let Ok((first, _)) = navigation::work_route(v, [r.x, r.y], pickup) else {
                continue;
            };
            let Ok(last) = navigation::route(v, pickup, dropoff) else {
                continue;
            };
            let amount = missing.min(LOAD).min(room(v, to, Class::Fresh));
            if amount >= minimum {
                options.push(Quote {
                    from: None,
                    to: to.id,
                    class: Class::Fresh,
                    amount,
                    pickup,
                    dropoff,
                    minutes: first.minutes + last.minutes + 6.,
                    urgency,
                });
            }
        }
    }
    options.sort_by(|a, b| {
        (b.urgency - b.minutes * 1.5)
            .total_cmp(&(a.urgency - a.minutes * 1.5))
            .then(a.to.0.cmp(&b.to.0))
            .then(a.from.map(|id| id.0).cmp(&b.from.map(|id| id.0)))
    });
    options.into_iter().next()
}
pub fn target(v: &Village, r: &Resident) -> Result<[f32; 2], &'static str> {
    if let Some(h) = v.water_supply.trips.iter().find(|h| h.resident == r.id) {
        return Ok(if h.carrying { h.dropoff } else { h.pickup });
    }
    quote(v, r)
        .map(|q| q.pickup)
        .ok_or("No water delivery has a clear route and receiving room.")
}
pub fn assign_target(v: &Village, r: &mut Resident) -> bool {
    let Ok(p) = target(v, r) else {
        return false;
    };
    r.activity_building = None;
    r.activity_batch = None;
    r.activity_store = None;
    r.activity_material = None;
    (r.target_x, r.target_y) = (p[0], p[1]);
    true
}
pub fn interrupt(v: &mut Village, r: &Resident) {
    let Some(i) = v.water_supply.trips.iter().position(|h| h.resident == r.id) else {
        return;
    };
    let h = v.water_supply.trips.remove(i);
    if h.carrying {
        // A separate, reserved recovery identity survives even when no new
        // identities remain. Putting down liquid creates no supply receipt.
        let mut water = [0.; 2];
        water[h.class.index()] = h.amount;
        let p = v
            .water_supply
            .tanks
            .iter_mut()
            .find(|p| p.id == h.recovery)
            .unwrap();
        p.x = r.x.clamp(0.3, 27.7);
        p.y = r.y.clamp(0.3, 27.7);
        p.capacity = water;
        p.water = water;
    }
    summaries(v);
}
pub fn advance(
    v: &mut Village,
    r: &mut Resident,
    neighbours: &[(usize, f32, f32)],
    dt: f32,
) -> bool {
    if r.task != "water" {
        interrupt(v, r);
        return false;
    }
    if !v.water_supply.trips.iter().any(|h| h.resident == r.id) {
        let Some(q) = quote(v, r) else {
            r.remaining = 0.;
            return true;
        };
        if v.simulation.next_id.checked_add(2).is_none() {
            r.remaining = 0.;
            return true;
        }
        let Some(id) = v.simulation.allocate() else {
            r.remaining = 0.;
            return true;
        };
        let recovery = v.simulation.allocate().unwrap();
        v.water_supply.tanks.push(Tank {
            id: recovery,
            owner: Owner::Ground,
            x: r.x.clamp(0.3, 27.7),
            y: r.y.clamp(0.3, 27.7),
            capacity: [0.; 2],
            water: [0.; 2],
        });
        v.water_supply.trips.push(Trip {
            id,
            recovery,
            resident: r.id,
            from: q.from,
            to: q.to,
            class: q.class,
            amount: q.amount,
            carrying: false,
            handling: 3.,
            pickup: q.pickup,
            dropoff: q.dropoff,
        });
        walking::clear(r);
    }
    let h = v
        .water_supply
        .trips
        .iter()
        .find(|h| h.resident == r.id)
        .unwrap()
        .clone();
    if tank(v, h.to).is_none_or(|p| !open(v, p))
        || !h.carrying
            && h.from
                .is_some_and(|id| tank(v, id).is_none_or(|p| !open(v, p)))
    {
        interrupt(v, r);
        r.remaining = 0.;
        return true;
    }
    let mut p = if h.carrying { h.dropoff } else { h.pickup };
    if !navigation::clear(v, p[0], p[1]) {
        let next = if h.carrying {
            tank(v, h.to).and_then(|t| approach(v, t, r.id))
        } else if let Some(id) = h.from {
            tank(v, id).and_then(|t| approach(v, t, r.id))
        } else {
            tap(v, r.id)
        };
        let Some(next) = next else {
            interrupt(v, r);
            r.remaining = 0.;
            return true;
        };
        p = next;
        let row = v
            .water_supply
            .trips
            .iter_mut()
            .find(|h| h.resident == r.id)
            .unwrap();
        if h.carrying {
            row.dropoff = p;
        } else {
            row.pickup = p;
        }
        walking::clear(r);
    }
    (r.target_x, r.target_y) = (p[0], p[1]);
    r.remaining = 10.;
    r.reason = if h.carrying {
        if h.class == Class::Fresh {
            "Carrying fresh water to its local container."
        } else {
            "Carrying reclaimed irrigation to a growing plot."
        }
    } else if h.from.is_none() {
        "Collecting treated water at the neighbouring farm's tap."
    } else {
        "Collecting a water load from its actual container."
    }
    .into();
    if walking::advance(v, r, neighbours, dt) {
        if r.task != "water" {
            interrupt(v, r);
        }
        return true;
    }
    if (r.x - p[0]).hypot(r.y - p[1]) > 0.08 {
        return true;
    }
    let row = v
        .water_supply
        .trips
        .iter_mut()
        .find(|h| h.resident == r.id)
        .unwrap();
    row.handling = (row.handling - dt * MINUTES_PER_SECOND).max(0.);
    if row.handling > 0. {
        return true;
    }
    if !h.carrying {
        if let Some(id) = h.from {
            if tank(v, id).is_none_or(|p| free(v, p, h.class, Some(r.id)) + EPS < h.amount) {
                interrupt(v, r);
                r.remaining = 0.;
                return true;
            }
            v.water_supply
                .tanks
                .iter_mut()
                .find(|p| p.id == id)
                .unwrap()
                .water[h.class.index()] -= h.amount;
        } else {
            v.water_supply.received[h.class.index()] += h.amount;
        }
        let row = v
            .water_supply
            .trips
            .iter_mut()
            .find(|h| h.resident == r.id)
            .unwrap();
        row.carrying = true;
        row.handling = 3.;
        r.reason = if h.class == Class::Fresh {
            "Carrying fresh water to its local container."
        } else {
            "Carrying reclaimed irrigation to a growing plot."
        }
        .into();
        (r.target_x, r.target_y) = (h.dropoff[0], h.dropoff[1]);
        walking::clear(r);
    } else {
        let p = v
            .water_supply
            .tanks
            .iter_mut()
            .find(|p| p.id == h.to)
            .unwrap();
        p.water[h.class.index()] += h.amount;
        v.water_supply.trips.retain(|p| p.resident != r.id);
        r.remaining = 0.;
        walking::clear(r);
        requests::completed_batch(r, v, true);
    }
    summaries(v);
    true
}
pub fn valid(v: &Village, residents: &[Resident]) -> bool {
    let s = &v.water_supply;
    if v.version == 3 {
        return s.schema == 0 && s.tanks.is_empty() && s.trips.is_empty();
    }
    if s.schema != 1 || s.tanks.len() > 2048 || s.trips.len() > 5 {
        return false;
    }
    let mut owners = vec![];
    let expected = wanted(v);
    for p in &s.tanks {
        if p.id.0 == 0
            || p.id.0 >= v.simulation.next_id
            || ![p.x, p.y]
                .iter()
                .all(|x| x.is_finite() && (0.3..=27.7).contains(x))
            || p.capacity
                .iter()
                .chain(&p.water)
                .any(|x| !x.is_finite() || *x < 0.)
            || p.capacity[0] > 75.
            || p.capacity[1] > 60.
            || (0..2).any(|i| p.water[i] > p.capacity[i] + EPS)
        {
            return false;
        }
        if p.owner != Owner::Ground {
            if owners.contains(&p.owner)
                || !expected
                    .iter()
                    .any(|w| w.0 == p.owner && w.1 == p.x && w.2 == p.y && w.3 == p.capacity)
            {
                return false;
            }
            owners.push(p.owner);
        }
        for class in [Class::Fresh, Class::Irrigation] {
            if claimed(v, p.id, class, None) > p.water[class.index()] + EPS
                || p.water[class.index()] + incoming(v, p.id, class)
                    > p.capacity[class.index()] + EPS
            {
                return false;
            }
        }
    }
    if expected.iter().any(|w| !owners.contains(&w.0)) {
        return false;
    }
    let mut workers = vec![];
    let mut recoveries = vec![];
    for h in &s.trips {
        if h.id.0 == 0
            || h.id.0 >= v.simulation.next_id
            || h.resident >= 5
            || workers.contains(&h.resident)
            || recoveries.contains(&h.recovery)
            || tank(v, h.recovery).is_none_or(|p| {
                p.owner != Owner::Ground || p.water != [0.; 2] || p.capacity != [0.; 2]
            })
            || h.from == Some(h.recovery)
            || h.to == h.recovery
            || !h.amount.is_finite()
            || h.amount <= 0.
            || h.amount > LOAD
            || !h.handling.is_finite()
            || !(0.0..=3.).contains(&h.handling)
            || h.pickup
                .iter()
                .chain(&h.dropoff)
                .any(|x| !x.is_finite() || !(0.3..=27.7).contains(x))
            || tank(v, h.to).is_none()
            || tank(v, h.to).is_some_and(|p| !near(p, h.dropoff))
            || h.from == Some(h.to)
            || h.from.is_some_and(|id| tank(v, id).is_none())
            || h.from
                .and_then(|id| tank(v, id))
                .is_some_and(|p| !near(p, h.pickup))
            || h.from.is_none()
                && (h.pickup[0] != 1.
                    || (h.pickup[1] - (13. + (h.resident as f32 - 2.) * 0.65)).abs() > 10.001)
            || h.from.is_none() && h.class != Class::Fresh
            || !residents.iter().any(|r| {
                r.id == h.resident && r.task == "water" && r.trip.is_none() && r.remaining > 0.
            })
        {
            return false;
        }
        workers.push(h.resident);
        recoveries.push(h.recovery);
    }
    for class in [Class::Fresh, Class::Irrigation] {
        let i = class.index();
        if [s.opening[i], s.received[i], s.consumed[i]]
            .iter()
            .any(|x| !x.is_finite() || !(0.0..=1e9).contains(x))
            || (s.opening[i] + s.received[i] - s.consumed[i] - total(v, class)).abs() > 0.001
        {
            return false;
        }
    }
    v.water == total(v, Class::Fresh) as f32
        && v.circular.reclaimed == total(v, Class::Irrigation) as f32
}
pub fn view(v: &Village) -> serde_json::Value {
    serde_json::json!({"tanks":v.water_supply.tanks,"trips":v.water_supply.trips,"opening":v.water_supply.opening,"received":v.water_supply.received,"consumed":v.water_supply.consumed,"present":[total(v,Class::Fresh),total(v,Class::Irrigation)],"capacity":capacity(v),"load":LOAD,"note":"Fresh water and irrigation are separate local stores. A neighbour must collect and deliver a load before its destination can use it. The manual fallback is treated water from the neighbouring farm's tap."})
}
#[wasm_bindgen]
impl Game {
    pub fn water_report(&self) -> String {
        view(self.app.world().resource::<Village>()).to_string()
    }
}
#[cfg(test)]
pub fn fixture(v: &mut Village, fresh: f32, irrigation: f32) {
    v.water = fresh;
    v.circular.reclaimed = irrigation;
    assert!(initialise(v));
}

#[cfg(test)]
pub fn fixture_fresh(v: &mut Village, fresh: f32) {
    let irrigation = v.circular.reclaimed;
    fixture(v, fresh, irrigation);
}
#[cfg(test)]
pub fn fixture_irrigation(v: &mut Village, irrigation: f32) {
    let fresh = v.water;
    fixture(v, fresh, irrigation);
}
#[cfg(test)]
pub fn fixture_at(v: &mut Village, owner: Owner, class: Class, amount: f64) {
    sync(v);
    if !v.water_supply.trips.is_empty() {
        let fresh = v.water;
        let irrigation = v.circular.reclaimed;
        fixture(v, fresh, irrigation);
    }
    let id = owner_tank(v, owner).unwrap().id;
    let p = tank(v, id).unwrap();
    assert!(amount <= p.capacity[class.index()]);
    if p.water[class.index()] >= amount {
        return;
    }
    let mut needed = (amount - p.water[class.index()]).max(0.);
    for p in &mut v.water_supply.tanks {
        if p.id != id {
            let n = needed.min(p.water[class.index()]);
            p.water[class.index()] -= n;
            needed -= n;
        }
    }
    assert!(
        needed <= EPS,
        "Stage an owned water supply before filling a fixture's local container."
    );
    v.water_supply
        .tanks
        .iter_mut()
        .find(|p| p.id == id)
        .unwrap()
        .water[class.index()] = amount;
    summaries(v);
}

#[cfg(test)]
mod tests;
