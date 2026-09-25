import type { CoverColors } from '../data/schema';
import { extractPalette, pickCoverColors } from './palette';

export const COVER_SIZE = 600;
export const COVER_MAX_BYTES = 100 * 1024;
const MAX_INPUT_BYTES = 40 * 1024 * 1024;

export interface ProcessedCover {
  blob: Blob;
  colors: CoverColors;
}

export class ImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageError';
  }
}

async function decode(input: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (input.size > MAX_INPUT_BYTES) throw new ImageError('Файл слишком большой (больше 40 МБ)');
  if (input.type && !input.type.startsWith('image/')) throw new ImageError('Это не картинка');
  try {
    return await createImageBitmap(input);
  } catch {
    // Запасной путь для браузеров, где createImageBitmap не понимает формат
    const url = URL.createObjectURL(input);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } catch {
      throw new ImageError('Не удалось прочитать картинку');
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Обложка → квадрат 600×600 (обрезка по центру), WebP ≤ 100 КБ + цвета для карточки.
 * Safari не умеет кодировать WebP из canvas — тогда сохраняем JPEG (см. ADR 0002).
 */
export async function processCover(input: Blob): Promise<ProcessedCover> {
  const img = await decode(input);
  const w = 'naturalWidth' in img ? img.naturalWidth : img.width;
  const h = 'naturalHeight' in img ? img.naturalHeight : img.height;
  if (!w || !h) throw new ImageError('Пустая картинка');
  const side = Math.min(w, h);
  const sx = (w - side) / 2;
  const sy = (h - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = COVER_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageError('Canvas недоступен');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, side, side, 0, 0, COVER_SIZE, COVER_SIZE);
  if ('close' in img) img.close();

  // Палитра по уменьшенной копии 64×64
  const small = document.createElement('canvas');
  small.width = small.height = 64;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  if (!sctx) throw new ImageError('Canvas недоступен');
  sctx.drawImage(canvas, 0, 0, 64, 64);
  const colors = pickCoverColors(extractPalette(sctx.getImageData(0, 0, 64, 64).data));

  let blob: Blob | null = null;
  for (const q of [0.82, 0.72, 0.6, 0.5]) {
    blob = await toBlob(canvas, 'image/webp', q);
    if (!blob || blob.type !== 'image/webp') {
      blob = null;
      break;
    }
    if (blob.size <= COVER_MAX_BYTES) break;
  }
  if (!blob) {
    for (const q of [0.82, 0.72, 0.6, 0.5]) {
      blob = await toBlob(canvas, 'image/jpeg', q);
      if (!blob || blob.size <= COVER_MAX_BYTES) break;
    }
  }
  if (!blob) throw new ImageError('Не удалось сжать картинку');
  return { blob, colors };
}
