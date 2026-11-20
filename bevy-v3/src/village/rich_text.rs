//! Readable panel text. The status card's text arrives as plain lines; this styles each
//! line like V2's typography: headings in bold, figures emphasised, labels and
//! separators muted, explanations softer, all at a 1.5 line height.

use super::*;
use crate::theme;

/// Plain text to show in a styled text block; the block's spans are rebuilt from it.
#[derive(Component, Default)]
pub(super) struct RichSource(pub String);

const SIZE: f32 = 14.5;
const LINE: f32 = 1.5;

pub(super) fn install(app: &mut App) {
    app.add_systems(Update, restyle.after(show_hud));
}

#[derive(Clone, Copy, PartialEq, Debug)]
enum Tone {
    Heading,
    Label,
    Value,
    Separator,
    Prose,
}

/// Splits one line into styled runs.
fn runs(line: &str) -> Vec<(String, Tone)> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    let has_digit = trimmed.chars().any(|c| c.is_ascii_digit());
    let words = trimmed.split_whitespace().count();
    if !has_digit
        && !trimmed.contains(" · ")
        && !trimmed.ends_with('.')
        && words <= 5
        && trimmed.chars().next().is_some_and(char::is_uppercase)
    {
        return vec![(trimmed.to_owned(), Tone::Heading)];
    }
    if trimmed.ends_with('.') && !trimmed.contains(" · ") {
        return vec![(trimmed.to_owned(), Tone::Prose)];
    }
    let mut out = Vec::new();
    for (index, segment) in trimmed.split(" · ").enumerate() {
        if index > 0 {
            out.push((" · ".to_owned(), Tone::Separator));
        }
        // "Expenses R$4.11": the words before the first figure label it.
        let mut split_at = None;
        let mut offset = 0;
        for word in segment.split(' ') {
            if word.chars().any(|c| c.is_ascii_digit()) {
                split_at = Some(offset);
                break;
            }
            offset += word.len() + 1;
        }
        match split_at {
            Some(0) => out.push((segment.to_owned(), Tone::Value)),
            Some(at) => {
                out.push((segment[..at].to_owned(), Tone::Label));
                out.push((segment[at..].to_owned(), Tone::Value));
            }
            None => out.push((segment.to_owned(), Tone::Label)),
        }
    }
    out
}

fn style(tone: Tone) -> (u16, Color, f32) {
    match tone {
        Tone::Heading => (750, theme::INK, SIZE + 1.5),
        Tone::Label => (500, theme::INK, SIZE),
        Tone::Value => (700, theme::INK, SIZE),
        Tone::Separator => (500, theme::EDGE, SIZE),
        Tone::Prose => (400, theme::MUTED, SIZE),
    }
}

fn restyle(
    mut commands: Commands,
    assets: Res<AssetServer>,
    mut blocks: Query<(Entity, &RichSource, Option<&Children>, &mut Text), Changed<RichSource>>,
    spans: Query<(), With<TextSpan>>,
) {
    for (entity, source, children, mut text) in &mut blocks {
        // Rebuilding the spans must also re-lay out the block: a layout kept from more
        // spans than the block now has makes Bevy's text pipeline index past its end.
        text.set_changed();
        for child in children.into_iter().flatten() {
            if spans.contains(*child) {
                commands.entity(*child).despawn();
            }
        }
        let font = crate::ui_font::outfit(&assets);
        commands.entity(entity).with_children(|block| {
            let mut first = true;
            let mut previous_blank = false;
            for line in source.0.lines() {
                let parts = runs(line);
                if parts.is_empty() {
                    previous_blank = true;
                    continue;
                }
                if !first {
                    // A blank line or a heading opens a new paragraph.
                    let gap = previous_blank || parts[0].1 == Tone::Heading;
                    block.spawn((
                        TextSpan::new(if gap { "\n\n" } else { "\n" }),
                        TextFont {
                            font: font.clone(),
                            font_size: if gap { SIZE * 0.6 } else { SIZE },
                            ..default()
                        },
                        bevy::text::LineHeight::RelativeToFont(LINE),
                    ));
                }
                first = false;
                previous_blank = false;
                for (text, tone) in parts {
                    let (weight, color, size) = style(tone);
                    block.spawn((
                        TextSpan::new(text),
                        TextFont {
                            font: font.clone(),
                            font_size: size,
                            weight: bevy::text::FontWeight(weight),
                            ..default()
                        },
                        TextColor(color),
                        bevy::text::LineHeight::RelativeToFont(LINE),
                    ));
                }
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lines_split_into_labels_figures_and_headings() {
        assert_eq!(
            runs("Paid work in town"),
            vec![("Paid work in town".into(), Tone::Heading)]
        );
        assert_eq!(
            runs("Recorded income R$0.00 · Expenses R$4.11"),
            vec![
                ("Recorded income ".into(), Tone::Label),
                ("R$0.00".into(), Tone::Value),
                (" · ".into(), Tone::Separator),
                ("Expenses ".into(), Tone::Label),
                ("R$4.11".into(), Tone::Value),
            ]
        );
        assert_eq!(
            runs("Estimates exclude land, vehicles, labor and depreciation."),
            vec![(
                "Estimates exclude land, vehicles, labor and depreciation.".into(),
                Tone::Prose
            )]
        );
    }
}
