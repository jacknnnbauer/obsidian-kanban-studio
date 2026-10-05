import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { resolveLanguage, setLanguage, t, type I18nKey } from '../src/i18n';
import { parseBoard, serializeBoard } from '../src/model/parse';

afterEach(() => setLanguage('zh'));

/* 从源码里收集所有用到的 key，逐个确认两种语言都有、占位符一致 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? sourceFiles(p) : p.endsWith('.ts') ? [p] : [];
  });
}
const placeholders = (s: string) => (s.match(/\{\w+\}/g) || []).sort();

describe('i18n', () => {
  const src = readFileSync(join(__dirname, '../src/i18n.ts'), 'utf8');
  const keys = [...src.slice(0, src.indexOf('export type I18nKey')).matchAll(/^\s*'([\w.]+)':/gm)].map((m) => m[1]) as I18nKey[];

  test('每个 key 中英文都非空，占位符一致', () => {
    expect(keys.length).toBeGreaterThan(150);
    for (const k of keys) {
      setLanguage('zh'); const zh = t(k);
      setLanguage('en'); const en = t(k);
      expect(zh, k).toBeTruthy();
      expect(en, k).toBeTruthy();
      expect(placeholders(en), k).toEqual(placeholders(zh));
    }
  });

  test('源码里用到的静态 key 都存在', () => {
    const used = new Set<string>();
    for (const f of sourceFiles(join(__dirname, '../src')).filter((p) => !p.endsWith('i18n.ts'))) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\bt\('([\w.]+)'/g)) used.add(m[1]);
    }
    for (const k of used) expect(keys, k).toContain(k);
  });

  test('占位符替换', () => {
    setLanguage('en');
    expect(t('col.deleteConfirm', { title: 'A', n: 3 })).toBe('“A” has 3 cards. Delete them too?');
    setLanguage('zh');
    expect(t('top.open', { n: 2 })).toBe('2 张进行中');
  });

  test('跟随 Obsidian：中文系用中文，其余用英文；手动选择优先', () => {
    expect(resolveLanguage('auto', 'zh')).toBe('zh');
    expect(resolveLanguage('auto', 'zh-TW')).toBe('zh');
    expect(resolveLanguage('auto', 'en')).toBe('en');
    expect(resolveLanguage('auto', 'de')).toBe('en');
    expect(resolveLanguage('auto', '')).toBe('en');
    expect(resolveLanguage('zh', 'en')).toBe('zh');
    expect(resolveLanguage('en', 'zh')).toBe('en');
  });

  test('切换语言不影响解析：中文优先级写法照样识别', () => {
    setLanguage('en');
    const out = serializeBoard(parseBoard('## A\n- [ ] 修 !高\n- [ ] \n'));
    expect(out).toContain('- [ ] 修 !high');
    expect(out).toContain('- [ ] Untitled card');
  });
});
