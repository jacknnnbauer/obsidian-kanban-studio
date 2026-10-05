import { App, FuzzySuggestModal, TFile } from 'obsidian';
import { IMG_EXT_RE } from '../model/images';
import { t } from '../i18n';

/* 从库中选择图片 */
export class ImageSuggestModal extends FuzzySuggestModal<TFile> {
  onChoose: (f: TFile) => void;

  constructor(app: App, onChoose: (f: TFile) => void) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder(t('suggest.images'));
  }
  getItems(): TFile[] { return this.app.vault.getFiles().filter((f) => IMG_EXT_RE.test('.' + f.extension)); }
  getItemText(f: TFile): string { return f.path; }
  onChooseItem(f: TFile): void { this.onChoose(f); }
}
