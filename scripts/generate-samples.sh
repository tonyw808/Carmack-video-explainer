#!/usr/bin/env bash
# Regenerates the committed MockProvider sample assets (small mp4 + jpg thumbnail per
# aspect ratio) plus a manifest of their real metadata. Requires ffmpeg/ffprobe. This is
# a BUILD-TIME tool only; the app has no runtime ffmpeg dependency (D8).
set -euo pipefail

OUT="$(cd "$(dirname "$0")/.." && pwd)/packages/video-provider/assets"
mkdir -p "$OUT"

# aspect|width|height|seconds|hue
specs=(
  "16x9|640|360|4|0.6"
  "9x16|360|640|4|0.8"
  "1x1|480|480|4|0.35"
)

manifest="{"
first=1
for spec in "${specs[@]}"; do
  IFS='|' read -r aspect w h secs hue <<<"$spec"
  mp4="$OUT/sample-$aspect.mp4"
  thumb="$OUT/sample-$aspect.jpg"

  # A gentle animated gradient with a label — deterministic, tiny, and clearly a sample.
  ffmpeg -y -loglevel error \
    -f lavfi -i "gradients=s=${w}x${h}:duration=${secs}:speed=0.02:c0=0x1b1035:c1=0x7a1f6b" \
    -vf "drawtext=text='REELFORGE SAMPLE':fontcolor=white:fontsize=$((w/16)):x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.35:boxborderw=12,format=yuv420p" \
    -r 24 -c:v libx264 -pix_fmt yuv420p -movflags +faststart "$mp4"

  ffmpeg -y -loglevel error -i "$mp4" -frames:v 1 -q:v 4 "$thumb"

  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$mp4" | cut -d. -f1)
  size=$(stat -c%s "$mp4")
  tsize=$(stat -c%s "$thumb")
  [ $first -eq 0 ] && manifest+=","
  first=0
  manifest+="\"$aspect\":{\"mp4\":\"sample-$aspect.mp4\",\"thumb\":\"sample-$aspect.jpg\",\"width\":$w,\"height\":$h,\"durationSec\":$dur,\"mp4Bytes\":$size,\"thumbBytes\":$tsize}"
  echo "generated $aspect: ${w}x${h} ${dur}s  mp4=${size}B thumb=${tsize}B"
done
manifest+="}"

echo "$manifest" | python3 -m json.tool > "$OUT/manifest.json"
echo "wrote $OUT/manifest.json"
