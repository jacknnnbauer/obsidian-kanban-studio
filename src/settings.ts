import { App, PluginSettingTab, Setting } from 'obsidian';
import {
  ACCENT_PRESETS, FONT_SIZES, IMAGE_FITS, IMAGE_HEIGHTS, IMAGE_LAYOUTS, SHOW_FIELDS,
  type FontSize, type ImageFit, type ImageHeight, type ImageLayout, type ShowKey,
} from './constants';
import { t, type LangSetting } from './i18n';
import type StudioKanbanPlugin from './main';

export interface StudioKanbanSettings {
  /* 折叠：auto = 放不下才折叠；count = 超过固定张数折叠；off = 不折叠 */
  foldMode: 'auto' | 'count' | 'off';
  cardLimit: number;
  currency: string;
  accent: string;
  showSidebar: boolean;
  newBoardFolder: string;
  fontSize: FontSize;
  language: LangSetting;
  show: Record<ShowKey, boolean>;
  image: { layout: ImageLayout; height: ImageHeight; fit: ImageFit };
}

export const DEFAULT_SETTINGS: StudioKanbanSettings = {
  foldMode: 'auto',
  cardLimit: 4,
  currency: '¥',
  accent: '#D7F25C',
  showSidebar: true,
  newBoardFolder: '',
  fontSize: 'm',
  language: 'auto',
  show: {
    priority: true, date: true, assignee: true, value: true, description: true, tags: true, images: true,
    headerStats: true, headerPeople: true, sideTags: true, sidePeople: true,
  },
  image: { layout: 'cover', height: 'm', fit: 'cover' },
};

export class SettingsTab extends PluginSettingTab {
  plugin: StudioKanbanPlugin;

  constructor(app: App, plugin: StudioKanbanPlugin) { super(app, plugin); this.plugin = plugin; }

  display(): void {
    const { containerEl } = this;
    const s = this.plugin.settings;
    const save = () => { void this.plugin.saveSettings(); };
    containerEl.empty();

    new Setting(containerEl).setName(t('set.appearance')).setHeading();
    new Setting(containerEl).setName(t('set.language')).setDesc(t('set.languageDesc'))
      .addDropdown((dd) => {
        dd.addOption('auto', t('set.languageAuto')).addOption('zh', '中文').addOption('en', 'English');
        dd.setValue(s.language || 'auto').onChange((x) => { s.language = x as LangSetting; void this.plugin.saveSettings().then(() => this.display()); });
      });
    new Setting(containerEl).setName(t('fontSize')).setDesc(t('set.fontSizeDesc'))
      .addDropdown((dd) => {
        FONT_SIZES.forEach((id) => { dd.addOption(id, t(`fontSize.${id}`)); });
        dd.setValue(s.fontSize || 'm').onChange((x) => { void this.plugin.setFontSize(x); });
      });
    const accentSetting = new Setting(containerEl).setName(t('set.accent'))
      .setDesc(t('set.accentDesc'));
    const sw = accentSetting.controlEl.createDiv('sk-swatches');
    const renderSwatches = () => {
      sw.empty();
      ACCENT_PRESETS.forEach((p) => {
        const name = t(`accent.${p.id}`);
        const b = sw.createEl('button', { cls: 'sk-swatch' + (s.accent.toLowerCase() === p.hex.toLowerCase() ? ' is-active' : ''), attr: { type: 'button', 'aria-label': name, title: name } });
        b.style.background = p.hex;
        b.addEventListener('click', () => { s.accent = p.hex; save(); renderSwatches(); });
      });
      sw.createDiv('sk-swatch-sep');
      const custom = sw.createEl('input', { type: 'color', attr: { 'aria-label': t('set.customColor'), title: t('set.customColor') } });
      custom.value = s.accent;
      custom.addEventListener('change', () => { s.accent = custom.value; save(); renderSwatches(); });
    };
    renderSwatches();
    const pv = accentSetting.descEl.createDiv('sk-accent-preview');
    pv.createSpan({ cls: 'sk-pv-chip', text: t('set.previewDone') });
    pv.createSpan({ cls: 'sk-pv-chip', text: '12' });
    new Setting(containerEl).setName(t('set.sidebar')).setDesc(t('set.sidebarDesc'))
      .addToggle((tc) => tc.setValue(s.showSidebar).onChange((x) => { void this.plugin.setSidebar(x); }));

    const toggles = (group: string) => SHOW_FIELDS.filter((f) => f.group === group).forEach((f) => {
      new Setting(containerEl).setName(t(`show.${f.key}`))
        .addToggle((tc) => tc.setValue(!!s.show[f.key]).onChange((x) => { s.show[f.key] = x; save(); }));
    });

    new Setting(containerEl).setName(t('set.cardInfo')).setDesc(t('set.cardInfoDesc')).setHeading();
    toggles('card');

    new Setting(containerEl).setName(t('set.images')).setHeading();
    new Setting(containerEl).setName(t('set.imgLayout')).setDesc(t('set.imgLayoutDesc'))
      .addDropdown((dd) => { IMAGE_LAYOUTS.forEach((k) => { dd.addOption(k, t(`imgLayout.${k}`)); }); dd.setValue(s.image.layout).onChange((x) => { s.image.layout = x as ImageLayout; save(); }); });
    new Setting(containerEl).setName(t('set.imgHeight'))
      .addDropdown((dd) => { IMAGE_HEIGHTS.forEach((k) => { dd.addOption(k, t(`imgHeight.${k}`)); }); dd.setValue(s.image.height).onChange((x) => { s.image.height = x as ImageHeight; save(); }); });
    new Setting(containerEl).setName(t('set.imgFit')).setDesc(t('set.imgFitDesc'))
      .addDropdown((dd) => { IMAGE_FITS.forEach((k) => { dd.addOption(k, t(`imgFit.${k}`)); }); dd.setValue(s.image.fit).onChange((x) => { s.image.fit = x as ImageFit; save(); }); });

    new Setting(containerEl).setName(t('set.header')).setHeading();
    toggles('header');
    new Setting(containerEl).setName(t('set.side')).setHeading();
    toggles('side');

    new Setting(containerEl).setName(t('set.other')).setHeading();
    new Setting(containerEl).setName(t('set.fold')).setDesc(t('set.foldDesc'))
      .addDropdown((dd) => {
        dd.addOption('auto', t('set.foldAuto')).addOption('count', t('set.foldCount')).addOption('off', t('set.foldOff'));
        dd.setValue(s.foldMode).onChange((x) => { s.foldMode = x as StudioKanbanSettings['foldMode']; save(); });
      });
    new Setting(containerEl).setName(t('set.cardLimit')).setDesc(t('set.cardLimitDesc'))
      .addSlider((sl) => sl.setLimits(1, 20, 1).setValue(s.cardLimit).setDynamicTooltip().onChange((x) => { s.cardLimit = x; save(); }));
    new Setting(containerEl).setName(t('set.currency')).setDesc(t('set.currencyDesc'))
      .addText((tc) => tc.setValue(s.currency).onChange((x) => { s.currency = x || '¥'; save(); }));
    new Setting(containerEl).setName(t('set.folder')).setDesc(t('set.folderDesc'))
      .addText((tc) => tc.setPlaceholder(t('set.folderPh')).setValue(s.newBoardFolder).onChange((x) => { s.newBoardFolder = x.trim(); save(); }));
  }
}
