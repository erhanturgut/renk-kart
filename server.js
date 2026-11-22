// Basit yerel sunucu: node server.js  →  http://localhost:5178
const http = require('http'), fs = require('fs'), path = require('path');
const root = __dirname, port = process.env.PORT || 5178;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(root, path.normalize(p));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Bulunamadı'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});
// Port doluysa sıradaki boş porta geç
let tryPort = +port;
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE' && tryPort < +port + 20) {
    console.log(`Port ${tryPort} dolu, ${tryPort + 1} deneniyor…`);
    server.listen(++tryPort);
  } else throw e;
});
server.on('listening', () => console.log('Renk Kart: http://localhost:' + tryPort));
server.listen(tryPort);
