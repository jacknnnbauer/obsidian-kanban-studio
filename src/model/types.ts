export type Priority = 'critical' | 'high' | 'medium' | 'low' | '';

export interface Card {
  id: string;
  title: string;
  priority: Priority;
  date: string;
  assignee: string;
  value: string;
  currency: string;
  tags: string[];
  notes: string[];
  done: boolean;
}

export interface Column {
  title: string;
  cards: Card[];
  extra: string[];
}

/* 列内排序：按卡片日期从早到晚 / 从晚到早；不设就是手动顺序 */
export type ColumnSort = 'date-asc' | 'date-desc';

export interface BoardSettings {
  doneColumn?: string;
  /* 列名 → 排序方式（只存设了排序的列） */
  sort?: Record<string, ColumnSort>;
}

export interface Board {
  frontmatter: string;
  preamble: string[];
  columns: Column[];
  settings: BoardSettings;
}

/* 描述里单独占一行的图片 */
export interface ImageRef {
  raw: string;
  target: string;
}
