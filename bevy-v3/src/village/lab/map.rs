use bevy::{input::mouse::AccumulatedMouseScroll, prelude::*, window::PrimaryWindow};

use super::{LabOrder, Runner};
use crate::{
    arrival::{MAP_START, ROAD_END, road_center, road_width, world_position},
    catalog::Catalog,
};

#[derive(Resource, Default, PartialEq)]
pub(super) struct MapState {
    pub visible: bool,
    camera: Vec2,
    zoom_steps: f32,
    drag: Option<(Vec2, Vec2)>,
    dragging: bool,
    pub selected: Option<usize>,
    pub resource: Option<usize>,
    pub blueprint: Option<(String, u8)>,
    placement: Option<IVec2>,
    field_size: Option<IVec2>,
    pub preview_error: Option<&'static str>,
}

impl MapState {
    pub fn field_size(&self) -> IVec2 {
        self.field_size
            .unwrap_or_else(crate::construction::default_field_size)
    }

    pub fn build_order(
        &mut self,
        catalog: &Catalog,
        keys: &ButtonInput<KeyCode>,
    ) -> Option<LabOrder> {
        if keys.any_just_pressed([KeyCode::KeyB, KeyCode::Escape]) {
            self.placement = None;
            if self.blueprint.take().is_none() && keys.just_pressed(KeyCode::KeyB) {
                self.blueprint = Some(("gathering".into(), 0));
            }
            return None;
        }
        let (key, rotation) = self.blueprint.as_mut()?;
        if keys.just_pressed(KeyCode::KeyR) {
            *rotation = (*rotation + 1) % 4;
        }
        if keys.just_pressed(KeyCode::BracketRight) {
            if let Some(next) = catalog
                .projects
                .keys()
                .find(|next| *next > key)
                .or_else(|| catalog.projects.keys().next())
            {
                key.clone_from(next);
            }
        } else if keys.just_pressed(KeyCode::BracketLeft)
            && let Some(previous) = catalog
                .projects
                .keys()
                .rev()
                .find(|previous| *previous < key)
                .or_else(|| catalog.projects.keys().next_back())
        {
            key.clone_from(previous);
        }
        let field_size = if key == "field" {
            let dx = i32::from(keys.just_pressed(KeyCode::ArrowRight))
                - i32::from(keys.just_pressed(KeyCode::ArrowLeft));
            let dz = i32::from(keys.just_pressed(KeyCode::ArrowUp))
                - i32::from(keys.just_pressed(KeyCode::ArrowDown));
            let before = self
                .field_size
                .unwrap_or_else(crate::construction::default_field_size);
            let size = (before + IVec2::new(dx, dz)).clamp(IVec2::splat(2), IVec2::splat(32));
            self.field_size = Some(size);
            Some(size.to_array())
        } else {
            None
        };
        let cell = self.placement.take()?;
        Some(LabOrder::Build {
            key: key.clone(),
            x: cell.x,
            z: cell.y,
            rotation: *rotation,
            size: field_size,
        })
    }

    pub fn service_order(
        &self,
        runner: &Runner,
        keys: &ButtonInput<KeyCode>,
    ) -> Option<(LabOrder, &'static str)> {
        if self.blueprint.is_some() {
            return None;
        }
        if let Some(index) = self.resource {
            return keys.just_pressed(KeyCode::KeyG).then_some((
                LabOrder::Gather {
                    resource: index + 1,
                },
                "Gathering queued.",
            ));
        }
        let site = self.selected.map_or(0, |index| index + 1);
        let fresh = keys.just_pressed(KeyCode::KeyT);
        if (fresh || keys.just_pressed(KeyCode::KeyY))
            && let Some(water) = runner.village.construction.utilities.water_site(site)
        {
            let enabled = if fresh {
                !water.maintain_fresh
            } else {
                !water.maintain_sanitation
            };
            return Some((
                LabOrder::WaterPolicy {
                    site,
                    fresh,
                    enabled,
                },
                "Water policy updated.",
            ));
        }
        [
            (KeyCode::KeyC, LabOrder::CollectWater { site }),
            (KeyCode::KeyP, LabOrder::Purify { site }),
            (KeyCode::KeyV, LabOrder::ServiceWater { site }),
        ]
        .into_iter()
        .find(|(key, _)| keys.just_pressed(*key))
        .map(|(_, order)| (order, "Water service queued."))
    }

    pub fn water_details(&self, runner: &Runner, editable: bool) -> String {
        if self.resource.is_some() || self.blueprint.is_some() {
            return String::new();
        }
        let id = self.selected.map_or(0, |index| index + 1);
        let Some(site) = runner
            .village
            .construction
            .utilities
            .water_site(id)
            .filter(|site| site.capacity.iter().any(|&capacity| capacity > 0.0))
        else {
            return String::new();
        };
        let [drinking, raw, grey, waste] = site.levels;
        let target = if id == 0 {
            "Camp water"
        } else {
            "Water storage"
        };
        let mut details = format!(
            "\n{target} · {drinking:.1} L drinking · {raw:.1} L untreated · {grey:.1} L greywater · {waste:.1} L sewage"
        );
        if editable && site.enabled {
            if site.capacity[1] > 0.0 {
                details.push_str(" · C Collect river water");
                if site.capacity[0] > 0.0 {
                    details.push_str(" · P Purify");
                }
            }
            if site.capacity[2] > 0.0 || site.capacity[3] > 0.0 {
                details.push_str(" · V Service waste");
            }
        }
        use std::fmt::Write as _;
        let binding = |label: &str| {
            if editable && site.enabled {
                format!(" ({label})")
            } else {
                String::new()
            }
        };
        if site.supports_water_policy(true) {
            let state = if site.maintain_fresh { "on" } else { "off" };
            let _ = write!(details, "\nDrinking reserve {state}{}", binding("T Toggle"));
        }
        if site.supports_water_policy(false) {
            let state = if site.maintain_sanitation {
                "on"
            } else {
                "off"
            };
            let _ = write!(
                details,
                "\nSanitation upkeep {state}{}",
                binding("Y Toggle")
            );
        }
        details
    }

    pub fn cancel_build(&mut self) {
        self.blueprint = None;
        self.placement = None;
        self.preview_error = None;
    }
}

fn clip_line(a: Vec2, b: Vec2, min: Vec2, max: Vec2) -> Option<(Vec2, Vec2)> {
    let delta = b - a;
    let (mut start, mut end) = (0.0_f32, 1.0_f32);
    for axis in 0..2 {
        if delta[axis] == 0.0 {
            if !(min[axis]..=max[axis]).contains(&a[axis]) {
                return None;
            }
            continue;
        }
        let near = (min[axis] - a[axis]) / delta[axis];
        let far = (max[axis] - a[axis]) / delta[axis];
        start = start.max(near.min(far));
        end = end.min(near.max(far));
    }
    (start <= end).then(|| (a + start * delta, a + end * delta))
}

pub(super) fn draw(
    mut map: ResMut<MapState>,
    (mouse, keys, scroll): (
        Res<ButtonInput<MouseButton>>,
        Res<ButtonInput<KeyCode>>,
        Res<AccumulatedMouseScroll>,
    ),
    runner: Res<Runner>,
    catalog: Res<Catalog>,
    window: Single<&Window, With<PrimaryWindow>>,
    mut gizmos: Gizmos,
) {
    if !map.visible {
        if map.drag.is_some() {
            map.drag = None;
        }
        return;
    }
    let side = (window.height() - 230.0)
        .min(window.width() - 48.0)
        .max(1.0);
    let center = Vec2::new(0.0, -75.0);
    let half = Vec2::splat(side * 0.5);
    let contains =
        |screen: Vec2, margin: Vec2| ((screen - center).abs() + margin).cmple(half).all();
    let cursor = window.cursor_position().map(|cursor| {
        Vec2::new(
            cursor.x - window.width() * 0.5,
            window.height() * 0.5 - cursor.y,
        )
    });
    let inside = cursor.filter(|&screen| contains(screen, Vec2::ZERO));
    let camp = world_position(runner.camp.x as f32, runner.camp.y as f32);
    if keys.just_pressed(KeyCode::Home) {
        map.camera = Vec2::new(camp.x, -camp.y);
        map.selected = None;
        map.resource = None;
        map.cancel_build();
        map.drag = None;
    }
    if inside.is_some() && scroll.delta.y != 0.0 {
        map.zoom_steps = (map.zoom_steps + scroll.delta.y.signum()).clamp(0.0, 12.0);
    }
    let scale = side / 256.0 * 1.15_f32.powf(map.zoom_steps);
    if mouse.just_pressed(MouseButton::Left) {
        map.drag = inside.map(|position| (position, map.camera));
        map.dragging = false;
    }
    if let Some((origin, camera)) = map.drag
        && let Some(screen) = cursor
        && (map.dragging || screen.distance_squared(origin) > 16.0)
    {
        map.dragging = true;
        map.camera =
            (camera - (screen - origin) / scale).clamp(Vec2::splat(-128.0), Vec2::splat(128.0));
    }
    let clicked = mouse.just_released(MouseButton::Left) && map.drag.is_some() && !map.dragging;
    if !mouse.pressed(MouseButton::Left) {
        map.drag = None;
    }
    let camera = map.camera;
    let point = |p: Vec2| center + (Vec2::new(p.x, -p.y) - camera) * scale;
    gizmos.rect_2d(
        Isometry2d::from_translation(center),
        Vec2::splat(side),
        Color::srgb_u8(109, 138, 103),
    );

    let mut path = |points: Vec<Vec2>, tint| {
        for pair in points.windows(2) {
            if let Some((a, b)) = clip_line(pair[0], pair[1], center - half, center + half) {
                gizmos.line_2d(a, b, tint);
            }
        }
    };
    for edge in [-1.0, 1.0] {
        path(
            (-128..=128)
                .step_by(2)
                .map(|z| {
                    let (x, width) = runner.terrain.river(f64::from(z));
                    point(Vec2::new((x + edge * width) as f32, z as f32))
                })
                .collect(),
            Color::srgb_u8(76, 160, 186),
        );
        path(
            (MAP_START as i32..=ROAD_END as i32)
                .step_by(2)
                .map(|z| {
                    let z = z as f32;
                    point(Vec2::new(road_center(z) + edge as f32 * road_width(z), z))
                })
                .collect(),
            Color::srgb_u8(184, 150, 110),
        );
    }
    let clipped_marker = |position: Vec2, size: Vec2| {
        let min = (position - size * 0.5).max(center - half);
        let max = (position + size * 0.5).min(center + half);
        min.cmplt(max)
            .all()
            .then_some(((min + max) * 0.5, max - min))
    };
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
    map.preview_error = None;
    if let Some(screen) = inside {
        if let Some((key, rotation)) = &map.blueprint {
            let offset = (screen - center) / scale + camera;
            let cell = (Vec2::new(offset.x, -offset.y) * 0.5 + Vec2::splat(32.0))
                .round()
                .as_ivec2();
            let ground = crate::construction::ConstructionSite {
                terrain: &runner.terrain,
                land: &runner.land,
                camp: runner.camp,
            };
            let (size, error) = construction.lab_map_preview(
                &catalog,
                ground,
                runner.village.stock.sandbox,
                (key, cell, *rotation, map.field_size()),
            );
            let position = cell.as_vec2() + (size.as_vec2() - Vec2::ONE) * 0.5;
            let tint = if error.is_some() {
                Color::srgb_u8(240, 111, 101)
            } else {
                Color::WHITE
            };
            let marker = point(world_position(position.x, position.y));
            let size = (size.as_vec2() * 2.0 * scale).max(Vec2::splat(4.0));
            if let Some((marker, size)) = clipped_marker(marker, size) {
                gizmos.rect_2d(Isometry2d::from_translation(marker), size, tint);
            }
            map.preview_error = error;
            if clicked {
                map.placement = Some(cell);
            }
        } else if clicked {
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
    for (index, position) in resources().filter(|&(_, p)| contains(p, Vec2::splat(2.0))) {
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
        let position = point(position);
        let size = (size * scale).max(Vec2::splat(6.0));
        if let Some((position, size)) = clipped_marker(position, size) {
            gizmos.rect_2d(Isometry2d::from_translation(position), size, tint);
        }
    }
    if contains(point(camp), Vec2::splat(6.0)) {
        gizmos.circle_2d(
            Isometry2d::from_translation(point(camp)),
            6.0,
            Color::srgb_u8(151, 208, 243),
        );
    }
    for (index, _) in crate::village::NAMES.iter().enumerate() {
        if construction.driver_away(index)
            || construction.away_for_work(index)
            || construction.resident_sleeping(index)
        {
            continue;
        }
        let position = construction.worker(index).position;
        let position = point(world_position(position.x, position.y));
        if contains(position, Vec2::splat(3.0)) {
            gizmos.circle_2d(
                Isometry2d::from_translation(position),
                3.0,
                Color::srgb_u8(255, 242, 209),
            );
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn map_paths_clip_crossing_lines_and_hide_offscreen_lines() {
        let min = Vec2::splat(-1.0);
        let max = Vec2::splat(1.0);
        assert_eq!(
            clip_line(Vec2::new(-2.0, 0.0), Vec2::new(2.0, 0.0), min, max),
            Some((Vec2::NEG_X, Vec2::X))
        );
        assert_eq!(
            clip_line(Vec2::splat(2.0), Vec2::new(2.0, 0.0), min, max),
            None
        );
    }

    #[test]
    fn field_placement_records_the_selected_dimensions_before_rotation() {
        let catalog = Catalog::default();
        let mut map = MapState {
            blueprint: Some(("field".into(), 0)),
            placement: Some(IVec2::new(40, 36)),
            ..default()
        };
        let mut keys = ButtonInput::default();
        keys.press(KeyCode::ArrowRight);
        keys.press(KeyCode::KeyR);
        assert!(matches!(
            map.build_order(&catalog, &keys),
            Some(LabOrder::Build {
                x: 40,
                z: 36,
                rotation: 1,
                size: Some([3, 2]),
                ..
            })
        ));
        assert_eq!(map.field_size(), IVec2::new(3, 2));
    }
}
