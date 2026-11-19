use bevy::{prelude::*, window::PrimaryWindow};

use super::Runner;
use crate::{arrival::world_position, catalog::Catalog};

#[derive(Resource, Default, PartialEq)]
pub(super) struct MapVisible(pub bool);

pub(super) fn draw(
    visible: Res<MapVisible>,
    runner: Res<Runner>,
    catalog: Res<Catalog>,
    window: Single<&Window, With<PrimaryWindow>>,
    mut gizmos: Gizmos,
) {
    if !visible.0 {
        return;
    }
    let side = (window.height() - 230.0)
        .min(window.width() - 48.0)
        .max(1.0);
    let center = Vec2::new(0.0, -75.0);
    let scale = side / 256.0;
    let point = |p: Vec2| center + Vec2::new(p.x, -p.y) * scale;
    gizmos.rect_2d(
        Isometry2d::from_translation(center),
        Vec2::splat(side),
        Color::srgb_u8(109, 138, 103),
    );

    let river = Color::srgb_u8(76, 160, 186);
    for edge in [-1.0, 1.0] {
        gizmos.linestrip_2d(
            (-128..=128).step_by(2).map(|z| {
                let (x, width) = runner.terrain.river(f64::from(z));
                point(Vec2::new((x + edge * width) as f32, z as f32))
            }),
            river,
        );
    }

    let construction = &runner.village.construction;
    for (built, models) in [
        (
            true,
            construction.finished_models(&catalog).collect::<Vec<_>>(),
        ),
        (
            false,
            construction
                .construction_models(&catalog)
                .collect::<Vec<_>>(),
        ),
    ] {
        let tint = if built {
            Color::srgb_u8(171, 225, 162)
        } else {
            Color::srgb_u8(247, 197, 106)
        };
        for (_, _, position, _) in models {
            gizmos.rect_2d(
                Isometry2d::from_translation(point(position)),
                Vec2::splat(6.0),
                tint,
            );
        }
    }
    let camp = world_position(runner.camp.x as f32, runner.camp.y as f32);
    gizmos.circle_2d(
        Isometry2d::from_translation(point(camp)),
        6.0,
        Color::srgb_u8(151, 208, 243),
    );
    for (index, _) in crate::village::NAMES.iter().enumerate() {
        if construction.driver_away(index)
            || construction.away_for_work(index)
            || construction.resident_sleeping(index)
        {
            continue;
        }
        let position = construction.worker(index).position;
        gizmos.circle_2d(
            Isometry2d::from_translation(point(world_position(position.x, position.y))),
            3.0,
            Color::srgb_u8(255, 242, 209),
        );
    }
}
