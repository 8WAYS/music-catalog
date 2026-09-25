import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import '@fontsource-variable/onest';
import '@fontsource-variable/unbounded';
import './styles/tokens.css';
import './styles/base.css';
import { App, pendingUpdate } from './app';
import { applyAppearance, init } from './store/app';

applyAppearance();
render(<App />, document.getElementById('app')!);
void init();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  const update = registerSW({
    onNeedRefresh: () => {
      pendingUpdate.value = () => void update(true);
    },
  });
}
