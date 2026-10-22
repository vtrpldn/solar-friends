use super::*;
fn package() -> serde_json::Value {
    let d = Definition::builtin(modes::Mode::Sandbox);
    let (g, _) = compile(d.clone()).unwrap_or_else(|_| panic!("builtin compiles"));
    let mut d = serde_json::to_value(d).unwrap();
    d["map"]["terrain"] = serde_json::from_str(&g.terrain_template()).unwrap();
    d["map"]["biome"] = serde_json::json!({"id":"mata-atlantica","version":1});
    d["rules"]["weather"] = serde_json::to_value(climate::Profile::default()).unwrap();
    serde_json::json!({"format":FORMAT,"schema":1,"id":"release-one","content_revision":1,"title":d["title"],"description":d["description"],"author":"Nossa comunidade","compatibility":{"game":1,"ruleset":1,"assets":1},"credits":[],"definition":d})
}
#[test]
fn frozen_package_and_embedded_definition_compile_to_identical_worlds() {
    let p = package();
    let mut a = Game::new();
    let mut b = Game::new();
    let raw = serde_json::to_string(&p).unwrap();
    let before = a.snapshot();
    let checked: serde_json::Value = serde_json::from_str(&a.validate_scenario(&raw)).unwrap();
    assert_eq!(checked["ok"], true, "{checked}");
    assert_eq!(a.snapshot(), before);
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&a.load_scenario(&raw)).unwrap()["ok"],
        true
    );
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&b.load_scenario(&p["definition"].to_string()))
            .unwrap()["ok"],
        true
    );
    assert_eq!(a.snapshot(), b.snapshot());
    for _ in 0..20 {
        a.tick(0.25);
        b.tick(0.25);
    }
    assert_eq!(a.snapshot(), b.snapshot());
    let saved = a.snapshot();
    assert!(b.restore(&saved));
    assert_eq!(b.snapshot(), saved);
}
#[test]
fn unsupported_incomplete_and_inconsistent_packages_are_rejected_atomically() {
    let source = package();
    let mut g = Game::new();
    let before = g.snapshot();
    for variant in 0..11 {
        let mut p = source.clone();
        match variant {
            0 => p["compatibility"]["game"] = 2.into(),
            1 => p["compatibility"]["ruleset"] = 2.into(),
            2 => p["compatibility"]["assets"] = 2.into(),
            3 => p["schema"] = 2.into(),
            4 => p["author"] = "".into(),
            5 => p["content_revision"] = 2.into(),
            6 => p["title"] = "Different title".into(),
            7 => p["definition"]["map"]["terrain"] = serde_json::Value::Null,
            8 => p["definition"]["start"]["residents"] = serde_json::Value::Null,
            9 => {
                p["definition"]["map"]["nature"] = serde_json::json!([{"id":"remote","species":"https://example.com/evil.png","x":1,"y":1,"size":1}])
            }
            _ => p["script"] = "alert(1)".into(),
        };
        let result: serde_json::Value =
            serde_json::from_str(&g.load_scenario(&p.to_string())).unwrap();
        assert_eq!(result["ok"], false, "variant {variant}");
        assert_eq!(g.snapshot(), before);
    }
}
#[test]
fn source_credits_are_plain_bounded_data() {
    let mut p = package();
    p["credits"] =
        serde_json::json!([{"release":"source-one","revision":2,"author":"João <vizinho>"}]);
    assert!(parse(&p.to_string()).is_ok());
    p["credits"][0]["author"] = "x".repeat(81).into();
    assert!(parse(&p.to_string()).is_err());
    p = package();
    p["credits"]=serde_json::json!((0..17).map(|i|serde_json::json!({"release":format!("source-{i}"),"revision":1,"author":"Friend"})).collect::<Vec<_>>());
    assert!(parse(&p.to_string()).is_err());
}
