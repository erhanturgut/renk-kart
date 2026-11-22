/* Küçük sentez sesleri — dosya gerektirmez */
(function () {
  'use strict';
  let ctx = null, master = null, enabled = true;
  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function noiseBuf(len) {
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    return b;
  }
  function tone(freq, t, dur, type, vol, slide) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  const SFX = {
    tok(v) { // ahşap tık
      const t = ctx.currentTime;
      tone(520 + Math.random() * 60, t, 0.09, 'triangle', 0.5 * v, 180);
      const n = ctx.createBufferSource(); n.buffer = noiseBuf(0.04);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 1.2;
      const g = ctx.createGain(); g.gain.value = 0.35 * v;
      n.connect(f); f.connect(g); g.connect(master); n.start(t);
    },
    slide() {
      const t = ctx.currentTime;
      const n = ctx.createBufferSource(); n.buffer = noiseBuf(0.18);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.linearRampToValueAtTime(400, t + 0.18);
      const g = ctx.createGain(); g.gain.value = 0.12;
      n.connect(f); f.connect(g); g.connect(master); n.start(t);
    },
    pick() { const t = ctx.currentTime; tone(880, t, 0.07, 'sine', 0.25, 1200); },
    nope() { const t = ctx.currentTime; tone(220, t, 0.12, 'square', 0.08, 160); },
    tick() { const t = ctx.currentTime; tone(660, t, 0.1, 'triangle', 0.3); },
    go() { const t = ctx.currentTime; tone(990, t, 0.25, 'triangle', 0.35); tone(1320, t + 0.05, 0.25, 'sine', 0.2); },
    win() { const t = ctx.currentTime; [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, t + i * 0.08, 0.35, 'triangle', 0.3)); },
    lose() { const t = ctx.currentTime; [392, 330, 262].forEach((f, i) => tone(f, t + i * 0.14, 0.32, 'triangle', 0.25)); },
    pop() { const t = ctx.currentTime; tone(600, t, 0.08, 'sine', 0.25, 900); },
    hint() { const t = ctx.currentTime; tone(740, t, 0.12, 'sine', 0.2); tone(1110, t + 0.08, 0.16, 'sine', 0.18); },
  };
  window.RKAudio = {
    play(name, v) { if (!enabled) return; if (!ensure()) return; try { SFX[name](v === undefined ? 1 : v); } catch (e) { /* sessiz */ } },
    setEnabled(v) { enabled = !!v; },
    unlock() { ensure(); },
  };
})();
