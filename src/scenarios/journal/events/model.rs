use super::*;
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EventDefinition {
    pub id: String,
    pub title: String,
    #[serde(rename = "when")]
    pub trigger: EventTrigger,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub condition: Option<GoalCondition>,
    pub effect: EventEffect,
}
impl EventDefinition {
    pub fn conditions(&self) -> impl Iterator<Item = &GoalCondition> {
        let trigger = match &self.trigger {
            EventTrigger::Threshold { condition } => Some(condition),
            _ => None,
        };
        trigger.into_iter().chain(self.condition.iter())
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum EventTrigger {
    Start,
    Goal { goal: String },
    Chapter { chapter: String },
    Date { minute: f32 },
    Threshold { condition: GoalCondition },
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum EventEffect {
    Message {
        text: String,
    },
    GrantFunds {
        cents: i64,
    },
    UnlockBuilding {
        building: String,
    },
    DeliverSupplies {
        material: String,
        count: u32,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        building: Option<String>,
    },
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EventRecord {
    pub watch: GoalState,
    pub triggered_at: Option<f32>,
    pub applied_at: Option<f32>,
    pub result: Option<EffectResult>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum EffectResult {
    Message,
    Funds {
        cents: i64,
    },
    BuildingUnlocked {
        building: String,
    },
    SuppliesDelivered {
        material: String,
        count: u32,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        building: Option<String>,
    },
}
