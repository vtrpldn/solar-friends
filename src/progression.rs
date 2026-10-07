use crate::{Village, event, ready};
use serde::{Deserialize, Serialize};

/// Lifetime milestones are credited even before a quest is tracked.
#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Progress {
    pub completed: [bool; 4],
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
    pub workshop_timber: bool,
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
            workshop_timber: false,
            gathering_until: 0.,
            gathering_day: -1,
            invited: 0,
            attended: 0,
            friendships: [0; 25],
        }
    }
}
pub fn unlocked(v: &Village, kind: &str) -> bool {
    match kind {
        "grove" => v.progress.completed[0],
        "compost" => v.progress.completed[1],
        "square" => v.progress.completed[2],
        "workshop" => v.progress.completed[3],
        _ => true,
    }
}
pub fn update(v: &mut Village) {
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
        v.progress.timber >= 40 && v.progress.shared_builds > 0 && v.progress.workshop_timber,
    ];
    let celebrations = [
        "A Shared Beginning complete! Food forests and three new quests are available.",
        "Roots for Tomorrow complete! Build a compost station to enrich your gardens.",
        "A Place to Gather complete! Build a community square and host gatherings.",
        "Made by Our Hands complete! Build a workshop and craft useful tools.",
    ];
    for i in 0..4 {
        if goals[i] && !v.progress.completed[i] && (i == 0 || v.progress.completed[0]) {
            v.progress.completed[i] = true;
            event(v, celebrations[i]);
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
