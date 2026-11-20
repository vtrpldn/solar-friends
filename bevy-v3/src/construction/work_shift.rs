use crate::{
    stock::CashKind,
    town_work::{Commute, JOBS, RETURN_FARE, Shift},
    weather::{DAY, HOUR, game_hour},
};

use super::{resident_work::NAMES, *};

const BUS_STOP: IVec2 = IVec2::new(29, -31);

fn shift_day(seconds: f64) -> u64 {
    (seconds / DAY + 9.0 / 24.0).floor() as u64
}

fn shift_morning(seconds: f64, last_day: Option<u64>) -> Option<u64> {
    let day = shift_day(seconds);
    ((8.0..11.0).contains(&game_hour(seconds)) && last_day != Some(day)).then_some(day)
}

impl Construction {
    pub(super) fn booked_shift_due(&self, index: usize, seconds: f64) -> bool {
        let work = &self.residents[index].town_work;
        work.booked && shift_morning(seconds, work.last_day).is_some()
    }

    fn shift_departure_blocker(&self, index: usize) -> Option<&'static str> {
        let worker = &self.residents[index];
        if self.driver_booked(index) {
            return Some("Finishing a town trip");
        }
        if worker.health.energy < 65.0
            || worker
                .health
                .task
                .as_ref()
                .is_some_and(|task| matches!(task.kind, Need::Rest | Need::Sleep))
        {
            return Some("Needs to rest");
        }
        if worker.health.task.is_some()
            || [Need::Bladder, Need::Bowels, Need::Hydration]
                .iter()
                .any(|kind| worker.health.levels[*kind as usize] < 20.0)
        {
            return Some("Taking care of personal needs");
        }
        let finishing_work = self.working_water(index)
            || self.working_upkeep(index)
            || worker
                .assignment
                .as_ref()
                .is_some_and(|job| job.activity == Activity::Carry)
            || self.gathering.workers_at_site(index)
            || self.production.has_worker(index)
            || self.farming.has_worker(index)
            || self.working_change(index);
        finishing_work.then_some("Finishing village work")
    }

    pub(crate) fn shift_action(&self, index: usize, repeat: bool) -> Option<&'static str> {
        let work = &self.residents[index].town_work;
        if repeat {
            Some(if work.repeating {
                "Stop weekday shifts"
            } else {
                "Repeat weekday shifts"
            })
        } else if work.active() {
            None
        } else if work.booked {
            Some("Cancel day shift")
        } else {
            Some("Book one day shift")
        }
    }

    pub fn toggle_shift(&mut self, index: usize) {
        let resident = &mut self.residents[index];
        if !resident.town_work.active() {
            resident.town_work.booked = !resident.town_work.booked;
            resident.town_work.route_blocked = false;
        }
    }

    pub fn toggle_weekday_shift(&mut self, index: usize) {
        let resident = &mut self.residents[index];
        resident.town_work.repeating = !resident.town_work.repeating;
    }

    pub fn away_for_work(&self, index: usize) -> bool {
        self.residents[index].town_work.away()
    }

    pub fn finance_summary(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        selected: usize,
        clock: TownClock,
    ) -> String {
        if stock.sandbox {
            return "Sandbox supplies and funds are unlimited. Purchases are not tracked.".into();
        }
        let cash = if self.supplier_construction {
            self.protected_freight_cash(catalog, clock)
                .unwrap_or(stock.balance())
        } else {
            self.market.committed_fares()
        };
        let status = stock.finance_summary(cash, self.supplier_construction);
        let (pending_sales, expected_cents) = self
            .trade
            .orders
            .iter()
            .filter(|order| !order.buying && !order.settled && !order.spoiled)
            .fold((0, 0u64), |(count, cents), order| {
                (count + 1, cents.saturating_add(order.cents))
            });
        let receipts = self.trade.receipts;
        let mut summary = format!(
            "{status}\nTown sales · {receipts} paid · {pending_sales} pending (R${:.2} before fuel)",
            expected_cents as f64 / 100.0,
        );
        summary.push_str("\n\n");
        summary.push_str(&self.resident_shift_summary(selected, clock.seconds));
        summary.push_str("\n1–5 Resident · T Book/cancel day shift · Y Toggle weekdays");
        summary
    }

    pub(crate) fn resident_shift_summary(&self, selected: usize, seconds: f64) -> String {
        let worker = &self.residents[selected];
        let work = &worker.town_work;
        let (job, wage) = JOBS[selected];
        let shift_status = if work.active() {
            if work.route_blocked {
                "No walking route back to camp".into()
            } else if worker.waiting_for_route() {
                format!("{} · Waiting for access", work.status())
            } else {
                work.status().into()
            }
        } else {
            let when = if game_hour(seconds) >= 11.0 || work.last_day == Some(shift_day(seconds)) {
                "tomorrow"
            } else {
                "today"
            };
            if work.booked {
                let blocker = self
                    .booked_shift_due(selected, seconds)
                    .then(|| {
                        self.shift_departure_blocker(selected).or(work
                            .route_blocked
                            .then_some("No walking route to the bus stop"))
                    })
                    .flatten();
                if let Some(blocker) = blocker {
                    format!("Booked for {when}, 08:00–11:00 · {blocker}")
                } else {
                    format!("Booked for {when}, 08:00–11:00")
                }
            } else {
                format!("Book for {when}, 08:00–11:00")
            }
        };
        let (hours, pay) = if work.shift.as_ref().is_some_and(|shift| !shift.full_day) {
            (4, wage)
        } else {
            (8, wage * 2)
        };
        let weekdays = if work.repeating { "on" } else { "off" };
        format!(
            "{} · {job}\n{shift_status} · {hours}h shift · R${} after bus fare\nRepeat 4h shifts on weekdays · {weekdays} · R${} after bus fare",
            NAMES[selected],
            pay - RETURN_FARE / 100,
            wage - RETURN_FARE / 100,
        )
    }

    pub(super) fn tick_shifts(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        site: ConstructionSite,
        clock: TownClock,
        dt: f32,
    ) {
        if stock.sandbox {
            return;
        }
        for (index, &(job_name, wages)) in JOBS.iter().enumerate() {
            let worker = &mut self.residents[index];
            worker.town_work.route_blocked = false;
            if let Some(mut shift) = worker.town_work.shift.take() {
                match shift.phase {
                    Commute::Outbound => {
                        worker.move_along_path(dt, false);
                        if worker.path.is_empty() {
                            let hours = if shift.full_day { 8.0 } else { 4.0 };
                            shift.until =
                                clock.seconds + hours * HOUR + trip_seconds(clock.round_trip_km);
                            shift.phase = Commute::Away;
                        }
                    }
                    Commute::Away => {
                        worker.health.energy =
                            (worker.health.energy - f64::from(dt) * 0.06).max(25.0);
                        for need in [Need::Hunger, Need::Bladder, Need::Bowels, Need::Hydration] {
                            worker.health.levels[need as usize] =
                                worker.health.levels[need as usize].max(55.0);
                        }
                        if clock.seconds >= shift.until {
                            let from = worker.position;
                            if let Some(path) =
                                self.resident_route(catalog, site, from, SUPPLY_SPOTS[index])
                            {
                                self.residents[index].path = path;
                                shift.phase = Commute::Inbound;
                            } else {
                                self.residents[index].town_work.route_blocked = true;
                            }
                        }
                    }
                    Commute::Inbound => {
                        worker.move_along_path(dt, false);
                        if worker.path.is_empty() {
                            let gross = wages * if shift.full_day { 200 } else { 100 };
                            let paid = gross - if shift.fare_due { RETURN_FARE } else { 0 };
                            stock.credit(paid, CashKind::TownWages);
                            self.status = format!(
                                "Returned from {job_name}; wages R${:.2}.",
                                paid as f64 / 100.0
                            );
                            continue;
                        }
                    }
                }
                self.residents[index].town_work.shift = Some(shift);
                continue;
            }

            let Some(day) = shift_morning(clock.seconds, worker.town_work.last_day) else {
                continue;
            };
            let full_day = worker.town_work.booked;
            let from = worker.position;
            if !(full_day || worker.town_work.repeating && day % 7 < 5)
                || self.shift_departure_blocker(index).is_some()
            {
                continue;
            }
            let Some(path) = self.resident_route(catalog, site, from, BUS_STOP) else {
                self.residents[index].town_work.route_blocked = true;
                continue;
            };
            let committed = if self.supplier_construction {
                self.protected_freight_cash(catalog, clock)
                    .unwrap_or(stock.balance())
            } else {
                self.market.committed_fares()
            };
            let fare_due = stock.balance().saturating_sub(committed) < RETURN_FARE;
            if !fare_due {
                stock.debit(RETURN_FARE, CashKind::Commuting);
            }
            let worker = &mut self.residents[index];
            worker.path = path;
            worker.assignment = None;
            worker.leisure.visit = None;
            worker.town_work.booked = false;
            worker.town_work.last_day = Some(day);
            worker.town_work.shift = Some(Shift {
                phase: Commute::Outbound,
                full_day,
                fare_due,
                until: 0.0,
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::setup::WorldSetup;

    #[test]
    fn bus_fare_is_deducted_from_wages_when_freight_needs_the_cash() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let terrain = setup.terrain();
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::splat(36),
        };
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: setup.round_trip_km(),
        };
        let mut village = Construction::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut plan = village.proposed_site(&catalog, "well", IVec2::new(45, 36));
        Construction::reserve_project(
            &mut village.market,
            &mut stock,
            &catalog,
            &mut plan,
            clock,
            false,
        )
        .unwrap();
        village.plans.push(plan);
        village.toggle_supplier_construction();
        let protected = village.protected_freight_cash(&catalog, clock).unwrap();
        stock.debit(stock.balance() - protected, CashKind::Materials);
        village.toggle_shift(0);
        village.residents[0].health.energy = 85.0;

        village.tick_shifts(&catalog, &mut stock, site, clock, 1.0);

        assert!(
            village.residents[0]
                .town_work
                .shift
                .as_ref()
                .unwrap()
                .fare_due
        );
        assert_eq!(stock.balance(), protected);
    }

    #[test]
    fn wages_settle_on_return_and_can_cover_the_bus_fare() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let terrain = setup.terrain();
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::new(36, 36),
        };
        let mut construction = Construction::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let clock = |seconds| TownClock {
            seconds,
            round_trip_km: setup.round_trip_km(),
        };
        stock.cash = 0;
        assert_eq!(
            construction.shift_action(0, false),
            Some("Book one day shift")
        );
        construction.toggle_shift(0);
        assert_eq!(
            construction.shift_action(0, false),
            Some("Cancel day shift")
        );
        assert!(
            construction
                .finance_summary(&catalog, &stock, 0, clock(0.0))
                .contains("Booked for today")
        );
        assert!(
            construction
                .finance_summary(&catalog, &stock, 0, clock(HOUR * 3.0))
                .contains("Booked for tomorrow")
        );
        construction.residents[0].health.energy = 60.0;
        assert!(
            construction
                .finance_summary(&catalog, &stock, 0, clock(0.0))
                .contains("Needs to rest")
        );
        construction.tick_shifts(
            &catalog,
            &mut stock,
            site,
            TownClock {
                seconds: 0.0,
                round_trip_km: 12,
            },
            1.0,
        );
        assert!(construction.residents[0].town_work.booked);
        construction.residents[0].health.energy = 85.0;
        let starting_position = construction.residents[0].position;
        construction.residents[0].position = Vec2::splat(-100.0);
        construction.tick_shifts(
            &catalog,
            &mut stock,
            site,
            TownClock {
                seconds: 0.0,
                round_trip_km: 12,
            },
            1.0,
        );
        assert!(
            construction
                .finance_summary(&catalog, &stock, 0, clock(0.0))
                .contains("No walking route")
        );
        assert_eq!(
            construction.lab_stop_reason(crate::construction::LabStop::Blocked, 0.0),
            Some("A job is waiting for access.")
        );
        assert_eq!(stock.balance(), 0);
        construction.residents[0].position = starting_position;
        let mut left_camp = false;
        for seconds in 0..1_500 {
            let clock = TownClock {
                seconds: f64::from(seconds),
                round_trip_km: 12,
            };
            construction.tick_shifts(&catalog, &mut stock, site, clock, 1.0);
            if !construction.residents[0].town_work.active() {
                break;
            }
            left_camp |= construction.away_for_work(0);
            assert_eq!(stock.balance(), 0);
        }
        assert!(left_camp);
        assert!(!construction.residents[0].town_work.route_blocked);
        assert_eq!(stock.balance(), 15_200);
        assert!(construction.residents[0].town_work.last_day.is_some());
    }
}
