/*
 * 解析 & 序列化（纯函数，不依赖 obsidian，可直接在 Node 里测试）
 *
 * 数据格式（普通 Markdown）：
 *   ---
 *   studio-kanban: board
 *   ---
 *   ## 列名
 *   - [ ] 卡片标题 !high @2026-10-05 ~张伟 ¥1280 #标签
 *   	第一行描述（显示为副标题）
 */

import { FM_KEY, PRIORITIES, PRIORITY_ALIASES, SETTINGS_RE } from '../constants';
import type { Board, BoardSettings, Card, Column, Priority } from './types';
import { t } from '../i18n';

let _uid = 0;
export const uid = (): string => 'c' + (++_uid).toString(36) + Date.now().toString(36).slice(-4);

function normPriority(p: string): Priority {
  if (!p) return '';
  const k = PRIORITY_ALIASES[p] || p.toLowerCase();
  return (PRIORITIES as string[]).includes(k) ? (k as Priority) : '';
}

export function parseCardLine(s: string): Card {
  const card: Card = {
    id: uid(), title: '', priority: '', date: '', assignee: '',
    value: '', currency: '', tags: [], notes: [], done: false,
  };
  let rest = ' ' + s + ' ';
  rest = rest.replace(/\s!(critical|high|medium|low|紧急|高|中|低)(?=\s)/i, (m, p: string) => { card.priority = normPriority(p); return ' '; });
  rest = rest.replace(/\s(?:@|📅\s?)(\d{4}-\d{2}-\d{2})(?=\s)/, (m, d: string) => { card.date = d; return ' '; });
  rest = rest.replace(/\s~"([^"]+)"(?=\s)/, (m, n: string) => { card.assignee = n.trim(); return ' '; });
  if (!card.assignee) rest = rest.replace(/\s~(\S+)(?=\s)/, (m, n: string) => { card.assignee = n; return ' '; });
  rest = rest.replace(/\s([$¥€£])(\d[\d,]*(?:\.\d+)?)(?=\s)/, (m, cur: string, n: string) => { card.currency = cur; card.value = n.replace(/,/g, ''); return ' '; });
  rest = rest.replace(/\s#([^\s#]+)(?=\s)/g, (m, t: string) => { card.tags.push(t); return ' '; });
  card.title = rest.replace(/\s+/g, ' ').trim();
  return card;
}

export function parseBoard(text: string): Board {
  const board: Board = { frontmatter: '', preamble: [], columns: [], settings: {} };
  let body = text || '';
  const fm = body.match(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/);
  if (fm) { board.frontmatter = fm[0].replace(/\s+$/, ''); body = body.slice(fm[0].length); }

  let col: Column | null = null;
  let card: Card | null = null;
  for (const line of body.split(/\r?\n/)) {
    const sm = line.match(SETTINGS_RE);
    if (sm) { try { board.settings = JSON.parse(sm[1]) as BoardSettings; } catch { /* ignore */ } card = null; continue; }

    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) { col = { title: h[1], cards: [], extra: [] }; board.columns.push(col); card = null; continue; }

    const c = line.match(/^ ?[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (c && col) { card = parseCardLine(c[2]); card.done = c[1] !== ' '; col.cards.push(card); continue; }

    if (card && /^(\t| {2,})\S/.test(line)) { card.notes.push(line.replace(/^(\t| {2,})/, '')); continue; }

    if (!col) { board.preamble.push(line); continue; }
    if (line.trim() === '') continue;
    card = null;
    col.extra.push(line);
  }
  while (board.preamble.length && !board.preamble[0].trim()) board.preamble.shift();
  while (board.preamble.length && !board.preamble[board.preamble.length - 1].trim()) board.preamble.pop();
  return board;
}

/* frontmatter 里的 title；没有就返回 null（视图会退回用文件名） */
const FM_TITLE_RE = /^title:[ \t]*(.+?)\s*$/m;

export function getFrontmatterTitle(frontmatter: string): string | null {
  const m = frontmatter.match(FM_TITLE_RE);
  if (!m) return null;
  const v = m[1];
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) { try { return JSON.parse(v) as string; } catch { /* 落到下面 */ } }
  return v.replace(/^["']|["']$/g, '');
}

/* 需要加引号才能保持原样的 YAML 字符串 */
function yamlString(t: string): string {
  const needsQuote = /^[\s\-?:,[\]{}#&*!|>'"%@`]/.test(t) || /:(\s|$)/.test(t) || /\s#/.test(t) || /\s$/.test(t)
    || /['"]$/.test(t) || /^(true|false|yes|no|on|off|y|n|null|~)$/i.test(t)
    || /^[-+]?(\d[\d_]*)?\.?\d+([eE][-+]?\d+)?$/.test(t) || /^0[xob]/i.test(t);
  return needsQuote ? "'" + t.replace(/'/g, "''") + "'" : t;
}

/* 只改（或新增）title 这一行，frontmatter 其余内容不动。传入的 frontmatter 必须非空 */
export function setFrontmatterTitle(frontmatter: string, title: string): string {
  const line = 'title: ' + yamlString(title);
  if (FM_TITLE_RE.test(frontmatter)) return frontmatter.replace(FM_TITLE_RE, () => line);
  return frontmatter.replace(/\r?\n---[ \t]*$/, (end) => '\n' + line + end);
}

/* 金额：只保留开头一个合法数字（去掉千分位）；"1.2.3" → "1.2"，"." → "" */
export function normValue(v: string): string {
  const m = (v || '').replace(/,/g, '').match(/^\d+(?:\.\d+)?/);
  return m ? m[0] : '';
}

/*
 * 标题里如果写了 !high、@日期、~人、¥金额、#标签，保存后再读会被当成字段（文件格式如此）。
 * 在弹窗保存时先把它们拿出来放进对应字段，标题只留文字；返回转换了哪些字段，用来提示。
 */
export function absorbTitleTokens(c: Card): { card: Card; converted: string[] } {
  const p = parseCardLine(c.title);
  const card: Card = { ...c, title: p.title, tags: [...c.tags] };
  const converted: string[] = [];
  if (p.priority) { card.priority = p.priority; converted.push('priority'); }
  if (p.date) { card.date = p.date; converted.push('date'); }
  if (p.assignee) { card.assignee = p.assignee; converted.push('assignee'); }
  if (p.value) { card.value = p.value; card.currency = p.currency; converted.push('value'); }
  if (p.tags.length) { p.tags.forEach((tag) => { if (!card.tags.includes(tag)) card.tags.push(tag); }); converted.push('tags'); }
  return converted.length ? { card, converted } : { card: c, converted };
}

export function serializeCard(c: Card, defaultCurrency?: string): string {
  const parts = [c.title.trim() || t('untitledCard')];
  if (c.priority) parts.push('!' + c.priority);
  if (c.date) parts.push('@' + c.date);
  /* 带空格的名字要加引号，名字里的双引号换成单引号，否则读回来会串 */
  if (c.assignee) parts.push(/\s/.test(c.assignee) ? `~"${c.assignee.replace(/"/g, "'")}"` : '~' + c.assignee);
  const value = normValue(c.value);
  if (value) parts.push((c.currency || defaultCurrency || '¥') + value);
  /* 标签里不能有空格和 #，否则会被拆成两个 */
  c.tags.map((tag) => tag.replace(/[\s#]+/g, '')).filter(Boolean).forEach((tag) => parts.push('#' + tag));
  let out = `- [${c.done ? 'x' : ' '}] ` + parts.join(' ');
  c.notes.forEach((n) => { out += '\n\t' + n; });
  return out;
}

export function serializeBoard(b: Board, defaultCurrency?: string): string {
  const out: string[] = [];
  out.push(b.frontmatter || `---\n${FM_KEY}: board\n---`);
  out.push('');
  if (b.preamble.length) { out.push(...b.preamble); out.push(''); }
  b.columns.forEach((col) => {
    out.push('## ' + col.title);
    out.push('');
    col.cards.forEach((c) => out.push(serializeCard(c, defaultCurrency)));
    if (col.extra && col.extra.length) out.push(...col.extra);
    out.push('');
  });
  if (Object.keys(b.settings).length) {
    out.push('%% studio-kanban:settings ' + JSON.stringify(b.settings) + ' %%');
    out.push('');
  }
  return out.join('\n');
}
