use bevy::asset::load_embedded_asset;

use super::*;
use crate::{
    theme,
    ui_font::{ui_font_styled, ui_font_weight},
};

#[derive(Component)]
struct ResidentHeader;

#[derive(Component)]
struct ResidentPortrait;

#[derive(Component)]
enum HeaderText {
    Name,
    Role,
    Traits,
}

#[derive(Component)]
struct ResidentMeters;

#[derive(Component)]
struct ActivityText;

#[derive(Component)]
struct MeterLabel(usize);

#[derive(Component)]
struct MeterFill(usize);

#[derive(Resource)]
struct ResidentPortraits([Handle<Image>; NAMES.len()]);

pub(super) fn install(app: &mut App) {
    app.add_systems(Startup, load_portraits)
        .add_systems(Update, refresh.after(show_hud));
}

fn load_portraits(mut commands: Commands, assets: Res<AssetServer>) {
    commands.insert_resource(ResidentPortraits([
        load_embedded_asset!(&*assets, "resident_portraits/iara.png"),
        load_embedded_asset!(&*assets, "resident_portraits/bento.png"),
        load_embedded_asset!(&*assets, "resident_portraits/luz.png"),
        load_embedded_asset!(&*assets, "resident_portraits/caua.png"),
        load_embedded_asset!(&*assets, "resident_portraits/nina.png"),
    ]));
}

pub(super) fn spawn(parent: &mut ChildSpawnerCommands, assets: &AssetServer) {
    parent
        .spawn((
            ResidentHeader,
            Node {
                display: Display::None,
                align_items: AlignItems::Center,
                column_gap: px(14),
                flex_shrink: 0.,
                padding: UiRect::vertical(px(8)),
                border: UiRect::bottom(px(1)),
                ..default()
            },
            BorderColor::all(theme::SUBTLE_BORDER),
        ))
        .with_children(|header| {
            header
                .spawn((
                    Node {
                        padding: UiRect::all(px(4)),
                        border: UiRect::all(px(1)),
                        border_radius: BorderRadius::all(px(14)),
                        flex_shrink: 0.,
                        ..default()
                    },
                    BackgroundColor(theme::ACTIVE),
                    BorderColor::all(theme::ACTIVE_EDGE),
                ))
                .with_child((
                    ResidentPortrait,
                    ImageNode::default(),
                    Node {
                        width: px(80),
                        height: px(60),
                        ..default()
                    },
                ));
            header
                .spawn(Node {
                    flex_direction: FlexDirection::Column,
                    row_gap: px(2),
                    ..default()
                })
                .with_children(|identity| {
                    identity.spawn((
                        HeaderText::Name,
                        Text::default(),
                        ui_font_weight(assets, 22., 750),
                    ));
                    identity.spawn((
                        HeaderText::Role,
                        Text::default(),
                        ui_font_styled(assets, 14., 500, theme::MUTED),
                    ));
                    identity.spawn((
                        HeaderText::Traits,
                        Text::default(),
                        ui_font_styled(assets, 12., 600, theme::LEAF),
                    ));
                });
        });

    parent
        .spawn((
            ResidentMeters,
            Node {
                display: Display::None,
                flex_direction: FlexDirection::Column,
                flex_shrink: 0.,
                row_gap: px(10),
                padding: UiRect::vertical(px(6)),
                ..default()
            },
        ))
        .with_children(|overview| {
            overview
                .spawn((
                    Node {
                        flex_direction: FlexDirection::Column,
                        row_gap: px(2),
                        padding: UiRect::axes(px(12), px(9)),
                        border: UiRect::left(px(3)),
                        border_radius: BorderRadius::all(px(8)),
                        ..default()
                    },
                    BackgroundColor(theme::INSET),
                    BorderColor::all(theme::LEAF),
                ))
                .with_children(|inset| {
                    inset.spawn((
                        Text::new("RIGHT NOW"),
                        ui_font_styled(assets, 10., 750, theme::CAPTION),
                    ));
                    inset.spawn((
                        ActivityText,
                        Text::default(),
                        ui_font_weight(assets, 14., 600),
                    ));
                });

            overview
                .spawn(Node {
                    flex_direction: FlexDirection::Column,
                    row_gap: px(6),
                    ..default()
                })
                .with_children(|section| {
                    section.spawn((
                        Text::new("NEEDS"),
                        ui_font_styled(assets, 11., 750, theme::CAPTION),
                    ));
                    section
                        .spawn(Node {
                            flex_wrap: FlexWrap::Wrap,
                            max_width: vw(48),
                            row_gap: px(8),
                            column_gap: px(14),
                            ..default()
                        })
                        .with_children(|meters| {
                            for index in 0..8 {
                                meters
                                    .spawn(Node {
                                        width: px(136),
                                        flex_direction: FlexDirection::Column,
                                        row_gap: px(3),
                                        ..default()
                                    })
                                    .with_children(|meter| {
                                        meter.spawn((
                                            MeterLabel(index),
                                            Text::default(),
                                            ui_font_weight(assets, 13., 600),
                                        ));
                                        meter
                                            .spawn((
                                                Node {
                                                    width: percent(100),
                                                    height: px(8),
                                                    border_radius: BorderRadius::MAX,
                                                    ..default()
                                                },
                                                BackgroundColor(theme::TRACK),
                                            ))
                                            .with_child((
                                                MeterFill(index),
                                                Node {
                                                    height: percent(100),
                                                    border_radius: BorderRadius::MAX,
                                                    ..default()
                                                },
                                                BackgroundColor::default(),
                                            ));
                                    });
                            }
                        });
                });
        });
}

type ResidentPanels<'w, 's> = (
    Single<
        'w,
        's,
        &'static mut Node,
        (
            With<ResidentHeader>,
            Without<ResidentMeters>,
            Without<MeterFill>,
        ),
    >,
    Single<
        'w,
        's,
        &'static mut Node,
        (
            With<ResidentMeters>,
            Without<ResidentHeader>,
            Without<MeterFill>,
        ),
    >,
);

type ResidentTexts<'w, 's> = (
    Query<
        'w,
        's,
        (&'static HeaderText, &'static mut Text),
        (Without<ActivityText>, Without<MeterLabel>),
    >,
    Single<
        'w,
        's,
        &'static mut Text,
        (With<ActivityText>, Without<HeaderText>, Without<MeterLabel>),
    >,
    Query<
        'w,
        's,
        (&'static MeterLabel, &'static mut Text),
        (Without<HeaderText>, Without<ActivityText>),
    >,
);

type MeterFills<'w, 's> = Query<
    'w,
    's,
    (
        &'static MeterFill,
        &'static mut Node,
        &'static mut BackgroundColor,
    ),
    (Without<ResidentHeader>, Without<ResidentMeters>),
>;

fn refresh(
    (village, catalog, portraits): (Res<Village>, Res<Catalog>, Res<ResidentPortraits>),
    (mut header, mut meters): ResidentPanels,
    mut portrait: Single<&mut ImageNode, With<ResidentPortrait>>,
    (mut header_texts, mut activity, mut labels): ResidentTexts,
    mut fills: MeterFills,
) {
    let open = village.utility_panel == Some(UtilityPanel::Residents)
        && !village.guide.open()
        && !village.lenses.open;
    let header_display = if open { Display::Flex } else { Display::None };
    if header.display != header_display {
        header.display = header_display;
    }
    let overview_display = if open && village.resident_overview_open() {
        Display::Flex
    } else {
        Display::None
    };
    if meters.display != overview_display {
        meters.display = overview_display;
    }
    if !open {
        return;
    }

    let selected = village.selected_resident;
    if portrait.image != portraits.0[selected] {
        portrait.image = portraits.0[selected].clone();
    }
    let profile = &catalog.residents[selected];
    let traits = profile.traits.join(" · ");
    for (part, mut text) in &mut header_texts {
        let wanted = match part {
            HeaderText::Name => NAMES[selected],
            HeaderText::Role => profile.role.as_str(),
            HeaderText::Traits => traits.as_str(),
        };
        if text.0 != wanted {
            text.0 = wanted.into();
        }
    }

    if !village.resident_overview_open() {
        return;
    }
    let current = village
        .construction
        .resident_activity_summary(&catalog, selected);
    if activity.0 != current {
        activity.0 = current;
    }
    let values = village.construction.resident_need_meters(selected);
    for (label, mut text) in &mut labels {
        let (name, value) = values[label.0];
        let wanted = format!("{name} {value:.0}%");
        if text.0 != wanted {
            text.0 = wanted;
        }
    }
    for (fill, mut node, mut background) in &mut fills {
        let value = values[fill.0].1;
        let width = percent(value.clamp(0., 100.) as f32);
        if node.width != width {
            node.width = width;
        }
        let color = if value < 25. {
            theme::NEED_LOW
        } else if value < 50. {
            theme::NEED_WARN
        } else {
            theme::NEED_GOOD
        };
        if background.0 != color {
            background.0 = color;
        }
    }
}
