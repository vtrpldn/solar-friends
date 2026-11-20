#[cfg(not(target_arch = "wasm32"))]
use std::fs;
use std::{
    io,
    path::{Path, PathBuf},
};

use bevy::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{catalog::Catalog, save, setup::Mode, village::Village};

const SLOT_BYTES: u64 = save::MAX_BYTES * 2 + 16 * 1024;

#[derive(Resource, Default)]
pub struct SaveMenu {
    pub preview: bool,
    pub open: bool,
    pub browse_mode: Mode,
    pub selected: usize,
    pub rows: Vec<SlotInfo>,
    pub entry: Option<NameEntry>,
    pub status: String,
    pub delete_request: Option<u64>,
    pub attached: Option<(Mode, u64, u64)>,
    pub next_autosave: f64,
    #[cfg(test)]
    pub test_directory: Option<PathBuf>,
}

pub struct NameEntry {
    pub text: String,
    pub rename: Option<u64>,
}

pub struct SlotInfo {
    pub id: u64,
    pub name: String,
    pub recovery: bool,
    updated: Option<u64>,
}

#[derive(Deserialize, Serialize)]
struct Slot {
    version: u32,
    id: u64,
    name: String,
    mode: Mode,
    updated: u64,
    current: Value,
    previous: Option<Value>,
}

impl SaveMenu {
    fn require_saved_villages(&self) -> io::Result<()> {
        if self.preview {
            return Err(io::Error::other(
                "Saved villages are unavailable in developer previews",
            ));
        }
        Ok(())
    }

    pub fn continue_path(&self, mode: Mode) -> io::Result<PathBuf> {
        self.require_saved_villages()?;
        #[cfg(test)]
        if self.test_directory.is_some() {
            return Ok(self.directory(mode)?.join("continue.json"));
        }
        save::autosave_location(mode)
    }

    pub fn directory(&self, mode: Mode) -> io::Result<PathBuf> {
        self.require_saved_villages()?;
        #[cfg(test)]
        if let Some(path) = &self.test_directory {
            return Ok(match mode {
                Mode::Story => path.clone(),
                Mode::Sandbox => path.join("sandbox"),
            });
        }
        directory(mode)
    }

    pub fn import_snapshot(&self, path: &Path, catalog: &Catalog) -> io::Result<(Mode, u64)> {
        let (village, exported_name) = save::read_export(path, catalog)?;
        let mode = village
            .mode()
            .ok_or_else(|| io::Error::other("save has no game mode"))?;
        let filename = path.file_stem().and_then(|stem| stem.to_str());
        let name = exported_name
            .as_deref()
            .and_then(|name| clean_name(name).ok())
            .or_else(|| filename.and_then(|name| clean_name(name).ok()))
            .unwrap_or_else(|| "Imported village".into());
        let id = create(&self.directory(mode)?, mode, &name, &village)?;
        Ok((mode, id))
    }

    pub fn label(&self) -> String {
        let mode = match self.browse_mode {
            Mode::Story => "Story",
            Mode::Sandbox => "Sandbox",
        };
        let mut lines = vec![format!("Saved villages · {mode}")];
        if let Some(entry) = &self.entry {
            lines.push(format!("Village name: {}_", entry.text));
            lines.push("Enter Confirm · Escape Cancel".into());
        } else if self.rows.is_empty() {
            lines.push("No named villages in this mode.".into());
            lines.push("Tab Switch mode · F6 Close".into());
        } else {
            let start = self.selected / 8 * 8;
            let now = timestamp();
            for (index, row) in self.rows.iter().enumerate().skip(start).take(8) {
                let selected = if index == self.selected { "› " } else { "  " };
                let mut label = format!("{selected}{}", row.name);
                if let Some(updated) = row.updated {
                    use std::fmt::Write;
                    let _ = write!(label, " · Saved {}", saved_age(now, updated));
                }
                if row.recovery {
                    label.push_str(" · recovery copy");
                }
                lines.push(label);
            }
            lines.push("↑ / ↓ Select · Enter Load · N New · R Rename".into());
            if cfg!(target_arch = "wasm32") {
                lines.push("P Recover · Delete Remove".into());
            } else {
                lines.push("E Export · P Recover · Delete Remove".into());
            }
            lines.push("Tab Switch mode · F6 Close".into());
        }
        if self.entry.is_none() && !cfg!(target_arch = "wasm32") {
            lines.push("Drop a V3 save file here to import a copy.".into());
        }
        if let Some(slot) = self.delete_request
            && let Some(row) = self.rows.iter().find(|row| row.id == slot)
        {
            lines.push(format!("Press Delete again to remove “{}”.", row.name));
        }
        if !self.status.is_empty() {
            lines.push(self.status.clone());
        }
        lines.join("\n")
    }
}

pub fn directory(mode: Mode) -> io::Result<PathBuf> {
    let file = save::location(mode)?;
    let base = file
        .parent()
        .ok_or_else(|| io::Error::other("save folder has no parent"))?;
    let mode = match mode {
        Mode::Story => "story",
        Mode::Sandbox => "sandbox",
    };
    Ok(base.join("villages").join(mode))
}

pub fn list(directory: &Path, mode: Mode) -> io::Result<Vec<SlotInfo>> {
    #[cfg(target_arch = "wasm32")]
    let ids = save::list_slot_ids(directory)?;
    #[cfg(not(target_arch = "wasm32"))]
    let ids = {
        let entries = match fs::read_dir(directory) {
            Ok(entries) => entries,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => return Err(error),
        };
        let mut ids = Vec::new();
        for entry in entries {
            let path = entry?.path();
            let Some(id) = path
                .file_stem()
                .and_then(|stem| stem.to_str())
                .and_then(|stem| stem.strip_prefix("slot-"))
                .and_then(|digits| digits.parse::<u64>().ok())
            else {
                continue;
            };
            if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
                continue;
            }
            ids.push(id);
        }
        ids
    };
    let mut rows = Vec::with_capacity(ids.len());
    for id in ids {
        rows.push(match read_slot(directory, id, mode) {
            Ok(slot) => SlotInfo {
                id,
                name: slot.name,
                recovery: slot.previous.is_some(),
                updated: Some(slot.updated),
            },
            Err(_) => SlotInfo {
                id,
                name: format!("Unreadable village {id}"),
                recovery: false,
                updated: None,
            },
        });
    }
    rows.sort_by_key(|row| std::cmp::Reverse((row.updated, row.id)));
    Ok(rows)
}

pub fn create(directory: &Path, mode: Mode, name: &str, village: &Village) -> io::Result<u64> {
    let id = timestamp();
    let slot = Slot {
        version: save::VERSION,
        id,
        name: clean_name(name)?,
        mode,
        updated: id,
        current: serde_json::to_value(village)?,
        previous: None,
    };
    write_slot(directory, &slot)?;
    Ok(id)
}

pub fn autosave(
    directory: &Path,
    id: u64,
    mode: Mode,
    village: &Village,
    catalog: &Catalog,
) -> io::Result<()> {
    let mut slot = read_slot(directory, id, mode)?;
    // Keep the current file intact when its payload cannot be restored.
    decode(&slot.current, mode, catalog)?;
    let snapshot = serde_json::to_value(village)?;
    if snapshot != slot.current {
        slot.previous = Some(std::mem::replace(&mut slot.current, snapshot));
        slot.updated = timestamp();
        write_slot(directory, &slot)?;
    }
    Ok(())
}

pub fn rename(directory: &Path, id: u64, mode: Mode, name: &str) -> io::Result<()> {
    let mut slot = read_slot(directory, id, mode)?;
    slot.name = clean_name(name)?;
    write_slot(directory, &slot)
}

pub fn load(directory: &Path, id: u64, mode: Mode, catalog: &Catalog) -> io::Result<Village> {
    let slot = read_slot(directory, id, mode)?;
    decode(&slot.current, mode, catalog)
}

pub fn recover(
    directory: &Path,
    id: u64,
    mode: Mode,
    catalog: &Catalog,
    live: Option<&Village>,
) -> io::Result<Village> {
    let mut slot = read_slot(directory, id, mode)?;
    let previous = slot
        .previous
        .take()
        .ok_or_else(|| io::Error::other("no recovery copy"))?;
    let restored = decode(&previous, mode, catalog)?;
    let current = std::mem::replace(&mut slot.current, previous);
    slot.previous = Some(match live {
        Some(village) => serde_json::to_value(village)?,
        None => current,
    });
    slot.updated = timestamp();
    write_slot(directory, &slot)?;
    Ok(restored)
}

pub fn remove(directory: &Path, id: u64) -> io::Result<()> {
    save::remove_file(&path(directory, id))
}

pub fn export(
    directory: &Path,
    id: u64,
    mode: Mode,
    choose_destination: impl FnOnce(&str) -> Option<PathBuf>,
) -> io::Result<Option<PathBuf>> {
    let source = path(directory, id);
    let bytes = save::read_bytes(&source, SLOT_BYTES)?;
    let timestamp = timestamp();
    let slot = decode_slot(&bytes, id, mode).ok();
    let file_name = if slot.is_some() {
        format!("village-{id}-{timestamp}.json")
    } else {
        format!("slot-{id}-{timestamp}.backup.json")
    };
    let Some(export) = choose_destination(&file_name) else {
        return Ok(None);
    };
    #[cfg(not(target_arch = "wasm32"))]
    if let Ok(existing) = fs::canonicalize(&export)
        && existing == fs::canonicalize(&source)?
    {
        return Err(io::Error::other(
            "Choose a destination outside the original save.",
        ));
    }
    if let Some(slot) = slot {
        save::write_export(&export, &slot.current, &slot.name)?;
    } else {
        save::atomic_write(&export, &bytes, SLOT_BYTES)?;
    }
    Ok(Some(export))
}

fn path(directory: &Path, id: u64) -> PathBuf {
    directory.join(format!("slot-{id}.json"))
}

fn read_slot(directory: &Path, id: u64, mode: Mode) -> io::Result<Slot> {
    let bytes = save::read_bytes(&path(directory, id), SLOT_BYTES)?;
    decode_slot(&bytes, id, mode)
}

fn decode_slot(bytes: &[u8], id: u64, mode: Mode) -> io::Result<Slot> {
    let slot: Slot = serde_json::from_slice(bytes)?;
    if slot.id != id || slot.version != save::VERSION || slot.mode != mode {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "unsupported saved village",
        ));
    }
    Ok(slot)
}

fn write_slot(directory: &Path, slot: &Slot) -> io::Result<()> {
    save::atomic_write(
        &path(directory, slot.id),
        &serde_json::to_vec(slot)?,
        SLOT_BYTES,
    )
}

fn decode(payload: &Value, mode: Mode, catalog: &Catalog) -> io::Result<Village> {
    let village: Village = serde_json::from_value(payload.clone())?;
    if village.mode() != Some(mode) || !village.valid_save(catalog) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "saved village could not be restored",
        ));
    }
    Ok(village)
}

fn clean_name(name: &str) -> io::Result<String> {
    let cleaned: String = name
        .trim()
        .chars()
        .filter(|c| !c.is_control())
        .take(60)
        .collect();
    if cleaned.is_empty() {
        return Err(io::Error::other("give your village a name"));
    }
    Ok(cleaned)
}

fn saved_age(now: u64, updated: u64) -> String {
    let seconds = now.saturating_sub(updated) / 1_000_000_000;
    let (count, unit) = match seconds {
        0 => return "just now".into(),
        1..=59 => (seconds, "second"),
        60..=3_599 => (seconds / 60, "minute"),
        3_600..=86_399 => (seconds / 3_600, "hour"),
        _ => (seconds / 86_400, "day"),
    };
    let plural = if count == 1 { "" } else { "s" };
    format!("{count} {unit}{plural} ago")
}

fn timestamp() -> u64 {
    crate::wall_clock::since_epoch().as_nanos() as u64
}
