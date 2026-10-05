/*
 * Kanban Studio — Obsidian 看板插件
 * 数据格式见 src/model/parse.ts 和 docs/IMPLEMENTATION.md §2
 */

import {
  MarkdownView, Notice, Plugin, TFile, TFolder, WorkspaceLeaf, getLanguage, moment, normalizePath,
} from 'obsidian';
import { resolveLanguage, setLanguage, t } from './i18n';
import { FM_KEY, FONT_SIZES, VIEW_TYPE, type FontSize } from './constants';
import { DEFAULT_SETTINGS, SettingsTab, type StudioKanbanSettings } from './settings';
import { accentInk } from './util/color';
import { KanbanView } from './view/KanbanView';
import { WheelLogger } from './view/wheelLog';

export default class StudioKanbanPlugin extends Plugin {
  settings!: StudioKanbanSettings;
  markdownPaths!: Set<string>;
  wheelLog!: WheelLogger;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.applyLanguage();
    this.applyAccent();
    this.markdownPaths = new Set();

    this.registerView(VIEW_TYPE, (leaf) => new KanbanView(leaf, this));
    this.addRibbonIcon('layout-dashboard', t('cmd.newBoard'), () => this.createBoard());

    this.addCommand({ id: 'create-board', name: t('cmd.newBoard'), callback: () => this.createBoard() });
    this.addCommand({
      id: 'toggle-board-view',
      name: t('cmd.toggleView'),
      checkCallback: (checking) => {
        const leaf = this.app.workspace.getMostRecentLeaf();
        if (!leaf) return false;
        const view = leaf.view;
        const file = view && (view as { file?: TFile | null }).file;
        if (!file || file.extension !== 'md') return false;
        const isBoard = view.getViewType() === VIEW_TYPE;
        if (!isBoard && !this.isBoardFile(file)) return false;
        if (!checking) void (isBoard ? this.openAsMarkdown(leaf, file) : this.openAsBoard(leaf, file));
        return true;
      },
    });

    this.addCommand({
      id: 'toggle-sidebar',
      name: t('cmd.toggleSidebar'),
      checkCallback: (checking) => {
        const leaf = this.app.workspace.getMostRecentLeaf();
        if (!leaf || leaf.view.getViewType() !== VIEW_TYPE) return false;
        if (!checking) void this.setSidebar(!this.settings.showSidebar);
        return true;
      },
    });

    this.wheelLog = new WheelLogger(this);
    this.addCommand({ id: 'toggle-wheel-log', name: t('cmd.wheelLog'), callback: () => this.wheelLog.toggle() });

    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      if (file instanceof TFolder) {
        menu.addItem((i) => i.setTitle(t('cmd.newBoard')).setIcon('layout-dashboard').onClick(() => this.createBoard(file)));
      } else if (file instanceof TFile && file.extension === 'md' && this.isBoardFile(file)) {
        menu.addItem((i) => i.setTitle(t('menu.openAsBoard')).setIcon('layout-dashboard').onClick(() => this.openAsBoard(this.app.workspace.getLeaf(false), file)));
      }
    }));

    this.registerEvent(this.app.workspace.on('file-open', (file) => this.maybeOpenAsBoard(file)));

    this.addSettingTab(new SettingsTab(this.app, this));
  }

  onunload(): void {
    void this.wheelLog?.stop();
    document.body.style.removeProperty('--sk-accent-global');
    document.body.style.removeProperty('--sk-accent-ink-global');
  }

  /* 插件语言：设置里选的，或跟随 Obsidian 的界面语言 */
  applyLanguage(): void {
    setLanguage(resolveLanguage(this.settings.language, getLanguage()));
  }

  applyAccent(): void {
    document.body.style.setProperty('--sk-accent-global', this.settings.accent);
    document.body.style.setProperty('--sk-accent-ink-global', accentInk(this.settings.accent));
  }

  async loadSettings(): Promise<void> {
    const data = ((await this.loadData()) || {}) as Partial<StudioKanbanSettings>;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    this.settings.show = Object.assign({}, DEFAULT_SETTINGS.show, data.show);
    this.settings.image = Object.assign({}, DEFAULT_SETTINGS.image, data.image);
    /* 旧版用每列张数 0 表示不折叠 */
    if (data.foldMode === undefined && data.cardLimit === 0) { this.settings.foldMode = 'off'; this.settings.cardLimit = DEFAULT_SETTINGS.cardLimit; }
  }

  /* 把拖入 / 粘贴的图片存进库（遵循 Obsidian「附件默认存放路径」设置），返回嵌入语法 */
  async saveImage(file: File, boardFile: TFile | null): Promise<string> {
    const sub = (file.type || 'image/png').split('/')[1] || 'png';
    const ext = sub.replace('jpeg', 'jpg').replace('svg+xml', 'svg');
    const generic = !file.name || /^image\.\w+$/i.test(file.name) || !/\.[a-z0-9]+$/i.test(file.name);
    const name = generic ? `Pasted image ${moment().format('YYYYMMDDHHmmss')}.${ext}` : file.name;
    const src = boardFile ? boardFile.path : '';
    const path = await this.app.fileManager.getAvailablePathForAttachment(name, src);
    const tf = await this.app.vault.createBinary(path, await file.arrayBuffer());
    return '!' + this.app.fileManager.generateMarkdownLink(tf, src);
  }

  async saveSettings(): Promise<void> {
    this.applyLanguage();
    this.applyAccent();
    await this.saveData(this.settings);
    this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach((l) => { if (l.view instanceof KanbanView) l.view.render(); });
  }

  /* 打开 Obsidian 设置并跳到本插件的设置页（app.setting 是未公开 API，所以做了保护） */
  openSettings(): void {
    const setting = (this.app as unknown as { setting?: { open(): void; openTabById(id: string): void } }).setting;
    if (!setting) { new Notice(t('notice.settingsFallback')); return; }
    setting.open();
    setting.openTabById(this.manifest.id);
  }

  async setSidebar(show: boolean): Promise<void> {
    this.settings.showSidebar = !!show;
    await this.saveData(this.settings);
    this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach((l) => { if (l.view instanceof KanbanView) l.view.applySidebar(); });
  }

  async setFontSize(id: string): Promise<void> {
    if (!(FONT_SIZES as string[]).includes(id)) return;
    this.settings.fontSize = id as FontSize;
    await this.saveSettings();
  }

  isBoardFile(file: TFile): boolean {
    const cache = this.app.metadataCache.getFileCache(file);
    return !!(cache && cache.frontmatter && cache.frontmatter[FM_KEY]);
  }

  maybeOpenAsBoard(file: TFile | null): void {
    if (!file || file.extension !== 'md' || this.markdownPaths.has(file.path)) return;
    if (!this.isBoardFile(file)) return;
    const mv = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (mv && mv.file === file) void this.openAsBoard(mv.leaf, file);
  }

  async openAsBoard(leaf: WorkspaceLeaf, file: TFile): Promise<void> {
    this.markdownPaths.delete(file.path);
    await leaf.setViewState({ type: VIEW_TYPE, state: { file: file.path }, active: true });
  }

  async openAsMarkdown(leaf: WorkspaceLeaf, file: TFile | null): Promise<void> {
    if (!file) return;
    this.markdownPaths.add(file.path);
    await leaf.setViewState({ type: 'markdown', state: { file: file.path }, active: true });
  }

  async createBoard(folder?: TFolder): Promise<void> {
    const dir = folder ? folder.path : (this.settings.newBoardFolder || '');
    if (dir && !this.app.vault.getAbstractFileByPath(normalizePath(dir))) {
      await this.app.vault.createFolder(normalizePath(dir)).catch(() => {});
    }
    let n = 0;
    let path;
    do {
      path = normalizePath((dir ? dir + '/' : '') + (n ? `${t('untitledBoard')} ${n}` : t('untitledBoard')) + '.md');
      n++;
    } while (this.app.vault.getAbstractFileByPath(path));

    const soon = moment().add(2, 'day').format('YYYY-MM-DD');
    const tpl = [
      '---', `${FM_KEY}: board`, '---', '',
      `## ${t('tpl.todo')}`, '',
      `- [ ] ${t('tpl.welcome')} !medium @${soon} #${t('tpl.tag')}`,
      '\t' + t('tpl.hint'),
      '',
      `## ${t('tpl.doing')}`, '',
      `## ${t('tpl.review')}`, '',
      `## ${t('tpl.done')}`, '',
      '%% studio-kanban:settings ' + JSON.stringify({ doneColumn: t('tpl.done') }) + ' %%', '',
    ].join('\n');
    const file = await this.app.vault.create(path, tpl);
    await this.openAsBoard(this.app.workspace.getLeaf(true), file);
    new Notice(t('notice.boardCreated', { name: file.basename }));
  }
}
