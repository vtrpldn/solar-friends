//! Read-only supply placement proposals. Never replace a draft or running game.
use super::*;
#[derive(Clone, Serialize)]
pub struct Location {
    pub owner: InventoryOwner,
    pub capacity: u32,
    pub kind: String,
    pub x: i32,
    pub y: i32,
}
pub fn locations(d: &Definition) -> Vec<Location> {
    let mut result = vec![Location {
        owner: InventoryOwner::Camp,
        capacity: economy::CAPACITY,
        kind: "camp".into(),
        x: d.map.camp[0],
        y: d.map.camp[1],
    }];
    result.extend(d.start.buildings.iter().filter_map(|b| {
        logistics::receiving_capacity(&b.kind, b.state == BuildingState::Completed).map(
            |capacity| Location {
                owner: InventoryOwner::Building(b.id.clone()),
                capacity,
                kind: b.kind.clone(),
                x: b.x,
                y: b.y,
            },
        )
    }));
    result
}
pub fn valid_food(inventory: &Inventory, minutes: f32) -> bool {
    if inventory.food_lots.len() > economy::CAPACITY as usize {
        return false;
    }
    let mut quantities = [0u32; economy::COUNT];
    for lot in &inventory.food_lots {
        let Some(i) = economy::NAMES.iter().position(|m| *m == lot.material) else {
            return false;
        };
        let Some(life) = freshness::lifetime(i) else {
            return false;
        };
        let produced = minutes - lot.age_minutes;
        if lot.amount == 0
            || lot.amount > economy::CAPACITY
            || !lot.age_minutes.is_finite()
            || lot.age_minutes < 0.
            || lot.age_minutes >= life
            || produced + life <= minutes
            || lot.age_minutes > 0. && produced >= minutes
        {
            return false;
        }
        quantities[i] += lot.amount;
    }
    quantities
        .iter()
        .enumerate()
        .all(|(i, n)| *n <= inventory.items.get(economy::NAMES[i]).copied().unwrap_or(0))
}
fn batches(inventory: &Inventory, material: usize) -> Vec<StartingFood> {
    let name = economy::NAMES[material];
    let mut result: Vec<_> = inventory
        .food_lots
        .iter()
        .filter(|l| l.material == name)
        .cloned()
        .collect();
    let declared: u32 = result.iter().map(|l| l.amount).sum();
    let fresh = inventory.items.get(name).copied().unwrap_or(0) - declared;
    if fresh > 0 {
        result.push(StartingFood {
            material: name.into(),
            amount: fresh,
            age_minutes: 0.,
        });
    }
    result
}
pub fn resolved_food(inventory: &Inventory, minutes: f32) -> Vec<freshness::Lot> {
    let mut result = vec![];
    for i in 0..economy::COUNT {
        if freshness::lifetime(i).is_some() {
            for lot in batches(inventory, i) {
                freshness::add(&mut result, i, lot.amount, minutes - lot.age_minutes);
            }
        }
    }
    result
}
pub fn past_dates(v: &Village) -> HashSet<(usize, u32)> {
    let Some(origin) = &v.scenario else {
        return HashSet::new();
    };
    origin
        .definition
        .start
        .inventories
        .iter()
        .flat_map(|p| &p.food_lots)
        .filter_map(|lot| {
            let produced = origin.definition.start.minutes - lot.age_minutes;
            economy::NAMES
                .iter()
                .position(|m| *m == lot.material)
                .filter(|i| produced < 0. && freshness::lifetime(*i).is_some())
                .map(|i| (i, produced.to_bits()))
        })
        .collect()
}
pub fn preview(raw: &str, distribute: bool) -> serde_json::Value {
    let d = match parse(raw) {
        Ok(d) => d,
        Err(r) => return serde_json::json!({"ok":false,"issues":r.issues}),
    };
    if d.start.buildings.len() > MAX_BUILDINGS
        || d.start.inventories.len() > MAX_BUILDINGS + 1
        || d.start.inventories.iter().any(|p| {
            p.items.len() > economy::COUNT
                || p.items
                    .iter()
                    .any(|(k, n)| !economy::NAMES.contains(&k.as_str()) || *n > economy::CAPACITY)
        })
    {
        return serde_json::json!({"ok":false,"issues":Report::error("start.inventories","invalid_supplies","Use supported supplies, quantities and bounded storage locations before distributing.").issues});
    }
    let locations = locations(&d);
    let capacity = economy::CAPACITY
        + 300
            * d.start
                .buildings
                .iter()
                .filter(|b| b.kind == "warehouse" && b.state == BuildingState::Completed)
                .count() as u32;
    let totals: Vec<u32> = economy::NAMES
        .iter()
        .map(|key| {
            d.start
                .inventories
                .iter()
                .map(|p| p.items.get(*key).copied().unwrap_or(0))
                .sum()
        })
        .collect();
    let total: u32 = totals.iter().sum();
    if !distribute {
        return serde_json::json!({"ok":true,"locations":locations,"capacity":capacity,"total":total});
    }
    if d.start
        .inventories
        .iter()
        .any(|p| !valid_food(p, d.start.minutes))
    {
        return serde_json::json!({"ok":false,"issues":Report::error("start.inventories","invalid_starting_food","Repair the starting food batches before distributing. No quantities or ages have changed.").issues});
    }
    let mut food: Vec<Vec<StartingFood>> = vec![vec![]; locations.len()];
    let mut items: Vec<BTreeMap<String, u32>> = vec![BTreeMap::new(); locations.len()];
    let mut room: Vec<u32> = locations.iter().map(|p| p.capacity).collect();
    let mut budget = capacity;
    let mut unassigned = BTreeMap::new();
    let mut materials: Vec<_> = (0..economy::COUNT).collect();
    materials.sort_by_key(|i| freshness::lifetime(*i).is_none());
    for material in materials {
        let mut left = totals[material];
        let mut lots: Vec<_> = if freshness::lifetime(material).is_some() {
            d.start
                .inventories
                .iter()
                .flat_map(|p| batches(p, material))
                .collect()
        } else {
            vec![]
        };
        lots.sort_by(|a, b| b.age_minutes.total_cmp(&a.age_minutes));
        let mut batch = 0;
        let mut order: Vec<_> = (0..locations.len()).collect();
        if freshness::lifetime(material).is_some() {
            order.sort_by_key(|i| match locations[*i].kind.as_str() {
                "warehouse" | "kitchen" => 0,
                "camp" => 2,
                _ => 1,
            });
        }
        for i in order {
            let n = left.min(room[i]).min(budget);
            if n > 0 {
                items[i].insert(economy::NAMES[material].into(), n);
                if !lots.is_empty() {
                    let mut remaining = n;
                    while remaining > 0 {
                        let amount = remaining.min(lots[batch].amount);
                        if lots[batch].age_minutes > 0. {
                            let mut lot = lots[batch].clone();
                            lot.amount = amount;
                            food[i].push(lot);
                        }
                        remaining -= amount;
                        lots[batch].amount -= amount;
                        if lots[batch].amount == 0 {
                            batch += 1;
                        }
                    }
                }
                room[i] -= n;
                budget -= n;
                left -= n;
            }
            if left == 0 {
                break;
            }
        }
        if left > 0 {
            unassigned.insert(economy::NAMES[material], left);
        }
    }
    let inventories: Vec<_> = locations
        .iter()
        .zip(items.into_iter().zip(food))
        .filter(|(_, (items, _))| !items.is_empty())
        .map(|(p, (items, food_lots))| Inventory {
            owner: p.owner.clone(),
            items,
            food_lots,
        })
        .collect();
    serde_json::json!({"ok":unassigned.is_empty(),"locations":locations,"capacity":capacity,"total":total,"inventories":inventories,"unassigned":unassigned,"policy":"Food goes to storage houses and kitchens first. Other supplies use the arrival store first. Every unit keeps a real owner; global village capacity also applies. Every food batch keeps its age. Unspecified food starts fresh at the scenario date."})
}

#[cfg(test)]
mod tests {
    use super::*;
    fn totals(d: &Definition) -> Vec<u32> {
        economy::NAMES
            .iter()
            .map(|m| {
                d.start
                    .inventories
                    .iter()
                    .map(|i| i.items.get(*m).copied().unwrap_or(0))
                    .sum()
            })
            .collect()
    }
    #[test]
    fn distribution_is_read_only_conserves_every_material_and_compiles_with_real_owners() {
        let mut g = Game::new();
        let before = g.snapshot();
        let d = Definition::builtin(modes::Mode::Sandbox);
        let raw = serde_json::to_string(&d).unwrap();
        let result = preview(&raw, true);
        assert_eq!(result["ok"], true);
        let mut proposed = d.clone();
        proposed.start.inventories = serde_json::from_value(result["inventories"].clone()).unwrap();
        assert_eq!(totals(&proposed), totals(&d));
        let (mut game, _) =
            compile(proposed).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
        let saved = game.snapshot();
        assert!(game.restore(&saved));
        assert_eq!(game.snapshot(), saved);
        assert_eq!(g.scenario_supplies(&raw, true), result.to_string());
        assert_eq!(g.snapshot(), before);
        assert!(g.restore(&before));
        let food = game
            .app
            .world()
            .resource::<Village>()
            .logistics
            .as_ref()
            .unwrap()
            .stores
            .iter()
            .find(|p| p.items[economy::FOOD] > 0)
            .unwrap();
        assert!(matches!(food.owner, logistics::Owner::Warehouse(_)));
    }
    #[test]
    fn proposals_report_overflow_and_never_drop_unknown_materials() {
        let mut d = Definition::builtin(modes::Mode::Sandbox);
        for i in &mut d.start.inventories {
            i.items.clear();
        }
        d.start.inventories[0].items.insert("timber".into(), 600);
        d.start.inventories[1].items.insert("stone".into(), 600);
        let raw = serde_json::to_string(&d).unwrap();
        let result = preview(&raw, true);
        assert_eq!(result["ok"], false);
        assert_eq!(result["total"], 1200);
        assert_eq!(result["capacity"], 900);
        assert_eq!(result["unassigned"]["stone"], 300);
        d.start.inventories[0].items.insert("unavailable".into(), 1);
        assert_eq!(
            preview(&serde_json::to_string(&d).unwrap(), true)["ok"],
            false
        );
    }
    #[test]
    fn starting_workshop_pantries_and_projects_resolve_their_real_native_store() {
        let mut d = Definition::builtin(modes::Mode::Sandbox);
        d.start.inventories.clear();
        for (kind, state, x, y) in [
            ("workshop", BuildingState::Completed, 25, 25),
            ("kitchen", BuildingState::Completed, 25, 30),
            ("home", BuildingState::Blueprint, 25, 35),
        ] {
            let mut b = d.start.buildings[0].clone();
            b.id = format!("gift-{kind}");
            b.kind = kind.into();
            b.state = state;
            b.x = x;
            b.y = y;
            d.start.buildings.push(b.clone());
            d.start.inventories.push(Inventory {
                owner: InventoryOwner::Building(b.id),
                food_lots: vec![],
                items: BTreeMap::from([("earth".into(), 2), ("food".into(), 3)]),
            });
        }
        let (mut g, _) =
            compile(d).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
        let v = g.app.world().resource::<Village>();
        for kind in ["workshop", "kitchen", "home"] {
            let id = v.scenario.as_ref().unwrap().buildings[&format!("gift-{kind}")];
            let owner = logistics::building_owner(v, id).unwrap();
            let store = v
                .logistics
                .as_ref()
                .unwrap()
                .stores
                .iter()
                .find(|p| p.owner == owner)
                .unwrap();
            assert_eq!(store.items[2], 2);
            assert_eq!(store.items[economy::FOOD], 3);
        }
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_eq!(g.snapshot(), saved);
    }
}

#[cfg(test)]
mod aged_tests {
    use super::*;
    fn definition() -> Definition {
        let mut d = Definition::builtin(modes::Mode::Sandbox);
        d.rules.logistics = true;
        d.start.inventories = vec![Inventory {
            owner: InventoryOwner::Camp,
            items: BTreeMap::from([("milk".into(), 2)]),
            food_lots: vec![StartingFood {
                material: "milk".into(),
                amount: 1,
                age_minutes: 2879.,
            }],
        }];
        d
    }
    #[test]
    fn authored_old_food_predates_arrival_expires_normally_and_restores_exactly() {
        let d = definition();
        let (mut g, _) =
            compile(d.clone()).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
        let before = g.snapshot();
        let (mut copy, _) =
            compile(d).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
        assert!(copy.restore(&before));
        assert_eq!(copy.snapshot(), before);
        let v = g.app.world().resource::<Village>();
        let lots = &v
            .logistics
            .as_ref()
            .unwrap()
            .stores
            .iter()
            .find(|p| p.owner == logistics::Owner::Camp)
            .unwrap()
            .food_lots;
        assert_eq!(lots.len(), 2);
        assert_eq!(lots[0].produced, -2399.);
        assert_eq!(lots[0].expires, 481.);
        assert_eq!(lots[1].produced, 480.);
        for _ in 0..4 {
            g.tick(0.25);
            copy.tick(0.25);
        }
        assert_eq!(g.snapshot(), copy.snapshot());
        let v = g.app.world().resource::<Village>();
        assert_eq!(economy::quantity(v, economy::MILK), 1);
        assert_eq!(v.freshness.expired[economy::MILK], 1);
        assert_eq!(
            v.simulation.materials.as_ref().unwrap().spent[economy::MILK],
            1
        );
        let after = g.snapshot();
        assert!(copy.restore(&after));
        assert_eq!(copy.snapshot(), after);
        for produced in [-2000., -2400.] {
            let mut bad: serde_json::Value = serde_json::from_str(&before).unwrap();
            let lot = &mut bad["village"]["logistics"]["stores"][0]["food_lots"][0];
            lot["produced"] = serde_json::json!(produced);
            lot["expires"] = serde_json::json!(produced + 2880.);
            assert!(!g.restore(&bad.to_string()));
            assert_eq!(g.snapshot(), after);
        }
    }
    #[test]
    fn distribution_preserves_distinct_ages_and_invalid_batches_are_atomic() {
        let d = definition();
        let result = preview(&serde_json::to_string(&d).unwrap(), true);
        assert_eq!(result["ok"], true);
        let mut proposed = d.clone();
        proposed.start.inventories = serde_json::from_value(result["inventories"].clone()).unwrap();
        let source = resolved_food(&d.start.inventories[0], 480.);
        let output: Vec<_> = proposed
            .start
            .inventories
            .iter()
            .flat_map(|p| resolved_food(p, 480.))
            .collect();
        assert_eq!(source, output);
        assert!(compile(proposed).is_ok());
        let (mut g, _) =
            compile(d.clone()).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
        let stable = g.snapshot();
        for (material, amount, age) in [
            ("milk", 1, -1.),
            ("milk", 1, 2880.),
            ("milk", 3, 1.),
            ("milk", 0, 1.),
            ("timber", 1, 1.),
            ("missing", 1, 1.),
        ] {
            let mut bad = d.clone();
            bad.start.inventories[0].food_lots = vec![StartingFood {
                material: material.into(),
                amount,
                age_minutes: age,
            }];
            let report: serde_json::Value =
                serde_json::from_str(&g.load_scenario(&serde_json::to_string(&bad).unwrap()))
                    .unwrap();
            assert_eq!(report["ok"], false);
            assert_eq!(g.snapshot(), stable);
        }
        let mut plain = Definition::builtin(modes::Mode::Sandbox);
        plain.start.inventories[0].food_lots.clear();
        let (mut ordinary, _) =
            compile(plain).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
        let saved = ordinary.snapshot();
        let mut bad: serde_json::Value = serde_json::from_str(&saved).unwrap();
        let stores = bad["village"]["logistics"]["stores"]
            .as_array_mut()
            .unwrap();
        let lot = stores
            .iter_mut()
            .flat_map(|p| p["food_lots"].as_array_mut().unwrap())
            .next()
            .unwrap();
        let material = lot["material"].as_u64().unwrap() as usize;
        lot["produced"] = serde_json::json!(-1.);
        lot["expires"] = serde_json::json!(-1. + freshness::lifetime(material).unwrap());
        assert!(!ordinary.restore(&bad.to_string()));
        assert_eq!(ordinary.snapshot(), saved);
    }
}
