import type { AppState, Track } from '../types';
import { derive, setMixEnabled, setState } from '../state';
import { chipLabel } from '../lib/curves';
import { formatBpm, formatDuration, h, icon } from './dom';

const STATUS_LABELS: Partial<Record<Track['status'], string>> = {
  decoding: 'Leyendo archivo…',
  analyzing: 'Detectando BPM…',
  'bpm-required': 'BPM requerido',
  error: 'No se pudo leer',
};

export interface PlaylistView {
  update(state: AppState): void;
  focusChip(pairIndex: number): void;
}

interface Row {
  root: HTMLLIElement;
  index: HTMLElement;
  name: HTMLElement;
  meta: HTMLElement;
  bpm: HTMLElement;
  duration: HTMLElement;
  error: HTMLElement;
  up: HTMLButtonElement;
  down: HTMLButtonElement;
  remove: HTMLButtonElement;
  chipSlot: HTMLElement;
  chip: HTMLButtonElement;
}

function move(id: string, delta: number) {
  setState((s) => {
    const tracks = [...s.tracks];
    const i = tracks.findIndex((t) => t.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= tracks.length) return {};
    [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
    return { tracks };
  });
}

export function mountPlaylist(
  actions: HTMLElement,
  root: HTMLElement,
  onFiles: (files: File[]) => void,
  onOpenEditor: (pairIndex: number) => void,
): PlaylistView {
  const rows = new Map<string, Row>();

  // header actions: Mix toggle + add songs
  const mixSwitch = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': 'true', 'aria-label': 'Mix' });
  const mix = h('div', { class: 'mix-toggle' }, h('span', { class: 'mix-label', 'aria-hidden': 'true' }, 'Mix'), mixSwitch);
  const input = h('input', { type: 'file', accept: 'audio/*', multiple: true, class: 'visually-hidden', id: 'file-input' });
  const addBtn = h('label', { class: 'pill-btn', for: 'file-input' }, icon('add'), 'Añadir canciones');
  actions.append(mix, input, addBtn);

  const list = h('ol', { class: 'playlist' });
  const empty = h(
    'div',
    { class: 'playlist-empty' },
    h('p', { class: 'playlist-empty-title' }, 'Arrastra tus canciones aquí'),
    h('p', { class: 'playlist-empty-detail' }, 'MP3 o WAV desde tu equipo. Entre cada canción y la siguiente aparece una transición que puedes editar.'),
  );
  root.append(list, empty);

  mixSwitch.addEventListener('click', () => setMixEnabled(mixSwitch.getAttribute('aria-checked') !== 'true'));
  input.addEventListener('change', () => {
    if (input.files?.length) onFiles([...input.files]);
    input.value = '';
  });

  let dragDepth = 0;
  const dropZone = document.body;
  dropZone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragDepth++;
    root.classList.add('is-drop-target');
  });
  dropZone.addEventListener('dragover', (e) => e.preventDefault());
  dropZone.addEventListener('dragleave', () => {
    if (--dragDepth <= 0) {
      dragDepth = 0;
      root.classList.remove('is-drop-target');
    }
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    root.classList.remove('is-drop-target');
    const files = [...(e.dataTransfer?.files ?? [])];
    if (files.length) onFiles(files);
  });

  function createRow(id: string): Row {
    const index = h('span', { class: 'row-index', 'aria-hidden': 'true' });
    const name = h('p', { class: 'row-name' });
    const meta = h('p', { class: 'row-meta' });
    const error = h('p', { class: 'row-error' });
    const bpm = h('span', { class: 'row-bpm' });
    const duration = h('span', { class: 'row-duration' });
    const up = h('button', { class: 'icon-btn', type: 'button' }, icon('up'));
    const down = h('button', { class: 'icon-btn', type: 'button' }, icon('down'));
    const remove = h('button', { class: 'icon-btn', type: 'button' }, icon('remove'));
    const chip = h('button', { class: 'chip', type: 'button' });
    const chipSlot = h('div', { class: 'chip-slot' }, chip);

    const row = h(
      'div',
      { class: 'row' },
      index,
      h('div', { class: 'row-main' }, name, meta, error),
      bpm,
      duration,
      h('div', { class: 'row-actions' }, up, down, remove),
    );
    const root = h('li', { class: 'playlist-item' }, row, chipSlot);

    up.addEventListener('click', () => move(id, -1));
    down.addEventListener('click', () => move(id, 1));
    remove.addEventListener('click', () => setState((s) => ({ tracks: s.tracks.filter((t) => t.id !== id) })));
    chip.addEventListener('click', () => {
      const pairIndex = Number(chip.dataset.pair);
      if (!Number.isNaN(pairIndex)) onOpenEditor(pairIndex);
    });

    return { root, index, name, meta, bpm, duration, error, up, down, remove, chipSlot, chip };
  }

  function fill(row: Row, track: Track, i: number, total: number) {
    row.index.textContent = String(i + 1);
    row.name.textContent = track.name;
    row.name.title = track.name;
    row.root.dataset.status = track.status;
    const label = track.status === 'ready' ? '' : STATUS_LABELS[track.status] ?? '';
    row.meta.textContent = label;
    row.meta.hidden = !label;
    row.error.textContent = track.status === 'error' ? track.error ?? '' : '';
    row.error.hidden = track.status !== 'error';
    row.bpm.textContent = track.bpm !== null ? `${formatBpm(track.bpm)} bpm` : '';
    row.duration.textContent = track.duration ? formatDuration(track.duration) : '';
    row.up.disabled = i === 0;
    row.down.disabled = i === total - 1;
    row.up.setAttribute('aria-label', `Subir ${track.name}`);
    row.down.setAttribute('aria-label', `Bajar ${track.name}`);
    row.remove.setAttribute('aria-label', `Quitar ${track.name}`);
  }

  return {
    update(state) {
      const { tracks: queue, pairs, validations } = derive(state);
      const tracks = state.tracks;
      const seen = new Set<string>();

      tracks.forEach((track, i) => {
        seen.add(track.id);
        let row = rows.get(track.id);
        if (!row) {
          row = createRow(track.id);
          rows.set(track.id, row);
        }
        fill(row, track, i, tracks.length);

        // the chip below a track opens the transition into the next playlist track
        const q = queue.indexOf(track);
        const hasPair = state.mixEnabled && q >= 0 && q < queue.length - 1;
        row.chipSlot.hidden = !hasPair;
        if (hasPair) {
          const pair = pairs[q];
          const ok = validations[q].ok;
          row.chip.dataset.pair = String(q);
          row.chip.disabled = !pair;
          row.chip.textContent = !pair ? '…' : ok ? chipLabel(pair.transition) : 'Revisar';
          row.chip.classList.toggle('chip--error', !!pair && !ok);
          row.chip.setAttribute(
            'aria-label',
            `Editar transición de ${queue[q].name} a ${queue[q + 1].name}: ${row.chip.textContent}`,
          );
        } else {
          delete row.chip.dataset.pair;
        }

        if (list.children[i] !== row.root) list.insertBefore(row.root, list.children[i] ?? null);
      });

      for (const [id, row] of rows) {
        if (!seen.has(id)) {
          row.root.remove();
          rows.delete(id);
        }
      }

      mixSwitch.setAttribute('aria-checked', String(state.mixEnabled));
      empty.hidden = tracks.length > 0;
      list.hidden = tracks.length === 0;
    },

    focusChip(pairIndex) {
      list.querySelector<HTMLButtonElement>(`.chip[data-pair="${pairIndex}"]`)?.focus();
    },
  };
}
