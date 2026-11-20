use super::*;
use crate::{farming::Stage, production::Phase};

const FOOD: [&str; 5] = ["food", "meals", "eggs", "milk", "honey"];

impl Construction {
    pub fn draw_food_lens(
        &self,
        catalog: &Catalog,
        terrain: &Terrain,
        stock: &Stock,
        clock: f64,
        hovered: Option<IVec2>,
        gizmos: &mut Gizmos,
    ) -> String {
        use std::fmt::Write;

        let blue = Color::srgb_u8(109, 220, 255);
        let green = Color::srgb_u8(136, 220, 148);
        let gold = Color::srgb_u8(243, 200, 108);
        let red = Color::srgb_u8(222, 112, 96);
        let gray = Color::srgb_u8(147, 146, 140);
        let mut label =
            "Food · Blue shared supplies · Green producing or ready · Gold pending · Red blocked · Gray idle or off"
                .to_owned();
        draw_lens_marker(terrain, STOCKPILE, IVec2::ONE, blue, gizmos);
        if hovered == Some(STOCKPILE) {
            label.push_str("\nShared supplies");
            for id in FOOD {
                let _ = write!(
                    label,
                    " · {} {}",
                    stock.available(id),
                    catalog.materials[id].name
                );
            }
        }
        let makes_food = |recipe: &crate::catalog::ProductionRecipe| {
            FOOD.iter().any(|id| recipe.output.contains_key(*id))
        };
        for (index, plan) in self.plans.iter().enumerate() {
            if plan.removed {
                continue;
            }
            let def = &catalog.projects[&plan.key];
            let plot = self.farming.plots.get(&index);
            let cultivation = matches!(plan.key.as_str(), "field" | "garden" | "greenhouse");
            if !cultivation
                && !catalog
                    .production
                    .values()
                    .any(|r| r.kind == def.kind && makes_food(r))
            {
                continue;
            }
            let ready = plot.map_or(0, |plot| {
                plot.beds
                    .iter()
                    .filter(|bed| bed.stage == Stage::Harvestable && !bed.harvest_expired(clock))
                    .count()
            });
            let growing = plot.map_or(0, |plot| {
                plot.beds
                    .iter()
                    .filter(|bed| bed.stage == Stage::Growing)
                    .count()
            });
            let batch = self.production.jobs.iter().find(|job| job.site == index);
            let mut farm_jobs = self.farming.jobs.iter().filter(|job| job.site == index);
            let farm_queued = farm_jobs.clone().count();
            let farm_active = farm_jobs.any(|job| job.worker.is_some());
            let animal_output = self
                .livestock
                .animals
                .get(&index)
                .map_or(0, |animals| animals.available());
            let finished = plan.work >= def.work;
            let switched_off = finished && !self.utilities.enabled(index);
            let color = if !finished {
                gold
            } else if switched_off {
                gray
            } else if batch
                .is_some_and(|job| self.batch_blocker(job, catalog, stock, clock).is_some())
            {
                red
            } else if ready > 0 || growing > 0 || animal_output > 0 || farm_active {
                green
            } else if let Some(job) = batch {
                if job.worker.is_some() || matches!(job.phase, Phase::Growing | Phase::Harvest) {
                    green
                } else {
                    gold
                }
            } else if farm_queued > 0 {
                gold
            } else {
                gray
            };
            draw_lens_marker(terrain, plan.position, plan.size, color, gizmos);
            if hovered.is_some_and(|cell| {
                cell.cmpge(plan.position).all() && cell.cmplt(plan.position + plan.size).all()
            }) {
                let _ = write!(label, "\n{} #{}", def.name, index + 1);
                if !finished {
                    let _ = write!(label, " · {}", self.project_status(catalog, index));
                } else if switched_off {
                    label.push_str(" · Building switched off");
                } else if let Some(job) = batch {
                    let recipe = &catalog.production[&job.recipe];
                    let _ = write!(
                        label,
                        " · {} · {}",
                        recipe.name,
                        self.batch_status(job, catalog, stock, clock)
                    );
                } else if plot.is_some() {
                    let _ = write!(
                        label,
                        " · {growing} growing · {ready} harvestable · {farm_queued} bed jobs queued"
                    );
                } else if animal_output > 0 {
                    let _ = write!(label, " · {animal_output} ready to collect");
                } else {
                    label.push_str(" · No food batch queued");
                }
            }
        }
        label
    }
}
