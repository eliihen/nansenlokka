#!/usr/bin/env node
/**
 * Render monthly timelapse videos and concatenate them (Node + FFmpeg).
 *
 * Examples:
 *   node scripts/render_video.js month --source archive/2024/03 --output /tmp/2024-03.mp4 --fps 30
 *   node scripts/render_video.js concat --inputs /tmp/2024-03.mp4 /tmp/2024-04.mp4 --output assets/timelapse.mp4
 */

import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import os from "os";

const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const DEFAULT_FPS = 30;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "month") {
    await renderMonth(args.source, args.output, args.fps ?? DEFAULT_FPS);
  } else if (args.command === "concat") {
    await concatMonths(args.inputs, args.output);
  } else {
    throw new Error("Unknown command");
  }
}

function parseArgs(argv) {
  if (!argv.length) usage();
  const [command, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i];
    const val = rest[i + 1];
    switch (key) {
      case "--source":
        opts.source = val;
        i++;
        break;
      case "--output":
        opts.output = val;
        i++;
        break;
      case "--fps":
        opts.fps = Number(val);
        i++;
        break;
      case "--inputs":
        opts.inputs = [];
        for (let j = i + 1; j < rest.length; j++) {
          if (rest[j].startsWith("--")) break;
          opts.inputs.push(rest[j]);
          i = j;
        }
        break;
      default:
        usage(`Unknown option: ${key}`);
    }
  }
  if (command === "month" && (!opts.source || !opts.output)) {
    usage("month requires --source and --output");
  }
  if (
    command === "concat" &&
    (!opts.inputs || !opts.inputs.length || !opts.output)
  ) {
    usage("concat requires --inputs and --output");
  }
  return {
    command,
    source: opts.source ? path.resolve(opts.source) : undefined,
    output: opts.output ? path.resolve(opts.output) : undefined,
    fps: opts.fps,
    inputs: opts.inputs ? opts.inputs.map((p) => path.resolve(p)) : undefined,
  };
}

function usage(message) {
  if (message) console.error(message);
  console.error(
    `Usage:
  node scripts/render_video.js month --source archive/YYYY/MM --output /tmp/month.mp4 [--fps 30]
  node scripts/render_video.js concat --inputs file1.mp4 file2.mp4 --output assets/timelapse.mp4`
  );
  process.exit(1);
}

async function renderMonth(sourceDir, outputPath, fps) {
  const frames = await collectFrames(sourceDir);
  if (!frames.length) {
    throw new Error(`No frames found in ${sourceDir}`);
  }
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const listFile = await writeListFile(frames);
  try {
    const args = [
      "-nostdin",
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listFile,
      "-r",
      String(fps),
      "-vf",
      `fps=${fps},format=yuv420p`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      outputPath,
    ];
    await runFFmpeg(args);
  } finally {
    await fs.rm(listFile, { force: true });
  }
}

async function concatMonths(inputs, outputPath) {
  if (!inputs.length) throw new Error("No inputs provided for concat");
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const listFile = await writeListFile(inputs);
  try {
    const args = [
      "-nostdin",
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listFile,
      "-c",
      "copy",
      outputPath,
    ];
    await runFFmpeg(args);
  } finally {
    await fs.rm(listFile, { force: true });
  }
}

async function collectFrames(sourceDir) {
  const results = [];
  const root = path.resolve(sourceDir);
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
        if (!withinDaylight(entry.name)) continue;
        results.push(fullPath);
      }
    }
  }
  results.sort();
  return results;
}

function withinDaylight(filename) {
  const stem = filename.replace(path.extname(filename), "");
  const parts = stem.split("_");
  if (parts.length < 2) return false;
  const timePart = parts[1];
  const hourStr = timePart.split(":")[0];
  const hour = Number.parseInt(hourStr, 10);
  return Number.isInteger(hour) && hour >= 7 && hour < 18;
}

async function writeListFile(paths) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ffmpeg-list-"));
  const listPath = path.join(tmpDir, "list.txt");
  const lines =
    paths.map((p) => `file '${p.replace(/'/g, "'\\\\''")}'`).join("\n") + "\n";
  await fs.writeFile(listPath, lines, "utf8");
  return listPath;
}

function runFFmpeg(args) {
  const commonFlags = ["-hide_banner", "-loglevel", "warning", "-nostats"];
  const fullArgs = [...commonFlags, ...args];
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", fullArgs, { stdio: "inherit" });
    proc.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
