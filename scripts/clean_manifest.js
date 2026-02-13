#!/usr/bin/env node
/**
 * Remove invalid or out-of-window entries from manifest.json and regenerate manifest.json.gz.
 * Usage: node scripts/clean_manifest.js
 */

import {
  MANIFEST_GZIP_PATH,
  MANIFEST_PATH,
  isWithinDaylight,
  parseTimestampFromFilename,
  readManifest,
  writeManifest,
} from "./manifest_common.js";

async function main() {
  const manifest = await readManifest(MANIFEST_PATH);

  const seen = new Set();
  const kept = [];
  for (const image of manifest.images) {
    if (!image?.path) continue;

    const normalizedPath = image.path.replace(/\\/g, "/");
    if (seen.has(normalizedPath)) continue;

    const timestamp = parseTimestampFromFilename(normalizedPath) ?? image.timestamp;
    if (!timestamp) continue;
    if (!isWithinDaylight(timestamp)) continue;

    seen.add(normalizedPath);
    kept.push({ path: normalizedPath, timestamp });
  }

  const removed = manifest.images.length - kept.length;

  const result = await writeManifest(
    {
      ...manifest,
      images: kept,
    },
    MANIFEST_PATH,
    MANIFEST_GZIP_PATH
  );

  console.log(
    `Cleaned manifest: removed ${removed}, kept ${result.count} (${result.jsonBytes} bytes, ${result.gzipBytes} bytes gzip).`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
