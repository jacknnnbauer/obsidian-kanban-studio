import type { KanbanView } from './KanbanView';

export function bindDrop(view: KanbanView, colEl: HTMLElement, list: HTMLElement, ci: number): void {
  colEl.addEventListener('dragover', (e) => {
    if (!view.drag) return;
    e.preventDefault();
    (e.dataTransfer as DataTransfer).dropEffect = 'move';
    const ph = getPlaceholder(view);
    const cards = Array.from(list.querySelectorAll<HTMLElement>('.sk-card:not(.is-dragging)'));
    const next = cards.find((cardEl) => {
      const r = cardEl.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    if (next) { if (ph.nextSibling !== next) list.insertBefore(ph, next); }
    else {
      const last = cards[cards.length - 1];
      if (last) { if (last.nextSibling !== ph) last.after(ph); }
      else if (ph.parentElement !== list) list.prepend(ph);
    }
    document.querySelectorAll<HTMLElement>('.sk-col.is-over').forEach((x) => x !== colEl && x.removeClass('is-over'));
    colEl.addClass('is-over');
  });
  colEl.addEventListener('drop', (e) => {
    if (!view.drag) return;
    e.preventDefault();
    const ph = view.placeholder;
    const drag = view.drag;
    /* 占位符前后紧挨着的卡片（跳过占位符和非卡片元素） */
    const neighbor = (dir: 'nextElementSibling' | 'previousElementSibling') => {
      let n = ph ? ph[dir] as HTMLElement | null : null;
      while (n && !n.hasClass('sk-card')) n = n[dir] as HTMLElement | null;
      return n;
    };
    const next = ph && ph.parentElement === list ? neighbor('nextElementSibling') : null;
    const prev = ph && ph.parentElement === list ? neighbor('previousElementSibling') : null;
    view.drag = null;
    clearPlaceholder(view);
    /* 放回原位（紧挨着的就是被拖的这张）：什么都不改，也不会因此取消排序 */
    if (drag.ci === ci && (next?.dataset.id === drag.id || prev?.dataset.id === drag.id)) return;
    view.dropCard(drag.id, ci, next?.dataset.id ?? null, prev?.dataset.id ?? null);
  });
}

function getPlaceholder(view: KanbanView): HTMLElement {
  if (!view.placeholder) view.placeholder = createDiv('sk-placeholder');
  return view.placeholder;
}

export function clearPlaceholder(view: KanbanView): void {
  if (view.placeholder) view.placeholder.remove();
  document.querySelectorAll<HTMLElement>('.sk-col.is-over').forEach((x) => x.removeClass('is-over'));
}
