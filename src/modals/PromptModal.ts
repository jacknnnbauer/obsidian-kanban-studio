import { App, Modal, Setting } from 'obsidian';
import { t } from '../i18n';

/* 输入框弹窗（新建 / 重命名列） */
export class PromptModal extends Modal {
  titleText: string;
  value: string;
  onSubmit: (value: string) => void;

  constructor(app: App, title: string, value: string, onSubmit: (value: string) => void) {
    super(app);
    this.titleText = title;
    this.value = value;
    this.onSubmit = onSubmit;
  }
  onOpen(): void {
    this.modalEl.addClass('sk-modal');
    this.contentEl.createEl('h3', { text: this.titleText });
    let val = this.value;
    const done = () => { this.close(); this.onSubmit((val || '').trim()); };
    new Setting(this.contentEl).setName(t('modal.name')).addText((tc) => {
      tc.setValue(val).onChange((x) => { val = x; });
      tc.inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); done(); } });
      window.setTimeout(() => { tc.inputEl.focus(); tc.inputEl.select(); }, 30);
    });
    new Setting(this.contentEl).addButton((b) => b.setButtonText(t('ok')).setCta().onClick(done));
  }
  onClose(): void { this.contentEl.empty(); }
}
