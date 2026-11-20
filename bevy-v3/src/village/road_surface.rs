use bevy::{
    asset::RenderAssetUsages,
    camera::{primitives::MeshAabb, visibility::VisibilitySystems},
    mesh::VertexAttributeValues,
    render::render_resource::PrimitiveTopology,
    scene::SceneInstanceReady,
    transform::TransformSystems,
};

use crate::terrain::Terrain;

use super::*;

#[derive(Component)]
pub(super) struct RoadSurface;

#[derive(Component)]
struct RoadMesh {
    original: Handle<Mesh>,
    root: Entity,
    previous: Option<((u64, u64, usize), GlobalTransform)>,
}

pub(super) fn install(app: &mut App) {
    app.add_observer(collect_road_meshes).add_systems(
        PostUpdate,
        fit_road_surfaces
            .after(TransformSystems::Propagate)
            .before(VisibilitySystems::CalculateBounds),
    );
}

fn collect_road_meshes(
    event: On<SceneInstanceReady>,
    mut commands: Commands,
    roads: Query<(), With<RoadSurface>>,
    descendants: Query<&Children>,
    meshes: Query<&Mesh3d>,
) {
    if !roads.contains(event.entity) {
        return;
    }
    for entity in descendants.iter_descendants(event.entity) {
        if let Ok(mesh) = meshes.get(entity) {
            commands.entity(entity).insert(RoadMesh {
                original: mesh.0.clone(),
                root: event.entity,
                previous: None,
            });
        }
    }
}

fn fit_road_surfaces(
    mut commands: Commands,
    village: Res<Village>,
    setup: Res<WorldSetup>,
    mut meshes: ResMut<Assets<Mesh>>,
    roads: Query<&GlobalTransform, With<RoadSurface>>,
    mut pieces: Query<(Entity, &GlobalTransform, &mut Mesh3d, &mut RoadMesh)>,
) {
    if setup.open || village.camp.is_none() {
        return;
    }
    let key = village.terrain_key();
    let terrain = village.terrain(&setup);
    for (entity, transform, mut mesh, mut piece) in &mut pieces {
        let state = (key, *transform);
        if piece.previous == Some(state) {
            continue;
        }
        let (Some(original), Ok(road)) = (meshes.get(&piece.original), roads.get(piece.root))
        else {
            continue;
        };
        piece.previous = Some(state);
        let origin = road.translation();
        let center_height = terrain.height_at(origin.x, origin.z);
        let Some(draped) = drape(original, *transform, center_height, &terrain) else {
            continue;
        };
        if let Some(bounds) = draped.compute_aabb() {
            commands.entity(entity).insert(bounds);
        }
        mesh.0 = meshes.add(draped);
    }
}

#[derive(Clone, Copy)]
struct Vertex {
    point: Vec3,
    uv: Vec2,
}

impl Vertex {
    fn interpolate(self, other: Self, t: f32) -> Self {
        Self {
            point: self.point.lerp(other.point, t),
            uv: self.uv.lerp(other.uv, t),
        }
    }
}

#[derive(Clone, Copy)]
enum Axis {
    X,
    Z,
    Diagonal,
}

impl Axis {
    fn coordinate(self, vertex: Vertex) -> f32 {
        match self {
            Self::X => vertex.point.x,
            Self::Z => vertex.point.z,
            Self::Diagonal => vertex.point.x + vertex.point.z,
        }
    }
}

fn clip(polygon: &[Vertex], axis: Axis, edge: f32, sign: f32) -> Vec<Vertex> {
    let mut result = Vec::with_capacity(polygon.len() + 1);
    for (&current, &next) in polygon.iter().zip(polygon.iter().cycle().skip(1)) {
        let a = axis.coordinate(current) - edge;
        let b = axis.coordinate(next) - edge;
        if a * sign >= 0.0 {
            result.push(current);
        }
        if a * b < 0.0 {
            result.push(current.interpolate(next, a / (a - b)));
        }
    }
    result
}

fn split_terrain_edges(triangle: [Vertex; 3]) -> Vec<Vec<Vertex>> {
    let mut polygons = vec![triangle.to_vec()];
    for axis in [Axis::X, Axis::Z, Axis::Diagonal] {
        let (min, max) = triangle
            .iter()
            .map(|v| axis.coordinate(*v))
            .fold((f32::INFINITY, f32::NEG_INFINITY), |(min, max), value| {
                (min.min(value), max.max(value))
            });
        // The ground uses 2 m quads and a diagonal at x + z = 2n.
        let mut edge = ((min * 0.5).floor() + 1.0) * 2.0;
        while edge < max - 1e-5 {
            let mut slices = Vec::new();
            for polygon in polygons {
                let crosses = |side: f32| {
                    polygon
                        .iter()
                        .any(|&v| side * (axis.coordinate(v) - edge) > 1e-5)
                };
                if crosses(1.0) && crosses(-1.0) {
                    slices.push(clip(&polygon, axis, edge, 1.0));
                    slices.push(clip(&polygon, axis, edge, -1.0));
                } else {
                    slices.push(polygon);
                }
            }
            polygons = slices;
            edge += 2.0;
        }
    }
    polygons
}

fn drape(
    mesh: &Mesh,
    transform: GlobalTransform,
    center_height: f32,
    terrain: &Terrain,
) -> Option<Mesh> {
    if mesh.primitive_topology() != PrimitiveTopology::TriangleList {
        return None;
    }
    let VertexAttributeValues::Float32x3(positions) = mesh.attribute(Mesh::ATTRIBUTE_POSITION)?
    else {
        return None;
    };
    let uvs = match mesh.attribute(Mesh::ATTRIBUTE_UV_0) {
        Some(VertexAttributeValues::Float32x2(values)) => Some(values),
        _ => None,
    };
    let indices: Vec<_> = mesh.indices().map_or_else(
        || (0..positions.len()).collect(),
        |indices| indices.iter().collect(),
    );
    let world = transform.affine();
    let local = world.inverse();
    let mut fitted = Vec::new();
    let mut fitted_uvs = Vec::new();
    for face in indices.as_chunks::<3>().0 {
        let triangle = std::array::from_fn(|corner| {
            let index = face[corner];
            Vertex {
                point: world.transform_point3(Vec3::from(positions[index])),
                uv: uvs.map_or(Vec2::ZERO, |uv| Vec2::from(uv[index])),
            }
        });
        for polygon in split_terrain_edges(triangle) {
            for pair in polygon[1..].windows(2) {
                for vertex in [polygon[0], pair[0], pair[1]] {
                    let mut point = vertex.point;
                    point.y += terrain.height_at(point.x, point.z) - center_height;
                    fitted.push(local.transform_point3(point).to_array());
                    fitted_uvs.push(vertex.uv.to_array());
                }
            }
        }
    }
    let mut surface = Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    )
    .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, fitted);
    if uvs.is_some() {
        surface.insert_attribute(Mesh::ATTRIBUTE_UV_0, fitted_uvs);
    }
    surface.compute_flat_normals();
    Some(surface)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::terrain::TerrainEditor;
    use bevy::mesh::Indices;

    #[test]
    fn an_indexed_tile_stays_above_every_triangle_of_edited_terrain() {
        let base = || Terrain::new(0, 1.0, 1.0);
        let mut editor = TerrainEditor::default();
        for _ in 0..8 {
            let terrain = editor.terrain(base());
            editor.stroke(&terrain, Vec3::new(40.0, 0.0, 24.0), |_| false);
        }
        let terrain = editor.terrain(base());
        let mesh = Mesh::new(
            PrimitiveTopology::TriangleList,
            RenderAssetUsages::default(),
        )
        .with_inserted_indices(Indices::U16(vec![0, 1, 2, 0, 2, 3]))
        .with_inserted_attribute(
            Mesh::ATTRIBUTE_POSITION,
            vec![
                [-1.0, 0.04, -1.0],
                [-1.0, 0.04, 1.0],
                [1.0, 0.04, 1.0],
                [1.0, 0.04, -1.0],
            ],
        )
        .with_inserted_attribute(
            Mesh::ATTRIBUTE_UV_0,
            vec![[0.0, 0.0], [0.0, 1.0], [1.0, 1.0], [1.0, 0.0]],
        );
        let height = terrain.height_at(40.0, 24.0);
        let transform = GlobalTransform::from(
            Transform::from_xyz(40.0, height, 24.0)
                .with_rotation(Quat::from_rotation_y(std::f32::consts::FRAC_PI_2)),
        );
        let road = drape(&mesh, transform, height, &terrain).unwrap();
        let VertexAttributeValues::Float32x3(positions) =
            road.attribute(Mesh::ATTRIBUTE_POSITION).unwrap()
        else {
            panic!("fitted road is missing positions");
        };
        let VertexAttributeValues::Float32x2(uvs) = road.attribute(Mesh::ATTRIBUTE_UV_0).unwrap()
        else {
            panic!("fitted road is missing UV coordinates");
        };
        assert_eq!(positions.len(), uvs.len());
        assert!(positions.len() > 6);
        for triangle in positions.as_chunks::<3>().0 {
            let center = triangle
                .iter()
                .map(|&point| transform.transform_point(Vec3::from(point)))
                .sum::<Vec3>()
                / 3.0;
            let offset = center.y - terrain.height_at(center.x, center.z);
            assert!(
                (offset - 0.04).abs() < 1e-5,
                "unexpected surface clearance: {offset}"
            );
        }
        for (point, uv) in positions.iter().zip(uvs) {
            assert!((point[0] * 0.5 + 0.5 - uv[0]).abs() < 1e-5);
            assert!((point[2] * 0.5 + 0.5 - uv[1]).abs() < 1e-5);
        }
    }
}
