# Nansenløkka

Archives photos from a public webcam showing Nansenløkka and serves them as a
pre-rendered MP4 timelapse.

## Timelapse website

- `index.html` serves a single pre-rendered `assets/timelapse.mp4`.
- The raw timeline reads `manifest.json.gz` (gzip) and falls back to `manifest.json`.
- `manifest.json` uses a compact nested-array format for frame data: `images: [[path, epochSeconds], ...]`.
- The latest static site is deployed automatically to GitHub Pages from `main`
  (`.github/workflows/pages.yml`).
- The video is rebuilt after every commit: each archive month renders separately, then all
  months are concatenated in order.

## Image ingestion and rendering pipeline

- `.github/workflows/fetch-image.yml` captures a new frame hourly under
  `archive/YYYY/MM/`. Frames outside 07:00–18:00 UTC are ignored.
- `.github/workflows/render-video.yml` runs on each push:
  - Determines available months without checking out the archive.
  - Sparse-checks out one month at a time, renders a monthly MP4 with FFmpeg, writes it to
    `/tmp` (only Monday–Friday, 07:00–17:59 UTC frames are kept based on filename times).
  - After all months are processed, concatenates the month videos into
    `assets/timelapse.mp4`.
  - Only one month is checked out at any point to keep disk usage low.
- Local rendering (single month then concat):

  ```bash
  node scripts/render_video.js month --source archive/YYYY/MM --output /tmp/month.mp4
  node scripts/render_video.js concat --inputs /tmp/month.mp4 --output assets/timelapse.mp4
  ```

  Add more monthly inputs to the concat command as needed.

## Local preview

Serve the root of the repo with the built-in Node server to avoid `file://`
restrictions:

```bash
npm start
```

Then open http://localhost:8000 to see the timelapse.

## Manifest rebuild

Rebuild the manifest from scratch from `archive/**`:

```bash
npm run rebuild:manifest
```
