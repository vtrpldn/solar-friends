//! Persistent, bounded helping orders. Resident activities remain the claims.
use crate::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Accepted,
    Travelling,
    Working,
    Paused,
    Blocked,
    Complete,
    Cancelled,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Request {
    pub id: simulation::Id,
    pub task: String,
    pub building: Option<usize>,
    pub material: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub batch: Option<simulation::Id>,
    pub destination: Option<(i32, i32)>,
    pub created: f32,
    pub finished: Option<f32>,
    pub remaining: f32,
    pub phase: Phase,
    pub reason: String,
}
impl Request {
    pub fn active(&self) -> bool {
        !matches!(self.phase, Phase::Complete | Phase::Cancelled)
    }
}
pub fn work(task: &str) -> bool {
    matches!(
        task,
        "build"
            | "building_work"
            | "gather"
            | "garden"
            | "water"
            | "cook"
            | "compost"
            | "restore"
            | "utility"
            | "craft"
            | "source"
            | "prepare"
    )
}
pub fn allowed(task: &str) -> bool {
    work(task) && !matches!(task, "restore" | "utility")
        || matches!(task, "eat" | "rest" | "socialize" | "outside")
}
pub fn pending(r: &Resident, task: &str) -> bool {
    r.help
        .as_ref()
        .is_some_and(|q| q.active() && q.task == task)
}
fn continuous(task: &str) -> bool {
    matches!(task, "build" | "building_work" | "outside")
}
pub(crate) fn related(task: &str, requested: &str) -> bool {
    task == requested
        || (task == "haul"
            && matches!(
                requested,
                "build" | "building_work" | "prepare" | "craft" | "cook"
            ))
}
fn owns_activity(r: &Resident) -> bool {
    r.requested
        && r.help
            .as_ref()
            .is_some_and(|q| q.active() && related(&r.task, &q.task))
}
fn finish(r: &mut Resident, v: &Village, phase: Phase, reason: &str) {
    let owned = owns_activity(r);
    if let Some(q) = r.help.as_mut() {
        q.phase = phase;
        q.reason = reason.into();
        q.finished = Some(v.minutes);
    }
    if owned {
        r.remaining = 0.;
        r.requested = false;
    }
}
pub fn observe(r: &mut Resident, v: &Village) {
    let Some(q) = r.help.as_ref().filter(|q| q.active()).cloned() else {
        return;
    };
    if matches!(q.task.as_str(), "prepare" | "craft" | "cook")
        && let Some(id) = q.batch
    {
        match production::batch(v, id).map(|b| b.phase) {
            Some(production::Phase::Complete) => {
                finish(
                    r,
                    v,
                    Phase::Complete,
                    "The requested production batch is ready.",
                );
                return;
            }
            Some(production::Phase::Cancelled) | None => {
                finish(
                    r,
                    v,
                    Phase::Cancelled,
                    if q.batch
                        .and_then(|id| production::batch(v, id))
                        .is_some_and(|b| b.spoiled)
                    {
                        "The pot's ingredients spoiled during the interruption. Fresh inputs were recovered; ask for a new batch."
                    } else {
                        "The requested production batch was cancelled."
                    },
                );
                return;
            }
            _ => {}
        }
    }
    if q.task == "build" {
        match v.buildings.iter().find(|b| Some(b.id) == q.building) {
            None => {
                finish(
                    r,
                    v,
                    Phase::Cancelled,
                    "That project was removed. Your request is cancelled.",
                );
                return;
            }
            Some(b) if b.progress >= 100. => {
                finish(r, v, Phase::Complete, "The requested building is ready.");
                return;
            }
            _ => {}
        }
    } else if q.task == "building_work"
        && q.building
            .is_some_and(|id| building_work::job(v, id).is_none())
    {
        let b = v.buildings.iter().find(|b| Some(b.id) == q.building);
        let done = if let Some((x, y)) = q.destination {
            b.is_some_and(|b| b.progress >= 100. && (b.x, b.y) == (x, y))
        } else {
            b.is_none()
        };
        finish(
            r,
            v,
            if done {
                Phase::Complete
            } else {
                Phase::Cancelled
            },
            if done {
                "The requested crew job is finished."
            } else {
                "The crew job was cancelled."
            },
        );
        return;
    } else if q.task == "outside"
        && r.trip.is_none()
        && v.economy.work_day[&r.id] >= (q.created / 1440.) as i32
    {
        finish(
            r,
            v,
            Phase::Complete,
            "The outside shift is finished and the income has reached the community fund.",
        );
        return;
    } else if q
        .building
        .is_some_and(|id| !v.buildings.iter().any(|b| b.id == id))
        || (q.task == "source"
            && q.material
                .is_some_and(|i| v.economy.sources.get(i).is_none_or(|s| !s.active)))
    {
        finish(
            r,
            v,
            Phase::Cancelled,
            "The requested worksite was removed.",
        );
        return;
    }
    let matching = r.requested && related(&r.task, &q.task);
    if !matching
        && q.phase == Phase::Blocked
        && matches!(q.task.as_str(), "prepare" | "craft" | "cook")
        && let Some(batch) = q.batch.and_then(|id| production::batch(v, id))
        && let Some(reason) = production::power_blocker(v, batch.site)
    {
        r.help.as_mut().unwrap().reason = reason.into();
    }
    if matching {
        let away = r
            .trip
            .as_ref()
            .is_some_and(|t| t.phase == mobility::Phase::Away);
        let travelling = if let Some(t) = &r.trip {
            t.phase != mobility::Phase::Away
        } else {
            (r.x - r.target_x).hypot(r.y - r.target_y) > 0.08 || r.task == "haul"
        };
        let q = r.help.as_mut().unwrap();
        q.phase = if travelling {
            Phase::Travelling
        } else {
            Phase::Working
        };
        q.reason = if away {
            "Working the outside shift.".into()
        } else {
            r.reason.clone()
        };
    } else if q.phase != Phase::Blocked {
        let q = r.help.as_mut().unwrap();
        q.phase = Phase::Paused;
        q.reason = match r.task.as_str() {
            "eat" => "Paused for a meal. The request will continue afterwards.",
            "rest" => "Paused for rest. The request is saved.",
            "socialize" => "Paused to catch up with neighbours. The request is saved.",
            "sleep" => "Paused for sleep. The request will continue after waking.",
            "sanitation" => "Paused for a private moment. The request is saved.",
            "outside" => {
                "An outside shift comes first. Disable future shifts to make room for village work."
            }
            _ => "Waiting for a safe moment to continue.",
        }
        .into();
    }
}
pub fn pause(r: &mut Resident) {
    if let Some(q) = r.help.as_mut().filter(|q| q.active()) {
        if r.requested && r.task == q.task && !continuous(&q.task) {
            q.remaining = r.remaining.max(0.01);
        }
        q.phase = Phase::Paused;
        q.reason = "Waiting for a safe moment to continue.".into();
        r.requested = false;
    }
}
fn wait(r: &mut Resident, phase: Phase, reason: &str) -> bool {
    let q = r.help.as_mut().unwrap();
    q.phase = phase;
    q.reason = reason.into();
    r.requested = false;
    false
}
pub(crate) fn supply_wait(v: &Village, id: usize) -> String {
    let p = v
        .economy
        .projects
        .iter()
        .find(|p| p.building == id)
        .unwrap();
    let b = v.buildings.iter().find(|b| b.id == id).unwrap();
    let stages = economy::recipe(&b.kind, &p.recipe).unwrap();
    let ordered = stages[p.stage]
        .items
        .iter()
        .enumerate()
        .all(|(i, n)| economy::incoming(v, i) >= n.saturating_sub(p.reserved[i]));
    let missing: Vec<_> = stages[p.stage]
        .items
        .iter()
        .enumerate()
        .filter_map(|(i, n)| {
            let n = n.saturating_sub(p.reserved[i]);
            (n > 0).then(|| format!("{} {n}", economy::NAMES[i]))
        })
        .take(4)
        .collect();
    if !missing.is_empty() {
        if ordered {
            return format!(
                "Ordered supplies are still travelling: {}. They unload at camp before residents can bring them here.",
                missing.join(", ")
            );
        }
        return format!(
            "This stage still needs {}. Collect or prepare locally, or order from Town.",
            missing.join(", ")
        );
    }
    if v.logistics.as_ref().is_some_and(|s| {
        s.shipments.iter().any(|h| {
            s.stores
                .iter()
                .any(|p| p.id == h.to && p.owner == logistics::Owner::Site(id))
        })
    }) {
        "Other deliveries are bringing this stage's supplies. I will continue when they arrive."
            .into()
    } else {
        "Reserved supplies need a clear route from an accessible store. Recover loose piles, make storage room and leave clear approaches.".into()
    }
}
pub fn resume(r: &mut Resident, v: &Village) -> bool {
    observe(r, v);
    let Some(q) = r.help.as_ref().filter(|q| q.active()).cloned() else {
        return false;
    };
    let essential = (q.task == "rest" && r.energy < 28.)
        || (q.task == "eat"
            && (r.hunger > 60.
                || (v.meals > 0 && r.hunger > 30.)
                || autonomy::meal_due(r, v.minutes)))
        || (q.task == "gather" && supplies::urgent(v));
    if q.task != "outside" && occupations::available(v, r.id) && !essential {
        return wait(
            r,
            Phase::Paused,
            "An outside shift comes first. Disable future shifts to make room for village work.",
        );
    }
    if situations::protected(v, r.id, &q.task) {
        return wait(
            r,
            Phase::Paused,
            "Our community agreement comes first. The request is saved.",
        );
    }
    if !continuous(&q.task)
        && q.building
            .is_some_and(|id| v.buildings.iter().any(|b| b.id == id && b.progress < 100.))
    {
        return wait(
            r,
            Phase::Blocked,
            "The requested worksite is closed for construction or crew work.",
        );
    }
    if q.task == "garden"
        && q.building.is_some_and(|id| {
            !v.buildings.iter().any(|b| {
                b.id == id
                    && ecology::needs_tending(
                        v,
                        b,
                        water::irrigation(v, water::Owner::Building(b.id)),
                    )
            })
        })
    {
        return wait(
            r,
            Phase::Blocked,
            "This plot is growing or needs water. I will tend it when it is ready.",
        );
    }
    let task = if q.task == "build" {
        let id = q.building.unwrap();
        if building_work::job(v, id).is_some() {
            return wait(
                r,
                Phase::Blocked,
                "Crew work takes precedence at this site. Finish or cancel it before continuing construction.",
            );
        }
        if v.economy
            .projects
            .iter()
            .any(|p| p.building == id && p.paused)
        {
            return wait(
                r,
                Phase::Blocked,
                "This project is paused. Resume it in Construction or cancel the request.",
            );
        }
        if economy::can_build(v, id) {
            "build"
        } else {
            "haul"
        }
    } else if (matches!(q.task.as_str(), "prepare" | "craft" | "cook")
        && q.batch
            .and_then(|id| production::batch(v, id))
            .is_some_and(|b| {
                !b.committed
                    && !production::inputs_ready(v, b)
                    && production::operational(v, b.site)
            }))
        || (q.task == "building_work"
            && q.building
                .is_some_and(|id| logistics::occupied_building(v, id)))
    {
        "haul"
    } else {
        q.task.as_str()
    };
    if task == "haul" {
        let mut worker = r.clone();
        worker.task = "haul".into();
        worker.requested = true;
        if logistics::quote(v, &worker).is_none() {
            let reason = if matches!(q.task.as_str(), "prepare" | "craft" | "cook") {
                "The batch inputs need a clear route to the production worksite. Check access and reserved supplies.".into()
            } else if q.task == "build" {
                supply_wait(v, q.building.unwrap())
            } else {
                "The storage contents need an accessible receiving store and a clear route before packing can start.".into()
            };
            return wait(r, Phase::Blocked, &reason);
        }
    } else if matches!(task, "prepare" | "craft" | "cook") {
        let Some(batch) = q.batch.and_then(|id| production::batch(v, id)) else {
            return wait(
                r,
                Phase::Blocked,
                "This request no longer has a production batch.",
            );
        };
        if !production::ready(v, batch) {
            return wait(
                r,
                Phase::Blocked,
                if let Some(reason) = production::power_blocker(v, batch.site) {
                    reason
                } else if batch.material == economy::MEALS {
                    production::building(v, batch.site)
                        .and_then(|id| {
                            sanitation::washing_blocker(v, water::Owner::Building(id), 1.)
                        })
                        .unwrap_or("The saved pot is waiting for staged inputs or an open kitchen.")
                } else {
                    "The batch is waiting for staged inputs or an open worksite. Check production and hauling."
                },
            );
        }
    } else if task == "source" {
        if !economy::local_job(v).is_some_and(|(t, i)| t == task && Some(i) == q.material) {
            return wait(
                r,
                Phase::Blocked,
                "That batch is not ready. Check its inputs, output space and current project demand.",
            );
        }
    } else if task != "build" && task != "building_work" && !available(v, task) {
        return wait(
            r,
            Phase::Blocked,
            "The requested batch is not ready. Check its supplies or cancel this request.",
        );
    }
    if task == "eat" && !workforce::eating(v, r.id) {
        return wait(
            r,
            Phase::Blocked,
            "The available portions are already claimed. Waiting for food.",
        );
    }
    if !workforce::claim_available(v, r, task, q.building, q.material) {
        return wait(
            r,
            Phase::Blocked,
            "Another neighbour is using that work position. I will wait for a turn.",
        );
    }
    assign(
        r,
        v,
        task,
        "Continuing the work you asked me to help with.",
        true,
    );
    if matches!(task, "prepare" | "craft" | "cook")
        && !q.batch.is_some_and(|id| production::assign_batch(r, v, id))
    {
        return wait(
            r,
            Phase::Blocked,
            "There is no clear work position at this production site.",
        );
    }
    if let Some(id) = q.building.filter(|_| task != "haul") {
        let Some(b) = v.buildings.iter().find(|b| b.id == id) else {
            return false;
        };
        let Some((x, y)) = spacing::approach(v, b, r.id) else {
            return wait(
                r,
                Phase::Blocked,
                "The worksite has no clear approach. Leave some breathing space around it.",
            );
        };
        r.task = task.into();
        r.activity_building = Some(id);
        r.target_x = x;
        r.target_y = y;
    }
    if r.task != task {
        return wait(
            r,
            Phase::Blocked,
            "There is no clear work position at the requested site.",
        );
    }
    if task != "eat" {
        r.activity_material = q.material;
    }
    if !continuous(&q.task) && !matches!(q.task.as_str(), "prepare" | "craft" | "cook") {
        r.remaining = q.remaining;
    }
    if walking::supports(task) {
        match walking::quote(v, r) {
            Ok((route, _)) => {
                let point = route.points.last().unwrap();
                (r.target_x, r.target_y) = (point[0], point[1]);
            }
            Err(reason) => {
                walking::block(v, r, reason);
                return false;
            }
        }
    }
    observe(r, v);
    true
}
pub fn completed_batch(r: &mut Resident, v: &Village, completed: bool) {
    let Some(q) = r
        .help
        .as_ref()
        .filter(|q| q.active() && q.task == r.task && r.requested)
    else {
        return;
    };
    if continuous(&q.task) {
        observe(r, v);
        return;
    }
    if completed {
        finish(
            r,
            v,
            Phase::Complete,
            "Finished the batch you asked me to help with.",
        );
    } else {
        r.help.as_mut().unwrap().remaining = 10.;
        wait(
            r,
            Phase::Blocked,
            "This batch could not finish. Its supplies, demand or worksite changed.",
        );
    }
}
pub fn matches_haul(
    v: &Village,
    r: &Resident,
    from: logistics::Owner,
    to: logistics::Owner,
    material: usize,
) -> bool {
    let Some(q) = r
        .help
        .as_ref()
        .filter(|q| q.active() && r.requested && r.task == "haul")
    else {
        return true;
    };
    match (q.task.as_str(), q.building) {
        ("build", Some(id)) => to == logistics::Owner::Site(id),
        ("building_work", Some(id)) => {
            matches!(from,logistics::Owner::Warehouse(b)|logistics::Owner::Site(b)|logistics::Owner::Pantry(b) if b==id)
                || matches!(from,logistics::Owner::Production(site) if production::building(v,site)==Some(id))
        }
        ("prepare" | "craft" | "cook", _) => q
            .batch
            .and_then(|id| production::batch(v, id))
            .is_some_and(|b| {
                to == production::owner(v, b.site)
                    && !b.committed
                    && b.inputs.get(material).is_some_and(|n| *n > 0)
            }),
        _ => true,
    }
}
pub fn enqueue_at(
    v: &mut Village,
    r: &mut Resident,
    task: &str,
    encourage: bool,
    at: Option<usize>,
) -> String {
    let tools = if matches!(task, "craft" | "cook") {
        let ordered = if task == "cook" {
            production::order_meals(v, at)
        } else {
            production::order_tools(v, at)
        };
        let Some(id) = ordered else {
            return if task=="cook"{"That kitchen cannot queue a pot. Check ingredients, pantry space, existing meals and paused work."}else{"That workshop cannot start a tool batch. Check its supplies, space and other work."}.into();
        };
        Some(id)
    } else {
        None
    };
    let building = if let Some(id) = tools {
        production::batch(v, id).and_then(|b| production::building(v, b.site))
    } else if task == "garden" && at.is_some() {
        at
    } else if task == "build" {
        v.economy
            .projects
            .iter()
            .filter(|p| {
                building_work::job(v, p.building).is_none()
                    && v.buildings
                        .iter()
                        .any(|b| b.id == p.building && b.progress < 100.)
            })
            .max_by_key(|p| (p.priority, std::cmp::Reverse(p.building)))
            .map(|p| p.building)
    } else if task == "building_work" {
        v.building_jobs.first().map(|j| j.building)
    } else if task == "rest" {
        shelter(v, r.id).map(|b| b.id)
    } else if matches!(
        task,
        "source" | "prepare" | "outside" | "water" | "gather" | "rest" | "socialize" | "eat"
    ) {
        if matches!(
            task,
            "source" | "prepare" | "outside" | "water" | "gather" | "eat"
        ) {
            None
        } else {
            destination_building(v, task, r.id).map(|b| b.id)
        }
    } else {
        destination_building(v, task, r.id).map(|b| b.id)
    };
    let batch = if let Some(id) = tools {
        Some(id)
    } else if task == "prepare" {
        production::jobs(v)
            .find(|b| b.material != economy::TOOLS)
            .or_else(|| {
                v.production
                    .batches
                    .iter()
                    .find(|b| b.active() && b.material != economy::TOOLS)
            })
            .map(|b| b.id)
    } else {
        None
    };
    let material = if matches!(task, "prepare" | "craft" | "cook") {
        batch
            .and_then(|id| production::batch(v, id))
            .map(|b| b.material)
    } else if task == "source" {
        economy::local_job(v).map(|(_, i)| i)
    } else {
        None
    };
    let Some(id) = v.simulation.allocate() else {
        return "The work identity limit has been reached.".into();
    };
    logistics::interrupt(v, r);
    water::interrupt(v, r);
    let destination = building
        .and_then(|id| building_work::job(v, id))
        .and_then(|j| j.destination);
    r.help = Some(Request {
        id,
        task: task.into(),
        building,
        material,
        batch,
        destination,
        created: v.minutes,
        finished: None,
        remaining: if task == "eat" {
            5.
        } else if task == "compost" {
            3.
        } else if matches!(task, "rest" | "socialize") {
            12.
        } else {
            10.
        },
        phase: Phase::Accepted,
        reason: "Your request is accepted.".into(),
    });
    r.requested = false;
    if !resume(r, v) {
        assign(
            r,
            v,
            "idle",
            "Your request is saved. Taking a break until it can continue.",
            false,
        );
    }
    let reason = if encourage {
        "You explained why this matters. I'll lend a hand."
    } else {
        "Happy to help with your request."
    };
    format!("{}: {reason} {}", r.name, r.help.as_ref().unwrap().reason)
}
pub fn valid(v: &Village, r: &Resident) -> bool {
    let Some(q) = &r.help else {
        return true;
    };
    q.id.0 > 0
        && q.id.0 < v.simulation.next_id
        && allowed(&q.task)
        && q.created.is_finite()
        && (0.0..=v.minutes).contains(&q.created)
        && q.remaining.is_finite()
        && (0.0..=100.).contains(&q.remaining)
        && q.reason.len() <= 300
        && q.finished
            .is_none_or(|at| at.is_finite() && at >= q.created && at <= v.minutes)
        && (q.active() == q.finished.is_none())
        && q.building.is_none_or(|id| {
            id < v.economy.next_building && (!q.active() || v.buildings.iter().any(|b| b.id == id))
        })
        && (!matches!(
            q.task.as_str(),
            "build" | "building_work" | "garden" | "cook" | "compost" | "craft"
        ) || q.building.is_some())
        && q.material.is_none_or(|i| {
            if q.task == "source" {
                v.economy
                    .sources
                    .get(i)
                    .is_some_and(|s| !q.active() || s.active)
            } else {
                matches!(q.task.as_str(), "prepare" | "craft" | "cook") && i < economy::COUNT
            }
        })
        && (matches!(q.task.as_str(), "source" | "prepare" | "craft" | "cook")
            == q.material.is_some())
        && q.building.is_none_or(|id| {
            v.buildings
                .iter()
                .find(|b| b.id == id)
                .is_none_or(|b| match q.task.as_str() {
                    "cook" | "eat" => b.kind == "kitchen",
                    "garden" => matches!(
                        b.kind.as_str(),
                        "garden" | "greenhouse" | "orchard" | "goat_pasture" | "apiary" | "coop"
                    ),
                    "craft" => b.kind == "workshop",
                    "compost" => b.kind == "compost",
                    "rest" => b.kind == "home",
                    "socialize" => matches!(b.kind.as_str(), "square" | "kitchen"),
                    _ => true,
                })
        })
        && (!matches!(q.task.as_str(), "prepare" | "craft" | "cook")
            || q.material.is_some_and(|i| {
                if q.task == "cook" {
                    i == economy::MEALS
                } else if q.task == "craft" {
                    i == economy::TOOLS
                } else {
                    (5..=8).contains(&i)
                }
            }))
        && q.batch.is_none_or(|id| {
            matches!(q.task.as_str(), "prepare" | "craft" | "cook")
                && id.0 < v.simulation.next_id
                && production::batch(v, id).map_or(!q.active(), |b| {
                    Some(b.material) == q.material && production::matches_task(b.material, &q.task)
                })
        })
        && (!matches!(q.task.as_str(), "prepare" | "craft" | "cook")
            || !q.active()
            || q.batch.is_some())
        && (q.task != "building_work"
            || !q.active()
            || q.building.is_some_and(|id| {
                building_work::job(v, id).is_some_and(|j| j.destination == q.destination)
            }))
        && (!matches!(
            q.task.as_str(),
            "source" | "prepare" | "outside" | "water" | "gather"
        ) || q.building.is_none())
        && q.destination.is_none_or(|(x, y)| {
            q.task == "building_work"
                && (1..MAP_SIZE - 1).contains(&x)
                && (1..MAP_SIZE - 1).contains(&y)
        })
}

#[wasm_bindgen]
impl Game {
    pub fn cancel_help(&mut self, id: usize) -> String {
        let mut v = self.app.world().resource::<Village>().clone();
        let mut query = self.app.world_mut().query::<&mut Resident>();
        let Some(mut r) = query.iter_mut(self.app.world_mut()).find(|r| r.id == id) else {
            return "Resident not found.".into();
        };
        if r.help.as_ref().is_none_or(|q| !q.active()) {
            return "There is no active request to cancel.".into();
        }
        let owned = owns_activity(&r);
        if owned {
            logistics::interrupt(&mut v, &r);
            water::interrupt(&mut v, &r);
        }
        let reason = if let Some(trip) = &r.trip {
            match trip.purpose {
                mobility::Purpose::Work => {
                    "You cancelled this request. The committed outside shift will still finish."
                }
                mobility::Purpose::Pickup => {
                    "You cancelled this request. The committed town pickup continues."
                }
                mobility::Purpose::Overnight => {
                    "You cancelled this request. The overnight stay continues."
                }
            }
        } else {
            "You cancelled this request. Carried supplies remain recoverable."
        };
        finish(&mut r, &v, Phase::Cancelled, reason);
        if owned && r.trip.is_none() {
            assign(
                &mut r,
                &v,
                "rest",
                "The request was cancelled. Taking a break.",
                false,
            );
        }
        self.app.insert_resource(v);
        "ok".into()
    }
}

impl Game {
    pub(crate) fn sync_help(&mut self) {
        let v = self.app.world().resource::<Village>().clone();
        let mut query = self.app.world_mut().query::<&mut Resident>();
        for mut r in query.iter_mut(self.app.world_mut()) {
            observe(&mut r, &v);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn scene() -> Game {
        let mut g = Game::new();
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.arrived = true;
            v.minutes = 540.;
            crate::logistics::fixture_stock(&mut v, crate::economy::FOOD, (80.) as u32);
            crate::logistics::fixture_stock(&mut v, crate::economy::MEALS, 10);
            crate::water::fixture_fresh(&mut v, 40.);
        }
        let mut q = g.app.world_mut().query::<&mut Resident>();
        for mut r in q.iter_mut(g.app.world_mut()) {
            r.task = "idle".into();
            r.activity_store = None;
            r.remaining = 90.;
            r.energy = 90.;
            r.hunger = 10.;
            r.social = 90.;
            r.last_meal_slot = 0;
            r.x = CAMP.0 + (r.id as f32 - 2.) * 1.25;
            r.y = CAMP.1;
            r.target_x = r.x;
            r.target_y = r.y;
        }
        g
    }
    fn person(g: &mut Game, id: usize) -> Resident {
        g.app
            .world_mut()
            .query::<&Resident>()
            .iter(g.app.world())
            .find(|r| r.id == id)
            .unwrap()
            .clone()
    }
    fn until(g: &mut Game, mut test: impl FnMut(&mut Game) -> bool) {
        for _ in 0..12000 {
            if test(g) {
                return;
            }
            g.tick(0.25);
        }
        panic!("Request failed to make progress: {}", g.snapshot());
    }
    fn checkpoint(g: &mut Game) {
        let saved = g.snapshot();
        let mut copy = Game::new();
        assert!(copy.restore(&saved));
        assert_eq!(copy.snapshot(), saved);
        for _ in 0..4 {
            g.tick(0.25);
            copy.tick(0.25);
        }
        assert_eq!(g.snapshot(), copy.snapshot());
    }
    #[test]
    fn accepted_requests_travel_finish_once_and_deduplicate_without_allocating() {
        let mut g = scene();
        assert!(g.request(0, "gather", false).contains("Happy"));
        let initial = g.snapshot();
        let id = person(&mut g, 0).help.unwrap().id;
        assert!(g.request(0, "gather", false).contains("already accepted"));
        assert_eq!(g.snapshot(), initial);
        assert_eq!(g.app.world().resource::<Village>().food, 80.);
        g.tick(0.25);
        assert_eq!(person(&mut g, 0).help.unwrap().phase, Phase::Travelling);
        checkpoint(&mut g);
        until(&mut g, |g| {
            person(g, 0).help.as_ref().unwrap().phase == Phase::Working
        });
        checkpoint(&mut g);
        until(&mut g, |g| {
            person(g, 0).help.as_ref().unwrap().phase == Phase::Complete
        });
        assert_eq!(
            g.app.world().resource::<Village>().supplies.gathered,
            2.,
            "{}",
            serde_json::to_string(&g.app.world().resource::<Village>().workforce_peers[&0])
                .unwrap()
        );
        assert_eq!(person(&mut g, 0).help.unwrap().id, id);
        for _ in 0..80 {
            g.tick(0.25);
        }
        assert_eq!(
            g.app.world().resource::<Village>().supplies.gathered,
            2.,
            "{}",
            serde_json::to_string(&g.app.world().resource::<Village>().workforce_peers[&0])
                .unwrap()
        );
        checkpoint(&mut g);
    }
    #[test]
    fn a_rest_interruption_preserves_partial_work_and_eventually_resumes() {
        let mut g = scene();
        g.request(0, "gather", false);
        until(&mut g, |g| {
            person(g, 0).help.as_ref().unwrap().phase == Phase::Working
        });
        for _ in 0..8 {
            g.tick(0.25);
        }
        {
            let mut q = g.app.world_mut().query::<&mut Resident>();
            q.iter_mut(g.app.world_mut())
                .find(|r| r.id == 0)
                .unwrap()
                .energy = 20.;
        }
        g.tick(0.25);
        let r = person(&mut g, 0);
        let q = r.help.unwrap();
        assert_eq!(r.task, "rest");
        assert_eq!(q.phase, Phase::Paused);
        assert!(q.reason.contains("rest"));
        assert!(q.remaining > 0. && q.remaining < 10.);
        checkpoint(&mut g);
        until(&mut g, |g| {
            person(g, 0).help.as_ref().unwrap().phase == Phase::Complete
        });
        assert_eq!(
            g.app.world().resource::<Village>().supplies.gathered,
            2.,
            "{}",
            serde_json::to_string(&g.app.world().resource::<Village>().workforce_peers[&0])
                .unwrap()
        );
    }
    #[test]
    fn an_evening_help_request_can_finish_without_waiting_for_morning() {
        let mut g = scene();
        g.app.world_mut().resource_mut::<Village>().minutes = 1000.;
        assert!(g.request(0, "gather", false).contains("Happy"));
        assert_ne!(person(&mut g, 0).help.unwrap().phase, Phase::Paused);
        let id = person(&mut g, 0).help.unwrap().id;
        let mut slept = false;
        until(&mut g, |g| {
            let r = person(g, 0);
            slept |= r.task == "sleep";
            if r.requested && work(&r.task) {
                assert!(r.energy >= 28.);
            }
            assert_eq!(r.help.as_ref().unwrap().id, id);
            r.help.unwrap().phase == Phase::Complete
        });
        assert!(!slept);
        checkpoint(&mut g);
    }
    #[test]
    fn helping_a_project_includes_its_haul_and_follows_all_construction_stages() {
        let mut g = scene();
        assert_eq!(g.place("garden", 6, 6), "ok");
        assert_eq!(g.place("garden", 18, 18), "ok");
        g.app.world_mut().resource_mut::<Village>().economy.projects[1].priority = 3;
        assert!(g.request(0, "build", false).contains("Happy"));
        assert_eq!(person(&mut g, 0).help.unwrap().building, Some(1));
        let mut hauled = false;
        until(&mut g, |g| {
            let r = person(g, 0);
            let v = g.app.world().resource::<Village>();
            for h in v
                .logistics
                .as_ref()
                .unwrap()
                .shipments
                .iter()
                .filter(|h| h.resident == 0)
            {
                let store = v
                    .logistics
                    .as_ref()
                    .unwrap()
                    .stores
                    .iter()
                    .find(|p| p.id == h.to)
                    .unwrap();
                assert_eq!(store.owner, logistics::Owner::Site(1));
                hauled = true;
            }
            r.help.unwrap().phase == Phase::Complete
        });
        assert!(hauled);
        assert_eq!(
            g.app.world().resource::<Village>().buildings[1].progress,
            100.
        );
        checkpoint(&mut g);
    }
    #[test]
    fn cancellation_and_corrupt_request_references_are_atomic() {
        let mut g = scene();
        g.request(0, "gather", false);
        let saved = g.snapshot();
        let mut bad: serde_json::Value = serde_json::from_str(&saved).unwrap();
        bad["residents"][0]["help"]["id"] = serde_json::json!(1);
        assert!(!g.restore(&bad.to_string()));
        assert_eq!(g.snapshot(), saved);
        bad = serde_json::from_str(&saved).unwrap();
        bad["residents"][0]["help"]["task"] = serde_json::json!("nature_walk");
        assert!(!g.restore(&bad.to_string()));
        assert_eq!(g.snapshot(), saved);
        assert_eq!(g.cancel_help(0), "ok");
        assert_eq!(person(&mut g, 0).help.unwrap().phase, Phase::Cancelled);
        let cancelled = g.snapshot();
        assert_ne!(g.cancel_help(0), "ok");
        assert_eq!(g.snapshot(), cancelled);
        checkpoint(&mut g);
        assert!(g.request(0, "gather", false).contains("Happy"));
        assert!(person(&mut g, 0).help.unwrap().id.0 > 2);
    }
    #[test]
    fn a_busy_kitchen_queues_the_second_request_without_double_claiming_a_batch() {
        let mut g = scene();
        assert_eq!(g.place("kitchen", 8, 8), "ok");
        logistics::fixture_finish(&mut g.app.world_mut().resource_mut::<Village>(), 0);
        food::fixture_stage(&mut g.app.world_mut().resource_mut::<Village>(), 0);
        assert!(g.request(0, "cook", false).contains("Happy"));
        assert!(g.request(1, "cook", false).contains("Happy"));
        assert_eq!(person(&mut g, 1).help.unwrap().phase, Phase::Blocked);
        checkpoint(&mut g);
        until(&mut g, |g| {
            let a = person(g, 0);
            let b = person(g, 1);
            assert!(!(a.requested && a.task == "cook" && b.requested && b.task == "cook"));
            a.help.unwrap().phase == Phase::Complete && b.help.unwrap().phase == Phase::Complete
        });
        assert_eq!(g.app.world().resource::<Village>().supplies.meals_cooked, 5);
        checkpoint(&mut g);
    }
    #[test]
    fn a_batch_with_lost_inputs_reports_a_blocker_instead_of_false_completion() {
        let mut g = scene();
        assert_eq!(g.place("kitchen", 8, 8), "ok");
        logistics::fixture_finish(&mut g.app.world_mut().resource_mut::<Village>(), 0);
        food::fixture_stage(&mut g.app.world_mut().resource_mut::<Village>(), 0);
        assert!(g.request(0, "cook", false).contains("Happy"));
        crate::logistics::fixture_stock(
            &mut g.app.world_mut().resource_mut::<Village>(),
            crate::economy::FOOD,
            0,
        );
        {
            let mut query = g.app.world_mut().query::<&mut Resident>();
            for mut r in query.iter_mut(g.app.world_mut()).filter(|r| r.id != 0) {
                r.social = 50.;
            }
        }
        until(&mut g, |g| {
            let q = person(g, 0).help.unwrap();
            q.phase == Phase::Blocked && q.reason.contains("inputs")
        });
        assert_eq!(g.app.world().resource::<Village>().supplies.meals_cooked, 0);
        let blocked = person(&mut g, 0).help.unwrap();
        assert!(blocked.reason.contains("inputs"), "{}", blocked.reason);
        checkpoint(&mut g);
    }
    #[test]
    fn cancelling_a_building_request_puts_carried_supplies_down_without_losing_them() {
        let mut g = scene();
        {
            let mut q = g.app.world_mut().query::<&mut Resident>();
            for mut r in q.iter_mut(g.app.world_mut()).filter(|r| r.id != 0) {
                r.task = "rest".into();
                r.energy = 5.;
                r.remaining = 90.;
            }
        }
        assert_eq!(g.place("garden", 18, 18), "ok");
        assert!(g.request(0, "build", false).contains("Happy"));
        until(&mut g, |g| {
            g.app
                .world()
                .resource::<Village>()
                .logistics
                .as_ref()
                .unwrap()
                .shipments
                .iter()
                .any(|h| h.resident == 0 && h.carrying)
                && person(g, 0).help.as_ref().is_some_and(|q| q.active())
        });
        let before: [u32; economy::COUNT] =
            std::array::from_fn(|i| economy::quantity(g.app.world().resource::<Village>(), i));
        assert_eq!(g.cancel_help(0), "ok");
        let v = g.app.world().resource::<Village>();
        assert_eq!(before, std::array::from_fn(|i| economy::quantity(v, i)));
        assert!(
            !v.logistics
                .as_ref()
                .unwrap()
                .shipments
                .iter()
                .any(|h| h.resident == 0)
        );
        assert!(
            v.logistics
                .as_ref()
                .unwrap()
                .stores
                .iter()
                .any(|p| p.owner == logistics::Owner::Ground && p.items.iter().any(|n| *n > 0))
        );
        checkpoint(&mut g);
    }
    #[test]
    fn hungry_foragers_keep_working_when_the_last_portions_are_already_claimed() {
        let mut g = scene();
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            crate::logistics::fixture_stock(&mut v, crate::economy::FOOD, (2.) as u32);
            crate::logistics::fixture_stock(&mut v, crate::economy::MEALS, 0);
        }
        {
            let v = g.app.world().resource::<Village>().clone();
            let mut query = g.app.world_mut().query::<&mut Resident>();
            for mut r in query.iter_mut(g.app.world_mut()) {
                match r.id {
                    0 => {
                        r.task = "gather".into();
                        r.activity_store = None;
                        r.remaining = 5.;
                        r.x = 3.;
                        r.y = 11.;
                        r.hunger = 90.;
                    }
                    1 | 2 => {
                        assign(&mut r, &v, "eat", "test", false);
                        r.x = r.target_x;
                        r.y = r.target_y;
                        r.remaining = 4.;
                        r.hunger = 80.;
                    }
                    _ => {
                        r.task = "rest".into();
                        r.activity_store = None;
                        r.remaining = 90.;
                    }
                }
                r.target_x = r.x;
                r.target_y = r.y;
            }
        }
        g.tick(0.25);
        assert_eq!(
            person(&mut g, 0).task,
            "gather",
            "The forager must not chase food already claimed by two neighbours"
        );
        for _ in 0..19 {
            g.tick(0.25);
        }
        assert_eq!(
            g.app.world().resource::<Village>().supplies.gathered,
            2.,
            "{}",
            serde_json::to_string(&g.app.world().resource::<Village>().workforce_peers[&0])
                .unwrap()
        );
    }
    #[test]
    fn cancelling_a_waiting_help_request_does_not_cancel_a_committed_town_trip() {
        let mut g = scene();
        g.request(0, "gather", false);
        let mut items = [0; economy::COUNT];
        items[0] = 1;
        assert_eq!(
            g.order_supplies_pickup(&serde_json::to_string(&items).unwrap(), 0),
            "ok"
        );
        let trip = person(&mut g, 0).trip.unwrap();
        assert_eq!(g.cancel_help(0), "ok");
        let r = person(&mut g, 0);
        assert_eq!(r.task, "pickup");
        assert!(r.requested);
        assert_eq!(r.trip.unwrap().return_at, trip.return_at);
        checkpoint(&mut g);
        until(&mut g, |g| {
            g.app.world().resource::<Village>().economy.orders[0].status == "delivered"
        });
        assert_eq!(person(&mut g, 0).help.unwrap().phase, Phase::Cancelled);
    }
    #[test]
    fn supply_wait_names_missing_inputs_and_distinguishes_confirmed_orders() {
        let mut g = scene();
        assert_eq!(g.place("garden", 6, 6), "ok");
        let (material, needed) = {
            let stage = economy::recipe("garden", "standard").unwrap()[0].items;
            stage
                .iter()
                .enumerate()
                .find_map(|(i, n)| (*n > 0).then_some((i, *n)))
                .unwrap()
        };
        logistics::fixture_stock(
            &mut g.app.world_mut().resource_mut::<Village>(),
            material,
            0,
        );
        g.request(0, "build", false);
        until(&mut g, |g| {
            person(g, 0).help.as_ref().unwrap().phase == Phase::Blocked
        });
        assert!(
            person(&mut g, 0)
                .help
                .unwrap()
                .reason
                .contains(economy::NAMES[material])
        );
        let mut items = [0; economy::COUNT];
        items[material] = needed;
        assert_eq!(
            g.order_supplies(&serde_json::to_string(&items).unwrap()),
            "ok"
        );
        until(&mut g, |g| {
            person(g, 0)
                .help
                .unwrap()
                .reason
                .starts_with("Ordered supplies")
        });
        checkpoint(&mut g);
    }
    #[test]
    fn a_help_request_waits_for_a_committed_outside_shift_then_resumes() {
        let mut g = scene();
        g.app
            .world_mut()
            .resource_mut::<Village>()
            .economy
            .outside_jobs
            .insert(0, true);
        g.request(0, "gather", false);
        assert!(
            person(&mut g, 0)
                .help
                .unwrap()
                .reason
                .contains("outside shift")
        );
        g.tick(0.25);
        assert_eq!(
            person(&mut g, 0).trip.unwrap().purpose,
            mobility::Purpose::Work
        );
        g.app
            .world_mut()
            .resource_mut::<Village>()
            .economy
            .outside_jobs
            .insert(0, false);
        checkpoint(&mut g);
        until(&mut g, |g| {
            person(g, 0).help.unwrap().phase == Phase::Complete
        });
        assert_eq!(g.app.world().resource::<Village>().economy.work_day[&0], 0);
        assert!(g.app.world().resource::<Village>().minutes >= 1020.);
    }
    #[test]
    fn cancelling_an_outside_work_request_preserves_the_shift_and_once_only_pay() {
        let mut g = scene();
        g.app
            .world_mut()
            .resource_mut::<Village>()
            .economy
            .outside_jobs
            .insert(0, true);
        let funds = g.app.world().resource::<Village>().economy.money;
        assert!(g.request(0, "outside", false).contains("Happy"));
        let return_at = person(&mut g, 0).trip.unwrap().return_at;
        assert_eq!(g.cancel_help(0), "ok");
        assert_eq!(person(&mut g, 0).trip.unwrap().return_at, return_at);
        checkpoint(&mut g);
        until(&mut g, |g| {
            person(g, 0).trip.is_none()
                && g.app.world().resource::<Village>().economy.work_day[&0] == 0
        });
        assert_eq!(
            g.app.world().resource::<Village>().economy.money,
            funds + occupations::JOBS[0].income
        );
        assert_eq!(person(&mut g, 0).help.unwrap().phase, Phase::Cancelled);
    }
    #[test]
    fn outside_departures_do_not_restart_meals_or_essential_foraging_each_frame() {
        let mut g = scene();
        g.app
            .world_mut()
            .resource_mut::<Village>()
            .economy
            .outside_jobs
            .insert(0, true);
        {
            let v = g.app.world().resource::<Village>().clone();
            let mut q = g.app.world_mut().query::<&mut Resident>();
            let mut r = q.iter_mut(g.app.world_mut()).find(|r| r.id == 0).unwrap();
            assign(&mut r, &v, "eat", "test", false);
            r.x = r.target_x;
            r.y = r.target_y;
            r.remaining = 2.;
            r.hunger = 80.;
        }
        for _ in 0..8 {
            g.tick(0.25);
        }
        assert!(person(&mut g, 0).hunger < 20.);
        assert_eq!(
            g.app.world().resource::<Village>().supplies.portions_eaten,
            1
        );
        g.tick(0.25);
        assert_eq!(
            person(&mut g, 0).trip.unwrap().purpose,
            mobility::Purpose::Work
        );
        let mut hungry = scene();
        {
            let mut v = hungry.app.world_mut().resource_mut::<Village>();
            *v.economy.outside_jobs.get_mut(&0).unwrap() = true;
            crate::logistics::fixture_stock(&mut v, crate::economy::FOOD, (0.) as u32);
            crate::logistics::fixture_stock(&mut v, crate::economy::MEALS, 0);
        }
        {
            let mut q = hungry.app.world_mut().query::<&mut Resident>();
            let mut r = q
                .iter_mut(hungry.app.world_mut())
                .find(|r| r.id == 0)
                .unwrap();
            r.task = "gather".into();
            r.activity_store = None;
            r.remaining = 1.;
            r.hunger = 50.;
            r.x = 3.;
            r.y = 11.;
            r.target_x = r.x;
            r.target_y = r.y;
        }
        for _ in 0..4 {
            hungry.tick(0.25);
        }
        assert_eq!(
            hungry.app.world().resource::<Village>().supplies.gathered,
            2.
        );
    }
    #[test]
    fn cancelled_projects_and_crew_jobs_detach_requests_before_the_next_save() {
        let mut g = scene();
        assert_eq!(g.place("garden", 6, 6), "ok");
        g.request(0, "build", false);
        assert_eq!(g.cancel_project(0), "ok");
        assert_eq!(person(&mut g, 0).help.unwrap().phase, Phase::Cancelled);
        checkpoint(&mut g);
        assert_eq!(g.place("garden", 6, 6), "ok");
        logistics::fixture_finish(&mut g.app.world_mut().resource_mut::<Village>(), 1);
        assert_eq!(g.queue_building_work(1, "move", 18, 18), "ok");
        assert!(g.request(0, "building_work", false).contains("Happy"));
        assert_eq!(person(&mut g, 0).help.unwrap().destination, Some((18, 18)));
        assert_eq!(g.cancel_building_work(1), "ok");
        assert_eq!(person(&mut g, 0).help.unwrap().phase, Phase::Cancelled);
        checkpoint(&mut g);
        assert_eq!(g.queue_building_work(1, "demolish", 0, 0), "ok");
        g.request(0, "building_work", false);
        until(&mut g, |g| {
            person(g, 0).help.unwrap().phase == Phase::Complete
        });
        assert!(g.app.world().resource::<Village>().buildings.is_empty());
        checkpoint(&mut g);
    }
}
