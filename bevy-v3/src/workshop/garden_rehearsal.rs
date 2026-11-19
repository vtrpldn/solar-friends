use super::*;
use crate::resident_animation::{Motion, RehearsalPose};
use std::collections::VecDeque;

#[derive(Clone, Copy)]
struct Action(&'static str, Motion);

fn actions(asset: &str) -> &'static [Action] {
    use Motion::*;
    match asset {
        "garden-bench" => &[Action("Sit on the bench", Sit)],
        "shed" => &[Action("Rest in the shade", Sit)],
        "picnic-table" => &[Action("Sit at the table", Sit)],
        "hammock" => &[Action("Rest in the hammock", Rest)],
        "garden" => &[
            Action("Water the garden", Water),
            Action("Tend the vegetables", Tend),
        ],
        "seedling-bench" => &[Action("Tend the seedlings", Work)],
        "workshop" => &[Action("Work at the bench", Work)],
        "kitchen" => &[Action("Prepare food", Work)],
        "wash-station" => &[Action("Wash hands", Wash)],
        "produce-crates" => &[Action("Pick up and carry a crate", Carry)],
        _ => &[],
    }
}

pub(super) fn resident_model(asset: &str) -> Option<(usize, usize)> {
    Some(match asset {
        "iara" => (0, 0),
        "bento" => (1, 1),
        "luz" => (2, 2),
        "caua" => (3, 3),
        "nina" => (4, 4),
        "resident" => (5, 9),
        _ => return None,
    })
}

#[derive(Default, Resource)]
pub(super) struct Rehearsal {
    actor: usize,
    action: usize,
    paused: bool,
    task: Option<Task>,
}

impl Rehearsal {
    pub(super) fn is_playing(&self) -> bool {
        !self.paused
    }

    pub(super) fn has_task(&self) -> bool {
        self.task.is_some()
    }

    pub(super) fn is_active(&self, entity: Entity) -> bool {
        self.task.as_ref().is_some_and(|task| task.actor == entity)
    }
}

pub(super) fn can_rehearse(garden: &Garden) -> bool {
    garden.pending.is_none()
        && garden
            .selected
            .is_some_and(|index| !actions(&garden.layout.props[index].asset).is_empty())
        && garden
            .layout
            .props
            .iter()
            .any(|prop| resident_model(&prop.asset).is_some())
}

struct Task {
    actor: Entity,
    home: Transform,
    path: VecDeque<Vec2>,
    reverse: VecDeque<Vec2>,
    at: Vec2,
    yaw: f32,
    action: Action,
    stage: Stage,
}

enum Stage {
    Walk,
    Enter { from: Vec2, yaw: f32, time: f32 },
    Act(f32),
    Return,
    Hold,
}

fn position(transform: &Transform) -> Vec2 {
    transform.translation.xz()
}

fn grid(point: Vec2) -> IVec2 {
    (point + Vec2::splat(WIDTH / 2.)).floor().as_ivec2()
}

fn index(cell: IVec2) -> Option<usize> {
    (cell.cmpge(IVec2::ZERO).all() && cell.cmplt(IVec2::splat(WIDTH as i32)).all())
        .then(|| (cell.y * WIDTH as i32 + cell.x) as usize)
}

fn route(from: Vec2, to: Vec2, blocked: &HashSet<IVec2>) -> Option<VecDeque<Vec2>> {
    let start = grid(from);
    let end = grid(to);
    let mut parents = vec![None; WIDTH as usize * WIDTH as usize];
    if blocked.contains(&start) || blocked.contains(&end) {
        return None;
    }
    parents[index(start)?] = Some(start);
    index(end)?;
    let mut queue = VecDeque::from([start]);
    while let Some(cell) = queue.pop_front() {
        if cell == end {
            let mut path = VecDeque::from([to]);
            let mut current = end;
            while current != start {
                path.push_front(current.as_vec2() - Vec2::splat(WIDTH / 2. - 0.5));
                current = parents[index(current)?]?;
            }
            return Some(path);
        }
        for delta in [IVec2::X, IVec2::NEG_X, IVec2::Y, IVec2::NEG_Y] {
            let next = cell + delta;
            if let Some(i) = index(next)
                && parents[i].is_none()
                && !blocked.contains(&next)
            {
                parents[i] = Some(cell);
                queue.push_back(next);
            }
        }
    }
    None
}

fn slots(target: &Prop, models: &WorkshopCatalog, joined: bool) -> Vec<(Vec2, Vec2, f32)> {
    use std::f32::consts::PI;
    let [w, d] = models.0[&target.asset].size.map(|n| n as f32);
    let depth = d + 1.3;
    let local = match target.asset.as_str() {
        "garden-bench" => vec![(Vec2::ZERO, Vec2::new(0., depth.max(1.5)), 0.)],
        "shed" => vec![(Vec2::new(0., -0.4), Vec2::new(0., depth.max(1.6)), 0.)],
        "picnic-table" => vec![(Vec2::new(0., 0.85), Vec2::new(0., depth.max(1.7)), PI)],
        "hammock" => vec![(Vec2::new(-0.15, 0.), Vec2::new(-0.15, depth.max(1.7)), 0.)],
        "seedling-bench" => vec![(Vec2::new(0., 0.74), Vec2::new(0., depth), PI)],
        "workshop" => vec![(Vec2::new(-2.3, 0.95), Vec2::new(0., depth), PI)],
        "kitchen" => vec![(Vec2::new(-1., -2.3), Vec2::new(0., depth), PI)],
        "wash-station" => vec![(Vec2::new(0., 0.52), Vec2::new(0., depth), PI)],
        "produce-crates" => vec![(Vec2::new(0.35, 0.85), Vec2::new(0.35, depth), PI)],
        "garden" => [Vec2::NEG_X, Vec2::X, Vec2::NEG_Y, Vec2::Y]
            .into_iter()
            .flat_map(|normal| {
                let boundary = normal * Vec2::new(w, d);
                let sideways = normal.perp();
                let half = sideways.abs().dot(Vec2::new(w, d)) as i32;
                let offsets = if joined {
                    (-half + 1..half).step_by(2).collect()
                } else {
                    vec![0]
                };
                offsets.into_iter().map(move |offset| {
                    let edge = boundary + sideways * offset as f32;
                    (
                        edge + normal * 0.45,
                        edge + normal * 1.3,
                        (-normal.x).atan2(-normal.y),
                    )
                })
            })
            .collect(),
        _ => vec![],
    };
    let angle = (target.rotation as f32).to_radians();
    let center = target.center(models).xz();
    let world = |point| center + Vec2::from_angle(-angle).rotate(point);
    local
        .into_iter()
        .map(|(at, approach, yaw)| (world(at), world(approach), yaw + angle))
        .collect()
}

pub(super) fn tick(
    mut garden: ResMut<Garden>,
    mut rehearsal: ResMut<Rehearsal>,
    models: Res<WorkshopCatalog>,
    time: Res<Time>,
    keys: Res<ButtonInput<KeyCode>>,
    buttons: Query<(&Interaction, &GardenAction), Changed<Interaction>>,
    mut actors: Query<(Entity, &GardenProp, &mut Transform, &mut RehearsalPose)>,
) {
    use KeyCode::*;
    if garden.search.is_some() || garden.coordinates.is_some() {
        return;
    }
    let click = |action| {
        buttons
            .iter()
            .any(|(&interaction, &button)| interaction == Interaction::Pressed && button == action)
    };
    let nearby = keys.just_pressed(KeyY) || click(GardenAction::Nearby);
    let start = keys.just_pressed(KeyU) || nearby || click(GardenAction::Send);
    let stopped =
        garden.terrain_dirty || keys.just_pressed(Escape) || click(GardenAction::Stop) || start;
    if stopped && let Some(task) = rehearsal.task.take() {
        if let Ok((_, _, mut transform, mut pose)) = actors.get_mut(task.actor) {
            *transform = task.home;
            pose.0 = Motion::Idle;
        }
        garden.status.clear();
    }
    let selected = garden.selected.map(|i| garden.layout.props[i].clone());
    let options = selected
        .as_ref()
        .map_or(&[][..], |prop| actions(&prop.asset));
    let mut residents: Vec<_> = garden
        .layout
        .props
        .iter()
        .filter(|prop| resident_model(&prop.asset).is_some())
        .collect();
    residents.sort_by_key(|prop| (&prop.asset, &prop.id));
    if (keys.just_pressed(KeyI) || click(GardenAction::Resident)) && !residents.is_empty() {
        rehearsal.actor = (rehearsal.actor + 1) % residents.len();
    }
    if keys.just_pressed(KeyO) || click(GardenAction::Interaction) {
        rehearsal.action = rehearsal.action.wrapping_add(1);
    }
    if keys.just_pressed(KeyP) || click(GardenAction::PlayPause) {
        rehearsal.paused = !rehearsal.paused;
    }
    if start
        && let (Some(target), Some(resident), Some(action)) = (
            selected.as_ref(),
            residents.get(rehearsal.actor % residents.len().max(1)),
            options.get(rehearsal.action % options.len().max(1)),
        )
        && let Some((entity, _, mut transform, mut pose)) = actors
            .iter_mut()
            .find(|(_, marker, _, _)| marker.id == resident.id)
    {
        let mut blocked = HashSet::new();
        let mut final_blocked = HashSet::new();
        for prop in &garden.layout.props {
            let category = models.0[&prop.asset].category.as_str();
            if matches!(category, "Terrain" | "Crops") || prop.id == resident.id {
                continue;
            }
            if resident_model(&prop.asset).is_some() {
                let cell = grid(prop.center(&models).xz());
                blocked.insert(cell);
                final_blocked.insert(cell);
                continue;
            }
            let [w, d] = prop.size(&models);
            for x in prop.column * 2..prop.column * 2 + (2 * w).max(1) {
                for z in prop.row * 2..prop.row * 2 + (2 * d).max(1) {
                    let cell = IVec2::new(x, z);
                    blocked.insert(cell);
                    if prop.id != target.id {
                        final_blocked.insert(cell);
                    }
                }
            }
        }
        let best = slots(target, &models, garden.connections.contains_key(&target.id))
            .into_iter()
            .filter_map(|(at, approach, yaw)| {
                let from = if nearby {
                    approach + (approach - at).normalize_or_zero()
                } else {
                    position(&transform)
                };
                let clear = (0..=20).all(|step| {
                    let cell = grid(approach.lerp(at, step as f32 / 20.));
                    index(cell).is_some() && !final_blocked.contains(&cell)
                });
                if !clear {
                    return None;
                }
                route(from, approach, &blocked).map(|path| (path, from, at, yaw))
            })
            .min_by_key(|(path, _, _, _)| path.len());
        if let Some((path, from, at, yaw)) = best {
            let mut reverse: VecDeque<_> = path.iter().rev().copied().collect();
            reverse.push_back(from);
            let home = *transform;
            transform.translation =
                Vec3::new(from.x, garden.terrain.height(from.x, from.y), from.y);
            pose.0 = Motion::Walk;
            rehearsal.paused = false;
            rehearsal.task = Some(Task {
                actor: entity,
                home,
                path,
                reverse,
                at,
                yaw,
                action: *action,
                stage: Stage::Walk,
            });
            garden.status = format!("Walking to {}", models.0[&target.asset].name);
        } else {
            garden.status = "No clear approach to this prop.".into();
        }
    }
    let paused = rehearsal.paused;
    for (_, _, _, mut pose) in &mut actors {
        pose.1 = paused;
    }
    let Some(task) = rehearsal.task.as_mut().filter(|_| !paused) else {
        return;
    };
    let Ok((_, _, mut transform, mut pose)) = actors.get_mut(task.actor) else {
        return;
    };
    let dt = time.delta_secs().min(0.1);
    let mut point = position(&transform);
    match &mut task.stage {
        Stage::Walk | Stage::Return => {
            let mut distance = dt * 1.25;
            while let Some(&next) = task.path.front().filter(|_| distance > 0.) {
                let delta = next - point;
                let length = delta.length();
                if length > 0.0001 {
                    transform.rotation = Quat::from_rotation_y(delta.x.atan2(delta.y));
                    point += delta / length * length.min(distance);
                }
                distance -= length;
                if distance >= 0. {
                    task.path.pop_front();
                }
            }
            if task.path.is_empty() {
                if matches!(task.stage, Stage::Return) {
                    task.stage = Stage::Hold;
                    pose.0 = Motion::Carry;
                    garden.status = "Holding the sample crate. Esc resets the resident.".into();
                } else {
                    let (yaw, _, _) = transform.rotation.to_euler(EulerRot::YXZ);
                    task.stage = Stage::Enter {
                        from: point,
                        yaw,
                        time: 0.,
                    };
                    pose.0 = task.action.1;
                }
            }
        }
        Stage::Enter { from, yaw, time } => {
            *time += dt;
            let t = (*time / 0.8).min(1.);
            let smooth = t * t * t * (t * (t * 6. - 15.) + 10.);
            point = from.lerp(task.at, smooth);
            transform.rotation =
                Quat::from_rotation_y(*yaw).slerp(Quat::from_rotation_y(task.yaw), smooth);
            if t == 1. {
                task.stage = Stage::Act(0.);
                garden.status = format!("{} · rehearsal running", task.action.0);
            }
        }
        Stage::Act(elapsed) => {
            *elapsed += dt;
            if task.action.1 == Motion::Carry && *elapsed > 1.2 {
                task.path = std::mem::take(&mut task.reverse);
                task.stage = Stage::Return;
                pose.0 = Motion::CarryWalk;
                garden.status = "Carrying the sample crate back".into();
            }
        }
        Stage::Hold => {}
    }
    transform.translation = Vec3::new(point.x, garden.terrain.height(point.x, point.y), point.y);
}

pub(super) fn hint(
    rehearsal: &Rehearsal,
    props: &[Prop],
    target: Option<&Prop>,
    models: &WorkshopCatalog,
) -> String {
    let Some(target) = target else {
        return String::new();
    };
    let actions = actions(&target.asset);
    if actions.is_empty() {
        return String::new();
    }
    let mut residents: Vec<_> = props
        .iter()
        .filter(|prop| resident_model(&prop.asset).is_some())
        .collect();
    residents.sort_by_key(|prop| (&prop.asset, &prop.id));
    match (
        residents.get(rehearsal.actor % residents.len().max(1)),
        actions.get(rehearsal.action % actions.len().max(1)),
    ) {
        (Some(actor), Some(action)) => format!(
            "\nI resident: {}   O action: {}\nU send   Y rehearse nearby   P {}   Esc reset",
            models.0[&actor.asset].name,
            action.0,
            if rehearsal.paused { "resume" } else { "pause" }
        ),
        _ => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nearby_rehearsal_enters_the_pose_and_escape_restores_the_resident() {
        verify_nearby_rehearsal(false);
    }

    #[test]
    fn rehearsal_buttons_enter_and_reset_the_pose() {
        verify_nearby_rehearsal(true);
    }

    fn verify_nearby_rehearsal(use_buttons: bool) {
        let models = WorkshopCatalog::default();
        let layout = Layout::decode(r#"{"format":"solar-friends-scene","version":1,"props":[{"id":"seat","asset":"garden-bench","column":47,"row":47,"rotation":0},{"id":"actor","asset":"iara","column":49,"row":50,"rotation":0}]}"#, &models).unwrap();
        let resident = &layout.props[1];
        let home = Transform::from_translation(resident.center(&models));
        let mut app = App::new();
        let actor = app
            .world_mut()
            .spawn((
                GardenProp {
                    id: resident.id.clone(),
                    model: models.0[&resident.asset].model,
                    shared_inverter: false,
                },
                home,
                RehearsalPose(Motion::Idle, false),
            ))
            .id();
        app.insert_resource(models)
            .insert_resource(Garden {
                gallery: layout.clone(),
                layout,
                past: vec![],
                future: vec![],
                selected: Some(0),
                pending: None,
                file: PathBuf::new(),
                autosave: None,
                persistence: String::new(),
                save_dirty: false,
                status: String::new(),
                redraw: false,
                terrain_dirty: false,
                focus_on_load: false,
                terrain: Terrain::default(),
                connections: HashMap::new(),
                library: vec![],
                search: None,
                coordinates: None,
                target: Vec3::ZERO,
                bearing: 0.,
                zoom: 1.,
                grid: false,
                night: false,
            })
            .init_resource::<Time>()
            .init_resource::<ButtonInput<KeyCode>>()
            .init_resource::<Rehearsal>()
            .add_systems(Update, tick);
        if use_buttons {
            app.world_mut().resource_mut::<Rehearsal>().paused = true;
            app.world_mut()
                .spawn((GardenAction::Nearby, Interaction::Pressed));
        } else {
            app.world_mut()
                .resource_mut::<ButtonInput<KeyCode>>()
                .press(KeyCode::KeyY);
        }
        app.update();
        app.world_mut()
            .resource_mut::<ButtonInput<KeyCode>>()
            .reset_all();
        for _ in 0..40 {
            app.world_mut()
                .resource_mut::<Time>()
                .advance_by(std::time::Duration::from_millis(100));
            app.update();
        }
        assert!(
            app.world()
                .resource::<Garden>()
                .status
                .contains("rehearsal running")
        );
        assert!(app.world().get::<RehearsalPose>(actor).unwrap().0 == Motion::Sit);
        assert_ne!(app.world().get::<Transform>(actor), Some(&home));
        if use_buttons {
            app.world_mut()
                .spawn((GardenAction::Stop, Interaction::Pressed));
        } else {
            app.world_mut()
                .resource_mut::<ButtonInput<KeyCode>>()
                .press(KeyCode::Escape);
        }
        app.update();
        assert_eq!(app.world().get::<Transform>(actor), Some(&home));
        assert!(app.world().get::<RehearsalPose>(actor).unwrap().0 == Motion::Idle);
    }

    #[test]
    fn rehearsal_uses_rotated_anchors_and_walks_around_a_prop() {
        let models = WorkshopCatalog::default();
        let mut bench = Prop {
            id: "bench".into(),
            asset: "garden-bench".into(),
            column: 45,
            row: 45,
            rotation: 0,
        };
        let unturned = slots(&bench, &models, false)[0];
        let unturned_direction = unturned.1 - unturned.0;
        bench.rotation = 90;
        let turned = slots(&bench, &models, false)[0];
        assert!((turned.1 - turned.0 - Vec2::new(unturned_direction.y, 0.)).length() < 0.00001);

        let from = Vec2::new(-1.5, 0.5);
        let to = Vec2::new(1.5, 0.5);
        let blocked = HashSet::from([grid(Vec2::new(0.5, 0.5))]);
        let path = route(from, to, &blocked).unwrap();
        assert!(path.iter().all(|point| !blocked.contains(&grid(*point))));
        assert_eq!(path.back(), Some(&to));
        assert!(route(from, to, &HashSet::from([grid(to)])).is_none());
    }
}
