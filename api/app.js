/**
 * Vercel Serverless 入口
 * vercel.json 把所有请求 rewrite 到这里，req/res 就是标准 Node http 对象，
 * 因此可以直接复用 server.js 里的 requestListener。
 */
const store = require('../lib/store');

let handler = null;
let bootError = null;
try {
  handler = require('../server').handler;
} catch (e) {
  bootError = e;
  console.error('[boot] 加载 server.js 失败:', (e && e.stack) || e);
}

let ready = null;

// 兼容不同平台可能把 URL 改写成函数自身路径的情况
function normalizeUrl(url) {
  if (!url) return '/';
  const i = url.indexOf('?');
  const path = i < 0 ? url : url.slice(0, i);
  const qs = i < 0 ? '' : url.slice(i);
  if (path === '/api/app' || path === '/api/app/' || path === '/api/app.js') return '/' + qs;
  return url;
}

module.exports = function (req, res) {
  if (bootError) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('BOOT ERROR\n' + ((bootError && bootError.stack) || bootError));
  }
  try {
    req.url = normalizeUrl(req.url);
  } catch (e) { /* ignore */ }

  if (!ready) ready = store.init();
  ready
    .then(() => handler(req, res))
    .catch((e) => {
      console.error('[invoke] 处理请求失败:', (e && e.stack) || e);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: e.message || 'server error' }));
      }
    });
};
