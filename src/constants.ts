import type { Priority } from './model/types';

export const VIEW_TYPE = 'studio-kanban-view';
export const FM_KEY = 'studio-kanban';
export const SETTINGS_RE = /^%%\s*studio-kanban:settings\s*(\{.*\})\s*%%\s*$/;

export const PRIORITIES: Exclude<Priority, ''>[] = ['critical', 'high', 'medium', 'low'];
export const PRIORITY_LEVEL: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
export const PRIORITY_ALIASES: Record<string, string> = { '紧急': 'critical', '高': 'high', '中': 'medium', '低': 'low' };

export type ShowKey =
  | 'priority' | 'date' | 'assignee' | 'value' | 'description' | 'tags' | 'images'
  | 'headerStats' | 'headerPeople' | 'sideTags' | 'sidePeople';

/* 可在设置里开关的显示项（文字见 i18n 的 show.<key>） */
export const SHOW_FIELDS: { key: ShowKey; group: 'card' | 'header' | 'side' }[] = [
  { key: 'priority', group: 'card' },
  { key: 'date', group: 'card' },
  { key: 'assignee', group: 'card' },
  { key: 'value', group: 'card' },
  { key: 'description', group: 'card' },
  { key: 'tags', group: 'card' },
  { key: 'images', group: 'card' },
  { key: 'headerStats', group: 'header' },
  { key: 'headerPeople', group: 'header' },
  { key: 'sideTags', group: 'side' },
  { key: 'sidePeople', group: 'side' },
];

/* 强调色预设（名字见 i18n 的 accent.<id>） */
export const ACCENT_PRESETS = [
  { id: 'lime', hex: '#D7F25C' },
  { id: 'mint', hex: '#9FE3C5' },
  { id: 'sky', hex: '#A9D4FF' },
  { id: 'lavender', hex: '#C9B8FF' },
  { id: 'peach', hex: '#FFC2A8' },
  { id: 'amber', hex: '#FFD166' },
  { id: 'coral', hex: '#FF7A59' },
  { id: 'indigo', hex: '#4F5BD5' },
  { id: 'forest', hex: '#2F7D5B' },
  { id: 'graphite', hex: '#2B2D31' },
] as const;

/* 图片选项（文字见 i18n 的 imgLayout / imgHeight / imgFit） */
export const IMAGE_LAYOUTS = ['cover', 'thumb'] as const;
export const IMAGE_HEIGHTS = ['s', 'm', 'l'] as const;
export const IMAGE_FITS = ['cover', 'contain'] as const;

export type ImageLayout = typeof IMAGE_LAYOUTS[number];
export type ImageHeight = typeof IMAGE_HEIGHTS[number];
export type ImageFit = typeof IMAGE_FITS[number];
export type FontSize = 's' | 'm' | 'l';

/* 字号（文字见 i18n 的 fontSize.<id> / fontSize.<id>.title） */
export const FONT_SIZES: FontSize[] = ['s', 'm', 'l'];
