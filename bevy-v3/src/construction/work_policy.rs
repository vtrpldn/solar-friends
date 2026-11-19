use crate::catalog::ProductionRecipe;

use super::*;

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum WorkGroup {
    Essentials,
    Maintenance,
    Production,
    Construction,
}

impl WorkGroup {
    pub(crate) const ALL: [Self; 4] = [
        Self::Essentials,
        Self::Maintenance,
        Self::Production,
        Self::Construction,
    ];

    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::Essentials => "Food & water",
            Self::Maintenance => "Maintenance",
            Self::Production => "Production",
            Self::Construction => "Construction",
        }
    }

    pub(super) fn for_recipe(recipe: &ProductionRecipe) -> Self {
        if crate::food::SERVINGS
            .iter()
            .any(|(id, _)| recipe.output.contains_key(*id))
        {
            Self::Essentials
        } else {
            Self::Production
        }
    }
}

#[derive(Deserialize, Serialize)]
pub(super) struct WorkPolicy {
    priorities: [u8; 4],
}

impl Default for WorkPolicy {
    fn default() -> Self {
        Self {
            priorities: [3, 3, 2, 2],
        }
    }
}

impl WorkPolicy {
    pub(super) fn valid(&self) -> bool {
        self.priorities.iter().all(|&priority| priority <= 3)
    }

    pub(super) fn dispatch_order(&self, urgent: bool) -> [WorkGroup; 4] {
        let mut order = WorkGroup::ALL;
        order.sort_by_key(|&group| {
            (
                group != WorkGroup::Essentials || !urgent,
                std::cmp::Reverse(self.priorities[group as usize]),
            )
        });
        order
    }
}

impl Construction {
    pub(crate) fn cycle_work_priority(&mut self, group: WorkGroup) {
        let priority = &mut self.work_policy.priorities[group as usize];
        *priority = (*priority + 1) % 4;
    }

    pub(crate) fn work_priority_label(&self, group: WorkGroup) -> String {
        let level = ["Low", "Normal", "High", "Highest"]
            [self.work_policy.priorities[group as usize] as usize];
        format!("{} · {level}", group.label())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::setup::{Mode, WorldSetup};

    #[test]
    fn higher_priority_changes_the_job_a_free_resident_accepts() {
        let catalog = Catalog::default();
        let mut setup = WorldSetup::default();
        setup.mode = Mode::Sandbox;
        let camp = IVec2::new(36, 36);
        let terrain = setup.terrain().with_camp(camp);
        let land = Land::default();
        let ground = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp,
        };
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut village = Construction::default();
        let mut workshop = village.proposed_site(&catalog, "supply-5", IVec2::new(44, 36));
        workshop.work = catalog.projects["supply-5"].work;
        workshop.delivered = workshop.loads;
        village.plans.push(workshop);
        let blueprint = village.proposed_site(&catalog, "well", IVec2::new(53, 36));
        village.plans.push(blueprint);
        village.queue_batch(&catalog, &mut stock, 0, "saw_timber");
        for (index, resident) in village.residents.iter_mut().enumerate() {
            resident.position = SUPPLY_SPOTS[index].as_vec2();
            resident.health.energy = if index == 0 { 100.0 } else { 0.0 };
        }
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        let before = serde_json::to_vec(&village).unwrap();
        village.cycle_work_priority(WorkGroup::Construction);
        village.tick(&catalog, &mut stock.clone(), ground, clock, 0.1, false);
        assert!(village.residents[0].assignment.is_some());
        assert!(village.production.jobs[0].worker.is_none());

        let mut restored: Construction = serde_json::from_slice(&before).unwrap();
        restored.cycle_work_priority(WorkGroup::Production);
        restored.tick(&catalog, &mut stock, ground, clock, 0.1, false);
        assert_eq!(restored.production.jobs[0].worker, Some(0));
        assert!(restored.residents[0].assignment.is_none());
    }
}
