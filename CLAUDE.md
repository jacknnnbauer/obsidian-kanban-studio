# CLAUDE.md — Kanban Studio

Obsidian 看板插件。数据就是普通 Markdown（一个 `##` 是一列，一个 `- [ ]` 是一张卡片），UI 风格是黑白灰、大圆角、胶囊控件、一个强调色点缀。

## 先读这些
- `docs/IMPLEMENTATION.md`：代码结构、文件格式、功能验证状态、已知问题、迁移步骤 —— **开始改代码前必读**
- `docs/DESIGN.md`：设计变量、组件规格、动效、设置项
- `docs/reference.jpg`：最初的视觉参考图
- `examples/云栖书店-旗舰店开业筹备.md`：示例数据（虚构项目，README 截图用的就是它）

## 现状
- 已迁移成 TypeScript 工程（官方 sample plugin 模板 + esbuild），源码在 `src/`，结构见 IMPLEMENTATION.md §1。行为和 0.3.0 原型一致，没有加新功能。
- 0.3.0 的单文件原型已在发布前删除（还在 git 历史里，提交 5181a56）。
- 根目录的 `main.js` 是构建产物（已 gitignore），不要手改。
- **还没在真实的 Obsidian 里跑过。** 不要假设拖拽、图片、自动打开这些功能已经能用。

## 规则
- **文件格式要向后兼容**：已有的看板 `.md` 必须能继续打开，写回后不能丢内容。改解析逻辑时先加测试。
- **样式只用 `.sk-root` 上的 CSS 变量**，不写死颜色；强调色上的文字用 `--sk-accent-ink`。
- **新加的字号写成 `calc(Npx * var(--sk-fs, 1))`**，否则"小 / 中 / 大"不起作用。
- 所有可点击元素用真正的 `<button>`；纯图标按钮要有 `aria-label`。
- 新的显示项要同时加到 `SHOW_FIELDS`、`DEFAULT_SETTINGS.show`、`i18n.ts` 的 `show.<key>`、卡片渲染、编辑弹窗和列表视图。
- 界面文字不要写死在代码里：一律加到 `src/i18n.ts`，中文和英文都要写（英文漏了会编译报错，`tests/i18n.test.ts` 还会检查占位符）。用 `t('key')` 取。

## 命令
```bash
npm install          # 第一次
npm test             # vitest 单元测试（tests/*.test.ts）
npm run build        # 类型检查 + 生成 main.js
npm run dev          # 监听 src/ 自动重新构建
npm run lint         # 社区插件审核规则（发布前必须 0 error）
```
安装测试：`npm run build` 后把 `manifest.json`、`main.js`、`styles.css` 复制到 `<库>/.obsidian/plugins/studio-kanban/`，在 Obsidian 里启用。
`src/model/`、`src/util/color.ts` 不能 import `obsidian`，这样测试才能直接跑。
