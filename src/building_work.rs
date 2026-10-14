//! Resident labour for removing structures and changing the village layout.
use crate::*;

#[derive(Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Action {
    Demolish,
    Salvage,
    Move,
}
#[derive(Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Stage {
    Remove,
    Pack,
    Rebuild,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Job {
    #[serde(default)]
    pub id: Option<simulation::Id>,
    pub building: usize,
    pub action: Action,
    pub stage: Stage,
    pub work: f32,
    pub original_progress: f32,
    pub original_x: i32,
    pub original_y: i32,
    pub destination: Option<(i32, i32)>,
    pub returns: economy::Bundle,
    pub project_paused: bool,
}
pub fn job(v: &Village, id: usize) -> Option<&Job> {
    v.building_jobs.iter().find(|j| j.building == id)
}
pub fn original_progress(v: &Village, id: usize) -> Option<f32> {
    job(v, id).map(|j| j.original_progress)
}
pub fn held_capacity(v: &Village, kind: &str) -> u32 {
    v.building_jobs
        .iter()
        .filter(|j| {
            j.original_progress >= 100.
                && v.buildings
                    .iter()
                    .any(|b| b.id == j.building && b.kind == kind)
        })
        .count() as u32
}
pub fn moving_storage(v: &Village) -> u32 {
    v.building_jobs
        .iter()
        .filter(|j| {
            j.action == Action::Move
                && j.original_progress >= 100.
                && v.buildings
                    .iter()
                    .any(|b| b.id == j.building && b.kind == "warehouse")
        })
        .count() as u32
}
pub fn reserved(v: &Village, x: i32, y: i32, ignore: Option<usize>) -> bool {
    v.building_jobs
        .iter()
        .filter(|j| Some(j.building) != ignore)
        .any(|j| {
            j.destination.is_some_and(|(dx, dy)| {
                v.buildings
                    .iter()
                    .find(|b| b.id == j.building)
                    .is_some_and(|b| {
                        let size = interactions::footprint_size(&b.kind);
                        (dx - size / 2..dx - size / 2 + size).contains(&x)
                            && (dy - size / 2..dy - size / 2 + size).contains(&y)
                    })
            })
        })
}
pub fn placement(
    v: &Village,
    kind: &str,
    x: i32,
    y: i32,
    ignore: Option<usize>,
) -> Result<(), &'static str> {
    if !(1..=MAP_SIZE - 2).contains(&x) || !(1..=MAP_SIZE - 2).contains(&y) {
        return Err("Choose a clearing inside the marked lot.");
    }
    let radius = interactions::radius(kind);
    if x - radius < 0
        || y - radius < 0
        || x + radius >= MAP_SIZE
        || y + radius >= MAP_SIZE
        || if kind == "hydro" {
            !hydro_site(x, y)
        } else {
            river_bank(x + radius - 1, y)
        }
    {
        return Err(if kind == "hydro" {
            "Place the generator in the shallow village side of the river. Workers approach from the bank."
        } else {
            "Keep the river and its banks clear. Choose a clearing farther inland."
        });
    }
    if (x as f32 - CAMP.0).abs() < radius as f32 + 0.5
        && (y as f32 - CAMP.1).abs() < radius as f32 + 0.5
    {
        return Err("Keep the arrival clearing free for gathering and supplies.");
    }
    if v.buildings
        .iter()
        .filter(|b| Some(b.id) != ignore)
        .any(|b| {
            (b.x - x).abs() < interactions::radius(&b.kind) + radius
                && (b.y - y).abs() < interactions::radius(&b.kind) + radius
        })
    {
        return Err("Leave a little room between buildings.");
    }
    let size = interactions::footprint_size(kind);
    for px in x - size / 2..x - size / 2 + size {
        for py in y - size / 2..y - size / 2 + size {
            if v.roads.contains(&(px, py)) {
                return Err("Keep roads clear. Choose a plot beside the road.");
            }
            if reserved(v, px, py, ignore) {
                return Err("That plot is reserved for a building move.");
            }
        }
    }
    if resource_sites::conflicts(v, kind, x, y) {
        return Err("Keep the local resource plot accessible.");
    }
    // Respect the same clearance around another reserved destination as around its structure.
    if v.building_jobs
        .iter()
        .filter(|j| Some(j.building) != ignore)
        .any(|j| {
            j.destination.is_some_and(|(dx, dy)| {
                v.buildings
                    .iter()
                    .find(|b| b.id == j.building)
                    .is_some_and(|b| {
                        (dx - x).abs() < interactions::radius(&b.kind) + radius
                            && (dy - y).abs() < interactions::radius(&b.kind) + radius
                    })
            })
        })
    {
        return Err("That plot is reserved for a building move.");
    }
    Ok(())
}
pub fn salvage(v: &Village, id: usize) -> economy::Bundle {
    let Some(p) = v.economy.projects.iter().find(|p| p.building == id) else {
        return [0; economy::COUNT];
    };
    let Some(b) = v.buildings.iter().find(|b| b.id == id) else {
        return [0; economy::COUNT];
    };
    let Some(stages) = economy::recipe(&b.kind, &p.recipe) else {
        return [0; economy::COUNT];
    };
    let mut maximum = [0; economy::COUNT];
    for stage in stages.iter().take(p.stage + usize::from(p.committed)) {
        for (i, n) in stage.items.iter().enumerate() {
            maximum[i] += n;
        }
    }
    std::array::from_fn(|i| p.consumed[i].min(maximum[i]) / 2)
}
pub fn total(j: &Job) -> f32 {
    match j.stage {
        Stage::Remove => {
            if j.action == Action::Demolish {
                18.
            } else {
                54.
            }
        }
        Stage::Pack => 24.,
        Stage::Rebuild => 36.,
    }
}
pub fn next(v: &Village) -> Option<usize> {
    v.building_jobs
        .iter()
        .find(|j| {
            v.buildings
                .iter()
                .find(|b| b.id == j.building)
                .is_some_and(|b| (0..2).any(|id| spacing::approach(v, b, id).is_some()))
        })
        .map(|j| j.building)
}
pub fn assign_target(r: &mut Resident, v: &Village) {
    let Some(id) = next(v) else {
        assign(
            r,
            v,
            "rest",
            "There is no available crew job. Taking a break.",
            false,
        );
        return;
    };
    let b = v.buildings.iter().find(|b| b.id == id).unwrap();
    if let Some((x, y)) = spacing::approach(v, b, r.id) {
        r.activity_building = Some(id);
        r.target_x = x;
        r.target_y = y;
        r.reason = match job(v, id).unwrap().stage {
            Stage::Pack => "Packing this building for its new home.",
            Stage::Rebuild => "Rebuilding at our reserved destination.",
            Stage::Remove => {
                if job(v, id).unwrap().action == Action::Salvage {
                    "Carefully taking this building apart for reusable materials."
                } else {
                    "Clearing this building quickly."
                }
            }
        }
        .into();
    } else {
        assign(
            r,
            v,
            "rest",
            "There is no clear work spot here. Taking a break.",
            false,
        );
    }
}
pub fn sync(r: &mut Resident, v: &Village) {
    if r.task != "building_work" {
        return;
    }
    let target = r
        .activity_building
        .and_then(|id| job(v, id).and_then(|_| v.buildings.iter().find(|b| b.id == id)))
        .and_then(|b| spacing::approach(v, b, r.id));
    if target.is_none_or(|(x, y)| (x - r.target_x).hypot(y - r.target_y) > 0.1) {
        r.remaining = 0.;
    }
}
pub fn work(v: &mut Village, id: usize, effort: f32) -> bool {
    let Some(index) = v.building_jobs.iter().position(|j| j.building == id) else {
        return false;
    };
    let needed = total(&v.building_jobs[index]);
    v.building_jobs[index].work = (v.building_jobs[index].work + effort).min(needed);
    if v.building_jobs[index].work < needed {
        return false;
    }
    if v.building_jobs[index].stage == Stage::Pack {
        let destination = v.building_jobs[index].destination.unwrap();
        let b = v.buildings.iter_mut().find(|b| b.id == id).unwrap();
        (b.x, b.y) = destination;
        v.building_jobs[index].stage = Stage::Rebuild;
        v.building_jobs[index].work = 0.;
        event(
            v,
            "Packing is finished. Residents will walk to the new site and rebuild there.",
        );
        return true;
    }
    let j = v.building_jobs.remove(index);
    if j.action == Action::Move {
        v.buildings
            .iter_mut()
            .find(|b| b.id == id)
            .unwrap()
            .progress = j.original_progress;
        if let Some(p) = v.economy.projects.iter_mut().find(|p| p.building == id) {
            p.paused = j.project_paused;
        }
        event(v, "Our building is ready in its new place.");
    } else {
        v.buildings.retain(|b| b.id != id);
        v.economy.projects.retain(|p| p.building != id);
        v.power.disabled.retain(|&b| b != id);
        for (i, n) in j.returns.iter().enumerate() {
            economy::add(v, i, *n);
        }
        event(
            v,
            if j.action == Action::Salvage {
                "Salvage is finished. Recovered materials are back in storage."
            } else {
                "Demolition is finished. The plot is clear."
            },
        );
    }
    v.power.stored = v.power.stored.min(power::supply(v).capacity);
    v.water = v.water.min(ecology::capacity(v));
    economy::rebalance(v);
    true
}
pub fn valid(v: &Village) -> bool {
    let mut ids = std::collections::HashSet::new();
    v.building_jobs.iter().all(|j| {
        let Some(b) = v.buildings.iter().find(|b| b.id == j.building) else {
            return false;
        };
        let position = if j.stage == Stage::Rebuild {
            j.destination
        } else {
            Some((j.original_x, j.original_y))
        };
        ids.insert(j.building)
            && b.progress == 0.
            && j.work.is_finite()
            && j.work >= 0.
            && j.work < total(j)
            && j.original_progress.is_finite()
            && (0.0..=100.).contains(&j.original_progress)
            && position == Some((b.x, b.y))
            && (1..MAP_SIZE - 1).contains(&j.original_x)
            && (1..MAP_SIZE - 1).contains(&j.original_y)
            && match j.action {
                Action::Move => {
                    j.original_progress == 100.
                        && matches!(j.stage, Stage::Pack | Stage::Rebuild)
                        && j.returns == [0; economy::COUNT]
                        && j.destination.is_some_and(|(x, y)| {
                            (x, y) != (j.original_x, j.original_y)
                                && placement(v, &b.kind, x, y, Some(b.id)).is_ok()
                        })
                }
                Action::Demolish | Action::Salvage => {
                    j.stage == Stage::Remove
                        && j.destination.is_none()
                        && j.returns
                            == if j.action == Action::Salvage {
                                salvage(v, b.id)
                            } else {
                                [0; economy::COUNT]
                            }
                }
            }
            && v.economy
                .projects
                .iter()
                .find(|p| p.building == b.id)
                .is_none_or(|p| p.paused && p.reserved == [0; economy::COUNT])
    })
}
#[wasm_bindgen]
impl Game {
    pub fn building_work_quote(&self, id: usize) -> String {
        let v = self.app.world().resource::<Village>();
        serde_json::json!({"salvage":salvage(v,id),"demolish_work":18,"salvage_work":54,"move_work":60}).to_string()
    }
    pub fn queue_building_work(&mut self, id: usize, action: &str, x: i32, y: i32) -> String {
        let action = match action {
            "demolish" => Action::Demolish,
            "salvage" => Action::Salvage,
            "move" => Action::Move,
            _ => return "Unknown building work.".into(),
        };
        let village = {
            let mut v = self.app.world_mut().resource_mut::<Village>();
            let Some(b) = v.buildings.iter().find(|b| b.id == id) else {
                return "Building not found.".into();
            };
            if job(&v, id).is_some() {
                return "This building already has a crew job.".into();
            }
            if action == Action::Move {
                if b.progress < 100. {
                    return "Finish construction before moving this building.".into();
                }
                if (x, y) == (b.x, b.y) {
                    return "Choose a different plot for the move.".into();
                }
                if let Err(reason) = placement(&v, &b.kind, x, y, Some(id)) {
                    return reason.into();
                }
            }
            let returns = if action == Action::Salvage {
                salvage(&v, id)
            } else {
                [0; economy::COUNT]
            };
            let capacity = if b.kind == "warehouse" && b.progress >= 100. && action != Action::Move
            {
                economy::capacity(&v).saturating_sub(300)
            } else {
                economy::capacity(&v)
            };
            if economy::storage(&v) + returns.iter().sum::<u32>() > capacity {
                return "Make room in remaining storage for this job and its recovered materials first.".into();
            }
            let j = Job {
                id: None,
                building: id,
                action,
                stage: if action == Action::Move {
                    Stage::Pack
                } else {
                    Stage::Remove
                },
                work: 0.,
                original_progress: b.progress,
                original_x: b.x,
                original_y: b.y,
                destination: if action == Action::Move {
                    Some((x, y))
                } else {
                    None
                },
                returns,
                project_paused: v
                    .economy
                    .projects
                    .iter()
                    .find(|p| p.building == id)
                    .is_some_and(|p| p.paused),
            };
            let Some(work_id) = v.simulation.allocate() else {
                return "Work identity limit reached.".into();
            };
            let mut j = j;
            j.id = Some(work_id);
            v.building_jobs.push(j);
            v.buildings
                .iter_mut()
                .find(|b| b.id == id)
                .unwrap()
                .progress = 0.;
            if let Some(p) = v.economy.projects.iter_mut().find(|p| p.building == id) {
                p.paused = true;
                p.reserved = [0; economy::COUNT];
            }
            economy::rebalance(&mut v);
            event(
                &mut v,
                "Building work is queued. Residents will make time during community work hours.",
            );
            v.clone()
        };
        let mut q = self.app.world_mut().query::<&mut Resident>();
        for mut r in q.iter_mut(self.app.world_mut()) {
            if r.trip.is_none() && (r.activity_building == Some(id) || r.visit_building == Some(id))
            {
                choose(&mut r, &village);
            }
        }
        "ok".into()
    }
    pub fn cancel_building_work(&mut self, id: usize) -> String {
        let village = {
            let mut v = self.app.world_mut().resource_mut::<Village>();
            let Some(index) = v.building_jobs.iter().position(|j| j.building == id) else {
                return "Crew job not found.".into();
            };
            if v.building_jobs[index].stage == Stage::Rebuild {
                return "Packing is finished. Complete rebuilding at the new site.".into();
            }
            let j = v.building_jobs.remove(index);
            v.buildings
                .iter_mut()
                .find(|b| b.id == id)
                .unwrap()
                .progress = j.original_progress;
            if let Some(p) = v.economy.projects.iter_mut().find(|p| p.building == id) {
                p.paused = j.project_paused;
            }
            economy::rebalance(&mut v);
            event(
                &mut v,
                "Building work cancelled. No materials were recovered.",
            );
            v.clone()
        };
        let mut q = self.app.world_mut().query::<&mut Resident>();
        for mut r in q.iter_mut(self.app.world_mut()) {
            if r.task == "building_work" && r.activity_building == Some(id) {
                assign(
                    &mut r,
                    &village,
                    "rest",
                    "The crew job was cancelled.",
                    false,
                );
            }
        }
        "ok".into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn sandbox(kind: &str) -> Game {
        let mut g = Game::new();
        g.start_mode("sandbox");
        assert_eq!(g.place(kind, 5, 5), "ok");
        g
    }
    fn checkpoint(g: &mut Game) {
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_eq!(g.snapshot(), saved);
    }
    #[test]
    fn demolition_is_faster_and_salvage_returns_only_paid_materials_once() {
        let mut g = sandbox("garden");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.mode = modes::Mode::Story;
            v.economy.projects[0].consumed[0] = 4;
            v.economy.projects[0].consumed[2] = 4;
        }
        let before = g.app.world().resource::<Village>().wood;
        assert_eq!(g.queue_building_work(0, "salvage", 0, 0), "ok");
        checkpoint(&mut g);
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            assert!(!work(&mut v, 0, 18.));
            assert_eq!(v.wood, before);
            assert_eq!(v.buildings.len(), 1);
            assert!(work(&mut v, 0, 36.));
            assert_eq!(v.wood, before + 2.);
            assert_eq!(v.buildings.len(), 0);
            assert!(!work(&mut v, 0, 54.));
            assert_eq!(v.wood, before + 2.);
        }
        checkpoint(&mut g);
        let mut fast = sandbox("garden");
        assert_eq!(fast.queue_building_work(0, "demolish", 0, 0), "ok");
        assert!(work(
            &mut fast.app.world_mut().resource_mut::<Village>(),
            0,
            18.
        ));
        assert_eq!(fast.app.world().resource::<Village>().wood, 100.);
    }
    #[test]
    fn moves_reserve_a_plot_then_require_rebuilding_and_keep_crop_and_identity() {
        let mut g = sandbox("garden");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.buildings[0].crop = ecology::Crop {
                planted: true,
                growth: 50.,
                moisture: 120.,
                ..Default::default()
            };
        }
        assert_eq!(g.queue_building_work(0, "move", 16, 18), "ok");
        checkpoint(&mut g);
        assert_ne!(g.place("home", 16, 18), "ok");
        assert_ne!(g.toggle_road(16, 18), "ok");
        assert_ne!(g.place_source(0, 16, 18), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            assert!(!work(&mut v, 0, 23.));
            assert_eq!(v.buildings[0].x, 5);
            assert!(work(&mut v, 0, 1.));
            assert_eq!(v.buildings[0].x, 16);
            assert_eq!(v.buildings[0].progress, 0.);
        }
        checkpoint(&mut g);
        assert_ne!(g.cancel_building_work(0), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            assert!(work(&mut v, 0, 36.));
            assert_eq!(v.buildings[0].id, 0);
            assert_eq!(v.buildings[0].crop.growth, 50.);
            assert_eq!(v.buildings[0].crop.moisture, 120.);
            assert_eq!(v.buildings[0].progress, 100.);
            assert_eq!(v.economy.next_building, 1);
        }
        assert_eq!(g.toggle_road(5, 5), "ok");
        checkpoint(&mut g);
    }
    #[test]
    fn cancellation_refunds_no_materials_and_releases_the_destination() {
        let mut g = sandbox("home");
        assert_eq!(g.queue_building_work(0, "move", 16, 18), "ok");
        assert_eq!(g.cancel_building_work(0), "ok");
        assert_eq!(
            g.app.world().resource::<Village>().buildings[0].progress,
            100.
        );
        assert_eq!(g.place("garden", 16, 18), "ok");
        checkpoint(&mut g);
        assert_eq!(g.queue_building_work(0, "salvage", 0, 0), "ok");
        let wood = g.app.world().resource::<Village>().wood;
        assert_eq!(g.cancel_building_work(0), "ok");
        assert_eq!(g.app.world().resource::<Village>().wood, wood);
        checkpoint(&mut g);
    }
    #[test]
    fn invalid_jobs_are_atomic_and_corrupted_saved_jobs_are_rejected() {
        let mut g = sandbox("home");
        let before = g.snapshot();
        for (action, x, y) in [
            ("unknown", 16, 18),
            ("move", 5, 5),
            ("move", 10, 13),
            ("move", 26, 5),
        ] {
            assert_ne!(g.queue_building_work(0, action, x, y), "ok");
            assert_eq!(g.snapshot(), before);
        }
        assert_eq!(g.queue_building_work(0, "move", 16, 18), "ok");
        let save = g.snapshot();
        assert_ne!(g.queue_building_work(0, "demolish", 0, 0), "ok");
        assert_eq!(g.snapshot(), save);
        for (key, value) in [
            ("work", serde_json::json!(-1)),
            ("stage", serde_json::json!("remove")),
            ("returns", serde_json::json!(vec![1; 15])),
            ("destination", serde_json::json!([10, 13])),
            ("original_progress", serde_json::json!(50)),
        ] {
            let mut invalid: serde_json::Value = serde_json::from_str(&save).unwrap();
            invalid["village"]["building_jobs"][0][key] = value;
            assert!(!g.restore(&invalid.to_string()));
            assert_eq!(g.snapshot(), save);
        }
    }
    #[test]
    fn storage_and_incoming_salvage_cannot_overfill_remaining_space() {
        let mut g = sandbox("warehouse");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.economy.stock[1] = 400;
        }
        let before = g.snapshot();
        assert_ne!(g.queue_building_work(0, "demolish", 0, 0), "ok");
        assert_eq!(g.snapshot(), before);
        assert_eq!(g.queue_building_work(0, "move", 16, 18), "ok");
        assert_eq!(economy::capacity(g.app.world().resource::<Village>()), 900);
        checkpoint(&mut g);
        assert_eq!(g.cancel_building_work(0), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.economy.stock[1] = 24;
        }
        assert_eq!(g.queue_building_work(0, "salvage", 0, 0), "ok");
        assert_eq!(economy::capacity(g.app.world().resource::<Village>()), 600);
        checkpoint(&mut g);
    }
    #[test]
    fn utility_storage_is_retained_until_work_finishes_or_a_move_returns() {
        let mut g = sandbox("well");
        {
            g.app.world_mut().resource_mut::<Village>().water = 110.;
        }
        assert_eq!(g.queue_building_work(0, "move", 16, 18), "ok");
        checkpoint(&mut g);
        assert_eq!(ecology::capacity(g.app.world().resource::<Village>()), 115.);
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            work(&mut v, 0, 24.);
            work(&mut v, 0, 36.);
            assert_eq!(v.water, 110.);
        }
        assert_eq!(g.queue_building_work(0, "demolish", 0, 0), "ok");
        assert_eq!(g.app.world().resource::<Village>().water, 110.);
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            work(&mut v, 0, 18.);
            assert_eq!(v.water, 40.);
        }
        checkpoint(&mut g);
    }
    #[test]
    fn missing_worksites_leave_a_valid_rest_activity_instead_of_an_orphaned_job() {
        let mut g = Game::new();
        let v = g.app.world().resource::<Village>().clone();
        let mut q = g.app.world_mut().query::<&mut Resident>();
        let mut r = q.iter_mut(g.app.world_mut()).next().unwrap();
        assign(&mut r, &v, "building_work", "Please help", true);
        assert_eq!(r.task, "rest");
        assert_eq!(r.activity_building, None);
        let saved = g.snapshot();
        assert!(g.restore(&saved));
    }
}
