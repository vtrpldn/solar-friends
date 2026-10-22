//! Starting resource sites resolve through normal deposit and footprint rules.
use super::*;
#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Stage {
    Empty,
    Growing,
    Mature,
    Extraction,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StartingSite {
    pub id: String,
    pub material: String,
    pub x: i32,
    pub y: i32,
    pub stage: Stage,
    pub auto_replant: bool,
    pub auto_harvest: bool,
    pub soil_wetness: f32,
}
fn material(s: &StartingSite) -> Option<usize> {
    economy::NAMES[..5]
        .iter()
        .position(|key| *key == s.material)
}
pub fn check(d: &Definition, r: &mut Report) {
    if d.start.resource_sites.len() > MAX_BUILDINGS {
        r.push(
            "start.resource_sites",
            "site_limit",
            "Use at most 256 starting resource sites.",
        );
    }
    let mut ids = HashSet::new();
    for (i, s) in d
        .start
        .resource_sites
        .iter()
        .enumerate()
        .take(MAX_BUILDINGS + 1)
    {
        let m = material(s);
        if !valid_key(&s.id)
            || !ids.insert(&s.id)
            || m.is_none()
            || m.is_some_and(|m| (m >= 2) != (s.stage == Stage::Extraction))
            || !s.soil_wetness.is_finite()
            || !(0.0..=1.).contains(&s.soil_wetness)
            || m.is_some_and(|m| m >= 2 && (s.soil_wetness != 0. || s.auto_replant))
        {
            r.push(&format!("start.resource_sites.{i}"),"invalid_starting_site","Give each resource site a unique identity, a supported material and matching cultivation or extraction phase. Root-zone wetness must be 0–100%; extraction sites have no planted crop or replanting.");
            let issue = r.issues.last_mut().unwrap();
            issue.entity = Some(s.id.clone());
            issue.at = Some([s.x, s.y]);
        }
    }
}
pub fn initialize(v: &mut Village) -> Result<(), Report> {
    let Some(origin) = v.scenario.clone() else {
        return Ok(());
    };
    if origin.definition.start.resource_sites.is_empty() {
        return Ok(());
    }
    for (i, s) in origin.definition.start.resource_sites.iter().enumerate() {
        let m = material(s).ok_or_else(|| {
            Report::error(
                "start.resource_sites",
                "invalid_starting_site",
                "Unknown resource material.",
            )
        })?;
        if let Err(message) = resource_sites::location(v, m, s.x, s.y) {
            let mut r = Report::error(
                &format!("start.resource_sites.{i}"),
                "site_location",
                message,
            );
            r.issues[0].entity = Some(s.id.clone());
            r.issues[0].at = Some([s.x, s.y]);
            return Err(r);
        }
        let deposit = (m >= 2).then(|| land::deposit(v, m, s.x, s.y).unwrap().clone());
        let maximum = deposit
            .as_ref()
            .map_or_else(|| resource_sites::maximum(m), |d| d.maximum as f32);
        let remaining = deposit.as_ref().map_or(
            if s.stage == Stage::Mature {
                maximum
            } else {
                0.
            },
            |d| d.remaining as f32,
        );
        v.economy.sources.push(economy::Source {
            deposit: deposit.map(|d| d.id),
            material: m,
            x: s.x,
            y: s.y,
            remaining,
            maximum,
            player_placed: true,
            active: true,
            growth: if matches!(s.stage, Stage::Mature | Stage::Extraction) {
                1.
            } else {
                0.
            },
            planted: matches!(s.stage, Stage::Growing | Stage::Mature),
            auto_replant: s.auto_replant,
            auto_harvest: s.auto_harvest,
            ..Default::default()
        });
        land::disturb_plot(v, resource_sites::size(m), s.x, s.y, 0.08);
        if s.soil_wetness > 0. {
            land::water_plot(v, resource_sites::size(m), s.x, s.y, s.soil_wetness);
        }
    }
    land::sync_moisture(v);
    navigation::refresh(v);
    Ok(())
}
pub fn catalog() -> serde_json::Value {
    serde_json::json!({"limit":MAX_BUILDINGS,"materials":economy::NAMES[..5],"cultivation_stages":[{"id":Stage::Empty,"name":"Unplanted plot"},{"id":Stage::Growing,"name":"Newly planted"},{"id":Stage::Mature,"name":"Ready to harvest"}],"extraction_stage":Stage::Extraction,"timber_capacity":resource_sites::maximum(0),"bamboo_capacity":resource_sites::maximum(1)})
}
#[cfg(test)]
mod tests {
    use super::*;
    fn source(material: &str, stage: Stage) -> StartingSite {
        StartingSite {
            id: "our-site".into(),
            material: material.into(),
            x: 25,
            y: 25,
            stage,
            auto_replant: true,
            auto_harvest: true,
            soil_wetness: 0.5,
        }
    }
    #[test]
    fn cultivated_starts_are_physical_and_never_fake_harvests_or_purchases() {
        for m in ["timber", "bamboo"] {
            for stage in [Stage::Empty, Stage::Growing, Stage::Mature] {
                let mut d = Definition::builtin(modes::Mode::Sandbox);
                d.rules.land = true;
                d.rules.logistics = true;
                d.start.resource_sites = vec![source(m, stage)];
                let (mut g, _) =
                    compile(d).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
                let v = g.app.world().resource::<Village>();
                let s = &v.economy.sources[0];
                assert_eq!(s.harvests, 0);
                assert!(!s.harvest_requested);
                assert!(!s.plant_requested);
                assert_eq!(s.planted, stage != Stage::Empty);
                assert_eq!(s.growth, if stage == Stage::Mature { 1. } else { 0. });
                assert_eq!(
                    s.remaining,
                    if stage == Stage::Mature {
                        s.maximum
                    } else {
                        0.
                    }
                );
                assert_eq!(s.moisture, if s.planted { 720. } else { 0. });
                assert_eq!(v.land.water[(25 * MAP_SIZE + 25) as usize], 0.5);
                assert_eq!(v.economy.money, 10_000_000);
                assert!(
                    !v.economy
                        .ledger
                        .iter()
                        .any(|e| e.note.contains("Establishing a material plot"))
                );
                assert!(
                    v.simulation
                        .materials
                        .as_ref()
                        .unwrap()
                        .received
                        .iter()
                        .all(|n| *n == 0)
                );
                let saved = g.snapshot();
                assert!(g.restore(&saved));
                assert_eq!(g.snapshot(), saved);
            }
        }
    }
    #[test]
    fn extraction_binds_the_real_authored_deposit_and_invalid_locations_fail() {
        let mut d = Definition::builtin(modes::Mode::Sandbox);
        d.rules.land = true;
        d.rules.logistics = true;
        d.map.deposits = Some(vec![GeologicalPatch {
            id: "stone-patch".into(),
            material: "stone".into(),
            x: 24,
            y: 24,
            width: 4,
            height: 4,
            quantity: 72,
        }]);
        let mut s = source("stone", Stage::Extraction);
        s.auto_replant = false;
        s.soil_wetness = 0.;
        d.start.resource_sites = vec![s];
        let (g, _) =
            compile(d.clone()).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
        let v = g.app.world().resource::<Village>();
        let s = &v.economy.sources[0];
        assert_eq!(s.remaining, 72.);
        assert_eq!(s.maximum, 72.);
        assert!(s.deposit.is_some());
        assert!(!s.planted);
        assert!(resource_sites::valid(v));
        d.start.resource_sites[0].x = 15;
        assert!(compile(d.clone()).is_err());
        d.start.resource_sites[0].x = 25;
        d.start
            .resource_sites
            .push(d.start.resource_sites[0].clone());
        assert!(compile(d.clone()).is_err());
        d.start.resource_sites.pop();
        d.start.resource_sites[0].stage = Stage::Mature;
        assert!(compile(d).is_err());
    }
    #[test]
    fn inherited_mature_timber_requires_actual_work_and_restores_after_collection() {
        let mut d = Definition::builtin(modes::Mode::Sandbox);
        d.rules.land = true;
        d.rules.logistics = true;
        d.rules.utilities = true;
        let mut site = source("timber", Stage::Mature);
        site.auto_harvest = false;
        site.auto_replant = false;
        d.start.resource_sites = vec![site];
        let (mut g, _) =
            compile(d).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
        assert_eq!(g.harvest_source(0), "ok");
        assert_eq!(
            g.app.world().resource::<Village>().economy.sources[0].harvests,
            0
        );
        for _ in 0..6000 {
            g.tick(0.25);
            if g.app.world().resource::<Village>().economy.sources[0].harvests > 0 {
                break;
            }
        }
        let v = g.app.world().resource::<Village>();
        assert_eq!(v.economy.sources[0].harvests, 1);
        assert_eq!(v.economy.sources[0].remaining, 24.);
        assert_eq!(v.simulation.materials.as_ref().unwrap().received[0], 8);
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_eq!(g.snapshot(), saved);
    }
    #[test]
    fn invalid_sites_leave_the_running_world_untouched() {
        let mut g = Game::new();
        let before = g.snapshot();
        let mut d = Definition::builtin(modes::Mode::Sandbox);
        let mut site = source("bamboo", Stage::Growing);
        site.x = d.map.camp[0];
        site.y = d.map.camp[1];
        d.start.resource_sites = vec![site];
        assert!(
            !serde_json::from_str::<serde_json::Value>(
                &g.load_scenario(&serde_json::to_string(&d).unwrap())
            )
            .unwrap()["ok"]
                .as_bool()
                .unwrap()
        );
        assert_eq!(g.snapshot(), before);
        d.start.resource_sites[0].x = 25;
        d.start.resource_sites[0].y = 25;
        d.start.resource_sites[0].soil_wetness = 1.1;
        assert!(compile(d).is_err());
    }
}
