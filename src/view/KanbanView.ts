import { Menu, Notice, TextFileView, WorkspaceLeaf, normalizePath, setIcon } from 'obsidian';
import { FONT_SIZES, IMAGE_LAYOUTS, SHOW_FIELDS, VIEW_TYPE } from '../constants';
import { t } from '../i18n';
import { getFrontmatterTitle, parseBoard, serializeBoard, setFrontmatterTitle } from '../model/parse';
import type { Board, Card, ColumnSort, ImageRef } from '../model/types';
import { sortCards } from '../model/sort';
import { btn } from '../util/dom';
import { fmtMoney, initials, isOverdue } from '../util/format';
import { ImageLightbox } from '../modals/ImageLightbox';
import { PromptModal } from '../modals/PromptModal';
import { CardModal } from '../modals/CardModal';
import { ConfirmModal } from '../modals/ConfirmModal';
import type StudioKanbanPlugin from '../main';
import { VIEW_FILTERS } from './filters';
import { renderSidebar } from './sidebar';
import { renderCard, renderEmpty } from './card';
import { bindDrop } from './dnd';
import { bindHorizontalWheel } from './scroll';
import { animateSegmented, type SegMemory } from './segmented';
import { renderList } from './list';

export interface BoardFilter {
  scope: 'all' | 'open';
  search: string;
  view: string | null;
  tag: string | null;
  assignee: string | null;
}

/* 重绘前后保持的滚动位置：看板横向、每一列纵向（按列名）、侧栏、列表视图 */
interface ScrollSnapshot { board: number; side: number; list: number; cols: Map<string, number>; title: string | null }

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export class KanbanView extends TextFileView {
  plugin: StudioKanbanPlugin;
  board: Board | null;
  filter: BoardFilter;
  mode: 'board' | 'list';
  compact: boolean;
  expanded: Set<number>;
  collapsedGroups: Set<string>;
  drag: { ci: number; idx: number; id: string } | null;
  placeholder: HTMLElement | null;
  root: HTMLElement | null = null;
  mainEl!: HTMLElement;
  /* 分段按钮滑块的位置，跨重绘保留（view/segmented.ts） */
  segMemory = new Map<string, SegMemory>();
  /* 下一次重绘时要播放"进入"动画的卡片（新建、换列），只播一次 */
  enterCardId: string | null = null;
  /* render() 在清空前记下的滚动位置，交给 renderMain() 恢复 */
  private pendingScroll: ScrollSnapshot | null = null;
  private boardResize: ResizeObserver | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: StudioKanbanPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.board = null;
    this.filter = { scope: 'all', search: '', view: null, tag: null, assignee: null };
    this.mode = 'board';
    this.compact = false;
    this.expanded = new Set();
    this.collapsedGroups = new Set();
    this.drag = null;
    this.placeholder = null;
    this.addAction('file-text', t('view.openMarkdown'), () => this.plugin.openAsMarkdown(this.leaf, this.file));
  }

  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return this.file ? this.file.basename : t('board'); }
  getIcon(): string { return 'layout-dashboard'; }

  setViewData(data: string, clear: boolean): void {
    if (clear) { this.expanded.clear(); }
    this.data = data;
    this.board = parseBoard(data);
    this.render();
  }

  getViewData(): string {
    return this.board ? serializeBoard(this.board, this.plugin.settings.currency) : this.data;
  }

  clear(): void { this.board = null; }

  /* 只在 board 已加载时调用（用户操作的回调里） */
  get b(): Board { return this.board as Board; }

  commit(): void {
    this.data = serializeBoard(this.b, this.plugin.settings.currency);
    this.requestSave();
    this.render();
  }

  /* ---------- 数据辅助 ---------- */

  get title(): string {
    const ft = this.board && getFrontmatterTitle(this.board.frontmatter);
    return ft || (this.file ? this.file.basename : t('board'));
  }

  /* 改标题：frontmatter 里有 title 就改它，否则重命名文件（和 Obsidian 的行内标题一样） */
  async setTitle(raw: string): Promise<void> {
    const name = raw.replace(/\s+/g, ' ').trim();
    if (!name || name === this.title || !this.board) { this.render(); return; }
    if (getFrontmatterTitle(this.board.frontmatter) !== null) {
      this.board.frontmatter = setFrontmatterTitle(this.board.frontmatter, name);
      this.commit();
      return;
    }
    const file = this.file;
    if (!file) { this.render(); return; }
    if (/[\\/:*?"<>|#^[\]]/.test(name)) {
      new Notice(t('title.badChars'));
      this.render();
      return;
    }
    const dir = file.parent && file.parent.path !== '/' ? file.parent.path + '/' : '';
    const path = normalizePath(dir + name + '.' + file.extension);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing && existing !== file) {
      new Notice(t('title.exists', { path }));
      this.render();
      return;
    }
    await this.app.fileManager.renameFile(file, path);
    this.render();
  }

  get doneColumn(): string | null { return this.b.settings.doneColumn || null; }

  allCards(): { c: Card; ci: number; i: number }[] {
    const out: { c: Card; ci: number; i: number }[] = [];
    this.b.columns.forEach((col, ci) => col.cards.forEach((c, i) => out.push({ c, ci, i })));
    return out;
  }

  matches(c: Card): boolean {
    const f = this.filter;
    if (f.scope === 'open' && c.done) return false;
    if (f.view === 'done') { if (!c.done) return false; }
    else if (f.view) { const vf = VIEW_FILTERS.find((v) => v.id === f.view); if (vf && !vf.test(c)) return false; }
    if (f.tag && !c.tags.includes(f.tag)) return false;
    if (f.assignee && c.assignee !== f.assignee) return false;
    if (f.search) {
      const q = f.search.toLowerCase();
      const hay = [c.title, c.assignee, c.notes.join(' '), c.tags.join(' ')].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  hasFilter(): boolean {
    const f = this.filter;
    return !!(f.view || f.tag || f.assignee || f.search || f.scope === 'open');
  }

  /* ---------- 渲染 ---------- */

  render(): void {
    if (!this.board) return;
    const snap = this.snapshotScroll();
    this.pendingScroll = snap;

    this.contentEl.empty();
    this.contentEl.addClass('sk-view-content');
    const root = this.contentEl.createDiv('sk-root');
    root.toggleClass('is-compact', this.compact);
    root.addClass('sk-size-' + (this.plugin.settings.fontSize || 'm'));
    const im = this.plugin.settings.image;
    root.addClass('sk-img-h-' + im.height);
    root.toggleClass('sk-img-contain', im.fit === 'contain');
    this.root = root;

    bindHorizontalWheel(root, () => root.querySelector<HTMLElement>('.sk-board'));
    renderSidebar(this, root);
    root.toggleClass('sk-side-hidden', !this.plugin.settings.showSidebar);
    this.mainEl = root.createDiv('sk-main');
    this.renderMain();

    const side = root.querySelector<HTMLElement>('.sk-side');
    if (side) side.scrollTop = snap.side;
  }

  snapshotScroll(): ScrollSnapshot {
    const q = (sel: string) => this.contentEl.querySelector<HTMLElement>(sel);
    const cols = new Map<string, number>();
    this.contentEl.querySelectorAll<HTMLElement>('.sk-col').forEach((col) => {
      const list = col.querySelector<HTMLElement>('.sk-col-list');
      if (list && col.dataset.col !== undefined) cols.set(col.dataset.col, list.scrollTop);
    });
    const title = q('.sk-title');
    const editing = title && title === activeDocument.activeElement ? title.textContent : null;
    return { board: q('.sk-board')?.scrollLeft ?? 0, side: q('.sk-side')?.scrollTop ?? 0, list: q('.sk-listwrap')?.scrollTop ?? 0, cols, title: editing };
  }

  renderMain(): void {
    const snap = this.pendingScroll ?? this.snapshotScroll();
    this.pendingScroll = null;
    this.renderMainContent();
    /* 恢复滚动位置，重绘看起来就只是内容变了 */
    const board = this.mainEl.querySelector<HTMLElement>('.sk-board');
    if (board) board.scrollLeft = snap.board;
    const listWrap = this.mainEl.querySelector<HTMLElement>('.sk-listwrap');
    if (listWrap) listWrap.scrollTop = snap.list;
    this.mainEl.querySelectorAll<HTMLElement>('.sk-col').forEach((col) => {
      const top = col.dataset.col !== undefined ? snap.cols.get(col.dataset.col) : undefined;
      const list = col.querySelector<HTMLElement>('.sk-col-list');
      if (list && top) list.scrollTop = top;
    });
    /* 重绘前正在改标题：把输入的内容和光标接回去，不丢字 */
    if (snap.title !== null) {
      const h = this.mainEl.querySelector<HTMLElement>('.sk-title');
      if (h) {
        h.setText(snap.title);
        h.focus();
        const sel = activeWindow.getSelection();
        if (sel) { sel.selectAllChildren(h); sel.collapseToEnd(); }
      }
    }
    /* 新建 / 换列的卡片：滚到能看见的位置（只在需要时最小幅度滚动） */
    if (this.enterCardId) {
      const el = this.mainEl.querySelector<HTMLElement>(`.sk-card[data-id="${CSS.escape(this.enterCardId)}"]`);
      el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      this.enterCardId = null;
    }
  }

  private renderMainContent(): void {
    const main = this.mainEl;
    main.empty();
    const cards = this.allCards().map((x) => x.c);
    const open = cards.filter((c) => !c.done);
    const overdue = cards.filter(isOverdue).length;
    const total = open.reduce((s, c) => s + (Number(c.value) || 0), 0);

    /* 顶部 */
    const top = main.createDiv('sk-top');
    const left = top.createDiv('sk-top-left');
    /* 路径不再重复显示（Obsidian 自己的标题栏已经有）；侧栏隐藏时标题左边出现"展开侧栏"按钮 */
    const titleRow = left.createDiv('sk-title-row');
    btn(titleRow, 'sk-icon-btn sk-side-open', { icon: 'panel-left-open', label: t('side.show'), onClick: () => { void this.plugin.setSidebar(true); } });
    this.renderTitle(titleRow);
    const sh = this.plugin.settings.show;
    const metaParts = [t('top.open', { n: open.length })];
    if (total && sh.value) metaParts.push(t('top.total', { money: this.plugin.settings.currency + fmtMoney(total) }));
    metaParts.push(overdue ? t('top.overdue', { n: overdue }) : t('top.noOverdue'));
    if (sh.headerStats) left.createDiv({ cls: 'sk-meta', text: metaParts.join(' · ') });

    const people = [...new Set(cards.map((c) => c.assignee).filter(Boolean))];
    if (people.length && sh.headerPeople && sh.assignee) {
      const row = left.createDiv('sk-people');
      const stack = row.createDiv('sk-avatars');
      people.slice(0, 5).forEach((p) => {
        const a = stack.createSpan({ cls: 'sk-avatar', text: initials(p) });
        a.setAttr('aria-label', p);
      });
      row.createSpan({ cls: 'sk-people-label', text: t('top.people', { n: people.length }) });
    }

    const actions = top.createDiv('sk-actions');
    const tg = actions.createEl('label', { cls: 'sk-toggle-pill' });
    tg.createSpan({ text: t('top.compact') });
    const cb = tg.createEl('input', { type: 'checkbox' });
    cb.checked = this.compact;
    tg.createSpan('sk-switch');
    cb.addEventListener('change', () => { this.compact = cb.checked; this.root?.toggleClass('is-compact', this.compact); });

    btn(actions, 'sk-ghost-pill', { icon: 'eye', text: t('top.display'), label: t('top.displayLabel'), onClick: (e) => this.displayMenu(e) });

    const sizes = actions.createDiv('sk-sizes');
    sizes.setAttr('role', 'group');
    sizes.setAttr('aria-label', t('fontSize'));
    const sizeBtns = FONT_SIZES.map((id) => {
      const b = btn(sizes, 'sk-size' + (this.plugin.settings.fontSize === id ? ' is-active' : ''), {
        text: t(`fontSize.${id}`), label: t(`fontSize.${id}.title`),
        onClick: () => { void this.plugin.setFontSize(id); },
      });
      b.dataset.size = id;
      return b;
    });
    animateSegmented(sizes, sizeBtns, Math.max(0, FONT_SIZES.indexOf(this.plugin.settings.fontSize)), this.segMemory, 'size');

    const modes = actions.createDiv('sk-modes');
    const modeBtns = ([['board', 'layout-grid', t('top.boardView')], ['list', 'list-checks', t('top.listView')]] as const).map(([id, icon, label]) =>
      btn(modes, 'sk-mode' + (this.mode === id ? ' is-active' : ''), { icon, label, onClick: () => { this.mode = id; this.renderMain(); } }));
    animateSegmented(modes, modeBtns, this.mode === 'list' ? 1 : 0, this.segMemory, 'mode');

    btn(actions, 'sk-primary', { icon: 'plus', text: t('top.newCard'), onClick: () => this.openCardModal(null, this.defaultColumn()) });

    if (this.mode === 'list') renderList(this, main);
    else this.renderBoard(main);
  }

  /* 标题：点一下直接编辑，回车或点别处保存，Esc 取消 */
  renderTitle(parent: HTMLElement): void {
    const h = parent.createEl('h1', { cls: 'sk-title', text: this.title });
    h.contentEditable = 'plaintext-only';
    h.spellcheck = false;
    h.setAttr('aria-label', t('top.titleLabel'));
    let cancelled = false;
    h.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      if (e.key === 'Enter') { e.preventDefault(); h.blur(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancelled = true; h.blur(); }
    });
    h.addEventListener('blur', () => {
      if (!h.isConnected) return;   // 重绘时被移除，不是用户点了别处
      if (cancelled) { cancelled = false; h.setText(this.title); return; }
      void this.setTitle(h.textContent || '');
    });
  }

  displayMenu(e: MouseEvent): void {
    const s = this.plugin.settings;
    const m = new Menu();
    SHOW_FIELDS.forEach((f, i) => {
      if (i > 0 && SHOW_FIELDS[i - 1].group !== f.group) m.addSeparator();
      m.addItem((it) => it.setTitle(t(`show.${f.key}`)).setChecked(!!s.show[f.key]).onClick(() => { s.show[f.key] = !s.show[f.key]; void this.plugin.saveSettings(); }));
    });
    m.addSeparator();
    IMAGE_LAYOUTS.forEach((id) => {
      m.addItem((it) => it.setTitle(t('top.imageMenu', { layout: t(`imgLayout.${id}`) })).setChecked(s.image.layout === id).onClick(() => { s.image.layout = id; void this.plugin.saveSettings(); }));
    });
    m.showAtMouseEvent(e);
  }

  resolveImage(im: ImageRef | null | undefined): string | null {
    if (!im) return null;
    if (/^(https?:|data:|app:|file:)/i.test(im.target)) return im.target;
    let t = im.target;
    try { t = decodeURIComponent(t); } catch { /* keep raw */ }
    const f = this.app.metadataCache.getFirstLinkpathDest(t, this.file ? this.file.path : '');
    return f ? this.app.vault.getResourcePath(f) : null;
  }

  openLightbox(images: ImageRef[], index: number): void {
    const items = images.map((im) => ({ src: this.resolveImage(im), name: im.target.split('/').pop() as string }))
      .filter((x): x is { src: string; name: string } => !!x.src);
    if (items.length) new ImageLightbox(this.app, items, Math.min(index || 0, items.length - 1)).open();
  }

  /* 侧栏显隐：只切换 class，带过渡动画，不重绘 */
  applySidebar(): void {
    if (!this.root) return;
    this.root.toggleClass('sk-side-hidden', !this.plugin.settings.showSidebar);
  }

  /* 没指定列时新卡片放哪：第一个不是完成列的列（都没有就第一列） */
  defaultColumn(): number {
    const i = this.b.columns.findIndex((c) => c.title !== this.doneColumn);
    return i >= 0 ? i : 0;
  }

  /* 列名不能和别的列重复：完成列、排序、滚动位置都按列名记 */
  columnNameTaken(name: string, except?: unknown): boolean {
    const taken = this.b.columns.some((c) => c !== except && c.title === name);
    if (taken) new Notice(t('col.exists', { name }));
    return taken;
  }

  /* 这一列的排序方式（存在看板文件末尾的设置里） */
  sortOf(title: string): ColumnSort | undefined { return this.b.settings.sort?.[title]; }

  setSort(title: string, mode: ColumnSort | undefined): void {
    const sort = { ...(this.b.settings.sort || {}) };
    if (mode) sort[title] = mode; else delete sort[title];
    if (Object.keys(sort).length) this.b.settings.sort = sort; else delete this.b.settings.sort;
    this.commit();
  }

  renderBoard(main: HTMLElement): void {
    const boardEl = main.createDiv('sk-board');
    const { foldMode, cardLimit } = this.plugin.settings;
    const limit = foldMode === 'count' ? cardLimit : 0;
    const autoFold: { colEl: HTMLElement; list: HTMLElement; ci: number; add: HTMLElement | null }[] = [];

    this.b.columns.forEach((col, ci) => {
      const colEl = boardEl.createDiv('sk-col');
      colEl.dataset.col = col.title;
      const isDone = this.doneColumn === col.title;
      if (isDone) colEl.addClass('is-done-col');

      const head = colEl.createDiv('sk-col-head');
      head.createSpan({ cls: 'sk-col-title', text: col.title });
      head.createSpan({ cls: 'sk-col-count', text: String(col.cards.length) });
      if (isDone) { const d = head.createSpan('sk-ico sk-done-mark'); setIcon(d, 'check'); d.setAttr('aria-label', t('col.doneMark')); }
      head.createDiv('sk-spacer');
      const sort = this.sortOf(col.title);
      if (sort) {
        const label = t(sort === 'date-asc' ? 'col.sortAsc' : 'col.sortDesc');
        btn(head, 'sk-icon-btn sk-col-sort', {
          icon: sort === 'date-asc' ? 'arrow-up-narrow-wide' : 'arrow-down-wide-narrow',
          label: t('col.sortToggle', { current: label }),
          onClick: () => this.setSort(col.title, sort === 'date-asc' ? 'date-desc' : 'date-asc'),
        });
      }
      btn(head, 'sk-icon-btn sk-col-more', { icon: 'more-horizontal', label: t('col.actions'), onClick: (e) => this.columnMenu(e, ci) });

      const list = colEl.createDiv('sk-col-list');
      const visible = sortCards(col.cards.map((c, i) => ({ c, i })).filter((x) => this.matches(x.c)), sort);
      /* 新建 / 移过来的卡片所在的列先展开，保证看得见 */
      if (this.enterCardId && col.cards.some((c) => c.id === this.enterCardId)) this.expanded.add(ci);
      const showAll = this.expanded.has(ci) || !limit || this.hasFilter();
      const shown = showAll ? visible : visible.slice(0, limit);
      shown.forEach((x) => renderCard(this, list, x.c, ci, x.i));

      if (!col.cards.length) renderEmpty(this, list, ci, isDone);
      else if (!visible.length) list.createDiv({ cls: 'sk-col-nomatch', text: t('col.noMatch') });

      const hidden = visible.length - shown.length;
      let add: HTMLElement | null = null;
      if (hidden > 0) btn(colEl, 'sk-more', { text: t('col.more', { n: hidden }), onClick: () => { this.expanded.add(ci); this.renderMain(); } });
      else if (this.expanded.has(ci) && limit && visible.length > limit) btn(colEl, 'sk-more', { text: t('col.collapse'), onClick: () => { this.collapse(ci); } });
      else if (col.cards.length) add = btn(colEl, 'sk-add-card', { icon: 'plus', text: t('col.addCard'), onClick: () => this.openCardModal(null, ci) });

      if (foldMode === 'auto' && !this.hasFilter() && visible.length > 1) autoFold.push({ colEl, list, ci, add });
      bindDrop(this, colEl, list, ci);
    });

    /* 放不下才折叠：所有列画完、有了布局之后再量 */
    autoFold.forEach((x) => this.foldToFit(x.colEl, x.list, x.ci, x.add));
    this.watchBoardHeight(boardEl);

    const add = boardEl.createDiv('sk-col-add');
    btn(add, 'sk-add-col', { icon: 'plus', text: t('col.add'), onClick: () => {
      new PromptModal(this.app, t('col.new'), '', (name) => {
        if (!name || this.columnNameTaken(name)) return;
        this.b.columns.push({ title: name, cards: [], extra: [] });
        this.commit();
      }).open();
    } });
  }

  private collapse(ci: number): void {
    this.expanded.delete(ci);
    /* 收起后回到列顶部，否则停在被折叠掉的位置上 */
    const col = this.mainEl.querySelectorAll<HTMLElement>('.sk-col-list')[ci];
    if (col) col.scrollTop = 0;
    this.renderMain();
  }

  /*
   * 列里的卡片超出可见高度时，只保留放得下的几张，其余折叠成「还有 N 张」；
   * 已展开的列如果超出，底部显示「收起」。视图不可见（高度为 0）时不折叠，等尺寸变化再量。
   */
  private foldToFit(colEl: HTMLElement, list: HTMLElement, ci: number, add: HTMLElement | null): void {
    if (!list.clientHeight) return;
    const overflows = () => list.scrollHeight > list.clientHeight + 1;
    if (!overflows()) return;
    add?.remove();
    if (this.expanded.has(ci)) {
      btn(colEl, 'sk-more', { text: t('col.collapse'), onClick: () => { this.collapse(ci); } });
      return;
    }
    const more = btn(colEl, 'sk-more', { text: '', onClick: () => { this.expanded.add(ci); this.renderMain(); } });
    const cards = Array.from(list.querySelectorAll<HTMLElement>('.sk-card'));
    let keep = cards.length;
    while (keep > 1 && overflows()) cards[--keep].remove();
    more.setText(t('col.more', { n: cards.length - keep }));
  }

  /* 看板高度变了（窗口缩放、面板拖动、视图从隐藏变可见）就重新量一次折叠 */
  private watchBoardHeight(boardEl: HTMLElement): void {
    if (this.plugin.settings.foldMode !== 'auto' || typeof ResizeObserver === 'undefined') return;
    this.boardResize?.disconnect();
    let height = boardEl.clientHeight;
    let pending = 0;
    const ro = new ResizeObserver(() => {
      if (!boardEl.isConnected) { ro.disconnect(); return; }
      if (Math.abs(boardEl.clientHeight - height) < 2) return;
      height = boardEl.clientHeight;
      window.cancelAnimationFrame(pending);
      pending = window.requestAnimationFrame(() => { if (boardEl.isConnected) this.renderMain(); });
    });
    ro.observe(boardEl);
    this.boardResize = ro;
  }

  moveCard(fromCol: number, fromIdx: number, toCol: number, toIdx: number): void {
    const src = this.b.columns[fromCol].cards;
    const card = src.splice(fromIdx, 1)[0];
    if (!card) return;
    if (fromCol === toCol && fromIdx < toIdx) toIdx--;
    const dst = this.b.columns[toCol];
    dst.cards.splice(Math.max(0, Math.min(toIdx, dst.cards.length)), 0, card);
    if (fromCol !== toCol) { card.done = this.doneColumn === dst.title; this.enterCardId = card.id; }
    this.commit();
  }

  /*
   * 拖放：放在目标列"屏幕上看到的"相邻卡片之间（beforeId 之前；没有就 afterId 之后；都没有就放最后）。
   * 按相邻卡片找位置而不是按序号，所以筛选、折叠、排序时都放得准。
   * 目标列设了排序的话，先把屏幕上的顺序写进文件、切回手动排序，卡片就停在放下的地方。
   */
  dropCard(cardId: string, toCol: number, beforeId: string | null, afterId: string | null): void {
    const from = this.b.columns.find((x) => x.cards.some((c) => c.id === cardId));
    const dst = this.b.columns[toCol];
    if (!from || !dst) return;
    const card = from.cards.find((c) => c.id === cardId) as Card;
    const sort = this.sortOf(dst.title);
    if (sort) {
      dst.cards = sortCards(dst.cards.map((c, i) => ({ c, i })), sort).map((x) => x.c);
      const rest = { ...(this.b.settings.sort || {}) };
      delete rest[dst.title];
      if (Object.keys(rest).length) this.b.settings.sort = rest; else delete this.b.settings.sort;
    }
    from.cards.splice(from.cards.indexOf(card), 1);
    const before = beforeId ? dst.cards.findIndex((c) => c.id === beforeId) : -1;
    const after = afterId ? dst.cards.findIndex((c) => c.id === afterId) : -1;
    const idx = before >= 0 ? before : after >= 0 ? after + 1 : dst.cards.length;
    dst.cards.splice(idx, 0, card);
    if (from !== dst) { card.done = this.doneColumn === dst.title; this.enterCardId = card.id; }
    this.commit();
  }

  /* 删除卡片：先让这张卡收起（约 0.2 秒），其他卡片自然补位，再真正删掉并写回 */
  removeCard(c: Card): void {
    const remove = () => {
      const col = this.b.columns.find((x) => x.cards.includes(c));
      if (!col) return;
      const at = col.cards.indexOf(c);
      col.cards.splice(at, 1);
      this.commit();
      this.offerUndo(c, col, at);
    };
    const el = this.contentEl.querySelector<HTMLElement>(`.sk-card[data-id="${CSS.escape(c.id)}"]`);
    if (!el || reducedMotion()) { remove(); return; }
    el.setCssProps({ '--sk-leave-h': `${el.offsetHeight}px` });
    el.addClass('is-leaving');
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => el.addClass('is-gone')));
    window.setTimeout(remove, 220);
  }

  /* 删除后 6 秒内可以撤销：放回原来的列和位置（列已经不在了就放进默认列） */
  private offerUndo(c: Card, col: Board['columns'][number], at: number): void {
    const notice = new Notice(createFragment((frag) => {
      frag.createSpan({ text: t('card.deleted', { title: c.title || t('untitledCard') }) + ' ' });
      const undo = frag.createEl('button', { cls: 'mod-cta sk-undo', text: t('card.undo') });
      undo.addEventListener('click', (e) => {
        e.stopPropagation();
        notice.hide();
        if (!this.board) return;
        const dst = this.b.columns.includes(col) ? col : this.b.columns[this.defaultColumn()];
        if (!dst) return;
        dst.cards.splice(Math.min(at, dst.cards.length), 0, c);
        this.enterCardId = c.id;
        this.commit();
      });
    }), 6000);
  }

  /* ---------- 菜单 & 弹窗 ---------- */

  columnMenu(e: MouseEvent, ci: number): void {
    const col = this.b.columns[ci];
    const m = new Menu();
    m.addItem((i) => i.setTitle(t('col.addCard')).setIcon('plus').onClick(() => this.openCardModal(null, ci)));
    m.addItem((i) => i.setTitle(t('col.renameItem')).setIcon('pencil').onClick(() => {
      new PromptModal(this.app, t('col.rename'), col.title, (name) => {
        if (!name || name === col.title || this.columnNameTaken(name, col)) return;
        if (this.doneColumn === col.title) this.b.settings.doneColumn = name;
        const sort = this.b.settings.sort;
        if (sort && sort[col.title]) { sort[name] = sort[col.title]; delete sort[col.title]; }
        col.title = name;
        this.commit();
      }).open();
    }));
    const isDone = this.doneColumn === col.title;
    m.addItem((i) => i.setTitle(isDone ? t('col.unsetDone') : t('col.setDone')).setIcon('check-circle-2').onClick(() => {
      if (isDone) { delete this.b.settings.doneColumn; col.cards.forEach((c) => { c.done = false; }); }
      else { this.b.settings.doneColumn = col.title; col.cards.forEach((c) => { c.done = true; }); }
      this.commit();
    }));
    m.addSeparator();
    const sort = this.sortOf(col.title);
    ([[undefined, 'col.sortManual', 'grip-vertical'], ['date-asc', 'col.sortAsc', 'arrow-up-narrow-wide'], ['date-desc', 'col.sortDesc', 'arrow-down-wide-narrow']] as const)
      .forEach(([mode, key, icon]) => m.addItem((i) => i.setTitle(t(key)).setIcon(icon).setChecked(sort === mode)
        .onClick(() => { if (sort !== mode) this.setSort(col.title, mode); })));
    m.addSeparator();
    if (ci > 0) m.addItem((i) => i.setTitle(t('col.moveLeft')).setIcon('arrow-left').onClick(() => this.swapCols(ci, ci - 1)));
    if (ci < this.b.columns.length - 1) m.addItem((i) => i.setTitle(t('col.moveRight')).setIcon('arrow-right').onClick(() => this.swapCols(ci, ci + 1)));
    m.addSeparator();
    m.addItem((i) => i.setTitle(t('col.delete')).setIcon('trash-2').onClick(() => {
      const remove = () => {
        this.b.columns.splice(this.b.columns.indexOf(col), 1);
        if (isDone) delete this.b.settings.doneColumn;
        if (this.b.settings.sort) {
          delete this.b.settings.sort[col.title];
          if (!Object.keys(this.b.settings.sort).length) delete this.b.settings.sort;
        }
        this.expanded.clear();
        this.commit();
      };
      if (col.cards.length) new ConfirmModal(this.app, t('col.deleteConfirm', { title: col.title, n: col.cards.length }), t('col.delete'), remove).open();
      else remove();
    }));
    m.showAtMouseEvent(e);
  }

  swapCols(a: number, b: number): void {
    const cols = this.b.columns;
    [cols[a], cols[b]] = [cols[b], cols[a]];
    this.expanded.clear();
    this.commit();
  }

  cardMenu(e: MouseEvent, c: Card, ci: number): void {
    const m = new Menu();
    m.addItem((i) => i.setTitle(t('card.edit')).setIcon('pencil').onClick(() => this.openCardModal(c, ci)));
    m.addItem((i) => i.setTitle(c.done ? t('card.markOpen') : t('card.markDone')).setIcon('check').onClick(() => {
      /* 完成列里的卡片标为未完成：移到默认列，不然它会以"未完成"的状态留在完成列里 */
      const inDoneCol = this.b.columns[ci]?.title === this.doneColumn;
      const to = this.defaultColumn();
      if (c.done && inDoneCol && to !== ci) { this.moveCard(ci, this.b.columns[ci].cards.indexOf(c), to, this.b.columns[to].cards.length); return; }
      c.done = !c.done;
      this.commit();
    }));
    m.addSeparator();
    this.b.columns.forEach((col, ti) => {
      if (ti === ci) return;
      m.addItem((i) => i.setTitle(t('card.moveTo', { title: col.title })).setIcon('arrow-right').onClick(() => {
        this.moveCard(ci, this.b.columns[ci].cards.indexOf(c), ti, col.cards.length);
      }));
    });
    m.addSeparator();
    m.addItem((i) => i.setTitle(t('delete')).setIcon('trash-2').onClick(() => this.removeCard(c)));
    m.showAtMouseEvent(e);
  }

  openCardModal(card: Card | null, ci: number): void {
    if (!this.b.columns.length) {
      this.b.columns.push({ title: t('col.defaultName'), cards: [], extra: [] });
      ci = 0;
    }
    new CardModal(this.app, this, card, ci).open();
  }
}
