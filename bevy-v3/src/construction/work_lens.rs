use super::*;
use crate::production::Phase;

#[derive(Clone, Default)]
struct SiteWork {
    assigned: usize,
    waiting: usize,
    growing: usize,
    blocked: bool,
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
        (stock, clock): (&Stock, f64),
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
            let site = &mut work[batch.site];
            site.blocked =
                site.blocked || self.batch_blocker(batch, catalog, stock, clock).is_some();
            if batch.phase == Phase::Growing {
                site.growing += 1;
            } else {
                site.add_job(batch.worker.is_some());
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
            "Work · Green assigned · Gold waiting · Blue growing · Red blocked · Gray idle or off"
                .to_owned();
        for (index, (plan, work)) in self.plans.iter().zip(work).enumerate() {
            if plan.removed {
                continue;
            }
            let definition = &catalog.projects[&plan.key];
            let building = plan.work < definition.work;
            let color = if work.blocked {
                Color::srgb_u8(222, 112, 96)
            } else if work.assigned > 0 {
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
            let switched_off = !building && !self.utilities.enabled(index);
            let color = if switched_off {
                Color::srgb_u8(147, 146, 140)
            } else {
                color
            };
            super::draw_lens_marker(terrain, plan.position, plan.size, color, gizmos);
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
                } else {
                    if switched_off {
                        legend.push_str(" · Building switched off");
                    }
                    for batch in self
                        .production
                        .jobs
                        .iter()
                        .filter(|batch| batch.site == index)
                    {
                        let name = &catalog.production[&batch.recipe].name;
                        let status = self.batch_status(batch, catalog, stock, clock);
                        let _ = write!(legend, " · {name} ({status})");
                    }
                }
            }
        }
        legend
    }
}
