import { useRef, useState } from 'preact/hooks';
import { LocalSource } from '../data/localSource';
import { applyBackup, backupFilename, downloadBlob, exportZip, parseZip } from '../services/backup';
import { importPublished } from '../services/publisher';
import { confirmDialog, repo, toast, toastError } from '../store/app';
import { syncState } from '../store/sync';
import { pluralize } from '../utils/normalize';
import s from './BackupSettings.module.css';

type Busy = '' | 'export' | 'import' | 'site';

/** Резервные копии (этап 6, раздел 9): экспорт и импорт ZIP, загрузка версии с сайта. */
export function BackupSettings() {
  const [busy, setBusy] = useState<Busy>('');
  const fileRef = useRef<HTMLInputElement>(null);
  const connected = syncState.value.status !== 'off';

  const exportNow = async () => {
    const local = repo();
    if (!(local instanceof LocalSource)) return;
    setBusy('export');
    try {
      downloadBlob(await exportZip(local), backupFilename());
      toast('Резервная копия скачана');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy('');
    }
  };

  const importFile = async (file: File) => {
    const local = repo();
    if (!(local instanceof LocalSource)) return;
    setBusy('import');
    try {
      const parsed = parseZip(new Uint8Array(await file.arrayBuffer()));
      const count = parsed.catalog.releases.length;
      const ok = await confirmDialog({
        title: 'Заменить картотеку на этом устройстве?',
        text: `В архиве ${count} ${pluralize(count, 'релиз', 'релиза', 'релизов')}. Всё, что есть на устройстве сейчас, заменится содержимым архива.`,
        confirm: 'Заменить',
        danger: true,
      });
      if (!ok) return;
      await applyBackup(local, parsed);
      toast('Картотека восстановлена из архива');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy('');
    }
  };

  const importFromSite = async () => {
    const local = repo();
    if (!(local instanceof LocalSource)) return;
    const [token, repoName, branch] = await Promise.all([
      local.getMeta('token'),
      local.getMeta('repo'),
      local.getMeta('branch'),
    ]);
    if (!token || !repoName) return;
    const ok = await confirmDialog({
      title: 'Загрузить картотеку с сайта?',
      text: 'Неопубликованные изменения на этом устройстве будут потеряны.',
      confirm: 'Загрузить с сайта',
      danger: true,
    });
    if (!ok) return;
    setBusy('site');
    try {
      await importPublished(local, { token, repo: repoName, branch: branch || 'main' });
      toast('Картотека загружена с сайта');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <p class={s.muted}>
        Скачай архив на компьютер на случай потери телефона — это третья копия данных, отдельно от устройства
        и сайта.
      </p>
      <div class={s.actions}>
        <button type="button" class="btn" onClick={() => void exportNow()} disabled={!!busy}>
          {busy === 'export' ? 'Собираю архив…' : 'Скачать резервную копию'}
        </button>
        <button type="button" class="btn" onClick={() => fileRef.current?.click()} disabled={!!busy}>
          {busy === 'import' ? 'Восстанавливаю…' : 'Восстановить из архива'}
        </button>
        {connected && (
          <button type="button" class="btn" onClick={() => void importFromSite()} disabled={!!busy}>
            {busy === 'site' ? 'Загружаю…' : 'Загрузить версию с сайта'}
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".zip,application/zip"
        class="visually-hidden"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (file) void importFile(file);
        }}
      />
    </>
  );
}
