# CipherHub · 暗号查询中心

> **CipherHub** = 项目英文名（仓库名可直接用 `cipherhub`）

多平台「姓名 ⇄ 暗号」双向查询系统，含后台管理、访客问题反馈、Logo 切换。**零第三方依赖**，手机 / 电脑自适应，国内可直接部署访问。

## 快速开始

1. 安装 Node.js 18+（https://nodejs.org/zh-cn/download），Windows 也可直接双击 `start.bat`
2. 启动服务

```bash
node server.js
# 前台：http://localhost:3000/
# 后台：http://localhost:3000/admin
```

> 本项目零第三方依赖，无需 `npm install`。

- 默认管理员账号：`admin`，密码：`admin123`（**登录后请立即在「设置」中修改**）
- 换端口：`PORT=8080 node server.js`

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
├── server.js            # 零依赖 HTTP 服务 + 全部 API
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

## 网页版离线后台（GitHub Pages 专用）

根目录 `admin.html` 是一个**纯静态后台**，无需服务器，直接在 Pages 上打开：

```
https://<你的用户名>.github.io/CipherHub/admin.html
```

口令默认 `admin123`（生成时用 `python tools/build_static.py --admin-pass 你的口令` 修改）。

**发布流程：**

1. 打开 `admin.html` → 在「成员 / 暗号记录 / 批量导入 / 平台 / 站点设置」里改数据（改动自动存本机草稿）
2. 到「导出」页 → **下载 index.html** 和 **下载 db.json**
3. 覆盖仓库根目录的 `index.html`，以及 `data/db.json`
4. ```bash
   git add -A && git commit -m "update data" && git push
   ```
5. Pages 1~2 分钟内重建，**所有人打开就是最新版**

> 后台页面不会在前台露出任何入口，且带 `noindex`。但它是纯前端页面，口令只是挡住随手点进来的人，**不是真正的安全保护**——前台 `index.html` 本身也内含全部数据，敏感数据请用私有仓库。

## 上传到 GitHub & 用 GitHub Pages 打开

仓库根目录已经有一份**静态版 `index.html`**（自动生成，CSS / JS / 数据全部内嵌，可直接双击打开，也能被 GitHub Pages 直接托管）。

```bash
cd E:\code\anhao
git add -A
git commit -m "feat: CipherHub 暗号查询中心"
git branch -M main
git remote add origin https://github.com/<你的用户名>/cipherhub.git
git push -u origin main
```

然后在 GitHub 仓库页面：**Settings → Pages → Build and deployment → Source 选 `Deploy from a branch` → Branch 选 `main` / 目录选 `/(root)` → Save**。

等 1~2 分钟即可访问：`https://<你的用户名>.github.io/cipherhub/`

### 数据更新后重新生成静态版

静态版是一份数据快照，后台改完数据后执行：

```bash
python tools/build_static.py
```

会重新生成根目录 `index.html`（管理员账号密码不会写入该文件）。

### 两种运行方式的区别

| | 静态版 `index.html` | 离线后台 `admin.html` | Node 版 `server.js` |
|---|---|---|---|
| 托管 | GitHub Pages / 双击打开 | GitHub Pages / 双击打开 | 需要 Node 服务器 |
| 查询 | ✅ 完整可用（浏览器里查） | — | ✅ |
| 增删改数据 | ❌ | ✅（改完导出文件） | ✅ 实时生效 |
| 生效方式 | — | 导出后 push，1~2 分钟 | 立即 |
| 访客留言 | 存访客本机（你看不到） | ❌ | ✅ 后台可见 |

> **隐私提醒**：根目录 `index.html` 和 `data/db.json` 里包含全部真实姓名与暗号。如果仓库是 **public**，这些数据等于公开。建议设为 **Private**，或把 `index.html`、`assets/`、`data/` 加进 `.gitignore` 只提交源码，需要时在本地 `python tools/build_static.py` 生成后再手动上传。

## 部署到国内服务器

1. 安装 Node 14+，上传整个目录
2. `node server.js`（建议配合 `pm2` / `systemd` / `screen` 常驻）
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
