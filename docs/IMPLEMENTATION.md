# Kanban Studio 实现说明与交接

> 当前状态：**0.4.0，首次公开发布**。TypeScript + esbuild 工程，已在 Obsidian 1.12.7 里由用户日常使用验证；§3 里 🟡 的是没有自动化测试、靠手动使用确认的部分。

---

## 1. 代码结构（`src/`）

| 文件 | 说明 |
|---|---|
| `main.ts` | `StudioKanbanPlugin` 入口：注册视图、命令、菜单、事件；设置读写；强调色；保存图片；新建看板 |
| `settings.ts` | `StudioKanbanSettings` 类型、`DEFAULT_SETTINGS`、`SettingsTab` |
| `i18n.ts` | 界面文字（中文 / English）、`t()`、`resolveLanguage`（纯模块） |
| `constants.ts` | `VIEW_TYPE`、`FM_KEY`、优先级表、`SHOW_FIELDS`、`ACCENT_PRESETS`、`IMAGE_*`、`FONT_SIZES` |
| `model/types.ts` | `Board` / `Column` / `Card` / `ImageRef` |
| `model/parse.ts` | `parseCardLine` `parseBoard` `serializeCard` `serializeBoard` `uid`（纯函数，不依赖 obsidian） |
| `model/images.ts` | `parseImageLine` `splitNotes` `IMG_EXT_RE`（纯函数） |
| `util/color.ts` | `accentInk`（纯函数） |
| `util/format.ts` | `dayDiff` `fmtDate` `initials` `fmtMoney` `isOverdue`（用 obsidian 的 moment） |
| `util/dom.ts` | `btn` `hasFiles` `imageFilesOf` |
| `view/KanbanView.ts` | 主视图：状态、筛选、顶部栏、看板列、菜单、`moveCard`、`resolveImage` / `openLightbox` |
| `view/sidebar.ts` | 侧栏 |
| `view/card.ts` | `renderCard` `renderImage` `renderEmpty` |
| `view/dnd.ts` | 列的拖放、占位符 |
| `view/list.ts` | 列表视图 |
| `view/filters.ts` | `VIEW_FILTERS` |
| `view/segmented.ts` | 分段按钮的滑块动画（弹簧、文字渐变、拖动），位置存在 `KanbanView.segMemory`，跨重绘接着滑 |
| `view/scroll.ts` | 鼠标横向滚动（绑在整个主区上） |
| `modals/*.ts` | `CardModal` `PromptModal` `ImageSuggestModal` `ImageLightbox` |

`view/*.ts` 里拆出去的函数第一个参数是 `view`，状态都还在 `KanbanView` 上。

### 数据流
```
.md 文件 ──setViewData──▶ parseBoard ──▶ this.board（内存对象）──render──▶ DOM
                                              │
                         用户操作修改 board ───┘
                                              │
                    commit(): serializeBoard ─▶ requestSave() ─▶ 写回 .md ─▶ 重新 render
```
- 每次修改都是**整体重新渲染**（`render()` / `renderMain()`），会保留看板的横向滚动位置。搜索框输入只重绘主区，避免输入框失去焦点。
- 侧栏显示 / 隐藏只切换 CSS class，不重绘，所以有过渡动画。
- 插件设置是全局的（`data.json`）；只属于某个看板的设置（完成列 `doneColumn`、各列排序 `sort: {列名: "date-asc" | "date-desc"}`）写在这个看板文件末尾的 `%% studio-kanban:settings {...} %%` 里。

---

## 2. 文件格式（不能随便改，要向后兼容）

```markdown
---
studio-kanban: board          ← 有这个属性的笔记才会自动以看板打开
title: 现场问题整改            ← 可选
---

## 列名

- [ ] 标题 !high @2026-10-05 ~张伟 ¥1280 #土建
	第一行描述（作为副标题）
	![[照片.jpg]]

%% studio-kanban:settings {"doneColumn":"今日关闭"} %%
```

解析规则：
- `## ` 开头的是一列；列名不能重复（完成列靠列名识别）。
- `- [ ]` / `- [x]`（前面最多一个空格）是一张卡片，必须在某一列下面。
- 卡片下面用 Tab 或 ≥2 个空格缩进的行，都是这张卡片的描述（`notes`）。
- 描述里**单独占一行**的 `![[*.png|jpg|…]]` 或 `![](…)` 算作图片；其余是文字。顺序保留。
- 卡片行里的标记（顺序随意，每种只取第一个，标签可以有多个）：

| 标记 | 字段 | 正则要点 |
|---|---|---|
| `!critical/high/medium/low` 或 `!紧急/高/中/低` | priority | 统一存成英文 |
| `@YYYY-MM-DD` 或 `📅 YYYY-MM-DD` | date | 写回时统一用 `@` |
| `~名字` / `~"带空格的名字"` | assignee | |
| `¥ $ € £` 后跟数字 | value + currency | 写回时去掉千分位逗号 |
| `#标签` | tags[] | |
| 剩下的文字 | title | |

- 不认识的行：在第一列之前的原样保留（`preamble`）；在列里的追加到这一列的末尾（`extra`）。
- **已知的格式会变的地方**：第一次保存后，标记会被规范化（`📅` → `@`、`!高` → `!high`、金额去掉逗号），并且空行会统一。之后再保存内容就稳定不变了（有测试保证）。

---

## 3. 功能清单与验证状态

✅ = 有单元测试  🟡 = 已实现但没在 Obsidian 里验证过

| 功能 | 状态 |
|---|---|
| Markdown 解析 / 写回 | ✅ |
| 带 frontmatter 的笔记自动以看板打开；看板 ↔ Markdown 切换 | 🟡 |
| 新建看板（功能区图标、命令、文件夹右键菜单） | 🟡 |
| 卡片：新建 / 编辑 / 删除 / 标为完成 / 移到其他列（右键菜单） | 🟡 |
| 拖拽卡片排序和换列；拖进完成列自动打勾 | 🟡 |
| 列：新建 / 重命名 / 左右移动 / 设为完成列 / 删除 | 🟡 |
| 侧栏筛选：全部 / 进行中、搜索、视图、标签、成员；已完成 | 🟡 |
| 看板视图 / 列表视图；紧凑模式 | 🟡 |
| 每列折叠"还有 N 张" | 🟡 |
| 字体大小三档 | 🟡 |
| 侧栏隐藏（按钮 / 命令 / 设置），会记住 | 🟡 |
| 显示项开关（设置 + 顶部"显示"菜单） | 🟡 |
| 图片：上传、粘贴、拖到弹窗或卡片、从库中选择、设为封面、移除 | 🟡（识别 ✅） |
| 图片：大图 / 缩略图、三档高度、裁剪 / 完整显示、大图预览 | 🟡 |
| 强调色预设 + 自定义，文字黑白自动切换 | 🟡（计算 ✅） |
| 深色模式 | 🟡 |
| 点击标题编辑（改 frontmatter `title` 或重命名文件） | 🟡（读写 title ✅） |
| 鼠标左右滚轮 / Shift + 滚轮横向滚动看板 | 🟡 |
| 侧栏底部「设置」按钮 | 🟡 |
| 列排序（按日期正序 / 倒序，存在看板文件里） | 🟡（排序规则、往返 ✅） |
| 放不下才折叠；新卡片所在列自动展开 | 🟡 |
| 分段按钮滑块动画（点击、拖动） | 🟡（弹簧、拖动换算、DOM 流程 ✅） |
| 界面语言：跟随 Obsidian / 中文 / English | 🟡（词条完整性、语言选择 ✅） |

---

## 4. 已知问题和缺口（建议在 Code 里优先处理）

**稳定性 / 正确性**
1. **自动以看板打开**目前靠监听 `file-open` 后切换视图，可能会先闪一下 Markdown。更稳的做法是像 obsidian-kanban 那样拦截 `WorkspaceLeaf.setViewState`（用 monkey-around）。
2. 卡片 `id` 每次解析都会重新生成，没有存进文件。现在不影响功能，但如果以后要做撤销、增量渲染或跨看板链接，就需要稳定的 id（比如 `^block-id`）。
3. ~~列名重复时完成列和筛选会出错~~：新建 / 重命名时已校验（0.4.0）。手写进文件的重复列名仍然可能出现，界面不会自动改名。
4. ~~删除列用 `window.confirm`~~ 已换成 Obsidian 弹窗；删除卡片 6 秒内可撤销（0.4.0）。
5. 外部修改文件（比如同步）时，依赖 `TextFileView` 自带的重新加载，没测过冲突的情况。

15. **横向滚轮偶尔失灵（已解决，原因在鼠标驱动）**：结论 —— MX Master 4 + Logi Options+ 的拇指滚轮开着「平滑滚动」时，Options+ 模拟的横向滚动在 Obsidian（Chromium）里会变成没有方向的空事件。2026-10-05 用户在 Options+ 里给 Obsidian 单独关掉拇指滚轮的平滑滚动后恢复正常（README 已写）。以下是排查记录：2026-10-05 用排查日志（命令「开始 / 停止记录鼠标滚动」，写到插件目录 `wheel-log.txt`）录了两段。正常时鼠标左右拨动发 `deltaX = ±100`，插件全部正确处理；失灵的那段里，拨动发出的是成串的 `deltaX = deltaY = 0` 的空滚轮事件，插件拿不到方向。现在会退而读 `wheelDeltaX`。17:54 那段（新版、缩放 150%）确认：失灵时 `deltaX/deltaY/wheelDeltaX/wheelDeltaY/deltaZ` 全是 0，也没有侧键或按键信号，Chromium 自己也不滚 —— 事件里根本没有方向，插件无从补救，问题在鼠标驱动 / Windows 这一层。同段里看板有三次大幅跳动，都紧跟在中键按下（button=1）之后，是 Chromium 的中键自动滚动，不是拨轮信号。上下滚轮和 Shift + 滚轮始终正常。用户的鼠标是 MX Master 4 + Logi Options+：Obsidian 用的是默认配置，拇指滚轮的横向滚动由 Options+ 模拟（CUSTOM_HORIZONTAL_SCROLL）且开着「平滑滚动」。空事件每 16～17ms 一个，像 Options+ 按 60Hz 注入的平滑滚动；怀疑是平滑模式注入的横向滚动 Chromium 收不到方向。已验证：关掉后正常。

**还没做的交互**
6. 搜索框旁边显示了 `/`，但快捷键还没绑定。
7. 列只能通过菜单左右移动，不能拖拽。
8. 紧凑模式、看板 / 列表模式、侧栏分组的折叠状态都没有记住（侧栏显示与否已经记住了）。
9. 卡片描述是纯文本显示，没有渲染 Markdown（加粗、链接等）。可以用 `MarkdownRenderer.render`。
10. 列表视图不能排序。
11. 没有键盘拖拽（无障碍）。

**设计细节**
12. `--sk-text-3` 对比度 4.49:1，建议调到 `#6F7277`。
13. 深色模式 + "石墨"强调色几乎看不见；可以在深色模式下给强调色做自动提亮，或者把这个预设标注为"仅浅色"。
14. 头像只显示名字缩写，没有颜色区分。

---

## 5. 迁移到正式工程（建议步骤）

1. 用官方模板 `obsidianmd/obsidian-sample-plugin`（TypeScript + esbuild）建项目，`manifest.json` 沿用这里的。
2. 按下面拆文件，**先做到行为完全一致**，再改功能：
   ```
   src/
     main.ts              插件入口（StudioKanbanPlugin）
     settings.ts          DEFAULT_SETTINGS、类型、SettingsTab
     constants.ts         优先级、预设、显示项
     model/parse.ts       parseBoard / parseCardLine / serialize*（纯函数）
     model/images.ts      parseImageLine / splitNotes
     model/types.ts       Board / Column / Card 类型
     view/KanbanView.ts   主视图
     view/card.ts         renderCard / renderImage
     view/sidebar.ts      侧栏
     view/dnd.ts          拖拽
     modals/*.ts          CardModal / PromptModal / ImageSuggestModal / ImageLightbox
     util/color.ts        accentInk
   styles.css             直接沿用
   tests/                 换成 vitest，用例照搬 tests/parse.test.js
   ```
3. 类型定义（建议）：
   ```ts
   type Priority = 'critical' | 'high' | 'medium' | 'low' | '';
   interface Card { id: string; title: string; priority: Priority; date: string; assignee: string;
     value: string; currency: string; tags: string[]; notes: string[]; done: boolean; }
   interface Column { title: string; cards: Card[]; extra: string[]; }
   interface Board { frontmatter: string; preamble: string[]; columns: Column[]; settings: { doneColumn?: string }; }
   ```
4. 用 `pjeby/hot-reload` 插件在开发库里热重载，逐项过一遍 §3 的清单，把 🟡 变成 ✅。
5. 再处理 §4 的问题。

---

## 6. 测试

```bash
npm test                 # vitest：tests/*.test.ts
```
- `tests/parse.test.ts`：照搬原型的 5 个用例，覆盖示例看板往返稳定、卡片标记解析、图片行识别、带图片卡片往返、强调色黑白文字。
- `tests/scroll.test.ts`：横向滚动（小步长在 Windows 缩放下不被取整吞掉、两端停住、不拦截上下滚动）。
- `tests/segmented.test.ts`、`tests/segmented.dom.test.ts`：滑块的弹簧（停稳时间、回弹幅度、卡帧不发散）、拖动换算和吸附；DOM 流程用 happy-dom 模拟（重绘后接着滑、拖完只触发一次、减少动态效果）。
- `tests/i18n.test.ts`：每个词条中英文都有、占位符一致，源码里用到的 key 都存在，语言选择规则。
- 迁移时用过的对照测试（新旧代码逐字比对）随原型一起在 0.4.0 发布前删除，见 git 历史。
