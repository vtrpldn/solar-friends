//! Embedded inherited structure materials are separate from purchased inputs.
use super::*;
#[derive(Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Policy {
    #[default]
    None,
    Recipe,
}
impl Policy {
    pub fn is_none(&self) -> bool {
        *self == Self::None
    }
}
/// Construction fabric and fittings only. Battery modules have their own owned
/// asset lifecycle; pumps, consumed tools, food and living inputs are not fabric.
fn structural(material: usize) -> bool {
    material <= 12
}
fn materials(kind: &str, recipe: &str) -> economy::Bundle {
    let mut total = [0; economy::COUNT];
    if let Some(stages) = economy::recipe(kind, recipe) {
        for s in stages {
            for (i, n) in s.items.into_iter().enumerate() {
                if structural(i) {
                    total[i] += n;
                }
            }
        }
    }
    total
}
pub fn owned(v: &Village, id: usize) -> economy::Bundle {
    let Some(o) = &v.scenario else {
        return [0; economy::COUNT];
    };
    let Some(source) = o.definition.start.buildings.iter().find(|b| {
        b.material_recovery == Policy::Recipe
            && b.state == BuildingState::Completed
            && o.buildings.get(&b.id) == Some(&id)
    }) else {
        return [0; economy::COUNT];
    };
    if !v.buildings.iter().any(|b| {
        b.id == id
            && b.kind == source.kind
            && (b.progress >= 100. || building_work::original_progress(v, id) == Some(100.))
    }) {
        return [0; economy::COUNT];
    }
    materials(&source.kind, &source.recipe)
}
pub fn check(d: &Definition, r: &mut Report) {
    for (i, b) in d.start.buildings.iter().enumerate().take(MAX_BUILDINGS + 1) {
        if b.material_recovery == Policy::Recipe && b.state != BuildingState::Completed {
            r.push(&format!("start.buildings.{i}.material_recovery"),"invalid_inherited_recovery","Inherited structural materials require a completed building. Clear this policy before using a construction project; future construction uses its actual delivered materials.");
            let issue = r.issues.last_mut().unwrap();
            issue.entity = Some(b.id.clone());
            issue.at = Some([b.x, b.y]);
        }
    }
}
pub fn catalog(kind: &str) -> serde_json::Value {
    let entries: BTreeMap<_, _> = ["standard", "local", "adobe"]
        .into_iter()
        .filter(|r| economy::recipe(kind, r).is_some())
        .map(|r| {
            let returns: BTreeMap<_, _> = materials(kind, r)
                .into_iter()
                .enumerate()
                .filter(|(_, n)| *n >= 2)
                .map(|(i, n)| (economy::NAMES[i], n / 2))
                .collect();
            (r, returns)
        })
        .collect();
    serde_json::json!(entries)
}
#[cfg(test)]
mod tests;
