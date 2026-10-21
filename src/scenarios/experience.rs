use super::*;
#[derive(Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Policy {
    #[default]
    Balanced,
    Unrestricted,
}
impl Policy {
    pub fn is_balanced(&self) -> bool {
        *self == Self::Balanced
    }
}
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Domain {
    Building,
    Hauling,
    Growing,
    Cooking,
    Making,
    EquipmentCare,
}
impl Domain {
    pub const ALL: [Self; 6] = [
        Self::Building,
        Self::Hauling,
        Self::Growing,
        Self::Cooking,
        Self::Making,
        Self::EquipmentCare,
    ];
    pub fn index(self) -> usize {
        match self {
            Self::Building => 0,
            Self::Hauling => 1,
            Self::Growing => 2,
            Self::Cooking => 3,
            Self::Making => 4,
            Self::EquipmentCare => 5,
        }
    }
}
#[derive(Clone, Copy, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Background {
    #[default]
    Newcomer,
    Builder,
    Grower,
    Cook,
    Maker,
    Caretaker,
    Hauler,
}
impl Background {
    pub fn label(self) -> &'static str {
        match self {
            Self::Newcomer => "Starting fresh",
            Self::Builder => "Building experience",
            Self::Grower => "Growing experience",
            Self::Cook => "Kitchen experience",
            Self::Maker => "Making and repairing",
            Self::Caretaker => "Water and equipment care",
            Self::Hauler => "Transport and logistics",
        }
    }
    fn suggested(self) -> [u8; 6] {
        match self {
            Self::Newcomer => [0; 6],
            Self::Builder => [2, 1, 0, 0, 1, 0],
            Self::Grower => [0, 1, 2, 1, 0, 0],
            Self::Cook => [0, 1, 1, 2, 0, 0],
            Self::Maker => [1, 0, 0, 0, 2, 1],
            Self::Caretaker => [0, 1, 0, 0, 1, 2],
            Self::Hauler => [1, 2, 0, 0, 0, 1],
        }
    }
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Experience {
    #[serde(default)]
    pub background: Background,
    #[serde(default)]
    pub levels: BTreeMap<Domain, u8>,
}
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Group {
    Construction,
    Hauling,
    Food,
    Materials,
    Care,
}
impl Group {
    pub const ALL: [Self; 5] = [
        Self::Construction,
        Self::Hauling,
        Self::Food,
        Self::Materials,
        Self::Care,
    ];
    pub fn index(self) -> usize {
        match self {
            Self::Construction => 0,
            Self::Hauling => 1,
            Self::Food => 2,
            Self::Materials => 3,
            Self::Care => 4,
        }
    }
}
#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Bias {
    Less,
    Share,
    Prefer,
}
impl Bias {
    pub fn value(self) -> u8 {
        match self {
            Self::Less => 0,
            Self::Share => 1,
            Self::Prefer => 2,
        }
    }
}
pub fn check(d: &Definition, r: &mut Report) {
    let mut has_skills = false;
    if let Some(people) = &d.start.residents {
        for (i, person) in people.iter().enumerate() {
            if let Some(experience) = &person.experience {
                let total: u32 = experience.levels.values().map(|&n| u32::from(n)).sum();
                has_skills |= total > 0;
                if experience.levels.values().any(|&n| n > 5) {
                    r.push(
                        &format!("start.residents.{i}.experience"),
                        "invalid_starting_experience",
                        "Choose skill levels between zero and five.",
                    );
                } else if d.start.resident_balance == Policy::Balanced
                    && (total > 6 || experience.levels.values().any(|&n| n > 3))
                {
                    r.push(&format!("start.residents.{i}.experience"),"experience_budget","Balanced setup allows six starting levels per resident, with no skill above level three. Reduce levels or choose unrestricted setup.");
                }
            }
        }
    }
    if has_skills && !d.rules.learning {
        r.issues.push(Issue{severity:Severity::Warning,code:"inactive_starting_skills".into(),path:"rules.learning".into(),message:"Learning and skill benefits are off. Starting experience is saved but has no work benefit until that rule is enabled.".into(),at:None,entity:None});
    }
}
pub fn apply(person: &residents::Person, id: usize, v: &mut Village) {
    if let Some(experience) = &person.experience {
        let record = v.skills.people.entry(id).or_default();
        record.experience = [0; skills::COUNT];
        record.today = [0; skills::COUNT];
        record.day = (v.minutes / 1440.) as u32;
        for (&domain, &level) in &experience.levels {
            record.experience[domain.index()] = if level == 0 {
                0
            } else {
                skills::THRESHOLDS[usize::from(level - 1)]
            };
        }
    }
    let preferences = v.workforce.preferences.entry(id).or_insert([1; 5]);
    for (&group, &bias) in &person.work_preferences {
        preferences[group.index()] = bias.value();
    }
}
pub fn catalog() -> serde_json::Value {
    let backgrounds = [
        Background::Newcomer,
        Background::Builder,
        Background::Grower,
        Background::Cook,
        Background::Maker,
        Background::Caretaker,
        Background::Hauler,
    ]
    .into_iter()
    .map(|b| {
        let levels: BTreeMap<_, _> = Domain::ALL.into_iter().zip(b.suggested()).collect();
        serde_json::json!({"key":b,"name":b.label(),"levels":levels})
    })
    .collect::<Vec<_>>();
    serde_json::json!({"balanced_total":6,"balanced_maximum":3,"maximum_level":5,"bonus_per_level":3,"skills":Domain::ALL.map(|key|serde_json::json!({"key":key,"name":skills::LABELS[key.index()]})),"backgrounds":backgrounds,"work_groups":Group::ALL.map(|key|serde_json::json!({"key":key,"name":(["Building","Hauling","Food","Materials","Water and care"][key.index()])}))})
}

#[cfg(test)]
mod tests {
    use super::*;
    fn with_levels(levels: &[(Domain, u8)]) -> Definition {
        let mut d = Definition::builtin(modes::Mode::Sandbox);
        d.rules.learning = true;
        d.start.residents.as_mut().unwrap()[0].experience = Some(Experience {
            background: Background::Builder,
            levels: levels.iter().copied().collect(),
        });
        d
    }
    #[test]
    fn starting_skills_and_preferences_bind_to_identity_and_never_reset_learned_progress() {
        let mut d = with_levels(&[(Domain::Building, 2), (Domain::Hauling, 1)]);
        d.start.minutes = 1980.;
        d.start.residents.as_mut().unwrap()[0].work_preferences = [
            (Group::Construction, Bias::Prefer),
            (Group::Food, Bias::Less),
        ]
        .into_iter()
        .collect();
        d.start.residents.as_mut().unwrap().reverse();
        let (mut g, _) =
            crate::scenarios::compile(d).unwrap_or_else(|_| panic!("valid starting experience"));
        let v = g.app.world().resource::<Village>();
        assert_eq!(v.skills.people[&0].experience, [32, 12, 0, 0, 0, 0]);
        assert_eq!(v.skills.people[&0].today, [0; 6]);
        assert_eq!(v.skills.people[&0].day, 1);
        assert_eq!(v.workforce.preferences[&0], [2, 1, 0, 1, 1]);
        assert_eq!(v.workforce.preferences[&1], [1; 5]);
        assert!(v.workforce.days.is_empty());
        assert!((skills::factor(v, 0, skills::Skill::Building) - 1.06).abs() < 0.00001);
        assert_eq!(
            skills::view(v)["people"][0]["background"],
            "Building experience"
        );
        assert_eq!(
            occupations::job(v, 0).unwrap().title,
            "Plant nursery assistant"
        );
        skills::award(
            &mut g.app.world_mut().resource_mut::<Village>(),
            0,
            skills::Skill::Building,
            3,
        );
        assert_eq!(g.set_work_preference(0, "food", 2), "ok");
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_eq!(g.snapshot(), saved);
        let v = g.app.world().resource::<Village>();
        assert_eq!(v.skills.people[&0].experience[0], 35);
        assert_eq!(v.skills.people[&0].today[0], 3);
        assert_eq!(v.workforce.preferences[&0][2], 2);
    }
    #[test]
    fn balanced_budgets_and_unrestricted_bounds_are_enforced_before_installation() {
        for levels in [
            vec![(Domain::Building, 4)],
            vec![
                (Domain::Building, 3),
                (Domain::Cooking, 3),
                (Domain::Making, 1),
            ],
        ] {
            let error = crate::scenarios::compile(with_levels(&levels))
                .err()
                .unwrap();
            assert!(error.issues.iter().any(|i| i.code == "experience_budget"));
        }
        let mut unrestricted = with_levels(&Domain::ALL.map(|d| (d, 5)));
        unrestricted.start.resident_balance = Policy::Unrestricted;
        let (g, _) = crate::scenarios::compile(unrestricted)
            .unwrap_or_else(|_| panic!("supported unrestricted setup"));
        assert_eq!(
            g.app.world().resource::<Village>().skills.people[&0].experience,
            [160; 6]
        );
        let mut invalid = with_levels(&[(Domain::Building, 6)]);
        invalid.start.resident_balance = Policy::Unrestricted;
        assert!(crate::scenarios::compile(invalid).is_err());
    }
    #[test]
    fn backgrounds_are_valid_suggestions_and_disabled_skills_are_explained() {
        for b in [
            Background::Newcomer,
            Background::Builder,
            Background::Grower,
            Background::Cook,
            Background::Maker,
            Background::Caretaker,
            Background::Hauler,
        ] {
            let d = with_levels(
                &Domain::ALL
                    .into_iter()
                    .zip(b.suggested())
                    .collect::<Vec<_>>(),
            );
            assert!(crate::scenarios::compile(d).is_ok());
        }
        let mut d = with_levels(&[(Domain::Building, 2)]);
        d.rules.learning = false;
        let (g, report) =
            crate::scenarios::compile(d).unwrap_or_else(|_| panic!("disabled skills remain saved"));
        assert!(
            report
                .issues
                .iter()
                .any(|i| i.code == "inactive_starting_skills")
        );
        assert_eq!(
            skills::factor(
                g.app.world().resource::<Village>(),
                0,
                skills::Skill::Building
            ),
            1.
        );
    }
    #[test]
    fn unsupported_experience_and_work_keys_leave_the_current_village_unchanged() {
        let mut g = Game::new();
        let saved = g.snapshot();
        for (field, value) in [
            (
                "experience",
                serde_json::json!({"background":"builder","levels":{"magic":2}}),
            ),
            (
                "experience",
                serde_json::json!({"background":"custom_script","levels":{}}),
            ),
            (
                "work_preferences",
                serde_json::json!({"construction":"force"}),
            ),
            (
                "work_preferences",
                serde_json::json!({"hidden_category":"prefer"}),
            ),
        ] {
            let mut d: serde_json::Value =
                serde_json::from_str(&g.scenario_template("sandbox")).unwrap();
            d["start"]["residents"][0][field] = value;
            let result: serde_json::Value =
                serde_json::from_str(&g.load_scenario(&d.to_string())).unwrap();
            assert_eq!(result["ok"], false);
            assert_eq!(g.snapshot(), saved);
        }
    }
}
