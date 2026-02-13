#!/usr/bin/env node
/**
 * Rebuild manifest.json from scratch from archive/** and write manifest.json.gz.
 * Usage:
 *   node scripts/rebuild_manifest.js
 *   node scripts/rebuild_manifest.js --source archive --output manifest.json --fps 30
 */

import fs from "fs/promises";
import path from "path";
import {
  DEFAULT_FPS,
  SUPPORTED_EXTENSIONS,
  parseTimestampFromFilename,
  isWithinDaylight,
  writeManifest,
} from "./manifest_common.js";

async function main() {
  const { source, output, fps } = parseArgs(process.argv.slice(2));
  const root = path.resolve(source);
  const outputPath = path.resolve(output);
  const gzipPath = `${outputPath}.gz`;

  const files = await collectFiles(root);
  const images = [];

  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

    const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
    const timestamp = parseTimestampFromFilename(relPath);
    if (!timestamp) continue;
    if (!isWithinDaylight(timestamp)) continue;

    images.push({ path: relPath, timestamp });
  }

  images.sort((a, b) => a.path.localeCompare(b.path));

  const result = await writeManifest(
    {
      fps,
      images,
    },
    outputPath,
    gzipPath
  );

  console.log(
    `Rebuilt ${path.basename(outputPath)} with ${result.count} frames (${result.jsonBytes} bytes, ${result.gzipBytes} bytes gzip).`
  );
}

function parseArgs(argv) {
  let source = "archive";
  let output = "manifest.json";
  let fps = DEFAULT_FPS;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--source" && argv[i + 1]) {
      source = argv[i + 1];
      i++;
    } else if (arg === "--output" && argv[i + 1]) {
      output = argv[i + 1];
      i++;
    } else if (arg === "--fps" && argv[i + 1]) {
      fps = Number(argv[i + 1]);
      i++;
    }
  }

  return { source, output, fps: Number.isFinite(fps) ? fps : DEFAULT_FPS };
}

async function collectFiles(rootDir) {
  const allFiles = [];
  const stack = [rootDir];

  while (stack.length) {
    const current = stack.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        allFiles.push(fullPath);
      }
    }
  }

  return allFiles;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
