import { moment } from 'obsidian';
import type { Card } from '../model/types';
import { getCurrentLanguage, t } from '../i18n';

export function dayDiff(dateStr: string): number | null {
  const m = moment(dateStr, 'YYYY-MM-DD', true);
  if (!m.isValid()) return null;
  return m.startOf('day').diff(moment().startOf('day'), 'days');
}

export function fmtDate(dateStr: string): string {
  const d = dayDiff(dateStr);
  if (d === null) return dateStr;
  if (d === 0) return t('date.today');
  if (d === 1) return t('date.tomorrow');
  if (d === -1) return t('date.yesterday');
  /* 月份名用插件语言，不跟随 Obsidian 的 moment 语言 */
  const m = moment(dateStr, 'YYYY-MM-DD');
  return (getCurrentLanguage() === 'en' ? m.locale('en') : m).format(t('date.format'));
}

export function initials(name: string): string {
  if (!name) return '?';
  const n = name.trim();
  if (/[㐀-鿿]/.test(n)) return n.length >= 3 ? n.slice(-2) : n;
  const words = n.split(/[\s._-]+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function fmtMoney(n: string | number): string {
  return Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

export function isOverdue(c: Card): boolean {
  if (!c.date || c.done) return false;
  const d = dayDiff(c.date);
  return d !== null && d < 0;
}
