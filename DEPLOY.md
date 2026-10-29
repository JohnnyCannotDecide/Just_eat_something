# 部署与云同步指南

这份文档面向**你自己**把「便当手帐」部署到 Cloudflare，并在手机 / 电脑之间同步数据。
所有命令都需要你在自己的终端里执行；仓库里不会有、也不应该有你的账号、Token 或同步码。

> 免费套餐（Pages + Functions + D1）**不需要绑定支付方式**。
> 云同步是可选的：不开也能继续本地记录。

---

## 0. 先了解三件事

1. **数据存在哪**：你自己的 Cloudflare D1 数据库里。应用仍然优先读写本机，云端只是备份与多设备合并。
2. **同步码是什么**：开启同步时由本机随机生成的一串 32 位字符（按 4 位分组显示），相当于账号密码。服务器只保存它的 SHA-256 哈希，**拿不回明文码**。同步码只保存在本机浏览器的 `diet-diary-sync:` 前缀下，不会写进 App 数据、导出备份或日志。
3. **免费额度**（2026 年现状，以控制台显示为准）：Functions 约 10 万请求/天，D1 约 500 万行读 / 10 万行写/天、5 GB 存储。个人使用远远用不完。

---

## 1. 准备

- Node.js ≥ 20.19（`node -v` 确认）。
- 一个 Cloudflare 账号（免费注册即可，不需要信用卡）。
- 在仓库根目录执行下面的命令（先 `npm install`）。

---

## 2. 登录 Cloudflare

```bash
npx wrangler login
```

会打开浏览器让你授权。**这一步请你自己完成**，不要把任何 Token 发给别人或写进仓库。

确认登录状态：

```bash
npx wrangler whoami
```

---

## 3. 创建 D1 数据库

```bash
npx wrangler d1 create diet-diary-sync
```

输出里会有类似：

```toml
[[d1_databases]]
binding = "DB"
database_name = "diet-diary-sync"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

把返回的 `database_id` 复制到根目录的 `wrangler.toml`，替换其中的占位值
`00000000-0000-0000-0000-000000000000`。

> `database_id` 不是密钥，可以留在本地；是否提交到个人仓库由你决定。
> 本地开发与测试不依赖它，占位值也能跑。

---

## 4. 在线上库建表

```bash
npx wrangler d1 migrations apply diet-diary-sync --remote
```

看到确认提示时输入 `y`。这一步会创建 `users` / `records` / `images` / `snapshots` / `snapshot_images` 五张表。

> `--remote` 会修改你的线上数据库，属于不可逆操作。确认 `database_id` 指向的是你刚创建的那个库再执行。

---

## 5. 构建并部署 Pages

```bash
npm run build
npx wrangler pages project create bento-handbook --production-branch main
npx wrangler pages deploy dist --project-name bento-handbook --branch main
```

- 第一次部署前必须先 `npm run build`，`dist/` 是 `wrangler.toml` 里声明的输出目录。
- 项目名 `bento-handbook` 对应网址 `https://bento-handbook.pages.dev`，和 `wrangler.toml` 的 `name` 保持一致。
- **`*.pages.dev` 子域名创建后不能改名**；如果这个名字在部署前被别人占用，只能换一个名字，并同步修改 `wrangler.toml` 的 `name` 与本文所有 `--project-name`、网址。
- 部署成功后会得到 `https://bento-handbook.pages.dev`。以后更新只需重复 `npm run build` + `npx wrangler pages deploy ...`。

也可以改用 Cloudflare 控制台的 Git 集成：构建命令填 `npm run build`，输出目录填 `dist`。
但注意 Git 集成**不会**自动执行 D1 迁移，第 4 步仍需手动完成。

---

## 6. 手机上添加到主屏幕

1. 用手机浏览器打开 `https://<项目名>.pages.dev`。
2. iOS Safari：分享 → 添加到主屏幕；Android Chrome：菜单 → 安装应用 / 添加到主屏幕。
3. 主屏幕打开后应进入独立窗口（PWA）。

> 换域名等于换 origin，本机数据与同步码不互通。确定用哪个地址前先想好。

---

## 7. 开启同步

### 第一台设备（已有数据）

1. 打开「设置 → 云同步」。
2. 点「开启云同步」。
3. 点「显示」查看同步码，再点「复制」。
4. 把同步码抄到安全的地方（密码管理器、纸质记录均可）。**丢失后无法从服务器找回。**

### 第二台设备（新设备）

1. 打开同一个 `https://<项目名>.pages.dev`。
2. 「设置 → 云同步」→ 在「已有同步码？」里粘贴同步码 → 连接。
3. 如果本机是空的，会自动从云端恢复，并提示「已从云端恢复」。
4. 如果两边都有数据，会让你选择：
   - **合并两边数据（推荐）**：先自动创建本地快照，再按更新时间合并；打卡事件只增不删。
   - **以云端为准**：先自动创建本地快照，然后用云端数据替换本机。
5. 之后会防抖自动同步（本地改动约 3 秒后上传），也可以在设置页点「立即同步」。

### 轮换与关闭

- **轮换同步码**：旧码在 10 分钟内仍可用，方便其他设备过渡；过期后作废，其他设备需要重新输入新码。轮换失败时保留旧码，可重试。
- **关闭同步**：只暂停本机自动同步，保留本机同步码和全部数据；云端数据不删除，可随时重新开启。
- **删除本机同步码**：彻底移除本机凭证。云端数据仍在，但没有码就无法再访问；其他设备如果还保留着码，可以重新连上。

---

## 8. 本地开发与测试（绝不连线上库）

```bash
npm run db:migrate:local          # 给本地 D1 建表（.wrangler/state）
npm run build                     # 生成 dist/
npm run dev:pages                 # wrangler pages dev dist，端口 8788，使用本地 D1
npm run test:api                  # 自动起本地 Functions + 本地 D1 跑接口测试
npm run dev                       # 前端 5173，/api 会代理到 127.0.0.1:8788
```

- 同时跑 `npm run dev` 和 `npm run dev:pages`，就能在 `http://localhost:5173` 调试完整同步。
- 接口测试默认使用独立的本地持久化目录，不会碰线上库，也不会污染日常本地 D1。
- 需要重置本地 D1 时，停止 `dev:pages` 后删除 `.wrangler/state`（仅本地开发数据）。
- `.wrangler/` 与 `.dev.vars*` 已在 `.gitignore` 中，不要提交。

---

## 9. 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| 连接时提示「同步码无效」 | 码输错、少字符或已被轮换。检查 32 位是否完整；轮换后需用新码。统一返回 401，不区分具体原因。 |
| 提示「请求太频繁」 | 基础限流（约 60 次/分钟）。等一分钟再试。 |
| 提示「图片太大」 | 云同步会把图片压到约 80 KB；仍超限的图会跳过并保留在本地，记录本身继续同步。 |
| 一直显示离线 | 检查网络；恢复后会自动重试，也可以点「立即同步」。 |
| 设置页出现「需要确认」 | 检测到清空 / 导入 / 从快照恢复，或本机同步状态丢失。选择「保留云端并恢复」或「用本机覆盖云端」，之前不会自动同步。 |
| 新设备打开是空的 | 先连接同步码；如果本机之前清空过数据，会按空本地保护只拉取、不覆盖云端。 |
| 云端数据想彻底删除 | 在 Cloudflare 控制台删除对应 D1 数据库或表。这是不可逆操作，删除前请先在应用里导出备份。 |
| 换手机 / 清理浏览器 | 同步码只在本机，清理网站数据后需要重新输入同步码。平时请保管好码本身。 |

---

## 10. 安全提醒

- 同步码就是唯一凭证，**不要**截图发群、写进仓库、日志或工单。
- 服务端只保存哈希；即使数据库泄露也拿不到能直接使用的同步码。
- 本项目不需要把任何 API Token / 账号密码写进仓库或前端环境变量。
- 自动快照：服务端每次覆盖云端数据前会按天保存快照（保留最近 14 份），目前没有恢复 UI，但可用于人工排查。
- 本地破坏性操作（清空 / 导入 / 恢复快照 / 恢复模式重置）都会自动创建本地快照，并暂停自动同步等你确认。

---

## 11. 需要你手动执行的命令清单

按顺序打勾：

- [ ] `npm install`
- [ ] `npx wrangler login`（浏览器里自己授权）
- [ ] `npx wrangler whoami`（确认登录）
- [ ] `npx wrangler d1 create diet-diary-sync`（记下 `database_id`）
- [ ] 把 `database_id` 填进 `wrangler.toml`
- [ ] `npx wrangler d1 migrations apply diet-diary-sync --remote`（不可逆，确认库名）
- [ ] `npm run build`
- [ ] `npx wrangler pages project create bento-handbook --production-branch main`
- [ ] `npx wrangler pages deploy dist --project-name bento-handbook --branch main`
- [ ] 手机打开 `https://bento-handbook.pages.dev` 并「添加到主屏幕」
- [ ] 设置 → 云同步 → 开启 → 复制同步码
- [ ] 第二台设备输入同步码，按提示合并或恢复
- [ ] 在第二台设备打卡一条，回到第一台点「立即同步」，确认两边一致

以上命令全部由你执行；仓库与文档中不包含任何账号、密钥或同步码。
