# AMS deferred native video

This changes only the AMS repository controller and its production bundle. The existing
`data-video-controller="starter-native-v1"` marker remains compatible with AMS markup; it does not
change Starter's video manager or any Webflow component, property, style, or published page.

## Required markup migration

For **every** managed video, including videos inside reusable component definitions:

1. Move the media URL from `src` to `data-video-src` on the `<video>`, or on each child `<source>`.
2. Remove `src` entirely from the video **and all child sources**. Do not leave an empty `src`.
3. Remove `autoplay` entirely. `autoplay="false"` still enables the boolean attribute.
4. Set `preload="none"` on the video. Keep `poster`, `playsinline`, existing control elements,
   classes, component properties, and mode visibility rules.
5. Keep `data-video-el="player"`, `data-video-player`, and the outer controller marker.
   `data-video-player="true"` (case-insensitive) means Controls; otherwise it means Background.

Background example (existing toggle markup is shown minimally):

```html
<div data-video-controller="starter-native-v1">
  <video
    data-video-el="player"
    data-video-player="false"
    data-video-src="https://vz-a8209381-f64.b-cdn.net/adff7128-8019-4292-b12d-2e84754650c3/playlist.m3u8"
    preload="none"
    poster="YOUR_POSTER_URL"
    playsinline
  ></video>
  <button data-video-el="toggle" aria-label="Play video">
    <span data-video-el="play-icon">Play</span>
    <span data-video-el="pause-icon" hidden>Pause</span>
  </button>
</div>
```

Controls can use the same direct attribute, or ordered child sources:

```html
<video
  data-video-el="player"
  data-video-player="true"
  preload="none"
  poster="YOUR_POSTER_URL"
  playsinline
>
  <source data-video-src="YOUR_PLAYLIST_URL" type="application/vnd.apple.mpegurl" />
  <source data-video-src="YOUR_MP4_URL" type="video/mp4" />
</video>
```

Keep this video inside its existing controller with its complete custom controls. An MP4 URL works
in either form. A direct video URL wins over children. Otherwise the first recognized HLS, untyped,
or browser-playable child wins in document order; later sources are not a network-error fallback.
HLS is recognized by `.m3u8` (including query/fragment URLs) or either HLS MIME type.
`data-video-src` wins over `src` on the same element.

Legacy `video[src]` and ordered `source[src]` markup still plays. Initialization moves those URLs to
deferred attributes and removes active source attributes. **JavaScript cannot prevent downloads the
HTML parser already initiated.** `preload="none"` alone is not the deferred-loading guarantee;
complete the migration above before expecting zero media requests before eligibility.

Webflow Designer normally does not run this published controller. A deferred video therefore shows
its poster rather than an autoplaying preview (or an empty frame if no poster is authored). Keep a
useful poster; do not restore `src` or `autoplay` just to obtain a Designer preview. Poster image
requests are expected and are separate from media downloads.

## Playback and lifecycle

- Background attaches its source only after intersection with a visible document, without reduced
  motion or save-data. Without IntersectionObserver it waits for explicit Play.
- Reduced motion/save-data backgrounds and all Controls videos wait for explicit Play. Runtime
  `autoplay` remains disabled in both modes. Explicit Play grants playback consent for that instance;
  Background may then resume on viewport return even with a preference enabled.
- Background pauses outside the viewport or in a hidden document. The custom Pause button persists
  across viewport/visibility changes. Controls mode stays under explicit user control.
- hls.js is preferred when `Hls.isSupported()` succeeds. Otherwise native HLS is used if the browser
  reports support. Unsupported HLS shows a status error. MP4 uses native playback.
- One HLS instance is retained across looping, pauses, and viewport resumes. Existing desktop startup
  preference up to 1080p remains; adaptive quality stays enabled, with no minimum bitrate or quality
  floor. Native HLS quality remains browser-owned. See the [HLS API](https://hlsjs.video-dev.org/api-docs/hls.js.hls).
- Existing seek/time, mute/volume, fullscreen, icons, control hiding, Webflow styling and mode
  conditionals remain in place. Background stays muted/looping; Controls stays unmuted/non-looping.
- Fatal HLS network/media recovery is bounded to one of each per instance; permanent HTTP errors
  stop immediately. Native HLS network/decode retry requires Play and is limited to one retry.
  Removal or non-persisted pagehide destroys HLS, clears native sources, and releases listeners,
  timers and observers. Deferred authoring remains for safe reinitialization. Persisted pagehide
  retains the instance for bfcache. Initial deferral does not promise zero buffering after activation.

## Verification

```sh
npm test
node_modules/.bin/tsc --noEmit
node_modules/.bin/prettier --check src/components/native-video.ts tests/native-video.test.mjs tests/native-video-browser.mjs tests/fixtures/native-video.html docs/native-video.md
bun run build
node tests/native-video-browser.mjs
```

The executable browser QA serves the local production bundle and uses the real Bunny playlist above
and `https://vz-a8209381-f64.b-cdn.net/adff7128-8019-4292-b12d-2e84754650c3/play_1080p.mp4`.
It defaults to the existing Playwright install at
`/Volumes/Sandisk-2TB-SSD/hermes/workspace/worktrees/ams-webflow-site/2026-10-23-hls/.npm/browser-qa/node_modules/playwright/index.mjs`.
Override `PLAYWRIGHT_PATH` with another installation's absolute `index.mjs` path if needed.
`BROWSER_CHANNEL` defaults to `chrome`.

The browser matrix covers hls.js, real native HLS with MSE disabled, and MP4; zero Bunny requests
before eligibility; reduced motion/save-data then explicit Play; offscreen attachment; controls;
loop and viewport source reuse; manual pause; removal cleanup; and legacy child playback. Native HLS
requires a browser that actually supports it; the runner fails rather than mocking playback or
silently skipping that path. Tests are local only and make no Webflow writes.

Implementation used successive failing behavioral tests followed by minimal changes:

| Slice                           | Observed red                                      | Green after implementation                      |
| ------------------------------- | ------------------------------------------------- | ----------------------------------------------- |
| Direct deferred MP4             | `src` remained null after allowed Play            | Source attaches only when eligible              |
| Deferred/legacy ordered sources | Active child sources remained                     | All source paths normalize and select correctly |
| Prefer hls.js                   | No HLS instance when native was available         | hls.js preferred; native fallback retained      |
| Preference autoplay suppression | Native autoplay became true after viewport resume | Autoplay stays false after manual consent       |
| Missing IntersectionObserver    | Background attached automatically                 | Explicit Play required                          |
| Cleanup                         | Native MP4 source remained active                 | Native/HLS reset; late callbacks inert          |

Independent host verification: all 60 unit tests passed, including 36 video tests; production
build, focused strict TypeScript, Prettier and diff checks passed. Full-project `tsc --noEmit`
reports 87 diagnostic lines outside native-video (entry/global/slider/carousel), identical to
an archived unchanged baseline after normalizing its path prefix. Focused type check:

```sh
npx tsc --noEmit --strict --skipLibCheck --target ES2020 --module ESNext --moduleResolution node --lib ES2020,DOM src/components/native-video.ts src/types/global.d.ts
```

Real Chrome/Bunny playback passed the complete hls.js, native-HLS fallback (MSE disabled), and
MP4 matrix. Each path verified zero requests before eligibility and under reduced-motion/saveData
until Play, playback advancement/decoded dimensions, controls, looping without master reload,
viewport reuse, manual pause and removal cleanup. Browser QA waits for asynchronous media and
fullscreen event-driven labels rather than asserting immediately after browser state changes.
An earlier sandbox Chrome launch failed, but host execution resolved that blocker. This is local
production-bundle evidence, not saved Designer or published-site acceptance.

## Saved AMS Designer migration status

Pending; no effective component changes were saved. Fresh MCP readback still shows the original
bound child `src` and opaque conditional autoplay. The targeted `remove_attribute("autoplay")`
reported success but did not remove the conditional entry on independent readback. Do not treat
that response as a saved change or replace the whole attributes list: it also contains a
conditional poster binding that must be preserved. Normal Chrome AppleScript timed out; native
session inspection confirmed `CGSSessionScreenIsLocked: true`. UI work stopped at that barrier.

Exact discovered AMS targets (site `6ac58464423a10a23dfeb5d8`, Home page
`6ac58464423a10a23dfeb5a0`):

- Component `Global / Visual`: `7bae2635-fced-a001-3fcf-89328f09ddba`.
- Player: `{component: "7bae2635-fced-a001-3fcf-89328f09ddba", element: "148323a8-21b7-7768-0e1a-b375894ef7e7"}`.
- Child source: same component, element `148323a8-21b7-7768-0e1a-b375894ef7e8`.
- Wrapper: same component, element `20118d52-dd0e-4596-7e3a-c5f59185a83a`.

After normal Designer access returns:

1. Move the child source URL binding (`dd590409-4dbe-97da-28bf-a0545aa56da1`, existing
   `MP4 Video Source` prop) to player `data-video-src`; remove child `src`. Keep the source node
   if desired, but remove its hardcoded `type="video/mp4"` if using that node for mixed HLS/MP4.
   Direct player `data-video-src` avoids a stale child MIME type entirely.
2. Remove the player's conditional autoplay attribute in native Settings. Preserve muted,
   playsinline, loop, preload none, player/mode hooks, conditional poster and accessible label.
3. Preserve existing native wrapper/player visibility based on the **source prop being set**,
   not the newly absent HTML `src`. Do not add JS/CSS mode hiding or change palette/layout.
4. Preserve the existing poster binding. Deferred Designer playback becomes a poster preview;
   author a poster for any populated instance lacking one before migrating it, rather than
   accepting an empty editor frame. The Home hero already has the Bunny thumbnail; the second
   published homepage video has no poster and needs an approved poster before this migration.
5. `Section / Home Hero` definition `5a27f246-cf83-2bb2-9082-7e5d4949b59f` contains a
   `Global / Background Visual` in its Frame Layout slot. Its source prop
   `3b7a2524-0a0a-c04c-a9df-7d881fe3d755` currently holds the Bunny `play_1080p.mp4` URL.
   Change only that hero instance override to the same GUID's `playlist.m3u8` URL shown above,
   preserving poster and overlay. MCP's slot readback omitted that child's element handle;
   discover it in Designer rather than guessing an ID or changing a shared default.
6. Independently re-read each exact target and inspect populated/unset Background and Controls
   in Designer, including poster preview. No publishing is authorized by these instructions.

Code commit/push, saved component migration, actual Designer rendering and Webflow publishing
are separate gates. Do not publish or change Bunny configuration as part of this work.
