// Публикация картотеки в репозиторий одним коммитом через Git Data API (раздел 3.3).
import { migrateCatalog } from '../data/migrations';
import type { MetaKey, MetaValues } from '../data/repository';
import type { Catalog } from '../data/schema';
import { GitHubError, fromBase64, gitBlobSha, githubApi, toBase64, type GitHubConfig } from './github';

const DATA = 'data/';
const CATALOG = 'data/catalog.json';

/** Что нужно публикатору от локального хранилища (LocalSource). */
export interface PublishSource {
  snapshot(): Promise<Catalog>;
  getCover(releaseId: string): Promise<Blob | undefined>;
  getMeta<K extends MetaKey>(key: K): Promise<MetaValues[K] | undefined>;
  setMeta<K extends MetaKey>(key: K, value: MetaValues[K]): Promise<void>;
  replaceAll(catalog: Catalog, covers: Map<string, Blob>): Promise<void>;
}

/** Опубликованная версия изменилась не нами (другое устройство, ручная правка) — решает пользователь. */
export class PublishConflict extends Error {
  constructor() {
    super('Опубликованная картотека изменилась с другого устройства.');
    this.name = 'PublishConflict';
  }
}

export interface PublishResult {
  commitSha: string;
  revision: number;
  uploadedCovers: number;
  deletedCovers: number;
}

type Fetch = typeof fetch;
interface TreeEntry {
  path: string;
  type: string;
  sha: string;
}

/** Состояние ветки: голова, корневое дерево и файлы в data/ с их git-хэшами. */
async function readRemote(api: ReturnType<typeof githubApi>, branch: string) {
  const ref = await api.get<{ object: { sha: string } }>(`/git/ref/heads/${branch}`);
  const head = ref.object.sha;
  const commit = await api.get<{ tree: { sha: string } }>(`/git/commits/${head}`);
  const root = await api.get<{ tree: TreeEntry[] }>(`/git/trees/${commit.tree.sha}`);
  const files = new Map<string, string>();
  const data = root.tree.find((e) => e.path === 'data' && e.type === 'tree');
  if (data) {
    const sub = await api.get<{ tree: TreeEntry[] }>(`/git/trees/${data.sha}?recursive=1`);
    for (const e of sub.tree) if (e.type === 'blob') files.set(DATA + e.path, e.sha);
  }
  return { head, treeSha: commit.tree.sha, files };
}

export async function publish(
  local: PublishSource,
  cfg: GitHubConfig,
  { force = false, fetchFn = fetch }: { force?: boolean; fetchFn?: Fetch } = {},
): Promise<PublishResult> {
  const api = githubApi(cfg, fetchFn);
  for (let attempt = 1; ; attempt++) {
    try {
      return await publishOnce(local, api, cfg.branch, force);
    } catch (e) {
      // Ветку сдвинули между чтением и записью (например, пришёл коммит кода) — перечитываем один раз
      if (e instanceof GitHubError && e.kind === 'race' && attempt < 2) continue;
      throw e;
    }
  }
}

async function publishOnce(
  local: PublishSource,
  api: ReturnType<typeof githubApi>,
  branch: string,
  force: boolean,
): Promise<PublishResult> {
  const remote = await readRemote(api, branch);
  const remoteCatalog = remote.files.get(CATALOG);
  const ours = await local.getMeta('catalogSha');
  // Конфликт — только если изменился сам catalog.json: коммиты кода двигают ветку, но это не конфликт
  if (!force && remoteCatalog && remoteCatalog !== ours) throw new PublishConflict();

  const snap = await local.snapshot();
  const entries: { path: string; mode: '100644'; type: 'blob'; sha?: string | null; content?: string }[] = [];

  // Обложки: загружаем только новые и изменённые, лишние удаляем
  const wanted = new Set<string>();
  let uploaded = 0;
  for (const r of snap.releases) {
    if (!r.cover) continue;
    const path = DATA + r.cover;
    const blob = await local.getCover(r.id);
    if (!blob) continue;
    wanted.add(path);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (remote.files.get(path) === (await gitBlobSha(bytes))) continue;
    const created = await api.post<{ sha: string }>('/git/blobs', {
      content: toBase64(bytes),
      encoding: 'base64',
    });
    entries.push({ path, mode: '100644', type: 'blob', sha: created.sha });
    uploaded++;
  }
  let deleted = 0;
  for (const path of remote.files.keys()) {
    if (path.startsWith(DATA + 'covers/') && !path.endsWith('.gitkeep') && !wanted.has(path)) {
      entries.push({ path, mode: '100644', type: 'blob', sha: null });
      deleted++;
    }
  }

  const text = JSON.stringify(snap, null, 2) + '\n';
  entries.push({ path: CATALOG, mode: '100644', type: 'blob', content: text });

  const tree = await api.post<{ sha: string }>('/git/trees', { base_tree: remote.treeSha, tree: entries });
  const commit = await api.post<{ sha: string }>('/git/commits', {
    message: `data: publish rev ${snap.revision}`,
    tree: tree.sha,
    parents: [remote.head],
  });
  await api.patch(`/git/refs/heads/${branch}`, { sha: commit.sha, force: false });

  await local.setMeta('catalogSha', await gitBlobSha(new TextEncoder().encode(text)));
  await local.setMeta('lastCommitSha', commit.sha);
  await local.setMeta('publishedRevision', snap.revision);
  await local.setMeta('publishedAt', snap.publishedAt);
  // Пока публиковали, могли появиться новые правки — тогда картотека остаётся «грязной»
  if (((await local.getMeta('revision')) ?? 0) === snap.revision) await local.setMeta('dirty', false);
  return { commitSha: commit.sha, revision: snap.revision, uploadedCovers: uploaded, deletedCovers: deleted };
}

/**
 * Загрузить опубликованную версию на устройство, заменив локальную:
 * новое устройство владельца или выбор «взять опубликованную» при конфликте.
 */
export async function importPublished(
  local: PublishSource,
  cfg: GitHubConfig,
  fetchFn: Fetch = fetch,
): Promise<Catalog> {
  const api = githubApi(cfg, fetchFn);
  const remote = await readRemote(api, cfg.branch);
  const catalogSha = remote.files.get(CATALOG);
  if (!catalogSha) throw new GitHubError('notFound', 'Опубликованной картотеки пока нет.');
  const readBlob = async (sha: string) =>
    fromBase64((await api.get<{ content: string }>(`/git/blobs/${sha}`)).content);

  const catalog = migrateCatalog(JSON.parse(new TextDecoder().decode(await readBlob(catalogSha))));
  const covers = new Map<string, Blob>();
  for (const r of catalog.releases) {
    const sha = r.cover && remote.files.get(DATA + r.cover);
    if (!sha) continue;
    const type = r.cover!.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    covers.set(r.id, new Blob([await readBlob(sha)], { type }));
  }
  await local.replaceAll(catalog, covers);
  await local.setMeta('catalogSha', catalogSha);
  await local.setMeta('revision', catalog.revision);
  await local.setMeta('publishedRevision', catalog.revision);
  await local.setMeta('publishedAt', catalog.publishedAt);
  await local.setMeta('ownerName', catalog.owner.name);
  await local.setMeta('dirty', false);
  return catalog;
}
