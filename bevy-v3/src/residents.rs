pub mod mind;

use serde::{Deserialize, Serialize};

use crate::{
    catalog::Profile,
    weather::{DAY, game_hour},
};

#[derive(Deserialize, Serialize)]
pub struct Health {
    pub energy: f64,
    pub levels: [f64; 7],
    pub task: Option<NeedTask>,
    pub last_meal: Option<f64>,
    pub last_night: Option<u64>,
    pub retry_at: f64,
    #[serde(default)]
    pub friendships: [i16; 5],
    #[serde(default)]
    pub mind: mind::Mind,
}

#[derive(Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
pub enum Need {
    Hunger,
    Bladder,
    Bowels,
    Hygiene,
    Social,
    Fun,
    Hydration,
    Rest,
    Sleep,
    FetchWater,
    FilterWater,
}

#[derive(Deserialize, Serialize)]
pub struct NeedTask {
    pub kind: Need,
    pub facility: Option<usize>,
    pub elapsed: f64,
    pub duration: f64,
    pub water: f64,
    pub returning: bool,
    #[serde(default)]
    pub partner: Option<usize>,
    #[serde(default)]
    pub conversation: Option<mind::Conversation>,
}

impl Default for Health {
    fn default() -> Self {
        Self::new(0)
    }
}

impl Health {
    pub fn new(index: usize) -> Self {
        let index = index as f64;
        Self {
            energy: 85.0 + index * 3.0,
            levels: [
                76.0 + index * 3.0,
                82.0 - index * 5.0,
                88.0 - index * 3.0,
                90.0 - index * 2.0,
                78.0 + index * 3.0,
                82.0 - index * 2.0,
                100.0,
            ],
            task: None,
            last_meal: None,
            last_night: None,
            retry_at: 0.0,
            friendships: [0; 5],
            mind: mind::Mind::default(),
        }
    }

    pub fn decay(
        &mut self,
        profile: &Profile,
        temperature: f64,
        working: bool,
        sandbox: bool,
        dt: f64,
    ) {
        let asleep = self
            .task
            .as_ref()
            .is_some_and(|task| task.kind == Need::Sleep && task.elapsed > 0.0);
        let resting = self.task.as_ref().is_some_and(|task| {
            matches!(task.kind, Need::Sleep | Need::Rest) && task.elapsed > 0.0
        });
        if !resting {
            self.energy = (self.energy - dt * 0.035).max(0.0);
        }
        let scale = if asleep { 0.35 } else { 1.0 };
        let rates = [
            0.055,
            0.12,
            0.047,
            if working { 0.075 } else { 0.018 },
            0.035,
            if working { 0.055 } else { 0.025 },
        ];
        for (index, name) in ["hunger", "bladder", "bowels", "hygiene", "social", "fun"]
            .into_iter()
            .enumerate()
        {
            let rate = profile.rates.get(name).copied().unwrap_or(1.0);
            self.levels[index] = (self.levels[index] - rates[index] * dt * rate * scale).max(0.0);
        }
        let heat = ((temperature - 25.0) / 20.0).clamp(0.0, 0.5);
        let water = 2.5 * (1.0 + if working { 0.5 } else { 0.0 } + heat);
        self.levels[Need::Hydration as usize] = if sandbox {
            100.0
        } else {
            (self.levels[Need::Hydration as usize] - water * 40.0 * dt / DAY).max(0.0)
        };
    }

    pub fn pending(&self, profile: &Profile, clock: f64, food: bool) -> Vec<Need> {
        let hour = game_hour(clock);
        let mealtime = ((6.5..8.5).contains(&hour)
            || (12.0..14.0).contains(&hour)
            || (18.0..20.0).contains(&hour))
            && self
                .last_meal
                .is_none_or(|last| (clock - last) * 0.45 >= 180.0);
        let priorities = [
            (Need::Hunger, if mealtime { 80.0 } else { 30.0 }),
            (Need::Bladder, 30.0),
            (Need::Bowels, 30.0),
            (Need::Hygiene, 30.0),
            (Need::Social, profile.temperament.social_at),
            (Need::Fun, profile.temperament.break_at),
            (Need::Hydration, 70.0),
        ];
        let mut needs: Vec<_> = priorities
            .into_iter()
            .filter(|&(need, threshold)| {
                (need != Need::Hunger || food) && self.levels[need as usize] < threshold
            })
            .collect();
        needs.sort_by(|&(a, a_threshold), &(b, b_threshold)| {
            let score = |kind: Need, threshold| {
                self.levels[kind as usize] / threshold
                    - if matches!(
                        kind,
                        Need::Hunger | Need::Bladder | Need::Bowels | Need::Hydration
                    ) && self.levels[kind as usize] < 15.0
                    {
                        1.0
                    } else {
                        0.0
                    }
            };
            score(a, a_threshold).total_cmp(&score(b, b_threshold))
        });
        needs.into_iter().map(|(need, _)| need).collect()
    }

    pub fn hydration_factor(&self) -> f64 {
        0.5 + 0.5 * (self.levels[Need::Hydration as usize] / 30.0).min(1.0)
    }

    pub fn valid(&self) -> bool {
        (0.0..=100.0).contains(&self.energy)
            && self
                .levels
                .iter()
                .all(|value| (0.0..=100.0).contains(value))
            && self
                .friendships
                .iter()
                .all(|score| (0..=100).contains(score))
            && self.mind.valid()
            && self.task.as_ref().is_none_or(|task| {
                task.elapsed >= 0.0
                    && task.duration > 0.0
                    && (0.0..=12.0).contains(&task.water)
                    && task.partner.is_none_or(|partner| partner < 5)
                    && task.conversation.as_ref().is_none_or(|conversation| {
                        task.kind == Need::Social && conversation.valid()
                    })
            })
    }
}

impl Need {
    pub fn label(self) -> &'static str {
        match self {
            Self::Hunger => "Eating",
            Self::Bladder | Self::Bowels => "Using the toilet",
            Self::Hygiene => "Washing",
            Self::Social => "Socializing",
            Self::Fun => "Taking a break",
            Self::Hydration => "Drinking",
            Self::Rest => "Resting",
            Self::Sleep => "Sleeping",
            Self::FetchWater => "Fetching river water",
            Self::FilterWater => "Filtering water",
        }
    }
}
