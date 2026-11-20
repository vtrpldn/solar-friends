use bevy::{
    input::mouse::{AccumulatedMouseMotion, AccumulatedMouseScroll, MouseScrollUnit},
    prelude::*,
    window::{PrimaryWindow, WindowResolution},
    winit::{UpdateMode, WinitSettings},
};

mod arrival;
mod audio;
mod catalog;
mod construction;
mod economy_reference;
mod equipment;
mod farming;
mod file_dialog;
mod food;
mod gathering;
mod land;
mod livestock;
mod market;
mod navigation;
mod production;
mod resident_animation;
mod residents;
mod river_scenery;
mod save;
mod save_library;
mod setup;
mod stock;
mod terrain;
mod theme;
mod time_advance;
mod town_work;
mod trade;
mod ui_font;
mod utilities;
mod village;
mod weather;
mod wildlife;
mod workshop;
use setup::{WorldSetup, WorldSetupPlugin};

const CAMERA_HOME: Vec3 = Vec3::new(-26.0, 3.0, -12.0);
const CAMERA_HEIGHT: f32 = 40.0;
const CAMERA_MAX_ZOOM_OUT: f32 = 8.0;
const CAMERA_DISTANCE: f32 = 512.0;
const CAMERA_FAR: f32 = CAMERA_DISTANCE + 512.0;
const CAMERA_POLAR_LIMITS: std::ops::RangeInclusive<f32> = 0.25..=std::f32::consts::PI * 0.46;

fn default_camera_polar() -> f32 {
    (32.0_f32.hypot(32.0) / 35.0).atan()
}

/// Launch options: command-line flags natively, or the page's query string on the web,
/// where `?downtime-preview` stands for `--downtime-preview`.
fn launch_args() -> Vec<std::ffi::OsString> {
    #[cfg(target_arch = "wasm32")]
    {
        let query = web_sys::window()
            .and_then(|window| window.location().search().ok())
            .unwrap_or_default();
        query
            .trim_start_matches('?')
            .split('&')
            .filter(|key| !key.is_empty())
            .map(|key| format!("--{key}").into())
            .collect()
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        std::env::args_os().skip(1).collect()
    }
}

fn main() {
    let mut args = launch_args().into_iter();
    let option = args.next();
    if option.as_deref().is_some_and(|flag| flag == "--residents") {
        let pose = args.next();
        workshop::lineup::run(pose.as_deref().and_then(std::ffi::OsStr::to_str));
        return;
    }
    if option
        .as_deref()
        .is_some_and(|flag| flag == "--biome-landscapes")
    {
        let biome = args.next();
        let name = biome
            .as_deref()
            .map(|name| name.to_str().unwrap_or(""))
            .unwrap_or("mata-atlantica");
        if let Err(error) = workshop::garden::run_study(name) {
            eprintln!("{error}");
            std::process::exit(2);
        }
        return;
    }
    if option
        .as_deref()
        .is_some_and(|flag| flag == "--asset-garden")
    {
        let first = args.next();
        let night = first.as_deref().is_some_and(|arg| arg == "--night");
        let path = if night { args.next() } else { first };
        workshop::garden::run(path.map(std::path::PathBuf::from), night);
        return;
    }
    if option.as_deref().is_some_and(|flag| flag == "--collection") {
        let category = args.next();
        let category = category.as_deref().and_then(std::ffi::OsStr::to_str);
        let detail = category == Some("--detail")
            || args
                .next()
                .as_deref()
                .is_some_and(|option| option == "--detail");
        workshop::collection::run(category.filter(|name| *name != "--detail"), detail);
        return;
    }
    if option.as_deref().is_some_and(|flag| flag == "--workshop") {
        let asset = args.next();
        workshop::run(asset.as_deref().and_then(std::ffi::OsStr::to_str));
        return;
    }
    if let Some(flag) = option.as_deref()
        && (flag == "--lab"
            || flag == "--lab-replay"
            || flag == "--lab-replay-ui"
            || flag == "--lab-ui")
    {
        let path = args.next().map(std::path::PathBuf::from);
        let save = args.next().map(std::path::PathBuf::from);
        let result = match (path, save, args.next(), flag.to_str()) {
            (Some(path), save, None, Some("--lab")) => {
                village::lab::run_file(&path, save.as_deref())
            }
            (Some(path), None, None, Some("--lab-replay")) => village::lab::replay_file(&path),
            (Some(path), None, None, Some("--lab-replay-ui")) => village::lab::replay_ui(&path),
            (Some(path), save, None, Some("--lab-ui")) => {
                village::lab::run_ui(Some(&path), save.as_deref())
            }
            (None, None, None, Some("--lab-ui")) => village::lab::run_ui(None, None),
            _ => Err(std::io::Error::other(
                "Usage: solar-friends-v3 --lab scenario.json [village.json], --lab-ui [scenario.json [village.json]], or --lab-replay or --lab-replay-ui report.json",
            )),
        };
        if let Err(error) = result {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }
    let mut app = App::new();
    let downtime_preview = option
        .as_deref()
        .is_some_and(|flag| flag == "--downtime-preview");
    if downtime_preview {
        if args.next().is_some() {
            eprintln!("Usage: solar-friends-v3 --downtime-preview");
            std::process::exit(2);
        }
        if let Err(error) = village::start_downtime_preview(&mut app) {
            eprintln!("{error}");
            std::process::exit(1);
        }
    } else if option.as_deref().is_some_and(|flag| flag == "--play") {
        let mut setup = WorldSetup::default();
        match args.next().as_deref() {
            None => {}
            Some(mode) if mode == "--sandbox" => setup.mode = setup::Mode::Sandbox,
            Some(_) => {
                eprintln!("Usage: solar-friends-v3 --play [--sandbox]");
                std::process::exit(2);
            }
        }
        app.insert_resource(setup.session());
    }
    app.insert_resource(WinitSettings {
        unfocused_mode: UpdateMode::reactive_low_power(std::time::Duration::from_secs_f64(
            village::SIMULATION_STEP,
        )),
        ..WinitSettings::game()
    })
    .add_plugins(
        DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                title: if downtime_preview {
                    "Solar Friends V3 · Downtime preview"
                } else {
                    "Solar Friends V3"
                }
                .into(),
                resolution: WindowResolution::new(1280, 800),
                // On the web, draw into the page's canvas and follow its size.
                canvas: cfg!(target_arch = "wasm32").then(|| "#solar-friends".into()),
                fit_canvas_to_parent: true,
                ..default()
            }),
            ..default()
        }),
    )
    .add_plugins((
        WorldSetupPlugin,
        workshop::navigation::ArtToolsPlugin,
        village::VillagePlugin,
        ui_font::UiFontPlugin,
        audio::VillageAudio,
        land::LandPlugin,
        weather::WeatherPlugin,
        resident_animation::ResidentAnimationPlugin,
        wildlife::WildlifePlugin,
    ))
    .add_systems(Startup, setup_scene)
    .add_systems(
        PostUpdate,
        (update_land, animate_river)
            .chain()
            .after(land::advance_landscape_motion),
    )
    .run();
}

#[derive(Component)]
struct VillageCamera {
    target: Vec3,
    heading: f32,
    polar: f32,
}

fn camera_transform(target: Vec3, heading: f32, polar: f32) -> Transform {
    let radius = CAMERA_DISTANCE;
    let horizontal = radius * polar.sin() * std::f32::consts::FRAC_1_SQRT_2;
    let offset =
        Quat::from_rotation_y(heading) * Vec3::new(horizontal, radius * polar.cos(), horizontal);
    Transform::from_translation(target + offset).looking_at(target, Vec3::Y)
}

fn setup_scene(mut commands: Commands) {
    commands.spawn((
        Camera3d::default(),
        Projection::Orthographic(OrthographicProjection {
            scaling_mode: bevy::camera::ScalingMode::FixedVertical {
                viewport_height: CAMERA_HEIGHT,
            },
            far: CAMERA_FAR,
            ..OrthographicProjection::default_3d()
        }),
        DistanceFog {
            color: Color::srgb_u8(203, 213, 172),
            falloff: FogFalloff::Linear {
                start: CAMERA_DISTANCE + 70.0,
                end: CAMERA_DISTANCE + 220.0,
            },
            ..default()
        },
        VillageCamera {
            target: CAMERA_HOME,
            heading: 0.0,
            polar: default_camera_polar(),
        },
        camera_transform(CAMERA_HOME, 0.0, default_camera_polar()),
    ));
    commands.spawn((
        DirectionalLight {
            illuminance: 15_000.0,
            shadows_enabled: true,
            ..default()
        },
        bevy::light::CascadeShadowConfigBuilder {
            num_cascades: 3,
            minimum_distance: CAMERA_DISTANCE - 384.0,
            first_cascade_far_bound: CAMERA_DISTANCE - 80.0,
            maximum_distance: CAMERA_DISTANCE + 384.0,
            ..default()
        }
        .build(),
        Transform::from_xyz(-40.0, 65.0, 27.0).looking_at(Vec3::ZERO, Vec3::Y),
    ));
}

#[derive(Component)]
struct LandMesh;

#[derive(Component)]
struct GroundMesh;

#[derive(Component)]
struct RiverMesh([terrain::RiverBoulder; terrain::RIVER_BOULDER_COUNT]);

type LandDrawKey = (WorldSetup, Option<IVec2>, (u64, u64, usize));

fn update_land(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    setup: Res<WorldSetup>,
    old_land: Query<Entity, With<LandMesh>>,
    village: Res<village::Village>,
    mut drawn: Local<Option<LandDrawKey>>,
) {
    let camp = if setup.open { None } else { village.camp };
    let key = (setup.session(), camp, village.terrain_key());
    if drawn.as_ref() == Some(&key) {
        return;
    }
    *drawn = Some(key);
    for entity in &old_land {
        commands.entity(entity).despawn();
    }
    let terrain = village.terrain(&setup);
    commands.spawn((
        LandMesh,
        GroundMesh,
        Mesh3d(meshes.add(terrain.ground_mesh())),
        MeshMaterial3d(materials.add(setup.ground_color())),
    ));
    commands.spawn((
        LandMesh,
        Mesh3d(meshes.add(terrain.road_mesh())),
        MeshMaterial3d(materials.add(Color::srgb_u8(159, 120, 82))),
    ));
    for (width, height, color) in [
        (1.9, 0.025, Color::srgb_u8(130, 144, 106)),
        (1.1, 0.035, Color::srgb_u8(182, 167, 128)),
        (0.3, 0.045, Color::srgb_u8(159, 174, 145)),
    ] {
        commands.spawn((
            LandMesh,
            Mesh3d(meshes.add(terrain.river_bank_mesh(width, height))),
            MeshMaterial3d(materials.add(color)),
        ));
    }
    let rocks = terrain.river_boulders();
    let rock_mesh = meshes.add(Sphere::new(1.0).mesh().ico(0).expect("icosahedron"));
    let rock_materials = [
        Color::srgb_u8(151, 155, 134),
        Color::srgb_u8(176, 174, 148),
        Color::srgb_u8(125, 139, 126),
    ]
    .map(|color| materials.add(color));
    for rock in &rocks {
        commands.spawn((
            LandMesh,
            Mesh3d(rock_mesh.clone()),
            MeshMaterial3d(rock_materials[rock.palette].clone()),
            Transform::from_xyz(rock.center.x, rock.radius * 0.3, rock.center.y)
                .with_scale(Vec3::new(1.15, 0.65, 0.85) * rock.radius)
                .with_rotation(Quat::from_euler(EulerRot::XYZ, 0.0, rock.yaw, 0.1)),
        ));
    }
    river_scenery::spawn_banks(
        &mut commands,
        &mut meshes,
        &mut materials,
        &terrain,
        setup.biome() == 2,
        rock_mesh,
        &rock_materials,
    );
    commands.spawn((
        LandMesh,
        RiverMesh(rocks),
        Mesh3d(meshes.add(terrain.river_mesh())),
        MeshMaterial3d(materials.add(StandardMaterial {
            perceptual_roughness: 0.35,
            ..default()
        })),
    ));
}

fn animate_river(
    setup: Res<WorldSetup>,
    motion: Res<land::LandscapeMotion>,
    river: Query<(&Mesh3d, &RiverMesh)>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut previous: Local<Option<(AssetId<Mesh>, u64)>>,
) {
    let Ok((river, rocks)) = river.single() else {
        return;
    };
    let frame = (motion.seconds * 12.0).floor() as u64;
    let key = (river.0.id(), frame);
    if *previous != Some(key)
        && let Some(mesh) = meshes.get_mut(&river.0)
        && let Some(bevy::mesh::VertexAttributeValues::Float32x3(positions)) =
            mesh.attribute(Mesh::ATTRIBUTE_POSITION)
    {
        let colors = terrain::river_colors(frame as f64 / 12.0, setup.seed(), positions, &rocks.0);
        mesh.insert_attribute(Mesh::ATTRIBUTE_COLOR, colors);
        *previous = Some(key);
    }
}

fn pointer_over_ui(ui: &Query<&Interaction>) -> bool {
    ui.iter()
        .any(|interaction| *interaction != Interaction::None)
}

fn camera_controls(
    keyboard: Res<ButtonInput<KeyCode>>,
    (mouse, ui): (Res<ButtonInput<MouseButton>>, Query<&Interaction>),
    (motion, scroll, mut drag_button): (
        Res<AccumulatedMouseMotion>,
        Res<AccumulatedMouseScroll>,
        Local<Option<MouseButton>>,
    ),
    window: Single<&Window, With<PrimaryWindow>>,
    time: Res<Time>,
    (setup, village, saves, sound): (
        Res<WorldSetup>,
        Res<village::Village>,
        Res<save_library::SaveMenu>,
        Res<audio::SoundSettings>,
    ),
    mut camera: Single<(&mut Projection, &mut VillageCamera)>,
) {
    if setup.open
        || saves.open
        || sound.open
        || village.map_input_blocked()
        || village.advance_open()
        || village.trade_open()
        || !window.focused
    {
        *drag_button = None;
        return;
    }
    let (projection, view) = &mut *camera;
    let Projection::Orthographic(ortho) = &mut **projection else {
        return;
    };
    let keyboard_navigation = !keyboard.any_pressed([
        KeyCode::ControlLeft,
        KeyCode::ControlRight,
        KeyCode::SuperLeft,
        KeyCode::SuperRight,
        KeyCode::AltLeft,
        KeyCode::AltRight,
    ]);
    let shift = keyboard.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]);
    if keyboard_navigation && keyboard.just_pressed(KeyCode::Home) {
        let action = if shift {
            CameraAction::Reset
        } else {
            CameraAction::Camp
        };
        apply_camera_action(action, &village, &setup, view, ortho);
    }
    if keyboard_navigation && keyboard.just_pressed(KeyCode::End) {
        let action = if shift {
            CameraAction::Overview
        } else {
            CameraAction::River
        };
        apply_camera_action(action, &village, &setup, view, ortho);
    }
    let axis = |positive: &[KeyCode], negative: &[KeyCode]| {
        if keyboard_navigation {
            i32::from(keyboard.any_pressed(positive.iter().copied())) as f32
                - i32::from(keyboard.any_pressed(negative.iter().copied())) as f32
        } else {
            0.0
        }
    };
    let delta = time.delta_secs();
    let pan_x = axis(
        &[KeyCode::KeyD, KeyCode::ArrowRight],
        &[KeyCode::KeyA, KeyCode::ArrowLeft],
    );
    let pan_z = axis(
        &[KeyCode::KeyS, KeyCode::ArrowDown],
        &[KeyCode::KeyW, KeyCode::ArrowUp],
    );
    let turn = axis(&[KeyCode::KeyE], &[KeyCode::KeyQ]);
    let pan = Vec3::new(pan_x, 0.0, pan_z).normalize_or_zero();
    let dash = if shift { 2.2 } else { 1.0 };
    let heading = view.heading + std::f32::consts::FRAC_PI_4;
    let orientation = Quat::from_rotation_y(heading);
    view.target += orientation * pan * (24.0 * dash * ortho.scale.sqrt() * delta);
    let over_ui = pointer_over_ui(&ui);
    if drag_button.is_some_and(|button| !mouse.pressed(button)) {
        *drag_button = None;
    }
    let left_pan = !village.planning_roads() && !village.editing_terrain();
    if drag_button.is_none() && !over_ui {
        *drag_button = [MouseButton::Left, MouseButton::Right, MouseButton::Middle]
            .into_iter()
            .find(|&button| {
                mouse.just_pressed(button) && (button != MouseButton::Left || left_pan)
            });
    }
    if *drag_button == Some(MouseButton::Left) && left_pan {
        let distance_per_pixel = CAMERA_HEIGHT * ortho.scale / window.height().max(1.0);
        let drag = Vec3::new(-motion.delta.x, 0.0, -motion.delta.y);
        view.target += orientation * drag * distance_per_pixel;
    }
    view.heading += turn * delta * 1.2;
    if *drag_button == Some(MouseButton::Right) {
        let orbit = motion.delta / window.height().max(1.0) * std::f32::consts::TAU;
        view.heading -= orbit.x;
        view.polar =
            (view.polar - orbit.y).clamp(*CAMERA_POLAR_LIMITS.start(), *CAMERA_POLAR_LIMITS.end());
    }
    view.heading = view.heading.rem_euclid(std::f32::consts::TAU);
    view.target.x = view.target.x.clamp(-124.0, 124.0);
    view.target.z = view.target.z.clamp(-124.0, 124.0);

    let zoom = axis(
        &[KeyCode::Minus, KeyCode::NumpadSubtract],
        &[KeyCode::Equal, KeyCode::NumpadAdd],
    );
    let wheel_factor = match scroll.unit {
        MouseScrollUnit::Line => 0.12,
        MouseScrollUnit::Pixel => 0.002,
    };
    let wheel = if over_ui {
        0.0
    } else {
        scroll.delta.y * wheel_factor
    };
    let dolly = if *drag_button == Some(MouseButton::Middle) {
        motion.delta.y / window.height().max(1.0) * 4.0
    } else {
        0.0
    };
    let change = zoom * delta * 1.3 - wheel + dolly;
    ortho.scale = (ortho.scale * change.exp()).clamp(1.0 / 6.0, CAMERA_MAX_ZOOM_OUT);
}

fn sync_camera_view(
    setup: Res<WorldSetup>,
    mut village: ResMut<village::Village>,
    camera: Single<(&VillageCamera, &Projection, &mut Transform)>,
) {
    if setup.open {
        return;
    }
    let (view, projection, mut transform) = camera.into_inner();
    let Projection::Orthographic(ortho) = projection else {
        return;
    };
    transform.set_if_neq(camera_transform(view.target, view.heading, view.polar));
    let saved = village::CameraView {
        target: view.target,
        heading: view.heading,
        polar: view.polar,
        zoom: ortho.scale,
    };
    if village.camera_view != Some(saved) {
        village.camera_view = Some(saved);
    }
}

#[derive(Clone, Copy)]
enum CameraAction {
    Camp,
    Reset,
    River,
    Overview,
    Turn(bool),
    Zoom(bool),
}

fn apply_camera_action(
    action: CameraAction,
    village: &village::Village,
    setup: &WorldSetup,
    camera: &mut VillageCamera,
    projection: &mut OrthographicProjection,
) {
    match action {
        CameraAction::Camp if let Some(camp) = village.camp_focus(setup) => {
            camera.target = camp;
        }
        CameraAction::Camp | CameraAction::Reset => {
            camera.target = CAMERA_HOME;
            camera.heading = 0.0;
            camera.polar = default_camera_polar();
            projection.scale = 1.0;
        }
        CameraAction::River => {
            let terrain = village.terrain(setup);
            let (center, width) = terrain.river(0.0);
            let x = if terrain.seed == 0 {
                -20.0
            } else {
                ((center + width + 3.0) / 2.0).ceil() as f32 * 2.0
            };
            camera.target = Vec3::new(x, terrain.height_at(x, 0.0), 0.0);
        }
        CameraAction::Overview => {
            camera.target = Vec3::ZERO;
            camera.heading = std::f32::consts::TAU - std::f32::consts::FRAC_PI_4;
            camera.polar = *CAMERA_POLAR_LIMITS.start();
            projection.scale = CAMERA_MAX_ZOOM_OUT;
        }
        CameraAction::Turn(right) => {
            let quarter = std::f32::consts::FRAC_PI_2;
            camera.heading += if right { quarter } else { -quarter };
        }
        CameraAction::Zoom(closer) => {
            let scale = if closer {
                projection.scale / 1.2
            } else {
                projection.scale * 1.2
            };
            projection.scale = scale.clamp(1.0 / 6.0, CAMERA_MAX_ZOOM_OUT);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bevy::{asset::AssetPlugin, gizmos::GizmoPlugin, transform::TransformPlugin};

    fn press_button(app: &mut App, label: &str) {
        interact_with_button(app, label, Interaction::Pressed);
    }

    fn visible_button(app: &mut App, label: &str) -> Option<Entity> {
        let world = app.world_mut();
        world
            .query_filtered::<(Entity, &Children), With<Button>>()
            .iter(world)
            .find_map(|(entity, children)| {
                // Labels may sit a level down, as in the top bar's stat cards.
                let matches = |entity: Entity| {
                    // A card's first line names it, as on the resident roster.
                    world
                        .get::<Text>(entity)
                        .is_some_and(|text| text.0 == label || text.0.lines().next() == Some(label))
                };
                if !children.iter().any(|child| {
                    matches(child)
                        || world
                            .get::<Children>(child)
                            .is_some_and(|inner| inner.iter().any(matches))
                }) {
                    return None;
                }
                let mut ancestor = Some(entity);
                while let Some(current) = ancestor {
                    if world
                        .get::<Node>(current)
                        .is_some_and(|node| node.display == Display::None)
                    {
                        return None;
                    }
                    ancestor = world.get::<ChildOf>(current).map(ChildOf::parent);
                }
                Some(entity)
            })
    }

    fn interact_with_button(app: &mut App, label: &str, input: Interaction) {
        // Setup, saved villages, sound and camera tools live in the View & options menu.
        if visible_button(app, label).is_none() && visible_button(app, "View & options").is_some() {
            interact_with_button(app, "View & options", Interaction::Pressed);
        }
        let Some(button) = visible_button(app, label) else {
            let world = app.world_mut();
            let mut labels = Vec::new();
            for (entity, children) in world
                .query_filtered::<(Entity, &Children), With<Button>>()
                .iter(world)
            {
                let shown = world
                    .get::<Node>(entity)
                    .is_some_and(|n| n.display != Display::None);
                for child in children.iter() {
                    if let Some(text) = world.get::<Text>(child)
                        && shown
                    {
                        labels.push(text.0.clone());
                    }
                }
            }
            panic!("missing visible button: {label}; shown: {labels:?}");
        };
        let world = app.world_mut();
        *world
            .get_mut::<Interaction>(button)
            .expect("button interaction") = input;
        world.run_schedule(Update);
        *app.world_mut()
            .get_mut::<Interaction>(button)
            .expect("button interaction") = Interaction::None;
    }

    fn river_vertex_colors(app: &mut App) -> Vec<[f32; 4]> {
        use bevy::mesh::VertexAttributeValues;

        let world = app.world_mut();
        let (mesh, river) = world
            .query::<(&Mesh3d, &RiverMesh)>()
            .single(world)
            .expect("one river");
        assert_eq!(river.0.len(), 8);
        let meshes = world.resource::<Assets<Mesh>>();
        let mesh = meshes.get(&mesh.0).expect("river mesh");
        let Some(VertexAttributeValues::Float32x4(colors)) = mesh.attribute(Mesh::ATTRIBUTE_COLOR)
        else {
            panic!("the river update must color the rendered mesh");
        };
        assert_eq!(colors.len(), mesh.count_vertices());
        colors.clone()
    }

    fn simulate_river_frame(app: &mut App) {
        let world = app.world_mut();
        world
            .resource_mut::<Time<Fixed>>()
            .advance_by(std::time::Duration::from_millis(100));
        world
            .resource_mut::<Time<Real>>()
            .advance_by(std::time::Duration::from_millis(100));
        world.run_schedule(FixedUpdate);
        world.run_schedule(PostUpdate);
    }

    #[test]
    fn whole_plot_camera_frames_the_terrain_in_a_square_viewport() {
        let mut view = VillageCamera {
            target: CAMERA_HOME,
            heading: 0.0,
            polar: default_camera_polar(),
        };
        let mut projection = OrthographicProjection::default_3d();
        apply_camera_action(
            CameraAction::Overview,
            &village::Village::default(),
            &WorldSetup::default(),
            &mut view,
            &mut projection,
        );
        let camera = camera_transform(view.target, view.heading, view.polar);
        let half_view = CAMERA_HEIGHT * projection.scale * 0.5;
        for x in [-128.0, 128.0] {
            for z in [-128.0, 128.0] {
                let point =
                    camera.rotation.inverse() * (Vec3::new(x, 12.0, z) - camera.translation);
                assert!(point.x.abs() < half_view && point.y.abs() < half_view);
            }
        }
    }

    #[test]
    fn shallow_orthographic_views_keep_the_plot_inside_the_clip_planes() {
        let polar = *CAMERA_POLAR_LIMITS.end();
        let heading = 0.0;
        for target in [Vec3::new(-124.0, 0.0, -124.0), Vec3::new(124.0, 0.0, 124.0)] {
            let camera = camera_transform(target, heading, polar);
            for x in [-128.0, 128.0] {
                for z in [-128.0, 128.0] {
                    for height in [-32.0, 32.0] {
                        let depth =
                            (Vec3::new(x, height, z) - camera.translation).dot(*camera.forward());
                        assert!((0.0..CAMERA_FAR).contains(&depth), "terrain depth {depth}");
                    }
                }
            }
        }
    }

    #[test]
    fn bevy_update_enters_a_village_and_places_a_camp() {
        let mut app = App::new();
        app.add_plugins((
            MinimalPlugins,
            TransformPlugin,
            AssetPlugin::default(),
            WindowPlugin::default(),
            GizmoPlugin,
        ))
        .init_asset::<Mesh>()
        .init_asset::<Image>()
        .init_asset::<StandardMaterial>()
        .init_asset::<Scene>()
        .init_asset::<Font>()
        .init_resource::<ClearColor>()
        .init_resource::<GlobalAmbientLight>()
        .add_message::<bevy::input::keyboard::KeyboardInput>()
        .init_resource::<ButtonInput<KeyCode>>()
        .init_resource::<ButtonInput<MouseButton>>()
        .init_resource::<AccumulatedMouseMotion>()
        .init_resource::<AccumulatedMouseScroll>()
        .add_plugins((
            WorldSetupPlugin,
            village::VillagePlugin,
            ui_font::UiFontPlugin,
            land::LandPlugin,
            weather::WeatherPlugin,
            wildlife::WildlifePlugin,
        ))
        .add_systems(Startup, setup_scene)
        .add_systems(
            PostUpdate,
            (update_land, animate_river)
                .chain()
                .after(land::advance_landscape_motion),
        );
        app.finish();
        app.cleanup();
        let save_dir =
            std::env::temp_dir().join(format!("solar-v3-ui-save-{}", std::process::id()));
        std::fs::create_dir_all(&save_dir).unwrap();
        let existing_autosave = save_dir.join("continue.json");
        std::fs::write(&existing_autosave, b"existing autosave").unwrap();
        app.world_mut()
            .resource_mut::<save_library::SaveMenu>()
            .test_directory = Some(save_dir.clone());
        app.update();

        assert!(
            app.world_mut()
                .query::<&Text>()
                .iter(app.world())
                .any(|text| text.0 == "Solar\nFriends")
        );
        press_button(&mut app, "Continue Story");
        assert!(app.world().resource::<WorldSetup>().open);
        assert!(
            app.world_mut()
                .query::<&Text>()
                .iter(app.world())
                .any(|text| {
                    text.0
                        .contains("The autosave was preserved. Open Saved villages")
                })
        );
        press_button(&mut app, "Saved villages");
        press_button(&mut app, "Close saved villages");
        press_button(&mut app, "Sound settings");
        assert!(app.world().resource::<audio::SoundSettings>().open);
        app.world_mut().run_schedule(Update);
        press_button(&mut app, "Close sound settings");
        assert!(!app.world().resource::<audio::SoundSettings>().open);

        press_button(&mut app, "New sandbox");
        assert!(
            app.world_mut()
                .query::<&Text>()
                .iter(app.world())
                .any(|text| text.0 == "Choose the land")
        );
        assert!(app.world().resource::<WorldSetup>().mode == setup::Mode::Sandbox);
        let sandbox_seed = app.world().resource::<WorldSetup>().seed();
        assert_ne!(sandbox_seed, 42);
        assert_ne!(sandbox_seed, 0);
        let disabled_world_options = |app: &mut App| {
            let world = app.world_mut();
            world
                .query_filtered::<&setup::Action, With<bevy::ui::InteractionDisabled>>()
                .iter(world)
                .filter(|action| matches!(action, setup::Action::Savings | setup::Action::Supplies))
                .count()
        };
        assert_eq!(disabled_world_options(&mut app), 2);
        press_button(&mut app, "Back to main menu");
        press_button(&mut app, "New game");
        assert!(app.world().resource::<WorldSetup>().mode == setup::Mode::Story);
        assert_eq!(disabled_world_options(&mut app), 0);
        let story_seed = app.world().resource::<WorldSetup>().seed();
        assert_ne!(story_seed, sandbox_seed);
        assert_ne!(story_seed, 0);
        press_button(&mut app, "Town   ·   Drive");
        assert!(
            app.world_mut()
                .query::<&Text>()
                .iter(app.world())
                .any(|text| text.0.contains("36 km") && text.0.contains("66 game minutes"))
        );
        press_button(&mut app, "Town   ·   Remote");
        press_button(&mut app, "Town   ·   Nearby");

        press_button(&mut app, &format!("Land seed   ·   {story_seed}"));
        press_button(&mut app, "Start new village");
        assert!(app.world().resource::<WorldSetup>().open);
        for key in [KeyCode::Digit4, KeyCode::Digit2] {
            app.world_mut()
                .resource_mut::<ButtonInput<KeyCode>>()
                .press(key);
            app.world_mut().run_schedule(Update);
            app.world_mut()
                .resource_mut::<ButtonInput<KeyCode>>()
                .reset(key);
        }
        press_button(&mut app, "Start new village");
        press_button(&mut app, "Keep current village");
        assert_eq!(
            std::fs::read(&existing_autosave).unwrap(),
            b"existing autosave"
        );
        press_button(&mut app, "Start new village");
        press_button(&mut app, "Confirm new village");
        std::fs::remove_file(&existing_autosave).unwrap();
        assert_eq!(app.world().resource::<WorldSetup>().seed(), 42);
        app.update();
        assert!(app.world().resource::<village::Village>().camp.is_none());
        for _ in 0..180 {
            app.world_mut()
                .resource_mut::<Time>()
                .advance_by(std::time::Duration::from_millis(100));
            app.world_mut().run_schedule(Update);
        }
        interact_with_button(&mut app, "Camp in clearing", Interaction::Hovered);
        assert!(
            app.world_mut()
                .query::<&Text>()
                .iter(app.world())
                .any(|text| text.0.contains("Dry, roomy ground"))
        );
        press_button(&mut app, "Camp in clearing");
        for (key, heading) in [
            (KeyCode::KeyM, "Shared savings"),
            (KeyCode::KeyJ, "Projects ·"),
            (KeyCode::KeyI, "Resources · Stores"),
            (KeyCode::KeyU, "DRINKING WATER"),
        ] {
            app.world_mut()
                .resource_mut::<ButtonInput<KeyCode>>()
                .press(key);
            app.world_mut().run_schedule(Update);
            app.world_mut()
                .resource_mut::<ButtonInput<KeyCode>>()
                .reset(key);
            assert!(
                app.world_mut()
                    .query::<&Text>()
                    .iter(app.world())
                    .any(|text| text.0.contains(heading))
            );
            app.world_mut()
                .resource_mut::<ButtonInput<KeyCode>>()
                .press(KeyCode::Escape);
            app.world_mut().run_schedule(Update);
            app.world_mut()
                .resource_mut::<ButtonInput<KeyCode>>()
                .reset(KeyCode::Escape);
            assert!(!app.world().resource::<WorldSetup>().open);
        }
        assert_eq!(
            app.world().resource::<village::Village>().camp,
            Some(IVec2::new(36, 36))
        );
        let requested_target = Vec3::new(14.0, 2.0, 5.0);
        let world = app.world_mut();
        let mut camera = world.query::<(&mut VillageCamera, &mut Projection)>();
        let (mut view, mut projection) = camera.single_mut(world).unwrap();
        let previous_target = view.target;
        let previous_heading = view.heading;
        view.target = requested_target;
        view.heading = 0.75;
        let Projection::Orthographic(ortho) = &mut *projection else {
            panic!("expected orthographic camera")
        };
        let previous_zoom = ortho.scale;
        ortho.scale = 1.5;
        world.run_schedule(PostUpdate);
        let mut camera = world.query_filtered::<&Transform, With<VillageCamera>>();
        assert_eq!(
            *camera.single(world).unwrap(),
            camera_transform(requested_target, 0.75, default_camera_polar())
        );
        let saved = world.resource::<village::Village>().camera_view.unwrap();
        assert_eq!(saved.target, requested_target);
        assert_eq!(saved.heading, 0.75);
        assert_eq!(saved.zoom, 1.5);
        let mut keys = world.resource_mut::<ButtonInput<KeyCode>>();
        keys.press(KeyCode::SuperLeft);
        keys.press(KeyCode::Home);
        world.run_schedule(Update);
        world.run_schedule(PostUpdate);
        assert_eq!(
            world
                .resource::<village::Village>()
                .camera_view
                .unwrap()
                .target,
            requested_target
        );
        world.resource_mut::<ButtonInput<KeyCode>>().reset_all();

        let mut camera = world.query::<(&mut VillageCamera, &mut Projection)>();
        let (mut view, mut projection) = camera.single_mut(world).unwrap();
        view.target = previous_target;
        view.heading = previous_heading;
        if let Projection::Orthographic(ortho) = &mut *projection {
            ortho.scale = previous_zoom;
        }
        app.world_mut().run_schedule(PostUpdate);
        app.world_mut()
            .resource_mut::<Time>()
            .advance_by(std::time::Duration::from_secs(24));
        app.world_mut().run_schedule(PostUpdate);
        let world = app.world_mut();
        let visitors = world
            .query::<&Name>()
            .iter(world)
            .filter(|name| name.as_str() == "Wildlife visitor")
            .count();
        assert!((1..=4).contains(&visitors));

        app.world_mut()
            .resource_mut::<ButtonInput<KeyCode>>()
            .reset_all();
        press_button(&mut app, "Build");
        press_button(&mut app, "Auto-buy on");
        press_button(&mut app, "Auto-buy off");
        press_button(&mut app, "Find something to build…");
        let build_window = app
            .world_mut()
            .query_filtered::<Entity, With<PrimaryWindow>>()
            .single(app.world())
            .unwrap();
        for (text, expected) in [
            ("milk", "Search milk| · 1 building"),
            ("xyz", "Search milkxyz| · 0 buildings"),
        ] {
            app.world_mut()
                .write_message(bevy::input::keyboard::KeyboardInput {
                    key_code: KeyCode::KeyM,
                    logical_key: bevy::input::keyboard::Key::Character(text.into()),
                    state: bevy::input::ButtonState::Pressed,
                    text: Some(text.into()),
                    repeat: false,
                    window: build_window,
                });
            app.world_mut().run_schedule(Update);
            assert!(
                app.world_mut()
                    .query::<&Text>()
                    .iter(app.world())
                    .any(|label| label.0 == expected)
            );
        }
        press_button(&mut app, "Homes & shelter");
        press_button(&mut app, "Close catalog");

        press_button(&mut app, "Pause");
        assert!(app.world().resource::<village::Village>().is_paused());
        let paused_water = river_vertex_colors(&mut app);
        simulate_river_frame(&mut app);
        assert_eq!(river_vertex_colors(&mut app), paused_water);

        press_button(&mut app, "Resume");
        assert!(!app.world().resource::<village::Village>().is_paused());
        simulate_river_frame(&mut app);
        assert_ne!(river_vertex_colors(&mut app), paused_water);

        press_button(&mut app, "1×");
        press_button(&mut app, "4×");
        press_button(&mut app, "8×");
        press_button(&mut app, "16×");
        press_button(&mut app, "1×");

        press_button(&mut app, "View & options");
        press_button(&mut app, "Keyboard & camera");
        assert!(
            app.world()
                .resource::<village::Village>()
                .map_input_blocked()
        );
        let world = app.world_mut();
        assert!(
            world
                .query::<&Text>()
                .iter(world)
                .any(|text| text.0.contains("Village guide · Keyboard & camera"))
        );
        app.world_mut()
            .resource_mut::<ButtonInput<KeyCode>>()
            .press(KeyCode::Escape);
        app.world_mut().run_schedule(Update);
        app.world_mut()
            .resource_mut::<ButtonInput<KeyCode>>()
            .reset(KeyCode::Escape);
        assert!(!app.world().resource::<WorldSetup>().open);
        assert!(
            !app.world()
                .resource::<village::Village>()
                .map_input_blocked()
        );

        app.world_mut()
            .resource_mut::<ButtonInput<KeyCode>>()
            .press(KeyCode::KeyT);
        app.world_mut().run_schedule(Update);
        app.world_mut()
            .resource_mut::<ButtonInput<KeyCode>>()
            .reset(KeyCode::KeyT);
        interact_with_button(&mut app, "Undo terrain edit", Interaction::Hovered);
        let world = app.world_mut();
        assert!(world.query::<&Text>().iter(world).any(|text| {
            text.0
                .contains("There are no terrain edits to undo in this session.")
        }));
        app.world_mut()
            .resource_mut::<ButtonInput<KeyCode>>()
            .press(KeyCode::Escape);
        app.world_mut().run_schedule(Update);
        app.world_mut()
            .resource_mut::<ButtonInput<KeyCode>>()
            .reset(KeyCode::Escape);
        assert!(!app.world().resource::<WorldSetup>().open);
        assert!(!app.world().resource::<village::Village>().editing_terrain());

        press_button(&mut app, "Guide");
        let reading_time = app.world().resource::<village::Village>().seconds();
        assert!(app.world().resource::<village::Village>().is_paused());
        simulate_river_frame(&mut app);
        assert_eq!(
            app.world().resource::<village::Village>().seconds(),
            reading_time
        );
        assert!(
            app.world()
                .resource::<village::Village>()
                .map_input_blocked()
        );
        press_button(&mut app, "Reference");
        press_button(&mut app, "Growing autonomy");
        press_button(&mut app, "Show diagram");
        press_button(&mut app, "Chapter text");
        press_button(&mut app, "Chapter index");
        press_button(&mut app, "Close guide");
        assert!(!app.world().resource::<village::Village>().is_paused());
        simulate_river_frame(&mut app);
        assert!(app.world().resource::<village::Village>().seconds() > reading_time);
        assert!(
            !app.world()
                .resource::<village::Village>()
                .map_input_blocked()
        );

        press_button(&mut app, "View & options");
        press_button(&mut app, "Focus river");
        let camera = app
            .world_mut()
            .query::<&VillageCamera>()
            .single(app.world())
            .unwrap();
        assert_eq!(camera.target.z, 0.0);
        press_button(&mut app, "Rotate right");
        let camera = app
            .world_mut()
            .query::<&VillageCamera>()
            .single(app.world())
            .unwrap();
        assert_eq!(camera.heading, std::f32::consts::FRAC_PI_2);
        let world = app.world_mut();
        let overlay = world.spawn(Interaction::Hovered).id();
        world
            .resource_mut::<ButtonInput<MouseButton>>()
            .press(MouseButton::Right);
        world.resource_mut::<AccumulatedMouseMotion>().delta = Vec2::new(0.0, 30.0);
        world.run_schedule(Update);
        world.despawn(overlay);
        world
            .resource_mut::<ButtonInput<MouseButton>>()
            .clear_just_pressed(MouseButton::Right);
        world.run_schedule(Update);
        world.run_schedule(PostUpdate);
        assert_eq!(
            world
                .resource::<village::Village>()
                .camera_view
                .unwrap()
                .polar,
            default_camera_polar()
        );
        world.resource_mut::<ButtonInput<MouseButton>>().reset_all();
        world
            .resource_mut::<ButtonInput<MouseButton>>()
            .press(MouseButton::Right);
        world.resource_mut::<AccumulatedMouseMotion>().delta = Vec2::new(0.0, 30.0);
        world.run_schedule(Update);
        world.run_schedule(PostUpdate);
        let tilted = world.resource::<village::Village>().camera_view.unwrap();
        assert!(tilted.polar < default_camera_polar());
        assert!(CAMERA_POLAR_LIMITS.contains(&tilted.polar));
        world.resource_mut::<ButtonInput<MouseButton>>().reset_all();
        world
            .resource_mut::<ButtonInput<MouseButton>>()
            .press(MouseButton::Middle);
        world.resource_mut::<AccumulatedMouseMotion>().delta = Vec2::new(0.0, -40.0);
        world.run_schedule(Update);
        world.run_schedule(PostUpdate);
        let zoomed = world.resource::<village::Village>().camera_view.unwrap();
        assert!(zoomed.zoom < tilted.zoom);
        assert_eq!(zoomed.polar, tilted.polar);
        let restored: village::CameraView =
            serde_json::from_slice(&serde_json::to_vec(&zoomed).unwrap()).unwrap();
        assert_eq!(restored.polar, zoomed.polar);
        let older: village::CameraView =
            serde_json::from_str(r#"{"target":[0,0,0],"heading":1.0,"zoom":1.0}"#).unwrap();
        assert_eq!(older.polar, default_camera_polar());

        world.resource_mut::<ButtonInput<MouseButton>>().reset_all();
        world.resource_mut::<AccumulatedMouseMotion>().delta = Vec2::ZERO;
        press_button(&mut app, "Zoom in");
        press_button(&mut app, "Show grid");
        press_button(&mut app, "Hide grid");
        press_button(&mut app, "Show forecast");
        press_button(&mut app, "Hide forecast");
        press_button(&mut app, "Reset camera");
        app.world_mut().run_schedule(PostUpdate);
        assert_eq!(
            app.world()
                .resource::<village::Village>()
                .camera_view
                .unwrap()
                .polar,
            default_camera_polar()
        );
        app.world_mut()
            .resource_mut::<ButtonInput<KeyCode>>()
            .press(KeyCode::Escape);
        app.world_mut().run_schedule(Update);
        app.world_mut()
            .resource_mut::<ButtonInput<KeyCode>>()
            .reset(KeyCode::Escape);
        assert!(!app.world().resource::<WorldSetup>().open);

        // The forecast toggle now lives on the top bar's weather line; F reaches it too.
        for _ in 0..2 {
            app.world_mut()
                .resource_mut::<ButtonInput<KeyCode>>()
                .press(KeyCode::KeyF);
            app.world_mut().run_schedule(Update);
            app.world_mut()
                .resource_mut::<ButtonInput<KeyCode>>()
                .reset(KeyCode::KeyF);
            let shown = app.world().resource::<village::Village>().show_forecast;
            if shown {
                assert!(
                    app.world_mut()
                        .query::<&Text>()
                        .iter(app.world())
                        .any(|text| text.0.contains("Day 3 ·"))
                );
            }
        }
        assert!(!app.world().resource::<village::Village>().show_forecast);
        for (button, legend, second_page) in [
            ("Land & slope", "Land & slope · Green", false),
            ("Resources", "Resources · Green", false),
            ("Ecology", "Ecology · Green", false),
            ("Access & hauling", "Access & hauling · White", false),
            ("Construction", "Construction · Gold", false),
            ("Water", "Water · Drinking water", false),
            ("Sanitation", "Sanitation · Purple", false),
            ("Work", "Work · Green assigned", false),
            ("Food", "Food · Blue shared supplies", true),
            ("Residents", "Residents · Green residents", true),
            ("Comfort", "Comfort · Green open facility", true),
        ] {
            press_button(&mut app, "Map lenses");
            if second_page {
                press_button(&mut app, "Other lenses");
            }
            press_button(&mut app, button);
            assert!(
                app.world_mut()
                    .query::<&Text>()
                    .iter(app.world())
                    .any(|text| text.0.contains(legend)),
                "missing legend for {button}"
            );
        }
        press_button(&mut app, "Map lenses");
        press_button(&mut app, "Other lenses");
        press_button(&mut app, "Production chains");
        press_button(&mut app, "Next filter");
        press_button(&mut app, "Previous filter");
        press_button(&mut app, "Map lenses");
        press_button(&mut app, "Power");
        press_button(&mut app, "Next facility");
        press_button(&mut app, "Previous facility");
        press_button(&mut app, "Map lenses");
        press_button(&mut app, "Clear lens");

        press_button(&mut app, "Savings");
        assert!(app.world().resource::<village::Village>().is_paused());
        let planning_water = river_vertex_colors(&mut app);
        simulate_river_frame(&mut app);
        assert_eq!(river_vertex_colors(&mut app), planning_water);
        press_button(&mut app, "Keep paused");
        press_button(&mut app, "Close panel");
        assert!(app.world().resource::<village::Village>().is_paused());
        press_button(&mut app, "Resume");
        assert!(!app.world().resource::<village::Village>().is_paused());
        press_button(&mut app, "Finances");
        press_button(&mut app, "Bento");
        press_button(&mut app, "Book one day shift");
        press_button(&mut app, "Repeat weekday shifts");
        press_button(&mut app, "Open ledger");
        press_button(&mut app, "Next page");
        press_button(&mut app, "Close ledger");
        press_button(&mut app, "Manage grid power");
        press_button(&mut app, "Disconnect grid");
        press_button(&mut app, "Connect grid");
        press_button(&mut app, "Residents");
        {
            let world = app.world_mut();
            let mut images = world.query::<&ImageNode>();
            let assets = world.resource::<AssetServer>();
            let portraits = images
                .iter(world)
                .filter_map(|node| {
                    assets.get_path(node.image.id()).and_then(|asset| {
                        asset
                            .path()
                            .to_str()
                            .filter(|path| path.contains("/resident_portraits/"))
                            .map(str::to_owned)
                    })
                })
                .collect::<std::collections::BTreeSet<_>>();
            assert_eq!(portraits.len(), village::NAMES.len());
        }
        assert!(
            app.world_mut()
                .query::<&Text>()
                .iter(app.world())
                .any(|text| text.0.contains("Booked for")
                    && text.0.contains("Repeat 4h shifts on weekdays · on"))
        );
        press_button(&mut app, "Cancel day shift");
        assert!(
            app.world_mut()
                .query::<&Text>()
                .iter(app.world())
                .any(|text| text.0.contains("Book for")
                    && text.0.contains("Repeat 4h shifts on weekdays · on"))
        );
        press_button(&mut app, "Book one day shift");
        press_button(&mut app, "Trade");
        assert!(app.world().resource::<village::Village>().trade_open());
        let trade_state = |app: &App| {
            app.world()
                .resource::<village::Village>()
                .trade_test_state()
        };
        let (balance, orders, delivery) = trade_state(&app);
        press_button(&mut app, "Buy for pickup");
        let (remaining, queued, _) = trade_state(&app);
        assert_eq!(queued, orders + 1);
        assert!(remaining < balance);
        press_button(&mut app, "Cancel last order");
        assert_eq!(trade_state(&app), (balance, orders, delivery));

        assert!(!delivery);
        press_button(&mut app, "Purchases: resident pickup");
        press_button(&mut app, "Buy for delivery");
        let (remaining, queued, delivery) = trade_state(&app);
        assert_eq!(queued, orders);
        assert!(remaining < balance && delivery);
        press_button(&mut app, "Buy for delivery");
        assert_eq!(trade_state(&app), (remaining, queued, delivery));
        press_button(&mut app, "View orders");
        assert!(
            app.world_mut()
                .query::<&Text>()
                .iter(app.world())
                .any(|text| text.0.contains("Freight ·")
                    && text.0.contains("game minutes remaining"))
        );
        press_button(&mut app, "Browse materials");

        press_button(&mut app, "Close panel");
        assert!(!app.world().resource::<village::Village>().trade_open());
        assert!(!app.world().resource::<village::Village>().is_paused());

        press_button(&mut app, "Food portions");
        press_button(&mut app, "Purchases: supplier freight");
        press_button(&mut app, "Purchases: resident pickup");
        press_button(&mut app, "Automatic food purchases on");
        press_button(&mut app, "Automatic food purchases off");
        press_button(&mut app, "Set daily food budget");
        let window = app
            .world_mut()
            .query_filtered::<Entity, With<PrimaryWindow>>()
            .single(app.world())
            .unwrap();
        use bevy::input::{
            ButtonState,
            keyboard::{Key, KeyboardInput},
        };
        for (key_code, digit) in [(KeyCode::Digit3, "3"), (KeyCode::Digit7, "7")] {
            app.world_mut().write_message(KeyboardInput {
                key_code,
                logical_key: Key::Character(digit.into()),
                state: ButtonState::Pressed,
                text: Some(digit.into()),
                repeat: false,
                window,
            });
        }
        app.world_mut().run_schedule(Update);
        app.world_mut()
            .resource_mut::<ButtonInput<KeyCode>>()
            .press(KeyCode::Enter);
        app.world_mut().run_schedule(Update);
        app.world_mut()
            .resource_mut::<ButtonInput<KeyCode>>()
            .reset(KeyCode::Enter);
        assert!(
            app.world_mut()
                .query::<&Text>()
                .iter(app.world())
                .any(|text| text.0.contains("Daily limit R$37\n"))
        );
        press_button(&mut app, "Automatic cooking off");
        press_button(&mut app, "Fresh target 1.0d +");
        press_button(&mut app, "Fresh target 1.5d −");
        press_button(&mut app, "Dried target 2.0d +");
        press_button(&mut app, "Dried target 2.5d −");
        press_button(&mut app, "Automatic cooking on");
        press_button(&mut app, "Food batches");
        assert!(
            app.world_mut()
                .query::<&Text>()
                .iter(app.world())
                .any(|text| {
                    text.0.contains("On the shelves") && text.0.contains("Dried provisions")
                })
        );
        press_button(&mut app, "Next page");
        assert!(
            app.world_mut()
                .query::<&Text>()
                .iter(app.world())
                .any(|text| text.0.contains("Food batches · 1/"))
        );
        press_button(&mut app, "Previous page");
        press_button(&mut app, "Close food batches");
        press_button(&mut app, "Close panel");
        press_button(&mut app, "Water");
        press_button(&mut app, "Camp source");
        press_button(&mut app, "Camp destination");
        press_button(&mut app, "Channel · Drinking");
        press_button(&mut app, "Channel · Irrigation");
        press_button(&mut app, "Channel · Greywater");
        press_button(&mut app, "Channel · Sewage");
        press_button(&mut app, "Channel · Drinking");
        press_button(&mut app, "Close panel");
        press_button(&mut app, "Projects");
        press_button(&mut app, "Show underway");
        press_button(&mut app, "Next page");
        press_button(&mut app, "Previous page");
        press_button(&mut app, "Show all projects");
        press_button(&mut app, "Close panel");
        press_button(&mut app, "Maintenance");
        press_button(&mut app, "Manage service supplies");
        press_button(&mut app, "Find material");
        for (key_code, letter) in [
            (KeyCode::KeyT, "T"),
            (KeyCode::KeyI, "I"),
            (KeyCode::KeyM, "M"),
            (KeyCode::KeyB, "B"),
            (KeyCode::KeyE, "E"),
            (KeyCode::KeyR, "R"),
        ] {
            app.world_mut().write_message(KeyboardInput {
                key_code,
                logical_key: Key::Character(letter.into()),
                state: ButtonState::Pressed,
                text: Some(letter.into()),
                repeat: false,
                window,
            });
        }
        app.world_mut().run_schedule(Update);
        let hud = app
            .world_mut()
            .query::<&Text>()
            .iter(app.world())
            .find(|text| text.0.contains("Find material · TIMBER"))
            .unwrap();
        assert!(hud.0.contains("timber pieces"));
        assert!(!hud.0.contains("fastener packs"));
        press_button(&mut app, "Trade · timber pieces");
        assert!(app.world().resource::<village::Village>().trade_open());
        assert!(
            app.world_mut()
                .query::<&Text>()
                .iter(app.world())
                .any(|text| text.0.contains("timber pieces · Pack")
                    && text.0.contains("Freight total"))
        );
        for (label, input, displayed) in [
            ("Set minimum load", "37", "37% (0–100)"),
            ("Set maximum wait", "3.5", "3.5h (0–24)"),
            ("Keep at least (kg)", "19.5", "19.5 kg · Enter to set"),
            ("Sell when above (kg)", "4", "4 kg · Enter to set"),
            ("Maximum per day (kg)", "32", "32 kg · Enter to set"),
        ] {
            press_button(&mut app, label);
            app.world_mut().write_message(KeyboardInput {
                key_code: KeyCode::Unidentified(bevy::input::keyboard::NativeKeyCode::Unidentified),
                logical_key: Key::Character(input.into()),
                state: ButtonState::Pressed,
                text: Some(input.into()),
                repeat: false,
                window,
            });
            app.world_mut().run_schedule(Update);
            assert!(
                app.world_mut()
                    .query::<&Text>()
                    .iter(app.world())
                    .any(|text| text.0.contains(displayed))
            );
            app.world_mut()
                .resource_mut::<ButtonInput<KeyCode>>()
                .press(KeyCode::Enter);
            app.world_mut().run_schedule(Update);
            app.world_mut()
                .resource_mut::<ButtonInput<KeyCode>>()
                .reset(KeyCode::Enter);
        }
        assert!(
            app.world_mut()
                .query::<&Text>()
                .iter(app.world())
                .any(|text| {
                    text.0.contains("Minimum load 37% · Wait up to 3.5h")
                        && text.0.contains("Reserve 16 kg")
                        && text.0.contains("Trigger 16 kg · Daily cap 32 kg")
                })
        );
        press_button(&mut app, "Close panel");
        press_button(&mut app, "Crafting");
        assert!(
            app.world_mut()
                .query::<&Text>()
                .iter(app.world())
                .any(|text| text.0.contains("Crafting & repairs"))
        );
        press_button(&mut app, "Craft harvest basket");
        assert!(
            app.world_mut()
                .query::<&Text>()
                .iter(app.world())
                .any(|text| text.0.contains("Build a suitable workspace first."))
        );
        press_button(&mut app, "Repair");
        press_button(&mut app, "Jobs");
        assert!(
            app.world_mut()
                .query::<&Text>()
                .iter(app.world())
                .any(|text| text.0.contains("No crafting jobs underway."))
        );
        press_button(&mut app, "Close panel");
        press_button(&mut app, "Stores");
        press_button(&mut app, "Show items and equipment");
        press_button(&mut app, "Show food");
        assert!(
            app.world_mut()
                .query::<&Text>()
                .iter(app.world())
                .any(|text| text.0.contains("Food from town & the village"))
        );
        press_button(&mut app, "Show production sites");
        press_button(&mut app, "Show resources");
        press_button(&mut app, "Manage food");
        press_button(&mut app, "Chill first · Earliest expiry");
        press_button(&mut app, "Chill first · Meals first");
        press_button(&mut app, "Chill first · Ingredients first");
        press_button(&mut app, "Close panel");

        press_button(&mut app, "Advance days");
        press_button(&mut app, "+7 day(s)");
        press_button(&mut app, "Start advance");
        press_button(&mut app, "Stop advance");
        assert!(app.world().resource::<village::Village>().is_paused());
        assert!(!app.world().resource::<village::Village>().advance_open());
        let checkpoint = save::read(
            &save_dir.join("continue.json"),
            app.world().resource::<catalog::Catalog>(),
        )
        .unwrap();
        assert!(checkpoint.is_paused());
        assert!(
            checkpoint
                .story_resume_summary()
                .ends_with("shared savings")
        );
        assert_eq!(
            checkpoint.seconds(),
            app.world().resource::<village::Village>().seconds()
        );
        press_button(&mut app, "Resume");

        press_button(&mut app, "Saved villages");
        press_button(&mut app, "Name current village");
        app.world_mut()
            .resource_mut::<save_library::SaveMenu>()
            .entry
            .as_mut()
            .unwrap()
            .text = "Test village".into();
        press_button(&mut app, "Confirm name");
        press_button(&mut app, "Rename");
        app.world_mut()
            .resource_mut::<save_library::SaveMenu>()
            .entry
            .as_mut()
            .unwrap()
            .text = "Renamed test village".into();
        press_button(&mut app, "Confirm name");
        press_button(&mut app, "Close saved villages");
        press_button(&mut app, "Setup");
        app.world_mut().run_schedule(Update);
        assert!(app.world().resource::<WorldSetup>().open);
        press_button(&mut app, "Saved villages");
        press_button(&mut app, "› Renamed test village");
        press_button(&mut app, "Load village");
        assert!(!app.world().resource::<save_library::SaveMenu>().open);
        press_button(&mut app, "Saved villages");
        press_button(&mut app, "Remove save");
        assert_eq!(
            app.world().resource::<save_library::SaveMenu>().rows.len(),
            1
        );
        press_button(&mut app, "Confirm removal");
        assert!(
            app.world()
                .resource::<save_library::SaveMenu>()
                .rows
                .is_empty()
        );
        press_button(&mut app, "Close saved villages");
        std::fs::remove_dir_all(&save_dir).unwrap();

        press_button(&mut app, "Setup");
        app.world_mut().run_schedule(Update);
        assert!(app.world().resource::<WorldSetup>().open);
        press_button(&mut app, "New game");
        press_button(&mut app, "Start new village");
        assert!(app.world().resource::<WorldSetup>().open);
        press_button(&mut app, "Back to main menu");
        press_button(&mut app, "Resume current village");
        assert!(!app.world().resource::<WorldSetup>().open);
        assert_eq!(
            app.world().resource::<village::Village>().camp,
            Some(IVec2::new(36, 36))
        );

        app.world_mut().resource_mut::<WorldSetup>().open = true;
        app.world_mut().run_schedule(Update);
        press_button(&mut app, "New game");
        press_button(&mut app, "Start new village");
        press_button(&mut app, "Confirm new village");
        app.world_mut().run_schedule(Update);
        assert!(!app.world().resource::<WorldSetup>().open);
        assert!(app.world().resource::<village::Village>().camp.is_none());

        let mut setup = app.world_mut().resource_mut::<WorldSetup>();
        *setup = setup
            .clone()
            .with_seed(std::num::NonZeroU32::new(42).unwrap());
        setup.mode = setup::Mode::Sandbox;
        app.update();
        let sandbox = app.world().resource::<village::Village>();
        assert_eq!(sandbox.camp, Some(IVec2::new(36, 36)));
        assert!(matches!(sandbox.mode(), Some(setup::Mode::Sandbox)));
        press_button(&mut app, "Residents");
        press_button(&mut app, "Story");
        assert!(
            app.world_mut()
                .query::<&Text>()
                .iter(app.world())
                .any(|text| text.0.contains("Iara grew up tending a small garden"))
        );
        press_button(&mut app, "Skills");
        assert!(
            app.world_mut()
                .query::<&Text>()
                .iter(app.world())
                .any(|text| text.0.contains("Specialties · 25% faster"))
        );
        press_button(&mut app, "Relationships");
        assert!(
            app.world_mut()
                .query::<&Text>()
                .iter(app.world())
                .any(|text| text
                    .0
                    .contains("Bento · Getting to know each other · 0/100"))
        );
        press_button(&mut app, "Overview");
        assert!(
            app.world_mut()
                .query::<&Text>()
                .iter(app.world())
                .any(|text| text.0.contains("Click home"))
        );
        let before = app
            .world_mut()
            .query::<&VillageCamera>()
            .single(app.world())
            .unwrap()
            .target;
        press_button(&mut app, "Find resident in village");
        let after = app
            .world_mut()
            .query::<&VillageCamera>()
            .single(app.world())
            .unwrap()
            .target;
        assert_ne!(before, after);

        press_button(&mut app, "Food portions");
        assert!(
            app.world_mut()
                .query::<&Text>()
                .iter(app.world())
                .any(|text| text.0.contains("Unlimited food · No spoilage"))
        );
        press_button(&mut app, "Chill first · Earliest expiry");
        press_button(&mut app, "Food batches");
        press_button(&mut app, "Close panel");

        press_button(&mut app, "Saved villages");
        press_button(&mut app, "Name current village");
        app.world_mut()
            .resource_mut::<save_library::SaveMenu>()
            .entry
            .as_mut()
            .unwrap()
            .text = "Sandbox test village".into();
        press_button(&mut app, "Confirm name");
        press_button(&mut app, "Close saved villages");
        press_button(&mut app, "Setup");
        app.world_mut().resource_mut::<WorldSetup>().mode = setup::Mode::Story;
        app.update();
        press_button(&mut app, "Saved villages");
        assert!(
            app.world()
                .resource::<save_library::SaveMenu>()
                .rows
                .is_empty()
        );
        press_button(&mut app, "Browse Sandbox saves");
        press_button(&mut app, "› Sandbox test village");
        press_button(&mut app, "Load village");
        assert!(matches!(
            app.world().resource::<WorldSetup>().mode,
            setup::Mode::Sandbox
        ));
        assert!(!app.world().resource::<WorldSetup>().open);
        std::fs::remove_dir_all(save_dir).unwrap();
    }
}
