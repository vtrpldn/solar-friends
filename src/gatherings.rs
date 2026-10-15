//! Saved shared-table preparation, physical food delivery and attended serving.
use crate::*;
use economy::MEALS;
use simulation::Id;

pub const PORTIONS: u32 = 5;
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Preparing,
    Ready,
    Serving,
    Complete,
    Failed,
    Cancelled,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Plan {
    pub id: Id,
    pub building: usize,
    pub store: Id,
    pub phase: Phase,
    pub created: f32,
    pub deadline: f32,
    pub started: Option<f32>,
    pub finished: Option<f32>,
    pub invited: u8,
    pub attended: u8,
    pub spent_before: u64,
    pub spent_after: Option<u64>,
}
impl Plan {
    pub fn active(&self) -> bool {
        matches!(self.phase, Phase::Preparing | Phase::Ready | Phase::Serving)
    }
}
pub fn active(v: &Village) -> Option<&Plan> {
    v.progress
        .gathering_delivery
        .as_ref()
        .filter(|p| p.active())
}
pub fn destination(v: &Village) -> Option<usize> {
    active(v).map(|p| p.building)
}
fn open(v: &Village, building: usize) -> bool {
    building_work::job(v, building).is_none()
        && v.buildings.iter().any(|b| {
            b.id == building
                && b.progress >= 100.
                && matches!(b.kind.as_str(), "square" | "kitchen")
        })
}
pub fn held(v: &Village, store: Id, material: usize) -> u32 {
    let Some(p) =
        active(v).filter(|p| material == MEALS && p.spent_after.is_none() && open(v, p.building))
    else {
        return 0;
    };
    let Some(s) = &v.logistics else {
        return 0;
    };
    let Some(table) = s.stores.iter().find(|s| s.id == p.store) else {
        return 0;
    };
    let Some(at) = s
        .stores
        .iter()
        .find(|s| s.id == store && !logistics::closing(v, s.owner))
    else {
        return 0;
    };
    let incoming: u32 = s
        .shipments
        .iter()
        .filter(|h| h.to == table.id && h.material == MEALS)
        .map(|h| h.amount)
        .sum();
    let available = |s: &logistics::Store| {
        s.items[MEALS].saturating_sub(
            logistics::pickup_reserved(v, s.id, MEALS) + food::held(v, s.id, MEALS, None),
        )
    };
    let local = available(table).min(PORTIONS);
    if at.id == table.id {
        return local;
    }
    let remaining = PORTIONS.saturating_sub(local + incoming);
    if remaining == 0 {
        return 0;
    }
    // Prefer portions already at the table, then nearby stores with stable ID
    // ordering. Claims become saved shipment ownership when a carrier accepts.
    let distance = |s: &logistics::Store| (s.x - table.x).abs() + (s.y - table.y).abs();
    let ahead = s
        .stores
        .iter()
        .filter(|s| s.id != at.id && s.id != table.id && !logistics::closing(v, s.owner))
        .filter(|s| {
            distance(s)
                .total_cmp(&distance(at))
                .then(s.id.0.cmp(&at.id.0))
                .is_lt()
        })
        .map(available)
        .sum::<u32>();
    available(at).min(remaining.saturating_sub(ahead))
}
pub fn reserved(v: &Village, material: usize) -> u32 {
    if active(v).is_some_and(|p| p.spent_after.is_none() && open(v, p.building))
        && material == MEALS
    {
        PORTIONS.min(v.meals)
    } else {
        0
    }
}
pub fn needs(v: &Village, building: usize) -> u32 {
    if active(v)
        .is_some_and(|p| p.building == building && p.spent_after.is_none() && open(v, building))
    {
        PORTIONS
    } else {
        0
    }
}
pub fn eligible(r: &Resident) -> bool {
    r.trip.is_none()
        && r.energy >= 25.
        && r.hunger <= 75.
        && !matches!(r.task.as_str(), "arrive" | "sleep")
}
fn mask<'a>(people: impl IntoIterator<Item = &'a Resident>) -> u8 {
    people
        .into_iter()
        .filter(|r| eligible(r))
        .fold(0, |m, r| m | (1 << r.id))
}
fn reset(v: &mut Village) {
    v.progress.gathering_until = 0.;
    v.progress.invited = 0;
    v.progress.attended = 0;
}
pub fn cancel(v: &mut Village) -> bool {
    let Some(p) = v
        .progress
        .gathering_delivery
        .as_mut()
        .filter(|p| p.active())
    else {
        return false;
    };
    p.attended = v.progress.attended;
    p.phase = Phase::Cancelled;
    p.finished = Some(v.minutes);
    reset(v);
    true
}
/// Return true only when the invitation starts, so the caller can interrupt work safely.
pub fn advance(v: &mut Village, available: u8) -> bool {
    let Some(p) = active(v).cloned() else {
        return false;
    };
    if !open(v, p.building) || (p.phase != Phase::Serving && v.minutes >= p.deadline) {
        cancel(v);
        event(
            v,
            if p.phase != Phase::Serving && v.minutes >= p.deadline {
                "The gathering missed its delivery deadline. Unserved meals stay recoverable. Roads shorten the haul; a table closer to the pantry can help."
            } else {
                "The gathering was cancelled. Unserved meals stay stored or recoverable; try an earlier time or a clearer supply route."
            },
        );
        return false;
    }
    if p.phase == Phase::Serving {
        v.progress.gathering_delivery.as_mut().unwrap().attended = v.progress.attended;
        if p.spent_after.is_none()
            && v.progress.attended.count_ones() >= 3
            && held(v, p.store, MEALS) == PORTIONS
        {
            assert!(logistics::spend_at(v, p.store, MEALS, PORTIONS));
            v.supplies.portions_eaten = v.supplies.portions_eaten.saturating_add(PORTIONS);
            let spent = v.simulation.materials.as_ref().unwrap().spent[MEALS];
            v.progress.gathering_delivery.as_mut().unwrap().spent_after = Some(spent);
            event(
                v,
                "Neighbours have reached the shared table. Five delivered meals are being shared.",
            );
        }
        return false;
    }
    if held(v, p.store, MEALS) < PORTIONS {
        v.progress.gathering_delivery.as_mut().unwrap().phase = Phase::Preparing;
        return false;
    }
    let invited = p.invited & available;
    if invited.count_ones() < 3 || !(480.0..1080.).contains(&(v.minutes % 1440.)) {
        v.progress.gathering_delivery.as_mut().unwrap().phase = Phase::Ready;
        return false;
    }
    let plan = v.progress.gathering_delivery.as_mut().unwrap();
    plan.phase = Phase::Serving;
    plan.started = Some(v.minutes);
    v.progress.gathering_day = (v.minutes / 1440.).floor() as i32;
    v.progress.invited = invited;
    v.progress.attended = 0;
    v.progress.gathering_until = v.minutes + 120.;
    event(
        v,
        "The meals have reached the shared table. Neighbours are coming to share food and stories.",
    );
    true
}
pub fn served(v: &Village) -> bool {
    active(v).is_some_and(|p| p.spent_after.is_some())
}
pub fn finish(v: &mut Village, success: bool) {
    if let Some(p) = v.progress.gathering_delivery.as_mut() {
        p.phase = if success {
            Phase::Complete
        } else {
            Phase::Failed
        };
        p.attended = v.progress.attended;
        p.finished = Some(v.minutes);
    }
    reset(v);
}
#[cfg(test)]
pub(crate) fn fixture_table(v: &mut Village) {
    let table = active(v).unwrap().store;
    let s = v.logistics.as_mut().unwrap();
    assert!(s.shipments.is_empty());
    let from = s
        .stores
        .iter()
        .position(|p| p.owner == logistics::Owner::Camp)
        .unwrap();
    let to = s.stores.iter().position(|p| p.id == table).unwrap();
    s.stores[from].items[MEALS] -= PORTIONS;
    s.stores[to].items[MEALS] += PORTIONS;
    logistics::sync_totals(v);
    freshness::fixture_reseed(v);
}
pub fn valid(v: &Village) -> bool {
    let Some(p) = &v.progress.gathering_delivery else {
        return v.progress.gathering_until == 0.
            && v.progress.invited == 0
            && v.progress.attended == 0;
    };
    let day = (p.created / 1440.).floor();
    p.id.0 > 0
        && p.id.0 < v.simulation.next_id
        && p.building < v.economy.next_building
        && p.store.0 > 0
        && p.store.0 < v.simulation.next_id
        && p.invited <= 31
        && p.invited.count_ones() >= 3
        && p.attended & !p.invited == 0
        && p.created.is_finite()
        && (0.0..=v.minutes).contains(&p.created)
        && p.deadline == (day + 1.) * 1440. + 1080.
        && p.created < p.deadline
        && p.spent_before
            <= v.simulation
                .materials
                .as_ref()
                .map_or(0, |m| m.spent[MEALS])
        && v.progress.gathering_day == p.started.map_or(day as i32, |t| (t / 1440.).floor() as i32)
        && p.started
            .is_none_or(|t| t.is_finite() && (p.created..=v.minutes).contains(&t))
        && p.finished.is_some() == !p.active()
        && p.finished
            .is_none_or(|t| t.is_finite() && (p.created..=v.minutes).contains(&t))
        && p.spent_before <= 9_007_199_254_740_986
        && p.spent_after.is_none_or(|spent| {
            p.started.is_some()
                && p.attended.count_ones() >= 3
                && spent >= p.spent_before + u64::from(PORTIONS)
                && v.simulation
                    .materials
                    .as_ref()
                    .is_some_and(|m| spent <= m.spent[MEALS])
        })
        && (!p.active() || food::pantry(v, p.building).is_some_and(|s| s.id == p.store))
        && match p.phase {
            Phase::Preparing | Phase::Ready => {
                p.started.is_none()
                    && p.spent_after.is_none()
                    && v.progress.gathering_until == 0.
                    && v.progress.invited == 0
                    && v.progress.attended == 0
            }
            Phase::Serving => {
                p.started
                    .is_some_and(|t| v.progress.gathering_until == t + 120.)
                    && v.progress.invited.count_ones() >= 3
                    && v.progress.invited & !p.invited == 0
                    && v.progress.attended & !v.progress.invited == 0
            }
            Phase::Complete => {
                p.spent_after.is_some()
                    && v.progress.gathering_until == 0.
                    && v.progress.invited == 0
                    && v.progress.attended == 0
            }
            Phase::Failed | Phase::Cancelled => {
                v.progress.gathering_until == 0.
                    && v.progress.invited == 0
                    && v.progress.attended == 0
            }
        }
}

#[wasm_bindgen]
impl Game {
    pub fn host_gathering(&mut self) -> String {
        let v = self.app.world().resource::<Village>();
        if v.mode == modes::Mode::Story && !progression::available(v, 2) {
            return "Finish Roots for Tomorrow before hosting our welcome supper.".into();
        }
        let building = v
            .buildings
            .iter()
            .filter(|b| open(v, b.id))
            .find(|b| b.kind == "square")
            .or_else(|| {
                v.buildings.iter().find(|b| {
                    b.kind == "kitchen"
                        && open(v, b.id)
                        && v.progress.completed[0]
                        && !v.progress.welcome_supper
                })
            });
        let Some(building) = building else {
            return "Build a community square first, or finish the introduction to host a welcome supper at the kitchen.".into();
        };
        let day = (v.minutes / 1440.).floor() as i32;
        if active(v).is_some() || v.progress.gathering_day == day {
            return "We can host one gathering each day. Come back tomorrow.".into();
        }
        if !(480.0..1080.).contains(&(v.minutes % 1440.)) {
            return "Plan a gathering between 08:00 and 18:00, with time to deliver meals before dusk.".into();
        }
        if economy::free(v, MEALS) < PORTIONS {
            return "Set aside five unreserved prepared meals for the gathering.".into();
        }
        let Some(store) = food::pantry(v, building.id).map(|p| p.id) else {
            return "Leave room for the shared table's supplies.".into();
        };
        let building = building.id;
        let invited = mask(
            self.app
                .world_mut()
                .query::<&Resident>()
                .iter(self.app.world()),
        );
        if invited.count_ones() < 3 {
            return "At least three neighbours need to be rested and fed.".into();
        }
        let mut v = self.app.world_mut().resource_mut::<Village>();
        let Some(id) = v.simulation.allocate() else {
            return "No gathering identity is available.".into();
        };
        v.progress.gathering_delivery = Some(Plan {
            id,
            building,
            store,
            phase: Phase::Preparing,
            created: v.minutes,
            deadline: (day as f32 + 1.) * 1440. + 1080.,
            started: None,
            finished: None,
            invited,
            attended: 0,
            spent_before: v.simulation.materials.as_ref().unwrap().spent[MEALS],
            spent_after: None,
        });
        v.progress.gathering_day = day;
        economy::rebalance(&mut v);
        event(
            &mut v,
            "A gathering is planned. Neighbours will bring five meals to the shared table by tomorrow evening.",
        );
        "ok".into()
    }
    pub fn cancel_gathering(&mut self) -> String {
        {
            let mut v = self.app.world_mut().resource_mut::<Village>();
            if !cancel(&mut v) {
                return "There is no gathering to cancel.".into();
            }
            economy::rebalance(&mut v);
            event(
                &mut v,
                "The gathering is cancelled. Unserved portions remain stored or in a recoverable load.",
            );
        }
        for mut r in self
            .app
            .world_mut()
            .query::<&mut Resident>()
            .iter_mut(self.app.world_mut())
        {
            if r.task == "gathering" {
                r.remaining = 0.;
            }
        }
        "ok".into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn scene() -> Game {
        let mut g = Game::new();
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.arrived = true;
            v.minutes = 540.;
            v.progress.completed = [true; 4];
            v.production.targets = [0; economy::COUNT];
            crate::water::fixture_fresh(&mut v, 40.);
            logistics::fixture_stock(&mut v, economy::FOOD, 60);
            logistics::fixture_stock(&mut v, MEALS, 10);
        }
        assert_eq!(g.place("square", 6, 6), "ok");
        logistics::fixture_finish(&mut g.app.world_mut().resource_mut::<Village>(), 0);
        for mut r in g
            .app
            .world_mut()
            .query::<&mut Resident>()
            .iter_mut(g.app.world_mut())
        {
            r.task = "idle".into();
            r.remaining = 0.;
            r.requested = false;
            r.energy = 90.;
            r.hunger = 0.;
            r.social = 90.;
            r.last_meal_slot = 0;
            r.x = CAMP.0 + (r.id as f32 - 2.) * 1.25;
            r.y = CAMP.1;
            r.target_x = r.x;
            r.target_y = r.y;
        }
        g
    }
    fn checkpoint(g: &mut Game) {
        let saved = g.snapshot();
        assert!(
            g.restore(&saved),
            "invalid shared-table checkpoint: {saved}"
        );
        assert_eq!(saved, g.snapshot());
    }
    fn stage_table(v: &mut Village) {
        let s = v.logistics.as_mut().unwrap();
        let from = s
            .stores
            .iter()
            .position(|p| p.owner == logistics::Owner::Camp)
            .unwrap();
        let to = s
            .stores
            .iter()
            .position(|p| p.owner == logistics::Owner::Pantry(0))
            .unwrap();
        assert!(s.shipments.is_empty());
        s.stores[from].items[MEALS] -= PORTIONS;
        s.stores[to].items[MEALS] += PORTIONS;
        logistics::sync_totals(v);
        freshness::fixture_reseed(v);
    }
    #[test]
    fn residents_really_deliver_the_meals_before_the_invitation_and_serve_once() {
        let mut g = scene();
        assert_eq!(g.host_gathering(), "ok");
        let before = g.snapshot();
        assert_ne!(g.host_gathering(), "ok");
        assert_eq!(before, g.snapshot());
        assert_eq!(g.app.world().resource::<Village>().meals, 10);
        let mut carried = false;
        let mut at_table = false;
        for frame in 0..2400 {
            let v = g.app.world().resource::<Village>();
            let plan = v.progress.gathering_delivery.as_ref().unwrap();
            carried |= v
                .logistics
                .as_ref()
                .unwrap()
                .shipments
                .iter()
                .any(|h| h.material == MEALS && h.carrying && h.to == plan.store);
            if plan.phase == Phase::Preparing {
                assert_eq!(v.progress.gathering_until, 0.);
                assert_eq!(plan.spent_after, None);
            }
            at_table |= plan.phase == Phase::Serving
                && food::pantry(v, 0).unwrap().items[MEALS] >= PORTIONS;
            if plan.phase == Phase::Complete {
                break;
            }
            if frame % 20 == 0 {
                checkpoint(&mut g);
            }
            g.tick(0.25);
        }
        let v = g.app.world().resource::<Village>();
        let p = v.progress.gathering_delivery.as_ref().unwrap();
        assert!(carried && at_table);
        assert_eq!(p.phase, Phase::Complete);
        assert_eq!(v.progress.gatherings, 1);
        assert!(p.spent_after.is_some());
        assert!(p.attended.count_ones() >= 3);
        let spent = p.spent_after;
        for _ in 0..8 {
            g.tick(0.25);
        }
        assert_eq!(
            g.app
                .world()
                .resource::<Village>()
                .progress
                .gathering_delivery
                .as_ref()
                .unwrap()
                .spent_after,
            spent
        );
        assert!(
            simulation::view(g.app.world().resource::<Village>())["materials"]
                .as_array()
                .unwrap()
                .iter()
                .all(|m| m["difference"] == 0.)
        );
        checkpoint(&mut g);
    }
    #[test]
    fn delivered_portions_wait_for_three_available_neighbours_and_are_not_ordinary_snacks() {
        let mut g = scene();
        assert_eq!(g.host_gathering(), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            stage_table(&mut v);
            assert!(!advance(&mut v, 0b00011));
            assert_eq!(active(&v).unwrap().phase, Phase::Ready);
            let table = food::pantry(&v, 0).unwrap();
            assert_eq!(food::available(&v, table, MEALS, None), 0);
            assert_eq!(economy::free(&v, MEALS), 5);
        }
        checkpoint(&mut g);
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            assert!(advance(&mut v, 0b00111));
            assert_eq!(v.progress.gathering_until, v.minutes + 120.);
            assert_eq!(v.meals, 10);
            v.progress.attended = 0b00011;
            advance(&mut v, 0b00111);
            assert_eq!(v.meals, 10);
            v.progress.attended = 0b00111;
            advance(&mut v, 0b00111);
            assert_eq!(v.meals, 5);
            assert_eq!(v.supplies.portions_eaten, 5);
            advance(&mut v, 0b00111);
            assert_eq!(v.meals, 5);
        }
        checkpoint(&mut g);
    }
    #[test]
    fn a_welcome_supper_uses_local_meals_while_an_ordinary_pantry_delivery_is_pending() {
        let mut g = Game::new();
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.arrived = true;
            v.minutes = 540.;
            v.progress.completed = [true; 4];
            v.production.targets = [0; economy::COUNT];
            crate::water::fixture_fresh(&mut v, 40.);
            logistics::fixture_stock(&mut v, MEALS, 10);
        }
        assert_eq!(g.place("kitchen", 6, 6), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            logistics::fixture_finish(&mut v, 0);
            let s = v.logistics.as_mut().unwrap();
            s.stores
                .iter_mut()
                .find(|p| p.owner == logistics::Owner::Camp)
                .unwrap()
                .items[MEALS] -= 5;
            s.stores
                .iter_mut()
                .find(|p| p.owner == logistics::Owner::Pantry(0))
                .unwrap()
                .items[MEALS] += 5;
            logistics::sync_totals(&mut v);
            freshness::fixture_reseed(&mut v);
        }
        for mut r in g
            .app
            .world_mut()
            .query::<&mut Resident>()
            .iter_mut(g.app.world_mut())
        {
            r.task = "idle".into();
            r.remaining = 0.;
            r.requested = false;
            r.energy = 90.;
            r.hunger = 0.;
            r.social = 90.;
            r.last_meal_slot = 0;
        }
        g.tick(0.25);
        assert!(
            g.app
                .world()
                .resource::<Village>()
                .logistics
                .as_ref()
                .unwrap()
                .shipments
                .iter()
                .any(|h| h.material == MEALS)
        );
        assert_eq!(g.host_gathering(), "ok");
        assert_eq!(
            held(
                g.app.world().resource::<Village>(),
                active(g.app.world().resource::<Village>()).unwrap().store,
                MEALS
            ),
            5
        );
        g.tick(0.25);
        assert_eq!(
            active(g.app.world().resource::<Village>()).unwrap().phase,
            Phase::Serving
        );
        checkpoint(&mut g);
    }
    #[test]
    fn multiple_squares_do_not_split_invitees_between_different_tables() {
        let mut g = scene();
        assert_eq!(g.place("square", 16, 16), "ok");
        logistics::fixture_finish(&mut g.app.world_mut().resource_mut::<Village>(), 1);
        assert_eq!(g.host_gathering(), "ok");
        fixture_table(&mut g.app.world_mut().resource_mut::<Village>());
        g.tick(0.25);
        let mut joined = 0;
        for r in g.app.world_mut().query::<&Resident>().iter(g.app.world()) {
            if r.task == "gathering" {
                joined += 1;
                assert_eq!(r.activity_building, Some(0));
            }
        }
        assert_eq!(joined, 5);
        checkpoint(&mut g);
    }
    #[test]
    fn cancelling_a_carried_party_load_keeps_every_unserved_meal_recoverable() {
        let mut g = scene();
        assert_eq!(g.host_gathering(), "ok");
        for _ in 0..1200 {
            if g.app
                .world()
                .resource::<Village>()
                .logistics
                .as_ref()
                .unwrap()
                .shipments
                .iter()
                .any(|h| h.carrying && h.material == MEALS)
            {
                break;
            }
            g.tick(0.25);
        }
        let v = g.app.world().resource::<Village>();
        assert!(
            v.logistics
                .as_ref()
                .unwrap()
                .shipments
                .iter()
                .any(|h| h.carrying && h.material == MEALS)
        );
        let owned = v.meals;
        assert_eq!(g.cancel_gathering(), "ok");
        assert_ne!(g.cancel_gathering(), "ok");
        checkpoint(&mut g);
        g.tick(0.25);
        let v = g.app.world().resource::<Village>();
        assert_eq!(v.meals, owned);
        assert_eq!(
            v.progress.gathering_delivery.as_ref().unwrap().phase,
            Phase::Cancelled
        );
        assert!(
            v.logistics
                .as_ref()
                .unwrap()
                .stores
                .iter()
                .any(|p| p.owner == logistics::Owner::Ground && p.items[MEALS] > 0)
        );
        checkpoint(&mut g);
    }
    #[test]
    fn dusk_cancellation_releases_the_table_without_consuming_or_refunding_meals() {
        let mut g = scene();
        assert_eq!(g.host_gathering(), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            stage_table(&mut v);
            v.minutes = 2520.;
            advance(&mut v, 31);
            assert_eq!(v.meals, 10);
            assert_eq!(
                v.progress.gathering_delivery.as_ref().unwrap().phase,
                Phase::Cancelled
            );
            assert_eq!(
                food::available(&v, food::pantry(&v, 0).unwrap(), MEALS, None),
                5
            );
        }
        checkpoint(&mut g);
    }
    #[test]
    fn late_preparation_rests_overnight_then_delivers_within_the_next_working_day() {
        let mut g = scene();
        g.app.world_mut().resource_mut::<Village>().minutes = 945.;
        assert_eq!(g.host_gathering(), "ok");
        assert_eq!(
            active(g.app.world().resource::<Village>())
                .unwrap()
                .deadline,
            2520.
        );
        let mut crossed_night = false;
        for frame in 0..6000 {
            let v = g.app.world().resource::<Village>();
            let p = v.progress.gathering_delivery.as_ref().unwrap();
            crossed_night |= v.minutes >= 1440. && p.phase == Phase::Preparing;
            if p.phase == Phase::Complete {
                break;
            }
            if frame % 80 == 0 {
                checkpoint(&mut g);
            }
            g.tick(0.25);
        }
        let v = g.app.world().resource::<Village>();
        let p = v.progress.gathering_delivery.as_ref().unwrap();
        assert!(crossed_night);
        assert_eq!(p.phase, Phase::Complete);
        assert_eq!((p.started.unwrap() / 1440.).floor(), 1.);
        assert_eq!(v.progress.gathering_day, 1);
        assert_ne!(
            g.host_gathering(),
            "ok",
            "Only one gathering starts on the same day"
        );
        checkpoint(&mut g);
    }
    #[test]
    fn a_carrier_can_use_reachable_portions_when_the_preferred_store_is_enclosed() {
        let mut g = Game::new();
        g.start_mode("sandbox");
        assert_eq!(g.place("warehouse", 15, 18), "ok");
        for x in [12, 14, 16, 18] {
            for y in [15, 21] {
                assert_eq!(g.place("home", x, y), "ok");
            }
        }
        for x in [12, 18] {
            for y in [17, 19] {
                assert_eq!(g.place("home", x, y), "ok");
            }
        }
        assert_eq!(g.place("square", 19, 25), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            v.mode = modes::Mode::Story;
            v.minutes = 540.;
            v.arrived = true;
            v.progress.completed = [true; 4];
            v.production.targets = [0; economy::COUNT];
            logistics::fixture_stock(&mut v, MEALS, 10);
            let s = v.logistics.as_mut().unwrap();
            s.stores
                .iter_mut()
                .find(|p| p.owner == logistics::Owner::Camp)
                .unwrap()
                .items[MEALS] -= 5;
            s.stores
                .iter_mut()
                .find(|p| p.owner == logistics::Owner::Warehouse(0))
                .unwrap()
                .items[MEALS] += 5;
            logistics::sync_totals(&mut v);
            freshness::fixture_reseed(&mut v);
        }
        for mut r in g
            .app
            .world_mut()
            .query::<&mut Resident>()
            .iter_mut(g.app.world_mut())
        {
            r.task = "idle".into();
            r.remaining = 0.;
            r.requested = false;
            r.hunger = 0.;
            r.energy = 90.;
            r.social = 90.;
        }
        assert_eq!(g.host_gathering(), "ok");
        let v = g.app.world().resource::<Village>();
        let warehouse = v
            .logistics
            .as_ref()
            .unwrap()
            .stores
            .iter()
            .find(|p| p.owner == logistics::Owner::Warehouse(0))
            .unwrap()
            .id;
        assert_eq!(held(v, warehouse, MEALS), 5);
        let mut used_camp = false;
        for frame in 0..3000 {
            let v = g.app.world().resource::<Village>();
            used_camp |= v.logistics.as_ref().unwrap().shipments.iter().any(|h| {
                h.material == MEALS
                    && h.carrying
                    && v.logistics
                        .as_ref()
                        .unwrap()
                        .stores
                        .iter()
                        .any(|p| p.id == h.from && p.owner == logistics::Owner::Camp)
            });
            if v.progress.gathering_delivery.as_ref().unwrap().phase == Phase::Serving {
                break;
            }
            if frame % 80 == 0 {
                checkpoint(&mut g);
            }
            g.tick(0.25);
        }
        assert!(used_camp);
        assert_eq!(
            g.app
                .world()
                .resource::<Village>()
                .progress
                .gathering_delivery
                .as_ref()
                .unwrap()
                .phase,
            Phase::Serving
        );
        checkpoint(&mut g);
    }
    #[test]
    fn moving_the_square_cancels_preparation_and_evacuates_its_meals_before_packing() {
        let mut g = scene();
        assert_eq!(g.host_gathering(), "ok");
        stage_table(&mut g.app.world_mut().resource_mut::<Village>());
        assert_eq!(g.queue_building_work(0, "move", 16, 6), "ok");
        {
            let mut v = g.app.world_mut().resource_mut::<Village>();
            advance(&mut v, 31);
            assert_eq!(v.meals, 10);
            assert_eq!(
                v.progress.gathering_delivery.as_ref().unwrap().phase,
                Phase::Cancelled
            );
            assert!(!building_work::work(&mut v, 0, 1000.));
            assert_eq!(v.buildings[0].x, 6);
        }
        checkpoint(&mut g);
    }
    #[test]
    fn malformed_table_references_and_unpaid_serving_are_rejected_atomically() {
        let mut g = scene();
        assert_eq!(g.host_gathering(), "ok");
        let saved = g.snapshot();
        for (field, value) in [
            ("store", serde_json::json!(1)),
            ("building", serde_json::json!(999)),
            ("spent_after", serde_json::json!(5)),
            ("invited", serde_json::json!(3)),
        ] {
            let mut bad: serde_json::Value = serde_json::from_str(&saved).unwrap();
            bad["village"]["progress"]["gathering_delivery"][field] = value;
            assert!(!g.restore(&bad.to_string()), "accepted forged {field}");
            assert_eq!(g.snapshot(), saved);
        }
    }
}
