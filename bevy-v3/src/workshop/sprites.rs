use bevy::{
    camera::{ClearColorConfig, RenderTarget, ScalingMode, visibility::RenderLayers},
    mesh::VertexAttributeValues,
    prelude::*,
    render::render_resource::{Extent3d, TextureDimension, TextureFormat},
};

use super::*;

const SIZE: u32 = 512;
const FIRST_LAYER: usize = 1;
const TURNS: usize = 4;

#[derive(Resource)]
pub(super) struct SpriteCapture {
    frames: Vec<Frame>,
    destination: Destination,
    placement: serde_json::Value,
    warmup: Option<u8>,
    started: std::time::Instant,
    light: Entity,
}

enum Destination {
    File(std::path::PathBuf),
    Proof,
}

pub(super) struct SpriteProof {
    asset: String,
    night: bool,
    image: Handle<Image>,
    placement: serde_json::Value,
}

#[derive(Component)]
pub(super) struct ProofPanel;

pub(super) fn setup_proof(mut commands: Commands) {
    commands.spawn((
        ProofPanel,
        ImageNode::default(),
        Node {
            display: Display::None,
            position_type: PositionType::Absolute,
            left: vw(4.0),
            top: vh(32.0),
            width: vw(92.0),
            aspect_ratio: Some(TURNS as f32),
            ..default()
        },
        BackgroundColor(Color::srgb_u8(40, 54, 43)),
    ));
}

pub(super) fn show_proof(
    workshop: Res<Workshop>,
    mut proof: Single<(&mut Node, &mut ImageNode), With<ProofPanel>>,
) {
    let (node, image) = &mut *proof;
    if workshop.show_proof
        && let Some(sheet) = &workshop.proof
    {
        node.display = Display::Flex;
        if image.image != sheet.image {
            image.image = sheet.image.clone();
        }
    } else {
        node.display = Display::None;
    }
}

struct Frame {
    camera: Entity,
    model: Entity,
    image: Handle<Image>,
    pixels: Option<Vec<u8>>,
    pending: Option<Entity>,
}

#[derive(Component)]
pub(super) struct SpriteModel(usize);

fn framing(points: impl Iterator<Item = Vec3>) -> f32 {
    let view = orbit_camera(0.0, 30.0, Vec3::ZERO);
    let mut fit = 1.0_f32;
    for point in points {
        for turn in 0..TURNS {
            let rotation = Quat::from_rotation_y(turn as f32 * std::f32::consts::FRAC_PI_2);
            let point = rotation * point;
            let x = view.right().dot(point);
            let y = view.up().dot(point);
            fit = fit.max(x.abs() * 96.0 / SIZE as f32 / 0.94);
            fit = fit.max(y * 96.0 / SIZE as f32 / 1.44);
            fit = fit.max(-y * 96.0 / SIZE as f32 / 0.44);
        }
    }
    48.0 / fit
}

fn placement(id: &str, size: [i32; 2], light: &str, ppm: f32) -> serde_json::Value {
    serde_json::json!({
        "schema": "solar-friends.v3.sprite-study.v1",
        "asset": id,
        "light": light,
        "units": "metres",
        "cellMetres": 2,
        "pixelsPerMetre": ppm,
        "camera": {
            "projection": "orthographic",
            "groundRatio": "2:1",
            "elevationDegrees": 30,
            "azimuthDegrees": 45,
        },
        "sheet": { "width": SIZE * TURNS as u32, "height": SIZE },
        "frames": (0..TURNS).map(|turn| serde_json::json!({
            "rotation": turn * 90,
            "x": turn as u32 * SIZE, "y": 0,
            "width": SIZE, "height": SIZE,
            "anchor": [SIZE / 2, SIZE * 3 / 4],
            "footprint": if turn % 2 == 0 { size } else { [size[1], size[0]] },
        })).collect::<Vec<_>>(),
    })
}

type PreviewMesh<'a> = (&'a Mesh3d, &'a GlobalTransform, Option<&'a OriginalSurface>);

fn sheet_path(id: &str, light: &str) -> std::io::Result<std::path::PathBuf> {
    crate::save::location(crate::setup::Mode::Story).and_then(|save| {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(std::io::Error::other)?;
        let dir = save.with_file_name("workshop");
        std::fs::create_dir_all(&dir)?;
        Ok(dir.join(format!("{id}-{light}-sprites-{}.png", stamp.as_nanos())))
    })
}

pub(super) fn start(
    (mut commands, keys): (Commands, Res<ButtonInput<KeyCode>>),
    (pending, capture): (Query<(), With<Screenshot>>, Option<Res<SpriteCapture>>),
    (mut workshop, catalog, assets): (ResMut<Workshop>, Res<Catalog>, Res<AssetServer>),
    (meshes, mut images): (Res<Assets<Mesh>>, ResMut<Assets<Image>>),
    model: Query<(&SceneInstance, &GlobalTransform), With<WorkshopModel>>,
    scene_mesh: Query<PreviewMesh>,
    spawner: Res<SceneSpawner>,
) {
    let proof = keys.just_pressed(KeyCode::F7);
    let export = keys.just_pressed(KeyCode::F6);
    if !(proof || export) || workshop.search.is_some() || capture.is_some() || !pending.is_empty() {
        return;
    }
    if proof && workshop.show_proof {
        workshop.show_proof = false;
        return;
    }
    let id = &workshop.projects[workshop.selected];
    let light = if workshop.night { "night" } else { "day" };
    let destination = if proof {
        Destination::Proof
    } else {
        match sheet_path(id, light) {
            Ok(path) => Destination::File(path),
            Err(error) => {
                workshop.export_notice = format!("Could not prepare sprite export · {error}");
                return;
            }
        }
    };
    if let Some(cached) = &workshop.proof
        && cached.asset == *id
        && cached.night == workshop.night
        && let Some(image) = images.get(&cached.image)
    {
        match destination {
            Destination::Proof => workshop.show_proof = true,
            Destination::File(path) => {
                workshop.export_notice = export_notice(image, &cached.placement, &path);
            }
        }
        return;
    }
    let Ok((instance, root)) = model.single() else {
        workshop.export_notice = "Wait for the model to finish loading.".into();
        return;
    };
    if !spawner.instance_is_ready(**instance) {
        workshop.export_notice = "Wait for the model to finish loading.".into();
        return;
    }
    let inverse = root.affine().inverse();
    let ppm = framing(
        spawner
            .iter_instance_entities(**instance)
            .flat_map(|entity| {
                let Ok((mesh, transform, original)) = scene_mesh.get(entity) else {
                    return None;
                };
                let source = original.map_or(&mesh.0, |original| &original.mesh);
                let VertexAttributeValues::Float32x3(points) =
                    meshes.get(source)?.attribute(Mesh::ATTRIBUTE_POSITION)?
                else {
                    return None;
                };
                let transform = inverse * transform.affine();
                Some(
                    points
                        .iter()
                        .map(move |&point| transform.transform_point3(Vec3::from_array(point))),
                )
            })
            .flatten(),
    );
    let project = &catalog.projects[id];
    let mut frames = Vec::new();
    for turn in 0..TURNS {
        let layer = RenderLayers::layer(FIRST_LAYER + turn);
        let image = images.add(Image::new_target_texture(
            SIZE,
            SIZE,
            TextureFormat::Rgba8UnormSrgb,
            None,
        ));
        let camera = commands
            .spawn((
                Camera3d::default(),
                Camera {
                    order: -1 - turn as isize,
                    clear_color: ClearColorConfig::Custom(Color::NONE),
                    ..default()
                },
                RenderTarget::Image(image.clone().into()),
                Projection::Orthographic(OrthographicProjection {
                    scaling_mode: ScalingMode::FixedVertical {
                        viewport_height: SIZE as f32 / ppm,
                    },
                    viewport_origin: Vec2::new(0.5, 0.25),
                    ..OrthographicProjection::default_3d()
                }),
                orbit_camera(0.0, 30.0, Vec3::ZERO),
                layer,
            ))
            .id();
        let model = commands
            .spawn((
                SpriteModel(turn),
                building_model(&assets, project.model),
                Transform::from_rotation(Quat::from_rotation_y(
                    turn as f32 * std::f32::consts::FRAC_PI_2,
                )),
                Visibility::Hidden,
            ))
            .id();
        frames.push(Frame {
            camera,
            model,
            image,
            pixels: None,
            pending: None,
        });
    }
    let (illuminance, color, _, _) = lighting(workshop.night);
    let light_entity = commands
        .spawn((
            DirectionalLight {
                illuminance,
                color,
                ..default()
            },
            Transform::from_xyz(-8.0, 12.0, 6.0).looking_at(Vec3::ZERO, Vec3::Y),
            RenderLayers::from_layers(&[1, 2, 3, 4]),
        ))
        .id();
    commands.insert_resource(SpriteCapture {
        frames,
        destination,
        placement: placement(id, project.size, light, ppm),
        warmup: None,
        started: std::time::Instant::now(),
        light: light_entity,
    });
    workshop.export_notice = "Rendering four sprite views…".into();
}

pub(super) fn progress(
    mut commands: Commands,
    capture: Option<ResMut<SpriteCapture>>,
    (mut workshop, mut images): (ResMut<Workshop>, ResMut<Assets<Image>>),
    instances: Query<(&SceneInstance, &SpriteModel)>,
    spawner: Res<SceneSpawner>,
) {
    let Some(mut capture) = capture else {
        return;
    };
    if capture.started.elapsed() > std::time::Duration::from_secs(60) {
        workshop.export_notice = "Sprite export timed out before all four views rendered.".into();
        finish(&mut commands, &capture);
        return;
    }
    if capture.warmup.is_none() {
        if instances.iter().count() != TURNS
            || !instances
                .iter()
                .all(|(instance, _)| spawner.instance_is_ready(**instance))
        {
            return;
        }
        for (instance, model) in &instances {
            for entity in spawner.iter_instance_entities(**instance) {
                commands
                    .entity(entity)
                    .insert(RenderLayers::layer(FIRST_LAYER + model.0));
            }
            commands
                .entity(capture.frames[model.0].model)
                .insert(Visibility::Visible);
        }
        capture.warmup = Some(8);
    }
    if let Some(remaining) = &mut capture.warmup
        && *remaining > 0
    {
        *remaining -= 1;
        return;
    }
    let started = capture.started;
    for (index, frame) in capture.frames.iter_mut().enumerate() {
        if frame.pixels.is_none() && frame.pending.is_none() {
            frame.pending = Some(
                commands
                    .spawn(Screenshot::image(frame.image.clone()))
                    .observe(
                        move |event: On<ScreenshotCaptured>,
                              capture: Option<ResMut<SpriteCapture>>| {
                            let Some(mut capture) =
                                capture.filter(|capture| capture.started == started)
                            else {
                                return;
                            };
                            let frame = &mut capture.frames[index];
                            frame.pending = None;
                            if let Ok(image) = event.image.clone().try_into_dynamic() {
                                let pixels = image.into_rgba8().into_raw();
                                if pixels.as_chunks::<4>().0.iter().any(|pixel| pixel[3] != 0) {
                                    frame.pixels = Some(pixels);
                                }
                            }
                        },
                    )
                    .id(),
            );
        }
    }
    if !capture.frames.iter().all(|frame| frame.pixels.is_some()) {
        return;
    }
    let image = sheet_image(&capture);
    match &capture.destination {
        Destination::Proof => {
            workshop.show_proof = true;
            workshop.export_notice.clear();
        }
        Destination::File(path) => {
            workshop.export_notice = export_notice(&image, &capture.placement, path);
        }
    }
    workshop.proof = Some(SpriteProof {
        asset: workshop.projects[workshop.selected].clone(),
        night: workshop.night,
        image: images.add(image),
        placement: capture.placement.clone(),
    });
    finish(&mut commands, &capture);
}

fn finish(commands: &mut Commands, capture: &SpriteCapture) {
    commands.entity(capture.light).despawn();
    for frame in &capture.frames {
        if let Some(pending) = frame.pending {
            commands.entity(pending).try_despawn();
        }
        commands.entity(frame.model).despawn();
        commands.entity(frame.camera).despawn();
    }
    commands.remove_resource::<SpriteCapture>();
}

fn sheet_image(capture: &SpriteCapture) -> Image {
    let stride = SIZE as usize * 4;
    let mut bytes = Vec::with_capacity(stride * TURNS * SIZE as usize);
    for row in 0..SIZE as usize {
        for frame in &capture.frames {
            let pixels = frame.pixels.as_ref().expect("all frames captured");
            bytes.extend_from_slice(&pixels[row * stride..(row + 1) * stride]);
        }
    }
    Image::new(
        Extent3d {
            width: SIZE * TURNS as u32,
            height: SIZE,
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        bytes,
        TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::default(),
    )
}

fn export_notice(image: &Image, placement: &serde_json::Value, path: &std::path::Path) -> String {
    let write = || -> std::io::Result<()> {
        image
            .clone()
            .try_into_dynamic()
            .map_err(std::io::Error::other)?
            .save(path)
            .map_err(std::io::Error::other)?;
        let metadata = serde_json::to_vec_pretty(placement)?;
        crate::save::atomic_write(&path.with_extension("json"), &metadata, 8192)
    };
    match write() {
        Ok(()) => format!("Saved sprite sheet and placement JSON · {}", path.display()),
        Err(error) => format!("Sprite export failed · {error}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn placement_uses_fixed_anchor_and_rotates_the_footprint() {
        let info = placement(
            "test",
            [3, 8],
            "day",
            framing([Vec3::new(2.0, 0.0, 1.0)].into_iter()),
        );
        assert_eq!(info["pixelsPerMetre"], 48.0);
        assert_eq!(info["frames"][1]["anchor"], serde_json::json!([256, 384]));
        assert_eq!(info["frames"][1]["footprint"], serde_json::json!([8, 3]));
        assert_eq!(info["frames"][3]["x"], 1536);
        assert!(framing([Vec3::new(20.0, 0.0, 1.0)].into_iter()) < 48.0);
    }
}
