import { describe, expect, it } from 'vitest';
import { contrast, extractPalette, fromHex, pickCoverColors, type RGB } from '../../src/services/palette';

function image(colors: [RGB, number][]): number[] {
  const px: number[] = [];
  for (const [[r, g, b], n] of colors) for (let i = 0; i < n; i++) px.push(r, g, b, 255);
  return px;
}

describe('palette', () => {
  it('медианное сечение находит основные цвета по площади', () => {
    const pal = extractPalette(
      image([
        [[20, 30, 120], 3000],
        [[240, 200, 40], 1000],
      ]),
    );
    expect(pal[0]!.rgb).toEqual([20, 30, 120]);
    expect(pal.some((s) => s.rgb[0] === 240)).toBe(true);
  });

  it('пропускает прозрачные пиксели', () => {
    expect(extractPalette([255, 0, 0, 0, 255, 0, 0, 10])).toEqual([]);
  });

  it.each([
    [
      'синяя с жёлтым',
      [
        [[20, 30, 120], 3000],
        [[240, 200, 40], 1000],
      ],
    ],
    ['серая', [[[128, 128, 128], 4096]]],
    [
      'почти белая',
      [
        [[250, 250, 245], 4000],
        [[200, 190, 180], 96],
      ],
    ],
    [
      'чёрная с красным',
      [
        [[5, 5, 5], 3500],
        [[200, 20, 30], 596],
      ],
    ],
  ] as [string, [RGB, number][]][])('%s: контрасты по требованиям 7.2', (_name, spec) => {
    const c = pickCoverColors(extractPalette(image(spec)));
    const bg = fromHex(c.bg);
    expect(contrast(fromHex(c.accent), bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(fromHex(c.text), bg)).toBeGreaterThanOrEqual(4.5);
    expect(c.bg).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('пустая палитра → запасные цвета', () => {
    expect(pickCoverColors([]).accent).toBe('#d9823b');
  });
});
