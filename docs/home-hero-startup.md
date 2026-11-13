# Home hero startup

The Home head includes a small generated inline bootstrap before the deferred main Home script. This is an explicit exception to the usual external-only script convention: source remains in this repository, while inlining avoids a separate request before the first scene is chosen.

`src/inline/home-hero.ts` chooses once in the head. `src/inline/home-hero.css` shows the matching embedded preview immediately and selects its mask. A short-lived observer reads the existing Webflow attributes as the hero arrives, starts the selected poster at high priority, and sets the paired native video source. The full poster or first video frame fades over the preview. Failed/slow media keeps the preview; it never pauses the intro. The shared native player still owns playback and reduced-motion/save-data behavior.

Video/poster URLs remain the four Home Hero / Hero videos properties in Webflow. Designer keeps the fixed Melbourne preview. Masks, intro timing and layout remain in the existing Webflow Hero embed. The inline styles only activate when the bootstrap sets the Home scene state.

## Build and deploy

1. Run `npm test` and `bun run build`.
2. Commit source changes and generated `dist/prod/pages/home.js` plus `dist/prod/pages/home-head.html` to main.
3. Set Home's Webflow head to the exact contents of `dist/prod/pages/home-head.html`, followed by `<script defer src="https://cdn.jsdelivr.net/gh/igniteagency/ams-webflow-site@COMMIT_SHA/dist/prod/pages/home.js"></script>` using the committed SHA.
4. Read back the saved head, publish the Webflow staging site and verify both scene outcomes. Preserve any unrelated Home head code if later additions exist.

The build generates the snippet; it does not itself authenticate to or write Webflow. The deployment step must sync the generated head whenever its sources change. No Webflow credentials belong in the repository.

## Changing a scene

Edit the full media URLs in Webflow as usual. If the poster imagery changes, also refresh its tiny matching preview. The macOS asset helper uses `curl` and `sips` (no build-time dependency or network fetch):

```sh
node bin/refresh-home-hero-preview.js sydney 'https://current-webflow-poster-url'
```

Use `melbourne` for the other scene, then build and deploy the generated head again. `src/assets/home-hero-previews.json` records each preview and its source poster for this purpose; source URLs are metadata only and are excluded from the runtime snippet. Normal builds use these checked-in preview bytes and work on CI without image tools.
