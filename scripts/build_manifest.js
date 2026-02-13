#!/usr/bin/env node
/**
 * Append a single frame to manifest.json and regenerate manifest.json.gz.
 * Supports both old object-based manifests and compact nested-array manifests.
 *
 * Usage: node scripts/build_manifest.js --image path/to/new.png [--fps 30]
 */

import {
  DEFAULT_FPS,
  MANIFEST_GZIP_PATH,
  MANIFEST_PATH,
  isWithinDaylight,
  parseTimestampFromFilename,
  readManifest,
  writeManifest,
} from "./manifest_common.js";

async function main() {
  const { imagePath, fps } = parseArgs();
  if (!imagePath) {
    throw new Error("Missing --image argument");
  }

  const normalizedPath = imagePath.replace(/\\/g, "/");
  const timestamp = parseTimestampFromFilename(normalizedPath);

  if (!timestamp) {
    console.warn(`Skipping ${normalizedPath}: timestamp could not be parsed.`);
    return;
  }
  if (!isWithinDaylight(timestamp)) {
    console.log(`Skipping ${normalizedPath}: outside 07:00–18:00 UTC window.`);
    return;
  }

  const manifest = await readManifest(MANIFEST_PATH);
  const existing = new Set(manifest.images.map((item) => item.path));

  if (!existing.has(normalizedPath)) {
    manifest.images.push({ path: normalizedPath, timestamp });
    manifest.images.sort((a, b) => a.path.localeCompare(b.path));
  }

  manifest.fps = Number.isFinite(fps) ? fps : manifest.fps || DEFAULT_FPS;

  const result = await writeManifest(manifest, MANIFEST_PATH, MANIFEST_GZIP_PATH);
  console.log(
    `Updated ${MANIFEST_PATH}: ${result.count} frames (${result.jsonBytes} bytes, ${result.gzipBytes} bytes gzip).`
  );
}

function parseArgs() {
  const args = process.argv.slice(2);
  let imagePath = "";
  let fps = DEFAULT_FPS;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--image" && args[i + 1]) {
      imagePath = args[i + 1];
      i++;
    } else if (arg === "--fps" && args[i + 1]) {
      fps = Number(args[i + 1]);
      i++;
    }
  }
  return { imagePath, fps };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
