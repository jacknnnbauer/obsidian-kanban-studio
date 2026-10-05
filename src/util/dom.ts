import { setIcon } from 'obsidian';
import { IMG_EXT_RE } from '../model/images';

export function hasFiles(e: DragEvent): boolean {
  return !!(e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files'));
}

export function imageFilesOf(list: FileList | File[] | null | undefined): File[] {
  return Array.from(list || []).filter((f) => (f.type || '').startsWith('image/') || IMG_EXT_RE.test(f.name || ''));
}

export interface BtnOpts {
  icon?: string;
  text?: string;
  label?: string;
  onClick?: (e: MouseEvent) => void;
}

export function btn(parent: HTMLElement, cls: string, opts?: BtnOpts): HTMLButtonElement {
  const b = parent.createEl('button', { cls: 'sk-btn ' + (cls || '') });
  b.type = 'button';
  if (opts && opts.icon) { const i = b.createSpan('sk-ico'); setIcon(i, opts.icon); }
  if (opts && opts.text) b.createSpan({ text: opts.text });
  if (opts && opts.label) b.setAttr('aria-label', opts.label);
  if (opts && opts.onClick) b.addEventListener('click', opts.onClick);
  return b;
}
