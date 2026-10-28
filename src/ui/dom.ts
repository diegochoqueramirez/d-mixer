type Attrs = Record<string, string | number | boolean | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key === 'class') el.className = String(value);
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  el.append(...children);
  return el;
}

const ICONS = {
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/>',
  up: '<path d="M12 7l-6 6.5h12z"/>',
  down: '<path d="M12 17l6-6.5H6z"/>',
  remove: '<path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>',
  prev: '<path d="M14.5 6l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  next: '<path d="M9.5 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  add: '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>',
  minus: '<path d="M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  sparkle: '<path d="M10 3.5l1.6 4.9 4.9 1.6-4.9 1.6L10 16.5l-1.6-4.9L3.5 10l4.9-1.6zM17.5 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  undo: '<path d="M9 7L5 11l4 4M5 11h9a5 5 0 010 10h-2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  redo: '<path d="M15 7l4 4-4 4M19 11h-9a5 5 0 000 10h2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  grip: '<path d="M5 8h14M5 12h14M5 16h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/>',
  transition: '<path d="M4 7c6 0 10 10 16 10M4 17c6 0 10-10 16-10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/>',
  warning: '<path d="M12 4.5l8.5 15h-17z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" fill="none"/><path d="M12 10v4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="17" r="1.1"/>',
  chevron: '<path d="M10 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  music: '<path d="M9 18.5a2.5 2.5 0 11-2.5-2.5H9V6l10-2v12.5a2.5 2.5 0 11-2.5-2.5H19" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" fill="none"/>',
};

export type IconName = keyof typeof ICONS;

export function icon(name: IconName): SVGSVGElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = `<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ICONS[name]}</svg>`;
  return tpl.content.firstElementChild as SVGSVGElement;
}

export function setIcon(button: HTMLElement, name: IconName): void {
  button.querySelector('svg.icon')?.replaceWith(icon(name));
}

/** 201.4 -> "3:21.40" */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

/** 240 -> "04:00" */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatBpm(bpm: number): string {
  return Number.isInteger(bpm) ? String(bpm) : bpm.toFixed(1);
}
