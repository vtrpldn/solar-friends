use super::*;

#[derive(Component)]
struct BuildPanel;

#[derive(Component)]
struct BlueprintButton(usize);

fn visible(setup: &WorldSetup, village: &Village, saves: &SaveMenu, sound: &SoundSettings) -> bool {
    !setup.open
        && !saves.open
        && !sound.open
        && !village.map_input_blocked()
        && !village.terrain_editor.open
        && !village.advance_open()
        && !village.trade_open()
        && village.construction.browsing_blueprints()
}

pub(super) fn install(app: &mut App) {
    app.add_systems(Startup, spawn)
        .add_systems(
            Update,
            select.after(read_camp_pointer).before(village_input),
        )
        .add_systems(Update, refresh.after(village_input));
}

fn spawn(mut commands: Commands, assets: Res<AssetServer>) {
    commands
        .spawn((
            BuildPanel,
            Node {
                display: Display::None,
                position_type: PositionType::Absolute,
                right: px(20),
                top: px(20),
                width: px(290),
                padding: UiRect::all(px(14)),
                flex_direction: FlexDirection::Column,
                row_gap: px(5),
                ..default()
            },
            BackgroundColor(Color::srgb_u8(31, 45, 35)),
        ))
        .with_children(|panel| {
            panel.spawn((Text::new("Blueprints"), ui_font(&assets, 20.0)));
            for index in 0..crate::construction::BUILD_ROWS {
                panel
                    .spawn((
                        BlueprintButton(index),
                        Button,
                        Node {
                            padding: UiRect::axes(px(10), px(7)),
                            ..default()
                        },
                        BackgroundColor(Color::srgb_u8(58, 78, 61)),
                    ))
                    .with_child((Text::default(), ui_font(&assets, 17.0)));
            }
        });
}

fn select(
    (setup, catalog, saves, sound): (
        Res<WorldSetup>,
        Res<Catalog>,
        Res<SaveMenu>,
        Res<SoundSettings>,
    ),
    mut village: ResMut<Village>,
    buttons: Query<(&BlueprintButton, &Interaction), Changed<Interaction>>,
) {
    if visible(&setup, &village, &saves, &sound) {
        for (button, state) in &buttons {
            if *state == Interaction::Pressed {
                village.construction.pick_build_row(&catalog, button.0);
                break;
            }
        }
    }
}

fn refresh(
    (setup, catalog, saves, sound): (
        Res<WorldSetup>,
        Res<Catalog>,
        Res<SaveMenu>,
        Res<SoundSettings>,
    ),
    village: Res<Village>,
    mut panel: Single<&mut Node, With<BuildPanel>>,
    mut buttons: Query<
        (
            &BlueprintButton,
            &Children,
            &Interaction,
            &mut Node,
            &mut BackgroundColor,
        ),
        Without<BuildPanel>,
    >,
    mut labels: Query<&mut Text>,
) {
    if !visible(&setup, &village, &saves, &sound) {
        panel.display = Display::None;
        return;
    }
    panel.display = Display::Flex;
    let names = village.construction.build_row_labels(&catalog);
    for (button, children, interaction, mut node, mut color) in &mut buttons {
        let name = names.get(button.0);
        node.display = if name.is_some() {
            Display::Flex
        } else {
            Display::None
        };
        color.0 = match interaction {
            Interaction::None => Color::srgb_u8(58, 78, 61),
            Interaction::Hovered => Color::srgb_u8(83, 110, 76),
            Interaction::Pressed => Color::srgb_u8(101, 126, 84),
        };
        if let Some(name) = name
            && let Some(child) = children.first()
            && let Ok(mut text) = labels.get_mut(*child)
        {
            text.set_if_neq(Text::new(format!("{}  {name}", button.0 + 1)));
        }
    }
}
