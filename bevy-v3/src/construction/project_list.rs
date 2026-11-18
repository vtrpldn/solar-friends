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
            let state = if self.changes.contains_key(index) {
                "Changes queued".to_owned()
            } else if plan.work >= def.work {
                "Complete".to_owned()
            } else if plan.pickups > 0 {
                format!("{} town pickup(s) pending", plan.pickups)
            } else if plan.delivered < plan.loads {
                format!("{}/{} loads delivered", plan.delivered, plan.loads)
            } else {
                format!("{:.0}% built", 100.0 * plan.work / def.work)
            };
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

    pub fn focus_project(
        &mut self,
        catalog: &Catalog,
        keyboard: &ButtonInput<KeyCode>,
        page: usize,
        underway: bool,
    ) -> Option<Vec2> {
        let index = PAGE_KEYS
            .iter()
            .position(|key| keyboard.just_pressed(*key))?;
        let rows = self.visible_projects(catalog, underway);
        let page = page.min(rows.len().div_ceil(PAGE_KEYS.len()).saturating_sub(1));
        let &(project, plan) = rows.get(page * PAGE_KEYS.len() + index)?;
        let center = plan.position.as_vec2() + (plan.size.as_vec2() - Vec2::ONE) * 0.5;
        self.select_project(Some(project));
        Some(world_position(center.x, center.y))
    }
}
