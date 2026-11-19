use bevy::prelude::*;

use super::{SIZE, orbit_camera};

pub(super) const LIGHT_POSITION: Vec3 = Vec3::new(-6.0, 18.0, 7.0);
const OPACITY: u32 = 59;

pub(super) fn ground_point(point: Vec3) -> Vec3 {
    let shadow = point - LIGHT_POSITION * (point.y / LIGHT_POSITION.y).max(0.0);
    Vec3::new(shadow.x, 0.0, shadow.z)
}

pub(super) fn mask(triangles: &[[Vec3; 3]], rotation: Quat, ppm: f32) -> Vec<u8> {
    let side = SIZE as usize;
    let mut coverage = vec![0_u8; side * side];
    let view = orbit_camera(0.0, 30.0, Vec3::ZERO);
    let project = |point| {
        let ground = ground_point(rotation * point);
        Vec2::new(SIZE as f32 * 0.5, SIZE as f32 * 0.75)
            + Vec2::new(view.right().dot(ground), -view.up().dot(ground)) * ppm
    };
    for triangle in triangles {
        let [a, b, c] = triangle.map(project);
        let area = (b - a).perp_dot(c - a);
        if area.abs() < 0.001 {
            continue;
        }
        let low = a.min(b).min(c).floor().max(Vec2::ZERO).as_ivec2();
        let high = a
            .max(b)
            .max(c)
            .ceil()
            .min(Vec2::splat(SIZE as f32 - 1.0))
            .as_ivec2();
        let sign = area.signum();
        for y in low.y..=high.y {
            for x in low.x..=high.x {
                let offset = y as usize * side + x as usize;
                if coverage[offset] != 0 {
                    continue;
                }
                let point = Vec2::new(x as f32 + 0.5, y as f32 + 0.5);
                if [(a, b), (b, c), (c, a)]
                    .into_iter()
                    .all(|(from, to)| sign * (to - from).perp_dot(point - from) >= 0.0)
                {
                    coverage[offset] = 1;
                }
            }
        }
    }

    let mut blurred = vec![0; side * side];
    for y in 1..side - 1 {
        for x in 1..side - 1 {
            let mut sum = 0;
            for row in y - 1..=y + 1 {
                sum += coverage[row * side + x - 1..=row * side + x + 1]
                    .iter()
                    .map(|&value| u32::from(value))
                    .sum::<u32>();
            }
            blurred[y * side + x] = ((sum * OPACITY + 4) / 9) as u8;
        }
    }
    blurred
}

pub(super) fn composite(pixels: &mut [u8], mask: &[u8]) {
    for (pixel, &shadow) in pixels.as_chunks_mut::<4>().0.iter_mut().zip(mask) {
        let original = u32::from(pixel[3]);
        let output = original + (u32::from(shadow) * (255 - original) + 127) / 255;
        if original == output {
            continue;
        }
        for channel in &mut pixel[..3] {
            *channel = ((u32::from(*channel) * original + output / 2) / output) as u8;
        }
        pixel[3] = output as u8;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn projected_ground_shadow_is_transparent_and_leaves_opaque_model_pixels_intact() {
        let triangle = [
            Vec3::new(-2.0, 2.0, -2.0),
            Vec3::new(2.0, 2.0, -2.0),
            Vec3::new(0.0, 2.0, 2.0),
        ];
        let mask = mask(&[triangle], Quat::IDENTITY, 48.0);
        assert_eq!(*mask.iter().max().unwrap(), OPACITY as u8);
        assert_eq!(mask[0], 0);
        assert!(mask.iter().any(|&alpha| alpha > 0 && alpha < OPACITY as u8));

        let mut pixels = [20, 30, 40, 255, 0, 0, 0, 0, 100, 50, 20, 128];
        composite(&mut pixels, &[59, 59, 59]);
        assert_eq!(&pixels[..4], &[20, 30, 40, 255]);
        assert_eq!(&pixels[4..8], &[0, 0, 0, 59]);
        assert_eq!(&pixels[8..], &[82, 41, 16, 157]);
    }
}
