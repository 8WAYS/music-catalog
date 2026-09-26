import qrcode from 'qrcode-generator';

/** Светлая рамка вокруг кода (спецификация QR требует «тихую зону») — иначе камера не распознаёт код. */
const QUIET_ZONE = 4;

/**
 * QR-код ссылкой на витрину: свой SVG по матрице модулей, а не `createSvgTag` из библиотеки —
 * нужен контроль над цветом и рамкой. Код всегда чёрным по белому независимо от темы приложения:
 * это не оформление, а условие, при котором его вообще можно отсканировать камерой.
 */
export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const qr = qrcode(0, 'M');
  qr.addData(value);
  qr.make();
  const n = qr.getModuleCount();
  let path = '';
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (qr.isDark(row, col)) path += `M${col} ${row}h1v1h-1z`;
    }
  }
  const box = n + QUIET_ZONE * 2;
  return (
    <svg
      viewBox={`0 0 ${box} ${box}`}
      width={size}
      height={size}
      role="img"
      aria-label="QR-код со ссылкой на витрину"
    >
      <rect width={box} height={box} fill="#fff" rx={2} />
      <path d={path} fill="#141414" transform={`translate(${QUIET_ZONE} ${QUIET_ZONE})`} />
    </svg>
  );
}
