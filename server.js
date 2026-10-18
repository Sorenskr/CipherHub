'use strict';
/**
 * 暗号查询中心 —— 零依赖 Node HTTP 服务
 * 启动: node server.js    (默认端口 3000，可用 PORT 环境变量覆盖)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const store = require('./lib/store');
const db = store.load();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_COOKIE = 'ch_sid';
const sessions = new Map();
const loginAttempts = new Map();

/* ---------------- 工具 ---------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function sendJson(res, code, data) {
  const body = Buffer.from(JSON.stringify(data), 'utf8');
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendError(res, code, msg) {
  sendJson(res, code, { error: msg || 'error' });
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const max = limit || 8 * 1024 * 1024;
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > max) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error('JSON 解析失败'));
      }
    });
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const out = {};
  const h = req.headers.cookie || '';
  h.split(';').forEach((kv) => {
    const i = kv.indexOf('=');
    if (i < 0) return;
    out[kv.slice(0, i).trim()] = decodeURIComponent(kv.slice(i + 1).trim());
  });
  return out;
}

function newSession(user) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { user, exp: Date.now() + 12 * 3600 * 1000 });
  return token;
}

function currentUser(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (s.exp < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return s.user;
}

function requireAuth(req, res) {
  const u = currentUser(req);
  if (!u) {
    sendError(res, 401, '未登录或登录已过期');
    return null;
  }
  return u;
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel === '/admin' || rel === '/admin/') rel = '/admin.html';
  const filePath = path.join(PUBLIC_DIR, rel.replace(/^\/+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404</h1><p><a href="/">返回首页</a></p>');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const etag = `W/"${st.size}-${st.mtimeMs.toString(36)}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304).end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': st.size,
      ETag: etag,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=600',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

/* ---------------- 路由 ---------------- */

const routes = {
  // 公开
  'GET /api/bootstrap': (req, res, q) => {
    sendJson(res, 200, {
      settings: {
        siteName: db.settings.siteName,
        subtitle: db.settings.subtitle,
        logos: db.settings.logos,
        feedback: db.settings.feedback,
        contacts: db.settings.contacts,
      },
      platforms: db.platforms.slice().sort((a, b) => (a.order || 99) - (b.order || 99)),
      groups: db.groups,
      stats: store.stats(),
    });
  },

  'GET /api/search': (req, res, q) => {
    const data = store.search({
      q: q.get('q') || '',
      platform: q.get('platform') || '',
      group: q.get('group') || '',
      kind: q.get('kind') || '',
      peopleLimit: Math.min(Number(q.get('peopleLimit') || 50), 200),
      entryLimit: Math.min(Number(q.get('entryLimit') || 300), 2000),
    });
    sendJson(res, 200, data);
  },

  'GET /api/person': (req, res, q) => {
    const p = store.getPerson(q.get('id'));
    if (!p) return sendError(res, 404, '成员不存在');
    sendJson(res, 200, p);
  },

  // 随机抽样（脱敏）用于前台速览
  'GET /api/samples': (req, res, q) => {
    sendJson(res, 200, store.samples({
      platform: q.get('platform') || '',
      group: q.get('group') || '',
      n: Math.min(Number(q.get('n') || 14), 60),
    }));
  },

  'GET /api/suggest': (req, res, q) => {
    sendJson(res, 200, store.suggest(q.get('q') || '', 8));
  },

  'GET /api/stats': (req, res) => sendJson(res, 200, store.stats()),

  // 访客提交反馈（公开）
  'POST /api/feedback': async (req, res) => {
    let b;
    try { b = await readBody(req, 64 * 1024); } catch (e) { return sendError(res, 400, e.message); }
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();
    const key = 'fb' + ip;
    const rec = loginAttempts.get(key) || { n: 0, until: 0 };
    if (rec.until > Date.now() && rec.n >= 10) return sendError(res, 429, '提交过于频繁，请稍后再试');
    try {
      const f = store.addFeedback(b);
      rec.n += 1;
      rec.until = Date.now() + 10 * 60 * 1000;
      loginAttempts.set(key, rec);
      sendJson(res, 200, { ok: true, id: f.id });
    } catch (e) { sendError(res, 400, e.message); }
  },

  // 登录
  'POST /api/login': async (req, res) => {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return sendError(res, 400, e.message);
    }
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();
    const rec = loginAttempts.get(ip) || { n: 0, until: 0 };
    if (rec.until > Date.now() && rec.n >= 8) {
      return sendError(res, 429, '尝试过于频繁，请稍后再试');
    }
    const user = String(body.username || '').trim();
    const pass = String(body.password || '');
    if (user !== db.settings.adminUser || !store.verifyPassword(pass)) {
      rec.n += 1;
      rec.until = Date.now() + 5 * 60 * 1000;
      loginAttempts.set(ip, rec);
      return sendError(res, 401, '账号或密码错误');
    }
    loginAttempts.delete(ip);
    const token = newSession(user);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200`,
    });
    res.end(JSON.stringify({ ok: true, user }));
  },

  'POST /api/logout': (req, res) => {
    const token = parseCookies(req)[SESSION_COOKIE];
    if (token) sessions.delete(token);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    });
    res.end(JSON.stringify({ ok: true }));
  },

  'GET /api/me': (req, res) => {
    const u = currentUser(req);
    sendJson(res, 200, { user: u || null });
  },

  // ---- 需要登录 ----
  'GET /api/admin/people': (req, res, q) => {
    if (!requireAuth(req, res)) return;
    sendJson(res, 200, {
      items: store.listPeople({ q: q.get('q') || '', group: q.get('group') || '' }),
      groups: db.groups,
      platforms: db.platforms,
    });
  },

  'POST /api/admin/people': async (req, res) => {
    if (!requireAuth(req, res)) return;
    let b;
    try { b = await readBody(req); } catch (e) { return sendError(res, 400, e.message); }
    try { sendJson(res, 200, store.addPerson(b)); } catch (e) { sendError(res, 400, e.message); }
  },

  'PUT /api/admin/people': async (req, res, q) => {
    if (!requireAuth(req, res)) return;
    let b;
    try { b = await readBody(req); } catch (e) { return sendError(res, 400, e.message); }
    try { sendJson(res, 200, store.updatePerson(q.get('id'), b)); } catch (e) { sendError(res, 400, e.message); }
  },

  'DELETE /api/admin/people': (req, res, q) => {
    if (!requireAuth(req, res)) return;
    try { sendJson(res, 200, store.deletePerson(q.get('id'))); } catch (e) { sendError(res, 400, e.message); }
  },

  'GET /api/admin/entries': (req, res, q) => {
    if (!requireAuth(req, res)) return;
    sendJson(res, 200, {
      items: store.listEntries({
        q: q.get('q') || '',
        platformId: q.get('platform') || '',
        personId: q.get('personId') || '',
        kind: q.get('kind') || '',
        group: q.get('group') || '',
      }),
      total: db.entries.length,
    });
  },

  'POST /api/admin/entries': async (req, res) => {
    if (!requireAuth(req, res)) return;
    let b;
    try { b = await readBody(req); } catch (e) { return sendError(res, 400, e.message); }
    try { sendJson(res, 200, store.addEntry(b)); } catch (e) { sendError(res, 400, e.message); }
  },

  'PUT /api/admin/entries': async (req, res, q) => {
    if (!requireAuth(req, res)) return;
    let b;
    try { b = await readBody(req); } catch (e) { return sendError(res, 400, e.message); }
    try { sendJson(res, 200, store.updateEntry(q.get('id'), b)); } catch (e) { sendError(res, 400, e.message); }
  },

  'DELETE /api/admin/entries': (req, res, q) => {
    if (!requireAuth(req, res)) return;
    try { sendJson(res, 200, { ok: store.deleteEntry(q.get('id')) }); } catch (e) { sendError(res, 400, e.message); }
  },

  'POST /api/admin/bulk': async (req, res) => {
    if (!requireAuth(req, res)) return;
    let b;
    try { b = await readBody(req); } catch (e) { return sendError(res, 400, e.message); }
    try {
      sendJson(res, 200, store.bulkAdd(b.text || '', { platformId: b.platformId, type: b.type, group: b.group }));
    } catch (e) { sendError(res, 400, e.message); }
  },

  'POST /api/admin/platforms': async (req, res) => {
    if (!requireAuth(req, res)) return;
    let b;
    try { b = await readBody(req); } catch (e) { return sendError(res, 400, e.message); }
    try { sendJson(res, 200, store.upsertPlatform(b)); } catch (e) { sendError(res, 400, e.message); }
  },

  'DELETE /api/admin/platforms': (req, res, q) => {
    if (!requireAuth(req, res)) return;
    try { sendJson(res, 200, { ok: store.deletePlatform(q.get('id')) }); } catch (e) { sendError(res, 400, e.message); }
  },

  'GET /api/admin/export': (req, res) => {
    if (!requireAuth(req, res)) return;
    const body = Buffer.from(JSON.stringify(db, null, 1), 'utf8');
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="code-hub-export.json"',
      'Content-Length': body.length,
    });
    res.end(body);
  },

  'POST /api/admin/import': async (req, res) => {
    if (!requireAuth(req, res)) return;
    let b;
    try { b = await readBody(req, 32 * 1024 * 1024); } catch (e) { return sendError(res, 400, e.message); }
    try {
      store.replaceAll(b.data || b);
      sendJson(res, 200, { ok: true, stats: store.stats() });
    } catch (e) { sendError(res, 400, e.message); }
  },

  'POST /api/admin/password': async (req, res) => {
    if (!requireAuth(req, res)) return;
    let b;
    try { b = await readBody(req); } catch (e) { return sendError(res, 400, e.message); }
    if (!store.verifyPassword(String(b.oldPassword || ''))) return sendError(res, 400, '原密码错误');
    const np = String(b.newPassword || '');
    if (np.length < 6) return sendError(res, 400, '新密码至少 6 位');
    store.setPassword(np);
    sendJson(res, 200, { ok: true });
  },

  'POST /api/admin/settings': async (req, res) => {
    if (!requireAuth(req, res)) return;
    let b;
    try { b = await readBody(req); } catch (e) { return sendError(res, 400, e.message); }
    if (b.siteName !== undefined) db.settings.siteName = String(b.siteName).trim() || db.settings.siteName;
    if (b.subtitle !== undefined) db.settings.subtitle = String(b.subtitle).trim();
    if (Array.isArray(b.groups)) db.groups = b.groups.map((g) => String(g).trim()).filter(Boolean);
    if (Array.isArray(b.logos)) {
      const arr = b.logos.map((s) => String(s).trim()).filter(Boolean);
      if (arr.length) db.settings.logos = arr;
    }
    if (b.feedback && typeof b.feedback === 'object') {
      db.settings.feedback = {
        title: String(b.feedback.title || '问题反馈').trim(),
        desc: String(b.feedback.desc || '').trim(),
        enableForm: b.feedback.enableForm !== false,
      };
    }
    if (Array.isArray(b.contacts)) {
      db.settings.contacts = b.contacts
        .map((c) => ({
          id: c.id || 'c' + Math.random().toString(36).slice(2, 8),
          type: String(c.type || '其他').trim(),
          label: String(c.label || '').trim(),
          value: String(c.value || '').trim(),
        }))
        .filter((c) => c.value);
    }
    store.save();
    sendJson(res, 200, { ok: true, settings: db.settings, groups: db.groups });
  },

  'GET /api/admin/feedbacks': (req, res, q) => {
    if (!requireAuth(req, res)) return;
    sendJson(res, 200, {
      items: store.listFeedbacks(q.get('status') || 'all'),
      stats: store.feedbackStats(),
    });
  },

  'PUT /api/admin/feedbacks': async (req, res, q) => {
    if (!requireAuth(req, res)) return;
    let b;
    try { b = await readBody(req); } catch (e) { return sendError(res, 400, e.message); }
    try {
      sendJson(res, 200, store.setFeedbackStatus(q.get('id'), b.status));
    } catch (e) { sendError(res, 400, e.message); }
  },

  'DELETE /api/admin/feedbacks': (req, res, q) => {
    if (!requireAuth(req, res)) return;
    try { sendJson(res, 200, { ok: store.deleteFeedback(q.get('id')) }); } catch (e) { sendError(res, 400, e.message); }
  },

  // 手机访问地址（局域网 IP）
  'GET /api/admin/net': (req, res) => {
    if (!requireAuth(req, res)) return;
    const nets = os.networkInterfaces();
    const addrs = [];
    Object.keys(nets).forEach((k) => {
      (nets[k] || []).forEach((n) => {
        if (n.family === 'IPv4' && !n.internal) addrs.push(n.address);
      });
    });
    sendJson(res, 200, { port: PORT, addresses: addrs });
  },

  'POST /api/admin/backup': (req, res) => {
    if (!requireAuth(req, res)) return;
    try { sendJson(res, 200, { ok: true, file: store.backup() }); } catch (e) { sendError(res, 400, e.message); }
  },
};

/* ---------------- 服务器 ---------------- */

const server = http.createServer((req, res) => {
  let parsed;
  try {
    parsed = new URL(req.url, 'http://localhost');
  } catch (e) {
    return sendError(res, 400, '请求地址非法');
  }
  const pathname = parsed.pathname;
  const query = parsed.searchParams;

  if (!pathname.startsWith('/api/')) {
    return serveStatic(req, res, pathname);
  }

  const method = (req.method || 'GET').toUpperCase();
  let key = `${method} ${pathname}`;
  if (!routes[key]) {
    // 兼容 PUT/DELETE 通过 query ?_method= 传递
    const m = (query.get('_method') || '').toUpperCase();
    if (m && routes[`${m} ${pathname}`]) key = `${m} ${pathname}`;
  }
  const handler = routes[key];
  if (!handler) return sendError(res, 404, '接口不存在');

  Promise.resolve()
    .then(() => handler(req, res, query))
    .catch((e) => {
      console.error('[api error]', key, e);
      if (!res.headersSent) sendError(res, 500, e.message || '服务器错误');
    });
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  ✅  暗号查询中心已启动');
  console.log(`  前台： http://localhost:${PORT}/`);
  console.log(`  后台： http://localhost:${PORT}/admin`);
  console.log(`  数据： ${path.join(__dirname, 'data', 'db.json')}`);
  console.log('');
});

process.on('SIGINT', () => {
  store.saveNow();
  process.exit(0);
});
