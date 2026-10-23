//! Bundled part keys are data, never file paths or resident identities.
use crate::*;
macro_rules! part_keys {
    ($name:ident {$($variant:ident => $key:literal),+ $(,)?}) => {
        #[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
        pub enum $name { $(#[serde(rename = $key)] $variant),+ }
        impl $name { pub const KEYS: &'static [&'static str] = &[$($key),+]; }
    };
}
part_keys!(PartAssets { V1 => "resident-parts-v1" });
part_keys!(BodyPart { Neutral => "neutral-v1" });
part_keys!(HairPart { Curls => "short-curls-v1", SidePart => "side-part-v1" });
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HairColour {
    #[default]
    Chestnut,
    Espresso,
    Black,
    Silver,
}
impl HairColour {
    pub const KEYS: &'static [&'static str] = &["chestnut", "espresso", "black", "silver"];
    pub fn is_chestnut(&self) -> bool {
        *self == Self::Chestnut
    }
}
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum HatPart {
    #[default]
    #[serde(rename = "none")]
    None,
    #[serde(rename = "straw-v1")]
    Straw,
}
impl HatPart {
    pub const KEYS: &'static [&'static str] = &["none", "straw-v1"];
    pub fn is_none(&self) -> bool {
        *self == Self::None
    }
}
part_keys!(SkinPalette { Warm => "warm", Sunlit => "sunlit", Copper => "copper" });
part_keys!(TopPalette { Cream => "cream", Teal => "teal", Terracotta => "terracotta", Indigo => "indigo" });
part_keys!(BottomPalette { Cream => "cream", Sage => "sage", Umber => "umber" });
part_keys!(ShoePalette { Brown => "brown", Graphite => "graphite" });
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PartMaterials {
    pub skin: SkinPalette,
    pub shirt: TopPalette,
    pub shorts: BottomPalette,
    pub shoes: ShoePalette,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PartsLook {
    pub schema: u32,
    #[serde(rename = "assetVersion")]
    pub asset_version: PartAssets,
    pub body: BodyPart,
    pub hair: HairPart,
    #[serde(
        default,
        rename = "hairColour",
        skip_serializing_if = "HairColour::is_chestnut"
    )]
    pub hair_colour: HairColour,
    #[serde(default, skip_serializing_if = "HatPart::is_none")]
    pub hat: HatPart,
    pub materials: PartMaterials,
}
impl PartsLook {
    pub fn valid(self) -> bool {
        self.schema == 2
    }
}
pub fn parts_catalog() -> serde_json::Value {
    serde_json::json!({"schema":2,"assetVersion":PartAssets::KEYS[0],"bodies":BodyPart::KEYS,"hairstyles":HairPart::KEYS,"hair_colours":HairColour::KEYS,"hats":HatPart::KEYS,"materials":{"skin":SkinPalette::KEYS,"shirt":TopPalette::KEYS,"shorts":BottomPalette::KEYS,"shoes":ShoePalette::KEYS}})
}

#[cfg(test)]
mod tests {
    use super::*;
    fn recipe(hair: &str) -> serde_json::Value {
        serde_json::json!({"schema":2,"assetVersion":"resident-parts-v1","body":"neutral-v1","hair":hair,"materials":{"skin":"copper","shirt":"teal","shorts":"sage","shoes":"graphite"}})
    }
    #[test]
    fn all_bundled_combinations_round_trip_and_unknown_parts_fail() {
        let mut count = 0;
        for (colour, hat) in HairColour::KEYS
            .iter()
            .flat_map(|colour| HatPart::KEYS.iter().map(move |hat| (colour, hat)))
        {
            for hair in HairPart::KEYS {
                for skin in SkinPalette::KEYS {
                    for shirt in TopPalette::KEYS {
                        for shorts in BottomPalette::KEYS {
                            for shoes in ShoePalette::KEYS {
                                let mut value = recipe(hair);
                                if *hat != "none" {
                                    value["hat"] = (*hat).into();
                                }
                                if *colour != "chestnut" {
                                    value["hairColour"] = (*colour).into();
                                }
                                value["materials"] = serde_json::json!({"skin":skin,"shirt":shirt,"shorts":shorts,"shoes":shoes});
                                let look: super::super::Look =
                                    serde_json::from_value(value.clone()).unwrap();
                                assert!(look.valid());
                                assert_eq!(serde_json::to_value(look).unwrap(), value);
                                count += 1;
                            }
                        }
                    }
                }
            }
        }
        assert_eq!(count, 1152);
        let mut bad = recipe("side-part-v1");
        bad["preset"] = "nina".into();
        assert!(serde_json::from_value::<super::super::Look>(bad).is_err());
        for (field, value) in [
            ("assetVersion", serde_json::json!("future")),
            ("body", serde_json::json!("stretched")),
            ("hair", serde_json::json!("unknown")),
            ("hairColour", serde_json::json!("neon")),
            ("hat", serde_json::json!("straw")),
        ] {
            let mut bad = recipe("side-part-v1");
            bad[field] = value;
            assert!(serde_json::from_value::<super::super::Look>(bad).is_err());
        }
        let mut bad = recipe("side-part-v1");
        bad["materials"]["skin"] = "reference".into();
        assert!(serde_json::from_value::<super::super::Look>(bad).is_err());
    }
    #[test]
    fn part_edits_are_cosmetic_and_rejections_are_atomic() {
        let mut g = Game::new();
        let before: serde_json::Value = serde_json::from_str(&g.snapshot()).unwrap();
        assert!(g.change_resident_appearance(0, "Iara", &recipe("side-part-v1").to_string()));
        let mut after: serde_json::Value = serde_json::from_str(&g.snapshot()).unwrap();
        assert_eq!(after["village"], before["village"]);
        assert_eq!(after["residents"][0]["appearance"], recipe("side-part-v1"));
        after["residents"][0]["appearance"] = before["residents"][0]["appearance"].clone();
        assert_eq!(after["residents"], before["residents"]);
        let saved = g.snapshot();
        assert!(g.restore(&saved));
        assert_eq!(g.snapshot(), saved);
        for (id, name, raw) in [
            (99, "Iara", recipe("side-part-v1").to_string()),
            (0, " ", recipe("side-part-v1").to_string()),
            (0, "Iara", recipe("unknown").to_string()),
            (0, "Iara", "{}".into()),
        ] {
            assert!(!g.change_resident_appearance(id, name, &raw));
            assert_eq!(g.snapshot(), saved);
        }
        let mut bad = recipe("side-part-v1");
        bad["schema"] = 3.into();
        assert!(!g.change_resident_appearance(0, "Iara", &bad.to_string()));
        assert_eq!(g.snapshot(), saved);
    }
    #[test]
    fn custom_cast_parts_survive_exact_continuation_without_changing_identity() {
        let mut g = Game::new();
        let mut d: serde_json::Value =
            serde_json::from_str(&g.scenario_template("sandbox")).unwrap();
        let people = d["start"]["residents"].as_array_mut().unwrap();
        people.truncate(2);
        people[0]["appearance"] = recipe("side-part-v1");
        people[1]["appearance"] = recipe("short-curls-v1");
        people[0]["appearance"]["hat"] = "straw-v1".into();
        people[0]["appearance"]["hairColour"] = "black".into();
        people[1]["appearance"]["hairColour"] = "silver".into();
        people.reverse();
        let report: serde_json::Value =
            serde_json::from_str(&g.load_scenario(&d.to_string())).unwrap();
        assert_eq!(report["ok"], true);
        let start: serde_json::Value = serde_json::from_str(&g.snapshot()).unwrap();
        for person in &d["start"]["residents"].as_array().unwrap()[..] {
            let id = start["village"]["scenario"]["residents"][person["id"].as_str().unwrap()]
                .as_u64()
                .unwrap();
            let actual = start["residents"]
                .as_array()
                .unwrap()
                .iter()
                .find(|p| p["id"] == id)
                .unwrap();
            assert_eq!(actual["name"], person["name"]);
            assert_eq!(actual["appearance"], person["appearance"]);
        }
        let raw = g.snapshot();
        let mut b = Game::new();
        assert!(b.restore(&raw));
        for _ in 0..100 {
            g.tick(0.25);
            b.tick(0.25);
        }
        assert_eq!(g.snapshot(), b.snapshot());
    }
}
