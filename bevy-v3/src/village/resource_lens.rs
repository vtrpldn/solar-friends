use bevy::prelude::*;

use super::*;
use crate::gathering::ResourceStatus;

pub(super) fn draw(
    village: &Village,
    setup: &WorldSetup,
    terrain: &crate::terrain::Terrain,
    catalog: &Catalog,
    land: &Land,
    (hovered, ecology): (Option<GroundHit>, bool),
    gizmos: &mut Gizmos,
) -> String {
    use std::fmt::Write;

    let cell = hovered.map(|hit| hit.cell);
    let hovered_site = cell.and_then(|cell| land.site_at(cell));
    let mut legend = if ecology {
        "Ecology · Green standing or available · Gold queued or recovering · Gray cleared or depleted · Blue cultivated"
    } else {
        "Resources · Green available · Gold queued or recovering · Gray depleted"
    }
    .to_owned();
    for (index, site) in land.sites() {
        let status = village.construction.gathering.resource_status(
            index,
            site,
            catalog,
            (setup.seed(), setup.richness(), village.clock),
        );
        if !ecology && matches!(status, ResourceStatus::Cleared) {
            continue;
        }
        let color = match status {
            ResourceStatus::Cleared | ResourceStatus::Exhausted => Color::srgb_u8(147, 146, 140),
            ResourceStatus::Queued | ResourceStatus::Recovering(_) => Color::srgb_u8(243, 200, 108),
            _ => Color::srgb_u8(136, 220, 148),
        };
        draw_marker(terrain, site.position, site.size, color, gizmos);
        if hovered_site == Some(index) {
            let detail = if ecology && site.recipe() == "fell_tree" {
                match status {
                    ResourceStatus::Cleared => {
                        "Cleared tree · Does not regrow automatically".into()
                    }
                    ResourceStatus::Queued => "Tree marked for felling".into(),
                    _ => "Standing tree".into(),
                }
            } else {
                let recipe = &catalog.gathering[site.recipe()];
                let mut detail = format!("{} · {status}", recipe.name);
                if !ecology && !matches!(status, ResourceStatus::Exhausted) {
                    // The same measure the site card and stores use, e.g. 160 kg.
                    for (material, units) in &recipe.output {
                        let material = &catalog.materials[material];
                        let _ = write!(
                            detail,
                            " · {} {} per gather",
                            material.quantity_text(u64::from(*units)),
                            material.name.to_lowercase()
                        );
                    }
                }
                detail
            };
            let _ = write!(legend, "\n{detail}");
        }
    }
    if ecology {
        for (name, position, size, finished) in village.construction.cultivated_sites(catalog) {
            let (color, detail) = if finished {
                (Color::srgb_u8(109, 220, 255), "Cultivated land")
            } else {
                (
                    Color::srgb_u8(243, 200, 108),
                    "Cultivation site under construction",
                )
            };
            draw_marker(terrain, position, size, color, gizmos);
            if cell
                .is_some_and(|cell| cell.cmpge(position).all() && cell.cmplt(position + size).all())
            {
                let _ = write!(legend, "\n{name} · {detail}");
            }
        }
    }
    legend
}

fn draw_marker(
    terrain: &crate::terrain::Terrain,
    position: IVec2,
    size: IVec2,
    color: Color,
    gizmos: &mut Gizmos,
) {
    let center = position.as_vec2() + (size.as_vec2() - Vec2::ONE) * 0.5;
    let Vec2 { x, y: z } = world_position(center.x, center.y);
    let point = Vec3::new(x, terrain.height_at(x, z), z);
    let tip = point + Vec3::Y * 4.0;
    gizmos.line(point + Vec3::Y * 0.2, tip, color);
    for axis in [Vec3::X, Vec3::Z] {
        gizmos.line(tip - axis * 0.7, tip + axis * 0.7, color);
    }
}
