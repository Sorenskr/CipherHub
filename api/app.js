/**
 * Vercel Serverless 入口
 * vercel.json 把所有请求 rewrite 到这里，req/res 就是标准 Node http 对象，
 * 因此可以直接复用 server.js 里的 requestListener。
 */
const { handler } = require('../server');
const store = require('../lib/store');

let ready = null;

module.exports = function (req, res) {
  if (!ready) ready = store.init();
  ready.then(() => handler(req, res)).catch((e) => {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: e.message || 'server error' }));
    }
  });
};
