use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize)]
pub struct KitchenPolicy {
    pub automatic: bool,
    fresh_half_days: u8,
    provision_half_days: u8,
    #[serde(skip)]
    pub next_check: f64,
}

impl Default for KitchenPolicy {
    fn default() -> Self {
        Self {
            automatic: false,
            fresh_half_days: 2,
            provision_half_days: 4,
            next_check: 0.0,
        }
    }
}

impl KitchenPolicy {
    pub fn toggle(&mut self) {
        self.automatic = !self.automatic;
        self.next_check = 0.0;
    }

    pub fn half_days(&self, preserved: bool) -> u8 {
        if preserved {
            self.provision_half_days
        } else {
            self.fresh_half_days
        }
    }

    pub fn target(&self, preserved: bool) -> u64 {
        (15 * u64::from(self.half_days(preserved))).div_ceil(2)
    }

    pub fn change(&mut self, preserved: bool, amount: i8) {
        let value = if preserved {
            &mut self.provision_half_days
        } else {
            &mut self.fresh_half_days
        };
        *value = value.saturating_add_signed(amount).min(14);
        self.next_check = 0.0;
    }

    pub fn status(&self) -> String {
        let state = if self.automatic { "on" } else { "off" };
        format!(
            "Y Automatic cooking {state}\nM Fresh target {:.1} days · X Dried target {:.1} days · Shift decreases",
            f64::from(self.fresh_half_days) / 2.0,
            f64::from(self.provision_half_days) / 2.0
        )
    }

    pub fn valid(&self) -> bool {
        self.fresh_half_days <= 14 && self.provision_half_days <= 14
    }
}
