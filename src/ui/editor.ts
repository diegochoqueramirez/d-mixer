import type { AppState, BarsOption, EffectStyle, EqStyle, FilterStyle, LoopStyle, Track, TransitionPreset, VolumeStyle } from '../types';
import { PRESET_ORDER } from '../types';
import {
  applyPreset,
  beginGesture,
  cancelGesture,
  closeEditor,
  editableCurves,
  endGesture,
  goToPair,
  pairsWithDraft,
  redo,
  resetToAuto,
  saveDraft,
  setEffectStyle,
  setEqStyle,
  setFilterStyle,
  setLoopStyle,
  setVolumeStyle,
  toggleCustomize,
  undo,
  updateCustomCurve,
  updateDraft,
} from '../state';
import { chipLabel, PRESETS } from '../lib/curves';
import { loopJumps } from '../lib/effects';
import { filterShape, laneLines, laneScale } from '../lib/lanes';
import type { PairValidation } from '../lib/validation';
import { barsToSeconds, playbackRateFor } from '../lib/timing';
import { formatBpm, formatDuration, formatTime, h, icon, setIcon } from './dom';
import { createBpmPopover } from './bpmPopover';
import { createCurveEditor } from './curveEditor';
import { createBarsSheet } from './barsSheet';
import { createLaneSheets, laneValueLabel, SHEET_LANE_NAMES, SHEET_LANES, type SheetLane } from './laneSheets';
import { createMinimap, createStage } from './waveform';
import { FADE, SPRING, animate, prefersReducedMotion, pressFeedback, slideIn, slideOut } from './motion';
import { createSheet } from './sheet';

export interface EditorHandlers {
  /** Starts (or restarts) the looped preview of the draft. */
  onPreview(): void;
  onStop(): void;
  /** Called after the dialog closed, with the pair it was editing. */
  onClosed(pairIndex: number): void;
}

export interface EditorView {
  update(state: AppState): void;
  /** Redraws only the playhead; called every animation frame while audio plays. */
  tick(mixTimeOf: (incomingId: string) => number | null): void;
}

/** The minimaps give way to the song headers this long after the last touch. */
const MINIMAP_HIDE_MS = 2000;

interface Deck {
  root: HTMLElement;
  name: HTMLElement;
  point: HTMLElement;
  bpm: HTMLButtonElement;
  duration: HTMLElement;
}

function createDeck(role: 'out' | 'in'): Deck {
  const name = h('h3', { class: 'deck-name' });
  const point = h('p', { class: 'deck-point' });
  const bpm = h('button', { class: 'deck-bpm', type: 'button' });
  const duration = h('p', { class: 'deck-meta' });
  const root = h(
    'section',
    { class: `deck deck--${role}`, 'aria-label': role === 'out' ? 'Canción que sale' : 'Canción que entra' },
    h('div', { class: 'deck-main' }, name, point),
    h('div', { class: 'deck-side' }, bpm, duration),
  );
  return { root, name, point, bpm, duration };
}

const barsText = (bars: number) => `${bars} ${bars === 1 ? 'compás' : 'compases'}`;

export function mountEditor(dialog: HTMLDialogElement, handlers: EditorHandlers): EditorView {
  let state: AppState | null = null;
  let incomingId: string | null = null;
  let openPair: number | null = null;
  let lastSignature = '';
  let pairCount = 0;
  let limitShown = false;
  let drawable = false;
  let validation: PairValidation | null = null;
  /** Lane whose sheet is open (the editor is in "sheet mode"); null = none. */
  let openLane: SheetLane | null = null;
  /** What the confirmation box is asking about: closing the editor or moving to another pair. */
  let confirmTarget: { kind: 'close' } | { kind: 'navigate'; pairIndex: number } = { kind: 'close' };

  // top bar, like Spotify Mix: ✕ · chip · Guardar
  const closeBtn = h('button', { class: 'close-btn', type: 'button', 'aria-label': 'Cerrar editor' }, icon('remove'));
  // showModal() focuses [autofocus]: the title, so no button opens with a focus ring
  const title = h('h2', { class: 'editor-title', id: 'editor-title', tabindex: -1, autofocus: true });
  const saveBtn = h('button', { class: 'bar-save', type: 'button' }, 'Guardar');
  const bar = h('header', { class: 'editor-bar' }, closeBtn, title, saveBtn);

  // bottom bar: what Spotify does not have
  const undoBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Deshacer', title: 'Deshacer' }, icon('undo'));
  const redoBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Rehacer', title: 'Rehacer' }, icon('redo'));
  const prevBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Transición anterior', title: 'Transición anterior' }, icon('prev'));
  const nextBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Transición siguiente', title: 'Transición siguiente' }, icon('next'));
  const toolbar = h(
    'footer',
    { class: 'editor-toolbar' },
    h('div', { class: 'toolbar-group' }, undoBtn, redoBtn),
    h('div', { class: 'toolbar-group' }, prevBtn, nextBtn),
  );

  // song headers; their minimap takes their place while a wave is touched
  const deckOut = createDeck('out');
  const deckIn = createDeck('in');
  const restartAfterDrag = () => {
    if (state?.playback === 'previewing') handlers.onPreview();
  };
  const setOut = (outStart: number) => updateDraft({ outStart });
  const setIn = (inStart: number) => updateDraft({ inStart });
  let minimapTimer: ReturnType<typeof setTimeout> | undefined;
  const miniOut = createMinimap(setOut, () => {
    restartAfterDrag();
    hideMinimapsLater();
  });
  const miniIn = createMinimap(setIn, () => {
    restartAfterDrag();
    hideMinimapsLater();
  });
  const slotOut = h('div', { class: 'deck-slot' }, deckOut.root, miniOut.el);
  const slotIn = h('div', { class: 'deck-slot' }, deckIn.root, miniIn.el);

  function showMinimaps() {
    if (openLane) return;
    clearTimeout(minimapTimer);
    slotOut.classList.add('is-mapping');
    slotIn.classList.add('is-mapping');
  }
  function hideMinimaps() {
    clearTimeout(minimapTimer);
    slotOut.classList.remove('is-mapping');
    slotIn.classList.remove('is-mapping');
  }
  function hideMinimapsLater() {
    clearTimeout(minimapTimer);
    minimapTimer = setTimeout(hideMinimaps, MINIMAP_HIDE_MS);
  }
  for (const mini of [miniOut, miniIn]) mini.el.addEventListener('pointerdown', showMinimaps);

  // stage: play between the waves, "− 8 compases ▾ +" on its bottom edge
  const playBtn = h('button', { class: 'stage-btn stage-play', type: 'button' }, icon('play'));
  const barsLabel = h('span', {});
  const barsPill = h('button', { class: 'stage-btn bars-pill', type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' }, barsLabel, icon('chevron'));
  const stage = createStage(
    playBtn,
    barsPill,
    setOut,
    setIn,
    () => {
      endGesture();
      restartAfterDrag();
    },
    beginGesture,
    cancelGesture,
  );
  stage.onWaveTouch((touching) => (touching ? showMinimaps() : hideMinimapsLater()));
  const stageEmptyText = h('p', { class: 'stage-empty-text' });
  const stageEmptyBtn = h('button', { class: 'primary-btn', type: 'button' }, 'Escribir BPM');
  const stageEmpty = h('div', { class: 'stage-empty' }, stageEmptyText, stageEmptyBtn);

  // presets in a scrolling row: "Personalizado" only tells, "✦ Auto", then the presets
  const customPreset = h('button', { class: 'preset', type: 'button', 'aria-pressed': 'false' }, 'Personalizado');
  const presetButtons = new Map<TransitionPreset | 'auto', HTMLButtonElement>();
  const presets = h('div', { class: 'presets', role: 'group', 'aria-labelledby': 'presets-title' }, customPreset);
  for (const p of ['auto', ...PRESET_ORDER] as const) {
    const b = h('button', { class: 'preset', type: 'button', 'aria-pressed': 'false' }, ...(p === 'auto' ? [icon('sparkle'), 'Auto'] : [PRESETS[p].label]));
    b.addEventListener('click', () => (p === 'auto' ? resetToAuto() : applyPreset(p)));
    presetButtons.set(p, b);
    presets.append(b);
  }
  const presetsSection = h(
    'section',
    { class: 'presets-section', 'aria-labelledby': 'presets-title' },
    h('h3', { class: 'divider-title', id: 'presets-title' }, 'Presets'),
    presets,
  );

  // lane rows: each one opens its sheet
  const rows = new Map<SheetLane, { el: HTMLButtonElement; value: HTMLElement }>();
  const laneRows = h('div', { class: 'lane-rows' });
  for (const lane of SHEET_LANES) {
    const value = h('span', { class: 'lane-row-value' });
    const el = h(
      'button',
      { class: 'lane-row', type: 'button', 'data-lane': lane, 'aria-haspopup': 'dialog' },
      h('span', { class: 'lane-bar', 'aria-hidden': 'true' }),
      h('span', { class: 'lane-row-name' }, SHEET_LANE_NAMES[lane]),
      value,
      icon('chevron'),
    );
    el.addEventListener('click', () => enterSheetMode(lane));
    rows.set(lane, { el, value });
    laneRows.append(el);
  }

  const barsSheet = createBarsSheet((bars: BarsOption) => updateDraft({ bars }));
  const laneSheets = createLaneSheets({
    pick(lane, value) {
      if (lane === 'volume') setVolumeStyle(value as VolumeStyle);
      else if (lane === 'eq') setEqStyle(value as EqStyle);
      else if (lane === 'filter') setFilterStyle(value as FilterStyle);
      else if (lane === 'effect') setEffectStyle(value as EffectStyle);
      else setLoopStyle(value as LoopStyle);
    },
    toggleCustomize,
    undo,
    redo,
    laneChanged(lane) {
      openLane = lane;
      stage.setFocusLane(lane);
      // Personalizar belongs to the card it started from
      const editing = state?.editor?.customizing;
      if (editing && editing !== lane) toggleCustomize(editing);
    },
    requestClose: () => void exitSheetMode(),
  });

  const issues = h('ul', { class: 'issues', 'aria-live': 'polite' });

  // confirmation (close with changes, or move to another pair with changes): an iOS action sheet
  const confirmTitle = h('p', { class: 'action-title', id: 'confirm-title' });
  const keepBtn = h('button', { class: 'action action--cancel', type: 'button' }, 'Seguir editando');
  const discardBtn = h('button', { class: 'action action--danger', type: 'button' }, 'Descartar');
  const confirmSaveBtn = h('button', { class: 'action', type: 'button' }, 'Guardar');
  const actionSheet = h(
    'div',
    { class: 'action-sheet' },
    h('div', { class: 'action-group' }, confirmTitle, confirmSaveBtn, discardBtn),
    h('div', { class: 'action-group' }, keepBtn),
  );
  const confirm = h('div', { class: 'confirm', role: 'alertdialog', 'aria-labelledby': 'confirm-title', hidden: true }, actionSheet);

  const popover = createBpmPopover();

  let sheetsModel: Parameters<typeof laneSheets.update>[0] | null = null;
  const curveEditor = createCurveEditor(stage, {
    onChange: (side, curve) => {
      const lane = state?.editor?.customizing;
      if (lane) updateCustomCurve(lane, side, curve);
    },
    onGestureStart: beginGesture,
    onGestureEnd: () => {
      endGesture();
      restartAfterDrag();
    },
    onLimit: () => {
      limitShown = true;
      if (sheetsModel) laneSheets.update((sheetsModel = { ...sheetsModel, limitShown }));
    },
  });

  const body = h(
    'div',
    { class: 'editor-body' },
    slotOut,
    stage.el,
    stageEmpty,
    slotIn,
    issues,
    presetsSection,
    laneRows,
    laneSheets.el,
  );
  dialog.setAttribute('aria-labelledby', 'editor-title');
  const backdrop = h('div', { class: 'sheet-backdrop' });
  const panel = h('div', { class: 'sheet-panel' }, bar, body, toolbar, barsSheet.el, popover.el, confirm);
  dialog.append(backdrop, panel);
  // list rows light up instead of shrinking, like iOS
  pressFeedback([...panel.querySelectorAll('button:not(.nudge):not(.lane-option):not(.lane-row)')]);

  const sheet = createSheet(dialog, {
    panel,
    backdrop,
    body,
    handles: [bar],
    isDirty: () => !!state?.editor?.dirty,
    onDragClose: () => closeEditor(),
    onDragConfirm: () => askConfirm({ kind: 'close' }),
  });

  // ---------- sheet mode: a lane sheet open, the stage on top ----------

  /** The stage jumps to its new place; it slides there from where it was. */
  function slideStageFrom(before: number) {
    const dy = before - stage.el.getBoundingClientRect().top;
    if (Math.abs(dy) < 1) return;
    if (prefersReducedMotion()) animate(stage.el, { opacity: [0.4, 1] }, FADE);
    else animate(stage.el, { y: [dy, 0] }, SPRING.sheetOpen);
  }

  function enterSheetMode(lane: SheetLane) {
    if (openLane || !state?.editor) return;
    barsSheet.close();
    popover.close();
    hideMinimaps();
    const before = stage.el.getBoundingClientRect().top;
    openLane = lane;
    panel.classList.add('is-sheet-mode');
    body.scrollTop = 0;
    stage.setFocusLane(lane);
    laneSheets.open(lane);
    slideStageFrom(before);
  }

  async function exitSheetMode() {
    if (!openLane) return;
    const editing = state?.editor?.customizing;
    if (editing) toggleCustomize(editing);
    await laneSheets.close();
    if (!openLane) return;
    const lane = laneSheets.current();
    const before = stage.el.getBoundingClientRect().top;
    openLane = null;
    panel.classList.remove('is-sheet-mode');
    stage.setFocusLane(null);
    slideStageFrom(before);
    rows.get(lane)?.el.focus({ preventScroll: true });
  }

  /** Back to the plain editor at once (the editor closed). */
  function resetSheets() {
    openLane = null;
    laneSheets.hide();
    barsSheet.hide();
    panel.classList.remove('is-sheet-mode');
    stage.setFocusLane(null);
    hideMinimaps();
  }

  let sliding = false;
  /** Pair the slide in flight will land on; taps during the slide move it further. */
  let slideTarget = 0;
  let slideSave = false;

  /** The pair on screen, or the one a running slide is heading to. */
  const currentPair = () => (sliding ? slideTarget : state?.editor?.pairIndex ?? 0);

  /** Moves to another pair: the content leaves towards one side and the new pair enters from the other. */
  function navigate(pairIndex: number, save: boolean) {
    slideTarget = pairIndex;
    if (sliding) return;
    slideSave = save;
    const dir = Math.sign(pairIndex - (state?.editor?.pairIndex ?? pairIndex)) || 1;
    sliding = true;
    void slideOut(body, dir).then(() => {
      sliding = false;
      goToPair(slideTarget, slideSave);
      slideIn(body, dir);
    });
  }

  // ---------- behaviour ----------

  function askConfirm(target: typeof confirmTarget) {
    confirmTarget = target;
    const navigating = target.kind === 'navigate';
    confirmTitle.textContent = navigating ? '¿Guardar cambios antes de cambiar de transición?' : '¿Descartar cambios?';
    confirmSaveBtn.hidden = !navigating;
    const wasHidden = confirm.hidden;
    confirm.hidden = false;
    if (wasHidden) {
      animate(confirm, { opacity: [0, 1] }, { duration: 200, ease: 'easeOut' });
      if (prefersReducedMotion()) animate(actionSheet, { opacity: [0, 1] }, FADE);
      else animate(actionSheet, { y: [actionSheet.offsetHeight + 24, 0] }, SPRING.sheetOpen);
    }
    (navigating ? confirmSaveBtn : keepBtn).focus();
  }

  /** Hides the action sheet; `then` runs once it is out of the way. */
  function hideConfirm(then?: () => void) {
    if (confirm.hidden) return then?.();
    const out = prefersReducedMotion()
      ? animate(actionSheet, { opacity: 0 }, FADE)
      : animate(actionSheet, { y: actionSheet.offsetHeight + 24 }, SPRING.sheetClose);
    animate(confirm, { opacity: 0 }, { duration: 200, ease: 'easeOut' });
    void out.then(() => {
      confirm.hidden = true;
      confirm.style.opacity = '';
      actionSheet.style.opacity = '';
      then?.();
    });
  }

  function requestClose() {
    if (state?.editor?.dirty) askConfirm({ kind: 'close' });
    else closeEditor();
  }

  function requestPair(pairIndex: number) {
    const editor = state?.editor;
    if (!editor || pairIndex < 0 || pairIndex >= pairCount || pairIndex === currentPair()) return;
    // the unsaved-changes question was already answered for the slide in flight
    if (sliding) navigate(pairIndex, slideSave);
    else if (editor.dirty) askConfirm({ kind: 'navigate', pairIndex });
    else navigate(pairIndex, false);
  }

  closeBtn.addEventListener('click', requestClose);
  saveBtn.addEventListener('click', saveDraft);
  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);
  prevBtn.addEventListener('click', () => requestPair(currentPair() - 1));
  nextBtn.addEventListener('click', () => requestPair(currentPair() + 1));
  barsPill.addEventListener('click', () => (barsSheet.isOpen() ? barsSheet.close() : barsSheet.open(barsPill)));
  keepBtn.addEventListener('click', () => hideConfirm(() => title.focus()));
  // a tap on the dimmed area is "Seguir editando", like an iOS action sheet
  confirm.addEventListener('click', (e) => {
    if (e.target === confirm) hideConfirm(() => title.focus());
  });
  discardBtn.addEventListener('click', () => {
    const target = confirmTarget;
    hideConfirm();
    if (target.kind === 'navigate') navigate(target.pairIndex, false);
    else closeEditor();
  });
  confirmSaveBtn.addEventListener('click', () => {
    const target = confirmTarget;
    hideConfirm();
    if (target.kind === 'navigate') navigate(target.pairIndex, true);
  });
  stageEmptyBtn.addEventListener('click', () => {
    const missing = [deckOut, deckIn].find((d) => d.bpm.classList.contains('is-missing'));
    const id = missing?.bpm.dataset.track;
    if (missing && id) popover.open(id, missing.bpm);
  });
  // the popover is anchored to a BPM that scrolls with the body
  body.addEventListener('scroll', () => popover.close(), { passive: true });

  // Shortcuts: undo/redo, [ ] between pairs and - + = for zoom. Never while typing in a field.
  dialog.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('input, select, textarea') || !confirm.hidden || !state?.editor) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') {
      if (e.shiftKey) redo();
      else undo();
    } else if (!mod && !openLane && e.key === '[') {
      requestPair(currentPair() - 1);
    } else if (!mod && !openLane && e.key === ']') {
      requestPair(currentPair() + 1);
    } else if (!mod && e.key === '-') {
      stage.stepZoom(-1);
    } else if (!mod && (e.key === '+' || e.key === '=')) {
      stage.stepZoom(1);
    } else {
      return;
    }
    e.preventDefault();
  });

  function renderIssues() {
    if (!validation) return;
    const item = (kind: 'error' | 'warning', text: string) => h('li', { class: `issue issue--${kind}` }, icon('warning'), h('span', {}, text));
    issues.replaceChildren(...validation.errors.map((e) => item('error', e.message)), ...validation.warnings.map((w) => item('warning', w.message)));
  }
  /** Focus when Esc / Back arrived, given back if the browser closed the dialog anyway. */
  let focusBeforeCancel: HTMLElement | null = null;
  // Chrome lets a page refuse Esc / Back only once per user activation; otherwise the dialog closes on
  // its own while the editor is still open. Put it back: the cancel handler already did what Esc means.
  dialog.addEventListener('close', () => {
    if (!state?.editor || sheet.isClosing()) return;
    dialog.showModal();
    if (focusBeforeCancel?.isConnected) focusBeforeCancel.focus({ preventScroll: true });
  });
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    focusBeforeCancel = document.activeElement as HTMLElement | null;
    if (popover.isOpen()) popover.close();
    else if (!confirm.hidden) hideConfirm(() => title.focus());
    else if (barsSheet.isOpen()) barsSheet.close();
    else if (openLane) void exitSheetMode();
    else requestClose();
  });

  playBtn.addEventListener('click', () => (state?.playback === 'previewing' ? handlers.onStop() : handlers.onPreview()));
  for (const deck of [deckOut, deckIn]) {
    deck.bpm.addEventListener('click', () => {
      const id = deck.bpm.dataset.track;
      if (id) popover.open(id, deck.bpm);
    });
  }

  function fillDeck(deck: Deck, track: Track, point: string) {
    deck.name.textContent = track.name;
    deck.point.textContent = point;
    deck.point.hidden = !point;
    deck.bpm.dataset.track = track.id;
    deck.bpm.textContent = track.bpm !== null ? `${formatBpm(track.bpm)} bpm` : 'BPM requerido';
    deck.bpm.classList.toggle('is-missing', track.bpm === null);
    deck.bpm.setAttribute('aria-label', `Editar BPM de ${track.name}: ${deck.bpm.textContent}`);
    deck.duration.textContent = formatDuration(track.duration);
  }

  return {
    update(next) {
      state = next;
      const editor = next.editor;

      if (!editor) {
        incomingId = null;
        lastSignature = '';
        limitShown = false;
        curveEditor.update(null, false);
        popover.close();
        confirm.hidden = true;
        if (dialog.open && !sheet.isClosing()) {
          const pair = openPair;
          // Audio and focus changes update state; run them after this render finishes.
          if (next.playback === 'previewing') queueMicrotask(handlers.onStop);
          void sheet.close().then((closed) => {
            if (closed) resetSheets();
            if (closed && pair !== null) handlers.onClosed(pair);
          });
        }
        openPair = null;
        return;
      }

      const justOpened = !dialog.open || sheet.isClosing();
      if (justOpened) {
        resetSheets();
        sheet.open();
        body.scrollTop = 0;
      }
      // Opening the editor or moving to another pair both start the preview of the new pair.
      const pairChanged = justOpened || openPair !== editor.pairIndex;
      openPair = editor.pairIndex;
      if (pairChanged) stage.resetZoom();

      const { tracks, pairs, validations } = pairsWithDraft(next);
      const from = tracks[editor.pairIndex];
      const to = tracks[editor.pairIndex + 1];
      validation = validations[editor.pairIndex];
      const t = editor.draft;
      incomingId = to.id;
      pairCount = pairs.length;

      title.textContent = `${editor.pairIndex + 1} de ${pairs.length}`;
      title.setAttribute('aria-label', `Transición ${editor.pairIndex + 1} de ${pairs.length}`);
      prevBtn.disabled = editor.pairIndex === 0;
      nextBtn.disabled = editor.pairIndex >= pairs.length - 1;
      undoBtn.disabled = editor.past.length === 0;
      redoBtn.disabled = editor.future.length === 0;

      // presets: "Personalizado" when nothing matches, Auto, or the matching preset
      const label = chipLabel(t);
      customPreset.setAttribute('aria-pressed', String(label === 'Custom'));
      customPreset.disabled = label !== 'Custom';
      for (const [p, b] of presetButtons) {
        const active = p === 'auto' ? label === 'Auto' : label === PRESETS[p].label;
        b.setAttribute('aria-pressed', String(active));
      }
      barsLabel.textContent = barsText(t.bars);
      barsPill.setAttribute('aria-label', `Duración: ${barsText(t.bars)}`);
      barsSheet.update(t.bars);
      for (const [lane, row] of rows) {
        const value = laneValueLabel(t, lane);
        row.value.textContent = value;
        row.el.setAttribute('aria-label', `${SHEET_LANE_NAMES[lane]}: ${value}`);
      }

      const previewing = next.playback === 'previewing';
      if (!previewing) stage.setPlayhead(null);
      playBtn.disabled = !previewing && !validation.ok;
      setIcon(playBtn, previewing ? 'stop' : 'play');
      playBtn.setAttribute('aria-label', previewing ? 'Detener' : 'Reproducir transición');
      playBtn.title = playBtn.getAttribute('aria-label')!;

      drawable = !!(from.bpm !== null && to.bpm !== null && from.finePeaks && to.finePeaks && from.peaks && to.peaks);
      if (!drawable) {
        fillDeck(deckOut, from, '');
        fillDeck(deckIn, to, '');
        const missing = [from, to].filter((x) => x.bpm === null).map((x) => x.name);
        stageEmptyText.textContent = `Toca el BPM de ${missing.join(' y ')} para escribirlo y ver la transición.`;
        stageEmptyBtn.hidden = missing.length === 0;
        stageEmpty.hidden = false;
        stage.el.hidden = true;
        hideMinimaps();
        stage.draw(null);
        curveEditor.update(null, false);
      } else {
        const d = barsToSeconds(t.bars, from.bpm!);
        const r = playbackRateFor(from.bpm!, to.bpm!);
        const lines = laneLines(t);
        fillDeck(deckOut, from, `Sale en ${formatTime(t.outStart)}`);
        fillDeck(deckIn, to, `Entra en ${formatTime(t.inStart)}, a ${r.toFixed(3)}× durante la transición`);
        stageEmpty.hidden = true;
        stage.el.hidden = false;
        const stageFrom = { name: from.name, peaks: from.finePeaks!, duration: from.duration, bpm: from.bpm!, firstBeatOffset: from.firstBeatOffset };
        const stageTo = { name: to.name, peaks: to.finePeaks!, duration: to.duration, bpm: to.bpm!, firstBeatOffset: to.firstBeatOffset };
        const jumps = loopJumps(t, from.bpm!);
        const loop = jumps.length > 0 ? { audioStart: t.outStart, jumps } : null;
        stage.draw({ from: stageFrom, to: stageTo, outStart: t.outStart, inStart: t.inStart, d, r, linesOut: lines.out, linesIn: lines.in, loop });
        miniOut.draw({ ...stageFrom, peaks: from.peaks!, windowStart: t.outStart, windowLength: d });
        miniIn.draw({ ...stageTo, peaks: to.peaks!, windowStart: t.inStart, windowLength: d * r });
        stage.setCustomizing(editor.customizing);
        stage.setFocusLane(openLane);
        const lane = editor.customizing ?? 'volume';
        const shape = filterShape(t.filter);
        const scales = {
          out: laneScale(lane, shape.out?.kind ?? null),
          in: laneScale(lane, shape.in?.kind ?? null),
        };
        curveEditor.update({ lane, curves: editableCurves(t, lane), scales, bars: t.bars, d }, editor.customizing !== null);
      }

      // autoplay on open / pair change; restart the loop when the draft (or the tracks' tempo) changes
      const signature = JSON.stringify([editor.pairIndex, t, from.bpm, from.firstBeatOffset, to.bpm, to.firstBeatOffset]);
      const changed = signature !== lastSignature;
      lastSignature = signature;
      if (changed) limitShown = false;
      renderIssues();
      sheetsModel = {
        draft: t,
        customizing: editor.customizing,
        canUndo: editor.past.length > 0,
        canRedo: editor.future.length > 0,
        limitShown,
        canCustomize: drawable,
      };
      laneSheets.update(sheetsModel);
      const dragging = stage.isDragging() || miniOut.isDragging() || miniIn.isDragging() || curveEditor.isDragging();
      if (pairChanged) {
        // An invalid pair never autoplays; when moving between pairs, the previous preview stops.
        if (validation.ok) queueMicrotask(handlers.onPreview);
        else if (!justOpened) queueMicrotask(handlers.onStop);
      } else if (changed && previewing && !dragging) {
        queueMicrotask(validation.ok ? handlers.onPreview : handlers.onStop);
      }
    },

    tick(mixTimeOf) {
      stage.setPlayhead(incomingId ? mixTimeOf(incomingId) : null);
    },
  };
}
