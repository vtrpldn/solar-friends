//! Authored initial tank contents and conservative read-only placement proposals.
use super::*;
#[derive(Clone, Serialize)]
pub struct Location {
    owner: InventoryOwner,
    kind: String,
    x: i32,
    y: i32,
    capacities: BTreeMap<String, f64>,
}
fn capacities(values: [f64; water::LIQUIDS]) -> BTreeMap<String, f64> {
    water::Class::ALL
        .into_iter()
        .map(|c| (c.key().into(), values[c.index()]))
        .collect()
}
pub fn classes() -> serde_json::Value {
    serde_json::json!(water::Class::ALL.map(|c|serde_json::json!({"id":c.key(),"name":match c {water::Class::Fresh=>"Fresh water",water::Class::Irrigation=>"Reclaimed irrigation water",water::Class::Greywater=>"Greywater",water::Class::Sewage=>"Sewage"},"sealed":c.sealed()})))
}
fn locations(d: &Definition) -> Vec<Location> {
    let mut result = vec![Location {
        owner: InventoryOwner::Camp,
        kind: "camp".into(),
        x: d.map.camp[0],
        y: d.map.camp[1],
        capacities: capacities(water::CAMP_CAPACITIES),
    }];
    result.extend(
        d.start
            .buildings
            .iter()
            .filter(|b| b.state == BuildingState::Completed)
            .filter_map(|b| {
                water::building_capacities(&b.kind).map(|caps| Location {
                    owner: InventoryOwner::Building(b.id.clone()),
                    kind: b.kind.clone(),
                    x: b.x,
                    y: b.y,
                    capacities: capacities(caps),
                })
            }),
    );
    result
}
fn key(owner: &InventoryOwner) -> String {
    match owner {
        InventoryOwner::Camp => "camp".into(),
        InventoryOwner::Building(id) => format!("building:{id}"),
    }
}
fn totals(d: &Definition) -> BTreeMap<String, f64> {
    water::Class::ALL
        .into_iter()
        .map(|c| {
            (
                c.key().into(),
                d.start.liquids.as_ref().map_or_else(
                    || {
                        if c == water::Class::Fresh {
                            f64::from(d.start.fresh_water)
                        } else {
                            0.
                        }
                    },
                    |p| {
                        p.iter()
                            .map(|p| p.contents.get(c.key()).copied().unwrap_or(0.))
                            .sum()
                    },
                ),
            )
        })
        .collect()
}
fn bounded(d: &Definition) -> bool {
    d.start.buildings.len() <= MAX_BUILDINGS
        && d.start.liquids.as_ref().is_none_or(|p| {
            p.len() <= MAX_BUILDINGS + 1
                && p.iter().all(|p| {
                    p.contents.len() <= water::LIQUIDS
                        && p.contents.iter().all(|(k, n)| {
                            water::Class::ALL.iter().any(|c| c.key() == k)
                                && n.is_finite()
                                && (0.0..=150000.).contains(n)
                        })
                })
        })
}
pub fn check(d: &Definition, r: &mut Report) {
    let Some(contents) = &d.start.liquids else {
        return;
    };
    if !bounded(d) {
        r.push("start.liquids","invalid_liquids","Use known liquid classes, nonnegative finite quantities and a bounded list of tank locations.");
        return;
    }
    let sites = locations(d);
    let mut owners = HashSet::new();
    for (i, p) in contents.iter().enumerate() {
        let path = format!("start.liquids.{i}");
        if !owners.insert(key(&p.owner)) {
            r.push(
                &path,
                "duplicate_liquid_owner",
                "Assign each tank location once.",
            );
        }
        let Some(site) = sites.iter().find(|s| key(&s.owner) == key(&p.owner)) else {
            r.push(&path,"missing_liquid_tank","Choose the arrival containers or a completed building with compatible liquid storage.");
            continue;
        };
        if p.contents.iter().any(|(class, n)| {
            *n > 0. && (site.capacities[class] == 0. || *n > site.capacities[class] + water::EPS)
        }) {
            r.push(&path,"liquid_capacity","These contents exceed this container’s capacity or use an incompatible liquid class. Choose another tank or reduce the amount.");
        }
    }
    if d.start.fresh_water != totals(d)["fresh"] as f32 {
        r.push("start.liquids","fresh_water_mismatch","The starting fresh-water total must match the assigned fresh contents. Recalculate it when editing liquid locations.");
    }
}
pub fn install(v: &mut Village) -> Result<(), Report> {
    let Some(origin) = v.scenario.clone() else {
        return Ok(());
    };
    let Some(contents) = &origin.definition.start.liquids else {
        return Ok(());
    };
    let mut opening = [0.; water::LIQUIDS];
    for (index, p) in contents.iter().enumerate() {
        let owner = match &p.owner {
            InventoryOwner::Camp => water::Owner::Camp,
            InventoryOwner::Building(key) => water::Owner::Building(origin.buildings[key]),
        };
        let Some(tank) = v.water_supply.tanks.iter_mut().find(|t| t.owner == owner) else {
            return Err(Report::error(
                &format!("start.liquids.{index}"),
                "missing_liquid_tank",
                "This starting tank could not be initialized.",
            ));
        };
        tank.water = water::Class::ALL.map(|c| p.contents.get(c.key()).copied().unwrap_or(0.));
        for (i, n) in tank.water.iter().enumerate() {
            opening[i] += n;
        }
    }
    v.water_supply.opening = opening;
    water::summaries(v);
    Ok(())
}
pub fn preview(raw: &str, distribute: bool) -> serde_json::Value {
    let d = match parse(raw) {
        Ok(d) => d,
        Err(r) => return serde_json::json!({"ok":false,"issues":r.issues}),
    };
    if !bounded(&d) || !d.start.fresh_water.is_finite() || d.start.fresh_water < 0. {
        return serde_json::json!({"ok":false,"issues":Report::error("start.liquids","invalid_liquids","Repair unsupported liquid classes or quantities before distributing. Nothing has changed.").issues});
    }
    let sites = locations(&d);
    let totals = totals(&d);
    let capacities: BTreeMap<String, f64> = water::Class::ALL
        .into_iter()
        .map(|c| {
            (
                c.key().into(),
                sites.iter().map(|s| s.capacities[c.key()]).sum(),
            )
        })
        .collect();
    if !distribute {
        return serde_json::json!({"ok":true,"manual":d.start.liquids.is_some(),"locations":sites,"totals":totals,"capacities":capacities});
    }
    let mut contents: Vec<BTreeMap<String, f64>> = vec![BTreeMap::new(); sites.len()];
    let mut unassigned = BTreeMap::new();
    for class in water::Class::ALL {
        let mut left = totals[class.key()];
        let mut order: Vec<_> = (0..sites.len()).collect();
        order.sort_by_key(|i| match (class, sites[*i].kind.as_str()) {
            (water::Class::Greywater, "wetland")
            | (water::Class::Sewage, "biodigester" | "banana_treatment") => 0,
            (_, "camp") => 2,
            _ => 1,
        });
        let mut last = None;
        for i in order {
            let amount = left.min(sites[i].capacities[class.key()]);
            if amount > 0. {
                contents[i].insert(class.key().into(), amount);
                left = (left - amount).max(0.);
                last = Some(i);
            }
            if left == 0. {
                break;
            }
        }
        if left > 0.
            && left <= water::EPS
            && let Some(i) = last
        {
            *contents[i].get_mut(class.key()).unwrap() += left;
            left = 0.;
        }
        if left > 0. {
            unassigned.insert(class.key(), left);
        }
    }
    let liquids: Vec<_> = sites
        .iter()
        .zip(contents)
        .filter(|(_, c)| !c.is_empty())
        .map(|(s, contents)| StartingLiquids {
            owner: s.owner.clone(),
            contents,
        })
        .collect();
    let fresh_water: f32 = liquids
        .iter()
        .map(|p| p.contents.get("fresh").copied().unwrap_or(0.))
        .sum::<f64>() as f32;
    serde_json::json!({"ok":unassigned.is_empty(),"locations":sites,"totals":totals,"capacities":capacities,"liquids":liquids,"fresh_water":fresh_water,"unassigned":unassigned,"policy":"Each liquid keeps its class. Compatible treatment tanks receive greywater and sewage first; other completed tanks are filled before the arrival containers. No service point or invisible overflow store is used. Nothing is applied while any liquid remains unassigned."})
}

#[cfg(test)]
mod tests {
    use super::*;
    fn definition() -> Definition {
        let mut d = Definition::builtin(modes::Mode::Sandbox);
        d.rules.utilities = true;
        d.start.fresh_water = 2.5;
        d.start.liquids = Some(vec![StartingLiquids {
            owner: InventoryOwner::Camp,
            contents: BTreeMap::from([
                ("fresh".into(), 2.5),
                ("irrigation".into(), 4.),
                ("greywater".into(), 5.),
                ("sewage".into(), 6.),
            ]),
        }]);
        d
    }
    #[test]
    fn exact_opening_liquids_remain_separate_accounted_and_restorable() {
        let d = definition();
        let (mut g, _) =
            compile(d).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
        let v = g.app.world().resource::<Village>();
        assert_eq!(v.water_supply.opening, [2.5, 4., 5., 6.]);
        assert_eq!(v.water_supply.received, [0.; 4]);
        assert!(
            !v.water_supply
                .tanks
                .iter()
                .any(|p| p.owner == water::Owner::Ground)
        );
        assert_eq!(
            water::owner_tank(v, water::Owner::Camp).unwrap().water,
            [2.5, 4., 5., 6.]
        );
        let before = g.snapshot();
        assert!(g.restore(&before));
        assert_eq!(g.snapshot(), before);
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert_eq!(
            water::draw(&mut v, water::Owner::Camp, water::Class::Fresh, 2.),
            2.
        );
        assert_eq!(
            water::owner_tank(&v, water::Owner::Camp).unwrap().water,
            [0.5, 4., 5., 6.]
        );
        assert_eq!(v.water_supply.consumed, [2., 0., 0., 0.]);
        let after = g.snapshot();
        assert!(g.restore(&after));
        assert_eq!(g.snapshot(), after);
        let mut empty = definition();
        empty.start.fresh_water = 0.;
        empty.start.liquids = Some(vec![]);
        let (g, _) =
            compile(empty).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
        assert_eq!(
            g.app.world().resource::<Village>().water_supply.opening,
            [0.; 4]
        );
    }
    #[test]
    fn invalid_liquid_locations_classes_capacity_and_totals_reject_atomically() {
        let d = definition();
        let (mut g, _) =
            compile(d.clone()).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
        let before = g.snapshot();
        for case in [
            "owner",
            "class",
            "capacity",
            "negative",
            "duplicate",
            "total",
        ] {
            let mut bad = d.clone();
            let p = &mut bad.start.liquids.as_mut().unwrap()[0];
            match case {
                "owner" => p.owner = InventoryOwner::Building("starting-warehouse".into()),
                "class" => {
                    p.contents.insert("unknown".into(), 1.);
                }
                "capacity" => {
                    p.contents.insert("fresh".into(), 41.);
                    bad.start.fresh_water = 41.;
                }
                "negative" => {
                    p.contents.insert("sewage".into(), -1.);
                }
                "duplicate" => {
                    let copy = p.clone();
                    bad.start.liquids.as_mut().unwrap().push(copy);
                    bad.start.fresh_water = 5.;
                }
                _ => bad.start.fresh_water = 99.,
            }
            let report: serde_json::Value =
                serde_json::from_str(&g.load_scenario(&serde_json::to_string(&bad).unwrap()))
                    .unwrap();
            assert_eq!(report["ok"], false, "{case}");
            assert_eq!(g.snapshot(), before);
        }
        let mut home = d.clone();
        let mut b = home.start.buildings[0].clone();
        b.id = "home-water".into();
        b.kind = "home".into();
        b.x = 25;
        b.y = 25;
        home.start.buildings.push(b);
        home.start.fresh_water = 0.;
        home.start.liquids = Some(vec![StartingLiquids {
            owner: InventoryOwner::Building("home-water".into()),
            contents: BTreeMap::from([("sewage".into(), 1.)]),
        }]);
        assert!(compile(home.clone()).is_err());
        home.start.liquids.as_mut().unwrap()[0].contents =
            BTreeMap::from([("greywater".into(), 12.)]);
        assert!(compile(home.clone()).is_ok());
        home.start.buildings.last_mut().unwrap().state = BuildingState::Blueprint;
        assert!(compile(home).is_err());
    }
    #[test]
    fn proposals_preserve_all_classes_report_shortage_and_do_not_touch_the_game() {
        let mut d = definition();
        let mut g = Game::new();
        let before = g.snapshot();
        let p: serde_json::Value =
            serde_json::from_str(&g.scenario_liquids(&serde_json::to_string(&d).unwrap(), true))
                .unwrap();
        assert_eq!(p["ok"], true);
        let old = totals(&d);
        d.start.liquids = Some(serde_json::from_value(p["liquids"].clone()).unwrap());
        d.start.fresh_water = serde_json::from_value(p["fresh_water"].clone()).unwrap();
        assert_eq!(totals(&d), old);
        assert_eq!(g.snapshot(), before);
        assert!(compile(d.clone()).is_ok());
        d.start.liquids.as_mut().unwrap()[0]
            .contents
            .insert("fresh".into(), 41.);
        d.start.fresh_water = 41.;
        let p = preview(&serde_json::to_string(&d).unwrap(), true);
        assert_eq!(p["ok"], false);
        assert_eq!(p["unassigned"]["fresh"], 1.);
        assert_eq!(g.snapshot(), before);
    }
}
