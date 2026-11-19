use std::collections::HashMap;

use bevy::{
    asset::{embedded_asset, embedded_path},
    camera::primitives::{Aabb, MeshAabb},
    pbr::{ExtendedMaterial, MaterialExtension, MaterialPlugin},
    prelude::*,
    render::render_resource::AsBindGroup,
    scene::SceneInstanceReady,
    shader::ShaderRef,
};

use super::LandscapeMotion;

type WindMaterial = ExtendedMaterial<StandardMaterial, Wind>;

#[derive(Resource, Default)]
pub(super) struct WindMaterials(HashMap<AssetId<StandardMaterial>, Handle<WindMaterial>>);

#[derive(Asset, AsBindGroup, Clone, Reflect)]
pub(super) struct Wind {
    #[uniform(100)]
    seconds: f32,
}

impl MaterialExtension for Wind {
    fn vertex_shader() -> ShaderRef {
        let path = embedded_path!("tree_wind.wgsl");
        bevy::asset::AssetPath::from_path_buf(path)
            .with_source("embedded")
            .into()
    }

    fn prepass_vertex_shader() -> ShaderRef {
        Self::vertex_shader()
    }

    fn deferred_vertex_shader() -> ShaderRef {
        Self::vertex_shader()
    }
}

pub(super) fn install(app: &mut App) {
    embedded_asset!(app, "tree_wind.wgsl");
    app.add_plugins(MaterialPlugin::<WindMaterial>::default())
        .init_resource::<WindMaterials>();
}

pub(super) fn apply(
    event: On<SceneInstanceReady>,
    mut commands: Commands,
    descendants: Query<&Children>,
    models: Query<(&Mesh3d, &MeshMaterial3d<StandardMaterial>, Option<&Aabb>)>,
    (meshes, materials): (Res<Assets<Mesh>>, Res<Assets<StandardMaterial>>),
    mut wind_materials: ResMut<Assets<WindMaterial>>,
    (mut cache, motion): (ResMut<WindMaterials>, Res<LandscapeMotion>),
) {
    for entity in descendants.iter_descendants(event.entity) {
        let Ok((mesh, original, bounds)) = models.get(entity) else {
            continue;
        };
        let Some(base) = materials.get(&original.0) else {
            continue;
        };
        let handle = cache.0.entry(original.0.id()).or_insert_with(|| {
            wind_materials.add(WindMaterial {
                base: base.clone(),
                extension: Wind {
                    seconds: motion.seconds as f32,
                },
            })
        });
        let mut model = commands.entity(entity);
        model.remove::<MeshMaterial3d<StandardMaterial>>();
        model.insert(MeshMaterial3d(handle.clone()));
        if let Some(mut expanded) = bounds
            .copied()
            .or_else(|| meshes.get(&mesh.0).and_then(MeshAabb::compute_aabb))
        {
            expanded.half_extents.x += 0.2;
            expanded.half_extents.z += 0.2;
            model.insert(expanded);
        }
    }
}

pub(super) fn update(motion: Res<LandscapeMotion>, mut materials: ResMut<Assets<WindMaterial>>) {
    if motion.is_changed() {
        for (_, material) in materials.iter_mut() {
            material.extension.seconds = motion.seconds as f32;
        }
    }
}
