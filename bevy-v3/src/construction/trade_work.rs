use crate::market::{fare_cents, freight_cents};

use super::*;

#[derive(Clone, Copy)]
pub(crate) enum TradeOrder {
    Buy { freight: bool },
    Sell,
    Cancel,
}

#[derive(Clone, Copy)]
pub(crate) enum TradePolicy {
    HouseholdRestock,
    AutomaticSale,
    Reserve(bool),
    Limit,
    Trigger,
}

impl Construction {
    pub fn page_trade(&mut self, catalog: &Catalog, forward: bool) {
        let pages = Trade::tradable(catalog)
            .len()
            .div_ceil(PAGE_KEYS.len())
            .max(1);
        self.trade.page = (self.trade.page + if forward { 1 } else { pages - 1 }) % pages;
    }

    pub fn trade_page_labels(&self, catalog: &Catalog) -> Vec<String> {
        Trade::tradable(catalog)
            .iter()
            .enumerate()
            .skip(self.trade.page * PAGE_KEYS.len())
            .take(PAGE_KEYS.len())
            .map(|(index, (_, item))| {
                if index == self.trade.selected {
                    format!("› {}", item.name)
                } else {
                    item.name.clone()
                }
            })
            .collect()
    }

    pub fn select_trade_row(&mut self, catalog: &Catalog, row: usize) {
        let index = self.trade.page * PAGE_KEYS.len() + row;
        if index < Trade::tradable(catalog).len() {
            self.trade.selected = index;
            self.trade.notice.clear();
        }
    }

    pub fn trade_input(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        keys: &ButtonInput<KeyCode>,
        clock: TownClock,
    ) {
        if keys.any_just_pressed([KeyCode::PageUp, KeyCode::PageDown]) {
            self.page_trade(catalog, keys.just_pressed(KeyCode::PageDown));
        }
        if let Some(row) = PAGE_KEYS.iter().position(|key| keys.just_pressed(*key)) {
            self.select_trade_row(catalog, row);
        }
        if keys.just_pressed(KeyCode::Digit0) {
            self.adjust_trade_policy(catalog, TradePolicy::HouseholdRestock);
        }
        if keys.any_just_pressed([KeyCode::KeyI, KeyCode::KeyD]) {
            self.place_trade_order(
                catalog,
                stock,
                clock,
                TradeOrder::Buy {
                    freight: keys.just_pressed(KeyCode::KeyD),
                },
            );
        }
        if keys.just_pressed(KeyCode::Enter) {
            self.place_trade_order(catalog, stock, clock, TradeOrder::Sell);
        }
        if keys.just_pressed(KeyCode::Backspace) {
            self.place_trade_order(catalog, stock, clock, TradeOrder::Cancel);
        }
        for (key, action) in [
            (KeyCode::KeyT, TradePolicy::AutomaticSale),
            (KeyCode::BracketLeft, TradePolicy::Reserve(false)),
            (KeyCode::BracketRight, TradePolicy::Reserve(true)),
            (KeyCode::KeyY, TradePolicy::Limit),
            (KeyCode::KeyR, TradePolicy::Trigger),
        ] {
            if keys.just_pressed(key) {
                self.adjust_trade_policy(catalog, action);
            }
        }
    }

    pub fn adjust_trade_policy(&mut self, catalog: &Catalog, action: TradePolicy) {
        let options = Trade::tradable(catalog);
        let Some((id, definition)) = options.get(self.trade.selected).copied() else {
            return;
        };
        if matches!(action, TradePolicy::HouseholdRestock) {
            self.trade.household_restock_off = !self.trade.household_restock_off;
            return;
        }
        let pack = definition.pack;
        let cycle = |value| match value {
            0 => pack,
            set if set == pack => pack * 2,
            _ => 0,
        };
        let policy = self.trade.policies.entry(id.into()).or_default();
        match action {
            TradePolicy::AutomaticSale => policy.enabled = !policy.enabled,
            TradePolicy::Reserve(false) => policy.reserve = policy.reserve.saturating_sub(pack),
            TradePolicy::Reserve(true) => policy.reserve = policy.reserve.saturating_add(pack),
            TradePolicy::Limit => policy.limit = cycle(policy.limit),
            TradePolicy::Trigger => policy.trigger = cycle(policy.trigger),
            TradePolicy::HouseholdRestock => {}
        }
    }

    pub fn place_trade_order(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        clock: TownClock,
        order: TradeOrder,
    ) {
        let options = Trade::tradable(catalog);
        let Some((id, definition)) = options.get(self.trade.selected).copied() else {
            return;
        };
        match order {
            TradeOrder::Buy { freight } => {
                let space = self.storage_space(catalog, stock);
                self.trade.notice = if u64::from(definition.pack) + self.trade.inbound() > space {
                    "There is not enough storage for another pack.".into()
                } else {
                    match self.trade.buy(
                        catalog,
                        stock,
                        &mut self.market,
                        id,
                        (clock.seconds, clock.round_trip_km, freight),
                    ) {
                        Ok(()) if freight => {
                            format!("{} ordered for freight delivery.", definition.name)
                        }
                        Ok(()) => format!("{} ordered for town pickup.", definition.name),
                        Err(error) => error.into(),
                    }
                };
            }
            TradeOrder::Sell => {
                let day = ((540.0 + clock.seconds * 0.45) / 1440.0).floor() as u64;
                let fare = fare_cents(clock.round_trip_km);
                self.trade.notice =
                    match self
                        .trade
                        .reserve(catalog, stock, &mut self.market, id, (day, fare, 0))
                    {
                        Ok(quantity) => {
                            format!("{quantity} {} reserved for town.", definition.name)
                        }
                        Err(error) => error.into(),
                    };
            }
            TradeOrder::Cancel => {
                let active = self.booked_trade_orders();
                if let Some(index) = self.trade.cancel_last(stock, &mut self.market, &active) {
                    self.removed_trade_order(index);
                }
            }
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
                item.quantity_text(u64::from(stock.available(id)))
            ));
        }
        let (id, item) = options[self.trade.selected];
        let buyer = &item.buyer.name;
        let day = ((540.0 + clock.seconds * 0.45) / 1440.0).floor() as u64;
        let supplier = self.market.supplier_available(catalog, id, day);
        let pack = item.quantity_text(u64::from(item.pack));
        let available = item.quantity_text(u64::from(supplier));
        let price = (item.price * 100.0).round() / 100.0;
        let pickup = fare_cents(clock.round_trip_km) as f64 / 100.0;
        let freight = freight_cents(clock.round_trip_km) as f64 / 100.0;
        display.push_str(&format!(
            "{} · Pack {pack} at R${price:.2} · Supplier has {available} today\nPickup fuel R${pickup:.2} · Freight R${freight:.2}\n",
            item.name
        ));
        let quote = match self.trade.quote(catalog, stock, id, day, 0) {
            Ok((qty, cents)) => format!(
                "{} for R${:.2} · Fuel R${:.2}",
                item.quantity_text(u64::from(qty)),
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
        let reserve = item.quantity_text(u64::from(policy.map_or(0, |policy| policy.reserve)));
        let trigger = item.quantity_text(u64::from(policy.map_or(0, |policy| policy.trigger)));
        let limit = item.quantity_text(u64::from(policy.map_or(0, |policy| policy.limit)));
        display.push_str(&format!("T Auto-sale {on} · [ / ] Reserve {reserve}\nR Trigger {trigger} · Y Daily cap {limit} (0 unlimited)\n{} queued · {} delivered",
            self.trade.orders.len(), self.trade.receipts));
        let (used, maximum) = self.storage(catalog, stock);
        display.push_str(&format!(
            "\nI Buy for pickup · D Order freight\nStorage {used}/{maximum} units · {} fulfilled purchases",
            self.trade.purchases,
        ));
        if let Some(order) = &self.trade.delivery {
            let hours = (order.eta - clock.seconds).max(0.0) * 0.45 / 60.0;
            display.push_str(&format!(
                "\nFreight: {} · {:.1}h remaining",
                catalog.materials[&order.material].name, hours
            ));
        }
        let restock = if self.trade.household_restock_off {
            "off"
        } else {
            "on"
        };
        display.push_str(&format!("\n0 Household restock {restock}"));
        if !self.trade.notice.is_empty() {
            display.push('\n');
            display.push_str(&self.trade.notice);
        }
        display
    }
}
