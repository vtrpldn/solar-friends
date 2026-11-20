use super::{
    widgets::{Widget, cycle, stepper},
    *,
};

#[derive(Clone, PartialEq)]
pub(in crate::village) enum Action {
    Town(town_trip::Action),
    View(InventoryView),
    Search,
    Page(bool),
    Trade(String),
}

pub(in crate::village) struct Screen;

impl widgets::Screen for Screen {
    type Action = Action;
    const PANEL: UtilityPanel = UtilityPanel::Inventory;

    fn content(
        village: &Village,
        catalog: &Catalog,
        setup: &WorldSetup,
        _land: &Land,
    ) -> Option<Widget<Action>> {
        (village.inventory_view != InventoryView::Production)
            .then(|| refresh(village, catalog, setup))
    }

    fn activate(
        action: &Action,
        village: &mut Village,
        catalog: &Catalog,
        setup: &WorldSetup,
        _camera: Option<&mut VillageCamera>,
    ) {
        input(action, village, catalog, setup);
    }
}

pub(super) fn spawn(parent: &mut ChildSpawnerCommands, _assets: &AssetServer) {
    widgets::spawn::<Screen>(parent);
}

pub(super) fn refresh(village: &Village, catalog: &Catalog, setup: &WorldSetup) -> Widget<Action> {
    let view = village.inventory_view;
    let (pages, rows) = crate::construction::inventory_rows(
        catalog,
        village.inventory_page,
        view,
        &village.inventory_search,
    );
    let page = village.inventory_page.min(pages - 1);
    let mut list = vec![Widget::Field(
        Action::Search,
        if village.editing_inventory {
            format!("{}|   Enter to finish", village.inventory_search)
        } else if village.inventory_search.is_empty() {
            "Search the stores   /".into()
        } else {
            format!("Search: {}", village.inventory_search)
        },
        village.editing_inventory,
    )];
    let mut group = None;
    for (name, id, item) in rows {
        if group != Some(name) {
            list.push(Widget::caption(name.to_uppercase()));
            group = Some(name);
        }
        let stock = &village.stock;
        let (available, borrowed, broken, repairing) = if item.equipment {
            village.construction.equipment_in_stores(catalog, stock, id)
        } else {
            (stock.available(id), 0, 0, false)
        };
        let mut card = vec![
            Widget::title(&item.name),
            Widget::body(if stock.sandbox {
                "Unlimited".into()
            } else {
                format!("{} available", item.quantity_text(u64::from(available)))
            }),
        ];
        if item.equipment {
            card.push(Widget::note(format!(
                "{borrowed} in use / {broken} need repair"
            )));
            if repairing {
                card.push(Widget::note("Repair queued"));
            }
        }
        if item.pack > 0 && item.price > 0. {
            card.push(Widget::Button(
                Action::Trade(id.into()),
                "Trade in town".into(),
                true,
                false,
            ));
        }
        list.push(Widget::Card(vec![Widget::illustrated(id, card)]));
    }
    if group.is_none() {
        list.push(Widget::note("No items match this search."));
    }
    list.push(stepper(
        "STORE PAGES",
        Action::Page(false),
        format!("{} of {pages}", page + 1),
        Action::Page(true),
        pages > 1,
    ));
    Widget::Column(vec![
        Widget::Row(
            [
                InventoryView::Resources,
                InventoryView::Equipment,
                InventoryView::Food,
            ]
            .into_iter()
            .map(|choice| {
                Widget::Button(
                    Action::View(choice),
                    choice.label().into(),
                    true,
                    choice == view,
                )
            })
            .collect(),
        ),
        Widget::Row(vec![
            Widget::Card(list),
            town_trip::card(
                village,
                catalog,
                setup,
                view == InventoryView::Food,
                Action::Town,
            ),
        ]),
    ])
}

pub(super) fn input(action: &Action, village: &mut Village, catalog: &Catalog, setup: &WorldSetup) {
    match action {
        Action::Town(action) => {
            let food = village.inventory_view == InventoryView::Food;
            town_trip::input(*action, village, catalog, setup, food);
        }
        Action::View(view) => {
            village.inventory_view = *view;
            village.inventory_page = 0;
            village.editing_inventory = false;
        }
        Action::Search => village.editing_inventory = !village.editing_inventory,
        Action::Page(forward) => {
            let (pages, _) = crate::construction::inventory_rows(
                catalog,
                village.inventory_page,
                village.inventory_view,
                &village.inventory_search,
            );
            village.inventory_page = cycle(village.inventory_page.min(pages - 1), pages, *forward);
        }
        Action::Trade(id) => {
            village.construction.select_trade_material(catalog, id);
            village.editing_inventory = false;
        }
    }
}
