# SPEC 09 — Interfaz móvil estilo iOS

> **Estado:** Implementado
> **Depende de:** SPEC 01, SPEC 02, SPEC 04, SPEC 05
> **Fecha:** 2026-10-28
> **Objetivo:** Rediseñar la interfaz de la app, que pasa a llamarse D-Mix, con patrones de app de iPhone (título grande, hoja modal con gesto, filas con deslizar y arrastrar, mini-player y zonas seguras) y animaciones suaves con resorte, para que se use cómodamente con el dedo en un celular, tanto en iPhone como en Android.

---

## Por qué existe esta spec

La app se usa sobre todo desde el celular. Hoy solo hay un `@media (max-width: 599px)` que reacomoda la vista de escritorio: el editor sube como hoja al 92% de alto, pero sin gesto ni animación. Además:

- la playlist se reordena con flechas ↑ ↓ pequeñas;
- el texto vacío dice "Arrastra tus canciones aquí", algo que no se puede hacer en un iPhone;
- el reproductor es un footer con dos botones;
- no se respetan la muesca ni la barra de inicio (`safe-area-inset`).

Esta spec adapta la app a los patrones de iOS sin perder su identidad: modo oscuro y acento verde. La conversión en app instalable (PWA) va en la SPEC 10.

Origen de cada decisión:

| Decisión | Origen |
| --- | --- |
| Título grande que se reduce a la barra al hacer scroll | Human Interface Guidelines de Apple (navigation bars) |
| Hoja modal con tirador, cierre deslizando hacia abajo y rebote si hay cambios sin guardar | HIG (sheets); comportamiento de Mail y Notas |
| Deslizar a la izquierda para "Eliminar"; mantener presionado para arrastrar | HIG (lists and tables); apps Música y Recordatorios |
| Aviso "Deshacer" tras eliminar, tirador ≡ visible, filas que se iluminan | Gmail y Google Fotos (deshacer); HIG (lists, reordering); confirmado por el usuario |
| Resistencia al arrastrar una hoja que no se puede cerrar | HIG (sheets) y `UIScrollView` (coeficiente 0,55) |
| Mini-player inferior con botón redondo | Apps Música y Spotify en iOS |
| Objetivos táctiles de 44 × 44 pt mínimo | HIG (layout) |
| Mantener tema oscuro y verde `--accent` | Propio (confirmado por el usuario) |
| Animaciones con el motor de Motion (`JSAnimation` y `press` de `motion-dom`); gestos propios | Propio, tras comparar con GSAP, solo nativo y View Transitions (confirmado por el usuario); `motion-dom` en lugar de `animate` decidido durante la implementación por peso |
| Compatible con Chrome en Android, verificado en emulación | Propio (confirmado por el usuario) |

Referencias:

- [Apple — Human Interface Guidelines: Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets)
- [Apple — Human Interface Guidelines: Lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables)
- [Apple — Human Interface Guidelines: Layout](https://developer.apple.com/design/human-interface-guidelines/layout)
- [Motion — `animate` y `spring` en JavaScript](https://motion.dev/docs/animate)
- [Motion — `press`](https://motion.dev/docs/press)
- [caniuse — `linear()` easing](https://caniuse.com/wf-linear-easing) y [WebKit bug 312407](https://bugs.webkit.org/show_bug.cgi?id=312407) (resortes con `linear()` que pierden cuadros en Safari 26)

---

## Alcance

**Entra:**

- **Nombre de la app: D-Mix** (confirmado por el usuario). Reemplaza "Mixer" / "mixer" en todo lo visible:
  - `<title>` de `index.html`;
  - el título grande y el título de la barra compacta;
  - la marca `.wordmark`.

  No cambian el nombre del repo, el `name` de `package.json` ni la ruta `/d-mixer/` de GitHub Pages: la app solo se usa en local.
- **Un solo diseño para móvil y escritorio** (confirmado por el usuario). En escritorio se ve como la app de iPhone centrada en una columna de 720 px como máximo, igual que hoy.
- **Viewport y zonas seguras:**
  - `viewport-fit=cover` en `index.html` y rellenos con `env(safe-area-inset-*)` en la cabecera, el mini-player, la hoja y los laterales en horizontal;
  - alturas con `dvh` en lugar de `vh`;
  - `<meta name="theme-color">` con el color de `--bg`;
  - sin resaltado gris al tocar (`-webkit-tap-highlight-color: transparent`) y sin zoom por doble toque (`touch-action: manipulation`);
  - campos y selects a 16 px como mínimo para que iOS no haga zoom al enfocarlos.
- **Cabecera con título grande:**
  - "D-Mix" se ve como título grande al principio de la lista;
  - al hacer scroll pasa a una barra compacta fija, con el título pequeño centrado y fondo translúcido (`backdrop-filter: blur`);
  - el interruptor Mix y un botón "+" redondo (etiqueta accesible "Añadir canciones") quedan en la barra.
- **Playlist estilo lista agrupada de iOS:**
  - filas de 44 pt de alto como mínimo, con separadores finos;
  - las flechas ↑ ↓ y la × desaparecen de la vista (siguen para lectores de pantalla, ver abajo);
  - al tocar una fila, su fondo se ilumina (`--row-highlight`), como en las listas de iOS; las filas no se encogen;
  - **tirador ≡ visible** y tenue a la derecha de cada fila (confirmado por el usuario): arrastrarlo levanta la fila al instante, sin esperar;
  - **mantener presionado 350 ms** en cualquier otro punto de la fila también la levanta;
  - una fila levantada lleva sombra y escala 1,03; las demás se apartan y al soltar se aplica el orden nuevo;
  - **deslizar a la izquierda** muestra un botón rojo "Eliminar"; deslizar más allá del 60% del ancho elimina la fila directamente; tocar fuera o deslizar a la derecha la cierra;
  - solo una fila puede tener "Eliminar" visible: abrir otra cierra la anterior;
  - **en escritorio**, al pasar el ratón por una fila aparece además una × para quitarla (confirmado por el usuario);
  - el chip de transición queda entre filas, como hoy, con 44 pt de objetivo táctil.
- **Aviso "Deshacer" al eliminar** (confirmado por el usuario):
  - al quitar una canción, por cualquier vía, aparece sobre el mini-player el aviso "Canción eliminada · Deshacer" durante 5 s;
  - "Deshacer" la devuelve a su posición con sus transiciones. Las transiciones no se borran del mapa al quitar una canción (ya es así en `state.ts`), así que basta con reinsertar la canción;
  - solo se puede deshacer la última eliminación: una nueva reemplaza el aviso anterior;
  - el aviso se anuncia con `aria-live` y se puede descartar deslizándolo hacia abajo.
- **Teclado y lector de pantalla en la playlist** (confirmado por el usuario):
  - cada fila es enfocable; `Alt+↑` / `Alt+↓` la mueven y `Supr` / `Retroceso` la quitan;
  - los botones "Subir", "Bajar" y "Quitar" siguen en cada fila, ocultos a la vista (`.visually-hidden`) pero accesibles para VoiceOver y TalkBack, que no pueden usar los gestos;
  - el botón "Eliminar" revelado es un botón real.
- **Estado vacío:** icono, "Sin canciones", una línea de ayuda y un botón grande "Añadir canciones" que abre el selector de archivos (la app Archivos en iPhone). En escritorio se sigue pudiendo arrastrar y soltar archivos.
- **Mini-player inferior:**
  - barra fija abajo, translúcida y sobre la zona segura;
  - el estado actual en hasta dos líneas, cortado con "…" después (confirmado por el usuario). Así los avisos como "Escribe el BPM de X desde su transición…" se leen enteros;
  - un solo botón redondo que alterna entre play ("Reproducir mezcla") y stop ("Detener"), deshabilitado cuando hay un bloqueo (`mixBlocker`);
  - el texto completo del estado sigue en una región `aria-live`.
- **Editor como hoja iOS:**
  - sigue siendo el `<dialog>` actual, con foco atrapado y `Esc`;
  - tirador arriba; en móvil ocupa hasta la zona segura superior con un margen y en escritorio queda centrado con el ancho actual (480 px);
  - el fondo de la página se oscurece y deja de hacer scroll mientras está abierta;
  - **se cierra deslizando hacia abajo** desde el tirador y la barra del título, o desde el cuerpo cuando su scroll está arriba del todo y el dedo no empezó en una onda, un minimapa, un punto de transición o una curva (confirmado por el usuario);
  - durante el gesto la hoja sigue al dedo; al soltar se cierra si bajó más del 25% de su alto o si la velocidad supera 0,5 px/ms; si no, vuelve con resorte;
  - **con cambios sin guardar** la hoja baja con resistencia (cada vez menos por cada píxel del dedo, como en iOS); al soltar vuelve a su sitio con resorte y aparece la confirmación actual "¿Descartar cambios?" (confirmado por el usuario);
  - los botones de la barra (cerrar, deshacer, rehacer, anterior, siguiente) llegan a 44 pt de objetivo táctil.
- **Animaciones** (las cuatro confirmadas por el usuario):
  1. **Hoja del editor:** se abre subiendo con resorte y se cierra bajando; el fondo aparece y desaparece con un fundido.
  2. **Filas de la lista:** las filas nuevas aparecen con fundido y desplazamiento corto; las que se quitan se pliegan; al reordenar, las demás filas se desplazan con resorte (técnica FLIP).
  3. **Respuesta al tocar:** botones, chips y presets se encogen a escala 0,97 al presionarlos y vuelven con resorte al soltar. Las filas se iluminan en lugar de encogerse.
  4. **Cambio entre transiciones:** con anterior y siguiente, el contenido del editor sale hacia un lado y entra desde el otro, con un desplazamiento corto y fundido.
- **Movimiento reducido:** con `prefers-reduced-motion: reduce` los desplazamientos y resortes se cambian por fundidos de 150 ms o por cambios instantáneos. Los gestos siguen funcionando.
- **Android (Chrome)** (confirmado por el usuario): mismo diseño iOS, sin variante Material. Se cubren las diferencias del sistema:
  - el botón o gesto "Atrás" con la hoja abierta dispara `cancel` en el `<dialog>` y sigue el mismo camino que `Esc`: cierre animado, o rebote y "¿Descartar cambios?" si hay cambios;
  - `overscroll-behavior-y: contain` en `html`, `body` y el cuerpo de la hoja, para que deslizar hacia abajo no recargue la página y borre la playlist;
  - la pulsación larga en las filas no abre el menú contextual ni selecciona texto (`contextmenu` cancelado y `user-select: none`);
  - "Quitar animaciones" de Android activa el mismo movimiento reducido (`prefers-reduced-motion`).
- **Aviso al recargar o cerrar** (añadido tras probar en el iPhone, confirmado por el usuario): con al menos una canción en la playlist, el evento `beforeunload` pide confirmación al navegador antes de recargar o cerrar la pestaña, porque la playlist solo vive en memoria. El texto del aviso lo pone el navegador. Safari en iOS no muestra este aviso; allí la protección es el bloqueo del deslizar para recargar (`overscroll-behavior-y`).
- **Orientación:** el diseño es para vertical. En horizontal todo sigue siendo usable, con los rellenos de zonas seguras a los lados, sin un diseño especial (confirmado por el usuario).

**No entra:**

- PWA: manifest, iconos, service worker, uso sin conexión e instalación (SPEC 10).
- Ajustes del audio en iOS: interruptor de silencio (`navigator.audioSession`), audio en segundo plano o con la pantalla bloqueada (SPEC 10).
- Vibración háptica (confirmado por el usuario).
- Diseño Material o variante propia para Android.
- Prueba en un teléfono Android real: Android se verifica en emulación (confirmado por el usuario).
- Evitar que "Atrás" con la hoja cerrada salga de la app y pierda la playlist: depende de guardar el proyecto (SPEC 08).
- Guardar la playlist para que sobreviva a una recarga (SPEC 08); el aviso al recargar solo avisa.
- Menús o action sheets hechos a mano: los `<select>` siguen siendo nativos (confirmado por el usuario).
- Diseño especial en horizontal para el editor.
- Mini-player con canción actual o barra de progreso de la mezcla.
- Deslizar entre transiciones con el dedo: se cambia con los botones anterior y siguiente.
- Deshacer más de una eliminación, deshacer pasados los 5 s y deshacer reordenamientos.
- Modo claro.
- Migrar la UI a un framework.

---

## Modelo de datos

Esta spec no añade campos al estado de la app (`AppState`) ni a las transiciones. El aviso y los gestos son estado de vista dentro de `src/ui/`.

**Eliminar y deshacer** en `src/state.ts`:

```ts
export interface RemovedTrack {
  track: Track;   // same object, keeps its decoded buffer, BPM and status
  index: number;  // position in state.tracks before removal
}

/** Removes a track and returns what is needed to put it back. */
export function removeTrack(id: string): RemovedTrack | null;

/** Re-inserts the track at its old index (clamped to the list length). Its pairs find their saved transitions again. */
export function restoreTrack(removed: RemovedTrack): void;
```

`playlist.ts` deja de filtrar `tracks` directamente y usa `removeTrack`. `src/ui/toast.ts` guarda el último `RemovedTrack` mientras el aviso está visible.

Funciones puras para decidir los gestos, en `src/lib/gestures.ts`, para poder probarlas sin DOM:

```ts
/** Release decision for the editor sheet drag. */
export function sheetReleaseAction(
  offsetY: number,      // px dragged down from the open position (≥ 0)
  velocityY: number,    // px/ms, positive = down
  sheetHeight: number,
  dirty: boolean,
): 'close' | 'confirm' | 'restore';

/** Release decision for a row swiped left. */
export function swipeReleaseAction(
  offsetX: number,      // px dragged left (≥ 0)
  velocityX: number,    // px/ms, positive = left
  rowWidth: number,
): 'delete' | 'reveal' | 'restore';

/** Target index while dragging a lifted row, from its centre and the other rows' midpoints. */
export function reorderTargetIndex(
  draggedCenterY: number,
  midpoints: number[],  // midpoints of every row in current order, excluding none
  fromIndex: number,
): number;

/** iOS-style resistance: maps the finger offset to the sheet offset when closing is blocked. */
export function rubberBand(offset: number, dimension: number): number;
// = (offset * dimension * RUBBER_BAND) / (dimension + RUBBER_BAND * offset)
```

Constantes (valores iniciales; se ajustan tras probar en el iPhone y se anotan en la bitácora):

| Constante | Valor | Uso |
| --- | --- | --- |
| `SHEET_CLOSE_RATIO` | 0,25 | Fracción del alto de la hoja que cierra al soltar |
| `FLING_VELOCITY` | 0,5 px/ms | Velocidad que cierra la hoja o completa un deslizamiento |
| `SWIPE_REVEAL_WIDTH` | 88 px | Ancho del botón "Eliminar" revelado |
| `SWIPE_DELETE_RATIO` | 0,6 | Fracción del ancho de la fila que elimina directamente |
| `LONG_PRESS_MS` | 350 ms | Tiempo para levantar una fila |
| `GESTURE_SLOP` | 8 px | Movimiento que cancela la pulsación larga y decide el eje del gesto |
| `RUBBER_BAND` | 0,55 | Coeficiente de resistencia de la hoja con cambios sin guardar (el de UIScrollView) |
| `UNDO_TOAST_MS` | 5000 ms | Tiempo que el aviso "Deshacer" queda visible |

---

## Animaciones

Se usa el motor de Motion a través de `motion-dom` (paquete npm, versión exacta fijada en 14.7.1), y solo dos piezas:

- **`JSAnimation`**: el motor de animación en JavaScript que Motion usa por dentro. Acepta `velocity` en el resorte y se puede detener a mitad. `src/ui/motion.ts` lo envuelve en un `animate(el, props, transition, velocity)` propio que compone `translateX`, `translateY` y `scale` en un solo `transform`, y anima también `opacity` y `height`.
- **`press`** para el efecto de encoger al tocar. Ya maneja el puntero, la cancelación al salir del elemento y el teclado.

**Cambio durante la implementación** (confirmado por el usuario): la spec pedía `animate` de `"motion"`, pero `animate` + `press` pesan 25,9 kB comprimido y el bundle crecía 29,5 kB, por encima del límite de 25 kB. Con `motion-dom` pesan 8,8 kB y el bundle crece 13,4 kB. Como todo corre en JavaScript y nada pasa por WAAPI, además se evita el bug de los resortes en `linear()` de Safari.

**Los resortes se definen por física** (`stiffness`, `damping`, `mass`). En Motion 14 los resortes definidos por `duration` y `bounce` ignoran la velocidad inicial, así que `motion.ts` convierte cada par `duration`/`bounce` de la tabla con la misma fórmula que Motion usa para `visualDuration`.

**Los gestos son propios.** Seguir al dedo, deslizar para eliminar, pulsación larga y arrastrar la hoja se escriben con Pointer Events y las decisiones de `src/lib/gestures.ts`. Motion no tiene arrastre fuera de React y no debe chocar con los arrastres de ondas, minimapas, puntos y curvas que ya existen. Motion solo anima lo que pasa después de soltar.

**Del dedo al resorte sin salto.** Mientras el dedo se mueve, el código escribe `transform` directamente y calcula la velocidad con los últimos 100 ms de movimiento. Al soltar, el resorte arranca con esa velocidad (`velocity`) desde la posición actual. Si se vuelve a agarrar la hoja durante una animación, se llama a `stop()` y el gesto sigue desde donde estaba.

No se usan `animate` de `"motion"`, APIs de React ni de Motion+ (`animateView`). Todo pasa por `src/ui/motion.ts`, que expone ayudantes y aplica el movimiento reducido en un único sitio.

| Animación | Propiedades | Transición |
| --- | --- | --- |
| Abrir hoja | `transform: translateY(100% → 0)`; fondo `opacity 0 → 1` | `spring`, `duration: 0.45`, `bounce: 0.12` |
| Cerrar hoja | `translateY(actual → 100%)`; fondo `opacity → 0` | `spring`, `duration: 0.35`, `bounce: 0`, con la velocidad del dedo |
| Hoja vuelve a su sitio | `translateY(actual → 0)` | `spring`, `duration: 0.4`, `bounce: 0.2`, con la velocidad del dedo |
| Fila aparece | `opacity 0 → 1`, `translateY(8px → 0)` | `spring`, `duration: 0.3`, `bounce: 0` |
| Fila se quita | `opacity → 0`, altura → 0 | `duration: 0.25`, `ease-out` |
| Filas se reordenan (FLIP) | `translateY(diferencia → 0)` | `spring`, `duration: 0.35`, `bounce: 0.15` |
| Fila levantada | `scale 1 → 1.03`, sombra | `spring`, `duration: 0.2` |
| Pulsar / soltar (botones, chips, presets) | `scale 1 ↔ 0.97` | pulsar `duration: 0.1`; soltar `spring`, `duration: 0.25`, `bounce: 0.3` |
| Tocar una fila | fondo `--row-highlight` | aparece al instante; se apaga en `duration: 0.3` |
| Aviso "Deshacer" | entra `translateY(100% → 0)` + `opacity`; sale al revés | `spring`, `duration: 0.35`, `bounce: 0.1` |
| Fila restaurada | igual que "Fila aparece" | |
| Cambio de transición | contenido sale `translateX(0 → ∓24px)` + `opacity → 0` y entra desde `±24px` | `spring`, `duration: 0.3`, `bounce: 0` |
| Barra compacta de la cabecera | título pequeño y fondo `opacity 0 ↔ 1` | `duration: 0.2` |

Reglas:

- Solo se animan `transform` y `opacity`, salvo la altura al quitar una fila.
- Un gesto en curso cancela la animación anterior del mismo elemento (`animation.stop()`).
- Con `prefers-reduced-motion: reduce`, `motion.ts` cambia los desplazamientos por fundidos de 150 ms y no anima la escala al pulsar.
- La hoja y las filas escriben `transform` directamente mientras siguen al dedo y solo lanzan `animate` al soltar, con la velocidad del gesto.

---

## Estilo visual

- **Se mantienen** el tema oscuro, `--accent` verde y los colores de los carriles.
- **Tokens nuevos en `src/styles.css`:**
  - `--bar-bg: rgba(18, 18, 18, 0.72)` para las barras translúcidas;
  - `--bar-blur: 20px`;
  - `--separator: rgba(255, 255, 255, 0.12)`;
  - `--grouped-bg: #1c1c1e`, el fondo de la lista agrupada (gris de sistema oscuro de iOS);
  - `--sheet-radius: 12px`;
  - `--grabber: rgba(255, 255, 255, 0.3)`, también para el tirador ≡ de las filas;
  - `--row-highlight: rgba(255, 255, 255, 0.08)`;
  - `--toast-bg: #2c2c2e` (gris elevado de iOS oscuro);
  - `--destructive: var(--danger)` para "Eliminar";
  - `--tap-min: 44px`;
  - `--safe-top`, `--safe-right`, `--safe-bottom`, `--safe-left` con `env(safe-area-inset-*, 0px)`.
- **Fuente:** se mantiene `system-ui, -apple-system`, que en el iPhone es SF Pro. Título grande de 34 px en negrita y barra compacta de 17 px semibold, como en iOS.
- **Tirador de la hoja:** 36 × 5 px, radio completo, color `--grabber`, centrado a 6 px del borde superior.
- **Tirador ≡ de las filas:** icono de 20 px en `--grabber`, con 44 × 44 px de objetivo táctil, a la derecha de la fila.
- **Aviso "Deshacer":** cápsula de `--toast-bg` con radio `--radius-card`, 8 px sobre el mini-player; "Deshacer" en `--accent` y en negrita.
- **Mini-player:** 64 px de alto (72 px con dos líneas de estado) más la zona segura inferior; botón redondo de 44 px con `--accent` y el icono en `--on-accent`.
- **Lista:** fondo `--grouped-bg` con radio `--radius-card` y separadores de 0,5 px en `--separator`, que empiezan después del número de la fila, como en iOS.
- Desaparece el `@media (max-width: 599px)` actual: el diseño base ya es el móvil. Solo queda una regla para escritorio con `@media (min-width: 600px)` que centra la hoja.
- Sin colores fuera de `src/styles.css`.

---

## Estructura de archivos

```
index.html              # <title>D-Mix</title>, viewport-fit=cover, theme-color, estructura: cabecera con título grande, lista, mini-player
package.json            # + dependencia "motion-dom" (versión exacta 14.7.1)
src/
  lib/
    gestures.ts         # NUEVO: sheetReleaseAction, swipeReleaseAction, reorderTargetIndex y constantes
    gestures.test.ts    # NUEVO
  ui/
    motion.ts           # NUEVO: springs con nombre (por física), animate sobre JSAnimation, pressFeedback (sobre press), slideIn/slideOut,
                        #   springFrom(el, velocity), seguimiento de velocidad del puntero, movimiento reducido
    sheet.ts            # NUEVO: abrir/cerrar con resorte, arrastre para cerrar, bloqueo de scroll del fondo
    rowGestures.ts      # NUEVO: deslizar para eliminar, tirador ≡ y pulsación larga para arrastrar en una fila
    toast.ts            # NUEVO: aviso "Canción eliminada · Deshacer" con temporizador
    playlist.ts         # filas sin flechas visibles (botones ocultos accesibles), × al pasar el ratón, gestos,
                        #   atajos de teclado, estado vacío con botón, FLIP al reordenar
  state.ts              # removeTrack, restoreTrack, RemovedTrack
  state.test.ts         # NUEVO: eliminar y restaurar una canción con su transición personalizada
    transport.ts        # mini-player con un botón play/stop
    editor.ts           # usa sheet.ts; tirador; confirmación al soltar con cambios; animación entre transiciones
    dom.ts              # iconos nuevos si hacen falta (plus, play/stop redondos)
  main.ts               # cabecera con título grande que se reduce (IntersectionObserver)
  styles.css            # tokens nuevos, zonas seguras, lista agrupada, barras translúcidas, hoja, mini-player
```

---

## Plan de implementación

1. `npm install motion-dom@14.7.1 --save-exact`. `src/ui/motion.ts` con:
   - los springs de la tabla;
   - el detector de `prefers-reduced-motion`;
   - `pressFeedback(el)` sobre `press` de Motion;
   - un medidor de velocidad del puntero (últimos 100 ms).

   La app no cambia de aspecto. Se anota en la bitácora cuánto crece el bundle en `npm run build`.
2. `src/lib/gestures.ts` y sus tests:
   - la hoja se cierra al bajar el 30% de su alto, y también al bajar el 10% a 0,8 px/ms;
   - con `dirty: true`, los mismos casos devuelven `'confirm'`;
   - la hoja vuelve a su sitio al bajar el 10% a 0,1 px/ms;
   - deslizar 70 px muestra "Eliminar"; deslizar el 65% del ancho elimina; deslizar 20 px vuelve;
   - `reorderTargetIndex` devuelve el índice correcto al pasar el punto medio de la fila siguiente y de la anterior, y el índice de origen si no se pasa ninguno;
   - `rubberBand` da 0 para 0, crece siempre menos que el dedo y nunca pasa de `dimension` (al principio avanza a `RUBBER_BAND` por píxel del dedo).
3. `index.html` y `src/styles.css`: `viewport-fit=cover`, `theme-color`, tokens nuevos, zonas seguras, `dvh`, campos de 16 px, sin resaltado al tocar y `overscroll-behavior-y: contain`. Se borra el `@media (max-width: 599px)`. La app sigue funcionando igual.
4. `src/main.ts`, `index.html` y `src/styles.css`: nombre D-Mix en `<title>` y en la cabecera; cabecera con título grande, barra compacta translúcida al hacer scroll, interruptor Mix y botón "+".
5. `src/ui/transport.ts` y `src/styles.css`: mini-player con un botón play/stop y el estado en hasta dos líneas.
6. `src/ui/playlist.ts` y `src/styles.css`: lista agrupada; las flechas y la × pasan a `.visually-hidden`; × al pasar el ratón en escritorio; fondo iluminado al tocar; atajos `Alt+↑`/`Alt+↓` y `Supr`/`Retroceso`; estado vacío con botón "Añadir canciones".
7. `src/state.ts` + `src/ui/toast.ts` + `src/ui/playlist.ts`: `removeTrack` y `restoreTrack`, con un test en `src/state.test.ts` de que restaurar devuelve la canción a su índice y recupera la transición personalizada de su par. Toda eliminación muestra el aviso "Deshacer".
8. `src/ui/rowGestures.ts` + `src/ui/playlist.ts`: deslizar para eliminar, con el botón "Eliminar", la eliminación al deslizar del todo y una sola fila abierta a la vez.
9. `src/ui/rowGestures.ts` + `src/ui/playlist.ts`: tirador ≡ (levanta al instante) y pulsación larga en el resto de la fila; arrastre con `reorderTargetIndex`, desplazamiento automático cerca de los bordes y orden nuevo al soltar.
10. `src/ui/playlist.ts` + `src/ui/motion.ts`: animación de filas que aparecen, se quitan, se restauran y se reordenan (FLIP), y del aviso "Deshacer".
11. `src/ui/sheet.ts` + `src/ui/editor.ts`: la hoja se abre y se cierra con resorte; tirador; fondo bloqueado; botones de la barra de 44 pt. Se prueba ya en el iPhone que la apertura y el cierre se ven fluidos (riesgo del bug de `linear()` en Safari).
12. `src/ui/sheet.ts` + `src/ui/editor.ts`: arrastre para cerrar desde el tirador, la barra o el cuerpo con el scroll arriba (salvo en ondas, minimapas, puntos y curvas). Al soltar, el resorte sigue con la velocidad del dedo. Con cambios, resistencia con `rubberBand`, rebote y "¿Descartar cambios?". `Esc` y "Atrás" de Android (`cancel`) siguen el mismo camino.
13. `src/ui/editor.ts` + `src/ui/motion.ts`: animación al cambiar a la transición anterior o siguiente.
14. `pressFeedback` en botones, chips y presets.
15. `src/main.ts`: aviso `beforeunload` cuando hay canciones en la playlist.
16. Verificación con Playwright o Chrome DevTools en 390 × 844, 844 × 390 y 412 × 915 (Android, con emulación táctil), y prueba manual en un iPhone real con Safari (`npm run dev -- --host` en la red local, o GitHub Pages tras el merge). Los valores de las constantes que se ajusten se anotan en la bitácora.

---

## Criterios de aceptación

- [x] `npm test` pasa, incluidos los tests nuevos de `src/lib/gestures.test.ts`.
- [x] `npm run build` pasa.
- [x] A 390 × 844 no hay scroll horizontal en la playlist ni en el editor.
- [x] A 844 × 390 (horizontal) se pueden usar la playlist, el mini-player y el editor, y nada queda bajo la muesca.
- [x] En el iPhone, la cabecera queda bajo la barra de estado y el mini-player sobre la barra de inicio, sin solaparse.
- [x] La pestaña del navegador y la cabecera dicen "D-Mix"; no queda "Mixer" visible en la interfaz.
- [x] Al hacer scroll en la playlist, el título grande "D-Mix" se convierte en la barra compacta translúcida, y vuelve al subir.
- [x] El interruptor Mix y el botón "+" están en la barra y el "+" abre el selector de archivos.
- [x] Con la playlist vacía se ven "Sin canciones" y el botón "Añadir canciones", que abre el selector de archivos.
- [x] En escritorio se pueden seguir arrastrando archivos a la ventana.
- [x] Las filas no muestran flechas ni × en el móvil; cada una muestra un tirador ≡ tenue a la derecha.
- [x] En escritorio, al pasar el ratón por una fila aparece una × que la quita.
- [x] Con VoiceOver (o el árbol de accesibilidad en DevTools), cada fila ofrece los botones "Subir", "Bajar" y "Quitar".
- [x] Tocar una fila ilumina su fondo y no la encoge.
- [x] Deslizar una fila a la izquierda muestra "Eliminar" en rojo; tocarlo quita la canción.
- [x] Deslizar una fila más del 60% de su ancho la quita sin tocar "Eliminar".
- [x] Tocar fuera de una fila con "Eliminar" visible la cierra sin quitar nada.
- [x] Abrir "Eliminar" en una fila cierra el de otra que estuviera abierto.
- [x] Al quitar una canción por cualquier vía aparece "Canción eliminada · Deshacer" sobre el mini-player y desaparece a los 5 s.
- [x] "Deshacer" devuelve la canción a su posición, con su BPM y con la transición personalizada que tenía con la siguiente.
- [x] Quitar dos canciones seguidas deja solo el aviso de la segunda.
- [x] Arrastrar el tirador ≡ levanta la fila al instante y la reordena.
- [x] Mantener presionada una fila 350 ms la levanta; arrastrarla y soltarla cambia el orden en la playlist y en las transiciones.
- [x] Mover el dedo más de 8 px antes de 350 ms hace scroll y no levanta la fila.
- [x] Con una fila enfocada, `Alt+↑` y `Alt+↓` la mueven y `Supr` la quita.
- [x] Al añadir, quitar o reordenar canciones, las filas se animan y las demás se desplazan sin saltos.
- [x] Todos los botones, chips, filas, tiradores y selects miden 44 × 44 px de objetivo táctil como mínimo.
- [x] Tocar el campo BPM o un select en el iPhone no hace zoom.
- [x] El mini-player muestra el estado en hasta dos líneas y un botón que alterna entre play y stop.
- [x] El botón del mini-player está deshabilitado cuando `mixBlocker` devuelve un motivo, y el motivo se lee en la línea de estado.
- [x] El editor se abre subiendo con resorte y el fondo se oscurece con fundido.
- [x] Con la hoja abierta, la playlist de fondo no hace scroll.
- [x] Deslizar el tirador o la barra hacia abajo más del 25% del alto cierra la hoja; menos, la devuelve a su sitio.
- [x] Un deslizamiento rápido y corto hacia abajo cierra la hoja.
- [x] Al soltar la hoja a mitad de un movimiento rápido, sigue moviéndose a la misma velocidad, sin frenarse ni saltar (prueba manual en el iPhone).
- [x] Agarrar la hoja mientras se anima la detiene bajo el dedo, sin saltar.
- [x] Con el scroll del cuerpo arriba, deslizar hacia abajo desde una zona sin edición cierra la hoja.
- [x] Arrastrar una onda, un minimapa, un punto de transición o un punto de curva nunca mueve la hoja.
- [x] Con cambios sin guardar, la hoja baja con resistencia al arrastrarla y, al soltar, vuelve a su sitio y muestra "¿Descartar cambios?".
- [x] `Esc` y el botón de cerrar siguen funcionando, con la misma confirmación.
- [x] Anterior y siguiente deslizan el contenido del editor en la dirección correspondiente.
- [x] Los botones, chips y presets se encogen al presionarlos y vuelven al soltar.
- [x] Con "Reducir movimiento" activado, no hay desplazamientos ni resortes: solo fundidos o cambios instantáneos.
- [x] En el iPhone, las animaciones de la hoja y de la lista se ven fluidas, sin tirones visibles (prueba manual).
- [x] A 412 × 915 con emulación táctil de Chrome, deslizar para eliminar, pulsación larga, arrastre de la hoja y mini-player funcionan igual que a 390 × 844.
- [x] Deslizar hacia abajo con la playlist arriba del todo no recarga la página en Chrome para Android (emulación).
- [x] Mantener presionada una fila no abre el menú contextual ni selecciona texto.
- [x] El evento `cancel` del `<dialog>` (Atrás de Android, `Esc`) cierra la hoja con animación, o rebota y pregunta si hay cambios.
- [x] El bundle crece menos de 25 kB comprimido respecto a antes de esta spec (`npm run build`).
- [x] Con canciones en la playlist, recargar o cerrar la pestaña en un navegador de escritorio muestra el aviso del navegador; con la playlist vacía no aparece.
- [x] En escritorio la app se ve como una columna centrada y la hoja queda centrada con 480 px de ancho.
- [x] La preview, "Reproducir mezcla" y todas las funciones de las SPEC 01–05 siguen funcionando igual.
- [x] Ningún color está hardcodeado fuera de `src/styles.css`.

**Revisión de UX** (añadidos tras revisar la app con Playwright a 390, 375 y 320 px, a pedido del usuario):

- [x] Las filas Duración, Volumen, EQ, Filtro, Efectos y Looping del editor tienen la misma estructura: etiqueta (y "Personalizar") arriba y el selector a todo el ancho debajo, dentro de una tarjeta con la sección "Ajustes".
- [x] Los presets están bajo un título de sección "Preset".
- [x] En Personalizar, una barra bajo las ondas dice qué carril se edita, cómo editarlo y ofrece "Restablecer curva" y "Listo".
- [x] Los avisos y errores de la transición aparecen debajo de las ondas, con icono, y no al final del editor.
- [x] "¿Descartar cambios?" aparece como hoja de acciones de iOS desde abajo; tocar fuera equivale a "Seguir editando".
- [x] Tocar "siguiente" o "anterior" varias veces seguidas termina en la transición pedida y el contenido queda en su sitio, opaco y sin desplazamiento.
- [x] Con un BPM faltante, el editor muestra el botón "Escribir BPM", que abre el popover de BPM.
- [x] El popover de BPM entra con una animación, tiene "Listo" y se cierra al hacer scroll en el editor.
- [x] El BPM de cada canción del editor se ve como un botón (fondo de pastilla).
- [x] Si algo bloquea la mezcla, el mensaje del mini-player lleva "›" y tocarlo abre la transición que hay que arreglar.
- [x] Una canción que no se pudo leer muestra un solo texto en rojo ("No se pudo leer"), el detalle en gris y un botón "Quitar".
- [x] "Leyendo archivo…" y "Detectando BPM…" llevan un indicador de actividad.
- [x] El chip de transición lleva un icono; en "Revisar" es un aviso.
- [x] El texto blanco de "Eliminar" tiene un contraste de al menos 4,5:1.

---

## Decisiones

- **Sí:** dos specs, esta para la interfaz y la SPEC 10 para la PWA (confirmado por el usuario). Así cada una se revisa y se prueba por separado.
- **Sí:** la app se llama D-Mix (confirmado por el usuario). Une la inicial de Diego con "mix" y coincide con la ruta `/d-mixer/`.
- **No:** renombrar el repo, `package.json` o la ruta de GitHub Pages. Es una prueba local y no aporta nada visible.
- **Sí:** ajustes tras una revisión de UX con Playwright (a pedido del usuario). Las filas de carriles se partían de forma distinta según el largo del texto, "Listo" quedaba lejos de la curva, el aviso de tono quedaba al final y la confirmación tenía un botón invisible.
- **Sí:** "Restablecer curva" pasa de la fila del carril a la barra de edición bajo las ondas. Sigue reseteando solo el carril que se edita y conserva su texto (SPEC 02 y SPEC 04).
- **Sí:** filas de ajustes en dos líneas (etiqueta arriba, selector debajo). En una línea no caben etiqueta, selector y "Personalizar" a 320 px.
- **No:** presets en una fila con scroll horizontal. La SPEC 05 pide los 10 visibles a 375 px.
- **Sí:** hoja de acciones de iOS para "¿Descartar cambios?", con los mismos textos que pide la SPEC 02.
- **Sí:** número 09, para no mover el roadmap reservado (03, 06, 07 y 08) (confirmado por el usuario).
- **Sí:** patrones de iOS con la identidad propia: tema oscuro y verde (confirmado por el usuario).
- **No:** iOS puro con azul de sistema y modo claro. Se pierde la identidad de la app.
- **No:** Liquid Glass de iOS 26. `backdrop-filter` en muchas capas cuesta rendimiento en Safari; solo se usa en las dos barras.
- **Sí:** un solo diseño para móvil y escritorio (confirmado por el usuario). Es menos CSS y la app es móvil primero.
- **Sí:** el editor es una hoja modal con gesto (confirmado por el usuario). Se parece a lo que ya hay al 92% del alto.
- **No:** pantalla completa con "Atrás". El editor es una tarea modal con guardar y descartar, que en iOS va en una hoja.
- **Sí:** se mantiene `<dialog>` con `showModal()`. Ya atrapa el foco, maneja `Esc` y el `::backdrop`.
- **Sí:** cerrar deslizando desde el tirador, la barra o el cuerpo con el scroll arriba, nunca desde zonas de edición (confirmado por el usuario). Así no choca con arrastrar ondas, puntos y curvas.
- **Sí:** con cambios sin guardar la hoja rebota y pregunta (confirmado por el usuario). Respeta la regla actual de guardar a mano.
- **No:** guardar al deslizar. Cambiaría la regla de guardado de la SPEC 01.
- **Sí:** deslizar para eliminar y mantener presionado para arrastrar (confirmado por el usuario).
- **Sí:** aviso "Deshacer" de 5 s al eliminar (confirmado por el usuario). Quitar una canción por un roce pierde el archivo cargado y sus transiciones. Restaurar es barato porque las transiciones siguen en el mapa.
- **No:** eliminar sin deshacer, como Mail de iOS. Mail tiene "agitar para deshacer"; aquí no habría forma de recuperar la canción.
- **Sí:** tirador ≡ visible y × al pasar el ratón en escritorio (confirmado por el usuario). Los gestos ocultos no se descubren solos y con ratón no habría forma visible de quitar ni reordenar.
- **Sí:** botones "Subir", "Bajar" y "Quitar" ocultos a la vista pero accesibles (confirmado por el usuario). VoiceOver y TalkBack no pueden deslizar ni mantener presionado.
- **Sí:** las filas se iluminan al tocarlas en lugar de encogerse (confirmado por el usuario). Es lo que hace iOS, y encogerlas chocaría con deslizar y arrastrar.
- **Sí:** estado del mini-player en hasta dos líneas (confirmado por el usuario). Los avisos de bloqueo dicen qué hacer al final del texto.
- **Sí:** resistencia al arrastrar la hoja con cambios sin guardar (confirmado por el usuario). Avisa con el gesto mismo que no se va a cerrar, como en iOS.
- **No:** modo "Editar" con tiradores. Es un paso más para algo que los gestos ya resuelven.
- **Sí:** atajos de teclado para mover y quitar filas. Las flechas desaparecen y el teclado necesita otra forma de hacerlo.
- **Sí:** mini-player inferior con un solo botón (confirmado por el usuario).
- **No:** progreso y canción actual en el mini-player. Hay que sacar la posición de la mezcla del motor de audio, así que crece el alcance.
- **Sí:** las cuatro animaciones: hoja, filas, pulsar y cambio de transición (confirmado por el usuario).
- **Sí:** el motor de Motion (confirmado por el usuario, tras comparar alternativas). Da resortes con velocidad inicial e interrupción, que es lo que hace que un gesto se sienta como iOS.
- **Sí:** `JSAnimation` de `motion-dom` en lugar de `animate` de `"motion"` (confirmado por el usuario durante la implementación). `animate` + `press` pesan 25,9 kB comprimido y no cabían en el límite de 25 kB; con `motion-dom` son 8,8 kB. Es el mismo motor y además evita WAAPI y el bug de `linear()` en Safari. Su API está menos documentada, así que la versión se fija exacta.
- **No:** `motion/mini`. Pesa 3,3 kB, pero no acepta `velocity`.
- **Sí:** resortes por física y no por `duration`/`bounce`. Motion 14 ignora la velocidad inicial en los resortes definidos por tiempo.
- **Sí:** `press` de Motion para el efecto al tocar. Ya resuelve puntero, cancelación y teclado.
- **Sí:** gestos propios con Pointer Events. Motion no tiene arrastre fuera de React y los gestos no deben chocar con los arrastres del editor.
- **No:** solo nativo (animaciones del navegador + resorte en `linear()`). Habría que escribir a mano el resorte, el paso de velocidad y la interrupción (unas 100 a 150 líneas delicadas). Además hay un bug de WebKit (abril de 2026) sobre resortes con `linear()` que pierden cuadros en Safari 26.
- **No:** GSAP, aunque ahora Flip, Draggable e Inertia son gratis. Pesa más (unos 27 kB comprimido solo el núcleo, según fuentes de terceros), usa curvas que imitan resortes en lugar de física de resorte, y Draggable se sumaría a los arrastres propios del editor.
- **No:** View Transitions para las animaciones. No se pueden interrumpir ni guiar con el dedo, y solo cubrirían el cambio entre transiciones.
- **No:** `animateView` ni las animaciones de layout de Motion. Las de layout son solo de React; para las filas se usa FLIP a mano con el `animate` propio de `motion.ts`.
- **Sí:** compatible con Chrome en Android con el mismo diseño, verificado en emulación (confirmado por el usuario). La app la usarán también personas con Android; las diferencias del sistema (Atrás, deslizar para recargar, pulsación larga) se cubren sin un diseño aparte.
- **Sí:** aviso `beforeunload` al recargar o cerrar con canciones cargadas (confirmado por el usuario tras probar en el iPhone). Es lo mínimo mientras la playlist no se guarde (SPEC 08).
- **No:** texto propio en el aviso. Los navegadores ignoran los mensajes personalizados y muestran el suyo.
- **No:** diseño Material para Android. Habría que mantener dos estilos y la app es una sola.
- **Sí:** funciones puras en `src/lib/gestures.ts`. Las decisiones de los gestos se prueban con Vitest, como el resto de `lib/`.
- **No:** vibración háptica (confirmado por el usuario). Safari en iPhone no soporta `navigator.vibrate` y el truco del switch no está documentado.
- **Sí:** `<select>` nativos (confirmado por el usuario). iOS ya muestra su propio menú y son accesibles.
- **Sí:** título grande que se reduce a barra compacta (confirmado por el usuario).
- **Sí:** estado vacío con botón "Añadir canciones" (confirmado por el usuario). En el iPhone no se pueden arrastrar archivos.
- **Sí:** diseño para vertical; horizontal usable sin diseño especial (confirmado por el usuario).
- **Sí:** verificar con emulación y en un iPhone real (confirmado por el usuario). Los gestos y la fluidez en Safari no se pueden comprobar solo con emulación.
- **Sí:** constantes de gestos como valores iniciales, ajustables tras probar en el iPhone.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El arrastre para cerrar la hoja choca con el scroll del cuerpo | Solo se activa con `scrollTop === 0` y movimiento hacia abajo; el eje se decide tras `GESTURE_SLOP`. |
| El arrastre para cerrar choca con ondas, puntos y curvas | Se ignora cualquier `pointerdown` dentro de `.stage-view`, `.minimap`, `.lane-hit`, `.curve-point` y `.curve-handle`. Está en los criterios. |
| La pulsación larga choca con el scroll de la lista y con el menú contextual de iOS | Se cancela si el dedo se mueve más de `GESTURE_SLOP` antes de 350 ms. `-webkit-touch-callout: none` y `user-select: none` en las filas. |
| Deslizar para eliminar choca con el gesto de "atrás" del borde de Safari | El deslizamiento se decide por eje y solo hacia la izquierda; el borde izquierdo queda libre. |
| `backdrop-filter` va lento en iPhones antiguos | Solo dos barras lo usan. Si se nota en la prueba manual, se cambia por el fondo opaco `--bg` y se anota en la bitácora. |
| Animar la altura al quitar una fila provoca tirones | Es la única animación de layout, dura 250 ms y solo afecta a una fila. |
| "Deshacer" tras cambios en la playlist reinserta la canción en un índice que ya no existe | `restoreTrack` limita el índice al largo de la lista. Solo se guarda la última eliminación. |
| El tirador ≡ y deslizar para eliminar compiten en la misma fila | El tirador captura su propio `pointerdown` y nunca inicia el deslizamiento; deslizar solo empieza fuera del tirador. |
| El aviso "Deshacer" tapa el contenido sobre el mini-player | Se descarta deslizándolo hacia abajo y la lista reserva espacio inferior mientras está visible. |
| iOS hace zoom al enfocar campos de menos de 16 px | Campos y selects a 16 px como mínimo; está en los criterios. |
| `100vh` en Safari incluye la barra de direcciones y corta la hoja | Se usa `dvh` en todas las alturas. |
| Motion aumenta el tamaño del bundle | Se importan solo `JSAnimation` y `press` de `motion-dom`: el bundle crece 13,4 kB comprimido. El límite de 25 kB está en los criterios. |
| La API de `motion-dom` cambia en una versión nueva | Versión exacta fijada (14.7.1). Todo el uso está aislado en `src/ui/motion.ts`. |
| Los resortes se ven a tirones en Safari 26 por el bug de `linear()` | Mitigado: `JSAnimation` corre en JavaScript y no usa `linear()`. Igual se prueba la fluidez en el iPhone. |
| En Chrome para Android, deslizar hacia abajo con la lista arriba recarga la página y borra la playlist | `overscroll-behavior-y: contain` en `html`, `body` y el cuerpo de la hoja. Está en los criterios. |
| En Android la pulsación larga abre el menú contextual o selecciona texto | `contextmenu` cancelado en las filas y `user-select: none`. Está en los criterios. |
| El gesto "Atrás" de Android desde los bordes impide empezar un deslizamiento pegado al borde | Es del sistema y no se puede evitar. Deslizar para eliminar funciona empezando desde cualquier punto de la fila. |
| Safari en iOS no muestra el aviso `beforeunload` | Se acepta: en iPhone el deslizar para recargar ya está bloqueado y guardar la playlist llega con la SPEC 08. |
| "Atrás" de Android con la hoja cerrada sale de la app y pierde la playlist | Fuera de alcance: depende de guardar el proyecto (SPEC 08). Se anota en la bitácora. |
| Teléfonos Android económicos van lentos con `backdrop-filter` y resortes | Mismo plan que con iPhones antiguos: fondo opaco si se nota. Solo se animan `transform` y `opacity`. |
| El `<dialog>` nativo cierra sin animación con `Esc` | Se intercepta el evento `cancel` (ya se hace hoy) y se cierra con la animación de `sheet.ts`. |
| Una fila arrastrada fuera de la pantalla no permite llegar al final de una lista larga | Desplazamiento automático de la lista cuando la fila está a menos de 48 px del borde. |
| El bloqueo del scroll del fondo falla en Safari | `overflow: hidden` en `html` y `body` mientras la hoja está abierta, y `overscroll-behavior: contain` en el cuerpo de la hoja. |

---

## Lo que **no** entra en esta spec

- PWA: manifest, iconos, service worker, uso sin conexión e instalación (SPEC 10).
- Audio en iOS: interruptor de silencio, segundo plano y pantalla bloqueada (SPEC 10).
- Vibración háptica.
- Diseño Material para Android y prueba en un Android real.
- Evitar que "Atrás" con la hoja cerrada salga de la app (SPEC 08).
- Menús o action sheets propios en lugar de `<select>`.
- Diseño especial en horizontal para el editor.
- Mini-player con canción actual o progreso.
- Deslizar entre transiciones con el dedo.
- Deshacer más de una eliminación o reordenamientos.
- Modo claro.
- Migrar la UI a un framework.

Cada uno, si llega, va en su propia spec.
