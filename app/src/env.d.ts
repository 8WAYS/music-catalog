declare const __APP_VERSION__: string;

/**
 * У пакета qrcode-generator в @types устаревшая CJS-сигнатура (export =), не совпадающая с тем,
 * как Vite резолвит его ESM-сборку (dist/qrcode.mjs, export default) — поэтому не ставим @types,
 * а объявляем ровно то, чем пользуемся (getModuleCount/isDark для рисования своего SVG).
 */
declare module 'qrcode-generator' {
  export interface QRCode {
    addData(data: string): void;
    make(): void;
    getModuleCount(): number;
    isDark(row: number, col: number): boolean;
  }
  export default function qrcode(typeNumber: number, errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H'): QRCode;
}
