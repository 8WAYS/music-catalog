import type { CoverColors } from '../data/schema';

/** Аура — размытые цвета обложек за интерфейсом (ADR 0008). Цвета берутся из coverColors. */
export function Aura({ colors }: { colors: (CoverColors | undefined)[] }) {
  const c = colors.filter((x) => !!x);
  if (!c.length) return <div class="aura" aria-hidden="true" />;
  // Три пятна: из одной обложки — фон, акцент и снова фон; из нескольких — по пятну от каждой
  const [c1, c2, c3] =
    c.length === 1
      ? [c[0]!.accent, c[0]!.bg, c[0]!.accent]
      : [c[0]!.accent, c[1]!.accent, (c[2] ?? c[0]!).bg];
  return (
    <div
      class="aura"
      aria-hidden="true"
      style={{ '--c1': c1, '--c2': c2, '--c3': c3 } as Record<string, string>}
    />
  );
}

/** Общие SVG-определения: перламутровая заливка для звёздочки */
export function SvgDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <linearGradient id="pearlFill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#e9d3e1" />
          <stop offset="0.35" stop-color="#eee6cf" />
          <stop offset="0.6" stop-color="#d3e8dd" />
          <stop offset="0.85" stop-color="#cfdfee" />
          <stop offset="1" stop-color="#dcd2ee" />
        </linearGradient>
      </defs>
    </svg>
  );
}
