//! Building visits finish only after residents reach the selected building.
use super::*;
pub fn radius(kind: &str) -> i32 {
    if kind == "square" { 2 } else { 1 }
}
pub fn approach(b: &Building, id: usize) -> (f32, f32) {
    if b.kind == "square" {
        (b.x as f32 + (id as f32 - 2.) * 0.4, b.y as f32 + 1.0)
    } else {
        (b.x as f32 + 0.75, b.y as f32 + 0.75)
    }
}
pub fn start(r: &mut Resident, v: &Village, index: usize, requested: bool) {
    let b = &v.buildings[index];
    assign(
        r,
        v,
        "visit",
        "Spending time at a village building.",
        requested,
    );
    r.visit_building = Some(index);
    (r.target_x, r.target_y) = approach(b, r.id);
    r.reason = match b.kind.as_str() {
        "home" => "Resting on the porch.",
        "garden" => "Checking and tending this garden.",
        "kitchen" => "Preparing a pot in this kitchen.",
        "well" => "Taking a refreshing drink at the cistern.",
        "grove" => "Picking fruit in this food forest.",
        "coop" => "Caring for the hens and checking their nesting boxes.",
        "compost" => "Turning scraps into compost.",
        "workshop" => "Making tools in this workshop.",
        "square" => "Meeting neighbours in the community square.",
        _ => "Visiting the village.",
    }
    .into();
}
pub fn finish(v: &mut Village, r: &mut Resident) {
    let Some(index) = r.visit_building else {
        return;
    };
    let Some(b) = v.buildings.get(index) else {
        return;
    };
    if b.progress < 100. || (r.x - r.target_x).hypot(r.y - r.target_y) > 0.1 {
        return;
    }
    let kind = b.kind.clone();
    // Shared production cooldown prevents five simultaneous visitors multiplying output.
    if kind != "home" && kind != "square" && b.next_visit > v.minutes {
        return;
    }
    v.buildings[index].visits = v.buildings[index].visits.saturating_add(1);
    v.buildings[index].next_visit = v.minutes + 60.;
    match kind.as_str() {
        "home" => r.energy = (r.energy + 18.).min(100.),
        "square" => {
            r.social = (r.social + 25.).min(100.);
            r.energy = (r.energy + 8.).min(100.);
            v.progress.social_mask |= 1 << r.id;
        }
        "garden" => ecology::tend(v, r),
        "kitchen" => supplies::cook(v),
        "well" if v.water >= 1. => {
            v.water -= 1.;
            r.energy = (r.energy + 10.).min(100.);
            r.hunger = (r.hunger - 5.).max(0.);
        }
        "grove" => {
            v.food += 2.;
            v.supplies.gathered += 2.;
            v.progress.fruit = v.progress.fruit.saturating_add(2);
        }
        "coop" => {
            r.social = (r.social + 10.).min(100.);
            let p = &mut v.buildings[index].poultry;
            // Care advances an already-fed batch, but never creates unfed eggs.
            if p.remaining > 30. {
                p.remaining -= 30.;
            }
        }
        "compost" if v.progress.scraps >= 2 => {
            v.progress.scraps -= 2;
            v.progress.compost += 1;
        }
        "workshop" if v.wood >= 8. && v.progress.tool_uses <= 24 => {
            v.wood -= 8.;
            v.progress.tool_uses += 12;
            v.progress.tools_crafted += 1;
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn every_building_supports_a_targeted_visit_only_after_arrival() {
        for kind in [
            "home", "garden", "kitchen", "well", "grove", "coop", "compost", "workshop", "square",
        ] {
            let mut g = Game::new();
            {
                let mut v = g.app.world_mut().resource_mut::<Village>();
                v.progress.completed = [true; 4];
                v.wood = 200.;
                v.progress.scraps = 4;
            }
            assert_eq!(g.place(kind, 5, 5), "ok", "{kind}");
            g.app.world_mut().resource_mut::<Village>().buildings[0].progress = 100.;
            {
                let mut q = g.app.world_mut().query::<&mut Resident>();
                let mut r = q.iter_mut(g.app.world_mut()).find(|r| r.id == 0).unwrap();
                r.task = "idle".into();
                r.energy = 60.;
            }
            assert!(g.visit_building(0, 0).contains("Iara:"));
            g.tick(0.25);
            assert_eq!(
                g.app.world().resource::<Village>().buildings[0].visits,
                0,
                "{kind} acted remotely"
            );
            for _ in 0..500 {
                g.tick(0.25);
            }
            assert!(
                g.app.world().resource::<Village>().buildings[0].visits > 0,
                "{kind} was never used"
            );
            let mut restored = Game::new();
            assert!(restored.restore(&g.snapshot()), "{kind} save failed");
        }
    }
    #[test]
    fn visits_produce_building_specific_benefits_and_share_cooldowns() {
        for kind in [
            "home", "garden", "kitchen", "well", "grove", "coop", "compost", "workshop", "square",
        ] {
            let mut g = Game::new();
            {
                let mut v = g.app.world_mut().resource_mut::<Village>();
                v.progress.completed = [true; 4];
                v.wood = 200.;
            }
            assert_eq!(g.place(kind, 5, 5), "ok");
            let mut v = g.app.world().resource::<Village>().clone();
            v.buildings[0].progress = 100.;
            v.buildings[0].poultry.remaining = 100.;
            v.progress.scraps = 2;
            let mut q = g.app.world_mut().query::<&Resident>();
            let mut r = q.iter(g.app.world()).next().unwrap().clone();
            r.energy = 40.;
            r.social = 40.;
            start(&mut r, &v, 0, true);
            r.x = r.target_x;
            r.y = r.target_y;
            let food = v.food;
            let water = v.water;
            let wood = v.wood;
            finish(&mut v, &mut r);
            match kind {
                "home" => assert_eq!(r.energy, 58.),
                "garden" => assert!(v.buildings[0].crop.planted),
                "kitchen" => {
                    assert_eq!(v.meals, 5);
                    assert_eq!(v.food, food - 3.);
                }
                "well" => {
                    assert_eq!(v.water, water - 1.);
                    assert_eq!(r.energy, 50.);
                }
                "grove" => assert_eq!(v.food, food + 2.),
                "coop" => {
                    assert_eq!(v.buildings[0].poultry.remaining, 70.);
                    assert_eq!(r.social, 50.);
                }
                "compost" => {
                    assert_eq!(v.progress.compost, 1);
                    assert_eq!(v.progress.scraps, 0);
                }
                "workshop" => {
                    assert_eq!(v.progress.tool_uses, 12);
                    assert_eq!(v.wood, wood - 8.);
                }
                "square" => {
                    assert_eq!(r.social, 65.);
                    assert_eq!(r.energy, 48.);
                }
                _ => unreachable!(),
            }
            if kind != "home" && kind != "square" {
                finish(&mut v, &mut r);
                assert_eq!(v.buildings[0].visits, 1);
            }
        }
    }
    #[test]
    fn square_footprint_blocks_edges_and_neighbours() {
        let mut g = Game::new();
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.progress.completed = [true; 4];
            v.wood = 200.;
        }
        assert_ne!(g.place("square", 1, 1), "ok");
        assert_eq!(g.place("square", 5, 5), "ok");
        assert_ne!(g.place("home", 7, 5), "ok");
        assert_eq!(g.place("home", 8, 5), "ok");
    }
    #[test]
    fn unavailable_buildings_and_tired_residents_refuse_visits() {
        let mut g = Game::new();
        assert_eq!(g.place("home", 5, 5), "ok");
        assert!(g.visit_building(0, 0).contains("Finish construction"));
        assert!(g.visit_building(0, 99).contains("not found"));
        g.app.world_mut().resource_mut::<Village>().buildings[0].progress = 100.;
        assert!(g.visit_building(0, 0).contains("needs to"));
    }
}
