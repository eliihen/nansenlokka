# Nansenløkka

Archives photos from a public webcam showing Nansenløkka.

## Timelapse website

The GitHub Pages site served from `index.html` now streams a pre-rendered MP4 timelapse
(`assets/timelapse.mp4`). The video is regenerated automatically by the
`Render timelapse video` workflow whenever new frames are added under `archive/`.

### Updating the timelapse locally

You can reproduce the automation by installing FFmpeg and running:

```bash
scripts/render_timelapse.py --fps 12
```

Commit the refreshed `assets/timelapse.mp4` along with any new images to keep the
website up to date.
