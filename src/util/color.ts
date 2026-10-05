/* 根据强调色亮度自动选择上面文字的颜色（深底白字 / 浅底黑字） */
export function accentInk(hex: string | null | undefined): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#18191B';
  const n = parseInt(m[1], 16);
  const lin = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * lin(n >> 16 & 255) + 0.7152 * lin(n >> 8 & 255) + 0.0722 * lin(n & 255);
  const onDark = (1.05) / (L + 0.05);      // 白字对比度
  const onLight = (L + 0.05) / (0.0113 + 0.05); // #18191B 对比度
  return onDark > onLight ? '#FFFFFF' : '#18191B';
}
