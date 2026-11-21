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
};

http.createServer((req, res) => {
  if (relay.handle(req, res, port)) return; // game addition
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  // game addition: never serve hidden files like .env (it holds the Snowflake token!)
  if (urlPath.split('/').some((part) => part.startsWith('.'))) { res.writeHead(403); return res.end(); }
  let file = path.normalize(path.join(root, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, () => console.log(`溪谷村已启动: http://localhost:${port}`));
