/**
 * 模拟 Vercel 的 Node Serverless 环境做冒烟测试：
 * Vercel 会把 (req, res) 直接交给导出的函数，这里用同样的方式跑一遍。
 *
 * 用法:
 *   node tools/test_vercel_handler.js 8099
 *   CH_BASE=http://127.0.0.1:8099 python tools/smoke.py
 *
 * 也可以用环境变量 VEREL_URL_MODE=rewrite 模拟「URL 被改写成 /api/app」的情况。
 */
const http = require('http');
const app = require('../api/app');
const PORT = Number(process.argv[2] || 8099);

http.createServer(app).listen(PORT, '127.0.0.1', () => {
  console.log('vercel-style handler listening on http://127.0.0.1:' + PORT);
  console.log('VEREL_URL_MODE =', process.env.VEREL_URL_MODE || 'raw');
});
