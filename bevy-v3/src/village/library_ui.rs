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

pub(super) fn library_controls(
    (keys, window): (
        Res<ButtonInput<KeyCode>>,
        Single<&Window, With<PrimaryWindow>>,
    ),
    mut text: MessageReader<KeyboardInput>,
    mut menu: ResMut<SaveMenu>,
    mut setup: ResMut<WorldSetup>,
    mut village: ResMut<Village>,
    catalog: Res<Catalog>,
    (time, sound): (Res<Time<Real>>, Res<SoundSettings>),
) {
    if !window.focused || sound.open {
        text.clear();
        return;
    }
    if keys.just_pressed(KeyCode::F6) {
        menu.open = !menu.open;
        menu.entry = None;
        menu.delete_request = None;
        menu.status.clear();
        if menu.open {
            match save_library::directory(setup.mode) {
                Ok(path) => refresh_library(&mut menu, &path, setup.mode),
                Err(error) => menu.status = error.to_string(),
            }
        }
    }
    if !menu.open {
        text.clear();
        return;
    }
    let Ok(path) = save_library::directory(setup.mode) else {
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
        if keys.just_pressed(KeyCode::Escape) {
            return;
        }
        if keys.just_pressed(KeyCode::Enter) {
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

    if keys.just_pressed(KeyCode::ArrowUp) {
        menu.selected = menu.selected.saturating_sub(1);
        menu.delete_request = None;
    }
    if keys.just_pressed(KeyCode::ArrowDown) {
        menu.selected = (menu.selected + 1).min(menu.rows.len().saturating_sub(1));
        menu.delete_request = None;
    }
    if keys.just_pressed(KeyCode::KeyN) && !setup.open && village.mode().is_some() {
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
    if keys.just_pressed(KeyCode::KeyR) {
        menu.entry = Some(NameEntry {
            text: row.name.clone(),
            rename: Some(slot),
        });
    } else if keys.just_pressed(KeyCode::Enter) || keys.just_pressed(KeyCode::KeyP) {
        let restored = if keys.just_pressed(KeyCode::Enter) {
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
    } else if keys.just_pressed(KeyCode::KeyE) {
        menu.status = match save_library::export(&path, slot, setup.mode, &catalog) {
            Ok(file) => format!("Exported to {}", file.display()),
            Err(error) => format!("Could not export village: {error}"),
        };
    } else if keys.just_pressed(KeyCode::Delete) {
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
    let result = save_library::directory(mode)
        .and_then(|path| save_library::autosave(&path, id, mode, &village, &catalog));
    if let Err(error) = result {
        village.save_notice = format!("Named autosave stopped: {error}");
        menu.attached = None;
    }
}
