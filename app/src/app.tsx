import { signal } from '@preact/signals';
import { SvgDefs } from './components/Aura';
import { ConfirmDialog, Toasts } from './components/Overlays';
import { route } from './router';
import { AddSearch } from './screens/AddSearch';
import { Editor } from './screens/Editor';
import { Home } from './screens/Home';
import { Release } from './screens/Release';
import { Settings } from './screens/Settings';
import { Showcase } from './screens/Showcase';
import { isOwner, loadError, ready } from './store/app';
import s from './app.module.css';

/** Колбэк обновления service worker (vite-plugin-pwa); null — обновлений нет. */
export const pendingUpdate = signal<(() => void) | null>(null);

function Screen() {
  const r = route.value;
  const owner = isOwner.value;
  switch (r.name) {
    case 'home':
      return <Home />;
    case 'release':
      return <Release key={r.id} id={r.id} />;
    case 'edit':
      return owner ? <Editor key={r.id} id={r.id} /> : <Release id={r.id} />;
    case 'new':
      return owner ? <Editor key="new" /> : <Home />;
    case 'add':
      return owner ? <AddSearch /> : <Home />;
    case 'settings':
      return <Settings />;
    case 'showcase':
      return <Showcase />;
    default:
      return (
        <div class="page">
          <p>Такой страницы нет.</p>
          <a class="btn" href="#/">
            На главную
          </a>
        </div>
      );
  }
}

export function App() {
  if (!ready.value) return <div class={s.splash} aria-busy="true" />;
  if (loadError.value)
    return (
      <div class="page">
        <h1 class={s.errorTitle}>Не получилось открыть картотеку</h1>
        <p>{loadError.value}</p>
        <button type="button" class="btn" onClick={() => location.reload()}>
          Попробовать снова
        </button>
      </div>
    );
  return (
    <>
      <main>
        <Screen />
      </main>
      {pendingUpdate.value && (
        <div class={s.update} role="alert">
          <span>Доступно обновление приложения</span>
          <button type="button" class="btn btn-primary" onClick={() => pendingUpdate.value?.()}>
            Обновить
          </button>
        </div>
      )}
      <Toasts />
      <ConfirmDialog />
      <SvgDefs />
    </>
  );
}
