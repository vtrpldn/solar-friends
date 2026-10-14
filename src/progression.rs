use crate::{Village, event, modes::Mode, ready};
use serde::{Deserialize, Serialize};

pub const CHAPTER_COUNT: usize = 13;
pub const LATER_CHAPTERS: usize = CHAPTER_COUNT - 4;
pub const BUILDINGS: [&str; 18] = [
    "home",
    "garden",
    "well",
    "kitchen",
    "grove",
    "warehouse",
    "compost",
    "square",
    "workshop",
    "greenhouse",
    "coop",
    "solar_farm",
    "streetlight",
    "eco_toilet",
    "wetland",
    "banana_treatment",
    "biodigester",
    "hydro",
];

// Existing seven-chapter saves retain their achievements and open chapter eight.
fn later_chapters<'de, D: serde::Deserializer<'de>>(
    d: D,
) -> Result<[bool; LATER_CHAPTERS], D::Error> {
    let old = Vec::<bool>::deserialize(d)?;
    if old.len() != 3 && old.len() != LATER_CHAPTERS {
        return Err(serde::de::Error::custom("invalid chapter count"));
    }
    let mut result = [false; LATER_CHAPTERS];
    result[..old.len()].copy_from_slice(&old);
    Ok(result)
}

/// Lifetime milestones are credited even before a quest is tracked.
#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Progress {
    pub completed: [bool; 4],
    #[serde(deserialize_with = "later_chapters")]
    pub later_completed: [bool; LATER_CHAPTERS],
    pub seedlings_raised: u32,
    pub seedlings_used: u32,
    pub prepared_batches: u32,
    pub egg_meal: bool,
    pub biogas_meal: bool,
    pub digestate_cured: bool,
    pub rain_caught: bool,
    pub reclaimed_irrigation: bool,
    pub timber_replanted: bool,
    pub surplus_sold: bool,
    pub parts_exchanged: bool,
    pub night_lights: bool,
    pub river_night: bool,
    pub hobby_mask: u8,
    pub eggs_collected: u32,
    pub tracked: usize,
    pub fruit: u32,
    pub timber: u32,
    pub social_mask: u8,
    pub shared_builds: u32,
    pub scraps: u32,
    pub compost: u32,
    pub enriched_harvests: u32,
    pub tool_uses: u32,
    pub tools_crafted: u32,
    pub use_tools: bool,
    pub gatherings: u32,
    pub welcome_supper: bool,
    pub tool_library: bool,
    pub gathering_until: f32,
    pub gathering_day: i32,
    pub invited: u8,
    pub attended: u8,
    pub friendships: [u32; 25],
}
impl Default for Progress {
    fn default() -> Self {
        Self {
            completed: [false; 4],
            later_completed: [false; LATER_CHAPTERS],
            seedlings_raised: 0,
            seedlings_used: 0,
            prepared_batches: 0,
            egg_meal: false,
            biogas_meal: false,
            digestate_cured: false,
            rain_caught: false,
            reclaimed_irrigation: false,
            timber_replanted: false,
            surplus_sold: false,
            parts_exchanged: false,
            night_lights: false,
            river_night: false,
            hobby_mask: 0,
            eggs_collected: 0,
            tracked: 0,
            fruit: 0,
            timber: 0,
            social_mask: 0,
            shared_builds: 0,
            scraps: 0,
            compost: 0,
            enriched_harvests: 0,
            tool_uses: 0,
            tools_crafted: 0,
            use_tools: true,
            gatherings: 0,
            welcome_supper: false,
            tool_library: false,
            gathering_until: 0.,
            gathering_day: -1,
            invited: 0,
            attended: 0,
            friendships: [0; 25],
        }
    }
}
pub fn unlocked(v: &Village, kind: &str) -> bool {
    if v.mode == Mode::Sandbox {
        return true;
    }
    let chapter = match kind {
        "grove" | "warehouse" => Some(0),
        "compost" | "square" => Some(1),
        "workshop" | "greenhouse" => Some(3),
        "coop" => Some(4),
        "solar_farm" | "streetlight" => Some(5),
        "eco_toilet" | "wetland" | "banana_treatment" => Some(6),
        "biodigester" => Some(7),
        "hydro" => Some(9),
        _ => None,
    };
    chapter.is_none_or(|i| completed(v, i))
}
pub fn completed(v: &Village, quest: usize) -> bool {
    if quest >= CHAPTER_COUNT {
        false
    } else if quest < 4 {
        v.progress.completed[quest]
    } else {
        v.progress.later_completed[quest - 4]
    }
}
pub fn available(v: &Village, quest: usize) -> bool {
    quest < CHAPTER_COUNT && (quest == 0 || completed(v, quest - 1))
}
pub fn update(v: &mut Village) {
    if v.mode == Mode::Sandbox {
        return;
    }
    let homes = v
        .buildings
        .iter()
        .filter(|b| b.kind == "home" && b.progress >= 100.)
        .count();
    let introduction = v.arrived
        && ready(v, "well")
        && homes >= 2
        && v.harvests > 0
        && ready(v, "kitchen")
        && v.meals_served > 0
        && v.mornings > 0;
    let goals = [
        introduction,
        ready(v, "grove")
            && v.progress.fruit >= 6
            && (0..2).all(|m| v.economy.sources.iter().any(|s| s.material == m)),
        v.meals_served >= 5
            && v.progress.social_mask == 31
            && v.progress.welcome_supper
            && ready(v, "square"),
        v.economy.orders.iter().any(|o| o.status == "delivered")
            && v.progress.shared_builds > 0
            && v.progress.tool_library
            && ready(v, "warehouse")
            && v.economy
                .orders
                .iter()
                .any(|o| o.status == "delivered" && o.pickup_by.is_some())
            && v.economy.work_day.iter().any(|day| *day >= 0),
        ready(v, "workshop")
            && ready(v, "compost")
            && ready(v, "greenhouse")
            && v.progress.tools_crafted > 0
            && v.progress.enriched_harvests > 0
            && v.progress.seedlings_raised > 0
            && v.progress.seedlings_used > 0,
        ready(v, "coop") && v.progress.eggs_collected >= 3 && v.progress.egg_meal,
        ready(v, "solar_farm")
            && ready(v, "streetlight")
            && v.power.stored >= 12.
            && v.progress.night_lights,
        ready(v, "eco_toilet")
            && ready(v, "wetland")
            && ready(v, "banana_treatment")
            && v.circular.waste_treated >= 5.
            && v.circular.toilet_visits >= 5
            && v.circular.water_reused >= 8.
            && v.progress.rain_caught
            && v.progress.reclaimed_irrigation,
        ready(v, "biodigester")
            && v.circular.batches > 0
            && v.progress.biogas_meal
            && v.progress.digestate_cured,
        (0..5).all(|m| {
            v.economy
                .sources
                .iter()
                .any(|s| s.material == m && s.harvests > 0)
        }) && v.progress.timber_replanted
            && v.progress.prepared_batches > 0
            && v.economy.projects.iter().any(|p| {
                p.recipe == "adobe"
                    && v.buildings
                        .iter()
                        .any(|b| b.id == p.building && b.kind == "home" && b.progress >= 100.)
            })
            && v.progress.surplus_sold
            && v.progress.parts_exchanged,
        ready(v, "hydro") && v.progress.river_night,
        v.situations.resolved_count > 0 && v.progress.hobby_mask == 31,
        BUILDINGS.iter().all(|kind| ready(v, kind))
            && homes >= 2
            && v.food >= 18.
            && v.water >= 20.
            && v.progress.gatherings >= 2,
    ];
    let celebrations = [
        "A Shared Beginning complete! The next chapter is ready in the village journal.",
        "Roots for Tomorrow complete! The next chapter is ready in the village journal.",
        "A Place to Gather complete! The next chapter is ready in the village journal.",
        "Made by Our Hands complete! The next chapter is ready in the village journal.",
        "Growing Resilience complete! The next chapter is ready in the village journal.",
        "A Fuller Table complete! The next chapter is ready in the village journal.",
        "Sunshine to Share complete! The next chapter is ready in the village journal.",
        "Water Comes Around complete! The next chapter is ready in the village journal.",
        "Scraps into Energy complete! The next chapter is ready in the village journal.",
        "Homes of Earth complete! The next chapter is ready in the village journal.",
        "The River Keeps Giving complete! The next chapter is ready in the village journal.",
        "Room to Breathe complete! The next chapter is ready in the village journal.",
        "A Village in Balance complete! Vila Aurora's story continues in your hands.",
    ];
    for i in 0..CHAPTER_COUNT {
        if goals[i] && !completed(v, i) && available(v, i) {
            if i < 4 {
                v.progress.completed[i] = true;
            } else {
                v.progress.later_completed[i - 4] = true;
            }
            event(v, celebrations[i]);
            v.progress.tracked = (i + 1).min(CHAPTER_COUNT - 1);
        }
    }
}
pub fn use_tool(v: &mut Village) -> bool {
    if v.progress.use_tools && v.progress.tool_uses > 0 {
        v.progress.tool_uses -= 1;
        true
    } else {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Game;

    #[test]
    fn seven_chapter_saves_keep_credit_and_open_the_water_chapter() {
        let mut g = Game::new();
        let mut old: serde_json::Value = serde_json::from_str(&g.snapshot()).unwrap();
        old["village"]["progress"] = serde_json::json!({
            "completed": vec![true; 4], "later_completed": vec![true; 3], "tracked": 6
        });
        assert!(g.restore(&old.to_string()));
        let v = g.app.world().resource::<Village>();
        assert!(available(v, 7));
        assert!(!available(v, 8));
        assert_eq!(&v.progress.later_completed[..3], &[true; 3]);
        assert_eq!(&v.progress.later_completed[3..], &[false; 6]);
        assert!(!v.progress.biogas_meal);
        let before = g.snapshot();
        for len in [0, 4, 8, 10] {
            let mut invalid: serde_json::Value = serde_json::from_str(&before).unwrap();
            invalid["village"]["progress"]["later_completed"] = serde_json::json!(vec![true; len]);
            assert!(!g.restore(&invalid.to_string()));
            assert_eq!(g.snapshot(), before);
        }
        assert!(!available(
            g.app.world().resource::<Village>(),
            CHAPTER_COUNT
        ));
        assert!(!g.track_quest(CHAPTER_COUNT));
    }

    #[test]
    fn cooking_credit_requires_consumed_eggs_and_gas_and_survives_use() {
        let mut g = Game::new();
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.food = 2.;
            v.supplies.eggs = 2;
            v.circular.biogas = 1.;
            crate::supplies::cook(&mut v);
            assert!(v.progress.egg_meal && v.progress.biogas_meal);
            assert_eq!(v.supplies.eggs, 0);
            assert_eq!(v.circular.biogas, 0.);
        }
        let save = g.snapshot();
        assert!(g.restore(&save));
        assert_eq!(g.snapshot(), save);
        let mut empty = Game::new();
        let mut v = empty.app.world_mut().resource_mut::<Village>();
        v.water = 0.;
        v.supplies.eggs = 2;
        v.circular.biogas = 1.;
        crate::supplies::cook(&mut v);
        assert!(!v.progress.egg_meal && !v.progress.biogas_meal);
    }

    #[test]
    fn rain_and_lighting_credit_require_actual_collection_and_energy() {
        let mut g = Game::new();
        assert!(g.start_mode("sandbox"));
        assert_eq!(g.place("well", 5, 5), "ok");
        assert_eq!(g.place("streetlight", 9, 5), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.minutes = 900.;
            v.water = crate::ecology::capacity(&v);
            crate::ecology::advance(&mut v, 1.);
            assert!(!v.progress.rain_caught);
            v.water -= 1.;
            crate::ecology::advance(&mut v, 1.);
            assert!(v.progress.rain_caught);
            v.minutes = 1320.;
            crate::power::advance(&mut v, 1.);
            assert!(!v.progress.night_lights);
        }
        assert_eq!(g.place("solar_farm", 13, 5), "ok");
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.power.stored = 12.;
        v.power.disabled.push(1);
        crate::power::advance(&mut v, 1.);
        assert!(!v.progress.night_lights);
        v.power.disabled.clear();
        crate::power::advance(&mut v, 1.);
        assert!(v.progress.night_lights);
    }

    #[test]
    fn late_story_offers_personal_time_without_inventing_overwork() {
        let mut g = Game::new();
        assert!(g.start_mode("sandbox"));
        assert_eq!(g.place("kitchen", 5, 5), "ok");
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.arrived = true;
        crate::situations::advance(&mut v, 1.);
        assert!(v.situations.active.is_none());
        v.mode = Mode::Story;
        v.progress.completed.fill(true);
        v.progress.later_completed[..7].fill(true);
        crate::situations::advance(&mut v, 1.);
        let s = v.situations.active.as_ref().unwrap();
        assert!(s.story_check_in);
        assert_eq!(s.resident, 2);
        assert_eq!(v.situations.cooking, [[0; 5]; 3]);
        assert_eq!(v.situations.resolved_count, 0);
        assert_eq!(crate::situations::respond(&mut v, "day_off"), "ok");
        crate::situations::advance(&mut v, 1440.);
        assert_eq!(
            v.situations.resolved_count, 0,
            "A promise without actual help is not completion"
        );
    }
    #[test]
    fn a_real_cooking_concern_takes_precedence_over_the_story_check_in() {
        let mut g = Game::new();
        assert!(g.start_mode("sandbox"));
        assert_eq!(g.place("kitchen", 5, 5), "ok");
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.arrived = true;
        v.mode = Mode::Story;
        v.progress.completed.fill(true);
        v.progress.later_completed[..7].fill(true);
        v.situations.cooking = [[3, 0, 0, 0, 0], [3, 0, 0, 0, 0], [0; 5]];
        crate::situations::advance(&mut v, 1.);
        let s = v.situations.active.as_ref().unwrap();
        assert_eq!(s.resident, 0);
        assert!(!s.story_check_in);
        assert_eq!(s.worry, 4.);
    }
}
