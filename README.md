# 便当手帐 🍱

每天三餐抽套餐决定吃什么，再逐个部件重抽、舍弃或手动添加；打卡后把吃掉的菜品收进 94 格印章图鉴（一餐可同时盖多枚），并在日历里留下当天的三餐状态与印章数。移动端优先（按 390px 宽设计），可安装为 PWA，离线也能记录。

- **技术栈**：React 19 + TypeScript（strict）+ Vite 8 + zustand + Vitest，PWA 使用 `vite-plugin-pwa` / Workbox。
- **数据**：主数据保存在浏览器 `localStorage`，自制菜图片保存在 `IndexedDB`，都只通过 `src/storage` 的端口访问。应用是本地优先的；可选的云同步把数据备份到你自己的 Cloudflare D1（Pages Functions），不开也能正常使用，见第 8 节与 [DEPLOY.md](DEPLOY.md)。
- **规则**：概率、保底、次数、印章阈值等数值只有一处来源 —— `src/config/gameConfig.ts`。

---

## 1. 运行

要求 Node.js ≥ 20.19。

```bash
npm install
npm run dev        # 本地开发，固定 http://localhost:5173（端口被占用会直接报错）
npm test           # Vitest 全量测试
npm run typecheck  # tsc -b
npm run build      # 类型检查 + 生产构建到 dist/
npm run preview    # 预览生产构建
npm run icons      # 重新生成 PWA 图标（源文件 public/favicon.svg）
npm run seed:demo  # 生成可导入的演示存档（仅开发用，见第 11 节）
npm run db:migrate:local  # 给本地 D1 建表（云同步接口开发用）
npm run dev:pages         # wrangler pages dev，本地 Functions + 本地 D1
npm run test:api          # 云同步接口测试（本地启动，绝不连线上库）
```

> 开发模式下 Service Worker 关闭（`devOptions.enabled = false`）。
> 要验证安装与离线，必须 `npm run build && npm run preview -- --host 127.0.0.1 --port 4173`。
>
> **本地数据按 origin 隔离**：端口固定为 5173 / 4173（`strictPort`），端口被占用时直接失败而不是漂到 5174。
> `localhost:5173` 与 `127.0.0.1:5173` 是两个不同的 origin，各自的 `localStorage` / `IndexedDB` 互不相通。
> 升级或切换浏览器时，请始终使用 Vite 打印的那个地址，不要把 `localhost` 换成 `127.0.0.1`，否则会看起来像数据丢了。
> 真要换 origin，先在设置 → 数据备份里导出 JSON，再在新地址导入。

---

## 2. 四个页面

底部导航固定四项：**今日 / 日历 / 图鉴 / 设置**。

- **今日**：三餐抽套餐、展开套餐卡查看部件、重抽、打卡。顶部「今日概览」卡展示三餐状态（未抽 / 已抽 / 已打卡）、已摄入热量（始终显示）、目标与余量（需要个人档案）、今日印章数与抽卡券余额。
  - 套餐卡点头部展开 / 收起，带箭头与动画，多张卡可各自独立展开；「选这套」是卡内独立按钮。未选中的卡展开后是只读预览，只有已选中的卡能重抽 / 舍弃 / 添加部件；点部件行里的按钮不会收起卡片。
- **日历**：月历以周一为一周起点，每格显示日号、三个三餐状态点（灰描边 = 未抽、橙 = 已抽未打卡、绿 = 已打卡）和当日印章数。今天高亮，未来日期不可点，可自由向前后翻月。顶部四个指标：
  - **打卡天数**：当月至少一餐打卡的天数。
  - **三餐全勤**：当月三餐都打卡的天数。
  - **当前连续**：从今天（今天还没记录则从昨天）往前数，遇到第一个没有打卡的日期停止，可跨月；这个数字不随查看的月份变化。
  - **本月印章**：当月每一天印章数之和。同一道菜在同一餐里只算一次，出现在两餐则各算一次。
  - 点击任意日期从底部弹出只读详情：三餐的套餐、部件（名称、图、克数、热量）、印章以及当日合计热量。历史记录没有任何修改入口。
- **图鉴**：官方菜与自制菜共用的印章收集页，按菜品展示铜 / 银 / 金印章与累计打卡次数。
  - 顶部筛选：**全部 / 已收集 / 自制**；官方收集进度只统计官方菜，自制菜数量单独显示。
  - 顶部搜索框只匹配**已收集的官方菜**与**自制菜**（含归档）；未收集官方菜不参与搜索。
  - 右上角「＋」新建自制菜谱；自制卡可进入详情后编辑或删除。
  - 未收集的官方菜名称统一显示为 `???`，只展示灰色剪影、稀有度色环和类别图标；详情页只显示「吃一次就解锁」。真实名称、图片、食材、做法、热量和 tip 都不会进入视图，卡片 aria-label 也只写「未收集的菜品」。
  - 自制菜（含未收集、归档）不受影响，始终显示真实名称与图片；已归档的自制菜保留在图鉴和历史里，只退出抽卡。
- **设置**：个人档案、外观主题、热量显示开关、含图片的备份导入导出、本地快照、可选的云同步、清空数据。

### 2.1 主题与设计令牌

三套主题通过 `<html data-theme="simple|cute|vivid">` 即时切换，默认 `cute`：

- **简单**：白 / 浅灰底、细描边、小圆角、蓝色单强调，关闭纸张纹理和胶带装饰。
- **可爱**：奶油暖色、圆角手帐、纸张圆点与胶带，保持原有观感。
- **炫彩**：深色紫底、霓虹洋红强调、更亮的稀有度光晕和描边卡片质感。

在「设置 → 外观」点预览卡切换，立即生效并写入 `settings.theme`；刷新后由 `index.html` 的同步脚本在首屏前恢复，避免深色主题闪白。PWA 的 `theme-color` 随主题更新，manifest 里的 `#FFF6E8` 只作为静态回退。系统开启「减弱动效」时，翻卡、印章入场和无限光效都会跳过等待或归零。

样式约定：

- `src/ui/styles/tokens.css` 是唯一允许写原始颜色、圆角、阴影、字体和动效字面量的文件；组件 CSS 只能引用令牌。
- 主题块使用裸 `[data-theme='x']` 选择器，因此设置页的预览卡可以各自嵌套渲染一套主题。
- 稀有度和印章颜色通过 `data-rarity` / `data-tier` 映射为局部变量，组件不把颜色写进内联样式；铜 / 银 / 金印章除颜色外还有 1 / 2 / 3 段外环刻度作为冗余线索。
- `src/ui/styles/themes.css` 只放无法用变量表达的结构差异，并在 `global.css` 最后引入。

日历与日详情全部基于当天的套餐快照渲染，因此迁移后的旧记录、已归档或已从菜谱删除的菜品都还能正常显示；热量一律走 `formatKcal` / `formatKcalWithUnit`，没有档案也会显示数字（只要「显示热量」开关开着）。

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
     "providesStaple": true,
     "providesProtein": true,
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
   - `providesStaple` / `providesProtein` 必填布尔值，用于校验午餐结构：每个午餐套餐至少要有一份主食和一份蛋白质（同一道菜可同时满足）。
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

5. **`src/data/data.test.ts`**：更新数量断言。当前为 94 道菜、86 种食材、68 个套餐，菜品稀有度分布 R44 / SR35 / SSR12 / UR3；新增后同步修改，否则测试会失败。

6. 图鉴会自动多出一格，不需要改页面组件。

---

## 3.1 自制菜谱

图鉴右上角的「＋」可以新建自制菜，不需要改代码。

- **字段**：名称（≤ 20 字）、图片或 emoji 图标、分类、适合餐次、热量来源（按食材 / 直接填总热量）、可选做法、稀有度、「加入抽卡池」开关。
- **稀有度**：只能是 `customDishAllowedRarities`（`src/config/gameConfig.ts`，默认 `R` / `SR`）。改这个数组即可放开或收紧，表单和图鉴会一起生效。
- **热量展示**：自制菜在列表、详情里的热量同样受「显示热量」开关控制（关闭时显示 `?`，没有数值时显示「未填」）；填写表单时的热量输入框不受影响。
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
| 每餐通过广告额外抽卡的次数 | `adExtraDrawsPerMeal`（默认 `null` 表示不设上限；`adUsed` 仍会累计，仅用于展示） |
| 每餐基础抽次数、券有效期 | `DRAW_LIMITS`（不再包含广告上限） |
| 次数消耗顺序 | `DRAW_SOURCE_ORDER`（默认基础 → 券 → 广告） |
| 打卡奖励抽卡券 | `TOKEN_REWARDS` |
| 铜 / 银 / 金印章阈值 | `STAMP_TIERS`（默认 1 / 3 / 7） |
| 模拟广告倒计时 | `AD.mockCountdownSeconds` |
| 基础代谢公式系数 | `BMR_FORMULA` |
| 活动系数 | `ACTIVITY_LEVELS` |
| 减脂 / 维持 / 增肌调整 | `GOAL_ADJUSTMENTS` |
| 目标热量安全下限 | `CALORIE_SAFETY_FLOOR` |

改完运行 `npm test`，规则对应的 core 测试会明确告诉你哪些地方需要同步。界面文案在 `src/ui/copy.ts`，热量展示统一走 `src/ui/formatKcal.ts`：`formatKcal(value, showCalories)` 返回纯数字，`formatKcalWithUnit` 返回带 `kcal` 的文本。值为 `null` 时返回「未填」，开关关闭时返回 `?`（`null` 优先，所以不会出现「未填 kcal」）。

---

## 6. 数据与备份

- 业务代码只通过 `src/storage` 的端口读写，禁止直接调用 `localStorage` 或 `IndexedDB`：`StorageAdapter` 管 JSON，`BinaryStorageAdapter` 管图片，`AppStorage` 门面同时实现两者，业务侧只 import `storage` / `imageStorage`。
- `LocalStorageAdapter` 的键前缀是 `diet-diary:`，主数据键是 `app-data`，当前 `schemaVersion = 6`。测试只使用 `test_diet-diary:`，开发种子只使用 `dev_diet-diary:`，二者都不会碰正式键。
- 打卡记录是**追加型事件**：`checkinEvents` 是唯一事实来源（每次正式打卡按菜品追加一条，同日重复打卡就是多条），`stamps` 只是由事件推导的缓存（次数 / 等级 / 日期）。事件只增不改，后续云同步用它做并集合并；`stamps` 不再作为独立写入口。
- 自制菜图片存在 `IndexedDB`（库 `diet-diary`，store `images`），主数据只在 `customDishes`、部件快照等处保存 `imageId`（`img:<uuid>`）。渲染时按需读取并转成 object URL，组件卸载即回收。
- 本地快照存在独立 `IndexedDB`（库 `diet-diary-snapshots`，store `meta` / `payloads`），保存 raw 存档与相关图片，保留最近 10 份。升级、清空、导入、恢复、清除档案前都会自动创建；快照写失败时破坏性操作直接中止。
- 图片写入顺序为「先图后数据」；换图时新图写入成功、数据保存成功后才删除旧图，且只有确认没有任何地方引用时才删，避免历史破图。
- 每餐保存的是**套餐快照**：候选套餐、选中套餐、每个部件的来源（套餐 / 重抽 / 手动 / 自定义）、克数、勾选与舍弃状态。历史记录不依赖当前菜品库，改菜谱或归档都不会改变旧记录。
- 旧存档迁移（v1 → v2）：
  - 旧的 `candidateDishIds` / `selectedDishId` / `actualGrams` 会转成套餐快照：每个候选变成 `candidateCombos` 里一条（单道菜记录转成“单部件临时套餐”），选中项写到 `selectedCandidateId`，克数写进部件快照的 `grams`。
  - 同时补上 `customDishes: []`、`customIngredients: []` 等 v2 新字段；热量、抽卡次数、券、印章、保底和档案原样保留。
  - 迁移只在读取时执行；先自动创建“升级前”快照，再在内存完成迁移并一次写回。写失败会用原 raw 回滚，不会留下半迁移状态；没有快照服务时拒绝迁移。
  - 导入旧的纯 AppData JSON（不含图片）时同样走这条迁移；备份外层格式（`format` / `version`）与数据版本是两回事。
- 旧存档迁移（v2 → v3）：
  - 只有一处改动：`settings.showCalories` 一律置为 `true`。v2 无法区分「用户主动关闭」和「旧版无档案强制关闭」，按 v3 规则统一打开；`profileHintDismissed` 与其它未知设置原样保留。
  - 档案、目标热量、抽卡次数、券、印章、保底、历史记录、自制菜与图片都不变。迁移同样先快照、失败回滚，且幂等（已迁移的数据再次加载不会重复迁移或产生新快照）。
- 旧存档迁移（v3 → v4）：
  - 补齐套餐命名快照：已有 `name` 原样保留；缺失时依次用 `baseName`、冻结的旧套餐名表、部件名拼合兜底，绝不因为缺名字丢弃候选。
  - 补上 `nameSource` / `baseName` / `baseDishIds`，手动名写入 `manualName`。未知字段与印章、券、保底、历史、自制菜数据都不变；迁移幂等，迁移前自动快照。
- 旧存档迁移（v4 → v5）：
  - 每个部件槽位补上 `seenDishIds`：开放中的候选以当前菜开局（`[dishId]`），自定义部件为空数组；已打卡历史一律为空，不追溯。重抽时据此排除本轮出现过的菜，耗尽后洗牌。
  - 每餐补上 `drawnComboIds`（本轮已抽到的套餐 id）。旧数据缺省时从候选的 `comboId` 去重推导，保持“已抽过的不再重复”的行为。
  - 未知字段、印章、券、保底、历史与自制数据都不变；迁移是纯函数、幂等，迁移前自动快照。
- 旧存档迁移（v5 → v6）：
  - 每个印章的 `checkInDates` 展开成确定性 id 的事件（`legacy:<dishId>:<dateKey>:<index>`，同日多次靠下标区分），`createdAt` 用 dish 内下标，推导出的日期顺序与原数组一致。
  - `checkInCount` 大于日期数的部分生成 `synthetic` 占位事件，只计入次数、不进入日期列表，保证次数与铜 / 银 / 金等级完全不变。
  - 已有合法 `checkinEvents` 会去重保留；未知字段逐层 `spread` 保留；迁移幂等，迁移前自动快照。
- 存档的 `schemaVersion` 高于当前应用支持的 6 时拒绝启动，避免旧版本覆盖新数据。
- 首次打开直接进入「今日」页，不需要先填档案；游客也能看到菜品、套餐、每餐与当日合计热量，只有「目标 / 余量 / 进度条」需要填档案（该位置显示「填写档案查看余量」入口）。
- 设置页提供：
  - **个人档案**（可选）：填写后自动计算目标热量，并显示目标 / 余量 / 进度条；可手动覆盖目标、单独切换「显示热量」、清除档案。保存或清除档案都不会改变「显示热量」开关（v3 起默认开启，超出目标用中性的「超出 xx kcal」文案，不做红色警示）。
  - **导出备份**：下载 `diet-diary-YYYY-MM-DD.json`，格式为 `{ format: 'diet-diary-backup', version: 1, exportedAt, data, images }`。`data` 是完整存档，`images` 里是被引用的图片（`{ imageId, mime, base64 }`）。
  - **导入备份**：先确认文件名与大小，确认后才覆盖当前全部数据，并在覆盖前自动创建“导入前”快照。兼容旧的纯存档 JSON（视为不含图片）。导入前会完整校验图片 id / mime / base64 / 数量与体积，图片按单事务批量写入，写入失败会回滚本次新建的图片并保留原数据。失败时在页面内提示，不会切到启动错误页。
  - **本地快照**：设置页列出最近 10 份快照（原因、时间、大小、图片数），可一键恢复；恢复前会再自动创建一份当前状态快照。
  - **备份上限**：单图 ≤ 1 MB、图片合计 ≤ 12 MB、最多 200 张、整份 JSON ≤ 25 MB（见 `src/config/storageLimits.ts`）。超限时提示先清理自制菜。
  - **清空数据 / 清除档案**：先弹出说明弹窗二次确认，执行前自动创建快照；清空后回到游客状态的今日页，仍可从快照恢复。
- 数据自愈（先读后写，任何异常都不会用默认值覆盖原数据）：
  - 启动时先读原始字符串：没有数据才算全新用户，落一次空存档。
  - 当前版本（v5）数据只做内存规范化，不回写磁盘；启动不会改变已有 `diet-diary:app-data` 的字节。
  - 不是合法 JSON 或结构损坏 → 原始值备份到 `app-data:corrupt-backup`（实际键 `diet-diary:app-data:corrupt-backup`），进入恢复页而不是空白手帐；可重新读取、下载原始数据或从快照恢复。
  - 数据版本高于当前应用 → 进入恢复页，只提供重新读取和下载原始数据，避免旧版本覆盖新数据。
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

## 8. 云同步（可选）

数据默认只在本地。设置页的「云同步」可以把记录备份到**你自己的** Cloudflare D1，并在多台设备之间合并；不开启时应用行为完全不变。部署步骤与手动命令清单见 [DEPLOY.md](DEPLOY.md)。

### 结构

- **服务端**：Cloudflare Pages Functions（`functions/api/sync/*`、`functions/api/images/*`）+ D1（`migrations/0001_init.sql` 的 `users` / `records` / `images` / `snapshots` / `snapshot_images`）。静态站仍是 `dist/`，函数与页面同源。Pages / Functions / D1 免费套餐不需要绑定支付方式。
- **共享常量**：请求体上限、单批条数、图片体积、限流、快照保留数等都在 `src/config/gameConfig.ts` 的 `SYNC` 里，客户端与 Functions 共用。
- **鉴权**：同步码由本机生成（160 位 → 32 位 Crockford Base32，按 4 位分组显示）。服务器只保存 SHA-256 哈希；轮换后旧哈希保留 10 分钟宽限，避免响应丢失把自己锁在外面。所有鉴权失败统一返回 401，不回显原因；同步码不会进入 AppData、导出备份、快照、日志或错误文案。
- **同步码只存本机**：放在独立前缀 `diet-diary-sync:` 的 `code` 键；同一前缀的 `state` 键保存 `deviceId`、`baseline`、`pending`、拉取游标、最近同步时间与状态。因此同步元数据**不进入 AppData**，存档仍是 `schemaVersion = 6`，也不需要新的迁移。sidecar 丢失或损坏时只备份原值并要求用户重新确认，绝不猜测后覆盖任何一边。

### 同步规则

- **记录投影**（`src/sync/canonical.ts`）：`meta/profile`（含手动目标热量）、`meta/settings`、`meta/pity`；每天拆成 `days/<dateKey>/breakfast|lunch|dinner` 与 `days/<dateKey>/meta`，两台设备同一天各打卡不同餐时两餐都保留；另有 `customDishes/<id>`、`customIngredients/<id>`、`checkins/<eventId>`。`stamps` 是派生缓存，不同步。
- **变更观察**（`src/sync/observer.ts`）：订阅 store 的 `data` 引用变化，覆盖打卡、重抽、自制菜、导入、清空、恢复等所有写路径；本地缺失的记录生成墓碑；编辑时间戳是 wall-clock Lamport（`max(now, lastStamp + 1)`），保证「刚拉取再编辑」一定比云端新。
- **合并**（`src/sync/merge.ts`）：普通记录按 `(updatedAt, deviceId)` 取新；墓碑删除旧记录，本地更晚的编辑可以复活；打卡事件取并集、只增不删，同 id 内容冲突保留云端并记 warning；合并后用事件重建印章。
- **拉取游标**：records 与 images 两条独立游标，只按完整 rev 块分页，避免同一 rev 被截断后跳过数据。增量拉取没返回的 key **不等于**云端删除。
- **空本地保护**：本机没有有效数据时只拉取、绝不推送；服务端对 `isEmpty` 的推送同样返回 409 兜底。
- **首次连接**：本机空、云端有 → 输入码后自动拉取恢复；本机有、云端空 → 确认后上传；两边都有 → 不写任何本地数据，由用户选择「合并」或「以云端为准」，两者都会先创建本地快照。
- **破坏性操作确认**：清空、导入备份、从快照恢复、恢复模式重置会把同步状态置为 `needs-confirm` 并清空待推送；用户选择「保留云端并恢复」或「用本机覆盖云端」之前不会自动同步。显式清空后云端不会被自动拉回本机。
- **离线与重试**：`pending` 持久化在 sidecar，断网/失败不会丢改动；回到前台、恢复网络、本地改动约 3 秒后都会自动重试，也可以手动「立即同步」。
- **图片**：只上传被引用且内容变化的图，客户端压到约 80 KB（服务端上限 256 KB）；只下载本地缺失的图，不覆盖已有本地图，也不传播图片删除。
- **服务端约束**：集合白名单、请求体 ≤ 2 MB、每用户约 60 次/分钟的基础限流、Origin 校验、rev 原子分配；打卡事件 `INSERT OR IGNORE`；覆盖已有数据前按天复制快照（`INSERT ... SELECT`，保留最近 14 天），快照失败则本次推送失败，不做无快照覆盖。

### 本地验证

```bash
npm run db:migrate:local   # 本地 D1 建表
npm run build
npm run dev:pages          # 8788，Functions + 本地 D1
npm run test:api           # 鉴权、LWW、墓碑、分页、限流、体积、快照等接口测试
```

`npm run dev`（5173）里的 `/api` 只在开发时代理到 `127.0.0.1:8788`；生产同源。测试与本地开发都只用本地 D1，不运行任何 `--remote` 命令，也不代表你登录 Cloudflare。

---

## 9. PWA 与离线

- `registerType: 'autoUpdate'`：新版本由浏览器自动更新，不弹更新提示。
- manifest：名称“便当手帐 · 每日抽卡饮食打卡”，`theme_color` / `background_color` 固定为可爱的 `#FFF6E8` 作为安装与首屏静态回退；运行时的 `meta[name="theme-color"]` 会按当前主题更新（简单 `#F4F6F8`、炫彩 `#150D24`）。`display: standalone`，`orientation: portrait`。
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

- `npm test`：core 规则、存储、store、选择器、同步引擎 / 合并 / 投影 / 运行时与纯函数；另有设计令牌守卫（组件 CSS 不允许原始颜色 / 字体 / 圆角 / 动效字面量）和三套主题的对比度 / 色差检查；不使用 React Testing Library，交互靠手动验收。
- `npm run test:api`：在本地启动 `wrangler pages dev` + 本地 D1，覆盖鉴权、轮换、LWW、墓碑、分页、空本地 409、图片往返、413 / 429 / 403、快照去重等接口行为；不会连接线上库。
- `npm run typecheck`、`npm run build`：类型与构建必须同时通过。
- 移动端基准：390 × 844 @2x。检查页面无横向溢出、主要按钮 ≥ 44px、底部导航不被 home indicator 遮挡、输入框字号 ≥ 16px（避免 iOS 聚焦缩放）。
- 构建时若看到图片相关警告，确认没有把空目录写进 `globPatterns`。

### 已知限制

- 官方菜仍没有真实图片 / 印章图，当前显示 emoji；自制菜可上传图片。
- 时间轴餐卡底部的并排印章缩到 44px 后，SVG 里的日期 / 次数文字只是装饰（约 4~5px），可读信息请到图鉴或日详情查看；印章簇放不下时会整行换行，不会挤压变形。
- 390px 是设计基准；320~360px 只做基础兜底，刘海 / 挖孔屏横屏时安全区内边距封顶 28px，内容仍可能比常规机型窄。
- 浏览器隐私模式或禁用 IndexedDB 时图片无法保存/读取，自制菜会退回 emoji，已有图片在页面上可能不显示。
- **schemaVersion 已升到 6**：v5 旧构建读到 v6 存档会按「版本高于应用支持」进入恢复页，不会覆盖数据，但也无法继续使用；升级后请不要回退到旧版本再保存。
- 广告是本地模拟，未接入真实 SDK。
- 云同步需要你自己部署 Cloudflare Pages + D1（见 [DEPLOY.md](DEPLOY.md)）；同步码丢失后无法从服务器找回云端数据，请自行保管。云端快照（最近 14 天）目前只保存，没有恢复 UI。跨设备冲突按 `(updatedAt, deviceId)` 解决，依赖设备时钟大致准确；客户端上报的时间会被服务端钳到当前时间 + 5 分钟以内。
- `src/storage/CloudSyncAdapter.ts` 仍是未使用的占位实现；云同步走的是 `src/sync/` 自己的 HTTP 传输层。
- 日历只读展示历史，不支持补打卡或修改过去的记录。
- 成就、分享尚未实现。
- iOS 上下载 JSON 备份可能打开分享/预览面板，而不是直接保存到“文件”。
- 未来 schema 版本需要先补迁移（`src/storage/appData.ts` 的 `APP_DATA_MIGRATIONS`），否则应用会拒绝启动。

---

## 11. 开发用演示数据

`scripts/seed-demo-data.mjs` 用固定伪随机种子生成一份可以直接导入的 v6 存档，用来检查月历、连续打卡、断签和只读详情。它只读取 `src/data/*.json` 在 Node 里拼装模拟记录，**不参与构建**：脚本在 `src/` 之外，`dist/` 里不会出现它，也不会出现任何演示数据。

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
2. 打开应用 → 设置 → 导入备份 → 选择 `.local/seed-demo-data.json`（仅开发用，会覆盖当前数据；应用会先确认并自动创建“导入前”快照）
3. 进入「日历」Tab，向前翻一个月，确认今天高亮、三餐状态点、每日印章数、断签处的连续天数，以及点击某天打开的只读详情
4. 需要清空时：设置 → 清空数据

`.local/` 已加入 `.gitignore`，生成物不会被提交。脚本自身的回归测试跑 `npm test`（`scripts/seed-demo-data.test.mjs`）。
