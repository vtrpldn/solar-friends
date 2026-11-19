use std::{
    io,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::Serialize;

use super::*;

#[derive(Serialize)]
struct Report<'a> {
    format: &'static str,
    game_version: &'static str,
    platform: &'static str,
    architecture: &'static str,
    captured_unix_seconds: u64,
    paused: bool,
    selected_speed: u8,
    selected_project: Option<usize>,
    selected_resident: usize,
    viewport: (f32, f32),
    scale_factor: f32,
    resident_summary: String,
    latest_notice: &'a str,
    village: &'a Village,
}

pub(super) fn export_notice(village: &Village, catalog: &Catalog, window: &Window) -> String {
    match export(village, catalog, window) {
        Ok(path) => format!("Bug report saved locally\n{}", path.display()),
        Err(error) => format!("Could not export bug report: {error}"),
    }
}

fn export(village: &Village, catalog: &Catalog, window: &Window) -> io::Result<PathBuf> {
    let captured = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(io::Error::other)?;
    let mode = village
        .mode()
        .ok_or_else(|| io::Error::other("No active village"))?;
    let path =
        save::location(mode)?.with_file_name(format!("bug-report-{}.json", captured.as_nanos()));
    let report = Report {
        format: "solar-friends-v3-diagnostics-1",
        game_version: env!("CARGO_PKG_VERSION"),
        platform: std::env::consts::OS,
        architecture: std::env::consts::ARCH,
        captured_unix_seconds: captured.as_secs(),
        paused: village.is_paused(),
        selected_speed: SPEEDS[village.speed].1,
        selected_project: village.construction.production.selected,
        selected_resident: village.selected_resident,
        viewport: (window.width(), window.height()),
        scale_factor: window.scale_factor(),
        resident_summary: village.construction.resident_status(
            catalog,
            &village.stock,
            village.selected_resident,
        ),
        latest_notice: &village.save_notice,
        village,
    };
    let bytes = serde_json::to_vec(&report)?;
    save::atomic_write(&path, &bytes, save::MAX_BYTES + 64 * 1024)?;
    Ok(path)
}
