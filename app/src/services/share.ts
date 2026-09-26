export type ShareOutcome = 'shared' | 'copied' | 'unavailable';

/**
 * Системный шэринг, если есть (на телефоне — это шторка «Кому отправить»); нет — копия в буфер.
 * Отмену шэринга (AbortError, человек сам закрыл шторку) не считаем неудачей.
 */
export async function shareOrCopy(data: {
  title?: string;
  text?: string;
  url: string;
}): Promise<ShareOutcome> {
  if (navigator.share) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'shared';
    }
  }
  try {
    await navigator.clipboard.writeText(data.url);
    return 'copied';
  } catch {
    return 'unavailable';
  }
}
