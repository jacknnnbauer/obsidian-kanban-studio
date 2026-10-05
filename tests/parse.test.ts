/*
 * 解析 / 序列化的回归测试（不需要 Obsidian）。
 * 运行：npm test
 * 前 5 个用例照搬自 0.3.0 原型的 tests/parse.test.js。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { absorbTitleTokens, getFrontmatterTitle, normValue, parseBoard, parseCardLine, serializeBoard, serializeCard, setFrontmatterTitle } from '../src/model/parse';
import { parseImageLine, splitNotes } from '../src/model/images';
import { accentInk } from '../src/util/color';
import { sortCards } from '../src/model/sort';

const EXAMPLE = join(__dirname, '../examples/云栖书店-旗舰店开业筹备.md');

describe('parse', () => {
  test('示例看板：解析后再序列化，第二次结果稳定', () => {
    const src = readFileSync(EXAMPLE, 'utf8');
    const b = parseBoard(src);
    expect(b.columns.map((c) => c.cards.length)).toEqual([4, 3, 3, 3]);
    expect(b.settings.doneColumn).toBe('已完成');
    expect(b.columns[2].cards[0].notes[1]).toContain('](https://github.com/');   // 描述里的链接原样保留
    const s1 = serializeBoard(b);
    expect(serializeBoard(parseBoard(s1))).toBe(s1);
  });

  test('卡片行：各种标记', () => {
    const c = parseCardLine('Fix AC ~"Nate Coleman" $1,310.5 📅 2026-10-05 !高 #hvac #现场');
    expect(c.title).toBe('Fix AC');
    expect(c.assignee).toBe('Nate Coleman');
    expect(c.value).toBe('1310.5');
    expect(c.currency).toBe('$');
    expect(c.date).toBe('2026-10-05');
    expect(c.priority).toBe('high');
    expect(c.tags).toEqual(['hvac', '现场']);
  });

  test('图片行识别', () => {
    expect(parseImageLine('![[a b.png|300]]')?.target).toBe('a b.png');
    expect(parseImageLine('![[note]]')).toBeNull();              // 嵌入笔记不是图片
    expect(parseImageLine('![](<x y.jpg>)')?.target).toBe('x y.jpg');
    expect(parseImageLine('文字 ![[x.png]]')).toBeNull();        // 必须独占一行
    const { text, images } = splitNotes(['说明', '![[p1.png]]', '![](https://e.com/p)']);
    expect(text).toEqual(['说明']);
    expect(images.length).toBe(2);
  });

  test('带图片的卡片往返不丢内容', () => {
    const src = '---\nstudio-kanban: board\n---\n\n## A\n\n- [ ] T !high ~张伟 ¥10\n\t说明\n\t![[p1.png]]\n';
    expect(serializeBoard(parseBoard(src))).toBe(src);
  });

  test('强调色文字自动选黑/白', () => {
    expect(accentInk('#D7F25C')).toBe('#18191B');
    expect(accentInk('#2B2D31')).toBe('#FFFFFF');
  });
});

describe('frontmatter title', () => {
  const fm = '---\nstudio-kanban: board\ntitle: 现场问题整改\n---';

  test('读取：没有 title 时返回 null，有引号时去掉', () => {
    expect(getFrontmatterTitle('---\nstudio-kanban: board\n---')).toBeNull();
    expect(getFrontmatterTitle(fm)).toBe('现场问题整改');
    expect(getFrontmatterTitle('---\ntitle: "带引号"\n---')).toBe('带引号');
  });

  test('写入：只改 title 这一行，其余不动', () => {
    const out = setFrontmatterTitle(fm, '新标题');
    expect(out).toBe('---\nstudio-kanban: board\ntitle: 新标题\n---');
    expect(getFrontmatterTitle(out)).toBe('新标题');
  });

  test('写入：YAML 特殊字符会加引号，读回来不变', () => {
    for (const t of ['a: b', '#开头', '- 列表', 'true', '123', "it's", 'x #y', '[括号]', '@人', 'say "hi"']) {
      const out = setFrontmatterTitle(fm, t);
      expect(getFrontmatterTitle(out)).toBe(t);
      expect(parseBoard(out + '\n\n## A\n').frontmatter).toBe(out);
    }
  });
});

describe('列排序', () => {
  const card = (title: string, date: string) => ({ ...parseCardLine(title), date });
  const items = [card('a', '2026-10-05'), card('b', ''), card('c', '2026-01-01'), card('d', '2026-10-05'), card('e', '')]
    .map((c, i) => ({ c, i }));

  test('从早到晚 / 从晚到早；没日期的放最后；同一天保持原顺序', () => {
    expect(sortCards(items, 'date-asc').map((x) => x.c.title)).toEqual(['c', 'a', 'd', 'b', 'e']);
    expect(sortCards(items, 'date-desc').map((x) => x.c.title)).toEqual(['a', 'd', 'c', 'b', 'e']);
  });

  test('手动排序不动原数组', () => {
    expect(sortCards(items, undefined)).toBe(items);
    sortCards(items, 'date-asc');
    expect(items.map((x) => x.c.title)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  test('排序设置写进看板文件，往返不丢', () => {
    const src = '---\nstudio-kanban: board\n---\n\n## A\n\n- [ ] x @2026-01-01\n\n%% studio-kanban:settings {"doneColumn":"A","sort":{"A":"date-desc"}} %%\n';
    const b = parseBoard(src);
    expect(b.settings.sort).toEqual({ A: 'date-desc' });
    expect(serializeBoard(b)).toBe(src);
  });
});

describe('写回时不改坏数据', () => {
  const roundTrip = (c: ReturnType<typeof parseCardLine>) => parseBoard('## A\n' + serializeCard(c, '¥') + '\n').columns[0].cards[0];

  test('金额只认一个合法数字：1.2.3 → 1.2，单独的点不写', () => {
    expect(normValue('1.2.3')).toBe('1.2');
    expect(normValue('.')).toBe('');
    expect(normValue('1,280.50')).toBe('1280.50');
    expect(normValue('abc')).toBe('');
    const back = roundTrip({ ...parseCardLine('买材料'), value: '1.2.3' });
    expect(back.title).toBe('买材料');
    expect(back.value).toBe('1.2');
  });

  test('负责人名字里的双引号换成单引号，读回来不串', () => {
    const back = roundTrip({ ...parseCardLine('t'), assignee: 'Tom "TJ" Lee' });
    expect(back.title).toBe('t');
    expect(back.assignee).toBe("Tom 'TJ' Lee");
  });

  test('标签里的 # 和空格不会把一个标签拆成两个', () => {
    const back = roundTrip({ ...parseCardLine('t'), tags: ['a#b', 'c d'] });
    expect(back.tags).toEqual(['ab', 'cd']);
  });
});

describe('标题里的标记转成字段', () => {
  test('#3、$100、@日期、~人、!优先级 从标题里拿出来，标题留下纯文字', () => {
    const base = { ...parseCardLine('x'), title: '修复 #3 问题 付 $100 定金 @2026-01-01 找 ~老王 !high', tags: ['已有'] };
    const { card, converted } = absorbTitleTokens(base);
    expect(card.title).toBe('修复 问题 付 定金 找');
    expect(card.tags).toEqual(['已有', '3']);
    expect(card.value).toBe('100');
    expect(card.currency).toBe('$');
    expect(card.date).toBe('2026-01-01');
    expect(card.assignee).toBe('老王');
    expect(card.priority).toBe('high');
    expect(converted).toEqual(['priority', 'date', 'assignee', 'value', 'tags']);
  });

  test('没有标记时什么都不变', () => {
    const base = { ...parseCardLine('普通标题'), value: '5', currency: '¥' };
    const { card, converted } = absorbTitleTokens(base);
    expect(card).toEqual(base);
    expect(converted).toEqual([]);
  });
});
