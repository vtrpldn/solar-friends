use bevy_app::{App, Update};
use bevy_ecs::prelude::*;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

mod devtools;
mod ecology;
mod interactions;
mod leisure;
mod power;
mod progression;
mod situations;
mod spacing;
mod supplies;
use progression::Progress;

pub const MAP_SIZE: i32 = 28;
const MINUTES_PER_SECOND: f32 = 3.;
const CAMP: (f32, f32) = (10., 13.);
const TASKS: &[&str] = &[
    "visit",
    "arrive",
    "idle",
    "sleep",
    "eat",
    "rest",
    "cook",
    "build",
    "garden",
    "water",
    "gather",
    "socialize",
    "compost",
    "craft",
    "gathering",
    "nature_walk",
    "birdwatch",
    "stretch",
    "daydream",
    "stargaze",
];

#[derive(Component, Clone, Serialize, Deserialize)]
pub struct Resident {
    pub id: usize,
    pub name: String,
    pub trait_name: String,
    pub favorite: String,
    pub energy: f32,
    pub hunger: f32,
    pub social: f32,
    pub happiness: f32,
    pub x: f32,
    pub y: f32,
    pub target_x: f32,
    pub target_y: f32,
    pub task: String,
    pub reason: String,
    pub remaining: f32,
    pub requested: bool,
    pub last_meal_slot: i32,
    #[serde(default)]
    pub visit_building: Option<usize>,
    #[serde(default)]
    pub activity_building: Option<usize>,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Building {
    pub id: usize,
    pub kind: String,
    pub x: i32,
    pub y: i32,
    pub progress: f32,
    #[serde(default)]
    pub contributors: u8,
    #[serde(default)]
    pub next_visit: f32,
    #[serde(default)]
    pub visits: u32,
    #[serde(default)]
    pub crop: ecology::Crop,
    #[serde(default)]
    pub poultry: supplies::Poultry,
}
#[derive(Resource, Clone, Serialize, Deserialize)]
pub struct Village {
    pub version: u32,
    pub map_size: i32,
    pub minutes: f32,
    pub wood: f32,
    pub food: f32,
    #[serde(default)]
    pub supplies: supplies::Supplies,
    #[serde(default)]
    pub power: power::Power,
    pub water: f32,
    pub meals: u32,
    pub meals_served: u32,
    pub buildings: Vec<Building>,
    #[serde(default)]
    pub roads: Vec<(i32, i32)>,
    pub events: Vec<String>,
    pub harvests: u32,
    #[serde(default)]
    pub seedlings: u32,
    pub arrived: bool,
    pub mornings: u32,
    #[serde(default)]
    pub progress: Progress,
    #[serde(default)]
    pub situations: situations::Situations,
}
#[derive(Resource, Default)]
struct Step(f32);
#[derive(Serialize, Deserialize)]
struct Save {
    village: Village,
    residents: Vec<Resident>,
}
#[wasm_bindgen]
pub struct Game {
    app: App,
}
fn event(v: &mut Village, text: impl Into<String>) {
    let text = text.into();
    if v.events.first() != Some(&text) {
        v.events.insert(0, text);
        v.events.truncate(12);
    }
}
fn river_bank(x: i32, y: i32) -> bool {
    // Keep footprints and resident approach points on the village side.
    x as f32 >= 25.8 + (y as f32 * 0.32).sin() * 0.65 - 2.3
}
fn cost(kind: &str) -> Option<f32> {
    match kind {
        "home" => Some(32.),
        "garden" => Some(12.),
        "greenhouse" => Some(60.),
        "kitchen" => Some(40.),
        "well" => Some(18.),
        "grove" => Some(14.),
        "compost" => Some(20.),
        "square" => Some(36.),
        "workshop" => Some(48.),
        "coop" => Some(24.),
        "solar_farm" => Some(48.),
        "streetlight" => Some(6.),
        _ => None,
    }
}
fn ready(v: &Village, kind: &str) -> bool {
    v.buildings
        .iter()
        .any(|b| b.kind == kind && b.progress >= 100.)
}
fn shelter(v: &Village, id: usize) -> Option<&Building> {
    v.buildings
        .iter()
        .filter(|b| b.kind == "home" && b.progress >= 100.)
        .nth(id / 3)
}
fn sleeping_time(minutes: f32, id: usize) -> bool {
    let m = minutes % 1440.;
    let offset = id as f32 * 10.;
    m >= 1290. + offset || m < 360. + offset
}
fn meal_slot(minutes: f32) -> Option<i32> {
    let m = minutes % 1440.;
    let day = (minutes / 1440.).floor() as i32;
    let slot = if (390.0..510.).contains(&m) {
        0
    } else if (720.0..840.).contains(&m) {
        1
    } else if (1080.0..1200.).contains(&m) {
        2
    } else {
        return None;
    };
    Some(day * 3 + slot)
}
fn work_time(minutes: f32) -> bool {
    let m = minutes % 1440.;
    (540.0..720.).contains(&m) || (900.0..960.).contains(&m)
}
fn available(v: &Village, task: &str) -> bool {
    match task {
        "build" => v.buildings.iter().any(|b| b.progress < 100.),
        "garden" => v
            .buildings
            .iter()
            .any(|b| ecology::needs_tending(b, v.water)),
        "cook" => ready(v, "kitchen") && supplies::can_cook(v),
        "water" => v.water < ecology::capacity(v),
        "compost" => ready(v, "compost") && v.progress.scraps >= 2,
        "craft" => ready(v, "workshop") && v.wood >= 8. && v.progress.tool_uses <= 24,
        "eat" => v.food >= 1. || v.meals > 0,
        "gather" | "rest" | "socialize" | "idle" | "sleep" => true,
        _ => false,
    }
}
fn destination(v: &Village, task: &str, id: usize) -> (f32, f32) {
    if task == "water" {
        return (22.5, 11. + id as f32 * 1.25);
    }
    if task == "sleep" || task == "rest" {
        return shelter(v, id)
            .and_then(|b| {
                if task == "sleep" {
                    Some((b.x as f32 + 0.75, b.y as f32 + 0.75))
                } else {
                    spacing::approach(v, b, id)
                }
            })
            .unwrap_or((CAMP.0 + (id as f32 - 2.) * 1.25, CAMP.1));
    }
    if task == "gather" && !ready(v, "grove") {
        return (3., 11. + id as f32 * 1.25);
    }
    destination_building(v, task, id)
        .and_then(|b| spacing::approach(v, b, id))
        .unwrap_or((CAMP.0 + (id as f32 - 2.) * 1.25, CAMP.1 + 0.5))
}
fn destination_building<'a>(v: &'a Village, task: &str, id: usize) -> Option<&'a Building> {
    let eligible: Vec<_> = v
        .buildings
        .iter()
        .filter(|b| {
            if task == "garden" {
                ecology::needs_tending(b, v.water)
            } else if task == "build" {
                b.progress < 100.
            } else {
                b.progress >= 100.
                    && b.kind
                        == match task {
                            "garden" => "garden",
                            "cook" | "eat" => "kitchen",
                            "socialize" if ready(v, "square") => "square",
                            "socialize" => "kitchen",
                            "gathering" if ready(v, "square") => "square",
                            "gathering" => "kitchen",
                            "compost" => "compost",
                            "craft" => "workshop",
                            "water" => "well",
                            _ => "grove",
                        }
            }
        })
        .collect();
    if eligible.is_empty() {
        return None;
    }
    // Small teams can still build together while several projects or gardens
    // receive attention instead of everyone choosing the first one.
    let group = if matches!(task, "build" | "garden") {
        id / 2
    } else {
        id
    };
    Some(eligible[group % eligible.len()])
}
// Each resident has a separate set of quiet spots, spaced three tiles apart.
// Derive the choice from saved time so loading a village keeps the same routine.
fn idle_destination(v: &Village, id: usize) -> Option<(f32, f32)> {
    let spots: Vec<_> = (0..49)
        .filter(|index| index % 5 == id)
        .map(|index| (4.5 + (index % 7) as f32 * 3., 5.5 + (index / 7) as f32 * 3.))
        .filter(|&(x, y)| {
            !river_bank(x as i32, y as i32)
                && v.buildings.iter().all(|b| {
                    (x - (b.x as f32 + 0.5)).abs() > 1.75 || (y - (b.y as f32 + 0.5)).abs() > 1.75
                })
        })
        .collect();
    if spots.is_empty() {
        return None;
    }
    let visit = (v.minutes / (90. + id as f32 * 13.)).floor() as usize;
    Some(spots[(visit + id) % spots.len()])
}

fn assign(r: &mut Resident, v: &Village, task: &str, reason: &str, requested: bool) {
    r.visit_building = None;
    r.activity_building = if matches!(task, "sleep" | "rest") {
        shelter(v, r.id).map(|b| b.id)
    } else if matches!(task, "idle" | "water" | "visit") || leisure::hobby(task) {
        None
    } else {
        destination_building(v, task, r.id).map(|b| b.id)
    };
    r.task = task.into();
    r.reason = reason.into();
    r.requested = requested;
    r.remaining = match task {
        "sleep" => 60.,
        "eat" => 5.,
        "rest" | "socialize" | "idle" => 12.,
        _ => 10.,
    };
    if task != "sleep"
        && r.activity_building
            .is_some_and(|id| spacing::approach(v, &v.buildings[id], r.id).is_none())
    {
        r.activity_building = None;
        r.task = "rest".into();
        r.reason = "Taking a break where there is room. That building is too crowded.".into();
        (r.target_x, r.target_y) =
            idle_destination(v, r.id).unwrap_or((CAMP.0 + (r.id as f32 - 2.) * 1.25, CAMP.1));
        return;
    }
    if task == "idle" || leisure::hobby(task) {
        r.remaining = 24. + r.id as f32 * 2.;
        (r.target_x, r.target_y) = idle_destination(v, r.id).unwrap_or((r.x, r.y));
    } else {
        (r.target_x, r.target_y) = destination(v, task, r.id);
    }
}
fn choose(r: &mut Resident, v: &Village) {
    let meal_due = meal_slot(v.minutes).is_some_and(|s| s != r.last_meal_slot);
    let (task, reason) = if sleeping_time(v.minutes, r.id) {
        (
            "sleep",
            if shelter(v, r.id).is_some() {
                "Time for bed. A roof makes all the difference."
            } else {
                "Sleeping at our arrival spot. We still need shelter."
            },
        )
    } else if (meal_due || r.hunger > 60. || (v.meals > 0 && r.hunger > 30.)) && available(v, "eat")
    {
        (
            "eat",
            if v.meals > 0 {
                "Sitting down for a cooked meal."
            } else {
                "Eating available ingredients while we wait for a cooked meal."
            },
        )
    } else if r.energy < 28. {
        ("rest", "I need a break before I can help again.")
    } else if v.progress.gathering_until > v.minutes && v.progress.invited & (1 << r.id) != 0 {
        (
            "gathering",
            "Sharing food and stories in our community square.",
        )
    } else if situations::apply_agreement(r, v) {
        return;
    } else if supplies::urgent(v) {
        ("gather", "Foraging wild food to keep everyone fed.")
    } else if !work_time(v.minutes) {
        leisure::choose(r, v)
    } else if v.water < 24. && available(v, "water") {
        ("water", "Carrying river water back to our storage.")
    } else if supplies::needs_meals(v)
        && available(v, "cook")
        && !situations::protected(v, r.id, "cook")
        && (r.id == (v.minutes / 1440.) as usize % 5 || v.meals < 3 || situations::helping(v, r.id))
    {
        (
            "cook",
            if situations::helping(v, r.id) {
                "Taking a kitchen shift so our neighbour can have time back."
            } else {
                "Preparing a pot of food for everyone."
            },
        )
    } else if available(v, "build") && r.favorite == "build" {
        (
            "build",
            "A little progress on our shared project before taking a break.",
        )
    } else if r.favorite == "gather" && v.wood < 48. {
        (
            "gather",
            "Collecting a little timber for our shared projects.",
        )
    } else if supplies::needs_ingredients(v) && available(v, "garden") {
        ("garden", "Our next meals start in the garden.")
    } else if available(v, "build") && (r.favorite == "build" || r.id.is_multiple_of(2)) {
        ("build", "Let's get our basic infrastructure ready.")
    } else if available(v, "compost") && v.progress.compost < 4 {
        (
            "compost",
            "Turning kitchen scraps into nourishment for our soil.",
        )
    } else if supplies::needs_ingredients(v) {
        (
            "gather",
            "Gathering a little fresh food for the next few meals.",
        )
    } else if v.wood < 64. {
        ("gather", "Collecting fallen timber for our next building.")
    } else if v.progress.use_tools && v.progress.tool_uses == 0 && available(v, "craft") {
        ("craft", "Making tools for our next shared project.")
    } else if r.favorite == "water" && v.water < 70. && available(v, "water") {
        ("water", "Making sure we have water for tomorrow.")
    } else if r.social < 55. {
        ("socialize", "A little company would be good.")
    } else {
        leisure::choose(r, v)
    };
    assign(r, v, task, reason, false);
}
fn request_blocker(v: &Village, r: &Resident, task: &str, encourage: bool) -> Option<String> {
    let id = r.id;
    if !matches!(
        task,
        "build"
            | "garden"
            | "cook"
            | "water"
            | "eat"
            | "gather"
            | "rest"
            | "socialize"
            | "compost"
            | "craft"
    ) {
        return Some("That request is not available.".into());
    }
    if situations::protected(v, id, task) {
        return Some(
            "We agreed to cover this work. Let our neighbour have their time back.".into(),
        );
    }
    if !available(v, task) {
        return Some(
            match task {
                "build" => "There are no construction projects yet.",
                "garden" => {
                    "Gardens need planting, two water when dry, or time to grow before harvest."
                }
                "cook" => "We need a kitchen, three food and one water first.",
                "compost" => "We need a compost station and two kitchen scraps first.",
                "craft" => {
                    "We need a workshop, eight timber and room for more tools (at most 36 uses)."
                }
                "eat" => "We need food or a prepared meal first.",
                _ => "That task is not available yet.",
            }
            .into(),
        );
    }
    if r.task == "arrive" {
        return Some(format!("{}: Let me reach the clearing first.", r.name));
    }
    if sleeping_time(v.minutes, id) && task != "rest" {
        return Some(format!(
            "{}: It is bedtime. Let's pick this up in the morning.",
            r.name
        ));
    }
    if !matches!(task, "rest" | "eat") && r.energy < 25. {
        return Some(format!(
            "{}: I need to rest first. Ask me when I have more energy.",
            r.name
        ));
    }
    if !matches!(task, "rest" | "eat" | "cook") && r.hunger > 75. {
        return Some(format!("{}: I need a meal before I can help.", r.name));
    }
    if task != r.favorite && !matches!(task, "rest" | "eat") && r.energy < 55. && !encourage {
        return Some(format!(
            "{}: I'd rather save my energy. Could we talk about why it matters?",
            r.name
        ));
    }
    None
}
fn simulate(step: Res<Step>, mut v: ResMut<Village>, mut people: Query<&mut Resident>) {
    let dt = step.0;
    if dt <= 0. {
        return;
    }
    let before = v.minutes;
    v.minutes += dt * MINUTES_PER_SECOND;
    supplies::advance(&mut v, dt * MINUTES_PER_SECOND);
    power::advance(&mut v, dt * MINUTES_PER_SECOND);
    ecology::advance(&mut v, dt * MINUTES_PER_SECOND);
    situations::advance(&mut v, dt * MINUTES_PER_SECOND);
    if ((before - 360.) / 1440.).floor() < ((v.minutes - 360.) / 1440.).floor() {
        v.mornings += 1;
        event(&mut v, "A new morning. The community is waking up.");
    }
    if v.progress.gathering_until > 0. && v.minutes >= v.progress.gathering_until {
        let attended = v.progress.attended;
        if attended.count_ones() >= 3 {
            v.progress.gatherings += 1;
            v.progress.welcome_supper = true;
            v.meals_served += attended.count_ones();
            for mut r in &mut people {
                if attended & (1 << r.id) != 0 {
                    r.social = (r.social + 25.).min(100.);
                    r.hunger = (r.hunger - 35.).max(0.);
                    for other in 0..5 {
                        if other != r.id && attended & (1 << other) != 0 {
                            let bond = &mut v.progress.friendships[r.id * 5 + other];
                            *bond = bond.saturating_add(1);
                        }
                    }
                }
            }
            event(
                &mut v,
                "Food, stories and closer friendships. A gathering to remember.",
            );
        } else {
            event(
                &mut v,
                "Too few neighbours made it to the square. Try gathering closer to home tomorrow.",
            );
        }
        v.progress.gathering_until = 0.;
        v.progress.invited = 0;
        v.progress.attended = 0;
        for mut r in &mut people {
            if r.task == "gathering" {
                r.remaining = 0.;
            }
        }
    }
    let square_visitors: Vec<(usize, usize)> = people
        .iter()
        .filter_map(|r| {
            let b = v.buildings.iter().find(|b| {
                b.kind == "square"
                    && b.progress >= 100.
                    && r.activity_building == Some(b.id)
                    && (r.x - r.target_x).hypot(r.y - r.target_y) <= 0.08
            })?;
            Some((r.id, b.id))
        })
        .collect();
    let neighbours: Vec<_> = people
        .iter()
        .filter(|r| {
            !(r.task == "sleep"
                && shelter(&v, r.id).is_some()
                && (r.x - r.target_x).hypot(r.y - r.target_y) <= 0.08)
        })
        .map(|r| (r.id, r.x, r.y))
        .collect();
    let builders: Vec<usize> = people
        .iter()
        .filter(|r| r.task == "build" && (r.x - r.target_x).hypot(r.y - r.target_y) <= 0.08)
        .filter_map(|r| spacing::building(r, &v))
        .collect();
    for mut r in &mut people {
        let sleeping = r.task == "sleep";
        r.hunger = (r.hunger + dt * if sleeping { 0.045 } else { 0.13 }).min(100.);
        r.social = (r.social - dt * 0.035).max(0.);
        v.water = (v.water - dt * if sleeping { 0.002 } else { 0.009 }).max(0.);
        let chores_finished = !r.requested
            && !work_time(v.minutes)
            && matches!(
                r.task.as_str(),
                "build" | "garden" | "water" | "cook" | "compost" | "craft" | "gather" | "visit"
            )
            && !(r.task == "gather" && supplies::urgent(&v));
        let chores_start = !r.requested
            && work_time(v.minutes)
            && !work_time(before)
            && (leisure::hobby(&r.task) || matches!(r.task.as_str(), "idle" | "socialize"));
        if r.task != "arrive"
            && (sleeping_time(v.minutes, r.id) != (r.task == "sleep")
                || r.remaining <= 0.
                || chores_finished
                || chores_start)
        {
            choose(&mut r, &v);
        }
        let dx = r.target_x - r.x;
        let dy = r.target_y - r.y;
        let d = dx.hypot(dy);
        if d > 0.08 {
            spacing::walk(&mut r, &neighbours, dt);
            r.energy = (r.energy - dt * 0.035).max(0.);
            continue;
        }
        if r.task == "arrive" {
            choose(&mut r, &v);
            continue;
        }
        r.remaining = (r.remaining - dt).max(0.);
        match r.task.as_str() {
            "sleep" => {
                r.energy = (r.energy
                    + dt * if shelter(&v, r.id).is_some() {
                        0.48
                    } else {
                        0.20
                    })
                .min(100.);
            }
            "rest" => r.energy = (r.energy + dt * 0.65).min(100.),
            "socialize" | "gathering" => {
                r.social = (r.social + dt * 1.3).min(100.);
                r.energy = (r.energy + dt * 0.12).min(100.);
            }
            task if leisure::hobby(task) => {
                r.energy = (r.energy + dt * 0.3).min(100.);
            }
            "idle" | "eat" => r.energy = (r.energy + dt * 0.08).min(100.),
            _ => r.energy = (r.energy - dt * 0.11).max(0.),
        }
        if leisure::hobby(&r.task) || matches!(r.task.as_str(), "rest" | "socialize" | "gathering")
        {
            situations::recovered(&mut v, r.id, dt * MINUTES_PER_SECOND);
        }
        if r.task == "gathering" && v.progress.gathering_until > v.minutes {
            v.progress.attended |= 1 << r.id;
        }
        if r.task == "build" {
            let tool_bonus = if v.progress.use_tools && v.progress.tool_uses > 0 {
                1.25
            } else {
                1.
            };
            let building = spacing::building(&r, &v);
            let helpers = builders.iter().filter(|&&id| Some(id) == building).count();
            if let Some(b) = v
                .buildings
                .iter_mut()
                .find(|b| b.progress < 100. && Some(b.id) == building)
            {
                b.contributors |= 1 << r.id;
                b.progress = (b.progress
                    + dt * if r.favorite == "build" { 2.5 } else { 1.5 }
                        * if helpers > 1 { 1.2 } else { 1. }
                        * tool_bonus)
                    .min(100.);
                if b.progress >= 100. {
                    let shared = b.contributors.count_ones() >= 2;
                    let label = match b.kind.as_str() {
                        "home" => "home (three beds)",
                        "well" => "cistern",
                        k => k,
                    }
                    .to_string();
                    if shared {
                        v.progress.shared_builds += 1;
                    }
                    progression::use_tool(&mut v);
                    event(&mut v, format!("Our {label} is ready. Built together!"));
                }
            } else {
                r.remaining = 0.;
            }
        }
        if r.remaining <= 0. {
            match r.task.as_str() {
                "visit" => {
                    interactions::finish(&mut v, &mut r);
                    if let Some(id) = r.visit_building
                        && v.buildings[id].kind == "square"
                    {
                        for &(other, building) in &square_visitors {
                            if other != r.id && building == id {
                                let bond = &mut v.progress.friendships[r.id * 5 + other];
                                *bond = bond.saturating_add(1);
                                let reverse = &mut v.progress.friendships[other * 5 + r.id];
                                *reverse = reverse.saturating_add(1);
                            }
                        }
                    }
                }
                "gather" => {
                    if r.requested || v.wood < 64. {
                        let timber = if r.favorite == "gather" { 6 } else { 4 }
                            + if progression::use_tool(&mut v) { 2 } else { 0 };
                        v.wood += timber as f32;
                        v.progress.timber = v.progress.timber.saturating_add(timber);
                    }
                    if supplies::needs_ingredients(&v) || (r.requested && ready(&v, "grove")) {
                        v.food += 2.;
                        v.supplies.gathered += 2.;
                        if ready(&v, "grove") {
                            v.progress.fruit = v.progress.fruit.saturating_add(2);
                        }
                    }
                }
                "garden" if r.requested || supplies::needs_ingredients(&v) => {
                    ecology::tend(&mut v, &r)
                }
                "water" if v.water < ecology::capacity(&v) => {
                    v.water = (v.water + 18.).min(ecology::capacity(&v));
                }
                "cook" if supplies::can_cook(&v) && (r.requested || supplies::needs_meals(&v)) => {
                    supplies::cook(&mut v);
                    situations::cooked(&mut v, r.id);
                }
                "compost" if v.progress.scraps >= 2 => {
                    v.progress.scraps -= 2;
                    v.progress.compost += 1;
                }
                "craft" if v.wood >= 8. && v.progress.tool_uses <= 24 => {
                    v.wood -= 8.;
                    v.progress.tool_uses += 12;
                    v.progress.tools_crafted += 1;
                }
                "socialize" => {
                    v.progress.social_mask |= 1 << r.id;
                }
                "eat" => {
                    let fed = if v.meals > 0 {
                        v.meals -= 1;
                        v.meals_served += 1;
                        v.supplies.portions_eaten += 1;
                        r.hunger = (r.hunger - 65.).max(0.);
                        r.social = (r.social + 8.).min(100.);
                        true
                    } else if v.food >= 1. {
                        v.food -= 1.;
                        v.supplies.used += 1.;
                        v.supplies.portions_eaten += 1;
                        r.hunger = (r.hunger - 45.).max(0.);
                        true
                    } else {
                        false
                    };
                    if fed && let Some(slot) = meal_slot(v.minutes) {
                        r.last_meal_slot = slot;
                    }
                }
                _ => {}
            }
        }
        let comfort = if shelter(&v, r.id).is_some() { 8. } else { 0. };
        r.happiness = (r.energy * 0.30 + (100. - r.hunger) * 0.35 + r.social * 0.25 + comfort
            - situations::concern(&v, r.id))
        .clamp(0., 100.);
    }
    if !v.arrived && people.iter().all(|r| r.task != "arrive") {
        v.arrived = true;
        event(
            &mut v,
            "Everyone has arrived. Start with a cistern and a home.",
        );
    }
    progression::update(&mut v);
}
#[wasm_bindgen]
impl Game {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        let mut app = App::new();
        app.insert_resource(Step::default())
            .insert_resource(Village {
                version: 2,
                map_size: MAP_SIZE,
                minutes: 480.,
                wood: 110.,
                food: 36.,
                supplies: supplies::Supplies::default(),
                power: power::Power::default(),
                water: 32.,
                meals: 0,
                meals_served: 0,
                buildings: vec![],
                roads: vec![],
                events: vec!["Five friends, one empty lot. Your new beginning starts here.".into()],
                harvests: 0,
                seedlings: 0,
                arrived: false,
                mornings: 0,
                progress: Progress::default(),
                situations: situations::Situations::default(),
            })
            .insert_resource(devtools::Diagnostics::default())
            .add_systems(Update, (simulate, devtools::record).chain());
        for (id, (name, traits, favorite)) in [
            ("Iara", "Patient · gardener", "garden"),
            ("Bento", "Practical · builder", "build"),
            ("Luz", "Sociable · cook", "cook"),
            ("Cauã", "Curious · forager", "gather"),
            ("Nina", "Thoughtful · caretaker", "water"),
        ]
        .iter()
        .enumerate()
        {
            app.world_mut().spawn(Resident {
                id,
                name: name.to_string(),
                trait_name: traits.to_string(),
                favorite: favorite.to_string(),
                energy: 88. - id as f32 * 3.,
                hunger: 22. + id as f32 * 3.,
                social: 70.,
                happiness: 75.,
                x: 7.5 + id as f32 * 1.25,
                y: 18.5 + id as f32 * 0.15,
                target_x: CAMP.0 + (id as f32 - 2.) * 1.25,
                target_y: CAMP.1,
                task: "arrive".into(),
                reason: "Walking into the clearing with our founding group.".into(),
                remaining: 0.,
                requested: false,
                last_meal_slot: -1,
                visit_building: None,
                activity_building: None,
            });
        }
        Self { app }
    }
    pub fn tick(&mut self, seconds: f32) {
        if seconds.is_finite() {
            self.app.world_mut().resource_mut::<Step>().0 = seconds.clamp(0., 0.25);
            self.app.update();
        }
    }
    pub fn snapshot(&mut self) -> String {
        let village = self.app.world().resource::<Village>().clone();
        let residents: Vec<_> = self
            .app
            .world_mut()
            .query::<&Resident>()
            .iter(self.app.world())
            .cloned()
            .collect();
        serde_json::json!({
            "environment": {
                "raining": ecology::raining(village.minutes),
                "water_capacity": ecology::capacity(&village),
                "power": power::supply(&village),
                "dry_day": (village.minutes / 1440.) as u32 % 3 == 2,
            },
            "village": village,
            "residents": residents,
        })
        .to_string()
    }
    pub fn set_power_enabled(&mut self, building: usize, enabled: bool) -> bool {
        let mut v = self.app.world_mut().resource_mut::<Village>();
        if !v
            .buildings
            .get(building)
            .is_some_and(|b| power::load(&b.kind) > 0.)
        {
            return false;
        }
        v.power.disabled.retain(|id| *id != building);
        if !enabled {
            v.power.disabled.push(building);
        }
        true
    }
    pub fn configure_crop(&mut self, building: usize, kind: &str, replant: bool) -> bool {
        if !ecology::crop_kind(kind) {
            return false;
        }
        let mut v = self.app.world_mut().resource_mut::<Village>();
        let Some(b) = v.buildings.get_mut(building) else {
            return false;
        };
        if !ecology::farm(b) {
            return false;
        }
        b.crop.next_kind = kind.into();
        b.crop.replant = replant;
        if !b.crop.planted {
            b.crop.kind = kind.into();
        }
        true
    }
    pub fn visit_building(&mut self, resident: usize, building: usize) -> String {
        let v = self.app.world().resource::<Village>().clone();
        let Some(b) = v.buildings.get(building) else {
            return "Building not found.".into();
        };
        if b.progress < 100. {
            return "Finish construction before using this building.".into();
        }
        let mut query = self.app.world_mut().query::<&mut Resident>();
        let Some(mut r) = query
            .iter_mut(self.app.world_mut())
            .find(|r| r.id == resident)
        else {
            return "Resident not found.".into();
        };
        if r.task == "arrive"
            || sleeping_time(v.minutes, resident)
            || r.energy < 25.
            || r.hunger > 75.
        {
            return format!(
                "{} needs to finish arriving, eat or rest before visiting.",
                r.name
            );
        }
        if situations::protected(
            &v,
            resident,
            if b.kind == "kitchen" { "cook" } else { "visit" },
        ) {
            return "We agreed to cover this work. Let our neighbour have their time back.".into();
        }
        interactions::start(&mut r, &v, building, true);
        format!("{}: {}", r.name, r.reason)
    }
    pub fn set_food_preferences(&mut self, feed_hens: bool, use_eggs: bool) {
        let mut v = self.app.world_mut().resource_mut::<Village>();
        v.supplies.feed_hens = feed_hens;
        v.supplies.use_eggs = use_eggs;
    }
    pub fn toggle_road(&mut self, x: i32, y: i32) -> String {
        let mut v = self.app.world_mut().resource_mut::<Village>();
        if let Some(index) = v.roads.iter().position(|tile| *tile == (x, y)) {
            v.roads.remove(index);
            return "ok".into();
        }
        if !(1..=MAP_SIZE - 2).contains(&x) || !(1..=MAP_SIZE - 2).contains(&y) || river_bank(x, y)
        {
            return "Place roads inside the lot, away from the riverbank.".into();
        }
        if v.buildings.iter().any(|b| interactions::occupies(b, x, y)) {
            return "Choose a tile beside the building.".into();
        }
        v.roads.push((x, y));
        "ok".into()
    }
    pub fn place(&mut self, kind: &str, x: i32, y: i32) -> String {
        let Some(price) = cost(kind) else {
            return "Unknown building.".into();
        };
        let mut v = self.app.world_mut().resource_mut::<Village>();
        if !progression::unlocked(&v, kind) {
            return "Complete the linked quest in the village journal to unlock this building."
                .into();
        }
        if !(1..=MAP_SIZE - 2).contains(&x) || !(1..=MAP_SIZE - 2).contains(&y) {
            return "Choose a clearing inside the marked lot.".into();
        }
        let radius = interactions::radius(kind);
        if x - radius < 0
            || y - radius < 0
            || x + radius >= MAP_SIZE
            || y + radius >= MAP_SIZE
            || river_bank(x + radius - 1, y)
        {
            return "Keep the river and its banks clear. Choose a clearing farther inland.".into();
        }
        if (x as f32 - CAMP.0).abs() < radius as f32 + 0.5
            && (y as f32 - CAMP.1).abs() < radius as f32 + 0.5
        {
            return "Keep the arrival clearing free for gathering and supplies.".into();
        }
        if v.buildings.iter().any(|b| {
            (b.x - x).abs() < interactions::radius(&b.kind) + radius
                && (b.y - y).abs() < interactions::radius(&b.kind) + radius
        }) {
            return "Leave a little room between buildings.".into();
        }
        let size = interactions::footprint_size(kind);
        if v.roads.iter().any(|&(rx, ry)| {
            (x - size / 2..x - size / 2 + size).contains(&rx)
                && (y - size / 2..y - size / 2 + size).contains(&ry)
        }) {
            return "Keep roads clear. Choose a plot beside the road.".into();
        }
        if v.wood < price {
            return format!("We need {} timber for this project.", price as i32);
        }
        v.wood -= price;
        let id = v.buildings.len();
        v.buildings.push(Building {
            id,
            kind: kind.into(),
            x,
            y,
            progress: 0.,
            contributors: 0,
            next_visit: 0.,
            visits: 0,
            crop: ecology::Crop::default(),
            poultry: supplies::Poultry::default(),
        });
        event(
            &mut v,
            format!("A new {kind} is planned. Residents can help build it."),
        );
        "ok".into()
    }
    pub fn request(&mut self, id: usize, task: &str, encourage: bool) -> String {
        let v = self.app.world().resource::<Village>().clone();
        let mut query = self.app.world_mut().query::<&mut Resident>();
        let Some(mut r) = query.iter_mut(self.app.world_mut()).find(|r| r.id == id) else {
            return "Resident not found.".into();
        };
        if let Some(reason) = request_blocker(&v, &r, task, encourage) {
            return reason;
        }
        let reason = if encourage {
            "You explained why this matters. I'll lend a hand."
        } else {
            "Happy to help with your request."
        };
        assign(&mut r, &v, task, reason, true);
        format!("{}: {}", r.name, reason)
    }
    pub fn respond_situation(&mut self, response: &str) -> String {
        let result = situations::respond(
            &mut self.app.world_mut().resource_mut::<Village>(),
            response,
        );
        if result == "ok" {
            let v = self.app.world().resource::<Village>().clone();
            let mut query = self.app.world_mut().query::<&mut Resident>();
            for mut r in query.iter_mut(self.app.world_mut()) {
                if situations::protected(&v, r.id, &r.task) {
                    r.remaining = 0.;
                }
            }
        }
        result
    }
    pub fn track_quest(&mut self, quest: usize) -> bool {
        let mut v = self.app.world_mut().resource_mut::<Village>();
        if quest >= 4 || (quest > 0 && !v.progress.completed[0]) {
            return false;
        }
        v.progress.tracked = quest;
        true
    }
    pub fn set_tools_enabled(&mut self, enabled: bool) {
        self.app
            .world_mut()
            .resource_mut::<Village>()
            .progress
            .use_tools = enabled;
    }
    pub fn contribute_workshop_timber(&mut self) -> String {
        let mut v = self.app.world_mut().resource_mut::<Village>();
        if !v.progress.completed[0] {
            return "Finish A Shared Beginning first.".into();
        }
        if v.progress.workshop_timber {
            return "The workshop timber is already set aside.".into();
        }
        if v.wood < 24. {
            return "Gather 24 timber to set aside for our tool library.".into();
        }
        v.wood -= 24.;
        v.progress.workshop_timber = true;
        event(
            &mut v,
            "Timber set aside for our first tool library. Bento has a plan!",
        );
        progression::update(&mut v);
        "ok".into()
    }
    pub fn host_gathering(&mut self) -> String {
        let v = self.app.world().resource::<Village>();
        if !ready(v, "square")
            && !(v.progress.completed[0] && ready(v, "kitchen") && !v.progress.welcome_supper)
        {
            return "Build a community square first, or finish the introduction to host a welcome supper at the kitchen.".into();
        }
        let day = (v.minutes / 1440.).floor() as i32;
        if v.progress.gathering_until > 0. || v.progress.gathering_day == day {
            return "We can host one gathering each day. Come back tomorrow.".into();
        }
        if !(480.0..1080.).contains(&(v.minutes % 1440.)) {
            return "Start a gathering between 08:00 and 18:00, with time before bed.".into();
        }
        if v.meals < 5 {
            return "Set aside five prepared meals for the gathering.".into();
        }
        let mut invited: u8 = 0;
        let mut q = self.app.world_mut().query::<&Resident>();
        for r in q.iter(self.app.world()) {
            if r.energy >= 25. && r.hunger <= 75. && r.task != "arrive" {
                invited |= 1 << r.id;
            }
        }
        if invited.count_ones() < 3 {
            return "At least three neighbours need to be rested and fed.".into();
        }
        let mut v = self.app.world_mut().resource_mut::<Village>();
        v.meals -= 5;
        v.progress.gathering_day = day;
        v.progress.gathering_until = v.minutes + 120.;
        v.progress.invited = invited;
        v.progress.attended = 0;
        event(
            &mut v,
            "A gathering is starting! Neighbours are heading to our shared table.",
        );
        let v = v.clone();
        let mut q = self.app.world_mut().query::<&mut Resident>();
        for mut r in q.iter_mut(self.app.world_mut()) {
            if invited & (1 << r.id) != 0 {
                assign(
                    &mut r,
                    &v,
                    "gathering",
                    "Sharing food and stories at our shared table.",
                    true,
                );
            }
        }
        "ok".into()
    }
    pub fn restore(&mut self, data: &str) -> bool {
        let Ok(mut save) = serde_json::from_str::<Save>(data) else {
            return false;
        };
        let v = &save.village;
        let mut road_tiles = std::collections::HashSet::new();
        if v.roads.len() > ((MAP_SIZE - 2) * (MAP_SIZE - 2)) as usize
            || v.roads.iter().any(|&(x, y)| {
                !(1..=MAP_SIZE - 2).contains(&x)
                    || !(1..=MAP_SIZE - 2).contains(&y)
                    || river_bank(x, y)
                    || !road_tiles.insert((x, y))
            })
        {
            return false;
        }
        if !supplies::valid(v) || !power::valid(v) {
            return false;
        }
        let p = &v.progress;
        if !situations::valid(v)
            || p.tracked >= 4
            || p.social_mask > 31
            || p.invited > 31
            || p.attended > 31
            || p.tool_uses > 36
            || p.gathering_day < -1
            || !p.gathering_until.is_finite()
            || p.gathering_until < 0.
            || (p.gathering_until > 0.
                && (p.gathering_until <= v.minutes || p.gathering_until > v.minutes + 120.))
        {
            return false;
        }
        if v.seedlings > 12
            || v.version != 2
            || (v.map_size != MAP_SIZE && v.map_size != 20)
            || save.residents.len() != 5
            || v.buildings.len() > ((MAP_SIZE - 2) * (MAP_SIZE - 2)) as usize
            || !v.minutes.is_finite()
            || v.minutes < 0.
            || [v.wood, v.food, v.water]
                .iter()
                .any(|n| !n.is_finite() || *n < 0.)
        {
            return false;
        }
        let mut ids = std::collections::HashSet::new();
        if save.residents.iter().any(|r| {
            r.id >= 5
                || !ids.insert(r.id)
                || [r.energy, r.hunger, r.social, r.happiness]
                    .iter()
                    .any(|n| !n.is_finite() || !(0.0..=100.).contains(n))
                || [r.x, r.y, r.target_x, r.target_y]
                    .iter()
                    .any(|n| !n.is_finite() || !(0.0..=MAP_SIZE as f32).contains(n))
                || !r.remaining.is_finite()
                || !(0.0..=100.).contains(&r.remaining)
                || r.visit_building.is_some_and(|id| id >= v.buildings.len())
                || r.activity_building
                    .is_some_and(|id| id >= v.buildings.len())
                || !TASKS.contains(&r.task.as_str())
        }) {
            return false;
        }
        if v.buildings.iter().enumerate().any(|(i, b)| {
            !b.next_visit.is_finite()
                || b.next_visit < 0.
                || b.id != i
                || !ecology::valid(b)
                || b.contributors > 31
                || cost(&b.kind).is_none()
                || !(1..=MAP_SIZE - 2).contains(&b.x)
                || !(1..=MAP_SIZE - 2).contains(&b.y)
                || river_bank(b.x, b.y)
                || !b.progress.is_finite()
                || !(0.0..=100.).contains(&b.progress)
        }) {
            return false;
        }
        let entities: Vec<Entity> = self
            .app
            .world_mut()
            .query_filtered::<Entity, With<Resident>>()
            .iter(self.app.world())
            .collect();
        for e in entities {
            self.app.world_mut().despawn(e);
        }
        for r in save.residents {
            self.app.world_mut().spawn(r);
        }
        save.village.map_size = MAP_SIZE;
        progression::update(&mut save.village);
        self.app.insert_resource(save.village);
        self.app
            .world_mut()
            .resource_mut::<devtools::Diagnostics>()
            .clear_history();
        true
    }
}
impl Default for Game {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn player_roads_persist_toggle_and_validate() {
        let mut g = Game::new();
        assert_eq!(g.toggle_road(5, 5), "ok");
        assert_eq!(g.toggle_road(6, 5), "ok");
        assert_ne!(g.toggle_road(25, 5), "ok");
        assert_ne!(g.toggle_road(0, 5), "ok");
        assert_eq!(g.place("home", 8, 8), "ok");
        assert_ne!(g.toggle_road(8, 8), "ok");
        let mut restored = Game::new();
        assert!(restored.restore(&g.snapshot()));
        assert_eq!(
            restored.app.world().resource::<Village>().roads,
            vec![(5, 5), (6, 5)]
        );
        assert_eq!(restored.toggle_road(5, 5), "ok");
        assert_eq!(
            restored.app.world().resource::<Village>().roads,
            vec![(6, 5)]
        );
        let mut old: serde_json::Value = serde_json::from_str(&g.snapshot()).unwrap();
        old["village"].as_object_mut().unwrap().remove("roads");
        assert!(restored.restore(&old.to_string()));
        restored.tick(60.);
        assert!(restored.app.world().resource::<Village>().roads.is_empty());
        old["village"]["roads"] = serde_json::json!([[5, 5], [5, 5]]);
        assert!(!restored.restore(&old.to_string()));
        old["village"]["roads"] = serde_json::json!([[25, 5]]);
        assert!(!restored.restore(&old.to_string()));
    }
    #[test]
    fn idle_residents_spread_out_and_keep_individual_routines_after_reload() {
        let mut g = Game::new();
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.minutes = 900.;
            v.water = 100.;
            v.food = 100.;
        }
        let mut q = g.app.world_mut().query::<&mut Resident>();
        for mut r in q.iter_mut(g.app.world_mut()) {
            r.task = "idle".into();
            r.remaining = 0.;
            r.social = 100.;
            r.hunger = 0.;
        }
        g.tick(0.25);
        let initial: Save = serde_json::from_str(&g.snapshot()).unwrap();
        let mut restored = Game::new();
        assert!(restored.restore(&g.snapshot()));
        for _ in 0..240 {
            g.tick(0.25);
            restored.tick(0.25);
        }
        assert_eq!(g.snapshot(), restored.snapshot());
        let later: Save = serde_json::from_str(&g.snapshot()).unwrap();
        for residents in [&initial.residents, &later.residents] {
            for (i, r) in residents.iter().enumerate() {
                assert!(leisure::hobby(&r.task));
                for other in &residents[i + 1..] {
                    assert!((r.target_x - other.target_x).hypot(r.target_y - other.target_y) >= 3.);
                }
            }
        }
        for (i, r) in later.residents.iter().enumerate() {
            for other in &later.residents[i + 1..] {
                assert!((r.x - other.x).hypot(r.y - other.y) >= 2.);
            }
        }
        assert!(
            initial
                .residents
                .iter()
                .zip(&later.residents)
                .any(|(a, b)| { (a.target_x, a.target_y) != (b.target_x, b.target_y) })
        );
    }

    #[test]
    fn idle_spots_avoid_construction_and_do_not_default_to_a_grove() {
        let g = Game::new();
        let mut v = g.app.world().resource::<Village>().clone();
        for id in 0..5 {
            let (x, y) = idle_destination(&v, id).unwrap();
            v.buildings.push(Building {
                id,
                kind: "grove".into(),
                x: x.floor() as i32,
                y: y.floor() as i32,
                progress: if id % 2 == 0 { 100. } else { 0. },
                contributors: 0,
                next_visit: 0.,
                visits: 0,
                crop: ecology::Crop::default(),
                poultry: supplies::Poultry::default(),
            });
        }
        for minutes in (0..2880).step_by(30) {
            v.minutes = minutes as f32;
            for id in 0..5 {
                let (x, y) = idle_destination(&v, id).unwrap();
                assert!(!river_bank(x as i32, y as i32));
                assert!(v.buildings.iter().all(|b| {
                    (x - (b.x as f32 + 0.5)).abs() > 1.75 || (y - (b.y as f32 + 0.5)).abs() > 1.75
                }));
            }
        }
    }

    fn advance(g: &mut Game, seconds: f32) {
        for _ in 0..(seconds / 0.2) as usize {
            g.tick(0.2);
        }
    }
    fn arrived(g: &mut Game) {
        advance(g, 15.);
    }
    fn build(g: &mut Game, kind: &str, x: i32, y: i32) {
        g.app.world_mut().resource_mut::<Village>().wood += 100.;
        assert_eq!(g.place(kind, x, y), "ok");
        g.app
            .world_mut()
            .resource_mut::<Village>()
            .buildings
            .last_mut()
            .unwrap()
            .progress = 100.;
    }
    #[test]
    fn tutorial_starts_empty_and_residents_arrive() {
        let mut g = Game::new();
        assert!(g.app.world().resource::<Village>().buildings.is_empty());
        arrived(&mut g);
        assert!(g.app.world().resource::<Village>().arrived);
    }
    #[test]
    fn expanded_bounds_and_costs() {
        let mut g = Game::new();
        assert_eq!(g.place("garden", 18, 18), "ok");
        assert_eq!(g.app.world().resource::<Village>().wood, 98.);
        assert_ne!(g.place("garden", 18, 18), "ok");
        assert_ne!(g.place("garden", 19, 19), "ok");
        assert_ne!(g.place("home", 10, 13), "ok");
    }
    #[test]
    fn new_land_is_buildable_and_river_is_protected() {
        let mut g = Game::new();
        assert_eq!(g.place("garden", 21, 25), "ok");
        let before = g.snapshot();
        for y in 1..=26 {
            assert_ne!(g.place("garden", 26, y), "ok");
        }
        assert_ne!(g.place("garden", 27, 25), "ok");
        assert_eq!(g.snapshot(), before);
    }
    #[test]
    fn previous_lot_saves_expand_without_losing_buildings() {
        let mut g = Game::new();
        assert_eq!(g.place("home", 8, 8), "ok");
        let mut old: serde_json::Value = serde_json::from_str(&g.snapshot()).unwrap();
        old["village"]["map_size"] = 20.into();
        let mut restored = Game::new();
        assert!(restored.restore(&old.to_string()));
        let v = restored.app.world().resource::<Village>();
        assert_eq!(v.map_size, 28);
        assert_eq!(v.buildings.len(), 1);
        assert_eq!(v.wood, 78.);
    }
    #[test]
    fn exhaustion_and_bedtime_cannot_be_persuaded() {
        let mut g = Game::new();
        arrived(&mut g);
        let mut q = g.app.world_mut().query::<&mut Resident>();
        q.iter_mut(g.app.world_mut())
            .find(|r| r.id == 0)
            .unwrap()
            .energy = 10.;
        assert!(g.request(0, "gather", true).contains("rest first"));
        assert!(g.request(0, "rest", false).contains("Happy"));
        g.app.world_mut().resource_mut::<Village>().minutes = 1380.;
        assert!(g.request(1, "gather", true).contains("bedtime"));
    }
    #[test]
    fn night_interrupts_work_and_morning_wakes_everyone() {
        let mut g = Game::new();
        arrived(&mut g);
        g.app.world_mut().resource_mut::<Village>().minutes = 1380.;
        g.tick(0.1);
        assert!(
            g.app
                .world_mut()
                .query::<&Resident>()
                .iter(g.app.world())
                .all(|r| r.task == "sleep")
        );
        g.app.world_mut().resource_mut::<Village>().minutes = 1890.;
        g.tick(0.1);
        assert!(
            g.app
                .world_mut()
                .query::<&Resident>()
                .iter(g.app.world())
                .all(|r| r.task != "sleep")
        );
    }
    #[test]
    fn shelter_has_three_beds_and_improves_sleep() {
        let mut g = Game::new();
        arrived(&mut g);
        build(&mut g, "home", 8, 8);
        let v = g.app.world().resource::<Village>().clone();
        assert!(shelter(&v, 2).is_some());
        assert!(shelter(&v, 3).is_none());
        let mut q = g.app.world_mut().query::<&mut Resident>();
        for mut r in q.iter_mut(g.app.world_mut()) {
            assign(&mut r, &v, "sleep", "test", false);
            r.x = r.target_x;
            r.y = r.target_y;
            r.energy = 20.;
        }
        g.app.world_mut().resource_mut::<Village>().minutes = 1380.;
        advance(&mut g, 10.);
        let energies: Vec<f32> = g
            .app
            .world_mut()
            .query::<&Resident>()
            .iter(g.app.world())
            .map(|r| r.energy)
            .collect();
        assert!(energies[0] > energies[4] + 2.);
    }
    #[test]
    fn meals_are_eaten_at_destination_not_while_walking() {
        let mut g = Game::new();
        arrived(&mut g);
        let v = g.app.world().resource::<Village>().clone();
        let mut q = g.app.world_mut().query::<&mut Resident>();
        {
            let mut r = q.iter_mut(g.app.world_mut()).find(|r| r.id == 0).unwrap();
            assign(&mut r, &v, "eat", "test", true);
            r.x = 1.;
            r.y = 1.;
            r.hunger = 80.;
        }
        let food = g.app.world().resource::<Village>().food;
        g.tick(0.1);
        assert_eq!(g.app.world().resource::<Village>().food, food);
    }
    #[test]
    fn tutorial_can_be_completed_from_arrival_supplies() {
        let mut g = Game::new();
        arrived(&mut g);
        for (k, x, y) in [
            ("well", 6, 10),
            ("home", 8, 8),
            ("garden", 13, 10),
            ("kitchen", 10, 10),
            ("home", 12, 7),
        ] {
            // Timber may wait for tomorrow's short chore window.
            for _ in 0..4800 {
                if g.app.world().resource::<Village>().wood >= cost(k).unwrap() {
                    break;
                }
                g.tick(0.2);
            }
            assert_eq!(g.place(k, x, y), "ok");
            advance(&mut g, 85.);
        }
        advance(&mut g, 1920.);
        let v = g.app.world().resource::<Village>();
        assert!(v.buildings.iter().all(|b| b.progress >= 100.));
        assert!(v.harvests > 0);
        assert!(v.meals_served > 0);
        assert!(v.mornings > 0);
    }
    #[test]
    fn saves_restore_through_arrival_work_and_sleep() {
        let mut g = Game::new();
        let mut h = Game::new();
        for _ in 0..3000 {
            g.tick(0.23);
            assert!(h.restore(&g.snapshot()));
        }
        assert!(!h.restore("{}"));
        let saved = g.snapshot();
        assert!(!h.restore(&saved.replace("\"version\":2", "\"version\":1")));
    }
    #[test]
    fn invalid_time_and_insufficient_resources_leave_state_unchanged() {
        let mut g = Game::new();
        g.app.world_mut().resource_mut::<Village>().wood = 0.;
        let before = g.snapshot();
        g.tick(f32::NAN);
        g.tick(0.);
        assert_ne!(g.place("home", 5, 5), "ok");
        assert_eq!(g.snapshot(), before);
    }
}

#[cfg(test)]
mod quest_tests;
