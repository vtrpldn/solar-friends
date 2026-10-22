//! Inherited livestock are distinct from an empty enclosure and future stocking work.
use super::*;
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StartingAnimals {
    pub stocked: bool,
    pub stocking_requested: bool,
    pub enabled: bool,
    pub care_remaining: f32,
    pub welfare: f32,
    pub ready: bool,
}
pub fn resolve(a: &StartingAnimals, kind: &str, minutes: f32) -> agriculture::Plot {
    agriculture::Plot {
        stocked: a.stocked,
        stocking_requested: a.stocking_requested,
        enabled: a.enabled,
        cared_until: if a.care_remaining > 0. {
            minutes + a.care_remaining
        } else {
            0.
        },
        welfare: a.welfare,
        pending: if a.ready {
            if kind == "goat_pasture" {
                agriculture::goat_yield(a.welfare)
            } else {
                3
            }
        } else {
            0
        },
        ..Default::default()
    }
}
pub fn check(d: &Definition, r: &mut Report) {
    for (i, b) in d.start.buildings.iter().enumerate().take(MAX_BUILDINGS + 1) {
        let Some(a) = &b.animals else { continue };
        let duration = if b.kind == "goat_pasture" {
            1440.
        } else {
            2880.
        };
        if !matches!(b.kind.as_str(), "goat_pasture" | "apiary")
            || b.state != BuildingState::Completed
            || !a.care_remaining.is_finite()
            || !(0.0..=duration).contains(&a.care_remaining)
            || !a.welfare.is_finite()
            || !(0.0..=100.).contains(&a.welfare)
            || a.stocked && a.stocking_requested
            || !a.stocked && (a.ready || a.care_remaining != 0.)
        {
            r.push(&format!("start.buildings.{i}.animals"),"invalid_starting_animals","Animal setup needs a completed goat pasture or apiary. Empty enclosures cannot contain produce or inherited care; occupied enclosures cannot request stocking. Use valid care time and wellbeing from 0–100%.");
            let issue = r.issues.last_mut().unwrap();
            issue.entity = Some(b.id.clone());
            issue.at = Some([b.x, b.y]);
        }
    }
}
pub fn catalog() -> serde_json::Value {
    serde_json::json!({"buildings":[{"id":"goat_pasture","material":"goats","care_minutes":1440,"ready_amount":4},{"id":"apiary","material":"bees","care_minutes":2880,"ready_amount":3}],"example":StartingAnimals{stocked:true,stocking_requested:false,enabled:true,care_remaining:0.,welfare:70.,ready:false}})
}
#[cfg(test)]
mod tests {
    use super::*;
    fn definition(kind: &str, stocked: bool) -> Definition {
        let mut d = Definition::builtin(modes::Mode::Sandbox);
        d.rules.logistics = true;
        d.rules.land = true;
        d.rules.utilities = true;
        let mut b = d.start.buildings[0].clone();
        b.id = "our-animals".into();
        b.kind = kind.into();
        b.x = 25;
        b.y = 25;
        b.animals = Some(StartingAnimals {
            stocked,
            stocking_requested: false,
            enabled: true,
            care_remaining: 0.,
            welfare: 70.,
            ready: false,
        });
        d.start.buildings.push(b);
        d
    }
    #[test]
    fn empty_enclosures_have_no_care_production_or_pollination_and_restore_exactly() {
        for kind in ["goat_pasture", "apiary"] {
            let (mut g, _) = compile(definition(kind, false))
                .unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
            let v = g.app.world().resource::<Village>();
            let b = v.buildings.last().unwrap();
            assert!(!agriculture::wanted(v, b.id));
            assert!(!agriculture::ready(v, b));
            let mut needs = [0; economy::COUNT];
            agriculture::needs(v, logistics::Owner::Pantry(b.id), &mut needs);
            assert_eq!(needs, [0; economy::COUNT]);
            let mut world = v.clone();
            world.minutes += 2880.;
            agriculture::advance(&mut world, 2880.);
            let p = &world.buildings.last().unwrap().agriculture;
            assert_eq!(p.welfare, 70.);
            assert_eq!(p.pending, 0);
            assert_eq!(p.growth, 0.);
            let saved = g.snapshot();
            assert!(g.restore(&saved));
            assert_eq!(g.snapshot(), saved);
        }
    }
    #[test]
    fn residents_stock_only_delivered_animals_once_and_cancellation_preserves_them() {
        for (kind, key, material) in [
            ("goat_pasture", "goats", economy::GOATS),
            ("apiary", "bees", economy::BEES),
        ] {
            let mut d = definition(kind, false);
            let id = d.start.buildings.last().unwrap().id.clone();
            d.start.inventories.push(Inventory {
                owner: InventoryOwner::Building(id),
                items: BTreeMap::from([(key.into(), 1)]),
                food_lots: vec![],
            });
            let (mut g, _) =
                compile(d).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
            let id = g
                .app
                .world()
                .resource::<Village>()
                .buildings
                .last()
                .unwrap()
                .id;
            assert!(g.request_animal_stocking(id, true));
            assert!(g.request_animal_stocking(id, false));
            assert_eq!(
                economy::quantity(g.app.world().resource::<Village>(), material),
                1
            );
            assert!(g.request_animal_stocking(id, true));
            for _ in 0..6000 {
                g.tick(0.25);
                if g.app
                    .world()
                    .resource::<Village>()
                    .buildings
                    .iter()
                    .find(|b| b.id == id)
                    .unwrap()
                    .agriculture
                    .stocked
                {
                    break;
                }
            }
            let v = g.app.world().resource::<Village>();
            let p = &v.buildings.iter().find(|b| b.id == id).unwrap().agriculture;
            assert!(p.stocked);
            assert!(!p.stocking_requested);
            assert_eq!(economy::quantity(v, material), 0);
            assert_eq!(v.simulation.materials.as_ref().unwrap().spent[material], 1);
            assert!(!g.request_animal_stocking(id, true));
            let saved = g.snapshot();
            assert!(g.restore(&saved));
            assert_eq!(g.snapshot(), saved);
        }
    }
    #[test]
    fn inherited_care_and_ready_produce_grant_no_collection_credit_and_invalid_states_reject() {
        let mut d = definition("goat_pasture", true);
        let a = d
            .start
            .buildings
            .last_mut()
            .unwrap()
            .animals
            .as_mut()
            .unwrap();
        a.care_remaining = 720.;
        a.ready = true;
        a.welfare = 45.;
        let (g, _) =
            compile(d.clone()).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
        let v = g.app.world().resource::<Village>();
        let p = &v.buildings.last().unwrap().agriculture;
        assert_eq!(p.cared_until, v.minutes + 720.);
        assert_eq!(p.pending, 4);
        assert_eq!(p.harvested, 0);
        assert_eq!(v.progress.milk_collected, 0);
        assert_eq!(
            v.simulation.materials.as_ref().unwrap().received[economy::MILK],
            0
        );
        d.start
            .buildings
            .last_mut()
            .unwrap()
            .animals
            .as_mut()
            .unwrap()
            .stocked = false;
        assert!(compile(d.clone()).is_err());
        d.start.buildings.last_mut().unwrap().animals = None;
        d.start.buildings.last_mut().unwrap().kind = "home".into();
        d.start.buildings.last_mut().unwrap().animals = Some(StartingAnimals {
            stocked: true,
            stocking_requested: false,
            enabled: true,
            care_remaining: 0.,
            welfare: 70.,
            ready: false,
        });
        assert!(compile(d).is_err());
    }
    #[test]
    fn older_occupied_saves_migrate_but_current_missing_occupancy_is_rejected() {
        let (mut g, _) = compile(definition("goat_pasture", true))
            .unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
        let before = g.snapshot();
        let mut raw: serde_json::Value = serde_json::from_str(&before).unwrap();
        for b in raw["village"]["buildings"].as_array_mut().unwrap() {
            b["agriculture"].as_object_mut().unwrap().remove("stocked");
            b["agriculture"]
                .as_object_mut()
                .unwrap()
                .remove("stocking_requested");
        }
        assert!(!g.restore(&raw.to_string()));
        assert_eq!(g.snapshot(), before);
        raw["village"]["version"] = 43.into();
        assert!(g.restore(&raw.to_string()));
        assert_eq!(g.app.world().resource::<Village>().version, 44);
        assert!(
            g.app
                .world()
                .resource::<Village>()
                .buildings
                .last()
                .unwrap()
                .agriculture
                .stocked
        );
    }
}
