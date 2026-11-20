use std::{f32::consts::TAU, sync::Arc, time::Duration};

use bevy::{
    audio::{AddAudioSource, AudioSinkPlayback, Decodable, Source, Volume},
    prelude::*,
    ui::RelativeCursorPosition,
    window::PrimaryWindow,
};

use serde::{Deserialize, Serialize};

use crate::{save, setup::Mode};

const RATE: u32 = 24_000;
const STEP: f64 = 60.0 / 92.0 / 4.0;
const CHORDS: [[i32; 5]; 16] = [
    [48, 55, 59, 62, 64],
    [48, 55, 59, 62, 64],
    [45, 52, 55, 59, 60],
    [45, 52, 55, 59, 60],
    [50, 57, 60, 64, 65],
    [43, 53, 57, 59, 62],
    [48, 55, 59, 62, 64],
    [48, 55, 59, 62, 64],
    [53, 57, 60, 64, 67],
    [53, 57, 60, 64, 67],
    [52, 55, 59, 62, 66],
    [45, 55, 59, 61, 64],
    [50, 57, 60, 64, 65],
    [43, 53, 57, 59, 62],
    [48, 55, 59, 62, 64],
    [43, 53, 57, 59, 62],
];

#[derive(Asset, TypePath)]
struct Sound(Arc<[f32]>);

struct Samples {
    values: Arc<[f32]>,
    index: usize,
}

impl Iterator for Samples {
    type Item = f32;

    fn next(&mut self) -> Option<f32> {
        let value = *self.values.get(self.index)?;
        self.index += 1;
        Some(value)
    }
}

impl Source for Samples {
    fn current_frame_len(&self) -> Option<usize> {
        None
    }
    fn channels(&self) -> u16 {
        1
    }
    fn sample_rate(&self) -> u32 {
        RATE
    }
    fn total_duration(&self) -> Option<Duration> {
        Some(Duration::from_secs_f64(
            self.values.len() as f64 / f64::from(RATE),
        ))
    }
}

impl Decodable for Sound {
    type DecoderItem = f32;
    type Decoder = Samples;

    fn decoder(&self) -> Self::Decoder {
        Samples {
            values: self.0.clone(),
            index: 0,
        }
    }
}

#[derive(Resource)]
struct Soundscape {
    music: Handle<Sound>,
    button: Handle<Sound>,
    disclosure: Handle<Sound>,
    started: bool,
}

#[derive(Resource, Deserialize, Serialize)]
pub struct SoundSettings {
    music: u8,
    effects: u8,
    #[serde(skip)]
    pub open: bool,
    #[serde(skip)]
    effects_selected: bool,
    #[serde(skip)]
    save_failed: bool,
}

impl Default for SoundSettings {
    fn default() -> Self {
        Self {
            music: 0,
            effects: 0,
            open: false,
            effects_selected: false,
            save_failed: false,
        }
    }
}

impl SoundSettings {
    fn path() -> std::io::Result<std::path::PathBuf> {
        Ok(save::location(Mode::Story)?.with_file_name("sound.json"))
    }

    fn load() -> Option<Self> {
        let bytes = save::read_bytes(&Self::path().ok()?, 1024).ok()?;
        let mut settings: Self = serde_json::from_slice(&bytes).ok()?;
        settings.music = settings.music.min(100);
        settings.effects = settings.effects.min(100);
        Some(settings)
    }

    pub fn controls(&mut self, keys: &ButtonInput<KeyCode>) -> bool {
        if keys.just_pressed(KeyCode::F1)
            && keys.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight])
        {
            self.open = !self.open;
            return true;
        }
        if !self.open {
            return false;
        }
        if keys.any_just_pressed([KeyCode::ArrowUp, KeyCode::ArrowDown]) {
            self.effects_selected = !self.effects_selected;
        }
        let increment = if keys.any_pressed([KeyCode::ShiftLeft, KeyCode::ShiftRight]) {
            5
        } else {
            1
        };
        let step = increment
            * (i16::from(keys.just_pressed(KeyCode::ArrowRight))
                - i16::from(keys.just_pressed(KeyCode::ArrowLeft)));
        if keys.just_pressed(KeyCode::KeyM) {
            self.set_volume(self.effects_selected, 0);
        } else {
            self.adjust_volume(self.effects_selected, step);
        }
        true
    }

    pub fn volume(&self, effects: bool) -> u8 {
        if effects { self.effects } else { self.music }
    }

    pub fn adjust_volume(&mut self, effects: bool, delta: i16) {
        let next = (i16::from(self.volume(effects)) + delta).clamp(0, 100) as u8;
        self.set_volume(effects, next);
    }

    fn set_volume(&mut self, effects: bool, next: u8) {
        if self.apply_volume(effects, next) {
            self.persist();
        }
    }

    fn apply_volume(&mut self, effects: bool, next: u8) -> bool {
        let volume = if effects {
            &mut self.effects
        } else {
            &mut self.music
        };
        if next == *volume {
            return false;
        }
        *volume = next;
        true
    }

    fn persist(&mut self) {
        self.save_failed = Self::path()
            .and_then(|path| save::atomic_write(&path, &serde_json::to_vec(self)?, 1024))
            .is_err();
    }

    pub fn label(&self) -> String {
        let (music, effects) = if self.effects_selected {
            ("", "› ")
        } else {
            ("› ", "")
        };
        let status = if self.save_failed {
            "\nCould not save sound settings"
        } else {
            ""
        };
        format!(
            "Sound · Up/Down Select · Left/Right ±1% · Shift ±5% · M Mute selected\n{music}Music {}%\n{effects}Interaction sounds {}%\nShift+F1 Close{status}",
            self.music, self.effects
        )
    }
}

#[derive(Component)]
struct Music;

#[derive(Component)]
pub(crate) struct DisclosureSound;

pub struct VillageAudio;

impl Plugin for VillageAudio {
    fn build(&self, app: &mut App) {
        app.add_audio_source::<Sound>()
            .add_systems(Startup, (prepare_audio, spawn_volume_panel))
            .add_systems(
                Update,
                (volume_input, audio_controls, show_volume_panel).chain(),
            );
    }
}

#[derive(Component)]
struct VolumePanel;

#[derive(Component)]
struct VolumeTrack(bool);

#[derive(Component)]
struct VolumeFill(bool);

#[derive(Component)]
struct VolumeLabel(bool);

fn spawn_volume_panel(mut commands: Commands, assets: Res<AssetServer>) {
    use crate::ui_font::ui_font;
    commands
        .spawn((
            VolumePanel,
            GlobalZIndex(1),
            crate::theme::panel_node(Node {
                display: Display::None,
                position_type: PositionType::Absolute,
                right: px(22),
                bottom: px(96),
                width: px(308),
                padding: UiRect::all(px(18)),
                flex_direction: FlexDirection::Column,
                row_gap: px(8),
                ..default()
            }),
            crate::theme::panel(),
        ))
        .with_children(|panel| {
            for effects in [false, true] {
                panel.spawn((VolumeLabel(effects), Text::default(), ui_font(&assets, 16.)));
                panel
                    .spawn((
                        VolumeTrack(effects),
                        Button,
                        RelativeCursorPosition::default(),
                        Node {
                            width: percent(100),
                            height: px(14),
                            border_radius: BorderRadius::all(px(7)),
                            overflow: Overflow::clip(),
                            ..default()
                        },
                        BackgroundColor(crate::theme::TRACK),
                    ))
                    .with_child((
                        VolumeFill(effects),
                        Node {
                            height: percent(100),
                            ..default()
                        },
                        BackgroundColor(crate::theme::LEAF),
                        bevy::ui::FocusPolicy::Pass,
                    ));
            }
        });
}

fn volume_input(
    mut settings: ResMut<SoundSettings>,
    mouse: Res<ButtonInput<MouseButton>>,
    window: Single<&Window, With<PrimaryWindow>>,
    tracks: Query<(&VolumeTrack, &RelativeCursorPosition, &Interaction)>,
    mut drag: Local<Option<(bool, bool)>>,
) {
    if !settings.open || !window.focused || !mouse.pressed(MouseButton::Left) {
        if let Some((_, true)) = drag.take() {
            settings.persist();
        }
        return;
    }
    if mouse.just_pressed(MouseButton::Left) {
        *drag = tracks.iter().find_map(|(track, _, state)| {
            (*state == Interaction::Pressed).then_some((track.0, false))
        });
    }
    if let Some((effects, changed)) = drag.as_mut()
        && let Some(cursor) = tracks.iter().find_map(|(track, cursor, _)| {
            (track.0 == *effects).then_some(cursor.normalized).flatten()
        })
    {
        let volume = ((cursor.x + 0.5).clamp(0., 1.) * 100.).round() as u8;
        *changed |= settings.apply_volume(*effects, volume);
    }
}

fn show_volume_panel(
    settings: Res<SoundSettings>,
    mut panel: Single<&mut Node, With<VolumePanel>>,
    mut fills: Query<(&VolumeFill, &mut Node), Without<VolumePanel>>,
    mut labels: Query<(&VolumeLabel, &mut Text)>,
) {
    if !settings.is_changed() {
        return;
    }
    panel.display = if settings.open {
        Display::Flex
    } else {
        Display::None
    };
    for (fill, mut node) in &mut fills {
        node.width = percent(f32::from(settings.volume(fill.0)));
    }
    for (label, mut text) in &mut labels {
        let channel = if label.0 {
            "Interaction sounds"
        } else {
            "Music"
        };
        text.0 = format!("{channel} {}%", settings.volume(label.0));
    }
}

fn prepare_audio(
    mut commands: Commands,
    mut sounds: ResMut<Assets<Sound>>,
    mut settings: ResMut<SoundSettings>,
) {
    // Every session starts muted, whatever volumes were last chosen; the player turns
    // sound up from Sound settings.
    if let Some(saved) = SoundSettings::load() {
        *settings = saved;
    }
    settings.music = 0;
    settings.effects = 0;
    let click = |note| {
        let mut samples = vec![0.0; sample_count(0.085)];
        tone(&mut samples, note, 0.0, 0.085, 0.065, false);
        Sound(samples.into())
    };
    commands.insert_resource(Soundscape {
        music: sounds.add(Sound(sunday_in_the_village().into())),
        button: sounds.add(click(81)),
        disclosure: sounds.add(click(76)),
        started: false,
    });
}

type ChangedButton = (Changed<Interaction>, With<Button>, Without<VolumeTrack>);

fn audio_controls(
    mut commands: Commands,
    mut soundscape: ResMut<Soundscape>,
    (keyboard, mouse): (Res<ButtonInput<KeyCode>>, Res<ButtonInput<MouseButton>>),
    window: Single<&Window, With<PrimaryWindow>>,
    mut sinks: Query<&mut AudioSink, With<Music>>,
    buttons: Query<(&Interaction, Has<DisclosureSound>), ChangedButton>,
    settings: Res<SoundSettings>,
) {
    if !soundscape.started
        && window.focused
        && (keyboard.get_just_pressed().len() > 0 || mouse.just_pressed(MouseButton::Left))
    {
        soundscape.started = true;
        commands.spawn((
            Music,
            AudioPlayer(soundscape.music.clone()),
            PlaybackSettings {
                paused: settings.music == 0,
                volume: Volume::Linear(f32::from(settings.music) / 100.0),
                ..PlaybackSettings::LOOP
            },
        ));
    }
    for mut sink in &mut sinks {
        sink.set_volume(Volume::Linear(f32::from(settings.music) / 100.0));
        if settings.music == 0 || !window.focused {
            sink.pause();
        } else if sink.is_paused() {
            sink.play();
        }
    }
    if window.focused && settings.effects > 0 {
        for (state, disclosure) in &buttons {
            if *state != Interaction::Pressed {
                continue;
            }
            let sound = if disclosure {
                &soundscape.disclosure
            } else {
                &soundscape.button
            };
            commands.spawn((
                AudioPlayer(sound.clone()),
                PlaybackSettings::DESPAWN
                    .with_volume(Volume::Linear(f32::from(settings.effects) / 100.0)),
            ));
        }
    }
}

fn sample_count(seconds: f64) -> usize {
    (seconds * f64::from(RATE)).round() as usize
}

fn sunday_in_the_village() -> Vec<f32> {
    let mut music = vec![0.0; sample_count(CHORDS.len() as f64 * 16.0 * STEP)];
    for (bar, chord) in CHORDS.into_iter().enumerate() {
        for step in 0..16 {
            let time = (bar * 16 + step) as f64 * STEP;
            if matches!(step, 0 | 8) {
                tone(&mut music, chord[0] - 12, time, 0.32, 0.11, false);
                let gain = if step == 8 { 0.055 } else { 0.035 };
                tone(&mut music, 31, time, 0.13, gain, false);
            }
            if matches!(step, 0 | 3 | 6 | 10 | 13) {
                for (voice, note) in chord[1..].iter().enumerate() {
                    tone(
                        &mut music,
                        *note,
                        time + voice as f64 * 0.009,
                        0.32,
                        0.021,
                        true,
                    );
                }
            }
            if step % 2 == 0 {
                let gain = if step % 4 == 0 { 0.021 } else { 0.013 };
                brush(&mut music, time, 0.045, gain, 5200.0);
            }
            if matches!(step, 4 | 12) {
                brush(&mut music, time, 0.07, 0.028, 1200.0);
            }
            if bar % 4 >= 2 && matches!(step, 2 | 7 | 14) {
                tone(
                    &mut music,
                    chord[2 + step % 3] + 12,
                    time,
                    0.5,
                    0.019,
                    false,
                );
            }
        }
    }
    music
}

fn tone(output: &mut [f32], note: i32, start: f64, seconds: f32, gain: f32, triangle: bool) {
    let hz = 440.0 * 2.0f32.powf((note - 69) as f32 / 12.0);
    let attack = 0.008;
    let decay = (0.0001 / gain).ln() / (seconds - attack);
    let start = sample_count(start);
    for frame in 0..sample_count(f64::from(seconds)) {
        let t = frame as f32 / RATE as f32;
        let amplitude = if t < attack {
            gain * t / attack
        } else {
            gain * (decay * (t - attack)).exp()
        };
        let phase = t * hz;
        let wave = if triangle {
            1.0 - 4.0 * ((phase + 0.25).fract() - 0.5).abs()
        } else {
            (phase * TAU).sin()
        };
        let index = (start + frame) % output.len();
        output[index] += amplitude * wave;
    }
}

fn brush(output: &mut [f32], start: f64, seconds: f32, gain: f32, frequency: f32) {
    let start = sample_count(start);
    let theta = TAU * frequency / RATE as f32;
    let alpha = theta.sin() / 1.2;
    let b = alpha / (1.0 + alpha);
    let a1 = -2.0 * theta.cos() / (1.0 + alpha);
    let a2 = (1.0 - alpha) / (1.0 + alpha);
    let decay = (0.0001 / gain).ln() / seconds;
    let mut state = start as u32 + 1;
    let (mut x1, mut x2, mut y1, mut y2) = (0.0, 0.0, 0.0, 0.0);
    for frame in 0..sample_count(f64::from(seconds)) {
        state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        let x = state as f32 / 2_147_483_648.0 - 1.0;
        let y = b * (x - x2) - a1 * y1 - a2 * y2;
        (x1, x2, y1, y2) = (x, x1, y, y1);
        let index = (start + frame) % output.len();
        output[index] += gain * (decay * frame as f32 / RATE as f32).exp() * y;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_game_starts_muted() {
        let settings = SoundSettings::default();
        assert_eq!((settings.volume(false), settings.volume(true)), (0, 0));
    }
}
