use super::*;

impl Construction {
    fn visible_projects<'a>(
        &'a self,
        catalog: &'a Catalog,
        underway: bool,
    ) -> Vec<(usize, &'a Blueprint)> {
        let mut rows: Vec<_> = self
            .plans
            .iter()
            .enumerate()
            .filter(|(index, plan)| {
                !plan.removed
                    && (!underway
                        || plan.work < catalog.projects[&plan.key].work
                        || self.changes.contains_key(index))
            })
            .collect();
        rows.sort_by_key(|(index, plan)| {
            (
                self.priority != Some(*index),
                plan.work >= catalog.projects[&plan.key].work,
                *index,
            )
        });
        rows
    }

    pub fn projects_panel(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        page: usize,
        underway: bool,
    ) -> (usize, String) {
        use std::fmt::Write;
        let rows = self.visible_projects(catalog, underway);
        let pages = rows.len().div_ceil(PAGE_KEYS.len()).max(1);
        let page = page.min(pages - 1);
        let filter = if underway { "Underway" } else { "All" };
        let mut text = format!(
            "Projects · {filter} · {}/{}\n1–8 Focus · Page Up/Down · Tab Filter · F11 Close",
            page + 1,
            pages
        );
        if rows.is_empty() {
            text.push_str("\nNo projects here yet.");
        }
        for (row, (index, plan)) in rows
            .iter()
            .skip(page * PAGE_KEYS.len())
            .take(PAGE_KEYS.len())
            .enumerate()
        {
            let def = &catalog.projects[&plan.key];
            let state = self
                .change_status(catalog, stock, *index)
                .unwrap_or_else(|| self.project_status(catalog, *index));
            let priority = if self.priority == Some(*index) {
                " · Priority"
            } else {
                ""
            };
            let _ = write!(
                text,
                "\n{} {} #{} · {state}{priority}",
                row + 1,
                def.name,
                index + 1
            );
        }
        (pages, text)
    }

    pub(super) fn project_status(&self, catalog: &Catalog, index: usize) -> String {
        let plan = &self.plans[index];
        let def = &catalog.projects[&plan.key];
        if self
            .residents
            .iter()
            .any(|worker| worker.blocked_construction_project() == Some(index))
        {
            "Waiting for access".into()
        } else if let Some(job) = self.changes.get(&index) {
            job.status()
        } else if plan.work >= def.work {
            "Complete".to_owned()
        } else if self.construction_delivery_at(index) {
            "Supplier delivery on its way".into()
        } else if let Some(trip) = self.booked_construction_trip(index) {
            if trip.boarded {
                format!("Vehicle {} collecting materials", trip.vehicle + 1)
            } else {
                format!("Vehicle {} booked for materials", trip.vehicle + 1)
            }
        } else if plan.pickups > 0 {
            format!("{} town pickup(s) pending", plan.pickups)
        } else if plan.delivered < plan.loads {
            let mut in_transit = 0;
            let mut staged = plan.staged;
            for job in self
                .residents
                .iter()
                .filter_map(|worker| worker.assignment.as_ref())
            {
                if job.project == index && job.activity == Activity::Carry {
                    in_transit += job.haul.loads();
                    if matches!(job.haul, Haul::FromDepot { .. }) {
                        staged = staged.saturating_sub(job.haul.loads());
                    }
                }
            }
            let mut status = format!(
                "{}/{} loads delivered · {in_transit} in transit",
                plan.delivered, plan.loads
            );
            if staged > 0 {
                use std::fmt::Write;
                let _ = write!(status, " · {staged} at nearby storage");
            }
            status
        } else {
            let progress = 100.0 * plan.work / def.work;
            let builders =
                self.residents
                    .iter()
                    .filter(|worker| {
                        worker.assignment.as_ref().is_some_and(|job| {
                            job.project == index && job.activity == Activity::Build
                        })
                    })
                    .count();
            if builders == 0 {
                format!("{progress:.0}% built · Waiting for builders")
            } else {
                let limit = construction_crew_limit(def, plan.size);
                let hours = (def.work - plan.work)
                    / (crate::weather::HOUR
                        * builders as f64
                        * construction_crew_efficiency(builders));
                format!(
                    "{progress:.0}% built · {builders}/{limit} builders · ~{hours:.1}h assembly left"
                )
            }
        }
    }

    pub fn draw_access_lens(
        &self,
        catalog: &Catalog,
        terrain: &Terrain,
        land: &Land,
        hovered: Option<IVec2>,
        gizmos: &mut Gizmos,
    ) -> String {
        use std::fmt::Write;

        const FAR_THRESHOLD: f32 = 25.0;
        let point_at = |cell: Vec2, offset: f32| {
            let Vec2 { x, y: z } = world_position(cell.x, cell.y);
            Vec3::new(x, terrain.height_at(x, z) + offset, z)
        };
        let supplies = STOCKPILE.as_vec2();
        let stock_marker = point_at(supplies, 6.0);
        let stock_color = Color::srgb_u8(238, 245, 255);
        gizmos.line(point_at(supplies, 0.1), stock_marker, stock_color);
        for axis in [Vec3::X, Vec3::Z] {
            gizmos.line(stock_marker - axis, stock_marker + axis, stock_color);
        }

        let mut legend =
            "Access · White shared supplies · Blue within 25 cells · Gold farther away".to_owned();
        for (index, plan) in self.plans.iter().enumerate() {
            if plan.removed || matches!(plan.key.as_str(), "road" | "bridge") {
                continue;
            }
            let center = plan.position.as_vec2() + (plan.size.as_vec2() - Vec2::ONE) * 0.5;
            let distance = center.distance(supplies);
            let color = if distance > FAR_THRESHOLD {
                Color::srgb_u8(243, 200, 108)
            } else {
                Color::srgb_u8(109, 220, 255)
            };
            let tip = point_at(center, 7.0);
            gizmos.line(point_at(center, 0.1), tip, color);
            gizmos.line(tip - Vec3::X * 0.7, tip + Vec3::X * 0.7, color);
            if hovered.is_some_and(|cell| {
                cell.cmpge(plan.position).all() && cell.cmplt(plan.position + plan.size).all()
            }) {
                let _ = write!(
                    legend,
                    "\n{} #{} · {distance:.1} cells from supplies (straight line)",
                    catalog.projects[&plan.key].name,
                    index + 1
                );
                if let Some(depot_index) = plan.depot {
                    let depot = &self.plans[depot_index];
                    let depot_center =
                        depot.position.as_vec2() + (depot.size.as_vec2() - Vec2::ONE) * 0.5;
                    let marker = point_at(depot_center, 8.0);
                    let depot_color = Color::srgb_u8(191, 154, 245);
                    gizmos.line(point_at(depot_center, 0.2), marker, depot_color);
                    gizmos.line(marker - Vec3::X, marker + Vec3::X, depot_color);
                    let _ = write!(
                        legend,
                        "\nPurple · {} #{} stages supplies · {}",
                        catalog.projects[&depot.key].name,
                        depot_index + 1,
                        self.project_status(catalog, index)
                    );
                }
                let steps = distance.ceil().max(1.0) as usize;
                gizmos.linestrip(
                    (0..=steps).map(|step| {
                        point_at(supplies.lerp(center, step as f32 / steps as f32), 0.4)
                    }),
                    color,
                );
            }
        }
        legend.push_str("\nRoutes · Cyan walking · Orange carrying");
        let mut closest = None;
        let mut closest_distance = 2.25;
        for (index, worker) in self.residents.iter().enumerate() {
            if worker.path.is_empty()
                || self.driver_away(index)
                || self.away_for_work(index)
                || self.resident_sleeping(index)
            {
                continue;
            }
            let carrying = self.resident_motion(index, catalog, land)
                == crate::resident_animation::Motion::CarryWalk;
            let color = if carrying {
                Color::srgb_u8(255, 151, 85)
            } else {
                Color::srgb_u8(93, 238, 228)
            };
            gizmos.linestrip(
                std::iter::once(worker.position)
                    .chain(worker.path.iter().copied())
                    .map(|cell| point_at(cell, 0.65)),
                color,
            );
            if let Some(cell) = hovered {
                let distance = cell.as_vec2().distance_squared(worker.position);
                if distance < closest_distance {
                    closest = Some((index, worker, carrying));
                    closest_distance = distance;
                }
            }
        }
        if let Some((index, worker, carrying)) = closest {
            let mut from = worker.position;
            let mut distance = 0.0;
            for &waypoint in &worker.path {
                distance += from.distance(waypoint);
                from = waypoint;
            }
            let name = super::resident_work::NAMES[index];
            let route = if worker
                .assignment
                .as_ref()
                .is_some_and(|job| job.activity == Activity::Carry)
            {
                self.resident_action(catalog, index)
            } else if carrying {
                "Carrying".into()
            } else {
                "Walking".into()
            };
            let _ = write!(
                legend,
                "\n{name} · {route} · {distance:.1} cells left on route"
            );
        }
        legend
    }

    pub fn project_page_labels(
        &self,
        catalog: &Catalog,
        page: usize,
        underway: bool,
    ) -> Vec<String> {
        let projects = self.visible_projects(catalog, underway);
        let page = page.min(projects.len().div_ceil(PAGE_KEYS.len()).saturating_sub(1));
        projects
            .iter()
            .skip(page * PAGE_KEYS.len())
            .take(PAGE_KEYS.len())
            .map(|(index, plan)| format!("{} #{}", catalog.projects[&plan.key].name, index + 1))
            .collect()
    }

    pub fn focus_project(
        &mut self,
        catalog: &Catalog,
        row: usize,
        page: usize,
        underway: bool,
    ) -> Option<Vec2> {
        let rows = self.visible_projects(catalog, underway);
        let page = page.min(rows.len().div_ceil(PAGE_KEYS.len()).saturating_sub(1));
        let &(project, plan) = rows.get(page * PAGE_KEYS.len() + row)?;
        let center = project_center(plan);
        self.select_project(Some(project));
        Some(center)
    }

    pub fn select_power_shortage(&mut self) -> Option<Vec2> {
        let selected = self.production.selected;
        let index = {
            let mut shortages = self
                .utilities
                .power_shortages()
                .filter_map(|id| id.checked_sub(1));
            let first = shortages.next()?;
            if Some(first) > selected {
                first
            } else {
                shortages
                    .find(|&index| Some(index) > selected)
                    .unwrap_or(first)
            }
        };
        let plan = self.plans.get(index)?;
        let center = project_center(plan);
        self.select_project(Some(index));
        Some(center)
    }

    pub(crate) fn resident_project(&self, resident: usize) -> Option<usize> {
        let worker = &self.residents[resident];
        if worker.health.task.is_some()
            || self.away_for_work(resident)
            || self.driver_away(resident)
        {
            return None;
        }
        let site = self
            .production
            .jobs
            .iter()
            .find(|job| job.worker == Some(resident))
            .map(|job| job.site)
            .or_else(|| {
                self.farming
                    .jobs
                    .iter()
                    .find(|job| job.worker == Some(resident))
                    .map(|job| job.site)
            })
            .or_else(|| worker.assignment.as_ref().map(|job| job.project))?;
        self.plans.get(site).filter(|plan| !plan.removed)?;
        Some(site)
    }

    pub(crate) fn select_resident_project(&mut self, resident: usize) -> bool {
        let Some(site) = self.resident_project(resident) else {
            return false;
        };
        self.select_project(Some(site));
        true
    }

    pub fn selected_project_center(&self) -> Option<Vec2> {
        let plan = self.plans.get(self.production.selected?)?;
        (!plan.removed).then(|| project_center(plan))
    }

    pub fn clear_selected_project(&mut self) {
        self.select_project(None);
    }
}

fn project_center(plan: &Blueprint) -> Vec2 {
    let center = plan.position.as_vec2() + (plan.size.as_vec2() - Vec2::ONE) * 0.5;
    world_position(center.x, center.y)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resident_project_selects_the_assigned_site_and_skips_removed_work() {
        let catalog = Catalog::default();
        let mut construction = Construction::default();
        let position = IVec2::new(44, 36);
        let plan = construction.proposed_site(&catalog, "well", position);
        let center = project_center(&plan);
        construction.plans.push(plan);
        assert!(!construction.select_resident_project(0));
        construction.residents[0].assignment = Some(Assignment {
            project: 0,
            spot: position,
            activity: Activity::Walk,
            to_site: Default::default(),
            haul: Haul::Direct,
        });
        assert!(construction.select_resident_project(0));
        assert_eq!(construction.selected_project_center(), Some(center));
        construction.plans[0].removed = true;
        assert!(!construction.select_resident_project(0));
    }
}
