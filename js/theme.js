/* Temalar ve kart çizimi (hem 3D doku hem 2D arayüz için aynı çizim) */
(function () {
  'use strict';

  const THEMES = [
    {
      id: 'ahsap', name: 'Ahşap',
      bg: '#EFE3CE', floor: '#E6D5B8',
      board: '#E4BE86', groove: '#A8763F', rim: '#D3A564', outline: '#3B2616',
      card: '#FFFCF4', cardInk: '#3B2616', holder: '#B9864A',
      pegs: ['#F28A26', '#1DB0A3', '#2F9A4C', '#DD3838', '#3567D6'],
      ui: { ink: '#2E1E11', paper: '#FFF8EB', soft: '#F6EAD5', line: '#3B2616', accent: '#DD3838', muted: '#8B6D50', dark: false },
    },
    {
      id: 'gece', name: 'Gece',
      bg: '#171B30', floor: '#1E2340',
      board: '#2E3560', groove: '#141833', rim: '#3A4275', outline: '#090B17',
      card: '#F5F1E6', cardInk: '#14172B', holder: '#4A5390',
      pegs: ['#FF7B54', '#38D3C2', '#FFD23F', '#FF4F8B', '#7AA5FF'],
      ui: { ink: '#F3EFE4', paper: '#232A50', soft: '#2B3360', line: '#0B0D1C', accent: '#FFD23F', muted: '#9BA3CF', dark: true },
    },
    {
      id: 'seker', name: 'Şeker',
      bg: '#FFE1EA', floor: '#FFD3E0',
      board: '#FFFFFF', groove: '#F3AFC4', rim: '#FFE9F0', outline: '#5A1F3D',
      card: '#FFFFFF', cardInk: '#5A1F3D', holder: '#FF8FB0',
      pegs: ['#FF4D78', '#16BFA9', '#FFB300', '#5757E8', '#7BC93B'],
      ui: { ink: '#4A1832', paper: '#FFFFFF', soft: '#FFF0F5', line: '#5A1F3D', accent: '#FF4D78', muted: '#A5607F', dark: false },
    },
    {
      id: 'deniz', name: 'Deniz',
      bg: '#D5ECF0', floor: '#C5E3E8',
      board: '#F6F0E1', groove: '#8EC3CC', rim: '#EDE3CC', outline: '#0F3646',
      card: '#FFFFFF', cardInk: '#0F3646', holder: '#2C8C99',
      pegs: ['#FF6A33', '#00A3A3', '#F5C142', '#1B4C8A', '#E5465A'],
      ui: { ink: '#0D2F3D', paper: '#FBFAF4', soft: '#EAF5F6', line: '#0F3646', accent: '#FF6A33', muted: '#4F7F8C', dark: false },
    },
    {
      id: 'retro', name: 'Retro',
      bg: '#EDE4CB', floor: '#E2D7B8',
      board: '#2E5C4F', groove: '#1B3A31', rim: '#3B6E5F', outline: '#161616',
      card: '#FBF6E6', cardInk: '#161616', holder: '#8A5A2B',
      pegs: ['#E8492F', '#F5BE21', '#3C87C6', '#F4F1E8', '#9A5DE0'],
      ui: { ink: '#1A1A1A', paper: '#FBF6E6', soft: '#F3ECD6', line: '#161616', accent: '#E8492F', muted: '#6E6650', dark: false },
    },
    {
      id: 'kontrast', name: 'Kontrast',
      bg: '#F4F4F0', floor: '#E8E8E2',
      board: '#1D1D1F', groove: '#000000', rim: '#2C2C30', outline: '#000000',
      card: '#FFFFFF', cardInk: '#111111', holder: '#3A3A3E',
      pegs: ['#FF5A1F', '#00B8D9', '#FFE01B', '#FF2E63', '#34D27B'],
      ui: { ink: '#111111', paper: '#FFFFFF', soft: '#F0F0EC', line: '#111111', accent: '#FF2E63', muted: '#6A6A6A', dark: false },
    },
  ];

  const COLOR_NAMES = ['Turuncu', 'Turkuaz', 'Yeşil', 'Kırmızı', 'Mavi'];

  /* Renk körü dostu semboller */
  function drawSymbol(ctx, idx, x, y, r, color) {
    ctx.save();
    ctx.fillStyle = color; ctx.strokeStyle = color;
    ctx.lineWidth = r * 0.34; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    switch (idx % 5) {
      case 0: ctx.arc(x, y, r * 0.42, 0, Math.PI * 2); ctx.fill(); break;
      case 1: ctx.rect(x - r * 0.4, y - r * 0.4, r * 0.8, r * 0.8); ctx.fill(); break;
      case 2:
        ctx.moveTo(x, y - r * 0.5); ctx.lineTo(x + r * 0.5, y + r * 0.38); ctx.lineTo(x - r * 0.5, y + r * 0.38);
        ctx.closePath(); ctx.fill(); break;
      case 3:
        ctx.moveTo(x - r * 0.42, y - r * 0.42); ctx.lineTo(x + r * 0.42, y + r * 0.42);
        ctx.moveTo(x + r * 0.42, y - r * 0.42); ctx.lineTo(x - r * 0.42, y + r * 0.42); ctx.stroke(); break;
      case 4:
        ctx.moveTo(x - r * 0.5, y); ctx.lineTo(x + r * 0.5, y);
        ctx.moveTo(x, y - r * 0.5); ctx.lineTo(x, y + r * 0.5); ctx.stroke(); break;
    }
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  /* Kartı çiz. opts: { w, h, symbols, stars, solved, compact } */
  function drawCard(ctx, card, theme, opts) {
    opts = opts || {};
    const w = opts.w, h = opts.h;
    const b = card.board;
    const ink = theme.cardInk;
    ctx.clearRect(0, 0, w, h);
    const pad = w * 0.045;
    // gölge + kart
    ctx.fillStyle = ink;
    roundRect(ctx, pad, pad + w * 0.02, w - pad * 2, h - pad * 2, w * 0.06); ctx.fill();
    ctx.fillStyle = theme.card;
    roundRect(ctx, pad, pad, w - pad * 2, h - pad * 2 - w * 0.02, w * 0.06); ctx.fill();
    ctx.lineWidth = Math.max(2, w * 0.012); ctx.strokeStyle = ink; ctx.stroke();

    const innerX = pad * 2.2, innerW = w - pad * 4.4;
    const fontBig = Math.round(w * (opts.compact ? 0.12 : 0.085));
    ctx.fillStyle = ink;
    ctx.textBaseline = 'alphabetic';
    ctx.font = `800 ${fontBig}px "Bricolage Grotesque", system-ui, sans-serif`;
    ctx.textAlign = 'left';
    const topY = pad + fontBig * 1.35;
    ctx.fillText('NO.' + card.no, innerX, topY);
    if (!opts.compact) {
      ctx.textAlign = 'right';
      ctx.font = `600 ${Math.round(w * 0.05)}px "Bricolage Grotesque", system-ui, sans-serif`;
      ctx.globalAlpha = 0.7;
      ctx.fillText(RK.LAYOUTS[card.kind].name.toUpperCase(), innerX + innerW, topY);
      ctx.globalAlpha = 1;
    }

    // ızgara
    const gridTop = topY + h * 0.05;
    const gridBottom = h - pad * 2 - (opts.compact ? h * 0.04 : h * 0.11);
    const cellW = innerW / b.W;
    const cellH = (gridBottom - gridTop) / b.R;
    const cs = Math.min(cellW, cellH);
    const gx = innerX + (innerW - cs * b.W) / 2;
    const gy = gridTop + (gridBottom - gridTop - cs * b.R) / 2;
    const cx = (c) => gx + cs * (c + 0.5);
    const cy = (r) => gy + cs * (r + 0.5);
    // oluklar
    ctx.strokeStyle = ink; ctx.globalAlpha = 0.18; ctx.lineCap = 'round';
    ctx.lineWidth = cs * 0.2;
    for (let r = 0; r < b.R; r++) { ctx.beginPath(); ctx.moveTo(cx(0), cy(r)); ctx.lineTo(cx(b.W - 1), cy(r)); ctx.stroke(); }
    for (const c of b.spec.spines) { ctx.beginPath(); ctx.moveTo(cx(c), cy(0)); ctx.lineTo(cx(c), cy(b.R - 1)); ctx.stroke(); }
    ctx.globalAlpha = 1;
    // noktalar
    for (let r = 0; r < b.R; r++) {
      for (let c = 0; c < b.W; c++) {
        const i = r * b.W + c;
        const t = card.target[i];
        if (b.cellType[i] === 'pocket') {
          ctx.globalAlpha = 0.35; ctx.strokeStyle = ink; ctx.lineWidth = cs * 0.06;
          ctx.beginPath(); ctx.arc(cx(c), cy(r), cs * 0.16, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
          continue;
        }
        if (t < 0) continue;
        const rad = cs * 0.34;
        ctx.fillStyle = ink;
        ctx.beginPath(); ctx.arc(cx(c), cy(r) + cs * 0.05, rad, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = theme.pegs[t];
        ctx.beginPath(); ctx.arc(cx(c), cy(r), rad, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = Math.max(1, cs * 0.05); ctx.strokeStyle = ink; ctx.stroke();
        if (opts.symbols) drawSymbol(ctx, t, cx(c), cy(r), rad, 'rgba(0,0,0,0.55)');
      }
    }
    // alt bilgi: zorluk yıldızları
    if (!opts.compact) {
      const st = RK.cardStars(card).stars;
      const sy = h - pad * 2 - h * 0.045;
      ctx.font = `700 ${Math.round(w * 0.045)}px "Bricolage Grotesque", system-ui, sans-serif`;
      ctx.textAlign = 'left'; ctx.fillStyle = ink; ctx.globalAlpha = 0.7;
      ctx.fillText(RK.SIZES[card.n].name.toUpperCase(), innerX, sy);
      ctx.globalAlpha = 1;
      for (let k = 0; k < 3; k++) {
        const x = innerX + innerW - (2 - k) * w * 0.06 - w * 0.02;
        ctx.fillStyle = k < st ? ink : 'transparent';
        ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1.5, w * 0.008);
        ctx.beginPath(); ctx.arc(x, sy - w * 0.015, w * 0.018, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
    if (opts.solved) {
      ctx.save();
      ctx.translate(w - pad * 2.6, pad * 2.6 + fontBig * 0.2);
      ctx.fillStyle = theme.pegs[2]; ctx.strokeStyle = ink; ctx.lineWidth = Math.max(2, w * 0.012);
      ctx.beginPath(); ctx.arc(0, 0, w * 0.075, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = w * 0.025; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(-w * 0.03, 0); ctx.lineTo(-w * 0.005, w * 0.025); ctx.lineTo(w * 0.035, -w * 0.025); ctx.stroke();
      ctx.restore();
    }
  }

  /* Bir kartın en-boy oranı (genişlik/yükseklik) */
  function cardAspect(card) {
    const b = card.board;
    return Math.min(0.95, Math.max(0.68, (b.W + 1.2) / (b.R + 2.6)));
  }

  window.RKTheme = { THEMES, COLOR_NAMES, drawCard, drawSymbol, roundRect, cardAspect,
    get: (id) => THEMES.find((t) => t.id === id) || THEMES[0] };
})();
