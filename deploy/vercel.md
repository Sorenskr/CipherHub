# 部署到 Vercel（真·动态版）

Vercel 的 Serverless Functions 能跑 Node，所以这个版本是**真动态**：后台改完立即对所有人生效、访客留言收得到、后台地址就是 `/admin`。

> 缺点：国内访问 Vercel 速度不稳定（有时需代理）。如果主要用户在国内，更推荐腾讯云 CloudBase 云托管（见 `deploy/cloudbase.md`），服务器在国内、快得多。

---

## 一、推代码到 GitHub（已完成）

仓库：`https://github.com/Sorenskr/CipherHub`

Vercel 需要的文件都已就位：

```
api/app.js          Serverless 入口（复用 main.js 的请求处理器）
vercel.json         把所有请求 rewrite 到 api/app.js
main.js             改为可导出 handler（本地运行不受影响）
lib/store.js        增加可选的 Vercel Blob 持久化
public/             前台 / 后台页面
data/db.json        初始数据
package.json
```

## 二、导入 Vercel

1. 登录 [vercel.com](https://vercel.com)（用 GitHub 账号）
2. **Add New… → Project** → 选择 `Sorenskr/CipherHub` → **Import**
3. Framework Preset 选 **Other**，Build Command 留空，Output Directory 留空
4. **Environment Variables** 先不用填，直接 **Deploy**

部署完会得到域名，例如 `https://cipherhub-xxxx.vercel.app/`：

- 前台：`https://你的域名/`
- 后台：`https://你的域名/admin`（账号 `admin` / 密码 `admin123`，**登录后立刻改**）

## 三、让数据能保存（重要，两步）

Vercel 是 Serverless，**容器文件系统只读且不持久**。不处理的话，后台改的数据会随实例回收/重新部署丢失。

### 1) 开通 Vercel Blob

Vercel 控制台 → 你的项目 → **Storage → Create → Blob** → 名字随意（如 `cipherhub-db`）

创建后会自动连上一个 `BLOB_READ_WRITE_TOKEN` 环境变量。

### 2) 重新部署

**Deployments → 最新一次 → Redeploy**（让新环境变量生效）。

之后每次后台保存都会同时写到 Blob；冷启动时从 Blob 读回最新数据。

> 首次写入后，Vercel Blob 里会有一个对象 `cipherhub/db.json`，可在 Storage 面板里查看/下载备份。

### 本地开发时

```bash
npm install          # 安装可选的 @vercel/blob
vercel env pull      # 或手动在 .env 里写 BLOB_READ_WRITE_TOKEN=...
node main.js
```

没有 `BLOB_READ_WRITE_TOKEN` 时，行为退化为本地文件存储，功能和单机版完全一致。

---

## 四、自定义域名（可选）

Vercel 项目 → **Settings → Domains** → 添加域名 → 按提示加一条 CNAME。

---

## 五、排错

| 现象 | 原因 / 解决 |
|---|---|
| 打开是 GitHub Pages 那个静态版 | `.vercelignore` 已排除根目录 `index.html`，Vercel 版由 `public/index.html` 提供；确认部署的是最新提交 |
| 后台登录提示「账号或密码错误」 | 用的是 `admin123`；若已改过但 Blob 没连上，重启后会回到镜像里的 `db.json`，请按第三节配好 Blob |
| 改完刷新又变回去 | 没配 `BLOB_READ_WRITE_TOKEN`，或配了没 Redeploy |
| 手机打不开 | Vercel 在国内可能被限制，换 CloudBase 云托管 |

## 六、本地模拟 Vercel 环境

```bash
vercel dev
```

会同时起本地服务与 API，方便改代码时调试。
