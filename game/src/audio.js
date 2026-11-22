// Ember Duel — tiny WebAudio synth. Every sound is generated, no files.
// Created lazily on the first user gesture so browsers allow it.

let ctx = null;
let muted = false;

export function ensureAudio() {
  if (!ctx) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
    } catch {
      ctx = null;
    }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function toggleMute() {
  muted = !muted;
  return muted;
}

export function isMuted() {
  return muted;
}

function tone(freq, duration, type, volume, when = 0, slideTo = null) {
  if (muted) return;
  const audio = ensureAudio();
  if (!audio) return;
  const start = audio.currentTime + when;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

function noiseBurst(duration, volume, when = 0, lowpass = 1200) {
  if (muted) return;
  const audio = ensureAudio();
  if (!audio) return;
  const start = audio.currentTime + when;
  const length = Math.max(1, Math.floor(audio.sampleRate * duration));
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = audio.createBufferSource();
  source.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = lowpass;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter).connect(gain).connect(audio.destination);
  source.start(start);
}

export const sfx = {
  click() { tone(660, 0.07, 'sine', 0.12); },
  deal() { noiseBurst(0.09, 0.10, 0, 2400); tone(520, 0.08, 'triangle', 0.08, 0.02); },
  play() { tone(392, 0.12, 'triangle', 0.16); tone(523, 0.14, 'triangle', 0.14, 0.06); },
  hit() { noiseBurst(0.16, 0.22, 0, 900); tone(180, 0.18, 'sawtooth', 0.14, 0, 70); },
  shield() { tone(330, 0.16, 'sine', 0.14); tone(440, 0.2, 'sine', 0.12, 0.08); },
  heal() { tone(523, 0.16, 'sine', 0.12); tone(659, 0.18, 'sine', 0.12, 0.09); tone(784, 0.24, 'sine', 0.12, 0.18); },
  ember() { tone(880, 0.1, 'square', 0.06); tone(1174, 0.14, 'square', 0.05, 0.07); },
  resonance() { tone(784, 0.12, 'triangle', 0.14); tone(1046, 0.2, 'triangle', 0.14, 0.08); },
  turn() { tone(440, 0.1, 'triangle', 0.1); tone(587, 0.12, 'triangle', 0.1, 0.08); },
  win() {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.28, 'triangle', 0.16, i * 0.12));
    tone(1318, 0.5, 'sine', 0.12, 0.5);
  },
  lose() {
    [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.1, i * 0.14));
  },
};

export function playEventSound(event) {
  if (!event) return;
  if (event.resonant) sfx.resonance();
  if (event.card.kind === 'attack' || event.card.kind === 'hybrid') sfx.hit();
  else if (event.card.kind === 'shield') sfx.shield();
  else if (event.card.kind === 'heal') sfx.heal();
  else if (event.card.kind === 'ember') sfx.ember();
  else if (event.card.kind === 'draw') sfx.deal();
  else sfx.play();
}
