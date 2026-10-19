# 双平台部署总文档：Vercel + CloudBase（腾讯云开发）

同一套源代码，**不做任何平台专属改动**即可同时部署到两个平台。
核心设计：`main.js` 既是「可独立运行的服务」（容器用），也「导出请求处理器」（Serverless 用）。

```
                    ┌─────────────────────────────┐
                    │  GitHub  Sorenskr/CipherHub │   唯一源代码来源
                    │  main 分支                   │
                    └──────────┬──────────────────┘
                               │ git push 自动触发
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
        ┌──────────┐    ┌──────────────┐   ┌──────────────┐
        │  Vercel  │    │ CloudBase    │   │ GitHub Pages │
        │ Serverless│   │ 云托管(Docker)│   │ (Actions构建)│
        └──────────┘    └──────────────┘   └──────────────┘
         真动态           真动态·国内快        静态镜像
```

---

## 一、仓库结构

```
.
├── main.js                 # 服务入口：本地/容器运行时 listen；同时导出 handler 供 Serverless 用
├── api/
│   └── app.js              # Vercel Serverless 入口（require('../main').handler）
├── lib/
│   └── store.js            # 数据层：JSON 文件 + 可选 Vercel Blob 持久化
├── public/                 # 前台 / 后台页面、样式、JS、Logo（两平台共用）
│   ├── index.html  admin.html  admin-partial.html
│   ├── css/style.css
│   ├── js/  (app.js admin.js static-shim.js static-admin.js admin-trigger.js)
│   └── assets/  (Laya.png  Laya2.png  logo.png)
├── data/
│   └── db.json             # 初始数据（两平台共用）
│
├── vercel.json             # ← Vercel 专用配置
├── .vercelignore           # ← Vercel 打包排除清单
├── Dockerfile              # ← CloudBase / 容器平台专用
├── .dockerignore           # ← Docker 构建排除清单
├── .github/workflows/pages.yml   # GitHub Pages 自动构建（可选）
├── deploy/                 # 部署文档
├── tools/                  # 构建 / 导入 / 回归脚本
├── .nvmrc                  # Node 版本固定（20）
├── package.json            # engines.node = 20.x（两平台统一运行时）
└── start.bat               # Windows 本地一键启动
```

### 为什么能一套代码两边跑

| 文件 | Vercel | CloudBase |
|---|---|---|
| `main.js` | 被 `api/app.js` require，只用到导出的 `handler` | 作为 `CMD node main.js` 独立运行，自己 listen |
| `lib/store.js` | 文件系统只读 → 靠 `BLOB_READ_WRITE_TOKEN` 持久化 | 容器可写 → 直接写 `data/db.json` |
| `public/` | 由函数在运行时读出并返回 | 由容器内服务返回 |
| `data/db.json` | 打进函数包作为初始数据 | 挂载 CFS 持久卷后可长期保存 |

---

## 二、分支策略

| 分支 | 用途 | 部署目标 |
|---|---|---|
| `main` | 生产源代码，唯一可信来源 | Vercel Production + CloudBase（手动上传/CI） |
| `dev` | 开发联调 | Vercel Preview（自动） |
| `feature/*` | 功能分支 | Vercel Preview（自动，PR 评论里给链接） |
| `gh-pages` | GitHub Actions 发布的静态产物 | GitHub Pages（自动，不入 main） |

**规则：**

1. `main` 只保存源代码，**不提交任何构建产物**（`index.html` / `admin.html` / `assets/` 已在 `.gitignore`）
2. 日常改动走 `feature/*` → PR → 合并 `main` → 自动部署
3. 数据变更：改 `data/db.json` 后同样走 PR，两边都会更新初始数据
4. 建议给 `main` 开分支保护：必须 PR + 至少 1 个 review

---

## 三、Vercel 部署配置

### 3.1 导入项目时的设置

| 项 | 值 | 说明 |
|---|---|---|
| Framework Preset | **Other（其他）** | ⚠️ 不要选 Node，否则会把 `main.js` 当常驻入口 |
| Root Directory | `./` | 仓库根目录 |
| Build Command | **留空** | 无构建步骤 |
| Output Directory | **留空** | 由函数运行时输出 |
| Install Command | 留空（默认 `npm install`） | 安装 `@vercel/blob`（可选依赖） |
| Node.js Version | 见下方说明 | Vercel 用项目设置，CloudBase 用 Dockerfile |

### 3.2 `vercel.json`（已就绪）

```json
{
  "builds": [
    { "src": "api/app.js", "use": "@vercel/node", "config": { "includeFiles": "**" } }
  ],
  "routes": [
    { "src": "/(.*)", "dest": "/api/app.js" }
  ]
}
```

要点：

- `builds` **显式声明**唯一 Serverless 函数，绕开框架预设的自动探测（这是之前 500 的根因）
- `includeFiles: "**"` 把 `main.js` / `lib/` / `public/` / `data/` 全部打进函数包（**必须是字符串，不能是数组**）
- `routes` 把所有请求交给该函数，静态文件也由它在运行时返回

### 3.3 `.vercelignore`（已就绪，注意别写宽）

```
.git  node_modules  *.log  Dockerfile  .dockerignore
deploy  tools  data/backups  README.md  *.zip
/index.html  /admin.html  /assets/     ← 前导斜杠=只排除根目录，否则会误删 public/ 下同名文件
```

### 3.4 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | **强烈建议** | 不配则后台改的数据会在实例回收后丢失 |
| `ADMIN_PASS` | 否 | 仅 GitHub Actions 构建静态页时用作后台口令 |

创建方式：项目 → **Storage → Create → Blob** → 连接到本项目 → Vercel 自动注入 → **Redeploy**。

### 3.5 运行时与限制

- 函数最长 10s（Hobby）/ 60s（Pro），本项目单次请求远低于此
- 文件系统**只读且不持久**（`/tmp` 除外），所以数据必须走 Blob
- 免费额度：100 GB 带宽 / 月，个人用足够
- **国内访问不稳定**，可能需代理

> **Node 版本说明**：Vercel 的 Node 版本由 **Settings → Functions → Node.js Version** 控制（默认 24.x），它优先于 `.nvmrc` / `engines`。
> 代码在 Node 20 / 22 / 24 上都验证通过，无需刻意统一；CloudBase 侧由 `Dockerfile` 固定为 `node:20-alpine`。

---

## 四、CloudBase（腾讯云开发）部署配置

### 4.1 服务创建设置

| 项 | 值 |
|---|---|
| 服务名称 | `cipherhub` |
| 部署方式 | **本地代码 / 代码包（zip）** |
| 运行环境 | **Dockerfile** |
| 端口 | **80** |
| 实例规格 | 最低配（0.25C 0.5G） |
| 实例数 | 最小 1 / 最大 1 |

### 4.2 `Dockerfile`（已就绪）

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY main.js ./
COPY lib ./lib
COPY public ./public
COPY data ./data
ENV PORT=80
ENV NODE_ENV=production
EXPOSE 80
HEALTHCHECK ... CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||80)+'/api/stats',...)"
CMD ["node", "main.js"]
```

要点：

- `PORT=80` 是云托管默认端口，**必须与「端口」填写一致**
- `HEALTHCHECK` 打 `/api/stats`，云托管据此判断实例健康
- 零第三方依赖（`@vercel/blob` 只是 optionalDependencies，装不上也不影响运行）

### 4.3 上传包内容

打 zip 时只包含这 6 项（`tools/make_upload_pkg.py` 可一键生成）：

```
Dockerfile
.dockerignore
main.js
package.json
lib/
public/
data/db.json
```

**不要**包含：`.git`、`node_modules`、`index.html`、`admin.html`、`assets/`、`tools/`、`deploy/`、`*.zip`、日志文件。

### 4.4 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `PORT` | 否 | Dockerfile 已设 80，一般不用配 |
| `ADMIN_PASS` | 否 | 仅本地构建静态页用 |

云托管没有「环境变量面板」也能跑，需要的话在服务「环境配置」里加。

### 4.5 数据持久化（重要）

云托管容器重建会丢容器内文件，两种解法：

1. **挂载 CFS**：服务 → 存储挂载 → CFS 挂到 `/app/data`（推荐，一劳永逸）
2. **勤导出**：后台「设置 → 导出 JSON」下载，重新部署时放回 `data/db.json`

---

## 五、两平台关键差异

| 维度 | Vercel | CloudBase 云托管 |
|---|---|---|
| 运行形态 | Serverless 函数（按需唤醒） | 常驻 Docker 容器 |
| 部署触发 | `git push` 自动 | 手动上传 zip（或配 CI） |
| 构建产物 | `api/app.js` 函数包 | Docker 镜像 |
| 入口 | `api/app.js` → `main.js` 的 `handler` | `node main.js` 独立 listen |
| 配置文件 | `vercel.json` | `Dockerfile` |
| 打包控制 | `.vercelignore` | `.dockerignore` |
| 端口 | 平台分配，无需关心 | 必须填 **80** |
| 文件系统 | **只读 + 不持久** | 可写，但容器重建会丢 |
| 数据持久化 | Vercel Blob（需 `BLOB_READ_WRITE_TOKEN`） | 挂载 CFS 到 `/app/data` |
| 冷启动 | 有（首次请求可能慢 1~2s） | 无 |
| 国内访问 | ⚠️ 不稳定 | ✅ 快（腾讯云国内节点） |
| 费用 | 免费额度充足 | 约几元/月 |
| 后台地址 | `/admin` | `/admin` |
| 自定义域名 | Settings → Domains | 服务 → 域名管理 → CNAME |

---

## 六、注意事项（踩过的坑）

1. **Vercel 的 Framework Preset 千万别选 `Node`**
   它会自动把根目录的服务入口当常驻应用构建，导致 `FUNCTION_INVOCATION_FAILED`。必须选 **Other**，并用 `builds` 显式声明函数。

2. **入口文件不要叫 `server.js` / `index.js`**
   这些名字会被平台自动探测误判。本项目统一用 `main.js`。

3. **`.vercelignore` 的模式一定要加前导斜杠**
   `index.html` 会匹配任意层级，把 `public/index.html` 也排除掉；必须写 `/index.html`。

4. **`vercel.json` 的 `includeFiles` 只能是字符串**
   写成数组会导致架构验证失败：`functions.api/app.js.includeFiles 应为字符串类型`。

5. **两平台都不要提交构建产物到 `main`**
   GitHub 只放源代码；Pages 静态版由 Actions 构建。

6. **`data/db.json` 是公开数据**
   仓库 public 时，里面的姓名和暗号等于公开。敏感数据请把仓库设为 Private。

7. **CloudBase 的端口必须和 Dockerfile 的 `ENV PORT` 一致**
   云托管控制台填 80，Dockerfile 里 `ENV PORT=80`，漏一个就健康检查失败。

8. **Node 版本两平台已统一为 20.x**
   （`.nvmrc` + `package.json engines` + `Dockerfile FROM node:20-alpine`）

---

## 七、常用命令

```bash
# 本地跑
node main.js                    # 或双击 start.bat

# 本地模拟 Vercel Serverless 环境
node tools/test_vercel_handler.js 8099
CH_BASE=http://127.0.0.1:8099 python tools/smoke.py

# 回归测试
python tools/smoke.py           # 查询 / 鉴权 / 后台接口
python tools/smoke2.py          # 反馈 / 配置 / 静态资源
python tools/smoke_static.py    # 静态版结构 + 数据垫片

# 生成 GitHub Pages 静态版（不入库）
python tools/build_static.py

# 生成 CloudBase 上传包
python tools/make_upload_pkg.py

# 推送即部署
git add -A && git commit -m "..." && git push
```
