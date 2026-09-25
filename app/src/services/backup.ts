// Резервные копии: экспорт и импорт картотеки в ZIP (этап 6, раздел 9 документации).
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { migrateCatalog } from '../data/migrations';
import type { MetaKey, MetaValues } from '../data/repository';
import type { Catalog } from '../data/schema';

const CATALOG_ENTRY = 'catalog.json';
const MIME: Record<string, string> = { webp: 'image/webp', jpg: 'image/jpeg' };

/** Что нужно для сборки архива (LocalSource). */
export interface BackupSource {
  snapshot(): Promise<Catalog>;
  getCover(releaseId: string): Promise<Blob | undefined>;
}

/** Собирает ZIP: catalog.json в корне + обложки по тем же путям, что в release.cover. */
export async function exportZip(source: BackupSource): Promise<Blob> {
  const catalog = await source.snapshot();
  const files: Record<string, Uint8Array> = {
    [CATALOG_ENTRY]: strToU8(JSON.stringify(catalog, null, 2) + '\n'),
  };
  for (const release of catalog.releases) {
    if (!release.cover) continue;
    const blob = await source.getCover(release.id);
    if (!blob) continue;
    files[release.cover] = new Uint8Array(await blob.arrayBuffer());
  }
  return new Blob([zipSync(files)], { type: 'application/zip' });
}

/** Имя файла с датой, например music-catalog-2026-09-25.zip */
export function backupFilename(date = new Date()): string {
  return `music-catalog-${date.toISOString().slice(0, 10)}.zip`;
}

/** Запускает скачивание файла в браузере. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export interface ParsedBackup {
  catalog: Catalog;
  covers: Map<string, Blob>;
}

/** Разбирает ZIP: catalog.json (с миграцией формата, раздел 9) и обложки по путям из release.cover. */
export function parseZip(bytes: Uint8Array): ParsedBackup {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error('Файл повреждён или это не ZIP-архив');
  }
  const raw = files[CATALOG_ENTRY];
  if (!raw) throw new Error('В архиве нет catalog.json — это не резервная копия картотеки');
  const catalog = migrateCatalog(JSON.parse(strFromU8(raw)));
  const covers = new Map<string, Blob>();
  for (const release of catalog.releases) {
    if (!release.cover) continue;
    const data = files[release.cover];
    if (!data) continue;
    const ext = release.cover.split('.').pop() ?? '';
    covers.set(
      release.id,
      new Blob([new Uint8Array(data)], { type: MIME[ext] ?? 'application/octet-stream' }),
    );
  }
  return { catalog, covers };
}

/** Что нужно, чтобы применить разобранный архив (LocalSource). */
export interface RestoreTarget {
  replaceAll(catalog: Catalog, covers: Map<string, Blob>): Promise<void>;
  getMeta<K extends MetaKey>(key: K): Promise<MetaValues[K] | undefined>;
  setMeta<K extends MetaKey>(key: K, value: MetaValues[K]): Promise<void>;
}

/**
 * Заменяет картотеку на устройстве содержимым архива. В отличие от importPublished (этап 5),
 * это может быть любой архив, а не то, что уже опубликовано, — ставим revision++ и dirty,
 * чтобы автопубликация (если подключена) отправила восстановленные данные на сайт.
 */
export async function applyBackup(local: RestoreTarget, { catalog, covers }: ParsedBackup): Promise<void> {
  await local.replaceAll(catalog, covers);
  const revision = ((await local.getMeta('revision')) ?? 0) + 1;
  await local.setMeta('revision', revision);
  await local.setMeta('ownerName', catalog.owner.name);
  await local.setMeta('dirty', true);
}
