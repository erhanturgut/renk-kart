/* Renk Kart — oyun akışı ve arayüz */
(function () {
  'use strict';
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const S = window.RKScene, A = window.RKAudio, NET = window.RKNet, TH = window.RKTheme;

  /* ---------- kayıt ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('rk.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('rk.' + k, JSON.stringify(v)); } catch (e) { /* özel pencere */ } },
  };
  const settings = Object.assign({ theme: 'ahsap', sound: true, symbols: false, top: false, fast: false, name: '', size: 4, rounds: 3, bot: 1 }, store.get('settings', {}));
  const progress = Object.assign({ solved: {}, timedBest: {} }, store.get('progress', {}));
  const stats = Object.assign({ bot: { 0: [0, 0], 1: [0, 0], 2: [0, 0] }, online: [0, 0], played: 0, moves: 0, hints: 0, seconds: 0 }, store.get('stats', {}));
  const saveSettings = () => store.set('settings', settings);
  const saveProgress = () => store.set('progress', progress);
  const saveStats = () => store.set('stats', stats);

  const BOTS = [
    { name: 'Çırak', desc: 'Acele etmez, arada şaşırır', delay: [2.5, 4.0], think: [2.2, 3.4], mistake: 0.22, face: 2 },
    { name: 'Usta', desc: 'Dengeli ve kararlı', delay: [1.5, 2.5], think: [1.4, 2.2], mistake: 0.07, face: 1 },
    { name: 'Efsane', desc: 'Hızlı, hata yapmaz', delay: [0.85, 1.4], think: [0.7, 1.2], mistake: 0, face: 3 },
  ];
  const ROUNDS = [{ v: 1, label: 'Tek tur' }, { v: 3, label: '3\'te 2' }, { v: 5, label: '5\'te 3' }];
  const TIMED_SECONDS = 180;

  /* ---------- oyun durumu ---------- */
  const G = {
    mode: null,        // 'solo' | 'timed' | 'bot' | 'online' | null (menü)
    card: null, state: null, history: [], moves: 0,
    running: false, t0: 0, elapsed: 0, selected: -1,
    hints: 3, hintUsed: false, par: null,
    score: [0, 0], roundsToWin: 2, roundIdx: 0,
    opp: null,          // { state, name, timer, plan }
    timedCount: 0, timedEnd: 0,
    online: { lobby: false, oppName: '', roundOpen: false, waiting: false, iSolved: false },
  };
  let timerId = 0;

  /* ---------- tema ---------- */
  function applyTheme() {
    const t = TH.get(settings.theme);
    const r = document.documentElement.style;
    r.setProperty('--bg', t.bg);
    Object.entries(t.ui).forEach(([k, v]) => { if (typeof v === 'string') r.setProperty('--' + k, v); });
    t.pegs.forEach((c, i) => r.setProperty('--c' + i, c));
    document.documentElement.dataset.dark = t.ui.dark ? '1' : '0';
    document.querySelector('meta[name="theme-color"]') || document.head.insertAdjacentHTML('beforeend', '<meta name="theme-color">');
    document.querySelector('meta[name="theme-color"]').content = t.bg;
    if (S.ready) { S.setTheme(t); S.rebuild(); }
    refreshCardImages();
  }
  const theme = () => TH.get(settings.theme);

  /* ---------- yardımcılar ---------- */
  const fmt = (s) => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  // Türkçe bulunma eki: Usta'da, Efsane'de, Çırak'ta
  function loc(name) {
    const low = name.toLocaleLowerCase('tr');
    const v = [...low].reverse().find((ch) => 'aeıioöuü'.includes(ch)) || 'a';
    const front = 'eiöü'.includes(v);
    const hard = 'çfhkpsşt'.includes(low[low.length - 1]);
    return name + "'" + (hard ? 't' : 'd') + (front ? 'e' : 'a');
  }
  const rand = (a, b) => a + Math.random() * (b - a);
  const randomCardNo = () => 1 + Math.floor(Math.random() * RK.CARD_COUNT);
  let toastT = 0;
  function toast(msg, ms) {
    const el = $('#toast'); el.textContent = msg; el.hidden = false;
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(toastT); toastT = setTimeout(() => (el.hidden = true), ms || 2200);
  }
  function drawCardTo(canvas, card, opts) {
    const asp = TH.cardAspect(card);
    const w = opts && opts.w || 240;
    canvas.width = w * 2; canvas.height = Math.round((w * 2) / asp);
    TH.drawCard(canvas.getContext('2d'), card, theme(), Object.assign({ symbols: settings.symbols }, opts || {}, { w: canvas.width, h: canvas.height }));
  }
  function loading(on) { $('#loading').hidden = !on; }
  // ağır hesaplamayı ekran boyandıktan sonra yap
  const later = (fn) => setTimeout(fn, 60);

  /* ---------- ekranlar ---------- */
  let current = 'menu', prevScreen = 'menu';
  function go(name) {
    if (name === 'back') name = prevScreen === 'cards' ? 'menu' : prevScreen;
    if (name !== current) prevScreen = current;
    current = name;
    $$('.screen').forEach((s) => (s.hidden = s.id !== 'scr-' + name));
    if (name === 'menu') renderMenu();
    if (name === 'solo') renderSolo();
    if (name === 'bot') renderBot();
    if (name === 'cards') renderCards();
    if (name === 'settings') renderSettings();
    if (name === 'stats') renderStats();
    if (name === 'online') renderOnline();
    syncSegs();
    updateInset();
  }
  function hideScreens() { $$('.screen').forEach((s) => (s.hidden = true)); current = null; updateInset(); }
  function updateInset() {
    if (!S.ready) return;
    const scr = $$('.screen').find((s) => !s.hidden);
    if (!scr) return S.setInset(0, 0);
    const mobile = window.innerWidth <= 760;
    if (mobile) S.setInset(0, scr.offsetHeight);
    else S.setInset(scr.offsetWidth + 28, 0);
  }
  window.addEventListener('resize', () => setTimeout(updateInset, 50));

  /* segment seçicileri */
  function buildSegs() {
    $$('[data-bind="size"]').forEach((el) => {
      el.innerHTML = [3, 4, 5].map((n) => {
        const dots = Array.from({ length: n }, (_, i) => `<i class="c${i}"></i>`).join('');
        return `<button data-size="${n}"><span class="mini-dots">${dots}</span>${RK.SIZES[n].name}<small>${RK.SIZES[n].sub}</small></button>`;
      }).join('');
    });
    $$('[data-bind="rounds"]').forEach((el) => {
      el.innerHTML = ROUNDS.map((r) => `<button data-rounds="${r.v}">${r.label}</button>`).join('');
    });
  }
  function syncSegs() {
    $$('[data-size]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.size === settings.size)));
    $$('[data-rounds]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.rounds === settings.rounds)));
  }

  /* ---------- menü ---------- */
  function renderMenu() {
    const no = RK.dailyCardNo();
    const card = RK.card(4, no);
    drawCardTo($('#dailyCanvas'), card, { w: 60, compact: true, solved: !!progress.solved[card.id] });
    $('#dailyNo').textContent = 'NO.' + no;
    const sv = progress.solved[card.id];
    $('#dailyState').textContent = sv ? `Çözüldü · ${sv.moves} hamle · ${fmt(sv.time)}` : 'Normal · henüz çözülmedi';
    const total = Object.keys(progress.solved).length;
    $('#menuCardsSub').textContent = `${total} / ${(RK.CARD_COUNT * 3).toLocaleString('tr-TR')} çözüldü`;
  }
  function nextUnsolved(n) {
    for (let i = 1; i <= RK.CARD_COUNT; i++) if (!progress.solved[n + '-' + i]) return i;
    return 1;
  }
  function renderSolo() {
    $('#soloNextSub').textContent = 'NO.' + nextUnsolved(settings.size) + ' · ' + RK.SIZES[settings.size].name;
    const best = progress.timedBest[settings.size];
    $('#timedSub').textContent = best ? `3 dakikada kaç kart? · Rekor ${best}` : '3 dakikada kaç kart?';
  }
  function renderBot() {
    $('#botList').innerHTML = BOTS.map((b, i) => {
      const [w, l] = stats.bot[i] || [0, 0];
      return `<button class="bot" data-bot="${i}" aria-pressed="${settings.bot === i}">
        <span class="face c${b.face}"><i></i></span>
        <span><b>${b.name}</b><small>${b.desc}</small></span>
        <span class="rec">${w}G · ${l}M</span></button>`;
    }).join('');
  }
  function renderSettings() {
    $('#themeList').innerHTML = TH.THEMES.map((t) =>
      `<button class="theme" data-theme="${t.id}" aria-pressed="${settings.theme === t.id}" style="background:${t.bg};color:${t.ui.ink}">
        <span class="sw" style="background:${t.board}">${t.pegs.slice(0, 4).map((c) => `<i style="background:${c}"></i>`).join('')}</span>${t.name}</button>`).join('');
    $('#optSound').checked = settings.sound;
    $('#optSymbols').checked = settings.symbols;
    $('#optTop').checked = settings.top;
    $('#optFast').checked = settings.fast;
  }
  function renderStats() {
    const solvedBy = [3, 4, 5].map((n) => Object.keys(progress.solved).filter((k) => k.startsWith(n + '-')).length);
    const stars = Object.values(progress.solved).reduce((a, s) => a + (s.stars || 0), 0);
    const bw = [0, 1, 2].reduce((a, i) => a + (stats.bot[i] || [0])[0], 0);
    const bl = [0, 1, 2].reduce((a, i) => a + (stats.bot[i] || [0, 0])[1], 0);
    const cells = [
      ['Çözülen kart', solvedBy.reduce((a, b) => a + b, 0)], ['Toplam yıldız', stars],
      ['Kolay', solvedBy[0]], ['Normal', solvedBy[1]], ['Zor', solvedBy[2]], ['Toplam hamle', stats.moves],
      ['Bota karşı', `${bw} – ${bl}`], ['Online', `${stats.online[0]} – ${stats.online[1]}`],
      ['Oyun süresi', fmt(stats.seconds)], ['Kullanılan ipucu', stats.hints],
    ];
    $('#statGrid').innerHTML = cells.map(([k, v]) => `<div class="stat-card"><small>${k}</small><b>${v}</b></div>`).join('');
  }

  /* ---------- kart koleksiyonu ---------- */
  const PAGE = 24;
  let page = 0;
  function renderCards() {
    const n = settings.size;
    const pages = Math.ceil(RK.CARD_COUNT / PAGE);
    page = Math.max(0, Math.min(pages - 1, page));
    const solved = Object.keys(progress.solved).filter((k) => k.startsWith(n + '-')).length;
    $('#cardsProgress').textContent = `${solved} / ${RK.CARD_COUNT}`;
    $('#pageLabel').textContent = `${page + 1} / ${pages}`;
    const grid = $('#cardGrid');
    grid.innerHTML = '';
    for (let no = page * PAGE + 1; no <= Math.min(RK.CARD_COUNT, (page + 1) * PAGE); no++) {
      const card = RK.card(n, no);
      const b = document.createElement('button');
      b.dataset.card = no;
      b.setAttribute('aria-label', 'Kart ' + no);
      const c = document.createElement('canvas');
      drawCardTo(c, card, { w: 120, solved: !!progress.solved[card.id] });
      b.appendChild(c); grid.appendChild(b);
    }
  }
  function refreshCardImages() {
    if (current === 'cards') renderCards();
    if (current === 'menu') renderMenu();
    if (G.card) drawMiniCard();
  }

  /* ---------- oyun başlatma ---------- */
  function setHud(opts) {
    $('#hud').hidden = false;
    $('#tools').hidden = false;
    $('#miniCard').hidden = false;
    $('#hudTitle').textContent = opts.title;
    $('#hudScore').hidden = !opts.score;
    $('#oppBar').hidden = !opts.opp;
    $('#reactions').hidden = G.mode !== 'online';
    $('[data-act="hint"]').hidden = !(G.mode === 'solo');
    $('[data-act="restart"]').hidden = !(G.mode === 'solo');
    $('#timeLabel').textContent = G.mode === 'timed' ? 'Kalan' : 'Süre';
  }
  function hideHud() {
    ['#hud', '#tools', '#miniCard', '#oppBar', '#reactions', '#bubble'].forEach((s) => ($(s).hidden = true));
    $('#miniCard').classList.remove('big');
  }
  function drawMiniCard() { drawCardTo($('#miniCard canvas'), G.card, { w: 110 }); }

  function loadCard(card, mode, cfg) {
    G.card = card;
    const su = RK.setup(card);
    G.state = su.start.slice();
    G.history = []; G.moves = 0; G.selected = -1; G.hintUsed = false; G.hints = 3; G.par = null;
    G.elapsed = 0;
    S.setup({ mode, card, me: G.state, opp: cfg && cfg.opp });
    drawMiniCard();
    updateStats();
    $('#hintBadge').textContent = G.hints;
  }

  /* --- tek başına --- */
  function startSolo(n, no) {
    stopAll();
    G.mode = 'solo';
    hideScreens();
    const card = RK.card(n, no);
    loadCard(card, 'solo');
    setHud({ title: `NO.${no} · ${RK.SIZES[n].name}` });
    later(() => { G.par = RK.bestSolution(card).length; });
    beginPlay(false);
  }

  /* --- zamana karşı --- */
  function startTimed(n) {
    stopAll();
    G.mode = 'timed'; G.timedCount = 0; G.timedN = n;
    hideScreens();
    nextTimedCard(true);
    G.timedEnd = performance.now() + TIMED_SECONDS * 1000 + 3200;
  }
  function nextTimedCard(first) {
    const no = randomCardNo();
    loadCard(RK.card(G.timedN, no), 'solo');
    setHud({ title: `Zamana karşı · ${G.timedCount} kart` });
    beginPlay(first);
  }

  /* --- bota karşı --- */
  function startBotMatch() {
    stopAll();
    G.mode = 'bot';
    G.botLevel = settings.bot;
    G.score = [0, 0];
    G.roundsToWin = Math.ceil(settings.rounds / 2);
    G.roundIdx = 0;
    hideScreens();
    botRound();
  }
  function botRound() {
    const n = settings.size;
    const no = randomCardNo();
    const card = RK.card(n, no);
    const bot = BOTS[G.botLevel];
    G.roundIdx++;
    G.opp = { name: bot.name, state: RK.setup(card).start.slice(), plan: null, timer: 0, done: false };
    loadCard(card, 'vs', { opp: G.opp.state });
    setHud({ title: `Tur ${G.roundIdx} · NO.${no}`, score: true, opp: true });
    setScoreNames('Sen', bot.name);
    renderOppBar();
    loading(true);
    later(() => {
      G.opp.plan = RK.bestSolution(card).slice();
      loading(false);
      beginPlay(true);
    });
  }
  function botStep() {
    const o = G.opp;
    if (!G.running || !o || o.done) return;
    const bot = BOTS[G.botLevel];
    if (!o.plan.length) return;
    let mv;
    if (Math.random() < bot.mistake && o.plan.length > 1) {
      // şaşırma: rastgele bir hamle yap, sonra geri al
      const opts = [];
      for (let i = 0; i < o.state.length; i++) {
        if (o.state[i] < 0) continue;
        for (const to of RK.reach(G.card.board, o.state, i).keys()) opts.push([i, to]);
      }
      if (opts.length) { mv = opts[Math.floor(Math.random() * opts.length)]; o.plan.unshift([mv[1], mv[0]]); }
    }
    if (!mv) mv = o.plan.shift();
    const path = RK.path(G.card.board, o.state, mv[0], mv[1]);
    if (!path) { o.plan = RK.solveRobust(G.card.board, o.state, G.card.target, []) || []; schedBot(0.5); return; }
    o.state = RK.apply(o.state, mv[0], mv[1]);
    S.move('opp', mv[0], mv[1], path);
    renderOppBar();
    if (RK.isSolved(o.state, G.card.target)) {
      o.done = true;
      setTimeout(() => roundOver(1), 450);
      return;
    }
    schedBot(rand(bot.delay[0], bot.delay[1]));
  }
  function schedBot(sec) { clearTimeout(G.opp.timer); G.opp.timer = setTimeout(botStep, sec * 1000); }

  /* --- ortak oyun akışı --- */
  function beginPlay(countdown) {
    G.running = false;
    const go2 = () => {
      G.running = true;
      G.t0 = performance.now();
      clearInterval(timerId);
      timerId = setInterval(tick, 200);
      if (G.mode === 'bot') { const b = BOTS[G.botLevel]; schedBot(rand(b.think[0], b.think[1])); $('#oppState').textContent = 'düşünüyor'; }
    };
    if (countdown) runCountdown(go2); else go2();
  }
  function runCountdown(done) {
    const el = $('#countdown'), sp = $('span', el);
    el.hidden = false;
    const seq = ['3', '2', '1', 'Başla!'];
    let i = 0;
    const step = () => {
      if (i >= seq.length) { el.hidden = true; done(); return; }
      sp.textContent = seq[i];
      sp.style.animation = 'none'; void sp.offsetWidth; sp.style.animation = '';
      A.play(i === 3 ? 'go' : 'tick');
      i++;
      setTimeout(step, i === 4 ? 600 : 750);
    };
    step();
  }
  function tick() {
    if (!G.running) return;
    G.elapsed = (performance.now() - G.t0) / 1000;
    if (G.mode === 'timed') {
      const left = (G.timedEnd - performance.now()) / 1000;
      $('#hudTime').textContent = fmt(left);
      $('#hudTime').parentElement.classList.toggle('warn', left < 20);
      if (left <= 0) timedOver();
    } else {
      $('#hudTime').textContent = fmt(G.elapsed);
    }
  }
  function updateStats() {
    $('#hudMoves').textContent = G.moves;
    $('[data-act="undo"]').disabled = !G.history.length;
    if (G.mode !== 'timed') $('#hudTime').textContent = fmt(G.elapsed);
    $('#hudTime').parentElement.classList.remove('warn');
  }
  function stopAll() {
    G.running = false;
    clearInterval(timerId);
    if (G.opp) clearTimeout(G.opp.timer);
    $('#countdown').hidden = true;
    closeModal();
  }

  /* ---------- hamle girişi ---------- */
  function onCell(cell, kind) {
    if (!G.running || !G.card) return;
    A.unlock();
    const b = G.card.board;
    if (kind === 'dragstart') { if (G.state[cell] >= 0) selectPeg(cell, true); return; }
    if (cell < 0) { deselect(); return; }
    const v = G.state[cell];
    if (v >= 0) {
      if (G.selected === cell) { deselect(); return; }
      selectPeg(cell);
      return;
    }
    if (G.selected >= 0) {
      if (RK.reach(b, G.state, G.selected).has(cell)) doMove(G.selected, cell);
      else { A.play('nope'); deselect(); }
      return;
    }
    // boş hücreye dokunuldu, seçim yok: tek bir taş ulaşabiliyorsa onu getir
    const can = [];
    for (let i = 0; i < b.N; i++) if (G.state[i] >= 0 && RK.reach(b, G.state, i).has(cell)) can.push(i);
    if (can.length === 1) doMove(can[0], cell);
  }
  function selectPeg(cell, silent) {
    const targets = [...RK.reach(G.card.board, G.state, cell).keys()];
    if (!targets.length) { A.play('nope'); S.bump(); deselect(); return; }
    G.selected = cell;
    S.select(cell, targets);
    if (!silent) A.play('pick');
  }
  function deselect() { if (G.selected >= 0) { G.selected = -1; S.clearSelect(); } }

  function doMove(from, to, isUndo) {
    const path = RK.path(G.card.board, G.state, from, to);
    if (!path) return;
    G.selected = -1;
    S.clearSelect(true);
    G.state = RK.apply(G.state, from, to);
    if (isUndo) G.history.pop(); else G.history.push([from, to]);
    G.moves = isUndo ? Math.max(0, G.moves - 1) : G.moves + 1;
    if (!isUndo) stats.moves++;
    updateStats();
    if (G.mode === 'online') NET.send({ t: 'mv', a: from, b: to });
    const solved = RK.isSolved(G.state, G.card.target);
    if (solved) G.running = false;
    S.move('me', from, to, path, solved ? () => onSolved() : null);
  }
  function undo() {
    if (!G.running || !G.history.length || S.isBusy('me')) return;
    const [a, b] = G.history[G.history.length - 1];
    doMove(b, a, true);
  }
  function hint() {
    if (!G.running || G.mode !== 'solo') return;
    if (G.hints <= 0) { toast('Bu kart için ipucu hakkın bitti'); return; }
    let sol = RK.solve(G.card.board, G.state, G.card.target, { weight: 2, maxNodes: 12000 });
    if (!sol || !sol.length) {
      if (G.history.length) { const [a, b] = G.history[G.history.length - 1]; sol = [[b, a]]; toast('Biraz geri dönmek iyi olabilir'); }
      else return;
    }
    G.hints--; G.hintUsed = true; stats.hints++;
    $('#hintBadge').textContent = G.hints;
    deselect();
    S.hint(sol[0][0], sol[0][1]);
    A.play('hint');
  }
  function restart() {
    if (G.mode !== 'solo' || !G.card) return;
    deselect();
    G.state = RK.setup(G.card).start.slice();
    G.history = []; G.moves = 0; G.t0 = performance.now(); G.elapsed = 0; G.running = true;
    S.setState('me', G.state);
    updateStats();
  }

  /* ---------- tur sonu ---------- */
  function onSolved() {
    clearInterval(timerId);
    const time = G.elapsed;
    stats.played++; stats.seconds += Math.round(time);
    S.celebrate('me');
    if (G.mode === 'solo') return soloWin(time);
    if (G.mode === 'timed') {
      G.timedCount++;
      A.play('pop');
      setTimeout(() => { if (G.mode === 'timed') { G.running = false; nextTimedCard(false); } }, 650);
      clearInterval(timerId); timerId = setInterval(tick, 200);
      return;
    }
    if (G.mode === 'bot') { if (G.opp) clearTimeout(G.opp.timer); return roundOver(0); }
    if (G.mode === 'online') return onlineSolved(time);
  }

  function soloWin(time) {
    A.play('win');
    const par = G.par || RK.bestSolution(G.card).length;
    let stars = G.moves <= par ? 3 : G.moves <= Math.ceil(par * 1.5) ? 2 : 1;
    if (G.hintUsed) stars = Math.min(stars, 2);
    const prev = progress.solved[G.card.id];
    const isBest = !prev || stars > prev.stars || (stars === prev.stars && G.moves < prev.moves);
    if (isBest) progress.solved[G.card.id] = { moves: G.moves, time: Math.round(time), stars };
    else if (prev && time < prev.time) prev.time = Math.round(time);
    saveProgress(); saveStats();
    const n = G.card.n, no = G.card.no;
    setTimeout(() => openModal(`
      <h2>${['', 'Çözüldü', 'Güzel iş!', 'Kusursuz!'][stars]}</h2>
      <p>NO.${no} · ${RK.SIZES[n].name}${isBest && prev ? ' · yeni rekor' : ''}</p>
      <div class="result-stars">${[0, 1, 2].map((i) => `<i class="${i < stars ? 'on' : ''}"></i>`).join('')}</div>
      <div class="result-grid">
        <div><small>Süre</small><b>${fmt(time)}</b></div>
        <div><small>Hamle</small><b>${G.moves}</b></div>
        <div><small>Hedef</small><b>${par}</b></div>
      </div>
      ${G.hintUsed ? '<p>İpucu kullanıldığı için en fazla 2 yıldız.</p>' : stars < 3 ? `<p>${par} hamlede çözersen 3 yıldız.</p>` : ''}`,
      [
        { label: 'Menü', act: () => toMenu() },
        { label: 'Tekrar', act: () => startSolo(n, no) },
        { label: 'Sonraki kart', primary: true, act: () => startSolo(n, no >= RK.CARD_COUNT ? 1 : no + 1) },
      ]), 900);
  }

  function timedOver() {
    G.running = false;
    clearInterval(timerId);
    const n = G.timedN;
    const best = progress.timedBest[n] || 0;
    const rec = G.timedCount > best;
    if (rec) { progress.timedBest[n] = G.timedCount; saveProgress(); }
    A.play(G.timedCount ? 'win' : 'lose');
    openModal(`<h2>Süre doldu</h2><p>${RK.SIZES[n].name} · 3 dakika</p>
      <div class="result-grid"><div><small>Kart</small><b>${G.timedCount}</b></div><div><small>Rekor</small><b>${Math.max(best, G.timedCount)}</b></div><div><small>Hamle</small><b>${stats.moves}</b></div></div>
      ${rec ? '<p>Yeni rekor!</p>' : ''}`,
      [{ label: 'Menü', act: () => toMenu() }, { label: 'Yeniden', primary: true, act: () => startTimed(n) }]);
    $('.result-grid div:last-child').remove();
  }

  function setScoreNames(me, opp) {
    $('#scMeName').textContent = me; $('#scOppName').textContent = opp;
    $('#oppName').textContent = opp;
    $('#scMe').textContent = G.score[0]; $('#scOpp').textContent = G.score[1];
  }
  function renderOppBar() {
    if (!G.opp || !G.card) return;
    const b = G.card.board, n = b.n;
    const wrap = $('#oppCells');
    wrap.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
    let html = '';
    b.laneCells.forEach((cells) => cells.forEach((i) => { html += `<i class="${G.opp.state[i] === G.card.target[i] ? 'ok' : ''}"></i>`; }));
    wrap.innerHTML = html;
    const m = RK.matchCount(b, G.opp.state, G.card.target);
    $('#oppState').textContent = `%${Math.round((m / (n * n)) * 100)} hazır`;
  }

  // winner: 0 = ben, 1 = rakip
  function roundOver(winner) {
    if (G.mode === 'bot' && G.opp) clearTimeout(G.opp.timer);
    G.running = false;
    clearInterval(timerId);
    G.score[winner]++;
    $('#scMe').textContent = G.score[0]; $('#scOpp').textContent = G.score[1];
    const oppName = G.mode === 'bot' ? BOTS[G.botLevel].name : G.online.oppName;
    const matchOver = G.score[winner] >= G.roundsToWin;
    if (winner === 1) { S.celebrate('opp'); A.play('lose'); } else A.play('win');
    if (matchOver) {
      if (G.mode === 'bot') { stats.bot[G.botLevel] = stats.bot[G.botLevel] || [0, 0]; stats.bot[G.botLevel][winner]++; }
      if (G.mode === 'online') stats.online[winner]++;
    }
    saveStats();
    const title = matchOver ? (winner === 0 ? 'Maç senin!' : `${oppName} kazandı`) : (winner === 0 ? 'Turu aldın' : `Tur ${loc(oppName)}`);
    const sub = winner === 0 ? `${G.moves} hamle · ${fmt(G.elapsed)}` : 'Kartı senden önce tamamladı';
    const body = `<h2>${title}</h2><p>${sub}</p>
      <div class="result-grid"><div><small>Sen</small><b>${G.score[0]}</b></div><div><small>${oppName}</small><b>${G.score[1]}</b></div><div><small>Hedef</small><b>${G.roundsToWin}</b></div></div>`;
    let actions;
    if (G.mode === 'bot') {
      actions = matchOver
        ? [{ label: 'Menü', act: () => toMenu() }, { label: 'Rövanş', primary: true, act: () => startBotMatch() }]
        : [{ label: 'Pes et', act: () => toMenu() }, { label: 'Sonraki tur', primary: true, act: () => { closeModal(); botRound(); } }];
    } else {
      const host = NET.role === 'host';
      actions = matchOver
        ? [{ label: 'Ayrıl', act: () => leaveOnline() }].concat(host ? [{ label: 'Rövanş', primary: true, act: () => onlineStartMatch() }] : [])
        : [{ label: 'Ayrıl', act: () => leaveOnline() }].concat(host ? [{ label: 'Sonraki tur', primary: true, act: () => onlineNextRound() }] : []);
      if (!host) G.online.waiting = true;
    }
    setTimeout(() => {
      openModal(body + (G.mode === 'online' && NET.role !== 'host' ? '<p>Ev sahibi sonraki turu başlatacak…</p>' : ''), actions);
    }, winner === 1 ? 1100 : 900);
  }

  /* ---------- online ---------- */
  function renderOnline() {
    $('#nameInput').value = settings.name || '';
    const inLobby = G.online.lobby;
    $('#onlineSetup').hidden = inLobby;
    $('#onlineLobby').hidden = !inLobby;
    if (!NET.available()) $('#onlineSetup .split').insertAdjacentHTML('beforebegin', '<p class="status">Online kütüphanesi yüklenemedi. İnternet bağlantını kontrol et.</p>');
  }
  const myName = () => (settings.name || '').trim() || 'Oyuncu';
  function lobbyStatus(msg) { $('#onlineStatus').textContent = msg; }
  function enterLobby(role) {
    G.online.lobby = true; G.online.oppName = '';
    renderOnline();
    $('#lobbyMe').textContent = myName();
    $('#lobbyMeRole').textContent = role === 'host' ? 'ev sahibi' : 'misafir';
    $('#lobbyOpp').textContent = 'Bekleniyor…';
    $('#lobbyOppRole').textContent = '';
    $('#onlineStartBtn').hidden = true;
    $('#roomCode').textContent = role === 'host' ? '·····' : (G.online.code || '');
    $('[data-act="copy-link"]').hidden = role !== 'host';
    updateInset();
  }
  function hostRoom() {
    if (!NET.available()) return toast('Online kütüphanesi yüklenemedi');
    settings.name = $('#nameInput').value.trim(); saveSettings();
    enterLobby('host');
    lobbyStatus('Oda açılıyor…');
    NET.on(netEvent);
    NET.host();
  }
  function joinRoom(code) {
    code = (code || $('#codeInput').value).trim().toUpperCase();
    if (code.length < 5) { toast('5 haneli oda kodunu yaz'); return; }
    if (!NET.available()) return toast('Online kütüphanesi yüklenemedi');
    settings.name = $('#nameInput').value.trim(); saveSettings();
    G.online.code = code;
    enterLobby('guest');
    $('#roomCode').textContent = code;
    lobbyStatus('Odaya bağlanılıyor…');
    NET.on(netEvent);
    NET.join(code);
  }
  function inviteLink() {
    const u = new URL(location.href); u.search = '?oda=' + G.online.code; u.hash = '';
    return u.toString();
  }
  function netEvent(ev) {
    if (ev.type === 'room') {
      G.online.code = ev.code;
      $('#roomCode').textContent = ev.code;
      lobbyStatus('Arkadaşın kodu girince bağlanacak.');
    } else if (ev.type === 'connected') {
      NET.send({ t: 'hello', name: myName() });
      lobbyStatus('Bağlandı.');
    } else if (ev.type === 'data') {
      onNet(ev.data);
    } else if (ev.type === 'closed') {
      if (G.mode === 'online') { stopAll(); toast('Rakip oyundan ayrıldı', 3000); G.online.lobby = false; NET.close(); toMenu('online'); }
      else if (G.online.lobby) { lobbyStatus('Bağlantı koptu.'); $('#lobbyOpp').textContent = 'Bekleniyor…'; $('#onlineStartBtn').hidden = true; }
    } else if (ev.type === 'error') {
      lobbyStatus(ev.message);
      toast(ev.message, 3200);
      if (NET.role === 'guest' && G.mode !== 'online') { G.online.lobby = false; renderOnline(); updateInset(); }
    }
  }
  function onNet(m) {
    switch (m.t) {
      case 'full':
        toast('Oda dolu'); leaveOnline(); break;
      case 'hello':
        G.online.oppName = String(m.name || 'Rakip').slice(0, 14);
        $('#lobbyOpp').textContent = G.online.oppName;
        $('#lobbyOppRole').textContent = NET.role === 'host' ? 'misafir' : 'ev sahibi';
        if (NET.role === 'host') {
          $('#onlineStartBtn').hidden = false;
          lobbyStatus(`${G.online.oppName} geldi. Hazır olunca başlat.`);
        } else lobbyStatus('Ev sahibinin maçı başlatması bekleniyor…');
        A.play('pop');
        break;
      case 'match':
        G.score = [0, 0]; G.roundsToWin = Math.ceil(m.rounds / 2); G.roundIdx = 0;
        break;
      case 'round':
        onlineRound(m.n, m.no, m.idx);
        break;
      case 'mv':
        if (G.mode === 'online' && G.opp) {
          const path = RK.path(G.card.board, G.opp.state, m.a, m.b);
          G.opp.state = RK.apply(G.opp.state, m.a, m.b);
          if (path) S.move('opp', m.a, m.b, path); else S.setState('opp', G.opp.state);
          renderOppBar();
        }
        break;
      case 'solved':
        if (NET.role === 'host' && G.online.roundOpen) {
          G.online.roundOpen = false;
          NET.send({ t: 'end', w: 'guest' });
          if (G.running) { G.running = false; }
          roundOver(1);
        }
        break;
      case 'end': {
        const iWon = (m.w === 'guest') === (NET.role === 'guest');
        roundOver(iWon ? 0 : 1);
        break;
      }
      case 'react':
        showBubble(G.online.oppName + ': ' + String(m.text).slice(0, 20));
        break;
    }
  }
  function onlineStartMatch() {
    if (NET.role !== 'host') return;
    G.score = [0, 0];
    G.roundsToWin = Math.ceil(settings.rounds / 2); G.roundIdx = 0;
    NET.send({ t: 'match', rounds: settings.rounds });
    onlineNextRound();
  }
  function onlineNextRound() {
    const no = randomCardNo();
    const msg = { t: 'round', n: settings.size, no, idx: G.roundIdx + 1 };
    NET.send(msg);
    onlineRound(msg.n, msg.no, msg.idx);
  }
  function onlineRound(n, no, idx) {
    stopAll();
    G.mode = 'online';
    G.roundIdx = idx;
    G.online.roundOpen = true; G.online.waiting = false; G.online.iSolved = false;
    hideScreens();
    const card = RK.card(n, no);
    G.opp = { name: G.online.oppName, state: RK.setup(card).start.slice(), timer: 0 };
    loadCard(card, 'vs', { opp: G.opp.state });
    setHud({ title: `Tur ${idx} · NO.${no}`, score: true, opp: true });
    setScoreNames(myName(), G.online.oppName || 'Rakip');
    renderOppBar();
    beginPlay(true);
  }
  function onlineSolved() {
    if (NET.role === 'host') {
      if (!G.online.roundOpen) return;
      G.online.roundOpen = false;
      NET.send({ t: 'end', w: 'host' });
      roundOver(0);
    } else {
      G.online.iSolved = true;
      NET.send({ t: 'solved', moves: G.moves });
      toast('Çözdün! Sonuç bekleniyor…');
    }
  }
  function leaveOnline() {
    try { NET.send({ t: 'bye' }); } catch (e) { /* */ }
    NET.close();
    G.online.lobby = false;
    toMenu();
  }
  let bubbleT = 0;
  function showBubble(text) {
    const el = $('#bubble'); el.textContent = text; el.hidden = false;
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    A.play('pop');
    clearTimeout(bubbleT); bubbleT = setTimeout(() => (el.hidden = true), 2400);
  }

  /* ---------- pencere ---------- */
  function openModal(html, actions) {
    $('#modalBody').innerHTML = html;
    const wrap = $('#modalActions'); wrap.innerHTML = '';
    (actions || []).forEach((a) => {
      const b = document.createElement('button');
      b.className = 'btn' + (a.primary ? ' primary' : '');
      b.textContent = a.label;
      b.onclick = () => { A.play('pop'); a.act(); };
      wrap.appendChild(b);
    });
    $('#modal').hidden = false;
  }
  function closeModal() { $('#modal').hidden = true; }
  function howto() {
    openModal(`<div class="howto"><h2>Nasıl oynanır?</h2>
      <ol>
        <li><span>Karttaki deseni kendi tahtanda kur.<small>Her şerit, kartın aynı satırıyla eşleşmeli.</small></span></li>
        <li><span>Bir taşa dokun, sonra gitmesini istediğin boş yere dokun.<small>Sürükleyip bırakmak da olur.</small></span></li>
        <li><span>Taşlar yalnızca oluklarda, boş yerlerden geçerek kayar.<small>Dikey kanallar şeritleri birbirine bağlar; halkalı cepler park yeridir.</small></span></li>
        <li><span>Bot ya da arkadaşın karşısında: kartı ilk tamamlayan turu alır.<small>Az hamlede çözersen tek başına modda 3 yıldız.</small></span></li>
      </ol></div>`, [{ label: 'Anladım', primary: true, act: closeModal }]);
  }

  /* ---------- menüye dönüş ve arka plan gösterisi ---------- */
  let demo = { timer: 0, plan: [], card: null };
  function toMenu(screen) {
    stopAll();
    if (G.mode === 'online' || G.online.lobby) { if (screen !== 'online') { NET.close(); G.online.lobby = false; } }
    G.mode = null; G.card = null; G.opp = null;
    hideHud();
    startDemo();
    go(screen || 'menu');
  }
  function startDemo() {
    clearTimeout(demo.timer);
    const card = RK.card(4, randomCardNo());
    demo.card = card;
    const su = RK.setup(card);
    demo.state = su.start.slice();
    demo.plan = su.solution.slice(0, 40);
    S.setup({ mode: 'menu', card, me: demo.state });
    demo.timer = setTimeout(demoStep, 1400);
  }
  function demoStep() {
    if (G.mode) return;
    const mv = demo.plan.shift();
    if (!mv) { S.celebrate('me'); demo.timer = setTimeout(startDemo, 2600); return; }
    const path = RK.path(demo.card.board, demo.state, mv[0], mv[1]);
    if (path) {
      demo.state = RK.apply(demo.state, mv[0], mv[1]);
      S.move('me', mv[0], mv[1], path, null, true);
    }
    demo.timer = setTimeout(demoStep, 900);
  }

  function quit() {
    if (G.mode === 'bot' || G.mode === 'online') {
      openModal('<h2>Maçtan çık?</h2><p>Bu maç kaybedilmiş sayılır.</p>', [
        { label: 'Vazgeç', act: closeModal },
        { label: 'Çık', primary: true, act: () => {
          if (G.mode === 'bot') { stats.bot[G.botLevel] = stats.bot[G.botLevel] || [0, 0]; stats.bot[G.botLevel][1]++; saveStats(); toMenu(); }
          else leaveOnline();
        } },
      ]);
    } else toMenu(G.mode === 'solo' && prevScreen === 'cards' ? 'cards' : undefined);
  }

  /* ---------- olaylar ---------- */
  function bind() {
    document.addEventListener('click', (e) => {
      const t = e.target.closest('button, [data-go]');
      if (!t) return;
      A.unlock();
      if (t.dataset.go) { A.play('pop'); return go(t.dataset.go); }
      if (t.dataset.size) { settings.size = +t.dataset.size; saveSettings(); syncSegs(); A.play('pick'); if (current === 'cards') { page = 0; renderCards(); } if (current === 'solo') renderSolo(); return; }
      if (t.dataset.rounds) { settings.rounds = +t.dataset.rounds; saveSettings(); syncSegs(); A.play('pick'); return; }
      if (t.dataset.bot) { settings.bot = +t.dataset.bot; saveSettings(); renderBot(); A.play('pick'); return; }
      if (t.dataset.theme) { settings.theme = t.dataset.theme; saveSettings(); applyTheme(); renderSettings(); A.play('pick'); return; }
      if (t.dataset.card) { prevScreen = 'cards'; return startSolo(settings.size, +t.dataset.card); }
      if (t.dataset.react) { NET.send({ t: 'react', text: t.dataset.react }); showBubble('Sen: ' + t.dataset.react); return; }
      const act = t.dataset.act;
      if (!act) return;
      switch (act) {
        case 'daily': prevScreen = 'menu'; startSolo(4, RK.dailyCardNo()); break;
        case 'solo-next': prevScreen = 'solo'; startSolo(settings.size, nextUnsolved(settings.size)); break;
        case 'solo-random': prevScreen = 'solo'; startSolo(settings.size, randomCardNo()); break;
        case 'timed': startTimed(settings.size); break;
        case 'bot-start': startBotMatch(); break;
        case 'host': hostRoom(); break;
        case 'join': joinRoom(); break;
        case 'online-start': onlineStartMatch(); break;
        case 'online-back':
          if (G.online.lobby) { NET.close(); G.online.lobby = false; renderOnline(); updateInset(); } else go('menu');
          break;
        case 'copy-link': {
          const link = inviteLink();
          (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(() => toast('Bağlantı kopyalandı'), () => toast(link, 5000));
          break;
        }
        case 'page-prev': page--; renderCards(); break;
        case 'page-next': page++; renderCards(); break;
        case 'quit': quit(); break;
        case 'undo': undo(); break;
        case 'hint': hint(); break;
        case 'restart': restart(); break;
        case 'view': settings.top = !settings.top; saveSettings(); S.setView(settings.top ? 'top' : 'tilt'); break;
        case 'howto': howto(); break;
        case 'reset-progress':
          openModal('<h2>Emin misin?</h2><p>Çözülen kartlar, rekorlar ve istatistikler silinecek.</p>', [
            { label: 'Vazgeç', act: closeModal },
            { label: 'Sıfırla', primary: true, act: () => {
              progress.solved = {}; progress.timedBest = {}; saveProgress();
              Object.assign(stats, { bot: { 0: [0, 0], 1: [0, 0], 2: [0, 0] }, online: [0, 0], played: 0, moves: 0, hints: 0, seconds: 0 }); saveStats();
              closeModal(); toast('İlerleme sıfırlandı');
            } },
          ]);
          break;
      }
    });
    $('#miniCard').addEventListener('click', () => $('#miniCard').classList.toggle('big'));
    $('#jumpForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const no = parseInt($('#jumpInput').value, 10);
      if (no >= 1 && no <= RK.CARD_COUNT) { prevScreen = 'cards'; startSolo(settings.size, no); }
      else toast(`1 ile ${RK.CARD_COUNT} arasında bir numara yaz`);
    });
    $('#codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });
    $('#optSound').addEventListener('change', (e) => { settings.sound = e.target.checked; A.setEnabled(settings.sound); saveSettings(); A.play('pick'); });
    $('#optSymbols').addEventListener('change', (e) => { settings.symbols = e.target.checked; S.setSymbols(settings.symbols); saveSettings(); S.rebuild(); refreshCardImages(); });
    $('#optTop').addEventListener('change', (e) => { settings.top = e.target.checked; saveSettings(); S.setView(settings.top ? 'top' : 'tilt'); });
    $('#optFast').addEventListener('change', (e) => { settings.fast = e.target.checked; S.setSpeed(settings.fast ? 1.8 : 1); saveSettings(); });
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
      else if (e.key === 'h' || e.key === 'H') hint();
      else if (e.key === 'Escape') { if (!$('#modal').hidden) return; if (G.mode) deselect(); }
    });
  }

  /* ---------- açılış ---------- */
  function boot() {
    if (!window.THREE) { $('#fatal').hidden = false; return; }
    buildSegs();
    bind();
    S.init($('#stage'));
    S.ready = true;
    A.setEnabled(settings.sound);
    S.setSymbols(settings.symbols);
    S.setSpeed(settings.fast ? 1.8 : 1);
    S.setView(settings.top ? 'top' : 'tilt');
    S.onCell(onCell);
    applyTheme();
    startDemo();
    const params = new URLSearchParams(location.search);
    const oda = params.get('oda');
    if (oda) {
      go('online');
      $('#codeInput').value = oda.toUpperCase().slice(0, 5);
      toast('Davet kodu yazıldı. Adını girip Katıl\'a bas.', 3200);
    } else go('menu');
    if (!store.get('seenHowto', false)) { store.set('seenHowto', true); setTimeout(howto, 600); }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { S.rebuild(); refreshCardImages(); });
  }
  boot();
})();
