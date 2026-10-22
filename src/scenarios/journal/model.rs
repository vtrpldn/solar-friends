use super::*;
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Journal {
    pub schema: u32,
    pub introduction: String,
    pub chapters: Vec<Chapter>,
    pub completion: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub events: Vec<events::EventDefinition>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub locked_buildings: Vec<String>,
}
impl Journal {
    pub fn conditions(&self) -> impl Iterator<Item = &GoalCondition> {
        self.chapters
            .iter()
            .flat_map(|c| c.goals.iter().map(|g| &g.condition))
            .chain(self.events.iter().flat_map(|e| e.conditions()))
    }
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
        #[serde(default, skip_serializing_if = "Option::is_none")]
        region: Option<String>,
    },
    Crops {
        crop: String,
        count: u32,
        stage: land_use::CropStage,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        region: Option<String>,
    },
    Orchards {
        count: u32,
        stage: land_use::OrchardStage,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        region: Option<String>,
    },
    Livestock {
        building: String,
        count: u32,
        stage: land_use::AnimalStage,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        region: Option<String>,
    },
    MaterialSites {
        material: String,
        count: u32,
        stage: land_use::SourceStage,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        region: Option<String>,
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
    Delivered {
        material: String,
        count: u32,
        credit: CounterCredit,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        building: Option<String>,
    },
    Traded {
        direction: TradeDirection,
        material: String,
        count: u32,
        credit: CounterCredit,
    },
    Produced {
        material: String,
        count: u32,
        credit: CounterCredit,
    },
    Wellbeing {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        resident: Option<String>,
        energy_min: f32,
        hunger_max: f32,
        social_min: f32,
        happiness_min: f32,
        minutes: u32,
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
pub enum TradeDirection {
    Purchase,
    Sale,
}
impl TradeDirection {
    pub fn key(self, material: &str) -> String {
        format!(
            "{}:{material}",
            match self {
                Self::Purchase => "purchase",
                Self::Sale => "sale",
            }
        )
    }
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trade: Option<trade::Ledger>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub delivery: Option<delivery::Ledger>,
    pub chapters: BTreeMap<String, Option<f32>>,
    pub goals: BTreeMap<String, GoalState>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub events: BTreeMap<String, events::EventRecord>,
    #[serde(default, skip_serializing_if = "std::collections::BTreeSet::is_empty")]
    pub locked_buildings: std::collections::BTreeSet<String>,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GoalState {
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub wellbeing: BTreeMap<String, wellbeing::Watch>,
    pub activated_at: Option<f32>,
    pub completed_at: Option<f32>,
    pub harvest_baseline: u32,
    pub building_baseline: Vec<usize>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub production_baseline: BTreeMap<String, u64>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub trade_baseline: BTreeMap<String, u64>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub delivery_baseline: BTreeMap<String, u64>,
}
