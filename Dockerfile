# CloudBase 云托管 / 任意容器平台部署用（与 package.json engines 保持一致）
FROM node:20-alpine

WORKDIR /app

# 零第三方依赖，直接拷贝源码即可
COPY package.json ./
COPY main.js ./
COPY lib ./lib
COPY public ./public
COPY data ./data

# 云托管默认使用 80 端口
ENV PORT=80
ENV NODE_ENV=production

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||80)+'/api/stats',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "main.js"]
