/* Renk Kart — Three.js sahnesi: tahtalar, taşlar, kart, kamera, animasyonlar */
(function () {
  'use strict';
  const T = window.THREE;
  const S = {};
  const SP = 1.0;            // hücre aralığı
  const SLAB_H = 0.42;       // tahta kalınlığı
  const TOP = SLAB_H;        // tahta üst yüzeyi
  const PEG_Y = TOP + 0.014; // taş tabanı

  let renderer, scene, camera, raycaster, container;
  let theme, gradientMap;
  let world;                  // tüm nesneler
  let floor;
  const boards = {};          // 'me' | 'opp'
  let cardObj = null;
  let mode = 'menu';
  let view = 'tilt';
  let symbols = false;
  let speed = 1;
  let cellHandler = null;
  let hoverCell = -1;
  const tweens = [];
  const confetti = [];
  let camGoal = null, camCur = null;
  let orbit = 0;
  let lastT = performance.now();
  let shake = 0;

  /* ---------- yardımcılar ---------- */
  const col = (hex) => new T.Color(hex);
  function makeGradient() {
    const data = new Uint8Array([120, 120, 120, 255, 200, 200, 200, 255, 255, 255, 255, 255]);
    const tex = new T.DataTexture(data, 3, 1, T.RGBAFormat);
    tex.minFilter = T.NearestFilter; tex.magFilter = T.NearestFilter; tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }
  const toon = (hex, extra) => new T.MeshToonMaterial(Object.assign({ color: col(hex), gradientMap }, extra || {}));
  const outlineMat = () => new T.MeshBasicMaterial({ color: col(theme.outline), side: T.BackSide });

  function tween(o) {
    o.t = 0; o.delay = o.delay || 0;
    tweens.push(o);
    return o;
  }
  const ease = {
    out: (t) => 1 - Math.pow(1 - t, 3),
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    back: (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    lin: (t) => t,
  };

  function roundedRectShape(w, h, r) {
    const s = new T.Shape();
    const x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  function slabGeo(w, d, h, r, bevel) {
    const g = new T.ExtrudeGeometry(roundedRectShape(w, d, r), {
      depth: h - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 8,
    });
    g.rotateX(-Math.PI / 2);
    g.translate(0, bevel, 0);
    return g;
  }

  /* taş geometrisi: yuvarlatılmış ahşap disk */
  let pegGeo, pegOutlineGeo, symGeo;
  function buildPegGeo() {
    const r = 0.39, h = 0.3, b = 0.06;
    const pts = [new T.Vector2(0, 0), new T.Vector2(r - b, 0)];
    for (let k = 1; k <= 4; k++) { const a = (k / 4) * Math.PI / 2; pts.push(new T.Vector2(r - b + Math.sin(a) * b, b - Math.cos(a) * b)); }
    for (let k = 0; k <= 4; k++) { const a = (k / 4) * Math.PI / 2; pts.push(new T.Vector2(r - b + Math.cos(a) * b, h - b + Math.sin(a) * b)); }
    pts.push(new T.Vector2(0, h));
    pegGeo = new T.LatheGeometry(pts, 40);
    const po = pts.map((p) => new T.Vector2(p.x === 0 ? 0 : p.x + 0.035, p.y === 0 ? -0.03 : p.y === h ? h + 0.035 : p.y));
    pegOutlineGeo = new T.LatheGeometry(po, 40);
    symGeo = new T.CircleGeometry(0.27, 32);
    symGeo.rotateX(-Math.PI / 2);
  }
  const symTexCache = {};
  function symbolTex(idx) {
    if (symTexCache[idx]) return symTexCache[idx];
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d');
    RKTheme.drawSymbol(ctx, idx, 64, 64, 60, 'rgba(0,0,0,0.5)');
    const t = new T.CanvasTexture(c);
    symTexCache[idx] = t;
    return t;
  }

  /* ---------- tahta ---------- */
  function cellLocal(b, i) {
    const r = Math.floor(i / b.W), c = i % b.W;
    return new T.Vector3((c - (b.W - 1) / 2) * SP, PEG_Y, (r - (b.R - 1) / 2) * SP);
  }

  function makePeg(colorIdx) {
    const g = new T.Group();
    const m = new T.Mesh(pegGeo, toon(theme.pegs[colorIdx]));
    m.castShadow = true;
    g.add(m);
    const o = new T.Mesh(pegOutlineGeo, outlineMat());
    g.add(o);
    if (symbols) {
      const s = new T.Mesh(symGeo, new T.MeshBasicMaterial({ map: symbolTex(colorIdx), transparent: true, depthWrite: false }));
      s.position.y = 0.303;
      g.add(s);
    }
    g.userData.color = colorIdx;
    return g;
  }

  function buildBoard(model, key) {
    const grp = new T.Group();
    const w = model.W * SP + 0.7, d = model.R * SP + 0.7;
    const slab = new T.Mesh(slabGeo(w, d, SLAB_H, 0.32, 0.07), toon(theme.board));
    slab.receiveShadow = true; slab.castShadow = true;
    grp.add(slab);
    const out = new T.Mesh(slabGeo(w + 0.09, d + 0.09, SLAB_H + 0.03, 0.36, 0.08), outlineMat());
    out.position.y = -0.03;
    grp.add(out);

    const grooveMat = new T.MeshBasicMaterial({ color: col(theme.groove) });
    const gw = 0.3;
    // satır olukları
    for (let r = 0; r < model.R; r++) {
      const len = (model.W - 1) * SP + gw;
      const g = new T.Mesh(new T.PlaneGeometry(len, gw), grooveMat);
      g.rotation.x = -Math.PI / 2;
      g.position.set(0, TOP + 0.004, (r - (model.R - 1) / 2) * SP);
      grp.add(g);
      // uç yuvarlakları
      for (const sx of [-1, 1]) {
        const cap = new T.Mesh(new T.CircleGeometry(gw / 2, 20), grooveMat);
        cap.rotation.x = -Math.PI / 2;
        cap.position.set(sx * ((model.W - 1) / 2) * SP, TOP + 0.004, g.position.z);
        grp.add(cap);
      }
    }
    for (const c of model.spec.spines) {
      const len = (model.R - 1) * SP;
      const g = new T.Mesh(new T.PlaneGeometry(gw, len), grooveMat);
      g.rotation.x = -Math.PI / 2;
      g.position.set((c - (model.W - 1) / 2) * SP, TOP + 0.004, 0);
      grp.add(g);
    }
    // cep hücreleri: küçük işaret
    const markMat = new T.MeshBasicMaterial({ color: col(theme.rim) });
    for (let i = 0; i < model.N; i++) {
      if (model.cellType[i] !== 'pocket') continue;
      const m = new T.Mesh(new T.RingGeometry(0.42, 0.47, 32), markMat);
      m.rotation.x = -Math.PI / 2;
      const p = cellLocal(model, i); m.position.set(p.x, TOP + 0.006, p.z);
      grp.add(m);
    }
    // tıklama alanları
    const hits = [];
    const hitGeo = new T.PlaneGeometry(SP * 0.98, SP * 0.98);
    hitGeo.rotateX(-Math.PI / 2);
    const hitMat = new T.MeshBasicMaterial({ visible: false });
    for (let i = 0; i < model.N; i++) {
      const h = new T.Mesh(hitGeo, hitMat);
      const p = cellLocal(model, i); h.position.set(p.x, TOP + 0.02, p.z);
      h.userData.cell = i;
      grp.add(h); hits.push(h);
    }
    // seçim halkaları
    const rings = new T.Group(); grp.add(rings);
    const hover = new T.Mesh(new T.RingGeometry(0.44, 0.5, 40), new T.MeshBasicMaterial({ color: col(theme.outline), transparent: true, opacity: 0.35 }));
    hover.rotation.x = -Math.PI / 2; hover.visible = false; grp.add(hover);

    return { key, model, group: grp, hits, rings, hover, pegs: new Map(), state: null, queue: [], busy: false, selected: -1, w, d };
  }

  function placePegs(B, state) {
    for (const m of B.pegs.values()) B.group.remove(m);
    B.pegs.clear();
    state.forEach((v, i) => {
      if (v < 0) return;
      const m = makePeg(v);
      m.position.copy(cellLocal(B.model, i));
      m.userData.cell = i;
      B.group.add(m); B.pegs.set(i, m);
    });
    B.state = state.slice();
  }

  /* ---------- kart ---------- */
  function buildCard(card, doubleSided) {
    const grp = new T.Group();
    const aspect = RKTheme.cardAspect(card);
    const h = 2.5, w = h * aspect;
    const cvs = document.createElement('canvas');
    cvs.width = 512; cvs.height = Math.round(512 / aspect);
    RKTheme.drawCard(cvs.getContext('2d'), card, theme, { w: cvs.width, h: cvs.height, symbols });
    const tex = new T.CanvasTexture(cvs);
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const mat = new T.MeshBasicMaterial({ map: tex, transparent: true });
    const front = new T.Mesh(new T.PlaneGeometry(w, h), mat);
    front.position.y = h / 2 + 0.22;
    grp.add(front);
    if (doubleSided) {
      const back = front.clone(); back.rotation.y = Math.PI; back.position.z = -0.012;
      grp.add(back);
    } else {
      const back = new T.Mesh(new T.PlaneGeometry(w * 0.9, h * 0.94), new T.MeshBasicMaterial({ color: col(theme.cardInk) }));
      back.rotation.y = Math.PI; back.position.set(0, h / 2 + 0.22, -0.01);
      grp.add(back);
    }
    // tutucu blok
    const holder = new T.Mesh(slabGeo(w * 0.62, 0.34, 0.3, 0.1, 0.04), toon(theme.holder));
    holder.castShadow = true;
    grp.add(holder);
    const ho = new T.Mesh(slabGeo(w * 0.62 + 0.07, 0.41, 0.33, 0.12, 0.05), outlineMat());
    ho.position.y = -0.02; grp.add(ho);
    grp.userData = { w, h };
    return grp;
  }

  /* ---------- sahne ---------- */
  S.init = function (el) {
    container = el;
    renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(36, 1, 0.1, 200);
    raycaster = new T.Raycaster();
    gradientMap = makeGradient();
    buildPegGeo();

    const hemi = new T.HemisphereLight(0xffffff, 0xd8cbb5, 0.42);
    scene.add(hemi);
    const sun = new T.DirectionalLight(0xffffff, 0.62);
    sun.position.set(-6, 14, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -12; sc.right = 12; sc.top = 12; sc.bottom = -12; sc.near = 1; sc.far = 40;
    sun.shadow.radius = 4;
    sun.shadow.bias = -0.0008;
    scene.add(sun);
    S._hemi = hemi;

    floor = new T.Mesh(new T.PlaneGeometry(200, 200), new T.ShadowMaterial({ opacity: 0.16 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    scene.add(floor);

    world = new T.Group(); scene.add(world);

    const ro = new ResizeObserver(resize); ro.observe(el);
    resize();
    bindPointer();
    requestAnimationFrame(loop);
  };

  function resize() {
    const w = container.clientWidth || window.innerWidth, h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
    camera.aspect = w / h;
    if (inset && (inset.l || inset.b)) camera.setViewOffset(w, h, -inset.l / 2, inset.b * 0.42, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    computeCamera(true);
  }

  S.setTheme = function (t) {
    theme = t;
    scene.background = col(t.bg);
    if (S._hemi) S._hemi.groundColor = col(t.floor);
    floor.material.opacity = t.ui.dark ? 0.32 : 0.16;
  };
  S.setSymbols = (v) => { symbols = !!v; };
  S.setSpeed = (v) => { speed = v; };
  S.onCell = (fn) => { cellHandler = fn; };

  /* Sahneyi kur: cfg = { mode: 'menu'|'solo'|'vs', card, me, opp } */
  let lastCfg = null;
  S.setup = function (cfg) {
    lastCfg = cfg;
    for (const k of Object.keys(boards)) delete boards[k];
    while (world.children.length) world.remove(world.children[0]);
    while (confetti.length) scene.remove(confetti.pop());
    tweens.length = 0;
    cardObj = null;
    mode = cfg.mode;
    const model = cfg.card.board;
    const me = buildBoard(model, 'me');
    boards.me = me; world.add(me.group);
    placePegs(me, cfg.me);
    if (cfg.mode === 'vs') {
      const opp = buildBoard(model, 'opp');
      boards.opp = opp; world.add(opp.group);
      placePegs(opp, cfg.opp);
      const gap = 1.6;
      me.group.position.z = me.d / 2 + gap;
      opp.group.position.z = -(opp.d / 2 + gap);
      opp.group.rotation.y = Math.PI;
      cardObj = buildCard(cfg.card, true);
      cardObj.position.set(0, 0, 0);
      world.add(cardObj);
    } else {
      me.group.position.set(0, 0, 0);
      cardObj = buildCard(cfg.card, false);
      cardObj.position.set(0, 0, -(me.d / 2) - 0.55);
      cardObj.rotation.x = -0.12;
      world.add(cardObj);
      if (cfg.mode === 'menu') cardObj.visible = false;
    }
    computeCamera(true);
  };
  S.rebuild = function () {
    if (!lastCfg) return;
    const cfg = Object.assign({}, lastCfg);
    if (boards.me) cfg.me = boards.me.state;
    if (boards.opp) cfg.opp = boards.opp.state;
    S.setup(cfg);
  };

  /* ---------- kamera ----------
     Temel kadraj moda göre otomatik hesaplanır; oyuncu bunun üstüne
     döndürme (az), eğim (tilt), yakınlaştırma (zoom) ve kaydırma (pan) ekler. */
  let inset = { l: 0, b: 0 };
  const user = { az: 0, tilt: 0, zoom: 1, pan: new T.Vector3() };
  const userCur = { az: 0, tilt: 0, zoom: 1, pan: new T.Vector3() };
  let locked = false;
  let camChange = null;
  const ELEV_MIN = T.MathUtils.degToRad(16), ELEV_MAX = T.MathUtils.degToRad(88);
  S.setInset = function (l, b) { inset = { l, b }; resize(); };
  S.setView = (v) => { view = v; user.tilt = 0; computeCamera(false); };
  S.getView = () => view;
  S.onCamChange = (fn) => { camChange = fn; };
  const fireCam = () => { if (camChange) camChange(S.getCam()); };
  S.getCam = () => ({ az: user.az, tilt: user.tilt, zoom: user.zoom, px: user.pan.x, pz: user.pan.z });
  S.setCam = function (c, instant) {
    if (!c) return;
    user.az = +c.az || 0; user.tilt = +c.tilt || 0; user.zoom = +c.zoom || 1;
    user.pan.set(+c.px || 0, 0, +c.pz || 0);
    if (instant) { userCur.az = user.az; userCur.tilt = user.tilt; userCur.zoom = user.zoom; userCur.pan.copy(user.pan); }
    computeCamera(false);
  };
  S.rotateBy = function (rad) { if (locked) return; user.az += rad; computeCamera(false); fireCam(); };
  S.zoomBy = function (f) { if (locked) return; user.zoom = T.MathUtils.clamp(user.zoom * f, 0.45, 2.2); fireCam(); };
  S.resetCam = function () { user.az = 0; user.tilt = 0; user.zoom = 1; user.pan.set(0, 0, 0); computeCamera(false); fireCam(); };
  S.setLocked = (v) => { locked = !!v; };
  S.isLocked = () => locked;

  function computeCamera(instant) {
    if (!boards.me) return;
    const me = boards.me;
    const cw = container.clientWidth || 1, ch = container.clientHeight || 1;
    const aspect = Math.max(0.3, (cw - inset.l) / Math.max(1, ch - inset.b * 0.84));
    const vfull = T.MathUtils.degToRad(camera.fov);
    const vf = 2 * Math.atan(Math.tan(vfull / 2) * Math.max(0.2, (ch - inset.b * 0.84) / ch));
    const hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
    const top = view === 'top' && mode !== 'menu';
    let target, halfW, halfD, elev;
    if (mode === 'vs') {
      const span = me.group.position.z + me.d / 2 + 0.3; // kartın ortasından oyuncunun kenarına
      target = new T.Vector3(0, 0.5, me.group.position.z * (aspect < 0.8 ? 0.62 : 0.4));
      halfW = me.w / 2 + 0.3;
      halfD = span * (aspect < 0.8 ? 0.62 : 0.78);
      elev = top ? 88 : 50;
    } else if (mode === 'menu') {
      target = new T.Vector3(0, 0.3, 0);
      halfW = me.w / 2 + 1.2; halfD = me.d / 2 + 1.2;
      elev = 42;
    } else {
      const cz = cardObj ? cardObj.position.z : 0;
      target = new T.Vector3(0, 0.6, (cz + me.d / 2) / 2 + (top ? 0.1 : 0.35));
      halfW = me.w / 2 + 0.25; halfD = (me.d / 2 - cz) / 2 + 0.5;
      elev = top ? 88 : 52;
    }
    // döndürülmüş tablayı da sığdır; yan/ters bakarken kendi tablan ortada kalsın
    if (mode !== 'menu') {
      const center = new T.Vector3(0, target.y, me.group.position.z);
      const f = Math.max(0, Math.cos(user.az));
      target = center.clone().lerp(target, f);
      if (mode === 'vs' && f < 0.99) { halfW = me.w / 2 + 0.4; halfD = halfD * f + (me.d / 2 + 0.4) * (1 - f); }
      const c = Math.abs(Math.cos(user.az)), sn = Math.abs(Math.sin(user.az));
      const w2 = c * halfW + sn * halfD, d2 = sn * halfW + c * halfD;
      halfW = w2; halfD = d2;
    }
    const portrait = aspect < 0.8;
    if (portrait && mode !== 'menu' && !top) elev += 10;
    const e = T.MathUtils.degToRad(elev);
    const projD = halfD * Math.sin(e) + (top ? 0.3 : 1.4) * Math.cos(e); // derinlik izdüşümü (+ kart yüksekliği)
    const distV = projD / Math.tan(vf / 2) + halfD * Math.cos(e);
    const distH = halfW / Math.tan(hf / 2) + halfD * Math.cos(e) * (portrait ? 0.35 : 0.6);
    let dist = Math.max(distV, distH) * (portrait ? 1.04 : 1.08);
    if (mode !== 'menu' && !portrait) dist *= 1.06; // arayüz çubukları için pay
    if (top) dist *= 1.04;
    camGoal = { target, dist, elev: e };
    if (instant || !camCur) camCur = { target: target.clone(), dist, elev: e };
  }
  function applyCamera(dt) {
    if (!camGoal) return;
    const k = 1 - Math.pow(0.002, dt);
    const ku = 1 - Math.pow(0.00002, dt); // oyuncu hareketleri daha çabuk takip edilir
    camCur.target.lerp(camGoal.target, k);
    camCur.dist += (camGoal.dist - camCur.dist) * k;
    camCur.elev += (camGoal.elev - camCur.elev) * k;
    const game = mode !== 'menu';
    // eğim sınırları
    user.tilt = T.MathUtils.clamp(user.tilt, ELEV_MIN - camGoal.elev, ELEV_MAX - camGoal.elev);
    userCur.az += (user.az - userCur.az) * ku;
    userCur.tilt += (user.tilt - userCur.tilt) * ku;
    userCur.zoom += (user.zoom - userCur.zoom) * ku;
    userCur.pan.lerp(user.pan, ku);
    let az = 0;
    if (!game) { orbit += dt * 0.12; az = Math.sin(orbit) * 0.55; }
    else az = userCur.az + (locked || view === 'top' ? 0 : Math.sin(performance.now() / 4000) * 0.015);
    const elev = T.MathUtils.clamp(camCur.elev + (game ? userCur.tilt : 0), ELEV_MIN, ELEV_MAX);
    const d = camCur.dist * (game ? userCur.zoom : 1);
    const tgt = camCur.target.clone();
    if (game) tgt.add(userCur.pan);
    const x = Math.sin(az) * Math.cos(elev) * d;
    const z = Math.cos(az) * Math.cos(elev) * d;
    const y = Math.sin(elev) * d;
    camera.position.set(tgt.x + x, tgt.y + y, tgt.z + z);
    if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; shake *= 0.86; if (shake < 0.002) shake = 0; }
    camera.lookAt(tgt);
  }

  /* ---------- etkileşim ---------- */
  function pick(ev) {
    const B = boards.me;
    if (!B || mode === 'menu') return -1;
    const rect = renderer.domElement.getBoundingClientRect();
    const p = new T.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(p, camera);
    const objs = [...B.pegs.values()].map((g) => g.children[0]).concat(B.hits);
    const hit = raycaster.intersectObjects(objs, false)[0];
    if (!hit) return -1;
    const o = hit.object;
    if (o.userData.cell !== undefined) return o.userData.cell;
    return o.parent.userData.cell;
  }
  function panBy(dx, dy) {
    const a = userCur.az;
    // ekranda parmak ne kadar giderse tabla da o kadar gitsin
    const s = (2 * camCur.dist * userCur.zoom * Math.tan(T.MathUtils.degToRad(camera.fov) / 2)) / (container.clientHeight || 800);
    const right = new T.Vector3(Math.cos(a), 0, -Math.sin(a));
    const fwd = new T.Vector3(-Math.sin(a), 0, -Math.cos(a));
    user.pan.addScaledVector(right, -dx * s).addScaledVector(fwd, dy * s);
    user.pan.clampLength(0, 7);
  }
  function bindPointer() {
    const el = renderer.domElement;
    const pts = new Map();
    let g = null; // { kind: 'cell'|'orbit'|'pan'|'pinch', ... }
    const camOK = () => mode !== 'menu' && !locked;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* */ }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [p1, p2] = [...pts.values()];
        g = { kind: 'pinch', d0: Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1, z0: user.zoom, mx: (p1.x + p2.x) / 2, my: (p1.y + p2.y) / 2 };
        return;
      }
      if (pts.size > 2) return;
      const cell = pick(e);
      let kind = 'orbit';
      if (e.button === 2 || e.button === 1 || (e.button === 0 && e.shiftKey)) kind = 'pan';
      else if (cell >= 0) kind = 'cell';
      g = { kind, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, cell, moved: 0 };
    });
    el.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (p) { p.x = e.clientX; p.y = e.clientY; }
      if (g && g.kind === 'pinch' && pts.size === 2) {
        const [p1, p2] = [...pts.values()];
        const d = Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1;
        const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
        if (camOK()) {
          user.zoom = T.MathUtils.clamp(g.z0 * (g.d0 / d), 0.45, 2.2);
          panBy(mx - g.mx, my - g.my);
        }
        g.mx = mx; g.my = my;
        return;
      }
      if (g && p && (g.kind === 'orbit' || g.kind === 'pan')) {
        const dx = e.clientX - g.x, dy = e.clientY - g.y;
        g.x = e.clientX; g.y = e.clientY;
        g.moved = Math.max(g.moved, Math.hypot(e.clientX - g.x0, e.clientY - g.y0));
        if (camOK() && g.moved > 4) {
          if (g.kind === 'orbit') { user.az -= dx * 0.008; user.tilt += dy * 0.005; }
          else panBy(dx, dy);
        }
        return;
      }
      if (e.pointerType !== 'mouse' || e.buttons) return;
      const c = pick(e);
      if (c !== hoverCell) {
        hoverCell = c;
        const B = boards.me;
        if (!B) return;
        if (c >= 0) { const q = cellLocal(B.model, c); B.hover.position.set(q.x, TOP + 0.01, q.z); B.hover.visible = true; el.style.cursor = 'pointer'; }
        else { B.hover.visible = false; el.style.cursor = locked ? '' : 'grab'; }
      }
    });
    const end = (e) => {
      const had = pts.delete(e.pointerId);
      if (!had || !g) return;
      if (g.kind === 'pinch') { if (pts.size === 0) { g = null; fireCam(); } return; }
      if (pts.size) return;
      const moved = Math.hypot(e.clientX - g.x0, e.clientY - g.y0);
      if (g.kind === 'cell' && cellHandler && e.type === 'pointerup') {
        const cell = pick(e);
        if (moved > 18 && cell >= 0 && cell !== g.cell) { cellHandler(g.cell, 'dragstart'); cellHandler(cell, 'drop'); }
        else if (moved <= 18) cellHandler(g.cell, 'tap');
      } else if (g.kind === 'orbit' && moved < 8 && cellHandler && e.type === 'pointerup') {
        cellHandler(-1, 'tap');
      } else if (moved >= 8) fireCam();
      g = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!camOK()) return;
      if (e.ctrlKey) user.zoom *= Math.exp(e.deltaY * 0.01); // dokunmatik yüzey çimdik
      else user.zoom *= Math.exp(e.deltaY * 0.0012);
      user.zoom = T.MathUtils.clamp(user.zoom, 0.45, 2.2);
      clearTimeout(el._wt); el._wt = setTimeout(fireCam, 300);
    }, { passive: false });
    el.addEventListener('pointerleave', () => { if (boards.me) boards.me.hover.visible = false; hoverCell = -1; });
  }

  /* ---------- seçim ve ipucu ---------- */
  S.select = function (cell, targets) {
    const B = boards.me; if (!B) return;
    S.clearSelect();
    B.selected = cell;
    const peg = B.pegs.get(cell);
    if (peg) tween({ dur: 0.16, update: (t) => { peg.position.y = PEG_Y + 0.32 * ease.back(t); } });
    const color = peg ? theme.pegs[peg.userData.color] : theme.outline;
    targets.forEach((i, k) => {
      const ring = new T.Mesh(new T.RingGeometry(0.2, 0.33, 32), new T.MeshBasicMaterial({ color: col(color), transparent: true, opacity: 0.95 }));
      ring.rotation.x = -Math.PI / 2;
      const p = cellLocal(B.model, i); ring.position.set(p.x, TOP + 0.012, p.z);
      ring.userData.phase = k * 0.35;
      ring.scale.setScalar(0.01);
      tween({ dur: 0.22, delay: k * 0.02, update: (t) => ring.scale.setScalar(ease.back(t)) });
      const dot = new T.Mesh(new T.CircleGeometry(0.1, 20), new T.MeshBasicMaterial({ color: col(theme.outline) }));
      dot.rotation.x = -Math.PI / 2; dot.position.set(p.x, TOP + 0.011, p.z);
      B.rings.add(ring); B.rings.add(dot);
    });
  };
  S.clearSelect = function (keepPeg) {
    const B = boards.me; if (!B) return;
    if (B.selected >= 0 && !keepPeg) {
      const peg = B.pegs.get(B.selected);
      if (peg) { const y0 = peg.position.y; tween({ dur: 0.14, update: (t) => { peg.position.y = y0 + (PEG_Y - y0) * ease.out(t); } }); }
    }
    B.selected = -1;
    while (B.rings.children.length) B.rings.remove(B.rings.children[0]);
  };
  S.hint = function (from, to) {
    const B = boards.me; if (!B) return;
    const mk = (i, r0, r1) => {
      const m = new T.Mesh(new T.RingGeometry(r0, r1, 40), new T.MeshBasicMaterial({ color: col(theme.outline), transparent: true }));
      m.rotation.x = -Math.PI / 2;
      const p = cellLocal(B.model, i); m.position.set(p.x, TOP + 0.36, p.z);
      B.group.add(m);
      tween({ dur: 2.4, update: (t) => { m.material.opacity = 0.9 * (1 - t) * (0.6 + 0.4 * Math.sin(t * 30)); m.scale.setScalar(1 + 0.15 * Math.sin(t * 15)); }, done: () => B.group.remove(m) });
    };
    mk(from, 0.46, 0.56); mk(to, 0.3, 0.42);
    const peg = B.pegs.get(from);
    if (peg) tween({ dur: 0.6, update: (t) => { peg.position.y = PEG_Y + Math.abs(Math.sin(t * Math.PI * 2)) * 0.35 * (1 - t); } });
  };

  /* ---------- hamle animasyonu ---------- */
  S.move = function (key, from, to, path, cb, silent) {
    const B = boards[key]; if (!B) return;
    B.queue.push({ from, to, path, cb, silent });
    if (!B.busy) runQueue(B);
  };
  function runQueue(B) {
    const job = B.queue.shift();
    if (!job) { B.busy = false; return; }
    B.busy = true;
    const peg = B.pegs.get(job.from);
    if (!peg) { B.busy = false; runQueue(B); return; }
    B.pegs.delete(job.from); B.pegs.set(job.to, peg); peg.userData.cell = job.to;
    B.state[job.to] = B.state[job.from]; B.state[job.from] = -1;
    if (document.hidden || S.instant) { // sekme arka plandaysa anında yerleştir
      peg.position.copy(cellLocal(B.model, job.to)); peg.scale.set(1, 1, 1);
      if (job.cb) job.cb();
      runQueue(B); return;
    }
    const pts = job.path.map((i) => cellLocal(B.model, i));
    const lift = 0.32;
    const y0 = peg.position.y;
    const fast = B.queue.length > 0 ? 0.55 : 1;
    const seg = (0.075 / speed) * fast;
    tween({
      dur: (0.09 / speed) * fast,
      update: (t) => { peg.position.y = y0 + (PEG_Y + lift - y0) * ease.out(t); },
      done: () => {
        let k = 0;
        const next = () => {
          if (k >= pts.length - 1) {
            tween({
              dur: 0.16 / speed * fast,
              update: (t) => {
                peg.position.y = PEG_Y + lift * (1 - ease.out(t));
                const sq = t > 0.7 ? Math.sin((t - 0.7) / 0.3 * Math.PI) * 0.12 : 0;
                peg.scale.set(1 + sq, 1 - sq, 1 + sq);
              },
              done: () => { peg.scale.set(1, 1, 1); if (job.cb) job.cb(); runQueue(B); },
            });
            if (window.RKAudio && !job.silent) RKAudio.play('tok', B.key === 'opp' ? 0.45 : 1);
            return;
          }
          const a = pts[k], b = pts[k + 1];
          k++;
          tween({
            dur: seg,
            update: (t) => { peg.position.x = a.x + (b.x - a.x) * t; peg.position.z = a.z + (b.z - a.z) * t; },
            done: next,
          });
        };
        if (window.RKAudio && B.key === 'me' && !job.silent) RKAudio.play('slide');
        next();
      },
    });
  }
  S.isBusy = (key) => !!(boards[key] && (boards[key].busy || boards[key].queue.length));
  S.setState = function (key, state) { const B = boards[key]; if (!B) return; B.queue.length = 0; B.busy = false; placePegs(B, state); };
  S.bump = () => { shake = 0.06; };

  /* ---------- kutlama ---------- */
  S.celebrate = function (key) {
    const B = boards[key]; if (!B) return;
    for (const [i, peg] of B.pegs) {
      const c = i % B.model.W, r = Math.floor(i / B.model.W);
      tween({ dur: 0.5, delay: (c + r) * 0.06, update: (t) => { peg.position.y = PEG_Y + Math.sin(t * Math.PI) * 0.8; peg.rotation.x = t * Math.PI * 2; }, done: () => { peg.rotation.x = 0; peg.position.y = PEG_Y; } });
    }
    const geo = new T.CylinderGeometry(0.11, 0.11, 0.03, 12);
    const origin = new T.Vector3(); B.group.getWorldPosition(origin);
    for (let k = 0; k < 90; k++) {
      const m = new T.Mesh(geo, toon(theme.pegs[k % theme.pegs.length]));
      m.position.set(origin.x + (Math.random() - 0.5) * B.w, 3 + Math.random() * 3, origin.z + (Math.random() - 0.5) * B.d);
      m.userData.v = new T.Vector3((Math.random() - 0.5) * 2, Math.random() * 3, (Math.random() - 0.5) * 2);
      m.userData.r = new T.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8);
      m.userData.life = 3.5;
      scene.add(m); confetti.push(m);
    }
  };

  /* ---------- döngü ---------- */
  function loop(now) {
    const raw = (now - lastT) / 1000;
    const dt = Math.min(0.05, raw);
    const tdt = Math.min(0.5, raw); // animasyonlar yavaş karelerde de zamanında biter
    lastT = now;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      if (tw.delay > 0) { tw.delay -= tdt; continue; }
      tw.t = Math.min(1, tw.t + tdt / tw.dur);
      tw.update(tw.t);
      if (tw.t >= 1) { tweens.splice(i, 1); if (tw.done) tw.done(); }
    }
    // seçili taş hafifçe salınır, halkalar nabız atar
    const B = boards.me;
    if (B) {
      if (B.selected >= 0) {
        const peg = B.pegs.get(B.selected);
        if (peg && !B.busy) peg.rotation.y = Math.sin(now / 300) * 0.15;
      }
      B.rings.children.forEach((r) => { if (r.userData.phase !== undefined && r.scale.x >= 0.99) { const s = 1 + 0.08 * Math.sin(now / 180 + r.userData.phase); r.scale.set(s, s, s); } });
    }
    for (let i = confetti.length - 1; i >= 0; i--) {
      const m = confetti[i]; const u = m.userData;
      u.v.y -= 9.8 * dt * 0.5; u.v.multiplyScalar(0.995);
      m.position.addScaledVector(u.v, dt);
      if (m.position.y < TOP + 0.05) { m.position.y = TOP + 0.05; u.v.y *= -0.3; u.v.x *= 0.7; u.v.z *= 0.7; }
      m.rotation.x += u.r.x * dt; m.rotation.y += u.r.y * dt;
      u.life -= dt;
      if (u.life < 0) { scene.remove(m); confetti.splice(i, 1); }
    }
    applyCamera(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  window.RKScene = S;
})();
