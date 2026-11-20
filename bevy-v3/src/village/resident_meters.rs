use super::*;

#[derive(Component)]
struct ResidentMeters;

#[derive(Component)]
struct MeterLabel(usize);

#[derive(Component)]
struct MeterFill(usize);

pub(super) fn install(app: &mut App) {
    app.add_systems(Update, refresh.after(show_hud));
}

pub(super) fn spawn(parent: &mut ChildSpawnerCommands, assets: &AssetServer) {
    parent
        .spawn((
            ResidentMeters,
            Node {
                display: Display::None,
                flex_wrap: FlexWrap::Wrap,
                flex_shrink: 0.,
                max_width: vw(48),
                row_gap: px(6),
                column_gap: px(10),
                ..default()
            },
        ))
        .with_children(|meters| {
            for index in 0..8 {
                meters
                    .spawn(Node {
                        width: px(104),
                        flex_direction: FlexDirection::Column,
                        row_gap: px(2),
                        ..default()
                    })
                    .with_children(|meter| {
                        meter.spawn((MeterLabel(index), Text::default(), ui_font(assets, 14.)));
                        meter
                            .spawn((
                                Node {
                                    width: percent(100),
                                    height: px(5),
                                    ..default()
                                },
                                BackgroundColor(crate::theme::TRACK),
                            ))
                            .with_child((
                                MeterFill(index),
                                Node {
                                    height: percent(100),
                                    ..default()
                                },
                                BackgroundColor::default(),
                            ));
                    });
            }
        });
}

fn refresh(
    village: Res<Village>,
    mut meters: Single<&mut Node, (With<ResidentMeters>, Without<MeterFill>)>,
    mut labels: Query<(&MeterLabel, &mut Text)>,
    mut fills: Query<(&MeterFill, &mut Node, &mut BackgroundColor)>,
) {
    if !village.resident_overview_open() {
        meters.display = Display::None;
        return;
    }
    meters.display = Display::Flex;
    let values = village
        .construction
        .resident_need_meters(village.selected_resident);
    for (label, mut text) in &mut labels {
        let (name, value) = values[label.0];
        text.0 = format!("{name} {value:.0}%");
    }
    for (fill, mut node, mut background) in &mut fills {
        let value = values[fill.0].1;
        node.width = percent(value.clamp(0., 100.) as f32);
        background.0 = if value < 25. {
            Color::srgb_u8(181, 102, 78)
        } else if value < 50. {
            Color::srgb_u8(187, 155, 78)
        } else {
            Color::srgb_u8(129, 153, 94)
        };
    }
}
