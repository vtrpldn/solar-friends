use super::*;

fn advance(g: &mut Game, seconds: f32) {
    for _ in 0..(seconds / 0.2) as usize {
        g.tick(0.2);
    }
}
fn setup() -> Game {
    let mut g = Game::new();
    advance(&mut g, 15.);
    let mut q = g.app.world_mut().query::<&mut Resident>();
    for mut r in q.iter_mut(g.app.world_mut()) {
        r.task = "idle".into();
        r.remaining = 90.;
        r.energy = 90.;
        r.hunger = 10.;
        r.x = r.target_x;
        r.y = r.target_y;
    }
    g
}
fn ready_building(g: &mut Game, kind: &str, x: i32, y: i32) {
    g.app.world_mut().resource_mut::<Village>().wood += 100.;
    assert_eq!(g.place(kind, x, y), "ok");
    g.app
        .world_mut()
        .resource_mut::<Village>()
        .buildings
        .last_mut()
        .unwrap()
        .progress = 100.;
}
fn finish_task(g: &mut Game, id: usize, task: &str) {
    let v = g.app.world().resource::<Village>().clone();
    let mut q = g.app.world_mut().query::<&mut Resident>();
    let mut r = q.iter_mut(g.app.world_mut()).find(|r| r.id == id).unwrap();
    assign(&mut r, &v, task, "test", true);
    r.x = r.target_x;
    r.y = r.target_y;
    r.remaining = 0.1;
    g.tick(0.2);
}
fn unlock(g: &mut Game) {
    g.app
        .world_mut()
        .resource_mut::<Village>()
        .progress
        .completed = [true; 4];
}

#[test]
fn locked_buildings_and_quests_cannot_be_used_early() {
    let mut g = setup();
    let before = g.snapshot();
    for kind in ["grove", "compost", "square", "workshop"] {
        assert!(g.place(kind, 5, 5).contains("quest"));
    }
    assert!(!g.track_quest(1));
    assert!(!g.track_quest(4));
    assert_ne!(g.contribute_workshop_timber(), "ok");
    assert_ne!(g.host_gathering(), "ok");
    assert_eq!(before, g.snapshot());
}
#[test]
fn introduction_opens_paths_and_remains_complete_after_resources_are_spent() {
    let mut g = setup();
    for (k, x, y) in [
        ("well", 6, 10),
        ("home", 8, 8),
        ("home", 12, 7),
        ("kitchen", 10, 10),
    ] {
        ready_building(&mut g, k, x, y);
    }
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        v.harvests = 1;
        v.meals_served = 1;
        v.mornings = 1;
        progression::update(&mut v);
        assert_eq!(v.progress.completed, [true, false, false, false]);
        v.food = 0.;
        v.water = 0.;
        v.meals = 0;
    }
    assert!(g.track_quest(1));
    assert_eq!(g.place("grove", 15, 10), "ok");
    let mut restored = Game::new();
    assert!(restored.restore(&g.snapshot()));
    assert!(
        restored
            .app
            .world()
            .resource::<Village>()
            .progress
            .completed[0]
    );
    assert_eq!(
        restored.app.world().resource::<Village>().progress.tracked,
        1
    );
}
#[test]
fn fruit_unlocks_compost_and_scraps_enrich_actual_harvests() {
    let mut g = setup();
    g.app
        .world_mut()
        .resource_mut::<Village>()
        .progress
        .completed[0] = true;
    ready_building(&mut g, "grove", 8, 8);
    for _ in 0..3 {
        finish_task(&mut g, 3, "gather");
    }
    assert!(g.app.world().resource::<Village>().progress.completed[1]);
    ready_building(&mut g, "compost", 12, 8);
    ready_building(&mut g, "kitchen", 6, 10);
    ready_building(&mut g, "garden", 14, 10);
    for _ in 0..2 {
        finish_task(&mut g, 2, "cook");
    }
    assert_eq!(g.app.world().resource::<Village>().progress.scraps, 2);
    finish_task(&mut g, 4, "compost");
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        let garden = v.buildings.iter_mut().find(|b| b.kind == "garden").unwrap();
        garden.crop = ecology::Crop {
            planted: true,
            growth: 180.,
            moisture: 0.,
        };
    }
    let food = g.app.world().resource::<Village>().food;
    finish_task(&mut g, 0, "garden");
    let v = g.app.world().resource::<Village>();
    assert_eq!(v.food, food + 11.);
    assert_eq!(v.progress.scraps, 0);
    assert_eq!(v.progress.compost, 0);
    assert_eq!(v.progress.enriched_harvests, 1);
}
#[test]
fn shared_construction_and_contribution_unlock_workshop_once() {
    let mut g = setup();
    g.app
        .world_mut()
        .resource_mut::<Village>()
        .progress
        .completed[0] = true;
    assert_eq!(g.place("home", 8, 8), "ok");
    let v = g.app.world().resource::<Village>().clone();
    let mut q = g.app.world_mut().query::<&mut Resident>();
    for mut r in q.iter_mut(g.app.world_mut()).filter(|r| r.id < 2) {
        assign(&mut r, &v, "build", "test", true);
        r.x = r.target_x;
        r.y = r.target_y;
    }
    advance(&mut g, 35.);
    assert_eq!(
        g.app.world().resource::<Village>().progress.shared_builds,
        1
    );
    for _ in 0..7 {
        finish_task(&mut g, 3, "gather");
    }
    let wood = g.app.world().resource::<Village>().wood;
    assert_eq!(g.contribute_workshop_timber(), "ok");
    assert!(g.app.world().resource::<Village>().progress.completed[3]);
    assert_eq!(g.app.world().resource::<Village>().wood, wood - 24.);
    let before = g.snapshot();
    assert_ne!(g.contribute_workshop_timber(), "ok");
    assert_eq!(g.snapshot(), before);
}
#[test]
fn tools_cost_timber_and_can_be_conserved() {
    let mut g = setup();
    unlock(&mut g);
    ready_building(&mut g, "workshop", 8, 8);
    let wood = g.app.world().resource::<Village>().wood;
    finish_task(&mut g, 1, "craft");
    assert_eq!(g.app.world().resource::<Village>().wood, wood - 8.);
    assert_eq!(g.app.world().resource::<Village>().progress.tool_uses, 12);
    finish_task(&mut g, 3, "gather");
    assert_eq!(g.app.world().resource::<Village>().wood, wood);
    assert_eq!(g.app.world().resource::<Village>().progress.tool_uses, 11);
    g.set_tools_enabled(false);
    finish_task(&mut g, 3, "gather");
    assert_eq!(g.app.world().resource::<Village>().wood, wood + 6.);
    assert_eq!(g.app.world().resource::<Village>().progress.tool_uses, 11);
}
#[test]
fn welcome_supper_requires_real_attendance_and_grows_mutual_friendships() {
    let mut g = setup();
    ready_building(&mut g, "kitchen", 10, 10);
    g.app
        .world_mut()
        .resource_mut::<Village>()
        .progress
        .completed[0] = true;
    g.app.world_mut().resource_mut::<Village>().meals = 10;
    for id in 0..5 {
        finish_task(&mut g, id, "socialize");
    }
    assert_eq!(g.host_gathering(), "ok");
    let before = g.snapshot();
    assert_ne!(g.host_gathering(), "ok");
    assert_eq!(g.snapshot(), before);
    assert_eq!(g.app.world().resource::<Village>().progress.gatherings, 0);
    advance(&mut g, 41.);
    let v = g.app.world().resource::<Village>();
    assert_eq!(v.progress.gatherings, 1);
    assert!(v.progress.welcome_supper);
    assert!(v.progress.completed[2]);
    assert_eq!(v.progress.friendships[1], 1);
    assert_eq!(v.progress.friendships[5], 1);
    assert_eq!(v.progress.friendships[0], 0);
}
#[test]
fn failed_gathering_preconditions_do_not_spend_meals() {
    let mut g = setup();
    unlock(&mut g);
    ready_building(&mut g, "square", 8, 8);
    let before = g.snapshot();
    assert_ne!(g.host_gathering(), "ok");
    assert_eq!(before, g.snapshot());
    g.app.world_mut().resource_mut::<Village>().meals = 5;
    g.app.world_mut().resource_mut::<Village>().minutes = 1300.;
    let before = g.snapshot();
    assert_ne!(g.host_gathering(), "ok");
    assert_eq!(before, g.snapshot());
    g.app.world_mut().resource_mut::<Village>().minutes = 600.;
    let mut q = g.app.world_mut().query::<&mut Resident>();
    for mut r in q.iter_mut(g.app.world_mut()) {
        r.energy = 10.;
    }
    let before = g.snapshot();
    assert_ne!(g.host_gathering(), "ok");
    assert_eq!(before, g.snapshot());
}
#[test]
fn old_saves_gain_defaults_and_invalid_progress_is_rejected_atomically() {
    let mut g = setup();
    ready_building(&mut g, "home", 8, 8);
    let mut old: serde_json::Value = serde_json::from_str(&g.snapshot()).unwrap();
    old["village"].as_object_mut().unwrap().remove("progress");
    old["village"]["buildings"][0]
        .as_object_mut()
        .unwrap()
        .remove("contributors");
    assert!(g.restore(&old.to_string()));
    assert_eq!(g.app.world().resource::<Village>().progress.tool_uses, 0);
    let before = g.snapshot();
    for (key, value) in [
        ("tracked", 4),
        ("social_mask", 32),
        ("tool_uses", 37),
        ("gathering_until", 999999),
    ] {
        let mut bad: serde_json::Value = serde_json::from_str(&before).unwrap();
        bad["village"]["progress"][key] = value.into();
        assert!(!g.restore(&bad.to_string()));
        assert_eq!(before, g.snapshot());
    }
}
#[test]
fn a_running_gathering_survives_save_and_reload() {
    let mut g = setup();
    unlock(&mut g);
    ready_building(&mut g, "square", 8, 8);
    g.app.world_mut().resource_mut::<Village>().meals = 5;
    assert_eq!(g.host_gathering(), "ok");
    advance(&mut g, 10.);
    let mut restored = Game::new();
    assert!(restored.restore(&g.snapshot()));
    advance(&mut restored, 31.);
    assert_eq!(
        restored
            .app
            .world()
            .resource::<Village>()
            .progress
            .gatherings,
        1
    );
}

#[test]
fn tools_accelerate_building_and_spend_one_use_on_completion() {
    let mut g = setup();
    assert_eq!(g.place("home", 8, 8), "ok");
    g.app
        .world_mut()
        .resource_mut::<Village>()
        .progress
        .tool_uses = 12;
    let v = g.app.world().resource::<Village>().clone();
    let mut q = g.app.world_mut().query::<&mut Resident>();
    let mut r = q.iter_mut(g.app.world_mut()).find(|r| r.id == 1).unwrap();
    assign(&mut r, &v, "build", "test", true);
    r.x = r.target_x;
    r.y = r.target_y;
    let mut without = Game::new();
    assert!(without.restore(&g.snapshot()));
    without.set_tools_enabled(false);
    g.tick(0.2);
    without.tick(0.2);
    let normal = without.app.world().resource::<Village>().buildings[0].progress;
    assert_eq!(
        g.app.world().resource::<Village>().buildings[0].progress,
        normal * 1.25
    );
    assert_eq!(g.app.world().resource::<Village>().progress.tool_uses, 12);
    g.app.world_mut().resource_mut::<Village>().buildings[0].progress = 99.9;
    g.tick(0.2);
    assert_eq!(g.app.world().resource::<Village>().progress.tool_uses, 11);
}

#[test]
fn a_gathering_without_attendance_does_not_credit_a_quest_or_friendship() {
    let mut g = setup();
    unlock(&mut g);
    ready_building(&mut g, "square", 2, 2);
    g.app.world_mut().resource_mut::<Village>().meals = 5;
    assert_eq!(g.host_gathering(), "ok");
    let mut q = g.app.world_mut().query::<&mut Resident>();
    for mut r in q.iter_mut(g.app.world_mut()) {
        r.x = 27.;
        r.y = 27.;
    }
    advance(&mut g, 41.);
    let v = g.app.world().resource::<Village>();
    assert_eq!(v.progress.gatherings, 0);
    assert!(!v.progress.welcome_supper);
    assert_eq!(v.progress.friendships, [0; 25]);
}

#[test]
fn crops_require_planting_moisture_and_time_before_harvest() {
    let mut g = setup();
    ready_building(&mut g, "garden", 14, 10);
    let food = g.app.world().resource::<Village>().food;
    finish_task(&mut g, 0, "garden");
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(v.buildings[0].crop.planted);
        ecology::advance(&mut v, 180.);
        assert_eq!(v.buildings[0].crop.growth, 0.);
        assert_eq!(v.food, food);
    }
    let water = g.app.world().resource::<Village>().water;
    finish_task(&mut g, 0, "garden");
    {
        let mut v = g.app.world_mut().resource_mut::<Village>();
        assert!(v.water < water - 2.);
        ecology::advance(&mut v, 90.);
        assert_eq!(v.buildings[0].crop.growth, 90.);
        assert_eq!(v.harvests, 0);
        ecology::advance(&mut v, 90.);
    }
    finish_task(&mut g, 0, "garden");
    let v = g.app.world().resource::<Village>();
    assert_eq!(v.food, food + 8.);
    assert_eq!(v.harvests, 1);
    assert!(!v.buildings[0].crop.planted);
}

#[test]
fn rain_needs_completed_storage_and_dry_days_pause_crops() {
    let mut g = setup();
    ready_building(&mut g, "garden", 14, 10);
    let mut v = g.app.world().resource::<Village>().clone();
    v.minutes = 900.;
    v.water = 0.;
    v.buildings[0].crop.planted = true;
    ecology::advance(&mut v, 60.);
    assert_eq!(v.water, 0.);
    assert_eq!(v.buildings[0].crop.growth, 60.);
    ready_building(&mut g, "well", 6, 10);
    v.buildings
        .push(g.app.world().resource::<Village>().buildings[1].clone());
    ecology::advance(&mut v, 60.);
    assert_eq!(v.water, 18.);
    v.water = 114.;
    ecology::advance(&mut v, 60.);
    assert_eq!(v.water, 115.);
    v.minutes = 2. * 1440. + 900.;
    v.buildings[0].crop.growth = 0.;
    v.buildings[0].crop.moisture = 10.;
    ecology::advance(&mut v, 60.);
    assert_eq!(v.buildings[0].crop.growth, 10.);
    assert_eq!(v.water, 115.);
    ecology::advance(&mut v, 60.);
    assert_eq!(v.buildings[0].crop.growth, 10.);
    for minute in [839., 1020., 2880. + 900.] {
        assert!(!ecology::raining(minute));
    }
    assert!(ecology::raining(840.));
}

#[test]
fn water_collection_works_before_cistern_and_only_after_arrival() {
    let mut g = setup();
    g.app.world_mut().resource_mut::<Village>().water = 0.;
    assert!(g.request(4, "water", false).contains("Happy"));
    g.tick(0.2);
    assert_eq!(g.app.world().resource::<Village>().water, 0.);
    finish_task(&mut g, 4, "water");
    assert!((g.app.world().resource::<Village>().water - 18.).abs() < 0.02);
    g.app.world_mut().resource_mut::<Village>().water = 39.;
    finish_task(&mut g, 4, "water");
    assert!((g.app.world().resource::<Village>().water - 40.).abs() < 0.02);
}

#[test]
fn garden_workers_cannot_harvest_the_same_crop_twice_or_remote_plots() {
    let mut g = setup();
    ready_building(&mut g, "garden", 14, 10);
    ready_building(&mut g, "garden", 18, 10);
    let mut v = g.app.world().resource::<Village>().clone();
    for b in &mut v.buildings {
        b.crop = ecology::Crop {
            planted: true,
            growth: 180.,
            moisture: 0.,
        };
    }
    let mut q = g.app.world_mut().query::<&Resident>();
    let mut r = q.iter(g.app.world()).next().unwrap().clone();
    assign(&mut r, &v, "garden", "test", true);
    ecology::tend(&mut v, &r);
    ecology::tend(&mut v, &r);
    assert_eq!(v.harvests, 1);
    assert_eq!(v.buildings[1].crop.growth, 180.);
}

#[test]
fn crop_saves_round_trip_migrate_and_reject_invalid_state() {
    let mut g = setup();
    ready_building(&mut g, "garden", 14, 10);
    g.app.world_mut().resource_mut::<Village>().buildings[0].crop = ecology::Crop {
        planted: true,
        growth: 80.,
        moisture: 100.,
    };
    let saved = g.snapshot();
    let mut restored = Game::new();
    assert!(restored.restore(&saved));
    assert_eq!(restored.snapshot(), saved);
    let mut legacy: serde_json::Value = serde_json::from_str(&saved).unwrap();
    legacy["village"]["buildings"][0]
        .as_object_mut()
        .unwrap()
        .remove("crop");
    assert!(restored.restore(&legacy.to_string()));
    assert!(
        !restored.app.world().resource::<Village>().buildings[0]
            .crop
            .planted
    );
    for (field, value) in [("growth", -1.), ("growth", 181.), ("moisture", 241.)] {
        let mut invalid: serde_json::Value = serde_json::from_str(&saved).unwrap();
        invalid["village"]["buildings"][0]["crop"][field] = serde_json::json!(value);
        let before = restored.snapshot();
        assert!(!restored.restore(&invalid.to_string()));
        assert_eq!(restored.snapshot(), before);
    }
}
