//! Stable authored routes compiled through the ordinary physical port planner.
use super::*;
use simulation::Id;
use utilities::Kind;

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(
    tag = "kind",
    content = "id",
    rename_all = "snake_case",
    deny_unknown_fields
)]
pub enum Endpoint {
    Camp,
    Building(String),
    Site(String),
    Battery(String),
    Pump(String),
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Route {
    pub id: String,
    pub kind: Kind,
    pub from: Endpoint,
    pub to: Endpoint,
    pub state: BuildingState,
    pub cells: Vec<[i32; 2]>,
}
fn endpoint_exists(d: &Definition, e: &Endpoint, kind: Kind) -> bool {
    match e {
        Endpoint::Camp => kind != Kind::Electricity,
        Endpoint::Building(id) => d.start.buildings.iter().any(|b| b.id == *id),
        Endpoint::Site(id) => {
            kind != Kind::Electricity && d.start.resource_sites.iter().any(|b| b.id == *id)
        }
        Endpoint::Battery(id) => {
            kind == Kind::Electricity && d.start.batteries.iter().any(|b| b.id == *id)
        }
        Endpoint::Pump(id) => {
            kind == Kind::Electricity
                && d.start
                    .routes
                    .iter()
                    .any(|r| r.id == *id && r.kind != Kind::Electricity)
        }
    }
}
pub fn check(d: &Definition, r: &mut Report) {
    if d.start.routes.len() > 64 {
        r.push(
            "start.routes",
            "route_limit",
            "Use at most 64 starting utility routes.",
        );
    }
    let mut ids = HashSet::new();
    for (i, p) in d.start.routes.iter().enumerate().take(65) {
        let mut seen = HashSet::new();
        if !valid_key(&p.id)
            || !ids.insert(&p.id)
            || p.from == p.to
            || !endpoint_exists(d, &p.from, p.kind)
            || !endpoint_exists(d, &p.to, p.kind)
            || p.cells.is_empty()
            || p.cells.len() > 3844
            || p.cells
                .iter()
                .any(|c| !c.iter().all(|n| (1..MAP_SIZE - 1).contains(n)) || !seen.insert(*c))
            || p.cells
                .windows(2)
                .any(|w| (w[0][0] - w[1][0]).abs() + (w[0][1] - w[1][1]).abs() != 1)
        {
            r.push(&format!("start.routes.{i}"),"invalid_route","Give each route a unique identity, two compatible existing endpoints and a continuous, non-repeating inland corridor.");
            let issue = r.issues.last_mut().unwrap();
            issue.entity = Some(p.id.clone());
            issue.at = p.cells.first().copied();
        }
    }
}
pub fn owns(v: &Village, id: Id) -> bool {
    v.scenario.as_ref().is_some_and(|o| {
        o.definition
            .start
            .routes
            .iter()
            .any(|r| r.state == BuildingState::Completed && o.routes.get(&r.id) == Some(&id))
    })
}
fn resolve(v: &Village, e: &Endpoint, kind: Kind) -> Option<i64> {
    let o = v.scenario.as_ref()?;
    let electric = kind == Kind::Electricity;
    let owner = match e {
        Endpoint::Camp => return (!electric).then_some(-1),
        Endpoint::Building(key) => {
            let id = *o.buildings.get(key)?;
            if !electric {
                return i64::try_from(id).ok();
            }
            electricity::Owner::Building(id)
        }
        Endpoint::Site(_) | Endpoint::Battery(_) | Endpoint::Pump(_)
            if !endpoint_exists(&o.definition, e, kind) =>
        {
            return None;
        }
        Endpoint::Site(key) => {
            return o
                .definition
                .start
                .resource_sites
                .iter()
                .position(|s| s.id == *key)
                .and_then(|i| i64::try_from(i).ok()?.checked_add(2)?.checked_neg());
        }
        Endpoint::Battery(key) => return o.batteries.get(key).map(|id| i64::from(id.0)),
        Endpoint::Pump(key) => electricity::Owner::Pump(*o.routes.get(key)?),
    };
    v.power
        .network
        .nodes
        .iter()
        .find(|n| n.owner == owner)
        .map(|n| i64::from(n.id.0))
}
fn proposed(v: &Village, r: &Route) -> Result<(utilities::Plan, [pipes::Anchor; 2]), &'static str> {
    let from =
        resolve(v, &r.from, r.kind).ok_or("The supply endpoint is unavailable or unfinished.")?;
    let to = resolve(v, &r.to, r.kind)
        .ok_or("The destination endpoint is unavailable or unfinished.")?;
    let (mut plan, anchors) = pipes::propose(v, r.kind, from, to)?;
    let endpoints = utilities::endpoints(v, r.kind);
    let start = endpoints
        .iter()
        .find(|e| e.id == from)
        .and_then(|e| e.ports.iter().find(|p| Some(&p.cell) == r.cells.first()))
        .ok_or("Start the route at a clear supply port.")?;
    let end = endpoints
        .iter()
        .find(|e| e.id == to)
        .and_then(|e| e.ports.iter().find(|p| Some(&p.cell) == r.cells.last()))
        .ok_or("Finish the route at a compatible clear receiving port.")?;
    if r.cells.iter().any(|c| !utilities::clear(v, c[0], c[1])) {
        return Err("Keep every route cell clear of buildings, banks, plots and the arrival camp.");
    }
    plan.start = start.clone();
    plan.end = end.clone();
    plan.cells = r.cells.clone();
    plan.road_cells = r
        .cells
        .iter()
        .filter(|c| v.roads.contains(&(c[0], c[1])))
        .count();
    Ok((plan, anchors))
}
pub fn install(v: &mut Village) -> Result<(), Report> {
    let Some(origin) = v.scenario.clone() else {
        return Ok(());
    };
    if origin.definition.start.routes.is_empty() {
        return Ok(());
    }
    // Liquid lines create their real pump ports before cables resolve them.
    for electrical in [false, true] {
        for (i, r) in origin
            .definition
            .start
            .routes
            .iter()
            .enumerate()
            .filter(|(_, r)| (r.kind == Kind::Electricity) == electrical)
        {
            let result = proposed(v, r)
                .and_then(|(plan, anchors)| pipes::queue_plan(v, plan, anchors, None, false));
            let id = match result {
                Ok(id) => id,
                Err(reason) => {
                    let mut report =
                        Report::error(&format!("start.routes.{i}"), "route_location", reason);
                    report.issues[0].entity = Some(r.id.clone());
                    report.issues[0].at = r.cells.first().copied();
                    return Err(report);
                }
            };
            std::sync::Arc::make_mut(v.scenario.as_mut().unwrap())
                .routes
                .insert(r.id.clone(), id);
            if r.state == BuildingState::Completed {
                let p = v.pipes.lines.iter_mut().find(|p| p.id == id).unwrap();
                p.phase = pipes::Phase::Active;
                p.work = p.labour();
            }
            power::sync(v);
        }
    }
    economy::rebalance(v);
    maintenance::sync(v);
    Ok(())
}
fn authored_anchor(o: &Origin, e: &Endpoint, kind: Kind, a: &pipes::Anchor, endpoint: i64) -> bool {
    let electric = kind == Kind::Electricity;
    match e {
        Endpoint::Camp => {
            !electric
                && endpoint == -1
                && a.kind == "camp"
                && [a.x, a.y] == o.definition.map.camp
                && a.size == 1
        }
        Endpoint::Building(key) => o
            .definition
            .start
            .buildings
            .iter()
            .find(|b| b.id == *key)
            .is_some_and(|b| {
                a.kind == b.kind
                    && [a.x, a.y] == [b.x, b.y]
                    && a.size == interactions::footprint_size(&b.kind)
                    && (electric
                        || o.buildings
                            .get(key)
                            .is_some_and(|id| i64::try_from(*id).ok() == Some(endpoint)))
            }),
        Endpoint::Site(key) => {
            !electric
                && o.definition
                    .start
                    .resource_sites
                    .iter()
                    .enumerate()
                    .find(|(_, s)| s.id == *key)
                    .is_some_and(|(i, s)| {
                        [a.x, a.y] == [s.x, s.y]
                            && a.kind == format!("source_{}", s.material)
                            && endpoint == -(i as i64) - 2
                    })
        }
        Endpoint::Battery(key) => {
            electric
                && o.definition
                    .start
                    .batteries
                    .iter()
                    .find(|b| b.id == *key)
                    .is_some_and(|b| {
                        a.kind == "battery"
                            && [a.x, a.y] == [b.x, b.y]
                            && a.size == 1
                            && o.batteries
                                .get(key)
                                .is_some_and(|id| i64::from(id.0) == endpoint)
                    })
        }
        Endpoint::Pump(key) => {
            electric
                && o.definition
                    .start
                    .routes
                    .iter()
                    .find(|r| r.id == *key && r.kind != Kind::Electricity)
                    .is_some_and(|r| {
                        a.kind == "pump" && Some(&[a.x, a.y]) == r.cells.first() && a.size == 1
                    })
        }
    }
}
pub fn valid_opening(v: &Village) -> bool {
    let Some(o) = &v.scenario else { return true };
    let mut ids = HashSet::new();
    o.routes.len() == o.definition.start.routes.len()
        && o.definition.start.routes.iter().all(|r| {
            o.routes.get(&r.id).is_some_and(|id| {
                id.0 > 0
                    && id.0 < v.simulation.next_id
                    && ids.insert(*id)
                    && pipes::line(v, *id).is_some_and(|p| {
                        p.created == o.definition.start.minutes
                            && authored_anchor(o, &r.from, r.kind, &p.anchors[0], p.plan.from)
                            && authored_anchor(o, &r.to, r.kind, &p.anchors[1], p.plan.to)
                            && p.plan.kind == r.kind
                            && p.plan.cells == r.cells
                            && (r.state != BuildingState::Completed
                                || p.spent.is_none()
                                    && p.phase != pipes::Phase::AwaitingInputs
                                    && p.phase != pipes::Phase::Installing)
                    })
            })
        })
}

fn references(v: &Village, kind: Kind) -> Vec<(Endpoint, i64)> {
    let Some(o) = &v.scenario else { return vec![] };
    std::iter::once(Endpoint::Camp)
        .chain(
            o.definition
                .start
                .buildings
                .iter()
                .map(|b| Endpoint::Building(b.id.clone())),
        )
        .chain(
            o.definition
                .start
                .resource_sites
                .iter()
                .map(|s| Endpoint::Site(s.id.clone())),
        )
        .chain(
            o.definition
                .start
                .batteries
                .iter()
                .map(|b| Endpoint::Battery(b.id.clone())),
        )
        .chain(
            o.definition
                .start
                .routes
                .iter()
                .filter(|r| r.kind != Kind::Electricity)
                .map(|r| Endpoint::Pump(r.id.clone())),
        )
        .filter_map(|e| resolve(v, &e, kind).map(|id| (e, id)))
        .collect()
}
fn candidate(raw: &str, kind: &str) -> Result<(Game, Kind), String> {
    let kind = Kind::parse(kind).ok_or("Choose a supported water or electrical class.")?;
    let (g, _) = parse(raw).and_then(compile).map_err(|r| {
        r.issues.first().map_or(
            "Repair this creation before planning utilities.".into(),
            |i| i.message.clone(),
        )
    })?;
    Ok((g, kind))
}
#[wasm_bindgen]
impl Game {
    pub fn scenario_utility_endpoints(&self, raw: &str, kind: &str) -> String {
        let result=candidate(raw,kind).map(|(g,kind)|{
            let v=g.app.world().resource::<Village>();let refs=references(v,kind);
            let endpoints:Vec<_>=utilities::endpoints(v,kind).into_iter().filter_map(|e|{
                let (reference,_)=refs.iter().find(|(_,id)|*id==e.id)?;
                Some(serde_json::json!({"reference":reference,"kind":e.kind,"x":e.x,"y":e.y,"size":e.size,"supply":e.supply,"receive":e.receive,"ready":e.ready,"ports":e.ports}))
            }).collect();
            serde_json::json!({"allowed":true,"endpoints":endpoints,"preview_only":true})
        });
        result
            .unwrap_or_else(
                |reason| serde_json::json!({"allowed":false,"reason":reason,"preview_only":true}),
            )
            .to_string()
    }
    pub fn scenario_route_preview(&self, raw: &str, kind: &str, from: &str, to: &str) -> String {
        let result=candidate(raw,kind).and_then(|(g,kind)|{
            let v=g.app.world().resource::<Village>();
            let from:Endpoint=serde_json::from_str(from).map_err(|_|"Choose a valid supply endpoint.")?;
            let to:Endpoint=serde_json::from_str(to).map_err(|_|"Choose a valid destination endpoint.")?;
            let a=resolve(v,&from,kind).ok_or("This supply endpoint is unavailable.")?;
            let b=resolve(v,&to,kind).ok_or("This destination endpoint is unavailable.")?;
            if v.pipes.lines.iter().any(|p|p.live() && p.plan.kind==kind && ((p.plan.from==a && p.plan.to==b)||(kind==Kind::Electricity && p.plan.from==b && p.plan.to==a))) {return Err("These endpoints are already connected or planned.".into());}
            let (plan,_)=pipes::propose(v,kind,a,b).map_err(str::to_owned)?;
            let kit:BTreeMap<_,_>=economy::NAMES.iter().zip(pipes::kit(&plan)).filter(|(_,n)|*n>0).map(|(key,n)|(*key,n)).collect();
            Ok(serde_json::json!({"allowed":true,"cells":plan.cells,"start":plan.start,"end":plan.end,"kit":kit,"preview_only":true}))
        });
        result
            .unwrap_or_else(
                |reason| serde_json::json!({"allowed":false,"reason":reason,"preview_only":true}),
            )
            .to_string()
    }
}
#[cfg(test)]
mod tests;
