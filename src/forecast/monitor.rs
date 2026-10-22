//! Bounded per-step summaries. Route-dependent services remain hourly readings.
use crate::*;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Serialize)]
pub(super) struct Exposure {
    minutes: f32,
    longest_minutes: f32,
    longest_window: Option<[f32; 2]>,
    first_at: Option<f32>,
    episodes: u32,
    ongoing: bool,
    #[serde(skip)]
    last: f32,
    #[serde(skip)]
    since: Option<f32>,
}
impl Exposure {
    fn new(now: f32) -> Self {
        Self {
            minutes: 0.,
            longest_minutes: 0.,
            longest_window: None,
            first_at: None,
            episodes: 0,
            ongoing: false,
            last: now,
            since: None,
        }
    }
    // Hold each observed state until the next native boundary. There is no
    // interpolation between ticks and no exposure beyond the replay horizon.
    fn observe(&mut self, now: f32, active: bool) {
        if self.ongoing {
            self.minutes += (now - self.last).max(0.);
            let start = self.since.unwrap();
            if now - start > self.longest_minutes {
                self.longest_minutes = now - start;
                self.longest_window = Some([start, now]);
            }
        }
        if active && !self.ongoing {
            self.first_at.get_or_insert(now);
            self.since = Some(now);
            self.episodes += 1;
        } else if !active {
            self.since = None;
        }
        self.ongoing = active;
        self.last = now;
    }
}

#[derive(Serialize)]
struct Need {
    maximum_residents: usize,
    any_resident: Exposure,
}
impl Need {
    fn new(now: f32) -> Self {
        Self {
            maximum_residents: 0,
            any_resident: Exposure::new(now),
        }
    }
    fn observe(&mut self, now: f32, count: usize) {
        self.maximum_residents = self.maximum_residents.max(count);
        self.any_resident.observe(now, count > 0);
    }
}
#[derive(Serialize)]
struct Person {
    resident: usize,
    name: String,
    hungry: Exposure,
    low_energy: Exposure,
}
#[derive(Serialize)]
struct Stock {
    lowest_owned: f64,
    empty: Exposure,
}
impl Stock {
    fn new(now: f32, value: f64) -> Self {
        Self {
            lowest_owned: value,
            empty: Exposure::new(now),
        }
    }
    fn observe(&mut self, now: f32, value: f64) {
        self.lowest_owned = self.lowest_owned.min(value);
        self.empty.observe(now, value <= 0.);
    }
}
#[derive(Serialize)]
pub(super) struct Monitor {
    maximum_step_minutes: f32,
    observations: u32,
    hungry: Need,
    low_energy: Need,
    people: BTreeMap<usize, Person>,
    #[serde(skip_serializing_if = "Option::is_none")]
    food: Option<Stock>,
    #[serde(skip_serializing_if = "Option::is_none")]
    fresh_water: Option<Stock>,
}
impl Monitor {
    pub(super) fn new(v: &Village) -> Self {
        Self {
            maximum_step_minutes: MINUTES_PER_SECOND * 0.25,
            observations: 0,
            hungry: Need::new(v.minutes),
            low_energy: Need::new(v.minutes),
            people: BTreeMap::new(),
            food: sandbox::logistics(v)
                .then(|| Stock::new(v.minutes, f64::from(food::owned_portions(v)))),
            fresh_water: sandbox::utilities(v)
                .then(|| Stock::new(v.minutes, water::total(v, water::Class::Fresh))),
        }
    }
    pub(super) fn observe<'a>(&mut self, v: &Village, people: impl Iterator<Item = &'a Resident>) {
        let mut hungry = 0;
        let mut low_energy = 0;
        let mut seen = BTreeSet::new();
        for r in people {
            seen.insert(r.id);
            let p = self.people.entry(r.id).or_insert_with(|| Person {
                resident: r.id,
                name: r.name.clone(),
                hungry: Exposure::new(v.minutes),
                low_energy: Exposure::new(v.minutes),
            });
            p.hungry.observe(v.minutes, r.hunger >= 70.);
            p.low_energy.observe(v.minutes, r.energy <= 25.);
            hungry += usize::from(r.hunger >= 70.);
            low_energy += usize::from(r.energy <= 25.);
        }
        for p in self
            .people
            .values_mut()
            .filter(|p| !seen.contains(&p.resident))
        {
            p.hungry.observe(v.minutes, false);
            p.low_energy.observe(v.minutes, false);
        }
        self.hungry.observe(v.minutes, hungry);
        self.low_energy.observe(v.minutes, low_energy);
        if let Some(stock) = &mut self.food {
            stock.observe(v.minutes, f64::from(food::owned_portions(v)));
        }
        if let Some(stock) = &mut self.fresh_water {
            stock.observe(v.minutes, water::total(v, water::Class::Fresh));
        }
        self.observations += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn short_episodes_recovery_and_final_boundary_are_accounted_without_hourly_aliasing() {
        let mut e = Exposure::new(540.);
        e.observe(540., false);
        e.observe(545.25, true);
        e.observe(548.25, true);
        e.observe(552., false);
        e.observe(600., false);
        assert_eq!(e.minutes, 6.75);
        assert_eq!(e.longest_window, Some([545.25, 552.]));
        assert_eq!(e.first_at, Some(545.25));
        assert_eq!(e.episodes, 1);
        assert!(!e.ongoing);
        e.observe(600., true);
        assert_eq!(
            e.minutes, 6.75,
            "A boundary observation adds no elapsed time"
        );
        e.observe(601.5, true);
        assert_eq!(e.minutes, 8.25);
        assert_eq!(e.episodes, 2);
        assert!(e.ongoing);
        assert_eq!(e.longest_minutes, 6.75);
    }
    #[test]
    fn stock_recovery_and_independent_resident_ids_keep_bounded_histories() {
        let mut v = Village::default();
        let mut people = initialization::founding_residents(v.camp);
        people.truncate(2);
        people[0].id = 42;
        people[1].id = 900;
        people[0].hunger = 70.;
        people[0].energy = 90.;
        people[1].hunger = 0.;
        people[1].energy = 25.;
        let mut m = Monitor::new(&v);
        m.observe(&v, people.iter());
        v.minutes += 0.75;
        people.reverse();
        people[1].hunger = 0.;
        m.observe(&v, people.iter());
        assert_eq!(m.people[&42].hungry.minutes, 0.75);
        assert_eq!(m.people[&900].hungry.minutes, 0.);
        assert_eq!(m.people[&900].low_energy.minutes, 0.75);
        assert_eq!(m.hungry.maximum_residents, 1);
        v.minutes += 0.75;
        m.observe(&v, std::iter::empty());
        assert!(!m.people[&900].low_energy.ongoing);
        assert_eq!(m.people.len(), 2);
        let mut stock = Stock::new(0., 20.);
        stock.observe(0., 20.);
        stock.observe(5., 0.);
        stock.observe(10., 4.);
        stock.observe(60., 8.);
        assert_eq!(stock.lowest_owned, 0.);
        assert_eq!(stock.empty.minutes, 5.);
        assert_eq!(stock.empty.episodes, 1);
    }
    #[test]
    fn automatic_supplies_do_not_become_fake_finite_stock_gaps() {
        let mut v = Village {
            mode: modes::Mode::Sandbox,
            ..Village::default()
        };
        let mut m = Monitor::new(&v);
        m.observe(&v, std::iter::empty());
        let report = serde_json::to_value(m).unwrap();
        assert!(report.get("food").is_none());
        assert!(report.get("fresh_water").is_none());
        v.sandbox_rules.logistics = true;
        v.sandbox_rules.utilities = true;
        let report = serde_json::to_value(Monitor::new(&v)).unwrap();
        assert!(report.get("food").is_some());
        assert!(report.get("fresh_water").is_some());
    }
}
