import { App, Modal, Setting } from 'obsidian';
import { t } from '../i18n';

/* 二次确认（代替 window.confirm：移动端不一定支持，样式也和 Obsidian 不一致） */
export class ConfirmModal extends Modal {
  constructor(app: App, private message: string, private confirmText: string, private onConfirm: () => void) {
    super(app);
  }
  onOpen(): void {
    this.modalEl.addClass('sk-modal');
    this.contentEl.createEl('p', { text: this.message });
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText(t('cancel')).onClick(() => this.close()))
      .addButton((b) => b.setButtonText(this.confirmText).setWarning().onClick(() => { this.close(); this.onConfirm(); }));
  }
  onClose(): void { this.contentEl.empty(); }
}
