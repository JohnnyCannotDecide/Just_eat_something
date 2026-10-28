# 便当手帐 🍱

每天三餐抽套餐决定吃什么，再逐个部件重抽、舍弃或手动添加；打卡后把吃掉的菜品收进 60 格印章图鉴（一餐可同时盖多枚），并在日历里留下当天的三餐状态与印章数。移动端优先（按 390px 宽设计），可安装为 PWA，离线也能记录。

- **技术栈**：React 19 + TypeScript（strict）+ Vite 8 + zustand + Vitest，PWA 使用 `vite-plugin-pwa` / Workbox。
- **数据**：主数据保存在浏览器 `localStorage`，自制菜图片保存在 `IndexedDB`，都只通过 `src/storage` 的端口访问，不存在服务端。
- **规则**：概率、保底、次数、印章阈值等数值只有一处来源 —— `src/config/gameConfig.ts`。

---

## 1. 运行

要求 Node.js ≥ 20.19。

```bash
npm install
npm run dev        # 本地开发，默认 http://127.0.0.1:5173
npm test           # Vitest 全量测试
npm run typecheck  # tsc -b
npm run build      # 类型检查 + 生产构建到 dist/
npm run preview    # 预览生产构建
npm run icons      # 重新生成 PWA 图标（源文件 public/favicon.svg）
npm run seed:demo  # 生成可导入的演示存档（仅开发用，见第 11 节）
```

> 开发模式下 Service Worker 关闭（`devOptions.enabled = false`）。
> 要验证安装与离线，必须 `npm run build && npm run preview -- --host 127.0.0.1 --port 4173`。

---

## 2. 四个页面

底部导航固定四项：**今日 / 日历 / 图鉴 / 设置**。

- **今日**：三餐抽套餐、重抽部件、打卡。顶部「今日概览」卡展示三餐状态（未抽 / 已抽 / 已打卡）、已摄入与目标热量（游客为 `?`）、今日印章数与抽卡券余额。
- **日历**：月历以周一为一周起点，每格显示日号、三个三餐状态点（灰描边 = 未抽、橙 = 已抽未打卡、绿 = 已打卡）和当日印章数。今天高亮，未来日期不可点，可自由向前后翻月。顶部四个指标：
  - **打卡天数**：当月至少一餐打卡的天数。
  - **三餐全勤**：当月三餐都打卡的天数。
  - **当前连续**：从今天（今天还没记录则从昨天）往前数，遇到第一个没有打卡的日期停止，可跨月；这个数字不随查看的月份变化。
  - **本月印章**：当月每一天印章数之和。同一道菜在同一餐里只算一次，出现在两餐则各算一次。
  - 点击任意日期从底部弹出只读详情：三餐的套餐、部件（名称、图、克数、热量）、印章以及当日合计热量。历史记录没有任何修改入口。
- **图鉴**：官方菜与自制菜共用的印章收集页，按菜品展示铜 / 银 / 金印章与累计打卡次数。
  - 顶部筛选：**全部 / 已收集 / 自制**；官方收集进度只统计官方菜，自制菜数量单独显示。
  - 右上角「＋」新建自制菜谱；自制卡可进入详情后编辑或删除。
  - 未收集的官方菜显示灰色剪影但名称可见；已归档的自制菜保留在图鉴和历史里，只退出抽卡。
- **设置**：个人档案、热量显示开关、含图片的备份导入导出、清空数据。

日历与日详情全部基于当天的套餐快照渲染，因此迁移后的旧记录、已归档或已从菜谱删除的菜品都还能正常显示；热量一律走 `formatKcal`，游客状态显示 `?`。

---

## 3. 新增一道菜

菜品数据与 UI 是分开的，新增一道菜需要按顺序改这些文件：

1. **`src/data/dishes.json`**：在 `dishes` 数组里加一项。

   ```json
   {
     "id": "my_dish",
     "name": "我的新菜",
     "rarity": "SR",
     "category": "staple",
     "meals": ["lunch", "dinner"],
     "ingredients": [
       { "ingredientId": "cooked_rice", "grams": 150 },
       { "ingredientId": "egg", "grams": 60 }
     ],
     "image": "/images/dishes/my_dish.png",
     "tip": "一句可爱的文案。",
     "cooking": {
       "method": "炒",
       "timeMinutes": 10,
       "steps": ["鸡蛋打散，热锅炒至熟透", "下米饭和配菜翻炒", "加盐调味后盛出"]
     }
   }
   ```

   - `id` 必须唯一且稳定，是存档、印章和图片文件名的键。
   - 热量不手填，由 `ingredients` 克数 × 食材热量实时计算。
   - `rarity` 只能是 `R` / `SR` / `SSR` / `UR`。
   - `category` 只能是 `staple` / `main` / `soup` / `drink` / `veg` / `fruit` / `snack`。
   - `meals` 是 `breakfast` / `lunch` / `dinner` 的非空子集。
   - `cooking`：`method` 只能是 `蒸` / `煮` / `炒` / `拌` / `烤` / `煎` / `炖` / `冲泡` / `免煮` / `外买`；`timeMinutes` 是整数分钟；`steps` 3~5 步、每步 ≤30 个字，含肉蛋海鲜的菜至少一步写“熟透”；`tips` 可选，一句小提醒。
   - `image` 写 `/images/dishes/{id}.png`；`stampImage` 可选，写 `/images/stamps/{id}.png`，存在时优先用作印章图。
   - `tip` 可选，一句话展示在抽卡结果里。

2. **`src/data/ingredients.json`**：用到的食材若不存在，先加进 `ingredients`。字段固定为 `id`（唯一且稳定）、`name`（展示名）、`kcalPer100g`（每 100 克热量，0~900 的整数或小数）。

3. **`src/ui/dishEmoji.ts`**：给新 `id` 配一个 emoji 兜底。图片缺失时界面显示它，不会出现破图。

4. **`src/data/combos.json`**：把新菜至少放进一个套餐。每项字段为：
   - `id`：唯一且稳定；
   - `name`：套餐展示名；
   - `meals`：`breakfast` / `lunch` / `dinner` 的非空子集；
   - `components`：菜品 `id` 组成的数组，1~4 个，每道菜都要包含套餐的餐次。

   稀有度**不在** `combos.json` 手填，由部件里最高的菜品稀有度推导；UR 菜品只出现在 UR 套餐里。

5. **`src/data/data.test.ts`**：更新数量断言。当前为 60 道菜、66 种食材、40 个套餐，稀有度分布 R29 / SR19 / SSR9 / UR3；新增后同步修改，否则测试会失败。

6. 图鉴会自动多出一格，不需要改页面组件。

---

## 3.1 自制菜谱

图鉴右上角的「＋」可以新建自制菜，不需要改代码。

- **字段**：名称（≤ 20 字）、图片或 emoji 图标、分类、适合餐次、热量来源（按食材 / 直接填总热量）、可选做法、稀有度、「加入抽卡池」开关。
- **稀有度**：只能是 `customDishAllowedRarities`（`src/config/gameConfig.ts`，默认 `R` / `SR`）。改这个数组即可放开或收紧，表单和图鉴会一起生效。
- **热量展示**：自制菜在列表、详情里的热量同样受「显示热量」开关控制（游客或关闭时显示 `?`）；填写表单时的热量输入框不受影响。
- **食材**：可以从官方食材、我的食材里选，也可以新建；同名的自制食材会复用已有记录。
- **图片**：上传后自动居中裁成正方形，压缩为 512 × 512 的 WebP（不支持时退回 JPEG），单张入库上限 1 MB；不上传则使用 emoji 图标。
- **玩法**：打开「加入抽卡池」后会自动生成一个隐藏的单部件套餐（`custom_combo:<dishId>`），能被抽到、重抽或手动添加；打卡后按现有印章模板盖印，优先使用上传的图片。
- **编辑**：只影响之后的抽卡与图鉴，历史记录里的部件快照不会改变；换图后旧图会在确认无人引用后删除。
- **删除**：只要这道菜出现在任何打卡记录或快照/草稿里，就改为**归档**——不再被抽到，图鉴与历史照常保留；完全没有引用时才彻底删除，并清理只被它使用的自制食材与图片。

---

## 4. 图片规范

- 尺寸：**512 × 512 PNG**，正方形。
- 格式：PNG，透明背景，sRGB；建议单张 ≤ 200 KB。
- 构图：主体居中，四周留一点空白（印章会裁成圆形）。
- 路径：
  - 菜品图：`public/images/dishes/{dishId}.png`
  - 可选印章图：`public/images/stamps/{dishId}.png`
- JSON 里写站点绝对路径，例如 `/images/dishes/white_rice.png`。

当前仓库没有真实图片，因此首次打开会出现图片 404，界面用 emoji 兜底，这是预期行为。放入图片后无需改代码即可生效。

图片**不会**在安装时预缓存，而是用 Workbox 运行时 `CacheFirst`（缓存名 `diet-diary-images`，最多 100 张 / 30 天）：第一次浏览后离线可用。如果希望安装完就拥有全部图片，把图片通配加回 `vite.config.ts` 的 `workbox.globPatterns`（注意：没有图片时会产生空 glob 构建警告）。

---

## 5. 调整规则

所有数值都在 `src/config/gameConfig.ts`，不要写进组件或 `src/core` 的调用处。

| 想改什么 | 改哪里 |
| --- | --- |
| 稀有度概率 | `RARITY_WEIGHTS`（四项总和必须为 100） |
| 部件重抽是否扣一次抽卡并参与保底 | `componentRedrawCostsDraw`（`true` 时按一次正式抽取计费、计保底；`false` 时免费且不改变保底） |
| 自制菜可选的稀有度 | `customDishAllowedRarities`（默认 `['R', 'SR']`，表单选项与图鉴一起生效） |
| 时间轴内联印章上限（超出显示 `+N`） | `STAMP_DISPLAY.maxInline` |
| 保底触发次数 / 保底范围 | `PITY.missThreshold`、`PITY.guaranteedRarities` |
| 每餐基础抽 / 广告抽次数、券有效期 | `DRAW_LIMITS` |
| 次数消耗顺序 | `DRAW_SOURCE_ORDER`（默认基础 → 券 → 广告） |
| 打卡奖励抽卡券 | `TOKEN_REWARDS` |
| 铜 / 银 / 金印章阈值 | `STAMP_TIERS`（默认 1 / 3 / 7） |
| 模拟广告倒计时 | `AD.mockCountdownSeconds` |
| 基础代谢公式系数 | `BMR_FORMULA` |
| 活动系数 | `ACTIVITY_LEVELS` |
| 减脂 / 维持 / 增肌调整 | `GOAL_ADJUSTMENTS` |
| 目标热量安全下限 | `CALORIE_SAFETY_FLOOR` |

改完运行 `npm test`，规则对应的 core 测试会明确告诉你哪些地方需要同步。界面文案在 `src/ui/copy.ts`，热量展示统一走 `src/ui/formatKcal.ts` 的 `formatKcal`（关闭显示或值为 `null` 时返回 `?`）。

---

## 6. 数据与备份

- 业务代码只通过 `src/storage` 的端口读写，禁止直接调用 `localStorage` 或 `IndexedDB`：`StorageAdapter` 管 JSON，`BinaryStorageAdapter` 管图片，`AppStorage` 门面同时实现两者，业务侧只 import `storage` / `imageStorage`。
- `LocalStorageAdapter` 的键前缀是 `diet-diary:`，主数据键是 `app-data`，当前 `schemaVersion = 2`。
- 自制菜图片存在 `IndexedDB`（库 `diet-diary`，store `images`），主数据只在 `customDishes`、部件快照等处保存 `imageId`（`img:<uuid>`）。渲染时按需读取并转成 object URL，组件卸载即回收。
- 图片写入顺序为「先图后数据」；换图时新图写入成功、数据保存成功后才删除旧图，且只有确认没有任何地方引用时才删，避免历史破图。
- 每餐保存的是**套餐快照**：候选套餐、选中套餐、每个部件的来源（套餐 / 重抽 / 手动 / 自定义）、克数、勾选与舍弃状态。历史记录不依赖当前菜品库，改菜谱或归档都不会改变旧记录。
- 旧存档迁移（v1 → v2）：
  - 旧的 `candidateDishIds` / `selectedDishId` / `actualGrams` 会转成套餐快照：每个候选变成 `candidateCombos` 里一条（单道菜记录转成“单部件临时套餐”），选中项写到 `selectedCandidateId`，克数写进部件快照的 `grams`。
  - 同时补上 `customDishes: []`、`customIngredients: []` 等 v2 新字段；热量、抽卡次数、券、印章、保底和档案原样保留。
  - 迁移只在读取时执行，可重复执行且不会二次改写；写入磁盘前把 `schemaVersion` 提升为 2。
  - 导入旧的纯 AppData JSON（不含图片）时同样走这条迁移；备份外层格式（`format` / `version`）与数据版本是两回事。
  - 存档的 `schemaVersion` 高于当前应用支持的 2 时拒绝启动，避免旧版本覆盖新数据。
- 首次打开直接进入「今日」页，不需要先填档案；游客状态下所有展示型热量显示为 `?`。
- 设置页提供：
  - **个人档案**（可选）：填写后自动计算目标热量并打开热量显示，可手动覆盖目标、单独切换「显示热量」、清除档案。只有首次保存会自动打开，之后修改档案会保留用户当前开关。有档案的老用户自动视为已打开。
  - **导出备份**：下载 `diet-diary-YYYY-MM-DD.json`，格式为 `{ format: 'diet-diary-backup', version: 1, exportedAt, data, images }`。`data` 是完整存档，`images` 里是被引用的图片（`{ imageId, mime, base64 }`）。
  - **导入备份**：覆盖当前全部数据。兼容旧的纯存档 JSON（视为不含图片）。导入前会完整校验图片 id / mime / base64 / 数量与体积，写入失败会回滚本次新建的图片并保留原数据。失败时在页面内提示，不会切到启动错误页。
  - **备份上限**：单图 ≤ 1 MB、图片合计 ≤ 12 MB、最多 200 张、整份 JSON ≤ 25 MB（见 `src/config/storageLimits.ts`）。超限时提示先清理自制菜。
  - **清空数据**：先弹出说明弹窗，红色按钮二次确认；主数据与图片一起清除，清空后回到游客状态的今日页。
- 数据自愈：
  - 存储里不是合法 JSON → 按空数据处理。
  - 合法 JSON 但结构损坏 → 原始值备份到 `app-data:corrupt-backup`（实际键 `diet-diary:app-data:corrupt-backup`），然后以空数据启动。
  - 数据版本高于当前应用 → 拒绝启动，提示更新应用，避免旧版本覆盖新数据。
- 跨天按本地日期键切换；时钟回拨会切回对应日期的历史记录，不会删除任何一天。抽卡券只在当天有效。

---

## 7. 接入真实广告 SDK

1. 实现 `src/core/adProvider.ts` 里的 `AdProvider` 接口：

   ```ts
   export interface AdProvider {
     showRewardedAd(): Promise<boolean>
   }
   ```

   建议新建 `src/ui/ads/RealAdProvider.ts`，内部调用 SDK；**只有完整看完才 resolve `true`**，关闭、跳过、加载失败都 resolve `false`。

2. 替换使用位置：
   - `src/ui/pages/TodayPage.tsx` 中的 `mockAdProvider`；
   - `src/ui/components/gameplay/AdModalHost.tsx`（若 SDK 自带全屏 UI，可连同 `AdModalHost` 一起移除）。

3. 发奖逻辑不要改：`useAppStore.completeAdDraw(type, true, requestedDateKey)` 只在拿到 `true` 后调用；跨天回执由 store 的 `stale` 守卫处理。

---

## 8. 接入云同步

1. 实现 `src/storage/CloudSyncAdapter.ts` 的九个方法：JSON 端口 `get` / `set` / `remove` / `exportAll`，图片端口 `getImage` / `putImage` / `deleteImage` / `clearImages`，保持与本地适配器相同的语义（读取失败返回 `null`，写失败抛错）。当前占位实现会全部抛错，不会静默丢图。
2. 在 `src/storage/index.ts` 决定使用哪个适配器（例如按登录状态切换 `storage` 单例）。业务代码已经全部依赖 `storage`，不需要改动。
3. 以下内容属于后续工作，当前未实现：离线缓存、冲突合并策略、schema 迁移、多设备同步队列。store 内的写操作已经串行化（`enqueue`），接入时可复用它保证单写。

---

## 9. PWA 与离线

- `registerType: 'autoUpdate'`：新版本由浏览器自动更新，不弹更新提示。
- manifest：名称“便当手帐 · 每日抽卡饮食打卡”，主题色 / 背景色 `#FFF6E8`，`display: standalone`，`orientation: portrait`。
- 图标由 `npm run icons` 根据 `public/favicon.svg` 生成（配置在 `pwa-assets.config.mjs`），包括 64 / 192 / 512 与 maskable 512。
- 预缓存只包含应用外壳（JS / CSS / HTML），首次访问后即可离线启动；`localStorage` 数据本来就是本地的。
- 安装：在 Chrome / Edge 地址栏的安装按钮或菜单里选择“安装便当手帐”；iOS Safari 用“分享 → 添加到主屏幕”。

验证离线：

```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

打开一次让 Service Worker 接管，然后在 DevTools → Application → Service Workers 勾选 Offline 后刷新。

---

## 10. 测试与排错

- `npm test`：core 规则、存储、store、选择器与纯函数；不使用 React Testing Library，交互靠手动验收。
- `npm run typecheck`、`npm run build`：类型与构建必须同时通过。
- 移动端基准：390 × 844 @2x。检查页面无横向溢出、主要按钮 ≥ 44px、底部导航不被 home indicator 遮挡、输入框字号 ≥ 16px（避免 iOS 聚焦缩放）。
- 构建时若看到图片相关警告，确认没有把空目录写进 `globPatterns`。

### 已知限制

- 官方菜仍没有真实图片 / 印章图，当前显示 emoji；自制菜可上传图片。
- 时间轴餐卡底部的并排印章缩到 44px 后，SVG 里的日期 / 次数文字只是装饰（约 4~5px），可读信息请到图鉴或日详情查看；印章簇放不下时会整行换行，不会挤压变形。
- 390px 是设计基准；320~360px 只做基础兜底，刘海 / 挖孔屏横屏时安全区内边距封顶 28px，内容仍可能比常规机型窄。
- 浏览器隐私模式或禁用 IndexedDB 时图片无法保存/读取，自制菜会退回 emoji，已有图片在页面上可能不显示。
- **schemaVersion 仍为 2**：旧构建（本次变更之前的 v2）读到含自制菜的新存档时，下次保存会丢弃 `customDishes` / `customIngredients` 等新字段和 `imageId`。升级后请不要回退到旧版本再保存。
- 广告是本地模拟，未接入真实 SDK。
- 云同步仅有接口占位（`CloudSyncAdapter` 会明确抛错）。
- 日历只读展示历史，不支持补打卡或修改过去的记录。
- 成就、分享尚未实现。
- iOS 上下载 JSON 备份可能打开分享/预览面板，而不是直接保存到“文件”。
- 未来 schema 版本需要先补迁移（`src/storage/appData.ts` 的 `APP_DATA_MIGRATIONS`），否则应用会拒绝启动。

---

## 11. 开发用演示数据

`scripts/seed-demo-data.mjs` 用固定伪随机种子生成一份可以直接导入的 v2 存档，用来检查月历、连续打卡、断签和只读详情。它只读取 `src/data/*.json` 在 Node 里拼装模拟记录，**不参与构建**：脚本在 `src/` 之外，`dist/` 里不会出现它，也不会出现任何演示数据。

```bash
npm run seed:demo                              # 默认：往前 45 天，写入 .local/seed-demo-data.json
npm run seed:demo -- --days 60                 # 时间窗口长度（7~365，默认 45）
npm run seed:demo -- --today 2026-10-29        # 指定“今天”，方便复现
npm run seed:demo -- --seed 7                  # 换一个伪随机种子
npm run seed:demo -- --out .local/demo.json    # 指定输出路径（不允许写进 src/ 或 public/）
npm run seed:demo -- --stdout                  # 只打印到标准输出，不落盘
```

生成的数据里有：今天三餐分别处于已打卡 / 已抽未打卡 / 未抽；若干全天断签；若干三餐全勤；一条自定义记录；一条没有热量的自定义记录；以及一道已经从菜谱删除的菜（`ghost_archived_dish`，印章仍保留）。默认窗口 45 天，其中一部分日期的记录被刻意留空，因此实际有记录的日期少于 45 天。

导入与验证：

1. `npm run seed:demo`
2. 打开应用 → 设置 → 导入备份 → 选择 `.local/seed-demo-data.json`（会覆盖当前数据，先自行导出备份）
3. 进入「日历」Tab，向前翻一个月，确认今天高亮、三餐状态点、每日印章数、断签处的连续天数，以及点击某天打开的只读详情
4. 需要清空时：设置 → 清空数据

`.local/` 已加入 `.gitignore`，生成物不会被提交。脚本自身的回归测试跑 `npm test`（`scripts/seed-demo-data.test.mjs`）。
