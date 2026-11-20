use super::{
    widgets::{Widget, cycle, stepper},
    *,
};

#[derive(Clone, Copy, PartialEq)]
pub(in crate::village) enum Action {
    Automatic,
    AdjustBudget { shopping: bool, increase: bool },
    EditBudget(bool),
    ApplyBudget(bool),
    CancelEdit,
    Supplies,
    Find(usize),
    Page(bool),
}

pub(in crate::village) struct Screen;

impl widgets::Screen for Screen {
    type Action = Action;
    const PANEL: UtilityPanel = UtilityPanel::Upkeep;

    fn content(
        village: &Village,
        catalog: &Catalog,
        _setup: &WorldSetup,
        _land: &Land,
    ) -> Option<Widget<Action>> {
        if village.stock.sandbox {
            return Some(Widget::Card(vec![Widget::note(
                "Maintenance work and budgets apply in story mode.",
            )]));
        }

        let town = &village.construction;
        let automatic = town.automatic_upkeep();
        let pages = town.upkeep_pages();
        let page = village.upkeep_page.min(pages - 1);
        let mut settings = vec![
            Widget::title("Service settings"),
            button(
                Action::Automatic,
                if automatic {
                    "Automatic maintenance on"
                } else {
                    "Automatic maintenance off"
                },
                true,
                automatic,
            ),
            Widget::Row(vec![budget(village, false), budget(village, true)]),
            button(Action::Supplies, "Manage service supplies", true, false),
        ];
        if !automatic {
            settings.insert(
                2,
                Widget::note(
                    "Turn on automatic maintenance to resume equipment and vehicle service.",
                ),
            );
        }

        let mut sections = vec![Widget::Card(settings)];
        let mut jobs = vec![
            Widget::title("Building jobs"),
            Widget::note(format!("{} queued", town.upkeep_job_count())),
        ];
        if pages > 1 {
            jobs.push(stepper(
                "PAGE",
                Action::Page(false),
                format!("{} of {pages}", page + 1),
                Action::Page(true),
                true,
            ));
        }
        if town.upkeep_job_count() == 0 {
            jobs[1] = Widget::note("No building maintenance is queued.");
        }
        sections.push(Widget::Column(jobs));
        sections.extend(town.upkeep_building_jobs(catalog, page).map(|job| {
            let title = format!("{} #{}", job.name, job.index + 1);
            let mut rows = vec![Widget::title(&title), Widget::body(job.work)];
            if let Some(progress) = job.progress {
                rows.push(Widget::note(format!("{:.0}% complete", progress * 100.)));
                rows.push(Widget::Meter(progress));
            } else {
                rows.push(Widget::note(
                    "Waiting for an available resident, parts, or budget.",
                ));
            }
            rows.push(Widget::note(job.supplies));
            rows.push(button(
                Action::Find(job.index),
                format!("Find {title}"),
                true,
                false,
            ));
            Widget::Card(rows)
        }));

        sections.push(Widget::Row(
            town.upkeep_vehicles(catalog)
                .enumerate()
                .map(|(index, vehicle)| {
                    let mut rows = vec![
                        Widget::title(format!("Vehicle {}", index + 1)),
                        Widget::body(format!("{:.0}% condition", vehicle.condition)),
                        Widget::Meter(vehicle.condition as f32 / 100.),
                        Widget::note(format!("{} km", vehicle.kilometers)),
                    ];
                    if let Some((progress, supplies)) = vehicle.service {
                        rows.push(match progress {
                            Some(progress) => {
                                Widget::body(format!("Service {:.0}% complete", progress * 100.))
                            }
                            None => Widget::body("Service queued"),
                        });
                        rows.push(Widget::note(supplies));
                    }
                    Widget::Card(rows)
                })
                .collect(),
        ));

        if let Some(asset) = town.upkeep_selected_asset(catalog) {
            sections.push(Widget::Card(vec![
                Widget::caption("SELECTED BUILDING"),
                Widget::title(format!("{} #{}", asset.name, asset.index + 1)),
                Widget::body(format!("{:.0}% condition", asset.condition)),
                Widget::Meter(asset.condition as f32 / 100.),
                Widget::note(format!(
                    "Age {:.1} years · Battery {:.1} years",
                    asset.years, asset.battery_years
                )),
            ]));
        }
        Some(Widget::Column(sections))
    }

    fn activate(
        action: &Action,
        village: &mut Village,
        catalog: &Catalog,
        setup: &WorldSetup,
        camera: Option<&mut VillageCamera>,
    ) {
        if village.stock.sandbox {
            return;
        }
        match *action {
            Action::Automatic => village.construction.toggle_automatic_upkeep(),
            Action::AdjustBudget { shopping, increase } => {
                village.numeric_entry = None;
                village
                    .construction
                    .adjust_upkeep_budget(shopping, increase);
            }
            Action::EditBudget(shopping) => {
                village.numeric_entry = Some((target(shopping), String::new()));
            }
            Action::ApplyBudget(shopping) => {
                if let Some((active, entry)) = village.numeric_entry.take()
                    && active == target(shopping)
                {
                    apply_numeric_entry(active, &entry, &mut village.construction, catalog);
                }
            }
            Action::CancelEdit => village.numeric_entry = None,
            Action::Supplies => village.open_panel(UtilityPanel::Inventory),
            Action::Find(index) => {
                if let Some(camera) = camera
                    && let Some(point) = village.construction.focus_upkeep_job(index)
                {
                    let terrain = village.terrain(setup);
                    camera.target =
                        Vec3::new(point.x, terrain.height_at(point.x, point.y), point.y);
                    village.utility_panel = None;
                }
            }
            Action::Page(forward) => {
                let pages = village.construction.upkeep_pages();
                village.upkeep_page = cycle(village.upkeep_page.min(pages - 1), pages, forward);
            }
        }
    }
}

fn budget(village: &Village, shopping: bool) -> Widget<Action> {
    let (spent, limit) = village.construction.upkeep_budget(shopping);
    let (title, label, explanation) = if shopping {
        (
            "Feed and repair shopping",
            "Set feed and repair budget",
            "Set a budget above zero to buy missing supplies. Residents use stores and available fodder first.",
        )
    } else {
        (
            "Maintenance parts",
            "Set parts allowance",
            "Limit the value of parts used from stores each day.",
        )
    };
    let entry = village
        .numeric_entry
        .as_ref()
        .filter(|(active, _)| *active == target(shopping))
        .map(|(_, text)| text);
    let change = Construction::UPKEEP_BUDGET_STEP / 100;
    let mut rows = vec![
        Widget::caption(title.to_uppercase()),
        Widget::body(format!(
            "R${:.2} of R${:.2} used today",
            spent as f64 / 100.,
            limit as f64 / 100.
        )),
        Widget::Meter(spent as f32 / limit.max(1) as f32),
        Widget::note(explanation),
        Widget::Field(
            Action::EditBudget(shopping),
            entry.map_or_else(|| label.into(), |entry| format!("R${entry}")),
            entry.is_some(),
        ),
    ];
    let buttons = if let Some(entry) = entry {
        vec![
            button(
                Action::ApplyBudget(shopping),
                "Apply budget",
                !entry.is_empty(),
                false,
            ),
            button(Action::CancelEdit, "Cancel editing", true, false),
        ]
    } else {
        vec![
            button(
                Action::AdjustBudget {
                    shopping,
                    increase: false,
                },
                format!("− R${change}"),
                limit > 0,
                false,
            ),
            button(
                Action::AdjustBudget {
                    shopping,
                    increase: true,
                },
                format!("+ R${change}"),
                limit < Construction::UPKEEP_BUDGET_LIMIT,
                false,
            ),
        ]
    };
    rows.push(Widget::Row(buttons));
    Widget::Column(rows)
}

fn target(shopping: bool) -> NumericTarget {
    if shopping {
        NumericTarget::MaintenanceShopping
    } else {
        NumericTarget::MaintenanceParts
    }
}

fn button(action: Action, label: impl Into<String>, enabled: bool, active: bool) -> Widget<Action> {
    Widget::Button(action, label.into(), enabled, active)
}
