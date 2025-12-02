#!/usr/bin/env node
/**
 * Append new frames to manifest.json without pulling the full archive.
 * Frames outside 07:00–18:00 UTC are ignored.
 *
 * Usage: node scripts/build_manifest.js --image path/to/new.png [--fps 30]
 */

import fs from "fs/promises";
import path from "path";

const MANIFEST_PATH = "manifest.json";
const DEFAULT_FPS = 30;

async function main() {
  const { imagePath, fps } = parseArgs();
  if (!imagePath) {
    throw new Error("Missing --image argument");
  }

  const manifest = await readManifest();
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

  if (!Array.isArray(manifest.images)) {
    manifest.images = [];
  }

  const alreadyPresent = manifest.images.some((item) => item.path === normalizedPath);
  if (!alreadyPresent) {
    manifest.images.push({ path: normalizedPath, timestamp });
  }

  manifest.generated_at = new Date().toISOString();
  manifest.fps = Number.isFinite(fps) ? fps : manifest.fps || DEFAULT_FPS;
  manifest.count = manifest.images.length;

  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
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

async function readManifest() {
  try {
    const data = await fs.readFile(MANIFEST_PATH, "utf8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
    return {
      generated_at: new Date().toISOString(),
      count: 0,
      fps: DEFAULT_FPS,
      images: [],
    };
  }
}

function parseTimestampFromFilename(filepath) {
  const base = path.basename(filepath, path.extname(filepath));
  // Expecting YYYY-MM-DD_HH:MM:SS
  const parts = base.split(/[-_:]/).map((p) => Number(p));
  if (parts.length < 6 || parts.some((n) => Number.isNaN(n))) return null;
  const [year, month, day, hour, minute, second] = parts;
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
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
