use bevy_app::{App, Update};
use bevy_ecs::prelude::*;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

mod agriculture;
mod autonomy;
mod building_work;
mod climate;
mod devtools;
mod ecology;
mod economy;
pub mod electricity;
mod food;
mod forecast;
mod founding;
mod freshness;
mod gatherings;
mod interactions;
mod land;
mod leisure;
mod logistics;
mod maintenance;
mod market;
mod mobility;
mod modes;
mod navigation;
mod occupations;
mod organics;
mod outcomes;
mod pipes;
mod planting;
mod power;
mod processes;
mod production;
mod progression;
mod requests;
mod resource_sites;
mod restoration;
mod sandbox;
mod sanitation;
mod simulation;
mod situations;
mod skills;
mod sleep;
mod spacing;
mod supplies;
mod town_pickup;
mod utilities;
mod walking;
mod water;
mod workforce;
use progression::Progress;

pub const MAP_SIZE: i32 = 32;
pub const SAVE_VERSION: u32 = 29;
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
    "building_work",
    "garden",
    "water",
    "gather",
    "socialize",
    "compost",
    "restore",
    "utility",
    "craft",
    "gathering",
    "nature_walk",
    "birdwatch",
    "stretch",
    "daydream",
    "stargaze",
    "source",
    "prepare",
    "outside",
    "return",
    "pickup",
    "sanitation",
    "haul",
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
    #[serde(default)]
    pub work_check_at: f32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub help: Option<requests::Request>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub activity_batch: Option<simulation::Id>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub activity_store: Option<simulation::Id>,
    #[serde(default, skip_serializing_if = "walking::State::empty")]
    pub walking: walking::State,
    pub last_meal_slot: i32,
    #[serde(default = "sanitation::unused_day")]
    pub last_sanitation_day: i32,
    #[serde(default)]
    pub visit_building: Option<usize>,
    #[serde(default)]
    pub activity_building: Option<usize>,
    #[serde(default)]
    pub activity_material: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trip: Option<mobility::Trip>,
    #[serde(default)]
    pub sleep: sleep::Routine,
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
    #[serde(default)]
    pub agriculture: agriculture::Plot,
}
#[derive(Resource, Clone, Serialize, Deserialize)]
pub struct Village {
    #[serde(default)]
    pub mode: modes::Mode,
    #[serde(default = "sandbox::legacy")]
    pub sandbox_rules: sandbox::Rules,
    #[serde(default)]
    pub simulation: simulation::State,
    #[serde(default)]
    pub climate: climate::State,
    #[serde(default)]
    pub maintenance: maintenance::State,
    #[serde(default)]
    pub logistics: Option<logistics::State>,
    #[serde(skip)]
    pub navigation: Option<std::sync::Arc<navigation::Grid>>,
    #[serde(default)]
    pub workforce: workforce::State,
    #[serde(default)]
    pub skills: skills::State,
    #[serde(default)]
    pub market: market::State,
    #[serde(default)]
    pub production: production::State,
    #[serde(default)]
    pub freshness: freshness::State,
    #[serde(default)]
    pub processes: processes::State,
    #[serde(default)]
    pub land: land::State,
    #[serde(default)]
    pub restoration: Vec<restoration::Job>,
    #[serde(default)]
    pub water_supply: water::State,
    #[serde(default)]
    pub pipes: pipes::State,
    #[serde(skip)]
    pub activity_claims: [Option<workforce::Claim>; 5],
    #[serde(skip)]
    pub workforce_peers: [Option<Resident>; 5],
    pub version: u32,
    pub map_size: i32,
    pub minutes: f32,
    pub wood: f32,
    pub economy: economy::Economy,
    pub food: f32,
    #[serde(default)]
    pub supplies: supplies::Supplies,
    #[serde(default)]
    pub power: power::Power,
    #[serde(default)]
    pub circular: sanitation::Circular,
    pub water: f32,
    pub meals: u32,
    pub meals_served: u32,
    pub buildings: Vec<Building>,
    #[serde(default)]
    pub building_jobs: Vec<building_work::Job>,
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
fn river_center(y: f32) -> f32 {
    29.8 + (y * 0.22).sin() * 0.65
}
fn river_bank(x: i32, y: i32) -> bool {
    x as f32 >= river_center(y as f32) - 2.3
}
fn hydro_site(x: i32, y: i32) -> bool {
    let centre = river_center(y as f32);
    x as f32 >= centre - 1.35 && (x as f32) < centre - 0.35
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
fn sleeping_time(minutes: f32, r: &Resident) -> bool {
    sleep::due(r, minutes)
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
fn available(v: &Village, task: &str) -> bool {
    match task {
        "building_work" => building_work::next(v).is_some(),
        "build" => v.buildings.iter().any(|b| economy::can_build(v, b.id)),
        "source" => economy::local_job(v).is_some_and(|(t, _)| t == task),
        "prepare" => v
            .production
            .batches
            .iter()
            .any(|b| b.active() && b.material != economy::TOOLS),
        "outside" => (0..5).any(|id| occupations::available(v, id)),
        "garden" => v.buildings.iter().any(|b| {
            ecology::needs_tending(v, b, water::irrigation(v, water::Owner::Building(b.id)))
        }),
        "sanitation" => ready(v, "eco_toilet"),
        "cook" => production::can_order_meals(v),
        "water" => water::has_work(v),
        "compost" => v.buildings.iter().any(|b| organics::can_turn(v, b.id)),
        "restore" => v.restoration.iter().any(|j| restoration::ready(v, j)),
        "utility" => (0..5).any(|id| !utilities::crew_jobs(v, id).is_empty()),
        "craft" => production::can_order_tools(v),
        "eat" => food::owned_portions(v) > 0,
        "gather" | "rest" | "socialize" | "idle" | "sleep" => true,
        _ => false,
    }
}
fn destination(v: &Village, task: &str, id: usize) -> (f32, f32) {
    if (task == "rest"
        || founding::weather_shelter(v) && matches!(task, "socialize" | "idle" | "daydream"))
        && let Some(p) = founding::quiet_spot(v, id)
    {
        return p;
    }
    if task == "water" {
        return (1., 13. + (id as f32 - 2.) * 0.65);
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
    if task == "gathering" {
        return gatherings::destination(v).and_then(|id| v.buildings.iter().find(|b| b.id == id));
    }
    let eligible: Vec<_> = v
        .buildings
        .iter()
        .filter(|b| {
            if task == "garden" {
                ecology::needs_tending(v, b, water::irrigation(v, water::Owner::Building(b.id)))
            } else if task == "compost" {
                organics::can_turn(v, b.id)
            } else if task == "build" {
                economy::can_build(v, b.id)
            } else {
                b.progress >= 100.
                    && (task != "cook"
                        || production::jobs(v).any(|q| {
                            q.material == economy::MEALS
                                && production::building(v, q.site) == Some(b.id)
                        }))
                    && (task != "sanitation"
                        || b.next_visit <= v.minutes && sanitation::usable_toilet(v, b.id))
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
                            "sanitation" => "eco_toilet",
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
    walking::clear(r);
    if r.requested
        && r.help
            .as_ref()
            .is_some_and(|q| q.active() && !requests::related(task, &q.task))
    {
        requests::pause(r);
    }
    if task != "sleep" {
        sleep::pause(r);
    }
    r.trip = None;
    r.visit_building = None;
    r.activity_material = None;
    r.activity_batch = None;
    r.activity_store = None;
    r.activity_building = if matches!(task, "source" | "prepare" | "outside" | "haul") {
        None
    } else if matches!(task, "sleep" | "rest") {
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
        "sanitation" => 4.,
        "compost" => 3.,
        "rest" | "socialize" | "idle" => 12.,
        _ => 10.,
    };
    if task == "water" {
        water::assign_target(v, r);
        return;
    }
    if task == "restore" {
        if let Some(id) = v
            .restoration
            .iter()
            .find(|j| restoration::ready(v, j))
            .map(|j| j.id)
        {
            restoration::assign_target(r, v, id);
        }
        return;
    }
    if task == "building_work" {
        building_work::assign_target(r, v);
        return;
    }
    if task == "outside" || (task == "sleep" && shelter(v, r.id).is_none()) {
        mobility::begin(
            r,
            v,
            if task == "outside" {
                mobility::Purpose::Work
            } else {
                mobility::Purpose::Overnight
            },
        );
        return;
    }
    if task != "sleep"
        && r.activity_building.is_some_and(|id| {
            v.buildings
                .iter()
                .find(|b| b.id == id)
                .is_none_or(|b| spacing::approach(v, b, r.id).is_none())
        })
    {
        r.activity_building = None;
        r.task = "rest".into();
        r.reason = "Taking a break where there is room. That building is too crowded.".into();
        (r.target_x, r.target_y) =
            idle_destination(v, r.id).unwrap_or((CAMP.0 + (r.id as f32 - 2.) * 1.25, CAMP.1));
        return;
    }
    if task == "eat" {
        if !food::assign(r, v) {
            r.remaining = 0.;
            (r.target_x, r.target_y) = (r.x, r.y);
        }
    } else if task == "haul" {
        (r.target_x, r.target_y) = (r.x, r.y);
        r.remaining = 100.;
    } else if matches!(task, "prepare" | "craft" | "cook") {
        if let Some(batch) =
            production::jobs(v).find(|b| production::matches_task(b.material, task))
        {
            production::assign_batch(r, v, batch.id);
        }
    } else if task == "source" {
        if let Some((_, i)) = economy::local_job(v) {
            r.activity_material = Some(i);
            if task == "source" {
                r.reason = resource_sites::reason(v, i).into();
            }
            let base = if task == "source" {
                let s = &v.economy.sources[i];
                (s.x as f32, s.y as f32)
            } else if let Some(b) = v
                .buildings
                .iter()
                .find(|b| b.kind == "workshop" && b.progress >= 100.)
            {
                (b.x as f32, b.y as f32)
            } else {
                CAMP
            };
            if let Some(point) = spacing::material_spot(v, base.0, base.1, r.id) {
                (r.target_x, r.target_y) = point;
            } else {
                assign(
                    r,
                    v,
                    "rest",
                    "There is no clear workspot here. Taking a break where there is room.",
                    requested,
                );
            }
        }
    } else if task == "idle" || leisure::hobby(task) {
        r.remaining = 24. + r.id as f32 * 2.;
        (r.target_x, r.target_y) = if founding::weather_shelter(v) && task == "daydream" {
            founding::quiet_spot(v, r.id)
        } else {
            None
        }
        .or_else(|| idle_destination(v, r.id))
        .unwrap_or((r.x, r.y));
    } else {
        (r.target_x, r.target_y) = destination(v, task, r.id);
    }
}
fn choose(r: &mut Resident, v: &Village) {
    requests::pause(r);
    r.work_check_at = v.minutes;
    let meal_due = autonomy::meal_due(r, v.minutes);
    let (task, reason) = if sleeping_time(v.minutes, r) {
        (
            "sleep",
            if shelter(v, r.id).is_some() {
                "Time for bed. A roof makes all the difference."
            } else {
                "Staying with neighbours overnight until we have a village bed."
            },
        )
    } else if (meal_due || r.hunger > 60. || (v.meals > 0 && r.hunger > 30.))
        && workforce::eating(v, r.id)
    {
        if requests::pending(r, "eat") && requests::resume(r, v) {
            return;
        }
        (
            "eat",
            if v.meals > 0 {
                "Sitting down for a cooked meal."
            } else {
                "Eating an available portion from our pantry."
            },
        )
    } else if autonomy::recovering(r) {
        if requests::pending(r, "rest") && requests::resume(r, v) {
            return;
        }
        (
            "rest",
            "Taking a proper rest until I feel ready to help again.",
        )
    } else if !v.arrived
        && (r.task == "arrive"
            || v.workforce_peers
                .iter()
                .flatten()
                .any(|p| p.task == "arrive"))
    {
        leisure::choose(r, v)
    } else if v.progress.gathering_until > v.minutes && v.progress.invited & (1 << r.id) != 0 {
        (
            "gathering",
            "Sharing food and stories in our community square.",
        )
    } else if situations::apply_agreement(r, v) {
        return;
    } else if occupations::available(v, r.id) && r.hunger <= 75. {
        (
            "outside",
            "Leaving for my outside shift. My village chores can wait until I return.",
        )
    } else if autonomy::foraging(v, r) {
        if r.hunger <= 60. && workforce::choose_harvest(r, v) {
            return;
        }
        if requests::pending(r, "gather") && requests::resume(r, v) {
            return;
        }
        ("gather", "Foraging wild food to keep everyone fed.")
    } else if sanitation::due(v, r) {
        (
            "sanitation",
            "Taking a private moment at the ecological toilet.",
        )
    } else if autonomy::company(r) {
        (
            "socialize",
            "I need some company. Taking time to catch up before more chores.",
        )
    } else if requests::resume(r, v) || workforce::choose_work(r, v) {
        return;
    } else if r.social < 55. {
        ("socialize", "A little company would be good.")
    } else {
        leisure::choose(r, v)
    };
    assign(r, v, task, reason, false);
}
fn request_blocker(v: &Village, r: &Resident, task: &str, encourage: bool) -> Option<String> {
    if r.help
        .as_ref()
        .is_some_and(|q| q.active() && q.task == task)
    {
        return None;
    }
    let id = r.id;
    if r.trip.is_some() {
        return Some(format!(
            "{} is away or commuting. Ask again after returning to the village.",
            r.name
        ));
    }
    if !requests::allowed(task) {
        return Some("That request is not available.".into());
    }
    if task == "outside" && !occupations::available(v, id) {
        return Some("Enable this neighbour’s outside job first. Each person can work one shift per day, leaving 09:00–10:00.".into());
    }
    if task == "outside" && !mobility::departure_time(v.minutes) {
        return Some("Outside jobs leave between 09:00 and 10:00 and return at 17:00.".into());
    }
    if task == "building_work"
        && let Some(building) =
            building_work::next(v).and_then(|id| v.buildings.iter().find(|b| b.id == id))
        && spacing::approach(v, building, id).is_none()
    {
        return Some(
            "There is no clear work spot for me at this site. Make a little room around it first."
                .into(),
        );
    }
    if situations::protected(v, id, task) {
        return Some(
            "We agreed to cover this work. Let our neighbour have their time back.".into(),
        );
    }
    let hauling_for_build = task == "build"
        && v.buildings
            .iter()
            .any(|b| b.progress < 100. && building_work::job(v, b.id).is_none());
    if task == "eat" && food::meal(v, r).is_none() {
        return Some("I need a reachable, unclaimed portion that will stay fresh until I arrive. Bring food, meals, milk or honey along a clear path; eggs need cooking first.".into());
    }
    if !available(v, task)
        && !hauling_for_build
        && !(task == "building_work" && !v.building_jobs.is_empty())
    {
        return Some(
            match task {
                "building_work" => "Queue a building job in Buildings and leave a clear worksite for residents.",
                "build" => "No stage is ready. Check project supplies, incoming deliveries, or paused projects.",
                "garden" => {
                    "Crops or animals need supplies, time or storage before tending. Check the selected plot in Buildings."
                }
                "cook" => "We need a kitchen, three food and one water first.",
                "compost" => "Two scraps need to reach a compost station before a neighbour can turn them.",
                "craft" => {
                    "We need an open workshop with room for a batch, eight available timber, and fewer than 25 tool uses already stored or ordered. Inputs must be delivered before crafting."
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
    if sleeping_time(v.minutes, r) && task != "rest" {
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
    water::sync(&mut v);
    modes::replenish(&mut v);
    let before = v.minutes;
    v.minutes += dt * MINUTES_PER_SECOND;
    maintenance::advance(&mut v, dt * MINUTES_PER_SECOND);
    freshness::advance(&mut v);
    let activities: Vec<_> = people
        .iter()
        .map(|r| (r.id, simulation::activity(r)))
        .collect();
    let until = v.minutes;
    simulation::record_time(
        &mut v.simulation,
        f64::from(before),
        f64::from(until),
        &activities,
    );
    workforce::record(&mut v, f64::from(before), f64::from(until), people.iter());
    supplies::advance(&mut v, dt * MINUTES_PER_SECOND);
    economy::advance(&mut v, dt * MINUTES_PER_SECOND);
    power::advance(&mut v, dt * MINUTES_PER_SECOND);
    pipes::advance(&mut v, dt * MINUTES_PER_SECOND);
    sanitation::advance(&mut v, dt * MINUTES_PER_SECOND);
    ecology::advance(&mut v, dt * MINUTES_PER_SECOND);
    land::advance_fallow(&mut v, dt * MINUTES_PER_SECOND);
    situations::advance(&mut v, dt * MINUTES_PER_SECOND);
    if ((before - 360.) / 1440.).floor() < ((v.minutes - 360.) / 1440.).floor() {
        v.mornings += 1;
        event(&mut v, "A new morning. The community is waking up.");
    }
    let available_neighbours = people
        .iter()
        .filter(|r| gatherings::eligible(r))
        .fold(0u8, |m, r| m | (1 << r.id));
    if gatherings::advance(&mut v, available_neighbours) {
        for mut r in &mut people {
            if v.progress.invited & (1 << r.id) != 0 {
                logistics::interrupt(&mut v, &r);
                water::interrupt(&mut v, &r);
                assign(
                    &mut r,
                    &v,
                    "gathering",
                    "Meals have reached our shared table. Coming to share food and stories.",
                    true,
                );
            }
        }
    }
    if v.progress.gathering_until > 0. && v.minutes >= v.progress.gathering_until {
        let attended = v.progress.attended;
        let success = attended.count_ones() >= 3 && gatherings::served(&v);
        if success {
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
                if attended.count_ones() >= 3 {
                    "Neighbours reached the shared table, but five fresh meals were no longer available. Prepare fresh portions for another day."
                } else {
                    "Too few neighbours made it to the square. Try gathering closer to home tomorrow."
                },
            );
        }
        gatherings::finish(&mut v, success);
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
            !r.trip
                .as_ref()
                .is_some_and(|t| t.phase == mobility::Phase::Away)
                && !(r.trip.is_none()
                    && r.task == "sleep"
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
    workforce::refresh(&mut v, people.iter());
    for mut r in &mut people {
        navigation::refresh(&mut v);
        requests::observe(&mut r, &v);
        building_work::sync(&mut r, &v);
        if r.activity_batch
            .is_some_and(|id| production::batch(&v, id).is_none_or(|b| !production::ready(&v, b)))
        {
            assign(
                &mut r,
                &v,
                "idle",
                "The production batch is waiting. Making room for other village life.",
                false,
            );
        }
        if r.activity_building
            .is_some_and(|id| !v.buildings.iter().any(|b| b.id == id))
            || r.visit_building
                .is_some_and(|id| !v.buildings.iter().any(|b| b.id == id))
        {
            assign(
                &mut r,
                &v,
                "rest",
                "Taking a break while the clearing changes.",
                false,
            );
        }
        sleep::prepare(&mut r, v.minutes);
        if r.trip.is_none() && r.task == "sleep" {
            if shelter(&v, r.id).is_some() && (r.x - r.target_x).hypot(r.y - r.target_y) <= 0.08 {
                sleep::tick(&mut r, v.minutes);
            } else {
                sleep::pause(&mut r);
            }
        }
        if r.task != "haul" {
            logistics::interrupt(&mut v, &r);
        }
        if r.task != "water" {
            water::interrupt(&mut v, &r);
        }
        power::batteries::interrupt(&mut v, &r);
        if mobility::advance(&mut r, &mut v, &neighbours, dt) {
            requests::observe(&mut r, &v);
            continue;
        }
        let sleeping = r.task == "sleep";
        r.hunger = (r.hunger + dt * if sleeping { 0.045 } else { 0.13 }).min(100.);
        r.social = (r.social - dt * 0.035).max(0.);
        let household =
            shelter(&v, r.id).map_or(water::Owner::Camp, |b| water::Owner::Building(b.id));
        sanitation::household_at(&mut v, household, dt * if sleeping { 0.002 } else { 0.009 });
        let seek_shelter = autonomy::free_time(&r)
            && founding::weather_shelter(&v)
            && r.task != "rest"
            && founding::quiet_spot(&v, r.id).is_some()
            && !v.buildings.iter().any(|b| {
                b.kind == "shed"
                    && b.progress >= 100.
                    && (r.target_x - b.x as f32).abs() < 1.2
                    && (r.target_y - b.y as f32).abs() < 1.2
            });
        // Only interrupt free time for a real, reachable offer. This shares
        // the queue with new farming/production jobs and ignores blocked sites.
        let chores_start = !r.requested
            && !autonomy::recovering(&r)
            && !autonomy::company(&r)
            && r.social >= 65.
            && (leisure::hobby(&r.task) || matches!(r.task.as_str(), "idle" | "socialize"))
            && (occupations::available(&v, r.id)
                || (v.minutes - r.work_check_at >= 5.
                    && !situations::protected(&v, r.id, "cook")
                    && (r.help.as_ref().is_some_and(|q| q.active())
                        || workforce::offers(&v, &r)
                            .iter()
                            .any(|o| o.blocker.is_none()))));
        if !r.requested && autonomy::free_time(&r) && v.minutes - r.work_check_at >= 5. {
            r.work_check_at = v.minutes;
        }
        if r.task != "arrive"
            && (sleeping_time(v.minutes, &r) != (r.task == "sleep")
                || (sleeping_time(v.minutes, &r) && shelter(&v, r.id).is_none())
                || r.remaining <= 0.
                || (occupations::available(&v, r.id)
                    && (requests::work(&r.task) || r.task == "haul")
                    && !(r.task == "gather"
                        && (supplies::urgent(&v)
                            || r.hunger > 60. && !workforce::eating(&v, r.id))))
                || (occupations::available(&v, r.id)
                    && autonomy::free_time(&r)
                    && !matches!(r.task.as_str(), "rest"))
                || chores_start
                || seek_shelter)
            || (requests::work(&r.task) || r.task == "haul")
                && (r.energy < 28.
                    || autonomy::food_interrupt(&v, &r)
                    || (r.social < 35. && !(r.task == "gather" && autonomy::foraging(&v, &r)))
                    || (workforce::eating(&v, r.id)
                        && autonomy::meal_due(&r, v.minutes)
                        && !autonomy::finishing(&v, &r)))
            || (r.task != "arrive"
                && r.trip.is_none()
                && autonomy::free_time(&r)
                && ((r.task != "rest" && r.energy < 28.)
                    || (r.task != "socialize" && r.social < 35.)
                    || (workforce::eating(&v, r.id) && autonomy::meal_due(&r, v.minutes))))
        {
            v.workforce_peers[r.id] = Some(r.clone());
            choose(&mut r, &v);
        }
        v.activity_claims[r.id] = workforce::Claim::from_resident(&r);
        v.workforce_peers[r.id] = Some(r.clone());
        if r.task != "haul" {
            logistics::interrupt(&mut v, &r);
        }
        if r.task != "water" {
            water::interrupt(&mut v, &r);
        }
        power::batteries::interrupt(&mut v, &r);
        if mobility::advance(&mut r, &mut v, &neighbours, 0.) {
            requests::observe(&mut r, &v);
            continue;
        }
        if logistics::advance(&mut v, &mut r, &neighbours, dt) {
            requests::observe(&mut r, &v);
            continue;
        }
        if water::advance(&mut v, &mut r, &neighbours, dt) {
            requests::observe(&mut r, &v);
            continue;
        }
        requests::observe(&mut r, &v);
        if walking::supports(&r.task) {
            let travelling = walking::advance(&v, &mut r, &neighbours, dt);
            v.activity_claims[r.id] = workforce::Claim::from_resident(&r);
            v.workforce_peers[r.id] = Some(r.clone());
            requests::observe(&mut r, &v);
            if travelling {
                continue;
            }
        }
        let d = (r.target_x - r.x).hypot(r.target_y - r.y);
        if d > 0.08 {
            spacing::walk(&mut r, &neighbours, dt);
            r.energy = (r.energy - dt * 0.035).max(0.);
            continue;
        }
        if r.task == "arrive" {
            choose(&mut r, &v);
            continue;
        }
        let pace = if matches!(r.task.as_str(), "garden" | "gather" | "source" | "compost") {
            skills::task(&r.task).map_or(1., |skill| skills::factor(&v, r.id, skill))
        } else {
            1.
        };
        r.remaining = (r.remaining - dt * pace).max(0.);
        if matches!(r.task.as_str(), "prepare" | "craft" | "cook") {
            let completed = production::work(&mut v, &r, dt);
            r.remaining = r
                .activity_batch
                .and_then(|id| production::batch(&v, id))
                .filter(|b| b.active())
                .map_or(0., |b| (10. - b.work).max(0.01));
            if completed {
                requests::completed_batch(&mut r, &v, true);
            }
        }
        match r.task.as_str() {
            "sleep" => {
                if r.sleep.started_at.is_none() || r.sleep.last_tick.is_none() {
                    sleep::tick(&mut r, v.minutes);
                }
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
        if r.task == "restore" && restoration::work(&mut v, &r, dt * MINUTES_PER_SECOND) {
            r.remaining = 0.;
        }
        if r.task == "utility" && utilities::crew_work(&mut v, &r, dt * MINUTES_PER_SECOND) {
            r.remaining = 0.;
        }
        let building_pace = skills::factor(&v, r.id, skills::Skill::Building);
        if r.task == "building_work" {
            if let Some(id) = r.activity_building {
                if building_work::work(
                    &mut v,
                    id,
                    dt * if r.favorite == "build" { 2.5 } else { 1.5 } * building_pace,
                ) {
                    skills::award(&mut v, r.id, skills::Skill::Building, 2);
                    r.remaining = 0.;
                }
            } else {
                r.remaining = 0.;
            }
        }
        if r.task == "build" {
            let building = spacing::building(&r, &v);
            let tool_bonus = if v.progress.use_tools
                && building.is_some_and(|id| logistics::site_tools(&v, id) > 0)
            {
                1.25
            } else {
                1.
            };
            let helpers = builders.iter().filter(|&&id| Some(id) == building).count();
            if let Some(id) = building.filter(|id| economy::can_build(&v, *id)) {
                if let Some(b) = v.buildings.iter_mut().find(|b| b.id == id) {
                    b.contributors |= 1 << r.id;
                }
                let completed = economy::build(
                    &mut v,
                    id,
                    dt * if r.favorite == "build" { 2.5 } else { 1.5 }
                        * if helpers > 1 { 1.2 } else { 1. }
                        * tool_bonus
                        * building_pace,
                );
                if completed {
                    let b = v.buildings.iter().find(|b| b.id == id).unwrap();
                    let shared = b.contributors.count_ones() >= 2;
                    let label = b.kind.clone();
                    let contributors = b.contributors;
                    if shared {
                        v.progress.shared_builds += 1;
                    }
                    for person in 0..5 {
                        if contributors & (1 << person) != 0 {
                            skills::award(&mut v, person, skills::Skill::Building, 6);
                        }
                    }
                    event(&mut v, format!("Our {label} is ready. Built together!"));
                }
            } else {
                r.remaining = 0.;
            }
        }
        if r.remaining <= 0. {
            let mut completed_batch = false;
            match r.task.as_str() {
                task if leisure::hobby(task) => {
                    v.progress.hobby_mask |= 1 << r.id;
                }
                "visit" => {
                    interactions::finish(&mut v, &mut r);
                    if let Some(id) = r.visit_building
                        && v.buildings.iter().any(|b| b.id == id && b.kind == "square")
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
                    if r.requested
                        || supplies::needs_ingredients(&v)
                        || r.hunger > 60. && !workforce::eating(&v, r.id)
                    {
                        let gathered = food::forage(&mut v, &mut r);
                        completed_batch = gathered > 0;
                        if completed_batch {
                            skills::award(&mut v, r.id, skills::Skill::Farming, 1);
                        }
                        v.supplies.gathered += gathered as f32;
                        if v.buildings.iter().any(|b| {
                            Some(b.id) == r.activity_building
                                && b.kind == "grove"
                                && b.progress >= 100.
                        }) {
                            v.progress.fruit = v.progress.fruit.saturating_add(gathered);
                        }
                    }
                }
                "source" => {
                    if let Some(i) = r.activity_material {
                        completed_batch = economy::finish_job(&mut v, &r.task, i);
                        if completed_batch {
                            skills::award(&mut v, r.id, skills::Skill::Craft, 2);
                        }
                    }
                }
                "garden"
                    if r.requested
                        || r.activity_building
                            .is_some_and(|id| agriculture::wanted(&v, id)) =>
                {
                    completed_batch = v.buildings.iter().any(|b| {
                        Some(b.id) == r.activity_building
                            && ecology::needs_tending(
                                &v,
                                b,
                                water::irrigation(&v, water::Owner::Building(b.id)),
                            )
                    });
                    ecology::tend(&mut v, &r)
                }
                "sanitation" => {
                    sanitation::use_toilet(&mut v, &mut r);
                    if sanitation::due(&v, &r) {
                        r.remaining = 1.;
                    }
                }
                "compost" => {
                    completed_batch = r
                        .activity_building
                        .is_some_and(|id| organics::turn(&mut v, id));
                    if completed_batch {
                        skills::award(&mut v, r.id, skills::Skill::Farming, 1);
                    }
                }
                "rest" => {
                    completed_batch = true;
                }
                "socialize" => {
                    completed_batch = true;
                    v.progress.social_mask |= 1 << r.id;
                }
                "eat" => {
                    let fed = food::eat(&mut v, &mut r);
                    completed_batch = fed;
                    if fed && let Some(slot) = meal_slot(v.minutes) {
                        r.last_meal_slot = slot;
                    }
                }
                _ => {}
            }
            requests::completed_batch(&mut r, &v, completed_batch);
        }
        v.workforce_peers[r.id] = Some(r.clone());
        v.activity_claims[r.id] = workforce::Claim::from_resident(&r);
        let comfort = if shelter(&v, r.id).is_some() { 8. } else { 0. };
        r.happiness = (r.energy * 0.30 + (100. - r.hunger) * 0.35 + r.social * 0.25 + comfort
            - situations::concern(&v, r.id))
        .clamp(0., 100.);
    }
    restoration::reconcile(&mut v);
    // A later worker may finish after earlier residents have already ticked.
    // Detach every stale activity before snapshots can observe a removed site.
    for mut r in &mut people {
        requests::observe(&mut r, &v);
        if r.activity_building
            .is_some_and(|id| !v.buildings.iter().any(|b| b.id == id))
            || r.visit_building
                .is_some_and(|id| !v.buildings.iter().any(|b| b.id == id))
            || (r.task == "restore"
                && r.activity_material.is_none_or(|id| {
                    restoration::job(&v, simulation::Id(id as u32)).is_none_or(|j| !j.active())
                }))
            || (r.task == "utility"
                && r.activity_material
                    .is_none_or(|id| !utilities::crew_ready(&v, simulation::Id(id as u32), r.id)))
            || (r.task == "building_work"
                && r.activity_building
                    .is_none_or(|id| building_work::job(&v, id).is_none()))
        {
            assign(
                &mut r,
                &v,
                "rest",
                "The crew work is finished. Taking a break.",
                false,
            );
        }
    }
    if !v.arrived && people.iter().all(|r| r.task != "arrive") {
        v.arrived = true;
        event(
            &mut v,
            "Everyone has arrived. The shed offers shade and rain cover; start with a cistern and homes for the night.",
        );
    }
    production::finish_frame(&mut v, people.iter());
    power::finish_frame(&mut v, dt * MINUTES_PER_SECOND);
    let residents: Vec<_> = people.iter().cloned().collect();
    pipes::prune(&mut v, &residents);
    power::batteries::prune(&mut v, &residents);
    maintenance::sync(&mut v);
    outcomes::observe(&mut v, &residents);
    progression::update(&mut v);
}
#[wasm_bindgen]
impl Game {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        let mut app = App::new();
        app.insert_resource(Step::default())
            .insert_resource(Village {
                mode: modes::Mode::Story,
                sandbox_rules: sandbox::Rules::default(),
                simulation: simulation::State::default(),
                climate: climate::State { enabled: true },
                maintenance: maintenance::State {
                    enabled: true,
                    automatic: true,
                    ..Default::default()
                },
                logistics: None,
                navigation: None,
                workforce: workforce::State::default(),
                skills: skills::State::default(),
                market: market::State::default(),
                production: production::State::default(),
                freshness: freshness::State::default(),
                processes: processes::State::default(),
                land: land::State::default(),
                restoration: vec![],
                water_supply: water::State::default(),
                pipes: pipes::State::default(),
                activity_claims: std::array::from_fn(|_| None),
                workforce_peers: std::array::from_fn(|_| None),
                version: SAVE_VERSION,
                map_size: MAP_SIZE,
                minutes: 480.,
                wood: 32.,
                economy: economy::Economy::default(),
                food: 36.,
                supplies: supplies::Supplies::default(),
                power: power::Power::default(),
                circular: sanitation::Circular::default(),
                water: 32.,
                meals: 0,
                meals_served: 0,
                buildings: vec![],
                building_jobs: vec![],
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
                work_check_at: 0.,
                help: None,
                activity_batch: None,
                activity_store: None,
                walking: walking::State::default(),
                last_meal_slot: -1,
                last_sanitation_day: -1,
                visit_building: None,
                activity_building: None,
                activity_material: None,
                trip: None,
                sleep: sleep::Routine::default(),
            });
        }
        simulation::start_materials(&mut app.world_mut().resource_mut::<Village>());
        assert!(land::initialise(
            &mut app.world_mut().resource_mut::<Village>()
        ));
        logistics::initialise(&mut app.world_mut().resource_mut::<Village>());
        production::sync(&mut app.world_mut().resource_mut::<Village>());
        assert!(water::initialise(
            &mut app.world_mut().resource_mut::<Village>()
        ));
        maintenance::sync(&mut app.world_mut().resource_mut::<Village>());
        Self { app }
    }
    pub fn tick(&mut self, seconds: f32) {
        if seconds.is_finite() {
            self.app.world_mut().resource_mut::<Step>().0 = seconds.clamp(0., 0.25);
            self.app.update();
        }
    }
    /// Only actual sleep and off-site work qualify, never a commute or walking to bed.
    pub fn fast_forward_ready(&mut self) -> bool {
        let mut query = self.app.world_mut().query::<&Resident>();
        let world = self.app.world();
        let v = world.resource::<Village>();
        let mut residents = query.iter(world).peekable();
        residents.peek().is_some()
            && residents.all(|r| {
                if let Some(t) = &r.trip {
                    return t.phase == mobility::Phase::Away
                        && (matches!(
                            t.purpose,
                            mobility::Purpose::Work | mobility::Purpose::Pickup
                        ) || (r.sleep.started_at.is_some()
                            && r.sleep.slept_minutes < r.sleep.duration_minutes));
                }
                r.task == "sleep"
                    && shelter(v, r.id).is_some()
                    && (r.x - r.target_x).hypot(r.y - r.target_y) <= 0.08
                    && r.sleep.started_at.is_some()
                    && r.sleep.slept_minutes < r.sleep.duration_minutes
            })
    }
    /// A read-only animation render sample. Full reports and static land stay in snapshot().
    /// Never use this partial view as a save file.
    pub fn frame_state(&mut self) -> String {
        let mut query = self.app.world_mut().query::<&Resident>();
        let world = self.app.world();
        let v = world.resource::<Village>();
        let residents: Vec<_> = query.iter(world).collect();
        serde_json::json!({
            "village": {
                "minutes": v.minutes,
                "buildings": v.buildings,
                "building_jobs": v.building_jobs,
                "power": v.power,
                "water_supply": v.water_supply,
                "logistics": v.logistics,
                "roads": v.roads,
                "economy": { "sources": v.economy.sources },
            },
            "residents": residents,
            "environment": {
                "raining": climate::at(v, v.minutes).raining,
                "weather": { "current": climate::at(v, v.minutes) },
                "power": power::supply(v),
            },
        })
        .to_string()
    }
    pub fn snapshot(&mut self) -> String {
        let mut village = self.app.world().resource::<Village>().clone();
        let residents: Vec<_> = self
            .app
            .world_mut()
            .query::<&Resident>()
            .iter(self.app.world())
            .cloned()
            .collect();
        workforce::refresh(&mut village, residents.iter());
        let mut economy = economy::view(&village);
        economy["pickup_drivers"] = serde_json::json!(residents.iter().map(|r| serde_json::json!({"id":r.id,"name":r.name,"blocker":town_pickup::blocker(&village,r)})).collect::<Vec<_>>());
        economy["pickup_capacity"] = town_pickup::CAPACITY.into();
        economy["pickup_minutes"] = town_pickup::drive_minutes(&village).into();
        economy["pickup_fee"] = 2000.into();
        serde_json::json!({
            "environment": {
                "skills": skills::view(&village),
                "raining": climate::at(&village,village.minutes).raining,
                "weather": climate::view(&village),
                "water_capacity": ecology::capacity(&village),
                "power": power::supply(&village),
                "economy": economy,
                "dry_day": !climate::day(&village,(village.minutes/1440.) as u32).rain_expected,
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
            .iter()
            .find(|b| b.id == building)
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
        let Some(b) = v.buildings.iter().find(|b| b.id == building) else {
            return "Building not found.".into();
        };
        if b.progress < 100. {
            return "Finish construction before using this building.".into();
        }
        if agriculture::kind(b) {
            return self.request_at(resident, "garden", false, Some(building));
        }
        if matches!(b.kind.as_str(), "workshop" | "kitchen") {
            return self.request_at(
                resident,
                if b.kind == "kitchen" { "cook" } else { "craft" },
                false,
                Some(building),
            );
        }
        let mut query = self.app.world_mut().query::<&mut Resident>();
        let Some(mut r) = query
            .iter_mut(self.app.world_mut())
            .find(|r| r.id == resident)
        else {
            return "Resident not found.".into();
        };
        if r.trip.is_some() {
            return format!(
                "{} is away or commuting. Ask again after returning to the village.",
                r.name
            );
        }
        if r.task == "arrive" || sleeping_time(v.minutes, &r) || r.energy < 25. || r.hunger > 75. {
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
        let message = format!("{}: {}", r.name, r.reason);
        let interrupted = r.clone();
        water::interrupt(
            &mut self.app.world_mut().resource_mut::<Village>(),
            &interrupted,
        );
        message
    }
    pub fn set_food_preferences(&mut self, feed_hens: bool, use_eggs: bool) {
        let mut v = self.app.world_mut().resource_mut::<Village>();
        v.supplies.feed_hens = feed_hens;
        v.supplies.use_eggs = use_eggs;
        economy::rebalance(&mut v);
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
        if v.buildings.iter().any(|b| interactions::occupies(b, x, y))
            || v.economy
                .sources
                .iter()
                .any(|s| resource_sites::occupies(s, x, y))
        {
            return "Choose a tile beside the building.".into();
        }
        if power::batteries::reserved(&v, x, y, None) {
            return "Move the recovered battery or its reserved destination before placing a road here.".into();
        }
        if restoration::reserved(&v, x, y) {
            return "That ground is reserved for soil restoration.".into();
        }
        if building_work::reserved(&v, x, y, None) {
            return "That plot is reserved for a building move.".into();
        }
        v.roads.push((x, y));
        land::disturb_plot(&mut v, 1, x, y, 0.18);
        "ok".into()
    }
    pub fn place(&mut self, kind: &str, x: i32, y: i32) -> String {
        self.place_with_recipe(kind, x, y, "standard")
    }
    pub fn place_with_recipe(&mut self, kind: &str, x: i32, y: i32, variant: &str) -> String {
        let Some(_) = economy::recipe(kind, variant) else {
            return "Unknown building.".into();
        };
        let mut v = self.app.world_mut().resource_mut::<Village>();
        if !progression::unlocked(&v, kind) {
            return "Complete the linked quest in the village journal to unlock this building."
                .into();
        }
        if let Err(reason) = building_work::placement(&v, kind, x, y, None) {
            return reason.into();
        }
        if v.logistics.is_some() && v.simulation.next_id.checked_add(2).is_none() {
            return "Material location identity limit reached.".into();
        }
        let id = v.economy.next_building;
        let Some(next) = id.checked_add(1).filter(|next| *next <= u32::MAX as usize) else {
            return "Building identity limit reached.".into();
        };
        v.economy.next_building = next;
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
            agriculture: agriculture::Plot::default(),
        });
        economy::plan(&mut v, id);
        if kind == "home" {
            outcomes::start_housing(&mut v, id);
        }
        if variant != "standard" {
            let ordinal = v
                .buildings
                .iter()
                .filter(|b| b.kind == "home")
                .count()
                .saturating_sub(1);
            let project = v.economy.projects.last_mut().unwrap();
            project.recipe = variant.into();
            if variant == "adobe" {
                project.appearance = Some(4 + (ordinal % 2) as u8);
            }
            economy::rebalance(&mut v);
        }
        if !sandbox::logistics(&v) {
            land::disturb(&mut v, kind, x, y);
            v.buildings.last_mut().unwrap().progress = 100.;
            let stages = economy::recipe(kind, variant).unwrap().len();
            let project = v.economy.projects.last_mut().unwrap();
            project.stage = stages;
            project.reserved = [0; economy::COUNT];
            economy::rebalance(&mut v);
        }
        maintenance::sync(&mut v);
        event(
            &mut v,
            format!("A new {kind} is planned. Residents can help build it."),
        );
        "ok".into()
    }
    pub fn request(&mut self, id: usize, task: &str, encourage: bool) -> String {
        self.request_at(id, task, encourage, None)
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
        if quest >= progression::CHAPTER_COUNT
            || v.mode == modes::Mode::Sandbox
            || !progression::available(&v, quest)
        {
            return false;
        }
        v.progress.tracked = quest;
        true
    }
    pub fn set_tools_enabled(&mut self, enabled: bool) {
        {
            let mut v = self.app.world_mut().resource_mut::<Village>();
            v.progress.use_tools = enabled;
            economy::rebalance(&mut v);
        }
        self.sync_production_activities();
        self.sync_help();
    }
    pub fn contribute_tool_library(&mut self) -> String {
        let mut v = self.app.world_mut().resource_mut::<Village>();
        if !progression::available(&v, 3) {
            return "Finish A Place to Gather first.".into();
        }
        if v.progress.tool_library {
            return "The tool library contribution is already set aside.".into();
        }
        if v.economy.money < 12000 {
            return "Set aside R$ 120 from the shared fund for our tool library.".into();
        }
        economy::contribute(&mut v, 12000, "Shared tool library");
        v.progress.tool_library = true;
        event(
            &mut v,
            "A shared fund contribution supports our first tool library. Bento has a plan!",
        );
        progression::update(&mut v);
        "ok".into()
    }
    pub fn restore(&mut self, data: &str) -> bool {
        let Ok(mut raw) = serde_json::from_str::<serde_json::Value>(data) else {
            return false;
        };
        if raw["village"]["version"] == 23 {
            raw["village"]["version"] = SAVE_VERSION.into();
            if raw["village"]["skills"].is_null() && raw["village"]["mode"] == "sandbox" {
                raw["village"]["skills"] = serde_json::to_value(skills::State {
                    enabled: false,
                    ..Default::default()
                })
                .unwrap();
            }
        }
        if matches!(raw["village"]["version"].as_u64(), Some(24..=26)) {
            raw["village"]["version"] = SAVE_VERSION.into();
        }
        if raw["village"]["market"].is_null() && raw["village"]["mode"] == "sandbox" {
            raw["village"]["market"] = serde_json::to_value(market::State {
                enabled: false,
                ..Default::default()
            })
            .unwrap();
        }
        if raw["village"]["version"] == 3 {
            organics::author_fixture(&mut raw);
        }
        let Ok(mut save) = serde_json::from_value::<Save>(raw) else {
            return false;
        };
        if save.village.economy.outside_committed_day < -1
            || save.village.economy.outside_committed_day > (save.village.minutes / 1440.) as i32
        {
            return false;
        }
        occupations::migrate(&mut save);
        resource_sites::retire_legacy(&mut save.village, &mut save.residents);
        if save.village.version == 3 && !land::initialise(&mut save.village) {
            return false;
        }
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
        if !logistics::valid(v, &save.residents)
            || !workforce::valid(v)
            || !skills::valid(v)
            || !market::valid(v)
            || !production::valid(v)
            || !freshness::valid(v)
            || !processes::valid(v)
            || !land::valid(v)
            || !restoration::valid(v)
            || !water::valid(v, &save.residents)
            || !pipes::valid(v)
            || !gatherings::valid(v)
            || !simulation::valid(v)
            || !building_work::valid(v)
            || !supplies::valid(v)
            || !power::valid(v)
            || !economy::valid(v)
            || !sanitation::valid(v)
            || !maintenance::valid(v)
        {
            return false;
        }
        if !town_pickup::valid(v, &save.residents) {
            return false;
        }
        let mut work_ids = std::collections::HashSet::new();
        let all_ids = v
            .building_jobs
            .iter()
            .filter_map(|j| j.id)
            .chain(v.production.sites.iter().map(|s| s.id))
            .chain(v.production.batches.iter().map(|b| b.id))
            .chain(
                v.logistics
                    .iter()
                    .flat_map(|s| s.stores.iter().map(|p| p.id)),
            )
            .chain(
                v.logistics
                    .iter()
                    .flat_map(|s| s.shipments.iter().map(|h| h.id)),
            )
            .chain(v.progress.gathering_delivery.iter().map(|p| p.id))
            .chain(v.processes.batches.iter().map(|p| p.id))
            .chain(v.land.deposits.iter().map(|d| d.id))
            .chain(v.restoration.iter().map(|j| j.id))
            .chain(v.maintenance.jobs.iter().map(|j| j.id))
            .chain(v.water_supply.tanks.iter().map(|p| p.id))
            .chain(v.water_supply.trips.iter().map(|p| p.id))
            .chain(v.pipes.lines.iter().map(|p| p.id))
            .chain(v.power.network.nodes.iter().map(|n| n.id))
            .chain(v.power.battery_jobs.iter().map(|j| j.id))
            .chain(
                save.residents
                    .iter()
                    .filter_map(|r| r.help.as_ref().map(|q| q.id)),
            );
        if !all_ids.into_iter().all(|id| work_ids.insert(id))
            || save
                .residents
                .iter()
                .any(|r| !requests::valid(v, r) || !walking::valid(v, r))
        {
            return false;
        }
        let p = &v.progress;
        if !situations::valid(v)
            || p.tracked >= progression::CHAPTER_COUNT
            || p.hobby_mask > 31
            || p.social_mask > 31
            || p.invited > 31
            || p.attended > 31
            || p.tool_uses > 1_000_000
            || p.gathering_day < -1
            || !p.gathering_until.is_finite()
            || p.gathering_until < 0.
            || (p.gathering_until > 0.
                && (p.gathering_until <= v.minutes || p.gathering_until > v.minutes + 120.))
        {
            return false;
        }
        if !outcomes::valid(v)
            || !sandbox::valid(v)
            || !matches!(v.version, 3 | SAVE_VERSION)
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
                || !r.work_check_at.is_finite()
                || !(0.0..=v.minutes).contains(&r.work_check_at)
                || !(0.0..=100.).contains(&r.remaining)
                || r.visit_building
                    .is_some_and(|id| !v.buildings.iter().any(|b| b.id == id))
                || r.activity_building
                    .is_some_and(|id| !v.buildings.iter().any(|b| b.id == id))
                || r.activity_material.is_some_and(|i| {
                    if r.task == "source" {
                        v.economy.sources.get(i).is_none_or(|s| !s.active)
                    } else if r.task == "restore" {
                        u32::try_from(i).ok().is_none_or(|id| {
                            restoration::job(v, simulation::Id(id)).is_none_or(|j| !j.active())
                        })
                    } else if r.task == "utility" {
                        u32::try_from(i)
                            .ok()
                            .is_none_or(|id| !utilities::crew_exists(v, simulation::Id(id)))
                    } else {
                        i >= economy::COUNT
                    }
                })
                || r.activity_store.is_some_and(|id| {
                    r.task != "eat"
                        || !v
                            .logistics
                            .as_ref()
                            .is_some_and(|s| s.stores.iter().any(|p| p.id == id))
                })
                || r.activity_batch.is_some_and(|id| {
                    production::batch(v, id).is_none_or(|b| {
                        !production::matches_task(b.material, &r.task)
                            || Some(b.material) != r.activity_material
                    })
                })
                || r.last_sanitation_day < -1
                || r.last_sanitation_day > (v.minutes / 1440.) as i32
                || (r.task == "building_work"
                    && r.activity_building
                        .is_none_or(|id| building_work::job(v, id).is_none()))
                || (r.task == "restore" && r.activity_material.is_none())
                || (r.task == "utility" && r.activity_material.is_none())
                || !TASKS.contains(&r.task.as_str())
                || !mobility::valid(v, r)
                || !sleep::valid(r, v.minutes)
        }) {
            return false;
        }
        if v.buildings.iter().any(|b| {
            !b.next_visit.is_finite()
                || b.next_visit < 0.
                || !ecology::valid(b)
                || !agriculture::valid(v, b)
                || b.contributors > 31
                || economy::recipe(&b.kind, "standard").is_none()
                || !(1..=MAP_SIZE - 2).contains(&b.x)
                || !(1..=MAP_SIZE - 2).contains(&b.y)
                || if b.kind == "hydro" {
                    !hydro_site(b.x, b.y)
                } else {
                    river_bank(b.x, b.y)
                }
                || !b.progress.is_finite()
                || !(0.0..=100.).contains(&b.progress)
        }) {
            return false;
        }
        if !logistics::valid(v, &save.residents) {
            return false;
        }
        if save.village.version == 3 {
            save.village.freshness = freshness::State::default();
            if !logistics::initialise(&mut save.village) {
                return false;
            }
            save.village.version = SAVE_VERSION;
            if !power::initialise(&mut save.village) {
                return false;
            }
            if !water::initialise(&mut save.village) {
                return false;
            }
            if !processes::initialise(&mut save.village) {
                return false;
            }
            if !water::valid(&save.village, &save.residents)
                || !processes::valid(&save.village)
                || !power::valid(&save.village)
            {
                return false;
            }
            economy::rebalance(&mut save.village);
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
        land::vegetation::rebuild(&mut save.village);
        workforce::refresh(&mut save.village, save.residents.iter());
        for r in save.residents {
            self.app.world_mut().spawn(r);
        }
        save.village.map_size = MAP_SIZE;
        simulation::start_materials(&mut save.village);
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

impl Game {
    fn request_at(&mut self, id: usize, task: &str, encourage: bool, at: Option<usize>) -> String {
        let mut v = self.app.world().resource::<Village>().clone();
        let people: Vec<_> = self
            .app
            .world_mut()
            .query::<&Resident>()
            .iter(self.app.world())
            .cloned()
            .collect();
        navigation::refresh(&mut v);
        workforce::refresh(&mut v, people.iter());
        let message = {
            let mut query = self.app.world_mut().query::<&mut Resident>();
            let Some(mut r) = query.iter_mut(self.app.world_mut()).find(|r| r.id == id) else {
                return "Resident not found.".into();
            };
            if let Some(q) = r.help.as_ref().filter(|q| q.active() && q.task == task) {
                if at.is_some_and(|id| q.building != Some(id)) {
                    return format!(
                        "{}: I am already helping at {} {}. Cancel that request before choosing another worksite.",
                        r.name,
                        if task == "craft" {
                            "workshop"
                        } else {
                            "worksite"
                        },
                        q.building.unwrap_or(0) + 1
                    );
                }
                return format!("{}: I already accepted this request. {}", r.name, q.reason);
            }
            if let Some(reason) = request_blocker(&v, &r, task, encourage) {
                return reason;
            }
            if v.simulation.next_id == u32::MAX {
                return "The work identity limit has been reached.".into();
            }
            requests::enqueue_at(&mut v, &mut r, task, encourage, at)
        };
        if task == "outside" {
            v.economy.outside_committed_days[id] = (v.minutes / 1440.) as i32;
        }
        self.app.insert_resource(v);
        message
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
        assert_ne!(g.toggle_road(62, 5), "ok");
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
        old["village"]["roads"] = serde_json::json!([[62, 5]]);
        assert!(!restored.restore(&old.to_string()));
    }
    #[test]
    fn idle_residents_spread_out_and_keep_individual_routines_after_reload() {
        let mut g = Game::new();
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.minutes = 900.;
            crate::water::fixture_fresh(&mut v, 100.);
            crate::logistics::fixture_stock(&mut v, crate::economy::FOOD, (100.) as u32);
        }
        let mut q = g.app.world_mut().query::<&mut Resident>();
        for mut r in q.iter_mut(g.app.world_mut()) {
            r.task = "idle".into();
            r.activity_store = None;
            r.remaining = 0.;
            r.social = 100.;
            r.hunger = 0.;
        }
        g.tick(0.25);
        let initial: Save = serde_json::from_str(&g.snapshot()).unwrap();
        let mut restored = Game::new();
        assert!(restored.restore(&g.snapshot()));
        // Stop before dinner; residents now notice meal time during hobbies.
        for _ in 0..238 {
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
                assert!(
                    (r.x - other.x).hypot(r.y - other.y) >= 2.,
                    "{} ({}, {}) toward ({}, {}), {} ({}, {}) toward ({}, {})",
                    r.name,
                    r.x,
                    r.y,
                    r.target_x,
                    r.target_y,
                    other.name,
                    other.x,
                    other.y,
                    other.target_x,
                    other.target_y
                );
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
                agriculture: agriculture::Plot::default(),
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
        crate::logistics::fixture_stock(&mut g.app.world_mut().resource_mut::<Village>(), 0, 100);
        assert_eq!(g.place(kind, x, y), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            let id = v.buildings.last().unwrap().id;
            crate::logistics::fixture_finish(&mut v, id);
        }
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
        assert_eq!(g.app.world().resource::<Village>().wood, 32.);
        assert_ne!(g.place("garden", 18, 18), "ok");
        assert_ne!(g.place("garden", 19, 19), "ok");
        assert_ne!(g.place("home", 10, 13), "ok");
    }
    #[test]
    fn new_land_is_buildable_and_river_is_protected() {
        let mut g = Game::new();
        assert_eq!(g.place("garden", 21, 25), "ok");
        let before = g.snapshot();
        for y in 1..=MAP_SIZE - 2 {
            assert_ne!(g.place("garden", 62, y), "ok");
        }
        assert_ne!(g.place("garden", 63, 25), "ok");
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
        assert_eq!(v.map_size, MAP_SIZE);
        assert_eq!(v.buildings.len(), 1);
        assert_eq!(v.wood, 32.);
    }
    #[test]
    fn a_requested_foraging_batch_produces_food_without_a_food_forest() {
        let mut g = Game::new();
        arrived(&mut g);
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            crate::logistics::fixture_stock(&mut v, crate::economy::FOOD, (80.) as u32);
            v.minutes = 600.;
        }
        let mut query = g.app.world_mut().query::<&mut Resident>();
        for mut r in query.iter_mut(g.app.world_mut()) {
            r.task = "rest".into();
            r.activity_store = None;
            r.remaining = 90.;
            r.energy = 90.;
            r.hunger = 0.;
            r.social = 90.;
            r.last_meal_slot = 0;
            r.target_x = r.x;
            r.target_y = r.y;
        }
        assert!(g.request(0, "gather", false).contains("Happy"));
        let mut query = g.app.world_mut().query::<&mut Resident>();
        for mut r in query.iter_mut(g.app.world_mut()).filter(|r| r.id == 0) {
            r.x = r.target_x;
            r.y = r.target_y;
        }
        for _ in 0..40 {
            g.tick(0.25);
        }
        assert_eq!(g.app.world().resource::<Village>().food, 82.);
        assert_eq!(g.app.world().resource::<Village>().supplies.gathered, 2.);
        g.tick(0.25); // The next decision returns them to their own plans.
        assert_eq!(g.app.world().resource::<Village>().food, 82.);
        let people: Save = serde_json::from_str(&g.snapshot()).unwrap();
        assert!(
            !people.residents[0].requested,
            "One helping hand, then return to their own routine"
        );
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
        g.app.world_mut().resource_mut::<Village>().minutes = 1439.;
        for _ in 0..200 {
            g.tick(0.25);
        }
        let residents: Vec<_> = g
            .app
            .world_mut()
            .query::<&Resident>()
            .iter(g.app.world())
            .cloned()
            .collect();
        assert!(
            residents
                .iter()
                .all(|r| r.task == "sleep" && r.sleep.started_at.is_some())
        );
        assert!(
            residents
                .iter()
                .all(|r| (360.0..=540.).contains(&r.sleep.duration_minutes))
        );
        let wake = residents
            .iter()
            .filter_map(|r| r.sleep.wake_at)
            .fold(0_f32, f32::max);
        g.app.world_mut().resource_mut::<Village>().minutes = wake;
        for _ in 0..600 {
            g.tick(0.25);
        }
        assert!(
            g.app
                .world_mut()
                .query::<&Resident>()
                .iter(g.app.world())
                .all(|r| r.task != "sleep" && r.trip.is_none())
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
            let mut placement = g.place(k, x, y);
            for _ in 0..1920 {
                if placement == "ok" {
                    break;
                }
                assert!(placement.contains("lying on this plot"), "{k}: {placement}");
                g.tick(0.25);
                placement = g.place(k, x, y);
            }
            assert_eq!(placement, "ok", "{k} at {x},{y}");
            advance(&mut g, 85.);
        }
        let shortage = economy::shortage(g.app.world().resource::<Village>());
        assert_eq!(
            g.order_supplies(&serde_json::to_string(&shortage).unwrap()),
            "ok"
        );
        for _ in 0..(16 * 1920) {
            let v = g.app.world().resource::<Village>();
            if v.buildings.iter().all(|b| b.progress >= 100.)
                && v.harvests > 0
                && v.meals_served > 0
                && v.mornings > 0
            {
                break;
            }
            g.tick(0.25);
        }
        let v = g.app.world().resource::<Village>();
        assert!(
            v.buildings.iter().all(|b| b.progress >= 100.),
            "{}",
            g.snapshot()
        );
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
        assert!(
            !h.restore(&saved.replace(&format!("\"version\":{SAVE_VERSION}"), "\"version\":2"))
        );
    }
    #[test]
    fn invalid_time_and_insufficient_resources_leave_state_unchanged() {
        let mut g = Game::new();
        crate::logistics::fixture_stock(&mut g.app.world_mut().resource_mut::<Village>(), 0, 0);
        let before = g.snapshot();
        g.tick(f32::NAN);
        g.tick(0.);
        assert_eq!(g.snapshot(), before);
        assert_eq!(g.place("home", 5, 5), "ok");
        assert!(
            !economy::can_build(g.app.world().resource::<Village>(), 0)
                || g.app.world().resource::<Village>().wood == 0.
        );
    }
}

#[cfg(test)]
mod quest_tests;
