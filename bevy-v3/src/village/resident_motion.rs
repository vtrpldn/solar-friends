use bevy::prelude::*;

use super::SIMULATION_STEP;

// At 16× a typical resident walks about three meters per fixed tick.
const SNAP_DISTANCE: f32 = 4.0;
const TURN_RATE: f32 = 540.0_f32.to_radians();

#[derive(Component)]
pub(crate) struct ResidentMotion {
    rendered: Vec2,
    target: Vec2,
    remaining: f32,
    visible: bool,
    anchored: bool,
    pub(crate) ground_speed: f32,
    pub(crate) game_speed: f32,
    pub(crate) paused: bool,
}

impl ResidentMotion {
    pub(super) fn new(position: Vec2, visible: bool, anchored: bool) -> Self {
        Self {
            rendered: position,
            target: position,
            remaining: 0.0,
            visible,
            anchored,
            ground_speed: 0.0,
            game_speed: 1.0,
            paused: false,
        }
    }

    pub(super) fn step(&mut self, target: Vec2, visible: bool, anchored: bool, dt: f32) -> Vec2 {
        let snap = visible != self.visible
            || anchored != self.anchored
            || !visible
            || self.target.distance_squared(target) > SNAP_DISTANCE.powi(2);
        self.visible = visible;
        self.anchored = anchored;
        self.ground_speed = 0.0;
        if snap {
            self.rendered = target;
            self.remaining = 0.0;
        } else if target != self.target {
            // Consume a segment over one fixed tick, even on frames with no simulation step.
            self.remaining = SIMULATION_STEP as f32;
        }
        self.target = target;

        if !self.paused && self.remaining > 0.0 && dt > 0.0 {
            let previous = self.rendered;
            if self.remaining <= dt + f32::EPSILON {
                self.rendered = target;
                self.remaining = 0.0;
            } else {
                self.rendered = previous.lerp(target, dt / self.remaining);
                self.remaining -= dt;
            }
            self.ground_speed = previous.distance(self.rendered) / dt;
        }
        self.rendered
    }
}

pub(super) fn turn(current: Quat, target: Quat, game_speed: f32, dt: f32) -> Quat {
    // Faster games need quicker turns, but still show reversals over several frames.
    let max_angle = TURN_RATE * game_speed.sqrt().min(2.0) * dt.min(1.0 / 15.0);
    current.rotate_towards(target, max_angle)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn movement_reaches_each_target_in_one_tick_at_every_speed() {
        for speed in [1.0, 4.0, 8.0, 16.0] {
            let mut motion = ResidentMotion::new(Vec2::ZERO, true, false);
            let dt = SIMULATION_STEP as f32 / 4.0;
            let target = Vec2::X * 1.9 * speed * SIMULATION_STEP as f32;
            for frame in 1..=4 {
                let position = motion.step(target, true, false, dt);
                assert!(position.abs_diff_eq(target * (frame as f32 / 4.0), 1e-5));
                assert!((motion.ground_speed - 1.9 * speed).abs() < 1e-4);
            }
            assert_eq!(motion.rendered, target);
            assert_eq!(motion.step(target, true, false, dt), target);
            assert_eq!(motion.ground_speed, 0.0);
        }
    }

    #[test]
    fn visibility_anchor_changes_and_long_jumps_snap_without_a_speed_spike() {
        let mut motion = ResidentMotion::new(Vec2::ZERO, true, false);
        let near = Vec2::X * SNAP_DISTANCE;
        let far = near * 2.1;
        let dt = SIMULATION_STEP as f32 / 2.0;
        assert_eq!(motion.step(near, true, false, dt), near / 2.0);
        assert_eq!(motion.step(far, true, false, dt), far);
        assert_eq!(motion.step(far + Vec2::X, true, true, dt), far + Vec2::X);
        assert_eq!(motion.step(far, false, true, dt), far);
        assert_eq!(motion.step(far + Vec2::Y, true, true, dt), far + Vec2::Y);
        assert_eq!(motion.ground_speed, 0.0);
    }

    #[test]
    fn pause_holds_the_rendered_position_until_resume() {
        let mut motion = ResidentMotion::new(Vec2::ZERO, true, false);
        let dt = SIMULATION_STEP as f32 / 2.0;
        assert_eq!(motion.step(Vec2::X, true, false, dt), Vec2::X / 2.0);
        motion.paused = true;
        assert_eq!(motion.step(Vec2::X, true, false, 1.0), Vec2::X / 2.0);
        assert_eq!(motion.ground_speed, 0.0);
        motion.paused = false;
        assert_eq!(motion.step(Vec2::X, true, false, dt), Vec2::X);
    }

    #[test]
    fn turns_take_the_short_arc_and_limit_reversals() {
        let reversed = Quat::from_rotation_y(std::f32::consts::PI);
        let first = turn(Quat::IDENTITY, reversed, 16.0, 0.5);
        assert!((Quat::IDENTITY.angle_between(first).to_degrees() - 72.0).abs() < 1e-3);
        let left = Quat::from_rotation_y(179.0_f32.to_radians());
        let right = Quat::from_rotation_y(-179.0_f32.to_radians());
        assert!(turn(left, right, 1.0, 0.016).angle_between(right) < 1e-4);
    }
}
