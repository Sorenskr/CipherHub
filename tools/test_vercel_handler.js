/**
 * 模拟 Vercel 的 Node Serverless 环境：
 * Vercel 会把 (req, res) 直接交给导出的函数，这里用同样的方式跑一遍冒烟测试。
 *
 * 用法: node tools/test_vercel_handler.js 8099
 * 然后: CH_BASE=http://127.0.0.1:8099 python tools/smoke.py
 */
const http = require('http');
const { handler } = require('../server');

const port = Number(process.argv[2] || 8099);
http.createServer(handler).listen(port, '127.0.0.1', () => {
  console.log('handler listening on http://127.0.0.1:' + port);
});
