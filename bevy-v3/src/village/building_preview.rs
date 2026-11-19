use bevy::{
    asset::RenderAssetUsages,
    light::NotShadowCaster,
    mesh::{Indices, PrimitiveTopology, VertexAttributeValues},
    scene::SceneInstanceReady,
};
use std::collections::HashMap;

use super::*;

#[derive(Component)]
struct BuildingPreview(usize);

#[derive(Component)]
struct PreviewEdge;

#[derive(Resource)]
struct PreviewMaterials {
    available: Handle<StandardMaterial>,
    blocked: Handle<StandardMaterial>,
}

pub(super) fn install(app: &mut App) {
    app.add_systems(Startup, create_materials)
        .add_observer(outline_preview)
        .add_systems(
            Update,
            (show_preview, tint_preview).chain().after(draw_blueprints),
        );
}

fn create_materials(mut commands: Commands, mut assets: ResMut<Assets<StandardMaterial>>) {
    let mut material = |base_color| {
        assets.add(StandardMaterial {
            base_color,
            unlit: true,
            alpha_mode: AlphaMode::Blend,
            ..default()
        })
    };
    commands.insert_resource(PreviewMaterials {
        available: material(Color::srgba_u8(217, 237, 165, 217)),
        blocked: material(Color::srgba_u8(232, 135, 103, 217)),
    });
}

fn show_preview(
    mut commands: Commands,
    (setup, village, pointer, catalog): (
        Res<WorldSetup>,
        Res<Village>,
        Res<CampPointer>,
        Res<Catalog>,
    ),
    (assets, notice): (Res<AssetServer>, Res<MapNotice>),
    mut current: Query<(Entity, &BuildingPreview, &mut Transform)>,
) {
    let preview = pointer
        .hovered
        .filter(|_| !setup.open && village.camp.is_some() && notice.1.is_some())
        .and_then(|hit| {
            let terrain = village.terrain(&setup);
            village
                .construction
                .preview_model(&catalog, &terrain, hit.cell)
        });
    if let Ok((entity, shown, mut transform)) = current.single_mut() {
        if let Some((model, pose)) = &preview
            && shown.0 == *model
        {
            transform.set_if_neq(*pose);
            return;
        }
        commands.entity(entity).despawn();
    }
    if let Some((model, pose)) = preview {
        commands.spawn((
            BuildingPreview(model),
            Name::new("Building placement preview"),
            building_model(&assets, model),
            pose,
        ));
    }
}

fn tint_preview(
    notice: Res<MapNotice>,
    materials: Res<PreviewMaterials>,
    mut edges: Query<&mut MeshMaterial3d<StandardMaterial>, With<PreviewEdge>>,
) {
    let handle = if notice.1 == Some(false) {
        &materials.blocked
    } else {
        &materials.available
    };
    for mut material in &mut edges {
        if material.0 != *handle {
            material.0 = handle.clone();
        }
    }
}

fn outline_preview(
    event: On<SceneInstanceReady>,
    mut commands: Commands,
    previews: Query<(), With<BuildingPreview>>,
    descendants: Query<&Children>,
    model_meshes: Query<&Mesh3d>,
    (mut meshes, materials): (ResMut<Assets<Mesh>>, Res<PreviewMaterials>),
    mut cache: Local<HashMap<AssetId<Mesh>, Handle<Mesh>>>,
) {
    if !previews.contains(event.entity) {
        return;
    }
    for entity in descendants.iter_descendants(event.entity) {
        let Ok(original) = model_meshes.get(entity) else {
            continue;
        };
        let handle = if let Some(handle) = cache.get(&original.id()) {
            handle.clone()
        } else {
            let Some(outline) = meshes.get(original.id()).and_then(outline_mesh) else {
                commands
                    .entity(entity)
                    .remove::<(Mesh3d, MeshMaterial3d<StandardMaterial>)>();
                continue;
            };
            let handle = meshes.add(outline);
            cache.insert(original.id(), handle.clone());
            handle
        };
        commands.entity(entity).insert((
            Mesh3d(handle),
            MeshMaterial3d(materials.available.clone()),
            PreviewEdge,
            NotShadowCaster,
        ));
    }
}

struct Edge {
    indices: [u32; 2],
    normal: Vec3,
    faces: u32,
    sharp: bool,
}

fn outline_mesh(source: &Mesh) -> Option<Mesh> {
    if source.primitive_topology() != PrimitiveTopology::TriangleList {
        return None;
    }
    let VertexAttributeValues::Float32x3(positions) = source.attribute(Mesh::ATTRIBUTE_POSITION)?
    else {
        return None;
    };
    // Exported material batches duplicate vertices at UV seams and face normals.
    // Weld endpoints for edge comparison, while retaining the source vertex indices.
    let keys: Vec<_> = positions
        .iter()
        .map(|&point| (Vec3::from(point) * 10_000.).round().as_ivec3().to_array())
        .collect();
    let indices: Vec<_> = source.indices().map_or_else(
        || (0..positions.len()).collect(),
        |indices| indices.iter().collect(),
    );
    let mut edges = HashMap::<([i32; 3], [i32; 3]), Edge>::new();
    let threshold = 18_f32.to_radians().cos();
    for &[a, b, c] in indices.as_chunks::<3>().0 {
        let [p, q, r] = [a, b, c].map(|i| Vec3::from(positions[i]));
        let Some(normal) = (q - p).cross(r - p).try_normalize() else {
            continue;
        };
        for (i, j) in [(a, b), (b, c), (c, a)] {
            let [start, end] = [keys[i], keys[j]];
            if start == end {
                continue;
            }
            let key = (start.min(end), start.max(end));
            let edge = edges.entry(key).or_insert(Edge {
                indices: [i as u32, j as u32],
                normal,
                faces: 0,
                sharp: false,
            });
            edge.faces += 1;
            edge.sharp |= edge.normal.dot(normal) <= threshold;
        }
    }
    let outline: Vec<_> = edges
        .into_values()
        .filter(|edge| edge.faces == 1 || edge.sharp)
        .flat_map(|edge| edge.indices)
        .collect();
    Some(
        Mesh::new(PrimitiveTopology::LineList, RenderAssetUsages::default())
            .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, positions.clone())
            .with_inserted_indices(Indices::U32(outline)),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn outline_omits_coplanar_diagonals_even_at_split_vertices() {
        let source = Mesh::new(
            PrimitiveTopology::TriangleList,
            RenderAssetUsages::default(),
        )
        .with_inserted_attribute(
            Mesh::ATTRIBUTE_POSITION,
            vec![
                [0., 0., 0.],
                [1., 0., 0.],
                [1., 1., 0.],
                [0., 0., 0.],
                [1., 1., 0.],
                [0., 1., 0.],
            ],
        );
        let wire = outline_mesh(&source).unwrap();
        assert_eq!(wire.indices().unwrap().len(), 8);
    }
}
