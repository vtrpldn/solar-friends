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
    #[serde(default)]
    pub story_check_in: bool,
    pub resident: usize,
    pub opened: f32,
    pub response: Option<Response>,
    pub agreed: Option<f32>,
    pub helpers: crate::participation::Set,
    pub recovery: f32,
    pub worry: f32,
    pub resolved: Option<f32>,
}

/// A rolling three-day record, independent of the linear quest milestones.
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Situations {
    pub day: u32,
    pub cooking: [std::collections::BTreeMap<usize, u32>; 3],
    pub active: Option<Situation>,
    pub resolved_count: u32,
}

pub fn helpers_required(population: usize, response: Option<Response>) -> usize {
    (if response == Some(Response::DayOff) {
        1usize
    } else {
        2
    })
    .min(population.saturating_sub(1))
}
pub fn advance(v: &mut Village, minutes: f32) {
    let population = v.skills.people.len();
    let day = (v.minutes / 1440.) as u32;
    let elapsed = day.saturating_sub(v.situations.day).min(3);
    for _ in 0..elapsed {
        v.situations.cooking.rotate_right(1);
        v.situations.cooking[0].clear();
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
            let helpers = helpers_required(population, s.response);
            if (!s.story_check_in || s.response.is_some())
                && s.helpers.len() >= helpers
                && s.recovery >= 72.
                && v.minutes - s.agreed.unwrap_or(s.opened) >= 1440.
            {
                s.resolved = Some(v.minutes);
                s.worry = 0.;
                v.situations.resolved_count = v.situations.resolved_count.saturating_add(1);
                v.situations.cooking = Default::default();
                event(
                    v,
                    if population == 1 {
                        "Time away from cooking made room for rest. A gentler daily rhythm."
                    } else {
                        "A lighter kitchen, a happier neighbour. The collective found a better rhythm."
                    },
                );
            }
            return;
        }
    }
    if !v.arrived || !ready(v, "kitchen") {
        return;
    }
    let total: u64 = v
        .situations
        .cooking
        .iter()
        .flat_map(|day| day.values())
        .map(|n| u64::from(*n))
        .sum();
    let concerned_resident = v.skills.people.keys().copied().find(|id| {
        let work: u32 = v
            .situations
            .cooking
            .iter()
            .map(|day| day.get(id).copied().unwrap_or(0))
            .sum();
        work >= 6
            && u64::from(work) * 5 >= total * 3
            && v.situations
                .cooking
                .iter()
                .filter(|day| day.get(id).copied().unwrap_or(0) > 0)
                .count()
                >= 2
    });
    let story_check_in = v.skills.people.contains_key(&2)
        && concerned_resident.is_none()
        && v.mode == crate::modes::Mode::Story
        && !crate::progression::completed(v, 11)
        && crate::progression::available(v, 11)
        && v.situations.resolved_count == 0;
    let Some(resident) = concerned_resident.or(if story_check_in { Some(2) } else { None }) else {
        return;
    };
    v.situations.active = Some(Situation {
        story_check_in,
        resident,
        opened: v.minutes,
        response: None,
        agreed: None,
        helpers: Default::default(),
        recovery: 0.,
        worry: if story_check_in { 0. } else { 4. },
        resolved: None,
    });
    event(
        v,
        if story_check_in {
            "Luz would like a day for herself. Open Situations to plan time off together."
        } else {
            "Someone has been carrying the kitchen. Open Situations to hear their concern."
        },
    );
}

pub fn cooked(v: &mut Village, id: usize) {
    if !v.skills.people.contains_key(&id) {
        return;
    }
    let count = v.situations.cooking[0].entry(id).or_default();
    *count = count.saturating_add(1).min(1000);
    if let Some(s) = &mut v.situations.active
        && s.resolved.is_none()
    {
        if id != s.resident {
            s.helpers.insert(id);
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
                    "rest" | "sleep" | "eat" | "socialize" | "gathering" | "idle" | "sanitation"
                )))
}

pub fn helping(v: &Village, id: usize) -> bool {
    v.skills.people.contains_key(&id)
        && v.situations
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
    let solo = v.skills.people.len() == 1;
    let Some(s) = &mut v.situations.active else {
        return "There is no concern to discuss.".into();
    };
    if s.resolved.is_some() || s.response.is_some() {
        return "The collective has already agreed on a response.".into();
    }
    s.response = Some(response);
    s.agreed = Some(v.minutes);
    s.helpers.clear();
    s.recovery = 0.;
    event(
        v,
        if solo {
            "Time away from cooking is protected. Stored meals and town supplies can help."
        } else {
            match response {
                Response::ShareShifts => {
                    "We agreed to share kitchen shifts. Other neighbours will step in before their usual projects."
                }
                Response::DayOff => {
                    "We agreed to protect a day off. Other neighbours will cover the kitchen while our cook rests."
                }
            }
        },
    );
    "ok".into()
}

pub fn valid(v: &Village) -> bool {
    let s = &v.situations;
    s.day <= (v.minutes / 1440.) as u32
        && s.cooking.iter().all(|day| {
            day.iter()
                .all(|(id, n)| v.skills.people.contains_key(id) && *n <= 1000)
        })
        && s.active.as_ref().is_none_or(|a| {
            v.skills.people.contains_key(&a.resident)
                && crate::participation::owned(v, &a.helpers)
                && !a.helpers.contains(&a.resident)
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
            if r.social < 80. && v.skills.people.len() > 1 {
                "socialize"
            } else {
                "rest"
            },
            if v.skills.people.len() == 1 {
                "Taking time away from cooking for my own interests."
            } else {
                "The collective is covering the kitchen. This time is mine to enjoy."
            },
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
            contributors: crate::participation::Set::new(),
            crop: Default::default(),
            poultry: Default::default(),
            agriculture: Default::default(),
            visits: 0,
            next_visit: 0.,
        });
        crate::water::sync(&mut v);
        crate::power::sync(&mut v);
        v
    }
    fn concerned_village() -> Village {
        let mut v = village();
        v.situations.cooking[0].insert(2, 3);
        v.situations.cooking[1].insert(2, 3);
        advance(&mut v, 0.);
        assert!(v.situations.active.is_some());
        v
    }
    #[test]
    fn small_casts_require_available_helpers_and_real_recovery_time() {
        for count in [1usize, 2, 5, 12] {
            for response in ["share_shifts", "day_off"] {
                let mut v = village();
                v.skills.people = (0..count)
                    .map(|i| (900 + i * 101, crate::skills::Person::default()))
                    .collect();
                v.situations.cooking[0].insert(900, 3);
                v.situations.cooking[1].insert(900, 3);
                advance(&mut v, 0.);
                assert_eq!(respond(&mut v, response), "ok");
                let required =
                    helpers_required(count, v.situations.active.as_ref().unwrap().response);
                assert_eq!(
                    required,
                    if response == "day_off" {
                        1.min(count - 1)
                    } else {
                        2.min(count - 1)
                    }
                );
                recovered(&mut v, 900, 72.);
                for i in 1..=required {
                    cooked(&mut v, 900 + i * 101);
                }
                advance(&mut v, 0.);
                assert_eq!(v.situations.resolved_count, 0);
                v.minutes += 1440.;
                advance(&mut v, 0.);
                assert_eq!(v.situations.resolved_count, 1);
                assert!(valid(&v));
            }
        }
    }
    #[test]
    fn solo_rest_is_not_a_free_agreement_and_unknown_helpers_do_not_count() {
        let mut v = village();
        v.skills.people = [(900, crate::skills::Person::default())]
            .into_iter()
            .collect();
        v.situations.cooking[0].insert(900, 3);
        v.situations.cooking[1].insert(900, 3);
        advance(&mut v, 0.);
        assert_eq!(respond(&mut v, "day_off"), "ok");
        let mut g = Game::new();
        let world = g.app.world_mut();
        let mut actor = world
            .query::<&Resident>()
            .iter(world)
            .next()
            .unwrap()
            .clone();
        actor.id = 900;
        actor.social = 20.;
        assert!(apply_agreement(&mut actor, &v));
        assert_eq!(actor.task, "rest");
        assert!(!actor.reason.contains("collective"));
        assert!(!helping(&v, 0));
        v.minutes += 1440.;
        advance(&mut v, 0.);
        assert_eq!(v.situations.resolved_count, 0);
        recovered(&mut v, 900, 72.);
        cooked(&mut v, 900);
        advance(&mut v, 0.);
        assert_eq!(v.situations.resolved_count, 0);
        recovered(&mut v, 900, 36.);
        advance(&mut v, 0.);
        assert_eq!(v.situations.resolved_count, 1);
    }

    #[test]
    fn sparse_cooks_and_helpers_keep_their_own_history() {
        let mut v = village();
        v.skills.people = [42, 900, 1200]
            .into_iter()
            .map(|id| (id, crate::skills::Person::default()))
            .collect();
        v.situations.cooking[0].insert(900, 3);
        v.situations.cooking[1].insert(900, 3);
        advance(&mut v, 0.);
        assert_eq!(v.situations.active.as_ref().unwrap().resident, 900);
        assert_eq!(respond(&mut v, "share_shifts"), "ok");
        cooked(&mut v, 42);
        cooked(&mut v, 42);
        recovered(&mut v, 900, 72.);
        v.minutes += 1440.;
        advance(&mut v, 0.);
        assert_eq!(v.situations.resolved_count, 0);
        cooked(&mut v, 1200);
        advance(&mut v, 0.);
        assert_eq!(v.situations.resolved_count, 1);
        assert!(valid(&v));
        let before = serde_json::to_string(&v.situations).unwrap();
        cooked(&mut v, 0);
        assert_eq!(serde_json::to_string(&v.situations).unwrap(), before);
    }

    #[test]
    fn concern_requires_repeated_unequal_work_not_a_busy_afternoon() {
        let mut v = village();
        v.situations.cooking[0].insert(2, 6);
        advance(&mut v, 0.);
        assert!(v.situations.active.is_none());
        v.situations.cooking[0] = (0..5).map(|id| (id, 2)).collect();
        v.situations.cooking[1] = (0..5).map(|id| (id, 4)).collect();
        advance(&mut v, 0.);
        assert!(v.situations.active.is_none());
        v.situations.cooking = Default::default();
        v.situations.cooking[1].insert(2, 6);
        v.minutes += 3. * 1440.;
        advance(&mut v, 0.);
        assert!(v.situations.active.is_none());
    }
    #[test]
    fn an_unanswered_story_check_in_cannot_count_as_a_completed_agreement() {
        let mut v = concerned_village();
        v.situations.active.as_mut().unwrap().story_check_in = true;
        cooked(&mut v, 0);
        cooked(&mut v, 1);
        recovered(&mut v, 2, 1440.);
        v.minutes += 2880.;
        advance(&mut v, 2880.);
        assert_eq!(v.situations.resolved_count, 0);
        assert!(v.situations.active.as_ref().unwrap().resolved.is_none());
        assert_eq!(respond(&mut v, "share_shifts"), "ok");
        cooked(&mut v, 0);
        cooked(&mut v, 1);
        recovered(&mut v, 2, 72.);
        advance(&mut v, 0.);
        assert_eq!(
            v.situations.resolved_count, 0,
            "The agreed recovery day has not passed"
        );
        v.minutes += 1440.;
        advance(&mut v, 1440.);
        assert_eq!(v.situations.resolved_count, 1);
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
        legacy["village"]["version"] = 41.into();
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
