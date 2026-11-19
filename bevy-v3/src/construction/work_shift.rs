use crate::{
    stock::CashKind,
    town_work::{Commute, JOBS, RETURN_FARE, Shift},
    weather::{DAY, HOUR, game_hour},
};

use super::*;

const BUS_STOP: IVec2 = IVec2::new(29, -31);

fn shift_morning(seconds: f64, last_day: Option<u64>) -> Option<u64> {
    let day = (seconds / DAY + 9.0 / 24.0).floor() as u64;
    ((8.0..11.0).contains(&game_hour(seconds)) && last_day != Some(day)).then_some(day)
}

impl Construction {
    pub(super) fn booked_shift_due(&self, index: usize, seconds: f64) -> bool {
        let work = &self.residents[index].town_work;
        work.booked && shift_morning(seconds, work.last_day).is_some()
    }

    pub fn toggle_shift(&mut self, index: usize) {
        let resident = &mut self.residents[index];
        if !resident.town_work.active() {
            resident.town_work.booked = !resident.town_work.booked;
        }
    }

    pub fn toggle_weekday_shift(&mut self, index: usize) {
        let resident = &mut self.residents[index];
        resident.town_work.repeating = !resident.town_work.repeating;
    }

    pub fn away_for_work(&self, index: usize) -> bool {
        self.residents[index].town_work.away()
    }

    pub fn finance_summary(&self, stock: &Stock, selected: usize) -> String {
        let status = stock.finance_summary(self.market.committed_fares());
        let (pending_sales, expected_cents) = self
            .trade
            .orders
            .iter()
            .filter(|order| !order.buying && !order.settled && !order.spoiled)
            .fold((0, 0u64), |(count, cents), order| {
                (count + 1, cents.saturating_add(order.cents))
            });
        let receipts = self.trade.receipts;
        let names = ["Iara", "Bento", "Luz", "Cauã", "Nina"];
        let worker = &self.residents[selected];
        let (job, wage) = JOBS[selected];
        format!(
            "{status}\nTown sales · {receipts} paid · {pending_sales} pending (R${:.2} before fuel)\n\n{} · {job}\n{} · Day shift R${} after bus fare\n1–5 Resident · T Book/cancel day shift · Y Toggle weekdays",
            expected_cents as f64 / 100.0,
            names[selected],
            worker.town_work.status(),
            wage * 2 - 8
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
            let unavailable = self.driver_booked(index)
                || self.working_water(index)
                || self.working_upkeep(index);
            let worker = &mut self.residents[index];
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
            if !(worker.town_work.booked || worker.town_work.repeating && day % 7 < 5)
                || worker.health.energy < 65.0
                || worker.health.task.is_some()
                || unavailable
                || [Need::Bladder, Need::Bowels, Need::Hydration]
                    .iter()
                    .any(|kind| worker.health.levels[*kind as usize] < 20.0)
                || worker
                    .assignment
                    .as_ref()
                    .is_some_and(|job| job.activity == Activity::Carry)
                || self.gathering.workers_at_site(index)
                || self.production.has_worker(index)
                || self.farming.has_worker(index)
                || self.changes.values().any(|job| job.worker == Some(index))
            {
                continue;
            }
            let from = worker.position;
            let full_day = worker.town_work.booked;
            let Some(path) = self.resident_route(catalog, site, from, BUS_STOP) else {
                continue;
            };
            let fare_due = stock
                .balance()
                .saturating_sub(self.market.committed_fares())
                < RETURN_FARE;
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
        stock.cash = 0;
        construction.toggle_shift(0);
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
        assert_eq!(stock.balance(), 15_200);
        assert!(construction.residents[0].town_work.last_day.is_some());
    }
}
