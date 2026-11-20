mod asset_picker;
pub mod collection;
pub mod garden;
mod garden_connections;
mod garden_terrain;

pub mod lineup;
mod model_export;
pub mod navigation;
mod sprites;

use std::collections::{BTreeMap, HashMap, HashSet};

use bevy::{
    asset::RenderAssetUsages,
    input::mouse::{AccumulatedMouseMotion, AccumulatedMouseScroll, MouseScrollUnit},
    mesh::{Indices, PrimitiveTopology},
    prelude::*,
    render::view::screenshot::{Screenshot, ScreenshotCaptured},
    scene::{SceneInstance, SceneSpawner},
};

use crate::{catalog::Catalog, ui_font::ui_font, village::building_model};

#[derive(Resource)]
struct WorkshopCatalog(BTreeMap<String, WorkshopAsset>);

#[derive(serde::Deserialize)]
struct WorkshopAsset {
    name: String,
    category: String,
    size: [i32; 2],
    model: usize,
    revision: u32,
}

impl Default for WorkshopCatalog {
    fn default() -> Self {
        Self(
            serde_json::from_str(include_str!("../data/workshop.json"))
                .expect("bundled Workshop catalog"),
        )
    }
}

#[derive(Resource)]
struct Workshop {
    assets: Vec<String>,
    selected: usize,
    heading: f32,
    elevation: f32,
    rotation: u8,
    zoom: f32,
    target: Vec3,
    scale_figure: bool,
    roof_available: bool,
    roof_visible: bool,
    surface: Surface,
    night: bool,
    guides: bool,
    export_notice: String,
    search: Option<AssetSearch>,
    proof: Option<sprites::SpriteProof>,
    show_proof: bool,
    together: bool,
}

impl Workshop {
    fn reset_camera(&mut self) {
        self.heading = 0.0;
        self.elevation = DEFAULT_ELEVATION;
        self.zoom = 1.0;
        self.target = Vec3::Y;
    }

    fn viewport_height(&self, catalog: &WorkshopCatalog) -> f32 {
        if self.together {
            30.0 * self.zoom
        } else {
            viewport_height(&catalog.0[&self.assets[self.selected]], self.zoom)
        }
    }
}

#[derive(Default)]
struct AssetSearch {
    query: String,
    category: Option<String>,
    choosing_category: bool,
    row: usize,
}

impl AssetSearch {
    fn matching(&self, assets: &[String], catalog: &WorkshopCatalog) -> Vec<usize> {
        let query = self.query.trim().to_lowercase();
        assets
            .iter()
            .enumerate()
            .filter_map(|(index, id)| {
                let model = &catalog.0[id];
                (self
                    .category
                    .as_ref()
                    .is_none_or(|category| *category == model.category)
                    && (model.name.to_lowercase().contains(&query)
                        || id.contains(&query)
                        || model.category.to_lowercase().contains(&query)))
                .then_some(index)
            })
            .collect()
    }
}

#[derive(Component)]
struct WorkshopModel;

#[derive(Component)]
struct InspectionCamera;

#[derive(Component)]
struct InspectionText;

#[derive(Component)]
struct InspectionToolbar;

#[derive(Component, Clone, Copy, PartialEq, Eq)]
enum InspectionAction {
    Together,
    Light,
    Surface,
    Grid,
    Figure,
    Roof,
    Reset,
    Rotate(u8),
    Model,
    Proof,
    Sheet,
    Placement,
    Source,
    FindAsset,
}

#[derive(bevy::ecs::system::SystemParam)]
struct InspectionInput<'w, 's> {
    keys: Res<'w, ButtonInput<KeyCode>>,
    buttons: Query<'w, 's, (&'static Interaction, &'static InspectionAction), Changed<Interaction>>,
}

impl InspectionInput<'_, '_> {
    fn clicked(&self, action: InspectionAction) -> bool {
        self.buttons
            .iter()
            .any(|(&interaction, &button)| interaction == Interaction::Pressed && button == action)
    }
}

fn show_inspection_actions(
    workshop: Res<Workshop>,
    mut buttons: Query<(&InspectionAction, &mut Node)>,
) {
    for (action, mut node) in &mut buttons {
        let available = match action {
            InspectionAction::Model => workshop.show_proof,
            InspectionAction::Light => true,
            InspectionAction::Proof => !workshop.show_proof && !workshop.together,
            InspectionAction::Sheet | InspectionAction::Placement | InspectionAction::Source => {
                !workshop.together
            }
            InspectionAction::Roof => {
                !workshop.show_proof && !workshop.together && workshop.roof_available
            }
            InspectionAction::Figure | InspectionAction::Rotate(_) => {
                !workshop.show_proof && !workshop.together
            }
            _ => !workshop.show_proof,
        };
        node.display = if available {
            Display::Flex
        } else {
            Display::None
        };
    }
}

#[derive(Component)]
struct InspectionLight;

#[derive(Component)]
struct ScaleFigure;

#[derive(Clone, Copy)]
enum Surface {
    Materials,
    Clay,
    Wireframe,
}

impl Surface {
    fn next(self) -> Self {
        match self {
            Self::Materials => Self::Clay,
            Self::Clay => Self::Wireframe,
            Self::Wireframe => Self::Materials,
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Materials => "Materials",
            Self::Clay => "Clay",
            Self::Wireframe => "Wireframe",
        }
    }
}

#[derive(Resource)]
struct SurfaceMaterials {
    clay: Handle<StandardMaterial>,
    wire: Handle<StandardMaterial>,
}

#[derive(Clone, Component)]
struct OriginalSurface {
    mesh: Handle<Mesh>,
    material: Handle<StandardMaterial>,
}

const DEFAULT_ELEVATION: f32 = 37.72;

fn orbit_camera(heading: f32, elevation: f32, target: Vec3) -> Transform {
    let yaw = heading + std::f32::consts::FRAC_PI_4;
    let (up, level) = elevation.to_radians().sin_cos();
    let offset = Vec3::new(yaw.sin() * level, up, yaw.cos() * level) * 57.2;
    Transform::from_translation(target + offset).looking_at(target, Vec3::Y)
}

pub fn run(asset: Option<&str>) {
    let catalog = Catalog::default();
    let models = WorkshopCatalog::default();
    let mut assets: Vec<_> = models.0.keys().cloned().collect();
    assets.sort_by(|a, b| models.0[a].name.cmp(&models.0[b].name));
    let selected = asset
        .and_then(|asset| assets.iter().position(|id| id == asset))
        .unwrap_or_default();
    let mut app = App::new();
    app.add_plugins(DefaultPlugins.set(WindowPlugin {
        primary_window: Some(Window {
            title: "Solar Friends V3 · Workshop".into(),
            ..default()
        }),
        ..default()
    }))
    .add_plugins((
        crate::ui_font::UiFontPlugin,
        navigation::ArtNavigationPlugin(navigation::ArtTool::Workshop),
    ))
    .insert_resource(catalog)
    .insert_resource(models)
    .insert_resource(Workshop {
        assets,
        selected,
        heading: 0.0,
        elevation: DEFAULT_ELEVATION,
        rotation: 0,
        zoom: 1.0,
        target: Vec3::Y,
        scale_figure: false,
        roof_available: false,
        roof_visible: true,
        surface: Surface::Materials,
        night: false,
        guides: false,
        export_notice: String::new(),
        search: None,
        proof: None,
        show_proof: false,
        together: false,
    })
    .add_systems(Startup, (setup, sprites::setup_proof, asset_picker::setup))
    .add_systems(
        Update,
        (
            controls,
            show_model,
            show_scale_figure,
            apply_roof_visibility,
            apply_surface,
            capture_preview,
            sprites::start,
            sprites::progress,
            sprites::show_proof,
            model_export::export_selected,
            show_inspection_actions,
            asset_picker::display,
            draw_guides,
        )
            .chain(),
    );
    crate::village::register_building_models(&mut app);
    crate::village::register_opening_models(&mut app);
    app.run();
}

fn setup(
    mut commands: Commands,
    assets: Res<AssetServer>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    commands.insert_resource(SurfaceMaterials {
        clay: materials.add(StandardMaterial {
            base_color: Color::srgb_u8(213, 198, 164),
            perceptual_roughness: 1.0,
            ..default()
        }),
        wire: materials.add(StandardMaterial {
            base_color: Color::srgb_u8(66, 104, 92),
            unlit: true,
            ..default()
        }),
    });
    commands.spawn((
        Camera3d::default(),
        InspectionCamera,
        bevy::ui::IsDefaultUiCamera,
        Projection::Orthographic(OrthographicProjection::default_3d()),
        orbit_camera(0.0, DEFAULT_ELEVATION, Vec3::Y),
    ));
    commands.spawn((
        InspectionLight,
        DirectionalLight {
            shadows_enabled: true,
            ..default()
        },
        Transform::from_xyz(-8.0, 12.0, 6.0).looking_at(Vec3::ZERO, Vec3::Y),
    ));
    commands.spawn((
        Mesh3d(meshes.add(Plane3d::default().mesh().size(120.0, 120.0))),
        MeshMaterial3d(materials.add(Color::srgb_u8(115, 130, 115))),
    ));
    commands.spawn((
        ScaleFigure,
        crate::village::opening_model(&assets, 0),
        Transform::default(),
        Visibility::Hidden,
    ));
    commands.spawn((
        InspectionText,
        Text::default(),
        ui_font(&assets, 18.0),
        Node {
            position_type: PositionType::Absolute,
            left: px(24),
            top: px(48),
            padding: UiRect::all(px(16)),
            ..default()
        },
        BackgroundColor(crate::theme::PAPER),
    ));
    commands
        .spawn((
            InspectionToolbar,
            Node {
                position_type: PositionType::Absolute,
                left: px(12),
                right: px(12),
                bottom: px(12),
                flex_wrap: FlexWrap::Wrap,
                column_gap: px(6),
                row_gap: px(4),
                ..default()
            },
        ))
        .with_children(|toolbar| {
            for (label, action) in [
                ("3D model", InspectionAction::Model),
                ("Sprite proof", InspectionAction::Proof),
                ("4-view PNG", InspectionAction::Sheet),
                ("Placement JSON", InspectionAction::Placement),
                ("3D source", InspectionAction::Source),
                ("Find asset", InspectionAction::FindAsset),
                ("View together", InspectionAction::Together),
                ("Lighting", InspectionAction::Light),
                ("Surface", InspectionAction::Surface),
                ("Grid", InspectionAction::Grid),
                ("Scale figure", InspectionAction::Figure),
                ("Roof", InspectionAction::Roof),
                ("Reset camera", InspectionAction::Reset),
                ("0°", InspectionAction::Rotate(0)),
                ("90°", InspectionAction::Rotate(1)),
                ("180°", InspectionAction::Rotate(2)),
                ("270°", InspectionAction::Rotate(3)),
            ] {
                toolbar
                    .spawn((
                        Button,
                        action,
                        Node {
                            padding: UiRect::axes(px(9), px(5)),
                            ..default()
                        },
                        BackgroundColor(crate::theme::BUTTON),
                    ))
                    .with_child((Text::new(label), ui_font(&assets, 15.)));
            }
        });
}

fn controls(
    (input, mut text): (
        InspectionInput,
        MessageReader<bevy::input::keyboard::KeyboardInput>,
    ),
    time: Res<Time>,
    (pending, sprite_capture): (
        Query<(), With<Screenshot>>,
        Option<Res<sprites::SpriteCapture>>,
    ),
    (mouse, motion, scroll): (
        Res<ButtonInput<MouseButton>>,
        Res<AccumulatedMouseMotion>,
        Res<AccumulatedMouseScroll>,
    ),
    (catalog, window): (Res<WorkshopCatalog>, Single<&Window>),
    mut workshop: ResMut<Workshop>,
    picker: asset_picker::PickerInput,
) {
    let keys = &input.keys;
    if !pending.is_empty() || sprite_capture.is_some() || workshop.show_proof {
        return;
    }
    if workshop.search.is_none()
        && (keys.just_pressed(KeyCode::Slash) || input.clicked(InspectionAction::FindAsset))
    {
        workshop.search = Some(AssetSearch::default());
        text.clear();
        return;
    }
    if let Some(mut search) = workshop.search.take() {
        if keys.just_pressed(KeyCode::Escape) || picker.clicked(asset_picker::Action::Close) {
            text.clear();
            return;
        }
        if !keys.any_just_pressed([
            KeyCode::ArrowUp,
            KeyCode::ArrowDown,
            KeyCode::Enter,
            KeyCode::NumpadEnter,
        ]) {
            let before = search.query.clone();
            crate::construction::read_search_text(&mut search.query, &mut text);
            if search.query != before {
                search.row = 0;
            }
        } else {
            text.clear();
        }
        let matches = search.matching(&workshop.assets, &catalog);
        let picked = picker
            .selected()
            .and_then(|offset| matches.get(search.page_start() + offset))
            .or_else(|| {
                keys.any_just_pressed([KeyCode::Enter, KeyCode::NumpadEnter])
                    .then(|| matches.get(search.row))
                    .flatten()
            });
        if let Some(&index) = picked {
            workshop.selected = index;
            workshop.together = false;
            workshop.reset_camera();
            return;
        }
        if picker.clicked(asset_picker::Action::Next) || keys.just_pressed(KeyCode::PageDown) {
            let next = search.page_start() + asset_picker::PAGE_SIZE;
            if next < matches.len() {
                search.row = next;
            }
        } else if picker.clicked(asset_picker::Action::Previous)
            || keys.just_pressed(KeyCode::PageUp)
        {
            search.row = search.page_start().saturating_sub(asset_picker::PAGE_SIZE);
        } else if keys.just_pressed(KeyCode::ArrowDown) {
            search.row = (search.row + 1).min(matches.len().saturating_sub(1));
        } else if keys.just_pressed(KeyCode::ArrowUp) {
            search.row = search.row.saturating_sub(1);
        }
        workshop.search = Some(search);
        return;
    }
    text.clear();
    if keys.just_pressed(KeyCode::KeyV) || input.clicked(InspectionAction::Together) {
        workshop.together = !workshop.together;
        workshop.reset_camera();
        workshop.export_notice.clear();
        return;
    }
    let len = workshop.assets.len();
    if keys.just_pressed(KeyCode::ArrowRight) {
        workshop.together = false;
        workshop.selected = (workshop.selected + 1) % len;
    } else if keys.just_pressed(KeyCode::ArrowLeft) {
        workshop.together = false;
        workshop.selected = (workshop.selected + len - 1) % len;
    }
    if keys.just_pressed(KeyCode::KeyG) || input.clicked(InspectionAction::Grid) {
        workshop.guides = !workshop.guides;
    }
    if keys.just_pressed(KeyCode::KeyM) || input.clicked(InspectionAction::Surface) {
        workshop.surface = workshop.surface.next();
    }
    if !workshop.together
        && workshop.roof_available
        && (keys.just_pressed(KeyCode::KeyT) || input.clicked(InspectionAction::Roof))
    {
        workshop.roof_visible = !workshop.roof_visible;
    }
    if !workshop.together
        && (keys.just_pressed(KeyCode::KeyH) || input.clicked(InspectionAction::Figure))
    {
        workshop.scale_figure = !workshop.scale_figure;
    }
    if keys.just_pressed(KeyCode::KeyN) || input.clicked(InspectionAction::Light) {
        workshop.night = !workshop.night;
    }
    if keys.just_pressed(KeyCode::Home) || input.clicked(InspectionAction::Reset) {
        workshop.reset_camera();
    }
    if !workshop.together && keys.just_pressed(KeyCode::KeyR) {
        workshop.rotation = (workshop.rotation + 1) % 4;
    }
    if !workshop.together {
        for (&interaction, &action) in &input.buttons {
            if interaction == Interaction::Pressed
                && let InspectionAction::Rotate(turn) = action
            {
                workshop.rotation = turn;
            }
        }
    }
    let tilt =
        i8::from(keys.pressed(KeyCode::ArrowUp)) - i8::from(keys.pressed(KeyCode::ArrowDown));
    if tilt != 0 {
        workshop.elevation =
            (workshop.elevation + f32::from(tilt) * time.delta_secs() * 45.0).clamp(10.0, 80.0);
    }
    let turn = i8::from(keys.pressed(KeyCode::KeyE)) - i8::from(keys.pressed(KeyCode::KeyQ));
    if turn != 0 {
        workshop.heading += f32::from(turn) * time.delta_secs();
    }
    let zoom = i8::from(keys.any_pressed([KeyCode::Equal, KeyCode::NumpadAdd]))
        - i8::from(keys.any_pressed([KeyCode::Minus, KeyCode::NumpadSubtract]));
    if zoom != 0 {
        workshop.zoom =
            (workshop.zoom * (-f32::from(zoom) * time.delta_secs()).exp()).clamp(0.3, 3.0);
    }
    if window.focused {
        let delta = motion.delta;
        if delta != Vec2::ZERO && mouse.pressed(MouseButton::Right) {
            let view = orbit_camera(workshop.heading, workshop.elevation, workshop.target);
            let scale = workshop.viewport_height(&catalog) / window.height().max(1.0);
            workshop.target += (-*view.right() * delta.x + *view.up() * delta.y) * scale;
        } else if delta != Vec2::ZERO && mouse.pressed(MouseButton::Left) {
            workshop.heading -= delta.x * 0.008;
            workshop.elevation = (workshop.elevation + delta.y * 0.25).clamp(10.0, 80.0);
        }
        if scroll.delta.y != 0.0 {
            let sensitivity = match scroll.unit {
                MouseScrollUnit::Line => 0.12,
                MouseScrollUnit::Pixel => 0.002,
            };
            workshop.zoom = (workshop.zoom * (-scroll.delta.y * sensitivity).exp()).clamp(0.3, 3.0);
        }
    }
}

fn viewport_height(project: &WorkshopAsset, zoom: f32) -> f32 {
    let footprint = project.size[0].max(project.size[1]) as f32 * 2.0;
    footprint.mul_add(1.4, 4.0) * zoom
}

fn lighting(night: bool) -> (f32, Color, f32, &'static str) {
    if night {
        (800.0, Color::srgb_u8(157, 176, 227), 60.0, "Night")
    } else {
        (14500.0, Color::srgb_u8(255, 236, 201), 350.0, "Day")
    }
}

fn show_model(
    mut commands: Commands,
    (assets, models, workshop): (Res<AssetServer>, Res<WorkshopCatalog>, Res<Workshop>),
    catalog: Res<Catalog>,
    mut preview: Local<Option<(usize, Entity)>>,
    (mut light, mut ambient): (
        Single<&mut DirectionalLight, With<InspectionLight>>,
        ResMut<GlobalAmbientLight>,
    ),
    mut camera: Single<(&mut Transform, &mut Projection), With<InspectionCamera>>,
    mut text: Single<&mut Text, With<InspectionText>>,
) {
    if !workshop.is_changed() {
        return;
    }
    let project = &models.0[&workshop.assets[workshop.selected]];
    let model = if workshop.together {
        catalog.workshop_comparison
    } else {
        project.model
    };
    if preview.is_none_or(|(current, _)| current != model) {
        if let Some((_, entity)) = *preview {
            commands.entity(entity).despawn();
        }
        let entity = commands
            .spawn((
                WorkshopModel,
                building_model(&assets, model),
                Transform::default(),
            ))
            .id();
        *preview = Some((model, entity));
    }
    if let Some((_, entity)) = *preview {
        commands.entity(entity).insert((
            Transform::from_rotation(Quat::from_rotation_y(
                f32::from(workshop.rotation) * std::f32::consts::FRAC_PI_2,
            )),
            if workshop.show_proof {
                Visibility::Hidden
            } else {
                Visibility::Visible
            },
        ));
    }
    let (transform, projection) = &mut *camera;
    **transform = orbit_camera(workshop.heading, workshop.elevation, workshop.target);
    if let Projection::Orthographic(ortho) = &mut **projection {
        ortho.scaling_mode = bevy::camera::ScalingMode::FixedVertical {
            viewport_height: workshop.viewport_height(&models),
        };
    }
    light.shadows_enabled = !matches!(workshop.surface, Surface::Wireframe);
    let (illuminance, color, brightness, mode) = lighting(workshop.night);
    light.illuminance = illuminance;
    light.color = color;
    ambient.brightness = brightness;
    if workshop.show_proof {
        text.set_if_neq(Text::new(format!(
            "{} · Sprite Proof · {mode}\n0° · 90° · 180° · 270°\nN Lighting · F6 Export sheet · F7 Return to model\n{}",
            project.name, workshop.export_notice
        )));
        return;
    }
    if workshop.together {
        text.set_if_neq(Text::new(format!(
            "View together · {mode}\nHouse · Shed · Tree · Resident · Road\nDrag Orbit · Right-drag Pan · Scroll Zoom\nN Lighting · M Surface ({}) · G Grid · Home Reset · V Return to model",
            workshop.surface.label()
        )));
        return;
    }
    let roof = if workshop.roof_available {
        if workshop.roof_visible {
            " · T Hide roof"
        } else {
            " · T Show roof"
        }
    } else {
        ""
    };
    let surface = workshop.surface.label();
    text.set_if_neq(Text::new(format!(
        "{} · {}/{} · {mode}\n{} × {} m · {}\n←/→ Model · / Find asset · V View together · ↑/↓ Tilt · Q/E Orbit · +/− Zoom · R Rotate\nDrag Orbit · Right-drag Pan · Scroll Zoom\nN Lighting · M Surface ({surface}) · G Guides · H Scale figure{roof} · Home Reset · F5 Export PNG · F6 Sprite sheet · F7 Sprite Proof · F8 Export 3D source\n{}",
        project.name, workshop.selected + 1, workshop.assets.len(),
        project.size[0] * 2, project.size[1] * 2, project.category, workshop.export_notice,
    )));
}

fn show_scale_figure(
    workshop: Res<Workshop>,
    catalog: Res<WorkshopCatalog>,
    mut figure: Single<(&mut Transform, &mut Visibility), With<ScaleFigure>>,
) {
    if !workshop.is_changed() {
        return;
    }
    let project = &catalog.0[&workshop.assets[workshop.selected]];
    let (figure_transform, visibility) = &mut *figure;
    figure_transform.translation = scale_figure_position(project.size, workshop.rotation);
    **visibility = if workshop.scale_figure && !workshop.show_proof && !workshop.together {
        Visibility::Visible
    } else {
        Visibility::Hidden
    };
}

fn apply_roof_visibility(
    mut workshop: ResMut<Workshop>,
    model: Query<&SceneInstance, With<WorkshopModel>>,
    spawner: Res<SceneSpawner>,
    mut parts: Query<(&Name, &mut Visibility)>,
) {
    let mut available = false;
    if let Ok(instance) = model.single() {
        for entity in spawner.iter_instance_entities(**instance) {
            let Ok((name, mut visibility)) = parts.get_mut(entity) else {
                continue;
            };
            if name.as_str() == "functional-roof" {
                available = true;
                visibility.set_if_neq(if workshop.roof_visible {
                    Visibility::Inherited
                } else {
                    Visibility::Hidden
                });
            }
        }
    }
    if workshop.roof_available != available {
        workshop.roof_available = available;
    }
}

type SurfaceScene = Or<(With<WorkshopModel>, With<ScaleFigure>)>;
type Wireframes = HashMap<AssetId<Mesh>, Handle<Mesh>>;
type SurfaceMesh<'a> = (
    &'a mut Mesh3d,
    &'a mut MeshMaterial3d<StandardMaterial>,
    Option<&'a OriginalSurface>,
);

fn wireframe_mesh(source: &Mesh) -> Option<Mesh> {
    if source.primitive_topology() != PrimitiveTopology::TriangleList {
        return None;
    }
    let positions = source.attribute(Mesh::ATTRIBUTE_POSITION)?.clone();
    let vertices: Vec<_> = source.indices().map_or_else(
        || (0..source.count_vertices()).collect(),
        |indices| indices.iter().collect(),
    );
    let mut seen = HashSet::new();
    let mut lines = Vec::new();
    for triangle in vertices.as_chunks::<3>().0 {
        for (a, b) in [
            (triangle[0], triangle[1]),
            (triangle[1], triangle[2]),
            (triangle[2], triangle[0]),
        ] {
            if a != b && seen.insert((a.min(b), a.max(b))) {
                lines.extend([a as u32, b as u32]);
            }
        }
    }
    if lines.is_empty() {
        return None;
    }
    let mut wire = Mesh::new(PrimitiveTopology::LineList, RenderAssetUsages::default());
    wire.insert_attribute(Mesh::ATTRIBUTE_POSITION, positions);
    wire.insert_indices(Indices::U32(lines));
    Some(wire)
}

fn apply_surface(
    mut commands: Commands,
    workshop: Res<Workshop>,
    surfaces: Res<SurfaceMaterials>,
    spawner: Res<SceneSpawner>,
    scenes: Query<&SceneInstance, SurfaceScene>,
    mut scene_meshes: Query<SurfaceMesh>,
    (mut meshes, mut wireframes): (ResMut<Assets<Mesh>>, Local<Wireframes>),
) {
    for instance in &scenes {
        for entity in spawner.iter_instance_entities(**instance) {
            let Ok((mut mesh, mut material, original)) = scene_meshes.get_mut(entity) else {
                continue;
            };
            let captured;
            let original = match original {
                Some(saved) => saved,
                None if matches!(workshop.surface, Surface::Materials) => continue,
                None => {
                    captured = OriginalSurface {
                        mesh: mesh.0.clone(),
                        material: material.0.clone(),
                    };
                    commands.entity(entity).insert(captured.clone());
                    &captured
                }
            };
            let (target_mesh, target_material) = match workshop.surface {
                Surface::Materials => (&original.mesh, &original.material),
                Surface::Clay => (&original.mesh, &surfaces.clay),
                Surface::Wireframe => {
                    let id = original.mesh.id();
                    if let std::collections::hash_map::Entry::Vacant(entry) = wireframes.entry(id)
                        && let Some(wire) = meshes.get(id).and_then(wireframe_mesh)
                    {
                        entry.insert(meshes.add(wire));
                    }
                    let Some(wire) = wireframes.get(&id) else {
                        continue;
                    };
                    (wire, &surfaces.wire)
                }
            };
            if &mesh.0 != target_mesh {
                mesh.0 = target_mesh.clone();
            }
            if &material.0 != target_material {
                material.0 = target_material.clone();
            }
        }
    }
}

type InspectionChrome = Or<(
    With<InspectionText>,
    With<InspectionToolbar>,
    With<navigation::ArtTools>,
)>;

fn capture_preview(
    (mut commands, keys): (Commands, Res<ButtonInput<KeyCode>>),
    (mut workshop, catalog): (ResMut<Workshop>, Res<WorkshopCatalog>),
    mut panels: Query<(&mut Node, Has<navigation::ArtTools>), InspectionChrome>,
    pending: Query<(), With<Screenshot>>,
    scene: Query<(&SceneInstance, Option<&WorkshopModel>, Option<&ScaleFigure>)>,
    sprite_capture: Option<Res<sprites::SpriteCapture>>,
    spawner: Res<SceneSpawner>,
) {
    if !pending.is_empty() || sprite_capture.is_some() {
        return;
    }
    for (mut panel, navigation) in &mut panels {
        panel.display = if !navigation && workshop.search.is_some() {
            Display::None
        } else {
            Display::Flex
        };
    }
    if workshop.together
        || workshop.show_proof
        || workshop.search.is_some()
        || !keys.just_pressed(KeyCode::F5)
    {
        return;
    }
    let ready = |model| {
        scene.iter().any(|(instance, workshop_model, figure)| {
            (if model {
                workshop_model.is_some()
            } else {
                figure.is_some()
            }) && spawner.instance_is_ready(**instance)
        })
    };
    if !ready(true) || workshop.scale_figure && !ready(false) {
        workshop.export_notice = "Wait for the model to finish loading.".into();
        return;
    }
    let path = crate::save::location(crate::setup::Mode::Story).and_then(|save| {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(std::io::Error::other)?;
        let dir = save.with_file_name("workshop");
        std::fs::create_dir_all(&dir)?;
        let model = &workshop.assets[workshop.selected];
        let light = if workshop.night { "night" } else { "day" };
        Ok(dir.join(format!("{model}-{light}-{}.png", stamp.as_nanos())))
    });
    let path = match path {
        Ok(path) => path,
        Err(error) => {
            workshop.export_notice = format!("Could not prepare export · {error}");
            return;
        }
    };
    let id = &workshop.assets[workshop.selected];
    let project = &catalog.0[id];
    let mut metadata = serde_json::json!({
        "schema": "solar-friends.v3.workshop-preview.v1",
        "project": id,
        "model": project.model,
        "asset_revision": project.revision,
        "footprint_cells": project.size,
        "model_rotation_degrees": u16::from(workshop.rotation) * 90,
        "metres_per_cell": 2,
        "scale_figure": workshop.scale_figure,
        "roof_visible": !workshop.roof_available || workshop.roof_visible,
        "surface": workshop.surface.label().to_ascii_lowercase(),
        "light": if workshop.night { "night" } else { "day" },
        "camera": {
            "projection": "orthographic",
            "target_metres": workshop.target.to_array(),
            "heading_degrees": (workshop.heading.to_degrees() + 45.0).rem_euclid(360.0),
            "elevation_degrees": workshop.elevation,
            "viewport_height_metres": viewport_height(project, workshop.zoom),
        }
    });
    for (mut panel, _) in &mut panels {
        panel.display = Display::None;
    }
    commands.spawn(Screenshot::primary_window()).observe(
        move |event: On<ScreenshotCaptured>, mut workshop: ResMut<Workshop>| {
            let result = event
                .image
                .clone()
                .try_into_dynamic()
                .map_err(|error| error.to_string())
                .and_then(|img| img.to_rgb8().save(&path).map_err(|error| error.to_string()));
            let result = result.and_then(|()| {
                metadata["image_pixels"] =
                    serde_json::json!([event.image.width(), event.image.height()]);
                serde_json::to_vec_pretty(&metadata)
                    .map_err(std::io::Error::from)
                    .and_then(|bytes| {
                        crate::save::atomic_write(&path.with_extension("json"), &bytes, 4096)
                    })
                    .map_err(|error| {
                        format!("PNG saved, but metadata could not be written · {error}")
                    })
            });
            workshop.export_notice = match result {
                Ok(()) => format!("Saved PNG and metadata · {}", path.display()),
                Err(error) => format!("Export · {error}"),
            };
        },
    );
}

fn scale_figure_position(size: [i32; 2], rotation: u8) -> Vec3 {
    let width = size[usize::from(rotation % 2)] as f32;
    Vec3::new(width + 0.65, 0.0, 0.6)
}

fn draw_guides(
    workshop: Res<Workshop>,
    catalog: Res<WorkshopCatalog>,
    pending: Query<(), With<Screenshot>>,
    mut gizmos: Gizmos,
) {
    if !workshop.guides || workshop.show_proof || !pending.is_empty() {
        return;
    }
    let project = &catalog.0[&workshop.assets[workshop.selected]];
    let [mut x, mut z] = project.size.map(|cells| cells as f32);
    if !workshop.rotation.is_multiple_of(2) {
        std::mem::swap(&mut x, &mut z);
    }
    let edge = if workshop.together {
        12
    } else {
        (x.max(z) + 4.0).ceil() as i32
    };
    for marker in -edge..=edge {
        let distance = marker as f32;
        let extent = edge as f32;
        let tint = if marker.rem_euclid(2) == 0 {
            Color::srgba(0.75, 0.83, 0.75, 0.55)
        } else {
            Color::srgba(0.75, 0.83, 0.75, 0.3)
        };
        gizmos.line(
            Vec3::new(distance, 0.025, -extent),
            Vec3::new(distance, 0.025, extent),
            tint,
        );
        gizmos.line(
            Vec3::new(-extent, 0.025, distance),
            Vec3::new(extent, 0.025, distance),
            tint,
        );
    }
    if workshop.together {
        return;
    }
    gizmos.linestrip(
        [(-x, -z), (x, -z), (x, z), (-x, z), (-x, -z)].map(|(x, z)| Vec3::new(x, 0.05, z)),
        Color::srgb_u8(255, 211, 107),
    );
    gizmos.line(Vec3::ZERO, Vec3::Y * 2.0, Color::srgb_u8(109, 220, 255));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn asset_search_matches_the_display_name_or_catalog_key() {
        let catalog = WorkshopCatalog::default();
        let ids = vec!["tree".into(), "home-cottage".into(), "shed".into()];
        let search = AssetSearch {
            query: " ShAdE ".into(),
            ..default()
        };
        assert_eq!(search.matching(&ids, &catalog), [0]);
        let search = AssetSearch {
            query: "home-cott".into(),
            ..default()
        };
        assert_eq!(search.matching(&ids, &catalog), [1]);
    }

    #[test]
    fn asset_category_and_text_filters_apply_together() {
        let catalog = WorkshopCatalog::default();
        let ids = vec!["tree".into(), "home-cottage".into(), "shed".into()];
        let mut search = AssetSearch {
            category: Some(catalog.0["tree"].category.clone()),
            ..default()
        };
        assert_eq!(search.matching(&ids, &catalog), [0]);
        search.query = "home-cott".into();
        assert!(search.matching(&ids, &catalog).is_empty());
        search.category = None;
        assert_eq!(search.matching(&ids, &catalog), [1]);
    }

    #[test]
    fn wireframe_keeps_one_copy_of_each_triangle_edge() {
        let mut mesh = Mesh::new(
            PrimitiveTopology::TriangleList,
            RenderAssetUsages::default(),
        );
        mesh.insert_attribute(
            Mesh::ATTRIBUTE_POSITION,
            vec![
                [0.0_f32, 0.0, 0.0],
                [1.0, 0.0, 0.0],
                [0.0, 1.0, 0.0],
                [1.0, 1.0, 0.0],
            ],
        );
        mesh.insert_indices(Indices::U16(vec![0, 1, 2, 2, 1, 3]));
        let wire = wireframe_mesh(&mesh).unwrap();
        assert_eq!(wire.primitive_topology(), PrimitiveTopology::LineList);
        assert_eq!(wire.count_vertices(), 4);
        assert_eq!(
            wire.indices().unwrap().iter().collect::<Vec<_>>(),
            [0, 1, 1, 2, 2, 0, 1, 3, 3, 2]
        );
    }

    #[test]
    fn scale_figure_uses_the_rotated_footprint_edge() {
        assert_eq!(scale_figure_position([3, 8], 0), Vec3::new(3.65, 0.0, 0.6));
        assert_eq!(scale_figure_position([3, 8], 1), Vec3::new(8.65, 0.0, 0.6));
    }
}
