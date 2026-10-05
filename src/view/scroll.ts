/*
 * 鼠标横向滚动：带左右滚轮 / 拨轮的鼠标（deltaX）和 Shift + 滚轮都让看板左右移动。
 * 纵向为主的滚动不处理，交给列自己上下滚。
 *
 * - 监听整个视图（侧栏、标题、工具栏、列下面的空白都算），捕获阶段，不受子元素影响。
 * - 自己记一个带小数的位置再写回 scrollLeft：平滑滚动的鼠标每次只给零点几像素，
 *   直接 scrollLeft += 0.4 在 Windows 缩放（125%、150%）下会被取整吞掉。
 * - 写完立即读回实际值；下次滚动前如果实际值和读回的不一样（拖了滚动条、原生滚动动画），
 *   就以实际位置为准，不会和别的滚动来回抢。
 */

/* 每个滚轮事件的处理结果，给排查日志用（view/wheelLog.ts） */
export type WheelOutcome = 'no-board' | 'empty' | 'vertical' | 'no-overflow' | 'at-edge' | 'moved';
export const wheelOutcome = new WeakMap<Event, WheelOutcome>();

export function bindHorizontalWheel(area: HTMLElement, getBoard: () => HTMLElement | null): void {
  let board: HTMLElement | null = null;
  let pos = 0;
  let written = 0;

  area.addEventListener('wheel', (e) => {
    const el = getBoard();
    if (!el) { wheelOutcome.set(e, 'no-board'); return; }
    /* 有的鼠标驱动左右拨动时 deltaX 是 0，方向只放在旧的 wheelDeltaX 里（符号相反，120 一格） */
    const wdx = (e as WheelEvent & { wheelDeltaX?: number }).wheelDeltaX || 0;
    const dx = e.deltaX || (e.deltaY ? 0 : -wdx / 120 * 40);
    const horizontal = Math.abs(dx) > Math.abs(e.deltaY);
    const raw = horizontal ? dx : (e.shiftKey ? e.deltaY : 0);
    if (!raw) { wheelOutcome.set(e, !e.deltaX && !e.deltaY && !wdx ? 'empty' : 'vertical'); return; }
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 0) { wheelOutcome.set(e, 'no-overflow'); return; }
    if (e.cancelable) e.preventDefault();

    if (el !== board || Math.abs(el.scrollLeft - written) > 1) { board = el; pos = el.scrollLeft; }
    const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? el.clientWidth : 1;
    const next = Math.max(0, Math.min(max, pos + raw * unit));
    wheelOutcome.set(e, next === pos ? 'at-edge' : 'moved');
    pos = next;
    el.scrollLeft = pos;
    written = el.scrollLeft;
  }, { passive: false, capture: true });
}
