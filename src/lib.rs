use bevy_app::{App, Update};
use bevy_ecs::prelude::*;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

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
    pub minutes: f32,
    pub wood: f32,
    pub food: f32,
    pub water: f32,
    pub buildings: Vec<Building>,
    pub events: Vec<String>,
    pub harvests: u32,
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

fn event(v: &mut Village, text: String) {
    v.events.insert(0, text);
    v.events.truncate(12);
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
fn available(v: &Village, task: &str) -> bool {
    match task {
        "build" => v.buildings.iter().any(|b| b.progress < 100.),
        "garden" => ready(v, "garden"),
        "cook" => ready(v, "kitchen") && v.food >= 2. && v.water >= 1.,
        "water" => ready(v, "well"),
        "gather" | "rest" | "socialize" => true,
        _ => false,
    }
}
fn destination(v: &Village, task: &str, id: usize) -> (f32, f32) {
    let b = v.buildings.iter().find(|b| {
        if task == "build" {
            b.progress < 100.
        } else {
            b.progress >= 100.
                && b.kind
                    == match task {
                        "garden" => "garden",
                        "cook" | "socialize" => "kitchen",
                        "water" => "well",
                        "rest" => "home",
                        _ => "grove",
                    }
        }
    });
    b.map(|b| (b.x as f32 + 0.75, b.y as f32 + 0.75))
        .unwrap_or((2. + id as f32 * 0.6, 11.))
}
fn assign(r: &mut Resident, v: &Village, task: &str, reason: &str, requested: bool) {
    r.task = task.into();
    r.reason = reason.into();
    r.requested = requested;
    r.remaining = if task == "rest" { 16. } else { 10. };
    (r.target_x, r.target_y) = destination(v, task, r.id);
}
fn choose(r: &mut Resident, v: &Village) {
    let (task, why) = if r.energy < 30. {
        ("rest", "I need a little shade and a proper rest.")
    } else if r.hunger > 55. && available(v, "cook") {
        ("cook", "A shared meal will help us keep going.")
    } else if r.social < 32. {
        ("socialize", "I could use some company.")
    } else if v.water < 24. && available(v, "water") {
        ("water", "Our water reserve is running low.")
    } else if v.food < 25. && available(v, "garden") {
        ("garden", "The community needs more food.")
    } else if available(v, "build") && (r.favorite == "build" || r.id.is_multiple_of(2)) {
        ("build", "An extra pair of hands makes this lighter.")
    } else if v.wood < 25. {
        ("gather", "We need materials for our next project.")
    } else if available(v, &r.favorite) {
        (r.favorite.as_str(), "This is work I enjoy doing.")
    } else {
        ("gather", "Collecting fallen timber for the community.")
    };
    let task = task.to_string();
    assign(r, v, &task, why, false);
}
fn simulate(step: Res<Step>, mut village: ResMut<Village>, mut people: Query<&mut Resident>) {
    let dt = step.0;
    if dt <= 0. {
        return;
    }
    village.minutes += dt * 4.;
    let builders: Vec<(f32, f32)> = people
        .iter()
        .filter(|r| r.task == "build" && (r.x - r.target_x).hypot(r.y - r.target_y) <= 0.08)
        .map(|r| (r.target_x, r.target_y))
        .collect();
    for mut r in &mut people {
        r.hunger = (r.hunger + dt * 0.25).min(100.);
        r.social = (r.social - dt * 0.12).max(0.);
        if r.hunger > 70. && village.food >= 1. {
            village.food -= 1.;
            r.hunger = (r.hunger - 20.).max(0.);
        }
        if village.water > 0. {
            village.water = (village.water - dt * 0.009).max(0.);
        }
        r.happiness = (r.energy * 0.35 + (100. - r.hunger) * 0.35 + r.social * 0.3).clamp(0., 100.);
        if r.remaining <= 0. {
            choose(&mut r, &village);
        }
        let dx = r.target_x - r.x;
        let dy = r.target_y - r.y;
        let d = (dx * dx + dy * dy).sqrt();
        if d > 0.08 {
            let m = (dt * 0.8).min(d);
            r.x += dx / d * m;
            r.y += dy / d * m;
            continue;
        }
        r.remaining -= dt;
        if r.task == "rest" {
            r.energy = (r.energy + dt * 3.).min(100.);
        } else {
            r.energy = (r.energy - dt * 0.36).max(0.);
        }
        if r.task == "socialize" {
            r.social = (r.social + dt * 4.).min(100.);
            r.energy = (r.energy + dt * 0.5).min(100.);
        }
        if r.task == "build" {
            let helpers = builders
                .iter()
                .filter(|(x, y)| (*x - r.target_x).abs() < 0.01 && (*y - r.target_y).abs() < 0.01)
                .count();
            if let Some(b) = village.buildings.iter_mut().find(|b| {
                b.progress < 100.
                    && (b.x as f32 + 0.75 - r.target_x).abs() < 0.01
                    && (b.y as f32 + 0.75 - r.target_y).abs() < 0.01
            }) {
                b.progress = (b.progress
                    + dt * if r.favorite == "build" { 3. } else { 1.8 }
                        * (if helpers > 1 { 1.25 } else { 1. }))
                .min(100.);
                if b.progress >= 100. {
                    let kind = b.kind.clone();
                    event(
                        &mut village,
                        format!("Our {kind} is ready. Built together!"),
                    );
                }
            } else {
                r.remaining = 0.;
            }
        }
        if r.remaining <= 0. {
            match r.task.as_str() {
                "gather" => {
                    village.wood += if r.favorite == "gather" { 7. } else { 4. };
                    if ready(&village, "grove") {
                        village.food += 2.;
                    }
                }
                "garden" => {
                    if village.water >= 2. {
                        village.water -= 2.;
                        village.food += if r.favorite == "garden" { 10. } else { 6. };
                        village.harvests += 1;
                    } else {
                        event(
                            &mut village,
                            "The garden needs water before the next harvest.".into(),
                        );
                    }
                }
                "water" => village.water = (village.water + 14.).min(150.),
                "cook" if village.food >= 2. && village.water >= 1. => {
                    village.food -= 2.;
                    village.water -= 1.;
                    r.hunger = (r.hunger - 55.).max(0.);
                    r.social = (r.social + 15.).min(100.);
                }
                _ => {}
            }
            r.remaining = 0.;
        }
    }
}
#[wasm_bindgen]
impl Game {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        let mut app = App::new();
        app.insert_resource(Step::default())
            .insert_resource(Village {
                version: 1,
                minutes: 480.,
                wood: 76.,
                food: 42.,
                water: 65.,
                harvests: 0,
                buildings: vec![
                    Building {
                        id: 0,
                        kind: "home".into(),
                        x: 4,
                        y: 4,
                        progress: 100.,
                    },
                    Building {
                        id: 1,
                        kind: "home".into(),
                        x: 8,
                        y: 3,
                        progress: 100.,
                    },
                    Building {
                        id: 2,
                        kind: "kitchen".into(),
                        x: 6,
                        y: 6,
                        progress: 100.,
                    },
                    Building {
                        id: 3,
                        kind: "well".into(),
                        x: 3,
                        y: 7,
                        progress: 100.,
                    },
                ],
                events: vec!["Welcome to Vila Aurora. Let's grow something good.".into()],
            })
            .add_systems(Update, simulate);
        let names = [
            ("Iara", "Patient · gardener", "garden"),
            ("Bento", "Practical · builder", "build"),
            ("Luz", "Sociable · cook", "cook"),
            ("Cauã", "Curious · forager", "gather"),
            ("Nina", "Thoughtful · caretaker", "water"),
        ];
        for (id, (name, traits, favorite)) in names.iter().enumerate() {
            app.world_mut().spawn(Resident {
                id,
                name: name.to_string(),
                trait_name: traits.to_string(),
                favorite: favorite.to_string(),
                energy: 85. - id as f32 * 13.,
                hunger: 20. + id as f32 * 8.,
                social: 75. - id as f32 * 8.,
                happiness: 75.,
                x: 5. + id as f32 * 0.5,
                y: 8.,
                target_x: 5.,
                target_y: 8.,
                task: "rest".into(),
                reason: "Finding my place in our new community.".into(),
                remaining: 0.,
                requested: false,
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
        if !(1..=12).contains(&x) || !(1..=12).contains(&y) {
            return "Choose a clearing inside the village.".into();
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
        if !available(&v, task) {
            return match task {
                "build" => "There are no construction projects yet.",
                "garden" => "Let's build a garden first.",
                "cook" => "We need a kitchen, food and water first.",
                _ => "That task is not available yet.",
            }
            .into();
        }
        let mut query = self.app.world_mut().query::<&mut Resident>();
        let Some(mut r) = query.iter_mut(self.app.world_mut()).find(|r| r.id == id) else {
            return "Resident not found.".into();
        };
        if task != "rest" && r.energy < 25. {
            return format!(
                "{}: I need to rest first. Ask me when I have more energy.",
                r.name
            );
        }
        if task != "rest" && task != "cook" && r.hunger > 75. {
            return format!("{}: I need a meal before I can help.", r.name);
        }
        if task != r.favorite && task != "rest" && r.energy < 55. && !encourage {
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
        let Ok(save) = serde_json::from_str::<Save>(data) else {
            return false;
        };
        let v = &save.village;
        if v.version != 1
            || save.residents.len() != 5
            || v.buildings.len() > 144
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
                    .any(|n| !n.is_finite() || !(0.0..=15.).contains(n))
                || !r.remaining.is_finite()
                || r.remaining < 0.
                || r.remaining > 100.
                || !matches!(
                    r.task.as_str(),
                    "rest" | "cook" | "build" | "garden" | "water" | "gather" | "socialize"
                )
        }) {
            return false;
        }
        if v.buildings.iter().enumerate().any(|(i, b)| {
            b.id != i
                || cost(&b.kind).is_none()
                || !(1..=12).contains(&b.x)
                || !(1..=12).contains(&b.y)
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
    #[test]
    fn placement_charges_once_and_rejects_overlap() {
        let mut g = Game::new();
        assert_eq!(g.place("garden", 9, 8), "ok");
        assert_ne!(g.place("garden", 9, 8), "ok");
        assert_eq!(g.app.world().resource::<Village>().wood, 64.);
        assert_ne!(g.place("garden", 20, 0), "ok");
    }
    #[test]
    fn tired_resident_refuses_even_encouragement() {
        let mut g = Game::new();
        let mut q = g.app.world_mut().query::<&mut Resident>();
        q.iter_mut(g.app.world_mut())
            .find(|r| r.id == 0)
            .unwrap()
            .energy = 10.;
        assert!(g.request(0, "gather", true).contains("rest first"));
        assert!(g.request(0, "rest", false).contains("Happy"));
    }
    #[test]
    fn community_builds_and_harvests() {
        let mut g = Game::new();
        g.place("garden", 9, 8);
        for _ in 0..2400 {
            g.tick(0.1);
        }
        let v = g.app.world().resource::<Village>();
        assert!(v.buildings.last().unwrap().progress >= 100.);
        assert!(v.harvests > 0);
        assert!(v.food >= 0. && v.water >= 0.);
    }
    #[test]
    fn save_roundtrip_and_invalid_save() {
        let mut g = Game::new();
        g.place("garden", 9, 8);
        for _ in 0..100 {
            g.tick(0.1);
        }
        let data = g.snapshot();
        let mut h = Game::new();
        assert!(h.restore(&data));
        let a: serde_json::Value = serde_json::from_str(&data).unwrap();
        let b: serde_json::Value = serde_json::from_str(&h.snapshot()).unwrap();
        assert_eq!(a, b);
        assert!(!h.restore("{}"));
        assert!(!h.restore(&data.replace("\"version\":1", "\"version\":2")));
    }
    #[test]
    fn unavailable_jobs_have_explanations() {
        let mut g = Game::new();
        assert!(g.request(0, "garden", false).contains("build a garden"));
        assert!(g.request(0, "build", false).contains("no construction"));
    }
    #[test]
    fn saves_restore_at_task_boundaries() {
        let mut game = Game::new();
        let mut restored = Game::new();
        game.place("garden", 9, 8);
        for _ in 0..800 {
            game.tick(0.17);
            assert!(restored.restore(&game.snapshot()));
        }
    }
    #[test]
    fn encouragement_changes_reluctance_without_spending_resources() {
        let mut game = Game::new();
        let mut query = game.app.world_mut().query::<&mut Resident>();
        query
            .iter_mut(game.app.world_mut())
            .find(|r| r.id == 0)
            .unwrap()
            .energy = 40.;
        let wood = game.app.world().resource::<Village>().wood;
        assert!(game.request(0, "gather", false).contains("save my energy"));
        assert!(game.request(0, "gather", true).contains("lend a hand"));
        assert_eq!(game.app.world().resource::<Village>().wood, wood);
    }
    #[test]
    fn insufficient_resources_and_invalid_time_do_not_mutate_village() {
        let mut game = Game::new();
        game.app.world_mut().resource_mut::<Village>().wood = 1.;
        let before = game.snapshot();
        assert!(game.place("home", 10, 10).contains("need 32 timber"));
        game.tick(0.);
        game.tick(f32::NAN);
        assert_eq!(game.snapshot(), before);
    }
    #[test]
    fn builders_must_walk_to_the_next_construction_site() {
        let mut game = Game::new();
        game.place("garden", 9, 8);
        game.place("grove", 2, 11);
        let v = game.app.world().resource::<Village>().clone();
        let mut query = game.app.world_mut().query::<&mut Resident>();
        for mut r in query.iter_mut(game.app.world_mut()) {
            r.remaining = 90.;
            if r.id == 1 {
                assign(&mut r, &v, "build", "Helping", true);
                r.x = r.target_x;
                r.y = r.target_y;
            }
        }
        game.app.world_mut().resource_mut::<Village>().buildings[4].progress = 100.;
        game.tick(0.1);
        assert_eq!(
            game.app.world().resource::<Village>().buildings[5].progress,
            0.
        );
        game.tick(0.1);
        assert_eq!(
            game.app.world().resource::<Village>().buildings[5].progress,
            0.
        );
    }
}
