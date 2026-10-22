use super::*;
fn package(biome: &str) -> serde_json::Value {
    let map = biomes::generate(biome, 27).unwrap();
    serde_json::json!({"format":FORMAT,"schema":1,"id":"shared-land","content_revision":map.revision,"title":"Our land","description":"A property without a settlement","author":"João","compatibility":{"game":1,"ruleset":1,"assets":1},"credits":[],"map":map,"weather":biomes::get(biome).unwrap().weather})
}
#[test]
fn each_biome_validates_without_a_scenario_or_changing_a_live_village() {
    let mut game = Game::new();
    let before = game.snapshot();
    for biome in biomes::presets() {
        let file = package(biome.id);
        let raw = file.to_string();
        assert!(validate(&raw).ok, "{}", biome.id);
        let report: serde_json::Value =
            serde_json::from_str(&game.validate_map_package(&raw)).unwrap();
        assert_eq!(report["ok"], true);
        assert_eq!(game.snapshot(), before);
        let report: serde_json::Value = serde_json::from_str(&game.load_scenario(&raw)).unwrap();
        assert_eq!(report["ok"], false);
        assert_eq!(game.snapshot(), before);
        let parsed: Package = serde_json::from_str(&raw).unwrap();
        let roundtrip = serde_json::to_string(&parsed).unwrap();
        assert!(validate(&roundtrip).ok);
        let reread: Package = serde_json::from_str(&roundtrip).unwrap();
        assert!(
            serde_json::to_string(&parsed.map).unwrap()
                == serde_json::to_string(&reread.map).unwrap(),
            "Resolved map changed during typed round trip"
        );
    }
}
#[test]
fn map_and_scenario_validation_share_physical_constraints() {
    let source = package("cerrado");
    let cases = vec![
        ("width", serde_json::json!(32)),
        ("id", serde_json::json!("bad key")),
        ("camp", serde_json::json!([0, 0])),
        ("camera", serde_json::json!([70, 0])),
        (
            "regions",
            serde_json::json!([{"id":"region","title":"Outside","x":63,"y":63,"width":2,"height":2}]),
        ),
        ("terrain", serde_json::json!([])),
        (
            "nature",
            serde_json::json!([{"id":"plant","species":"unavailable","x":20,"y":20,"size":1}]),
        ),
        (
            "deposits",
            serde_json::json!([{"id":"patch","material":"gold","x":20,"y":20,"width":2,"height":2,"quantity":20}]),
        ),
        ("river", serde_json::json!({"version":999})),
    ];
    for (key, value) in cases {
        let mut bad = source.clone();
        bad["map"][key] = value;
        assert!(!validate(&bad.to_string()).ok, "{key}");
        // Typed maps take exactly the same land checker in both entry points.
        if let Ok(map) = serde_json::from_value::<Map>(bad["map"].clone()) {
            let mut d = Definition::builtin(modes::Mode::Sandbox);
            d.map = map;
            assert!(compile::check(&d).has_errors(), "{key}");
        }
    }
}
#[test]
fn packages_reject_unresolved_incompatible_malformed_and_settlement_content() {
    let source = package("caatinga");
    let mut implicit = source.clone();
    implicit["map"].as_object_mut().unwrap().remove("river");
    assert!(!validate(&implicit.to_string()).ok);
    let mut river_free = source.clone();
    river_free["map"]["river"] = serde_json::Value::Null;
    assert!(validate(&river_free.to_string()).ok);
    for key in ["terrain", "nature", "deposits", "biome"] {
        let mut bad = source.clone();
        bad["map"][key] = serde_json::Value::Null;
        assert!(!validate(&bad.to_string()).ok, "{key}");
    }
    for key in ["game", "ruleset", "assets"] {
        let mut bad = source.clone();
        bad["compatibility"][key] = 999.into();
        assert!(!validate(&bad.to_string()).ok, "{key}");
    }
    for key in [
        "start",
        "residents",
        "buildings",
        "journal",
        "runtime",
        "script",
    ] {
        let mut bad = source.clone();
        bad[key] = serde_json::json!({});
        assert!(!validate(&bad.to_string()).ok, "{key}");
    }
    for (key, value) in [
        ("author", serde_json::json!("")),
        ("content_revision", serde_json::json!(99)),
        ("title", serde_json::json!("x".repeat(101))),
        (
            "credits",
            serde_json::json!([{"release":"invalid key","revision":1,"author":"A"}]),
        ),
    ] {
        let mut bad = source.clone();
        bad[key] = value;
        assert!(!validate(&bad.to_string()).ok, "{key}");
    }
    let mut bad = source;
    bad["weather"]["season_days"] = 0.into();
    assert!(!validate(&bad.to_string()).ok);
    assert!(!validate("{").ok);
    assert!(!validate(&" ".repeat(MAX_BYTES + 1)).ok);
}
