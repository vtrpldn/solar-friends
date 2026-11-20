use std::collections::HashMap;

use bevy::{
    asset::{embedded_asset, embedded_path},
    camera::primitives::{Aabb, MeshAabb},
    pbr::{ExtendedMaterial, MaterialExtension, MaterialPlugin},
    prelude::*,
    render::{
        Render, RenderApp, RenderSystems,
        extract_resource::{ExtractResource, ExtractResourcePlugin},
        render_asset::RenderAssets,
        render_resource::{AsBindGroup, BufferUsages},
        renderer::RenderQueue,
        storage::{GpuShaderStorageBuffer, ShaderStorageBuffer},
    },
    scene::SceneInstanceReady,
    shader::ShaderRef,
};

use super::LandscapeMotion;

type WindMaterial = ExtendedMaterial<StandardMaterial, Wind>;

#[derive(Resource, Default)]
pub(super) struct WindMaterials(HashMap<AssetId<StandardMaterial>, Handle<WindMaterial>>);

#[derive(Resource, Clone, ExtractResource)]
pub(super) struct WindClock {
    buffer: Handle<ShaderStorageBuffer>,
    seconds: f32,
}

impl FromWorld for WindClock {
    fn from_world(world: &mut World) -> Self {
        let mut buffer = ShaderStorageBuffer::from(0.0_f32);
        buffer.buffer_description.usage |= BufferUsages::COPY_DST;
        buffer.buffer_description.label = Some("Tree wind time");
        Self {
            buffer: world
                .resource_mut::<Assets<ShaderStorageBuffer>>()
                .add(buffer),
            seconds: 0.0,
        }
    }
}

#[derive(Asset, AsBindGroup, Clone, Reflect)]
pub(super) struct Wind {
    #[storage(100, read_only, visibility(vertex))]
    clock: Handle<ShaderStorageBuffer>,
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
    if !app
        .world()
        .contains_resource::<Assets<ShaderStorageBuffer>>()
    {
        app.init_asset::<ShaderStorageBuffer>();
    }
    app.add_plugins((
        MaterialPlugin::<WindMaterial>::default(),
        ExtractResourcePlugin::<WindClock>::default(),
    ))
    .init_resource::<WindMaterials>()
    .init_resource::<WindClock>();
    if let Some(render) = app.get_sub_app_mut(RenderApp) {
        render.add_systems(Render, upload_clock.in_set(RenderSystems::PrepareResources));
    }
}

pub(super) fn apply(
    event: On<SceneInstanceReady>,
    mut commands: Commands,
    descendants: Query<&Children>,
    models: Query<(&Mesh3d, &MeshMaterial3d<StandardMaterial>, Option<&Aabb>)>,
    (meshes, materials): (Res<Assets<Mesh>>, Res<Assets<StandardMaterial>>),
    mut wind_materials: ResMut<Assets<WindMaterial>>,
    (mut cache, clock): (ResMut<WindMaterials>, Res<WindClock>),
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
                    clock: clock.buffer.clone(),
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

pub(super) fn update(motion: Res<LandscapeMotion>, mut clock: ResMut<WindClock>) {
    let seconds = motion.seconds as f32;
    if clock.seconds != seconds {
        clock.seconds = seconds;
    }
}

fn upload_clock(
    clock: Res<WindClock>,
    buffers: Res<RenderAssets<GpuShaderStorageBuffer>>,
    queue: Res<RenderQueue>,
    mut uploaded: Local<Option<f32>>,
) {
    if *uploaded != Some(clock.seconds)
        && let Some(buffer) = buffers.get(&clock.buffer)
    {
        queue.write_buffer(&buffer.buffer, 0, &clock.seconds.to_le_bytes());
        *uploaded = Some(clock.seconds);
    }
}
