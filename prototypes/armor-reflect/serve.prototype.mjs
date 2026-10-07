// PROTOTYPE — disposable. Run from the repo root: node prototypes/armor-reflect/serve.prototype.mjs
// Injects the armor-reflect variants into the real classifier page; index.html and js/ stay intact.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const port = Number(process.env.PROTOTYPE_PORT || 4188);
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  const ext = path.extname(file);
  res.setHeader('Content-Type', ({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.txt':'text/plain; charset=utf-8'})[ext] || 'application/octet-stream');
  if (file === path.join(root, 'index.html')) {
    const html = fs.readFileSync(file, 'utf8')
      .replace('</head>', '<link rel="stylesheet" href="/prototypes/armor-reflect/style.prototype.css"></head>')
      .replace('</body>', '<script src="/prototypes/armor-reflect/variants.prototype.js"></script></body>');
    res.end(html);
  } else fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`Prototype: http://localhost:${port}/?variant=A&sample=tom`));
