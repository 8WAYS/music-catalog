import { FORMAT_VERSION, ValidationError, validateCatalog, type Catalog } from './schema';

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/**
 * Миграции формата catalog.json: ключ — версия, С которой мигрируем.
 * При несовместимом изменении формата: FORMAT_VERSION++ и добавить сюда шаг N → N+1.
 */
export const MIGRATIONS: Record<number, Migration> = {
  // 1 → 2: MusicBrainz заменён на iTunes (ADR 0004). mbid в iTunes не переводится — убираем.
  1: (raw) => ({
    ...raw,
    version: 2,
    releases: Array.isArray(raw.releases)
      ? raw.releases.map((r: unknown) => {
          if (!r || typeof r !== 'object') return r;
          const rest = { ...(r as Record<string, unknown>) };
          delete rest.mbid;
          return rest;
        })
      : raw.releases,
  }),
};

export function migrateCatalog(input: unknown): Catalog {
  if (!input || typeof input !== 'object') throw new ValidationError(['Файл не похож на картотеку']);
  let raw = input as Record<string, unknown>;
  let version = typeof raw.version === 'number' ? raw.version : NaN;
  if (!Number.isInteger(version) || version < 1) throw new ValidationError(['Неизвестная версия формата']);
  if (version > FORMAT_VERSION)
    throw new ValidationError([`Файл создан более новой версией приложения (формат ${version})`]);
  while (version < FORMAT_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new ValidationError([`Нет миграции с версии ${version}`]);
    raw = step(raw);
    version = raw.version as number;
  }
  const catalog = {
    revision: 0,
    publishedAt: new Date(0).toISOString(),
    owner: { name: '' },
    ...raw,
  } as Catalog;
  const issues = validateCatalog(catalog);
  if (issues.length) throw new ValidationError(issues);
  return catalog;
}
