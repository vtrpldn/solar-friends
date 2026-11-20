use std::collections::BTreeMap;

use bevy::prelude::*;

use super::{Village, VillageEntity, building_model, road_surface::RoadSurface};
use crate::{catalog::Catalog, setup::WorldSetup};

#[derive(Component)]
pub(super) struct ConstructionModel {
    pub(super) project: usize,
    scene: usize,
}

pub(super) fn show_in_progress(
    mut commands: Commands,
    setup: Res<WorldSetup>,
    village: Res<Village>,
    catalog: Res<Catalog>,
    assets: Res<AssetServer>,
    mut displayed: Query<(Entity, &ConstructionModel, &mut Transform)>,
) {
    if setup.open || village.camp.is_none() || !village.is_changed() {
        return;
    }
    let terrain = village.terrain(&setup);
    let mut desired: BTreeMap<_, _> = village
        .construction
        .construction_models(&catalog)
        .map(|(project, scene, position, yaw)| {
            let place = Transform::from_xyz(
                position.x,
                terrain.height_at(position.x, position.y),
                position.y,
            )
            .with_rotation(Quat::from_rotation_y(yaw));
            (project, (scene, place))
        })
        .collect();

    for (entity, model, mut transform) in &mut displayed {
        if let Some(&(scene, place)) = desired.get(&model.project)
            && scene == model.scene
        {
            transform.set_if_neq(place);
            desired.remove(&model.project);
        } else {
            commands.entity(entity).despawn();
        }
    }
    for (project, (scene, place)) in desired {
        let mut entity = commands.spawn((
            VillageEntity,
            ConstructionModel { project, scene },
            building_model(&assets, scene),
            place,
        ));
        if village.construction.is_road(project) {
            entity.insert(RoadSurface);
        }
    }
}
