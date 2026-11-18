use bevy::prelude::*;

use super::*;
use crate::gathering::ResourceStatus;

pub(super) fn draw(
    village: &Village,
    setup: &WorldSetup,
    terrain: &crate::terrain::Terrain,
    catalog: &Catalog,
    land: &Land,
    hovered: Option<GroundHit>,
    gizmos: &mut Gizmos,
) -> String {
    let hovered = hovered.and_then(|hit| land.site_at(hit.cell));
    let mut legend =
        String::from("Resources · Green available · Gold queued or recovering · Gray depleted");
    for (index, site) in land.sites() {
        let status = village.construction.gathering.resource_status(
            index,
            site,
            catalog,
            (setup.seed(), setup.richness(), village.clock),
        );
        let color = match status {
            ResourceStatus::Cleared | ResourceStatus::Exhausted => Color::srgb_u8(147, 146, 140),
            ResourceStatus::Queued | ResourceStatus::Recovering(_) => Color::srgb_u8(243, 200, 108),
            _ => Color::srgb_u8(136, 220, 148),
        };
        let center = site.position.as_vec2() + (site.size.as_vec2() - Vec2::ONE) * 0.5;
        let Vec2 { x, y: z } = world_position(center.x, center.y);
        let point = Vec3::new(x, terrain.height_at(x, z), z);
        let tip = point + Vec3::Y * 4.0;
        gizmos.line(point + Vec3::Y * 0.2, tip, color);
        for axis in [Vec3::X, Vec3::Z] {
            gizmos.line(tip - axis * 0.7, tip + axis * 0.7, color);
        }
        if hovered == Some(index) {
            use std::fmt::Write;
            let _ = write!(
                legend,
                "\n{} · {status}",
                catalog.gathering[site.recipe()].name
            );
        }
    }
    legend
}
