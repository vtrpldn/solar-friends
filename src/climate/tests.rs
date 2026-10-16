use super::*;

#[test]
fn arrival_weather_stays_viable_and_sandbox_seasons_are_optional() {
    let mut g = Game::new();
    let v = g.app.world().resource::<Village>();
    assert!(v.climate.enabled);
    for minute in (0..14 * 1440).step_by(15) {
        let w = at(v, minute as f32);
        assert_eq!(w.raining, ecology::raining(minute as f32));
        assert_eq!(w.solar_factor, 1.);
        assert_eq!(w.evaporation, 1.);
        assert_eq!(day(v, minute / 1440).rain_expected, minute / 1440 % 3 != 2);
    }
    let before = g.snapshot();
    assert!(!g.set_seasons_enabled(false));
    assert_eq!(g.snapshot(), before);
    assert!(g.start_mode("sandbox"));
    assert!(g.configure_sandbox_rules(false, true, true));
    assert!(!g.app.world().resource::<Village>().climate.enabled);
    assert!(g.set_seasons_enabled(true));
    assert!(g.app.world().resource::<Village>().climate.enabled);
    assert!(
        at(g.app.world().resource::<Village>(), 480.).evaporation < 1.,
        "Sandbox seasons take effect immediately"
    );
}

#[test]
fn seeded_forecasts_survive_reload_without_drawing_random_events() {
    let mut g = Game::new();
    g.app.world_mut().resource_mut::<Village>().minutes = 30. * 1440. + 800.;
    g.tick(0.25); // Settle elapsed food dates and resident routines in this future fixture.
    let before = g.snapshot();
    let report = g.weather_report();
    let parsed: serde_json::Value = serde_json::from_str(&report).unwrap();
    assert_eq!(parsed["forecast"].as_array().unwrap().len(), 7);
    for _ in 0..20 {
        assert_eq!(g.weather_report(), report);
    }
    assert_eq!(g.snapshot(), before);
    let mut copy = Game::new();
    assert!(copy.restore(&before));
    assert_eq!(copy.snapshot(), before);
    assert_eq!(copy.weather_report(), report);
    let mut different = copy.app.world().resource::<Village>().clone();
    different.simulation.seed = different.simulation.seed.wrapping_add(1);
    assert_ne!(view(&different).to_string(), report);
    let original = g.app.world().resource::<Village>();
    for day in 14..126 {
        for minute in [0., 720., 840., 960., 1200.] {
            assert_eq!(
                serde_json::to_string(&at(original, day as f32 * 1440. + minute)).unwrap(),
                serde_json::to_string(&at(
                    copy.app.world().resource::<Village>(),
                    day as f32 * 1440. + minute
                ))
                .unwrap()
            );
        }
    }
}

#[test]
fn dry_periods_reduce_river_supply_and_dry_soil_faster() {
    let mut g = Game::new();
    assert!(g.start_mode("sandbox"));
    assert!(g.configure_sandbox_rules(false, true, true));
    assert_eq!(g.place("hydro", 26, 5), "ok");
    assert_eq!(g.place("garden", 5, 5), "ok");
    assert!(g.set_seasons_enabled(true));
    let mut wet = g.app.world().resource::<Village>().clone();
    wet.minutes = 14. * 1440. + 480.; // Before the earliest rain window in either period.
    let mut dry = wet.clone();
    dry.minutes = 21. * 1440. + 480.;
    assert!(power::supply(&dry).hydro_generation < power::supply(&wet).hydro_generation);
    for v in [&mut wet, &mut dry] {
        land::water_plot(v, 2, 5, 5, 1.);
        land::plot_water(
            v,
            2,
            5,
            5,
            120.,
            land::RootZone {
                capacity: 240.,
                drying: 1.,
                covered: false,
            },
        );
    }
    assert!(land::condition(&dry, 2, 5, 5).moisture < land::condition(&wet, 2, 5, 5).moisture);
}

#[test]
fn forecast_rain_fills_only_cisterns_wets_open_soil_and_reduces_sunshine() {
    let mut g = Game::new();
    assert!(g.start_mode("sandbox"));
    assert!(g.configure_sandbox_rules(false, true, true));
    assert_eq!(g.place("well", 9, 5), "ok");
    assert_eq!(g.place("solar_farm", 13, 5), "ok");
    assert!(g.set_seasons_enabled(true));
    let mut v = g.app.world_mut().resource_mut::<Village>();
    let rainy = (14..21)
        .map(|d| day(&v, d))
        .find(|d| d.rain_expected)
        .unwrap();
    v.minutes = rainy.day as f32 * 1440. + rainy.rain_start + 30.;
    let weather = at(&v, v.minutes);
    assert!(weather.raining && weather.solar_factor < 1.);
    let tank = water::Owner::Building(0);
    water::fixture_at(&mut v, tank, water::Class::Fresh, 0.);
    let camp = water::local(&v, water::Owner::Camp, water::Class::Fresh);
    water::rain(&mut v, 10.);
    assert!(
        (water::local(&v, tank, water::Class::Fresh) - f64::from(weather.rain) * 3.).abs()
            < 0.00001
    );
    assert_eq!(
        water::local(&v, water::Owner::Camp, water::Class::Fresh),
        camp
    );
    land::water_plot(&mut v, 2, 5, 5, 0.);
    let profile = land::RootZone {
        capacity: 240.,
        drying: 1.,
        covered: false,
    };
    land::plot_water(&mut v, 2, 5, 5, 10., profile);
    assert!(land::condition(&v, 2, 5, 5).moisture > 0.);
    land::water_plot(&mut v, 2, 5, 5, 0.);
    land::plot_water(
        &mut v,
        2,
        5,
        5,
        10.,
        land::RootZone {
            covered: true,
            ..profile
        },
    );
    assert_eq!(land::condition(&v, 2, 5, 5).moisture, 0.);
    let cloudy = power::supply(&v).solar_generation;
    v.climate.enabled = false;
    assert!(power::supply(&v).solar_generation > cloudy);
}
