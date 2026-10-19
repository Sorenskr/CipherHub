# CipherHub · 暗号查询中心

> **CipherHub** = 项目英文名（仓库名可直接用 `cipherhub`）

多平台「姓名 ⇄ 暗号」双向查询系统，含后台管理、访客问题反馈、Logo 切换。**零第三方依赖**，手机 / 电脑自适应。

## 这个仓库是「源代码」

```
GitHub（源代码，main 分支）
   ├─→ Vercel        真动态版（后台改完立即生效）      ← 推荐给国内用户改用 CloudBase
   ├─→ CloudBase 云托管  真动态版、国内速度快
   └─→ GitHub Pages  GitHub Actions 自动构建静态版
```

**约定：**

- `main` 分支**只保存源代码**，不含任何构建产物
- 本地生成的静态页（`index.html` / `admin.html` / `assets/`）已被 `.gitignore` 排除，不入库
- 需要时本地执行 `python tools/build_static.py` 生成
- GitHub Pages 由 `.github/workflows/pages.yml` 在 CI 上构建并发布，main 保持干净

## 快速开始

1. 安装 Node.js 18+（https://nodejs.org/zh-cn/download），Windows 也可直接双击 `start.bat`
2. 启动服务

```bash
node main.js
# 前台：http://localhost:3000/
# 后台：http://localhost:3000/admin
```

> 本项目零第三方依赖，无需 `npm install`。

- 默认管理员账号：`admin`，密码：`admin123`（**登录后请立即在「设置」中修改**）
- 换端口：`PORT=8080 node main.js`

## 手机访问

服务默认监听 `0.0.0.0`，手机与电脑连同一个 Wi-Fi 时，直接访问后台「概览 → 手机 / 局域网访问地址」里列出的地址即可（例如 `http://192.168.5.35:3000/`）。

打不开的话检查 Windows 防火墙是否放行该端口。页面已做完整移动端适配：单列卡片、超大点击区域、`viewport-fit=cover` 刘海屏适配、可添加到主屏幕。

## 功能

### 前台
- 首屏为**脱敏速览**：平台矩阵（数字滚动 + 呼吸光晕）、无限滚动带、随机聚焦卡、随机样本墙，内容每次刷新都重新抽样，不展示完整名单
- 搜索框占位提示**每次打开都不一样**，并以打字机效果轮播
- 背景为不间断动效：极光光斑漂移、网格平移、粒子上升（尊重 `prefers-reduced-motion`）
- 输入**姓名** → 展示该成员在 Threads / Instagram / TikTok / X / Facebook / 视频 / 短链 下的全部暗号与短链
- 输入**暗号或短链** → 反查归属人 + 平台，并同时列出该人的其他全部暗号
- 平台 / 分组筛选、输入联想、一键复制（单条 / 某人全部）、短链直达
- 深浅色主题切换、URL 可分享（`#q=xxx`）
- **Logo 切换按钮**：标题栏 Logo 左侧的按钮可在 `Laya.png` / `Laya2.png` 之间轮换，选择记在本地
- **问题反馈区**：访客可留言（称呼 / 联系方式 / 问题描述），管理员在后台查看处理；同时展示管理员填写的联系方式（微信 / QQ / 邮箱 …），右侧有悬浮按钮可快速跳到反馈区

### 后台 `/admin`
- 概览：各平台记录数分布、手机访问地址
- 成员：新增 / 编辑 / 删除（删除会级联清理其记录）
- 暗号记录：按平台、分组、类型、关键词筛选，增删改查
- 批量导入：粘贴 `姓名 暗号 平台 类型 链接`，自动建人
- 反馈：查看访客留言、标记已处理、删除（未处理数会在标签上显示红点数字）
- 平台：自定义平台名称、颜色、排序
- 设置：站点名 / 副标题 / 分组 / **Logo 图片路径** / **反馈配置与联系方式** / 修改密码 / 导出 JSON / 恢复 / 服务器备份

## 目录结构

```
.
├── main.js              # 零依赖 HTTP 服务 + 全部 API
├── lib/store.js         # JSON 数据读写、查询、脱敏抽样、反馈
├── public/
│   ├── index.html       # 前台
│   ├── admin.html       # 后台
│   ├── css/style.css
│   ├── js/app.js
│   ├── js/admin.js
│   └── assets/          # Laya.png / Laya2.png / logo.png（标签页图标）
├── data/db.json         # 全部数据（纯文本，随时可改可备份）
├── tools/
│   ├── import_excel.py  # 从两个 Excel 生成初始数据
│   ├── smoke.py         # 基础接口回归
│   └── smoke2.py        # 反馈 / 配置 / 资源回归
├── start.bat            # Windows 一键启动
├── package.json
└── README.md
```

## 数据结构

数据存于 `data/db.json`（纯文本，直接可读可改），每次导入 / 恢复会自动备份到 `data/backups/`。

```
people    : [{ id, name, group, note }]
entries   : [{ id, personId, platformId, kind(code|link), value, type, url, note }]
platforms : [{ id, name, color, icon, order }]
feedbacks : [{ id, name, contact, message, status, createdAt }]
settings  : { siteName, subtitle, logos[], feedback{title,desc,enableForm}, contacts[] }
```

## 内置后台（单页，隐藏入口）

前台与后台在**同一个 `index.html`** 里，没有第二个页面。

**打开方式：在首页连点左上角 Logo 5 次 → 输口令 → 后台在当前页展开**（第 3 次点击起会有「再点 N 次」提示，2.5 秒内不继续点击会重置）。

口令默认 `admin123`，生成时可改：

```bash
python tools/build_static.py                  # 默认口令 admin123
python tools/build_static.py --admin-pass 你的口令
python tools/build_static.py --no-pass        # 不要口令，点 5 次直接进
```

后台改动会**立刻在本页生效**（前台查询结果同步刷新），并自动存本机草稿；换设备后仍以线上快照为准，所以正式发布需要导出。

**发布流程：**

1. 打开 `admin.html` → 在「成员 / 暗号记录 / 批量导入 / 平台 / 站点设置」里改数据（改动自动存本机草稿）
2. 到「导出」页 → **下载 index.html** 和 **下载 db.json**
3. 覆盖仓库根目录的 `index.html`，以及 `data/db.json`
4. ```bash
   git add -A && git commit -m "update data" && git push
   ```
5. Pages 1~2 分钟内重建，**所有人打开就是最新版**

> 后台入口是隐藏的（连点 Logo 5 次），页面带 `noindex`。但它是纯前端页面，口令只挡随手点进来的人，**不是真正的安全保护**——`index.html` 本身也内含全部数据，敏感数据请用私有仓库。
>
> 旧的 `/admin.html` 已变成一个自动跳转页，会自动跳回 `index.html`。

## 上传到 GitHub & 用 GitHub Pages 打开

仓库已就绪（源码已在 `main`），日常同步：

```bash
git add -A && git commit -m "..." && git push
```

GitHub Pages 由 **Actions 自动构建**（生成物不入 `main` 分支）：

1. 仓库 **Settings → Pages → Build and deployment → Source 选 `GitHub Actions`**
2. push 后 Actions 自动执行 `python tools/build_static.py` 并发布

访问：`https://<你的用户名>.github.io/CipherHub/`

### 数据更新后重新生成静态版

静态版是一份数据快照，后台改完数据后执行：

```bash
python tools/build_static.py
```

会在**本地**重新生成根目录 `index.html` / `admin.html` / `assets/`（这些文件已被 `.gitignore` 排除，不会进仓库）。想让 Pages 也更新，只需把改好的 `data/db.json` 提交推送，Actions 会重新构建。

### 两种运行方式的区别

| | 单页静态版 | Node 版（Vercel / CloudBase / 本地） |
|---|---|---|
| 托管 | GitHub Pages（Actions 构建）/ 双击打开 | 需要 Node 运行时 |
| 查询 | ✅ 完整可用（浏览器本地检索） | ✅ |
| 后台入口 | 连点 Logo 5 次 + 口令 | `/admin` |
| 增删改数据 | ✅（本机即时生效） | ✅ |
| 对所有人生效 | 改 `data/db.json` + push，1~2 分钟 | 立即 |
| 访客留言 | 存访客本机（你看不到） | ✅ 后台可见 |

> GitHub Pages 只能托管静态文件，无法运行服务端程序，所以「改完所有人立刻看到」和「收集访客留言」这两件事在 Pages 上做不到，必须有一台能跑 Node 的平台（Vercel / CloudBase 云托管）。

> **隐私提醒**：`data/db.json` 与生成的静态页里包含全部真实姓名与暗号。如果仓库是 **public**，这些数据等于公开。敏感数据建议设为 **Private**。

## 部署到 Vercel（真·动态版）

Vercel 的 Serverless Functions 能跑 Node，本项目已改造为可直接部署（`api/app.js` + `vercel.json`，`main.js` 导出了 `handler`）：

👉 见 **[deploy/vercel.md](deploy/vercel.md)**（导入项目、配 Vercel Blob 持久化、绑域名、排错）

```bash
# 本地模拟 Vercel 的 (req, res) 环境
node tools/test_vercel_handler.js 8099
CH_BASE=http://127.0.0.1:8099 python tools/smoke.py
```

> ⚠️ Vercel 国内访问不稳定；主要用户在国内建议用 CloudBase 云托管。

## 部署到腾讯云开发 CloudBase（真·动态版）

GitHub Pages 只能放静态文件。想要**改完立即对所有人生效 + 收到访客留言**，需要一台能跑 Node 的服务器。

如果你已经在用 CloudBase（`*.webapps.tcloudbase.com` 那种环境），直接在同一环境开 **云托管** 即可，已备好 `Dockerfile`：

👉 见 **[deploy/cloudbase.md](deploy/cloudbase.md)**（上传代码、端口、数据持久化、绑域名全流程）

```bash
# 本地镜像验证（需装 Docker）
docker build -t cipherhub .
docker run -p 8080:80 cipherhub
```

## 部署到国内服务器

1. 安装 Node 14+，上传整个目录
2. `node main.js`（建议配合 `pm2` / `systemd` / `screen` 常驻）
3. 用 Nginx 反向代理并绑定域名：

```nginx
server {
    listen 80;
    server_name your-domain.com;
    client_max_body_size 32m;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

页面无任何外部 CDN 依赖（字体、图标、样式、Logo 全部内置），国内网络可直接打开。

## 常见问题

**忘记后台密码**（重置为 `admin123`）：

```bash
node -e "const s=require('./lib/store');s.load();s.setPassword('admin123');s.saveNow()"
```

**前台不想让人看到完整名单**：首屏默认只展示随机抽样并脱敏（`周**` / `32••0`）的速览内容，必须输入关键词才会出现具体姓名。

**换 Logo / 换标签页图标**：把图片放进 `public/assets/`，后台「设置」里改 Logo 路径；标签页图标固定为 `public/assets/logo.png`（200×200 最佳）。

## 重新导入 Excel

```bash
pip install openpyxl xlrd
python tools/import_excel.py
```

脚本会覆盖 `data/db.json`（含后台新增内容），如需保留请先导出备份。

## 回归测试

```bash
python tools/smoke.py    # 基础查询 / 鉴权
python tools/smoke2.py   # 反馈 / 配置 / 静态资源
```
