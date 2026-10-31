# v53.4.1 — player-follow preview

Local: http://localhost:8143/. Previous integrated v53.4 remains on 8142. All participants must use v53.4.1.

TAKE A SEAT and JOIN NEXT RACE now use a seat icon. The integrated spectator toolbar includes **Follow**, listing this session's real drivers by name and car. Switching uses the same relay, viewer identity and original playback; it does not negotiate another stream or increase the host's race uploads.

The bounded native selector is active only in read-only replay mode. It resolves the original human/link-ID table and redirects the camera-object callback's local-car read at 0x6d60. It never replaces the actual local-car pointer or changes runner inputs, physics, contacts, network or result authority. Normal runners cannot activate the selector through this API.

This is an initial external-view preview. Other drivers offer Behind and Far behind; close cockpit cameras remain available for the relay driver. HUD text is hidden for another driver because its data belongs to the relay; the traffic map and audio still follow the relay. Beginner's scripted rolling-start camera can temporarily override the intended perspective; the functional confirmation was made after GO. No promise of independent target HUD/audio or full start-sequence coverage is made here.

Validation was intentionally limited at the user's request: one functional scenario in local Chrome/WebGL2 with two real drivers and one spectator, switching host → relay → host during an actual CPU race after the rolling start. Native focus IDs, continuing playback/racers, the same viewer identity/relay, the seat icon and the two visual perspectives were checked. The scenario was first inspected during the scripted start and then repeated after GO to confirm the actual exterior views. No full unit/regression, eight-player, adverse-network or WebGPU comparison suite was run for this preview. Native release rebuilt; no private audit hooks or ROM are distributed. Report/screenshots: build/spectator-follow-smoke/ (not dist).

The Firebase rules are unchanged from v53.4. The prior instructions to permit zero-driver public listings still apply when publishing those integrated-room changes. No new ZIP has been created.

---

# Daytona USA Web — v53.4: spectators inside the room

Local: http://localhost:8142/ (`node scripts/serve.js dist 8142`). The earlier v53.3/8141 preview is preserved. All participants use v53.4. No new publication ZIP has been generated.

## Room roles

Enter a room normally to receive the next available driver seat. **SPECTATE** releases your seat while retaining your identity, invitation connection and room chat. The spectators row is shared with everyone and does not reduce the eight driver places. Full rooms admit additional people as spectators: automatically in public rooms, after the normal host approval in private rooms. Up to eight spectator roles are admitted.

Use **TAKE A SEAT** or select an open seat to become a driver again; the host serializes competing requests, so two people cannot take the same car. Native racers change roles in the lobby. An observer can reserve a free seat during a session with **JOIN NEXT RACE**; they enter the actual cabinet roster only after the host returns everyone to the lobby. That session's native identities, preparation revision and barriers remain unchanged. A host spectator returns everyone to the lobby before taking a seat.

**WATCH SESSION** opens the integrated dark viewer in the same page. It automatically opens when the next relay is assigned. **Back to room**, Escape and gamepad B return to the room and chat. There is no second ROM picker, spectator identity, approval or separate PeerJS control connection. The viewer reuses the verified ROM already supplied on this device. It supports the assigned relay's four cameras, sound and fullscreen. Host removal of a spectator, camera changes and closing the viewer do not end the race.

The host can also spectate without occupying a native cabinet. It retains Central Link distribution and result authority; the first actual driver supplies the original arcade MASTER. Returning the host to a seat restores it to the beginning of the native roster. At least two actual drivers are still required to start.

## Playback scope

The verified replay transport is retained: fifteen compressed transmissions per second contain every authentic intervening simulation step, with buffered original-engine playback. This is not sparse fifteen-state sampling plus new visual interpolation. Non-host drivers relay the stream (maximum two viewers per relay). Spectators are excluded from driving input, native participant count and readiness/preparation barriers. No new game/native engine modifications were needed for this integration; the release WASM is identical to v53.3.

A spectator arriving after the session bootstrap waits for the next arcade session before receiving a view, while room/chat remain available. Arbitrary midrace initialization, free switching between drivers and live relay migration remain outside this version. Changes to an actual racer or the host's connection retain the existing departure/visibility policy. A suspended or overloaded viewer can lose its replay without stopping the drivers.

## Firebase rule update before public publication

Publish this folder's **firebase.database.rules.json** in Realtime Database → Rules before deploying v53.4. The only rule difference permits an integer driver count from **0 to 8**, previously 1 to 8, so a host watching alone keeps a truthful open-room listing. Owner-only writes, bounded authenticated reads, field validation and App Check remain intact. Spectators never inflate the advertised driver count. No extra Firebase fields or race data are stored. These local checks did not modify production Firebase.

## Validation of this integration

- 313 Node tests passed: role identity/chat, serialized seat claims, duplicate command receipts, host without a native slot, unchanged preparation revision, observer removal during a race and zero-driver directory handling.
- Real Chrome/PeerJS/WebRTC, three game instances: driver becomes spectator in the same page, watches an actual CPU race, changes camera, returns to chat, reserves a seat, and enters the next session. Two runners also establish the original arcade link and enter a second actual CPU race while their host spectates; the host subsequently restores its seat.
- Eight real PeerJS driver connections admit the ninth entrant as a spectator and promote that same connection after a seat is freed. Six of these extra connections run room logic only, not eight simultaneous native simulations.
- Responsive dark viewer checked at 1440×1000 and 390×844; all eight lobby seats remain visible without grid scrolling at the desktop fixture size.
- 28 official Auth/Realtime Database emulator security checks passed, including zero drivers, denied negative/fractional/oversized counts, owner protection and bounded reads. Java 25 required a short local Unix-socket path; this was a test-only runtime setting.

Earlier eight-runner native replay, reverse/CPU/livery and impaired-network measurements belong to v53.3 below; this integration does not claim a fresh eight-physical-device WAN certification. Reports/screenshots are private build artifacts and are not placed in dist.

---

# Daytona USA Web — v53.3: distributed spectator preview

Local preview: http://localhost:8141/ (`node scripts/serve.js dist 8141`). The previous v53.2.4 folder remains unchanged. All participants must use v53.3.

## Watch a session

1. Create a room and admit at least one other driver. A connected non-host driver supplies the spectator stream.
2. Viewers use **Watch** in the public-room list, **Watch as spectator** with a private invitation, or the host's **Spectators → Open spectator page** link. Each viewer supplies their own local ROM; the existing browser ROM cache can be reused.
3. In a private room, the host opens **Spectators** and selects **Admit** before starting the arcade. Public-room spectators are admitted automatically.
4. Ready the drivers and select **START GAME**. The viewer follows its assigned relay player and can choose among the four original cameras, enable sound or enter fullscreen.
5. Disconnecting a viewer does not stop the drivers. A late viewer waits for the next arcade session.

## Scope and transport

Central Link remains responsible for the drivers. The host authorizes viewers and distributes them across connected non-host clients, with up to two viewers per relay and eight per room. Observers do not occupy driver seats, participate in the prepare barrier, transmit driving input or affect the official result authority. Firebase does not transport race data. No ROM or static car captures are distributed.

**15 transmissions per second carries every authentic intervening simulation step in compressed batches.** The viewer runs the original engine locally at its original cadence using a playback buffer. This is not sparse 15-state sampling with newly invented visual interpolation; retaining complete steps preserves original scene transitions, audio, CPU cars and game logic. It adds viewer delay. Reliable ordered delivery and bounded queues protect the replay; excessive backlog stops only the viewer.

This first preview follows the assigned relay only. Free switching between drivers, arbitrary midrace initialization and live relay migration are not implemented. Relay assignment balances viewer counts; it does not yet estimate spare upload capacity. Stopping a spectator stream/service was tested independently from leaving as an actual racing driver; the existing driver-departure policy remains in effect. The close driver camera retains the original arcade hood and cockpit, as requested in v53.2.4.

## Validation

- 307 Node tests passed, including codec bounds, decompression limits, admission, unauthorized grants, startup buffering, viewer presence and independent backpressure.
- Local native replay: eight runners plus one observer over 5,330 steps, comparing selected pose/progress/scene/callback fields. A two-runner Expert reverse replay with CPU cars and skins also passed.
- Default engine parity against v53.2.4: eighteen samples across two boots, comparing work RAM, texture banks and prepared geometry/batches.
- Real PeerJS/WebRTC: two drivers plus one observer entered an actual race. Camera changes, viewer closure, a second session and stopping only the relay service left the driver link active.
- Spectator-only encrypted UDP impairment: nominal 300 ms RTT, ±25 ms jitter per direction and 3% seeded packet loss; both drivers and the observer kept advancing. The two-cabinet race measured about 9 KiB/s at 15 sends/s. This is a local test measurement, not a guarantee for every grid or network.

These checks do not certify eight physical WAN devices or all mobile browsers. No new publication ZIP has been generated for this preview. Historical notes below describe their respective versions and do not override this section.

---

## v53.2.4 — Original close-camera cockpit

The selected exterior skin remains in external views. The close camera uses the unmodified original arcade hood, cockpit and native damage variants. The added cowl, descriptor extension, geometry transforms and view-layer sorting from 53.2.3 have been removed. The preserved original renderer object set is used again. Manual preview: http://localhost:8140/.

# Daytona USA Web - 53.2.3 local preview: stable interior with original CPU perspective

CPU liveries keep their original exterior geometry, UVs, camera and native polygon ordering. The stretched hood from the 53.2.2 preview is removed. Only the neutral forward dashboard trim is extended to fill the open interior. Three private view layers place the fill behind the local car, and the original instruments in front, while retaining the native depth ordering within each layer. The same ordering is used by WebGPU, WebGL2 and the software reference.

Damage changes the original car+0x84 hood pointer. The borrowed dashboard now resolves from the cabinet's canonical interior, independently of that damage pointer, and works in both original body draw paths while the local hood camera is selected. Damage state, physics, position, original CPU appearance and all other cameras are retained. CPU models still do not gain the Hornet's detailed deformation geometry.

Local: node scripts/serve.js dist 8139. This is the manual-test preview; no new publication ZIP has been generated. The original 53.2.2 preview on 8138 is preserved.

---

# Daytona USA Web — 53.2.1: livery persistence

Selected liveries now remain active in the close hood camera and when the original pit-service routine restores the local car. Both single player and multiplayer use the same scoped visual correction. Original retains the arcade behavior.

The close camera previously selected a separate Hornet hood/interior mesh instead of the chosen CPU exterior. It now draws the selected CPU exterior model for that draw only. **CPU models do not contain a detailed cockpit:** this view shows their original exterior geometry, without the Hornet dashboard. No custom interior or textures are fabricated. Other cameras keep their original operation. Pit exit now restores the selected body and suppresses the original Hornet accessory, as the existing damage-recovery path already does.

Validation: 298 Node tests; old/new real-engine comparison on all four cameras in WebGL2 and WebGPU; 40 standalone close-camera choices; six linked races across all three circuits in both directions, four cameras per race and original pit model-restoration instruction replay; 39 multiplayer close-camera choices; eighteen Original RAM/texture parity samples; shipping single/multiplayer preparation, selection and restart regressions. Pit coverage replays the exact eight original restoration instructions in an isolated audit CPU context; it is not a claim of driving every pit sequence on physical devices.

UI, network transport, timing, physics, Firebase and the preview engine are preserved. No ROM, static car captures or private audit hooks are packaged. All players should use **53.2.1**. Publish the ZIP contents with index.html at the root. Local: `node scripts/serve.js dist 8137`. The previous 53.2 directory and ZIP are preserved.

---

## Previous release notes (historical)

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
