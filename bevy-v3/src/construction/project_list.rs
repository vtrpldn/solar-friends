use super::*;

impl Construction {
    pub(crate) fn selected_construction_progress(
        &self,
        catalog: &Catalog,
    ) -> Option<(&'static str, f64)> {
        let index = self.production.selected?;
        let plan = self.plans.get(index)?;
        let required = catalog.projects[&plan.key].work;
        if plan.removed || plan.work >= required || self.changes.contains_key(&index) {
            return None;
        }
        if plan.pickups > 0 {
            Some(("Collecting materials", 0.0))
        } else if plan.delivered < plan.loads {
            Some((
                "Delivering supplies",
                f64::from(plan.delivered) / f64::from(plan.loads),
            ))
        } else {
            Some(("Building", plan.work / required))
        }
    }

    fn visible_projects<'a>(
        &'a self,
        catalog: &'a Catalog,
        underway: bool,
        roads_expanded: bool,
    ) -> Vec<(usize, &'a Blueprint)> {
        let mut rows: Vec<_> = self
            .plans
            .iter()
            .enumerate()
            .filter(|(index, plan)| {
                !plan.removed
                    && (roads_expanded || plan.key != "road")
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

    pub(crate) fn road_project_counts(&self, catalog: &Catalog) -> (usize, usize) {
        let work = catalog.projects["road"].work;
        self.plans
            .iter()
            .filter(|plan| !plan.removed && plan.key == "road")
            .fold((0, 0), |(tiles, ready), plan| {
                (tiles + 1, ready + usize::from(plan.work >= work))
            })
    }

    pub fn projects_panel(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        page: usize,
        underway: bool,
        roads_expanded: bool,
        clock: f64,
    ) -> (usize, String) {
        use std::fmt::Write;
        let rows = self.visible_projects(catalog, underway, roads_expanded);
        let pages = rows.len().div_ceil(PAGE_KEYS.len()).max(1);
        let page = page.min(pages - 1);
        let filter = if underway { "Underway" } else { "All" };
        let mut text = format!(
            "Projects · {filter} · {}/{}\n1–8 Focus · Page Up/Down · Tab Filter · F11 Close",
            page + 1,
            pages
        );
        let (roads, ready) = self.road_project_counts(catalog);
        if roads > 0 {
            let _ = write!(
                text,
                "\nRoads · {roads} tiles · {ready} ready · D Show/hide tiles"
            );
        }
        if rows.is_empty() && roads == 0 {
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
            if let Some(minutes) = self.construction_delivery_minutes(*index, clock) {
                let _ = write!(text, " · {minutes} game minutes remaining");
            }
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
            self.utilities
                .operational_blocker(index)
                .unwrap_or("Complete")
                .into()
        } else if let Some(status) = self.construction_transport_status(index) {
            status
        } else if self.supplier_construction && plan.pickups > 0 {
            if Self::fits_construction_freight(catalog, plan) {
                "Waiting for supplier freight".into()
            } else {
                "Switch to resident pickup to collect these materials".into()
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
                if let Some(depot) = plan.depot {
                    let name = &catalog.projects[&self.plans[depot].key].name;
                    let _ = write!(status, " ({name} #{})", depot + 1);
                }
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
                let needs_take_precedence =
                    self.residents.iter().enumerate().all(|(worker, resident)| {
                        resident.health.energy < 25.0
                            || resident.health.task.is_some()
                            || self.away_for_work(worker)
                            || self.driver_away(worker)
                    });
                let reason = if needs_take_precedence {
                    "Supplies ready · residents resting, meeting needs, or away"
                } else {
                    "Supplies ready · waiting for builders"
                };
                format!("{progress:.0}% built · {reason}")
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
            "Access & hauling · White shared supplies · Blue within 25 cells · Gold farther away"
                .to_owned();
        for (index, plan) in self.plans.iter().enumerate() {
            if plan.removed || matches!(plan.key.as_str(), "road" | "bridge") {
                continue;
            }
            let origin = plan.position.as_vec2();
            let center = origin + (plan.size.as_vec2() - Vec2::ONE) * 0.5;
            let distance = origin.distance(supplies);
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
            }
        }
        legend.push_str("\nQueued routes · Cyan walking · Orange carrying");
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
        roads_expanded: bool,
    ) -> Vec<String> {
        let projects = self.visible_projects(catalog, underway, roads_expanded);
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
        roads_expanded: bool,
    ) -> Option<Vec2> {
        let rows = self.visible_projects(catalog, underway, roads_expanded);
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
