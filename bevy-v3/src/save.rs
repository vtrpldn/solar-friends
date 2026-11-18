use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};

use crate::{catalog::Catalog, setup::Mode, village::Village};

const VERSION: u32 = 1;
const MAX_BYTES: u64 = 16 * 1024 * 1024;

#[derive(Serialize, Deserialize)]
struct SaveFile<T> {
    version: u32,
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

pub fn write(path: &Path, village: &Village) -> io::Result<()> {
    let json = serde_json::to_vec(&SaveFile {
        version: VERSION,
        village,
    })?;
    if json.len() as u64 > MAX_BYTES {
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
        file.write_all(&json)?;
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
    let mut bytes = Vec::new();
    File::open(path)?
        .take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "save file is too large",
        ));
    }
    let save: SaveFile<Village> = serde_json::from_slice(&bytes)?;
    if save.version != VERSION || !save.village.valid_save(catalog) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "unsupported or invalid village save",
        ));
    }
    Ok(save.village)
}
