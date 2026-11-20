use super::{
    widgets::{Widget, stepper},
    *,
};
use crate::{
    construction::{TradeMarket, TradeOrder, TradePolicy},
    trade::Trade,
};

#[derive(Clone, Copy, PartialEq)]
pub(in crate::village) enum Action {
    Page(bool),
    Item(usize),
    Orders,
    CancelOrder(usize),
    HoldOrder(usize),
    Order(TradeOrder),
    Transport,
    Policy(TradePolicy),
    Edit(NumericTarget),
    Apply,
    CancelEdit,
}

pub(in crate::village) struct Screen;

impl widgets::Screen for Screen {
    type Action = Action;
    const PANEL: UtilityPanel = UtilityPanel::Trade;

    fn content(
        village: &Village,
        catalog: &Catalog,
        setup: &WorldSetup,
        _land: &Land,
    ) -> Option<Widget<Action>> {
        let town = &village.construction;
        let stock = &village.stock;
        let clock = clock(village, setup);
        let mut sections = if town.trade.queue_page.is_some() {
            orders(town, catalog, clock)
        } else {
            let mut cards = vec![materials(town, catalog)];
            if let Some(market) = town.trade_market(catalog, stock, clock) {
                cards.extend([
                    purchase(village, catalog, clock, &market),
                    sales(village, catalog, clock, &market),
                    dispatch(village),
                ]);
            }
            cards
        };
        let freight: Vec<_> = town
            .trade_freight_status(catalog, stock, clock)
            .map(Widget::body)
            .collect();
        if !freight.is_empty() {
            sections.push(Widget::Card(
                [Widget::title("Supplier deliveries")]
                    .into_iter()
                    .chain(freight)
                    .collect(),
            ));
        }
        if !town.trade.notice.is_empty() {
            sections.insert(0, Widget::note(&town.trade.notice));
        }
        Some(Widget::Column(sections))
    }

    fn activate(
        action: &Action,
        village: &mut Village,
        catalog: &Catalog,
        setup: &WorldSetup,
        _camera: Option<&mut VillageCamera>,
    ) {
        if let Action::Edit(target) = *action {
            if !village
                .numeric_entry
                .as_ref()
                .is_some_and(|(active, _)| *active == target)
            {
                village.numeric_entry = Some((target, String::new()));
            }
            return;
        }
        let entry = village.numeric_entry.take();
        let clock = clock(village, setup);
        let town = &mut village.construction;
        match *action {
            Action::Page(forward) => town.page_trade(catalog, forward),
            Action::Item(row) => town.select_trade_row(catalog, row),
            Action::Orders => town.toggle_trade_queue(),
            Action::CancelOrder(row) => {
                town.cancel_trade_queue_row(catalog, &mut village.stock, row)
            }
            Action::HoldOrder(row) => {
                town.toggle_trade_queue_hold(&village.stock, row, clock.round_trip_km)
            }
            Action::Order(order) => {
                if town
                    .selected_trade_issue(catalog, &village.stock, clock, order)
                    .is_none()
                {
                    town.place_trade_order(catalog, &mut village.stock, clock, order);
                }
            }
            Action::Transport => town.toggle_supplier_construction(),
            Action::Policy(policy) => town.adjust_trade_policy(catalog, policy),
            Action::Apply => {
                if let Some((target, entry)) = entry {
                    apply_numeric_entry(target, &entry, town, catalog);
                }
            }
            Action::CancelEdit | Action::Edit(_) => {}
        }
    }
}

fn clock(village: &Village, setup: &WorldSetup) -> TownClock {
    TownClock {
        seconds: village.clock,
        round_trip_km: setup.round_trip_km(),
    }
}

fn button(action: Action, label: impl Into<String>, enabled: bool) -> Widget<Action> {
    Widget::Button(action, label.into(), enabled, false)
}

fn page(town: &Construction, catalog: &Catalog, caption: &str) -> Widget<Action> {
    let (page, pages) = town.trade_page(catalog);
    stepper(
        caption,
        Action::Page(false),
        format!("{} of {pages}", page + 1),
        Action::Page(true),
        pages > 1,
    )
}

fn orders(town: &Construction, catalog: &Catalog, clock: TownClock) -> Vec<Widget<Action>> {
    let mut sections = vec![Widget::Card(vec![
        Widget::title("Town trade orders"),
        Widget::Row(vec![
            page(town, catalog, "ORDER PAGE"),
            button(Action::Orders, "Browse materials", true),
        ]),
        Widget::body(format!(
            "{} queued · {} sales delivered",
            town.trade.orders.len(),
            town.trade.receipts,
        )),
    ])];
    let rows = town.trade_queue_labels(catalog, clock);
    if rows.is_empty() {
        sections.push(Widget::note("No pickup or sale orders."));
    }
    for (index, entry) in rows.into_iter().enumerate() {
        let mut controls = vec![button(
            Action::CancelOrder(index),
            "Cancel order",
            entry.can_cancel,
        )];
        if let Some(held) = entry.held {
            controls.push(Widget::Button(
                Action::HoldOrder(index),
                if held {
                    "Allow dedicated trip"
                } else {
                    "Hold for pickup"
                }
                .into(),
                true,
                held,
            ));
        }
        let mut card = vec![Widget::body(entry.label), Widget::Row(controls)];
        if !entry.can_cancel {
            card.push(Widget::note("This order is already booked for a trip."));
        }
        sections.push(Widget::Card(card));
    }
    sections
}

fn materials(town: &Construction, catalog: &Catalog) -> Widget<Action> {
    let mut card = vec![
        Widget::title("Browse materials"),
        Widget::Row(vec![
            page(town, catalog, "MATERIALS PAGE"),
            button(Action::Orders, "View orders", true),
        ]),
        Widget::note(format!(
            "{} orders queued · {} purchases fulfilled",
            town.trade.orders.len(),
            town.trade.purchases
        )),
    ];
    let selected = Trade::tradable(catalog).get(town.trade.selected).copied();
    let mut group = "";
    let mut items = Vec::new();
    for (row, item) in town.trade_page_items(catalog).enumerate() {
        if item.group != group {
            if !items.is_empty() {
                card.push(Widget::Row(std::mem::take(&mut items)));
            }
            group = item.group;
            card.push(Widget::caption(group.to_uppercase()));
        }
        items.push(Widget::Button(
            Action::Item(row),
            item.material.name.clone(),
            true,
            selected.is_some_and(|selected| selected.id == item.id),
        ));
    }
    if items.is_empty() {
        card.push(Widget::note("No town supplies listed."));
    } else {
        card.push(Widget::Row(items));
    }
    Widget::Card(card)
}

fn purchase(
    village: &Village,
    catalog: &Catalog,
    clock: TownClock,
    market: &TradeMarket,
) -> Widget<Action> {
    let town = &village.construction;
    let stock = &village.stock;
    let freight = town.supplier_construction();
    let order = TradeOrder::Buy { freight };
    let cancel = TradeOrder::Cancel;
    let buy_issue = |freight| {
        town.trade_item_issue(
            catalog,
            stock,
            clock,
            market.item.id,
            TradeOrder::Buy { freight },
        )
    };
    let pickup_issue = buy_issue(false);
    let freight_issue = buy_issue(true);
    let cancel_issue = town.trade_item_issue(catalog, stock, clock, market.item.id, cancel);
    let item = market.item.material;
    let (used, capacity) = town.storage(catalog, stock);
    let mut card = vec![
        Widget::title(format!("Buy {}", item.name)),
        Widget::body(&market.supplier),
        Widget::body(&market.purchase_totals),
        Widget::note(&market.transport),
        Widget::note(format!(
            "{} in stock · Storage {used}/{capacity} units",
            item.quantity_text(u64::from(stock.available(market.item.id))),
        )),
        Widget::Row(vec![
            Widget::Button(
                Action::Transport,
                if freight {
                    "Purchases: supplier freight"
                } else {
                    "Purchases: resident pickup"
                }
                .into(),
                true,
                freight,
            ),
            button(
                Action::Order(order),
                if freight {
                    "Buy for delivery"
                } else {
                    "Buy for pickup"
                },
                if freight { freight_issue } else { pickup_issue }.is_none(),
            ),
            button(
                Action::Order(cancel),
                "Cancel last order",
                cancel_issue.is_none(),
            ),
        ]),
    ];
    match (pickup_issue, freight_issue) {
        (Some(pickup), Some(freight)) if pickup == freight => card.push(Widget::note(pickup)),
        (pickup, freight) => {
            for (method, issue) in [("Pickup", pickup), ("Freight", freight)] {
                if let Some(issue) = issue {
                    card.push(Widget::note(format!("{method} unavailable · {issue}")));
                }
            }
        }
    }
    if market.supplier_renewal {
        card.push(Widget::note(
            "Supplier stock renews tomorrow. Paid orders keep their allocation.",
        ));
    }
    for note in [
        market.freight_eta.as_deref(),
        market.freight_shortfall.as_deref(),
        cancel_issue,
    ]
    .into_iter()
    .flatten()
    {
        card.push(Widget::note(note));
    }
    Widget::Card(card)
}

fn sales(
    village: &Village,
    catalog: &Catalog,
    clock: TownClock,
    market: &TradeMarket,
) -> Widget<Action> {
    let town = &village.construction;
    let item = market.item.material;
    let id = market.item.id;
    let stock = &village.stock;
    let policy = town.trade.policies.get(id);
    let default = Trade::default_sale_reserve(id);
    let unit = item.quantity_unit();
    let automatic = policy.is_some_and(|policy| policy.enabled);
    let sell = TradeOrder::Sell {
        hold_for_pickup: false,
    };
    let hold = TradeOrder::Sell {
        hold_for_pickup: true,
    };
    let sell_issue = town.trade_item_issue(catalog, stock, clock, id, sell);
    let hold_issue = town.trade_item_issue(catalog, stock, clock, id, hold);
    let reserve = policy.map_or(default, |policy| policy.reserve);
    let trigger = policy.map_or(default, |policy| policy.trigger);
    let limit = policy.map_or(0, |policy| policy.limit);
    let mut card = vec![
        Widget::title(format!("Sell {}", item.name)),
        Widget::body(&market.buyer),
        Widget::body(match &market.sale_quote {
            Ok(quote) => quote.as_str(),
            Err(issue) => issue,
        }),
        Widget::Row(vec![
            button(Action::Order(sell), "Reserve sale", sell_issue.is_none()),
            button(
                Action::Order(hold),
                "Sell on shared trip",
                hold_issue.is_none(),
            ),
        ]),
    ];
    if let Some(issue) = sell_issue.filter(|issue| Some(*issue) != hold_issue) {
        card.push(Widget::note(issue));
    }
    card.extend([
        Widget::caption("AUTOMATIC SALES"),
        Widget::note(&market.automatic_sale),
        Widget::Button(
            Action::Policy(TradePolicy::AutomaticSale),
            if automatic { "Automatic sales on" } else { "Enable automatic sales" }.into(),
            !stock.sandbox,
            automatic && !stock.sandbox,
        ),
        Widget::Row(
            [
                (SaleSetting::Reserve, "Keep at least", reserve),
                (SaleSetting::Trigger, "Sell when above", trigger),
                (SaleSetting::Limit, "Maximum per day", limit),
            ]
            .into_iter()
            .map(|(setting, label, quantity)| {
                let value = if setting == SaleSetting::Limit && quantity == 0 {
                    "Unlimited".into()
                } else {
                    item.quantity_text(u64::from(quantity))
                };
                setting_field(
                    village,
                    NumericTarget::Sale(setting),
                    format!("{label} ({unit})"),
                    format!("{label} · {value}"),
                    |entry| format!("{entry} {unit}"),
                )
            })
            .collect(),
        ),
        Widget::Row(vec![
            button(Action::Policy(TradePolicy::Reserve(false)), "Keep one pack less", reserve > 0),
            button(Action::Policy(TradePolicy::Reserve(true)), "Keep one pack more", true),
        ]),
        Widget::note("Automatic sales use whole trade batches and leave committed goods in the village. Set the production target at least one trade batch above the amount you want to protect."),
    ]);
    Widget::Card(card)
}

fn dispatch(village: &Village) -> Widget<Action> {
    let town = &village.construction;
    let (fill, wait, urgent) = town.dispatch_settings();
    let restock = !town.trade.household_restock_off;
    Widget::Card(vec![
        Widget::title("Consolidate automatic town trips"),
        Widget::note(
            "Automatic trips wait for the minimum load or the time limit. Food shopping and trips you request leave promptly.",
        ),
        Widget::Row(vec![
            setting_field(
                village,
                NumericTarget::MinimumLoad,
                "Set minimum load",
                format!("Minimum load · {fill}%"),
                |entry| format!("{entry}% (0–100)"),
            ),
            setting_field(
                village,
                NumericTarget::DispatchWait,
                "Set maximum wait",
                format!("Maximum wait · {wait:.1}h"),
                |entry| format!("{entry}h (0–24)"),
            ),
        ]),
        Widget::Row(vec![
            Widget::Button(
                Action::Policy(TradePolicy::DispatchNow),
                if urgent {
                    "Waiting loads marked urgent"
                } else {
                    "Send waiting loads now"
                }
                .into(),
                !urgent,
                urgent,
            ),
            Widget::Button(
                Action::Policy(TradePolicy::HouseholdRestock),
                if restock {
                    "Household restock on"
                } else {
                    "Enable household restock"
                }
                .into(),
                true,
                restock,
            ),
        ]),
    ])
}

fn setting_field(
    village: &Village,
    target: NumericTarget,
    label: impl Into<String>,
    value: String,
    format_entry: impl FnOnce(&str) -> String,
) -> Widget<Action> {
    let mut children = vec![Widget::body(value)];
    if let Some((active, entry)) = &village.numeric_entry
        && *active == target
    {
        children.push(Widget::Field(
            Action::Edit(target),
            format_entry(entry),
            true,
        ));
        children.push(Widget::Row(vec![
            button(Action::Apply, "Apply", !entry.is_empty()),
            button(Action::CancelEdit, "Cancel edit", true),
        ]));
    } else {
        children.push(Widget::Field(Action::Edit(target), label.into(), false));
    }
    Widget::Column(children)
}
