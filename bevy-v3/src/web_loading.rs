//! Tells the web page's loading screen (`web/index.html`) when the game is ready to be
//! seen: after a few quick frames in a row, so the slow first frames, while shaders
//! compile and assets decode, stay hidden behind it.

use bevy::prelude::*;

/// Quick frames in a row before the page is uncovered.
const STEADY_FRAMES: u32 = 4;
/// A frame counts as quick under this many seconds.
const QUICK_FRAME: f32 = 0.2;
/// Uncover the page anyway after this long, so a slow machine never waits forever.
const GIVE_UP_SECONDS: f32 = 25.0;

pub struct WebLoadingPlugin;

impl Plugin for WebLoadingPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Last, signal_ready);
    }
}

fn signal_ready(time: Res<Time<Real>>, mut steady: Local<u32>, mut done: Local<bool>) {
    if *done {
        return;
    }
    let quick = time.delta_secs() > 0. && time.delta_secs() < QUICK_FRAME;
    *steady = if quick { *steady + 1 } else { 0 };
    if *steady < STEADY_FRAMES && time.elapsed_secs() < GIVE_UP_SECONDS {
        return;
    }
    *done = true;
    #[cfg(target_arch = "wasm32")]
    {
        use web_sys::wasm_bindgen::JsCast;
        if let Some(ready) = web_sys::window()
            .and_then(|window| js_sys::Reflect::get(&window, &"solarFriendsReady".into()).ok())
            .and_then(|value| value.dyn_into::<js_sys::Function>().ok())
        {
            let _ = ready.call0(&web_sys::wasm_bindgen::JsValue::NULL);
        }
    }
}
