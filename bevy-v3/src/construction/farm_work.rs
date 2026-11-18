use super::{resident_work::approach_points, *};
use crate::{
    farming::{CropClimate, FarmAction, FarmJob, FarmPhase, Plot},
    setup::WorldSetup,
    weather::{growing_season, weather_at},
};

impl Construction {
    pub fn tick_crops(&mut self, catalog: &Catalog, setup: &WorldSetup, clock: f64, dt: f64) {
        let weather = weather_at(clock, setup.biome(), setup.seed());
        let season = growing_season(clock, setup.biome());
        for (index, plan) in self.plans.iter().enumerate() {
            let definition = &catalog.projects[&plan.key];
            if plan.work >= definition.work
                && !self.farming.plots.contains_key(&index)
                && let Some(plot) = Plot::new(&plan.key, IVec2::from_array(definition.size))
            {
                self.farming.plots.insert(index, plot);
            }
        }
        for (&index, plot) in &mut self.farming.plots {
            let sheltered = self.plans[index].key == "greenhouse";
            let climate = CropClimate {
                clock,
                dt,
                rain: weather.rain,
                season,
                sheltered,
                sandbox: setup.mode == crate::setup::Mode::Sandbox,
            };
            for bed in &mut plot.beds {
                bed.tick(climate, |amount| self.utilities.irrigate(index, amount));
            }
        }
    }

    pub fn farm_input(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        keyboard: &ButtonInput<KeyCode>,
        clock: TownClock,
    ) {
        if self.menu || self.production.open || keyboard.just_pressed(KeyCode::KeyB) {
            self.farming.open = false;
            return;
        }
        let Some(site) = self.production.selected else {
            return;
        };
        let Some(plot) = self.farming.plots.get_mut(&site) else {
            self.farming.open = false;
            return;
        };
        if keyboard.just_pressed(KeyCode::KeyK) {
            self.farming.open = !self.farming.open;
        }
        if !self.farming.open {
            return;
        }
        if keyboard.just_pressed(KeyCode::Tab) {
            self.farming.bed = (self.farming.bed + 1) % plot.beds.len();
            self.farming.notice.clear();
        }
        let index = self.farming.bed.min(plot.beds.len() - 1);
        let bed = &mut plot.beds[index];
        if keyboard.just_pressed(KeyCode::KeyT) {
            bed.irrigation = !bed.irrigation;
        }
        if keyboard.just_pressed(KeyCode::KeyZ) {
            bed.collect_residues = !bed.collect_residues;
        }
        if self
            .farming
            .jobs
            .iter()
            .any(|job| job.site == site && job.bed == index)
        {
            return;
        }
        if bed.editable() {
            if keyboard.just_pressed(KeyCode::KeyX) {
                bed.crop = bed.crop.next();
            }
            if keyboard.just_pressed(KeyCode::KeyY) {
                bed.density = if bed.density == 1.5 {
                    0.5
                } else {
                    bed.density + 0.5
                };
            }
        }
        let keys = [
            FarmAction::Prepare,
            FarmAction::Plant,
            FarmAction::Harvest,
            FarmAction::Clear,
            FarmAction::Amend,
            FarmAction::Collect,
        ];
        let Some(action) = PAGE_KEYS
            .iter()
            .take(keys.len())
            .position(|key| keyboard.just_pressed(*key))
            .map(|index| keys[index])
        else {
            return;
        };
        let (inputs, required) = match bed.requirements(action, clock.seconds) {
            Ok(requirements) => requirements,
            Err(error) => {
                self.farming.notice = error.into();
                return;
            }
        };
        let mut pickups = 0;
        let mut fare = 0;
        if !stock.sandbox {
            if stock.missing(&inputs).is_some() && action != FarmAction::Plant {
                self.farming.notice = "Not enough compost in supplies.".into();
                return;
            }
            let quote =
                match self
                    .market
                    .quote(catalog, &inputs, stock, clock.seconds, clock.round_trip_km)
                {
                    Ok(quote) => quote,
                    Err(error) => {
                        self.farming.notice = error;
                        return;
                    }
                };
            pickups = quote.trips;
            fare = quote.fare;
            self.market.reserve(stock, &inputs, &quote);
        }
        self.farming.jobs.push(FarmJob {
            site,
            bed: index,
            action,
            worker: None,
            phase: FarmPhase::Pickup,
            work: 0.0,
            required,
            inputs,
            output: Default::default(),
            retry: 0.0,
            pickups,
            fare,
        });
        self.farming.notice.clear();
    }

    pub fn farm_status(&self, clock: f64) -> Option<String> {
        let site = self.production.selected?;
        let plot = self.farming.plots.get(&site)?;
        if !self.farming.open {
            return Some("K Cultivation".into());
        }
        let index = self.farming.bed.min(plot.beds.len() - 1);
        let bed = &plot.beds[index];
        let irrigation = if bed.irrigation {
            "Irrigated"
        } else {
            "Rain-fed"
        };
        let residues = if bed.collect_residues {
            "Collect"
        } else {
            "Leave"
        };
        let mut label = format!(
            "Bed {}/{} · {} · {} ({:.0}%)\nMoisture {:.0}% · Fertility {:.0}% · {:.1} kg harvest estimate\nDensity {:.1}× · {} · {} residues",
            index + 1,
            plot.beds.len(),
            bed.crop.label(),
            bed.stage.label(),
            bed.growth * 100.0,
            bed.moisture * 100.0,
            bed.fertility * 100.0,
            bed.yield_kg(clock),
            bed.density,
            irrigation,
            residues,
        );
        if let Some(job) = self
            .farming
            .jobs
            .iter()
            .find(|job| job.site == site && job.bed == index)
        {
            if job.pickups > 0 {
                label.push_str("\nWaiting for seed pickup");
            } else {
                label.push_str(&format!(
                    "\nWork queued · {:.0}%",
                    job.work / job.required * 100.0
                ));
            }
        } else {
            label.push_str("\n1 Prepare · 2 Plant · 3 Harvest · 4 Clear · 5 Amend · 6 Collect");
        }
        label.push_str("\nTab Bed · X Crop · Y Density · T Water · Z Residues · K Close");
        if !self.farming.notice.is_empty() {
            label.push('\n');
            label.push_str(&self.farming.notice);
        }
        Some(label)
    }

    pub(super) fn tick_farm_jobs(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        site: ConstructionSite,
        clock: f64,
        dt: f32,
    ) {
        for job_index in (0..self.farming.jobs.len()).rev() {
            let job = &self.farming.jobs[job_index];
            if clock < job.retry || job.pickups > 0 {
                continue;
            }
            let Some(index) = job.worker else {
                self.try_farm_worker(job_index, catalog, site);
                self.farming.jobs[job_index].retry = clock + 1.0;
                continue;
            };
            let worker = &mut self.residents[index];
            let phase = job.phase;
            worker.move_along_path(dt, matches!(phase, FarmPhase::Walk | FarmPhase::Return));
            if !worker.path.is_empty() {
                continue;
            }
            let position = worker.position;
            let job = &self.farming.jobs[job_index];
            let parcel = &self.plans[job.site];
            match phase {
                FarmPhase::Pickup => {
                    let Some(path) = approach_points(parcel.position, parcel.size, position)
                        .into_iter()
                        .find_map(|cell| self.resident_route(catalog, site, position, cell))
                    else {
                        self.farming.jobs[job_index].retry = clock + 5.0;
                        continue;
                    };
                    self.residents[index].path = path;
                    self.farming.jobs[job_index].phase = FarmPhase::Walk;
                }
                FarmPhase::Walk => self.farming.jobs[job_index].phase = FarmPhase::Work,
                FarmPhase::Work => {
                    let job = &mut self.farming.jobs[job_index];
                    job.work = (job.work + f64::from(dt)).min(job.required);
                    if job.work < job.required {
                        continue;
                    }
                    let Some(path) =
                        self.resident_route(catalog, site, position, SUPPLY_SPOTS[index])
                    else {
                        self.farming.jobs[job_index].retry = clock + 5.0;
                        continue;
                    };
                    let job = &mut self.farming.jobs[job_index];
                    let plot = self
                        .farming
                        .plots
                        .get_mut(&job.site)
                        .expect("farm job plot");
                    job.output = plot.finish(job, clock, stock.sandbox);
                    if job.output.is_empty() {
                        self.farming.jobs.remove(job_index);
                    } else {
                        job.phase = FarmPhase::Return;
                        self.residents[index].path = path;
                    }
                }
                FarmPhase::Return => {
                    stock.receive(&job.output);
                    self.farming.jobs.remove(job_index);
                }
            }
        }
    }

    fn try_farm_worker(&mut self, job: usize, catalog: &Catalog, site: ConstructionSite) {
        for (index, worker) in self.residents.iter().enumerate() {
            if worker.health.task.is_some()
                || worker.assignment.is_some()
                || self.gathering.workers_at_site(index)
                || self.production.has_worker(index)
                || self.farming.has_worker(index)
                || self.trip.as_ref().is_some_and(|trip| trip.driver == index)
            {
                continue;
            }
            let Some(path) =
                self.resident_route(catalog, site, worker.position, SUPPLY_SPOTS[index])
            else {
                continue;
            };
            self.farming.jobs[job].worker = Some(index);
            self.residents[index].path = path;
            break;
        }
    }
}
