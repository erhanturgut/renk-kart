/* Online oyun: PeerJS ile tarayıcıdan tarayıcıya (oda kodu). Sunucu kurmak gerekmez. */
(function () {
  'use strict';
  const PREFIX = 'renkkart-v1-';
  const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let peer = null, conn = null, handler = () => {}, role = null;

  const code = () => Array.from({ length: 5 }, () => ALPH[Math.floor(Math.random() * ALPH.length)]).join('');

  function wire(c) {
    conn = c;
    c.on('open', () => handler({ type: 'connected' }));
    c.on('data', (d) => { try { handler({ type: 'data', data: typeof d === 'string' ? JSON.parse(d) : d }); } catch (e) { /* yok say */ } });
    c.on('close', () => { if (conn === c) { conn = null; handler({ type: 'closed' }); } });
    c.on('error', (e) => handler({ type: 'error', message: String(e && e.message || e) }));
  }

  const NET = {
    available: () => typeof window.Peer === 'function',
    get role() { return role; },
    get connected() { return !!(conn && conn.open); },
    on(fn) { handler = fn; },
    host(tries) {
      NET.close();
      role = 'host';
      const c = code();
      peer = new window.Peer(PREFIX + c, { debug: 0 });
      peer.on('open', () => handler({ type: 'room', code: c }));
      peer.on('connection', (cn) => {
        if (conn && conn.open) { cn.on('open', () => { cn.send(JSON.stringify({ t: 'full' })); setTimeout(() => cn.close(), 300); }); return; }
        wire(cn);
      });
      peer.on('error', (e) => {
        if (e && e.type === 'unavailable-id' && (tries || 0) < 4) return NET.host((tries || 0) + 1);
        handler({ type: 'error', message: errText(e) });
      });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* */ } });
    },
    join(roomCode) {
      NET.close();
      role = 'guest';
      peer = new window.Peer({ debug: 0 });
      peer.on('open', () => {
        const c = peer.connect(PREFIX + roomCode.toUpperCase().trim(), { reliable: true });
        wire(c);
      });
      peer.on('error', (e) => handler({ type: 'error', message: errText(e) }));
    },
    send(obj) { if (conn && conn.open) conn.send(JSON.stringify(obj)); },
    close() {
      try { if (conn) conn.close(); } catch (e) { /* */ }
      try { if (peer) peer.destroy(); } catch (e) { /* */ }
      conn = null; peer = null; role = null;
    },
  };
  function errText(e) {
    const t = e && e.type;
    if (t === 'peer-unavailable') return 'Bu kodla açık bir oda bulunamadı.';
    if (t === 'network' || t === 'server-error' || t === 'socket-error') return 'Bağlantı sunucusuna ulaşılamadı. İnternetini kontrol et.';
    if (t === 'browser-incompatible') return 'Tarayıcın bu özelliği desteklemiyor.';
    return 'Bağlantı hatası' + (t ? ' (' + t + ')' : '');
  }
  window.RKNet = NET;
})();
