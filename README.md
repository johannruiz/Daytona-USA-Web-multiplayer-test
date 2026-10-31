# Daytona USA Web

**Version in this release folder: v53.8.59 (October 31, 2026)**

A community browser port of the original Daytona USA arcade game, based on [daytona-arcade-recomp](https://github.com/alphanu1/daytona-arcade-recomp). This release contains the browser frontend and a compiled WebAssembly engine. **Bring your own supported Daytona USA ROM ZIP**: no ROM or extracted proprietary game content is included.

This is an independent project, not affiliated with or endorsed by SEGA.

## Release 53.8.59

- Circuit and transmission selectors start at the leftmost option; a held wheel must return to neutral before making a new selection.
- Enable sticky, accelerated initials navigation in a one-person multiplayer room as well as standalone play.
- Keep the transparent donation footer at the end of the content across entry menus, including single-player Resume Arcade, without changing room geometry.
- Preserve the background-play, guest-departure and automatic grid-rebuild behavior from previous releases.

Validation: 493 automated tests pass. A real ROM in a one-cabinet linked Chrome session verified selector defaults and sequential navigation; a private test engine forced a result to verify entering and confirming BCD. Debug exports, ROMs and research artifacts are excluded. All clients must reload the same release. A global leaderboard is not included.


## Play locally

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
- **Experimental racing wheels:** configurable steering, pedals and buttons, plus device/browser-dependent force-feedback and WebHID support. No universal wheel compatibility is claimed.
- **Rendering:** graphics options with WebGPU and WebGL2 support; actual performance varies by device and browser.

Online play depends on WebRTC connectivity, compatible browser behavior and external room/signaling services. Not every network or physical device combination has been validated.

## Changes in the latest releases

| Version | Changes |
| --- | --- |
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
