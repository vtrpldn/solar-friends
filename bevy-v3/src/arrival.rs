use bevy::prelude::*;

pub const ARRIVAL_DURATION: f32 = 17.0;
pub const PARK_Z: f32 = -94.0;
pub const ROAD_END: f32 = PARK_Z + 6.0;
pub const MAP_START: f32 = -128.0;
const PARK_TIME: f32 = 6.0;

pub const ARRIVAL_SPOTS: [(f32, f32); 5] = [
    (30.0, -11.3),
    (30.8, -10.8),
    (31.7, -11.4),
    (32.6, -10.7),
    (33.3, -11.5),
];

pub fn world_position(cell_x: f32, cell_z: f32) -> Vec2 {
    Vec2::new((cell_x - 32.0) * 2.0, (cell_z - 32.0) * 2.0)
}

pub fn road_center(z: f32) -> f32 {
    let t = ((PARK_Z - z) / 36.0).clamp(0.0, 1.0);
    1.1 - 7.0 * t * t
}

/// How much the drawn road widens as it opens into the parking clearing.
pub fn road_flare(z: f32) -> f32 {
    if z > PARK_Z - 4.0 {
        1.0 + (z - PARK_Z + 4.0) * 0.045
    } else {
        1.0
    }
}

pub fn road_width(z: f32) -> f32 {
    if z < MAP_START + 12.0 {
        8.3
    } else if z > PARK_Z - 3.0 {
        5.6
    } else {
        4.5
    }
}

pub struct Pose {
    pub position: Vec2,
    pub yaw: f32,
    pub step_height: f32,
    pub visible: bool,
}

pub fn vehicle_pose(elapsed: f32, index: usize) -> Pose {
    let t = ((elapsed - index as f32 * 2.0) / PARK_TIME).clamp(0.0, 1.0);
    let remaining = 1.0 - t * t * (3.0 - 2.0 * t);
    let distance = (PARK_Z - MAP_START) * remaining;
    let z = PARK_Z - distance;
    let parked_x = if index == 0 { -1.0 } else { 3.2 };
    Pose {
        position: Vec2::new(road_center(z) + parked_x - 1.1, z),
        yaw: (14.0 * distance / 36.0).atan2(36.0),
        step_height: 0.0,
        visible: true,
    }
}

pub fn car_door(index: usize) -> IVec2 {
    IVec2::new(if index == 0 { 30 } else { 35 }, 32 + (PARK_Z / 2.0) as i32)
}

const TOWN_DRIVE_SECONDS: f64 = 18.0;

pub(crate) enum TownDrivePhase {
    Outbound,
    Away,
    Inbound,
}

pub(crate) fn town_drive_phase(elapsed: f64, duration: f64) -> TownDrivePhase {
    if elapsed < TOWN_DRIVE_SECONDS {
        TownDrivePhase::Outbound
    } else if elapsed < duration - TOWN_DRIVE_SECONDS {
        TownDrivePhase::Away
    } else {
        TownDrivePhase::Inbound
    }
}

pub fn town_vehicle_pose(elapsed: f64, duration: f64, vehicle: usize) -> Pose {
    let parked = vehicle_pose(ARRIVAL_DURATION, vehicle);
    let (outgoing, t) = match town_drive_phase(elapsed, duration) {
        TownDrivePhase::Outbound => (true, elapsed / TOWN_DRIVE_SECONDS),
        TownDrivePhase::Away => {
            return Pose {
                visible: false,
                ..parked
            };
        }
        TownDrivePhase::Inbound => (
            false,
            (elapsed - duration + TOWN_DRIVE_SECONDS) / TOWN_DRIVE_SECONDS,
        ),
    };
    let t = t as f32;
    let smooth = t * t * (3.0 - 2.0 * t);
    let fraction = if outgoing { smooth } else { 1.0 - smooth };
    let z = PARK_Z + (MAP_START - 8.0 - PARK_Z) * fraction;
    let x = road_center(z) + (parked.position.x - road_center(PARK_Z)) * (1.0 - fraction);
    let ahead = z + if outgoing { -0.1 } else { 0.1 };
    let tangent = (road_center(ahead) - road_center(z)).atan2(ahead - z);
    Pose {
        position: Vec2::new(x, z),
        yaw: if outgoing {
            tangent * (t * 10.0).min(1.0)
        } else {
            tangent
        },
        ..parked
    }
}

pub fn resident_pose(elapsed: f32, index: usize) -> Pose {
    let car = usize::from(index >= 3);
    let seat = index - car * 3;
    let start = PARK_TIME + car as f32 * 2.0 + 0.5 + seat as f32 * 0.9;
    let progress = ((elapsed - start) / 4.0).clamp(0.0, 1.0);
    let side = if seat.is_multiple_of(2) { 1.0 } else { -1.0 };
    let parked_x = if car == 0 { -1.0 } else { 3.2 };
    let exit = Vec2::new(parked_x + side * 1.15, PARK_Z + 0.3);
    let corner = Vec2::new(parked_x + side * 1.5, PARK_Z + 3.1);
    let (x, z) = ARRIVAL_SPOTS[index];
    let target = world_position(x, z);
    let (from, to, t) = if progress < 0.35 {
        (exit, corner, progress / 0.35)
    } else {
        (corner, target, (progress - 0.35) / 0.65)
    };
    let direction = to - from;
    Pose {
        position: from.lerp(to, t),
        yaw: direction.x.atan2(direction.y),
        step_height: (0.3 * (1.0 - progress * 1.4 * 4.0)).max(0.0),
        visible: elapsed >= start,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opening_poses_match_the_reference_timing() {
        let car = vehicle_pose(3.0, 0);
        assert!(
            car.position
                .abs_diff_eq(Vec2::new(-2.560_956_7, -111.0), 0.0001)
        );
        assert!((car.yaw - 0.181_618_36).abs() < 0.0001);
        assert!(!resident_pose(6.0, 0).visible);
        let walking = resident_pose(8.0, 0);
        assert!(walking.visible);
        assert!(
            walking
                .position
                .abs_diff_eq(Vec2::new(0.326_923_07, -90.734_62), 0.0001)
        );
        let parked = resident_pose(ARRIVAL_DURATION, 4);
        assert!(parked.visible);
        assert!(parked.position.abs_diff_eq(Vec2::new(2.6, -87.0), 0.0001));
    }
}
