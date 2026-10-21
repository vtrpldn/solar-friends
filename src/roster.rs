//! Persistent resident records define membership; slots only arrange physical space.
use crate::Village;

pub fn slot(v: &Village, id: usize) -> Option<usize> {
    v.skills.people.keys().position(|&person| person == id)
}
pub fn offset(v: &Village, id: usize, spacing: f32) -> f32 {
    let center = v.skills.people.len().saturating_sub(1) as f32 / 2.;
    (slot(v, id).unwrap_or(0) as f32 - center) * spacing
}
pub fn camp_spot(v: &Village, id: usize) -> (f32, f32) {
    let slot = slot(v, id).unwrap_or(0);
    let width = v.skills.people.len().clamp(1, 5);
    let center = (width - 1) as f32 / 2.;
    let (x, y) = crate::camp(v);
    (
        (x + (slot % width) as f32 * 1.25 - center * 1.25).clamp(0.3, crate::MAP_SIZE as f32 - 0.3),
        (y + (slot / width) as f32 * 1.25).clamp(0.3, crate::MAP_SIZE as f32 - 0.3),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::*;
    fn people(v: &mut Village, count: usize) -> Vec<usize> {
        let ids: Vec<_> = (0..count).map(|i| 42 + i * 101).collect();
        v.skills.people = ids
            .iter()
            .map(|&id| (id, skills::Person::default()))
            .collect();
        v.workforce_peers.clear();
        ids
    }
    #[test]
    fn original_five_keep_their_beds_camp_formation_and_gate_positions() {
        let g = Game::new();
        let v = g.app.world().resource::<Village>();
        for id in 0..5 {
            assert_eq!(slot(v, id), Some(id));
            assert_eq!(
                camp_spot(v, id),
                (camp(v).0 + (id as f32 - 2.) * 1.25, camp(v).1)
            );
            assert_eq!(
                mobility::gate(v, id),
                (0.4, camp(v).1 + (id as f32 - 2.) * 1.25)
            );
        }
        assert_eq!(slot(v, 900), None);
    }
    #[test]
    fn sparse_rosters_have_beds_and_distinct_work_and_arrival_positions() {
        let mut g = Game::new();
        for x in [5, 8, 11, 14] {
            assert_eq!(g.place("home", x, 5), "ok");
            let id = g
                .app
                .world()
                .resource::<Village>()
                .buildings
                .last()
                .unwrap()
                .id;
            logistics::fixture_finish(&mut g.app.world_mut().resource_mut::<Village>(), id);
        }
        let mut v = g.app.world().resource::<Village>().clone();
        let ids = people(&mut v, 12);
        for (i, &id) in ids.iter().enumerate() {
            assert_eq!(shelter(&v, id).unwrap().id, i / 3);
        }
        assert!(shelter(&v, 0).is_none());
        let arrivals: Vec<_> = ids.iter().map(|&id| camp_spot(&v, id)).collect();
        for (i, p) in arrivals.iter().enumerate() {
            assert!(world::walkable(&v, p.0, p.1));
            assert!(
                arrivals[i + 1..]
                    .iter()
                    .all(|q| (p.0 - q.0).hypot(p.1 - q.1) >= 1.2)
            );
        }
        let gates: Vec<_> = ids.iter().map(|&id| mobility::gate(&v, id)).collect();
        for (i, p) in gates.iter().enumerate() {
            assert!(world::walkable(&v, p.0, p.1));
            assert!(
                gates[i + 1..]
                    .iter()
                    .all(|q| (p.0 - q.0).hypot(p.1 - q.1) >= 1.2)
            );
        }
        v.buildings.truncate(1);
        let spots: Vec<_> = ids
            .iter()
            .map(|&id| spacing::approach(&v, &v.buildings[0], id).unwrap())
            .collect();
        for (i, p) in spots.iter().enumerate() {
            assert!(world::walkable(&v, p.0, p.1));
            assert!(
                spots[i + 1..]
                    .iter()
                    .all(|q| (p.0 - q.0).hypot(p.1 - q.1) >= spacing::PERSONAL_SPACE)
            );
        }
        assert!(spacing::approach(&v, &v.buildings[0], 0).is_none());
    }
    #[test]
    fn quiet_spots_follow_the_camp_and_stay_distinct_for_one_and_twelve_people() {
        let mut g = Game::new();
        assert!(g.start_mode("sandbox"));
        for count in [1, 12] {
            let mut v = g.app.world().resource::<Village>().clone();
            let ids = people(&mut v, count);
            let spots: Vec<_> = ids
                .iter()
                .map(|&id| idle_destination(&v, id).unwrap())
                .collect();
            for (i, p) in spots.iter().enumerate() {
                assert!(world::walkable(&v, p.0, p.1));
                assert!((p.0 - camp(&v).0).hypot(p.1 - camp(&v).1) < 20.);
                assert!(!spots[i + 1..].contains(p));
            }
        }
    }
}
