use super::*;

impl Construction {
    pub fn kitchen_controls(&mut self, keys: &ButtonInput<KeyCode>) {
        let policy = &mut self.production.kitchen_policy;
        if keys.just_pressed(KeyCode::KeyY) {
            policy.automatic = !policy.automatic;
            policy.next_check = 0.0;
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
        if stock.sandbox || !policy.automatic || clock < policy.next_check {
            return;
        }
        policy.next_check = clock + 1.0;
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
        for index in kitchens {
            if let Some(recipe) = self.choose_kitchen_recipe(catalog, stock, clock) {
                self.queue_batch(catalog, stock, index, recipe);
            }
        }
    }

    fn choose_kitchen_recipe<'a>(
        &self,
        catalog: &'a Catalog,
        stock: &Stock,
        clock: f64,
    ) -> Option<&'a str> {
        let pending_units = self
            .production
            .jobs
            .iter()
            .map(|job| {
                job.delivered_output
                    .as_ref()
                    .unwrap_or(&catalog.production[&job.recipe].output)
                    .values()
                    .map(|units| u64::from(*units))
                    .sum::<u64>()
            })
            .sum::<u64>();
        let available = self
            .storage_space(catalog, stock)
            .saturating_sub(pending_units);
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
            let best = catalog
                .production
                .iter()
                .filter(|(_, recipe)| {
                    recipe.kind == "kitchen"
                        && recipe.preserved.contains_key("meals") == preserved
                        && recipe
                            .output
                            .get("meals")
                            .is_some_and(|&units| u64::from(units) <= room)
                        && recipe
                            .output
                            .values()
                            .map(|&units| u64::from(units))
                            .sum::<u64>()
                            <= available
                        && stock.missing(&recipe.input).is_none()
                        && enough_to_eat(stock, &recipe.input)
                        && ingredients_keep(stock, &recipe.input, clock + recipe.work)
                })
                .min_by(|(a, left), (b, right)| {
                    earliest_ingredient(stock, &left.input)
                        .total_cmp(&earliest_ingredient(stock, &right.input))
                        .then_with(|| a.cmp(b))
                });
            if let Some((id, _)) = best {
                return Some(id);
            }
        }
        None
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
            Some("preserve_meals")
        );

        let doomed = stock.pantry.lots.get_mut("food").unwrap();
        doomed[0].expires = 10.0;
        assert!(
            village
                .choose_kitchen_recipe(&catalog, &stock, 0.0)
                .is_none()
        );
        stock.pantry.lots.get_mut("food").unwrap()[0].expires = 900.0;
        stock.reserve_available(&BTreeMap::from([("meals".to_owned(), 12)]));
        assert!(
            village
                .choose_kitchen_recipe(&catalog, &stock, 0.0)
                .is_none()
        );
    }
}
