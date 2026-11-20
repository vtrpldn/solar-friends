use super::*;
use crate::{
    farming::{CropClimate, FarmAction, FarmJob, FarmPhase, Plot, Stage},
    setup::WorldSetup,
    weather::{HOUR, growing_season, step_weather},
};

#[derive(Clone, Copy)]
pub(crate) enum FarmControl {
    NextBed,
    WholePlot,
    Irrigation,
    Residues,
    Crop,
    Density,
    Work(FarmAction),
}

fn work_priority(action: FarmAction) -> u8 {
    match action {
        FarmAction::Harvest => 0,
        FarmAction::Plant => 1,
        FarmAction::Clear | FarmAction::Amend | FarmAction::Collect => 2,
        FarmAction::Prepare => 3,
    }
}

impl Construction {
    pub fn advance_milestones(
        &self,
        catalog: &Catalog,
        setup: &WorldSetup,
        clock: f64,
        days: f64,
    ) -> String {
        use std::fmt::Write;
        if setup.mode == crate::setup::Mode::Sandbox {
            return String::new();
        }
        let season = growing_season(clock, setup.biome());
        let mut events = Vec::new();
        for (&site, plot) in &self.farming.plots {
            let project = &self.plans[site];
            let rate = if project.key == "greenhouse" {
                1.0
            } else {
                season
            };
            for (index, bed) in plot.beds.iter().enumerate() {
                if let Some(remaining) = bed.harvest_forecast(clock, rate) {
                    let name = &catalog.projects[&project.key].name;
                    events.push((
                        remaining,
                        format!(
                            "{} · {name} #{} bed {} ready to harvest",
                            bed.crop.label(),
                            site + 1,
                            index + 1
                        ),
                        if remaining == 0.0 {
                            "Queue harvesting before advancing time."
                        } else {
                            "Estimated from current soil and seasonal conditions. Residents still need to harvest."
                        },
                    ));
                }
            }
        }
        let default_soil = crate::production::growth::Ground::default();
        for job in &self.production.jobs {
            use crate::production::Phase;
            if !matches!(job.phase, Phase::Growing | Phase::Harvest)
                || matches!(job.recipe.as_str(), "eggs" | "milk")
            {
                continue;
            }
            let recipe = &catalog.production[&job.recipe];
            let (Some(growth), Some(biology)) = (&job.growth, &recipe.biology) else {
                continue;
            };
            let soil = self
                .production
                .growing_sites
                .get(&job.site)
                .unwrap_or(&default_soil);
            if let Some(remaining) = growth.collection_forecast(biology, soil, clock, season) {
                let site = job.site;
                let project = &catalog.projects[&self.plans[site].key];
                events.push((
                    remaining,
                    format!(
                        "{} · {} #{} ready to collect",
                        recipe.name,
                        project.name,
                        site + 1
                    ),
                    if remaining == 0.0 {
                        "Residents can collect now."
                    } else {
                        "Estimated from current growing conditions. Residents still need to collect."
                    },
                ));
            }
        }
        for (&site, pen) in &self.livestock.animals {
            let project = &catalog.projects[&self.plans[site].key];
            let Some(ration) = catalog.animal_rations.get(&project.kind) else {
                continue;
            };
            let name = &project.name;
            let available = pen.available();
            let (product, next_unit) = if ration.product == "eggs" {
                ("eggs", "next egg laid")
            } else {
                ("L of milk", "next litre of milk ready")
            };
            if available > 0 {
                events.push((
                    0.0,
                    format!(
                        "{name} #{} · {available} {product} ready to collect",
                        site + 1
                    ),
                    "Residents can collect now.",
                ));
            }
            if let Some(remaining) = pen.next_unit_days(ration) {
                events.push((
                    remaining,
                    format!("{name} #{} · {next_unit}", site + 1),
                    if remaining.is_finite() {
                        "Estimated from animal health, feed, and drinking water. Residents still need to collect."
                    } else {
                        "Replenish feed and drinking water to continue production."
                    },
                ));
            }
        }
        events.sort_by(|left, right| {
            left.0
                .total_cmp(&right.0)
                .then_with(|| left.1.cmp(&right.1))
        });
        let mut label = String::from("\nUpcoming harvests and collection");
        if events.is_empty() {
            label.push_str("\nNo upcoming milestones.");
        }
        if events.len() > 8 {
            let _ = write!(label, " · Showing 8 of {}", events.len());
        }
        for (remaining, event, detail) in events.into_iter().take(8) {
            let when = if !remaining.is_finite() {
                "Needs care".into()
            } else if remaining == 0.0 {
                "Now".into()
            } else if remaining < 1.0 {
                format!("About {:.0}h", (remaining * 24.0).ceil())
            } else {
                format!("About {remaining:.1} days")
            };
            let outside = if remaining.is_finite() && remaining > days {
                " · After advance"
            } else {
                ""
            };
            let _ = write!(label, "\n{when} · {event}{outside} · {detail}");
        }
        label
    }

    pub fn tick_crops(&mut self, catalog: &Catalog, setup: &WorldSetup, clock: f64, dt: f64) {
        let weather = step_weather(clock, dt, setup.biome(), setup.seed());
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
            // Step every bed before advancing the plot again. The beds share
            // one tank, so running one bed through the whole interval changes
            // which other beds receive water.
            let mut remaining = dt;
            while remaining > 1e-8 {
                let interval = remaining.min(HOUR);
                let climate = CropClimate {
                    dt: interval,
                    ..climate
                };
                for bed in &mut plot.beds {
                    bed.tick(climate, |amount| self.utilities.irrigate(index, amount));
                }
                remaining -= interval;
            }
            if !climate.sandbox
                && let Some(warning) = plot.update_warning(clock)
            {
                let name = &catalog.projects[&self.plans[index].key].name;
                self.events.record(
                    clock,
                    format!("{name} #{} · {}", index + 1, warning.message()),
                );
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
            self.farming.close();
            return;
        }
        let Some(site) = self.production.selected else {
            return;
        };
        if self.changes.contains_key(&site) {
            self.farming.close();
            return;
        }
        if !self.farming.plots.contains_key(&site) {
            self.farming.close();
            return;
        }
        if keyboard.just_pressed(KeyCode::KeyK) {
            self.toggle_beds();
        }
        if !self.farming.open {
            return;
        }
        if self.can_resize_selected_field()
            && let Some(delta) = field_size_input(keyboard)
        {
            self.resize_selected_field(catalog, ground, delta, stock.sandbox);
            return;
        }
        let actions = [
            (KeyCode::Tab, FarmControl::NextBed),
            (KeyCode::KeyT, FarmControl::Irrigation),
            (KeyCode::KeyZ, FarmControl::Residues),
            (KeyCode::KeyX, FarmControl::Crop),
            (KeyCode::KeyY, FarmControl::Density),
        ];
        for (key, action) in actions {
            if keyboard.just_pressed(key) {
                self.apply_farm_control(catalog, stock, action, clock);
            }
        }
        let jobs = [
            FarmAction::Prepare,
            FarmAction::Plant,
            FarmAction::Harvest,
            FarmAction::Clear,
            FarmAction::Amend,
            FarmAction::Collect,
        ];
        if let Some(action) = PAGE_KEYS
            .iter()
            .zip(jobs)
            .find_map(|(key, action)| keyboard.just_pressed(*key).then_some(action))
        {
            self.apply_farm_control(catalog, stock, FarmControl::Work(action), clock);
        }
    }

    pub fn can_resize_selected_field(&self) -> bool {
        self.farming.open
            && !self.menu
            && !self.production.open
            && self.has_selected_plot()
            && self
                .production
                .selected
                .is_some_and(|site| self.plans[site].key == "field")
    }

    pub fn resize_selected_field(
        &mut self,
        catalog: &Catalog,
        ground: ConstructionSite,
        delta: IVec2,
        sandbox: bool,
    ) {
        if !self.can_resize_selected_field() {
            return;
        }
        if let Some(site) = self.production.selected {
            let plan = &self.plans[site];
            let proposed = rotated_size(plan.size, plan.rotation) + delta;
            self.farming.notice = match self.resize_field(catalog, ground, site, proposed, sandbox)
            {
                Ok(()) => "Field resized.".into(),
                Err(reason) => reason.into(),
            };
        }
    }

    pub fn has_selected_plot(&self) -> bool {
        self.production.selected.is_some_and(|site| {
            self.farming.plots.contains_key(&site) && !self.changes.contains_key(&site)
        })
    }

    pub fn toggle_beds(&mut self) {
        if self.has_selected_plot() && !self.menu && !self.production.open {
            if self.farming.open {
                self.farming.close();
            } else {
                self.farming.open = true;
                self.farming.whole_plot = true;
                self.farming.bed = 0;
                self.farming.notice.clear();
            }
        }
    }

    pub(crate) fn select_bed_number(&mut self, number: usize) {
        let Some(plot) = self
            .production
            .selected
            .and_then(|site| self.farming.plots.get(&site))
        else {
            return;
        };
        if (1..=plot.beds.len()).contains(&number) {
            self.farming.bed = number - 1;
            self.farming.whole_plot = false;
            self.farming.pending_plot_clear = None;
            self.farming.notice.clear();
        } else {
            self.farming.notice = format!("Choose a bed from 1 to {}.", plot.beds.len());
        }
    }

    pub fn apply_farm_control(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        action: FarmControl,
        clock: TownClock,
    ) {
        if !self.farming.open || self.menu || self.production.open || !self.has_selected_plot() {
            return;
        }
        let Some(site) = self.production.selected else {
            return;
        };
        let confirmed = self.farming.pending_plot_clear.take() == Some(site);
        if self.farming.whole_plot
            && matches!(action, FarmControl::Work(FarmAction::Clear))
            && !confirmed
        {
            self.farming.pending_plot_clear = Some(site);
            self.farming.notice =
                "Clear crops across this plot? Confirm with Clear crops again or press 4. Only recoverable residues will remain.".into();
            return;
        }
        if matches!(action, FarmControl::WholePlot) {
            self.farming.whole_plot = !self.farming.whole_plot;
            self.farming.notice.clear();
            return;
        }
        if self.farming.whole_plot
            && let FarmControl::Work(action) = action
        {
            let count = self.farming.plots[&site].beds.len();
            let mut queued = 0;
            let mut first_error = None;
            for bed in 0..count {
                match self.queue_bed_job(catalog, stock, (site, bed, action), clock) {
                    Ok(()) => queued += 1,
                    Err(error) => {
                        first_error.get_or_insert(error);
                    }
                }
            }
            let skipped = count - queued;
            self.farming.notice = format!("{queued} beds queued · {skipped} skipped.");
            if let Some(error) = first_error {
                self.farming.notice.push(' ');
                self.farming.notice.push_str(&error);
            }
            return;
        }
        if self.farming.whole_plot && !matches!(action, FarmControl::NextBed) {
            self.configure_whole_plot(site, action);
            return;
        }
        let plot = self.farming.plots.get_mut(&site).expect("selected plot");
        let index = self.farming.bed.min(plot.beds.len() - 1);
        let bed = &mut plot.beds[index];
        let busy = self
            .farming
            .jobs
            .iter()
            .any(|job| job.site == site && job.bed == index);
        if busy && !matches!(action, FarmControl::NextBed) {
            self.farming.notice = "Wait for this bed’s current job to finish.".into();
            return;
        }
        match action {
            FarmControl::NextBed => {
                if self.farming.whole_plot {
                    self.farming.whole_plot = false;
                } else {
                    self.farming.bed = (self.farming.bed + 1) % plot.beds.len();
                }
                self.farming.notice.clear();
            }
            FarmControl::Irrigation => bed.irrigation = !bed.irrigation,
            FarmControl::Residues => bed.collect_residues = !bed.collect_residues,
            FarmControl::Crop if bed.editable() => bed.crop = bed.crop.next(),
            FarmControl::Density if bed.editable() => {
                bed.density = bed.next_density();
            }
            FarmControl::Work(action) => {
                match self.queue_bed_job(catalog, stock, (site, index, action), clock) {
                    Ok(()) => self.farming.notice.clear(),
                    Err(error) => self.farming.notice = error,
                }
            }
            _ => {}
        }
    }

    fn configure_whole_plot(&mut self, site: usize, action: FarmControl) {
        let beds = &mut self
            .farming
            .plots
            .get_mut(&site)
            .expect("selected plot")
            .beds;
        let busy: std::collections::BTreeSet<_> = self
            .farming
            .jobs
            .iter()
            .filter(|job| job.site == site)
            .map(|job| job.bed)
            .collect();
        let planting = matches!(action, FarmControl::Crop | FarmControl::Density);
        let eligible: Vec<_> = beds
            .iter()
            .enumerate()
            .filter(|(index, bed)| !busy.contains(index) && (!planting || bed.editable()))
            .map(|(index, _)| index)
            .collect();
        let Some(&first) = eligible.first() else {
            self.farming.notice = "No beds are available for this setting.".into();
            return;
        };
        let crop = beds[first].crop.next();
        let density = beds[first].next_density();
        let irrigation = !eligible.iter().all(|&index| beds[index].irrigation);
        let residues = !eligible.iter().all(|&index| beds[index].collect_residues);
        for &index in &eligible {
            let bed = &mut beds[index];
            match action {
                FarmControl::Crop => bed.crop = crop,
                FarmControl::Density => bed.density = density,
                FarmControl::Irrigation => bed.irrigation = irrigation,
                FarmControl::Residues => bed.collect_residues = residues,
                _ => return,
            }
        }
        let applied = match action {
            FarmControl::Crop => crop.label().to_owned(),
            FarmControl::Density => format!("Density {density:.1}×"),
            FarmControl::Irrigation => if irrigation {
                "Irrigation on"
            } else {
                "Irrigation off"
            }
            .into(),
            FarmControl::Residues => if residues {
                "Collect residues"
            } else {
                "Leave residues as cover"
            }
            .into(),
            _ => return,
        };
        self.farming.notice = format!(
            "{applied} · {} beds updated · {} skipped.",
            eligible.len(),
            beds.len() - eligible.len()
        );
    }

    pub(super) fn queue_bed_job(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        (site, bed, action): (usize, usize, FarmAction),
        clock: TownClock,
    ) -> Result<(), String> {
        let bed_data = self
            .farming
            .plots
            .get(&site)
            .and_then(|plot| plot.beds.get(bed))
            .ok_or("Choose a completed planting bed.")?;
        if self.changes.contains_key(&site) || !self.utilities.enabled(site) {
            return Err("The growing site is closed.".into());
        }
        if self
            .farming
            .jobs
            .iter()
            .any(|job| job.site == site && job.bed == bed)
        {
            return Err("Finish the current bed job first.".into());
        }
        let (inputs, required) = bed_data.requirements(action, clock.seconds)?;
        let mut pickups = 0;
        let mut fare = 0;
        if !stock.sandbox {
            if stock.missing(&inputs).is_some() && action != FarmAction::Plant {
                return Err("Not enough compost in supplies.".into());
            }
            let quote =
                self.market
                    .quote(catalog, &inputs, stock, clock.seconds, clock.round_trip_km)?;
            pickups = quote.trips;
            fare = quote.fare;
            self.market.reserve(stock, &inputs, &quote);
        }
        self.farming.jobs.push(FarmJob {
            site,
            bed,
            action,
            worker: None,
            phase: FarmPhase::Pickup,
            work: 0.0,
            required,
            inputs,
            output: Default::default(),
            food_output: None,
            retry: 0.0,
            waiting_for_access: false,
            pickups,
            fare,
            seed_freight_eta: None,
        });
        Ok(())
    }

    pub fn schedule_crop_work(&mut self, catalog: &Catalog, stock: &mut Stock, clock: TownClock) {
        let jobs = &self.farming.jobs;
        let mut slots = self.residents.len().saturating_sub(
            jobs.iter()
                .filter(|job| {
                    job.pickups == 0
                        && !matches!(job.phase, FarmPhase::Return | FarmPhase::CollectOutput)
                })
                .count(),
        );
        if slots == 0 {
            return;
        }
        let busy: std::collections::HashSet<_> =
            jobs.iter().map(|job| (job.site, job.bed)).collect();
        let mut buying_seeds = jobs.iter().any(|job| job.pickups > 0);
        let mut candidates = Vec::new();
        for (&site, plot) in &self.farming.plots {
            if self.changes.contains_key(&site) || !self.utilities.enabled(site) {
                continue;
            }
            for (index, bed) in plot.beds.iter().enumerate() {
                if busy.contains(&(site, index)) {
                    continue;
                }
                let action = match bed.stage {
                    Stage::Harvestable
                        if bed.requirements(FarmAction::Harvest, clock.seconds).is_ok() =>
                    {
                        FarmAction::Harvest
                    }
                    Stage::Prepared => FarmAction::Plant,
                    Stage::Failed | Stage::Harvestable => FarmAction::Clear,
                    Stage::Unprepared | Stage::Harvested => FarmAction::Prepare,
                    Stage::Growing => continue,
                };
                candidates.push((work_priority(action), site, index, action));
            }
        }
        candidates.sort_unstable_by_key(|&(priority, site, bed, _)| (priority, site, bed));
        for (_, site, bed, action) in candidates {
            let needs_seeds = !stock.sandbox
                && action == FarmAction::Plant
                && self.farming.plots[&site].beds[bed]
                    .requirements(action, clock.seconds)
                    .is_ok_and(|(inputs, _)| stock.missing(&inputs).is_some());
            if needs_seeds && (buying_seeds || self.market.auto_buy_off) {
                continue;
            }
            if self
                .queue_bed_job(catalog, stock, (site, bed, action), clock)
                .is_err()
            {
                continue;
            }
            if needs_seeds {
                buying_seeds = true;
            } else {
                slots -= 1;
                if slots == 0 {
                    break;
                }
            }
        }
    }

    pub(super) fn resize_field(
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

    pub(super) fn farm_route_blocked(&self, job: &FarmJob, clock: f64) -> bool {
        (job.waiting_for_access && job.retry > clock)
            || job
                .worker
                .is_some_and(|worker| self.residents[worker].waiting_for_route())
    }

    pub(super) fn farm_activity(&self, resident: usize) -> Option<&'static str> {
        let job = self
            .farming
            .jobs
            .iter()
            .find(|job| job.worker == Some(resident))?;
        Some(match job.phase {
            FarmPhase::Pickup => "Collecting farm supplies",
            FarmPhase::Walk => "Walking to the bed",
            FarmPhase::Return => "Returning to stores",
            FarmPhase::CollectOutput => "Returning for the next harvest load",
            FarmPhase::Work => match job.action {
                FarmAction::Prepare => "Preparing soil",
                FarmAction::Plant => "Sowing crops",
                FarmAction::Harvest => "Harvesting crops",
                FarmAction::Clear => "Clearing the bed",
                FarmAction::Amend => "Adding compost",
                FarmAction::Collect => "Collecting crop residues",
            },
        })
    }

    pub(super) fn farm_job_status(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        job: &FarmJob,
        clock: f64,
    ) -> String {
        if job.pickups > 0 {
            return seed_delivery_status(job, clock);
        }
        if job.action == FarmAction::Harvest
            && matches!(
                job.phase,
                FarmPhase::Pickup | FarmPhase::Walk | FarmPhase::Work
            )
            && self.farming.plots[&job.site].beds[job.bed].harvest_expired(clock)
        {
            return "Harvest expired · Job will clear the bed".into();
        }
        if self.farm_route_blocked(job, clock) {
            return "Waiting for access".into();
        }
        if let Some(worker) = job.worker.map(|index| &self.residents[index])
            && job.phase == FarmPhase::Return
            && worker.path.is_empty()
        {
            let load = super::production_work::production_load(catalog, &job.output);
            if load.is_empty() && job.output.values().any(|&units| units > 0) {
                return "Waiting for transport · Harvest exceeds hand-carry capacity".into();
            }
            if !load.is_empty() && self.storage_space(catalog, stock) == 0 {
                return "Waiting for storage space".into();
            }
        }
        match job.phase {
            FarmPhase::Pickup => "Collecting supplies".into(),
            FarmPhase::Walk => "Walking to the bed".into(),
            FarmPhase::Work => format!("{:.0}% worked", 100.0 * job.work / job.required),
            FarmPhase::Return => "Returning to stores".into(),
            FarmPhase::CollectOutput => "Returning for the next harvest load".into(),
        }
    }

    pub(crate) fn whole_plot_action_counts(&self, clock: f64) -> [usize; 6] {
        let mut counts = [0; 6];
        let Some(site) = self
            .production
            .selected
            .filter(|&site| self.utilities.enabled(site))
        else {
            return counts;
        };
        let Some(plot) = self.farming.plots.get(&site) else {
            return counts;
        };
        let mut busy = vec![false; plot.beds.len()];
        for job in self.farming.jobs.iter().filter(|job| job.site == site) {
            busy[job.bed] = true;
        }
        for (bed, busy) in plot.beds.iter().zip(busy) {
            if !busy {
                for action in FarmAction::ALL {
                    counts[action as usize] += usize::from(bed.allows(action, clock));
                }
            }
        }
        counts
    }

    pub fn farm_status(&self, catalog: &Catalog, stock: &Stock, clock: f64) -> Option<String> {
        let site = self.production.selected?;
        let plot = self.farming.plots.get(&site)?;
        if !self.farming.open {
            return Some("K Cultivation".into());
        }
        if self.farming.whole_plot {
            let count = plot.beds.len();
            let busy = self
                .farming
                .jobs
                .iter()
                .filter(|job| job.site == site)
                .count();
            let area: f64 = plot.beds.iter().map(crate::farming::Bed::area).sum();
            let mut stages = [0; 7];
            for bed in &plot.beds {
                let stage = if bed.harvest_expired(clock) {
                    6
                } else {
                    bed.stage as usize
                };
                stages[stage] += 1;
            }
            let summary = [
                "Unworked soil",
                "Ready to plant",
                "Growing",
                "Ready to harvest",
                "Harvest complete",
                "Crop failed",
                "Harvest expired",
            ]
            .into_iter()
            .zip(stages)
            .filter(|(_, beds)| *beds > 0)
            .map(|(stage, beds)| format!("{stage} {beds}"))
            .collect::<Vec<_>>()
            .join(" · ");
            let name = match self.plans[site].key.as_str() {
                "field" => "field",
                "garden" => "garden",
                "greenhouse" => "greenhouse",
                _ => "plot",
            };
            return Some(format!(
                "Whole {name} · {count} beds · {area:.1} m² · {busy} queued\n{summary}\n1 Prepare · 2 Plant · 3 Harvest · 4 Clear · 5 Amend · 6 Collect\nX Crop · Y Density · T Irrigation · Z Residues · Tab Inspect bed\n{}",
                self.farming.notice,
            ));
        }
        let index = self.farming.bed.min(plot.beds.len() - 1);
        let mut label = self.bed_status(site, index, clock)?;
        if let Some(job) = self
            .farming
            .jobs
            .iter()
            .find(|job| job.site == site && job.bed == index)
        {
            label.push('\n');
            label.push_str(&self.farm_job_status(catalog, stock, job, clock));
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

    pub(crate) fn bed_status(&self, site: usize, index: usize, clock: f64) -> Option<String> {
        let plot = self.farming.plots.get(&site)?;
        let bed = plot.beds.get(index)?;
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
        let stage = if bed.harvest_expired(clock) {
            "Harvest expired"
        } else {
            bed.stage.label()
        };
        let mut label = format!(
            "Bed {}/{} · {} · {} ({:.0}%) · {:.1} m²\nMoisture {:.0}% · Fertility {:.0}% · {:.1} kg harvest estimate\nDrought loss {:.0}% · Ground cover {:.0}%\nSoil · {:.1} kg residues · {:.1} kg compost · {:.1} kg organic matter\n{}\nWater totals · {:.1} L rain · {:.1} L irrigation · {:.1} L evaporated · {:.1} L drained\nDensity {:.1}× · {} · {} residues",
            index + 1,
            plot.beds.len(),
            bed.crop.label(),
            stage,
            bed.growth * 100.0,
            bed.area(),
            bed.moisture * 100.0,
            bed.fertility * 100.0,
            bed.yield_kg(clock),
            bed.drought_damage() * 100.0,
            bed.ground_cover() * 100.0,
            bed.residue_kg,
            bed.amendment_kg,
            bed.soil_organic_kg,
            bed.material_balance_summary(),
            bed.rain_liters,
            bed.irrigated_liters,
            bed.evaporated_liters,
            bed.drained_liters,
            bed.density,
            irrigation,
            residues,
        );
        if let Some((remaining, window)) = bed.harvest_timing(clock) {
            use std::fmt::Write;
            if remaining > 0.0 {
                let _ = write!(
                    label,
                    "\nHarvest expires in {remaining:.1} days · Yield declines after {window} ripe days"
                );
            } else {
                label.push_str("\nClear the expired crop before replanting.");
            }
        }
        if let Some(job) = self
            .farming
            .jobs
            .iter()
            .find(|job| job.site == site && job.bed == index)
        {
            if job.pickups > 0 {
                label.push('\n');
                label.push_str(&seed_delivery_status(job, clock));
            } else {
                label.push_str(&format!(
                    "\nWork queued · {:.0}%",
                    job.work / job.required * 100.0
                ));
            }
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
        if self.reservation_pass.is_some() {
            self.assign_farm_workers(catalog, site, clock);
            return;
        }
        for job_index in (0..self.farming.jobs.len()).rev() {
            let job = &mut self.farming.jobs[job_index];
            if let Some(lots) = &mut job.food_output
                && !stock.sandbox
            {
                let lost = crate::food::discard_expired(lots, clock);
                let spoiled = !lost.is_empty();
                stock.record_spoilage(catalog, &lost);
                for (id, lost) in lost {
                    if let Some(quantity) = job.output.get_mut(&id) {
                        *quantity = quantity.saturating_sub(lost);
                    }
                }
                if spoiled && job.output.values().all(|&units| units == 0) {
                    if let Some(worker) = job.worker {
                        self.residents[worker].clear_work_route();
                    }
                    self.farming.jobs.remove(job_index);
                    continue;
                }
            }
            let job = &self.farming.jobs[job_index];
            if clock < job.retry || job.pickups > 0 {
                continue;
            }
            let Some(index) = job.worker else {
                continue;
            };
            self.farming.jobs[job_index].waiting_for_access = false;
            let worker = &mut self.residents[index];
            let phase = self.farming.jobs[job_index].phase;
            worker.move_along_path(dt, matches!(phase, FarmPhase::Walk | FarmPhase::Return));
            if !worker.path.is_empty() {
                continue;
            }
            let position = worker.position;
            let job = &self.farming.jobs[job_index];
            match phase {
                FarmPhase::Pickup => {
                    let Some(path) = self.path_to_bed(catalog, site, job, position) else {
                        self.release_farm_worker(job_index, clock);
                        continue;
                    };
                    self.residents[index].path = path;
                    self.farming.jobs[job_index].phase = FarmPhase::Walk;
                }
                FarmPhase::Walk => self.farming.jobs[job_index].phase = FarmPhase::Work,
                FarmPhase::Work => {
                    let Some(aisle) = self
                        .bed_aisles(job)
                        .into_iter()
                        .find(|&access| position.distance(access.work) <= 0.01)
                    else {
                        if let Some(path) = self.path_to_bed(catalog, site, job, position) {
                            self.residents[index].path = path;
                            self.farming.jobs[job_index].phase = FarmPhase::Walk;
                        } else {
                            self.release_farm_worker(job_index, clock);
                        }
                        continue;
                    };
                    let boost = stock.use_tool(
                        index,
                        "garden-tools",
                        ToolTask::Cultivation(job.site, job.bed),
                        f64::from(dt),
                        self.repairing(catalog, "garden-tools"),
                    );
                    let job = &mut self.farming.jobs[job_index];
                    job.work = (job.work + f64::from(dt) * boost).min(job.required);
                    if job.work < job.required {
                        continue;
                    }
                    let job = &self.farming.jobs[job_index];
                    let Some(mut path) =
                        self.path_from_bed(catalog, site, job, aisle.work, SUPPLY_SPOTS[index])
                    else {
                        self.wait_for_farm_access(job_index, clock);
                        continue;
                    };
                    let job = &mut self.farming.jobs[job_index];
                    let plot = self
                        .farming
                        .plots
                        .get_mut(&job.site)
                        .expect("farm job plot");
                    job.output = plot.finish(catalog, job, clock, stock.sandbox);
                    job.food_output =
                        Some(crate::food::fresh(&job.output, clock, &Default::default()));
                    if job.output.is_empty() {
                        path.truncate(3);
                    }
                    job.phase = FarmPhase::Return;
                    self.residents[index].path = path;
                }
                FarmPhase::Return => {
                    let load = super::production_work::production_load_with_limit(
                        catalog,
                        &job.output,
                        self.storage_space(catalog, stock),
                    );
                    if load.is_empty() && job.output.values().any(|&units| units > 0) {
                        continue;
                    }
                    let job = &mut self.farming.jobs[job_index];
                    let lots = job
                        .food_output
                        .as_mut()
                        .map(|lots| super::production_work::take_load_lots(lots, &load));
                    stock.receive_materials(&load, lots, crate::stock::MaterialReason::Harvest);
                    for (id, units) in load {
                        *job.output.get_mut(&id).expect("load is part of harvest") -= units;
                    }
                    job.output.retain(|_, units| *units > 0);
                    if job.output.is_empty() {
                        self.farming.jobs.remove(job_index);
                    } else {
                        job.phase = FarmPhase::CollectOutput;
                    }
                }
                FarmPhase::CollectOutput => {
                    if job.output.values().all(|&units| units == 0) {
                        self.farming.jobs.remove(job_index);
                        continue;
                    }
                    let at_bed = self
                        .bed_aisles(job)
                        .iter()
                        .any(|aisle| aisle.work.distance(position) <= 0.01);
                    let route = if at_bed {
                        self.path_from_bed(catalog, site, job, position, SUPPLY_SPOTS[index])
                    } else {
                        self.path_to_bed(catalog, site, job, position)
                    };
                    if let Some(path) = route {
                        self.residents[index].path = path;
                        if at_bed {
                            self.farming.jobs[job_index].phase = FarmPhase::Return;
                        }
                    } else {
                        self.wait_for_farm_access(job_index, clock);
                    }
                }
            }
        }

        self.assign_farm_workers(catalog, site, clock);
    }

    fn assign_farm_workers(&mut self, catalog: &Catalog, site: ConstructionSite, clock: f64) {
        let mut waiting: Vec<_> = self
            .farming
            .jobs
            .iter()
            .enumerate()
            .filter(|(_, job)| job.worker.is_none() && job.pickups == 0 && job.retry <= clock)
            .map(|(index, job)| (work_priority(job.action), index))
            .collect();
        waiting.sort_unstable();
        for (_, index) in waiting {
            self.try_farm_worker(index, catalog, site, clock);
            let job = &mut self.farming.jobs[index];
            if self.reservation_pass.is_none() && !job.waiting_for_access {
                job.retry = clock + 1.0;
            }
        }
    }

    fn release_farm_worker(&mut self, job: usize, clock: f64) {
        self.farming.jobs[job].worker = None;
        self.farming.jobs[job].phase = FarmPhase::Pickup;
        self.wait_for_farm_access(job, clock);
    }

    fn wait_for_farm_access(&mut self, index: usize, clock: f64) {
        let job = &mut self.farming.jobs[index];
        job.waiting_for_access = true;
        job.retry = clock + 5.0;
    }

    fn bed_aisles(&self, job: &FarmJob) -> Vec<BedAccess> {
        let plan = &self.plans[job.site];
        let bed = &self.farming.plots[&job.site].beds[job.bed];
        let half = rotated_size(plan.size, plan.rotation).as_vec2() * 0.5;
        let center = plan.position.as_vec2() + (plan.size.as_vec2() - Vec2::ONE) * 0.5;
        let rotation = Mat2::from_angle(-f32::from(plan.rotation) * std::f32::consts::FRAC_PI_2);
        let world = |x, z| center + rotation * Vec2::new(x, z);
        let bed_x = bed.offset.x * 0.5;
        let bed_z = bed.offset.y * 0.5;
        let x_choices = if plan.key == "field" {
            vec![bed_x - 0.5, bed_x + 0.5]
        } else {
            vec![0.0]
        };
        let mut accesses = Vec::new();
        for x in x_choices {
            for end in [-1.0, 1.0] {
                let gate_x = if plan.key == "greenhouse" { 0.0 } else { x };
                let outside = world(gate_x, end * (half.y + 0.5));
                let aisle = world(x, end * (half.y + 0.2));
                accesses.push(BedAccess {
                    anchor: outside.round().as_ivec2(),
                    outside,
                    aisle,
                    work: world(x, bed_z),
                });
            }
        }
        accesses
    }

    fn path_to_bed(
        &self,
        catalog: &Catalog,
        site: ConstructionSite,
        job: &FarmJob,
        from: Vec2,
    ) -> Option<VecDeque<Vec2>> {
        let mut choices = self.bed_aisles(job);
        choices.sort_by(|a, b| a.cost_from(from).total_cmp(&b.cost_from(from)));
        choices.into_iter().find_map(|access| {
            let mut path = self.resident_route(catalog, site, from, access.anchor)?;
            path.extend([access.outside, access.aisle, access.work]);
            Some(path)
        })
    }

    pub(super) fn farm_grid_waypoints(&self, worker: usize) -> Option<usize> {
        let job = self
            .farming
            .jobs
            .iter()
            .find(|job| job.worker == Some(worker))?;
        let path = &self.residents[worker].path;
        Some(match job.phase {
            // The final three points follow the authored bed aisle beyond the grid route.
            FarmPhase::Walk | FarmPhase::CollectOutput => path.len().saturating_sub(3),
            FarmPhase::Return if path.front().is_some_and(|point| point.round() != *point) => 0,
            _ => path.len(),
        })
    }

    fn path_from_bed(
        &self,
        catalog: &Catalog,
        site: ConstructionSite,
        job: &FarmJob,
        from: Vec2,
        to: IVec2,
    ) -> Option<VecDeque<Vec2>> {
        let mut choices = self.bed_aisles(job);
        choices.retain(|access| access.work.distance(from) <= 0.01);
        choices.sort_by(|a, b| {
            a.cost_from(to.as_vec2())
                .total_cmp(&b.cost_from(to.as_vec2()))
        });
        choices.into_iter().find_map(|access| {
            let route = self.resident_route(catalog, site, access.anchor.as_vec2(), to)?;
            let mut path = VecDeque::from([access.aisle, access.outside, access.anchor.as_vec2()]);
            path.extend(route);
            Some(path)
        })
    }

    fn try_farm_worker(
        &mut self,
        index: usize,
        catalog: &Catalog,
        site: ConstructionSite,
        clock: f64,
    ) {
        let job = &self.farming.jobs[index];
        let direct = job.inputs.is_empty();
        let mut attempted = false;
        for (worker, resident) in self.residents.iter().enumerate() {
            if !self.work_candidate(worker) {
                continue;
            }
            attempted = true;
            let path = if direct {
                self.path_to_bed(catalog, site, job, resident.position)
            } else {
                self.resident_route(catalog, site, resident.position, SUPPLY_SPOTS[worker])
            };
            let Some(path) = path else { continue };
            let job = &mut self.farming.jobs[index];
            job.worker = Some(worker);
            job.waiting_for_access = false;
            if direct {
                job.phase = FarmPhase::Walk;
            }
            self.residents[worker].path = path;
            return;
        }
        if self.reservation_pass.is_none() {
            if attempted {
                self.wait_for_farm_access(index, clock);
            } else {
                self.farming.jobs[index].waiting_for_access = false;
            }
        }
    }
}

#[derive(Clone, Copy)]
struct BedAccess {
    anchor: IVec2,
    outside: Vec2,
    aisle: Vec2,
    work: Vec2,
}

impl BedAccess {
    fn cost_from(self, point: Vec2) -> f32 {
        self.outside.distance(point) + self.aisle.distance(self.work)
    }
}

pub(super) fn seed_delivery_status(job: &FarmJob, clock: f64) -> String {
    job.seed_freight_eta.map_or_else(
        || "Waiting for seed delivery".into(),
        |eta| {
            let minutes = crate::weather::remaining_game_minutes(eta - clock);
            format!("Seed freight · {minutes} game minutes remaining")
        },
    )
}

#[cfg(test)]
mod resize_tests {
    use super::*;
    use crate::farming::{Crop, Stage};

    #[test]
    fn whole_plot_clear_requires_confirmation_for_the_selected_plot() {
        let setup = WorldSetup::default();
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut village = Construction::default();
        let mut garden = village.proposed_site(&catalog, "garden", IVec2::new(44, 36));
        garden.work = catalog.projects["garden"].work;
        village.plans.push(garden);
        village.tick_crops(&catalog, &setup, 0.0, 0.0);
        village.production.selected = Some(0);
        village.toggle_beds();
        assert!(village.farming.whole_plot);
        village.farming.plots.get_mut(&0).unwrap().beds[0].stage = Stage::Growing;
        let clock = TownClock {
            seconds: 0.,
            round_trip_km: 12,
        };
        let overview = village
            .farm_status(&catalog, &stock, clock.seconds)
            .unwrap();
        assert!(overview.contains("Whole garden"));
        assert!(overview.contains("Growing 1"));
        assert!(overview.contains("Unworked soil"));
        village.apply_farm_control(&catalog, &mut stock, FarmControl::NextBed, clock);
        assert!(!village.farming.whole_plot);
        assert_eq!(village.farming.bed, 0);
        let last = village.farming.plots[&0].beds.len();
        village.select_bed_number(last);
        assert_eq!(village.farming.bed, last - 1);
        village.select_bed_number(last + 1);
        assert_eq!(village.farming.bed, last - 1);
        assert!(village.farming.notice.contains("Choose a bed"));
        village.apply_farm_control(&catalog, &mut stock, FarmControl::WholePlot, clock);
        let clear = FarmControl::Work(FarmAction::Clear);
        village.apply_farm_control(&catalog, &mut stock, clear, clock);
        assert!(village.farming.jobs.is_empty());
        assert!(village.farming.notice.contains("Confirm"));
        village.toggle_beds();
        village.toggle_beds();
        village.apply_farm_control(&catalog, &mut stock, clear, clock);
        assert!(village.farming.jobs.is_empty());
        village.apply_farm_control(&catalog, &mut stock, clear, clock);
        assert_eq!(village.farming.jobs.len(), 1);
        assert!(village.farming.jobs[0].action == FarmAction::Clear);
    }

    #[test]
    fn queued_bed_work_locks_watering_and_residue_settings() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut village = Construction::default();
        let mut garden = village.proposed_site(&catalog, "garden", IVec2::new(44, 36));
        garden.work = catalog.projects["garden"].work;
        village.plans.push(garden);
        village.tick_crops(&catalog, &setup, 0.0, 0.0);
        village.production.selected = Some(0);
        village.farming.open = true;
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        village
            .queue_bed_job(&catalog, &mut stock, (0, 0, FarmAction::Prepare), clock)
            .unwrap();
        let bed = &village.farming.plots[&0].beds[0];
        let original = (bed.irrigation, bed.collect_residues);

        for action in [FarmControl::Irrigation, FarmControl::Residues] {
            village.apply_farm_control(&catalog, &mut stock, action, clock);
        }
        let bed = &village.farming.plots[&0].beds[0];
        assert_eq!((bed.irrigation, bed.collect_residues), original);
        assert!(village.farming.notice.contains("current job"));

        village.apply_farm_control(&catalog, &mut stock, FarmControl::NextBed, clock);
        assert_eq!(village.farming.bed, 1);

        village.apply_farm_control(&catalog, &mut stock, FarmControl::WholePlot, clock);
        let available = village.whole_plot_action_counts(clock.seconds);
        assert_eq!(
            available[FarmAction::Prepare as usize],
            village.farming.plots[&0].beds.len() - 1
        );
        assert_eq!(available[FarmAction::Harvest as usize], 0);
        let initial_crop = village.farming.plots[&0].beds[0].crop;
        village.apply_farm_control(&catalog, &mut stock, FarmControl::Crop, clock);
        let beds = &village.farming.plots[&0].beds;
        assert!(beds[0].crop == initial_crop);
        assert!(beds[1..].iter().all(|bed| bed.crop == initial_crop.next()));
        village.apply_farm_control(&catalog, &mut stock, FarmControl::Irrigation, clock);
        let beds = &village.farming.plots[&0].beds;
        assert_eq!(beds[0].irrigation, original.0);
        assert!(beds[1..].iter().all(|bed| bed.irrigation != original.0));
        village.apply_farm_control(
            &catalog,
            &mut stock,
            FarmControl::Work(FarmAction::Prepare),
            clock,
        );
        let count = village.farming.plots[&0].beds.len();
        assert!(count > 1);
        assert_eq!(village.farming.jobs.len(), count);
        assert!(village.farming.notice.contains("1 skipped"));
    }

    #[test]
    fn beds_can_request_irrigation_midway_through_a_long_step() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let mut village = Construction::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut garden = village.proposed_site(&catalog, "garden", IVec2::new(44, 36));
        garden.work = catalog.projects["garden"].work;
        village.plans.push(garden);
        village.tick_services(&catalog, &setup, &mut stock, 0.0, 0.1);
        village.tick_crops(&catalog, &setup, 0.0, 0.0);
        village.utilities.deliver_water(1, 1, 12.0);
        let bed = &mut village.farming.plots.get_mut(&0).unwrap().beds[0];
        bed.stage = Stage::Growing;
        bed.moisture = 0.751;
        bed.irrigation = true;

        // The first hour is dry and takes the bed below its refill threshold.
        village.tick_crops(&catalog, &setup, 8.0 * HOUR, 4.0 * HOUR);

        assert!(village.farming.plots[&0].beds[0].irrigated_liters > 0.0);
    }

    #[test]
    fn outdoor_beds_receive_rain_at_the_step_midpoint() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let mut village = Construction::default();
        let mut garden = village.proposed_site(&catalog, "garden", IVec2::new(44, 36));
        garden.work = catalog.projects["garden"].work;
        village.plans.push(garden);

        // V2 weatherStep reports 1.391 mm/h at the midpoint and dry at the end.
        village.tick_crops(&catalog, &setup, 4.1 * HOUR, HOUR);
        let expected = 0.75 + (1.391_004_679_594_048 - 1.0 / 24.0) / 16.0;
        assert!((village.farming.plots[&0].beds[0].moisture - expected).abs() < 1e-9);
    }

    #[test]
    fn field_work_uses_the_interior_aisle_and_leaves_before_releasing_the_worker() {
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
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut village = Construction {
            selection: Some("field".into()),
            field_size: IVec2::splat(8),
            rotation: 1,
            ..default()
        };
        let corner = IVec2::new(44, 36);
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        village.plan(&catalog, &mut stock, ground, corner, clock);
        village.select_facility(corner);
        village.toggle_beds();
        village.apply_farm_control(&catalog, &mut stock, FarmControl::WholePlot, clock);
        village.farming.bed = 24;
        let mut input = ButtonInput::default();
        input.press(KeyCode::Digit1);
        village.farm_input(&catalog, &mut stock, &input, ground, clock);
        assert_eq!(village.farming.jobs.len(), 1);
        village.residents[0].position = (corner - IVec2::X).as_vec2();
        assert!(
            village
                .lab_stop_reason(super::super::LabStop::Blocked, 0.0)
                .is_none()
        );
        let aisles = village.bed_aisles(&village.farming.jobs[0]);
        for aisle in aisles {
            let obstacle = village.proposed_site(&catalog, "supply-5", aisle.anchor);
            village.plans.push(obstacle);
        }
        village.tick_farm_jobs(&catalog, &mut stock, ground, 0.0, 0.1);
        assert!(village.farming.jobs[0].worker.is_none());
        assert_eq!(
            village.lab_stop_reason(super::super::LabStop::Blocked, 0.0),
            Some("A job is waiting for access.")
        );
        assert_eq!(
            village.farm_job_status(&catalog, &stock, &village.farming.jobs[0], 0.0),
            "Waiting for access"
        );
        village.plans.truncate(1);
        village.tick_farm_jobs(&catalog, &mut stock, ground, 5.0, 0.1);
        assert!(village.farming.jobs[0].worker.is_some());
        assert!(
            village
                .lab_stop_reason(super::super::LabStop::Blocked, 5.0)
                .is_none()
        );

        let mut reached_bed = false;
        let mut detoured = false;
        for step in 51..1_800 {
            village.refresh_resident_crowding(&catalog, ground);
            village.tick_farm_jobs(&catalog, &mut stock, ground, f64::from(step) * 0.1, 0.1);
            let Some(job) = village.farming.jobs.first() else {
                break;
            };
            if !detoured && job.phase == FarmPhase::Walk && village.residents[0].path.len() > 4 {
                let path = &village.residents[0].path;
                let blocked = *path.front().unwrap();
                let aisle: Vec<_> = path.iter().rev().take(3).copied().collect();
                let obstacle = village.proposed_site(&catalog, "supply-5", blocked.as_ivec2());
                village.plans.push(obstacle);
                village.refresh_resident_crowding(&catalog, ground);
                let route = &village.residents[0].path;
                assert!(!route.contains(&blocked));
                assert!(route.iter().rev().take(3).copied().eq(aisle));
                detoured = true;
                continue;
            }
            if job.phase == FarmPhase::Work {
                let position = village.residents[0].position;
                assert!(position.x > corner.x as f32 + 1.0);
                assert!(position.x < corner.x as f32 + 6.0);
                assert!(
                    village
                        .bed_aisles(job)
                        .iter()
                        .any(|access| access.work == position)
                );
                reached_bed = true;
            }
        }
        assert!(reached_bed);
        assert!(detoured);
        assert!(village.farming.jobs.is_empty());
        assert!(village.farming.plots[&0].beds[24].stage == Stage::Prepared);
        let worker_cell = village.residents[0].position.round().as_ivec2();
        assert!(
            !worker_cell.cmpge(corner).all() || !worker_cell.cmplt(corner + IVec2::splat(8)).all()
        );
    }

    #[test]
    fn harvest_reloads_from_the_bed_after_a_partial_delivery_and_save() {
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
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut village = Construction {
            selection: Some("field".into()),
            ..default()
        };
        let corner = IVec2::new(44, 36);
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        village.plan(&catalog, &mut stock, ground, corner, clock);
        village.select_facility(corner);
        village.toggle_beds();
        village.apply_farm_control(&catalog, &mut stock, FarmControl::WholePlot, clock);
        let mut input = ButtonInput::default();
        input.press(KeyCode::Digit1);
        village.farm_input(&catalog, &mut stock, &input, ground, clock);

        let total = 100;
        let initial = stock.available("greens");
        let job = &mut village.farming.jobs[0];
        job.phase = FarmPhase::Return;
        job.worker = Some(0);
        job.output = BTreeMap::from([("greens".into(), total)]);
        job.food_output = Some(crate::food::fresh(&job.output, 0.0, &Default::default()));
        village.residents[0].position = SUPPLY_SPOTS[0].as_vec2();
        village.residents[0].path.clear();
        let free_space = village.storage_space(&catalog, &stock) as u32;
        let mut full_stock = stock.clone();
        full_stock.receive(&BTreeMap::from([("stone".into(), free_space)]));
        village.tick_farm_jobs(&catalog, &mut full_stock, ground, 0.0, 0.1);
        assert_eq!(
            village.farm_job_status(&catalog, &full_stock, &village.farming.jobs[0], 0.0),
            "Waiting for storage space"
        );
        assert_eq!(full_stock.available("greens"), initial);
        assert_eq!(village.farming.jobs[0].output["greens"], total);

        // A fully spoiled harvest should release its bed even while a haul
        // is waiting to retry an inaccessible route.
        let mut blocked: Construction =
            serde_json::from_str(&serde_json::to_string(&village).unwrap()).unwrap();
        let after_expiry = 90.0 * crate::weather::DAY;
        let job = &mut blocked.farming.jobs[0];
        job.worker = None;
        job.retry = after_expiry + 5.0;
        blocked.tick_farm_jobs(&catalog, &mut full_stock, ground, after_expiry, 0.1);
        assert!(blocked.farming.jobs.is_empty());
        assert_eq!(full_stock.available("greens"), initial);

        let filler = BTreeMap::from([("stone".into(), free_space - 2)]);
        stock.receive(&filler);
        village.tick_farm_jobs(&catalog, &mut stock, ground, 0.0, 0.1);
        let first_load = stock.available("greens") - initial;
        assert_eq!(first_load, 2);
        stock.reserve_available(&filler);
        let job = &village.farming.jobs[0];
        assert!(job.phase == FarmPhase::CollectOutput);
        assert_eq!(
            village.farm_activity(job.worker.unwrap()),
            Some("Returning for the next harvest load")
        );
        assert_eq!(job.output["greens"], total - first_load);

        village = serde_json::from_str(&serde_json::to_string(&village).unwrap()).unwrap();
        for step in 1..12_000 {
            village.tick_farm_jobs(&catalog, &mut stock, ground, f64::from(step) * 0.1, 0.1);
            if village.farming.jobs.is_empty() {
                break;
            }
        }
        assert!(village.farming.jobs.is_empty());
        assert_eq!(stock.available("greens"), initial + total);
    }

    #[test]
    fn crop_alerts_follow_the_most_severe_bed_and_survive_reload() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let mut village = Construction::default();
        let mut field = village.proposed_site(&catalog, "field", IVec2::new(44, 36));
        field.work = catalog.projects["field"].work;
        village.plans.push(field);
        let mut plot = Plot::new("field", IVec2::splat(8)).unwrap();
        plot.beds[0].stage = Stage::Growing;
        plot.beds[0].moisture = 0.1;
        plot.beds[1].stage = Stage::Failed;
        village.farming.plots.insert(0, plot);

        village.tick_crops(&catalog, &setup, 0.0, 0.0);
        let log = village.event_log(0, "").1;
        assert!(log.contains("Crops failed."));
        assert!(!log.contains("Crops wilting."));

        let mut restored: Construction =
            serde_json::from_slice(&serde_json::to_vec(&village).unwrap()).unwrap();
        restored.tick_crops(&catalog, &setup, 1.0, 0.0);
        assert_eq!(restored.event_log(0, "").1, log);

        restored.farming.plots.get_mut(&0).unwrap().beds[1].stage = Stage::Unprepared;
        restored.tick_crops(&catalog, &setup, 2.0, 0.0);
        assert!(restored.event_log(0, "").1.contains("Crops wilting."));
    }

    #[test]
    fn autonomous_crop_work_prioritizes_planting_and_limits_pending_jobs() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        stock.sandbox = true;
        let mut village = Construction {
            field_size: IVec2::splat(8),
            ..default()
        };
        let mut field = village.proposed_site(&catalog, "field", IVec2::new(44, 36));
        field.work = catalog.projects["field"].work;
        village.plans.push(field);
        let mut plot = Plot::new("field", IVec2::splat(8)).unwrap();
        plot.beds[0].stage = Stage::Unprepared;
        plot.beds[1].stage = Stage::Prepared;
        plot.beds[2].stage = Stage::Failed;
        village.farming.plots.insert(0, plot);
        for _ in 0..2 {
            village.schedule_crop_work(
                &catalog,
                &mut stock,
                TownClock {
                    seconds: 0.0,
                    round_trip_km: 12,
                },
            );
        }
        assert_eq!(village.farming.jobs.len(), village.residents.len());
        assert_eq!(village.farming.jobs[0].bed, 1);
        assert_eq!(village.farming.jobs[1].bed, 2);
        assert_eq!(village.farming.jobs[2].bed, 0);
        let camp = IVec2::new(36, 36);
        let terrain = setup.terrain().with_camp(camp);
        let land = Land::default();
        for (index, worker) in village.residents.iter_mut().enumerate() {
            worker.position = SUPPLY_SPOTS[index].as_vec2();
        }
        village.tick_farm_jobs(
            &catalog,
            &mut stock,
            ConstructionSite {
                terrain: &terrain,
                land: &land,
                camp,
            },
            0.0,
            0.1,
        );
        assert_eq!(village.farming.jobs[0].worker, Some(0));
    }

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
            planted.rain_liters = 12.0;
            planted.soil_organic_kg = 0.5;
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
            assert_eq!(bed.rain_liters, 12.0);
            assert_eq!(bed.soil_organic_kg, 0.5);
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
