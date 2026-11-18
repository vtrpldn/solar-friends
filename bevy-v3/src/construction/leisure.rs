use crate::{
    resident_animation::Motion,
    setup::WorldSetup,
    weather::{game_hour, weather_at},
};

use super::{resident_work::approach_points, *};

#[derive(Clone, Copy, Deserialize, PartialEq, Serialize)]
enum Activity {
    Fire,
    Reading,
    Classroom,
    Hall,
    Exercise,
    Court,
    Cover,
    Breather,
    Outdoors,
    Stretch,
    Walk,
    Waiting,
}

impl Activity {
    fn at(kind: &str) -> Option<Self> {
        Some(match kind {
            "fire-circle" => Self::Fire,
            "reading-room" => Self::Reading,
            "outdoor-classroom" => Self::Classroom,
            "community-hall" => Self::Hall,
            "exercise-garden" => Self::Exercise,
            "volleyball-court" => Self::Court,
            "shed" | "rain-shelter" => Self::Cover,
            _ => return None,
        })
    }

    fn details(self) -> (&'static str, f64) {
        match self {
            Self::Fire => ("Sitting by the fire", 32.0),
            Self::Reading => ("Reading a book", 48.0),
            Self::Classroom => ("Reading in the shade", 42.0),
            Self::Hall => ("Reading in the community hall", 38.0),
            Self::Exercise => ("Stretching in the exercise garden", 24.0),
            Self::Court => ("Warming up at the court", 24.0),
            Self::Cover => ("Stretching under cover", 24.0),
            Self::Breather => ("Taking a breather", 12.0),
            Self::Outdoors => ("Reading outdoors", 42.0),
            Self::Stretch => ("Taking a stretching break", 22.0),
            Self::Walk => ("Stretching after a walk", 8.0),
            Self::Waiting => ("Stretching while waiting for a free spot", 12.0),
        }
    }

    fn sheltered(self) -> bool {
        matches!(
            self,
            Self::Reading | Self::Classroom | Self::Hall | Self::Cover | Self::Waiting
        )
    }
}

#[derive(Clone, Copy, Deserialize, PartialEq, Serialize)]
struct VisitKey {
    activity: Activity,
    site: Option<usize>,
}

#[derive(Deserialize, Serialize)]
pub(super) struct Visit {
    key: VisitKey,
    site_pose: Option<(IVec2, u8)>,
    target: Vec2,
    next: Option<IVec2>,
    facing: Option<Vec2>,
    created: f64,
    elapsed: f64,
    next_invitation: f64,
    arrived: bool,
}

impl Visit {
    pub(super) fn motion(&self) -> Motion {
        if !self.arrived {
            return Motion::Walk;
        }
        match self.key.activity {
            Activity::Fire if (10.0..22.0).contains(&self.elapsed) => Motion::GroundRelax,
            Activity::Fire => Motion::FireSit,
            Activity::Reading | Activity::Classroom | Activity::Hall => Motion::Read,
            Activity::Outdoors => Motion::GroundRead,
            Activity::Breather if self.elapsed < 3.0 => Motion::Yawn,
            Activity::Breather => Motion::Breathe,
            _ if self.elapsed < 7.0 => Motion::NeckStretch,
            _ if self.elapsed < 14.0 => Motion::ShoulderRoll,
            _ => Motion::Stretch,
        }
    }

    pub(super) fn label(&self) -> &'static str {
        if self.arrived {
            self.key.activity.details().0
        } else if self.key.activity == Activity::Walk {
            "Taking a walk around the village"
        } else {
            "Walking to a leisure spot"
        }
    }

    fn valid(&self) -> bool {
        [self.created, self.elapsed, self.next_invitation]
            .into_iter()
            .all(|t| t.is_finite() && t >= 0.0)
            && (0.0..=48.0).contains(&self.elapsed)
            && self.target.is_finite()
            && self.facing.is_none_or(|point| point.is_finite())
    }
}

#[derive(Default, Deserialize, Serialize)]
pub(super) struct Leisure {
    pub(super) visit: Option<Visit>,
    recent: Vec<VisitKey>,
    cycle: u32,
}

impl Leisure {
    pub(super) fn valid(&self) -> bool {
        self.recent.len() <= 3 && self.visit.as_ref().is_none_or(Visit::valid)
    }
}

impl Construction {
    pub fn tick_leisure(
        &mut self,
        catalog: &Catalog,
        setup: &WorldSetup,
        stock: &Stock,
        site: ConstructionSite,
        clock: f64,
        dt: f32,
    ) {
        let wet = weather_at(clock, setup.biome(), setup.seed()).rain > 0.05;
        for index in 0..self.residents.len() {
            if !self.free_for_leisure(index) {
                self.residents[index].leisure.visit = None;
                continue;
            }
            if let Some(mut visit) = self.residents[index].leisure.visit.take() {
                if self.visit_valid(&visit, catalog, clock, wet) {
                    let worker = &mut self.residents[index];
                    worker.move_along_path(dt, false);
                    if !worker.path.is_empty() {
                        worker.leisure.visit = Some(visit);
                        continue;
                    }
                    if worker.position.distance(visit.target) <= 0.15 {
                        if let Some(next) = visit.next.take() {
                            let from = worker.position;
                            if let Some(path) = self.resident_route(catalog, site, from, next) {
                                let worker = &mut self.residents[index];
                                worker.path = path;
                                visit.target = next.as_vec2();
                                worker.leisure.visit = Some(visit);
                                continue;
                            }
                        } else {
                            let worker = &mut self.residents[index];
                            visit.arrived = true;
                            visit.elapsed += f64::from(dt);
                            if let Some(center) = visit.facing {
                                let offset = center - worker.position;
                                worker.yaw = offset.x.atan2(offset.y);
                            }
                            if visit.key.activity != Activity::Walk {
                                let fun = &mut worker.health.levels[Need::Fun as usize];
                                *fun = (*fun + f64::from(dt) * 0.18).min(100.0);
                            }
                            if visit.elapsed < visit.key.activity.details().1 {
                                let invite = visit.elapsed > 6.0 && clock >= visit.next_invitation;
                                let center = visit.facing.filter(|_| invite);
                                if center.is_some() {
                                    visit.next_invitation = clock + 12.0;
                                }
                                worker.leisure.visit = Some(visit);
                                if let Some(center) = center {
                                    self.invite_at_fire(index, catalog, stock, center, clock);
                                }
                                continue;
                            }
                        }
                    }
                }
                self.residents[index].path.clear();
            }
            self.choose_visit(index, catalog, site, clock, wet);
        }
    }

    pub(super) fn free_for_leisure(&self, index: usize) -> bool {
        let worker = &self.residents[index];
        worker.assignment.is_none()
            && worker.health.task.is_none()
            && !worker.town_work.active()
            && !self.trip.as_ref().is_some_and(|trip| trip.driver == index)
            && !self.gathering.workers_at_site(index)
            && !self.production.has_worker(index)
            && !self.farming.has_worker(index)
            && !self.working_change(index)
            && !self.working_water(index)
    }

    fn visit_valid(&self, visit: &Visit, catalog: &Catalog, clock: f64, wet: bool) -> bool {
        clock - visit.created <= 180.0
            && (!wet || visit.key.activity.sheltered())
            && visit.key.site.is_none_or(|id| {
                self.plans.get(id).is_some_and(|plan| {
                    !plan.removed
                        && !self.changes.contains_key(&id)
                        && self.utilities.enabled(id)
                        && plan.work >= catalog.projects[&plan.key].work
                        && visit.site_pose == Some((plan.position, plan.rotation))
                })
            })
    }

    fn choose_visit(
        &mut self,
        index: usize,
        catalog: &Catalog,
        site: ConstructionSite,
        clock: f64,
        wet: bool,
    ) {
        let worker = &self.residents[index];
        let profile = &catalog.residents[index];
        let cycle = worker.leisure.cycle;
        let hour = game_hour(clock);
        let penalty = |key| {
            worker
                .leisure
                .recent
                .iter()
                .position(|other| *other == key)
                .map_or(0.0, |rank| 10.0 - rank as f64 * 3.0)
        };
        let mut candidates = Vec::new();
        let mut add = |activity, site, score| {
            let key = VisitKey { activity, site };
            candidates.push((key, score - penalty(key)));
        };
        for (id, plan) in self.plans.iter().enumerate() {
            let def = &catalog.projects[&plan.key];
            let Some(activity) = Activity::at(&def.kind) else {
                continue;
            };
            if plan.removed
                || plan.work < def.work
                || self.changes.contains_key(&id)
                || !self.utilities.enabled(id)
                || (wet && !activity.sheltered())
            {
                continue;
            }
            let favorite = profile
                .favorites
                .iter()
                .position(|kind| *kind == def.kind)
                .map_or(0.0, |rank| (profile.favorites.len() - rank) as f64);
            let evening = if activity != Activity::Fire {
                0.0
            } else if !(7.0..17.0).contains(&hour) {
                4.0
            } else {
                -2.0
            };
            add(
                activity,
                Some(id),
                3.0 + favorite + evening
                    - f64::from(plan.position.as_vec2().distance(worker.position)) / 30.0,
            );
        }
        if !wet {
            if worker.health.energy < 50.0 {
                add(Activity::Breather, None, 7.0);
            }
            if (6.0..19.0).contains(&hour) {
                add(
                    Activity::Outdoors,
                    None,
                    if profile.interests.iter().any(|topic| topic == "books") {
                        5.0
                    } else {
                        1.0
                    },
                );
            }
            add(
                Activity::Stretch,
                None,
                if profile.hobby == "Outdoor exercise" {
                    5.0
                } else {
                    2.0
                },
            );
            add(Activity::Walk, None, 4.0);
        }
        candidates.sort_by(|(_, a), (_, b)| b.total_cmp(a));
        let chosen =
            candidates.into_iter().find_map(|(key, _)| {
                let plan = key.site.map(|id| &self.plans[id]);
                let points = if let Some(plan) = plan {
                    approach_points(plan.position, plan.size, worker.position)
                } else {
                    camp_points(site.camp, index as u32 + cycle.wrapping_mul(2))
                };
                let (target, path) = points
                    .into_iter()
                    .filter(|&point| {
                        !self.residents.iter().enumerate().any(|(other, worker)| {
                            other != index
                                && worker.leisure.visit.as_ref().is_some_and(|visit| {
                                    visit.target.distance(point.as_vec2()) < 0.8
                                })
                        })
                    })
                    .find_map(|point| {
                        self.resident_route(catalog, site, worker.position, point)
                            .map(|path| (point, path))
                    })?;
                let next =
                    if key.activity == Activity::Walk {
                        let center =
                            site.camp + IVec2::new(if cycle.is_multiple_of(2) { -4 } else { 4 }, 3);
                        Some(camp_points(center, index as u32 + cycle).into_iter().find(
                            |&point| {
                                point.as_vec2().distance(target.as_vec2()) >= 2.0
                                    && self
                                        .resident_route(catalog, site, target.as_vec2(), point)
                                        .is_some()
                            },
                        )?)
                    } else {
                        None
                    };
                let facing = plan
                    .filter(|_| key.activity == Activity::Fire)
                    .map(|plan| plan.position.as_vec2() + (plan.size.as_vec2() - Vec2::ONE) * 0.5);
                Some((
                    Visit {
                        key,
                        site_pose: plan.map(|plan| (plan.position, plan.rotation)),
                        target: target.as_vec2(),
                        next,
                        facing,
                        created: clock,
                        elapsed: 0.0,
                        next_invitation: 0.0,
                        arrived: false,
                    },
                    path,
                ))
            });
        let worker = &mut self.residents[index];
        worker.leisure.cycle = cycle.wrapping_add(1);
        let (visit, path) = chosen.unwrap_or_else(|| {
            (
                Visit {
                    key: VisitKey {
                        activity: Activity::Waiting,
                        site: None,
                    },
                    site_pose: None,
                    target: worker.position,
                    next: None,
                    facing: None,
                    created: clock,
                    elapsed: 0.0,
                    next_invitation: 0.0,
                    arrived: true,
                },
                VecDeque::new(),
            )
        });
        worker.path = path;
        if visit.key.activity != Activity::Waiting {
            worker.leisure.recent.retain(|key| *key != visit.key);
            worker.leisure.recent.insert(0, visit.key);
            worker.leisure.recent.truncate(3);
        }
        worker.leisure.visit = Some(visit);
    }
}

fn camp_points(center: IVec2, order: u32) -> Vec<IVec2> {
    let offsets = [
        (-3, 2),
        (-1, 3),
        (1, 2),
        (3, 2),
        (4, 4),
        (2, 5),
        (0, 5),
        (-3, 4),
        (-5, 2),
        (-5, -2),
        (5, -2),
        (5, 1),
    ];
    offsets
        .iter()
        .cycle()
        .skip(order as usize % offsets.len())
        .take(offsets.len())
        .map(|&(x, z)| center + IVec2::new(x, z))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_reading_room_visit_recovers_fun_only_after_arrival() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        stock.sandbox = true;
        let camp = IVec2::new(36, 36);
        let terrain = setup.terrain().with_camp(camp);
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp,
        };
        let mut village = Construction {
            selection: Some("reading-room".into()),
            ..default()
        };
        village.plan(
            &catalog,
            &mut stock,
            site,
            IVec2::new(44, 36),
            TownClock {
                seconds: 0.0,
                round_trip_km: 12,
            },
        );
        let index = 1;
        let fun = Need::Fun as usize;
        village.residents[index].position = Vec2::new(40.0, 39.0);
        village.residents[index].health.levels[fun] = 60.0;
        village.tick_leisure(&catalog, &setup, &stock, site, 0.0, 0.1);
        assert_eq!(
            village.residents[index]
                .leisure
                .visit
                .as_ref()
                .unwrap()
                .key
                .site,
            Some(0)
        );
        assert_eq!(village.residents[index].health.levels[fun], 60.0);
        for tick in 1..200 {
            village.tick_leisure(&catalog, &setup, &stock, site, f64::from(tick) / 10.0, 0.1);
        }
        let reader = &village.residents[index];
        assert!(reader.leisure.visit.as_ref().unwrap().arrived);
        assert!(reader.health.levels[fun] > 60.0);
        assert!(reader.leisure.visit.as_ref().unwrap().motion() == Motion::Read);
        let json = serde_json::to_string(&village).unwrap();
        let loaded: Construction = serde_json::from_str(&json).unwrap();
        assert!(
            loaded.residents[index]
                .leisure
                .visit
                .as_ref()
                .unwrap()
                .arrived
        );
    }
}
