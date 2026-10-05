import { describe, expect, test } from 'vitest';
import { bindHorizontalWheel } from '../src/view/scroll';

/* 假的看板元素：scrollLeft 按设备像素取整（Windows 125% 缩放 = 0.8 CSS 像素一格） */
function fakeBoard(dpr = 1.25, width = 600, scrollWidth = 3000) {
  let v = 0;
  return {
    clientWidth: width, scrollWidth,
    get scrollLeft() { return v; },
    set scrollLeft(x: number) { v = Math.round(Math.max(0, Math.min(scrollWidth - width, x)) * dpr) / dpr; },
  } as unknown as HTMLElement;
}

function setup(board: HTMLElement | null) {
  let handler: (e: WheelEvent) => void = () => {};
  const area = { addEventListener: (_: string, h: (e: WheelEvent) => void) => { handler = h; } } as unknown as HTMLElement;
  bindHorizontalWheel(area, () => board);
  const wheel = (o: Partial<WheelEvent>) => {
    const e = { deltaX: 0, deltaY: 0, deltaMode: 0, shiftKey: false, cancelable: true, prevented: false,
      preventDefault() { this.prevented = true; }, ...o };
    handler(e as unknown as WheelEvent);
    return e;
  };
  return wheel;
}

describe('横向滚动', () => {
  test('平滑滚动的小步长不会被取整吞掉（旧写法在这里卡住不动）', () => {
    const b = fakeBoard();
    const wheel = setup(b);
    for (let i = 0; i < 100; i++) wheel({ deltaX: 0.35 });
    expect(b.scrollLeft).toBeGreaterThan(30);   // 100 × 0.35 = 35
    // 对照：旧写法 scrollLeft += 0.35 每次都被取整回原位
    const old = fakeBoard();
    for (let i = 0; i < 100; i++) old.scrollLeft = old.scrollLeft + 0.35;
    expect(old.scrollLeft).toBe(0);
  });

  test('左右滚轮、Shift+滚轮生效；普通上下滚动不拦截', () => {
    const b = fakeBoard(1);
    const wheel = setup(b);
    expect(wheel({ deltaX: 100 }).prevented).toBe(true);
    expect(b.scrollLeft).toBe(100);
    wheel({ deltaY: 50, shiftKey: true });
    expect(b.scrollLeft).toBe(150);
    const e = wheel({ deltaY: 80 });
    expect(e.prevented).toBe(false);
    expect(b.scrollLeft).toBe(150);
  });

  test('到两端停住；被别的方式滚动后以实际位置继续', () => {
    const b = fakeBoard(1);
    const wheel = setup(b);
    wheel({ deltaX: -500 });
    expect(b.scrollLeft).toBe(0);
    wheel({ deltaX: 99999 });
    expect(b.scrollLeft).toBe(2400);
    b.scrollLeft = 1000;           // 比如拖了滚动条
    wheel({ deltaX: 10 });
    expect(b.scrollLeft).toBe(1010);
  });

  test('列表视图（没有看板）或内容不够宽时什么都不做', () => {
    expect(setup(null)({ deltaX: 100 }).prevented).toBe(false);
    expect(setup(fakeBoard(1, 600, 600))({ deltaX: 100 }).prevented).toBe(false);
  });

  test('不可取消的事件不调用 preventDefault', () => {
    const b = fakeBoard(1);
    expect(setup(b)({ deltaX: 30, cancelable: false }).prevented).toBe(false);
    expect(b.scrollLeft).toBe(30);
  });
});

describe('只有 wheelDeltaX 的左右拨动', () => {
  test('deltaX 为 0 时用 wheelDeltaX（符号相反）', () => {
    const b = fakeBoard(1);
    const wheel = setup(b);
    wheel({ deltaX: 0, deltaY: 0, wheelDeltaX: -120 } as Partial<WheelEvent>);
    expect(b.scrollLeft).toBe(40);
    wheel({ deltaX: 0, deltaY: 0, wheelDeltaX: 120 } as Partial<WheelEvent>);
    expect(b.scrollLeft).toBe(0);
  });

  test('普通上下滚动的 wheelDeltaX 不会被误当成横向', () => {
    const b = fakeBoard(1);
    setup(b)({ deltaX: 0, deltaY: 66, wheelDeltaX: 0 } as Partial<WheelEvent>);
    expect(b.scrollLeft).toBe(0);
  });
});
