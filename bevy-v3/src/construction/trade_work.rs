use crate::market::{fare_cents, freight_cents, town_is_open};

use super::*;

#[derive(Clone, Copy)]
pub(crate) enum TradeOrder {
    Buy { freight: bool },
    Sell { hold_for_pickup: bool },
    Cancel,
}

#[derive(Clone, Copy)]
pub(crate) enum TradePolicy {
    HouseholdRestock,
    AutomaticSale,
    Reserve(bool),
    Limit,
    Trigger,
    MinimumLoad,
    DispatchWait,
    DispatchNow,
}

const ORDER_ROWS: usize = 4;

pub(crate) struct TradeQueueRow {
    pub label: String,
    pub can_cancel: bool,
    pub held: Option<bool>,
}

impl Construction {
    pub fn page_trade(&mut self, catalog: &Catalog, forward: bool) {
        if let Some(page) = self.trade.queue_page {
            let pages = self.trade_queue_pages();
            self.trade.queue_page =
                Some((page.min(pages - 1) + if forward { 1 } else { pages - 1 }) % pages);
            return;
        }
        let pages = Trade::tradable(catalog)
            .len()
            .div_ceil(PAGE_KEYS.len())
            .max(1);
        self.trade.page = (self.trade.page + if forward { 1 } else { pages - 1 }) % pages;
    }

    fn trade_queue_pages(&self) -> usize {
        self.trade.orders.len().div_ceil(ORDER_ROWS).max(1)
    }

    pub fn toggle_trade_queue(&mut self) {
        self.trade.queue_page = self.trade.queue_page.is_none().then_some(0);
        self.trade.notice.clear();
    }

    fn trade_queue_offset(&self) -> Option<usize> {
        self.trade
            .queue_page
            .map(|page| page.min(self.trade_queue_pages() - 1) * ORDER_ROWS)
    }

    pub fn trade_queue_labels(&self, catalog: &Catalog) -> Vec<TradeQueueRow> {
        let Some(offset) = self.trade_queue_offset() else {
            return Vec::new();
        };
        self.trade
            .orders
            .iter()
            .enumerate()
            .skip(offset)
            .take(ORDER_ROWS)
            .map(|(index, order)| {
                let item = &catalog.materials[&order.material];
                let direction = if order.buying { "Buy" } else { "Sell" };
                let trip = self.active_trips().find(|trip| trip.covers_order(index));
                let status = match trip {
                    Some(_) if order.settled => "Paid",
                    Some(_) if order.spoiled => "Spoiled",
                    Some(trip) if trip.boarded => "In transit",
                    Some(_) => "Booked",
                    None if order.hold_for_pickup => "Held for pickup",
                    None => "Queued",
                };
                TradeQueueRow {
                    label: format!(
                        "{direction} · {} · {} · {status}",
                        item.name,
                        item.quantity_text(u64::from(order.quantity))
                    ),
                    can_cancel: trip.is_none(),
                    held: (trip.is_none() && !order.buying).then_some(order.hold_for_pickup),
                }
            })
            .collect()
    }

    pub fn cancel_trade_queue_row(&mut self, stock: &mut Stock, row: usize) {
        let Some(offset) = self.trade_queue_offset() else {
            return;
        };
        if row < ORDER_ROWS {
            self.cancel_queued_trade(stock, offset + row);
        }
    }

    pub fn toggle_trade_queue_hold(&mut self, stock: &Stock, row: usize, distance: u32) {
        let Some(offset) = self.trade_queue_offset() else {
            return;
        };
        let index = offset + row;
        if row >= ORDER_ROWS || self.booked_trade_orders().contains(&index) {
            return;
        }
        let Some(order) = self
            .trade
            .orders
            .get_mut(index)
            .filter(|order| !order.buying)
        else {
            return;
        };
        if order.hold_for_pickup {
            let fare = fare_cents(distance);
            if !self.market.hold_fare(stock, fare) {
                self.trade.notice = "Shared savings cannot cover the trip fuel.".into();
                return;
            }
            order.fare = fare;
            order.hold_for_pickup = false;
            self.trade.notice = "This sale can now send a dedicated trip.".into();
        } else {
            self.market.release_fare(order.fare);
            order.fare = 0;
            order.hold_for_pickup = true;
            self.trade.notice = "This sale will wait for a shared trip.".into();
        }
    }

    pub(super) fn reserve_town_sale(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        clock: TownClock,
        material: &str,
        hold_for_pickup: bool,
    ) -> Result<u32, &'static str> {
        let day = ((540.0 + clock.seconds * 0.45) / 1440.0).floor() as u64;
        let fare = if hold_for_pickup {
            0
        } else {
            fare_cents(clock.round_trip_km)
        };
        let quantity =
            self.trade
                .reserve(catalog, stock, &mut self.market, material, (day, fare, 0))?;
        self.trade
            .orders
            .back_mut()
            .expect("reserved sale")
            .hold_for_pickup = hold_for_pickup;
        Ok(quantity)
    }

    fn cancel_queued_trade(&mut self, stock: &mut Stock, index: usize) {
        if self.booked_trade_orders().contains(&index) {
            self.trade.notice = "This order is already booked.".into();
            return;
        }
        if let Some(index) = self.trade.cancel_order(stock, &mut self.market, index) {
            self.removed_trade_order(index);
        }
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
        if keys.just_pressed(KeyCode::KeyO) {
            self.toggle_trade_queue();
            return;
        }
        if keys.any_just_pressed([KeyCode::PageUp, KeyCode::PageDown]) {
            self.page_trade(catalog, keys.just_pressed(KeyCode::PageDown));
        }
        if self.trade.queue_page.is_some() {
            if let Some(row) = PAGE_KEYS.iter().position(|key| keys.just_pressed(*key)) {
                if keys.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]) {
                    self.toggle_trade_queue_hold(stock, row, clock.round_trip_km);
                } else {
                    self.cancel_trade_queue_row(stock, row);
                }
            }
            return;
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
            self.place_trade_order(
                catalog,
                stock,
                clock,
                TradeOrder::Sell {
                    hold_for_pickup: keys.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]),
                },
            );
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
            (KeyCode::KeyG, TradePolicy::MinimumLoad),
            (KeyCode::KeyJ, TradePolicy::DispatchWait),
            (KeyCode::KeyU, TradePolicy::DispatchNow),
        ] {
            if keys.just_pressed(key) {
                self.adjust_trade_policy(catalog, action);
            }
        }
    }

    pub fn adjust_trade_policy(&mut self, catalog: &Catalog, action: TradePolicy) {
        match action {
            TradePolicy::MinimumLoad => {
                let fill = &mut self.logistics_policy.minimum_fill;
                *fill = (*fill + 10) % 110;
                return;
            }
            TradePolicy::DispatchWait => {
                let wait = &mut self.logistics_policy.wait_half_hours;
                *wait = (*wait + 1) % 49;
                return;
            }
            TradePolicy::DispatchNow => {
                self.logistics_policy.urgent = true;
                return;
            }
            _ => {}
        }
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
            TradePolicy::HouseholdRestock
            | TradePolicy::MinimumLoad
            | TradePolicy::DispatchWait
            | TradePolicy::DispatchNow => {}
        }
    }

    pub(super) fn buy_from_town(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        clock: TownClock,
        material: &str,
        freight: bool,
    ) -> Result<bool, &'static str> {
        let item = catalog.materials.get(material).ok_or("Unknown material.")?;
        if !town_is_open(clock.seconds) {
            return Err("Town is closed. Order between 07:00 and 18:00.");
        }
        if freight && self.construction_delivery.is_some() {
            return Err("A construction delivery is already on the way.");
        }
        if u64::from(item.pack) + self.trade.inbound() > self.storage_space(catalog, stock) {
            return Err("There is not enough storage for another pack.");
        }
        if !freight && self.sale_trip_for_return_purchase().is_some() {
            let index = self.trade.orders.len();
            if self
                .trade
                .buy_on_return_trip(catalog, stock, &mut self.market, material, clock.seconds)
                .is_ok()
            {
                self.sale_trip_for_return_purchase()
                    .expect("outbound sale trip")
                    .return_purchase = Some(index);
                return Ok(true);
            }
        }
        self.trade
            .buy(
                catalog,
                stock,
                &mut self.market,
                material,
                (clock.seconds, clock.round_trip_km, freight),
            )
            .map(|()| false)
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
                self.trade.notice = match self.buy_from_town(catalog, stock, clock, id, freight) {
                    Ok(true) => format!(
                        "{} added to the return trip. No extra fuel charge.",
                        definition.name
                    ),
                    Ok(false) if freight => {
                        format!("{} ordered for freight delivery.", definition.name)
                    }
                    Ok(false) => format!("{} ordered for town pickup.", definition.name),
                    Err(error) => error.into(),
                };
            }
            TradeOrder::Sell { hold_for_pickup } => {
                self.trade.notice =
                    match self.reserve_town_sale(catalog, stock, clock, id, hold_for_pickup) {
                        Ok(quantity) if hold_for_pickup => {
                            format!("{quantity} {} held for a shared trip.", definition.name)
                        }
                        Ok(quantity) => {
                            format!("{quantity} {} reserved for town.", definition.name)
                        }
                        Err(error) => error.into(),
                    };
            }
            TradeOrder::Cancel => {
                let active = self.booked_trade_orders();
                if let Some(index) = (0..self.trade.orders.len())
                    .rev()
                    .find(|index| !active.contains(index))
                {
                    self.cancel_queued_trade(stock, index);
                }
            }
        }
    }

    pub fn trade_status(&self, catalog: &Catalog, stock: &Stock, clock: TownClock) -> String {
        if let Some(offset) = self.trade_queue_offset() {
            let mut display = format!(
                "Town trade orders · {}/{} · Page Up/Down · O Browse materials",
                offset / ORDER_ROWS + 1,
                self.trade_queue_pages(),
            );
            let rows = self.trade_queue_labels(catalog);
            if rows.is_empty() {
                display.push_str("\nNo pickup or sale orders.");
            }
            for (index, row) in rows.into_iter().enumerate() {
                let hint = match (row.can_cancel, row.held) {
                    (true, Some(true)) => {
                        format!("{} Cancel · Shift {} Allow own trip", index + 1, index + 1)
                    }
                    (true, Some(false)) => {
                        format!("{} Cancel · Shift {} Hold", index + 1, index + 1)
                    }
                    (true, None) => format!("{} Cancel", index + 1),
                    _ => String::new(),
                };
                display.push_str(&format!("\n{} {hint}", row.label));
            }
            if !self.trade.notice.is_empty() {
                display.push_str(&format!("\n{}", self.trade.notice));
            }
            return display;
        }
        let options = Trade::tradable(catalog);
        let mut display = String::from("Town trade · Page Up/Down · 1–8 Select · O Orders\n");
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
        if !town_is_open(clock.seconds) {
            display.push_str("Town closed · Opens at 07:00\n");
        }
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
        let (protected, automatic_offer) = self.trade.automatic_sale_offer(catalog, stock, id, day);
        let protected = item.quantity_text(u64::from(protected));
        let result = match automatic_offer {
            Ok((quantity, cents)) => format!(
                "{} eligible for R${:.2} before fuel",
                item.quantity_text(u64::from(quantity)),
                cents as f64 / 100.0,
            ),
            Err(reason) => reason.into(),
        };
        display.push_str(&format!(
            "\nAutomatic sale · {protected} protected · {result}"
        ));
        let (used, maximum) = self.storage(catalog, stock);
        display.push_str(&format!(
            "\nI Buy for pickup · D Order freight · Shift Enter Sell on shared trip\nStorage {used}/{maximum} units · {} fulfilled purchases",
            self.trade.purchases,
        ));
        if let Some(order) = &self.trade.delivery {
            let name = &catalog.materials[&order.material].name;
            let arrival = order.eta - clock.seconds;
            let status = if arrival > 0.0 {
                format!("{:.1}h remaining", arrival / crate::weather::HOUR)
            } else if u64::from(order.quantity) > maximum.saturating_sub(used) {
                "Arrived · Waiting for storage space".into()
            } else {
                "Arrived · Ready to unload".into()
            };
            display.push_str(&format!("\nFreight · {name} · {status}"));
        }
        if let Some(freight) = self.construction_freight_status(clock.seconds) {
            display.push('\n');
            display.push_str(&freight);
        }
        let policy = &self.logistics_policy;
        display.push_str(&format!(
            "\nAuto dispatch · G Minimum load {}% · J Wait up to {:.1}h · U {}",
            policy.minimum_fill,
            f64::from(policy.wait_half_hours) * 0.5,
            if policy.urgent {
                "Marked urgent"
            } else {
                "Send now"
            },
        ));
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::setup::WorldSetup;

    #[test]
    fn canceling_a_specific_queue_row_keeps_booked_orders_and_reindexes_the_trip() {
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
        let mut village = Construction::default();
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        let before = stock.available("wood");
        let fare = fare_cents(clock.round_trip_km);
        let sold = village
            .trade
            .reserve(
                &catalog,
                &mut stock,
                &mut village.market,
                "wood",
                (0, fare, 0),
            )
            .unwrap();
        village
            .buy_from_town(&catalog, &mut stock, clock, "wood", false)
            .unwrap();
        village.trip = Some(TownTrip {
            project: 1,
            farm_bed: None,
            market_order: true,
            exports: 0,
            return_purchase: None,
            driver: 0,
            vehicle: 0,
            elapsed: 0.0,
            duration: 66.0,
            boarded: false,
        });
        village.toggle_trade_queue();
        let rows = village.trade_queue_labels(&catalog);
        assert!(rows[0].can_cancel && rows[0].label.contains("Queued"));
        assert!(!rows[1].can_cancel && rows[1].label.contains("Booked"));
        village.cancel_trade_queue_row(&mut stock, 1);
        assert_eq!(village.trade.orders.len(), 2);
        assert_eq!(stock.available("wood"), before - sold);

        village.cancel_trade_queue_row(&mut stock, 0);
        assert_eq!(stock.available("wood"), before);
        assert_eq!(village.trade.orders.len(), 1);
        assert!(village.trade.orders[0].buying);
        assert_eq!(village.trip.unwrap().project, 0);
        assert_eq!(village.market.committed_fares(), fare);
        assert!(village.valid_save(&catalog, &stock));
    }

    #[test]
    fn trade_panel_distinguishes_freight_arrival_from_unloading() {
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
        let mut village = Construction::default();
        let mut clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        village
            .buy_from_town(&catalog, &mut stock, clock, "wood", true)
            .unwrap();
        assert!(
            village
                .trade_status(&catalog, &stock, clock)
                .contains("h remaining")
        );

        clock.seconds = village.trade.delivery.as_ref().unwrap().eta;
        assert!(
            village
                .trade_status(&catalog, &stock, clock)
                .contains("Ready to unload")
        );
        let space = village.storage_space(&catalog, &stock) as u32;
        stock.receive(&BTreeMap::from([("stone".into(), space)]));
        assert!(
            village
                .trade_status(&catalog, &stock, clock)
                .contains("Waiting for storage space")
        );
    }
}
