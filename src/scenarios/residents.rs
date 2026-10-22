//! Authored identities are stable even when the cast is reordered or renamed.
use super::*;
pub const PRESETS: [&str; 5] = ["iara", "bento", "luz", "caua", "nina"];
pub const MAX_RESIDENTS: usize = 12;
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Person {
    pub id: String,
    pub preset: String,
    pub preset_version: u32,
    pub name: String,
    #[serde(default)]
    pub pronouns: String,
    #[serde(default)]
    pub biography: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub occupation: Option<occupations::Profession>,
    #[serde(default)]
    pub outside_shifts: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub personality: Option<personality::Profile>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub experience: Option<experience::Experience>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub work_preferences: BTreeMap<experience::Group, experience::Bias>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub appearance: Option<resident_appearance::Look>,
    pub routine_preferences: resident_preferences::Preferences,
}
impl Person {
    pub fn profession(&self) -> occupations::Profession {
        self.occupation.unwrap_or_else(|| {
            self.slot()
                .map(|id| occupations::FOUNDING_PROFESSIONS[id])
                .unwrap_or(occupations::Profession::None)
        })
    }
    pub fn slot(&self) -> Option<usize> {
        (self.preset_version == 1)
            .then(|| PRESETS.iter().position(|p| *p == self.preset))
            .flatten()
    }
}
pub fn founders() -> Vec<Person> {
    initialization::founding_residents(CAMP)
        .into_iter()
        .map(|r| Person {
            id: format!("resident-{}", PRESETS[r.id]),
            preset: PRESETS[r.id].into(),
            preset_version: 1,
            name: r.name,
            personality: None,
            appearance: None,
            experience: None,
            work_preferences: BTreeMap::new(),
            occupation: Some(occupations::FOUNDING_PROFESSIONS[r.id]),
            outside_shifts: false,
            pronouns: String::new(),
            biography: String::new(),
            routine_preferences: r.routine_preferences,
        })
        .collect()
}
pub fn check(d: &Definition, r: &mut Report) {
    let Some(people) = &d.start.residents else {
        return;
    };
    let mut ids = HashSet::new();
    for (i, p) in people.iter().enumerate() {
        if !valid_key(&p.id)
            || !ids.insert(&p.id)
            || p.name.trim().is_empty()
            || p.name.chars().count() > 80
            || p.pronouns.chars().count() > 40
            || p.biography.chars().count() > 600
            || !p.routine_preferences.valid()
        {
            r.push(&format!("start.residents.{i}"),"invalid_resident","Use a unique resident identity, a name of 1–80 characters, pronouns up to 40 characters, a biography up to 600 characters and supported routines.");
        }
        if p.outside_shifts && p.profession() == occupations::Profession::None {
            r.push(
                &format!("start.residents.{i}.outside_shifts"),
                "invalid_job_schedule",
                "Choose an outside occupation before scheduling shifts.",
            );
        }
        if p.appearance.is_some_and(|look| !look.valid()) {
            r.push(&format!("start.residents.{i}.appearance"),"unsupported_resident_appearance","This resident look or artwork revision is unavailable. Keep the original creation.");
        }
        if p.slot().is_none() {
            r.push(&format!("start.residents.{i}.preset"),"unsupported_resident_preset","This resident preset or its artwork version is unavailable. Keep the original creation.");
        }
    }
    if people.is_empty() || people.len() > MAX_RESIDENTS {
        r.push(
            "start.residents",
            "unsupported_cast",
            format!(
                "Keep an empty cast as a draft, or choose 1–{MAX_RESIDENTS} residents to play."
            ),
        );
    }
    if d.rules.mode == modes::Mode::Story && !original_cast(people) {
        r.push("start.residents", "missing_story_roles", "The official Story requires the five founding roles. Keep one of each founding template, or use Sandbox for a custom cast. Custom scenario role binding is not available yet.");
    }
}
fn original_cast(people: &[Person]) -> bool {
    people.len() == 5
        && people
            .iter()
            .filter_map(Person::slot)
            .collect::<HashSet<_>>()
            .len()
            == 5
}
pub fn bindings(d: &Definition) -> BTreeMap<String, usize> {
    let Some(people) = &d.start.residents else {
        return BTreeMap::new();
    };
    if original_cast(people) {
        return people
            .iter()
            .map(|p| (p.id.clone(), p.slot().unwrap()))
            .collect();
    }
    let mut people: Vec<_> = people.iter().collect();
    people.sort_by(|a, b| a.id.cmp(&b.id));
    people
        .into_iter()
        .enumerate()
        .map(|(id, p)| (p.id.clone(), id))
        .collect()
}
/// Fresh compilation only: templates supply defaults, authored identities own records.
pub fn create(d: &Definition, v: &mut Village) -> Vec<Resident> {
    let Some(definitions) = &d.start.residents else {
        return initialization::founding_residents(v.camp);
    };
    let templates = initialization::founding_residents(v.camp);
    let bindings = bindings(d);
    let mut people: Vec<_> = definitions
        .iter()
        .map(|p| {
            let mut person = templates[p.slot().expect("validated resident template")].clone();
            person.id = bindings[&p.id];
            person
        })
        .collect();
    people.sort_by_key(|p| p.id);
    v.skills.people = people
        .iter()
        .map(|p| (p.id, skills::Person::default()))
        .collect();
    v.workforce.preferences = people.iter().map(|p| (p.id, [1; 5])).collect();
    v.workforce.days.clear();
    v.simulation.days.clear();
    v.activity_claims.clear();
    v.workforce_peers.clear();
    v.economy.outside_jobs = people.iter().map(|p| (p.id, false)).collect();
    v.economy.outside_professions = people
        .iter()
        .map(|p| (p.id, occupations::Profession::None))
        .collect();
    v.economy.outside_committed_days = people.iter().map(|p| (p.id, -1)).collect();
    v.economy.work_day = people.iter().map(|p| (p.id, -1)).collect();
    if !original_cast(definitions) {
        for person in &mut people {
            let target = roster::camp_spot(v, person.id);
            person.target_x = target.0;
            person.target_y = target.1;
            person.x = target.0;
            person.y =
                (target.1 + 5.5 + (person.id % 5) as f32 * 0.15).clamp(0.3, MAP_SIZE as f32 - 0.3);
            person.reason = if definitions.len() == 1 {
                "Walking into my new clearing."
            } else {
                "Walking into the clearing with our founding group."
            }
            .into();
        }
    }
    people
}
pub fn apply(d: &Definition, people: &mut [Resident], v: &mut Village) {
    if let Some(definitions) = &d.start.residents {
        let bindings = bindings(d);
        for definition in definitions {
            if let Some(person) = bindings
                .get(&definition.id)
                .and_then(|id| people.iter_mut().find(|r| r.id == *id))
            {
                v.economy
                    .outside_professions
                    .insert(person.id, definition.profession());
                v.economy
                    .outside_jobs
                    .insert(person.id, definition.outside_shifts);
                experience::apply(definition, person.id, v);
                person.name = definition.name.clone();
                if let Some(appearance) = definition.appearance {
                    person.appearance = appearance;
                }
                person.pronouns = definition.pronouns.clone();
                person.biography = definition.biography.clone();
                person.routine_preferences = definition.routine_preferences;
                if let Some(profile) = definition.personality {
                    profile.apply(person);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn cast(count: usize) -> Definition {
        let mut d = Definition::builtin(modes::Mode::Sandbox);
        let templates = founders();
        d.start.residents = Some(
            (0..count)
                .map(|i| {
                    let mut p = templates[i % templates.len()].clone();
                    p.id = format!("friend-{i:02}");
                    p.name = format!("Friend {i}");
                    p.occupation = Some(occupations::Profession::None);
                    p
                })
                .collect(),
        );
        d
    }
    #[test]
    fn public_custom_casts_compile_across_biomes_and_keep_frozen_bindings_on_reload() {
        for biome in biomes::presets() {
            for count in [1, 2, MAX_RESIDENTS] {
                let mut d = cast(count);
                d.map = biomes::generate(biome.id, 42).unwrap();
                d.rules.logistics = true;
                d.rules.land = true;
                d.rules.utilities = true;
                let expected = bindings(&d);
                let (mut g, _) =
                    compile(d).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
                let saved = g.snapshot();
                let state: Save = serde_json::from_str(&saved).unwrap();
                assert_eq!(state.residents.len(), count);
                assert_eq!(state.village.scenario.as_ref().unwrap().residents, expected);
                assert!(g.restore(&saved));
                assert_eq!(g.snapshot(), saved);
            }
        }
        for count in [0, MAX_RESIDENTS + 1] {
            assert!(compile(cast(count)).is_err());
        }
        let mut official = cast(2);
        official.rules.mode = modes::Mode::Story;
        assert!(
            compile(official)
                .err()
                .unwrap()
                .issues
                .iter()
                .any(|i| i.code == "missing_story_roles")
        );
    }
    #[test]
    fn sparse_runtime_identities_restore_without_becoming_array_positions() {
        fn remap<T>(records: BTreeMap<usize, T>) -> BTreeMap<usize, T> {
            records
                .into_iter()
                .map(|(id, p)| (42 + id * 101, p))
                .collect()
        }
        let d = cast(2);
        let mut v = Village::default();
        let mut people = create(&d, &mut v);
        apply(&d, &mut people, &mut v);
        for person in &mut people {
            person.id = 42 + person.id * 101;
        }
        v.skills.people = remap(v.skills.people);
        v.workforce.preferences = remap(v.workforce.preferences);
        v.economy.outside_jobs = remap(v.economy.outside_jobs);
        v.economy.outside_professions = remap(v.economy.outside_professions);
        v.economy.outside_committed_days = remap(v.economy.outside_committed_days);
        v.economy.work_day = remap(v.economy.work_day);
        let mut g = initialization::create(v, people).unwrap();
        let checkpoint = g.snapshot();
        let mut restored = Game::new();
        assert!(restored.restore(&checkpoint));
        assert_eq!(restored.snapshot(), checkpoint);
        for _ in 0..20 {
            g.tick(0.25);
            restored.tick(0.25);
        }
        assert_eq!(restored.snapshot(), g.snapshot());
        let save: Save = serde_json::from_str(&g.snapshot()).unwrap();
        assert_eq!(
            save.residents.iter().map(|r| r.id).collect::<Vec<_>>(),
            [42, 143]
        );
    }
    #[test]
    fn repeated_templates_keep_separate_experience_jobs_relationships_and_names() {
        let mut d = cast(12);
        let definitions = d.start.residents.as_mut().unwrap();
        definitions[0].experience = Some(experience::Experience {
            levels: [(experience::Domain::Growing, 1)].into_iter().collect(),
            ..Default::default()
        });
        definitions[5].experience = Some(experience::Experience {
            levels: [(experience::Domain::Growing, 3)].into_iter().collect(),
            ..Default::default()
        });
        definitions[5].occupation = Some(occupations::Profession::WaterTechnician);
        definitions[5].outside_shifts = true;
        d.start
            .relationships
            .push(super::super::relationships::Bond {
                from: "friend-00".into(),
                to: "friend-05".into(),
                memories: 7,
            });
        let mut v = Village::default();
        let mut people = create(&d, &mut v);
        apply(&d, &mut people, &mut v);
        super::super::relationships::apply(&d, &mut v);
        assert_eq!(people[0].appearance, people[5].appearance);
        assert_eq!(v.skills.people[&0].experience[2], 12);
        assert_eq!(v.skills.people[&5].experience[2], 60);
        assert!(!v.economy.outside_jobs[&0]);
        assert!(v.economy.outside_jobs[&5]);
        assert_eq!(crate::relationships::strength(&v.progress, 0, 5), 7);
        assert_eq!(crate::relationships::strength(&v.progress, 5, 0), 7);
        v.scenario = Some(std::sync::Arc::new(Origin {
            schema: SCHEMA,
            batteries: BTreeMap::new(),
            definition: d.clone(),
            buildings: BTreeMap::new(),
            residents: bindings(&d),
        }));
        assert_eq!(occupations::resident_name(&v, 5), "Friend 5");
    }

    #[test]
    fn fresh_rosters_seed_independent_records_and_do_not_bind_identity_to_template() {
        for count in [1, 2, 5, 12] {
            let d = cast(count);
            let mut v = Village::default();
            let mut people = create(&d, &mut v);
            apply(&d, &mut people, &mut v);
            assert_eq!(people.len(), count);
            assert!(skills::matches_residents(&v, &people));
            assert!(workforce::matches_residents(&v, &people));
            assert!(occupations::matches_residents(&v.economy, &people));
            let bindings = bindings(&d);
            for p in d.start.residents.as_ref().unwrap() {
                let id = bindings[&p.id];
                let person = people.iter().find(|r| r.id == id).unwrap();
                assert_eq!(person.name, p.name);
                assert_eq!(
                    person.appearance.preset,
                    resident_appearance::FOUNDERS[p.slot().unwrap()]
                );
                assert_eq!(
                    v.economy.outside_professions[&id],
                    occupations::Profession::None
                );
            }
            let mut reversed = d.clone();
            reversed.start.residents.as_mut().unwrap().reverse();
            let mut other = Village::default();
            let mut reordered = create(&reversed, &mut other);
            apply(&reversed, &mut reordered, &mut other);
            assert_eq!(bindings, super::bindings(&reversed));
            assert_eq!(
                serde_json::to_value(&people).unwrap(),
                serde_json::to_value(reordered).unwrap()
            );
        }
    }
    #[test]
    fn fresh_one_two_and_twelve_person_ecs_worlds_advance_with_complete_owned_records() {
        for count in [1, 2, 12] {
            let d = cast(count);
            let mut v = Village {
                mode: modes::Mode::Sandbox,
                sandbox_rules: sandbox::Rules {
                    logistics: true,
                    land: true,
                    utilities: true,
                    supplied_energy: 0.,
                },
                ..Default::default()
            };
            let mut people = create(&d, &mut v);
            apply(&d, &mut people, &mut v);
            let mut g = initialization::create(v, people).unwrap();
            for _ in 0..1200 {
                g.tick(0.25);
            }
            let saved: Save = serde_json::from_str(&g.snapshot()).unwrap();
            assert_eq!(saved.residents.len(), count);
            assert!(
                saved.village.arrived,
                "The complete {count}-person group must actually reach camp"
            );
            assert!(
                simulation::view(&saved.village)["materials"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .all(|m| m["difference"] == 0.)
            );
            assert!(skills::matches_residents(&saved.village, &saved.residents));
            assert!(workforce::matches_residents(
                &saved.village,
                &saved.residents
            ));
            assert!(occupations::matches_residents(
                &saved.village.economy,
                &saved.residents
            ));
            assert!(
                saved
                    .village
                    .simulation
                    .days
                    .iter()
                    .all(|day| day.residents.len() == count)
            );
            assert!(saved.residents.iter().all(|r| {
                [r.x, r.y, r.target_x, r.target_y]
                    .iter()
                    .all(|p| p.is_finite() && (0.0..=MAP_SIZE as f32).contains(p))
            }));
            if count == 1 {
                // Comfort food can affect connection; solo actors cannot invent social tasks or milestones.
                assert!(saved.village.progress.social_people.is_empty());
                assert_ne!(saved.residents[0].task, "socialize");
            }
            let checkpoint = g.snapshot();
            let mut restored = Game::new();
            assert!(restored.restore(&checkpoint), "restore {count} residents");
            assert_eq!(restored.snapshot(), checkpoint);
            let raw: serde_json::Value = serde_json::from_str(&checkpoint).unwrap();
            for invalid in ["empty", "duplicate", "missing_record", "orphan_record"] {
                let mut broken = raw.clone();
                match invalid {
                    "empty" => broken["residents"] = serde_json::json!([]),
                    "duplicate" => {
                        let duplicate = broken["residents"][0].clone();
                        broken["residents"].as_array_mut().unwrap().push(duplicate);
                    }
                    "missing_record" => {
                        broken["village"]["skills"]["people"]
                            .as_object_mut()
                            .unwrap()
                            .remove("0");
                    }
                    _ => {
                        let record = broken["village"]["skills"]["people"]["0"].clone();
                        broken["village"]["skills"]["people"]["900"] = record;
                    }
                }
                assert!(!restored.restore(&broken.to_string()), "{count}: {invalid}");
                assert_eq!(restored.snapshot(), checkpoint, "atomic {invalid}");
            }
            for _ in 0..20 {
                g.tick(0.25);
                restored.tick(0.25);
            }
            assert_eq!(restored.snapshot(), g.snapshot());
        }
    }
    #[test]
    fn overnight_bed_feedback_uses_the_actual_authored_cast_and_completed_homes() {
        for (population, homes, warning) in [
            (1, 0, true),
            (1, 1, false),
            (3, 1, false),
            (4, 1, true),
            (5, 2, false),
            (12, 2, true),
            (12, 4, false),
        ] {
            let mut d = cast(population);
            for i in 0..homes {
                let mut b = d.start.buildings[0].clone();
                b.id = format!("home-{i}");
                b.kind = "home".into();
                b.x = 23 + i * 4;
                b.y = 25;
                d.start.buildings.push(b);
            }
            let (_, report) =
                compile(d).unwrap_or_else(|r| panic!("{}", serde_json::to_string(&r).unwrap()));
            assert_eq!(
                report.issues.iter().any(|i| i.code == "overnight_beds"),
                warning,
                "{population} residents, {homes} homes"
            );
        }
    }
}
