//! Small rendered portraits of building models for menus and panels.
//!
//! Each slot owns an offscreen camera on its own render layer. A slot's camera only runs
//! while a menu shows that slot, and it frames the model once its scene has loaded.

use bevy::{
    camera::{
        ClearColorConfig, RenderTarget, ScalingMode, primitives::MeshAabb, visibility::RenderLayers,
    },
    render::render_resource::TextureFormat,
    scene::SceneInstanceReady,
    transform::helper::TransformHelper,
};

use super::*;

/// One slot per build-menu row, plus one for the selected building.
pub(super) const SLOTS: usize = crate::construction::BUILD_ROWS + 1;
pub(super) const SELECTED_SLOT: usize = SLOTS - 1;
/// Keeps thumbnail layers clear of the village scene, which renders on layer 0.
const FIRST_LAYER: usize = 20;

#[derive(Resource)]
pub(super) struct Thumbnails {
    pub(super) images: [Handle<Image>; SLOTS],
    shown: [Option<usize>; SLOTS],
}

/// A UI image that shows whatever model its slot is rendering.
#[derive(Component)]
pub(super) struct ThumbnailImage(pub(super) usize);

#[derive(Component)]
struct ThumbnailCamera(usize);

#[derive(Component)]
struct ThumbnailModel(usize);

pub(super) fn install(app: &mut App) {
    app.add_systems(Startup, spawn)
        .add_observer(frame_model)
        .add_systems(
            Update,
            (show_models, fill_images).chain().after(village_input),
        );
}

fn layer(slot: usize) -> RenderLayers {
    RenderLayers::layer(FIRST_LAYER + slot)
}

fn spawn(mut commands: Commands, mut images: ResMut<Assets<Image>>) {
    commands.spawn((
        Name::new("Thumbnail light"),
        DirectionalLight {
            illuminance: 12_000.,
            color: Color::srgb_u8(255, 240, 214),
            ..default()
        },
        Transform::from_xyz(-6., 18., 7.).looking_at(Vec3::ZERO, Vec3::Y),
        RenderLayers::from_layers(&(FIRST_LAYER..FIRST_LAYER + SLOTS).collect::<Vec<_>>()),
    ));
    let images = std::array::from_fn(|slot| {
        let image = images.add(Image::new_target_texture(
            160,
            120,
            TextureFormat::Rgba8UnormSrgb,
            None,
        ));
        commands.spawn((
            Name::new("Thumbnail camera"),
            ThumbnailCamera(slot),
            Camera3d::default(),
            Camera {
                order: -10 - slot as isize,
                is_active: false,
                clear_color: ClearColorConfig::Custom(Color::srgb_u8(46, 63, 49)),
                ..default()
            },
            Projection::Orthographic(OrthographicProjection::default_3d()),
            RenderTarget::Image(image.clone().into()),
            Transform::from_xyz(30., 30., 30.).looking_at(Vec3::ZERO, Vec3::Y),
            layer(slot),
        ));
        image
    });
    commands.insert_resource(Thumbnails {
        images,
        shown: [None; SLOTS],
    });
}

/// The model each slot should show this frame.
fn wanted_models(
    setup: &WorldSetup,
    village: &Village,
    catalog: &Catalog,
    saves: &SaveMenu,
    sound: &SoundSettings,
    picker: &toolbar::PanelPicker,
) -> [Option<usize>; SLOTS] {
    let mut wanted = [None; SLOTS];
    if build_menu::visible(setup, village, saves, sound) {
        for (slot, (_, project)) in village
            .construction
            .build_rows(catalog)
            .into_iter()
            .enumerate()
            .take(SELECTED_SLOT)
        {
            wanted[slot] = Some(project.model);
        }
    }
    if !picker.open {
        wanted[SELECTED_SLOT] = village.selected_building_model(catalog);
    }
    wanted
}

fn show_models(
    mut commands: Commands,
    (setup, village, catalog): (Res<WorldSetup>, Res<Village>, Res<Catalog>),
    (saves, sound, assets): (Res<SaveMenu>, Res<SoundSettings>, Res<AssetServer>),
    picker: Res<toolbar::PanelPicker>,
    mut thumbnails: ResMut<Thumbnails>,
    models: Query<(Entity, &ThumbnailModel)>,
    mut cameras: Query<(&ThumbnailCamera, &mut Camera)>,
) {
    let wanted = wanted_models(&setup, &village, &catalog, &saves, &sound, &picker);
    for (camera, mut settings) in &mut cameras {
        let active = wanted[camera.0].is_some();
        if settings.is_active != active {
            settings.is_active = active;
        }
    }
    if wanted == thumbnails.shown {
        return;
    }
    for (entity, model) in &models {
        if wanted[model.0] != thumbnails.shown[model.0] {
            commands.entity(entity).despawn();
        }
    }
    for (slot, (&model, &shown)) in wanted.iter().zip(&thumbnails.shown).enumerate() {
        if model == shown {
            continue;
        }
        if let Some(model) = model {
            commands.spawn((
                Name::new("Thumbnail model"),
                ThumbnailModel(slot),
                building_model(&assets, model),
                Transform::default(),
                layer(slot),
            ));
        }
    }
    thumbnails.shown = wanted;
}

fn fill_images(
    thumbnails: Res<Thumbnails>,
    mut images: Query<(&ThumbnailImage, &mut ImageNode, &mut Node)>,
) {
    for (slot, mut image, mut node) in &mut images {
        if image.image != thumbnails.images[slot.0] {
            image.image = thumbnails.images[slot.0].clone();
        }
        let display = if thumbnails.shown[slot.0].is_some() {
            Display::Flex
        } else {
            Display::None
        };
        if node.display != display {
            node.display = display;
        }
    }
}

/// Moves a loaded model onto its slot's layer and fits the slot camera around it.
fn frame_model(
    event: On<SceneInstanceReady>,
    mut commands: Commands,
    roots: Query<&ThumbnailModel>,
    children: Query<&Children>,
    (handles, meshes): (Query<&Mesh3d>, Res<Assets<Mesh>>),
    transforms: TransformHelper,
    cameras: Query<(Entity, &ThumbnailCamera)>,
) {
    let Ok(model) = roots.get(event.entity) else {
        return;
    };
    let mut low = Vec3::splat(f32::INFINITY);
    let mut high = Vec3::splat(f32::NEG_INFINITY);
    for child in children.iter_descendants(event.entity) {
        commands.entity(child).insert(layer(model.0));
        let Some(bounds) = handles
            .get(child)
            .ok()
            .and_then(|handle| meshes.get(&handle.0))
            .and_then(MeshAabb::compute_aabb)
        else {
            continue;
        };
        let Ok(transform) = transforms.compute_global_transform(child) else {
            continue;
        };
        for corner in 0..8 {
            let sign = Vec3A::new(
                if corner & 1 == 0 { -1. } else { 1. },
                if corner & 2 == 0 { -1. } else { 1. },
                if corner & 4 == 0 { -1. } else { 1. },
            );
            let point =
                transform.transform_point(Vec3::from(bounds.center + bounds.half_extents * sign));
            low = low.min(point);
            high = high.max(point);
        }
    }
    if !(low.is_finite() && high.is_finite()) {
        return;
    }
    let (center, span) = thumbnail_frame(low, high);
    if let Some((camera, _)) = cameras.iter().find(|(_, camera)| camera.0 == model.0) {
        commands.entity(camera).insert((
            Projection::Orthographic(OrthographicProjection {
                scaling_mode: ScalingMode::FixedVertical {
                    viewport_height: span,
                },
                ..OrthographicProjection::default_3d()
            }),
            Transform::from_translation(center + Vec3::new(6., 4.5, 7.).normalize() * 60.)
                .looking_at(center, Vec3::Y),
        ));
    }
}

/// Centre and visible height that keep a model's bounds inside a 4:3 frame.
fn thumbnail_frame(low: Vec3, high: Vec3) -> (Vec3, f32) {
    let size = high - low;
    let span = (size.max_element() * 1.05).max(1.0);
    ((low + high) * 0.5, span)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn framing_fits_the_largest_side_of_a_model() {
        let (center, span) = thumbnail_frame(Vec3::new(-2., 0., -1.), Vec3::new(2., 3., 1.));
        assert_eq!(center, Vec3::new(0., 1.5, 0.));
        assert!((span - 4.2).abs() < 1e-5);
        let (_, tiny) = thumbnail_frame(Vec3::ZERO, Vec3::splat(0.1));
        assert_eq!(tiny, 1.0);
    }
}
