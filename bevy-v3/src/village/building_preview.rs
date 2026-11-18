use bevy::{light::NotShadowCaster, scene::SceneInstanceReady};

use super::*;

#[derive(Component)]
struct BuildingPreview(usize);

pub(super) fn install(app: &mut App) {
    app.add_observer(fade_preview)
        .add_systems(Update, show_preview.after(village_input));
}

fn show_preview(
    mut commands: Commands,
    (setup, village, pointer, catalog): (
        Res<WorldSetup>,
        Res<Village>,
        Res<CampPointer>,
        Res<Catalog>,
    ),
    assets: Res<AssetServer>,
    mut current: Query<(Entity, &BuildingPreview, &mut Transform)>,
) {
    let preview = pointer
        .hovered
        .filter(|_| {
            !setup.open
                && village.camp.is_some()
                && !village.terrain_editor.open
                && !village.planning_roads()
        })
        .and_then(|hit| {
            let terrain = village.terrain(&setup);
            village
                .construction
                .preview_model(&catalog, &terrain, hit.cell)
        });
    if let Ok((entity, shown, mut transform)) = current.single_mut() {
        if let Some((model, pose)) = &preview
            && shown.0 == *model
        {
            transform.set_if_neq(*pose);
            return;
        }
        commands.entity(entity).despawn();
    }
    if let Some((model, pose)) = preview {
        commands.spawn((
            BuildingPreview(model),
            Name::new("Building placement preview"),
            building_model(&assets, model),
            pose,
        ));
    }
}

fn fade_preview(
    event: On<SceneInstanceReady>,
    mut commands: Commands,
    previews: Query<(), With<BuildingPreview>>,
    descendants: Query<&Children>,
    meshes: Query<&MeshMaterial3d<StandardMaterial>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    if !previews.contains(event.entity) {
        return;
    }
    let mut copies = std::collections::HashMap::new();
    for entity in descendants.iter_descendants(event.entity) {
        let Ok(original) = meshes.get(entity) else {
            continue;
        };
        let faded = if let Some(handle) = copies.get(&original.id()) {
            Handle::clone(handle)
        } else {
            let Some(mut faded) = materials.get(original.id()).cloned() else {
                continue;
            };
            faded.alpha_mode = AlphaMode::Blend;
            faded.base_color = faded.base_color.with_alpha(faded.base_color.alpha() * 0.5);
            let handle = materials.add(faded);
            copies.insert(original.id(), handle.clone());
            handle
        };
        commands
            .entity(entity)
            .insert((MeshMaterial3d(faded), NotShadowCaster));
    }
}
