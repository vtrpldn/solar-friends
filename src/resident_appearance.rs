//! Versioned looks are cosmetic data, independent of a resident's identity.
use crate::*;
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Preset {
    Iara,
    Bento,
    Luz,
    Caua,
    Nina,
}
pub const FOUNDERS: [Preset; 5] = [
    Preset::Iara,
    Preset::Bento,
    Preset::Luz,
    Preset::Caua,
    Preset::Nina,
];
impl Preset {
    pub fn from_key(key: &str) -> Option<Self> {
        match key {
            "iara" => Some(Self::Iara),
            "bento" => Some(Self::Bento),
            "luz" => Some(Self::Luz),
            "caua" => Some(Self::Caua),
            "nina" => Some(Self::Nina),
            _ => None,
        }
    }
    pub fn key(self) -> &'static str {
        match self {
            Self::Iara => "iara",
            Self::Bento => "bento",
            Self::Luz => "luz",
            Self::Caua => "caua",
            Self::Nina => "nina",
        }
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Look {
    pub preset: Preset,
    pub version: u32,
}
impl Look {
    pub fn valid(self) -> bool {
        self.version == 1
    }
}
pub fn migrate(raw: &mut serde_json::Value) -> bool {
    let Some(people) = raw["residents"].as_array_mut() else {
        return false;
    };
    for p in people {
        if p.get("appearance").is_some() {
            continue;
        }
        let Some(preset) = p["id"]
            .as_u64()
            .and_then(|id| usize::try_from(id).ok())
            .and_then(|id| FOUNDERS.get(id))
            .copied()
        else {
            return false;
        };
        p["appearance"] = serde_json::to_value(Look { preset, version: 1 }).unwrap();
    }
    true
}
pub fn catalog() -> serde_json::Value {
    serde_json::json!(FOUNDERS.map(|preset|serde_json::json!({"key":preset,"version":1,"name":match preset{Preset::Iara=>"Iara's look",Preset::Bento=>"Bento's look",Preset::Luz=>"Luz's look",Preset::Caua=>"Cauã's look",Preset::Nina=>"Nina's look"}})))
}
#[wasm_bindgen]
impl Game {
    pub fn change_resident_identity(
        &mut self,
        id: usize,
        name: &str,
        preset: &str,
        version: u32,
    ) -> bool {
        let Some(preset) = Preset::from_key(preset) else {
            return false;
        };
        let appearance = Look { preset, version };
        if !appearance.valid() || name.trim().is_empty() || name.chars().count() > 80 {
            return false;
        }
        let mut query = self.app.world_mut().query::<&mut Resident>();
        let Some(mut person) = query.iter_mut(self.app.world_mut()).find(|p| p.id == id) else {
            return false;
        };
        person.name = name.into();
        person.appearance = appearance;
        let cached = person.clone();
        self.app
            .world_mut()
            .resource_mut::<Village>()
            .workforce_peers
            .insert(id, Some(cached));
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn live_cosmetic_edits_preserve_every_noncosmetic_saved_field() {
        let mut g = Game::new();
        let before: serde_json::Value = serde_json::from_str(&g.snapshot()).unwrap();
        assert!(g.change_resident_identity(0, "João <vizinho>", "nina", 1));
        let after: serde_json::Value = serde_json::from_str(&g.snapshot()).unwrap();
        assert_eq!(after["village"], before["village"]);
        let mut people = after["residents"].clone();
        people[0]["name"] = before["residents"][0]["name"].clone();
        people[0]["appearance"] = before["residents"][0]["appearance"].clone();
        assert_eq!(people, before["residents"]);
        assert_eq!(
            after["environment"]["economy"]["jobs"][0]["name"],
            "João <vizinho>"
        );
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_eq!(g.snapshot(), saved);
        for (id, name, key, version) in [
            (99, "Sam", "iara", 1),
            (0, " ", "iara", 1),
            (0, "Sam", "unknown", 1),
            (0, "Sam", "iara", 2),
        ] {
            assert!(!g.change_resident_identity(id, name, key, version));
            assert_eq!(g.snapshot(), saved);
        }
    }
    #[test]
    fn cosmetic_edits_preserve_an_actual_committed_commute() {
        let mut g = Game::new();
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.arrived = true;
            v.minutes = 540.;
            logistics::fixture_stock(&mut v, economy::FOOD, 80);
            logistics::fixture_stock(&mut v, economy::MEALS, 10);
            water::fixture_fresh(&mut v, 40.);
        }
        let mut q = g.app.world_mut().query::<&mut Resident>();
        for mut r in q.iter_mut(g.app.world_mut()) {
            r.task = "idle".into();
            r.remaining = 0.;
            r.energy = 90.;
            r.hunger = 10.;
            r.social = 90.;
            r.target_x = r.x;
            r.target_y = r.y;
        }
        assert!(g.set_resident_job(0, true));
        g.tick(0.25);
        let before: serde_json::Value = serde_json::from_str(&g.snapshot()).unwrap();
        assert_eq!(before["residents"][0]["trip"]["purpose"], "work");
        assert!(g.change_resident_identity(0, "Sam", "nina", 1));
        let mut after: serde_json::Value = serde_json::from_str(&g.snapshot()).unwrap();
        assert_eq!(after["village"], before["village"]);
        after["residents"][0]["name"] = before["residents"][0]["name"].clone();
        after["residents"][0]["appearance"] = before["residents"][0]["appearance"].clone();
        assert_eq!(after["residents"], before["residents"]);
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_eq!(g.snapshot(), saved);
    }
    #[test]
    fn future_story_events_use_the_live_name() {
        let mut g = Game::new();
        assert!(g.change_resident_identity(1, "Sam", "nina", 1));
        g.app
            .world_mut()
            .resource_mut::<Village>()
            .progress
            .completed[..3]
            .fill(true);
        assert_eq!(g.contribute_tool_library(), "ok");
        assert!(g.app.world().resource::<Village>().events[0].contains("Sam has a plan"));
    }
    #[test]
    fn original_looks_migrate_without_guessing_from_names_or_personality() {
        let mut g = Game::new();
        let before = g.snapshot();
        let mut old: serde_json::Value = serde_json::from_str(&before).unwrap();
        old["village"]["version"] = 39.into();
        for p in old["residents"].as_array_mut().unwrap() {
            p.as_object_mut().unwrap().remove("appearance");
        }
        assert!(g.restore(&old.to_string()));
        let after: serde_json::Value = serde_json::from_str(&g.snapshot()).unwrap();
        assert_eq!(
            after["residents"],
            serde_json::from_str::<serde_json::Value>(&before).unwrap()["residents"]
        );
        assert_eq!(after["village"]["skills"], old["village"]["skills"]);
        let saved = g.snapshot();
        for look in [
            serde_json::json!({"preset":"nina","version":2}),
            serde_json::json!({"preset":"unknown","version":1}),
            serde_json::Value::Null,
        ] {
            let mut bad = after.clone();
            bad["residents"][0]["appearance"] = look;
            assert!(!g.restore(&bad.to_string()));
            assert_eq!(g.snapshot(), saved);
        }
        let mut bad = after;
        bad["residents"][0]
            .as_object_mut()
            .unwrap()
            .remove("appearance");
        assert!(!g.restore(&bad.to_string()));
        assert_eq!(g.snapshot(), saved);
    }
}
