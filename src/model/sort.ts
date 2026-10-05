/*
 * 列内排序（只影响显示，不改 Markdown 里的顺序）。
 * 按卡片日期排；没有日期的卡片无论正序倒序都放在最后，彼此保持原来的顺序。
 */
import type { Card, ColumnSort } from './types';

export function sortCards<T extends { c: Card; i: number }>(items: T[], mode: ColumnSort | undefined): T[] {
  if (!mode) return items;
  const dir = mode === 'date-desc' ? -1 : 1;
  return [...items].sort((a, b) => {
    const da = a.c.date;
    const db = b.c.date;
    if (!da || !db) return (da ? 0 : 1) - (db ? 0 : 1) || a.i - b.i;
    return (da < db ? -1 : da > db ? 1 : 0) * dir || a.i - b.i;
  });
}
