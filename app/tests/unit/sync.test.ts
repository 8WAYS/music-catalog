import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalSource } from '../../src/data/localSource';
import { createRelease } from '../../src/data/schema';
import { publishNow, resetSyncForTests, startSync, syncState } from '../../src/store/sync';
import { FakeGitHub } from '../fakeGithub';

let local: LocalSource;
let gh: FakeGitHub;
let n = 0;

beforeEach(async () => {
  local = await LocalSource.open(`sync-${++n}`);
  gh = await FakeGitHub.create();
  vi.stubGlobal('fetch', gh.fetch);
  await local.setMeta('token', 'test-token');
  await local.setMeta('repo', gh.repo);
  await local.setMeta('branch', gh.branch);
  await local.saveRelease(createRelease({ title: 'In Rainbows', artist: 'Radiohead' }));
});
afterEach(() => {
  resetSyncForTests();
  vi.unstubAllGlobals();
  local.close();
});

describe('автопубликация', () => {
  it('два запуска одновременно не дают ложного конфликта и не теряют коммит', async () => {
    startSync(local);
    // Таймер и «Опубликовать сейчас» в один момент. Проверка `running` в run() стоит до await,
    // так что оба могут пройти её разом — это безопасно: ветка двигается только fast-forward,
    // второй получает 422, publish() перечитывает состояние и видит уже свой catalogSha.
    await Promise.all([publishNow(), publishNow()]);
    expect(syncState.value.status).toBe('published');
    // Гонка действительно случилась: второй успел собрать коммит от старой головы, GitHub его отверг
    const onBranch = new Set<string>();
    for (let sha: string | undefined = gh.head; sha; sha = gh.commits.get(sha)?.parents[0]) onBranch.add(sha);
    expect(gh.dataCommits.some((c) => !onBranch.has(c.sha))).toBe(true);
    // …но в ветку попало только то, что двигалось fast-forward, и данные на месте
    expect(JSON.parse(gh.text('data/catalog.json')!).releases).toHaveLength(1);
  });

  it('после успешной публикации статус «Опубликовано», флаг изменений снят', async () => {
    startSync(local);
    await publishNow();
    expect(syncState.value.status).toBe('published');
    expect(await local.getMeta('dirty')).toBe(false);
    expect(gh.dataCommits).toHaveLength(1);
  });
});
