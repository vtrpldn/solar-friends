use super::*;

impl Construction {
    pub fn kitchen_controls(&mut self, keys: &ButtonInput<KeyCode>) {
        let policy = &mut self.production.kitchen_policy;
        if keys.just_pressed(KeyCode::KeyY) {
            policy.toggle();
        }
        let step = if keys.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]) {
            -1
        } else {
            1
        };
        if keys.just_pressed(KeyCode::KeyM) {
            policy.change(false, step);
        }
        if keys.just_pressed(KeyCode::KeyX) {
            policy.change(true, step);
        }
    }

    pub fn manage_kitchens(&mut self, catalog: &Catalog, stock: &mut Stock, clock: f64) {
        let policy = &mut self.production.kitchen_policy;
        if stock.sandbox || clock < policy.next_check {
            return;
        }
        let automatic = policy.automatic;
        let kitchens: Vec<_> = self
            .plans
            .iter()
            .enumerate()
            .filter_map(|(index, plan)| {
                let def = &catalog.projects[&plan.key];
                (def.kind == "kitchen"
                    && !plan.removed
                    && plan.work >= def.work
                    && !self.changes.contains_key(&index)
                    && self.utilities.enabled(index)
                    && !self.production.jobs.iter().any(|job| job.site == index))
                .then_some(index)
            })
            .collect();
        if kitchens.is_empty() {
            return;
        }
        self.production.kitchen_policy.next_check = clock + if automatic { 1.0 } else { 10.0 };
        if !automatic {
            if self.trade.pantry_needs_food(stock, clock) {
                for index in kitchens {
                    if self.batch_inputs(catalog, stock, index, "meals").is_ok() {
                        self.queue_batch(catalog, stock, index, "meals");
                    }
                }
            }
            return;
        }
        for index in kitchens {
            if let Ok(recipe) = self.choose_kitchen_recipe(catalog, stock, clock) {
                self.queue_batch(catalog, stock, index, recipe);
            }
        }
    }

    fn choose_kitchen_recipe<'a>(
        &self,
        catalog: &'a Catalog,
        stock: &Stock,
        clock: f64,
    ) -> Result<&'a str, String> {
        let units = |goods: &BTreeMap<String, u32>| {
            goods.values().map(|&units| u64::from(units)).sum::<u64>()
        };
        let production_units = self
            .production
            .jobs
            .iter()
            .map(|job| {
                units(
                    job.delivered_output
                        .as_ref()
                        .unwrap_or(&catalog.production[&job.recipe].output),
                )
            })
            .sum::<u64>();
        let harvest_units = self
            .farming
            .jobs
            .iter()
            .map(|job| units(&job.output))
            .sum::<u64>();
        let available = self
            .storage_space(catalog, stock)
            .saturating_sub(production_units.saturating_add(harvest_units));
        let mut reason = String::from("Fresh meals and provisions meet their targets.");
        for preserved in [false, true] {
            let target = self.production.kitchen_policy.target(preserved);
            let stored = stock
                .pantry
                .lots
                .get("meals")
                .into_iter()
                .flatten()
                .filter(|lot| lot.preserved == preserved && lot.expires > clock)
                .map(|lot| u64::from(lot.units))
                .sum::<u64>();
            let inbound = self
                .production
                .jobs
                .iter()
                .filter_map(|job| {
                    let recipe = &catalog.production[&job.recipe];
                    (recipe.preserved.contains_key("meals") == preserved).then(|| {
                        u64::from(
                            job.delivered_output
                                .as_ref()
                                .unwrap_or(&recipe.output)
                                .get("meals")
                                .copied()
                                .unwrap_or(0),
                        )
                    })
                })
                .sum::<u64>();
            let room = target.saturating_sub(stored + inbound);
            if room == 0 {
                continue;
            }
            let mut candidates: Vec<_> = catalog
                .production
                .iter()
                .filter(|(_, recipe)| {
                    recipe.kind == "kitchen"
                        && recipe.preserved.contains_key("meals") == preserved
                        && recipe.output.contains_key("meals")
                })
                .collect();
            candidates.sort_by(|(a, left), (b, right)| {
                earliest_ingredient(stock, &left.input)
                    .total_cmp(&earliest_ingredient(stock, &right.input))
                    .then_with(|| a.cmp(b))
            });
            for (id, recipe) in candidates {
                reason = if u64::from(recipe.output["meals"]) > room {
                    "Waiting for room in the meal target for a whole batch.".into()
                } else if let Some(material) = stock.missing(&recipe.input) {
                    format!(
                        "Waiting for {} in stores.",
                        catalog.materials[material].name
                    )
                } else if let Some(reason) = self.craft_blocker(catalog, stock, recipe, None) {
                    reason
                } else if !enough_to_eat(stock, &recipe.input) {
                    "Keeping one day of edible food available.".into()
                } else if !ingredients_keep(stock, &recipe.input, clock + recipe.work) {
                    "Ingredients expire too soon to finish this batch.".into()
                } else if units(&recipe.output) > available {
                    "Waiting for storage space for the finished batch.".into()
                } else {
                    return Ok(id);
                };
            }
        }
        Err(reason)
    }

    pub(super) fn idle_kitchen_status(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        clock: f64,
        index: usize,
    ) -> String {
        if stock.sandbox {
            return "Automatic kitchen policy is inactive in Sandbox.".into();
        }
        if !self.utilities.enabled(index) {
            return "Kitchen is switched off.".into();
        }
        if !self.production.kitchen_policy.automatic {
            return "Automatic kitchen policy is off.".into();
        }
        match self.choose_kitchen_recipe(catalog, stock, clock) {
            Ok(id) => format!("Next automatic batch · {}", catalog.production[id].name),
            Err(reason) => reason,
        }
    }
}

fn enough_to_eat(stock: &Stock, input: &BTreeMap<String, u32>) -> bool {
    let edible = crate::food::SERVINGS;
    if !edible.iter().any(|&(id, _)| input.contains_key(id)) {
        return true;
    }
    edible
        .iter()
        .map(|&(id, serving)| {
            stock
                .available(id)
                .saturating_sub(input.get(id).copied().unwrap_or(0))
                / serving
        })
        .fold(0, u32::saturating_add)
        >= 15
}

fn earliest_ingredient(stock: &Stock, input: &BTreeMap<String, u32>) -> f64 {
    input
        .keys()
        .filter_map(|id| stock.pantry.lots.get(id)?.first().map(|lot| lot.expires))
        .min_by(f64::total_cmp)
        .unwrap_or(f64::INFINITY)
}

fn ingredients_keep(stock: &Stock, input: &BTreeMap<String, u32>, until: f64) -> bool {
    input.iter().all(|(id, &quantity)| {
        let mut left = quantity;
        for lot in stock.pantry.lots.get(id).into_iter().flatten() {
            let used = left.min(lot.units);
            if used > 0 && lot.expires <= until {
                return false;
            }
            left -= used;
            if left == 0 {
                break;
            }
        }
        true
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::setup::WorldSetup;

    #[test]
    fn a_low_pantry_reserve_queues_one_basic_meal_batch_at_an_idle_kitchen() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut village = Construction::default();
        let mut kitchen = village.proposed_site(&catalog, "kitchen", IVec2::new(44, 36));
        kitchen.work = catalog.projects["kitchen"].work;
        village.plans.push(kitchen);
        village
            .trade
            .set_pantry_policy(false, Some(14), None)
            .unwrap();

        village.manage_kitchens(&catalog, &mut stock, 0.0);
        village.manage_kitchens(&catalog, &mut stock, 20.0);
        assert_eq!(village.production.jobs.len(), 1);
        assert_eq!(village.production.jobs[0].recipe, "meals");
    }

    #[test]
    fn pantry_cooking_keeps_its_next_check_after_loading() {
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
        let mut village = Construction::default();
        let mut kitchen = village.proposed_site(&catalog, "kitchen", IVec2::new(44, 36));
        kitchen.work = catalog.projects["kitchen"].work;
        village.plans.push(kitchen);

        village.manage_kitchens(&catalog, &mut stock, 0.0);
        assert!(village.production.jobs.is_empty());
        let mut restored: Construction =
            serde_json::from_slice(&serde_json::to_vec(&village).unwrap()).unwrap();
        restored
            .trade
            .set_pantry_policy(false, Some(14), None)
            .unwrap();
        restored.manage_kitchens(&catalog, &mut stock, 5.0);
        assert!(restored.production.jobs.is_empty());
        restored.manage_kitchens(&catalog, &mut stock, 10.0);
        assert_eq!(restored.production.jobs.len(), 1);
    }

    #[test]
    fn a_kitchen_preserves_food_only_with_room_for_the_batch_and_a_day_of_food() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut village = Construction::default();
        let policy = &mut village.production.kitchen_policy;
        policy.change(false, -2);
        policy.change(true, -3);
        stock.age_food(&catalog, 0.0, 0.1, 0.0);
        assert_eq!(
            village.choose_kitchen_recipe(&catalog, &stock, 0.0),
            Ok("preserve_meals")
        );

        let doomed = stock.pantry.lots.get_mut("food").unwrap();
        doomed[0].expires = 10.0;
        assert!(
            village
                .choose_kitchen_recipe(&catalog, &stock, 0.0)
                .is_err()
        );
        stock.pantry.lots.get_mut("food").unwrap()[0].expires = 900.0;
        stock.reserve_available(&BTreeMap::from([("meals".to_owned(), 12)]));
        assert!(
            village
                .choose_kitchen_recipe(&catalog, &stock, 0.0)
                .is_err()
        );
    }

    #[test]
    fn automatic_cooking_leaves_storage_for_a_pending_harvest() {
        use crate::farming::{FarmAction, FarmJob, FarmPhase};
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
        stock.age_food(&catalog, 0.0, 0.1, 0.0);
        let mut village = Construction::default();
        village.production.kitchen_policy.change(false, -2);
        village.production.kitchen_policy.change(true, -3);
        assert_eq!(
            village.choose_kitchen_recipe(&catalog, &stock, 0.0),
            Ok("preserve_meals")
        );
        village.farming.jobs.push(FarmJob {
            site: 0,
            bed: 0,
            action: FarmAction::Harvest,
            worker: None,
            phase: FarmPhase::CollectOutput,
            work: 0.0,
            required: 1.0,
            inputs: BTreeMap::new(),
            output: BTreeMap::from([(
                "greens".into(),
                village.storage_space(&catalog, &stock) as u32,
            )]),
            food_output: None,
            retry: 0.0,
            waiting_for_access: false,
            pickups: 0,
            fare: 0,
            seed_freight_eta: None,
        });
        assert!(
            village
                .choose_kitchen_recipe(&catalog, &stock, 0.0)
                .is_err()
        );
    }
}
