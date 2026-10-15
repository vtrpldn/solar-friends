//! Read-only infrastructure plans. Routes are proposals, never live connections.
use crate::*;
use std::collections::VecDeque;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    Fresh,
    Irrigation,
    Greywater,
    Sewage,
    Electricity,
}
impl Kind {
    pub(crate) fn parse(key: &str) -> Option<Self> {
        match key {
            "fresh" => Some(Self::Fresh),
            "irrigation" => Some(Self::Irrigation),
            "greywater" => Some(Self::Greywater),
            "sewage" => Some(Self::Sewage),
            "electricity" => Some(Self::Electricity),
            _ => None,
        }
    }
    fn supplies(self, kind: &str) -> bool {
        match self {
            Self::Fresh => matches!(kind, "camp" | "well"),
            Self::Irrigation => kind == "wetland",
            Self::Greywater => matches!(kind, "home" | "kitchen" | "eco_toilet"),
            Self::Sewage => kind == "eco_toilet",
            Self::Electricity => matches!(kind, "solar_farm" | "hydro"),
        }
    }
    fn receives(self, kind: &str) -> bool {
        match self {
            Self::Fresh => matches!(
                kind,
                "home" | "kitchen" | "garden" | "greenhouse" | "eco_toilet" | "coop" | "workshop"
            ),
            Self::Irrigation => matches!(kind, "garden" | "greenhouse"),
            Self::Greywater => kind == "wetland",
            Self::Sewage => matches!(kind, "banana_treatment" | "biodigester"),
            Self::Electricity => power::load(kind) > 0.,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Port {
    /// Exact footprint edge, on the same half-tile lattice as foundations.
    pub edge: [f32; 2],
    /// The clear corridor cell immediately outside that edge.
    pub cell: [i32; 2],
    /// A river generator's integral cable reaches the safe bank before joining
    /// ordinary corridors. This exception never makes river cells routable.
    pub bank_lead: bool,
}
#[derive(Clone, Debug, Serialize)]
pub struct Endpoint {
    /// -1 is camp; -2-index identifies a persistent material plot; non-negative
    /// identities are saved building IDs. Preview identities allocate no state.
    pub id: i32,
    pub kind: String,
    pub x: i32,
    pub y: i32,
    pub size: i32,
    pub supply: bool,
    pub receive: bool,
    pub ready: bool,
    pub ports: Vec<Port>,
}
fn inside(n: i32, x: i32, y: i32, a: i32, b: i32) -> bool {
    (x - n / 2..x - n / 2 + n).contains(&a) && (y - n / 2..y - n / 2 + n).contains(&b)
}
pub(crate) fn clear(v: &Village, x: i32, y: i32) -> bool {
    !river_bank(x, y) && unoccupied(v, x, y)
}
fn unoccupied(v: &Village, x: i32, y: i32) -> bool {
    (1..MAP_SIZE - 1).contains(&x)
        && (1..MAP_SIZE - 1).contains(&y)
        && !v.buildings.iter().any(|b| interactions::occupies(b, x, y))
        && !v
            .economy
            .sources
            .iter()
            .any(|s| s.active && inside(resource_sites::size(s.material), s.x, s.y, x, y))
        && !inside(1, CAMP.0 as i32, CAMP.1 as i32, x, y)
        && !building_work::reserved(v, x, y, None)
        && !restoration::reserved(v, x, y)
}
pub(crate) fn ports(v: &Village, n: i32, x: i32, y: i32) -> Vec<Port> {
    let left = x - n / 2;
    let back = y - n / 2;
    let mut result = vec![];
    for offset in 0..n {
        for (cell, edge) in [
            (
                [left + offset, back - 1],
                [left as f32 + offset as f32, back as f32 - 0.5],
            ),
            (
                [left - 1, back + offset],
                [left as f32 - 0.5, back as f32 + offset as f32],
            ),
            (
                [left + offset, back + n],
                [left as f32 + offset as f32, (back + n) as f32 - 0.5],
            ),
            (
                [left + n, back + offset],
                [(left + n) as f32 - 0.5, back as f32 + offset as f32],
            ),
        ] {
            if clear(v, cell[0], cell[1]) {
                result.push(Port {
                    edge,
                    cell,
                    bank_lead: false,
                });
            }
        }
    }
    result
}
fn hydro_ports(v: &Village, b: &Building) -> Vec<Port> {
    for offset in 1..=4 {
        let x = b.x - offset;
        if !unoccupied(v, x, b.y) {
            break;
        }
        if clear(v, x, b.y) {
            return vec![Port {
                edge: [b.x as f32 - 0.5, b.y as f32],
                cell: [x, b.y],
                bank_lead: true,
            }];
        }
    }
    vec![]
}
pub fn endpoints(v: &Village, kind: Kind) -> Vec<Endpoint> {
    let mut result = vec![];
    if kind == Kind::Fresh {
        result.push(Endpoint {
            id: -1,
            kind: "camp".into(),
            x: CAMP.0 as i32,
            y: CAMP.1 as i32,
            size: 1,
            supply: true,
            receive: false,
            ready: true,
            ports: ports(v, 1, CAMP.0 as i32, CAMP.1 as i32),
        });
    }
    result.extend(v.buildings.iter().filter_map(|b| {
        let supply = kind.supplies(&b.kind);
        let receive = kind.receives(&b.kind);
        if !supply && !receive {
            return None;
        }
        Some(Endpoint {
            id: i32::try_from(b.id).ok()?,
            kind: b.kind.clone(),
            x: b.x,
            y: b.y,
            size: interactions::footprint_size(&b.kind),
            supply,
            receive,
            ready: b.progress >= 100. && building_work::job(v, b.id).is_none(),
            ports: if b.kind == "hydro" {
                hydro_ports(v, b)
            } else {
                ports(v, interactions::footprint_size(&b.kind), b.x, b.y)
            },
        })
    }));
    if matches!(kind, Kind::Fresh | Kind::Irrigation) {
        result.extend(v.economy.sources.iter().enumerate().filter_map(|(i, s)| {
            if !s.active || s.material >= 2 {
                return None;
            }
            Some(Endpoint {
                id: i32::try_from(i).ok()?.checked_add(2)?.checked_neg()?,
                kind: if s.material == 0 {
                    "source_timber"
                } else {
                    "source_bamboo"
                }
                .into(),
                x: s.x,
                y: s.y,
                size: resource_sites::size(s.material),
                supply: false,
                receive: true,
                ready: true,
                ports: ports(v, resource_sites::size(s.material), s.x, s.y),
            })
        }));
    }
    result
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Plan {
    pub kind: Kind,
    pub from: i32,
    pub to: i32,
    pub start: Port,
    pub end: Port,
    pub cells: Vec<[i32; 2]>,
    pub road_cells: usize,
}
/// Breadth-first search over all compatible ports finds the fewest corridor
/// cells. Fixed iteration order keeps ties deterministic, without consuming RNG.
pub fn plan(v: &Village, kind: Kind, from: i32, to: i32) -> Result<Plan, &'static str> {
    if from == to {
        return Err("Choose two different buildings.");
    }
    let endpoints = endpoints(v, kind);
    let a = endpoints
        .iter()
        .find(|e| e.id == from && e.supply)
        .ok_or("Choose a compatible supply or waste outlet.")?;
    let b = endpoints
        .iter()
        .find(|e| e.id == to && e.receive)
        .ok_or("Choose a compatible destination; water classes cannot be mixed.")?;
    if !a.ready || !b.ready {
        return Err("Finish building work before planning a connection.");
    }
    if a.ports.is_empty() || b.ports.is_empty() {
        return Err("Leave at least one footprint edge accessible at each end.");
    }
    let index = |p: [i32; 2]| (p[1] * MAP_SIZE + p[0]) as usize;
    let mut previous = vec![None; (MAP_SIZE * MAP_SIZE) as usize];
    let mut queue = VecDeque::new();
    for p in &a.ports {
        if previous[index(p.cell)].is_none() {
            previous[index(p.cell)] = Some(p.cell);
            queue.push_back(p.cell);
        }
    }
    while let Some(p) = queue.pop_front() {
        if let Some(end) = b.ports.iter().find(|port| port.cell == p) {
            let mut cells = vec![p];
            let mut cursor = p;
            while let Some(parent) = previous[index(cursor)] {
                if parent == cursor {
                    break;
                }
                cells.push(parent);
                cursor = parent;
            }
            cells.reverse();
            let start = a
                .ports
                .iter()
                .find(|port| port.cell == cells[0])
                .unwrap()
                .clone();
            return Ok(Plan {
                kind,
                from,
                to,
                start,
                end: end.clone(),
                road_cells: cells
                    .iter()
                    .filter(|p| v.roads.contains(&(p[0], p[1])))
                    .count(),
                cells,
            });
        }
        for next in [
            [p[0], p[1] - 1],
            [p[0] - 1, p[1]],
            [p[0], p[1] + 1],
            [p[0] + 1, p[1]],
        ] {
            if clear(v, next[0], next[1]) && previous[index(next)].is_none() {
                previous[index(next)] = Some(p);
                queue.push_back(next);
            }
        }
    }
    Err("No clear corridor connects these footprint edges. Leave room between plots and the river.")
}
#[wasm_bindgen]
impl Game {
    pub fn utility_endpoints(&self, kind: &str) -> String {
        let Some(kind) = Kind::parse(kind) else {
            return serde_json::json!({"error":"Unknown utility class.","endpoints":[]})
                .to_string();
        };
        let v = self.app.world().resource::<Village>();
        let corridors: Vec<_> = (1..MAP_SIZE - 1)
            .flat_map(|y| (1..MAP_SIZE - 1).map(move |x| [x, y]))
            .filter(|p| clear(v, p[0], p[1]))
            .collect();
        serde_json::json!({"kind":kind,"endpoints":endpoints(v,kind),"corridors":corridors,"roads":v.roads,"preview_only":true})
            .to_string()
    }
    pub fn utility_preview(&self, kind: &str, from: i32, to: i32) -> String {
        let result = Kind::parse(kind)
            .ok_or("Unknown utility class.")
            .and_then(|kind| plan(self.app.world().resource::<Village>(), kind, from, to));
        match result {
            Ok(plan) => {
                serde_json::json!({"allowed":true,"plan":plan,"preview_only":true}).to_string()
            }
            Err(reason) => {
                serde_json::json!({"allowed":false,"reason":reason,"preview_only":true}).to_string()
            }
        }
    }
}

#[cfg(test)]
mod tests;
