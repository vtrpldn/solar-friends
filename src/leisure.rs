//! Unhurried routines use existing walking, looking, stretching and sitting poses.
use super::*;

pub fn hobby(task: &str) -> bool {
    matches!(
        task,
        "nature_walk" | "birdwatch" | "stretch" | "daydream" | "stargaze"
    )
}

pub fn choose(r: &Resident, v: &Village) -> (&'static str, &'static str) {
    if founding::weather_shelter(v) && founding::quiet_spot(v, r.id).is_some() {
        return (
            "daydream",
            if climate::at(v, v.minutes).raining {
                "Listening to the rain from the shared shed."
            } else {
                "Taking a quiet moment in the shade of the shared shed."
            },
        );
    }
    if r.social < 65. {
        return ("socialize", "There is time to catch up with my neighbours.");
    }
    if v.minutes.rem_euclid(1440.) >= 1200. {
        return (
            "stargaze",
            "Watching the stars come out. Tomorrow's chores can wait.",
        );
    }
    // The clock chooses a change of pace; identity and appearance do not.
    let task = if (v.minutes / 180.) as usize % 3 == 1 {
        r.routine_preferences.alternate_hobby.task()
    } else {
        r.routine_preferences.favourite_hobby.task()
    };
    let reason = match task {
        "nature_walk" => "Taking a slow nature walk, just to enjoy the plants.",
        "birdwatch" => "Listening for birds and watching them around the clearing.",
        "stretch" => "Enjoying some gentle stretches in the fresh air.",
        _ => "Finding a peaceful spot to sit and let my mind wander.",
    };
    (task, reason)
}
