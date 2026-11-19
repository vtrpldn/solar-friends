use std::{collections::BTreeMap, sync::LazyLock};

use bevy::prelude::*;
use serde::{Deserialize, Serialize};

use crate::weather::DAY;

#[derive(Default, Deserialize, Serialize)]
pub struct Farming {
    pub plots: BTreeMap<usize, Plot>,
    pub jobs: Vec<FarmJob>,
    #[serde(skip)]
    pub open: bool,
    #[serde(skip)]
    pub bed: usize,
    #[serde(skip)]
    pub notice: String,
}

#[derive(Deserialize, Serialize)]
pub struct Plot {
    pub beds: Vec<Bed>,
    remainders: [f64; 3],
    #[serde(default, skip_serializing_if = "Option::is_none")]
    warning: Option<CropWarning>,
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Deserialize, Serialize)]
pub(crate) enum CropWarning {
    Wilting,
    Damaged,
    Expired,
    Failed,
}

impl CropWarning {
    pub(crate) fn message(self) -> &'static str {
        match self {
            Self::Wilting => "Crops wilting. Restore irrigation.",
            Self::Damaged => "Crops damaged. Restore irrigation to prevent further damage.",
            Self::Expired => "Harvest window closed. Clear expired crops before replanting.",
            Self::Failed => "Crops failed. Clear failed beds before replanting.",
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
pub enum Crop {
    Greens,
    Beans,
    Corn,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CropDefinition {
    name: String,
    days: f64,
    window: f64,
    yield_kg: f64,
    water: f64,
    residue: f64,
    plants: f32,
    height: f32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CropCatalog {
    greens: CropDefinition,
    beans: CropDefinition,
    corn: CropDefinition,
}

static CROPS: LazyLock<CropCatalog> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../data/crops.json")).expect("embedded crop catalog")
});

impl Crop {
    pub(crate) const ALL: [Self; 3] = [Self::Greens, Self::Beans, Self::Corn];

    fn definition(self) -> &'static CropDefinition {
        match self {
            Self::Greens => &CROPS.greens,
            Self::Beans => &CROPS.beans,
            Self::Corn => &CROPS.corn,
        }
    }

    pub fn label(self) -> &'static str {
        &self.definition().name
    }

    pub fn seed(self) -> &'static str {
        ["greens_seed", "beans_seed", "corn_seed"][self as usize]
    }

    pub(crate) fn material(self) -> &'static str {
        ["greens", "beans", "corn"][self as usize]
    }

    pub(crate) fn days(self) -> f64 {
        self.definition().days
    }
    fn window(self) -> f64 {
        self.definition().window
    }
    fn yield_kg(self) -> f64 {
        self.definition().yield_kg
    }
    fn water(self) -> f64 {
        self.definition().water
    }
    fn residue(self) -> f64 {
        self.definition().residue
    }
    pub(crate) fn plants_per_square_meter(self) -> f32 {
        self.definition().plants
    }
    pub(crate) fn height(self) -> f32 {
        self.definition().height
    }
    pub fn next(self) -> Self {
        Self::ALL[(self as usize + 1) % Self::ALL.len()]
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
pub enum Stage {
    Unprepared,
    Prepared,
    Growing,
    Harvestable,
    Harvested,
    Failed,
}

impl Stage {
    pub fn label(self) -> &'static str {
        [
            "Unprepared",
            "Prepared",
            "Growing",
            "Harvestable",
            "Harvested",
            "Failed",
        ][self as usize]
    }
}

#[derive(Clone, Deserialize, Serialize)]
pub struct Bed {
    pub offset: Vec2,
    pub dimensions: Vec2,
    pub crop: Crop,
    pub stage: Stage,
    pub density: f64,
    pub irrigation: bool,
    pub collect_residues: bool,
    pub moisture: f64,
    pub fertility: f64,
    pub growth: f64,
    progress_seconds: f64,
    drought_seconds: f64,
    damage: f64,
    #[serde(default)]
    pub irrigated_liters: f64,
    stress: f64,
    ripe_at: f64,
    residue_kg: f64,
    amendment_kg: f64,
}

#[derive(Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
pub enum FarmAction {
    Prepare,
    Plant,
    Harvest,
    Clear,
    Amend,
    Collect,
}

#[derive(Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
pub enum FarmPhase {
    Pickup,
    Walk,
    Work,
    Return,
    CollectOutput,
}

#[derive(Deserialize, Serialize)]
pub struct FarmJob {
    pub site: usize,
    pub bed: usize,
    pub action: FarmAction,
    pub worker: Option<usize>,
    pub phase: FarmPhase,
    pub work: f64,
    pub required: f64,
    pub inputs: BTreeMap<String, u32>,
    pub output: BTreeMap<String, u32>,
    #[serde(default)]
    pub food_output: Option<crate::food::FoodLots>,
    pub retry: f64,
    #[serde(default)]
    pub waiting_for_access: bool,
    #[serde(default)]
    pub pickups: u32,
    #[serde(default)]
    pub fare: u64,
}

impl Plot {
    pub fn new(kind: &str, size: IVec2) -> Option<Self> {
        let mut beds = Vec::new();
        match kind {
            "garden" => {
                for x in [-1.5, 1.5] {
                    for z in [-2.6, 2.6] {
                        beds.push(Bed::new(Vec2::new(x, z), 4.0));
                    }
                }
            }
            "greenhouse" => beds.extend([-1.2, 1.2].map(|x| Bed::new(Vec2::new(x, 0.0), 8.0))),
            "field" => {
                for x in ((-size.x + 1)..size.x).step_by(2) {
                    for z in ((-size.y + 1)..size.y - 1).step_by(2) {
                        let length = (size.y - 1 - z).min(2) as f32;
                        beds.push(Bed::new(
                            Vec2::new(x as f32, z as f32 + length * 0.5),
                            length,
                        ));
                    }
                }
            }
            _ => return None,
        }
        Some(Self {
            beds,
            remainders: [0.0; 3],
            warning: None,
        })
    }

    pub(crate) fn update_warning(&mut self, clock: f64) -> Option<CropWarning> {
        let warning = self
            .beds
            .iter()
            .filter_map(|bed| {
                if bed.stage == Stage::Failed {
                    Some(CropWarning::Failed)
                } else if bed.harvest_expired(clock) {
                    Some(CropWarning::Expired)
                } else if bed.standing() && bed.drought_damage() > 0.0 {
                    Some(CropWarning::Damaged)
                } else if bed.standing() && bed.moisture < 0.2 {
                    Some(CropWarning::Wilting)
                } else {
                    None
                }
            })
            .max();
        let previous = std::mem::replace(&mut self.warning, warning);
        warning.filter(|warning| Some(*warning) != previous)
    }

    pub fn field_size_valid(size: IVec2) -> bool {
        size.cmpge(IVec2::splat(2)).all() && size.cmple(IVec2::splat(32)).all()
    }

    pub fn resize_field(&mut self, size: IVec2, shift: IVec2) -> Result<(), &'static str> {
        let mut layout = Self::new("field", size).expect("valid field dimensions");
        let mut remaining: BTreeMap<_, _> = self
            .beds
            .iter()
            .map(|bed| {
                let offset = bed.offset - shift.as_vec2();
                (
                    (offset.x as i32, offset.y as i32, bed.dimensions.y as i32),
                    bed,
                )
            })
            .collect();
        for bed in &mut layout.beds {
            let key = (
                bed.offset.x as i32,
                bed.offset.y as i32,
                bed.dimensions.y as i32,
            );
            if let Some(old) = remaining.remove(&key) {
                let offset = bed.offset;
                *bed = old.clone();
                bed.offset = offset;
            }
        }
        if remaining.values().any(|bed| {
            !matches!(
                bed.stage,
                Stage::Unprepared | Stage::Prepared | Stage::Harvested
            ) || bed.residue_kg >= 1.0
                || bed.amendment_kg >= 1.0
        }) {
            return Err("Clear crops and collect residues before shrinking occupied beds.");
        }
        for bed in remaining.values() {
            layout.beds[0].residue_kg += bed.residue_kg;
            layout.beds[0].amendment_kg += bed.amendment_kg;
        }
        self.beds = layout.beds;
        Ok(())
    }

    pub fn finish(&mut self, job: &FarmJob, clock: f64, sandbox: bool) -> BTreeMap<String, u32> {
        let bed = &mut self.beds[job.bed];
        let area = bed.area();
        let mut output = BTreeMap::new();
        match job.action {
            FarmAction::Prepare => bed.stage = Stage::Prepared,
            FarmAction::Plant => {
                bed.stage = if sandbox {
                    Stage::Harvestable
                } else {
                    Stage::Growing
                };
                bed.growth = if sandbox { 1.0 } else { 0.0 };
                bed.stress = 0.0;
                bed.progress_seconds = 0.0;
                bed.drought_seconds = 0.0;
                bed.damage = 0.0;
                bed.ripe_at = clock;
            }
            FarmAction::Amend => bed.amendment_kg += f64::from(job.inputs["compost"]),
            FarmAction::Collect => collect_residues(bed, &mut output),
            FarmAction::Clear | FarmAction::Harvest => {
                let edible = if job.action == FarmAction::Harvest {
                    bed.yield_kg(clock)
                } else {
                    0.0
                };
                let remainder = &mut self.remainders[bed.crop as usize];
                let total = *remainder + edible;
                let units = total.floor() as u32;
                *remainder = total.fract();
                if units > 0 {
                    output.insert(bed.crop.material().into(), units);
                }
                bed.residue_kg += area * bed.crop.residue() * bed.growth * bed.health();
                if bed.collect_residues {
                    collect_residues(bed, &mut output);
                }
                bed.fertility = (bed.fertility - f64::from(units) / (area * 20.0)).max(0.0);
                bed.stage = Stage::Harvested;
                bed.growth = 0.0;
            }
        }
        output
    }
}

fn collect_residues(bed: &mut Bed, output: &mut BTreeMap<String, u32>) {
    let units = bed.residue_kg.floor() as u32;
    bed.residue_kg -= f64::from(units);
    if units > 0 {
        output.insert("scraps".into(), units);
    }
}

impl Bed {
    pub fn next_density(&self) -> f64 {
        if self.density == 1.5 {
            0.5
        } else {
            self.density + 0.5
        }
    }

    fn new(offset: Vec2, length: f32) -> Self {
        Self {
            offset,
            dimensions: Vec2::new(1.2, length),
            crop: Crop::Greens,
            stage: Stage::Unprepared,
            density: 1.0,
            irrigation: true,
            collect_residues: false,
            moisture: 0.75,
            fertility: 1.0,
            growth: 0.0,
            progress_seconds: 0.0,
            drought_seconds: 0.0,
            damage: 0.0,
            irrigated_liters: 0.0,
            stress: 0.0,
            ripe_at: 0.0,
            residue_kg: 0.0,
            amendment_kg: 0.0,
        }
    }

    pub fn area(&self) -> f64 {
        1.2 * f64::from(self.dimensions.y)
    }

    fn health(&self) -> f64 {
        let conditioned = if self.progress_seconds > 0.0 {
            (1.0 - self.stress / self.progress_seconds).max(0.0)
        } else {
            1.0
        };
        conditioned.min(1.0 - self.damage)
    }

    fn standing(&self) -> bool {
        matches!(self.stage, Stage::Growing | Stage::Harvestable)
    }

    pub fn drought_damage(&self) -> f64 {
        self.damage
    }

    pub fn harvest_expired(&self, clock: f64) -> bool {
        self.stage == Stage::Harvestable && self.harvest_factor(clock) == 0.0
    }

    fn harvest_factor(&self, clock: f64) -> f64 {
        if self.stage != Stage::Harvestable {
            return 1.0;
        }
        let window = self.crop.window();
        (1.0 - ((clock - self.ripe_at) / DAY - window).max(0.0) / window).max(0.0)
    }

    pub fn visual_health(&self, clock: f64) -> f64 {
        self.health() * self.harvest_factor(clock).max(0.15)
    }

    pub fn yield_kg(&self, clock: f64) -> f64 {
        self.area() * self.crop.yield_kg() * self.density.min(1.2)
            / (1.0 + (self.density - 1.0).max(0.0) * 1.5)
            * self.health()
            * self.harvest_factor(clock)
    }

    pub fn editable(&self) -> bool {
        matches!(
            self.stage,
            Stage::Unprepared | Stage::Prepared | Stage::Harvested
        )
    }

    pub fn requirements(
        &self,
        action: FarmAction,
        clock: f64,
    ) -> Result<(BTreeMap<String, u32>, f64), &'static str> {
        let allowed = match action {
            FarmAction::Prepare => matches!(self.stage, Stage::Unprepared | Stage::Harvested),
            FarmAction::Plant => self.stage == Stage::Prepared,
            FarmAction::Harvest => {
                self.stage == Stage::Harvestable && self.harvest_factor(clock) > 0.0
            }
            FarmAction::Clear => self.standing() || self.stage == Stage::Failed,
            FarmAction::Amend => true,
            FarmAction::Collect => self.residue_kg >= 1.0,
        };
        if !allowed {
            return Err(match action {
                FarmAction::Plant => "Prepare the soil before planting.",
                FarmAction::Harvest => "There is no ripe harvest remaining in this bed.",
                _ => "That action is unavailable for this bed.",
            });
        }
        let mut input = BTreeMap::new();
        if action == FarmAction::Plant {
            input.insert(
                self.crop.seed().into(),
                (self.area() * self.density / 4.0).ceil().max(1.0) as u32,
            );
        } else if action == FarmAction::Amend {
            input.insert("compost".into(), (self.area() * 0.5).ceil() as u32);
        }
        let work = match action {
            FarmAction::Prepare => 18.0,
            FarmAction::Plant => 12.0 * self.density,
            FarmAction::Harvest => 15.0 * self.density,
            FarmAction::Clear => 8.0,
            FarmAction::Amend | FarmAction::Collect => 5.0,
        };
        Ok((input, (self.area() * work).ceil()))
    }

    fn growing_condition(&self) -> f64 {
        (self.moisture / 0.4).min(1.0) * (0.3 + 0.7 * self.fertility)
            / (1.0 + (self.density - 1.0).max(0.0))
    }

    pub fn harvest_forecast(&self, clock: f64, season: f64) -> Option<f64> {
        match self.stage {
            Stage::Harvestable if self.harvest_factor(clock) > 0.0 => Some(0.0),
            Stage::Growing => {
                let rate = self.growing_condition() * season;
                (rate > 0.0).then(|| (1.0 - self.growth) * self.crop.days() / rate)
            }
            _ => None,
        }
    }

    pub fn tick(&mut self, climate: CropClimate, mut use_water: impl FnMut(f64) -> bool) {
        let CropClimate {
            clock,
            dt,
            rain,
            season,
            sheltered,
            sandbox,
        } = climate;
        let area = self.area();
        let days = dt / DAY;
        let residue_decay = self.residue_kg * -(-days / 60.0).exp_m1();
        let amendment_decay = self.amendment_kg * -(-days / 30.0).exp_m1();
        self.residue_kg -= residue_decay;
        self.amendment_kg -= amendment_decay;
        self.fertility =
            (self.fertility + (residue_decay + amendment_decay) / (area * 8.0)).min(1.0);
        if sandbox {
            return;
        }
        let cover = (self.residue_kg / (area * 0.5)).min(1.0);
        let water = if self.standing() {
            self.crop.water() * self.density
        } else {
            1.0
        };
        let demand = area * water * (1.0 - 0.4 * cover) * days;
        let rain = if sheltered {
            0.0
        } else {
            area * rain * 24.0 * days
        };
        let refill = (demand - rain).max(0.0) + area * 2.0 * days;
        let irrigated = if self.standing()
            && self.harvest_factor(clock) > 0.0
            && self.irrigation
            && self.moisture < 0.75
            && rain < demand
            && use_water(refill)
        {
            refill
        } else {
            0.0
        };
        self.irrigated_liters += irrigated;
        self.moisture =
            (self.moisture + (rain + irrigated - demand) / (area * 16.0)).clamp(0.0, 1.0);
        if !self.standing() {
            return;
        }
        self.drought_seconds = if self.moisture < 0.1 {
            self.drought_seconds + dt
        } else {
            0.0
        };
        self.damage = self
            .damage
            .max(((self.drought_seconds - DAY) / (6.0 * DAY)).clamp(0.0, 1.0));
        if self.damage >= 1.0 {
            self.stage = Stage::Failed;
            return;
        }
        let condition = self.growing_condition();
        self.progress_seconds += dt;
        self.stress += dt * (1.0 - condition);
        if self.stage == Stage::Growing {
            self.growth = (self.growth
                + days / self.crop.days() * condition * if sheltered { 1.0 } else { season })
            .min(1.0);
            if self.growth >= 1.0 {
                self.stage = Stage::Harvestable;
                self.ripe_at = clock;
            }
        }
    }
}

#[derive(Clone, Copy)]
pub struct CropClimate {
    pub clock: f64,
    pub dt: f64,
    pub rain: f64,
    pub season: f64,
    pub sheltered: bool,
    pub sandbox: bool,
}

impl Farming {
    pub fn has_worker(&self, worker: usize) -> bool {
        self.jobs.iter().any(|job| job.worker == Some(worker))
    }

    pub fn valid_save(&self, has_plot: impl Fn(usize) -> bool) -> bool {
        self.plots.iter().all(|(&id, plot)| {
            has_plot(id)
                && !plot.beds.is_empty()
                && plot.beds.len() <= 32 * 31
                && plot.beds.iter().all(|bed| {
                    bed.offset.is_finite()
                        && bed.dimensions.is_finite()
                        && bed.dimensions.x == 1.2
                        && bed.dimensions.y >= 1.0
                        && [0.5, 1.0, 1.5].contains(&bed.density)
                        && bed.irrigated_liters.is_finite()
                        && bed.irrigated_liters >= 0.0
                        && [bed.moisture, bed.fertility, bed.growth]
                            .iter()
                            .all(|value| (0.0..=1.0).contains(value))
                })
        }) && self.jobs.iter().all(|job| {
            self.plots
                .get(&job.site)
                .is_some_and(|plot| job.bed < plot.beds.len())
                && (0.0..=job.required).contains(&job.work)
                && job.worker.is_none_or(|id| id < 5)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn irrigated_greens_mature_in_45_days_and_preserve_fractional_harvest() {
        let mut plot = Plot::new("garden", IVec2::new(3, 5)).unwrap();
        let mut job = FarmJob {
            site: 0,
            bed: 0,
            action: FarmAction::Prepare,
            worker: None,
            phase: FarmPhase::Work,
            work: 0.0,
            required: 1.0,
            inputs: BTreeMap::new(),
            output: BTreeMap::new(),
            food_output: None,
            retry: 0.0,
            waiting_for_access: false,
            pickups: 0,
            fare: 0,
        };
        plot.finish(&job, 0.0, false);
        job.action = FarmAction::Plant;
        let (seeds, work) = plot.beds[0].requirements(FarmAction::Plant, 0.0).unwrap();
        assert_eq!(seeds["greens_seed"], 2);
        assert_eq!(work, 58.0);
        plot.finish(&job, 0.0, false);
        let mut withdrawn = 0.0;
        for hour in 1..=45 * 24 + 1 {
            let dt = DAY / 24.0;
            plot.beds[0].tick(
                CropClimate {
                    clock: dt * f64::from(hour),
                    dt,
                    rain: 0.0,
                    season: 1.0,
                    sheltered: true,
                    sandbox: false,
                },
                |amount| {
                    withdrawn += amount;
                    true
                },
            );
        }
        assert!(plot.beds[0].stage == Stage::Harvestable);
        assert!(withdrawn > 0.0);
        assert_eq!(plot.beds[0].irrigated_liters, withdrawn);
        job.action = FarmAction::Harvest;
        let output = plot.finish(&job, 45.5 * DAY, false);
        assert_eq!(output["greens"], 9);
        assert!((plot.remainders[0] - 0.6).abs() < 1e-9);
    }

    #[test]
    fn prolonged_drought_fails_a_standing_crop() {
        let mut bed = Bed::new(Vec2::ZERO, 4.0);
        bed.stage = Stage::Growing;
        bed.moisture = 0.0;
        for hour in 0..=8 * 24 {
            let dt = DAY / 24.0;
            bed.tick(
                CropClimate {
                    clock: dt * f64::from(hour),
                    dt,
                    rain: 0.0,
                    season: 1.0,
                    sheltered: false,
                    sandbox: false,
                },
                |_| false,
            );
        }
        assert!(bed.stage == Stage::Failed);
        assert_eq!(bed.yield_kg(8.0 * DAY), 0.0);
    }
}
