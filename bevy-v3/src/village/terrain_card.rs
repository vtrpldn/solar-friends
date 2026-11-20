use bevy::ui::FocusPolicy;

use super::*;
use crate::{
    terrain::Brush,
    theme,
    ui_font::{ui_font_styled, ui_font_weight},
};

#[derive(Component)]
struct TerrainCard;

#[derive(Component)]
enum TerrainText {
    Brush,
    Radius,
    Hint,
    DisabledReason,
}

#[derive(Component, Clone, Copy)]
enum TerrainAction {
    Close,
    BrushStep(bool),
    RadiusStep(bool),
    PickFlattenHeight,
    Undo,
    Redo,
}

pub(super) fn install(app: &mut App) {
    app.add_systems(Startup, spawn)
        .add_systems(Update, input.after(read_camp_pointer).before(village_input))
        .add_systems(Update, refresh.after(show_hud));
}

fn visible(village: &Village, setup: &WorldSetup, saves: &SaveMenu, sound: &SoundSettings) -> bool {
    village.terrain_editor.open
        && village.utility_panel.is_none()
        && !village.advance_open()
        && !village.guide.open()
        && !village.lenses.open
        && !setup.open
        && !saves.open
        && !sound.open
        && !build_menu::visible(setup, village, saves, sound)
}

fn radius_label(radius: f64) -> &'static str {
    if radius <= 5.0 {
        "Small · 2 cells"
    } else if radius <= 10.0 {
        "Medium · 4 cells"
    } else {
        "Large · 6 cells"
    }
}

fn spawn_stepper(
    parent: &mut ChildSpawnerCommands,
    assets: &AssetServer,
    caption: &str,
    marker: TerrainText,
    prev: TerrainAction,
    next: TerrainAction,
) {
    parent
        .spawn(Node {
            flex_direction: FlexDirection::Column,
            row_gap: px(4),
            ..default()
        })
        .with_children(|section| {
            section.spawn((
                Text::new(caption),
                ui_font_styled(assets, 10., 750, theme::CAPTION),
            ));
            section
                .spawn(Node {
                    align_items: AlignItems::Center,
                    column_gap: px(6),
                    ..default()
                })
                .with_children(|row| {
                    spawn_button(row, assets, prev, "‹", UiRect::axes(px(10), px(5)));
                    row.spawn((
                        Node {
                            flex_grow: 1.,
                            min_width: px(0),
                            justify_content: JustifyContent::Center,
                            padding: UiRect::axes(px(8), px(5)),
                            border: UiRect::all(px(1)),
                            border_radius: BorderRadius::all(px(10)),
                            ..default()
                        },
                        BackgroundColor(theme::CARD),
                        BorderColor::all(theme::SUBTLE_BORDER),
                    ))
                    .with_child((
                        marker,
                        Text::default(),
                        ui_font_weight(assets, 13., 600),
                    ));
                    spawn_button(row, assets, next, "›", UiRect::axes(px(10), px(5)));
                });
        });
}

fn spawn_button(
    parent: &mut ChildSpawnerCommands,
    assets: &AssetServer,
    action: TerrainAction,
    label: &str,
    padding: UiRect,
) {
    parent
        .spawn((
            action,
            Button,
            theme::button_node(Node {
                padding,
                align_items: AlignItems::Center,
                justify_content: JustifyContent::Center,
                ..default()
            }),
            theme::button(),
        ))
        .with_child((Text::new(label), ui_font_weight(assets, 13., 600)));
}

fn spawn(mut commands: Commands, assets: Res<AssetServer>) {
    commands
        .spawn((
            TerrainCard,
            Interaction::None,
            FocusPolicy::Block,
            GlobalZIndex(10),
            theme::panel_node(Node {
                display: Display::None,
                position_type: PositionType::Absolute,
                left: px(22),
                top: px(TOP_BAR_CLEARANCE),
                width: px(280),
                flex_direction: FlexDirection::Column,
                padding: UiRect::all(px(16)),
                row_gap: px(10),
                ..default()
            }),
            theme::panel(),
        ))
        .with_children(|card| {
            card.spawn(Node {
                align_items: AlignItems::Center,
                justify_content: JustifyContent::SpaceBetween,
                column_gap: px(8),
                ..default()
            })
            .with_children(|header| {
                header
                    .spawn(Node {
                        flex_direction: FlexDirection::Column,
                        row_gap: px(1),
                        ..default()
                    })
                    .with_children(|left| {
                        left.spawn((
                            Text::new("TERRAIN TOOLS"),
                            ui_font_styled(&assets, 10., 750, theme::CAPTION),
                        ));
                        left.spawn((
                            Text::new("Shape the land"),
                            ui_font_weight(&assets, 21., 750),
                        ));
                    });
                header
                    .spawn((
                        TerrainAction::Close,
                        Button,
                        Node {
                            width: px(30),
                            height: px(30),
                            border: UiRect::all(px(2)),
                            border_radius: BorderRadius::MAX,
                            align_items: AlignItems::Center,
                            justify_content: JustifyContent::Center,
                            flex_shrink: 0.,
                            ..default()
                        },
                        theme::button(),
                    ))
                    .with_child((Text::new("×"), ui_font_weight(&assets, 18., 700)));
            });

            card.spawn((
                Text::new("Instant and free. Click or drag the ground to apply a brush."),
                ui_font_styled(&assets, 12., 400, theme::MUTED),
            ));

            spawn_stepper(
                card,
                &assets,
                "TOOL",
                TerrainText::Brush,
                TerrainAction::BrushStep(false),
                TerrainAction::BrushStep(true),
            );
            spawn_stepper(
                card,
                &assets,
                "BRUSH RADIUS",
                TerrainText::Radius,
                TerrainAction::RadiusStep(false),
                TerrainAction::RadiusStep(true),
            );

            card.spawn((
                Node {
                    padding: UiRect::axes(px(10), px(8)),
                    border: UiRect::left(px(3)),
                    border_radius: BorderRadius::all(px(8)),
                    ..default()
                },
                BackgroundColor(theme::INSET),
                BorderColor::all(theme::LEAF),
            ))
            .with_child((
                TerrainText::Hint,
                Text::default(),
                ui_font_weight(&assets, 12., 500),
            ));

            spawn_button(
                card,
                &assets,
                TerrainAction::PickFlattenHeight,
                "Pick a new flatten height",
                UiRect::axes(px(10), px(7)),
            );

            card.spawn(Node {
                column_gap: px(8),
                ..default()
            })
            .with_children(|row| {
                row.spawn((
                    TerrainAction::Undo,
                    Button,
                    theme::button_node(Node {
                        flex_grow: 1.,
                        padding: UiRect::axes(px(10), px(7)),
                        align_items: AlignItems::Center,
                        justify_content: JustifyContent::Center,
                        ..default()
                    }),
                    theme::button(),
                ))
                .with_child((
                    Text::new("Undo terrain edit"),
                    ui_font_weight(&assets, 13., 600),
                ));
                row.spawn((
                    TerrainAction::Redo,
                    Button,
                    theme::button_node(Node {
                        padding: UiRect::axes(px(12), px(7)),
                        align_items: AlignItems::Center,
                        justify_content: JustifyContent::Center,
                        ..default()
                    }),
                    theme::button(),
                ))
                .with_child((Text::new("Redo"), ui_font_weight(&assets, 13., 600)));
            });

            card.spawn((
                TerrainText::DisabledReason,
                Text::default(),
                ui_font_styled(&assets, 11., 500, theme::CAPTION),
                Node {
                    display: Display::None,
                    ..default()
                },
            ));

            card.spawn((
                Text::new(
                    "Riverbanks, roads, supplies and foundations stay protected. Esc closes these tools.",
                ),
                ui_font_styled(&assets, 11., 400, theme::MUTED),
            ));
        });
}

fn button_state(action: TerrainAction, village: &Village) -> (bool, bool, Option<&'static str>) {
    let editor = &village.terrain_editor;
    match action {
        TerrainAction::Close | TerrainAction::BrushStep(_) | TerrainAction::RadiusStep(_) => {
            (true, true, None)
        }
        TerrainAction::PickFlattenHeight => (
            editor.can_pick_flatten_height(),
            editor.can_pick_flatten_height(),
            None,
        ),
        TerrainAction::Undo => (
            true,
            editor.can_undo(),
            (!editor.can_undo()).then_some("There are no terrain edits to undo in this session."),
        ),
        TerrainAction::Redo => (
            true,
            editor.can_redo(),
            (!editor.can_redo()).then_some("There are no undone terrain edits to redo."),
        ),
    }
}

type TerrainButtons<'w, 's> = Query<
    'w,
    's,
    (
        &'static TerrainAction,
        &'static Interaction,
        &'static mut Node,
        &'static mut BackgroundColor,
        &'static mut BorderColor,
        &'static mut BoxShadow,
    ),
    (Without<TerrainCard>, Without<TerrainText>),
>;

type TerrainTexts<'w, 's> = Query<
    'w,
    's,
    (&'static TerrainText, &'static mut Text, &'static mut Node),
    (Without<TerrainCard>, Without<TerrainAction>),
>;

fn refresh(
    village: Res<Village>,
    (setup, saves, sound): (Res<WorldSetup>, Res<SaveMenu>, Res<SoundSettings>),
    mut card: Single<&mut Node, With<TerrainCard>>,
    mut texts: TerrainTexts,
    mut buttons: TerrainButtons,
) {
    let open = visible(&village, &setup, &saves, &sound);
    let display = if open { Display::Flex } else { Display::None };
    if card.display != display {
        card.display = display;
    }
    if !open {
        return;
    }

    let editor = &village.terrain_editor;
    let brush = editor.brush();
    let mut hovered_reason = None;

    for (&action, &interaction, mut node, mut fill, mut edge, mut shadow) in &mut buttons {
        let (shown, enabled, reason) = button_state(action, &village);
        let btn_display = if shown { Display::Flex } else { Display::None };
        if node.display != btn_display {
            node.display = btn_display;
        }
        if !shown {
            continue;
        }
        theme::paint_button(
            interaction,
            enabled,
            false,
            &mut fill,
            &mut edge,
            &mut shadow,
        );
        if interaction != Interaction::None
            && let Some(reason) = reason
        {
            hovered_reason = Some(reason);
        }
    }

    let mut hint = match (brush, editor.flatten_level()) {
        (Brush::Flatten, None) => "Flatten uses the height of your first click.".to_owned(),
        (Brush::Flatten, Some(height)) => {
            format!("Flattening to {height:.2} m. Click or drag to flatten.")
        }
        _ => "Click or drag to shape the ground.".to_owned(),
    };
    if !editor.status().is_empty() {
        hint.push('\n');
        hint.push_str(editor.status());
    }

    for (part, mut text, mut node) in &mut texts {
        match part {
            TerrainText::Brush => {
                let wanted = brush.label();
                if text.0 != wanted {
                    text.0 = wanted.into();
                }
            }
            TerrainText::Radius => {
                let wanted = radius_label(editor.radius());
                if text.0 != wanted {
                    text.0 = wanted.into();
                }
            }
            TerrainText::Hint => {
                if text.0 != hint {
                    text.0.clone_from(&hint);
                }
            }
            TerrainText::DisabledReason => {
                let wanted = hovered_reason.unwrap_or("");
                let reason_display = if wanted.is_empty() {
                    Display::None
                } else {
                    Display::Flex
                };
                if node.display != reason_display {
                    node.display = reason_display;
                }
                if text.0 != wanted {
                    text.0 = wanted.into();
                }
            }
        }
    }
}

fn input(
    mut village: ResMut<Village>,
    (setup, saves, sound): (Res<WorldSetup>, Res<SaveMenu>, Res<SoundSettings>),
    buttons: Query<(&TerrainAction, &Interaction), Changed<Interaction>>,
) {
    if !visible(&village, &setup, &saves, &sound) {
        return;
    }
    for (&action, &interaction) in &buttons {
        if interaction != Interaction::Pressed {
            continue;
        }
        let (shown, enabled, _) = button_state(action, &village);
        if !shown || !enabled {
            continue;
        }
        match action {
            TerrainAction::Close => {
                village.terrain_editor.toggle();
                return;
            }
            TerrainAction::BrushStep(forward) => {
                let current = Brush::ALL
                    .iter()
                    .position(|&brush| brush == village.terrain_editor.brush())
                    .unwrap_or(0);
                let count = Brush::ALL.len();
                let next = if forward {
                    (current + 1) % count
                } else {
                    (current + count - 1) % count
                };
                village.terrain_editor.select_brush(Brush::ALL[next]);
            }
            TerrainAction::RadiusStep(forward) => village.terrain_editor.cycle_radius(forward),
            TerrainAction::PickFlattenHeight => village.terrain_editor.pick_flatten_height(),
            TerrainAction::Undo => village.terrain_editor.undo(),
            TerrainAction::Redo => village.terrain_editor.redo(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terrain_card_steps_brush_radius_and_closes() {
        let mut village = Village {
            camp: Some(CLEARING_CAMP),
            ..default()
        };
        village.terrain_editor.toggle();

        let mut app = App::new();
        app.insert_resource(village)
            .insert_resource(WorldSetup::default().session())
            .init_resource::<SaveMenu>()
            .init_resource::<SoundSettings>()
            .add_systems(Update, input);

        let press = |app: &mut App, action: TerrainAction| {
            let entity = app.world_mut().spawn((action, Interaction::Pressed)).id();
            app.update();
            app.world_mut().entity_mut(entity).despawn();
        };

        assert_eq!(
            app.world().resource::<Village>().terrain_editor.brush(),
            Brush::Raise
        );
        press(&mut app, TerrainAction::BrushStep(true));
        assert_eq!(
            app.world().resource::<Village>().terrain_editor.brush(),
            Brush::Lower
        );
        press(&mut app, TerrainAction::BrushStep(true));
        assert_eq!(
            app.world().resource::<Village>().terrain_editor.brush(),
            Brush::Flatten
        );

        let before_radius = app.world().resource::<Village>().terrain_editor.radius();
        press(&mut app, TerrainAction::RadiusStep(true));
        assert_ne!(
            app.world().resource::<Village>().terrain_editor.radius(),
            before_radius
        );

        press(&mut app, TerrainAction::Close);
        assert!(!app.world().resource::<Village>().terrain_editor.open);
    }
}
