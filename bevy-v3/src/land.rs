mod tree_wind;

use std::collections::HashMap;

use bevy::{
    asset::{AssetPath, embedded_asset, embedded_path},
    gltf::GltfAssetLabel,
    prelude::*,
    window::{PrimaryWindow, WindowOccluded},
};

use crate::{
    arrival::{MAP_START, ROAD_END, road_center, road_width, world_position},
    catalog::Catalog,
    setup::WorldSetup,
    terrain::{Terrain, land_random, noise},
    village::Village,
};

const STOCK: Vec2 = Vec2::new(32.0, -13.0);
const EARTH: usize = 8;
const STONE: usize = 9;
const FIRST_FORAGE_MODEL: usize = 10;
const LAST_FORAGE_MODEL: usize = 14;
const FIRST_DEPLETED_FORAGE_MODEL: usize = 23;
const WILD_BAMBOO: usize = 12;
const TREES: [&[usize]; 3] = [&[0, 1, 2, 3], &[4, 5], &[6, 7]];

pub struct LandPlugin;

impl Plugin for LandPlugin {
    fn build(&self, app: &mut App) {
        embedded_asset!(app, "land.glb");
        tree_wind::install(app);
        app.init_resource::<Land>()
            // Tree wind copies read which materials already carry the palette.
            .init_resource::<crate::palette::Repainted>()
            .init_resource::<LandscapeMotion>()
            .add_message::<WindowOccluded>()
            .add_systems(PreUpdate, generate_land)
            .add_systems(
                PostUpdate,
                (
                    advance_landscape_motion,
                    draw_land,
                    update_harvested_land,
                    tree_wind::update,
                )
                    .chain()
                    .before(TransformSystems::Propagate),
            );
    }
}

#[derive(Resource, Default)]
pub struct Land {
    sites: Vec<Site>,
    scenery: Vec<Plant>,
    occupied: HashMap<IVec2, usize>,
}

#[derive(Clone, Copy)]
pub struct Site {
    model: usize,
    pub position: IVec2,
    pub size: IVec2,
}

struct Plant {
    model: usize,
    position: Vec2,
    yaw: f32,
    scale: f32,
}

#[derive(Clone, Copy)]
struct Candidate {
    cell: IVec2,
    relief: f64,
    moisture: f64,
    jitter: f64,
}

#[derive(Component)]
struct LandDetail {
    site: Option<usize>,
    depleted: bool,
}

#[derive(Resource, Default)]
pub(crate) struct LandscapeMotion {
    pub seconds: f64,
    occluded: bool,
}

pub(crate) fn advance_landscape_motion(
    setup: Res<WorldSetup>,
    village: Res<Village>,
    time: Res<Time<Real>>,
    primary: Query<(), With<PrimaryWindow>>,
    mut visibility: MessageReader<WindowOccluded>,
    mut motion: ResMut<LandscapeMotion>,
) {
    for event in visibility.read() {
        if primary.contains(event.window) {
            motion.occluded = event.occluded;
        }
    }
    let delta = time.delta_secs_f64().clamp(0.0, 0.1);
    if !setup.open && !village.is_paused() && !motion.occluded && delta > 0.0 {
        motion.seconds += delta;
    }
}

impl Land {
    pub fn occupied(&self, cell: IVec2) -> bool {
        self.occupied.contains_key(&cell)
    }

    pub fn site_at(&self, cell: IVec2) -> Option<usize> {
        self.occupied.get(&cell).copied()
    }

    pub fn site(&self, index: usize) -> Option<&Site> {
        self.sites.get(index)
    }

    pub fn sites(&self) -> impl Iterator<Item = (usize, &Site)> {
        self.sites.iter().enumerate()
    }

    pub fn generate(setup: &WorldSetup) -> Self {
        let terrain = setup.terrain();
        let mut land = Self::default();
        if terrain.seed != 0 {
            land.populate(setup, &terrain);
        }
        land.scenery = scenery(setup, &terrain);
        land
    }

    fn populate(&mut self, setup: &WorldSetup, terrain: &Terrain) {
        let seed = terrain.seed;
        let mut random = land_random(seed ^ 0x8e4b192);
        let candidates: Vec<_> = (0..2200)
            .map(|_| {
                let p = IVec2::new(
                    (-27.0 + random() * 118.0).floor() as i32,
                    (-27.0 + random() * 118.0).floor() as i32,
                );
                let world = world_position(p.x as f32, p.y as f32);
                let (center, width) = terrain.river(f64::from(world.y));
                let bank = ((f64::from(world.x) - center).abs() - width).max(0.0);
                Candidate {
                    cell: p,
                    relief: terrain.elevation(world.x.into(), world.y.into()) / terrain.hill_height,
                    moisture: (-bank / 22.0).exp(),
                    jitter: random(),
                }
            })
            .collect();

        for model in [EARTH, STONE] {
            let spots = ranked(&candidates, |p| {
                let x = f64::from(p.cell.x);
                let z = f64::from(p.cell.y);
                let rock = model == STONE;
                let relief = if rock {
                    p.relief
                } else {
                    1.0 - p.relief + p.moisture * 0.5
                };
                let salt = if rock { 0x71af } else { 0x38cd };
                relief + noise(x / 18.0, z / 18.0, seed ^ salt) * 0.6 + p.jitter * 0.18
            });
            self.place_group(terrain, model, IVec2::new(4, 3), 4, &spots);
        }

        let density = [1.35, 1.0, 0.7][setup.biome()];
        let target = (110.0 * density * setup.richness()).round() as usize;
        let groves = ranked(&candidates, |p| {
            let x = f64::from(p.cell.x);
            let z = f64::from(p.cell.y);
            noise(x / 15.0, z / 15.0, seed ^ 0x49ab) * 0.75
                + noise(x / 6.0, z / 6.0, seed ^ 0x726c) * 0.25
                + p.moisture * 0.12
                + p.jitter * 0.12
        });
        let species = TREES[setup.biome()];
        let mut placed = 0;
        for spot in groves {
            if placed == target {
                break;
            }
            let value = if random() < 0.2 {
                random()
            } else {
                noise(
                    f64::from(spot.x) / 11.0,
                    f64::from(spot.y) / 11.0,
                    seed ^ 0x913e,
                )
            };
            let model = species[((value * species.len() as f64) as usize).min(species.len() - 1)];
            placed += usize::from(self.try_place(terrain, model, spot, IVec2::ONE));
        }

        let gather_target = (3.0 * setup.richness()).round().max(2.0) as usize;
        for (model, depth, biomes) in [
            (10, 2, 0b011),
            (11, 1, 0b111),
            (12, 2, 0b001),
            (13, 1, 0b111),
            (14, 1, 0b111),
        ] {
            if biomes & (1 << setup.biome()) == 0 {
                continue;
            }
            let moisture = if model == WILD_BAMBOO { 2.0 } else { 0.3 };
            let spots = ranked(&candidates, |p| p.jitter + p.moisture * moisture);
            self.place_group(terrain, model, IVec2::new(2, depth), gather_target, &spots);
        }
    }

    fn place_group(
        &mut self,
        terrain: &Terrain,
        model: usize,
        size: IVec2,
        target: usize,
        spots: &[IVec2],
    ) {
        let near = spots
            .iter()
            .copied()
            .filter(|spot| spot.as_vec2().distance(STOCK) < 28.0);
        let start = usize::from(
            near.into_iter()
                .any(|spot| self.try_place(terrain, model, spot, size)),
        );
        let mut placed = start;
        for &spot in spots {
            if placed == target {
                break;
            }
            placed += usize::from(self.try_place(terrain, model, spot, size));
        }
    }

    fn try_place(&mut self, terrain: &Terrain, model: usize, position: IVec2, size: IVec2) -> bool {
        let end = position + size;
        if position.cmplt(IVec2::splat(-29)).any()
            || end.cmpgt(IVec2::splat(93)).any()
            || position.as_vec2().distance(STOCK) < 9.0
        {
            return false;
        }
        for x in position.x - 1..=end.x {
            for z in position.y - 1..=end.y {
                if excluded(terrain, Vec2::new(x as f32, z as f32)) {
                    return false;
                }
            }
        }
        if self.sites.iter().any(|site| {
            let gap = IVec2::splat(if model < EARTH && site.model < EARTH {
                1
            } else {
                2
            });
            position.cmplt(site.position + site.size + gap).all()
                && (end + gap).cmpgt(site.position).all()
        }) {
            return false;
        }
        for x in position.x..end.x {
            for z in position.y..end.y {
                self.occupied.insert(IVec2::new(x, z), self.sites.len());
            }
        }
        self.sites.push(Site {
            model,
            position,
            size,
        });
        true
    }
}

impl Site {
    pub fn recipe(&self) -> &'static str {
        match self.model {
            0..=7 => "fell_tree",
            EARTH => "earth",
            STONE => "stone",
            10 => "gather-wild-fruit",
            11 => "gather-fallen-wood",
            WILD_BAMBOO => "gather-wild-bamboo",
            13 => "gather-wild-forage",
            14 => "gather-loose-stone",
            _ => unreachable!("a natural site must have a recipe"),
        }
    }
}

fn ranked(candidates: &[Candidate], score: impl Fn(&Candidate) -> f64) -> Vec<IVec2> {
    let mut scored: Vec<_> = candidates.iter().map(|p| (p.cell, score(p))).collect();
    scored.sort_by(|a, b| b.1.total_cmp(&a.1));
    scored.into_iter().map(|(cell, _)| cell).collect()
}

fn excluded(terrain: &Terrain, cell: Vec2) -> bool {
    let Vec2 { x, y: z } = world_position(cell.x, cell.y);
    let (center, width) = terrain.river(z.into());
    (f64::from(x) - center).abs() <= width + 2.9
        || ((MAP_START..=ROAD_END).contains(&z) && (x - road_center(z)).abs() < road_width(z) + 2.0)
}

fn scenery(setup: &WorldSetup, terrain: &Terrain) -> Vec<Plant> {
    let mut random = land_random(terrain.seed ^ 0x51f92);
    let options = [[15, 16], [17, 18], [19, 20]][setup.biome()];
    let mut plants: Vec<_> = (0..100)
        .filter_map(|_| {
            let cell = Vec2::new(
                (32.0 + (random() - 0.5) * 120.0) as f32,
                (32.0 + (random() - 0.5) * 120.0) as f32,
            );
            if cell.distance(STOCK) < 9.0 || excluded(terrain, cell) {
                return None;
            }
            Some(Plant {
                model: options[(random() * 2.0) as usize],
                position: cell,
                yaw: (random() * std::f64::consts::TAU) as f32,
                scale: 1.0,
            })
        })
        .collect();
    plants.extend([
        Plant {
            model: 21,
            position: STOCK,
            yaw: 0.0,
            scale: 1.0,
        },
        Plant {
            model: 22,
            position: STOCK + Vec2::new(-2.0, 1.0),
            yaw: 0.0,
            scale: 1.0,
        },
    ]);
    plants
}

fn generate_land(
    setup: Res<WorldSetup>,
    mut land: ResMut<Land>,
    mut previous: Local<Option<WorldSetup>>,
) {
    if !setup.is_changed() {
        return;
    }
    let key = setup.session();
    if previous.as_ref() != Some(&key) {
        *land = Land::generate(&setup);
        *previous = Some(key);
    }
}

#[derive(Default)]
struct LandDetailDraw {
    camp: Option<IVec2>,
    terrain: (u64, u64, usize),
}

fn draw_land(
    mut commands: Commands,
    land: Res<Land>,
    setup: Res<WorldSetup>,
    village: Res<Village>,
    assets: Res<AssetServer>,
    mut existing: Query<(Entity, &mut Transform), With<LandDetail>>,
    mut previous: Local<LandDetailDraw>,
) {
    let camp = if setup.open { None } else { village.camp };
    let terrain_key = village.terrain_key();
    let rebuild = land.is_changed() || camp != previous.camp;
    if !rebuild && terrain_key == previous.terrain {
        return;
    }
    previous.camp = camp;
    previous.terrain = terrain_key;
    let terrain = village.terrain(&setup);
    if !rebuild {
        for (_, mut transform) in &mut existing {
            transform.translation.y =
                terrain.height_at(transform.translation.x, transform.translation.z);
        }
        return;
    }
    for (entity, _) in &existing {
        commands.entity(entity).despawn();
    }
    let path = AssetPath::from_path_buf(embedded_path!("land.glb")).with_source("embedded");
    let sites = land.sites.iter().enumerate().map(|(index, site)| {
        let position = site.position.as_vec2() + (site.size.as_vec2() - Vec2::ONE) * 0.5;
        let mut random = land_random(
            terrain.seed
                ^ (site.position.x as u32).wrapping_mul(971)
                ^ (site.position.y as u32).wrapping_mul(7919),
        );
        let scale = if site.model < EARTH {
            (0.86 + random() * 0.28) as f32
        } else {
            1.0
        };
        (
            Some(index),
            Plant {
                model: site.model,
                position,
                yaw: (random() * std::f64::consts::TAU) as f32,
                scale,
            },
        )
    });
    for (index, plant) in sites.chain(land.scenery.iter().map(|p| (None, Plant { ..*p }))) {
        let Vec2 { x, y: z } = world_position(plant.position.x, plant.position.y);
        let scene = assets.load(
            path.clone()
                .with_label(GltfAssetLabel::Scene(plant.model).to_string()),
        );
        let planted_rotation = Quat::from_rotation_y(plant.yaw);
        let mut entity = commands.spawn((
            LandDetail {
                site: index,
                depleted: false,
            },
            SceneRoot(scene),
            Transform::from_xyz(x, terrain.height_at(x, z), z)
                .with_rotation(planted_rotation)
                .with_scale(Vec3::splat(plant.scale)),
        ));
        if plant.model < EARTH {
            entity.observe(tree_wind::apply);
        }
    }
}
fn update_harvested_land(
    land: Res<Land>,
    setup: Res<WorldSetup>,
    village: Res<Village>,
    catalog: Res<Catalog>,
    assets: Res<AssetServer>,
    mut models: Query<(&mut LandDetail, &mut SceneRoot, &mut Visibility)>,
) {
    let in_village = !setup.open && village.camp.is_some();
    for (mut detail, mut scene, mut visibility) in &mut models {
        let Some(index) = detail.site else {
            continue;
        };
        let visible = if in_village && village.tree_felled(index) {
            Visibility::Hidden
        } else {
            Visibility::Inherited
        };
        visibility.set_if_neq(visible);
        let Some(site) = land
            .site(index)
            .filter(|site| (FIRST_FORAGE_MODEL..=LAST_FORAGE_MODEL).contains(&site.model))
        else {
            continue;
        };
        let limit = catalog.gathering[site.recipe()].gather_limit;
        let depleted = in_village && village.forage_depleted(index, limit);
        if detail.depleted != depleted {
            let index = if depleted {
                FIRST_DEPLETED_FORAGE_MODEL + site.model - FIRST_FORAGE_MODEL
            } else {
                site.model
            };
            let path = AssetPath::from_path_buf(embedded_path!("land.glb")).with_source("embedded");
            scene.0 = assets.load(path.with_label(GltfAssetLabel::Scene(index).to_string()));
            detail.depleted = depleted;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn natural_sites_match_the_seed_42_reference() {
        let land = Land::generate(&WorldSetup::default());
        assert_eq!(land.sites.len(), 172);
        let sites: Vec<_> = land
            .sites
            .iter()
            .take(11)
            .map(|site| (site.model, site.position.x, site.position.y))
            .collect();
        assert_eq!(
            sites,
            [
                (EARTH, 12, -17),
                (EARTH, 10, -24),
                (EARTH, 11, 32),
                (EARTH, 12, -11),
                (STONE, 45, -26),
                (STONE, 75, -16),
                (STONE, 69, -17),
                (STONE, 76, -10),
                (1, -7, 17),
                (1, -13, 18),
                (2, -7, 11),
            ]
        );
    }

    #[test]
    fn landscape_motion_stops_while_the_window_is_occluded_or_setup_is_open() {
        let mut app = App::new();
        app.init_resource::<Time<Real>>()
            .init_resource::<WorldSetup>()
            .init_resource::<Village>()
            .init_resource::<LandscapeMotion>()
            .add_message::<WindowOccluded>()
            .add_systems(Update, advance_landscape_motion);
        let world = app.world_mut();
        world.resource_mut::<WorldSetup>().open = false;
        world
            .resource_mut::<Time<Real>>()
            .advance_by(std::time::Duration::from_millis(100));
        world.run_schedule(Update);
        assert_eq!(world.resource::<LandscapeMotion>().seconds, 0.1);

        let window = world.spawn(PrimaryWindow).id();
        world.write_message(WindowOccluded {
            window,
            occluded: true,
        });
        world.run_schedule(Update);
        assert_eq!(world.resource::<LandscapeMotion>().seconds, 0.1);

        world.write_message(WindowOccluded {
            window,
            occluded: false,
        });
        world.run_schedule(Update);
        assert_eq!(world.resource::<LandscapeMotion>().seconds, 0.2);

        world.resource_mut::<WorldSetup>().open = true;
        world.run_schedule(Update);
        assert_eq!(world.resource::<LandscapeMotion>().seconds, 0.2);
    }
}
