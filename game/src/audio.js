// Synthesised sound: every effect is an oscillator + gain envelope, no audio files.
// The context is created on the first user gesture; in a headless shot it stays off.
export function makeAudio() {
  return { ctx: null, muted: false, master: null, lastSwing: 0 };
}

export function unlockAudio(audio) {
  if (audio.ctx) {
    if (audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
    return;
  }
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audio.ctx = new Ctx();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = 0.22;
    audio.master.connect(audio.ctx.destination);
  } catch (err) {
    audio.ctx = null;
  }
}

function blip(audio, freq0, freq1, dur, type, vol, when = 0) {
  if (!audio.ctx || audio.muted || !audio.master) return;
  try {
    const t = audio.ctx.currentTime + when;
    const osc = audio.ctx.createOscillator();
    const gain = audio.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq0, t);
    if (freq1 !== freq0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq1), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  } catch (err) {
    // Sound is garnish: never let it break the game.
  }
}

function noise(audio, dur, vol, cutoff) {
  if (!audio.ctx || audio.muted || !audio.master) return;
  try {
    const t = audio.ctx.currentTime;
    const len = Math.max(1, Math.floor(audio.ctx.sampleRate * dur));
    const buf = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = audio.ctx.createBufferSource();
    src.buffer = buf;
    const filter = audio.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = audio.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(audio.master);
    src.start(t);
  } catch (err) {
    // Sound is garnish: never let it break the game.
  }
}

export const sfx = {
  swing(audio) {
    if (!audio.ctx) return;
    const now = performance.now();
    if (now - audio.lastSwing < 60) return;
    audio.lastSwing = now;
    noise(audio, 0.09, 0.12, 3200);
  },
  bolt(audio) {
    blip(audio, 980, 420, 0.09, 'sine', 0.1);
  },
  hit(audio) {
    blip(audio, 280, 130, 0.06, 'triangle', 0.13);
  },
  die(audio) {
    noise(audio, 0.22, 0.35, 800);
    blip(audio, 150, 45, 0.25, 'sine', 0.28);
  },
  hurt(audio) {
    blip(audio, 210, 65, 0.25, 'sawtooth', 0.28);
    noise(audio, 0.14, 0.22, 500);
  },
  coin(audio) {
    blip(audio, 1320, 1760, 0.07, 'sine', 0.1);
  },
  chest(audio) {
    blip(audio, 523, 523, 0.1, 'sine', 0.16);
    blip(audio, 784, 784, 0.14, 'sine', 0.16, 0.09);
  },
  potion(audio) {
    blip(audio, 420, 880, 0.22, 'sine', 0.18);
  },
  key(audio) {
    blip(audio, 659, 659, 0.09, 'sine', 0.16);
    blip(audio, 988, 988, 0.14, 'sine', 0.16, 0.08);
  },
  door(audio) {
    noise(audio, 0.4, 0.2, 300);
    blip(audio, 110, 220, 0.35, 'triangle', 0.14, 0.05);
  },
  dodge(audio) {
    noise(audio, 0.12, 0.14, 2000);
  },
  boss(audio) {
    blip(audio, 90, 45, 0.7, 'sawtooth', 0.3);
    noise(audio, 0.5, 0.25, 300);
  },
  roar(audio) {
    blip(audio, 70, 160, 0.4, 'sawtooth', 0.25);
    noise(audio, 0.35, 0.3, 600);
  },
  over(audio) {
    blip(audio, 392, 392, 0.2, 'triangle', 0.2);
    blip(audio, 311, 311, 0.2, 'triangle', 0.2, 0.18);
    blip(audio, 233, 110, 0.5, 'triangle', 0.22, 0.36);
  },
  win(audio) {
    blip(audio, 523, 523, 0.14, 'sine', 0.2);
    blip(audio, 659, 659, 0.14, 'sine', 0.2, 0.12);
    blip(audio, 784, 784, 0.14, 'sine', 0.2, 0.24);
    blip(audio, 1046, 1046, 0.3, 'sine', 0.22, 0.36);
  },
};
