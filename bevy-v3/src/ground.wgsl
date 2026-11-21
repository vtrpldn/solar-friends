// V2's land surface over the painted Tarsila fields: damp earth along the river, rock on steep
// slopes and worn ground around buildings, trees and natural deposits. The fields themselves
// arrive as vertex colours in the base colour.
#import bevy_pbr::{
    pbr_fragment::pbr_input_from_standard_material,
    pbr_functions::alpha_discard,
}
#ifdef PREPASS_PIPELINE
#import bevy_pbr::{
    prepass_io::{VertexOutput, FragmentOutput},
    pbr_deferred_functions::deferred_output,
}
#else
#import bevy_pbr::{
    forward_io::{VertexOutput, FragmentOutput},
    pbr_functions::{apply_pbr_lighting, main_pass_post_lighting_processing},
}
#endif

struct GroundSurface {
    soil: vec4<f32>,
    rock: vec4<f32>,
    seed: f32,
    half_width: f32,
}

@group(#{MATERIAL_BIND_GROUP}) @binding(100) var<uniform> surface: GroundSurface;
@group(#{MATERIAL_BIND_GROUP}) @binding(101) var habitat_texture: texture_2d<f32>;
@group(#{MATERIAL_BIND_GROUP}) @binding(102) var habitat_sampler: sampler;

fn land_hash(p: vec2<f32>) -> f32 {
    return fract(sin(dot(p, vec2<f32>(127.1, 311.7)) + surface.seed) * 43758.5453);
}

fn land_noise(p: vec2<f32>) -> f32 {
    let i = floor(p);
    var f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(land_hash(i), land_hash(i + vec2<f32>(1.0, 0.0)), f.x),
        mix(land_hash(i + vec2<f32>(0.0, 1.0)), land_hash(i + vec2<f32>(1.0, 1.0)), f.x),
        f.y,
    );
}

@fragment
fn fragment(in: VertexOutput, @builtin(front_facing) is_front: bool) -> FragmentOutput {
    var pbr_input = pbr_input_from_standard_material(in, is_front);

    let p = in.world_position.xz;
    let broad = land_noise(p * 0.055);
    let mottle = land_noise(p * 0.19 + vec2<f32>(broad * 2.0));
    let fine = land_noise(p * 1.7);
    let habitat = textureSample(
        habitat_texture,
        habitat_sampler,
        (p + surface.half_width) / (surface.half_width * 2.0),
    );
#ifdef VERTEX_UVS_A
    let bank = in.uv.x;
#else
    let bank = 100.0;
#endif
    let damp = 1.0 - smoothstep(2.0, 13.0, bank);
    // Keep the flat painted fields; only a faint mottle so large ones don't read as plastic.
    var turf = pbr_input.material.base_color.rgb * (0.96 + mottle * 0.08);
    let shore = (1.0 - smoothstep(0.0, 4.0, bank)) * (0.65 + mottle * 0.35);
    let soil = max(shore, habitat.b) * (0.75 + mottle * 0.25);
    turf = mix(turf, surface.soil.rgb, soil * 0.75);
    // Woodland floor: a deeper shade of the field rather than V2's brown litter.
    turf *= 1.0 - habitat.g * 0.18;
    let slope = 1.0 - clamp(normalize(in.world_normal).y, 0.0, 1.0);
    let rock = max(habitat.a * 0.8, smoothstep(0.06, 0.24, slope) * (0.5 + mottle * 0.5));
    turf = mix(turf, surface.rock.rgb, rock);
    // Fade tiny grain at distant zooms to prevent shimmering; the painted pass adds its own.
    let grain = 1.0 - smoothstep(0.15, 0.8, length(fwidth(p)));
    turf *= 1.0 + (fine - 0.5) * 0.05 * grain;
    turf *= 1.0 - habitat.r * 0.2 - damp * 0.06;
    pbr_input.material.base_color = vec4<f32>(turf, 1.0);
    pbr_input.material.base_color = alpha_discard(pbr_input.material, pbr_input.material.base_color);

#ifdef PREPASS_PIPELINE
    let out = deferred_output(in, pbr_input);
#else
    var out: FragmentOutput;
    out.color = apply_pbr_lighting(pbr_input);
    out.color = main_pass_post_lighting_processing(pbr_input, out.color);
#endif
    return out;
}
