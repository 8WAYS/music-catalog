import { signal } from '@preact/signals';

export type Route =
  | { name: 'home' }
  | { name: 'release'; id: string }
  | { name: 'edit'; id: string }
  | { name: 'new' }
  | { name: 'add' }
  | { name: 'settings' }
  | { name: 'notFound' };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').split('?')[0] || '/';
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'home' };
  const [head, id] = parts;
  if (head === 'release' && id) return { name: 'release', id: decodeURIComponent(id) };
  if (head === 'edit' && id) return { name: 'edit', id: decodeURIComponent(id) };
  if (head === 'new') return { name: 'new' };
  if (head === 'add') return { name: 'add' };
  if (head === 'settings') return { name: 'settings' };
  return { name: 'notFound' };
}

export const href = {
  home: () => '#/',
  release: (id: string) => `#/release/${id}`,
  edit: (id: string) => `#/edit/${id}`,
  new: () => '#/new',
  add: () => '#/add',
  settings: () => '#/settings',
};

export const route = signal<Route>(parseHash(location.hash));

/** Ссылка на карточку, которой можно поделиться: тот же адрес у владельца и друзей. */
export function shareUrl(hash: string): string {
  return location.origin + location.pathname + hash;
}

// ---------- Защита от ухода с несохранёнными изменениями ----------

type LeaveGuard = () => Promise<boolean>;
let guard: LeaveGuard | null = null;
let currentHash = location.hash || '#/';
let bypass = false;
/** Стек адресов внутри приложения — чтобы «Назад» не уводил с сайта. */
const stack: string[] = [currentHash];

export function setLeaveGuard(fn: LeaveGuard | null): void {
  guard = fn;
}

export function navigate(hash: string, { replace = false } = {}): void {
  if (replace) {
    if (guard && hash !== currentHash) {
      location.hash = hash; // пусть сработает защита
      return;
    }
    history.replaceState(null, '', hash);
    stack.pop();
    void onHashChange();
  } else location.hash = hash;
}

/** Назад по истории, если есть куда, иначе — на указанный адрес. */
export function goBack(fallback = href.home()): void {
  if (stack.length > 1) history.back();
  else navigate(fallback, { replace: true });
}

async function onHashChange(): Promise<void> {
  const target = location.hash || '#/';
  if (guard && !bypass && target !== currentHash) {
    history.replaceState(null, '', currentHash);
    const ok = await guard();
    if (!ok) return;
    guard = null;
    bypass = true;
    location.hash = target;
    return;
  }
  bypass = false;
  if (stack.length > 1 && stack[stack.length - 2] === target) stack.pop();
  else if (stack[stack.length - 1] !== target) stack.push(target);
  currentHash = target;
  route.value = parseHash(target);
}

window.addEventListener('hashchange', () => void onHashChange());
window.addEventListener('beforeunload', (e) => {
  if (guard) e.preventDefault();
});
