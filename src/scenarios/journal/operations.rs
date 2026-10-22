//! Current operation uses domain readiness, owned batches and electrical rates.
use super::*;
#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Stage {
    Ready,
    Underway,
    Generating,
    Lit,
}
impl Stage {
    pub const ALL: [Self; 4] = [Self::Ready, Self::Underway, Self::Generating, Self::Lit];
    fn buildings(self) -> &'static [&'static str] {
        match self {
            Self::Ready => &["kitchen", "workshop"],
            Self::Underway => &[
                "kitchen",
                "workshop",
                "wetland",
                "biodigester",
                "banana_treatment",
            ],
            Self::Generating => &["solar_farm", "hydro"],
            Self::Lit => &["streetlight"],
        }
    }
    fn label(self) -> &'static str {
        match self {
            Self::Ready => "A supplied production batch ready for resident work",
            Self::Underway => "A production or treatment batch under way",
            Self::Generating => "Generating power now",
            Self::Lit => "Fully supplied light during darkness",
        }
    }
    fn note(self) -> &'static str {
        match self {
            Self::Ready => {
                "An unfinished local batch has its inputs, needed water and waste space, and usable tools or power. Ready to work does not mean a friend is attending or output is finished."
            }
            Self::Underway => {
                "Production must have started and be able to resume. Treatment must be advancing with owned inputs; banana beds need locally delivered sewage. Pauses and blocked output do not qualify. A friend need not be standing here."
            }
            Self::Generating => {
                "The generator must produce power at the current time. Weather, shade and equipment matter. Stored energy alone does not count; surplus may be curtailed."
            }
            Self::Lit => {
                "Needs darkness, an enabled connected light and full brightness. Daylight and disconnected lights do not qualify. Local utility rules must be enabled."
            }
        }
    }
}
pub fn valid(c: &GoalCondition) -> bool {
    matches!(c,GoalCondition::Operating {building,state,count,..} if state.buildings().contains(&building.as_str()) && (1..=256).contains(count))
}
fn rules(state: Stage, building: &str, logistics: bool, utilities: bool) -> bool {
    match state {
        Stage::Ready => logistics,
        Stage::Underway => logistics && (["kitchen", "workshop"].contains(&building) || utilities),
        Stage::Generating | Stage::Lit => utilities,
    }
}
pub fn setup_valid(c: &GoalCondition, d: &Definition) -> bool {
    match c {
        GoalCondition::Operating {
            building, state, ..
        } => rules(*state, building, d.rules.logistics, d.rules.utilities),
        GoalCondition::All { conditions } | GoalCondition::Any { conditions } => {
            conditions.iter().all(|c| setup_valid(c, d))
        }
        _ => true,
    }
}
fn open(v: &Village, b: &Building, region: &Option<String>) -> bool {
    b.progress >= 100.
        && building_work::job(v, b.id).is_none()
        && region.as_ref().is_none_or(|id| {
            v.scenario.as_ref().is_some_and(|o| {
                o.definition
                    .map
                    .regions
                    .iter()
                    .any(|r| r.id == *id && r.contains_building(b))
            })
        })
}
fn production(v: &Village, b: &Building, state: Stage) -> bool {
    v.production
        .sites
        .iter()
        .filter(|s| s.building == Some(b.id))
        .any(|s| {
            v.production.batches.iter().any(|batch| {
                batch.site == s.id
                    && production::ready(v, batch)
                    && (state == Stage::Ready || batch.committed && batch.work > 0.)
            })
        })
}
pub fn measure(c: &GoalCondition, v: &Village) -> (bool, serde_json::Value) {
    let GoalCondition::Operating {
        building,
        state,
        count,
        region,
    } = c
    else {
        unreachable!()
    };
    let buildings: Vec<_> = v
        .buildings
        .iter()
        .filter(|b| b.kind == *building && open(v, b, region))
        .collect();
    let enabled = rules(
        *state,
        building,
        sandbox::logistics(v),
        sandbox::utilities(v),
    );
    let lighting = (*state == Stage::Lit && enabled).then(|| power::supply(v));
    let value = buildings
        .iter()
        .filter(|b| {
            enabled
                && match state {
                    Stage::Ready => production(v, b, *state),
                    Stage::Underway if ["kitchen", "workshop"].contains(&building.as_str()) => {
                        production(v, b, *state)
                    }
                    Stage::Underway => processes::operating_at(v, b.id),
                    Stage::Generating => power::generator_rate(v, b.id) > 0.,
                    Stage::Lit => lighting.as_ref().is_some_and(|p| {
                        p.darkness > 0.5
                            && p.connections.iter().any(|c| {
                                c.id == b.id && c.enabled && c.connected && c.light_level >= 0.99
                            })
                    }),
                }
        })
        .count();
    let complete = value >= *count as usize;
    let action = buildings.first().map_or_else(
        || serde_json::json!({"kind":"build","building":building,"region":region}),
        |b| serde_json::json!({"kind":"operation","building":building,"id":b.id,"region":region}),
    );
    (
        complete,
        serde_json::json!({"kind":"operating","value":value,"target":count,"unit":"count","complete":complete,"description":format!("Have {count} {building} {}: {}{}",if *count==1{"building"}else{"buildings"},state.label(),region.as_ref().and_then(|id|v.scenario.as_ref()?.definition.map.regions.iter().find(|r|r.id==*id)).map_or(String::new(),|r|format!(", with the full footprint inside {}",r.title))),"action":action,"note":state.note(),"operation":state}),
    )
}
pub fn catalog() -> serde_json::Value {
    serde_json::json!({"maximum_count":256,"states":Stage::ALL.map(|s|serde_json::json!({"id":s,"name":s.label(),"buildings":s.buildings(),"note":s.note()}))})
}
#[cfg(test)]
mod tests;
