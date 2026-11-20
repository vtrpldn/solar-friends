//! Native open and save dialogs. The web build has no file system paths to offer,
//! so there the dialogs report a cancel.

use std::path::PathBuf;

/// Asks for a JSON file to open.
pub fn pick_json(title: &str, filter: &str) -> Option<PathBuf> {
    #[cfg(not(target_arch = "wasm32"))]
    {
        rfd::FileDialog::new()
            .set_title(title)
            .add_filter(filter, &["json"])
            .pick_file()
    }
    #[cfg(target_arch = "wasm32")]
    {
        let _ = (title, filter);
        None
    }
}

/// Asks where to save a JSON file, suggesting `file_name`.
pub fn save_json(title: &str, file_name: &str, filter: &str) -> Option<PathBuf> {
    #[cfg(not(target_arch = "wasm32"))]
    {
        rfd::FileDialog::new()
            .set_title(title)
            .set_file_name(file_name)
            .add_filter(filter, &["json"])
            .save_file()
    }
    #[cfg(target_arch = "wasm32")]
    {
        let _ = (title, file_name, filter);
        None
    }
}
