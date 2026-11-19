use super::*;

#[derive(Component)]
struct BuildPanel;

#[derive(Component)]
struct BlueprintDetails;

#[derive(Component)]
enum BuildButton {
    Blueprint(usize),
    Category,
    PreviousPage,
    NextPage,
    Search,
    ConstructionPolicy,
    SupplierConstruction,
    Close,
}

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
            Interaction::None,
            bevy::ui::FocusPolicy::Block,
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
            button(panel, &assets, BuildButton::ConstructionPolicy, "");
            button(panel, &assets, BuildButton::SupplierConstruction, "");
            panel
                .spawn(Node {
                    column_gap: px(5),
                    ..default()
                })
                .with_children(|row| {
                    button(row, &assets, BuildButton::Category, "Category");
                    button(row, &assets, BuildButton::Search, "Search");
                    button(row, &assets, BuildButton::Close, "Close");
                });
            for index in 0..crate::construction::BUILD_ROWS {
                button(panel, &assets, BuildButton::Blueprint(index), "");
            }
            panel
                .spawn(Node {
                    column_gap: px(5),
                    ..default()
                })
                .with_children(|row| {
                    button(row, &assets, BuildButton::PreviousPage, "← Previous");
                    button(row, &assets, BuildButton::NextPage, "Next →");
                });
        });
    commands.spawn((
        BlueprintDetails,
        Text::default(),
        ui_font(&assets, 16.0),
        Node {
            display: Display::None,
            position_type: PositionType::Absolute,
            right: px(320),
            top: px(20),
            width: px(350),
            padding: UiRect::all(px(14)),
            ..default()
        },
        BackgroundColor(Color::srgb_u8(31, 45, 35)),
    ));
}

fn button(
    parent: &mut ChildSpawnerCommands,
    assets: &AssetServer,
    action: BuildButton,
    label: &str,
) {
    parent
        .spawn((
            action,
            Button,
            Node {
                padding: UiRect::axes(px(10), px(7)),
                ..default()
            },
            BackgroundColor(Color::srgb_u8(58, 78, 61)),
        ))
        .with_child((Text::new(label), ui_font(assets, 17.0)));
}

fn select(
    (setup, catalog, saves, sound): (
        Res<WorldSetup>,
        Res<Catalog>,
        Res<SaveMenu>,
        Res<SoundSettings>,
    ),
    mut village: ResMut<Village>,
    buttons: Query<(&BuildButton, &Interaction), Changed<Interaction>>,
) {
    if visible(&setup, &village, &saves, &sound) {
        for (button, state) in &buttons {
            if *state == Interaction::Pressed {
                let sandbox = village.stock.sandbox;
                let build = &mut village.construction;
                match *button {
                    BuildButton::Blueprint(row) => build.pick_build_row(&catalog, row),
                    BuildButton::Category => build.change_build_category(false),
                    BuildButton::PreviousPage => build.turn_build_page(&catalog, false),
                    BuildButton::NextPage => build.turn_build_page(&catalog, true),
                    BuildButton::ConstructionPolicy if sandbox => {
                        build.toggle_sandbox_construction()
                    }
                    BuildButton::ConstructionPolicy => build.toggle_auto_buy(),
                    BuildButton::SupplierConstruction if !sandbox => {
                        build.toggle_supplier_construction()
                    }
                    BuildButton::SupplierConstruction => {}
                    BuildButton::Search => build.toggle_build_search(),
                    BuildButton::Close => build.toggle_build_menu(),
                }
                break;
            }
        }
    }
}

type BlueprintDetailsFilter = (
    With<BlueprintDetails>,
    Without<BuildPanel>,
    Without<BuildButton>,
);

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
            &BuildButton,
            &Children,
            &Interaction,
            &mut Node,
            &mut BackgroundColor,
        ),
        Without<BuildPanel>,
    >,
    mut labels: Query<&mut Text, Without<BlueprintDetails>>,
    mut details: Single<(&mut Node, &mut Text), BlueprintDetailsFilter>,
) {
    let (detail_node, detail_text) = &mut *details;
    detail_node.display = Display::None;
    if !visible(&setup, &village, &saves, &sound) {
        panel.display = Display::None;
        return;
    }
    panel.display = Display::Flex;
    let projects = village.construction.build_rows(&catalog);
    for (button, children, interaction, mut node, mut color) in &mut buttons {
        color.0 = match interaction {
            Interaction::None => Color::srgb_u8(58, 78, 61),
            Interaction::Hovered => Color::srgb_u8(83, 110, 76),
            Interaction::Pressed => Color::srgb_u8(101, 126, 84),
        };
        let label = match *button {
            BuildButton::Blueprint(index) => {
                let project = projects.get(index);
                if let Some(project) = project
                    && *interaction == Interaction::Hovered
                {
                    detail_node.display = Display::Flex;
                    detail_text.set_if_neq(Text::new(blueprint_details(
                        &village, &setup, &catalog, project,
                    )));
                }
                node.display = if project.is_some() {
                    Display::Flex
                } else {
                    Display::None
                };
                project.map(|project| format!("{}  {}", index + 1, project.name))
            }
            BuildButton::ConstructionPolicy => Some(
                if village.stock.sandbox {
                    village.construction.sandbox_status()
                } else {
                    village.construction.auto_buy_status()
                }
                .into(),
            ),
            BuildButton::SupplierConstruction => {
                node.display = if village.stock.sandbox {
                    Display::None
                } else {
                    Display::Flex
                };
                Some(
                    if village.construction.supplier_construction() {
                        "Automatic supplies · Supplier freight"
                    } else {
                        "Automatic supplies · Resident pickup"
                    }
                    .into(),
                )
            }
            _ => None,
        };
        if let Some(label) = label
            && let Some(child) = children.first()
            && let Ok(mut text) = labels.get_mut(*child)
        {
            text.set_if_neq(Text::new(label));
        }
    }
}

fn blueprint_details(
    village: &Village,
    setup: &WorldSetup,
    catalog: &Catalog,
    project: &crate::catalog::Project,
) -> String {
    use std::fmt::Write;
    let [width, depth] = project.size;
    let mut details = format!(
        "{}\n{}\n{} × {} m · {:.1} person-hours · {} loads",
        project.name,
        project.description,
        width * 2,
        depth * 2,
        project.work * 0.45 / 60.0,
        catalog.loads(project),
    );
    for (id, amount) in &project.materials {
        let missing = amount.saturating_sub(village.stock.available(id));
        let _ = write!(details, "\n{amount} {}", catalog.materials[id].name);
        if missing > 0 && !village.stock.sandbox {
            let _ = write!(details, " · {missing} missing");
        }
    }
    let quote = village.construction.blueprint_supply_quote(
        catalog,
        &village.stock,
        TownClock {
            seconds: village.clock,
            round_trip_km: setup.round_trip_km(),
        },
        project,
    );
    let quote = quote.unwrap_or_else(|reason| reason);
    let _ = write!(details, "\n{quote}");
    details
}
