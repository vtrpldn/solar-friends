use crate::market::{fare_cents, freight_cents, freight_seconds, town_is_open};

use super::*;

#[derive(Clone, Copy, PartialEq)]
pub(crate) enum TradeOrder {
    Buy { freight: bool },
    Sell { hold_for_pickup: bool },
    Cancel,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum SaleSetting {
    Reserve,
    Trigger,
    Limit,
}

#[derive(Clone, Copy, PartialEq)]
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

pub(crate) struct TradeMarket<'a> {
    pub item: crate::trade::TradeItem<'a>,
    pub supplier: String,
    pub purchase_totals: String,
    pub freight_eta: Option<String>,
    pub supplier_renewal: bool,
    pub buyer: String,
    pub sale_quote: Result<String, &'static str>,
    pub automatic_sale: String,
    pub transport: String,
    pub freight_shortfall: Option<String>,
}

fn sale_proceeds(cents: u64, fare: u64) -> String {
    let net = (cents as f64 - fare as f64) / 100.0;
    let after_fuel = if net < 0.0 {
        format!("-R${:.2}", -net)
    } else {
        format!("R${net:.2}")
    };
    format!(
        "R${:.2} gross · {after_fuel} after dedicated fuel",
        cents as f64 / 100.0
    )
}

impl Construction {
    pub(crate) fn trade_page(&self, catalog: &Catalog) -> (usize, usize) {
        let (page, pages) = if let Some(page) = self.trade.queue_page {
            (page, self.trade_queue_pages())
        } else {
            let pages = Trade::tradable(catalog)
                .len()
                .div_ceil(PAGE_KEYS.len())
                .max(1);
            (self.trade.page, pages)
        };
        (page.min(pages - 1), pages)
    }

    pub fn page_trade(&mut self, catalog: &Catalog, forward: bool) {
        let (page, pages) = self.trade_page(catalog);
        let next = (page + if forward { 1 } else { pages - 1 }) % pages;
        if let Some(queue_page) = &mut self.trade.queue_page {
            *queue_page = next;
        } else {
            self.trade.page = next;
        }
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

    pub fn trade_queue_labels(&self, catalog: &Catalog, clock: TownClock) -> Vec<TradeQueueRow> {
        let Some(offset) = self.trade_queue_offset() else {
            return Vec::new();
        };
        let sale_wait = self.trade.sale_dispatch_wait(clock.seconds);
        let fare = fare_cents(clock.round_trip_km);
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
                    Some(trip) if trip.boarded && trip.elapsed >= trip.duration => {
                        "At camp · Waiting for storage".into()
                    }
                    Some(trip) if trip.boarded => {
                        use crate::arrival::{TownDrivePhase, town_drive_phase};
                        let phase = match town_drive_phase(trip.elapsed, trip.duration) {
                            TownDrivePhase::Outbound => "Driving to town",
                            TownDrivePhase::Away => "In town",
                            TownDrivePhase::Inbound => "Returning",
                        };
                        let minutes = ((trip.duration - trip.elapsed) * 60.0 / crate::weather::HOUR)
                            .ceil() as u64;
                        format!("{phase} · {minutes} game min to camp")
                    }
                    Some(_) => "Booked · Driver walking to car".into(),
                    None if order.hold_for_pickup => "Held for pickup".into(),
                    None if !order.buying
                        && let Some(wait) = sale_wait =>
                    {
                        let minutes = crate::weather::remaining_game_minutes(wait);
                        format!("Queued · Consolidating for {minutes} more game min")
                    }
                    None => "Queued".into(),
                };
                let outcome = if order.settled {
                    " · Paid"
                } else if order.buying && order.quantity < item.pack {
                    " · Spoilage loss"
                } else if order.spoiled {
                    " · Spoiled"
                } else {
                    ""
                };
                let proceeds = if trip.is_none() && !order.buying {
                    format!(" · {}", sale_proceeds(order.cents, fare))
                } else {
                    String::new()
                };
                TradeQueueRow {
                    label: format!(
                        "{direction} · {} · {} · {status}{outcome}{proceeds}",
                        item.name,
                        item.quantity_text(u64::from(order.quantity))
                    ),
                    can_cancel: trip.is_none(),
                    held: (trip.is_none() && !order.buying).then_some(order.hold_for_pickup),
                }
            })
            .collect()
    }

    pub fn cancel_trade_queue_row(&mut self, catalog: &Catalog, stock: &mut Stock, row: usize) {
        let Some(offset) = self.trade_queue_offset() else {
            return;
        };
        if row < ORDER_ROWS {
            self.cancel_queued_trade(catalog, stock, offset + row);
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
        let day = clock.day();
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
        self.trade.note_sale_queued(clock.seconds);
        Ok(quantity)
    }

    fn cancel_queued_trade(&mut self, catalog: &Catalog, stock: &mut Stock, index: usize) {
        if self.booked_trade_orders().contains(&index) {
            self.trade.notice = "This order is already booked.".into();
            return;
        }
        if let Some(index) = self
            .trade
            .cancel_order(catalog, stock, &mut self.market, index)
        {
            self.removed_trade_order(index);
            self.clear_sale_dispatch_if_empty();
        }
    }

    pub(crate) fn trade_page_items<'a>(
        &self,
        catalog: &'a Catalog,
    ) -> impl Iterator<Item = crate::trade::TradeItem<'a>> + use<'a> {
        Trade::tradable(catalog)
            .into_iter()
            .skip(self.trade.page * PAGE_KEYS.len())
            .take(PAGE_KEYS.len())
    }

    pub(crate) fn select_trade_material(&mut self, catalog: &Catalog, id: &str) -> bool {
        let Some(index) = Trade::tradable(catalog)
            .iter()
            .position(|item| item.id == id)
        else {
            return false;
        };
        self.trade.selected = index;
        self.trade.page = index / PAGE_KEYS.len();
        self.trade.queue_page = None;
        self.trade.notice.clear();
        true
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
                    self.cancel_trade_queue_row(catalog, stock, row);
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
        if keys.just_pressed(KeyCode::KeyD) {
            self.toggle_supplier_construction();
        }
        if keys.just_pressed(KeyCode::KeyI) {
            self.place_trade_order(
                catalog,
                stock,
                clock,
                TradeOrder::Buy {
                    freight: self.supplier_construction,
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

    pub(crate) fn set_sale_quantity(
        &mut self,
        catalog: &Catalog,
        setting: SaleSetting,
        quantity: f64,
    ) {
        let options = Trade::tradable(catalog);
        let Some(item) = options.get(self.trade.selected) else {
            return;
        };
        let units = item.material.stock_units_from_quantity(quantity);
        let policy = self.trade.sale_policy(item.id);
        match setting {
            SaleSetting::Reserve => policy.reserve = units,
            SaleSetting::Trigger => policy.trigger = units,
            SaleSetting::Limit => policy.limit = units,
        }
        policy.trigger = policy.trigger.max(policy.reserve);
    }

    pub(crate) fn set_minimum_dispatch_fill(&mut self, percent: u8) {
        self.logistics_policy.minimum_fill = percent;
    }

    pub(crate) fn set_dispatch_wait(&mut self, half_hours: u8) {
        self.logistics_policy.wait_half_hours = half_hours;
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
        let Some(crate::trade::TradeItem {
            id,
            material: definition,
            ..
        }) = options.get(self.trade.selected).copied()
        else {
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
        let policy = self.trade.sale_policy(id);
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
        policy.trigger = policy.trigger.max(policy.reserve);
    }

    fn check_town_purchase(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        clock: TownClock,
        material: &str,
        freight: bool,
    ) -> Result<(), &'static str> {
        let item = catalog.materials.get(material).ok_or("Unknown material.")?;
        if !town_is_open(clock.seconds) {
            return Err("Town is closed. Order between 07:00 and 18:00.");
        }
        if freight && (self.construction_delivery.is_some() || self.seed_freight_active()) {
            return Err("A supplier delivery is already on the way.");
        }
        if u64::from(item.pack) + self.trade.inbound() > self.storage_space(catalog, stock) {
            return Err("There is not enough storage for another pack.");
        }
        self.trade.purchase_slot(freight)
    }

    pub(crate) fn selected_trade_issue(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        clock: TownClock,
        order: TradeOrder,
    ) -> Option<&'static str> {
        let options = Trade::tradable(catalog);
        let item = options.get(self.trade.selected)?;
        self.trade_item_issue(catalog, stock, clock, item.id, order)
    }

    pub(crate) fn trade_item_issue(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        clock: TownClock,
        id: &str,
        order: TradeOrder,
    ) -> Option<&'static str> {
        match order {
            TradeOrder::Buy { freight } => self
                .town_purchase_quote(catalog, stock, clock, id, freight)
                .err(),
            TradeOrder::Sell { hold_for_pickup } => self
                .trade
                .quote_sale_order(catalog, stock, id, clock.day(), 0)
                .err()
                .or_else(|| {
                    (!hold_for_pickup
                        && !self
                            .market
                            .can_hold_fare(stock, fare_cents(clock.round_trip_km)))
                    .then_some("Shared savings cannot cover the trip fuel.")
                }),
            TradeOrder::Cancel => {
                let booked = self.booked_trade_orders();
                (!(0..self.trade.orders.len()).any(|index| !booked.contains(&index)))
                    .then_some("No unbooked order to cancel.")
            }
        }
    }

    pub(crate) fn town_purchase_quote(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        clock: TownClock,
        id: &str,
        freight: bool,
    ) -> Result<u64, &'static str> {
        let fare = if freight {
            freight_cents(clock.round_trip_km)
        } else if self.sale_trip_for_return_purchase().is_some() {
            0
        } else {
            fare_cents(clock.round_trip_km)
        };
        self.purchase_quote(catalog, stock, clock, id, freight, fare)
    }

    fn purchase_quote(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        clock: TownClock,
        material: &str,
        freight: bool,
        fare: u64,
    ) -> Result<u64, &'static str> {
        self.check_town_purchase(catalog, stock, clock, material, freight)?;
        let (_, price) =
            self.market
                .quote_pack(catalog, stock, material, (clock.day(), fare, freight))?;
        if self.supplier_construction {
            let protected = self
                .protected_freight_cash(catalog, clock)
                .ok_or("Queued construction supplies exceed supplier freight capacity.")?;
            if stock.balance().saturating_sub(protected) < price + fare {
                return Err("Shared savings are committed to queued construction freight.");
            }
        }
        Ok(price + fare)
    }

    pub(crate) fn finance_commitments(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        clock: TownClock,
    ) -> (u64, u64) {
        let committed = if self.supplier_construction {
            self.protected_freight_cash(catalog, clock)
                .unwrap_or(stock.balance())
        } else {
            self.market.committed_fares()
        };
        (stock.balance().saturating_sub(committed), committed)
    }

    pub(super) fn protected_freight_cash(
        &self,
        catalog: &Catalog,
        clock: TownClock,
    ) -> Option<u64> {
        let (loads, replaced) = self.construction_freight_budget(catalog, BTreeMap::new())?;
        let committed = self.market.committed_fares();
        let freight = freight_cents(clock.round_trip_km);
        let seeds = self
            .farming
            .jobs
            .iter()
            .filter(|job| self.queued_seed_freight(job))
            .map(|job| freight.saturating_sub(job.fare) * u64::from(job.pickups))
            .sum::<u64>();
        let freight_commitment = committed.saturating_sub(replaced) + u64::from(loads) * freight;
        let freight_commitment = freight_commitment + seeds;
        Some(committed.max(freight_commitment))
    }

    pub(super) fn buy_from_town(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        clock: TownClock,
        material: &str,
        freight: bool,
    ) -> Result<bool, &'static str> {
        let shared = (!freight)
            .then(|| self.sale_trip_for_return_purchase())
            .flatten();
        let fare = if freight {
            freight_cents(clock.round_trip_km)
        } else if shared.is_some() {
            0
        } else {
            fare_cents(clock.round_trip_km)
        };
        self.purchase_quote(catalog, stock, clock, material, freight, fare)?;
        if let Some(slot) = shared {
            let index = self.trade.orders.len();
            if self
                .trade
                .buy_on_return_trip(catalog, stock, &mut self.market, material, clock.seconds)
                .is_ok()
            {
                self.attach_return_purchase(slot, index);
                return Ok(true);
            }
            self.purchase_quote(
                catalog,
                stock,
                clock,
                material,
                false,
                fare_cents(clock.round_trip_km),
            )?;
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

    pub(super) fn attach_return_purchase(&mut self, slot: usize, order: usize) {
        [&mut self.trip, &mut self.second_trip][slot]
            .as_mut()
            .expect("outbound sale trip")
            .return_purchase = Some(order);
    }

    pub fn place_trade_order(
        &mut self,
        catalog: &Catalog,
        stock: &mut Stock,
        clock: TownClock,
        order: TradeOrder,
    ) {
        let options = Trade::tradable(catalog);
        let Some(crate::trade::TradeItem {
            id,
            material: definition,
            ..
        }) = options.get(self.trade.selected).copied()
        else {
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
                    self.cancel_queued_trade(catalog, stock, index);
                }
            }
        }
    }

    fn supplier_delivery_status(
        &self,
        catalog: &Catalog,
        space: u64,
        clock: f64,
    ) -> Option<String> {
        let order = self.trade.delivery.as_ref()?;
        let item = &catalog.materials[&order.material];
        let arrival = order.eta - clock;
        let status = if arrival > 0.0 {
            let minutes = crate::weather::remaining_game_minutes(arrival);
            format!("{minutes} game minutes remaining")
        } else if u64::from(order.quantity) > space {
            "Arrived · Waiting for storage space".into()
        } else {
            "Arrived · Ready to unload".into()
        };
        let loss = if order.quantity < item.pack {
            " · Spoilage loss"
        } else {
            ""
        };
        Some(format!(
            "Freight · {} · {} · {status}{loss}",
            item.name,
            item.quantity_text(u64::from(order.quantity))
        ))
    }

    pub fn pantry_purchase_status(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        clock: TownClock,
    ) -> String {
        let mut status = self.trade.pantry_purchase_status(stock, clock.seconds);
        if self.supplier_construction {
            let (kg, cubic_metres) = crate::economy_reference::FREIGHT_CAPACITY;
            let fee = freight_cents(clock.round_trip_km) as f64 / 100.;
            let hours = crate::market::freight_seconds(clock.round_trip_km) / crate::weather::HOUR;
            status.push_str(&format!("\nD Automatic supplies · Supplier freight · R${fee:.2} · {kg:.0} kg / {cubic_metres:.0} m³ · {hours:.1}h · No driver needed"));
        } else {
            status.push_str("\nD Automatic supplies · Resident pickup");
        }
        if let Some(delivery) = self.supplier_delivery_status(
            catalog,
            self.storage_space(catalog, stock),
            clock.seconds,
        ) {
            status.push('\n');
            status.push_str(&delivery);
        }
        if let Some(freight) = self.reserved_freight_status(clock.seconds) {
            status.push('\n');
            status.push_str(&freight);
        }
        status
    }

    pub(crate) fn dispatch_settings(&self) -> (u8, f64, bool) {
        let policy = &self.logistics_policy;
        (
            policy.minimum_fill,
            f64::from(policy.wait_half_hours) * 0.5,
            policy.urgent,
        )
    }

    pub(crate) fn trade_freight_status(
        &self,
        catalog: &Catalog,
        stock: &Stock,
        clock: TownClock,
    ) -> impl Iterator<Item = String> {
        [
            self.supplier_delivery_status(
                catalog,
                self.storage_space(catalog, stock),
                clock.seconds,
            ),
            self.reserved_freight_status(clock.seconds),
        ]
        .into_iter()
        .flatten()
    }

    pub(crate) fn trade_market<'a>(
        &self,
        catalog: &'a Catalog,
        stock: &Stock,
        clock: TownClock,
    ) -> Option<TradeMarket<'a>> {
        let option = Trade::tradable(catalog).get(self.trade.selected).copied()?;
        let crate::trade::TradeItem {
            id, material: item, ..
        } = option;
        let day = clock.day();
        let supply = self.market.supplier_available(catalog, id, day);
        let pack = item.quantity_text(u64::from(item.pack));
        let available = item.quantity_text(u64::from(supply));
        let price = (item.price * 100.0).round() as u64;
        let shared_pickup = self.sale_trip_for_return_purchase().is_some();
        let fare = fare_cents(clock.round_trip_km);
        let pickup = if shared_pickup { 0 } else { fare };
        let freight = freight_cents(clock.round_trip_km);
        let pickup_note = if shared_pickup {
            " (return trip, no extra fuel)"
        } else {
            ""
        };
        let supplier = format!(
            "{} · Pack {pack} at R${:.2} · {} has {available} today",
            item.name,
            price as f64 / 100.0,
            item.supplier_name,
        );
        let purchase_totals = format!(
            "Pickup total R${:.2}{pickup_note} · Freight total R${:.2}",
            (price + pickup) as f64 / 100.0,
            (price + freight) as f64 / 100.0,
        );
        let freight_eta = self
            .purchase_quote(catalog, stock, clock, id, true, freight)
            .is_ok()
            .then(|| {
                let minutes =
                    crate::weather::remaining_game_minutes(freight_seconds(clock.round_trip_km));
                format!(
                    "Supplier freight arrives in about {minutes} game minutes. No driver needed."
                )
            });
        let sale_quote =
            self.trade
                .quote_sale_order(catalog, stock, id, day, 0)
                .map(|(quantity, cents)| {
                    format!(
                        "{} · {}",
                        item.quantity_text(u64::from(quantity)),
                        sale_proceeds(cents, fare),
                    )
                });
        let remaining =
            (item.buyer.batches * item.pack).saturating_sub(self.trade.buyer_reserved(id, day));
        let buyer = format!(
            "{} · {} of demand left today",
            item.buyer.name,
            item.quantity_text(u64::from(remaining)),
        );
        let automatic_sale = if stock.sandbox {
            "Automatic sales are disabled in Sandbox.".into()
        } else {
            let (protected, offer) = self.trade.automatic_sale_offer(catalog, stock, id, day);
            let protected = item.quantity_text(u64::from(protected));
            let result = match offer {
                Ok((quantity, cents)) => format!(
                    "{} eligible for R${:.2} before fuel",
                    item.quantity_text(u64::from(quantity)),
                    cents as f64 / 100.0,
                ),
                Err(reason) => reason.into(),
            };
            format!("{protected} protected · {result}")
        };
        let (spendable, committed) = self.finance_commitments(catalog, stock, clock);
        let (method, fare) = if self.supplier_construction {
            ("Supplier freight", freight)
        } else {
            ("Resident pickup", pickup)
        };
        let transport = format!(
            "{method} · R${:.2} transport · R${:.2} available after commitments",
            fare as f64 / 100.0,
            spendable as f64 / 100.0,
        );
        let freight_shortfall = committed.saturating_sub(stock.balance());
        let freight_shortfall = (self.supplier_construction && !stock.sandbox && freight_shortfall > 0)
            .then(|| {
                format!(
                    "Queued supplier freight needs R${:.2} more. Choose resident pickup to use the existing pickup fares.",
                    freight_shortfall as f64 / 100.0,
                )
            });
        Some(TradeMarket {
            item: option,
            supplier,
            purchase_totals,
            freight_eta,
            supplier_renewal: supply < item.pack,
            buyer,
            sale_quote,
            automatic_sale,
            transport,
            freight_shortfall,
        })
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
        village.trade.note_sale_queued(clock.seconds);
        let rows = village.trade_queue_labels(&catalog, clock);
        assert!(rows[0].can_cancel && rows[0].label.contains("Consolidating for 18 more game min"));
        let cents = village.trade.orders[0].cents;
        assert!(rows[0].label.contains(&sale_proceeds(cents, fare)));
        assert!(!rows[1].label.contains("dedicated fuel"));
        assert!(!rows[1].can_cancel && rows[1].label.contains("Booked"));
        village.cancel_trade_queue_row(&catalog, &mut stock, 1);
        assert_eq!(village.trade.orders.len(), 2);
        assert_eq!(stock.available("wood"), before - sold);

        village.cancel_trade_queue_row(&catalog, &mut stock, 0);
        assert_eq!(stock.available("wood"), before);
        assert_eq!(village.trade.orders.len(), 1);
        assert!(village.trade.orders[0].buying);
        assert_eq!(village.trip.unwrap().project, 0);
        assert_eq!(village.market.committed_fares(), fare);
        assert!(village.valid_save(&catalog, &stock));
        let trip = village.trip.as_mut().unwrap();
        trip.boarded = true;
        trip.elapsed = 33.0;
        assert!(
            village.trade_queue_labels(&catalog, clock)[0]
                .label
                .contains("In town · 15 game min")
        );
        village.trip.as_mut().unwrap().elapsed = 50.0;
        assert!(
            village.trade_queue_labels(&catalog, clock)[0]
                .label
                .contains("Returning · 8 game min")
        );
        village.trip.as_mut().unwrap().elapsed = 66.0;
        assert!(
            village.trade_queue_labels(&catalog, clock)[0]
                .label
                .contains("Waiting for storage")
        );
    }

    #[test]
    fn enabling_automatic_sales_uses_v2_reserves_and_preserves_existing_settings() {
        let catalog = Catalog::default();
        let mut village = Construction::default();
        for (id, expected) in [("wood", 12), ("food", 20), ("meals", 20)] {
            assert!(village.select_trade_material(&catalog, id));
            village.adjust_trade_policy(&catalog, TradePolicy::AutomaticSale);
            let policy = &village.trade.policies[id];
            assert!(policy.enabled);
            assert_eq!((policy.reserve, policy.trigger), (expected, expected));
        }
        village.set_sale_quantity(&catalog, SaleSetting::Reserve, 3.);
        village.adjust_trade_policy(&catalog, TradePolicy::AutomaticSale);
        village.adjust_trade_policy(&catalog, TradePolicy::AutomaticSale);
        assert_eq!(village.trade.policies["meals"].reserve, 3);
    }

    #[test]
    fn exact_sale_thresholds_use_the_material_unit_and_protect_the_reserve() {
        let catalog = Catalog::default();
        let mut village = Construction::default();
        assert!(village.select_trade_material(&catalog, "wood"));
        village.set_sale_quantity(&catalog, SaleSetting::Reserve, 19.5);
        village.set_sale_quantity(&catalog, SaleSetting::Trigger, 4.);
        village.set_sale_quantity(&catalog, SaleSetting::Limit, 32.);
        let policy = &village.trade.policies["wood"];
        assert_eq!(catalog.materials["wood"].quantity_unit(), "kg");
        assert_eq!((policy.reserve, policy.trigger, policy.limit), (4, 4, 8));
        village.set_sale_quantity(&catalog, SaleSetting::Limit, 0.);
        assert_eq!(village.trade.policies["wood"].limit, 0);
    }

    #[test]
    fn sandbox_trade_explains_that_automatic_sales_are_disabled() {
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
        stock.sandbox = true;
        let mut village = Construction::default();
        assert!(village.select_trade_material(&catalog, "wood"));
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        let status = village
            .trade_market(&catalog, &stock, clock)
            .unwrap()
            .automatic_sale;
        assert!(status.contains("Automatic sales are disabled in Sandbox."));
        assert!(!status.contains("before fuel"));
    }

    #[test]
    fn canceling_last_sale_gives_the_next_sale_a_fresh_dispatch_wait() {
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
        let mut village = Construction::default();
        let first = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        village
            .reserve_town_sale(&catalog, &mut stock, first, "wood", false)
            .unwrap();
        village.cancel_queued_trade(&catalog, &mut stock, 0);
        let next = TownClock {
            seconds: crate::weather::DAY,
            ..first
        };
        village
            .reserve_town_sale(&catalog, &mut stock, next, "wood", false)
            .unwrap();
        assert_eq!(
            village.trade.sale_dispatch_wait(next.seconds),
            Some(crate::economy_reference::SALE_DISPATCH_DELAY)
        );
    }

    #[test]
    fn canceling_yesterdays_sale_preserves_todays_buyer_reservation() {
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
        let mut village = Construction::default();
        let before = stock.available("wood");
        let yesterday = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        let today = TownClock {
            seconds: crate::weather::DAY,
            ..yesterday
        };
        village
            .reserve_town_sale(&catalog, &mut stock, yesterday, "wood", true)
            .unwrap();
        let current = village
            .reserve_town_sale(&catalog, &mut stock, today, "wood", false)
            .unwrap();
        let committed = village.market.committed_fares();

        village.cancel_queued_trade(&catalog, &mut stock, 0);

        assert_eq!(stock.available("wood"), before - current);
        assert_eq!(village.trade.buyer_reserved("wood", today.day()), current);
        assert_eq!(village.market.committed_fares(), committed);
        assert_eq!(village.trade.orders.len(), 1);
        assert_eq!(village.trade.orders[0].day, today.day());
    }

    #[test]
    fn sale_quote_shows_a_loss_after_dedicated_fuel() {
        let catalog = Catalog::default();
        let mut stock = Stock::for_start(&WorldSetup::default(), &catalog);
        stock.debit(stock.balance(), crate::stock::CashKind::Materials);
        let mut village = Construction::default();
        village.trade.selected = Trade::tradable(&catalog)
            .iter()
            .position(|item| item.id == "wood")
            .unwrap();
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: 500,
        };
        assert_eq!(
            village.selected_trade_issue(
                &catalog,
                &stock,
                clock,
                TradeOrder::Sell {
                    hold_for_pickup: false
                }
            ),
            Some("Shared savings cannot cover the trip fuel.")
        );
        assert_eq!(
            village.selected_trade_issue(
                &catalog,
                &stock,
                clock,
                TradeOrder::Sell {
                    hold_for_pickup: true
                }
            ),
            None
        );
        let (_, gross) = village.trade.quote(&catalog, &stock, "wood", 0, 0).unwrap();
        let loss = fare_cents(clock.round_trip_km) - gross;
        assert!(
            village
                .trade_market(&catalog, &stock, clock)
                .unwrap()
                .sale_quote
                .unwrap()
                .contains(&format!(
                    "R${:.2} gross · -R${:.2} after dedicated fuel",
                    gross as f64 / 100.0,
                    loss as f64 / 100.0,
                ))
        );
        assert!(
            village
                .reserve_town_sale(&catalog, &mut stock, clock, "wood", false)
                .is_err()
        );
        assert!(
            village
                .reserve_town_sale(&catalog, &mut stock, clock, "wood", true)
                .is_ok()
        );
    }

    #[test]
    fn filtered_store_material_opens_its_trade_page() {
        let catalog = Catalog::default();
        let name = &catalog.materials["plumbing"].name;
        let (_, mut rows) =
            crate::construction::inventory_rows(&catalog, 0, InventoryView::Resources, name);
        let (_, id, _) = rows.next().unwrap();
        assert_eq!(id, "plumbing");
        let mut village = Construction::default();
        village.trade.queue_page = Some(0);
        assert!(village.select_trade_material(&catalog, id));
        assert!(village.trade.queue_page.is_none());
        assert_eq!(Trade::tradable(&catalog)[village.trade.selected].id, id);
        assert!(village.trade_page_items(&catalog).any(|item| item.id == id));
    }

    #[test]
    fn trade_page_groups_and_selects_the_same_item() {
        let catalog = Catalog::default();
        let mut village = Construction::default();
        let items = Trade::tradable(&catalog);
        let logs = items.iter().position(|item| item.id == "logs").unwrap();
        village.trade.page = logs / PAGE_KEYS.len();
        village.select_trade_row(&catalog, logs % PAGE_KEYS.len());
        let item = village
            .trade_page_items(&catalog)
            .nth(logs % PAGE_KEYS.len())
            .unwrap();
        assert_eq!(item.group, "Raw materials");
        assert_eq!(item.id, items[logs].id);
        assert_eq!(village.trade.selected, logs);
    }

    #[test]
    fn manual_purchase_preserves_cash_for_queued_construction_freight() {
        let catalog = Catalog::default();
        let setup = crate::setup::WorldSetup::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut village = Construction::default();
        let clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        let mut plan = village.proposed_site(&catalog, "well", IVec2::new(45, 36));
        Construction::reserve_project(
            &mut village.market,
            &mut stock,
            &catalog,
            &mut plan,
            clock,
            false,
        )
        .unwrap();
        village.plans.push(plan);
        village.toggle_supplier_construction();
        let fee = freight_cents(12);
        let (_, price) = village
            .market
            .quote_pack(&catalog, &stock, "food", (0, fee, true))
            .unwrap();
        let short_balance = price + fee + village.market.committed_fares();
        stock.debit(
            stock.balance() - short_balance,
            crate::stock::CashKind::Materials,
        );
        assert_eq!(
            village.buy_from_town(&catalog, &mut stock, clock, "food", true),
            Err("Shared savings are committed to queued construction freight.")
        );
        assert_eq!(stock.balance(), short_balance);
        assert!(village.trade.delivery.is_none());
        let protected = fee;
        stock.credit(
            protected - village.market.committed_fares(),
            crate::stock::CashKind::Materials,
        );
        assert_eq!(
            village.buy_from_town(&catalog, &mut stock, clock, "food", true),
            Ok(false)
        );
        assert_eq!(stock.balance(), protected);
        let summary = village.finance_summary(&catalog, &stock, 0, clock);
        assert!(summary.contains("Available after commitments R$0.00"));
        assert!(
            village
                .trade_market(&catalog, &stock, clock)
                .unwrap()
                .transport
                .contains(
                    "Supplier freight · R$44.60 transport · R$0.00 available after commitments"
                )
        );
        assert!(summary.contains(&format!(
            "Reserved for town trips and freight R${:.2}",
            protected as f64 / 100.0
        )));
    }

    #[test]
    fn trade_panel_distinguishes_freight_arrival_from_unloading() {
        let catalog = Catalog::default();
        let setup = WorldSetup::default();
        let mut stock = Stock::for_start(&setup, &catalog);
        let mut village = Construction::default();
        let mut clock = TownClock {
            seconds: 0.0,
            round_trip_km: 12,
        };
        village
            .buy_from_town(&catalog, &mut stock, clock, "wood", true)
            .unwrap();
        assert_eq!(
            village.selected_trade_issue(
                &catalog,
                &stock,
                clock,
                TradeOrder::Buy { freight: true }
            ),
            Some("A freight order is already on the way.")
        );
        assert_eq!(
            village.selected_trade_issue(
                &catalog,
                &stock,
                clock,
                TradeOrder::Buy { freight: false }
            ),
            None
        );
        assert!(
            village
                .trade_freight_status(&catalog, &stock, clock)
                .any(|status| status.contains("390 game minutes remaining"))
        );
        assert!(
            village
                .trade_market(&catalog, &stock, clock)
                .unwrap()
                .freight_eta
                .is_none()
        );

        assert!(
            village
                .pantry_purchase_status(&catalog, &stock, clock)
                .contains("Resident pickup")
        );
        village.toggle_supplier_construction();
        let pantry = village.pantry_purchase_status(&catalog, &stock, clock);
        assert!(pantry.contains("Supplier freight · R$44.60"));
        assert!(pantry.contains("390 game minutes remaining"));
        village.toggle_trade_queue();
        assert!(
            village
                .trade_freight_status(&catalog, &stock, clock)
                .any(|status| status.contains("390 game minutes remaining"))
        );
        village.toggle_trade_queue();

        clock.seconds = village.trade.delivery.as_ref().unwrap().eta;
        assert!(
            village
                .trade_freight_status(&catalog, &stock, clock)
                .any(|status| status.contains("Ready to unload"))
        );
        let space = village.storage_space(&catalog, &stock) as u32;
        stock.receive(&BTreeMap::from([("stone".into(), space)]));
        assert!(
            village
                .trade_freight_status(&catalog, &stock, clock)
                .any(|status| status.contains("Waiting for storage space"))
        );
        let terrain = setup.terrain();
        let land = Land::default();
        let site = ConstructionSite {
            terrain: &terrain,
            land: &land,
            camp: IVec2::splat(36),
        };
        let wood = stock.available("wood");
        let balance = stock.balance();
        let purchases = village.trade.purchases;
        village.trade.set_pantry_policy(false, None, None).unwrap();
        village.tick(&catalog, &mut stock, site, clock, 0.1, false);
        assert!(village.trade.delivery.is_some());
        assert_eq!(stock.available("wood"), wood);

        let saved = serde_json::to_vec(&(village, stock)).unwrap();
        let (mut village, mut stock): (Construction, Stock) =
            serde_json::from_slice(&saved).unwrap();
        assert!(village.valid_save(&catalog, &stock));
        let pack = catalog.materials["wood"].pack;
        stock.reserve_available(&BTreeMap::from([("stone".into(), pack)]));
        village.tick(&catalog, &mut stock, site, clock, 0.1, false);
        village.tick(&catalog, &mut stock, site, clock, 0.1, false);
        assert!(village.trade.delivery.is_none());
        assert_eq!(stock.available("wood"), wood + pack);
        assert_eq!(village.trade.purchases, purchases + 1);
        assert_eq!(stock.balance(), balance);
    }
}
