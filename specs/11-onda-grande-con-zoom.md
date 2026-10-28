# SPEC 11 — Editor de transición al estilo Spotify, con onda grande y zoom

> **Estado:** Implementado
> **Depende de:** SPEC 01, SPEC 02, SPEC 09
> **Fecha:** 2026-10-28
> **Objetivo:** Rehacer el editor de transición para que se vea y se use como el de Spotify Mix (pantalla completa, ondas de borde a borde, pastilla de compases y hojas de opciones por carril) y añadir zoom horizontal para encajar el beat con precisión.

---

## Por qué existe esta spec

Tras probar la SPEC 09 en el iPhone, el usuario pidió "poder ver la onda en formato grande como Spotify lo hace, así encajo mejor el beat en la transición". Después aportó **10 capturas del editor de Spotify Mix en iPhone** (2026-10-28) y pidió parecerse lo más posible en tamaño de pantalla, tamaño de las ondas y controles que abren submenús, en lugar de tenerlos todos en la pantalla principal.

Hoy hay tres límites en las ondas:

- **La ventana ocupa el 60% del ancho** (`WINDOW_FRACTION` en `src/ui/waveform.ts`). Con 8 compases a 390 px cada beat mide unos 7 px, y con 16 compases unos 3,6 px.
- **El escenario mide 220 px** (260 px en escritorio) y queda 16 px adentro de cada borde.
- **Cada canción guarda 2000 picos** (`PEAK_BINS` en `src/audio/loader.ts`): uno cada 0,12 s en un tema de 4 min. Con zoom, la onda se vería en escalones.

**Medidas de las capturas** (iPhone de 393 × 852 pt; las capturas tienen unos 2,34 px por punto):

| | Spotify Mix | D-Mix antes de esta spec |
| --- | --- | --- |
| Editor | Pantalla completa | Hoja con margen y tirador arriba |
| Barra superior | Una fila: ✕ en un círculo, "Beta" y "Save" en verde | Dos filas: ✕, título, Guardar; ↶ ↷ y ‹ › |
| Ancho de las ondas | De borde a borde | 16 px de margen a cada lado |
| Ventana | 286 pt de ancho, el 73% de la pantalla | El 60% de 358 px: 215 px |
| Alto del escenario | 301 pt, el 35% de la pantalla | 220 px |
| Ondas dentro del escenario | 6% de margen, 41% cada onda, 6% entre ellas | 40% cada onda, 20% entre ellas |
| Duración | Pastilla "8 bars ▾" en el borde inferior que abre una hoja | Select en la tarjeta de Ajustes |
| Carriles | Filas "Volume — Overlap ▾" que abren una hoja con la lista y ✓ | Selects nativos en una tarjeta |
| Presets | "Presets" entre dos líneas y una fila con scroll horizontal | Rejilla con los 10 visibles |

**Qué se toma de Spotify y qué no:**

| Lo que hace Spotify Mix | Destino |
| --- | --- |
| Pantalla completa, ondas de borde a borde, escenario del 35% y ventana del 72% | Entra (confirmado por el usuario) |
| Barra superior de una fila | Entra; ↶ ↷ y ‹ ›, que Spotify no tiene, bajan a una barra inferior (confirmado por el usuario) |
| Atenúa solo lo que no suena, sin marco en cada onda y con la rejilla dentro del panel | Entra (confirmado por el usuario) |
| Pastilla de compases con una hoja de botones | Entra, con 1 compás además (confirmado por el usuario) |
| Botón de reproducir gris entre las ondas, que baja al borde con una hoja abierta | Entra (confirmado por el usuario) |
| Flechas de nudge solo en la onda que se acaba de tocar | Entra (confirmado por el usuario) |
| Minimapas en lugar de las cabeceras mientras se toca una onda | Entra (confirmado por el usuario) |
| Filas de carriles que abren hojas con la lista y ✓; las hojas se pasan deslizando; ondas arriba mientras se elige | Entra (confirmado por el usuario) |
| "Customize" en la hoja del carril y "Custom ✓" en la lista | Entra, con ↶ ↷ en la hoja (confirmado por el usuario) |
| Presets en una fila con scroll y "Custom" primero | Entra; "Personalizado" solo indica (confirmado por el usuario) |
| Puntos de Personalizar como anillos | Entra (confirmado por el usuario) |
| Onda rellena de 3 colores por frecuencia (azul graves, naranja medios, blanco agudos), como la 3Band de rekordbox | No (decidido por el usuario) |
| Carátula, artista y tonalidad Camelot en las cabeceras | No: las cabeceras quedan como hoy (decidido por el usuario); carátulas y tonalidad en la SPEC 06 |

**Lo que no muestran las capturas:** botones de zoom ni pellizco. Spotify abre el editor ya ampliado sobre el punto de mezcla y en escritorio hace zoom con la rueda (AbsoluteGeeks). Las ondas se mueven con snap y nudge de 10 ms (Johannes Giani). En la comunidad de Spotify piden que el zoom no vaya atado a los compases, porque uno se pierde dentro de la canción. djay para iOS tiene 7 niveles de zoom con − / +.

Origen de lo que no sale de las capturas:

| Decisión | Origen |
| --- | --- |
| Zoom con pellizco y botones − / + | Botones como djay; pellizco, patrón táctil de iOS (confirmado por el usuario) |
| Zoom con Ctrl/⌘ + rueda o pellizco del trackpad en escritorio | Spotify Mix en escritorio usa la rueda (confirmado por el usuario) |
| Un dedo mueve la canción y dos dedos navegan | Propio (confirmado por el usuario) |
| Límites: de la vista completa a 2 beats a lo ancho | Propio (confirmado por el usuario) |
| Indicador de scroll fino que se desvanece | HIG de Apple, scroll views (confirmado por el usuario) |
| Siempre se empieza en la vista completa | Propio; Spotify abre ya ampliado (confirmado por el usuario) |
| Picos finos de 5 ms calculados al cargar | Propio (confirmado por el usuario) |
| Barra inferior con ↶ ↷ y ‹ › | Propio, patrón de barra de herramientas de iOS (confirmado por el usuario) |

Referencias:

- Capturas del editor de Spotify Mix en iPhone aportadas por el usuario (10 imágenes, 2026-10-28).
- [AbsoluteGeeks — I turned my Spotify playlists into seamless DJ sets](https://www.absolutegeeks.com/reviews/i-turned-my-spotify-playlists-into-seamless-dj-sets-with-one-feature/)
- [Johannes Giani — Custom song transitions with Spotify Mix](https://www.johannesgiani.de/en/blog/custom-song-transitions-with-spotify-mix/)
- [Spotify Community — Zoom out waveforms regardless of number of bars in mix feature](https://community.spotify.com/t5/Live-Ideas/Zoom-out-waveforms-regardless-of-number-of-bars-in-mix-feature/idi-p/7361648)
- [Algoriddim — djay para iOS: Zoom](https://help.algoriddim.com/user-manual/djay-ios/mixing-basics/zoom)
- [rekordbox — DJing features (onda 3Band)](https://rekordbox.com/en/feature/djing/)
- [Apple — Human Interface Guidelines: Scroll views](https://developer.apple.com/design/human-interface-guidelines/scroll-views)
- [Apple — Human Interface Guidelines: Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)
- [MDN — `GestureEvent` (solo Safari)](https://developer.mozilla.org/en-US/docs/Web/API/GestureEvent)

---

## Alcance

**Entra:**

- **Editor a pantalla completa** (confirmado por el usuario):
  - En el móvil ocupa toda la pantalla, sin margen ni tirador arriba ni esquinas redondeadas.
  - Se sigue abriendo desde abajo con resorte.
  - Se sigue cerrando deslizando hacia abajo desde la barra superior, o desde el cuerpo con el scroll arriba, con la resistencia y la confirmación de la SPEC 09 si hay cambios.
  - En escritorio sigue centrado con 480 px de ancho, pero a toda la altura.
- **Barra superior de una fila** (confirmada por el usuario):
  - ✕ en un círculo a la izquierda; "1 de 3" como chip en el centro, donde Spotify pone "Beta"; "Guardar" en verde a la derecha.
  - El chip es el título del editor: se anuncia como "Transición 1 de 3" y recibe el foco al abrir, como hoy el título.
- **Barra inferior** (confirmada por el usuario):
  - Fija abajo, sobre la zona segura, con ↶ ↷ a la izquierda y ‹ › a la derecha.
  - Mismos botones, atajos y comportamiento que hoy (SPEC 02 y SPEC 09).
- **Orden del cuerpo:** cabecera de A, escenario, cabecera de B, avisos, Presets y filas de carriles.
- **Cabeceras como hoy** (decidido por el usuario): nombre y punto ("Sale en…", "Entra en…") a la izquierda; BPM tocable y duración a la derecha. Cada cabecera reserva 56 px de alto para que el minimapa ocupe su sitio sin mover nada.
- **Minimapas en lugar de las cabeceras** (confirmado por el usuario):
  - Normalmente no se ven.
  - Al tocar o arrastrar una onda, el minimapa de A aparece con un fundido en lugar de la cabecera de A y el de B en lugar de la de B.
  - Miden 56 px de alto, el alto de la cabecera.
  - Mientras se ven, se pueden tocar y arrastrar como hoy, y eso los mantiene visibles.
  - Se ocultan 2 s después de soltar y vuelven las cabeceras.
  - Con una hoja de carril abierta no aparecen.
- **Escenario como Spotify** (confirmado por el usuario):
  - Va de borde a borde de la pantalla (dentro de las zonas seguras laterales).
  - `height: clamp(220px, 35dvh, 520px)`: unos 295 px en un iPhone de 844 px de alto y 220 px en horizontal. Desaparece la regla de 260 px de escritorio.
  - `WINDOW_FRACTION` pasa de 0,6 a 0,72: la ventana ocupa el 72% central y queda un 14% de contexto a cada lado. A 390 px mide 281 px; sin zoom, cada beat mide 8,8 px con 8 compases.
  - Proporciones verticales: 6% de margen arriba, la onda de A en el 41% del alto, 6% entre las ondas, la onda de B en el 41% y 6% de margen abajo.
- **Dibujo** (confirmado por el usuario):
  - A se dibuja con `--wave` hasta el final de la ventana y con `--wave-dim` después.
  - B se dibuja con `--wave-dim` antes del inicio de la ventana y con `--wave` desde ahí.
  - Las repeticiones del loop (SPEC 05) siguen atenuadas.
  - No se dibuja un marco en cada onda: la ventana es solo el panel `--surface-raised` de fondo.
  - La rejilla solo se dibuja dentro del panel.
  - La línea de cada compás de A (cada 4 beats desde el primer beat detectado) usa el color nuevo `--bar-line`, más marcado que `--beat-line`. Se dibuja si los compases quedan a 5 px o más entre sí; las de beat siguen con su regla de 5 px.
  - Las ondas siguen siendo barras de un color (decidido por el usuario).
- **Picos finos** (confirmado por el usuario):
  - Al leer una canción se calculan picos cada 5 ms (200 por segundo): unos 190 KB por canción de 4 min.
  - Los 2000 picos actuales se obtienen de los finos, así que las muestras se recorren una sola vez.
  - El escenario dibuja con los finos y los minimapas siguen con los 2000.
  - Cada barra muestra el pico más alto del tramo que cubre, así que con poco zoom no se pierden golpes.
- **Botones del escenario** (confirmados por el usuario):
  - **Reproducir:** pastilla gris de 48 × 32 px con el icono blanco, centrada en la franja entre las dos ondas.
  - **Fila del borde inferior:** "−" a la izquierda, la pastilla "8 compases ▾" ("1 compás ▾" con 1) en el centro y "+" a la derecha. Los tres quedan mitad dentro y mitad fuera del borde inferior.
  - **Flechas de nudge ‹ ›:** solo en la onda que se toca o arrastra; las de la otra se ocultan. Se ocultan 3 s después del último uso (soltar la onda o tocar una flecha). En escritorio aparecen también al pasar el ratón o enfocar esa onda. Al abrir el editor no se ve ninguna.
  - Todos comparten estilo: esquinas de 10 px, fondo `--stage-pill`, texto o icono blanco y 44 × 44 px de área táctil.
- **Hoja de compases** (confirmada por el usuario):
  - La pastilla abre una hoja desde abajo, a todo el ancho y con tirador, titulada "Compases".
  - Tiene una fila de 5 botones iguales: "1", "2", "4", "8" y "16". El elegido va en blanco con texto oscuro. Debajo dice "Elige cuánto dura la transición.".
  - Cada botón aplica la duración al momento y reinicia la preview. La hoja queda abierta para comparar.
  - No oscurece el resto: las ondas siguen visibles arriba.
  - Se cierra tocando fuera de ella, deslizándola hacia abajo o con `Esc`. El toque que la cierra no actúa sobre lo que hay debajo.
- **Presets** (confirmado por el usuario):
  - Título "Presets" centrado entre dos líneas finas.
  - Una fila con scroll horizontal, de borde a borde, con botones de 42 × 83 px: "Personalizado", "✦ Auto" y los 9 presets en el orden de hoy.
  - El elegido va en blanco con texto oscuro.
  - "Personalizado" solo indica: se ve elegido cuando la transición no coincide con ningún preset, y desactivado cuando coincide.
  - Deja sin efecto el criterio de la SPEC 05 de ver los 10 presets a 375 px sin scroll.
- **Filas de carriles** (confirmadas por el usuario):
  - Volumen, EQ, Filtro, Efectos y Looping, una fila de 50 px cada uno, sin tarjeta de fondo.
  - Cada fila lleva una barra del color del carril de 3 × 15 px, el nombre a la izquierda y el estilo en gris con "▾" a la derecha. Con una curva propia, el estilo dice "Personalizada".
  - Desaparecen los `<select>`, los botones "Personalizar" de las filas, la fila Duración y el título "Ajustes".
- **Hojas de carril** (confirmadas por el usuario):
  - Al tocar una fila se abre la tarjeta de ese carril desde abajo, con 18 px de margen a cada lado y radio de 13 px.
  - La tarjeta tiene tirador; una cabecera con la barra de color, el nombre y "Personalizar" en verde a la derecha (Looping no tiene "Personalizar"); y la lista de estilos en filas de 50 px con una ✓ verde en el elegido.
  - Tocar un estilo lo aplica al momento y reinicia la preview. La tarjeta queda abierta.
  - Las tarjetas de los carriles vecinos asoman a los lados. Se pasa a otra deslizando en horizontal o tocando la que asoma.
  - Se cierra deslizando hacia abajo o con `Esc`.
- **Modo hoja** (confirmado por el usuario). Mientras una tarjeta de carril está abierta:
  - se ocultan la barra superior, la barra inferior, las cabeceras y los avisos;
  - el escenario sube arriba del todo, bajo la zona segura, y la tarjeta ocupa desde debajo del escenario hasta el final de la pantalla;
  - solo se dibuja la curva del carril de esa tarjeta; con Looping no se dibuja ninguna curva y se mantienen las marcas ↺;
  - la pastilla de compases se oculta y reproducir baja al centro del borde inferior, entre "−" y "+";
  - las ondas se siguen pudiendo arrastrar y ampliar.
- **Personalizar desde la hoja** (confirmado por el usuario):
  - "Personalizar" en la cabecera de la tarjeta entra en el modo de la SPEC 02 para ese carril: aparecen los puntos sobre su curva.
  - Mientras se personaliza, la cabecera muestra ↶ ↷ y "Listo" en lugar de "Personalizar", y debajo la ayuda "Arrastra los puntos. Doble toque para añadir o quitar uno.".
  - Si la curva cambia, "Personalizada ✓" aparece primera en la lista.
  - Tocar cualquier estilo, incluido el de antes, reemplaza la curva. Esto sustituye al botón "Restablecer curva" de las SPEC 02, 04 y 09.
  - "Listo" o cerrar la tarjeta salen de Personalizar.
  - El aviso "Máximo 32 puntos por curva" se muestra bajo la ayuda.
  - Desaparece la barra de edición bajo las ondas.
  - Los puntos pasan a ser anillos del color del carril con relleno oscuro; el que se arrastra se rellena del color del carril.
- **Zoom horizontal del escenario** (confirmado por el usuario):
  - El nivel 1 es la "vista completa": la ventana en el 72% central y un 14% de contexto a cada lado.
  - El máximo es 2 beats de A a lo ancho: unos 195 px por beat a 390 px. Depende de la duración: ×2,8 con 1 compás, ×22 con 8 y ×44 con 16.
  - Solo es horizontal. Las dos ondas se amplían y se recorren juntas, porque comparten el eje de tiempo de la mezcla.
  - La vista nunca sale del rango de la vista completa.
- **Gestos táctiles** (confirmados por el usuario):
  - Un dedo sobre una onda la mueve como hoy, con snap al beat. Con zoom, el mismo recorrido mueve menos tiempo.
  - Pellizcar con dos dedos en cualquier punto del escenario cambia el zoom con el punto medio entre los dedos fijo.
  - Deslizar con dos dedos recorre la vista. Pellizcar y recorrer pueden ir a la vez.
  - Si un dedo ya estaba moviendo una canción y se apoya el segundo, la canción vuelve a donde estaba y empieza el pellizco. Ese movimiento no queda en el historial.
  - Al levantar uno de los dos dedos no se reanuda el arrastre. El gesto termina cuando se levantan todos.
  - Los gestos de dos dedos no hacen zoom en la página ni mueven el editor.
- **Un arrastre de onda cuenta como un paso del historial.** Lo pide la SPEC 02 ("un arrastre cuenta como un paso"), pero hoy cada beat de un arrastre de onda es un paso. Hace falta para descartar el arrastre al apoyar el segundo dedo.
- **Botones − y +** (confirmados por el usuario):
  - Cada toque divide o multiplica el zoom por 2, ajustado a los límites. El centro de la vista queda fijo y el cambio es instantáneo.
  - "−" se desactiva en la vista completa y "+" en el máximo.
  - Etiquetas accesibles "Alejar" y "Acercar".
- **Escritorio** (confirmado por el usuario):
  - Ctrl/⌘ + rueda y el pellizco del trackpad cambian el zoom con el puntero como punto fijo. Cada píxel de rueda cambia el zoom un 1%.
  - La rueda horizontal recorre la vista; la vertical sin Ctrl/⌘ sigue haciendo scroll del editor.
  - Las teclas `-`, `+` y `=` hacen lo mismo que los botones cuando el foco está en el editor y no en un campo. Con Ctrl/⌘ siguen siendo el zoom del navegador.
- **Indicador de scroll** (confirmado por el usuario): barra de 3 px de alto, color `--grabber`, a 2 px del borde superior del escenario. Muestra qué parte de la vista completa se ve, aparece al hacer zoom o recorrer, se desvanece 1 s después y no aparece en la vista completa.
- **Memoria del zoom** (confirmada por el usuario):
  - Al abrir el editor y al pasar a otra transición se vuelve a la vista completa.
  - Mientras se edita la misma transición, el zoom se mantiene, también al abrir y cerrar tarjetas.
  - Al cambiar los compases o el BPM de A se conserva el tamaño de los beats y el centro de la vista, medido en beats desde el inicio de la transición, ajustado a los límites nuevos.
- **Zoom en Personalizar** (confirmado por el usuario): al entrar, la vista vuelve a la vista completa y se desactivan los botones, el pellizco, la rueda y las teclas de zoom. Con "Listo" vuelven el zoom y el centro que había.
- **Cursor de reproducción** (confirmado por el usuario): la vista no lo sigue. Si sale de la vista, deja de verse hasta que vuelve.

**No entra:**

- Onda rellena o coloreada por frecuencia (decidido por el usuario).
- Carátula, artista y tonalidad en las cabeceras (SPEC 06).
- Zoom vertical de las ondas.
- Abrir el editor ya ampliado sobre el punto de mezcla, como Spotify.
- Recordar el zoom entre transiciones o entre aperturas del editor.
- Recorrer cada onda por separado.
- Que la vista siga al cursor de reproducción.
- Zoom en el modo Personalizar.
- Animar el cambio de zoom, inercia al recorrer y doble toque para ampliar.
- Mostrar el nivel de zoom con un número.
- Líneas de medio beat y rejilla de B.
- Zoom en los minimapas y agrupar su arrastre en el historial.
- Marcar a mano el compás 1.
- Cambiar el paso del nudge (10 ms) o las reglas del snap.
- Volver a una configuración personalizada desde el botón "Personalizado".
- Deslizar entre transiciones con el dedo (siguen ‹ ›).
- Rediseñar la playlist, el mini-player o el popover de BPM.

---

## Modelo de datos

**`Track`** en `src/types.ts` gana un campo:

```ts
export interface Track {
  // …
  peaks: Float32Array | null;     // 2000 bins over the whole song: minimaps
  finePeaks: Float32Array | null; // NEW: one bin every 5 ms: the aligned view
  // …
}
```

**Picos** en `src/audio/loader.ts`:

```ts
/** Bins per second of the fine peaks drawn by the aligned view. */
export const FINE_PEAKS_PER_SECOND = 200;

/** Fine peaks and the 2000-bin overview derived from them, in one pass over the samples. */
export function computePeaks(buffer: AudioBuffer): { peaks: Float32Array; finePeaks: Float32Array };
```

Los dos arrays se normalizan con el mismo máximo global, como hoy.

**Vista del escenario.** Es estado de vista dentro del escenario, no de `AppState`. Las cuentas van en `src/lib/zoom.ts`, puras y con tests:

```ts
/** What the aligned view shows. */
export interface StageView {
  /** 1 = whole transition (window over the central 72%); higher = closer. */
  zoom: number;
  /** Mix time at the centre of the view (0 = transition start). */
  center: number;
}

export const WINDOW_FRACTION = 0.72; // moves here from waveform.ts (was 0.6)
export const MAX_ZOOM_BEATS = 2;
export const ZOOM_STEP = 2;
export const WHEEL_ZOOM_RATE = 0.01;

/** Mix seconds across the view at zoom 1: d / WINDOW_FRACTION. */
export function fitSpan(d: number): number;
/** Zoom at which MAX_ZOOM_BEATS beats of A fill the view; never below 1. */
export function maxZoom(d: number, bpm: number): number;
/** The whole transition: zoom 1, centred on the window. */
export function fitView(d: number): StageView;
/** Clamps the zoom to [1, maxZoom] and the centre so the view stays inside the fit range. */
export function clampView(view: StageView, d: number, bpm: number): StageView;
/** Scales the zoom by `factor`, keeping the mix time at `anchor` (0..1 of the width) in place. */
export function zoomAround(view: StageView, factor: number, anchor: number, d: number, bpm: number): StageView;
/** Moves the view by `dx` pixels of a `width`-pixel stage; positive = the waves follow a finger moving right. */
export function panBy(view: StageView, dx: number, width: number, d: number, bpm: number): StageView;
/** Keeps the on-screen size of A's beats and the centre (in beats from the transition start) when d or A's tempo change. */
export function rescaleView(view: StageView, before: { d: number; bpm: number }, after: { d: number; bpm: number }): StageView;
/** Visible part of the fit range as fractions 0..1, for the scroll indicator. */
export function visibleRange(view: StageView, d: number): { start: number; end: number };
/** Highest peak between two audio times; the single bin under `from` when the range is inside one bin or reversed. */
export function peakBetween(peaks: Float32Array, duration: number, from: number, to: number): number;
```

Convenciones:

- El rango de la vista completa es la ventana `[0, d]` más un 14% del ancho a cada lado: de `−7d/36` a `43d/36` en tiempo de mezcla.
- Con zoom `z`, la vista muestra `fitSpan(d) / z` segundos centrados en `center`.
- `maxZoom` equivale a `compases × 25/9` (unos `compases × 2,8`). Se calcula con `d` y el BPM de A porque el escenario no conoce los compases.

**Historial** en `src/state.ts`:

```ts
/** Ends the open gesture undoing it: draft, past and future go back to how they were at beginGesture. */
export function cancelGesture(): void;
```

`beginGesture` guarda una copia del borrador y de los dos historiales para que `cancelGesture` pueda volver atrás.

**Escenario** en `src/ui/waveform.ts`:

```ts
export function createStage(
  center: HTMLElement, // play pill, between the two waves
  bottom: HTMLElement, // NEW: bars pill, centred on the bottom edge between − and +
  onOutStart: (start: number) => void,
  onInStart: (start: number) => void,
  onDragEnd: () => void,
): Stage;

export interface Stage {
  // … existing members
  /** Back to the whole transition. The editor calls it on open and on pair change. */
  resetZoom(): void;
  /** One step of − / +; ignored while customizing. */
  stepZoom(direction: 1 | -1): void;
  /** Lane sheet open: only that lane's lines are drawn and the play pill moves to the bottom edge. */
  setFocusLane(lane: EditLane | 'looping' | null): void;
  /** Called when a wave is touched or released, so the editor can show and hide the minimaps. */
  onWaveTouch(listener: (touching: boolean) => void): void;
}
```

- `StageGeometry.lanes` sigue las proporciones nuevas: `out` empieza al 6% del alto y `in` al 53%, los dos con el 41% del alto.
- `setCustomizing(lane)` guarda la vista y pasa a la vista completa; con `null`, la recupera.
- `draw(model)` llama a `rescaleView` cuando cambian `d` o el BPM de A con la misma transición abierta.
- `StageTrack.peaks` pasa a recibir `track.finePeaks`. `MinimapModel.peaks` sigue con `track.peaks`.
- El escenario guarda qué onda tiene las flechas de nudge visibles (`'out' | 'in' | null`) y el temporizador para ocultarlas.
- Con zoom, `StageGeometry.x0` y `x1` pueden quedar fuera del escenario. El editor de curvas no se ve afectado, porque solo funciona en la vista completa.

**Estado de vista del editor** en `src/ui/editor.ts` (no en `AppState`):

```ts
/** Which sheet is open over the editor body. */
type OpenSheet = { kind: 'lane'; lane: EditLane | 'looping' } | { kind: 'bars' } | null;
```

- Abrir una tarjeta de carril entra en modo hoja. Cerrarla con Personalizar activo llama a `toggleCustomize` para salir.
- `state.editor.customizing` sigue siendo el estado de Personalizar (SPEC 02). Solo se puede activar desde la tarjeta de su carril.
- Las hojas aplican los cambios con las acciones de hoy: `updateDraft({ bars })`, `setVolumeStyle`, `setEqStyle`, `setFilterStyle`, `setEffectStyle`, `setLoopStyle` y `toggleCustomize`.

**Constantes** (valores iniciales; se ajustan tras comparar con las capturas en el iPhone y se anotan en la bitácora):

| Constante | Valor | Uso |
| --- | --- | --- |
| `WINDOW_FRACTION` | 0,72 (antes 0,6) | Ancho de la ventana en la vista completa |
| `MAX_ZOOM_BEATS` | 2 | Beats de A a lo ancho en el zoom máximo |
| `ZOOM_STEP` | 2 | Factor de cada toque de − / + y de las teclas |
| `WHEEL_ZOOM_RATE` | 0,01 por píxel | Cambio de zoom por píxel de rueda con Ctrl/⌘ |
| `FINE_PEAKS_PER_SECOND` | 200 | Picos finos por segundo de audio (uno cada 5 ms) |
| `SCROLL_INDICATOR_MS` | 1000 ms | Tiempo hasta que se desvanece el indicador de scroll |
| `NUDGE_HIDE_MS` | 3000 ms | Tiempo hasta que se ocultan las flechas de nudge |
| `MINIMAP_HIDE_MS` | 2000 ms | Tiempo hasta que los minimapas dejan paso a las cabeceras |
| `LANE_TOP`, `LANE_HEIGHT`, `LANE_GAP` | 0,06 · 0,41 · 0,06 | Proporciones verticales del escenario |

---

## Estilo visual

Medidas para una pantalla de 390 px de ancho (en otras, proporcionales donde se indica en %):

| Elemento | Medida |
| --- | --- |
| Barra superior | 44 px más la zona segura; ✕ en un círculo de 36 px con fondo `--fill`; chip "1 de 3" de 13 px en negrita con fondo `--fill`; "Guardar" en `--accent` y negrita sobre una pastilla `--fill` de 36 px |
| Barra inferior | 44 px más la zona segura; fondo `--bar-bg` con `backdrop-filter`, separador superior `--separator`; botones de 44 px |
| Cabecera | 56 px de alto, la de hoy |
| Minimapa | 56 px de alto, al ancho del cuerpo (16 px de margen a cada lado), esquinas de 6 px |
| Escenario | De borde a borde; `clamp(220px, 35dvh, 520px)`; ventana del 72% |
| Reproducir | 48 × 32 px |
| "−", "+" | 32 × 32 px |
| Pastilla de compases | 32 px de alto, ancho según el texto, chevron hacia abajo |
| Flechas de nudge | 28 × 28 px, a 4 px de cada borde, centradas en su onda |
| Botones del escenario | Esquinas de 10 px, fondo `--stage-pill`, texto o icono blanco, 44 × 44 px de área táctil |
| Hoja de compases | A todo el ancho, fondo `--toast-bg`, radio `--sheet-radius` arriba, tirador, botones de 44 px de alto |
| Presets | Título de 13 px en `--text-muted` entre dos líneas `--separator`; botones de 42 × 83 px con esquinas de 10 px, fondo `--surface-raised`; el elegido con fondo `--text` y texto `--bg` |
| Fila de carril | 50 px; barra de color de 3 × 15 px con radio completo; nombre a 17 px; estilo a 17 px en `--text-muted` con chevron hacia abajo |
| Tarjeta de carril | 18 px de margen a cada lado, radio de 13 px, fondo `--surface-raised`, tirador, cabecera con separador inferior, filas de 50 px, ✓ en `--accent` |
| Punto de curva | Anillo de 2 px del color del carril con relleno `--bg`; al arrastrarlo, relleno del color del carril |
| Indicador de scroll | 3 px de alto, `--grabber`, a 2 px del borde superior |

- **Tokens nuevos en `src/styles.css`:** `--bar-line: rgba(255, 255, 255, 0.2)` y `--stage-pill: #3a3a3a`.
- **Canvas:** sin el trazo de `--window-frame` alrededor de cada onda. El token se mantiene porque lo usan el minimapa y los contornos de foco.
- **Iconos nuevos en `src/ui/dom.ts`:** `minus`, `sparkle` (para "✦ Auto") y `check`. "+" reutiliza `add` y el chevron hacia abajo es `chevron` girado.
- **Animaciones** (con `src/ui/motion.ts` y el movimiento reducido de la SPEC 09):
  - las hojas entran y salen con `SPRING.sheetOpen` / `SPRING.sheetClose`;
  - al entrar en modo hoja, el escenario sube con `SPRING.sheetOpen`;
  - el cambio de tarjeta usa el scroll horizontal con `scroll-snap` del navegador;
  - minimapas y cabeceras se cruzan con un fundido de 150 ms.
- Sin colores fuera de `src/styles.css`.

---

## Estructura de archivos

```
src/
  lib/
    zoom.ts             # NUEVO: StageView, WINDOW_FRACTION, límites, zoomAround, panBy, rescaleView, visibleRange, peakBetween
    zoom.test.ts        # NUEVO
    fixtures.ts         # track() con finePeaks: null
  audio/
    loader.ts           # computePeaks devuelve peaks y finePeaks en una pasada; FINE_PEAKS_PER_SECOND
    loader.test.ts      # NUEVO: picos finos y derivados con un AudioBuffer falso
  ui/
    waveform.ts         # proporciones de Spotify, ventana al 72%, atenuación por canción, sin marcos, rejilla con
                        #   compases, picos finos, vista con zoom, − / +, indicador, nudge en la onda activa,
                        #   setFocusLane, onWaveTouch, zoom bloqueado en Personalizar
    stageZoom.ts        # NUEVO: gestos de dos dedos, rueda y gestos de Safari sobre el escenario
    barsSheet.ts        # NUEVO: hoja de compases
    laneSheets.ts       # NUEVO: tarjetas de carril en carrusel, lista con ✓, Personalizar, ↶ ↷, cierre deslizando
    editor.ts           # pantalla completa, barra superior de una fila, barra inferior, cabeceras y minimapas,
                        #   presets en fila, filas de carril, modo hoja, teclas - + =
    sheet.ts            # editor a pantalla completa sin tirador; las hojas internas no inician el cierre
    curveEditor.ts      # sin cambios de lógica; los puntos cambian solo por CSS
    dom.ts              # iconos minus, sparkle y check
  state.ts              # cancelGesture; beginGesture guarda el estado para poder cancelar
  state.test.ts         # cancelGesture
  main.ts               # guarda finePeaks al leer cada canción
  types.ts              # Track.finePeaks
  styles.css            # todo lo de "Estilo visual"; se borran .settings-card, .setting y .edit-bar
```

---

## Plan de implementación

Cada paso deja la app funcionando y se puede commitear solo.

**Datos:**

1. `src/lib/zoom.ts` y `src/lib/zoom.test.ts`. Tests:
   - `fitView(d)` centra la ventana y `visibleRange` devuelve `{ 0, 1 }`;
   - `maxZoom` da ×2,8 con 1 compás, ×22 con 8 y ×44 con 16;
   - `clampView` nunca deja el zoom fuera de `[1, maxZoom]` ni la vista fuera del rango completo;
   - `zoomAround` deja el tiempo de mezcla bajo `anchor` en el mismo sitio;
   - `panBy` con zoom 1 no mueve nada y con zoom 4 se detiene en los bordes del rango;
   - `rescaleView` de 8 a 16 compases conserva los píxeles por beat y el centro en beats;
   - `peakBetween` devuelve el máximo del tramo y el bin de `from` cuando el tramo está al revés o dentro de un bin.
2. `src/audio/loader.ts`, `src/audio/loader.test.ts`, `src/types.ts`, `src/main.ts` y `src/lib/fixtures.ts`: `computePeaks` devuelve `peaks` y `finePeaks` en una pasada. Tests con un `AudioBuffer` falso: un clic de 1 ms aparece en su bin de 5 ms, y cada pico de los 2000 es el máximo de los finos que cubre.

**Pantalla del editor:**

3. `src/ui/sheet.ts`, `src/ui/editor.ts` y `src/styles.css`: editor a pantalla completa sin tirador, que se sigue cerrando deslizando desde la barra. En escritorio, 480 px a toda la altura.
4. `src/ui/editor.ts`, `src/ui/dom.ts` y `src/styles.css`: barra superior de una fila con el chip "1 de 3" y barra inferior con ↶ ↷ y ‹ ›.
5. `src/ui/waveform.ts`, `src/ui/editor.ts` y `src/styles.css`: escenario de borde a borde, `clamp(220px, 35dvh, 520px)`, proporciones 6 / 41 / 6 / 41 / 6 y ventana al 72%. Se comprueba que Personalizar sigue alineado.
6. `src/ui/waveform.ts`, `src/ui/editor.ts` y `src/styles.css`: cabeceras de 56 px y minimapas en su lugar mientras se toca una onda (`onWaveTouch`).

**Escenario:**

7. `src/ui/waveform.ts`, `src/ui/editor.ts` y `src/styles.css`: dibujo con picos finos y `peakBetween`, atenuación por canción, sin marcos y rejilla dentro del panel con `--bar-line`.
8. `src/ui/waveform.ts`, `src/ui/editor.ts` y `src/styles.css`: `--stage-pill`, botón de reproducir como pastilla y flechas de nudge solo en la onda activa.
9. `src/ui/barsSheet.ts`, `src/ui/editor.ts`, `src/ui/sheet.ts` y `src/styles.css`: pastilla "8 compases ▾" en el borde inferior y hoja de compases. Sale la fila Duración.

**Controles:**

10. `src/ui/editor.ts`, `src/ui/dom.ts` y `src/styles.css`: presets en una fila con scroll, título "Presets" entre líneas, "Personalizado" como indicador y "✦ Auto".
11. `src/ui/laneSheets.ts`, `src/ui/editor.ts` y `src/styles.css`: filas de carril y tarjetas con la lista y ✓, una sola tarjeta por vez. Salen los selects y la tarjeta de Ajustes.
12. `src/ui/laneSheets.ts` y `src/styles.css`: carrusel con `scroll-snap`, tarjetas vecinas que asoman y cierre deslizando hacia abajo o con `Esc`.
13. `src/ui/editor.ts` y `src/ui/waveform.ts`: modo hoja. Se ocultan las barras, las cabeceras y los avisos; el escenario sube; `setFocusLane` dibuja solo la curva del carril y baja reproducir al borde.
14. `src/ui/laneSheets.ts`, `src/ui/editor.ts` y `src/styles.css`: Personalizar desde la tarjeta, con ↶ ↷, "Listo", ayuda, "Personalizada ✓" y el aviso de 32 puntos. Salen la barra de edición y "Restablecer curva". Puntos como anillos.

**Zoom:**

15. `src/ui/waveform.ts`, `src/ui/editor.ts` y `src/ui/dom.ts`: `StageView` en el escenario. "−" y "+" a los lados de la pastilla, `resetZoom` al abrir y al cambiar de transición, y `rescaleView` al cambiar compases o BPM.
16. `src/ui/waveform.ts`: Personalizar guarda la vista, pasa a la vista completa y desactiva el zoom. "Listo" la recupera.
17. `src/ui/waveform.ts` y `src/styles.css`: indicador de scroll en el borde superior.
18. `src/state.ts`, `src/state.test.ts` y `src/ui/waveform.ts`: el arrastre de una onda abre un gesto. Se añaden `cancelGesture`, con test de que deja el borrador y los dos historiales como estaban, y `cancel()` en el control de cada onda.
19. `src/ui/stageZoom.ts` y `src/ui/waveform.ts`: pellizcar y recorrer con dos dedos.
    - Escucha `pointerdown` en fase de captura sobre `.stage-view`.
    - Al llegar el segundo dedo, detiene el `pointerdown` antes de que llegue a la otra onda y cancela el arrastre con `cancelGesture`.
    - Cancela `gesturestart` y `gesturechange` para que Safari en iOS no amplíe la página.
20. `src/ui/stageZoom.ts` y `src/ui/editor.ts`: escritorio.
    - Ctrl/⌘ + rueda hace zoom con el puntero como punto fijo y la rueda horizontal recorre la vista.
    - El pellizco del trackpad en Safari de macOS (`gesturechange`) hace lo mismo.
    - Las teclas `-`, `+` y `=` llaman a `stepZoom`.

**Verificación:**

21. Playwright a 393 × 852 (el tamaño de las capturas), 390 × 844, 375 × 667, 320 × 568, 844 × 390, 412 × 915 (emulación táctil) y 1280 × 800.
    - Capturas de pantalla puestas al lado de las de Spotify para comparar posiciones y tamaños.
    - Pellizco simulado con dos puntos táctiles por CDP (`Input.dispatchTouchEvent`) y un WAV sintético con un clic en cada beat.

    Después, prueba manual en un iPhone real con Safari (`npx vite --host` en la red local). Los valores que se ajusten se anotan en la bitácora.

---

## Criterios de aceptación

**Pantalla como Spotify:**

- [x] `npm test` pasa, incluidos los tests nuevos de `src/lib/zoom.test.ts`, `src/audio/loader.test.ts` y `cancelGesture` en `src/state.test.ts`.
- [x] `npm run build` pasa.
- [x] En el móvil, el editor ocupa toda la pantalla, sin margen ni tirador arriba.
- [x] Deslizar la barra superior hacia abajo cierra el editor, con resistencia y "¿Descartar cambios?" si hay cambios.
- [x] En escritorio, el editor mide 480 px de ancho y ocupa toda la altura.
- [x] La barra superior es una fila con ✕ en un círculo, el chip "1 de 3" y "Guardar" en verde; el chip se anuncia como "Transición 1 de 3".
- [x] La barra inferior tiene ↶ ↷ a la izquierda y ‹ › a la derecha, y funcionan como antes.
- [x] A 393 × 852, el panel de la ventana mide 283 ± 3 px de ancho y el escenario 298 ± 3 px de alto (Spotify: 286 × 301 pt).
- [x] A 390 × 844 el escenario mide entre 290 y 300 px de alto; a 844 × 390 mide 220 px; a 1280 × 800 mide 280 px.
- [x] El escenario llega a los dos bordes de la pantalla.
- [x] La onda de A empieza al 6% del alto del escenario, la de B al 53%, y cada una ocupa el 41%.
- [x] En el iPhone, una captura del editor puesta al lado de una de Spotify muestra el escenario a la misma altura (± 20 px) y del mismo tamaño (± 10 px).

**Cabeceras y minimapas:**

- [x] Al abrir el editor se ven las cabeceras de A y B, iguales a las de hoy, y no se ven los minimapas.
- [x] Al tocar una onda, los dos minimapas aparecen con un fundido en lugar de las cabeceras, sin mover el escenario.
- [x] Con los minimapas visibles, tocarlos o arrastrarlos mueve la ventana de su canción.
- [x] 2 s después de soltar, vuelven las cabeceras.

**Escenario:**

- [x] La onda de A se ve brillante antes y dentro de la ventana y atenuada después; la de B, atenuada antes y brillante dentro y después.
- [x] No hay marco alrededor de cada onda: la ventana se ve solo como el panel gris.
- [x] Las líneas de beat y de compás solo aparecen dentro del panel, y cada 4 beats de A hay una línea más marcada.
- [x] Reproducir es una pastilla gris de 48 × 32 px entre las dos ondas.
- [x] En el borde inferior se ven "−", "8 compases ▾" y "+", mitad dentro y mitad fuera del panel.
- [x] En el móvil, al abrir el editor no se ven flechas de nudge.
- [x] Tocar o arrastrar la onda de A muestra solo sus flechas; tocar la de B las pasa a B; se ocultan 3 s después del último uso.
- [x] En escritorio, pasar el ratón o enfocar una onda muestra sus flechas.
- [x] Cada flecha sigue moviendo el punto exactamente 10 ms.

**Hoja de compases:**

- [x] Tocar la pastilla abre la hoja "Compases" con tirador, los botones 1, 2, 4, 8 y 16 (el elegido en blanco) y el texto "Elige cuánto dura la transición.".
- [x] Con la hoja abierta, las ondas siguen visibles y sin oscurecer.
- [x] Tocar un número cambia la duración y la pastilla, reinicia la preview y deja la hoja abierta.
- [x] Tocar fuera, deslizarla hacia abajo o `Esc` cierran la hoja sin cambiar nada más.
- [x] Con 1 compás la pastilla dice "1 compás ▾".

**Presets y carriles:**

- [x] Bajo la cabecera de B se ve "Presets" entre dos líneas y una fila con scroll horizontal: "Personalizado", "✦ Auto" y los 9 presets.
- [x] "Personalizado" se ve elegido cuando la transición no coincide con ningún preset, y desactivado cuando coincide.
- [x] Debajo hay 5 filas (Volumen, EQ, Filtro, Efectos y Looping) con barra de color, nombre y estilo con "▾", y no queda ningún `<select>` en el editor.
- [x] Tocar una fila abre la tarjeta de ese carril con la lista de estilos y una ✓ en el elegido.
- [x] Tocar un estilo lo aplica, mueve la ✓, reinicia la preview y deja la tarjeta abierta.
- [x] Las tarjetas vecinas asoman a los lados; deslizar en horizontal o tocar una vecina pasa a ese carril.
- [x] Deslizar la tarjeta hacia abajo o `Esc` la cierran.
- [x] Con una tarjeta abierta, las barras superior e inferior, las cabeceras y los avisos se ocultan y el escenario queda arriba del todo.
- [x] Con la tarjeta de un carril abierta, sobre las ondas solo se ve la curva de ese carril.
- [x] Con una tarjeta abierta, la pastilla de compases desaparece y reproducir queda en el borde inferior, entre "−" y "+".
- [x] Con una tarjeta abierta se puede seguir arrastrando las ondas.
- [x] La tarjeta de Looping no tiene "Personalizar".

**Personalizar:**

- [x] "Personalizar" en la tarjeta muestra los puntos de ese carril como anillos, y en la cabecera ↶ ↷, "Listo" y la ayuda.
- [x] Al mover un punto, "Personalizada ✓" aparece primera en la lista y la fila del carril dice "Personalizada".
- [x] Tocar un estilo de la lista reemplaza la curva personalizada.
- [x] ↶ ↷ de la tarjeta deshacen y rehacen los cambios de puntos.
- [x] "Listo" o cerrar la tarjeta salen de Personalizar.
- [x] Al llegar a 32 puntos, el aviso "Máximo 32 puntos por curva" se ve en la tarjeta.
- [x] El punto que se arrastra se rellena del color del carril.

**Zoom:**

- [x] Al abrir el editor, "−" está desactivado y "+" activado.
- [x] Un toque en "+" duplica el ancho de los beats y deja el mismo instante en el centro de la vista.
- [x] Con 8 compases, "+" se desactiva cuando 2 beats de A llenan el ancho; con 1 compás, también.
- [x] Al pellizcar hacia fuera aumenta el zoom y el beat que había entre los dedos sigue entre ellos.
- [x] Deslizar con dos dedos recorre las dos ondas a la vez, y la vista nunca pasa del 14% de contexto a cada lado de la ventana.
- [x] Con zoom ×4, un arrastre de un dedo del ancho de un beat en pantalla mueve el punto exactamente un beat, y la otra onda no se mueve.
- [x] Si un dedo mueve A un beat y se apoya el segundo, A vuelve a su punto anterior y "Deshacer" no tiene ese paso.
- [x] Al apoyar el segundo dedo sobre B mientras el primero arrastra A, B no se mueve.
- [x] Un arrastre de onda de varios beats se deshace con un solo "Deshacer".
- [x] Pellizcar sobre el escenario no amplía la página en Safari de iPhone ni en la emulación de Chrome para Android, y no mueve el editor.
- [x] Al hacer zoom o recorrer aparece el indicador arriba del escenario y se desvanece 1 s después; en la vista completa no aparece.
- [x] Al pasar a otra transición, o al cerrar y volver a abrir el editor, la vista vuelve a la vista completa.
- [x] Con zoom, cambiar de 8 a 16 compases deja los beats del mismo ancho (±1 px) y el mismo beat en el centro, salvo ajuste a los límites.
- [x] Al entrar en Personalizar con zoom, la vista vuelve a la vista completa y el zoom se desactiva; con "Listo" vuelven el zoom y el centro.
- [x] Con zoom y la preview sonando, la vista no se mueve.
- [x] En el zoom máximo, cada clic del WAV sintético se ve como un pico de 3 barras de ancho o menos.
- [x] Con 16 compases en la vista completa se ve un pico por cada clic del WAV sintético.
- [x] En escritorio, Ctrl/⌘ + rueda cambia el zoom con el instante bajo el puntero fijo, la rueda horizontal recorre y la vertical hace scroll.
- [x] El pellizco del trackpad cambia el zoom del escenario, no el de la página, en Chrome y en Safari de macOS.
- [x] `-`, `+` y `=` cambian el zoom fuera de los campos; Ctrl/⌘ + `+` sigue siendo el zoom del navegador.

**General:**

- [x] Todos los botones nuevos tienen 44 × 44 px de área táctil y etiqueta accesible.
- [x] Con VoiceOver (o el árbol de accesibilidad de DevTools), las filas de carril se anuncian como botones con su estilo, y las opciones de las tarjetas indican cuál está elegida.
- [x] Con "Reducir movimiento", las hojas y el escenario aparecen con fundidos en lugar de desplazamientos.
- [x] A 320 × 568 no hay scroll horizontal fuera de la fila de presets y del carrusel.
- [x] Una canción de 4 min guarda 48 000 picos finos.
- [x] El snap, Shift para arrastrar libre, las flechas del teclado sobre las ondas, el popover de BPM, "¿Descartar cambios?" y el cambio entre transiciones funcionan igual que antes.
- [x] Ningún color está hardcodeado fuera de `src/styles.css`.

---

## Decisiones

- **Sí:** parecerse lo más posible a Spotify Mix en pantalla, tamaño de las ondas y controles que abren submenús (pedido del usuario tras ver las capturas). Por eso esta spec absorbe la SPEC 12 que se había abierto para los controles.
- **Sí:** editor a pantalla completa y ondas de borde a borde (confirmado por el usuario). Sustituye a la hoja con margen y tirador de la SPEC 09; se mantiene su gesto de cerrar deslizando.
- **Sí:** escenario de 35dvh y ventana al 72%, como Spotify (confirmado por el usuario). Sustituye a la ventana del 60% de la SPEC 01 y a la decisión anterior de esta spec (50dvh y 60%).
- **Sí:** proporciones 6 / 41 / 6 / 41 / 6 medidas en las capturas (confirmado por el usuario).
- **Sí:** barra superior como Spotify y barra inferior con ↶ ↷ y ‹ › (confirmado por el usuario). Spotify no tiene deshacer ni anterior/siguiente; abajo quedan al alcance del pulgar.
- **No:** todo en una fila arriba. A 320 px no cabe con botones de 44 px.
- **Sí:** cabeceras como hoy (decidido por el usuario). Sin carátulas ni artista no aportaría imitar las de Spotify.
- **Sí:** minimapas en lugar de las cabeceras mientras se toca una onda (confirmado por el usuario). Sustituye a la decisión anterior de tenerlos siempre visibles: con las dos cosas, el escenario quedaba unos 100 px más abajo que en Spotify.
- **No:** onda rellena o de 3 colores por frecuencia (decidido por el usuario).
- **Sí:** atenuar solo lo que no suena, sin marcos en cada onda y con la rejilla dentro del panel (confirmado por el usuario).
- **Sí:** pastilla de compases con una hoja que queda abierta y no oscurece (confirmado por el usuario). Se comparan duraciones viendo la onda.
- **Sí:** 5 opciones (1, 2, 4, 8 y 16) en una fila de números (confirmado por el usuario). D-Mix tiene 1 compás desde la SPEC 01 y "16 compases" no cabe en 5 botones a 320 px.
- **Sí:** "−" y "+" a los lados de la pastilla, en el borde inferior (confirmado por el usuario). Con las proporciones de Spotify no caben junto a reproducir.
- **No:** quitar los botones de zoom para parecerse más a Spotify. El pellizco no se descubre solo.
- **Sí:** reproducir como pastilla gris y botones del escenario con el mismo estilo (confirmado por el usuario).
- **Sí:** flechas de nudge solo en la onda activa, ocultas a los 3 s (confirmado por el usuario).
- **Sí:** presets en una fila con scroll horizontal (confirmado por el usuario). Deja sin efecto el criterio de la SPEC 05 de ver los 10 a 375 px.
- **Sí:** "Personalizado" como primer preset que solo indica (confirmado por el usuario). No hay una configuración propia guardada a la que volver.
- **Sí:** filas de carril y tarjetas con la lista y ✓, en carrusel (confirmado por el usuario). Sustituyen a los `<select>` nativos de la SPEC 09: el menú de iOS tapaba las ondas y no dejaba ver el cambio.
- **Sí:** modo hoja con el escenario arriba y solo la curva del carril (confirmado por el usuario). Cada estilo se ve sobre la onda al elegirlo, como en Spotify.
- **Sí:** Personalizar desde la tarjeta, con ↶ ↷ y "Listo" en su cabecera (confirmado por el usuario). Con la tarjeta abierta, la barra inferior queda tapada.
- **Sí:** tocar un estilo reemplaza la curva personalizada y sustituye a "Restablecer curva" (confirmado por el usuario). Es lo que hace Spotify y deja la tarjeta más limpia.
- **No:** mantener la barra de edición bajo las ondas. Duplicaría lo que ya está en la tarjeta.
- **Sí:** puntos de curva como anillos (confirmado por el usuario).
- **Sí:** un dedo mueve la canción y dos dedos navegan (confirmado por el usuario).
- **Sí:** de la vista completa a 2 beats a lo ancho, con pellizco continuo y botones ×2 instantáneos (confirmado por el usuario).
- **Sí:** el zoom se olvida al abrir el editor y al cambiar de transición (confirmado por el usuario).
- **No:** abrir ya ampliado, como Spotify. La comunidad de Spotify se queja de perderse dentro de la canción.
- **Sí:** indicador de scroll en el borde superior (confirmado por el usuario). El inferior lo ocupan "−", la pastilla y "+".
- **Sí:** Personalizar sin zoom (confirmado por el usuario). El editor de curvas no cambia de lógica.
- **Sí:** la vista no sigue al cursor de reproducción (confirmado por el usuario).
- **Sí:** al apoyar el segundo dedo, la canción vuelve a donde estaba (confirmado por el usuario).
- **Sí:** un arrastre de onda es un solo paso del historial. Lo pedía la SPEC 02 y hoy no se cumple.
- **Sí:** picos finos de 5 ms calculados al cargar (confirmado por el usuario).
- **Sí:** `stageZoom.ts`, `barsSheet.ts` y `laneSheets.ts` aparte. `editor.ts` y `waveform.ts` ya pasan de 500 líneas.
- **Sí:** estado de las hojas en `editor.ts`, fuera de `AppState`. Es estado de vista, como el popover de BPM.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La spec es grande y toca casi todo el editor | El plan va por fases (datos, pantalla, escenario, controles, zoom) y cada paso deja la app funcionando. |
| El segundo dedo cae sobre la otra onda y empieza su propio arrastre | `stageZoom.ts` escucha `pointerdown` en fase de captura y lo detiene. Está en los criterios. |
| El primer dedo ya movió la canción cuando llega el segundo | `cancelGesture` deja el borrador y los historiales como estaban. |
| Safari en iOS amplía la página al pellizcar | `touch-action: none` en `.stage-view` y `preventDefault` en `gesturestart` y `gesturechange`. |
| Safari de macOS envía el pellizco del trackpad como `gesturechange` | Se escuchan los dos caminos. Está en los criterios. |
| Deslizar a los lados en el trackpad navega hacia atrás | `preventDefault` en la rueda horizontal sobre el escenario y `overscroll-behavior-x: contain`. |
| Deslizar la tarjeta en horizontal choca con arrastrar las ondas | Las ondas quedan fuera de la tarjeta; el carrusel solo escucha dentro de ella. |
| Deslizar la tarjeta hacia abajo choca con el scroll de su lista | Como en la SPEC 09: solo cierra con la lista arriba del todo o desde el tirador y la cabecera. |
| Las hojas internas inician el cierre del editor | `.bars-sheet` y `.lane-sheet` se añaden a las zonas que `sheet.ts` ignora. |
| Sin los `<select>` se pierde accesibilidad | Filas y opciones son botones reales con `aria-pressed`; la tarjeta es un `role="dialog"` con nombre; `Esc` la cierra y devuelve el foco a la fila. Está en los criterios. |
| Sin minimapas visibles al abrir, no se descubren | Aparecen en cuanto se toca una onda, como en Spotify. |
| Sin flechas visibles al abrir, no se descubre el nudge | Aparecen en cuanto se toca una onda, como en Spotify. |
| Con la hoja de compases sin fondo oscuro, un toque fuera actúa sobre el escenario | Un `pointerdown` en fase de captura cierra la hoja y detiene el evento. |
| La pastilla y los botones del borde inferior tapan la parte baja de la onda de B | Se acepta: Spotify hace lo mismo con su pastilla. |
| Sin BPM no hay escenario, así que tampoco pastilla de compases | Se acepta: la duración depende del BPM de A y el editor ofrece "Escribir BPM". |
| Con la ventana al 72% y las proporciones nuevas, los puntos de Personalizar se desalinean | El editor de curvas lee la ventana y los carriles de `StageGeometry`. Está en los criterios. |
| A 320 px, la fila de 5 números de la hoja de compases queda justa | Cada botón mide unos 50 px con números de una o dos cifras. Está en los criterios de 320 px. |
| Dibujar con picos finos es lento con 16 compases y BPM bajo | Son unas 36 000 lecturas por dibujo. Si se nota, las barras que cubren muchos picos usan los 2000 picos. |
| Los picos finos ocupan memoria | Unos 190 KB por canción de 4 min, frente a unos 85 MB de su `AudioBuffer` decodificado. |
| Con Looping, una barra cruza un salto del loop y el tramo queda al revés | `peakBetween` usa el bin del inicio del tramo. |
| En horizontal, el escenario de 220 px deja poco espacio | Se acepta: la SPEC 09 pide que el horizontal sea usable sin diseño especial. |
| Las líneas de compás caen a mitad de compás si el primer beat no es el 1 | Es la misma suposición que el snap. |

---

## Lo que **no** entra en esta spec

- Onda rellena o coloreada por frecuencia.
- Carátula, artista y tonalidad en las cabeceras (SPEC 06).
- Zoom vertical, zoom en los minimapas y zoom en Personalizar.
- Abrir ya ampliado o recordar el zoom entre transiciones.
- Recorrer cada onda por separado o que la vista siga al cursor.
- Animación del zoom, inercia, doble toque para ampliar y número de nivel.
- Líneas de medio beat y rejilla de B.
- Marcar el compás 1 a mano.
- Cambios en el nudge (más allá de cuándo se ve y su forma) o en el snap.
- Volver a una configuración personalizada desde "Personalizado".
- Deslizar entre transiciones con el dedo.
- Rediseñar la playlist, el mini-player o el popover de BPM.

Cada uno, si llega, va en su propia spec.
