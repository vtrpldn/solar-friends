//! Starting plants are inherited assets; growth and harvest history remain native.
use super::*;
#[derive(Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Stage {
    Empty,
    Planted,
    Mature,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StartingCrop {
    pub crop: String,
    pub stage: Stage,
    pub next_crop: String,
    pub replant: bool,
    pub soil_wetness: f32,
}
pub fn resolve(c: &StartingCrop, kind: &str) -> ecology::Crop {
    let mut crop = ecology::Crop {
        kind: c.crop.clone(),
        next_kind: c.next_crop.clone(),
        replant: c.replant,
        ..Default::default()
    };
    if c.stage != Stage::Empty {
        crop.planted = true;
        crop.moisture = c.soil_wetness * ecology::root_capacity(kind);
        if c.stage == Stage::Mature {
            crop.growth = ecology::duration(&crop);
        }
    }
    crop
}
pub fn check(d: &Definition, r: &mut Report) {
    for (i, b) in d.start.buildings.iter().enumerate().take(MAX_BUILDINGS + 1) {
        let Some(c) = &b.crop else {
            continue;
        };
        if b.state != BuildingState::Completed
            || !matches!(b.kind.as_str(), "garden" | "greenhouse")
            || !ecology::crop_kind(&c.crop)
            || !ecology::crop_kind(&c.next_crop)
            || !c.soil_wetness.is_finite()
            || !(0.0..=1.).contains(&c.soil_wetness)
            || c.stage == Stage::Empty && c.soil_wetness != 0.
        {
            r.push(&format!("start.buildings.{i}.crop"),"invalid_starting_crop","Starting crops need a completed garden or greenhouse, supported crop varieties and root-zone wetness from 0–100%. Empty beds must have zero root-zone wetness. Clear the crop setup to use a construction project.");
            let issue = r.issues.last_mut().unwrap();
            issue.entity = Some(b.id.clone());
            issue.at = Some([b.x, b.y]);
        }
    }
}
pub fn catalog() -> serde_json::Value {
    serde_json::json!({"buildings":["garden","greenhouse"],"crops":ecology::CROPS,"stages":[{"id":Stage::Empty,"name":"Empty bed"},{"id":Stage::Planted,"name":"Newly planted"},{"id":Stage::Mature,"name":"Ready to harvest"}],"example":StartingCrop {crop:"lettuce".into(),stage:Stage::Empty,next_crop:"lettuce".into(),replant:true,soil_wetness:0.}})
}
#[cfg(test)]
mod tests {
    use super::*;
    fn definition(stage: Stage, kind: &str) -> Definition {
        let mut d = Definition::builtin(modes::Mode::Sandbox);
        d.rules.logistics = true;
        d.rules.land = true;
        let mut b = d.start.buildings[0].clone();
        b.id = "our-crops".into();
        b.kind = kind.into();
        b.x = 25;
        b.y = 25;
        b.crop = Some(StartingCrop {
            crop: "tomatoes".into(),
            stage,
            next_crop: "beans".into(),
            replant: false,
            soil_wetness: if stage == Stage::Empty { 0. } else { 0.5 },
        });
        d.start.buildings.push(b);
        d
    }
    #[test]
    fn starting_crop_stages_match_growth_soil_and_exact_saved_state() {
        for kind in ["garden", "greenhouse"] {
            for stage in [Stage::Empty, Stage::Planted, Stage::Mature] {
                let d = definition(stage, kind);
                let (mut g, _) =
                    compile(d).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
                let v = g.app.world().resource::<Village>();
                let id = v.scenario.as_ref().unwrap().buildings["our-crops"];
                let b = v.buildings.iter().find(|b| b.id == id).unwrap();
                assert_eq!(b.crop.planted, stage != Stage::Empty);
                assert_eq!(b.crop.kind, "tomatoes");
                assert_eq!(b.crop.next_kind, "beans");
                assert!(!b.crop.replant);
                assert_eq!(
                    b.crop.growth,
                    if stage == Stage::Mature {
                        ecology::duration(&b.crop)
                    } else {
                        0.
                    }
                );
                assert_eq!(b.crop.harvests, 0);
                assert_eq!(b.crop.nursery, 0.);
                assert_eq!(v.harvests, 0);
                assert_eq!(
                    b.crop.moisture,
                    if stage == Stage::Empty {
                        0.
                    } else {
                        ecology::moisture_capacity(b) * 0.5
                    }
                );
                assert_eq!(
                    v.land.water[(25 * MAP_SIZE + 25) as usize],
                    if stage == Stage::Empty { 0. } else { 0.5 }
                );
                let saved = g.snapshot();
                assert!(g.restore(&saved));
                assert_eq!(g.snapshot(), saved);
            }
        }
    }
    #[test]
    fn impossible_starting_plants_reject_without_changing_the_village() {
        let d = definition(Stage::Mature, "garden");
        let (mut g, _) =
            compile(d.clone()).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
        let before = g.snapshot();
        for case in ["project", "building", "crop", "next", "wetness", "empty"] {
            let mut bad = d.clone();
            let b = bad.start.buildings.last_mut().unwrap();
            match case {
                "project" => b.state = BuildingState::Blueprint,
                "building" => b.kind = "home".into(),
                "crop" => b.crop.as_mut().unwrap().crop = "unknown".into(),
                "next" => b.crop.as_mut().unwrap().next_crop = "unknown".into(),
                "wetness" => b.crop.as_mut().unwrap().soil_wetness = 1.01,
                _ => b.crop.as_mut().unwrap().stage = Stage::Empty,
            };
            let report: serde_json::Value =
                serde_json::from_str(&g.load_scenario(&serde_json::to_string(&bad).unwrap()))
                    .unwrap();
            assert_eq!(report["ok"], false, "{case}");
            assert_eq!(g.snapshot(), before);
        }
    }
}

#[cfg(test)]
mod harvest_tests {
    use super::*;
    #[test]
    fn inherited_ready_crops_require_actual_resident_harvesting_before_credit() {
        let mut d = Definition::builtin(modes::Mode::Sandbox);
        d.rules.logistics = true;
        d.rules.land = true;
        d.rules.utilities = true;
        for p in &mut d.start.inventories {
            for m in ["food", "meals", "eggs", "milk", "honey"] {
                p.items.remove(m);
            }
        }
        let mut b = d.start.buildings[0].clone();
        b.id = "ready-bed".into();
        b.kind = "garden".into();
        b.x = 25;
        b.y = 25;
        b.crop = Some(StartingCrop {
            crop: "tomatoes".into(),
            next_crop: "beans".into(),
            stage: Stage::Mature,
            replant: false,
            soil_wetness: 0.5,
        });
        d.start.buildings.push(b);
        let (mut g, _) =
            compile(d).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
        assert_eq!(g.app.world().resource::<Village>().harvests, 0);
        let before = g.snapshot();
        assert!(g.restore(&before));
        assert_eq!(g.snapshot(), before);
        for _ in 0..6000 {
            g.tick(0.25);
            if g.app.world().resource::<Village>().harvests > 0 {
                break;
            }
        }
        let v = g.app.world().resource::<Village>();
        assert!(v.harvests > 0, "{}", g.agriculture_report());
        let id = v.scenario.as_ref().unwrap().buildings["ready-bed"];
        assert_eq!(
            v.buildings
                .iter()
                .find(|b| b.id == id)
                .unwrap()
                .crop
                .harvests,
            1
        );
        assert!(v.simulation.materials.as_ref().unwrap().received[economy::FOOD] > 0);
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_eq!(g.snapshot(), saved);
    }
}
