//! Conservative opening guidance, without advancing the authored simulation.
use super::*;
#[derive(Serialize)]
pub struct Summary {
    pub population: usize,
    pub beds: usize,
    pub unhoused: usize,
    pub ecological_toilets: usize,
    pub shared_shed: bool,
    pub edible_portions: u32,
    pub shared_meal_portions: usize,
    pub edible_expiring_hour: u32,
    pub fresh_water: f64,
    pub fresh_refill_target: f64,
    pub rain_cisterns: usize,
    pub storage_used: u32,
    pub storage_capacity: u32,
    pub goat_groups_due: usize,
    pub hen_groups_due: usize,
    pub goat_fodder_needed: u32,
    pub hen_fodder_needed: u32,
    pub hen_raw_food_target: u32,
    pub fodder_stock: u32,
    pub raw_food_stock: u32,
    pub automatic_food: bool,
    pub automatic_water: bool,
}
pub fn summarize(v: &Village) -> Summary {
    let population = v.skills.people.len();
    let beds = v
        .buildings
        .iter()
        .filter(|b| b.kind == "home" && b.progress >= 100.)
        .count()
        * HOME_BEDS;
    let goats = v
        .buildings
        .iter()
        .filter(|b| {
            b.kind == "goat_pasture"
                && b.progress >= 100.
                && b.agriculture.stocked
                && b.agriculture.cared_until <= v.minutes
        })
        .count();
    let hens = v
        .buildings
        .iter()
        .filter(|b| {
            b.kind == "coop"
                && b.progress >= 100.
                && b.agriculture.stocked
                && b.poultry.remaining <= 0.
                && v.supplies.feed_hens
        })
        .count();
    let fodder = economy::quantity(v, economy::FODDER);
    let goat_fodder = goats as u32 * agriculture::GOAT_CARE_FODDER;
    let hen_fodder = hens as u32 * crate::supplies::HEN_FODDER;
    let uncovered_hens = (hens as u32)
        .saturating_sub(fodder.saturating_sub(goat_fodder) / crate::supplies::HEN_FODDER);
    let expiring = v.logistics.as_ref().map_or(0, |s| {
        s.stores
            .iter()
            .flat_map(|p| &p.food_lots)
            .filter(|l| {
                sandbox::logistics(v)
                    && food::EDIBLE.contains(&l.material)
                    && l.expires <= v.minutes + 60.
            })
            .map(|l| l.amount)
            .sum()
    });
    Summary {
        population,
        beds,
        unhoused: population.saturating_sub(beds),
        ecological_toilets: v
            .buildings
            .iter()
            .filter(|b| b.kind == "eco_toilet" && b.progress >= 100.)
            .count(),
        shared_shed: ready(v, "shed"),
        edible_portions: food::owned_portions(v),
        shared_meal_portions: population,
        edible_expiring_hour: expiring,
        fresh_water: water::total(v, water::Class::Fresh),
        fresh_refill_target: water::fresh_refill_target(v),
        rain_cisterns: v
            .buildings
            .iter()
            .filter(|b| b.kind == "well" && b.progress >= 100.)
            .count(),
        storage_used: economy::storage(v),
        storage_capacity: economy::capacity(v),
        goat_groups_due: goats,
        hen_groups_due: hens,
        goat_fodder_needed: goat_fodder,
        hen_fodder_needed: hen_fodder,
        hen_raw_food_target: if uncovered_hens == 0 {
            0
        } else {
            crate::supplies::HEN_FOOD_RESERVE.ceil() as u32
                + (uncovered_hens - 1) * crate::supplies::HEN_FOOD
        },
        fodder_stock: fodder,
        raw_food_stock: economy::quantity(v, economy::FOOD),
        automatic_food: v.mode == modes::Mode::Sandbox && !sandbox::logistics(v),
        automatic_water: v.mode == modes::Mode::Sandbox && !sandbox::utilities(v),
    }
}
fn issue(
    report: &mut Report,
    severity: Severity,
    code: &str,
    path: &str,
    message: String,
    building: Option<&Building>,
    d: &Definition,
) {
    let authored = building.and_then(|b| {
        d.start
            .buildings
            .iter()
            .find(|s| s.kind == b.kind && s.x == b.x && s.y == b.y)
    });
    report.issues.push(Issue {
        severity,
        code: code.into(),
        path: path.into(),
        message,
        at: building.map(|b| [b.x, b.y]),
        entity: authored.map(|s| s.id.clone()),
    });
}
fn review_access(v: &Village, d: &Definition, people: &[Resident], r: &mut Report) {
    for b in &v.buildings {
        let name = match b.kind.as_str() {
            "shed" => "Shared shed",
            "home" => "Home",
            "garden" => "Garden",
            "well" => "Cistern",
            "kitchen" => "Community kitchen",
            "grove" => "Food forest",
            "warehouse" => "General storage",
            "compost" => "Compost",
            "square" => "Village square",
            "workshop" => "Workshop",
            "greenhouse" => "Greenhouse",
            "coop" => "Chicken coop",
            "solar_farm" => "Solar farm",
            "streetlight" => "Streetlight",
            "eco_toilet" => "Ecological toilet",
            "wetland" => "Planted wetland",
            "banana_treatment" => "Banana sewage treatment",
            "biodigester" => "Biodigester",
            "hydro" => "River generator",
            "orchard" => "Orchard",
            "goat_pasture" => "Goat pasture",
            "apiary" => "Apiary",
            _ => continue,
        };
        let mut nearest: Option<f32> = None;
        for person in people {
            let Some((x, y)) = spacing::approach(v, b, person.id) else {
                continue;
            };
            if let Ok((route, _)) = navigation::work_route(v, [person.x, person.y], [x, y]) {
                nearest = Some(nearest.map_or(route.minutes, |n| n.min(route.minutes)));
                // Ordinary nearby layouts do not need routes for the whole cast.
                if route.minutes <= 90. {
                    break;
                }
            }
        }
        match nearest {
            None => issue(
                r,
                Severity::Warning,
                "opening_building_access",
                "start.buildings",
                format!(
                    "{name} has no reachable work approach from the starting group. Move it onto connected land or clear a path around its plot; residents may be unable to use its stock, care for it or work there."
                ),
                Some(b),
                d,
            ),
            Some(minutes) if minutes > 90. => issue(
                r,
                Severity::Warning,
                "opening_building_travel",
                "start.buildings",
                format!(
                    "{name} is about {minutes:.0} game minutes on foot from the closest starting resident. Consider placing it nearer or adding roads; this is an opening route estimate, not a work schedule."
                ),
                Some(b),
                d,
            ),
            _ => {}
        }
    }
}
pub(crate) fn access(
    v: &Village,
    people: &[Resident],
) -> BTreeMap<journal::services::Kind, journal::services::Reading> {
    let mut kinds = vec![journal::services::Kind::HousedResidents];
    if sandbox::logistics(v) {
        kinds.push(journal::services::Kind::Food);
    }
    if sandbox::utilities(v) {
        kinds.push(journal::services::Kind::FreshWater);
        kinds.push(journal::services::Kind::Toilets);
    }
    journal::services::current_readings(v, people, &kinds)
}
pub fn review(v: &Village, d: &Definition, people: &[Resident], r: &mut Report) {
    review_access(v, d, people, r);
    let s = summarize(v);
    let readings = access(v, people);
    for (kind, owned, code, path, label) in [
        (
            journal::services::Kind::Food,
            f64::from(s.edible_portions),
            "opening_food_access",
            "start.inventories",
            "edible portions",
        ),
        (
            journal::services::Kind::FreshWater,
            s.fresh_water,
            "opening_water_access",
            "start.liquids",
            "fresh-water units",
        ),
    ] {
        if let Some(reading) = readings.get(&kind)
            && owned > 0.
            && (!reading.accessible || reading.value + 0.001 < owned)
        {
            let everyone = if reading.accessible {
                "Everyone present has a supply route."
            } else {
                "At least one friend present has no usable supply."
            };
            let quantities = if kind == journal::services::Kind::Food {
                format!("{:.0} of {owned:.0}", reading.value)
            } else {
                format!("{:.1} of {owned:.1}", reading.value)
            };
            issue(
                r,
                Severity::Warning,
                code,
                path,
                format!(
                    "{quantities} owned {label} are available through current routes and claims{}. {everyone} Review supply locations; future deliveries and resident work are not assumed.",
                    if kind == journal::services::Kind::Food {
                        " before spoilage"
                    } else {
                        ""
                    }
                ),
                None,
                d,
            );
        }
    }

    if let Some(housing) = readings.get(&journal::services::Kind::HousedResidents)
        && housing.value < s.population.min(s.beds) as f64
    {
        issue(
            r,
            Severity::Warning,
            "opening_housing_access",
            "start.buildings",
            format!(
                "{:.0} of {} friends can reach their assigned completed home, despite {} completed bed spaces. Move the isolated home or clear its approach; spare beds elsewhere do not change the current assignments.",
                housing.value, s.population, s.beds
            ),
            journal::services::inaccessible_assigned_home(v, people),
            d,
        );
    }
    if sandbox::utilities(v) {
        for b in v.buildings.iter().filter(|b| {
            b.kind == "eco_toilet" && b.progress >= 100. && !sanitation::usable_toilet(v, b.id)
        }) {
            let reason = sanitation::washing_blocker(v, water::Owner::Building(b.id), 1.)
                .unwrap_or("The local sewage buffer is full. Leave room for toilet use or arrange sewage treatment.");
            issue(
                r,
                Severity::Warning,
                "opening_toilet_supplies",
                "start.liquids",
                format!("Ecological toilet is not ready to use. {reason}"),
                Some(b),
                d,
            );
        }
    }
    if s.unhoused > 0 {
        issue(
            r,
            Severity::Warning,
            "overnight_beds",
            "start.buildings",
            format!(
                "{} overnight beds for {} friends: {} will stay elsewhere overnight until homes are ready. A shared shed offers daytime cover, not beds.",
                s.beds, s.population, s.unhoused
            ),
            None,
            d,
        );
    }
    if !s.shared_shed {
        issue(r,Severity::Warning,"no_shared_shelter","start.buildings","No completed shared shed: friends have no shared daytime shelter from sun and rain. Homes provide overnight beds separately.".into(),None,d);
    }
    if s.automatic_food {
        issue(r,Severity::Information,"automatic_starting_supplies","rules.logistics","Relaxed Sandbox rules replenish food, prepared meals, animal fodder and tool supplies during play. These supplies arrive when receiving storage has room; opening quantities alone do not define a finite-supply challenge.".into(),None,d);
    } else {
        if (s.edible_portions as usize) < s.shared_meal_portions {
            issue(
                r,
                Severity::Warning,
                "opening_food",
                "start.inventories",
                format!(
                    "{} ready-to-eat portions for {} friends: less than one shared meal. Eggs and unharvested crops do not count; add edible stock or keep this as an intentional foraging/trade challenge.",
                    s.edible_portions, s.population
                ),
                None,
                d,
            );
        }
        if s.edible_expiring_hour > 0 {
            issue(
                r,
                Severity::Warning,
                "opening_food_age",
                "start.inventories",
                format!(
                    "{} edible portions expire within the first game hour. Food quantities alone may overstate the opening reserve.",
                    s.edible_expiring_hour
                ),
                None,
                d,
            );
        }
        if s.fodder_stock < s.goat_fodder_needed {
            issue(
                r,
                Severity::Warning,
                "goat_opening_feed",
                "start.inventories",
                format!(
                    "{} occupied goat pastures need care now: {} fodder required, {} owned. Goats also need {} fresh water per care visit; supplies must reach their pastures.",
                    s.goat_groups_due,
                    s.goat_fodder_needed,
                    s.fodder_stock,
                    agriculture::GOAT_CARE_WATER
                ),
                v.buildings.iter().find(|b| {
                    b.kind == "goat_pasture"
                        && b.progress >= 100.
                        && b.agriculture.stocked
                        && b.agriculture.cared_until <= v.minutes
                }),
                d,
            );
        }
        if s.hen_raw_food_target > 0
            && (v.food < crate::supplies::HEN_FOOD_RESERVE
                || s.raw_food_stock < s.hen_raw_food_target)
        {
            issue(
                r,
                Severity::Warning,
                "hen_opening_feed",
                "start.inventories",
                format!(
                    "{} occupied coops need feed now. Each cycle needs {} fodder or {} raw food, and the food alternative can start only while village raw-food stock is at least {}. Goat care competes for the same fodder; local delivery is still required.",
                    s.hen_groups_due,
                    crate::supplies::HEN_FODDER,
                    crate::supplies::HEN_FOOD,
                    crate::supplies::HEN_FOOD_RESERVE
                ),
                v.buildings.iter().find(|b| {
                    b.kind == "coop"
                        && b.progress >= 100.
                        && b.agriculture.stocked
                        && b.poultry.remaining <= 0.
                }),
                d,
            );
        }
    }
    if s.automatic_water {
        issue(r,Severity::Information,"automatic_starting_water","rules.utilities","Relaxed Sandbox utility rules refill compatible water tanks during play. The opening water amount is not a finite-supply challenge.".into(),None,d);
    } else {
        if s.fresh_water + 0.001 < s.fresh_refill_target {
            issue(
                r,
                Severity::Warning,
                "opening_water_reserve",
                "start.liquids",
                format!(
                    "{:.1} fresh water against {:.1} in current resident/building refill targets. This is a buffer target, not daily consumption; water still needs compatible local delivery.",
                    s.fresh_water, s.fresh_refill_target
                ),
                None,
                d,
            );
        }
        if s.rain_cisterns == 0 {
            issue(r,Severity::Warning,"no_rain_cistern","start.buildings","No completed rain cistern. Residents rely on starting water and trips to the neighbouring tap until collection is built; a river does not directly supply drinking water.".into(),None,d);
        }
    }
    if s.storage_used >= s.storage_capacity {
        issue(r,Severity::Warning,"opening_storage_full","start.inventories","Material storage and reserved space are full. Collection and deliveries can wait for room; use materials or add storage before expanding production.".into(),None,d);
    }
    for b in v.buildings.iter().filter(|b| {
        b.kind == "apiary"
            && b.progress >= 100.
            && b.agriculture.stocked
            && agriculture::flowers(v, b) == 0
    }) {
        issue(r,Severity::Warning,"opening_bee_forage","start.buildings","An occupied apiary has no supported flowering orchard, food forest, beans or tomatoes within its native six-cell range. Plant suitable forage; an empty hive has no feeding requirement.".into(),Some(b),d);
    }
}
#[wasm_bindgen]
impl Game {
    pub fn scenario_setup_report(&mut self) -> String {
        let people: Vec<_> = self
            .app
            .world_mut()
            .query::<&Resident>()
            .iter(self.app.world())
            .cloned()
            .collect();
        let v = self.app.world().resource::<Village>();
        serde_json::json!({"summary":summarize(v),"access":access(v, &people),"opening":v.scenario.as_ref().is_some_and(|o|v.minutes==o.definition.start.minutes),"preview_only":true,"note":"Opening quantities, current route access and refill/care targets only. One shared meal means one edible portion per friend, not a daily diet. Owned stock differs from reachable unclaimed stock; food access also checks freshness on arrival; no harvests, rainfall, trade or future resident work are assumed. When everyone is away, access is checked from the arrival clearing."}).to_string()
    }
}
#[cfg(test)]
mod tests;
