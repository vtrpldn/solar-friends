use super::{
    widgets::{Widget, cycle, stepper},
    *,
};

#[derive(Clone, Copy, PartialEq)]
pub(in crate::village) enum Action {
    Town(town_trip::Action),
    Automatic,
    Target { preserved: bool, delta: i8 },
    Chill(bool),
    Transport,
    Batches,
    BatchPage(bool),
    Purchases,
    Budget,
    Reserve(bool),
    Limit(bool),
}

pub(in crate::village) struct Screen;

impl widgets::Screen for Screen {
    type Action = Action;
    const PANEL: UtilityPanel = UtilityPanel::Pantry;

    fn content(
        village: &Village,
        catalog: &Catalog,
        setup: &WorldSetup,
        land: &Land,
    ) -> Option<Widget<Action>> {
        Some(refresh(village, catalog, setup, land))
    }

    fn activate(
        action: &Action,
        village: &mut Village,
        catalog: &Catalog,
        setup: &WorldSetup,
        _camera: Option<&mut VillageCamera>,
    ) {
        input(*action, village, catalog, setup);
    }
}

pub(super) fn spawn(parent: &mut ChildSpawnerCommands, _assets: &AssetServer) {
    widgets::spawn::<Screen>(parent);
}

pub(super) fn refresh(
    village: &Village,
    catalog: &Catalog,
    setup: &WorldSetup,
    land: &Land,
) -> Widget<Action> {
    let stock = &village.stock;
    let town = &village.construction;
    if let Some(page) = village.pantry_batch_page {
        return batches(village, catalog, land, page);
    }
    let policy = &town.production.kitchen_policy;
    let active = !stock.sandbox;
    let mut kitchen = vec![
        Widget::title("From pantry to plate"),
        Widget::caption("KITCHEN POLICY"),
        Widget::Button(
            Action::Automatic,
            if policy.automatic && active {
                "Automatic food management: on"
            } else {
                "Manage food automatically"
            }
            .into(),
            active,
            policy.automatic && active,
        ),
    ];
    for (preserved, label) in [
        (false, "FRESH-MEAL TARGET"),
        (true, "DRIED-PROVISION TARGET"),
    ] {
        let half_days = policy.half_days(preserved);
        kitchen.push(stepper(
            label,
            Action::Target {
                preserved,
                delta: -1,
            },
            format!("{:.1} days", f32::from(half_days) / 2.),
            Action::Target {
                preserved,
                delta: 1,
            },
            active,
        ));
    }
    kitchen.push(Widget::note(if active {
        "Targets use three portions per resident per day. Residents need time, water and energy to prepare batches."
    } else {
        "Food is unlimited in sandbox. Kitchen automation and spoilage are inactive."
    }));
    let cooling = &town.utilities;
    let powered = cooling.powered_cold_storage();
    let installed = cooling.installed_cold_storage();
    let mut refrigeration = vec![
        Widget::title("Refrigeration"),
        Widget::body(format!(
            "{powered:.0} L powered / {installed:.0} L installed"
        )),
        Widget::Meter(if installed > 0. {
            (powered / installed) as f32
        } else {
            0.
        }),
        stepper(
            "CHILL FIRST",
            Action::Chill(false),
            stock.pantry.priority.label(),
            Action::Chill(true),
            true,
        ),
    ];
    if powered < installed {
        refrigeration.push(Widget::note(
            "Food in unpowered refrigeration ages at its normal rate.",
        ));
    }
    if active {
        let status = stock.pantry.status(catalog, powered, installed);
        if let Some(expiry) = status.lines().next() {
            refrigeration.push(Widget::note(expiry));
        }
    }
    if active && let Some(warning) = stock.pantry.use_soon(catalog, village.clock) {
        refrigeration.push(Widget::note(warning));
    }
    let transport = town.supplier_construction();
    Widget::Column(vec![
        Widget::Row(vec![Widget::Card(kitchen), Widget::Card(refrigeration)]),
        Widget::Row(vec![
            town_trip::card(village, catalog, setup, true, Action::Town),
            Widget::Card(vec![
                Widget::title("Food supplies"),
                Widget::Button(
                    Action::Transport,
                    if transport {
                        "Supplier freight"
                    } else {
                        "Resident pickup"
                    }
                    .into(),
                    active,
                    transport && active,
                ),
                Widget::note("Choose how supplies are brought to the village."),
                Widget::Button(
                    Action::Purchases,
                    if town.trade.household_restock_off {
                        "Enable automatic shopping"
                    } else {
                        "Automatic shopping on"
                    }
                    .into(),
                    active,
                    active && !town.trade.household_restock_off,
                ),
                Widget::Button(
                    Action::Budget,
                    match &village.numeric_entry {
                        Some((NumericTarget::Food, entry)) => format!("R${entry}   Enter to set"),
                        _ => "Set food budget".into(),
                    },
                    active,
                    village
                        .numeric_entry
                        .as_ref()
                        .is_some_and(|(target, _)| *target == NumericTarget::Food),
                ),
                stepper(
                    "KEEP IN RESERVE",
                    Action::Reserve(false),
                    format!("{:.1} days", f32::from(town.trade.pantry_plan().0) / 2.),
                    Action::Reserve(true),
                    active,
                ),
                stepper(
                    "DAILY FOOD BUDGET",
                    Action::Limit(false),
                    format!("R${:.0}", town.trade.pantry_plan().1 as f64 / 100.),
                    Action::Limit(true),
                    active,
                ),
                Widget::note(
                    town.pantry_purchase_status(
                        catalog,
                        stock,
                        TownClock {
                            seconds: village.clock,
                            round_trip_km: setup.round_trip_km(),
                        },
                    )
                    .lines()
                    // The first two lines are the toggle and the steppers above.
                    .skip(2)
                    .filter(|line| !line.starts_with("D Automatic supplies"))
                    .collect::<Vec<_>>()
                    .join("\n"),
                ),
                Widget::Button(Action::Batches, "Inspect food batches".into(), true, false),
            ]),
        ]),
    ])
}

fn batches(village: &Village, catalog: &Catalog, land: &Land, page: usize) -> Widget<Action> {
    let stock = &village.stock;
    let (pages, lots) = stock.pantry.batches(catalog, page.saturating_sub(1));
    let mut contents = vec![Widget::Button(
        Action::Batches,
        "Back to food".into(),
        true,
        false,
    )];
    if stock.sandbox {
        contents.push(Widget::Card(vec![
            Widget::title("Food batches"),
            Widget::note("Unlimited food in sandbox. Food does not spoil."),
        ]));
    } else if page == 0 {
        contents.push(Widget::Card(vec![
            Widget::body(stock.pantry.shelves(catalog, |id| stock.available(id))),
            Widget::body(
                village
                    .construction
                    .pantry_commitments(catalog, stock, land),
            ),
            Widget::note(village.construction.production.kitchen_policy.status()),
        ]));
    } else {
        contents.push(Widget::Card(vec![
            Widget::title("Individual batches"),
            Widget::body(lots),
        ]));
    }
    if !stock.sandbox {
        contents.push(stepper(
            "SHELVES & BATCHES",
            Action::BatchPage(false),
            if page == 0 {
                "On the shelves".into()
            } else {
                format!("Batch page {} of {pages}", page.min(pages))
            },
            Action::BatchPage(true),
            pages > 0,
        ));
    }
    Widget::Column(contents)
}

pub(super) fn input(action: Action, village: &mut Village, catalog: &Catalog, setup: &WorldSetup) {
    match action {
        Action::Town(action) if village.pantry_batch_page.is_none() => {
            town_trip::input(action, village, catalog, setup, true);
        }
        Action::Automatic if !village.stock.sandbox => {
            village.construction.production.kitchen_policy.toggle()
        }
        Action::Target { preserved, delta } if !village.stock.sandbox => {
            village
                .construction
                .production
                .kitchen_policy
                .change(preserved, delta);
        }
        Action::Chill(forward) => {
            let priority = village.stock.pantry.priority;
            village.stock.pantry.priority = if forward {
                priority.next()
            } else {
                priority.next().next()
            };
        }
        Action::Transport if !village.stock.sandbox => {
            village.construction.toggle_supplier_construction()
        }
        Action::Batches => {
            village.pantry_batch_page = village.pantry_batch_page.is_none().then_some(0)
        }
        Action::BatchPage(forward) if !village.stock.sandbox => {
            if let Some(page) = &mut village.pantry_batch_page {
                let (pages, _) = village
                    .stock
                    .pantry
                    .batches(catalog, page.saturating_sub(1));
                *page = cycle((*page).min(pages), pages + 1, forward);
            }
        }
        Action::Purchases if !village.stock.sandbox => {
            village.construction.trade.pantry_controls(0, 0, true)
        }
        Action::Reserve(up) if !village.stock.sandbox => village
            .construction
            .trade
            .pantry_controls(if up { 1 } else { -1 }, 0, false),
        Action::Limit(up) if !village.stock.sandbox => {
            village
                .construction
                .trade
                .pantry_controls(0, if up { 2_500 } else { -2_500 }, false)
        }
        Action::Budget if !village.stock.sandbox => {
            village.numeric_entry = Some((NumericTarget::Food, String::new()))
        }
        _ => {}
    }
}
