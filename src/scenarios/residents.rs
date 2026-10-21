//! Authored identities are stable even when the cast is reordered or renamed.
use super::*;
pub const PRESETS: [&str; 5] = ["iara", "bento", "luz", "caua", "nina"];
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
    let mut presets = HashSet::new();
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
        if p.slot().is_none() {
            r.push(&format!("start.residents.{i}.preset"),"unsupported_resident_preset","This resident preset or its artwork version is unavailable. Keep the original creation.");
        }
        presets.insert(&p.preset);
    }
    // This release slice keeps the existing cast playable while other per-person
    // stores, appearances and population-dependent systems are generalized.
    if people.len() != 5 || presets.len() != 5 {
        r.push("start.residents","unsupported_cast","The current playable cast requires one of each founding preset. Other cast sizes can remain drafts while roster support is completed.");
    }
}
pub fn bindings(d: &Definition) -> BTreeMap<String, usize> {
    d.start
        .residents
        .as_ref()
        .map(|people| {
            people
                .iter()
                .filter_map(|p| p.slot().map(|id| (p.id.clone(), id)))
                .collect()
        })
        .unwrap_or_default()
}
pub fn apply(d: &Definition, people: &mut [Resident], v: &mut Village) {
    if let Some(definitions) = &d.start.residents {
        for definition in definitions {
            if let Some(person) = definition
                .slot()
                .and_then(|slot| people.iter_mut().find(|r| r.id == slot))
            {
                v.economy
                    .outside_professions
                    .insert(person.id, definition.profession());
                v.economy
                    .outside_jobs
                    .insert(person.id, definition.outside_shifts);
                person.name = definition.name.clone();
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
