#!/usr/bin/env node
/**
 * Build a web-optimized timelapse video directly from archive frames.
 * Filters to weekdays and 07:00-17:59 UTC only.
 *
 * Usage:
 *   node scripts/render_web_video.js
 *   node scripts/render_web_video.js --source archive --output assets/timelapse.mp4 --fps 18 --crf 35 --max-width 1280 --preset medium
 */

import fs from "fs/promises";
import path from "path";
import os from "os";
import { spawn } from "child_process";

const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const DEFAULTS = {
  source: "archive",
  output: "assets/timelapse.mp4",
  fps: 18,
  crf: 30,
  maxWidth: 1280,
  preset: "slow",
};

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const sourceDir = path.resolve(options.source);
  const outputPath = path.resolve(options.output);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const frames = await collectFrames(sourceDir);
  if (!frames.length) {
    throw new Error("No eligible frames found after weekday/time filtering.");
  }

  const listFile = await writeListFile(frames);
  try {
    const vf = [
      `fps=${options.fps}`,
      `scale='min(${options.maxWidth},iw)':-2:flags=lanczos`,
      "format=yuv420p",
    ].join(",");

    const args = [
      "-hide_banner",
      "-loglevel",
      "warning",
      "-nostats",
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listFile,
      "-r",
      String(options.fps),
      "-vf",
      vf,
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      options.preset,
      "-crf",
      String(options.crf),
      "-movflags",
      "+faststart",
      "-pix_fmt",
      "yuv420p",
      outputPath,
    ];

    await runFFmpeg(args);
  } finally {
    await fs.rm(listFile, { force: true });
  }

  const stats = await fs.stat(outputPath);
  console.log(
    `Rendered ${path.relative(process.cwd(), outputPath)} from ${frames.length} frames (${formatBytes(stats.size)}).`
  );
}

function parseArgs(argv) {
  const options = { ...DEFAULTS };

  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const val = argv[i + 1];
    if (!key.startsWith("--")) continue;

    if (key === "--source" && val) {
      options.source = val;
      i++;
    } else if (key === "--output" && val) {
      options.output = val;
      i++;
    } else if (key === "--fps" && val) {
      options.fps = toFiniteNumber(val, DEFAULTS.fps);
      i++;
    } else if (key === "--crf" && val) {
      options.crf = toFiniteNumber(val, DEFAULTS.crf);
      i++;
    } else if (key === "--max-width" && val) {
      options.maxWidth = toFiniteNumber(val, DEFAULTS.maxWidth);
      i++;
    } else if (key === "--preset" && val) {
      options.preset = val;
      i++;
    }
  }

  return options;
}

function toFiniteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function collectFrames(rootDir) {
  const results = [];
  const stack = [rootDir];

  while (stack.length) {
    const current = stack.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

      const timestamp = parseTimestampFromFilename(entry.name);
      if (!timestamp) continue;
      if (!isWeekday(timestamp)) continue;
      if (!isWithinDaylight(timestamp)) continue;

      results.push(fullPath);
    }
  }

  results.sort();
  return results;
}

function parseTimestampFromFilename(filename) {
  const stem = filename.replace(path.extname(filename), "");
  const parts = stem.split(/[-_:]/).map((p) => Number.parseInt(p, 10));
  if (parts.length < 6 || parts.some((n) => !Number.isInteger(n))) return null;

  const [year, month, day, hour, minute, second] = parts;
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isWeekday(date) {
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
}

function isWithinDaylight(date) {
  const hour = date.getUTCHours();
  return hour >= 7 && hour < 18;
}

async function writeListFile(paths) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "web-timelapse-"));
  const listPath = path.join(tmpDir, "list.txt");
  const lines = paths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n") + "\n";
  await fs.writeFile(listPath, lines, "utf8");
  return listPath;
}

function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: "inherit" });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
}

function formatBytes(bytes) {
  const gib = bytes / 1024 / 1024 / 1024;
  if (gib >= 1) return `${gib.toFixed(2)} GiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
