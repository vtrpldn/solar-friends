//! Town terms are seeded and read-only; confirmed receipts retain their prices.
use crate::*;

pub const INTRO_DAYS: u32 = 14;
pub const WEEK: u32 = 7;
#[derive(Clone, Serialize, Deserialize)]
pub struct State {
    pub schema: u32,
    pub enabled: bool,
    pub last_period: u32,
    pub used: u32,
}

#[cfg(test)]
#[path = "market_tests.rs"]
mod tests;
impl Default for State {
    fn default() -> Self {
        Self {
            schema: 1,
            enabled: true,
            last_period: 0,
            used: 0,
        }
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Discount {
    pub material: usize,
    pub units: u32,
    pub unit_price: i64,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Terms {
    pub day: u32,
    pub active: bool,
    pub items: economy::Bundle,
    pub prices: [i64; economy::COUNT],
    pub discount: Option<Discount>,
    pub fee: i64,
    pub arrival: Option<f32>,
}
impl Terms {
    pub fn total(&self) -> i64 {
        let saving = self.discount.as_ref().map_or(0, |d| {
            i64::from(d.units) * (self.prices[d.material] - d.unit_price)
        });
        self.items
            .iter()
            .zip(self.prices)
            .map(|(&n, p)| i64::from(n) * p)
            .sum::<i64>()
            + self.fee
            - saving
    }
}
pub fn today(v: &Village) -> u32 {
    (v.minutes / 1440.) as u32
}
pub fn active(v: &Village, day: u32) -> bool {
    v.market.enabled && (v.mode == modes::Mode::Sandbox || day >= INTRO_DAYS)
}
pub fn prices(v: &Village, day: u32, enabled: bool) -> [i64; economy::COUNT] {
    std::array::from_fn(|i| {
        let base = economy::PRICES[i];
        if !enabled || (v.mode != modes::Mode::Sandbox && day < INTRO_DAYS) || base == 0 {
            return base;
        }
        let seasonal = match i {
            0..=3 | 5..=7 => {
                if climate::season_is_wet(v, day) {
                    5
                } else {
                    -3
                }
            }
            9 | 14 | economy::FODDER => {
                if climate::season_is_wet(v, day) {
                    -3
                } else {
                    5
                }
            }
            economy::FOOD | economy::SEEDLINGS => {
                if climate::season_is_wet(v, day) {
                    -4
                } else {
                    4
                }
            }
            _ => 0,
        };
        let weekly =
            (simulation::sample(v.simulation.seed, 70 + i as u32, day / WEEK) % 7) as i64 - 3;
        base * (100 + seasonal + weekly) / 100
    })
}
fn offer(v: &Village, period: u32) -> (usize, u32) {
    const CHOICES: [usize; 22] = [
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 21, 22, 23, 24, 27, 28,
    ];
    let material =
        CHOICES[simulation::sample(v.simulation.seed, 110, period) as usize % CHOICES.len()];
    let quantity = if economy::PRICES[material] >= 20_000 {
        1 + simulation::sample(v.simulation.seed, 111, period) % 2
    } else if material == economy::FODDER {
        20
    } else {
        6 + simulation::sample(v.simulation.seed, 111, period) % 7
    };
    (material, quantity)
}
pub fn available(v: &Village, period: u32) -> u32 {
    if v.mode != modes::Mode::Sandbox && period * WEEK < INTRO_DAYS {
        return 0;
    }
    offer(v, period)
        .1
        .saturating_sub(if v.market.last_period == period {
            v.market.used
        } else {
            0
        })
}
pub fn delivery(v: &Village, dispatch: f32, enabled: bool) -> f32 {
    let basic =
        (dispatch / 1440.).floor() * 1440. + if dispatch % 1440. < 600. { 600. } else { 2040. };
    let day = (basic / 1440.) as u32;
    let delayed = enabled
        && (v.mode == modes::Mode::Sandbox || day >= INTRO_DAYS)
        && climate::seasonal_rain(v, day)
        && simulation::sample(v.simulation.seed, 112, day).is_multiple_of(4);
    basic + if delayed { 1440. } else { 0. }
}
pub fn terms(v: &Village, items: economy::Bundle, pickup: bool) -> Terms {
    let day = today(v);
    let active = active(v, day);
    let prices = prices(v, day, active);
    let (material, _) = offer(v, day / WEEK);
    let units = if active {
        items[material].min(available(v, day / WEEK))
    } else {
        0
    };
    Terms {
        day,
        active,
        items,
        prices,
        discount: (units > 0).then(|| Discount {
            material,
            units,
            unit_price: prices[material] * 90 / 100,
        }),
        fee: if pickup { 2000 } else { 6000 },
        arrival: (!pickup).then(|| delivery(v, v.minutes + 120., active)),
    }
}
pub fn commit(v: &mut Village, terms: &Terms) {
    if let Some(d) = &terms.discount {
        let period = terms.day / WEEK;
        if v.market.last_period != period {
            v.market.last_period = period;
            v.market.used = 0;
        }
        v.market.used += d.units;
    }
}
pub fn release(v: &mut Village, terms: Option<&Terms>) {
    if let Some(t) = terms
        && t.day / WEEK == v.market.last_period
        && let Some(d) = &t.discount
    {
        v.market.used = v.market.used.saturating_sub(d.units);
    }
}
pub fn paid_valid(v: &Village, o: &economy::Order) -> bool {
    let Some(t) = &o.terms else {
        return o.paid
            == o.items
                .iter()
                .zip(economy::PRICES)
                .map(|(&n, p)| i64::from(n) * p)
                .sum::<i64>()
                + if o.pickup_by.is_some() { 2000 } else { 6000 };
    };
    if t.day > today(v)
        || t.active && v.mode != modes::Mode::Sandbox && t.day < INTRO_DAYS
        || t.items != o.items
        || t.items[economy::SCRAPS] != 0
        || t.prices != prices(v, t.day, t.active)
        || t.fee != if o.pickup_by.is_some() { 2000 } else { 6000 }
    {
        return false;
    }
    if let Some(d) = &t.discount {
        let (material, quantity) = offer(v, t.day / WEEK);
        if !t.active
            || d.material != material
            || d.units == 0
            || d.units > quantity
            || d.units > o.items[material]
            || d.unit_price != t.prices[material] * 90 / 100
        {
            return false;
        }
    }
    if o.pickup_by.is_none() {
        if o.dispatch < 120.
            || t.day != ((o.dispatch - 120.) / 1440.) as u32
            || t.arrival != Some(o.arrival)
            || o.arrival != delivery(v, o.dispatch, t.active)
        {
            return false;
        }
    } else if t.arrival.is_some() || t.day > (o.dispatch / 1440.) as u32 {
        return false;
    }
    o.paid == t.total()
}
pub fn valid(v: &Village) -> bool {
    let s = &v.market;
    if s.schema != 1
        || s.last_period > today(v) / WEEK
        || s.used
            > if v.mode != modes::Mode::Sandbox && s.last_period * WEEK < INTRO_DAYS {
                0
            } else {
                offer(v, s.last_period).1
            }
    {
        return false;
    }
    let claimed = v
        .economy
        .orders
        .iter()
        .filter(|o| o.status != "cancelled")
        .filter_map(|o| o.terms.as_ref())
        .filter(|t| t.day / WEEK == s.last_period)
        .filter_map(|t| t.discount.as_ref())
        .map(|d| u64::from(d.units))
        .sum::<u64>();
    let future = v
        .economy
        .orders
        .iter()
        .filter(|o| o.status != "cancelled")
        .filter_map(|o| o.terms.as_ref())
        .any(|t| t.discount.is_some() && t.day / WEEK > s.last_period);
    !future && claimed <= u64::from(s.used)
}
pub fn view(v: &Village) -> serde_json::Value {
    let day = today(v);
    let enabled = active(v, day);
    let period = day / WEEK;
    let notice = |day: u32, remaining: bool| {
        let enabled = active(v, day);
        let (material, stock) = offer(v, day / WEEK);
        let prices = prices(v, day, enabled);
        serde_json::json!({"day":day,"season":if climate::season_is_wet(v, day){"wet"}else{"dry"},"prices":prices,
            "delivery":delivery(v,day as f32*1440.+600.,enabled),
            "offer":if enabled {Some(serde_json::json!({"material":material,"stock":stock,"remaining":if remaining {available(v,day/WEEK)}else{stock},"unit_price":prices[material]*90/100}))}else{None}})
    };
    serde_json::json!({"enabled":v.market.enabled,"active":enabled,"starts_day":INTRO_DAYS,"period":period,"restock_day":(period+1)*WEEK,
        "current":notice(day,true),"next":notice((period+1)*WEEK,false),
        "calendar":(0..7).map(|n|notice(day+n,(day+n)/WEEK==period)).collect::<Vec<_>>(),
        "next_delivery":delivery(v,v.minutes+120.,enabled)})
}
pub fn check_token(v: &Village, data: &str, pickup: bool, token: &str) -> Result<(), String> {
    let items = economy::parse_items(data)?;
    if token != serde_json::to_string(&terms(v, items, pickup)).unwrap() {
        return Err("Town prices, offer stock or delivery dates changed. Review the basket and confirm again.".into());
    }
    Ok(())
}
#[wasm_bindgen]
impl Game {
    pub fn set_supplier_variation(&mut self, enabled: bool) {
        if scenarios::journal::challenge::rules_locked(self.app.world().resource::<Village>()) {
            return;
        }
        self.app
            .world_mut()
            .resource_mut::<Village>()
            .market
            .enabled = enabled;
    }
    pub fn supplier_report(&self) -> String {
        view(self.app.world().resource::<Village>()).to_string()
    }
    pub fn supply_order_quote(&self, data: &str, pickup: bool) -> String {
        let v = self.app.world().resource::<Village>();
        let items = match economy::parse_items(data) {
            Ok(items) => items,
            Err(reason) => {
                return serde_json::json!({"allowed":false,"total":0,"reason":reason,"token":null})
                    .to_string();
            }
        };
        let t = terms(v, items, pickup);
        let result = economy::quote_with_fee(v, items, t.fee);
        let reason = result.err();
        serde_json::json!({"allowed":reason.is_none(),"reason":reason,"total":t.total(),"terms":t,"token":serde_json::to_string(&t).unwrap()}).to_string()
    }
    pub fn order_supplies_quoted(&mut self, data: &str, token: &str) -> String {
        if let Err(e) = check_token(self.app.world().resource::<Village>(), data, false, token) {
            return e;
        }
        self.order_supplies(data)
    }
    pub fn order_supplies_pickup_quoted(
        &mut self,
        data: &str,
        resident: usize,
        token: &str,
    ) -> String {
        if let Err(e) = check_token(self.app.world().resource::<Village>(), data, true, token) {
            return e;
        }
        self.order_supplies_pickup(data, resident)
    }
}
