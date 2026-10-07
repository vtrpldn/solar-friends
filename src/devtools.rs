//! Opt-in observations; diagnostics never enter village saves.
use super::*;
use std::collections::VecDeque;

#[derive(Clone, Serialize)]
struct Decision {
    minute: f32,
    resident: usize,
    task: String,
    reason: String,
    destination: [f32; 2],
    requested: bool,
}
#[derive(Resource, Default)]
pub(crate) struct Diagnostics {
    enabled: bool,
    history: VecDeque<Decision>,
}
pub(crate) fn record(v: Res<Village>, people: Query<&Resident>, mut log: ResMut<Diagnostics>) {
    if !log.enabled {
        return;
    }
    for r in &people {
        let previous = log.history.iter().rev().find(|d| d.resident == r.id);
        if previous.is_some_and(|d| {
            d.task == r.task
                && d.reason == r.reason
                && d.destination == [r.target_x, r.target_y]
                && d.requested == r.requested
        }) {
            continue;
        }
        log.history.push_back(Decision {
            minute: v.minutes,
            resident: r.id,
            task: r.task.clone(),
            reason: r.reason.clone(),
            destination: [r.target_x, r.target_y],
            requested: r.requested,
        });
        while log.history.len() > 150 {
            log.history.pop_front();
        }
    }
}
#[wasm_bindgen]
impl Game {
    pub fn dev_observe(&mut self, enabled: bool) {
        let mut log = self.app.world_mut().resource_mut::<Diagnostics>();
        log.enabled = enabled;
        if !enabled {
            log.history.clear();
        }
    }
    /// Run the real chooser on a copy, and the same refusal rules used by requests.
    pub fn dev_inspect(&mut self) -> String {
        let v = self.app.world().resource::<Village>().clone();
        let people: Vec<_> = self
            .app
            .world_mut()
            .query::<&Resident>()
            .iter(self.app.world())
            .cloned()
            .collect();
        let residents: Vec<_> = people
            .iter()
            .map(|r| {
                let mut next = r.clone();
                choose(&mut next, &v);
                let alternatives: Vec<_> = [
                    "build",
                    "garden",
                    "cook",
                    "water",
                    "eat",
                    "gather",
                    "rest",
                    "socialize",
                    "compost",
                    "craft",
                ]
                .iter()
                .map(|task| {
                    serde_json::json!({"task": task, "blocker": request_blocker(&v, r, task, false),
                    "encouraged_blocker": request_blocker(&v, r, task, true)})
                })
                .collect();
                serde_json::json!({"resident": r, "next": {"task": next.task, "reason": next.reason,
                "destination": [next.target_x, next.target_y]}, "alternatives": alternatives})
            })
            .collect();
        serde_json::json!({"minute": v.minutes, "residents": residents,
            "history": self.app.world().resource::<Diagnostics>().history})
        .to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn inspection_is_read_only_and_refusals_match_real_requests() {
        let mut game = Game::new();
        game.dev_observe(true);
        let before = game.snapshot();
        let info: serde_json::Value = serde_json::from_str(&game.dev_inspect()).unwrap();
        assert_eq!(before, game.snapshot());
        for person in info["residents"].as_array().unwrap() {
            for candidate in person["alternatives"].as_array().unwrap() {
                if let Some(blocker) = candidate["blocker"].as_str() {
                    assert_eq!(
                        game.request(
                            person["resident"]["id"].as_u64().unwrap() as usize,
                            candidate["task"].as_str().unwrap(),
                            false
                        ),
                        blocker
                    );
                }
            }
        }
        for _ in 0..10000 {
            game.tick(0.25);
        }
        let info: serde_json::Value = serde_json::from_str(&game.dev_inspect()).unwrap();
        assert!(!info["history"].as_array().unwrap().is_empty());
        assert!(info["history"].as_array().unwrap().len() <= 150);
        game.dev_observe(false);
        assert!(
            game.app
                .world()
                .resource::<Diagnostics>()
                .history
                .is_empty()
        );
    }
}
