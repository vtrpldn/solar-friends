#[cfg(not(target_arch = "wasm32"))]
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
};
use std::{
    io,
    path::{Path, PathBuf},
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    village_name: Option<String>,
    village: T,
}

#[derive(PartialEq, Eq)]
pub(crate) struct SaveSnapshot {
    path: PathBuf,
    revision: u64,
    len: u64,
}

#[cfg(target_arch = "wasm32")]
fn browser_storage() -> io::Result<web_sys::Storage> {
    web_sys::window()
        .and_then(|window| window.local_storage().ok().flatten())
        .ok_or_else(|| io::Error::other("browser storage is unavailable"))
}

#[cfg_attr(not(any(target_arch = "wasm32", test)), allow(dead_code))]
pub(crate) fn storage_key(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

#[cfg_attr(not(any(target_arch = "wasm32", test)), allow(dead_code))]
pub(crate) fn slot_id_from_key(directory: &Path, key: &str) -> Option<u64> {
    let prefix = format!("{}/slot-", storage_key(directory).trim_end_matches('/'));
    key.strip_prefix(&prefix)?
        .strip_suffix(".json")?
        .parse::<u64>()
        .ok()
}

pub fn location(mode: Mode) -> io::Result<PathBuf> {
    let file = match mode {
        Mode::Story => "village.json",
        Mode::Sandbox => "sandbox.json",
    };
    #[cfg(target_arch = "wasm32")]
    {
        Ok(PathBuf::from("solar-friends-v3").join(file))
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
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
            .map(|path| path.join("Solar Friends V3").join(file))
            .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "no local game data folder"))
    }
}

pub fn autosave_location(mode: Mode) -> io::Result<PathBuf> {
    let name = match mode {
        Mode::Story => "story-autosave.json",
        Mode::Sandbox => "sandbox-autosave.json",
    };
    Ok(location(mode)?.with_file_name(name))
}

pub(crate) fn exists(path: &Path) -> bool {
    #[cfg(target_arch = "wasm32")]
    {
        browser_storage()
            .ok()
            .and_then(|storage| storage.get_item(&storage_key(path)).ok().flatten())
            .is_some()
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        path.is_file()
    }
}

pub(crate) fn snapshot(path: &Path) -> Option<SaveSnapshot> {
    #[cfg(target_arch = "wasm32")]
    {
        use std::hash::{Hash, Hasher};
        let text = browser_storage()
            .ok()?
            .get_item(&storage_key(path))
            .ok()??;
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        text.hash(&mut hasher);
        Some(SaveSnapshot {
            path: path.to_path_buf(),
            revision: hasher.finish(),
            len: text.len() as u64,
        })
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        let metadata = path.metadata().ok()?;
        metadata.is_file().then_some(())?;
        let modified = metadata
            .modified()
            .ok()?
            .duration_since(std::time::UNIX_EPOCH)
            .ok()?
            .as_nanos() as u64;
        Some(SaveSnapshot {
            path: path.to_path_buf(),
            revision: modified,
            len: metadata.len(),
        })
    }
}

pub(crate) fn remove_file(path: &Path) -> io::Result<()> {
    #[cfg(target_arch = "wasm32")]
    {
        let key = storage_key(path);
        browser_storage()?
            .remove_item(&key)
            .map_err(|_| io::Error::other("could not remove save from browser storage"))
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        fs::remove_file(path)
    }
}

#[cfg(target_arch = "wasm32")]
pub(crate) fn list_slot_ids(directory: &Path) -> io::Result<Vec<u64>> {
    let storage = browser_storage()?;
    let count = storage
        .length()
        .map_err(|_| io::Error::other("could not inspect browser storage"))?;
    let mut ids = Vec::new();
    for index in 0..count {
        if let Ok(Some(key)) = storage.key(index)
            && let Some(id) = slot_id_from_key(directory, &key)
        {
            ids.push(id);
        }
    }
    Ok(ids)
}

pub fn write(path: &Path, village: &Village) -> io::Result<()> {
    write_snapshot(path, village, None, None)
}

pub(crate) fn write_export(path: &Path, village: &impl Serialize, name: &str) -> io::Result<()> {
    write_snapshot(path, village, None, Some(name.to_owned()))
}

fn write_snapshot(
    path: &Path,
    village: &impl Serialize,
    named_slot: Option<u64>,
    village_name: Option<String>,
) -> io::Result<()> {
    let json = serde_json::to_vec(&SaveFile {
        version: VERSION,
        named_slot,
        village_name,
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
    write_snapshot(path, village, named_slot, None)
}

pub(crate) fn atomic_write(path: &Path, json: &[u8], max_bytes: u64) -> io::Result<()> {
    if json.len() as u64 > max_bytes {
        return Err(io::Error::other("the village save exceeds its size limit"));
    }
    #[cfg(target_arch = "wasm32")]
    {
        let text = std::str::from_utf8(json)
            .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "save is not valid UTF-8"))?;
        let key = storage_key(path);
        browser_storage()?
            .set_item(&key, text)
            .map_err(|_| io::Error::other("browser storage is full or unavailable"))
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        if let Some(directory) = path.parent() {
            fs::create_dir_all(directory)?;
        }
        let nonce = crate::wall_clock::since_epoch().as_nanos();
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
}

pub fn read(path: &Path, catalog: &Catalog) -> io::Result<Village> {
    read_continuation(path, catalog).map(|(village, _)| village)
}

pub fn read_continuation(path: &Path, catalog: &Catalog) -> io::Result<(Village, Option<u64>)> {
    let save = read_snapshot(path, catalog)?;
    Ok((save.village, save.named_slot))
}

pub(crate) fn read_export(path: &Path, catalog: &Catalog) -> io::Result<(Village, Option<String>)> {
    let save = read_snapshot(path, catalog)?;
    Ok((save.village, save.village_name))
}

fn read_snapshot(path: &Path, catalog: &Catalog) -> io::Result<SaveFile<Village>> {
    let bytes = read_bytes(path, MAX_BYTES)?;
    let save: SaveFile<Village> = serde_json::from_slice(&bytes)?;
    if save.version != VERSION || !save.village.valid_save(catalog) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "unsupported or invalid village save",
        ));
    }
    Ok(save)
}

pub(crate) fn read_bytes(path: &Path, limit: u64) -> io::Result<Vec<u8>> {
    #[cfg(target_arch = "wasm32")]
    {
        let key = storage_key(path);
        let value = browser_storage()?
            .get_item(&key)
            .map_err(|_| io::Error::other("could not read from browser storage"))?
            .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "save not found"))?;
        if value.len() as u64 > limit {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "save file is too large",
            ));
        }
        Ok(value.into_bytes())
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn browser_storage_keys_match_slot_ids_for_their_directory_only() {
        let story = Path::new("solar-friends-v3/villages/story");
        let sandbox = Path::new("solar-friends-v3/villages/sandbox");
        let key = storage_key(&story.join("slot-12345.json"));
        assert_eq!(key, "solar-friends-v3/villages/story/slot-12345.json");
        assert_eq!(slot_id_from_key(story, &key), Some(12345));
        assert_eq!(slot_id_from_key(sandbox, &key), None);
        assert_eq!(
            slot_id_from_key(story, "solar-friends-v3/story-autosave.json"),
            None
        );
    }
}
