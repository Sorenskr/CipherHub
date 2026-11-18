'use strict';
/**
 * CipherHub · 暗号查询中心 —— 轻量零依赖静态 HTTP 服务
 * 本地双击 start.bat 或运行 `node main.js` 即可启动（默认端口 3000）
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT_DIR = path.resolve(__dirname);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp'
};

function sendJson(res, status, data) {
  const body = Buffer.from(JSON.stringify(data), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function handler(req, res) {
  const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(reqUrl.pathname);

  if (pathname === '/api/health' || pathname === '/api/stats') {
    return sendJson(res, 200, { ok: true, status: 'online' });
  }

  if (pathname === '/' || pathname === '') {
    pathname = '/index.html';
  }

  const isAllowed =
    pathname === '/index.html' ||
    pathname.startsWith('/css/') ||
    pathname.startsWith('/js/');

  if (!isAllowed) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>404</h1><p><a href="/">返回首页</a></p>');
    return;
  }

  const filePath = path.resolve(ROOT_DIR, pathname.replace(/^\/+/, ''));
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404</h1><p><a href="/">返回首页</a></p>');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': ext === '.html' ? 'no-cache, no-store, must-revalidate' : 'public, max-age=300'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

if (require.main === module) {
  const server = http.createServer(handler);
  server.listen(PORT, HOST, () => {
    console.log(`✅ 暗号查询中心已启动：http://127.0.0.1:${PORT}/`);
  });
}

module.exports = handler;
module.exports.handler = handler;
