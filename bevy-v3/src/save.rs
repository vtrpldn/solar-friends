use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};

use crate::{catalog::Catalog, setup::Mode, village::Village};

pub(crate) const VERSION: u32 = 1;
pub(crate) const MAX_BYTES: u64 = 16 * 1024 * 1024;

#[derive(Serialize, Deserialize)]
struct SaveFile<T> {
    version: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    named_slot: Option<u64>,
    village: T,
}

pub fn location(mode: Mode) -> io::Result<PathBuf> {
    let directory = if cfg!(target_os = "windows") {
        std::env::var_os("APPDATA").map(PathBuf::from)
    } else if cfg!(target_os = "macos") {
        std::env::home_dir().map(|path| path.join("Library/Application Support"))
    } else {
        std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .filter(|path| path.is_absolute())
            .or_else(|| std::env::home_dir().map(|path| path.join(".local/share")))
    };
    directory
        .map(|path| {
            let file = match mode {
                Mode::Story => "village.json",
                Mode::Sandbox => "sandbox.json",
            };
            path.join("Solar Friends V3").join(file)
        })
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "no local game data folder"))
}

pub fn autosave_location(mode: Mode) -> io::Result<PathBuf> {
    let name = match mode {
        Mode::Story => "story-autosave.json",
        Mode::Sandbox => "sandbox-autosave.json",
    };
    Ok(location(mode)?.with_file_name(name))
}

pub fn write(path: &Path, village: &Village) -> io::Result<()> {
    write_payload(path, village)
}

pub(crate) fn write_payload(path: &Path, village: &impl Serialize) -> io::Result<()> {
    write_snapshot(path, village, None)
}

fn write_snapshot(
    path: &Path,
    village: &impl Serialize,
    named_slot: Option<u64>,
) -> io::Result<()> {
    let json = serde_json::to_vec(&SaveFile {
        version: VERSION,
        named_slot,
        village,
    })?;
    atomic_write(path, &json, MAX_BYTES)
}

pub fn write_continuation(
    path: &Path,
    village: &Village,
    named_slot: Option<u64>,
    catalog: &Catalog,
) -> io::Result<()> {
    match read(path, catalog) {
        Ok(saved) if saved.mode() == village.mode() => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        _ => {
            return Err(io::Error::other(
                "the existing autosave could not be restored and was preserved",
            ));
        }
    }
    write_snapshot(path, village, named_slot)
}

pub(crate) fn atomic_write(path: &Path, json: &[u8], max_bytes: u64) -> io::Result<()> {
    if json.len() as u64 > max_bytes {
        return Err(io::Error::other("the village save exceeds its size limit"));
    }
    if let Some(directory) = path.parent() {
        fs::create_dir_all(directory)?;
    }
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let pending = path.with_extension(format!("{}.{}.tmp", std::process::id(), nonce));
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&pending)?;
    let result = (|| {
        file.write_all(json)?;
        file.sync_all()?;
        drop(file);
        fs::rename(&pending, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(pending);
    }
    result
}

pub fn read(path: &Path, catalog: &Catalog) -> io::Result<Village> {
    read_continuation(path, catalog).map(|(village, _)| village)
}

pub fn read_continuation(path: &Path, catalog: &Catalog) -> io::Result<(Village, Option<u64>)> {
    let bytes = read_bytes(path, MAX_BYTES)?;
    let save: SaveFile<Village> = serde_json::from_slice(&bytes)?;
    if save.version != VERSION || !save.village.valid_save(catalog) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "unsupported or invalid village save",
        ));
    }
    Ok((save.village, save.named_slot))
}

pub(crate) fn read_bytes(path: &Path, limit: u64) -> io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    File::open(path)?.take(limit + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > limit {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "save file is too large",
        ));
    }
    Ok(bytes)
}
