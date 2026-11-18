use crate::market::fare_cents;

use super::*;

impl Construction {
    pub fn trade_input(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        keys: &ButtonInput<KeyCode>,
        clock: TownClock,
    ) {
        let options = Trade::tradable(catalog);
        let pages = options.len().div_ceil(PAGE_KEYS.len());
        if keys.just_pressed(KeyCode::PageDown) {
            self.trade.page = (self.trade.page + 1) % pages;
        } else if keys.just_pressed(KeyCode::PageUp) {
            self.trade.page = (self.trade.page + pages - 1) % pages;
        }
        if let Some(number) = PAGE_KEYS.iter().position(|key| keys.just_pressed(*key)) {
            let index = self.trade.page * PAGE_KEYS.len() + number;
            if index < options.len() {
                self.trade.selected = index;
                self.trade.notice.clear();
            }
        }
        let Some((id, definition)) = options.get(self.trade.selected).copied() else {
            return;
        };
        if keys.just_pressed(KeyCode::Enter) {
            let day = ((540.0 + clock.seconds * 0.45) / 1440.0).floor() as u64;
            let fare = fare_cents(clock.round_trip_km);
            self.trade.notice =
                match self
                    .trade
                    .reserve(catalog, stock, &mut self.market, id, (day, fare, 0))
                {
                    Ok(quantity) => format!("{quantity} {} reserved for town.", definition.name),
                    Err(error) => error.into(),
                };
        }
        if keys.just_pressed(KeyCode::Backspace) {
            let active = self.trip.as_ref().is_some_and(|trip| trip.export);
            self.trade.cancel_last(stock, &mut self.market, active);
        }
        let policy = self.trade.policies.entry(id.into()).or_default();
        if keys.just_pressed(KeyCode::KeyT) {
            policy.enabled = !policy.enabled;
        }
        if keys.just_pressed(KeyCode::BracketLeft) {
            policy.reserve = policy.reserve.saturating_sub(definition.pack);
        }
        if keys.just_pressed(KeyCode::BracketRight) {
            policy.reserve = policy.reserve.saturating_add(definition.pack);
        }
        if keys.just_pressed(KeyCode::KeyY) {
            policy.limit = match policy.limit {
                0 => definition.pack,
                set if set == definition.pack => definition.pack * 2,
                _ => 0,
            };
        }
        if keys.just_pressed(KeyCode::KeyR) {
            policy.trigger = match policy.trigger {
                0 => definition.pack,
                set if set == definition.pack => definition.pack * 2,
                _ => 0,
            };
        }
    }

    pub fn trade_status(&self, catalog: &Catalog, stock: &Stock, clock: TownClock) -> String {
        let options = Trade::tradable(catalog);
        let mut display = String::from("Town trade · Page Up/Down · 1–8 Select\n");
        for (index, &(id, item)) in options
            .iter()
            .skip(self.trade.page * PAGE_KEYS.len())
            .take(PAGE_KEYS.len())
            .enumerate()
        {
            if id == options[self.trade.selected].0 {
                display.push_str("› ");
            }
            display.push_str(&format!(
                "{} {} · {} in stock\n",
                index + 1,
                item.name,
                stock.available(id)
            ));
        }
        let (id, item) = options[self.trade.selected];
        let buyer = &item.buyer.name;
        let day = ((540.0 + clock.seconds * 0.45) / 1440.0).floor() as u64;
        let quote = match self.trade.quote(catalog, stock, id, day, 0) {
            Ok((qty, cents)) => format!(
                "{qty} for R${:.2} · Fuel R${:.2}",
                cents as f64 / 100.0,
                fare_cents(clock.round_trip_km) as f64 / 100.0
            ),
            Err(error) => error.into(),
        };
        display.push_str(&format!(
            "{buyer} · {quote}\nEnter Sell batch · Backspace Cancel last queued\n"
        ));
        let policy = self.trade.policies.get(id);
        let on = if policy.is_some_and(|policy| policy.enabled) {
            "on"
        } else {
            "off"
        };
        let reserve = policy.map_or(0, |policy| policy.reserve);
        let trigger = policy.map_or(0, |policy| policy.trigger);
        let limit = policy.map_or(0, |policy| policy.limit);
        display.push_str(&format!("T Auto-sale {on} · [ / ] Reserve {reserve}\nR Trigger {trigger} · Y Daily cap {limit} (0 unlimited)\n{} queued · {} delivered",
            self.trade.orders.len(), self.trade.receipts));
        if !self.trade.notice.is_empty() {
            display.push('\n');
            display.push_str(&self.trade.notice);
        }
        display
    }
}
