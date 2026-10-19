/**
 * 模拟 Vercel 的 Node Serverless 环境做冒烟测试：
 * Vercel 会把 (req, res) 直接交给 api/app.js 导出的函数，这里用同样方式跑一遍。
 *
 * 用法:
 *   node tools/test_vercel_handler.js 8099
 *   CH_BASE=http://127.0.0.1:8099 python tools/smoke.py
 */
const http = require('http');
const app = require('../api/app');
const PORT = Number(process.argv[2] || 8099);

http.createServer(app).listen(PORT, '127.0.0.1', () => {
  console.log('vercel-style handler listening on http://127.0.0.1:' + PORT);
});
