//! Supported personality choices have bounded effects independent of appearance.
use crate::*;
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SocialStyle {
    Balanced,
    Outgoing,
    Reserved,
}
impl SocialStyle {
    pub fn factor(self) -> f32 {
        match self {
            Self::Balanced => 1.,
            Self::Outgoing => 1.2,
            Self::Reserved => 0.8,
        }
    }
    pub fn name(self) -> &'static str {
        match self {
            Self::Balanced => "Balanced",
            Self::Outgoing => "Outgoing",
            Self::Reserved => "Reserved",
        }
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Interest {
    Gardening,
    Building,
    Cooking,
    Foraging,
    Caretaking,
}
impl Interest {
    pub fn task(self) -> &'static str {
        match self {
            Self::Gardening => "garden",
            Self::Building => "build",
            Self::Cooking => "cook",
            Self::Foraging => "gather",
            Self::Caretaking => "water",
        }
    }
    pub fn label(self) -> &'static str {
        match self {
            Self::Gardening => "gardener",
            Self::Building => "builder",
            Self::Cooking => "cook",
            Self::Foraging => "forager",
            Self::Caretaking => "caretaker",
        }
    }
    pub fn from_task(task: &str) -> Option<Self> {
        [
            Self::Gardening,
            Self::Building,
            Self::Cooking,
            Self::Foraging,
            Self::Caretaking,
        ]
        .into_iter()
        .find(|interest| interest.task() == task)
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Profile {
    pub social_style: SocialStyle,
    pub work_interest: Interest,
}
impl Profile {
    pub fn apply(self, person: &mut Resident) {
        person.social_style = self.social_style;
        person.favorite = self.work_interest.task().into();
        person.trait_name = format!(
            "{} · {}",
            self.social_style.name(),
            self.work_interest.label()
        );
    }
}
pub fn lose_connection(person: &mut Resident, amount: f32) {
    if amount.is_finite() && amount >= 0. {
        person.social = (person.social - amount * person.social_style.factor()).max(0.);
    }
}
pub fn company(person: &mut Resident, amount: f32) {
    if amount.is_finite() && amount >= 0. {
        person.social = (person.social + amount * person.social_style.factor()).min(100.);
    }
}
pub fn migrate(raw: &mut serde_json::Value) -> bool {
    let Some(people) = raw["residents"].as_array_mut() else {
        return false;
    };
    for person in people {
        let Some(person) = person.as_object_mut() else {
            return false;
        };
        person
            .entry("social_style")
            .or_insert(serde_json::json!("balanced"));
    }
    true
}
pub fn catalog() -> serde_json::Value {
    serde_json::json!({"social_styles":[
 {"key":SocialStyle::Balanced,"name":"Balanced","description":"Connection changes at the usual pace, alone and with neighbours."},
 {"key":SocialStyle::Outgoing,"name":"Outgoing","description":"Connection falls 20% faster alone and recovers 20% faster with neighbours."},
 {"key":SocialStyle::Reserved,"name":"Reserved","description":"Connection falls 20% more slowly alone and recovers 20% more slowly with neighbours."}],
 "interests":[
 {"key":Interest::Gardening,"name":"Gardening","description":"More inclined to tend crops, with larger crop harvests."},
 {"key":Interest::Building,"name":"Building","description":"More inclined to build, and works faster on construction and building changes."},
 {"key":Interest::Cooking,"name":"Cooking","description":"More inclined to help in the kitchen."},
 {"key":Interest::Foraging,"name":"Foraging","description":"More inclined to forage for the village."},
 {"key":Interest::Caretaking,"name":"Water and care","description":"More inclined to help with water and community care."}],
 "founders":initialization::founding_residents(CAMP).iter().map(|p|serde_json::json!({"preset":(["iara","bento","luz","caua","nina"][p.id]),"profile":Profile{social_style:SocialStyle::Balanced,work_interest:Interest::from_task(&p.favorite).unwrap()}})).collect::<Vec<_>>()})
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn social_styles_have_bounded_tradeoffs_and_change_a_real_leisure_choice() {
        let mut outgoing = initialization::founding_residents(CAMP).remove(0);
        outgoing.id = 42;
        outgoing.name = "Sam".into();
        outgoing.social = 65.035;
        let mut reserved = outgoing.clone();
        outgoing.social_style = SocialStyle::Outgoing;
        reserved.social_style = SocialStyle::Reserved;
        lose_connection(&mut outgoing, 0.035);
        lose_connection(&mut reserved, 0.035);
        let v = Village::default();
        assert_eq!(leisure::choose(&outgoing, &v).0, "socialize");
        assert_eq!(leisure::choose(&reserved, &v).0, "nature_walk");
        outgoing.social = 50.;
        reserved.social = 50.;
        company(&mut outgoing, 10.);
        company(&mut reserved, 10.);
        assert_eq!(outgoing.social, 62.);
        assert_eq!(reserved.social, 58.);
        company(&mut outgoing, 1000.);
        lose_connection(&mut reserved, 1000.);
        assert_eq!(outgoing.social, 100.);
        assert_eq!(reserved.social, 0.);
        company(&mut outgoing, f32::NAN);
        lose_connection(&mut outgoing, -10.);
        assert_eq!(outgoing.social, 100.);
    }
    #[test]
    fn actual_simulation_applies_each_style_without_changing_sleep_or_work_interests() {
        for (style, factor) in [
            (SocialStyle::Balanced, 1.),
            (SocialStyle::Outgoing, 1.2),
            (SocialStyle::Reserved, 0.8),
        ] {
            let mut g = Game::new();
            g.app.world_mut().resource_mut::<Village>().arrived = true;
            let mut q = g.app.world_mut().query::<&mut Resident>();
            for mut r in q.iter_mut(g.app.world_mut()) {
                r.task = "rest".into();
                r.remaining = 60.;
                r.requested = true;
                r.target_x = r.x;
                r.target_y = r.y;
                r.energy = 30.;
                r.hunger = 10.;
                r.social = 80.;
                if r.id == 0 {
                    r.social_style = style;
                }
            }
            g.tick(0.25);
            let mut q = g.app.world_mut().query::<&Resident>();
            let r = q.iter(g.app.world()).find(|r| r.id == 0).unwrap();
            assert!(
                (r.social - (80. - 0.25 * 0.035 * factor)).abs() < 0.00002,
                "{:?} {}",
                style,
                r.social
            );
            assert_eq!(r.favorite, "garden");
            assert_eq!(r.routine_preferences, resident_preferences::IARA_V1);
        }
    }
    #[test]
    fn legacy_personality_migration_preserves_people_and_other_state() {
        let mut g = Game::new();
        let mut old: serde_json::Value = serde_json::from_str(&g.snapshot()).unwrap();
        old["village"]["version"] = 38.into();
        for person in old["residents"].as_array_mut().unwrap() {
            person.as_object_mut().unwrap().remove("social_style");
        }
        assert!(g.restore(&old.to_string()));
        let current: serde_json::Value = serde_json::from_str(&g.snapshot()).unwrap();
        assert_eq!(current["village"]["skills"], old["village"]["skills"]);
        assert_eq!(current["village"]["economy"], old["village"]["economy"]);
        let mut normalized = current["residents"].clone();
        for person in normalized.as_array_mut().unwrap() {
            assert_eq!(person["social_style"], "balanced");
            person.as_object_mut().unwrap().remove("social_style");
        }
        assert_eq!(normalized, old["residents"]);
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_eq!(g.snapshot(), saved);
        for value in [
            serde_json::Value::Null,
            serde_json::json!("unknown"),
            serde_json::json!(4),
        ] {
            let mut bad = current.clone();
            bad["residents"][0]["social_style"] = value;
            assert!(!g.restore(&bad.to_string()));
            assert_eq!(g.snapshot(), saved);
        }
        let mut bad = current;
        bad["residents"][0]
            .as_object_mut()
            .unwrap()
            .remove("social_style");
        assert!(!g.restore(&bad.to_string()));
        assert_eq!(g.snapshot(), saved);
    }
}
