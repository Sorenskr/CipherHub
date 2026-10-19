# 部署到腾讯云开发 CloudBase「云托管」（真·动态版）

> 你现在用的 `webapps.tcloudbase.com` 域名是 CloudBase 的**静态网站托管**，它和 GitHub Pages 一样只放静态文件，所以还是静态的。
> 同一个环境里再开 **云托管（CloudRun）**，就能跑 Node 服务 —— 后台改完**立即对所有人生效**，访客留言也能收到。

---

## 一、开通云托管

1. 打开 [腾讯云开发控制台](https://tcb.cloud.tencent.com/) → 进入你的环境（就是 `proxy-setup-tool001-laya` 那个）
2. 左侧菜单 **云托管** → 开通（按量计费，有免费额度）
3. 点 **新建服务**

## 二、上传代码

**服务配置：**

| 项 | 填什么 |
|---|---|
| 服务名 | `cipherhub` |
| 部署方式 | **本地代码** / 代码包 |
| 运行环境 | **Dockerfile**（选自定义镜像构建） |
| 端口 | `80` |
| 实例规格 | 最低配（0.25C 0.5G）够用 |
| 实例数量 | 最小 1 最大 1（省钱） |

**代码包：** 把项目根目录下的这些文件/文件夹打包成 zip 上传：

```
Dockerfile
main.js
package.json
lib/
public/
data/db.json
```

> 不要传 `index.html`、`admin.html`、`assets/`、`tools/`、`.git`（`.dockerignore` 已帮你排除）。
> Windows 上全选这 5 项右键「发送到 → 压缩文件夹」即可。

上传后 CloudBase 会自动用 `Dockerfile` 构建镜像并启动。

## 三、访问

部署完成后 CloudBase 会给你一个域名，形如：

```
https://cipherhub-xxxx-xxxxxx.ap-shanghai.app.tcloudbase.com/
```

- 前台：`https://你的域名/`
- 后台：`https://你的域名/admin`  （账号 `admin` / 密码 `admin123`，**登录后立刻改**）

国内访问速度很快，因为服务器在腾讯云。

## 四、绑定自己的域名（可选）

云托管 → 服务 → **域名管理** → 添加自定义域名 → 按提示加一条 CNAME 解析。

---

## ⚠️ 数据持久化（重要）

云托管的容器**重建后会丢失容器内的文件**，也就是说你在后台改的数据，遇到「重新部署 / 实例重启」会回到镜像里的 `data/db.json`。

三种应对方式，选一个：

### 方式 1：挂载持久化存储（推荐）
云托管服务 → **存储挂载** → 挂载一个 CFS 文件存储到容器的 `/app/data`。
之后 `db.json` 就落在持久卷上，重启不丢。

### 方式 2：勤导出（零成本）
后台「设置 → 数据备份与恢复 → 导出 JSON」，重要改动后导出一份到本地。
需要更新服务时，把新的 `db.json` 放回 `data/` 重新打包上传。

### 方式 3：我帮你接云数据库
把 `lib/store.js` 改成读写 CloudBase 云数据库（需要引入 `@cloudbase/node-sdk`，会打破「零依赖」，但数据永不丢失）。
有需要跟我说，我来改。

---

## 五、本地验证镜像（装了 Docker 才需要）

```bash
docker build -t cipherhub .
docker run -p 8080:80 cipherhub
# 打开 http://localhost:8080/
```

`PORT` 环境变量可覆盖端口；`HOST` 默认 `0.0.0.0`，容器内可放心使用。

---

## 附：和现在几个版本的区别

| | GitHub Pages 单页版 | CloudBase 云托管版 |
|---|---|---|
| 后台入口 | 连点 Logo 5 次 | `/admin` |
| 改完生效 | 要导出 + push，1~2 分钟 | **立即** |
| 访客留言 | 看不到 | ✅ 后台「反馈」页可见 |
| 手机访问 | 可以 | 可以 |
| 国内速度 | 一般 | **快** |
| 费用 | 免费 | 约几元/月（有免费额度） |
