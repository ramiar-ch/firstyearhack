// 简易静态服务器：node serve.js  然后打开 http://localhost:8080
const http = require('http');
const fs = require('fs');
const path = require('path');
const relay = require('./relay.js'); // game addition: phone controller messages (/api/...)

const root = __dirname;
const port = Number(process.env.PORT) || 8080;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    res.writeHead(400);
    return res.end('Invalid URL');
  }
  const file = path.resolve(root, urlPath.slice(1) || 'index.html');
  if (!file.startsWith(root + path.sep) || file.includes('\0')) {
    res.writeHead(403);
    return res.end();
  }
  if (urlPath.startsWith('/api/') && relay.handle(req, res, port)) return;
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, () => console.log(`Strand City Viewer: http://localhost:${port}`));
