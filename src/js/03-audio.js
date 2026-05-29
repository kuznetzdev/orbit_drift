/*
 * Orbit Drift — 03-audio
 * Minimal Web Audio synthesizer, engine loop, sound cues, sound toggle.
 * Keep this file loaded after all earlier numbered files.
 */

'use strict';

let audioUnlocking = false;
let audioError = null;
let audioReadyPromise = null;
let lastAudioWarnAt = -Infinity;

function warnAudio(message, error = null) {
  const now = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
  if (now - lastAudioWarnAt < 4500) return;
  lastAudioWarnAt = now;
  if (error) console.warn(message, error);
  else console.warn(message);
}

async function ensureAudio() {
  if (!soundOn) return false;
  if (audioReady && audioCtx && audioCtx.state !== 'suspended') return true;
  if (audioReadyPromise) return audioReadyPromise;

  audioUnlocking = true;
  const unlockPromise = (async () => {
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) throw new Error('Web Audio API is unavailable');
      if (!audioCtx) {
        audioCtx = new AudioCtor();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = .72;
        masterGain.connect(audioCtx.destination);
      }
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      audioReady = audioCtx.state !== 'suspended';
      audioError = audioReady ? null : new Error(`AudioContext state: ${audioCtx.state}`);
      if (audioReady) ensureEngineSound();
      else warnAudio('Audio is not ready yet.', audioError);
      return audioReady;
    } catch (error) {
      audioReady = false;
      audioError = error;
      warnAudio('Audio initialization failed; continuing without sound.', error);
      return false;
    } finally {
      audioUnlocking = false;
    }
  })();
  audioReadyPromise = unlockPromise;
  unlockPromise.finally(() => {
    if (audioReadyPromise === unlockPromise) audioReadyPromise = null;
  });

  return unlockPromise;
}

function prepareSoundCue(name, body = null, amount = 1) {
  if (!soundOn) return null;
  const hueShift = body && body.hue ? clamp((body.hue - 180) / 600, -.18, .22) : 0;
  const shifted = freqs => freqs.map(freq => freq * (1 + hueShift));
  return { name, hueShift, shifted, amount };
}

function playPreparedSoundCue(cue) {
  if (!cue || !soundOn || !audioReady || !audioCtx) return;
  const { name, shifted, amount } = cue;
  if (name === 'start') chord([196, 294, 392], .12, .034);
  else if (name === 'scan') chord(shifted([420, 630, 945]), .10, .038);
  else if (name === 'perfect') chord(shifted([528, 792, 1188]), .16, .045);
  else if (name === 'assist') { tone(360 + amount * 18, .075, 'sine', .034); tone(520 + amount * 26, .10, 'sine', .032, .06); }
  else if (name === 'flow') { tone(300 + amount * 55, .075, 'sine', .024); tone(450 + amount * 62, .11, 'triangle', .018, .045); }
  else if (name === 'node') chord([720, 960, 1440], .10, .034);
  else if (name === 'route') tone(360 + amount * 90, .06, 'sine', .026);
  else if (name === 'fail') { tone(82, .22, 'sawtooth', .04); tone(51, .32, 'triangle', .03, .07); noise(.18, .022, 320); }
  else if (name === 'warn') tone(148, .065, 'triangle', .026);
  else if (name === 'heat') { noise(.11, .020 + amount * .006, 1800); tone(210 + amount * 24, .055, 'sawtooth', .020); }
  else if (name === 'stress') { tone(188 - amount * 12, .09, 'triangle', .024); tone(264 + amount * 34, .08, 'sine', .018, .04); }
  else if (name === 'critical') { tone(96, .12, 'sawtooth', .040); tone(72, .16, 'triangle', .034, .08); noise(.20, .028, 520); }
  else if (name === 'impact') { noise(.16, .042, 240); tone(58, .24, 'triangle', .034); }
  else if (name === 'select') tone(560 + amount * 80, .05, 'sine', .024);
}

function ensureEngineSound() {
  if (!audioCtx || engineOsc) return;
  engineOsc = audioCtx.createOscillator();
  engineGain = audioCtx.createGain();
  engineOsc.type = 'triangle';
  engineOsc.frequency.value = 46;
  engineGain.gain.value = .0001;
  engineOsc.connect(engineGain);
  engineGain.connect(masterGain || audioCtx.destination);
  engineOsc.start();
}

function tone(freq, duration = .08, type = 'sine', volume = .045, delay = 0) {
  if (!soundOn || !audioReady || !audioCtx) return;
  const now = audioCtx.currentTime + delay;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), now + .012);
  gain.gain.exponentialRampToValueAtTime(.0001, now + Math.max(.018, duration));
  osc.connect(gain);
  gain.connect(masterGain || audioCtx.destination);
  osc.start(now);
  osc.stop(now + duration + .05);
}

function chord(freqs, duration = .12, volume = .032, type = 'sine') {
  for (let i = 0; i < freqs.length; i++) tone(freqs[i], duration, type, volume / Math.sqrt(freqs.length), i * .018);
}

function noise(duration = .12, volume = .026, toneColor = 1200) {
  if (!soundOn || !audioReady || !audioCtx) return;
  const now = audioCtx.currentTime;
  const length = Math.max(1, Math.floor(audioCtx.sampleRate * duration));
  const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 1.8);
  const src = audioCtx.createBufferSource();
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();
  filter.type = 'bandpass';
  filter.frequency.value = toneColor;
  filter.Q.value = 3.2;
  gain.gain.setValueAtTime(.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + .01);
  gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
  src.buffer = buffer;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain || audioCtx.destination);
  src.start(now);
  src.stop(now + duration + .02);
}

function setEngineAudio(active, intensity = 0) {
  if (!soundOn || !audioReady || !audioCtx || !engineOsc || !engineGain) return;
  const now = audioCtx.currentTime;
  const gain = active ? clamp(.006 + intensity * .028, .005, .045) : .0001;
  const freq = 42 + intensity * 48 + (player ? (player.gravBoost || 0) * 26 : 0);
  engineOsc.frequency.setTargetAtTime(freq, now, .055);
  engineGain.gain.setTargetAtTime(gain, now, .075);
}

function toggleSound() {
  soundOn = !soundOn;
  if (soundOn) {
    const cue = prepareSoundCue('select', null, 2);
    ensureAudio().then(ok => {
      if (ok) playPreparedSoundCue(cue);
    });
  } else if (engineGain && audioCtx) {
    engineGain.gain.setTargetAtTime(.0001, audioCtx.currentTime, .05);
  }
  writeSettings();
}

function soundCue(name, body = null, amount = 1) {
  const cue = prepareSoundCue(name, body, amount);
  if (!cue) return;
  ensureAudio().then(ok => {
    if (ok) playPreparedSoundCue(cue);
  });
}
