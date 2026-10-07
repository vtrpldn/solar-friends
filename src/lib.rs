use bevy_app::{App, Update};
use bevy_ecs::prelude::*;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

pub const MAP_SIZE: i32 = 28;
const MINUTES_PER_SECOND: f32 = 3.;
const CAMP: (f32, f32) = (10., 13.);
const TASKS: &[&str] = &[
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
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Building {
    pub id: usize,
    pub kind: String,
    pub x: i32,
    pub y: i32,
    pub progress: f32,
}
#[derive(Resource, Clone, Serialize, Deserialize)]
pub struct Village {
    pub version: u32,
    pub map_size: i32,
    pub minutes: f32,
    pub wood: f32,
    pub food: f32,
    pub water: f32,
    pub meals: u32,
    pub meals_served: u32,
    pub buildings: Vec<Building>,
    pub events: Vec<String>,
    pub harvests: u32,
    pub arrived: bool,
    pub mornings: u32,
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
        "kitchen" => Some(40.),
        "well" => Some(18.),
        "grove" => Some(14.),
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
    (480.0..750.).contains(&m) || (840.0..1050.).contains(&m)
}
fn available(v: &Village, task: &str) -> bool {
    match task {
        "build" => v.buildings.iter().any(|b| b.progress < 100.),
        "garden" => ready(v, "garden") && v.water >= 2.,
        "cook" => ready(v, "kitchen") && v.food >= 3. && v.water >= 1.,
        "water" => ready(v, "well"),
        "eat" => v.food >= 1. || v.meals > 0,
        "gather" | "rest" | "socialize" | "idle" | "sleep" => true,
        _ => false,
    }
}
fn destination(v: &Village, task: &str, id: usize) -> (f32, f32) {
    if task == "sleep" || task == "rest" {
        return shelter(v, id)
            .map(|b| (b.x as f32 + 0.75, b.y as f32 + 0.75))
            .unwrap_or((CAMP.0 + (id as f32 - 2.) * 0.45, CAMP.1));
    }
    if task == "gather" {
        return (3. + id as f32 * 0.4, 14.);
    }
    let b = v.buildings.iter().find(|b| {
        if task == "build" {
            b.progress < 100.
        } else {
            b.progress >= 100.
                && b.kind
                    == match task {
                        "garden" => "garden",
                        "cook" | "eat" | "socialize" => "kitchen",
                        "water" => "well",
                        _ => "grove",
                    }
        }
    });
    b.map(|b| {
        if task == "eat" || task == "socialize" {
            return (
                b.x as f32 + 0.75 + (id as f32 - 2.) * 0.35,
                b.y as f32 + 1.4,
            );
        }
        (
            b.x as f32 + 0.75 + (id % 2) as f32 * 0.15,
            b.y as f32 + 0.75,
        )
    })
    .unwrap_or((CAMP.0 + (id as f32 - 2.) * 0.45, CAMP.1 + 0.5))
}
fn assign(r: &mut Resident, v: &Village, task: &str, reason: &str, requested: bool) {
    r.task = task.into();
    r.reason = reason.into();
    r.requested = requested;
    r.remaining = match task {
        "sleep" => 60.,
        "eat" => 5.,
        "rest" | "socialize" | "idle" => 12.,
        _ => 10.,
    };
    (r.target_x, r.target_y) = destination(v, task, r.id);
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
                "Eating from our arrival supplies until the kitchen is ready."
            },
        )
    } else if r.energy < 28. {
        ("rest", "I need a break before I can help again.")
    } else if !work_time(v.minutes) {
        if r.social < 75. {
            (
                "socialize",
                "Work can wait. Let's spend some time together.",
            )
        } else {
            (
                "idle",
                "Taking a quiet moment before the next part of the day.",
            )
        }
    } else if v.water < 24. && available(v, "water") {
        ("water", "Our water reserve needs refilling.")
    } else if v.meals < 5 && available(v, "cook") && (r.favorite == "cook" || r.hunger > 55.) {
        ("cook", "Preparing a pot of food for everyone.")
    } else if v.food < 24. && available(v, "garden") {
        ("garden", "Our next meals start in the garden.")
    } else if available(v, "build") && (r.favorite == "build" || r.id.is_multiple_of(2)) {
        ("build", "Let's get our basic infrastructure ready.")
    } else if v.wood < 90. {
        ("gather", "Collecting fallen timber for our next building.")
    } else if r.favorite == "garden" && v.food < 60. && available(v, "garden") {
        ("garden", "I enjoy looking after the garden.")
    } else if r.favorite == "water" && v.water < 70. && available(v, "water") {
        ("water", "Making sure we have water for tomorrow.")
    } else if r.social < 55. {
        ("socialize", "A little company would be good.")
    } else {
        (
            "idle",
            "Our immediate needs are met. Enjoying the clearing.",
        )
    };
    assign(r, v, task, reason, false);
}
fn simulate(step: Res<Step>, mut v: ResMut<Village>, mut people: Query<&mut Resident>) {
    let dt = step.0;
    if dt <= 0. {
        return;
    }
    let before = v.minutes;
    v.minutes += dt * MINUTES_PER_SECOND;
    if ((before - 360.) / 1440.).floor() < ((v.minutes - 360.) / 1440.).floor() {
        v.mornings += 1;
        event(&mut v, "A new morning. The community is waking up.");
    }
    let builders: Vec<(f32, f32)> = people
        .iter()
        .filter(|r| r.task == "build" && (r.x - r.target_x).hypot(r.y - r.target_y) <= 0.08)
        .map(|r| (r.target_x, r.target_y))
        .collect();
    for mut r in &mut people {
        let sleeping = r.task == "sleep";
        r.hunger = (r.hunger + dt * if sleeping { 0.045 } else { 0.13 }).min(100.);
        r.social = (r.social - dt * 0.035).max(0.);
        v.water = (v.water - dt * if sleeping { 0.002 } else { 0.009 }).max(0.);
        if r.task != "arrive"
            && (sleeping_time(v.minutes, r.id) != (r.task == "sleep") || r.remaining <= 0.)
        {
            choose(&mut r, &v);
        }
        let dx = r.target_x - r.x;
        let dy = r.target_y - r.y;
        let d = dx.hypot(dy);
        if d > 0.08 {
            let movement = (dt * 0.7).min(d);
            r.x += dx / d * movement;
            r.y += dy / d * movement;
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
            "socialize" => {
                r.social = (r.social + dt * 1.3).min(100.);
                r.energy = (r.energy + dt * 0.12).min(100.);
            }
            "idle" | "eat" => r.energy = (r.energy + dt * 0.08).min(100.),
            _ => r.energy = (r.energy - dt * 0.11).max(0.),
        }
        if r.task == "build" {
            let helpers = builders
                .iter()
                .filter(|(x, y)| (*x - r.target_x).abs() < 0.2 && (*y - r.target_y).abs() < 0.2)
                .count();
            if let Some(b) = v.buildings.iter_mut().find(|b| {
                b.progress < 100.
                    && (b.x as f32 + 0.75 - r.target_x).abs() < 0.2
                    && (b.y as f32 + 0.75 - r.target_y).abs() < 0.2
            }) {
                b.progress = (b.progress
                    + dt * if r.favorite == "build" { 2.5 } else { 1.5 }
                        * if helpers > 1 { 1.2 } else { 1. })
                .min(100.);
                if b.progress >= 100. {
                    let label = match b.kind.as_str() {
                        "home" => "home (three beds)",
                        "well" => "cistern",
                        k => k,
                    }
                    .to_string();
                    event(&mut v, format!("Our {label} is ready. Built together!"));
                }
            } else {
                r.remaining = 0.;
            }
        }
        if r.remaining <= 0. {
            match r.task.as_str() {
                "gather" => {
                    v.wood += if r.favorite == "gather" { 6. } else { 4. };
                    if ready(&v, "grove") {
                        v.food += 2.;
                    }
                }
                "garden" if v.water >= 2. => {
                    v.water -= 2.;
                    v.food += if r.favorite == "garden" { 8. } else { 5. };
                    v.harvests += 1;
                }
                "water" => v.water = (v.water + 14.).min(150.),
                "cook" if v.food >= 3. && v.water >= 1. => {
                    v.food -= 3.;
                    v.water -= 1.;
                    v.meals += 5;
                }
                "eat" => {
                    let fed = if v.meals > 0 {
                        v.meals -= 1;
                        v.meals_served += 1;
                        r.hunger = (r.hunger - 65.).max(0.);
                        r.social = (r.social + 8.).min(100.);
                        true
                    } else if v.food >= 1. {
                        v.food -= 1.;
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
        r.happiness = (r.energy * 0.30 + (100. - r.hunger) * 0.35 + r.social * 0.25 + comfort)
            .clamp(0., 100.);
    }
    if !v.arrived && people.iter().all(|r| r.task != "arrive") {
        v.arrived = true;
        event(
            &mut v,
            "Everyone has arrived. Start with a cistern and a home.",
        );
    }
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
                water: 32.,
                meals: 0,
                meals_served: 0,
                buildings: vec![],
                events: vec!["Five friends, one empty lot. Your new beginning starts here.".into()],
                harvests: 0,
                arrived: false,
                mornings: 0,
            })
            .add_systems(Update, simulate);
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
                x: 9. + id as f32 * 0.45,
                y: 18.5 + id as f32 * 0.15,
                target_x: CAMP.0 + (id as f32 - 2.) * 0.45,
                target_y: CAMP.1,
                task: "arrive".into(),
                reason: "Walking into the clearing with our founding group.".into(),
                remaining: 0.,
                requested: false,
                last_meal_slot: -1,
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
        let residents = self
            .app
            .world_mut()
            .query::<&Resident>()
            .iter(self.app.world())
            .cloned()
            .collect();
        serde_json::to_string(&Save { village, residents }).unwrap()
    }
    pub fn place(&mut self, kind: &str, x: i32, y: i32) -> String {
        let Some(price) = cost(kind) else {
            return "Unknown building.".into();
        };
        let mut v = self.app.world_mut().resource_mut::<Village>();
        if !(1..=MAP_SIZE - 2).contains(&x) || !(1..=MAP_SIZE - 2).contains(&y) {
            return "Choose a clearing inside the marked lot.".into();
        }
        if river_bank(x, y) {
            return "Keep the river and its banks clear. Choose a clearing farther inland.".into();
        }
        if (x as f32 - CAMP.0).abs() < 1.5 && (y as f32 - CAMP.1).abs() < 1.5 {
            return "Keep the arrival clearing free for gathering and supplies.".into();
        }
        if v.buildings
            .iter()
            .any(|b| (b.x - x).abs() < 2 && (b.y - y).abs() < 2)
        {
            return "Leave a little room between buildings.".into();
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
        });
        event(
            &mut v,
            format!("A new {kind} is planned. Residents can help build it."),
        );
        "ok".into()
    }
    pub fn request(&mut self, id: usize, task: &str, encourage: bool) -> String {
        let v = self.app.world().resource::<Village>().clone();
        if !matches!(
            task,
            "build" | "garden" | "cook" | "water" | "eat" | "gather" | "rest" | "socialize"
        ) {
            return "That request is not available.".into();
        }
        if !available(&v, task) {
            return match task {
                "build" => "There are no construction projects yet.",
                "garden" => "We need a finished garden and at least two water.",
                "cook" => "We need a kitchen, three food and one water first.",
                "eat" => "We need food or a prepared meal first.",
                _ => "That task is not available yet.",
            }
            .into();
        }
        let mut query = self.app.world_mut().query::<&mut Resident>();
        let Some(mut r) = query.iter_mut(self.app.world_mut()).find(|r| r.id == id) else {
            return "Resident not found.".into();
        };
        if r.task == "arrive" {
            return format!("{}: Let me reach the clearing first.", r.name);
        }
        if sleeping_time(v.minutes, id) && task != "rest" {
            return format!(
                "{}: It is bedtime. Let's pick this up in the morning.",
                r.name
            );
        }
        if !matches!(task, "rest" | "eat") && r.energy < 25. {
            return format!(
                "{}: I need to rest first. Ask me when I have more energy.",
                r.name
            );
        }
        if !matches!(task, "rest" | "eat" | "cook") && r.hunger > 75. {
            return format!("{}: I need a meal before I can help.", r.name);
        }
        if task != r.favorite && !matches!(task, "rest" | "eat") && r.energy < 55. && !encourage {
            return format!(
                "{}: I'd rather save my energy. Could we talk about why it matters?",
                r.name
            );
        }
        let reason = if encourage {
            "You explained why this matters. I'll lend a hand."
        } else {
            "Happy to help with your request."
        };
        assign(&mut r, &v, task, reason, true);
        format!("{}: {}", r.name, reason)
    }
    pub fn restore(&mut self, data: &str) -> bool {
        let Ok(mut save) = serde_json::from_str::<Save>(data) else {
            return false;
        };
        let v = &save.village;
        if v.version != 2
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
                || !TASKS.contains(&r.task.as_str())
        }) {
            return false;
        }
        if v.buildings.iter().enumerate().any(|(i, b)| {
            b.id != i
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
        self.app.insert_resource(save.village);
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
            for _ in 0..400 {
                if g.app.world().resource::<Village>().wood >= cost(k).unwrap() {
                    break;
                }
                g.tick(0.2);
            }
            assert_eq!(g.place(k, x, y), "ok");
            advance(&mut g, 85.);
        }
        advance(&mut g, 650.);
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
