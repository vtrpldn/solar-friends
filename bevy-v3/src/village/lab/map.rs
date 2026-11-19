use bevy::{prelude::*, window::PrimaryWindow};

use super::Runner;
use crate::{
    arrival::{MAP_START, ROAD_END, road_center, road_width, world_position},
    catalog::Catalog,
};

#[derive(Resource, Default, PartialEq)]
pub(super) struct MapState {
    pub visible: bool,
    pub selected: Option<usize>,
    pub resource: Option<usize>,
}

pub(super) fn draw(
    mut map: ResMut<MapState>,
    mouse: Res<ButtonInput<MouseButton>>,
    runner: Res<Runner>,
    catalog: Res<Catalog>,
    window: Single<&Window, With<PrimaryWindow>>,
    mut gizmos: Gizmos,
) {
    if !map.visible {
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

    for edge in [-1.0, 1.0] {
        gizmos.linestrip_2d(
            (MAP_START as i32..=ROAD_END as i32).step_by(2).map(|z| {
                let z = z as f32;
                point(Vec2::new(road_center(z) + edge * road_width(z), z))
            }),
            Color::srgb_u8(184, 150, 110),
        );
    }
    let resources = || {
        runner.land.sites().filter_map(|(index, site)| {
            if runner.village.tree_felled(index) {
                return None;
            }
            let cell = site.position.as_vec2() + (site.size.as_vec2() - Vec2::ONE) * 0.5;
            Some((index, point(world_position(cell.x, cell.y))))
        })
    };
    if map
        .resource
        .is_some_and(|selected| !resources().any(|(index, _)| index == selected))
    {
        map.resource = None;
    }
    let construction = &runner.village.construction;
    let projects = || construction.lab_map_projects(&catalog);
    if map
        .selected
        .is_some_and(|selected| !projects().any(|(index, ..)| index == selected))
    {
        map.selected = None;
    }
    if mouse.just_pressed(MouseButton::Left)
        && let Some(cursor) = window.cursor_position()
    {
        let screen = Vec2::new(
            cursor.x - window.width() * 0.5,
            window.height() * 0.5 - cursor.y,
        );
        if (screen - center).abs().cmple(Vec2::splat(side * 0.5)).all() {
            map.selected = projects()
                .filter_map(|(index, position, size, _)| {
                    let delta = (screen - point(position)).abs();
                    let marker = (size * scale * 0.5).max(Vec2::splat(4.0));
                    delta
                        .cmple(marker)
                        .all()
                        .then_some((index, delta.length_squared()))
                })
                .min_by(|a, b| a.1.total_cmp(&b.1))
                .map(|(index, _)| index);
            map.resource = if map.selected.is_some() {
                None
            } else {
                resources()
                    .map(|(index, position)| (index, screen.distance_squared(position)))
                    .filter(|(_, distance)| *distance <= 16.0)
                    .min_by(|a, b| a.1.total_cmp(&b.1))
                    .map(|(index, _)| index)
            };
        }
    }
    for (index, position) in resources() {
        let tint = if map.resource == Some(index) {
            Color::WHITE
        } else {
            Color::srgb_u8(146, 112, 178)
        };
        gizmos.circle_2d(Isometry2d::from_translation(position), 2.0, tint);
    }
    for (index, position, size, built) in projects() {
        let tint = if map.selected == Some(index) {
            Color::srgb_u8(255, 255, 255)
        } else if built {
            Color::srgb_u8(171, 225, 162)
        } else {
            Color::srgb_u8(247, 197, 106)
        };
        gizmos.rect_2d(
            Isometry2d::from_translation(point(position)),
            (size * scale).max(Vec2::splat(6.0)),
            tint,
        );
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

pub(super) fn resource_status(runner: &Runner, catalog: &Catalog, index: usize) -> Option<String> {
    let site = runner.land.site(index)?;
    let name = &catalog.gathering[site.recipe()].name;
    let status = runner.village.construction.gathering.resource_status(
        index,
        site,
        catalog,
        (
            runner.setup.seed(),
            runner.setup.richness(),
            runner.village.clock,
        ),
    );
    Some(format!("{name} · {status}"))
}
