import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import '@fontsource-variable/golos-text';
import '@fontsource-variable/tektur';
import '@fontsource-variable/jetbrains-mono';
import './styles/tokens.css';
import './styles/base.css';
import { App, pendingUpdate } from './app';
import { applyAppearance, init } from './store/app';

applyAppearance();
render(<App />, document.getElementById('app')!);
void init();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  let registration: ServiceWorkerRegistration | undefined;
  const update = registerSW({
    onNeedRefresh: () => {
      pendingUpdate.value = () => void update(true);
    },
    onRegisteredSW: (_url, reg) => {
      registration = reg;
    },
  });
  // registerSW проверяет новую версию один раз при загрузке — если держать вкладку открытой
  // и просто ходить по хэш-роутам, обновление можно не увидеть вовремя. Перепроверяем при
  // возврате в приложение и при восстановлении сети — тот же приём, что в store/sync.ts.
  const checkForUpdate = () => void registration?.update();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
  addEventListener('online', checkForUpdate);
}
