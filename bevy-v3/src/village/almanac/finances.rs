use super::{
    widgets::{Widget, cycle, stepper},
    *,
};
use crate::town_work::{JOBS, RETURN_FARE};
use crate::village::money;

#[derive(Clone, Copy, PartialEq)]
pub(in crate::village) enum Action {
    Resident(bool),
    Book(bool),
    Records,
    RecordPage(bool),
    Power,
    Trade,
    Reserve,
}

fn button(action: Action, label: impl Into<String>, enabled: bool, active: bool) -> Widget<Action> {
    Widget::Button(action, label.into(), enabled, active)
}

pub(in crate::village) struct Screen;

impl widgets::Screen for Screen {
    type Action = Action;
    const PANEL: UtilityPanel = UtilityPanel::Finances;

    fn content(
        village: &Village,
        catalog: &Catalog,
        setup: &WorldSetup,
        land: &Land,
    ) -> Option<Widget<Action>> {
        Some(refresh(village, catalog, land, setup))
    }

    fn activate(
        action: &Action,
        village: &mut Village,
        _catalog: &Catalog,
        _setup: &WorldSetup,
        _camera: Option<&mut VillageCamera>,
    ) {
        input(*action, village);
    }
}

pub(super) fn spawn(parent: &mut ChildSpawnerCommands, _assets: &AssetServer) {
    widgets::spawn::<Screen>(parent);
}

pub(super) fn refresh(
    village: &Village,
    catalog: &Catalog,
    land: &Land,
    setup: &WorldSetup,
) -> Widget<Action> {
    let stock = &village.stock;
    if stock.sandbox {
        return Widget::Card(vec![
            Widget::title("Village records"),
            Widget::note("Sandbox supplies and funds are unlimited. Purchases are not tracked."),
        ]);
    }
    let town = &village.construction;
    let clock = TownClock {
        seconds: village.clock,
        round_trip_km: setup.round_trip_km(),
    };
    let (available, committed) = town.finance_commitments(catalog, stock, clock);
    if village.finance_history_open {
        let (pages, transactions) = stock.finance_history(village.finance_history_page);
        return Widget::Column(vec![
            Widget::Row(vec![
                button(Action::Records, "Close records", true, false),
                button(
                    Action::RecordPage(false),
                    "Previous records",
                    pages > 1,
                    false,
                ),
                button(Action::RecordPage(true), "Next records", pages > 1, false),
            ]),
            Widget::Card(vec![
                Widget::title("Recent transactions"),
                Widget::body(transactions),
            ]),
            Widget::Card(vec![
                Widget::title("Store movements"),
                Widget::body(stock.material_history(catalog)),
            ]),
            Widget::Card(vec![
                Widget::title("Accounts summary"),
                Widget::body(town.finance_summary(
                    catalog,
                    stock,
                    village.selected_resident,
                    clock,
                )),
                Widget::note(town.expansion_reserve_label()),
            ]),
        ]);
    }
    let (opening, start) = stock.finance_opening();
    let mut sections = vec![
        Widget::Card(vec![
            Widget::title("Village records"),
            Widget::note(match (opening, start) {
                (Some(cents), Some(day)) => format!(
                    "Records begin on day {} with {}.",
                    day + 1,
                    money(cents as f64 / 100.)
                ),
                _ => "The ledger shows the transactions recorded for this village.".into(),
            }),
            Widget::body(format!(
                "{} available to spend",
                money(available as f64 / 100.)
            )),
            Widget::note(format!(
                "{} committed to town transport",
                money(committed as f64 / 100.)
            )),
            Widget::Row(vec![
                button(Action::Records, "View records", true, false),
                button(Action::Trade, "Town trade", true, false),
                button(Action::Power, "Power costs", true, false),
            ]),
        ]),
        paid_work(village),
    ];
    let outlook = stock.cash_forecast(committed).map_or_else(
        || "A cash forecast needs one complete recorded day.".into(),
        |(days, low, high, mean)| {
            let change = if mean < 0. { money(mean) } else { format!("+{}", money(mean)) };
            let days = if days == 1 { "1 completed day".to_owned() } else { format!("{days} completed days") };
            format!("{} to {} available in seven days. Based on {days} with an average change of {change} per day. Excludes new construction.", money(low), money(high))
        },
    );
    let (income, expenses, _) = stock.finance_totals();
    let investment = stock.construction_investment();
    sections.extend([
        Widget::Card(vec![
            Widget::title("Seven-day outlook"),
            Widget::caption("OPERATING CASH"),
            Widget::body(outlook),
            Widget::caption("CONSTRUCTION & SUPPLIES"),
            Widget::body(format!("{} invested in construction / {} in other expenses",
                money(investment as f64 / 100.), money((expenses - investment).max(0) as f64 / 100.))),
            Widget::note(format!("{} recorded income. Unpaid exports become available after settlement.", money(income as f64 / 100.))),
        ]),
        Widget::Card(vec![
            Widget::title("Where our supplies are"),
            Widget::note(town.replacement_costs(catalog, stock, land)),
            Widget::note("The village began with its land and two cars already owned. Each car has an estimated book value of R$60,000."),
        ]),
        Widget::Card(vec![
            Widget::title("Protect everyday supplies"),
            Widget::body(format!("{} protected when auto-buying construction materials",
                money(town.expansion_reserve_cents() as f64 / 100.))),
            button(Action::Reserve, match &village.numeric_entry {
                Some((NumericTarget::ExpansionReserve, entry)) => format!("R${entry}   Enter to set"),
                _ => "Set expansion reserve".into(),
            }, true, village.numeric_entry.as_ref().is_some_and(|(target, _)| *target == NumericTarget::ExpansionReserve)) ,
        ]),
    ]);
    Widget::Column(sections)
}

fn paid_work(village: &Village) -> Widget<Action> {
    let resident = village.selected_resident.min(NAMES.len() - 1);
    let town = &village.construction;
    let (job, wage) = JOBS[resident];
    let shift = town.lab_town_work(resident);
    let hours = if shift.shift.as_ref().is_some_and(|active| !active.full_day) {
        4
    } else {
        8
    };
    let gross = wage * if hours == 4 { 100 } else { 200 };
    let status = if shift.active() {
        shift.status()
    } else if shift.booked {
        "Booked. Residents leave between 08:00 and 11:00 when rested and available."
    } else {
        "Residents leave between 08:00 and 11:00 when rested and available."
    };
    Widget::Card(vec![
        Widget::title("Paid work in town"),
        stepper(
            "RESIDENT",
            Action::Resident(false),
            NAMES[resident],
            Action::Resident(true),
            NAMES.len() > 1,
        ),
        Widget::body(format!("{job} ({hours}-hour shift)")),
        Widget::Row(
            [
                ("GROSS", gross),
                ("BUS FARE", RETURN_FARE),
                ("TAKE-HOME", gross - RETURN_FARE),
            ]
            .into_iter()
            .map(|(label, cents)| {
                Widget::Column(vec![
                    Widget::caption(label),
                    Widget::body(money(cents as f64 / 100.)),
                ])
            })
            .collect(),
        ),
        Widget::note(status),
        button(
            Action::Book(false),
            town.shift_action(resident, false)
                .unwrap_or("Shift underway"),
            town.shift_action(resident, false).is_some(),
            shift.booked && !shift.active(),
        ),
        button(
            Action::Book(true),
            town.shift_action(resident, true)
                .unwrap_or("Repeat weekday shifts"),
            true,
            shift.repeating,
        ),
    ])
}

pub(super) fn input(action: Action, village: &mut Village) {
    if village.stock.sandbox {
        return;
    }
    let resident = village.selected_resident.min(NAMES.len() - 1);
    match action {
        Action::Resident(forward) => {
            village.selected_resident = cycle(resident, NAMES.len(), forward)
        }
        Action::Book(false) => village.construction.toggle_shift(resident),
        Action::Book(true) => village.construction.toggle_weekday_shift(resident),
        Action::Records => {
            village.finance_history_open = !village.finance_history_open;
            village.finance_history_page = 0;
        }
        Action::RecordPage(forward) => {
            let (pages, _) = village.stock.finance_history(village.finance_history_page);
            village.finance_history_page =
                cycle(village.finance_history_page.min(pages - 1), pages, forward);
        }
        Action::Power => village.utility_panel = Some(UtilityPanel::Power),
        Action::Trade => village.utility_panel = Some(UtilityPanel::Trade),
        Action::Reserve => {
            village.numeric_entry = Some((NumericTarget::ExpansionReserve, String::new()))
        }
    }
}
