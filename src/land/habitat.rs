//! Broad, reproducible habitats connect the painted landscape to growing conditions.
use crate::river_center;
/// Name, substrate, fertility, water retention and living ground cover.
pub fn habitat(seed: u32, x: f32, y: f32) -> (&'static str, &'static str, f32, f32, f32) {
    let phase = (seed % 997) as f32 / 997. * std::f32::consts::TAU;
    let wave = (y * 0.13 + phase).sin() * 2.;
    if x > river_center(y) - 6. {
        ("River meadow", "Alluvial silt", 0.88, 1.32, 0.85)
    } else if x > 33. + wave && y < 34. {
        ("Rocky woodland", "Granite and quartz", 0.44, 0.70, 0.36)
    } else if y > 40. + (x * 0.12 + phase).sin() * 3. && x > 22. {
        ("Clay terraces", "Red clay and ironstone", 0.62, 1.28, 0.48)
    } else if y > 31. + wave && x < 27. {
        ("Atlantic forest", "Deep forest loam", 0.90, 1.18, 0.92)
    } else if x > 21. + wave && y < 18. {
        ("Dry woodland", "Sandy weathered soil", 0.50, 0.76, 0.46)
    } else {
        ("Flower meadow", "Mixed loam", 0.74, 1.00, 0.65)
    }
}
