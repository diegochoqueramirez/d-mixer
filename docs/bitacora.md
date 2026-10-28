# Bitácora y roadmap de mixer

Última actualización: 2026-10-28

Documento vivo: qué se ha implementado, qué falta y qué ideas hay para el futuro. **No es una spec.** Cada bloque pendiente se convierte en una spec con `/spec`, donde se responden sus preguntas abiertas antes de implementar.

**Cómo se mantiene:**

- Al escribir una spec, su fila del roadmap pasa a "Spec escrita" y se enlaza el archivo.
- Al implementarla, se añade una entrada a la bitácora (lo más reciente arriba) y la fila pasa a "Implementado" con `[x]`.
- Si una idea futura entra en una spec, se anota en su fila como "→ SPEC NN" en la columna "Encaja con".

## Roadmap

| Hecho | Spec | Tema | Depende de | Estado |
| --- | --- | --- | --- | --- |
| [x] | [01](../specs/01-crossfade-bpm-sync.md) | Mezclador de playlist con editor estilo Spotify Mix | — | Implementado (en `main`) |
| [x] | [02](../specs/02-editor-curvas-por-puntos.md) | Editor de curvas por puntos ("Personalizar") | 01 | Implementado (en `main`) |
| [ ] | 03 | Exportar la mezcla a WAV y MP3 | 01 | Pendiente |
| [x] | [04](../specs/04-carriles-eq-y-filtro.md) | Carriles EQ y Filtro + presets Wave, Melt y Rise completo | 01, 02 | Implementado (en `main`) |
| [x] | [05](../specs/05-carril-efectos-y-looping.md) | Carril Efectos y Looping + presets Dissolve, Surge, Afterglow | 01, 02, 04 | Implementado (en `main`) |
| [ ] | 06 | Tonalidad Camelot, Smart Reorder y carátulas | 01 | Pendiente |
| [ ] | 07 | Key lock (cambiar tempo sin cambiar el tono) | 01 | Pendiente |
| [ ] | 08 | Proyectos guardables (retomar donde lo dejaste) | 01 y el modelo de datos final | Pendiente |
| [x] | [09](../specs/09-interfaz-movil-ios.md) | Interfaz móvil estilo iOS con animaciones (Motion), compatible con Android | 01, 02, 04, 05 | Implementado (en `main`) |
| [ ] | 10 | App instalable (PWA) y audio en iOS | 09 | Pendiente |
| [ ] | 11 | Onda grande con zoom en el editor de transición | 09 | Pendiente |

Orden sugerido, **a confirmar**: 04 → 05 → 07 → 06 → 03 → 08.

- Los carriles (04, 05) y el key lock (07) cambian lo que suena, así que conviene tenerlos antes de exportar (03).
- Los proyectos (08) van al final, cuando el modelo de datos ya no cambie y no haya que migrar formatos guardados.

---

## Bitácora

### 2026-10-28 — SPEC 09: Interfaz móvil estilo iOS

- **Estado:** implementado y subido a `main` mediante pull request. El usuario la probó en su iPhone y la cerró como `Implementado`; los criterios se marcaron en `[x]`.
- **Qué se hizo:**
  - La app pasa a llamarse **D-Mix**: título grande que se convierte en barra compacta translúcida al hacer scroll, con el interruptor Mix y un botón "+".
  - **Playlist** como lista agrupada de iOS:
    - deslizar para "Eliminar" (o del todo para borrar), con una sola fila abierta a la vez;
    - tirador ≡ y pulsación larga de 350 ms para reordenar, con desplazamiento automático y FLIP;
    - aviso "Deshacer" de 5 s; × al pasar el ratón en escritorio;
    - botones ocultos para lectores de pantalla y atajos `Alt+↑`/`Alt+↓`/`Supr`.
  - **Mini-player** fijo con un botón play/stop y el estado en hasta dos líneas.
  - **Editor como hoja:** se abre con resorte; se cierra arrastrando desde el tirador, la barra o el cuerpo con el scroll arriba; con cambios sin guardar ofrece resistencia y pregunta. El contenido se desliza al cambiar de transición.
  - Zonas seguras, `dvh`, campos de 16 px, objetivos táctiles de 44 px, `overscroll-behavior` contra el pull-to-refresh de Android y movimiento reducido.
- **Archivos nuevos:** `src/lib/gestures.ts` (+ test), `src/state.test.ts`, `src/ui/motion.ts`, `src/ui/sheet.ts`, `src/ui/rowGestures.ts` y `src/ui/toast.ts`.
- **Decisiones durante la implementación:**
  - **`motion-dom` en lugar de `animate` de `"motion"`** (confirmado por el usuario). `animate` + `press` pesaban 25,9 kB comprimido y el bundle crecía 29,5 kB, por encima del límite de 25 kB. Con `JSAnimation` + `press` de `motion-dom` (versión exacta 14.7.1) el bundle crece 13,4 kB. Mi estimación previa de "unos 17 kB" estaba mal.
  - **Resortes por física.** Motion 14 ignora la velocidad inicial de los resortes definidos por `duration`/`bounce`. `motion.ts` los convierte a `stiffness`/`damping` con la fórmula de `visualDuration` de Motion.
  - **Test de `rubberBand` corregido.** La spec decía que nunca pasa de `dimension * RUBBER_BAND`, pero su propia fórmula tiende a `dimension`. Se mantuvo la fórmula de iOS y se corrigió la spec.
  - **Barra del editor en dos filas** (cerrar · ‹ título › · Guardar, y debajo deshacer/rehacer). Con botones de 44 px en una sola fila, el título quedaba en unos 55 px a 375 px de ancho.
  - Con una fila abierta, deslizar otra la abre (y cierra la primera); un toque en cualquier otro sitio solo cierra.
  - Si se agarra la hoja mientras se anima y se suelta sin moverla, vuelve a su sitio en lugar de aplicar la regla del 25%.
  - El botón rojo "Eliminar" se oculta con la fila cerrada; si no, asomaba por el antialiasing de las esquinas redondeadas.
  - En horizontal (844 px) se aplica la regla de escritorio de `min-width: 600px`: la hoja queda centrada con 480 px.
  - **Selector de archivos con extensiones:** `accept` pasa de `audio/*` a `.mp3,.wav,audio/mpeg,audio/wav,audio/x-wav`. En iPhone, `audio/*` solo dejaba elegir de la fototeca ([WebKit 242110](https://bugs.webkit.org/show_bug.cgi?id=242110)).
  - **Aviso al recargar** (`beforeunload`) con canciones en la playlist, añadido a la spec a pedido del usuario. Safari en iOS no muestra este aviso.
  - **Interruptor de Mix rehecho** con `::before` (pista) y `::after` (círculo) en un botón transparente de 51×44. El truco del borde transparente para agrandar el área táctil lo dejaba ovalado en Safari.
  - **HTTPS en desarrollo** con `@vitejs/plugin-basic-ssl` (certificado autofirmado). Por HTTP en la red local Safari no da `crypto.randomUUID()` y no se podían añadir canciones desde el iPhone. Se prueba en `https://<IP del Mac>:5173/d-mixer/` con `npx vite --host`.
- **Revisión de UX con Playwright** (390, 375 y 320 px, horizontal y escritorio), a pedido del usuario:
  - **Bugs:** cambiar de transición dos veces seguidas dejaba el contenido desplazado y semitransparente, porque dos animaciones escribían la misma propiedad (ahora una nueva cancela la anterior, como en Motion). Los toques rápidos en "siguiente" se ignoraban; ahora se acumulan. En "¿Descartar cambios?", "Seguir editando" era invisible (fondo igual al de la caja).
  - **Editor:** ajustes en una tarjeta con filas iguales (Duración, Volumen, EQ, Filtro, Efectos, Looping), secciones "Preset" y "Ajustes", barra de edición bajo las ondas con "Restablecer curva" y "Listo", avisos con icono debajo de las ondas, BPM como pastilla tocable, botón "Escribir BPM" cuando falta, popover con animación, "Listo" y cierre al hacer scroll, y "¿Descartar cambios?" como hoja de acciones de iOS. La barra superior deja el título solo en la primera fila.
  - **Lista:** chip de transición con icono (aviso en "Revisar"), fila con error con un solo texto rojo y botón "Quitar", indicador de actividad al leer y analizar, y rojo de "Eliminar" más oscuro (contraste 4,6:1).
  - **Mini-player:** si algo bloquea la mezcla, el mensaje lleva "›" y abre la transición a arreglar.
  - **Foco inicial en el título:** al abrir el editor, `showModal()` enfocaba la X y Safari le dibujaba el anillo de foco. Ahora el título tiene `autofocus` (y `tabindex=-1`, sin contorno), y cerrar la hoja de acciones devuelve el foco al título.
  - **Pendiente en iPhone:** confirmar que el doble toque añade y quita puntos de la curva, porque el texto de ayuda lo promete.
- **Limitación conocida:** si se quita una canción mientras todavía se decodifica y se pulsa "Deshacer", vuelve en estado "Leyendo archivo…" y no termina, porque las actualizaciones de la carga se perdieron mientras no estaba en la lista.
- **Verificación:**
  - 157 tests pasan, `tsc` sin errores y `vite build` compila. JS: 47,0 → 60,5 kB comprimido.
  - Probado en Chromium con Playwright y emulación táctil (390 × 844, 844 × 390 y 412 × 915) con tres WAV sintéticos: deslizar, eliminar, "Deshacer", reordenar con tirador y pulsación larga, cancelar la pulsación al mover, menú contextual bloqueado, atajos de teclado, cierre de la hoja por distancia, por velocidad y desde el cuerpo, zonas de edición que no la mueven, resistencia y confirmación con cambios, `Esc`, agarrar la hoja en movimiento, deslizamiento entre transiciones, movimiento reducido, barra compacta, mini-player, popover de BPM y escritorio a 1280 px. Sin scroll horizontal y sin errores en consola (salvo el 404 de `favicon.ico`, que ya existía).
  - **Pendiente en iPhone:** fluidez a 60 fps, gestos reales en Safari, zonas seguras con muesca, zoom al enfocar campos y que el resorte siga la velocidad del dedo.

### 2026-10-28 — SPEC 05: Carril Efectos y Looping

- **Estado:** implementado y subido a `main` mediante pull request. El usuario la marcó como `Implementado` con todos los criterios en `[x]`.
- **Qué se hizo:**
  - Fila **Efectos** con los 12 estilos de vimj (reverb, delay y echo), "Personalizar" y "Restablecer curva". El envío se edita solo sobre A y se dibuja en blanco.
  - Fila **Looping** con 7 opciones (1–16 beats y Loop halving), sin curva. La onda de A muestra las repeticiones atenuadas y una marca ↺ naranja en cada salto.
  - **Sonido:**
    - Reverb con `ConvolverNode` e impulso generado de 2,5 s.
    - Echo con realimentación 0,55; delay con una sola repetición.
    - El envío sale antes del volumen y el retorno entra después. Los "cut" se cortan en 5 ms; los "out" siguen sonando.
    - Loop con una fuente por pasada y fundidos de 4 ms en cada salto.
  - **Presets** Dissolve, Surge y Afterglow con las recetas de vimj. El chip compara los cinco campos y las cuatro curvas.
- **Archivos nuevos:** `src/lib/effects.ts`, `src/lib/effects.test.ts` y `src/audio/effectNodes.ts`.
- **Decisiones durante la implementación:**
  - Loop halving da 20 pasadas y 19 saltos (4 + 4 + 4 + 8), no 16 y 15 como decía el borrador. Se corrigió la spec siguiendo su propia tabla.
  - `.presets` pasa de scroll horizontal a salto de línea, para que los 10 botones se vean completos a 375 px.
- **Verificación:**
  - 137 tests pasan, `tsc` sin errores y `vite build` compila.
  - Probado en el navegador con dos WAV sintéticos: Surge, Afterglow, Personalizar en Efectos, deshacer, Loop halving y "Reproducir mezcla" funcionan sin errores en consola, a 1280 px y a 375 px.

### 2026-10-28 — SPEC 04: Carriles EQ y Filtro

- **Estado:** implementado y subido a `main`. El usuario la marcó como `Implementado` con todos los criterios en `[x]`.
- **Qué se hizo:**
  - Filas **EQ** (9 estilos) y **Filtro** (11, con Noise out end) en el editor, con su select, "Personalizar" y "Restablecer curva".
  - **Sonido** con los valores de vimj:
    - EQ isolator Linkwitz–Riley en 250 Hz y 3 kHz, con corte total.
    - Filtro logarítmico (LP de 20 kHz a 150 Hz, HP de 20 Hz a 4 kHz) con Q fija 0,9 y mezcla seco/filtrado.
    - Ruido blanco filtrado para Noise out end.
  - **Presets** Fade, Blend, Rise, Wave, Melt y Slam con receta completa. Auto = Fade completo.
  - **Líneas** de volumen (azul), EQ (amarillo, medios y agudos tenues) y filtro (rosa), cada una con la escala de vimj. Marco de la ventana en blanco al 40%.
  - **Personalizar por carril:** el carril activo va encima y los demás se atenúan. ↑ ↓ siguen la dirección visual, también en el low-pass.
- **Archivos nuevos:** `src/lib/lanes.ts`, `src/lib/lanes.test.ts` y `src/audio/laneNodes.ts`.
- **Decisiones durante la implementación:**
  - Cada ventana de filtro es una etapa propia (biquad + seco/filtrado). Así una canción puede tener un low-pass al entrar y un high-pass al salir.
  - Los bloques de `.editor-body` ya no se encogen (`flex-shrink: 0`). Con las dos filas nuevas, la vista de ondas quedaba con altura 0 en móvil.
- **Verificación:**
  - 113 tests pasan, `tsc` sin errores y `vite build` compila.
  - Probado en el navegador con dos WAV sintéticos: presets, Personalizar en EQ y Filtro, deshacer, Noise out end y "Reproducir mezcla" funcionan sin errores en consola, a 1280 px y a 375 px.

### 2026-10-28 — SPEC 02: Editor de curvas por puntos ("Personalizar")

- **Estado:** implementado y subido a `main` en el commit `4365c32`.
- **Qué se hizo:**
  - Botón **Personalizar / Listo** en el carril Volumen. En ese modo las ondas no se deslizan y la vista general queda bloqueada.
  - **Puntos:** se mueven, se añaden con doble clic y se borran. Hacen snap al beat, al medio beat y al centro de la ventana (Shift para moverlos libres). Los extremos están fijos en el tiempo y su volumen es editable. Máximo 32 puntos por curva.
  - **Tramos:** asa central para curvar (arrastre) y alternar recto/suave (doble clic).
  - **Teclado:** Tab entre puntos; ← → beat (Shift medio beat, Alt compás); `,` `.` 10 ms; ↑ ↓ 5% (Shift 25%); `<` `>` curvar; E suave/recto; Supr borrar; Enter añadir; Inicio/Fin.
  - **Deshacer / rehacer** de todo el borrador del editor: 100 pasos, y un arrastre cuenta como un paso.
  - **Navegación entre transiciones** con ‹ › y `[` `]`. Si hay cambios, pregunta Guardar / Descartar / Seguir editando.
  - **Integración con la SPEC 01:** una curva personalizada pone el chip en "Custom". Elegir preset, estilo o Auto la reemplaza. "Restablecer curva" vuelve al estilo.
- **Archivos nuevos:** `src/lib/gainCurve.ts`, `src/lib/gainCurve.test.ts` y `src/ui/curveEditor.ts`.
- **Decisiones durante la implementación:** la curva inicial de Smooth crossfade usa 3 puntos con curvatura ajustada (error de 1,03%), y su test tolera un 1,5%. Con 2 puntos el error era del 5,6%.
- **Verificación:** 71 tests pasan, `tsc` sin errores y `vite build` compila.

### 2026-10-28 — SPEC 01: Mezclador de playlist con editor estilo Spotify Mix

- **Estado:** implementado y subido a `main` en el commit inicial `bc09bc6`.
- **Cómo evolucionó en el mismo día:**
  1. Cola de canciones a la izquierda y vista de una transición a la derecha, con ondas completas y 3 curvas (lineal, equal-power, corte).
  2. Vista alineada en el tiempo estilo Spotify: final de A arriba, inicio de B abajo, ventana fija al 60% y minimapas.
  3. Reescritura al formato de Spotify Mix tras investigarlo: playlist con chips, editor en diálogo y el resto de lo que sigue.
- **Qué quedó:**
  - Carga de MP3/WAV por selector y drag & drop.
  - Detección de BPM con `web-audio-beat-detector`, corregible en un popover con ×2, ÷2 y primer beat.
  - **Playlist** con un chip por transición (Auto / preset / Custom / Revisar) y toggle **Mix** (apagado, las canciones suenan seguidas).
  - **Editor** en `<dialog>` (diálogo en escritorio, hoja inferior en móvil):
    - Vista general de las dos canciones.
    - Ondas alineadas deslizables con snap al beat y nudge ±10 ms.
    - 1–16 compases (8 por defecto).
    - Presets Auto/Fade/Blend/Rise/Slam.
    - Carril Volumen con los 8 estilos de Spotify.
    - Borrador con Guardar / X y confirmación.
  - **Preview en bucle:** suena sola al abrir y se reinicia al cambiar algo.
  - **Sync de tempo:** B se ajusta al BPM de A durante la transición y vuelve gradualmente al suyo.
  - **Tema oscuro** con la paleta de la captura de referencia y marca propia, sin elementos de Spotify.
- **Decisiones durante la implementación:**
  - Las transiciones en Auto se recalculan si cambia el BPM o el primer beat.
  - Se crea la transición aunque falte el BPM, para poder escribirlo desde el editor.
  - El nudge ‹ adelanta el punto y › lo retrasa.
- **Verificación:** 42 tests pasaban al cerrarla, y el usuario la marcó como `Implementado` con todos los criterios en `[x]`.

---

## SPEC 03 — Exportar la mezcla a WAV y MP3

**Objetivo tentativo:** Descargar la mezcla completa (con Mix encendido o apagado) como archivo WAV o MP3.

**Lo que ya sabemos:**

- `buildTimeline` y `buildSequentialTimeline` son puros. La SPEC 01 los dejó así para reutilizarlos con `OfflineAudioContext`.
- El usuario pidió explícitamente los dos formatos: MP3 y WAV.
- WAV se genera directamente desde el `AudioBuffer` renderizado. MP3 necesita un encoder en el navegador.

**Preguntas abiertas:**

- Encoder MP3: ¿qué librería y qué bitrate (128, 192, 320 kbps)?
- ¿Exportar la mezcla entera, o también una sola transición?
- Nombre del archivo descargado.
- ¿Indicador de progreso y botón para cancelar renders largos?
- ¿Qué pasa si hay transiciones inválidas: se bloquea la exportación como "Reproducir mezcla"?

---

## SPEC 04 — Carriles EQ y Filtro

**Objetivo tentativo:** Añadir al editor los carriles EQ y Filtro de Spotify Mix, con sus estilos, su curva editable en Personalizar y los presets que dependen de ellos.

**Lo que hace Spotify Mix** (nombres según vimj, reconstrucción de terceros a partir del cliente de Spotify):

- **EQ, 9 estilos:**
  - Center bass swap
  - End bass swap
  - Start bass swap
  - 3-band fade
  - Quick bass cut
  - Long bass cut
  - Start fade out
  - Bass fade out
  - None
- **Filtro, 11 estilos:**
  - Low pass filter out
  - Low pass filter in
  - Low pass filter in low pass filter out
  - Low pass filter in high pass filter out
  - High pass filter out
  - High pass filter in
  - High pass filter in high pass filter out
  - High pass filter in low pass filter out
  - High-pass filter half out
  - Noise out end
  - None
- **Resonancia** ajustable en el filtro (según AbsoluteGeeks).
- **Presets que dependen de estos carriles:**
  - **Wave:** low-pass solo en la canción entrante.
  - **Melt:** high-pass solo en la canción entrante.
  - **Rise:** su receta completa es volumen Overlap + EQ de graves + filtros de entrada y salida.
- **Customize:** también aplica a las curvas de EQ y Filtro. La SPEC 02 dejó `GainCurve` genérico para reutilizarlo.
- **Líneas de color:** cada carril se dibuja con su propia línea sobre las ondas.

**Preguntas abiertas:**

- Bandas del EQ: frecuencias de corte de graves, medios y agudos.
- Rango de frecuencias del filtro y valor por defecto de la resonancia.
- Qué significa exactamente cada estilo, porque Spotify no lo publica: hay que definir fórmulas propias, como en Volumen.
- "Noise out end" genera ruido. ¿Entra o se descarta?
- Color de las líneas de EQ y Filtro (tokens nuevos en `styles.css`).
- Cómo se ven varios carriles a la vez en Personalizar: ¿uno activo cada vez o todos?

---

## SPEC 05 — Carril Efectos y Looping

**Objetivo tentativo:** Añadir los efectos de reverb/delay/echo y el looping de beats sobre la canción saliente, con los presets que dependen de ellos.

**Lo que hace Spotify Mix** (según vimj):

- **Efectos, 12 estilos, solo sobre la canción saliente:**
  - Reverb out center
  - Reverb cut end
  - Reverb out end
  - Delay ½ cut end
  - Delay ¾ cut end
  - Echo ½ cut end
  - Echo ½ out end
  - Echo ¾ cut end
  - Echo ¾ out end
  - Echo 1 cut end
  - Echo 1 out end
  - None
- **Cómo terminan los efectos:** los "out" siguen sonando después de la ventana y los "cut" se cortan al final. Echo repite varias veces; delay, una sola.
- **Looping de la canción saliente:** loop de 1, 2, 4, 8 o 16 beats, o "Loop halving". El loop se repite desde el inicio de la ventana hasta su final, con un crossfade de 4 ms en cada salto.
- **Presets:** Dissolve, Surge y Afterglow. Sus recetas no se conocen; vimj las deduce de los nombres.
- **Slam:** hoy es solo Center cut; habría que revisar si su receta completa incluye efectos.
- Giani recomienda no usar EQ y efectos de filtro a la vez porque interfieren.

**Preguntas abiertas:**

- Reverb: ¿impulso generado o archivo de impulso incluido en la app?
- Recetas propias para Dissolve, Surge y Afterglow.
- ¿Los efectos tienen curva editable en Personalizar?
- ¿El looping es un carril más o un control aparte?

---

## SPEC 06 — Tonalidad Camelot, Smart Reorder y carátulas

**Objetivo tentativo:** Detectar la tonalidad de cada canción, mostrarla en notación Camelot y reordenar la playlist por BPM y tonalidad, como Spotify Mix.

**Lo que hace Spotify Mix:**

- Cada canción muestra BPM y tonalidad (en notación estándar y Camelot, p. ej. `6B`) en la playlist y en el editor. La captura de referencia muestra el badge `1A`.
- **Smart Reorder:** ordena la playlist con un toque usando BPM y tonalidad. Se llega desde Mix → Edit.
- **Auto inteligente:** Auto elige el preset según lo bien que encajan las dos canciones. Hoy nuestro Auto es siempre Fade.
- Spotify recomienda canciones con tempos y claves Camelot cercanos.
- **Sugerencias de siguiente canción:** vimj propone las 5 mejores para seguir. No está confirmado que Spotify lo tenga.
- **Carátulas:** la captura las muestra junto a cada canción. Se pueden leer de los metadatos ID3 del archivo.

**Preguntas abiertas:**

- Librería de detección de tonalidad y cómo corregirla a mano (como el BPM).
- Criterio de Smart Reorder: qué pesa más, el BPM o la tonalidad; desde qué canción empieza.
- ¿Entra el Auto inteligente aquí, y con qué reglas elige el preset?
- ¿Entran las sugerencias de siguiente canción?
- Librería de metadatos para carátulas y qué mostrar si un archivo no tiene.
- ¿Se muestran también título y artista desde ID3 en lugar del nombre de archivo?

---

## SPEC 07 — Key lock

**Objetivo tentativo:** Igualar el tempo de las canciones durante la transición sin cambiar su tono, como hace Spotify Mix.

**Lo que ya sabemos:**

- Hoy usamos `playbackRate`, que cambia el tono, y mostramos el aviso "Cambio de tono audible" fuera de `[0.92, 1.08]`.
- La SPEC 01 descartó SoundTouchJS en AudioWorklet por CPU y complejidad, y lo dejó para esta spec.

**Preguntas abiertas:**

- Motor de time-stretch: SoundTouchJS, Rubber Band en WASM u otro.
- ¿Key lock siempre activo, o un interruptor por transición o global?
- Cómo mantener el playhead sincronizado con la latencia del procesado.
- ¿Debe funcionar también en la exportación (`OfflineAudioContext`)?
- ¿Se elimina el aviso de tono o se mantiene cuando key lock está apagado?

---

## SPEC 08 — Proyectos guardables

**Objetivo tentativo:** Guardar las canciones subidas y sus transiciones como un proyecto para retomarlo donde lo dejaste (pedido del usuario en la SPEC 01).

**Preguntas abiertas:**

- Dónde se guarda: IndexedDB en el navegador, archivo de proyecto descargable o ambos.
- ¿Se guardan los archivos de audio o solo referencias? Por seguridad del navegador, una referencia obliga a volver a elegir los archivos.
- Varios proyectos con nombre, o uno solo que se autoguarda.
- Versionado del formato para migrar cuando cambie el modelo de datos.
- ¿Incluye compartir el proyecto con otra persona? Spotify permite compartir mezclas y colaborar.

---

## SPEC 10 — App instalable (PWA) y audio en iOS

**Objetivo tentativo:** Convertir mixer en una PWA instalable desde "Añadir a pantalla de inicio" que abra sin conexión, y hacer que el audio se comporte bien en el iPhone.

**Preguntas abiertas:**

- Service worker propio o `vite-plugin-pwa`, y qué se cachea (solo la app; las canciones no se guardan hasta la SPEC 08).
- Nombre: **D-Mix** (decidido en la SPEC 09); falta el icono.
- Iconos, nombre corto, `display: standalone` y `scope`/`start_url` bajo `/d-mixer/` de GitHub Pages.
- Cómo avisar de la instalación en iOS, que no muestra un aviso propio.
- Interruptor de silencio: probar `navigator.audioSession.type = "playback"` (no aparece en documentación de Apple, solo en reportes).
- Audio en segundo plano y con pantalla bloqueada: en apps instaladas se corta; ¿se acepta o se avisa?
- Reportes de audio que falla en iOS 26 tras el primer uso en apps instaladas: cómo recuperar el `AudioContext`.
- Cómo se actualiza la app instalada cuando hay una versión nueva.

---

## SPEC 11 — Onda grande con zoom en el editor de transición

**Objetivo tentativo:** Ver las ondas de A y B en grande y con zoom horizontal en el editor, para encajar el beat de la transición con precisión (como el editor de Spotify Mix).

**Ya decidido (2026-10-28, tras probar la SPEC 09 en iPhone):**

- **Zoom:** pellizcar con dos dedos y botones −/+. Con zoom, la onda se recorre deslizando.
- **Distribución:** la onda ocupa cerca del 60% de la altura arriba y las opciones siguen debajo con scroll normal. Se descartó la pantalla completa con panel deslizable.
- **Fluidez:** no es prioridad; está bien que el arrastre salte de beat en beat.
- **Motivo:** hoy la ventana ocupa siempre el 60% del ancho del escenario. Con 8 compases a 390 px cada beat mide unos 7 px y los golpes quedan pegados; más altura sola no lo resuelve.

**Preguntas abiertas:**

- Niveles de zoom (mínimo y máximo) y si el zoom se recuerda entre transiciones.
- Cómo conviven pellizcar, deslizar la onda para cambiar el punto de salida o entrada, y recorrer la onda con zoom.
- Si las dos ondas se recorren juntas o por separado.
- Cómo se ve el inicio de la transición cuando queda fuera de la vista.
- Si el modo Personalizar (curvas) también usa el zoom.

---

## Ideas vistas que no están asignadas a ninguna spec

Salieron en la investigación o en las specs como "fuera de alcance". **No entran al roadmap salvo que se decida lo contrario.**

- **De Spotify Mix:**
  - Shuffle compatible con Auto.
  - Colaboración y compartir mezclas.
  - Spotify Connect (no aplica a archivos locales).
- **Del editor:**
  - Transición de la última canción a la primera.
  - Ondas coloreadas por frecuencia (naranja, azul y blanco en la captura).
  - Zoom manual de la vista alineada.
  - Seek y pausa durante la reproducción.
  - Compases que no sean 4/4.
- **De curvas (SPEC 02):**
  - Copiar y pegar curvas.
  - Presets de curva propios.
  - Vincular las curvas de A y B.
  - Selección múltiple de puntos.
- **De la app:**
  - Tema claro.
  - URLs remotas.

## Ideas futuras que pueden ser útiles

Propuestas que no salieron de Spotify Mix sino de cómo trabajan las apps de DJ y de los límites que vimos en mixer. **Ninguna está decidida.** Cada una necesitaría su propia spec o entrar en una existente tras pasar por `/spec`.

Tamaño estimado: **S** (una spec pequeña), **M** (una spec normal), **L** (varias specs o mucho riesgo técnico).

### Análisis y precisión musical

| Idea | Para qué sirve | Tamaño | Encaja con |
| --- | --- | --- | --- |
| Tap tempo | Marcar el BPM tocando una tecla al ritmo cuando el detector falla. | S | Popover de BPM (SPEC 01) |
| Marcar el compás 1 (downbeat) | El snap asume que el primer beat empieza un compás; si no es así, las transiciones caen a mitad de frase. | S | Popover de BPM |
| Puntos de transición sugeridos por frases | Detectar intros y outros por energía y proponer salidas y entradas en límites de 16 o 32 compases. | M | Auto inteligente (SPEC 06) |
| Detección de tempo variable | Avisar cuando una canción cambia de tempo, porque el grid fijo se desalinea en temas en vivo o antiguos. | M | Independiente |
| Normalización de volumen (LUFS) | Igualar el volumen percibido entre canciones para que la entrante no suene más fuerte o más débil. | M | Independiente; afecta a la exportación (SPEC 03) |
| Ganancia por canción | Ajuste manual de volumen (trim) por canción. | S | Popover de BPM o fila de la playlist |

### Edición y flujo de trabajo

| Idea | Para qué sirve | Tamaño | Encaja con |
| --- | --- | --- | --- |
| Línea de tiempo de toda la mezcla | Ver la playlist entera como una sola pista con los solapamientos y la duración total. | M | Independiente |
| Duración total de la mezcla | Mostrar cuánto dura la mezcla con las transiciones aplicadas. | S | Barra inferior (SPEC 01) |
| Recortar inicio y fin | Saltar intros largas de la primera canción o terminar antes la última. | S | Fila de la playlist |
| Fade-in inicial y fade-out final | Que la mezcla no empiece ni termine de golpe. | S | Exportación (SPEC 03) |
| Comparar A/B | Escuchar la transición guardada frente al borrador sin perder cambios. | S | Editor (SPEC 01–02) |
| Deshacer en la playlist | Recuperar una canción quitada por error o un reordenamiento. | S | Playlist (SPEC 01) |
| Importar una carpeta o un M3U | Cargar una playlist entera de una vez. | S | Carga de archivos (SPEC 01) |
| Atajos globales | Espacio para reproducir/detener y teclas para abrir la transición siguiente. | S | Independiente |
| Marcadores (hot cues) | Guardar puntos de interés en una canción para usarlos como salida o entrada. | M | Editor |

### Escucha y modo en vivo

| Idea | Para qué sirve | Tamaño | Encaja con |
| --- | --- | --- | --- |
| Pre-escucha por auriculares | Mandar la preview a otra salida de audio (`setSinkId`) mientras suena la mezcla. Típico de DJ. | M | Independiente; depende del navegador |
| Modo en vivo con crossfader | Mezclar en tiempo real con un fader en pantalla y grabar el resultado. | L | Independiente |
| Controladores MIDI | Manejar el crossfader, play y presets con un controlador de DJ (Web MIDI). | M | Modo en vivo |

### Sonido avanzado

| Idea | Para qué sirve | Tamaño | Encaja con |
| --- | --- | --- | --- |
| Separación de stems | Separar voz, batería y bajo para transiciones tipo "acapella sobre instrumental". Lo tienen apps como djay o rekordbox. | L | Tras SPEC 04–05; modelos de IA en WASM, pesado |
| Biblioteca de transiciones favoritas | Guardar una transición completa (puntos relativos, carriles y curvas) y aplicarla a otro par. | M | SPEC 08 |

### Calidad técnica

| Idea | Para qué sirve | Tamaño | Encaja con |
| --- | --- | --- | --- |
| Análisis en un Web Worker | Calcular picos y BPM fuera del hilo principal, para que la UI no se congele con muchas canciones. | S | Carga de archivos |
| Liberar memoria de audio | Decodificar bajo demanda en vez de guardar todos los `AudioBuffer` (≈10 MB/min cada uno). | M | Riesgo ya identificado en SPEC 01 |
| Tests E2E con Playwright | Automatizar los criterios de aceptación de UI que hoy se prueban a mano. | M | Transversal |
| App instalable (PWA) | Usar mixer sin conexión e instalarlo como app en escritorio o móvil. | S | → SPEC 10 |
| Migrar la UI a un framework (Preact, Solid o React) | Dejar de sincronizar el DOM a mano cuando la app crezca. Hoy no hace falta: 1.800 líneas de UI y 3 vistas. Señales para migrar: 6–8 vistas o más, listas grandes con claves, bugs repetidos de sincronización (foco, `hidden`, botones desfasados), rutas reales o `src/ui/` por encima de unas 4.000 líneas. Solo se reescribe `src/ui/`: `state.ts`, `lib/` y `audio/` se mantienen. Angular descartado por peso. Al evaluarlo, revisar qué ofrece Motion en ese framework (tiene versiones oficiales para React y Vue; Preact solo vía `preact/compat`; Solid no tiene) y que hoy no se puede usar sin React, porque reemplazaría código propio de la SPEC 09: arrastre con inercia (`drag`), animaciones de layout automáticas (`layout`, en lugar del FLIP a mano), `AnimatePresence` para animar al salir y `Reorder` para listas reordenables. | M | Revisar antes de la SPEC 08 (primera con varias pantallas); ver SPEC 09 |

## Fuentes

- [Spotify Support — Mixed Playlists](https://support.spotify.com/us/article/mixed-playlists/)
- [Spotify Newsroom — Mix your playlists](https://newsroom.spotify.com/2025-08-19/mix-your-favorite-playlists-seamlessly-by-adding-your-own-transitions/)
- [Spotify Newsroom — Smart Reorder](https://newsroom.spotify.com/2026-02-25/smart-reorder-playlist-mixing/)
- [Engadget](https://www.engadget.com/2216279/how-to-use-spotify-mix-tool/)
- [Make Tech Easier](https://maketecheasier.com/spotify-mix-dj-for-playlists/)
- [Johannes Giani](https://www.johannesgiani.de/en/blog/custom-song-transitions-with-spotify-mix/)
- [AbsoluteGeeks](https://www.absolutegeeks.com/reviews/i-turned-my-spotify-playlists-into-seamless-dj-sets-with-one-feature/)
- [vimj (reconstrucción de terceros)](https://github.com/lorenzolfm/vimj)
