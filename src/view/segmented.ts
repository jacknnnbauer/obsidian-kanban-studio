/*
 * 分段按钮的滑块动画（全部/进行中、小/中/大、看板/列表）。
 *
 * 在原有按钮后面垫一块滑块：
 * - 选中项变化时，滑块用弹簧滑过去（略带回弹），参数和播客应用底栏一致；
 * - 滑动中按覆盖程度渐变每个按钮的文字颜色（CSS 变量 --sk-seg-mix）；
 * - 可以按住左右拖，松手吸附到最近的一项，快速一甩带一点惯性。
 *
 * 按钮本身和它们的点击处理不变（键盘、读屏照旧）。点一下会整体重绘，
 * 所以滑块位置存在 memory 里（每个视图一份），新画出来的滑块从旧位置接着滑。
 * 系统开了"减少动态效果"时直接跳到位。
 */

export interface SegMemory { p: number; v: number }

/* 弹簧：质量 1、刚度 420、阻尼 30（阻尼比约 0.73，落位时轻微回弹一下） */
const STIFFNESS = 420;
const DAMPING = 30;
const STEP = 1 / 240;

/* 前进 dt 秒，返回新的位置和速度（单位：项） */
export function springStep(x: number, v: number, target: number, dt: number): [number, number] {
  for (let t = 0; t < dt - 1e-9; t += STEP) {
    const h = Math.min(STEP, dt - t);
    const a = -STIFFNESS * (x - target) - DAMPING * v;
    v += a * h;
    x += v * h;
  }
  return [x, v];
}

export function springSettled(x: number, v: number, target: number): boolean {
  return Math.abs(x - target) < 0.002 && Math.abs(v) < 0.02;
}

/* 指针横坐标 → 以项为单位的位置：按各按钮中心线性插值，两端外推，最多越界 0.15 项 */
export function indexAt(x: number, centers: number[]): number {
  const n = centers.length;
  if (n < 2) return 0;
  let p: number;
  if (x <= centers[0]) p = (x - centers[0]) / (centers[1] - centers[0]);
  else if (x >= centers[n - 1]) p = n - 1 + (x - centers[n - 1]) / (centers[n - 1] - centers[n - 2]);
  else {
    let k = 0;
    while (x > centers[k + 1]) k++;
    p = k + (x - centers[k]) / (centers[k + 1] - centers[k]);
  }
  return Math.max(-0.15, Math.min(n - 1 + 0.15, p));
}

/* 松手后去哪一项：带一点惯性（速度 × 0.08 秒） */
export function snapTarget(p: number, velocity: number, n: number): number {
  return Math.max(0, Math.min(n - 1, Math.round(p + velocity * 0.08)));
}

export function animateSegmented(container: HTMLElement, buttons: HTMLButtonElement[], index: number,
  memory: Map<string, SegMemory>, key: string): void {
  const n = buttons.length;
  if (n < 2) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  container.addClass('sk-seg-anim');
  const thumb = createDiv('sk-seg-thumb');
  container.prepend(thumb);

  const saved = memory.get(key);
  let p = saved && !reduce ? saved.p : index;
  let v = saved && !reduce ? saved.v : 0;
  let target = index;
  let frame = 0;
  let last = 0;

  /* 按钮相对容器的位置，滑块在相邻两个之间插值 */
  const rectOf = (i: number) => {
    const b = buttons[i];
    return { x: b.offsetLeft, y: b.offsetTop, w: b.offsetWidth, h: b.offsetHeight };
  };
  const place = () => {
    const lo = Math.max(0, Math.min(n - 2, Math.floor(p)));
    const a = rectOf(lo);
    const b = rectOf(lo + 1);
    const f = p - lo;
    const lerp = (x: number, y: number) => x + (y - x) * f;
    thumb.style.transform = `translate(${lerp(a.x, b.x)}px, ${lerp(a.y, b.y)}px)`;
    thumb.style.width = `${lerp(a.w, b.w)}px`;
    thumb.style.height = `${lerp(a.h, b.h)}px`;
    buttons.forEach((btn, i) => btn.style.setProperty('--sk-seg-mix', String(Math.max(0, Math.min(1, 1 - Math.abs(p - i))))));
  };
  const remember = () => memory.set(key, { p, v });

  const tick = (now: number) => {
    frame = 0;
    if (!container.isConnected) return;   // 已经重绘掉了，交给新的滑块
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    [p, v] = springStep(p, v, target, dt);
    if (springSettled(p, v, target)) { p = target; v = 0; }
    place();
    remember();
    if (p !== target || v !== 0) frame = window.requestAnimationFrame(tick);
  };
  const animateTo = (i: number, velocity = v) => {
    target = i;
    v = velocity;
    if (reduce) { p = i; v = 0; place(); remember(); return; }
    if (!frame) { last = performance.now(); frame = window.requestAnimationFrame(tick); }
  };
  const stop = () => { if (frame) window.cancelAnimationFrame(frame); frame = 0; };

  /* 点击：先让当前滑块立刻动起来（字号切换要等存盘才重绘），原有的点击处理照常执行 */
  let suppressClick = false;
  container.addEventListener('click', (e) => {
    if (suppressClick) { e.stopPropagation(); e.preventDefault(); return; }
    const i = buttons.findIndex((b) => b.contains(e.target as Node));
    if (i >= 0) animateTo(i);
  }, true);

  /* 拖动：横向移动超过 4px 才算拖，否则当普通点击 */
  let drag: { id: number; x0: number; on: boolean; samples: [number, number][] } | null = null;
  container.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !e.isPrimary) return;
    drag = { id: e.pointerId, x0: e.clientX, on: false, samples: [] };
  });
  container.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.on) {
      if (Math.abs(e.clientX - drag.x0) < 4) return;
      drag.on = true;
      container.setPointerCapture(e.pointerId);
      container.addClass('is-dragging');
      stop();
    }
    const centers = buttons.map((b) => { const r = b.getBoundingClientRect(); return r.left + r.width / 2; });
    p = indexAt(e.clientX, centers);
    v = 0;
    drag.samples.push([performance.now(), p]);
    if (drag.samples.length > 6) drag.samples.shift();
    place();
    remember();
  });
  const endDrag = (e: PointerEvent, cancelled: boolean) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.on) return;
    container.removeClass('is-dragging');
    if (container.hasPointerCapture(e.pointerId)) container.releasePointerCapture(e.pointerId);
    /* 用最近 100ms 内的样本算松手速度（项/秒） */
    const now = performance.now();
    const recent = d.samples.filter(([t]) => now - t < 100);
    const velocity = recent.length > 1
      ? (recent[recent.length - 1][1] - recent[0][1]) / Math.max(0.001, (recent[recent.length - 1][0] - recent[0][0]) / 1000)
      : 0;
    const i = cancelled ? index : snapTarget(p, velocity, n);
    animateTo(i, cancelled ? 0 : velocity);
    /* 拖完紧跟着会有一次 click，吞掉它；选中项变了就触发对应按钮的原有处理 */
    suppressClick = true;
    window.setTimeout(() => { suppressClick = false; }, 0);
    if (i !== index) {
      suppressClick = false;
      buttons[i].click();
      suppressClick = true;
    }
  };
  container.addEventListener('pointerup', (e) => endDrag(e, false));
  container.addEventListener('pointercancel', (e) => endDrag(e, true));

  /* 尺寸变化（侧栏展开、窗口缩放）时重新对齐 */
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => { if (!container.isConnected) { ro.disconnect(); return; } place(); });
    ro.observe(container);
  }

  place();
  remember();
  if (p !== index || v !== 0) animateTo(index);
}
