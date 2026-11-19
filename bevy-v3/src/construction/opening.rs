use super::*;

#[derive(Default, Deserialize, Serialize)]
pub(super) struct OpeningMilestones {
    gathering: bool,
    shelter: bool,
    supplies: bool,
}

impl Construction {
    pub fn update_opening_milestones(&mut self, catalog: &Catalog, clock: f64) {
        if self.opening.gathering && self.opening.shelter && self.opening.supplies {
            return;
        }
        let complete = |matches: fn(&str, &str) -> bool| {
            self.plans.iter().any(|plan| {
                let definition = &catalog.projects[&plan.key];
                !plan.removed
                    && plan.work >= definition.work
                    && matches(&plan.key, &definition.kind)
            })
        };
        let reached = [
            complete(|key, kind| key == "gathering" || matches!(kind, "square" | "community-hall")),
            complete(|_, kind| {
                matches!(
                    kind,
                    "shed"
                        | "rain-shelter"
                        | "home"
                        | "reading-room"
                        | "community-hall"
                        | "outdoor-classroom"
                )
            }),
            complete(|key, kind| {
                key == "tarp-stores" || matches!(kind, "warehouse" | "covered-storage")
            }),
        ];
        let milestones = [
            (
                &mut self.opening.gathering,
                "Luz · Somewhere to sit together. This is starting to feel like our place.",
            ),
            (
                &mut self.opening.shelter,
                "Nina · A dry place to take a break. We can stop rushing when the rain comes.",
            ),
            (
                &mut self.opening.supplies,
                "Bento · Tools and supplies are protected. We can save the rest of our money for tomorrow.",
            ),
        ];
        for ((recorded, line), reached) in milestones.into_iter().zip(reached) {
            if reached && !*recorded {
                *recorded = true;
                self.events.record(clock, line.into());
            }
        }
    }

    pub fn opening_milestones_status(&self) -> Option<String> {
        let goals = [
            (self.opening.gathering, "Gathering place"),
            (self.opening.shelter, "Shelter"),
            (self.opening.supplies, "Protected supplies"),
        ];
        let pending: Vec<_> = goals
            .into_iter()
            .filter_map(|(done, name)| (!done).then_some(name))
            .collect();
        (!pending.is_empty()).then(|| format!("First camp · {}", pending.join(" · ")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_community_hall_counts_for_gathering_and_shelter_once_across_reload() {
        let catalog = Catalog::default();
        let mut construction = Construction::default();
        let mut hall = construction.proposed_site(&catalog, "community-hall", IVec2::ZERO);
        hall.work = catalog.projects["community-hall"].work;
        construction.plans.push(hall);
        construction.update_opening_milestones(&catalog, 10.0);
        assert_eq!(
            construction.opening_milestones_status().as_deref(),
            Some("First camp · Protected supplies")
        );

        let saved = serde_json::to_string(&construction).unwrap();
        let mut restored: Construction = serde_json::from_str(&saved).unwrap();
        restored.update_opening_milestones(&catalog, 11.0);
        assert_eq!(serde_json::to_string(&restored).unwrap(), saved);
    }
}
