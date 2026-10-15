//! Project-led sourcing and a local town economy. All transactions live here.
use crate::{Game, Village, event, ready};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

pub const COUNT: usize = 19;
pub const FOOD: usize = 16;
pub const MEALS: usize = 17;
pub const EGGS: usize = 18;
pub const TOOLS: usize = 15;
pub const CAPACITY: u32 = 600;
pub const NAMES: [&str; COUNT] = [
    "timber",
    "bamboo",
    "earth",
    "stone",
    "salvage",
    "frames",
    "walls",
    "tiles",
    "fittings",
    "plumbing",
    "electrical",
    "covering",
    "panels",
    "batteries",
    "pumps",
    "tools",
    "food",
    "meals",
    "eggs",
];
const LABELS: [&str; COUNT] = [
    "Timber",
    "Bamboo",
    "Building earth",
    "Stone",
    "Reclaimed parts",
    "Frames",
    "Wall material",
    "Roof tiles",
    "Fittings",
    "Plumbing supplies",
    "Electrical supplies",
    "Greenhouse covering",
    "Solar panels",
    "Battery equipment",
    "Pump",
    "Tool supplies",
    "Ingredients",
    "Prepared meals",
    "Eggs",
];
const PRICES: [i64; COUNT] = [
    700, 400, 150, 350, 500, 1800, 500, 900, 1200, 2400, 3600, 8000, 28000, 42000, 16000, 900, 400,
    800, 300,
];
pub type Bundle = [u32; COUNT];
#[derive(Clone, Serialize, Deserialize)]
pub struct Project {
    pub building: usize,
    pub recipe: String,
    #[serde(default)]
    pub appearance: Option<u8>,
    pub priority: u32,
    pub paused: bool,
    pub stage: usize,
    pub labour: f32,
    pub committed: bool,
    pub reserved: Bundle,
    pub consumed: Bundle,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Order {
    pub id: u32,
    pub items: Bundle,
    pub paid: i64,
    pub dispatch: f32,
    pub arrival: f32,
    pub status: String,
    #[serde(default)]
    pub pickup_by: Option<usize>,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Source {
    pub material: usize,
    pub x: i32,
    pub y: i32,
    pub remaining: f32,
    pub maximum: f32,
    pub restored: bool,
    pub player_placed: bool,
    pub active: bool,
    pub growth: f32,
    pub moisture: f32,
    pub planted: bool,
    pub auto_replant: bool,
    pub auto_harvest: bool,
    pub harvest_requested: bool,
    pub plant_requested: bool,
    pub harvests: u32,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Entry {
    pub minute: f32,
    pub amount: i64,
    pub note: String,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Economy {
    // Validated summary of located ownership. Timber is mirrored in Village.wood; stock[0] stays zero.
    pub stock: Bundle,
    pub money: i64,
    pub ledger: Vec<Entry>,
    pub projects: Vec<Project>,
    pub orders: Vec<Order>,
    pub sources: Vec<Source>,
    #[serde(default = "crate::resource_sites::default_land")]
    pub land: [f32; 3],
    pub next_building: usize,
    pub next_order: u32,
    #[serde(default, skip_serializing)]
    pub outside_work: bool,
    #[serde(default)]
    pub outside_jobs: [bool; 5],
    #[serde(default = "uncommitted_days")]
    pub outside_committed_days: [i32; 5],
    #[serde(default = "uncommitted_day", skip_serializing)]
    pub outside_committed_day: i32,
    pub work_day: [i32; 5],
    pub exchange_day: i32,
    pub last_delivery: f32,
}
fn uncommitted_days() -> [i32; 5] {
    [-1; 5]
}
fn uncommitted_day() -> i32 {
    -1
}

impl Default for Economy {
    fn default() -> Self {
        Self {
            stock: [
                0, 12, 36, 18, 4, 8, 12, 14, 10, 5, 2, 0, 0, 0, 0, 0, 36, 0, 0,
            ],
            money: 300000,
            ledger: vec![Entry {
                minute: 480.,
                amount: 300000,
                note: "Founders' pooled savings".into(),
            }],
            projects: vec![],
            orders: vec![],
            sources: vec![],
            land: crate::resource_sites::LAND,
            next_building: 0,
            next_order: 0,
            outside_work: false,
            outside_jobs: [false; 5],
            outside_committed_days: [-1; 5],
            outside_committed_day: -1,
            work_day: [-1; 5],
            exchange_day: -1,
            last_delivery: 0.,
        }
    }
}
#[derive(Clone, Serialize)]
pub struct Stage {
    pub name: &'static str,
    pub items: Bundle,
    pub work: f32,
}
fn bundle(items: &[(usize, u32)]) -> Bundle {
    let mut b = [0; COUNT];
    for &(i, n) in items {
        b[i] = n;
    }
    b
}
fn stage(name: &'static str, items: &[(usize, u32)], work: f32) -> Stage {
    Stage {
        name,
        items: bundle(items),
        work,
    }
}
pub fn recipe(kind: &str, variant: &str) -> Option<Vec<Stage>> {
    if kind == "home" && variant == "adobe" {
        return Some(vec![
            stage("Stone foundation", &[(2, 6), (3, 4)], 12.),
            stage(
                "Dry adobe bricks & bamboo frame",
                &[(2, 16), (1, 8), (8, 2)],
                32.,
            ),
            stage("Roof & joinery", &[(7, 6), (8, 2)], 18.),
            stage("Rooftop power", &[(12, 1), (13, 1), (10, 1)], 8.),
        ]);
    }
    if !matches!(variant, "standard" | "local") {
        return None;
    }
    let local = variant == "local";
    let frame = if local { (1, 8) } else { (5, 4) };
    Some(match kind {
        "home" => vec![
            stage("Foundation", &[(2, 6), (3, 4)], 12.),
            stage("Structure", &[frame, (6, 6)], 22.),
            stage("Roof & fittings", &[(7, 6), (8, 2)], 18.),
            stage("Rooftop power", &[(12, 1), (13, 1), (10, 1)], 8.),
        ],
        "garden" => vec![stage(
            "Prepare the bed",
            &[(2, 4), if local { (3, 4) } else { (0, 4) }],
            16.,
        )],
        "greenhouse" => vec![
            stage("Foundation", &[(3, 4), (2, 2)], 12.),
            stage("Frame", &[frame, (8, 2)], 20.),
            stage("Cover & irrigation", &[(11, 1), (9, 2)], 18.),
        ],
        "well" => vec![
            stage("Foundation", &[(3, 6), (2, 2)], 12.),
            stage("Tank, pump & pipes", &[(9, 4), (8, 2), (14, 1)], 24.),
        ],
        "kitchen" => vec![
            stage("Foundation", &[(2, 4), (3, 4)], 12.),
            stage("Structure", &[frame, (6, 4), (7, 4)], 22.),
            stage("Water & fittings", &[(9, 2), (8, 2)], 14.),
        ],
        "grove" => vec![stage("Planting beds", &[(2, 6), (0, 2)], 18.)],
        "compost" => vec![
            stage("Prepare the site", &[(2, 2)], 8.),
            stage("Assemble bins", &[(0, 4), (8, 1)], 16.),
        ],
        "square" => vec![
            stage("Paving", &[(3, 10), (2, 4)], 18.),
            stage("Pergola & benches", &[frame, (0, 4), (8, 2)], 24.),
        ],
        "workshop" => vec![
            stage("Foundation", &[(3, 6), (2, 4)], 14.),
            stage("Structure", &[(5, 6), (6, 4), (7, 4)], 24.),
            stage("Workbench & fittings", &[(0, 6), (8, 3)], 18.),
        ],
        "coop" => vec![
            stage("Footings", &[(3, 2)], 8.),
            stage("Shelter", &[(5, 2), (7, 2), (8, 1)], 20.),
        ],
        "solar_farm" => vec![
            stage("Supports", &[(3, 6), (8, 3)], 16.),
            stage("Equipment installation", &[(12, 2), (13, 1), (10, 2)], 24.),
        ],
        "streetlight" => vec![
            stage("Footing & post", &[(3, 1), (0, 2)], 8.),
            stage("Electrical installation", &[(10, 1), (8, 1)], 12.),
        ],
        "hydro" => vec![
            stage("Riverbank footings", &[(3, 6), (1, 4)], 16.),
            stage(
                "Wheel & generator",
                &[(8, 4), (10, 2), (14, 1), (13, 1)],
                24.,
            ),
        ],
        "eco_toilet" => vec![
            stage("Sealed chamber", &[(3, 4), (2, 6)], 14.),
            stage(
                "Privacy hut & handwash",
                &[(1, 6), (7, 3), (9, 2), (8, 2)],
                20.,
            ),
        ],
        "wetland" => vec![
            stage("Lined reed bed", &[(3, 8), (2, 4), (11, 1)], 18.),
            stage("Reeds, pipes & collection", &[(9, 3), (8, 2)], 16.),
        ],
        "banana_treatment" => vec![
            stage(
                "Sealed basin & drainage layers",
                &[(3, 8), (2, 8), (6, 6)],
                20.,
            ),
            stage("Banana planting & inlet", &[(9, 3), (8, 2)], 16.),
        ],
        "biodigester" => vec![
            stage("Sealed tanks", &[(3, 4), (6, 6), (9, 3)], 22.),
            stage(
                "Gas plumbing & service shelter",
                &[(8, 3), (9, 2), (7, 2)],
                20.,
            ),
        ],
        "warehouse" => vec![
            stage("Foundation", &[(3, 8), (2, 8)], 16.),
            stage(
                "Adobe walls & bamboo frame",
                &[(2, 20), (1, 12), (8, 3)],
                30.,
            ),
            stage("Roof & storage racks", &[(7, 10), (5, 2), (8, 2)], 22.),
        ],
        _ => return None,
    })
}
pub fn quantity(v: &Village, i: usize) -> u32 {
    if v.logistics.is_some() {
        return crate::logistics::total(v, i);
    }
    match i {
        0 => v.wood.floor() as u32,
        FOOD => v.food as u32,
        MEALS => v.meals,
        EGGS => v.supplies.eggs,
        _ => v.economy.stock[i],
    }
}
pub(crate) fn add(v: &mut Village, i: usize, n: u32) {
    if v.logistics.is_some() {
        assert!(
            crate::logistics::receive(v, crate::logistics::Owner::Camp, i, n),
            "receiving area full"
        );
        return;
    }
    crate::simulation::material_change(v, i, n, true);
    if i == 0 {
        v.wood += n as f32
    } else {
        v.economy.stock[i] += n;
    }
}
pub(crate) fn remove(v: &mut Village, i: usize, n: u32) {
    if v.logistics.is_some() {
        crate::logistics::spend(v, None, i, n);
        return;
    }
    crate::simulation::material_change(v, i, n, false);
    if i == 0 {
        v.wood -= n as f32
    } else {
        v.economy.stock[i] -= n;
    }
}
pub fn reserved(v: &Village, i: usize) -> u32 {
    v.economy.projects.iter().map(|p| p.reserved[i]).sum()
}
pub fn free(v: &Village, i: usize) -> u32 {
    if v.logistics.is_some() {
        return crate::logistics::free(v, i);
    }
    quantity(v, i).saturating_sub(reserved(v, i))
}
pub fn incoming(v: &Village, i: usize) -> u32 {
    v.economy
        .orders
        .iter()
        .filter(|o| matches!(o.status.as_str(), "confirmed" | "dispatched" | "collecting"))
        .map(|o| o.items[i])
        .sum()
}
pub fn storage(v: &Village) -> u32 {
    (0..COUNT)
        .map(|i| quantity(v, i) + incoming(v, i))
        .sum::<u32>()
        + v.building_jobs.iter().flat_map(|j| j.returns).sum::<u32>()
        + crate::production::reserved_space(v)
}
pub fn capacity(v: &Village) -> u32 {
    CAPACITY
        + 300
            * v.buildings
                .iter()
                .filter(|b| b.kind == "warehouse" && b.progress >= 100.)
                .count() as u32
        + 300 * crate::building_work::moving_storage(v)
}
fn ledger(v: &mut Village, amount: i64, note: String) {
    v.economy.money += amount;
    v.economy.ledger.push(Entry {
        minute: v.minutes,
        amount,
        note,
    });
    if v.economy.ledger.len() > 80 {
        v.economy.ledger.remove(0);
    }
}
pub fn plan(v: &mut Village, id: usize) {
    let appearance = if v.buildings.iter().any(|b| b.id == id && b.kind == "home") {
        v.economy
            .projects
            .iter()
            .filter(|p| {
                v.buildings
                    .iter()
                    .any(|b| b.id == p.building && b.kind == "home")
            })
            .max_by_key(|p| p.building)
            .map_or(
                ((v.buildings.iter().filter(|b| b.kind == "home").count() - 1) % 4) as u8,
                |p| {
                    p.appearance.map_or(
                        ((v.buildings.iter().filter(|b| b.kind == "home").count() - 1) % 4) as u8,
                        |n| (n + 1) % 4,
                    )
                },
            )
    } else {
        0
    };
    v.economy.projects.push(Project {
        building: id,
        appearance: Some(appearance),
        recipe: "standard".into(),
        priority: 1,
        paused: false,
        stage: 0,
        labour: 0.,
        committed: false,
        reserved: [0; COUNT],
        consumed: [0; COUNT],
    });
    rebalance(v);
}
pub fn rebalance(v: &mut Village) {
    if v.logistics.is_some() {
        crate::production::sync(v);
        crate::logistics::rebalance(v);
        crate::production::dispatch(v);
        return;
    }
    let mut available = std::array::from_fn::<_, COUNT, _>(|i| quantity(v, i));
    for p in &mut v.economy.projects {
        p.reserved = [0; COUNT];
    }
    let mut order: Vec<_> = (0..v.economy.projects.len()).collect();
    order.sort_by_key(|&i| {
        (
            std::cmp::Reverse(v.economy.projects[i].priority),
            v.economy.projects[i].building,
        )
    });
    for index in order {
        let p = &v.economy.projects[index];
        let Some(b) = v
            .buildings
            .iter()
            .find(|b| b.id == p.building && b.progress < 100.)
        else {
            continue;
        };
        let stages = recipe(&b.kind, &p.recipe).unwrap();
        if p.paused || p.committed || p.stage >= stages.len() {
            continue;
        }
        let needs = stages[p.stage].items;
        for i in 0..COUNT {
            let n = available[i].min(needs[i]);
            available[i] -= n;
            v.economy.projects[index].reserved[i] = n;
        }
    }
}
pub fn can_build(v: &Village, id: usize) -> bool {
    if crate::building_work::job(v, id).is_some() {
        return false;
    }
    let Some(p) = v.economy.projects.iter().find(|p| p.building == id) else {
        return false;
    };
    let Some(b) = v.buildings.iter().find(|b| b.id == id && b.progress < 100.) else {
        return false;
    };
    let stages = recipe(&b.kind, &p.recipe).unwrap();
    !p.paused
        && p.stage < stages.len()
        && (p.committed
            || if v.logistics.is_some() {
                crate::logistics::project_ready(v, id, stages[p.stage].items)
            } else {
                p.reserved == stages[p.stage].items
            })
}
pub fn build(v: &mut Village, id: usize, work: f32) -> bool {
    if !can_build(v, id) {
        return false;
    }
    let index = v
        .economy
        .projects
        .iter()
        .position(|p| p.building == id)
        .unwrap();
    let bindex = v.buildings.iter().position(|b| b.id == id).unwrap();
    let stages = recipe(&v.buildings[bindex].kind, &v.economy.projects[index].recipe).unwrap();
    let p = &v.economy.projects[index];
    let current = p.stage;
    if !p.committed {
        for (i, &n) in stages[current].items.iter().enumerate() {
            if v.logistics.is_some() {
                crate::logistics::spend(v, Some(crate::logistics::Owner::Site(id)), i, n);
            } else {
                remove(v, i, n);
            }
            v.economy.projects[index].consumed[i] += n;
        }
        v.economy.projects[index].reserved = [0; COUNT];
        v.economy.projects[index].committed = true;
    }
    let p = &mut v.economy.projects[index];
    p.labour = (p.labour + work).min(stages[current].work);
    v.buildings[bindex].progress =
        ((current as f32 + p.labour / stages[current].work) / stages.len() as f32 * 100.).min(100.);
    if p.labour >= stages[current].work {
        p.stage += 1;
        p.labour = 0.;
        p.committed = false;
        if p.stage >= stages.len() {
            crate::progression::use_tool(v, id);
        }
        rebalance(v);
    }
    v.buildings[bindex].progress >= 100.
}
pub fn shortage(v: &Village) -> Bundle {
    let mut needs = gross_needs(v);
    for (i, n) in needs.iter_mut().enumerate() {
        *n = n.saturating_sub(quantity(v, i) + incoming(v, i) + crate::production::future(v, i));
    }
    needs
}
pub(crate) fn gross_needs(v: &Village) -> Bundle {
    let mut needs = [0; COUNT];
    for p in &v.economy.projects {
        let Some(b) = v
            .buildings
            .iter()
            .find(|b| b.id == p.building && b.progress < 100.)
        else {
            continue;
        };
        if p.paused {
            continue;
        }
        let stages = recipe(&b.kind, &p.recipe).unwrap();
        for s in stages.iter().skip(p.stage + usize::from(p.committed)) {
            for (i, &n) in s.items.iter().enumerate() {
                needs[i] += n;
            }
        }
    }
    // One small tool batch is maintenance demand, never an open-ended timber stockpile.
    if ready(v, "workshop") && v.progress.use_tools && v.progress.tool_uses <= 2 {
        needs[TOOLS] += 12;
    }
    for (i, n) in needs.iter_mut().enumerate() {
        *n = n.saturating_add(crate::production::input_demand(v, i));
        *n = if i == TOOLS {
            (*n).max(v.production.targets[i])
        } else {
            n.saturating_add(v.production.targets[i])
        };
    }
    needs
}
fn preparation(v: &Village, i: usize) -> Option<(Bundle, u32)> {
    match i {
        5 => Some((bundle(&[(0, 2), (8, 1)]), 1)),
        6 => Some((bundle(&[(2, 2)]), 2)),
        7 if ready(v, "workshop") => Some((bundle(&[(2, 2), (0, 1)]), 2)),
        8 if ready(v, "workshop") => Some((bundle(&[(4, 1), (3, 1)]), 2)),
        8 => Some((bundle(&[(4, 2)]), 1)),
        _ => None,
    }
}
pub fn local_job(v: &Village) -> Option<(String, usize)> {
    for (index, _) in v.economy.sources.iter().enumerate() {
        if crate::resource_sites::care(v, index) {
            return Some(("source".into(), index));
        }
    }
    if let Some(batch) = crate::production::jobs(v).next() {
        return Some((
            crate::production::task(batch.material).into(),
            batch.material,
        ));
    }
    if storage(v) >= capacity(v) {
        return None;
    }
    let raw = crate::production::demand(v);
    for (index, _) in v.economy.sources.iter().enumerate() {
        if crate::resource_sites::wanted(v, index, &raw) {
            if v.logistics.is_some()
                && crate::logistics::source_space(v, index)
                    < if v.economy.sources[index].material == 0 {
                        8
                    } else {
                        1
                    }
            {
                continue;
            }
            return Some(("source".into(), index));
        }
    }
    None
}
pub fn finish_job(v: &mut Village, task: &str, target: usize) -> bool {
    let Some((expected, index)) = local_job(v) else {
        return false;
    };
    if expected != task || index != target {
        return false;
    }
    if task == "source" {
        if crate::resource_sites::finish(v, index) {
            return true;
        }
        let i = v.economy.sources[index].material;
        let mut n = (if i == 0 { 8 } else { 4 })
            .min(v.economy.sources[index].remaining.floor() as u32)
            .min(capacity(v) - storage(v));
        if v.logistics.is_some() {
            n = n.min(crate::logistics::source_space(v, index));
        }
        if n == 0 {
            return false;
        }
        if i == 0 && n < 8 {
            return false;
        }
        crate::resource_sites::harvested(v, index, n);
        if v.logistics.is_some() {
            assert!(crate::logistics::receive(
                v,
                crate::logistics::Owner::Source(index),
                i,
                n
            ));
        } else {
            add(v, i, n);
        }
        if i == 0 {
            v.progress.timber += n;
        }
    } else {
        return false;
    }

    rebalance(v);
    true
}
pub fn advance(v: &mut Village, minutes: f32) {
    crate::resource_sites::advance(v, minutes);
    let mut arrived = vec![];
    for o in &mut v.economy.orders {
        if o.pickup_by.is_none() && o.status == "confirmed" && v.minutes >= o.dispatch {
            o.status = "dispatched".into();
        }
        if o.status == "dispatched" && v.minutes >= o.arrival {
            o.status = "delivered".into();
            arrived.push((o.id, o.items));
        }
    }
    for (id, items) in arrived {
        for (i, &n) in items.iter().enumerate() {
            add(v, i, n);
        }
        v.economy.last_delivery = v.minutes;
        event(
            v,
            format!(
                "Town delivery {} is at camp. Residents will bring supplies to our projects.",
                id + 1
            ),
        );
    }
    rebalance(v);
}
pub(crate) fn parse_items(data: &str) -> Result<Bundle, String> {
    let b: Bundle =
        serde_json::from_str(data).map_err(|_| "Choose valid quantities.".to_string())?;
    if b.iter().all(|n| *n == 0) || b.iter().any(|n| *n > 100) {
        Err("Choose 1–100 units per material.".into())
    } else {
        Ok(b)
    }
}
pub fn quote(v: &Village, items: Bundle) -> Result<i64, String> {
    quote_with_fee(v, items, 6000)
}
fn quote_with_fee(v: &Village, items: Bundle, fee: i64) -> Result<i64, String> {
    if v.logistics.is_some()
        && items.iter().sum::<u32>() > crate::logistics::room(v, crate::logistics::Owner::Camp)
    {
        return Err("Make room at the arrival store. Haul supplies to a storage house or use existing materials before ordering more.".into());
    }
    if storage(v) + items.iter().sum::<u32>() > capacity(v) {
        return Err(
            "There is not enough receiving space. Finish a project or use stored materials.".into(),
        );
    }
    let total = items
        .iter()
        .zip(PRICES)
        .map(|(&n, p)| n as i64 * p)
        .sum::<i64>()
        + fee;
    if v.economy.money < total {
        return Err(
            "The shared fund is too small. Enable outside work or sell genuine surplus.".into(),
        );
    }
    Ok(total)
}
pub fn view(v: &Village) -> serde_json::Value {
    let materials:Vec<_>=(0..COUNT).map(|i|serde_json::json!({"id":i,"key":NAMES[i],"name":LABELS[i],"price":PRICES[i],"stored":quantity(v,i),"in_transit":v.logistics.as_ref().map_or(0,|s|s.shipments.iter().filter(|h|h.carrying&&h.material==i).map(|h|h.amount).sum::<u32>()),"reserved":reserved(v,i)+crate::production::input_demand(v,i),"processing":v.production.batches.iter().filter(|b|b.active()&&b.committed).map(|b|b.inputs[i]).sum::<u32>(),"available":free(v,i),"incoming":incoming(v,i)})).collect();
    let projects:Vec<_>=v.economy.projects.iter().filter_map(|p|{
        let b=v.buildings.iter().find(|b|b.id==p.building)?;if b.progress>=100.{return None;}
        let stages=recipe(&b.kind,&p.recipe)?;let s=stages.get(p.stage)?;
        let missing:Bundle=std::array::from_fn(|i|if p.committed{0}else{s.items[i].saturating_sub(p.reserved[i])});
        Some(serde_json::json!({"building":b.id,"kind":b.kind,"stage":s.name,"stage_index":p.stage,"stages":stages,"recipe":p.recipe,"priority":p.priority,"paused":p.paused,"committed":p.committed,"missing":missing,"on_site":if v.logistics.is_some(){crate::logistics::project_items(v,b.id)}else{[0;COUNT]},"hauling_blocker":v.logistics.as_ref().and_then(|s|s.stores.iter().find(|p|p.owner==crate::logistics::Owner::Site(b.id))).and_then(|p|p.blocker.as_deref()),"reserved":p.reserved,"consumed":p.consumed,"labour":p.labour,"work":s.work,"ready":can_build(v,b.id),"progress":b.progress}))
    }).collect();
    let recipes:Vec<_>=["home","garden","greenhouse","kitchen","well","grove","compost","square","workshop","coop","solar_farm","streetlight","hydro","eco_toilet","wetland","banana_treatment","biodigester","warehouse"].into_iter().map(|kind|serde_json::json!({"kind":kind,"standard":recipe(kind,"standard"),"local":recipe(kind,"local"),"adobe":recipe(kind,"adobe")})).collect();
    let preparation: Vec<_> = [5, 6, 7, 8]
        .into_iter()
        .filter_map(|i| {
            preparation(v, i).map(
                |(inputs, yield_)| serde_json::json!({"material":i,"inputs":inputs,"yield":yield_}),
            )
        })
        .collect();
    let day = (v.minutes / 1440.) as i32;
    serde_json::json!({"production":crate::production::view(v),"preparation":preparation,"workshop":ready(v,"workshop"),"materials":materials,"projects":projects,"recipes":recipes,"money":v.economy.money,"used":storage(v),"capacity":capacity(v),"salvage_reserved":v.building_jobs.iter().flat_map(|j|j.returns).sum::<u32>(),"shortage":shortage(v),"outside_work":v.economy.outside_jobs[4],"jobs":crate::occupations::view(v),"exchange_available":v.economy.exchange_day!=day,"saleable_food":(v.food-36.).max(0.).floor() as u32,"next_delivery":(v.minutes/1440.).floor()*1440.+if v.minutes%1440.<480.{600.}else{2040.},"property":"Player-managed land · planted timber, cultivated bamboo and finite earth, stone and reclaimed reserves","source_options":crate::resource_sites::options(),"source_status":crate::resource_sites::view(v)})
}
pub fn valid(v: &Village) -> bool {
    let e = &v.economy;
    if e.stock.iter().any(|n| *n > capacity(v))
        || e.projects.iter().any(|p| {
            p.reserved
                .iter()
                .chain(&p.consumed)
                .any(|n| *n > capacity(v))
        })
        || e.orders.iter().any(|o| o.items.iter().any(|n| *n > 100))
    {
        return false;
    }
    if e.outside_committed_days
        .iter()
        .any(|d| *d < -1 || *d > (v.minutes / 1440.) as i32)
        || e.money < 0
        || e.money > 1_000_000_000
        || e.stock[0] != 0
        || storage(v) > capacity(v)
        || e.orders.len() > 100
        || e.projects.len() > 676
        || !crate::resource_sites::valid(v)
        || e.ledger.len() > 80
        || !e.last_delivery.is_finite()
        || e.last_delivery < 0.
        || e.last_delivery > v.minutes
        || e.exchange_day < -1
        || e.exchange_day > (v.minutes / 1440.) as i32
        || e.work_day
            .iter()
            .any(|d| *d < -1 || *d > (v.minutes / 1440.) as i32)
    {
        return false;
    }
    let mut ids = std::collections::HashSet::new();
    for b in &v.buildings {
        if !ids.insert(b.id) || b.id >= e.next_building {
            return false;
        }
    }
    ids.clear();
    for p in &e.projects {
        let Some(b) = v.buildings.iter().find(|b| b.id == p.building) else {
            return false;
        };
        let Some(stages) = recipe(&b.kind, &p.recipe) else {
            return false;
        };
        if !ids.insert(p.building)
            || p.priority > 3
            || p.appearance
                .is_some_and(|n| n > 5 || (n >= 4 && (b.kind != "home" || p.recipe != "adobe")))
            || p.stage > stages.len()
            || !p.labour.is_finite()
            || p.labour < 0.
        {
            return false;
        }
        let progress = crate::building_work::original_progress(v, b.id).unwrap_or(b.progress);
        if progress >= 100. {
            continue;
        }
        if p.stage == stages.len() {
            if p.committed || p.labour != 0. || p.reserved != [0; COUNT] || progress != 100. {
                return false;
            }
        } else {
            if p.labour > stages[p.stage].work
                || (!p.committed && p.labour != 0.)
                || ((p.paused || p.committed) && p.reserved != [0; COUNT])
                || p.reserved
                    .iter()
                    .enumerate()
                    .any(|(i, n)| *n > stages[p.stage].items[i])
            {
                return false;
            }
            let expected =
                (p.stage as f32 + p.labour / stages[p.stage].work) / stages.len() as f32 * 100.;
            if (progress - expected).abs() > 0.01 {
                return false;
            }
        }
        let mut expected = [0; COUNT];
        for s in stages.iter().take(p.stage + usize::from(p.committed)) {
            for (i, &n) in s.items.iter().enumerate() {
                expected[i] += n;
            }
        }
        if p.consumed != expected {
            return false;
        }
    }
    if v.buildings.iter().any(|b| {
        b.progress < 100.
            && !ids.contains(&b.id)
            && crate::building_work::original_progress(v, b.id) != Some(100.)
    }) || (0..COUNT).any(|i| reserved(v, i) > quantity(v, i))
    {
        return false;
    }
    ids.clear();
    for o in &e.orders {
        if !ids.insert(o.id as usize)
            || o.id >= e.next_order
            || !o.dispatch.is_finite()
            || !o.arrival.is_finite()
            || o.dispatch < 0.
            || o.arrival <= o.dispatch
            || o.items.iter().all(|n| *n == 0)
            || o.items.iter().any(|n| *n > 100)
            || o.paid
                != o.items
                    .iter()
                    .zip(PRICES)
                    .map(|(&n, p)| n as i64 * p)
                    .sum::<i64>()
                    + if o.pickup_by.is_some() { 2000 } else { 6000 }
            || o.pickup_by.is_some_and(|id| id >= 5)
            || (o.pickup_by.is_some()
                && (!matches!(o.status.as_str(), "collecting" | "delivered")
                    || o.items.iter().sum::<u32>() > crate::town_pickup::CAPACITY))
            || (o.pickup_by.is_none() && o.status == "collecting")
            || !matches!(
                o.status.as_str(),
                "confirmed" | "dispatched" | "collecting" | "delivered" | "cancelled"
            )
        {
            return false;
        }
        if o.status == "confirmed" && v.minutes >= o.dispatch
            || o.status == "dispatched" && (v.minutes < o.dispatch || v.minutes >= o.arrival)
            || o.status == "delivered" && v.minutes < o.arrival
            || o.pickup_by.is_some()
                && (o.dispatch > v.minutes || (o.status == "collecting" && o.arrival <= v.minutes))
        {
            return false;
        }
    }
    e.ledger.iter().all(|l| {
        l.minute.is_finite()
            && l.minute >= 0.
            && l.minute <= v.minutes
            && l.amount.unsigned_abs() <= 1_000_000_000
            && l.note.len() <= 200
    })
}
pub(crate) fn place_order(
    v: &mut Village,
    items: Bundle,
    pickup_by: Option<usize>,
) -> Result<u32, String> {
    let paid = if pickup_by.is_some() {
        quote_with_fee(v, items, 2000)
    } else {
        quote(v, items)
    }?;
    let Some(next_order) = v.economy.next_order.checked_add(1) else {
        return Err("Order identity limit reached.".into());
    };
    if v.economy.orders.len() >= 100 {
        let keep = v
            .economy
            .orders
            .iter()
            .filter(|o| matches!(o.status.as_str(), "confirmed" | "dispatched" | "collecting"))
            .count();
        if keep >= 100 {
            return Err("Wait for a delivery or cancel an undispatched order first.".into());
        }
        let mut discard = v.economy.orders.len().saturating_sub(79);
        v.economy.orders.retain(|o| {
            if discard > 0 && matches!(o.status.as_str(), "delivered" | "cancelled") {
                discard -= 1;
                false
            } else {
                true
            }
        });
    }
    let id = v.economy.next_order;
    v.economy.next_order = next_order;
    let dispatch = v.minutes + if pickup_by.is_some() { 0. } else { 120. };
    let arrival = if pickup_by.is_some() {
        v.minutes + 120.
    } else {
        (dispatch / 1440.).floor() * 1440. + if dispatch % 1440. < 600. { 600. } else { 2040. }
    };
    v.economy.orders.push(Order {
        id,
        items,
        paid,
        dispatch,
        arrival,
        status: if pickup_by.is_some() {
            "collecting"
        } else {
            "confirmed"
        }
        .into(),
        pickup_by,
    });
    ledger(
        v,
        -paid,
        format!(
            "Town order {} including {}",
            id + 1,
            if pickup_by.is_some() {
                "pickup fuel"
            } else {
                "delivery"
            }
        ),
    );
    Ok(id)
}

#[wasm_bindgen]
impl Game {
    pub fn order_supplies(&mut self, data: &str) -> String {
        let items = match parse_items(data) {
            Ok(items) => items,
            Err(e) => return e,
        };
        match place_order(
            &mut self.app.world_mut().resource_mut::<Village>(),
            items,
            None,
        ) {
            Ok(_) => "ok".into(),
            Err(e) => e,
        }
    }
    pub fn cancel_order(&mut self, id: u32) -> String {
        let mut v = self.app.world_mut().resource_mut::<Village>();
        let Some(i) = v.economy.orders.iter().position(|o| o.id == id) else {
            return "Order not found.".into();
        };
        if v.economy.orders[i].status != "confirmed" {
            return "Only orders awaiting dispatch can be cancelled.".into();
        }
        let paid = v.economy.orders[i].paid;
        v.economy.orders[i].status = "cancelled".into();
        ledger(&mut v, paid, format!("Refund for order {}", id + 1));
        "ok".into()
    }
    /// Existing scenario helpers enable Nina's job; players use individual toggles.
    pub fn set_outside_work(&mut self, enabled: bool) {
        self.set_resident_job(4, enabled);
    }
    pub fn set_resident_job(&mut self, resident: usize, enabled: bool) -> bool {
        let mut v = self.app.world_mut().resource_mut::<Village>();
        let Some(job) = v.economy.outside_jobs.get_mut(resident) else {
            return false;
        };
        *job = enabled;
        true
    }

    pub fn sell_material(&mut self, material: usize, n: u32) -> String {
        let mut v = self.app.world_mut().resource_mut::<Village>();
        if material >= COUNT
            || n == 0
            || n > 20
            || free(&v, material) < n
            || (material == FOOD && v.food < (36 + n) as f32)
        {
            return "Sell 1–20 stored, unreserved units. Project reservations and incoming orders cannot be sold.".into();
        }
        remove(&mut v, material, n);
        ledger(
            &mut v,
            n as i64 * PRICES[material] / 2,
            format!("Spare {} sold at half price", LABELS[material]),
        );
        rebalance(&mut v);
        "ok".into()
    }
    pub fn sell_surplus(&mut self, n: u32) -> String {
        let mut v = self.app.world_mut().resource_mut::<Village>();
        if n == 0 || n > 20 || v.food - (n as f32) < 36. {
            return "Keep 36 ingredients for the household. Sell up to 20 surplus ingredients."
                .into();
        }
        remove(&mut v, FOOD, n);
        v.progress.surplus_sold = true;
        ledger(
            &mut v,
            n as i64 * 300,
            "Surplus produce sold in town".into(),
        );
        "ok".into()
    }
    pub fn exchange_parts(&mut self) -> String {
        let mut v = self.app.world_mut().resource_mut::<Village>();
        let day = (v.minutes / 1440.) as i32;
        if v.economy.exchange_day == day {
            return "Our neighbour's spare fittings are already exchanged today.".into();
        }
        if v.food < 40.
            || storage(&v) + 2 > capacity(&v)
            || crate::logistics::room(&v, crate::logistics::Owner::Camp) < 2
        {
            return "The neighbour asks for four surplus ingredients; keep 36 for the household and room for two fittings.".into();
        }
        remove(&mut v, FOOD, 4);
        add(&mut v, 8, 2);
        v.economy.exchange_day = day;
        v.progress.parts_exchanged = true;
        rebalance(&mut v);
        event(
            &mut v,
            "Neighbour exchange: four surplus ingredients for two spare fittings.",
        );
        "ok".into()
    }
    pub fn restore_source(&mut self, index: usize) -> String {
        let mut v = self.app.world_mut().resource_mut::<Village>();
        let Some(s) = v.economy.sources.get(index) else {
            return "Source not found.".into();
        };
        if !s.active || s.material > 1 || s.restored {
            return "This source cannot be restored again.".into();
        }
        if v.progress.compost < 2 {
            return "Set aside two compost to enrich this cultivated plot.".into();
        }
        v.progress.compost -= 2;
        v.economy.sources[index].restored = true;
        "ok".into()
    }
    pub fn configure_project(
        &mut self,
        id: usize,
        priority: u32,
        paused: bool,
        variant: &str,
    ) -> String {
        let mut v = self.app.world_mut().resource_mut::<Village>();
        let Some(index) = v.economy.projects.iter().position(|p| p.building == id) else {
            return "Project not found.".into();
        };
        let p = &v.economy.projects[index];
        let b = v.buildings.iter().find(|b| b.id == id).unwrap();
        if crate::building_work::job(&v, id).is_some() {
            return "Cancel the crew job before changing this project.".into();
        }
        if b.progress >= 100. || priority > 3 || recipe(&b.kind, variant).is_none() {
            return "Choose an unfinished project and a valid recipe.".into();
        }
        if p.recipe != variant && p.consumed != [0; COUNT] {
            return "Materials are committed. Keep this recipe or cancel for half-material salvage.".into();
        }
        let home_ordinal = v
            .buildings
            .iter()
            .filter(|b| b.kind == "home" && b.id < id)
            .count();
        let p = &mut v.economy.projects[index];
        if variant == "adobe" {
            p.appearance = Some(4 + (home_ordinal % 2) as u8);
        } else if p.appearance.is_some_and(|n| n >= 4) {
            p.appearance = Some((home_ordinal % 4) as u8);
        }
        p.priority = priority;
        p.paused = paused;
        p.recipe = variant.into();
        rebalance(&mut v);
        "ok".into()
    }
    pub fn cancel_project(&mut self, id: usize) -> String {
        {
            let v = self.app.world().resource::<Village>();
            if crate::building_work::job(v, id).is_some() {
                return "A crew job is already queued for this building.".into();
            }
            if v.buildings.iter().any(|b| b.id == id && b.progress < 100.)
                && v.economy
                    .projects
                    .iter()
                    .any(|p| p.building == id && p.consumed.iter().any(|n| *n > 0))
            {
                return self.queue_building_work(id, "salvage", 0, 0);
            }
        }
        let mut v = self.app.world_mut().resource_mut::<Village>();
        let Some(index) = v.economy.projects.iter().position(|p| p.building == id) else {
            return "Project not found.".into();
        };
        if v.buildings.iter().any(|b| b.id == id && b.progress >= 100.) {
            return "Completed buildings cannot be cancelled.".into();
        }
        let salvage = v.economy.projects[index].consumed.map(|n| n / 2);
        if storage(&v) + salvage.iter().sum::<u32>() > capacity(&v) {
            return "Make storage room for the salvaged materials first.".into();
        }
        v.economy.projects.remove(index);
        v.buildings.retain(|b| b.id != id);
        for (i, &n) in salvage.iter().enumerate() {
            add(&mut v, i, n);
        }
        rebalance(&mut v);
        let mut query = self.app.world_mut().query::<&mut crate::Resident>();
        for mut r in query.iter_mut(self.app.world_mut()) {
            if r.activity_building == Some(id) || r.visit_building == Some(id) {
                r.activity_building = None;
                r.visit_building = None;
                r.remaining = 0.;
            }
        }
        self.sync_help();
        "ok".into()
    }
}
pub fn finish_outside(v: &mut Village, id: usize) {
    let day = (v.minutes / 1440.) as i32;
    if id < 5 && v.economy.outside_committed_days[id] == day && v.economy.work_day[id] != day {
        v.economy.work_day[id] = day;
        let job = crate::occupations::JOBS[id];
        ledger(
            v,
            job.income,
            format!(
                "{} · {} contribution",
                crate::occupations::NAMES[id],
                job.title
            ),
        );
        event(
            v,
            format!(
                "{} returned from their {} shift with R$ {} for the shared fund.",
                crate::occupations::NAMES[id],
                job.title.to_lowercase(),
                job.income / 100
            ),
        );
    }
}

pub fn contribute(v: &mut Village, n: i64, note: &str) {
    ledger(v, -n, note.into());
}

#[cfg(test)]
mod tests {
    use super::*;
    fn town_order(g: &mut Game, items: &[(usize, u32)]) {
        assert_eq!(
            g.order_supplies(&serde_json::to_string(&bundle(items)).unwrap()),
            "ok"
        );
    }
    #[test]
    fn reservations_pause_priority_and_cancel_never_double_spend() {
        let mut g = Game::new();
        assert_eq!(g.place("home", 8, 8), "ok");
        assert_eq!(g.place("home", 12, 8), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            crate::logistics::fixture_stock(&mut v, 2, 6);
            rebalance(&mut v);
            assert_eq!(reserved(&v, 2), 6);
            assert_eq!(v.economy.projects[0].reserved[2], 6);
            assert!(!can_build(&v, 0));
            assert!(!can_build(&v, 1));
        }
        assert_eq!(g.configure_project(1, 3, false, "standard"), "ok");
        assert_eq!(
            g.app.world().resource::<Village>().economy.projects[1].reserved[2],
            6
        );
        assert_eq!(g.configure_project(1, 3, true, "standard"), "ok");
        assert_eq!(
            g.app.world().resource::<Village>().economy.projects[0].reserved[2],
            6
        );
        let before = g.app.world().resource::<Village>().wood;
        assert_eq!(g.cancel_project(0), "ok");
        assert_eq!(g.app.world().resource::<Village>().wood, before);
        assert_ne!(g.cancel_project(0), "ok");
        assert_eq!(g.place("garden", 8, 8), "ok");
        assert_eq!(
            g.app
                .world()
                .resource::<Village>()
                .buildings
                .last()
                .unwrap()
                .id,
            2
        );
        let saved = g.snapshot();
        assert!(g.restore(&saved));
    }
    #[test]
    fn building_consumes_once_and_cancellation_returns_only_half() {
        let mut g = Game::new();
        assert_eq!(g.place("garden", 8, 8), "ok");
        let mut v = g.app.world_mut().resource_mut::<Village>();
        let earth = quantity(&v, 2);
        let wood = v.wood;
        crate::logistics::fixture_stage(&mut v, 0);
        assert!(!build(&mut v, 0, 1.));
        assert_eq!(quantity(&v, 2), earth - 4);
        assert_eq!(v.wood, wood - 4.);
        assert!(!build(&mut v, 0, 1.));
        assert_eq!(quantity(&v, 2), earth - 4);
        assert_ne!(g.configure_project(0, 1, false, "local"), "ok");
        assert_eq!(g.cancel_project(0), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            assert_eq!(quantity(&v, 2), earth - 4);
            assert!(v.buildings.iter().any(|b| b.id == 0));
            crate::building_work::work(&mut v, 0, 54.);
        }
        let v = g.app.world().resource::<Village>();
        assert_eq!(quantity(v, 2), earth - 2);
        assert_eq!(v.wood, wood - 2.);
    }
    #[test]
    fn orders_refund_once_dispatch_and_deliver_once_after_reload() {
        let mut g = Game::new();
        let funds = g.app.world().resource::<Village>().economy.money;
        town_order(&mut g, &[(12, 2), (13, 1)]);
        assert_eq!(g.cancel_order(0), "ok");
        assert_eq!(g.app.world().resource::<Village>().economy.money, funds);
        assert_ne!(g.cancel_order(0), "ok");
        town_order(&mut g, &[(12, 2), (13, 1)]);
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.minutes = 600.;
            advance(&mut v, 120.);
        }
        assert_ne!(g.cancel_order(1), "ok");
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.minutes = 2040.;
            advance(&mut v, 1440.);
            assert_eq!(quantity(&v, 12), 2);
            advance(&mut v, 1.);
            assert_eq!(quantity(&v, 12), 2);
        }
        let saved = g.snapshot();
        assert!(g.restore(&saved));
    }
    #[test]
    fn failed_orders_sales_and_exchanges_are_atomic_and_keep_food() {
        let mut g = Game::new();
        let before = g.snapshot();
        assert_ne!(g.order_supplies("[]"), "ok");
        assert_ne!(
            g.order_supplies(&serde_json::to_string(&[100; COUNT]).unwrap()),
            "ok"
        );
        assert_ne!(g.sell_surplus(1), "ok");
        assert_ne!(g.exchange_parts(), "ok");
        assert_eq!(g.snapshot(), before);
        crate::logistics::fixture_stock(
            &mut g.app.world_mut().resource_mut::<Village>(),
            crate::economy::FOOD,
            (56.) as u32,
        );
        assert_eq!(g.sell_surplus(20), "ok");
        assert_eq!(g.app.world().resource::<Village>().food, 36.);
    }
    #[test]
    fn finite_sources_and_preparation_stop_at_project_demand() {
        let mut g = Game::new();
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(local_job(&v).is_none());
        assert_eq!(g.place_source(2, 5, 5), "ok");
        assert_eq!(g.place("garden", 8, 8), "ok");
        v = g.app.world_mut().resource_mut::<Village>();
        crate::logistics::fixture_stock(&mut v, 2, 0);
        rebalance(&mut v);
        assert_eq!(local_job(&v), Some(("source".into(), 0)));
        let deposit = v.economy.sources[0].remaining;
        finish_job(&mut v, "source", 0);
        assert_eq!(quantity(&v, 2), 4);
        assert_eq!(v.economy.sources[0].remaining, deposit - 4.);
        assert!(local_job(&v).is_none());
    }
    #[test]
    fn workshop_unlocks_tiles_and_improves_salvage_without_double_consumption() {
        let mut g = Game::new();
        g.set_tools_enabled(false);
        g.app
            .world_mut()
            .resource_mut::<Village>()
            .progress
            .completed = [true; 4];
        assert_eq!(g.place("workshop", 8, 8), "ok");
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(preparation(&v, 7).is_none());
        crate::logistics::fixture_finish(&mut v, 0);
        assert_eq!(preparation(&v, 7), Some((bundle(&[(2, 2), (0, 1)]), 2)));
        assert_eq!(preparation(&v, 8), Some((bundle(&[(4, 1), (3, 1)]), 2)));
        assert_eq!(g.place("home", 12, 8), "ok");
        let (batch, earth, wood) = {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            crate::logistics::fixture_stock(&mut v, 7, 0);
            v.minutes = 570.;
            rebalance(&mut v);
            assert!(
                local_job(&v).is_none(),
                "Workshop inputs must reach its buffer before preparation is offered"
            );
            let batch = v
                .production
                .batches
                .iter()
                .find(|b| b.material == 7)
                .unwrap()
                .id;
            crate::production::fixture_inputs(&mut v, batch);
            assert_eq!(local_job(&v), Some(("prepare".into(), 7)));
            let earth = quantity(&v, 2);
            let wood = v.wood;
            (batch, earth, wood)
        };
        let mut worker = g
            .app
            .world_mut()
            .query::<&crate::Resident>()
            .iter(g.app.world())
            .next()
            .unwrap()
            .clone();
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(crate::production::assign_batch(&mut worker, &v, batch));
        (worker.x, worker.y) = (worker.target_x, worker.target_y);
        assert!(crate::production::work(&mut v, &worker, 10.));
        assert_eq!(quantity(&v, 7), 2);
        assert_eq!(quantity(&v, 2), earth - 2);
        assert_eq!(v.wood, wood - 1.);
    }
    #[test]
    fn outside_income_is_paid_once_per_resident_shift() {
        let mut g = Game::new();
        g.set_outside_work(true);
        let mut v = g.app.world_mut().resource_mut::<Village>();
        let money = v.economy.money;
        v.economy.outside_committed_days[4] = 0;
        finish_outside(&mut v, 4);
        finish_outside(&mut v, 4);
        finish_outside(&mut v, 0);
        assert_eq!(v.economy.money, money + 22000);
        v.minutes += 1440.;
        v.economy.outside_committed_days[4] = 1;
        finish_outside(&mut v, 4);
        assert_eq!(v.economy.money, money + 44000);
    }
    #[test]
    fn completed_order_history_never_blocks_future_purchases() {
        let mut g = Game::new();
        for _ in 0..125 {
            town_order(&mut g, &[(2, 1)]);
            let id = g.app.world().resource::<Village>().economy.next_order - 1;
            assert_eq!(g.cancel_order(id), "ok");
        }
        let v = g.app.world().resource::<Village>();
        assert_eq!(v.economy.money, 300000);
        assert!(v.economy.orders.len() <= 100);
        let saved = g.snapshot();
        assert!(g.restore(&saved));
    }
    #[test]
    fn full_storage_recovers_by_selling_spares_but_never_reserved_stock() {
        let mut g = Game::new();
        assert_eq!(g.place("garden", 8, 8), "ok");
        let before = g.snapshot();
        assert_ne!(g.sell_material(2, 36), "ok");
        assert_eq!(g.snapshot(), before);
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            for i in 0..COUNT {
                crate::logistics::fixture_stock(&mut v, i, 0);
            }
            crate::logistics::fixture_stock(&mut v, 0, 0);
            crate::logistics::fixture_stock(&mut v, 12, 600);
            v.economy.money = 0;
            rebalance(&mut v);
        }
        assert_eq!(g.sell_material(12, 20), "ok");
        let v = g.app.world().resource::<Village>();
        assert_eq!(storage(v), 580);
        assert_eq!(v.economy.money, 280000);
        town_order(&mut g, &[(2, 4), (0, 4)]);
        let saved = g.snapshot();
        assert!(g.restore(&saved));
    }
    #[test]
    fn house_appearance_survives_earlier_cancellation_and_reload() {
        let mut g = Game::new();
        assert_eq!(g.place("home", 8, 8), "ok");
        assert_eq!(g.place("home", 12, 8), "ok");
        assert_eq!(
            g.app.world().resource::<Village>().economy.projects[1].appearance,
            Some(1)
        );
        assert_eq!(g.cancel_project(0), "ok");
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_eq!(
            g.app.world().resource::<Village>().economy.projects[0].appearance,
            Some(1)
        );
        assert_eq!(g.place("home", 8, 8), "ok");
        assert_eq!(
            g.app.world().resource::<Village>().economy.projects[1].appearance,
            Some(2)
        );
    }
    #[test]
    fn new_ready_work_interrupts_an_autonomous_walk_only_during_work_hours() {
        let mut g = Game::new();
        assert_eq!(g.place("garden", 8, 8), "ok");
        g.app.world_mut().resource_mut::<Village>().minutes = 600.;
        let mut query = g.app.world_mut().query::<&mut crate::Resident>();
        for mut r in query.iter_mut(g.app.world_mut()) {
            r.task = "nature_walk".into();
            r.activity_store = None;
            r.remaining = 24.;
            r.requested = false;
            r.energy = 90.;
            r.hunger = 20.;
            r.social = 90.;
            r.last_meal_slot = 0;
            r.target_x = 20.;
            r.target_y = 20.;
        }
        g.tick(0.25);
        let mut query = g.app.world_mut().query::<&crate::Resident>();
        assert!(
            query
                .iter(g.app.world())
                .filter(|r| r.id < 2)
                .all(|r| r.task == "haul")
        );
        g.app.world_mut().resource_mut::<Village>().minutes = 780.;
        g.tick(0.25);
        assert!(query.iter(g.app.world()).all(|r| r.task != "build"));
    }
    #[test]
    fn tool_maintenance_is_bounded_and_conservation_stops_collection() {
        let mut g = Game::new();
        assert_eq!(g.place_source(0, 5, 5), "ok");
        g.app
            .world_mut()
            .resource_mut::<Village>()
            .progress
            .completed = [true; 4];
        assert_eq!(g.place("workshop", 8, 8), "ok");
        let mut v = g.app.world_mut().resource_mut::<Village>();
        crate::logistics::fixture_finish(&mut v, 0);
        v.economy.sources[0].growth = 1.;
        v.economy.sources[0].remaining = 32.;
        crate::logistics::fixture_stock(&mut v, 0, 0);
        assert_eq!(shortage(&v)[TOOLS], 12);
        assert_eq!(crate::production::demand(&v)[0], 8);
        assert_eq!(local_job(&v), Some(("source".into(), 0)));
        finish_job(&mut v, "source", 0);
        finish_job(&mut v, "source", 0);
        assert_eq!(v.wood, 8.);
        assert!(local_job(&v).is_none());
        crate::logistics::fixture_stock(&mut v, TOOLS, 12);
        rebalance(&mut v);
        assert_eq!(shortage(&v)[0], 0);
        crate::logistics::fixture_stock(&mut v, TOOLS, 0);
        crate::logistics::fixture_stock(&mut v, 0, 0);
        v.progress.use_tools = false;
        assert_eq!(shortage(&v)[0], 0);
        assert!(local_job(&v).is_none());
    }
    #[test]
    fn new_save_rejects_old_versions_and_corrupt_transactions_atomically() {
        let mut g = Game::new();
        let before = g.snapshot();
        let mut bad: serde_json::Value = serde_json::from_str(&before).unwrap();
        bad["village"]["version"] = 2.into();
        assert!(!g.restore(&bad.to_string()));
        bad["village"]["version"] = 3.into();
        bad["village"]["economy"]["money"] = (-1).into();
        assert!(!g.restore(&bad.to_string()));
        assert_eq!(g.snapshot(), before);
    }
}

#[cfg(test)]
mod infrastructure_tests {
    use super::*;
    #[test]
    fn adobe_uses_local_earth_and_appearance_survives_reload_and_recipe_changes() {
        let mut g = Game::new();
        assert_eq!(g.place("home", 5, 5), "ok");
        assert_eq!(g.configure_project(0, 1, false, "adobe"), "ok");
        let r = recipe("home", "adobe").unwrap();
        assert!(r.iter().map(|s| s.items[2]).sum::<u32>() >= 22);
        assert_eq!(r.iter().map(|s| s.items[0]).sum::<u32>(), 0);
        assert_eq!(
            g.app.world().resource::<Village>().economy.projects[0].appearance,
            Some(4)
        );
        let mut restored = Game::new();
        assert!(restored.restore(&g.snapshot()));
        assert_eq!(restored.configure_project(0, 1, false, "standard"), "ok");
        assert_eq!(
            restored.app.world().resource::<Village>().economy.projects[0].appearance,
            Some(0)
        );
    }
    #[test]
    fn completed_storage_adds_capacity_incoming_reserves_it_and_removal_cannot_overfill() {
        let mut g = Game::new();
        g.start_mode("sandbox");
        assert_eq!(g.place("warehouse", 5, 5), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            assert_eq!(capacity(&v), 900);
            for i in 0..COUNT {
                crate::logistics::fixture_stock(&mut v, i, 0);
            }
            crate::logistics::fixture_stock(&mut v, 0, 700);
        }
        let mut restored = Game::new();
        assert!(restored.restore(&g.snapshot()));
        assert!(!g.remove_sandbox_building(0));
        crate::logistics::fixture_stock(&mut g.app.world_mut().resource_mut::<Village>(), 0, 500);
        assert!(g.remove_sandbox_building(0));
        assert_eq!(capacity(g.app.world().resource::<Village>()), 600);
    }
}
