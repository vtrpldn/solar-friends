use std::{
    fs, io,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use bevy::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{catalog::Catalog, save, setup::Mode, village::Village};

const SLOT_BYTES: u64 = save::MAX_BYTES * 2 + 16 * 1024;

#[derive(Resource, Default)]
pub struct SaveMenu {
    pub open: bool,
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
    pub fn directory(&self, mode: Mode) -> io::Result<PathBuf> {
        #[cfg(test)]
        if let Some(path) = &self.test_directory {
            return Ok(path.clone());
        }
        directory(mode)
    }

    pub fn label(&self) -> String {
        let mut lines = vec!["Saved villages".to_owned()];
        if let Some(entry) = &self.entry {
            lines.push(format!("Village name: {}_", entry.text));
            lines.push("Enter Confirm · Escape Cancel".into());
        } else if self.rows.is_empty() {
            lines.push("N Name the current village · F6 Close".into());
        } else {
            let start = self.selected / 8 * 8;
            for (index, row) in self.rows.iter().enumerate().skip(start).take(8) {
                lines.push(format!(
                    "{}{}{}",
                    if index == self.selected { "› " } else { "  " },
                    row.name,
                    if row.recovery {
                        " · recovery copy"
                    } else {
                        ""
                    },
                ));
            }
            lines.push("↑ / ↓ Select · Enter Load · N New · R Rename".into());
            lines.push("E Export · P Recover · Delete Remove · F6 Close".into());
        }
        if self.delete_request.is_some() {
            lines.push("Press Delete again to remove this save.".into());
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
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error),
    };
    let mut rows = Vec::new();
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
        let slot = match read_slot(directory, id, mode) {
            Ok(slot) => slot,
            Err(_) => {
                rows.push((
                    0,
                    SlotInfo {
                        id,
                        name: format!("Unreadable village {id}"),
                        recovery: false,
                    },
                ));
                continue;
            }
        };
        rows.push((
            slot.updated,
            SlotInfo {
                id,
                name: slot.name,
                recovery: slot.previous.is_some(),
            },
        ));
    }
    rows.sort_by_key(|(time, _)| std::cmp::Reverse(*time));
    Ok(rows.into_iter().map(|(_, row)| row).collect())
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

pub fn recover(directory: &Path, id: u64, mode: Mode, catalog: &Catalog) -> io::Result<Village> {
    let mut slot = read_slot(directory, id, mode)?;
    let previous = slot
        .previous
        .take()
        .ok_or_else(|| io::Error::other("no recovery copy"))?;
    let restored = decode(&previous, mode, catalog)?;
    slot.previous = Some(std::mem::replace(&mut slot.current, previous));
    slot.updated = timestamp();
    write_slot(directory, &slot)?;
    Ok(restored)
}

pub fn remove(directory: &Path, id: u64) -> io::Result<()> {
    fs::remove_file(path(directory, id))
}

pub fn export(directory: &Path, id: u64, mode: Mode, catalog: &Catalog) -> io::Result<PathBuf> {
    let village = load(directory, id, mode, catalog)?;
    let export = directory
        .join("exports")
        .join(format!("village-{id}-{}.json", timestamp()));
    save::write(&export, &village)?;
    Ok(export)
}

fn path(directory: &Path, id: u64) -> PathBuf {
    directory.join(format!("slot-{id}.json"))
}

fn read_slot(directory: &Path, id: u64, mode: Mode) -> io::Result<Slot> {
    let slot: Slot = serde_json::from_slice(&save::read_bytes(&path(directory, id), SLOT_BYTES)?)?;
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

fn timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u64
}
