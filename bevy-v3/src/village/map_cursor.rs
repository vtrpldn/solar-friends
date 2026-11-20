use super::*;
use bevy::input_focus::InputFocus;

const PAN: [KeyCode; 8] = [
    KeyCode::KeyW,
    KeyCode::KeyA,
    KeyCode::KeyS,
    KeyCode::KeyD,
    KeyCode::ArrowUp,
    KeyCode::ArrowLeft,
    KeyCode::ArrowDown,
    KeyCode::ArrowRight,
];
const ENTER: [KeyCode; 2] = [KeyCode::Enter, KeyCode::NumpadEnter];

#[derive(Default, Resource)]
struct MapCursor {
    active: bool,
    mouse_anchor: Option<Vec2>,
    // Mouse picking clears its stroke when the physical cursor is over UI.
    stroke: Vec<Vec3>,
}

pub(super) fn install(app: &mut App) {
    app.init_resource::<MapCursor>().add_systems(
        Update,
        (read_keyboard_cursor, draw_reticle)
            .chain()
            .after(read_camp_pointer)
            .before(village_input),
    );
}

type CursorInput<'w> = (
    Res<'w, ButtonInput<KeyCode>>,
    Res<'w, ButtonInput<MouseButton>>,
    Option<Res<'w, InputFocus>>,
);

fn read_keyboard_cursor(
    (setup, village, saves, sound): (
        Res<WorldSetup>,
        Res<Village>,
        Res<SaveMenu>,
        Res<SoundSettings>,
    ),
    (keys, mouse, focus): CursorInput,
    window: Single<&Window, With<PrimaryWindow>>,
    camera: Single<(&Camera, &GlobalTransform), With<VillageCamera>>,
    (ground, actors, buildings): (
        Query<(), With<GroundMesh>>,
        Query<ResidentPick>,
        BuildingPick,
    ),
    mut raycast: MeshRayCast,
    (mut cursor, mut pointer): (ResMut<MapCursor>, ResMut<CampPointer>),
) {
    let selecting_on_map = !village.construction.menu
        && !matches!(
            village.utility_panel,
            Some(
                UtilityPanel::Inventory
                    | UtilityPanel::Crafting
                    | UtilityPanel::Events
                    | UtilityPanel::Projects
            )
        )
        && (village.utility_panel != Some(UtilityPanel::Residents)
            || village.resident_overview_open());
    let available = window.focused
        && !setup.open
        && !saves.open
        && !sound.open
        && !village.map_input_blocked()
        && !village.advance_open()
        && !village.trade_open()
        && village.numeric_entry.is_none()
        && village.arrival_time >= ARRIVAL_DURATION
        && (village.camp.is_none()
            || village.construction.placing_project()
            || village.planning_roads()
            || village.terrain_editor.open
            || selecting_on_map);
    let position = window.cursor_position();
    let mouse_moved = position
        .zip(cursor.mouse_anchor)
        .is_some_and(|(now, start)| now.distance(start) > 5.0);
    if !available || (cursor.active && mouse_moved) {
        cursor.active = false;
    } else if keys.any_just_pressed(PAN)
        && !keys.any_pressed([
            KeyCode::AltLeft,
            KeyCode::AltRight,
            KeyCode::ControlLeft,
            KeyCode::ControlRight,
            KeyCode::SuperLeft,
            KeyCode::SuperRight,
        ])
    {
        cursor.active = true;
        cursor.mouse_anchor = position;
    }
    if !cursor.active {
        if !cursor.stroke.is_empty() && !mouse.just_pressed(MouseButton::Left) {
            pointer.terrain_stroke.clear();
            pointer.terrain_stroke_finished = false;
        }
        cursor.stroke.clear();
        return;
    }
    if cursor.mouse_anchor.is_none() {
        cursor.mouse_anchor = position;
    }
    pointer.clicked = None;
    pointer.hovered = None;
    pointer.resident = None;
    pointer.project = None;
    pointer.terrain_stroke.clear();
    pointer.terrain_stroke_finished = false;
    let enter_available = focus.is_none_or(|focus| focus.get().is_none());
    let clicked = enter_available && keys.any_just_pressed(ENTER);
    let painting = village.terrain_editor.open;
    if !painting || !enter_available || clicked {
        cursor.stroke.clear();
    }
    let (camera, transform) = *camera;
    let Some(viewport) = camera.logical_viewport_rect() else {
        cursor.stroke.clear();
        return;
    };
    let centre = viewport.center();
    let selecting = clicked
        && village.camp.is_some()
        && !painting
        && !village.planning_roads()
        && !village.construction.placing_project();
    if selecting {
        pointer.resident = resident_under_cursor(camera, transform, centre, &actors);
    }
    if let Ok(ray) = camera.viewport_to_world(transform, centre) {
        if selecting && pointer.resident.is_none() && village.lenses.active.is_none() {
            pointer.project = building_under_cursor(ray, &mut raycast, &buildings);
        }
        let filter = |entity| ground.contains(entity);
        let settings = MeshRayCastSettings::default().with_filter(&filter);
        if let Some((_, hit)) = raycast.cast_ray(ray, &settings).first() {
            let world = hit.point;
            let hit = GroundHit {
                cell: (world.xz() * 0.5 + Vec2::splat(32.5)).floor().as_ivec2(),
                world,
            };
            pointer.hovered = Some(hit);
            if clicked && pointer.resident.is_none() {
                pointer.clicked = Some(hit);
            }
            if painting && clicked {
                cursor.stroke.push(world);
            } else if let Some(&last) = cursor.stroke.last() {
                let distance = last.xz().distance(world.xz());
                let steps = ((distance / 2.0) as usize).min(256 - cursor.stroke.len());
                for step in 1..=steps {
                    cursor
                        .stroke
                        .push(last.lerp(world, step as f32 * 2.0 / distance));
                }
            }
        }
    }
    pointer.terrain_stroke.clone_from(&cursor.stroke);
    if !cursor.stroke.is_empty() && !keys.any_pressed(ENTER) {
        pointer.terrain_stroke_finished = true;
        cursor.stroke.clear();
    }
}

fn draw_reticle(cursor: Res<MapCursor>, pointer: Res<CampPointer>, mut gizmos: Gizmos) {
    if cursor.active
        && let Some(hit) = pointer.hovered
    {
        let ring = Isometry3d::new(
            hit.world + Vec3::Y * 0.12,
            Quat::from_rotation_x(-std::f32::consts::FRAC_PI_2),
        );
        gizmos.circle(ring, 0.62, crate::theme::INK);
        gizmos.circle(ring, 0.52, crate::theme::PAPER);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bevy::camera::{RenderTargetInfo, primitives::MeshAabb, visibility::SetViewVisibility};

    fn map_app() -> App {
        let mut app = App::new();
        app.add_plugins((MinimalPlugins, AssetPlugin::default()))
            .init_asset::<Mesh>()
            .init_resource::<CampPointer>()
            .init_resource::<MapCursor>()
            .init_resource::<ButtonInput<KeyCode>>()
            .init_resource::<ButtonInput<MouseButton>>()
            .init_resource::<SaveMenu>()
            .init_resource::<SoundSettings>()
            .init_resource::<WorldSetup>()
            .insert_resource(Village {
                arrival_time: ARRIVAL_DURATION,
                ..default()
            })
            .add_systems(Update, (read_camp_pointer, read_keyboard_cursor).chain());
        let world = app.world_mut();
        world.resource_mut::<WorldSetup>().open = false;
        world.spawn((
            PrimaryWindow,
            Window {
                focused: true,
                ..default()
            },
        ));
        let target = Vec3::new(6., 0., -4.);
        let mut camera = Camera::default();
        camera.computed.target_info = Some(RenderTargetInfo {
            physical_size: UVec2::new(800, 600),
            scale_factor: 1.,
        });
        camera.computed.clip_from_view = Mat4::perspective_infinite_reverse_rh(1., 4. / 3., 0.1);
        world.spawn((
            camera,
            VillageCamera {
                target,
                heading: 0.,
                polar: 0.7,
            },
            GlobalTransform::from(
                Transform::from_translation(target + Vec3::new(0., 10., 10.))
                    .looking_at(target, Vec3::Y),
            ),
        ));
        let mesh = Mesh::from(Plane3d::default().mesh().size(32., 32.));
        let bounds = mesh.compute_aabb().unwrap();
        let handle = world.resource_mut::<Assets<Mesh>>().add(mesh);
        world
            .spawn((
                GroundMesh,
                Mesh3d(handle),
                bounds,
                InheritedVisibility::VISIBLE,
                ViewVisibility::HIDDEN,
                GlobalTransform::IDENTITY,
            ))
            .get_mut::<ViewVisibility>()
            .unwrap()
            .set_visible();
        world
            .resource_mut::<ButtonInput<KeyCode>>()
            .press(KeyCode::ArrowRight);
        app.update();
        app.world_mut()
            .resource_mut::<ButtonInput<KeyCode>>()
            .clear();
        app
    }

    #[test]
    fn enter_clicks_centre_ground_cell() {
        let mut app = map_app();
        app.world_mut()
            .resource_mut::<ButtonInput<KeyCode>>()
            .press(KeyCode::Enter);
        app.update();
        assert_eq!(
            app.world().resource::<CampPointer>().clicked.unwrap().cell,
            IVec2::new(35, 30)
        );
    }

    #[test]
    fn painted_stroke_samples_camera_motion_and_finishes_once() {
        let mut app = map_app();
        let world = app.world_mut();
        world.resource_mut::<Village>().terrain_editor.open = true;
        world
            .resource_mut::<ButtonInput<KeyCode>>()
            .press(KeyCode::Enter);
        app.update();
        let world = app.world_mut();
        world.resource_mut::<ButtonInput<KeyCode>>().clear();
        let mut camera = world
            .query_filtered::<&mut GlobalTransform, With<VillageCamera>>()
            .single_mut(world)
            .unwrap();
        let mut transform = camera.compute_transform();
        transform.translation.x += 6.5;
        *camera = GlobalTransform::from(transform);
        app.update();
        let pointer = app.world().resource::<CampPointer>();
        assert_eq!(pointer.terrain_stroke.len(), 4);
        for (index, point) in pointer.terrain_stroke.iter().enumerate() {
            assert!((point.x - (6. + 2. * index as f32)).abs() < 0.001);
        }
        assert!(!pointer.terrain_stroke_finished);
        app.world_mut()
            .resource_mut::<ButtonInput<KeyCode>>()
            .release(KeyCode::Enter);
        app.update();
        let pointer = app.world().resource::<CampPointer>();
        assert!(pointer.terrain_stroke_finished);
        assert_eq!(pointer.terrain_stroke.len(), 4);
        app.update();
        let pointer = app.world().resource::<CampPointer>();
        assert!(pointer.terrain_stroke.is_empty() && !pointer.terrain_stroke_finished);
    }

    #[test]
    fn focused_enter_leaves_map_untouched() {
        let mut app = map_app();
        app.world_mut()
            .resource_mut::<Village>()
            .terrain_editor
            .open = true;
        let button = app.world_mut().spawn(Button).id();
        app.insert_resource(InputFocus::from_entity(button));
        app.world_mut()
            .resource_mut::<ButtonInput<KeyCode>>()
            .press(KeyCode::NumpadEnter);
        app.update();
        let pointer = app.world().resource::<CampPointer>();
        assert!(pointer.hovered.is_some());
        assert!(
            pointer.clicked.is_none() && pointer.resident.is_none() && pointer.project.is_none()
        );
        assert!(pointer.terrain_stroke.is_empty() && !pointer.terrain_stroke_finished);
    }
}
