import { PRIORITY_LEVEL } from '../constants';
import type { Card } from '../model/types';
import { dayDiff, isOverdue } from '../util/format';
import type { I18nKey } from '../i18n';

export interface ViewFilter {
  id: string;
  label: I18nKey;
  icon: string;
  test: (c: Card) => boolean;
  alert?: boolean;
}

export const VIEW_FILTERS: ViewFilter[] = [
  { id: 'high', label: 'filter.high', icon: 'flame', test: (c) => !c.done && PRIORITY_LEVEL[c.priority] >= 3 },
  { id: 'overdue', label: 'filter.overdue', icon: 'alarm-clock', test: (c) => isOverdue(c), alert: true },
  { id: 'week', label: 'filter.week', icon: 'calendar-clock', test: (c) => { if (!c.date || c.done) return false; const d = dayDiff(c.date); return d !== null && d >= 0 && d <= 7; } },
  { id: 'unassigned', label: 'filter.unassigned', icon: 'user-x', test: (c) => !c.done && !c.assignee },
];
