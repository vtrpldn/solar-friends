//! Time since the Unix epoch on every platform. `std::time::SystemTime::now` panics in
//! the browser, so the web build asks JavaScript's `Date.now()` instead.

use std::time::Duration;

pub fn since_epoch() -> Duration {
    #[cfg(target_arch = "wasm32")]
    {
        Duration::from_secs_f64(js_sys::Date::now() / 1000.0)
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
    }
}
