use bevy::ui::{FocusPolicy, RelativeCursorPosition, UiGlobalTransform};

use super::*;
use crate::{
    CameraAction, theme,
    ui_font::{ui_font_styled, ui_font_weight},
};

const POPOVER_WIDTH: f32 = 312.0;
const FALLBACK_BOTTOM: f32 = 92.0;

#[derive(Component)]
struct ViewOptionsCard;

#[derive(Component, Clone, Copy)]
enum ViewOption {
    Controls,
    Camera(CameraAction),
    Grid,
    NewVillage,
    MainMenu,
    SavedVillages,
    BugReport,
    Volume { effects: bool, delta: i16 },
}

#[derive(Component)]
struct VolumeTrack(bool);

#[derive(Component)]
struct VolumeFill(bool);

#[derive(Component)]
enum ViewText {
    BugStatus,
    VolumeValue(bool),
}

#[derive(Default, Resource)]
struct BugReportFeedback {
    notice: String,
}

pub(super) fn install(app: &mut App) {
    app.init_resource::<BugReportFeedback>()
        .add_systems(Startup, spawn)
        .add_systems(Update, input.after(read_camp_pointer).before(village_input))
        .add_systems(Update, refresh.after(show_hud));
}

fn visible(
    village: &Village,
    picker: &toolbar::PanelPicker,
    setup: &WorldSetup,
    saves: &SaveMenu,
    sound: &SoundSettings,
) -> bool {
    picker.view_open
        && !setup.open
        && !saves.open
        && !sound.open
        && village.camp.is_some()
        && !village.map_input_blocked()
        && !village.advance_open()
        && !village.planning_roads()
        && !village.terrain_editor.open
        && !village.trade_open()
}

fn spawn_compact_button(
    parent: &mut ChildSpawnerCommands,
    assets: &AssetServer,
    action: ViewOption,
    label: &str,
) {
    parent
        .spawn((
            action,
            Button,
            theme::button_node(Node {
                height: px(32),
                padding: UiRect::axes(px(6), px(4)),
                align_items: AlignItems::Center,
                justify_content: JustifyContent::Center,
                ..default()
            }),
            theme::button(),
        ))
        .with_child((Text::new(label), ui_font_weight(assets, 12.5, 600)));
}

fn spawn_sound_row(
    parent: &mut ChildSpawnerCommands,
    assets: &AssetServer,
    label: &str,
    effects: bool,
) {
    parent
        .spawn(Node {
            flex_direction: FlexDirection::Column,
            row_gap: px(4),
            width: percent(100),
            ..default()
        })
        .with_children(|section| {
            section
                .spawn(Node {
                    align_items: AlignItems::Center,
                    justify_content: JustifyContent::SpaceBetween,
                    column_gap: px(8),
                    ..default()
                })
                .with_children(|header| {
                    header.spawn((Text::new(label), ui_font_weight(assets, 12., 600)));
                    header.spawn((
                        ViewText::VolumeValue(effects),
                        Text::new("0%"),
                        ui_font_styled(assets, 11.5, 700, theme::CAPTION),
                    ));
                });
            section
                .spawn(Node {
                    align_items: AlignItems::Center,
                    column_gap: px(6),
                    width: percent(100),
                    ..default()
                })
                .with_children(|row| {
                    row.spawn((
                        ViewOption::Volume { effects, delta: -5 },
                        Button,
                        theme::button_node(Node {
                            width: px(28),
                            height: px(26),
                            align_items: AlignItems::Center,
                            justify_content: JustifyContent::Center,
                            flex_shrink: 0.,
                            ..default()
                        }),
                        theme::button(),
                    ))
                    .with_child((Text::new("−"), ui_font_weight(assets, 14., 700)));

                    row.spawn((
                        VolumeTrack(effects),
                        Button,
                        RelativeCursorPosition::default(),
                        Node {
                            flex_grow: 1.,
                            height: px(12),
                            border_radius: BorderRadius::MAX,
                            overflow: Overflow::clip(),
                            ..default()
                        },
                        BackgroundColor(theme::TRACK),
                    ))
                    .with_child((
                        VolumeFill(effects),
                        Node {
                            width: percent(0),
                            height: percent(100),
                            border_radius: BorderRadius::MAX,
                            ..default()
                        },
                        BackgroundColor(theme::LEAF),
                        FocusPolicy::Pass,
                    ));

                    row.spawn((
                        ViewOption::Volume { effects, delta: 5 },
                        Button,
                        theme::button_node(Node {
                            width: px(28),
                            height: px(26),
                            align_items: AlignItems::Center,
                            justify_content: JustifyContent::Center,
                            flex_shrink: 0.,
                            ..default()
                        }),
                        theme::button(),
                    ))
                    .with_child((Text::new("+"), ui_font_weight(assets, 14., 700)));
                });
        });
}

fn spawn(mut commands: Commands, assets: Res<AssetServer>) {
    commands
        .spawn((
            ViewOptionsCard,
            Interaction::None,
            FocusPolicy::Block,
            GlobalZIndex(12),
            theme::panel_node(Node {
                display: Display::None,
                position_type: PositionType::Absolute,
                right: px(22),
                bottom: px(FALLBACK_BOTTOM),
                width: px(POPOVER_WIDTH),
                flex_direction: FlexDirection::Column,
                padding: UiRect::all(px(14)),
                row_gap: px(10),
                ..default()
            }),
            theme::panel(),
        ))
        .with_children(|card| {
            // Camera controls row: ?, Q, E, -, +
            card.spawn(Node {
                display: Display::Grid,
                grid_template_columns: RepeatedGridTrack::flex(5, 1.0),
                column_gap: px(6),
                width: percent(100),
                ..default()
            })
            .with_children(|row| {
                spawn_compact_button(row, &assets, ViewOption::Controls, "?");
                spawn_compact_button(
                    row,
                    &assets,
                    ViewOption::Camera(CameraAction::Turn(false)),
                    "Q",
                );
                spawn_compact_button(
                    row,
                    &assets,
                    ViewOption::Camera(CameraAction::Turn(true)),
                    "E",
                );
                spawn_compact_button(
                    row,
                    &assets,
                    ViewOption::Camera(CameraAction::Zoom(false)),
                    "−",
                );
                spawn_compact_button(
                    row,
                    &assets,
                    ViewOption::Camera(CameraAction::Zoom(true)),
                    "+",
                );
            });

            // Location and grid toggles row: Camp, River bend, Grid
            card.spawn(Node {
                display: Display::Grid,
                grid_template_columns: RepeatedGridTrack::flex(3, 1.0),
                column_gap: px(6),
                width: percent(100),
                ..default()
            })
            .with_children(|row| {
                spawn_compact_button(row, &assets, ViewOption::Camera(CameraAction::Camp), "Camp");
                spawn_compact_button(
                    row,
                    &assets,
                    ViewOption::Camera(CameraAction::River),
                    "River bend",
                );
                spawn_compact_button(row, &assets, ViewOption::Grid, "Grid");
            });

            // Overview and reset camera row
            card.spawn(Node {
                display: Display::Grid,
                grid_template_columns: RepeatedGridTrack::flex(2, 1.0),
                column_gap: px(6),
                width: percent(100),
                ..default()
            })
            .with_children(|row| {
                spawn_compact_button(
                    row,
                    &assets,
                    ViewOption::Camera(CameraAction::Overview),
                    "Whole plot",
                );
                spawn_compact_button(
                    row,
                    &assets,
                    ViewOption::Camera(CameraAction::Reset),
                    "Reset camera",
                );
            });

            // Session row: New village, Main menu
            card.spawn(Node {
                display: Display::Grid,
                grid_template_columns: RepeatedGridTrack::flex(2, 1.0),
                column_gap: px(6),
                width: percent(100),
                ..default()
            })
            .with_children(|row| {
                spawn_compact_button(row, &assets, ViewOption::NewVillage, "New village");
                spawn_compact_button(row, &assets, ViewOption::MainMenu, "Main menu");
            });

            // Saved villages
            spawn_compact_button(card, &assets, ViewOption::SavedVillages, "Saved villages");

            // Bug report
            card.spawn(Node {
                flex_direction: FlexDirection::Column,
                row_gap: px(5),
                width: percent(100),
                ..default()
            })
            .with_children(|section| {
                spawn_compact_button(section, &assets, ViewOption::BugReport, "Copy bug report");
                section.spawn((
                    Text::new("Copies village state, resident tasks, recent activity and errors."),
                    ui_font_styled(&assets, 11., 400, theme::MUTED),
                ));
                section.spawn((
                    ViewText::BugStatus,
                    Text::default(),
                    ui_font_styled(&assets, 11., 600, theme::CAPTION),
                    Node {
                        display: Display::None,
                        ..default()
                    },
                ));
            });

            // Sound sliders
            card.spawn((
                Node {
                    flex_direction: FlexDirection::Column,
                    row_gap: px(8),
                    width: percent(100),
                    border: UiRect::top(px(1)),
                    padding: UiRect::top(px(10)),
                    ..default()
                },
                BorderColor::all(theme::SUBTLE_BORDER),
            ))
            .with_children(|audio| {
                audio.spawn((
                    Text::new("SOUND"),
                    ui_font_styled(&assets, 10., 750, theme::CAPTION),
                ));
                spawn_sound_row(audio, &assets, "Music", false);
                spawn_sound_row(audio, &assets, "Interaction sounds", true);
                audio.spawn((
                    Text::new("Lower to 0% to mute."),
                    ui_font_styled(&assets, 11., 400, theme::MUTED),
                ));
            });
        });
}

type OptionButtons<'w, 's> = Query<
    'w,
    's,
    (
        &'static ViewOption,
        &'static Interaction,
        &'static mut BackgroundColor,
        &'static mut BorderColor,
        &'static mut BoxShadow,
    ),
>;

type AnchorQuery<'w, 's> = (
    Single<
        'w,
        's,
        (&'static ComputedNode, &'static UiGlobalTransform),
        (
            With<toolbar::Toolbar>,
            Without<ViewOptionsCard>,
            Without<toolbar::ViewOptionsButton>,
        ),
    >,
    Single<
        'w,
        's,
        (&'static ComputedNode, &'static UiGlobalTransform),
        (
            With<toolbar::ViewOptionsButton>,
            Without<ViewOptionsCard>,
            Without<toolbar::Toolbar>,
        ),
    >,
);

type RefreshState<'w> = (
    Res<'w, Village>,
    Res<'w, toolbar::PanelPicker>,
    Res<'w, WorldSetup>,
    Res<'w, SaveMenu>,
    Res<'w, SoundSettings>,
);

type PopoverCardNode<'w, 's> = Single<
    'w,
    's,
    &'static mut Node,
    (
        With<ViewOptionsCard>,
        Without<VolumeFill>,
        Without<ViewText>,
    ),
>;

type VolumeFills<'w, 's> = Query<
    'w,
    's,
    (&'static VolumeFill, &'static mut Node),
    (Without<ViewOptionsCard>, Without<ViewText>),
>;

type TextParts<'w, 's> = Query<
    'w,
    's,
    (&'static ViewText, &'static mut Text, &'static mut Node),
    (Without<ViewOptionsCard>, Without<VolumeFill>),
>;

fn refresh(
    (village, picker, setup, saves, sound): RefreshState,
    mut feedback: ResMut<BugReportFeedback>,
    (dock, view_button): AnchorQuery,
    mut card: PopoverCardNode,
    mut buttons: OptionButtons,
    mut fills: VolumeFills,
    mut texts: TextParts,
) {
    let open = visible(&village, &picker, &setup, &saves, &sound);
    let display = if open { Display::Flex } else { Display::None };
    if card.display != display {
        card.display = display;
    }
    if !open {
        if !feedback.notice.is_empty() {
            feedback.notice.clear();
        }
        return;
    }

    let (dock_node, dock_transform) = *dock;
    let (button_node, button_transform) = *view_button;
    let inv = dock_node.inverse_scale_factor();
    let dock_height = dock_node.size().y * inv;
    let bottom = if dock_height > 0.0 {
        18.0 + dock_height + 12.0
    } else {
        FALLBACK_BOTTOM
    };
    let dock_width = dock_node.size().x * inv;
    let right = if dock_width > 0.0 && button_node.size().x > 0.0 {
        let dock_right = dock_transform.translation.x + dock_node.size().x * 0.5;
        let button_right = button_transform.translation.x + button_node.size().x * 0.5;
        let offset = ((dock_right - button_right) * inv).max(0.0);
        let max_offset = (dock_width - POPOVER_WIDTH).max(0.0);
        22.0 + offset.min(max_offset)
    } else {
        22.0
    };
    if card.bottom != px(bottom) {
        card.bottom = px(bottom);
    }
    if card.right != px(right) {
        card.right = px(right);
    }

    for (&action, &interaction, mut fill, mut edge, mut shadow) in &mut buttons {
        let (enabled, active) = match action {
            ViewOption::Grid => (true, village.show_grid),
            ViewOption::Volume { effects, delta } => {
                let volume = sound.volume(effects);
                let can_step = if delta < 0 { volume > 0 } else { volume < 100 };
                (can_step, false)
            }
            _ => (true, false),
        };
        theme::paint_button(
            interaction,
            enabled,
            active,
            &mut fill,
            &mut edge,
            &mut shadow,
        );
    }

    for (fill, mut node) in &mut fills {
        let wanted = percent(f32::from(sound.volume(fill.0)));
        if node.width != wanted {
            node.width = wanted;
        }
    }

    for (part, mut text, mut node) in &mut texts {
        match part {
            ViewText::VolumeValue(effects) => {
                let wanted = format!("{}%", sound.volume(*effects));
                if text.0 != wanted {
                    text.0 = wanted;
                }
            }
            ViewText::BugStatus => {
                let status_display = if feedback.notice.is_empty() {
                    Display::None
                } else {
                    Display::Flex
                };
                if node.display != status_display {
                    node.display = status_display;
                }
                if text.0 != feedback.notice {
                    text.0.clone_from(&feedback.notice);
                }
            }
        }
    }
}

fn input(
    (mut setup, mut saves, mut sound): (
        ResMut<WorldSetup>,
        ResMut<SaveMenu>,
        ResMut<SoundSettings>,
    ),
    (mut village, catalog, mut picker, mut feedback): (
        ResMut<Village>,
        Res<Catalog>,
        ResMut<toolbar::PanelPicker>,
        ResMut<BugReportFeedback>,
    ),
    window: Single<&Window, With<PrimaryWindow>>,
    mut camera: Single<(&mut VillageCamera, &mut Projection)>,
    buttons: Query<(&ViewOption, &Interaction), Changed<Interaction>>,
    tracks: Query<(&VolumeTrack, &RelativeCursorPosition, &Interaction)>,
) {
    if !visible(&village, &picker, &setup, &saves, &sound) {
        return;
    }

    for (track, cursor, interaction) in &tracks {
        if *interaction == Interaction::Pressed
            && let Some(pos) = cursor.normalized
        {
            let volume = ((pos.x + 0.5).clamp(0.0, 1.0) * 100.0).round() as u8;
            sound.set_volume(track.0, volume);
        }
    }

    let (camera, projection) = &mut *camera;
    for (&action, &interaction) in &buttons {
        if interaction != Interaction::Pressed {
            continue;
        }
        match action {
            ViewOption::Controls => {
                village.guide.open_camera_controls();
                picker.view_open = false;
                return;
            }
            ViewOption::Camera(camera_action) => {
                if let Projection::Orthographic(projection) = &mut **projection {
                    crate::apply_camera_action(camera_action, &village, &setup, camera, projection);
                }
            }
            ViewOption::Grid => {
                village.show_grid = !village.show_grid;
            }
            ViewOption::NewVillage => {
                if let Err(error) = save_session(&saves, &village, &catalog) {
                    village.save_notice = format!("Could not save village: {error}");
                }
                setup.open_new_village();
                picker.dismiss();
                return;
            }
            ViewOption::MainMenu => {
                if let Err(error) = save_session(&saves, &village, &catalog) {
                    village.save_notice = format!("Could not save village: {error}");
                }
                setup.open_main_menu();
                picker.dismiss();
                return;
            }
            ViewOption::SavedVillages => {
                library_ui::toggle_library(&mut saves, setup.mode);
                picker.dismiss();
                return;
            }
            ViewOption::BugReport => {
                let notice = diagnostics::copy_notice(&village, &catalog, &window);
                feedback.notice.clone_from(&notice);
                village.save_notice = notice;
            }
            ViewOption::Volume { effects, delta } => {
                sound.adjust_volume(effects, delta);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn view_options_popover_handles_camera_grid_sound_and_session_actions() {
        let mut village = Village {
            camp: Some(CLEARING_CAMP),
            ..default()
        };
        village.setup = Some(WorldSetup::default().session());
        let mut picker = toolbar::PanelPicker::default();
        picker.view_open = true;

        let mut app = App::new();
        app.insert_resource(village)
            .insert_resource(Catalog::default())
            .insert_resource(picker)
            .insert_resource(WorldSetup::default().session())
            .init_resource::<SaveMenu>()
            .init_resource::<SoundSettings>()
            .init_resource::<BugReportFeedback>()
            .add_systems(Update, input);

        app.world_mut().spawn((Window::default(), PrimaryWindow));
        app.world_mut().spawn((
            VillageCamera {
                target: Vec3::ZERO,
                heading: 0.0,
                polar: crate::default_camera_polar(),
            },
            Projection::Orthographic(OrthographicProjection::default_3d()),
        ));

        let press = |app: &mut App, action: ViewOption| {
            let entity = app.world_mut().spawn((action, Interaction::Pressed)).id();
            app.update();
            app.world_mut().entity_mut(entity).despawn();
        };

        press(&mut app, ViewOption::Camera(CameraAction::Turn(true)));
        let heading = app
            .world_mut()
            .query::<&VillageCamera>()
            .single(app.world())
            .unwrap()
            .heading;
        assert_eq!(heading, std::f32::consts::FRAC_PI_2);

        press(&mut app, ViewOption::Grid);
        assert!(app.world().resource::<Village>().show_grid);
        press(&mut app, ViewOption::Grid);
        assert!(!app.world().resource::<Village>().show_grid);

        press(
            &mut app,
            ViewOption::Volume {
                effects: false,
                delta: 5,
            },
        );
        assert_eq!(app.world().resource::<SoundSettings>().volume(false), 5);

        press(&mut app, ViewOption::Controls);
        assert!(app.world().resource::<Village>().guide.open());
        assert!(!app.world().resource::<toolbar::PanelPicker>().view_open);

        app.world_mut().resource_mut::<Village>().guide.toggle();
        app.world_mut()
            .resource_mut::<toolbar::PanelPicker>()
            .view_open = true;
        press(&mut app, ViewOption::MainMenu);
        assert!(app.world().resource::<WorldSetup>().open);
        assert!(!app.world().resource::<toolbar::PanelPicker>().view_open);
    }
}
