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

pub(super) fn setup(mut commands: Commands, assets: Res<AssetServer>) {
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
            BackgroundColor(Color::srgb_u8(31, 45, 35)),
        ))
        .with_children(|panel| {
            panel.spawn((Heading, Text::default(), ui_font(&assets, 16.)));
            for offset in 0..PAGE_SIZE {
                button(panel, &assets, Action::Asset(offset), "");
            }
            panel
                .spawn(Node {
                    column_gap: px(5),
                    ..default()
                })
                .with_children(|row| {
                    button(row, &assets, Action::Previous, "Previous page");
                    button(row, &assets, Action::Next, "Next page");
                    button(row, &assets, Action::Close, "Close");
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
            BackgroundColor(Color::srgb_u8(62, 83, 65)),
        ))
        .with_child((Text::new(label), ui_font(assets, 15.)));
}

pub(super) fn display(
    workshop: Res<Workshop>,
    catalog: Res<WorkshopCatalog>,
    mut panel: Single<&mut Node, (With<Picker>, Without<Action>)>,
    mut heading: Single<&mut Text, With<Heading>>,
    mut buttons: Query<(&Action, &Children, &mut Node, &mut BackgroundColor)>,
    mut labels: Query<&mut Text, Without<Heading>>,
) {
    let Some(search) = &workshop.search else {
        panel.display = Display::None;
        return;
    };
    panel.display = Display::Flex;
    if !workshop.is_changed() {
        return;
    }
    let matches = search.matching(&workshop.assets, &catalog);
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
    heading.set_if_neq(Text::new(format!("Find asset · {query}\n{results}")));
    for (action, children, mut node, mut background) in &mut buttons {
        let visible = match *action {
            Action::Asset(offset) => {
                let row = start + offset;
                if let Some(&index) = matches.get(row) {
                    let model = &catalog.0[&workshop.assets[index]];
                    if let Ok(mut label) = labels.get_mut(children[0]) {
                        label.set_if_neq(Text::new(format!("{} · {}", model.name, model.category)));
                    }
                    background.0 = if row == search.row {
                        Color::srgb_u8(103, 123, 85)
                    } else {
                        Color::srgb_u8(62, 83, 65)
                    };
                    true
                } else {
                    false
                }
            }
            Action::Previous => page > 1,
            Action::Next => page < pages,
            Action::Close => true,
        };
        node.display = if visible {
            Display::Flex
        } else {
            Display::None
        };
    }
}
