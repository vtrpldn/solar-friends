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
mod equipment;
mod farming;
mod food;
mod gathering;
mod land;
mod livestock;
mod market;
mod navigation;
mod production;
mod resident_animation;
mod residents;
mod save;
mod save_library;
mod setup;
mod stock;
mod terrain;
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

fn main() {
    let mut args = std::env::args_os().skip(1);
    let option = args.next();
    if option.as_deref().is_some_and(|flag| flag == "--workshop") {
        workshop::run();
        return;
    }
    if let Some(flag) = option.as_deref()
        && (flag == "--lab" || flag == "--lab-replay" || flag == "--lab-ui")
    {
        let path = args.next().map(std::path::PathBuf::from);
        let save = args.next().map(std::path::PathBuf::from);
        let result = match (path, save, args.next(), flag.to_str()) {
            (Some(path), save, None, Some("--lab")) => {
                village::lab::run_file(&path, save.as_deref())
            }
            (Some(path), None, None, Some("--lab-replay")) => village::lab::replay_file(&path),
            (Some(path), save, None, Some("--lab-ui")) => {
                village::lab::run_ui(&path, save.as_deref())
            }
            _ => Err(std::io::Error::other(
                "Usage: solar-friends-v3 --lab or --lab-ui scenario.json [village.json], or --lab-replay report.json",
            )),
        };
        if let Err(error) = result {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }
    let mut app = App::new();
    if std::env::args().any(|argument| argument == "--play") {
        app.insert_resource(WorldSetup::default().session());
    }
    app.insert_resource(WinitSettings {
        unfocused_mode: UpdateMode::reactive_low_power(std::time::Duration::from_secs_f64(
            1.0 / village::SIMULATION_HZ,
        )),
        ..WinitSettings::game()
    })
    .add_plugins(DefaultPlugins.set(WindowPlugin {
        primary_window: Some(Window {
            title: "Solar Friends V3".into(),
            resolution: WindowResolution::new(1280, 800),
            ..default()
        }),
        ..default()
    }))
    .add_plugins((
        WorldSetupPlugin,
        village::VillagePlugin,
        ui_font::UiFontPlugin,
        audio::VillageAudio,
        land::LandPlugin,
        weather::WeatherPlugin,
        resident_animation::ResidentAnimationPlugin,
        wildlife::WildlifePlugin,
    ))
    .add_systems(Startup, setup_scene)
    .add_systems(PostUpdate, update_land)
    .run();
}

#[derive(Component)]
struct VillageCamera {
    target: Vec3,
    heading: f32,
}

fn camera_transform(target: Vec3, heading: f32) -> Transform {
    let offset = Quat::from_rotation_y(heading) * Vec3::new(32.0, 35.0, 32.0);
    Transform::from_translation(target + offset).looking_at(target, Vec3::Y)
}

fn setup_scene(mut commands: Commands) {
    commands.spawn((
        Camera3d::default(),
        Projection::Orthographic(OrthographicProjection {
            scaling_mode: bevy::camera::ScalingMode::FixedVertical {
                viewport_height: CAMERA_HEIGHT,
            },
            ..OrthographicProjection::default_3d()
        }),
        VillageCamera {
            target: CAMERA_HOME,
            heading: 0.0,
        },
        camera_transform(CAMERA_HOME, 0.0),
    ));
    commands.spawn((
        DirectionalLight {
            illuminance: 15_000.0,
            shadows_enabled: true,
            ..default()
        },
        Transform::from_xyz(-40.0, 65.0, 27.0).looking_at(Vec3::ZERO, Vec3::Y),
    ));
}

#[derive(Component)]
struct LandMesh;

#[derive(Component)]
struct GroundMesh;

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
    commands.spawn((
        LandMesh,
        Mesh3d(meshes.add(terrain.river_mesh())),
        MeshMaterial3d(materials.add(Color::srgb_u8(75, 135, 147))),
    ));
}

fn pointer_over_ui(ui: &Query<&Interaction>) -> bool {
    ui.iter()
        .any(|interaction| *interaction != Interaction::None)
}

fn camera_controls(
    keyboard: Res<ButtonInput<KeyCode>>,
    (mouse, ui): (Res<ButtonInput<MouseButton>>, Query<&Interaction>),
    (motion, scroll): (Res<AccumulatedMouseMotion>, Res<AccumulatedMouseScroll>),
    window: Single<&Window, With<PrimaryWindow>>,
    time: Res<Time>,
    (setup, mut village, saves, sound): (
        Res<WorldSetup>,
        ResMut<village::Village>,
        Res<save_library::SaveMenu>,
        Res<audio::SoundSettings>,
    ),
    mut camera: Single<(&mut Transform, &mut Projection, &mut VillageCamera)>,
) {
    if setup.open
        || saves.open
        || sound.open
        || village.map_input_blocked()
        || village.advance_open()
        || village.trade_open()
        || !window.focused
    {
        return;
    }
    let (transform, projection, view) = &mut *camera;
    let Projection::Orthographic(ortho) = &mut **projection else {
        return;
    };
    if keyboard.just_pressed(KeyCode::Home) {
        let action = if keyboard.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]) {
            CameraAction::Reset
        } else {
            CameraAction::Camp
        };
        apply_camera_action(action, &village, &setup, view, ortho);
    }
    if keyboard.just_pressed(KeyCode::End) {
        apply_camera_action(CameraAction::River, &village, &setup, view, ortho);
    }
    let axis = |positive, negative| {
        i32::from(keyboard.any_pressed(positive)) as f32
            - i32::from(keyboard.any_pressed(negative)) as f32
    };
    let delta = time.delta_secs();
    let pan_x = axis(
        [KeyCode::KeyD, KeyCode::ArrowRight],
        [KeyCode::KeyA, KeyCode::ArrowLeft],
    );
    let pan_z = axis(
        [KeyCode::KeyS, KeyCode::ArrowDown],
        [KeyCode::KeyW, KeyCode::ArrowUp],
    );
    let turn =
        i32::from(keyboard.pressed(KeyCode::KeyE)) - i32::from(keyboard.pressed(KeyCode::KeyQ));
    let pan = Vec3::new(pan_x, 0.0, pan_z).normalize_or_zero();
    let dash = if keyboard.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]) {
        2.2
    } else {
        1.0
    };
    let heading = view.heading + std::f32::consts::FRAC_PI_4;
    let orientation = Quat::from_rotation_y(heading);
    view.target += orientation * pan * (24.0 * dash * ortho.scale.sqrt() * delta);
    let over_ui = pointer_over_ui(&ui);
    if !over_ui && mouse.pressed(MouseButton::Left) && !village.planning_roads() {
        let distance_per_pixel = CAMERA_HEIGHT * ortho.scale / window.height().max(1.0);
        let drag = Vec3::new(-motion.delta.x, 0.0, -motion.delta.y);
        view.target += orientation * drag * distance_per_pixel;
    }
    view.heading += turn as f32 * delta * 1.2;
    if !over_ui && mouse.pressed(MouseButton::Right) {
        view.heading -= motion.delta.x / window.height().max(1.0) * std::f32::consts::TAU;
    }
    view.heading = view.heading.rem_euclid(std::f32::consts::TAU);
    view.target.x = view.target.x.clamp(-124.0, 124.0);
    view.target.z = view.target.z.clamp(-124.0, 124.0);
    **transform = camera_transform(view.target, view.heading);

    let zoom = axis(
        [KeyCode::Minus, KeyCode::NumpadSubtract],
        [KeyCode::Equal, KeyCode::NumpadAdd],
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
    let change = zoom * delta * 1.3 - wheel;
    ortho.scale = (ortho.scale * change.exp()).clamp(1.0 / 6.0, 1.0 / 0.18);
    let saved = village::CameraView {
        target: view.target,
        heading: view.heading,
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
            projection.scale = scale.clamp(1.0 / 6.0, 1.0 / 0.18);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bevy::{asset::AssetPlugin, gizmos::GizmoPlugin, transform::TransformPlugin};

    fn press_button(app: &mut App, label: &str) {
        let world = app.world_mut();
        let button = world
            .query_filtered::<(Entity, &Children), With<Button>>()
            .iter(world)
            .find_map(|(entity, children)| {
                if !children
                    .iter()
                    .any(|child| world.get::<Text>(child).is_some_and(|text| text.0 == label))
                {
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
            .unwrap_or_else(|| panic!("missing visible button: {label}"));
        *world
            .get_mut::<Interaction>(button)
            .expect("button interaction") = Interaction::Pressed;
        world.run_schedule(Update);
        *app.world_mut()
            .get_mut::<Interaction>(button)
            .expect("button interaction") = Interaction::None;
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
        .add_systems(PostUpdate, update_land);
        app.finish();
        app.cleanup();
        app.update();

        app.world_mut().resource_mut::<WorldSetup>().open = false;
        app.update();
        assert!(app.world().resource::<village::Village>().camp.is_none());
        for _ in 0..180 {
            app.world_mut()
                .resource_mut::<Time>()
                .advance_by(std::time::Duration::from_millis(100));
            app.world_mut().run_schedule(Update);
        }
        app.world_mut()
            .resource_mut::<ButtonInput<KeyCode>>()
            .press(KeyCode::Digit3);
        app.world_mut().run_schedule(Update);
        assert_eq!(
            app.world().resource::<village::Village>().camp,
            Some(IVec2::new(36, 36))
        );
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
        press_button(&mut app, "Pause");
        assert!(app.world().resource::<village::Village>().is_paused());
        press_button(&mut app, "Resume");
        assert!(!app.world().resource::<village::Village>().is_paused());

        press_button(&mut app, "1×");
        press_button(&mut app, "4×");
        press_button(&mut app, "8×");
        press_button(&mut app, "16×");
        press_button(&mut app, "1×");

        press_button(&mut app, "Guide");
        assert!(
            app.world()
                .resource::<village::Village>()
                .map_input_blocked()
        );
        press_button(&mut app, "Reference");
        press_button(&mut app, "Growing autonomy");
        press_button(&mut app, "Chapter index");
        press_button(&mut app, "Close guide");
        assert!(
            !app.world()
                .resource::<village::Village>()
                .map_input_blocked()
        );

        press_button(&mut app, "View");
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
        press_button(&mut app, "Zoom in");
        press_button(&mut app, "Show grid");
        press_button(&mut app, "Hide grid");
        press_button(&mut app, "Reset camera");
        press_button(&mut app, "Close view");

        press_button(&mut app, "Map lenses");
        press_button(&mut app, "Other lenses");
        press_button(&mut app, "Material chains");
        press_button(&mut app, "Next filter");
        press_button(&mut app, "Previous filter");
        press_button(&mut app, "Map lenses");
        press_button(&mut app, "Power");
        press_button(&mut app, "Next facility");
        press_button(&mut app, "Previous facility");
        press_button(&mut app, "Map lenses");
        press_button(&mut app, "Clear lens");

        press_button(&mut app, "Manage");
        press_button(&mut app, "Finances");
        press_button(&mut app, "Bento");
        press_button(&mut app, "Toggle day shift");
        press_button(&mut app, "Toggle weekday shifts");
        press_button(&mut app, "Open ledger");
        press_button(&mut app, "Next page");
        press_button(&mut app, "Close ledger");
        press_button(&mut app, "Manage");
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
        press_button(&mut app, "Buy for delivery");
        let (remaining, queued, delivery) = trade_state(&app);
        assert_eq!(queued, orders);
        assert!(remaining < balance && delivery);
        press_button(&mut app, "Buy for delivery");
        assert_eq!(trade_state(&app), (remaining, queued, delivery));

        press_button(&mut app, "Close panel");
        assert!(!app.world().resource::<village::Village>().trade_open());

        press_button(&mut app, "Manage");
        press_button(&mut app, "Water");
        press_button(&mut app, "Camp source");
        press_button(&mut app, "Camp destination");
        press_button(&mut app, "Channel · Drinking");
        press_button(&mut app, "Channel · Irrigation");
        press_button(&mut app, "Channel · Greywater");
        press_button(&mut app, "Channel · Sewage");
        press_button(&mut app, "Channel · Drinking");
        press_button(&mut app, "Close panel");

        press_button(&mut app, "Manage");
        press_button(&mut app, "Projects");
        press_button(&mut app, "Show underway");
        press_button(&mut app, "Next page");
        press_button(&mut app, "Previous page");
        press_button(&mut app, "Show all projects");
        press_button(&mut app, "Close panel");

        let save_dir =
            std::env::temp_dir().join(format!("solar-v3-ui-save-{}", std::process::id()));
        app.world_mut()
            .resource_mut::<save_library::SaveMenu>()
            .test_directory = Some(save_dir.clone());
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
        std::fs::remove_dir_all(save_dir).unwrap();

        press_button(&mut app, "Setup");
        app.world_mut().run_schedule(Update);
        assert!(app.world().resource::<WorldSetup>().open);
        press_button(&mut app, "Start new village");
        assert!(app.world().resource::<WorldSetup>().open);
        press_button(&mut app, "Resume current village");
        assert!(!app.world().resource::<WorldSetup>().open);
        assert_eq!(
            app.world().resource::<village::Village>().camp,
            Some(IVec2::new(36, 36))
        );

        app.world_mut().resource_mut::<WorldSetup>().open = true;
        app.world_mut().run_schedule(Update);
        press_button(&mut app, "Start new village");
        press_button(&mut app, "Confirm new village");
        app.world_mut().run_schedule(Update);
        assert!(!app.world().resource::<WorldSetup>().open);
        assert!(app.world().resource::<village::Village>().camp.is_none());
    }
}
