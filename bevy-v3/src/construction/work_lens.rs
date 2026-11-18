use super::*;
use crate::production::Phase;

#[derive(Clone, Default)]
struct SiteWork {
    assigned: usize,
    waiting: usize,
    growing: usize,
}

impl SiteWork {
    fn add_job(&mut self, assigned: bool) {
        if assigned {
            self.assigned += 1;
        } else {
            self.waiting += 1;
        }
    }
}

impl Construction {
    pub fn draw_work_lens(
        &self,
        catalog: &Catalog,
        terrain: &Terrain,
        hovered: Option<IVec2>,
        gizmos: &mut Gizmos,
    ) -> String {
        use std::fmt::Write;

        let mut work = vec![SiteWork::default(); self.plans.len()];
        for worker in &self.residents {
            if let Some(job) = &worker.assignment {
                work[job.project].assigned += 1;
            }
        }
        for batch in &self.production.jobs {
            if batch.phase == Phase::Growing {
                work[batch.site].growing += 1;
            } else {
                work[batch.site].add_job(batch.worker.is_some());
            }
        }
        for job in &self.farming.jobs {
            work[job.site].add_job(job.worker.is_some());
        }
        for (&site, job) in &self.changes {
            work[site].add_job(job.worker.is_some());
        }
        for (&target, job) in &self.water_jobs {
            if let Some(site) = target.checked_sub(1) {
                work[site]
                    .add_job((0..self.residents.len()).any(|resident| job.assigned_to(resident)));
            }
        }

        let mut legend =
            "Work · Green assigned · Gold waiting · Blue growing · Gray idle".to_owned();
        for (index, (plan, work)) in self.plans.iter().zip(work).enumerate() {
            if plan.removed {
                continue;
            }
            let definition = &catalog.projects[&plan.key];
            let building = plan.work < definition.work;
            let color = if work.assigned > 0 {
                Color::srgb_u8(136, 220, 148)
            } else if work.waiting > 0 || building {
                Color::srgb_u8(243, 200, 108)
            } else if work.growing > 0 {
                Color::srgb_u8(109, 220, 255)
            } else if catalog
                .production
                .values()
                .any(|recipe| recipe.kind == definition.kind)
                || self.farming.plots.contains_key(&index)
            {
                Color::srgb_u8(147, 146, 140)
            } else {
                continue;
            };
            let center = plan.position.as_vec2() + (plan.size.as_vec2() - Vec2::ONE) * 0.5;
            let Vec2 { x, y: z } = world_position(center.x, center.y);
            let base = Vec3::new(x, terrain.height_at(x, z), z);
            let tip = base + Vec3::Y * 7.0;
            gizmos.line(base, tip, color);
            for axis in [Vec3::X, Vec3::Z] {
                gizmos.line(tip - axis * 0.7, tip + axis * 0.7, color);
            }
            if hovered.is_some_and(|cell| {
                cell.cmpge(plan.position).all() && cell.cmplt(plan.position + plan.size).all()
            }) {
                let _ = write!(
                    legend,
                    "\n{} #{} · {} assigned · {} queued · {} growing",
                    definition.name,
                    index + 1,
                    work.assigned,
                    work.waiting,
                    work.growing
                );
                if building {
                    let _ = write!(legend, " · {}", self.project_status(catalog, index));
                }
            }
        }
        legend
    }
}
