# Daytona USA Web

**Version in this release folder: v53.8.62 (November 26, 2026)**

A community browser port of the original Daytona USA arcade game, based on [daytona-arcade-recomp](https://github.com/alphanu1/daytona-arcade-recomp). This release contains the browser frontend and a compiled WebAssembly engine. **Bring your own supported Daytona USA ROM ZIP**: no ROM or extracted proprietary game content is included.

This is an independent project, not affiliated with or endorsed by SEGA.

## Release 53.8.62

- Wheel force feedback now goes through [Arcade FFB Helper](https://github.com/johannruiz/arcade-ffb-helper), the small SDL3 app for Windows and macOS shared with Daytona USA 2 and Scud Race. It works with most commercial wheels that have a DirectInput or SDL3 force feedback driver. Turn it on in **Settings → Experimental → Force feedback**; strength, direction and the other force settings are in the helper.
- The page exposes `window.arcadeForceFeedback` v1 (`game: 'd1'`) with the drive board's own forces: the constant force and the uncentring as signed torque, the centring spring and the resistance as damper. The board has no friction or vibration, so they stay 0. Forces stop in menus, pause, spectating and when the page is hidden or loses focus. With Arcade FFB Helper 0.2 or later, the centring spring also keeps the board's shape: a small dead zone (2%, or 6% for the 0x38–0x3F commands), then the spring rises to its strength. Older helpers play it as a linear spring.
- The WebHID force feedback drivers (HID PID, T300, Logitech G29) and the HID report were retired. Gamepad vibration is unchanged.

## Previous release 53.8.61

- Texture packs can place `daytona.pat` in a nested folder. The loader finds the manifest and reads replacement PNGs alongside it.

## Previous release 53.8.60

- Import Model 2 Emulator texture packs in **Settings → Graphics**. The pack stays in the browser, and both WebGPU and WebGL2 support replacement textures, including the water in Advanced.
- Try **3D refresh interpolation** to smooth demos and races at the display refresh rate. This experimental option is off by default. The Expert bridge can still show a discontinuity.
- The performance display reports simulation Hz and GPU-completed FPS separately.

Online rooms require all players to reload to the same version.

## Previous release 53.8.59

- Circuit and transmission selectors start at the leftmost option; a held wheel must return to neutral before making a new selection.
- Enable sticky, accelerated initials navigation in a one-person multiplayer room as well as standalone play.
- Keep the transparent donation footer at the end of the content across entry menus, including single-player Resume Arcade, without changing room geometry.
- Preserve the background-play, guest-departure and automatic grid-rebuild behavior from previous releases.

Validation: 493 automated tests pass. A real ROM in a one-cabinet linked Chrome session verified selector defaults and sequential navigation; a private test engine forced a result to verify entering and confirming BCD. Debug exports, ROMs and research artifacts are excluded. All clients must reload the same release. A global leaderboard is not included.


## Play locally

Import a Model 2 Emulator texture pack ZIP under **Settings → Graphics → Texture pack**.
This build reads `daytona.pat` and uses both Model 2 texture IDs to load matching PNG
replacements for the supported arcade ROM. It supports the stf999 pack's modes
0–7 and 14 on WebGPU and WebGL2. Modes 2–4 use ElSemi's 6-bit to 8-bit luminance
conversion. The browser loads visible replacements on demand.
Use **Enable replacement** to compare with the arcade textures. The ZIP stays local
and the selection lasts until page reload.

**Settings → Graphics → 3D refresh interpolation** is an experimental option for
demos and races. The renderer matches 3D polygons by their mesh source, material and pose
across consecutive arcade frames. It interpolates matched geometry at the
browser's refresh cadence. Camera changes, skipped native frames and ambiguous
matches fall back to the current native pose. Small unpaired faces can follow
nearby geometry when its screen movement and depth agree. The simulation, audio and 2D HUD
use their usual timing. Interpolation presents matched geometry up to one native
frame behind, around 17 ms. The option is off by default.

Beginner's animated billboard keeps its position in the interpolation history
when the animation swaps models and texture slots.

1. Install a recent version of Node.js.
2. In the root of this release folder, run `node serve.js . 8080`.
3. Open **http://localhost:8080/**.
4. Choose your compatible ROM ZIP, then **Single Player** or **Multiplayer**.

This release folder already contains `index.html`, the engine JavaScript and `daytona_engine.wasm`; no compilation is necessary just to serve these files. Every multiplayer participant needs the same app version and their own ROM on their own device. Local ROM reuse and settings depend on the browser's stored site data.

## Features

- **Single player:** select circuit, difficulty, driving direction, CPU cars, pit-stop options, car livery and environment.
- **Multiplayer:** public and private rooms, two to eight drivers, invitations, room chat, waiting seats, room/race settings, editable room names and host transfer. Rooms reject incompatible client versions.
- **Spectators:** integrated spectator roles, original-engine replay, camera controls and driver-follow options; viewer and relay limitations remain documented in the [historical notes](docs/README_RELEASE_HISTORY.md).
- **Controls:** keyboard, gamepad and touch; graphics, sound, vibration and steering settings.
- **Experimental racing wheels:** configurable steering, pedals and buttons, plus force feedback through Arcade FFB Helper (SDL3). Not every wheel and driver has been validated.
- **Rendering:** graphics options with WebGPU and WebGL2 support; actual performance varies by device and browser.

Online play depends on WebRTC connectivity, compatible browser behavior and external room/signaling services. Not every network or physical device combination has been validated.

## Changes in the latest releases

| Version | Changes |
| --- | --- |
| **53.8.62** | Wheel force feedback through Arcade FFB Helper; WebHID force feedback retired. |
| **53.8.59** | Support/donation link placed after the menu content in normal scroll flow. |
| **53.8.47** | Strict room-version checks and editable room names. |
| **53.8.45** | Logitech G29 feedback fix and responsive mobile chat improvements. |
| **53.8.41** | Lobby host transfer and configurable gradual throttle. |
| **53.8.30** | Spectator reliability, reverse CPU orientation and multiplayer UI refinements. |

Prior detailed release notes (v52.x through v53.4.1) are preserved in [docs/README_RELEASE_HISTORY.md](docs/README_RELEASE_HISTORY.md). Their old localhost ports, partial test results and release instructions apply to those historical builds, not v53.8.59.

## Controls at a glance

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Steer | Left / right arrow | Left stick |
| Accelerate / brake | Up / down arrow | RT / LT |
| Insert coin / start | 5 / Enter | Back / Start |
| Shift and gears | Q / W and 1–4 | B / A, X / Y, LB / RB |
| Camera views | A / S / D / F | D-pad |

The on-screen guide describes the current bindings. Touch devices get their own controls; the arcade operator menu can be opened with **F2**.

## Development and deployment

This is a static release snapshot. To serve it, run `node serve.js . 8080` from this folder. For deployment, host the complete set of files at the site root or a consistent subpath over HTTPS, keeping JS/WASM and other assets from the same version together. Do not publish ROM files.

For a source build, consult [BUILD.md](BUILD.md). See [docs/TESTING.md](docs/TESTING.md) for testing information and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for more general hosting guidance (some instructions refer to source-only layouts rather than this compiled release).

Development checks: `npm install` followed by `npm test`. Browser, network and hardware testing may need extra setup.

## Licensing, credits and support

Review [LICENSE](LICENSE), [NOTICE.md](NOTICE.md), [THIRD_PARTY.md](THIRD_PARTY.md) and [CONTRIBUTORS.md](CONTRIBUTORS.md) before redistribution or public hosting. Thanks to Ben Templeman and contributors to [daytona-arcade-recomp](https://github.com/alphanu1/daytona-arcade-recomp). Daytona USA and related trademarks remain the property of their owners.

Optional support: [GitHub Sponsors](https://github.com/sponsors/johannruiz). The donation link is at the bottom of the landing page content, below the driver controls; it is not sticky.
