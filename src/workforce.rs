//! Food-work reservations derived from residents' current, persisted activities.
use crate::*;

pub fn refresh<'a>(v: &mut Village, people: impl IntoIterator<Item = &'a Resident>) {
    v.activity_claims = std::array::from_fn(|_| None);
    for r in people {
        if r.id < 5 && r.trip.is_none() && r.remaining > 0. {
            v.activity_claims[r.id] = Some(r.task.clone());
        }
    }
}
fn count(v: &Village, id: usize, task: &str) -> f32 {
    v.activity_claims
        .iter()
        .enumerate()
        .filter(|(i, t)| *i != id && t.as_deref() == Some(task))
        .count() as f32
}
fn projected(v: &Village, id: usize) -> (f32, f32) {
    let cooks = count(v, id, "cook");
    (
        v.food + count(v, id, "gather") * 2. - cooks * 3.,
        v.meals as f32 + cooks * 5.,
    )
}
pub fn urgent_food(v: &Village, id: usize) -> bool {
    let (food, meals) = projected(v, id);
    food < 6. && meals < 3.
}
pub fn ingredients(v: &Village, id: usize) -> bool {
    let (food, meals) = projected(v, id);
    food < 18. && food + meals < 30.
}
pub fn cooking(v: &Village, id: usize) -> bool {
    let cooks = count(v, id, "cook");
    let food = v.food - cooks * 3.;
    v.meals as f32 + cooks * 5. < 8.
        && food
            >= if v.supplies.use_eggs && v.supplies.eggs as f32 >= 2. + cooks * 2. {
                2.
            } else {
                3.
            }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn people_already_cooking_cover_portions_and_ingredients_once() {
        let g = Game::new();
        let mut v = g.app.world().resource::<Village>().clone();
        v.food = 6.;
        v.meals = 0;
        assert!(cooking(&v, 0));
        v.activity_claims[0] = Some("cook".into());
        assert!(cooking(&v, 1));
        v.activity_claims[1] = Some("cook".into());
        assert!(!cooking(&v, 2));
        assert!(!urgent_food(&v, 2));
        assert!(
            cooking(&v, 0),
            "A chooser excludes its own completed or cancelled activity"
        );
    }
    #[test]
    fn enough_foragers_can_cover_an_emergency_without_sending_everybody() {
        let g = Game::new();
        let mut v = g.app.world().resource::<Village>().clone();
        v.food = 2.;
        v.meals = 0;
        assert!(urgent_food(&v, 0));
        v.activity_claims[0] = Some("gather".into());
        assert!(urgent_food(&v, 1));
        v.activity_claims[1] = Some("gather".into());
        assert!(!urgent_food(&v, 2));
        v.activity_claims[0] = None;
        assert!(
            urgent_food(&v, 2),
            "Interrupted foraging releases the expected food"
        );
    }
}
