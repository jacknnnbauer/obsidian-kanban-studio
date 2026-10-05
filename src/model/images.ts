import type { ImageRef } from './types';

export const IMG_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

/* 一行描述如果只是一张图片（![[x.png]] 或 ![](url)），返回 { raw, target } */
export function parseImageLine(line: string | null | undefined): ImageRef | null {
  const t = (line || '').trim();
  let m = t.match(/^!\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]$/);
  if (m) return IMG_EXT_RE.test(m[1].trim()) ? { raw: t, target: m[1].trim() } : null;
  m = t.match(/^!\[[^\]]*\]\(\s*<?([^)>]+?)>?(?:\s+"[^"]*")?\s*\)$/);
  if (m) return { raw: t, target: m[1].trim() };
  return null;
}

export function splitNotes(notes: string[] | null | undefined): { text: string[]; images: ImageRef[] } {
  const text: string[] = [];
  const images: ImageRef[] = [];
  (notes || []).forEach((n) => { const im = parseImageLine(n); if (im) images.push(im); else text.push(n); });
  return { text, images };
}
