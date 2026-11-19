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
const RIVER_COLUMNS: u32 = 13;
const RIVER_ROWS: u32 = CELLS * 4;
pub const RIVER_BOULDER_COUNT: usize = 8;
const HALF_WIDTH: f64 = 128.0;

#[derive(Default)]
pub struct TerrainGrid {
    key: Option<(u64, u64, usize)>,
    lines: Vec<Vec<Vec3>>,
}

impl TerrainGrid {
    pub fn draw(&mut self, key: (u64, u64, usize), terrain: &Terrain, gizmos: &mut Gizmos) {
        if self.key != Some(key) {
            self.lines.clear();
            let edge = HALF_WIDTH as f32;
            for index in 0..CELLS {
                let fixed = index as f32 * 2.0 - edge + 1.0;
                for across in [true, false] {
                    self.lines.push(
                        (0..=CELLS * 2)
                            .map(|step| {
                                let along = step as f32 - edge;
                                let (x, z) = if across {
                                    (along, fixed)
                                } else {
                                    (fixed, along)
                                };
                                Vec3::new(x, terrain.height_at(x, z) + 0.12, z)
                            })
                            .collect(),
                    );
                }
            }
            self.key = Some(key);
        }
        for line in &self.lines {
            gizmos.linestrip(line.iter().copied(), Color::srgba(0.48, 0.72, 0.65, 0.35));
        }
    }
}

#[derive(Clone, Resource)]
pub struct Terrain {
    pub seed: u32,
    offset: f64,
    bend: f64,
    width: f64,
    pub hill_height: f64,
    camp: Option<Foundation>,
    foundations: Arc<Vec<Foundation>>,
    edits: Arc<BTreeMap<u16, f64>>,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
pub struct Foundation {
    left: f64,
    right: f64,
    top: f64,
    bottom: f64,
    height: f64,
}

impl Foundation {
    pub fn height(self) -> f32 {
        self.height as f32
    }

    fn distance(self, x: f64, z: f64) -> f64 {
        (self.left - x)
            .max(0.0)
            .max(x - self.right)
            .hypot((self.top - z).max(0.0).max(z - self.bottom))
    }

    fn touches(self, other: Self) -> bool {
        self.left <= other.right
            && self.right >= other.left
            && self.top <= other.bottom
            && self.bottom >= other.top
    }

    pub fn valid(self) -> bool {
        [self.left, self.right, self.top, self.bottom]
            .into_iter()
            .all(|side| (-HALF_WIDTH..=HALF_WIDTH).contains(&side) && side % 2.0 == 0.0)
            && self.left < self.right
            && self.top < self.bottom
            && (0.0..=12.0).contains(&self.height)
    }
}

#[derive(Clone, Copy, Default, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum Brush {
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
    redo: Vec<TerrainVertices>,
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

    pub fn toggle(&mut self) {
        self.open = !self.open;
        self.level = None;
        self.status = "";
    }

    pub fn select_brush(&mut self, brush: Brush) {
        self.brush = brush;
        self.level = None;
    }

    pub fn can_pick_flatten_height(&self) -> bool {
        self.open && matches!(self.brush, Brush::Flatten)
    }

    pub fn pick_flatten_height(&mut self) {
        if self.can_pick_flatten_height() {
            self.level = None;
            self.status = "";
        }
    }

    pub fn cycle_radius(&mut self, forward: bool) {
        let count = Self::RADII.len();
        self.radius_index = (self.radius_index + if forward { 1 } else { count - 1 }) % count;
    }

    pub fn controls(&mut self, keyboard: &ButtonInput<KeyCode>) {
        if keyboard.just_pressed(KeyCode::F4) {
            self.toggle();
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
                self.select_brush(brush);
            }
        }
        if keyboard.just_pressed(KeyCode::KeyP) {
            self.pick_flatten_height();
        }
        if keyboard.just_pressed(KeyCode::KeyZ) {
            if keyboard.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]) {
                self.redo();
            } else {
                self.undo();
            }
        }
        if keyboard.just_pressed(KeyCode::Backspace)
            && keyboard.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight])
        {
            self.reset();
        }
        if keyboard.just_pressed(KeyCode::BracketLeft) {
            self.cycle_radius(false);
        }
        if keyboard.just_pressed(KeyCode::BracketRight) {
            self.cycle_radius(true);
        }
    }

    pub fn can_undo(&self) -> bool {
        !self.history.is_empty()
    }

    pub fn can_redo(&self) -> bool {
        !self.redo.is_empty()
    }

    pub fn undo(&mut self) {
        let Some(previous) = self.history.pop_back() else {
            self.status = "No terrain edits to undo.";
            return;
        };
        self.redo
            .push(std::mem::replace(&mut self.vertices, previous));
        self.revision = self.revision.wrapping_add(1);
        self.status = "Terrain edit undone.";
    }

    pub fn redo(&mut self) {
        let Some(next) = self.redo.pop() else {
            self.status = "No terrain edits to redo.";
            return;
        };
        self.history
            .push_back(std::mem::replace(&mut self.vertices, next));
        self.revision = self.revision.wrapping_add(1);
        self.status = "Terrain edit redone.";
    }

    fn record_edit(&mut self, previous: TerrainVertices) {
        if self.history.len() == 20 {
            self.history.pop_front();
        }
        self.history.push_back(previous);
        self.redo.clear();
        self.revision = self.revision.wrapping_add(1);
    }

    pub(crate) fn reset(&mut self) {
        if self.vertices.is_empty() {
            self.status = "No terrain edits to reset.";
            return;
        }
        let previous = std::mem::take(&mut self.vertices);
        self.record_edit(previous);
        self.level = None;
        self.status = "Terrain reset. Press Z to undo.";
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
            (Brush::Flatten, Some(_)) => "Click or drag to flatten · P Pick new height",
            _ => "Click or drag to shape the ground",
        };
        format!(
            "Terrain · {tool} · {} m radius{level}
1 Raise · 2 Lower · 3 Flatten · 4 Smooth
{instruction} · [ ] Radius · Z Undo · Shift+Z Redo · Shift+Backspace Reset · Esc Close
Terrain edits use no money, materials or resident work.
{}",
            Self::RADII[self.radius_index],
            self.status
        )
    }

    pub fn terrain(&self, mut terrain: Terrain) -> Terrain {
        terrain.edits = Arc::clone(&self.vertices);
        terrain
    }

    #[cfg(test)]
    pub fn stroke(&mut self, terrain: &Terrain, point: Vec3, occupied: impl Fn(IVec2) -> bool) {
        self.stroke_path(terrain, &[point], occupied);
    }

    pub(crate) fn scripted_stroke(
        &mut self,
        terrain: &Terrain,
        brush: Brush,
        points: &[[f32; 2]],
        occupied: impl Fn(IVec2) -> bool,
    ) -> Result<(), String> {
        let inside = -(HALF_WIDTH as f32)..=HALF_WIDTH as f32;
        if !(1..=256).contains(&points.len())
            || points
                .iter()
                .flatten()
                .any(|coordinate| !inside.contains(coordinate))
        {
            return Err("Choose 1–256 terrain points inside the plot.".into());
        }
        let samples: Vec<_> = points
            .iter()
            .map(|&[x, z]| Vec3::new(x, terrain.height_at(x, z), z))
            .collect();
        self.select_brush(brush);
        let before = self.revision;
        self.stroke_path(terrain, &samples, occupied);
        if self.revision == before {
            return Err(self.status.into());
        }
        Ok(())
    }

    pub fn stroke_path(
        &mut self,
        terrain: &Terrain,
        points: &[Vec3],
        occupied: impl Fn(IVec2) -> bool,
    ) {
        let previous = Arc::clone(&self.vertices);
        let mut working = self.terrain(terrain.clone());
        let mut changed = false;
        for &point in points {
            changed |= self.apply_brush(&mut working, point, &occupied);
        }
        if changed {
            self.vertices = working.edits;
            self.record_edit(previous);
            self.status = "";
        }
    }

    fn brush_vertices(
        &self,
        terrain: &Terrain,
        x: f64,
        z: f64,
        occupied: impl Fn(IVec2) -> bool,
    ) -> impl Iterator<Item = (f64, f64, f64)> {
        let radius = Self::RADII[self.radius_index];
        let bounds = move |center: f64| {
            let min = ((center - radius) / 2.0).ceil().max(-HALF_WIDTH / 2.0) as i32;
            let max = ((center + radius) / 2.0).floor().min(HALF_WIDTH / 2.0) as i32;
            min..=max
        };
        bounds(x)
            .flat_map(move |column| bounds(z).map(move |row| (column, row)))
            .filter_map(move |(column, row)| {
                let (a, b) = (f64::from(column * 2), f64::from(row * 2));
                let distance = (a - x).hypot(b - z);
                let cell = IVec2::new(column + 32, row + 32);
                (distance < radius && !terrain.protected_vertex(a, b) && !occupied(cell))
                    .then_some((a, b, distance))
            })
    }

    pub fn inspect_brush(
        &self,
        terrain: &Terrain,
        point: Vec3,
        occupied: impl Fn(IVec2) -> bool,
    ) -> String {
        let height = terrain.height_at(point.x, point.z);
        let protection = if self
            .brush_vertices(terrain, point.x.into(), point.z.into(), occupied)
            .next()
            .is_none()
        {
            " · No editable ground within brush"
        } else {
            ""
        };
        format!("Ground {height:.2} m{protection}")
    }

    fn apply_brush(
        &mut self,
        terrain: &mut Terrain,
        point: Vec3,
        occupied: impl Fn(IVec2) -> bool,
    ) -> bool {
        let (x, z) = (f64::from(point.x), f64::from(point.z));
        if !(-HALF_WIDTH..=HALF_WIDTH).contains(&x) || !(-HALF_WIDTH..=HALF_WIDTH).contains(&z) {
            return false;
        }
        if matches!(self.brush, Brush::Flatten) && self.level.is_none() {
            let height = f64::from(point.y);
            if !(0.0..=12.0).contains(&height) {
                self.status = "Choose a grade between 0 and 12 m.";
                return false;
            }
            self.level = Some(height);
        }

        let radius = Self::RADII[self.radius_index];
        // Sample neighbours before applying the dab so smoothing uses a single
        // surface, and keep all dabs in one working map for this drag.
        let mut updates = Vec::new();
        for (a, b, distance) in self.brush_vertices(terrain, x, z, occupied) {
            let old = terrain.elevation(a, b);
            let weight = (1.0 - distance / radius).powi(2);
            let next = match self.brush {
                Brush::Raise => old + 0.6 * weight,
                Brush::Lower => old - 0.6 * weight,
                Brush::Flatten => old + (self.level.unwrap_or(old) - old) * (2.0 * weight).min(1.0),
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
                updates.push((vertex_index(a, b).expect("bounded vertex"), next));
            }
        }
        let changed = !updates.is_empty();
        if changed {
            Arc::make_mut(&mut terrain.edits).extend(updates);
        }
        self.status = if changed {
            ""
        } else {
            "No ground changed at this location."
        };
        changed
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
            camp: None,
            foundations: Arc::default(),
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
        let pad = self.pads().any(|pad| {
            (pad.left - 2.0..=pad.right + 2.0).contains(&x)
                && (pad.top - 2.0..=pad.bottom + 2.0).contains(&z)
        });
        (x - center).abs() <= width + 4.9 || road || stock || pad
    }

    fn pads(&self) -> impl Iterator<Item = &Foundation> {
        self.camp.iter().chain(self.foundations.iter())
    }

    pub fn foundation(&self, position: IVec2, size: IVec2) -> Option<Foundation> {
        let start = world_position(position.x as f32, position.y as f32) - Vec2::splat(2.0);
        let end = position + size;
        let end = world_position(end.x as f32, end.y as f32);
        let center = (start + end) * 0.5;
        let mut pad = Foundation {
            left: start.x.into(),
            right: end.x.into(),
            top: start.y.into(),
            bottom: end.y.into(),
            height: 0.0,
        };
        let mut adjacent = self.pads().filter(|other| pad.touches(**other));
        pad.height = if let Some(first) = adjacent.next() {
            if adjacent.any(|other| (other.height - first.height).abs() > 0.001) {
                return None;
            }
            first.height
        } else {
            self.height_at(center.x, center.y).into()
        };
        pad.valid().then_some(pad)
    }

    pub fn with_camp(mut self, cell: IVec2) -> Self {
        self.camp = self.foundation(cell + IVec2::new(-1, -3), IVec2::new(5, 4));
        self
    }

    pub fn with_foundations(mut self, foundations: &Arc<Vec<Foundation>>) -> Self {
        self.foundations = Arc::clone(foundations);
        self
    }

    pub fn elevation(&self, x: f64, z: f64) -> f64 {
        let mut total = 0.0;
        let mut graded = 0.0;
        let mut strongest: f64 = 0.0;
        for pad in self.pads() {
            // Most vertices are outside a given pad's grading apron.
            if x <= pad.left - 8.0
                || x >= pad.right + 8.0
                || z <= pad.top - 8.0
                || z >= pad.bottom + 8.0
            {
                continue;
            }
            let distance = pad.distance(x, z);
            if distance < 0.0001 {
                return pad.height;
            }
            if distance < 8.0 {
                let t = distance / 8.0;
                let weight = 1.0 - t * t * (3.0 - 2.0 * t);
                total += weight;
                graded += pad.height * weight;
                strongest = strongest.max(weight);
            }
        }
        let natural = vertex_index(x, z)
            .and_then(|index| self.edits.get(&index).copied())
            .unwrap_or_else(|| self.natural_elevation(x, z));
        if total == 0.0 {
            return natural;
        }
        let (center, width) = self.river(z);
        let access_road = (f64::from(MAP_START)..=f64::from(ROAD_END)).contains(&z)
            && (x - f64::from(road_center(z as f32))).abs() < f64::from(road_width(z as f32)) + 1.0;
        if (x - center).abs() <= width + 2.9 || access_road {
            return natural;
        }
        natural * (1.0 - strongest) + (graded / total) * strongest
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
        for row in 0..=RIVER_ROWS {
            let z = f64::from(row) * 0.5 - HALF_WIDTH;
            let (center, width) = self.river(z);
            for column in 0..RIVER_COLUMNS {
                let lateral = river_lateral(column);
                let x = center + width * lateral;
                positions.push([x as f32, 0.05, z as f32]);
                if row < RIVER_ROWS && column < RIVER_COLUMNS - 1 {
                    let a = row * RIVER_COLUMNS + column;
                    indices.extend_from_slice(&[
                        a,
                        a + RIVER_COLUMNS,
                        a + 1,
                        a + RIVER_COLUMNS,
                        a + RIVER_COLUMNS + 1,
                        a + 1,
                    ]);
                }
            }
        }
        surface_mesh(positions, indices)
    }

    pub fn river_boulders(&self) -> [RiverBoulder; RIVER_BOULDER_COUNT] {
        let mut random = land_random(self.seed ^ 0x5a1d9);
        std::array::from_fn(|index| {
            let z = -HALF_WIDTH + 18.0 + index as f64 * 29.0 + random() * 9.0;
            let side = if random() < 0.5 { -1.0 } else { 1.0 };
            let (center, width) = self.river(z);
            let x = center + side * width * (0.55 + random() * 0.12);
            RiverBoulder {
                center: Vec2::new(x as f32, z as f32),
                radius: (0.3 + random() * 0.24) as f32,
                palette: (random() * 3.0) as usize,
                yaw: (random() * std::f64::consts::PI) as f32,
            }
        })
    }

    pub fn river_bank_mesh(&self, extra: f64, height: f32) -> Mesh {
        let mut positions = Vec::new();
        let mut indices = Vec::new();
        for row in 0..=CELLS * 2 {
            let z = f64::from(row) - HALF_WIDTH;
            let (center, width) = self.river(z);
            let edge = width + extra * (0.82 + noise(z / 7.0, 2.0, self.seed) * 0.18);
            for x in [center - edge, center + edge] {
                positions.push([x as f32, height, z as f32]);
            }
            if row < CELLS * 2 {
                let a = row * 2;
                indices.extend_from_slice(&[a, a + 2, a + 1, a + 2, a + 3, a + 1]);
            }
        }
        surface_mesh(positions, indices)
    }
}

fn river_lateral(column: u32) -> f64 {
    let across = f64::from(column) / f64::from(RIVER_COLUMNS - 1);
    ((across - 0.5) * std::f64::consts::PI).sin()
}

pub struct RiverBoulder {
    pub center: Vec2,
    pub radius: f32,
    pub palette: usize,
    pub yaw: f32,
}

impl RiverBoulder {
    fn foam(&self, point: Vec2, seconds: f64, streak: f64) -> f64 {
        let delta = point - self.center;
        let radius = f64::from(self.radius) * 0.9;
        let distance = f64::from(delta.length());
        let rim = 1.0 - smoothstep(0.08, 0.38, (distance - radius).abs());
        let ring = ((distance - radius) * 11.0 - seconds * 2.2)
            .sin()
            .max(0.0)
            .powi(10);
        let reach = if distance >= radius {
            1.0 - smoothstep(radius + 0.25, radius + 1.65, distance)
        } else {
            0.0
        };
        let z = f64::from(delta.y);
        let wake = (-f64::from(delta.x.abs()) * 3.0).exp()
            * smoothstep(0.0, 0.4, z)
            * (1.0 - smoothstep(0.4, 2.4, z));
        rim * 0.28 + ring * reach * 0.22 + wake * streak * 0.6
    }
}

fn smoothstep(low: f64, high: f64, value: f64) -> f64 {
    let t = ((value - low) / (high - low)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

pub fn river_colors(
    seconds: f64,
    seed: u32,
    positions: &[[f32; 3]],
    rocks: &[RiverBoulder],
) -> Vec<[f32; 4]> {
    let deep = Color::srgb_u8(58, 110, 127).to_linear();
    let shallow = Color::srgb_u8(108, 160, 150).to_linear();
    let ripple = Color::srgb_u8(161, 195, 185).to_linear();
    let mut colors = Vec::with_capacity(positions.len());
    for points in positions.as_chunks::<{ RIVER_COLUMNS as usize }>().0 {
        let z = points[0][2];
        let downstream = f64::from(z) + HALF_WIDTH - seconds * 0.38;
        let nearby = rocks.iter().find(|rock| (rock.center.y - z).abs() <= 2.5);
        for (column, &[x, _, z]) in points.iter().enumerate() {
            let lateral = river_lateral(column as u32);
            let across = (lateral + 1.0) * 0.5;
            let edge = lateral.abs();
            let crest = (downstream * 0.83 + (across * 9.0 + downstream * 0.13).sin()).sin();
            let streak = (across * 19.0 + downstream * 0.29).cos().max(0.0);
            let bank = ((edge - 0.94) / 0.06).clamp(0.0, 1.0);
            let edge_flow = noise(lateral * 4.2, downstream * 0.32, seed);
            let bank_foam = bank * bank * (3.0 - 2.0 * bank) * (0.08 + edge_flow * 0.13);
            let eddy = nearby.map_or(0.0, |rock| rock.foam(Vec2::new(x, z), seconds, streak));
            let foam = (crest.max(0.0).powi(4) * streak * 0.23 + bank_foam + eddy).min(0.55);
            let tint = deep
                .mix(&shallow, edge.powi(2) as f32)
                .mix(&ripple, foam as f32);
            colors.push([tint.red, tint.green, tint.blue, 1.0]);
        }
    }
    colors
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
        assert_eq!(
            editor.inspect_brush(&terrain, at, |_| false),
            "Ground 0.00 m"
        );
        assert!(
            editor
                .inspect_brush(&terrain, at, |_| true)
                .contains("No editable ground")
        );
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
        editor.redo();
        assert_eq!(
            editor.terrain(base()).elevation(40.0, 24.0),
            smoothed.elevation(40.0, 24.0)
        );
        editor.undo();
        editor.brush = Brush::Raise;
        editor.stroke(&editor.terrain(base()), at, |_| false);
        let revision = editor.revision;
        editor.redo();
        assert_eq!(editor.revision, revision);
    }

    #[test]
    fn resetting_terrain_is_undoable() {
        let base = || Terrain::new(0, 1.0, 1.0);
        let mut editor = TerrainEditor::default();
        editor.stroke(&base(), Vec3::new(40.0, 0.0, 24.0), |_| false);
        editor.reset();
        assert_eq!(editor.terrain(base()).elevation(40.0, 24.0), 0.0);
        editor.undo();
        assert_eq!(editor.terrain(base()).elevation(40.0, 24.0), 0.6);
        editor.redo();
        assert_eq!(editor.terrain(base()).elevation(40.0, 24.0), 0.0);
    }

    #[test]
    fn a_drag_is_one_undoable_stroke() {
        let base = Terrain::new(0, 1.0, 1.0);
        let mut editor = TerrainEditor::default();
        let first = Vec3::new(40.0, 0.0, 24.0);
        let second = Vec3::new(42.0, 0.0, 24.0);
        editor.stroke_path(&base, &[first, second], |_| false);
        let raised = editor.terrain(base.clone());
        assert!(raised.elevation(40.0, 24.0) > 0.6);
        assert!(raised.elevation(42.0, 24.0) > 0.6);
        assert_eq!(editor.revision, 1);
        editor.undo();
        assert_eq!(editor.terrain(base.clone()).elevation(40.0, 24.0), 0.0);
        editor.redo();
        assert_eq!(
            editor.terrain(base).elevation(42.0, 24.0),
            raised.elevation(42.0, 24.0)
        );
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
        editor.open = true;
        let mut keys = ButtonInput::default();
        keys.press(KeyCode::KeyP);
        editor.controls(&keys);
        assert!(editor.level.is_none());
        assert_eq!(editor.terrain(base()).elevation(40.0, 24.0), 1.25);
        editor.stroke(&terrain, Vec3::new(56.0, 2.5, 42.0), |_| false);
        assert_eq!(editor.level, Some(2.5));
    }

    #[test]
    fn project_pads_match_v2_and_reject_conflicting_grades() {
        let mut terrain = Terrain::new(42, 1.0, 1.0).with_camp(IVec2::new(36, 36));
        let first = terrain
            .foundation(IVec2::new(43, 35), IVec2::new(2, 3))
            .unwrap();
        terrain = terrain.with_foundations(&Arc::new(vec![first]));
        let adjacent = terrain
            .foundation(IVec2::new(46, 38), IVec2::new(2, 3))
            .unwrap();
        assert_eq!(adjacent.height, first.height);
        let second = terrain
            .foundation(IVec2::new(47, 38), IVec2::new(2, 3))
            .unwrap();
        let pads = Arc::new(vec![first, second]);
        terrain = terrain.with_foundations(&pads);
        assert!(
            terrain
                .foundation(IVec2::new(45, 37), IVec2::splat(2))
                .is_none()
        );
        for (x, z, expected) in [
            (20.0, 6.0, 2.5218430707450206),
            (28.0, 8.0, 2.7922280607864827),
            (26.0, 14.0, 2.7394255172261306),
            (24.0, 14.0, 2.6658015882521133),
            (30.0, 14.0, 2.9631012216889085),
        ] {
            assert!((terrain.elevation(x, z) - expected).abs() < 1e-6);
        }

        let mut editor = TerrainEditor::default();
        editor.stroke(&terrain, Vec3::new(22.0, 2.5, 8.0), |_| false);
        assert_eq!(editor.terrain(terrain).elevation(22.0, 8.0), first.height);
        assert!(
            !editor
                .vertices
                .contains_key(&vertex_index(22.0, 8.0).unwrap())
        );
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
