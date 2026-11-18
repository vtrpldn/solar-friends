use std::collections::VecDeque;

use bevy::prelude::*;
use serde::{Deserialize, Serialize};

use crate::{
    arrival::{ARRIVAL_SPOTS, MAP_START, ROAD_END, road_center, road_width, world_position},
    catalog::{Catalog, Project},
    navigation::route,
    stock::Stock,
    terrain::Terrain,
};

const ESSENTIALS: [(KeyCode, &str); 4] = [
    (KeyCode::Digit1, "gathering"),
    (KeyCode::Digit2, "well"),
    (KeyCode::Digit3, "shelter"),
    (KeyCode::Digit4, "toilet"),
];

const STOCKPILE: IVec2 = IVec2::new(32, -13);
const SUPPLY_SPOTS: [IVec2; 5] = [
    IVec2::new(31, -13),
    IVec2::new(33, -13),
    IVec2::new(32, -12),
    IVec2::new(31, -12),
    IVec2::new(33, -12),
];

#[derive(Deserialize, Serialize)]
pub struct Construction {
    #[serde(skip)]
    pub menu: bool,
    #[serde(skip)]
    selection: Option<&'static str>,
    #[serde(skip)]
    rotation: u8,
    #[serde(skip)]
    status: String,
    plans: Vec<Blueprint>,
    residents: [Worker; 5],
}

#[derive(Deserialize, Serialize)]
struct Blueprint {
    key: String,
    position: IVec2,
    size: IVec2,
    rotation: u8,
    loads: u32,
    delivered: u32,
    work: f64,
}

#[derive(Clone, Copy, PartialEq, Deserialize, Serialize)]
enum Activity {
    Collect,
    Carry,
    Walk,
    Build,
}

#[derive(Deserialize, Serialize)]
struct Assignment {
    project: usize,
    spot: IVec2,
    activity: Activity,
    to_site: VecDeque<Vec2>,
}

#[derive(Deserialize, Serialize)]
pub struct Worker {
    pub position: Vec2,
    pub yaw: f32,
    speed: f32,
    path: VecDeque<Vec2>,
    assignment: Option<Assignment>,
    experience: f64,
    retry: f32,
}

impl Default for Construction {
    fn default() -> Self {
        Self {
            menu: false,
            selection: None,
            rotation: 0,
            status: String::new(),
            plans: Vec::new(),
            residents: ARRIVAL_SPOTS.map(|(x, z)| Worker {
                position: Vec2::new(x, z),
                yaw: 0.0,
                speed: 0.0,
                path: VecDeque::new(),
                assignment: None,
                experience: 0.0,
                retry: 0.0,
            }),
        }
    }
}

impl Worker {
    fn move_along_path(&mut self, dt: f32, carrying: bool) {
        let Some(&next) = self.path.front() else {
            self.speed = 0.0;
            return;
        };
        let offset = next - self.position;
        let distance = offset.length();
        self.speed = (self.speed + dt * 1.8).min(if carrying { 0.72 } else { 0.95 });
        let step = self.speed * dt;
        if distance > 0.001 {
            self.yaw = offset.x.atan2(offset.y);
        }
        if distance <= step {
            self.position = next;
            self.path.pop_front();
        } else {
            self.position += offset / distance * step;
        }
    }
}

impl Construction {
    pub fn is_placing(&self) -> bool {
        self.selection.is_some()
    }

    pub fn input(&mut self, keyboard: &ButtonInput<KeyCode>, catalog: &Catalog) {
        if keyboard.just_pressed(KeyCode::KeyB) {
            self.menu = !self.menu;
            self.selection = None;
            self.status.clear();
        }
        if !self.menu {
            return;
        }
        if let Some(id) = ESSENTIALS
            .iter()
            .find_map(|(key, id)| keyboard.just_pressed(*key).then_some(*id))
            && catalog.projects[id].camp_essential
        {
            self.selection = Some(id);
            self.rotation = 0;
            self.status.clear();
        }
        if self.selection.is_some() && keyboard.just_pressed(KeyCode::KeyR) {
            self.rotation = (self.rotation + 1) % 4;
        }
    }

    pub fn instructions(&self, catalog: &Catalog) -> String {
        if !self.menu {
            return "B Build · Space Pause · 1–4 Speed".into();
        }
        if let Some(key) = self.selection {
            let definition = &catalog.projects[key];
            let degrees = u32::from(self.rotation) * 90;
            return format!(
                "{} · {} loads · {:.0} work seconds\nClick to plan · R Rotate ({degrees}°) · B Close\n{}",
                definition.name,
                catalog.loads(definition),
                definition.work,
                self.status
            );
        }
        format!(
            "Camp essentials\n1 {} · 2 {}\n3 {} · 4 {}\nB Close\n{}",
            catalog.projects["gathering"].name,
            catalog.projects["well"].name,
            catalog.projects["shelter"].name,
            catalog.projects["toilet"].name,
            self.status
        )
    }

    pub fn plan(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        terrain: &Terrain,
        camp: IVec2,
        position: IVec2,
    ) {
        let Some(key) = self.selection else { return };
        let definition = &catalog.projects[key];
        let blueprint = Blueprint {
            key: key.into(),
            position,
            size: size(definition, self.rotation),
            rotation: self.rotation,
            loads: catalog.loads(definition),
            delivered: 0,
            work: 0.0,
        };
        if let Some(error) = self.placement_error(terrain, camp, &blueprint, definition.repeatable)
        {
            self.status = error.into();
            return;
        }
        if let Err(id) = stock.reserve(&definition.materials) {
            self.status = format!("Not enough {} in supplies.", catalog.materials[&id].name);
            return;
        }
        self.plans.push(blueprint);
        self.selection = None;
        self.status = format!("{} planned. Materials reserved.", definition.name);
    }

    fn placement_error(
        &self,
        terrain: &Terrain,
        camp: IVec2,
        blueprint: &Blueprint,
        repeatable: bool,
    ) -> Option<&'static str> {
        if !repeatable
            && self
                .plans
                .iter()
                .any(|project| project.key == blueprint.key)
        {
            return Some("Already planned.");
        }
        let start = blueprint.position;
        let end = start + blueprint.size;
        if start.cmplt(IVec2::splat(-30)).any() || end.cmpgt(IVec2::splat(94)).any() {
            return Some("Keep buildings inside the plot boundary.");
        }
        let overlaps = |plot_start: IVec2, plot_end: IVec2| {
            start.cmplt(plot_end).all() && end.cmpgt(plot_start).all()
        };
        if overlaps(camp + IVec2::new(-1, -3), camp + IVec2::new(4, 1)) {
            return Some("Leave the tents clear.");
        }
        if overlaps(STOCKPILE, STOCKPILE + IVec2::ONE) {
            return Some("Leave the supplies accessible.");
        }
        if self
            .plans
            .iter()
            .any(|other| overlaps(other.position, other.position + other.size))
        {
            return Some("Another project occupies that space.");
        }
        for column in start.x..end.x {
            for row in start.y..end.y {
                let Vec2 { x, y: z } = world_position(column as f32, row as f32);
                if (MAP_START..=ROAD_END).contains(&z)
                    && (x - road_center(z)).abs() < road_width(z) + 1.0
                {
                    return Some("Keep the access road and parking clear.");
                }
                let (center, width) = terrain.river(f64::from(z));
                if (f64::from(x) - center).abs() <= width + 2.9 {
                    return Some("Keep projects back from the riverbank.");
                }
            }
        }
        None
    }

    pub fn draw(&self, catalog: &Catalog, terrain: &Terrain, gizmos: &mut Gizmos) {
        for plan in self
            .plans
            .iter()
            .filter(|plan| plan.work < catalog.projects[&plan.key].work)
        {
            let left_top =
                world_position(plan.position.x as f32, plan.position.y as f32) - Vec2::ONE;
            let right_bottom = left_top + plan.size.as_vec2() * 2.0;
            let corners = [
                left_top,
                Vec2::new(left_top.x, right_bottom.y),
                right_bottom,
                Vec2::new(right_bottom.x, left_top.y),
                left_top,
            ];
            gizmos.linestrip(
                corners.map(|point| {
                    Vec3::new(point.x, terrain.height_at(point.x, point.y) + 0.1, point.y)
                }),
                Color::srgb_u8(230, 244, 158),
            );
        }
    }
}

impl Construction {
    pub fn valid_save(&self, catalog: &Catalog) -> bool {
        self.plans.len() <= 128 * 128
            && self.plans.iter().all(|plan| {
                catalog.projects.get(&plan.key).is_some_and(|definition| {
                    plan.rotation <= 3
                        && plan.position.cmpge(IVec2::splat(-30)).all()
                        && plan.position.cmple(IVec2::splat(94)).all()
                        && plan.size == size(definition, plan.rotation)
                        && (plan.position + plan.size).cmple(IVec2::splat(94)).all()
                        && plan.loads == catalog.loads(definition)
                        && plan.delivered <= plan.loads
                        && (0.0..=definition.work).contains(&plan.work)
                        && (plan.delivered == plan.loads || plan.work == 0.0)
                })
            })
            && self.residents.iter().all(|worker| {
                let in_bounds = |point: Vec2| {
                    point.cmpge(Vec2::splat(-31.0)).all() && point.cmple(Vec2::splat(94.0)).all()
                };
                in_bounds(worker.position)
                    && worker.path.len() <= 128 * 128
                    && worker.path.iter().copied().all(in_bounds)
                    && worker.assignment.as_ref().is_none_or(|job| {
                        job.project < self.plans.len()
                            && job.to_site.len() <= 128 * 128
                            && job.to_site.iter().copied().all(in_bounds)
                    })
            })
    }

    pub fn latest_progress(&self, catalog: &Catalog) -> Option<String> {
        let project = self.plans.last()?;
        let definition = &catalog.projects[&project.key];
        let status = if project.work >= definition.work {
            "Ready".into()
        } else if project.delivered < project.loads {
            format!("{} of {} loads delivered", project.delivered, project.loads)
        } else {
            format!("{:.0}% built", project.work / definition.work * 100.0)
        };
        Some(format!("{}: {status}", definition.name))
    }

    pub fn worker(&self, index: usize) -> &Worker {
        &self.residents[index]
    }

    pub fn finished_models<'a>(
        &'a self,
        catalog: &'a Catalog,
    ) -> impl Iterator<Item = (usize, usize, Vec2, f32)> + 'a {
        self.plans
            .iter()
            .enumerate()
            .filter_map(|(index, project)| {
                if project.work < catalog.projects[&project.key].work {
                    return None;
                }
                let model = 9 + ESSENTIALS.iter().position(|(_, key)| *key == project.key)?;
                let base = project.position.as_vec2() + (project.size.as_vec2() - Vec2::ONE) * 0.5;
                Some((
                    index,
                    model,
                    world_position(base.x, base.y),
                    f32::from(project.rotation) * std::f32::consts::FRAC_PI_2,
                ))
            })
    }

    pub fn tick(&mut self, catalog: &Catalog, terrain: &Terrain, camp: IVec2, dt: f32) {
        for index in 0..self.residents.len() {
            if let Some(job) = &self.residents[index].assignment {
                let project = &self.plans[job.project];
                if project.work >= catalog.projects[&project.key].work {
                    self.residents[index].assignment = None;
                    self.residents[index].path.clear();
                }
            }
            if self.residents[index].assignment.is_none() {
                self.residents[index].retry -= dt;
                if self.residents[index].retry <= 0.0 {
                    self.assign(index, catalog, terrain, camp);
                    self.residents[index].retry = 2.0;
                }
            }
            let worker = &mut self.residents[index];
            let Some(mut job) = worker.assignment.take() else {
                continue;
            };
            worker.move_along_path(dt, job.activity == Activity::Carry);
            if !worker.path.is_empty() {
                worker.assignment = Some(job);
                continue;
            }
            let project = &mut self.plans[job.project];
            match job.activity {
                Activity::Collect => {
                    worker.path = std::mem::take(&mut job.to_site);
                    job.activity = Activity::Carry;
                }
                Activity::Carry => {
                    project.delivered += 1;
                    if project.delivered < project.loads {
                        continue;
                    }
                    job.activity = Activity::Build;
                }
                Activity::Walk => job.activity = Activity::Build,
                Activity::Build => {
                    let crew = self
                        .residents
                        .iter()
                        .filter(|other| {
                            other.assignment.as_ref().is_some_and(|other| {
                                other.project == job.project && other.activity == Activity::Build
                            })
                        })
                        .count();
                    let worker = &mut self.residents[index];
                    let skilled = matches!(
                        (index, project.key.as_str()),
                        (1, "shelter") | (2, "gathering") | (3, "well") | (4, "toilet")
                    );
                    let skill = if skilled { 1.25 } else { 1.0 };
                    let experience = 1.0 + (worker.experience / 10_000.0).min(0.15);
                    let efficiency = 1.0 / (1.0 + 0.12 * crew as f64);
                    project.work = (project.work + f64::from(dt) * skill * experience * efficiency)
                        .min(catalog.projects[&project.key].work);
                    worker.experience += f64::from(dt);
                }
            }
            self.residents[index].assignment = Some(job);
        }
    }

    fn assign(&mut self, index: usize, catalog: &Catalog, terrain: &Terrain, camp: IVec2) {
        let position = self.residents[index].position;
        for (id, project) in self.plans.iter().enumerate() {
            let definition = &catalog.projects[&project.key];
            if project.work >= definition.work {
                continue;
            }
            let crew: Vec<_> = self
                .residents
                .iter()
                .filter_map(|worker| worker.assignment.as_ref().filter(|job| job.project == id))
                .collect();
            let limit = ((definition.work / 350.0).ceil() as usize)
                .max(((project.size.x * project.size.y) as usize).div_ceil(2))
                .clamp(2, 3);
            if crew.len() >= limit
                || (project.delivered < project.loads
                    && project.delivered + crew.len() as u32 >= project.loads)
            {
                continue;
            }
            let hauling = project.delivered < project.loads;
            let supply = SUPPLY_SPOTS[index];
            let start = if hauling { supply.as_vec2() } else { position };
            let mut spots = Vec::new();
            for z in 0..project.size.y {
                spots.extend([IVec2::new(-1, z), IVec2::new(project.size.x, z)]);
            }
            for x in 0..project.size.x {
                spots.extend([IVec2::new(x, project.size.y), IVec2::new(x, -1)]);
            }
            spots.iter_mut().for_each(|spot| *spot += project.position);
            spots.sort_by(|a, b| {
                a.as_vec2()
                    .distance_squared(start)
                    .total_cmp(&b.as_vec2().distance_squared(start))
            });
            let path = |from, to| {
                route(
                    from,
                    to,
                    |cell| self.blocked(terrain, camp, cell),
                    access_road,
                )
            };
            let Some((spot, to_site)) = spots
                .into_iter()
                .filter(|spot| !crew.iter().any(|worker| worker.spot == *spot))
                .find_map(|spot| path(start, spot).map(|route| (spot, route)))
            else {
                continue;
            };
            let (path, to_site, activity) = if hauling {
                let Some(to_supply) = path(position, supply) else {
                    continue;
                };
                (to_supply, to_site, Activity::Collect)
            } else {
                (to_site, VecDeque::new(), Activity::Walk)
            };
            let worker = &mut self.residents[index];
            worker.path = path;
            worker.assignment = Some(Assignment {
                project: id,
                spot,
                to_site,
                activity,
            });
            return;
        }
    }

    fn blocked(&self, terrain: &Terrain, camp: IVec2, cell: IVec2) -> bool {
        let Vec2 { x, y: z } = world_position(cell.x as f32, cell.y as f32);
        let (center, width) = terrain.river(f64::from(z));
        let inside = |start: IVec2, end: IVec2| cell.cmpge(start).all() && cell.cmplt(end).all();
        (f64::from(x) - center).abs() <= width + 1.9
            || cell == STOCKPILE
            || inside(camp + IVec2::new(-1, -3), camp + IVec2::new(4, 0))
            || self
                .plans
                .iter()
                .any(|plan| inside(plan.position, plan.position + plan.size))
    }
}

fn access_road(cell: IVec2) -> bool {
    let Vec2 { x, y: z } = world_position(cell.x as f32, cell.y as f32);
    (MAP_START..=ROAD_END).contains(&z) && (x - road_center(z)).abs() < road_width(z)
}

fn size(definition: &Project, rotation: u8) -> IVec2 {
    let [width, depth] = definition.size;
    if rotation.is_multiple_of(2) {
        IVec2::new(width, depth)
    } else {
        IVec2::new(depth, width)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::setup::WorldSetup;

    #[test]
    fn residents_haul_all_reserved_loads_before_assembling() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let terrain = setup.terrain();
        let camp = IVec2::new(36, 36);
        let mut construction = Construction {
            selection: Some("gathering"),
            ..default()
        };
        construction.plan(&catalog, &mut stock, &terrain, camp, IVec2::new(44, 36));
        let loads = catalog.loads(&catalog.projects["gathering"]);
        for _ in 0..8_000 {
            construction.tick(&catalog, &terrain, camp, 0.1);
            let project = &construction.plans[0];
            assert!(project.delivered <= loads);
            if project.delivered < loads {
                assert_eq!(project.work, 0.0);
            }
            if construction.finished_models(&catalog).next().is_some() {
                break;
            }
        }
        assert_eq!(construction.finished_models(&catalog).count(), 1);
        assert_eq!(construction.plans[0].delivered, loads);
        assert_eq!(stock.available("wood"), 28);
    }

    #[test]
    fn blueprint_reserves_supplies_only_after_valid_placement() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let terrain = setup.terrain();
        let camp = IVec2::new(36, 36);
        let mut construction = Construction {
            selection: Some("gathering"),
            ..default()
        };

        construction.plan(&catalog, &mut stock, &terrain, camp, camp);
        assert_eq!(stock.available("wood"), 36);
        assert!(construction.plans.is_empty());

        construction.plan(&catalog, &mut stock, &terrain, camp, IVec2::new(44, 36));
        assert_eq!(stock.available("wood"), 28);
        assert_eq!(stock.available("hardware"), 6);
        assert_eq!(construction.plans.len(), 1);

        construction.selection = Some("well");
        construction.plan(&catalog, &mut stock, &terrain, camp, IVec2::new(50, 36));
        assert_eq!(stock.available("hardware"), 6);
        assert_eq!(construction.plans.len(), 1);
    }
}
