use std::{
    collections::{BTreeMap, VecDeque},
    sync::Arc,
};

use bevy::{
    asset::RenderAssetUsages, mesh::Indices, prelude::*, render::render_resource::PrimitiveTopology,
};
use serde::{Deserialize, Serialize};

use crate::arrival::{MAP_START, ROAD_END, road_center, road_width, world_position};

const CELLS: u32 = 128;
const HALF_WIDTH: f64 = 128.0;

#[derive(Resource)]
pub struct Terrain {
    pub seed: u32,
    offset: f64,
    bend: f64,
    width: f64,
    pub hill_height: f64,
    foundation: Option<Foundation>,
    edits: Arc<BTreeMap<u16, f64>>,
}

struct Foundation {
    left: f64,
    right: f64,
    top: f64,
    bottom: f64,
    height: f64,
}

#[derive(Clone, Copy, Default)]
enum Brush {
    #[default]
    Raise,
    Lower,
    Flatten,
    Smooth,
}

type TerrainVertices = Arc<BTreeMap<u16, f64>>;

#[derive(Default, Deserialize, Serialize)]
pub struct TerrainEditor {
    vertices: TerrainVertices,
    #[serde(skip)]
    history: VecDeque<TerrainVertices>,
    #[serde(skip)]
    pub open: bool,
    #[serde(skip)]
    brush: Brush,
    #[serde(skip)]
    radius_index: usize,
    #[serde(skip)]
    level: Option<f64>,
    #[serde(skip)]
    pub revision: u64,
    #[serde(skip)]
    status: &'static str,
}

impl TerrainEditor {
    const RADII: [f64; 3] = [8.0, 12.0, 4.0];

    pub fn valid(&self) -> bool {
        self.vertices.iter().all(|(&index, height)| {
            u32::from(index) < (CELLS + 1).pow(2) && (0.0..=12.0).contains(height)
        })
    }

    pub fn controls(&mut self, keyboard: &ButtonInput<KeyCode>) {
        if keyboard.just_pressed(KeyCode::F4) {
            self.open = !self.open;
            self.level = None;
            self.status = "";
        }
        if !self.open {
            return;
        }
        for (key, brush) in [
            (KeyCode::Digit1, Brush::Raise),
            (KeyCode::Digit2, Brush::Lower),
            (KeyCode::Digit3, Brush::Flatten),
            (KeyCode::Digit4, Brush::Smooth),
        ] {
            if keyboard.just_pressed(key) {
                self.brush = brush;
                self.level = None;
            }
        }
        if keyboard.just_pressed(KeyCode::KeyZ) {
            self.undo();
        }
        if keyboard.just_pressed(KeyCode::BracketLeft) {
            self.radius_index = (self.radius_index + 2) % Self::RADII.len();
        }
        if keyboard.just_pressed(KeyCode::BracketRight) {
            self.radius_index = (self.radius_index + 1) % Self::RADII.len();
        }
    }

    fn undo(&mut self) {
        let Some(previous) = self.history.pop_back() else {
            self.status = "No terrain edits to undo.";
            return;
        };
        self.vertices = previous;
        self.revision = self.revision.wrapping_add(1);
        self.status = "Terrain edit undone.";
    }

    pub fn draw_preview(&self, terrain: &Terrain, point: Vec3, gizmos: &mut Gizmos) {
        let radius = Self::RADII[self.radius_index] as f32;
        let outline = (0..=48).map(|index| {
            let angle = index as f32 * std::f32::consts::TAU / 48.0;
            let offset = Vec2::from_angle(angle) * radius;
            let (x, z) = (point.x + offset.x, point.z + offset.y);
            Vec3::new(x, terrain.height_at(x, z) + 0.08, z)
        });
        gizmos.linestrip(outline, Color::srgb_u8(255, 225, 160));
    }

    pub fn label(&self) -> String {
        let tool = match self.brush {
            Brush::Raise => "Raise",
            Brush::Lower => "Lower",
            Brush::Flatten => "Flatten",
            Brush::Smooth => "Smooth",
        };
        let level = self
            .level
            .map_or_else(String::new, |h| format!(" · Grade {h:.2} m"));
        let instruction = match (self.brush, self.level) {
            (Brush::Flatten, None) => "Click to sample a grade",
            _ => "Click to shape the ground",
        };
        format!(
            "Terrain · {tool} · {} m radius{level}
1 Raise · 2 Lower · 3 Flatten · 4 Smooth
{instruction} · [ ] Radius · Z Undo · F4 Close
{}",
            Self::RADII[self.radius_index],
            self.status
        )
    }

    pub fn terrain(&self, mut terrain: Terrain) -> Terrain {
        terrain.edits = Arc::clone(&self.vertices);
        terrain
    }

    pub fn stroke(&mut self, terrain: &Terrain, point: Vec3, occupied: impl Fn(IVec2) -> bool) {
        let (x, z) = (f64::from(point.x), f64::from(point.z));
        if !(-HALF_WIDTH..=HALF_WIDTH).contains(&x) || !(-HALF_WIDTH..=HALF_WIDTH).contains(&z) {
            return;
        }
        if matches!(self.brush, Brush::Flatten) && self.level.is_none() {
            let height = f64::from(point.y);
            if !(0.0..=12.0).contains(&height) {
                self.status = "Choose a grade between 0 and 12 m.";
                return;
            }
            self.level = Some(height);
        }

        let radius = Self::RADII[self.radius_index];
        let bounds = |center: f64| {
            let min = ((center - radius) / 2.0).ceil().max(-HALF_WIDTH / 2.0) as i32;
            let max = ((center + radius) / 2.0).floor().min(HALF_WIDTH / 2.0) as i32;
            min..=max
        };
        let previous = Arc::clone(&self.vertices);
        let mut changed = false;
        for column in bounds(x) {
            for row in bounds(z) {
                let (a, b) = (f64::from(column * 2), f64::from(row * 2));
                let distance = (a - x).hypot(b - z);
                let cell = IVec2::new(column + 32, row + 32);
                if distance >= radius || terrain.protected_vertex(a, b) || occupied(cell) {
                    continue;
                }
                let old = terrain.elevation(a, b);
                let weight = (1.0 - distance / radius).powi(2);
                let next = match self.brush {
                    Brush::Raise => old + 0.6 * weight,
                    Brush::Lower => old - 0.6 * weight,
                    Brush::Flatten => {
                        old + (self.level.unwrap_or(old) - old) * (2.0 * weight).min(1.0)
                    }
                    Brush::Smooth => {
                        let average = (terrain.elevation(a - 2.0, b)
                            + terrain.elevation(a + 2.0, b)
                            + terrain.elevation(a, b - 2.0)
                            + terrain.elevation(a, b + 2.0))
                            / 4.0;
                        old + (average - old) * (2.0 * weight).min(1.0)
                    }
                }
                .clamp(0.0, 12.0);
                if (next - old).abs() >= 0.00001 {
                    Arc::make_mut(&mut self.vertices)
                        .insert(vertex_index(a, b).expect("bounded vertex"), next);
                    changed = true;
                }
            }
        }
        self.status = if changed {
            ""
        } else {
            "No ground changed at this location."
        };
        if changed {
            if self.history.len() == 20 {
                self.history.pop_front();
            }
            self.history.push_back(previous);
            self.revision = self.revision.wrapping_add(1);
        }
    }
}

fn vertex_index(x: f64, z: f64) -> Option<u16> {
    let column = (x + HALF_WIDTH) / 2.0;
    let row = (z + HALF_WIDTH) / 2.0;
    let in_grid = |value: f64| (0.0..=f64::from(CELLS)).contains(&value) && value.fract() == 0.0;
    (in_grid(column) && in_grid(row)).then(|| (row as u32 * (CELLS + 1) + column as u32) as u16)
}

impl Terrain {
    pub fn new(seed: u32, water: f64, relief: f64) -> Self {
        let mut random = land_random(seed);
        let offset = -65.0 + random() * 29.0;
        let bend = 4.0 + random() * 10.0;
        // The original generator reserves draws for the phase and frequency.
        random();
        random();
        Self {
            seed,
            offset,
            bend,
            width: (2.1 + random() * 1.3) * water.sqrt(),
            hill_height: (4.0 + random() * 5.0) * relief,
            foundation: None,
            edits: Arc::default(),
        }
    }

    pub fn river(&self, z: f64) -> (f64, f64) {
        if self.seed == 0 {
            let center = -31.0 + 5.0 * (z * 0.07).sin() + 1.8 * (z * 0.14).sin();
            let width = 2.5 + 0.65 * (z * 0.11).sin() + 1.3 * (-((z - 13.0) / 9.0).powi(2)).exp();
            return (center, width);
        }
        let center = self.offset
            + self.bend * (noise(z / 62.0, 3.7, self.seed ^ 0x39af) * 2.0 - 1.0)
            + 2.0 * (noise(z / 23.0, 8.2, self.seed ^ 0x715b) * 2.0 - 1.0);
        let width = self.width
            + 0.6 * noise(z / 18.0, 4.2, self.seed ^ 0xa83f)
            + 0.8 * noise(z / 47.0, 9.1, self.seed ^ 0x734a);
        (center, width)
    }

    fn protected_vertex(&self, x: f64, z: f64) -> bool {
        let (center, width) = self.river(z);
        let road = (f64::from(MAP_START)..=f64::from(ROAD_END)).contains(&z)
            && (x - f64::from(road_center(z as f32))).abs() < f64::from(road_width(z as f32)) + 3.0;
        let stock = x.hypot(z + 90.0) < 10.0;
        let camp = self.foundation.as_ref().is_some_and(|pad| {
            (pad.left - 2.0..=pad.right + 2.0).contains(&x)
                && (pad.top - 2.0..=pad.bottom + 2.0).contains(&z)
        });
        (x - center).abs() <= width + 4.9 || road || stock || camp
    }

    pub fn with_camp(mut self, cell: IVec2) -> Self {
        let start = world_position((cell.x - 1) as f32, (cell.y - 3) as f32) - Vec2::splat(2.0);
        let end = world_position((cell.x + 4) as f32, (cell.y + 1) as f32);
        let center = (start + end) * 0.5;
        self.foundation = Some(Foundation {
            left: start.x.into(),
            right: end.x.into(),
            top: start.y.into(),
            bottom: end.y.into(),
            height: self.height_at(center.x, center.y).into(),
        });
        self
    }

    pub fn elevation(&self, x: f64, z: f64) -> f64 {
        let natural = vertex_index(x, z)
            .and_then(|index| self.edits.get(&index).copied())
            .unwrap_or_else(|| self.natural_elevation(x, z));
        let Some(pad) = &self.foundation else {
            return natural;
        };
        let distance = (pad.left - x)
            .max(0.0)
            .max(x - pad.right)
            .hypot((pad.top - z).max(0.0).max(z - pad.bottom));
        if distance < 0.0001 {
            return pad.height;
        }
        if distance >= 8.0 {
            return natural;
        }
        let (center, width) = self.river(z);
        let access_road = (f64::from(MAP_START)..=f64::from(ROAD_END)).contains(&z)
            && (x - f64::from(road_center(z as f32))).abs() < f64::from(road_width(z as f32)) + 1.0;
        if (x - center).abs() <= width + 2.9 || access_road {
            return natural;
        }
        let t = distance / 8.0;
        let weight = 1.0 - t * t * (3.0 - 2.0 * t);
        natural * (1.0 - weight) + pad.height * weight
    }

    fn natural_elevation(&self, x: f64, z: f64) -> f64 {
        if self.seed == 0 {
            return 0.0;
        }
        let (center, width) = self.river(z);
        let t = (((x - center).abs() - width - 5.0) / 9.0).clamp(0.0, 1.0);
        let river_cut = t * t * (3.0 - 2.0 * t);
        let a = x + (noise(x / 95.0, z / 95.0, self.seed ^ 0x7ac31) - 0.5) * 50.0;
        let b = z + (noise(x / 95.0, z / 95.0, self.seed ^ 0x91e47) - 0.5) * 50.0;
        let broad = noise(a / 83.0, b / 83.0, self.seed ^ 0x12abd);
        let hills = noise(a / 34.0, b / 34.0, self.seed ^ 0x48acf);
        let detail = noise(a / 13.0, b / 13.0, self.seed ^ 0x719ec);
        let ruggedness = noise(x / 120.0, z / 120.0, self.seed ^ 0x816df);
        let relief =
            (0.2 + broad * 0.9 + (hills - 0.35) * (0.5 + ruggedness * 0.5) + (detail - 0.5) * 0.14)
                .max(0.0);
        self.hill_height * relief * river_cut
    }

    pub fn height_at(&self, x: f32, z: f32) -> f32 {
        let tile = |value: f32| {
            let value = (f64::from(value) + HALF_WIDTH) / 2.0;
            let tile = value.floor().clamp(0.0, f64::from(CELLS - 1));
            (tile * 2.0 - HALF_WIDTH, (value - tile).clamp(0.0, 1.0))
        };
        let (left, u) = tile(x);
        let (top, v) = tile(z);
        let a = self.elevation(left, top);
        let b = self.elevation(left, top + 2.0);
        let d = self.elevation(left + 2.0, top);
        let height = if u + v <= 1.0 {
            a + (d - a) * u + (b - a) * v
        } else {
            let c = self.elevation(left + 2.0, top + 2.0);
            c + (b - c) * (1.0 - u) + (d - c) * (1.0 - v)
        };
        height as f32
    }

    pub fn ground_mesh(&self) -> Mesh {
        let stride = CELLS + 1;
        let mut positions = Vec::with_capacity((stride * stride) as usize);
        let mut indices = Vec::with_capacity((CELLS * CELLS * 6) as usize);
        for row in 0..stride {
            let z = f64::from(row) * 2.0 - HALF_WIDTH;
            for column in 0..stride {
                let x = f64::from(column) * 2.0 - HALF_WIDTH;
                positions.push([x as f32, self.elevation(x, z) as f32, z as f32]);
            }
        }
        for row in 0..CELLS {
            for column in 0..CELLS {
                let a = row * stride + column;
                let b = a + stride;
                indices.extend_from_slice(&[a, b, a + 1, b, b + 1, a + 1]);
            }
        }
        surface_mesh(positions, indices)
    }

    pub fn road_mesh(&self) -> Mesh {
        let mut positions = Vec::new();
        let mut indices = Vec::new();
        let rows = (ROAD_END - MAP_START) as u32;
        for row in 0..=rows {
            let z = MAP_START + row as f32;
            let width = road_width(z);
            for x in [road_center(z) - width, road_center(z) + width] {
                positions.push([x, self.height_at(x, z) + 0.04, z]);
            }
            if row < rows {
                let a = row * 2;
                indices.extend_from_slice(&[a, a + 2, a + 1, a + 2, a + 3, a + 1]);
            }
        }
        surface_mesh(positions, indices)
    }

    pub fn river_mesh(&self) -> Mesh {
        let mut positions = Vec::new();
        let mut indices = Vec::new();
        for row in 0..=CELLS {
            let z = f64::from(row) * 2.0 - HALF_WIDTH;
            let (center, width) = self.river(z);
            positions.push([(center - width) as f32, 0.05, z as f32]);
            positions.push([(center + width) as f32, 0.05, z as f32]);
            if row < CELLS {
                let a = row * 2;
                indices.extend_from_slice(&[a, a + 2, a + 1, a + 2, a + 3, a + 1]);
            }
        }
        surface_mesh(positions, indices)
    }
}

fn surface_mesh(positions: Vec<[f32; 3]>, indices: Vec<u32>) -> Mesh {
    let mut mesh = Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    )
    .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, positions)
    .with_inserted_indices(Indices::U32(indices));
    mesh.compute_normals();
    mesh
}

pub fn land_random(seed: u32) -> impl FnMut() -> f64 {
    let mut state = seed;
    move || {
        state = state.wrapping_add(0x6d2b79f5);
        let mut value = (state ^ (state >> 15)).wrapping_mul(1 | state);
        value ^= value.wrapping_add((value ^ (value >> 7)).wrapping_mul(61 | value));
        f64::from(value ^ (value >> 14)) / 4294967296.0
    }
}

pub fn noise(x: f64, z: f64, seed: u32) -> f64 {
    let ix = x.floor() as i32;
    let iz = z.floor() as i32;
    let fade = |t: f64| t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
    let lattice = |x: i32, z: i32| {
        let value = x.wrapping_mul(374761393) as u32 ^ z.wrapping_mul(668265263) as u32 ^ seed;
        let value = (value ^ (value >> 13)).wrapping_mul(1274126177);
        f64::from(value ^ (value >> 16)) / f64::from(u32::MAX)
    };
    let mix = |a: f64, b: f64, t: f64| a + (b - a) * t;
    let u = fade(x - f64::from(ix));
    let v = fade(z - f64::from(iz));
    mix(
        mix(lattice(ix, iz), lattice(ix + 1, iz), u),
        mix(lattice(ix, iz + 1), lattice(ix + 1, iz + 1), u),
        v,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strokes_use_one_snapshot_and_save_edited_vertices() {
        let mut editor = TerrainEditor::default();
        let base = || Terrain::new(0, 1.0, 1.0);
        let at = Vec3::new(40.0, 0.0, 24.0);
        let terrain = editor.terrain(base());
        editor.stroke(&terrain, at, |cell| cell == IVec2::new(53, 44));
        let raised = editor.terrain(base());
        assert_eq!(raised.elevation(40.0, 24.0), 0.6);
        assert_eq!(raised.elevation(42.0, 24.0), 0.0);
        assert!((raised.elevation(40.0, 22.0) - 0.3375).abs() < 1e-12);
        assert_eq!(terrain.elevation(40.0, 24.0), 0.0);

        editor.brush = Brush::Smooth;
        editor.stroke(&raised, at, |_| false);
        let json = serde_json::to_string(&editor).unwrap();
        let restored: TerrainEditor = serde_json::from_str(&json).unwrap();
        assert!(restored.valid());
        let smoothed = restored.terrain(base());
        assert!((smoothed.elevation(40.0, 24.0) - 0.253125).abs() < 1e-12);
        assert_eq!(smoothed.elevation(48.0, 24.0), 0.0);
        editor.undo();
        assert_eq!(editor.terrain(base()).elevation(40.0, 24.0), 0.6);
    }

    #[test]
    fn brushes_preserve_water_road_and_camp_and_reuse_the_flatten_grade() {
        let mut editor = TerrainEditor {
            brush: Brush::Flatten,
            ..default()
        };
        let base = || Terrain::new(0, 1.0, 1.0).with_camp(IVec2::new(36, 36));
        editor.stroke(&base(), Vec3::new(40.0, 1.25, 24.0), |_| false);
        for point in [
            Vec3::new(40.0, 0.0, 46.0),
            Vec3::new(-32.0, 0.0, 0.0),
            Vec3::new(0.0, 0.0, -110.0),
            Vec3::new(8.0, 0.0, 8.0),
        ] {
            editor.stroke(&editor.terrain(base()), point, |_| false);
        }
        let terrain = editor.terrain(base());
        assert_eq!(terrain.elevation(40.0, 24.0), 1.25);
        assert_eq!(terrain.elevation(40.0, 46.0), 1.25);
        assert_eq!(terrain.elevation(-32.0, 0.0), 0.0);
        assert_eq!(terrain.elevation(0.0, -110.0), 0.0);
        assert_eq!(terrain.elevation(8.0, 8.0), 0.0);
    }

    #[test]
    fn camp_grading_matches_the_reference_foundation() {
        let terrain = Terrain::new(42, 1.0, 1.0).with_camp(IVec2::new(36, 36));
        for (x, z, expected) in [
            (8.0, 8.0, 2.201269096913987),
            (14.0, 10.0, 2.201269096913987),
            (20.0, 10.0, 2.1936407927990986),
            (22.0, 8.0, 2.399863653582314),
        ] {
            assert!((terrain.elevation(x, z) - expected).abs() < 1e-6);
        }
    }

    #[test]
    fn terrain_matches_v2_reference_samples() {
        let flat = Terrain::new(0, 1.0, 1.0);
        assert_eq!(flat.elevation(40.0, -20.0), 0.0);
        assert_eq!(flat.river(0.0).0, -31.0);
        let seeded = Terrain::new(42, 1.0, 1.0);
        let (center, width) = seeded.river(-20.0);
        for (actual, expected) in [
            (seeded.elevation(40.0, -20.0), 5.040344123044298),
            (center, -52.3766890522931),
            (width, 2.962192008761531),
        ] {
            assert!((actual - expected).abs() < 1e-9, "{actual} vs {expected}");
        }
    }
}
