# Daytona USA Web — 53.8.30: spectator fixes and multiplayer UI polish

This release includes the packaged 53.8.25–53.8.30 updates:

- Spectator startup validates the actual actor grid and player mapping, with
  fixes for joining a race in progress and switching player sound.
- Reverse CPU cars use the correct orientation reference for slope and banking
  on all three circuits.
- Menu titles are upright; Back icons, dropdown spacing, spectator name tags
  and menu transitions follow the existing interface style.
- During an arcade session, players and viewers share join, spectating and
  departure notices. Temporary reconnections do not replay arrival notices;
  private admission requests remain host-only. Visual notices stay out of lobby.
- Connections now sits between Controller vibration and Settings in the room
  header. Active cabinets display IN GAME or PREPARING; READY remains a lobby
  state. The Last connection report shortcut was removed from the start menu.

Validation includes 432 automated checks for the 53.8.29 changes and targeted
Chrome UI checks at five viewport sizes for 53.8.30. The runtime below matches
MANIFEST.sha256. Reload all participating browsers to use the current files.
Mobile UI work after 53.8.30 is not part of this publication. Existing licenses,
contributor credits and server-side security settings are preserved.

---

## Previous release notes

# Daytona USA Web — 53.8.24: G29 macOS support and room/chat improvements

Release 53.8.24 integrates [gareth10203's PR #3](https://github.com/johannruiz/Daytona-USA-Web-multiplayer-test/pull/3).
The Logitech G29 force-feedback provider preserves seven-byte native commands and
pads them to the wheel's advertised output-report size, including the 16-byte
descriptor reported on Chrome/macOS. Device selection retains the correct wheel
collection filters. The original contributor commit is retained in the merge
history; see [CONTRIBUTORS.md](CONTRIBUTORS.md).

This publication also includes the previously packaged 53.8.22 and 53.8.23 changes:

- Public rooms are announced in Discord through the separately deployed,
  authenticated Worker. The same announcement is closed when the room disappears;
  player counts are omitted. Webhook and service-account credentials stay on the
  server and are absent from this repository update.
- PREPARING CABINET uses the disabled appearance from single player for both
  hosts and guests.
- Lobby, in-game and spectator chats follow new messages until the reader scrolls
  upward. Reading position survives panel changes and bounded-history trimming;
  the new-message button and sending a message return to the latest line.
- Notification sounds are approximately 8 dB louder while retaining Interface
  volume, mute, distinct motifs and existing notification cadence.

Validation: **417 automated tests passed** in the integration workspace, plus
Chrome checks of the three chats, mobile lobby tabs, preparation-button styling
and rendered notification audio. **71 repository tests also pass**, including focused
G29 lifecycle, pairing, provider and diagnostics regression tests. Physical G29
confirmation on macOS is still pending; this is descriptor-based support.
The four main/preview engine JS/WASM files are unchanged from 53.8.23. The runtime
at the repository root matches `MANIFEST.sha256`. Reload to load the new version.

---

## Previous release notes

# Daytona USA Web — 53.8.21: protected TURN connectivity

Release 53.8.21 adds authenticated Cloudflare TURN fallback for networks that
cannot establish a direct WebRTC connection. Direct connections remain preferred.
Temporary relay credentials refresh automatically; selected relay paths renew ICE
while retaining the existing reliable and movement channels.

The separately deployed credential service validates Firebase Authentication and
App Check, applies persistent global and per-identity issuance limits, and checks
TURN usage every two minutes. Its SQLite controller retains the 900 GB safety
latch and independently retries failed credential revocations in bounded batches.
This is a software safety stop, not a guaranteed billing cap. No server-side
credentials, private debug tokens or deployment tokens are included in this repo
update. No Firebase database-rule change is required for this release.

Validation: **396 automated tests passed**, plus live forced-relay UDP and TLS/443
checks, two-cabinet PeerJS admission/chat/Ready/movement, relay renewal with
different temporary credentials during play, return to lobby, and a successful
scheduled usage check. These bounded transport checks do not replace a WAN
campaign with real game ROMs. The game engine JS/WASM is unchanged from 53.8.18.

All players should reload to use 53.8.21, especially for relay sessions lasting
more than two hours. The published runtime is at the repository root and matches
`MANIFEST.sha256`. Existing contributor credits and license notices are retained.

---

## Previous release notes

# Daytona USA Web — 53.8.18: WebHID wheel feedback and updated runtime

Release 53.8.18 includes the WebHID force-feedback providers, diagnostics, night settings, renderer and multiplayer fixes, and matching game JS/WASM. See [CONTRIBUTORS.md](CONTRIBUTORS.md) for @gareth10203's PR #2 contribution and the existing LICENSE, NOTICE.md and THIRD_PARTY.md for notices.

All players should use the same release. Publish the runtime files at the site root. The 53.8.18 ZIP has been hash-checked; browser/device compatibility and live multiplayer still require testing.

---

# Daytona USA Web — 53.2: single-player liveries

**Single Player → Your livery** opens the same selector used in multiplayer: Original seat livery and 39 original CPU appearances. All forty previews prepare behind the same progress overlay, generated from the verified local ROM and reused from this browser's cache. The single-player Original is the normal red car of cabinet 1. The six setup cards retain a stable layout, including desktop 1280×720 and mobile widths.

Single-player livery is saved with local race preferences, independently of multiplayer reservations. Choosing it only edits the next configuration. If a game is paused, an unchanged appearance resumes it; a changed appearance explicitly offers **Apply & Restart**. Original resets the override on that restart. Escape/B closes the livery selector before leaving setup. Skin selection does not change the player's number, CPU appearances or driving controls.

The native extension adds a bounded standalone setter. It targets only the original local car pointer with player ID zero while no centralized link is active. It reuses the original livery selectors and model recovery hooks; multiplayer retains its existing link-ID mapping. Loading/closing/disabling a link clears both override scopes. Physics, progress, ranking and CPU policies remain intact. Preview WASM, graphics renderers, network transport and Firebase rules are preserved.

Validation: **298 passing Node tests**; actual production single-player selection, loading, persistence, resume and Original restart; eight standalone native races including all three circuits in both directions and Time Attack; 39 catalog selector checks; original damage recovery; six multiplayer native races plus recovery/guest-only start; eighteen RAM/texture parity samples against the previous native engine with Original; multiplayer UI and two production cabinets. These are local Chrome checks, not a new WAN or physical mobile-Safari certification.

Publish ZIP contents with index.html at the root. All players use 53.2. Local: `node scripts/serve.js dist 8136`. The prior 53.1.1 folder/ZIP remain unchanged. No ROM, generated car thumbnails, browser profiles or private native audit hooks are packaged.

---

## Previous release notes (historical)

# Daytona USA Web — 53.1.1: visible livery preparation

Opening the livery selector now displays an overlay with a progress bar before selection becomes available. It prepares all **40 choices**: the current seat's Original appearance and the 39 CPU liveries. While the ROM/preview scene is being prepared, the bar is indeterminate; after the first image is ready it advances using the real decoded-image count, e.g. **10 of 40**. No invented timer or estimated percentage is used.

The gallery and Use livery remain disabled until preparation finishes. Close, Cancel, Escape and standard gamepad B remain available throughout. If a preview fails, the overlay provides **Continue without previews**; it never silently unlocks an incomplete gallery. Closing, room/preparation changes and stale image completions retain the existing cancellation behavior. Cached views are reused locally. English UI, fixed dialog size, portrait/landscape layouts and reduced-motion support are preserved.

Only the selector UI/styles and version cache identifiers changed. Main game engine JS/WASM, preview engine WASM, physics, network transport, reservations and Firebase rules remain unchanged. The 53.1 ZIP is preserved. Validation: 296 Node tests; controlled loading/progress/heartbeat/error/late-completion checks; keyboard/gamepad cancellation; four loading layouts and five selector layouts; real-ROM generation of the entire selector; two production cabinets selecting/starting/restoring Original. Local server remains `node scripts/serve.js dist 8135`.

---

## Previous release notes (historical)

# Daytona USA Web — 53.1: local ROM livery previews

Based on 53.0, preserved in multiplayer-player-skins and its original ZIP. All participants must use 53.1.

Open your own multiplayer lobby seat to choose **Original seat livery** or one of 39 CPU appearances. Original now has a real thumbnail matching your selected seat color, including all eight cabinet colors. Moving seats keeps a reserved CPU appearance; choosing Original restores that seat's normal appearance.

The selector generates its thumbnails from the verified ROM already supplied on this browser. No livery screenshots are included in this release. A separate, short-lived worker with its own preview-only WASM engine renders a stationary car scene using the original software renderer. It needs no WebGPU/WebGL context and never touches the active game, its save data, audio or communications. Only the preview module can select its bounded livery/seat combinations; no arbitrary memory/debug hooks are exported. The primary game JS and WASM are byte-identical to 53.0.

Generation is lazy: opening the selector requests Original, the selected appearance and visible cards; scrolling or focusing another card requests its preview. The first uncached view takes several seconds, depending on the device. The dialog remains usable throughout, with fixed image dimensions and placeholders. Closing it, hiding the page, leaving the lobby, starting preparation or changing ROM cancels pending work and terminates the worker. An idle worker is released after 30 seconds. Choosing and playing remain available if previews fail.

Small PNG blobs are stored only in local IndexedDB, keyed by installation path, preview format, SHA-256 of the exact ROM ZIP and appearance. Original has a separate entry for each seat; CPU previews are shared across seats. Old ROM entries are pruned when opening previews. Cached views do not start a worker or load the preview WASM. A denied/full browser store still allows previews for the current visit; clearing/evicting browser storage requires regenerating them. Neither the ROM nor these images are uploaded, and this feature adds no Firebase fields/writes or skin movement messages.

Validation: **296 passing Node tests**, all 39 CPU appearances and eight Original colors rendered/decoded in Chrome, IndexedDB reuse, fresh-service reuse, old-entry pruning, cancellation and zero network uploads from the preview pipeline. The full livery UI passes five viewport sizes, keyboard/gamepad/focus/reservations and a real-preview selector check. Two actual production engines pass selection/preparation, controller/wheel/pedals/touch/chat and a second session restoring Original. Desktop Chrome was tested; physical mobile Safari and all low-memory devices are not certified. The UI remains usable when the browser cannot render a preview.

Publish ZIP contents with index.html at the root. Local: `node scripts/serve.js dist 8135`. Build frontend: `node scripts/build.mjs`; rebuild the isolated renderer with `scripts/build-skin-preview.py` after the referenced 53.0 native release objects are available. No ROM, generated livery image files, browser profiles or private test hooks are packaged. This release does not alter earlier folders, archives or published Git history.

---

## Previous release notes (historical)

# Daytona USA Web — 53.0: player liveries

Based on 52.8.1, preserved in multiplayer-arrival-alerts and its original ZIP. All participants must use 53.0.

Select your own occupied seat in the multiplayer lobby to open **Choose your livery**. Choose **Original seat livery** or one of 39 original CPU appearances with in-game preview images. Confirm with **Use livery**. The dialog has stable dimensions, bounded gallery scrolling, keyboard focus containment, touch support and standard gamepad A/directions/B. Driving bindings are unchanged. A small Last used label remembers a prior choice locally; it does not reserve an appearance in another room automatically.

A CPU livery is reserved to one admitted player in the room. Taken options identify their owner. Reservations survive car-number changes, swaps, a race ending and the existing reconnection grace; departure releases them. Original seat appearance remains available. The host validates requests for the requesting player's identity only, serializes competing claims and rejects stale or invalid choices. Changes reset Ready. Liveries cannot change during preparation or play.

The confirmed roster carries catalog IDs over the existing reliable room channel. Each native engine installs the same link-ID-to-livery table before reporting prepared. Native link identity, selected car number and livery remain separate. The appearance changes original visual selectors and model/accessory restoration only. Physics, CPU behavior, positions, rank, finish authority, network motion and the simulation clock are preserved. The number painted on an original CPU model can differ from the cabinet/car number; the HUD names and player markers retain player identity. CPU exterior models retain their original geometry rather than gaining the Hornet's detailed deformation variants.

Validation: 292 Node tests including eight-member reservation/preparation cases; two real linked native engines on all three circuits in both directions with sparse seats 6/3, all 39 selector rows, native model-recovery fixtures, and guest-only racing with host in attract. Defaults are compared against the previous engine using RAM and texture banks. Browser checks cover the livery dialog, gamepad, lobby viewports and the real production preparation/control/chat pipeline, including a second session restoring Original. See INVESTIGACIONES.md and private build reports for precise scope. These local checks do not certify all physical controllers, mobile Safari, every damage geometry or a new WAN stress scenario.

The 39 static thumbnails are captures rendered from the original models by a private asset generator; its RAM-write fixtures are not in the product. There are no image uploads, custom texture downloads, per-frame skin messages or new Firebase fields/writes. Existing arrival notifications, menu backdrop, ROM memory, graphics APIs and manual diagnostics remain available.

Publish ZIP contents with index.html at the root. Local: `node scripts/serve.js dist 8134`. No ROM, browser profiles or private test hooks are packaged.

---

## Previous release notes (historical)

# 52.8.1 — game menu backdrop

Restore the previous dark overlay and 7px backdrop blur only when an existing game image is behind the menu. Keep the initial decorative background clear and slightly visible. CSS-only change using the existing playing class. Single-player production-engine browser checks cover initial menu, Escape, Settings and desktop/mobile viewports. No simulation, network or arrival-alert behavior changes.

# Daytona USA Web — 52.8: lobby arrival alerts

Based on 52.7, preserved in its original folder and ZIP. All participants must use 52.8.

A new soft two-chord arrival sound distinguishes drivers joining the lobby from chat, Ready and join requests. It uses the existing UI volume and mute settings. Lobby guests hear arrivals; playing guests are not interrupted by arrival sounds. The host also hears arrivals during a session.

The host receives browser/system notifications naming drivers who join a public room or request access to a private room, including waiting seats. Creating a room can request notification permission in that button's user gesture. Visiting the site or joining someone else's room does not request permission. Denying permission never prevents room creation or the existing sound alerts. Private admission after a request does not generate a second system notification.

Repeated room updates, reconnects, seat/name changes and waiting-seat promotion do not replay alerts. Clicking a notification focuses its original host tab and opens the menu; stale room notifications cannot open or rejoin a room. The notification worker has no fetch handler, offline cache or push subscription. This uses existing room snapshots, with no extra Firebase writes or movement traffic.

New arrivals can be detected while the host page remains open and connected. This is not server push after the page/browser closes. HTTPS (or localhost), permission, browser support and OS notification settings determine delivery. Ordinary mobile browsers may not offer system notifications; sound and normal room operation remain available.

Validation: 289 Node tests; browser arrival/permission/deduplication checks, real service-worker routing with the OS display boundary simulated, five production audio waveforms, lobby layouts and production-engine ROM/chat regressions. A physical Windows banner and installed iPhone PWA were not certified. Native engine, sources, movement transport, cadence, Firebase rules and diagnostics defaults are preserved.

Publish ZIP contents with index.html at the root. Local: `node scripts/serve.js dist 8133`. No ROM or private test instruments are packaged.

---

## Previous release notes (historical)

# Daytona USA Web — 52.7: balanced lobby and clear background

Based on 52.6, preserved in its original folder and ZIP. All room participants must use 52.7.

The multiplayer lobby has three aligned panels for the starting grid, paged race settings and chat. The eight seats retain their original move/swap/Ready actions and car colors. Desktop 1280×720 and 1440×900 fit the ordinary lobby without page or roster scrolling. Extra join requests and swap actions use a bounded grid area; a Requests button exposes pending admissions and incoming swap controls scroll into view. Tablet uses two columns; mobile retains Room/Chat tabs and normal vertical scrolling.

The host's **Invite friends** button beside the title opens a small panel for the current link and code. It supports click outside, Close, Escape and standard gamepad B; A opens/activates and navigation stays inside while open. Keyboard Tab stays inside the panel. Clipboard success/failure is displayed there, and ordinary room updates preserve focus and text selection. The panel closes on room/phase changes and is unavailable for guests or offline rooms. Native browser popovers avoid clipping, with a disclosure fallback for older browsers.

Connection status sits with the room message above the action row. The original decorative background remains subtle, with no menu backdrop blur and slightly clearer number 41/checkered floor. There are no new artwork assets or gameplay rendering changes.

Native engine, native sources, movement transport, cadence, race authority, Firebase rules, diagnostics defaults and ROM memory remain unchanged. The new invitation controller is driven by UI events, with no network activity or per-frame timer. Menu gamepad commands still use standard physical UI buttons and do not edit driving bindings.

Validation: 277 Node tests, build/lobby-validation/validation.json, build/rom-memory/validation.json and build/chat-polish/validation.json. Browser checks cover 8-seat DOM states, admission/kick/move/swap/chat controls, invitation access/clipboard/focus/gamepad/fallback and six viewport sizes. Production-engine regressions cover remembered-ROM restoration/starting and chat/controller inputs with two locally linked cabinets. This is not a new WAN or physical iPhone certification.

Publish ZIP contents with index.html at the root. Local: `node scripts/serve.js dist 8132`. No ROM, browser profile or private fixture bindings are packaged.

---

## Previous release notes (historical)

# Daytona USA Web — 52.6: remember the ROM on this browser

Based on 52.5, preserved in its original folder and ZIP. All room participants must use 52.6.

After the original native engine verifies a selected ROM ZIP, the browser keeps one copy in IndexedDB for this published installation. On subsequent visits, after graphics and WASM startup finish, it retrieves and revalidates that ZIP and opens the mode menu automatically. Invitation links still open the correct multiplayer entry. The game does not start playing until the user chooses to start.

The main mode menu contains one small **Change ROM** button. It is hidden inside single-player setup, multiplayer entry and the lobby. Choosing an invalid replacement restores the preceding loaded ROM and leaves the stored copy intact. A replacement is saved only after successful validation. Storage errors or quota failures do not prevent playing; a failed storage transaction keeps the previous saved record.

The ZIP, its filename and contents stay on the device. This feature does not upload them to Firebase, Analytics, PeerJS or any server. IndexedDB is scoped to the browser origin and installation path, without the room hash or renderer query. Clearing site data, another browser/device, private browsing or browser storage eviction can require selecting the ZIP again. No persistent-storage permission prompt or extra checkbox is added.

Native JS/WASM and all native sources are byte-identical to 52.5. Rendering, simulation cadence, movement transport, optional race rules, Firebase rules and diagnostics defaults are preserved. The cache is accessed on startup or ROM changes only; it adds no per-frame work.

Validation: 277 Node tests and build/rom-memory/validation.json. The browser check uses the production engine and a real local ZIP, closes and relaunches Chrome with a persistent profile, tests invalid replacement, invitation routing, aborted storage writes, denied IndexedDB, cleared storage and three menu sizes. Local Chromium validation does not certify physical iPhone/Safari storage retention. No ROM or private browser profile is packaged.

Publish ZIP contents with index.html at the root. Local: `node scripts/serve.js dist 8131`.

---

## Previous release notes (historical)

# Daytona USA Web — 52.5: paged race settings and optional race rules

Based on 52.4, preserved in its original folder and ZIP. All room participants must use 52.5.

The lobby's **Race settings** panel now has Previous/Next buttons and a page counter. **Race setup** contains mode, difficulty, CPU cars and direction; **Race rules** contains player collisions, pit stops and CPU liveries. Changing pages keeps the panel height and selected values stable. The page choice is local and survives room updates; guests can browse both pages. Only the host can edit settings, while in the lobby. Rule changes clear Ready and are applied to every cabinet on session start.

Original behavior remains the default: contacts On, pit service On, multiplayer CPU liveries. Optional rules:

- **Player collisions Off:** skip human–human contact response. CPU contacts and walls stay solid. Car poses, traffic ordering and slipstream routines are not disabled.
- **Pit stops Off:** prevent the original automatic pit entry/service transition. The lane stays open to drive through as a shortcut. Also available in the Single Player setup and saved on that device.
- **CPU liveries Single player:** use original single-player appearance selectors for bots in a linked game. Human colors, IDs, AI and physics are retained. This selector is disabled when CPU cars are Off.

No changes to the movement channel, network pacing, frame clock, renderer, Firebase rules, App Check or Analytics. Diagnostics remain off by default. The new rules are native, scoped read predicates in the existing recompiled engine; no Lua runtime or per-frame teleporting is added.

Validation: 270 Node tests; the paged panel tested at 1440×900, 1280×720 and mobile 390×844; two real native engines completed a lap on all three courses in both directions with the rules enabled. Original CPU appearance selectors were checked for every bot. Default-rule RAM/texture parity covers boot, attract, selection and reload. See INVESTIGACIONES.md for exact evidence and limits. Local tests do not certify all WAN conditions, physical controllers, iPhone Safari, every collision geometry or a full pit-lane finish on each course.

Publish the ZIP contents with `index.html` at the root. Local: `node scripts/serve.js dist 8130`. No ROM, generated game listing or private diagnostic bindings are packaged.

---

## Previous release notes (historical)

# Daytona USA Web — 52.4: chat controls and layout

Based on 52.3, preserved in its original folder and ZIP. All room participants should use 52.4.

Typing in the in-game chat suppresses keyboard driving only. The selected controller, calibrated wheel, separate pedals and held touch controls continue to be polled. Opening or sending chat does not clear physical device edges or remap buttons. Minimize restores canvas focus; keyboard driving resumes normally after leaving the field.

The scrollbars use the light ivory/grey room palette. New-message buttons are centered by their own anchor in both game and lobby, so shared hover/pressed transforms cannot displace them. Room heartbeats do not repeatedly scroll unchanged history. When the bounded history trims old messages, the surviving line being read stays anchored.

On touch screens the smaller CHAT button sits on the left, above steering, with a 44 px minimum target. Opening history by touch does not automatically open the software keyboard. The expanded panel leaves gear/pedal controls clear and adjusts to portrait, landscape and control sizes through 140%.

The waiting-seat policy, reliable chat protocol, native engine, movement transport, race authority, graphics and frame clock are unchanged. Chat still hides and locks at native start and returns in attract. Firebase rules/configuration are unchanged; diagnostics stay off by default.

Validation: 268 Node tests and `build/chat-polish/validation.json` (real DOM checks, seven emulated mobile layouts and two production WASM engines with browser-emulated controller/wheel/pedals). This does not certify physical devices or iPhone Safari. Private test bindings and ROM are not packaged.

Publish the ZIP contents with index.html at the root. Local: `node scripts/serve.js dist 8129`.

---

## Previous release behavior

# Daytona USA Web — 52.3: waiting seats during a session

Based on 52.2. All players must use 52.3. The previous release remains in its original folder and ZIP.

Drivers can join while the arcade is preparing or running. They reserve an open seat, see the room roster and use the shared lobby chat. They do not start a native cabinet or spectate the game. The current cabinet roster, native link count, epoch and race authority remain fixed.

- Public rooms: direct entry to waiting. On return to the lobby, connected waiting drivers join the grid automatically with their reserved car number and Ready cleared.
- Private rooms: late arrivals can wait and chat; the host admits or declines them in the lobby. These actions are disabled during the current arcade session.
- The host gets a nonmodal toast that does not move focus or pause the game.
- Capacity is eight total active, waiting and pending drivers. Explicit departure frees a reservation; transport interruption retains it for the existing 30-second recovery period.
- Attract mode inside the arcade is not the room lobby. Use **Return all to room** to incorporate waiting drivers before starting the next linked session.

Chat uses the existing reliable connection, sender identity, 60-message history, 240-character limit, rate limiting and command receipts. Waiting participants cannot send native snapshots, progress, stop, Ready, seat changes or race results. Racing cabinets retain the previous hidden-chat and unread-message behavior.

The public directory keeps the same minimal Firebase schema and security rules. Its count includes waiting seats; compatible starting/racing rooms offer **WAIT FOR NEXT RACE** when capacity remains. Chat and player names are not added to Firebase. Inactivity pause, App Check and Analytics are preserved; no console changes are required.

Diagnostics remain off by default and manually available in **Connections**. Native WASM, graphics, physics, race authority and movement transport remain unchanged from 52.2.

Publish the ZIP contents with `index.html` at the root. Local: `node scripts/serve.js dist 8128`. No ROM or private fixture bindings are included.

Validation: `unit-tests.txt`, `build/waiting-room/validation.json`, `package-validation.json`, and `INVESTIGACIONES.md`. Local Chromium touch emulation is not physical iPhone/Safari certification. No new WAN benchmark is claimed.

## Preserved 52.2 chat behavior

Derivada de la 52.1, con diagnósticos detallados apagados por defecto y el mismo transporte de movimiento. No incluye la candidata 53.

El chat de la sala aparece sobre el juego, abajo a la derecha, en una ventana translúcida del mismo estilo que el lobby. Comparte historial y mensajes con éste. Se puede minimizar; el botón Chat muestra los mensajes nuevos de otros jugadores que siguen sin leer. Abrirlo o leer el final del historial en el lobby limpia el contador. La preferencia de minimizar se guarda sólo en el dispositivo; el texto pendiente no se guarda fuera de la página.

Está disponible durante attract, selección y presentación. Al entrar en la salida nativa (escena 22, que incluye rolling start/cuenta atrás) se oculta y no permite enviar, incluso desde el menú. Permanece deshabilitado durante carrera, resultados y registro de nombre; se habilita al volver a attract (escenas 0–10). No depende de un temporizador ni de audio inventado. La captura de estado local actual evita que un paquete propio de un fotograma anterior vuelva a cambiar la disponibilidad.

La política es por cabina: quien permanece en attract puede escribir mientras otros corren. Los corredores no ven el panel ni oyen sus avisos de chat; los mensajes quedan pendientes para cuando vuelvan a attract. El host comprueba la escena recibida de cada emisor y la sesión, y conserva la identidad autenticada, límites de longitud/frecuencia y confirmaciones de comandos. No se envían mensajes de chat por el canal descartable ni se guardan en Firebase.

Al escribir, los controles de conducción reciben valores neutros. Enter envía; Escape minimiza el chat cuando tiene el foco. No se introduce una tecla global que interfiera con los mapeos personalizados. La superficie de chat permite escritura y desplazamiento táctiles sin relajar la protección de los pedales/volante frente a gestos del navegador. En pantallas táctiles la ventana reserva espacio sobre los controles.

Esta sección describe el comportamiento heredado de 52.2; la distribución actual es 52.3 y usa el puerto 8128.

Validación y límites: INVESTIGACIONES.md y build/game-chat/validation.json. No se repite aquí un benchmark de red ni se afirma un cambio en la fluidez, física, clasificaciones o precisión de las colisiones.
