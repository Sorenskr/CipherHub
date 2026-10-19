/**
 * Vercel Serverless 入口
 * vercel.json 把所有请求 rewrite 到这里，req/res 就是标准 Node http 对象，
 * 因此可以直接复用 main.js 里的 requestListener。
 */
let store = null;
let handler = null;
let bootError = null;

try {
  store = require('../lib/store');
} catch (e) {
  bootError = e;
  console.error('[boot] 加载 lib/store 失败:', (e && e.stack) || e);
}

try {
  handler = require('../main').handler;
} catch (e) {
  bootError = bootError || e;
  console.error('[boot] 加载 main.js 失败:', (e && e.stack) || e);
}

let ready = null;

// 兼容不同平台可能把 URL 改写成函数自身路径的情况
function normalizeUrl(url) {
  if (!url) return '/';
  const i = url.indexOf('?');
  const p = i < 0 ? url : url.slice(0, i);
  const qs = i < 0 ? '' : url.slice(i);
  if (p === '/api/app' || p === '/api/app/' || p === '/api/app.js') return '/' + qs;
  return url;
}

function invoke(req, res) {
  if (bootError || !handler || !store) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('BOOT ERROR\n' + ((bootError && bootError.stack) || 'handler/store 未加载'));
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
}

module.exports = invoke;
// 某些运行时（ESM 互操作）会找 default 导出
module.exports.default = invoke;
