import type { AppState, Track } from '../types';
import { derive, setMixEnabled, setState } from '../state';
import { chipLabel } from '../lib/curves';
import { formatBpm, formatDuration, h, icon, setIcon } from './dom';
import { FADE, SPRING, animate, prefersReducedMotion, pressFeedback } from './motion';
import { animateY, attachRowGestures, liftRow, stopY } from './rowGestures';

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
  swipe: HTMLElement;
  content: HTMLElement;
  index: HTMLElement;
  name: HTMLElement;
  meta: HTMLElement;
  bpm: HTMLElement;
  duration: HTMLElement;
  error: HTMLElement;
  up: HTMLButtonElement;
  down: HTMLButtonElement;
  remove: HTMLButtonElement;
  hoverRemove: HTMLButtonElement;
  errorRemove: HTMLButtonElement;
  chipSlot: HTMLElement;
  chip: HTMLButtonElement;
  chipText: HTMLElement;
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

function moveTo(id: string, to: number) {
  setState((s) => {
    const tracks = [...s.tracks];
    const i = tracks.findIndex((t) => t.id === id);
    if (i < 0 || i === to) return {};
    const [track] = tracks.splice(i, 1);
    tracks.splice(to, 0, track);
    return { tracks };
  });
}

/** Fixed bars over the list's edges: the reorder drag scrolls the page when it gets near them. */
const EDGES = {
  top: () => document.getElementById('navbar')?.getBoundingClientRect().bottom ?? 0,
  bottom: () => document.getElementById('transport')?.offsetHeight ?? 0,
};

export function mountPlaylist(
  actions: HTMLElement,
  root: HTMLElement,
  onFiles: (files: File[]) => void,
  onOpenEditor: (pairIndex: number) => void,
  onRemove: (id: string) => void,
): PlaylistView {
  const rows = new Map<string, Row>();
  let rendered = false;
  let lastLayout = '';

  // header actions: Mix toggle + add songs
  const mixSwitch = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': 'true', 'aria-label': 'Mix' });
  const mix = h('div', { class: 'mix-toggle' }, h('span', { class: 'mix-label', 'aria-hidden': 'true' }, 'Mix'), mixSwitch);
  // iOS Safari treats accept="audio/*" as video and hides MP3/WAV in Files: list the extensions instead
  const input = h('input', {
    type: 'file',
    accept: '.mp3,.wav,audio/mpeg,audio/wav,audio/x-wav',
    multiple: true,
    class: 'visually-hidden',
    id: 'file-input',
    tabindex: -1,
  });
  const addBtn = h('button', { class: 'add-btn', type: 'button', 'aria-label': 'Añadir canciones', title: 'Añadir canciones' }, icon('add'));
  actions.append(mix, input, addBtn);

  const list = h('ol', { class: 'playlist' });
  const emptyAdd = h('button', { class: 'primary-btn empty-add', type: 'button' }, icon('add'), 'Añadir canciones');
  const empty = h(
    'div',
    { class: 'playlist-empty' },
    h('span', { class: 'playlist-empty-icon', 'aria-hidden': 'true' }, icon('music')),
    h('p', { class: 'playlist-empty-title' }, 'Sin canciones'),
    h('p', { class: 'playlist-empty-detail' }, 'Elige MP3 o WAV desde Archivos. Entre cada canción y la siguiente aparece una transición que puedes editar.'),
    emptyAdd,
  );
  root.append(list, empty);
  pressFeedback([addBtn, emptyAdd]);

  mixSwitch.addEventListener('click', () => setMixEnabled(mixSwitch.getAttribute('aria-checked') !== 'true'));
  addBtn.addEventListener('click', () => input.click());
  emptyAdd.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    if (input.files?.length) onFiles([...input.files]);
    input.value = '';
  });

  // desktop: drop files anywhere on the page
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

  /** Rows in list order, without the ones animating out. */
  function liveItems(): Row[] {
    return [...list.children].filter((li) => !li.classList.contains('is-exiting')).map((li) => rows.get((li as HTMLElement).dataset.id!)!);
  }

  /** Removes a track and keeps keyboard focus in the list. */
  function removeFocused(id: string) {
    const items = liveItems();
    const i = items.findIndex((r) => r.root.dataset.id === id);
    const next = items[i + 1] ?? items[i - 1];
    onRemove(id);
    (next?.content ?? addBtn).focus();
  }

  function createRow(id: string): Row {
    const index = h('span', { class: 'row-index', 'aria-hidden': 'true' });
    const name = h('p', { class: 'row-name' });
    const meta = h('p', { class: 'row-meta' });
    const error = h('p', { class: 'row-error' });
    const bpm = h('span', { class: 'row-bpm' });
    const duration = h('span', { class: 'row-duration' });
    // screen readers can't swipe or long-press: they keep plain buttons
    const up = h('button', { type: 'button', tabindex: -1 }, 'Subir');
    const down = h('button', { type: 'button', tabindex: -1 }, 'Bajar');
    const remove = h('button', { type: 'button', tabindex: -1 }, 'Quitar');
    const hoverRemove = h('button', { class: 'row-remove', type: 'button', tabindex: -1, 'aria-hidden': 'true' }, icon('remove'));
    // a file that can't be read has nothing else to do: offer the way out in place
    const errorRemove = h('button', { class: 'text-btn row-error-remove', type: 'button' }, 'Quitar');
    const handle = h('span', { class: 'row-handle', 'aria-hidden': 'true' }, icon('grip'));
    const chipText = h('span', { class: 'chip-text' });
    const chip = h('button', { class: 'chip', type: 'button' }, icon('transition'), chipText);
    const chipSlot = h('div', { class: 'chip-slot' }, chip);

    const content = h(
      'div',
      { class: 'row', tabindex: 0, 'aria-keyshortcuts': 'Alt+ArrowUp Alt+ArrowDown Delete' },
      index,
      h('div', { class: 'row-main' }, name, meta, error),
      bpm,
      duration,
      errorRemove,
      hoverRemove,
      handle,
      h('span', { class: 'visually-hidden' }, up, down, remove),
    );
    const deleteBtn = h('button', { class: 'row-delete', type: 'button' }, 'Eliminar');
    const swipe = h('div', { class: 'row-swipe' }, deleteBtn, content);
    const li = h('li', { class: 'playlist-item' }, swipe, chipSlot);
    li.dataset.id = id;
    pressFeedback(chip);

    up.addEventListener('click', () => move(id, -1));
    down.addEventListener('click', () => move(id, 1));
    remove.addEventListener('click', () => onRemove(id));
    hoverRemove.addEventListener('click', () => onRemove(id));
    errorRemove.addEventListener('click', () => removeFocused(id));
    content.addEventListener('keydown', (e) => {
      if (e.target !== content) return;
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        move(id, e.key === 'ArrowUp' ? -1 : 1);
        content.focus();
      } else if (!e.altKey && !e.metaKey && !e.ctrlKey && (e.key === 'Delete' || e.key === 'Backspace')) {
        removeFocused(id);
      } else {
        return;
      }
      e.preventDefault();
    });
    chip.addEventListener('click', () => {
      const pairIndex = Number(chip.dataset.pair);
      if (!Number.isNaN(pairIndex)) onOpenEditor(pairIndex);
    });

    attachRowGestures({
      root: li,
      content,
      deleteBtn,
      handle,
      onDelete: () => onRemove(id),
      onLift: (start) => {
        const items = liveItems();
        const from = items.findIndex((r) => r.root === li);
        if (from < 0) return;
        liftRow(
          items.map((r) => ({ root: r.root, visual: r.swipe })),
          from,
          start,
          EDGES,
          (to) => moveTo(id, to),
        );
      },
    });

    return { root: li, swipe, content, index, name, meta, bpm, duration, error, up, down, remove, hoverRemove, errorRemove, chipSlot, chip, chipText };
  }

  function fill(row: Row, track: Track, i: number, total: number) {
    row.index.textContent = String(i + 1);
    row.name.textContent = track.name;
    row.name.title = track.name;
    row.root.dataset.status = track.status;
    const label = track.status === 'ready' ? '' : STATUS_LABELS[track.status] ?? '';
    const busy = track.status === 'decoding' || track.status === 'analyzing';
    row.meta.replaceChildren(...(busy ? [h('span', { class: 'spinner', 'aria-hidden': 'true' })] : []), label);
    row.meta.hidden = !label;
    row.errorRemove.hidden = track.status !== 'error';
    row.errorRemove.setAttribute('aria-label', `Quitar ${track.name}`);
    row.error.textContent = track.status === 'error' ? track.error ?? '' : '';
    row.error.hidden = track.status !== 'error';
    row.bpm.textContent = track.bpm !== null ? `${formatBpm(track.bpm)} bpm` : '';
    row.duration.textContent = track.duration ? formatDuration(track.duration) : '';
    row.up.disabled = i === 0;
    row.down.disabled = i === total - 1;
    row.up.setAttribute('aria-label', `Subir ${track.name}`);
    row.down.setAttribute('aria-label', `Bajar ${track.name}`);
    row.remove.setAttribute('aria-label', `Quitar ${track.name}`);
    row.content.setAttribute('aria-label', `${i + 1}. ${track.name}${label ? `, ${label}` : ''}`);
  }

  function exit(row: Row) {
    const li = row.root;
    li.classList.add('is-exiting');
    stopY(li);
    if (prefersReducedMotion()) {
      void animate(li, { opacity: 0 }, FADE).then(() => li.remove());
      return;
    }
    li.style.height = `${li.offsetHeight}px`;
    void animate(li, { height: 0, opacity: 0 }, { duration: 250, ease: 'easeOut' }).then(() => li.remove());
  }

  function enter(row: Row) {
    if (prefersReducedMotion()) animate(row.root, { opacity: [0, 1] }, FADE);
    else animate(row.root, { opacity: [0, 1], y: [8, 0] }, SPRING.rowEnter);
  }

  return {
    update(state) {
      const { tracks: queue, pairs, validations } = derive(state);
      const tracks = state.tracks;

      // FLIP only when the rows' order or height can have changed (not on every draft edit)
      const layout = JSON.stringify([tracks.map((t) => t.id), state.mixEnabled, tracks.map((t) => t.status)]);
      const relayout = rendered && layout !== lastLayout && !prefersReducedMotion();
      lastLayout = layout;
      const before = new Map<HTMLElement, number>();
      if (relayout) for (const r of liveItems()) before.set(r.root, r.root.getBoundingClientRect().top);

      const seen = new Set<string>();
      const created: Row[] = [];
      tracks.forEach((track, i) => {
        seen.add(track.id);
        let row = rows.get(track.id);
        if (!row) {
          row = createRow(track.id);
          rows.set(track.id, row);
          created.push(row);
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
          row.chipText.textContent = !pair ? '…' : ok ? chipLabel(pair.transition) : 'Revisar';
          row.chip.classList.toggle('chip--error', !!pair && !ok);
          setIcon(row.chip, !!pair && !ok ? 'warning' : 'transition');
          row.chip.setAttribute(
            'aria-label',
            `Editar transición de ${queue[q].name} a ${queue[q + 1].name}: ${row.chipText.textContent}`,
          );
        } else {
          delete row.chip.dataset.pair;
        }
      });

      for (const [id, row] of rows) {
        if (!seen.has(id)) {
          rows.delete(id);
          exit(row);
        }
      }

      // put the rows in order, stepping over the ones animating out
      const focused = document.activeElement;
      let cursor = list.firstElementChild;
      for (const track of tracks) {
        const el = rows.get(track.id)!.root;
        while (cursor && cursor.classList.contains('is-exiting')) cursor = cursor.nextElementSibling;
        if (cursor === el) {
          cursor = cursor.nextElementSibling;
          continue;
        }
        list.insertBefore(el, cursor);
      }
      if (focused instanceof HTMLElement && focused !== document.activeElement && list.contains(focused)) focused.focus();

      if (relayout) {
        const moved = [...before.keys()].filter((li) => li.isConnected && !li.classList.contains('is-exiting'));
        for (const li of moved) stopY(li);
        for (const li of moved) {
          const delta = before.get(li)! - li.getBoundingClientRect().top;
          if (Math.abs(delta) > 1) animateY(li, delta, 0);
        }
      }
      if (rendered) created.forEach(enter);
      rendered = true;

      mixSwitch.setAttribute('aria-checked', String(state.mixEnabled));
      empty.hidden = tracks.length > 0;
      list.hidden = tracks.length === 0;
    },

    focusChip(pairIndex) {
      list.querySelector<HTMLButtonElement>(`.chip[data-pair="${pairIndex}"]`)?.focus();
    },
  };
}
