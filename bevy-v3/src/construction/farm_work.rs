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
            if !plan.removed
                && plan.work >= definition.work
                && !self.farming.plots.contains_key(&index)
                && let Some(plot) = Plot::new(&plan.key, rotated_size(plan.size, plan.rotation))
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
        ground: ConstructionSite,
        clock: TownClock,
    ) {
        if self.menu || self.production.open || keyboard.just_pressed(KeyCode::KeyB) {
            self.farming.open = false;
            return;
        }
        let Some(site) = self.production.selected else {
            return;
        };
        if self.changes.contains_key(&site) {
            self.farming.open = false;
            return;
        }
        if !self.farming.plots.contains_key(&site) {
            self.farming.open = false;
            return;
        }
        if keyboard.just_pressed(KeyCode::KeyK) {
            self.farming.open = !self.farming.open;
        }
        if !self.farming.open {
            return;
        }
        if self.plans[site].key == "field"
            && let Some(delta) = field_size_input(keyboard)
        {
            let plan = &self.plans[site];
            let proposed = rotated_size(plan.size, plan.rotation) + delta;
            self.farming.notice =
                match self.resize_field(catalog, ground, site, proposed, stock.sandbox) {
                    Ok(()) => "Field resized.".into(),
                    Err(reason) => reason.into(),
                };
            return;
        }
        let plot = self.farming.plots.get_mut(&site).expect("selected plot");
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
            food_output: None,
            retry: 0.0,
            pickups,
            fare,
        });
        self.farming.notice.clear();
    }

    fn resize_field(
        &mut self,
        catalog: &Catalog,
        ground: ConstructionSite,
        index: usize,
        size: IVec2,
        sandbox: bool,
    ) -> Result<(), &'static str> {
        if !Plot::field_size_valid(size) {
            return Err("Fields must be 2–32 cells on each side.");
        }
        if self.farming.jobs.iter().any(|job| job.site == index) || self.water_job_at(index) {
            return Err("Finish this field’s jobs before resizing.");
        }
        let mut plan = self.plans[index].clone();
        let old_size = plan.size;
        plan.size = rotated_size(size, plan.rotation);
        if let Some(reason) = self.placement_error(
            ground.terrain,
            ground.land,
            ground.camp,
            &plan,
            &catalog.projects["field"],
            (catalog, sandbox, Some(index)),
        ) {
            return Err(reason);
        }
        let change = plan.size - old_size;
        let shift = match plan.rotation {
            0 => change,
            1 => IVec2::new(-change.y, change.x),
            2 => -change,
            _ => IVec2::new(change.y, -change.x),
        };
        let plot = self
            .farming
            .plots
            .get_mut(&index)
            .ok_or("Select a cultivated field.")?;
        plot.resize_field(size, shift)?;
        self.plans[index].size = plan.size;
        self.farming.bed = self.farming.bed.min(plot.beds.len() - 1);
        Ok(())
    }

    pub fn placing_field(&self) -> bool {
        self.selection.as_deref() == Some("field")
    }

    pub fn draw_field_site(
        &self,
        ground: ConstructionSite,
        catalog: &Catalog,
        sandbox: bool,
        corner: IVec2,
        gizmos: &mut Gizmos,
    ) {
        let proposal = Blueprint {
            key: "field".into(),
            position: corner,
            size: rotated_size(self.field_size, self.rotation),
            rotation: self.rotation,
            loads: 0,
            delivered: 0,
            work: 0.0,
            pickups: 0,
            fare: 0,
            removed: false,
            purchase: None,
        };
        let valid = self
            .placement_error(
                ground.terrain,
                ground.land,
                ground.camp,
                &proposal,
                &catalog.projects["field"],
                (catalog, sandbox, None),
            )
            .is_none();
        let tint = if valid {
            Color::srgb_u8(217, 237, 165)
        } else {
            Color::srgb_u8(216, 122, 92)
        };
        let low = world_position(corner.x as f32, corner.y as f32) - Vec2::ONE;
        let high = low + proposal.size.as_vec2() * 2.0;
        let points = [
            low,
            Vec2::new(low.x, high.y),
            high,
            Vec2::new(high.x, low.y),
            low,
        ];
        for line in points.windows(2) {
            let length = line[0].distance(line[1]).ceil() as usize;
            gizmos.linestrip(
                (0..=length).map(|step| {
                    let Vec2 { x, y: z } = line[0].lerp(line[1], step as f32 / length as f32);
                    Vec3::new(x, ground.terrain.height_at(x, z) + 0.1, z)
                }),
                tint,
            );
        }
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
        let plan = &self.plans[site];
        if plan.key == "field" {
            let size = rotated_size(plan.size, plan.rotation);
            label.push_str(&format!(
                "\n{} × {} cells · [ ] Width · Shift [ ] Depth",
                size.x, size.y
            ));
        }
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
            let job = &mut self.farming.jobs[job_index];
            if let Some(lots) = &mut job.food_output
                && !stock.sandbox
            {
                let lost = crate::food::discard_expired(lots, clock);
                stock.record_spoilage(catalog, &lost);
                for (id, lost) in lost {
                    if let Some(quantity) = job.output.get_mut(&id) {
                        *quantity = quantity.saturating_sub(lost);
                    }
                }
            }
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
                    job.food_output =
                        Some(crate::food::fresh(&job.output, clock, &Default::default()));
                    if job.output.is_empty() {
                        self.farming.jobs.remove(job_index);
                    } else {
                        job.phase = FarmPhase::Return;
                        self.residents[index].path = path;
                    }
                }
                FarmPhase::Return => {
                    let units: u64 = job.output.values().map(|v| u64::from(*v)).sum();
                    if self.storage_space(catalog, stock) < units {
                        continue;
                    }
                    if let Some(lots) = &job.food_output {
                        stock.receive_with_lots(&job.output, lots.clone());
                    } else {
                        stock.receive(&job.output);
                    }
                    self.farming.jobs.remove(job_index);
                }
            }
        }
    }

    fn try_farm_worker(&mut self, job: usize, catalog: &Catalog, site: ConstructionSite) {
        for (index, worker) in self.residents.iter().enumerate() {
            if worker.health.task.is_some()
                || worker.town_work.active()
                || worker.assignment.is_some()
                || self.gathering.workers_at_site(index)
                || self.production.has_worker(index)
                || self.farming.has_worker(index)
                || self.working_change(index)
                || self.working_water(index)
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

#[cfg(test)]
mod resize_tests {
    use super::*;
    use crate::farming::{Crop, Stage};

    #[test]
    fn resizing_keeps_planted_beds_on_the_same_ground() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let camp = IVec2::new(36, 36);
        let terrain = setup.terrain().with_camp(camp);
        let land = Land::default();
        let ground = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp,
        };
        for rotation in 0..4 {
            let mut stock = Stock::for_start(&setup, &catalog);
            let mut village = Construction {
                selection: Some("field".into()),
                rotation,
                ..default()
            };
            let corner = IVec2::new(44, 36);
            village.plan(
                &catalog,
                &mut stock,
                ground,
                corner,
                TownClock {
                    seconds: 0.0,
                    round_trip_km: 12,
                },
            );
            assert_eq!(village.plans[0].work, catalog.projects["field"].work);
            let planted = &mut village.farming.plots.get_mut(&0).unwrap().beds[0];
            planted.stage = Stage::Growing;
            planted.crop = Crop::Beans;
            let offset = planted.offset;
            let angle = f32::from(rotation) * std::f32::consts::FRAC_PI_2;
            let orientation = Mat2::from_angle(-angle);
            let center = |dimensions: IVec2, offset: Vec2| {
                (dimensions.as_vec2() - Vec2::ONE) + orientation * offset
            };
            let old_world = center(IVec2::splat(2), offset);
            village
                .resize_field(&catalog, ground, 0, IVec2::new(4, 5), false)
                .unwrap();
            let new_size = village.plans[0].size;
            let plot = &mut village.farming.plots.get_mut(&0).unwrap();
            assert_eq!(plot.beds.len(), 16);
            let bed = plot
                .beds
                .iter()
                .find(|bed| bed.stage == Stage::Growing)
                .unwrap();
            assert!(bed.crop == Crop::Beans);
            assert!(center(new_size, bed.offset).abs_diff_eq(old_world, 1e-5));

            // Put a standing crop in a bed which did not exist in the original footprint.
            let extra = plot
                .beds
                .iter_mut()
                .find(|bed| {
                    bed.stage == Stage::Unprepared
                        && center(new_size, bed.offset).distance(old_world) > 4.0
                })
                .unwrap();
            extra.stage = Stage::Growing;
            assert!(
                village
                    .resize_field(&catalog, ground, 0, IVec2::splat(2), false)
                    .is_err()
            );
            assert_eq!(village.plans[0].size, new_size);
            let json = serde_json::to_string(&village).unwrap();
            let saved: Construction = serde_json::from_str(&json).unwrap();
            assert!(saved.valid_save(&catalog, &stock));
        }
    }
}
