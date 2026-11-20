use super::{
    widgets::{Widget, cycle, stepper},
    *,
};
use crate::{
    construction::TradeOrder,
    trade::{Trade, TradeItem},
};

#[derive(Clone, Copy, PartialEq)]
pub(in crate::village) enum Action {
    Step(bool),
    Order(TradeOrder),
}

fn options(catalog: &Catalog, food: bool) -> Vec<TradeItem<'_>> {
    Trade::tradable(catalog)
        .into_iter()
        .filter(|item| !food || catalog.food_resources.ids.iter().any(|id| id == item.id))
        .collect()
}

fn clock(village: &Village, setup: &WorldSetup) -> TownClock {
    TownClock {
        seconds: village.clock,
        round_trip_km: setup.round_trip_km(),
    }
}

pub(super) fn card<A: Clone + Send + Sync + 'static>(
    village: &Village,
    catalog: &Catalog,
    setup: &WorldSetup,
    food: bool,
    action: impl Fn(Action) -> A,
) -> Widget<A> {
    let town = &village.construction;
    let options = options(catalog, food);
    let selected = Trade::tradable(catalog).get(town.trade.selected).copied();
    let current = selected.filter(|item| options.iter().any(|option| item.id == option.id));
    let shown = current.or_else(|| options.first().copied());
    let mut children = vec![
        Widget::title("A trip to town"),
        stepper(
            "TOWN STORE",
            action(Action::Step(false)),
            shown.map_or("No supplies listed", |item| &item.material.name),
            action(Action::Step(true)),
            options.len() > 1,
        ),
    ];
    if let Some(item) = shown {
        let freight = town.supplier_construction();
        let clock = clock(village, setup);
        let stock = &village.stock;
        let name = &item.material.name;
        let buy = town.town_purchase_quote(catalog, stock, clock, item.id, freight);
        let sale = TradeOrder::Sell {
            hold_for_pickup: false,
        };
        let sale_issue = town.trade_item_issue(catalog, stock, clock, item.id, sale);
        children.extend([
            Widget::Button(
                action(Action::Order(TradeOrder::Buy { freight })),
                format!("Fetch {name} incl. transport"),
                buy.is_ok(),
                false,
            ),
            Widget::note(match buy {
                Ok(cents) => format!(
                    "{} for R${:.2} by {}",
                    item.material.quantity_text(u64::from(item.material.pack)),
                    cents as f64 / 100.,
                    if freight {
                        "supplier freight"
                    } else {
                        "resident pickup"
                    }
                ),
                Err(reason) => reason.into(),
            }),
            Widget::Button(
                action(Action::Order(sale)),
                format!("Queue sale: {name}"),
                sale_issue.is_none(),
                false,
            ),
        ]);
        if let Some(issue) = sale_issue {
            children.push(Widget::note(issue));
        } else if let Ok((quantity, cents)) =
            town.trade
                .quote_sale_order(catalog, stock, item.id, clock.day(), 0)
        {
            children.push(Widget::note(format!(
                "{} for R${:.2} before trip fuel",
                item.material.quantity_text(u64::from(quantity)),
                cents as f64 / 100.
            )));
        }
    }
    if !town.trade.notice.is_empty() {
        children.push(Widget::body(&town.trade.notice));
    }
    children.push(Widget::note("Supplies need room in storage. Queued sales reserve goods until pickup. Buyers have daily limits and pay less for additional batches."));
    Widget::Card(children)
}

pub(super) fn input(
    action: Action,
    village: &mut Village,
    catalog: &Catalog,
    setup: &WorldSetup,
    food: bool,
) {
    let clock = clock(village, setup);
    let options = options(catalog, food);
    let town = &mut village.construction;
    let selected = Trade::tradable(catalog).get(town.trade.selected).copied();
    let index = selected.and_then(|item| options.iter().position(|option| option.id == item.id));
    match action {
        Action::Step(forward) if !options.is_empty() => {
            let next = cycle(index.unwrap_or(0), options.len(), forward);
            town.select_trade_material(catalog, options[next].id);
        }
        Action::Order(order) => {
            if let Some(item) = options.get(index.unwrap_or(0))
                && town
                    .trade_item_issue(catalog, &village.stock, clock, item.id, order)
                    .is_none()
            {
                town.select_trade_material(catalog, item.id);
                town.place_trade_order(catalog, &mut village.stock, clock, order);
            }
        }
        _ => {}
    }
}
