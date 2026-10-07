// Small procedural soundscape: no downloads, loops, or third-party assets.
export class VillageAudio {
  constructor(settings) { this.settings = settings; this.nextBird = 0; this.nextWork = 0; }
  async start() {
    try {
      if (!this.context) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        this.context = new Audio();
        const ctx = this.context;
        this.ambience = ctx.createGain(); this.effects = ctx.createGain();
        this.ambience.gain.value = this.effects.gain.value = 0;
        this.ambience.connect(ctx.destination); this.effects.connect(ctx.destination);
        const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        this.river = ctx.createBufferSource(); this.river.buffer = buffer; this.river.loop = true;
        this.filter = ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 520;
        const level = ctx.createGain(); level.gain.value = 0.13;
        this.river.connect(this.filter); this.filter.connect(level); level.connect(this.ambience); this.river.start();
      }
      if (this.context.state === 'suspended') await this.context.resume();
    } catch { /* Audio is optional; browser restrictions must not interrupt play. */ }
  }
  tone(frequency, when, duration, gain, output, endFrequency = frequency) {
    const ctx = this.context, oscillator = ctx.createOscillator(), volume = ctx.createGain();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, when);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, when + duration);
    volume.gain.setValueAtTime(0, when); volume.gain.linearRampToValueAtTime(gain, when + 0.015);
    volume.gain.exponentialRampToValueAtTime(0.001, when + duration);
    oscillator.connect(volume); volume.connect(output);
    oscillator.onended = () => { oscillator.disconnect(); volume.disconnect(); };
    oscillator.start(when); oscillator.stop(when + duration + 0.02);
  }
  update(running, raining, minutes, working) {
    if (!this.context || !this.ambience) return;
    const now = this.context.currentTime;
    this.ambience.gain.setTargetAtTime(running ? this.settings.ambienceVolume : 0, now, 0.15);
    this.effects.gain.setTargetAtTime(running ? this.settings.effectsVolume : 0, now, 0.08);
    this.filter.frequency.setTargetAtTime(raining ? 2600 : 520, now, 0.8);
    if (!running) return;
    const hour = minutes % 1440 / 60;
    if (now > this.nextBird && hour >= 6 && hour < 18.5 && this.settings.ambienceVolume > 0) {
      this.nextBird = now + 9 + Math.random() * 10;
      this.tone(1800, now, 0.15, 0.035, this.ambience, 2600);
      this.tone(2300, now + 0.22, 0.18, 0.025, this.ambience, 1700);
    }
    if (working && now > this.nextWork && this.settings.effectsVolume > 0) {
      this.nextWork = now + 3.5;
      this.tone(260, now, 0.09, 0.06, this.effects, 100);
      this.tone(220, now + 0.3, 0.08, 0.045, this.effects, 90);
    }
  }
  celebrate() {
    if (!this.context || !this.effects) return;
    const now = this.context.currentTime;
    [523, 659, 784].forEach((note, i) => this.tone(note, now + i * 0.13, 0.5, 0.07, this.effects));
  }
}
