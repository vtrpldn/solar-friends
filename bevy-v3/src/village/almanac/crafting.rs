use super::{
    widgets::{Widget, cycle, stepper},
    *,
};
use crate::{
    catalog::ProductionRecipe,
    construction::{CraftView, Producer},
};

#[derive(Clone, PartialEq)]
pub(in crate::village) enum Action {
    Tab(CraftView),
    Recipe(String),
    Job(usize),
    Page(bool),
    Workspace(bool),
    Start,
    Move,
    Find,
}

fn button(action: Action, label: impl Into<String>, enabled: bool, active: bool) -> Widget<Action> {
    Widget::Button(action, label.into(), enabled, active)
}

pub(in crate::village) struct Screen;

impl widgets::Screen for Screen {
    type Action = Action;
    const PANEL: UtilityPanel = UtilityPanel::Crafting;

    fn content(
        village: &Village,
        catalog: &Catalog,
        _setup: &WorldSetup,
        _land: &Land,
    ) -> Option<Widget<Action>> {
        Some(refresh(village, catalog))
    }

    fn activate(
        action: &Action,
        village: &mut Village,
        catalog: &Catalog,
        setup: &WorldSetup,
        camera: Option<&mut VillageCamera>,
    ) {
        input(action, village, catalog, setup, camera);
    }
}

pub(super) fn spawn(parent: &mut ChildSpawnerCommands, _assets: &AssetServer) {
    widgets::spawn::<Screen>(parent);
}

fn output_item(recipe: &ProductionRecipe) -> &str {
    recipe
        .repair
        .as_deref()
        .or_else(|| {
            recipe
                .output
                .first_key_value()
                .map(|(item, _)| item.as_str())
        })
        .unwrap_or_default()
}

pub(super) fn refresh(village: &Village, catalog: &Catalog) -> Widget<Action> {
    let town = &village.construction;
    let view = village.craft_view;
    let (pages, rows) = village.producer_rows(catalog);
    let page = village.inventory_page.min(pages - 1);
    let mut list = vec![Widget::caption(match view {
        CraftView::Make => "RECIPES",
        CraftView::Repair => "SHARED EQUIPMENT",
        CraftView::Jobs => "VILLAGE JOBS",
    })];
    if rows.is_empty() {
        list.push(Widget::note(match view {
            CraftView::Make => "No craft recipes available.",
            CraftView::Repair => "No owned equipment to repair.",
            CraftView::Jobs => "No crafting jobs underway.",
        }));
    }
    for (target, name) in rows {
        let (action, active, status, item) = match target {
            Producer::CraftRecipe(id) => (
                Action::Recipe(id.into()),
                village.craft_recipe.as_deref() == Some(id),
                if town
                    .crafting_plan(catalog, &village.stock, id, None)
                    .is_ok()
                {
                    "Ready to make"
                } else {
                    "Requirements needed"
                },
                output_item(&catalog.production[id]),
            ),
            Producer::Site(site) => {
                let Some(job) = town.production.jobs.iter().find(|job| job.site == site) else {
                    continue;
                };
                (
                    Action::Job(site),
                    village.craft_job_site == Some(site),
                    town.craft_job_worker(site),
                    output_item(&catalog.production[&job.recipe]),
                )
            }
            Producer::Blueprint(_) => continue,
        };
        list.push(Widget::Card(vec![Widget::illustrated(
            item,
            vec![button(action, name, true, active), Widget::note(status)],
        )]));
    }
    if pages > 1 {
        list.push(stepper(
            "RECIPE PAGES",
            Action::Page(false),
            format!("{} of {pages}", page + 1),
            Action::Page(true),
            true,
        ));
    }
    let mut cards = vec![Widget::Card(list)];
    if let Some(id) = &village.craft_recipe {
        let recipe = &catalog.production[id];
        let plan = town.crafting_plan(catalog, &village.stock, id, village.craft_workspace);
        let choices = village.craft_workspace_choices(catalog);
        let workspace = selected_workspace(village, catalog, &choices);
        let mut detail = vec![
            Widget::illustrated(
                output_item(recipe),
                vec![
                    Widget::caption(if recipe.repair.is_some() {
                        "CARE FOR SHARED TOOLS"
                    } else {
                        "MADE IN THE VILLAGE"
                    }),
                    Widget::title(&recipe.name),
                ],
            ),
            Widget::caption("MATERIALS"),
        ];
        for (material, quantity) in &recipe.input {
            let item = &catalog.materials[material];
            detail.push(Widget::Row(vec![
                Widget::body(&item.name),
                Widget::note(format!(
                    "{} needed / {} available",
                    item.quantity_text(u64::from(*quantity)),
                    item.quantity_text(u64::from(village.stock.available(material))),
                )),
            ]));
        }
        if recipe.input.is_empty() {
            detail.push(Widget::note("No materials needed."));
        }
        if let Some(tool) = &recipe.repair {
            let stock = &village.stock;
            detail.push(Widget::note(format!(
                "{} need repair",
                stock.equipment.broken(tool).min(stock.available(tool)),
            )));
        }
        detail.push(workspace_stepper(catalog, town, workspace, &choices));
        let summary = town.craft_recipe_summary(catalog, &village.stock, id);
        let mut requirements = summary.lines().skip(1);
        let estimate = requirements.next().unwrap_or_default();
        let qualified = requirements
            .next()
            .unwrap_or_default()
            .strip_prefix("Qualified residents · ")
            .unwrap_or_default();
        detail.extend([
            Widget::caption("QUALIFIED RESIDENTS"),
            Widget::body(qualified),
            Widget::note(estimate.replace(" · ", " / ")),
        ]);
        if let Some(tool) = recipe.craft.as_ref().and_then(|craft| craft.tool.as_ref()) {
            detail.push(Widget::note(format!(
                "Tool required: {}",
                catalog.materials[tool].name
            )));
        }
        detail.push(button(
            Action::Start,
            if recipe.repair.is_some() {
                "Repair this item"
            } else {
                "Make this item"
            },
            plan.is_ok(),
            false,
        ));
        if let Err(reason) = plan {
            detail.push(Widget::note(reason));
        }
        cards.push(Widget::Card(detail));
    } else if let Some(site) = village.craft_job_site
        && let Some(job) = town.production.jobs.iter().find(|job| job.site == site)
    {
        let choices = village.craft_workspace_choices(catalog);
        let destination = village.craft_move_target(catalog);
        cards.push(Widget::Card(vec![
            Widget::caption("WORK IN PROGRESS"),
            Widget::illustrated(
                output_item(&catalog.production[&job.recipe]),
                vec![
                    Widget::title(&catalog.production[&job.recipe].name),
                    Widget::body(town.craft_workspace_name(catalog, site)),
                ],
            ),
            Widget::Meter((job.work / catalog.production[&job.recipe].work) as f32),
            Widget::note(town.craft_job_worker(site)),
            Widget::note(
                town.production_site_status(catalog, &village.stock, site, village.clock)
                    .trim_start_matches([' ', '·']),
            ),
            workspace_stepper(catalog, town, destination, &choices),
            button(
                Action::Move,
                "Move unfinished job",
                destination.is_some(),
                false,
            ),
            button(Action::Find, "Find workspace", true, false),
        ]));
    }
    Widget::Column(vec![
        Widget::Row(
            [CraftView::Make, CraftView::Repair, CraftView::Jobs]
                .into_iter()
                .map(|tab| button(Action::Tab(tab), tab.label(), true, tab == view))
                .collect(),
        ),
        Widget::Row(cards),
    ])
}

fn workspace_stepper(
    catalog: &Catalog,
    town: &Construction,
    selected: Option<usize>,
    choices: &[usize],
) -> Widget<Action> {
    stepper(
        "WORKSPACE",
        Action::Workspace(false),
        selected.map_or_else(
            || "No eligible workspace".into(),
            |site| town.craft_workspace_name(catalog, site),
        ),
        Action::Workspace(true),
        choices.len() > 1,
    )
}

fn selected_workspace(village: &Village, catalog: &Catalog, choices: &[usize]) -> Option<usize> {
    village
        .craft_workspace
        .filter(|site| choices.contains(site))
        .or_else(|| village.craft_move_target(catalog))
        .or_else(|| {
            village.craft_recipe.as_ref().and_then(|recipe| {
                village
                    .construction
                    .crafting_plan(catalog, &village.stock, recipe, None)
                    .ok()
            })
        })
        .or_else(|| choices.first().copied())
}

pub(super) fn input(
    action: &Action,
    village: &mut Village,
    catalog: &Catalog,
    setup: &WorldSetup,
    camera: Option<&mut VillageCamera>,
) {
    match action {
        Action::Tab(view) => {
            village.craft_view = *view;
            village.craft_recipe = None;
            village.craft_workspace = None;
            village.craft_job_site = None;
            village.inventory_page = 0;
        }
        Action::Recipe(id) => {
            village.craft_recipe = Some(id.clone());
            village.craft_workspace = None;
        }
        Action::Job(site) => {
            village.craft_job_site = Some(*site);
            village.craft_workspace = None;
        }
        Action::Page(forward) => {
            let (pages, _) = village.producer_rows(catalog);
            village.inventory_page = cycle(village.inventory_page.min(pages - 1), pages, *forward);
        }
        Action::Workspace(forward) => {
            let choices = village.craft_workspace_choices(catalog);
            if let Some(index) = selected_workspace(village, catalog, &choices)
                .and_then(|selected| choices.iter().position(|site| *site == selected))
            {
                village.craft_workspace = Some(choices[cycle(index, choices.len(), *forward)]);
            }
        }
        Action::Start => {
            if let Some(id) = &village.craft_recipe
                && let Some(site) = village.construction.start_crafting(
                    catalog,
                    &mut village.stock,
                    id,
                    village.craft_workspace,
                )
            {
                input(&Action::Tab(CraftView::Jobs), village, catalog, setup, None);
                village.craft_job_site = Some(site);
            }
        }
        Action::Find => {
            if let (Some(site), Some(camera)) = (village.craft_job_site, camera)
                && let Some(point) = village.construction.open_inventory_producer(catalog, site)
            {
                let terrain = village.terrain(setup);
                camera.target = Vec3::new(point.x, terrain.height_at(point.x, point.y), point.y);
                village.utility_panel = None;
            }
        }
        Action::Move => {
            if let (Some(source), Some(destination)) =
                (village.craft_job_site, village.craft_move_target(catalog))
                && village.construction.move_crafting_from_site(
                    catalog,
                    &mut village.stock,
                    source,
                    destination,
                )
            {
                village.craft_job_site = Some(destination);
                village.craft_workspace = None;
            }
        }
    }
}
