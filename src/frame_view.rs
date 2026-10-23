//! Read-only render data. Borrow nested state instead of allocating a JSON tree.
use crate::*;

#[derive(Serialize)]
struct Frame<'a> {
    village: VillageFrame<'a>,
    residents: &'a [&'a Resident],
    environment: EnvironmentFrame,
}
#[derive(Serialize)]
struct VillageFrame<'a> {
    minutes: f32,
    buildings: &'a [Building],
    building_jobs: &'a [building_work::Job],
    power: &'a power::Power,
    water_supply: &'a water::State,
    logistics: &'a Option<logistics::State>,
    roads: &'a [(i32, i32)],
    economy: EconomyFrame<'a>,
}
#[derive(Serialize)]
struct EconomyFrame<'a> {
    sources: &'a [economy::Source],
}
#[derive(Serialize)]
struct EnvironmentFrame {
    raining: bool,
    weather: WeatherFrame,
    power: power::Supply,
}
#[derive(Serialize)]
struct WeatherFrame {
    current: climate::Weather,
}
// Value::from(f32), used by the original json! sample, promotes to f64.
// Preserve those exact parsed numbers rather than switching to short f32 text.
struct ExactFloat;
impl serde_json::ser::Formatter for ExactFloat {
    fn write_f32<W: std::io::Write + ?Sized>(
        &mut self,
        writer: &mut W,
        value: f32,
    ) -> std::io::Result<()> {
        serde_json::ser::Formatter::write_f64(
            &mut serde_json::ser::CompactFormatter,
            writer,
            f64::from(value),
        )
    }
}

pub fn serialize(v: &Village, residents: &[&Resident]) -> String {
    let current = climate::at(v, v.minutes);
    let frame = Frame {
        village: VillageFrame {
            minutes: v.minutes,
            buildings: &v.buildings,
            building_jobs: &v.building_jobs,
            power: &v.power,
            water_supply: &v.water_supply,
            logistics: &v.logistics,
            roads: &v.roads,
            economy: EconomyFrame {
                sources: &v.economy.sources,
            },
        },
        residents,
        environment: EnvironmentFrame {
            raining: current.raining,
            weather: WeatherFrame { current },
            power: power::supply(v),
        },
    };
    let mut bytes = Vec::with_capacity(16384);
    frame
        .serialize(&mut serde_json::Serializer::with_formatter(
            &mut bytes, ExactFloat,
        ))
        .expect("render state serializes");
    String::from_utf8(bytes).expect("JSON is UTF-8")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn borrowed_sample_preserves_the_original_value_contract_and_does_not_mutate() {
        let mut g = Game::new();
        for frame in 0..100 {
            g.tick(0.25);
            let before = g.snapshot();
            let mut query = g.app.world_mut().query::<&Resident>();
            let world = g.app.world();
            let v = world.resource::<Village>();
            let residents: Vec<_> = query.iter(world).collect();
            let original = serde_json::json!({
                "village": {"minutes":v.minutes,"buildings":v.buildings,"building_jobs":v.building_jobs,"power":v.power,"water_supply":v.water_supply,"logistics":v.logistics,"roads":v.roads,"economy":{"sources":v.economy.sources}},
                "residents":residents,
                "environment":{"raining":climate::at(v,v.minutes).raining,"weather":{"current":climate::at(v,v.minutes)},"power":power::supply(v)}
            });
            let actual: serde_json::Value =
                serde_json::from_str(&serialize(v, &residents)).unwrap();
            assert_eq!(actual, original, "frame {frame}");
            assert_eq!(g.snapshot(), before);
        }
    }
    #[test]
    fn float_formatter_keeps_promoted_f32_numbers() {
        for value in [0.0_f32, -0.0, 0.1, 1.2345678, f32::MIN_POSITIVE, f32::MAX] {
            let mut bytes = Vec::new();
            value
                .serialize(&mut serde_json::Serializer::with_formatter(
                    &mut bytes, ExactFloat,
                ))
                .unwrap();
            let actual: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
            assert_eq!(actual, serde_json::json!(value));
        }
    }
}
