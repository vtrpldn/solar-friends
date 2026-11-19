#import bevy_pbr::{mesh_functions, view_transformations::position_world_to_clip}
#ifdef PREPASS_PIPELINE
#import bevy_pbr::prepass_io::{Vertex, VertexOutput}
#else
#import bevy_pbr::forward_io::{Vertex, VertexOutput}
#endif

@group(#{MATERIAL_BIND_GROUP}) @binding(100) var<uniform> wind_time: f32;

fn wind_position(position: vec3<f32>, model: mat4x4<f32>, seconds: f32) -> vec4<f32> {
    let phase = dot(model[3].xz, vec2<f32>(0.14, 0.09));
    let gust = 0.65 + 0.35 * sin(seconds * 0.37 + phase * 0.6);
    let sway = sin(seconds * 1.25 + phase) * 0.10
        + sin(seconds * 2.1 + phase * 1.7) * 0.025;
    let height_weight = smoothstep(0.6, 4.5, position.y);
    var displaced = position;
    displaced.x += height_weight * sway * gust;
    displaced.z += height_weight * sin(seconds * 1.05 + phase + 0.8) * 0.055 * gust;
    return mesh_functions::mesh_position_local_to_world(model, vec4<f32>(displaced, 1.0));
}

@vertex
fn vertex(input: Vertex) -> VertexOutput {
    var out: VertexOutput;
    let model = mesh_functions::get_world_from_local(input.instance_index);
    out.world_position = wind_position(input.position, model, wind_time);
    out.position = position_world_to_clip(out.world_position.xyz);

#ifdef UNCLIPPED_DEPTH_ORTHO_EMULATION
    out.unclipped_depth = out.position.z;
    out.position.z = min(out.position.z, 1.0);
#endif
#ifdef VERTEX_UVS_A
    out.uv = input.uv;
#endif
#ifdef VERTEX_UVS_B
    out.uv_b = input.uv_b;
#endif
#ifdef PREPASS_PIPELINE
#ifdef NORMAL_PREPASS_OR_DEFERRED_PREPASS
#define TREE_NORMALS
#endif
#else
#define TREE_NORMALS
#endif
#ifdef TREE_NORMALS
#ifdef VERTEX_NORMALS
    out.world_normal = mesh_functions::mesh_normal_local_to_world(input.normal, input.instance_index);
#endif
#ifdef VERTEX_TANGENTS
    out.world_tangent = mesh_functions::mesh_tangent_local_to_world(model, input.tangent, input.instance_index);
#endif
#endif
#ifdef VERTEX_COLORS
    out.color = input.color;
#endif
#ifdef MOTION_VECTOR_PREPASS
    let previous_model = mesh_functions::get_previous_world_from_local(input.instance_index);
    out.previous_world_position = wind_position(input.position, previous_model, wind_time);
#endif
#ifdef VERTEX_OUTPUT_INSTANCE_INDEX
    out.instance_index = input.instance_index;
#endif
#ifdef VISIBILITY_RANGE_DITHER
    out.visibility_range_dither = mesh_functions::get_visibility_range_dither_level(input.instance_index, model[3]);
#endif
    return out;
}
