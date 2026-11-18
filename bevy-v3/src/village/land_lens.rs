use bevy::prelude::*;

use crate::terrain::Terrain;

const MAP_EDGE: f32 = 128.0;
const SAMPLE_WIDTH: f32 = 8.0;
const SAMPLES: usize = 32;

#[derive(Default)]
pub(super) struct LandLens {
    key: Option<(u64, u64, usize)>,
    tiles: Vec<Tile>,
}

struct Tile {
    outline: Vec<Vec3>,
    elevation: f32,
    slope: f32,
}

impl LandLens {
    pub(super) fn draw(
        &mut self,
        key: (u64, u64, usize),
        terrain: &Terrain,
        pointer: Option<Vec3>,
        gizmos: &mut Gizmos,
    ) -> String {
        if self.key != Some(key) {
            self.tiles.clear();
            for row in 0..SAMPLES {
                for column in 0..SAMPLES {
                    let origin =
                        Vec2::new(column as f32, row as f32) * SAMPLE_WIDTH - Vec2::splat(MAP_EDGE);
                    self.tiles.push(Tile::sample(terrain, origin));
                }
            }
            self.key = Some(key);
        }
        for tile in &self.tiles {
            let tint = if tile.slope > 25.0 {
                Color::srgb_u8(222, 112, 96)
            } else if tile.slope > 10.0 {
                Color::srgb_u8(243, 200, 108)
            } else {
                Color::srgb_u8(136, 192, 132)
            };
            gizmos.linestrip(tile.outline.iter().copied(), tint);
        }
        let legend = "Land & slope · Green ≤10° · Gold 10–25° · Red >25°";
        if let Some(point) = pointer {
            let cell = ((point.xz() + Vec2::splat(MAP_EDGE)) / SAMPLE_WIDTH)
                .floor()
                .clamp(Vec2::ZERO, Vec2::splat(SAMPLES as f32 - 1.0));
            let tile = &self.tiles[cell.y as usize * SAMPLES + cell.x as usize];
            return format!(
                "{legend}\nElevation {:.1} world units · Sampled slope {:.1}°",
                tile.elevation, tile.slope
            );
        }
        legend.into()
    }
}

impl Tile {
    fn sample(terrain: &Terrain, origin: Vec2) -> Self {
        let corners = [Vec2::ZERO, Vec2::X, Vec2::ONE, Vec2::Y, Vec2::ZERO]
            .map(|offset| origin + offset * SAMPLE_WIDTH);
        let heights: [f32; 4] =
            std::array::from_fn(|i| terrain.height_at(corners[i].x, corners[i].y));
        let relief = heights.iter().copied().fold(f32::NEG_INFINITY, f32::max)
            - heights.iter().copied().fold(f32::INFINITY, f32::min);
        let outline = corners
            .windows(2)
            .flat_map(|edge| {
                (0..4).map(move |step| {
                    let point = edge[0].lerp(edge[1], step as f32 / 4.0);
                    Vec3::new(point.x, terrain.height_at(point.x, point.y) + 0.16, point.y)
                })
            })
            .chain(std::iter::once(Vec3::new(
                origin.x,
                heights[0] + 0.16,
                origin.y,
            )))
            .collect();
        Self {
            outline,
            elevation: heights.iter().sum::<f32>() / 4.0,
            slope: (relief / SAMPLE_WIDTH).atan().to_degrees(),
        }
    }
}
