import { Notice, setIcon } from 'obsidian';
import { PRIORITY_LEVEL } from '../constants';
import { t } from '../i18n';
import { splitNotes } from '../model/images';
import type { Card, ImageRef } from '../model/types';
import { btn, hasFiles, imageFilesOf } from '../util/dom';
import { fmtDate, fmtMoney, initials, isOverdue } from '../util/format';
import { clearPlaceholder } from './dnd';
import type { KanbanView } from './KanbanView';

/* 加载过的图片地址：重绘时直接显示，不再从透明淡入一遍（否则每次改动所有带图卡片都会闪） */
const loadedSrc = new Set<string>();

/* 封面 / 缩略图 */
export function renderImage(view: KanbanView, parent: HTMLElement, images: ImageRef[], cls: string): HTMLElement {
  const fig = parent.createDiv(cls);
  const broken = () => { fig.empty(); fig.addClass('is-broken'); setIcon(fig.createSpan('sk-ico'), 'image-off'); };
  const src = view.resolveImage(images[0]);
  if (!src) { broken(); return fig; }
  const img = fig.createEl('img', { attr: { src, alt: '', loading: 'lazy', draggable: 'false' } });
  if (loadedSrc.has(src)) fig.addClass('is-loaded', 'no-fade');
  img.addEventListener('load', () => { loadedSrc.add(src); fig.addClass('is-loaded'); });
  img.addEventListener('error', broken);
  if (images.length > 1) {
    const b = fig.createSpan('sk-img-count');
    setIcon(b.createSpan('sk-ico'), 'images');
    b.createSpan({ text: String(images.length) });
  }
  fig.setAttr('aria-label', t('card.viewImage'));
  fig.addEventListener('click', (e) => { e.stopPropagation(); view.openLightbox(images, 0); });
  return fig;
}

export function renderEmpty(view: KanbanView, list: HTMLElement, ci: number, isDone: boolean): void {
  const e = list.createDiv('sk-empty');
  const art = e.createDiv('sk-empty-art');
  const win = art.createDiv('sk-empty-win');
  const dots = win.createDiv('sk-empty-dots');
  for (let i = 0; i < 3; i++) dots.createSpan();
  const grid = win.createDiv('sk-empty-grid');
  for (let i = 0; i < 3; i++) grid.createDiv('sk-empty-tile');
  const pill = art.createDiv('sk-empty-pill');
  setIcon(pill, 'plus');
  const floating = art.createDiv('sk-empty-float');
  floating.createSpan(); floating.createSpan();

  e.createDiv({ cls: 'sk-empty-title', text: isDone ? t('empty.doneTitle') : t('empty.title') });
  e.createDiv({ cls: 'sk-empty-desc', text: isDone ? t('empty.doneDesc') : t('empty.desc') });
  btn(e, 'sk-primary sk-primary-sm', { icon: 'plus', text: t('col.addCard'), onClick: () => view.openCardModal(null, ci) });
}

/* 优先级胶囊：4 格信号条 + 文字（卡片和列表视图共用） */
export function renderPriorityBars(chip: HTMLElement, c: Card): void {
  const bars = chip.createSpan('sk-bars');
  for (let b = 1; b <= 4; b++) bars.createSpan(b <= PRIORITY_LEVEL[c.priority] ? 'on' : '');
  if (c.priority) chip.createSpan({ text: t(`prio.${c.priority}`) });
}

export function renderCard(view: KanbanView, list: HTMLElement, c: Card, ci: number, i: number): void {
  const el = list.createDiv('sk-card');
  el.dataset.idx = String(i);
  el.dataset.id = c.id;
  if (view.enterCardId === c.id) el.addClass('is-entering');
  el.draggable = true;
  el.tabIndex = 0;
  if (c.done) el.addClass('is-done');

  const sh = view.plugin.settings.show;
  const { text, images } = splitNotes(c.notes);
  const layout = view.compact ? 'thumb' : view.plugin.settings.image.layout;
  const withImg = sh.images && images.length > 0;
  if (withImg && layout === 'cover') { renderImage(view, el, images, 'sk-cover'); el.addClass('has-cover'); }
  const row = withImg && layout === 'thumb' ? el.createDiv('sk-card-row') : null;
  const body = row ? row.createDiv('sk-card-main') : el;

  const chips = body.createDiv('sk-chips');
  if (c.priority && sh.priority) {
    const p = chips.createSpan('sk-chip sk-prio sk-prio-' + c.priority);
    renderPriorityBars(p, c);
  }
  if (c.date && sh.date) {
    const d = chips.createSpan('sk-chip sk-date' + (isOverdue(c) ? ' is-overdue' : ''));
    setIcon(d.createSpan('sk-ico'), 'calendar');
    d.createSpan({ text: fmtDate(c.date) });
  }
  if (c.done) {
    const d = chips.createSpan('sk-chip sk-donechip');
    setIcon(d.createSpan('sk-ico'), 'check');
    d.createSpan({ text: t('done') });
  }
  if (!chips.childElementCount) chips.remove();

  body.createDiv({ cls: 'sk-card-title', text: c.title || t('untitledCard') });
  const firstLine = text.find((t) => t.trim());
  const sub = [sh.description ? firstLine : null, ...(sh.tags ? c.tags.map((t) => '#' + t) : [])].filter(Boolean).join(' · ');
  if (sub) body.createDiv({ cls: 'sk-card-sub', text: sub });
  if (row) renderImage(view, row, images, 'sk-thumb');

  const showPerson = sh.assignee && c.assignee;
  const showValue = sh.value && c.value;
  if (showPerson || showValue) {
    const foot = el.createDiv('sk-card-foot');
    if (showPerson) {
      foot.createSpan({ cls: 'sk-avatar sk-avatar-sm', text: initials(c.assignee) });
      foot.createSpan({ cls: 'sk-card-person', text: c.assignee });
    }
    foot.createDiv('sk-spacer');
    if (showValue) foot.createSpan({ cls: 'sk-card-value', text: (c.currency || view.plugin.settings.currency) + fmtMoney(c.value) });
  }

  /* 直接把图片文件拖到卡片上 */
  el.addEventListener('dragover', (e) => {
    if (view.drag || !hasFiles(e)) return;
    e.preventDefault(); e.stopPropagation();
    (e.dataTransfer as DataTransfer).dropEffect = 'copy';
    el.addClass('is-file-over');
  });
  el.addEventListener('dragleave', (e) => { if (!el.contains(e.relatedTarget as Node | null)) el.removeClass('is-file-over'); });
  el.addEventListener('drop', (e) => {
    if (view.drag || !hasFiles(e)) return;
    e.preventDefault(); e.stopPropagation();
    el.removeClass('is-file-over');
    const files = imageFilesOf((e.dataTransfer as DataTransfer).files);
    if (!files.length) { new Notice(t('card.onlyImages')); return; }
    void (async () => {
      for (const f of files) c.notes.push(await view.plugin.saveImage(f, view.file));
      view.commit();
      new Notice(t('card.imagesAdded', { n: files.length }));
    })();
  });

  el.addEventListener('click', () => view.openCardModal(c, ci));
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') view.openCardModal(c, ci); });
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); view.cardMenu(e, c, ci); });

  el.addEventListener('dragstart', (e) => {
    view.drag = { ci, idx: i, id: c.id };
    (e.dataTransfer as DataTransfer).effectAllowed = 'move';
    (e.dataTransfer as DataTransfer).setData('text/plain', c.title);
    window.requestAnimationFrame(() => el.addClass('is-dragging'));
  });
  el.addEventListener('dragend', () => {
    el.removeClass('is-dragging');
    view.drag = null;
    clearPlaceholder(view);
  });
}
