use super::*;

#[derive(Default, Deserialize, Serialize)]
pub(super) struct OpeningMilestones {
    gathering: bool,
    shelter: bool,
    supplies: bool,
    #[serde(default)]
    town_trips: u32,
    #[serde(default)]
    complete: bool,
}

impl Construction {
    pub fn update_opening_milestones(&mut self, catalog: &Catalog, clock: f64, balance: u64) {
        if self.opening.complete {
            return;
        }
        let reached = self.current_opening_goals(catalog);
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
        if reached.into_iter().all(|done| done) && self.active_trips().next().is_none() {
            self.opening.complete = true;
            let trips = self.opening.town_trips;
            let unit = if trips == 1 { "trip" } else { "trips" };
            self.record_event(
                clock,
                format!(
                    "Tools down. Our first meal on our own land. {trips} town {unit} · R${:.2} in shared savings.",
                    balance as f64 / 100.0
                ),
            );
        }
    }

    pub(super) fn record_opening_town_trip(&mut self) {
        if !self.opening.complete {
            self.opening.town_trips = self.opening.town_trips.saturating_add(1);
        }
    }

    pub(super) fn opening_rain_factor(
        &self,
        catalog: &Catalog,
        raining: bool,
        sandbox: bool,
    ) -> f64 {
        if raining
            && !sandbox
            && !self.opening.complete
            && !self.completed_opening_project(catalog, opening_shelter)
        {
            0.8
        } else {
            1.0
        }
    }

    fn current_opening_goals(&self, catalog: &Catalog) -> [bool; 3] {
        let complete = |matches| self.completed_opening_project(catalog, matches);
        [
            complete(|key, kind| key == "gathering" || matches!(kind, "square" | "community-hall")),
            complete(opening_shelter),
            complete(|key, kind| {
                key == "tarp-stores" || matches!(kind, "warehouse" | "covered-storage")
            }),
        ]
    }

    fn completed_opening_project(
        &self,
        catalog: &Catalog,
        matches: fn(&str, &str) -> bool,
    ) -> bool {
        self.plans.iter().any(|plan| {
            let definition = &catalog.projects[&plan.key];
            !plan.removed && plan.work >= definition.work && matches(&plan.key, &definition.kind)
        })
    }

    pub fn opening_milestones_status(&self, catalog: &Catalog) -> Option<String> {
        if self.opening.complete {
            return None;
        }
        let pending: Vec<_> = ["Gathering place", "Shelter", "Protected supplies"]
            .into_iter()
            .zip(self.current_opening_goals(catalog))
            .filter_map(|(name, done)| (!done).then_some(name))
            .collect();
        if pending.is_empty() {
            Some("First camp · Ready for the first meal once town trips finish".into())
        } else {
            Some(format!("First camp · {}", pending.join(" · ")))
        }
    }
}

fn opening_shelter(_: &str, kind: &str) -> bool {
    matches!(
        kind,
        "shed" | "rain-shelter" | "home" | "reading-room" | "community-hall" | "outdoor-classroom"
    )
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
        construction.update_opening_milestones(&catalog, 10.0, 100);
        assert_eq!(
            construction.opening_milestones_status(&catalog).as_deref(),
            Some("First camp · Protected supplies")
        );

        let saved = serde_json::to_string(&construction).unwrap();
        let mut restored: Construction = serde_json::from_str(&saved).unwrap();
        restored.update_opening_milestones(&catalog, 11.0, 100);
        assert_eq!(serde_json::to_string(&restored).unwrap(), saved);
        restored.record_opening_town_trip();
        let mut storage = restored.proposed_site(&catalog, "warehouse", IVec2::X);
        storage.work = catalog.projects["warehouse"].work;
        restored.plans.push(storage);
        restored.trip = Some(TownTrip {
            project: 1,
            farm_bed: None,
            market_order: false,
            exports: 0,
            return_purchase: None,
            driver: 0,
            vehicle: 0,
            elapsed: 0.0,
            duration: 20.0,
            boarded: true,
        });
        restored.update_opening_milestones(&catalog, 11.5, 100);
        assert!(!restored.opening.complete);
        restored.trip = None;
        restored.update_opening_milestones(&catalog, 12.0, 100);
        assert!(restored.opening.complete);
        assert!(restored.opening_milestones_status(&catalog).is_none());
        assert!(restored.event_log(0, "").1.contains("1 town trip · R$1.00"));
        let saved = serde_json::to_string(&restored).unwrap();
        let mut restored: Construction = serde_json::from_str(&saved).unwrap();
        restored.record_opening_town_trip();
        restored.update_opening_milestones(&catalog, 13.0, 200);
        assert_eq!(serde_json::to_string(&restored).unwrap(), saved);
    }
}
