import { setIcon } from 'obsidian';
import { btn } from '../util/dom';
import { animateSegmented } from './segmented';
import { t } from '../i18n';
import { VIEW_FILTERS } from './filters';
import type { KanbanView } from './KanbanView';

export interface NavItemOpts {
  icon?: string;
  label: string;
  count?: number;
  alert?: boolean;
  active?: boolean;
  onClick: () => void;
}

export function renderSidebar(view: KanbanView, root: HTMLElement): void {
  const side = root.createDiv('sk-side');
  const cards = view.allCards().map((x) => x.c);

  const head = side.createDiv('sk-side-head');
  /* 不再重复显示看板标题（主区的大标题已经有）：左边收起侧栏，右边新建卡片 */
  btn(head, 'sk-icon-btn sk-side-close', { icon: 'panel-left-close', label: t('side.hide'), onClick: () => { void view.plugin.setSidebar(false); } });
  btn(head, 'sk-round', { icon: 'plus', label: t('side.newCard'), onClick: () => view.openCardModal(null, view.defaultColumn()) });

  const seg = side.createDiv('sk-seg');
  const scopes = ([['all', t('side.scopeAll')], ['open', t('side.scopeOpen')]] as const).map(([id, label]) => {
    const b = btn(seg, 'sk-seg-btn' + (view.filter.scope === id ? ' is-active' : ''), { text: label });
    b.addEventListener('click', () => { view.filter.scope = id; view.render(); });
    return b;
  });
  animateSegmented(seg, scopes, view.filter.scope === 'open' ? 1 : 0, view.segMemory, 'scope');

  const search = side.createDiv('sk-search');
  setIcon(search.createSpan('sk-ico'), 'search');
  const input = search.createEl('input', { type: 'text', placeholder: t('side.search') });
  input.value = view.filter.search;
  input.addEventListener('input', () => { view.filter.search = input.value.trim(); view.renderMain(); });
  search.createSpan({ cls: 'sk-kbd', text: '/' });

  const nav = side.createDiv('sk-nav');
  const isAll = !view.filter.view && !view.filter.tag && !view.filter.assignee;
  navItem(nav, { icon: 'inbox', label: t('filter.all'), count: cards.length, active: isAll, onClick: () => { view.filter.view = null; view.filter.tag = null; view.filter.assignee = null; view.render(); } });

  navGroup(view, side, 'views', t('side.views'), 'sliders-horizontal', VIEW_FILTERS.map((v) => ({
    label: t(v.label),
    count: cards.filter(v.test).length,
    alert: v.alert,
    active: view.filter.view === v.id,
    onClick: () => { view.filter.view = view.filter.view === v.id ? null : v.id; view.render(); },
  })));

  const tagCounts: Record<string, number> = {};
  cards.forEach((c) => c.tags.forEach((tag) => { tagCounts[tag] = (tagCounts[tag] || 0) + 1; }));
  const tags = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]);
  if (tags.length && view.plugin.settings.show.sideTags) {
    navGroup(view, side, 'tags', t('side.tags'), 'hash', tags.map((tag) => ({
      label: tag, count: tagCounts[tag], active: view.filter.tag === tag,
      onClick: () => { view.filter.tag = view.filter.tag === tag ? null : tag; view.render(); },
    })));
  }

  const people: Record<string, number> = {};
  cards.forEach((c) => { if (c.assignee) people[c.assignee] = (people[c.assignee] || 0) + 1; });
  const names = Object.keys(people).sort((a, b) => people[b] - people[a]);
  if (names.length && view.plugin.settings.show.sidePeople && view.plugin.settings.show.assignee) {
    navGroup(view, side, 'people', t('side.people'), 'users', names.map((n) => ({
      label: n, count: people[n], active: view.filter.assignee === n,
      onClick: () => { view.filter.assignee = view.filter.assignee === n ? null : n; view.render(); },
    })));
  }

  side.createDiv('sk-spacer');
  const foot = side.createDiv('sk-nav sk-side-foot');
  navItem(foot, {
    icon: 'check-circle-2', label: t('filter.done'), count: cards.filter((c) => c.done).length,
    active: view.filter.view === 'done',
    onClick: () => { view.filter.view = view.filter.view === 'done' ? null : 'done'; view.render(); },
  });
  navItem(foot, { icon: 'file-text', label: t('side.source'), onClick: () => { void view.plugin.openAsMarkdown(view.leaf, view.file); } });
  navItem(foot, { icon: 'settings', label: t('side.settings'), onClick: () => view.plugin.openSettings() });
}

function navItem(parent: HTMLElement, o: NavItemOpts): HTMLButtonElement {
  const b = btn(parent, 'sk-nav-item' + (o.active ? ' is-active' : ''), {});
  if (o.icon) setIcon(b.createSpan('sk-ico'), o.icon);
  b.createSpan({ cls: 'sk-nav-label', text: o.label });
  if (o.count !== undefined) b.createSpan({ cls: 'sk-count' + (o.alert && o.count > 0 ? ' is-alert' : ''), text: String(o.count) });
  b.addEventListener('click', o.onClick);
  return b;
}

function navGroup(view: KanbanView, parent: HTMLElement, id: string, label: string, icon: string, items: NavItemOpts[]): void {
  const g = parent.createDiv('sk-group');
  const collapsed = view.collapsedGroups.has(id);
  const h = btn(g, 'sk-group-head', {});
  setIcon(h.createSpan('sk-ico'), icon);
  h.createSpan({ cls: 'sk-nav-label', text: label });
  const chev = h.createSpan('sk-ico sk-chev' + (collapsed ? ' is-collapsed' : ''));
  setIcon(chev, 'chevron-down');
  h.addEventListener('click', () => { collapsed ? view.collapsedGroups.delete(id) : view.collapsedGroups.add(id); view.render(); });
  if (collapsed) return;
  const tree = g.createDiv('sk-tree');
  items.forEach((it) => navItem(tree, it));
}
