// @vitest-environment happy-dom
/*
 * 分段滑块的 DOM 行为：重绘后接着滑、点击、拖动、减少动态效果。
 * happy-dom 没有布局，按钮位置手动指定；Obsidian 给 HTMLElement 加的小工具在这里补上。
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { animateSegmented, type SegMemory } from '../src/view/segmented';

/* ---------- Obsidian DOM 小工具的替身 ---------- */
const P = HTMLElement.prototype as unknown as Record<string, unknown>;
P.addClass = function (this: HTMLElement, c: string) { this.classList.add(c); };
P.removeClass = function (this: HTMLElement, c: string) { this.classList.remove(c); };
P.hasClass = function (this: HTMLElement, c: string) { return this.classList.contains(c); };
(globalThis as Record<string, unknown>).createDiv = (cls: string) => { const d = document.createElement('div'); d.className = cls; return d; };

/* ---------- 手动驱动的 requestAnimationFrame ---------- */
let queue: FrameRequestCallback[] = [];
let clock = 0;
function frames(n: number) {
  for (let i = 0; i < n; i++) {
    clock += 1000 / 60;
    const q = queue;
    queue = [];
    q.forEach((cb) => cb(clock));
  }
}

let reduceMotion = false;
beforeEach(() => {
  queue = [];
  clock = 0;
  reduceMotion = false;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  window.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };
  window.cancelAnimationFrame = () => { queue = []; };
  window.matchMedia = ((q: string) => ({ matches: reduceMotion && q.includes('reduce') })) as unknown as typeof window.matchMedia;
  document.body.innerHTML = '';
});

/* 建一组按钮：每个 40px 宽，间距 4px；点击记录下来 */
function build(index: number, memory: Map<string, SegMemory>, clicks: number[] = []) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  (container as unknown as { setPointerCapture(): void }).setPointerCapture = () => {};
  (container as unknown as { hasPointerCapture(): boolean }).hasPointerCapture = () => true;
  (container as unknown as { releasePointerCapture(): void }).releasePointerCapture = () => {};
  const buttons = [0, 1, 2].map((i) => {
    const b = document.createElement('button');
    container.appendChild(b);
    Object.defineProperties(b, {
      offsetLeft: { get: () => 4 + i * 44 }, offsetTop: { get: () => 4 },
      offsetWidth: { get: () => 40 }, offsetHeight: { get: () => 40 },
    });
    b.getBoundingClientRect = () => ({ left: 4 + i * 44, width: 40, top: 4, height: 40 }) as DOMRect;
    b.addEventListener('click', () => clicks.push(i));
    return b;
  });
  animateSegmented(container, buttons, index, memory, 'k');
  const thumb = container.querySelector('.sk-seg-thumb') as HTMLElement;
  const x = () => Number(/translate\(([-\d.]+)px/.exec(thumb.style.transform)?.[1]);
  const mix = (i: number) => Number(buttons[i].style.getPropertyValue('--sk-seg-mix'));
  return { container, buttons, thumb, x, mix };
}

describe('分段滑块（DOM）', () => {
  test('初始：滑块在选中项下面，文字颜色只有选中项是满的', () => {
    const m = new Map<string, SegMemory>();
    const s = build(1, m);
    expect(s.x()).toBe(48);
    expect(s.thumb.style.width).toBe('40px');
    expect([s.mix(0), s.mix(1), s.mix(2)]).toEqual([0, 1, 0]);
    expect(m.get('k')).toEqual({ p: 1, v: 0 });
    expect(queue.length).toBe(0);     // 静止时不跑动画
  });

  test('点击后整体重绘：新滑块从旧位置接着滑到新位置，旧的停止', () => {
    const m = new Map<string, SegMemory>();
    const old = build(0, m);
    old.buttons[2].click();            // 点击先让旧滑块动起来
    frames(2);
    old.container.remove();            // 原有点击处理触发重绘
    const s = build(2, m);
    const start = s.x();
    expect(start).toBeGreaterThan(4);  // 不是从头开始
    expect(start).toBeLessThan(92);    // 也没有直接跳到位
    frames(3);
    expect(s.x()).toBeGreaterThan(start);
    frames(60);
    expect(s.x()).toBe(92);
    expect(queue.length).toBe(0);
    expect(m.get('k')).toEqual({ p: 2, v: 0 });
  });

  test('滑动途中两侧文字按覆盖程度渐变', () => {
    const m = new Map<string, SegMemory>();
    m.set('k', { p: 0, v: 0 });
    const s = build(1, m);
    frames(4);
    expect(s.mix(0)).toBeGreaterThan(0);
    expect(s.mix(0)).toBeLessThan(1);
    expect(s.mix(1)).toBeCloseTo(1 - s.mix(0), 5);
  });

  test('拖动：跟手移动，松手吸附并触发对应按钮一次；紧随的 click 被吞掉', () => {
    const clicks: number[] = [];
    const m = new Map<string, SegMemory>();
    const s = build(0, m, clicks);
    const pe = (type: string, x: number) => s.container.dispatchEvent(
      new PointerEvent(type, { clientX: x, pointerId: 1, isPrimary: true, button: 0, bubbles: true }));
    pe('pointerdown', 24);
    pe('pointermove', 26);             // 不到 4px，不算拖
    expect(s.container.classList.contains('is-dragging')).toBe(false);
    pe('pointermove', 60);
    expect(s.container.classList.contains('is-dragging')).toBe(true);
    expect(s.x()).toBeGreaterThan(4);  // 跟手
    pe('pointermove', 100);
    pe('pointerup', 100);
    expect(clicks).toEqual([2]);       // 100 ≈ 第三个按钮中心附近 → 选中 2
    s.buttons[2].click();              // 浏览器在 pointerup 之后补发的 click
    expect(clicks).toEqual([2]);
  });

  test('只是点一下（没拖）：照常触发点击', () => {
    const clicks: number[] = [];
    const s = build(0, new Map(), clicks);
    s.container.dispatchEvent(new PointerEvent('pointerdown', { clientX: 68, pointerId: 1, isPrimary: true, button: 0, bubbles: true }));
    s.container.dispatchEvent(new PointerEvent('pointerup', { clientX: 68, pointerId: 1, isPrimary: true, button: 0, bubbles: true }));
    s.buttons[1].click();
    expect(clicks).toEqual([1]);
  });

  test('系统开了"减少动态效果"：直接到位，不跑动画', () => {
    reduceMotion = true;
    const m = new Map<string, SegMemory>();
    m.set('k', { p: 0, v: 0 });
    const s = build(2, m);
    expect(s.x()).toBe(92);
    expect(queue.length).toBe(0);
  });
});
