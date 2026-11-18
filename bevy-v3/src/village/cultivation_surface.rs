use std::collections::HashMap;

use bevy::{
    asset::RenderAssetUsages, camera::primitives::MeshAabb, mesh::Indices,
    render::render_resource::PrimitiveTopology,
};

use crate::farming::{Bed, Crop, FarmAction, FarmPhase, Stage};

use super::*;

#[derive(Clone, PartialEq)]
struct BedState {
    pose: Transform,
    terrain: (u64, u64, usize),
    offset: Vec2,
    dimensions: Vec2,
    crop: Crop,
    stage: Stage,
    density: f64,
    growth: u8,
    damp: bool,
    stressed: bool,
    work: Option<(FarmAction, u8)>,
}

#[derive(Component)]
pub(super) struct BedSurface {
    root: Entity,
    index: usize,
    state: BedState,
}

pub(super) fn show_beds(
    mut commands: Commands,
    setup: Res<WorldSetup>,
    village: Res<Village>,
    (mut meshes, mut materials): (ResMut<Assets<Mesh>>, ResMut<Assets<StandardMaterial>>),
    mut material: Local<Option<Handle<StandardMaterial>>>,
    roots: Query<(Entity, &BuiltProject, &Transform)>,
    mut beds: Query<(Entity, &mut BedSurface, &mut Mesh3d)>,
) {
    if setup.open || !village.is_changed() {
        return;
    }
    let terrain = village.terrain(&setup);
    let farming = &village.construction.farming;
    let jobs: HashMap<_, _> = farming
        .jobs
        .iter()
        .filter(|job| job.phase != FarmPhase::Return)
        .map(|job| {
            (
                (job.site, job.bed),
                (job.action, (job.work / job.required * 10.0) as u8),
            )
        })
        .collect();
    let mut existing: HashMap<_, _> = beds
        .iter()
        .map(|(entity, bed, _)| ((bed.root, bed.index), entity))
        .collect();
    for (entity, project, pose) in &roots {
        let Some(plot) = farming.plots.get(&project.index) else {
            continue;
        };
        for (index, bed) in plot.beds.iter().enumerate() {
            let state = BedState {
                pose: *pose,
                terrain: village.terrain_key(),
                offset: bed.offset,
                dimensions: bed.dimensions,
                crop: bed.crop,
                stage: bed.stage,
                density: bed.density,
                growth: (bed.growth * 20.0) as u8,
                damp: bed.moisture > 0.4,
                stressed: bed.visual_health(village.clock) < 0.4,
                work: jobs.get(&(project.index, index)).copied(),
            };
            let mesh = |state: &BedState| {
                let sample = |point: Vec2| {
                    let world = pose.transform_point(Vec3::new(point.x, 0.0, point.y));
                    terrain.height_at(world.x, world.z) - pose.translation.y
                };
                bed_mesh(
                    bed,
                    state,
                    sample,
                    project.index as f32 * 97.0 + index as f32 * 13.0,
                )
            };
            if let Some(old) = existing.remove(&(entity, index)) {
                let (_, mut view, mut handle) = beds.get_mut(old).expect("bed mesh");
                if view.state != state {
                    let updated = mesh(&state);
                    if let Some(bounds) = updated.compute_aabb() {
                        commands.entity(old).insert(bounds);
                    }
                    handle.0 = meshes.add(updated);
                    view.state = state;
                }
            } else {
                let mesh = mesh(&state);
                let material = material.get_or_insert_with(|| {
                    materials.add(StandardMaterial {
                        perceptual_roughness: 0.9,
                        cull_mode: None,
                        ..default()
                    })
                });
                commands.spawn((
                    BedSurface {
                        root: entity,
                        index,
                        state,
                    },
                    Mesh3d(meshes.add(mesh)),
                    MeshMaterial3d(material.clone()),
                    Transform::default(),
                    ChildOf(entity),
                ));
            }
        }
    }
    for (_, entity) in existing {
        commands.entity(entity).try_despawn();
    }
}

#[derive(Default)]
struct Geometry {
    positions: Vec<[f32; 3]>,
    colors: Vec<[f32; 4]>,
    indices: Vec<u32>,
}

impl Geometry {
    fn quad(&mut self, points: [Vec3; 4], rgb: [u8; 3]) {
        let index = self.positions.len() as u32;
        self.positions.extend(points.map(|point| point.to_array()));
        let color = Color::srgb_u8(rgb[0], rgb[1], rgb[2])
            .to_linear()
            .to_f32_array();
        self.colors.extend([color; 4]);
        self.indices
            .extend([index, index + 1, index + 2, index, index + 2, index + 3]);
    }

    fn finish(self) -> Mesh {
        let mut mesh = Mesh::new(
            PrimitiveTopology::TriangleList,
            RenderAssetUsages::default(),
        )
        .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, self.positions)
        .with_inserted_attribute(Mesh::ATTRIBUTE_COLOR, self.colors)
        .with_inserted_indices(Indices::U32(self.indices));
        mesh.compute_normals();
        mesh
    }
}

fn bed_mesh(bed: &Bed, state: &BedState, ground: impl Fn(Vec2) -> f32, seed: f32) -> Mesh {
    let mut mesh = Geometry::default();
    let Vec2 { x: width, y: depth } = bed.dimensions;
    let action_fraction = |action| {
        state
            .work
            .filter(|&(kind, _)| kind == action)
            .map_or(0.0, |(_, work)| f32::from(work) / 10.0)
    };
    let strip = |mesh: &mut Geometry, x: f32, w: f32, start: f32, end: f32, height: f32, color| {
        let xf = [x - w * 0.5, x + w * 0.5];
        let point = |x, z| {
            let at = bed.offset + Vec2::new(x, z);
            Vec3::new(at.x, ground(at) + height, at.y)
        };
        mesh.quad(
            [
                point(xf[0], start),
                point(xf[0], end),
                point(xf[1], end),
                point(xf[1], start),
            ],
            color,
        );
    };
    let damp = if state.damp {
        [87, 65, 45]
    } else {
        [148, 112, 71]
    };
    let sections = (depth * 4.0).ceil() as u32;
    for row in 0..sections {
        let start = -depth * 0.5 + depth * row as f32 / sections as f32;
        let end = -depth * 0.5 + depth * (row + 1) as f32 / sections as f32;
        let prepared = state.stage != Stage::Unprepared
            || (row as f32 / sections as f32) < action_fraction(FarmAction::Prepare);
        strip(
            &mut mesh,
            0.0,
            width,
            start,
            end,
            0.06,
            if prepared { damp } else { [113, 132, 74] },
        );
        if prepared {
            for x in [-0.36, 0.0, 0.36] {
                strip(
                    &mut mesh,
                    x,
                    0.17,
                    start,
                    end,
                    0.095,
                    if state.damp {
                        [104, 80, 57]
                    } else {
                        [161, 124, 80]
                    },
                );
            }
        }
    }

    let planting = action_fraction(FarmAction::Plant);
    if matches!(
        state.stage,
        Stage::Growing | Stage::Harvestable | Stage::Failed
    ) || planting > 0.0
    {
        let harvest = action_fraction(FarmAction::Harvest).max(action_fraction(FarmAction::Clear));
        let (density, height, color, radius) = match state.crop {
            Crop::Greens => (12.0, 0.28, [103, 155, 66], 0.16),
            Crop::Beans => (8.0, 0.65, [78, 132, 61], 0.16),
            Crop::Corn => (4.0, 2.0, [113, 140, 59], 0.37),
        };
        let spacing = 1.0 / (density * state.density as f32).sqrt();
        let growth = (f32::from(state.growth) / 20.0).max(0.1);
        let mut number = 0;
        let mut x = (-width + spacing) * 0.5;
        while x < width * 0.5 {
            let mut z = (-depth + spacing) * 0.5;
            while z < depth * 0.5 {
                let fraction = z / depth + 0.5;
                if fraction >= harvest && (planting == 0.0 || fraction <= planting) {
                    let at =
                        bed.offset + Vec2::new(x + (seed + number as f32 * 31.0).sin() * 0.04, z);
                    let position = Vec3::new(at.x, ground(at) + 0.09, at.y);
                    let flora = if state.stressed || state.stage == Stage::Failed {
                        [162, 155, 75]
                    } else {
                        color
                    };
                    plant(
                        &mut mesh,
                        position,
                        (height * growth, radius * growth),
                        number as f32 * 2.399,
                        state.crop,
                        flora,
                    );
                    number += 1;
                }
                z += spacing;
            }
            x += spacing;
        }
    } else if state.stage == Stage::Harvested {
        for z in 0..(depth * 2.5) as usize {
            let at = bed.offset + Vec2::new(0.0, z as f32 * 0.4 - depth * 0.5 + 0.2);
            stem(
                &mut mesh,
                Vec3::new(at.x, ground(at) + 0.08, at.y),
                0.12,
                0.03,
                [164, 145, 85],
            );
        }
    }
    mesh.finish()
}

fn stem(mesh: &mut Geometry, base: Vec3, height: f32, radius: f32, color: [u8; 3]) {
    for axis in [Vec3::X, Vec3::Z] {
        let width = axis * radius;
        let top = Vec3::Y * height;
        mesh.quad(
            [
                base - width,
                base + width,
                base + width + top,
                base - width + top,
            ],
            color,
        );
    }
}

fn plant(
    mesh: &mut Geometry,
    base: Vec3,
    (height, radius): (f32, f32),
    angle: f32,
    crop: Crop,
    color: [u8; 3],
) {
    if crop != Crop::Greens {
        stem(
            mesh,
            base,
            height,
            radius * 0.08,
            if crop == Crop::Corn {
                [154, 166, 92]
            } else {
                [100, 131, 71]
            },
        );
    }
    let full_height = if crop == Crop::Corn { 2.0 } else { 0.65 };
    let emergence = ((height / full_height - 0.65) / 0.25).clamp(0.0, 1.0);
    if crop != Crop::Greens && emergence > 0.0 {
        let color = if crop == Crop::Corn {
            [196, 181, 104]
        } else {
            [150, 172, 83]
        };
        let direction = Vec2::from_angle(angle);
        for side in [-1.0, 1.0] {
            let at = base
                + Vec3::new(
                    direction.x * radius * 0.45 * side,
                    height * (0.64 + side * 0.06),
                    direction.y * radius * 0.45 * side,
                );
            stem(
                mesh,
                at,
                full_height * 0.08 * emergence,
                radius * 0.19 * emergence,
                color,
            );
        }
    }
    for part in 0..7 {
        let direction = Vec2::from_angle(angle + part as f32 * 2.399);
        let along = Vec3::new(direction.x, 0.0, direction.y);
        let across = Vec3::new(-direction.y, 0.0, direction.x)
            * radius
            * if crop == Crop::Corn { 0.16 } else { 0.5 };
        let level = if crop == Crop::Greens {
            if part < 5 { 0.24 } else { 0.58 }
        } else {
            0.2 + part as f32 * 0.095
        };
        let root = base + Vec3::Y * (height * level);
        let center = root + along * (radius * 0.7) + Vec3::Y * radius * 0.28;
        let tip = root + along * (radius * 1.45) + Vec3::Y * radius * 0.48;
        mesh.quad([root, center + across, tip, center - across], color);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::farming::Plot;

    #[test]
    fn prepared_beds_follow_the_ground_and_mature_corn_adds_crop_geometry() {
        let mut plot = Plot::new("field", IVec2::splat(2)).unwrap();
        let bed = &mut plot.beds[0];
        bed.stage = Stage::Prepared;
        let mut state = BedState {
            pose: Transform::default(),
            terrain: (0, 0, 0),
            offset: bed.offset,
            dimensions: bed.dimensions,
            crop: Crop::Corn,
            stage: bed.stage,
            density: bed.density,
            growth: 0,
            damp: true,
            stressed: false,
            work: None,
        };
        let slope = |point: Vec2| point.x * 0.17 + point.y * 0.4;
        let prepared = bed_mesh(bed, &state, slope, 0.0);
        let read = |mesh: &Mesh| match mesh.attribute(Mesh::ATTRIBUTE_POSITION).unwrap() {
            bevy::mesh::VertexAttributeValues::Float32x3(values) => values.clone(),
            _ => panic!("expected position triples"),
        };
        let prepared_vertices = read(&prepared);
        assert!(prepared_vertices.iter().all(|&[x, y, z]| {
            let height = y - slope(Vec2::new(x, z));
            (0.059..=0.096).contains(&height)
        }));
        state.stage = Stage::Harvestable;
        state.growth = 20;
        let ripe = read(&bed_mesh(bed, &state, slope, 0.0));
        assert!(ripe.len() > prepared_vertices.len());
        assert!(
            ripe.iter()
                .any(|&[x, y, z]| y - slope(Vec2::new(x, z)) > 1.9)
        );
        state.work = Some((FarmAction::Harvest, 10));
        assert_eq!(
            bed_mesh(bed, &state, slope, 0.0).count_vertices(),
            prepared_vertices.len()
        );
    }
}
