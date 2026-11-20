use super::{AssetSearch, Workshop, WorkshopCatalog, ui_font};
use bevy::prelude::*;

pub(super) const PAGE_SIZE: usize = 9;

impl AssetSearch {
    pub(super) fn page_start(&self) -> usize {
        self.row / PAGE_SIZE * PAGE_SIZE
    }
}

#[derive(Component, Clone, Copy, PartialEq, Eq)]
pub(super) enum Action {
    Asset(usize),
    Previous,
    Next,
    Close,
    CategoryMenu,
    Category(usize),
}

#[derive(bevy::ecs::system::SystemParam)]
pub(super) struct PickerInput<'w, 's> {
    buttons: Query<'w, 's, (&'static Interaction, &'static Action), Changed<Interaction>>,
}

impl PickerInput<'_, '_> {
    pub(super) fn clicked(&self, action: Action) -> bool {
        self.buttons
            .iter()
            .any(|(&interaction, &button)| interaction == Interaction::Pressed && button == action)
    }

    pub(super) fn category(&self) -> Option<usize> {
        self.buttons.iter().find_map(|(&interaction, &button)| {
            if interaction == Interaction::Pressed
                && let Action::Category(index) = button
            {
                Some(index)
            } else {
                None
            }
        })
    }

    pub(super) fn selected(&self) -> Option<usize> {
        self.buttons.iter().find_map(|(&interaction, &button)| {
            if interaction == Interaction::Pressed
                && let Action::Asset(offset) = button
            {
                Some(offset)
            } else {
                None
            }
        })
    }
}

#[derive(Component)]
pub(super) struct Picker;

#[derive(Component)]
pub(super) struct Heading;

#[derive(Resource)]
pub(super) struct Categories(pub Vec<String>);

pub(super) fn setup(commands: Commands, assets: Res<AssetServer>) {
    spawn_picker(commands, &assets, &[]);
}

pub(super) fn setup_garden(
    mut commands: Commands,
    assets: Res<AssetServer>,
    catalog: Res<WorkshopCatalog>,
) {
    let unique: std::collections::BTreeSet<_> = catalog
        .0
        .values()
        .map(|asset| asset.category.clone())
        .collect();
    let categories: Vec<_> = std::iter::once("All categories".to_owned())
        .chain(unique)
        .collect();
    spawn_picker(commands.reborrow(), &assets, &categories);
    commands.insert_resource(Categories(categories));
}

fn spawn_picker(mut commands: Commands, assets: &AssetServer, categories: &[String]) {
    commands
        .spawn((
            Picker,
            Node {
                position_type: PositionType::Absolute,
                top: px(48),
                left: px(16),
                width: px(440),
                max_width: percent(94),
                display: Display::None,
                flex_direction: FlexDirection::Column,
                row_gap: px(4),
                padding: UiRect::all(px(12)),
                ..default()
            },
            GlobalZIndex(1),
            BackgroundColor(crate::theme::PAPER),
        ))
        .with_children(|panel| {
            panel.spawn((Heading, Text::default(), ui_font(assets, 16.)));
            if !categories.is_empty() {
                button(panel, assets, Action::CategoryMenu, "All categories");
                panel
                    .spawn(Node {
                        flex_wrap: FlexWrap::Wrap,
                        column_gap: px(5),
                        row_gap: px(4),
                        ..default()
                    })
                    .with_children(|row| {
                        for (index, label) in categories.iter().enumerate() {
                            button(row, assets, Action::Category(index), label);
                        }
                    });
            }
            for offset in 0..PAGE_SIZE {
                button(panel, assets, Action::Asset(offset), "");
            }
            panel
                .spawn(Node {
                    column_gap: px(5),
                    ..default()
                })
                .with_children(|row| {
                    button(row, assets, Action::Previous, "Previous page");
                    button(row, assets, Action::Next, "Next page");
                    button(row, assets, Action::Close, "Close");
                });
        });
}

fn button(parent: &mut ChildSpawnerCommands, assets: &AssetServer, action: Action, label: &str) {
    parent
        .spawn((
            Button,
            action,
            Node {
                padding: UiRect::axes(px(8), px(4)),
                ..default()
            },
            BackgroundColor(crate::theme::BUTTON),
        ))
        .with_child((Text::new(label), ui_font(assets, 15.)));
}

type PickerButton = (
    &'static Action,
    &'static Children,
    &'static mut Node,
    &'static mut BackgroundColor,
);

#[derive(bevy::ecs::system::SystemParam)]
pub(super) struct PickerView<'w, 's> {
    panel: Single<'w, 's, &'static mut Node, (With<Picker>, Without<Action>)>,
    heading: Single<'w, 's, &'static mut Text, With<Heading>>,
    buttons: Query<'w, 's, PickerButton>,
    labels: Query<'w, 's, &'static mut Text, Without<Heading>>,
}

pub(super) fn display(
    workshop: Res<Workshop>,
    catalog: Res<WorkshopCatalog>,
    mut view: PickerView,
) {
    if workshop.is_changed() {
        view.update(workshop.search.as_ref(), &workshop.assets, &catalog);
    }
}

impl PickerView<'_, '_> {
    pub(super) fn update(
        &mut self,
        search: Option<&AssetSearch>,
        assets: &[String],
        catalog: &WorkshopCatalog,
    ) {
        let Some(search) = search else {
            self.panel.display = Display::None;
            return;
        };
        self.panel.display = Display::Flex;
        let matches = search.matching(assets, catalog);
        let start = search.page_start();
        let page = start / PAGE_SIZE + 1;
        let pages = matches.len().div_ceil(PAGE_SIZE);
        let results = if matches.is_empty() {
            "No matching assets".into()
        } else {
            format!("{} assets · Page {page}/{pages}", matches.len())
        };
        let query = if search.query.is_empty() {
            "Type to filter"
        } else {
            &search.query
        };
        self.heading
            .set_if_neq(Text::new(format!("Find asset · {query}\n{results}")));
        for (action, children, mut node, mut background) in &mut self.buttons {
            let visible = match *action {
                Action::Asset(offset) if !search.choosing_category => {
                    let row = start + offset;
                    if let Some(&index) = matches.get(row) {
                        let model = &catalog.0[&assets[index]];
                        if let Ok(mut label) = self.labels.get_mut(children[0]) {
                            label.set_if_neq(Text::new(format!(
                                "{} · {}",
                                model.name, model.category
                            )));
                        }
                        background.0 = if row == search.row {
                            crate::theme::ACTIVE
                        } else {
                            crate::theme::BUTTON
                        };
                        true
                    } else {
                        false
                    }
                }
                Action::Asset(_) => false,
                Action::CategoryMenu => {
                    if let Ok(mut label) = self.labels.get_mut(children[0]) {
                        label.set_if_neq(Text::new(
                            search.category.as_deref().unwrap_or("All categories"),
                        ));
                    }
                    true
                }
                Action::Category(_) => search.choosing_category,
                Action::Previous => !search.choosing_category && page > 1,
                Action::Next => !search.choosing_category && page < pages,
                Action::Close => true,
            };
            node.display = if visible {
                Display::Flex
            } else {
                Display::None
            };
        }
    }
}
