//! Personal routines belong to a person, independently of their runtime ID.
use crate::*;
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Hobby {
    NatureWalk,
    Birdwatch,
    Stretch,
    Daydream,
}
impl Hobby {
    pub fn task(self) -> &'static str {
        match self {
            Self::NatureWalk => "nature_walk",
            Self::Birdwatch => "birdwatch",
            Self::Stretch => "stretch",
            Self::Daydream => "daydream",
        }
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Preferences {
    pub preferred_bedtime: f32,
    pub favourite_hobby: Hobby,
    pub alternate_hobby: Hobby,
}
impl Preferences {
    pub const fn new(
        preferred_bedtime: f32,
        favourite_hobby: Hobby,
        alternate_hobby: Hobby,
    ) -> Self {
        Self {
            preferred_bedtime,
            favourite_hobby,
            alternate_hobby,
        }
    }
    pub fn valid(self) -> bool {
        self.preferred_bedtime.is_finite()
            && (1200.0..=1410.0).contains(&self.preferred_bedtime)
            && self.preferred_bedtime % 15. == 0.
    }
}
// Historical founding presets are immutable migration data, not ID-based runtime rules.
pub const IARA_V1: Preferences = Preferences::new(1290., Hobby::NatureWalk, Hobby::Birdwatch);
pub const BENTO_V1: Preferences = Preferences::new(1335., Hobby::Stretch, Hobby::Daydream);
pub const LUZ_V1: Preferences = Preferences::new(1260., Hobby::Daydream, Hobby::Stretch);
pub const CAUA_V1: Preferences = Preferences::new(1380., Hobby::Birdwatch, Hobby::NatureWalk);
pub const NINA_V1: Preferences = Preferences::new(1305., Hobby::Daydream, Hobby::Stretch);

pub fn migrate(raw: &mut serde_json::Value) -> bool {
    let Some(people) = raw["residents"].as_array_mut() else {
        return false;
    };
    for person in people {
        if person.get("routine_preferences").is_some() {
            continue;
        }
        let Some(id) = person["id"].as_u64() else {
            return false;
        };
        let preferences = match id {
            0 => IARA_V1,
            1 => BENTO_V1,
            2 => LUZ_V1,
            3 => CAUA_V1,
            4 => NINA_V1,
            _ => return false,
        };
        person["routine_preferences"] = serde_json::to_value(preferences).unwrap();
    }
    true
}
pub fn catalog() -> serde_json::Value {
    serde_json::json!({"hobbies":[{"id":"nature_walk","name":"Nature walks"},{"id":"birdwatch","name":"Birdwatching"},{"id":"stretch","name":"Gentle stretching"},{"id":"daydream","name":"Quiet daydreaming"}],"bedtime":{"earliest":1200,"latest":1410,"step":15},"note":"Personal daytime favourites alternate across the day. Weather, social needs and evening routines still take precedence. Energy determines the actual bedtime and six-to-nine-hour sleep target."})
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn personal_routines_follow_data_instead_of_identity_or_name() {
        let mut person = initialization::founding_residents(CAMP).remove(0);
        person.social = 90.;
        person.energy = 60.;
        let mut v = Village {
            minutes: 480.,
            ..Village::default()
        };
        let baseline = leisure::choose(&person, &v);
        sleep::prepare(&mut person, 480.);
        let bedtime = person.sleep.bedtime;
        let mut renamed = person.clone();
        renamed.id = 42;
        renamed.name = "João".into();
        assert_eq!(leisure::choose(&renamed, &v), baseline);
        sleep::prepare(&mut renamed, 480.);
        assert_eq!(renamed.sleep.bedtime, bedtime);
        renamed.routine_preferences = Preferences::new(1380., Hobby::Stretch, Hobby::Daydream);
        sleep::prepare(&mut renamed, 480.);
        assert_eq!(renamed.sleep.bedtime, 1380.);
        assert_eq!(leisure::choose(&renamed, &v).0, "stretch");
        v.minutes = 720.;
        assert_eq!(leisure::choose(&renamed, &v).0, "daydream");
        assert_eq!(sleep::duration(0.), 540.);
        assert_eq!(sleep::duration(100.), 360.);
    }
    #[test]
    fn migration_preserves_the_whole_world_and_ongoing_sleep() {
        let mut g = Game::new();
        g.app.world_mut().resource_mut::<Village>().minutes = 1400.;
        let mut q = g.app.world_mut().query::<&mut Resident>();
        for mut r in q.iter_mut(g.app.world_mut()) {
            sleep::prepare(&mut r, 1200.);
            sleep::tick(&mut r, 1250.);
            sleep::tick(&mut r, 1400.);
        }
        let expected = g.snapshot();
        let mut old: serde_json::Value = serde_json::from_str(&expected).unwrap();
        old["village"]["version"] = 33.into();
        for p in old["residents"].as_array_mut().unwrap() {
            p.as_object_mut().unwrap().remove("routine_preferences");
        }
        let mut copy = Game::new();
        assert!(copy.restore(&old.to_string()));
        assert_eq!(copy.snapshot(), expected);
        for _ in 0..40 {
            g.tick(0.25);
            copy.tick(0.25);
        }
        assert_eq!(copy.snapshot(), g.snapshot());
    }
    #[test]
    fn invalid_or_missing_preferences_are_atomic() {
        let mut g = Game::new();
        let before = g.snapshot();
        let raw: serde_json::Value = serde_json::from_str(&before).unwrap();
        for value in [1199., 1411., 1300.] {
            let mut bad = raw.clone();
            bad["residents"][0]["routine_preferences"]["preferred_bedtime"] = value.into();
            assert!(!g.restore(&bad.to_string()));
            assert_eq!(g.snapshot(), before);
        }
        let mut bad = raw.clone();
        bad["residents"][0]["routine_preferences"]["favourite_hobby"] = "unsupported".into();
        assert!(!g.restore(&bad.to_string()));
        assert_eq!(g.snapshot(), before);
        bad = raw;
        bad["residents"][0]
            .as_object_mut()
            .unwrap()
            .remove("routine_preferences");
        assert!(!g.restore(&bad.to_string()));
        assert_eq!(g.snapshot(), before);
        for bedtime in (1200..=1410).step_by(15) {
            assert!(Preferences::new(bedtime as f32, Hobby::Daydream, Hobby::Stretch).valid());
        }
    }
}
