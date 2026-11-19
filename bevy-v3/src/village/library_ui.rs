use bevy::input::{ButtonState, keyboard::KeyboardInput};

use crate::save_library::NameEntry;

use super::*;

fn refresh_library(menu: &mut SaveMenu, directory: &std::path::Path, mode: Mode) {
    match save_library::list(directory, mode) {
        Ok(rows) => {
            menu.rows = rows;
            menu.selected = menu.selected.min(menu.rows.len().saturating_sub(1));
        }
        Err(error) => menu.status = format!("Could not read saved villages: {error}"),
    }
}

pub(super) fn toggle_library(menu: &mut SaveMenu, mode: Mode) {
    menu.open = !menu.open;
    menu.entry = None;
    menu.delete_request = None;
    menu.status.clear();
    if menu.open {
        match menu.directory(mode) {
            Ok(path) => refresh_library(menu, &path, mode),
            Err(error) => menu.status = error.to_string(),
        }
    }
}

const ROWS: usize = 8;

#[derive(Component, Clone, Copy)]
pub(super) enum LibraryAction {
    Row(usize),
    Previous,
    Next,
    New,
    Rename,
    Load,
    Recover,
    Export,
    Remove,
    Confirm,
    Cancel,
}

#[derive(Component)]
struct LibraryPanel;

pub(super) fn install(app: &mut App) {
    app.add_systems(Startup, spawn_library)
        .add_systems(Update, show_library.after(village_input));
}

fn spawn_library(mut commands: Commands, assets: Res<AssetServer>) {
    commands
        .spawn((
            LibraryPanel,
            Node {
                display: Display::None,
                position_type: PositionType::Absolute,
                left: px(20),
                top: px(20),
                width: px(320),
                padding: UiRect::all(px(12)),
                flex_wrap: FlexWrap::Wrap,
                row_gap: px(4),
                column_gap: px(4),
                ..default()
            },
            BackgroundColor(Color::srgb_u8(31, 45, 35)),
        ))
        .with_children(|panel| {
            for action in (0..ROWS).map(LibraryAction::Row).chain([
                LibraryAction::Previous,
                LibraryAction::Next,
                LibraryAction::New,
                LibraryAction::Rename,
                LibraryAction::Load,
                LibraryAction::Recover,
                LibraryAction::Export,
                LibraryAction::Remove,
                LibraryAction::Confirm,
                LibraryAction::Cancel,
            ]) {
                panel
                    .spawn((
                        action,
                        Button,
                        Node {
                            width: if matches!(action, LibraryAction::Row(_)) {
                                percent(100)
                            } else {
                                Val::Auto
                            },
                            padding: UiRect::axes(px(10), px(6)),
                            ..default()
                        },
                        BackgroundColor(Color::srgb_u8(58, 78, 61)),
                    ))
                    .with_child((Text::default(), ui_font(&assets, 16.0)));
            }
        });
}

fn library_label(action: LibraryAction, menu: &SaveMenu, may_create: bool) -> Option<String> {
    use LibraryAction::*;
    if menu.entry.is_some() {
        return match action {
            Confirm => Some("Confirm name".into()),
            Cancel => Some("Cancel name".into()),
            _ => None,
        };
    }
    Some(match action {
        Row(row) => {
            let index = menu.selected / ROWS * ROWS + row;
            let slot = menu.rows.get(index)?;
            let selected = if index == menu.selected { "› " } else { "" };
            format!("{selected}{}", slot.name)
        }
        Previous if menu.selected > 0 => "Previous".into(),
        Next if menu.selected + 1 < menu.rows.len() => "Next".into(),
        New if may_create => "Name current village".into(),
        Rename if !menu.rows.is_empty() => "Rename".into(),
        Load if !menu.rows.is_empty() => "Load village".into(),
        Recover
            if menu
                .rows
                .get(menu.selected)
                .is_some_and(|slot| slot.recovery) =>
        {
            "Recover previous save".into()
        }
        Export if !menu.rows.is_empty() => "Export".into(),
        Remove if menu.delete_request.is_some() => "Confirm removal".into(),
        Remove if !menu.rows.is_empty() => "Remove save".into(),
        _ => return None,
    })
}

fn show_library(
    menu: Res<SaveMenu>,
    setup: Res<WorldSetup>,
    village: Res<Village>,
    mut panel: Single<&mut Node, (With<LibraryPanel>, Without<LibraryAction>)>,
    mut buttons: Query<(
        &LibraryAction,
        &Children,
        &Interaction,
        &mut Node,
        &mut BackgroundColor,
    )>,
    mut labels: Query<&mut Text>,
) {
    panel.display = if menu.open {
        Display::Flex
    } else {
        Display::None
    };
    if !menu.open {
        return;
    }
    for (&action, children, interaction, mut node, mut background) in &mut buttons {
        let label = library_label(action, &menu, !setup.open && village.mode().is_some());
        node.display = if label.is_some() {
            Display::Flex
        } else {
            Display::None
        };
        if let Some(label) = label
            && let Ok(mut text) = labels.get_mut(children[0])
            && text.0 != label
        {
            text.0 = label;
        }
        background.0 = if *interaction == Interaction::None {
            Color::srgb_u8(58, 78, 61)
        } else {
            Color::srgb_u8(78, 105, 82)
        };
    }
}

pub(super) fn library_controls(
    (keys, window): (
        Res<ButtonInput<KeyCode>>,
        Single<&Window, With<PrimaryWindow>>,
    ),
    mut text: MessageReader<KeyboardInput>,
    mut menu: ResMut<SaveMenu>,
    mut setup: ResMut<WorldSetup>,
    mut village: ResMut<Village>,
    (catalog, time, sound): (Res<Catalog>, Res<Time<Real>>, Res<SoundSettings>),
    buttons: Query<(&LibraryAction, &Interaction), Changed<Interaction>>,
) {
    if !window.focused || sound.open {
        text.clear();
        return;
    }
    if keys.just_pressed(KeyCode::F6) {
        toggle_library(&mut menu, setup.mode);
    }
    if !menu.open {
        text.clear();
        return;
    }
    use LibraryAction::*;
    let keys_to_actions = [
        (KeyCode::Escape, Cancel),
        (KeyCode::ArrowUp, Previous),
        (KeyCode::ArrowDown, Next),
        (KeyCode::KeyN, New),
        (KeyCode::KeyR, Rename),
        (
            KeyCode::Enter,
            if menu.entry.is_some() { Confirm } else { Load },
        ),
        (KeyCode::KeyP, Recover),
        (KeyCode::KeyE, Export),
        (KeyCode::Delete, Remove),
    ];
    let action = buttons
        .iter()
        .find_map(|(&action, interaction)| {
            (*interaction == Interaction::Pressed
                && library_label(action, &menu, !setup.open && village.mode().is_some()).is_some())
            .then_some(action)
        })
        .or_else(|| {
            keys_to_actions
                .into_iter()
                .find_map(|(key, action)| keys.just_pressed(key).then_some(action))
        });
    let Ok(path) = menu.directory(setup.mode) else {
        return;
    };
    if let Some(mut entry) = menu.entry.take() {
        for event in text.read() {
            if event.state != ButtonState::Pressed {
                continue;
            }
            match event.key_code {
                KeyCode::Backspace => {
                    entry.text.pop();
                }
                KeyCode::Escape | KeyCode::Enter | KeyCode::F6 => {}
                _ => {
                    if let Some(chars) = &event.text {
                        let room = 60usize.saturating_sub(entry.text.chars().count());
                        entry
                            .text
                            .extend(chars.chars().filter(|c| !c.is_control()).take(room));
                    }
                }
            }
        }
        if matches!(action, Some(Cancel)) {
            return;
        }
        if matches!(action, Some(Confirm)) {
            let result = if let Some(slot) = entry.rename {
                save_library::rename(&path, slot, setup.mode, &entry.text).map(|()| slot)
            } else if village.mode() != Some(setup.mode) || setup.open {
                Err(std::io::Error::other(
                    "enter a village before creating a named save",
                ))
            } else {
                save_library::create(&path, setup.mode, &entry.text, &village)
            };
            match result {
                Ok(id) => {
                    if entry.rename.is_none() {
                        menu.attached = Some((setup.mode, id, village.session_serial));
                        menu.next_autosave = time.elapsed_secs_f64() + 3.0;
                    }
                    menu.status = "Village saved.".into();
                    refresh_library(&mut menu, &path, setup.mode);
                    menu.selected = menu.rows.iter().position(|row| row.id == id).unwrap_or(0);
                }
                Err(error) => {
                    menu.status = format!("Could not save village: {error}");
                    menu.entry = Some(entry);
                }
            }
        } else {
            menu.entry = Some(entry);
        }
        return;
    }
    text.clear();

    if let Some(Row(row)) = action {
        let index = menu.selected / ROWS * ROWS + row;
        if index < menu.rows.len() {
            menu.selected = index;
            menu.delete_request = None;
        }
    }
    if matches!(action, Some(Previous)) {
        menu.selected = menu.selected.saturating_sub(1);
        menu.delete_request = None;
    }
    if matches!(action, Some(Next)) {
        menu.selected = (menu.selected + 1).min(menu.rows.len().saturating_sub(1));
        menu.delete_request = None;
    }
    if matches!(action, Some(New)) && !setup.open && village.mode().is_some() {
        menu.entry = Some(NameEntry {
            text: String::new(),
            rename: None,
        });
        return;
    }
    let Some(row) = menu.rows.get(menu.selected) else {
        return;
    };
    let slot = row.id;
    if matches!(action, Some(Rename)) {
        menu.entry = Some(NameEntry {
            text: row.name.clone(),
            rename: Some(slot),
        });
    } else if matches!(action, Some(Load | Recover)) {
        let restored = if matches!(action, Some(Load)) {
            save_library::load(&path, slot, setup.mode, &catalog)
        } else {
            save_library::recover(&path, slot, setup.mode, &catalog)
        };
        match restored {
            Ok(mut loaded) => {
                *setup = loaded.setup.as_ref().expect("validated setup").session();
                loaded.rebuild_scene = true;
                loaded.session_serial = village.session_serial.wrapping_add(1);
                loaded.save_notice = "Named village loaded.".into();
                menu.attached = Some((setup.mode, slot, loaded.session_serial));
                menu.next_autosave = time.elapsed_secs_f64() + 3.0;
                menu.open = false;
                *village = loaded;
            }
            Err(error) => menu.status = format!("Could not open saved village: {error}"),
        }
    } else if matches!(action, Some(Export)) {
        menu.status = match save_library::export(&path, slot, setup.mode, &catalog) {
            Ok(file) => format!("Exported to {}", file.display()),
            Err(error) => format!("Could not export village: {error}"),
        };
    } else if matches!(action, Some(Remove)) {
        if menu.delete_request == Some(slot) {
            menu.delete_request = None;
            match save_library::remove(&path, slot) {
                Ok(()) => {
                    if menu.attached.is_some_and(|(_, id, _)| id == slot) {
                        menu.attached = None;
                    }
                    menu.status = "Saved village removed.".into();
                    refresh_library(&mut menu, &path, setup.mode);
                }
                Err(error) => menu.status = format!("Could not remove saved village: {error}"),
            }
        } else {
            menu.delete_request = Some(slot);
        }
    }
}

pub(super) fn autosave_named(
    time: Res<Time<Real>>,
    mut menu: ResMut<SaveMenu>,
    setup: Res<WorldSetup>,
    mut village: ResMut<Village>,
    catalog: Res<Catalog>,
) {
    if setup.open || menu.open || time.elapsed_secs_f64() < menu.next_autosave {
        return;
    }
    let Some((mode, id, serial)) = menu.attached else {
        return;
    };
    if village.session_serial != serial || village.mode() != Some(mode) {
        menu.attached = None;
        return;
    }
    menu.next_autosave = time.elapsed_secs_f64() + 3.0;
    let result = menu
        .directory(mode)
        .and_then(|path| save_library::autosave(&path, id, mode, &village, &catalog));
    if let Err(error) = result {
        village.save_notice = format!("Named autosave stopped: {error}");
        menu.attached = None;
    }
}
