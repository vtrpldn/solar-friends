use super::*;

#[derive(Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
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

    pub(super) fn for_output(output: &BTreeMap<String, u32>) -> Self {
        if crate::food::SERVINGS
            .iter()
            .any(|(id, _)| output.contains_key(*id))
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
    #[serde(default = "one_worker")]
    essential_workers: u8,
    #[serde(default = "one_worker")]
    production_workers: u8,
}

impl Default for WorkPolicy {
    fn default() -> Self {
        Self {
            priorities: [3, 3, 2, 2],
            essential_workers: 1,
            production_workers: 1,
        }
    }
}

fn one_worker() -> u8 {
    1
}

impl WorkPolicy {
    pub(super) fn set_priority(&mut self, group: WorkGroup, level: u8) -> Result<(), &'static str> {
        if level > 3 {
            return Err("Work priority must be between 0 and 3.");
        }
        self.priorities[group as usize] = level;
        Ok(())
    }

    pub(super) fn set_reservations(
        &mut self,
        essentials: u8,
        production: u8,
    ) -> Result<(), &'static str> {
        if u16::from(essentials) + u16::from(production) > 5 {
            return Err("Worker reservations cannot exceed five residents.");
        }
        self.essential_workers = essentials;
        self.production_workers = production;
        Ok(())
    }

    pub(super) fn valid(&self) -> bool {
        self.priorities.iter().all(|&priority| priority <= 3)
            && u16::from(self.essential_workers) + u16::from(self.production_workers) <= 5
    }

    pub(super) fn dispatch_order(&self, urgent: bool) -> [WorkGroup; 4] {
        let mut order = WorkGroup::ALL;
        order.sort_by_key(|&group| {
            (
                group != WorkGroup::Essentials || !urgent,
                std::cmp::Reverse(self.priorities[group as usize]),
                group != WorkGroup::Construction,
            )
        });
        order
    }
}

impl Construction {
    pub(super) fn reserved_workers(&self) -> ([bool; 5], [bool; 5]) {
        let mut essential = [false; 5];
        let mut production = [false; 5];
        let mut available = (0..self.residents.len()).filter(|&index| {
            self.residents[index].health.energy >= 25.0 && self.free_for_leisure(index)
        });
        for index in available
            .by_ref()
            .take(usize::from(self.work_policy.essential_workers))
        {
            essential[index] = true;
        }
        for index in available.take(usize::from(self.work_policy.production_workers)) {
            production[index] = true;
        }
        (essential, production)
    }

    pub(super) fn work_candidate(&self, index: usize) -> bool {
        self.reservation_pass.is_none_or(|workers| workers[index]) && self.free_for_leisure(index)
    }

    pub(crate) fn set_worker_reservation(&mut self, essential: bool, count: u8) {
        if count > 5 {
            return;
        }
        let policy = &mut self.work_policy;
        let (selected, other) = if essential {
            (
                &mut policy.essential_workers,
                &mut policy.production_workers,
            )
        } else {
            (
                &mut policy.production_workers,
                &mut policy.essential_workers,
            )
        };
        *selected = count;
        *other = (*other).min(5 - *selected);
    }

    pub(crate) fn worker_reservation_label(&self, essential: bool) -> String {
        let policy = &self.work_policy;
        if essential {
            format!("Reserve {} for essentials", policy.essential_workers)
        } else {
            format!("Reserve {} for production", policy.production_workers)
        }
    }

    pub(crate) fn set_work_priority(&mut self, group: WorkGroup, level: u8) {
        let _ = self.work_policy.set_priority(group, level);
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

    #[test]
    fn construction_wins_normal_priority_ties_after_reservations() {
        let mut policy = WorkPolicy::default();
        assert!(
            policy.dispatch_order(false)
                == [
                    WorkGroup::Essentials,
                    WorkGroup::Maintenance,
                    WorkGroup::Construction,
                    WorkGroup::Production,
                ]
        );
        policy.set_priority(WorkGroup::Construction, 3).unwrap();
        assert!(policy.dispatch_order(false)[0] == WorkGroup::Construction);
        assert!(policy.dispatch_order(true)[0] == WorkGroup::Essentials);
    }
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
        village.work_policy.essential_workers = 0;
        village.work_policy.production_workers = 0;
        let before = serde_json::to_vec(&village).unwrap();
        village.set_work_priority(WorkGroup::Construction, 3);
        village.tick(&catalog, &mut stock.clone(), ground, clock, 0.1, false);
        assert!(village.residents[0].assignment.is_some());
        assert!(village.production.jobs[0].worker.is_none());

        let mut reserved: Construction = serde_json::from_slice(&before).unwrap();
        for input in [
            r#"{"type":"work-priority","group":"construction","level":3}"#,
            r#"{"type":"worker-reservations","essentials":0,"production":1}"#,
        ] {
            let order = serde_json::from_str(input).unwrap();
            reserved
                .lab_order(
                    &catalog,
                    &mut stock,
                    ground,
                    clock,
                    &order,
                    setup.richness(),
                )
                .unwrap();
        }
        assert_eq!(reserved.work_policy.production_workers, 1);
        let saved = serde_json::to_vec(&reserved).unwrap();
        reserved = serde_json::from_slice(&saved).unwrap();
        reserved.tick(&catalog, &mut stock.clone(), ground, clock, 0.1, false);
        assert_eq!(reserved.production.jobs[0].worker, Some(0));
        assert!(reserved.residents[0].assignment.is_none());
        assert!(reserved.reservation_pass.is_none());

        let mut no_batch: Construction = serde_json::from_slice(&saved).unwrap();
        no_batch.production.jobs.clear();
        no_batch.tick(&catalog, &mut stock.clone(), ground, clock, 0.1, false);
        assert!(no_batch.residents[0].assignment.is_some());

        let mut restored: Construction = serde_json::from_slice(&before).unwrap();
        restored.set_work_priority(WorkGroup::Production, 3);
        restored.tick(&catalog, &mut stock, ground, clock, 0.1, false);
        assert_eq!(restored.production.jobs[0].worker, Some(0));
        assert!(restored.residents[0].assignment.is_none());
    }
}
