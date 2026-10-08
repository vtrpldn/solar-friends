use crate::{Resident, Village, event, ready};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Response {
    ShareShifts,
    DayOff,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Situation {
    pub resident: usize,
    pub opened: f32,
    pub response: Option<Response>,
    pub agreed: Option<f32>,
    pub helpers: u8,
    pub recovery: f32,
    pub worry: f32,
    pub resolved: Option<f32>,
}

/// A rolling three-day record, independent of the linear quest milestones.
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Situations {
    pub day: u32,
    pub cooking: [[u32; 5]; 3],
    pub active: Option<Situation>,
    pub resolved_count: u32,
}

pub fn advance(v: &mut Village, minutes: f32) {
    let day = (v.minutes / 1440.) as u32;
    let elapsed = day.saturating_sub(v.situations.day).min(3);
    for _ in 0..elapsed {
        v.situations.cooking.rotate_right(1);
        v.situations.cooking[0] = [0; 5];
    }
    v.situations.day = day;
    if let Some(s) = &mut v.situations.active {
        if let Some(resolved) = s.resolved {
            if v.minutes - resolved < 4320. {
                return;
            }
            v.situations.active = None;
        } else {
            if s.response.is_none() {
                s.worry = (s.worry + minutes / 360.).min(12.);
            }
            let helpers = if s.response == Some(Response::DayOff) {
                1
            } else {
                2
            };
            if s.helpers.count_ones() >= helpers
                && s.recovery >= 72.
                && v.minutes - s.agreed.unwrap_or(s.opened) >= 1440.
            {
                s.resolved = Some(v.minutes);
                s.worry = 0.;
                v.situations.resolved_count = v.situations.resolved_count.saturating_add(1);
                v.situations.cooking = [[0; 5]; 3];
                event(
                    v,
                    "A lighter kitchen, a happier neighbour. The collective found a better rhythm.",
                );
            }
            return;
        }
    }
    if !v.arrived || !ready(v, "kitchen") {
        return;
    }
    let totals: [u32; 5] =
        std::array::from_fn(|id| v.situations.cooking.iter().map(|day| day[id]).sum());
    let total: u32 = totals.iter().sum();
    let Some(resident) = (0..5).find(|&id| {
        totals[id] >= 6
            && totals[id] * 5 >= total * 3
            && v.situations
                .cooking
                .iter()
                .filter(|day| day[id] > 0)
                .count()
                >= 2
    }) else {
        return;
    };
    v.situations.active = Some(Situation {
        resident,
        opened: v.minutes,
        response: None,
        agreed: None,
        helpers: 0,
        recovery: 0.,
        worry: 4.,
        resolved: None,
    });
    event(
        v,
        "Someone has been carrying the kitchen. Open Situations to hear their concern.",
    );
}

pub fn cooked(v: &mut Village, id: usize) {
    v.situations.cooking[0][id] = v.situations.cooking[0][id].saturating_add(1).min(1000);
    if let Some(s) = &mut v.situations.active
        && s.resolved.is_none()
    {
        if id != s.resident {
            s.helpers |= 1 << id;
        } else {
            // Returning the whole burden to the same person undoes the recovery.
            s.recovery = (s.recovery - 36.).max(0.);
        }
    }
}

pub fn recovered(v: &mut Village, id: usize, minutes: f32) {
    if let Some(s) = &mut v.situations.active
        && s.resolved.is_none()
        && s.resident == id
    {
        s.recovery = (s.recovery + minutes).min(1440.);
        s.worry = (s.worry - minutes / 18.).max(0.);
    }
}

pub fn concern(v: &Village, id: usize) -> f32 {
    v.situations
        .active
        .as_ref()
        .filter(|s| s.resident == id && s.resolved.is_none())
        .map_or(0., |s| s.worry)
}

pub fn protected(v: &Village, id: usize, task: &str) -> bool {
    let Some(s) = &v.situations.active else {
        return false;
    };
    s.resolved.is_none()
        && s.response.is_some()
        && s.resident == id
        && (task == "cook"
            || (s.response == Some(Response::DayOff)
                && !crate::leisure::hobby(task)
                && !matches!(
                    task,
                    "rest" | "sleep" | "eat" | "socialize" | "gathering" | "idle"
                )))
}

pub fn helping(v: &Village, id: usize) -> bool {
    v.situations
        .active
        .as_ref()
        .is_some_and(|s| s.resolved.is_none() && s.response.is_some() && id != s.resident)
}

pub fn respond(v: &mut Village, response: &str) -> String {
    let response = match response {
        "share_shifts" => Response::ShareShifts,
        "day_off" => Response::DayOff,
        _ => return "That proposal is not available.".into(),
    };
    let Some(s) = &mut v.situations.active else {
        return "There is no concern to discuss.".into();
    };
    if s.resolved.is_some() || s.response.is_some() {
        return "The collective has already agreed on a response.".into();
    }
    s.response = Some(response);
    s.agreed = Some(v.minutes);
    s.helpers = 0;
    s.recovery = 0.;
    event(
        v,
        match response {
            Response::ShareShifts => {
                "We agreed to share kitchen shifts. Other neighbours will step in before their usual projects."
            }
            Response::DayOff => {
                "We agreed to protect a day off. Other neighbours will cover the kitchen while our cook rests."
            }
        },
    );
    "ok".into()
}

pub fn valid(v: &Village) -> bool {
    let s = &v.situations;
    s.day <= (v.minutes / 1440.) as u32
        && s.cooking.iter().flatten().all(|n| *n <= 1000)
        && s.active.as_ref().is_none_or(|a| {
            a.resident < 5
                && a.helpers <= 31
                && a.helpers & (1 << a.resident) == 0
                && a.opened.is_finite()
                && (0.0..=v.minutes).contains(&a.opened)
                && a.recovery.is_finite()
                && (0.0..=1440.).contains(&a.recovery)
                && a.worry.is_finite()
                && (0.0..=12.).contains(&a.worry)
                && a.agreed.is_some() == a.response.is_some()
                && a.agreed
                    .is_none_or(|t| t.is_finite() && (a.opened..=v.minutes).contains(&t))
                && a.resolved.is_none_or(|t| {
                    t.is_finite() && (a.agreed.unwrap_or(a.opened)..=v.minutes).contains(&t)
                })
        })
}

pub fn apply_agreement(r: &mut Resident, v: &Village) -> bool {
    if protected(v, r.id, "cook")
        && v.situations
            .active
            .as_ref()
            .is_some_and(|s| s.recovery < 72. || s.response == Some(Response::DayOff))
    {
        crate::assign(
            r,
            v,
            if r.social < 80. { "socialize" } else { "rest" },
            "The collective is covering the kitchen. This time is mine to enjoy.",
            false,
        );
        true
    } else {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Building, Game};

    fn village() -> Village {
        let g = Game::new();
        let mut v = g.app.world().resource::<Village>().clone();
        v.arrived = true;
        v.minutes = 2. * 1440. + 600.;
        v.situations.day = 2;
        v.economy.next_building = 1;
        v.buildings.push(Building {
            id: 0,
            kind: "kitchen".into(),
            x: 10,
            y: 10,
            progress: 100.,
            contributors: 0,
            crop: Default::default(),
            poultry: Default::default(),
            visits: 0,
            next_visit: 0.,
        });
        v
    }
    fn concerned_village() -> Village {
        let mut v = village();
        v.situations.cooking[0][2] = 3;
        v.situations.cooking[1][2] = 3;
        advance(&mut v, 0.);
        assert!(v.situations.active.is_some());
        v
    }
    #[test]
    fn concern_requires_repeated_unequal_work_not_a_busy_afternoon() {
        let mut v = village();
        v.situations.cooking[0][2] = 6;
        advance(&mut v, 0.);
        assert!(v.situations.active.is_none());
        v.situations.cooking[0] = [2; 5];
        v.situations.cooking[1] = [4; 5];
        advance(&mut v, 0.);
        assert!(v.situations.active.is_none());
        v.situations.cooking = [[0; 5]; 3];
        v.situations.cooking[1][2] = 6;
        v.minutes += 3. * 1440.;
        advance(&mut v, 0.);
        assert!(v.situations.active.is_none());
    }
    #[test]
    fn agreement_needs_real_help_recovery_and_time_then_has_a_cooldown() {
        let mut v = concerned_village();
        assert_eq!(respond(&mut v, "share_shifts"), "ok");
        assert!(protected(&v, 2, "cook"));
        assert!(!protected(&v, 2, "garden"));
        let before = serde_json::to_string(&v).unwrap();
        assert_ne!(respond(&mut v, "day_off"), "ok");
        assert_eq!(serde_json::to_string(&v).unwrap(), before);
        cooked(&mut v, 1);
        cooked(&mut v, 1);
        recovered(&mut v, 2, 72.);
        v.minutes += 1440.;
        advance(&mut v, 0.);
        assert_eq!(v.situations.resolved_count, 0);
        cooked(&mut v, 3);
        advance(&mut v, 0.);
        assert_eq!(v.situations.resolved_count, 1);
        assert!(!protected(&v, 2, "cook"));
        assert_eq!(concern(&v, 2), 0.);
        advance(&mut v, 0.);
        assert_eq!(v.situations.resolved_count, 1);
        assert!(v.situations.active.as_ref().unwrap().resolved.is_some());
    }
    #[test]
    fn day_off_protects_work_and_concern_is_gentle_and_recoverable() {
        let mut v = concerned_village();
        advance(&mut v, 10000.);
        assert_eq!(concern(&v, 2), 12.);
        assert_eq!(respond(&mut v, "day_off"), "ok");
        assert!(protected(&v, 2, "build"));
        assert!(!protected(&v, 2, "eat"));
        cooked(&mut v, 1);
        recovered(&mut v, 2, 216.);
        advance(&mut v, 0.);
        assert_eq!(v.situations.resolved_count, 0);
        v.minutes += 1440.;
        advance(&mut v, 0.);
        assert_eq!(v.situations.resolved_count, 1);
    }
    #[test]
    fn collective_can_recover_without_a_player_response() {
        let mut v = concerned_village();
        cooked(&mut v, 1);
        cooked(&mut v, 3);
        recovered(&mut v, 2, 108.);
        cooked(&mut v, 2);
        v.minutes += 1440.;
        advance(&mut v, 0.);
        assert_eq!(v.situations.resolved_count, 1);
    }
    #[test]
    fn recovery_counts_time_at_rest_not_walking_or_sleeping() {
        let mut g = Game::new();
        g.app.insert_resource(concerned_village());
        let mut query = g.app.world_mut().query::<&mut Resident>();
        for mut r in query.iter_mut(g.app.world_mut()) {
            r.task = "idle".into();
            r.remaining = 90.;
            if r.id == 2 {
                r.task = "rest".into();
                r.x = 5.;
                r.y = 5.;
                r.target_x = 10.;
                r.target_y = 10.;
            }
        }
        g.tick(0.25);
        assert_eq!(
            g.app
                .world()
                .resource::<Village>()
                .situations
                .active
                .as_ref()
                .unwrap()
                .recovery,
            0.
        );
        let mut query = g.app.world_mut().query::<&mut Resident>();
        for mut r in query.iter_mut(g.app.world_mut()).filter(|r| r.id == 2) {
            r.x = r.target_x;
            r.y = r.target_y;
        }
        g.tick(0.25);
        let recovered = g
            .app
            .world()
            .resource::<Village>()
            .situations
            .active
            .as_ref()
            .unwrap()
            .recovery;
        assert_eq!(recovered, 0.75);
        g.app.world_mut().resource_mut::<Village>().minutes = 3. * 1440.;
        g.tick(0.25);
        assert_eq!(
            g.app
                .world()
                .resource::<Village>()
                .situations
                .active
                .as_ref()
                .unwrap()
                .recovery,
            recovered
        );
    }

    #[test]
    fn saves_preserve_agreements_migrate_and_reject_bad_situations_atomically() {
        let mut g = Game::new();
        let mut v = concerned_village();
        respond(&mut v, "day_off");
        cooked(&mut v, 1);
        recovered(&mut v, 2, 36.);
        g.app.insert_resource(v);
        let saved = g.snapshot();
        let mut restored = Game::new();
        assert!(restored.restore(&saved));
        assert_eq!(saved, restored.snapshot());
        for (key, value) in [
            ("resident", 5),
            ("helpers", 32),
            ("recovery", -1),
            ("worry", 13),
            ("opened", 999999),
        ] {
            let mut invalid: serde_json::Value = serde_json::from_str(&saved).unwrap();
            invalid["village"]["situations"]["active"][key] = value.into();
            assert!(!restored.restore(&invalid.to_string()));
            assert_eq!(saved, restored.snapshot());
        }
        let mut legacy: serde_json::Value = serde_json::from_str(&saved).unwrap();
        legacy["village"]
            .as_object_mut()
            .unwrap()
            .remove("situations");
        assert!(restored.restore(&legacy.to_string()));
        assert!(
            restored
                .app
                .world()
                .resource::<Village>()
                .situations
                .active
                .is_none()
        );
    }
}
