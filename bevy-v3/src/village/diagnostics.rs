use std::{io, path::PathBuf, time::Duration};
#[cfg(not(target_arch = "wasm32"))]
use std::{
    io::Write,
    process::{Command, Stdio},
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

pub(super) fn copy_notice(village: &Village, catalog: &Catalog, window: &Window) -> String {
    let result = capture_time().and_then(|captured| {
        let bytes = report_bytes(village, catalog, window, captured)?;
        if copy_to_clipboard(&bytes).is_ok() {
            return Ok("Bug report copied. Paste it into your message.".into());
        }
        let path = save_report(village, captured, &bytes)?;
        Ok(format!(
            "Clipboard unavailable · Bug report saved locally\n{}",
            path.display()
        ))
    });
    result.unwrap_or_else(|error| format!("Could not prepare bug report: {error}"))
}

fn capture_time() -> io::Result<Duration> {
    Ok(crate::wall_clock::since_epoch())
}

fn export(village: &Village, catalog: &Catalog, window: &Window) -> io::Result<PathBuf> {
    let captured = capture_time()?;
    let bytes = report_bytes(village, catalog, window, captured)?;
    save_report(village, captured, &bytes)
}

/// A browser cannot write files directly, so the web build downloads the report.
#[cfg(target_arch = "wasm32")]
fn save_report(_village: &Village, captured: Duration, bytes: &[u8]) -> io::Result<PathBuf> {
    let name = format!("bug-report-{}.json", captured.as_secs());
    web::download(bytes, &name)?;
    Ok(PathBuf::from(format!("Downloads/{name}")))
}

#[cfg(not(target_arch = "wasm32"))]
fn save_report(village: &Village, captured: Duration, bytes: &[u8]) -> io::Result<PathBuf> {
    let mode = village
        .mode()
        .ok_or_else(|| io::Error::other("No active village"))?;
    let path =
        save::location(mode)?.with_file_name(format!("bug-report-{}.json", captured.as_nanos()));
    save::atomic_write(&path, bytes, save::MAX_BYTES + 64 * 1024)?;
    Ok(path)
}

fn report_bytes(
    village: &Village,
    catalog: &Catalog,
    window: &Window,
    captured: Duration,
) -> io::Result<Vec<u8>> {
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
    Ok(serde_json::to_vec(&report)?)
}

#[cfg(target_arch = "wasm32")]
fn copy_to_clipboard(bytes: &[u8]) -> io::Result<()> {
    web::copy(std::str::from_utf8(bytes).map_err(io::Error::other)?)
}

/// The browser's clipboard and downloads, after V2's `copyDiagnostics`.
#[cfg(target_arch = "wasm32")]
mod web {
    use std::io;

    use web_sys::wasm_bindgen::JsCast;

    fn failed(_: impl std::fmt::Debug) -> io::Error {
        io::Error::other("The browser refused.")
    }

    fn document() -> io::Result<web_sys::Document> {
        web_sys::window()
            .and_then(|window| window.document())
            .ok_or_else(|| io::Error::other("No page document."))
    }

    /// Copies through a hidden text area, which works while the click that asked for
    /// it still counts as the player's gesture; the asynchronous clipboard is the
    /// fallback.
    pub(super) fn copy(text: &str) -> io::Result<()> {
        let document = document()?;
        let area: web_sys::HtmlTextAreaElement = document
            .create_element("textarea")
            .map_err(failed)?
            .unchecked_into();
        area.set_value(text);
        area.style()
            .set_property("position", "fixed")
            .and_then(|()| area.style().set_property("left", "-10000px"))
            .map_err(failed)?;
        let body = document
            .body()
            .ok_or_else(|| io::Error::other("No page body."))?;
        body.append_child(&area).map_err(failed)?;
        area.select();
        let copied = document
            .unchecked_ref::<web_sys::HtmlDocument>()
            .exec_command("copy")
            .unwrap_or(false);
        area.remove();
        if copied {
            return Ok(());
        }
        let clipboard = web_sys::window()
            .map(|window| window.navigator().clipboard())
            .ok_or_else(|| io::Error::other("No clipboard."))?;
        // The promise settles after this frame; like V2, a granted clipboard counts.
        let _ = clipboard.write_text(text);
        Ok(())
    }

    pub(super) fn download(bytes: &[u8], name: &str) -> io::Result<()> {
        let parts = js_sys::Array::of1(&js_sys::Uint8Array::from(bytes));
        let options = web_sys::BlobPropertyBag::new();
        options.set_type("application/json");
        let blob = web_sys::Blob::new_with_u8_array_sequence_and_options(&parts, &options)
            .map_err(failed)?;
        let url = web_sys::Url::create_object_url_with_blob(&blob).map_err(failed)?;
        let link: web_sys::HtmlAnchorElement = document()?
            .create_element("a")
            .map_err(failed)?
            .unchecked_into();
        link.set_href(&url);
        link.set_download(name);
        link.click();
        web_sys::Url::revoke_object_url(&url).map_err(failed)
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn copy_to_clipboard(bytes: &[u8]) -> io::Result<()> {
    if cfg!(target_os = "macos") {
        return clipboard_command("/usr/bin/pbcopy", &[], bytes);
    }
    if cfg!(target_os = "windows") {
        let text = std::str::from_utf8(bytes).map_err(io::Error::other)?;
        let utf16: Vec<u8> = std::iter::once(0xFEFF_u16)
            .chain(text.encode_utf16())
            .flat_map(u16::to_le_bytes)
            .collect();
        return clipboard_command("clip.exe", &[], &utf16);
    }
    if std::env::var_os("WAYLAND_DISPLAY").is_some()
        && clipboard_command("wl-copy", &["--type", "text/plain;charset=utf-8"], bytes).is_ok()
    {
        return Ok(());
    }
    clipboard_command("xclip", &["-selection", "clipboard", "-in"], bytes)
}

#[cfg(not(target_arch = "wasm32"))]
fn clipboard_command(program: &str, args: &[&str], bytes: &[u8]) -> io::Result<()> {
    let mut child = Command::new(program)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;
    let written = child
        .stdin
        .take()
        .expect("clipboard command stdin is piped")
        .write_all(bytes);
    let status = child.wait()?;
    written?;
    if status.success() {
        Ok(())
    } else {
        Err(io::Error::other("Clipboard command failed."))
    }
}
