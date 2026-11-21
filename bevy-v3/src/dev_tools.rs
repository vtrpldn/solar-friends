//! Local iteration aids, compiled only with the `dev-tools` feature (see docs/iteration.md).
//!
//! - **`** outlines every UI node, **Shift+`** shows the frame-rate overlay, and
//!   **Alt+`** opens the entity inspector when built with the `inspector` feature.
//! - **Ctrl+`** saves a screenshot under `target/screenshots/`.
//! - The Bevy Remote Protocol listens on `127.0.0.1:15702`. Besides Bevy's built-in
//!   `world.*` methods it answers `dev.screenshot` and `dev.keys`, so scripts and agents
//!   can drive the running game from the keyboard and look at the result.

use std::{
    collections::VecDeque,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use bevy::{
    dev_tools::fps_overlay::{FpsOverlayConfig, FpsOverlayPlugin, FrameTimeGraphConfig},
    input::{
        ButtonState, InputSystems,
        keyboard::{Key, KeyboardInput, NativeKey},
    },
    prelude::*,
    remote::{BrpError, BrpResult, RemotePlugin, error_codes, http::RemoteHttpPlugin},
    render::view::screenshot::{Screenshot, save_to_disk},
    ui_render::UiDebugOptions,
    window::PrimaryWindow,
};
use serde::Deserialize;
use serde_json::{Value, json};

pub struct DevToolsPlugin;

impl Plugin for DevToolsPlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins((
            FpsOverlayPlugin {
                config: FpsOverlayConfig {
                    enabled: false,
                    frame_time_graph_config: FrameTimeGraphConfig {
                        enabled: false,
                        ..default()
                    },
                    ..default()
                },
            },
            RemotePlugin::default()
                .with_method("dev.screenshot", remote_screenshot)
                .with_method("dev.keys", remote_keys),
            RemoteHttpPlugin::default(),
        ))
        .init_resource::<RemoteKeys>()
        .add_systems(PreUpdate, replay_remote_keys.before(InputSystems))
        .add_systems(Update, toggles);

        #[cfg(feature = "inspector")]
        app.init_resource::<InspectorOpen>().add_plugins((
            bevy_inspector_egui::bevy_egui::EguiPlugin::default(),
            bevy_inspector_egui::quick::WorldInspectorPlugin::new()
                .run_if(|open: Res<InspectorOpen>| open.0),
        ));
    }
}

#[cfg(feature = "inspector")]
#[derive(Resource, Default)]
struct InspectorOpen(bool);

fn toggles(
    keys: Res<ButtonInput<KeyCode>>,
    mut outlines: ResMut<UiDebugOptions>,
    mut fps: ResMut<FpsOverlayConfig>,
    #[cfg(feature = "inspector")] mut inspector: ResMut<InspectorOpen>,
    mut commands: Commands,
) {
    if !keys.just_pressed(KeyCode::Backquote) {
        return;
    }
    let shift = keys.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]);
    let alt = keys.any_pressed([KeyCode::AltLeft, KeyCode::AltRight]);
    let ctrl = keys.any_pressed([KeyCode::ControlLeft, KeyCode::ControlRight]);
    if ctrl {
        capture(&mut commands, screenshot_path(None));
    } else if alt {
        #[cfg(feature = "inspector")]
        {
            inspector.0 = !inspector.0;
        }
        #[cfg(not(feature = "inspector"))]
        info!("The inspector needs the `inspector` feature: scripts/v3-dev.sh --inspector");
    } else if shift {
        fps.enabled = !fps.enabled;
        fps.frame_time_graph_config.enabled = fps.enabled;
    } else {
        outlines.toggle();
    }
}

fn screenshot_path(requested: Option<PathBuf>) -> PathBuf {
    requested.unwrap_or_else(|| {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |elapsed| elapsed.as_millis());
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("target/screenshots")
            .join(format!("{stamp}.png"))
    })
}

fn capture(commands: &mut Commands, path: PathBuf) {
    if let Some(folder) = path.parent()
        && let Err(error) = std::fs::create_dir_all(folder)
    {
        warn!("Could not create {}: {error}", folder.display());
    }
    info!("Saving screenshot to {}", path.display());
    commands
        .spawn(Screenshot::primary_window())
        .observe(save_to_disk(path));
}

fn parse<T: for<'de> Deserialize<'de> + Default>(params: Option<Value>) -> Result<T, BrpError> {
    params.map_or_else(
        || Ok(T::default()),
        |value| {
            serde_json::from_value(value).map_err(|error| BrpError {
                code: error_codes::INVALID_PARAMS,
                message: error.to_string(),
                data: None,
            })
        },
    )
}

#[derive(Deserialize, Default)]
struct ScreenshotParams {
    path: Option<PathBuf>,
}

/// `dev.screenshot {"path"?: "/abs/file.png"}` → `{"path": …}`. The file appears a frame
/// or two after the reply, once the GPU has read the window back.
fn remote_screenshot(In(params): In<Option<Value>>, mut commands: Commands) -> BrpResult {
    let path = screenshot_path(parse::<ScreenshotParams>(params)?.path);
    capture(&mut commands, path.clone());
    Ok(json!({ "path": path }))
}

#[derive(Deserialize, Default)]
struct KeysParams {
    /// Chords pressed one after another, one frame each. Every chord is a list of
    /// `KeyCode` names held together, e.g. `[["ShiftLeft", "KeyD"], ["Enter"]]`.
    chords: Vec<Vec<KeyCode>>,
    /// Text typed into a focused field, one character per frame.
    text: Option<String>,
}

enum Stroke {
    Chord(Vec<KeyCode>),
    Character(KeyCode, char),
}

#[derive(Resource, Default)]
struct RemoteKeys {
    queue: VecDeque<Stroke>,
    held: Vec<KeyCode>,
}

/// `dev.keys {"chords": [["KeyB"]], "text"?: "123"}` queues key presses as if typed on
/// the keyboard. Each chord is held for one frame, then released.
fn remote_keys(In(params): In<Option<Value>>, mut keys: ResMut<RemoteKeys>) -> BrpResult {
    let params = parse::<KeysParams>(params)?;
    let queued = params.chords.len() + params.text.as_ref().map_or(0, |text| text.len());
    keys.queue
        .extend(params.chords.into_iter().map(Stroke::Chord));
    for character in params.text.unwrap_or_default().chars() {
        keys.queue
            .push_back(Stroke::Character(character_key(character), character));
    }
    Ok(json!({ "queued": queued }))
}

fn character_key(character: char) -> KeyCode {
    match character.to_ascii_uppercase() {
        'A' => KeyCode::KeyA,
        'B' => KeyCode::KeyB,
        'C' => KeyCode::KeyC,
        'D' => KeyCode::KeyD,
        'E' => KeyCode::KeyE,
        'F' => KeyCode::KeyF,
        'G' => KeyCode::KeyG,
        'H' => KeyCode::KeyH,
        'I' => KeyCode::KeyI,
        'J' => KeyCode::KeyJ,
        'K' => KeyCode::KeyK,
        'L' => KeyCode::KeyL,
        'M' => KeyCode::KeyM,
        'N' => KeyCode::KeyN,
        'O' => KeyCode::KeyO,
        'P' => KeyCode::KeyP,
        'Q' => KeyCode::KeyQ,
        'R' => KeyCode::KeyR,
        'S' => KeyCode::KeyS,
        'T' => KeyCode::KeyT,
        'U' => KeyCode::KeyU,
        'V' => KeyCode::KeyV,
        'W' => KeyCode::KeyW,
        'X' => KeyCode::KeyX,
        'Y' => KeyCode::KeyY,
        'Z' => KeyCode::KeyZ,
        '0' => KeyCode::Digit0,
        '1' => KeyCode::Digit1,
        '2' => KeyCode::Digit2,
        '3' => KeyCode::Digit3,
        '4' => KeyCode::Digit4,
        '5' => KeyCode::Digit5,
        '6' => KeyCode::Digit6,
        '7' => KeyCode::Digit7,
        '8' => KeyCode::Digit8,
        '9' => KeyCode::Digit9,
        ' ' => KeyCode::Space,
        '-' => KeyCode::Minus,
        '.' => KeyCode::Period,
        _ => KeyCode::Unidentified(bevy::input::keyboard::NativeKeyCode::Unidentified),
    }
}

/// Releases last frame's keys, then presses the next queued chord, ahead of Bevy's own
/// keyboard handling so game systems see an ordinary press.
fn replay_remote_keys(
    mut keys: ResMut<RemoteKeys>,
    window: Query<Entity, With<PrimaryWindow>>,
    mut input: MessageWriter<KeyboardInput>,
) {
    let Ok(window) = window.single() else {
        return;
    };
    let message = |key_code, state, character: Option<char>| KeyboardInput {
        key_code,
        logical_key: character.map_or(Key::Unidentified(NativeKey::Unidentified), |c| {
            Key::Character(c.to_string().into())
        }),
        state,
        text: character
            .filter(|_| state == ButtonState::Pressed)
            .map(|c| c.to_string().into()),
        repeat: false,
        window,
    };
    for key in std::mem::take(&mut keys.held) {
        input.write(message(key, ButtonState::Released, None));
    }
    match keys.queue.pop_front() {
        Some(Stroke::Chord(chord)) => {
            for &key in &chord {
                input.write(message(key, ButtonState::Pressed, None));
            }
            keys.held = chord;
        }
        Some(Stroke::Character(key, character)) => {
            input.write(message(key, ButtonState::Pressed, Some(character)));
            keys.held = vec![key];
        }
        None => {}
    }
}
