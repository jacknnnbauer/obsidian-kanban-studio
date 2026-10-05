import { App, Modal, setIcon } from 'obsidian';
import { t } from '../i18n';

export interface LightboxItem {
  src: string;
  name: string;
}

/* 图片大图预览：← → 切换，Esc 关闭 */
export class ImageLightbox extends Modal {
  items: LightboxItem[];
  index: number;

  constructor(app: App, items: LightboxItem[], index: number) {
    super(app);
    this.items = items;
    this.index = index || 0;
  }
  onOpen(): void {
    this.modalEl.addClass('sk-lightbox');
    this.containerEl.addClass('sk-lightbox-container');
    this.scope.register([], 'ArrowLeft', () => { this.step(-1); return false; });
    this.scope.register([], 'ArrowRight', () => { this.step(1); return false; });
    this.show();
  }
  step(dir: number): void {
    if (this.items.length < 2) return;
    this.index = (this.index + dir + this.items.length) % this.items.length;
    this.show();
  }
  show(): void {
    const c = this.contentEl;
    c.empty();
    const it = this.items[this.index];
    const stage = c.createDiv('sk-lb-stage');
    const img = stage.createEl('img', { attr: { src: it.src, alt: it.name } });
    img.addEventListener('load', () => stage.addClass('is-loaded'));
    const bar = c.createDiv('sk-lb-bar');
    bar.createSpan({ cls: 'sk-lb-name', text: it.name });
    if (this.items.length > 1) {
      bar.createSpan({ cls: 'sk-lb-count', text: `${this.index + 1} / ${this.items.length}` });
      const prev = bar.createEl('button', { cls: 'sk-lb-nav', attr: { type: 'button', 'aria-label': t('lightbox.prev') } });
      setIcon(prev, 'chevron-left');
      prev.addEventListener('click', () => this.step(-1));
      const next = bar.createEl('button', { cls: 'sk-lb-nav', attr: { type: 'button', 'aria-label': t('lightbox.next') } });
      setIcon(next, 'chevron-right');
      next.addEventListener('click', () => this.step(1));
    }
  }
  onClose(): void { this.contentEl.empty(); }
}
