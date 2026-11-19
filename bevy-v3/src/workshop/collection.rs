use super::{WorkshopCatalog, building_model, orbit_camera, ui_font, viewport_height};
use bevy::{
    camera::{ClearColorConfig, RenderTarget, ScalingMode, visibility::RenderLayers},
    prelude::*,
    render::render_resource::TextureFormat,
    scene::SceneInstanceReady,
};
use std::process::{Child, Command};

const CARDS: usize = 8;

#[derive(Resource)]
struct Collection {
    ids: Vec<String>,
    categories: Vec<String>,
    category: usize,
    categories_open: bool,
    category_cursor: usize,
    page: usize,
    turn: u8,
    detail: bool,
    dirty: bool,
    visible: Vec<String>,
    status: String,
}

#[derive(Component)]
struct Card(usize);
#[derive(Component)]
struct Caption(usize);
#[derive(Component)]
struct ThumbnailCamera(usize);
#[derive(Component)]
struct ThumbnailModel(usize);
#[derive(Component)]
struct CollectionStatus;
#[derive(Component)]
struct CategoryMenu;
#[derive(Component)]
struct CategoryChoice(usize);

#[derive(Component, Clone, Copy)]
enum Control {
    Category,
    Previous,
    Next,
    Rotate,
    Scale,
}

pub fn run(requested_category: Option<&str>) {
    let catalog = WorkshopCatalog::default();
    let mut ids: Vec<_> = catalog.0.keys().cloned().collect();
    ids.sort_by(|a, b| catalog.0[a].name.cmp(&catalog.0[b].name).then(a.cmp(b)));
    let mut categories: Vec<_> = catalog
        .0
        .values()
        .map(|entry| entry.category.clone())
        .collect();
    categories.sort();
    categories.dedup();
    categories.insert(0, "All categories".into());

    let category = requested_category
        .and_then(|name| {
            categories
                .iter()
                .position(|category| category.eq_ignore_ascii_case(name))
        })
        .unwrap_or_default();
    let mut app = App::new();
    app.add_plugins(DefaultPlugins.set(WindowPlugin {
        primary_window: Some(Window {
            title: "Solar Friends V3 · The 3D collection".into(),
            ..default()
        }),
        ..default()
    }))
    .add_plugins(crate::ui_font::UiFontPlugin)
    .insert_resource(catalog)
    .insert_resource(Collection {
        ids,
        categories,
        category,
        categories_open: false,
        category_cursor: category,
        page: 0,
        turn: 0,
        detail: false,
        dirty: true,
        visible: vec![],
        status: String::new(),
    })
    .add_systems(Startup, setup)
    .add_systems(Update, (input, show_categories, refresh).chain())
    .add_observer(prepare_thumbnail);
    crate::village::register_building_models(&mut app);
    app.run();
}

fn setup(
    mut commands: Commands,
    collection: Res<Collection>,
    assets: Res<AssetServer>,
    mut images: ResMut<Assets<Image>>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    commands.spawn((
        Camera2d,
        Camera {
            clear_color: ClearColorConfig::Custom(Color::srgb_u8(231, 234, 217)),
            ..default()
        },
        bevy::ui::IsDefaultUiCamera,
    ));
    let layers = RenderLayers::from_layers(&(1..=CARDS).collect::<Vec<_>>());
    commands.spawn((
        DirectionalLight {
            illuminance: 14_500.,
            color: Color::srgb_u8(255, 236, 201),
            ..default()
        },
        Transform::from_xyz(-6., 18., 7.).looking_at(Vec3::ZERO, Vec3::Y),
        layers.clone(),
    ));
    commands.spawn((
        Mesh3d(meshes.add(Plane3d::default().mesh().size(200., 200.))),
        MeshMaterial3d(materials.add(Color::srgb_u8(169, 185, 131))),
        Transform::from_xyz(0., -0.01, 0.),
        layers,
    ));
    let targets: Vec<_> = (0..CARDS)
        .map(|slot| {
            let image = images.add(Image::new_target_texture(
                256,
                256,
                TextureFormat::Rgba8UnormSrgb,
                None,
            ));
            commands.spawn((
                ThumbnailCamera(slot),
                Camera3d::default(),
                Camera {
                    order: -1 - slot as isize,
                    clear_color: ClearColorConfig::Custom(Color::srgb_u8(220, 226, 200)),
                    ..default()
                },
                Projection::Orthographic(OrthographicProjection::default_3d()),
                RenderTarget::Image(image.clone().into()),
                orbit_camera(0., 29., Vec3::ZERO),
                RenderLayers::layer(slot + 1),
            ));
            image
        })
        .collect();
    commands
        .spawn((Node {
            width: percent(100),
            height: percent(100),
            flex_direction: FlexDirection::Column,
            padding: UiRect::all(px(20)),
            row_gap: px(12),
            ..default()
        },))
        .with_children(|root| {
            root.spawn((
                Text::new("The 3D collection"),
                ui_font(&assets, 30.),
                TextColor(Color::srgb_u8(35, 59, 44)),
            ));
            root.spawn(Node {
                column_gap: px(8),
                ..default()
            })
            .with_children(|tools| {
                for (action, label) in [
                    (Control::Category, "Categories"),
                    (Control::Scale, "Toggle detail scale"),
                    (Control::Rotate, "Rotate 90°"),
                    (Control::Previous, "Previous page"),
                    (Control::Next, "Next page"),
                ] {
                    tools
                        .spawn((
                            Button,
                            action,
                            Node {
                                padding: UiRect::axes(px(12), px(8)),
                                ..default()
                            },
                            BackgroundColor(Color::srgb_u8(51, 77, 58)),
                        ))
                        .with_child((Text::new(label), ui_font(&assets, 16.)));
                }
            });
            root.spawn((
                CollectionStatus,
                Text::default(),
                ui_font(&assets, 16.),
                TextColor(Color::srgb_u8(35, 59, 44)),
            ));
            for (row, entries) in targets.chunks(4).enumerate() {
                root.spawn(Node {
                    flex_grow: 1.,
                    min_height: px(0),
                    column_gap: px(12),
                    ..default()
                })
                .with_children(|cards| {
                    for (column, image) in entries.iter().enumerate() {
                        let slot = row * 4 + column;
                        cards
                            .spawn((
                                Button,
                                Card(slot),
                                Node {
                                    width: percent(25),
                                    min_width: px(0),
                                    flex_direction: FlexDirection::Column,
                                    padding: UiRect::all(px(8)),
                                    row_gap: px(5),
                                    align_items: AlignItems::Center,
                                    ..default()
                                },
                                BackgroundColor(Color::srgb_u8(250, 250, 238)),
                            ))
                            .with_children(|card| {
                                card.spawn((
                                    ImageNode::new(image.clone()),
                                    Node {
                                        min_height: px(0),
                                        height: percent(78),
                                        max_width: percent(100),
                                        aspect_ratio: Some(1.),
                                        ..default()
                                    },
                                ));
                                card.spawn((
                                    Caption(slot),
                                    Text::default(),
                                    TextLayout::new_with_justify(Justify::Center),
                                    ui_font(&assets, 15.),
                                    TextColor(Color::srgb_u8(35, 59, 44)),
                                ));
                            });
                    }
                });
            }
        });
    commands
        .spawn((
            CategoryMenu,
            GlobalZIndex(1),
            Node {
                display: Display::None,
                position_type: PositionType::Absolute,
                top: px(113),
                left: px(20),
                width: px(522),
                padding: UiRect::all(px(10)),
                flex_wrap: FlexWrap::Wrap,
                row_gap: px(6),
                column_gap: px(6),
                ..default()
            },
            BackgroundColor(Color::srgb_u8(36, 58, 44)),
        ))
        .with_children(|menu| {
            for (index, title) in collection.categories.iter().enumerate() {
                menu.spawn((
                    Button,
                    CategoryChoice(index),
                    Node {
                        width: px(162),
                        padding: UiRect::axes(px(12), px(7)),
                        ..default()
                    },
                    BackgroundColor(Color::srgb_u8(62, 83, 65)),
                ))
                .with_child((Text::new(title.clone()), ui_font(&assets, 16.)));
            }
        });
}

fn prepare_thumbnail(
    event: On<SceneInstanceReady>,
    mut commands: Commands,
    roots: Query<&ThumbnailModel>,
    children: Query<&Children>,
) {
    let Ok(model) = roots.get(event.entity) else {
        return;
    };
    for child in children.iter_descendants(event.entity) {
        commands
            .entity(child)
            .insert(RenderLayers::layer(model.0 + 1));
    }
}

fn show_categories(
    collection: Res<Collection>,
    mut menu: Single<&mut Node, With<CategoryMenu>>,
    mut choices: Query<(&CategoryChoice, &Interaction, &mut BackgroundColor)>,
) {
    let display = if collection.categories_open {
        Display::Flex
    } else {
        Display::None
    };
    if menu.display != display {
        menu.display = display;
    }
    if collection.categories_open {
        for (CategoryChoice(index), interaction, mut color) in &mut choices {
            let tint = if *index == collection.category_cursor || *interaction != Interaction::None
            {
                Color::srgb_u8(104, 128, 88)
            } else {
                Color::srgb_u8(62, 83, 65)
            };
            color.set_if_neq(BackgroundColor(tint));
        }
    }
}

fn input(
    mut collection: ResMut<Collection>,
    keys: Res<ButtonInput<KeyCode>>,
    controls: Query<(&Interaction, &Control), Changed<Interaction>>,
    choices: Query<(&Interaction, &CategoryChoice), Changed<Interaction>>,
    mut cards: Query<(&Interaction, &Card, &mut BackgroundColor), Changed<Interaction>>,
    mut children: Local<Vec<Child>>,
) {
    children.retain_mut(|child| !matches!(child.try_wait(), Ok(Some(_))));
    if keys.just_pressed(KeyCode::Escape) {
        collection.categories_open = false;
    }
    let keyboard = [
        (KeyCode::KeyC, Control::Category),
        (KeyCode::PageUp, Control::Previous),
        (KeyCode::PageDown, Control::Next),
        (KeyCode::KeyR, Control::Rotate),
        (KeyCode::KeyD, Control::Scale),
    ];
    let actions = controls
        .iter()
        .filter_map(|(i, &action)| (*i == Interaction::Pressed).then_some(action))
        .chain(
            keyboard
                .into_iter()
                .filter_map(|(key, action)| keys.just_pressed(key).then_some(action)),
        );
    for action in actions {
        match action {
            Control::Category => {
                collection.categories_open = !collection.categories_open;
                collection.category_cursor = collection.category;
                continue;
            }
            Control::Previous => collection.page = collection.page.saturating_sub(1),
            Control::Next => collection.page += 1,
            Control::Rotate => collection.turn = (collection.turn + 1) % 4,
            Control::Scale => collection.detail = !collection.detail,
        }
        collection.dirty = true;
    }
    if collection.categories_open {
        let next = keys.just_pressed(KeyCode::ArrowDown) || keys.just_pressed(KeyCode::ArrowRight);
        let previous = keys.just_pressed(KeyCode::ArrowUp) || keys.just_pressed(KeyCode::ArrowLeft);
        let count = collection.categories.len();
        collection.category_cursor = (collection.category_cursor + usize::from(next) + count
            - usize::from(previous))
            % count;
        let choice = choices
            .iter()
            .find_map(|(interaction, CategoryChoice(index))| {
                (*interaction == Interaction::Pressed).then_some(*index)
            })
            .or_else(|| {
                keys.any_just_pressed([KeyCode::Enter, KeyCode::NumpadEnter])
                    .then_some(collection.category_cursor)
            });
        if let Some(index) = choice {
            collection.category = index;
            collection.categories_open = false;
            collection.page = 0;
            collection.dirty = true;
        }
        return;
    }
    for (interaction, Card(slot), mut background) in &mut cards {
        background.0 = if *interaction == Interaction::None {
            Color::srgb_u8(250, 250, 238)
        } else {
            Color::srgb_u8(218, 228, 201)
        };
        if *interaction == Interaction::Pressed
            && let Some(asset) = collection.visible.get(*slot)
        {
            match std::env::current_exe()
                .and_then(|exe| Command::new(exe).args(["--workshop", asset]).spawn())
            {
                Ok(child) => children.push(child),
                Err(error) => {
                    collection.status = format!("Could not open the 3D inspector: {error}");
                    collection.dirty = true;
                }
            }
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn refresh(
    mut commands: Commands,
    mut collection: ResMut<Collection>,
    catalog: Res<WorkshopCatalog>,
    assets: Res<AssetServer>,
    models: Query<Entity, With<ThumbnailModel>>,
    mut cameras: Query<(
        &ThumbnailCamera,
        &mut Projection,
        &mut Transform,
        &mut Camera,
    )>,
    mut cards: Query<(&Card, &mut Visibility)>,
    mut captions: Query<(&Caption, &mut Text), Without<CollectionStatus>>,
    mut status: Single<&mut Text, With<CollectionStatus>>,
) {
    if !collection.dirty {
        return;
    }
    collection.dirty = false;
    let category = &collection.categories[collection.category];
    let matches: Vec<_> = collection
        .ids
        .iter()
        .filter(|id| collection.category == 0 || catalog.0[*id].category == *category)
        .cloned()
        .collect();
    let pages = matches.len().div_ceil(CARDS).max(1);
    collection.page = collection.page.min(pages - 1);
    collection.visible = matches
        .iter()
        .skip(collection.page * CARDS)
        .take(CARDS)
        .cloned()
        .collect();
    let span = matches
        .iter()
        .map(|id| {
            let [width, depth] = catalog.0[id].size.map(|n| n as f32 * 2.);
            width.hypot(depth) * 1.15
        })
        .fold(9., f32::max);
    let rotation = Quat::from_rotation_y(collection.turn as f32 * std::f32::consts::FRAC_PI_2);

    for entity in &models {
        commands.entity(entity).despawn();
    }
    for (Card(slot), mut visibility) in &mut cards {
        *visibility = if *slot < collection.visible.len() {
            Visibility::Visible
        } else {
            Visibility::Hidden
        };
    }
    for (ThumbnailCamera(slot), mut projection, mut camera_transform, mut camera) in &mut cameras {
        let Some(id) = collection.visible.get(*slot) else {
            camera.is_active = false;
            continue;
        };
        camera.is_active = true;
        let entry = &catalog.0[id];
        let height = if collection.detail {
            viewport_height(entry, 1.)
        } else {
            span
        };
        *projection = Projection::Orthographic(OrthographicProjection {
            scaling_mode: ScalingMode::FixedVertical {
                viewport_height: height,
            },
            viewport_origin: Vec2::new(0.5, 0.38),
            ..OrthographicProjection::default_3d()
        });
        *camera_transform = orbit_camera(0., 29., Vec3::ZERO);
        commands.spawn((
            ThumbnailModel(*slot),
            building_model(&assets, entry.model),
            Transform::from_rotation(rotation),
            RenderLayers::layer(*slot + 1),
        ));
    }
    for (Caption(slot), mut text) in &mut captions {
        if let Some(id) = collection.visible.get(*slot) {
            let entry = &catalog.0[id];
            text.0 = format!(
                "{}\n{} · {} × {} cells",
                entry.name, entry.category, entry.size[0], entry.size[1]
            );
        }
    }
    status.0 = format!(
        "{} · {} of {} models · Page {}/{} · {}° · {}\nClick a card to inspect it in 3D. {}",
        collection.categories[collection.category],
        matches.len(),
        collection.ids.len(),
        collection.page + 1,
        pages,
        collection.turn as u32 * 90,
        if collection.detail {
            "Detail scale"
        } else {
            "Shared scale"
        },
        collection.status
    );
}
