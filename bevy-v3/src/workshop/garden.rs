#[path = "garden_rehearsal.rs"]
mod rehearsal;

use super::garden_connections::{Connection, connections};
use super::garden_terrain::{BIOMES, Terrain};
use super::{WorkshopCatalog, building_model, ui_font};
use bevy::{
    asset::{AssetPath, embedded_asset, embedded_path},
    input::mouse::{AccumulatedMouseMotion, AccumulatedMouseScroll, MouseScrollUnit},
    prelude::*,
    scene::SceneInstanceReady,
    window::FileDragAndDrop,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    io,
    path::{Path, PathBuf},
};

pub(super) const CELLS: i32 = 96;
pub(super) const WIDTH: f32 = CELLS as f32 * 2.0;
const LAMP_LUMENS: f32 = 520.;
const CAMERA_HEIGHT: f32 = 170.;
const HOME_BEARING: f32 = std::f32::consts::FRAC_PI_4;
const MAX_SCENE_BYTES: u64 = 1_000_000;
const GALLERY: &str = include_str!("../../data/asset-garden.json");

#[derive(Clone, Deserialize, Serialize)]
pub(super) struct Layout {
    format: String,
    version: u32,
    #[serde(default = "flat_biome")]
    pub(super) biome: String,
    pub(super) props: Vec<Prop>,
}

fn flat_biome() -> String {
    "flat".into()
}

#[derive(Clone, Deserialize, Serialize)]
pub(super) struct Prop {
    pub(super) id: String,
    pub(super) asset: String,
    pub(super) column: i32,
    pub(super) row: i32,
    pub(super) rotation: i32,
}

impl Prop {
    pub(super) fn size(&self, models: &WorkshopCatalog) -> [i32; 2] {
        let [width, depth] = models.0[&self.asset].size;
        if self.rotation % 180 == 0 {
            [width, depth]
        } else {
            [depth, width]
        }
    }

    pub(super) fn center(&self, models: &WorkshopCatalog) -> Vec3 {
        let [width, depth] = self.size(models);
        Vec3::new(
            (2 * self.column + width - CELLS) as f32,
            0.,
            (2 * self.row + depth - CELLS) as f32,
        )
    }

    pub(super) fn fits(&self, models: &WorkshopCatalog) -> bool {
        let [width, depth] = self.size(models);
        (0..=CELLS - width).contains(&self.column) && (0..=CELLS - depth).contains(&self.row)
    }
}

impl Layout {
    fn decode(json: &str, models: &WorkshopCatalog) -> Result<Self, String> {
        let scene: Self = serde_json::from_str(json).map_err(|error| error.to_string())?;
        if scene.format != "solar-friends-scene" || scene.version != 1 || scene.props.len() > 1000 {
            return Err("Expected a V2 Asset Garden scene with up to 1,000 props.".into());
        }
        if !BIOMES.contains(&scene.biome.as_str()) {
            return Err("Unknown terrain biome.".into());
        }
        let mut ids = HashSet::new();
        for prop in &scene.props {
            if prop.id.is_empty()
                || prop.id.encode_utf16().count() > 100
                || !ids.insert(&prop.id)
                || !models.0.contains_key(&prop.asset)
                || ![0, 90, 180, 270].contains(&prop.rotation)
                || !prop.fits(models)
            {
                return Err(format!("Invalid prop {}", prop.id));
            }
        }
        Ok(scene)
    }
}

#[derive(Resource)]
struct Garden {
    layout: Layout,
    gallery: Layout,
    past: Vec<Vec<Prop>>,
    future: Vec<Vec<Prop>>,
    selected: Option<usize>,
    pending: Option<(Prop, bool)>,
    file: PathBuf,
    autosave: Option<PathBuf>,
    persistence: String,
    save_dirty: bool,
    status: String,
    redraw: bool,
    terrain_dirty: bool,
    terrain: Terrain,
    connections: HashMap<String, Connection>,
    library: Vec<String>,
    search: Option<super::AssetSearch>,
    coordinates: Option<String>,
    target: Vec3,
    bearing: f32,
    zoom: f32,
    grid: bool,
    night: bool,
}

impl Garden {
    fn focus_first(&mut self, models: &WorkshopCatalog) {
        self.target = self
            .layout
            .props
            .iter()
            .find(|prop| prop.asset == "house")
            .or_else(|| self.layout.props.first())
            .map_or(Vec3::ZERO, |prop| {
                let mut center = prop.center(models);
                center.y = self.terrain.height(center.x, center.z);
                center
            });
        self.zoom = 25. / CAMERA_HEIGHT;
        self.bearing = HOME_BEARING;
    }

    fn begin_copy(&mut self, mut prop: Prop) {
        if self.layout.props.len() >= 1000 {
            self.status = "The plot already has 1,000 props.".into();
            return;
        }
        prop.id = (1..)
            .map(|i| format!("copy-{i}"))
            .find(|id| self.layout.props.iter().all(|existing| &existing.id != id))
            .expect("at most 1,000 occupied IDs");
        self.pending = Some((prop, true));
    }

    fn edit(&mut self) {
        if self.past.len() == 100 {
            self.past.remove(0);
        }
        self.past.push(self.layout.props.clone());
        self.future.clear();
        self.redraw = true;
        self.terrain_dirty = true;
        self.save_dirty = true;
    }
}

#[derive(Component)]
struct GardenProp {
    id: String,
    model: usize,
    shared_inverter: bool,
}
#[derive(Component)]
struct GardenText;
#[derive(Component)]
struct GardenGround;
#[derive(Component)]
struct GardenSun;
#[derive(Component)]
struct Streetlamp;

#[derive(Component)]
struct PlacementPreview(usize);

fn read_layout(path: &Path, models: &WorkshopCatalog) -> io::Result<Layout> {
    let bytes = crate::save::read_bytes(path, MAX_SCENE_BYTES)?;
    let json = std::str::from_utf8(&bytes).map_err(io::Error::other)?;
    Layout::decode(json, models).map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))
}

fn write_layout(path: &Path, layout: &Layout) -> io::Result<()> {
    let bytes = serde_json::to_vec_pretty(layout).map_err(io::Error::other)?;
    crate::save::atomic_write(path, &bytes, MAX_SCENE_BYTES)
}

fn biome_landscape(biome: &str) -> Vec<Prop> {
    let mut landscapes: HashMap<String, Vec<Prop>> =
        serde_json::from_str(include_str!("../../data/asset-garden-biomes.json"))
            .expect("bundled V2 biome landscapes");
    landscapes.remove(biome).expect("known biome landscape")
}

pub fn run(path: Option<PathBuf>, night: bool, study: bool) {
    let models = WorkshopCatalog::default();
    let gallery = Layout::decode(GALLERY, &models).expect("bundled V2 gallery");
    let mut persistence = String::new();
    let mut autosave = if study {
        persistence = "Biome study. Ctrl/Cmd+S exports the scene.".into();
        None
    } else if path.is_none() {
        match crate::save::location(crate::setup::Mode::Sandbox) {
            Ok(path) => Some(path.with_file_name("asset-garden.json")),
            Err(error) => {
                persistence = format!("Autosave unavailable: {error}");
                None
            }
        }
    } else {
        persistence = "Opened as a separate scene. Ctrl/Cmd+S saves changes.".into();
        None
    };
    let opened = path.as_deref().or(autosave.as_deref());
    let loaded = opened
        .map(|file| read_layout(file, &models))
        .unwrap_or_else(|| {
            let mut layout = gallery.clone();
            if study {
                layout.biome = "mata-atlantica".into();
                layout.props = biome_landscape(&layout.biome);
            }
            Ok(layout)
        })
        .or_else(|error| {
            if error.kind() == io::ErrorKind::NotFound && path.is_none() {
                read_layout(Path::new("solar-friends-asset-garden.json"), &models)
            } else {
                Err(error)
            }
        });
    let file = path.unwrap_or_else(|| PathBuf::from("solar-friends-v02-scene.json"));
    let (layout, status) = match loaded {
        Ok(layout) => (layout, String::new()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => (gallery.clone(), String::new()),
        Err(error) => {
            if autosave.take().is_some() {
                persistence = "Autosave disabled to preserve the unreadable scene.".into();
            }
            (gallery.clone(), format!("Could not open scene: {error}"))
        }
    };
    let mut library: Vec<_> = models.0.keys().cloned().collect();
    library.sort_by_key(|id| (&models.0[id].name, id.clone()));
    let mut app = App::new();
    app.add_plugins(DefaultPlugins.set(WindowPlugin {
        primary_window: Some(Window {
            title: "Solar Friends V3 · Asset Garden".into(),
            ..default()
        }),
        ..default()
    }))
    .add_plugins(crate::ui_font::UiFontPlugin)
    .insert_resource(models)
    .init_resource::<GlobalAmbientLight>()
    .init_resource::<rehearsal::Rehearsal>()
    .add_plugins(crate::resident_animation::ResidentAnimationPlugin)
    .insert_resource(Garden {
        layout,
        gallery,
        file,
        autosave,
        persistence,
        save_dirty: false,
        status,
        past: vec![],
        future: vec![],
        selected: None,
        pending: None,
        redraw: true,
        terrain_dirty: true,
        terrain: Terrain::default(),
        connections: HashMap::new(),
        library,
        search: None,
        coordinates: None,
        target: Vec3::ZERO,
        bearing: HOME_BEARING,
        zoom: 1.0,
        grid: false,
        night,
    })
    .add_observer(light_new_props)
    .add_systems(Startup, setup)
    .add_systems(
        Update,
        (
            edit,
            import_scene,
            persist_scene,
            rehearsal::tick,
            update_terrain,
            render,
            preview,
            update_lighting,
        )
            .chain(),
    );
    crate::village::register_building_models(&mut app);
    embedded_asset!(app, "connected-solar-farm.glb");
    crate::village::register_opening_models(&mut app);
    app.run();
}

fn setup(
    mut commands: Commands,
    assets: Res<AssetServer>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    commands.spawn((
        Camera3d::default(),
        Projection::Orthographic(OrthographicProjection {
            scaling_mode: bevy::camera::ScalingMode::FixedVertical {
                viewport_height: CAMERA_HEIGHT,
            },
            ..OrthographicProjection::default_3d()
        }),
        camera_transform(Vec3::ZERO, HOME_BEARING),
    ));
    commands.spawn((
        GardenSun,
        DirectionalLight {
            illuminance: 18_000.,
            shadows_enabled: true,
            ..default()
        },
        bevy::light::CascadeShadowConfigBuilder {
            num_cascades: 1,
            minimum_distance: 1.,
            maximum_distance: 450.,
            ..default()
        }
        .build(),
        Transform::from_xyz(-120., 240., 150.).looking_at(Vec3::ZERO, Vec3::Y),
    ));
    commands.spawn((
        GardenGround,
        Mesh3d(meshes.add(Terrain::default().mesh("flat"))),
        MeshMaterial3d(materials.add(StandardMaterial {
            perceptual_roughness: 1.,
            cull_mode: None,
            ..default()
        })),
    ));
    commands.spawn((
        GardenText,
        Text::default(),
        ui_font(&assets, 16.),
        BackgroundColor(Color::srgba(0.07, 0.12, 0.1, 0.91)),
        Node {
            position_type: PositionType::Absolute,
            top: px(12),
            left: px(12),
            padding: UiRect::all(px(12)),
            ..default()
        },
    ));
}

fn camera_transform(target: Vec3, bearing: f32) -> Transform {
    Transform::from_translation(
        target + Vec3::new(bearing.cos() * 180., 130., bearing.sin() * 180.),
    )
    .looking_at(target, Vec3::Y)
}

#[allow(clippy::too_many_arguments)]
fn edit(
    mut garden: ResMut<Garden>,
    models: Res<WorkshopCatalog>,
    keys: Res<ButtonInput<KeyCode>>,
    mouse: Res<ButtonInput<MouseButton>>,
    motion: Res<AccumulatedMouseMotion>,
    scroll: Res<AccumulatedMouseScroll>,
    mut typing: MessageReader<bevy::input::keyboard::KeyboardInput>,
    window: Single<&Window>,
    mut camera: Single<(&Camera, &GlobalTransform, &mut Transform, &mut Projection)>,
) {
    use KeyCode::*;
    let (camera, global, transform, projection) = &mut *camera;
    let pressed = |key| keys.just_pressed(key);
    if let Some(mut input) = garden.coordinates.take() {
        if pressed(Escape) {
            typing.clear();
            garden.status.clear();
            return;
        }
        if pressed(Enter) || pressed(NumpadEnter) {
            typing.clear();
            if let Some(index) = garden.selected {
                match exact_position(&input, &garden.layout.props[index], &models) {
                    Ok((column, row)) => {
                        let current = &garden.layout.props[index];
                        if (column, row) != (current.column, current.row) {
                            garden.edit();
                            garden.layout.props[index].column = column;
                            garden.layout.props[index].row = row;
                        }
                        garden.status.clear();
                        return;
                    }
                    Err(error) => garden.status = error.into(),
                }
            }
        } else {
            crate::construction::read_search_text(&mut input, &mut typing);
        }
        garden.coordinates = Some(input);
        return;
    }
    if pressed(F2)
        && garden.selected.is_some()
        && garden.search.is_none()
        && garden.pending.is_none()
    {
        garden.coordinates = Some(String::new());
        garden.status.clear();
        typing.clear();
        return;
    }
    if pressed(Slash) && garden.search.is_none() && garden.pending.is_none() {
        garden.search = Some(super::AssetSearch::default());
        typing.clear();
        return;
    }
    if let Some(mut search) = garden.search.take() {
        if pressed(Escape) {
            typing.clear();
            return;
        }
        let enter = pressed(Enter) || pressed(NumpadEnter);
        if pressed(ArrowUp) || pressed(ArrowDown) || enter {
            typing.clear();
        } else {
            let before = search.query.clone();
            crate::construction::read_search_text(&mut search.query, &mut typing);
            if search.query != before {
                search.row = 0;
            }
        }
        let matches = search.matching(&garden.library, &models);
        if pressed(ArrowDown) {
            search.row = (search.row + 1).min(matches.len().saturating_sub(1));
        } else if pressed(ArrowUp) {
            search.row = search.row.saturating_sub(1);
        } else if enter && let Some(&index) = matches.get(search.row) {
            let asset = garden.library[index].clone();
            if let Some(index) = garden
                .layout
                .props
                .iter()
                .position(|prop| prop.asset == asset)
            {
                let center = garden.layout.props[index].center(&models);
                garden.selected = Some(index);
                garden.target = Vec3::new(
                    center.x,
                    garden.terrain.height(center.x, center.z),
                    center.z,
                );
                garden.zoom = 0.12;
            } else {
                let center = ((garden.target.xz() + Vec2::splat(WIDTH / 2.)) / 2.)
                    .floor()
                    .as_ivec2();
                let [w, d] = models.0[&asset].size;
                garden.begin_copy(Prop {
                    id: String::new(),
                    asset,
                    rotation: 0,
                    column: center.x.clamp(0, CELLS - w),
                    row: center.y.clamp(0, CELLS - d),
                });
            }
            return;
        }
        garden.search = Some(search);
        return;
    }
    typing.clear();
    let modifier = [ControlLeft, ControlRight, SuperLeft, SuperRight]
        .iter()
        .any(|key| keys.pressed(*key));
    let zoom_in = pressed(Equal) || pressed(NumpadAdd);
    let zoom_out = pressed(Minus) || pressed(NumpadSubtract);
    let wheel = match scroll.unit {
        MouseScrollUnit::Line => scroll.delta.y,
        MouseScrollUnit::Pixel => scroll.delta.y * 0.035,
    };
    let zoom_steps = wheel + f32::from(zoom_in) - f32::from(zoom_out);
    garden.zoom = (garden.zoom * (-0.09 * zoom_steps).exp()).clamp(0.035, 3.);
    garden.bearing +=
        (i32::from(pressed(KeyE)) - i32::from(pressed(KeyQ))) as f32 * std::f32::consts::FRAC_PI_2;
    if mouse.pressed(MouseButton::Right) {
        let zoom = garden.zoom;
        let right = transform.right().as_vec3();
        let forward = Vec3::Y.cross(right);
        garden.target +=
            (-right * motion.delta.x + forward * motion.delta.y) * zoom * CAMERA_HEIGHT
                / window.height().max(1.);
        garden.target.x = garden.target.x.clamp(-WIDTH * 0.5, WIDTH * 0.5);
        garden.target.z = garden.target.z.clamp(-WIDTH * 0.5, WIDTH * 0.5);
    }
    if pressed(Home) {
        garden.focus_first(&models);
    }
    if pressed(End) {
        let aspect = window.width() / window.height().max(1.);
        garden.target = Vec3::ZERO;
        garden.zoom =
            1_f32.max(WIDTH * std::f32::consts::SQRT_2 * 1.05 / (CAMERA_HEIGHT * aspect.max(0.1)));
    }
    **transform = camera_transform(garden.target, garden.bearing);
    if let Projection::Orthographic(orthographic) = &mut **projection {
        orthographic.scale = garden.zoom;
    }
    if pressed(KeyN) {
        garden.night = !garden.night;
    }
    if pressed(KeyG) {
        garden.grid = !garden.grid;
    }
    let cell = window
        .cursor_position()
        .and_then(|pixel| camera.viewport_to_world(global, pixel).ok())
        .and_then(|ray| garden.terrain.surface(ray))
        .map(|point| {
            (
                ((point.x + WIDTH / 2.) / 2.).floor() as i32,
                ((point.z + WIDTH / 2.) / 2.).floor() as i32,
            )
        });
    if modifier && pressed(KeyS) {
        garden.persistence = match write_layout(&garden.file, &garden.layout) {
            Ok(()) => format!("Saved scene to {}", garden.file.display()),
            Err(error) => format!("Could not save scene: {error}"),
        };
    }
    if modifier && pressed(KeyZ) {
        let redo = keys.pressed(ShiftLeft) || keys.pressed(ShiftRight);
        let snapshot = if redo {
            garden.future.pop()
        } else {
            garden.past.pop()
        };
        if let Some(snapshot) = snapshot {
            let previous = std::mem::replace(&mut garden.layout.props, snapshot);
            if redo {
                garden.past.push(previous);
            } else {
                garden.future.push(previous);
            }
            garden.selected = None;
            garden.pending = None;
            garden.redraw = true;
            garden.terrain_dirty = true;
            garden.save_dirty = true;
        }
    }
    if pressed(KeyB) && garden.pending.is_none() {
        let current = BIOMES
            .iter()
            .position(|&biome| biome == garden.layout.biome)
            .unwrap_or_default();
        garden.layout.biome = BIOMES[(current + 1) % BIOMES.len()].into();
        garden.terrain_dirty = true;
        garden.save_dirty = true;
        garden.redraw = true;
        return;
    }
    if pressed(KeyL) && garden.pending.is_none() && garden.layout.biome != "flat" {
        garden.edit();
        garden.layout.props = biome_landscape(&garden.layout.biome);
        garden.selected = None;
        return;
    }
    if pressed(Escape) {
        garden.pending = None;
        return;
    }
    if let Some((mut prop, copy)) = garden.pending.take() {
        if (motion.delta != Vec2::ZERO || mouse.just_pressed(MouseButton::Left))
            && let Some((column, row)) = cell
        {
            prop.column = column;
            prop.row = row;
        }
        prop.column += i32::from(pressed(ArrowRight)) - i32::from(pressed(ArrowLeft));
        prop.row += i32::from(pressed(ArrowDown)) - i32::from(pressed(ArrowUp));
        if pressed(KeyR) {
            prop.rotation = (prop.rotation + 90) % 360;
        }
        if ((mouse.just_pressed(MouseButton::Left) && cell.is_some())
            || pressed(Enter)
            || pressed(NumpadEnter))
            && prop.fits(&models)
        {
            garden.edit();
            if copy {
                garden.selected = Some(garden.layout.props.len());
                garden.layout.props.push(prop);
            } else if let Some(index) = garden.selected {
                garden.layout.props[index] = prop;
            }
        } else {
            garden.pending = Some((prop, copy));
        }
        return;
    }
    if mouse.just_pressed(MouseButton::Left)
        && let Some((column, row)) = cell
    {
        garden.selected = garden.layout.props.iter().rposition(|prop| {
            let [width, depth] = prop.size(&models);
            (prop.column..prop.column + width).contains(&column)
                && (prop.row..prop.row + depth).contains(&row)
        });
    }
    if pressed(F5) {
        garden.edit();
        garden.layout.props = garden.gallery.props.clone();
        garden.selected = None;
    }
    let Some(index) = garden.selected else {
        return;
    };
    let mut prop = garden.layout.props[index].clone();
    if pressed(Delete) || pressed(Backspace) {
        garden.edit();
        garden.layout.props.remove(index);
        garden.selected = None;
    } else if pressed(KeyM) {
        garden.pending = Some((prop, false));
    } else if modifier && pressed(KeyD) {
        garden.begin_copy(prop);
    } else if pressed(KeyR) {
        prop.rotation = (prop.rotation + 90) % 360;
        if prop.fits(&models) {
            garden.edit();
            garden.layout.props[index] = prop;
        }
    }
}

fn exact_position(
    input: &str,
    prop: &Prop,
    models: &WorkshopCatalog,
) -> Result<(i32, i32), &'static str> {
    let mut values = input.split_whitespace();
    let parse = |value: Option<&str>| {
        value
            .and_then(|value| value.parse::<i32>().ok())
            .and_then(|value| value.checked_sub(1))
    };
    let (Some(column), Some(row), None) =
        (parse(values.next()), parse(values.next()), values.next())
    else {
        return Err("Enter two whole numbers, such as 42 18.");
    };
    let candidate = Prop {
        column,
        row,
        ..prop.clone()
    };
    if !candidate.fits(models) {
        return Err("Keep the full rotated footprint inside the plot.");
    }
    Ok((column, row))
}

fn import_scene(
    mut dropped: MessageReader<FileDragAndDrop>,
    window: Single<Entity, With<bevy::window::PrimaryWindow>>,
    models: Res<WorkshopCatalog>,
    mut garden: ResMut<Garden>,
) {
    let Some(path) = dropped
        .read()
        .filter_map(|event| match event {
            FileDragAndDrop::DroppedFile {
                window: target,
                path_buf,
            } if target == &*window => Some(path_buf),
            _ => None,
        })
        .last()
    else {
        return;
    };
    match read_layout(path, &models) {
        Ok(layout) => {
            garden.edit();
            garden.layout = layout;
            garden.selected = None;
            garden.pending = None;
            garden.search = None;
            garden.coordinates = None;
            garden.status = format!("Imported {}", path.display());
        }
        Err(error) => garden.status = format!("Could not import scene: {error}"),
    }
}

fn persist_scene(mut garden: ResMut<Garden>) {
    if !garden.save_dirty {
        return;
    }
    garden.save_dirty = false;
    let Some(path) = &garden.autosave else {
        return;
    };
    garden.persistence = match write_layout(path, &garden.layout) {
        Ok(()) => "Scene autosaved.".into(),
        Err(error) => format!("Autosave failed: {error}. Ctrl/Cmd+S exports the scene."),
    };
}

fn update_terrain(
    mut garden: ResMut<Garden>,
    models: Res<WorkshopCatalog>,
    ground: Single<&Mesh3d, With<GardenGround>>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut initialized: Local<bool>,
) {
    if garden.terrain_dirty {
        garden.terrain_dirty = false;
        garden.connections = connections(&garden.layout.props, &models);
        garden.terrain = Terrain::new(&garden.layout, &models);
        if !*initialized {
            garden.focus_first(&models);
            *initialized = true;
        }
        if let Some(mesh) = meshes.get_mut(&ground.0) {
            *mesh = garden.terrain.mesh(&garden.layout.biome);
        }
    }
}

fn preview(
    mut commands: Commands,
    garden: Res<Garden>,
    models: Res<WorkshopCatalog>,
    assets: Res<AssetServer>,
    mut existing: Query<(Entity, &PlacementPreview, &mut Transform)>,
) {
    let pending = garden.pending.as_ref().map(|(prop, _)| {
        let model = models.0[&prop.asset].model;
        let mut center = prop.center(&models);
        center.y = garden.terrain.height(center.x, center.z);
        let transform = Transform::from_translation(center)
            .with_rotation(Quat::from_rotation_y((prop.rotation as f32).to_radians()));
        (model, transform)
    });
    for (entity, marker, mut transform) in &mut existing {
        if let Some((model, target)) = pending
            && marker.0 == model
        {
            transform.set_if_neq(target);
            return;
        }
        commands.entity(entity).despawn();
    }
    if let Some((model, transform)) = pending {
        commands.spawn((
            PlacementPreview(model),
            building_model(&assets, model),
            transform,
        ));
    }
}

#[allow(clippy::too_many_arguments)]
fn render(
    mut commands: Commands,
    mut garden: ResMut<Garden>,
    models: Res<WorkshopCatalog>,
    assets: Res<AssetServer>,
    mut rendered: Query<(Entity, &GardenProp, &mut Transform)>,
    mut text: Single<&mut Text, With<GardenText>>,
    mut gizmos: Gizmos,
    rehearsal: Res<rehearsal::Rehearsal>,
) {
    if garden.redraw {
        const MODELS_PER_FRAME: usize = 12;
        let mut displayed: HashMap<_, _> = rendered
            .iter_mut()
            .map(|(entity, marker, transform)| {
                (
                    marker.id.as_str(),
                    (entity, marker.model, marker.shared_inverter, transform),
                )
            })
            .collect();
        let mut spawned = 0;
        let mut loading = false;
        for prop in &garden.layout.props {
            let model = models.0[&prop.asset].model;
            let shared_inverter = prop.asset == "solar_farm"
                && garden
                    .connections
                    .get(&prop.id)
                    .is_some_and(|connection| !connection.leader);
            let mut center = prop.center(&models);
            center.y = garden.terrain.height(center.x, center.z);
            let transform = Transform::from_translation(center)
                .with_rotation(Quat::from_rotation_y((prop.rotation as f32).to_radians()));
            if let Some((entity, existing_model, existing_shared, mut existing_transform)) =
                displayed.remove(prop.id.as_str())
            {
                if existing_model == model && existing_shared == shared_inverter {
                    if !rehearsal.is_active(entity) {
                        existing_transform.set_if_neq(transform);
                    }
                    continue;
                }
                commands.entity(entity).despawn();
            }
            if spawned == MODELS_PER_FRAME {
                loading = true;
                continue;
            }
            let resident = rehearsal::resident_model(&prop.asset);
            let scene = if let Some((_, scene)) = resident {
                crate::village::opening_model(&assets, scene)
            } else if shared_inverter {
                let path = AssetPath::from_path_buf(embedded_path!("connected-solar-farm.glb"))
                    .with_source("embedded")
                    .with_label("Scene0");
                SceneRoot(assets.load(path))
            } else {
                building_model(&assets, model)
            };
            let mut entity = commands.spawn((
                GardenProp {
                    id: prop.id.clone(),
                    model,
                    shared_inverter,
                },
                scene,
                transform,
            ));
            if prop.asset == "streetlight" {
                entity.with_child((
                    Streetlamp,
                    PointLight {
                        color: Color::srgb_u8(255, 210, 138),
                        intensity: if garden.night { LAMP_LUMENS } else { 0. },
                        range: 7.,
                        ..default()
                    },
                    Transform::from_xyz(0.55, 3.18, 0.),
                ));
            }
            if let Some((index, _)) = resident {
                entity.insert((
                    crate::resident_animation::ResidentAnimation(index),
                    crate::resident_animation::RehearsalPose(
                        crate::resident_animation::Motion::Idle,
                        false,
                    ),
                ));
            }
            spawned += 1;
        }
        for (entity, _, _, _) in displayed.into_values() {
            commands.entity(entity).despawn();
        }
        garden.redraw = loading;
    }
    if let Some(input) = &garden.coordinates {
        text.0 = format!(
            "Exact placement
Enter one-based column and row, separated by a space.
Column Row: {input}▏
Enter place   Esc cancel
{}",
            garden.status
        );
        return;
    }
    if let Some(search) = &garden.search {
        text.0 = search.label(&garden.library, &models);
        return;
    }
    let selection = garden.selected.map(|index| &garden.layout.props[index]);
    let highlighted = garden.pending.as_ref().map(|(prop, _)| prop).or(selection);
    if let Some(prop) = highlighted {
        let [width, depth] = prop.size(&models);
        let mut center = prop.center(&models);
        center.y = garden.terrain.height(center.x, center.z);
        gizmos.rect(
            Isometry3d::new(
                center + Vec3::Y * 0.05,
                Quat::from_rotation_x(std::f32::consts::FRAC_PI_2),
            ),
            Vec2::new(width as f32, depth as f32) * 2.,
            if prop.fits(&models) {
                Color::WHITE
            } else {
                Color::srgb(1., 0.3, 0.2)
            },
        );
    }
    if garden.grid {
        let color = Color::srgba(0.1, 0.24, 0.13, 0.45);
        let surface = |x, z| Vec3::new(x, garden.terrain.height(x, z) + 0.025, z);
        for index in 0..=CELLS {
            let a = index as f32 * 2. - WIDTH / 2.;
            for segment in 0..CELLS {
                let b = segment as f32 * 2. - WIDTH / 2.;
                gizmos.line(surface(a, b), surface(a, b + 2.), color);
                gizmos.line(surface(b, a), surface(b + 2., a), color);
            }
        }
    }
    let label = highlighted.map_or_else(
        || "Click a prop to select it".into(),
        |prop| {
            format!(
                "{}  ·  Column {}  Row {}  ·  {}°",
                models.0[&prop.asset].name,
                prop.column + 1,
                prop.row + 1,
                prop.rotation
            )
        },
    );
    let connection = selection
        .and_then(|prop| garden.connections.get(&prop.id))
        .map_or(String::new(), |group| {
            format!(
                "  ·  {} connected sections, {} cells",
                group.count, group.area
            )
        });
    let rehearsal_hint = rehearsal::hint(&rehearsal, &garden.layout.props, selection, &models);
    text.0 = format!(
        "Asset Garden  ·  {} props  ·  {}\n{label}{connection}\nRight drag pan   Scroll or +/- zoom   Q/E turn   Home first prop   End whole plot   G grid   N night   / catalog\nB terrain   L load biome landscape\nM move   F2 exact position   R rotate   Ctrl/Cmd D copy   Delete remove   F5 restore gallery\nArrows adjust placement   Click/Enter confirm   Esc cancel   Ctrl/Cmd Z undo   Shift redo   Ctrl/Cmd S save   Drop scene JSON to import{rehearsal_hint}\n{}\n{}",
        garden.layout.props.len(),
        garden.layout.biome,
        garden.status,
        garden.persistence
    );
}

fn glow_strength(color: Color) -> Option<f32> {
    let color = color.to_linear().to_vec3();
    [
        (Color::srgb_u8(51, 79, 78), 0.45),
        (Color::srgb_u8(245, 214, 139), 1.6),
    ]
    .into_iter()
    .find_map(|(target, strength)| {
        color
            .abs_diff_eq(target.to_linear().to_vec3(), 0.0001)
            .then_some(strength)
    })
}

fn set_glow(material: &mut StandardMaterial, strength: f32, night: bool) {
    material.emissive = if night {
        Color::srgb_u8(244, 184, 95).to_linear() * strength
    } else {
        LinearRgba::BLACK
    };
    material.emissive_exposure_weight = 0.;
}

fn light_new_props(
    event: On<SceneInstanceReady>,
    garden: Res<Garden>,
    children: Query<&Children>,
    surfaces: Query<&MeshMaterial3d<StandardMaterial>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    if !garden.night {
        return;
    }
    for entity in children.iter_descendants(event.entity) {
        if let Ok(surface) = surfaces.get(entity)
            && let Some(strength) = materials
                .get(surface.id())
                .and_then(|material| glow_strength(material.base_color))
            && let Some(material) = materials.get_mut(surface.id())
        {
            set_glow(material, strength, true);
        }
    }
}

fn update_lighting(
    garden: Res<Garden>,
    mut mode: Local<Option<bool>>,
    mut sun: Single<&mut DirectionalLight, With<GardenSun>>,
    (mut ambient, mut background): (ResMut<GlobalAmbientLight>, ResMut<ClearColor>),
    mut lamps: Query<&mut PointLight, With<Streetlamp>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    let night = garden.night;
    if *mode == Some(night) {
        return;
    }
    *mode = Some(night);
    let (illuminance, tint, brightness, _) = super::lighting(night);
    sun.illuminance = illuminance;
    sun.color = tint;
    ambient.brightness = brightness;
    ambient.color = if night {
        Color::srgb_u8(163, 185, 222)
    } else {
        Color::srgb_u8(255, 241, 207)
    };
    background.0 = if night {
        Color::srgb_u8(38, 59, 69)
    } else {
        Color::srgb_u8(220, 226, 200)
    };
    for mut light in &mut lamps {
        light.intensity = if night { LAMP_LUMENS } else { 0. };
    }
    let glowing: Vec<_> = materials
        .iter()
        .filter_map(|(id, material)| {
            glow_strength(material.base_color).map(|strength| (id, strength))
        })
        .collect();
    for (id, strength) in glowing {
        if let Some(material) = materials.get_mut(id) {
            set_glow(material, strength, night);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn v2_gallery_covers_the_standalone_catalog() {
        let models = WorkshopCatalog::default();
        let gallery = Layout::decode(GALLERY, &models).unwrap();
        let assets: HashSet<_> = gallery.props.iter().map(|prop| &prop.asset).collect();
        assert_eq!(assets.len(), models.0.len());
        let exported = serde_json::to_string(&gallery).unwrap();
        assert_eq!(
            Layout::decode(&exported, &models).unwrap().props.len(),
            assets.len()
        );
    }

    #[test]
    fn scene_files_round_trip_and_reject_oversized_input() {
        let models = WorkshopCatalog::default();
        let mut gallery = Layout::decode(GALLERY, &models).unwrap();
        gallery.biome = "caatinga".into();
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "solar-v3-garden-{}-{nonce}.json",
            std::process::id()
        ));
        write_layout(&path, &gallery).unwrap();
        let reopened = read_layout(&path, &models).unwrap();
        assert_eq!(reopened.biome, "caatinga");
        assert_eq!(reopened.props.len(), gallery.props.len());
        std::fs::write(&path, vec![b' '; MAX_SCENE_BYTES as usize + 1]).unwrap();
        let error = read_layout(&path, &models)
            .err()
            .expect("oversized import rejected");
        std::fs::remove_file(path).unwrap();
        assert_eq!(error.kind(), io::ErrorKind::InvalidData);
    }

    #[test]
    fn exact_positions_use_one_based_cells_and_rotated_bounds() {
        let models = WorkshopCatalog::default();
        let layout = Layout::decode(GALLERY, &models).unwrap();
        let mut prop = layout
            .props
            .into_iter()
            .find(|prop| prop.asset == "garden")
            .unwrap();
        prop.rotation = 90;
        let [width, depth] = prop.size(&models);
        assert_eq!(exact_position("1 1", &prop, &models), Ok((0, 0)));
        assert_eq!(
            exact_position(
                &format!("{} {}", CELLS + 1 - width, CELLS + 1 - depth),
                &prop,
                &models
            ),
            Ok((CELLS - width, CELLS - depth))
        );
        assert!(exact_position(&format!("{} 1", CELLS + 2 - width), &prop, &models).is_err());
        assert!(exact_position("0 1", &prop, &models).is_err());
        assert!(exact_position("1 1 1", &prop, &models).is_err());
    }

    #[test]
    fn rejects_invalid_placement_and_duplicate_ids() {
        let models = WorkshopCatalog::default();
        let mut gallery = Layout::decode(GALLERY, &models).unwrap();
        gallery.props[0].column = CELLS;
        assert!(Layout::decode(&serde_json::to_string(&gallery).unwrap(), &models).is_err());

        let mut gallery = Layout::decode(GALLERY, &models).unwrap();
        gallery.props[1].id = gallery.props[0].id.clone();
        assert!(Layout::decode(&serde_json::to_string(&gallery).unwrap(), &models).is_err());
    }
}
