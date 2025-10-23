#!/usr/bin/env python3
"""Render the webcam archive into a single MP4 timelapse."""

from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

SUPPORTED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
DEFAULT_FPS = 12
ARCHIVE_DIR = Path("archive")
OUTPUT_PATH = Path("assets/timelapse.mp4")


def collect_frames(archive: Path) -> list[Path]:
    frames = [
        path
        for path in archive.rglob("*")
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
    ]
    frames.sort()
    return frames


def render_timelapse(frames: list[Path], output: Path, fps: float) -> None:
    if not frames:
        raise SystemExit("No frames found in archive; nothing to render.")

    output.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.NamedTemporaryFile("w", delete=False) as handle:
        for frame in frames:
            handle.write(f"file '{frame.as_posix()}'\n")
        list_path = Path(handle.name)

    try:
        cmd = [
            "ffmpeg",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(list_path),
            "-vf",
            f"fps={fps},format=yuv420p",
            str(output),
        ]
        subprocess.run(cmd, check=True)
    finally:
        list_path.unlink(missing_ok=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--fps",
        type=float,
        default=DEFAULT_FPS,
        help=f"Frames per second for the output video (default: {DEFAULT_FPS}).",
    )
    parser.add_argument(
        "--archive",
        type=Path,
        default=ARCHIVE_DIR,
        help="Path to the archive directory containing frame images.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=OUTPUT_PATH,
        help="Path where the MP4 video should be written.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    frames = collect_frames(args.archive)
    try:
        render_timelapse(frames, args.output, args.fps)
    except subprocess.CalledProcessError as exc:
        print(exc, file=sys.stderr)
        return exc.returncode or 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
