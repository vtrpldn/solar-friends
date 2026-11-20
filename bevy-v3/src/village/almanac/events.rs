use super::{
    widgets::{Widget, cycle, stepper},
    *,
};

#[derive(Clone, Copy, PartialEq)]
pub(in crate::village) struct Page(bool);

pub(in crate::village) struct Screen;

impl widgets::Screen for Screen {
    type Action = Page;
    const PANEL: UtilityPanel = UtilityPanel::Events;

    fn content(
        village: &Village,
        _catalog: &Catalog,
        _setup: &WorldSetup,
        _land: &Land,
    ) -> Option<Widget<Self::Action>> {
        let town = &village.construction;
        let pages = town.event_pages();
        let page = village.event_page.min(pages - 1);
        let mut rows: Vec<_> = town
            .event_page_rows(page)
            .map(|(caption, event)| {
                Widget::Card(vec![Widget::caption(caption), Widget::body(event)])
            })
            .collect();
        if rows.is_empty() {
            rows.push(Widget::Card(vec![Widget::note(
                "No village events recorded.",
            )]));
        }
        if pages > 1 {
            rows.insert(
                0,
                stepper(
                    "PAGE",
                    Page(false),
                    format!("{} of {pages}", page + 1),
                    Page(true),
                    true,
                ),
            );
        }
        Some(Widget::Column(rows))
    }

    fn activate(
        forward: &Self::Action,
        village: &mut Village,
        _catalog: &Catalog,
        _setup: &WorldSetup,
        _camera: Option<&mut VillageCamera>,
    ) {
        let pages = village.construction.event_pages();
        village.event_page = cycle(village.event_page.min(pages - 1), pages, forward.0);
    }
}
