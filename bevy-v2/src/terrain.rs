use bevy::{
    asset::RenderAssetUsages, mesh::Indices, prelude::*, render::render_resource::PrimitiveTopology,
};

const CELLS: u32 = 128;
const HALF_WIDTH: f64 = 128.0;

#[derive(Resource)]
pub struct Terrain {
    pub seed: u32,
    offset: f64,
    bend: f64,
    width: f64,
    hill_height: f64,
}

impl Terrain {
    pub fn new(seed: u32, water: f64, relief: f64) -> Self {
        let mut state = seed;
        let mut random = || {
            state = state.wrapping_add(0x6d2b79f5);
            let mut value = (state ^ (state >> 15)).wrapping_mul(1 | state);
            value ^= value.wrapping_add((value ^ (value >> 7)).wrapping_mul(61 | value));
            f64::from(value ^ (value >> 14)) / 4294967296.0
        };
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

    pub fn elevation(&self, x: f64, z: f64) -> f64 {
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

fn noise(x: f64, z: f64, seed: u32) -> f64 {
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
