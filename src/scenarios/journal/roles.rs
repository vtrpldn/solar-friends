//! Story roles resolve once from immutable founding identities and capabilities.
use super::*;
pub const MAX_ROLES: usize = 16;
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Role {
    pub id: String,
    pub title: String,
    pub binding: Binding,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Binding {
    Resident {
        resident: String,
    },
    Capability {
        skill: experience::Domain,
        minimum_level: u8,
    },
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Speaker {
    Resident { resident: String },
    Role { role: String },
}
fn resolve(d: &Definition, binding: &Binding) -> Option<String> {
    match binding {
        Binding::Resident { resident } => residents::identities(d)
            .contains_key(resident)
            .then(|| resident.clone()),
        Binding::Capability {
            skill,
            minimum_level,
        } => {
            if !d.rules.learning || !(1..=5).contains(minimum_level) {
                return None;
            }
            let fallback;
            let people = if let Some(people) = &d.start.residents {
                people
            } else {
                fallback = residents::founders();
                &fallback
            };
            let mut candidates: Vec<_> = people
                .iter()
                .filter_map(|p| {
                    let level = p
                        .experience
                        .as_ref()
                        .and_then(|e| e.levels.get(skill))
                        .copied()
                        .unwrap_or(0);
                    (level >= *minimum_level).then_some((level, p.id.as_str()))
                })
                .collect();
            candidates.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(b.1)));
            candidates.first().map(|(_, id)| (*id).to_owned())
        }
    }
}
pub fn check(d: &Definition, report: &mut Report) {
    let Some(journal) = &d.journal else {
        return;
    };
    if journal.roles.len() > MAX_ROLES {
        report.push(
            "journal.roles",
            "role_limit",
            "Use at most sixteen story roles.",
        );
    }
    let mut ids = HashSet::new();
    for (index, role) in journal.roles.iter().enumerate() {
        if !valid_key(&role.id)
            || !ids.insert(&role.id)
            || (role.title.trim().is_empty() || role.title.chars().count() > 100)
        {
            report.push(
                &format!("journal.roles.{index}"),
                "invalid_story_role",
                "Give each story role a unique identity and a title of 1–100 characters.",
            );
        }
        if resolve(d, &role.binding).is_none() {
            report.push(&format!("journal.roles.{index}"), "missing_required_role", format!("Assign an existing friend to ‘{}’, or enable resident learning and provide a founding friend with the selected starting skill level. Roles do not wait for future learning.",role.title));
        }
    }
    for (index, event) in journal.events.iter().enumerate() {
        let valid = match &event.speaker {
            None => true,
            Some(Speaker::Resident { resident }) => residents::identities(d).contains_key(resident),
            Some(Speaker::Role { role }) => journal
                .roles
                .iter()
                .any(|r| r.id == *role && resolve(d, &r.binding).is_some()),
        };
        if !valid
            || event.speaker.is_some()
                && !matches!(event.effect, events::EventEffect::Message { .. })
        {
            report.push(&format!("journal.events.{index}.speaker"), "invalid_message_speaker", "Choose an existing friend or resolved story role for a message. Other effects cannot have a dialogue speaker.");
        }
    }
}
fn reference(v: &Village, source: String, role: Option<&str>) -> serde_json::Value {
    let Some(origin) = &v.scenario else {
        return serde_json::Value::Null;
    };
    let id = residents::identities(&origin.definition)
        .get(&source)
        .copied();
    serde_json::json!({"source_resident":source,"resident":id,"role":role})
}
pub fn speaker(v: &Village, speaker: Option<&Speaker>) -> serde_json::Value {
    let Some(speaker) = speaker else {
        return serde_json::Value::Null;
    };
    match speaker {
        Speaker::Resident { resident } => reference(v, resident.clone(), None),
        Speaker::Role { role } => {
            let source = v.scenario.as_ref().and_then(|o| {
                o.definition.journal.as_ref().and_then(|j| {
                    j.roles
                        .iter()
                        .find(|r| r.id == *role)
                        .and_then(|r| resolve(&o.definition, &r.binding))
                })
            });
            source.map_or(serde_json::Value::Null, |source| {
                reference(v, source, Some(role))
            })
        }
    }
}
pub fn view(v: &Village) -> serde_json::Value {
    let Some(origin) = &v.scenario else {
        return serde_json::json!([]);
    };
    serde_json::json!(origin.definition.journal.as_ref().map(|j| j.roles.iter().map(|r| serde_json::json!({"id":r.id,"title":r.title,"binding":r.binding,"resolved":resolve(&origin.definition,&r.binding).map(|source| reference(v,source,Some(&r.id)))})).collect::<Vec<_>>()).unwrap_or_default())
}
pub fn catalog() -> serde_json::Value {
    serde_json::json!({"maximum":MAX_ROLES,"maximum_title":100,"minimum_level":1,"maximum_level":5,"skills":experience::catalog()["skills"],"note":"Required roles bind to founding identities. Capability bindings choose the highest declared starting level, then stable resident identity to break ties. They require resident learning and do not reassign as friends learn, rest, commute or change appearance. A friend may hold several roles."})
}
#[cfg(test)]
mod tests;
