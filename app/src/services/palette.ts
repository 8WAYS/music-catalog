import type { CoverColors } from '../data/schema';

// Цвет из обложки (раздел 7.2): медианное сечение → 6 цветов → bg / accent / text с проверкой контраста.

export type RGB = [number, number, number];
export interface Swatch {
  rgb: RGB;
  count: number;
}

export const FALLBACK_ACCENT = '#d9823b';

// ---------- Цветовые утилиты ----------

export function toHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function luminance([r, g, b]: RGB): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255].map(Math.round) as RGB;
}

// ---------- Медианное сечение ----------

/** Строит палитру из RGBA-пикселей (обычно 64×64). Прозрачные и почти прозрачные пиксели пропускаются. */
export function extractPalette(pixels: Uint8ClampedArray | number[], size = 6): Swatch[] {
  const points: RGB[] = [];
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if ((pixels[i + 3] ?? 255) < 128) continue;
    points.push([pixels[i]!, pixels[i + 1]!, pixels[i + 2]!]);
  }
  if (!points.length) return [];

  let boxes: RGB[][] = [points];
  while (boxes.length < size) {
    // Делим коробку с наибольшим диапазоном по какому-либо каналу
    let best = -1;
    let bestRange = 0;
    let bestCh = 0;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      for (let ch = 0; ch < 3; ch++) {
        let min = 255;
        let max = 0;
        for (const p of box) {
          min = Math.min(min, p[ch]!);
          max = Math.max(max, p[ch]!);
        }
        if (max - min > bestRange) {
          bestRange = max - min;
          best = i;
          bestCh = ch;
        }
      }
    });
    if (best < 0) break;
    const box = boxes[best]!.slice().sort((a, b) => a[bestCh]! - b[bestCh]!);
    const mid = box.length >> 1;
    boxes = [...boxes.slice(0, best), box.slice(0, mid), box.slice(mid), ...boxes.slice(best + 1)];
  }

  return boxes
    .filter((b) => b.length)
    .map((box) => {
      const sum = box.reduce<[number, number, number]>(
        (acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]],
        [0, 0, 0],
      );
      return { rgb: sum.map((v) => Math.round(v / box.length)) as RGB, count: box.length };
    })
    .sort((a, b) => b.count - a.count);
}

// ---------- Выбор ролей ----------

/**
 * bg — тёмный насыщенный (оттенок доминирующего цвета, светлота ≤ 14%),
 * accent — самый яркий цвет палитры с контрастом ≥ 3:1 к bg (при нехватке — осветляется),
 * text — светлый с контрастом ≥ 4.5:1.
 */
export function pickCoverColors(palette: Swatch[]): CoverColors {
  if (!palette.length) return { bg: '#1a1816', accent: FALLBACK_ACCENT, text: '#f2ede6' };

  const vivid = (rgb: RGB) => {
    const [, s, l] = rgbToHsl(rgb);
    return s * (1 - Math.abs(l - 0.55) * 1.4);
  };

  // bg: среди первых по площади цветов берём самый насыщенный, затемняем
  const top = palette.slice(0, 3);
  const bgSource = top.reduce((a, b) =>
    rgbToHsl(b.rgb)[1] * b.count > rgbToHsl(a.rgb)[1] * a.count ? b : a,
  );
  const [bh, bs] = rgbToHsl(bgSource.rgb);
  const bg = hslToRgb(bh, Math.min(bs, 0.55), 0.11);

  // accent: самый яркий с контрастом ≥ 3
  const candidates = [...palette].sort((a, b) => vivid(b.rgb) - vivid(a.rgb));
  let accent: RGB | undefined = candidates.find(
    (c) => rgbToHsl(c.rgb)[1] > 0.25 && contrast(c.rgb, bg) >= 3,
  )?.rgb;
  if (!accent) {
    const src = candidates[0]!.rgb;
    const [h, s] = rgbToHsl(src);
    if (s < 0.2) accent = fromHex(FALLBACK_ACCENT);
    else {
      for (let l = 0.55; l <= 0.9; l += 0.05) {
        const c = hslToRgb(h, Math.max(s, 0.5), l);
        if (contrast(c, bg) >= 3) {
          accent = c;
          break;
        }
      }
    }
  }
  accent ??= fromHex(FALLBACK_ACCENT);

  // text: почти белый с оттенком bg
  let text = hslToRgb(bh, 0.25, 0.93);
  if (contrast(text, bg) < 4.5) text = [255, 255, 255];

  return { bg: toHex(bg), accent: toHex(accent), text: toHex(text) };
}
