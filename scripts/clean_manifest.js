#!/usr/bin/env node
/**
 * One-time cleaner: remove manifest entries outside 07:00–18:00 UTC or with invalid timestamps.
 * Usage: node scripts/clean_manifest.js
 */

import fs from "fs/promises";
import path from "path";

const MANIFEST_PATH = "manifest.json";

async function main() {
  const manifest = await readManifest();
  if (!Array.isArray(manifest.images)) {
    console.log("Manifest has no images array; nothing to clean.");
    return;
  }

  const seen = new Set();
  const kept = [];
  for (const image of manifest.images) {
    if (!image?.path) continue;
    const normalizedPath = image.path.replace(/\\/g, "/");
    if (seen.has(normalizedPath)) continue;
    const timestamp = parseTimestampFromFilename(normalizedPath, image.timestamp);
    if (!timestamp) continue;
    if (!isWithinDaylight(timestamp)) continue;
    seen.add(normalizedPath);
    kept.push({ path: normalizedPath, timestamp });
  }

  const removed = manifest.images.length - kept.length;
  manifest.images = kept;
  manifest.count = kept.length;
  manifest.generated_at = new Date().toISOString();

  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Cleaned manifest: removed ${removed}, kept ${kept.length}.`);
}

async function readManifest() {
  try {
    const data = await fs.readFile(MANIFEST_PATH, "utf8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Manifest not found at ${path.resolve(MANIFEST_PATH)}`);
    }
    throw error;
  }
}

function parseTimestampFromFilename(filepath, fallbackTimestamp) {
  const base = path.basename(filepath, path.extname(filepath));
  const parts = base.split(/[-_:]/).map((p) => Number(p));
  if (parts.length >= 6 && parts.every((n) => !Number.isNaN(n))) {
    const [year, month, day, hour, minute, second] = parts;
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  if (fallbackTimestamp) {
    const date = new Date(fallbackTimestamp);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  return null;
}

function isWithinDaylight(timestampIso) {
  const date = new Date(timestampIso);
  const hour = date.getUTCHours();
  return hour >= 7 && hour < 18;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
