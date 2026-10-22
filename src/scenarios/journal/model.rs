use super::*;
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Journal {
    pub schema: u32,
    pub introduction: String,
    pub chapters: Vec<Chapter>,
    pub completion: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Chapter {
    pub id: String,
    pub title: String,
    pub description: String,
    pub goals: Vec<Goal>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Goal {
    pub id: String,
    pub title: String,
    pub description: String,
    pub optional: bool,
    pub condition: GoalCondition,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum GoalCondition {
    Buildings {
        building: String,
        count: u32,
        credit: BuildingCredit,
    },
    Stored {
        material: String,
        count: u32,
    },
    Funds {
        cents: i64,
    },
    Date {
        minute: f32,
    },
    Harvests {
        count: u32,
        credit: CounterCredit,
    },
    Maintain {
        outcome: ObservedOutcome,
        minutes: u32,
    },
    Goal {
        goal: String,
    },
    All {
        conditions: Vec<GoalCondition>,
    },
    Any {
        conditions: Vec<GoalCondition>,
    },
}
#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ObservedOutcome {
    Pantry,
    Diet,
    Services,
    Night,
    Dry,
}
impl ObservedOutcome {
    pub fn index(self) -> usize {
        match self {
            Self::Pantry => outcomes::PANTRY,
            Self::Diet => outcomes::DIET,
            Self::Services => outcomes::SERVICES,
            Self::Night => outcomes::NIGHT,
            Self::Dry => outcomes::DRY,
        }
    }
    pub fn name(self) -> &'static str {
        match self {
            Self::Pantry => "Healthy residents with accessible pantry reserves",
            Self::Diet => "Healthy residents with accessible food reserves",
            Self::Services => "Healthy residents with working household washing and sanitation",
            Self::Night => "A fully powered streetlight during darkness",
            Self::Dry => {
                "A housed, healthy community with food, services and social wellbeing during the dry season"
            }
        }
    }
}
#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BuildingCredit {
    Present,
    AfterActivation,
}
#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CounterCredit {
    Run,
    AfterActivation,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct State {
    pub schema: u32,
    pub last_sample: f32,
    pub finished_at: Option<f32>,
    pub chapters: BTreeMap<String, Option<f32>>,
    pub goals: BTreeMap<String, GoalState>,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GoalState {
    pub activated_at: Option<f32>,
    pub completed_at: Option<f32>,
    pub harvest_baseline: u32,
    pub building_baseline: Vec<usize>,
}
