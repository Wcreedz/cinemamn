#!/usr/bin/env bash
# Сервер дээр FFmpeg бэлэн эсэхийг шалгана.
set -euo pipefail
ffmpeg -hide_banner -version | head -1
ffprobe -hide_banner -version | head -1
ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libx264 || { echo "libx264 алга байна" >&2; exit 1; }
echo "FFmpeg бэлэн."
