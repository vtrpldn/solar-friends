//! Unhurried routines use existing walking, looking, stretching and sitting poses.
use super::*;

pub fn hobby(task: &str) -> bool {
    matches!(
        task,
        "nature_walk" | "birdwatch" | "stretch" | "daydream" | "stargaze"
    )
}

pub fn choose(r: &Resident, v: &Village) -> (&'static str, &'static str) {
    if r.social < 65. {
        return ("socialize", "There is time to catch up with my neighbours.");
    }
    if v.minutes.rem_euclid(1440.) >= 1200. {
        return (
            "stargaze",
            "Watching the stars come out. Tomorrow's chores can wait.",
        );
    }
    // Personal favourites, with a change of pace across the day. Saved time
    // makes the routine stable through reloads without adding save fields.
    let favourites = [
        "nature_walk",
        "stretch",
        "daydream",
        "birdwatch",
        "daydream",
    ];
    let alternatives = ["birdwatch", "daydream", "stretch", "nature_walk", "stretch"];
    let task = if (v.minutes / 180.) as usize % 3 == 1 {
        alternatives[r.id]
    } else {
        favourites[r.id]
    };
    let reason = match task {
        "nature_walk" => "Taking a slow nature walk, just to enjoy the plants.",
        "birdwatch" => "Listening for birds and watching them around the clearing.",
        "stretch" => "Enjoying some gentle stretches in the fresh air.",
        _ => "Finding a peaceful spot to sit and let my mind wander.",
    };
    (task, reason)
}
