import { describe, expect, test } from 'vitest';
import { indexAt, snapTarget, springSettled, springStep } from '../src/view/segmented';

/* 以 60fps 一帧帧推进，返回轨迹 */
function run(from: number, to: number, v0 = 0, maxFrames = 120) {
  let x = from;
  let v = v0;
  const xs: number[] = [];
  for (let i = 0; i < maxFrames; i++) {
    [x, v] = springStep(x, v, to, 1 / 60);
    xs.push(x);
    if (springSettled(x, v, to)) return { xs, frames: i + 1, settled: true };
  }
  return { xs, frames: maxFrames, settled: false };
}

describe('分段滑块：弹簧', () => {
  test('一格距离约 0.3～0.5 秒停稳，不拖沓', () => {
    const r = run(0, 1);
    expect(r.settled).toBe(true);
    expect(r.frames).toBeGreaterThan(15);
    expect(r.frames).toBeLessThan(35);
  });

  test('落位时有轻微回弹（越过目标一点，但不超过 5%）', () => {
    const { xs } = run(0, 1);
    const peak = Math.max(...xs);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(1.05);
  });

  test('往回滑方向对称；跨两格也能停稳', () => {
    expect(Math.min(...run(2, 1).xs)).toBeLessThan(1);
    expect(run(0, 2).settled).toBe(true);
  });

  test('帧率不稳（卡一下 50ms）也不会发散', () => {
    let x = 0;
    let v = 0;
    for (let i = 0; i < 40; i++) [x, v] = springStep(x, v, 1, i % 5 === 0 ? 0.05 : 1 / 60);
    expect(Math.abs(x - 1)).toBeLessThan(0.01);
  });
});

describe('分段滑块：拖动', () => {
  const centers = [20, 64, 108];   // 三个 40px 按钮、间距 4px 的中心

  test('指针位置按按钮中心线性换算成位置', () => {
    expect(indexAt(20, centers)).toBe(0);
    expect(indexAt(42, centers)).toBeCloseTo(0.5);
    expect(indexAt(108, centers)).toBe(2);
  });

  test('拖出两端最多越界 0.15 项', () => {
    expect(indexAt(-500, centers)).toBe(-0.15);
    expect(indexAt(900, centers)).toBe(2.15);
  });

  test('松手吸附到最近的一项；快速一甩能越过半格；不越界', () => {
    expect(snapTarget(0.4, 0, 3)).toBe(0);
    expect(snapTarget(0.6, 0, 3)).toBe(1);
    expect(snapTarget(0.3, 4, 3)).toBe(1);     // 0.3 + 4 × 0.08 = 0.62
    expect(snapTarget(1.9, 10, 3)).toBe(2);
    expect(snapTarget(-0.1, -10, 3)).toBe(0);
  });
});
