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
    let mut items: Vec<BTreeMap<String, u32>> = vec![BTreeMap::new(); locations.len()];
    let mut room: Vec<u32> = locations.iter().map(|p| p.capacity).collect();
    let mut budget = capacity;
    let mut unassigned = BTreeMap::new();
    let mut materials: Vec<_> = (0..economy::COUNT).collect();
    materials.sort_by_key(|i| freshness::lifetime(*i).is_none());
    for material in materials {
        let mut left = totals[material];
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
        .zip(items)
        .filter(|(_, items)| !items.is_empty())
        .map(|(p, items)| Inventory {
            owner: p.owner.clone(),
            items,
        })
        .collect();
    serde_json::json!({"ok":unassigned.is_empty(),"locations":locations,"capacity":capacity,"total":total,"inventories":inventories,"unassigned":unassigned,"policy":"Food goes to storage houses and kitchens first. Other supplies use the arrival store first. Every unit keeps a real owner; global village capacity also applies. Food starts fresh at the scenario date."})
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
