//! Optional Sandbox constraints reuse the Story simulation without its unlocks.
use crate::*;

#[derive(Clone, Copy, Default, Debug, PartialEq, Serialize, Deserialize)]
pub struct Rules {
    pub logistics: bool,
    pub land: bool,
    pub utilities: bool,
    #[serde(default)]
    pub supplied_energy: f64,
}
/// Older fixtures and villages already modelled soil and connected electricity.
pub fn legacy() -> Rules {
    Rules {
        land: true,
        utilities: true,
        ..Rules::default()
    }
}
pub fn logistics(v: &Village) -> bool {
    v.mode != modes::Mode::Sandbox || v.sandbox_rules.logistics
}
pub fn land(v: &Village) -> bool {
    v.mode != modes::Mode::Sandbox || v.sandbox_rules.land
}
pub fn utilities(v: &Village) -> bool {
    v.mode != modes::Mode::Sandbox || v.sandbox_rules.utilities
}
pub fn valid(v: &Village) -> bool {
    v.sandbox_rules.supplied_energy.is_finite()
        && (0.0..=1e9).contains(&v.sandbox_rules.supplied_energy)
}
pub fn report(v: &Village) -> serde_json::Value {
    serde_json::json!({"editable":v.mode==modes::Mode::Sandbox,"logistics":logistics(v),"land":land(v),"utilities":utilities(v),"supplied_energy":v.sandbox_rules.supplied_energy})
}
#[wasm_bindgen]
impl Game {
    pub fn sandbox_rules_report(&self) -> String {
        report(self.app.world().resource::<Village>()).to_string()
    }
    /// Keep owned property, paid lines and work in progress when changing rules.
    pub fn configure_sandbox_rules(
        &mut self,
        logistics: bool,
        land: bool,
        utilities: bool,
    ) -> bool {
        {
            let mut v = self.app.world_mut().resource_mut::<Village>();
            if v.mode != modes::Mode::Sandbox {
                return false;
            }
            v.sandbox_rules.logistics = logistics;
            v.sandbox_rules.land = land;
            v.sandbox_rules.utilities = utilities;
            v.power.frame = None;
            // Comfort preserves food dates. Enabling supply constraints applies
            // expiration to those original dates before exposing the new snapshot.
            freshness::advance(&mut v);
            modes::replenish(&mut v);
            economy::rebalance(&mut v);
        }
        self.sync_production_activities();
        self.sync_help();
        true
    }
}

#[cfg(test)]
mod tests;
