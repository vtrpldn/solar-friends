use super::WorkshopCatalog;
use super::garden::{CELLS, Layout, WIDTH};
use bevy::{asset::RenderAssetUsages, mesh::Indices, prelude::*};

const SIDE: usize = CELLS as usize + 1;
const HALF: f32 = WIDTH / 2.;
pub const BIOMES: [&str; 4] = ["flat", "mata-atlantica", "cerrado", "caatinga"];

#[derive(Default)]
pub struct Terrain {
    heights: Vec<f32>,
}

struct Pad {
    center: Vec2,
    size: Vec2,
    height: f32,
}

fn ease(t: f32) -> f32 {
    let t = t.clamp(0., 1.);
    t * t * (3. - 2. * t)
}

fn base_height(biome: &str, x: f32, z: f32) -> f32 {
    let rolling = (x * 0.045 + 0.7).sin() * (z * 0.038 - 0.5).cos();
    let detail = (x * 0.11 + z * 0.07).sin() * (z * 0.09 - x * 0.04).cos();
    let clearing = ease((x.hypot(z) - 12.) / 24.);
    clearing
        * match biome {
            "mata-atlantica" => 4.5 + rolling * 4. + detail * 1.1,
            "cerrado" => 3. + rolling * 2.5 + (z * 0.055).sin() * 1.2,
            "caatinga" => 2.5 + rolling.abs() * 5. + detail * 0.7,
            _ => 0.,
        }
}

fn terraces(layout: &Layout, models: &WorkshopCatalog) -> Vec<Pad> {
    let biome = layout.biome.as_str();
    let mut pads: Vec<_> = layout
        .props
        .iter()
        .filter(|prop| {
            matches!(
                models.0[&prop.asset].category.as_str(),
                "Homes" | "Buildings" | "Props" | "Supplies" | "Construction"
            ) || prop.asset == "road"
        })
        .map(|prop| {
            let center = prop.center(models);
            let [w, d] = prop.size(models);
            Pad {
                center: Vec2::new(center.x, center.z),
                size: Vec2::new(w as f32, d as f32),
                height: base_height(biome, center.x, center.z),
            }
        })
        .collect();
    let mut visited = vec![false; pads.len()];
    for first in 0..pads.len() {
        if visited[first] {
            continue;
        }
        visited[first] = true;
        let mut group = vec![first];
        let mut cursor = 0;
        while cursor < group.len() {
            let pad = &pads[group[cursor]];
            for (other, candidate) in pads.iter().enumerate() {
                if !visited[other]
                    && (pad.center - candidate.center)
                        .abs()
                        .cmple(pad.size + candidate.size + Vec2::splat(0.01))
                        .all()
                {
                    visited[other] = true;
                    group.push(other);
                }
            }
            cursor += 1;
        }
        let height = group.iter().map(|&i| pads[i].height).sum::<f32>() / group.len() as f32;
        for i in group {
            pads[i].height = height;
        }
    }
    pads
}

fn graded_height(biome: &str, pads: &[Pad], x: f32, z: f32) -> f32 {
    let base = base_height(biome, x, z);
    let mut nearest = 3.;
    let mut value = base;
    for pad in pads {
        let distance = ((Vec2::new(x, z) - pad.center).abs() - pad.size).max_element();
        if distance < nearest {
            nearest = distance;
            value = pad.height.lerp(base, ease(distance / 3.));
        }
    }
    value
}

fn sample_surface(x: f32, z: f32, vertex: impl Fn(usize, usize) -> f32) -> f32 {
    let cell =
        ((Vec2::new(x, z) + Vec2::splat(HALF)) / 2.).clamp(Vec2::ZERO, Vec2::splat(CELLS as f32));
    let origin = cell.floor().min(Vec2::splat((CELLS - 1) as f32));
    let (i, j) = (origin.x as usize, origin.y as usize);
    let fraction = cell - origin;
    let (a, b) = (fraction.x, fraction.y);
    let top_right = vertex(i + 1, j);
    let bottom_left = vertex(i, j + 1);
    if a + b <= 1. {
        let top_left = vertex(i, j);
        top_left + a * (top_right - top_left) + b * (bottom_left - top_left)
    } else {
        let bottom_right = vertex(i + 1, j + 1);
        bottom_right
            + (1. - a) * (bottom_left - bottom_right)
            + (1. - b) * (top_right - bottom_right)
    }
}

impl Terrain {
    pub fn new(layout: &Layout, models: &WorkshopCatalog) -> Self {
        let biome = layout.biome.as_str();
        if biome == "flat" {
            return Self::default();
        }
        let pads = terraces(layout, models);
        let heights = (0..SIDE * SIDE)
            .map(|index| {
                let x = (index % SIDE) as f32 * 2. - HALF;
                let z = (index / SIDE) as f32 * 2. - HALF;
                graded_height(biome, &pads, x, z)
            })
            .collect();
        Self { heights }
    }

    fn vertex(&self, i: usize, j: usize) -> f32 {
        self.heights.get(j * SIDE + i).copied().unwrap_or_default()
    }

    pub fn height(&self, x: f32, z: f32) -> f32 {
        sample_surface(x, z, |i, j| self.vertex(i, j))
    }

    pub fn proposed_height(layout: &Layout, models: &WorkshopCatalog, center: Vec2) -> f32 {
        if layout.biome == "flat" {
            return 0.;
        }
        let pads = terraces(layout, models);
        sample_surface(center.x, center.y, |i, j| {
            graded_height(
                &layout.biome,
                &pads,
                i as f32 * 2. - HALF,
                j as f32 * 2. - HALF,
            )
        })
    }

    pub fn surface(&self, ray: Ray3d) -> Option<Vec3> {
        let bottom = ray.intersect_plane(Vec3::NEG_Y * 2., InfinitePlane3d::new(Vec3::Y))?;
        let top = ray
            .intersect_plane(Vec3::Y * 10., InfinitePlane3d::new(Vec3::Y))
            .unwrap_or(0.);
        let first = ray.get_point(top).xz();
        let last = ray.get_point(bottom).xz();
        let cell = |p: Vec2| ((p + Vec2::splat(HALF)) / 2.).floor().as_ivec2();
        let start = cell(first.min(last)).max(IVec2::ZERO);
        let end = cell(first.max(last)).min(IVec2::splat(CELLS - 1));
        let mut nearest = f32::INFINITY;
        let point = |i, j| {
            Vec3::new(
                i as f32 * 2. - HALF,
                self.vertex(i, j),
                j as f32 * 2. - HALF,
            )
        };
        for j in start.y..=end.y {
            for i in start.x..=end.x {
                let (i, j) = (i as usize, j as usize);
                let [a, b, c, d] = [
                    point(i, j),
                    point(i + 1, j),
                    point(i, j + 1),
                    point(i + 1, j + 1),
                ];
                for (origin, u, v) in [(a, b - a, c - a), (d, c - d, b - d)] {
                    let normal = u.cross(v);
                    let denominator = normal.dot(*ray.direction);
                    if denominator.abs() <= f32::EPSILON {
                        continue;
                    }
                    let time = normal.dot(origin - ray.origin) / denominator;
                    if !(0. ..nearest).contains(&time) {
                        continue;
                    }
                    let offset = ray.get_point(time) - origin;
                    let a = offset.x / u.x;
                    let b = offset.z / v.z;
                    if a >= -0.00001 && b >= -0.00001 && a + b <= 1.00001 {
                        nearest = time;
                    }
                }
            }
        }
        nearest.is_finite().then(|| ray.get_point(nearest))
    }

    pub fn mesh(&self, biome: &str) -> Mesh {
        let palette = match biome {
            "mata-atlantica" => [0x486d3c, 0x708c50, 0x8b7953],
            "cerrado" => [0xb3ad68, 0xb58951, 0x95613f],
            "caatinga" => [0xb6a67b, 0xc2b18b, 0x998c76],
            _ => [0xa9b983; 3],
        };
        let [low, high, ridge] = palette
            .map(|rgb| Color::srgb_u8((rgb >> 16) as u8, (rgb >> 8) as u8, rgb as u8).to_linear());
        let mut positions = Vec::new();
        let mut colors = Vec::new();
        let mut indices = Vec::new();
        for j in 0..SIDE {
            for i in 0..SIDE {
                let x = i as f32 * 2. - HALF;
                let z = j as f32 * 2. - HALF;
                let y = self.vertex(i, j);
                positions.push([x, y, z]);
                let patch = ((x * 0.065 + z * 0.04).sin() + (z * 0.085 - x * 0.03).cos() + 2.) / 4.;
                colors.push(
                    low.mix(&high, patch)
                        .mix(&ridge, (y / 14.).min(0.65))
                        .to_f32_array(),
                );
                if i + 1 < SIDE && j + 1 < SIDE {
                    let a = (j * SIDE + i) as u32;
                    let b = a + SIDE as u32;
                    indices.extend([a, b, a + 1, b, b + 1, a + 1]);
                }
            }
        }
        let soil = Color::srgb_u8(151, 116, 81).to_linear().to_f32_array();
        for n in 0..CELLS as usize {
            let last = SIDE - 1;
            for (a, b) in [
                ((n, 0), (n + 1, 0)),
                ((last, n), (last, n + 1)),
                ((last - n, last), (last - n - 1, last)),
                ((0, last - n), (0, last - n - 1)),
            ] {
                let pa = positions[a.1 * SIDE + a.0];
                let pb = positions[b.1 * SIDE + b.0];
                let i = positions.len() as u32;
                positions.extend([pa, pb, [pa[0], -1., pa[2]], [pb[0], -1., pb[2]]]);
                colors.extend([soil; 4]);
                indices.extend([i, i + 1, i + 2, i + 1, i + 3, i + 2]);
            }
        }
        let mut mesh = Mesh::new(
            bevy::mesh::PrimitiveTopology::TriangleList,
            RenderAssetUsages::default(),
        )
        .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, positions)
        .with_inserted_attribute(Mesh::ATTRIBUTE_COLOR, colors)
        .with_inserted_indices(Indices::U32(indices));
        mesh.compute_normals();
        mesh
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn v2_biome_landscapes_match_the_rendered_triangles() {
        let models = WorkshopCatalog::default();
        let layouts: HashMap<String, Vec<super::super::garden::Prop>> =
            serde_json::from_str(include_str!("../../data/asset-garden-biomes.json")).unwrap();
        for (biome, props) in layouts {
            let layout: Layout = serde_json::from_value(serde_json::json!({
                "format": "solar-friends-scene", "version": 1, "biome": biome, "props": props,
            }))
            .unwrap();
            assert!(layout.props.iter().all(|prop| prop.fits(&models)));
            let terrain = Terrain::new(&layout, &models);
            assert_eq!(terrain.height(0., 0.), 0.);
            assert!(terrain.height(59., 42.) > 0.);
            let direction = Dir3::new(Vec3::new(-1., -0.7, -1.)).unwrap();
            for x in [-86., -45.4, 3., 27.3, 81.] {
                let point = Vec3::new(x, terrain.height(x, 47.3), 47.3);
                let ray = Ray3d::new(point - *direction * 50., direction);
                let hit = terrain.surface(ray).unwrap();
                assert!((hit.y - terrain.height(hit.x, hit.z)).abs() < 0.0001);
            }
        }
    }
}
