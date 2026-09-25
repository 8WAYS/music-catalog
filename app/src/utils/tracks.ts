export interface ParsedTrack {
  title: string;
  durationSec?: number;
}

const DURATION_RE = /[\s–—-]*[([]?(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[)\]]?$/;
/** Нумерация с явным разделителем: «1.», «1)», «01 -», «A1.», «B2 –». */
const NUMBER_PUNCT_RE = /^[A-D]?\d{1,3}(?:[.)]|\s*[-–—])\s*/;
/** Нумерация через пробел: «1 Song» — убираем, только если все строки пронумерованы подряд. */
const NUMBER_SPACE_RE = /^(\d{1,3})\s+/;

/**
 * Разбирает вставленный текст треклиста: по треку на строку.
 * Убирает нумерацию и распознаёт длительность в конце («3:45», «(1:02:03)»).
 */
export function parseTrackLines(text: string): ParsedTrack[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const sequentialSpaceNumbers =
    lines.length > 1 && lines.every((l, i) => Number(l.match(NUMBER_SPACE_RE)?.[1]) === i + 1);

  return lines
    .map((line) => {
      let title = line;
      let durationSec: number | undefined;
      const dur = title.match(DURATION_RE);
      if (dur && dur.index !== undefined && dur.index > 0) {
        const h = dur[1] ? parseInt(dur[1], 10) : 0;
        durationSec = h * 3600 + parseInt(dur[2]!, 10) * 60 + parseInt(dur[3]!, 10);
        title = title.slice(0, dur.index).trim();
      }
      if (NUMBER_PUNCT_RE.test(title)) title = title.replace(NUMBER_PUNCT_RE, '');
      else if (sequentialSpaceNumbers) title = title.replace(NUMBER_SPACE_RE, '');
      title = title.replace(/^["«“]+|["»”]+$/g, '').trim();
      return durationSec === undefined ? { title } : { title, durationSec };
    })
    .filter((t) => t.title);
}
