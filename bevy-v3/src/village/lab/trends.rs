use super::*;
use bevy::{
    asset::RenderAssetUsages,
    render::render_resource::{Extent3d, TextureDimension, TextureFormat},
};

const WIDTH: usize = 240;
const HEIGHT: usize = 50;
pub(super) const LABELS: [(&str, &str); 4] = [
    ("Savings", "R$"),
    ("Clean water", "L"),
    ("Lowest hydration", "%"),
    ("Food ingredients", "kg"),
];

#[derive(Component)]
pub(super) struct ChartRoot;

#[derive(Component)]
pub(super) struct Chart(usize);

pub(super) fn spawn(commands: &mut Commands, parent: Entity, assets: &AssetServer) {
    commands
        .spawn((
            ChartRoot,
            ChildOf(parent),
            Node {
                display: Display::None,
                flex_wrap: FlexWrap::Wrap,
                column_gap: px(10),
                row_gap: px(6),
                ..default()
            },
        ))
        .with_children(|root| {
            for (index, (label, unit)) in LABELS.into_iter().enumerate() {
                root.spawn(Node {
                    flex_direction: FlexDirection::Column,
                    row_gap: px(3),
                    ..default()
                })
                .with_children(|card| {
                    card.spawn((
                        LabControlLabel,
                        Text::new(format!("{label} · {unit}")),
                        ui_font(assets, 14.),
                    ));
                    card.spawn((
                        Chart(index),
                        ImageNode::default(),
                        Node {
                            width: px(WIDTH as f32),
                            height: px(HEIGHT as f32),
                            ..default()
                        },
                    ));
                });
            }
        });
}

pub(super) fn series(history: &TrendHistory, catalog: &Catalog) -> [Vec<f64>; 4] {
    let samples = || {
        history
            .samples
            .iter()
            .skip(history.samples.len().saturating_sub(240))
    };
    let food_mass = catalog.materials["food"].mass;
    [
        samples().map(|s| s.cash_centavos as f64 / 100.).collect(),
        samples().map(|s| s.potable_liters).collect(),
        samples().map(|s| s.minimum_hydration).collect(),
        samples()
            .map(|s| f64::from(s.food_units) * food_mass)
            .collect(),
    ]
}

pub(super) fn bounds(values: &[f64]) -> (f64, f64) {
    values
        .iter()
        .fold((f64::INFINITY, f64::NEG_INFINITY), |(low, high), &value| {
            (low.min(value), high.max(value))
        })
}

fn chart_image(values: &[f64]) -> Image {
    let mut pixels = [45, 52, 45, 255].repeat(WIDTH * HEIGHT);
    let (low, high) = bounds(values);
    let mut previous = None;
    for (index, &value) in values.iter().enumerate() {
        let x = index * (WIDTH - 1) / values.len().saturating_sub(1).max(1);
        let normalized = if high > low {
            (value - low) / (high - low)
        } else {
            0.
        };
        let y = HEIGHT - 3 - (normalized * (HEIGHT - 5) as f64).round() as usize;
        let (old_x, old_y): (usize, usize) = previous.unwrap_or((x, y));
        let steps = x.abs_diff(old_x).max(y.abs_diff(old_y)).max(1);
        for step in 0..=steps {
            let col = (old_x * (steps - step) + x * step) / steps;
            let row = (old_y * (steps - step) + y * step) / steps;
            let offset = (row * WIDTH + col) * 4;
            pixels[offset..offset + 4].copy_from_slice(&[174, 212, 133, 255]);
        }
        previous = Some((x, y));
    }
    Image::new(
        Extent3d {
            width: WIDTH as u32,
            height: HEIGHT as u32,
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        pixels,
        TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::default(),
    )
}

pub(super) fn draw(
    runner: Res<Runner>,
    catalog: Res<Catalog>,
    root: Single<&Node, With<ChartRoot>>,
    mut nodes: Query<(&Chart, &mut ImageNode)>,
    mut images: ResMut<Assets<Image>>,
    mut previous: Local<[Vec<f64>; 4]>,
) {
    if root.display == Display::None {
        return;
    }
    let values = series(&runner.trends, &catalog);
    if *previous == values {
        return;
    }
    for (chart, mut node) in &mut nodes {
        let image = chart_image(&values[chart.0]);
        if let Some(existing) = images.get_mut(&node.image) {
            *existing = image;
        } else {
            node.image = images.add(image);
        }
    }
    *previous = values;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trend_chart_connects_first_and_last_samples() {
        let image = chart_image(&[10., 30.]);
        let pixels = image.data.unwrap();
        let color = |x, y| {
            let offset: usize = (y * WIDTH + x) * 4;
            &pixels[offset..offset + 4]
        };
        assert_eq!(color(0, HEIGHT - 3), [174, 212, 133, 255]);
        assert_eq!(color(WIDTH - 1, 2), [174, 212, 133, 255]);
        assert_eq!(color(0, 0), [45, 52, 45, 255]);
    }
}
