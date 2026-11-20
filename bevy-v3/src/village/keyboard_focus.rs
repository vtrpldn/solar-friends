//! Keyboard reach for every on-screen button, on the title screens and in the village.
//!
//! Tab and Shift+Tab move a focus ring through the buttons the mouse could press right
//! now, in reading order; once a button has focus, the arrow keys move to the nearest
//! button in that direction instead of panning the camera. Enter presses the focused
//! button, unless the player is typing into a field, and Escape lets go of the focus.
//! Space stays Pause.

use bevy::{
    input::InputSystems,
    input_focus::InputFocus,
    ui::{ComputedNode, FocusPolicy, UiGlobalTransform, UiSystems},
};

use super::*;
use crate::theme;

pub(super) fn install(app: &mut App) {
    app.init_resource::<InputFocus>()
        .init_resource::<Released>()
        .add_systems(
            PreUpdate,
            (release, navigate, show_focus, scroll_into_view)
                .chain()
                .after(InputSystems)
                .after(UiSystems::Focus),
        )
        .add_systems(PostUpdate, draw_ring.after(UiSystems::Layout));
}

/// The button pressed from the keyboard last frame, to let go of this frame.
#[derive(Resource, Default)]
struct Released(Option<Entity>);

/// The ring drawn around the focused button.
#[derive(Component)]
struct Ring;

type Buttons<'w, 's> = Query<
    'w,
    's,
    (
        Entity,
        &'static ComputedNode,
        &'static UiGlobalTransform,
        &'static InheritedVisibility,
    ),
    With<Button>,
>;

type Blockers<'w, 's> = Query<
    'w,
    's,
    (
        Entity,
        &'static ComputedNode,
        &'static UiGlobalTransform,
        &'static InheritedVisibility,
        Option<&'static FocusPolicy>,
    ),
    With<Interaction>,
>;

/// Whether keys are going into a text or number field, where Enter confirms the entry.
fn typing(village: &Village, setup: &WorldSetup, saves: &SaveMenu) -> bool {
    village.numeric_entry.is_some()
        || village.editing_inventory
        || village.construction.editing_search
        || village.guide.searching()
        || setup.entering_seed()
        || saves.entry.is_some()
}

fn release(mut released: ResMut<Released>, mut interactions: Query<&mut Interaction>) {
    if let Some(entity) = released.0.take()
        && let Ok(mut interaction) = interactions.get_mut(entity)
        && *interaction == Interaction::Pressed
    {
        *interaction = Interaction::None;
    }
}

/// A button the mouse could reach now: shown, with size, and not covered by another
/// node that blocks interaction, such as a dialog's dimmed backdrop.
fn reachable(
    entity: Entity,
    node: &ComputedNode,
    transform: &UiGlobalTransform,
    visible: &InheritedVisibility,
    blockers: &Blockers,
    parents: &Query<&ChildOf>,
) -> bool {
    if !visible.get() || node.size().min_element() <= 0. {
        return false;
    }
    let centre = transform.translation;
    !blockers
        .iter()
        .any(|(other, other_node, other_transform, shown, policy)| {
            other != entity
                && shown.get()
                && other_node.stack_index > node.stack_index
                && policy.is_none_or(|policy| *policy == FocusPolicy::Block)
                && other_node.contains_point(*other_transform, centre)
                && !parents
                    .iter_ancestors(other)
                    .chain(std::iter::once(other))
                    .any(|ancestor| ancestor == entity)
                && !parents
                    .iter_ancestors(entity)
                    .any(|ancestor| ancestor == other)
        })
}

/// Reading order: rows from the top, then left to right within a row.
fn reading_order(a: Vec2, b: Vec2) -> std::cmp::Ordering {
    let row = |point: Vec2| (point.y / 16.).round() as i64;
    row(a)
        .cmp(&row(b))
        .then(a.x.total_cmp(&b.x))
        .then(a.y.total_cmp(&b.y))
}

/// The nearest point in `direction`, favouring targets straight ahead over diagonal ones.
fn nearest_in(from: Vec2, direction: Vec2, points: &[(Entity, Vec2)]) -> Option<Entity> {
    points
        .iter()
        .filter_map(|&(entity, point)| {
            let offset = point - from;
            let ahead = offset.dot(direction);
            (ahead > 1.).then(|| {
                let aside = (offset - direction * ahead).length();
                (entity, ahead + aside * 2.)
            })
        })
        .min_by(|a, b| a.1.total_cmp(&b.1))
        .map(|(entity, _)| entity)
}

#[allow(clippy::too_many_arguments)]
fn navigate(
    mut keys: ResMut<ButtonInput<KeyCode>>,
    mut focus: ResMut<InputFocus>,
    mut released: ResMut<Released>,
    (village, setup, saves): (Res<Village>, Res<WorldSetup>, Res<SaveMenu>),
    buttons: Buttons,
    blockers: Blockers,
    parents: Query<&ChildOf>,
    mut interactions: Query<&mut Interaction>,
) {
    let points: Vec<(Entity, Vec2)> = {
        let mut points: Vec<_> = buttons
            .iter()
            .filter(|(entity, node, transform, visible)| {
                reachable(*entity, node, transform, visible, &blockers, &parents)
            })
            .map(|(entity, _, transform, _)| (entity, transform.translation))
            .collect();
        points.sort_by(|a, b| reading_order(a.1, b.1));
        points
    };
    // Focus lets go when its button closes or slips under a dialog.
    if let Some(current) = focus.get()
        && !points.iter().any(|(entity, _)| *entity == current)
    {
        focus.clear();
    }
    let shift = keys.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]);
    if keys.just_pressed(KeyCode::Tab) {
        keys.reset(KeyCode::Tab);
        if points.is_empty() {
            return;
        }
        let index = focus
            .get()
            .and_then(|current| points.iter().position(|(entity, _)| *entity == current));
        let next = match (index, shift) {
            (None, false) => 0,
            (None, true) => points.len() - 1,
            (Some(index), false) => (index + 1) % points.len(),
            (Some(index), true) => (index + points.len() - 1) % points.len(),
        };
        focus.set(points[next].0);
        return;
    }
    let Some(current) = focus.get() else {
        return;
    };
    if keys.just_pressed(KeyCode::Escape) {
        keys.reset(KeyCode::Escape);
        focus.clear();
        return;
    }
    let from = points
        .iter()
        .find(|(entity, _)| *entity == current)
        .map(|(_, point)| *point)
        .unwrap_or_default();
    for (key, direction) in [
        (KeyCode::ArrowUp, Vec2::NEG_Y),
        (KeyCode::ArrowDown, Vec2::Y),
        (KeyCode::ArrowLeft, Vec2::NEG_X),
        (KeyCode::ArrowRight, Vec2::X),
    ] {
        // While a button has focus the arrows belong to it, not to the camera.
        // A quick tap can arrive and lift within one frame, so check both states.
        if keys.pressed(key) || keys.just_pressed(key) {
            let moved = keys.just_pressed(key);
            keys.reset(key);
            if moved && let Some(next) = nearest_in(from, direction, &points) {
                focus.set(next);
            }
        }
    }
    if keys.any_just_pressed([KeyCode::Enter, KeyCode::NumpadEnter])
        && !typing(&village, &setup, &saves)
    {
        keys.reset(KeyCode::Enter);
        keys.reset(KeyCode::NumpadEnter);
        if let Ok(mut interaction) = interactions.get_mut(current) {
            *interaction = Interaction::Pressed;
            released.0 = Some(current);
        }
    }
}

/// The focused button looks and reads as hovered, so its tooltip or the reason it is
/// unavailable shows without a mouse.
fn show_focus(
    focus: Res<InputFocus>,
    mut hovered: Local<Option<Entity>>,
    mut interactions: Query<&mut Interaction>,
) {
    let current = focus.get();
    if *hovered != current
        && let Some(previous) = hovered.take()
        && let Ok(mut interaction) = interactions.get_mut(previous)
        && *interaction == Interaction::Hovered
    {
        *interaction = Interaction::None;
    }
    if let Some(entity) = current
        && let Ok(mut interaction) = interactions.get_mut(entity)
    {
        if *interaction == Interaction::None {
            *interaction = Interaction::Hovered;
        }
        *hovered = Some(entity);
    }
}

/// Scrolls the nearest scrolling panel so a newly focused button is in view.
fn scroll_into_view(
    focus: Res<InputFocus>,
    parents: Query<&ChildOf>,
    nodes: Query<(&ComputedNode, &UiGlobalTransform)>,
    mut panels: Query<(&mut ScrollPosition, &ComputedNode, &UiGlobalTransform)>,
) {
    if !focus.is_changed() {
        return;
    }
    let Some(entity) = focus.get() else {
        return;
    };
    let Ok((node, transform)) = nodes.get(entity) else {
        return;
    };
    let Some(panel) = parents
        .iter_ancestors(entity)
        .find(|ancestor| panels.contains(*ancestor))
    else {
        return;
    };
    let (mut scroll, panel_node, panel_transform) = panels.get_mut(panel).expect("scroll panel");
    let half = node.size().y / 2.;
    let panel_half = panel_node.size().y / 2.;
    let top = transform.translation.y - half - (panel_transform.translation.y - panel_half);
    let bottom = transform.translation.y + half - (panel_transform.translation.y + panel_half);
    // Physical pixels back to the logical units ScrollPosition uses, with a small margin.
    let to_logical = panel_node.inverse_scale_factor();
    if top < 0. {
        scroll.y = (scroll.y + (top - 12.) * to_logical).max(0.);
    } else if bottom > 0. {
        scroll.y += (bottom + 12.) * to_logical;
    }
}

fn draw_ring(
    mut commands: Commands,
    focus: Res<InputFocus>,
    rings: Query<Entity, With<Ring>>,
    mut outlines: Query<&mut Outline>,
) {
    if !focus.is_changed() {
        return;
    }
    for entity in &rings {
        commands.entity(entity).remove::<(Ring, Outline)>();
    }
    if let Some(entity) = focus.get()
        && outlines.get_mut(entity).is_err()
        && let Ok(mut target) = commands.get_entity(entity)
    {
        target.insert((Ring, Outline::new(px(3), px(2), theme::INK)));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reading_order_runs_along_rows_then_down() {
        let mut points = [
            Vec2::new(200., 101.),
            Vec2::new(10., 300.),
            Vec2::new(20., 98.),
        ];
        points.sort_by(|a, b| reading_order(*a, *b));
        assert_eq!(
            points,
            [
                Vec2::new(20., 98.),
                Vec2::new(200., 101.),
                Vec2::new(10., 300.)
            ]
        );
    }

    #[test]
    fn arrows_prefer_the_button_straight_ahead() {
        let a = Entity::from_raw_u32(1).unwrap();
        let b = Entity::from_raw_u32(2).unwrap();
        let points = [(a, Vec2::new(100., 40.)), (b, Vec2::new(60., 0.))];
        assert_eq!(nearest_in(Vec2::ZERO, Vec2::X, &points), Some(b));
        assert_eq!(nearest_in(Vec2::ZERO, Vec2::NEG_X, &points), None);
    }
}
