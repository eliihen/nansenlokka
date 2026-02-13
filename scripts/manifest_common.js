#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";
import { gzip as gzipCallback } from "zlib";
import { promisify } from "util";

const gzip = promisify(gzipCallback);

export const MANIFEST_VERSION = 2;
export const DEFAULT_FPS = 30;
export const MANIFEST_PATH = "manifest.json";
export const MANIFEST_GZIP_PATH = "manifest.json.gz";
export const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export function parseTimestampFromFilename(filepath) {
  const base = path.basename(filepath, path.extname(filepath));
  const parts = base.split(/[-_:]/).map((p) => Number(p));
  if (parts.length < 6 || parts.some((n) => Number.isNaN(n))) return null;

  const [year, month, day, hour, minute, second] = parts;
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function isWithinDaylight(timestampIso) {
  const hour = new Date(timestampIso).getUTCHours();
  return hour >= 7 && hour < 18;
}

function toIso(timestamp) {
  if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
    const millis = timestamp > 1e12 ? timestamp : timestamp * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  if (typeof timestamp === "string") {
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  return null;
}

function toEpochSeconds(timestampIso) {
  return Math.floor(new Date(timestampIso).getTime() / 1000);
}

function normalizeEntry(entry) {
  if (!entry) return null;

  if (Array.isArray(entry)) {
    const [pathValue, timestampValue] = entry;
    if (typeof pathValue !== "string") return null;
    const normalizedPath = pathValue.replace(/\\/g, "/");
    const iso = toIso(timestampValue) ?? parseTimestampFromFilename(normalizedPath);
    if (!iso) return null;
    return { path: normalizedPath, timestamp: iso };
  }

  if (typeof entry === "object") {
    if (typeof entry.path !== "string") return null;
    const normalizedPath = entry.path.replace(/\\/g, "/");
    const iso = toIso(entry.timestamp) ?? parseTimestampFromFilename(normalizedPath);
    if (!iso) return null;
    return { path: normalizedPath, timestamp: iso };
  }

  return null;
}

export function normalizeManifest(raw) {
  const inputImages = Array.isArray(raw?.images)
    ? raw.images
    : Array.isArray(raw?.i)
      ? raw.i
      : [];

  const deduped = new Map();
  for (const image of inputImages) {
    const entry = normalizeEntry(image);
    if (!entry) continue;
    if (!isWithinDaylight(entry.timestamp)) continue;
    deduped.set(entry.path, entry);
  }

  const images = Array.from(deduped.values()).sort((a, b) => a.path.localeCompare(b.path));
  const fps = Number.isFinite(raw?.fps)
    ? Number(raw.fps)
    : Number.isFinite(raw?.f)
      ? Number(raw.f)
      : DEFAULT_FPS;

  return {
    version: MANIFEST_VERSION,
    generated_at: typeof raw?.generated_at === "string" ? raw.generated_at : new Date().toISOString(),
    fps,
    count: images.length,
    images,
  };
}

export function toCompactManifest(normalizedManifest) {
  const normalized = normalizeManifest(normalizedManifest);
  return {
    version: MANIFEST_VERSION,
    generated_at: normalized.generated_at,
    fps: normalized.fps,
    count: normalized.count,
    images: normalized.images.map((item) => [item.path, toEpochSeconds(item.timestamp)]),
  };
}

export async function readManifest(manifestPath = MANIFEST_PATH) {
  try {
    const data = await fs.readFile(manifestPath, "utf8");
    return normalizeManifest(JSON.parse(data));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return normalizeManifest({
      generated_at: new Date().toISOString(),
      fps: DEFAULT_FPS,
      images: [],
    });
  }
}

export async function writeManifest(manifest, manifestPath = MANIFEST_PATH, gzipPath = MANIFEST_GZIP_PATH) {
  const normalized = normalizeManifest({
    ...manifest,
    generated_at: new Date().toISOString(),
  });
  const compact = toCompactManifest(normalized);
  const jsonText = JSON.stringify(compact);

  await fs.writeFile(manifestPath, `${jsonText}\n`, "utf8");
  const compressed = await gzip(Buffer.from(jsonText, "utf8"), { level: 9 });
  await fs.writeFile(gzipPath, compressed);

  return {
    count: compact.count,
    jsonBytes: Buffer.byteLength(jsonText),
    gzipBytes: compressed.byteLength,
  };
}
