use super::*;
fn definition(condition: GoalCondition) -> Definition {
    let mut d = Definition::builtin(modes::Mode::Sandbox);
    d.rules.logistics = true;
    d.rules.land = true;
    d.rules.utilities = true;
    d.journal=Some(serde_json::from_value(serde_json::json!({"schema":1,"introduction":"Our growing land","completion":"Keep caring for it.","chapters":[{"id":"first","title":"Living land","description":"","goals":[{"id":"living","title":"Care for our land","description":"","optional":false,"condition":condition}]}]})).unwrap());
    d
}
fn structure(d: &mut Definition, kind: &str) -> usize {
    let mut b = d.start.buildings[0].clone();
    b.id = format!("our-{kind}");
    b.kind = kind.into();
    b.x = 25;
    b.y = 25;
    d.start.buildings.push(b);
    d.start.buildings.len() - 1
}
fn compiled(d: Definition) -> Game {
    compile(d)
        .unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()))
        .0
}
fn observed(g: &Game, c: &GoalCondition) -> serde_json::Value {
    measure(c, g.app.world().resource::<Village>()).1
}
fn crop(stage: CropStage) -> GoalCondition {
    GoalCondition::Crops {
        crop: "beans".into(),
        count: 1,
        stage,
        region: None,
    }
}
#[test]
fn all_crop_varieties_use_real_current_crop_and_ready_thresholds_without_harvest_credit() {
    for kind in ecology::CROPS {
        let c = GoalCondition::Crops {
            crop: kind.into(),
            count: 1,
            stage: CropStage::Ready,
            region: None,
        };
        let mut d = definition(c.clone());
        let i = structure(&mut d, "garden");
        d.start.buildings[i].crop = Some(super::super::super::farming::StartingCrop {
            crop: kind.into(),
            next_crop: "lettuce".into(),
            stage: super::super::super::farming::Stage::Planted,
            replant: true,
            soil_wetness: 1.,
        });
        let mut g = compiled(d);
        assert_eq!(observed(&g, &c)["value"], 0);
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            let b = v.buildings.iter_mut().find(|b| b.kind == "garden").unwrap();
            b.crop.growth = ecology::duration(&b.crop);
        }
        assert_eq!(observed(&g, &c)["value"], 1);
        assert_eq!(g.app.world().resource::<Village>().harvests, 0);
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            let b = v.buildings.iter_mut().find(|b| b.kind == "garden").unwrap();
            b.crop.planted = false;
            b.crop.growth = 0.;
            b.crop.kind = "lettuce".into();
            b.crop.next_kind = kind.into();
        }
        assert_eq!(observed(&g, &c)["value"], 0);
    }
}
#[test]
fn crops_exclude_projects_and_work_sites_and_require_the_whole_region() {
    let c = crop(CropStage::Planted);
    let mut d = definition(c.clone());
    let i = structure(&mut d, "greenhouse");
    d.start.buildings[i].crop = Some(super::super::super::farming::StartingCrop {
        crop: "beans".into(),
        next_crop: "lettuce".into(),
        stage: super::super::super::farming::Stage::Mature,
        replant: true,
        soil_wetness: 1.,
    });
    d.map.regions.push(Region {
        id: "beds".into(),
        title: "Our beds".into(),
        x: 25,
        y: 25,
        width: 1,
        height: 1,
    });
    let mut g = compiled(d);
    let mut regional = c.clone();
    if let GoalCondition::Crops { region, .. } = &mut regional {
        *region = Some("beds".into());
    }
    assert_eq!(observed(&g, &c)["value"], 1);
    assert_eq!(observed(&g, &c)["action"]["kind"], "cultivation");
    assert_eq!(observed(&g, &regional)["value"], 0);
    assert_eq!(observed(&g, &regional)["action"]["kind"], "build");
    let id = g
        .app
        .world()
        .resource::<Village>()
        .buildings
        .iter()
        .find(|b| b.kind == "greenhouse")
        .unwrap()
        .id;
    assert_eq!(g.queue_building_work(id, "salvage", 0, 0), "ok");
    assert_eq!(observed(&g, &c)["value"], 0);
    assert_eq!(g.cancel_building_work(id), "ok");
    assert_eq!(observed(&g, &c)["value"], 1);
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        let b = v
            .buildings
            .iter_mut()
            .find(|b| b.kind == "greenhouse")
            .unwrap();
        b.progress = 99.;
    }
    assert_eq!(observed(&g, &c)["value"], 0);
}
#[test]
fn orchards_distinguish_establishment_current_fruit_disabled_and_collection() {
    let c = GoalCondition::Orchards {
        count: 1,
        stage: OrchardStage::Ready,
        region: None,
    };
    let established = GoalCondition::Orchards {
        count: 1,
        stage: OrchardStage::Established,
        region: None,
    };
    let mut d = definition(c.clone());
    let i = structure(&mut d, "orchard");
    d.start.buildings[i].orchard = Some(super::super::super::orchards::StartingOrchard {
        stage: super::super::super::orchards::Stage::Ready,
        enabled: true,
        soil_wetness: 1.,
    });
    for store in &mut d.start.inventories {
        for material in ["food", "meals", "eggs", "milk", "honey"] {
            store.items.remove(material);
        }
    }
    let mut g = compiled(d);
    assert_eq!(observed(&g, &c)["value"], 1);
    assert_eq!(observed(&g, &established)["value"], 1);
    let id = g
        .app
        .world()
        .resource::<Village>()
        .buildings
        .iter()
        .find(|b| b.kind == "orchard")
        .unwrap()
        .id;
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(agriculture::tend(&mut v, id));
    }
    assert_eq!(observed(&g, &c)["value"], 0);
    assert_eq!(observed(&g, &established)["value"], 1);
    g.app
        .world_mut()
        .resource_mut::<Village>()
        .buildings
        .iter_mut()
        .find(|b| b.id == id)
        .unwrap()
        .agriculture
        .enabled = false;
    assert_eq!(observed(&g, &established)["value"], 0);
}
#[test]
fn livestock_counts_enclosures_and_real_current_care_not_boxed_animals_or_requests() {
    for kind in ["goat_pasture", "apiary", "coop"] {
        let c = GoalCondition::Livestock {
            building: kind.into(),
            count: 1,
            stage: AnimalStage::CaredFor,
            region: None,
        };
        let stocked = GoalCondition::Livestock {
            building: kind.into(),
            count: 1,
            stage: AnimalStage::Stocked,
            region: None,
        };
        let mut d = definition(c.clone());
        let i = structure(&mut d, kind);
        d.start.buildings[i].animals = Some(super::super::super::animals::StartingAnimals {
            stocked: true,
            stocking_requested: false,
            enabled: true,
            care_remaining: if kind == "coop" { 0. } else { 60. },
            welfare: 70.,
            ready: false,
        });
        let mut g = compiled(d);
        assert_eq!(observed(&g, &stocked)["value"], 1);
        if kind == "goat_pasture" {
            assert_eq!(observed(&g, &c)["value"], 1);
        } else {
            assert_eq!(observed(&g, &c)["value"], 0);
        }
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            let b = v.buildings.iter_mut().find(|b| b.kind == kind).unwrap();
            if kind == "coop" {
                b.poultry.remaining = 60.;
            } else if kind == "apiary" {
                let mut flower = b.clone();
                flower.id = 999;
                flower.kind = "orchard".into();
                flower.x += 4;
                v.buildings.push(flower);
            }
        }
        assert_eq!(observed(&g, &c)["value"], 1);
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            let now = v.minutes;
            let b = v.buildings.iter_mut().find(|b| b.kind == kind).unwrap();
            b.agriculture.cared_until = now;
            b.poultry.remaining = 0.;
        }
        assert_eq!(observed(&g, &c)["value"], 0);
        g.app
            .world_mut()
            .resource_mut::<Village>()
            .buildings
            .iter_mut()
            .find(|b| b.kind == kind)
            .unwrap()
            .agriculture
            .stocked = false;
        assert_eq!(observed(&g, &stocked)["value"], 0);
    }
}
#[test]
fn material_plots_need_live_growth_and_a_real_extraction_batch() {
    for material in ["timber", "bamboo"] {
        let c = GoalCondition::MaterialSites {
            material: material.into(),
            count: 1,
            stage: SourceStage::Ready,
            region: None,
        };
        let planted = GoalCondition::MaterialSites {
            material: material.into(),
            count: 1,
            stage: SourceStage::Planted,
            region: None,
        };
        let mut d = definition(c.clone());
        d.start
            .resource_sites
            .push(super::super::super::sites::StartingSite {
                id: "our-material".into(),
                material: material.into(),
                x: 25,
                y: 25,
                stage: super::super::super::sites::Stage::Growing,
                auto_replant: true,
                auto_harvest: false,
                soil_wetness: 1.,
            });
        let mut g = compiled(d);
        assert_eq!(observed(&g, &c)["value"], 0);
        assert_eq!(observed(&g, &planted)["value"], 1);
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            let s = v.economy.sources.last_mut().unwrap();
            s.growth = 1.;
            s.remaining = if material == "timber" { 7. } else { 0. };
        }
        assert_eq!(observed(&g, &c)["value"], 0);
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            let s = v.economy.sources.last_mut().unwrap();
            s.remaining = 8.;
        }
        assert_eq!(observed(&g, &c)["value"], 1);
        g.app
            .world_mut()
            .resource_mut::<Village>()
            .economy
            .sources
            .last_mut()
            .unwrap()
            .active = false;
        assert_eq!(observed(&g, &c)["value"], 0);
        assert_eq!(observed(&g, &planted)["value"], 0);
    }
}
#[test]
fn invalid_kinds_regions_stages_and_disabled_material_rules_are_atomic() {
    let d = definition(crop(CropStage::Planted));
    let mut g = compiled(d.clone());
    let before = g.snapshot();
    for condition in [
        GoalCondition::Crops {
            crop: "imaginary".into(),
            count: 1,
            stage: CropStage::Ready,
            region: None,
        },
        GoalCondition::Orchards {
            count: 0,
            stage: OrchardStage::Ready,
            region: None,
        },
        GoalCondition::Livestock {
            building: "home".into(),
            count: 1,
            stage: AnimalStage::Stocked,
            region: None,
        },
        GoalCondition::MaterialSites {
            material: "stone".into(),
            count: 1,
            stage: SourceStage::Planted,
            region: None,
        },
        GoalCondition::MaterialSites {
            material: "panels".into(),
            count: 1,
            stage: SourceStage::Ready,
            region: None,
        },
        GoalCondition::Orchards {
            count: 1,
            stage: OrchardStage::Established,
            region: Some("missing".into()),
        },
    ] {
        let bad = definition(condition);
        let report: serde_json::Value =
            serde_json::from_str(&g.load_scenario(&serde_json::to_string(&bad).unwrap())).unwrap();
        assert_eq!(report["ok"], false);
        assert_eq!(g.snapshot(), before);
    }
    let mut bad = definition(GoalCondition::MaterialSites {
        material: "timber".into(),
        count: 1,
        stage: SourceStage::Ready,
        region: None,
    });
    bad.rules.logistics = false;
    assert!(compile(bad).is_err());
}
#[test]
fn locked_crop_and_livestock_unlock_loops_are_rejected_and_starting_plots_can_help() {
    let mut d = definition(crop(CropStage::Ready));
    let j = d.journal.as_mut().unwrap();
    j.locked_buildings = vec!["garden".into(), "greenhouse".into()];
    j.events=serde_json::from_value(serde_json::json!([{"id":"unlock","title":"More beds","when":{"kind":"goal","goal":"living"},"effect":{"kind":"unlock_building","building":"garden"}}])).unwrap();
    assert!(compile(d.clone()).is_err());
    structure(&mut d, "garden");
    assert!(compile(d).is_ok());
    for building in ["goat_pasture", "apiary", "coop"] {
        let mut d = definition(GoalCondition::Livestock {
            building: building.into(),
            count: 1,
            stage: AnimalStage::CaredFor,
            region: None,
        });
        let j = d.journal.as_mut().unwrap();
        j.locked_buildings = vec![building.into()];
        j.events=serde_json::from_value(serde_json::json!([{"id":"unlock","title":"Animal home","when":{"kind":"goal","goal":"living"},"effect":{"kind":"unlock_building","building":building}}])).unwrap();
        assert!(compile(d.clone()).is_err());
        structure(&mut d, building);
        assert!(compile(d).is_ok());
    }
}
#[test]
fn nested_land_conditions_persist_once_only_progress_and_threshold_events() {
    let c = GoalCondition::All {
        conditions: vec![
            GoalCondition::Orchards {
                count: 1,
                stage: OrchardStage::Established,
                region: None,
            },
            crop(CropStage::Ready),
        ],
    };
    let mut d = definition(c.clone());
    d.journal.as_mut().unwrap().events=serde_json::from_value(serde_json::json!([{"id":"growing-support","title":"Established land","when":{"kind":"threshold","condition":c},"effect":{"kind":"grant_funds","cents":1000}}])).unwrap();
    let initial_funds = d.start.funds;
    let i = structure(&mut d, "garden");
    d.start.buildings[i].crop = Some(super::super::super::farming::StartingCrop {
        crop: "beans".into(),
        next_crop: "beans".into(),
        stage: super::super::super::farming::Stage::Mature,
        replant: true,
        soil_wetness: 1.,
    });
    let i = structure(&mut d, "orchard");
    d.start.buildings[i].x = 20;
    d.start.buildings[i].orchard = Some(super::super::super::orchards::StartingOrchard {
        stage: super::super::super::orchards::Stage::Established,
        enabled: true,
        soil_wetness: 1.,
    });
    let mut g = compiled(d);
    let view: serde_json::Value = serde_json::from_str(&g.scenario_journal()).unwrap();
    assert!(view["finished_at"].is_number());
    assert_eq!(view["events"][0]["status"], "applied");
    assert_eq!(
        g.app.world().resource::<Village>().economy.money,
        initial_funds + 1000
    );
    let saved = g.snapshot();
    assert!(g.restore(&saved));
    assert_eq!(g.snapshot(), saved);
    let mut other = Game::new();
    assert!(other.restore(&saved));
    for _ in 0..20 {
        g.tick(0.25);
        other.tick(0.25);
    }
    assert_eq!(g.snapshot(), other.snapshot());
}
#[test]
fn finite_extraction_and_material_regions_observe_depletion_and_full_footprints() {
    for material in ["earth", "stone", "salvage"] {
        let c = GoalCondition::MaterialSites {
            material: material.into(),
            count: 1,
            stage: SourceStage::Ready,
            region: None,
        };
        let mut d = definition(c.clone());
        d.map.deposits = Some(vec![GeologicalPatch {
            id: "our-deposit".into(),
            material: material.into(),
            x: 22,
            y: 22,
            width: 8,
            height: 8,
            quantity: 20,
        }]);
        d.map.regions.push(Region {
            id: "tiny".into(),
            title: "Too small".into(),
            x: 25,
            y: 25,
            width: 1,
            height: 1,
        });
        d.start
            .resource_sites
            .push(super::super::super::sites::StartingSite {
                id: "our-extraction".into(),
                material: material.into(),
                x: 25,
                y: 25,
                stage: super::super::super::sites::Stage::Extraction,
                auto_replant: false,
                auto_harvest: false,
                soil_wetness: 0.,
            });
        let mut g = compiled(d);
        assert_eq!(observed(&g, &c)["value"], 1);
        let mut regional = c.clone();
        if let GoalCondition::MaterialSites { region, .. } = &mut regional {
            *region = Some("tiny".into());
        }
        assert_eq!(observed(&g, &regional)["value"], 0);
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            let index = v.economy.sources.len() - 1;
            let remaining = v.economy.sources[index].remaining;
            resource_sites::harvested(&mut v, index, remaining as u32);
        }
        assert_eq!(observed(&g, &c)["value"], 0);
    }
}
