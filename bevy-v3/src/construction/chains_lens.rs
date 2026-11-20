use super::*;
use std::{collections::BTreeSet, fmt::Write};

impl Construction {
    pub fn draw_chains_lens(
        &self,
        catalog: &Catalog,
        terrain: &Terrain,
        (stock, land, clock): (&Stock, &Land, f64),
        material: &str,
        hovered: Option<IVec2>,
        gizmos: &mut Gizmos,
    ) -> String {
        let name = &catalog.materials[material].name;
        let mut label = format!(
            "Production chains · {name} · Shift+Page Up/Down Change material\nGreen producer · Gold consumer · Blue upstream or shared supplies\nLines show shared-stock relationships"
        );
        let mut upstream = BTreeSet::new();
        let mut pending = vec![material];
        while let Some(output) = pending.pop() {
            if upstream.insert(output) {
                for recipe in catalog
                    .production
                    .values()
                    .filter(|r| r.output.contains_key(output))
                {
                    pending.extend(recipe.input.keys().map(String::as_str));
                }
            }
        }

        let blue = Color::srgb_u8(109, 220, 255);
        let green = Color::srgb_u8(136, 220, 148);
        let gold = Color::srgb_u8(243, 200, 108);
        draw_lens_marker(terrain, STOCKPILE, IVec2::ONE, blue, gizmos);
        if hovered == Some(STOCKPILE) {
            let _ = write!(
                label,
                "\nShared supplies · {} {name} available",
                stock.available(material)
            );
        }
        let point_at = |cell: Vec2| {
            let Vec2 { x, y: z } = world_position(cell.x, cell.y);
            Vec3::new(x, terrain.height_at(x, z) + 0.5, z)
        };
        let draw_supply_link = |position: IVec2, size: IVec2, color, gizmos: &mut Gizmos| {
            let start = STOCKPILE.as_vec2();
            let end = position.as_vec2() + (size.as_vec2() - Vec2::ONE) * 0.5;
            let steps = start.distance(end).ceil().max(1.0) as usize;
            gizmos.linestrip(
                (0..=steps).map(|i| point_at(start.lerp(end, i as f32 / steps as f32))),
                color,
            );
        };
        for (index, plan) in self.plans.iter().enumerate() {
            if plan.removed {
                continue;
            }
            let def = &catalog.projects[&plan.key];
            let building = plan.work < def.work;
            let mut produces = false;
            let mut consumes = building && def.materials.contains_key(material);
            let mut inputs = BTreeSet::new();
            for recipe in catalog
                .production
                .values()
                .filter(|recipe| recipe.kind == def.kind)
            {
                produces |= recipe.output.contains_key(material);
                consumes |= recipe.input.contains_key(material);
                inputs.extend(
                    recipe
                        .output
                        .keys()
                        .filter(|id| id.as_str() != material && upstream.contains(id.as_str())),
                );
            }
            let color = if produces {
                green
            } else if consumes {
                gold
            } else if !inputs.is_empty() {
                blue
            } else {
                continue;
            };
            draw_lens_marker(terrain, plan.position, plan.size, color, gizmos);
            if produces || consumes {
                draw_supply_link(plan.position, plan.size, color, gizmos);
            }
            if hovered.is_some_and(|cell| {
                cell.cmpge(plan.position).all() && cell.cmplt(plan.position + plan.size).all()
            }) {
                let _ = write!(label, "\n{} #{}", def.name, index + 1);
                if produces {
                    label.push_str(" · Potential producer");
                }
                if consumes {
                    label.push_str(" · Consumer");
                }
                for id in inputs {
                    let _ = write!(label, " · Upstream: {}", catalog.materials[id].name);
                }
                if building {
                    let _ = write!(label, " · {}", self.project_status(catalog, index));
                } else {
                    let mut jobs = self.production.jobs.iter().filter(|job| job.site == index);
                    if let Some(first) = jobs.next() {
                        for job in std::iter::once(first).chain(jobs) {
                            let recipe = &catalog.production[&job.recipe];
                            let status = self.batch_status(job, catalog, stock, clock);
                            let _ = write!(label, " · {}: {status}", recipe.name);
                        }
                    } else {
                        label.push_str(" · No production job queued");
                    }
                }
            }
        }
        for (index, site) in land.sites() {
            if self.gathering.felled(index) {
                continue;
            }
            let recipe = &catalog.gathering[site.recipe()];
            let produces = recipe.output.contains_key(material);
            let color = if produces {
                green
            } else if recipe
                .output
                .keys()
                .any(|id| upstream.contains(id.as_str()))
            {
                blue
            } else {
                continue;
            };
            draw_lens_marker(terrain, site.position, site.size, color, gizmos);
            if produces {
                draw_supply_link(site.position, site.size, color, gizmos);
            }
            if hovered.and_then(|cell| land.site_at(cell)) == Some(index) {
                let _ = write!(label, "\n{} · Natural source", recipe.name);
            }
        }
        label
    }
}
