/* Renk Kart — oyun çekirdeği: tahta, kartlar, hamleler, çözücü.
   Tarayıcıda window.RK olarak, Node'da module.exports olarak çalışır. */
(function (root) {
  'use strict';
  const RK = {};

  /* ---------- rastgelelik ---------- */
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  RK.rng = (seed) => mulberry32(typeof seed === 'string' ? hashStr(seed) : seed >>> 0);
  RK.hashStr = hashStr;

  /* ---------- boyutlar ---------- */
  RK.SIZES = {
    3: { n: 3, name: 'Kolay', sub: '3 renk · 9 taş' },
    4: { n: 4, name: 'Normal', sub: '4 renk · 16 taş' },
    5: { n: 5, name: 'Zor', sub: '5 renk · 25 taş' },
  };
  RK.CARD_COUNT = 999; // her boyut için
  
  /* ---------- tahta ----------
     n şerit (satır), her şeritte n hedef yuvası. Kanal sütunları dikey olarak
     şeritleri birbirine bağlar. Taşlar yalnızca boş hücrelerden geçerek kayar.
     Düzenler:  0 Orta kanal · 1 Çift kanal · 2 Sol kanal + cep · 3 Sağ kanal + cep */
  RK.LAYOUTS = [
    { name: 'Orta kanal', short: 'Orta' },
    { name: 'Çift kanal', short: 'Çift' },
    { name: 'Sol kanal', short: 'Sol' },
    { name: 'Sağ kanal', short: 'Sağ' },
  ];
  function layoutSpec(n, kind) {
    const L = n;
    if (kind === 0) { const sc = Math.floor(L / 2); return { W: L + 1, spines: [sc], pockets: [] }; }
    if (kind === 1) return { W: L + 2, spines: [0, L + 1], pockets: [] };
    if (kind === 2) return { W: L + 2, spines: [0], pockets: [1] };
    return { W: L + 2, spines: [L + 1], pockets: [L] };
  }
  const boardCache = {};
  RK.board = function (n, kind) {
    const key = n + ':' + kind;
    if (boardCache[key]) return boardCache[key];
    const spec = layoutSpec(n, kind);
    const R = n, W = spec.W, N = R * W;
    const adj = Array.from({ length: N }, () => []);
    const link = (a, b) => { adj[a].push(b); adj[b].push(a); };
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < W; c++) {
        const i = r * W + c;
        if (c + 1 < W) link(i, i + 1);
        if (spec.spines.includes(c) && r + 1 < R) link(i, i + W);
      }
    }
    const cellType = new Array(N); // 'lane' | 'spine' | 'pocket'
    const laneCells = [], spineCells = [], segments = [];
    for (let r = 0; r < R; r++) {
      const lane = [];
      for (let c = 0; c < W; c++) {
        const i = r * W + c;
        if (spec.spines.includes(c)) { cellType[i] = 'spine'; spineCells.push(i); }
        else if (spec.pockets.includes(c)) cellType[i] = 'pocket';
        else { cellType[i] = 'lane'; lane.push(i); }
      }
      laneCells.push(lane);
      // kanal olmayan ardışık hücre grupları (sezgisel için)
      let c = 0;
      while (c < W) {
        if (spec.spines.includes(c)) { c++; continue; }
        const c0 = c; while (c < W && !spec.spines.includes(c)) c++;
        const cells = []; for (let k = c0; k < c; k++) cells.push(r * W + k);
        const closedL = c0 === 0, closedR = c === W;
        if (closedL && !closedR) segments.push({ cells, open: false });
        else if (closedR && !closedL) segments.push({ cells: cells.slice().reverse(), open: false });
        else segments.push({ cells, open: true });
      }
    }
    const b = { n, R, L: n, W, N, kind, spec, adj, cellType, laneCells, spineCells, segments };
    boardCache[key] = b;
    return b;
  };

  /* Başlangıç: oyuncak gibi her şerit tek renk */
  RK.startState = function (board) {
    const s = new Array(board.N).fill(-1);
    board.laneCells.forEach((cells, r) => cells.forEach((i) => (s[i] = r)));
    return s;
  };

  /* ---------- kartlar ---------- */
  const cardCache = {};
  RK.card = function (n, no) {
    const key = n + '-' + no;
    if (cardCache[key]) return cardCache[key];
    const rnd = RK.rng('renkkart:' + key);
    const kind = Math.floor(rnd() * 4);
    const board = RK.board(n, kind);
    let pattern, tries = 0;
    do {
      const bag = [];
      for (let c = 0; c < n; c++) for (let k = 0; k < n; k++) bag.push(c);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      pattern = [];
      for (let r = 0; r < n; r++) pattern.push(bag.slice(r * n, r * n + n));
      // başlangıca çok benzeyen kartları ele
      let same = 0;
      pattern.forEach((row, r) => row.forEach((c) => { if (c === r) same++; }));
      if (same <= Math.ceil(n * n * 0.34) || tries > 20) break;
      tries++;
    } while (true);
    const target = new Array(board.N).fill(-1);
    board.laneCells.forEach((cells, r) => cells.forEach((i, j) => (target[i] = pattern[r][j])));
    const card = { n, no, kind, pattern, target, board, id: key };
    cardCache[key] = card;
    return card;
  };

  RK.dailyCardNo = function (date) {
    const d = date || new Date();
    const k = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    return 1 + (hashStr('gun:' + k) % RK.CARD_COUNT);
  };

  /* ---------- hamleler ---------- */
  // from hücresindeki taşın boş hücrelerden geçerek ulaşabileceği yerler → {hedef: önceki}
  RK.reach = function (board, state, from) {
    const prev = new Map();
    prev.set(from, -1);
    const q = [from];
    for (let qi = 0; qi < q.length; qi++) {
      const u = q[qi];
      for (const v of board.adj[u]) {
        if (!prev.has(v) && state[v] === -1) { prev.set(v, u); q.push(v); }
      }
    }
    prev.delete(from);
    return prev;
  };
  RK.path = function (board, state, from, to) {
    const prev = RK.reach(board, state, from);
    if (!prev.has(to)) return null;
    const p = [to];
    let u = to;
    while (prev.get(u) !== from) { u = prev.get(u); p.push(u); }
    p.push(from);
    return p.reverse();
  };
  RK.canMove = (board, state, from, to) =>
    state[from] !== -1 && state[to] === -1 && RK.reach(board, state, from).has(to);
  RK.apply = function (state, from, to) {
    const s = state.slice();
    s[to] = s[from]; s[from] = -1;
    return s;
  };
  RK.isSolved = (state, target) => state.every((v, i) => v === target[i]);
  RK.matchCount = function (board, state, target) {
    let m = 0;
    board.laneCells.forEach((cells) => cells.forEach((i) => { if (state[i] === target[i]) m++; }));
    return m;
  };

  /* ---------- karıştırma ----------
     Kartın başlangıç dizilimi, hedeften geriye doğru rastgele kaydırmalarla üretilir.
     Böylece her kart kesinlikle çözülebilir ve bilinen bir çözüm yolu olur (bot bunu kullanır). */
  RK.SCRAMBLE = { 3: [7, 11], 4: [12, 18], 5: [16, 24] };
  RK.cardStars = function (card) {
    const [a, b] = RK.SCRAMBLE[card.n];
    const len = a + (RK.hashStr('len:' + card.id) % (b - a + 1));
    return { len, stars: len <= a + (b - a) / 3 ? 1 : len <= a + (2 * (b - a)) / 3 ? 2 : 3 };
  };
  RK.setup = function (card) {
    if (card._setup) return card._setup;
    const board = card.board, target = card.target;
    const enc = (s) => s.map((v) => (v < 0 ? '.' : v)).join('');
    const { len } = RK.cardStars(card);
    let best = null;
    for (let attempt = 0; attempt < 16; attempt++) {
      const rnd = RK.rng('karistir:' + card.id + ':' + attempt);
      let s = target.slice();
      const states = [enc(s)];
      const visited = new Set(states);
      const moves = [];
      let lastPeg = -1;
      const step = (settle) => {
        const opts = [];
        for (let i = 0; i < board.N; i++) {
          if (s[i] === -1 || i === lastPeg) continue;
          for (const to of RK.reach(board, s, i).keys()) {
            if (settle && board.cellType[to] !== 'lane') continue;
            const ns = RK.apply(s, i, to);
            const k = enc(ns);
            if (visited.has(k)) continue;
            let w = board.cellType[to] === 'lane' ? 3 : 1;
            if (settle && board.cellType[i] !== 'lane') w += 6;
            if (ns[to] !== target[to] && board.cellType[to] === 'lane') w += 2;
            opts.push({ i, to, ns, k, w });
          }
        }
        if (!opts.length) return false;
        let tot = opts.reduce((a, o) => a + o.w, 0), x = rnd() * tot, pick = opts[0];
        for (const o of opts) { x -= o.w; if (x <= 0) { pick = o; break; } }
        s = pick.ns; visited.add(pick.k); states.push(pick.k);
        moves.push([pick.i, pick.to]); lastPeg = pick.to;
        return true;
      };
      for (let k = 0; k < len; k++) if (!step(false)) break;
      // tahta oyuncaktaki gibi dolu başlasın: kanaldaki/cepteki taşları şeritlere yerleştir
      for (let k = 0; k < 24; k++) {
        const loose = s.some((v, i) => v !== -1 && board.cellType[i] !== 'lane');
        if (!loose) break;
        lastPeg = -1;
        if (!step(true)) break;
      }
      const mismatch = board.laneCells.flat().filter((i) => s[i] !== target[i]).length;
      const loose = s.some((v, i) => v !== -1 && board.cellType[i] !== 'lane');
      const score = mismatch - (loose ? 100 : 0);
      if (!best || score > best.score) best = { score, start: s, moves };
      if (!loose && mismatch >= board.n * board.n * 0.5) break;
    }
    // çözüm = karıştırmanın tersi
    const solution = best.moves.slice().reverse().map(([a, b]) => [b, a]);
    card._setup = { start: best.start, solution };
    return card._setup;
  };

  /* ---------- çözücü (ağırlıklı A*) ----------
     Bot ve ipucu bunu kullanır. Makro hamle: bir taşı ulaşabildiği herhangi bir boş hücreye kaydır. */
  function heuristic(board, s, target) {
    let fill = 0, evict = 0, extra = 0;
    for (const seg of board.segments) {
      const cells = seg.cells;
      if (seg.open) {
        for (const i of cells) if (s[i] !== target[i]) { fill += target[i] !== -1 ? 1 : 0; if (s[i] !== -1) evict++; }
      } else {
        let k = 0;
        while (k < cells.length && s[cells[k]] === target[cells[k]] && target[cells[k]] !== -1) k++;
        for (let j = k; j < cells.length; j++) { if (target[cells[j]] !== -1) fill++; if (s[cells[j]] !== -1) evict++; }
      }
    }
    for (const i of board.spineCells) if (s[i] !== -1) extra++;
    return fill + 0.6 * evict + 0.3 * extra;
  }

  function Heap() { this.a = []; }
  Heap.prototype.push = function (x) {
    const a = this.a; a.push(x); let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  };
  Heap.prototype.pop = function () {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  };

  RK.solve = function (board, state, target, opts) {
    opts = opts || {};
    const w = opts.weight || 2.2;
    const maxNodes = opts.maxNodes || 60000;
    const enc = (s) => s.map((v) => (v < 0 ? '.' : v)).join('');
    const start = state.slice();
    const startKey = enc(start);
    const tKey = enc(target);
    if (startKey === tKey) return [];
    const parent = new Map();
    parent.set(startKey, null);
    const gMap = new Map([[startKey, 0]]);
    const open = new Heap();
    open.push({ s: start, k: startKey, g: 0, f: w * heuristic(board, start, target) });
    let nodes = 0;
    while (open.a.length) {
      const cur = open.pop();
      if (cur.g > gMap.get(cur.k)) continue;
      if (cur.k === tKey) {
        const moves = [];
        let k = cur.k;
        while (parent.get(k)) { const p = parent.get(k); moves.push(p.m); k = p.k; }
        return moves.reverse();
      }
      if (++nodes > maxNodes) break;
      const s = cur.s;
      for (let i = 0; i < board.N; i++) {
        if (s[i] === -1) continue;
        const prev = RK.reach(board, s, i);
        for (const to of prev.keys()) {
          const ns = s.slice(); ns[to] = ns[i]; ns[i] = -1;
          const nk = enc(ns);
          const g = cur.g + 1;
          if (gMap.has(nk) && gMap.get(nk) <= g) continue;
          gMap.set(nk, g);
          parent.set(nk, { k: cur.k, m: [i, to] });
          open.push({ s: ns, k: nk, g, f: g + w * heuristic(board, ns, target) });
        }
      }
    }
    return null;
  };

  /* Kısa bir çözüm ara; bulunamazsa karıştırmanın tersini kullan (her zaman geçerli). */
  RK.solveRobust = function (board, state, target, fallback) {
    const tries = [{ weight: 2.0, maxNodes: 15000 }, { weight: 4, maxNodes: 25000 }];
    for (const t of tries) {
      const r = RK.solve(board, state, target, t);
      if (r) return r;
    }
    return fallback ? fallback.slice() : null;
  };

  /* Kart için kısa çözüm (par) — bir kez hesaplanır */
  RK.bestSolution = function (card) {
    const su = RK.setup(card);
    if (!su.best) {
      const r = RK.solveRobust(card.board, su.start, card.target, su.solution);
      su.best = r.length <= su.solution.length ? r : su.solution;
    }
    return su.best;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = RK;
  else root.RK = RK;
})(typeof window !== 'undefined' ? window : globalThis);
