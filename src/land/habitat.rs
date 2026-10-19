//! Broad, reproducible habitats connect the painted landscape to growing conditions.
use crate::river_center;
/// Name, substrate, fertility, water retention and living ground cover.
pub fn habitat(seed: u32, x: f32, y: f32) -> (&'static str, &'static str, f32, f32, f32) {
    let phase = (seed % 997) as f32 / 997. * std::f32::consts::TAU;
    let wave = (y * 0.13 + phase).sin() * 2.;
    if x > river_center(y) - 4.5 {
        ("River meadow", "Alluvial silt", 0.88, 1.32, 0.85)
    } else if x > 21. + wave * 0.6 && (8.0..20.).contains(&y) {
        ("Rocky woodland", "Granite and quartz", 0.44, 0.70, 0.36)
    } else if y > 23. + (x * 0.18 + phase).sin() * 1.8 && x > 14. {
        ("Clay terraces", "Red clay and ironstone", 0.62, 1.28, 0.48)
    } else if y > 23. + wave * 0.5 && x < 14. {
        ("Atlantic forest", "Deep forest loam", 0.90, 1.18, 0.92)
    } else if x > 18. + wave * 0.5 && y < 8. {
        ("Dry woodland", "Sandy weathered soil", 0.50, 0.76, 0.46)
    } else {
        ("Flower meadow", "Mixed loam", 0.74, 1.00, 0.65)
    }
}
