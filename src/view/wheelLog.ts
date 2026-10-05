/*
 * 排查用：记录所有滚轮事件和看板的处理结果，写到插件目录下的 wheel-log.txt。
 * 用命令「开始 / 停止记录鼠标滚动」开关，2 分钟后自动停止。平时不运行，不影响性能。
 *
 * 每行：序号 时间ms dx dy 模式 修饰键 可取消 指针位置 处理结果 是否阻止默认 滚动前→50ms后
 */
import { Notice, Platform, apiVersion, type Plugin } from 'obsidian';
import { t } from '../i18n';
import { wheelOutcome } from './scroll';

const AUTO_STOP_MS = 2 * 60 * 1000;
const OTHER_EVENTS = ['mousedown', 'auxclick', 'keydown', 'mousewheel', 'DOMMouseScroll'];

/* 指针下面是什么：最近的 sk-* 类名链，或者不在看板里 */
function where(target: EventTarget | null): string {
  const el = target instanceof Element ? target : null;
  if (!el || !el.closest('.sk-root')) {
    const leaf = el?.closest('.workspace-leaf-content');
    return 'outside(' + (leaf?.getAttribute('data-type') || el?.tagName.toLowerCase() || '?') + ')';
  }
  const chain: string[] = [];
  for (let n: Element | null = el; n && chain.length < 3; n = n.parentElement) {
    const c = Array.from(n.classList).find((x) => x.startsWith('sk-'));
    if (c && c !== 'sk-btn' && c !== 'sk-ico') chain.push(c);
    if (n.classList.contains('sk-root')) break;
  }
  return chain.join('<') || el.tagName.toLowerCase();
}

export class WheelLogger {
  private lines: string[] = [];
  private count = 0;
  private start = 0;
  private flushTimer = 0;
  private stopTimer = 0;
  private listener: ((e: WheelEvent) => void) | null = null;
  private other: ((e: Event) => void) | null = null;

  constructor(private plugin: Plugin) {}

  get running(): boolean { return !!this.listener; }
  get path(): string { return `${this.plugin.manifest.dir || this.plugin.app.vault.configDir + '/plugins/' + this.plugin.manifest.id}/wheel-log.txt`; }

  async toggle(): Promise<void> {
    try {
      if (this.running) await this.stop();
      else await this.begin();
    } catch (err) {
      /* 出错要让人看见，否则只会"什么都没发生" */
      console.error('[Kanban Studio] wheel log', err);
      new Notice('Kanban Studio wheel log error: ' + (err instanceof Error ? err.message : String(err)), 15000);
    }
  }

  private async begin(): Promise<void> {
    this.count = 0;
    this.start = performance.now();
    const header = [
      '',
      `=== ${new Date().toISOString()}  dpr=${window.devicePixelRatio}  window=${window.innerWidth}x${window.innerHeight}`,
      `=== obsidian ${apiVersion}  ${Platform.isWin ? 'windows' : Platform.isMacOS ? 'macos' : Platform.isLinux ? 'linux' : Platform.isMobile ? 'mobile' : '?'}`,
      '# n  ms  dx  dy  wheelDeltaX  wheelDeltaY  dz  mode  keys  cancelable  where  outcome  prevented  scrollLeft',
      '# 其他输入（鼠标侧键、按键）记成 "# 事件 ..." 行',
    ];
    await this.plugin.app.vault.adapter.append(this.path, header.join('\n') + '\n');

    this.listener = (e: WheelEvent) => {
      const n = ++this.count;
      const ms = Math.round(performance.now() - this.start);
      const board = (e.target instanceof Element ? e.target.closest('.sk-root') : null)?.querySelector<HTMLElement>('.sk-board') || null;
      const before = board ? board.scrollLeft.toFixed(1) : '-';
      const keys = (e.shiftKey ? 'S' : '') + (e.ctrlKey ? 'C' : '') + (e.altKey ? 'A' : '') || '-';
      const pos = where(e.target);
      window.setTimeout(() => {
        const after = board ? board.scrollLeft.toFixed(1) : '-';
        const legacy = e as WheelEvent & { wheelDeltaX?: number; wheelDeltaY?: number };
        this.lines.push([n, ms, e.deltaX.toFixed(2), e.deltaY.toFixed(2), legacy.wheelDeltaX ?? '?', legacy.wheelDeltaY ?? '?', e.deltaZ.toFixed(2), e.deltaMode, keys, e.cancelable ? 'c' : 'nc',
          pos, wheelOutcome.get(e) || 'not-reached', e.defaultPrevented ? 'P' : '-', `${before}→${after}`].join('  '));
      }, 50);
    };
    window.addEventListener('wheel', this.listener, { capture: true, passive: true });
    /* 有些鼠标的左右拨动不是滚轮信号，而是侧键或按键；一起记下来 */
    this.other = (e: Event) => {
      const ms = Math.round(performance.now() - this.start);
      if (e instanceof MouseEvent) this.lines.push(`# ${e.type}  ${ms}ms  button=${e.button}  buttons=${e.buttons}  ${where(e.target)}`);
      else if (e instanceof KeyboardEvent) this.lines.push(`# ${e.type}  ${ms}ms  key=${e.key}  code=${e.code}`);
      else this.lines.push(`# ${e.type}  ${ms}ms  ${where(e.target)}`);
    };
    for (const type of OTHER_EVENTS) window.addEventListener(type, this.other, { capture: true, passive: true });
    this.flushTimer = window.setInterval(() => { void this.flush(); }, 1000);
    this.stopTimer = window.setTimeout(() => { void this.stop(); }, AUTO_STOP_MS);
    new Notice(t('notice.wheelLogOn', { path: this.path }), 8000);
  }

  async stop(): Promise<void> {
    if (!this.listener) return;
    window.removeEventListener('wheel', this.listener, { capture: true });
    if (this.other) for (const type of OTHER_EVENTS) window.removeEventListener(type, this.other, { capture: true });
    this.other = null;
    this.listener = null;
    window.clearInterval(this.flushTimer);
    window.clearTimeout(this.stopTimer);
    await new Promise((r) => window.setTimeout(r, 100));
    await this.flush();
    new Notice(t('notice.wheelLogOff', { n: this.count }));
  }

  private async flush(): Promise<void> {
    if (!this.lines.length) return;
    const chunk = this.lines.join('\n') + '\n';
    this.lines = [];
    await this.plugin.app.vault.adapter.append(this.path, chunk);
  }
}
