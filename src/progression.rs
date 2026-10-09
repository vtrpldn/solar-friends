use crate::{Village, event, modes::Mode, ready};
use serde::{Deserialize, Serialize};

/// Lifetime milestones are credited even before a quest is tracked.
#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Progress {
    pub completed: [bool; 4],
    pub later_completed: [bool; 3],
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
            later_completed: [false; 3],
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
    match kind {
        "grove" | "warehouse" => v.progress.completed[0],
        "compost" | "eco_toilet" => v.progress.completed[1],
        "square" => v.progress.completed[2],
        "workshop" => v.progress.completed[3],
        "greenhouse" | "wetland" => v.progress.completed[3],
        "coop" | "biodigester" => v.progress.later_completed[0],
        "solar_farm" | "streetlight" | "hydro" => v.progress.later_completed[1],
        _ => true,
    }
}
pub fn completed(v: &Village, quest: usize) -> bool {
    if quest < 4 {
        v.progress.completed[quest]
    } else {
        v.progress.later_completed[quest - 4]
    }
}
pub fn available(v: &Village, quest: usize) -> bool {
    quest == 0 || completed(v, quest - 1)
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
        ready(v, "grove") && v.progress.fruit >= 6,
        v.meals_served >= 5 && v.progress.social_mask == 31 && v.progress.welcome_supper,
        v.economy.orders.iter().any(|o| o.status == "delivered")
            && v.progress.shared_builds > 0
            && v.progress.tool_library,
        ready(v, "workshop")
            && ready(v, "compost")
            && ready(v, "greenhouse")
            && v.progress.tools_crafted > 0
            && v.progress.enriched_harvests > 0,
        ready(v, "coop") && v.progress.eggs_collected >= 3,
        (ready(v, "solar_farm") || ready(v, "hydro"))
            && ready(v, "streetlight")
            && v.power.stored >= 12.,
    ];
    let celebrations = [
        "A Shared Beginning complete! Food forests and Roots for Tomorrow are available.",
        "Roots for Tomorrow complete! Build a compost station to enrich your gardens.",
        "A Place to Gather complete! Build a community square and host gatherings.",
        "Made by Our Hands complete! Build a workshop and craft useful tools.",
        "Growing Resilience complete! Chicken coops are now available.",
        "A Fuller Table complete! Solar farms and street lights are now available.",
        "Sunshine to Share complete! Vila Aurora's story continues in your hands.",
    ];
    for i in 0..7 {
        if goals[i] && !completed(v, i) && available(v, i) {
            if i < 4 {
                v.progress.completed[i] = true;
            } else {
                v.progress.later_completed[i - 4] = true;
            }
            event(v, celebrations[i]);
            v.progress.tracked = (i + 1).min(6);
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
