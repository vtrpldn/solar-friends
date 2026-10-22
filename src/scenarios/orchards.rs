//! Inherited orchard state, without invented harvest or production history.
use super::*;
#[derive(Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Stage {
    Young,
    Established,
    Ready,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StartingOrchard {
    pub stage: Stage,
    pub enabled: bool,
    pub soil_wetness: f32,
}
pub fn resolve(source: &StartingOrchard) -> agriculture::Plot {
    agriculture::Plot {
        enabled: source.enabled,
        fruiting: source.stage != Stage::Young,
        pending: if source.stage == Stage::Ready {
            agriculture::ORCHARD_BASE_FRUIT
        } else {
            0
        },
        ..Default::default()
    }
}
pub fn check(d: &Definition, r: &mut Report) {
    for (i, b) in d.start.buildings.iter().enumerate().take(MAX_BUILDINGS + 1) {
        let Some(c) = &b.orchard else {
            continue;
        };
        if b.kind != "orchard"
            || b.state != BuildingState::Completed
            || !c.soil_wetness.is_finite()
            || !(0.0..=1.).contains(&c.soil_wetness)
        {
            r.push(&format!("start.buildings.{i}.orchard"),"invalid_starting_orchard","Starting fruit trees need a completed fruit orchard and root-zone wetness from 0–100%. Clear the orchard setup to use a construction project.");
            let issue = r.issues.last_mut().unwrap();
            issue.entity = Some(b.id.clone());
            issue.at = Some([b.x, b.y]);
        }
    }
}
pub fn initialize_ground(v: &mut Village) {
    let Some(origin) = v.scenario.clone() else {
        return;
    };
    for b in &origin.definition.start.buildings {
        if let Some(c) = &b.orchard
            && c.soil_wetness > 0.
        {
            land::water_plot(
                v,
                interactions::footprint_size(&b.kind),
                b.x,
                b.y,
                c.soil_wetness,
            );
        }
    }
}
pub fn catalog() -> serde_json::Value {
    serde_json::json!({"building":"orchard","stages":[{"id":Stage::Young,"name":"Trees establishing"},{"id":Stage::Established,"name":"Established trees"},{"id":Stage::Ready,"name":"Fruit ready to collect"}],"first_growth_minutes":agriculture::ORCHARD_ESTABLISH_MINUTES,"repeat_growth_minutes":agriculture::ORCHARD_FRUIT_MINUTES,"ready_fruit":agriculture::ORCHARD_BASE_FRUIT,"example":StartingOrchard{stage:Stage::Young,enabled:true,soil_wetness:0.}})
}
#[cfg(test)]
mod tests {
    use super::*;
    fn definition(stage: Stage) -> Definition {
        let mut d = Definition::builtin(modes::Mode::Sandbox);
        d.rules.logistics = true;
        d.rules.land = true;
        d.rules.utilities = true;
        let mut b = d.start.buildings[0].clone();
        b.id = "our-orchard".into();
        b.kind = "orchard".into();
        b.x = 25;
        b.y = 25;
        b.orchard = Some(StartingOrchard {
            stage,
            enabled: true,
            soil_wetness: 0.75,
        });
        d.start.buildings.push(b);
        d
    }
    #[test]
    fn orchard_starts_have_real_ground_and_pending_fruit_but_no_collected_history() {
        for stage in [Stage::Young, Stage::Established, Stage::Ready] {
            let d = definition(stage);
            let (mut g, _) =
                compile(d).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
            let v = g.app.world().resource::<Village>();
            let id = v.scenario.as_ref().unwrap().buildings["our-orchard"];
            let b = v.buildings.iter().find(|b| b.id == id).unwrap();
            assert_eq!(b.agriculture.fruiting, stage != Stage::Young);
            assert_eq!(
                b.agriculture.pending,
                if stage == Stage::Ready { 8 } else { 0 }
            );
            assert_eq!(b.agriculture.growth, 0.);
            assert_eq!(b.agriculture.harvested, 0);
            assert_eq!(v.progress.orchard_fruit, 0);
            assert_eq!(
                v.simulation.materials.as_ref().unwrap().received[economy::FOOD],
                0
            );
            assert_eq!(v.land.water[(25 * MAP_SIZE + 25) as usize], 0.75);
            let saved = g.snapshot();
            assert!(g.restore(&saved));
            assert_eq!(g.snapshot(), saved);
        }
    }
    #[test]
    fn impossible_orchards_reject_atomically_and_paused_fruit_requires_work() {
        let d = definition(Stage::Ready);
        let (mut g, _) =
            compile(d.clone()).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
        let before = g.snapshot();
        for case in ["kind", "project", "wetness", "negative"] {
            let mut bad = d.clone();
            let b = bad.start.buildings.last_mut().unwrap();
            match case {
                "kind" => b.kind = "home".into(),
                "project" => b.state = BuildingState::Blueprint,
                "wetness" => b.orchard.as_mut().unwrap().soil_wetness = 1.01,
                _ => b.orchard.as_mut().unwrap().soil_wetness = -0.1,
            };
            let report: serde_json::Value =
                serde_json::from_str(&g.load_scenario(&serde_json::to_string(&bad).unwrap()))
                    .unwrap();
            assert_eq!(report["ok"], false);
            assert_eq!(g.snapshot(), before);
        }
        let mut paused = d;
        paused
            .start
            .buildings
            .last_mut()
            .unwrap()
            .orchard
            .as_mut()
            .unwrap()
            .enabled = false;
        for p in &mut paused.start.inventories {
            for m in ["food", "meals", "eggs", "milk", "honey"] {
                p.items.remove(m);
            }
        }
        let (mut g, _) =
            compile(paused).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
        let v = g.app.world().resource::<Village>();
        let id = v.scenario.as_ref().unwrap().buildings["our-orchard"];
        assert!(!agriculture::ready(
            v,
            v.buildings.iter().find(|b| b.id == id).unwrap()
        ));
        assert_eq!(v.progress.orchard_fruit, 0);
        assert!(g.configure_agriculture(id, true));
        let v = g.app.world().resource::<Village>();
        assert!(agriculture::ready(
            v,
            v.buildings.iter().find(|b| b.id == id).unwrap()
        ));
        assert_eq!(v.progress.orchard_fruit, 0);
    }
    #[test]
    fn inherited_ready_fruit_is_credited_only_after_actual_resident_collection() {
        let mut d = definition(Stage::Ready);
        for p in &mut d.start.inventories {
            for m in ["food", "meals", "eggs", "milk", "honey"] {
                p.items.remove(m);
            }
        }
        let (mut g, _) =
            compile(d).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
        assert_eq!(
            g.app.world().resource::<Village>().progress.orchard_fruit,
            0
        );
        for _ in 0..6000 {
            g.tick(0.25);
            if g.app.world().resource::<Village>().progress.orchard_fruit > 0 {
                break;
            }
        }
        let v = g.app.world().resource::<Village>();
        assert_eq!(v.progress.orchard_fruit, 8, "{}", g.agriculture_report());
        let id = v.scenario.as_ref().unwrap().buildings["our-orchard"];
        let b = v.buildings.iter().find(|b| b.id == id).unwrap();
        assert_eq!(b.agriculture.harvested, 8);
        assert_eq!(b.agriculture.pending, 0);
        assert_eq!(
            v.simulation.materials.as_ref().unwrap().received[economy::FOOD],
            8
        );
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_eq!(g.snapshot(), saved);
    }
}
