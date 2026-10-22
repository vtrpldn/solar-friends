//! Existing simulation counters; starting supplies and artwork grant no credit.
use super::*;
#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    Arrived,
    MealsServed,
    Mornings,
}
impl Kind {
    pub fn value(self, v: &Village) -> u32 {
        match self {
            Self::Arrived => u32::from(v.arrived),
            Self::MealsServed => v.meals_served,
            Self::Mornings => v.mornings,
        }
    }
    pub fn maximum(self) -> u32 {
        match self {
            Self::Arrived => 1,
            _ => 1_000_000,
        }
    }
    pub fn label(self) -> &'static str {
        match self {
            Self::Arrived => "Founding friends reached the clearing",
            Self::MealsServed => "Cooked meals eaten",
            Self::Mornings => "Mornings reached",
        }
    }
}
pub fn catalog() -> serde_json::Value {
    serde_json::json!([Kind::Arrived,Kind::MealsServed,Kind::Mornings].map(|kind|serde_json::json!({"id":kind,"name":kind.label(),"maximum":kind.maximum(),"credit":"run"})))
}
