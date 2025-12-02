# Nansenløkka

Archives photos from a public webcam showing Nansenløkka and serves them as a fast,
browser-rendered timelapse.

## Timelapse website

- `index.html` fetches `manifest.json`, buffers the listed frames client-side, and plays
  them back at 30 fps via a canvas-based slideshow.
- The latest static site is deployed automatically to GitHub Pages from the `main`
  branch (`.github/workflows/pages.yml`).
- For memory safety the viewer buffers a capped, stride-sampled set of frames while still
  covering the whole timeline.

## Image ingestion and manifest

- `.github/workflows/fetch-image.yml` captures a new frame hourly, writes it under
  `archive/YYYY/MM/`, appends the new entry to `manifest.json`, and commits both. Frames
  outside 07:00–18:00 UTC are ignored.
- You can rebuild/append to the manifest locally with Node:

  ```bash
  node scripts/build_manifest.js --image "archive/YYYY/MM/your-file.png"
  ```

  This produces a JSON document with metadata, total count, and a path to each frame the
  viewer can buffer.

To clean an existing manifest (remove out-of-window or malformed entries) run:

```bash
npm run clean:manifest
```

## Local preview

Serve the root of the repo (so `manifest.json` is reachable) with the built-in Node server
to avoid `file://` CORS restrictions:

```bash
npm start
```

Then open http://localhost:8000 to see the timelapse.

## Offline caching

A service worker (`service-worker.js`) caches the timelapse images in the background once
the page loads, so revisits should replay quickly even with spotty connectivity.
