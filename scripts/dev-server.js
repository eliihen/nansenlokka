#!/usr/bin/env node
/**
 * Minimal static server for local preview.
 * Usage: PORT=8000 npm start
 */

import http from "http";
import path from "path";
import { promises as fs } from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = process.cwd();
const PORT = process.env.PORT || 8000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".gz": "application/gzip",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = http.createServer(async (req, res) => {
  try {
    const safePath = decodeURIComponent(req.url.split("?")[0]);
    let filePath = path.join(ROOT, safePath);

    const stat = await safeStat(filePath);
    if (stat?.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }

    const file = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
    res.writeHead(200);
    res.end(file);
  } catch (error) {
    res.writeHead(error.code === "ENOENT" ? 404 : 500);
    res.end(error.code === "ENOENT" ? "Not found" : "Server error");
  }
});

server.listen(PORT, () => {
  console.log(`Serving ${ROOT} at http://localhost:${PORT}`);
});

async function safeStat(target) {
  try {
    return await fs.stat(target);
  } catch {
    return null;
  }
}
