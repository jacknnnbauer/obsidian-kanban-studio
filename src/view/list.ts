import { splitNotes } from '../model/images';
import { sortCards } from '../model/sort';
import { fmtDate, fmtMoney, initials, isOverdue } from '../util/format';
import { renderImage, renderPriorityBars } from './card';
import type { KanbanView } from './KanbanView';
import { t } from '../i18n';

export function renderList(view: KanbanView, main: HTMLElement): void {
  const wrap = main.createDiv('sk-listwrap');
  const table = wrap.createEl('table', { cls: 'sk-table' });
  const head = table.createEl('thead').createEl('tr');
  const sh = view.plugin.settings.show;
  const cols: [string, boolean][] = [[t('list.card'), true], [t('list.status'), true], [t('list.priority'), sh.priority], [t('list.date'), sh.date], [t('list.assignee'), sh.assignee], [t('list.value'), sh.value]];
  cols.forEach(([h, on]) => { if (on) head.createEl('th', { text: h }); });
  const body = table.createEl('tbody');
  let rows = 0;
  view.b.columns.forEach((col, ci) => {
    sortCards(col.cards.map((c, i) => ({ c, i })), view.sortOf(col.title)).forEach(({ c }) => {
      if (!view.matches(c)) return;
      rows++;
      const tr = body.createEl('tr');
      if (c.done) tr.addClass('is-done');
      const t = tr.createEl('td');
      const { text, images } = splitNotes(c.notes);
      const cell = t.createDiv('sk-list-cell');
      if (sh.images && images.length) renderImage(view, cell, images, 'sk-thumb sk-thumb-sm');
      const tx = cell.createDiv();
      tx.createDiv({ cls: 'sk-card-title', text: c.title });
      if (sh.description && text[0]) tx.createDiv({ cls: 'sk-card-sub', text: text[0] });
      tr.createEl('td').createSpan({ cls: 'sk-chip', text: col.title });
      const p = sh.priority ? tr.createEl('td') : null;
      if (p && c.priority) {
        const ch = p.createSpan('sk-chip sk-prio sk-prio-' + c.priority);
        renderPriorityBars(ch, c);
      }
      const d = sh.date ? tr.createEl('td') : null;
      if (d && c.date) d.createSpan({ cls: 'sk-chip sk-date' + (isOverdue(c) ? ' is-overdue' : ''), text: fmtDate(c.date) });
      const a = sh.assignee ? tr.createEl('td') : null;
      if (a && c.assignee) { a.createSpan({ cls: 'sk-avatar sk-avatar-sm', text: initials(c.assignee) }); a.createSpan({ cls: 'sk-card-person', text: ' ' + c.assignee }); }
      if (sh.value) tr.createEl('td', { cls: 'sk-card-value', text: c.value ? (c.currency || view.plugin.settings.currency) + fmtMoney(c.value) : '' });
      tr.addEventListener('click', () => view.openCardModal(c, ci));
    });
  });
  if (!rows) wrap.createDiv({ cls: 'sk-col-nomatch', text: t('col.noMatch') });
}
