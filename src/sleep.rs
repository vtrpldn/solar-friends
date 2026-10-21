//! Individual daily bedtimes and fixed, energy-based actual sleep targets.
use crate::*;

#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Routine {
    pub day: i32,
    pub bedtime: f32,
    pub duration_minutes: f32,
    pub slept_minutes: f32,
    pub started_at: Option<f32>,
    pub wake_at: Option<f32>,
    pub last_tick: Option<f32>,
}
impl Default for Routine {
    fn default() -> Self {
        Self {
            day: -1,
            bedtime: 0.,
            duration_minutes: 0.,
            slept_minutes: 0.,
            started_at: None,
            wake_at: None,
            last_tick: None,
        }
    }
}
pub fn duration(energy: f32) -> f32 {
    ((360. + (100. - energy.clamp(0., 100.)) * 1.8) / 15.).round() * 15.
}
fn bedtime(preferred: f32, energy: f32) -> f32 {
    let shift = if energy < 60. {
        -(60. - energy) * 1.5
    } else {
        (energy - 60.) * 0.75
    };
    ((preferred + shift).clamp(1200., 1410.) / 15.).round() * 15.
}
pub fn prepare(r: &mut Resident, now: f32) {
    if r.sleep.started_at.is_some() && r.sleep.slept_minutes < r.sleep.duration_minutes {
        return;
    }
    if r.sleep.day >= 0
        && r.trip
            .as_ref()
            .is_some_and(|t| t.purpose == mobility::Purpose::Overnight)
    {
        return;
    }
    let day = (now / 1440.).floor() as i32;
    if r.sleep.day >= 0
        && now >= r.sleep.bedtime
        && (r.task == "sleep" || now - r.sleep.bedtime < 600.)
        && r.sleep.started_at.is_none()
    {
        return;
    }
    if r.sleep.day != day {
        let previous = now.rem_euclid(1440.) < 360. && r.sleep.day < day - 1;
        let plan_day = if previous { (day - 1).max(0) } else { day };
        r.sleep = Routine {
            day: plan_day,
            bedtime: plan_day as f32 * 1440.
                + bedtime(r.routine_preferences.preferred_bedtime, r.energy),
            ..Routine::default()
        };
    } else if now.rem_euclid(1440.) < 1080. && r.sleep.started_at.is_none() {
        r.sleep.bedtime =
            day as f32 * 1440. + bedtime(r.routine_preferences.preferred_bedtime, r.energy);
    }
}
pub fn due(r: &Resident, now: f32) -> bool {
    if r.sleep.started_at.is_some() {
        return r.sleep.slept_minutes < r.sleep.duration_minutes;
    }
    if r.sleep.day >= 0 {
        return now >= r.sleep.bedtime;
    }
    now.rem_euclid(1440.) >= bedtime(r.routine_preferences.preferred_bedtime, r.energy)
        || now.rem_euclid(1440.) < 360.
}
pub fn pause(r: &mut Resident) {
    if r.sleep.started_at.is_some() && r.sleep.slept_minutes < r.sleep.duration_minutes {
        r.sleep.last_tick = None;
        r.sleep.wake_at = None;
    }
}
pub fn tick(r: &mut Resident, now: f32) {
    if r.sleep.day < 0 {
        prepare(r, now);
    }
    if r.sleep.started_at.is_none() {
        r.sleep.started_at = Some(now);
        r.sleep.duration_minutes = duration(r.energy);
        r.sleep.slept_minutes = 0.;
    }
    let remaining = (r.sleep.duration_minutes - r.sleep.slept_minutes).max(0.);
    let elapsed = r.sleep.last_tick.map_or(0., |last| (now - last).max(0.));
    r.sleep.slept_minutes = (r.sleep.slept_minutes + elapsed).min(r.sleep.duration_minutes);
    r.sleep.wake_at = Some(if elapsed >= remaining {
        now - elapsed + remaining
    } else {
        now + r.sleep.duration_minutes - r.sleep.slept_minutes
    });
    r.sleep.last_tick = Some(now);
}
pub fn valid(r: &Resident, now: f32) -> bool {
    let s = &r.sleep;
    if s.day < -1
        || s.day > (now / 1440.).floor() as i32
        || !s.bedtime.is_finite()
        || s.bedtime < 0.
        || !s.duration_minutes.is_finite()
        || !s.slept_minutes.is_finite()
        || s.slept_minutes < 0.
        || s.slept_minutes > s.duration_minutes
    {
        return false;
    }
    if s.day >= 0
        && ((s.bedtime / 1440.).floor() as i32 != s.day
            || !(1200.0..=1410.).contains(&s.bedtime.rem_euclid(1440.)))
    {
        return false;
    }
    if let Some(start) = s.started_at {
        if s.day < 0
            || s.last_tick.is_some() != s.wake_at.is_some()
            || !start.is_finite()
            || start < 0.
            || start > now
            || !(360.0..=540.).contains(&s.duration_minutes)
        {
            return false;
        }
        if s.last_tick
            .is_some_and(|t| !t.is_finite() || t < start || t > now)
        {
            return false;
        }
        if let Some(wake) = s.wake_at {
            if !wake.is_finite() || wake < start || wake > now + 540. {
                return false;
            }
            if let Some(last) = s.last_tick
                && s.slept_minutes < s.duration_minutes
                && (wake - last - (s.duration_minutes - s.slept_minutes)).abs() > 0.1
            {
                return false;
            }
        }
    } else if s.duration_minutes != 0.
        || s.slept_minutes != 0.
        || s.wake_at.is_some()
        || s.last_tick.is_some()
    {
        return false;
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    fn person(id: usize, energy: f32) -> Resident {
        let mut g = Game::new();
        let mut r = g
            .app
            .world_mut()
            .query::<&Resident>()
            .iter(g.app.world())
            .find(|r| r.id == id)
            .unwrap()
            .clone();
        r.energy = energy;
        r.task = "idle".into();
        r
    }
    #[test]
    fn targets_span_six_to_nine_hours_and_lock_when_asleep() {
        assert_eq!(duration(100.), 360.);
        assert_eq!(duration(0.), 540.);
        for energy in 0..=100 {
            assert!((360.0..=540.).contains(&duration(energy as f32)));
        }
        let mut r = person(0, 20.);
        prepare(&mut r, 1260.);
        tick(&mut r, 1260.);
        let target = r.sleep.duration_minutes;
        r.energy = 100.;
        tick(&mut r, 1380.);
        assert_eq!(r.sleep.duration_minutes, target);
        assert_eq!(r.sleep.slept_minutes, 120.);
        tick(&mut r, 1260. + target);
        assert!(!due(&r, 1260. + target));
    }
    #[test]
    fn individual_bedtimes_adjust_to_energy_and_sleep_crosses_midnight() {
        let early = bedtime(1260., 60.);
        let late = bedtime(1380., 60.);
        assert!(early < late);
        assert!(bedtime(1290., 20.) < bedtime(1290., 90.));
        let mut r = person(3, 60.);
        prepare(&mut r, 1320.);
        assert!(!due(&r, 1350.));
        assert!(due(&r, 1380.));
        r.task = "sleep".into();
        prepare(&mut r, 1450.);
        assert_eq!(r.sleep.bedtime, 1380.); // walking across midnight does not cancel bedtime
        tick(&mut r, 1450.);
        let wake = r.sleep.wake_at.unwrap();
        prepare(&mut r, 1500.);
        tick(&mut r, wake);
        assert!(!due(&r, wake));
        prepare(&mut r, wake);
        assert!(r.sleep.bedtime > 1440.);
    }
    #[test]
    fn waking_before_dawn_does_not_restart_the_same_night() {
        let mut r = person(2, 100.);
        prepare(&mut r, 1200.);
        tick(&mut r, 1260.);
        tick(&mut r, 1620.);
        assert!(!due(&r, 1620.));
        r.task = "daydream".into();
        prepare(&mut r, 1620.1);
        assert_eq!(r.sleep.day, 1);
        assert!(r.sleep.bedtime >= 2640.);
        assert!(!due(&r, 1700.));
    }
    #[test]
    fn interrupted_sleep_preserves_target_but_does_not_count_travel() {
        let mut r = person(0, 0.);
        prepare(&mut r, 1200.);
        assert_eq!(r.sleep.started_at, None);
        tick(&mut r, 1250.);
        tick(&mut r, 1350.);
        pause(&mut r);
        tick(&mut r, 1450.);
        assert_eq!(r.sleep.slept_minutes, 100.);
        assert_eq!(r.sleep.wake_at, Some(1890.));
        tick(&mut r, 1890.);
        assert_eq!(r.sleep.slept_minutes, 540.);
        assert!(valid(&r, 1890.));
    }
    #[test]
    fn saves_continue_exact_sleep_and_reject_invalid_targets_atomically() {
        let mut g = Game::new();
        g.app.world_mut().resource_mut::<Village>().minutes = 1400.;
        let mut query = g.app.world_mut().query::<&mut Resident>();
        for mut r in query.iter_mut(g.app.world_mut()) {
            prepare(&mut r, 1200.);
            tick(&mut r, 1250.);
            tick(&mut r, 1400.);
        }
        let saved = g.snapshot();
        let mut restored = Game::new();
        assert!(restored.restore(&saved));
        assert_eq!(restored.snapshot(), saved);
        let mut broken: serde_json::Value = serde_json::from_str(&saved).unwrap();
        broken["residents"][0]["sleep"]["wake_at"] = serde_json::Value::Null;
        assert!(!restored.restore(&broken.to_string()));
        assert_eq!(restored.snapshot(), saved);
        for (key, value) in [
            ("duration_minutes", 359.),
            ("slept_minutes", 600.),
            ("wake_at", 3000.),
            ("last_tick", 1500.),
        ] {
            let mut broken: serde_json::Value = serde_json::from_str(&saved).unwrap();
            broken["residents"][0]["sleep"][key] = serde_json::json!(value);
            assert!(!restored.restore(&broken.to_string()), "{key}");
            assert_eq!(restored.snapshot(), saved);
        }
    }
}
