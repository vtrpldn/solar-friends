//! The ground's surface shading, ported from V2's land material and laid over the painted
//! Tarsila fields: damp river banks, rocky slopes and a small habitat map of worn ground under
//! buildings, trees and natural deposits.

use std::hash::{DefaultHasher, Hash, Hasher};

use bevy::{
    asset::{AssetPath, RenderAssetUsages, embedded_asset, embedded_path},
    image::{ImageSampler, ImageSamplerDescriptor},
    pbr::{ExtendedMaterial, MaterialExtension, MaterialPlugin},
    prelude::*,
    render::render_resource::{AsBindGroup, Extent3d, ShaderType, TextureDimension, TextureFormat},
    shader::ShaderRef,
};

use crate::{arrival::world_position, land::Land, setup::WorldSetup, village::Village};

pub type GroundMaterial = ExtendedMaterial<StandardMaterial, GroundSurface>;

/// Habitat map resolution: one texel per metre across the 256 m map.
const SIZE: usize = 256;
const HALF_WIDTH: f32 = 128.0;

#[derive(Asset, AsBindGroup, Clone, Reflect)]
pub struct GroundSurface {
    #[uniform(100)]
    colors: GroundColors,
    #[texture(101)]
    #[sampler(102)]
    habitat: Handle<Image>,
}

#[derive(Clone, Copy, ShaderType, Reflect)]
struct GroundColors {
    soil: Vec4,
    rock: Vec4,
    seed: f32,
    half_width: f32,
}

impl MaterialExtension for GroundSurface {
    fn fragment_shader() -> ShaderRef {
        AssetPath::from_path_buf(embedded_path!("ground.wgsl"))
            .with_source("embedded")
            .into()
    }

    fn deferred_fragment_shader() -> ShaderRef {
        Self::fragment_shader()
    }
}

/// The shared habitat map that every ground material samples.
#[derive(Resource)]
pub struct Habitat {
    image: Handle<Image>,
    drawn: Option<u64>,
}

pub struct GroundPlugin;

impl Plugin for GroundPlugin {
    fn build(&self, app: &mut App) {
        embedded_asset!(app, "ground.wgsl");
        app.add_plugins(MaterialPlugin::<GroundMaterial>::default())
            .add_systems(Startup, create_habitat)
            .add_systems(PostUpdate, update_habitat);
    }
}

fn create_habitat(mut commands: Commands, mut images: ResMut<Assets<Image>>) {
    let mut image = Image::new_fill(
        Extent3d {
            width: SIZE as u32,
            height: SIZE as u32,
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        &[0, 0, 0, 0],
        TextureFormat::Rgba8Unorm,
        RenderAssetUsages::default(),
    );
    image.sampler = ImageSampler::Descriptor(ImageSamplerDescriptor::linear());
    commands.insert_resource(Habitat {
        image: images.add(image),
        drawn: None,
    });
}

fn linear(hex: u32) -> Vec4 {
    let color = Color::srgb_u8((hex >> 16) as u8, (hex >> 8) as u8, hex as u8).to_linear();
    Vec4::new(color.red, color.green, color.blue, 1.0)
}

/// A ground material for the current world; `habitat` must come from the [`Habitat`] resource.
/// The field colours come from the ground mesh's vertex colours.
pub fn material(setup: &WorldSetup, habitat: &Habitat) -> GroundMaterial {
    ExtendedMaterial {
        base: StandardMaterial {
            perceptual_roughness: 1.0,
            reflectance: 0.2,
            ..default()
        },
        extension: GroundSurface {
            colors: GroundColors {
                // Her rose earth, a shade deeper than the worn camp ground, and blue-grey stone.
                soil: linear(0xc4836c),
                rock: linear(0xa29fac),
                seed: (setup.seed() % 997) as f32 * 0.071,
                half_width: HALF_WIDTH,
            },
            habitat: habitat.image.clone(),
        },
    }
}

/// One worn patch: footprint centre and radii in metres, whether it is a tree, and the
/// extra channel it marks (0 for none).
struct Wear {
    center: Vec2,
    radius: Vec2,
    tree: bool,
    channel: usize,
}

fn wear_marks(setup: &WorldSetup, land: &Land, village: &Village) -> Vec<Wear> {
    let in_village = !setup.open && village.camp.is_some();
    let footprint = |position: IVec2, size: IVec2| {
        world_position(
            position.x as f32 + (size.x - 1) as f32 * 0.5,
            position.y as f32 + (size.y - 1) as f32 * 0.5,
        )
    };
    let sites = land
        .sites()
        .filter(|(index, _)| !(in_village && village.tree_felled(*index)))
        .map(|(_, site)| {
            let channel = site.surface_channel();
            let tree = channel == 1;
            Wear {
                center: footprint(site.position, site.size),
                radius: if tree {
                    Vec2::splat(3.2)
                } else {
                    site.size.as_vec2() + 1.4
                },
                tree,
                channel,
            }
        });
    let buildings = village
        .ground_footprints()
        .filter(|_| in_village)
        .map(|(position, size)| Wear {
            center: footprint(position, size),
            radius: size.as_vec2() + 1.4,
            tree: false,
            channel: 0,
        });
    sites.chain(buildings).collect()
}

/// Paints the habitat map: R contact shade, G woodland floor, B exposed earth, A stone.
fn paint(marks: &[Wear], data: &mut [u8]) {
    data.fill(0);
    for mark in marks {
        let low = (mark.center - mark.radius + HALF_WIDTH)
            .floor()
            .max(Vec2::ZERO);
        let high = (mark.center + mark.radius + HALF_WIDTH).min(Vec2::splat(SIZE as f32));
        for z in low.y as usize..high.y.ceil().max(0.0) as usize {
            for x in low.x as usize..high.x.ceil().max(0.0) as usize {
                let offset =
                    (Vec2::new(x as f32, z as f32) + 0.5 - HALF_WIDTH - mark.center) / mark.radius;
                let falloff = (1.0 - offset.length_squared()).max(0.0);
                let texel = (z * SIZE + x) * 4;
                let shade = (falloff * falloff * if mark.tree { 130.0 } else { 190.0 }).round();
                data[texel] = data[texel].max(shade as u8);
                if mark.channel != 0 {
                    let value = (falloff * 255.0).round() as u8;
                    data[texel + mark.channel] = data[texel + mark.channel].max(value);
                }
            }
        }
    }
}

fn update_habitat(
    setup: Res<WorldSetup>,
    land: Res<Land>,
    village: Res<Village>,
    mut habitat: ResMut<Habitat>,
    mut images: ResMut<Assets<Image>>,
) {
    let marks = wear_marks(&setup, &land, &village);
    let mut hasher = DefaultHasher::new();
    for mark in &marks {
        (
            mark.center.to_array().map(f32::to_bits),
            mark.radius.to_array().map(f32::to_bits),
        )
            .hash(&mut hasher);
        mark.channel.hash(&mut hasher);
    }
    let key = hasher.finish();
    if habitat.drawn == Some(key) {
        return;
    }
    let Some(image) = images.get_mut(&habitat.image) else {
        return;
    };
    let Some(data) = image.data.as_mut() else {
        return;
    };
    paint(&marks, data);
    habitat.drawn = Some(key);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn buildings_shade_their_footprint_and_deposits_mark_their_channel() {
        let mut data = vec![0; SIZE * SIZE * 4];
        paint(
            &[
                Wear {
                    center: Vec2::new(0.5, 0.5),
                    radius: Vec2::splat(3.4),
                    tree: false,
                    channel: 0,
                },
                Wear {
                    center: Vec2::new(40.5, 40.5),
                    radius: Vec2::splat(3.0),
                    tree: false,
                    channel: 3,
                },
            ],
            &mut data,
        );
        let texel = |x: usize, z: usize| &data[(z * SIZE + x) * 4..(z * SIZE + x) * 4 + 4];
        assert_eq!(texel(128, 128), &[190, 0, 0, 0]);
        assert_eq!(texel(168, 168), &[190, 0, 0, 255]);
        assert_eq!(texel(100, 100), &[0, 0, 0, 0]);
    }
}
