# CloudBase 云托管 / 容器平台部署配置（与 package.json engines 保持一致）
FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY main.js ./
COPY index.html ./
COPY css ./css
COPY js ./js

ENV PORT=80
ENV NODE_ENV=production

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||80)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "main.js"]
