//! Opt-in frame timing readout, after V2's `?performance`: `--performance` natively, or
//! `&performance` added to any web address. Frame times include browser scheduling and
//! GPU stalls, like V2's.

use std::collections::VecDeque;

use bevy::prelude::*;

use crate::ui_font::ui_font_styled;

/// Frames kept for the rolling figures, about five seconds at 60 frames a second.
const WINDOW: usize = 300;

pub struct PerformancePlugin;

impl Plugin for PerformancePlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<Frames>()
            .add_systems(Startup, spawn)
            .add_systems(Last, record);
    }
}

#[derive(Resource, Default)]
struct Frames {
    times: VecDeque<f32>,
    since_update: f32,
}

#[derive(Component)]
struct Readout;

type AnyLight = Or<(With<PointLight>, With<SpotLight>, With<DirectionalLight>)>;

fn spawn(mut commands: Commands, assets: Res<AssetServer>) {
    commands.spawn((
        Readout,
        Text::new("Measuring frames…"),
        ui_font_styled(&assets, 12.0, 500, Color::WHITE),
        Node {
            position_type: PositionType::Absolute,
            right: px(18),
            bottom: px(150),
            max_width: px(420),
            padding: UiRect::all(px(10)),
            border_radius: BorderRadius::all(px(6)),
            ..default()
        },
        BackgroundColor(Color::srgba_u8(0x18, 0x3b, 0x2e, 0xea)),
        GlobalZIndex(40),
        Pickable::IGNORE,
    ));
}

/// Frames per second, 95th-percentile and worst frame time in milliseconds.
fn summary(times: &VecDeque<f32>) -> Option<(f32, f32, f32)> {
    if times.is_empty() {
        return None;
    }
    let total: f32 = times.iter().sum();
    let mut sorted: Vec<f32> = times.iter().copied().collect();
    sorted.sort_by(f32::total_cmp);
    let p95 = sorted[((sorted.len() as f32 * 0.95) as usize).min(sorted.len() - 1)];
    Some((
        times.len() as f32 / total,
        p95 * 1000.,
        sorted[sorted.len() - 1] * 1000.,
    ))
}

fn record(
    time: Res<Time<Real>>,
    mut frames: ResMut<Frames>,
    mut readout: Single<&mut Text, With<Readout>>,
    entities: Query<()>,
    meshes: Query<(), With<Mesh3d>>,
    lights: Query<(), AnyLight>,
) {
    let delta = time.delta_secs();
    if delta <= 0. {
        return;
    }
    frames.times.push_back(delta);
    if frames.times.len() > WINDOW {
        frames.times.pop_front();
    }
    frames.since_update += delta;
    if frames.since_update < 1. {
        return;
    }
    frames.since_update = 0.;
    if let Some((rate, p95, worst)) = summary(&frames.times) {
        readout.0 = format!(
            "{rate:.0} frames/s · p95 {p95:.0} ms · worst {worst:.0} ms\n{} entities · {} meshes · {} lights",
            entities.iter().count(),
            meshes.iter().count(),
            lights.iter().count(),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn summary_reports_rate_p95_and_worst_frame() {
        let mut times: VecDeque<f32> = std::iter::repeat_n(1. / 60., 95).collect();
        times.extend(std::iter::repeat_n(0.05, 5));
        let (rate, p95, worst) = summary(&times).unwrap();
        assert!((rate - 100. / (95. / 60. + 0.25)).abs() < 0.01);
        assert_eq!(p95.round(), 50.);
        assert_eq!(worst.round(), 50.);
        assert!(summary(&VecDeque::new()).is_none());
    }
}
