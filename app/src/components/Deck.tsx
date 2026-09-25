import { useEffect, useRef, useState } from 'preact/hooks';
import type { Release } from '../data/schema';
import { Disc } from './Disc';
import s from './Deck.module.css';

export const DECK_MS = 1_500;
const SPIN = ['◐', '◓', '◑', '◒'];

type Phase = 'open' | 'loaded' | 'close' | 'read' | 'play';

/**
 * «Удиви меня» (ADR 0008): Hi-Fi дека — лоток выезжает, диск ложится, на дисплее READING, затем номер
 * и название выбранного релиза. Около 1,5 с; нажатие в любом месте сразу вызывает onDone.
 */
export function Deck({ pick, onDone }: { pick: Release; onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>('open');
  const [spin, setSpin] = useState(0);
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };

  useEffect(() => {
    const t = [
      setTimeout(() => setPhase('loaded'), 330),
      setTimeout(() => setPhase('close'), 620),
      setTimeout(() => setPhase('read'), 920),
      setTimeout(() => setPhase('play'), 1_250),
      setTimeout(finish, DECK_MS),
    ];
    const spinner = setInterval(() => setSpin((x) => x + 1), 90);
    return () => {
      t.forEach(clearTimeout);
      clearInterval(spinner);
    };
  }, []);

  const open = phase === 'open' || phase === 'loaded';
  const loaded = phase !== 'open';
  const title = `${pick.title} — ${pick.artist}`;
  const big =
    phase === 'open'
      ? 'OPEN'
      : phase === 'loaded'
        ? 'OPEN'
        : phase === 'close'
          ? 'CLOSE'
          : phase === 'read'
            ? `${SPIN[spin % 4]} READ`
            : '01 ▸ 0:00';

  return (
    <div class={s.backdrop} onClick={finish} role="dialog" aria-label="Удиви меня">
      <p class="visually-hidden" role="status">
        {phase === 'play' ? `Выпало: ${title}` : 'Выбираю…'}
      </p>
      <div
        class={`${s.deck} ${open ? s.open : ''} ${loaded ? s.loaded : ''} ${phase === 'play' ? s.playing : ''}`}
      >
        <div class={s.top} />
        <div class={s.front}>
          <div class={s.slot} />
          <div class={s.vfd} aria-hidden="true">
            <div class={s.icons}>
              <span class={phase === 'read' || phase === 'play' ? '' : s.off}>CD</span>
              <span class={phase === 'play' ? '' : s.off}>▶</span>
              <span class={s.off}>RPT</span>
              <span class={s.off}>PGM</span>
            </div>
            <div class={s.big}>
              {/* Погасшие сегменты — посимвольно под форматом «01 ▸ 0:00» */}
              <span class={s.ghost}>88 ▸ 8:88</span>
              {big}
            </div>
            <div class={s.mq}>
              <span class={phase === 'play' ? s.run : ''}>{phase === 'play' ? title.toUpperCase() : ''}</span>
            </div>
          </div>
          <div class={s.keys} aria-hidden="true">
            <span class={`${s.key} ${phase === 'open' || phase === 'close' ? s.down : ''}`}>⏏</span>
            <span class={s.key}>⏮</span>
            <span class={`${s.key} ${phase === 'play' ? s.down : ''}`}>▶</span>
            <span class={s.key}>⏭</span>
            <span class={s.key}>■</span>
          </div>
          <span class={`${s.led} ${s.power}`} />
          <span class={`${s.led} ${s.playLed}`} />
          <span class={s.label}>DIGITAL AUDIO</span>
          <span class={s.brand}>КАРТОТЕКА</span>
        </div>
        <span class={s.foot} style={{ left: '22px' }} />
        <span class={s.foot} style={{ right: '22px' }} />
        <div class={s.drawerWrap}>
          <div class={s.drawer}>
            <div class={s.recess} />
            <div class={s.drop}>
              <Disc />
            </div>
          </div>
        </div>
      </div>
      <p class={s.skip}>Нажми, чтобы сразу открыть</p>
    </div>
  );
}
