import { App, Modal, Notice, Setting, setIcon } from 'obsidian';
import { PRIORITIES } from '../constants';
import { t } from '../i18n';
import { parseImageLine, splitNotes } from '../model/images';
import { absorbTitleTokens, normValue, uid } from '../model/parse';
import type { Card, ImageRef, Priority } from '../model/types';
import { hasFiles, imageFilesOf } from '../util/dom';
import type { KanbanView } from '../view/KanbanView';
import { ImageSuggestModal } from './ImageSuggestModal';

/* 新建 / 编辑卡片 */
export class CardModal extends Modal {
  view: KanbanView;
  card: Card | null;
  ci: number;
  isNew: boolean;

  constructor(app: App, view: KanbanView, card: Card | null, ci: number) {
    super(app);
    this.view = view;
    this.card = card;
    this.ci = ci;
    this.isNew = !card;
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    modalEl.addClass('sk-modal');
    const v = this.view;
    const plugin = v.plugin;
    const sh = plugin.settings.show;
    const base: Card = this.card || { id: '', title: '', priority: '', date: '', assignee: '', value: '', currency: '', tags: [], notes: [], done: false };
    const d: Card = Object.assign({}, base, { tags: [...base.tags], notes: [...base.notes] });
    const split = splitNotes(d.notes);
    let textLines = split.text;
    const images: ImageRef[] = split.images;
    let target = this.ci;

    contentEl.createEl('h3', { text: this.isNew ? t('modal.new') : t('modal.edit') });

    new Setting(contentEl).setName(t('modal.title')).addText((tc) => {
      tc.setPlaceholder(t('modal.titlePh')).setValue(d.title).onChange((x) => { d.title = x; });
      tc.inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submit(); } });
      window.setTimeout(() => tc.inputEl.focus(), 30);
    });
    new Setting(contentEl).setName(t('modal.column')).addDropdown((dd) => {
      v.b.columns.forEach((c, i) => { dd.addOption(String(i), c.title); });
      dd.setValue(String(target)).onChange((x) => { target = Number(x); });
    });
    new Setting(contentEl).setName(t('modal.desc')).setDesc(t('modal.descHint')).addTextArea((tc) => {
      tc.setValue(textLines.join('\n')).onChange((x) => { textLines = x.split('\n'); });
      tc.inputEl.rows = 3;
    });

    /* ---------- 图片 ---------- */
    if (sh.images) {
      const head = new Setting(contentEl).setName(t('modal.images')).setDesc(t('modal.imagesHint'));
      head.settingEl.addClass('sk-img-setting');
      const zone = contentEl.createDiv('sk-img-zone');
      const fileInput = contentEl.createEl('input', { type: 'file', attr: { accept: 'image/*', multiple: 'multiple' } });
      fileInput.addClass('sk-file-input');

      const addFiles = async (files: FileList | File[] | null | undefined) => {
        const list = imageFilesOf(files);
        if (!list.length) return;
        for (const f of list) {
          const im = parseImageLine(await plugin.saveImage(f, v.file));
          if (im) images.push(im);
        }
        renderZone();
      };

      const renderZone = () => {
        zone.empty();
        images.forEach((im, idx) => {
          const tile = zone.createDiv('sk-img-tile' + (idx === 0 ? ' is-cover' : ''));
          const src = v.resolveImage(im);
          if (src) {
            const img = tile.createEl('img', { attr: { src, alt: '', draggable: 'false' } });
            img.addEventListener('error', () => { img.remove(); setIcon(tile.createSpan('sk-ico'), 'image-off'); });
          } else setIcon(tile.createSpan('sk-ico'), 'image-off');
          tile.addEventListener('click', () => v.openLightbox(images, idx));
          if (idx === 0) tile.createSpan({ cls: 'sk-img-badge', text: t('modal.cover') });
          else {
            const star = tile.createEl('button', { cls: 'sk-img-act sk-img-star', attr: { type: 'button', 'aria-label': t('modal.setCover') } });
            setIcon(star, 'star');
            star.addEventListener('click', (e) => { e.stopPropagation(); images.unshift(images.splice(idx, 1)[0]); renderZone(); });
          }
          const del = tile.createEl('button', { cls: 'sk-img-act sk-img-del', attr: { type: 'button', 'aria-label': t('modal.removeImage') } });
          setIcon(del, 'x');
          del.addEventListener('click', (e) => { e.stopPropagation(); images.splice(idx, 1); renderZone(); });
        });
        const up = zone.createEl('button', { cls: 'sk-img-add', attr: { type: 'button' } });
        setIcon(up.createSpan('sk-ico'), 'upload');
        up.createSpan({ text: t('modal.upload') });
        up.addEventListener('click', () => fileInput.click());
        const lib = zone.createEl('button', { cls: 'sk-img-add', attr: { type: 'button' } });
        setIcon(lib.createSpan('sk-ico'), 'folder-search');
        lib.createSpan({ text: t('modal.fromVault') });
        lib.addEventListener('click', () => new ImageSuggestModal(this.app, (f) => {
          const im = parseImageLine('!' + this.app.fileManager.generateMarkdownLink(f, v.file ? v.file.path : ''));
          if (im) { images.push(im); renderZone(); }
        }).open());
      };
      renderZone();

      fileInput.addEventListener('change', () => { void addFiles(fileInput.files).then(() => { fileInput.value = ''; }); });
      zone.addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); zone.addClass('is-over'); });
      zone.addEventListener('dragleave', () => zone.removeClass('is-over'));
      zone.addEventListener('drop', (e) => { if (!hasFiles(e)) return; e.preventDefault(); zone.removeClass('is-over'); void addFiles((e.dataTransfer as DataTransfer).files); });
      modalEl.addEventListener('paste', (e) => {
        const files = imageFilesOf(e.clipboardData && e.clipboardData.files);
        if (!files.length) return;
        e.preventDefault();
        void addFiles(files);
      });
    }

    if (sh.priority) new Setting(contentEl).setName(t('modal.priority')).addDropdown((dd) => {
      dd.addOption('', t('prio.none'));
      PRIORITIES.forEach((p) => { dd.addOption(p, t(`prio.${p}`)); });
      dd.setValue(d.priority).onChange((x) => { d.priority = x as Priority; });
    });
    if (sh.date) new Setting(contentEl).setName(t('modal.date')).addText((tc) => {
      tc.inputEl.type = 'date';
      tc.setValue(d.date).onChange((x) => { d.date = x; });
    });
    if (sh.assignee) new Setting(contentEl).setName(t('modal.assignee')).addText((tc) => tc.setPlaceholder(t('modal.assigneePh')).setValue(d.assignee).onChange((x) => { d.assignee = x.trim(); }));
    if (sh.value) new Setting(contentEl).setName(t('modal.value')).setDesc(t('modal.valueHint')).addText((tc) => {
      tc.setPlaceholder('1280').setValue(d.value).onChange((x) => { d.value = normValue(x.replace(/[^\d.,]/g, '')); });
    });
    if (sh.tags) new Setting(contentEl).setName(t('modal.tags')).setDesc(t('modal.tagsHint')).addText((tc) => {
      tc.setPlaceholder(t('modal.tagsPh')).setValue(d.tags.join(' ')).onChange((x) => {
        d.tags = x.split(/[\s,，#]+/).filter(Boolean);
      });
    });

    const submit = () => {
      while (textLines.length && !textLines[textLines.length - 1].trim()) textLines.pop();
      d.notes = [...textLines, ...images.map((im) => im.raw)];
      /* 标题里写了 #标签、@日期 之类的标记：拿出来放进对应字段，并提示一下 */
      const absorbed = absorbTitleTokens(d);
      if (absorbed.converted.length) {
        Object.assign(d, absorbed.card);
        new Notice(t('card.titleTokens', { fields: absorbed.converted.map((k) => t(`show.${k as 'priority'}`)).join(', ') }));
      }
      const cols = v.b.columns;
      const dst = cols[target];
      if (this.isNew || !this.card) {
        d.id = uid();
        d.done = v.doneColumn === dst.title;
        dst.cards.push(d);
        v.enterCardId = d.id;
      } else {
        const card = this.card;
        Object.assign(card, d);
        if (target !== this.ci) {
          const src = cols[this.ci].cards;
          src.splice(src.indexOf(card), 1);
          dst.cards.push(card);
          card.done = v.doneColumn === dst.title;
          v.enterCardId = card.id;
        }
      }
      v.commit();
      this.close();
    };

    const bar = new Setting(contentEl);
    bar.settingEl.addClass('sk-modal-actions');
    if (!this.isNew) {
      bar.addButton((b) => b.setButtonText(t('delete')).setWarning().onClick(() => {
        this.close();
        v.removeCard(this.card as Card);
      }));
    }
    bar.addButton((b) => b.setButtonText(t('cancel')).onClick(() => this.close()));
    bar.addButton((b) => b.setButtonText(this.isNew ? t('modal.create') : t('modal.save')).setCta().onClick(submit));
  }

  onClose(): void { this.contentEl.empty(); }
}
