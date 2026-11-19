use super::{WorkshopCatalog, building_model, ui_font};
use bevy::{
    input::mouse::{AccumulatedMouseMotion, AccumulatedMouseScroll},
    prelude::*,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
};

const CELLS: i32 = 96;
const WIDTH: f32 = CELLS as f32 * 2.0;
const GALLERY: &str = include_str!("../../data/asset-garden.json");

#[derive(Clone, Deserialize, Serialize)]
struct Layout {
    format: String,
    version: u32,
    #[serde(default = "flat_biome")]
    biome: String,
    props: Vec<Prop>,
}

fn flat_biome() -> String {
    "flat".into()
}

#[derive(Clone, Deserialize, Serialize)]
struct Prop {
    id: String,
    asset: String,
    column: i32,
    row: i32,
    rotation: i32,
}

impl Prop {
    fn size(&self, models: &WorkshopCatalog) -> [i32; 2] {
        let [width, depth] = models.0[&self.asset].size;
        if self.rotation % 180 == 0 {
            [width, depth]
        } else {
            [depth, width]
        }
    }

    fn center(&self, models: &WorkshopCatalog) -> Vec3 {
        let [width, depth] = self.size(models);
        Vec3::new(
            (2 * self.column + width - CELLS) as f32,
            0.,
            (2 * self.row + depth - CELLS) as f32,
        )
    }

    fn fits(&self, models: &WorkshopCatalog) -> bool {
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
        if scene.biome != "flat" {
            return Err("This Asset Garden preview currently supports flat terrain.".into());
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
    past: Vec<Layout>,
    future: Vec<Layout>,
    selected: Option<usize>,
    pending: Option<(Prop, bool)>,
    file: PathBuf,
    status: String,
    redraw: bool,
    target: Vec3,
    bearing: f32,
    zoom: f32,
    grid: bool,
}

impl Garden {
    fn edit(&mut self) {
        if self.past.len() == 100 {
            self.past.remove(0);
        }
        self.past.push(self.layout.clone());
        self.future.clear();
        self.redraw = true;
    }
}

#[derive(Component)]
struct GardenProp {
    id: String,
    model: usize,
}
#[derive(Component)]
struct GardenText;

pub fn run(path: Option<PathBuf>) {
    let models = WorkshopCatalog::default();
    let gallery = Layout::decode(GALLERY, &models).expect("bundled V2 gallery");
    let file = path.unwrap_or_else(|| PathBuf::from("solar-friends-asset-garden.json"));
    let (layout, status) = match std::fs::read_to_string(&file) {
        Ok(json) => match Layout::decode(&json, &models) {
            Ok(layout) => (layout, format!("Opened {}", file.display())),
            Err(error) => (gallery.clone(), error),
        },
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            (gallery.clone(), String::new())
        }
        Err(error) => (gallery.clone(), error.to_string()),
    };
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
    .insert_resource(Garden {
        layout,
        gallery,
        file,
        status,
        past: vec![],
        future: vec![],
        selected: None,
        pending: None,
        redraw: true,
        target: Vec3::ZERO,
        bearing: std::f32::consts::FRAC_PI_4,
        zoom: 1.0,
        grid: false,
    })
    .add_systems(Startup, setup)
    .add_systems(Update, (edit, render).chain());
    crate::village::register_building_models(&mut app);
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
                viewport_height: 170.,
            },
            ..OrthographicProjection::default_3d()
        }),
        camera_transform(Vec3::ZERO, std::f32::consts::FRAC_PI_4),
    ));
    commands.spawn((
        DirectionalLight {
            illuminance: 18_000.,
            ..default()
        },
        Transform::from_xyz(-8., 12., 6.).looking_at(Vec3::ZERO, Vec3::Y),
    ));
    commands.spawn((
        Mesh3d(meshes.add(Plane3d::default().mesh().size(WIDTH, WIDTH))),
        MeshMaterial3d(materials.add(Color::srgb_u8(105, 128, 94))),
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
    window: Single<&Window>,
    mut camera: Single<(&Camera, &GlobalTransform, &mut Transform, &mut Projection)>,
) {
    use KeyCode::*;
    let (camera, global, transform, projection) = &mut *camera;
    let pressed = |key| keys.just_pressed(key);
    let modifier = [ControlLeft, ControlRight, SuperLeft, SuperRight]
        .iter()
        .any(|key| keys.pressed(*key));
    let zoom_in = pressed(Equal) || pressed(NumpadAdd);
    let zoom_out = pressed(Minus) || pressed(NumpadSubtract);
    let zoom_steps = scroll.delta.y + f32::from(zoom_in) - f32::from(zoom_out);
    garden.zoom = (garden.zoom * (-0.09 * zoom_steps).exp()).clamp(0.035, 3.);
    garden.bearing +=
        (i32::from(pressed(KeyE)) - i32::from(pressed(KeyQ))) as f32 * std::f32::consts::FRAC_PI_2;
    if mouse.pressed(MouseButton::Right) {
        let zoom = garden.zoom;
        let right = transform.right().as_vec3();
        let forward = Vec3::Y.cross(right);
        garden.target += (-right * motion.delta.x + forward * motion.delta.y) * zoom * 0.25;
    }
    if pressed(Home) {
        garden.target = Vec3::ZERO;
        garden.zoom = 1.;
    }
    **transform = camera_transform(garden.target, garden.bearing);
    if let Projection::Orthographic(orthographic) = &mut **projection {
        orthographic.scale = garden.zoom;
    }
    if pressed(KeyG) {
        garden.grid = !garden.grid;
    }
    let cell = window
        .cursor_position()
        .and_then(|pixel| camera.viewport_to_world(global, pixel).ok())
        .and_then(|ray| {
            ray.intersect_plane(Vec3::ZERO, InfinitePlane3d::new(Vec3::Y))
                .map(|t| ray.get_point(t))
        })
        .map(|point| {
            (
                ((point.x + WIDTH / 2.) / 2.).floor() as i32,
                ((point.z + WIDTH / 2.) / 2.).floor() as i32,
            )
        });
    if modifier && pressed(KeyS) {
        garden.status = match serde_json::to_vec_pretty(&garden.layout) {
            Ok(json) => {
                let temporary = garden.file.with_extension("garden-tmp");
                match std::fs::write(&temporary, json)
                    .and_then(|()| std::fs::rename(temporary, &garden.file))
                {
                    Ok(()) => format!("Saved {}", garden.file.display()),
                    Err(error) => error.to_string(),
                }
            }
            Err(error) => error.to_string(),
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
            let previous = std::mem::replace(&mut garden.layout, snapshot);
            if redo {
                garden.past.push(previous);
            } else {
                garden.future.push(previous);
            }
            garden.selected = None;
            garden.pending = None;
            garden.redraw = true;
        }
    }
    if pressed(Escape) {
        garden.pending = None;
        return;
    }
    if let Some((mut prop, copy)) = garden.pending.take() {
        if let Some((column, row)) = cell {
            prop.column = column;
            prop.row = row;
        }
        if pressed(KeyR) {
            prop.rotation = (prop.rotation + 90) % 360;
        }
        if (mouse.just_pressed(MouseButton::Left) || pressed(Enter)) && prop.fits(&models) {
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
        garden.layout = garden.gallery.clone();
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
    } else if modifier && pressed(KeyD) && garden.layout.props.len() < 1000 {
        let Some(id) = (1..).map(|i| format!("copy-{i}")).find(|id| {
            garden
                .layout
                .props
                .iter()
                .all(|existing| &existing.id != id)
        }) else {
            return;
        };
        prop.id = id;
        garden.pending = Some((prop, true));
    } else if pressed(KeyR) {
        prop.rotation = (prop.rotation + 90) % 360;
        if prop.fits(&models) {
            garden.edit();
            garden.layout.props[index] = prop;
        }
    }
}

fn render(
    mut commands: Commands,
    mut garden: ResMut<Garden>,
    models: Res<WorkshopCatalog>,
    assets: Res<AssetServer>,
    mut rendered: Query<(Entity, &GardenProp, &mut Transform)>,
    mut text: Single<&mut Text, With<GardenText>>,
    mut gizmos: Gizmos,
) {
    if garden.redraw {
        const MODELS_PER_FRAME: usize = 12;
        let mut displayed: HashMap<_, _> = rendered
            .iter_mut()
            .map(|(entity, marker, transform)| {
                (marker.id.as_str(), (entity, marker.model, transform))
            })
            .collect();
        let mut spawned = 0;
        let mut loading = false;
        for prop in &garden.layout.props {
            let model = models.0[&prop.asset].model;
            let transform = Transform::from_translation(prop.center(&models))
                .with_rotation(Quat::from_rotation_y((prop.rotation as f32).to_radians()));
            if let Some((entity, existing_model, mut existing_transform)) =
                displayed.remove(prop.id.as_str())
            {
                if existing_model == model {
                    existing_transform.set_if_neq(transform);
                    continue;
                }
                commands.entity(entity).despawn();
            }
            if spawned == MODELS_PER_FRAME {
                loading = true;
                continue;
            }
            commands.spawn((
                GardenProp {
                    id: prop.id.clone(),
                    model,
                },
                building_model(&assets, model),
                transform,
            ));
            spawned += 1;
        }
        for (entity, _, _) in displayed.into_values() {
            commands.entity(entity).despawn();
        }
        garden.redraw = loading;
    }
    let selection = garden.selected.map(|index| &garden.layout.props[index]);
    let highlighted = garden.pending.as_ref().map(|(prop, _)| prop).or(selection);
    if let Some(prop) = highlighted {
        let [width, depth] = prop.size(&models);
        gizmos.rect(
            Isometry3d::new(
                prop.center(&models) + Vec3::Y * 0.05,
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
        let radius = WIDTH / 2.;
        for index in 0..=CELLS {
            let a = index as f32 * 2. - radius;
            let color = Color::srgba(0.1, 0.24, 0.13, 0.45);
            gizmos.line(
                Vec3::new(a, 0.02, -radius),
                Vec3::new(a, 0.02, radius),
                color,
            );
            gizmos.line(
                Vec3::new(-radius, 0.02, a),
                Vec3::new(radius, 0.02, a),
                color,
            );
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
    text.0 = format!(
        "Asset Garden  ·  {} props\n{label}\nRight drag pan   Scroll or +/- zoom   Q/E turn   Home whole plot   G grid\nM move   R rotate   Ctrl/Cmd D copy   Delete remove   F5 restore gallery\nClick/Enter confirm   Esc cancel   Ctrl/Cmd Z undo   Shift redo   Ctrl/Cmd S save\n{}",
        garden.layout.props.len(),
        garden.status
    );
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
