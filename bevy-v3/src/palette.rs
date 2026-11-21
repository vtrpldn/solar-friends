//! The village's painted look, after Tarsila do Amaral's Pau-Brasil landscapes.
//!
//! Model colours are remapped once, when their glTF materials load, towards her "caipira"
//! palette: rose walls, emerald and yellow-green foliage, clean terracotta, warm wood and
//! blue-grey metal. The ground is painted as broad rolling fields of colour, each shaded
//! from a darker foot to a lighter crest, with worn rose earth around camp and buildings.

use bevy::{
    asset::{AssetEvent, AssetPath, embedded_asset, embedded_path},
    core_pipeline::{
        core_3d::graph::Node3d,
        fullscreen_material::{FullscreenMaterial, FullscreenMaterialPlugin},
    },
    platform::collections::HashSet,
    prelude::*,
    render::{
        extract_component::ExtractComponent,
        render_graph::{InternedRenderLabel, RenderLabel},
        render_resource::ShaderType,
    },
    shader::ShaderRef,
};

use crate::terrain::{Terrain, noise};

pub struct PalettePlugin;

impl Plugin for PalettePlugin {
    fn build(&self, app: &mut App) {
        embedded_asset!(app, "painted.wgsl");
        app.init_resource::<Repainted>()
            .add_plugins(FullscreenMaterialPlugin::<PaintedFinish>::default())
            .add_systems(PreUpdate, repaint_loaded_models);
    }
}

/// The painted post pass on the village camera; menu thumbnails render without it.
#[derive(Component, ExtractComponent, Clone, Copy, ShaderType)]
pub struct PaintedFinish {
    /// Kuwahara radius in pixels; 0 turns the smoothing off.
    pub radius: f32,
    pub saturation: f32,
    pub grain: f32,
    pub _padding: f32,
}

impl Default for PaintedFinish {
    fn default() -> Self {
        Self {
            radius: 2.0,
            saturation: 1.08,
            grain: 0.35,
            _padding: 0.0,
        }
    }
}

impl FullscreenMaterial for PaintedFinish {
    fn fragment_shader() -> ShaderRef {
        ShaderRef::Path(
            AssetPath::from_path_buf(embedded_path!("painted.wgsl")).with_source("embedded"),
        )
    }

    fn node_edges() -> Vec<InternedRenderLabel> {
        vec![
            Node3d::Tonemapping.intern(),
            Self::node_label().intern(),
            Node3d::EndMainPassPostProcessing.intern(),
        ]
    }
}

/// glTF materials that already carry the palette. The tree wind copies materials when a
/// scene spawns, which can happen before [`repaint_loaded_models`] sees the material.
#[derive(Resource, Default)]
pub struct Repainted(HashSet<AssetId<StandardMaterial>>);

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Source {
    /// Buildings, props and plants.
    World,
    /// Residents: keep skin and hair tones, repaint only clothes and gear.
    Characters,
}

/// Which palette a loaded material should get, or `None` for materials made in code.
pub fn source(server: &AssetServer, id: AssetId<StandardMaterial>) -> Option<Source> {
    let path = server.get_path(id)?;
    let file = path.path().to_string_lossy();
    if file.ends_with("opening.glb") {
        Some(Source::Characters)
    } else if file.ends_with(".glb") {
        Some(Source::World)
    } else {
        None
    }
}

/// Repaints a material copy for the tree wind when the shared material is not done yet.
pub fn repaint_copy(
    server: &AssetServer,
    repainted: &Repainted,
    id: AssetId<StandardMaterial>,
    material: &mut StandardMaterial,
) {
    if !repainted.0.contains(&id)
        && let Some(source) = source(server, id)
    {
        repaint(material, source);
    }
}

fn repaint_loaded_models(
    mut events: MessageReader<AssetEvent<StandardMaterial>>,
    server: Res<AssetServer>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut repainted: ResMut<Repainted>,
) {
    for event in events.read() {
        let AssetEvent::Added { id } = *event else {
            continue;
        };
        if repainted.0.contains(&id) {
            continue;
        }
        let Some(source) = source(&server, id) else {
            continue;
        };
        if let Some(material) = materials.get_mut(id) {
            repaint(material, source);
            repainted.0.insert(id);
        }
    }
}

/// The rose of Pau-Brasil house walls.
const WALL_ROSE: [f32; 3] = [0.91, 0.62, 0.60];

pub fn repaint(material: &mut StandardMaterial, source: Source) {
    // Fires, lamps and screens keep their glow colours.
    if material.emissive.red + material.emissive.green + material.emissive.blue > 0.0 {
        return;
    }
    let alpha = material.base_color.alpha();
    let srgb = material.base_color.to_srgba();
    material.base_color =
        Color::Srgba(pau_brasil([srgb.red, srgb.green, srgb.blue], source)).with_alpha(alpha);
    // Matte paint: no glossy highlights.
    material.perceptual_roughness = material.perceptual_roughness.max(0.9);
    material.reflectance = material.reflectance.min(0.3);
}

fn smoothstep(edge0: f32, edge1: f32, x: f32) -> f32 {
    let t = ((x - edge0) / (edge1 - edge0)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

/// Remaps one sRGB colour towards the Pau-Brasil palette.
pub fn pau_brasil(rgb: [f32; 3], source: Source) -> Srgba {
    let colour = Srgba::rgb(rgb[0], rgb[1], rgb[2]);
    let Hsva {
        hue,
        saturation: s,
        value: v,
        ..
    } = Hsva::from(colour);
    let h = hue / 360.0;
    let hsv = |h: f32, s: f32, v: f32| Srgba::from(Hsva::hsv(h * 360.0, s.min(1.0), v.min(1.0)));
    let characters = source == Source::Characters;
    if (s < 0.22 && v > 0.62) || (s < 0.36 && v > 0.72 && (0.05..0.2).contains(&h)) {
        // Pale plaster and canvas → rose.
        let rose = Srgba::rgb(WALL_ROSE[0], WALL_ROSE[1], WALL_ROSE[2]);
        colour.mix(&rose, if characters { 0.45 } else { 0.85 })
    } else if s < 0.2 {
        // Greys → soft blue-grey.
        hsv(0.6, 0.22, v * 1.05)
    } else if (0.16..0.47).contains(&h) {
        // Greens → emerald in the shade, yellow-green in the light.
        let t = smoothstep(0.25, 0.75, v);
        hsv(
            0.40 + (0.24 - 0.40) * t,
            s.max(0.5) * 1.15,
            0.32 + (0.78 - 0.32) * t,
        )
    } else if characters {
        // Skin, hair and leather stay as they are.
        colour
    } else if !(0.045..=0.93).contains(&h) {
        // Reds → one clean terracotta.
        hsv(0.025, 0.66, 0.7 + 0.15 * v)
    } else if h < 0.11 {
        // Wood and earth → warm orange.
        hsv(0.065, s * 1.25 + 0.1, v * 1.12)
    } else if h < 0.17 {
        // Ochres → sunny yellow.
        hsv(0.13, s * 1.3 + 0.15, v * 1.1)
    } else if (0.5..0.75).contains(&h) {
        // Blues → sky.
        hsv(0.58, s * 1.3 + 0.1, v)
    } else {
        colour
    }
}

/// Field colours per biome (sRGB): greens, yellow-green, deep green, light green and the
/// rose earth of a bare hill.
const FIELDS: [[[f32; 3]; 5]; 3] = [
    [
        [0.42, 0.66, 0.33],
        [0.70, 0.76, 0.36],
        [0.30, 0.53, 0.33],
        [0.86, 0.64, 0.52],
        [0.55, 0.74, 0.40],
    ],
    [
        [0.60, 0.68, 0.34],
        [0.82, 0.76, 0.40],
        [0.40, 0.56, 0.30],
        [0.88, 0.64, 0.50],
        [0.70, 0.74, 0.42],
    ],
    [
        [0.68, 0.66, 0.40],
        [0.84, 0.72, 0.48],
        [0.50, 0.56, 0.36],
        [0.90, 0.62, 0.50],
        [0.76, 0.70, 0.46],
    ],
];
const WORN_EARTH: [f32; 3] = [0.90, 0.66, 0.56];

fn fbm(x: f64, z: f64, seed: u32) -> f64 {
    let (mut value, mut amplitude, mut x, mut z) = (0.0, 0.5, x, z);
    for octave in 0..4 {
        value += amplitude * noise(x, z, seed.wrapping_add(octave * 0x9e37));
        x = x * 2.03 + 17.1;
        z = z * 2.03 + 9.2;
        amplitude *= 0.5;
    }
    value / 0.9375
}

/// The painted ground colour (linear RGBA) at a world position.
pub fn ground_color(terrain: &Terrain, biome: usize, x: f64, z: f64) -> [f32; 4] {
    let seed = terrain.seed;
    let fields = &FIELDS[biome.min(2)];
    let n = fbm(x * 0.02 + 3.1, z * 0.02 + 1.7, seed ^ 0x7a51)
        + 0.25 * fbm(x * 0.05, z * 0.05, seed ^ 0x2c3d);
    let bands = (n * 6.0) as f32;
    let (k, f) = (bands.floor(), bands.fract());
    let pick = |k: f32| fields[((k * 3.0).rem_euclid(5.0)) as usize % 5];
    let here = pick(k);
    let next = pick(k + 1.0);
    // Each field is shaded like one of her rounded hills: darker at the foot, lighter at the crest.
    let shade = 0.72 + 0.4 * smoothstep(0.0, 0.9, f);
    let blend = smoothstep(0.94, 1.0, f);
    let mut rgb: [f32; 3] =
        std::array::from_fn(|i| here[i] * shade * (1.0 - blend) + next[i] * 0.72 * blend);
    // Worn rose earth where people live and work.
    let worn = terrain.worn_distance(x, z) + (fbm(x * 0.3, z * 0.3, seed ^ 0x51f1) - 0.5) * 2.0;
    let earth = 0.85 * (1.0 - smoothstep(-0.6, 0.9, worn as f32));
    let inner = 0.88 + 0.12 * smoothstep(2.0, -2.0, worn as f32);
    for (channel, earth_channel) in rgb.iter_mut().zip(WORN_EARTH) {
        *channel += (earth_channel * inner - *channel) * earth;
    }
    let linear = Color::srgb(rgb[0], rgb[1], rgb[2]).to_linear();
    [linear.red, linear.green, linear.blue, 1.0]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pale_walls_turn_rose_and_greens_stay_green() {
        let wall = pau_brasil([0.9, 0.88, 0.82], Source::World);
        assert!(wall.red > wall.green && wall.red > wall.blue);
        let leaf = Hsva::from(pau_brasil([0.35, 0.5, 0.25], Source::World));
        assert!((80.0..170.0).contains(&leaf.hue));
    }

    #[test]
    fn resident_skin_keeps_its_tone() {
        let skin = [0.55, 0.36, 0.24];
        assert_eq!(
            pau_brasil(skin, Source::Characters),
            Srgba::rgb(0.55, 0.36, 0.24)
        );
    }
}
