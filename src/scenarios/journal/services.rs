//! Native available services, sampled on a declared cadence with conserved stocks.
use super::*;
pub const CADENCE: f32 = 15.;
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    Food,
    FreshWater,
    HousedResidents,
    Toilets,
    NightLights,
}
impl Kind {
    fn name(self) -> &'static str {
        match self {
            Self::Food => "Accessible edible portions",
            Self::FreshWater => "Accessible fresh-water units",
            Self::HousedResidents => "Residents with reachable assigned homes",
            Self::Toilets => "Usable reachable ecological toilets",
            Self::NightLights => "Fully illuminated streetlights after dark",
        }
    }
    fn unit(self) -> &'static str {
        match self {
            Self::FreshWater => "water_units",
            Self::Food => "portions",
            Self::HousedResidents => "residents",
            _ => "count",
        }
    }
    fn maximum(self) -> f64 {
        match self {
            Self::Food => 1_000_000.,
            Self::FreshWater => 150_000.,
            Self::HousedResidents => residents::MAX_RESIDENTS as f64,
            _ => 256.,
        }
    }
    fn cadence(self) -> f32 {
        if self == Self::NightLights {
            0.
        } else {
            CADENCE
        }
    }
    fn note(self) -> &'static str {
        match self {
            Self::Food => {
                "Counts unclaimed edible portions in open stores that remain fresh until an actual meal approach. Carried cargo, incoming orders, cooking inputs and eggs requiring cooking do not count. Every friend currently on the property must have a meal route; when all are away, access is checked from the arrival clearing."
            }
            Self::FreshWater => {
                "Counts unreserved fresh water in open owned containers reachable by friends on the property, with access for everyone present. When all are away, access is checked from the arrival clearing. Irrigation, sealed processing contents, carried water, incoming loads and the neighbour's service are excluded."
            }
            Self::HousedResidents => {
                "Counts friends whose actual assigned completed home has a reachable approach. Homes closing for resident building work do not qualify. Friends away from the village are checked from the arrival clearing for their return. A shed is shade and rain cover, not a sleeping bed."
            }
            Self::Toilets => {
                "Counts completed open ecological toilets with local fresh handwashing water, greywater space, sewage room and a reachable approach. Every friend on the property must reach at least one usable toilet; when all are away, access is checked from the arrival clearing."
            }
            Self::NightLights => {
                "Counts enabled, connected streetlights at full native illumination while darkness exceeds 0.5. A lapse, disabled light, drained circuit or daylight breaks the period. Merely owning solar panels, batteries or disconnected lamps does not count."
            }
        }
    }
}
#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Reading {
    pub value: f64,
    pub accessible: bool,
}
impl Reading {
    fn qualifies(self, minimum: f64) -> bool {
        self.accessible && self.value >= minimum
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Watch {
    pub last: f32,
    pub since: Option<f32>,
    pub reading: Option<Reading>,
    pub layout: u32,
}
fn conditions<'a>(list: &[&'a GoalCondition]) -> BTreeMap<String, &'a GoalCondition> {
    observation::conditions(list, |c| matches!(c, GoalCondition::Service { .. }))
}
pub fn watches(list: &[&GoalCondition], now: f32) -> BTreeMap<String, Watch> {
    conditions(list)
        .into_keys()
        .map(|key| {
            (
                key,
                Watch {
                    last: now,
                    since: None,
                    reading: None,
                    layout: 0,
                },
            )
        })
        .collect()
}
pub fn valid_condition(c: &GoalCondition) -> bool {
    let GoalCondition::Service {
        service,
        minimum,
        minutes,
    } = c
    else {
        return false;
    };
    minimum.is_finite()
        && *minimum
            >= if *service == Kind::FreshWater {
                0.1
            } else {
                1.
            }
        && *minimum <= service.maximum()
        && (*service == Kind::FreshWater || minimum.fract() == 0.)
        && (15..=wellbeing::MAX_MINUTES).contains(minutes)
        && minutes.is_multiple_of(15)
}
pub fn setup_valid(c: &GoalCondition, d: &Definition) -> bool {
    match c {
        GoalCondition::Service {
            service, minimum, ..
        } => match service {
            Kind::Food => d.rules.logistics,
            Kind::HousedResidents => {
                *minimum <= d.start.residents.as_ref().map_or(5, Vec::len) as f64
            }
            _ => d.rules.utilities,
        },
        GoalCondition::All { conditions } | GoalCondition::Any { conditions } => {
            conditions.iter().all(|c| setup_valid(c, d))
        }
        _ => true,
    }
}
fn open(v: &Village, b: &Building) -> bool {
    b.progress >= 100. && building_work::job(v, b.id).is_none()
}
fn reach(v: &Village, p: &Resident, target: Option<[f32; 2]>) -> bool {
    target.is_some_and(|target| navigation::work_route(v, [p.x, p.y], target).is_ok())
}
fn housing(v: &Village, people: &[Resident], routes: bool) -> f64 {
    people
        .iter()
        .filter(|p| {
            shelter(v, p.id).is_some_and(|b| {
                open(v, b)
                    && (!routes || {
                        let mut visitor = (*p).clone();
                        if p.trip.is_some() {
                            (visitor.x, visitor.y) = camp(v);
                        }
                        reach(
                            v,
                            &visitor,
                            spacing::approach(v, b, p.id).map(|p| [p.0, p.1]),
                        )
                    })
            })
        })
        .count() as f64
}
pub(super) struct Frame<'a> {
    people: &'a [Resident],
    readings: BTreeMap<Kind, Reading>,
    upper: BTreeMap<Kind, f64>,
    signature: Option<u32>,
}
impl<'a> Frame<'a> {
    pub(super) fn new(_v: &Village, people: &'a [Resident]) -> Self {
        Self {
            people,
            readings: BTreeMap::new(),
            upper: BTreeMap::new(),
            signature: None,
        }
    }
    fn signature(&mut self, v: &Village) -> u32 {
        *self.signature.get_or_insert_with(|| {
            let mut h = logistics::layout(v);
            let mut mix = |n: u32| h = (h ^ n).wrapping_mul(16777619);
            mix(v.camp.0.to_bits());
            mix(v.camp.1.to_bits());
            for b in &v.buildings {
                mix(u32::from(b.progress >= 100.));
                mix(u32::from(building_work::job(v, b.id).is_some()));
            }
            for &id in v.skills.people.keys() {
                mix(id as u32);
                mix(u32::from(
                    self.people.iter().any(|p| p.id == id && p.trip.is_none()),
                ));
            }
            h
        })
    }
    fn upper(&mut self, kind: Kind, v: &Village) -> f64 {
        *self.upper.entry(kind).or_insert_with(|| match kind {
            Kind::Food => v.logistics.as_ref().map_or(0., |s| {
                s.stores
                    .iter()
                    .map(|p| {
                        food::EDIBLE
                            .into_iter()
                            .map(|m| f64::from(food::available(v, p, m, None)))
                            .sum::<f64>()
                    })
                    .sum()
            }),
            Kind::FreshWater => v
                .water_supply
                .tanks
                .iter()
                .filter(|p| p.owner != water::Owner::Service && water::open(v, p))
                .map(|p| water::free(v, p, water::Class::Fresh, None))
                .sum(),
            Kind::HousedResidents => housing(v, self.people, false),
            Kind::Toilets => v
                .buildings
                .iter()
                .filter(|b| {
                    b.kind == "eco_toilet" && open(v, b) && sanitation::usable_toilet(v, b.id)
                })
                .count() as f64,
            Kind::NightLights => {
                if power::darkness(v.minutes) > 0.5 {
                    v.buildings
                        .iter()
                        .filter(|b| {
                            b.kind == "streetlight"
                                && open(v, b)
                                && !v.power.disabled.contains(&b.id)
                        })
                        .count() as f64
                } else {
                    0.
                }
            }
        })
    }
    fn reading(&mut self, kind: Kind, v: &Village) -> Reading {
        if let Some(r) = self.readings.get(&kind) {
            return *r;
        }
        let r = match kind {
            Kind::Food => {
                let (value, accessible) = food::observed_access(v, self.people);
                Reading {
                    value: f64::from(value),
                    accessible,
                }
            }
            Kind::HousedResidents => Reading {
                value: housing(v, self.people, true),
                accessible: !self.people.is_empty(),
            },
            Kind::NightLights => {
                let p = power::supply(v);
                let accessible = p.darkness > 0.5;
                let value = if accessible {
                    v.buildings
                        .iter()
                        .filter(|b| {
                            b.kind == "streetlight"
                                && p.connections.iter().any(|c| {
                                    c.id == b.id
                                        && c.enabled
                                        && c.connected
                                        && c.light_level >= 0.99
                                })
                        })
                        .count() as f64
                } else {
                    0.
                };
                Reading { value, accessible }
            }
            Kind::FreshWater | Kind::Toilets => {
                let participants = food::service_participants(v, self.people);
                let mut access = vec![false; participants.len()];
                let mut value = 0.;
                if kind == Kind::FreshWater {
                    for tank in v.water_supply.tanks.iter().filter(|p| {
                        p.owner != water::Owner::Service
                            && water::open(v, p)
                            && water::free(v, p, water::Class::Fresh, None) > 0.
                    }) {
                        let mut reached = false;
                        for (i, p) in participants.iter().enumerate() {
                            if reach(v, p, water::approach(v, tank, p.id)) {
                                access[i] = true;
                                reached = true;
                            }
                        }
                        if reached {
                            value += water::free(v, tank, water::Class::Fresh, None);
                        }
                    }
                } else {
                    for b in v.buildings.iter().filter(|b| {
                        b.kind == "eco_toilet" && open(v, b) && sanitation::usable_toilet(v, b.id)
                    }) {
                        let mut reached = false;
                        for (i, p) in participants.iter().enumerate() {
                            if reach(v, p, spacing::approach(v, b, p.id).map(|p| [p.0, p.1])) {
                                access[i] = true;
                                reached = true;
                            }
                        }
                        if reached {
                            value += 1.;
                        }
                    }
                }
                Reading {
                    value,
                    accessible: !participants.is_empty() && access.into_iter().all(|b| b),
                }
            }
        };
        self.readings.insert(kind, r);
        r
    }
}
pub(super) fn sample(
    record: &mut GoalState,
    list: &[&GoalCondition],
    v: &Village,
    frame: &mut Frame<'_>,
) {
    if record.services.is_empty() {
        return;
    }
    for (key, c) in conditions(list) {
        let GoalCondition::Service {
            service, minimum, ..
        } = c
        else {
            unreachable!()
        };
        let w = record.services.get_mut(&key).unwrap();
        let layout = frame.signature(v);
        let qualified = w.reading.is_some_and(|r| r.qualifies(*minimum));
        let due = w.reading.is_none()
            || v.minutes - w.last >= service.cadence()
            || w.layout != layout
            || qualified && frame.upper(*service, v) < *minimum;
        if !due {
            continue;
        }
        let reading = frame.reading(*service, v);
        w.since = observation::since(
            w.last,
            w.since,
            qualified,
            reading.qualifies(*minimum),
            v.minutes,
            service.cadence() + MINUTES_PER_SECOND * 0.25,
        );
        w.last = v.minutes;
        w.reading = Some(reading);
        w.layout = layout;
    }
}
pub fn valid_watch(record: &GoalState, list: &[&GoalCondition], v: &Village) -> bool {
    let expected = conditions(list);
    if expected.len() != record.services.len() {
        return false;
    }
    let Some(start) = record.activated_at else {
        return expected.is_empty();
    };
    let end = record.completed_at.unwrap_or(v.minutes);
    expected.iter().all(|(key, c)| {
        record.services.get(key).is_some_and(|w| {
            let GoalCondition::Service {
                service, minimum, ..
            } = c
            else {
                return false;
            };
            match w.reading {
                None => w.since.is_none() && w.last == start && w.layout == 0,
                Some(r) => {
                    r.value.is_finite()
                        && (0.0..=1_000_000_000.).contains(&r.value)
                        && (*service == Kind::FreshWater || r.value.fract() == 0.)
                        && observation::valid_period(
                            w.last,
                            w.since,
                            r.qualifies(*minimum),
                            start,
                            end,
                        )
                }
            }
        })
    })
}
fn current_valid(
    record: &GoalState,
    list: &[&GoalCondition],
    end: Option<f32>,
    v: &Village,
) -> bool {
    conditions(list).iter().all(|(key, c)| {
        record.services.get(key).is_some_and(|w| {
            let GoalCondition::Service { service, .. } = c else {
                return false;
            };
            if let Some(end) = end {
                return w.last <= end;
            }
            if w.reading.is_none() {
                return record.activated_at == Some(v.minutes) && w.last == v.minutes;
            }
            let age = v.minutes - w.last;
            age >= 0.
                && age
                    <= service.cadence()
                        + MINUTES_PER_SECOND * 0.25
                        + observation::tolerance(v.minutes)
        })
    })
}
pub fn valid_state(v: &Village) -> bool {
    let Some(j) = v
        .scenario
        .as_ref()
        .and_then(|o| o.definition.journal.as_ref())
    else {
        return true;
    };
    let Some(s) = &v.progress.scenario_journal else {
        return false;
    };
    j.chapters.iter().flat_map(|c| &c.goals).all(|g| {
        s.goals.get(&g.id).is_some_and(|r| {
            r.activated_at.is_none() || current_valid(r, &[&g.condition], r.completed_at, v)
        })
    }) && j.events.iter().all(|e| {
        s.events.get(&e.id).is_some_and(|r| {
            current_valid(
                &r.watch,
                &e.conditions().collect::<Vec<_>>(),
                r.applied_at,
                v,
            )
        })
    })
}
pub fn measure(c: &GoalCondition, record: &GoalState, _v: &Village) -> (bool, serde_json::Value) {
    let GoalCondition::Service {
        service,
        minimum,
        minutes,
    } = c
    else {
        unreachable!()
    };
    let key = serde_json::to_string(c).unwrap();
    let w = record.services.get(&key);
    let reading = w.and_then(|w| w.reading);
    let elapsed = w
        .and_then(|w| w.since.map(|start| (w.last - start).max(0.)))
        .unwrap_or(0.)
        .min(*minutes as f32);
    let complete = elapsed >= *minutes as f32;
    let kind = match service {
        Kind::Food => "supplies",
        Kind::FreshWater | Kind::Toilets => "water",
        Kind::HousedResidents => "housing",
        Kind::NightLights => "power",
    };
    (
        complete,
        serde_json::json!({"kind":"service","unit":"duration_minutes","value":elapsed,"target":minutes,"complete":complete,"description":format!("Keep {minimum} or more {} for {minutes} consecutive observed minutes after activation",service.name().to_lowercase()),"service":{"id":service,"name":service.name(),"unit":service.unit(),"minimum":minimum,"value":reading.map(|r|r.value),"accessible":reading.is_some_and(|r|r.accessible),"qualifies":reading.is_some_and(|r|r.qualifies(*minimum)),"observed_at":w.filter(|w|w.reading.is_some()).map(|w|w.last),"frozen":record.completed_at.is_some(),"observation_minutes":service.cadence()},"note":service.note(),"action":{"kind":kind}}),
    )
}
pub fn catalog() -> serde_json::Value {
    serde_json::json!({"minimum_minutes":15,"maximum_minutes":wellbeing::MAX_MINUTES,"duration_step":15,"kinds":([Kind::Food,Kind::FreshWater,Kind::HousedResidents,Kind::Toilets,Kind::NightLights].map(|k|serde_json::json!({"id":k,"name":k.name(),"unit":k.unit(),"minimum":if k==Kind::FreshWater{0.1}else{1.},"maximum":k.maximum(),"step":if k==Kind::FreshWater{0.1}else{1.},"observation_minutes":k.cadence(),"note":k.note(),"example_minimum":match k {Kind::Food=>12.,Kind::FreshWater=>6.,_=>1.},"requires_logistics":k==Kind::Food,"requires_utilities":matches!(k,Kind::FreshWater|Kind::Toilets|Kind::NightLights)})))})
}
#[cfg(test)]
mod tests;
