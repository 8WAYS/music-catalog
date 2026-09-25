// Git Data API в памяти — для unit- и e2e-тестов публикации. Хэши blob — настоящие git-хэши.
import { fromBase64, gitBlobSha, toBase64 } from '../src/services/github';

type Files = Map<string, string>; // путь → sha blob

export interface FakeCommit {
  sha: string;
  tree: string;
  parents: string[];
  message: string;
}

export class FakeGitHub {
  blobs = new Map<string, Uint8Array>();
  trees = new Map<string, Files>();
  commits = new Map<string, FakeCommit>();
  head = '';
  log: string[] = [];
  /** Сколько раз подряд ответить 422 на сдвиг ветки (гонка с чужим коммитом) */
  failNextPatch = 0;
  /** Ответ на любой запрос, например 401 */
  forceStatus?: number;
  private seq = 0;

  constructor(
    readonly repo = 'me/music-catalog',
    readonly branch = 'main',
  ) {}

  static async create(
    files: Record<string, string> = { 'app/index.html': '<html>', 'data/covers/.gitkeep': '' },
  ) {
    const gh = new FakeGitHub();
    const tree = new Map<string, string>();
    for (const [path, text] of Object.entries(files))
      tree.set(path, await gh.putBlob(new TextEncoder().encode(text)));
    gh.head = gh.addCommit(gh.addTree(tree), [], 'init');
    return gh;
  }

  async putBlob(bytes: Uint8Array): Promise<string> {
    const sha = await gitBlobSha(bytes);
    this.blobs.set(sha, bytes);
    return sha;
  }
  addTree(files: Files): string {
    const sha = `tree${++this.seq}`;
    this.trees.set(sha, new Map(files));
    return sha;
  }
  addCommit(tree: string, parents: string[], message: string): string {
    const sha = `commit${++this.seq}`;
    this.commits.set(sha, { sha, tree, parents, message });
    return sha;
  }

  /** Файлы в голове ветки */
  files(): Files {
    return this.trees.get(this.commits.get(this.head)!.tree)!;
  }
  text(path: string): string | undefined {
    const sha = this.files().get(path);
    return sha === undefined ? undefined : new TextDecoder().decode(this.blobs.get(sha));
  }
  /** Коммит «с другого устройства» или коммит кода */
  async commitFiles(changes: Record<string, string | null>, message: string): Promise<void> {
    const files = new Map(this.files());
    for (const [path, text] of Object.entries(changes)) {
      if (text === null) files.delete(path);
      else files.set(path, await this.putBlob(new TextEncoder().encode(text)));
    }
    this.head = this.addCommit(this.addTree(files), [this.head], message);
  }
  get dataCommits(): FakeCommit[] {
    return [...this.commits.values()].filter((c) => c.message.startsWith('data:'));
  }

  /** Обработчик запроса к api.github.com: { status, json } */
  async handle(method: string, url: string, body?: unknown): Promise<{ status: number; json: unknown }> {
    const u = new URL(url);
    const prefix = `/repos/${this.repo}`;
    this.log.push(`${method} ${u.pathname.replace(prefix, '')}${u.search}`);
    if (this.forceStatus) return { status: this.forceStatus, json: { message: 'forced' } };
    if (!u.pathname.startsWith(prefix)) return { status: 404, json: { message: 'Not Found' } };
    const path = decodeURIComponent(u.pathname.slice(prefix.length));
    const b = body as Record<string, unknown>;
    let m: RegExpExecArray | null;

    if (method === 'GET' && path === `/git/ref/heads/${this.branch}`)
      return { status: 200, json: { object: { sha: this.head } } };
    if (method === 'GET' && (m = /^\/git\/commits\/(\w+)$/.exec(path))) {
      const c = this.commits.get(m[1]!);
      return c ? { status: 200, json: { sha: c.sha, tree: { sha: c.tree } } } : { status: 404, json: {} };
    }
    if (method === 'GET' && (m = /^\/git\/trees\/([^?]+)$/.exec(path))) {
      const [treeSha, dir] = m[1]!.split(':');
      const files = this.trees.get(treeSha!);
      if (!files) return { status: 404, json: {} };
      if (dir) {
        // Поддерево data/ рекурсивно
        const tree = [...files]
          .filter(([p]) => p.startsWith(dir + '/'))
          .map(([p, sha]) => ({ path: p.slice(dir.length + 1), type: 'blob', sha }));
        return { status: 200, json: { tree, truncated: false } };
      }
      const top = new Map<string, { path: string; type: string; sha: string }>();
      for (const [p, sha] of files) {
        const [first, ...rest] = p.split('/');
        top.set(
          first!,
          rest.length
            ? { path: first!, type: 'tree', sha: `${treeSha}:${first}` }
            : { path: p, type: 'blob', sha },
        );
      }
      return { status: 200, json: { tree: [...top.values()] } };
    }
    if (method === 'GET' && (m = /^\/git\/blobs\/(\w+)$/.exec(path))) {
      const bytes = this.blobs.get(m[1]!);
      return bytes
        ? { status: 200, json: { content: toBase64(bytes), encoding: 'base64' } }
        : { status: 404, json: {} };
    }
    if (method === 'POST' && path === '/git/blobs') {
      const bytes =
        b.encoding === 'base64' ? fromBase64(String(b.content)) : new TextEncoder().encode(String(b.content));
      return { status: 201, json: { sha: await this.putBlob(bytes) } };
    }
    if (method === 'POST' && path === '/git/trees') {
      const base = this.trees.get(String(b.base_tree));
      if (!base) return { status: 422, json: { message: 'base_tree' } };
      const files = new Map(base);
      for (const e of b.tree as { path: string; sha?: string | null; content?: string }[]) {
        if (e.sha === null) files.delete(e.path);
        else if (e.content !== undefined)
          files.set(e.path, await this.putBlob(new TextEncoder().encode(e.content)));
        else files.set(e.path, e.sha!);
      }
      return { status: 201, json: { sha: this.addTree(files) } };
    }
    if (method === 'POST' && path === '/git/commits')
      return {
        status: 201,
        json: { sha: this.addCommit(String(b.tree), b.parents as string[], String(b.message)) },
      };
    if (method === 'PATCH' && path === `/git/refs/heads/${this.branch}`) {
      const next = this.commits.get(String(b.sha));
      if (this.failNextPatch > 0) {
        this.failNextPatch--;
        // Кто-то успел закоммитить между чтением и записью
        await this.commitFiles({ 'app/other.txt': String(this.seq) }, 'chore: code');
        return { status: 422, json: { message: 'Update is not a fast forward' } };
      }
      if (!next || next.parents[0] !== this.head)
        return { status: 422, json: { message: 'Update is not a fast forward' } };
      this.head = next.sha;
      return { status: 200, json: { object: { sha: next.sha } } };
    }
    return { status: 404, json: { message: `нет такого пути ${method} ${path}` } };
  }

  /** fetch для unit-тестов */
  get fetch(): typeof fetch {
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
      const r = await this.handle(
        init?.method ?? 'GET',
        String(input),
        init?.body ? JSON.parse(String(init.body)) : undefined,
      );
      return new Response(JSON.stringify(r.json), {
        status: r.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;
  }
}
