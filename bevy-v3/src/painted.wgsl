// Painted finish for the village view: a small Kuwahara filter flattens low-poly facets into
// patches of paint, then a gentle saturation lift and canvas grain.
#import bevy_core_pipeline::fullscreen_vertex_shader::FullscreenVertexOutput

struct Painted {
    radius: f32,
    saturation: f32,
    grain: f32,
    _padding: f32,
}

@group(0) @binding(0) var screen_texture: texture_2d<f32>;
@group(0) @binding(1) var screen_sampler: sampler;
@group(0) @binding(2) var<uniform> settings: Painted;

fn hash(p: vec2<f32>) -> f32 {
    var q = fract(p * vec2<f32>(123.34, 456.21));
    q += dot(q, q + 45.32);
    return fract(q.x * q.y);
}

fn value_noise(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash(i), hash(i + vec2<f32>(1.0, 0.0)), u.x),
        mix(hash(i + vec2<f32>(0.0, 1.0)), hash(i + vec2<f32>(1.0, 1.0)), u.x),
        u.y,
    );
}

fn sample_at(uv: vec2<f32>) -> vec3<f32> {
    return textureSampleLevel(screen_texture, screen_sampler, uv, 0.0).rgb;
}

@fragment
fn fragment(in: FullscreenVertexOutput) -> @location(0) vec4<f32> {
    let size = vec2<f32>(textureDimensions(screen_texture));
    let texel = 1.0 / size;
    let r = i32(settings.radius);
    var colour = sample_at(in.uv);
    if r > 0 {
        // Four overlapping quadrants; keep the mean of the calmest one.
        var means = array<vec3<f32>, 4>(vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0));
        var squares = array<vec3<f32>, 4>(vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0));
        let offsets = array<vec2<f32>, 4>(
            vec2<f32>(0.0, 0.0),
            vec2<f32>(f32(r), 0.0),
            vec2<f32>(0.0, f32(r)),
            vec2<f32>(f32(r), f32(r)),
        );
        for (var j = -r; j <= 0; j++) {
            for (var i = -r; i <= 0; i++) {
                for (var k = 0; k < 4; k++) {
                    let c = sample_at(in.uv + (vec2<f32>(f32(i), f32(j)) + offsets[k]) * texel);
                    means[k] += c;
                    squares[k] += c * c;
                }
            }
        }
        let count = f32((r + 1) * (r + 1));
        var best = 1e9;
        for (var k = 0; k < 4; k++) {
            let mean = means[k] / count;
            let variance = abs(squares[k] / count - mean * mean);
            let spread = variance.r + variance.g + variance.b;
            if spread < best {
                best = spread;
                colour = mean;
            }
        }
    }
    let luma = dot(colour, vec3<f32>(0.2126, 0.7152, 0.0722));
    colour = max(mix(vec3<f32>(luma), colour, settings.saturation), vec3<f32>(0.0));
    // Canvas: fine tooth plus a faint woven direction.
    let p = in.position.xy;
    let tooth = hash(floor(p)) * 0.6 + value_noise(p * 0.08) * 0.25 + value_noise(p * vec2<f32>(0.02, 0.4)) * 0.15;
    colour *= 1.0 - settings.grain * 0.06 * (tooth - 0.3);
    return vec4<f32>(colour, 1.0);
}
